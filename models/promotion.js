const mongoose = require('mongoose');

/**
 * Promotion / Featured placement record.
 *
 * Plans (matches the provider promote screen):
 *   - standard            ₦5,000 / year   (basic listing)
 *   - verified_pro        ₦20,000 / year  (verified badge + priority search)
 *   - featured_provider   ₦3,000 / month  (top of category, add-on)
 *   - ads_boost           ₦5,000 / month  (promotional ads, add-on)
 *
 * Business plans:
 *   - business_starter    ₦20,000 / year
 *   - business_growth     ₦50,000 / year
 *   - business_premium    ₦100,000 / year
 *   - business_enterprise ₦250,000 / year
 */

const PLAN_PRICES = {
  standard: { amount: 5000, billingCycle: 'yearly' },
  verified_pro: { amount: 20000, billingCycle: 'yearly' },
  featured_provider: { amount: 3000, billingCycle: 'monthly' },
  ads_boost: { amount: 5000, billingCycle: 'monthly' },
  business_starter: { amount: 20000, billingCycle: 'yearly' },
  business_growth: { amount: 50000, billingCycle: 'yearly' },
  business_premium: { amount: 100000, billingCycle: 'yearly' },
  business_enterprise: { amount: 250000, billingCycle: 'yearly' },
};

const promotionSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: Object.keys(PLAN_PRICES),
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    // Paystack reference that funded this promotion
    paystackReference: {
      type: String,
      trim: true,
      default: null,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

promotionSchema.index({ provider: 1, plan: 1, status: 1 });

// Auto-expire promotions that have passed their endDate
promotionSchema.statics.getActivePromotion = async function (providerId, plan) {
  return this.findOne({
    provider: providerId,
    plan,
    status: 'active',
    endDate: { $gt: new Date() },
  });
};

module.exports = mongoose.model('Promotion', promotionSchema);
module.exports.PLAN_PRICES = PLAN_PRICES;
