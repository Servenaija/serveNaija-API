// controllers/providerOnboarding.controller.js
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const  Provider  = require('../models/provider');
const Category = require('../models/category');
const { uploadObject } = require('../utils/aws.s3.bucket');

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

  // Handle photo upload if file exists
  if (req.file) {
    try {
      const file = req.file;
      const key = `providers/${req.user._id}/profile/${Date.now()}-${file.originalname}`;

      console.log('Uploading to R2...');
      console.log('Bucket:', process.env.R2_BUCKET_NAME);
      console.log('Key:', key);

      const uploadResult = await uploadObject({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      console.log('Upload result:', uploadResult);

      // uploadObject already returns Location using publicUrl
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

  // If photo URL is provided in body (base64/URL from frontend)
  if (req.body.photo && !req.file) {
    photoUrl = req.body.photo;
  }

  const updateData = {
    'profile.bio': bio || '',
  };

  if (photoUrl) {
    updateData['profile.photo'] = photoUrl;
  }

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
  const { kycVerified } = req.body;

  // kycVerified should be a boolean
  if (typeof kycVerified !== 'boolean') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'kycVerified must be a boolean (true or false)');
  }

  const provider = await Provider.findByIdAndUpdate(
    req.user._id,
    { kycVerified },
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: `KYC ${kycVerified ? 'verified' : 'not verified'} successfully`,
    data: { kycVerified: provider.kycVerified }
  });
});

// Get KYC Status
const getKYCStatus = catchAsync(async (req, res) => {
  const provider = await Provider.findById(req.user._id)
    .select('kycVerified firstName lastName email phoneNumber');

  res.json({
    success: true,
    data: {
      kycVerified: provider.kycVerified,
      userInfo: {
        firstName: provider.firstName,
        lastName: provider.lastName,
        email: provider.email,
        phoneNumber: provider.phoneNumber
      }
    }
  });
});

module.exports = {
  chooseAccountType,
  getCategories,
  updateServiceInfo,
  updateLocation,
  updateProfile,
  submitKYC,
  getKYCStatus,
};