import { MysteryBox } from "../models/MysteryBox.js";
import { User } from "../models/User.js";
import { Transaction } from "../models/Transaction.js";
import * as inventoryService from "../services/inventoryService.js";
import { redis } from "../config/redis.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";

// Helper for Weighted Random Selection
const selectReward = (rewards) => {
    const totalWeight = rewards.reduce((acc, r) => acc + r.weight, 0);
    let random = Math.random() * totalWeight;
    
    // Weighted selection logic
    for (const reward of rewards) {
        if (random < reward.weight) return reward;
        random -= reward.weight;
    }
    // Fallback if weights don't sum up perfectly
    return rewards[rewards.length - 1]; 
};

export const getBoxes = async (req, res) => {
    try {
        const boxes = await MysteryBox.find({ active: true }).sort("order");
        res.json({ success: true, boxes });
    } catch (error) {
        logger.error("Get Boxes Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch boxes" });
    }
};

export const openBox = async (req, res) => {
    const { boxCode } = req.body;
    const userId = req.user._id.toString();

    // 1. Redis Lock to prevent exploit (Critical Requirement)
    const lockKey = `lock:box:${userId}`;
    const acquired = await redis.set(lockKey, "1", "NX", "EX", 10); // 10s lock to be safe for transactions
    if (!acquired) {
        return res.status(429).json({ success: false, message: "Please wait... opening in progress." });
    }

    // 2. Start Session for Atomic Transaction (Industry Standard)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findById(userId).session(session);
        const box = await MysteryBox.findOne({ code: boxCode }).session(session);

        if (!user) throw new Error("User not found");
        if (!box) throw new Error("Box not found");
        if (!box.active) throw new Error("Box is unavailable");

        if (user.gtc < box.cost) {
            await session.abortTransaction();
            session.endSession();
            await redis.del(lockKey);
            return res.status(400).json({ success: false, message: `Need ${box.cost} GTC!` });
        }

        // 3. Select Reward Logic
        let reward = selectReward(box.rewards);

        // 4. Pity System (Critical Requirement)
        const RARE_THRESHOLD = 20;
        if (user.boxOpensSinceLastRare >= RARE_THRESHOLD && !reward.isRare) {
            logger.info(`[Pity System] User ${userId} triggered Pity! Force RARE.`);
            const rarePool = box.rewards.filter(r => r.isRare);
            if (rarePool.length > 0) {
                reward = selectReward(rarePool);
            }
        }

        // 5. Update User State
        user.gtc -= box.cost;
        
        if (reward.isRare) {
            user.boxOpensSinceLastRare = 0;
        } else {
            user.boxOpensSinceLastRare = (user.boxOpensSinceLastRare || 0) + 1;
        }

        // 6. Grant Reward
        // Support both legacy "JACKPOT" and new "BONUS"
        if (reward.type === "GTC" || reward.type === "JACKPOT" || reward.type === "BONUS") {
            user.gtc += reward.value;
            
            await Transaction.create([{
                userId,
                type: "MYSTERY_BOX",
                amount: reward.value,
                currency: "GTC",
                source: "mystery_box_reward",
                description: `Unlocked ${reward.value} GTC from ${box.name}`
            }], { session });

        } else if (reward.type === "TICKET") {
            const ticketAmount = Math.min(reward.value || 0, 2);
            user.tickets = (user.tickets || 0) + ticketAmount;
            
             await Transaction.create([{
                userId,
                type: "MYSTERY_BOX",
                amount: ticketAmount,
                currency: "TICKETS",
                source: "mystery_box_reward",
                description: `Unlocked ${ticketAmount} Tickets from ${box.name}`
            }], { session });

        } else {
            // ITEMS/BOOSTS/PROTECTION - Handled via inventoryService
            // Pass session to inventoryService for atomic inclusion
            await inventoryService.addItem(userId, reward.value, 1, "mystery_box", box.code, session);
        }

        await user.save({ session });

        // 7. Log Cost Transaction
        await Transaction.create([{
            userId,
            type: "PURCHASE",
            amount: -box.cost,
            currency: "GTC",
            source: "mystery_box",
            description: `Opened ${box.name}`
        }], { session });

        // Commit All Changes
        await session.commitTransaction();
        session.endSession();
        await redis.del(lockKey);

        logger.info(`[MysteryBox] User ${userId} opened ${boxCode}. Reward: ${reward.name}`);

        // Sanitize reward type for frontend (No "JACKPOT")
        const safeRewardType = (reward.type === "JACKPOT") ? "BONUS" : reward.type;

        res.json({
            success: true,
            rewardType: safeRewardType,
            rewardValue: reward.value,
            rewardName: reward.name,
            isRare: reward.isRare,
            userGtc: user.gtc,
            userTickets: user.tickets
        });

        // 📢 Real-Time Sync: Notify all tabs that inventory changed
        const io = req.app.get("io");
        if (io) {
            io.to(`user_${userId}`).emit("inventory_updated", {
                type: "MYSTERY_BOX_OPEN",
                reward: {
                    type: reward.type,
                    name: reward.name,
                    value: reward.value
                }
            });
        }

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        await redis.del(lockKey);
        logger.error(`[MysteryBox] Open failed for user ${userId}: ${error.message}`, { error });
        res.status(400).json({ success: false, message: error.message || "Failed to open box" });
    }
};
