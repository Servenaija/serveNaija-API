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

// ============================================
// GET NEAR ME PROVIDERS (Top Rated - Public)
// ============================================
const getNearMeProviders = catchAsync(async (req, res) => {
  const { latitude, longitude, limit = 20, page = 0, category } = req.query;

  if (!latitude || !longitude) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Latitude and longitude are required');
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  const safePage = Math.max(0, Number(page));

  const matchConditions = {
    accountType: 'provider',
    isBanned: false,
    isDeactivated: false,
    isDeleted: false,
    'location.coordinates.latitude': { $ne: null, $exists: true },
    'location.coordinates.longitude': { $ne: null, $exists: true },
  };

  if (category && category.trim()) {
    matchConditions['service.category'] = { $regex: new RegExp(category.trim(), 'i') };
  }

  const allProviders = await dB.providers
    .find(matchConditions)
    .select('_id firstName lastName fullName email phoneNumber profile service location isVerifiedPro')
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

  // REMOVE the 50km filter - just sort by distance
  const filtered = providersWithDistance
    .filter(p => p.distance !== null)
    .sort((a, b) => a.distance - b.distance);

  const paginated = filtered.slice(safePage * safeLimit, (safePage + 1) * safeLimit);

  res.json({
    success: true,
    data: {
      providers: paginated,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        pages: Math.ceil(filtered.length / safeLimit),
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
    accountType: 'business',
    isBanned: false,
    isDeactivated: false,
    isDeleted: false,
    'location.coordinates.latitude': { $ne: null, $exists: true },
    'location.coordinates.longitude': { $ne: null, $exists: true },
  };

  if (category && category.trim()) {
    matchConditions['service.category'] = { $regex: new RegExp(category.trim(), 'i') };
  }

  const allBusinesses = await dB.providers
    .find(matchConditions)
    .select('_id firstName lastName fullName email phoneNumber profile service business location isVerifiedPro')
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

  const filtered = businessesWithDistance
    .filter(p => p.distance !== null && p.distance <= 50)
    .sort((a, b) => a.distance - b.distance);

  const paginated = filtered.slice(safePage * safeLimit, (safePage + 1) * safeLimit);

  res.json({
    success: true,
    data: {
      businesses: paginated,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        pages: Math.ceil(filtered.length / safeLimit),
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

  const categoriesWithCount = await Promise.all(
    categories.map(async (category) => {
      const count = await dB.providers.countDocuments({
        'service.category': category.name,
        accountType: 'provider',
        isBanned: false,
        isDeactivated: false,
        isDeleted: false,
      });

      return {
        _id: category._id,
        name: category.name,
        description: category.description,
        icon: category.icon || 'briefcase-outline',
        color: category.color || '#165B43',
        providerCount: count,
      };
    })
  );

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
  const { limit = 20, page = 0, latitude, longitude } = req.query;

  if (!category || !category.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Category is required');
  }

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

  // Build match conditions using the exact category name from DB
  const matchConditions = {
    accountType: 'provider',
    'service.category': categoryExists.name,
    isBanned: false,
    isDeactivated: false,
    isDeleted: false,
  };

  // Only filter by location if coordinates are provided
  if (latitude && longitude) {
    matchConditions['location.coordinates.latitude'] = { $ne: null, $exists: true };
    matchConditions['location.coordinates.longitude'] = { $ne: null, $exists: true };
  }

  let providers = await dB.providers
    .find(matchConditions)
    .select('_id firstName lastName fullName email phoneNumber profile service location isVerifiedPro')
    .lean();

  // Calculate distance if coordinates provided
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
    
    // Sort by distance (closest first)
    providers.sort((a, b) => {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
  }

  // Get total count
  const countResult = await dB.providers.countDocuments(matchConditions);

  // Paginate
  const paginated = providers.slice(safePage * safeLimit, (safePage + 1) * safeLimit);

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
      providers: paginated.map(p => ({ 
        ...p, 
        avgRating: 0, 
        reviewCount: 0 
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: countResult,
        pages: Math.ceil(countResult / safeLimit),
      },
    },
  });
});



module.exports = {
  getNearMeProviders,
  getNearMeBusinesses,
  getCategories,
  getProvidersByCategory,
};