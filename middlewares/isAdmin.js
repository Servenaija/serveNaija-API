const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Middleware that ensures the authenticated user is an Admin.
 * Must be used AFTER verifyToken, which attaches req.user.
 */
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.constructor.modelName !== 'Admin') {
    return next(new ApiError(httpStatus.FORBIDDEN, 'Access restricted to administrators.'));
  }
  next();
};

/**
 * Middleware that ensures the authenticated user is a Superadmin.
 */
const isSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.constructor.modelName !== 'Admin' || req.user.role !== 'superadmin') {
    return next(new ApiError(httpStatus.FORBIDDEN, 'Access restricted to super-administrators.'));
  }
  next();
};

module.exports = { isAdmin, isSuperAdmin };
