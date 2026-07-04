const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

// GET /notifications
const listNotifications = catchAsync(async (req, res) => {
  const { page = 0, limit = 30, unreadOnly } = req.query;
  const query = { recipient: req.user._id.toString() };
  if (unreadOnly === 'true') query.isRead = false;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(100, Math.max(1, Number(limit)));

  const [notifications, total, unreadCount] = await Promise.all([
    dB.notifications
      .find(query)
      .sort({ createdAt: -1 })
      .skip(safePage * safeLimit)
      .limit(safeLimit),
    dB.notifications.countDocuments(query),
    dB.notifications.countDocuments({ recipient: req.user._id.toString(), isRead: false }),
  ]);

  res.json({ notifications, total, unreadCount, page: safePage, limit: safeLimit });
});

// PUT /notifications/:id/read
const markRead = catchAsync(async (req, res) => {
  const notification = await dB.notifications.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id.toString() },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found.');
  res.json({ notification });
});

// PUT /notifications/read-all
const markAllRead = catchAsync(async (req, res) => {
  await dB.notifications.updateMany(
    { recipient: req.user._id.toString(), isRead: false },
    { isRead: true, readAt: new Date() }
  );
  res.json({ message: 'All notifications marked as read.' });
});

// DELETE /notifications/:id
const deleteNotification = catchAsync(async (req, res) => {
  await dB.notifications.findOneAndDelete({ _id: req.params.id, recipient: req.user._id.toString() });
  res.json({ message: 'Notification deleted.' });
});

// DELETE /notifications/clear-read
const clearRead = catchAsync(async (req, res) => {
  await dB.notifications.deleteMany({ recipient: req.user._id.toString(), isRead: true });
  res.json({ message: 'Read notifications cleared.' });
});

// POST /notifications/token  — register or update Expo push token
const registerToken = catchAsync(async (req, res) => {
  const { expoPushToken } = req.body;
  if (!expoPushToken) throw new ApiError(httpStatus.BAD_REQUEST, 'Expo push token is required.');

  // Update on both models since we don't know which actor is calling
  const actorType = req.user.constructor.modelName === 'Provider' ? 'provider' : 'customer';
  const Model = actorType === 'provider' ? dB.providers : dB.customers;
  await Model.findByIdAndUpdate(req.user._id, { expoPushToken: String(expoPushToken).trim() });

  res.json({ message: 'Push token registered.' });
});

module.exports = {
  listNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  clearRead,
  registerToken,
};
