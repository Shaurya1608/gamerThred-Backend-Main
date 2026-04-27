import express from "express";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";
import {
  getAllSlidesAdmin,
  createSlide,
  updateSlide,
  deleteSlide,
} from "../controllers/heroController.js";

import { upload } from "../middleware/upload.js";

const router = express.Router();

// All routes require admin check
router.use(isAdmin);

router.get("/", checkPermission("manage_hero"), getAllSlidesAdmin);
router.post("/", checkPermission("manage_hero"), upload.single("image"), createSlide);
router.put("/:id", checkPermission("manage_hero"), upload.single("image"), updateSlide);
router.delete("/:id", checkPermission("manage_hero"), deleteSlide);

export default router;
