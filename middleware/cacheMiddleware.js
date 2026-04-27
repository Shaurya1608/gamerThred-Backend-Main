import { getCache, setCache } from "../utils/redisUtils.js";
import logger from "../utils/logger.js";

/**
 * Higher-order middleware to cache API responses in Redis
 * @param {string} keyPrefix - Prefix for the Redis key
 * @param {number} ttl - TTL in seconds
 */
export const cacheMiddleware = (keyPrefix, ttl = 600) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    // Create unique key based on URL and optional user ID
    let key = `${keyPrefix}:${req.originalUrl || req.url}`;
    if (req.user?._id) {
      key += `:user:${req.user._id}`;
    }

    try {
      const cachedData = await getCache(key);
      if (cachedData) {
        // 💡 HIT: Return cached data
        return res.json(cachedData);
      }

      // 💡 MISS: Override res.json to capture response and store in cache
      const originalJson = res.json;
      res.json = function (data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setCache(key, data, ttl);
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error(`Cache Middleware Error (${key}):`, error);
      next(); // Fail gracefully: continue to controller
    }
  };
};
