const Joi = require('joi');
const { password } = require('./custom.validation');

const humanizeField = (field) => {
  const withSpaces = String(field).replace(/([A-Z])/g, ' $1').toLowerCase();
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
};

const requiredForType = (field, type) => ({
  'any.required': `${humanizeField(field)} is required for ${type} accounts.`,
  'string.empty': `${humanizeField(field)} is required for ${type} accounts.`,
});

const requiredForAllProviderAccounts = (field) => ({
  'any.required': `${humanizeField(field)} is required for provider and business accounts.`,
  'string.empty': `${humanizeField(field)} is required for provider and business accounts.`,
});

const requiredForCustomerAccounts = (field) => ({
  'any.required': `${humanizeField(field)} is required for customer accounts.`,
  'string.empty': `${humanizeField(field)} is required for customer accounts.`,
});

const registerUser = {
  body: Joi.object().keys({
    firstName: Joi.string().trim(),
    lastName: Joi.string().trim(),
    fullName: Joi.string().trim(),
    email: Joi.string().required().email().messages({
      ...requiredForCustomerAccounts('email'),
      'string.email': 'Email must be a valid email address.',
    }),
    phoneNumber: Joi.string().required().messages(requiredForCustomerAccounts('phoneNumber')),
    password: Joi.string().required().custom(password).messages(requiredForCustomerAccounts('password')),
    confirmPassword: Joi.string().required().valid(Joi.ref('password'))
      .messages({
        ...requiredForCustomerAccounts('confirmPassword'),
        'any.only': 'Confirm password must match password.',
      }),
    birthday: Joi.string().isoDate().optional(),
    referralCode: Joi.string().allow('', null).optional(),
    agentCode: Joi.string().allow('', null).optional(),
    expoPushToken: Joi.string().optional(),

  }),
};

const registerProvider = {
  body: Joi.object().keys({
    accountType: Joi.string().valid('provider', 'business').default('provider')
      .messages({
        'any.only': 'Account type must be either provider or business.',
      }),
    firstName: Joi.string().trim(),
    lastName: Joi.string().trim(),
    fullName: Joi.string().trim(),
    email: Joi.string().required().email().messages({
      ...requiredForAllProviderAccounts('email'),
      'string.email': 'Email must be a valid email address.',
    }),
    phoneNumber: Joi.string().required().messages(requiredForAllProviderAccounts('phoneNumber')),
    password: Joi.string().required().custom(password).messages(requiredForAllProviderAccounts('password')),
    referralCode: Joi.string().allow('', null).optional(),
    agentCode: Joi.string().allow('', null).optional(),
    category: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().trim().required().messages(requiredForType('category', 'business')),
      otherwise: Joi.string().trim().required().messages(requiredForType('category', 'provider')),
    }),
    experience: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().allow('', null).optional(),
      otherwise: Joi.string().trim().required().messages(requiredForType('experience', 'provider')),
    }),
    businessName: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().trim().required().messages(requiredForType('businessName', 'business')),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    description: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().allow('', null).optional(),
      otherwise: Joi.string().trim().required().messages(requiredForType('description', 'provider')),
    }),
    registrationNumber: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().trim().required().messages(requiredForType('registrationNumber', 'business')),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    ownerFullName: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().trim().required().messages(requiredForType('ownerFullName', 'business')),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    businessEmail: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().trim().email().required().messages({
        ...requiredForType('businessEmail', 'business'),
        'string.email': 'Business email must be a valid email address for business accounts.',
      }),
      otherwise: Joi.string().email().allow('', null).optional(),
    }),
    contactPhone: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().trim().required().messages(requiredForType('contactPhone', 'business')),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    businessDescription: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().trim().required().messages(requiredForType('businessDescription', 'business')),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    staffSize: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().trim().required().messages(requiredForType('staffSize', 'business')),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    state: Joi.string().trim().required().messages(requiredForAllProviderAccounts('state')),
    city: Joi.string().trim().required().messages(requiredForAllProviderAccounts('city')),
    area: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().allow('', null).optional(),
      otherwise: Joi.string().trim().required().messages(requiredForType('area', 'provider')),
    }),
    address: Joi.string().trim().required().messages(requiredForAllProviderAccounts('address')),
    landmark: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().allow('', null).optional(),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    radius: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().allow('', null).optional(),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    travelOutsideArea: Joi.when('accountType', {
      is: 'business',
      then: Joi.boolean().optional(),
      otherwise: Joi.boolean().optional(),
    }),
    photo: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().allow('', null).optional(),
      otherwise: Joi.string().allow('', null).optional(),
    }),
    bio: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().allow('', null).optional(),
      otherwise: Joi.string().trim().required().messages(requiredForType('bio', 'provider')),
    }),
    accountName: Joi.string().trim().required().messages(requiredForAllProviderAccounts('accountName')),
    bankName: Joi.string().trim().required().messages(requiredForAllProviderAccounts('bankName')),
    accountNumber: Joi.string().trim().pattern(/^\d{10}$/).required().messages({
      ...requiredForAllProviderAccounts('accountNumber'),
      'string.pattern.base': 'Account number must be exactly 10 digits.',
    }),
    selectedPlan: Joi.when('accountType', {
      is: 'business',
      then: Joi.string().valid('starter', 'growth', 'premium', 'enterprise').required().messages({
        ...requiredForType('selectedPlan', 'business'),
        'any.only': 'Selected plan must be one of starter, growth, premium, or enterprise for business accounts.',
      }),
      otherwise: Joi.string().valid('standard', 'verified').required().messages({
        ...requiredForType('selectedPlan', 'provider'),
        'any.only': 'Selected plan must be standard or verified for provider accounts.',
      }),
    }),
    expoPushToken: Joi.string().optional(),
    confirmPassword: Joi.string().required().valid(Joi.ref('password'))
      .messages({
        ...requiredForAllProviderAccounts('confirmPassword'),
        'any.only': 'Confirm password must match password.',
      }),
  }),
};

