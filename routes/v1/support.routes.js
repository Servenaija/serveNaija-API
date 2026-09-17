const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { isAdmin } = require('../../middlewares/isAdmin');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const supportController = require('../../controllers/support.controller');
const supportValidation = require('../../validations/support.validation');

const router = express.Router();
router.use(allowedMethod);

// ─── USER ROUTES ──────────────────────────────────────────────────────────────
router.route('/tickets')
  .get(verifyToken, supportController.getUserTickets)
  .post(verifyToken, validate(supportValidation.createTicket), supportController.createTicket)
  .all(unAllowedMethod);

// Report a user (provider/business/customer) → admin-reviewed support ticket
router.route('/reports')
  .post(verifyToken, supportController.reportUser)
  .all(unAllowedMethod);

router.route('/tickets/:ticketId')
  .get(verifyToken, supportController.getUserTicket)
  .all(unAllowedMethod);

router.route('/tickets/:ticketId/messages')
  .post(verifyToken, validate(supportValidation.addMessage), supportController.addUserMessage)
  .all(unAllowedMethod);

router.route('/tickets/:ticketId/close')
  .post(verifyToken, supportController.closeTicket)
  .all(unAllowedMethod);

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
router.use(verifyToken, isAdmin);

router.route('/admin/tickets')
  .get(supportController.getAdminTickets)
  .all(unAllowedMethod);

router.route('/admin/tickets/:ticketId')
  .get(supportController.getAdminTicket)
  .all(unAllowedMethod);

router.route('/admin/tickets/:ticketId/assign')
  .post(supportController.assignTicket)
  .all(unAllowedMethod);

router.route('/admin/tickets/:ticketId/messages')
  .post(validate(supportValidation.addMessage), supportController.sendAdminMessage)
  .all(unAllowedMethod);

router.route('/admin/tickets/:ticketId/resolve')
  .post(supportController.resolveTicket)
  .all(unAllowedMethod);

router.route('/admin/tickets/:ticketId/close')
  .post(supportController.adminCloseTicket)
  .all(unAllowedMethod);

module.exports = router;