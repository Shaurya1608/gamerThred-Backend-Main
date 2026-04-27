import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';
import fs from 'fs';

dotenv.config();

async function findUserByUsername() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const username = 'neha';
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    });
    
    const output = [];
    output.push('=== USER SEARCH RESULTS ===\n');
    
    if (!user) {
      output.push(`No user found with username: ${username}`);
      output.push('\nThis username should be available!');
    } else {
      output.push('User found:');
      output.push(`Username: ${user.username}`);
      output.push(`Email: ${user.email}`);
      output.push(`Verified: ${user.isVerified}`);
      output.push(`Created: ${user.createdAt}`);
      output.push(`Onboarding Completed: ${user.onboardingCompleted}`);
      output.push(`Role: ${user.role}`);
      output.push(`User ID: ${user._id}`);
    }
    
    const result = output.join('\n');
    console.log(result);
    fs.writeFileSync('user_search_result.txt', result);
    console.log('\n✅ Results saved to user_search_result.txt');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findUserByUsername();
