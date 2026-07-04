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

// GET /provider/me
const getMe = catchAsync(async (req, res) => {
  res.json({ provider: sanitize(req.user) });
});

// PUT /provider/me
const updateMe = catchAsync(async (req, res) => {
  const allowed = ['firstName', 'lastName', 'fullName', 'phoneNumber', 'profile', 'expoPushToken'];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  if (updates.firstName || updates.lastName) {
    const first = updates.firstName || req.user.firstName || '';
    const last = updates.lastName || req.user.lastName || '';
    updates.fullName = `${first} ${last}`.trim();
  }

  const updated = await dB.providers.findByIdAndUpdate(req.user._id, updates, { new: true });
  res.json({ provider: sanitize(updated) });
});

// PUT /provider/availability
const updateAvailability = catchAsync(async (req, res) => {
  const { isAvailable } = req.body;
  await dB.providers.findByIdAndUpdate(req.user._id, { isAvailable });
  res.json({ message: `Availability set to ${isAvailable ? 'available' : 'unavailable'}.`, isAvailable });
});

// PUT /provider/location
const updateLocation = catchAsync(async (req, res) => {
  const { businessName, state, city, area, address, radius, travelOutsideArea, latitude, longitude } = req.body;
  const update = {};
  if (businessName !== undefined) update['service.businessName'] = businessName;
  if (state !== undefined) update['location.state'] = state;
  if (city !== undefined) update['location.city'] = city;
  if (area !== undefined) update['location.area'] = area;
  if (address !== undefined) update['location.address'] = address;
  if (radius !== undefined) update['location.radius'] = radius;
  if (travelOutsideArea !== undefined) update['location.travelOutsideArea'] = travelOutsideArea;
  if (latitude !== undefined) update['location.coordinates.latitude'] = latitude;
  if (longitude !== undefined) update['location.coordinates.longitude'] = longitude;

  await dB.providers.findByIdAndUpdate(req.user._id, { $set: update });
  res.json({ message: 'Location updated.' });
});

// PUT /provider/change-password
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const provider = await dB.providers.findById(req.user._id).select('+password');
  const isMatch = await bcrypt.compare(currentPassword, provider.password);
  if (!isMatch) throw new ApiError(httpStatus.BAD_REQUEST, 'Current password is incorrect.');
  provider.password = bcrypt.hashSync(newPassword, 12);
  await provider.save();
  res.json({ message: 'Password updated successfully.' });
});

// PUT /provider/notification-settings
const updateNotificationSettings = catchAsync(async (req, res) => {
  const { push, email, sms } = req.body;
  const settings = {};
  if (push !== undefined) settings['notificationSettings.push'] = push;
  if (email !== undefined) settings['notificationSettings.email'] = email;
  if (sms !== undefined) settings['notificationSettings.sms'] = sms;
  await dB.providers.findByIdAndUpdate(req.user._id, { $set: settings });
  res.json({ message: 'Notification settings updated.' });
});

// PUT /provider/expo-token
const updateExpoToken = catchAsync(async (req, res) => {
  const { expoPushToken } = req.body;
  await dB.providers.findByIdAndUpdate(req.user._id, { expoPushToken: String(expoPushToken).trim() });
  res.json({ message: 'Push token registered.' });
});

// PUT /provider/bank-details
const updateBankDetails = catchAsync(async (req, res) => {
  const { bankName, accountName, accountNumber } = req.body;
  await dB.providers.findByIdAndUpdate(req.user._id, {
    $set: {
      'bankDetails.bankName': bankName,
      'bankDetails.accountName': accountName,
      'bankDetails.accountNumber': accountNumber,
      'bankDetails.isVerified': false,
    },
  });
  res.json({ message: 'Bank details saved.' });
});

// GET /provider/services
const listServices = catchAsync(async (req, res) => {
  const services = await dB.services.find({ provider: req.user._id }).sort({ createdAt: -1 });
  res.json({ services });
});

// POST /provider/services
const addService = catchAsync(async (req, res) => {
  const { name, price, description, duration } = req.body;
  const service = await dB.services.create({
    provider: req.user._id,
    name,
    price,
    description,
    duration,
  });
  res.status(httpStatus.CREATED).json({ service });
});

// PUT /provider/services/:id
const updateService = catchAsync(async (req, res) => {
  const service = await dB.services.findOne({ _id: req.params.id, provider: req.user._id });
  if (!service) throw new ApiError(httpStatus.NOT_FOUND, 'Service not found.');
  Object.assign(service, req.body);
  await service.save();
  res.json({ service });
});

// DELETE /provider/services/:id
const deleteService = catchAsync(async (req, res) => {
  const service = await dB.services.findOneAndDelete({ _id: req.params.id, provider: req.user._id });
  if (!service) throw new ApiError(httpStatus.NOT_FOUND, 'Service not found.');
  res.json({ message: 'Service deleted.' });
});

// GET /provider/stats — dashboard summary
const getStats = catchAsync(async (req, res) => {
  const providerId = req.user._id;
  const [pending, active, completed, totalEarnings] = await Promise.all([
    dB.bookings.countDocuments({ provider: providerId, status: 'pending' }),
    dB.bookings.countDocuments({ provider: providerId, status: { $in: ['accepted', 'on-the-way', 'arrived', 'in-progress'] } }),
    dB.bookings.countDocuments({ provider: providerId, status: 'completed' }),
    dB.bookings.aggregate([
      { $match: { provider: providerId, status: 'completed', paymentStatus: 'released' } },
      { $group: { _id: null, total: { $sum: '$serviceFee' } } },
    ]),
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEarningsResult = await dB.bookings.aggregate([
    {
      $match: {
        provider: providerId,
        status: 'completed',
        paymentStatus: 'released',
        completedAt: { $gte: todayStart },
      },
    },
    { $group: { _id: null, total: { $sum: '$serviceFee' } } },
  ]);

  res.json({
    stats: {
      pendingRequests: pending,
      activeJobs: active,
      completedJobs: completed,
      totalEarnings: totalEarnings[0]?.total || 0,
      todayEarnings: todayEarningsResult[0]?.total || 0,
    },
  });
});

// GET /provider/earnings
const getEarnings = catchAsync(async (req, res) => {
  const { page = 0, limit = 20 } = req.query;
  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const bookings = await dB.bookings
    .find({ provider: req.user._id, status: 'completed' })
    .select('serviceFee platformFee totalAmount paymentStatus completedAt customer service')
    .populate('customer', 'fullName profilePhoto')
    .sort({ completedAt: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit);

  res.json({ earnings: bookings });
});

module.exports = {
  getMe,
  updateMe,
  updateAvailability,
  updateLocation,
  changePassword,
  updateNotificationSettings,
  updateExpoToken,
  updateBankDetails,
  listServices,
  addService,
  updateService,
  deleteService,
  getStats,
  getEarnings,
};
