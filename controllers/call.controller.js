const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const callService = require('../services/call.service');
const notificationService = require('../services/notification.service');

function getSenderInfo(user) {
  const actorType = user.constructor.modelName === 'Provider' ? 'provider' : 'customer';
  return { userId: user._id.toString(), actorType, name: user.fullName || user.firstName || 'User' };
}

// POST /calls/initiate
const initiateCall = catchAsync(async (req, res) => {
  const { recipientId, recipientType, type, conversationId } = req.body;
  const caller = getSenderInfo(req.user);

  // Check recipient exists
  const RecipientModel = recipientType === 'provider' ? dB.providers : dB.customers;
  const recipient = await RecipientModel.findById(recipientId).select('fullName expoPushToken');
  if (!recipient) throw new ApiError(httpStatus.NOT_FOUND, 'Recipient not found.');

  // Create Cloudflare session for the caller
  const callerSession = await callService.createSession();

  // Create the call record (recipient session allocated on answer)
  const call = await dB.calls.create({
    initiator: caller.userId,
    initiatorType: caller.actorType,
    recipient: recipientId,
    recipientType,
    type,
    status: 'ringing',
    conversation: conversationId || null,
    cloudflareAppId: process.env.CLOUDFLARE_CALLS_APP_ID,
    cloudflareSessionId: callerSession.sessionId,
    initiatorSessionToken: callerSession.sessionToken,
    iceServers: callerSession.iceServers,
  });

  // Push incoming_call event via socket
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${recipientId}`).emit('incoming_call', {
      callId: call._id.toString(),
      callerId: caller.userId,
      callerType: caller.actorType,
      callerName: caller.name,
      type,
    });
  }

  // Also push notification in case app is in background
  notificationService.sendPushNotification({
    userId: recipientId,
    actorType: recipientType,
    title: `Incoming ${type} call`,
    body: `${caller.name} is calling you.`,
    type: 'call',
    data: { callId: call._id.toString(), type },
  }).catch(() => {});

  res.status(httpStatus.CREATED).json({
    callId: call._id.toString(),
    sessionId: callerSession.sessionId,
    sessionToken: callerSession.sessionToken,
    iceServers: callerSession.iceServers,
  });
});

// PUT /calls/:id/answer
const answerCall = catchAsync(async (req, res) => {
  const call = await dB.calls.findById(req.params.id);
  if (!call) throw new ApiError(httpStatus.NOT_FOUND, 'Call not found.');

  const callee = getSenderInfo(req.user);
  if (call.recipient !== callee.userId) throw new ApiError(httpStatus.FORBIDDEN, 'You are not the recipient of this call.');
  if (call.status !== 'ringing') throw new ApiError(httpStatus.BAD_REQUEST, 'Call is no longer ringing.');

  // Create Cloudflare session for the callee
  const calleeSession = await callService.createSession();

  call.status = 'accepted';
  call.startedAt = new Date();
  call.recipientSessionToken = calleeSession.sessionToken;
  await call.save();

  // Notify caller via socket
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${call.initiator}`).emit('call_accepted', {
      callId: call._id.toString(),
      recipientSessionToken: calleeSession.sessionToken,
    });
  }

  // Log a call_log message in the linked conversation
  if (call.conversation) {
    await dB.messages.create({
      conversation: call.conversation,
      senderId: callee.userId,
      senderType: callee.actorType,
      type: 'call_log',
      text: `${call.type === 'video' ? 'Video' : 'Voice'} call started`,
    });
  }

  res.json({
    sessionId: calleeSession.sessionId,
    sessionToken: calleeSession.sessionToken,
    iceServers: calleeSession.iceServers,
  });
});

// PUT /calls/:id/reject
const rejectCall = catchAsync(async (req, res) => {
  const call = await dB.calls.findById(req.params.id);
  if (!call) throw new ApiError(httpStatus.NOT_FOUND, 'Call not found.');
  if (call.status !== 'ringing') throw new ApiError(httpStatus.BAD_REQUEST, 'Call is no longer ringing.');

  call.status = 'rejected';
  call.endedAt = new Date();
  await call.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`user_${call.initiator}`).emit('call_rejected', { callId: call._id.toString() });
    // Also emit call_missed so the initiator's app shows a missed call banner
    io.to(`user_${call.initiator}`).emit('call_missed', {
      callId: call._id.toString(),
      calleeId: call.recipient,
    });
  }

  // Push notification for missed call (the initiator's device may be backgrounded)
  const rejector = getSenderInfo(req.user);
  notificationService.sendPushNotification({
    userId: call.initiator,
    actorType: call.initiatorType,
    title: 'Missed Call',
    body: `${rejector.name} declined your call.`,
    type: 'call',
    data: { callId: call._id.toString(), screen: 'calls' },
  }).catch(() => {});

  res.json({ message: 'Call rejected.' });
});

// PUT /calls/:id/end
const endCall = catchAsync(async (req, res) => {
  const call = await dB.calls.findById(req.params.id);
  if (!call) throw new ApiError(httpStatus.NOT_FOUND, 'Call not found.');

  const caller = getSenderInfo(req.user);
  if (call.initiator !== caller.userId && call.recipient !== caller.userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not part of this call.');
  }

  call.status = 'ended';
  call.endedAt = new Date();
  if (call.startedAt) {
    call.duration = Math.round((call.endedAt - call.startedAt) / 1000);
  }
  await call.save();

  // Close CF session
  callService.closeSession(call.cloudflareSessionId).catch(() => {});

  const otherId = call.initiator === caller.userId ? call.recipient : call.initiator;
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${otherId}`).emit('call_ended', { callId: call._id.toString(), duration: call.duration });
  }

  // Log in chat
  if (call.conversation && call.duration) {
    const mins = Math.floor(call.duration / 60);
    const secs = call.duration % 60;
    await dB.messages.create({
      conversation: call.conversation,
      senderId: caller.userId,
      senderType: caller.actorType,
      type: 'call_log',
      text: `${call.type === 'video' ? 'Video' : 'Voice'} call ended — ${mins}m ${secs}s`,
    });
  }

  res.json({ message: 'Call ended.', duration: call.duration });
});

// GET /calls/history
const callHistory = catchAsync(async (req, res) => {
  const caller = getSenderInfo(req.user);
  const calls = await dB.calls
    .find({ $or: [{ initiator: caller.userId }, { recipient: caller.userId }] })
    .sort({ createdAt: -1 })
    .limit(30);
  res.json({ calls });
});

module.exports = {
  initiateCall,
  answerCall,
  rejectCall,
  endCall,
  callHistory,
};
