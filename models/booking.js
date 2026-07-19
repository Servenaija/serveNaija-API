const mongoose = require('mongoose');

const timelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String },
    note: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },

    service: {
      name: { type: String, trim: true },
      price: { type: Number },
      category: { type: String, trim: true },
      serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    },

    description: { type: String, trim: true },
    photos: [{ type: String }],

    scheduledDate: { type: Date },
    timeSlot: { type: String, trim: true },

    address: {
      full: { type: String, trim: true },
      landmark: { type: String, trim: true },
      state: { type: String, trim: true },
      city: { type: String, trim: true },
      coordinates: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
      },
    },

    additionalNotes: { type: String, trim: true },

    status: {
      type: String,
      enum: [
        'pending',
        'accepted',
        'declined',
        'on-the-way',
        'arrived',
        'assessment',
        'in-progress',
        'completed',
        'cancelled',
        'disputed',
      ],
      default: 'pending',
      index: true,
    },

    // 4-digit start code (customer generates, provider verifies to start)
    startCode: { type: String, select: false },
    startCodeExpiresAt: { type: Date },
    startCodeVerifiedAt: { type: Date },

    declineReason: { type: String, trim: true },
    cancellationReason: { type: String, trim: true },
    cancelledBy: { type: String, enum: ['customer', 'provider', 'admin'] },

    // Payment
    serviceFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 1500 },
    totalAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['pending', 'held', 'released', 'refunded'],
      default: 'pending',
    },
    paystackReference: { type: String, trim: true },

    // Completion evidence
    completionPhotos: {
      before: [{ type: String }],
      after: [{ type: String }],
    },
    completionNotes: { type: String, trim: true },
    completedAt: { type: Date },

    // Additional payment request by provider
    additionalPaymentRequest: {
      reason: { type: String, trim: true },
      description: { type: String, trim: true },
      amount: { type: Number },
      evidencePhotos: [{ type: String }],
      status: { type: String, enum: ['pending', 'approved', 'rejected'] },
      requestedAt: { type: Date },
    },

    // Customer rating after completion
    rating: {
      overall: { type: Number, min: 1, max: 5 },
      quality: { type: Number, min: 1, max: 5 },
      punctuality: { type: Number, min: 1, max: 5 },
      professionalism: { type: Number, min: 1, max: 5 },
      communication: { type: Number, min: 1, max: 5 },
      review: { type: String, trim: true },
      ratedAt: { type: Date },
    },

    timeline: [timelineEntrySchema],
  },
  { timestamps: true }
);

bookingSchema.index({ customer: 1, status: 1, createdAt: -1 });
bookingSchema.index({ provider: 1, status: 1, createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ paystackReference: 1 }, { sparse: true });

module.exports = mongoose.model('Booking', bookingSchema);
