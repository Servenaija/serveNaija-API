const httpStatus = require('http-status');
const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

const normalizeRegistrationPayload = (userBody = {}) => {
  const normalized = { ...userBody };

  const firstName = (normalized.firstName || '').trim();
  const lastName = (normalized.lastName || '').trim();

  if (!normalized.fullName || !normalized.fullName.trim()) {
    normalized.fullName = `${firstName} ${lastName}`.trim();
  }

  if (!normalized.firstName && normalized.fullName) {
    normalized.firstName = normalized.fullName.split(' ')[0] || '';
  }

  if (!normalized.lastName && normalized.fullName) {
    const [, ...rest] = normalized.fullName.trim().split(' ');
    normalized.lastName = rest.join(' ');
  }

  if (normalized.email) {
    normalized.email = normalized.email.toLowerCase().trim();
  }

  if (normalized.phoneNumber) {
    normalized.phoneNumber = String(normalized.phoneNumber).trim();
  }

  if (normalized.expoPushToken && typeof normalized.expoPushToken !== 'string') {
    normalized.expoPushToken = String(normalized.expoPushToken);
  }

  return normalized;
};

const toProviderDocumentShape = (payload = {}) => {
  const provider = { ...payload };
  const inferredAccountType = payload.accountType || (payload.registrationNumber ? 'business' : 'provider');

  provider.accountType = inferredAccountType;

  provider.service = {
    category: payload.category || payload.service?.category || '',
    experience: payload.experience || payload.service?.experience || '',
    businessName: payload.businessName || payload.service?.businessName || '',
    description: payload.description || payload.service?.description || '',
  };

  provider.location = {
    state: payload.state || payload.location?.state || '',
    city: payload.city || payload.location?.city || '',
    area: payload.area || payload.location?.area || '',
    address: payload.address || payload.location?.address || '',
    radius: payload.radius || payload.location?.radius || '10KM',
    travelOutsideArea:
      typeof payload.travelOutsideArea === 'boolean'
        ? payload.travelOutsideArea
        : payload.location?.travelOutsideArea ?? true,
    coordinates: {
      latitude: payload.latitude || payload.location?.coordinates?.latitude || null,
      longitude: payload.longitude || payload.location?.coordinates?.longitude || null,
    },
  };

  provider.profile = {
    photo: payload.photo || payload.profile?.photo || null,
    bio: payload.bio || payload.profile?.bio || '',
  };

  provider.business = {
    registrationNumber:
      payload.registrationNumber || payload.business?.registrationNumber || '',
    ownerFullName: payload.ownerFullName || payload.business?.ownerFullName || '',
    businessEmail:
      (payload.businessEmail || payload.business?.businessEmail || '').toLowerCase(),
    contactPhone: payload.contactPhone || payload.business?.contactPhone || '',
    businessDescription:
      payload.businessDescription || payload.business?.businessDescription || '',
    staffSize: payload.staffSize || payload.business?.staffSize || '',
    landmark:
      payload.landmark || payload.location?.landmark || payload.business?.landmark || '',
  };

  provider.bankDetails = {
    accountName: payload.accountName || payload.bankDetails?.accountName || '',
    bankName: payload.bankName || payload.bankDetails?.bankName || '',
    accountNumber: payload.accountNumber || payload.bankDetails?.accountNumber || '',
    isVerified: payload.bankDetails?.isVerified || false,
  };

  provider.subscription = {
    selectedPlan:
      payload.selectedPlan || payload.subscription?.selectedPlan || 'verified',
    amountPaid: payload.subscription?.amountPaid || 0,
    currency: payload.subscription?.currency || 'NGN',
    paidAt: payload.subscription?.paidAt || null,
    renewalDate: payload.subscription?.renewalDate || null,
    isActive: payload.subscription?.isActive || false,
  };

  provider.referralCode = payload.referralCode || payload.agentCode || null;

  delete provider.category;
  delete provider.experience;
  delete provider.businessName;
  delete provider.description;
  delete provider.state;
  delete provider.city;
  delete provider.area;
  delete provider.address;
  delete provider.radius;
  delete provider.travelOutsideArea;
  delete provider.photo;
  delete provider.bio;
  delete provider.accountName;
  delete provider.bankName;
  delete provider.accountNumber;
  delete provider.selectedPlan;
  delete provider.latitude;
  delete provider.longitude;
  delete provider.agentCode;
  delete provider.registrationNumber;
  delete provider.ownerFullName;
  delete provider.businessEmail;
  delete provider.contactPhone;
  delete provider.businessDescription;
  delete provider.staffSize;
  delete provider.landmark;

  return provider;
};

