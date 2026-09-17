const Joi = require('joi');

const createBooking = {
  body: Joi.object().keys({
    providerId: Joi.string().required().messages({
      'any.required': 'Provider is required.'
    }),
    serviceId: Joi.string().optional(),
    serviceName: Joi.string().trim().required().messages({
      'any.required': 'Service name is required.'
    }),
    servicePrice: Joi.number().min(0).required().messages({
      'any.required': 'Service price is required.'
    }),
    serviceCategory: Joi.string().trim().optional(),
    description: Joi.string().trim().max(1000).optional(),
    scheduledDate: Joi.date().iso().optional(),
    timeSlot: Joi.string().trim().optional(),
    address: Joi.alternatives().try(
      Joi.object({
        full: Joi.string().trim().required(),
        landmark: Joi.string().trim().optional().allow(''),
        state: Joi.string().trim().optional().allow(''),
        city: Joi.string().trim().optional().allow(''),
        coordinates: Joi.object({
          latitude: Joi.number().optional().allow(null),
          longitude: Joi.number().optional().allow(null),
        }).optional(),
      }).required(),
      Joi.string() // Allow string for FormData
    ).required().messages({
      'any.required': 'Service address is required.'
    }),
    additionalNotes: Joi.string().trim().max(500).optional().allow(''),
    paymentMethod: Joi.string().valid('wallet', 'paystack', 'card').optional(),
    transactionReference: Joi.string().trim().optional().allow('', null),
    paystackReference: Joi.string().trim().optional().allow('', null),
    reference: Joi.string().trim().optional().allow('', null),
     photos: Joi.alternatives().try(
      Joi.array().items(Joi.string()),
      Joi.array().items(Joi.object())
    ).optional(),
  }),
};

const cancelBooking = {
  body: Joi.object().keys({
    reason: Joi.string().trim().max(500).optional().allow(''),
  }),
};

const rateBooking = {
  body: Joi.object().keys({
    overall: Joi.number().min(1).max(5).required().messages({ 'any.required': 'Overall rating is required.' }),
    quality: Joi.number().min(1).max(5).optional(),
    punctuality: Joi.number().min(1).max(5).optional(),
    professionalism: Joi.number().min(1).max(5).optional(),
    communication: Joi.number().min(1).max(5).optional(),
    review: Joi.string().trim().max(1000).optional().allow(''),
  }),
};

const completeJob = {
  body: Joi.object().keys({
    beforePhotos: Joi.array().items(Joi.string()).max(5).optional(),
    afterPhotos: Joi.array().items(Joi.string()).max(5).optional(),
    completionNotes: Joi.string().trim().max(400).optional().allow(''),
  }),
};

const additionalPayment = {
  body: Joi.object().keys({
    reason: Joi.string().trim().required().messages({ 'any.required': 'Reason is required.' }),
    description: Joi.string().trim().max(250).required(),
    amount: Joi.number().min(1).required().messages({ 'any.required': 'Amount is required.' }),
  }),
};

const declineJob = {
  body: Joi.object().keys({
    reason: Joi.string().trim().max(500).optional().allow(''),
  }),
};

const verifyStartCode = {
  body: Joi.object().keys({
    code: Joi.string().length(4).pattern(/^\d{4}$/).required().messages({
      'any.required': 'Start code is required.',
      'string.length': 'Start code must be exactly 4 digits.',
      'string.pattern.base': 'Start code must be 4 digits.',
    }),
  }),
};
const payAdditionalPayment = {
  body: Joi.object().keys({
    amount: Joi.number().min(1).required().messages({
      'any.required': 'Amount is required.',
      'number.min': 'Amount must be greater than 0.',
    }),
    paymentMethod: Joi.string().valid('wallet', 'paystack', 'card').required().messages({
      'any.required': 'Payment method is required.',
      'any.only': 'Invalid payment method.',
    }),
    paystackReference: Joi.string().optional(),
  }),
};

module.exports = {
  createBooking,
  cancelBooking,
  rateBooking,
  completeJob,
  additionalPayment,
  declineJob,
  verifyStartCode,
  payAdditionalPayment
};
