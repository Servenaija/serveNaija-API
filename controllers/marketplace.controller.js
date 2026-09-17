const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');
const axios = require('axios');
const { getIo } = require('../utils/io');
const { uploadObject } = require('../utils/aws.s3.bucket');
const Customer = require('../models/customer');
const Provider = require('../models/provider');
const mongoose = require('mongoose');

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
  const { storeId, items, deliveryAddress, deliveryFee: proposedDeliveryFee, paymentMethod, paystackReference, transactionReference, reference } = req.body;
  // Accept all reference alias names the clients may send
  const paymentReference = paystackReference || transactionReference || reference || null;

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

    // Online/card payments require a Paystack reference (client pays via
    // Paystack popup BEFORE calling this endpoint). Wallet/COD do not.
    const onlineMethods = ['online', 'card', 'paystack', 'bank_transfer', 'transfer'];
    if (onlineMethods.includes(paymentMethod) && !paymentReference) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack reference is required for online payment');
    }

    // Initialize orderIdShort early
    const tempOrderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const orderIdShort = tempOrderId.slice(-6);

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

    // Delivery fee is the customer's proposed opening offer (negotiable with the
    // seller). Fall back to 10% of subtotal when not provided. Service fee stays 10%.
    const requestedFee = Number(proposedDeliveryFee);
    const deliveryFee =
      Number.isFinite(requestedFee) && requestedFee >= 0
        ? Math.round(requestedFee)
        : Math.round(subtotal * 0.10);
    const serviceFee = Math.round(subtotal * 0.10);
    const total = subtotal + deliveryFee + serviceFee;
    console.log('Total:', total, 'DeliveryFee:', deliveryFee, 'ServiceFee:', serviceFee);

    // Map payment method to valid enum values
    let validPaymentMethod = 'card';
    let paymentStatus = 'paid';
    let wallet = null;
    let transaction = null;

    if (paymentMethod === 'online' || paymentMethod === 'card' || paymentMethod === 'paystack') {
      validPaymentMethod = 'card';
      paymentStatus = 'paid';
    } else if (paymentMethod === 'bank_transfer' || paymentMethod === 'transfer') {
      validPaymentMethod = 'bank_transfer';
      paymentStatus = 'pending';
    } else if (paymentMethod === 'cod' || paymentMethod === 'cash') {
      validPaymentMethod = 'cod';
      paymentStatus = 'pending';
    } else if (paymentMethod === 'wallet') {
      validPaymentMethod = 'wallet';
      paymentStatus = 'paid';

      // ============================================
      // WALLET PAYMENT PROCESSING
      // ============================================
      console.log('Step 3.5: Processing wallet payment...');

      // Get customer's wallet
      wallet = await dB.wallets.findOne({
        owner: req.user._id.toString(),
        ownerType: 'customer',
        isActive: true
      });

      if (!wallet) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Wallet not found. Please create a wallet first.');
      }

      // Check if balance is sufficient
      if (wallet.balance < total) {
        throw new ApiError(httpStatus.BAD_REQUEST,
          `Insufficient wallet balance. Available: ₦${wallet.balance.toLocaleString()}, Required: ₦${total.toLocaleString()}`
        );
      }

      // Store balance before deduction
      const balanceBefore = wallet.balance;

      // Deduct from wallet
      wallet.balance -= total;
      wallet.totalSpent = (wallet.totalSpent || 0) + total;
      await wallet.save();
      
      const balanceAfter = wallet.balance;
      console.log('Wallet balance updated:', balanceBefore, '->', balanceAfter);

      // Create wallet transaction record
      transaction = await dB.transactions.create({
        wallet: wallet._id,
        owner: req.user._id.toString(),
        type: 'debit',
        amount: total,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        currency: 'NGN',
        description: `Payment for order #${orderIdShort}`,
        reference: `WALLET_ORDER_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        status: 'success',
        metadata: {
          orderId: 'pending',
          paymentMethod: 'wallet',
          orderIdShort: orderIdShort,
          items: resolvedItems.length,
          storeId: storeId,
        },
        order: null,
      });
      console.log('Wallet transaction created:', transaction._id);
    }
    console.log('Payment method:', validPaymentMethod);

    // ── Paystack amount verification for online payments ──
    // The customer paid via the Paystack popup BEFORE calling this endpoint;
    // make sure they paid the order total (Paystack charges are paid by the
    // customer on top, so anything from the total up to total + Paystack fee is valid).
    if (paymentReference && validPaymentMethod === 'card') {
      try {
        const psRes = await axios.get(
          `https://api.paystack.co/transaction/verify/${paymentReference}`,
          {
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
            timeout: 30000,
          }
        );
        const tx = psRes.data?.data;
        if (!psRes.data?.status || tx?.status !== 'success') {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Payment was not successful. Please try again.');
        }
        const paidAmount = (tx.amount || 0) / 100;
        // Customers pay Paystack charges on top of the order total, so the paid
        // amount is the total + the Paystack fee (1.5% + ₦100, capped ₦2,000).
        // Accept anything from the order total up to total + the applicable fee.
        const paystackFee = Math.min(Math.round(total * 0.015) + 100, 2000);
        if (paidAmount < total || paidAmount > total + paystackFee) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Payment amount mismatch. Expected ₦${total.toLocaleString()} (up to ₦${(total + paystackFee).toLocaleString()} with Paystack charges), got ₦${paidAmount.toLocaleString()}.`
          );
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Could not verify payment with Paystack. ' + (error.response?.data?.message || error.message || '')
        );
      }
    }

    console.log('Step 4: Creating order...');
    const order = await dB.orders.create({
      buyer: req.user._id,
      store: storeId,
      items: resolvedItems,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      serviceFee: serviceFee,
      total: total,
      deliveryAddress: {
        street: deliveryAddress.street,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        landmark: deliveryAddress.landmark || '',
        phone: deliveryAddress.phone || '',
      },
      deliveryFeeNegotiation: {
        amount: deliveryFee,
        counterAmount: null,
        status: 'pending',
        proposedBy: 'customer',
        updatedAt: new Date(),
      },
      paymentMethod: validPaymentMethod,
      paystackReference: paymentReference,
      paymentStatus: paymentStatus,
      status: paymentStatus === 'paid' ? 'confirmed' : 'pending',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    console.log('Order created:', order._id);

    // If wallet payment, update the transaction with order ID
    if (validPaymentMethod === 'wallet' && wallet && transaction) {
      await dB.transactions.findByIdAndUpdate(
        transaction._id,
        {
          $set: {
            'metadata.orderId': order._id.toString(),
            description: `Payment for order #${order._id.toString().slice(-6)}`,
            order: order._id,
          }
        }
      );
      console.log('Transaction updated with order ID:', order._id);
    }

    // Decrement stock
    console.log('Step 5: Updating stock...');
    for (const item of resolvedItems) {
      await dB.products.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity, soldCount: item.quantity }
      });
    }
    console.log('Stock updated');

    // ── Referral bonus: if this is the customer's FIRST order (booking or
    // marketplace order) and they were referred by an agent, deposit ₦1,500
    // into the agent's AGENT wallet. Never blocks or breaks the order. ──
    try {
      const referralService = require('../services/referral.service');
      const referralResult = await referralService.payFirstOrderReferralBonus(req.user._id.toString());
      if (referralResult?.paid) {
        console.log(`[Order] Referral bonus of ₦${referralResult.amount} paid to agent ${referralResult.agentCode} for customer ${req.user._id}'s first order.`);
      }
    } catch (referralError) {
      console.error('[Order] Referral bonus failed (order unaffected):', referralError.message);
    }

    // ============================================
    // SEND NOTIFICATIONS
    // ============================================
    console.log('Step 6: Sending notifications...');

    // Get buyer details
    const Customer = req.user.constructor;
    const buyer = await Customer.findById(req.user._id).select('fullName email');
    const buyerName = buyer?.fullName || 'Customer';

    // 1. Send notification to BUYER
    try {
      const paymentMethodDisplay = validPaymentMethod === 'wallet' ? 'Wallet' : 'Card';
      await notificationService.sendPushNotification({
        userId: req.user._id.toString(),
        actorType: 'customer',
        title: 'Order Confirmed',
        body: `Your order #${orderIdShort} has been confirmed. Payment: ${paymentMethodDisplay}. Estimated delivery: 3-5 business days.`,
        type: 'system',
        data: {
          orderId: order._id.toString(),
          screen: 'order-details',
          amount: total,
          paymentMethod: validPaymentMethod,
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
        body: `You have a new order from ${buyerName}. Order #${orderIdShort} - ₦${total.toLocaleString()} (${validPaymentMethod})`,
        type: 'system',
        data: {
          orderId: order._id.toString(),
          screen: 'store-orders',
          buyerName: buyerName,
          total: total,
          items: resolvedItems.length,
          paymentMethod: validPaymentMethod,
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
          paymentMethod: validPaymentMethod,
          order: order,
        });

        io.to('admin_room').emit('new_order', {
          orderId: order._id.toString(),
          store: store.name,
          storeId: store._id.toString(),
          buyerName: buyerName,
          total: total,
          items: resolvedItems.length,
          paymentMethod: validPaymentMethod,
        });

        console.log('Socket events emitted');
      }
    } catch (error) {
      console.error('Error emitting socket events:', error.message);
    }

    res.status(httpStatus.CREATED).json({
      success: true,
      order,
      paymentMethod: validPaymentMethod,
      walletPayment: validPaymentMethod === 'wallet',
    });

  } catch (error) {
    console.error('Order creation error:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
});

