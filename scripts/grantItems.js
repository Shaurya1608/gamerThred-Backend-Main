import mongoose from "mongoose";
import dotenv from "dotenv";

// Load Env
dotenv.config({ path: "server/.env" });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

const grantItems = async () => {
    const targetEmail = process.argv[2];

    if (!targetEmail) {
        console.error("Usage: node -r dotenv/config server/scripts/grantItems.js <email>");
        process.exit(1);
    }

    try {
        console.log("Loading modules...");
        const { addItem } = await import("../services/inventoryService.js");
        const { User } = await import("../models/User.js");
        const { Item } = await import("../models/Item.js");

        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const user = await User.findOne({ email: targetEmail });
        if (!user) {
            console.error(`User not found: ${targetEmail}`);
            process.exit(1);
        }

        console.log(`Granting items to ${user.username}...`);

        // Ensure Items Exist
        const items = [
            { code: "RANK_PROTECTION", name: "Rank Protection Card", type: "protection", rarity: "rare", image: "https://cdn-icons-png.flaticon.com/512/942/942751.png" },
            { code: "XP_BOOST_2X_1H", name: "2X XP Boost", type: "booster", rarity: "epic", metadata: { multiplier: 2 }, image: "https://cdn-icons-png.flaticon.com/512/616/616490.png" },
            { code: "MYSTERY_BOX", name: "Mystery Box", type: "box", rarity: "legendary", image: "https://cdn-icons-png.flaticon.com/512/679/679720.png" }
        ];

        for (const i of items) {
           await Item.updateOne({ code: i.code }, { $set: i }, { upsert: true });
        }

        // Grant Items
        await addItem(user._id, "RANK_PROTECTION", 5, "admin_gift");
        await addItem(user._id, "XP_BOOST_2X_1H", 3, "admin_gift");
        await addItem(user._id, "MYSTERY_BOX", 1, "admin_gift");

        console.log("✅ Items Granted Successfully!");
        console.log("--------------------------------");
        console.log("5x Rank Protection Card");
        console.log("3x 2X XP Boost");
        console.log("1x Mystery Box");
        console.log("--------------------------------");
        console.log("Please refresh your Inventory page.");

        process.exit(0);

    } catch (error) {
        console.error("Grant Failed:", error);
        process.exit(1);
    }
};

grantItems();
