import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WeekendMission } from './models/WeekendMission.js';

dotenv.config();

const fixMissionTiming = async () => {
    try {
        console.log("URI:", process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name).join(", "));

        const allMissions = await WeekendMission.find({}).lean();
        console.log(`Total Missions found: ${allMissions.length}`);
        
        const now = new Date();
        const mission = await WeekendMission.findOne({
            expiresAt: { $gte: now }
        }).sort({ startsAt: 1 });

        if (!mission) {
            console.log("No current or upcoming mission found with expiresAt >= now.");
            if (allMissions.length > 0) {
                console.log("Latest mission expires at:", allMissions[allMissions.length - 1].expiresAt);
                console.log("Now is:", now);
            }
        } else {
            console.log(`Current Mission: ${mission.title}`);
            console.log(`Current StartsAt: ${mission.startsAt}`);
            
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(now.getDate() - 2);
            
            mission.startsAt = twoDaysAgo;
            mission.status = 'active';
            await mission.save();
            
            console.log(`✅ Success! Mission "${mission.title}" now starts at: ${mission.startsAt}`);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("Fix failed:", err);
        process.exit(1);
    }
};

fixMissionTiming();
