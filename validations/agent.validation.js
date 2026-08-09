const Joi = require('joi');

const registerAgent = {
  body: Joi.object().keys({
    paystackReference: Joi.string().required(),
    userType: Joi.string().valid('customer', 'provider').optional(),
  }),
};

const addReferral = {
  body: Joi.object().keys({
    referredUserId: Joi.string().required(),
    referredUserType: Joi.string().valid('customer', 'provider').required(),
    commission: Joi.number().min(0).optional(),
  }),
};

const markReferralPaid = {
  body: Joi.object().keys({
    referredUserId: Joi.string().required(),
    referredUserType: Joi.string().valid('customer', 'provider').required(),
  }),
};

module.exports = {
  registerAgent,
  addReferral,
  markReferralPaid,
};