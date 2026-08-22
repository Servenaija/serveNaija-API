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

module.exports =
  mongoose.model(
    'Call',
    callSchema
  );