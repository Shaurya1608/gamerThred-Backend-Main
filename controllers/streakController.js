import { User } from "../models/User.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import activityService from "../utils/activityService.js";
import { updateLeaderboardScore } from "../utils/redisUtils.js";
import { UserActiveEffect } from "../models/UserActiveEffect.js";

export const getStreakInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const now = new Date();
    // Normalize to UTC midnight
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const today = new Date(todayUTC);
    
    let canClaim = false;
    let effectiveStreakCount = user.streakCount;
    let effectiveClaimedToday = user.streakClaimedToday;
    let canRestore = false;
    let brokenStreakCount = user.lastBrokenStreakCount || 0;
    
    if (!user.lastLoginDate) {
      canClaim = true;
      effectiveClaimedToday = false;
      effectiveStreakCount = 0;
    } else {
      const lastLogin = new Date(user.lastLoginDate);
      const lastLoginDayUTC = Date.UTC(lastLogin.getUTCFullYear(), lastLogin.getUTCMonth(), lastLogin.getUTCDate());
      
      const diffTime = todayUTC - lastLoginDayUTC;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 1) {
        canClaim = true;
        effectiveClaimedToday = false;
        if (diffDays > 1) {
          // Streak broken
          effectiveStreakCount = 0;
          // Offer restoration if not used and we have a record of the broken streak
          if (!user.streakRestoreUsed && user.lastBrokenStreakCount > 0) {
            canRestore = true;
          }
        }
      } else {
        // Same day (diffDays < 1)
        canClaim = !user.streakClaimedToday;
        effectiveClaimedToday = user.streakClaimedToday;
      }
    }

    const nextClaimTime = new Date(todayUTC + (1000 * 60 * 60 * 24));

    // 🏁 Check and grant daily Active Boost
    try {
      const { checkAndGrantBoost } = await import("./activeBoostController.js");
      await checkAndGrantBoost(user);
    } catch (boostErr) {
      console.error("[Boost] Grant skip:", boostErr);
    }

    // Calculate next boost available time (strict 24h after activation ended)
    let nextBoostAvailableAt = null;
    if (user.subscriptionTier && user.subscriptionTier !== "none") {
      if (user.activeBoost?.isUsed && user.activeBoost?.activeUntil) {
        const lastActivationEnd = new Date(user.activeBoost.activeUntil);
        const nextGrantTime = new Date(lastActivationEnd.getTime() + (24 * 60 * 60 * 1000));
        nextBoostAvailableAt = nextGrantTime.toISOString();
      }
    }

    res.json({
      success: true,
      streakCount: effectiveStreakCount,
      streakClaimedToday: effectiveClaimedToday,
      canClaim,
      canRestore,
      brokenStreakCount,
      nextClaimTime: nextClaimTime.toISOString(),
      activeBoost: user.activeBoost,
      activeEffects: await UserActiveEffect.find({ userId: req.user._id, expiresAt: { $gt: now } }),
      nextBoostAvailableAt
    });
  } catch (error) {
    console.error("getStreakInfo error:", error);
    res.status(500).json({ success: false, message: "Failed to get streak info" });
  }
};

