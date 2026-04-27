import { ArenaChallenge } from "../models/ArenaChallenge.js";
import { User } from "../models/User.js";
import { Game } from "../models/Game.js";
import { MatchmakingQueue } from "../models/MatchmakingQueue.js";
import { ArenaQuest } from "../models/ArenaQuest.js";
import { calculateLevelInfo } from "../utils/progressionUtil.js";
import { validateScore, validateSessionTiming } from "../utils/securityUtil.js";
import { rewardQueue } from "../utils/rewardQueue.js";
import { createNotification } from "./notificationController.js";
import activityService from "../utils/activityService.js";
import { calculateTier, calculateEloChange } from "../utils/tierUtil.js";
import { updateLeaderboardScore } from "../utils/redisUtils.js";
import Transaction from "../models/Transaction.js";
import { MysteryBox } from "../models/MysteryBox.js";
import weekendMissionService from "../utils/weekendMissionService.js";
import mongoose from "mongoose";
import { UserActiveEffect } from "../models/UserActiveEffect.js";
import logger from "../utils/logger.js";

// --- HELPERS (Hoisted) ---
const getTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const updateQuestProgress = async (userId, questType, increment, io) => {
    try {
        const today = getTodayStr();
        const quest = await ArenaQuest.findOne({ userId, date: today, questType, status: "active" });
        
        if (quest) {
            const wasCompleted = quest.currentValue >= quest.targetValue;
            quest.currentValue += increment;
            
            if (quest.currentValue >= quest.targetValue) {
                quest.currentValue = quest.targetValue;
                quest.status = "completed";
                
                // 🔔 Emit socket event if this is the transition to completed
                if (!wasCompleted && io) {
                    io.to(`user_${userId}`).emit("quest_completed", {
                        questId: quest._id,
                        questType: quest.questType,
                        message: `Quest Completed: ${quest.questType.replace('_', ' ').toUpperCase()}! Extract your reward.`
                    });
                }
            }
            await quest.save();
        }
    } catch (err) {
        console.error("Error updating quest progress:", err);
    }
};
// --- REUSABLE MATCH RESOLVER ---
const resolveMatchInternal = async (challengeId, io) => {
    const session = await mongoose.startSession();
    try {
        console.log(`[Arena] Initiating atomic resolution for ${challengeId}...`);
        
        // 1. 🏁 ATOMIC STATUS LOCK (Prevents race conditions)
        const challenge = await ArenaChallenge.findOneAndUpdate(
            { _id: challengeId, status: "accepted", challengerFinished: true, opponentFinished: true },
            { $set: { status: "completed" } },
            { new: true }
        ).populate("gameId");

        if (!challenge) {
            console.log(`[Arena] Resolution skip: Match ${challengeId} already resolved or conditions not met.`);
            return;
        }

        let winnerId = null;
        if (challenge.challengerScore > challenge.opponentScore) {
            winnerId = challenge.challenger;
        } else if (challenge.opponentScore > challenge.challengerScore) {
            winnerId = challenge.opponent;
        }
        challenge.winner = winnerId;
        await challenge.save(); // Save winner selection

        const isChallengerWinner = winnerId ? winnerId.toString() === challenge.challenger.toString() : false;
        const challenger = await User.findById(challenge.challenger);
        const opponent = await User.findById(challenge.opponent);

        if (!challenger || !opponent) {
            console.error(`[Arena] Critical failure: Participants not found for ${challengeId}`);
            return;
        }

        // --- CALCULATE ELO CHANGES ---
        const eloChangeChallenger = calculateEloChange(challenger.elo || 0, opponent.elo || 0, winnerId ? isChallengerWinner : null);
        const eloChangeOpponent = calculateEloChange(opponent.elo || 0, challenger.elo || 0, winnerId ? !isChallengerWinner : null);

        // 🚀 Multiplier Helpers (Re-scoped for internal use)
        const getBoostMultipliers = async (uid) => {
            let gtcM = 1; let xpM = 1; let hasRankProtection = false;
            const user = await User.findById(uid);
            const isLegacyBoost = user.activeBoost?.activeUntil && new Date(user.activeBoost.activeUntil) > new Date();
            if (isLegacyBoost) gtcM = 2;

            const effects = await UserActiveEffect.find({ userId: uid, expiresAt: { $gt: new Date() } });
            for (const effect of effects) {
                if (effect.effectType === "gtc_multiplier") gtcM = Math.max(gtcM, effect.value || 2);
                if (effect.effectType === "xp_multiplier") xpM = Math.max(xpM, effect.value || 2);
                if (effect.effectType === "rank_protection") hasRankProtection = true;
            }
            return { gtcM, xpM, hasRankProtection };
        };

        const consumeEffect = async (uid, type) => {
            const effect = await UserActiveEffect.findOne({ userId: uid, effectType: type, expiresAt: { $gt: new Date() } });
            if (effect && effect.remainingUses !== null && effect.remainingUses !== undefined) {
                effect.remainingUses -= 1;
                if (effect.remainingUses <= 0) await UserActiveEffect.deleteOne({ _id: effect._id });
                else await effect.save();
                return true;
            }
            return false;
        };

        const totalPot = challenge.wager * 2;
        const challengerBoosts = await getBoostMultipliers(challenge.challenger);
        const opponentBoosts = await getBoostMultipliers(challenge.opponent);

        let finalGtcWinner = totalPot;
        let finalXpWinner = 100;
        let finalSeasonXpWinner = 200;
        let eloDeltaChallenger = eloChangeChallenger;
        let eloDeltaOpponent = eloChangeOpponent;

        if (winnerId) {
            const winnerBoosts = isChallengerWinner ? challengerBoosts : opponentBoosts;
            const loserBoosts = isChallengerWinner ? opponentBoosts : challengerBoosts;
            const loserId = isChallengerWinner ? challenge.opponent : challenge.challenger;

            finalGtcWinner = Math.floor(totalPot * winnerBoosts.gtcM);
            finalXpWinner = Math.floor(100 * winnerBoosts.xpM);
            finalSeasonXpWinner = Math.floor(200 * winnerBoosts.xpM);
            const finalXpLoser = Math.floor(25 * loserBoosts.xpM);
            const finalSeasonXpLoser = Math.floor(50 * loserBoosts.xpM);

            // 🛡️ RANK PROTECTION
            let rankProtectionActivated = false;
            if (isChallengerWinner) {
                if (opponentBoosts.hasRankProtection && eloDeltaOpponent < 0) {
                    eloDeltaOpponent = 0;
                    rankProtectionActivated = true;
                    await consumeEffect(loserId, "rank_protection");
                }
            } else {
                if (challengerBoosts.hasRankProtection && eloDeltaChallenger < 0) {
                    eloDeltaChallenger = 0;
                    rankProtectionActivated = true;
                    await consumeEffect(loserId, "rank_protection");
                }
            }

            if (rankProtectionActivated && io) {
                io.to(`user_${loserId}`).emit("rank_protection_activated", { message: "Rank Protection Activated! No ELO points lost." });
            }

            // Consume Multipliers
            if (challengerBoosts.gtcM > 1) await consumeEffect(challenge.challenger, "gtc_multiplier");
            if (challengerBoosts.xpM > 1) await consumeEffect(challenge.challenger, "xp_multiplier");
            if (opponentBoosts.gtcM > 1) await consumeEffect(challenge.opponent, "gtc_multiplier");
            if (opponentBoosts.xpM > 1) await consumeEffect(challenge.opponent, "xp_multiplier");

            // 🏆 REWARDS
            await rewardQueue.add("process-reward", {
                userId: winnerId,
                gtcReward: finalGtcWinner,
                xpReward: finalXpWinner,
                seasonXpReward: finalSeasonXpWinner,
                eloChange: isChallengerWinner ? eloDeltaChallenger : eloDeltaOpponent,
                outcome: "win",
                wagerEarned: challenge.wager,
                idempotencyKey: `arena_win:${challenge._id}:${winnerId}`,
                boostApplied: winnerBoosts.gtcM > 1 || winnerBoosts.xpM > 1
            });

            await rewardQueue.add("process-reward", {
                userId: loserId,
                gtcReward: 0,
                xpReward: finalXpLoser,
                seasonXpReward: finalSeasonXpLoser,
                eloChange: isChallengerWinner ? eloDeltaOpponent : eloDeltaChallenger,
                outcome: "loss",
                idempotencyKey: `arena_loss:${challenge._id}:${loserId}`,
                boostApplied: loserBoosts.xpM > 1
            });
            
            // 📦 MYSTERY BOX
            let mysteryBoxEarned = null;
            const winnerStats = isChallengerWinner ? challenger : opponent;
            const dropChance = Math.min(0.20 + ((winnerStats.arenaWinStreak || 0) * 0.05), 0.50);
            if (Math.random() < dropChance) {
                const boxes = await MysteryBox.find({ isActive: true });
                if (boxes.length > 0) mysteryBoxEarned = boxes[Math.floor(Math.random() * boxes.length)];
            }
            activityService.broadcastWin(winnerStats, totalPot);

            // 📢 SOCKET EMISSION
            if (io) {
                const challengerXp = isChallengerWinner ? finalXpWinner : finalXpLoser;
                const opponentXp = !isChallengerWinner ? finalXpWinner : finalXpLoser;
                const challengerGtc = isChallengerWinner ? finalGtcWinner : 0;
                const opponentGtc = !isChallengerWinner ? finalGtcWinner : 0;

                const emitData = (uid, ec, ne, g, x, ws, mb, gb, xb) => ({
                    challengeId: challenge._id.toString(), winnerId: winnerId.toString(), challengerId: challenge.challenger.toString(),
                    eloChange: ec, newElo: Math.max(0, ne), gtcReward: g, xpReward: x,
                    challengerScore: challenge.challengerScore, opponentScore: challenge.opponentScore,
                    winStreak: ws, mysteryBoxEarned: mb, gtcBoostApplied: gb, xpBoostApplied: xb
                });

                io.to(`user_${challenge.challenger}`).emit("arena_match_resolved", emitData(
                    challenge.challenger, eloDeltaChallenger, (challenger.elo ?? 0) + eloDeltaChallenger,
                    challengerGtc, challengerXp, isChallengerWinner ? (challenger.arenaWinStreak || 0) + 1 : 0,
                    isChallengerWinner ? mysteryBoxEarned : null, challengerBoosts.gtcM > 1, challengerBoosts.xpM > 1
                ));
                io.to(`user_${challenge.opponent}`).emit("arena_match_resolved", emitData(
                    challenge.opponent, eloDeltaOpponent, (opponent.elo ?? 0) + eloDeltaOpponent,
                    opponentGtc, opponentXp, !isChallengerWinner ? (opponent.arenaWinStreak || 0) + 1 : 0,
                    !isChallengerWinner ? mysteryBoxEarned : null, opponentBoosts.gtcM > 1, opponentBoosts.xpM > 1
                ));
            }
        } else {
            // 🤝 DRAW LOGIC
            await Promise.all([
                rewardQueue.add("process-reward", { userId: challenge.challenger, gtcReward: Math.floor(challenge.wager * challengerBoosts.gtcM), xpReward: Math.floor(50 * challengerBoosts.xpM), seasonXpReward: Math.floor(100 * challengerBoosts.xpM), eloChange: eloDeltaChallenger, outcome: "draw", idempotencyKey: `arena_draw:${challenge._id}:${challenge.challenger}`, boostApplied: challengerBoosts.gtcM > 1 || challengerBoosts.xpM > 1 }),
                rewardQueue.add("process-reward", { userId: challenge.opponent, gtcReward: Math.floor(challenge.wager * opponentBoosts.gtcM), xpReward: Math.floor(50 * opponentBoosts.xpM), seasonXpReward: Math.floor(100 * opponentBoosts.xpM), eloChange: eloDeltaOpponent, outcome: "draw", idempotencyKey: `arena_draw:${challenge._id}:${challenge.opponent}`, boostApplied: opponentBoosts.gtcM > 1 || opponentBoosts.xpM > 1 })
            ]);
            if (io) {
                const drawData = (uid, ec, ne, g, x, gb, xb) => ({
                    challengeId: challenge._id.toString(), winnerId: null, challengerId: challenge.challenger.toString(), eloChange: ec, newElo: Math.max(0, ne), gtcReward: g, xpReward: x, challengerScore: challenge.challengerScore, opponentScore: challenge.opponentScore, winStreak: 0, mysteryBoxEarned: null, gtcBoostApplied: gb, xpBoostApplied: xb
                });
                io.to(`user_${challenge.challenger}`).emit("arena_match_resolved", drawData(challenge.challenger, eloDeltaChallenger, (challenger.elo ?? 0) + eloDeltaChallenger, Math.floor(challenge.wager * challengerBoosts.gtcM), Math.floor(50 * challengerBoosts.xpM), challengerBoosts.gtcM > 1, challengerBoosts.xpM > 1));
                io.to(`user_${challenge.opponent}`).emit("arena_match_resolved", drawData(challenge.opponent, eloDeltaOpponent, (opponent.elo ?? 0) + eloDeltaOpponent, Math.floor(challenge.wager * opponentBoosts.gtcM), Math.floor(50 * opponentBoosts.xpM), opponentBoosts.gtcM > 1, opponentBoosts.xpM > 1));
            }
        }

        // 📝 QUEST PROGRESS
        updateQuestProgress(challenge.challenger, "play_matches", 1, io);
        updateQuestProgress(challenge.challenger, "wager_gtc", challenge.wager, io);
        updateQuestProgress(challenge.opponent, "play_matches", 1, io);
        updateQuestProgress(challenge.opponent, "wager_gtc", challenge.wager, io);
        if (winnerId) updateQuestProgress(winnerId, "win_matches", 1, io);

        console.log(`[Arena] Resolution successful for ${challengeId}`);
    } catch (err) {
        console.error(`[Arena] Resolution CRITICAL failure for ${challengeId}:`, err);
    } finally {
        session.endSession();
    }
};

