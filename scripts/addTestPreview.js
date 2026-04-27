import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function addPreview() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const MovieUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
        
        // Find existing games
        const games = await mongoose.connection.collection('games').find({}).toArray();
        if (games.length === 0) {
            console.log("No games found to update.");
            return;
        }

        // Update the first active game
        const result = await mongoose.connection.collection('games').updateOne(
            { _id: games[0]._id },
            { $set: { previewUrl: MovieUrl } }
        );

        console.log(`Success! Updated "${games[0].title}" with a preview video.`);
    } catch (err) {
        console.error("Update failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

addPreview();
