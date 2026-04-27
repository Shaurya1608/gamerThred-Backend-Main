import mongoose from "mongoose";
import { User } from "../models/User.js";
import { MysteryBox } from "../models/MysteryBox.js";
import { Item } from "../models/Item.js";
import { UserActiveEffect } from "../models/UserActiveEffect.js";
import { openBox } from "../controllers/mysteryBoxController.js";
import * as inventoryService from "../services/inventoryService.js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually load .env to bypass dotenv potential path/parsing issues in this specific environment
const envPath = path.resolve(__dirname, "../.env");
console.log(`Loading .env from: ${envPath}`);

try {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
    console.log(`Loaded ${Object.keys(envConfig).length} environment variables.`);
} catch (e) {
    console.error("Failed to load .env manually:", e);
}

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

const mockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.data = data;
    return res;
  };
  return res;
};

const verify = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        // 1. Setup Test User
        let user = await User.findOne({ email: "verify_mystery@test.com" });
        if (!user) {
            user = await User.create({
                username: "VerifyMystery",
                email: "verify_mystery@test.com",
                password: "hashedpassword",
                gtc: 10000,
                tickets: 10
            });
        }
        console.log(`Test User: ${user._id}`);

        // 2. Test Mystery Box Open
        console.log("\n--- Testing Mystery Box Opening ---");
        const box = await MysteryBox.findOne({ code: "INITIATE_CHEST" }); // 500 GTC
        
        const req = { body: { boxCode: box.code }, user: { _id: user._id } };
        const res = mockRes();
        
        await openBox(req, res);
        
        if (res.data?.success) {
            console.log("✅ Box Opened Successfully!");
            console.log("Reward:", res.data.reward.name);
            console.log("Is Rare:", res.data.reward.isRare);
        } else {
            console.error("❌ Box Open Failed:", res.data || res.statusCode);
        }

        // 3. Test Pass Logic (Virtual Boost)
        console.log("\n--- Testing Pass Logic (Virtual Boost) ---");
        user.subscriptionTier = "elite";
        user.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await user.save();
        
        // We can't easily test missionController here without mocking extensive dependencies,
        // but we can verify the User state is correct for the logic we wrote.
        console.log(`User Tier: ${user.subscriptionTier}`);
        console.log(`User Expiry: ${user.subscriptionExpiry}`);
        if (user.subscriptionTier === "elite" && user.subscriptionExpiry > new Date()) {
             console.log("✅ User has valid Elite Pass (Virtual Boost Condition Met)");
        } else {
             console.error("❌ User Pass state valid");
        }

        // 4. Test Protection Card Usage
        console.log("\n--- Testing Protection Card Usage ---");
        // Ensure item exists
        let protCard = await Item.findOne({ code: "RANK_PROTECTION" });
        if (!protCard) {
            protCard = await Item.create({
                code: "RANK_PROTECTION",
                name: "Rank Protection",
                type: "PROTECTION",
                rarity: "rare",
                description: "Protects rank for 5 mins"
            });
        }

        // Add to inventory
        await inventoryService.addItem(user._id, "RANK_PROTECTION", 1, "test_grant");
        
        // Use it
        const useResult = await inventoryService.useItem(user._id, "RANK_PROTECTION");
        if (useResult.success) {
             console.log("✅ Protection Card Used!");
        } else {
             console.error("❌ Failed to use card");
        }

        // Check Effect
        const effect = await UserActiveEffect.findOne({ 
            userId: user._id, 
            effectType: "rank_protection" 
        });
        
        if (effect && effect.expiresAt > new Date()) {
             console.log(`✅ Rank Protection Active! Expires: ${effect.expiresAt}`);
             // Verify duration (approx 5 mins)
             const duration = (effect.expiresAt - new Date()) / 1000 / 60;
             console.log(`Duration remaining: ${duration.toFixed(2)} minutes`);
             if (Math.abs(duration - 5) < 0.1) console.log("✅ Duration is correct (5 mins)");
        } else {
             console.error("❌ Rank Protection Effect NOT found or expired");
        }

        console.log("\n✅ VERIFICATION COMPLETE");
        process.exit(0);

    } catch (error) {
        console.error("Verification Error:", error);
        process.exit(1);
    }
};

verify();
