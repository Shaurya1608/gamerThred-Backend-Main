import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';
import { generateReferralCode } from '../utils/referralUtils.js';

dotenv.config();

async function backfillReferralCodes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📊 Connected to MongoDB\n');

    // Find users without valid referral codes
    const usersWithoutCode = await User.find({
      $or: [
        { referralCode: { $exists: false } },
        { referralCode: null },
        { referralCode: "" }
      ]
    });

    console.log(`Found ${usersWithoutCode.length} users needing referral codes.`);

    for (const user of usersWithoutCode) {
      const newCode = generateReferralCode();
      
      // Use updateOne to bypass full validation of other fields
      await User.updateOne(
        { _id: user._id },
        { $set: { referralCode: newCode } }
      );
      
      console.log(`✅ Generated code for ${user.username}: ${newCode}`);
    }

    if (usersWithoutCode.length === 0) {
      console.log('✨ All users already have referral codes!');
    } else {
        console.log('\n🎉 Backfill complete! Refresh your dashboard.');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

backfillReferralCodes();
