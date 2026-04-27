import mongoose from "mongoose";
import dotenv from "dotenv";
import { WeekendMission } from "./models/WeekendMission.js";

dotenv.config();

const seedWeekendMission = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Set start time to 1 minute ago and end time to 2 days from now
        const startsAt = new Date();
        startsAt.setMinutes(startsAt.getMinutes() - 1);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 2);

        await WeekendMission.deleteMany({ title: "Test Weekend Mission" });

        const mission = await WeekendMission.create({
            title: "Test Weekend Mission",
            description: "Work together to complete 50 missions this weekend for Loyalty Credit rewards!",
            targetMissions: 50,
            startsAt,
            expiresAt,
            rewardConfig: {
                baseGems: 10,
                perMissionGems: 1,
                capGems: 30
            },
            status: "active"
        });

        console.log("Weekend Mission seeded successfully:", mission.title);
        process.exit(0);
    } catch (err) {
        console.error("Seeding failed:", err);
        process.exit(1);
    }
}

seedWeekendMission();
