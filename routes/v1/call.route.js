const express =
  require('express');

const {
  verifyToken,
} = require('../../middlewares/verify');

const {
  allowedMethod,
} = require('../../middlewares/headers');

const {
  unAllowedMethod,
} = require('../../middlewares/method');

const callController =
  require('../../controllers/call.controller');

const router =
  express.Router();

router.use(
  allowedMethod
);

router
  .route('/initiate')
  .post(
    verifyToken,
    callController.initiateCall
  )
  .all(
    unAllowedMethod
  );

router
  .route('/:id/accept')
  .post(
    verifyToken,
    callController.acceptCall
  )
  .all(
    unAllowedMethod
  );

router
  .route('/:id/reject')
  .post(
    verifyToken,
    callController.rejectCall
  )
  .all(
    unAllowedMethod
  );

router
  .route('/:id/end')
  .put(
    verifyToken,
    callController.endCall
  )
  .all(
    unAllowedMethod
  );

module.exports =
  router;