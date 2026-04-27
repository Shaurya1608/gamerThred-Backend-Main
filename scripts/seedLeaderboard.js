import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./models/User.js";

dotenv.config();

const users = [
  {
    username: "Alex_Blade",
    email: "alex@example.com",
    password: "Password123!",
    isVerified: true,
    role: "user",
    gems: 2500,
    xp: 15000,
    avatar: { url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" },
    status: "active"
  },
  {
    username: "Sarah_Pro",
    email: "sarah@example.com",
    password: "Password123!",
    isVerified: true,
    role: "user",
    gems: 2100,
    xp: 12500,
    avatar: { url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah" },
    status: "active"
  },
  {
    username: "Shadow_Walker",
    email: "shadow@example.com",
    password: "Password123!",
    isVerified: true,
    role: "user",
    gems: 1950,
    xp: 11000,
    avatar: { url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Shadow" },
    status: "active"
  },
  {
    username: "GamerX",
    email: "gamerx@example.com",
    password: "Password123!",
    isVerified: true,
    role: "user",
    gems: 1200,
    xp: 8000,
    avatar: { url: "https://api.dicebear.com/7.x/avataaars/svg?seed=GamerX" },
    status: "active"
  },
  {
    username: "Cyber_Punk",
    email: "cyber@example.com",
    password: "Password123!",
    isVerified: true,
    role: "user",
    gems: 950,
    xp: 6500,
    avatar: { url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cyber" },
    status: "active"
  },
  {
    username: "Neon_Ghost",
    email: "neon@example.com",
    password: "Password123!",
    isVerified: true,
    role: "user",
    gems: 800,
    xp: 5000,
    avatar: { url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Neon" },
    status: "active"
  }
];

const seedLeaderboard = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for seeding leaderboard...");

    // Remove existing test users to avoid duplicates if re-run
    const emails = users.map(u => u.email);
    await User.deleteMany({ email: { $in: emails } });

    // Seed users
    await User.insertMany(users);
    console.log("Leaderboard seeded successfully with 6 elite masters.");

    await mongoose.connection.close();
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
};

seedLeaderboard();
