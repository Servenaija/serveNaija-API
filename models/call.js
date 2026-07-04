const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
  {
    initiator: { type: String, required: true },
    initiatorType: { type: String, enum: ['customer', 'provider'], required: true },
    recipient: { type: String, required: true },
    recipientType: { type: String, enum: ['customer', 'provider'], required: true },

    type: { type: String, enum: ['voice', 'video'], required: true },

    status: {
      type: String,
      enum: ['ringing', 'accepted', 'rejected', 'ended', 'missed', 'busy'],
      default: 'ringing',
    },

    // Linked conversation (so call log appears in chat thread)
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },

    // Cloudflare Calls (RealtimeKit) session data
    cloudflareAppId: { type: String },
    cloudflareSessionId: { type: String },
    initiatorSessionToken: { type: String },
    recipientSessionToken: { type: String },
    iceServers: { type: mongoose.Schema.Types.Mixed },

    startedAt: { type: Date },
    endedAt: { type: Date },
    duration: { type: Number, default: 0 }, // seconds
  },
  { timestamps: true }
);

callSchema.index({ initiator: 1, createdAt: -1 });
callSchema.index({ recipient: 1, createdAt: -1 });
callSchema.index({ conversation: 1 });

module.exports = mongoose.model('Call', callSchema);
