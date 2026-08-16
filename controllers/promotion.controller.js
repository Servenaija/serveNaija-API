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


const getActiveAdss = catchAsync(async (req, res) => {
  const { type, limit = 20, page = 0, latitude, longitude, radius = 50 } = req.query;
  
  const query = {
    type: 'ad',
    status: 'active',
    endDate: { $gt: new Date() }
  };
  
  if (type) query.plan = type;
  
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  const safePage = Math.max(0, Number(page));
  
  // Build pipeline with location sorting if coordinates provided
  let pipeline = [];
  
  // Match active ads
  pipeline.push({
    $match: query
  });
  
  // Lookup provider details
  pipeline.push({
    $lookup: {
      from: 'providers',
      localField: 'provider',
      foreignField: '_id',
      as: 'providerData'
    }
  });
  
  pipeline.push({
    $unwind: '$providerData'
  });
  
  // Filter providers that are not banned
  pipeline.push({
    $match: {
      'providerData.isBanned': false
    }
  });
  
  // Add location fields if coordinates provided
  if (latitude && longitude) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    pipeline.push({
      $addFields: {
        location: {
          type: 'Point',
          coordinates: [
            { $ifNull: ['$providerData.location.coordinates.longitude', 0] },
            { $ifNull: ['$providerData.location.coordinates.latitude', 0] }
          ]
        }
      }
    });
    
    pipeline.push({
      $addFields: {
        distance: {
          $multiply: [
            6371, // Earth's radius in km
            {
              $acos: {
                $min: [
                  1,
                  {
                    $add: [
                      { $multiply: [{ $sin: { $degreesToRadians: lat } }, { $sin: { $degreesToRadians: { $arrayElemAt: ['$location.coordinates', 1] } } }] },
                      { $multiply: [{ $cos: { $degreesToRadians: lat } }, { $cos: { $degreesToRadians: { $arrayElemAt: ['$location.coordinates', 1] } } }, { $cos: { $subtract: [lng, { $arrayElemAt: ['$location.coordinates', 0] }] } }] }
                    ]
                  }
                ]
              }
            }
          ]
        }
      }
    });
    
    // Filter by radius
    pipeline.push({
      $match: {
        distance: { $lte: parseFloat(radius) }
      }
    });
  }
  
  // Get total count before pagination
  const countPipeline = [...pipeline];
  countPipeline.push({ $count: 'total' });
  
  // Add sorting and pagination
  if (latitude && longitude) {
    pipeline.push({ $sort: { distance: 1 } });
  } else {
    pipeline.push({ $sort: { createdAt: -1 } });
  }
  
  pipeline.push({ $skip: safePage * safeLimit });
  pipeline.push({ $limit: safeLimit });
  
  // Execute queries
  const [ads, countResult] = await Promise.all([
    dB.promotions.aggregate(pipeline),
    dB.promotions.aggregate(countPipeline)
  ]);
  
  const total = countResult[0]?.total || 0;
  
  // Format ads for frontend
  const formattedAds = ads.map(ad => ({
    id: ad._id,
    plan: ad.plan,
    type: ad.type,
    amount: ad.amount,
    startDate: ad.startDate,
    endDate: ad.endDate,
    distance: ad.distance || null,
    provider: {
      id: ad.providerData._id,
      fullName: ad.providerData.fullName,
      photo: ad.providerData.profile?.photo || null,
      category: ad.providerData.service?.category || null,
      location: ad.providerData.location?.city || null,
      rating: ad.providerData.rating || 0,
      coordinates: ad.providerData.location?.coordinates || null,
    }
  }));
  
  res.json({
    success: true,
    data: {
      ads: formattedAds,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: total,
        pages: Math.ceil(total / safeLimit),
      }
    }
  });
});

