/**
 * adminOps.controller.js — SEPARATE admin-ops handlers.
 * Isolated from controllers/admin.controller.js (no imports from it, no edits to it).
 *
 * KYC single source of truth:
 *   KYC collection status enum: not_started | submitted | pending | approved | rejected
 *   - pendingKYC  = submitted + pending
 *   - noKyc       = not_started + no record
 *   - approved / rejected = final
 * Provider.kycStatus ('pending','approved','failed') is legacy/Dojah-driven and
 * only used as a fallback display hint, never as the pending count.
 */
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const notificationService = require('../services/notification.service');
const adminOpsService = require('../services/adminOps.service');
const { getIo } = require('../utils/io');
const { isOnline } = require('../config/socket');

let WithdrawalModel = null;
try {
  WithdrawalModel = require('../models/Withdrawal');
} catch (_) {
  WithdrawalModel = null;
}

const KYC_PENDING = ['submitted', 'pending'];

// ─── internal helpers ─────────────────────────────────────────────

async function getKycStatusForProvider(providerId) {
  const rec = await dB.kyc.findOne({ userId: providerId.toString() }).lean();
  if (!rec) return 'not_started';
  return rec.status || 'not_started';
}

async function creditCustomerRefund(customerId, amount, reference, description, metadata) {
  const customer = await dB.customers.findById(customerId);
  if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found for refund.');
  const result = await customer.updateWalletBalance(amount, 'credit', description, reference, metadata);
  // normalise txn type to refund for admin reporting
  try {
    await dB.transactions.findByIdAndUpdate(result.transaction._id, { type: 'refund' });
    result.transaction.type = 'refund';
  } catch (_) {}
  return result;
}

async function creditProviderPayout(providerId, amount, reference, description, metadata) {
  const provider = await dB.providers.findById(providerId);
  if (!provider) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found for payout.');
  const result = await provider.updateWalletBalance(amount, 'credit', description, reference, metadata);
  try {
    await dB.transactions.findByIdAndUpdate(result.transaction._id, { type: 'escrow_release' });
    result.transaction.type = 'escrow_release';
  } catch (_) {}
  return result;
}

function orderPayoutAmount(order) {
  return Number(order.total || order.subtotal || 0);
}

function bookingPayoutAmount(booking) {
  return Number(booking.serviceFee || booking.totalAmount || 0);
}

// Shared pagination parsing: returns { page, limit, skip }
function paging(query, { defLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(0, Number(query.page) || 0);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defLimit));
  return { page, limit, skip: page * limit };
}

// ─── 1. dashboard-v2 (correct KYC) ────────────────────────────────

