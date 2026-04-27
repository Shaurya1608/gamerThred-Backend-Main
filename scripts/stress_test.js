import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/User.js";
import { MatchmakingQueue } from "../models/MatchmakingQueue.js";
import { Game } from "../models/Game.js";
import { ArenaChallenge } from "../models/ArenaChallenge.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

/**
 * Scalability Stress Test Script v2.0
 * Features: Variable Load, Sustained Mode, Event Loop Monitoring
 */
async function runStressTest() {
    const args = process.argv.slice(2);
    const userCount = parseInt(args.find(a => a.startsWith("--users="))?.split("=")[1]) || 1000;
    const isSustained = args.includes("--sustained");
    
    console.log(`🚀 Starting Scalability Stress Test [${isSustained ? "SUSTAINED" : "BURST"}]`);
    console.log(`👥 Target Users: ${userCount}`);
    
    try {
        if (!MONGO_URI) throw new Error("MONGODB_URI is not defined in .env");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");

        const game = await Game.findOne({ isActive: true });
        if (!game) throw new Error("No active game found");

        await MatchmakingQueue.deleteMany({});
        console.log("🧹 MatchmakingQueue cleared");

        // 1. POOL PREPARATION
        let testPool = await User.find({ status: "active" }).limit(userCount).select("_id elo username").lean();
        if (testPool.length < userCount) {
            console.log(`👤 Creating ${userCount - testPool.length} dummy users...`);
            const dummies = [];
            for (let i = 0; i < (userCount - testPool.length); i++) {
                dummies.push({
                    username: `bot_${Math.random().toString(36).substring(2, 7)}_${i}`,
                    email: `bot_${Date.now()}_${i}@test.com`,
                    password: "password123",
                    status: "active",
                    elo: 1000 + Math.floor(Math.random() * 500)
                });
            }
            await User.insertMany(dummies);
            testPool = await User.find({ status: "active" }).limit(userCount).select("_id elo username").lean();
        }

        // 2. RESOURCE & EVENT LOOP MONITORING
        let maxLag = 0;
        let lastTime = Date.now();
        const lagInterval = setInterval(() => {
            const now = Date.now();
            const lag = now - lastTime - 100; // Expected 100ms
            if (lag > maxLag) maxLag = lag;
            lastTime = now;
        }, 100);

        // 3. INJECTION TRACKING
        const activeInQueue = new Set();
        const blast = async (pool) => {
            const startWrite = performance.now();
            
            // Filter out users already in queue
            const candidates = pool.filter(u => !activeInQueue.has(u._id.toString()));
            if (candidates.length === 0) return 0;

            const entries = candidates.map(u => ({
                userId: u._id,
                username: u.username,
                gameId: game._id,
                elo: u.elo || 1200,
                wager: 10,
                status: "waiting",
                joinedAt: new Date()
            }));

            // Track locally
            candidates.forEach(u => activeInQueue.add(u._id.toString()));

            try {
                await MatchmakingQueue.insertMany(entries, { ordered: false });
            } catch (err) {
                // Ignore duplicate keys in stress test
            }
            return performance.now() - startWrite;
        };

        const startTime = Date.now();
        let mongoWriteLatency = await blast(testPool);
        console.log(`⚡ Blasted ${userCount} users into queue. Initial Write: ${mongoWriteLatency.toFixed(2)}ms`);

        // 4. MONITORING LOOP
        let lastMatches = 0;
        let cumulativeCpuUsage = process.cpuUsage();
        
        const monitorInterval = setInterval(async () => {
            // Update local tracking from DB truth (users that were matched and deleted are gone)
            const currentInQueue = await MatchmakingQueue.find({}).select("userId").lean();
            activeInQueue.clear();
            currentInQueue.forEach(doc => activeInQueue.add(doc.userId.toString()));

            const waiting = await MatchmakingQueue.countDocuments({ status: "waiting" });
            const processing = await MatchmakingQueue.countDocuments({ status: "processing" });
            const totalMatches = await ArenaChallenge.countDocuments({ createdAt: { $gt: new Date(startTime) } });
            
            const matchesDiff = totalMatches - lastMatches;
            lastMatches = totalMatches;

            // CPU calculation
            const cpuUsage = process.cpuUsage(cumulativeCpuUsage);
            cumulativeCpuUsage = process.cpuUsage();
            const cpuPercent = ((cpuUsage.user + cpuUsage.system) / (2000 * 1000)).toFixed(1); 

            // Memory
            const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

            console.log(`[Stats] Waiting: ${waiting} | Processing: ${processing} | Matches: ${totalMatches} (+${matchesDiff})`);
            console.log(`[Health] CPU: ${cpuPercent}% | Mem: ${memUsage}MB | Max Lag: ${maxLag}ms | Last DB Write: ${mongoWriteLatency.toFixed(2)}ms`);

            // SUSTAINED MODE: Re-inject users not in queue
            if (isSustained) {
                const freeUsers = testPool.filter(u => !activeInQueue.has(u._id.toString())).slice(0, 300); // Inject in chunks
                if (freeUsers.length > 0) {
                    mongoWriteLatency = await blast(freeUsers).catch(e => 0);
                }
            }

            if (!isSustained && waiting === 0 && processing === 0) {
                clearInterval(monitorInterval);
                clearInterval(lagInterval);
                const totalTime = (Date.now() - startTime) / 1000;
                console.log(`\n✅ BURST TEST COMPLETE`);
                console.log(`⏱️ Total Time: ${totalTime.toFixed(2)}s`);
                console.log(`🎯 Throughput: ${(userCount / totalTime).toFixed(2)} users/sec`);
                console.log(`🔥 Peak Event Loop Lag: ${maxLag}ms`);
                console.log(`💾 Final Heap: ${memUsage}MB`);
                process.exit(0);
            }
        }, 2000);

        if (isSustained) {
            console.log("⏳ Sustained mode active. Run for 10 minutes or Ctrl+C to stop.");
            setTimeout(() => {
                console.log("🏁 Sustained test time limit reached.");
                process.exit(0);
            }, 600000); // 10 minutes
        }

    } catch (error) {
        console.error("❌ Test Failed:", error.message);
        process.exit(1);
    }
}

runStressTest();
