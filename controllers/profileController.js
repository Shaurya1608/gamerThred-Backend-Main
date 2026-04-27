import { uploadToCloudinary, deleteFromCloudinary } from "../utils/uploadUtils.js";
import { User } from "../models/User.js";
import { calculateLevelInfo } from "../utils/progressionUtil.js";
import { getTopRankings, updateLeaderboardScore, getUserRank } from "../utils/redisUtils.js";
import { MissionSession } from "../models/MissionSession.js";

export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image provided",
      });
    }

    const result = await uploadToCloudinary(req.file.buffer, "avatars", {
      width: 256,
      height: 256,
      crop: "fill",
    });

    // delete old avatar
    if (req.user.avatar?.publicId) {
      await deleteFromCloudinary(req.user.avatar.publicId);
    }

    req.user.avatar = {
      url: result.url,
      publicId: result.publicId,
    };

    await req.user.save();

    res.status(200).json({
      success: true,
      avatar: req.user.avatar,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Avatar update failed",
    });
  }
};


export const getProfile = async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate({
      path: 'lastPlayedGame',
      populate: { path: 'categoryId', select: 'name' }
    });

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // 🏎️ QUICK RESUME SESSION VALIDATION
  if (user.lastPlayedGame) {
      const activeSession = await MissionSession.findOne({ 
          userId: user._id, 
          status: "active" 
      });
      
      let activeSessionInfo = null;
      if (!activeSession) {
          console.log(`[QuickResume] Clearing stale lastPlayedGame for profiling user ${user._id}`);
          user.lastPlayedGame = null;
          await User.updateOne({ _id: user._id }, { $unset: { lastPlayedGame: "" } });
      } else {
          activeSessionInfo = {
              createdAt: activeSession.createdAt,
              lastAttemptStartedAt: activeSession.lastAttemptStartedAt
          };
      }
  }

  res.json({
    success: true,
    profile: {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      subscriptionTier: user.subscriptionTier || "none",
      subscriptionExpiry: user.subscriptionExpiry || null,
      avatar: user.avatar?.url || "",
      isVerified: user.isVerified,
      elo: user.elo ?? 0,
      tier: user.tier || "BRONZE", 
      arenaWinStreak: user.arenaWinStreak || 0,
      createdAt: user.createdAt,
      dob: user.dob,
      phoneNumber: user.phoneNumber,
      googleId: user.googleId || null,
      hasGoogle: !!user.googleId,
      lastPlayedGame: user.lastPlayedGame,
      activeMissionSession: typeof activeSessionInfo !== 'undefined' ? activeSessionInfo : null, // for Quick Resume
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      verifiedReferrals: user.verifiedReferrals || 0,
      wallet: {
        gtc: user.gtc || 0,
        coins: user.gtc || 0,
        crowns: user.crowns || 0,
        gems: user.gems || 0,
        xp: user.xp || 0,
        tickets: user.tickets || 0,
      },
      progression: await calculateLevelInfo(user.xp || 0),
      stats: {
        completed: user.completedMissions,
        total: user.totalMissions,
        rating: user.rating,
        elo: user.elo ?? 0,
        tier: user.tier || "BRONZE",
        winStreak: user.arenaWinStreak || 0
      },
    },
  });
};

export const updateProfile = async (req, res) => {
  try {
    const { username, dob, phoneNumber } = req.body;
    const user = req.user;

    if (username) user.username = username;
    if (dob) user.dob = new Date(dob);
    if (phoneNumber) user.phoneNumber = phoneNumber;

    await user.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar?.url,
        dob: user.dob,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
};

export const getProfileMissions = async (req, res) => {
  try {
    const { status } = req.query; // active, completed, etc.
    const query = { userId: req.user._id };
    
    if (status) {
      query.status = status;
    }

    const sessions = await import("../models/MissionSession.js").then(m => 
      m.MissionSession.find(query)
      .populate("missionId", "title image rewardGtc gameId minScore maxAttempts")
      .populate("gameId", "title")
      .sort({ createdAt: -1 })
    );

    res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error("Get profile missions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch missions",
    });
  }
};
export const getLeaderboard = async (req, res) => {
  try {
    const { range = "GLOBAL" } = req.query;
    
    // 1. Determine Redis Set Key
    const now = new Date();
    let setKey = "leaderboard:global";
    
    if (range === "MONTHLY") {
       setKey = `leaderboard:monthly:${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    } else if (range === "WEEKLY") {
       const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
       const dayNum = d.getUTCDay() || 7;
       d.setUTCDate(d.getUTCDate() + 4 - dayNum);
       const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
       const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
       setKey = `leaderboard:weekly:${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
    }

    // 2. Fetch top 100 user IDs from Redis for the selected range
    let topUserIds = await getTopRankings(setKey, 100);
    let users = [];

    if (topUserIds && topUserIds.length > 0) {
      const userDetails = await User.find({ _id: { $in: topUserIds } })
        .select("username avatar elo tier gems xp role subscriptionTier")
        .lean();
      
      users = topUserIds.map(id => userDetails.find(u => u._id.toString() === id)).filter(Boolean);
    } else if (range === "GLOBAL") {
      // Fallback only for Global to avoid empty boards on new Month/Week starts
      users = await User.find({ status: "active" })
        .select("username avatar elo tier gems xp role subscriptionTier")
        .sort({ gems: -1, xp: -1, elo: -1 })
        .limit(100)
        .lean();

      users.forEach(u => updateLeaderboardScore(u._id.toString(), u.gems || 0, u.xp || 0, u.elo ?? 0));
    }

    const formattedUsers = users.map((user, index) => ({
      _id: user._id,
      rank: index + 1,
      name: user.username,
      avatar: user.avatar?.url || "",
      elo: user.elo ?? 0,
      tier: user.tier || "BRONZE",
      subscriptionTier: user.subscriptionTier || "none",
      gems: user.gems || 0,
      xp: user.xp || 0,
    }));

    // 3. Calculate User Rank for the specific range
    let userRank = null;
    if (req.userId) {
      userRank = await getUserRank(setKey, req.userId);
    }

    res.json({
      success: true,
      range,
      leaderboard: formattedUsers,
      userRank
    });
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch leaderboard",
    });
  }
};
