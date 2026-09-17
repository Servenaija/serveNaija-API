const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { dB } = require('../models');

// ─────────────────────────────────────────
// ENTERPRISE TEAM PERMISSIONS + ACTIVITY LOG
// Owners have full access (no req.teamMember). Team members are gated per
// section, and every action they take is written to the activity log so the
// owner can review everything a member did since their account was created.
// ─────────────────────────────────────────

const PERMISSION_KEYS = ['wallet', 'promote', 'jobs', 'marketplace', 'createService', 'chat'];

// Guard: allow owners always; team members only with the given permission
const teamPermission = (key) => (req, res, next) => {
  if (!req.teamMember) return next(); // owner / full account
  if (!PERMISSION_KEYS.includes(key)) return next();
  if (req.teamMember.permissions?.[key]) return next();
  return next(new ApiError(httpStatus.FORBIDDEN, `Your account does not have access to this section (${key}). Ask the business owner to grant it.`));
};

// Audit middleware: records the member's action after the response is sent
const logTeamActivity = (action, targetType) => (req, res, next) => {
  if (req.teamMember) {
    res.on('finish', () => {
      if (res.statusCode >= 400) return; // only log successful actions
      try {
        dB.activityLogs.create({
          teamMember: req.teamMember._id,
          provider: req.teamMember.provider,
          action,
          method: req.method,
          path: req.originalUrl,
          targetType: targetType || '',
          targetId: req.params?.id || req.params?.orderId || req.params?.bookingId || '',
          meta: {
            conversationId: req.params?.id || req.body?.conversationId || '',
            preview: typeof req.body?.text === 'string' ? req.body.text.slice(0, 140) : undefined,
          },
        }).catch(() => {});
      } catch (_) { /* never break the request */ }
    });
  }
  return next();
};

module.exports = { teamPermission, logTeamActivity, PERMISSION_KEYS };
