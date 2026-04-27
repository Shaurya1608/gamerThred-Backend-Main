
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const arenaChallengeSchema = new mongoose.Schema({
    challenger: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    opponent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: String,
    challengerFinished: Boolean,
    opponentFinished: Boolean,
    challengerScore: Number,
    opponentScore: Number,
    winner: mongoose.Schema.Types.ObjectId,
    updatedAt: Date
}, { timestamps: true });

const userSchema = new mongoose.Schema({
    username: String
});

const ArenaChallenge = mongoose.model("ArenaChallenge", arenaChallengeSchema);
const User = mongoose.model("User", userSchema);

async function checkChallenges() {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error("MONGO_URI not found in env");
        
        await mongoose.connect(uri);
        console.log("Connected to DB");
        
        const latest = await ArenaChallenge.find()
            .sort({ updatedAt: -1 })
            .limit(10)
            .populate("challenger", "username")
            .populate("opponent", "username");
            
        console.log(`Latest 10 Arena challenges:`);
        latest.forEach(c => {
            console.log(`ID: ${c._id}`);
            console.log(`  Players: ${c.challenger?.username} vs ${c.opponent?.username}`);
            console.log(`  Status: ${c.status}`);
            console.log(`  Finished: C:${c.challengerFinished} (${c.challengerScore}) | O:${c.opponentFinished} (${c.opponentScore})`);
            console.log(`  Winner: ${c.winner}`);
            console.log(`  Updated: ${c.updatedAt}`);
            console.log('-------------------');
        });
        
        await mongoose.disconnect();
    } catch (err) {
        console.error("DB check failed:", err.message);
    }
}

checkChallenges();
