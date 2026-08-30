const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    reviewer: { type: String, required: true },
    reviewerName: { type: String },
    reviewerAvatar: { type: String },

    // polymorphic — points to Provider _id OR Product _id OR Store _id
    target: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetType: { type: String, enum: ['provider', 'product', 'store'], required: true },

    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    overall: { type: Number, min: 1, max: 5 },
    categories: {
      quality: { type: Number, min: 1, max: 5 },
      punctuality: { type: Number, min: 1, max: 5 },
      professionalism: { type: Number, min: 1, max: 5 },
      communication: { type: Number, min: 1, max: 5 },
    },

    text: { type: String, trim: true },
    images: [{ type: String }],

    // true if the review comes from a verified completed booking/order
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.index({ target: 1, targetType: 1, createdAt: -1 });
reviewSchema.index({ targetType: 1, overall: -1 });                   // top-rated by type
reviewSchema.index({ reviewer: 1, createdAt: -1 });                   // reviewer history
// Prevent one user from leaving two reviews for the same booking
reviewSchema.index({ reviewer: 1, booking: 1 }, { sparse: true, unique: true });

module.exports = mongoose.model('Review', reviewSchema);
