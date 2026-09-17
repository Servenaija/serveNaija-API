const httpStatus = require('http-status');
const bcrypt = require('bcryptjs');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');
const { tokenService} = require('../services');
const { PLAN_PRICES } = require('../models/promotion');


function sanitize(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.password;
  delete obj.__v;
  return obj;
}
function sanitizeUser(userDoc) {
  const safe = userDoc.toObject();
  delete safe.password;
  delete safe.__v;
  return safe;
}

// GET /provider/me
const getMe = catchAsync(async (req, res) => {
  res.json({ provider: sanitize(req.user) });
  console.log(req.user)
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

  // Keep GeoJSON field in sync for 2dsphere radius queries
  if (latitude !== undefined && longitude !== undefined) {
    update['geoLocation.type'] = 'Point';
    update['geoLocation.coordinates'] = [Number(longitude), Number(latitude)]; // GeoJSON is [lng, lat]
  }

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
      'bankDetails.isVerified': true,
    },
  });
  res.json({ message: 'Bank details saved.' });
});

// Service limits per subscription plan
const PLAN_SERVICE_LIMITS = {
  standard: 5,
  verified: 10,
  starter: 5,
  growth: 15,
  premium: Infinity, // unlimited
  enterprise: Infinity, // unlimited
};

// GET /provider/services
const listServices = catchAsync(async (req, res) => {
  const services = await dB.services.find({ provider: req.user._id }).sort({ createdAt: -1 });
  res.json({ services });
});

