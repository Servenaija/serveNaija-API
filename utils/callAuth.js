const axios = require('axios');

const CF_APP_ID = process.env.CLOUDFLARE_CALLS_APP_ID;
const CF_APP_SECRET = process.env.CLOUDFLARE_CALLS_APP_SECRET;

async function generateAuthToken(userId, roomName) {
  try {
    const response = await axios.post(
      `https://rtc.live.cloudflare.com/v1/apps/${CF_APP_ID}/rooms/${roomName}/participants`,
      {
        participantId: userId,
        displayName: 'User Name',
        metadata: { userId: userId },
      },
      {
        headers: {
          Authorization: `Bearer ${CF_APP_SECRET}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.token;
  } catch (error) {
    console.error('Failed to generate auth token:', error.message);
    return `mock-token-${Date.now()}`;
  }
}

module.exports = { generateAuthToken };