export const createChallenge = async (req, res) => {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { opponentId, gameId, wager } = req.body;
      const challengerId = req.user._id;

      if (challengerId.toString() === opponentId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "You cannot challenge yourself" });
      }

      const challenger = await User.findById(challengerId).session(session);
      if (challenger.gtc < wager) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Insufficient GTC balance for this allocation" });
      }

      const opponent = await User.findById(opponentId).session(session);
      if (!opponent || !opponent.isOnline) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "This operative is currently offline and cannot be challenged" });
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Challenges expire in 24h

      const challenge = await ArenaChallenge.create([{
        challenger: challengerId,
        opponent: opponentId,
        gameId,
        wager,
        expiresAt
      }], { session });

      // Deduct wager from challenger immediately to "lock" it
      challenger.gtc -= wager;
      await challenger.save({ session });

      // 💳 Track Transaction
      await Transaction.create([{
        userId: challengerId,
        type: "PURCHASE", // Wager is a form of purchase/entry fee
        amount: wager,
        currency: "GTC",
        source: `arena_challenge_out:${challenge[0]._id}`
      }], { session });

      await session.commitTransaction();
      session.endSession();

      // 🔔 NOTIFY OPPONENT (Async, non-blocking)
      createNotification({
        recipientId: opponentId,
        type: "arena_challenge",
        title: "New Arena Challenge!",
        message: `${challenger.username} has challenged you to a duel for ${wager} GTC!`,
        data: { challengeId: challenge[0]._id }
      }).catch(err => console.error("Notification failed:", err));

      const io = req.app.get("io");
      if (io) {
        io.to(`user_${opponentId}`).emit("arena_challenge_received", {
          challengeId: challenge[0]._id,
          challengerName: challenger.username,
          wager,
          gameId
        });
        io.to(`user_${challengerId}`).emit("wallet_update", { gtc: challenger.gtc });
      }

      return res.status(201).json({ success: true, message: "Challenge sent!", challenge: challenge[0] });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error.name === "VersionError") {
        attempt++;
        if (attempt >= MAX_RETRIES) throw error;
        continue;
      }

      console.error("createChallenge error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to create challenge" });
    }
  }
};

