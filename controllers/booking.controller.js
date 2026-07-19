const httpStatus = require('http-status');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');
const { getIo } = require('../utils/io');
const { uploadObject } = require('../utils/aws.s3.bucket');
const Booking = require('../models/booking');
const mongoose = require('mongoose');

// Emit booking_updated to both customer and provider personal rooms
function emitBookingUpdate(booking) {
  const io = getIo();
  if (!io) return;
  const payload = {
    bookingId: booking._id.toString(),
    status: booking.status,
    updatedAt: new Date(),
  };
  io.to(`user_${booking.customer.toString()}`).emit('booking_updated', payload);
  io.to(`user_${booking.provider.toString()}`).emit('booking_updated', payload);
}

// ─────────────────────────────────────────
// CUSTOMER-FACING BOOKING ENDPOINTS
// ─────────────────────────────────────────

// POST /bookings
const createBooking = catchAsync(async (req, res) => {
  const { providerId, serviceId, serviceName, servicePrice, serviceCategory, description, photos, scheduledDate, timeSlot, address, additionalNotes } = req.body;

  const provider = await dB.providers.findById(providerId).select('fullName isBanned');
  if (!provider) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found.');
  if (provider.isBanned) throw new ApiError(httpStatus.BAD_REQUEST, 'This provider is unavailable.');

  const platformFee = 1500;
  const totalAmount = Number(servicePrice) + platformFee;

  const booking = await dB.bookings.create({
    customer: req.user._id,
    provider: providerId,
    service: { name: serviceName, price: servicePrice, category: serviceCategory, serviceId },
    description,
    photos: photos || [],
    scheduledDate,
    timeSlot,
    address,
    additionalNotes,
    serviceFee: servicePrice,
    platformFee,
    totalAmount,
    timeline: [{ status: 'pending', timestamp: new Date(), note: 'Booking submitted.' }],
  });

  // Notify provider of new booking
  notificationService.sendPushNotification({
    userId: providerId,
    actorType: 'provider',
    title: 'New Job Request',
    body: `${req.user.fullName || 'A customer'} has requested your ${serviceName} service.`,
    type: 'booking',
    data: { bookingId: booking._id.toString(), screen: 'jobs' },
  }).catch(() => {});

  res.status(httpStatus.CREATED).json({ booking });
});

// GET /bookings
const listBookings = catchAsync(async (req, res) => {
  const { status, page = 0, limit = 20 } = req.query;
  const query = { customer: req.user._id };
  if (status) query.status = status;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const [bookings, total] = await Promise.all([
    dB.bookings
      .find(query)
      .populate('provider', 'fullName profile.photo service.category')
      .sort({ createdAt: -1 })
      .skip(safePage * safeLimit)
      .limit(safeLimit),
    dB.bookings.countDocuments(query),
  ]);

  res.json({ bookings, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) });
});

// GET /bookings/:id
const getBooking = catchAsync(async (req, res) => {
  const booking = await dB.bookings
    .findOne({ _id: req.params.id, customer: req.user._id })
    .populate('provider', 'fullName profile.photo service phoneNumber');

  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
  res.json({ booking });
});

