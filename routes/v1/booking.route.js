const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const bookingController = require('../../controllers/booking.controller');
const bookingValidation = require('../../validations/booking.validation');

const router = express.Router();
router.use(allowedMethod);

// ─── CUSTOMER: Bookings ───────────────────
router.route('/')
  .get(verifyToken, bookingController.listBookings)
  .post(verifyToken, validate(bookingValidation.createBooking), bookingController.createBooking)
  .all(unAllowedMethod);

router.route('/:id')
  .get(verifyToken, bookingController.getBooking)
  .all(unAllowedMethod);

router.route('/:id/cancel')
  .put(verifyToken, validate(bookingValidation.cancelBooking), bookingController.cancelBooking)
  .all(unAllowedMethod);

router.route('/:id/start-code/generate')
  .post(verifyToken, bookingController.generateStartCode)
  .all(unAllowedMethod);

router.route('/:id/confirm-complete')
  .post(verifyToken, bookingController.confirmComplete)
  .all(unAllowedMethod);

router.route('/:id/rate')
  .post(verifyToken, validate(bookingValidation.rateBooking), bookingController.rateBooking)
  .all(unAllowedMethod);

// ─── PROVIDER: Jobs ───────────────────────
router.route('/jobs')
  .get(verifyToken, bookingController.listJobs)
  .all(unAllowedMethod);

router.route('/jobs/:id')
  .get(verifyToken, bookingController.getJob)
  .all(unAllowedMethod);

router.route('/jobs/:id/accept')
  .put(verifyToken, bookingController.acceptJob)
  .all(unAllowedMethod);

router.route('/jobs/:id/decline')
  .put(verifyToken, validate(bookingValidation.declineJob), bookingController.declineJob)
  .all(unAllowedMethod);

router.route('/jobs/:id/status')
  .put(verifyToken, bookingController.updateJobStatus)
  .all(unAllowedMethod);

router.route('/jobs/:id/start-code/verify')
  .post(verifyToken, validate(bookingValidation.verifyStartCode), bookingController.verifyStartCode)
  .all(unAllowedMethod);

router.route('/jobs/:id/complete')
  .post(verifyToken, validate(bookingValidation.completeJob), bookingController.completeJob)
  .all(unAllowedMethod);

router.route('/jobs/:id/additional-payment')
  .post(verifyToken, validate(bookingValidation.additionalPayment), bookingController.requestAdditionalPayment)
  .all(unAllowedMethod);

module.exports = router;
