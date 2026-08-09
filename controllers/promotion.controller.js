const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

const FEATURED_PRICES = {
  fp: { amount: 3000, billingCycle: 'monthly' }, // Featured Provider
  hp: { amount: 25000, billingCycle: 'monthly' }, // Homepage Feature
};

const AD_PRICES = {
  local: { amount: 10000, billingCycle: 'monthly' },
  state: { amount: 50000, billingCycle: 'monthly' },
  nation: { amount: 150000, billingCycle: 'monthly' },
};

// ─── FEATURED LISTINGS ────────────────────
const purchaseFeatured = catchAsync(async (req, res) => {
  const { plan, paystackReference } = req.body;

  if (!FEATURED_PRICES[plan]) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid featured plan. Valid: fp, hp`);
  }

  // Check if user already has an active featured listing of the SAME plan
  const existingFeatured = await dB.promotions.findOne({
    provider: req.user._id,
    type: 'featured',
    plan: plan, // Check specific plan
    status: 'active',
    endDate: { $gt: new Date() }
  });

  if (existingFeatured) {
    throw new ApiError(httpStatus.BAD_REQUEST, `You already have an active ${plan === 'fp' ? 'Featured Provider' : 'Homepage Feature'} listing. It will expire on ${new Date(existingFeatured.endDate).toLocaleDateString()}`);
  }

  const planMeta = FEATURED_PRICES[plan];
  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 1);

  const promotion = await dB.promotions.create({
    provider: req.user._id,
    plan,
    type: 'featured',
    amount: planMeta.amount,
    billingCycle: planMeta.billingCycle,
    paystackReference,
    startDate: now,
    endDate,
    status: 'active',
  });

  // Update provider featuredUntil
  await dB.providers.findByIdAndUpdate(req.user._id, { featuredUntil: endDate });

  res.status(httpStatus.CREATED).json({ promotion, message: 'Featured listing activated.' });
});

const getMyFeatured = catchAsync(async (req, res) => {
  const promotions = await dB.promotions.find({
    provider: req.user._id,
    type: 'featured',
    status: 'active',
    endDate: { $gt: new Date() }
  }).sort({ createdAt: -1 });
  
  res.json({ promotions });
});

const getFeaturedProviders = catchAsync(async (req, res) => {
  const { limit = 10, category } = req.query;
  const query = {
    isBanned: false,
    featuredUntil: { $gt: new Date() }
  };
  
  if (category) query['service.category'] = category;
  
  const providers = await dB.providers
    .find(query)
    .select('fullName profile.photo service.category location.city rating featuredUntil')
    .sort({ featuredUntil: -1 })
    .limit(parseInt(limit));
  
  res.json({ providers });
});

// ─── ADVERTISING CAMPAIGNS ────────────────
const purchaseAd = catchAsync(async (req, res) => {
  const { plan, paystackReference } = req.body;

  if (!AD_PRICES[plan]) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid ad plan. Valid: local, state, nation`);
  }

  // Check if user already has an active ad of the SAME plan
  const existingAd = await dB.promotions.findOne({
    provider: req.user._id,
    type: 'ad',
    plan: plan,
    status: 'active',
    endDate: { $gt: new Date() }
  });

  if (existingAd) {
    throw new ApiError(httpStatus.BAD_REQUEST, `You already have an active ${plan} ad campaign. It will expire on ${new Date(existingAd.endDate).toLocaleDateString()}`);
  }

  const planMeta = AD_PRICES[plan];
  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 1);

  const promotion = await dB.promotions.create({
    provider: req.user._id,
    plan,
    type: 'ad',
    amount: planMeta.amount,
    billingCycle: planMeta.billingCycle,
    paystackReference,
    startDate: now,
    endDate,
    status: 'active',
  });

  res.status(httpStatus.CREATED).json({ promotion, message: 'Ad campaign activated.' });
});

const getMyAds = catchAsync(async (req, res) => {
  const promotions = await dB.promotions.find({
    provider: req.user._id,
    type: 'ad',
    status: 'active',
    endDate: { $gt: new Date() }
  }).sort({ createdAt: -1 });
  
  res.json({ promotions });
});

const getActiveAds = catchAsync(async (req, res) => {
  const { type, limit = 20 } = req.query;
  
  const query = {
    type: 'ad',
    status: 'active',
    endDate: { $gt: new Date() }
  };
  
  if (type) query.plan = type;
  
  const ads = await dB.promotions
    .find(query)
    .populate('provider', 'fullName profile.photo service.category location.city')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));
  
  res.json({ ads });
});

module.exports = {
  purchaseFeatured,
  getMyFeatured,
  getFeaturedProviders,
  purchaseAd,
  getMyAds,
  getActiveAds,
};