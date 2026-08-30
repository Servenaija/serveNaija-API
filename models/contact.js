const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    topic: {
      type: String,
      trim: true,
      default: 'General enquiry',
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

contactSchema.index({ createdAt: -1 });
contactSchema.index({ email: 1 });
contactSchema.index({ isRead: 1, createdAt: -1 });   // unread queue first

module.exports = mongoose.model('Contact', contactSchema);
