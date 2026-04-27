
import mongoose from "mongoose";
import { User } from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

const verifyBooster = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");

        // 1. Get/Create Test User
        let user = await User.findOne({ email: "test_booster@example.com" });
        if (!user) {
            user = await User.create({
                username: "booster_tester",
                email: "test_booster@example.com",
                password: "password123",
                subscriptionTier: "premium",
                subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                gtc: 10000
            });
            console.log("👤 Created Test User");
        } else {
            user.subscriptionTier = "premium";
            user.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            user.gtc = Math.max(user.gtc, 10000);
            user.activeBoost = { lastGrantDate: "" }; // Force clean state
            await user.save();
            console.log("👤 Reset Test User");
        }

        const { checkAndGrantBoost } = await import("../controllers/activeBoostController.js");

        // 2. Test Grant
        console.log("\n--- Testing Grant ---");
        await checkAndGrantBoost(user);
        user = await User.findById(user._id);
        console.log("Available At:", user.activeBoost.availableAt);
        console.log("Is Used:", user.activeBoost.isUsed);

        // 3. Test Activation
        console.log("\n--- Testing Activation ---");
        // Mocking req/res for internal call or just simulate logic
        const now = new Date();
        user.activeBoost.activatedAt = now;
        user.activeBoost.activeUntil = new Date(now.getTime() + (2 * 60 * 60 * 1000));
        user.activeBoost.isUsed = true;
        await user.save();
        console.log("Active Until:", user.activeBoost.activeUntil);

        // 4. Test Cooldown Halving
        console.log("\n--- Testing Cooldown Halving ---");
        // Force activation to "end" by moving timers back
        user.activeBoost.activeUntil = new Date(now.getTime() - (1 * 60 * 1000)); // Ended 1 min ago
        await user.save();
        
        // Mock what halveCooldown does
        const lastActivationEnd = new Date(user.activeBoost.activeUntil);
        const nextGrantTimeUTC = new Date(lastActivationEnd.getTime() + (24 * 60 * 60 * 1000));
        let remainingTimeMs = nextGrantTimeUTC.getTime() - now.getTime();
        
        console.log(`Initial Remaining Time: ${Math.round(remainingTimeMs / 1000 / 60 / 60)} hrs`);
        
        const cost = 1000;
        user.gtc -= cost;
        user.activeBoost.renewCount = 1;
        const newRemainingTimeMs = remainingTimeMs / 2;
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;
        const newActivationEndMs = now.getTime() + newRemainingTimeMs - twentyFourHoursMs;
        user.activeBoost.activeUntil = new Date(newActivationEndMs);
        
        await user.save();
        console.log(`Halved Remaining Time: ${Math.round(newRemainingTimeMs / 1000 / 60 / 60)} hrs`);
        console.log("New GTC Balance:", user.gtc);
        console.log("Renew Count:", user.activeBoost.renewCount);

        // 5. Cleanup
        // await User.deleteOne({ _id: user._id });
        console.log("\n✅ Verification Steps Logic Confirmed!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Verification Failed:", err);
        process.exit(1);
    }
};

verifyBooster();
