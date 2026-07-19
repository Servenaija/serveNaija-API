const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { isAdmin, isSuperAdmin, requirePermission } = require('../../middlewares/isAdmin');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const adminController = require('../../controllers/admin.controller');

const router = express.Router();
router.use(allowedMethod);

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
router.route('/login')
  .post(adminController.login)
  .all(unAllowedMethod);

// Public: anyone can list active categories (providers/customers need them)
router.route('/categories/public')
  .get((req, res, next) => {
    req.query.activeOnly = 'true';
    return adminController.listCategories(req, res, next);
  })
  .all(unAllowedMethod);

// ─── Auth guard for all routes below ─────────────────────────────────────────
router.use(verifyToken, isAdmin);

// ─── Admin Profile (any authenticated admin) ─────────────────────────────────
router.route('/me')
  .get(adminController.getMe)
  .put(adminController.updateMe)
  .all(unAllowedMethod);

router.route('/change-password')
  .put(adminController.changePassword)
  .all(unAllowedMethod);

// Returns the full list of possible permissions (used by frontend settings UI)
router.route('/permissions/all')
  .get(adminController.getAllPermissions)
  .all(unAllowedMethod);

// ─── Admin Team Management (superadmin only) ──────────────────────────────────
router.route('/create')
  .post(isSuperAdmin, adminController.createAdmin)
  .all(unAllowedMethod);

router.route('/team')
  .get(isSuperAdmin, adminController.listAdmins)
  .all(unAllowedMethod);

router.route('/team/:id')
  .get(isSuperAdmin, adminController.getAdminById)
  .all(unAllowedMethod);

router.route('/team/:id/permissions')
  .put(isSuperAdmin, adminController.updateAdminPermissions)
  .all(unAllowedMethod);

router.route('/team/:id/toggle-active')
  .put(isSuperAdmin, adminController.toggleAdminActive)
  .all(unAllowedMethod);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.route('/dashboard')
  .get(requirePermission('dashboard'), adminController.getDashboard)
  .all(unAllowedMethod);

// ─── Customers ────────────────────────────────────────────────────────────────
router.route('/customers')
  .get(requirePermission('customers'), adminController.listCustomers)
  .all(unAllowedMethod);

router.route('/customers/:id')
  .get(requirePermission('customers'), adminController.getCustomer)
  .all(unAllowedMethod);

router.route('/customers/:id/ban')
  .put(requirePermission('customers'), adminController.banCustomer)
  .all(unAllowedMethod);

router.route('/customers/:id/bookings')
  .get(requirePermission('customers'), adminController.getCustomerBookings)
  .all(unAllowedMethod);

router.route('/customers/:id/orders')
  .get(requirePermission('customers'), adminController.getCustomerOrders)
  .all(unAllowedMethod);

router.route('/customers/:id/transactions')
  .get(requirePermission('transactions'), adminController.getCustomerTransactions)
  .all(unAllowedMethod);

// ─── Providers ────────────────────────────────────────────────────────────────
router.route('/providers')
  .get(requirePermission('providers'), adminController.listProviders)
  .all(unAllowedMethod);

router.route('/providers/:id')
  .get(requirePermission('providers'), adminController.getProvider)
  .all(unAllowedMethod);

router.route('/providers/:id/ban')
  .put(requirePermission('providers'), adminController.banProvider)
  .all(unAllowedMethod);

router.route('/providers/:id/bookings')
  .get(requirePermission('providers'), adminController.getProviderBookings)
  .all(unAllowedMethod);

router.route('/providers/:id/services')
  .get(requirePermission('providers'), adminController.getProviderServices)
  .all(unAllowedMethod);

router.route('/providers/:id/transactions')
  .get(requirePermission('transactions'), adminController.getProviderTransactions)
  .all(unAllowedMethod);

// ─── Bookings ─────────────────────────────────────────────────────────────────
router.route('/bookings')
  .get(requirePermission('bookings'), adminController.listBookings)
  .all(unAllowedMethod);

router.route('/bookings/:id')
  .get(requirePermission('bookings'), adminController.getBooking)
  .all(unAllowedMethod);

// ─── KYC ─────────────────────────────────────────────────────────────────────
router.route('/kyc')
  .get(requirePermission('kyc'), adminController.listKYC)
  .all(unAllowedMethod);

router.route('/kyc/:id/approve')
  .put(requirePermission('kyc'), adminController.approveKYC)
  .all(unAllowedMethod);

router.route('/kyc/:id/reject')
  .put(requirePermission('kyc'), adminController.rejectKYC)
  .all(unAllowedMethod);

// ─── Transactions ─────────────────────────────────────────────────────────────
router.route('/transactions')
  .get(requirePermission('transactions'), adminController.listTransactions)
  .all(unAllowedMethod);

// ─── Notifications / Broadcast ────────────────────────────────────────────────
router.route('/notifications')
  .get(requirePermission('notifications'), adminController.listNotifications)
  .all(unAllowedMethod);

router.route('/notifications/broadcast')
  .post(requirePermission('notifications'), adminController.broadcastNotification)
  .all(unAllowedMethod);

// ─── Agents ───────────────────────────────────────────────────────────────────
router.route('/agents')
  .get(requirePermission('agents'), adminController.listAgents)
  .all(unAllowedMethod);

// ─── Services ─────────────────────────────────────────────────────────────────
router.route('/services')
  .get(requirePermission('services'), adminController.listServices)
  .all(unAllowedMethod);

// ─── Marketplace ──────────────────────────────────────────────────────────────
router.route('/marketplace/orders')
  .get(requirePermission('marketplace'), adminController.listOrders)
  .all(unAllowedMethod);

router.route('/marketplace/stores')
  .get(requirePermission('marketplace'), adminController.listStores)
  .all(unAllowedMethod);

router.route('/marketplace/products')
  .get(requirePermission('marketplace'), adminController.listProducts)
  .all(unAllowedMethod);

router.route('/calls')
  .get(verifyToken, isAdmin, adminController.listCalls)
  .all(unAllowedMethod);

// ─── Promotions ──────────────────────────────────────────────────────────────
router.route('/promotions')
  .get(requirePermission('categories'), adminController.listPromotions)
  .all(unAllowedMethod);

router.route('/promotions/:id/cancel')
  .put(requirePermission('categories'), adminController.cancelPromotion)
  .all(unAllowedMethod);

// ─── Categories ───────────────────────────────────────────────────────────────
router.route('/categories')
  .get(adminController.listCategories)
  .post(requirePermission('categories'), adminController.createCategory)
  .all(unAllowedMethod);

router.route('/categories/:id')
  .get(adminController.getCategory)
  .put(requirePermission('categories'), adminController.updateCategory)
  .delete(requirePermission('categories'), adminController.deleteCategory)
  .all(unAllowedMethod);

module.exports = router;

