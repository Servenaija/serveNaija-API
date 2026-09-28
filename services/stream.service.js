// services/stream.service.js

const { StreamClient } = require('@stream-io/node-sdk');

const STREAM_API_KEY =
  process.env.STREAM_API_KEY;

const STREAM_API_SECRET =
  process.env.STREAM_API_SECRET;

const RING_TIMEOUT_MS = 30_000;

/**
 * =========================================================
 * TOKEN VALIDITY
 * =========================================================
 *
 * Stream's own default for a user token is 1 hour. The
 * mobile app caches the token it receives and reuses it
 * later (reconnect, app resumed from background, call
 * screen opened from a push notification). Once that cached
 * token's `exp` has passed, Stream closes the video
 * WebSocket with:
 *
 *   WS failed with code: 40: AuthErrorTokenExpired
 *
 * So we issue a long-lived token AND return its expiry to
 * the client, which lets the app refresh the token BEFORE
 * it dies instead of after the call already failed.
 */

const MIN_TOKEN_VALIDITY_SECONDS =
  5 * 60;

const MAX_TOKEN_VALIDITY_SECONDS =
  30 * 24 * 60 * 60;

const DEFAULT_TOKEN_VALIDITY_SECONDS =
  24 * 60 * 60;

let client = null;

function getStreamClient() {
  if (!client) {
    if (
      !STREAM_API_KEY ||
      !STREAM_API_SECRET
    ) {
      throw new Error(
        'Stream API credentials missing. Check STREAM_API_KEY and STREAM_API_SECRET.'
      );
    }

    client =
      new StreamClient(
        STREAM_API_KEY,
        STREAM_API_SECRET
      );
  }

  return client;
}

/**
 * Clamp any requested validity into the supported range
 * so neither a bad env value nor a per-call override can
 * mint an absurdly short (or long-lived) token.
 *
 * @param {number} requested
 * @returns {number}
 */
function clampTokenValidity(requested) {
  return Math.min(
    MAX_TOKEN_VALIDITY_SECONDS,
    Math.max(
      MIN_TOKEN_VALIDITY_SECONDS,
      Math.floor(requested)
    )
  );
}

/**
 * Resolve how long a freshly minted Stream token should
 * stay valid.
 *
 * Configurable through STREAM_TOKEN_VALIDITY_SECONDS so
 * the value can be tuned (or shortened again for a
 * stricter security posture) without a code change.
 * Always clamped to a sane range.
 */
function getTokenValiditySeconds() {
  const configured =
    Number(
      process.env
        .STREAM_TOKEN_VALIDITY_SECONDS
    );

  if (
    !Number.isFinite(configured) ||
    configured <= 0
  ) {
    return DEFAULT_TOKEN_VALIDITY_SECONDS;
  }

  return clampTokenValidity(
    configured
  );
}

/**
 * Generate Stream token.
 *
 * Returns the raw token string plus the expiry metadata
 * the client needs to refresh the token before Stream
 * rejects it (WS close code 40 — AuthErrorTokenExpired).
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {number} [options.validityInSeconds] override the configured validity
 * @returns {{ token: string, expiresAt: number, expiresAtIso: string, expiresInSeconds: number }}
 */
function generateToken(
  userId,
  options = {}
) {
  if (!userId) {
    throw new Error(
      'Cannot generate Stream token without userId'
    );
  }

  const streamClient =
    getStreamClient();

  const expiresInSeconds =
    options.validityInSeconds
      ? clampTokenValidity(
          options.validityInSeconds
        )
      : getTokenValiditySeconds();

  /**
   * The SDK defaults `iat` to now minus 1 second to
   * absorb clock skew between this server and Stream.
   */
  const iat =
    Math.floor(
      (Date.now() - 1000) / 1000
    );

  const token =
    streamClient.generateUserToken({
      user_id:
        String(userId),

      iat,

      validity_in_seconds:
        expiresInSeconds,
    });

  /**
   * Mirrors the SDK math
   * (exp = iat + validity_in_seconds) so the client is
   * told exactly when the token it just received dies.
   */
  const expiresAt =
    iat + expiresInSeconds;

  return {
    token,

    expiresAt,

    expiresAtIso:
      new Date(
        expiresAt * 1000
      ).toISOString(),

    expiresInSeconds,
  };
}

/**
 * Backwards-compatible helper for call sites that only
 * need the raw token string.
 *
 * @param {string} userId
 * @returns {string}
 */
function generateTokenString(userId) {
  return generateToken(userId).token;
}

/**
 * Upsert Stream users.
 */
async function upsertUsers(
  users = []
) {
  const streamClient =
    getStreamClient();

  const normalizedUsers =
    users
      .filter(
        (user) =>
          user &&
          user.id
      )
      .map((user) => ({
        id:
          String(user.id),

        role: 'user',

        name:
          user.name ||
          'User',

        ...(user.image
          ? {
              image:
                user.image,
            }
          : {}),
      }));

  console.log(
    'STREAM STEP 1: Upserting users'
  );

  console.log(
    'Users:',
    JSON.stringify(
      normalizedUsers,
      null,
      2
    )
  );

  if (
    !normalizedUsers.length
  ) {
    throw new Error(
      'No valid Stream users provided'
    );
  }

  try {
    const result =
      await streamClient.upsertUsers(
        normalizedUsers
      );

    console.log(
      'STREAM STEP 1 SUCCESS: Users upserted'
    );

    return result;
  } catch (error) {
    console.error(
      'STREAM STEP 1 FAILED: upsertUsers'
    );

    logStreamError(error);

    throw error;
  }
}

