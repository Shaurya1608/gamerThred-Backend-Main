import mongoose from "mongoose";
import dotenv from "dotenv";
import { Game } from "../models/Game.js";

dotenv.config({ path: './server/.env' });

const seedRemoteTest = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to DB");

    const remoteGame = {
      title: "EXT-LINK TEST (Miniclip Style)",
      description: "Test the External Link SDK v2.0 integration. This game is loaded from a remote URL but sends scores back to GamerThred.",
      categoryId: "action",
      categoryName: "Action",
      image: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=1000&auto=format&fit=crop",
      gameUrl: "http://localhost:5173/sdk-v2-tester.html", // Remote URL pointing to local server
      gameKey: "remote-link-test",
      integrationType: "remote",
      missionCost: 0,
      maxAttempts: 999,
      isFeatured: true,
      showOnHome: true,
      homeOrder: 0,
      objectives: ["Score 100 Points"],
      createdBy: "System"
    };

    const existing = await Game.findOne({ gameKey: remoteGame.gameKey });
    if (existing) {
      console.log(`♻️  Updating: ${remoteGame.title}`);
      await Game.findOneAndUpdate({ gameKey: remoteGame.gameKey }, remoteGame);
    } else {
      console.log(`🆕 Creating: ${remoteGame.title}`);
      await Game.create(remoteGame);
    }

    console.log("\n🎮 Remote Test Game deployed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
};

seedRemoteTest();
