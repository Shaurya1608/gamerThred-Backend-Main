import { redis } from "../config/redis.js";
import logger from "./logger.js";

/**
 * Updates a user's score in the Redis Sorted Sets (Leaderboard)
 * Priority: 1. Gems (Diamonds), 2. XP (Level), 3. Elo
 * @param {string} userId 
 * @param {number} gems 
 * @param {number} xp 
 * @param {number} elo 
 */
export const updateLeaderboardScore = async (userId, gems = 0, xp = 0, elo = 0) => {
  try {
    const compositeScore = gems + (xp / 1000000000) + (elo / 10000000000000);
    
    // Time-based keys
    const now = new Date();
    const monthKey = `leaderboard:monthly:${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    // ISO Week Calculation (Simple version)
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    const weekKey = `leaderboard:weekly:${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;

    // Atomically update all three
    const pipeline = redis.pipeline();
    pipeline.zadd("leaderboard:global", compositeScore, userId);
    pipeline.zadd(monthKey, compositeScore, userId);
    pipeline.zadd(weekKey, compositeScore, userId);
    await pipeline.exec();

    // Retro-compatibility (Optionally keep the old key for a bit or just migrate)
    await redis.zadd("leaderboard:v3", compositeScore, userId);

  } catch (error) {
    logger.error("Redis Leaderboard Update Error:", error);
  }
};

/**
 * Fetches the top N users from a specific Redis Leaderboard set
 * @param {string} setKey
 * @param {number} limit 
 * @returns {Promise<string[]>} List of user IDs
 */
export const getTopRankings = async (setKey = "leaderboard:global", limit = 100) => {
  try {
    return await redis.zrevrange(setKey, 0, limit - 1);
  } catch (error) {
    logger.error(`Redis Leaderboard Fetch Error (${setKey}):`, error);
    return null;
  }
};

/**
 * Fetches a specific user's rank from a Redis Leaderboard set (1-based)
 * @param {string} setKey
 * @param {string} userId 
 * @returns {Promise<number | null>} 1-based rank or null if not found
 */
export const getUserRank = async (setKey, userId) => {
  try {
    const rank = await redis.zrevrank(setKey, userId);
    return rank !== null ? rank + 1 : null;
  } catch (error) {
    logger.error(`Redis User Rank Fetch Error for ${userId} in ${setKey}:`, error);
    return null;
  }
};

/**
 * Generic Caching: Get data from Redis
 * @param {string} key 
 */
export const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error("Redis Cache Get Error:", error);
    return null;
  }
};

/**
 * Deletes all keys matching a pattern
 * @param {string} pattern - Pattern like 'user_missions:*'
 */
export const invalidatePattern = async (pattern) => {
  try {
    const stream = redis.scanStream({ match: pattern });
    
    // We'll wrap the stream processing in a promise but handle internal errors gracefully
    await new Promise((resolve, reject) => {
      stream.on("data", async (keys) => {
        if (keys.length > 0) {
          try {
            await redis.del(keys);
          } catch (delError) {
            logger.error(`Redis del error during pattern invalidation (${pattern}):`, delError);
          }
        }
      });

      stream.on("end", resolve);
      stream.on("error", (err) => {
        logger.error(`Redis scanStream error (${pattern}):`, err);
        // We resolve instead of reject to prevent crashing the whole app for a cache cleanup failure
        // especially if it's just a timeout due to connection stability.
        resolve(); 
      });
    });
  } catch (error) {
    logger.error(`Failed to invalidate pattern ${pattern}:`, error);
  }
};

/**
 * Generic Caching: Set data in Redis
 * @param {string} key 
 * @param {any} data 
 * @param {number} ttl - Time to live in seconds (default 10 mins)
 */
export const setCache = async (key, data, ttl = 600) => {
  try {
    await redis.set(key, JSON.stringify(data), "EX", ttl);
  } catch (error) {
    logger.error("Redis Cache Set Error:", error);
  }
};

/**
 * Invalidate a cache key
 * @param {string} key 
 */
export const invalidateCache = async (key) => {
  try {
    await redis.del(key);
  } catch (error) {
    logger.error("Redis Cache Delete Error:", error);
  }
};
