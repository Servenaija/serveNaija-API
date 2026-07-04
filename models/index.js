const mongoose = require("mongoose");
const { mongooseP } = require('../config/auth');
const logger = require('../config/logger');

// ── Core models
const token    = require('./token');
const customer = require('./customer');
const provider = require('./provider');

// ── Feature models
const booking      = require('./booking');
const conversation = require('./conversation');
const message      = require('./message');
const notification = require('./notification');
const wallet       = require('./wallet');
const transaction  = require('./transaction');
const service      = require('./service');
const store        = require('./store');
const product      = require('./product');
const order        = require('./order');
const review       = require('./review');
const agent        = require('./agent');
const call         = require('./call');
const kyc          = require('./kyc');

mongoose.set('strictQuery', false);
const mongooseInstance = mongoose.connect(mongooseP.url);
const dB = {};

mongooseInstance
  .then(() => {
    logger.info('Database is good');
  })
  .catch(err => {
    logger.error('Database connection error', err);
    throw new Error(`Config validation error: ${err.message}`);
  });

dB.mongo = mongooseInstance;

// Core
dB.tokens    = token;
dB.customers = customer;
dB.providers = provider;

// Features
dB.bookings      = booking;
dB.conversations = conversation;
dB.messages      = message;
dB.notifications = notification;
dB.wallets       = wallet;
dB.transactions  = transaction;
dB.services      = service;
dB.stores        = store;
dB.products      = product;
dB.orders        = order;
dB.reviews       = review;
dB.agents        = agent;
dB.calls         = call;
dB.kyc           = kyc;

module.exports = { dB };
