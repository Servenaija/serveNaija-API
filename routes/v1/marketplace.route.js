const express = require('express');
const { verifyToken } = require('../../middlewares/verify');
const { allowedMethod } = require('../../middlewares/headers');
const { unAllowedMethod } = require('../../middlewares/method');
const validate = require('../../middlewares/validate');
const mp = require('../../controllers/marketplace.controller');
const mpValidation = require('../../validations/marketplace.validation');
const { uploadMultiple } = require('../../middlewares/upload');
const cache = require('../../utils/cache');
const { teamPermission } = require('../../middlewares/team');
const router = express.Router();
router.use(allowedMethod);

// Bust marketplace + public caches after any successful write (store/product/order/review changes)
router.use(cache.invalidateOnWrite(['/v1.0/marketplace', '/v1.0/public']));
// NOTE: teamPermission must run AFTER verifyToken on each route (it reads
// req.teamMember), so seller-owned routes attach it per-route. Public/customer
// routes are unaffected.

// ─── STORES ───────────────────────────────
router.route('/stores')
  .get(cache.route({ expire: 60 }), mp.listStores)
  .all(unAllowedMethod);

router.route('/stores/create')
  .post(verifyToken, teamPermission('marketplace'), validate(mpValidation.createStore), mp.createStore)
  .all(unAllowedMethod);

router.route('/stores/me')
  .get(verifyToken, teamPermission('marketplace'), mp.getMyStore)
  .all(unAllowedMethod);

router.route('/stores/:storeId')
  .get(cache.route({ expire: 60 }), mp.getStore)
  .put(verifyToken, teamPermission('marketplace'), validate(mpValidation.updateStore), mp.updateStore)
  .all(unAllowedMethod);

router.route('/stores/:storeId/stats')
  .get(verifyToken, teamPermission('marketplace'), mp.getStoreStats)
  .all(unAllowedMethod);

router.route('/stores/:storeId/products')
  .get(cache.route({ expire: 60 }), mp.getStoreProducts)
  .all(unAllowedMethod);

router.route('/stores/:storeId/reviews')
  .get(cache.route({ expire: 60 }), mp.getTargetReviews)
  .all(unAllowedMethod);

// ─── PRODUCTS ─────────────────────────────
router.route('/products/create')
  .post(verifyToken, teamPermission('marketplace'), validate(mpValidation.createProduct), uploadMultiple, mp.createProduct)
  .all(unAllowedMethod);

router.route('/products/:productId')
  .get(cache.route({ expire: 60 }), mp.getProduct)
  .put(verifyToken, teamPermission('marketplace'), validate(mpValidation.updateProduct), uploadMultiple, mp.updateProduct)
  .delete(verifyToken, teamPermission('marketplace'), mp.deleteProduct)
  .all(unAllowedMethod);

router.route('/products/:productId/reviews')
  .get(cache.route({ expire: 60 }), mp.getTargetReviews)
  .all(unAllowedMethod);

// ─── DISCOVERY ───────────────────────────
router.route('/search')
  .get(cache.route({ expire: 30 }), mp.searchProducts)
  .all(unAllowedMethod);

router.route('/featured')
  .get(cache.route({ expire: 120 }), mp.getFeaturedProducts)
  .all(unAllowedMethod);

router.route('/trending')
  .get(cache.route({ expire: 120 }), mp.getTrendingProducts)
  .all(unAllowedMethod);

// ─── ORDERS ───────────────────────────────
router.route('/orders/create')
  .post(verifyToken, validate(mpValidation.createOrder), mp.createOrder)
  .all(unAllowedMethod);

router.route('/orders/me/buyer')
  .get(verifyToken, mp.getMyOrdersAsBuyer)
  .all(unAllowedMethod);

router.route('/orders/me/seller')
  .get(verifyToken, teamPermission('marketplace'), mp.getMyOrdersAsSeller)
  .all(unAllowedMethod);

router.route('/orders/:orderId')
  .get(verifyToken, teamPermission('marketplace'), mp.getOrder)
  .all(unAllowedMethod);

router.route('/orders/:orderId/status')
  .put(verifyToken, teamPermission('marketplace'), mp.updateOrderStatus)
  .all(unAllowedMethod);

// Buyer confirms delivery → releases escrow (subtotal + delivery fee) to seller wallet
router.route('/orders/:orderId/confirm-delivery')
  .post(verifyToken, mp.confirmDelivery)
  .all(unAllowedMethod);

// ─── DELIVERY FEE NEGOTIATION ─────────────
// Delivery fee is not fixed: buyer proposes, seller accepts/counters/declines.
router.route('/orders/:orderId/delivery-fee')
  .get(verifyToken, teamPermission('marketplace'), mp.getDeliveryFeeNegotiation)
  .all(unAllowedMethod);

router.route('/orders/:orderId/delivery-fee/propose')
  .post(verifyToken, mp.proposeDeliveryFee)
  .all(unAllowedMethod);

router.route('/orders/:orderId/delivery-fee/accept')
  .put(verifyToken, teamPermission('marketplace'), mp.acceptDeliveryFee)
  .all(unAllowedMethod);

router.route('/orders/:orderId/delivery-fee/counter')
  .put(verifyToken, teamPermission('marketplace'), mp.counterDeliveryFee)
  .all(unAllowedMethod);

router.route('/orders/:orderId/delivery-fee/decline')
  .put(verifyToken, teamPermission('marketplace'), mp.declineDeliveryFee)
  .all(unAllowedMethod);

// ─── REVIEWS ─────────────────────────────
router.route('/reviews/create')
  .post(verifyToken, validate(mpValidation.createReview), mp.createReview)
  .all(unAllowedMethod);

  router.route('/:id/cancel')
  .put(verifyToken, validate(mpValidation.cancelOrder), mp.cancelOrder)
  .all(unAllowedMethod);

router.route('/reviews/:targetId')
  .get(cache.route({ expire: 60 }), mp.getTargetReviews)
  .all(unAllowedMethod);

module.exports = router;
