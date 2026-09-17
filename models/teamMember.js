
// models/teamMember.js
// Enterprise team members — employee sub-accounts created by business owners.
const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    tempPassword: {
      type: String,
      required: true,
    },
    // When true the member must set a new password on next login.
    // Owner toggles this at creation and can flip it later.
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    customerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Provider' }],
      default: [],
    },
    // Jobs (bookings) the owner explicitly assigned to this member
    bookingIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
      default: [],
    },
    // What sections/actions this member can access in the business account.
    // The owner controls every flag from the Team Management screen.
    permissions: {
      wallet: { type: Boolean, default: false },        // see wallet & earnings
      promote: { type: Boolean, default: false },       // promotions / ads
      jobs: { type: Boolean, default: false },          // bookings / jobs
      marketplace: { type: Boolean, default: false },   // store, products, orders
      createService: { type: Boolean, default: false }, // create / edit services
      chat: { type: Boolean, default: false },          // chat with customers
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending'],
      default: 'active',
    },
    invitedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

teamMemberSchema.index({ provider: 1, createdAt: -1 });

module.exports = mongoose.model('TeamMember', teamMemberSchema);
