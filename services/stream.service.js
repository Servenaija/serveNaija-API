// services/stream.service.js

const { StreamClient } = require('@stream-io/node-sdk');

const STREAM_API_KEY =
  process.env.STREAM_API_KEY;

const STREAM_API_SECRET =
  process.env.STREAM_API_SECRET;

const RING_TIMEOUT_MS =
  30_000;

let client = null;

/**
 * =========================================================
 * STREAM CLIENT
 * =========================================================
 */

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
 * =========================================================
 * GENERATE STREAM TOKEN
 * =========================================================
 */

function generateToken(userId) {
  if (!userId) {
    throw new Error(
      'Cannot generate Stream token without userId'
    );
  }

  const streamClient =
    getStreamClient();

  return streamClient.generateUserToken({
    user_id:
      String(userId),

    validity_in_seconds:
      60 * 60,
  });
}

/**
 * =========================================================
 * UPSERT STREAM USERS
 * =========================================================
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
      .map(
        (user) => ({
          id:
            String(
              user.id
            ),

          role:
            'user',

          name:
            user.name ||
            'User',

          ...(user.image
            ? {
                image:
                  user.image,
              }
            : {}),
        })
      );

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
 * =========================================================
 * CREATE STREAM CALL
 * =========================================================
 *
 * Important:
 *
 * We keep your existing function arguments.
 *
 * We add caller information to Stream custom data so the
 * frontend can read:
 *
 * call.data.created_by
 *
 * without changing any existing frontend parameter names.
 * =========================================================
 */

async function createCall({
  callId,
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
      createdByUserId,
      recipientUserId,
      isVideo,
    }
  );

  /**
   * ---------------------------------------------------------
   * UPSERT BOTH USERS
   * ---------------------------------------------------------
   */

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

  /**
   * ---------------------------------------------------------
   * STREAM CALL
   * ---------------------------------------------------------
   */

  const call =
    streamClient.video.call(
      'default',
      String(
        callId
      )
    );

  /**
   * ---------------------------------------------------------
   * CREATE / GET CALL
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   *
   * `created_by` is included in custom data.
   *
   * This is what your frontend router reads:
   *
   * incomingCall.data.created_by.id
   * incomingCall.data.created_by.name
   * incomingCall.data.created_by.image
   *
   * `video` is also included because your frontend reads:
   *
   * incomingCall.data.video
   * ---------------------------------------------------------
   */

  const response =
    await call.getOrCreate({
      ring:
        true,

      video:
        Boolean(
          isVideo
        ),

      data: {
        /**
         * Caller information.
         */
        created_by: {
          id:
            String(
              createdByUserId
            ),

          name:
            createdByName ||
            'Caller',

          ...(createdByImage
            ? {
                image:
                  createdByImage,
              }
            : {}),
        },

        /**
         * Keep your existing created_by_id too.
         */
        created_by_id:
          String(
            createdByUserId
          ),

        /**
         * Call type.
         */
        video:
          Boolean(
            isVideo
          ),

        /**
         * Members.
         */
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
         * Ring configuration.
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
    'STREAM CALL CREATED:',
    {
      callId,
      createdByUserId,
      recipientUserId,
      isVideo,
    }
  );

  return {
    call,
    response,
  };
}

/**
 * =========================================================
 * GET STREAM CALL
 * =========================================================
 */

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
    String(
      callId
    )
  );
}

/**
 * =========================================================
 * END STREAM CALL
 * =========================================================
 */

async function endCall(
  callId
) {
  const call =
    getCall(
      callId
    );

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

    logStreamError(
      error
    );

    throw error;
  }
}

/**
 * =========================================================
 * STREAM ERROR LOGGER
 * =========================================================
 */

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

/**
 * =========================================================
 * EXPORT
 * =========================================================
 */

module.exports = {
  getStreamClient,
  generateToken,
  upsertUsers,
  createCall,
  getCall,
  endCall,
  RING_TIMEOUT_MS,
};