// POST /provider/services
const addService = catchAsync(async (req, res) => {
  const { name, price, description, duration } = req.body;

  // Enforce plan service limit
  const plan = req.user.subscription?.selectedPlan || 'standard';
  const limit = PLAN_SERVICE_LIMITS[plan] ?? 5;
  if (isFinite(limit)) {
    const count = await dB.services.countDocuments({ provider: req.user._id, isActive: true });
    if (count >= limit) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Your current plan (${plan}) allows a maximum of ${limit} service${limit === 1 ? '' : 's'}. Upgrade your plan to add more.`
      );
    }
  }

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

// ─────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT
// ─────────────────────────────────────────

// Subscription plan pricing (yearly, in NGN)
const SUBSCRIPTION_PLANS = {
  standard: { amount: 5000, durationDays: 365 },
  verified: { amount: 20000, durationDays: 365 },
  starter: { amount: 20000, durationDays: 365 },
  growth: { amount: 50000, durationDays: 365 },
  premium: { amount: 100000, durationDays: 365 },
  enterprise: { amount: 250000, durationDays: 365 },
};

// GET /provider/subscription/plans  — list all plans with current prorate credit
const getSubscriptionPlans = catchAsync(async (req, res) => {
  const provider = req.user;
  const currentPlan = provider.subscription?.selectedPlan;
  const renewalDate = provider.subscription?.renewalDate;
  const isActive = provider.subscription?.isActive;

  const now = new Date();

  // Calculate remaining credit from current plan (only if active and not expired)
  let creditAmount = 0;
  if (isActive && renewalDate && renewalDate > now && currentPlan && SUBSCRIPTION_PLANS[currentPlan]) {
    const planMeta = SUBSCRIPTION_PLANS[currentPlan];
    const totalDays = planMeta.durationDays;
    const remainingMs = renewalDate - now;
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
    const dailyRate = planMeta.amount / totalDays;
    creditAmount = Math.round(dailyRate * remainingDays);
  }

  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, meta]) => ({
    plan: key,
    fullPrice: meta.amount,
    upgradePrice: Math.max(0, meta.amount - creditAmount),
    creditApplied: Math.min(creditAmount, meta.amount),
    durationDays: meta.durationDays,
    isCurrent: key === currentPlan,
    serviceLimitCount: PLAN_SERVICE_LIMITS[key] === Infinity ? null : PLAN_SERVICE_LIMITS[key],
  }));

  res.json({ plans, currentPlan, renewalDate, creditAmount });
});

// POST /provider/subscription/activate  — first-time subscription purchase
// POST /provider/subscription/upgrade   — upgrade from current plan (prorate)
const manageSubscription = catchAsync(async (req, res) => {
  const { plan, paystackReference, isUpgrade = false } = req.body;

  if (!SUBSCRIPTION_PLANS[plan]) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid plan. Choose from: ${Object.keys(SUBSCRIPTION_PLANS).join(', ')}`);
  }
  if (!paystackReference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'paystackReference is required to verify payment.');
  }

  // Check reference not double-used
  const usedRef = await dB.transactions.findOne({ reference: paystackReference });
  if (usedRef) throw new ApiError(httpStatus.BAD_REQUEST, 'This payment reference has already been used.');

  const provider = await dB.providers.findById(req.user._id).select('+subscription');
  const now = new Date();
  const planMeta = SUBSCRIPTION_PLANS[plan];

  // Calculate prorate credit from existing active plan
  let creditAmount = 0;
  const oldPlan = provider.subscription?.selectedPlan;
  const renewalDate = provider.subscription?.renewalDate;
  const wasActive = provider.subscription?.isActive;

  if (isUpgrade && wasActive && renewalDate && renewalDate > now && oldPlan && SUBSCRIPTION_PLANS[oldPlan]) {
    const oldMeta = SUBSCRIPTION_PLANS[oldPlan];
    const remainingMs = renewalDate - now;
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
    const dailyRate = oldMeta.amount / oldMeta.durationDays;
    creditAmount = Math.round(dailyRate * remainingDays);
  }

  const amountDue = Math.max(0, planMeta.amount - creditAmount);

  // Verify Paystack payment (amount must match amountDue — allow ₦0 if fully covered by credit)
  if (amountDue > 0) {
    const paymentService = require('../services/payment.service');
    const verification = await paymentService.verifyTransaction(paystackReference);
    if (verification.status !== 'success') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed.');
    }
    // Allow small rounding difference (up to ₦10)
    if (Math.abs(verification.amount - amountDue) > 10) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Expected payment of ₦${amountDue.toLocaleString()} (after ₦${creditAmount.toLocaleString()} credit). Got ₦${verification.amount.toLocaleString()}.`
      );
    }
  }

  // Set new subscription dates
  const startDate = now;
  const endDate = new Date(now.getTime() + planMeta.durationDays * 24 * 60 * 60 * 1000);

  await dB.providers.findByIdAndUpdate(req.user._id, {
    'subscription.selectedPlan': plan,
    'subscription.amountPaid': planMeta.amount,
    'subscription.paidAt': now,
    'subscription.renewalDate': endDate,
    'subscription.isActive': true,
  });

  // Record transaction
  if (amountDue > 0) {
    let wallet = await dB.wallets.findOne({ owner: req.user._id.toString() });
    if (!wallet) wallet = await dB.wallets.create({ owner: req.user._id.toString(), ownerType: 'provider' });

    await dB.transactions.create({
      wallet: wallet._id,
      owner: req.user._id.toString(),
      type: 'debit',
      amount: amountDue,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance,
      description: `${isUpgrade ? 'Plan upgrade' : 'Plan activation'} to ${plan} (credit applied: ₦${creditAmount.toLocaleString()})`,
      reference: paystackReference,
      status: 'success',
      metadata: { plan, amountDue, creditAmount, oldPlan },
    });
  }

  notificationService.sendPushNotification({
    userId: req.user._id.toString(),
    actorType: 'provider',
    title: `Plan ${isUpgrade ? 'Upgraded' : 'Activated'} 🎉`,
    body: `Welcome to the ${plan} plan! Your plan is active until ${endDate.toLocaleDateString('en-NG')}.`,
    type: 'system',
    data: { screen: 'profile' },
  }).catch(() => { });

  res.status(httpStatus.CREATED).json({
    message: `Subscription ${isUpgrade ? 'upgraded' : 'activated'} successfully.`,
    plan,
    renewalDate: endDate,
    amountCharged: amountDue,
    creditApplied: creditAmount,
  });
});

// ─────────────────────────────────────────
// PROMOTIONS
// ─────────────────────────────────────────


// GET /provider/promotion  — current active promotions
const getMyPromotions = catchAsync(async (req, res) => {
  const promotions = await dB.promotions
    .find({ provider: req.user._id, status: 'active', endDate: { $gt: new Date() } })
    .sort({ endDate: 1 })
    .lean();
  res.json({ promotions });
});

// POST /provider/promote  — purchase a promotion plan
const purchasePromotion = catchAsync(async (req, res) => {
  const { plan, paystackReference } = req.body;

  if (!PLAN_PRICES[plan]) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid plan. Valid plans: ${Object.keys(PLAN_PRICES).join(', ')}`);
  }
  if (!paystackReference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'paystackReference is required to verify payment.');
  }

  const planMeta = PLAN_PRICES[plan];
  const now = new Date();

  // Calculate end date based on billing cycle
  const endDate = new Date(now);
  if (planMeta.billingCycle === 'monthly') {
    endDate.setMonth(endDate.getMonth() + 1);
  } else {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  // Check if this plan is already active — extend if so
  const existing = await dB.promotions.findOne({
    provider: req.user._id,
    plan,
    status: 'active',
    endDate: { $gt: now },
  });

  let promotion;
  if (existing) {
    // Extend existing promotion
    const baseDate = existing.endDate > now ? existing.endDate : now;
    const extended = new Date(baseDate);
    if (planMeta.billingCycle === 'monthly') {
      extended.setMonth(extended.getMonth() + 1);
    } else {
      extended.setFullYear(extended.getFullYear() + 1);
    }
    existing.endDate = extended;
    await existing.save();
    promotion = existing;
  } else {
    promotion = await dB.promotions.create({
      provider: req.user._id,
      plan,
      amount: planMeta.amount,
      billingCycle: planMeta.billingCycle,
      paystackReference,
      startDate: now,
      endDate,
    });
  }

  // Update cached fields on provider document for fast search sorting
  const providerUpdate = {};
  if (plan === 'featured_provider' || plan === 'verified_pro') {
    providerUpdate.featuredUntil = promotion.endDate;
  }
  if (plan === 'verified_pro') {
    providerUpdate.isVerifiedPro = true;
  }
  if (Object.keys(providerUpdate).length) {
    await dB.providers.findByIdAndUpdate(req.user._id, providerUpdate);
  }

  res.status(httpStatus.CREATED).json({ promotion, message: 'Promotion activated.' });
});

