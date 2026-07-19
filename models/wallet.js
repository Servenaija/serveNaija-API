const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, unique: true },
    ownerType: { type: String, enum: ['customer', 'provider'], required: true },

    balance: { type: Number, default: 0 },
    escrowBalance: { type: Number, default: 0 },
    currency: { type: String, default: 'NGN' },

    isActive: { type: Boolean, default: true },

    bankDetails: {
      bankName: { type: String, trim: true, default: '' },
      accountName: { type: String, trim: true, default: '' },
      accountNumber: { type: String, trim: true, default: '' },
      isVerified: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

walletSchema.index({ owner: 1 });

module.exports = mongoose.model('Wallet', walletSchema);
