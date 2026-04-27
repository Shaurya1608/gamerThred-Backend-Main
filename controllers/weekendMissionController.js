import { Community } from "../models/Community.js";
import { WeekendMission } from "../models/WeekendMission.js";
import { WeekendMissionRegistration } from "../models/WeekendMissionRegistration.js";
import weekendMissionService from "../utils/weekendMissionService.js";
import { redis } from "../config/redis.js";
import { uploadToCloudinary } from "../utils/uploadUtils.js";

export const createWeekendMission = async (req, res) => {
  try {
    const { title, description, targetMissions, startsAt, expiresAt, rewardConfig } = req.body;

    let imageUrl = "";
    if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, "missions");
        imageUrl = result.url;
    }

    const mission = await WeekendMission.create({
      title,
      description,
      image: imageUrl,
      targetMissions,
      startsAt,
      expiresAt,
      rewardConfig: typeof rewardConfig === 'string' ? JSON.parse(rewardConfig) : rewardConfig, // FormData might send object as string
      createdBy: req.user._id,
    });

    const io = req.app.get("io");
    if (io) {
        io.emit("weekend_mission_created", mission);
    }

    res.status(201).json({ success: true, mission });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateWeekendMission = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, targetMissions, startsAt, expiresAt, rewardConfig } = req.body;

    const mission = await WeekendMission.findById(id);
    if (!mission) return res.status(404).json({ success: false, message: "Mission not found" });

    // Explicit updates
    if (title) mission.title = title;
    if (description !== undefined) mission.description = description;
    if (targetMissions) mission.targetMissions = targetMissions;
    if (startsAt) mission.startsAt = startsAt;
    if (expiresAt) mission.expiresAt = expiresAt;
    
    if (rewardConfig) {
        mission.rewardConfig = typeof rewardConfig === 'string' ? JSON.parse(rewardConfig) : rewardConfig;
    }

    if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, "missions");
        mission.image = result.url;
    }

    await mission.save();

    const io = req.app.get("io");
    if (io) {
        // Emit general update
        io.emit("weekend_mission_updated", mission);
        // Also emit specific update for header refresh
        io.emit("weekend_mission_created", mission); 
    }

    res.status(200).json({ success: true, mission });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const registerGroup = async (req, res) => {
  try {
    const { id } = req.params; // missionId
    const { groupId } = req.body;
    const userId = req.user._id;

    const registration = await weekendMissionService.registerGroup(id, groupId, userId);

    res.status(201).json({ success: true, registration });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deleteWeekendMission = async (req, res) => {
    try {
        const { id } = req.params;
        const mission = await WeekendMission.findByIdAndDelete(id);
        
        if (!mission) {
            return res.status(404).json({ success: false, message: "Mission not found" });
        }

        // 🧹 Cleanup potential redis keys if we want to be thorough, 
        // but for now strict DB deletion is sufficient as redis keys expire.
        // Or we could delete the registration/progress keys.
        
        res.json({ success: true, message: "Weekend mission deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getActiveWeekendMission = async (req, res) => {
  try {
    const now = new Date();
    
    // 1. Find the current/upcoming mission
    const mission = await WeekendMission.findOne({
      status: { $in: ["pending", "active"] },
      expiresAt: { $gte: now },
    }).sort({ startsAt: 1 }).lean();

    if (!mission) {
      return res.status(200).json({ success: true, mission: null, message: "No active weekend mission" });
    }

    const hasStarted = now >= new Date(mission.startsAt);

    // 2. Check if the current user belongs to a registered group for this mission
    let registration = null;
    if (req.user) {
        // Query registrations where user is in lockedMemberIds
        registration = await WeekendMissionRegistration.findOne({
            missionId: mission._id,
            lockedMemberIds: req.user._id
        }).lean();

        // FALLBACK: If not found, check if they own any group that IS registered for this mission
        if (!registration) {
            // Find all groups owned by the user
            const ownedGroups = await Community.find({ owner: req.user._id, type: 'group' }).select('_id');
            const ownedGroupIds = ownedGroups.map(g => g._id);

            if (ownedGroupIds.length > 0) {
                registration = await WeekendMissionRegistration.findOne({
                    missionId: mission._id,
                    groupId: { $in: ownedGroupIds }
                }).lean();
            }
        }
    }

    const hasClaimed = registration?.claimedMemberIds?.some(id => id.toString() === req.user?._id?.toString());

    res.status(200).json({ 
        success: true, 
        mission,
        hasStarted,
        hasClaimed: !!hasClaimed,
        registration: registration || null
    });
  } catch (err) {
    console.error('❌ Error fetching mission:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAllWeekendMissions = async (req, res) => {
    try {
        const missions = await WeekendMission.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, missions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getGroupProgress = async (req, res) => {
  try {
    const { missionId, groupId } = req.params;

    if (!missionId || !groupId || missionId === 'undefined' || groupId === 'undefined') {
        return res.status(400).json({ success: false, message: "Invalid mission or group identifier" });
    }

    const registration = await WeekendMissionRegistration.findOne({ missionId, groupId }).lean();
    if (!registration) {
        return res.json({ success: false, notRegistered: true, message: "Group not registered" });
    }

    const groupTotalKey = `weekend:mission:${missionId}:group:${groupId}:total`;
    const userContribKey = `weekend:mission:${missionId}:group:${groupId}:users`;

    let total = await redis.get(groupTotalKey);
    let contributions = await redis.hgetall(userContribKey);

    const userIds = Object.keys(contributions || registration.userContributions || {});
    let userDetails = [];
    if (userIds.length > 0) {
        // Import User model dynamically if not imported at top, or ensure it's imported
        const { User } = await import("../models/User.js");
        userDetails = await User.find({ _id: { $in: userIds } }).select("username avatar").lean();
    }

    res.json({
      success: true,
      progress: {
          total: total !== null ? (parseInt(total) || 0) : (registration.finalTotal || 0),
          contributions: contributions || registration.userContributions || {},
          userDetails: userDetails, // Send the user details
          claimedMemberIds: registration.claimedMemberIds || [],
          source: total !== null ? "redis" : "mongo"
      }
    });
  } catch (err) {
    console.error('❌ Error progress:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateMissionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const mission = await WeekendMission.findById(id);
        if (!mission) return res.status(404).json({ success: false, message: "Mission not found" });

        if (status === "ended") {
            await weekendMissionService.syncEventResults(id);
        } else if (status === "rewarded") {
            await weekendMissionService.distributeRewards(id);
        } else {
            mission.status = status;
            await mission.save();
        }

        res.json({ success: true, message: `Status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const claimReward = async (req, res) => {
    try {
        const { id } = req.params; // missionId
        const userId = req.user._id;

        const result = await weekendMissionService.claimIndividualReward(id, userId);

        res.status(200).json({ 
            success: true, 
            message: "Reward claimed successfully!",
            rewardAmount: result.rewardAmount,
            count: result.count
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
