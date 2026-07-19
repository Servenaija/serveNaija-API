const httpStatus = require('http-status');
const { v4: uuidv4 } = require('uuid');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const paymentService = require('../services/payment.service');
const notificationService = require('../services/notification.service');

function generateReferralCode() {
  return `SRV-${uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

// POST /agent/register
const register = catchAsync(async (req, res) => {
  const userId = req.user._id.toString();

  const existing = await dB.agents.findOne({ userId });
  if (existing) throw new ApiError(httpStatus.BAD_REQUEST, 'You are already registered as an agent.');

  const { paystackReference } = req.body;
  if (!paystackReference) throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack reference is required.');

  // Verify payment of ₦5,000
  const verification = await paymentService.verifyTransaction(paystackReference);
  if (verification.status !== 'success') throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed.');
  if (verification.amount < 5000) throw new ApiError(httpStatus.BAD_REQUEST, 'Registration fee is ₦5,000.');

  const referralCode = generateReferralCode();
  const agent = await dB.agents.create({
    userId,
    userType: req.user.constructor.modelName === 'Provider' ? 'provider' : 'customer',
    referralCode,
    paystackReference,
    isActive: true,
  });

  // Mark user as agent
  const Model = req.user.constructor.modelName === 'Provider' ? dB.providers : dB.customers;
  await Model.findByIdAndUpdate(userId, { isAgent: true, agentCode: referralCode });

  notificationService.sendPushNotification({
    userId,
    actorType: req.user.constructor.modelName === 'Provider' ? 'provider' : 'customer',
    title: 'Welcome, Agent!',
    body: `You are now a ServeNaija agent. Your referral code is ${referralCode}.`,
    type: 'system',
    data: { screen: 'agent' },
  }).catch(() => {});

  res.status(httpStatus.CREATED).json({ agent, referralCode });
});

// GET /agent/me
const getMe = catchAsync(async (req, res) => {
  const agent = await dB.agents.findOne({ userId: req.user._id.toString() });
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Agent profile not found. Please register as an agent first.');
  res.json({ agent });
});

// GET /agent/earnings
const getEarnings = catchAsync(async (req, res) => {
  const agent = await dB.agents.findOne({ userId: req.user._id.toString() });
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Agent profile not found.');
  res.json({
    earnings: agent.earnings,
    pendingEarnings: agent.pendingEarnings,
    totalCustomerReferrals: agent.totalCustomerReferrals,
    totalProviderReferrals: agent.totalProviderReferrals,
    referralCode: agent.referralCode,
  });
});

// GET /agent/referrals
const getReferrals = catchAsync(async (req, res) => {
  const agent = await dB.agents.findOne({ userId: req.user._id.toString() });
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Agent profile not found.');
  res.json({ referrals: agent.referrals });
});

module.exports = {
  register,
  getMe,
  getEarnings,
  getReferrals,
};
