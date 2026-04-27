import express from "express";
import { getSetting, getRecentActivity } from "../controllers/systemController.js";


const router = express.Router();

// Public read access to system settings
router.get("/settings/:key", getSetting);
router.get("/recent-activity", getRecentActivity);


export default router;
