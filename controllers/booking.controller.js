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
const Wallet = require('../models/wallet')


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

// Helper function to generate unique 4-digit start code
async function generateUniqueStartCode() {
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loop

  while (!isUnique && attempts < maxAttempts) {
    // Generate a random 4-digit number (1000-9999)
    code = String(Math.floor(1000 + Math.random() * 9000));

    // Check if this code already exists in the database
    const existingBooking = await dB.bookings.findOne({
      startCode: code,
      status: { $nin: ['completed', 'declined', 'cancelled'] } // Only check active bookings
    });

    if (!existingBooking) {
      isUnique = true;
    }

    attempts++;
  }

  if (!isUnique) {
    // If we couldn't find a unique code after max attempts, use timestamp-based approach
    code = String(Date.now()).slice(-4);
    // Ensure it's 4 digits
    while (code.length < 4) {
      code = '0' + code;
    }
  }

  return code;
}


// ─────────────────────────────────────────
// CUSTOMER-FACING BOOKING ENDPOINTS
// ─────────────────────────────────────────

// POST /bookings
const createBooking = catchAsync(async (req, res) => {
  // Parse address if it's a string (coming from FormData)
  let addressData = req.body.address;
  if (typeof addressData === 'string') {
    try {
      addressData = JSON.parse(addressData);
    } catch (e) {
      addressData = {
        full: addressData || '',
        city: '',
        state: '',
        landmark: '',
        coordinates: { latitude: null, longitude: null }
      };
    }
  }

  const {
    providerId,
    serviceId,
    serviceName,
    servicePrice,
    serviceCategory,
    description,
    photos,
    scheduledDate,
    timeSlot,
    additionalNotes,
    paymentMethod,
  } = req.body;

  // Use the parsed address data
  const address = addressData || {};

  const provider = await dB.providers.findById(providerId).select('fullName isBanned');
  if (!provider) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found.');
  if (provider.isBanned) throw new ApiError(httpStatus.BAD_REQUEST, 'This provider is unavailable.');

  // Upload photos to Cloudflare R2 if provided
  let uploadedPhotoUrls = [];

  // Handle file uploads from multer (multipart/form-data)
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    try {
      const uploadPromises = req.files.map(async (file) => {
        const ext = file.mimetype ? file.mimetype.split('/')[1] : 'jpg';
        const fileName = `bookings/${Date.now()}/${uuidv4()}.${ext}`;

        const uploadResult = await uploadObject({
          Bucket: process.env.R2_BUCKET_NAME || 'servenaija',
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype || 'image/jpeg',
        });

        if (uploadResult.Location) {
          return uploadResult.Location;
        } else {
          const publicUrl = process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL_BASE;
          return `${publicUrl}/${fileName}`;
        }
      });

      uploadedPhotoUrls = await Promise.all(uploadPromises);
    } catch (uploadError) {
      console.error('Error uploading booking photos:', uploadError);
    }
  }

  // Handle base64 or URLs from body (if sent as JSON)
  const photosBody = req.body.photos;
  if (uploadedPhotoUrls.length === 0 && photosBody && Array.isArray(photosBody)) {
    try {
      for (const photo of photosBody) {
        if (photo && typeof photo === 'string') {
          if (photo.startsWith('file://')) {
            console.log('Skipping local file URI:', photo);
            continue;
          }

          if (photo.startsWith('data:image')) {
            const base64Data = photo.split(';base64,').pop();
            if (!base64Data) continue;

            const buffer = Buffer.from(base64Data, 'base64');
            const contentType = photo.split(';')[0].split(':')[1] || 'image/jpeg';
            const extension = contentType.split('/')[1] || 'jpg';
            const fileName = `bookings/${Date.now()}/${uuidv4()}.${extension}`;

            const uploadResult = await uploadObject({
              Bucket: process.env.R2_BUCKET_NAME || 'servenaija',
              Key: fileName,
              Body: buffer,
              ContentType: contentType,
            });

            if (uploadResult.Location) {
              uploadedPhotoUrls.push(uploadResult.Location);
            } else {
              const publicUrl = process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL_BASE;
              uploadedPhotoUrls.push(`${publicUrl}/${fileName}`);
            }
          } else if (photo.startsWith('http://') || photo.startsWith('https://')) {
            uploadedPhotoUrls.push(photo);
          }
        }
      }
    } catch (uploadError) {
      console.error('Error uploading photos from base64:', uploadError);
    }
  }

  const platformFee = 1500;
  const serviceFee = Number(servicePrice) || 0;
  const totalAmount = serviceFee + platformFee;

  // Handle payment
  let paymentStatus = 'pending';
  let paystackReference = null;
  let wallet = null;
  let transaction = null;

  const Wallet = mongoose.model('Wallet');
  const Transaction = mongoose.model('Transaction');

  // Generate unique 4-digit start code FIRST (before booking)
  const startCode = await generateUniqueStartCode();

  // Build the booking object with proper address
  const bookingData = {
    customer: req.user._id,
    provider: providerId,
    service: {
      name: serviceName,
      price: serviceFee,
      category: serviceCategory,
      serviceId
    },
    description: description || '',
    photos: uploadedPhotoUrls.length > 0 ? uploadedPhotoUrls : (photos || []),
    scheduledDate: scheduledDate || new Date(),
    timeSlot: timeSlot || '',
    address: {
      full: address.full || '',
      city: address.city || '',
      state: address.state || '',
      landmark: address.landmark || '',
      coordinates: {
        latitude: address.coordinates?.latitude || null,
        longitude: address.coordinates?.longitude || null,
      },
    },
    additionalNotes: additionalNotes || '',
    serviceFee: serviceFee,
    platformFee: platformFee,
    totalAmount: totalAmount,
    paymentStatus: paymentStatus,
    paystackReference: paystackReference,
    startCode: startCode,
    timeline: [{
      status: 'pending',
      timestamp: new Date(),
      note: `Booking submitted. Payment via ${paymentMethod || 'pending'}.`
    }],
  };

  // ✅ Create booking FIRST
  const booking = await dB.bookings.create(bookingData);

  // ✅ Now handle payment after booking is created
  if (paymentMethod === 'wallet') {
    // Get customer's wallet
    wallet = await Wallet.findOne({ owner: req.user._id.toString() });

    if (!wallet) {
      wallet = await Wallet.create({
        owner: req.user._id.toString(),
        ownerType: 'customer',
        balance: 0,
        escrowBalance: 0,
        currency: 'NGN',
        isActive: true,
      });
    }

    // Check if wallet has enough balance
    if (wallet.balance < totalAmount) {
      // If insufficient balance, delete the booking and throw error
      await dB.bookings.findByIdAndDelete(booking._id);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Insufficient wallet balance. Available: ₦${wallet.balance.toLocaleString()}, Required: ₦${totalAmount.toLocaleString()}`
      );
    }

    // Deduct from wallet
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - totalAmount;
    wallet.balance = balanceAfter;
    await wallet.save();

    // Create transaction record with booking ID
    transaction = await Transaction.create({
      wallet: wallet._id,
      owner: req.user._id.toString(),
      type: 'debit',
      amount: totalAmount,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      currency: wallet.currency,
      description: `Payment for booking service: ${serviceName}`,
      reference: `BOOK_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: 'success',
      metadata: {
        bookingId: booking._id.toString(),
        serviceName: serviceName,
        serviceFee: serviceFee,
        platformFee: platformFee,
        paymentMethod: 'wallet',
      },
    });

    paymentStatus = 'held';
    
    // Update booking with payment status and transaction reference
    booking.paymentStatus = 'held';
    await booking.save();
    
    // Log successful wallet payment
    console.log(`[Payment] Customer ${req.user._id} paid ₦${totalAmount} via wallet for booking ${booking._id}`);
  }

  // Log successful creation
  console.log(`[Booking] Created booking ${booking._id} for customer ${req.user._id}`);

  // Notify provider of new booking
  notificationService.sendPushNotification({
    userId: providerId,
    actorType: 'provider',
    title: 'New Job Request',
    body: `${req.user.fullName || 'A customer'} has requested your ${serviceName} service.`,
    type: 'booking',
    data: {
      bookingId: booking._id.toString(),
      screen: 'jobs'
    },
  }).catch((err) => {
    console.error('Failed to send provider notification:', err);
  });

  // Notify customer of successful booking
  notificationService.sendPushNotification({
    userId: req.user._id.toString(),
    actorType: 'customer',
    title: 'Booking Confirmed!',
    body: `Your booking for ${serviceName} has been sent to ${provider.fullName}. Your start code is: ${startCode}`,
    type: 'booking',
    data: {
      bookingId: booking._id.toString(),
      screen: 'booking-success'
    },
  }).catch((err) => {
    console.error('Failed to send customer notification:', err);
  });

  // Populate booking for response
  const populatedBooking = await dB.bookings
    .findById(booking._id)
    .populate('customer', 'fullName email phoneNumber profilePhoto')
    .populate('provider', 'fullName businessName profilePhoto');

  // Get wallet balance for response
  const walletBalance = paymentMethod === 'wallet' && wallet ? wallet.balance : null;

  res.status(httpStatus.CREATED).json({
    success: true,
    booking: populatedBooking,
    startCode: startCode,
    paymentMethod: paymentMethod || 'pending',
    paymentStatus: paymentStatus,
    walletBalance: walletBalance,
  });
});