const isEmailTaken = async (email, actor = 'customer', excludeUserId = null) => {
  const Model = actor === 'provider' ? dB.providers : dB.customers;
  const query = { email: String(email).toLowerCase().trim() };

  const user = await Model.findOne(query);
  if (!user) {
    return false;
  }

  if (excludeUserId && user._id.toString() === String(excludeUserId)) {
    return false;
  }

  return true;
};

const isPasswordMatch = async (password, user) => bcrypt.compare(password, user.password);

const createUser = async (userBody) => {
  const payload = normalizeRegistrationPayload(userBody);

  if (await isEmailTaken(payload.email, 'customer')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  payload.password = bcrypt.hashSync(payload.password, 12);
  return dB.customers.create(payload);
};

const createProvider = async (userBody) => {
  const payload = normalizeRegistrationPayload(userBody);

  if (await isEmailTaken(payload.email, 'provider')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  payload.password = bcrypt.hashSync(payload.password, 12);
  const providerPayload = toProviderDocumentShape(payload);
  return dB.providers.create(providerPayload);
};

const queryUsers = async (limit = 10, page = 0, where = {}, actor = 'customer') => {
  const Model = actor === 'provider' ? dB.providers : dB.customers;
  const count = Math.max(1, Number(limit) || 10);
  const safePage = Math.max(0, Number(page) || 0);

  const total = await Model.countDocuments(where || {});
  const users = await Model.find(where || {})
    .skip(safePage * count)
    .limit(count)
    .sort({ createdAt: -1 });

  return {
    users,
    total,
    page: safePage,
    count,
    totalPage: Math.ceil(total / count),
  };
};

const getUsers = async () => dB.customers.find().sort({ createdAt: -1 }).limit(25);

const getUserById = async (_id) => dB.customers.findById(_id);
const getProviderById = async (_id) => dB.providers.findById(_id);

const getUserByEmail = async (email) =>
  dB.customers.findOne({ email: String(email).toLowerCase().trim() });

const getProviderByEmail = async (email) =>
  dB.providers.findOne({ email: String(email).toLowerCase().trim() });

const updateUserById = async (_id, updateBody = {}, actor = 'customer') => {
  const isProvider = actor === 'provider';
  const Model = isProvider ? dB.providers : dB.customers;
  const existing = await Model.findById(_id);

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const payload = normalizeRegistrationPayload(updateBody);

  if (payload.email && (await isEmailTaken(payload.email, actor, _id))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  if (payload.password) {
    payload.password = bcrypt.hashSync(payload.password, 12);
  }

  const preparedPayload = isProvider ? toProviderDocumentShape(payload) : payload;

  return Model.findByIdAndUpdate(_id, preparedPayload, { new: true });
};

const deleteUserById = async (userId, actor = 'customer') => {
  const Model = actor === 'provider' ? dB.providers : dB.customers;
  const user = await Model.findByIdAndDelete(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  return user;
};

module.exports = {
  createUser,
  createProvider,
  queryUsers,
  getUsers,
  getUserById,
  getProviderById,
  getUserByEmail,
  getProviderByEmail,
  updateUserById,
  deleteUserById,
  isPasswordMatch,
  isEmailTaken,
};
