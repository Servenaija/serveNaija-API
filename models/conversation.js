const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    actorType: { type: String, enum: ['customer', 'provider', 'admin'], required: true },
    name: { type: String },
    avatar: { type: String },
  },
  { _id: false }
);

const lastMessageSchema = new mongoose.Schema(
  {
    text: { type: String },
    imageUrl: { type: String },
    senderId: { type: String },
    senderType: { type: String },
    timestamp: { type: Date },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    participants: { type: [participantSchema], required: true },
    lastMessage: lastMessageSchema,

    // Map of userId => unread count  e.g. { "abc123": 3, "xyz456": 0 }
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },

    // Linked booking (optional — provider-customer conversations may be tied to a booking)
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

    // Webhook URL to notify when new messages arrive (per conversation)
    webhookUrl: { type: String, trim: true, default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

conversationSchema.index({ 'participants.userId': 1 });
conversationSchema.index({ 'participants.userId': 1, updatedAt: -1 }); // participant inbox, newest first
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ isActive: 1, updatedAt: -1 });              // active conversations
conversationSchema.index({ booking: 1 }, { sparse: true });            // booking-linked chats

module.exports = mongoose.model('Conversation', conversationSchema);
