import express from "express";
import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";
import { 
    createWeekendMission, 
    registerGroup, 
    getActiveWeekendMission, 
    getGroupProgress, 
    updateMissionStatus,
    getAllWeekendMissions,
    updateWeekendMission,
    deleteWeekendMission,
    claimReward
} from "../controllers/weekendMissionController.js";

import { upload } from "../middleware/upload.js";

const router = express.Router();

// Public/General User Routes
router.get("/active", isAuthenticated, getActiveWeekendMission);
router.post("/:id/register", isAuthenticated, registerGroup);
router.get("/:missionId/group/:groupId/progress", isAuthenticated, getGroupProgress);
router.post("/:id/claim", isAuthenticated, claimReward);

// Admin Routes
router.get("/", isAdmin, checkPermission(["manage_missions", "manage_weekend_missions"]), getAllWeekendMissions);
router.post("/", isAdmin, checkPermission(["manage_missions", "manage_weekend_missions"]), upload.single("image"), createWeekendMission);
router.put("/:id", isAdmin, checkPermission(["manage_missions", "manage_weekend_missions"]), upload.single("image"), updateWeekendMission);
router.delete("/:id", isAdmin, checkPermission(["manage_missions", "manage_weekend_missions"]), deleteWeekendMission);
router.patch("/:id/status", isAdmin, checkPermission(["manage_missions", "manage_weekend_missions"]), updateMissionStatus);

export default router;
