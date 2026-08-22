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

    const token =
      streamService.generateToken(
        userId
      );

    return res.json({
      token,
      userId,
    });
  });

module.exports = {
  getStreamToken,
};