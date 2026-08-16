// validations/providerOnboarding.validation.js
const Joi = require('joi');

const chooseAccountType = {
  body: Joi.object().keys({
    accountType: Joi.string().valid('provider', 'business').required()
  })
};

const updateServiceInfo = {
  body: Joi.object().keys({
    category: Joi.string().trim().required(),
    experience: Joi.string().trim().required(),
    businessName: Joi.string().trim().allow('', null),
    description: Joi.string().trim().allow('', null)
  })
};

const updateLocation = {
  body: Joi.object().keys({
    state: Joi.string().trim().required(),
    city: Joi.string().trim().required(),
    area: Joi.string().trim().allow('', null),
    address: Joi.string().trim().required(),
    latitude: Joi.number().min(-90).max(90).allow(null),
    longitude: Joi.number().min(-180).max(180).allow(null),
    radius: Joi.string().valid('5KM', '10KM', '15KM', '20KM', 'Anywhere in my city').default('10KM'),  // ← updated
    travelOutsideArea: Joi.boolean().default(true)
  })
};

const updateProfile = {
  body: Joi.object().keys({
    photo: Joi.string().uri().allow(null),
    bio: Joi.string().trim().max(500).allow('', null),
    coverImage: Joi.string().uri().allow(null)
  })
};

const submitKYC = {
  body: Joi.object().keys({
    status: Joi.string().valid('pending', 'approved', 'failed').required()
  })
};

module.exports = {
  chooseAccountType,
  updateServiceInfo,
  updateLocation,
  updateProfile,
  submitKYC
};