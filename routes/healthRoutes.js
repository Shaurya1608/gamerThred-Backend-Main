import express from "express";
import mongoose from "mongoose";
import { redis } from "../config/redis.js";

const router = express.Router();

/**
 * @route   GET /api/health
 * @desc    Check server health status (DB, Redis, Uptime)
 * @access  Public
 */
router.get("/", async (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: "OK",
    services: {
      database: "DISCONNECTED",
      redis: "DISCONNECTED"
    }
  };

  try {
    // Check MongoDB
    if (mongoose.connection.readyState === 1) {
      healthCheck.services.database = "CONNECTED";
    } else {
      healthCheck.status = "DEGRADED";
    }

    // Check Redis
    if (redis.status === "ready") {
      healthCheck.services.redis = "CONNECTED";
    } else {
       // Redis might be optional depending on config
       healthCheck.services.redis = redis.status; 
    }

    res.status(200).json(healthCheck);
  } catch (err) {
    healthCheck.status = "ERROR";
    healthCheck.error = err.message;
    res.status(503).json(healthCheck);
  }
});

export default router;
