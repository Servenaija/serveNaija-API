const httpStatus = require('http-status');
const bcrypt = require('bcryptjs');
const moment = require('moment');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const tokenService = require('../services/token.service');
const notificationService = require('../services/notification.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeAdmin(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.password;
  delete obj.__v;
  return obj;
}

function paginationParams(query) {
  const page = Math.max(0, Number(query.page) || 0);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: page * limit };
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

// POST /admins/create  — superadmin only (or first-time seed via API)
const createAdmin = catchAsync(async (req, res) => {
  const { fullName, email, password, phone, role = 'admin' } = req.body;
  if (!fullName || !email || !password) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'fullName, email and password are required.');
  }
  if (password.length < 8) throw new ApiError(httpStatus.BAD_REQUEST, 'Password must be at least 8 characters.');
  if (!['admin', 'superadmin'].includes(role)) throw new ApiError(httpStatus.BAD_REQUEST, 'role must be admin or superadmin.');

  const exists = await dB.admins.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw new ApiError(httpStatus.CONFLICT, 'An admin with this email already exists.');

  const admin = await dB.admins.create({ fullName, email, password, phone: phone || '', role });
  res.status(httpStatus.CREATED).json({ message: 'Admin account created.', admin: sanitizeAdmin(admin) });
});

// POST /admins/login
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(httpStatus.BAD_REQUEST, 'Email and password are required.');

  const admin = await dB.admins.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!admin || !(await admin.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or password.');
  }
  if (!admin.isActive) throw new ApiError(httpStatus.FORBIDDEN, 'This admin account has been disabled.');

  admin.lastLogin = new Date();
  await admin.save();

  const tokens = await tokenService.generateAuthTokens({ id: admin._id.toString(), actor: 'admin' });
  res.json({ admin: sanitizeAdmin(admin), tokens });
});

// GET /admins/me
const getMe = catchAsync(async (req, res) => {
  res.json({ admin: sanitizeAdmin(req.user) });
});

// PUT /admins/me
const updateMe = catchAsync(async (req, res) => {
  const { fullName, email, phone } = req.body;
  const updates = {};
  if (fullName) updates.fullName = fullName;
  if (email) updates.email = email.toLowerCase().trim();
  if (phone !== undefined) updates.phone = phone;

  const updated = await dB.admins.findByIdAndUpdate(req.user._id, updates, { new: true });
  res.json({ admin: sanitizeAdmin(updated) });
});

// PUT /admins/change-password
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(httpStatus.BAD_REQUEST, 'Both current and new passwords are required.');
  if (newPassword.length < 8) throw new ApiError(httpStatus.BAD_REQUEST, 'New password must be at least 8 characters.');

  const admin = await dB.admins.findById(req.user._id).select('+password');
  if (!(await admin.isPasswordMatch(currentPassword))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Current password is incorrect.');
  }
  admin.password = bcrypt.hashSync(newPassword, 12);
  await admin.save();
  res.json({ message: 'Password updated successfully.' });
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

