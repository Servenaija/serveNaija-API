const express = require('express');
const httpStatus = require('http-status');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');

const router = express.Router();

router.use(allowedMethod);

router
  .route('/users')
  .get((req, res) => {
    return res.status(httpStatus.NOT_IMPLEMENTED).json({
      status: false,
      message: 'Admin user management is not implemented in this backend build.',
    });
  })
  .all(unAllowedMethod);

router
  .route('/users/:id')
  .get((req, res) => {
    return res.status(httpStatus.NOT_IMPLEMENTED).json({
      status: false,
      message: 'Admin user details are not implemented in this backend build.',
    });
  })
  .all(unAllowedMethod);

module.exports = router;
