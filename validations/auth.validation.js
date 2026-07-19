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
    firstName: Joi.string().trim().optional(),
    lastName: Joi.string().trim().optional(),
    fullName: Joi.string().trim().optional(),
    email: Joi.string().required().email().messages({
      'any.required': 'Email is required.',
      'string.empty': 'Email is required.',
      'string.email': 'Email must be a valid email address.',
    }),
    phoneNumber: Joi.string().required().messages({
      'any.required': 'Phone number is required.',
      'string.empty': 'Phone number is required.',
    }),
    password: Joi.string().required().custom(password).messages({
      'any.required': 'Password is required.',
      'string.empty': 'Password is required.',
    }),
    referralCode: Joi.string().allow('', null).optional(),
   
    
   
    expoPushToken: Joi.string().optional(),
    confirmPassword: Joi.string().required().valid(Joi.ref('password'))
      .messages({
        'any.required': 'Confirm password is required.',
        'string.empty': 'Confirm password is required.',
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
