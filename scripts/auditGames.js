import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Game } from './models/Game.js';

dotenv.config();

async function audit() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const gamesDir = '../frontend/public/games';
    const folders = fs.readdirSync(gamesDir).filter(f => fs.statSync(path.join(gamesDir, f)).isDirectory() && f !== 'sdk');
    
    const dbGames = await Game.find({});
    const dbKeys = dbGames.map(g => g.gameKey);
    
    const missingInDB = folders.filter(f => !dbKeys.includes(f));
    const missingInFolders = dbKeys.filter(k => !folders.includes(k));
    
    const results = {
      folders,
      dbGames: dbGames.map(g => ({ title: g.title, gameKey: g.gameKey, _id: g._id })),
      missingInDB,
      missingInFolders
    };
    
    fs.writeFileSync('audit_results.json', JSON.stringify(results, null, 2));
    console.log('Results written to audit_results.json');
    
    process.exit(0);
  } catch (err) {
    console.error('Audit failed:', err);
    process.exit(1);
  }
}

audit();
