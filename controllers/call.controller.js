const httpStatus = require('http-status');
const crypto = require('crypto');

const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

const { dB } = require('../models');

const notificationService =
  require('../services/notification.service');

const streamService =
  require('../services/stream.service');

/**
 * =========================================================
 * NORMALIZE USER
 * =========================================================
 */

function getSenderInfo(user) {
  if (!user || !user._id) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Authenticated user not found.'
    );
  }

  const modelName =
    user.constructor?.modelName;

  const actorType =
    modelName === 'Provider'
      ? 'provider'
      : 'customer';

  return {
    userId:
      user._id.toString(),

    actorType,

    name:
      user.fullName ||
      user.firstName ||
      user.name ||
      'User',

    image:
      user.profileImage ||
      user.avatar ||
      user.image ||
      null,
  };
}

/**
 * =========================================================
 * PARTICIPANT CHECK
 * =========================================================
 */

function isCallParticipant(
  call,
  userId
) {
  const initiatorId =
    call.initiator?.toString();

  const recipientId =
    call.recipient?.toString();

  return (
    initiatorId === String(userId) ||
    recipientId === String(userId)
  );
}

/**
 * =========================================================
 * TERMINATION STATUS
 * =========================================================
 */

function getTerminationStatus(
  reason
) {
  switch (reason) {
    case 'rejected':
    case 'decline':
      return 'rejected';

    case 'busy':
      return 'busy';

    case 'timeout':
      return 'missed';

    case 'cancel':
      return 'cancelled';

    case 'ended':
    default:
      return 'ended';
  }
}

/**
 * =========================================================
 * CALL CHAT TEXT
 * =========================================================
 */

function getCallChatText(call) {
  const status =
    String(
      call?.status || ''
    ).toLowerCase();

  const type =
    String(
      call?.type || 'voice'
    ).toLowerCase();

  const isVideo =
    type === 'video';

  if (status === 'ringing') {
    return isVideo
      ? '📹 Video calling...'
      : '📞 Calling...';
  }

  if (status === 'accepted') {
    return isVideo
      ? '📹 Video call connected'
      : '📞 Call connected';
  }

  if (status === 'rejected') {
    return isVideo
      ? '📹 Video call declined'
      : '📞 Call declined';
  }

  if (status === 'busy') {
    return isVideo
      ? '📵 Missed video call'
      : '📵 Missed call';
  }

  if (status === 'missed') {
    return isVideo
      ? '📵 Missed video call'
      : '📵 Missed call';
  }

  if (status === 'cancelled') {
    return isVideo
      ? '📹 Video call cancelled'
      : '📞 Call cancelled';
  }

  if (status === 'ended') {
    return isVideo
      ? '📹 Video call ended'
      : '📞 Call ended';
  }

  return isVideo
    ? '📹 Video call'
    : '📞 Call';
}

/**
 * =========================================================
 * GET CONVERSATION
 * =========================================================
 */

async function getCallConversation(
  call
) {
  if (!call?.conversation) {
    return null;
  }

  const conversation =
    await dB.conversations.findById(
      call.conversation
    );

  return conversation || null;
}

/**
 * =========================================================
 * CREATE CALL CHAT MESSAGE
 * =========================================================
 *
 * IMPORTANT:
 *
 * We intentionally use the existing message schema:
 *
 * type: "text"
 *
 * Nothing is added to the Message schema.
 *
 * Every call event creates a real chat message.
 * =========================================================
 */

