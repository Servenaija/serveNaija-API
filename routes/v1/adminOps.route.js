/**
 * adminOps.route.js — SEPARATE route for all new admin-ops requests.
 * Mounted at /admin-ops. Guarded by verifyToken + isAdmin.
 * Does NOT touch routes/v1/admin.route.js.
 */
const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { isAdmin, requirePermission } = require('../../middlewares/isAdmin');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const ops = require('../../controllers/adminOps.controller');
const v = require('../../validations/adminOps.validation');

const router = express.Router();
router.use(allowedMethod);
router.use(verifyToken, isAdmin);

// dashboard-v2 (correct KYC)
router.route('/dashboard-v2').get(ops.getDashboardV2).all(unAllowedMethod);

// finance
router.route('/finance/overview').get(requirePermission('transactions'), ops.getFinanceOverview).all(unAllowedMethod);

// cancel with refund
router.route('/bookings/:id/cancel').put(requirePermission('bookings'), validate(v.cancelBody), ops.adminCancelBooking).all(unAllowedMethod);
router.route('/orders/:id/cancel').put(requirePermission('marketplace'), validate(v.cancelBody), ops.adminCancelOrder).all(unAllowedMethod);

// payouts (admin releases)
router.route('/payouts/queue').get(requirePermission('transactions'), ops.getPayoutQueue).all(unAllowedMethod);
router.route('/payouts/release').post(requirePermission('transactions'), validate(v.releaseSingleBody), ops.releaseSinglePayout).all(unAllowedMethod);
router.route('/payouts/release-bulk').post(requirePermission('transactions'), validate(v.releaseBulkBody), ops.releaseBulkPayouts).all(unAllowedMethod);

// agent payouts
router.route('/agent-payouts/queue').get(requirePermission('transactions'), ops.getAgentPayoutQueue).all(unAllowedMethod);
router.route('/agent-payouts/release').post(requirePermission('transactions'), validate(v.agentPayoutSingleBody), ops.releaseAgentPayout).all(unAllowedMethod);
router.route('/agent-payouts/release-bulk').post(requirePermission('transactions'), validate(v.agentPayoutBulkBody), ops.releaseBulkAgentPayouts).all(unAllowedMethod);

// paystack transaction receipts
router.route('/paystack/transactions').get(requirePermission('transactions'), ops.getPaystackTransactions).all(unAllowedMethod);

// unread counts (navbar badge)
router.route('/chat/unread-counts').get(ops.getUnreadCounts).all(unAllowedMethod);

// marketplace live
router.route('/marketplace/overview').get(requirePermission('marketplace'), ops.getMarketplaceOverview).all(unAllowedMethod);
router.route('/marketplace/orders/:id').get(requirePermission('marketplace'), ops.getMarketplaceOrderDetail).all(unAllowedMethod);

// provider jobs + reviews (drill-down from ranked earners)
router.route('/providers/:id/jobs').get(ops.getProviderJobs).all(unAllowedMethod);

// broadcast + targeted push
router.route('/notifications/broadcast').post(requirePermission('notifications'), validate(v.broadcastBody), ops.broadcastOps).all(unAllowedMethod);
router.route('/notifications/targeted').post(requirePermission('notifications'), validate(v.targetedBody), ops.targetedPush).all(unAllowedMethod);

// presence / activity / contacts / direct message
router.route('/presence/online').get(ops.getOnlinePresence).all(unAllowedMethod);
router.route('/users/activity').get(ops.getUserActivity).all(unAllowedMethod);
router.route('/users/:actor/:id/contact').get(ops.getUserContact).all(unAllowedMethod);
router.route('/messages/direct').post(validate(v.directMessageBody), ops.sendDirectMessage).all(unAllowedMethod);

module.exports = router;