// Helper function to generate unique 4-digit start code
async function generateUniqueStartCode() {
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 100;

  while (!isUnique && attempts < maxAttempts) {
    code = String(Math.floor(1000 + Math.random() * 9000));
    
    const existingBooking = await dB.bookings.findOne({ 
      startCode: code,
      status: { $nin: ['completed', 'declined', 'cancelled'] }
    });
    
    if (!existingBooking) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    code = String(Date.now()).slice(-4);
    while (code.length < 4) {
      code = '0' + code;
    }
  }

  return code;
}

// Helper function to generate unique 4-digit start code
async function generateUniqueStartCode() {
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 100;

  while (!isUnique && attempts < maxAttempts) {
    code = String(Math.floor(1000 + Math.random() * 9000));
    
    const existingBooking = await dB.bookings.findOne({ 
      startCode: code,
      status: { $nin: ['completed', 'declined', 'cancelled'] }
    });
    
    if (!existingBooking) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    code = String(Date.now()).slice(-4);
    while (code.length < 4) {
      code = '0' + code;
    }
  }

  return code;
}

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
// controllers/booking.controller.js

const getBooking = catchAsync(async (req, res) => {
  const booking = await dB.bookings
    .findById(req.params.id)
    .select('+startCode')
    .populate('customer', 'fullName email phoneNumber profilePhoto')
    .populate('provider', 'fullName businessName profilePhoto service');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
  }

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

  // Store payment info before updating
  const paymentStatus = booking.paymentStatus;
  const serviceFee = booking.serviceFee || 0;
  const refundAmount = serviceFee;

  booking.status = 'cancelled';
  booking.cancelledBy = 'customer';
  booking.cancellationReason = req.body.reason || '';
  booking.timeline.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: req.body.reason || 'Cancelled by customer.'
  });

  // Refund customer if payment was held
  if (paymentStatus === 'held' || paymentStatus === 'pending') {
    try {
      const Customer = mongoose.model('Customer');
      const customer = await Customer.findById(req.user._id);

      if (customer) {
        const result = await customer.updateWalletBalance(
          refundAmount,
          'credit',
          `Refund for cancelled booking #${booking._id.toString()}`,
          `REFUND_BOOKING_${booking._id.toString()}_${Date.now()}`,
          {
            bookingId: booking._id.toString(),
            serviceFee: serviceFee,
            refundAmount: refundAmount,
            reason: 'booking_cancelled_by_customer',
          }
        );

        booking.paymentStatus = 'refunded';

        console.log(`[Booking] Refunded ₦${refundAmount} to customer ${customer.email} for cancelled booking ${booking._id.toString()}`);
      }
    } catch (refundError) {
      console.error('[Booking] Refund failed:', refundError);
    }
  }

  await booking.save();

  // Send notifications
  notificationService.sendPushNotification({
    userId: booking.provider.toString(),
    actorType: 'provider',
    title: 'Booking Cancelled',
    body: 'A customer has cancelled their booking.',
    type: 'booking',
    data: {
      bookingId: booking._id.toString(),
      refunded: refundAmount > 0,
      refundAmount: refundAmount,
    },
  }).catch(() => { });

  if (refundAmount > 0) {
    notificationService.sendPushNotification({
      userId: booking.customer.toString(),
      actorType: 'customer',
      title: 'Refund Processed',
      body: `₦${refundAmount.toLocaleString()} has been refunded to your wallet for cancelled booking.`,
      type: 'payment',
      data: {
        bookingId: booking._id.toString(),
        refundAmount: refundAmount,
      },
    }).catch(() => { });
  }

  const populatedBooking = await dB.bookings
    .findById(booking._id)
    .populate('customer', 'fullName email phoneNumber profilePhoto')
    .populate('provider', 'fullName businessName profilePhoto');

  res.json({
    message: 'Booking cancelled successfully.',
    booking: populatedBooking,
    refunded: refundAmount > 0,
    refundAmount: refundAmount,
  });
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
  }).catch(() => { });

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
  }).catch(() => { });

  res.json({ message: 'Job accepted.', job: booking });
});

