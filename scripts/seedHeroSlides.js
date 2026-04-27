import mongoose from "mongoose";
import dotenv from "dotenv";
import { HeroSlide } from "./models/HeroSlide.js";
import connectDB from "./config/db.js";

dotenv.config();

const initialSlides = [
  {
    titleTop: "NEW MISSIONS",
    titleBottom: "AVAILABLE NOW",
    description: "Join thousands of gamers and earn massive rewards.",
    cta: "Explore Missions",
    badge: "Limited Time",
    participants: "1,243",
    order: 1,
    isActive: true,
  },
  {
    titleTop: "TOURNAMENT",
    titleBottom: "THIS WEEKEND",
    description: "Compete for a 50,000 GTC prize pool.",
    cta: "Join Tournament",
    badge: "Prize Pool · 50K",
    participants: "856",
    order: 2,
    isActive: true,
  },
  {
    titleTop: "SPEEDRUN",
    titleBottom: "CHALLENGE",
    description: "Test your skill and climb the global rankings.",
    cta: "Compete Now",
    badge: "Trending",
    participants: "2,145",
    order: 3,
    isActive: true,
  },
];

const seedHeroSlides = async () => {
  try {
    await connectDB();
    await HeroSlide.deleteMany();
    await HeroSlide.insertMany(initialSlides);
    console.log("✅ Hero slides seeded successfully");
    process.exit();
  } catch (error) {
    console.error("❌ Error seeding hero slides:", error);
    process.exit(1);
  }
};

seedHeroSlides();