const updateUser = {
  body: Joi.object().keys({
    fullName: Joi.string(),
    firstName: Joi.string(),
    lastName: Joi.string(),
    email: Joi.string().email(),
    phoneNumber: Joi.string(),
    password: Joi.string().custom(password),
    expoPushToken: Joi.string().optional(),
    birthday: Joi.string().isoDate(),
  }),
};

const deleteUser = {
  body: Joi.object().keys({}),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required().email().messages({
      'any.required': 'Email is required to log in.',
      'string.empty': 'Email is required to log in.',
      'string.email': 'Email must be a valid email address.',
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required to log in.',
      'string.empty': 'Password is required to log in.',
    }),
    expoPushToken: Joi.string().optional(),
  }),
};

const logout = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required().messages({
      'any.required': 'Refresh token is required to log out.',
      'string.empty': 'Refresh token is required to log out.',
    }),
  }),
};

const refreshTokens = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required().messages({
      'any.required': 'Refresh token is required to refresh tokens.',
      'string.empty': 'Refresh token is required to refresh tokens.',
    }),
    actor: Joi.string().valid('customer', 'provider').optional().messages({
      'any.only': 'Actor must be either customer or provider.',
    }),
  }),
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required().messages({
      'any.required': 'Email is required for forgot password.',
      'string.empty': 'Email is required for forgot password.',
      'string.email': 'Email must be a valid email address.',
    }),
    actor: Joi.string().valid('customer', 'provider').required().messages({
      'any.required': 'Actor is required for forgot password.',
      'string.empty': 'Actor is required for forgot password.',
      'any.only': 'Actor must be either customer or provider.',
    }),
  }),
};

 const resetPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required().messages({
      'any.required': 'Email is required to reset password.',
      'string.empty': 'Email is required to reset password.',
      'string.email': 'Email must be a valid email address.',
    }),
    actor: Joi.string().valid('provider', 'customer').required().messages({
      'any.required': 'Actor is required to reset password.',
      'string.empty': 'Actor is required to reset password.',
      'any.only': 'Actor must be either provider or customer.',
    }),
    verificationCode: Joi.string().required().messages({
      'any.required': 'Verification code is required.',
      'string.empty': 'Verification code is required.',
    }),
    password: Joi.string().required().custom(password).messages({
      'any.required': 'Password is required.',
      'string.empty': 'Password is required.',
    }),
    confirmPassword: Joi.any()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.required': 'Confirm password is required.',
        'any.only': 'Confirm password must match password.',
      }),
  }),
};



  

module.exports = {
  registerUser,
  registerProvider,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
 
};