export const claimDailyReward = async (req, res) => {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(req.user._id).session(session);
      const now = new Date();
      const todayStrUTC = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
      const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

      // Check if already claimed today using server state
      if (user.lastLoginDate) {
        const lastLogin = new Date(user.lastLoginDate);
        const lastLoginDayUTC = Date.UTC(lastLogin.getUTCFullYear(), lastLogin.getUTCMonth(), lastLogin.getUTCDate());
        
        if (todayUTC - lastLoginDayUTC === 0) {
          if (user.streakClaimedToday) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: "Already claimed today" });
          }
        }
      }

      // Determine streak increment
      if (!user.lastLoginDate) {
        user.streakCount = 1;
      } else {
        const lastLogin = new Date(user.lastLoginDate);
        const lastLoginDayUTC = Date.UTC(lastLogin.getUTCFullYear(), lastLogin.getUTCMonth(), lastLogin.getUTCDate());
        const diffDays = Math.floor((todayUTC - lastLoginDayUTC) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          user.streakCount += 1;
        } else if (diffDays > 1) {
          // Save the streak count before resetting if it was broken
          user.lastBrokenStreakCount = user.streakCount;
          user.streakCount = 1;
        } else if (diffDays === 0) {
           await session.abortTransaction();
           session.endSession();
           return res.status(400).json({ success: false, message: "Already claimed today" });
        }
      }

      // Reward Logic
      let rewardGtc = 50 + (user.streakCount * 10);
      let rewardGems = 0;

      // Special milestone rewards (Every 7 days)
      if (user.streakCount > 0 && user.streakCount % 7 === 0) {
        rewardGtc += 500;
        rewardGems += 5;
        const milestoneTitle = `Streak Legend`;
        if (!user.titles.includes(milestoneTitle)) {
            user.titles.push(milestoneTitle);
        }
      }

      // ⚡ APPLY ACTIVE BOOST
      // Check if boost is active
      if (user.activeBoost?.activeUntil && new Date(user.activeBoost.activeUntil) > now) {
          rewardGtc *= 2;
          rewardGems *= 2;
          console.log(`[Streak] Active Account Boost Applied! Doubling rewards for user ${user._id}`);
      }

      user.gtc += rewardGtc;
      user.gems += rewardGems;
      user.streakClaimedToday = true;
      user.lastLoginDate = now;

      // 💳 Track Transactions
      const transactions = [
        {
          userId: user._id,
          type: "STREAK_REWARD",
          amount: rewardGtc,
          currency: "GTC",
          source: `streak:gtc:${user._id}:${todayStrUTC}`
        }
      ];

      if (rewardGems > 0) {
        transactions.push({
          userId: user._id,
          type: "STREAK_REWARD",
          amount: rewardGems,
          currency: "GEMS",
          source: `streak:gems:${user._id}:${todayStrUTC}`
        });
      }

      await Transaction.insertMany(transactions, { session, ordered: true });
      await user.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Side Effects (After successful commit)
      if (user.streakCount > 0 && user.streakCount % 7 === 0) {
          activityService.broadcast({
              type: "loot",
              user: { _id: user._id, username: user.username, avatar: user.avatar?.url },
              content: `just hit a ${user.streakCount}-DAY STREAK and unlocked the [Streak Legend] Title!`,
              metadata: { rarity: "legendary" }
          });
      }

      const io = req.app.get("io");
      if (io) {
        io.to(`user_${user._id}`).emit("wallet_update", { gtc: user.gtc, gems: user.gems });
      }

      // 📈 Sync to Redis Leaderboard (Fire-and-forget)
      updateLeaderboardScore(user._id.toString(), user.gems || 0, user.xp || 0, user.elo || 1000);

      const nextClaimTime = new Date(todayUTC + (1000 * 60 * 60 * 24));

      return res.json({
        success: true,
        message: "Daily reward claimed!",
        streakCount: user.streakCount,
        streakClaimedToday: true,
        canClaim: false,
        nextClaimTime: nextClaimTime.toISOString(),
        reward: { gtc: rewardGtc, gems: rewardGems }
      });

    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();

      if (error.name === "VersionError") {
        attempt++;
        if (attempt >= MAX_RETRIES) throw error;
        continue;
      }

      // Handle unique constraint (double-claim safety)
      if (error.code === 11000) {
         return res.status(400).json({ success: false, message: "Already claimed today" });
      }

      console.error("claimDailyReward error:", error);
      
      // 💡 HINT: Check for Replica Set requirement for transactions
      if (error.message && error.message.includes("Transaction numbers are only allowed")) {
          return res.status(500).json({ 
              success: false, 
              message: "Database Error: Replica Set required for transactions. (Local MongoDB usage detected?)",
              devHint: "Convert local Mongo to Replica Set or disable transactions in dev."
          });
      }

      return res.status(500).json({ 
          success: false, 
          message: error.message || "Failed to claim reward" 
      });
    }
  }
};

export const restoreStreak = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(req.user._id).session(session);
    
    if (user.streakRestoreUsed) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Streak restoration already used once" });
    }

    if (user.gems < 20) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Insufficient Loyalty Credits (Gems)" });
    }

    if (!user.lastBrokenStreakCount || user.lastBrokenStreakCount === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "No broken streak to restore" });
    }

    // Restore the streak
    const restoredCount = user.lastBrokenStreakCount;
    user.streakCount = restoredCount;
    user.lastBrokenStreakCount = 0;
    user.streakRestoreUsed = true;
    user.gems -= 20;

    // Record transaction
    await Transaction.create([{
      userId: user._id,
      type: "PURCHASE",
      amount: 20,
      currency: "GEMS",
      source: "streak_restoration"
    }], { session });

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    const io = req.app.get("io");
    if (io) {
      io.to(`user_${user._id}`).emit("wallet_update", { gems: user.gems });
    }

    return res.json({
      success: true,
      message: "Streak restored successfully!",
      restoredCount,
      newGemsBalance: user.gems
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("restoreStreak error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to restore streak" });
  }
};



