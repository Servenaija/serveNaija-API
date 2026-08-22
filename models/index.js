const mongoose = require("mongoose");
const { mongooseP } = require('../config/auth');
const logger = require('../config/logger');

// ── Core models
const token = require('./token');
const customer = require('./customer');
const provider = require('./provider');
const admin = require('./admin');

// ── Feature models
const booking = require('./booking');
const conversation = require('./conversation');
const message = require('./message');
const notification = require('./notification');
const wallet = require('./wallet');
const transaction = require('./transaction');
const service = require('./service');
const store = require('./store');
const product = require('./product');
const order = require('./order');
const review = require('./review');
const agent = require('./agent');
const call = require('./call');
const kyc = require('./kyc');
const category = require('./category');
const promotion = require('./promotion');
const SupportTicket = require('./SupportTicket');
const calls = require('./call');


mongoose.set('strictQuery', false);

const mongoOptions = {
  // Connection pool: support ~1M users through horizontal scaling
  maxPoolSize: 50,        // max concurrent MongoDB connections per Node process
  minPoolSize: 5,         // keep minimum connections warm
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  // Ensure indexes are created on startup
  autoIndex: true, 
};

const mongooseInstance = mongoose.connect(mongooseP.url, mongoOptions);
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
dB.tokens = token;
dB.customers = customer;
dB.providers = provider;
dB.admins = admin;

// Features
dB.bookings = booking;
dB.conversations = conversation;
dB.messages = message;
dB.notifications = notification;
dB.wallets = wallet;
dB.transactions = transaction;
dB.services = service;
dB.stores = store;
dB.products = product;
dB.orders = order;
dB.reviews = review;
dB.agents = agent;
dB.categories = category;
dB.promotions = promotion;
dB.calls = call;
dB.kyc = kyc;
dB.SupportTickets = SupportTicket;

module.exports = {
  dB,
  supportTickets: SupportTicket,
  calls

};
