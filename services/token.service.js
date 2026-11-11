const jwt = require('jsonwebtoken');
const moment = require('moment');
const httpStatus = require('http-status');
const config = require('../config/auth');
const userService = require('./user.service');
const { dB } = require('../models');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const Token = require('../models/token')
/**
 * Generate token
 * @param {string} userId - User ID string (not an object)
 * @param {Moment} expires
 * @param {string} type
 * @param {string} [actor] - 'customer' or 'provider'
 * @param {string} [secret]
 * @returns {string}
 */
const generateToken = (userId, expires, type, actor, secret = config.jwt.secret) => {
  const payload = {
    sub: userId,
    iat: moment().unix(),
    exp: expires.unix(),
    type,
  };
  if (actor) {
    payload.actor = actor;
  }
  return jwt.sign(payload, secret);
};

/**
 * Generate token
 * @param {ObjectId} userId
 * @param {Moment} expires
 * @param {string} type
 * @param {string} [secret]
 * @returns {string}
 */
const generateTokenApp = (userId, expires, type) => {
  let token = Math.ceil((Math.random() * 899998) + 100001)
  return token;
};

/**
 * Save a token
 * @param {string} token
 * @param {ObjectId} userId
 * @param {Moment} expires
 * @param {string} type
 * @param {boolean} [blacklisted]
 * @returns {Promise<Token>}
 */
const saveToken = async (token, userId, expires, type, blacklisted = false) => {
  const tokenDoc = await dB.tokens.create({
    token,
    user: userId,
    expires: expires.toDate(),
    type,
    blacklisted,
  });
  return tokenDoc;
};

/**
 * Verify token and return token doc (or throw an error if it is not valid)
 * @param {string} token
 * @param {string} type
 * @returns {Promise<Token>}
 */
const verifyToken = async (token, type) => {
  const payload = jwt.verify(token, config.jwt.secret);
  const tokenDoc = await dB.tokens.findOne( { token, type, user: payload.sub, blacklisted: false } );
  if (!tokenDoc) {
    throw new Error('Token not found');
  }
  return tokenDoc;
};

/**
 * Verify token and return token doc (or throw an error if it is not valid)
 * @param {string} token
 * @param {string} type
 * @returns {Promise<Token>}
 */
const verifyTokenApp = async (token, type, user) => {
  const tokenDoc = await dB.tokens.findOne( { token, type, user, blacklisted: false } );
  if (!tokenDoc) {
    throw new Error('Token not found');
  }
  return tokenDoc;
};

/**
 * Generate auth tokens
 * @param {User} user
 * @returns {Promise<Object>}
 */
const generateAuthTokens = async (user) => {
  const userId = user.id;
  const accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, 'm');
  const accessToken = generateToken(userId, accessTokenExpires, tokenTypes.ACCESS, user.actor);

  const refreshTokenExpires = moment().add(config.jwt.refreshExpirationDays, 'days');
  const refreshToken = generateToken(userId, refreshTokenExpires, tokenTypes.REFRESH, user.actor);
  await saveToken(refreshToken, userId, refreshTokenExpires, tokenTypes.REFRESH);

  return {
    access: {
      token: accessToken,
      expires: accessTokenExpires.toDate(),
    },
    refresh: {
      token: refreshToken,
      expires: refreshTokenExpires.toDate(),
    },
  };
};

/**
 * Generate reset password token
 * @param {string} email
 * @returns {Promise<string>}
 */
const generateResetPasswordToken = async (email, actor) => {
  const user =
    actor === "customer"
      ? await userService.getUserByEmail(email)
      : actor === "provider"
      ? await userService.getProviderByEmail(email)
      : null;

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No users found with this email');
  }

  await Token.deleteMany({ user: user._id, type: tokenTypes.RESET_PASSWORD });

  const expires = moment().add(config.jwt.resetPasswordExpirationMinutes, 'minutes');
  console.log("Token expires at:", expires.toISOString());

  const userId = user._id.toString();
  const resetPasswordToken = generateToken(
    userId,
    expires,
    tokenTypes.RESET_PASSWORD,
    actor
  );
  console.log("Generated token:", resetPasswordToken);

  await saveToken(resetPasswordToken, userId, expires, tokenTypes.RESET_PASSWORD);
  console.log("Token saved to DB successfully");

  return resetPasswordToken;
};


/**
 * Generate verify email token
 * @param {User} user
 * @returns {Promise<string>}
 */
const generateVerifyEmailToken = async (user, actor = "customer") => {
  const expires = moment().add(config.jwt.verifyEmailExpirationMinutes, 'minutes');
  const userId = user._id.toString();
  const verifyEmailToken = generateToken(userId, expires, tokenTypes.VERIFY_EMAIL, actor);
  await saveToken(verifyEmailToken, userId, expires, tokenTypes.VERIFY_EMAIL);
  return verifyEmailToken;
};

/**
 * Generate verify email token
 * @param {User} user
 * @returns {Promise<string>}
 */
const generateVerifyEmailTokenApp = async (user) => {
  const expires = moment().add(config.jwt.verifyEmailExpirationMinutes, 'minutes');
  const verifyEmailToken = generateTokenApp(user._id);
  await saveToken(verifyEmailToken, user._id, expires, tokenTypes.VERIFY_EMAIL);
  return verifyEmailToken;
};


module.exports = {
  generateToken,
  saveToken,
  verifyToken,
  generateAuthTokens,
  generateResetPasswordToken,
  generateVerifyEmailToken,
  generateVerifyEmailTokenApp,
  verifyTokenApp,
};
