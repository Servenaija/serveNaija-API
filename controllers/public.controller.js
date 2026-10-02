// controllers/public.controller.js
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

// ============================================
// HELPER: Calculate distance between two coordinates
// ============================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const VALID_ACCOUNT_TYPES = ['provider', 'business'];

/**
 * Normalizes the `type` query param used by the discovery endpoints.
 * Falls back to `fallback` for anything missing or unrecognised, so a
 * bad/hostile value can never widen the result set.
 */
function normalizeAccountType(value, fallback = 'provider') {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_ACCOUNT_TYPES.includes(normalized) ? normalized : fallback;
}

/**
 * Conditions every publicly discoverable account must satisfy.
 */
const PUBLICLY_VISIBLE = {
  isBanned: false,
  isDeactivated: false,
  isDeleted: false,
  kycStatus: 'approved',
};

// ============================================
// GET NEAR ME PROVIDERS (Top Rated - Public)
// ============================================
const getNearMeProviders = catchAsync(async (req, res) => {
  const { latitude, longitude, limit = 20, page = 0, category, state } = req.query;

  if (!latitude || !longitude) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Latitude and longitude are required');
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  const safePage = Math.max(0, Number(page));

  const matchConditions = {
    ...PUBLICLY_VISIBLE,
    accountType: 'provider',
  };

  if (category && category.trim()) {
    matchConditions['service.category'] = { $regex: new RegExp(category.trim(), 'i') };
  }

  const allProviders = await dB.providers
    .find(matchConditions)
    .select('_id firstName lastName fullName email phoneNumber profile service location isVerifiedPro kycStatus featuredUntil')
    .lean();

  const providersWithDistance = allProviders.map(provider => {
    const providerLat = provider.location?.coordinates?.latitude;
    const providerLng = provider.location?.coordinates?.longitude;
    
    let distance = null;
    if (providerLat != null && providerLng != null) {
      distance = calculateDistance(lat, lng, providerLat, providerLng);
    }
    
    return {
      ...provider,
      distance: distance,
      avgRating: 0,
      reviewCount: 0,
    };
  });

  // Ranking: paid promotions outrank everything else.
  // 1. Featured Providers (active featuredUntil) above normal subscription
  //    providers — within each tier, same-state providers come before
  //    providers from other states, then nearest first, then by name.
  const now = new Date();
  const viewerState = (state || '').trim().toLowerCase();
  const isFeatured = (p) => p.featuredUntil && new Date(p.featuredUntil) > now;
  const isSameState = (p) =>
    viewerState &&
    (p.location?.state || '').trim().toLowerCase().includes(viewerState);
  providersWithDistance.sort((a, b) => {
    const fa = isFeatured(a) ? 0 : 1;
    const fb = isFeatured(b) ? 0 : 1;
    if (fa !== fb) return fa - fb;                      // featured > normal
    const sa = isSameState(a) ? 0 : 1;
    const sb = isSameState(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;                      // same state first
    // If both have coordinates, sort by distance
    if (a.distance !== null && b.distance !== null) {
      return a.distance - b.distance;
    }
    // If only a has coordinates, a comes first
    if (a.distance !== null) return -1;
    // If only b has coordinates, b comes first
    if (b.distance !== null) return 1;
    // If neither has coordinates, sort by name
    return (a.fullName || a.email || '').localeCompare(b.fullName || b.email || '');
  });

  const paginated = providersWithDistance.slice(safePage * safeLimit, (safePage + 1) * safeLimit);

  res.json({
    success: true,
    data: {
      providers: paginated,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: providersWithDistance.length,
        pages: Math.ceil(providersWithDistance.length / safeLimit),
      },
    },
  });
});

