import mongoose from "mongoose";
import dotenv from "dotenv";
import { ProgressionConfig } from "../models/ProgressionConfig.js";

dotenv.config();

const seedProgression = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for seeding progression config...");

    await ProgressionConfig.deleteMany({ key: "default" });

    await ProgressionConfig.create({
      key: "default",
      levels: [
        { minLevel: 1, maxLevel: 10, xpPerLevel: 500 },    // Early grind
        { minLevel: 11, maxLevel: 25, xpPerLevel: 1500 },  // Mid-tier effort
        { minLevel: 26, maxLevel: 50, xpPerLevel: 4000 },  // Veteran territory
        { minLevel: 51, maxLevel: 100, xpPerLevel: 8000 }, // Elite level
        { minLevel: 101, maxLevel: 1000, xpPerLevel: 15000 }, // Legend status
      ],
    });

    console.log("Progression Config Seeded!");
    process.exit();
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedProgression();
