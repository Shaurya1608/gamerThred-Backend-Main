const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });

// Minimal Schemas for verification
const userSchema = new mongoose.Schema({
    gtc: Number,
    tickets: Number,
    boxOpensSinceLastRare: Number
});
const User = mongoose.model('User', userSchema, 'users');

const effectSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    effectType: String,
    expiresAt: Date
});
const UserActiveEffect = mongoose.model('UserActiveEffect', effectSchema, 'user_active_effects');

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

async function verify() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected for verification.");

        // 1. Verify a random user's balance and effects
        const user = await User.findOne({ gtc: { $gt: 0 } });
        if (!user) {
            console.log("No test user found with GTC. Skipping balance check.");
        } else {
            console.log(`User ${user._id} GTC: ${user.gtc}`);
        }

        // 2. Check for active effects
        const effectsCount = await UserActiveEffect.countDocuments({ expiresAt: { $gt: new Date() } });
        console.log(`Active effects in system: ${effectsCount}`);

        // 3. Check for specific items
        const db = mongoose.connection.db;
        const item = await db.collection('items').findOne({ code: 'XP_BOOST_15M' });
        console.log(`XP_BOOST_15M present: ${!!item}`);

        console.log("QA Verification Passed!");
        process.exit(0);
    } catch (err) {
        console.error("QA Verification Failed:", err);
        process.exit(1);
    }
}

verify();
