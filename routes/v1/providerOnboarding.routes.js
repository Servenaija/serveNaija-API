// routes/v1/providerOnboarding.routes.js
const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const { uploadFields } = require('../../middlewares/upload');
const providerOnboardingController = require('../../controllers/providerOnboarding.controller');
const providerOnboardingValidation = require('../../validations/providerOnboarding.validation');

const router = express.Router();
router.use(allowedMethod);

// Step 1: Choose Account Type
router.route('/choose-account-type')
  .post(verifyToken, validate(providerOnboardingValidation.chooseAccountType), providerOnboardingController.chooseAccountType)
  .all(unAllowedMethod);

// Step 2: Get Categories
router.route('/categories')
  .get(verifyToken, providerOnboardingController.getCategories)
  .all(unAllowedMethod);

// Step 3: Service Information
router.route('/service-info')
  .put(verifyToken, validate(providerOnboardingValidation.updateServiceInfo), providerOnboardingController.updateServiceInfo)
  .all(unAllowedMethod);

// Step 4: Location Information
router.route('/location')
  .put(verifyToken, validate(providerOnboardingValidation.updateLocation), providerOnboardingController.updateLocation)
  .all(unAllowedMethod);

// Step 5: Profile Information with Image Upload
router.route('/profile')
  .put(
    verifyToken,
    uploadFields, // Use uploadFields (already configured with fields)
    validate(providerOnboardingValidation.updateProfile),
    providerOnboardingController.updateProfile
  )
  .all(unAllowedMethod);

// Step 6: KYC Status & Submit
router.route('/kyc-status')
  .get(verifyToken, providerOnboardingController.getKYCStatus)
  .all(unAllowedMethod);

router.route('/submit-kyc')
  .post(verifyToken, validate(providerOnboardingValidation.submitKYC), providerOnboardingController.submitKYC)
  .all(unAllowedMethod);

router.route('/subscription')
  .post(verifyToken, providerOnboardingController.verifySubscription)
  .all(unAllowedMethod);

module.exports = router;