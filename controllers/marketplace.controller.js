const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');
const { getIo } = require('../utils/io');
const { uploadObject } = require('../utils/aws.s3.bucket');
const Customer = require('../models/customer');
const Provider = require('../models/provider');


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
  const { page = 0, limit = 12, category } = req.query;

  const safePage = Math.max(0, Number(page));
  const safeLimit = Math.min(50, Math.max(1, Number(limit)));

  // Build the base query
  const baseQuery = { isActive: true };

  // Add category filter if provided
  if (category && category !== 'All') {
    baseQuery.category = category;
  }

  // Get products that have been sold in the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // First, try to get products sold in the last 7 days with highest sales
  const trendingProducts = await dB.products
    .find({
      ...baseQuery,
      createdAt: { $gte: sevenDaysAgo },
      soldCount: { $gt: 0 }
    })
    .sort({ soldCount: -1, rating: -1 })
    .limit(safeLimit)
    .populate('store', 'name logo')
    .lean();

  // If we have enough trending products, return them
  if (trendingProducts.length >= Math.min(safeLimit, 6)) {
    const total = await dB.products.countDocuments({
      ...baseQuery,
      createdAt: { $gte: sevenDaysAgo },
      soldCount: { $gt: 0 }
    });

    return res.json({
      products: trendingProducts,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: total,
        pages: Math.ceil(total / safeLimit),
      },
      isTrending: true,
    });
  }

  // If not enough trending products, get the most popular products overall
  const skip = safePage * safeLimit;

  const [allProducts, total] = await Promise.all([
    dB.products
      .find(baseQuery)
      .sort({ soldCount: -1, rating: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('store', 'name logo')
      .lean(),
    dB.products.countDocuments(baseQuery)
  ]);

  res.json({
    products: allProducts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: total,
      pages: Math.ceil(total / safeLimit),
    },
    isTrending: false,
  });
});