// GET /admins/dashboard
const getDashboard = catchAsync(async (req, res) => {
  const now = new Date();
  const startOfToday = moment().startOf('day').toDate();

  // Core counts
  const [
    totalProviders,
    activeProviders,
    pendingKYC,
    totalCustomers,
    activeCustomers,
    totalBookings,
    pendingBookings,
    disputedBookings,
    completedBookings,
    totalOrders,
    todayBookings,
  ] = await Promise.all([
    dB.providers.countDocuments(),
    dB.providers.countDocuments({ isBanned: false }),
    dB.kyc.countDocuments({ status: { $in: ['submitted', 'pending'] } }),
    dB.customers.countDocuments(),
    dB.customers.countDocuments({ isBanned: false }),
    dB.bookings.countDocuments(),
    dB.bookings.countDocuments({ status: 'pending' }),
    dB.bookings.countDocuments({ status: 'disputed' }),
    dB.bookings.countDocuments({ status: 'completed' }),
    dB.orders.countDocuments(),
    dB.bookings.countDocuments({ createdAt: { $gte: startOfToday } }),
  ]);

  // Revenue: sum of platformFee from completed bookings
  const [revenueResult, todayRevenueResult] = await Promise.all([
    dB.bookings.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$platformFee' } } },
    ]),
    dB.bookings.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: '$platformFee' } } },
    ]),
  ]);
  const totalRevenue = revenueResult[0]?.total || 0;
  const todayRevenue = todayRevenueResult[0]?.total || 0;
  const platformFees = totalRevenue;

  // Revenue chart — last 6 months
  const sixMonthsAgo = moment().subtract(5, 'months').startOf('month').toDate();
  const [revenueChart, bookingsByMonth, providersByMonth, customersByMonth] = await Promise.all([
    dB.bookings.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          revenue: { $sum: '$platformFee' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    dB.bookings.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    dB.providers.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    dB.customers.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  // Build last 6 months labels
  const months = [];
  for (let i = 5; i >= 0; i--) {
    months.push(moment().subtract(i, 'months'));
  }

  const monthKey = (m) => `${m.year()}-${m.month() + 1}`;
  const revenueMap = {};
  revenueChart.forEach((r) => { revenueMap[`${r._id.year}-${r._id.month}`] = { revenue: r.revenue, bookings: r.bookings }; });
  const bookingsMap = {};
  bookingsByMonth.forEach((r) => { bookingsMap[`${r._id.year}-${r._id.month}`] = r.count; });
  const providersMap = {};
  providersByMonth.forEach((r) => { providersMap[`${r._id.year}-${r._id.month}`] = r.count; });
  const customersMap = {};
  customersByMonth.forEach((r) => { customersMap[`${r._id.year}-${r._id.month}`] = r.count; });

  const revenueChartData = months.map((m) => {
    const k = monthKey(m);
    return {
      month: m.format('MMM'),
      revenue: revenueMap[k]?.revenue || 0,
      bookings: bookingsMap[k] || 0,
    };
  });

  const userGrowthChart = months.map((m) => {
    const k = monthKey(m);
    return {
      month: m.format('MMM'),
      providers: providersMap[k] || 0,
      customers: customersMap[k] || 0,
    };
  });

  // Booking status breakdown
  const statusCounts = await dB.bookings.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const bookingStatusChart = statusCounts.map((s) => ({ name: s._id, value: s.count }));

  res.json({
    totalProviders,
    activeProviders,
    pendingKYC,
    totalCustomers,
    activeCustomers,
    totalBookings,
    pendingBookings,
    disputedBookings,
    completedBookings,
    totalRevenue,
    todayRevenue,
    platformFees,
    totalOrders,
    todayBookings,
    revenueChart: revenueChartData,
    bookingStatusChart,
    userGrowthChart,
  });
});

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

// GET /admins/customers
const listCustomers = catchAsync(async (req, res) => {
  const { search, filter, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (filter === 'active') query.isBanned = false;
  else if (filter === 'banned') query.isBanned = true;
  else if (filter === 'agents') query.isAgent = true;
  else if (filter === 'unverified') query.$or = [{ isEmailVerified: false }, { isPhoneVerified: false }];

  if (search) {
    const re = new RegExp(search, 'i');
    query.$or = [{ fullName: re }, { email: re }, { phoneNumber: re }];
  }

  const [customers, total] = await Promise.all([
    dB.customers.find(query).select('-password -__v -verificationToken -verificationTokenExpiresAt').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    dB.customers.countDocuments(query),
  ]);

  // Attach wallet balance and booking/order counts
  const enriched = await Promise.all(customers.map(async (c) => {
    const [wallet, totalBookings, totalOrders] = await Promise.all([
      dB.wallets.findOne({ owner: c._id.toString() }).lean(),
      dB.bookings.countDocuments({ customer: c._id }),
      dB.orders.countDocuments({ buyer: c._id }),
    ]);
    return { ...c, walletBalance: wallet?.balance || 0, totalBookings, totalOrders };
  }));

  res.json({ customers: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// GET /admins/customers/:id
const getCustomer = catchAsync(async (req, res) => {
  const customer = await dB.customers.findById(req.params.id).select('-password -__v -verificationToken -verificationTokenExpiresAt').lean();
  if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found.');

  const [wallet, totalBookings, totalOrders] = await Promise.all([
    dB.wallets.findOne({ owner: customer._id.toString() }).lean(),
    dB.bookings.countDocuments({ customer: customer._id }),
    dB.orders.countDocuments({ buyer: customer._id }),
  ]);

  res.json({ customer: { ...customer, walletBalance: wallet?.balance || 0, totalBookings, totalOrders } });
});

// PUT /admins/customers/:id/ban
const banCustomer = catchAsync(async (req, res) => {
  const customer = await dB.customers.findById(req.params.id);
  if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found.');
  customer.isBanned = !customer.isBanned;
  await customer.save();
  res.json({ message: `Customer ${customer.isBanned ? 'banned' : 'unbanned'} successfully.`, isBanned: customer.isBanned });
});

// GET /admins/customers/:id/bookings
const getCustomerBookings = catchAsync(async (req, res) => {
  const { page, limit, skip } = paginationParams(req.query);
  const [bookings, total] = await Promise.all([
    dB.bookings.find({ customer: req.params.id }).populate('provider', 'fullName profile.photo service.category').sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.bookings.countDocuments({ customer: req.params.id }),
  ]);
  res.json({ bookings, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// GET /admins/customers/:id/orders
const getCustomerOrders = catchAsync(async (req, res) => {
  const { page, limit, skip } = paginationParams(req.query);
  const [orders, total] = await Promise.all([
    dB.orders.find({ buyer: req.params.id }).populate('store', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.orders.countDocuments({ buyer: req.params.id }),
  ]);
  res.json({ orders, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// GET /admins/customers/:id/transactions
const getCustomerTransactions = catchAsync(async (req, res) => {
  const { page, limit, skip } = paginationParams(req.query);
  const [transactions, total] = await Promise.all([
    dB.transactions.find({ owner: req.params.id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.transactions.countDocuments({ owner: req.params.id }),
  ]);
  res.json({ transactions, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// ─── PROVIDERS ────────────────────────────────────────────────────────────────

// GET /admins/providers
const listProviders = catchAsync(async (req, res) => {
  const { search, filter, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (filter === 'active') query.isBanned = false;
  else if (filter === 'banned') query.isBanned = true;
  else if (filter === 'kyc_pending') query['kyc.status'] = { $in: ['submitted', 'pending'] };
  else if (filter === 'provider') query.accountType = 'provider';
  else if (filter === 'business') query.accountType = 'business';

  if (search) {
    const re = new RegExp(search, 'i');
    query.$or = [{ fullName: re }, { email: re }, { phoneNumber: re }, { 'service.category': re }];
  }

  const [providers, total] = await Promise.all([
    dB.providers.find(query).select('-password -__v -verificationToken -verificationTokenExpiresAt -bankDetails').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    dB.providers.countDocuments(query),
  ]);

  // Attach wallet balance and total jobs
  const enriched = await Promise.all(providers.map(async (p) => {
    const [wallet, totalJobs] = await Promise.all([
      dB.wallets.findOne({ owner: p._id.toString() }).lean(),
      dB.bookings.countDocuments({ provider: p._id }),
    ]);
    return { ...p, walletBalance: wallet?.balance || 0, totalJobs };
  }));

  res.json({ providers: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// GET /admins/providers/:id
const getProvider = catchAsync(async (req, res) => {
  const provider = await dB.providers.findById(req.params.id).select('-password -__v -verificationToken -verificationTokenExpiresAt').lean();
  if (!provider) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found.');

  const [wallet, totalJobs] = await Promise.all([
    dB.wallets.findOne({ owner: provider._id.toString() }).lean(),
    dB.bookings.countDocuments({ provider: provider._id }),
  ]);

  res.json({ provider: { ...provider, walletBalance: wallet?.balance || 0, totalJobs } });
});

// PUT /admins/providers/:id/ban
const banProvider = catchAsync(async (req, res) => {
  const provider = await dB.providers.findById(req.params.id);
  if (!provider) throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found.');
  provider.isBanned = !provider.isBanned;
  await provider.save();
  res.json({ message: `Provider ${provider.isBanned ? 'banned' : 'unbanned'} successfully.`, isBanned: provider.isBanned });
});

// GET /admins/providers/:id/bookings
const getProviderBookings = catchAsync(async (req, res) => {
  const { page, limit, skip } = paginationParams(req.query);
  const [bookings, total] = await Promise.all([
    dB.bookings.find({ provider: req.params.id }).populate('customer', 'fullName profilePhoto').sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.bookings.countDocuments({ provider: req.params.id }),
  ]);
  res.json({ bookings, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// GET /admins/providers/:id/services
const getProviderServices = catchAsync(async (req, res) => {
  const services = await dB.services.find({ provider: req.params.id }).sort({ createdAt: -1 });
  res.json({ services });
});

// GET /admins/providers/:id/transactions
const getProviderTransactions = catchAsync(async (req, res) => {
  const { page, limit, skip } = paginationParams(req.query);
  const [transactions, total] = await Promise.all([
    dB.transactions.find({ owner: req.params.id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.transactions.countDocuments({ owner: req.params.id }),
  ]);
  res.json({ transactions, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────

// GET /admins/bookings
const listBookings = catchAsync(async (req, res) => {
  const { search, status, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (status && status !== 'all') query.status = status;

  let bookings, total;
  if (search) {
    // Search by booking ID prefix or populate after filter
    const re = new RegExp(search, 'i');
    const allBookings = await dB.bookings.find(query)
      .populate('customer', 'fullName phoneNumber')
      .populate('provider', 'fullName phoneNumber')
      .sort({ createdAt: -1 })
      .lean();

    const filtered = allBookings.filter((b) =>
      re.test(b._id.toString()) ||
      re.test(b.customer?.fullName) ||
      re.test(b.provider?.fullName) ||
      re.test(b.service?.name)
    );
    total = filtered.length;
    bookings = filtered.slice(skip, skip + limit);
  } else {
    [bookings, total] = await Promise.all([
      dB.bookings.find(query).populate('customer', 'fullName phoneNumber').populate('provider', 'fullName phoneNumber profile.photo').sort({ createdAt: -1 }).skip(skip).limit(limit),
      dB.bookings.countDocuments(query),
    ]);
  }

  res.json({ bookings, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// GET /admins/bookings/:id
const getBooking = catchAsync(async (req, res) => {
  const booking = await dB.bookings
    .findById(req.params.id)
    .populate('customer', 'fullName phoneNumber email profilePhoto')
    .populate('provider', 'fullName phoneNumber email profile');
  if (!booking) throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found.');
  res.json({ booking });
});

// ─── KYC ─────────────────────────────────────────────────────────────────────

async function enrichKYCWithName(kycRecords) {
  return Promise.all(kycRecords.map(async (rec) => {
    const obj = rec.toObject ? rec.toObject() : { ...rec };
    const Model = obj.userType === 'provider' ? dB.providers : dB.customers;
    const user = await Model.findById(obj.userId).select('fullName email profilePhoto profile.photo').lean();
    obj.userName = user?.fullName || 'Unknown';
    obj.userEmail = user?.email || '';
    obj.userAvatar = user?.profilePhoto || user?.profile?.photo || null;
    return obj;
  }));
}

// GET /admins/kyc
const listKYC = catchAsync(async (req, res) => {
  const { search, status, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (status && status !== 'all') query.status = status;

  const [rawRecords, total] = await Promise.all([
    dB.kyc.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.kyc.countDocuments(query),
  ]);

  let records = await enrichKYCWithName(rawRecords);

  if (search) {
    const q = search.toLowerCase();
    records = records.filter((r) => r.userName.toLowerCase().includes(q) || (r.documentType || '').includes(q));
  }

  res.json({ records, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// PUT /admins/kyc/:id/approve
const approveKYC = catchAsync(async (req, res) => {
  const kyc = await dB.kyc.findById(req.params.id);
  if (!kyc) throw new ApiError(httpStatus.NOT_FOUND, 'KYC record not found.');

  kyc.status = 'approved';
  kyc.reviewedAt = new Date();
  kyc.reviewedBy = req.user._id.toString();
  kyc.rejectionReason = null;
  await kyc.save();

  // Update provider KYC status if applicable
  if (kyc.userType === 'provider') {
    await dB.providers.findByIdAndUpdate(kyc.userId, {
      $set: { 'kyc.status': 'approved', 'kyc.reviewedAt': kyc.reviewedAt },
    });
  }

  // Notify user
  notificationService.sendPushNotification({
    userId: kyc.userId,
    actorType: kyc.userType,
    title: 'Identity Verified!',
    body: 'Your identity has been successfully verified by our team.',
    type: 'kyc',
    data: { kycStatus: 'approved' },
  }).catch(() => {});

  res.json({ message: 'KYC approved.', kyc });
});

// PUT /admins/kyc/:id/reject
const rejectKYC = catchAsync(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) throw new ApiError(httpStatus.BAD_REQUEST, 'A rejection reason is required.');

  const kyc = await dB.kyc.findById(req.params.id);
  if (!kyc) throw new ApiError(httpStatus.NOT_FOUND, 'KYC record not found.');

  kyc.status = 'rejected';
  kyc.rejectionReason = reason.trim();
  kyc.reviewedAt = new Date();
  kyc.reviewedBy = req.user._id.toString();
  await kyc.save();

  if (kyc.userType === 'provider') {
    await dB.providers.findByIdAndUpdate(kyc.userId, {
      $set: { 'kyc.status': 'rejected', 'kyc.rejectionReason': reason.trim(), 'kyc.reviewedAt': kyc.reviewedAt },
    });
  }

  notificationService.sendPushNotification({
    userId: kyc.userId,
    actorType: kyc.userType,
    title: 'KYC Not Approved',
    body: `Your KYC was not approved: ${reason.trim()}`,
    type: 'kyc',
    data: { kycStatus: 'rejected' },
  }).catch(() => {});

  res.json({ message: 'KYC rejected.', kyc });
});

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

// GET /admins/transactions
const listTransactions = catchAsync(async (req, res) => {
  const { search, type, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (type && type !== 'all') query.type = type;

  let txns, total;
  if (search) {
    const re = new RegExp(search, 'i');
    const allTxns = await dB.transactions.find(query).sort({ createdAt: -1 }).lean();
    const filtered = allTxns.filter((t) =>
      re.test(t.reference || '') || re.test(t.description || '') || re.test(t.owner)
    );
    total = filtered.length;
    txns = filtered.slice(skip, skip + limit);
  } else {
    [txns, total] = await Promise.all([
      dB.transactions.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      dB.transactions.countDocuments(query),
    ]);
  }

  // Enrich with owner name
  const enriched = await Promise.all(txns.map(async (t) => {
    const obj = t.toObject ? t.toObject() : { ...t };
    // Try customer then provider
    let user = await dB.customers.findById(obj.owner).select('fullName').lean();
    let ownerType = 'customer';
    if (!user) {
      user = await dB.providers.findById(obj.owner).select('fullName').lean();
      ownerType = 'provider';
    }
    obj.ownerName = user?.fullName || 'Unknown';
    obj.ownerType = ownerType;
    return obj;
  }));

  res.json({ transactions: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

// GET /admins/notifications
const listNotifications = catchAsync(async (req, res) => {
  const { search, type, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (type && type !== 'all') query.type = type;
  if (search) query.$or = [{ title: new RegExp(search, 'i') }, { body: new RegExp(search, 'i') }];

  const [notifications, total] = await Promise.all([
    dB.notifications.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.notifications.countDocuments(query),
  ]);

  // Enrich with recipient name
  const enriched = await Promise.all(notifications.map(async (n) => {
    const obj = n.toObject ? n.toObject() : { ...n };
    const Model = obj.recipientType === 'provider' ? dB.providers : dB.customers;
    const user = await Model.findById(obj.recipient).select('fullName').lean();
    obj.recipientName = user?.fullName || 'Unknown';
    return obj;
  }));

  res.json({ notifications: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// POST /admins/notifications/broadcast
const broadcastNotification = catchAsync(async (req, res) => {
  const { title, body, type = 'system', target } = req.body;
  if (!title || !body) throw new ApiError(httpStatus.BAD_REQUEST, 'Title and body are required.');
  if (!['all', 'providers', 'customers'].includes(target)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'target must be one of: all, providers, customers.');
  }

  let recipients = [];
  if (target === 'all' || target === 'providers') {
    const providers = await dB.providers.find({ isBanned: false }).select('_id expoPushToken').lean();
    recipients.push(...providers.map((p) => ({ id: p._id.toString(), actorType: 'provider', pushToken: p.expoPushToken })));
  }
  if (target === 'all' || target === 'customers') {
    const customers = await dB.customers.find({ isBanned: false }).select('_id expoPushToken').lean();
    recipients.push(...customers.map((c) => ({ id: c._id.toString(), actorType: 'customer', pushToken: c.expoPushToken })));
  }

  // Fire-and-forget: send in background
  setImmediate(async () => {
    for (const r of recipients) {
      await notificationService.sendPushNotification({
        userId: r.id,
        actorType: r.actorType,
        title,
        body,
        type,
        data: {},
      }).catch(() => {});
    }
  });

  res.json({ message: `Broadcast queued for ${recipients.length} recipient(s).`, count: recipients.length });
});

// ─── AGENTS ───────────────────────────────────────────────────────────────────

// GET /admins/agents
const listAgents = catchAsync(async (req, res) => {
  const { page, limit, skip } = paginationParams(req.query);
  const [agents, total] = await Promise.all([
    dB.agents.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    dB.agents.countDocuments(),
  ]);

  // Enrich with user name
  const enriched = await Promise.all(agents.map(async (a) => {
    const Model = a.userType === 'provider' ? dB.providers : dB.customers;
    const user = await Model.findById(a.userId).select('fullName email profilePhoto profile.photo').lean();
    return {
      ...a,
      userName: user?.fullName || 'Unknown',
      userEmail: user?.email || '',
      userAvatar: user?.profilePhoto || user?.profile?.photo || null,
    };
  }));

  res.json({ agents: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// ─── SERVICES ─────────────────────────────────────────────────────────────────

// GET /admins/services
const listServices = catchAsync(async (req, res) => {
  const { search, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (search) query.$or = [{ name: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }];

  const [services, total] = await Promise.all([
    dB.services.find(query).populate('provider', 'fullName profile.photo').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    dB.services.countDocuments(query),
  ]);

  const enriched = services.map((s) => ({
    ...s,
    providerName: s.provider?.fullName || 'Unknown',
    providerAvatar: s.provider?.profile?.photo || null,
  }));

  res.json({ services: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// ─── MARKETPLACE ──────────────────────────────────────────────────────────────

// GET /admins/marketplace/orders
const listOrders = catchAsync(async (req, res) => {
  const { search, status, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (status && status !== 'all') query.status = status;

  const [orders, total] = await Promise.all([
    dB.orders.find(query).populate('buyer', 'fullName phoneNumber').populate('store', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.orders.countDocuments(query),
  ]);

  res.json({ orders, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// GET /admins/marketplace/stores
const listStores = catchAsync(async (req, res) => {
  const { search, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (search) query.name = new RegExp(search, 'i');

  const [stores, total] = await Promise.all([
    dB.stores.find(query).populate('provider', 'fullName email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.stores.countDocuments(query),
  ]);

  res.json({ stores, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// GET /admins/marketplace/products
const listProducts = catchAsync(async (req, res) => {
  const { search, page: rawPage, limit: rawLimit } = req.query;
  const { page, limit, skip } = paginationParams({ page: rawPage, limit: rawLimit });

  const query = {};
  if (search) query.$or = [{ name: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }];

  const [products, total] = await Promise.all([
    dB.products.find(query).populate('store', 'name').populate('provider', 'fullName').sort({ createdAt: -1 }).skip(skip).limit(limit),
    dB.products.countDocuments(query),
  ]);

  res.json({ products, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// ─── ADMIN MANAGEMENT (superadmin only) ────────────────────────────────────
const { ALL_PERMISSIONS } = require('../models/admin');

// GET /admins/team — list all admins
const listAdmins = catchAsync(async (req, res) => {
  const admins = await dB.admins.find().select('-password -__v').sort({ createdAt: -1 });
  res.json({ admins });
});

// GET /admins/team/:id
const getAdminById = catchAsync(async (req, res) => {
  const admin = await dB.admins.findById(req.params.id).select('-password -__v');
  if (!admin) throw new ApiError(httpStatus.NOT_FOUND, 'Admin not found.');
  res.json({ admin });
});

// PUT /admins/team/:id/permissions — update role and permissions
const updateAdminPermissions = catchAsync(async (req, res) => {
  const { permissions, role } = req.body;

  // Cannot demote or edit yourself
  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot edit your own role or permissions.');
  }

  const admin = await dB.admins.findById(req.params.id);
  if (!admin) throw new ApiError(httpStatus.NOT_FOUND, 'Admin not found.');

  if (role) {
    if (!['admin', 'superadmin'].includes(role)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid role.');
    admin.role = role;
  }

  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) throw new ApiError(httpStatus.BAD_REQUEST, 'permissions must be an array.');
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length) throw new ApiError(httpStatus.BAD_REQUEST, `Invalid permissions: ${invalid.join(', ')}`);
    admin.permissions = permissions;
  }

  await admin.save();
  res.json({ message: 'Admin permissions updated.', admin: sanitizeAdmin(admin) });
});

// PUT /admins/team/:id/toggle-active — activate or deactivate an admin
const toggleAdminActive = catchAsync(async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot deactivate your own account.');
  }
  const admin = await dB.admins.findById(req.params.id);
  if (!admin) throw new ApiError(httpStatus.NOT_FOUND, 'Admin not found.');
  admin.isActive = !admin.isActive;
  await admin.save();
  res.json({ message: `Admin ${admin.isActive ? 'activated' : 'deactivated'}.`, isActive: admin.isActive });
});

// GET /admins/permissions/all — returns the list of all possible permissions
const getAllPermissions = catchAsync(async (req, res) => {
  res.json({ permissions: ALL_PERMISSIONS });
});

// GET /admins/calls — list all call logs
const listCalls = catchAsync(async (req, res) => {
  const { status, type, page = 0, limit = 50 } = req.query;
  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;

  const calls = await dB.calls
    .find(query)
    .sort({ createdAt: -1 })
    .skip(Number(page) * Number(limit))
    .limit(Number(limit));

  const total = await dB.calls.countDocuments(query);

  // Enrich with user names
  const enriched = await Promise.all(
    calls.map(async (c) => {
      const InitiatorModel = c.initiatorType === 'provider' ? dB.providers : dB.customers;
      const RecipientModel = c.recipientType === 'provider' ? dB.providers : dB.customers;
      const [initiator, recipient] = await Promise.all([
        InitiatorModel.findById(c.initiator).select('fullName phoneNumber').lean(),
        RecipientModel.findById(c.recipient).select('fullName phoneNumber').lean(),
      ]);
      return {
        _id: c._id,
        initiator: c.initiator,
        initiatorType: c.initiatorType,
        initiatorName: initiator?.fullName || 'Unknown',
        initiatorPhone: initiator?.phoneNumber || '',
        recipient: c.recipient,
        recipientType: c.recipientType,
        recipientName: recipient?.fullName || 'Unknown',
        recipientPhone: recipient?.phoneNumber || '',
        type: c.type,
        status: c.status,
        duration: c.duration,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        createdAt: c.createdAt,
      };
    })
  );

  res.json({ calls: enriched, total, page: Number(page), limit: Number(limit) });
});

// ─── Promotions ───────────────────────────────────────────────────────────────

// GET /admins/promotions
const listPromotions = catchAsync(async (req, res) => {
  const { status, plan, page, limit, skip } = paginationParams(req.query);
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.plan) query.plan = req.query.plan;

  const [promotions, total] = await Promise.all([
    dB.promotions
      .find(query)
      .populate('provider', 'fullName email service.category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    dB.promotions.countDocuments(query),
  ]);
  res.json({ promotions, total, page, limit });
});

// PUT /admins/promotions/:id/cancel
const cancelPromotion = catchAsync(async (req, res) => {
  const promotion = await dB.promotions.findByIdAndUpdate(
    req.params.id,
    { status: 'cancelled' },
    { new: true }
  );
  if (!promotion) throw new ApiError(httpStatus.NOT_FOUND, 'Promotion not found.');

  // Clear cached fields if needed
  await dB.providers.findByIdAndUpdate(promotion.provider, {
    featuredUntil: null,
    isVerifiedPro: false,
  });
  res.json({ message: 'Promotion cancelled.', promotion });
});

// ─── Categories ───────────────────────────────────────────────────────────────

// GET /admins/categories
const listCategories = catchAsync(async (req, res) => {
  const { activeOnly } = req.query;
  const query = {};
  if (activeOnly === 'true') query.isActive = true;
  const categories = await dB.categories.find(query).sort({ name: 1 }).lean();
  res.json({ categories });
});

// POST /admins/categories
const createCategory = catchAsync(async (req, res) => {
  const { name, description, icon, color } = req.body;

  if (!name) throw new ApiError(httpStatus.BAD_REQUEST, 'Category name is required.');

  const existing = await dB.categories.findOne({ name: name.trim() });
  if (existing) throw new ApiError(httpStatus.CONFLICT, 'A category with this name already exists.');

  const category = await dB.categories.create({
    name: name.trim(),
    description: description?.trim() || '',
    icon: icon || 'Zap',
    color: color || '#165B43',
    createdBy: req.user._id,
  });

  res.status(httpStatus.CREATED).json({ category });
});

// GET /admins/categories/:id
const getCategory = catchAsync(async (req, res) => {
  const category = await dB.categories.findById(req.params.id);
  if (!category) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found.');
  res.json({ category });
});

// PUT /admins/categories/:id
const updateCategory = catchAsync(async (req, res) => {
  const { name, description, icon, color, isActive } = req.body;
  const updates = {};

  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description.trim();
  if (icon !== undefined) updates.icon = icon;
  if (color !== undefined) updates.color = color;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);

  if (updates.name) {
    const conflict = await dB.categories.findOne({
      name: updates.name,
      _id: { $ne: req.params.id },
    });
    if (conflict)
      throw new ApiError(httpStatus.CONFLICT, 'Another category with this name already exists.');
  }

  const category = await dB.categories.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!category) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found.');

  res.json({ category });
});

// DELETE /admins/categories/:id
const deleteCategory = catchAsync(async (req, res) => {
  const category = await dB.categories.findByIdAndDelete(req.params.id);
  if (!category) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found.');
  res.json({ message: 'Category deleted.' });
});

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Auth
  createAdmin,
  login,
  getMe,
  updateMe,
  changePassword,
  // Dashboard
  getDashboard,
  // Customers
  listCustomers,
  getCustomer,
  banCustomer,
  getCustomerBookings,
  getCustomerOrders,
  getCustomerTransactions,
  // Providers
  listProviders,
  getProvider,
  banProvider,
  getProviderBookings,
  getProviderServices,
  getProviderTransactions,
  // Bookings
  listBookings,
  getBooking,
  // KYC
  listKYC,
  approveKYC,
  rejectKYC,
  // Transactions
  listTransactions,
  // Notifications
  listNotifications,
  broadcastNotification,
  // Agents
  listAgents,
  // Services
  listServices,
  // Marketplace
  listOrders,
  listStores,
  listProducts,
  // Calls
  listCalls,
  // Categories
  listCategories,
  createCategory,
  getCategory,
  updateCategory,
  deleteCategory,
  // Promotions
  listPromotions,
  cancelPromotion,
  // Admin management (superadmin only)
  listAdmins,
  getAdminById,
  updateAdminPermissions,
  toggleAdminActive,
  getAllPermissions,
};