// PUT /bookings/:id/cancel
const cancelBooking = catchAsync(async (req, res) => {
  const booking = await dB.bookings.findOne({ _id: req.params.id, customer: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');

  const cancellableStatuses = ['pending', 'accepted'];
  if (!cancellableStatuses.includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This booking cannot be cancelled at its current stage.');
  }

  booking.status = 'cancelled';
  booking.cancelledBy = 'customer';
  booking.cancellationReason = req.body.reason || '';
  booking.timeline.push({ status: 'cancelled', timestamp: new Date(), note: 'Cancelled by customer.' });
  await booking.save();

  emitBookingUpdate(booking);
  notificationService.sendPushNotification({
    userId: booking.provider.toString(),
    actorType: 'provider',
    title: 'Booking Cancelled',
    body: 'A customer has cancelled their booking.',
    type: 'booking',
    data: { bookingId: booking._id.toString() },
  }).catch(() => {});

  res.json({ message: 'Booking cancelled.', booking });
});

// POST /bookings/:id/start-code/generate
const generateStartCode = catchAsync(async (req, res) => {
  const booking = await dB.bookings.findOne({ _id: req.params.id, customer: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
  if (!['accepted', 'on-the-way', 'arrived'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Start code cannot be generated at this stage.');
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));
  booking.startCode = code;
  booking.startCodeExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  await booking.save();

  // Return plaintext code to customer only
  res.json({ code, expiresAt: booking.startCodeExpiresAt });
});

// POST /bookings/:id/confirm-complete
const confirmComplete = catchAsync(async (req, res) => {
  const booking = await dB.bookings.findOne({ _id: req.params.id, customer: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
  if (booking.status !== 'in-progress' && booking.status !== 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Job is not ready for confirmation.');
  }

  booking.status = 'completed';
  booking.paymentStatus = 'released';
  booking.completedAt = new Date();
  booking.timeline.push({ status: 'completed', timestamp: new Date(), note: 'Customer confirmed completion.' });
  await booking.save();

  emitBookingUpdate(booking);

  // Credit provider wallet: provider receives serviceFee minus 10% platform commission
  const providerNet = Math.round(booking.serviceFee * 0.90);
  setImmediate(async () => {
    try {
      let wallet = await dB.wallets.findOne({ owner: booking.provider.toString() });
      if (!wallet) {
        wallet = await dB.wallets.create({ owner: booking.provider.toString(), ownerType: 'provider' });
      }
      const balanceBefore = wallet.balance;
      wallet.balance += providerNet;
      await wallet.save();

      await dB.transactions.create({
        wallet: wallet._id,
        owner: booking.provider.toString(),
        type: 'credit',
        amount: providerNet,
        balanceBefore,
        balanceAfter: wallet.balance,
        description: `Payment for booking #${booking._id.toString().slice(-6).toUpperCase()} (after 10% platform fee)`,
        reference: `SN-BK-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
        status: 'success',
        metadata: {
          bookingId: booking._id,
          grossAmount: booking.serviceFee,
          platformFeeRate: 0.10,
          platformFeeAmount: booking.serviceFee - providerNet,
        },
        booking: booking._id,
      });
    } catch (err) {
      // Non-fatal; log for retry
      require('../config/logger').error('[booking] Wallet credit failed:', err.message);
    }
  });

  // Notify provider payment released
  notificationService.sendPushNotification({
    userId: booking.provider.toString(),
    actorType: 'provider',
    title: 'Payment Released 💰',
    body: `₦${providerNet.toLocaleString()} has been credited to your wallet.`,
    type: 'payment',
    data: { bookingId: booking._id.toString(), screen: 'earnings' },
  }).catch(() => {});

  res.json({ message: 'Job confirmed. Payment released.', booking });
});

// POST /bookings/:id/rate
const rateBooking = catchAsync(async (req, res) => {
  const booking = await dB.bookings.findOne({ _id: req.params.id, customer: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
  if (booking.status !== 'completed') throw new ApiError(httpStatus.BAD_REQUEST, 'You can only rate completed bookings.');
  if (booking.rating?.ratedAt) throw new ApiError(httpStatus.BAD_REQUEST, 'You have already rated this booking.');

  const { overall, quality, punctuality, professionalism, communication, review } = req.body;

  booking.rating = { overall, quality, punctuality, professionalism, communication, review, ratedAt: new Date() };
  await booking.save();

  // Create review record
  await dB.reviews.create({
    reviewer: req.user._id.toString(),
    reviewerName: req.user.fullName,
    reviewerAvatar: req.user.profilePhoto,
    target: booking.provider,
    targetType: 'provider',
    booking: booking._id,
    overall,
    categories: { quality, punctuality, professionalism, communication },
    text: review,
    isVerified: true,
  });

  res.json({ message: 'Rating submitted. Thank you!', booking });
});

// ─────────────────────────────────────────
// PROVIDER-FACING JOB ENDPOINTS
// ─────────────────────────────────────────

// GET /jobs
const listJobs = catchAsync(async (req, res) => {
  const { status, page = 0, limit = 20 } = req.query;
  const query = { provider: req.user._id };
  if (status) query.status = status;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const [bookings, total] = await Promise.all([
    dB.bookings
      .find(query)
      .populate('customer', 'fullName profilePhoto phoneNumber')
      .sort({ createdAt: -1 })
      .skip(safePage * safeLimit)
      .limit(safeLimit),
    dB.bookings.countDocuments(query),
  ]);

  res.json({ jobs: bookings, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) });
});

// GET /jobs/:id
const getJob = catchAsync(async (req, res) => {
  const booking = await dB.bookings
    .findOne({ _id: req.params.id, provider: req.user._id })
    .populate('customer', 'fullName profilePhoto phoneNumber location');

  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');
  res.json({ job: booking });
});

// PUT /jobs/:id/accept
const acceptJob = catchAsync(async (req, res) => {
  const booking = await dB.bookings.findOne({ _id: req.params.id, provider: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');
  if (booking.status !== 'pending') throw new ApiError(httpStatus.BAD_REQUEST, 'Only pending jobs can be accepted.');

  booking.status = 'accepted';
  booking.timeline.push({ status: 'accepted', timestamp: new Date() });
  await booking.save();

  emitBookingUpdate(booking);
  notificationService.sendPushNotification({
    userId: booking.customer.toString(),
    actorType: 'customer',
    title: 'Booking Accepted!',
    body: `Your booking for ${booking.service?.name} has been accepted.`,
    type: 'booking',
    data: { bookingId: booking._id.toString() },
  }).catch(() => {});

  res.json({ message: 'Job accepted.', job: booking });
});

// PUT /jobs/:id/decline
const declineJob = catchAsync(async (req, res) => {
  const booking = await dB.bookings.findOne({ _id: req.params.id, provider: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');
  if (!['pending', 'accepted'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This job cannot be declined at its current stage.');
  }

  booking.status = 'declined';
  booking.declineReason = req.body.reason || '';
  booking.timeline.push({ status: 'declined', timestamp: new Date(), note: req.body.reason });
  await booking.save();

  emitBookingUpdate(booking);
  notificationService.sendPushNotification({
    userId: booking.customer.toString(),
    actorType: 'customer',
    title: 'Booking Declined',
    body: 'Your booking request has been declined by the provider.',
    type: 'booking',
    data: { bookingId: booking._id.toString() },
  }).catch(() => {});

  res.json({ message: 'Job declined.', job: booking });
});

// PUT /jobs/:id/status  (on-the-way → arrived → assessment → in-progress)
const updateJobStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const allowed = ['on-the-way', 'arrived', 'assessment', 'in-progress'];
  if (!allowed.includes(status)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status transition.');

  const booking = await dB.bookings.findOne({ _id: req.params.id, provider: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');

  booking.status = status;
  booking.timeline.push({ status, timestamp: new Date() });
  await booking.save();

  emitBookingUpdate(booking);
  const statusMessages = {
    'on-the-way': 'Your provider is on the way.',
    arrived: 'Your provider has arrived.',
    assessment: 'Provider is assessing the work.',
    'in-progress': 'Service has started.',
  };

  notificationService.sendPushNotification({
    userId: booking.customer.toString(),
    actorType: 'customer',
    title: 'Job Update',
    body: statusMessages[status] || `Booking status: ${status}`,
    type: 'booking',
    data: { bookingId: booking._id.toString() },
  }).catch(() => {});

  res.json({ message: 'Status updated.', job: booking });
});

// POST /jobs/:id/start-code/verify
const verifyStartCode = catchAsync(async (req, res) => {
  const { code } = req.body;
  const booking = await dB.bookings
    .findOne({ _id: req.params.id, provider: req.user._id })
    .select('+startCode +startCodeExpiresAt');

  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');
  if (!booking.startCode) throw new ApiError(httpStatus.BAD_REQUEST, 'No start code has been generated for this job.');
  if (booking.startCodeExpiresAt < new Date()) throw new ApiError(httpStatus.BAD_REQUEST, 'Start code has expired. Ask the customer to regenerate.');
  if (booking.startCode !== code) throw new ApiError(httpStatus.BAD_REQUEST, 'Incorrect start code.');

  booking.status = 'in-progress';
  booking.startCodeVerifiedAt = new Date();
  booking.timeline.push({ status: 'in-progress', timestamp: new Date(), note: 'Service started — code verified.' });
  await booking.save();

  res.json({ message: 'Code verified. Service started.', job: booking });
});

// POST /jobs/:id/complete
const completeJob = catchAsync(async (req, res) => {
  const { beforePhotos, afterPhotos, completionNotes } = req.body;
  const booking = await dB.bookings.findOne({ _id: req.params.id, provider: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');
  if (!['in-progress', 'assessment'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Job must be in-progress to complete.');
  }

  const uploadFiles = async (files, folder) => {
    if (!Array.isArray(files) || files.length === 0) return [];

    const uploads = await Promise.all(files.map(async (file) => {
      const ext = file.mimetype.split('/')[1] || 'jpg';
      const key = `bookings/${booking._id.toString()}/${folder}/${uuidv4()}.${ext}`;
      const result = await uploadObject({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });
      return result.Location || `${process.env.R2_PUBLIC_URL}/${key}`;
    }));

    return uploads;
  };

  const beforeUploads = await uploadFiles(req.files?.beforePhotos, 'before');
  const afterUploads = await uploadFiles(req.files?.afterPhotos, 'after');

  const normalizedBefore = beforeUploads.length ? beforeUploads : (Array.isArray(beforePhotos) ? beforePhotos : []);
  const normalizedAfter = afterUploads.length ? afterUploads : (Array.isArray(afterPhotos) ? afterPhotos : []);

  booking.status = 'completed';
  booking.completionPhotos = { before: normalizedBefore, after: normalizedAfter };
  booking.completionNotes = completionNotes || '';
  booking.completedAt = new Date();
  booking.timeline.push({ status: 'completed', timestamp: new Date(), note: 'Provider marked as completed.' });
  await booking.save();

  notificationService.sendPushNotification({
    userId: booking.customer.toString(),
    actorType: 'customer',
    title: 'Service Completed!',
    body: 'Your service has been completed. Please confirm and rate your experience.',
    type: 'booking',
    data: { bookingId: booking._id.toString(), screen: 'order-complete' },
  }).catch(() => {});

  res.json({ message: 'Job marked as completed.', job: booking });
});

// POST /jobs/:id/additional-payment
const requestAdditionalPayment = catchAsync(async (req, res) => {
  const { reason, description, amount, evidencePhotos } = req.body;
  const booking = await dB.bookings.findOne({ _id: req.params.id, provider: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');
  if (!['accepted', 'on-the-way', 'arrived', 'assessment', 'in-progress'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Additional payment cannot be requested at this stage.');
  }

  booking.additionalPaymentRequest = {
    reason,
    description,
    amount,
    evidencePhotos: evidencePhotos || [],
    status: 'pending',
    requestedAt: new Date(),
  };
  await booking.save();

  notificationService.sendPushNotification({
    userId: booking.customer.toString(),
    actorType: 'customer',
    title: 'Additional Payment Requested',
    body: `Your provider has requested an additional ₦${amount.toLocaleString()} for ${reason}.`,
    type: 'payment',
    data: { bookingId: booking._id.toString() },
  }).catch(() => {});

  res.json({ message: 'Additional payment request sent.', booking });
});

const getProviderJobStats = catchAsync(async (req, res) => {
  try {
    const providerId = req.user._id;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [pending, active, completed, todayEarnings] = await Promise.all([
      Booking.countDocuments({ provider: providerId, status: 'pending' }),
      Booking.countDocuments({
        provider: providerId,
        status: { $in: ['accepted', 'on-the-way', 'arrived', 'assessment', 'in-progress'] },
      }),
      Booking.countDocuments({ provider: providerId, status: 'completed' }),
      Booking.aggregate([
        {
          $match: {
            provider: new mongoose.Types.ObjectId(providerId),
            status: 'completed',
            completedAt: { $gte: startOfDay, $lte: endOfDay },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      pendingRequests: pending,
      activeJobs: active,
      completedJobs: completed,
      todayEarnings: todayEarnings[0]?.total || 0,
      todayJobs: todayEarnings[0]?.count || 0,
    });
  } catch (error) {
    console.log('[getProviderJobStats] Error:', error.message);
    console.log('[getProviderJobStats] Stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
});


module.exports = {
  createBooking,
  listBookings,
  getBooking,
  cancelBooking,
  generateStartCode,
  confirmComplete,
  rateBooking,
  listJobs,
  getJob,
  acceptJob,
  declineJob,
  updateJobStatus,
  verifyStartCode,
  completeJob,
  requestAdditionalPayment,
  getProviderJobStats
};