const getDashboardV2 = catchAsync(async (req, res) => {
  const [
    totalProviders,
    totalCustomers,
    totalBookings,
    completedBookings,
    pendingBookings,
    disputedBookings,
    totalOrders,
    pendingOrders,
    kycAgg,
  ] = await Promise.all([
    dB.providers.countDocuments(),
    dB.customers.countDocuments(),
    dB.bookings.countDocuments(),
    dB.bookings.countDocuments({ status: 'completed' }),
    dB.bookings.countDocuments({ status: 'pending' }),
    dB.bookings.countDocuments({ status: 'disputed' }),
    dB.orders.countDocuments(),
    dB.orders.countDocuments({ status: 'pending' }),
    // KYC truth lives on the Provider model: idle | pending | approved | failed
    dB.providers.aggregate([{ $group: { _id: '$kycStatus', count: { $sum: 1 } } }]),
  ]);

  const kycMap = new Map(kycAgg.map((k) => [k._id || 'idle', k.count]));
  const kycPending = kycMap.get('pending') || 0;
  const kycApproved = kycMap.get('approved') || 0;
  const kycFailed = kycMap.get('failed') || 0;
  const kycNoKyc = kycMap.get('idle') || Math.max(0, totalProviders - kycPending - kycApproved - kycFailed);

  // ── PLATFORM REVENUE CALCULATION ────────────────────────────────
  // Bookings: platform makes ₦1,500 per completed booking
  const bookingRevenue = completedBookings * 1500;

  // Marketplace: platform makes 10% commission on non-cancelled orders
  const orderRevenueAgg = await dB.orders.aggregate([
    {
      $match: {
        status: { $nin: ['cancelled', 'refunded'] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
      },
    },
  ]);
  const orderVolume = orderRevenueAgg[0]?.total || 0;
  const marketplaceRevenue = Math.round(orderVolume * 0.1);

  // Subscriptions: sum of subscription transaction amounts
  const subscriptionRevenueAgg = await dB.transactions.aggregate([
    { $match: { type: 'subscription', status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const subscriptionRevenue = subscriptionRevenueAgg[0]?.total || 0;

  const totalRevenue = bookingRevenue + marketplaceRevenue + subscriptionRevenue;

  // Today's revenue (same calculation, today only)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCompletedBookings = await dB.bookings.countDocuments({
    status: 'completed',
    completedAt: { $gte: todayStart },
  });
  const todayBookingRevenue = todayCompletedBookings * 1500;

  const todayOrderRevenueAgg = await dB.orders.aggregate([
    {
      $match: {
        status: { $nin: ['cancelled', 'refunded'] },
        updatedAt: { $gte: todayStart },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
      },
    },
  ]);
  const todayOrderVolume = todayOrderRevenueAgg[0]?.total || 0;
  const todayMarketplaceRevenue = Math.round(todayOrderVolume * 0.1);

  const todaySubscriptionRevenueAgg = await dB.transactions.aggregate([
    {
      $match: {
        type: 'subscription',
        status: 'success',
        createdAt: { $gte: todayStart },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const todaySubscriptionRevenue = todaySubscriptionRevenueAgg[0]?.total || 0;

  const todayRevenue = todayBookingRevenue + todayMarketplaceRevenue + todaySubscriptionRevenue;

  res.json({
    totalProviders,
    totalCustomers,
    totalBookings,
    completedBookings,
    pendingBookings,
    disputedBookings,
    totalOrders,
    pendingOrders,
    kyc: {
      pending: kycPending,
      approved: kycApproved,
      failed: kycFailed,
      noKyc: kycNoKyc,
      source: 'provider.kycStatus',
    },
    pendingKYC: kycPending, // backwards-compat alias
    // Platform revenue breakdown
    totalRevenue,
    todayRevenue,
    revenueBreakdown: {
      bookings: bookingRevenue,
      marketplace: marketplaceRevenue,
      subscriptions: subscriptionRevenue,
    },
    todayRevenueBreakdown: {
      bookings: todayBookingRevenue,
      marketplace: todayMarketplaceRevenue,
      subscriptions: todaySubscriptionRevenue,
    },
  });
});

// ─── 2. finance/overview ──────────────────────────────────────────

const getFinanceOverview = catchAsync(async (req, res) => {
  const [paystack, withdrawnAgg, volumeAgg, customerWalletsAgg, providerWalletsAgg] = await Promise.all([
    adminOpsService.getPaystackAvailableBalance(),
    WithdrawalModel
      ? WithdrawalModel.aggregate([
          { $match: { status: { $in: ['completed', 'processing'] } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]).catch(() => [])
      : Promise.resolve([]),
    dB.transactions.aggregate([
      { $match: { type: { $in: ['credit', 'escrow_release'] }, status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    dB.wallets.aggregate([
      { $match: { ownerType: 'customer' } },
      { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]),
    dB.wallets.aggregate([
      { $match: { ownerType: 'provider' } },
      { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]),
  ]);

  // ── Ranked earners: ALL providers by jobs + orders, with photos ──
  const [topByOrders, topByBookings] = await Promise.all([
    dB.orders.aggregate([
      { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
      { $lookup: { from: 'stores', localField: 'store', foreignField: '_id', as: 'store' } },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$store.provider', orders: { $sum: 1 }, orderVolume: { $sum: '$total' } } },
    ]),
    dB.bookings.aggregate([
      { $match: { status: { $nin: ['cancelled', 'declined'] } } },
      { $group: { _id: '$provider', jobs: { $sum: 1 }, jobVolume: { $sum: '$serviceFee' } } },
    ]),
  ]);

  const allProviderIds = [...new Set([
    ...topByOrders.map((t) => String(t._id)),
    ...topByBookings.map((t) => String(t._id)),
  ])].filter(Boolean);

  const providersAll = allProviderIds.length
    ? await dB.providers.find({ _id: { $in: allProviderIds } })
        .select('fullName email phoneNumber profile profilePhoto rating avgRating totalJobs walletBalance')
        .lean()
    : [];
  const provById = new Map(providersAll.map((p) => [String(p._id), p]));
  const orderMap = new Map(topByOrders.map((t) => [String(t._id), t]));
  const bookMap = new Map(topByBookings.map((t) => [String(t._id), t]));

  const rankedProviders = allProviderIds.map((id) => {
    const p = provById.get(id) || {};
    const o = orderMap.get(id) || {};
    const b = bookMap.get(id) || {};
    return {
      provider: {
        _id: id,
        fullName: p.fullName || 'Provider',
        email: p.email || '',
        phoneNumber: p.phoneNumber || '',
        profilePhoto: p.profilePhoto || p.profile?.photo || null,
        profile: p.profile || null,
        rating: p.avgRating ?? p.rating ?? null,
      },
      orders: o.orders || 0,
      jobs: b.jobs || 0,
      totalWork: (o.orders || 0) + (b.jobs || 0),
      volume: (o.orderVolume || 0) + (b.jobVolume || 0),
    };
  }).sort((a, b) => (b.totalWork - a.totalWork) || (b.volume - a.volume));

  // assign rank #1, #2, #3 ...
  rankedProviders.forEach((r, i) => { r.rank = i + 1; });

  const topProviders = rankedProviders.slice(0, 5);

  // ── Customer wallet balances (paginated, top by balance, photos) ─
  const { page: cPage, limit: cLimit, skip: cSkip } = paging(req.query, { defLimit: 25, maxLimit: 100 });
  const [customerWalletsRaw, customerWalletTotal] = await Promise.all([
    dB.wallets
      .find({ ownerType: 'customer', balance: { $gt: 0 } })
      .sort({ balance: -1 })
      .skip(cSkip)
      .limit(cLimit)
      .lean(),
    dB.wallets.countDocuments({ ownerType: 'customer', balance: { $gt: 0 } }),
  ]);
  const customerIds = customerWalletsRaw.map((w) => w.owner);
  const customersAll = customerIds.length
    ? await dB.customers.find({ _id: { $in: customerIds } })
        .select('fullName email phoneNumber profilePhoto location')
        .lean()
    : [];
  const custById = new Map(customersAll.map((c) => [String(c._id), c]));
  const customerWallets = customerWalletsRaw.map((w) => {
    const c = custById.get(String(w.owner)) || {};
    return {
      customerId: String(w.owner),
      fullName: c.fullName || 'Customer',
      email: c.email || '',
      phoneNumber: c.phoneNumber || '',
      profilePhoto: c.profilePhoto || null,
      balance: Number(w.balance) || 0,
    };
  });

  const totalWithdrawn = withdrawnAgg[0]?.total || 0;

  // ── Correct platform revenue (not full transaction volume) ────────
  const completedBookingsCount = await dB.bookings.countDocuments({ status: 'completed' });
  const bookingRevenue = completedBookingsCount * 1500;

  const orderRevenueAgg = await dB.orders.aggregate([
    { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);
  const orderVolume = orderRevenueAgg[0]?.total || 0;
  const marketplaceRevenue = Math.round(orderVolume * 0.1);

  const subscriptionRevenueAgg = await dB.transactions.aggregate([
    { $match: { type: 'subscription', status: 'success' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const subscriptionRevenue = subscriptionRevenueAgg[0]?.total || 0;

  const allTimeVolume = bookingRevenue + marketplaceRevenue + subscriptionRevenue;

  res.json({
    paystack: {
      available: paystack.available,
      unavailable: !!paystack.unavailable,
      error: paystack.error || null,
      raw: paystack.raw || [],
    },
    totals: {
      totalWithdrawn,
      withdrawalCount: withdrawnAgg[0]?.count || 0,
      allTimeVolume,
      allTimeCount: volumeAgg[0]?.count || 0,
      customerBalanceTotal: customerWalletsAgg[0]?.total || 0,
      customerWalletCount: customerWalletsAgg[0]?.count || 0,
      providerBalanceTotal: providerWalletsAgg[0]?.total || 0,
      providerWalletCount: providerWalletsAgg[0]?.count || 0,
      // Revenue breakdown
      bookingRevenue,
      marketplaceRevenue,
      subscriptionRevenue,
    },
    customerWallets,
    customerWalletsPagination: { page: cPage, limit: cLimit, total: customerWalletTotal, totalPages: Math.ceil(customerWalletTotal / cLimit) },
    rankedProviders,
    rankedProvidersTotal: rankedProviders.length,
    topProviders,
    topProvider: rankedProviders[0] || null,
  });
});

// ─── 3. admin cancel (any state except completed) + refund ────────

const BOOKING_FINAL_NO_CANCEL = ['completed'];
const ORDER_FINAL_NO_CANCEL = ['delivered'];

const adminCancelBooking = catchAsync(async (req, res) => {
  const booking = await dB.bookings.findById(req.params.id);
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
  if (BOOKING_FINAL_NO_CANCEL.includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Completed bookings cannot be cancelled by admin.');
  }
  if (booking.status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Booking is already cancelled.');
  }

  const reason = req.body?.reason || 'Cancelled by admin';
  const prevStatus = booking.status;
  const refundAmount = Number(booking.serviceFee || booking.totalAmount || 0);
  const shouldRefund = refundAmount > 0 && booking.paymentStatus !== 'refunded';

  booking.status = 'cancelled';
  booking.cancellationReason = reason;
  booking.cancelledBy = 'admin';
  booking.timeline.push({ status: 'cancelled', note: `Admin cancel (was ${prevStatus}): ${reason}`, timestamp: new Date() });
  await booking.save();

  let refund = null;
  if (shouldRefund) {
    try {
      const result = await creditCustomerRefund(
        booking.customer.toString(),
        refundAmount,
        `ADMIN_REFUND_BOOKING_${booking._id.toString()}_${Date.now()}`,
        `Admin refund for cancelled booking ${booking._id.toString()}`,
        { bookingId: booking._id.toString(), reason, prevStatus, cancelledBy: 'admin' }
      );
      booking.paymentStatus = 'refunded';
      await booking.save();
      refund = { amount: refundAmount, walletBalance: result.wallet.balance, transactionId: result.transaction._id };
    } catch (e) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Booking cancelled but refund failed: ${e.message}`);
    }
  }

  const io = getIo();
  if (io) {
    const payload = { bookingId: booking._id.toString(), status: 'cancelled', refunded: !!refund, refundAmount: refund?.amount || 0, updatedAt: new Date() };
    io.to(`user_${booking.customer.toString()}`).emit('booking_updated', payload);
    io.to(`user_${booking.provider.toString()}`).emit('booking_updated', payload);
    io.to('admin_support').emit('booking_updated', payload);
  }

  notificationService.sendPushNotification({
    userId: booking.customer.toString(), actorType: 'customer',
    title: 'Booking Cancelled by Admin', body: refund ? `₦${refundAmount.toLocaleString()} refunded to your wallet. Reason: ${reason}` : `Reason: ${reason}`,
    type: 'booking', data: { bookingId: booking._id.toString(), refunded: !!refund },
  }).catch(() => {});
  notificationService.sendPushNotification({
    userId: booking.provider.toString(), actorType: 'provider',
    title: 'Booking Cancelled by Admin', body: `Reason: ${reason}`,
    type: 'booking', data: { bookingId: booking._id.toString() },
  }).catch(() => {});

  res.json({ message: 'Booking cancelled by admin.', booking, refund });
});

const adminCancelOrder = catchAsync(async (req, res) => {
  const order = await dB.orders.findById(req.params.id);
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');
  const isReleased = order.paymentStatus === 'released' || !!order.escrowReleasedAt;
  if (ORDER_FINAL_NO_CANCEL.includes(order.status) && isReleased) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Completed (released) orders cannot be cancelled by admin.');
  }
  if (['cancelled', 'refunded'].includes(order.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order is already cancelled/refunded.');
  }

  const reason = req.body?.reason || 'Cancelled by admin';
  const refundAmount = orderPayoutAmount(order);
  const shouldRefund = refundAmount > 0 && !['refunded'].includes(order.paymentStatus);

  order.status = 'cancelled';
  order.cancellationReason = reason;
  await order.save();

  let refund = null;
  if (shouldRefund) {
    try {
      const result = await creditCustomerRefund(
        order.buyer.toString(),
        refundAmount,
        `ADMIN_REFUND_ORDER_${order._id.toString()}_${Date.now()}`,
        `Admin refund for cancelled order ${order._id.toString()}`,
        { orderId: order._id.toString(), reason, cancelledBy: 'admin' }
      );
      order.paymentStatus = 'refunded';
      await order.save();
      refund = { amount: refundAmount, walletBalance: result.wallet.balance, transactionId: result.transaction._id };
    } catch (e) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Order cancelled but refund failed: ${e.message}`);
    }
  }

  const io = getIo();
  if (io) {
    const payload = { orderId: order._id.toString(), status: 'cancelled', refunded: !!refund, refundAmount: refund?.amount || 0, updatedAt: new Date() };
    io.to(`user_${order.buyer.toString()}`).emit('order_updated', payload);
    io.to('admin_support').emit('order_updated', payload);
    try {
      const store = await dB.stores.findById(order.store).select('provider').lean();
      if (store?.provider) io.to(`user_${store.provider.toString()}`).emit('order_updated', payload);
    } catch (_) {}
  }

  notificationService.sendPushNotification({
    userId: order.buyer.toString(), actorType: 'customer',
    title: 'Order Cancelled by Admin', body: refund ? `₦${refundAmount.toLocaleString()} refunded to your wallet. Reason: ${reason}` : `Reason: ${reason}`,
    type: 'order', data: { orderId: order._id.toString(), refunded: !!refund },
  }).catch(() => {});

  res.json({ message: 'Order cancelled by admin.', order, refund });
});

// ─── 4a. payout queue ─────────────────────────────────────────────
// A provider's total money owed lives in THREE places, not just the wallet:
//   1. wallet.balance          — escrow already released into the wallet
//   2. held booking escrow     — customer paid, job in progress/completed but
//                                paymentStatus still 'held' (never auto-credited)
//   3. held order escrow       — order delivered, awaiting release
// The queue must show the SUM so the admin sees the true balance (e.g. ₦1.2M,
// not just the ₦4,300 already sitting in the wallet). Providers whose money is
// entirely in escrow (wallet == 0) must still appear.

// Statuses of a held booking whose escrow is legitimately owed to the provider
// (customer paid AND provider engaged). Excludes 'pending' (unaccepted, still
// refundable), plus declined/cancelled/disputed.
const BOOKING_OWED_STATUSES = ['accepted', 'on-the-way', 'arrived', 'assessment', 'in-progress', 'completed'];

async function collectReleasable(limit = 100, skip = 0) {
  // 1) Held booking escrow grouped by provider
  const heldBookings = await dB.bookings
    .find({ paymentStatus: 'held', status: { $in: BOOKING_OWED_STATUSES } })
    .select('provider serviceFee totalAmount')
    .lean();
  const bookingEscrowByProvider = new Map();
  for (const b of heldBookings) {
    const pid = String(b.provider);
    bookingEscrowByProvider.set(pid, (bookingEscrowByProvider.get(pid) || 0) + bookingPayoutAmount(b));
  }

  // 2) Held order escrow grouped by provider (order.store -> store.provider)
  const heldOrders = await dB.orders
    .find({ paymentStatus: 'held', status: 'delivered', disputed: { $ne: true } })
    .select('store total subtotal')
    .lean();
  const orderEscrowByProvider = new Map();
  if (heldOrders.length) {
    const storeIds = [...new Set(heldOrders.map((o) => String(o.store)))];
    const stores = await dB.stores.find({ _id: { $in: storeIds } }).select('provider').lean();
    const providerByStore = new Map(stores.map((s) => [String(s._id), s.provider ? String(s.provider) : null]));
    for (const o of heldOrders) {
      const pid = providerByStore.get(String(o.store));
      if (!pid) continue;
      orderEscrowByProvider.set(pid, (orderEscrowByProvider.get(pid) || 0) + orderPayoutAmount(o));
    }
  }

  // 3) Wallet balances
  const wallets = await dB.wallets.find({ ownerType: 'provider', isActive: true }).lean();
  const walletByProvider = new Map();
  for (const w of wallets) {
    const bal = Number(w.balance) || 0;
    if (bal > 0) walletByProvider.set(String(w.owner), { balance: bal, wallet: w });
  }

  // 4) Union of every provider that is owed anything
  const providerIds = new Set([
    ...bookingEscrowByProvider.keys(),
    ...orderEscrowByProvider.keys(),
    ...walletByProvider.keys(),
  ]);

  const rows = [...providerIds]
    .map((pid) => {
      const walletBalance = walletByProvider.get(pid)?.balance || 0;
      const bookingEscrow = bookingEscrowByProvider.get(pid) || 0;
      const orderEscrow = orderEscrowByProvider.get(pid) || 0;
      return {
        pid,
        walletBalance,
        bookingEscrow,
        orderEscrow,
        amount: walletBalance + bookingEscrow + orderEscrow,
        wallet: walletByProvider.get(pid)?.wallet || null,
      };
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const providerCount = rows.length;
  const payoutTotal = rows.reduce((s, r) => s + r.amount, 0);
  const pageRows = rows.slice(skip, skip + limit);

  // Enrich this page with provider + bank details
  const pageIds = pageRows.map((r) => r.pid);
  const providers = pageIds.length
    ? await dB.providers
        .find({ _id: { $in: pageIds } })
        .select('fullName email phoneNumber profile profilePhoto bankDetails kycStatus')
        .lean()
    : [];
  const byId = new Map(providers.map((p) => [String(p._id), p]));

  const items = pageRows.map((r) => {
    const p = byId.get(r.pid) || {};
    const bank = r.wallet?.bankDetails?.accountNumber ? r.wallet.bankDetails : p.bankDetails || {};
    return {
      targetType: 'provider_payout',
      targetId: r.pid, // provider id
      walletId: r.wallet ? String(r.wallet._id) : null,
      amount: r.amount,
      walletBalance: r.walletBalance,
      bookingEscrow: r.bookingEscrow,
      orderEscrow: r.orderEscrow,
      provider: {
        _id: r.pid,
        fullName: p.fullName || 'Provider',
        email: p.email || '',
        phoneNumber: p.phoneNumber || '',
        profilePhoto: p.profilePhoto || p.profile?.photo || null,
        profile: p.profile || null,
      },
      bankDetails: {
        bankName: bank.bankName || '',
        accountName: bank.accountName || '',
        accountNumber: bank.accountNumber || '',
        isVerified: !!bank.isVerified,
      },
      label: `${p.fullName || 'Provider'} — total owed`,
    };
  });

  return { items, payoutTotal, providerCount };
}

const getPayoutQueue = catchAsync(async (req, res) => {
  const { page, limit, skip } = paging(req.query, { defLimit: 25, maxLimit: 100 });
  const { items, payoutTotal, providerCount } = await collectReleasable(limit, skip);
  const paystack = await adminOpsService.getPaystackAvailableBalance();
  res.json({
    items, payoutTotal, providerCount,
    pagination: { page, limit, total: providerCount, totalPages: Math.ceil(providerCount / limit) },
    bookingCount: 0, orderCount: 0, // kept for backwards-compat shape
    paystackAvailable: paystack.available,
    paystackUnavailable: !!paystack.unavailable,
    sufficient: paystack.unavailable ? null : paystack.available >= payoutTotal,
    shortfall: paystack.unavailable ? null : Math.max(0, payoutTotal - paystack.available),
  });
});

// ─── 4b. release single payout ──────────────────────────────────

async function releaseOne(targetType, targetId, note, adminId) {
  // ── Provider wallet payout (the primary flow) ─────────────────
  // CRITICAL: Paystack transfer MUST succeed before we zero the wallet
  // or mark anything as released. If Paystack balance is insufficient
  // or the transfer fails, we throw and nothing is modified.
  if (targetType === 'provider_payout') {
    const providerId = String(targetId);
    const provider = await dB.providers.findById(providerId);
    if (!provider) throw new ApiError(httpStatus.NOT_FOUND, `Provider ${providerId} not found.`);

    const wallet = await dB.wallets.findOne({ owner: providerId, ownerType: 'provider', isActive: true });
    const walletAmount = wallet ? Number(wallet.balance) || 0 : 0;

    // Held booking escrow owed to this provider (same filter as the queue)
    const heldBookings = await dB.bookings
      .find({ provider: providerId, paymentStatus: 'held', status: { $in: BOOKING_OWED_STATUSES } })
      .select('serviceFee totalAmount')
      .lean();
    const bookingEscrow = heldBookings.reduce((s, b) => s + bookingPayoutAmount(b), 0);

    // Held order escrow owed to this provider (through their store(s))
    const stores = await dB.stores.find({ provider: providerId }).select('_id').lean();
    const storeIds = stores.map((s) => s._id);
    const heldOrders = storeIds.length
      ? await dB.orders
          .find({ store: { $in: storeIds }, paymentStatus: 'held', status: 'delivered', disputed: { $ne: true } })
          .select('total subtotal')
          .lean()
      : [];
    const orderEscrow = heldOrders.reduce((s, o) => s + orderPayoutAmount(o), 0);

    const totalAmount = walletAmount + bookingEscrow + orderEscrow;
    if (totalAmount <= 0) {
      return { targetType, targetId, skipped: true, reason: 'nothing owed' };
    }

    // ── STEP 1: Check Paystack available balance BEFORE any transfer ──
    const paystack = await adminOpsService.getPaystackAvailableBalance();
    if (paystack.unavailable) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack balance check failed. Cannot process payout.');
    }
    if (Number(paystack.available) < totalAmount) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Insufficient Paystack balance. Available: ₦${paystack.available.toLocaleString()}, Required: ₦${totalAmount.toLocaleString()}`
      );
    }

    const bank = wallet?.bankDetails?.accountNumber ? wallet.bankDetails : provider.bankDetails || {};
    if (!bank.accountNumber || !bank.bankCode || !process.env.PAYSTACK_SECRET_KEY) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Provider has no verified bank details or Paystack is not configured.');
    }

    const reference = `ADMIN_PAYOUT_${providerId}_${Date.now()}`;

    // ── STEP 2: Attempt live Paystack transfer ──
    let transfer;
    try {
      transfer = await adminOpsService.transferToProviderBank({
        amount: totalAmount,
        bankCode: bank.bankCode,
        accountNumber: bank.accountNumber,
        accountName: bank.accountName || provider.fullName,
        reason: `ServeNaija payout${note ? ` — ${note}` : ''}`,
        reference,
      });
    } catch (e) {
      // Transfer FAILED — do NOT zero wallet, do NOT mark as released
      throw new ApiError(httpStatus.BAD_REQUEST, `Paystack transfer failed: ${e.message}`);
    }

    const now = new Date();

    // ── STEP 3: Transfer succeeded — now zero wallet and mark released ──
    const balanceBefore = walletAmount;
    if (wallet) {
      wallet.balance = 0;
      await wallet.save();
    }

    // Mark every held booking escrow as released
    const bookingIds = heldBookings.map((b) => b._id);
    if (bookingIds.length) {
      await dB.bookings.updateMany(
        { _id: { $in: bookingIds }, paymentStatus: 'held' },
        { $set: { paymentStatus: 'released' }, $push: { timeline: { status: 'released', note: `Admin payout release${note ? ` — ${note}` : ''}`, timestamp: now } } }
      );
    }

    // Mark every held order escrow as released
    const orderIds = heldOrders.map((o) => o._id);
    if (orderIds.length) {
      await dB.orders.updateMany(
        { _id: { $in: orderIds }, paymentStatus: 'held' },
        { $set: { paymentStatus: 'released', escrowReleasedAt: now } }
      );
    }

    // One withdrawal transaction for the full amount (ledger integrity)
    const ledgerWallet = wallet || (await provider.getWallet());
    const txn = await dB.transactions.create({
      wallet: ledgerWallet._id,
      owner: providerId,
      ownerType: 'provider',
      type: 'withdrawal',
      amount: totalAmount,
      balanceBefore,
      balanceAfter: 0,
      currency: ledgerWallet.currency || 'NGN',
      description: `Admin payout to ${bank.accountName || provider.fullName} ${bank.accountNumber || ''} (wallet ${balanceBefore} + bookings ${bookingEscrow} + orders ${orderEscrow})${note ? ` — ${note}` : ''}`,
      reference,
      status: 'success',
      metadata: {
        releasedBy: adminId, bankDetails: bank, transfer, note,
        breakdown: { wallet: balanceBefore, bookingEscrow, orderEscrow },
        bookingIds: bookingIds.map(String), orderIds: orderIds.map(String),
      },
    });

    const io = getIo();
    if (io) {
      io.to(`user_${providerId}`).emit('payout_released', { providerId, amount: totalAmount, reference, transfer, at: now });
      io.to('admin_support').emit('payout_released', { providerId, amount: totalAmount, reference, at: now });
    }
    notificationService.sendPushNotification({
      userId: providerId, actorType: 'provider',
      title: 'Payout Released',
      body: `₦${totalAmount.toLocaleString()} has been transferred to your bank account ${bank.accountNumber}.`,
      type: 'payment', data: { amount: totalAmount, reference, transfer },
    }).catch(() => {});

    return {
      targetType, targetId, released: true, amount: totalAmount, transactionId: txn._id,
      breakdown: { wallet: balanceBefore, bookingEscrow, orderEscrow },
      bankDetails: bank, transfer,
      transferStatus: 'success',
    };
  }

  if (targetType === 'booking') {
    const booking = await dB.bookings.findById(targetId);
    if (!booking) throw new ApiError(httpStatus.NOT_FOUND, `Booking ${targetId} not found.`);
    if (booking.paymentStatus === 'released') return { targetType, targetId, skipped: true, reason: 'already released' };
    if (booking.paymentStatus === 'refunded' || booking.status === 'cancelled') return { targetType, targetId, skipped: true, reason: 'refunded/cancelled' };
    if (booking.status !== 'completed') throw new ApiError(httpStatus.BAD_REQUEST, `Booking is ${booking.status}; only completed can be released.`);
    const amount = bookingPayoutAmount(booking);
    if (amount <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Nothing to release.');
    const result = await creditProviderPayout(
      booking.provider.toString(), amount,
      `ADMIN_RELEASE_BOOKING_${booking._id.toString()}_${Date.now()}`,
      `Admin payout release for booking ${booking._id.toString()}${note ? ` - ${note}` : ''}`,
      { bookingId: booking._id.toString(), releasedBy: adminId, note }
    );
    booking.paymentStatus = 'released';
    booking.timeline.push({ status: 'completed', note: `Admin released N${amount} to provider`, timestamp: new Date() });
    await booking.save();
    const io = getIo();
    if (io) {
      const payload = { bookingId: booking._id.toString(), paymentStatus: 'released', releasedAmount: amount, updatedAt: new Date() };
      io.to(`user_${booking.customer.toString()}`).emit('booking_updated', payload);
      io.to(`user_${booking.provider.toString()}`).emit('booking_updated', payload);
    }
    notificationService.sendPushNotification({
      userId: booking.provider.toString(), actorType: 'provider',
      title: 'Payment Released', body: `N${amount.toLocaleString()} released to your wallet.`,
      type: 'payment', data: { bookingId: booking._id.toString(), amount },
    }).catch(() => {});
    return { targetType, targetId, released: true, amount, transactionId: result.transaction._id };
  }
  const order = await dB.orders.findById(targetId);
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, `Order ${targetId} not found.`);
  if (order.paymentStatus === 'released') return { targetType, targetId, skipped: true, reason: 'already released' };
  if (['refunded', 'cancelled'].includes(order.status) || order.paymentStatus === 'refunded') return { targetType, targetId, skipped: true, reason: 'refunded/cancelled' };
  if (order.status !== 'delivered' || order.disputed) throw new ApiError(httpStatus.BAD_REQUEST, 'Order must be delivered + undisputed.');
  const amount = orderPayoutAmount(order);
  if (amount <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Nothing to release.');
  const store = await dB.stores.findById(order.store).select('provider').lean();
  const providerId = store?.provider?.toString();
  if (!providerId) throw new ApiError(httpStatus.NOT_FOUND, 'Seller not found.');
  const result = await creditProviderPayout(
    providerId, amount,
    `ADMIN_RELEASE_ORDER_${order._id.toString()}_${Date.now()}`,
    `Admin payout release for order ${order._id.toString()}${note ? ` - ${note}` : ''}`,
    { orderId: order._id.toString(), releasedBy: adminId, note }
  );
  order.paymentStatus = 'released';
  order.escrowReleasedAt = new Date();
  await order.save();
  const io = getIo();
  if (io) {
    const payload = { orderId: order._id.toString(), paymentStatus: 'released', releasedAmount: amount, updatedAt: new Date() };
    io.to(`user_${order.buyer.toString()}`).emit('order_updated', payload);
    io.to(`user_${providerId}`).emit('order_updated', payload);
  }
  notificationService.sendPushNotification({
    userId: providerId, actorType: 'provider',
    title: 'Payment Released', body: `N${amount.toLocaleString()} released to your wallet.`,
    type: 'payment', data: { orderId: order._id.toString(), amount },
  }).catch(() => {});
  return { targetType, targetId, released: true, amount, transactionId: result.transaction._id };
}

const releaseSinglePayout = catchAsync(async (req, res) => {
  const { targetType, targetId, note } = req.body;
  const result = await releaseOne(targetType, targetId, note || '', req.user._id.toString());
  res.json({ message: result.skipped ? 'Already processed; skipped.' : 'Payment released.', result });
});

// ─── 4c. release bulk / all ─────────────────────────────────────

const releaseBulkPayouts = catchAsync(async (req, res) => {
  const { items, releaseAll, note } = req.body;
  const adminId = req.user._id.toString();
  let targets = items || [];
  if (releaseAll) {
    const all = await collectReleasable(100);
    targets = all.items.map((i) => ({ targetType: i.targetType, targetId: i.targetId }));
  }
  const paystack = await adminOpsService.getPaystackAvailableBalance();
  const results = [];
  let payoutTotal = 0;
  for (const t of targets) {
    try {
      const r = await releaseOne(t.targetType, t.targetId, note || '', adminId);
      results.push({ ...r, ok: true });
      if (r.released) payoutTotal += Number(r.amount) || 0;
    } catch (e) {
      results.push({ targetType: t.targetType, targetId: t.targetId, ok: false, error: e.message });
    }
  }
  const released = results.filter((r) => r.released);
  res.json({
    message: `Released ${released.length}/${targets.length}.`,
    releasedTotal: payoutTotal,
    paystackAvailable: paystack.available,
    paystackUnavailable: !!paystack.unavailable,
    sufficient: paystack.unavailable ? null : paystack.available >= payoutTotal,
    shortfall: paystack.unavailable ? null : Math.max(0, payoutTotal - paystack.available),
    results,
  });
});

// ─── 5. unread counts for navbar badge ──────────────────────────

const getUnreadCounts = catchAsync(async (req, res) => {
  const adminId = req.user._id.toString();
  const [convs, tickets, adminNotifs] = await Promise.all([
    dB.conversations.find({ 'participants.userId': adminId, isActive: true }).select('unreadCounts').lean().catch(() => []),
    dB.SupportTickets.find({ status: { $in: ['open', 'in-progress'] } }).select('unreadCount').lean().catch(() => []),
    dB.notifications.countDocuments({ recipient: adminId, isRead: false }).catch(() => 0),
  ]);
  const conversationsUnread = convs.reduce((s, c) => {
    const uc = c.unreadCounts instanceof Map ? c.unreadCounts.get(adminId) : c.unreadCounts?.[adminId];
    return s + (Number(uc) || 0);
  }, 0);
  const ticketsUnread = tickets.reduce((s, t) => s + (Number(t.unreadCount) || 0), 0);
  res.json({
    conversationsUnread, ticketsUnread,
    adminNotificationsUnread: adminNotifs,
    total: conversationsUnread + ticketsUnread + adminNotifs,
  });
});

// ─── 6. marketplace live overview ───────────────────────────────

const getMarketplaceOverview = catchAsync(async (req, res) => {
  const { page, limit, skip } = paging(req.query, { defLimit: 20, maxLimit: 100 });
  const [statusCounts, recentOrders, orderTotal, storeCount, activeStores, productCount, lowStock] = await Promise.all([
    dB.orders.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, volume: { $sum: '$total' } } }]),
    dB.orders.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('buyer', 'fullName phoneNumber profilePhoto')
      .populate('store', 'name logo provider').lean(),
    dB.orders.countDocuments(),
    dB.stores.countDocuments(),
    dB.stores.countDocuments({ isActive: true }),
    dB.products.countDocuments({ isActive: true }),
    dB.products.find({ stock: { $lte: 5 }, isActive: true }).select('name stock store').populate('store', 'name').limit(20).lean(),
  ]);
  res.json({
    statusCounts, recentOrders,
    pagination: { page, limit, total: orderTotal, totalPages: Math.ceil(orderTotal / limit) },
    stores: { total: storeCount, active: activeStores },
    products: { active: productCount, lowStock },
  });
});

// ─── 6b. marketplace ORDER FULL DETAILS ──────────────────────────
// Everything about one order: items (what was bought), buyer, store/seller,
// delivery address, payment + escrow state, delivery-fee negotiation.
const getMarketplaceOrderDetail = catchAsync(async (req, res) => {
  const order = await dB.orders
    .findById(req.params.id)
    .populate('buyer', 'fullName email phoneNumber profilePhoto location')
    .populate({
      path: 'items.product',
      select: 'name description price originalPrice stock category images isActive rating soldCount',
    })
    .populate({
      path: 'store',
      select: 'name description category coverImage logo rating reviewCount provider',
      populate: { path: 'provider', select: 'fullName email phoneNumber profile profilePhoto' },
    })
    .lean();
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');

  // Attach reviews left on this order (order-scoped reviews)
  const reviews = await dB.reviews.find({ order: order._id })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ order, reviews });
});

// ─── 6c. provider JOBS + ORDERS + REVIEWS (ranked-earner drill-down) ─
const getProviderJobs = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { page, limit, skip } = paging(req.query, { defLimit: 20, maxLimit: 100 });
  const provider = await dB.providers
    .findById(id)
    .select('fullName email phoneNumber profile profilePhoto rating avgRating totalJobs kycStatus bankDetails location service walletBalance')
    .lean();
  if (!provider) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found.');

  const [jobs, jobTotal, agg] = await Promise.all([
    dB.bookings.find({ provider: id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'fullName phoneNumber profilePhoto')
      .lean(),
    dB.bookings.countDocuments({ provider: id }),
    dB.bookings.aggregate([
      { $match: { provider: new (require('mongoose').Types.ObjectId)(id) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  // Provider's marketplace orders (sales through their store(s)) — ALL of them.
  const stores = await dB.stores.find({ provider: id }).select('_id name').lean();
  const storeIds = stores.map((s) => s._id);
  const [orders, orderTotal, orderAgg] = storeIds.length
    ? await Promise.all([
        dB.orders.find({ store: { $in: storeIds } })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('buyer', 'fullName phoneNumber profilePhoto')
          .lean(),
        dB.orders.countDocuments({ store: { $in: storeIds } }),
        dB.orders.aggregate([
          { $match: { store: { $in: storeIds } } },
          { $group: { _id: '$status', count: { $sum: 1 }, volume: { $sum: '$total' } } },
        ]),
      ])
    : [[], 0, []];

  // Reviews left ON this provider, on their bookings, and on their orders/products.
  const bookingIds = jobs.map((j) => j._id);
  const orderIds = orders.map((o) => o._id);
  const [providerReviews, bookingReviews, orderReviews, storeReviews] = await Promise.all([
    dB.reviews.find({ target: id, targetType: 'provider' }).sort({ createdAt: -1 }).limit(50).lean(),
    bookingIds.length
      ? dB.reviews.find({ booking: { $in: bookingIds } }).sort({ createdAt: -1 }).limit(50).lean()
      : Promise.resolve([]),
    orderIds.length
      ? dB.reviews.find({ order: { $in: orderIds } }).sort({ createdAt: -1 }).limit(50).lean()
      : Promise.resolve([]),
    storeIds.length
      ? dB.reviews.find({ target: { $in: storeIds }, targetType: 'store' }).sort({ createdAt: -1 }).limit(50).lean()
      : Promise.resolve([]),
  ]);

  // de-dupe reviews by _id (a review can match multiple filters)
  const reviewMap = new Map();
  [...providerReviews, ...bookingReviews, ...orderReviews, ...storeReviews].forEach((r) => {
    reviewMap.set(String(r._id), r);
  });

  res.json({
    provider,
    stores,
    jobs,
    jobsPagination: { page, limit, total: jobTotal, totalPages: Math.ceil(jobTotal / limit) },
    statusBreakdown: agg.map((a) => ({ status: a._id, count: a.count })),
    orders,
    ordersPagination: { page, limit, total: orderTotal, totalPages: Math.ceil(orderTotal / limit) },
    orderStatusBreakdown: orderAgg.map((a) => ({ status: a._id, count: a.count, volume: a.volume || 0 })),
    reviews: [...reviewMap.values()],
    totals: { jobs: jobTotal, orders: orderTotal, reviews: reviewMap.size },
  });
});

// ─── 7. broadcast + targeted push ───────────────────────────────

const broadcastOps = catchAsync(async (req, res) => {
  const { title, body, type, target } = req.body;
  let recipients = [];
  if (target === 'all' || target === 'customers') {
    const customers = await dB.customers.find({ isBanned: { $ne: true } }).select('_id').lean();
    recipients.push(...customers.map((c) => ({ userId: String(c._id), actorType: 'customer' })));
  }
  if (target === 'all' || target === 'providers') {
    const providers = await dB.providers.find({ isBanned: { $ne: true } }).select('_id').lean();
    recipients.push(...providers.map((p) => ({ userId: String(p._id), actorType: 'provider' })));
  }
  const targets = recipients.map((r) => ({ ...r, title, body, type, data: { broadcast: true, target } }));
  const results = await notificationService.sendBulkPushNotifications(targets);
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const io = getIo();
  if (io) io.to('admin_support').emit('broadcast_sent', { title, target, total: recipients.length, sent, at: new Date() });
  res.json({ message: `Broadcast queued to ${recipients.length} users.`, total: recipients.length, sent, target });
});

const targetedPush = catchAsync(async (req, res) => {
  const { userId, actorType, title, body, type, data } = req.body;
  const record = await notificationService.sendPushNotification({ userId, actorType, title, body, type, data });
  res.json({ message: 'Push sent.', notification: record });
});

// ─── 8. presence / activity / contacts / direct message ─────────

const getOnlinePresence = catchAsync(async (req, res) => {
  const { page, limit, skip } = paging(req.query, { defLimit: 25, maxLimit: 100 });

  // Fetch both providers and customers presence data
  const fetchPresence = async (Model, label) => {
    const [users, total] = await Promise.all([
      Model.find({ isBanned: { $ne: true } })
        .select('fullName email phoneNumber lastLogin profile profilePhoto')
        .sort({ lastLogin: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Model.countDocuments({ isBanned: { $ne: true } }),
    ]);

    const withFlag = users.map((u) => ({
      ...u,
      profilePhoto: u.profilePhoto || u.profile?.photo || null,
      isOnline: isOnline(String(u._id)),
    }));
    const online = withFlag.filter((x) => x.isOnline);

    return {
      [label]: withFlag,
      onlineProviders: label === 'providers' ? online : [],
      onlineCustomers: label === 'customers' ? online : [],
      counts: {
        onlineProviders: label === 'providers' ? online.length : 0,
        onlineCustomers: label === 'customers' ? online.length : 0,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  };

  const [providersData, customersData] = await Promise.all([
    fetchPresence(dB.providers, 'providers'),
    fetchPresence(dB.customers, 'customers'),
  ]);

  // Merge counts from both
  res.json({
    providers: providersData.providers,
    customers: customersData.customers,
    onlineProviders: providersData.onlineProviders,
    onlineCustomers: customersData.onlineCustomers,
    counts: {
      onlineProviders: providersData.counts.onlineProviders + customersData.counts.onlineProviders,
      onlineCustomers: providersData.counts.onlineCustomers + customersData.counts.onlineCustomers,
    },
    pagination: { page, limit, total: providersData.pagination.total + customersData.pagination.total, totalPages: Math.ceil((providersData.pagination.total + customersData.pagination.total) / limit) },
  });
});

const getUserActivity = catchAsync(async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { page, limit, skip } = paging(req.query, { defLimit: 25, maxLimit: 100 });

  const fetchActivity = async (Model, label) => {
    const activeQuery = { isBanned: { $ne: true }, lastLogin: { $gte: cutoff } };
    const dormantQuery = { isBanned: { $ne: true }, $or: [{ lastLogin: null }, { lastLogin: { $lt: cutoff } }, { lastLogin: { $exists: false } }] };

    const [activeUsers, dormantUsers, activeCount, dormantCount] = await Promise.all([
      Model.find(activeQuery)
        .select('fullName email phoneNumber lastLogin createdAt profile profilePhoto')
        .sort({ lastLogin: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Model.find(dormantQuery)
        .select('fullName email phoneNumber lastLogin createdAt profile profilePhoto')
        .sort({ lastLogin: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Model.countDocuments(activeQuery),
      Model.countDocuments(dormantQuery),
    ]);

    return {
      [label]: {
        active: activeUsers.map((u) => ({ ...u, profilePhoto: u.profilePhoto || u.profile?.photo || null })),
        dormant: dormantUsers.map((u) => ({ ...u, profilePhoto: u.profilePhoto || u.profile?.photo || null })),
        activeCount,
        dormantCount,
      },
    };
  };

  const [providersData, customersData] = await Promise.all([
    fetchActivity(dB.providers, 'providers'),
    fetchActivity(dB.customers, 'customers'),
  ]);

  res.json({
    days, cutoff,
    providers: providersData.providers,
    customers: customersData.customers,
    pagination: {
      page,
      limit,
      total: providersData.providers.activeCount + customersData.customers.activeCount + providersData.providers.dormantCount + customersData.customers.dormantCount,
      totalPages: Math.ceil((providersData.providers.activeCount + customersData.customers.activeCount + providersData.providers.dormantCount + customersData.customers.dormantCount) / limit),
    },
  });
});

const getUserContact = catchAsync(async (req, res) => {
  const { actor, id } = req.params;
  if (!['customer', 'provider'].includes(actor)) throw new ApiError(httpStatus.BAD_REQUEST, 'actor must be customer|provider.');
  const Model = actor === 'provider' ? dB.providers : dB.customers;
  const user = await Model.findById(id).select('fullName email phoneNumber expoPushToken lastLogin createdAt location').lean();
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
  res.json({ contact: { ...user, isOnline: isOnline(String(user._id)) } });
});

const sendDirectMessage = catchAsync(async (req, res) => {
  const { targetUserId, targetActorType, text, bookingId } = req.body;
  const adminId = req.user._id.toString();
  const adminName = req.user.fullName || 'Admin';
  const TargetModel = targetActorType === 'provider' ? dB.providers : dB.customers;
  const target = await TargetModel.findById(targetUserId).select('fullName').lean();
  if (!target) throw new ApiError(httpStatus.NOT_FOUND, 'Target user not found.');
  let conversation = await dB.conversations.findOne({
    'participants.userId': { $all: [adminId, targetUserId] }, isActive: true,
  });
  if (!conversation) {
    conversation = await dB.conversations.create({
      participants: [
        { userId: adminId, actorType: 'admin', name: adminName },
        { userId: targetUserId, actorType: targetActorType, name: target.fullName },
      ],
      unreadCounts: { [adminId]: 0, [targetUserId]: 0 },
      booking: bookingId || null,
    });
  }
  const message = await dB.messages.create({
    conversation: conversation._id, senderId: adminId, senderType: 'admin',
    senderName: adminName, text, type: 'text', readBy: [adminId],
  });
  const unread = conversation.unreadCounts instanceof Map
    ? (conversation.unreadCounts.get(targetUserId) || 0)
    : (conversation.unreadCounts?.[targetUserId] || 0);
  await dB.conversations.findByIdAndUpdate(conversation._id, {
    lastMessage: { text, senderId: adminId, senderType: 'admin', timestamp: new Date() },
    $set: { [`unreadCounts.${targetUserId}`]: unread + 1 },
  });
  const io = getIo();
  if (io) {
    io.to(`conv_${conversation._id.toString()}`).emit('new_message', message);
    io.to(`user_${targetUserId}`).emit('new_message', message);
    io.to(`user_${adminId}`).emit('new_message', message);
  }
  notificationService.sendPushNotification({
    userId: targetUserId, actorType: targetActorType,
    title: adminName, body: text, type: 'chat',
    data: { conversationId: conversation._id.toString(), screen: 'chat' },
  }).catch(() => {});
  res.status(httpStatus.CREATED).json({ conversation, message });
});

// ─── 4d. agent payouts ─────────────────────────────────────────────

async function collectReleasableAgents(limit = 100, skip = 0) {
  const agents = await dB.agents
    .find({
      $or: [
        { 'wallet.pendingPayout': { $gt: 0 } },
        { pendingEarnings: { $gt: 0 } },
        { earnings: { $gt: 0 } },
      ],
    })
    .select('userId userType agentCode wallet earnings pendingEarnings totalCustomerReferrals totalProviderReferrals referrals isActive createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const rows = [];
  for (const a of agents) {
    const pendingPayout = Number(a.wallet?.pendingPayout || a.pendingEarnings || 0);
    const balance = Number(a.wallet?.balance || 0);
    const totalOwed = pendingPayout + balance;

    if (totalOwed <= 0) continue;

    let userDetails = null;
    let bankDetails = null;
    let walletBalance = 0;

    if (a.userType === 'provider') {
      const provider = await dB.providers.findById(a.userId).select('fullName email phoneNumber profilePhoto bankDetails walletId').lean();
      if (provider) {
        userDetails = {
          fullName: provider.fullName || 'Agent',
          email: provider.email || '',
          phoneNumber: provider.phoneNumber || '',
          profilePhoto: provider.profilePhoto || null,
        };
        bankDetails = provider.bankDetails || {};
        const wallet = await dB.wallets.findOne({ owner: a.userId, ownerType: 'provider' }).lean();
        walletBalance = wallet ? Number(wallet.balance || 0) : 0;
      }
    } else if (a.userType === 'customer') {
      const customer = await dB.customers.findById(a.userId).select('fullName email phoneNumber profilePhoto walletId').lean();
      if (customer) {
        userDetails = {
          fullName: customer.fullName || 'Agent',
          email: customer.email || '',
          phoneNumber: customer.phoneNumber || '',
          profilePhoto: customer.profilePhoto || null,
        };
        const wallet = await dB.wallets.findOne({ owner: a.userId, ownerType: 'customer' }).lean();
        walletBalance = wallet ? Number(wallet.balance || 0) : 0;
      }
    }

    rows.push({
      agentId: a._id.toString(),
      userId: a.userId,
      userType: a.userType,
      agentCode: a.agentCode,
      userDetails,
      bankDetails,
      walletBalance,
      pendingPayout,
      totalEarned: Number(a.wallet?.totalEarned || a.earnings || 0),
      totalPaidOut: Number(a.wallet?.totalPaidOut || 0),
      totalCustomerReferrals: a.totalCustomerReferrals || 0,
      totalProviderReferrals: a.totalProviderReferrals || 0,
      totalReferrals: (a.totalCustomerReferrals || 0) + (a.totalProviderReferrals || 0),
      totalOwed,
      isActive: a.isActive,
      createdAt: a.createdAt,
      referralCount: a.referrals ? a.referrals.length : 0,
      unpaidReferrals: a.referrals ? a.referrals.filter((r) => !r.isPaid).length : 0,
    });
  }

  rows.sort((a, b) => b.totalOwed - a.totalOwed);
  const pageRows = rows.slice(skip, skip + limit);

  return {
    items: pageRows,
    total: rows.length,
    payoutTotal: rows.reduce((s, r) => s + r.totalOwed, 0),
  };
}

const getAgentPayoutQueue = catchAsync(async (req, res) => {
  const { page, limit, skip } = paging(req.query, { defLimit: 25, maxLimit: 100 });
  const result = await collectReleasableAgents(limit, skip);
  res.json({
    items: result.items,
    total: result.total,
    page,
    limit,
    totalPages: Math.ceil(result.total / limit),
    payoutTotal: result.payoutTotal,
  });
});

async function releaseAgentPayoutOne(agentId, note, adminId) {
  const agent = await dB.agents.findById(agentId);
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, `Agent ${agentId} not found.`);

  const pendingPayout = Number(agent.wallet?.pendingPayout || agent.pendingEarnings || 0);
  const balance = Number(agent.wallet?.balance || 0);
  const totalOwed = pendingPayout + balance;

  if (totalOwed <= 0) {
    return { agentId, skipped: true, reason: 'nothing owed', amount: 0 };
  }

  const io = require('../utils/io').getIo();
  const now = new Date();
  const reference = `AGENT_PAYOUT_${agentId}_${Date.now()}`;

  if (agent.userType === 'provider') {
    const provider = await dB.providers.findById(agent.userId);
    if (!provider) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found for agent payout.');

    const bank = provider.bankDetails || {};
    if (!bank.accountNumber || !bank.bankCode || !process.env.PAYSTACK_SECRET_KEY) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Provider agent has no verified bank details or Paystack is not configured.');
    }

    // ── STEP 1: Check Paystack available balance BEFORE transfer ──
    const paystack = await require('../services/adminOps.service').getPaystackAvailableBalance();
    if (paystack.unavailable) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack balance check failed. Cannot process agent payout.');
    }
    if (Number(paystack.available) < totalOwed) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Insufficient Paystack balance. Available: ₦${paystack.available.toLocaleString()}, Required: ₦${totalOwed.toLocaleString()}`
      );
    }

    // ── STEP 2: Attempt live Paystack transfer ──
    let transfer;
    try {
      transfer = await require('../services/adminOps.service').transferToProviderBank({
        amount: totalOwed,
        bankCode: bank.bankCode,
        accountNumber: bank.accountNumber,
        accountName: bank.accountName || provider.fullName,
        reason: `ServeNaija agent payout${note ? ` — ${note}` : ''}`,
        reference,
      });
    } catch (e) {
      // Transfer FAILED — do NOT zero agent earnings
      throw new ApiError(httpStatus.BAD_REQUEST, `Paystack transfer failed: ${e.message}`);
    }

    // ── STEP 3: Transfer succeeded — now zero agent earnings ──
    agent.wallet.pendingPayout = 0;
    agent.wallet.balance = 0;
    agent.wallet.totalPaidOut = Number(agent.wallet.totalPaidOut || 0) + totalOwed;
    agent.pendingEarnings = 0;
    agent.earnings = Number(agent.earnings || 0) + totalOwed;
    if (agent.referrals) {
      for (const ref of agent.referrals) {
        if (!ref.isPaid) {
          ref.isPaid = true;
          ref.paidAt = now;
        }
      }
    }
    await agent.save();

    if (io) {
      io.to(`user_${agent.userId}`).emit('agent_payout_released', {
        agentId: agent._id.toString(),
        amount: totalOwed,
        reference,
        at: now,
      });
    }

    notificationService.sendPushNotification({
      userId: agent.userId,
      actorType: 'provider',
      title: 'Agent Payout Released',
      body: `₦${totalOwed.toLocaleString()} has been paid to your bank account.`,
      type: 'payment',
      data: { agentId: agent._id.toString(), amount: totalOwed, reference },
    }).catch(() => {});

    return {
      agentId,
      userType: 'provider',
      released: true,
      amount: totalOwed,
      reference,
      method: 'bank_transfer',
      transferStatus: 'success',
    };
  } else {
    const customer = await dB.customers.findById(agent.userId);
    if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found for agent payout.');

    const result = await customer.updateWalletBalance(
      totalOwed,
      'credit',
      `ServeNaija agent payout${note ? ` — ${note}` : ''}`,
      reference,
      { agentId: agent._id.toString(), releasedBy: adminId, note }
    );

    agent.wallet.pendingPayout = 0;
    agent.wallet.balance = 0;
    agent.wallet.totalPaidOut = Number(agent.wallet.totalPaidOut || 0) + totalOwed;
    agent.pendingEarnings = 0;
    agent.earnings = Number(agent.earnings || 0) + totalOwed;
    if (agent.referrals) {
      for (const ref of agent.referrals) {
        if (!ref.isPaid) {
          ref.isPaid = true;
          ref.paidAt = now;
        }
      }
    }
    await agent.save();

    if (io) {
      io.to(`user_${agent.userId}`).emit('agent_payout_released', {
        agentId: agent._id.toString(),
        amount: totalOwed,
        reference,
        at: now,
      });
    }

    notificationService.sendPushNotification({
      userId: agent.userId,
      actorType: 'customer',
      title: 'Agent Payout Credited to Wallet',
      body: `₦${totalOwed.toLocaleString()} has been credited to your wallet.`,
      type: 'payment',
      data: { agentId: agent._id.toString(), amount: totalOwed, reference },
    }).catch(() => {});

    return {
      agentId,
      userType: 'customer',
      released: true,
      amount: totalOwed,
      reference,
      method: 'wallet_credit',
      transactionId: result.transaction._id,
    };
  }
}

const releaseAgentPayout = catchAsync(async (req, res) => {
  const { agentId, note } = req.body;
  const adminId = req.user._id.toString();
  const result = await releaseAgentPayoutOne(agentId, note || '', adminId);
  res.json({
    message: result.skipped ? 'Already processed; skipped.' : 'Agent payout released.',
    result,
  });
});

const releaseBulkAgentPayouts = catchAsync(async (req, res) => {
  const { items, releaseAll, note } = req.body;
  const adminId = req.user._id.toString();
  let targets = items || [];

  if (releaseAll) {
    const all = await collectReleasableAgents(500);
    targets = all.items.map((i) => i.agentId);
  }

  const results = [];
  let payoutTotal = 0;
  for (const agentId of targets) {
    try {
      const r = await releaseAgentPayoutOne(agentId, note || '', adminId);
      results.push({ ...r, ok: true });
      if (r.released) payoutTotal += Number(r.amount) || 0;
    } catch (e) {
      results.push({ agentId, ok: false, error: e.message });
    }
  }

  const released = results.filter((r) => r.released);
  res.json({
    message: `Released ${released.length}/${targets.length}.`,
    releasedTotal: payoutTotal,
    releasedCount: released.length,
    totalRequested: targets.length,
    results,
  });
});

// ─── 7c. Paystack transaction receipts ─────────────────────────────

const getPaystackTransactions = catchAsync(async (req, res) => {
  const { perPage = 50, page = 1, customer } = req.query;

  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Paystack secret key not configured.');
  }

  const axios = require('axios');
  const PAYSTACK_BASE = 'https://api.paystack.co';
  const headers = { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` };

  const { data } = await axios.get(`${PAYSTACK_BASE}/transaction`, {
    headers,
    params: { perPage, page, customer },
    timeout: 30000,
  });

  if (!data.status) {
    throw new ApiError(httpStatus.BAD_REQUEST, data.message || 'Failed to fetch Paystack transactions');
  }

  res.json({
    success: true,
    data: data.data,
    meta: data.meta,
  });
});

module.exports = {
  getDashboardV2,
  getFinanceOverview,
  adminCancelBooking,
  adminCancelOrder,
  getPayoutQueue,
  releaseSinglePayout,
  releaseBulkPayouts,
  getUnreadCounts,
  getMarketplaceOverview,
  getMarketplaceOrderDetail,
  getProviderJobs,
  broadcastOps,
  targetedPush,
  getOnlinePresence,
  getUserActivity,
  getUserContact,
  sendDirectMessage,
  getAgentPayoutQueue,
  releaseAgentPayout,
  releaseBulkAgentPayouts,
  getPaystackTransactions,
};