// Helper function to send email receipt (optional)
async function sendEmailReceipt({ email, name, orderId, items, total, paymentMethod, orderDate }) {
  // Implement email sending logic using your preferred service (SendGrid, Nodemailer, etc.)
  console.log(`Email receipt would be sent to ${email} for order ${orderId}`);
  // Example with SendGrid:
  // const msg = {
  //   to: email,
  //   from: 'orders@servenaija.com',
  //   subject: `Order Receipt #${orderId.slice(-6)}`,
  //   html: `
  //     <h2>Thank you for your order, ${name}!</h2>
  //     <p>Order #${orderId.slice(-6)}</p>
  //     <p>Payment Method: ${paymentMethod}</p>
  //     <p>Total: ₦${total.toLocaleString()}</p>
  //     <p>Order Date: ${new Date(orderDate).toLocaleDateString()}</p>
  //   `,
  // };
  // await sendGrid.send(msg);
  return true;
}

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

  const updatePayload = { status };
  if (status === 'delivered') {
    const now = new Date();
    updatePayload.deliveredAt = now;
    updatePayload.autoReleaseAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    updatePayload.paymentStatus = 'held';
  }

  const order = await dB.orders.findOneAndUpdate(
    { _id: req.params.orderId, store: store._id },
    updatePayload,
    { new: true }
  );
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');

  // If seller cancelled, refund the customer to their wallet
  let refundAmount = 0;
  if (status === 'cancelled') {
    const paymentStatus = order.paymentStatus;
    const totalAmount = order.total || 0;

    if (paymentStatus === 'paid' || paymentStatus === 'held' || paymentStatus === 'pending') {
      try {
        const Customer = mongoose.model('Customer');
        const customer = await Customer.findById(order.buyer);

        if (customer) {
          refundAmount = totalAmount;

          console.log(`[Seller Cancel] Refunding ₦${refundAmount} to customer ${customer.email} for order ${order._id}`);

          const result = await customer.updateWalletBalance(
            refundAmount,
            'credit',
            `Refund for cancelled order ${order._id.toString()} (cancelled by seller)`,
            `REFUND_ORDER_${order._id.toString()}_${Date.now()}`,
            {
              orderId: order._id.toString(),
              refundAmount: refundAmount,
              reason: 'Order cancelled by seller',
              paymentStatus: paymentStatus,
            }
          );

          // Update order payment status to refunded
          order.paymentStatus = 'refunded';
          await order.save();

          console.log(`[Seller Cancel] Refunded ₦${refundAmount} to customer ${customer.email}. New wallet balance: ₦${result.wallet.balance}`);
        }
      } catch (refundError) {
        console.error('[Seller Cancel] Refund failed:', refundError);
      }
    } else {
      console.log(`[Seller Cancel] No refund. Payment status: ${paymentStatus}`);
    }
  }

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
    cancelled: refundAmount > 0 ? `Your order has been cancelled. ₦${refundAmount.toLocaleString()} has been refunded to your wallet.` : 'Your order has been cancelled.',
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

