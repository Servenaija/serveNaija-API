// controllers/providerOnboarding.controller.js
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const Provider = require('../models/provider');
const Category = require('../models/category');
const { uploadObject } = require('../utils/aws.s3.bucket');
const { sendPushNotification } = require('../services/notification.service');
const axios = require('axios');
const Agent = require('../models/agent');
const Transactions = require('../models/transaction');
const { dB } = require('../models');
// Step 1: Choose Account Type
const chooseAccountType = catchAsync(async (req, res) => {
  const { accountType } = req.body;

  if (!['provider', 'business'].includes(accountType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid account type. Must be "provider" or "business"');
  }

  const provider = await Provider.findByIdAndUpdate(
    req.user._id,
    { accountType },
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Account type selected successfully',
    data: { accountType: provider.accountType }
  });
});

// Step 2: Fetch Categories
const getCategories = catchAsync(async (req, res) => {
  // Check all categories first
  const allCategories = await Category.find({});
  console.log('All categories count:', allCategories.length);
  console.log('All categories:', allCategories);

  const categories = await Category.find({ isActive: true })
    .select('name description imageUrl')
    .sort({ name: 1 });

  console.log('Active categories count:', categories.length);

  res.json({
    success: true,
    data: categories
  });
});

// Step 3: Service Information
const updateServiceInfo = catchAsync(async (req, res) => {
  const {
    category,
    experience,
    businessName,
    description
  } = req.body;

  // Validate category exists
  if (category) {
    const categoryExists = await Category.findOne({
      name: category,
      isActive: true
    });
    if (!categoryExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid category');
    }
  }

  const provider = await Provider.findByIdAndUpdate(
    req.user._id,
    {
      'service.category': category || '',
      'service.experience': experience || '',
      'service.businessName': businessName || '',
      'service.description': description || ''
    },
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Service information updated successfully',
    data: provider.service
  });
});

// Step 4: Location Information
const updateLocation = catchAsync(async (req, res) => {
  const {
    state,
    city,
    area,
    address,
    latitude,
    longitude,
    radius,
    travelOutsideArea
  } = req.body;

  // Validate coordinates if provided
  if (latitude && longitude) {
    if (latitude < -90 || latitude > 90) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid latitude');
    }
    if (longitude < -180 || longitude > 180) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid longitude');
    }
  }

  const updateData = {
    'location.state': state || '',
    'location.city': city || '',
    'location.area': area || '',
    'location.address': address || '',
    'location.radius': radius || '10KM',
    'location.travelOutsideArea': travelOutsideArea !== undefined ? travelOutsideArea : true,
    'location.coordinates.latitude': latitude || null,
    'location.coordinates.longitude': longitude || null
  };

  // Update GeoJSON for 2dsphere queries
  if (latitude && longitude) {
    updateData.geoLocation = {
      type: 'Point',
      coordinates: [longitude, latitude]
    };
  } else {
    updateData.geoLocation = undefined;
  }

  const provider = await Provider.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Location information updated successfully',
    data: {
      location: provider.location,
      geoLocation: provider.geoLocation
    }
  });
});