// ============================================
// GET NEAR ME BUSINESSES (Top Rated - Public)
// ============================================
const getNearMeBusinesses = catchAsync(async (req, res) => {
  const { latitude, longitude, limit = 20, page = 0, category } = req.query;

  if (!latitude || !longitude) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Latitude and longitude are required');
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  const safePage = Math.max(0, Number(page));

  const matchConditions = {
    ...PUBLICLY_VISIBLE,
    accountType: 'business',
  };

  if (category && category.trim()) {
    matchConditions['service.category'] = { $regex: new RegExp(category.trim(), 'i') };
  }

  const allBusinesses = await dB.providers
    .find(matchConditions)
    .select('_id firstName lastName fullName email phoneNumber profile service business location isVerifiedPro kycStatus featuredUntil')
    .lean();

  const businessesWithDistance = allBusinesses.map(business => {
    const businessLat = business.location?.coordinates?.latitude;
    const businessLng = business.location?.coordinates?.longitude;
    
    let distance = null;
    if (businessLat != null && businessLng != null) {
      distance = calculateDistance(lat, lng, businessLat, businessLng);
    }
    
    return {
      ...business,
      distance: distance,
      avgRating: 0,
      reviewCount: 0,
      businessName: business.service?.businessName || business.business?.businessName || business.fullName,
    };
  });

  // Ranking: paid promotions outrank everything else.
  // 1. Featured providers/businesses (active featuredUntil) above normal
  //    subscription accounts — within each tier, same-state first, then
  //    nearest, then by name.
  const now = new Date();
  const isFeaturedBiz = (b) => b.featuredUntil && new Date(b.featuredUntil) > now;
  businessesWithDistance.sort((a, b) => {
    const fa = isFeaturedBiz(a) ? 0 : 1;
    const fb = isFeaturedBiz(b) ? 0 : 1;
    if (fa !== fb) return fa - fb;                      // featured > normal
    // If both have coordinates, sort by distance
    if (a.distance !== null && b.distance !== null) {
      return a.distance - b.distance;
    }
    if (a.distance !== null) return -1;
    if (b.distance !== null) return 1;
    return (a.businessName || a.fullName || a.email || '').localeCompare(b.businessName || b.fullName || b.email || '');
  });

  const paginated = businessesWithDistance.slice(safePage * safeLimit, (safePage + 1) * safeLimit);

  res.json({
    success: true,
    data: {
      businesses: paginated,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: businessesWithDistance.length,
        pages: Math.ceil(businessesWithDistance.length / safeLimit),
      },
    },
  });
});

// ============================================
// GET ALL CATEGORIES (Public)
// ============================================
const getCategories = catchAsync(async (req, res) => {
  const categories = await dB.categories
    .find({ isActive: true })
    .select('name description icon color')
    .sort({ name: 1 });

  /**
   * Count providers AND businesses per category in a single aggregation.
   *
   * Previously this only counted `accountType: 'provider'`, so the
   * badge on a category under-reported the number of listings a
   * customer would actually find (businesses were invisible here
   * even though they are listed in their own tab).
   */
  const countRows = await dB.providers.aggregate([
    { $match: PUBLICLY_VISIBLE },
    {
      $group: {
        _id: { category: '$service.category', accountType: '$accountType' },
        count: { $sum: 1 },
      },
    },
  ]);

  const countBy = new Map(
    countRows.map((row) => [
      `${row._id.category}|${row._id.accountType}`,
      row.count,
    ])
  );

  const countFor = (categoryName, accountType) =>
    countBy.get(`${categoryName}|${accountType}`) || 0;

  const categoriesWithCount = categories.map((category) => {
    const providerCount = countFor(category.name, 'provider');
    const businessCount = countFor(category.name, 'business');

    return {
      _id: category._id,
      name: category.name,
      description: category.description,
      icon: category.icon || 'briefcase-outline',
      color: category.color || '#165B43',
      providerCount,
      businessCount,
      totalCount: providerCount + businessCount,
    };
  });

  res.json({
    success: true,
    data: categoriesWithCount,
  });
});

