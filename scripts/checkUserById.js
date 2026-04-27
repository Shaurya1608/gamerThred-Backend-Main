import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config();

async function checkUserById() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Find user with ID starting with 6973
    // Since _id is ObjectId, we might need to find all and filter or just look for the one created recently if we can guess.
    // Or just list ALL users and their codes.
    
    const users = await User.find({});
    
    console.log(`Checking ${users.length} users...`);
    
    users.forEach(u => {
        const idStr = u._id.toString();
        if (idStr.startsWith('6973')) {
            console.log(`found target user!`);
            console.log(`ID: ${idStr}`);
            console.log(`Username: ${u.username}`);
            console.log(`Referral Code: '${u.referralCode}'`); // Check for empty string or null
            console.log(`Type: ${typeof u.referralCode}`);
        }
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
  }
}

checkUserById();
