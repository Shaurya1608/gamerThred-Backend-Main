import { UserDailyQuest } from "../models/UserDailyQuest.js";
import { Mission } from "../models/Mission.js";
import { User } from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { calculateLevelInfo } from "../utils/progressionUtil.js";
import { updateLeaderboardScore } from "../utils/redisUtils.js";
import activityService from "../utils/activityService.js";
import mongoose from "mongoose";

export const getDailyQuests = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // 1. Check if quests are already assigned for today
    let assignments = await UserDailyQuest.find({ userId, date: todayStr }).populate({
      path: 'missionId',
      populate: { path: 'gameId' }
    });

    if (assignments.length === 0) {
      // 2. Assign 3 random daily missions
      const dailyMissions = await Mission.find({ missionType: "daily", isActive: true });
      
      if (dailyMissions.length === 0) {
        return res.status(200).json({ success: true, quests: [], message: "No daily missions available" });
      }

      // Group by gameId for diversity
      const groupedByGame = dailyMissions.reduce((acc, m) => {
        const gid = m.gameId.toString();
        if (!acc[gid]) acc[gid] = [];
        acc[gid].push(m);
        return acc;
      }, {});

      const gameIds = Object.keys(groupedByGame).sort(() => 0.5 - Math.random());
      const selected = [];
      
      // Pick 1 from each game until we have 3 or run out of games
      let gameIdx = 0;
      while (selected.length < 3 && gameIds.length > 0) {
        const gid = gameIds[gameIdx % gameIds.length];
        const gameMissions = groupedByGame[gid];
        
        if (gameMissions.length > 0) {
            const missionIdx = Math.floor(Math.random() * gameMissions.length);
            selected.push(gameMissions.splice(missionIdx, 1)[0]);
        }

        // If this game has no more missions, remove it from the list
        if (gameMissions.length === 0) {
            gameIds.splice(gameIdx % gameIds.length, 1);
            // Don't increment index if we just removed an element
        } else {
            gameIdx++;
        }
        
        if (gameIds.length === 0) break;
      }

      const newAssignments = selected.map(m => ({
        userId,
        missionId: m._id,
        date: todayStr,
        status: "assigned"
      }));

      await UserDailyQuest.insertMany(newAssignments);
      
      // Fetch again with population
      assignments = await UserDailyQuest.find({ userId, date: todayStr }).populate({
        path: 'missionId',
        populate: { path: 'gameId' }
      });
    }

    res.json({
      success: true,
      date: todayStr,
      quests: assignments.map(a => ({
        id: a._id,
        missionId: a.missionId._id,
        title: a.missionId.title,
        image: a.missionId.image,
        gameTitle: a.missionId.gameId?.title,
        gameKey: a.missionId.gameId?.gameKey,
        minScore: a.missionId.minScore,
        rewardGtc: a.missionId.rewardGtc,
        rewardXp: a.missionId.rewardXp,
        status: a.status,
        rewardClaimed: a.rewardClaimed
      }))
    });
  } catch (error) {
    console.error("getDailyQuests error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch daily quests" });
  }
};

export const claimDailyQuestReward = async (req, res) => {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { questAssignmentId } = req.body;
      const userId = req.user._id;

      const assignment = await UserDailyQuest.findById(questAssignmentId).populate('missionId').session(session);
      if (!assignment || assignment.userId.toString() !== userId.toString()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Quest assignment not found" });
      }

      if (assignment.status !== "completed") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Quest not completed yet" });
      }

      if (assignment.rewardClaimed) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Reward already claimed" });
      }

      const user = await User.findById(userId).session(session);
      
      // ⚡ APPLY ACTIVE BOOST
      // Check if boost is active
      let rewardGtc = assignment.missionId.rewardGtc;
      let rewardXp = assignment.missionId.rewardXp;

      if (user.activeBoost?.activeUntil && new Date(user.activeBoost.activeUntil) > new Date()) {
          rewardGtc *= 2;
          rewardXp *= 2;
      }

      user.gtc += rewardGtc;
      user.xp += rewardXp;
      
      assignment.rewardClaimed = true;
      
      await user.save({ session });
      await assignment.save({ session });

      // 💳 Track Transaction
      await Transaction.create([{
        userId,
        type: "MISSION_REWARD",
        amount: assignment.missionId.rewardGtc,
        currency: "GTC",
        source: `quest:${assignment._id}`
      }], { session });

      await session.commitTransaction();
      session.endSession();

      // 📈 Progression & Leaderboard Sync
      const newLevelInfo = await calculateLevelInfo(user.xp);
      await updateLeaderboardScore(user._id.toString(), user.gems || 0, user.xp || 0, user.elo || 1000);

      const io = req.app.get("io");
      if (io) {
        // Check for level up
        const oldLevelInfo = await calculateLevelInfo(user.xp - assignment.missionId.rewardXp);
        if (newLevelInfo.level > oldLevelInfo.level) {
          io.to(`user_${userId}`).emit("level_up", { 
            level: newLevelInfo.level,
            xp: user.xp,
            gtc: user.gtc
          });
          activityService.broadcastLevelUp(user, newLevelInfo.level);
        }
        io.to(`user_${userId}`).emit("wallet_update", { gtc: user.gtc, xp: user.xp });
      }

      return res.json({
        success: true,
        message: "Reward claimed!",
        reward: { gtc: assignment.missionId.rewardGtc, xp: assignment.missionId.rewardXp },
        progression: newLevelInfo
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error.name === "VersionError") {
        attempt++;
        if (attempt >= MAX_RETRIES) throw error;
        continue;
      }

      console.error("claimDailyQuestReward error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to claim reward" });
    }
  }
};
