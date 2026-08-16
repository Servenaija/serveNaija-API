const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: String, required: true },
    recipientType: { type: String, enum: ['customer', 'provider', 'admin'], required: true },

    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },

    // notification category for filtering/grouping
    type: {
      type: String,
      enum: ['booking', 'payment', 'kyc', 'chat', 'call', 'system', 'promotion', 'order', 'review', 'wallet', 'other'],
      default: 'system',
    },

    // extra payload forwarded to the mobile app for deep linking
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },

    // Status of the push delivery
    pushStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'not_applicable'],
      default: 'pending',
    },
    pushError: { type: String, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });  // filter by type
notificationSchema.index({ recipientType: 1, createdAt: -1 });       // admin queries
// Auto-expire notifications after 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('Notification', notificationSchema);
