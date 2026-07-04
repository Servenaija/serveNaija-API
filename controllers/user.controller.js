const httpStatus = require('http-status');
const bcrypt = require('bcryptjs');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

function sanitize(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.password;
  delete obj.__v;
  return obj;
}

// GET /user/me
const getMe = catchAsync(async (req, res) => {
  res.json({ user: sanitize(req.user) });
});

// PUT /user/me
const updateMe = catchAsync(async (req, res) => {
  const allowed = ['firstName', 'lastName', 'fullName', 'phoneNumber', 'profilePhoto', 'birthday', 'location', 'expoPushToken'];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  if (updates.firstName || updates.lastName) {
    const first = updates.firstName || req.user.firstName || '';
    const last = updates.lastName || req.user.lastName || '';
    updates.fullName = `${first} ${last}`.trim();
  }

  const updated = await dB.customers.findByIdAndUpdate(req.user._id, updates, { new: true });
  res.json({ user: sanitize(updated) });
});

// PUT /user/change-password
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await dB.customers.findById(req.user._id).select('+password');
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new ApiError(httpStatus.BAD_REQUEST, 'Current password is incorrect.');

  user.password = bcrypt.hashSync(newPassword, 12);
  await user.save();
  res.json({ message: 'Password updated successfully.' });
});

// PUT /user/expo-token
const updateExpoToken = catchAsync(async (req, res) => {
  const { expoPushToken } = req.body;
  await dB.customers.findByIdAndUpdate(req.user._id, { expoPushToken: String(expoPushToken).trim() });
  res.json({ message: 'Push token registered.' });
});

// PUT /user/notification-settings
const updateNotificationSettings = catchAsync(async (req, res) => {
  const { push, email, sms } = req.body;
  const settings = {};
  if (push !== undefined) settings['notificationSettings.push'] = push;
  if (email !== undefined) settings['notificationSettings.email'] = email;
  if (sms !== undefined) settings['notificationSettings.sms'] = sms;
  await dB.customers.findByIdAndUpdate(req.user._id, { $set: settings });
  res.json({ message: 'Notification settings updated.' });
});

// GET /providers — public list
const listProviders = catchAsync(async (req, res) => {
  const { category, state, city, search, page = 0, limit = 20, rating } = req.query;
  const query = { isBanned: false };

  if (category) query['service.category'] = { $regex: new RegExp(category, 'i') };
  if (state) query['location.state'] = { $regex: new RegExp(state, 'i') };
  if (city) query['location.city'] = { $regex: new RegExp(city, 'i') };

  const safePage = Math.max(0, Number(page) || 0);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

  const [providers, total] = await Promise.all([
    dB.providers
      .find(query)
      .select('-password -__v -verificationToken -verificationTokenExpiresAt -bankDetails')
      .sort({ 'subscription.isActive': -1, createdAt: -1 })
      .skip(safePage * safeLimit)
      .limit(safeLimit)
      .lean(),
    dB.providers.countDocuments(query),
  ]);

  res.json({ providers, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) });
});

// GET /providers/:id — public profile
const getProvider = catchAsync(async (req, res) => {
  const provider = await dB.providers
    .findById(req.params.id)
    .select('-password -__v -verificationToken -verificationTokenExpiresAt -bankDetails')
    .lean();

  if (!provider) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found.');
  res.json({ provider });
});

module.exports = {
  getMe,
  updateMe,
  changePassword,
  updateExpoToken,
  updateNotificationSettings,
  listProviders,
  getProvider,
};
