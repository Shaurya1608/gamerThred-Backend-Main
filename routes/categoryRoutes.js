import express from "express";
import multer from "multer";
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public routes
router.get("/", getAllCategories);
router.get("/:id", getCategoryById);

// Admin/Moderator routes
router.post(
  "/",
  isAdmin,
  checkPermission("manage_games"),
  upload.single("image"),
  createCategory
);

router.put(
  "/:id",
  isAdmin,
  checkPermission("manage_games"),
  upload.single("image"),
  updateCategory
);

router.delete(
  "/:id",
  isAdmin,
  checkPermission("manage_games"),
  deleteCategory
);

export default router;
