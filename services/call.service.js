/**
 * Cloudflare Calls (RealtimeKit) Service
 *
 * Cloudflare Calls provides a globally distributed SFU (Selective Forwarding Unit)
 * for WebRTC-based voice and video calls using a simple REST API.
 *
 * Required env vars:
 *   CLOUDFLARE_CALLS_APP_ID=your_app_id
 *   CLOUDFLARE_CALLS_APP_SECRET=your_app_secret
 *
 * Flow:
 *  1. Caller: POST /calls/initiate  → server creates a CF session for caller
 *  2. Callee receives socket push (incoming_call event with callId)
 *  3. Callee: PUT /calls/:id/answer → server creates CF session for callee
 *  4. Both apps use CF session tokens to establish peer connections
 *  5. Either party: PUT /calls/:id/end
 */

const axios = require('axios');
const logger = require('../config/logger');

const CF_APP_ID = process.env.CLOUDFLARE_CALLS_APP_ID;
const CF_APP_SECRET = process.env.CLOUDFLARE_CALLS_APP_SECRET;
const CF_BASE = `https://rtc.live.cloudflare.com/v1/apps/${CF_APP_ID}`;

const cfClient = axios.create({
  baseURL: CF_BASE,
  headers: {
    Authorization: `Bearer ${CF_APP_SECRET}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Create a new Cloudflare Calls session.
 * Returns the session ID and ICE servers config for the app to use with WebRTC.
 */
async function createSession() {
  if (!CF_APP_ID || !CF_APP_SECRET) {
    logger.warn('[calls] Cloudflare Calls credentials not set — returning mock session.');
    return {
      sessionId: `mock-session-${Date.now()}`,
      sessionToken: `mock-token-${Date.now()}`,
      iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    };
  }

  const { data } = await cfClient.post('/sessions/new', {});
  return {
    sessionId: data.sessionId,
    sessionToken: data.sessionToken,
    iceServers: data.iceServers || [{ urls: 'stun:stun.cloudflare.com:3478' }],
  };
}

/**
 * Close / terminate a Cloudflare Calls session.
 */
async function closeSession(sessionId) {
  if (!CF_APP_ID || !CF_APP_SECRET || sessionId?.startsWith('mock-')) return;

  try {
    await cfClient.delete(`/sessions/${sessionId}`);
  } catch (err) {
    logger.warn(`[calls] Failed to close CF session ${sessionId}:`, err.message);
  }
}

module.exports = {
  createSession,
  closeSession,
};
