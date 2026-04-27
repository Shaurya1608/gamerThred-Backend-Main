import { MysteryBox } from "../models/MysteryBox.js";
import logger from "./logger.js";

export const seedMysteryBoxes = async () => {
    try {
        const count = await MysteryBox.countDocuments();
        if (count > 0) return;

        logger.info("Seeding Mystery Chests (Tactical Data Alignment)...");

        const boxes = [
            {
                code: "STANDARD_CHEST",
                name: "Gamer Initiate Chest",
                description: "Starter progression with essential rewards.",
                cost: 500,
                currency: "GTC",
                order: 1,
                rewards: [
                    { type: "GTC", value: 100, weight: 60, name: "100 GTC Pack", isRare: false },
                    { type: "TICKET", value: 1, weight: 25, name: "1 Arena Ticket", isRare: false },
                    { type: "BOOST", value: "XP_2X", weight: 10, name: "XP Surge (2X)", isRare: true },
                    { type: "GTC", value: 1000, weight: 5, name: "1000 GTC JACKPOT", isRare: true, isJackpot: true }
                ]
            },
            {
                code: "ELITE_CHEST",
                name: "Elite Commando Crate",
                description: "Reserved for high-tier progression.",
                cost: 2500,
                currency: "GTC",
                order: 2,
                rewards: [
                    { type: "GTC", value: 500, weight: 50, name: "500 GTC Pack", isRare: false },
                    { type: "TICKET", value: 5, weight: 20, name: "5 Arena Tickets", isRare: false },
                    { type: "PROTECTION", value: "RANK_SHIELD", weight: 20, name: "Rank Protection", isRare: true },
                    { type: "GTC", value: 5000, weight: 10, name: "5000 GTC JACKPOT", isRare: true, isJackpot: true }
                ]
            }
        ];

        await MysteryBox.insertMany(boxes);
        logger.info("Mystery Chests seeded successfully!");
    } catch (error) {
        logger.error("Seeding Mystery Boxes failed:", error);
    }
};
