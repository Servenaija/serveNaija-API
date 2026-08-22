// routes/public.routes.js
const express = require('express');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const publicController = require('../../controllers/public.controller');

const router = express.Router();
router.use(allowedMethod);

// Get categories (public)
router.route('/categories')
  .get(publicController.getCategories)
  .all(unAllowedMethod);

// Get providers by category (public)
router.route('/categories/:category')
  .get(publicController.getProvidersByCategory)
  .all(unAllowedMethod);

// Get near me providers (public)
router.route('/near-me')
  .get(publicController.getNearMeProviders)
  .all(unAllowedMethod);

router.route('/near-me/business')
  .get(publicController.getNearMeBusinesses)
  .all(unAllowedMethod);

router.route('/providers/:providerId/completed-jobs')
  .get(
    publicController.getProviderCompletedJobs
  )
  .all(unAllowedMethod)


module.exports = router;