// controllers/provider.controller.js

// Deactivate account (soft delete)
const deactivateAccount = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const provider = await dB.providers.findById(userId);
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  // Set deactivation date
  provider.deactivatedAt = new Date();
  provider.isDeactivated = true;
  provider.isActive = false; // Also deactivate their subscription/status

  // Revoke all tokens or sessions if needed
  // provider.tokens = [];

  await provider.save();

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Account deactivated successfully. You can reactivate by logging in within 6 months.',
    data: {
      deactivatedAt: provider.deactivatedAt,
      reactivationDeadline: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000), // 6 months from now
    },
  });
});

// Reactivate account (login will trigger this)
const reactivateAccount = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const provider = await dB.providers.findOne({ email }).select('+password');
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Check if account was deactivated
  if (!provider.isDeactivated) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account is already active');
  }

  // Check if 6 months have passed
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
  if (provider.deactivatedAt < sixMonthsAgo) {
    throw new ApiError(httpStatus.GONE, 'Account has been permanently deleted. Please create a new account.');
  }

  // Verify password
  const isPasswordMatch = await bcrypt.compare(password, provider.password);
  if (!isPasswordMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid credentials');
  }

  // Reactivate account
  provider.isDeactivated = false;
  provider.deactivatedAt = null;
  provider.lastLogin = new Date();

  await provider.save();

  // Generate tokens using the same method as login
  const id = provider._id.toString();
  const tokens = await tokenService.generateAuthTokens({ id, actor: 'provider' });

  // Sanitize user object (remove sensitive data)
  const sanitizedUser = sanitizeUser(provider);

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Account reactivated successfully. You can now log in.',
    data: {
      user: sanitizedUser,
      tokens,
    },
  });
});

