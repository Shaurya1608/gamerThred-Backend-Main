import express from "express";
import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { getPassStatus, claimReward, buyElitePass } from "../controllers/seasonController.js";

const router = express.Router();

router.get("/status", isAuthenticated, getPassStatus);
router.post("/claim", isAuthenticated, claimReward);
router.post("/buy", isAuthenticated, buyElitePass);

export default router;
