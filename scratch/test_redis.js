import dotenv from "dotenv";
dotenv.config();
import Redis from "ioredis";

async function test() {
    console.log("Testing Redis connection...");
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    console.log("Redis URL:", redisUrl ? redisUrl.split('@')[1] : "MISSING"); // Log host only for safety
    
    const isTls = redisUrl?.startsWith("rediss://");
    const redis = new Redis(redisUrl, {
        tls: {
            rejectUnauthorized: false,
            servername: redisUrl.split('@')[1].split(':')[0]
        }
    });

    try {
        console.log("Attempting to ping Redis...");
        const result = await redis.ping();
        console.log("✅ Redis Ping Result:", result);
        
        await redis.set("test_key", "Hello from Antigravity " + new Date().toISOString());
        const val = await redis.get("test_key");
        console.log("✅ Redis Set/Get Test:", val);
        
        await redis.quit();
        process.exit(0);
    } catch (error) {
        console.error("❌ Redis Test Failed:", error);
        process.exit(1);
    }
}

test();
