// validations/customer.validation.js

const Joi = require('joi');

const initializeMembership = {
  body: Joi.object().keys({
    plan: Joi.string().valid('free', 'premium').required().messages({
      'any.required': 'Plan is required',
      'any.only': 'Plan must be either free or premium',
    }),
    paystackReference: Joi.when('plan', {
      is: 'premium',
      then: Joi.string().required().messages({
        'any.required': 'Paystack reference is required for premium membership',
        'string.empty': 'Paystack reference cannot be empty',
      }),
      otherwise: Joi.string().optional().allow('', null),
    }),
  }),
};

const upgradeMembership = {
  body: Joi.object().keys({
    paystackReference: Joi.string().required().messages({
      'any.required': 'Paystack reference is required',
    }),
  }),
};

module.exports = {
  initializeMembership,
  upgradeMembership,
};