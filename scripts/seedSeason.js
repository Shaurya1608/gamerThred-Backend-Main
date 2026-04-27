import mongoose from "mongoose";
import dotenv from "dotenv";
import { Season } from "./models/Season.js";

dotenv.config();

const seedSeason = async () => {
    try {
        const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/gamet";
        console.log(`Connecting to: ${uri.substring(0, 20)}...`);
        
        await mongoose.connect(uri);
        
        console.log("Cleaning old seasons...");
        await Season.deleteMany({}); // Clear existing

        console.log("Creating Season 1...");
        await Season.create({
            number: 1,
            name: "Rise of Paradise",
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            isActive: true,
            themeColor: "#EF4444"
        });

        console.log("Season 1 initialized successfully! 🛡️");
        process.exit(0);
    } catch (err) {
        console.error("❌ Seeding failed:", err.message);
        process.exit(1);
    }
};

seedSeason();
