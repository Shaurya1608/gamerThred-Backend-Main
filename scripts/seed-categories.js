/**
 * 📂 Gamet Category Seeding Script
 * 🚀 Populates the database with essential gaming categories.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Category } from './models/Category.js';

dotenv.config();

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) {
            console.error("❌ Error: MONGO_URI is not defined in .env file.");
            process.exit(1);
        }
        await mongoose.connect(uri);
        console.log("✅ Database Connected for Category Seeding");
    } catch (err) {
        console.error("❌ DB Connection Error:", err.message);
        process.exit(1);
    }
};

const CATEGORIES = [
    { name: "Action", order: 1, image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=500" },
    { name: "Adventure", order: 2, image: "https://images.unsplash.com/photo-1552824734-7546654876ec?q=80&w=500" },
    { name: "RPG", order: 3, image: "https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=500" },
    { name: "Strategy", order: 4, image: "https://images.unsplash.com/photo-1509130298739-651801c76e96?q=80&w=500" },
    { name: "Shooter", order: 5, image: "https://images.unsplash.com/photo-1551103902-e209867540cc?q=80&w=500" },
    { name: "Sports", order: 6, image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=500" },
    { name: "Racing", order: 7, image: "https://images.unsplash.com/photo-1547394765-185e1e68f34e?q=80&w=500" },
    { name: "Puzzle", order: 8, image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?q=80&w=500" }
];

const seedCategories = async () => {
    await connectDB();
    
    console.log("📂 Seeding Game Categories...");

    try {
        for (const catData of CATEGORIES) {
            await Category.findOneAndUpdate(
                { name: catData.name },
                { $set: catData },
                { upsert: true, new: true }
            );
            console.log(`✅ Category Synced: ${catData.name}`);
        }
        console.log("\n✨ Category Seeding Complete!");
    } catch (error) {
        console.error("❌ Seeding Error:", error.message);
    } finally {
        process.exit(0);
    }
};

seedCategories();
