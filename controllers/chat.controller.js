const httpStatus = require('http-status');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');
const { uploadObject } = require('../utils/aws.s3.bucket');

// Helper to get sender info from req.user
function getSenderInfo(user) {
  const modelName = user.constructor.modelName;
  const actorType = modelName === 'Provider' ? 'provider' : modelName === 'Admin' ? 'admin' : 'customer';
  return {
    userId: user._id.toString(),
    actorType,
    name: user.fullName || user.firstName || 'Admin',
    avatar: user.profilePhoto || user.profile?.photo || null,
  };
}

/**
 * Fire webhook for a new message if the conversation has a webhookUrl set.
 */
async function fireWebhook(conversation, message) {
  if (!conversation.webhookUrl) return;
  try {
    await axios.post(conversation.webhookUrl, {
      event: 'message.new',
      conversationId: conversation._id.toString(),
      message: {
        id: message._id.toString(),
        senderId: message.senderId,
        senderType: message.senderType,
        text: message.text,
        imageUrl: message.imageUrl,
        type: message.type,
        createdAt: message.createdAt,
      },
    }, { timeout: 5000 });
  } catch {
    // webhook failures are non-fatal
  }
}

// GET /conversations
const listConversations = catchAsync(async (req, res) => {
  const sender = getSenderInfo(req.user);

  const conversations = await dB.conversations
    .find({ 'participants.userId': sender.userId, isActive: true })
    .sort({ updatedAt: -1 })
    .limit(50);

  res.json({ conversations });
});

// POST /conversations — start or get existing DM
const createOrGetConversation = catchAsync(async (req, res) => {
  const { targetUserId, targetActorType, bookingId } = req.body;
  if (!targetUserId || !targetActorType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'targetUserId and targetActorType are required.');
  }

  const sender = getSenderInfo(req.user);

  // Find existing conversation between these two
  let conversation = await dB.conversations.findOne({
    'participants.userId': { $all: [sender.userId, targetUserId] },
    isActive: true,
  });

  if (!conversation) {
    // Resolve target user info
    const TargetModel = targetActorType === 'provider' ? dB.providers : dB.customers;
    const targetUser = await TargetModel.findById(targetUserId).select('fullName firstName profilePhoto profile').lean();
    if (!targetUser) throw new ApiError(httpStatus.NOT_FOUND, 'Target user not found.');

    conversation = await dB.conversations.create({
      participants: [
        { userId: sender.userId, actorType: sender.actorType, name: sender.name, avatar: sender.avatar },
        {
          userId: targetUserId,
          actorType: targetActorType,
          name: targetUser.fullName || targetUser.firstName,
          avatar: targetUser.profilePhoto || targetUser.profile?.photo || null,
        },
      ],
      unreadCounts: { [sender.userId]: 0, [targetUserId]: 0 },
      booking: bookingId || null,
    });
  }

  res.status(httpStatus.CREATED).json({ conversation });
});

// GET /conversations/:id
const getConversation = catchAsync(async (req, res) => {
  const sender = getSenderInfo(req.user);
  const conversation = await dB.conversations.findOne({
    _id: req.params.id,
    'participants.userId': sender.userId,
  });
  if (!conversation) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found.');
  res.json({ conversation });
});

// GET /conversations/:id/messages
const listMessages = catchAsync(async (req, res) => {
  const sender = getSenderInfo(req.user);
  const conversation = await dB.conversations.findOne({
    _id: req.params.id,
    'participants.userId': sender.userId,
  });
  if (!conversation) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found.');

  const { page = 0, limit = 50 } = req.query;
  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(100, Math.max(1, Number(limit)));

  const messages = await dB.messages
    .find({ conversation: conversation._id, deletedAt: null })
    .sort({ createdAt: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit);

  // Mark unread messages as read
  await dB.messages.updateMany(
    { conversation: conversation._id, readBy: { $ne: sender.userId }, deletedAt: null },
    { $addToSet: { readBy: sender.userId } }
  );

  // Reset unread count for this user
  await dB.conversations.findByIdAndUpdate(conversation._id, {
    $set: { [`unreadCounts.${sender.userId}`]: 0 },
  });

  res.json({ messages: messages.reverse(), page: safePage, limit: safeLimit });
});

// POST /conversations/:id/messages  — send text or pre-uploaded image URL
const sendMessage = catchAsync(async (req, res) => {
  const sender = getSenderInfo(req.user);
  const { text, imageUrl, type } = req.body;

  if (!text && !imageUrl) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Message must have text or an image.');
  }

  // Auto-detect type if not provided
  const msgType = type || (imageUrl && !text ? 'image' : 'text');

  const conversation = await dB.conversations.findOne({
    _id: req.params.id,
    'participants.userId': sender.userId,
  });
  if (!conversation) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found.');

  const message = await dB.messages.create({
    conversation: conversation._id,
    senderId: sender.userId,
    senderType: sender.actorType,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    text: text || null,
    imageUrl: imageUrl || null,
    type: msgType,
    readBy: [sender.userId],
  });

  // Update conversation lastMessage + unread counts for all OTHER participants
  const otherParticipants = conversation.participants.filter((p) => p.userId !== sender.userId);
  const unreadUpdates = {};
  for (const p of otherParticipants) {
    unreadUpdates[`unreadCounts.${p.userId}`] = (conversation.unreadCounts?.get(p.userId) || 0) + 1;
  }

  await dB.conversations.findByIdAndUpdate(conversation._id, {
    lastMessage: { text, imageUrl, senderId: sender.userId, senderType: sender.actorType, timestamp: new Date() },
    $set: unreadUpdates,
  });

  // Emit via Socket.io — broadcast to the conversation room and each participant's personal room
  const io = req.app.get('io');
  if (io) {
    const convRoom = `conv_${conversation._id.toString()}`;
    io.to(convRoom).emit('new_message', message);

    // Also deliver directly to each participant's personal room so they receive
    // the message even if they haven't joined the conversation room yet
    for (const p of conversation.participants) {
      io.to(`user_${p.userId}`).emit('new_message', message);
    }
  }

  // Push notification + socket notification to all other participants (including admins)
  for (const p of otherParticipants) {
    notificationService.sendPushNotification({
      userId: p.userId,
      actorType: p.actorType,
      title: sender.name,
      body: text || '📷 Photo',
      type: 'chat',
      data: { conversationId: conversation._id.toString(), screen: 'chat' },
    }).catch(() => {});
  }

  // Fire webhook if configured
  fireWebhook(conversation, message);

  res.status(httpStatus.CREATED).json({ message });
});

