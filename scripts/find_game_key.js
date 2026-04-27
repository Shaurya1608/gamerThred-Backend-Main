import mongoose from "mongoose";
import dotenv from "dotenv";
import { Game } from "./models/Game.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gamet";

async function findBrickBreaker() {
    try {
        await mongoose.connect(MONGO_URI);
        const game = await Game.findOne({ title: /Brick/i });
        if (game) {
            console.log("GAME_FOUND");
            console.log(`Title: ${game.title}`);
            console.log(`GameKey: ${game.gameKey}`);
        } else {
            console.log("GAME_NOT_FOUND");
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findBrickBreaker();
