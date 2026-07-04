const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const kycController = require('../../controllers/kyc.controller');

const router = express.Router();
router.use(allowedMethod);

// Get KYC status for the authenticated user
router.route('/status')
  .get(verifyToken, kycController.getStatus)
  .all(unAllowedMethod);

// Submit KYC documents for Dojah verification
router.route('/submit')
  .post(verifyToken, kycController.submit)
  .all(unAllowedMethod);

// Quick NIN lookup
router.route('/verify-nin')
  .post(verifyToken, kycController.verifyNIN)
  .all(unAllowedMethod);

// Quick BVN lookup
router.route('/verify-bvn')
  .post(verifyToken, kycController.verifyBVN)
  .all(unAllowedMethod);

module.exports = router;
