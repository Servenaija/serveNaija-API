const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String },
    price: { type: Number },
    quantity: { type: Number, default: 1 },
    image: { type: String },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    items: [orderItemSchema],

    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 800 },
    serviceFee: { type: Number, default: 0 },
    total: { type: Number, required: true },

    // ── Delivery fee negotiation ──
    // The delivery fee is NOT fixed: the customer proposes an opening offer at
    // checkout, and the seller can accept, counter-offer, or decline.
    deliveryFeeNegotiation: {
      type: {
        amount: { type: Number, default: 0 },          // last proposal amount
        counterAmount: { type: Number, default: null },// counter-offer amount (if any)
        status: {
          type: String,
          enum: ['pending', 'countered', 'accepted', 'declined'],
          default: 'pending',
        },
        proposedBy: { type: String, enum: ['customer', 'seller'] },
        updatedAt: { type: Date, default: Date.now },
      },
      default: null,
    },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
    },

    deliveryAddress: {
      street: { type: String, trim: true },
      landmark: { type: String, trim: true },
      phone: { type: String, trim: true },
      state: { type: String, trim: true },
      city: { type: String, trim: true },
    },

    paymentMethod: { type: String, enum: ['card', 'paystack', 'online', 'bank_transfer', 'transfer', 'cod', 'cash', 'wallet'] },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'held', 'failed', 'refunded', 'released'],
      default: 'pending',
    },
    paystackReference: { type: String, trim: true },
    estimatedDelivery: { type: Date },

    // ── Escrow / delivery-confirmation flow ──
    // When seller marks 'delivered', buyer has 24hrs to confirm or open a dispute.
    // If no response in 24hrs, funds auto-release to the provider wallet.
    deliveredAt: { type: Date, default: null },
    confirmedByBuyer: { type: Boolean, default: false },
    escrowReleasedAt: { type: Date, default: null },
    autoReleaseAt: { type: Date, default: null },
    disputed: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

orderSchema.index({ buyer: 1, status: 1, createdAt: -1 });
orderSchema.index({ store: 1, status: 1, createdAt: -1 });
orderSchema.index({ paystackReference: 1 }, { sparse: true });
orderSchema.index({ status: 1, createdAt: -1 });               // global status filtering
orderSchema.index({ paymentStatus: 1, createdAt: -1 });        // payment reconciliation
orderSchema.index({ store: 1, createdAt: -1 });                // seller listings
orderSchema.index({ createdAt: -1 });                          // admin dashboards

module.exports = mongoose.model('Order', orderSchema);
