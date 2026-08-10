const express = require('express');
const authRoute        = require('./auth.route');
const adminRoute       = require('./admin.route');
const userRoute        = require('./user.route');
const providerRoute    = require('./provider.route');
const bookingRoute     = require('./booking.route');
const notificationRoute = require('./notification.route');
const chatRoute        = require('./chat.route');
const callRoute        = require('./call.route');
const walletRoute      = require('./wallet.route');
const marketplaceRoute = require('./marketplace.route');
const agentRoute       = require('./agent.route');
const httpStatus       = require('http-status');
const cache            = require('../../utils/cache');
const providerOnboardingRoute = require ('./providerOnboarding.routes');
const kycRoute = require( './kyc.routes');
const promoteRoute = require('./promote.route');
const supportRoutes = require('./support.routes');
const subscriptionRoute = require('./subcription.route');
const businessOnboardingRoute = require('./businessOnboarding.routes');

const router = express.Router();

const defaultRoutes = [
  { path: '/auth',          route: authRoute },
  { path: '/promote',       route: promoteRoute },
  { path: '/business-onboarding', route: businessOnboardingRoute },
  { path: '/subscriptions', route: subscriptionRoute },
  { path: '/admins',        route: adminRoute },
  { path: '/kyc',           route: kycRoute},
  { path: '/user',          route: userRoute },
  { path: '/onboardingprovider',  route: providerOnboardingRoute},
  { path: '/provider',      route: providerRoute },
  { path: '/bookings',      route: bookingRoute },
  { path: '/notifications', route: notificationRoute },
  { path: '/chat',          route: chatRoute },
  { path: '/calls',         route: callRoute },
  { path: '/support',       route: supportRoutes },
  { path: '/wallet',        route: walletRoute },
  { path: '/marketplace',   route: marketplaceRoute },
  { path: '/agent',         route: agentRoute },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* Health check */
router.get('/', cache.route(), function(req, res) {
  res.status(httpStatus.OK).json({ deployed: true, version: '1.0' });
});

module.exports = router;

