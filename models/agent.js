const mongoose = require('mongoose');

const referralEntrySchema = new mongoose.Schema(
  {
    referredUserId: { type: String },
    referredUserType: { type: String, enum: ['customer', 'provider'] },
    joinedAt: { type: Date, default: Date.now },
    commission: { type: Number }, // ₦500 customer / ₦1,000 provider
    isPaid: { type: Boolean, default: false },
  },
  { _id: false }
);

const agentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    userType: { type: String, enum: ['customer', 'provider'], required: true },
    referralCode: { type: String, required: true, unique: true },

    registrationFee: { type: Number, default: 5000 },
    paystackReference: { type: String },

    isActive: { type: Boolean, default: true },

    earnings: { type: Number, default: 0 },
    pendingEarnings: { type: Number, default: 0 },
    totalCustomerReferrals: { type: Number, default: 0 },
    totalProviderReferrals: { type: Number, default: 0 },

    referrals: [referralEntrySchema],
  },
  { timestamps: true }
);

agentSchema.index({ referralCode: 1 }, { unique: true });
agentSchema.index({ userId: 1 });

module.exports = mongoose.model('Agent', agentSchema);