// ─── CONFIRM DELIVERY & RELEASE ESCROW ──────────────────────────────────
const confirmDelivery = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user._id.toString();

  const order = await dB.orders.findById(orderId);
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');

  if (order.buyer.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only the buyer can confirm delivery.');
  }
  if (order.status !== 'delivered') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order has not been marked as delivered yet.');
  }
  if (order.confirmedByBuyer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Delivery already confirmed.');
  }
  if (order.disputed) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot confirm delivery while a dispute is open.');
  }

  const store = await dB.stores.findById(order.store).select('owner provider').lean();
  const providerId = (store?.owner || store?.provider)?.toString();
  if (!providerId) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found for this order.');

  const payoutAmount = (order.subtotal || 0) + (order.deliveryFee || 0);
  let providerWallet = null;
  let providerTxn = null;

  if (payoutAmount > 0) {
    const provider = await dB.providers.findById(providerId);
    if (provider) {
      const result = await provider.updateWalletBalance(
        payoutAmount,
        'credit',
        `Order payout for #${order._id.toString().slice(-6)}`,
        `ORDER_PAYOUT_${order._id.toString()}_${Date.now()}`,
        { orderId: order._id.toString(), subtotal: order.subtotal, deliveryFee: order.deliveryFee },
      );
      providerWallet = result.wallet;
      providerTxn = result.transaction;
    }
  }

  order.confirmedByBuyer = true;
  order.paymentStatus = 'released';
  order.escrowReleasedAt = new Date();
  order.autoReleaseAt = null;
  await order.save();

  notificationService.sendPushNotification({
    userId: providerId,
    actorType: 'provider',
    title: 'Payment Released',
    body: `₦${payoutAmount.toLocaleString()} released to your wallet for order #${order._id.toString().slice(-6)}.`,
    type: 'wallet',
    data: { orderId: order._id.toString(), screen: 'wallet' },
  }).catch(() => {});

  res.json({
    success: true,
    data: {
      order,
      providerWallet: providerWallet ? { balance: providerWallet.balance } : null,
      providerTransaction: providerTxn ? { id: providerTxn._id, amount: providerTxn.amount } : null,
    },
    message: `Delivery confirmed. ₦${payoutAmount.toLocaleString()} released to provider.`,
  });
});

