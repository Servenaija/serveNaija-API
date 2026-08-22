// services/call.service.js
const axios = require('axios');
const logger = require('../config/logger');

const CF_APP_ID = process.env.CLOUDFLARE_CALLS_APP_ID;
const CF_APP_SECRET = process.env.CLOUDFLARE_CALLS_APP_SECRET;

async function createSession() {
  if (!CF_APP_ID || !CF_APP_SECRET) {
    logger.warn('[calls] Cloudflare Calls credentials not set — returning mock session.');
    return getMockSession();
  }

  try {
    // Correct Cloudflare Calls endpoint for creating sessions
    // Using the Realtime Kit API
    const response = await axios.post(
      `https://rtc.live.cloudflare.com/v1/apps/${CF_APP_ID}/sessions/new`,
      {},
      {
        headers: {
          Authorization: `Bearer ${CF_APP_SECRET}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const data = response.data;
    console.log('[calls] Cloudflare session created:', data.sessionId);
    
    return {
      sessionId: data.sessionId,
      sessionToken: data.sessionToken,
      iceServers: data.iceServers || [{ urls: 'stun:stun.cloudflare.com:3478' }],
    };
  } catch (error) {
    console.error('[calls] Cloudflare API error details:');
    console.error('- Status:', error.response?.status);
    console.error('- Status Text:', error.response?.statusText);
    console.error('- Data:', error.response?.data);
    console.error('- Message:', error.message);
    
    logger.error('[calls] Failed to create CF session:', error.response?.data || error.message);
    return getMockSession();
  }
}

function getMockSession() {
  return {
    sessionId: `mock-session-${Date.now()}`,
    sessionToken: `mock-token-${Date.now()}`,
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
  };
}

async function closeSession(sessionId) {
  if (!CF_APP_ID || !CF_APP_SECRET || sessionId?.startsWith('mock-')) {
    return;
  }

  try {
    await axios.delete(
      `https://rtc.live.cloudflare.com/v1/apps/${CF_APP_ID}/sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${CF_APP_SECRET}`,
        },
      }
    );
    console.log(`[calls] Session closed: ${sessionId}`);
  } catch (err) {
    console.warn(`[calls] Failed to close session ${sessionId}:`, err.message);
  }
}

module.exports = {
  createSession,
  closeSession,
};