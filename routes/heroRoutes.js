import { cacheMiddleware } from "../middleware/cacheMiddleware.js";
import express from "express";
import { getActiveSlides } from "../controllers/heroController.js";

const router = express.Router();

router.get("/", cacheMiddleware("hero_slides", 3600), getActiveSlides);

export default router;
