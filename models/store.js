const mongoose = require('mongoose');

const STORE_CATEGORIES = ['Electronics', 'Fashion', 'Home & Garden', 'Services', 'Food', 'Beauty', 'Other'];

const storeSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    category: { type: String, enum: STORE_CATEGORIES },
    coverImage: { type: String, default: null },
    logo: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Store', storeSchema);
