/**
 * 🚀 Gamet Scalability Seeding Script
 * Use this to test the extreme scalability of the platform.
 * It will populate the database with dummy games, rewards, and chat messages.
 * 
 * Usage:
 * 1. Ensure your MongoDB is running.
 * 2. Run: node seed-scalability.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Game } from './models/Game.js';
import { Reward } from './models/Reward.js';
import { Message } from './models/Message.js';
import { User } from './models/User.js';
import { Community } from './models/Community.js';

dotenv.config();

const SEED_CONFIG = {
    gamesCount: 50,
    rewardsCount: 100,
    messagesCount: 60, // Above the 50 limit to trigger "Load More"
};

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) {
            console.error("❌ Error: MONGO_URI is not defined in .env file.");
            process.exit(1);
        }
        await mongoose.connect(uri);
        console.log("✅ Database Connected for Seeding");
    } catch (err) {
        console.error("❌ DB Connection Error:", err.message);
        process.exit(1);
    }
};

const seedGames = async () => {
    console.log(`🎮 Seeding ${SEED_CONFIG.gamesCount} Games...`);
    const games = [];
    for (let i = 1; i <= SEED_CONFIG.gamesCount; i++) {
        games.push({
            title: `Scale Test Game ${i}`,
            description: `Auto-generated game for scalability testing #${i}`,
            gameKey: `test_game_${i}`,
            gameUrl: `https://example.com/game/${i}`,
            image: `https://picsum.photos/seed/${i}/400/300`,
            isActive: true,
            onHomePage: i <= 10
        });
    }
    await Game.insertMany(games);
    console.log("✅ Games Seeded");
};

const seedRewards = async () => {
    console.log(`🎁 Seeding ${SEED_CONFIG.rewardsCount} Rewards...`);
    const categories = ['Daily', 'Special', 'Weekly'];
    const rewards = [];
    for (let i = 1; i <= SEED_CONFIG.rewardsCount; i++) {
        rewards.push({
            title: `Ultimate Prize #${i}`,
            description: `This is a scalable test reward item number ${i}.`,
            priceGtc: Math.floor(Math.random() * 1000),
            stock: Math.floor(Math.random() * 100),
            category: categories[Math.floor(Math.random() * categories.length)],
            imageUrl: `https://picsum.photos/seed/reward${i}/300/300`,
            isActive: true
        });
    }
    await Reward.insertMany(rewards);
    console.log("✅ Rewards Seeded");
};

const seedMessages = async () => {
    console.log(`💬 Seeding Chat Messages to ALL communities...`);
    const communities = await Community.find();
    const user = await User.findOne();

    if (communities.length === 0 || !user) {
        console.warn("⚠️ Skip message seeding: No communities or user found.");
        return;
    }

    for (const community of communities) {
        console.log(`   - Seeding to "${community.name}"...`);
        const messages = [];
        for (let i = 1; i <= SEED_CONFIG.messagesCount; i++) {
            messages.push({
                content: `Historical Transmission #${i} in ${community.name} - Testing Scalability`,
                sender: user._id,
                community: community._id,
                type: "text",
                createdAt: new Date(Date.now() - (SEED_CONFIG.messagesCount - i) * 60000)
            });
        }
        await Message.insertMany(messages);
    }
    console.log(`✅ Chat seeding complete for ${communities.length} communities.`);
};

const run = async () => {
    await connectDB();
    
    // 🧹 Clear existing test data to prevent Duplicate Key errors
    console.log("🧹 Cleaning up old scalability test data...");
    await Game.deleteMany({ gameKey: { $regex: 'test_game_' } });
    await Reward.deleteMany({ title: { $regex: 'Ultimate Prize' } });
    await Message.deleteMany({ content: { $regex: 'Testing Scalability' } });

    // Seed and provide instructions
    await seedGames();
    await seedRewards();
    await seedMessages();

    console.log("\n🚀 Seeding Complete!");
    console.log("💡 Tip: To see the 'Load Older' button, ensure you are in the community room where we just seeded messages.");
    process.exit(0);
};

run();
