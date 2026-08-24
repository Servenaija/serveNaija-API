// controllers/subscriptionController.js
const Provider = require('../models/provider');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const axios = require('axios');
const notificationService = require('../services/notification.service');
const Transaction = require('../models/transaction');
const Wallet = require('../models/wallet');

// Provider plan prices
const PROVIDER_PLANS = {
  standard: {
    firstTime: 5000,
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
  console.log('=== SUBSCRIBE TO PLAN START ===');
  console.log('req.body:', req.body);

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

  // Verify payment with Paystack
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Paystack secret key not configured');
  }

  let paymentData;
  try {
    console.log('Verifying payment with Paystack...');
    console.log('Reference:', reference);

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        timeout: 30000,
      }
    );

    console.log('Paystack response status:', response.status);
    console.log('Paystack response data status:', response.data?.status);

    if (!response.data) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No response from Paystack');
    }

    if (response.data.status === false) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        response.data.message || 'Payment verification failed'
      );
    }

    if (!response.data.data) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No transaction data from Paystack');
    }

    if (response.data.data.status !== 'success') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Payment was not successful. Status: ${response.data.data.status}`
      );
    }

    const paidAmount = response.data.data.amount / 100;
    console.log('paidAmount:', paidAmount);
    console.log('amountToPay:', amountToPay);

    if (paidAmount !== amountToPay) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Payment amount mismatch. Expected: ${amountToPay}, Paid: ${paidAmount}`
      );
    }

    paymentData = response.data.data;
    console.log('Payment verified successfully');
  } catch (error) {
    console.error('Paystack error:', error.message);
    console.error('Paystack error details:', error.response?.data || error.message);

    // Handle 404 - transaction not found
    if (error.response && error.response.status === 404) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Payment reference not found. Please check the reference and try again.'
      );
    }

    if (error.response) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Paystack verification failed: ${error.response.data?.message || error.message}`
      );
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Payment verification service unavailable');
  }

  // Check if reference already used
  const existingTransaction = await Transaction.findOne({ reference });
  if (existingTransaction) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This payment reference has already been processed');
  }

  // Get or create wallet
  const ownerId = userId.toString();
  let wallet = await Wallet.findOne({ owner: ownerId });

  if (!wallet) {
    try {
      wallet = await Wallet.create({
        owner: ownerId,
        ownerType: 'provider',
        balance: 0,
        escrowBalance: 0,
        currency: 'NGN',
        isActive: true,
      });
    } catch (createError) {
      if (createError.code === 11000) {
        wallet = await Wallet.findOne({ owner: ownerId });
        if (!wallet) {
          throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create or find wallet');
        }
      } else {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Wallet creation failed: ${createError.message}`);
      }
    }
  }

  // Activate subscription
  const renewalDate = new Date();
  renewalDate.setFullYear(renewalDate.getFullYear() + 1);

  const balanceBefore = wallet.balance;

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

  // Create transaction record
  const transaction = await Transaction.create({
    wallet: wallet._id,
    owner: ownerId,
    type: 'subscription',
    amount: amountToPay,
    balanceBefore: balanceBefore,
    balanceAfter: wallet.balance,
    currency: 'NGN',
    description: `Subscription (${plans[planId].name} plan) - ${upgradeType}`,
    reference: reference,
    status: 'success',
    metadata: {
      plan: planId,
      planName: plans[planId].name,
      upgradeType: upgradeType,
      renewalDate: renewalDate,
      paystackData: paymentData,
      paymentMethod: 'paystack',
      amountInKobo: paymentData.amount,
      amountInNaira: amountToPay,
    },
  });

  // Send push notification via notification service
  try {
    const planName = plans[planId].name;
    let notificationTitle = 'Subscription Activated';
    let notificationBody = `Your ${planName} subscription has been activated successfully.`;

    if (upgradeType === 'upgrade') {
      notificationTitle = 'Subscription Upgraded';
      notificationBody = `Your subscription has been upgraded to ${planName}.`;
    } else if (upgradeType === 'renewal') {
      notificationTitle = 'Subscription Renewed';
      notificationBody = `Your ${planName} subscription has been renewed for another year.`;
    }

    await notificationService.sendPushNotification({
      userId: userId,
      actorType: 'provider',
      title: notificationTitle,
      body: notificationBody,
      type: 'payment',
      data: {
        type: 'subscription',
        plan: planId,
        upgradeType: upgradeType,
        renewalDate: renewalDate.toISOString(),
        amountPaid: amountToPay,
        transactionId: paymentData.id,
        transactionReference: reference,
      },
    });
  } catch (notificationError) {
    console.error('Notification error:', notificationError.message);
  }

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
      transactionId: paymentData.id,
      paymentReference: reference,
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        reference: transaction.reference,
      },
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