import mongoose from "mongoose";
import dotenv from "dotenv";
import { Game } from "../models/Game.js";

dotenv.config();

const games = [
  {
    title: "Cyber Slicer",
    description: "Test your reflexes in this neon-soaked data slicing simulation. Avoid the corrupt nodes!",
    categoryId: "action",
    categoryName: "Action",
    image: "https://images.unsplash.com/photo-1555680202-c86f0e12f086?q=80&w=1000&auto=format&fit=crop",
    gameUrl: "cyber-slicer",
    gameKey: "cyber-slicer",
    missionCost: 0,
    maxAttempts: 999,
    isFeatured: true,
    showOnHome: true,
    homeOrder: 1,
    objectives: ["Score 100 Points", "Slice 50 Nodes"],
    createdBy: "System"
  },
  {
    title: "Neon Runner",
    description: "Sprint through the digital highway. Jump over obstacles and survive as long as possible!",
    categoryId: "race",
    categoryName: "Race",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1000&auto=format&fit=crop",
    gameUrl: "neon-runner",
    gameKey: "neon-runner",
    missionCost: 0,
    maxAttempts: 999,
    isFeatured: true,
    showOnHome: true,
    homeOrder: 2,
    objectives: ["Reach 500M Distance", "Survive 60 Seconds"],
    createdBy: "System"
  },
  {
    title: "Memory Matrix",
    description: "Test your neural pathways. Match all pairs in this cyberpunk memory challenge!",
    categoryId: "royal",
    categoryName: "Royal",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1000&auto=format&fit=crop",
    gameUrl: "memory-matrix",
    gameKey: "memory-matrix",
    missionCost: 0,
    maxAttempts: 999,
    isFeatured: true,
    showOnHome: true,
    homeOrder: 3,
    objectives: ["Complete in Under 60s", "Win with Less Than 20 Moves"],
    createdBy: "System"
  },
  {
    title: "Code Breaker",
    description: "Decrypt the sequences. Memorize patterns and prove your mental processing power!",
    categoryId: "royal",
    categoryName: "Royal",
    image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1000&auto=format&fit=crop",
    gameUrl: "code-breaker",
    gameKey: "code-breaker",
    missionCost: 0,
    maxAttempts: 999,
    isFeatured: true,
    showOnHome: true,
    homeOrder: 4,
    objectives: ["Reach Level 5", "Score 500 Points"],
    createdBy: "System"
  }
];

const seedGames = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to DB");

    for (const game of games) {
      const existing = await Game.findOne({ gameKey: game.gameKey });
      if (existing) {
        console.log(`♻️  Updating: ${game.title}`);
        await Game.findOneAndUpdate({ gameKey: game.gameKey }, game);
      } else {
        console.log(`🆕 Creating: ${game.title}`);
        await Game.create(game);
      }
    }

    console.log("\n🎮 All games deployed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
};

seedGames();
