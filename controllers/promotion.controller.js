const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

// Escape user input before embedding into a RegExp (state names etc.)
const escapeRegExp = (str) => String(str ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FEATURED_PRICES = {
  fp: { amount: 3000, billingCycle: 'monthly' }, // Featured Provider
  hp: { amount: 25000, billingCycle: 'monthly' }, // Homepage Feature
};

const AD_PRICES = {
  local: { amount: 10000, billingCycle: 'monthly' },
  state: { amount: 50000, billingCycle: 'monthly' },
  nation: { amount: 150000, billingCycle: 'monthly' },
};

// ─── PROMOTION TRANSACTION RECEIPTS ─────────
// Every paid promotion (featured listing or ad campaign) leaves a receipt
// on the provider's wallet so it shows up in wallet/transaction history.
// Idempotent per Paystack reference so retries never double-record.
const recordPromotionReceipt = async ({
  userId,
  reference,
  plan,
  planLabel,
  amount,
  metadata = {},
}) => {
  if (!reference) return;
  const usedRef = await dB.transactions.findOne({ reference });
  if (usedRef) return; // already recorded — never double-charge a receipt

  let wallet = await dB.wallets.findOne({ owner: userId });
  if (!wallet) wallet = await dB.wallets.create({ owner: userId, ownerType: 'provider' });

  await dB.transactions.create({
    wallet: wallet._id,
    owner: userId,
    type: 'debit',
    amount,
    balanceBefore: wallet.balance,
    balanceAfter: wallet.balance,
    description: `${planLabel} (${plan}) — ServeNaija promotion`,
    reference,
    status: 'success',
    metadata,
  });
};

const PLAN_LABELS = {
  fp: 'Featured Provider',
  hp: 'Homepage Feature',
  local: 'Local Ad',
  state: 'Statewide Ad',
  nation: 'Nationwide Ad',
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

  // Receipt for this purchase on the provider's wallet
  await recordPromotionReceipt({
    userId: req.user._id.toString(),
    reference: paystackReference,
    plan,
    planLabel: PLAN_LABELS[plan],
    amount: planMeta.amount,
    metadata: { promotionId: promotion._id.toString(), plan, type: 'featured' },
  });

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
    kycStatus: 'approved',
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

  // Snapshot the state the ad runs in (used for statewide reach filtering).
  // req.user comes from the token payload and often lacks location, so read
  // the full provider record when needed. Statewide ads with no state on
  // record are unreachable — fall back to the token, then the provider doc.
  let adState = req.user?.location?.state || null;
  if (!adState) {
    const providerDoc = await dB.providers
      .findById(req.user._id)
      .select('location.state');
    adState = providerDoc?.location?.state || null;
  }

  const promotion = await dB.promotions.create({
    provider: req.user._id,
    plan,
    type: 'ad',
    state: adState,
    amount: planMeta.amount,
    billingCycle: planMeta.billingCycle,
    paystackReference,
    startDate: now,
    endDate,
    status: 'active',
  });

  // Receipt for this purchase on the provider's wallet
  await recordPromotionReceipt({
    userId: req.user._id.toString(),
    reference: paystackReference,
    plan,
    planLabel: PLAN_LABELS[plan],
    amount: planMeta.amount,
    metadata: { promotionId: promotion._id.toString(), plan, type: 'ad' },
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
  const { type, limit = 20, page = 0, latitude, longitude, radius = 50, state } = req.query;

  // Feed includes both paid ad campaigns AND Homepage Feature (hp) banners.
  // hp promotions are what powers the customer homepage banner and must show
  // everywhere, regardless of the viewer's location or state.
  const adMatch = { type: 'ad' };
  if (type) adMatch.plan = type;

  const query = {
    status: 'active',
    endDate: { $gt: new Date() },
    $or: [
      adMatch,
      // Homepage Feature banners (featured plan 'hp')
      { type: 'featured', plan: 'hp' },
    ],
  };
  
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
  
  // Filter providers that are not banned AND have completed KYC (approved)
  pipeline.push({
    $match: {
      'providerData.isBanned': false,
      'providerData.kycStatus': 'approved'
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
    
    // Filter by radius — applied per-plan later in the $switch below.
    // We only record the distance here; a hard radius match here would hide
    // state-scope and nation-scope ads that should still be visible.
    pipeline.push({
      $addFields: {
        distanceKm: '$distance',
      },
    });
  }

  // ── Plan-based reach scoping ──
  // nation ads: visible everywhere (all states) — no extra filter.
  // state ads: only visible when the ad's provider is in the viewer's state.
  // local ads: only within 40km of the viewer (capped regardless of passed radius).
  const LOCAL_AD_MAX_KM = 40;

  const scopePipeline = [];
  if (latitude && longitude) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const localRadiusKm = Math.min(parseFloat(radius) || LOCAL_AD_MAX_KM, LOCAL_AD_MAX_KM);

    scopePipeline.push({
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

    scopePipeline.push({
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

    scopePipeline.push({
      $addFields: {
        inScope: {
          $switch: {
            branches: [
              // Homepage Feature banners: visible everywhere
              { case: { $eq: ['$plan', 'hp'] }, then: true },
              // Nationwide ads are visible anywhere
              { case: { $eq: ['$plan', 'nation'] }, then: true },
              // Statewide ads: visible when either the state snapshotted at
              // purchase time or the provider's current state matches the
              // viewer's state. Matching is forgiving (case/whitespace/
              // "Lagos" vs "Lagos State") so paid statewide ads don't
              // disappear over small naming differences.
              {
                case: {
                  $and: [
                    { $eq: ['$plan', 'state'] },
                    { $ne: [{ $ifNull: [state, ''] }, ''] },
                    {
                      $or: [
                        {
                          $regexMatch: {
                            input: { $trim: { input: { $ifNull: ['$state', ''] } } },
                            regex: state,
                            options: 'i',
                          },
                        },
                        {
                          $regexMatch: {
                            input: { $trim: { input: { $ifNull: ['$providerData.location.state', ''] } } },
                            regex: state,
                            options: 'i',
                          },
                        },
                        {
                          // "Lagos State" ad shown to "Lagos" viewers
                          $regexMatch: {
                            input: { $trim: { input: { $ifNull: [state, ''] } } },
                            regex: {
                              $trim: {
                                input: {
                                  $ifNull: ['$providerData.location.state', '$state'],
                                },
                              },
                            },
                            options: 'i',
                          },
                        },
                      ],
                    },
                  ],
                },
                then: true,
              },
              // Statewide ads: ad's state (snapshot at purchase, fallback to
              // provider's current state) must match the viewer's state.
              // The ad-level `state` field is set by purchaseAd from the
              // provider's location at purchase time.
              {
                case: {
                  $and: [
                    { $eq: ['$plan', 'state'] },
                    {
                      $gt: [
                        {
                          $size: {
                            $ifNull: [
                              { $split: [{ $ifNull: ['$providerData.location.state', ''] }, ''] },
                              [],
                            ],
                          },
                        },
                        0,
                      ],
                    },
                    {
                      $eq: [
                        { $toLower: { $trim: { input: { $ifNull: ['$providerData.location.state', ''] } } } },
                        { $toLower: { $trim: { input: state || '' } } },
                      ],
                    },
                  ],
                },
                then: true,
              },
              // Statewide ads (fallback): match the state snapshotted on the
              // promotion itself when the provider record has no state set.
              {
                case: {
                  $and: [
                    { $eq: ['$plan', 'state'] },
                    {
                      $eq: [
                        { $toLower: { $trim: { input: { $ifNull: ['$state', ''] } } } },
                        { $toLower: { $trim: { input: state || '' } } },
                      ],
                    },
                    { $ne: [{ $ifNull: ['$state', ''] }, ''] },
                    { $ne: [{ $ifNull: [state, ''] }, ''] },
                  ],
                },
                then: true,
              },
              // Local ads: within 40km of the viewer
              {
                case: {
                  $and: [
                    { $eq: ['$plan', 'local'] },
                    { $lte: ['$distance', localRadiusKm] }
                  ]
                },
                then: true
              },
              // Local ads without coordinates on the provider: treat as in-scope
              {
                case: {
                  $and: [
                    { $eq: ['$plan', 'local'] },
                    { $or: [
                      { $eq: [{ $ifNull: ['$providerData.location.coordinates.latitude', null] }, null] },
                      { $eq: [{ $ifNull: ['$providerData.location.coordinates.longitude', null] }, null] },
                    ] }
                  ]
                },
                then: false
              }
            ],
            default: false
          }
        }
      }
    });

    pipeline.push(...scopePipeline);

    // Keep only ads whose reach covers the viewer
    pipeline.push({ $match: { inScope: true } });
  } else if (state) {
    // No coordinates but a state is known: show homepage banners + nation +
    // matching state ads (matching on either the snapshot state or the
    // provider's current state, so paid ads never vanish over naming drift)
    pipeline.push({
      $match: {
        $or: [
          { plan: 'hp' },
          { plan: 'nation' },
          {
            plan: 'state',
            $or: [
              { state: { $regex: new RegExp(escapeRegExp(state), 'i') } },
              { 'providerData.location.state': { $regex: new RegExp(escapeRegExp(state), 'i') } },
            ],
          },
        ]
      }
    });
  }
  
  // Get total count before pagination
  const countPipeline = [...pipeline];
  countPipeline.push({ $count: 'total' });
  
  pipeline.push({ $skip: safePage * safeLimit });
  pipeline.push({ $limit: safeLimit });

  // Execute queries
  const [ads, countResult] = await Promise.all([
    dB.promotions.aggregate(pipeline),
    dB.promotions.aggregate(countPipeline)
  ]);

  const total = countResult[0]?.total || 0;

  // Sort: homepage banner (hp) first, then local (nearest), then statewide,
  // then nationwide — and within the same scope, newest first (first come,
  // first shown). NOTE: must run AFTER the aggregate resolves.
  const scopeOrder = { hp: 0, local: 1, state: 2, nation: 3 };
  ads.sort((a, b) => {
    const sa = scopeOrder[a.plan] ?? 4;
    const sb = scopeOrder[b.plan] ?? 4;
    if (sa !== sb) return sa - sb;
    if (latitude && longitude && a.plan === 'local' && b.plan === 'local') {
      return (a.distance || 0) - (b.distance || 0);
    }
    return new Date(b.startDate) - new Date(a.startDate);
  });

  // Format ads for frontend
  const formattedAds = ads.map(ad => ({
    id: ad._id,
    plan: ad.plan,
    type: ad.type,
    image: ad.image || ad.imageUrl || null,
    imageUrl: ad.imageUrl || ad.image || null,
    amount: ad.amount,
    startDate: ad.startDate,
    endDate: ad.endDate,
    distance: ad.distance || null,
    providerState: ad.providerData?.location?.state || null,
    provider: {
      id: ad.providerData._id,
      fullName: ad.providerData.fullName,
      photo: ad.providerData.profile?.photo || null,
      category: ad.providerData.service?.category || null,
      location: ad.providerData.location?.city || null,
      state: ad.providerData.location?.state || null,
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
    kycStatus: 'approved',
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
      // No hard radius cut: featured providers beyond the radius stay visible,
      // just sorted after closer ones (first come, first shown within tier).
      { $sort: { distance: 1, featuredUntil: -1 } },
      { $limit: safeLimit * 3 },
      {
        $project: {
          _id: 1,
          fullName: 1,
          'profile.photo': 1,
          'service.category': 1,
          'location.city': 1,
          'location.state': 1,
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
      .select('fullName profile.photo service.category location.city location.state rating featuredUntil location.coordinates')
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