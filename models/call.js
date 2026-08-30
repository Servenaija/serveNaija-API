const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
  {
    initiator: {
      type: String,
      required: true,
    },

    initiatorType: {
      type: String,
      enum: ['customer', 'provider'],
      required: true,
    },

    recipient: {
      type: String,
      required: true,
    },

    recipientType: {
      type: String,
      enum: ['customer', 'provider'],
      required: true,
    },

    type: {
      type: String,
      enum: ['voice', 'video'],
      required: true,
    },

    status: {
      type: String,
      enum: [
        'ringing',
        'accepted',
        'rejected',
        'ended',
        'missed',
        'busy',
        'cancelled',
      ],
      default: 'ringing',
    },

    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },

    streamCallId: {
      type: String,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    duration: {
      type: Number,
      default: 0,
    },

    rejectReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================
// INDEXES
// ============================================
callSchema.index({ initiator: 1, createdAt: -1 });          // outgoing call history
callSchema.index({ recipient: 1, createdAt: -1 });          // incoming call history
callSchema.index({ status: 1, createdAt: -1 });             // status filtering
callSchema.index({ conversation: 1 }, { sparse: true });    // calls within a conversation
callSchema.index({ streamCallId: 1 }, { sparse: true });    // Stream webhook lookups

module.exports =
  mongoose.model(
    'Call',
    callSchema
  );