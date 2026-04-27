import express from "express";
import { getUserNotifications, markAsRead, clearNotifications } from "../controllers/notificationController.js";
import { isAuthenticated } from "../middleware/isAuthenticated.js";

const router = express.Router();

router.get("/", isAuthenticated, getUserNotifications);
router.put("/read/:id", isAuthenticated, markAsRead);
router.delete("/", isAuthenticated, clearNotifications);

export default router;