// Permanent deletion of accounts deactivated for 6+ months (cron job)
const permanentDeleteDeactivatedAccounts = catchAsync(async (req, res) => {
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

  const result = await dB.providers.deleteMany({
    isDeactivated: true,
    deactivatedAt: { $lt: sixMonthsAgo },
  });

  res.status(httpStatus.OK).json({
    success: true,
    message: `Permanently deleted ${result.deletedCount} accounts`,
    data: {
      deletedCount: result.deletedCount,
    },
  });
});


const getProviderProfile = catchAsync(async (req, res) => {
  const { providerId } = req.params;

  const provider = await dB.providers
    .findById(providerId)
    .select('-password -verificationToken -verificationTokenExpiresAt -deletedAt')
    .lean();

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  if (provider.isBanned || provider.isDeleted) {
    throw new ApiError(httpStatus.FORBIDDEN, 'This provider is not available');
  }

  // Get average rating
  let avgRating = 0;
  let reviewCount = 0;

  try {
    const ratingResult = await dB.reviews.aggregate([
      { $match: { target: provider._id, targetType: 'provider' } },
      { $group: { _id: null, avg: { $avg: '$overall' }, count: { $sum: 1 } } },
    ]);

    if (ratingResult.length > 0) {
      avgRating = ratingResult[0].avg || 0;
      reviewCount = ratingResult[0].count || 0;
    }
  } catch (error) {
    console.log('Error calculating rating:', error);
  }

  // Get services count
  const servicesCount = await dB.services.countDocuments({ 
    provider: providerId, 
    isActive: true 
  });

  // Get jobs completed (from bookings)
  let jobsCompleted = 0;
  try {
    jobsCompleted = await dB.bookings.countDocuments({
      provider: providerId,
      status: 'completed',
    });
  } catch (error) {
    console.log('Error counting jobs:', error);
  }

  // Format response
  const formattedProvider = {
    _id: provider._id,
    firstName: provider.firstName,
    lastName: provider.lastName,
    fullName: provider.fullName,
    email: provider.email,
    phoneNumber: provider.phoneNumber,
    accountType: provider.accountType,
    service: provider.service || {},
    location: provider.location || {},
    profile: provider.profile || {},
    business: provider.business || {},
    bankDetails: provider.bankDetails || {},
    kycStatus: provider.kycStatus,
    subscription: provider.subscription || {},
    isVerifiedPro: provider.isVerifiedPro || false,
    isEmailVerified: provider.isEmailVerified || false,
    isActive: provider.subscription?.isActive || false,
    featuredUntil: provider.featuredUntil,
    avgRating: Math.round(avgRating * 10) / 10,
    reviewCount: reviewCount,
    servicesCount: servicesCount,
    jobsCompleted: jobsCompleted,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };

  res.json({
    success: true,
    provider: formattedProvider,
  });
});

// ============================================
// GET PROVIDER SERVICES
// ============================================
const getProviderServices = catchAsync(async (req, res) => {
  const { providerId } = req.params;

  const provider = await dB.providers.findById(providerId);
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const services = await dB.services
    .find({ provider: providerId, isActive: true })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    services: services,
  });
});

