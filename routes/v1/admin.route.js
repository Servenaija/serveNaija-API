const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { isAdmin } = require('../../middlewares/isAdmin');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const adminController = require('../../controllers/admin.controller');

const router = express.Router();
router.use(allowedMethod);

// ─── PUBLIC (no auth required) ────────────────────────────────────────────────
router.route('/login')
  .post(adminController.login)
  .all(unAllowedMethod);

// ─── Auth guard for all routes below ─────────────────────────────────────────
router.use(verifyToken, isAdmin);

// ─── Admin Profile ────────────────────────────────────────────────────────────
router.route('/me')
  .get(adminController.getMe)
  .put(adminController.updateMe)
  .all(unAllowedMethod);

router.route('/change-password')
  .put(adminController.changePassword)
  .all(unAllowedMethod);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.route('/dashboard')
  .get(adminController.getDashboard)
  .all(unAllowedMethod);

// ─── Customers ────────────────────────────────────────────────────────────────
router.route('/customers')
  .get(adminController.listCustomers)
  .all(unAllowedMethod);

router.route('/customers/:id')
  .get(adminController.getCustomer)
  .all(unAllowedMethod);

router.route('/customers/:id/ban')
  .put(adminController.banCustomer)
  .all(unAllowedMethod);

router.route('/customers/:id/bookings')
  .get(adminController.getCustomerBookings)
  .all(unAllowedMethod);

router.route('/customers/:id/orders')
  .get(adminController.getCustomerOrders)
  .all(unAllowedMethod);

router.route('/customers/:id/transactions')
  .get(adminController.getCustomerTransactions)
  .all(unAllowedMethod);

// ─── Providers ────────────────────────────────────────────────────────────────
router.route('/providers')
  .get(adminController.listProviders)
  .all(unAllowedMethod);

router.route('/providers/:id')
  .get(adminController.getProvider)
  .all(unAllowedMethod);

router.route('/providers/:id/ban')
  .put(adminController.banProvider)
  .all(unAllowedMethod);

router.route('/providers/:id/bookings')
  .get(adminController.getProviderBookings)
  .all(unAllowedMethod);

router.route('/providers/:id/services')
  .get(adminController.getProviderServices)
  .all(unAllowedMethod);

router.route('/providers/:id/transactions')
  .get(adminController.getProviderTransactions)
  .all(unAllowedMethod);

// ─── Bookings ─────────────────────────────────────────────────────────────────
router.route('/bookings')
  .get(adminController.listBookings)
  .all(unAllowedMethod);

router.route('/bookings/:id')
  .get(adminController.getBooking)
  .all(unAllowedMethod);

// ─── KYC ─────────────────────────────────────────────────────────────────────
router.route('/kyc')
  .get(adminController.listKYC)
  .all(unAllowedMethod);

router.route('/kyc/:id/approve')
  .put(adminController.approveKYC)
  .all(unAllowedMethod);

router.route('/kyc/:id/reject')
  .put(adminController.rejectKYC)
  .all(unAllowedMethod);

// ─── Transactions ─────────────────────────────────────────────────────────────
router.route('/transactions')
  .get(adminController.listTransactions)
  .all(unAllowedMethod);

// ─── Notifications / Broadcast ────────────────────────────────────────────────
router.route('/notifications')
  .get(adminController.listNotifications)
  .all(unAllowedMethod);

router.route('/notifications/broadcast')
  .post(adminController.broadcastNotification)
  .all(unAllowedMethod);

// ─── Agents ───────────────────────────────────────────────────────────────────
router.route('/agents')
  .get(adminController.listAgents)
  .all(unAllowedMethod);

// ─── Services ─────────────────────────────────────────────────────────────────
router.route('/services')
  .get(adminController.listServices)
  .all(unAllowedMethod);

// ─── Marketplace ──────────────────────────────────────────────────────────────
router.route('/marketplace/orders')
  .get(adminController.listOrders)
  .all(unAllowedMethod);

router.route('/marketplace/stores')
  .get(adminController.listStores)
  .all(unAllowedMethod);

router.route('/marketplace/products')
  .get(adminController.listProducts)
  .all(unAllowedMethod);

module.exports = router;

