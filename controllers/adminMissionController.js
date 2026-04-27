import { uploadToCloudinary } from "../utils/uploadUtils.js";
import { invalidateCache, invalidatePattern } from "../utils/redisUtils.js";
import { Mission } from "../models/Mission.js";
import { MissionSession } from "../models/MissionSession.js";
import { logAudit } from "../utils/auditLogger.js";

/* ===============================
   CREATE MISSION (ADMIN)
=============================== */
export const createMission = async (req, res) => {
  try {
    const {
      title,
      gameId,
      minScore,
      minTime,
      rewardGtc,
      maxAttempts,
      startsAt,
      expiresAt,
      isTrending,
      missionType,
      difficulty,
      category,
      rewardLoyalty,
    } = req.body;

    console.log("Create Mission Body:", req.body);
    console.log("Create Mission File:", req.file);

    if (
      !title ||
      !gameId ||
      !minScore ||
      !rewardGtc ||
      !startsAt ||
      !expiresAt
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    if (new Date(expiresAt) <= new Date(startsAt)) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be after start date",
      });
    }

    let imageUrl = "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "missions");
      imageUrl = result.url;
    }

    const mission = await Mission.create({
      title,
      gameId,
      minScore,
      minTime: minTime || 0,
      rewardGtc,
      entryFeeTickets: req.body.entryFeeTickets,
      maxAttempts: maxAttempts || 5,
      startsAt: new Date(startsAt),
      expiresAt: new Date(expiresAt),
      image: imageUrl,
      isActive: true, // 🚀 Default to active on creation
      isTrending: isTrending || false,
      missionType: missionType || "regular",
      difficulty: difficulty || "medium",
      category: category || "general",
      rewardLoyalty: rewardLoyalty || 0,
      createdBy: req.user._id,
    });

    await logAudit(req, "MISSION_CREATED", { missionId: mission._id, title: mission.title });
    res.status(201).json({
      success: true,
      message: "Mission created successfully",
      mission,
    });

    // 💡 Cache Invalidation
    await invalidatePattern("trending_missions:*");
    await invalidatePattern("user_missions:*");
  } catch (error) {
    console.error("Create Mission Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create mission",
      error: error.message,
    });
  }
};

/* ===============================
   GET ALL MISSIONS (ADMIN)
=============================== */
export const getAllMissions = async (req, res) => {
  try {
    const missions = await Mission.find()
      .sort({ createdAt: -1 })
      .populate("createdBy", "username");

    res.status(200).json({
      success: true,
      missions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch missions",
    });
  }
};

/* ===============================
   UPDATE MISSION (ADMIN)
=============================== */
export const updateMission = async (req, res) => {
  try {
    const { missionId } = req.params;

    const mission = await Mission.findById(missionId);
    if (!mission) {
      return res.status(404).json({
        success: false,
        message: "Mission not found",
      });
    }

    // ✅ Explicit updates only
    if (req.body.title !== undefined) mission.title = req.body.title;
    if (req.body.gameId !== undefined) mission.gameId = req.body.gameId;
    if (req.body.minScore !== undefined) mission.minScore = req.body.minScore;
    if (req.body.minTime !== undefined) mission.minTime = req.body.minTime;
    if (req.body.rewardGtc !== undefined) mission.rewardGtc = req.body.rewardGtc;
    if (req.body.entryFeeTickets !== undefined) mission.entryFeeTickets = req.body.entryFeeTickets;
    if (req.body.maxAttempts !== undefined) mission.maxAttempts = req.body.maxAttempts;
    if (req.body.isTrending !== undefined) mission.isTrending = req.body.isTrending;
    if (req.body.missionType !== undefined) mission.missionType = req.body.missionType;
    if (req.body.difficulty !== undefined) mission.difficulty = req.body.difficulty;
    if (req.body.category !== undefined) mission.category = req.body.category;
    if (req.body.rewardLoyalty !== undefined) mission.rewardLoyalty = req.body.rewardLoyalty;

    // ⛔ Update dates ONLY if admin changed them
    if (req.body.startsAt) mission.startsAt = new Date(req.body.startsAt);
    if (req.body.expiresAt) mission.expiresAt = new Date(req.body.expiresAt);

    // 🖼️ Handle Image Upload
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "missions");
      mission.image = result.url;
    }

    await mission.save();

    await logAudit(req, "MISSION_UPDATED", { missionId: mission._id, title: mission.title });
    res.status(200).json({
      success: true,
      mission,
    });

    // 💡 Cache Invalidation
    await invalidatePattern("trending_missions:*");
    await invalidatePattern("user_missions:*");
  } catch (err) {
    console.error("Update Mission Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update mission",
    });
  }
};


/* ===============================
   DISABLE MISSION (ADMIN)
=============================== */
export const disableMission = async (req, res) => {
  try {
    const { missionId } = req.params;

    const mission = await Mission.findByIdAndUpdate(
      missionId,
      { isActive: false },
      { new: true },
    );

    if (!mission) {
      return res.status(404).json({
        success: false,
        message: "Mission not found",
      });
    }

    await logAudit(req, "MISSION_DISABLED", { missionId: mission._id });
    res.status(200).json({
      success: true,
      message: "Mission disabled successfully",
    });

    // 💡 Cache Invalidation
    await invalidatePattern("trending_missions:*");
    await invalidatePattern("user_missions:*");
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to disable mission",
    });
  }
};

/* ===============================
   ENABLE MISSION (ADMIN)
=============================== */
export const enableMission = async (req, res) => {
  try {
    const { missionId } = req.params;

    const mission = await Mission.findByIdAndUpdate(
      missionId,
      { isActive: true },
      { new: true }
    );

    if (!mission) {
      return res.status(404).json({
        success: false,
        message: "Mission not found",
      });
    }

    await logAudit(req, "MISSION_ENABLED", { missionId: mission._id });
    res.status(200).json({
      success: true,
      message: "Mission enabled successfully",
      mission,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to enable mission",
    });
  }
};
export const deleteMission = async (req, res) => {
  try {
    const { missionId } = req.params;

    const activeSessions = await MissionSession.countDocuments({
      missionId,
      status: "active",
    });

    if (activeSessions > 0) {
      return res.status(400).json({
        success: false,
        message: "Mission has active players. Disable it first.",
      });
    }

    const deletedMission = await Mission.findByIdAndDelete(missionId);

    if (!deletedMission) {
      return res.status(404).json({
        success: false,
        message: "Mission not found",
      });
    }

    console.log("🗑️ Mission deleted:", deletedMission._id);

    await logAudit(req, "MISSION_DELETED", { missionId });
    res.status(200).json({
      success: true,
      message: "Mission deleted permanently",
    });

    // 💡 Cache Invalidation
    await invalidatePattern("trending_missions:*");
    await invalidatePattern("user_missions:*");
  } catch (err) {
    console.error("Delete mission error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete mission",
    });
  }
};