// ============================================
// GET PROVIDERS BY CATEGORY (Public)
// ============================================
const getProvidersByCategory = catchAsync(async (req, res) => {
  const { category } = req.params;
  const { limit = 20, page = 0, latitude, longitude, state, type } = req.query;

  if (!category || !category.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Category is required');
  }

  /**
   * `type=business` lists business accounts, `type=provider` (the
   * default) lists individual providers. Without this the query was
   * hardcoded to `accountType: 'provider'`, so business accounts that
   * had completed onboarding, KYC and payment were never returned by
   * the customer app's category browse.
   */
  const accountType = normalizeAccountType(type, 'provider');

  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  const safePage = Math.max(0, Number(page));

  // Check if category exists (case insensitive)
  const categoryExists = await dB.categories.findOne({
    name: { $regex: new RegExp('^' + category.trim() + '$', 'i') },
    isActive: true,
  });

  if (!categoryExists) {
    return res.json({
      success: true,
      data: {
        category: {
          name: category,
          description: 'Category not found',
          icon: 'briefcase-outline',
          color: '#165B43',
        },
        accountType,
        providers: [],
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          pages: 0,
        },
      },
    });
  }

  // Build match conditions using the exact category name from DB.
  // Only KYC-approved (completed) accounts are publicly visible.
  const matchConditions = {
    ...PUBLICLY_VISIBLE,
    accountType,
    'service.category': categoryExists.name,
  };

  // Business listings expose the `business` block too, matching
  // /near-me/business so both tabs render from the same shape.
  const fields =
    accountType === 'business'
      ? '_id firstName lastName fullName email phoneNumber profile service business location isVerifiedPro kycStatus featuredUntil'
      : '_id firstName lastName fullName email phoneNumber profile service location isVerifiedPro kycStatus featuredUntil';

  // Get ALL accounts in this category (don't filter out those without coordinates)
  let providers = await dB.providers
    .find(matchConditions)
    .select(fields)
    .lean();

  // If coordinates provided, calculate distance and sort
  if (latitude && longitude) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    providers = providers.map(provider => {
      const providerLat = provider.location?.coordinates?.latitude;
      const providerLng = provider.location?.coordinates?.longitude;
      
      let distance = null;
      if (providerLat != null && providerLng != null) {
        distance = calculateDistance(lat, lng, providerLat, providerLng);
      }
      
      return { ...provider, distance };
    });
    
    // Ranking: featured providers (active promotion) first, then same-state,
    // then nearest — paid promotions outrank normal subscription listings.
    const nowDate = new Date();
    const viewerState = (state || '').trim().toLowerCase();
    const featured = (p) => p.featuredUntil && new Date(p.featuredUntil) > nowDate;
    const sameState = (p) =>
      viewerState && (p.location?.state || '').trim().toLowerCase().includes(viewerState);
    providers.sort((a, b) => {
      const fa = featured(a) ? 0 : 1;
      const fb = featured(b) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const sa = sameState(a) ? 0 : 1;
      const sb = sameState(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      // If both have coordinates, sort by distance
      if (a.distance !== null && b.distance !== null) {
        return a.distance - b.distance;
      }
      // If only a has coordinates, a comes first
      if (a.distance !== null) return -1;
      // If only b has coordinates, b comes first
      if (b.distance !== null) return 1;
      // If neither has coordinates, sort by name
      return (a.fullName || a.email || '').localeCompare(b.fullName || b.email || '');
    });
  }

  // Get total count
  const total = providers.length;

  // Paginate
  const paginated = providers.slice(safePage * safeLimit, (safePage * safeLimit) + safeLimit);

  /**
   * Business accounts register under a business name, so expose it
   * explicitly for the client (mirrors the mapping done by
   * /near-me/business) instead of making it fall back to the
   * account holder's personal fullName.
   */
  const decorate = (p) => ({
    ...p,
    ...(accountType === 'business'
      ? { businessName: p.service?.businessName || p.business?.businessName || p.fullName }
      : {}),
  });

  res.json({
    success: true,
    data: {
      category: {
        _id: categoryExists._id,
        name: categoryExists.name,
        description: categoryExists.description,
        icon: categoryExists.icon || 'briefcase-outline',
        color: categoryExists.color || '#165B43',
      },
      accountType,
      providers: paginated.map(p => ({
        ...decorate(p),
        avgRating: 0,
        reviewCount: 0
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: total,
        pages: Math.ceil(total / safeLimit),
      },
    },
  });
});

const getProviderCompletedJobs = catchAsync(async (req, res) => {
  const { providerId } = req.params;

  const provider = await dB.providers.findById(providerId).select('_id fullName');
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const completedJobs = await dB.bookings.find({
    provider: providerId,
    status: 'completed',
  })
  .populate('customer', 'fullName phoneNumber')
  .sort({ completedAt: -1 })
  .lean();

  const formattedJobs = completedJobs.map((job) => ({
    _id: job._id,
    service: {
      name: job.service?.name || 'Service',
      price: job.service?.price || 0,
      category: job.service?.category || '',
    },
    customer: job.customer ? {
      _id: job.customer._id,
      fullName: job.customer.fullName,
      phoneNumber: job.customer.phoneNumber,
    } : null,
    scheduledDate: job.scheduledDate,
    timeSlot: job.timeSlot,
    address: job.address,
    totalAmount: job.totalAmount,
    serviceFee: job.serviceFee,
    platformFee: job.platformFee,
    paymentStatus: job.paymentStatus,
    completionPhotos: job.completionPhotos || { before: [], after: [] },
    completionNotes: job.completionNotes || '',
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    rating: job.rating || null,
  }));

  res.status(httpStatus.OK).json({
    success: true,
    count: formattedJobs.length,
    jobs: formattedJobs,
  });
});


module.exports = {
  getNearMeProviders,
  getNearMeBusinesses,
  getCategories,
  getProvidersByCategory,
  getProviderCompletedJobs
};