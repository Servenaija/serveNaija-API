const Joi = require('joi');

const fundWallet = {
  body: Joi.object().keys({
    amount: Joi.number().min(100).required().messages({
      'any.required': 'Amount is required.',
      'number.min': 'Minimum top-up amount is ₦100.',
    }),
    paystackReference: Joi.string().trim().required().messages({
      'any.required': 'Paystack reference is required.',
    }),
  }),
};

const withdrawFunds = {
  body: Joi.object().keys({
    amount: Joi.number().min(500).required().messages({
      'any.required': 'Withdrawal amount is required.',
      'number.min': 'Minimum withdrawal amount is ₦500.',
    }),
    bankName: Joi.string().trim().required().messages({ 'any.required': 'Bank name is required.' }),
    accountNumber: Joi.string().pattern(/^\d{10}$/).required().messages({
      'any.required': 'Account number is required.',
      'string.pattern.base': 'Account number must be exactly 10 digits.',
    }),
    accountName: Joi.string().trim().required().messages({ 'any.required': 'Account name is required.' }),
    bankCode: Joi.string().trim().optional().allow(''),
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
  fundWallet,
  withdrawFunds,
  updateBankDetails,
};