async function createCallTextMessage(
  call,
  text,
  io
) {
  if (!call?.conversation) {
    console.warn(
      'CALL CHAT: No conversation attached to call'
    );

    return null;
  }

  try {
    const conversation =
      await getCallConversation(call);

    if (!conversation) {
      console.warn(
        'CALL CHAT: Conversation not found:',
        call.conversation
      );

      return null;
    }

    const senderId =
      call.initiator.toString();

    const senderParticipant =
      conversation.participants.find(
        (participant) =>
          String(
            participant.userId
          ) ===
          String(senderId)
      );

    /**
     * IMPORTANT:
     *
     * No duplicate lookup here.
     *
     * Every lifecycle event is allowed to
     * create its own chat message.
     *
     * Example:
     *
     * Call 1:
     * Calling...
     * Missed call
     *
     * Call 2:
     * Calling...
     * Missed call
     *
     * Both calls are preserved.
     */

    const message =
      await dB.messages.create({
        conversation:
          conversation._id,

        senderId:
          senderId,

        senderType:
          call.initiatorType,

        senderName:
          senderParticipant?.name ||
          'User',

        senderAvatar:
          senderParticipant?.avatar ||
          null,

        text:
          text,

        imageUrl:
          null,

        type:
          'text',

        readBy: [
          senderId,
        ],
      });

    console.log(
      'CALL CHAT MESSAGE CREATED:',
      {
        callId:
          call._id.toString(),

        text:
          text,
      }
    );

    /**
     * =====================================================
     * UPDATE CONVERSATION PREVIEW
     * =====================================================
     */

    const otherParticipants =
      conversation.participants.filter(
        (participant) =>
          String(
            participant.userId
          ) !==
          String(senderId)
      );

    const unreadUpdates = {};

    for (
      const participant of
        otherParticipants
    ) {
      let currentUnread = 0;

      if (
        conversation.unreadCounts?.get
      ) {
        currentUnread =
          conversation.unreadCounts.get(
            participant.userId
          ) || 0;
      } else {
        currentUnread =
          conversation.unreadCounts?.[
            participant.userId
          ] || 0;
      }

      unreadUpdates[
        `unreadCounts.${participant.userId}`
      ] =
        currentUnread + 1;
    }

    await dB.conversations.findByIdAndUpdate(
      conversation._id,
      {
        $set: {
          lastMessage: {
            text:
              text,

            imageUrl:
              null,

            senderId:
              senderId,

            senderType:
              call.initiatorType,

            timestamp:
              new Date(),
          },
        },

        $inc: {},
      }
    );

    /**
     * Update unread counts separately.
     */
    if (
      Object.keys(unreadUpdates).length >
      0
    ) {
      await dB.conversations.findByIdAndUpdate(
        conversation._id,
        {
          $set:
            unreadUpdates,
        }
      );
    }

    /**
     * =====================================================
     * REAL-TIME MESSAGE
     * =====================================================
     */

    if (io) {
      const conversationRoom =
        `conv_${conversation._id.toString()}`;

      /**
       * Conversation room.
       */
      io
        .to(
          conversationRoom
        )
        .emit(
          'new_message',
          message
        );

      /**
       * Personal rooms.
       */
      for (
        const participant of
          conversation.participants
      ) {
        io
          .to(
            `user_${participant.userId}`
          )
          .emit(
            'new_message',
            message
          );
      }
    }

    return message;
  } catch (error) {
    console.error(
      'CALL CHAT MESSAGE ERROR:',
      error
    );

    /**
     * IMPORTANT:
     *
     * Do not kill the call because chat
     * history failed.
     */
    return null;
  }
}

/**
 * =========================================================
 * CREATE CALL STATUS MESSAGE
 * =========================================================
 */

async function createCallStatusMessage(
  call,
  io
) {
  const text =
    getCallChatText(
      call
    );

  return createCallTextMessage(
    call,
    text,
    io
  );
}

/**
 * =========================================================
 * EMIT CALL EVENT
 * =========================================================
 */

function emitToCallParticipants(
  io,
  call,
  event,
  payload = {}
) {
  if (!io || !call) {
    return;
  }

  const initiatorId =
    call.initiator?.toString();

  const recipientId =
    call.recipient?.toString();

  const data = {
    callId:
      call._id.toString(),

    streamCallId:
      call.streamCallId,

    conversationId:
      call.conversation?.toString() ||
      null,

    ...payload,
  };

  if (initiatorId) {
    io
      .to(
        `user_${initiatorId}`
      )
      .emit(
        event,
        data
      );
  }

  if (
    recipientId &&
    recipientId !== initiatorId
  ) {
    io
      .to(
        `user_${recipientId}`
      )
      .emit(
        event,
        data
      );
  }
}

