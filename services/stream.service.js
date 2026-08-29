// services/stream.service.js

const { StreamClient } = require('@stream-io/node-sdk');

const STREAM_API_KEY =
  process.env.STREAM_API_KEY;

const STREAM_API_SECRET =
  process.env.STREAM_API_SECRET;

const RING_TIMEOUT_MS = 30_000;

let client = null;

function getStreamClient() {
  if (!client) {
    if (
      !STREAM_API_KEY ||
      !STREAM_API_SECRET
    ) {
      throw new Error(
        'Stream API credentials missing. Check STREAM_API_KEY and STREAM_API_SECRET.'
      );
    }

    client =
      new StreamClient(
        STREAM_API_KEY,
        STREAM_API_SECRET
      );
  }

  return client;
}

/**
 * Generate Stream token.
 */
function generateToken(userId) {
  if (!userId) {
    throw new Error(
      'Cannot generate Stream token without userId'
    );
  }

  const streamClient =
    getStreamClient();

  return streamClient.generateUserToken({
    user_id:
      String(userId),

    validity_in_seconds:
      60 * 60,
  });
}

/**
 * Upsert Stream users.
 */
async function upsertUsers(
  users = []
) {
  const streamClient =
    getStreamClient();

  const normalizedUsers =
    users
      .filter(
        (user) =>
          user &&
          user.id
      )
      .map((user) => ({
        id:
          String(user.id),

        role: 'user',

        name:
          user.name ||
          'User',

        ...(user.image
          ? {
              image:
                user.image,
            }
          : {}),
      }));

  console.log(
    'STREAM STEP 1: Upserting users'
  );

  console.log(
    'Users:',
    JSON.stringify(
      normalizedUsers,
      null,
      2
    )
  );

  if (
    !normalizedUsers.length
  ) {
    throw new Error(
      'No valid Stream users provided'
    );
  }

  try {
    const result =
      await streamClient.upsertUsers(
        normalizedUsers
      );

    console.log(
      'STREAM STEP 1 SUCCESS: Users upserted'
    );

    return result;
  } catch (error) {
    console.error(
      'STREAM STEP 1 FAILED: upsertUsers'
    );

    logStreamError(error);

    throw error;
  }
}

/**
 * Create Stream ringing call.
 *
 * Stream owns the 30-second ringing timeout.
 */
async function createCall({
  callId,
  mongoCallId,
  createdByUserId,
  recipientUserId,
  createdByName,
  recipientName,
  createdByImage,
  recipientImage,
  isVideo = false,
}) {
  if (!callId) {
    throw new Error(
      'callId is required'
    );
  }

  if (!createdByUserId) {
    throw new Error(
      'createdByUserId is required'
    );
  }

  if (!recipientUserId) {
    throw new Error(
      'recipientUserId is required'
    );
  }

  const streamClient =
    getStreamClient();

  console.log(
    'Creating Stream call:',
    {
      callId,
      mongoCallId,
      createdByUserId,
      recipientUserId,
      isVideo,
    }
  );

  await upsertUsers([
    {
      id:
        createdByUserId,

      name:
        createdByName ||
        'Caller',

      image:
        createdByImage,
    },

    {
      id:
        recipientUserId,

      name:
        recipientName ||
        'Recipient',

      image:
        recipientImage,
    },
  ]);

  const call =
    streamClient.video.call(
      'default',
      String(callId)
    );

  const response =
    await call.getOrCreate({
      ring: true,

      video:
        Boolean(isVideo),

      data: {
        created_by_id:
          String(
            createdByUserId
          ),

        /**
         * Custom data carried on the Stream call itself.
         *
         * The mobile app reads these from incoming-call
         * events (call.accepted / call.ring / push) because
         * the CallResponse has no top-level `video` field:
         *
         *  - callId:   the ServeNaija (Mongo) call ID, so the
         *              app can call accept/reject/end endpoints
         *              for calls answered on the native screen.
         *
         *  - callType: 'video' | 'voice' — used to open the
         *              correct (video) call screen.
         *
         *  - video:    boolean duplicate of callType for
         *              convenience.
         */
        custom: {
          callId:
            String(mongoCallId || ''),

          callType:
            isVideo ? 'video' : 'voice',

          video:
            Boolean(isVideo),
        },

        members: [
          {
            user_id:
              String(
                createdByUserId
              ),
          },
          {
            user_id:
              String(
                recipientUserId
              ),
          },
        ],

        /**
         * Stream owns the timeout.
         *
         * Caller:
         * 30 sec unanswered -> timeout.
         *
         * Callee:
         * 30 sec unanswered -> timeout.
         */
        settings_override: {
          ring: {
            auto_cancel_timeout_ms:
              RING_TIMEOUT_MS,

            incoming_call_timeout_ms:
              RING_TIMEOUT_MS,

            missed_call_timeout_ms:
              RING_TIMEOUT_MS,
          },
        },
      },
    });

  console.log(
    'Stream call created successfully:',
    callId
  );

  return {
    call,
    response,
  };
}

function getCall(
  callId
) {
  if (!callId) {
    throw new Error(
      'callId is required'
    );
  }

  const streamClient =
    getStreamClient();

  return streamClient.video.call(
    'default',
    String(callId)
  );
}

async function endCall(
  callId
) {
  const call =
    getCall(callId);

  try {
    await call.end();

    console.log(
      'Stream call ended:',
      callId
    );
  } catch (error) {
    console.error(
      'Failed to end Stream call'
    );

    logStreamError(error);

    throw error;
  }
}

function logStreamError(
  error
) {
  console.error(
    '---------------- STREAM ERROR ----------------'
  );

  console.error(
    'message:',
    error?.message
  );

  console.error(
    'name:',
    error?.name
  );

  console.error(
    'status:',
    error?.status
  );

  console.error(
    'statusCode:',
    error?.statusCode
  );

  console.error(
    'code:',
    error?.code
  );

  console.error(
    'response:',
    error?.response
      ? JSON.stringify(
          error.response,
          null,
          2
        )
      : undefined
  );

  console.error(
    'body:',
    error?.body
      ? JSON.stringify(
          error.body,
          null,
          2
        )
      : undefined
  );

  console.error(
    'stack:',
    error?.stack
  );

  console.error(
    '------------------------------------------------'
  );
}

module.exports = {
  getStreamClient,
  generateToken,
  upsertUsers,
  createCall,
  getCall,
  endCall,
  RING_TIMEOUT_MS,
};