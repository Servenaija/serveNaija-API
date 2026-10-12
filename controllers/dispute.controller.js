const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

// ─── CUSTOMER/PROVIDER: Open a dispute on a booking or order ─────────────
const openDispute = catchAsync(async (req, res) => {
  const { targetType, targetId, reason, description } = req.body;
  const userId = req.user._id.toString();

  if (!targetType || !targetId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'targetType and targetId are required.');
  }
  if (!['booking', 'order'].includes(targetType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'targetType must be "booking" or "order".');
  }

  const existingFilter = targetType === 'booking'
    ? { booking: targetId, status: { $in: ['open', 'awaiting-response'] } }
    : { order: targetId, status: { $in: ['open', 'awaiting-response'] } };
  const existing = await dB.disputes.findOne(existingFilter);
  if (existing) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'An open dispute already exists for this item.');
  }

  let customerId = null;
  let providerId = null;
  let storeId = null;
  let escrowSnapshot = { subtotal: 0, deliveryFee: 0, total: 0 };

  if (targetType === 'booking') {
    const booking = await dB.bookings.findById(targetId);
    if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
    customerId = (booking.customer?._id || booking.customer)?.toString();
    const provRaw = booking.provider?._id || booking.provider;
    providerId = provRaw ? provRaw.toString() : null;
    if (userId !== customerId && userId !== providerId) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to dispute this booking.');
    }
    escrowSnapshot = {
      subtotal: booking.serviceFee || booking.totalAmount || 0,
      deliveryFee: 0,
      total: booking.serviceFee || booking.totalAmount || 0,
    };
    await dB.bookings.findByIdAndUpdate(targetId, { status: 'disputed' });
  } else {
    const order = await dB.orders.findById(targetId);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.');
    customerId = (order.buyer?._id || order.buyer)?.toString();
    storeId = (order.store?._id || order.store)?.toString();
    if (storeId) {
      const store = await dB.stores.findById(storeId).select('owner provider').lean();
      const provRaw = store?.owner || store?.provider;
      providerId = provRaw ? provRaw.toString() : null;
    }
    if (userId !== customerId && userId !== providerId) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to dispute this order.');
    }
    escrowSnapshot = {
      subtotal: order.subtotal || 0,
      deliveryFee: order.deliveryFee || 0,
      total: (order.subtotal || 0) + (order.deliveryFee || 0),
    };
    await dB.orders.findByIdAndUpdate(targetId, {
      disputed: true,
      paymentStatus: 'held',
      autoReleaseAt: null,
    });
  }

  const dispute = await dB.disputes.create({
    targetType,
    booking: targetType === 'booking' ? targetId : null,
    order: targetType === 'order' ? targetId : null,
    customer: customerId,
    provider: providerId,
    store: storeId,
    escrowSnapshot,
    openedBy: req.user.accountType === 'provider' ? 'provider' : 'customer',
    reason: reason || '',
    description: description || '',
    status: 'open',
    messages: [{
      senderId: userId,
      senderType: req.user.accountType === 'provider' ? 'provider' : 'customer',
      senderName: req.user.fullName || 'User',
      text: description || reason || 'Dispute opened.',
      createdAt: new Date(),
    }],
  });

  res.status(httpStatus.CREATED).json({
    success: true,
    data: { dispute },
    message: 'Dispute opened. A ServeNaija admin will review and resolve it.',
  });
});

module.exports = { openDispute };

// ─── ADD MESSAGE to a dispute (both sides + admin) ──────────────────────
const addDisputeMessage = catchAsync(async (req, res) => {
  const { disputeId } = req.params;
  const { text } = req.body;
  const userId = req.user._id.toString();

  if (!text || !text.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Message text is required.');
  }

  const dispute = await dB.disputes.findById(disputeId);
  if (!dispute) throw new ApiError(httpStatus.NOT_FOUND, 'Dispute not found.');

  const isParty = [dispute.customer?.toString(), dispute.provider?.toString()].includes(userId);
  const isAdmin = req.user.accountType === 'admin' || req.user.role === 'admin';
  if (!isParty && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to message on this dispute.');
  }

  const senderType = isAdmin ? 'admin' : (req.user.accountType === 'provider' ? 'provider' : 'customer');

  dispute.messages.push({
    senderId: userId,
    senderType,
    senderName: req.user.fullName || (isAdmin ? 'Admin' : 'User'),
    text: text.trim(),
    createdAt: new Date(),
  });

  if (isAdmin && dispute.status === 'open') {
    dispute.status = 'awaiting-response';
  }

  await dispute.save();
  res.json({ success: true, data: { dispute } });
});

// ─── GET dispute details (parties + admin) ──────────────────────────────
const getDispute = catchAsync(async (req, res) => {
  const { disputeId } = req.params;
  const userId = req.user._id.toString();

  const dispute = await dB.disputes.findById(disputeId);
  if (!dispute) throw new ApiError(httpStatus.NOT_FOUND, 'Dispute not found.');

  const isParty = [dispute.customer?.toString(), dispute.provider?.toString()].includes(userId);
  const isAdmin = req.user.accountType === 'admin' || req.user.role === 'admin';
  if (!isParty && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to view this dispute.');
  }

  res.json({ success: true, data: { dispute } });
});

