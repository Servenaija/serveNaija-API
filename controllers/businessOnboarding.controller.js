// controllers/businessOnboarding.controller.js
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const tokenService = require('../services/token.service');
const notificationService = require('../services/notification.service');
const { uploadObject } = require('../utils/aws.s3.bucket');
const axios = require('axios');

function sanitizeUser(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.__v;
  delete obj.verificationToken;
  delete obj.verificationTokenExpiresAt;
  return obj;
}

const PLAN_PRICES = {
  starter: 20000,
  growth: 50000,
  premium: 100000,
  enterprise: 250000,
};

const REGISTRATION_FEE = 10000;

// Helper function to verify Paystack transaction

const verifyTransaction = async (reference) => {
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    if (!response.data.status) {
      throw new Error(response.data.message || 'Payment verification failed');
    }

    const transaction = response.data.data;

    return {
      status: transaction.status,
      amount: transaction.amount / 100, 
      currency: transaction.currency,
      reference: transaction.reference,
      metadata: transaction.metadata,
    };
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data?.message || 'Payment verification failed');
    }
    throw new Error('Payment verification failed: ' + error.message);
  }
};

// ============================================
// STEP 1: Business Identity
// ============================================
const saveBusinessIdentity = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { businessName, category, registrationNumber, ownerFullName } = req.body;

  if (!businessName || !businessName.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Business name is required');
  }
  if (!category || !category.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Business category is required');
  }
  if (!registrationNumber || !registrationNumber.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Registration number is required');
  }
  if (!ownerFullName || !ownerFullName.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Owner full name is required');
  }

  const provider = await dB.providers.findByIdAndUpdate(
    userId,
    {
      $set: {
        'service.businessName': businessName.trim(),
        'service.category': category.trim(),
        'business.registrationNumber': registrationNumber.trim(),
        'business.ownerFullName': ownerFullName.trim(),
        accountType: 'business',
      },
    },
    { new: true }
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Business identity saved successfully',
    data: {
      step: 1,
      completed: true,
      businessName: provider.service.businessName,
      category: provider.service.category,
      registrationNumber: provider.business.registrationNumber,
      ownerFullName: provider.business.ownerFullName,
    },
  });
});

// ============================================
// STEP 2: Contact Details
// ============================================
const saveBusinessContact = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { businessEmail, contactPhone, businessDescription, staffSize } = req.body;

  if (!businessEmail || !businessEmail.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Business email is required');
  }
  if (!contactPhone || !contactPhone.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Contact phone is required');
  }
  if (!businessDescription || !businessDescription.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Business description is required');
  }
  if (!staffSize || !staffSize.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Staff size is required');
  }

  const provider = await dB.providers.findByIdAndUpdate(
    userId,
    {
      $set: {
        'business.businessEmail': businessEmail.trim().toLowerCase(),
        'business.contactPhone': contactPhone.trim(),
        'business.businessDescription': businessDescription.trim(),
        'business.staffSize': staffSize.trim(),
      },
    },
    { new: true }
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Business contact details saved successfully',
    data: {
      step: 2,
      completed: true,
      businessEmail: provider.business.businessEmail,
      contactPhone: provider.business.contactPhone,
      businessDescription: provider.business.businessDescription,
      staffSize: provider.business.staffSize,
    },
  });
});

// ============================================
// STEP 3: Location
// ============================================
const saveBusinessLocation = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { state, city, address, landmark, latitude, longitude, area, radius, travelOutsideArea } = req.body;

  if (!state || !state.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'State is required');
  }
  if (!city || !city.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'City is required');
  }
  if (!address || !address.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Address is required');
  }

  const updateData = {
    'location.state': state.trim(),
    'location.city': city.trim(),
    'location.address': address.trim(),
  };

  if (landmark && landmark.trim()) {
    updateData['business.landmark'] = landmark.trim();
  }

  if (area && area.trim()) {
    updateData['location.area'] = area.trim();
  }

  if (radius) {
    updateData['location.radius'] = radius;
  }

  if (travelOutsideArea !== undefined) {
    updateData['location.travelOutsideArea'] = travelOutsideArea;
  }

  if (latitude !== undefined && longitude !== undefined) {
    updateData['location.coordinates.latitude'] = latitude;
    updateData['location.coordinates.longitude'] = longitude;
    updateData['geoLocation.type'] = 'Point';
    updateData['geoLocation.coordinates'] = [longitude, latitude];
  }

  const provider = await dB.providers.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true }
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Business location saved successfully',
    data: {
      step: 3,
      completed: true,
      state: provider.location.state,
      city: provider.location.city,
      address: provider.location.address,
      landmark: provider.business.landmark,
      area: provider.location.area,
      radius: provider.location.radius,
      travelOutsideArea: provider.location.travelOutsideArea,
      latitude: provider.location.coordinates?.latitude,
      longitude: provider.location.coordinates?.longitude,
    },
  });
});

