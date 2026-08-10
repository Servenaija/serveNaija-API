const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const subscriptionController = require('../../controllers/subscription.controller');

const router = express.Router();
router.use(allowedMethod);

// Get available subscription plans based on account type
router.route('/plans')
  .get(verifyToken, subscriptionController.getSubscriptionPlans)
  .all(unAllowedMethod);

// Get current subscription details
router.route('/details')
  .get(verifyToken, subscriptionController.getSubscriptionDetails)
  .all(unAllowedMethod);

// Subscribe to a plan (first time, renewal, or upgrade)
router.route('/subscribe')
  .post(verifyToken, subscriptionController.subscribeToPlan)
  .all(unAllowedMethod);

// Get available upgrades (only higher tier plans)
router.route('/upgrades')
  .get(verifyToken, subscriptionController.getAvailableUpgrades)
  .all(unAllowedMethod);

// Cancel subscription
router.route('/cancel')
  .delete(verifyToken, subscriptionController.cancelSubscription)
  .all(unAllowedMethod);

module.exports = router;