export const getMyChallenges = async (req, res) => {
  try {
    const userId = req.user._id;
    const challenges = await ArenaChallenge.find({
      $or: [{ challenger: userId }, { opponent: userId }],
      status: { $in: ["pending", "accepted", "completed", "declined"] }
    })
    .populate("challenger", "username avatar subscriptionTier")
    .populate("opponent", "username avatar subscriptionTier")
    .populate("gameId", "title image")
    .sort({ createdAt: -1 });

    // SELF-HEALING: Auto-resolve any matches that are stuck in 'accepted' but both finished
    let stateChanged = false;
    for (const challenge of challenges) {
        if (challenge.status === "accepted" && challenge.challengerFinished && challenge.opponentFinished) {
            console.log(`[SELF-HEALING] Auto-resolving match from retrieval: ${challenge._id}`);
            await resolveMatchInternal(challenge._id, req.app.get("io"));
            stateChanged = true;
        }
    }

    res.json({ success: true, challenges });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch challenges" });
  }
};

export const acceptChallenge = async (req, res) => {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { challengeId } = req.body;
      const opponentId = req.user._id;

      const challenge = await ArenaChallenge.findById(challengeId).populate("gameId").populate("challenger", "username").session(session);
      if (!challenge || challenge.opponent.toString() !== opponentId.toString()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Challenge not found" });
      }

      if (challenge.status !== "pending") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Challenge is no longer pending" });
      }

      const opponent = await User.findById(opponentId).session(session);
      if (opponent.gtc < challenge.wager) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Insufficient GTC to accept this allocation" });
      }

      // Accept and record time
      challenge.status = "accepted";
      challenge.acceptedAt = new Date();
      opponent.gtc -= challenge.wager;
      
      await challenge.save({ session });
      await opponent.save({ session });

      // 💳 Track Transaction
      await Transaction.create([{
        userId: opponentId,
        type: "PURCHASE",
        amount: challenge.wager,
        currency: "GTC",
        source: `arena_challenge_out:${challenge._id}`
      }], { session });

      await session.commitTransaction();
      session.endSession();

      const io = req.app.get("io");
      if (io) {
        // Notify Challenger
        io.to(`user_${challenge.challenger._id}`).emit("arena_challenge_accepted", {
          challengeId: challenge._id.toString(),
          opponentName: opponent.username,
          gameId: challenge.gameId._id.toString(),
          gameKey: challenge.gameId.gameKey,
          gameTitle: challenge.gameId.title
        });

        // Notify Opponent (Acceptor) - This triggers the Match Countdown Modal for them too
        io.to(`user_${opponentId}`).emit("arena_challenge_accepted", {
            challengeId: challenge._id.toString(),
            opponentName: challenge.challenger.username, // Show Challenger Name as opponent
            gameId: challenge.gameId._id.toString(),
            gameKey: challenge.gameId.gameKey,
            gameTitle: challenge.gameId.title
        });

        io.to(`user_${opponentId}`).emit("wallet_update", { gtc: opponent.gtc });
      }

      return res.json({ success: true, message: "Challenge accepted! Game on.", challenge });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error.name === "VersionError") {
        attempt++;
        if (attempt >= MAX_RETRIES) throw error;
        continue;
      }

      console.error("acceptChallenge error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to accept challenge" });
    }
  }
};

