const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const providerController = require('../../controllers/provider.controller');
const providerValidation = require('../../validations/provider.validation');

const router = express.Router();
router.use(allowedMethod);

// Profile
router.route('/me')
  .get(verifyToken, providerController.getMe)
  .put(verifyToken, validate(providerValidation.updateProfile), providerController.updateMe)
  .all(unAllowedMethod);

// Availability toggle
router.route('/availability')
  .put(verifyToken, validate(providerValidation.updateAvailability), providerController.updateAvailability)
  .all(unAllowedMethod);

// Location
router.route('/location')
  .put(verifyToken, validate(providerValidation.updateLocation), providerController.updateLocation)
  .all(unAllowedMethod);

// Password
router.route('/change-password')
  .put(verifyToken, providerController.changePassword)
  .all(unAllowedMethod);

// Notification settings
router.route('/notification-settings')
  .put(verifyToken, validate(providerValidation.updateNotificationSettings), providerController.updateNotificationSettings)
  .all(unAllowedMethod);

// Expo push token
router.route('/expo-token')
  .put(verifyToken, providerController.updateExpoToken)
  .all(unAllowedMethod);

// Bank details
router.route('/bank-details')
  .put(verifyToken, validate(providerValidation.updateBankDetails), providerController.updateBankDetails)
  .all(unAllowedMethod);

// Services (provider's service offerings)
router.route('/services')
  .get(verifyToken, providerController.listServices)
  .post(verifyToken, validate(providerValidation.addService), providerController.addService)
  .all(unAllowedMethod);

router.route('/services/:id')
  .put(verifyToken, validate(providerValidation.updateService), providerController.updateService)
  .delete(verifyToken, providerController.deleteService)
  .all(unAllowedMethod);

// Dashboard stats
router.route('/stats')
  .get(verifyToken, providerController.getStats)
  .all(unAllowedMethod);

// Earnings history
router.route('/earnings')
  .get(verifyToken, providerController.getEarnings)
  .all(unAllowedMethod);

// Promotions / Featured plans
router.route('/promotion')
  .get(verifyToken, providerController.getMyPromotions)
  .post(verifyToken, providerController.purchasePromotion)
  .all(unAllowedMethod);

// Subscription plans + upgrade
router.route('/subscription/plans')
  .get(verifyToken, providerController.getSubscriptionPlans)
  .all(unAllowedMethod);

router.route('/subscription/activate')
  .post(verifyToken, providerController.manageSubscription)
  .all(unAllowedMethod);

router.route('/subscription/upgrade')
  .post(verifyToken, (req, res, next) => { req.body.isUpgrade = true; next(); }, providerController.manageSubscription)
  .all(unAllowedMethod);

module.exports = router;
