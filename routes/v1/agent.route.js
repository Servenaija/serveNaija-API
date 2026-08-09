const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const agentController = require('../../controllers/agent.controller');
const agentValidation = require('../../validations/agent.validation');

const router = express.Router();
router.use(allowedMethod);

// Register as agent (supports both customer and provider)
router.route('/register')
  .post(
    verifyToken,
    validate(agentValidation.registerAgent),
    agentController.registerAsAgent
  )
  .all(unAllowedMethod);

// Check if user is an agent
router.route('/status')
  .get(
    verifyToken,
    agentController.checkAgentStatus
  )
  .all(unAllowedMethod);

// Get agent profile
router.route('/me')
  .get(
    verifyToken,
    agentController.getAgentProfile
  )
  .all(unAllowedMethod);

// Get agent stats
router.route('/stats')
  .get(
    verifyToken,
    agentController.getAgentStats
  )
  .all(unAllowedMethod);

// Get agent by referral code (public)
router.route('/referral/:code')
  .get(
    agentController.getAgentByCode
  )
  .all(unAllowedMethod);



// Mark referral as paid
router.route('/referrals/pay')
  .post(
    verifyToken,
    validate(agentValidation.markReferralPaid),
    agentController.markReferralPaid
  )
  .all(unAllowedMethod);


module.exports = router;