// ============================================
// STEP 4: Bank Details
// ============================================
const saveBusinessBankDetails = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { bankName, accountName, accountNumber } = req.body;

  if (!bankName || !bankName.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Bank name is required');
  }
  if (!accountName || !accountName.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account name is required');
  }
  if (!accountNumber || !accountNumber.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account number is required');
  }

  if (!/^\d{10}$/.test(accountNumber.trim())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account number must be exactly 10 digits');
  }

  const provider = await dB.providers.findByIdAndUpdate(
    userId,
    {
      $set: {
        'bankDetails.bankName': bankName.trim(),
        'bankDetails.accountName': accountName.trim(),
        'bankDetails.accountNumber': accountNumber.trim(),
        'bankDetails.isVerified': false,
      },
    },
    { new: true }
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Bank details saved successfully',
    data: {
      step: 4,
      completed: true,
      bankName: provider.bankDetails.bankName,
      accountName: provider.bankDetails.accountName,
      accountNumber: provider.bankDetails.accountNumber,
    },
  });
});

// ============================================
// STEP 5: Upload Business Photos
// ============================================
const saveBusinessPhotos = catchAsync(async (req, res) => {
  const userId = req.user._id;
  let imageUrl = null;
  let coverImageUrl = null;

  // Handle profile photo upload
  if (req.file) {
    try {
      const file = req.file;
      const key = `business/${userId}/profile/${Date.now()}-${file.originalname}`;

      const uploadResult = await uploadObject({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      imageUrl = uploadResult.Location;

      if (!imageUrl) {
        throw new Error('Upload succeeded but no URL returned');
      }
    } catch (uploadError) {
      console.error('R2 upload failed:', uploadError);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Image upload failed. Please try again.'
      );
    }
  }

  // Handle cover image upload
  if (req.files && req.files.coverImage && req.files.coverImage.length > 0) {
    try {
      const file = req.files.coverImage[0];
      const key = `business/${userId}/cover/${Date.now()}-${file.originalname}`;

      const uploadResult = await uploadObject({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      coverImageUrl = uploadResult.Location;

      if (!coverImageUrl) {
        throw new Error('Upload succeeded but no URL returned');
      }
    } catch (uploadError) {
      console.error('R2 cover image upload failed:', uploadError);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Cover image upload failed. Please try again.'
      );
    }
  }

  // If photo URL is provided in body (base64/URL from frontend)
  if (req.body.photo && !req.file) {
    imageUrl = req.body.photo;
  }

  // If cover image URL is provided in body
  if (req.body.coverImage && !(req.files && req.files.coverImage)) {
    coverImageUrl = req.body.coverImage;
  }

  const updateData = {};

  if (imageUrl) {
    updateData['profile.photo'] = imageUrl;
  }

  if (coverImageUrl) {
    updateData['profile.coverImage'] = coverImageUrl;
  }

  if (req.body.bio) {
    updateData['profile.bio'] = req.body.bio;
  }

  const provider = await dB.providers.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true }
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Business photos saved successfully',
    data: {
      step: 5,
      completed: true,
      photo: provider.profile?.photo,
      coverImage: provider.profile?.coverImage,
      bio: provider.profile?.bio,
    },
  });
});

