import { Queue, Worker } from "bullmq";
import { bullRedis as connection } from "../config/redis.js";
import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import { User } from "../models/User.js";
import { calculateLevelInfo } from "./progressionUtil.js";
import activityService from "./activityService.js";
import { updateLeaderboardScore } from "./redisUtils.js";

// Configure Queue with default job options for resilience (Scaling Phase 1)
export const rewardQueue = new Queue("reward-processing", { 
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true, // Save Redis memory
    removeOnFail: false,    // Keep for debugging DLQ
  }
});

// Worker Setup
export const setupRewardWorker = (io) => {
  const worker = new Worker(
    "reward-processing",
    async (job) => {
      const { 
        userId, 
        gtcReward, 
        xpReward, 
        gemReward = 0, 
        seasonXpReward = 0, 
        eloChange = 0,
        outcome = null,
        wagerEarned = 0,
        loyaltyReward = 0,
        idempotencyKey,
        boostApplied = false
      } = job.data;

      // 1. 🛡️ ATOMIC IDEMPOTENCY CHECK (Transaction logging first to "reserve" the reward)
      const session = await mongoose.startSession();
      try {
        const result = await session.withTransaction(async () => {
          if (idempotencyKey) {
            const existingTx = await Transaction.findOne({ idempotencyKey }).session(session);
            if (existingTx) return { skipped: true, reason: "Duplicate" };
          }

          // Fetch current state for level/tier logic
          const userBefore = await User.findById(userId).session(session).lean();
          if (!userBefore) throw new Error("User not found");

          const oldLevelInfo = await calculateLevelInfo(userBefore.xp);
          const oldSeasonLevel = userBefore.seasonLevel || 1;
          const oldTier = userBefore.tier || "BRONZE";

          // Calculate rewards
          let finalGtcReward = gtcReward;
          let finalGemReward = gemReward;
          const isBoostActive = userBefore.activeBoost?.activeUntil && new Date(userBefore.activeBoost.activeUntil) > new Date();
          
          if (isBoostActive && !boostApplied) {
            finalGtcReward *= 2;
            finalGemReward *= 2;
          }

          // 2. ⚡ ATOMIC BALANCE UPDATE
          const updateObj = {
            $inc: {
              gtc: finalGtcReward,
              gems: finalGemReward,
              xp: xpReward,
              seasonXp: seasonXpReward,
              loyaltyCredits: loyaltyReward,
              dailyGtcEarned: finalGtcReward,
              arenaWins: outcome === "win" ? 1 : 0,
              arenaLosses: outcome === "loss" ? 1 : 0,
              arenaDraws: outcome === "draw" ? 1 : 0,
              arenaGtcEarned: outcome === "win" ? wagerEarned : 0
            }
          };

          if (eloChange !== 0) updateObj.$inc.elo = eloChange;

          if (outcome === "win") {
              updateObj.$inc.arenaWinStreak = 1;
          } else if (outcome === "loss" || outcome === "draw") {
              updateObj.$set = { arenaWinStreak: 0 };
          }

          const userAfter = await User.findOneAndUpdate(
            { _id: userId },
            updateObj,
            { session, new: true, runValidators: true }
          );

          // 3. 📝 LOG TRANSACTIONS (Batch log)
          const txs = [];
          if (finalGtcReward > 0) txs.push({ userId, type: "MISSION_REWARD", amount: finalGtcReward, currency: "GTC", idempotencyKey });
          if (finalGemReward > 0) txs.push({ userId, type: "STREAK_BONUS", amount: finalGemReward, currency: "GEMS", idempotencyKey: `gems_${idempotencyKey}` });
          
          if (txs.length > 0) await Transaction.insertMany(txs, { session });

          return { 
            skipped: false, 
            user: userAfter, 
            oldLevelInfo, 
            leveledUp: (await calculateLevelInfo(userAfter.xp)).level > oldLevelInfo.level,
            seasonLeveledUp: userAfter.seasonLevel > oldSeasonLevel,
            tierChanged: userAfter.tier !== oldTier,
            finalGtcReward,
            finalXpReward: xpReward
          };
        });

        if (result.skipped) return result;

        // Emit socket events
        const { user: userAfter, leveledUp, seasonLeveledUp, tierChanged, finalGtcReward, finalXpReward } = result;
        await updateLeaderboardScore(userId, userAfter.gems, userAfter.xp, userAfter.elo);

        if (io) {
          const room = `user_${userId}`;
          io.to(room).emit("mission_reward_processed", { gtc: finalGtcReward, xp: finalXpReward, outcome });
          io.to(room).emit("wallet_update", { 
            gtc: userAfter.gtc, gems: userAfter.gems, xp: userAfter.xp, 
            tier: userAfter.tier, leveledUp
          });
        }
        return { success: true };
      } catch (err) {
        console.error(`[RewardWorker] Failed for user ${userId}:`, err.message);
        throw err; // BullMQ will retry based on exponential backoff
      } finally {
        session.endSession();
      }
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed!`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job.id} failed: ${err.message}`);
  });

  return worker;
};
