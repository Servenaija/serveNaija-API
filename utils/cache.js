const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
  },
});

let isReady = false;

redisClient.on('ready', () => { isReady = true; });
redisClient.on('error', () => { isReady = false; });
redisClient.on('end', () => { isReady = false; });

redisClient.connect().catch(() => {
  console.warn('[cache] Redis unavailable — response caching disabled');
});

const CACHE_KEY_PREFIX = 'cache:';
// Sorted set tracking the last time each cache key was accessed (score = epoch ms)
const ACCESS_ZSET = 'cache:access';
// Cache keys not accessed for longer than this are considered stale and get swept.
const DEFAULT_MAX_IDLE_SECONDS = 6 * 60 * 60; // 6 hours

const markAccess = (key) => {
  redisClient.zAdd(ACCESS_ZSET, { score: Date.now(), value: key }).catch(() => {});
};

/**
 * Returns an Express middleware that caches JSON GET responses in Redis.
 * @param {object} [opts]
 * @param {number} [opts.expire=60] - Cache TTL in seconds
 */
const route = (opts = {}) => {
  const ttl = (opts && opts.expire != null) ? opts.expire : 60;

  return async (req, res, next) => {
    if (!isReady || req.method !== 'GET') return next();

    const key = `${CACHE_KEY_PREFIX}${req.originalUrl}`;

    try {
      const cached = await redisClient.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        markAccess(key);
        return res.json(JSON.parse(cached));
      }
    } catch {
      return next();
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (isReady && ttl > 0 && res.statusCode < 400) {
        redisClient.setEx(key, ttl, JSON.stringify(body)).catch(() => {});
        markAccess(key);
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    return next();
  };
};

/**
 * Invalidates all cached responses whose URL starts with any of the given
 * prefixes (e.g. '/v1.0/marketplace'). Fire-and-forget safe to call anywhere.
 * @param {string|string[]} prefixes
 */
const invalidate = async (prefixes) => {
  if (!isReady) return;
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  try {
    await Promise.all(list.map(async (prefix) => {
      const pattern = `${CACHE_KEY_PREFIX}${prefix}*`;
      let cursor = '0';
      do {
        const { cursor: next, keys } = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 200 });
        cursor = next;
        if (keys.length) {
          await redisClient.del(keys);
          await redisClient.zRem(ACCESS_ZSET, keys).catch(() => {});
        }
      } while (cursor !== '0');
    }));
  } catch {
    // invalidation is best-effort; short TTLs bound staleness anyway
  }
};

/**
 * Express middleware for mutating (non-GET) routes: when the response finishes
 * successfully, invalidates all cached entries under the given prefixes.
 * @param {string|string[]} prefixes
 */
const invalidateOnWrite = (prefixes) => (req, res, next) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode < 400) invalidate(prefixes);
  });
  return next();
};

/**
 * Removes cache entries that have not been accessed for a long time.
 * Returns the number of keys removed.
 * @param {number} [maxIdleSeconds=6h]
 */
const sweepStale = async (maxIdleSeconds = DEFAULT_MAX_IDLE_SECONDS) => {
  if (!isReady) return 0;

  const now = Date.now();
  const cutoff = now - maxIdleSeconds * 1000;
  let removed = 0;

  try {
    // 1) Keys never touched since the tracker existed and older than the cutoff
    const staleKeys = await redisClient.zRangeByScore(ACCESS_ZSET, 0, cutoff);
    for (const key of staleKeys) {
      await redisClient.del(key).catch(() => {});
      await redisClient.zRem(ACCESS_ZSET, key).catch(() => {});
      removed += 1;
    }

    // 2) Drop tracker entries whose key already expired naturally — keep the zset small
    const tracked = await redisClient.zRange(ACCESS_ZSET, 0, -1);
    for (const key of tracked) {
      const exists = await redisClient.exists(key).catch(() => 0);
      if (!exists) {
        await redisClient.zRem(ACCESS_ZSET, key).catch(() => {});
      }
    }
  } catch {
    return removed;
  }

  return removed;
};

module.exports = { route, invalidate, invalidateOnWrite, sweepStale, redisClient };