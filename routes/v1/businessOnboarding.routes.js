// routes/businessOnboarding.routes.js
const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const { uploadFields } = require('../../middlewares/upload');
const businessOnboardingController = require('../../controllers/businessOnboarding.controller');

const router = express.Router();
router.use(allowedMethod);



// Step 1: Business Identity
router.route('/step1')
  .post(verifyToken, businessOnboardingController.saveBusinessIdentity)
  .all(unAllowedMethod);

// Step 2: Contact Details
router.route('/step2')
  .put(verifyToken, businessOnboardingController.saveBusinessContact)
  .all(unAllowedMethod);

// Step 3: Location
router.route('/step3')
  .post(verifyToken, businessOnboardingController.saveBusinessLocation)
  .all(unAllowedMethod);

// Step 4: Bank Details
router.route('/step4')
  .post(verifyToken, businessOnboardingController.saveBusinessBankDetails)
  .all(unAllowedMethod);

// Step 5: Photos (with file upload)
router.route('/step5')
  .put(
    verifyToken,
    uploadFields,
    businessOnboardingController.saveBusinessPhotos
  )
  .all(unAllowedMethod);

// Step 6: Complete Onboarding with Payment
router.route('/step6')
  .post(verifyToken, businessOnboardingController.completeBusinessOnboarding)
  .all(unAllowedMethod);

// Get all progress
router.route('/progress')
  .get(verifyToken, businessOnboardingController.getOnboardingProgress)
  .all(unAllowedMethod);

// Get specific step progress
router.route('/progress/:step')
  .get(verifyToken, businessOnboardingController.getStepProgress)
  .all(unAllowedMethod);

module.exports = router;