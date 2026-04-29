import SystemSettings from "../models/SystemSettings.js";
import { SubscriptionConfig } from "../models/SubscriptionConfig.js";
import { User } from "../models/User.js";
import { Mission } from "../models/Mission.js";
import { MissionSession } from "../models/MissionSession.js";
import { Game } from "../models/Game.js";
import { UserDailyQuest } from "../models/UserDailyQuest.js";
import { calculateLevelInfo } from "../utils/progressionUtil.js";
import { validateScore, validateSessionTiming, verifySignature } from "../utils/securityUtil.js";
import { rewardQueue } from "../utils/rewardQueue.js";
import activityService from "../utils/activityService.js";
import weekendMissionService from "../utils/weekendMissionService.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { redis } from "../config/redis.js";
import { invalidateCache, invalidatePattern } from "../utils/redisUtils.js";
import { UserActiveEffect } from "../models/UserActiveEffect.js";


export const startMission = async (req, res) => {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const userId = req.user._id;
      const { missionId } = req.body;

      const mission = await Mission.findById(missionId).populate("gameId").session(session);

      if (!mission || !mission.isActive || !mission.gameId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "Mission or associated game not found/inactive",
        });
      }

      const now = new Date();
      if (now < mission.startsAt || now > mission.expiresAt) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Mission is not active at this time",
        });
      }

      // 🔒 SPECIAL MISSION ACCESS CONTROL
      if (mission.missionType === "special") {
        const user = await User.findById(userId).session(session);
        const isPremiumUser = user?.subscriptionTier === "premium" || user?.subscriptionTier === "elite";
        
        if (!isPremiumUser) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            success: false,
            message: "Special missions are only available to Premium and Elite pass holders",
            requiresSubscription: true
          });
        }
      }

      // Prevent duplicate active session
      const existing = await MissionSession.findOne({
        userId,
        missionId,
        status: "active",
      }).session(session);

      if (existing) {
        // If an active session already exists, update its lastAttemptStartedAt
        existing.lastAttemptStartedAt = new Date();
        await existing.save({ session });

        logger.info(`[MissionStart] User ${userId} is RESUMING active session ${existing._id}. No tickets deducted.`);
        
        await session.commitTransaction(); // Commit the update
        session.endSession();
        return res.status(200).json({
          success: true,
          message: "Resuming existing mission",
          session: {
            sessionId: existing._id,
            gameKey: mission.gameId?.gameKey || "unknown",
            gameId: mission.gameId?._id || mission.gameId
          }
        });
      }

      const finished = await MissionSession.findOne({
        userId,
        missionId,
        status: { $in: ["failed", "completed", "expired"] },
      }).session(session);

      if (finished) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Mission already finished (Completed or Failed)",
        });
      }

      const user = await User.findById(userId).session(session);

      // 🔄 DAILY RESET CHECK (Ensure stats are fresh at start of day)
      const nowTime = new Date();
      const lastReset = new Date(user.dailyMissionsLastReset || 0);
      if (nowTime.getDate() !== lastReset.getDate() || nowTime.getMonth() !== lastReset.getMonth() || nowTime.getFullYear() !== lastReset.getFullYear()) {
        user.dailyMissionsCompleted = 0;
        user.dailyGtcEarned = 0;
        user.dailyMissionsLastReset = nowTime;
        user.dailyGtcLastReset = nowTime;
      }

      // 🛡️ ENFORCE MISSION LIMITS (DEPRECATED: Now used only for Daily Goal tracking)
      // We no longer block mission start based on daily completion.
      // Tickets are now the primary entry gate.

      // 🎫 TICKET DEDUCTION LOGIC
      const entryFee = Number(mission.entryFeeTickets ?? 1);
      
      if (entryFee > 0) {
        if (user.tickets < entryFee) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: "Not enough Tickets to start mission",
            required: entryFee,
            balance: user.tickets
          });
        }

        user.tickets -= entryFee;
        logger.info(`[MissionStart] Deducted ${entryFee} tickets from user ${userId}. New balance: ${user.tickets}`);
        
        await redis.del(`inventory:${userId}`);
      } else if (mission.entryFeeGtc > 0) {
         // Fallback for old missions that might not have ticket fee yet (should be 0 by default but safe to keep)
          if (user.gtc < mission.entryFeeGtc) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              success: false,
              message: "Not enough GTC to start mission",
            });
          }
          user.gtc -= mission.entryFeeGtc;
      }

      // 🏎️ UPDATE LAST PLAYED & STATS
      user.lastPlayedGame = mission.gameId._id;
      user.totalMissions = (user.totalMissions || 0) + 1;
      await user.save({ session });

      const newSession = await MissionSession.create([{
        userId,
        missionId,
        gameId: mission.gameId._id,
        gameKey: mission.gameId.gameKey, 
        minScore: mission.minScore,
        minTime: mission.minTime || 0,
        attemptsUsed: 0,
        maxAttempts: mission.maxAttempts,
        rewardGtc: mission.rewardGtc,
        rewardLoyalty: mission.rewardLoyalty || 0,
        rewardXp: mission.rewardXp || 50,
        expiresAt: mission.expiresAt,
        lastAttemptStartedAt: new Date(),
        securitySecret: crypto.randomBytes(16).toString('hex')
      }], { session });

      await session.commitTransaction();
      session.endSession();

      // 🧹 INVALIDATE CACHE
      try {
          await invalidatePattern(`user_missions_v2:*${userId}`);
          await invalidatePattern("trending_missions_v2:*");
          console.log(`[Cache] Invalidated mission cache on start for user ${userId}`);
      } catch (cacheErr) {
          console.error("Cache invalidation failed (startMission):", cacheErr);
      }

      return res.status(201).json({
        success: true,
        session: {
          sessionId: newSession[0]._id,
          gameKey: mission.gameId?.gameKey || "unknown",
          gameId: newSession[0].gameId,
          attemptsLeft: newSession[0].maxAttempts,
          expiresAt: newSession[0].expiresAt,
          securitySecret: newSession[0].securitySecret
        },
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      if (err.name === "VersionError") {
        attempt++;
        if (attempt >= MAX_RETRIES) {
          logger.error("startMission failed after max retries:", err);
          return res.status(409).json({ message: "Conflict detected. Please try again." });
        }
        continue;
      }

      logger.error(`[MissionStart] Failed for user ${req.user._id}: ${err.message}`, { error: err });
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

export const completeMission = async (req, res) => {
  try {
    const { sessionId, score, distance, signature } = req.body;
    const userId = req.user._id;

  const session = await MissionSession.findById(sessionId);

  if (!session || session.userId.toString() !== userId.toString()) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }

  // 🛡️ ANTI-CHEAT VALIDATION
  const scoreValidation = await validateScore(score, session.gameId, session.lastAttemptStartedAt);
  if (!scoreValidation.isValid) {
    return res.status(400).json({ success: false, message: `Anti-cheat: ${scoreValidation.reason}` });
  }

  const timingValidation = await validateSessionTiming(session.createdAt, session.gameId);
  if (!timingValidation.isValid) {
    return res.status(400).json({ success: false, message: `Anti-cheat: ${timingValidation.reason}` });
  }

  // 🛡️ SIGNATURE VALIDATION (HMAC)
  if (session.securitySecret) {
      const isSignatureValid = verifySignature(signature, { score, sessionId }, session.securitySecret);
      if (!isSignatureValid) {
          logger.warn(`[ANTI-CHEAT] Signature mismatch for user ${userId}, session ${sessionId}. Score: ${score}, Signature: ${signature}`);
          return res.status(400).json({ success: false, message: "Security Integrity Check Failed: Signature Mismatch." });
      }
  }

  // 🛑 HARD STOP: already ended
  if (session.status !== "active") {
    return res.status(200).json({
      success: session.status === "completed",
      status: session.status,
      message: "Mission already finalized",
    });
  }

  // ⏰ Expired
  if (new Date() > session.expiresAt) {
    session.status = "expired";
    await session.save();
    return res.json({ success: false, message: "Mission expired" });
  }

  // 🔢 INCREMENT ATTEMPT FIRST
  session.attemptsUsed += 1;
  session.result = { score, distance };

  // ✅ SUCCESS (Check score AND time)
  const elapsedSeconds = (Date.now() - new Date(session.createdAt).getTime()) / 1000;
  const timeRequirementMet = elapsedSeconds >= (session.minTime || 0);

  if (score >= session.minScore && timeRequirementMet) {
    session.status = "completed";

    // 🚀 Apply Subscription XP Multiplier
    const user = await User.findById(userId);
    let finalXp = session.rewardXp || 50;
    
    if (user.subscriptionTier === "premium" || user.subscriptionTier === "elite") {
        try {
            const { SubscriptionConfig } = await import("../models/SubscriptionConfig.js");
            const config = await SubscriptionConfig.findOne({ tier: user.subscriptionTier, isActive: true });
            
            if (config?.xpMultiplier) {
               finalXp = Math.floor(finalXp * config.xpMultiplier);
            } else {
               // Fallback
               const multiplier = user.subscriptionTier === "premium" ? 1.5 : 2.0;
               finalXp = Math.floor(finalXp * multiplier);
            }
        } catch (err) {
            // Fallback on error
             const multiplier = user.subscriptionTier === "premium" ? 1.5 : 2.0;
             finalXp = Math.floor(finalXp * multiplier);
        }
    }

    // 🔁 Update Mission Stats Atomically
    await User.updateOne(
        { _id: userId },
        { 
            $inc: { dailyMissionsCompleted: 1, completedMissions: 1 },
            $unset: { lastPlayedGame: "" } 
        }
    );

    let gemReward = 0;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if ((user.dailyMissionsCompleted + 1) === 12) {
        gemReward = 5;
    }

    // 🚀 Check Active Boost Status (Centralized Hardening)
    let isAccountBoostActive = user.activeBoost?.activeUntil && new Date(user.activeBoost.activeUntil) > new Date();
    
    // 💎 Check UserActiveEffect (Temporary Inventory Boosters)
    let gtcMultiplier = isAccountBoostActive ? 2 : 1;
    let xpMultiplier = 1; // 2X Booster does NOT double XP

    const activeEffects = await UserActiveEffect.find({
        userId,
        expiresAt: { $gt: new Date() }
    });

    for (const effect of activeEffects) {
        if (effect.effectType === "gtc_multiplier") {
            gtcMultiplier = Math.max(gtcMultiplier, effect.value || 2);
        } else if (effect.effectType === "xp_multiplier") {
            xpMultiplier = Math.max(xpMultiplier, effect.value || 2);
        }

        // 🔻 CONSUME BOOST (if it has usage limits)
        if (effect.remainingUses !== null && effect.remainingUses !== undefined) {
            effect.remainingUses -= 1;
            if (effect.remainingUses <= 0) {
                await UserActiveEffect.deleteOne({ _id: effect._id });
            } else {
                await effect.save();
            }
        }
    }

    const baseGtc = session.rewardGtc;
    const totalGtc = Math.floor(baseGtc * gtcMultiplier);
    const totalXp = Math.floor(finalXp * xpMultiplier);
    const isBoostActive = gtcMultiplier > 1 || xpMultiplier > 1;

    // Reward via Queue
    await rewardQueue.add("process-reward", {
        userId,
        gtcReward: totalGtc,
        xpReward: totalXp,
        gemReward: gemReward,
        loyaltyReward: session.rewardLoyalty || 0,
        idempotencyKey: `mission:${session._id}`,
        boostApplied: isBoostActive
    });

    await session.save();

    // 🧹 INVALIDATE CACHE (Moved to run for both success and failure)
    try {
        await invalidatePattern(`user_missions_v2:*${userId}`);
        await invalidatePattern("trending_missions_v2:*");
        console.log(`[Cache] Invalidated mission cache for user ${userId}`);
    } catch (cacheErr) {
        console.error("Cache invalidation failed (completeMission):", cacheErr);
    }

    // 🔥 Check if this was a Daily Quest
    await UserDailyQuest.findOneAndUpdate(
      { userId, missionId: session.missionId, date: todayStr },
      { status: "completed" }
    );

    // 🌐 Notify real-time sync
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${userId}`).emit("mission_completed_processing", { sessionId: session._id });
    }

    // 🏆 TRACK WEEKEND MISSION PROGRESS
    try {
        await weekendMissionService.trackProgress(userId, io);
    } catch (weekendErr) {
        console.error("Weekend mission tracking failed:", weekendErr);
    }

    // 📢 GLOBAL PULSE
    activityService.broadcast({
        type: "mission",
        user: { _id: user._id, username: user.username, avatar: user.avatar?.url },
        content: `just completed a high-stakes mission and earned ${totalGtc} GTC!${(user.dailyMissionsCompleted + 1) === 12 ? " 🔥 12-MISSION STREAK HIT: +5 LOYALTY CREDITS!" : ""}`,
        metadata: { gtcReward: totalGtc, streakHit: (user.dailyMissionsCompleted + 1) === 12 }
    });


    return res.json({
      success: true,
      message: "MISSION SUCCESSFUL! Rewards are being processed.",
      status: "processing",
      reward: {
        gtc: totalGtc,
        baseGtc: baseGtc,
        xp: totalXp,
        baseXp: finalXp
      },
      isGtcBoosted: gtcMultiplier > 1,
      isXpBoosted: xpMultiplier > 1,
      minScore: session.minScore,
      attemptsLeft: Math.max(0, session.maxAttempts - session.attemptsUsed),
      sessionId: session._id
    });
  }

    // 📉 Check if failed (No attempts left)
    if (session.attemptsUsed >= session.maxAttempts) {
        session.status = "failed";
        // Clear lastPlayedGame on failure as well
        await User.updateOne({ _id: userId }, { $unset: { lastPlayedGame: "" } });
    }

    await session.save();

    // 🧹 INVALIDATE CACHE (Ensure failure also clears cache)
    try {
        await invalidatePattern(`user_missions_v2:*${userId}`);
        await invalidatePattern("trending_missions_v2:*");
    } catch (cacheErr) {}

    return res.json({
      success: false,
      message: !timeRequirementMet 
        ? `MISSION FAILED! You must play for at least ${session.minTime} seconds.`
        : "MISSION FAILED! You did not reach the target score.",
      minScore: session.minScore,
      minTime: session.minTime,
      attemptsLeft: Math.max(0, session.maxAttempts - session.attemptsUsed),
    });
  } catch (error) {
    console.error("completeMission error:", error);
    res.status(500).json({ success: false, message: "Internal server error during completion" });
  }
};


export const getActiveMissions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { gameId } = req.query;

    const now = new Date();

    const filter = {
      isActive: true,
      startsAt: { $lte: now },
      expiresAt: { $gte: now },
    };

    if (gameId) {
      filter.gameId = gameId;
    }

    // 1.5️⃣ Fetch user data first (needed for access control)
    const user = req.user ? await User.findById(req.user._id).lean() : null;

    // 🔒 ACCESS CONTROL: Filter removed to allow visibility (locked on frontend/start)
    // Premium/Elite users see ALL missions (both regular and special)

    // 1️⃣ Fetch missions
    const missions = await Mission.find(filter)
      .populate("gameId")
      .sort({ createdAt: -1 })
      .lean();
    
    // Default Limits from System Settings
    const defaultMissions = await SystemSettings.getOrInit("default_mission_limit", 10);
    
    let missionLimit = defaultMissions.value;
    
    if (user?.subscriptionTier === "premium" || user?.subscriptionTier === "elite") {
      const config = await SubscriptionConfig.findOne({ 
        tier: user.subscriptionTier, 
        isActive: true 
      });
      
      if (config) {
        missionLimit = config.missionLimit;
      } else {
        // Fallback to hardcoded values if config not found
        missionLimit = user.subscriptionTier === "premium" ? 15 : 20;
      }
    }

    // 2️⃣ Fetch sessions for this user
    const sessions = await MissionSession.find({ userId }).sort({ createdAt: 1 }).lean();

    // 3️⃣ Map sessions by missionId
    const sessionMap = {};
    sessions.forEach((s) => {
      sessionMap[s.missionId.toString()] = s;
    });

    // 4️⃣ Merge session info into mission
    const enrichedMissions = missions.map((mission) => {
      const session = sessionMap[mission._id.toString()];

      return {
        ...mission,
        sessionStatus: session?.status || null, // active | completed | failed
        attemptsLeft: session
          ? Math.max(0, session.maxAttempts - session.attemptsUsed)
          : mission.maxAttempts,
      };
    });

    res.status(200).json({
      success: true,
      missions: enrichedMissions,
      dailyMissionsCompleted: user?.dailyMissionsCompleted || 0,
      missionLimit
    });
  } catch (error) {
    console.error("getActiveMissions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch missions",
    });
  }
};



export const getTrendingMissions = async (req, res) => {
  try {
    const now = new Date();
    // Check if user is logged in (optional)
    const userId = req.user?._id; 

    const filter = {
      isActive: true,
      isTrending: true,
      startsAt: { $lte: now },
      expiresAt: { $gte: now },
    };

    // 🔒 ACCESS CONTROL: Filter removed to allow visibility
    const user = req.user ? await User.findById(req.user._id).lean() : null;

    const missions = await Mission.find(filter)
      .populate("gameId")
      .sort({ createdAt: -1 })
      .lean();

    if (!userId) {
       return res.status(200).json({
        success: true,
        missions: missions.map(m => ({...m, attemptsLeft: m.maxAttempts, sessionStatus: null})),
      });
    }

    const sessions = await MissionSession.find({ userId }).sort({ createdAt: 1 }).lean();
    const sessionMap = {};
    sessions.forEach((s) => {
      sessionMap[s.missionId.toString()] = s;
    });

    const enrichedMissions = missions.map((mission) => {
      const session = sessionMap[mission._id.toString()];
      return {
        ...mission,
        sessionStatus: session?.status || null,
        attemptsLeft: session
          ? Math.max(0, session.maxAttempts - session.attemptsUsed)
          : mission.maxAttempts,
      };
    });

    res.status(200).json({
      success: true,
      missions: enrichedMissions,
    });
  } catch (error) {
    console.error("getTrendingMissions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trending missions",
    });
  }
};

export const getMissionBySessionId = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await MissionSession.findById(sessionId).lean();
        
        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found" });
        }

        const mission = await Mission.findById(session.missionId).populate("gameId").lean();
        
        if (!mission) {
            return res.status(404).json({ success: false, message: "Mission not found" });
        }

        res.json({ success: true, mission });
    } catch (err) {
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
