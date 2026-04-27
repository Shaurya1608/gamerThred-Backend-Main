import Redis from "ioredis"
import dotenv from "dotenv";
dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL;
const isTls = redisUrl?.startsWith("rediss://");

// Standard connection with retry limits for API safety
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  commandTimeout: 10000, // Increased from 5s to 10s for Upstash cold starts
  connectTimeout: 20000, // Increased from 10s to 20s
  enableOfflineQueue: true,
  lazyConnect: true,
  ...(isTls && {
    tls: {
      rejectUnauthorized: false // Required for some Upstash/managed Redis environments
    }
  })
});

redis.on("error", (err) => {
    // Suppress excessive logging for connection refused (common in dev if redis isn't running)
    if (err.code === "ECONNREFUSED") {
        console.warn("Redis connection refused. Is the server running?");
    } else {
        console.error("Redis Client Error:", err.message);
    }
});

// Dedicated connection for BullMQ (must have maxRetriesPerRequest: null)
export const bullRedis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 20000,
  ...(isTls && {
    tls: {
      rejectUnauthorized: false
    }
  })
});
