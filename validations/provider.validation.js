const Joi = require('joi');

const updateAvailability = {
  body: Joi.object().keys({
    isAvailable: Joi.boolean().required().messages({ 'any.required': 'Availability status is required.' }),
  }),
};

const updateLocation = {
  body: Joi.object().keys({
    businessName: Joi.string().trim().optional().allow(''),
    state: Joi.string().trim().optional().allow(''),
    city: Joi.string().trim().optional().allow(''),
    area: Joi.string().trim().optional().allow(''),
    address: Joi.string().trim().optional().allow(''),
    radius: Joi.string().trim().optional(),
    travelOutsideArea: Joi.boolean().optional(),
    latitude: Joi.number().optional().allow(null),
    longitude: Joi.number().optional().allow(null),
  }),
};

const updateProfile = {
  body: Joi.object().keys({
    firstName: Joi.string().trim().optional(),
    lastName: Joi.string().trim().optional(),
    fullName: Joi.string().trim().optional(),
    phoneNumber: Joi.string().trim().optional(),
    bio: Joi.string().trim().max(250).optional().allow(''),
    photo: Joi.string().trim().optional().allow(null),
    expoPushToken: Joi.string().trim().optional().allow(null),
  }),
};

const addService = {
  body: Joi.object().keys({
    name: Joi.string().trim().required().messages({ 'any.required': 'Service name is required.' }),
    price: Joi.number().min(0).required().messages({ 'any.required': 'Service price is required.' }),
    description: Joi.string().trim().max(250).optional().allow(''),
    duration: Joi.string().trim().optional().allow(''),
  }),
};

const updateService = {
  body: Joi.object().keys({
    name: Joi.string().trim().optional(),
    price: Joi.number().min(0).optional(),
    description: Joi.string().trim().max(250).optional().allow(''),
    duration: Joi.string().trim().optional().allow(''),
    isActive: Joi.boolean().optional(),
  }),
};

const updateNotificationSettings = {
  body: Joi.object().keys({
    push: Joi.boolean().optional(),
    email: Joi.boolean().optional(),
    sms: Joi.boolean().optional(),
  }),
};

const updateBankDetails = {
  body: Joi.object().keys({
    bankName: Joi.string().trim().required(),
    accountName: Joi.string().trim().required(),
    accountNumber: Joi.string().pattern(/^\d{10}$/).required().messages({
      'string.pattern.base': 'Account number must be exactly 10 digits.',
    }),
  }),
};

module.exports = {
  updateAvailability,
  updateLocation,
  updateProfile,
  addService,
  updateService,
  updateNotificationSettings,
  updateBankDetails,
};
