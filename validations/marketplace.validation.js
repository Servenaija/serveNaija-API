const Joi = require('joi');

const STORE_CATEGORIES = ['Electronics', 'Fashion', 'Home & Garden', 'Services', 'Food', 'Beauty', 'Other'];
const PRODUCT_CATEGORIES = ['Electronics', 'Fashion', 'Home & Garden', 'Services', 'Food', 'Beauty', 'Other'];

const createStore = {
  body: Joi.object().keys({
    name: Joi.string().trim().required().messages({ 'any.required': 'Store name is required.' }),
    description: Joi.string().trim().optional().allow(''),
    category: Joi.string().valid(...STORE_CATEGORIES).optional(),
  }),
};

const updateStore = {
  body: Joi.object().keys({
    name: Joi.string().trim().optional(),
    description: Joi.string().trim().optional().allow(''),
    category: Joi.string().valid(...STORE_CATEGORIES).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const createProduct = {
  body: Joi.object().keys({
    name: Joi.string().trim().required().messages({ 'any.required': 'Product name is required.' }),
    description: Joi.string().trim().optional().allow(''),
    price: Joi.number().min(0).required().messages({ 'any.required': 'Product price is required.' }),
    originalPrice: Joi.number().min(0).optional().allow(null),
    stock: Joi.number().integer().min(0).required().messages({ 'any.required': 'Stock quantity is required.' }),
    category: Joi.string().valid(...PRODUCT_CATEGORIES).optional(),
    images: Joi.array().items(Joi.string()).max(5).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const updateProduct = {
  body: Joi.object().keys({
    name: Joi.string().trim().optional(),
    description: Joi.string().trim().optional().allow(''),
    price: Joi.number().min(0).optional(),
    originalPrice: Joi.number().min(0).optional().allow(null),
    stock: Joi.number().integer().min(0).optional(),
    category: Joi.string().valid(...PRODUCT_CATEGORIES).optional(),
    images: Joi.array().items(Joi.string()).max(5).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const createOrder = {
  body: Joi.object().keys({
    storeId: Joi.string().required().messages({ 'any.required': 'Store ID is required.' }),
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
      })
    ).min(1).required(),
    deliveryAddress: Joi.object({
      street: Joi.string().trim().required(),
      landmark: Joi.string().trim().optional().allow(''),
      phone: Joi.string().trim().required(),
      state: Joi.string().trim().optional().allow(''),
      city: Joi.string().trim().optional().allow(''),
    }).required(),
    paymentMethod: Joi.string().valid('card', 'bank_transfer', 'cod', 'wallet').required(),
    paystackReference: Joi.string().trim().when('paymentMethod', {
      is: Joi.valid('card', 'bank_transfer'),
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null),
    }),
  }),
};

const createReview = {
  body: Joi.object().keys({
    targetId: Joi.string().required().messages({ 'any.required': 'Target ID is required.' }),
    targetType: Joi.string().valid('provider', 'product', 'store').required(),
    bookingId: Joi.string().optional().allow(null),
    orderId: Joi.string().optional().allow(null),
    overall: Joi.number().min(1).max(5).required(),
    quality: Joi.number().min(1).max(5).optional(),
    punctuality: Joi.number().min(1).max(5).optional(),
    professionalism: Joi.number().min(1).max(5).optional(),
    communication: Joi.number().min(1).max(5).optional(),
    text: Joi.string().trim().max(1000).optional().allow(''),
  }),
};

module.exports = {
  createStore,
  updateStore,
  createProduct,
  updateProduct,
  createOrder,
  createReview,
};
