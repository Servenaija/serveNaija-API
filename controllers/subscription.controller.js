// controllers/subscriptionController.js
const Provider = require('../models/provider');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

// Provider plan prices
const PROVIDER_PLANS = {
  standard: {
    firstTime: 10000,
    renewal: 5000,
    level: 1,
    name: 'Standard Provider',
    features: ['Listed on ServeNaija', 'Receive job requests', 'Basic profile page'],
  },
  verified: {
    firstTime: 20000,
    renewal: 20000,
    level: 2,
    name: 'Verified Professional',
    features: ['Verified badge', 'Priority search', 'Featured placement', 'Dedicated support'],
  },
};

// Business plan prices
const BUSINESS_PLANS = {
  starter: {
    firstTime: 20000,
    renewal: 20000,
    level: 1,
    name: 'Starter Business',
    features: ['Listed on ServeNaija', 'Up to 5 services', 'Basic analytics'],
  },
  growth: {
    firstTime: 50000,
    renewal: 50000,
    level: 2,
    name: 'Growth Package',
    features: ['Up to 15 services', 'Advanced analytics', 'Priority support'],
  },
  premium: {
    firstTime: 100000,
    renewal: 100000,
    level: 3,
    name: 'Premium Business',
    features: ['Unlimited services', 'Team management', 'API access'],
  },
  enterprise: {
    firstTime: 250000,
    renewal: 250000,
    level: 4,
    name: 'Enterprise',
    features: ['White-label', 'Custom features', 'Dedicated account manager'],
  },
};

// Get available plans based on account type
const getAvailablePlans = (accountType) => {
  if (accountType === 'business') {
    return BUSINESS_PLANS;
  }
  return PROVIDER_PLANS;
};

// Get plan hierarchy based on account type
const getPlanHierarchy = (accountType) => {
  if (accountType === 'business') {
    return {
      starter: 1,
      growth: 2,
      premium: 3,
      enterprise: 4,
    };
  }
  return {
    standard: 1,
    verified: 2,
  };
};

// Validate plan exists for account type
const validatePlanForAccountType = (planId, accountType) => {
  const plans = getAvailablePlans(accountType);
  return !!plans[planId];
};

// =============================================
// GET SUBSCRIPTION PLANS
// =============================================
exports.getSubscriptionPlans = catchAsync(async (req, res) => {
  const userId = req.user._id;
  
  const provider = await Provider.findById(userId).select('accountType');
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const accountType = provider.accountType || 'provider';
  const plans = getAvailablePlans(accountType);
  const hierarchy = getPlanHierarchy(accountType);

  const formattedPlans = Object.keys(plans).map(id => ({
    id: id,
    name: plans[id].name,
    firstTimePrice: plans[id].firstTime,
    renewalPrice: plans[id].renewal,
    level: hierarchy[id],
    features: plans[id].features,
  }));

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      accountType: accountType,
      plans: formattedPlans,
    },
  });
});

// =============================================
// SUBSCRIBE TO PLAN
// =============================================
exports.subscribeToPlan = catchAsync(async (req, res) => {
  const { planId, reference } = req.body;
  const userId = req.user._id;

  if (!planId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Plan ID is required');
  }

  if (!reference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment reference is required');
  }

  const provider = await Provider.findById(userId);
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const accountType = provider.accountType || 'provider';

  if (!validatePlanForAccountType(planId, accountType)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid plan '${planId}' for ${accountType} account`
    );
  }

  if (!provider.kycVerified) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Please complete KYC verification first');
  }

  const currentPlan = provider.subscription?.selectedPlan;
  const hasActiveSubscription = provider.subscription?.isActive === true;
  const currentPlanPrice = provider.subscription?.amountPaid || 0;
  const expiryDate = provider.subscription?.renewalDate;
  const isExpiringSoon = expiryDate ? new Date(expiryDate) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : false;

  const planHierarchy = getPlanHierarchy(accountType);
  const plans = getAvailablePlans(accountType);

  let amountToPay = 0;
  let upgradeType = 'new';

  if (!hasActiveSubscription || !currentPlan) {
    amountToPay = plans[planId].firstTime;
    upgradeType = 'new';
  } else if (planId === currentPlan) {
    if (!isExpiringSoon) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Your subscription is still active and not expiring soon'
      );
    }
    amountToPay = plans[planId].renewal;
    upgradeType = 'renewal';
  } else {
    const currentLevel = planHierarchy[currentPlan];
    const targetLevel = planHierarchy[planId];

    if (!currentLevel || !targetLevel) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid plan comparison');
    }

    if (targetLevel < currentLevel) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot downgrade from ${currentPlan} to ${planId}. Only upgrades are allowed.`
      );
    }

    const targetPrice = plans[planId].firstTime;
    const difference = targetPrice - currentPlanPrice;
    
    if (difference <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invalid upgrade: target plan price is not higher than current plan'
      );
    }
    amountToPay = Math.max(0, difference);
    upgradeType = 'upgrade';
  }

  const renewalDate = new Date();
  renewalDate.setFullYear(renewalDate.getFullYear() + 1);

  provider.subscription = {
    selectedPlan: planId,
    amountPaid: amountToPay,
    currency: 'NGN',
    paidAt: new Date(),
    renewalDate: renewalDate,
    isActive: true,
  };

  if (planId === 'verified') {
    provider.isVerifiedPro = true;
  }

  await provider.save();

  res.status(httpStatus.OK).json({
    success: true,
    message: `Subscription ${upgradeType === 'upgrade' ? 'upgraded' : upgradeType === 'renewal' ? 'renewed' : 'activated'} successfully`,
    data: {
      plan: planId,
      amountPaid: amountToPay,
      renewalDate: renewalDate,
      isActive: true,
      upgradeType: upgradeType,
      accountType: accountType,
    },
  });
});

