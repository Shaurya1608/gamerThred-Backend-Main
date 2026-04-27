import express from "express";
import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { getActiveSessions, revokeSession } from "../controllers/sessionController.js";

const router = express.Router();

// Session Management
router.get("/sessions", isAuthenticated, getActiveSessions);
router.delete("/sessions/:sessionId", isAuthenticated, revokeSession);

export default router;