// ─── GET MY ORDERS AS BUYER ────────────────────────────────────────────
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

const cancelOrder = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const order = await dB.orders.findOne({ _id: req.params.id, buyer: req.user._id });

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');
  }

  // Check if order can be cancelled
  const cancellableStatuses = ['pending', 'confirmed', 'processing'];
  if (!cancellableStatuses.includes(order.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Order cannot be cancelled at its current stage: ${order.status}`
    );
  }

  // Store payment info before updating
  const paymentStatus = order.paymentStatus;
  const totalAmount = order.total || 0;

  console.log('Order Cancel Debug:');
  console.log('Order ID:', order._id);
  console.log('Order Status:', order.status);
  console.log('Payment Status:', paymentStatus);
  console.log('Payment Method:', order.paymentMethod);
  console.log('Total Amount:', totalAmount);

  // Update order status
  order.status = 'cancelled';
  order.cancellationReason = reason || '';
  await order.save();

  // Refund customer if payment was made
  let refundAmount = 0;

  // Check all possible paid statuses
  if (paymentStatus === 'paid' || paymentStatus === 'held' || paymentStatus === 'pending') {
    try {
      const Customer = mongoose.model('Customer');
      const customer = await Customer.findById(req.user._id);

      if (customer) {
        refundAmount = totalAmount;

        console.log(`Attempting refund of ₦${refundAmount} to customer ${customer.email}`);

        const result = await customer.updateWalletBalance(
          refundAmount,
          'credit',
          `Refund for cancelled order ${order._id.toString()}`,
          `REFUND_ORDER_${order._id.toString()}_${Date.now()}`,
          {
            orderId: order._id.toString(),
            refundAmount: refundAmount,
            reason: reason || 'Order cancelled by customer',
            paymentStatus: paymentStatus,
          }
        );

        // Update order payment status to refunded
        order.paymentStatus = 'refunded';
        await order.save();

        console.log(`Refunded ₦${refundAmount} to customer ${customer.email} for cancelled order ${order._id.toString()}`);
        console.log(`New wallet balance: ₦${result.wallet.balance}`);
      }
    } catch (refundError) {
      console.error('Refund failed:', refundError);
    }
  } else {
    console.log(`No refund processed. Payment status: ${paymentStatus}`);
  }

  // Send notification to store owner
  const store = await dB.stores.findById(order.store);
  if (store) {
    notificationService.sendPushNotification({
      userId: store.provider.toString(),
      actorType: 'provider',
      title: 'Order Cancelled',
      body: `A customer has cancelled their order. ${refundAmount > 0 ? `₦${refundAmount.toLocaleString()} has been refunded.` : ''}`,
      type: 'order',
      data: {
        orderId: order._id.toString(),
        refunded: refundAmount > 0,
        refundAmount: refundAmount,
      },
    }).catch(() => { });
  }

  // Send refund notification to customer
  if (refundAmount > 0) {
    notificationService.sendPushNotification({
      userId: req.user._id.toString(),
      actorType: 'customer',
      title: 'Refund Processed',
      body: `₦${refundAmount.toLocaleString()} has been refunded to your wallet for cancelled order.`,
      type: 'payment',
      data: {
        orderId: order._id.toString(),
        refundAmount: refundAmount,
      },
    }).catch(() => { });
  }

  // Populate for response
  const populatedOrder = await dB.orders
    .findById(order._id)
    .populate('buyer', 'fullName email phoneNumber profilePhoto')
    .populate('store', 'name logo');

  res.json({
    success: true,
    message: 'Order cancelled successfully.',
    order: populatedOrder,
    refunded: refundAmount > 0,
    refundAmount: refundAmount,
    paymentStatus: paymentStatus,
  });
});

// ─────────────────────────────────────────
// DELIVERY FEE NEGOTIATION
// Customer proposes a delivery fee; seller can accept, counter, or decline.
// ─────────────────────────────────────────

// Load an order + resolve the acting party (buyer or the store's provider)
async function loadNegotiationOrder(req) {
  const order = await dB.orders.findById(req.params.orderId).populate('store', 'provider owner');
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');

  const userId = req.user._id.toString();
  const buyerId = order.buyer?._id ? order.buyer._id.toString() : order.buyer?.toString();
  const store = order.store;
  const providerId = (store?.provider || store?.owner || '')?.toString();
  const isBuyer = buyerId === userId;
  const isSeller = providerId === userId;
  if (!isBuyer && !isSeller) throw new ApiError(httpStatus.FORBIDDEN, 'Access denied.');

  return { order, isBuyer, isSeller, buyerId, providerId };
}

function parseNegotiationAmount(raw) {
  const amount = Math.round(Number(raw));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A valid delivery fee amount is required.');
  }
  return amount;
}

function recomputeOrderTotal(order) {
  const serviceFee = order.serviceFee ?? Math.round((order.subtotal || 0) * 0.10);
  order.serviceFee = serviceFee;
  order.total = (order.subtotal || 0) + (order.deliveryFee || 0) + serviceFee;
}

async function notifyNegotiationUpdate(order, { targetUserId, actorType, title, body }) {
  if (!targetUserId) return;
  notificationService
    .sendPushNotification({
      userId: targetUserId,
      actorType,
      title,
      body,
      type: 'order',
      data: {
        orderId: order._id.toString(),
        route: 'order-details',
        negotiationStatus: order.deliveryFeeNegotiation?.status || 'pending',
      },
    })
    .catch(() => {});
}

// Customer proposes a (new) delivery fee for the order
const proposeDeliveryFee = catchAsync(async (req, res) => {
  const amount = parseNegotiationAmount(req.body.amount);
  const { order, isBuyer, providerId } = await loadNegotiationOrder(req);

  if (!isBuyer) throw new ApiError(httpStatus.FORBIDDEN, 'Only the buyer can propose a delivery fee.');
  if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Order is already ${order.status}.`);
  }

  order.deliveryFee = amount;
  recomputeOrderTotal(order);
  order.deliveryFeeNegotiation = {
    amount,
    counterAmount: null,
    status: 'pending',
    proposedBy: 'customer',
    updatedAt: new Date(),
  };
  order.markModified('deliveryFeeNegotiation');
  await order.save();

  await notifyNegotiationUpdate(order, {
    targetUserId: providerId,
    actorType: 'provider',
    title: 'Delivery Fee Offer',
    body: `Customer proposed ₦${amount.toLocaleString()} delivery fee for order #${order._id.toString().slice(-6)}.`,
  });

  res.json({ success: true, message: `Delivery fee of ₦${amount.toLocaleString()} proposed.`, order });
});

