// routes/review.routes.js

const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const reviewController = require('../../controllers/review.controller');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method')


const router = express.Router();

router.use(allowedMethod);

// Create a review
router.route('/reviews')
    .post(
        verifyToken,
        reviewController.createReview
    )
    .all(unAllowedMethod)
// Get reviews for a target

// Check if user can review a booking
router.route('/reviews/:targetId')
    .get(
        verifyToken,
        reviewController.getReviews
    )
    .all(unAllowedMethod)


router.route('/reviews/booking/:bookingId/can-review')
    .get(
        verifyToken,
        reviewController.checkCanReview
    )
    .all(unAllowedMethod)


module.exports = router;