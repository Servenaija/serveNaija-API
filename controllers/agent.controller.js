const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

// Register as agent (supports both customer and provider)
const registerAsAgent = catchAsync(async (req, res) => {
  const { paystackReference } = req.body;
  
  if (!paystackReference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Paystack reference is required');
  }

  const userId = req.user._id.toString();
  
  const existingAgent = await dB.agents.findOne({ userId });
  if (existingAgent) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You are already registered as an agent.');
  }

  // Verify payment with Paystack
  const response = await axios.get(
    `https://api.paystack.co/transaction/verify/${paystackReference}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    }
  );

  if (!response.data.status) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed');
  }

  const transaction = response.data.data;

  if (transaction.status !== 'success') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Payment status: ${transaction.status}`);
  }

  // Expected amount in Naira
  const expectedAmount = 5000;
  if (transaction.amount < expectedAmount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Incorrect payment amount. Expected ₦5,000.');
  }

  const existingAgentWithRef = await dB.agents.findOne({ paystackReference });
  if (existingAgentWithRef) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This payment reference has already been used.');
  }

  let userType = 'provider';
  if (req.user.role === 'customer' || req.user.accountType === 'customer') {
    userType = 'customer';
  }

  const agent = await dB.agents.create({
    userId,
    userType,
    paystackReference,
    registrationFee: 5000, // Naira
    isActive: true,
  });

  const savedAgent = await dB.agents.findOne({ userId });

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Agent registered successfully.',
    data: {
      agentCode: savedAgent.agentCode,
      referralCode: savedAgent.agentCode,
      userId: savedAgent.userId,
      userType: savedAgent.userType,
      isActive: savedAgent.isActive,
    },
  });
});

// Get agent profile
const getAgentProfile = catchAsync(async (req, res) => {
  const userId = req.user._id.toString();

  const agent = await dB.agents.findOne({ userId });
  
  if (!agent) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Agent profile not found.');
  }

  const stats = agent.getStats ? agent.getStats() : {
    totalReferrals: agent.totalCustomerReferrals + agent.totalProviderReferrals,
    customerReferrals: agent.totalCustomerReferrals,
    providerReferrals: agent.totalProviderReferrals,
    earnings: agent.earnings,
    pendingEarnings: agent.pendingEarnings,
    agentCode: agent.agentCode,
    isActive: agent.isActive,
  };

  // Get user details based on userType
  let userDetails = null;
  if (agent.userType === 'provider') {
    userDetails = await dB.providers.findById(userId).select('fullName email phoneNumber profile.photo');
  } else if (agent.userType === 'customer') {
    userDetails = await dB.customers.findById(userId).select('fullName email phoneNumber profile.photo');
  }

  res.json({
    success: true,
    data: {
      _id: agent._id,
      userId: agent.userId,
      userType: agent.userType,
      agentCode: agent.agentCode,
      referralCode: agent.agentCode,
      isActive: agent.isActive,
      earnings: agent.earnings,
      pendingEarnings: agent.pendingEarnings,
      totalCustomerReferrals: agent.totalCustomerReferrals,
      totalProviderReferrals: agent.totalProviderReferrals,
      referrals: agent.referrals,
      stats,
      user: userDetails,
    },
  });
});

// Check agent status
const checkAgentStatus = catchAsync(async (req, res) => {
  const userId = req.user._id.toString();

  const agent = await dB.agents.findOne({ userId });

  res.json({
    success: true,
    data: {
      isAgent: !!agent,
      userType: agent ? agent.userType : null,
      agentCode: agent ? agent.agentCode : null,
      isActive: agent ? agent.isActive : false,
    },
  });
});

// Get agent by referral code (public)
const getAgentByCode = catchAsync(async (req, res) => {
  const { code } = req.params;
  
  const agent = await dB.agents.getByCode(code);
  
  if (!agent) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invalid referral code.');
  }

  // Get user details based on userType
  let userDetails = null;
  if (agent.userType === 'provider') {
    userDetails = await dB.providers.findById(agent.userId).select('fullName profile.photo');
  } else if (agent.userType === 'customer') {
    userDetails = await dB.customers.findById(agent.userId).select('fullName profile.photo');
  }

  res.json({
    success: true,
    data: {
      agentCode: agent.agentCode,
      userType: agent.userType,
      isActive: agent.isActive,
      user: userDetails,
    },
  });
});



// Mark referral as paid
const markReferralPaid = catchAsync(async (req, res) => {
  const { referredUserId, referredUserType } = req.body;
  const userId = req.user._id.toString();

  const agent = await dB.agents.findOne({ userId });
  
  if (!agent) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Agent not found.');
  }

  await agent.markReferralPaid(referredUserId, referredUserType);

  res.json({
    success: true,
    message: 'Referral marked as paid.',
    data: {
      earnings: agent.earnings,
      pendingEarnings: agent.pendingEarnings,
    },
  });
});

// Get agent stats
const getAgentStats = catchAsync(async (req, res) => {
  const userId = req.user._id.toString();

  const agent = await dB.agents.findOne({ userId });
  
  if (!agent) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Agent not found.');
  }

  const stats = {
    totalReferrals: agent.totalCustomerReferrals + agent.totalProviderReferrals,
    customerReferrals: agent.totalCustomerReferrals,
    providerReferrals: agent.totalProviderReferrals,
    totalEarnings: agent.earnings,
    pendingEarnings: agent.pendingEarnings,
    agentCode: agent.agentCode,
    isActive: agent.isActive,
    userType: agent.userType,
    createdAt: agent.createdAt,
  };

  res.json({
    success: true,
    data: stats,
  });
});

module.exports = {
  registerAsAgent,
  getAgentProfile,
  checkAgentStatus,
  getAgentByCode,
  markReferralPaid,
  getAgentStats,
};