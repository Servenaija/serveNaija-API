const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema(
  {
    user: {
      userId: { type: String, required: true },
      userType: { type: String, enum: ['customer', 'provider'], required: true },
      name: { type: String },
      email: { type: String },
    },
    subject: { type: String, trim: true, default: 'Support Request' },
    messages: [
      {
        senderId: { type: String, required: true },
        senderType: { type: String, enum: ['user', 'admin'], required: true },
        senderName: { type: String },
        text: { type: String },
        imageUrl: { type: String },
        createdAt: { type: Date, default: Date.now },
        readBy: [{ type: String }],
      },
    ],
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
    },
    assignedTo: { type: String, default: null },
    lastMessageAt: { type: Date, default: Date.now },
    unreadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

supportTicketSchema.index({ 'user.userId': 1, status: 1 });
supportTicketSchema.index({ 'user.userId': 1, lastMessageAt: -1 }); // user inbox, newest first
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ status: 1, lastMessageAt: -1 });
supportTicketSchema.index({ createdAt: -1 });                        // admin dashboards

module.exports = mongoose.model('SupportTicket', supportTicketSchema);