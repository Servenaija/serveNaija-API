const express = require('express');
const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/auth.validation');
const authController = require('../../controllers/auth.controller');
const auth = require('../../middlewares/auth');
const { verifyToken } = require('../../middlewares/verify');
const { authLimiter } = require('../../middlewares/rateLimiter');
const { allowedMethod } = require('../../middlewares/headers');
const config = require('../../config/auth');
const { unAllowedMethod } = require('../../middlewares/method');
const cache = require('../../utils/cache');

const router = express.Router();

router.use(allowedMethod)

// Registration routes - NO CACHE (write operations)
router.route('/register/customer')
    .post(allowedMethod, validate(authValidation.registerUser), authController.registerUser)
    .all(unAllowedMethod)

router.route('/register/provider')
    .post(allowedMethod, validate(authValidation.registerProvider), authController.registerProvider)
    .all(unAllowedMethod)

// Login routes - NO CACHE (security sensitive)
router.route('/login/customer')
    .post(allowedMethod, validate(authValidation.login), authController.loginUser)
    .all(unAllowedMethod)

router.route('/login/provider')
    .post(allowedMethod, validate(authValidation.login), authController.loginProvider)
    .all(unAllowedMethod)

// Logout - WITH CACHE (clear cache on logout)
router.route('/logout')
    .post(cache.route(), allowedMethod, validate(authValidation.logout), authController.logout)
    .all(unAllowedMethod)

// Refresh tokens - NO CACHE (real-time token operations)
router.route('/refresh-tokens')
    .post(allowedMethod, validate(authValidation.refreshTokens), authController.refreshTokens)
    .all(unAllowedMethod)

// Password operations - NO CACHE (security sensitive)
router.route('/forgot-password')
    .post(allowedMethod, validate(authValidation.forgotPassword), authController.forgotPassword)
    .all(unAllowedMethod)

router.route('/send-magic-link')
    .post(allowedMethod,  authController.sendMagicLink)
    .all(unAllowedMethod)

module.exports = router;