// ─── LIST my disputes (customer or provider) ────────────────────────────
const getMyDisputes = catchAsync(async (req, res) => {
  const userId = req.user._id.toString();
  const { status, page = 0, limit = 20 } = req.query;

  const filter = { $or: [{ customer: userId }, { provider: userId }] };
  if (status) filter.status = status;

  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  const safePage = Math.max(0, Number(page));

  const disputes = await dB.disputes
    .find(filter)
    .sort({ updatedAt: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit)
    .lean();

  const total = await dB.disputes.countDocuments(filter);

  res.json({
    success: true,
    data: { disputes, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } },
  });
});

module.exports = { openDispute, addDisputeMessage, getDispute, getMyDisputes };

// ─── ADMIN: List all disputes ───────────────────────────────────────────
const adminListDisputes = catchAsync(async (req, res) => {
  const { status, page = 0, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const safeLimit = Math.min(50, Math.max(1, Number(limit)));
  const safePage = Math.max(0, Number(page));

  const disputes = await dB.disputes
    .find(filter)
    .sort({ updatedAt: -1 })
    .skip(safePage * safeLimit)
    .limit(safeLimit)
    .lean();

  const total = await dB.disputes.countDocuments(filter);

  res.json({
    success: true,
    data: { disputes, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } },
  });
});

// ─── ADMIN: Resolve dispute — award split of (subtotal + deliveryFee) ──
const adminResolveDispute = catchAsync(async (req, res) => {
  const { disputeId } = req.params;
  const { customerAmount, providerAmount, note } = req.body;

  const dispute = await dB.disputes.findById(disputeId);
  if (!dispute) throw new ApiError(httpStatus.NOT_FOUND, 'Dispute not found.');

  const maxAward = dispute.escrowSnapshot.total;
  const custAmt = Number(customerAmount) || 0;
  const provAmt = Number(providerAmount) || 0;

  if (custAmt + provAmt > maxAward) {
    throw new ApiError(httpStatus.BAD_REQUEST,
      `Total awarded (₦${custAmt + provAmt}) exceeds escrowed amount (₦${maxAward}).`);
  }
  if (custAmt < 0 || provAmt < 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Award amounts cannot be negative.');
  }

  const adminId = req.user._id.toString();
  let customerWallet = null;
  let providerWallet = null;
  let customerTxn = null;
  let providerTxn = null;

  // Credit customer refund to their wallet
  if (custAmt > 0 && dispute.customer) {
    const customer = await dB.customers.findById(dispute.customer);
    if (customer) {
      const result = await customer.updateWalletBalance(
        custAmt,
        'credit',
        `Dispute refund for ${dispute.targetType} #${(dispute.booking || dispute.order).toString().slice(-6)}`,
        `DISPUTE_REFUND_${Date.now()}`,
        { disputeId: dispute._id.toString(), targetType: dispute.targetType },
      );
      customerWallet = result.wallet;
      customerTxn = result.transaction;
    }
  }

  // Credit provider payout to their wallet
  if (provAmt > 0 && dispute.provider) {
    const provider = await dB.providers.findById(dispute.provider);
    if (provider) {
      const result = await provider.updateWalletBalance(
        provAmt,
        'credit',
        `Dispute payout for ${dispute.targetType} #${(dispute.booking || dispute.order).toString().slice(-6)}`,
        `DISPUTE_PAYOUT_${Date.now()}`,
        { disputeId: dispute._id.toString(), targetType: dispute.targetType },
      );
      providerWallet = result.wallet;
      providerTxn = result.transaction;
    }
  }

  // Update dispute
  dispute.resolution = {
    customerAmount: custAmt,
    providerAmount: provAmt,
    note: note || '',
    resolvedBy: adminId,
    resolvedAt: new Date(),
  };
  dispute.status = 'resolved';
  dispute.messages.push({
    senderId: adminId,
    senderType: 'admin',
    senderName: req.user.fullName || 'Admin',
    text: note || `Dispute resolved. Customer awarded ₦${custAmt.toLocaleString()}, Provider awarded ₦${provAmt.toLocaleString()}.`,
    createdAt: new Date(),
  });
  await dispute.save();

  // Update the underlying target
  if (dispute.targetType === 'booking') {
    await dB.bookings.findByIdAndUpdate(dispute.booking, { status: 'disputed' });
  } else {
    await dB.orders.findByIdAndUpdate(dispute.order, {
      disputed: false,
      paymentStatus: 'released',
      escrowReleasedAt: new Date(),
    });
  }

  res.json({
    success: true,
    data: {
      dispute,
      customerWallet: customerWallet ? { balance: customerWallet.balance } : null,
      providerWallet: providerWallet ? { balance: providerWallet.balance } : null,
      customerTransaction: customerTxn ? { id: customerTxn._id, amount: customerTxn.amount } : null,
      providerTransaction: providerTxn ? { id: providerTxn._id, amount: providerTxn.amount } : null,
    },
    message: `Dispute resolved. Customer refund: ₦${custAmt.toLocaleString()}, Provider payout: ₦${provAmt.toLocaleString()}.`,
  });
});

module.exports = {
  openDispute,
  addDisputeMessage,
  getDispute,
  getMyDisputes,
  adminListDisputes,
  adminResolveDispute,
};