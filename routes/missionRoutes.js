// routes/mission.routes.js
import express from "express";
import { completeMission, getActiveMissions, startMission, getTrendingMissions, getMissionBySessionId } from "../controllers/missionController.js";
import { isAuthenticated, optionalAuth } from "../middleware/isAuthenticated.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";

const router = express.Router();
router.post("/start",isAuthenticated, startMission);
router.post("/complete", isAuthenticated, completeMission);
router.get("/", isAuthenticated, cacheMiddleware("user_missions_v2", 5), getActiveMissions);
router.get("/trending", optionalAuth, cacheMiddleware("trending_missions_v2", 10), getTrendingMissions); 
router.get("/session/:sessionId", isAuthenticated, getMissionBySessionId);

export default router;
