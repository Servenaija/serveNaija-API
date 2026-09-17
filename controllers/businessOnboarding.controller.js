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

// No extra registration fee — customers pay the plan price; Paystack charges are borne by the customer.

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

  const updateData = {};

  // Only require fields if they are provided
  if (businessEmail !== undefined && businessEmail.trim()) {
    updateData['business.businessEmail'] = businessEmail.trim().toLowerCase();
  }
  if (contactPhone !== undefined && contactPhone.trim()) {
    updateData['business.contactPhone'] = contactPhone.trim();
  }
  if (businessDescription !== undefined && businessDescription.trim()) {
    updateData['business.businessDescription'] = businessDescription.trim();
  }
  if (staffSize !== undefined && staffSize.trim()) {
    updateData['business.staffSize'] = staffSize.trim();
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one field is required');
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
    message: 'Business contact details saved successfully',
    data: {
      step: 2,
      completed: true,
      businessEmail: provider.business?.businessEmail,
      contactPhone: provider.business?.contactPhone,
      businessDescription: provider.business?.businessDescription,
      staffSize: provider.business?.staffSize,
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

  console.log('Files received:', req.files);
  console.log('Body received:', req.body);

  // Handle profile photo upload - check both 'photo' and 'image' fields
  const photoFile = (req.files && req.files.photo && req.files.photo.length > 0)
    ? req.files.photo[0]
    : (req.files && req.files.image && req.files.image.length > 0)
      ? req.files.image[0]
      : null;

  if (photoFile) {
    try {
      const file = photoFile;
      const key = `business/${userId}/profile/${Date.now()}-${file.originalname}`;

      console.log('Uploading profile photo:', key);

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

      console.log('Profile photo uploaded:', imageUrl);
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

      console.log('Uploading cover image:', key);

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

      console.log('Cover image uploaded:', coverImageUrl);
    } catch (uploadError) {
      console.error('R2 cover image upload failed:', uploadError);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Cover image upload failed. Please try again.'
      );
    }
  }

  // If photo URL is provided in body (base64/URL from frontend)
  if (req.body.photo && !photoFile) {
    imageUrl = req.body.photo;
    console.log('Photo URL from body:', imageUrl);
  }

  // If cover image URL is provided in body
  if (req.body.coverImage && !(req.files && req.files.coverImage && req.files.coverImage.length > 0)) {
    coverImageUrl = req.body.coverImage;
    console.log('Cover URL from body:', coverImageUrl);
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

  console.log('Update data:', updateData);

  // Only update if there's data to update
  if (Object.keys(updateData).length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No data to update');
  }

  const provider = await dB.providers.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true }
  );

  if (!provider) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
  }

  console.log('Updated provider profile:', provider.profile);

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Business photos saved successfully',
    data: {
      step: 5,
      completed: true,
      photo: provider.profile?.photo,
      coverImage: provider.profile?.coverImage,
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

  const totalAmount = PLAN_PRICES[selectedPlan];

  const verification = await verifyTransaction(paystackReference);
  if (verification.status !== 'success') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification failed');
  }

  // Customers pay Paystack charges on top of the price, so the amount Paystack
  // receives is the plan price + the Paystack fee (1.5% + ₦100, capped ₦2,000).
  // Accept anything from the base price up to base + the applicable fee.
  const paystackFee = Math.min(Math.round(totalAmount * 0.015) + 100, 2000);
  if (verification.amount < totalAmount || verification.amount > totalAmount + paystackFee) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Expected payment of ₦${totalAmount.toLocaleString()} (up to ₦${(totalAmount + paystackFee).toLocaleString()} with Paystack charges). Got ₦${verification.amount.toLocaleString()}`
    );
  }

  // Agent commission
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
          console.log(`Commission of ₦${commissionAmount} added to agent ${agent.agentCode} pending payout`);
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
  provider.kycStatus = 'approved';

  await provider.save();

  // Get or create wallet
  let wallet = await dB.wallets.findOne({ owner: userId.toString() });
  if (!wallet) {
    wallet = await dB.wallets.create({
      owner: userId.toString(),
      ownerType: 'provider',
    });
  }

  // Use 'subscription' type instead of 'debit'
  await dB.transactions.create({
    wallet: wallet._id,
    owner: userId.toString(),
    type: 'subscription', // Changed from 'debit'
    amount: totalAmount,
    balanceBefore: wallet.balance,
    balanceAfter: wallet.balance, // Balance doesn't change since payment is direct
    description: `Business registration (${selectedPlan} plan)`,
    reference: paystackReference,
    status: 'success',
    metadata: {
      plan: selectedPlan,
      agentCode: agentCode,
      commission: commissionAmount,
      paymentMethod: 'paystack',
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
  }).catch(() => { });

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
    const stats = agent.getStats();
    responseData.agent = {
      agentCode: agent.agentCode,
      commission: commissionAmount,
      wallet: {
        balance: stats.wallet.balance,
        totalEarned: stats.wallet.totalEarned,
        pendingPayout: stats.wallet.pendingPayout,
        totalPaidOut: stats.wallet.totalPaidOut,
      },
      totalReferrals: stats.totalReferrals,
      customerReferrals: stats.customerReferrals,
      providerReferrals: stats.providerReferrals,
    };
  }

  res.status(httpStatus.CREATED).json({
    success: true,
    message: agent ? 'Business registration complete. Agent commission added to pending payout!' : 'Business registration complete.',
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