const Joi = require('joi');

const purchaseFeatured = {
  body: Joi.object().keys({
    plan: Joi.string().valid('fp', 'hp').required(),
    paystackReference: Joi.string().required(),
  }),
};

const purchaseAd = {
  body: Joi.object().keys({
    plan: Joi.string().valid('local', 'state', 'nation').required(),
    paystackReference: Joi.string().required(),
  }),
};

module.exports = {
  purchaseFeatured,
  purchaseAd,
};