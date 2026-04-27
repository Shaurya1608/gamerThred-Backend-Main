import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { ProgressionConfig } from "../models/ProgressionConfig.js";
import { User } from "../models/User.js";

const checkProgression = async () => {
  await connectDB();
  
  const config = await ProgressionConfig.findOne({ key: "default" });
  if (!config) {
    console.log("No dynamic config found. Using fallback: 500 XP needed for Level 6.");
    await updatePlayer(500);
  } else {
    console.log("Found dynamic config:", JSON.stringify(config.levels, null, 2));
    
    let totalXpNeeded = 0;
    let currentLevel = 1;
    const targetLevel = 6;
    
    for (const tier of config.levels) {
        const tierSize = tier.maxLevel - tier.minLevel + 1;
        for (let i = 0; i < tierSize; i++) {
            if (currentLevel >= targetLevel) break;
            totalXpNeeded += tier.xpPerLevel;
            currentLevel++;
        }
        if (currentLevel >= targetLevel) break;
    }
    
    console.log(`To reach Level ${targetLevel}, player needs ${totalXpNeeded} total XP.`);
    await updatePlayer(totalXpNeeded);
  }
  
  process.exit(0);
};

const updatePlayer = async (xp) => {
  const username = "taniya";
  const user = await User.findOneAndUpdate(
    { username: new RegExp(`^${username}$`, 'i') },
    { $set: { xp: xp } },
    { new: true }
  );
  
  if (user) {
    console.log(`✅ Success! Player ${user.username} updated to ${user.xp} XP.`);
  } else {
    console.log(`❌ Error: Player "${username}" not found.`);
  }
};

checkProgression();
