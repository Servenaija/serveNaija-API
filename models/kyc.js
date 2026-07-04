const mongoose = require('mongoose');

/**
 * KYC model — powered by Dojah (https://dojah.io)
 * Dojah is the recommended KYC provider for this project over Jumio because:
 *  - Native support for Nigerian IDs: NIN, BVN, Driver's License, Voter's Card, Int'l Passport, CAC
 *  - Built-in liveness check + face-match against government databases
 *  - Nigerian-founded, affordable pricing compared to Jumio's enterprise pricing
 *  - Direct NIN/BVN database lookups via NIMC / CBN integrations
 */
const kycSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    userType: { type: String, enum: ['provider', 'customer'], required: true },

    documentType: {
      type: String,
      enum: ['nin', 'bvn', 'drivers_license', 'international_passport', 'voters_card'],
      default: null,
    },
    documentNumber: { type: String, trim: true, default: null },
    documentImageUrl: { type: String, default: null },
    selfieImageUrl: { type: String, default: null },

    // Dojah job tracking
    dojahJobId: { type: String, default: null },
    dojahRequestId: { type: String, default: null },
    dojahResponse: { type: mongoose.Schema.Types.Mixed, default: null },

    // Verification scores (from Dojah face-match + liveness)
    livenessScore: { type: Number, default: null },
    faceMatchScore: { type: Number, default: null },
    faceMatchPassed: { type: Boolean, default: null },

    status: {
      type: String,
      enum: ['not_started', 'submitted', 'pending', 'approved', 'rejected'],
      default: 'not_started',
    },
    rejectionReason: { type: String, trim: true, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
  },
  { timestamps: true }
);

kycSchema.index({ userId: 1 });
kycSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('KYC', kycSchema);
