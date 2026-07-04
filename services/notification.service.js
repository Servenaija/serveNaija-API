/**
 * Notification Service
 * Handles both in-app notification records and Expo push notifications.
 */

const { Expo } = require('expo-server-sdk');
const { dB } = require('../models');
const logger = require('../config/logger');

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

/**
 * Get the stored Expo push token for a user.
 */
async function getExpoPushToken(userId, actorType) {
  const Model = actorType === 'provider' ? dB.providers : dB.customers;
  const user = await Model.findById(userId).select('expoPushToken').lean();
  return user?.expoPushToken || null;
}

/**
 * Create an in-app notification record.
 */
async function createNotification({ recipient, recipientType, title, body, type = 'system', data = {} }) {
  return dB.notifications.create({ recipient, recipientType, title, body, type, data });
}

/**
 * Send a push notification (and save the record).
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.actorType  'customer' | 'provider'
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.type]
 * @param {object} [opts.data]     extra deep-link payload
 */
async function sendPushNotification({ userId, actorType, title, body, type = 'system', data = {} }) {
  // 1. Persist the notification record
  const record = await createNotification({ recipient: userId, recipientType: actorType, title, body, type, data });

  // 2. Get the user's Expo push token
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

  // 3. Send via Expo
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
