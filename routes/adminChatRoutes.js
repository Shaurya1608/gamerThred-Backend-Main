import express from "express";
import { 
    getUsersForModeration, 
    updateUserBans, 
    deleteCommunity,
    banFromCommunity
} from "../controllers/adminChatController.js";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";

const router = express.Router();

// All routes require admin or moderator role
router.use(isAdmin);

router.get("/users", checkPermission("moderate_chat"), getUsersForModeration);
router.patch("/users/:userId", checkPermission("moderate_chat"), updateUserBans);
router.delete("/community/:communityId", checkPermission("moderate_chat"), deleteCommunity);
router.post("/community/ban", checkPermission("moderate_chat"), banFromCommunity);

export default router;
