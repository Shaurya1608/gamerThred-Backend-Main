
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/User.js";
import path from "path";
import { fileURLToPath } from "url";

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const checkShen = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const query = "shen";
        console.log(`Searching for '${query}'...`);
        
        // Search without status filter first
        const users = await User.find({ 
            username: { $regex: query, $options: "i" } 
        }).select("username status _id");

        console.log(`RAW COUNT: ${users.length}`);
        
        if (users.length > 0) {
            users.forEach(u => console.log(`USER: ${u.username} | STATUS: ${u.status} | ID: ${u._id}`));
        } else {
            console.log("NO USERS FOUND IN DB MATCHING 'shen'");
        }

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
};

checkShen();
