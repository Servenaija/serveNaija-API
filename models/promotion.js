// models/promotion.js
const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    provider: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Provider', 
      required: true 
    },
    plan: { 
      type: String, 
      enum: ['fp', 'hp', 'local', 'state', 'nation'],
      required: true 
    },
    type: { 
      type: String, 
      enum: ['featured', 'ad'],
      required: true 
    },
    amount: { 
      type: Number, 
      required: true 
    },
    billingCycle: { 
      type: String, 
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    },
    paystackReference: { 
      type: String, 
      trim: true 
    },
    startDate: { 
      type: Date, 
      required: true 
    },
    endDate: { 
      type: Date, 
      required: true 
    },
    status: { 
      type: String, 
      enum: ['active', 'expired', 'cancelled'], 
      default: 'active' 
    },
  },
  { timestamps: true }
);

// ============================================
// INDEXES
// ============================================
promotionSchema.index({ provider: 1, status: 1, endDate: -1 });  // provider's promo history
promotionSchema.index({ status: 1, endDate: 1 });                // cron expiry scan
promotionSchema.index({ plan: 1, status: 1, type: 1 });          // plan/type filtering
promotionSchema.index({ startDate: 1, endDate: 1 });             // active-window queries
promotionSchema.index({ paystackReference: 1 }, { sparse: true }); // payment reconciliation

module.exports = mongoose.model('Promotion', promotionSchema);