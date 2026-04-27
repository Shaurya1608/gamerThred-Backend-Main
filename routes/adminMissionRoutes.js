import express from "express";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";
import {
  createMission,
  getAllMissions,
  updateMission,
  disableMission,
  enableMission,
  deleteMission,
} from "../controllers/adminMissionController.js";

import { upload } from "../middleware/upload.js";

const router = express.Router();

router.use(isAdmin);
router.use(checkPermission("manage_missions"));

// CRUD
router.post("/missions", upload.single("image"), createMission);
router.get("/missions", getAllMissions);
router.put("/missions/:missionId", upload.single("image"), updateMission);

// STATE CONTROL (soft)
router.patch("/missions/:missionId/disable", disableMission);
router.patch("/missions/:missionId/enable", enableMission);

// ❌❌❌ ONLY ONE DELETE ROUTE ❌❌❌
router.delete("/missions/:missionId", deleteMission);

export default router;
