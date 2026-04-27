import { User } from "../models/User.js";
import SystemSettings from "../models/SystemSettings.js";
import Transaction from "../models/Transaction.js";
import { redis } from "../config/redis.js";

// 🎟️ Get Ticket Status
export const getTicketStatus = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select("tickets gtc dailyTicketClaimed dailyTicketLastReset dailyAdsWatched dailyTicketsFromAds adLastReset");

        // Check if daily reset is needed (Standard Tickets)
        const now = new Date();
        const lastReset = new Date(user.dailyTicketLastReset || 0);
        
        let canClaimDaily = !user.dailyTicketClaimed;

        // Reset if it's a new day
        if (now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
             // 🎟️ Auto-Refill Logic: If below 5, set to 5
             if (user.tickets < 5) {
                 user.tickets = 5;
             }
             user.dailyTicketClaimed = false;
             user.dailyTicketLastReset = now;
             canClaimDaily = true;
             await user.save();
        }

        // 💰 Check if progressive pricing needs reset
        const conversionLastReset = new Date(user.dailyTicketConversionLastReset || 0);
        if (now.getDate() !== conversionLastReset.getDate() || now.getMonth() !== conversionLastReset.getMonth() || now.getFullYear() !== conversionLastReset.getFullYear()) {
            user.dailyTicketConversions = 0;
            user.dailyTicketConversionLastReset = now;
            await user.save();
        }

        // Calculate current conversion rate: 500 * 2^conversions
        const BASE_RATE = 500;
        const conversionRate = BASE_RATE * Math.pow(2, user.dailyTicketConversions);

        // Check if daily reset is needed (Ad Monetization)
        const lastAdReset = new Date(user.adLastReset || 0);
        if (now.getDate() !== lastAdReset.getDate() || now.getMonth() !== lastAdReset.getMonth() || now.getFullYear() !== lastAdReset.getFullYear()) {
            user.dailyAdsWatched = 0;
            user.dailyTicketsFromAds = 0;
            user.adLastReset = now;
            await user.save();
        }

        const AD_LIMIT = 5;
        const TICKET_LIMIT = 5;
        const canClaimAd = user.dailyTicketsFromAds < AD_LIMIT;

        res.json({
            success: true,
            tickets: user.tickets,
            gtc: user.gtc,
            canClaimDaily,
            canClaimAd,
            dailyAdsWatched: user.dailyAdsWatched,
            dailyTicketsFromAds: user.dailyTicketsFromAds,
            adLimit: AD_LIMIT,
            ticketLimit: TICKET_LIMIT,
            conversionRate,
            dailyTicketConversions: user.dailyTicketConversions,
            nextConversionRate: conversionRate * 2
        });
    } catch (error) {
        console.error("Get ticket status error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch ticket status" });
    }
};

// ... (claimDailyTickets and convertGtcToTickets remain unchanged, updating adReward below)

// 📅 Claim Daily Tickets
export const claimDailyTickets = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        const DAILY_AMOUNT = 5;

        const now = new Date();
        const lastReset = new Date(user.dailyTicketLastReset || 0);

        // Reset check
        if (now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
            user.dailyTicketClaimed = false;
            user.dailyTicketLastReset = now;
        }

        if (user.dailyTicketClaimed) {
             return res.status(400).json({ success: false, message: "Daily tickets already claimed today." });
        }

        user.tickets += DAILY_AMOUNT;
        user.dailyTicketClaimed = true;
        user.dailyTicketLastReset = now;

        await user.save();

        // 🧹 CACHE INVALIDATION
        await redis.del(`inventory:${userId}`);

        await Transaction.create({
            userId,
            type: "DAILY_REWARD",
            amount: DAILY_AMOUNT,
            currency: "TICKETS",
            source: "daily_claim_tickets"
        });

        res.json({
            success: true,
            message: `Claimed ${DAILY_AMOUNT} free tickets!`,
            tickets: user.tickets,
            canClaimDaily: false
        });

    } catch (error) {
         console.error("Claim daily tickets error:", error);
         res.status(500).json({ success: false, message: "Failed to claim tickets" });
    }
};

