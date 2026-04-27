const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

const items = [
    {
        code: "XP_BOOST_15M",
        name: "15m XP Boost",
        description: "Increases XP gain by 50% for 15 minutes.",
        type: "booster",
        rarity: "common",
        metadata: { multiplier: 1.5, durationMinutes: 15 }
    },
    {
        code: "GTC_BOOST_2X_10M",
        name: "10m 2x GTC Boost",
        description: "Doubles GTC rewards for 10 minutes.",
        type: "booster",
        rarity: "rare",
        metadata: { multiplier: 2, durationMinutes: 10 }
    },
    {
        code: "GTC_BOOST_2X_30M",
        name: "30m 2x GTC Boost",
        description: "Doubles GTC rewards for 30 minutes.",
        type: "booster",
        rarity: "rare",
        metadata: { multiplier: 2, durationMinutes: 30 }
    },
    {
        code: "RETRY_CARD",
        name: "Mission Retry Card",
        description: "Allows you to retry a failed mission without losing progress.",
        type: "protection",
        rarity: "rare",
        metadata: {}
    },
    {
        code: "RANK_PROTECTION",
        name: "Rank Protection",
        description: "Protects your rank from falling after a loss.",
        type: "protection",
        rarity: "epic",
        metadata: { durationMinutes: 5 }
    },
    {
        code: "FRAME_BASIC",
        name: "Basic Avatar Frame",
        description: "A simple bronze frame for your profile.",
        type: "cosmetic",
        rarity: "rare",
        metadata: { slot: "frame" }
    },
    {
        code: "FRAME_ELITE",
        name: "Elite Avatar Frame",
        description: "A premium silver frame for elite players.",
        type: "cosmetic",
        rarity: "epic",
        metadata: { slot: "frame" }
    },
    {
        code: "TITLE_LEGEND",
        name: "Legendary Title",
        description: "A prestigious title to show off your status.",
        type: "cosmetic",
        rarity: "legendary",
        metadata: { slot: "title" }
    }
];

async function seed() {
    try {
        console.log("Connecting...");
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;
        const collection = db.collection('items');

        for (const item of items) {
            console.log(`Upserting ${item.code}...`);
            await collection.updateOne(
                { code: item.code },
                { $set: item },
                { upsert: true }
            );
        }

        console.log("Done!");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seed();