// ============================================
// STEP 6: Complete Business Onboarding with Payment
// ============================================
const completeBusinessOnboarding = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { selectedPlan, paystackReference } = req.body;

  const validPlans = ['starter', 'growth', 'premium', 'enterprise'];
  if (!selectedPlan || !validPlans.includes(selectedPlan)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid plan. Choose from: ${validPlans.join(', ')}`);
  }
  if (!paystackReference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment reference is required');
  }

  const usedRef = await dB.transactions.findOne({ reference: paystackReference });
  if (usedRef) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This payment reference has already been used');
  }

  const provider = await dB.providers.findById(userId);
  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const totalAmount = REGISTRATION_FEE + PLAN_PRICES[selectedPlan];

  // Verify transaction with Paystack
  const verification = await verifyTransaction(paystackReference);
  if (verification.status !== 'success') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed');
  }

  if (Math.abs(verification.amount - totalAmount) > 10) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Expected payment of ₦${totalAmount.toLocaleString()}. Got ₦${verification.amount.toLocaleString()}`
    );
  }

  // Calculate commission for agent if agent code exists
  let agent = null;
  let commissionAmount = 0;
  const agentCode = provider.agentCode || verification.metadata?.agentCode;

  if (agentCode) {
    agent = await dB.agents.findOne({ agentCode: agentCode.toUpperCase(), isActive: true });
    
    if (agent) {
      commissionAmount = Math.round(totalAmount * 0.06);
      
      try {
        const existingReferral = agent.referrals.find(
          r => r.referredUserId === userId.toString() && r.referredUserType === 'provider'
        );
        
        if (!existingReferral) {
          await agent.addReferral(userId.toString(), 'provider', commissionAmount);
        }
      } catch (referralError) {
        console.error('Error adding referral to agent:', referralError);
      }
    }
  }

  const renewalDate = new Date();
  renewalDate.setFullYear(renewalDate.getFullYear() + 1);

  provider.subscription = {
    selectedPlan: selectedPlan,
    amountPaid: totalAmount,
    currency: verification.currency || 'NGN',
    paidAt: new Date(),
    renewalDate: renewalDate,
    isActive: true,
  };
  provider.accountType = 'business';
  provider.kycVerified = true;

  await provider.save();

  let wallet = await dB.wallets.findOne({ owner: userId.toString() });
  if (!wallet) {
    wallet = await dB.wallets.create({
      owner: userId.toString(),
      ownerType: 'provider',
    });
  }

  await dB.transactions.create({
    wallet: wallet._id,
    owner: userId.toString(),
    type: 'debit',
    amount: totalAmount,
    balanceBefore: wallet.balance,
    balanceAfter: wallet.balance,
    description: `Business registration (${selectedPlan} plan) with registration fee`,
    reference: paystackReference,
    status: 'success',
    metadata: { 
      plan: selectedPlan, 
      registrationFee: REGISTRATION_FEE,
      agentCode: agentCode,
      commission: commissionAmount,
    },
  });

  const id = userId.toString();
  const tokens = await tokenService.generateAuthTokens({ id, actor: 'provider' });

  notificationService.sendPushNotification({
    userId: userId.toString(),
    actorType: 'provider',
    title: 'Business Onboarding Complete',
    body: `Your ${selectedPlan} business plan is now active. Welcome to ServeNaija Business!`,
    type: 'system',
    data: { screen: 'home' },
  }).catch(() => {});

  const sanitizedUser = sanitizeUser(provider);

  const responseData = {
    step: 6,
    completed: true,
    user: sanitizedUser,
    tokens,
    subscription: {
      plan: selectedPlan,
      renewalDate: renewalDate,
      isActive: true,
      amountPaid: totalAmount,
    },
  };

  if (agent) {
    const stats = agent.getStats ? agent.getStats() : { wallet: agent.wallet, totalReferrals: agent.referrals?.length || 0 };
    responseData.agent = {
      agentCode: agent.agentCode,
      commission: commissionAmount,
      wallet: stats.wallet,
      totalReferrals: stats.totalReferrals,
    };
  }

  res.status(httpStatus.CREATED).json({
    success: true,
    message: agent ? 'Business registration complete. Agent commission added!' : 'Business registration complete.',
    data: responseData,
  });
});

