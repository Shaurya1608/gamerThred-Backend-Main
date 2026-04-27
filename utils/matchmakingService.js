import { MatchmakingQueue } from "../models/MatchmakingQueue.js";
import { ArenaChallenge } from "../models/ArenaChallenge.js";
import { User } from "../models/User.js";
import { Game } from "../models/Game.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import cacheService from "./cacheService.js";
import logger from "./logger.js";
import { performance } from "perf_hooks";

/**
 * Matchmaking Service
 * Handles periodic queue processing with expanding ELO ranges.
 */
class MatchmakingService {
    constructor() {
        this.io = null;
        this.isRunning = false;
        this.interval = null;
    }

    /**
     * Initialize the background worker
     * @param {Object} io - Socket.io instance
     */
    init(io) {
        this.io = io;
        if (!this.interval) {
            // Scaled to 1 second frequency in Phase 1.5 (Algorithm-limited -> Frequency-limited)
            this.interval = setInterval(() => this.processQueue(), 1000); 
            console.log("MatchmakingService initialized and running (Scalability Optimized)");
        }
    }

    /**
     * Main processing loop - Ultra-fast O(n) in-memory pairing
     */
    async processQueue() {
        if (this.isRunning) return;
        
        // 🛡️ CONNECTION GUARD
        if (mongoose.connection.readyState !== 1) {
            logger.warn("Matchmaking skipped: Database not connected.");
            return;
        }

        this.isRunning = true;

        const startTime = performance.now();
        const now = Date.now();
        
        try {
            // 1. ATOMIC LOCK: Mark a batch of 150 users as 'processing'
            const pendingBatch = await MatchmakingQueue.find({ status: "waiting" })
                .sort({ joinedAt: 1 })
                .limit(150)
                .select("_id")
                .lean();

            if (pendingBatch.length < 2) {
                this.isRunning = false;
                return;
            }

            const idsToProcess = pendingBatch.map(doc => doc._id);
            await MatchmakingQueue.updateMany(
                { _id: { $in: idsToProcess } },
                { $set: { status: "processing" } }
            );

            // 2. FETCH locked candidates (now includes username)
            const candidates = await MatchmakingQueue.find({ 
                _id: { $in: idsToProcess },
                status: "processing" 
            }).lean();
            
            // 3. IN-MEMORY PAIRING (O(n) after sorting)
            const groupsByWager = {};
            for (const c of candidates) {
                if (!groupsByWager[c.wager]) groupsByWager[c.wager] = [];
                groupsByWager[c.wager].push(c);
            }

            const matchesToCreate = [];
            const matchedIds = new Set();
            const activeGames = await cacheService.getActiveGames();

            for (const wager in groupsByWager) {
                const group = groupsByWager[wager].sort((a, b) => a.elo - b.elo);

                for (let i = 0; i < group.length - 1; i++) {
                    const userA = group[i];
                    if (matchedIds.has(userA._id.toString())) continue;

                    const waitTime = (now - new Date(userA.joinedAt).getTime()) / 1000;
                    let range = 200; 
                    if (waitTime >= 15) range = 9999; 
                    else if (waitTime >= 10) range = 800;
                    else if (waitTime >= 5) range = 400;

                    for (let j = i + 1; j < group.length; j++) {
                        const userB = group[j];
                        if (matchedIds.has(userB._id.toString())) continue;

                        if (Math.abs(userA.elo - userB.elo) > range) break;

                        let finalGameId = null;
                        if (userA.isGlobal && userB.isGlobal) {
                            if (activeGames.length > 0) finalGameId = activeGames[Math.floor(Math.random() * activeGames.length)]._id;
                        } else if (userA.isGlobal && !userB.isGlobal) {
                            finalGameId = userB.gameId;
                        } else if (!userA.isGlobal && userB.isGlobal) {
                            finalGameId = userA.gameId;
                        } else if (userA.gameId.toString() === userB.gameId.toString()) {
                            finalGameId = userA.gameId;
                        }

                        if (finalGameId) {
                            matchedIds.add(userA._id.toString());
                            matchedIds.add(userB._id.toString());
                            matchesToCreate.push({ userA, userB, gameId: finalGameId });
                            break;
                        }
                    }
                }
            }

            // 4. BULK DATABASE OPERATIONS
            if (matchesToCreate.length > 0) {
                await this.bulkExecuteMatches(matchesToCreate);
                logger.info(`Match batch created: ${matchesToCreate.length} matches synchronized.`);
            }

            // 5. CLEANUP
            const matchedEntryIds = Array.from(matchedIds).map(id => new mongoose.Types.ObjectId(id));
            const unmatchedIds = idsToProcess.filter(id => !matchedIds.has(id.toString()));

            if (unmatchedIds.length > 0) {
                await MatchmakingQueue.updateMany(
                    { _id: { $in: unmatchedIds } },
                    { $set: { status: "waiting" } }
                );
            }
            if (matchedEntryIds.length > 0) {
                await MatchmakingQueue.deleteMany({ _id: { $in: matchedEntryIds } });
            }

        } catch (error) {
            logger.error("Matchmaking Loop Error:", error);
        } finally {
            this.isRunning = false;
            const duration = performance.now() - startTime;
            
            if (duration > 500) {
                logger.warn(`Slow matchmaking tick: ${duration.toFixed(2)}ms`);
            } else {
                logger.debug(`Matchmaking tick: ${duration.toFixed(2)}ms`);
            }
        }
    }

