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
    total: { type: Number, required: true },

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

    paymentMethod: { type: String, enum: ['card', 'bank_transfer', 'cod', 'wallet'] },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paystackReference: { type: String, trim: true },
    estimatedDelivery: { type: Date },
  },
  { timestamps: true }
);

orderSchema.index({ buyer: 1, status: 1, createdAt: -1 });
orderSchema.index({ store: 1, status: 1, createdAt: -1 });
orderSchema.index({ paystackReference: 1 }, { sparse: true });

module.exports = mongoose.model('Order', orderSchema);
