// routes/customer.routes.js
const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const customerController = require('../../controllers/customer.controller');

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

module.exports = router;