require('./bin/instrument');
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const httpStatus = require('http-status');
const config = require('./config/auth');
const morgan = require('./config/morgan');
const { authLimiter } = require('./middlewares/rateLimiter');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');
const { jsonHeader } = require('./middlewares/headers');
const cron = require("node-cron");
const sendVendorNotificationsJob = require("./job/sendVendorNotifications");
const { sendMoneyForApprovedWithdrawals } = require('./job/processWithdrawals');

const _safeVendorNotificationsJob = typeof sendVendorNotificationsJob === 'function'
  ? sendVendorNotificationsJob
  : () => console.warn('[cron] sendVendorNotificationsJob is not available (stub).');

const _safeProcessWithdrawals = typeof sendMoneyForApprovedWithdrawals === 'function'
  ? sendMoneyForApprovedWithdrawals
  : async () => console.warn('[cron] sendMoneyForApprovedWithdrawals is not available (stub).');
const indexRouterV1 = require('./routes/v1/');
const Sentry = require("@sentry/node");

const app = express();

cron.schedule("0 8,9 * * *", () => {
  console.log("Running scheduled vendor notification job (Africa/Lagos time)...");
  _safeVendorNotificationsJob();
}, {
  timezone: "Africa/Lagos"
});

cron.schedule('*/5 * * * *', async () => {
  try {
    const chatController = require('./controllers/chat.controller');
    await chatController.cleanupResolvedConversations({}, {
      json: (result) => console.log('[cron] Conversation cleanup result:', result),
    });
  } catch (error) {
    console.error('[cron] Conversation cleanup error:', error.message);
  }
});

// Run every 1 hour (at minute 0 of every hour)
cron.schedule('0 * * * *', async () => {
  console.log('\n[cron] Withdrawal processing job running at:', new Date().toISOString());
  await _safeProcessWithdrawals();
});

app.set('etag', false);
app.set('trust proxy', false);


const corsOptions = {
  origin: [
    'http://localhost:5173', 
    'https://dashboard.servenaija.com',
    'https://servenaija.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200 // Some browsers choke on 204
};

// 1. FIRST: Enable CORS for all routes
app.use(cors(corsOptions));

// 2. SECOND: Handle preflight requests for all routes
app.options('/{*corsPreflight}', cors());

// 3. THEN: Add your other middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// use json for response
app.use(jsonHeader);

// different path for files
app.use('/filler', express.static(path.join(__dirname, 'public/uploads')));

// v1 routes
app.use('/v1.0', indexRouterV1);


// webhook route
app.post('/webhook/paystack', (req, res) => {
  const event = req.body;
  if (event.event === 'charge.success') {
    const tx = event.data;
    console.log(`Payment of ${tx.amount / 100} received from ${tx.customer.email}`);
  }
  res.sendStatus(200);
});

if (config.env !== 'production') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());

// sanitize request data
app.use(xss());
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});
Sentry.setupExpressErrorHandler(app);

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

// database sync
const { dB } = require('./models/index');

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'production' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
