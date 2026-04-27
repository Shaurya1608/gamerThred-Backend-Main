// server/routes/adminReward.routes.js
import express from "express";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";
import { upload } from "../middleware/upload.js";
import {
  createReward,
  getAllRewardsAdmin,
  deleteReward,
  toggleReward,
  updateReward,
} from "../controllers/adminRewardController.js";

const router = express.Router();

router.use(isAdmin);

router.post("/", checkPermission("manage_rewards"), upload.single("image"), createReward);
router.get("/", checkPermission("manage_rewards"), getAllRewardsAdmin);
router.patch("/:id/toggle", checkPermission("manage_rewards"), toggleReward);
router.put("/:id", checkPermission("manage_rewards"), upload.single("image"), updateReward);
router.delete("/:id", checkPermission("manage_rewards"), deleteReward);

export default router;