/**
 * =========================================================
 * INITIATE CALL
 * =========================================================
 */

const initiateCall =
  catchAsync(
    async (
      req,
      res
    ) => {
      console.log(
        '=============================='
      );

      console.log(
        'INITIATE CALL STARTED'
      );

      console.log(
        '=============================='
      );

      const {
        recipientId,
        recipientType,
        type,
        conversationId,
      } =
        req.body;

      /**
       * -----------------------------------------------------
       * VALIDATE
       * -----------------------------------------------------
       */

      if (!recipientId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'recipientId is required.'
        );
      }

      if (!recipientType) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'recipientType is required.'
        );
      }

      if (
        ![
          'provider',
          'customer',
        ].includes(
          recipientType
        )
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'recipientType must be "provider" or "customer".'
        );
      }

      /**
       * -----------------------------------------------------
       * CALLER
       * -----------------------------------------------------
       */

      const caller =
        getSenderInfo(
          req.user
        );

      /**
       * -----------------------------------------------------
       * CALL TYPE
       * -----------------------------------------------------
       */

      let callType =
        type;

      if (
        type === 'audio'
      ) {
        callType =
          'voice';
      }

      if (
        ![
          'voice',
          'video',
        ].includes(
          callType
        )
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Call type must be "voice", "video", or "audio".'
        );
      }

      /**
       * -----------------------------------------------------
       * RECIPIENT
       * -----------------------------------------------------
       */

      const RecipientModel =
        recipientType ===
        'provider'
          ? dB.providers
          : dB.customers;

      const recipient =
        await RecipientModel
          .findById(
            recipientId
          )
          .select(
            [
              'fullName',
              'firstName',
              'name',
              'profileImage',
              'avatar',
              'image',
            ].join(' ')
          );

      if (!recipient) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          'Recipient not found.'
        );
      }

      const recipientName =
        recipient.fullName ||
        recipient.firstName ||
        recipient.name ||
        'User';

      const recipientImage =
        recipient.profileImage ||
        recipient.avatar ||
        recipient.image ||
        null;

      /**
       * -----------------------------------------------------
       * ACTIVE CALL CHECK
       * -----------------------------------------------------
       */

      const activeStatuses = [
        'ringing',
        'accepted',
      ];

      const existingCall =
        await dB.calls.findOne({
          $or: [
            {
              initiator:
                caller.userId,

              status: {
                $in:
                  activeStatuses,
              },
            },

            {
              recipient:
                caller.userId,

              status: {
                $in:
                  activeStatuses,
              },
            },

            {
              initiator:
                recipientId,

              status: {
                $in:
                  activeStatuses,
              },
            },

            {
              recipient:
                recipientId,

              status: {
                $in:
                  activeStatuses,
              },
            },
          ],
        });

      if (existingCall) {
        throw new ApiError(
          httpStatus.CONFLICT,
          'User is already in an active call.'
        );
      }

      /**
       * -----------------------------------------------------
       * GENERATE STREAM CALL ID
       * -----------------------------------------------------
       */

      const streamCallId =
        `call-${crypto.randomUUID()}`;

      const isVideo =
        callType === 'video';

      /**
       * -----------------------------------------------------
       * TOKENS
       * -----------------------------------------------------
       */

      const callerToken =
        streamService.generateToken(
          caller.userId
        );

      const recipientToken =
        streamService.generateToken(
          recipientId
        );

      /**
       * -----------------------------------------------------
       * CREATE MONGODB CALL FIRST
       * -----------------------------------------------------
       *
       * IMPORTANT:
       *
       * We create the MongoDB call before
       * contacting Stream.
       *
       * This means even if Stream is unavailable,
       * the call history still exists.
       */

      const call =
        await dB.calls.create({
          initiator:
            caller.userId,

          initiatorType:
            caller.actorType,

          recipient:
            recipientId,

          recipientType,

          type:
            callType,

          status:
            'ringing',

          conversation:
            conversationId ||
            null,

          streamCallId:
            streamCallId,

          startedAt:
            null,

          endedAt:
            null,

          duration:
            0,

          rejectReason:
            null,
        });

      console.log(
        'CALL CREATED:',
        call._id.toString()
      );

      const io =
        req.app.get(
          'io'
        );

      /**
       * -----------------------------------------------------
       * CREATE INITIAL CHAT MESSAGE
       * -----------------------------------------------------
       *
       * This ALWAYS happens after the call record
       * is created.
       */

      await createCallTextMessage(
        call,
        '📞 Calling...',
        io
      );

      /**
       * -----------------------------------------------------
       * TRY STREAM CREATION
       * -----------------------------------------------------
       */

      let streamCreated =
        false;

      try {
        await streamService.createCall({
          callId:
            streamCallId,

          createdByUserId:
            caller.userId,

          recipientUserId:
            recipientId,

          createdByName:
            caller.name,

          recipientName,

          createdByImage:
            caller.image,

          recipientImage,

          isVideo,
        });

        streamCreated =
          true;

        console.log(
          'STREAM CALL CREATED:',
          streamCallId
        );
      } catch (
        streamError
      ) {
        console.error(
          'STREAM CALL CREATION FAILED:',
          streamError?.message ||
            streamError
        );

        /**
         * ---------------------------------------------------
         * Stream failed.
         * Mark our Mongo call cancelled.
         * ---------------------------------------------------
         */

        call.status =
          'cancelled';

        call.rejectReason =
          'stream_error';

        call.endedAt =
          new Date();

        call.duration =
          0;

        await call.save();

        /**
         * Create terminal chat message.
         */
        await createCallStatusMessage(
          call,
          io
        );

        /**
         * Tell frontend the call failed.
         */
        emitToCallParticipants(
          io,
          call,
          'call_ended',
          {
            reason:
              'stream_error',

            status:
              'cancelled',

            duration:
              0,
          }
        );

        throw new ApiError(
          httpStatus.SERVICE_UNAVAILABLE,
          'Call service is temporarily unavailable. Please try again.'
        );
      }

      /**
       * -----------------------------------------------------
       * INCOMING CALL
       * -----------------------------------------------------
       */

      if (
        io &&
        streamCreated
      ) {
        io
          .to(
            `user_${recipientId}`
          )
          .emit(
            'incoming_call',
            {
              callId:
                call._id.toString(),

              streamCallId:
                streamCallId,

              callerId:
                caller.userId,

              callerType:
                caller.actorType,

              callerName:
                caller.name,

              callerPhoto:
                caller.image,

              type:
                callType,

              conversationId:
                conversationId ||
                null,

              streamApiKey:
                process.env
                  .STREAM_API_KEY,

              token:
                recipientToken,
            }
          );
      }

      /**
       * -----------------------------------------------------
       * PUSH NOTIFICATION
       * -----------------------------------------------------
       */

      notificationService
        .sendPushNotification({
          userId:
            recipientId,

          actorType:
            recipientType,

          title:
            `Incoming ${
              callType ===
              'video'
                ? 'video'
                : 'voice'
            } call`,

          body:
            `${caller.name} is calling you.`,

          type:
            'call',

          data: {
            callId:
              call._id.toString(),

            streamCallId:
              streamCallId,

            type:
              callType,

            callerId:
              caller.userId,

            callerName:
              caller.name,

            callerPhoto:
              caller.image,

            streamApiKey:
              process.env
                .STREAM_API_KEY,

            token:
              recipientToken,
          },
        })
        .catch(
          (
            notificationError
          ) => {
            console.error(
              'CALL PUSH ERROR:',
              notificationError?.message ||
                notificationError
            );
          }
        );

      /**
       * -----------------------------------------------------
       * RESPONSE
       * -----------------------------------------------------
       */

      return res
        .status(
          httpStatus.CREATED
        )
        .json({
          callId:
            call._id.toString(),

          streamCallId:
            streamCallId,

          streamApiKey:
            process.env
              .STREAM_API_KEY,

          token:
            callerToken,

          type:
            callType,

          status:
            'ringing',
        });
    }
  );

