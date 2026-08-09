const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');
const { getIo } = require('../utils/io');
const { uploadObject } = require('../utils/aws.s3.bucket');
// ─────────────────────────────────────────
// STORES
// ─────────────────────────────────────────

const createStore = catchAsync(async (req, res) => {
  const existing = await dB.stores.findOne({ provider: req.user._id });
  if (existing) throw new ApiError(httpStatus.BAD_REQUEST, 'You already have a store.');

  const store = await dB.stores.create({ provider: req.user._id, ...req.body });
  res.status(httpStatus.CREATED).json({ store });
});

const getMyStore = catchAsync(async (req, res) => {
  const store = await dB.stores.findOne({ provider: req.user._id });
  if (!store) throw new ApiError(httpStatus.NOT_FOUND, 'You do not have a store yet.');
  res.json({ store });
});

const updateStore = catchAsync(async (req, res) => {
  const store = await dB.stores.findOneAndUpdate(
    { _id: req.params.storeId, provider: req.user._id },
    req.body,
    { new: true }
  );
  if (!store) throw new ApiError(httpStatus.NOT_FOUND, 'Store not found.');
  res.json({ store });
});

const getStoreStats = catchAsync(async (req, res) => {
  const store = await dB.stores.findOne({ _id: req.params.storeId, provider: req.user._id });
  if (!store) throw new ApiError(httpStatus.NOT_FOUND, 'Store not found.');

  // Get all stats in parallel with safe defaults
  const [
    totalOrders,
    completedOrders,
    pendingOrders,
    revenueResult,
    totalProducts,
    totalCustomers
  ] = await Promise.all([
    dB.orders.countDocuments({ store: store._id }),
    dB.orders.countDocuments({ store: store._id, status: 'delivered' }),
    dB.orders.countDocuments({ store: store._id, status: 'pending' }),
    dB.orders.aggregate([
      { $match: { store: store._id, status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    dB.products.countDocuments({ store: store._id, isActive: true }),
    dB.orders.distinct('buyer', { store: store._id }),
  ]);

  // Get average rating from reviews (if reviews exist)
  let averageRating = 0;
  try {
    const avgRatingResult = await dB.reviews.aggregate([
      { $match: { target: store._id, targetType: 'store' } },
      { $group: { _id: null, avg: { $avg: '$overall' } } },
    ]);
    averageRating = avgRatingResult[0]?.avg || 0;
  } catch (error) {
    // Reviews collection might not exist yet
    averageRating = 0;
  }

  res.json({
    stats: {
      totalProducts: totalProducts || 0,
      totalOrders: totalOrders || 0,
      totalRevenue: revenueResult[0]?.total || 0,
      totalSales: totalOrders || 0,
      totalCustomers: totalCustomers.length || 0,
      averageRating: averageRating || 0,
      completedOrders: completedOrders || 0,
      pendingOrders: pendingOrders || 0,
    },
  });
});

// Public: GET /marketplace/stores
const listStores = catchAsync(async (req, res) => {
  const { category, search, page = 0, limit = 20 } = req.query;
  const query = { isActive: true };
  if (category) query.category = category;
  if (search) query.$text = { $search: search };

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const stores = await dB.stores.find(query).sort({ rating: -1 }).skip(safePage * safeLimit).limit(safeLimit);
  res.json({ stores });
});

// Public: GET /marketplace/stores/:storeId
const getStore = catchAsync(async (req, res) => {
  const store = await dB.stores.findById(req.params.storeId).populate('provider', 'fullName profile.photo').lean();
  if (!store || !store.isActive) throw new ApiError(httpStatus.NOT_FOUND, 'Store not found.');
  res.json({ store });
});

// ─────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────

const createProduct = catchAsync(async (req, res) => {
  const store = await dB.stores.findOne({ provider: req.user._id });
  if (!store) throw new ApiError(httpStatus.BAD_REQUEST, 'You need a store before adding products.');

  // Handle image uploads if files exist
  let imageUrls = [];
  if (req.files && req.files.length > 0) {
    try {
      // Upload each image to Cloudflare R2
      const uploadPromises = req.files.map(async (file, index) => {
        const key = `products/${store._id}/${Date.now()}-${index}-${file.originalname}`;
        
        console.log('Uploading product image to R2...');
        console.log('Bucket:', process.env.R2_BUCKET_NAME);
        console.log('Key:', key);

        const uploadResult = await uploadObject({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        });

        console.log('Upload result:', uploadResult);
        return uploadResult.Location;
      });

      imageUrls = await Promise.all(uploadPromises);
      console.log('All images uploaded:', imageUrls);
    } catch (uploadError) {
      console.error('R2 upload failed:', uploadError);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Image upload failed. Please try again.'
      );
    }
  }

  // Create product with image URLs
  const productData = {
    store: store._id,
    provider: req.user._id,
    ...req.body,
    images: imageUrls.length > 0 ? imageUrls : req.body.images || [],
  };

  const product = await dB.products.create(productData);
  res.status(httpStatus.CREATED).json({ product });
});

const getProduct = catchAsync(async (req, res) => {
  const product = await dB.products.findById(req.params.productId).populate('store', 'name logo').lean();
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
  res.json({ product });
});

const updateProduct = catchAsync(async (req, res) => {
  const product = await dB.products.findOneAndUpdate(
    { _id: req.params.productId, provider: req.user._id },
    req.body,
    { new: true }
  );
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
  res.json({ product });
});

const deleteProduct = catchAsync(async (req, res) => {
  const product = await dB.products.findOneAndDelete({ _id: req.params.productId, provider: req.user._id });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
  res.json({ message: 'Product deleted.' });
});

const getStoreProducts = catchAsync(async (req, res) => {
  const { category, page = 0, limit = 20, showInactive } = req.query;
  const query = { store: req.params.storeId };
  
  // Only filter by isActive if showInactive is not true
  if (showInactive !== 'true') {
    query.isActive = true;
  }
  
  if (category) query.category = category;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const products = await dB.products.find(query)
    .sort({ createdAt: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit);
    
  res.json({ products });
});

const searchProducts = catchAsync(async (req, res) => {
  const { q, category, page = 0, limit = 20 } = req.query;
  const query = { isActive: true };
  if (q) query.$text = { $search: q };
  if (category) query.category = category;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const products = await dB.products
    .find(query)
    .populate('store', 'name logo')
    .sort(q ? { score: { $meta: 'textScore' } } : { soldCount: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit);

  res.json({ products });
});

const getFeaturedProducts = catchAsync(async (req, res) => {
  // Featured = products from stores owned by currently-promoted providers + top sellers
  const now = new Date();
  const promotedProviderIds = await dB.promotions
    .find({ plan: { $in: ['ads_boost', 'featured_provider', 'verified_pro'] }, status: 'active', endDate: { $gt: now } })
    .distinct('provider');

  const promotedStoreIds = promotedProviderIds.length
    ? await dB.stores.find({ provider: { $in: promotedProviderIds }, isActive: true }).distinct('_id')
    : [];

  // Promoted products first, then top sellers
  const products = await dB.products.aggregate([
    { $match: { isActive: true } },
    {
      $addFields: {
        isPromoted: { $cond: [{ $in: ['$store', promotedStoreIds] }, 1, 0] },
      },
    },
    { $sort: { isPromoted: -1, soldCount: -1 } },
    { $limit: 12 },
    {
      $lookup: {
        from: 'stores',
        localField: 'store',
        foreignField: '_id',
        as: 'storeInfo',
        pipeline: [{ $project: { name: 1, logo: 1 } }],
      },
    },
    { $addFields: { store: { $arrayElemAt: ['$storeInfo', 0] } } },
    { $project: { storeInfo: 0 } },
  ]);

  res.json({ products });
});

const getTrendingProducts = catchAsync(async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const products = await dB.products
    .find({ isActive: true, createdAt: { $gte: sevenDaysAgo } })
    .sort({ soldCount: -1, rating: -1 })
    .limit(12)
    .populate('store', 'name logo');
  res.json({ products });
});

// ─────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────

const createOrder = catchAsync(async (req, res) => {
  const { storeId, items, deliveryAddress, paymentMethod, paystackReference } = req.body;

  const store = await dB.stores.findById(storeId);
  if (!store || !store.isActive) throw new ApiError(httpStatus.NOT_FOUND, 'Store not found.');

  // Resolve product prices
  const productIds = items.map((i) => i.productId);
  const products = await dB.products.find({ _id: { $in: productIds }, isActive: true });
  const productMap = Object.fromEntries(products.map((p) => [p._id.toString(), p]));

  const resolvedItems = [];
  let subtotal = 0;
  for (const item of items) {
    const product = productMap[item.productId];
    if (!product) throw new ApiError(httpStatus.BAD_REQUEST, `Product ${item.productId} not found.`);
    if (product.stock < item.quantity) throw new ApiError(httpStatus.BAD_REQUEST, `${product.name} is out of stock.`);
    resolvedItems.push({
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      image: product.images?.[0] || null
    });
    subtotal += product.price * item.quantity;
  }

  const DELIVERY_FEE = 800; // Fixed delivery fee or calculate as needed
  const total = subtotal + DELIVERY_FEE;

  const order = await dB.orders.create({
    buyer: req.user._id,
    store: storeId,
    items: resolvedItems,
    subtotal: subtotal,
    deliveryFee: DELIVERY_FEE,
    total: total,
    deliveryAddress: deliveryAddress,
    paymentMethod: paymentMethod || 'cod',
    paystackReference: paystackReference || null,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
    status: 'confirmed',
    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  });

  // Decrement stock
  for (const item of resolvedItems) {
    await dB.products.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity, soldCount: item.quantity }
    });
  }

  res.status(httpStatus.CREATED).json({ order });
});

const getOrder = catchAsync(async (req, res) => {
  const order = await dB.orders.findById(req.params.orderId).populate('store', 'name logo');
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');

  const userId = req.user._id.toString();
  const isOwner = order.buyer.toString() === userId;
  const isSellerStore = await dB.stores.exists({ _id: order.store, provider: req.user._id });
  if (!isOwner && !isSellerStore) throw new ApiError(httpStatus.FORBIDDEN, 'Access denied.');

  res.json({ order });
});

const updateOrderStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid order status.');

  const store = await dB.stores.findOne({ provider: req.user._id });
  if (!store) throw new ApiError(httpStatus.FORBIDDEN, 'No store found.');

  const order = await dB.orders.findOneAndUpdate(
    { _id: req.params.orderId, store: store._id },
    { status },
    { new: true }
  );
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');

  // Real-time socket event to buyer
  const io = getIo();
  if (io) {
    io.to(`user_${order.buyer.toString()}`).emit('order_updated', {
      orderId: order._id.toString(),
      status,
      updatedAt: new Date(),
    });
  }

  // Push notification to buyer
  const statusMessages = {
    processing: 'Your order is being prepared.',
    shipped: 'Your order is on the way!',
    delivered: 'Your order has been delivered.',
    cancelled: 'Your order has been cancelled.',
  };
  if (statusMessages[status]) {
    notificationService.sendPushNotification({
      userId: order.buyer.toString(),
      actorType: 'customer',
      title: 'Order Update',
      body: statusMessages[status],
      type: 'booking',
      data: { orderId: order._id.toString(), screen: 'order-details' },
    }).catch(() => {});
  }

  res.json({ order });
});

