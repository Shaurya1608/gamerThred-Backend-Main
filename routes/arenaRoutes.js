import express from "express";
import { 
    createChallenge, 
    getMyChallenges, 
    acceptChallenge, 
    declineChallenge, 
    submitArenaScore, 
    joinGlobalQueue, 
    leaveGlobalQueue,
    getArenaLeaderboard,
    getArenaQuests,
    claimArenaQuestReward,
    getGlobalActiveMatches,
    startMatch,
    restoreArenaWinStreak,
    dismissArenaWinRestore
} from "../controllers/arenaController.js";
import { isAuthenticated } from "../middleware/isAuthenticated.js";

const router = express.Router();

router.get("/", isAuthenticated, getMyChallenges);
router.get("/leaderboard", isAuthenticated, getArenaLeaderboard);
router.get("/quests", isAuthenticated, getArenaQuests);
router.get("/active-global", isAuthenticated, getGlobalActiveMatches);
router.post("/quests/claim", isAuthenticated, claimArenaQuestReward);

router.post("/create", isAuthenticated, createChallenge);
router.post("/accept", isAuthenticated, acceptChallenge);
router.post("/decline", isAuthenticated, declineChallenge);
router.post("/submit-score", isAuthenticated, submitArenaScore);
router.post("/join-queue", isAuthenticated, joinGlobalQueue);
router.post("/leave-queue", isAuthenticated, leaveGlobalQueue);
router.post("/start-match", isAuthenticated, startMatch);
router.post("/restore-streak", isAuthenticated, restoreArenaWinStreak);
router.post("/dismiss-restore", isAuthenticated, dismissArenaWinRestore);

export default router;
