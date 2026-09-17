// models/activityLog.js
// Audit trail for enterprise team members: every action they take in the
// business account is recorded here so the owner can review everything a
// member did since their account was created (including who they chatted with).
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    teamMember: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TeamMember',
      required: true,
      index: true,
    },
    // The business (owner provider) this member belongs to
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: true,
      index: true,
    },
    action: { type: String, required: true },   // e.g. 'chat.message', 'job.status'
    method: { type: String },                    // HTTP method
    path: { type: String },                      // request path
    targetType: { type: String, default: '' },   // e.g. 'booking', 'service', 'conversation'
    targetId: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.index({ teamMember: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
