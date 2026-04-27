import express from "express";
import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { getCart, addToCart, removeFromCart, checkout } from "../controllers/cartController.js";

const router = express.Router();

router.use(isAuthenticated);

router.get("/", getCart);
router.post("/add", addToCart);
router.delete("/remove/:rewardId", removeFromCart);
router.post("/checkout", checkout);

export default router;