/**
 * Create Stream ringing call.
 *
 * Stream owns the 30-second ringing timeout.
 */
async function createCall({
  callId,
  mongoCallId,
  createdByUserId,
  recipientUserId,
  createdByName,
  recipientName,
  createdByImage,
  recipientImage,
  isVideo = false,
}) {
  if (!callId) {
    throw new Error(
      'callId is required'
    );
  }

  if (!createdByUserId) {
    throw new Error(
      'createdByUserId is required'
    );
  }

  if (!recipientUserId) {
    throw new Error(
      'recipientUserId is required'
    );
  }

  const streamClient =
    getStreamClient();

  console.log(
    'Creating Stream call:',
    {
      callId,
      mongoCallId,
      createdByUserId,
      recipientUserId,
      isVideo,
    }
  );

  await upsertUsers([
    {
      id:
        createdByUserId,

      name:
        createdByName ||
        'Caller',

      image:
        createdByImage,
    },

    {
      id:
        recipientUserId,

      name:
        recipientName ||
        'Recipient',

      image:
        recipientImage,
    },
  ]);

  const call =
    streamClient.video.call(
      'default',
      String(callId)
    );

  const response =
    await call.getOrCreate({
      ring: true,

      video:
        Boolean(isVideo),

      data: {
        created_by_id:
          String(
            createdByUserId
          ),

        /**
         * Custom data carried on the Stream call itself.
         *
         * The mobile app reads these from incoming-call
         * events (call.accepted / call.ring / push) because
         * the CallResponse has no top-level `video` field:
         *
         *  - callId:   the ServeNaija (Mongo) call ID, so the
         *              app can call accept/reject/end endpoints
         *              for calls answered on the native screen.
         *
         *  - callType: 'video' | 'voice' — used to open the
         *              correct (video) call screen.
         *
         *  - video:    boolean duplicate of callType for
         *              convenience.
         */
        custom: {
          callId:
            String(mongoCallId || ''),

          callType:
            isVideo ? 'video' : 'voice',

          video:
            Boolean(isVideo),
        },

        members: [
          {
            user_id:
              String(
                createdByUserId
              ),
          },
          {
            user_id:
              String(
                recipientUserId
              ),
          },
        ],

        /**
         * Stream owns the timeout.
         *
         * Caller:
         * 30 sec unanswered -> timeout.
         *
         * Callee:
         * 30 sec unanswered -> timeout.
         */
        settings_override: {
          ring: {
            auto_cancel_timeout_ms:
              RING_TIMEOUT_MS,

            incoming_call_timeout_ms:
              RING_TIMEOUT_MS,

            missed_call_timeout_ms:
              RING_TIMEOUT_MS,
          },
        },
      },
    });

  console.log(
    'Stream call created successfully:',
    callId
  );

  return {
    call,
    response,
  };
}

function getCall(
  callId
) {
  if (!callId) {
    throw new Error(
      'callId is required'
    );
  }

  const streamClient =
    getStreamClient();

  return streamClient.video.call(
    'default',
    String(callId)
  );
}

async function endCall(
  callId
) {
  const call =
    getCall(callId);

  try {
    await call.end();

    console.log(
      'Stream call ended:',
      callId
    );
  } catch (error) {
    console.error(
      'Failed to end Stream call'
    );

    logStreamError(error);

    throw error;
  }
}

function logStreamError(
  error
) {
  console.error(
    '---------------- STREAM ERROR ----------------'
  );

  console.error(
    'message:',
    error?.message
  );

  console.error(
    'name:',
    error?.name
  );

  console.error(
    'status:',
    error?.status
  );

  console.error(
    'statusCode:',
    error?.statusCode
  );

  console.error(
    'code:',
    error?.code
  );

  console.error(
    'response:',
    error?.response
      ? JSON.stringify(
          error.response,
          null,
          2
        )
      : undefined
  );

  console.error(
    'body:',
    error?.body
      ? JSON.stringify(
          error.body,
          null,
          2
        )
      : undefined
  );

  console.error(
    'stack:',
    error?.stack
  );

  console.error(
    '------------------------------------------------'
  );
}

module.exports = {
  getStreamClient,
  generateToken,
  generateTokenString,
  getTokenValiditySeconds,
  clampTokenValidity,
  upsertUsers,
  createCall,
  getCall,
  endCall,
  RING_TIMEOUT_MS,
  MIN_TOKEN_VALIDITY_SECONDS,
  MAX_TOKEN_VALIDITY_SECONDS,
  DEFAULT_TOKEN_VALIDITY_SECONDS,
};