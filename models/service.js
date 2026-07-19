const mongoose = require('mongoose');

// A provider's individual service offering (name + price)
const serviceSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    description: { type: String, trim: true, default: '' },
    duration: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ provider: 1, isActive: 1 });

module.exports = mongoose.model('Service', serviceSchema);
