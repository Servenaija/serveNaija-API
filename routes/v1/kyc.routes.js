const express = require('express');
const  kycController  = require('../../controllers/kyc.controller');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');

const router = express.Router();
router.use(allowedMethod);

// Dojah webhook — no auth required (Dojah calls this)
router.route('/webhook/dojah')
    .post(verifyToken, kycController.dojahWebhook)
    .all(unAllowedMethod);


module.exports = router;  