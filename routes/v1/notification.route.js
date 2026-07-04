const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const notificationController = require('../../controllers/notification.controller');

const router = express.Router();
router.use(allowedMethod);

// Register / update Expo push token
router.route('/token')
  .post(verifyToken, notificationController.registerToken)
  .all(unAllowedMethod);

// List notifications
router.route('/')
  .get(verifyToken, notificationController.listNotifications)
  .all(unAllowedMethod);

// Mark all as read
router.route('/read-all')
  .put(verifyToken, notificationController.markAllRead)
  .all(unAllowedMethod);

// Clear all read
router.route('/clear-read')
  .delete(verifyToken, notificationController.clearRead)
  .all(unAllowedMethod);

// Single notification
router.route('/:id/read')
  .put(verifyToken, notificationController.markRead)
  .all(unAllowedMethod);

router.route('/:id')
  .delete(verifyToken, notificationController.deleteNotification)
  .all(unAllowedMethod);

module.exports = router;
