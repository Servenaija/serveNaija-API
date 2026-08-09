const Joi = require('joi');

const createTicket = {
  body: Joi.object().keys({
    subject: Joi.string().trim().optional().allow(''),
    message: Joi.string().trim().required(),
  }),
};

const addMessage = {
  body: Joi.object().keys({
    message: Joi.string().trim().required(),
  }),
};

module.exports = {
  createTicket,
  addMessage,
};