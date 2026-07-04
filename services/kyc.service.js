/**
 * KYC Service — powered by Dojah (https://dojah.io)
 *
 * WHY DOJAH over Jumio:
 *  - Purpose-built for West African markets (Nigeria-founded)
 *  - Native NIN, BVN, Driver's License, Voter's Card, Int'l Passport verification
 *  - Direct NIMC + CBN database integrations (real-time government ID lookup)
 *  - Liveness check + face-match in one API call (Selfie + ID)
 *  - CAC business registration lookup for business KYC
 *  - 60–80% cheaper than Jumio for Nigerian volumes
 *  - Nigerian-language support (Yoruba, Igbo, Hausa)
 *
 * Required env vars:
 *   DOJAH_APP_ID=your_app_id
 *   DOJAH_PRIVATE_KEY=your_private_key
 */

const axios = require('axios');
const logger = require('../config/logger');

const DOJAH_APP_ID = process.env.DOJAH_APP_ID;
const DOJAH_PRIVATE_KEY = process.env.DOJAH_PRIVATE_KEY;
const DOJAH_BASE = 'https://api.dojah.io';

const dojahClient = axios.create({
  baseURL: DOJAH_BASE,
  headers: {
    AppId: DOJAH_APP_ID,
    Authorization: DOJAH_PRIVATE_KEY,
    'Content-Type': 'application/json',
  },
});

/**
 * Verify a NIN (National Identification Number).
 * Returns the holder's full details from NIMC.
 */
async function verifyNIN(nin) {
  const { data } = await dojahClient.get(`/api/v1/kyc/nin`, { params: { nin } });
  if (!data.entity) throw new Error('NIN verification failed.');
  return data.entity;
}

/**
 * Verify a BVN (Bank Verification Number).
 * Returns the holder's full details from CBN.
 */
async function verifyBVN(bvn) {
  const { data } = await dojahClient.get(`/api/v1/kyc/bvn`, { params: { bvn } });
  if (!data.entity) throw new Error('BVN verification failed.');
  return data.entity;
}

/**
 * Verify a Driver's License.
 */
async function verifyDriversLicense(licenseNumber, state) {
  const { data } = await dojahClient.get(`/api/v1/kyc/dl`, {
    params: { license_number: licenseNumber, state_of_issue: state },
  });
  if (!data.entity) throw new Error('Driver\'s license verification failed.');
  return data.entity;
}

/**
 * Verify an International Passport.
 */
async function verifyPassport(passportNumber, surname, dateOfBirth) {
  const { data } = await dojahClient.get(`/api/v1/kyc/passport`, {
    params: { passport_number: passportNumber, surname, dob: dateOfBirth },
  });
  if (!data.entity) throw new Error('Passport verification failed.');
  return data.entity;
}

/**
 * Perform a liveness + face-match check.
 * @param {string} selfieBase64  - base64 encoded selfie image
 * @param {string} idImageBase64 - base64 encoded document image
 * @returns {{ livenessScore, faceMatchScore, passed }}
 */
async function performFaceMatch(selfieBase64, idImageBase64) {
  const { data } = await dojahClient.post(`/api/v1/ml/face.match`, {
    image_one: selfieBase64,
    image_two: idImageBase64,
  });

  const result = data.entity;
  return {
    livenessScore: result?.liveness_score ?? null,
    faceMatchScore: result?.match_confidence ?? null,
    passed: result?.match_confidence != null && result.match_confidence >= 80,
  };
}

/**
 * Verify a CAC (Corporate Affairs Commission) registration number for business KYC.
 */
async function verifyCACRegistration(rcNumber) {
  const { data } = await dojahClient.get(`/api/v1/kyc/cac`, { params: { rc_number: rcNumber } });
  if (!data.entity) throw new Error('CAC verification failed.');
  return data.entity;
}

/**
 * Submit KYC to Dojah with automatic document type routing.
 * Returns a { passed, livenessScore, faceMatchScore, dojahResponse } object.
 */
async function submitKYC({ documentType, documentNumber, selfieBase64, documentImageBase64, extraParams = {} }) {
  let verifiedData = null;

  try {
    switch (documentType) {
      case 'nin':
        verifiedData = await verifyNIN(documentNumber);
        break;
      case 'bvn':
        verifiedData = await verifyBVN(documentNumber);
        break;
      case 'drivers_license':
        verifiedData = await verifyDriversLicense(documentNumber, extraParams.state);
        break;
      case 'international_passport':
        verifiedData = await verifyPassport(documentNumber, extraParams.surname, extraParams.dob);
        break;
      default:
        throw new Error(`Unsupported document type: ${documentType}`);
    }
  } catch (err) {
    logger.error('[kyc] Document verification failed:', err.message);
    return { passed: false, dojahResponse: { error: err.message } };
  }

  // Face-match if both images provided
  let faceResult = { livenessScore: null, faceMatchScore: null, passed: false };
  if (selfieBase64 && documentImageBase64) {
    try {
      faceResult = await performFaceMatch(selfieBase64, documentImageBase64);
    } catch (err) {
      logger.error('[kyc] Face match failed:', err.message);
    }
  }

  return {
    passed: faceResult.passed,
    livenessScore: faceResult.livenessScore,
    faceMatchScore: faceResult.faceMatchScore,
    dojahResponse: verifiedData,
  };
}

module.exports = {
  verifyNIN,
  verifyBVN,
  verifyDriversLicense,
  verifyPassport,
  verifyCACRegistration,
  performFaceMatch,
  submitKYC,
};
