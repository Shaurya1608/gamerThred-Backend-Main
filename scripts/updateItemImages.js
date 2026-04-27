import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function updateItems() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const Item = mongoose.models.Item || mongoose.model('Item', new mongoose.Schema({
            code: String,
            name: String,
            image: String
        }));

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

        for (const update of mapping) {
            const result = await Item.updateOne(
                { code: update.code },
                { $set: { image: update.image } }
            );
            console.log(`Updated ${update.code}: ${result.modifiedCount} modified`);
        }

        // Special case: Boxes also have codes in mysteryBoxController.js
        // If there are specific box codes like "COMMON_BOX", etc.
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

updateItems();
