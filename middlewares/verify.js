const { verify } = require('jsonwebtoken');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const config = require('../config/auth');
const { dB } = require('../models');

const getModelByActor = (actor) => {
  if (actor === 'customer') {
    return dB.customers;
  }

  if (actor === 'provider') {
    return dB.providers;
  }

  if (actor === 'admin') {
    return dB.admins;
  }

  if (actor === 'teamMember') {
    return dB.teamMembers;
  }

  return null;
};

const decodeTokenAndAttachUser = async (token, req, next) => {
  verify(token, config.jwt.secret, async (err, decoded) => {
    if (err) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Error with authentication'));
    }

    const subject = decoded.sub;
    const actor = subject?.actor;
    const id = subject?.id;

    const Model = getModelByActor(actor);
    if (!Model || !id) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
    }

    const user = await Model.findById(id);
    if (!user) {
      return next(new ApiError(httpStatus.NOT_FOUND, 'Please authenticate'));
    }

    if (actor === 'teamMember') {
      // Team members act inside their business owner's account: every
      // controller keeps working against the owner provider (req.user), while
      // req.teamMember carries the member identity + permissions for guards.
      if (user.status !== 'active') {
        return next(new ApiError(httpStatus.FORBIDDEN, 'This team account has been deactivated.'));
      }
      const owner = await dB.providers.findById(user.provider);
      if (!owner) {
        return next(new ApiError(httpStatus.NOT_FOUND, 'Business account not found.'));
      }
      req.user = owner;
      req.teamMember = user;
      return next();
    }

    req.user = user;
    return next();
  });
};

const verifyToken = async (req, res, next) => {
  let token = req.headers.authorization;

  if (!token) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please use a token'));
  }

  token = token.split(' ')[1];
  return decodeTokenAndAttachUser(token, req, next);
};

const verifyQueryToken = async (req, res, next) => {
  const token = req.query.token;

  if (!token) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }

  return decodeTokenAndAttachUser(token, req, next);
};

module.exports = {
  verifyToken,
  verifyQueryToken,
};
