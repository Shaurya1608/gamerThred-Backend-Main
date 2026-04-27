import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/User.js';
import { MissionSession } from './models/MissionSession.js';

dotenv.config();

const syncStats = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const users = await User.find({});
        console.log(`Syncing stats for ${users.length} users...`);

        for (const user of users) {
            // 1. Regular Missions
            const totalRegular = await MissionSession.countDocuments({ userId: user._id });
            const completedRegular = await MissionSession.countDocuments({ 
                userId: user._id, 
                status: 'completed' 
            });

            // 2. Weekend Missions (Approximate from total contributions if stored, or just finalized ones)
            // For now, let's keep it simple with regular missions + any weekend data we can find.
            // If historical weekend data is only in Redis, we can't sync past ones easily unless they were finalized in MongoDB.
            
            // Just update with what we have in MongoDB
            user.totalMissions = totalRegular;
            user.completedMissions = completedRegular;
            
            await user.save();
            console.log(`Updated ${user.username}: Total=${user.totalMissions}, Completed=${user.completedMissions}`);
        }

        console.log('Sync complete!');
        process.exit(0);
    } catch (err) {
        console.error('Sync failed:', err);
        process.exit(1);
    }
};

syncStats();
