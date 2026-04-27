import express from "express";
import { getHomeGames } from "../controllers/adminController.js";
import { getAllGames, getGameById, getGameByKey } from "../controllers/gameController.js";

const router = express.Router();

// 🌍 PUBLIC
router.get("/", getAllGames);
router.get("/home", getHomeGames);
router.get("/:gameId", getGameById);
router.get("/key/:gameKey", getGameByKey);


export default router;
