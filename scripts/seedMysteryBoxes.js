import mongoose from "mongoose";
import { MysteryBox } from "../models/MysteryBox.js";
import dotenv from "dotenv";

dotenv.config({ path: "server/.env" });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

const seedBoxes = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        // Clear existing boxes
        await MysteryBox.deleteMany({});

        const boxes = [
            {
                code: "INITIATE_CHEST",
                name: "Gamer Initiate Chest",
                description: "Starter progression with essential rewards.",
                cost: 500,
                order: 1,
                rewards: [
                    // Common (No Tickets) - Weight 90
                    { type: "GTC", value: 50, weight: 35, name: "50 GTC" },
                    { type: "GTC", value: 75, weight: 25, name: "75 GTC" },
                    { type: "GTC", value: 100, weight: 15, name: "100 GTC" },
                    { type: "BOOST", value: "XP_BOOST_15M", weight: 8, name: "XP Boost (15m)" },
                    { type: "GTC", value: 150, weight: 5, name: "150 GTC", isRare: true },
                    { type: "GTC", value: 300, weight: 2, name: "JACKPOT: 300 GTC", isJackpot: true, isRare: true },

                    // Tickets (Rare) - Weight 10 (8% + 2%)
                    { type: "TICKET", value: 1, weight: 8, name: "1 Ticket", isRare: true },
                    { type: "TICKET", value: 2, weight: 2, name: "2 Tickets", isRare: true }
                ]
            },
            {
                code: "ELITE_CRATE",
                name: "Elite Commando Crate",
                description: "Reserved for high-tier progression.",
                cost: 2500,
                order: 2,
                rewards: [
                    // Common (No Tickets) - Weight 93
                    { type: "GTC", value: 200, weight: 28, name: "200 GTC" },
                    { type: "GTC", value: 300, weight: 23, name: "300 GTC" },
                    { type: "GTC", value: 500, weight: 17, name: "500 GTC" },
                    { type: "GTC", value: 700, weight: 8, name: "700 GTC", isRare: true },
                    { type: "ITEM", value: "RETRY_CARD", weight: 6, name: "Retry Card", isRare: true },
                    { type: "GTC", value: 1000, weight: 4, name: "1000 GTC", isRare: true },
                    { type: "PROTECTION", value: "RANK_PROTECTION", weight: 4, name: "Rank Protection", isRare: true },
                    { type: "GTC", value: 5000, weight: 2.1, name: "MEGA JACKPOT: 5000 GTC", isJackpot: true, isRare: true },
                    { type: "COSMETIC", value: "TITLE_LEGEND", weight: 0.9, name: "title: Legend", isRare: true },

                    // Tickets (Rare) - Weight 7 (5% + 2%)
                    { type: "TICKET", value: 1, weight: 5, name: "1 Ticket", isRare: true },
                    { type: "TICKET", value: 2, weight: 2, name: "2 Tickets", isRare: true }
                ]
            }
        ];

        for (const box of boxes) {
            await MysteryBox.create(box);
            console.log(`Seeded: ${box.name}`);
        }

        console.log("Seeding Complete!");
        process.exit(0);

    } catch (error) {
        console.error("Seeding Error:", error);
        process.exit(1);
    }
};

seedBoxes();