/**
 * =========================================================
 * ACCEPT CALL
 * =========================================================
 */

const acceptCall =
  catchAsync(
    async (
      req,
      res
    ) => {
      console.log(
        'ACCEPT CALL:',
        req.params.id
      );

      const call =
        await dB.calls.findById(
          req.params.id
        );

      if (!call) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          'Call not found.'
        );
      }

      const user =
        getSenderInfo(
          req.user
        );

      if (
        call.recipient?.toString() !==
        user.userId
      ) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Only the recipient can accept this call.'
        );
      }

      /**
       * Already handled.
       */
      if (
        call.status !==
        'ringing'
      ) {
        return res.json({
          success:
            true,

          callId:
            call._id.toString(),

          status:
            call.status,
        });
      }

      /**
       * Mark accepted.
       */
      call.status =
        'accepted';

      call.startedAt =
        new Date();

      call.rejectReason =
        null;

      await call.save();

      const io =
        req.app.get(
          'io'
        );

      /**
       * Create connected chat message.
       */
      await createCallStatusMessage(
        call,
        io
      );

      /**
       * Notify initiator.
       */
      emitToCallParticipants(
        io,
        call,
        'call_accepted',
        {
          status:
            'accepted',
        }
      );

      return res.json({
        success:
          true,

        callId:
          call._id.toString(),

        status:
          'accepted',
      });
    }
  );