// ============================================
// GET Onboarding Progress
// ============================================
const getOnboardingProgress = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const provider = await dB.providers.findById(userId).select(
    'service business location bankDetails profile subscription accountType'
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  const progress = {
    step1: {
      completed: !!(provider.service?.businessName && provider.service?.category),
      data: {
        businessName: provider.service?.businessName || '',
        category: provider.service?.category || '',
        registrationNumber: provider.business?.registrationNumber || '',
        ownerFullName: provider.business?.ownerFullName || '',
      },
    },
    step2: {
      completed: !!(provider.business?.businessEmail && provider.business?.contactPhone),
      data: {
        businessEmail: provider.business?.businessEmail || '',
        contactPhone: provider.business?.contactPhone || '',
        businessDescription: provider.business?.businessDescription || '',
        staffSize: provider.business?.staffSize || '',
      },
    },
    step3: {
      completed: !!(provider.location?.state && provider.location?.city && provider.location?.address),
      data: {
        state: provider.location?.state || '',
        city: provider.location?.city || '',
        address: provider.location?.address || '',
        landmark: provider.business?.landmark || '',
        area: provider.location?.area || '',
        radius: provider.location?.radius || '10KM',
        travelOutsideArea: provider.location?.travelOutsideArea || true,
        latitude: provider.location?.coordinates?.latitude || null,
        longitude: provider.location?.coordinates?.longitude || null,
      },
    },
    step4: {
      completed: !!(provider.bankDetails?.bankName && provider.bankDetails?.accountNumber),
      data: {
        bankName: provider.bankDetails?.bankName || '',
        accountName: provider.bankDetails?.accountName || '',
        accountNumber: provider.bankDetails?.accountNumber || '',
      },
    },
    step5: {
      completed: !!(provider.profile?.photo || provider.profile?.coverImage),
      data: {
        photo: provider.profile?.photo || null,
        coverImage: provider.profile?.coverImage || null,
        bio: provider.profile?.bio || '',
      },
    },
    step6: {
      completed: provider.subscription?.isActive === true,
      data: {
        selectedPlan: provider.subscription?.selectedPlan || '',
        isActive: provider.subscription?.isActive || false,
        amountPaid: provider.subscription?.amountPaid || 0,
        renewalDate: provider.subscription?.renewalDate || null,
      },
    },
    isComplete: provider.subscription?.isActive === true,
    accountType: provider.accountType || '',
  };

  res.status(httpStatus.OK).json({
    success: true,
    data: progress,
  });
});

// ============================================
// GET Single Step Progress
// ============================================
const getStepProgress = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { step } = req.params;

  const stepNumber = parseInt(step);
  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 6) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid step number. Must be 1-6');
  }

  const provider = await dB.providers.findById(userId).select(
    'service business location bankDetails profile subscription accountType'
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  let stepData = {};
  let completed = false;

  switch (stepNumber) {
    case 1:
      completed = !!(provider.service?.businessName && provider.service?.category);
      stepData = {
        businessName: provider.service?.businessName || '',
        category: provider.service?.category || '',
        registrationNumber: provider.business?.registrationNumber || '',
        ownerFullName: provider.business?.ownerFullName || '',
      };
      break;
    case 2:
      completed = !!(provider.business?.businessEmail && provider.business?.contactPhone);
      stepData = {
        businessEmail: provider.business?.businessEmail || '',
        contactPhone: provider.business?.contactPhone || '',
        businessDescription: provider.business?.businessDescription || '',
        staffSize: provider.business?.staffSize || '',
      };
      break;
    case 3:
      completed = !!(provider.location?.state && provider.location?.city && provider.location?.address);
      stepData = {
        state: provider.location?.state || '',
        city: provider.location?.city || '',
        address: provider.location?.address || '',
        landmark: provider.business?.landmark || '',
        area: provider.location?.area || '',
        radius: provider.location?.radius || '10KM',
        travelOutsideArea: provider.location?.travelOutsideArea || true,
        latitude: provider.location?.coordinates?.latitude || null,
        longitude: provider.location?.coordinates?.longitude || null,
      };
      break;
    case 4:
      completed = !!(provider.bankDetails?.bankName && provider.bankDetails?.accountNumber);
      stepData = {
        bankName: provider.bankDetails?.bankName || '',
        accountName: provider.bankDetails?.accountName || '',
        accountNumber: provider.bankDetails?.accountNumber || '',
      };
      break;
    case 5:
      completed = !!(provider.profile?.photo || provider.profile?.coverImage);
      stepData = {
        photo: provider.profile?.photo || null,
        coverImage: provider.profile?.coverImage || null,
        bio: provider.profile?.bio || '',
      };
      break;
    case 6:
      completed = provider.subscription?.isActive === true;
      stepData = {
        selectedPlan: provider.subscription?.selectedPlan || '',
        isActive: provider.subscription?.isActive || false,
        amountPaid: provider.subscription?.amountPaid || 0,
        renewalDate: provider.subscription?.renewalDate || null,
      };
      break;
  }

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      step: stepNumber,
      completed: completed,
      data: stepData,
    },
  });
});

module.exports = {
  saveBusinessIdentity,
  saveBusinessBankDetails,
  saveBusinessContact,
  saveBusinessLocation,
  saveBusinessPhotos,
  getOnboardingProgress,
  getStepProgress,
  completeBusinessOnboarding,
};