const express = require('express');

const {
  verifyToken,
} = require('../../middlewares/verify');

const {
  allowedMethod,
} = require('../../middlewares/headers');

const {
  unAllowedMethod,
} = require('../../middlewares/method');

const streamController =
  require('../../controllers/stream.controller');

const router =
  express.Router();

router.use(allowedMethod);

/**
 * =========================================================
 * GET STREAM TOKEN
 * =========================================================
 *
 * Returns the Stream token for the currently authenticated
 * customer/provider.
 *
 * The user ID comes from verifyToken -> req.user.
 * Nothing is accepted from the request body.
 */
router
  .route('/token')
  .post(
    verifyToken,
    streamController.getStreamToken
  )
  .all(unAllowedMethod);

module.exports = router;