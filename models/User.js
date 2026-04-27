import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    // 🔐 AUTH
    username: { 
      type: String, 
      required: true, 
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [20, "Username cannot exceed 20 characters"]
    },
    email: { 
      type: String, 
      required: true, 
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email address"]
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      minlength: [8, "Password must be at least 8 characters"]
    },
    googleId: { type: String, default: null, index: true },
    authProvider: {
      type: String,
      enum: ["local", "google", "github", "discord", "apple"],
      default: "local",
    },

    // 👤 PERSONAL DETAILS
    dob: { type: Date, default: null },
    phoneNumber: { type: String, default: "" },
    onboardingCompleted: { type: Boolean, default: false },

    isVerified: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    isLoggedIn: { type: Boolean, default: false },

    token: { type: String, default: null },
    otp: { type: String, default: null },
    // 🛡️ SECURITY FIELDS
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false }, // Store secret, but don't return by default
    otpExpiry: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpiry: { type: Date, default: null },

    // 🕵️ ANOMALY DETECTION
    loginHistory: [{
      ip: String,
      device: String,
      location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number] // [longitude, latitude]
      },
      city: String,
      country: String,
      timestamp: { type: Date, default: Date.now }
    }],
    lastLoginIp: { type: String, default: "" },

    // 👤 PROFILE (Cloudinary)
    avatar: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },

    // 🎮 GAME WALLET
    gtc: { type: Number, default: 100 },
    tickets: { type: Number, default: 5 },
    crowns: { type: Number, default: 0 },
    gems: { type: Number, default: 10 },
    xp: { type: Number, default: 0 },
    loyaltyCredits: { type: Number, default: 0 }, // 💎 New currency for special missions
    
    // 💰 DAILY LIMITS
    dailyGtcEarned: { type: Number, default: 0 },
    
    // 🎁 MYSTERY BOX & PROTECTION
    boxOpensSinceLastRare: { type: Number, default: 0 },
    rankProtectionExpiresAt: { type: Date, default: null },
    dailyGtcLastReset: { type: Date, default: () => new Date() },
    dailyMissionsCompleted: { type: Number, default: 0 },
    dailyMissionsLastReset: { type: Date, default: () => new Date() },
    dailyTicketClaimed: { type: Boolean, default: false },
    dailyTicketLastReset: { type: Date, default: () => new Date() },
    
    // 📺 AD MONETIZATION
    dailyAdsWatched: { type: Number, default: 0 },
    dailyTicketsFromAds: { type: Number, default: 0 },
    adLastReset: { type: Date, default: () => new Date() },

    // 💰 PROGRESSIVE TICKET PRICING
    dailyTicketConversions: { type: Number, default: 0 },
    dailyTicketConversionLastReset: { type: Date, default: () => new Date() },

    // 📊 GAME STATS
    completedMissions: { type: Number, default: 0 },
    totalMissions: { type: Number, default: 0 },
    // 🎖️ Elite Pass & Season Progression
    seasonXp: { type: Number, default: 0 },
    seasonLevel: { type: Number, default: 1 },
    hasElitePass: { type: Boolean, default: false },
    claimedRewards: { type: [Number], default: [] }, // Array of level numbers already claimed
    
    // 🛡️ Competitive & Ranked
    elo: { type: Number, default: 0 },
    tier: { type: String, enum: ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "ELITE"], default: "BRONZE" },
    highestElo: { type: Number, default: 0 },
    arenaWins: { type: Number, default: 0 },
    arenaLosses: { type: Number, default: 0 },
    arenaDraws: { type: Number, default: 0 },
    arenaWinStreak: { type: Number, default: 0 },
    lastBrokenArenaWinStreak: { type: Number, default: 0 },
    arenaWinStreakRestoreUsed: { type: Boolean, default: false },
    arenaGtcEarned: { type: Number, default: 0 },

    // 🔥 RETENTION (STREAKS)
    streakCount: { type: Number, default: 0 },
    lastBrokenStreakCount: { type: Number, default: 0 },
    streakRestoreUsed: { type: Boolean, default: false },
    lastLoginDate: { type: Date, default: null },
    streakClaimedToday: { type: Boolean, default: false },

    // 🔑 RBAC
    role: {
      type: String,
      enum: ["user", "moderator", "admin"],
      default: "user",
    },

    permissions: {
      type: [String],
      enum: [
        "manage_users",
        "view_analytics",
        "manage_rewards",
        "manage_missions",
        "manage_weekend_missions",
        "moderate_chat",
        "moderate_content",
        "manage_settings",
        "manage_games",
        "manage_hero",
        "manage_payments",
        "manage_events",
        "manage_orders",
        "view_logs",
        "manage_sessions"
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ["active", "inactive", "banned"],
      default: "active",
      index: true,
    },

    // 🛡️ MODERATION FLAGS
    subscriptionTier: { 
      type: String, 
      enum: ["none", "premium", "elite"], 
      default: "none" 
    },
    subscriptionExpiry: { type: Date, default: null },
    isBanned: { type: Boolean, default: false }, // Global site access
    banExpires: { type: Date, default: null },   // Date when ban is lifted
    banReason: { type: String, default: "" },    // Reason for ban
    chatBan: { type: Boolean, default: false },  // Cannot send messages
    joinBan: { type: Boolean, default: false },  // Cannot join new communities
    
    // 🏷️ CUSTOMIZATION
    titles: { type: [String], default: [] },
    currentTitle: { type: String, default: "" },

    // 🤝 SOCIAL
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    friendRequests: [{
      from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
      createdAt: { type: Date, default: Date.now }
    }],

    // 🏆 REFERRALS
    referralCode: { type: String, unique: true, sparse: true, index: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    referralCount: { type: Number, default: 0 },
    verifiedReferrals: { type: Number, default: 0 }, // Users who reached a certain milestone

    // 🏁 ACTIVE BOOST (2X REWARDS)
    activeBoost: {
      availableAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      activatedAt: { type: Date, default: null },
      activeUntil: { type: Date, default: null },
      isUsed: { type: Boolean, default: false },
      renewCount: { type: Number, default: 0 },
      lastGrantDate: { type: String, default: "" } // YYYY-MM-DD
    },

    // 🏎️ QUICK RESUME
    lastPlayedGame: { type: mongoose.Schema.Types.ObjectId, ref: "Game", index: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

// 📈 PERFORMANCE INDEXES
userSchema.index({ xp: -1 });
userSchema.index({ elo: -1 });
userSchema.index({ xp: -1, elo: -1 }); // Compound index for leaderboards
userSchema.index({ gtc: -1 });
userSchema.index({ gems: -1 });
userSchema.index({ crowns: -1 });
userSchema.index({ friends: 1 });
userSchema.index({ "friendRequests.from": 1 });

// 🔐 PASSWORD HASH
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// 🔐 PASSWORD COMPARE
userSchema.methods.comparePassword = async function (password) {
  if (!this.password) return false;
  return bcrypt.compare(password, this.password);
};

export const User = mongoose.model("User", userSchema);
