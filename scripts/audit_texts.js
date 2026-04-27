import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function findIllegalTexts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const suspectTerms = ['test', 'dummy', 'rainbow', 'clancy', 'lorem', 'trendiing', '4:20'];
        
        const Mission = mongoose.models.Mission || mongoose.model('Mission', new mongoose.Schema({ title: String }));
        const Game = mongoose.models.Game || mongoose.model('Game', new mongoose.Schema({ title: String }));

        console.log('\n--- Searching Missions ---');
        for (const term of suspectTerms) {
            const missions = await Mission.find({ title: new RegExp(term, 'i') }).lean();
            missions.forEach(m => console.log(`[Mission] Match "${term}": "${m.title}" (ID: ${m._id})`));
        }

        console.log('\n--- Searching Games ---');
        for (const term of suspectTerms) {
            const games = await Game.find({ title: new RegExp(term, 'i') }).lean();
            games.forEach(g => console.log(`[Game] Match "${term}": "${g.title}" (ID: ${g._id})`));
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

findIllegalTexts();
