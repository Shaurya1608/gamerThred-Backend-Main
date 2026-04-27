import mongoose from "mongoose";
import dotenv from "dotenv";
import { Community } from "../models/Community.js";
import { User } from "../models/User.js";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const admin = await User.findOne({ role: "admin" });
    if (!admin) {
      console.error("No admin user found. Please create an admin first.");
      process.exit(1);
    }

    const communities = [
      {
        name: "Maxing Out",
        slug: "maxing-out",
        description: "Elite gamers pushing max ranks",
        owner: admin._id,
        members: [admin._id],
      },
      {
        name: "The Radiants",
        slug: "the-radiants",
        description: "Competitive gameplay & tournaments",
        owner: admin._id,
        members: [admin._id],
      },
      {
        name: "BGMI Warriors",
        slug: "bgmi-warriors",
        description: "Battle Royale champions",
        owner: admin._id,
        members: [admin._id],
      },
    ];

    for (const com of communities) {
        await Community.findOneAndUpdate({ slug: com.slug }, com, { upsert: true });
    }

    console.log("Communities seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
};

seed();