// PUT /jobs/:id/decline
const declineJob = catchAsync(async (req, res) => {
  const booking = await dB.bookings.findOne({ _id: req.params.id, provider: req.user._id });
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');
  if (!['pending', 'accepted'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This job cannot be declined at its current stage.');
  }

  // Store the payment status and amount before updating
  const paymentStatus = booking.paymentStatus;
  const totalAmount = booking.totalAmount || 0;
  const serviceFee = booking.serviceFee || 0;
  const platformFee = booking.platformFee || 0;

  // Calculate refund amount (service fee only, not platform fee)
  const refundAmount = serviceFee;

  booking.status = 'declined';
  booking.declineReason = req.body.reason || '';
  booking.timeline.push({
    status: 'declined',
    timestamp: new Date(),
    note: req.body.reason || 'Job declined by provider'
  });

  // If payment was held/processing, refund the customer's wallet
  if (paymentStatus === 'held' || paymentStatus === 'pending') {
    try {
      // Get the customer's wallet
      const Customer = mongoose.model('Customer');
      const customer = await Customer.findById(booking.customer);

      if (customer) {
        // Use the customer's wallet method to refund
        await customer.updateWalletBalance(
          refundAmount,
          'credit',
          `Refund for declined booking #${booking._id.toString()}`,
          `REFUND_${booking._id.toString()}`,
          {
            bookingId: booking._id.toString(),
            originalTotal: totalAmount,
            platformFee: platformFee,
            refundAmount: refundAmount,
            reason: 'booking_declined'
          }
        );

        // Update booking payment status
        booking.paymentStatus = 'refunded';

        // Log the refund
        console.log(`[Booking] Refunded ₦${refundAmount} to customer ${customer.email} for declined booking ${booking._id.toString()}`);
      }
    } catch (refundError) {
      console.error('[Booking] Refund failed:', refundError);
      // Still save the booking but log the error
    }
  }

  await booking.save();

  // Emit socket update
  emitBookingUpdate(booking);

  // Send push notification to customer
  notificationService.sendPushNotification({
    userId: booking.customer.toString(),
    actorType: 'customer',
    title: 'Booking Declined',
    body: `Your booking request has been declined by the provider. ${refundAmount > 0 ? `₦${refundAmount.toLocaleString()} has been refunded to your wallet.` : ''}`,
    type: 'booking',
    data: {
      bookingId: booking._id.toString(),
      refunded: refundAmount > 0,
      refundAmount: refundAmount
    },
  }).catch(() => { });

  // Populate for response
  const populatedBooking = await dB.bookings
    .findById(booking._id)
    .populate('customer', 'fullName email phoneNumber')
    .populate('provider', 'fullName businessName');

  res.json({
    message: 'Job declined successfully.',
    job: populatedBooking,
    refunded: refundAmount > 0,
    refundAmount: refundAmount
  });
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
  }).catch(() => { });

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
  }).catch(() => { });

  res.json({ message: 'Job marked as completed.', job: booking });
});

