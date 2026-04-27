import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config();

async function checkBalance() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Find Shenz and Riya
    const users = await User.find({
      username: { $in: [new RegExp('^shenz$', 'i'), new RegExp('^riya$', 'i')] }
    });

    users.forEach(u => {
        console.log(`User: ${u.username}`);
        console.log(`Tier: ${u.tier}`); // Should be SILVER for Riya
        console.log(`ELO: ${u.elo}`);
        console.log(`Gems: ${u.gems}`);
        console.log(`Verified Refs: ${u.verifiedReferrals}`);
        console.log('---');
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
  }
}

checkBalance();
