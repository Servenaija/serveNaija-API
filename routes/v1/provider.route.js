const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const { teamPermission, logTeamActivity } = require('../../middlewares/team');
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
  .post(verifyToken, teamPermission('createService'), logTeamActivity('service.create', 'service'), validate(providerValidation.addService), providerController.addService)
  .all(unAllowedMethod);

router.route('/services/:id')
  .put(verifyToken, teamPermission('createService'), logTeamActivity('service.update', 'service'), validate(providerValidation.updateService), providerController.updateService)
  .delete(verifyToken, teamPermission('createService'), logTeamActivity('service.delete', 'service'), providerController.deleteService)
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
router.route('/deactivate')
  .post(verifyToken, providerController.deactivateAccount)
  .all(unAllowedMethod);

// Reactivate account (no token required)
router.route('/reactivate')
  .post(validate(providerValidation.login), providerController.reactivateAccount)
  .all(unAllowedMethod);

router.route('/subscription/activate')
  .post(verifyToken, providerController.manageSubscription)
  .all(unAllowedMethod);

router.route('/subscription/upgrade')
  .post(verifyToken, (req, res, next) => { req.body.isUpgrade = true; next(); }, providerController.manageSubscription)
  .all(unAllowedMethod);

  // ─── ENTERPRISE TEAM MANAGEMENT (Premium/Enterprise only) ───
  // NOTE: these MUST be registered BEFORE the '/:providerId' public routes
  // below, otherwise Express matches e.g. 'team-members' as :providerId.
  // Get team members / Add a team member (employee sub-account)
  // NOTE: GET + POST must live on ONE router.route() chain — a second
  // router.route('/team-members') never runs because .all(unAllowedMethod)
  // on the first one catches every other method first (405).
router.route('/team-members')
  .get(verifyToken, providerController.listTeamMembers)
  .post(verifyToken, providerController.addTeamMember)
  .all(unAllowedMethod);

// Assign team member to customers
router.route('/team-members/:id/assign')
  .put(verifyToken, providerController.assignTeamMember)
  .all(unAllowedMethod);

// Remove team member
router.route('/team-members/:id')
  .delete(verifyToken, providerController.removeTeamMember)
  .all(unAllowedMethod);

// Update what a member can see/do (wallet, promote, jobs, marketplace,
// create service, chat)
router.route('/team-members/:id/permissions')
  .put(verifyToken, providerController.updateTeamMemberPermissions)
  .all(unAllowedMethod);

// Assign a member to specific jobs (bookings)
router.route('/team-members/:id/assign-jobs')
  .put(verifyToken, providerController.assignTeamMemberJobs)
  .all(unAllowedMethod);

// Owner reviews everything a member did since their account was created
// (including the customers they chatted with)
router.route('/team-members/:id/activity')
  .get(verifyToken, providerController.getTeamMemberActivity)
  .all(unAllowedMethod);

// Owner resets a member's password (returns the NEW password once so the
// owner can see it and share it with the employee)
router.route('/team-members/:id/reset-password')
  .post(verifyToken, providerController.resetTeamMemberPassword)
  .all(unAllowedMethod);

// Owner toggles the "must reset password on first login" requirement
router.route('/team-members/:id/password-policy')
  .put(verifyToken, providerController.setTeamMemberPasswordPolicy)
  .all(unAllowedMethod);

// Owner deactivates/reactivates a member account (terminate / restore)
router.route('/team-members/:id/status')
  .put(verifyToken, providerController.setTeamMemberStatus)
  .all(unAllowedMethod);

  // ─── PUBLIC ROUTES ───

// Get provider profile
router.route('/:providerId')
  .get(providerController.getProviderProfilePublic)
  .all(unAllowedMethod);

// Get provider services
router.route('/:providerId/services')
  .get(providerController.getProviderServices)
  .all(unAllowedMethod);

// Get provider reviews
router.route('/:providerId/reviews')
  .get(providerController.getProviderReviews)
  .all(unAllowedMethod);

module.exports = router;