// =============================================
// GET SUBSCRIPTION DETAILS
// =============================================
exports.getSubscriptionDetails = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const provider = await Provider.findById(userId).select('subscription isVerifiedPro accountType');
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const accountType = provider.accountType || 'provider';
  const plans = getAvailablePlans(accountType);
  const planHierarchy = getPlanHierarchy(accountType);

  let daysUntilExpiry = null;
  if (provider.subscription?.renewalDate) {
    const now = new Date();
    const expiry = new Date(provider.subscription.renewalDate);
    daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  const currentPlan = provider.subscription?.selectedPlan;
  const availableUpgrades = [];
  
  if (currentPlan && planHierarchy[currentPlan]) {
    const currentLevel = planHierarchy[currentPlan];
    for (const [planId, level] of Object.entries(planHierarchy)) {
      if (level > currentLevel && plans[planId]) {
        availableUpgrades.push({
          id: planId,
          name: plans[planId].name,
          price: plans[planId].firstTime,
          level: level,
        });
      }
    }
  } else {
    for (const [planId, plan] of Object.entries(plans)) {
      availableUpgrades.push({
        id: planId,
        name: plan.name,
        price: plan.firstTime,
        level: planHierarchy[planId],
      });
    }
  }

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      subscription: provider.subscription,
      isVerifiedPro: provider.isVerifiedPro,
      accountType: accountType,
      daysUntilExpiry: daysUntilExpiry,
      availablePlans: Object.keys(plans).map(id => ({
        id: id,
        name: plans[id].name,
        price: plans[id].firstTime,
        level: planHierarchy[id],
        features: plans[id].features,
      })),
      availableUpgrades: availableUpgrades,
    },
  });
});

// =============================================
// CANCEL SUBSCRIPTION
// =============================================
exports.cancelSubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const provider = await Provider.findById(userId);
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  if (!provider.subscription?.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No active subscription to cancel');
  }

  provider.subscription.isActive = false;
  await provider.save();

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Subscription cancelled successfully',
  });
});

// =============================================
// GET AVAILABLE UPGRADES
// =============================================
exports.getAvailableUpgrades = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const provider = await Provider.findById(userId).select('subscription accountType');
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const accountType = provider.accountType || 'provider';
  const plans = getAvailablePlans(accountType);
  const planHierarchy = getPlanHierarchy(accountType);

  const currentPlan = provider.subscription?.selectedPlan;
  const availableUpgrades = [];

  if (currentPlan && planHierarchy[currentPlan]) {
    const currentLevel = planHierarchy[currentPlan];
    for (const [planId, level] of Object.entries(planHierarchy)) {
      if (level > currentLevel && plans[planId]) {
        availableUpgrades.push({
          id: planId,
          name: plans[planId].name,
          price: plans[planId].firstTime,
          level: level,
          features: plans[planId].features,
        });
      }
    }
  }

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      accountType: accountType,
      currentPlan: currentPlan,
      availableUpgrades: availableUpgrades,
    },
  });
});