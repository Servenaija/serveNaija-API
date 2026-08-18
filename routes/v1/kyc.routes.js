// routes/kyc.routes.js
const express = require('express');
const kycController = require('../../controllers/kyc.controller');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');

const router = express.Router();

// Webhook - bypass jsonHeader check
router.route('/webhook/dojah')
    .post( kycController.dojahWebhook)  // No allowedMethod
    .all(unAllowedMethod);


module.exports = router;