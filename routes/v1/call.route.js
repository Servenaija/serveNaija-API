const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const callController = require('../../controllers/call.controller');

const router = express.Router();
router.use(allowedMethod);

// Initiate a call (creates Cloudflare RealtimeKit session)
router.route('/initiate')
  .post(verifyToken, callController.initiateCall)
  .all(unAllowedMethod);

// Call history
router.route('/history')
  .get(verifyToken, callController.callHistory)
  .all(unAllowedMethod);

// Answer a call
router.route('/:id/answer')
  .put(verifyToken, callController.answerCall)
  .all(unAllowedMethod);

// Reject a call
router.route('/:id/reject')
  .put(verifyToken, callController.rejectCall)
  .all(unAllowedMethod);

// End a call
router.route('/:id/end')
  .put(verifyToken, callController.endCall)
  .all(unAllowedMethod);

module.exports = router;
