import SystemSettings from "../models/SystemSettings.js";
import mongoose from "mongoose";
import { redis } from "../config/redis.js";
import { WeekendMission } from "../models/WeekendMission.js";
import { invalidatePattern } from "../utils/redisUtils.js";
import { logAudit } from "../utils/auditLogger.js";
import { RewardOrder } from "../models/RewardOrder.js";


// GET /api/system/settings/:key
export const getSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await SystemSettings.findOne({ key });
    
    if (!setting) {
        // Return default values for known keys if missing
        if (key === "beta_banner_config") {
            return res.status(200).json({
                success: true,
                value: {
                    isActive: true,
                    version: "v0.9.2-beta",
                    message: "Core functionality testing in progress",
                    details: []
                }
            });
        }
        return res.status(404).json({ success: false, message: "Setting not found" });
    }

    res.status(200).json({ success: true, value: setting.value });
  } catch (error) {
    console.error("Get Setting Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /api/system/recent-activity
export const getRecentActivity = async (req, res) => {
    try {
        const activities = await RewardOrder.find({ status: "completed" })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate("user", "username")
            .populate("reward", "title");

        const formattedActivities = activities.map(order => ({
            id: order._id,
            username: order.user?.username || "Unknown Operative",
            rewardName: order.reward?.title || "Classified Intel",
            timestamp: order.createdAt
        }));

        res.status(200).json({
            success: true,
            data: formattedActivities
        });
    } catch (error) {
        console.error("Recent Activity Fetch Error:", error);
        res.status(500).json({ success: false, message: "Server Protocol Failure" });
    }
};


// PUT /api/admin/settings/:key
export const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    const setting = await SystemSettings.findOneAndUpdate(
      { key },
      { 
        value, 
        description,
        lastUpdatedBy: req.user._id 
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await logAudit(req, "SYSTEM_SETTING_UPDATED", { key, value });
    res.status(200).json({ success: true, data: setting });
  } catch (error) {
    console.error("Update Setting Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /api/admin/system/cache-status
export const getCacheStatus = async (req, res) => {
  try {
    const activeWeekendMission = await WeekendMission.findOne({ status: "active" });
    
    res.status(200).json({
      success: true,
      data: {
        isWeekendMissionActive: !!activeWeekendMission,
        activeMissionTitle: activeWeekendMission?.title || null
      }
    });
  } catch (error) {
    console.error("Cache Status Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch cache status" });
  }
};

// POST /api/admin/system/clear-cache
export const clearSystemCache = async (req, res) => {
  try {
    const { scopes } = req.body;
    
    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({ success: false, message: "No tactical scopes selected" });
    }

    const results = [];
    
    for (const scope of scopes) {
      switch (scope) {
        case "weekend_missions":
          await invalidatePattern("weekend:mission:*");
          results.push("Weekend Mission Progress Purged");
          break;
        case "leaderboards":
          await invalidatePattern("leaderboard:*");
          results.push("Leaderboard Data Refreshed");
          break;
        case "rate_limits":
          await invalidatePattern("rate_limit:*");
          results.push("Traffic Inhibitors Reset");
          break;
        case "sessions":
          await invalidatePattern("refresh_token:*");
          results.push("User Authentication Tokens Nuked");
          break;
        case "global":
          await redis.flushall();
          results.push("Global Neural Wipe Complete");
          break;
        default:
          break;
      }
    }

    await logAudit(req, "SYSTEM_CACHE_CLEARED", { scopes });
    res.status(200).json({ 
      success: true, 
      message: results.length > 1 ? "Multiple tactical purges executed" : results[0],
      details: results 
    });
  } catch (error) {
    console.error("Clear Cache Error:", error);
    res.status(500).json({ success: false, message: "Cache Purge Failed" });
  }
};

// POST /api/admin/system/backup
export const exportDatabase = async (req, res) => {
  try {
    const backupData = {};
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      const name = collection.name;
      const data = await mongoose.connection.db.collection(name).find({}).toArray();
      backupData[name] = data;
    }

    const filename = `GamerThred_Backup_${new Date().toISOString().split('T')[0]}.json`;
    
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/json');
    await logAudit(req, "DATABASE_EXPORTED", { filename });
    res.send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    console.error("Export Database Error:", error);
    res.status(500).json({ success: false, message: "Backup Protocol Failed" });
  }
};