// Step 5: Profile Information with Image Upload
const updateProfile = catchAsync(async (req, res) => {
  const { bio } = req.body;
  let photoUrl = null;
  let coverImageUrl = null;

  // Handle profile photo upload - check req.files.photo instead of req.file
  if (req.files && req.files.photo && req.files.photo.length > 0) {
    try {
      const file = req.files.photo[0];
      const key = `providers/${req.user._id}/profile/${Date.now()}-${file.originalname}`;

      console.log('Uploading profile photo to R2...');
      console.log('Bucket:', process.env.R2_BUCKET_NAME);
      console.log('Key:', key);

      const uploadResult = await uploadObject({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      console.log('Upload result:', uploadResult);

      photoUrl = uploadResult.Location;

      if (!photoUrl) {
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

  // Handle cover image upload if file exists
  if (req.files && req.files.coverImage && req.files.coverImage.length > 0) {
    try {
      const file = req.files.coverImage[0];
      const key = `providers/${req.user._id}/cover/${Date.now()}-${file.originalname}`;

      console.log('Uploading cover image to R2...');
      console.log('Bucket:', process.env.R2_BUCKET_NAME);
      console.log('Key:', key);

      const uploadResult = await uploadObject({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      console.log('Upload result:', uploadResult);

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
  if (req.body.photo && !(req.files && req.files.photo && req.files.photo.length > 0)) {
    photoUrl = req.body.photo;
  }

  // If cover image URL is provided in body
  if (req.body.coverImage && !(req.files && req.files.coverImage && req.files.coverImage.length > 0)) {
    coverImageUrl = req.body.coverImage;
  }

  const updateData = {
    'profile.bio': bio || '',
  };

  if (photoUrl) {
    updateData['profile.photo'] = photoUrl;
  }

  if (coverImageUrl) {
    updateData['profile.coverImage'] = coverImageUrl;
  }

  console.log('Update data:', updateData);

  const provider = await Provider.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Profile information updated successfully',
    data: provider.profile,
  });
});

// Step 6: Submit KYC (boolean true/false)
const submitKYC = catchAsync(async (req, res) => {
  const { status } = req.body; // 'pending', 'approved', or 'failed'

  if (!status) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'status is required (pending, approved, or failed)');
  }

  const validStatuses = ['pending', 'approved', 'failed'];
  if (!validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status. Use pending, approved, or failed');
  }

  let message = '';
  let notificationTitle = '';
  let notificationBody = '';

  if (status === 'approved') {
    message = 'KYC verified successfully';
    notificationTitle = 'KYC Verification Approved';
    notificationBody = 'Your KYC verification has been approved. You can now access all provider features.';
  } else if (status === 'pending') {
    message = 'KYC is pending review. You will be notified within 24 hours.';
    notificationTitle = 'KYC Verification Pending';
    notificationBody = 'Your KYC verification is pending review. You will be notified once it is completed within 24 hours.';
  } else if (status === 'failed') {
    message = 'KYC verification failed';
    notificationTitle = 'KYC Verification Failed';
    notificationBody = 'Your KYC verification could not be completed. Please contact support for assistance.';
  }

  const provider = await Provider.findByIdAndUpdate(
    req.user._id,
    { kycStatus: status },
    { new: true, runValidators: true }
  );

  // Send push notification
  if (provider && provider.expoPushToken) {
    try {
      await sendPushNotification({
        userId: provider._id.toString(),
        actorType: 'provider',
        title: notificationTitle,
        body: notificationBody,
        type: 'kyc',
        data: {
          status: status,
          updatedAt: new Date().toISOString()
        },
      });
      console.log(`[KYC] Notification sent: ${notificationTitle} to provider ${provider.email}`);
    } catch (notificationError) {
      console.error('[KYC] Failed to send notification:', notificationError);
    }
  }

  res.json({
    success: true,
    message,
    data: {
      kycStatus: provider.kycStatus,
      status: status,
      message: message
    }
  });
});

// Get KYC Status
const getKYCStatus = catchAsync(async (req, res) => {
  const provider = await Provider.findById(req.user._id)
    .select('kycStatus firstName lastName email phoneNumber');

  res.json({
    success: true,
    data: {
      kycStatus: provider.kycStatus || 'idle',
      status: provider.kycStatus || 'idle',
      userInfo: {
        firstName: provider.firstName,
        lastName: provider.lastName,
        email: provider.email,
        phoneNumber: provider.phoneNumber,
      },
      message: provider.kycStatus === 'pending'
        ? 'KYC is pending review. You will be notified within 24 hours.'
        : undefined
    }
  });
});
const verifySubscription = catchAsync(async (req, res) => {
  try {
    const { reference } = req.body;
    const providerId = req.user.id;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required',
      });
    }

    const existingTx = await Transactions.findOne({ reference });
    if (existingTx) {
      return res.status(400).json({
        success: false,
        message: 'This payment reference has already been processed',
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    if (!response.data.status) {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Payment verification failed',
      });
    }

    const transaction = response.data.data;

    if (transaction.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: `Payment status: ${transaction.status}`,
      });
    }

    // Convert amount from kobo to Naira
    const amountInNaira = transaction.amount / 100;

    const plan = transaction.metadata?.plan;
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan in transaction metadata',
      });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found',
      });
    }

    let wallet = await dB.wallets.findOne({ owner: providerId.toString() });
    if (!wallet) {
      wallet = await dB.wallets.create({
        owner: providerId.toString(),
        ownerType: 'provider',
      });
    }

    let agent = null;
    let commissionAmount = 0;
    const agentCode = provider.agentCode || transaction.metadata?.agentCode || req.body.agentCode;

    if (agentCode) {
      agent = await Agent.findOne({ agentCode: agentCode.toUpperCase(), isActive: true });

      if (agent) {
        commissionAmount = Math.round(amountInNaira * 0.06);

        try {
          const existingReferral = agent.referrals.find(
            r => r.referredUserId === providerId.toString() && r.referredUserType === 'provider'
          );

          if (!existingReferral) {
            await agent.addReferral(providerId.toString(), 'provider', commissionAmount);
            console.log(`Commission of NGN ${commissionAmount} added to agent ${agent.agentCode}`);
          }
        } catch (referralError) {
          console.error('Error adding referral to agent:', referralError);
        }
      }
    }

    const renewalDate = new Date();
    renewalDate.setDate(renewalDate.getDate() + 365);

    provider.subscription = {
      selectedPlan: plan,
      amountPaid: amountInNaira,  // Store in Naira
      currency: transaction.currency || 'NGN',
      paidAt: new Date(),
      renewalDate: renewalDate,
      isActive: true,
    };

    await provider.save();

    const balanceBefore = wallet.balance;
    await Transactions.create({
      wallet: wallet._id,
      owner: providerId.toString(),
      type: 'subscription',
      amount: amountInNaira,  // Store in Naira
      balanceBefore: balanceBefore,
      balanceAfter: wallet.balance,
      description: `Subscription (${plan} plan) - ${transaction.currency || 'NGN'} ${amountInNaira.toFixed(2)}`,
      reference: reference,
      status: 'success',
      metadata: {
        plan: plan,
        paystackData: transaction,
        agentCode: agentCode,
        commission: commissionAmount,
        paymentMethod: 'paystack',
        amountInKobo: transaction.amount,
        amountInNaira: amountInNaira,
      },
    });

    const responseData = {
      subscription: {
        selectedPlan: provider.subscription.selectedPlan,
        isActive: provider.subscription.isActive,
        renewalDate: provider.subscription.renewalDate,
        amountPaid: provider.subscription.amountPaid,
      },
      agentCode: provider.agentCode,
    };

    if (agent) {
      const stats = agent.getStats();
      responseData.agent = {
        agentCode: agent.agentCode,
        commission: commissionAmount,
        wallet: stats.wallet,
        totalReferrals: stats.totalReferrals,
      };
    }

    return res.status(200).json({
      success: true,
      message: agent ? 'Subscription activated successfully. Agent commission added!' : 'Subscription activated successfully.',
      data: responseData,
    });

  } catch (error) {
    console.error('Subscription verification error:', error);
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || 'Internal server error',
    });
  }
});

module.exports = {
  chooseAccountType,
  getCategories,
  updateServiceInfo,
  updateLocation,
  updateProfile,
  submitKYC,
  getKYCStatus,
  verifySubscription
};