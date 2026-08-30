// routes/customer.routes.js
const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const customerController = require('../../controllers/customer.controller');
const customerValidation = require('../../validations/customer.validation')
const validate = require('../../middlewares/validate');

const router = express.Router();
router.use(allowedMethod);

// Wallet routes
router.route('/wallet/balance')
  .get(verifyToken, customerController.getWalletBalance)
  .all(unAllowedMethod);

router.route('/wallet')
  .get(verifyToken, customerController.getWallet)
  .all(unAllowedMethod);

router.route('/wallet/transactions')
  .get(verifyToken, customerController.getTransactions)
  .all(unAllowedMethod);

router.route('/wallet/summary')
  .get(verifyToken, customerController.getWalletWithTransactions)
  .all(unAllowedMethod);

router.route('/wallet/fund')
  .post(verifyToken, customerController.fundWallet)
  .all(unAllowedMethod);

router.route('/wallet/withdraw')
  .post(verifyToken, customerController.withdrawFromWallet)
  .all(unAllowedMethod);

router.route('/me')
  .get(verifyToken, customerController.getProfile)
  .put(verifyToken, customerController.updateProfile)
  .all(unAllowedMethod);

// Membership routes
router.route('/membership/initialize')
  .post(verifyToken, validate(customerValidation.initializeMembership), customerController.initializeMembership)
  .all(unAllowedMethod);

router.route('/membership/status')
  .get(verifyToken, customerController.getMembership)
  .all(unAllowedMethod);

router.route('/membership/upgrade')
  .post(verifyToken, validate(customerValidation.upgradeMembership), customerController.upgradeToPremium)
  .all(unAllowedMethod);

router.route('/membership/has')
  .get(verifyToken, customerController.hasMembership)
  .all(unAllowedMethod);

router.route('/reactive')
  .post(customerController.reactivateAccount)
  .all(unAllowedMethod);


router.route('/deactive')
  .post(verifyToken, customerController.deactivateAccount)
  .all(unAllowedMethod);

module.exports = router;