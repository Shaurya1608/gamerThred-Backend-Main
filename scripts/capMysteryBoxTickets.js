import mongoose from "mongoose";
import { MysteryBox } from "../models/MysteryBox.js";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

dotenv.config({ path: "server/.env" });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

const capTickets = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const boxes = await MysteryBox.find({});
        let updateCount = 0;

        for (const box of boxes) {
            let modified = false;
            box.rewards = box.rewards.map(reward => {
                if (reward.type === "TICKET" && reward.value > 2) {
                    console.log(`Capping reward in ${box.name}: ${reward.value} -> 2`);
                    reward.value = 2;
                    reward.name = "2 Tickets";
                    modified = true;
                }
                return reward;
            });

            if (modified) {
                await box.save();
                updateCount++;
            }
        }

        console.log(`Update complete. ${updateCount} boxes modified.`);
        process.exit(0);

    } catch (error) {
        console.error("Migration Error:", error);
        process.exit(1);
    }
};

capTickets();
