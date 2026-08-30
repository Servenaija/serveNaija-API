const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    owner: { type: String, required: true },

    type: {
      type: String,
      enum: ['credit', 'debit', 'subscription', 'escrow_hold', 'escrow_release', 'refund', 'withdrawal'],
      required: true,
    },

    amount: { type: Number, required: true },
    balanceBefore: { type: Number },
    balanceAfter: { type: Number },
    currency: { type: String, default: 'NGN' },

    description: { type: String, trim: true },

    // Paystack reference or internal UUID
    reference: { type: String, unique: true, sparse: true },

    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'success' },

    // JSON metadata (Paystack payload, booking id, etc.)
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ owner: 1, type: 1, createdAt: -1 });
transactionSchema.index({ owner: 1, status: 1, createdAt: -1 });     // filter by status
transactionSchema.index({ owner: 1, createdAt: -1 });                // owner history
transactionSchema.index({ wallet: 1, createdAt: -1 });               // per-wallet ledger
transactionSchema.index({ booking: 1 }, { sparse: true });            // lookup by booking
transactionSchema.index({ order: 1 }, { sparse: true });              // lookup by order
transactionSchema.index({ status: 1, createdAt: -1 });                // global status views
transactionSchema.index({ createdAt: -1 });                           // admin dashboards
transactionSchema.index({ reference: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Transaction', transactionSchema);
