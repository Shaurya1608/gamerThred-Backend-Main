import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/User.js";
import { MatchmakingQueue } from "../models/MatchmakingQueue.js";
import { ArenaChallenge } from "../models/ArenaChallenge.js";

dotenv.config();

async function cleanup() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    try {
        if (!MONGO_URI) throw new Error("MONGO_URI not found");
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB for cleanup...");

        // Define patterns
        const usernameQuery = {
            $or: [
                { username: /^bot_/i },
                { username: /^U_/i },
                { email: /@test\.com$/i }
            ]
        };

        // 1. Identify users to be deleted
        const dummyUsers = await User.find(usernameQuery).select("_id");
        const dummyIds = dummyUsers.map(u => u._id);

        console.log(`Phase 1: Found ${dummyIds.length} dummy users.`);

        if (dummyIds.length > 0) {
            // 2. Delete associated MatchmakingQueue entries
            const qResult = await MatchmakingQueue.deleteMany({ userId: { $in: dummyIds } });
            console.log(`Phase 2: Deleted ${qResult.deletedCount} queue entries.`);

            // 3. Delete ArenaChallenges involving these users
            const aResult = await ArenaChallenge.deleteMany({ 
                $or: [
                    { player1: { $in: dummyIds } },
                    { player2: { $in: dummyIds } }
                ]
            });
            console.log(`Phase 3: Deleted ${aResult.deletedCount} arena challenges.`);

            // 4. Finally, delete the users
            const uResult = await User.deleteMany({ _id: { $in: dummyIds } });
            console.log(`Phase 4: Deleted ${uResult.deletedCount} dummy users.`);
        } else {
            console.log("No dummy users found matching patterns.");
        }

        // 5. Hard clear queue just in case
        await MatchmakingQueue.deleteMany({});
        console.log("Phase 5: MatchmakingQueue hard-cleared.");

        console.log("\nCleanup Complete!");
        process.exit(0);

    } catch (error) {
        console.error("Cleanup Failed:", error);
        process.exit(1);
    }
}

cleanup();
