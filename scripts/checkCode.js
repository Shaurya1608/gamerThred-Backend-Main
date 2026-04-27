import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config();

async function checkNehaCode() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Check both potential usernames (case insensitive)
    const users = await User.find({
      username: { $in: [new RegExp('^neha$', 'i'), new RegExp('^harsh$', 'i')] }
    });

    console.log('--- User Check ---');
    users.forEach(u => {
        console.log(`User: ${u.username}`);
        console.log(`Code: ${u.referralCode || 'MISSING'}`);
        console.log(`Verified Refs: ${u.verifiedReferrals}`);
        console.log('---');
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
  }
}

checkNehaCode();
