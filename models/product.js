const mongoose = require('mongoose');

const PRODUCT_CATEGORIES = ['Electronics', 'Fashion', 'Home & Garden', 'Services', 'Food', 'Beauty', 'Other'];

const productSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    price: { type: Number, required: true },
    originalPrice: { type: Number, default: null },
    stock: { type: Number, default: 0 },
    category: { type: String, enum: PRODUCT_CATEGORIES },
    images: [{ type: String }],
    isActive: { type: Boolean, default: true },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ store: 1, category: 1, isActive: 1 });
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ rating: -1 });
productSchema.index({ soldCount: -1 });

module.exports = mongoose.model('Product', productSchema);
