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

/**
 * Returns an Express middleware that caches JSON GET responses in Redis.
 * Drop-in replacement for express-redis-cache's .route() method.
 * @param {object} [opts]
 * @param {number} [opts.expire=60] - Cache TTL in seconds
 */
const route = (opts = {}) => {
  const ttl = (opts && opts.expire != null) ? opts.expire : 60;

  return async (req, res, next) => {
    if (!isReady || req.method !== 'GET') return next();

    const key = `cache:${req.originalUrl}`;

    try {
      const cached = await redisClient.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }
    } catch {
      return next();
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (isReady && ttl > 0) {
        redisClient.setEx(key, ttl, JSON.stringify(body)).catch(() => {});
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    return next();
  };
};

module.exports = { route, redisClient };