/**
 * =========================================================
 * REJECT CALL
 * =========================================================
 */

const rejectCall =
  catchAsync(
    async (
      req,
      res
    ) => {
      console.log(
        'REJECT CALL:',
        req.params.id
      );

      const call =
        await dB.calls.findById(
          req.params.id
        );

      if (!call) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          'Call not found.'
        );
      }

      const user =
        getSenderInfo(
          req.user
        );

      if (
        call.recipient?.toString() !==
        user.userId
      ) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Only the recipient can reject this call.'
        );
      }

      /**
       * Only ringing calls may be rejected.
       */
      if (
        call.status !==
        'ringing'
      ) {
        return res.json({
          success:
            true,

          callId:
            call._id.toString(),

          status:
            call.status,
        });
      }

      let reason =
        String(
          req.body?.reason ||
          'rejected'
        ).toLowerCase();

      if (
        reason ===
        'decline'
      ) {
        reason =
          'rejected';
      }

      const validReasons = [
        'rejected',
        'busy',
        'timeout',
        'cancel',
      ];

      if (
        !validReasons.includes(
          reason
        )
      ) {
        reason =
          'rejected';
      }

      const status =
        getTerminationStatus(
          reason
        );

      call.status =
        status;

      call.rejectReason =
        reason;

      call.endedAt =
        new Date();

      call.duration =
        0;

      await call.save();

      const io =
        req.app.get(
          'io'
        );

      /**
       * ALWAYS create terminal chat message.
       */
      await createCallStatusMessage(
        call,
        io
      );

      /**
       * End Stream call.
       */
      if (
        call.streamCallId
      ) {
        try {
          await streamService.endCall(
            call.streamCallId
          );
        } catch (
          streamError
        ) {
          console.error(
            'REJECT STREAM CLEANUP ERROR:',
            streamError?.message ||
              streamError
          );
        }
      }

      /**
       * Notify both participants.
       */
      emitToCallParticipants(
        io,
        call,
        'call_ended',
        {
          reason,
          status,
          duration:
            0,
        }
      );

      return res.json({
        success:
          true,

        callId:
          call._id.toString(),

        reason,

        status,
      });
    }
  );

/**
 * =========================================================
 * END CALL
 * =========================================================
 *
 * PUT /calls/:id/end
 *
 * reason:
 *
 * ended
 * cancel
 * timeout
 * =========================================================
 */