export const declineChallenge = async (req, res) => {
  try {
    const { challengeId } = req.body;
    const userId = req.user._id;

    const challenge = await ArenaChallenge.findById(challengeId);
    if (!challenge || challenge.opponent.toString() !== userId.toString()) {
        return res.status(404).json({ success: false, message: "Challenge not found" });
    }

    challenge.status = "declined";
    await challenge.save();

    // Refund challenger
    const challenger = await User.findById(challenge.challenger);
    challenger.gtc += challenge.wager;
    await challenger.save();

    const io = req.app.get("io");
    if (io) {
        io.to(`user_${challenge.challenger}`).emit("arena_challenge_declined", {
            challengeId: challenge._id,
            opponentName: req.user.username
        });
        io.to(`user_${challenge.challenger}`).emit("wallet_update", { gtc: challenger.gtc });
    }

    res.json({ success: true, message: "Challenge declined" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to decline challenge" });
  }
};

export const startMatch = async (req, res) => {
  try {
    const { challengeId } = req.body;
    const userId = req.user._id;

    const challenge = await ArenaChallenge.findById(challengeId);
    if (!challenge || challenge.status !== "accepted") {
      return res.status(404).json({ success: false, message: "Active challenge not found" });
    }

    const isChallenger = challenge.challenger.toString() === userId.toString();
    const isOpponent = challenge.opponent.toString() === userId.toString();

    if (!isChallenger && !isOpponent) {
      return res.status(403).json({ success: false, message: "Not a participant in this challenge" });
    }

    if (isChallenger) {
      challenge.challengerStartedAt = new Date();
    } else {
      challenge.opponentStartedAt = new Date();
    }

    await challenge.save();

    res.json({ success: true, message: "Match started!" });
  } catch (error) {
    console.error("startMatch error:", error);
    res.status(500).json({ success: false, message: "Failed to start match" });
  }
};

export const submitArenaScore = async (req, res) => {
  try {
    const { challengeId, score } = req.body;
    const userId = req.user._id;

    const challenge = await ArenaChallenge.findById(challengeId);
    if (!challenge || challenge.status !== "accepted") {
      return res.status(404).json({ success: false, message: "Active challenge not found" });
    }

    const isChallenger = challenge.challenger.toString() === userId.toString();
    const isOpponent = challenge.opponent.toString() === userId.toString();

    if (!isChallenger && !isOpponent) {
      return res.status(403).json({ success: false, message: "Not a participant in this challenge" });
    }

    // 🛡️ PREVENT DUPLICATE SUBMISSIONS (Issue #4)
    if (isChallenger && challenge.challengerFinished) {
      return res.status(400).json({ 
        success: false, 
        message: "Score already submitted for this challenge" 
      });
    }

    if (isOpponent && challenge.opponentFinished) {
      return res.status(400).json({ 
        success: false, 
        message: "Score already submitted for this challenge" 
      });
    }

    // 🛡️ ANTI-CHEAT VALIDATION
    const playerStartTime = isChallenger ? challenge.challengerStartedAt : challenge.opponentStartedAt;
    const fallbackStartTime = challenge.acceptedAt || challenge.updatedAt;
    const startTime = playerStartTime || fallbackStartTime;

    const scoreValidation = await validateScore(score, challenge.gameId, startTime);
    if (!scoreValidation.isValid) {
      return res.status(400).json({ success: false, message: `Anti-cheat: ${scoreValidation.reason}` });
    }

    const timingValidation = await validateSessionTiming(startTime, challenge.gameId);
    if (!timingValidation.isValid) {
        return res.status(400).json({ success: false, message: `Anti-cheat: ${timingValidation.reason}` });
    }

    if (isChallenger) {
      challenge.challengerScore = score;
      challenge.challengerFinished = true;
    } else {
      challenge.opponentScore = score;
      challenge.opponentFinished = true;
    }

    // 💾 SAVE EARLY: Ensure score is recorded even if resolution crashes
    await challenge.save();

    // 🏆 TRACK WEEKEND MISSION PROGRESS
    try {
        await weekendMissionService.trackProgress(userId, req.app.get("io"));
    } catch (weekendErr) {
        console.error("Weekend mission tracking failed (Arena):", weekendErr);
    }

    // 📢 NOTIFY WAITING STATE (Issue #3)
    const io = req.app.get("io");
    if (io && (!challenge.challengerFinished || !challenge.opponentFinished)) {
      // One player finished, notify both
      if (isChallenger && !challenge.opponentFinished) {
        io.to(`user_${userId}`).emit("arena_waiting", {
          message: "Score submitted! Waiting for opponent to finish...",
          yourScore: score
        });
        io.to(`user_${challenge.opponent}`).emit("arena_opponent_finished", {
          message: "Your opponent has finished! Complete your game."
        });
      } else if (isOpponent && !challenge.challengerFinished) {
        io.to(`user_${userId}`).emit("arena_waiting", {
          message: "Score submitted! Waiting for opponent to finish...",
          yourScore: score
        });
        io.to(`user_${challenge.challenger}`).emit("arena_opponent_finished", {
          message: "Your opponent has finished! Complete your game."
        });
      }
    }
    // Resolve match if both finished
    if (challenge.challengerFinished && challenge.opponentFinished) {
        await resolveMatchInternal(challenge._id, req.app.get("io"));
    }

    return res.json({ success: true, message: "Score submitted!", challenge });
  } catch (error) {
    console.error("submitArenaScore CRITICAL ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to submit score", stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
};

export const joinGlobalQueue = async (req, res) => {
    try {
        const userId = req.user._id;
        const { gameId, wager = 100, isGlobal = false } = req.body;

        if (!gameId && !isGlobal) {
            return res.status(400).json({ success: false, message: "Game Protocol required" });
        }

        const user = await User.findById(userId);
        if (user.gtc < wager) {
            return res.status(400).json({ success: false, message: "Insufficient GTC for matchmaking" });
        }

        // 1. Check if already in queue
        const existing = await MatchmakingQueue.findOne({ userId });
        if (existing) {
            existing.elo = user.elo ?? 0;
            await existing.save();
            return res.json({ success: true, message: "Already searching for a match", status: "searching" });
        }

        // 2. Check for UNFINISHED active duels
        const activeDuel = await ArenaChallenge.findOne({
            status: "accepted",
            $or: [
                { challenger: userId, challengerFinished: false },
                { opponent: userId, opponentFinished: false }
            ]
        });

        if (activeDuel) {
            // SELF-HEALING: If BOTH finished but status is stuck, auto-resolve here
            if (activeDuel.challengerFinished && activeDuel.opponentFinished) {
                console.log(`[SELF-HEALING] Resolving stuck match ${activeDuel._id} for user ${userId}`);
                activeDuel.status = "completed";
                await activeDuel.save();
                // Match is now resolved, proceed to join queue
            } else {
                return res.status(400).json({ 
                    success: false, 
                    message: "Finish your current combat phase before starting a new one!" 
                });
            }
        }

        // 2. Add to queue with CURRENT ELO and username (for zero-read notifications)
        await MatchmakingQueue.create({ 
            userId, 
            username: user.username,
            gameId, 
            wager, 
            isGlobal, 
            elo: user.elo ?? 0 
        });

        return res.json({ 
            success: true, 
            message: "Matchmaking protocol initiated. Searching...", 
            status: "searching" 
        });

    } catch (err) {
        console.error("Matchmaking error:", err);
        res.status(500).json({ success: false, message: "Matchmaking protocol failed" });
    }
};

export const leaveGlobalQueue = async (req, res) => {
    try {
        await MatchmakingQueue.deleteOne({ userId: req.user._id });
        res.json({ success: true, message: "Matchmaking cancelled" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Cancel protocol failed" });
    }
};

// --- ARENA LEADERBOARD ---
export const getArenaLeaderboard = async (req, res) => {
    try {
        const leaderboard = await User.find({ 
            $or: [
                { arenaWins: { $gt: 0 } },
                { arenaGtcEarned: { $gt: 0 } }
            ]
        })
        .select("username avatar elo tier arenaWins arenaLosses arenaGtcEarned subscriptionTier")
        .sort({ arenaWins: -1, arenaGtcEarned: -1 })
        .limit(50);

        res.json({ success: true, leaderboard });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch leaderboard" });
    }
};

// --- GLOBAL ACTIVE MATCHES ---
export const getGlobalActiveMatches = async (req, res) => {
    try {
        const matches = await ArenaChallenge.find({ status: "accepted" })
            .populate("challenger", "username avatar subscriptionTier")
            .populate("opponent", "username avatar subscriptionTier")
            .populate("gameId", "title image")
            .limit(10)
            .sort({ updatedAt: -1 });

        res.json({ success: true, matches });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch live matches" });
    }
};

// --- ARENA QUESTS ---
export const getArenaQuests = async (req, res) => {
    try {
        const userId = req.user._id;
        const today = getTodayStr();

        let quests = await ArenaQuest.find({ userId, date: today });

        if (quests.length === 0) {
            // Assign 3 default daily quests
            const newQuests = [
                { userId, date: today, questType: "play_matches", targetValue: 3, rewardGtc: 20, rewardXp: 100 },
                { userId, date: today, questType: "win_matches", targetValue: 1, rewardGtc: 50, rewardXp: 200 },
                { userId, date: today, questType: "wager_gtc", targetValue: 50, rewardGtc: 30, rewardXp: 150 }
            ];
            quests = await ArenaQuest.insertMany(newQuests);
        }

        res.json({ success: true, quests });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch arena quests" });
    }
};

export const claimArenaQuestReward = async (req, res) => {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { questId } = req.body;
            const userId = req.user._id;

            const quest = await ArenaQuest.findById(questId).session(session);
            if (!quest || quest.userId.toString() !== userId.toString()) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ success: false, message: "Quest not found" });
            }

            if (quest.status !== "completed") {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ success: false, message: "Quest not completed" });
            }

            if (quest.status === "claimed") {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ success: false, message: "Reward already claimed" });
            }

            const user = await User.findById(userId).session(session);
            const oldLevelInfo = await calculateLevelInfo(user.xp);

            user.gtc += quest.rewardGtc;
            user.xp += quest.rewardXp;
            quest.status = "claimed";

            await user.save({ session });
            await quest.save({ session });

            // 💳 Track Transaction
            await Transaction.create([{
                userId,
                type: "MISSION_REWARD",
                amount: quest.rewardGtc,
                currency: "GTC",
                source: `arena_quest:${quest._id}`
            }], { session });

            await session.commitTransaction();
            session.endSession();

            const newLevelInfo = await calculateLevelInfo(user.xp);

            // 📈 Sync to Redis Leaderboard (Priority: Gems > XP > Elo)
            await updateLeaderboardScore(userId.toString(), user.gems || 0, user.xp || 0, user.elo ?? 0);

            const io = req.app.get("io");
            if (io) {
                if (newLevelInfo.level > oldLevelInfo.level) {
                    io.to(`user_${userId}`).emit("level_up", { 
                        level: newLevelInfo.level,
                        xp: user.xp,
                        gtc: user.gtc
                    });
                    // Optional: Broadcast Level Up
                    activityService.broadcastLevelUp(user, newLevelInfo.level);
                }
                io.to(`user_${userId}`).emit("wallet_update", { gtc: user.gtc, xp: user.xp });
            }

            return res.json({ success: true, message: "Reward claimed!", reward: { gtc: quest.rewardGtc, xp: quest.rewardXp } });
        } catch (err) {
            await session.abortTransaction();
            session.endSession();

            if (err.name === "VersionError") {
                attempt++;
                if (attempt >= MAX_RETRIES) throw err;
                continue;
            }

            console.error("claimQuestReward error:", err);
            return res.status(500).json({ success: false, message: err.message || "Failed to claim reward" });
        }
    }
};

