import express from "express";
import { getDailyQuests, claimDailyQuestReward } from "../controllers/dailyQuestController.js";
import { isAuthenticated } from "../middleware/isAuthenticated.js";

import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

router.get("/", isAuthenticated, rateLimit({ keyPrefix: "get_daily_quests", limit: 60, windowSeconds: 60 }), getDailyQuests);
router.post("/claim", isAuthenticated, rateLimit({ keyPrefix: "claim_reward", limit: 20, windowSeconds: 60 }), claimDailyQuestReward);

export default router;
