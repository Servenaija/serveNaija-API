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

/**
 * The Stream webhook handler lives in the call
 * controller because it reuses the call lifecycle
 * helpers (status mapping, chat messages, socket
 * emissions).
 */
const callController =
  require('../../controllers/call.controller');

const router =
  express.Router();

router.use(allowedMethod);

/**
 * =========================================================
 * STREAM WEBHOOK
 * =========================================================
 *
 * POST /v1.0/stream/webhook
 *
 * Receives Stream server-to-server call lifecycle events
 * (call.accepted, call.rejected, call.missed, call.ended)
 * for calls that were answered / declined on the NATIVE
 * call screen.
 *
 * Configure this URL in the Stream Dashboard:
 *   Video -> Webhooks -> https://<api-host>/v1.0/stream/webhook
 *
 * Public route: authenticated by the Stream webhook
 * signature (HMAC of the raw body with the API secret).
 * =========================================================
 */
router
  .route('/webhook')
  .post(
    callController.streamWebhook
  )
  .all(unAllowedMethod);

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