// 🔄 Convert GTC to Tickets (Progressive Pricing)
export const convertGtcToTickets = async (req, res) => {
    try {
        const { ticketsToBuy } = req.body;
        if (!ticketsToBuy || ticketsToBuy <= 0) {
            return res.status(400).json({ success: false, message: "Invalid ticket amount" });
        }

        const userId = req.user._id;
        const user = await User.findById(userId);

        // 💰 Check if progressive pricing needs reset
        const now = new Date();
        const conversionLastReset = new Date(user.dailyTicketConversionLastReset || 0);
        if (now.getDate() !== conversionLastReset.getDate() || now.getMonth() !== conversionLastReset.getMonth() || now.getFullYear() !== conversionLastReset.getFullYear()) {
            user.dailyTicketConversions = 0;
            user.dailyTicketConversionLastReset = now;
        }

        // 🔢 Calculate CUMULATIVE cost for progressive pricing
        // Each ticket costs: 500 * 2^(current conversion count)
        // Example: Buying 3 tickets = 500 + 1,000 + 2,000 = 3,500 GTC
        const BASE_RATE = 500;
        let totalCost = 0;
        const costBreakdown = [];
        
        for (let i = 0; i < ticketsToBuy; i++) {
            const ticketCost = BASE_RATE * Math.pow(2, user.dailyTicketConversions + i);
            totalCost += ticketCost;
            costBreakdown.push(ticketCost);
        }

        if (user.gtc < totalCost) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient GTC. Need ${totalCost.toLocaleString()} GTC.`,
                required: totalCost,
                balance: user.gtc,
                breakdown: costBreakdown
            });
        }

        user.gtc -= totalCost;
        user.tickets += ticketsToBuy;
        user.dailyTicketConversions += ticketsToBuy; // Increment by number of tickets bought
        await user.save();

        // 🧹 CACHE INVALIDATION
        await redis.del(`inventory:${userId}`);

        await Transaction.create({
            userId,
            type: "EXCHANGE",
            amount: -totalCost,
            currency: "GTC",
            source: "ticket_conversion",
            metadata: { 
                ticketsBought: ticketsToBuy,
                costBreakdown,
                conversionNumber: user.dailyTicketConversions
            }
        });

        const nextRate = BASE_RATE * Math.pow(2, user.dailyTicketConversions);

        res.json({
            success: true,
            message: `Purchased ${ticketsToBuy} ticket${ticketsToBuy > 1 ? 's' : ''} for ${totalCost.toLocaleString()} GTC`,
            tickets: user.tickets,
            gtc: user.gtc,
            conversionRate: nextRate,
            nextConversionRate: nextRate * 2,
            costBreakdown
        });

    } catch (error) {
        console.error("Convert GTC error:", error);
        res.status(500).json({ success: false, message: "Conversion failed" });
    }
};

// 📺 Ad Reward (Hardened)
export const adReward = async (req, res) => {
    const userId = req.user._id.toString();
    const lockKey = `lock:ad:${userId}`;

    try {
        // 1. 🛡️ Redis Lock to prevent spam exploits
        const acquired = await redis.set(lockKey, "1", "NX", "EX", 15);
        if (!acquired) {
            return res.status(429).json({ success: false, message: "Wait for current ad to finish processing." });
        }

        const user = await User.findById(userId);
        if (!user) throw new Error("User not found");

        const now = new Date();
        const lastReset = new Date(user.adLastReset || 0);

        // 2. 📅 Daily Reset Logic
        if (now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
            user.dailyAdsWatched = 0;
            user.dailyTicketsFromAds = 0;
            user.adLastReset = now;
        }

        // 3. 🛡️ Check Daily Limit (Max 5 Tickets = 10 Ads)
        if (user.dailyTicketsFromAds >= 5) {
            await redis.del(lockKey);
            return res.status(400).json({ success: false, message: "Daily ad ticket limit reached (5). Come back tomorrow!" });
        }

        // 4. 📈 Increment Progressive Counter
        user.dailyAdsWatched += 1;
        let ticketsGranted = 0;
        let message = "Ad recorded! Watch another to get your ticket.";

        // 🎭 2-Ads-Per-Ticket Logic
        if (user.dailyAdsWatched % 2 === 0) {
            ticketsGranted = 1;
            user.tickets += 1;
            user.dailyTicketsFromAds += 1;
            message = "Ticket awarded! You've earned a game entry.";

            await Transaction.create({
                userId,
                type: "AD_REWARD",
                amount: 1,
                currency: "TICKETS",
                source: "ad_watch",
                metadata: { cumulativeAds: user.dailyAdsWatched }
            });

            // 🧹 Inventory Cache Invalidation
            await redis.del(`inventory:${userId}`);
        }

        await user.save();
        await redis.del(lockKey);

        res.json({
            success: true,
            message,
            tickets: user.tickets,
            progress: {
                watched: user.dailyAdsWatched,
                earnedCount: user.dailyTicketsFromAds,
                nextAt: user.dailyAdsWatched % 2 === 0 ? 2 : 1 // Show 1/2 or 2/2 style
            }
        });

    } catch (error) {
        await redis.del(lockKey);
        console.error("Ad reward error:", error);
        res.status(500).json({ success: false, message: "Failed to process ad reward" });
    }
};
