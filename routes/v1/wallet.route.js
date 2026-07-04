const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const walletController = require('../../controllers/wallet.controller');
const walletValidation = require('../../validations/wallet.validation');

const router = express.Router();
router.use(allowedMethod);

// Wallet overview + recent transactions
router.route('/')
  .get(verifyToken, walletController.getWallet)
  .all(unAllowedMethod);

// Fund wallet (verify Paystack ref and credit)
router.route('/fund')
  .post(verifyToken, validate(walletValidation.fundWallet), walletController.fundWallet)
  .all(unAllowedMethod);

// Withdraw to bank account
router.route('/withdraw')
  .post(verifyToken, validate(walletValidation.withdrawFunds), walletController.withdrawFunds)
  .all(unAllowedMethod);

// Full transaction history
router.route('/transactions')
  .get(verifyToken, walletController.listTransactions)
  .all(unAllowedMethod);

// Nigerian bank list (for the dropdown in the withdrawal form)
router.route('/banks')
  .get(walletController.getBanks)
  .all(unAllowedMethod);

// Paystack webhook (raw body needed — handled in app.js with express.raw)
router.route('/webhook/paystack')
  .post(walletController.paystackWebhook)
  .all(unAllowedMethod);

module.exports = router;
