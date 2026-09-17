const mongoose = require('mongoose');

const disputeMessageSchema = new mongoose.Schema(
  {
    senderId: { type: String, required: true },
    senderType: { type: String, enum: ['customer', 'provider', 'admin'], required: true },
    senderName: { type: String, trim: true },
    text: { type: String, trim: true, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// A dispute freezes escrow on a booking or marketplace order so a ServeNaija
// admin can hear from both sides and decide who gets credited (buyer refund
// and/or seller payout), splitting ONLY subtotal + delivery fee.
const disputeSchema = new mongoose.Schema(
  {
    // What is being disputed: 'booking' | 'order'
    targetType: { type: String, enum: ['booking', 'order'], required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', default: null },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },

    // Amounts frozen in escrow at dispute time (subtotal + delivery fee only —
    // platform/service fees are never paid out on dispute).
    escrowSnapshot: {
      subtotal: { type: Number, default: 0 },
      deliveryFee: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    openedBy: { type: String, enum: ['customer', 'provider'], default: 'customer' },
    reason: { type: String, trim: true },
    description: { type: String, trim: true },

    status: {
      type: String,
      enum: ['open', 'awaiting-response', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },

    // Both sides get heard: threaded messages from customer, provider, admin.
    messages: [disputeMessageSchema],

    // Admin resolution: award split of (subtotal + deliveryFee) between the
    // customer (refund to wallet) and the provider (credit to wallet).
    resolution: {
      customerAmount: { type: Number, default: null },
      providerAmount: { type: Number, default: null },
      note: { type: String, trim: true },
      resolvedBy: { type: String, default: null },
      resolvedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

disputeSchema.index({ customer: 1, status: 1, createdAt: -1 });
disputeSchema.index({ provider: 1, status: 1, createdAt: -1 });
disputeSchema.index({ booking: 1 });
disputeSchema.index({ order: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
