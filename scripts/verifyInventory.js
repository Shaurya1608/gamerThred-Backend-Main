import mongoose from "mongoose";
import dotenv from "dotenv";

// Load Env BEFORE importing services that use it
// Point to the server/.env file since we execute from root
dotenv.config({ path: "server/.env" });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

const verifyInventory = async () => {
    try {
        console.log("Loading modules...");
        // Dynamic imports to ensure env vars are loaded first
        const { addItem, useItem, getInventory } = await import("../services/inventoryService.js");
        const { User } = await import("../models/User.js");
        const { Item } = await import("../models/Item.js");

        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        // 1. Ensure Items Exist (Seed Master Items)
        const items = [
            { code: "RANK_PROTECTION", name: "Rank Protection Card", type: "protection", rarity: "rare" },
            { code: "XP_BOOST_2X_1H", name: "2X XP Boost", type: "booster", rarity: "epic", metadata: { multiplier: 2 } }
        ];

        for (const i of items) {
           await Item.updateOne({ code: i.code }, { $set: i }, { upsert: true });
        }
        console.log("Master Items Seeded");

        // 2. Get a Test User
        let user = await User.findOne();
        if (!user) {
            console.log("No user found, creating dummy user...");
            user = await User.create({
                username: "InventoryTester",
                email: "test@inventory.com",
                password: "password123",
                gtc: 1000
            });
        }
        console.log(`Testing with User: ${user.username} (${user._id})`);

        // 3. Test Add Item
        console.log("Adding 5 Rank Protection Cards...");
        await addItem(user._id, "RANK_PROTECTION", 5, "admin_gift");
        console.log("Added.");

        // 4. Test Get Inventory
        console.log("Fetching Inventory...");
        const inv = await getInventory(user._id);
        console.log("Inventory State:", JSON.stringify(inv, null, 2));

        // 5. Test Use Item
        console.log("Using 1 Rank Protection Card...");
        const useResult = await useItem(user._id, "RANK_PROTECTION", 1);
        console.log("Use Result:", useResult);

        // 6. Verify Final State
        const finalInv = await getInventory(user._id);
        console.log("Final Inventory:", JSON.stringify(finalInv, null, 2));

        console.log("VERIFICATION SUCCESSFUL");
        process.exit(0);

    } catch (error) {
        console.error("Verification Failed:", error);
        process.exit(1);
    }
};

verifyInventory();