export const restoreArenaWinStreak = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = req.user._id;
        const user = await User.findById(userId).session(session);

        if (user.arenaWinStreakRestoreUsed) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: "Arena win streak restoration already used once" });
        }

        if (user.gems < 20) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: "Insufficient Loyalty Credits (Gems)" });
        }

        if (!user.lastBrokenArenaWinStreak || user.lastBrokenArenaWinStreak === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: "No broken win streak to restore" });
        }

        // Restore the streak
        const restoredCount = user.lastBrokenArenaWinStreak;
        user.arenaWinStreak = restoredCount;
        user.lastBrokenArenaWinStreak = 0;
        user.arenaWinStreakRestoreUsed = true;
        user.gems -= 20;

        // Record transaction
        await Transaction.create([{
            userId: user._id,
            type: "PURCHASE",
            amount: 20,
            currency: "GEMS",
            source: "arena_streak_restoration"
        }], { session });

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        const io = req.app.get("io");
        if (io) {
            io.to(`user_${user._id}`).emit("wallet_update", { 
                gems: user.gems,
                arenaWinStreak: user.arenaWinStreak,
                lastBrokenArenaWinStreak: user.lastBrokenArenaWinStreak,
                arenaWinStreakRestoreUsed: user.arenaWinStreakRestoreUsed
            });
        }

        return res.json({
            success: true,
            message: "Win Streak restored successfully!",
            restoredCount,
            newGemsBalance: user.gems
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error("restoreArenaWinStreak error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to restore win streak" });
    }
};

export const dismissArenaWinRestore = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.lastBrokenArenaWinStreak = 0;
        await user.save();
        return res.json({ success: true, message: "Restoration dismissed" });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to dismiss" });
    }
};