// POST /jobs/:id/additional-payment
const requestAdditionalPayment = catchAsync(async (req, res) => {
  const { reason, description, amount } = req.body;
  const booking = await dB.bookings.findOne({ _id: req.params.id, provider: req.user._id });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Job not found.');
  }

  if (!['accepted', 'on-the-way', 'arrived', 'assessment', 'in-progress'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Additional payment cannot be requested at this stage.');
  }

  // Upload evidence photos to Cloudflare R2 if provided
  let uploadedPhotoUrls = [];

  // Handle file uploads from multer (multipart/form-data)
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    try {
      for (const file of req.files) {
        const ext = file.mimetype ? file.mimetype.split('/')[1] : 'jpg';
        const fileName = `additional-payment/${req.params.id}/${uuidv4()}.${ext}`;

        const uploadResult = await uploadObject({
          Bucket: process.env.R2_BUCKET_NAME || 'servenaija',
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype || 'image/jpeg',
        });

        if (uploadResult.Location) {
          uploadedPhotoUrls.push(uploadResult.Location);
        } else {
          const publicUrl = process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL_BASE;
          uploadedPhotoUrls.push(`${publicUrl}/${fileName}`);
        }
      }
    } catch (uploadError) {
      console.error('Error uploading evidence photos:', uploadError);
      // Continue without uploaded photos - don't block the request
    }
  }

  // Handle base64 or URLs from body (if sent as JSON)
  const evidencePhotosBody = req.body.evidencePhotos;
  if (!uploadedPhotoUrls.length && evidencePhotosBody && Array.isArray(evidencePhotosBody)) {
    try {
      for (const photo of evidencePhotosBody) {
        // Skip local file paths
        if (photo && typeof photo === 'string') {
          // Skip file:// URLs
          if (photo.startsWith('file://')) {
            console.log('Skipping local file URI (not accessible from server):', photo);
            continue;
          }

          // If photo is a base64 string
          if (photo.startsWith('data:image')) {
            const base64Data = photo.split(';base64,').pop();
            if (!base64Data) {
              console.log('Invalid base64 data for photo');
              continue;
            }

            const buffer = Buffer.from(base64Data, 'base64');
            const contentType = photo.split(';')[0].split(':')[1] || 'image/jpeg';
            const extension = contentType.split('/')[1] || 'jpg';
            const fileName = `additional-payment/${req.params.id}/${uuidv4()}.${extension}`;

            const uploadResult = await uploadObject({
              Bucket: process.env.R2_BUCKET_NAME || 'servenaija',
              Key: fileName,
              Body: buffer,
              ContentType: contentType,
            });

            if (uploadResult.Location) {
              uploadedPhotoUrls.push(uploadResult.Location);
            } else {
              const publicUrl = process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL_BASE;
              uploadedPhotoUrls.push(`${publicUrl}/${fileName}`);
            }
          }
          // If photo is already a URL
          else if (photo.startsWith('http://') || photo.startsWith('https://')) {
            uploadedPhotoUrls.push(photo);
          }
          // Skip anything else
          else {
            console.log('Skipping unsupported photo format:', photo.substring(0, 50) + '...');
          }
        }
      }
    } catch (uploadError) {
      console.error('Error uploading evidence photos from base64:', uploadError);
    }
  }

  // Create the additional payment request with uploaded photo URLs
  booking.additionalPaymentRequest = {
    reason,
    description,
    amount: Number(amount),
    evidencePhotos: uploadedPhotoUrls.length > 0 ? uploadedPhotoUrls : [],
    status: 'pending',
    requestedAt: new Date(),
  };

  await booking.save();

  // Send push notification to customer
  notificationService.sendPushNotification({
    userId: booking.customer.toString(),
    actorType: 'customer',
    title: 'Additional Payment Requested',
    body: `Your provider has requested an additional ₦${Number(amount).toLocaleString()} for ${reason}.`,
    type: 'payment',
    data: {
      bookingId: booking._id.toString(),
      amount: Number(amount),
      reason: reason,
    },
  }).catch((err) => {
    console.error('Failed to send notification:', err);
  });

  // Populate customer details for response
  const populatedBooking = await dB.bookings
    .findById(booking._id)
    .populate('customer', 'fullName phoneNumber profilePhoto')
    .populate('provider', 'fullName businessName phoneNumber');

  res.status(200).json({
    success: true,
    message: 'Additional payment request sent successfully.',
    booking: populatedBooking,
    uploadedPhotos: uploadedPhotoUrls,
  });
});