    /**
     * Executes multiple matches in batches using bulk operations (O(1) DB calls per collection)
     */
    async bulkExecuteMatches(matches) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const userUpdates = [];
                const challengeCreations = [];
                const transactionLogs = [];
                const expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + 24);

                for (const match of matches) {
                    const { userA, userB, gameId } = match;
                    const challengeId = new mongoose.Types.ObjectId();
                    match.challengeId = challengeId; // Store for notification

                    // Order: 1. Balance Update -> 2. Transactions -> 3. Challenge
                    userUpdates.push({
                        updateOne: {
                            filter: { _id: userA.userId },
                            update: { $inc: { gtc: -userA.wager } }
                        }
                    }, {
                        updateOne: {
                            filter: { _id: userB.userId },
                            update: { $inc: { gtc: -userB.wager } }
                        }
                    });

                    transactionLogs.push({
                        userId: userA.userId,
                        type: "PURCHASE",
                        amount: userA.wager,
                        currency: "GTC",
                        source: `arena_match_out:${challengeId}`
                    }, {
                        userId: userB.userId,
                        type: "PURCHASE",
                        amount: userB.wager,
                        currency: "GTC",
                        source: `arena_match_out:${challengeId}`
                    });

                    challengeCreations.push({
                        _id: challengeId,
                        challenger: userA.userId,
                        opponent: userB.userId,
                        gameId: gameId,
                        wager: userA.wager,
                        status: "accepted",
                        expiresAt
                    });
                }

                if (userUpdates.length > 0) await User.bulkWrite(userUpdates, { session });
                if (transactionLogs.length > 0) await Transaction.insertMany(transactionLogs, { session });
                if (challengeCreations.length > 0) await ArenaChallenge.insertMany(challengeCreations, { session });
            });

            // 📡 ZERO-READ BULK NOTIFICATIONS (No extra DB queries!)
            const gameCache = {};
            for (const match of matches) {
                const game = await cacheService.getGame(match.gameId);
                const matchInfo = {
                    challengeId: match.challengeId.toString(),
                    gameId: match.gameId.toString(),
                    gameTitle: game.title,
                    gameKey: game.gameKey,
                    wager: match.userA.wager,
                };

                this.io.to(`user_${match.userA.userId}`).emit("arena_match_found", { 
                    ...matchInfo, 
                    opponentName: match.userB.username, 
                    role: "challenger" 
                });
                
                this.io.to(`user_${match.userB.userId}`).emit("arena_match_found", { 
                    ...matchInfo, 
                    opponentName: match.userA.username, 
                    role: "opponent" 
                });
            }

        } catch (error) {
            console.error("[Matchmaking] Bulk Execution Error:", error);
        } finally {
            session.endSession();
        }
    }
}

export default new MatchmakingService();
