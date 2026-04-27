import { User } from "../models/User.js";
import { Season } from "../models/Season.js";
import { SeasonReward } from "../models/SeasonReward.js";
import { getSeasonProgression, getPendingRewards, calculateSeasonLevel } from "../utils/seasonProgression.js";
// import { SEASON_REWARDS } from "../config/seasonRewards.js"; // No longer used

export const getPassStatus = async (req, res) => {
    try {
        const user = req.user;
        const season = await Season.findOne({ isActive: true });
        
        const progression = getSeasonProgression(user.seasonXp);
        
        let rewards = await SeasonReward.find().sort({ level: 1 });
        
        // Auto-seed if empty (fallback to what was in config)
        if (rewards.length === 0) {
            const seed = [
                { level: 1, free: { diamonds: 100 }, elite: { diamonds: 200 } },
                { level: 2, free: { gtc: 100 }, elite: { gtc: 500 } },
                { level: 3, free: { diamonds: 150 }, elite: { diamonds: 300 } },
                { level: 4, free: { gtc: 200 }, elite: { gtc: 1000 } },
                { level: 5, free: { diamonds: 200 }, elite: { diamonds: 1000 } },
                { level: 10, free: { diamonds: 1000 }, elite: { diamonds: 5000 }, isMilestone: true }
            ];
            await SeasonReward.insertMany(seed);
            rewards = await SeasonReward.find().sort({ level: 1 });
        }

        // Convert to the object format the frontend expects: { level: { free, elite } }
        const rewardMap = {};
        rewards.forEach(r => {
            rewardMap[r.level] = { free: r.free, elite: r.elite, isMilestone: r.isMilestone };
        });
        
        res.json({
            success: true,
            season: season || { name: "Season 1", number: 1, endDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000) },
            progression: {
                ...progression,
                seasonLevel: user.seasonLevel,
                hasElitePass: user.hasElitePass,
                claimedRewards: user.claimedRewards
            },
            userWallet: {
                diamonds: user.gems || 0,
                gtc: user.gtc || 0
            },
            rewards: rewardMap
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch pass status" });
    }
};

export const claimReward = async (req, res) => {
    try {
        const { level } = req.body;
        const user = req.user;

        if (level > calculateSeasonLevel(user.seasonXp)) {
            return res.status(400).json({ success: false, message: "Level not reached" });
        }

        if (user.claimedRewards.includes(level)) {
            return res.status(400).json({ success: false, message: "Reward already claimed" });
        }
 
        const tier = await SeasonReward.findOne({ level });
        if (!tier) return res.status(404).json({ success: false, message: "Reward tier not found" });

        // Add free rewards
        if (tier.free) {
            if (tier.free.diamonds) user.gems = (user.gems || 0) + tier.free.diamonds;
            if (tier.free.gtc) user.gtc = (user.gtc || 0) + tier.free.gtc;
        }

        // Add elite rewards if they have the pass
        if (user.hasElitePass && tier.elite) {
            if (tier.elite.diamonds) user.gems = (user.gems || 0) + tier.elite.diamonds;
            if (tier.elite.gtc) user.gtc = (user.gtc || 0) + tier.elite.gtc;
        }

        user.claimedRewards.push(level);
        await user.save();

        res.json({
            success: true,
            message: `Level ${level} rewards claimed!`,
            wallet: {
                diamonds: user.gems,
                gtc: user.gtc
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Claim failed" });
    }
};

export const buyElitePass = async (req, res) => {
    try {
        const user = req.user;
        const ELITE_PASS_COST = 5000; // in GTC

        if (user.hasElitePass) {
            return res.status(400).json({ success: false, message: "Elite Pass already active" });
        }

        if (user.gtc < ELITE_PASS_COST) {
            return res.status(400).json({ success: false, message: "Insufficient GTC" });
        }

        user.gtc -= ELITE_PASS_COST;
        user.hasElitePass = true;
        await user.save();

        res.json({
            success: true,
            message: "Welcome to Elite Status! Elite Pass activated.",
            gtc: user.gtc
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Upgrade failed" });
    }
};
