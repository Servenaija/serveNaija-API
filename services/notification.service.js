/**
 * Notification Service
 * Handles in-app notification records, real-time socket delivery,
 * and Expo push notifications.
 *
 * Delivery strategy:
 *   - Always persist the notification record in DB.
 *   - Always emit via socket (user may be online on any platform).
 *   - Send Expo push ONLY when the recipient is NOT connected via socket
 *     (i.e. not in the onlineUsers map), OR when the notification is
 *     "critical" (chat, booking, call, payment) — in which case push is
 *     always sent so the user is woken up even if the app is backgrounded.
 *
 * Critical types (always push if token exists): chat, booking, call, payment
 */

const { Expo } = require('expo-server-sdk');
const { dB } = require('../models');
const logger = require('../config/logger');
const { getIo } = require('../utils/io');
const { isOnline } = require('../config/socket');

const expo = new Expo();

// Notification types that always warrant a push even when the user is online
// (app may be backgrounded on the device even though the socket is connected
//  from another session, e.g. a web dashboard)
const CRITICAL_TYPES = new Set(['chat', 'booking', 'call', 'payment']);

/**
 * Get the stored Expo push token for a user.
 */
async function getExpoPushToken(userId, actorType) {
  const Model = actorType === 'provider' ? dB.providers : dB.customers;
  const user = await Model.findById(userId).select('expoPushToken').lean();
  return user?.expoPushToken || null;
}

/**
 * Create an in-app notification record and emit it via socket.
 * Always call this; it handles both persistence and real-time delivery.
 */
async function createNotification({ recipient, recipientType, title, body, type = 'system', data = {} }) {
  const record = await dB.notifications.create({ recipient, recipientType, title, body, type, data });

  // Emit real-time socket event to the recipient's personal room
  const io = getIo();
  if (io) {
    io.to(`user_${recipient}`).emit('notification', {
      _id: record._id,
      title,
      body,
      type,
      data,
      isRead: false,
      createdAt: record.createdAt,
    });
  }

  return record;
}

/**
 * Deliver a push notification when appropriate and save the record.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.actorType  'customer' | 'provider' | 'admin'
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.type]     notification category
 * @param {object} [opts.data]     extra deep-link payload
 */
async function sendPushNotification({ userId, actorType, title, body, type = 'system', data = {} }) {
  // 1. Persist + emit socket event
  const record = await createNotification({ recipient: userId, recipientType: actorType, title, body, type, data });

  // 2. Admins: socket-only (no mobile push)
  if (actorType === 'admin') {
    await dB.notifications.findByIdAndUpdate(record._id, { pushStatus: 'not_applicable' });
    return record;
  }

  // 3. Decide whether to send push:
  //    - User is offline  → always push
  //    - User is online   → push only for critical types (chat/booking/call/payment)
  //      so the device wakes up even if the app is backgrounded
  const userOnline = isOnline(userId);
  const isCritical = CRITICAL_TYPES.has(type);

  if (userOnline && !isCritical) {
    // Socket delivery is sufficient — no push needed
    await dB.notifications.findByIdAndUpdate(record._id, { pushStatus: 'not_applicable' });
    return record;
  }

  // 4. Get the user's Expo push token
  const pushToken = await getExpoPushToken(userId, actorType);

  if (!pushToken) {
    await dB.notifications.findByIdAndUpdate(record._id, { pushStatus: 'not_applicable' });
    return record;
  }

  if (!Expo.isExpoPushToken(pushToken)) {
    logger.warn(`[notifications] Invalid Expo push token for user ${userId}: ${pushToken}`);
    await dB.notifications.findByIdAndUpdate(record._id, { pushStatus: 'failed', pushError: 'invalid_token' });
    return record;
  }

  // 5. Send via Expo
  const message = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data: { ...data, notificationId: record._id.toString(), type },
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      const receipt = receipts[0];

      if (receipt.status === 'error') {
        logger.error(`[notifications] Push delivery error for user ${userId}:`, receipt.message);
        await dB.notifications.findByIdAndUpdate(record._id, {
          pushStatus: 'failed',
          pushError: receipt.message,
        });
      } else {
        await dB.notifications.findByIdAndUpdate(record._id, { pushStatus: 'sent' });
      }
    }
  } catch (err) {
    logger.error('[notifications] Expo SDK error:', err.message);
    await dB.notifications.findByIdAndUpdate(record._id, { pushStatus: 'failed', pushError: err.message });
  }

  return record;
}

/**
 * Send the same push to multiple users at once.
 */
async function sendBulkPushNotifications(targets) {
  return Promise.allSettled(targets.map((t) => sendPushNotification(t)));
}

module.exports = {
  createNotification,
  sendPushNotification,
  sendBulkPushNotifications,
};