// ============================================
// GET PROVIDER REVIEWS
// ============================================
const getProviderReviews = catchAsync(async (req, res) => {
  const { providerId } = req.params;
  const { page = 0, limit = 10 } = req.query;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const provider = await dB.providers.findById(providerId);
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const [reviews, total] = await Promise.all([
    dB.reviews
      .find({ target: providerId, targetType: 'provider' })
      .sort({ createdAt: -1 })
      .skip(safePage * safeLimit)
      .limit(safeLimit)
      .lean(),
    dB.reviews.countDocuments({ target: providerId, targetType: 'provider' }),
  ]);

  // Format reviews
  const formattedReviews = reviews.map(review => ({
    _id: review._id,
    reviewer: review.reviewer,
    reviewerName: review.reviewerName || 'Anonymous',
    reviewerAvatar: review.reviewerAvatar || null,
    overall: review.overall || 0,
    categories: review.categories || {},
    text: review.text || '',
    isVerified: review.isVerified || false,
    createdAt: review.createdAt,
  }));

  res.json({
    success: true,
    reviews: formattedReviews,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: total,
      pages: Math.ceil(total / safeLimit),
    },
  });
});


// ============================================
// GET PROVIDER PROFILE
// ============================================
const getProviderProfilePublic = catchAsync(async (req, res) => {
  const { providerId } = req.params;

  const provider = await dB.providers
    .findById(providerId)
    .select('-password -verificationToken -verificationTokenExpiresAt -deletedAt')
    .lean();

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  if (provider.isBanned || provider.isDeleted) {
    throw new ApiError(httpStatus.FORBIDDEN, 'This provider is not available');
  }

  // Get average rating
  let avgRating = 0;
  let reviewCount = 0;

  try {
    const ratingResult = await dB.reviews.aggregate([
      { $match: { target: provider._id, targetType: 'provider' } },
      { $group: { _id: null, avg: { $avg: '$overall' }, count: { $sum: 1 } } },
    ]);

    if (ratingResult.length > 0) {
      avgRating = ratingResult[0].avg || 0;
      reviewCount = ratingResult[0].count || 0;
    }
  } catch (error) {
    console.log('Error calculating rating:', error);
  }

  // Get services count
  const servicesCount = await dB.services.countDocuments({ 
    provider: providerId, 
    isActive: true 
  });

  // Get jobs completed (from bookings)
  let jobsCompleted = 0;
  try {
    jobsCompleted = await dB.bookings.countDocuments({
      provider: providerId,
      status: 'completed',
    });
  } catch (error) {
    console.log('Error counting jobs:', error);
  }

  // Format response
  const formattedProvider = {
    _id: provider._id,
    firstName: provider.firstName,
    lastName: provider.lastName,
    fullName: provider.fullName,
    email: provider.email,
    phoneNumber: provider.phoneNumber,
    accountType: provider.accountType,
    service: provider.service || {},
    location: provider.location || {},
    profile: provider.profile || {},
    business: provider.business || {},
    bankDetails: provider.bankDetails || {},
    kycStatus: provider.kycStatus,
    subscription: provider.subscription || {},
    isVerifiedPro: provider.isVerifiedPro || false,
    isEmailVerified: provider.isEmailVerified || false,
    isActive: provider.subscription?.isActive || false,
    featuredUntil: provider.featuredUntil,
    avgRating: Math.round(avgRating * 10) / 10,
    reviewCount: reviewCount,
    servicesCount: servicesCount,
    jobsCompleted: jobsCompleted,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };

  res.json({
    success: true,
    provider: formattedProvider,
  });
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
  getSubscriptionPlans,
  manageSubscription,
  getMyPromotions,
  purchasePromotion,
  deactivateAccount,
  reactivateAccount,
  permanentDeleteDeactivatedAccounts,
  getProviderServices,
  getProviderProfilePublic,
  getProviderReviews,

  // ─── Enterprise team management ─────────────────────────────────────────
  // listTeamMembers: GET /v1/provider/team-members
  // addTeamMember:   POST /v1/provider/team-members
  // assignTeamMember: PUT /v1/provider/team-members/:id/assign
  // removeTeamMember: DELETE /v1/provider/team-members/:id
  listTeamMembers: catchAsync(async (req, res) => {
    const providerId = req.user._id;

    // Only Premium/Enterprise plans can use team management. Business
    // accounts with an active subscription always qualify; check is
    // case-insensitive so 'Enterprise' also passes.
    const selectedPlan = String(req.user.subscription?.selectedPlan || '').toLowerCase();
    const accountType = String(req.user.accountType || '').toLowerCase();
    const subscribed = req.user.subscription?.isActive !== false;
    const isTeamPlan =
      (accountType === 'business' && subscribed) ||
      ['premium', 'enterprise'].includes(selectedPlan);
    if (!isTeamPlan) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Team management is only available on Premium/Enterprise plans.');
    }

    const members = await dB.teamMembers
      .find({ provider: providerId })
      .sort({ createdAt: -1 });

    res.json({ members });
  }),

  addTeamMember: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { fullName, email, phone, customerIds } = req.body;

    if (!fullName || !email) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'fullName and email are required.');
    }

    // Only Premium/Enterprise plans can use team management (same rule as list)
    const selectedPlan = String(req.user.subscription?.selectedPlan || '').toLowerCase();
    const accountType = String(req.user.accountType || '').toLowerCase();
    const subscribed = req.user.subscription?.isActive !== false;
    const isTeamPlan =
      (accountType === 'business' && subscribed) ||
      ['premium', 'enterprise'].includes(selectedPlan);
    if (!isTeamPlan) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Team management is only available on Premium/Enterprise plans.');
    }

    // Check if a provider with this email already exists
    const existing = await dB.providers.findOne({ email: email.toLowerCase() });
    if (existing && existing._id.toString() !== providerId.toString()) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'A provider with this email already exists.');
    }

    // Generate a temp password for the employee — the owner sees it and
    // shares it with them (email + this password is how they log in).
    const tempPassword = `ServeNaija_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Create the employee as a sub-provider account
    const member = await dB.teamMembers.create({
      provider: providerId,
      fullName,
      email: email.toLowerCase(),
      phone: phone || '',
      tempPassword,
      mustChangePassword: req.body.mustChangePassword !== false,
      customerIds: customerIds || [],
      permissions: {
        wallet: false,
        promote: false,
        jobs: false,
        marketplace: false,
        createService: false,
        chat: false,
        ...(req.body.permissions || {}),
      },
      status: 'active',
    });

    res.status(httpStatus.CREATED).json({ member, tempPassword });
  }),

  // Owner updates what a member can see/do (wallet, promote, jobs, marketplace,
  // create service, chat)
  updateTeamMemberPermissions: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { id } = req.params;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'permissions object is required.');
    }

    const member = await dB.teamMembers.findOne({ _id: id, provider: providerId });
    if (!member) throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found.');

    const allowed = ['wallet', 'promote', 'jobs', 'marketplace', 'createService', 'chat'];
    for (const key of allowed) {
      if (key in permissions) member.permissions[key] = Boolean(permissions[key]);
    }
    await member.save();

    res.json({ member, message: 'Permissions updated.' });
  }),

  // Owner assigns the member to specific jobs (bookings)
  assignTeamMemberJobs: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { id } = req.params;
    const { bookingIds } = req.body;

    if (!Array.isArray(bookingIds)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'bookingIds must be an array of booking IDs.');
    }

    const member = await dB.teamMembers.findOne({ _id: id, provider: providerId });
    if (!member) throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found.');

    member.bookingIds = bookingIds;
    await member.save();

    res.json({ member, message: 'Job assignments updated.' });
  }),

  // Owner resets a member's password — returns the NEW password once so the
  // owner can see it and share it with the employee.
  resetTeamMemberPassword: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { id } = req.params;
    const { mustChangePassword } = req.body || {};

    const member = await dB.teamMembers.findOne({ _id: id, provider: providerId });
    if (!member) throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found.');

    const tempPassword = `ServeNaija_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    member.tempPassword = tempPassword;
    if (typeof mustChangePassword === 'boolean') member.mustChangePassword = mustChangePassword;
    await member.save();

    res.json({ member, tempPassword, message: 'Password reset. Share the new password with the employee.' });
  }),

  // Owner flips the first-login reset requirement on/off for a member.
  setTeamMemberPasswordPolicy: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { id } = req.params;
    const { mustChangePassword } = req.body || {};

    if (typeof mustChangePassword !== 'boolean') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'mustChangePassword (true/false) is required.');
    }

    const member = await dB.teamMembers.findOne({ _id: id, provider: providerId });
    if (!member) throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found.');

    member.mustChangePassword = mustChangePassword;
    await member.save();

    res.json({ member, message: mustChangePassword ? 'Member must reset password on next login.' : 'First-login reset requirement removed.' });
  }),

  // Owner activates/deactivates a member account (terminate / restore access).
  setTeamMemberStatus: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { id } = req.params;
    const { status } = req.body || {};

    if (!['active', 'inactive'].includes(status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "status must be 'active' or 'inactive'.");
    }

    const member = await dB.teamMembers.findOne({ _id: id, provider: providerId });
    if (!member) throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found.');

    member.status = status;
    await member.save();

    res.json({ member, message: status === 'active' ? 'Account reactivated.' : 'Account deactivated — they can no longer log in.' });
  }),
  // including which customers they chatted with and what they said.
  // Owner reviews everything a member did since their account was created —
  // including which customers they chatted with and what they said.
  getTeamMemberActivity: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { id } = req.params;

    const member = await dB.teamMembers.findOne({ _id: id, provider: providerId });
    if (!member) throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found.');

    const logs = await dB.activityLogs
      .find({ teamMember: member._id })
      .sort({ createdAt: -1 })
      .limit(300);

    // Enrich chat actions with the customer they were chatting with
    const activity = await Promise.all(
      logs.map(async (log) => {
        const entry = log.toObject ? log.toObject() : log;
        if (entry.action === 'chat.message' && entry.meta?.conversationId) {
          try {
            const conv = await dB.conversations.findById(entry.meta.conversationId).lean();
            if (conv) {
              const customer = (conv.participants || []).find((p) => p.actorType === 'customer');
              entry.customer = customer
                ? { name: customer.name || 'Customer', userId: customer.userId }
                : null;
            }
          } catch (_) { /* ignore */ }
        }
        return entry;
      })
    );

    res.json({
      member,
      since: member.createdAt,
      totalActions: logs.length,
      activity,
    });
  }),

  assignTeamMember: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { id } = req.params;
    const { customerIds } = req.body;

    if (!Array.isArray(customerIds)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'customerIds must be an array of provider IDs.');
    }

    // Same team-plan rule as list/add
    const selectedPlan = String(req.user.subscription?.selectedPlan || '').toLowerCase();
    const accountType = String(req.user.accountType || '').toLowerCase();
    const subscribed = req.user.subscription?.isActive !== false;
    const isTeamPlan =
      (accountType === 'business' && subscribed) ||
      ['premium', 'enterprise'].includes(selectedPlan);
    if (!isTeamPlan) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Team management is only available on Premium/Enterprise plans.');
    }

    const member = await dB.teamMembers.findOne({ _id: id, provider: providerId });
    if (!member) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found.');
    }

    member.customerIds = customerIds;
    await member.save();

    res.json({ member });
  }),

  removeTeamMember: catchAsync(async (req, res) => {
    const providerId = req.user._id;
    const { id } = req.params;

    // Same team-plan rule as list/add
    const selectedPlan = String(req.user.subscription?.selectedPlan || '').toLowerCase();
    const accountType = String(req.user.accountType || '').toLowerCase();
    const subscribed = req.user.subscription?.isActive !== false;
    const isTeamPlan =
      (accountType === 'business' && subscribed) ||
      ['premium', 'enterprise'].includes(selectedPlan);
    if (!isTeamPlan) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Team management is only available on Premium/Enterprise plans.');
    }

    const member = await dB.teamMembers.findOneAndDelete({ _id: id, provider: providerId });
    if (!member) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found.');
    }

    res.json({ message: 'Team member removed.' });
  }),
};
