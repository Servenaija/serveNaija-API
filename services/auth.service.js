const httpStatus = require('http-status');
const moment = require('moment');
const tokenService = require('./token.service');
const userService = require('./user.service');
const { dB } = require('../models');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');

/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);

  if (!user || !(await userService.isPasswordMatch(password, user))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }

  // update last login
  user.lastLogin = moment();
  await user.save(); 

  return user; 
};


/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginProviderWithEmailAndPassword = async (email, password) => {
  const user = await userService.getProviderByEmail(email);
  if (!user || !(await userService.isPasswordMatch(password, user))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  user.lastLogin = moment();
  await user.save()
  return user;
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await dB.tokens.findOne( { token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false } );
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.delete();
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken, actor = "customer") => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(
      refreshToken,
      tokenTypes.REFRESH
    );

    let user;
    if (actor === "customer") {
      user = await userService.getUserById(refreshTokenDoc.user?.id);
    } else if (actor === "provider") {
      user = await userService.getProviderById(refreshTokenDoc.user?.id);
    } else {
      throw new Error('Unsupported actor');
    }

    if (!user) {
      throw new Error();
    }

    await refreshTokenDoc.delete();

    return tokenService.generateAuthTokens({ id: user._id, actor });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Please authenticate");
  }
};


/**
 * Reset password — finds user by email in customer or provider schema
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @param {string} [actor] - 'customer' or 'provider'
 * @param {string} [email] - user email to locate the account
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword, actor, email) => {
  const jwt = require('jsonwebtoken');
  const config = require('../config/auth');

  // Verify token is valid (not expired, correct secret)
  let payload;
  try {
    payload = jwt.verify(resetPasswordToken, config.jwt.secret);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired token');
  }

  // Find user by email in both customer and provider schemas
  let user;
  if (actor === 'provider') {
    user = await userService.getProviderByEmail(email);
  } else {
    user = await userService.getUserByEmail(email) || await userService.getProviderByEmail(email);
  }

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not found');
  }

  // Verify the token belongs to this user (check token doc exists)
  const resetPasswordTokenDoc = await dB.tokens.findOne({
    token: resetPasswordToken,
    type: tokenTypes.RESET_PASSWORD,
    blacklisted: false,
  });

  if (!resetPasswordTokenDoc) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Token not found');
  }

  // Update password using the found user's ID
  await userService.updateUserById(user._id, { password: newPassword }, actor || 'customer');
  await dB.tokens.deleteMany({ user: user._id, type: tokenTypes.RESET_PASSWORD });
};

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise}
 */
const verifyEmail = async (verifyEmailToken) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyToken(verifyEmailToken, tokenTypes.VERIFY_EMAIL);
    const user = await userService.getUserById(verifyEmailTokenDoc.user) || await userService.getProviderById(verifyEmailTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await dB.tokens.deleteMany( { user: user._id, type: tokenTypes.VERIFY_EMAIL } );
    await userService.updateUserById(user._id, { isEmailVerified: true });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Email verification failed');
  }
};

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise}
 */
const verifyEmailApp = async (verifyEmailToken, id) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyTokenApp(verifyEmailToken, tokenTypes.VERIFY_EMAIL, id)
    const user = await userService.getUserById(verifyEmailTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await dB.tokens.deleteMany( { user: id, type: tokenTypes.VERIFY_EMAIL } );
    await userService.updateUserById(id, { isEmailVerified: true });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Email verification failed');
  }
};

module.exports = {
  loginUserWithEmailAndPassword,
  loginProviderWithEmailAndPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
  verifyEmailApp,
};
