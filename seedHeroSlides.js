const mongoose = require('mongoose');
const { HeroSlide } = require('./models/HeroSlide.js');
const dotenv = require('dotenv');

dotenv.config();

const slides = [
  {
    titleTop: "NEW MISSIONS",
    titleBottom: "AVAILABLE NOW",
    description: "Join thousands of gamers and earn massive rewards.",
    cta: "Explore Missions",
    badge: "Limited Time",
    participants: "1,243",
    order: 1,
    isActive: true,
    image: "https://res.cloudinary.com/dlvun4pga/image/upload/v1741022076/HeroSwiper/hero-1.png"
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
    image: "https://res.cloudinary.com/dlvun4pga/image/upload/v1741022076/HeroSwiper/hero-2.png"
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gamert');
    console.log("Connected to MongoDB");
    
    await HeroSlide.deleteMany({});
    console.log("Cleared old slides");
    
    await HeroSlide.insertMany(slides);
    console.log("Seeded new slides");
    
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seed();
