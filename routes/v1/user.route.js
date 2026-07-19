const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const userController = require('../../controllers/user.controller');

const router = express.Router();
router.use(allowedMethod);

// Current customer profile
router.route('/me')
  .get(verifyToken, userController.getMe)
  .put(verifyToken, userController.updateMe)
  .all(unAllowedMethod);

// Change password
router.route('/change-password')
  .put(verifyToken, userController.changePassword)
  .all(unAllowedMethod);

// Expo push token
router.route('/expo-token')
  .put(verifyToken, userController.updateExpoToken)
  .all(unAllowedMethod);

// Notification preferences
router.route('/notification-settings')
  .put(verifyToken, userController.updateNotificationSettings)
  .all(unAllowedMethod);

// Public provider discovery
router.route('/providers')
  .get(userController.listProviders)
  .all(unAllowedMethod);

router.route('/providers/:id')
  .get(userController.getProvider)
  .all(unAllowedMethod);

module.exports = router;