// Either party counters the current proposal with a new amount
// Either party counters the current proposal with a new amount
const counterDeliveryFee = catchAsync(async (req, res) => {
  const amount = parseNegotiationAmount(req.body.amount);
  const { order, isBuyer, buyerId, providerId } = await loadNegotiationOrder(req);

  const neg = order.deliveryFeeNegotiation;
  if (!neg) throw new ApiError(httpStatus.BAD_REQUEST, 'No delivery fee negotiation for this order.');
  if (neg.status === 'accepted' || neg.status === 'declined') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Negotiation is already ${neg.status}. Start a new proposal instead.`);
  }

  const actor = isBuyer ? 'customer' : 'seller';
  if (neg.status === 'pending' && neg.proposedBy === actor) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Your proposal is still pending. Wait for the other party to respond.');
  }

  order.deliveryFeeNegotiation = {
    amount: neg.amount ?? amount,
    counterAmount: amount,
    status: 'countered',
    proposedBy: actor,
    updatedAt: new Date(),
  };
  order.markModified('deliveryFeeNegotiation');
  await order.save();

  await notifyNegotiationUpdate(order, {
    targetUserId: isBuyer ? providerId : buyerId,
    actorType: isBuyer ? 'provider' : 'customer',
    title: 'Delivery Fee Counter-Offer',
    body: `${actor === 'seller' ? 'Seller' : 'Customer'} counter-offered ₦${amount.toLocaleString()} delivery fee for order #${order._id.toString().slice(-6)}.`,
  });

  res.json({ success: true, message: `Counter-offer of ₦${amount.toLocaleString()} sent.`, order });
});

