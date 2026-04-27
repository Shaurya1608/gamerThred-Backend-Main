const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

const mapping = [
    { code: "XP_BOOST_15M", image: "/assets/images/items/xp_boost_15m.png" },
    { code: "GTC_BOOST_2X_10M", image: "/assets/images/items/gtc_boost_10m.png" },
    { code: "GTC_BOOST_2X_30M", image: "/assets/images/items/gtc_boost_30m.png" },
    { code: "RETRY_CARD", image: "/assets/images/items/retry_card.png" },
    { code: "RANK_PROTECTION", image: "/assets/images/items/rank_protection.png" },
    { code: "FRAME_BASIC", image: "/assets/images/items/frame_basic.png" },
    { code: "FRAME_ELITE", image: "/assets/images/items/frame_elite.png" },
    { code: "TITLE_LEGEND", image: "/assets/images/items/title_legend.png" },
    { code: "MYSTERY_BOX", image: "/assets/images/items/mystery_box.png" }
];

async function updateItems() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;
        const collection = db.collection('items');

        for (const update of mapping) {
            console.log(`Updating ${update.code}...`);
            const result = await collection.updateOne(
                { code: update.code },
                { $set: { image: update.image } }
            );
            console.log(`Result for ${update.code}: ${result.modifiedCount} modified, ${result.upsertedCount} upserted`);
        }

        console.log("Success! All item images updated.");
        process.exit(0);
    } catch (err) {
        console.error("Error updating items:", err);
        process.exit(1);
    }
}

updateItems();
