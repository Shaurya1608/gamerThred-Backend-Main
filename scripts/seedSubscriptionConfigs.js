import mongoose from "mongoose";
import dotenv from "dotenv";
import { SubscriptionConfig } from "../models/SubscriptionConfig.js";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function seedSubscriptionConfigs() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("📦 Connected to MongoDB");

    // Clear existing to ensure update
    await SubscriptionConfig.deleteMany({});
    console.log("🧹 Cleared existing subscription configs");

    // Create Premium config
    await SubscriptionConfig.create({
      tier: "premium",
      priceInr: 249,
      missionLimit: 15,
      xpMultiplier: 1.5,
      displayName: "Tactical Premium",
      description: "Standard enhancement for field operatives seeking tactical edge.",
      benefits: [
        "Premium Profile Seal",
        "1.5x Stake XP Boost",
        "Unlock Weekly Gear",
        "Unlimited Daily GTC",
        "1 Monthly Drop Box"
      ],
      isActive: true
    });

    // Create Elite config
    await SubscriptionConfig.create({
      tier: "elite",
      priceInr: 499,
      missionLimit: 20,
      xpMultiplier: 2.0,
      displayName: "Elite Commander",
      description: "Maximum authorization, absolute control over the platform sectors.",
      benefits: [
        "Elite Animated Seal",
        "2.0x Double XP Boost",
        "Exclusive Special Access",
        "Unlimited Max GTC",
        "3 Monthly Drop Boxes"
      ],
      isActive: true
    });

    console.log("✅ Subscription configs seeded successfully!");
    console.log("   - Premium: ₹249, 15 missions, 1.5x XP");
    console.log("   - Elite: ₹499, 20 missions, 2.0x XP");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding subscription configs:", error);
    process.exit(1);
  }
}

seedSubscriptionConfigs();
