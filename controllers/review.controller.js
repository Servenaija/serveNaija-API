// controllers/review.controller.js

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

/**
 * Create a review for a provider
 * Customer can only review after payment is released
 */
const createReview = catchAsync(async (req, res) => {
  const { targetId, targetType, bookingId, overall, text, quality, punctuality, professionalism, communication } = req.body;
  const customerId = req.user._id.toString();
  const customerName = req.user.fullName || req.user.name || 'Customer';

  // Validate required fields
  if (!targetId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Target ID is required');
  }

  if (!targetType || !['provider', 'product', 'store'].includes(targetType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid targetType is required (provider, product, store)');
  }

  if (!overall || overall < 1 || overall > 5) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Overall rating must be between 1 and 5');
  }

  // If bookingId is provided, verify it exists and belongs to customer
  if (bookingId) {
    const booking = await dB.bookings.findOne({
      _id: bookingId,
      customer: customerId,
    });

    if (!booking) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found or does not belong to you');
    }

    // Check if payment has been released
    if (booking.paymentStatus !== 'released') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment must be released before you can review');
    }

    // Check if already reviewed
    if (booking.rating && booking.rating.overall > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'You have already reviewed this booking');
    }

    // Check if booking is completed
    if (booking.status !== 'completed') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Booking must be completed before you can review');
    }
  }

  // Check if review already exists for this booking
  if (bookingId) {
    const existingReview = await dB.reviews.findOne({
      reviewer: customerId,
      booking: bookingId,
    });

    if (existingReview) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'You have already reviewed this booking');
    }
  }

  // Create the review
  const review = await dB.reviews.create({
    reviewer: customerId,
    reviewerName: customerName,
    target: targetId,
    targetType: targetType,
    booking: bookingId || null,
    overall: overall,
    categories: {
      quality: quality || null,
      punctuality: punctuality || null,
      professionalism: professionalism || null,
      communication: communication || null,
    },
    text: text || '',
    isVerified: !!bookingId,
  });

  // If bookingId is provided, update the booking's rating field
  if (bookingId) {
    await dB.bookings.findByIdAndUpdate(bookingId, {
      $set: {
        'rating.overall': overall,
        'rating.review': text || '',
        'rating.ratedAt': new Date(),
        'rating.quality': quality || null,
        'rating.punctuality': punctuality || null,
        'rating.professionalism': professionalism || null,
        'rating.communication': communication || null,
      },
    });
  }

  // Update provider's average rating
  await updateProviderAverageRating(targetId);

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Review submitted successfully',
    review: review,
  });
});

/**
 * Update provider's average rating
 */
async function updateProviderAverageRating(providerId) {
  try {
    const result = await dB.reviews.aggregate([
      {
        $match: {
          target: providerId,
          targetType: 'provider',
        },
      },
      {
        $group: {
          _id: null,
          average: { $avg: '$overall' },
          count: { $sum: 1 },
        },
      },
    ]);

    if (result.length > 0) {
      await dB.providers.findByIdAndUpdate(providerId, {
        $set: {
          avgRating: Math.round(result[0].average * 10) / 10,
          reviewCount: result[0].count,
        },
      });
    }
  } catch (error) {
    console.error('Error updating provider average rating:', error);
  }
}

/**
 * Get reviews for a target (provider, product, store)
 */
const getReviews = catchAsync(async (req, res) => {
  const { targetId } = req.params;
  const { targetType, page = 1, limit = 10 } = req.query;

  if (!targetType || !['provider', 'product', 'store'].includes(targetType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid targetType is required');
  }

  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    dB.reviews
      .find({ target: targetId, targetType: targetType })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    dB.reviews.countDocuments({ target: targetId, targetType: targetType }),
  ]);

  res.status(httpStatus.OK).json({
    success: true,
    reviews: reviews,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * Check if user can review a booking
 */
const checkCanReview = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const customerId = req.user._id.toString();

  const booking = await dB.bookings.findOne({
    _id: bookingId,
    customer: customerId,
  });

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const canReview = booking.paymentStatus === 'released' && 
                    booking.status === 'completed' && 
                    (!booking.rating || booking.rating.overall === 0);

  const alreadyReviewed = booking.rating && booking.rating.overall > 0;

  res.status(httpStatus.OK).json({
    success: true,
    canReview: canReview,
    alreadyReviewed: alreadyReviewed,
    booking: booking,
  });
});

module.exports = {
  createReview,
  getReviews,
  checkCanReview,
};