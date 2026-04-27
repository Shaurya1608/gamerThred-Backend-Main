import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const updateMission = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        const collection = db.collection('weekendmissions');

        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const result = await collection.updateMany(
            { expiresAt: { $gte: new Date() } },
            { 
                $set: { 
                    startsAt: twoDaysAgo,
                    status: 'active'
                } 
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} missions to be active and starting in the past.`);
        
        // Let's also verify
        const activeMissions = await collection.find({ expiresAt: { $gte: new Date() } }).toArray();
        console.log("\nCurrent Active Missions:");
        activeMissions.forEach(m => {
            console.log(`- ID: ${m._id}`);
            console.log(`  Title: ${m.title}`);
            console.log(`  Status: ${m.status}`);
            console.log(`  StartsAt: ${m.startsAt}`);
            console.log(`  ExpiresAt: ${m.expiresAt}`);
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("Update failed:", err);
        process.exit(1);
    }
};

updateMission();
