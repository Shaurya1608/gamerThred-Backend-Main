import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';

dotenv.config();

async function triggerReferralReward() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📊 Connected to MongoDB\n');

    // 1. Find RIYA
    const referee = await User.findOne({ 
        $or: [
            { username: new RegExp('^riya$', 'i') }, 
            { email: 'riyas125j@gmail.com' }
        ] 
    });

    if (!referee) {
        console.log('❌ User RIYA not found!');
        process.exit(1);
    }

    console.log(`found user: ${referee.username} (Current Tier: ${referee.tier || 'None'})`);

    // 2. Set to Silver
    referee.tier = 'SILVER';
    referee.elo = 1200; // Minimum for Silver usually
    await referee.save();
    console.log(`✅ Promoted ${referee.username} to SILVER (ELO 1200)`);

    // 3. Process Reward
    if (!referee.referredBy) {
        console.log('⚠️ This user has NO referrer. No reward to give.');
        process.exit(0);
    }

    const referrer = await User.findById(referee.referredBy);
    if (!referrer) {
        console.log('❌ Referrer not found.');
        process.exit(0);
    }

    console.log(`Found Referrer: ${referrer.username}`);

    // Check idempotency
    const existingReward = await Transaction.findOne({
        source: `referral_rankup:${referee._id.toString()}`,
        type: "REFERRAL_BONUS"
    });

    if (existingReward) {
        console.log('⚠️ Reward ALREADY given for this user!');
    } else {
        // Give Reward
        console.log(`🎁 Awarding 50 Gems + 100 GTC to ${referrer.username}...`);
        
        referrer.gems = (referrer.gems || 0) + 50;
        referrer.gtc = (referrer.gtc || 0) + 100;
        referrer.verifiedReferrals = (referrer.verifiedReferrals || 0) + 1;
        await referrer.save();

        // Create Transaction
        await Transaction.create({
            userId: referrer._id,
            type: "REFERRAL_BONUS",
            amount: 50,
            currency: "GEMS",
            source: `referral_rankup:${referee._id}`
        });

        console.log('🎉 REWARD SUCCESSFUL!');
        console.log(`Referrer ${referrer.username} Verification Count: ${referrer.verifiedReferrals}`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

triggerReferralReward();
