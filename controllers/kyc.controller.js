const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');
const kycService = require('../services/kyc.service');
const notificationService = require('../services/notification.service');

// GET /kyc/status
const getStatus = catchAsync(async (req, res) => {
  const userId = req.user._id.toString();
  const kyc = await dB.kyc.findOne({ userId });

  if (!kyc) {
    return res.json({ status: 'not_started', kyc: null });
  }

  res.json({ status: kyc.status, kyc });
});

// POST /kyc/submit
// Accepts: documentType, documentNumber, (optional) selfieImageUrl, documentImageUrl
// For quick NIN/BVN lookups without image upload, provide only documentNumber.
// For full face-match, provide base64 selfie + document images via selfieBase64 + documentBase64 fields.
const submit = catchAsync(async (req, res) => {
  const userId = req.user._id.toString();
  const { documentType, documentNumber, selfieBase64, documentBase64, documentImageUrl, selfieImageUrl, extraParams } = req.body;

  if (!documentType || !documentNumber) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Document type and document number are required.');
  }

  // Create or update KYC record
  let kyc = await dB.kyc.findOne({ userId });
  if (!kyc) {
    kyc = await dB.kyc.create({
      userId,
      userType: req.user.constructor.modelName === 'Provider' ? 'provider' : 'customer',
      status: 'submitted',
      documentType,
      documentNumber,
      documentImageUrl: documentImageUrl || null,
      selfieImageUrl: selfieImageUrl || null,
    });
  } else {
    kyc.status = 'submitted';
    kyc.documentType = documentType;
    kyc.documentNumber = documentNumber;
    if (documentImageUrl) kyc.documentImageUrl = documentImageUrl;
    if (selfieImageUrl) kyc.selfieImageUrl = selfieImageUrl;
    await kyc.save();
  }

  // Run Dojah verification (async — don't block the response)
  setImmediate(async () => {
    try {
      const result = await kycService.submitKYC({
        documentType,
        documentNumber,
        selfieBase64: selfieBase64 || null,
        documentImageBase64: documentBase64 || null,
        extraParams: extraParams || {},
      });

      kyc.dojahResponse = result.dojahResponse;
      kyc.livenessScore = result.livenessScore;
      kyc.faceMatchScore = result.faceMatchScore;
      kyc.faceMatchPassed = result.passed;

      // Auto-approve if face match passed or if no selfie was provided (manual review)
      if (selfieBase64 && documentBase64) {
        kyc.status = result.passed ? 'approved' : 'rejected';
        if (!result.passed) {
          kyc.rejectionReason = 'Face match or liveness check failed.';
        }
      } else {
        // Flag for manual review
        kyc.status = 'pending';
      }

      kyc.reviewedAt = new Date();
      await kyc.save();

      // Update provider KYC status inline
      if (kyc.userType === 'provider') {
        await dB.providers.findByIdAndUpdate(userId, {
          $set: {
            'kyc.status': kyc.status,
            'kyc.reviewedAt': kyc.reviewedAt,
            'kyc.rejectionReason': kyc.rejectionReason || null,
          },
        });
      }

      // Notify user
      notificationService.sendPushNotification({
        userId,
        actorType: kyc.userType,
        title: kyc.status === 'approved' ? 'Identity Verified!' : 'KYC Update',
        body:
          kyc.status === 'approved'
            ? 'Your identity has been successfully verified.'
            : kyc.status === 'rejected'
            ? 'Your KYC submission was not successful. Please try again.'
            : 'Your KYC documents are under review.',
        type: 'kyc',
        data: { kycStatus: kyc.status },
      }).catch(() => {});
    } catch (err) {
      kyc.status = 'pending';
      kyc.dojahResponse = { error: err.message };
      await kyc.save();
    }
  });

  res.status(httpStatus.CREATED).json({
    message: 'KYC submission received. We will notify you once verification is complete.',
    kyc: { status: kyc.status, documentType: kyc.documentType },
  });
});

// POST /kyc/verify-nin  — quick NIN lookup (no face-match)
const verifyNIN = catchAsync(async (req, res) => {
  const { nin } = req.body;
  if (!nin) throw new ApiError(httpStatus.BAD_REQUEST, 'NIN is required.');
  const data = await kycService.verifyNIN(nin);
  res.json({ verified: true, data });
});

// POST /kyc/verify-bvn  — quick BVN lookup
const verifyBVN = catchAsync(async (req, res) => {
  const { bvn } = req.body;
  if (!bvn) throw new ApiError(httpStatus.BAD_REQUEST, 'BVN is required.');
  const data = await kycService.verifyBVN(bvn);
  res.json({ verified: true, data });
});

module.exports = {
  getStatus,
  submit,
  verifyNIN,
  verifyBVN,
};
