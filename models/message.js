const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: { type: String, required: true },
    senderType: { type: String, enum: ['customer', 'provider', 'admin'], required: true },
    senderName: { type: String },
    senderAvatar: { type: String },

    text: { type: String, trim: true },
    imageUrl: { type: String },

    // text | image | call_log | system
    type: { type: String, enum: ['text', 'image', 'call_log', 'system'], default: 'text' },

    // Array of userIds who have read this message
    readBy: [{ type: String }],

    // Soft delete
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, deletedAt: 1, createdAt: -1 }); // paginated message lists

module.exports = mongoose.model('Message', messageSchema);
