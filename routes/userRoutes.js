import express from "express";
import {
  registerUser,
  verification,
  resendVerification,
  loginUser,
  getCsrfToken,
  logoutUser,
  refreshAccessToken,
  forgetPassword,
  verifyOtp,
  changePassword,
  getMe,
  googleCallback,
  googleLinkCallback,
  checkUsername,
  completeOnboarding,
  reAuthenticate,
  verifyMfaReauth,
  verifyEmailOtp
} from "../controllers/userController.js";
import { setupMfa, verifyMfaSetup, verifyMfaLogin, disableMfa } from "../controllers/mfaController.js";
import { getStreakInfo, claimDailyReward, restoreStreak } from "../controllers/streakController.js";
import { activateBoost, halveCooldown } from "../controllers/activeBoostController.js";

import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { userSchema, validateUser } from "../validation/userValidate.js";
import passport from "../config/passport.js";

const router = express.Router();
router.get("/csrf-token", getCsrfToken);
router.post("/register",rateLimit({ keyPrefix: "register", limit: 5, windowSeconds: 90 }),validateUser(userSchema), registerUser);
router.get("/verify-email", verification);
router.post("/verify-email-otp", verifyEmailOtp);
router.post("/login",rateLimit({ keyPrefix: "login", limit: 5, windowSeconds: 90 }),loginUser);
router.get("/me", isAuthenticated, getMe);
router.post("/refresh", rateLimit({ keyPrefix: "refresh", limit: 10, windowSeconds: 60 }), refreshAccessToken);
router.post("/logout", isAuthenticated, logoutUser);

// Email & Password Management
router.post("/verify-otp/:email", rateLimit({ keyPrefix: "verify_otp", limit: 5, windowSeconds: 300 }), verifyOtp);
router.post("/change-password", rateLimit({ keyPrefix: "change_password", limit: 3, windowSeconds: 300 }), changePassword);

// Google OAuth routes
// Regular login/signup flow
router.get("/google", (req, res, next) => {
  const state = req.query.state || "";
  const nativeRedirect = req.query.redirect_uri || "";
  const statePayload = JSON.stringify({ redirect: state, nativeRedirect });

  passport.authenticate("google", { 
    scope: ["profile", "email"],
    state: statePayload
  })(req, res, next);
});

// Dedicated Google Re-auth route (Preserves current identity context)
router.get("/google/reauth", isAuthenticated, (req, res, next) => {
  const statePayload = JSON.stringify({ 
    reauth: true, 
    userId: req.user._id,
    sessionId: req.sessionId,
    redirect: req.query.state || ""
  });

  passport.authenticate("google", { 
    scope: ["profile", "email"],
    state: statePayload
  })(req, res, next);
});

router.get("/google/callback", passport.authenticate("google", { session: false }), googleCallback);

// Account linking flow (requires authentication)
router.get("/link/google", isAuthenticated, passport.authenticate("google-link", { scope: ["profile", "email"]}));
router.get("/link/google/callback", isAuthenticated, passport.authenticate("google-link", { session: false }), googleLinkCallback);

// 🛡️ Security Routes
router.post("/re-authenticate", isAuthenticated, rateLimit({ keyPrefix: "reauth", limit: 5, windowSeconds: 300 }), reAuthenticate);
router.post("/reauth/mfa", isAuthenticated, rateLimit({ keyPrefix: "reauth_mfa", limit: 5, windowSeconds: 300 }), verifyMfaReauth);

// 🔐 MFA Routes
router.post("/mfa/setup", isAuthenticated, rateLimit({ keyPrefix: "mfa_setup", limit: 10, windowSeconds: 3600 }), setupMfa);
router.post("/mfa/verify-setup", isAuthenticated, rateLimit({ keyPrefix: "mfa_verify", limit: 5, windowSeconds: 300 }), verifyMfaSetup);
router.post("/mfa/verify-login", rateLimit({ keyPrefix: "mfa_login", limit: 10, windowSeconds: 300 }), verifyMfaLogin);
router.post("/mfa/disable", isAuthenticated, rateLimit({ keyPrefix: "mfa_disable", limit: 3, windowSeconds: 3600 }), disableMfa);

// Onboarding routes
router.post("/check-username", isAuthenticated, checkUsername);
router.put("/complete-onboarding", isAuthenticated, completeOnboarding);

// Streak routes
router.get("/streak-info", isAuthenticated, getStreakInfo);
router.post("/claim-streak", isAuthenticated, claimDailyReward);
router.post("/restore-streak", isAuthenticated, restoreStreak);
router.post("/activate-boost", isAuthenticated, activateBoost);
router.post("/halve-booster-cooldown", isAuthenticated, halveCooldown);

// Inventory Routes
import { getInventory, useItem } from "../controllers/inventoryController.js";
import { useItemSchema, openBoxSchema, validate as validateReward } from "../validation/rewardValidate.js";
router.get("/inventory", isAuthenticated, getInventory);
router.post("/inventory/use", isAuthenticated, validateReward(useItemSchema), useItem);

// Mystery Box Routes
import { getBoxes, openBox } from "../controllers/mysteryBoxController.js";
router.get("/boxes", isAuthenticated, rateLimit({ keyPrefix: "get_boxes", limit: 20, windowSeconds: 60 }), getBoxes);
router.post("/boxes/open", isAuthenticated, rateLimit({ keyPrefix: "open_box", limit: 5, windowSeconds: 60 }), validateReward(openBoxSchema), openBox);

// Player Search
router.get("/search-users", isAuthenticated, async (req, res) => {
    try {
        const query = req.query.q || "";
        const { User } = await import("../models/User.js");
        const users = await User.find({
            username: { $regex: query, $options: "i" },
            _id: { $ne: req.user._id }
        }).select("username avatar gtc streakCount ratings").limit(20);
        res.json({ success: true, users });
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ success: false, message: "Search failed" });
    }
});


export default router;

