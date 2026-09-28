// controllers/stream.controller.js

const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

const streamService =
  require('../services/stream.service');

const getStreamToken =
  catchAsync(async (req, res) => {
    if (!req.user?._id) {
      throw new ApiError(
        401,
        'Authenticated user not found.'
      );
    }

    const userId =
      req.user._id.toString();

    /**
     * The token expiry is returned alongside the token so
     * the app can refresh it BEFORE Stream rejects it with
     *
     *   WS failed with code: 40: AuthErrorTokenExpired
     *
     * The client should treat `expiresAt` as the deadline
     * for re-fetching a token and reconnecting its
     * StreamVideo instance.
     */
    const {
      token,
      expiresAt,
      expiresAtIso,
      expiresInSeconds,
    } =
      streamService.generateToken(
        userId
      );

    return res.json({
      token,
      userId,
      expiresAt,
      expiresAtIso,
      expiresInSeconds,
    });
  });

module.exports = {
  getStreamToken,
};