import express from "express";
import { getProfile, updateAvatar, updateProfile, getProfileMissions, getLeaderboard } from "../controllers/profileController.js";
import { isAuthenticated, optionalAuth } from "../middleware/isAuthenticated.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.get("/me", isAuthenticated, getProfile);
router.put("/me", isAuthenticated, updateProfile); // 👈 New Route
router.get("/missions", isAuthenticated, getProfileMissions); // 👈 New Route
router.get("/leaderboard", optionalAuth, getLeaderboard); // 👈 Public Leaderboard with rank detection
router.put("/avatar", isAuthenticated, upload.single("avatar"), updateAvatar);

export default router;