// ─────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────
const createOrder = catchAsync(async (req, res) => {
  const { storeId, items, deliveryAddress, paymentMethod, paystackReference } = req.body;

  console.log('Create order request:', JSON.stringify({ storeId, items, deliveryAddress, paymentMethod }, null, 2));

  try {
    // Validate required fields
    if (!storeId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Store ID is required');
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'At least one item is required');
    }
    
    if (!deliveryAddress || !deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.state) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Complete delivery address is required');
    }

    console.log('Step 1: Finding store...');
    const store = await dB.stores.findById(storeId);
    if (!store || !store.isActive) {
      console.log('Store not found or inactive:', storeId);
      throw new ApiError(httpStatus.NOT_FOUND, 'Store not found or inactive.');
    }
    console.log('Store found:', store._id);

    // Resolve product prices
    console.log('Step 2: Finding products...');
    const productIds = items.map((i) => i.productId);
    console.log('Product IDs:', productIds);
    
    const products = await dB.products.find({ _id: { $in: productIds }, isActive: true });
    console.log('Products found:', products.length);
    
    if (products.length !== items.length) {
      console.log('Product count mismatch. Expected:', items.length, 'Found:', products.length);
      throw new ApiError(httpStatus.BAD_REQUEST, 'One or more products not found or inactive.');
    }
    
    const productMap = Object.fromEntries(products.map((p) => [p._id.toString(), p]));

    console.log('Step 3: Building order items...');
    const resolvedItems = [];
    let subtotal = 0;
    for (const item of items) {
      const product = productMap[item.productId];
      if (!product) {
        console.log('Product not found:', item.productId);
        throw new ApiError(httpStatus.BAD_REQUEST, `Product ${item.productId} not found.`);
      }
      if (product.stock < item.quantity) {
        console.log('Insufficient stock for:', product.name, 'Stock:', product.stock, 'Requested:', item.quantity);
        throw new ApiError(httpStatus.BAD_REQUEST, `${product.name} is out of stock.`);
      }
      resolvedItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        image: product.images?.[0] || null
      });
      subtotal += product.price * item.quantity;
    }
    console.log('Subtotal:', subtotal);

    // Calculate fees (10% each)
    const deliveryFee = Math.round(subtotal * 0.10);
    const serviceFee = Math.round(subtotal * 0.10);
    const total = subtotal + deliveryFee + serviceFee;
    console.log('Total:', total, 'DeliveryFee:', deliveryFee, 'ServiceFee:', serviceFee);

    // Map payment method to valid enum values
    let validPaymentMethod = 'card';
    if (paymentMethod === 'online' || paymentMethod === 'card') {
      validPaymentMethod = 'card';
    } else if (paymentMethod === 'bank_transfer' || paymentMethod === 'transfer') {
      validPaymentMethod = 'bank_transfer';
    } else if (paymentMethod === 'cod' || paymentMethod === 'cash') {
      validPaymentMethod = 'cod';
    } else if (paymentMethod === 'wallet') {
      validPaymentMethod = 'wallet';
    }
    console.log('Payment method:', validPaymentMethod);

    console.log('Step 4: Creating order...');
    const order = await dB.orders.create({
      buyer: req.user._id,
      store: storeId,
      items: resolvedItems,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      total: total,
      deliveryAddress: {
        street: deliveryAddress.street,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        landmark: deliveryAddress.landmark || '',
        phone: deliveryAddress.phone || '',
      },
      paymentMethod: validPaymentMethod,
      paystackReference: paystackReference || null,
      paymentStatus: 'paid',
      status: 'confirmed',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    console.log('Order created:', order._id);

    // Decrement stock
    console.log('Step 5: Updating stock...');
    for (const item of resolvedItems) {
      await dB.products.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity, soldCount: item.quantity }
      });
    }
    console.log('Stock updated');

    // ============================================
    // SEND NOTIFICATIONS
    // ============================================
    console.log('Step 6: Sending notifications...');

    // Get buyer details
    const buyer = await Customer.findById(req.user._id).select('fullName email');
    const buyerName = buyer?.fullName || 'Customer';
    const orderIdShort = order._id.toString().slice(-6);

    // 1. Send notification to BUYER
    try {
      await notificationService.sendPushNotification({
        userId: req.user._id.toString(),
        actorType: 'customer',
        title: 'Order Confirmed',
        body: `Your order #${orderIdShort} has been confirmed. Estimated delivery: 3-5 business days.`,
        type: 'system',
        data: { 
          orderId: order._id.toString(), 
          screen: 'order-details',
          amount: total,
        },
      });
      console.log('Buyer notification sent');
    } catch (error) {
      console.error('Error sending buyer notification:', error.message);
    }

    // 2. Send notification to SELLER
    try {
      const provider = await Provider.findById(store.provider).select('fullName email');
      const sellerUserId = store.provider.toString();

      await notificationService.sendPushNotification({
        userId: sellerUserId,
        actorType: 'provider',
        title: 'New Order Received',
        body: `You have a new order from ${buyerName}. Order #${orderIdShort} - ₦${total.toLocaleString()}`,
        type: 'system',
        data: { 
          orderId: order._id.toString(), 
          screen: 'store-orders',
          buyerName: buyerName,
          total: total,
          items: resolvedItems.length,
        },
      });
      console.log('Seller notification sent');
    } catch (error) {
      console.error('Error sending seller notification:', error.message);
    }

    // 3. Real-time socket events
    try {
      const io = getIo();
      if (io) {
        io.to(`provider_${store.provider.toString()}`).emit('new_order', {
          orderId: order._id.toString(),
          buyerName: buyerName,
          total: total,
          items: resolvedItems.length,
          createdAt: order.createdAt,
          order: order,
        });
        
        io.to('admin_room').emit('new_order', {
          orderId: order._id.toString(),
          store: store.name,
          storeId: store._id.toString(),
          buyerName: buyerName,
          total: total,
          items: resolvedItems.length,
        });
        
        console.log('Socket events emitted');
      }
    } catch (error) {
      console.error('Error emitting socket events:', error.message);
    }

    res.status(httpStatus.CREATED).json({ 
      success: true, 
      order 
    });

  } catch (error) {
    console.error('Order creation error:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
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
    }).catch(() => { });
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
