import mongoose from "mongoose";
import dotenv from "dotenv";
import { Mission } from "./models/Mission.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

async function checkDuplicates() {
    try {
        await mongoose.connect(MONGO_URI);
        const missions = await Mission.find({ title: /Tactical Protocol/i });
        console.log(`Found ${missions.length} missions matching "Tactical Protocol":`);
        missions.forEach(m => {
            console.log(`- ID: ${m._id}, Fee: ${m.entryFeeGtc}, Reward: ${m.rewardGtc}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDuplicates();
