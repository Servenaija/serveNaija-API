const httpStatus = require('http-status');
const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const { authService, userService, tokenService, emailService } = require('../services');
const { dB } = require('../models');
const Sentry = require('@sentry/node');

const TOKEN_TTL_MINUTES = 20;

function generate6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getModelByRole(actor) {
  if (actor === 'customer') {
    return dB.customers;
  }

  if (actor === 'provider') {
    return dB.providers;
  }

  throw new Error('Invalid actor type');
}

function sanitizeUser(userDoc) {
  const safe = userDoc.toObject();
  delete safe.password;
  delete safe.__v;
  return safe;
}

const registerUser = catchAsync(async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    const id = user._id.toString();
    const tokens = await tokenService.generateAuthTokens({ id, actor: 'customer' });

    res.status(httpStatus.CREATED).send({ user: sanitizeUser(user), tokens });
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

const registerProvider = catchAsync(async (req, res) => {
  try {
    const provider = await userService.createProvider(req.body);
    const id = provider._id.toString();
    const tokens = await tokenService.generateAuthTokens({ id, actor: 'provider' });

    res.status(httpStatus.CREATED).send({ user: sanitizeUser(provider), tokens });
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

const loginUser = catchAsync(async (req, res) => {
  const { email, password, expoPushToken } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);

  if (user.isBanned) {
    return res.status(httpStatus.FORBIDDEN).send({ message: 'Your account has been suspended. Please contact support.' });
  }

  if (expoPushToken) {
    user.expoPushToken = String(expoPushToken);
    await user.save();
  }

  const id = user._id.toString();
  const tokens = await tokenService.generateAuthTokens({ id, actor: 'customer' });

  return res.send({ user: sanitizeUser(user), tokens });
});

const loginProvider = catchAsync(async (req, res) => {
  const { email, password, expoPushToken } = req.body;
  const user = await authService.loginProviderWithEmailAndPassword(email, password);

  if (user.isBanned) {
    return res.status(httpStatus.FORBIDDEN).send({ message: 'Your account has been suspended. Please contact support.' });
  }

  if (expoPushToken) {
    user.expoPushToken = String(expoPushToken);
    await user.save();
  }

  const id = user._id.toString();
  const tokens = await tokenService.generateAuthTokens({ id, actor: 'provider' });

  return res.send({ user: sanitizeUser(user), tokens });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken, req.body.actor || 'customer');
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email, actor } = req.body;

  if (!email || !actor) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: false,
      message: 'Email and actor are required.',
    });
  }

  let Model;
  try {
    Model = getModelByRole(actor);
  } catch (err) {
    return res.status(httpStatus.BAD_REQUEST).json({ status: false, message: 'Invalid actor type provided.' });
  }

  const user = await Model.findOne({ email: String(email).toLowerCase().trim() }).select(
    'fullName firstName email verificationToken verificationTokenExpiresAt'
  );

  if (!user) {
    return res.status(httpStatus.NOT_FOUND).json({ status: false, message: `No ${actor} account found with that email address.` });
  }

  const plainToken = generate6DigitCode();
  const hashedToken = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await Model.findByIdAndUpdate(user._id, {
    verificationToken: hashedToken,
    verificationTokenExpiresAt: expiresAt,
  });

  try {
    if (emailService && typeof emailService.sendVerificationCodeEmail === 'function') {
      await emailService.sendVerificationCodeEmail(user.email, {
        name: user.fullName || user.firstName || actor,
        verificationCode: plainToken,
        expiryMinutes: TOKEN_TTL_MINUTES,
        supportEmail: 'support@servenaija.com',
        year: new Date().getFullYear(),
      });
    }
  } catch (error) {
    Sentry.captureException(error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: false,
      message: 'We could not send the verification email. Please try again shortly.',
    });
  }

  return res.status(httpStatus.OK).json({
    status: true,
    message: 'A verification code has been sent to your email address.',
    expiresAt: expiresAt.toISOString(),
  });
});

module.exports = {
  registerUser,
  registerProvider,
  loginUser,
  loginProvider,
  logout,
  refreshTokens,
  forgotPassword,
};