const endCall =
  catchAsync(
    async (
      req,
      res
    ) => {
      console.log(
        'END CALL:',
        req.params.id
      );

      const call =
        await dB.calls.findById(
          req.params.id
        );

      if (!call) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          'Call not found.'
        );
      }

      const user =
        getSenderInfo(
          req.user
        );

      if (
        !isCallParticipant(
          call,
          user.userId
        )
      ) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'You are not part of this call.'
        );
      }

      /**
       * -----------------------------------------------------
       * Already finished
       * -----------------------------------------------------
       *
       * Do NOT create another message.
       *
       * The first request that transitioned the
       * call created the terminal message already.
       */

      const alreadyFinishedStatuses = [
        'ended',
        'rejected',
        'busy',
        'missed',
        'cancelled',
      ];

      if (
        alreadyFinishedStatuses.includes(
          call.status
        )
      ) {
        return res.json({
          success:
            true,

          callId:
            call._id.toString(),

          status:
            call.status,

          duration:
            call.duration ||
            0,
        });
      }

      /**
       * -----------------------------------------------------
       * REASON
       * -----------------------------------------------------
       */

      let reason =
        String(
          req.body?.reason ||
          'ended'
        ).toLowerCase();

      const validReasons = [
        'ended',
        'cancel',
        'timeout',
      ];

      if (
        !validReasons.includes(
          reason
        )
      ) {
        reason =
          'ended';
      }

      const status =
        getTerminationStatus(
          reason
        );

      /**
       * -----------------------------------------------------
       * SAVE TERMINATION
       * -----------------------------------------------------
       */

      const endedAt =
        new Date();

      call.status =
        status;

      call.endedAt =
        endedAt;

      call.rejectReason =
        reason;

      /**
       * A call only gets duration when
       * it was accepted.
       */
      if (
        call.startedAt &&
        status ===
          'ended'
      ) {
        call.duration =
          Math.max(
            0,
            Math.round(
              (
                endedAt.getTime() -
                new Date(
                  call.startedAt
                ).getTime()
              ) /
                1000
            )
          );
      } else {
        call.duration =
          0;
      }

      await call.save();

      console.log(
        'CALL TERMINATED:',
        {
          callId:
            call._id.toString(),

          status,

          reason,

          duration:
            call.duration,
        }
      );

      const io =
        req.app.get(
          'io'
        );

      /**
       * -----------------------------------------------------
       * ALWAYS CREATE TERMINAL CHAT MESSAGE
       * -----------------------------------------------------
       *
       * Examples:
       *
       * timeout -> 📵 Missed call
       * cancel  -> 📞 Call cancelled
       * ended   -> 📞 Call ended
       */

      await createCallStatusMessage(
        call,
        io
      );

      /**
       * -----------------------------------------------------
       * END STREAM
       * -----------------------------------------------------
       */

      if (
        call.streamCallId
      ) {
        try {
          await streamService.endCall(
            call.streamCallId
          );

          console.log(
            'STREAM CALL ENDED:',
            call.streamCallId
          );
        } catch (
          streamError
        ) {
          console.error(
            'STREAM END ERROR:',
            streamError?.message ||
              streamError
          );
        }
      }

      /**
       * -----------------------------------------------------
       * NOTIFY BOTH USERS
       * -----------------------------------------------------
       */

      emitToCallParticipants(
        io,
        call,
        'call_ended',
        {
          reason,

          status,

          duration:
            call.duration ||
            0,
        }
      );

      /**
       * Also emit specific event for timeout.
       */
      if (
        io &&
        status ===
          'missed'
      ) {
        emitToCallParticipants(
          io,
          call,
          'call_missed',
          {
            reason:
              'timeout',

            status:
              'missed',

            duration:
              0,
          }
        );
      }

      /**
       * Specific rejection event.
       */
      if (
        io &&
        (
          status ===
            'rejected' ||
          status ===
            'busy'
        )
      ) {
        emitToCallParticipants(
          io,
          call,
          'call_rejected',
          {
            reason,

            status,

            duration:
              0,
          }
        );
      }

      return res.json({
        success:
          true,

        callId:
          call._id.toString(),

        status,

        reason,

        duration:
          call.duration ||
          0,
      });
    }
  );

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = {
  initiateCall,
  acceptCall,
  rejectCall,
  endCall,
};