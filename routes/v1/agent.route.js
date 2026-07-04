const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const agentController = require('../../controllers/agent.controller');

const router = express.Router();
router.use(allowedMethod);

// Register as agent (pays ₦5,000)
router.route('/register')
  .post(verifyToken, agentController.register)
  .all(unAllowedMethod);

// Agent profile
router.route('/me')
  .get(verifyToken, agentController.getMe)
  .all(unAllowedMethod);

// Earnings summary
router.route('/earnings')
  .get(verifyToken, agentController.getEarnings)
  .all(unAllowedMethod);

// Referrals list
router.route('/referrals')
  .get(verifyToken, agentController.getReferrals)
  .all(unAllowedMethod);

module.exports = router;
