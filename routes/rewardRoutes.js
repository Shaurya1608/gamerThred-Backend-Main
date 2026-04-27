import express from "express";
import { getRewards, getGemPackages, redeemReward, getMyOrders, cancelOrder, getRecentRedemptions } from "../controllers/rewardController.js";
import { isAuthenticated } from "../middleware/isAuthenticated.js";

const router = express.Router();

// ✅ GET rewards (for RewardsPage)
router.get("/", isAuthenticated, getRewards);

// ✅ GET gem packages (for SubscriptionPage/Vault)
router.get("/gem-packages", isAuthenticated, getGemPackages);

// ✅ GET my orders
router.get("/my-orders", isAuthenticated, getMyOrders);

// ✅ POST redeem
router.post("/redeem", isAuthenticated, redeemReward);

// ✅ POST cancel order
router.post("/cancel/:orderId", isAuthenticated, cancelOrder);

// ✅ GET recent redemptions (Public for Social Proof)
router.get("/recent", getRecentRedemptions);

export default router;