const payAdditionalPayment = catchAsync(async (req, res) => {
  const { amount, paymentMethod, paystackReference } = req.body;
  const booking = await dB.bookings.findOne({ _id: req.params.id, customer: req.user._id });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
  }

  if (!booking.additionalPaymentRequest) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No additional payment request found.');
  }

  if (booking.additionalPaymentRequest.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This additional payment request is already processed.');
  }

  if (Number(booking.additionalPaymentRequest.amount) !== Number(amount)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Amount does not match the requested amount.');
  }

  const Wallet = mongoose.model('Wallet');
  const Transaction = mongoose.model('Transaction');

  if (paymentMethod === 'wallet') {
    let wallet = await Wallet.findOne({ owner: req.user._id.toString() });

    if (!wallet) {
      wallet = await Wallet.create({
        owner: req.user._id.toString(),
        ownerType: 'customer',
        balance: 0,
        escrowBalance: 0,
        currency: 'NGN',
        isActive: true,
      });
    }

    if (wallet.balance < amount) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient wallet balance.');
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - amount;
    wallet.balance = balanceAfter;
    await wallet.save();

    await Transaction.create({
      wallet: wallet._id,
      owner: req.user._id.toString(),
      type: 'debit',
      amount: amount,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      currency: wallet.currency,
      description: `Additional payment for booking ${booking._id.toString()}`,
      reference: `ADD_PAY_WALLET_${booking._id.toString()}_${Date.now()}`,
      status: 'success',
      metadata: {
        bookingId: booking._id.toString(),
        reason: booking.additionalPaymentRequest.reason,
      },
    });

    booking.additionalPaymentRequest.status = 'approved';
    booking.paymentStatus = 'held';
    await booking.save();

    notificationService.sendPushNotification({
      userId: booking.provider.toString(),
      actorType: 'provider',
      title: 'Additional Payment Received',
      body: `Customer has paid the additional ₦${Number(amount).toLocaleString()} for ${booking.additionalPaymentRequest.reason}.`,
      type: 'payment',
      data: {
        bookingId: booking._id.toString(),
        amount: amount,
      },
    }).catch(() => { });

    const populatedBooking = await dB.bookings
      .findById(booking._id)
      .populate('customer', 'fullName email phoneNumber profilePhoto')
      .populate('provider', 'fullName businessName profilePhoto');

    res.json({
      success: true,
      message: 'Additional payment successful.',
      booking: populatedBooking,
      paymentMethod: 'wallet',
      amountPaid: amount,
    });

  } else if (paymentMethod === 'paystack' || paymentMethod === 'card') {
    if (!paystackReference) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack reference is required for card payment.');
    }

    try {
      const verifyResponse = await axios.get(
        `https://api.paystack.co/transaction/verify/${paystackReference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
        }
      );

      const verificationData = verifyResponse.data;

      if (!verificationData.status || verificationData.data.status !== 'success') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed.');
      }

      if (Number(verificationData.data.amount) / 100 !== Number(amount)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Amount does not match.');
      }

      let wallet = await Wallet.findOne({ owner: req.user._id.toString() });
      if (!wallet) {
        wallet = await Wallet.create({
          owner: req.user._id.toString(),
          ownerType: 'customer',
          balance: 0,
          escrowBalance: 0,
          currency: 'NGN',
          isActive: true,
        });
      }

      await Transaction.create({
        wallet: wallet._id,
        owner: req.user._id.toString(),
        type: 'debit',
        amount: amount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance,
        currency: wallet.currency,
        description: `Additional payment for booking ${booking._id.toString()}`,
        reference: paystackReference,
        status: 'success',
        metadata: {
          bookingId: booking._id.toString(),
          reason: booking.additionalPaymentRequest.reason,
          paymentMethod: 'paystack',
        },
      });

      booking.additionalPaymentRequest.status = 'approved';
      booking.paymentStatus = 'held';
      booking.paystackReference = paystackReference;
      await booking.save();

      notificationService.sendPushNotification({
        userId: booking.provider.toString(),
        actorType: 'provider',
        title: 'Additional Payment Received',
        body: `Customer has paid the additional ₦${Number(amount).toLocaleString()} for ${booking.additionalPaymentRequest.reason}.`,
        type: 'payment',
        data: {
          bookingId: booking._id.toString(),
          amount: amount,
        },
      }).catch(() => { });

      const populatedBooking = await dB.bookings
        .findById(booking._id)
        .populate('customer', 'fullName email phoneNumber profilePhoto')
        .populate('provider', 'fullName businessName profilePhoto');

      res.json({
        success: true,
        message: 'Additional payment successful.',
        booking: populatedBooking,
        paymentMethod: 'paystack',
        amountPaid: amount,
        paystackReference: paystackReference,
      });

    } catch (error) {
      console.error('Paystack verification error:', error);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        error?.response?.data?.message || 'Payment verification failed.'
      );
    }
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment method.');
  }
});

const confirmJobCompletion = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const { completionNotes, completionPhotos } = req.body;
  const customerId = req.user._id.toString();

  // Find the booking
  const booking = await dB.bookings.findById(bookingId);
  
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  // Verify the customer owns this booking
  if (booking.customer.toString() !== customerId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to confirm this booking');
  }

  // Check if booking is already confirmed
  if (booking.customerConfirmedCompletion) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This booking has already been confirmed');
  }

  // Check if payment is already released
  if (booking.paymentStatus === 'released') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment has already been released');
  }

  

  // Check if booking is completed by provider
  if (booking.status !== 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 
      `Booking must be marked as completed by the provider first. Current status: ${booking.status}`
    );
  }

  // Update booking
  booking.customerConfirmedCompletion = true;
  booking.customerConfirmedAt = new Date();
  booking.paymentStatus = 'released';
  booking.customerCompletionNotes = completionNotes || '';
  booking.customerCompletionPhotos = completionPhotos || [];

  booking.timeline.push({
    status: 'customer_confirmed',
    note: 'Customer confirmed job completion and released payment.',
    timestamp: new Date(),
  });

  await booking.save();

  // Release payment from escrow to provider
  let paymentReleased = false;
  let releaseError = null;

  try {
    await releaseEscrowToProvider(booking);
    paymentReleased = true;
  } catch (error) {
    console.error('Error releasing payment to provider:', error);
    releaseError = error.message;
  }

  // Send notifications
  try {
    const customer = await dB.customers.findById(customerId).select('fullName');
    const customerName = customer?.fullName || 'Customer';

    await notificationService.sendPushNotification({
      userId: booking.provider.toString(),
      actorType: 'provider',
      title: 'Payment Released',
      body: `${customerName} confirmed job completion. Payment of ₦${booking.serviceFee.toLocaleString()} released to your wallet.`,
      type: 'booking',
      data: {
        bookingId: booking._id.toString(),
        status: 'customer_confirmed',
        paymentReleased: true,
        amount: booking.totalAmount,
      },
    });

    await notificationService.sendPushNotification({
      userId: customerId,
      actorType: 'customer',
      title: 'Job Confirmed',
      body: `You confirmed job completion. Payment of ₦${booking.serviceFee.toLocaleString()} released to provider.`,
      type: 'booking',
      data: {
        bookingId: booking._id.toString(),
        status: 'customer_confirmed',
        paymentReleased: true,
      },
    });

    const io = getIo();
    if (io) {
      io.to(`provider_${booking.provider.toString()}`).emit('payment_released', {
        bookingId: booking._id.toString(),
        customerName: customerName,
        confirmedAt: booking.customerConfirmedAt,
        amount: booking.serviceFee,
        paymentReleased: true,
      });

      io.to(`customer_${customerId}`).emit('payment_released', {
        bookingId: booking._id.toString(),
        confirmedAt: booking.customerConfirmedAt,
        amount: booking.serviceFee,
        paymentReleased: true,
      });
    }
  } catch (error) {
    console.error('Error sending notifications:', error);
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Job confirmed and payment released successfully.',
    data: {
      booking: booking,
      paymentReleased: paymentReleased,
      releaseError: releaseError,
      amount: booking.serviceFee,
    },
  });
});

/**
 * Release payment from escrow to provider's wallet
 * Money is already deducted from customer wallet and held in escrow
 */
async function releaseEscrowToProvider(booking) {
  // Get provider wallet
  const providerWallet = await dB.wallets.findOne({
    owner: booking.provider.toString(),
    ownerType: 'provider',
    isActive: true,
  });

  if (!providerWallet) {
    throw new Error('Provider wallet not found');
  }

  


  const amountToRelease = booking.serviceFee;

 


  // Add to provider's wallet
  providerWallet.balance += amountToRelease;
  providerWallet.totalEarned = (providerWallet.totalEarned || 0) + amountToRelease;
  await providerWallet.save();

  // Create transaction for provider
  await dB.transactions.create({
    wallet: providerWallet._id,
    owner: booking.provider.toString(),
    ownerType: 'provider',
    type: 'credit',
    amount: amountToRelease,
    balanceBefore: providerWallet.balance - amountToRelease,
    balanceAfter: providerWallet.balance,
    currency: 'NGN',
    description: `Payment for booking #${booking._id.toString().slice(-6)}`,
    reference: `RELEASE_${booking._id.toString()}_${Date.now()}`,
    status: 'success',
    metadata: {
      bookingId: booking._id.toString(),
      paymentType: 'escrow_release',
      customerId: booking.customer.toString(),
      confirmedBy: 'customer',
    },
    booking: booking._id,
  });

  

  return {
    success: true,
    amount: amountToRelease,
    providerBalance: providerWallet.balance,
  };
}

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
  payAdditionalPayment,
  confirmJobCompletion

};
