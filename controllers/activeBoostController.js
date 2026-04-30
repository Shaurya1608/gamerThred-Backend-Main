import { User } from "../models/User.js";
import { SubscriptionConfig } from "../models/SubscriptionConfig.js";
import { Transaction } from "../models/Transaction.js";
import { calculateLevelInfo } from "../utils/progressionUtil.js";

/**
 * Grants a daily active boost if the user is eligible and hasn't received one today.
 * Eligible: User has premium/elite pass and the tier has activeBoost enabled.
 */
export const checkAndGrantBoost = async (user) => {
  if (!user.subscriptionTier || user.subscriptionTier === "none") return;

  const now = new Date();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  // Check if a cooldown is currently active (strict 24h from end of last boost)
  if (user.activeBoost?.isUsed && user.activeBoost?.activeUntil) {
    const nextGrantTime = new Date(new Date(user.activeBoost.activeUntil).getTime() + (24 * 60 * 60 * 1000));
    if (now < nextGrantTime) return;
  }

  // Grant logic: Available now
  const activeBoost = {
    availableAt: now,
    expiresAt: null, 
    activatedAt: null,
    activeUntil: null,
    isUsed: false,
    renewCount: 0, 
    lastGrantDate: todayStr
  };

  try {
    await User.updateOne(
        { _id: user._id }, 
        { $set: { activeBoost } }
    );
    user.activeBoost = activeBoost; // Sync in-memory for the current request
    console.log(`[Boost] Granted daily booster to user ${user._id}`);
  } catch (err) {
    console.error("[Boost] Grant failed:", err);
  }
};

/**
 * Endpoint to activate the granted boost
 * POST /api/auth/activate-boost
 */
export const activateBoost = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const boost = user.activeBoost;
    if (!boost || !boost.availableAt) {
      return res.status(400).json({ success: false, message: "No booster available to activate" });
    }

    const now = new Date();
    if (boost.activatedAt) {
      return res.status(400).json({ success: false, message: "Booster already activated" });
    }

    // Set activation (2 hour duration)
    const activeUntil = new Date(now.getTime() + (2 * 60 * 60 * 1000));
    
    user.activeBoost.activatedAt = now;
    user.activeBoost.activeUntil = activeUntil;
    user.activeBoost.isUsed = true; 

    await user.save();

    const levelInfo = await calculateLevelInfo(user.xp || 0);

    res.json({
      success: true,
      message: "Booster activated! 2X Rewards enabled for 2 hours.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar || "",
        elo: user.elo ?? 0,
        tier: user.tier,
        gems: user.gems,
        gtc: user.gtc,
        xp: user.xp,
        level: levelInfo.level,
        tickets: user.tickets || 0,
        subscriptionTier: user.subscriptionTier || "none",
        subscriptionExpiry: user.subscriptionExpiry,
        activeBoost: user.activeBoost
      }
    });
  } catch (err) {
    console.error("[Boost] Activation error:", err);
    res.status(500).json({ success: false, message: "Failed to activate booster" });
  }
};
/**
 * Endpoint to renew boost immediately using GTC
 * POST /api/auth/renew-boost
 */
/**
 * Endpoint to halve booster cooldown using GTC
 * POST /api/auth/halve-booster-cooldown
 */
export const halveCooldown = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const boost = user.activeBoost;
        const now = new Date();

        // 1. Check if booster is already available or active
        if (!boost.isUsed || (boost.activeUntil && new Date(boost.activeUntil) > now)) {
             return res.status(400).json({ success: false, message: "Booster is not on cooldown!" });
        }

        // 2. Calculate next grant time (24h after activation ended)
        const lastActivationEnd = new Date(boost.activeUntil);
        const nextGrantTimeUTC = new Date(lastActivationEnd.getTime() + (24 * 60 * 60 * 1000));
        
        let remainingTimeMs = nextGrantTimeUTC.getTime() - now.getTime();
        if (remainingTimeMs <= 0) {
            return res.status(400).json({ success: false, message: "Booster should be available now. Please refresh." });
        }

        // 3. Calculate Cost (1000 * 2^renewCount)
        const renewCount = boost.renewCount || 0;
        const cost = 1000 * Math.pow(2, renewCount);

        if (user.gtc < cost) {
            return res.status(400).json({ success: false, message: `Insufficient GTC. Need ${cost} GTC.` });
        }

        // 4. Deduct GTC and update renew count
        user.gtc -= cost;
        user.activeBoost.renewCount = renewCount + 1;

        // 5. Halve reflecting on "fake" next grant time
        // Since checkAndGrantBoost resets at UTC midnight (date-based), 
        // "halving" the wait means we just reset lastGrantDate to force it to grant today if it hasn't or allow earlier grant.
        // ACTUALLY, the user wants to reduce wait time. 
        // If we use todayStr reset logic in checkAndGrantBoost, halving the time is tricky.
        
        // Let's refine the "halving" to actually just GRANT it if it's been halved enough, 
        // or just subtract hours from the wait.
        
        // Simple approach: Each "halve" reduces the wait. 
        // If the halving makes the remaining time < 1 minute, just grant it now.
        const newRemainingTimeMs = remainingTimeMs / 2;
        
        if (newRemainingTimeMs < (1 * 60 * 1000)) {
            // Grant immediately
            user.activeBoost.isUsed = false;
            user.activeBoost.activatedAt = null;
            user.activeBoost.activeUntil = null;
            user.activeBoost.availableAt = now;
            // Note: we don't reset lastGrantDate here so it stays "used" for the daily free one
            // but we make it available again.
        } else {
            // Move the "effective" activation end back so the 24h window looks shorter
            // (24h - elapsed) is the current wait. 
            // We want (wait / 2) to be the new wait.
            // new_wait = 24h - new_elapsed
            // new_elapsed = 24h - new_wait
            const twentyFourHoursMs = 24 * 60 * 60 * 1000;
            const newActivationEndMs = now.getTime() + newRemainingTimeMs - twentyFourHoursMs;
            user.activeBoost.activeUntil = new Date(newActivationEndMs);
        }

        await user.save();

        await Transaction.create({
            userId: user._id,
            type: "BOOST_RENEWAL",
            amount: -cost,
            currency: "GTC",
            source: "booster_halve_cooldown"
        });

        res.json({
            success: true,
            message: newRemainingTimeMs < (1 * 60 * 1000) ? "Booster Restored!" : "Cooldown halved!",
            cost,
            nextCost: 1000 * Math.pow(2, user.activeBoost.renewCount),
            gtc: user.gtc
        });

    } catch (err) {
        console.error("[Boost] Halve error:", err);
        res.status(500).json({ success: false, message: "Failed to halve cooldown" });
    }
};
