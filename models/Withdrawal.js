// models/Withdrawal.js
const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider' },
    
    amount: { type: Number, required: true },
    amountToSend: { type: Number },
    serviceCharge: { type: Number, default: 0 },
    
    bankName: { type: String, trim: true },
    bankCode: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    accountName: { type: String, trim: true },
    
    reference: { type: String, unique: true },
    
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    
    approved: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed', 'failed'],
      default: 'pending',
    },
    
    moneySent: { type: Boolean, default: false },
    transferId: { type: String },
    transferReference: { type: String },
    transferStatus: { type: String },
    
    failedAttempts: { type: Number, default: 0 },
    lastError: { type: String },
    lastAttemptAt: { type: Date },
    processedAt: { type: Date },
    requestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes for faster queries
withdrawalSchema.index({ customer: 1, status: 1 });
withdrawalSchema.index({ provider: 1, status: 1 });
withdrawalSchema.index({ reference: 1 }, { unique: true });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);