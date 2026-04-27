import express from "express";
import { getSubscriptionConfigs, getSubscriptionConfigByTier } from "../controllers/subscriptionConfigController.js";

const router = express.Router();

/**
 * @route GET /api/subscription-configs
 * @desc Get all subscription configs (Public)
 * @access Public
 */
router.get("/", getSubscriptionConfigs);

/**
 * @route GET /api/subscription-configs/:tier
 * @desc Get specific tier config (Public)
 * @access Public
 */
router.get("/:tier", getSubscriptionConfigByTier);

export default router;
