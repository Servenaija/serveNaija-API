// routes/promotion.routes.js
const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const promotionController = require('../../controllers/promotion.controller');
const promotionValidation = require('../../validations/promotion.validation');

const router = express.Router();
router.use(allowedMethod);

// ─── FEATURED LISTINGS ────────────────────
// Purchase featured listing
router.route('/featured/purchase')
  .post(verifyToken, validate(promotionValidation.purchaseFeatured), promotionController.purchaseFeatured)
  .all(unAllowedMethod);

// Get user's featured listings
router.route('/featured/my')
  .get(verifyToken, promotionController.getMyFeatured)
  .all(unAllowedMethod);

// Get all featured providers (public)
router.route('/featured')
  .get(promotionController.getFeaturedProviders)
  .all(unAllowedMethod);

// ─── ADVERTISING CAMPAIGNS ────────────────
// Purchase ad campaign
router.route('/ads/purchase')
  .post(verifyToken, validate(promotionValidation.purchaseAd), promotionController.purchaseAd)
  .all(unAllowedMethod);

// Get user's ads
router.route('/ads/my')
  .get(verifyToken, promotionController.getMyAds)
  .all(unAllowedMethod);

// Get active ads with proximity (public) - FOR CUSTOMERS
router.route('/ads/customers')
  .get(promotionController.getActiveAdss)  // Using the proximity version
  .all(unAllowedMethod);

// Get featured providers with proximity (public) - FOR CUSTOMERS
router.route('/ads/providers-customers')
  .get(promotionController.getFeaturedProviderss)  // Using the proximity version
  .all(unAllowedMethod);

// Get single ad details (public) - ADD THIS
router.route('/ads/:adId')
  .get(promotionController.getAdDetails)
  .all(unAllowedMethod);

// Get provider's ads (public) - ADD THIS
router.route('/providers/:providerId/ads')
  .get(promotionController.getProviderAds)
  .all(unAllowedMethod);

module.exports = router;