const rateLimit = require('express-rate-limit');

// Stricter limiter for auth (login, signup, etc.)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes is fine for login attempts
  message: { message: "Too many login attempts! Please try again later." },
  skipSuccessfulRequests: true, // Don't count successful logins
  standardHeaders: true,
  legacyHeaders: false,
});

// Less strict limiter for general API (normal usage)
const normalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500
  message: { message: "Rate limit exceeded. Please slow down your requests." },
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin panel specific limiter (much higher limits)
const adminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 2000, // 2000 requests per hour (about 33 per minute)
  message: { message: "Too many requests. Please wait a moment." },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  
});

// For development environment - no limits
const devLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10000, // Very high limit for development
  message: { message: "Rate limit exceeded" },
  skip: () => process.env.NODE_ENV !== 'production', // Skip in development
});

module.exports = {
  authLimiter,
  normalLimiter,
  adminLimiter,
  devLimiter
};