// The party who did NOT make the last proposal accepts it → fee is locked in
const acceptDeliveryFee = catchAsync(async (req, res) => {
  const { order, isBuyer, buyerId, providerId } = await loadNegotiationOrder(req);

  const neg = order.deliveryFeeNegotiation;
  if (!neg) throw new ApiError(httpStatus.BAD_REQUEST, 'No delivery fee negotiation for this order.');
  if (neg.status === 'accepted') throw new ApiError(httpStatus.BAD_REQUEST, 'Negotiation is already accepted.');
  if (neg.status === 'declined') throw new ApiError(httpStatus.BAD_REQUEST, 'Negotiation was declined. Start a new proposal.');
  if (neg.status === 'pending' && neg.proposedBy === (isBuyer ? 'customer' : 'seller')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot accept your own proposal.');
  }

  const agreed = Math.round(Number(neg.counterAmount ?? neg.amount ?? order.deliveryFee ?? 0));
  order.deliveryFee = agreed;
  recomputeOrderTotal(order);
  order.deliveryFeeNegotiation = {
    amount: agreed,
    counterAmount: null,
    status: 'accepted',
    proposedBy: neg.proposedBy,
    updatedAt: new Date(),
  };
  order.markModified('deliveryFeeNegotiation');
  await order.save();

  await notifyNegotiationUpdate(order, {
    targetUserId: isBuyer ? providerId : buyerId,
    actorType: isBuyer ? 'provider' : 'customer',
    title: 'Delivery Fee Agreed',
    body: `Delivery fee of ₦${agreed.toLocaleString()} agreed for order #${order._id.toString().slice(-6)}.`,
  });

  res.json({
    success: true,
    message: `Agreed delivery fee: ₦${agreed.toLocaleString()}`,
    order,
  });
});

// Decline the negotiation (the order keeps its current delivery fee)
const declineDeliveryFee = catchAsync(async (req, res) => {
  const { order, isBuyer, buyerId, providerId } = await loadNegotiationOrder(req);

  const neg = order.deliveryFeeNegotiation;
  if (!neg) throw new ApiError(httpStatus.BAD_REQUEST, 'No delivery fee negotiation for this order.');
  if (neg.status === 'accepted' || neg.status === 'declined') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Negotiation is already ${neg.status}.`);
  }

  neg.status = 'declined';
  neg.counterAmount = null;
  neg.updatedAt = new Date();
  order.markModified('deliveryFeeNegotiation');
  await order.save();

  await notifyNegotiationUpdate(order, {
    targetUserId: isBuyer ? providerId : buyerId,
    actorType: isBuyer ? 'provider' : 'customer',
    title: 'Delivery Fee Declined',
    body: `${isBuyer ? 'Customer' : 'Seller'} declined the delivery fee negotiation for order #${order._id.toString().slice(-6)}.`,
  });

  res.json({ success: true, message: 'Negotiation declined.', order });
});

// Current negotiation state for an order
const getDeliveryFeeNegotiation = catchAsync(async (req, res) => {
  const { order } = await loadNegotiationOrder(req);
  res.json({
    success: true,
    deliveryFee: order.deliveryFee,
    deliveryFeeNegotiation: order.deliveryFeeNegotiation,
  });
});

module.exports = {
  createStore, getMyStore, updateStore, getStoreStats, listStores, getStore,
  createProduct, getProduct, updateProduct, deleteProduct, getStoreProducts, searchProducts, getFeaturedProducts, getTrendingProducts,
  createOrder, getOrder, updateOrderStatus, getMyOrdersAsBuyer, getMyOrdersAsSeller,
  createReview, getTargetReviews, cancelOrder,
  confirmDelivery,
  proposeDeliveryFee, counterDeliveryFee, acceptDeliveryFee, declineDeliveryFee, getDeliveryFeeNegotiation
};
