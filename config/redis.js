import Redis from "ioredis"
import dotenv from "dotenv";
dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL;
const isTls = redisUrl?.startsWith("rediss://");

// Standard connection with retry limits for API safety
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  commandTimeout: 15000, // Increased to 15s
  connectTimeout: 30000, // Increased to 30s
  enableOfflineQueue: true,
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  ...(isTls && {
    tls: {
      rejectUnauthorized: false,
      servername: redisUrl.split('@')[1].split(':')[0] // Explicitly set servername for TLS
    }
  })
});

// Helper to catch errors on commands
const wrapRedis = (client) => {
    client.on("error", (err) => {
        if (err.code === "ECONNREFUSED") {
            console.warn("Redis connection refused. Is the server running?");
        } else if (err.message.includes("timed out")) {
            console.warn("Redis Command Timed Out. Retrying or ignoring...");
        } else {
            console.error("Redis Client Error:", err.message);
        }
    });
};

wrapRedis(redis);

// Dedicated connection for BullMQ (must have maxRetriesPerRequest: null)
export const bullRedis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 30000,
  ...(isTls && {
    tls: {
      rejectUnauthorized: false,
      servername: redisUrl.split('@')[1].split(':')[0]
    }
  })
});

wrapRedis(bullRedis);
