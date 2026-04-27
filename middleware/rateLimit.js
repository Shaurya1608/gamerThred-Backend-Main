import { redis } from "../config/redis.js";

export const rateLimit = ({ keyPrefix, limit, windowSeconds }) => {
  return async (req, res, next) => {
    try {
      const ip =
        req.ip ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        "unknown";

      const identifier =
        keyPrefix === "login" ? `${req.body.email || "unknown"}:${ip}` : ip;

      const key = `rate_limit:${keyPrefix}:${identifier}`;

      // 1️⃣ Increment count
      const current = await redis.incr(key);

      // 2️⃣ Ensure TTL is set (especially if first request or if TTL was lost)
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      } else {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          await redis.expire(key, windowSeconds);
        }
      }

      // 3️⃣ If limit exceeded
      if (current > limit) {
        // ⏳ Get remaining TTL from Redis
        const ttl = await redis.ttl(key);

        // ✅ Send standard retry-after header
        res.set("Retry-After", ttl > 0 ? ttl : windowSeconds);

        return res.status(429).json({
          success: false,
          message: `Too many requests. Try again in ${ttl}s`,
          retryAfter: ttl, // optional (frontend can read body too)
        });
      }

      next();
    } catch (error) {
      console.error("Rate limit error:", error);
      next(); // fail-open
    }
  };
};
