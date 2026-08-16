const mongoose = require('mongoose');

const referralEntrySchema = new mongoose.Schema(
  {
    referredUserId: { type: String },
    referredUserType: { type: String, enum: ['customer', 'provider'] },
    joinedAt: { type: Date, default: Date.now },
    commission: { type: Number },
    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date },
  },
  { _id: false }
);

const agentSchema = new mongoose.Schema(
  {
    userId: { 
      type: String, 
      required: true, 
      unique: true,
      index: true,
    },
    userType: { 
      type: String, 
      enum: ['customer', 'provider'], 
      required: true,
      index: true,
    },
    agentCode: { 
      type: String, 
      required: true, 
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    registrationFee: { 
      type: Number, 
      default: 5000,
      min: 0,
    },
    paystackReference: { 
      type: String, 
      trim: true,
      sparse: true,
    },

    isActive: { 
      type: Boolean, 
      default: true,
      index: true,
    },

    // Wallet fields
    wallet: {
      balance: { type: Number, default: 0, min: 0 },
      totalEarned: { type: Number, default: 0, min: 0 },
      pendingPayout: { type: Number, default: 0, min: 0 },
      totalPaidOut: { type: Number, default: 0, min: 0 },
    },
    

    earnings: { 
      type: Number, 
      default: 0,
      min: 0,
    },
    pendingEarnings: { 
      type: Number, 
      default: 0,
      min: 0,
    },
    totalCustomerReferrals: { 
      type: Number, 
      default: 0,
      min: 0,
    },
    totalProviderReferrals: { 
      type: Number, 
      default: 0,
      min: 0,
    },

    referrals: [referralEntrySchema],
  },
  { timestamps: true }
);

// Compound index
agentSchema.index({ userId: 1, userType: 1 }, { unique: true });
agentSchema.index({ agentCode: 1 }, { unique: true });
agentSchema.index({ isActive: 1, agentCode: 1 });

// Pre-validate middleware to generate agent code
agentSchema.pre('validate', async function(next) {
  if (this.isNew || !this.agentCode) {
    this.agentCode = await generateUniqueAgentCode();
  }
  next();
});

async function generateUniqueAgentCode() {
  const Agent = mongoose.model('Agent');
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 100;

  while (!isUnique && attempts < maxAttempts) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * 26));
    }
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * 10) + 26);
    }
    
    code = result;
    
    const existing = await Agent.findOne({ agentCode: code });
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    code = `AG${timestamp.slice(-4)}${random}`;
  }

  return code;
}

// Static methods
agentSchema.statics.getByCode = async function(agentCode) {
  return this.findOne({ agentCode: agentCode.toUpperCase(), isActive: true });
};

agentSchema.statics.getByUserId = async function(userId) {
  return this.findOne({ userId, isActive: true });
};

agentSchema.statics.isAgent = async function(userId) {
  const agent = await this.findOne({ userId, isActive: true });
  return !!agent;
};

agentSchema.statics.getUserType = async function(userId) {
  const agent = await this.findOne({ userId, isActive: true });
  return agent ? agent.userType : null;
};

// Instance methods
agentSchema.methods.addReferral = async function(referredUserId, referredUserType, commission) {
  const existing = this.referrals.find(
    r => r.referredUserId === referredUserId && r.referredUserType === referredUserType
  );
  
  if (existing) {
    throw new Error('User already referred');
  }

  this.referrals.push({
    referredUserId,
    referredUserType,
    commission,
    joinedAt: new Date(),
    isPaid: false,
  });

  if (referredUserType === 'customer') {
    this.totalCustomerReferrals += 1;
  } else {
    this.totalProviderReferrals += 1;
  }

  // Add to wallet pending payout
  this.wallet.pendingPayout += commission;
  this.wallet.totalEarned += commission;
  
  // Legacy fields
  this.pendingEarnings += commission;

  await this.save();
  return this;
};

agentSchema.methods.markReferralPaid = async function(referredUserId, referredUserType) {
  const referral = this.referrals.find(
    r => r.referredUserId === referredUserId && r.referredUserType === referredUserType
  );
  
  if (!referral) {
    throw new Error('Referral not found');
  }

  if (referral.isPaid) {
    throw new Error('Referral already paid');
  }

  referral.isPaid = true;
  referral.paidAt = new Date();

  // Move from pending payout to balance
  this.wallet.pendingPayout -= referral.commission;
  this.wallet.balance += referral.commission;
  this.wallet.totalPaidOut += referral.commission;
  
  // Legacy fields
  this.pendingEarnings -= referral.commission;
  this.earnings += referral.commission;

  await this.save();
  return this;
};

agentSchema.methods.getStats = function() {
  return {
    totalReferrals: this.totalCustomerReferrals + this.totalProviderReferrals,
    customerReferrals: this.totalCustomerReferrals,
    providerReferrals: this.totalProviderReferrals,
    wallet: {
      balance: this.wallet.balance,
      totalEarned: this.wallet.totalEarned,
      pendingPayout: this.wallet.pendingPayout,
      totalPaidOut: this.wallet.totalPaidOut,
    },
    earnings: this.earnings,
    pendingEarnings: this.pendingEarnings,
    agentCode: this.agentCode,
    isActive: this.isActive,
    userType: this.userType,
  };
};

module.exports = mongoose.model('Agent', agentSchema);