// DELETE /conversations/:id (soft-delete)
const deleteConversation = catchAsync(async (req, res) => {
  const sender = getSenderInfo(req.user);
  await dB.conversations.findOneAndUpdate(
    { _id: req.params.id, 'participants.userId': sender.userId },
    { isActive: false }
  );
  res.json({ message: 'Conversation removed.' });
});

// POST /webhooks/chat — receive inbound webhook events from external systems
const chatWebhook = catchAsync(async (req, res) => {
  // Validate shared webhook secret
  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.CHAT_WEBHOOK_SECRET) {
    return res.status(httpStatus.UNAUTHORIZED).json({ message: 'Unauthorized.' });
  }

  const { conversationId, senderId, senderType, text, imageUrl } = req.body;
  const conversation = await dB.conversations.findById(conversationId);
  if (!conversation) return res.status(httpStatus.NOT_FOUND).json({ message: 'Conversation not found.' });

  const message = await dB.messages.create({
    conversation: conversationId,
    senderId,
    senderType: senderType || 'admin',
    text: text || null,
    imageUrl: imageUrl || null,
    type: text ? 'text' : 'image',
    readBy: [senderId],
  });

  const io = req.app.get('io');
  if (io) io.to(conversationId).emit('new_message', message);

  res.json({ message });
});

// POST /conversations/:id/messages/image — upload image file and create message
const sendImageMessage = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'Image file is required.');

  const sender = getSenderInfo(req.user);
  const conversation = await dB.conversations.findOne({
    _id: req.params.id,
    'participants.userId': sender.userId,
  });
  if (!conversation) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found.');

  // Upload to Cloudflare R2
  const ext = req.file.mimetype.split('/')[1] || 'jpg';
  const key = `chat/${conversation._id.toString()}/${uuidv4()}.${ext}`;
  const upload = await uploadObject({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  });

  const imageUrl = upload.Location || `${process.env.R2_PUBLIC_URL}/${key}`;

  // Reuse existing sendMessage logic by calling it internally
  req.body = { imageUrl, type: 'image' };
  // Build message directly (mirrors sendMessage logic)
  const message = await dB.messages.create({
    conversation: conversation._id,
    senderId: sender.userId,
    senderType: sender.actorType,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    text: null,
    imageUrl,
    type: 'image',
    readBy: [sender.userId],
  });

  const otherParticipants = conversation.participants.filter((p) => p.userId !== sender.userId);
  const unreadUpdates = {};
  for (const p of otherParticipants) {
    unreadUpdates[`unreadCounts.${p.userId}`] = (conversation.unreadCounts?.get(p.userId) || 0) + 1;
  }
  await dB.conversations.findByIdAndUpdate(conversation._id, {
    lastMessage: { imageUrl, senderId: sender.userId, senderType: sender.actorType, timestamp: new Date() },
    $set: unreadUpdates,
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`conv_${conversation._id.toString()}`).emit('new_message', message);
    for (const p of conversation.participants) {
      io.to(`user_${p.userId}`).emit('new_message', message);
    }
  }

  for (const p of otherParticipants) {
    notificationService.sendPushNotification({
      userId: p.userId,
      actorType: p.actorType,
      title: sender.name,
      body: '📷 Photo',
      type: 'chat',
      data: { conversationId: conversation._id.toString(), screen: 'chat' },
    }).catch(() => {});
  }

  res.status(httpStatus.CREATED).json({ message });
});

// Cleanup resolved conversations (called by cron/admin)
const cleanupResolvedConversations = catchAsync(async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await dB.conversations.updateMany(
    { updatedAt: { $lt: thirtyDaysAgo }, isActive: true },
    { isActive: false }
  );
  res.json({ archived: result.modifiedCount });
});

module.exports = {
  listConversations,
  createOrGetConversation,
  getConversation,
  listMessages,
  sendMessage,
  sendImageMessage,
  deleteConversation,
  chatWebhook,
  cleanupResolvedConversations,
};
