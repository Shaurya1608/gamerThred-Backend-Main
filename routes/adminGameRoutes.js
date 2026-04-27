import express from "express";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";
import { 
  uploadMiddleware, 
  uploadGame, 
  getAllGamesAdmin, 
  updateGame, 
  deleteGame 
} from "../controllers/adminGameController.js";

const router = express.Router();

// All routes require admin or moderator rolee
router.use(isAdmin);

router.post("/upload", checkPermission("manage_games"), uploadMiddleware, uploadGame);
router.get("/", checkPermission("manage_games"), getAllGamesAdmin);
router.put("/:id", checkPermission("manage_games"), uploadMiddleware, updateGame);
router.delete("/:id", checkPermission("manage_games"), deleteGame);

export default router;
