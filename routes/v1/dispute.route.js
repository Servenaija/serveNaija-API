const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const disputeController = require('../../controllers/dispute.controller');

const router = express.Router();
router.use(allowedMethod);

// ── Customer / Provider routes ──────────────────────────────────────────
// Open a dispute on a booking or order
router.route('/open')
  .post(verifyToken, disputeController.openDispute)
  .all(unAllowedMethod);

// List my disputes
router.route('/my')
  .get(verifyToken, disputeController.getMyDisputes)
  .all(unAllowedMethod);

// Get dispute details
router.route('/:disputeId')
  .get(verifyToken, disputeController.getDispute)
  .all(unAllowedMethod);

// Add message to a dispute
router.route('/:disputeId/messages')
  .post(verifyToken, disputeController.addDisputeMessage)
  .all(unAllowedMethod);

// ── Admin routes ────────────────────────────────────────────────────────
// List all disputes (admin)
router.route('/admin/all')
  .get(verifyToken, disputeController.adminListDisputes)
  .all(unAllowedMethod);

// Resolve a dispute — award split (admin)
router.route('/admin/:disputeId/resolve')
  .post(verifyToken, disputeController.adminResolveDispute)
  .all(unAllowedMethod);

module.exports = router;