const getMyOrdersAsBuyer = catchAsync(async (req, res) => {
  const { status, page = 0, limit = 20 } = req.query;
  const query = { buyer: req.user._id };
  if (status) query.status = status;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const orders = await dB.orders.find(query).populate('store', 'name logo').sort({ createdAt: -1 }).skip(safePage * safeLimit).limit(safeLimit);
  res.json({ orders });
});

const getMyOrdersAsSeller = catchAsync(async (req, res) => {
  const { status, page = 0, limit = 20 } = req.query;
  const store = await dB.stores.findOne({ provider: req.user._id });
  if (!store) return res.json({ orders: [] });

  const query = { store: store._id };
  if (status) query.status = status;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const orders = await dB.orders.find(query).populate('buyer', 'fullName profilePhoto').sort({ createdAt: -1 }).skip(safePage * safeLimit).limit(safeLimit);
  res.json({ orders });
});

// ─────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────

const createReview = catchAsync(async (req, res) => {
  const { targetId, targetType, bookingId, orderId, overall, quality, punctuality, professionalism, communication, text } = req.body;

  const existing = await dB.reviews.findOne({ reviewer: req.user._id.toString(), booking: bookingId || null, target: targetId });
  if (existing) throw new ApiError(httpStatus.BAD_REQUEST, 'You have already reviewed this.');

  const review = await dB.reviews.create({
    reviewer: req.user._id.toString(),
    reviewerName: req.user.fullName,
    reviewerAvatar: req.user.profilePhoto,
    target: targetId,
    targetType,
    booking: bookingId || null,
    order: orderId || null,
    overall,
    categories: { quality, punctuality, professionalism, communication },
    text,
    isVerified: !!(bookingId || orderId),
  });

  res.status(httpStatus.CREATED).json({ review });
});

const getTargetReviews = catchAsync(async (req, res) => {
  const { targetId } = req.params;
  const { page = 0, limit = 20 } = req.query;
  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  const reviews = await dB.reviews
    .find({ target: targetId })
    .sort({ createdAt: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit);

  const avgResult = await dB.reviews.aggregate([
    { $match: { target: new require('mongoose').Types.ObjectId(targetId) } },
    { $group: { _id: null, avg: { $avg: '$overall' }, count: { $sum: 1 } } },
  ]);

  res.json({
    reviews,
    averageRating: avgResult[0]?.avg || 0,
    totalReviews: avgResult[0]?.count || 0,
  });
});

module.exports = {
  createStore, getMyStore, updateStore, getStoreStats, listStores, getStore,
  createProduct, getProduct, updateProduct, deleteProduct, getStoreProducts, searchProducts, getFeaturedProducts, getTrendingProducts,
  createOrder, getOrder, updateOrderStatus, getMyOrdersAsBuyer, getMyOrdersAsSeller,
  createReview, getTargetReviews,
};
