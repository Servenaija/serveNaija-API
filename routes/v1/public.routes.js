// routes/public.routes.js
const express = require('express');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const publicController = require('../../controllers/public.controller');
const cache = require('../../utils/cache');

const router = express.Router();
router.use(allowedMethod);

// Get categories (public) — changes rarely, safe to cache longer
router.route('/categories')
  .get(cache.route({ expire: 300 }), publicController.getCategories)
  .all(unAllowedMethod);

// Get providers by category (public)
router.route('/categories/:category')
  .get(cache.route({ expire: 60 }), publicController.getProvidersByCategory)
  .all(unAllowedMethod);

// Get near me providers (public)
router.route('/near-me')
  .get(cache.route({ expire: 60 }), publicController.getNearMeProviders)
  .all(unAllowedMethod);

router.route('/near-me/business')
  .get(cache.route({ expire: 60 }), publicController.getNearMeBusinesses)
  .all(unAllowedMethod);

router.route('/providers/:providerId/completed-jobs')
  .get(
    cache.route({ expire: 60 }),
    publicController.getProviderCompletedJobs
  )
  .all(unAllowedMethod)


module.exports = router;