// ─── GET FEATURED PROVIDERS WITH PROXIMITY ───
const getFeaturedProviderss = catchAsync(async (req, res) => {
  const { limit = 10, category, latitude, longitude, radius = 50 } = req.query;
  
  const query = {
    isBanned: false,
    featuredUntil: { $gt: new Date() }
  };
  
  if (category) query['service.category'] = category;
  
  const safeLimit = Math.min(20, Math.max(1, Number(limit)));
  
  let providers = [];
  
  if (latitude && longitude) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    // Use geospatial aggregation for proximity
    providers = await dB.providers.aggregate([
      { $match: query },
      {
        $addFields: {
          location: {
            type: 'Point',
            coordinates: [
              { $ifNull: ['$location.coordinates.longitude', 0] },
              { $ifNull: ['$location.coordinates.latitude', 0] }
            ]
          }
        }
      },
      {
        $addFields: {
          distance: {
            $multiply: [
              6371,
              {
                $acos: {
                  $min: [
                    1,
                    {
                      $add: [
                        { $multiply: [{ $sin: { $degreesToRadians: lat } }, { $sin: { $degreesToRadians: { $arrayElemAt: ['$location.coordinates', 1] } } }] },
                        { $multiply: [{ $cos: { $degreesToRadians: lat } }, { $cos: { $degreesToRadians: { $arrayElemAt: ['$location.coordinates', 1] } } }, { $cos: { $subtract: [lng, { $arrayElemAt: ['$location.coordinates', 0] }] } }] }
                      ]
                    }
                  ]
                }
              }
            ]
          }
        }
      },
      { $match: { distance: { $lte: parseFloat(radius) } } },
      { $sort: { distance: 1 } },
      { $limit: safeLimit },
      {
        $project: {
          _id: 1,
          fullName: 1,
          'profile.photo': 1,
          'service.category': 1,
          'location.city': 1,
          rating: 1,
          featuredUntil: 1,
          distance: 1,
          'location.coordinates': 1,
        }
      }
    ]);
  } else {
    // No location, just get featured providers
    providers = await dB.providers
      .find(query)
      .select('fullName profile.photo service.category location.city rating featuredUntil location.coordinates')
      .sort({ featuredUntil: -1 })
      .limit(safeLimit)
      .lean();
  }
  
  const formattedProviders = providers.map(provider => ({
    id: provider._id,
    fullName: provider.fullName,
    photo: provider.profile?.photo || null,
    category: provider.service?.category || null,
    location: provider.location?.city || null,
    rating: provider.rating || 0,
    featuredUntil: provider.featuredUntil,
    distance: provider.distance || null,
    coordinates: provider.location?.coordinates || null,
  }));
  
  res.json({
    success: true,
    data: {
      providers: formattedProviders,
      count: formattedProviders.length,
    }
  });
});

const getAdDetails = catchAsync(async (req, res) => {
  const { adId } = req.params;
  
  const ad = await dB.promotions
    .findOne({
      _id: adId,
      type: 'ad',
      status: 'active',
      endDate: { $gt: new Date() }
    })
    .populate('provider', 'fullName profile.photo profile.coverImage service.category location.city rating bio');
  
  if (!ad) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ad not found or expired.');
  }
  
  res.json({
    success: true,
    data: {
      id: ad._id,
      plan: ad.plan,
      type: ad.type,
      amount: ad.amount,
      startDate: ad.startDate,
      endDate: ad.endDate,
      image: ad.image || ad.imageUrl || null,
      provider: {
        id: ad.provider._id,
        fullName: ad.provider.fullName,
        photo: ad.provider.profile?.photo || null,
        coverImage: ad.provider.profile?.coverImage || null,
        category: ad.provider.service?.category || null,
        location: ad.provider.location?.city || null,
        rating: ad.provider.rating || 0,
        bio: ad.provider.bio || null,
      }
    }
  });
});

// ─── GET PROVIDER ADS ───
const getProviderAds = catchAsync(async (req, res) => {
  const { providerId } = req.params;
  const { limit = 10 } = req.query;
  
  const query = {
    provider: providerId,
    type: 'ad',
    status: 'active',
    endDate: { $gt: new Date() }
  };
  
  const safeLimit = Math.min(20, Math.max(1, Number(limit)));
  
  const ads = await dB.promotions
    .find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();
  
  const formattedAds = ads.map(ad => ({
    id: ad._id,
    plan: ad.plan,
    amount: ad.amount,
    startDate: ad.startDate,
    endDate: ad.endDate,
    image: ad.image || ad.imageUrl || null,
  }));
  
  res.json({
    success: true,
    data: {
      ads: formattedAds,
      count: formattedAds.length,
    }
  });
});
module.exports = {
  purchaseFeatured,
  getMyFeatured,
  getFeaturedProviders,
  purchaseAd,
  getMyAds,
  getActiveAds,
  getFeaturedProviderss,
  getActiveAdss,
   getAdDetails,       
  getProviderAds,
};