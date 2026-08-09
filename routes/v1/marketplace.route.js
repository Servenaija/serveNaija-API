const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const mp = require('../../controllers/marketplace.controller');
const mpValidation = require('../../validations/marketplace.validation');
const { uploadMultiple } = require('../../middlewares/upload');
const router = express.Router();
router.use(allowedMethod);

// ─── STORES ───────────────────────────────
router.route('/stores')
  .get(mp.listStores)
  .all(unAllowedMethod);

router.route('/stores/create')
  .post(verifyToken, validate(mpValidation.createStore), mp.createStore)
  .all(unAllowedMethod);

router.route('/stores/me')
  .get(verifyToken, mp.getMyStore)
  .all(unAllowedMethod);

router.route('/stores/:storeId')
  .get(mp.getStore)
  .put(verifyToken, validate(mpValidation.updateStore), mp.updateStore)
  .all(unAllowedMethod);

router.route('/stores/:storeId/stats')
  .get(verifyToken, mp.getStoreStats)
  .all(unAllowedMethod);

router.route('/stores/:storeId/products')
  .get(mp.getStoreProducts)
  .all(unAllowedMethod);

router.route('/stores/:storeId/reviews')
  .get(mp.getTargetReviews)
  .all(unAllowedMethod);

// ─── PRODUCTS ─────────────────────────────
router.route('/products/create')
  .post(verifyToken, validate(mpValidation.createProduct), uploadMultiple, mp.createProduct)
  .all(unAllowedMethod);

router.route('/products/:productId')
  .get(mp.getProduct)
  .put(verifyToken, validate(mpValidation.updateProduct), uploadMultiple, mp.updateProduct)
  .delete(verifyToken, mp.deleteProduct)
  .all(unAllowedMethod);

router.route('/products/:productId/reviews')
  .get(mp.getTargetReviews)
  .all(unAllowedMethod);

// ─── DISCOVERY ───────────────────────────
router.route('/search')
  .get(mp.searchProducts)
  .all(unAllowedMethod);

router.route('/featured')
  .get(mp.getFeaturedProducts)
  .all(unAllowedMethod);

router.route('/trending')
  .get(mp.getTrendingProducts)
  .all(unAllowedMethod);

// ─── ORDERS ───────────────────────────────
router.route('/orders/create')
  .post(verifyToken, validate(mpValidation.createOrder), mp.createOrder)
  .all(unAllowedMethod);

router.route('/orders/me/buyer')
  .get(verifyToken, mp.getMyOrdersAsBuyer)
  .all(unAllowedMethod);

router.route('/orders/me/seller')
  .get(verifyToken, mp.getMyOrdersAsSeller)
  .all(unAllowedMethod);

router.route('/orders/:orderId')
  .get(verifyToken, mp.getOrder)
  .all(unAllowedMethod);

router.route('/orders/:orderId/status')
  .put(verifyToken, mp.updateOrderStatus)
  .all(unAllowedMethod);

// ─── REVIEWS ─────────────────────────────
router.route('/reviews/create')
  .post(verifyToken, validate(mpValidation.createReview), mp.createReview)
  .all(unAllowedMethod);

router.route('/reviews/:targetId')
  .get(mp.getTargetReviews)
  .all(unAllowedMethod);

module.exports = router;
