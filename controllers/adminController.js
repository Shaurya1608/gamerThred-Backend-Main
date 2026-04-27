import { User } from "../models/User.js";
import { Game } from "../models/Game.js";
import { Session } from "../models/Session.js";
import { RewardOrder } from "../models/RewardOrder.js";
import { GemPackage } from "../models/GemPackage.js";
import { WeekendMission } from "../models/WeekendMission.js";
import { Report } from "../models/Report.js";
import { Transaction } from "../models/Transaction.js";
import { SeasonReward } from "../models/SeasonReward.js";
import jwt from "jsonwebtoken";
import { logAudit } from "../utils/auditLogger.js";
import { redis } from "../config/redis.js";

// ✅ Get all users with pagination
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", role = "all" } = req.query;
    
    // Build filter
    let filter = {};
    if (search) {
      filter = {
        $or: [
          { username: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } }
        ]
      };
    }
    if (role !== "all") {
      filter.role = role;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(filter)
      .select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message
    });
  }
};

// ✅ Get single user details
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message
    });
  }
};

// ✅ Update user role
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["user", "moderator", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role"
      });
    }

    // 🛡️ ADMIN PROTECTION
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (targetUser.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Administrative identities are cryptographically locked and cannot be modified."
      });
    }

    // Only update permissions if the role is actually changing
    // This prevents wiping custom permissions when re-assigning the same role
    let updateData = { role };
    
    if (targetUser.role !== role) {
      let permissions = [];
      if (role === "admin") {
        permissions = [
          "view_analytics",
          "manage_users",
          "manage_settings",
          "manage_missions",
          "manage_games",
          "manage_rewards",
          "manage_hero",
          "manage_payments",
          "moderate_chat"
        ];
      } else if (role === "moderator") {
        permissions = [
          "view_analytics",
          "manage_missions",
          "moderate_chat",
          "moderate_content"
        ];
      }
      updateData.permissions = permissions;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry");

    await logAudit(req, "ROLE_UPDATE", {
      targetId: userId,
      targetModel: "User",
      changes: {
        before: { role: targetUser.role },
        after: { role: role }
      },
      grantedPermissions: updateData.permissions || "PRESERVED"
    });

    return res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating user role",
      error: error.message
    });
  }
};

// ✅ Update user permissions
export const updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: "Permissions must be an array"
      });
    }

    // 🛡️ ADMIN PROTECTION
    const targetUser = await User.findById(userId);
    if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    if (targetUser.role === "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrative privileges are hardcoded and cannot be modified."
        });
    }

    const validPermissions = [
      "view_analytics",
      "manage_users",
      "manage_settings",
      "manage_missions",
      "manage_weekend_missions",
      "manage_games",
      "manage_rewards",
      "manage_hero",
      "manage_payments",
      "moderate_chat",
      "moderate_content",
      "manage_orders",
      "manage_events",
      "view_logs"
    ];

    // Filter to keep only valid permissions (automatically prunes legacy keys like view_logs)
    const filteredPermissions = permissions.filter(perm => validPermissions.includes(perm));

    const user = await User.findByIdAndUpdate(
      userId,
      { permissions: filteredPermissions },
      { new: true }
    ).select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    await logAudit(req, "PERMISSION_UPDATE", {
      targetId: userId,
      targetModel: "User",
      changes: {
        before: { permissions: targetUser.permissions },
        after: { permissions: filteredPermissions }
      }
    });

    return res.status(200).json({
      success: true,
      message: "User permissions updated successfully",
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating permissions",
      error: error.message
    });
  }
};

// ✅ Update user status
export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, banExpires, banReason } = req.body;

    if (!["active", "inactive", "banned"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    // 🛡️ ADMIN PROTECTION
    const targetUser = await User.findById(userId);
    if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    if (targetUser.role === "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrative status is fixed and cannot be altered."
        });
    }

    const updateData = { status };
    if (status === "banned") {
      updateData.isBanned = true;
      updateData.banExpires = banExpires ? new Date(banExpires) : null;
      updateData.banReason = banReason || "Violation of Protocol";
      
      // 🔥 🔑 INSTANT GLOBAL SESSION REVOCATION
      await Session.deleteMany({ userId });
      
      const keys = await redis.keys(`refresh_token:${userId}:*`);
      if (keys.length > 0) await redis.del(...keys);
    } else {
      updateData.isBanned = false;
      updateData.banExpires = null;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 🚀 EMIT UNBAN EVENT
    if (status === "active") {
        const io = req.app.get("io");
        if (io) {
            io.to(`user_${userId}`).emit("account_unbanned", { userId });
        }
    }

    await logAudit(req, "USER_STATUS_UPDATE", { 
        targetId: userId, 
        targetModel: "User",
        changes: {
            before: { status: targetUser.status, isBanned: targetUser.isBanned },
            after: { status, isBanned: updateData.isBanned }
        },
        banReason 
    });
    return res.status(200).json({
      success: true,
      message: `User status updated to ${status}${status === 'banned' && banExpires ? ' until ' + new Date(banExpires).toLocaleDateString() : ''}`,
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating user status",
      error: error.message
    });
  }
};

// ✅ Update user chat ban
export const updateUserChatBan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { chatBan } = req.body;

    // 🛡️ ADMIN PROTECTION
    const targetUser = await User.findById(userId);
    if (targetUser?.role === "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrative communication rights cannot be restricted."
        });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { chatBan },
      { new: true }
    ).select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    await logAudit(req, "CHAT_BAN_UPDATE", { 
        targetId: userId, 
        targetModel: "User",
        changes: {
            before: { chatBan: targetUser.chatBan },
            after: { chatBan }
        }
    });

    return res.status(200).json({
      success: true,
      message: `User chat access ${chatBan ? 'suspended' : 'restored'}`,
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating chat ban",
      error: error.message
    });
  }
};

// ✅ Update user join ban
export const updateUserJoinBan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { joinBan } = req.body;

    // 🛡️ ADMIN PROTECTION
    const targetUser = await User.findById(userId);
    if (targetUser?.role === "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrative access protocols cannot be restricted."
        });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { joinBan },
      { new: true }
    ).select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    await logAudit(req, "JOIN_BAN_UPDATE", { 
        targetId: userId, 
        targetModel: "User",
        changes: {
            before: { joinBan: targetUser.joinBan },
            after: { joinBan }
        }
    });

    return res.status(200).json({
      success: true,
      message: `User community entry ${joinBan ? 'restricted' : 'granted'}`,
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating join ban",
      error: error.message
    });
  }
};

// ✅ Delete user
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // 🛡️ ADMIN PROTECTION
    const targetUser = await User.findById(userId);
    if (targetUser?.role === "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrative identities are permanent and cannot be purged from the system."
        });
    }

    // 🔥 🔑 PURGE ALL SESSIONS BEFORE DELETION
    await Session.deleteMany({ userId });
    
    // Purge Redis keys
    const userKeys = await redis.keys(`refresh_token:${userId}:*`);
    if (userKeys.length > 0) await redis.del(...userKeys);

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message
    });
  }
};

// ✅ Get dashboard stats
export const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const onlineUsers = await User.countDocuments({ isLoggedIn: true });
    const activeUsers = await User.countDocuments({ status: "active" });
    const bannedUsers = await User.countDocuments({ status: "banned" });
    
    const premiumSubscribers = await User.countDocuments({ subscriptionTier: "premium" });
    const eliteSubscribers = await User.countDocuments({ subscriptionTier: "elite" });
    
    // Game Management
    const totalGames = await Game.countDocuments();
    const pendingGames = await Game.countDocuments({ status: "pending" });
    
    // Order Management
    const totalOrders = await RewardOrder.countDocuments();
    const pendingOrders = await RewardOrder.countDocuments({ deliveryStatus: "Pending" });

    // Moderation
    const activeReports = await Report.countDocuments({ status: "pending" });

    // Gem Economy
    const gemStats = await Transaction.aggregate([
      { $match: { currency: "GEMS" } },
      {
        $group: {
          _id: null,
          minted: {
            $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] }
          },
          spent: {
            $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] }
          }
        }
      }
    ]);

    const gemsMinted = gemStats.length > 0 ? gemStats[0].minted : 0;
    const gemsSpent = gemStats.length > 0 ? gemStats[0].spent : 0;

    // Revenue Breakdown (Last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const revenueBreakdown = await Transaction.aggregate([
      { 
        $match: { 
          currency: "INR",
          createdAt: { $gte: thirtyDaysAgo }
        } 
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" }
        }
      }
    ]);

    const revMap = {
      PASS: revenueBreakdown.find(r => r._id === "MEMBERSHIP")?.total || 0,
      GEMS: revenueBreakdown.find(r => r._id === "PURCHASE")?.total || 0,
      ADS: 0 // Placeholder for ads revenue if implemented later
    };

    // Users joined this month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    const usersThisMonth = await User.countDocuments({
      createdAt: { $gte: thisMonth }
    });

    const stats = {
      totalUsers,
      onlineUsers,
      activeUsers,
      bannedUsers,
      eliteSubscribers,
      
      totalGames,
      pendingGames,
      
      totalOrders,
      pendingOrders,
      
      activeReports,
      
      economy: {
        gemsMinted,
        gemsSpent
      },
      
      revenue: {
        total: revMap.PASS + revMap.GEMS + revMap.ADS,
        breakdown: revMap
      },
      
      usersThisMonth,
      serverStatus: "Healthy"
    };

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching stats",
      error: error.message
    });
  }
};

// ✅ Get system activity logs
export const getActivityLogs = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const { AuditLog } = await import("../models/AuditLog.js");

    const logs = await AuditLog.find()
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const formattedLogs = logs.map((log) => ({
      action: log.action.replace(/_/g, " "),
      user: log.userId?.username || "System",
      email: log.userId?.email || "N/A",
      time: log.createdAt,
      type: "admin_action",
      metadata: log.metadata
    }));

    return res.status(200).json({
      success: true,
      data: formattedLogs
    });
  } catch (error) {
    console.error("Fetch Activity Logs Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching logs",
      error: error.message
    });
  }
};

// ✅ Grant permission to user
export const grantPermission = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permission } = req.body;

    const validPermissions = [
      "view_analytics",
      "manage_users",
      "manage_settings",
      "manage_missions",
      "manage_weekend_missions",
      "manage_games",
      "manage_rewards",
      "manage_hero",
      "manage_payments",
      "moderate_chat"
    ];

    if (!validPermissions.includes(permission)) {
      return res.status(400).json({
        success: false,
        message: "Invalid permission"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.permissions.includes(permission)) {
      user.permissions.push(permission);
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: "Permission granted successfully",
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error granting permission",
      error: error.message
    });
  }
};

// ✅ Revoke permission from user
export const revokePermission = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permission } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    user.permissions = user.permissions.filter((p) => p !== permission);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Permission revoked successfully",
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error revoking permission",
      error: error.message
    });
  }
};

export const getHomeGames = async (req, res) => {
  try {
    const games = await Game.find({
      isActive: true,
      showOnHome: true,
    }).sort({ homeOrder: 1 });

    res.status(200).json({
      success: true,
      games,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch home games",
    });
  }
};
export const updateHomeGames = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { showOnHome, homeOrder } = req.body;

    const game = await Game.findByIdAndUpdate(
      gameId,
      {
        showOnHome,
        homeOrder,
      },
      { new: true }
    );

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    res.status(200).json({
      success: true,
      game,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to update game",
    });
  }
};

// adminController.js
export const getAllGamesAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [games, total] = await Promise.all([
      Game.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Game.countDocuments()
    ]);

    res.json({
      success: true,
      games,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: total > skip + games.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch games for admin" });
  }
};

// ✅ Update game (including category)
export const updateGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const updateData = req.body;

    const game = await Game.findByIdAndUpdate(
      gameId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Game updated successfully",
      game
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating game"
    });
  }
};
// ✅ Get user registration trends (last 30 days)
export const getAnalyticsData = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trends = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Fill in gaps (dates with 0 registrations)
    const formattedTrends = [];
    const dateCursor = new Date(thirtyDaysAgo);
    const today = new Date();

    while (dateCursor <= today) {
      const dateStr = dateCursor.toISOString().split('T')[0];
      const found = trends.find(t => t._id === dateStr);
      formattedTrends.push({
        date: dateStr,
        count: found ? found.count : 0
      });
      dateCursor.setDate(dateCursor.getDate() + 1);
    }

    return res.status(200).json({
      success: true,
      data: formattedTrends
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching analytics",
      error: error.message
    });
  }
};
// ✅ Get all Elite Pass subscribers
export const getSubscribers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", tier = "all" } = req.query;
    
    let filter = { subscriptionTier: { $ne: "none" } };
    if (tier !== "all") {
      filter.subscriptionTier = tier;
    }
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const subscribers = await User.find(filter)
      .select("username email avatar subscriptionTier subscriptionExpiry createdAt")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: subscribers,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching subscribers",
      error: error.message
    });
  }
};

// ✅ Manually toggle Elite Pass status
export const toggleElitePass = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tier } = req.body; // none, premium, elite

    console.log(`🎯 [Admin] Updating subscription tier for user ${userId} to: ${tier}`);

    if (!["none", "premium", "elite"].includes(tier)) {
      console.error(`❌ [Admin] Invalid tier provided: ${tier}`);
      return res.status(400).json({ success: false, message: "Invalid subscription tier" });
    }

    const updateData = { 
        subscriptionTier: tier, 
        subscriptionExpiry: tier !== "none" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null 
    };

    // 🏁 If revoking membership, also clear booster status
    if (tier === "none") {
        updateData.activeBoost = {
            availableAt: null,
            expiresAt: null,
            activatedAt: null,
            activeUntil: null,
            isUsed: false,
            renewCount: 0,
            lastGrantDate: ""
        };
        console.log(`🔄 [Admin] Clearing booster status for user ${userId}`);
    }

    console.log(`💾 [Admin] Update data:`, JSON.stringify(updateData, null, 2));

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select("username email subscriptionTier subscriptionExpiry activeBoost");

    if (!user) {
      console.error(`❌ [Admin] User not found: ${userId}`);
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    console.log(`✅ [Admin] Successfully updated user ${user.username} (${userId})`);
    console.log(`✅ [Admin] New subscription tier: ${user.subscriptionTier}`);
    console.log(`✅ [Admin] New expiry: ${user.subscriptionExpiry}`);

    await logAudit(req, "ELITE_PASS_TOGGLED", { targetUserId: userId, tier });
    return res.status(200).json({
      success: true,
      message: `Membership Protocol updated to ${tier.toUpperCase()} for ${user.username}`,
      data: user
    });
  } catch (error) {
    console.error(`❌ [Admin] Error toggling Elite Pass:`, error);
    return res.status(500).json({
      success: false,
      message: "Error toggling Elite Pass",
      error: error.message
    });
  }
};
// --- GEM PACKAGE MANAGEMENT ---

export const getAllGemPackages = async (req, res) => {
  try {
    const packages = await GemPackage.find().sort({ displayOrder: 1 });
    res.json({ success: true, packages });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching gem packages" });
  }
};

export const createGemPackage = async (req, res) => {
  try {
    const { name, description, gemAmount, priceInr, isActive, displayOrder, showDiscount, discountTag } = req.body;
    const pkg = await GemPackage.create({
      name,
      description,
      gemAmount,
      priceInr,
      isActive,
      displayOrder,
      showDiscount,
      discountTag
    });
    await logAudit(req, "GEM_PACKAGE_CREATED", { packageId: pkg._id, name: pkg.name });
    res.status(201).json({ success: true, message: "Gem package created", package: pkg });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error creating gem package" });
  }
};

export const updateGemPackage = async (req, res) => {
  try {
    const { packageId } = req.params;
    const pkg = await GemPackage.findByIdAndUpdate(packageId, req.body, { new: true });
    if (!pkg) return res.status(404).json({ success: false, message: "Package not found" });
    await logAudit(req, "GEM_PACKAGE_UPDATED", { packageId: pkg._id, name: pkg.name });
    res.json({ success: true, message: "Gem package updated", package: pkg });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error updating gem package" });
  }
};

export const deleteGemPackage = async (req, res) => {
  try {
    const { packageId } = req.params;
    const pkg = await GemPackage.findByIdAndDelete(packageId);
    if (!pkg) return res.status(404).json({ success: false, message: "Package not found" });
    await logAudit(req, "GEM_PACKAGE_DELETED", { packageId });
    res.json({ success: true, message: "Gem package deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};

// --- Season Reward Management ---

export const getSeasonRewardsAdmin = async (req, res) => {
  try {
    const rewards = await SeasonReward.find().sort({ level: 1 });
    res.json({ success: true, rewards });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch rewards" });
  }
};

export const updateSeasonRewardAdmin = async (req, res) => {
  try {
    const { level, free, elite, isMilestone } = req.body;
    const reward = await SeasonReward.findOneAndUpdate(
      { level },
      { free, elite, isMilestone },
      { upsert: true, new: true }
    );
    await logAudit(req, "SEASON_REWARD_UPDATED", { level, isMilestone });
    res.json({ success: true, message: "Reward tier updated", reward });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update reward" });
  }
};

export const deleteSeasonRewardAdmin = async (req, res) => {
  try {
    const { rewardId } = req.params;
    await SeasonReward.findByIdAndDelete(rewardId);
    await logAudit(req, "SEASON_REWARD_DELETED", { rewardId });
    res.json({ success: true, message: "Reward tier removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete reward" });
  }
};

// ✅ General User Update (Admin)
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Filter out sensitive fields
    delete updateData.password;
    delete updateData.otp;
    delete updateData.googleId;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // Prevent Role escalation via this endpoint (use updateUserRole instead)
    delete updateData.role; 
    delete updateData.permissions;

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true })
      .select("-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpiry");
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await logAudit(req, "USER_UPDATE", { 
        targetId: userId, 
        targetModel: "User", 
        changes: updateData 
    });

    res.json({ success: true, message: "User updated successfully", user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update failed", error: err.message });
  }
};

// ✅ Ban User Wrapper
export const banUser = async (req, res) => {
  // Force status to banned
  req.body.status = "banned";
  // Delegate to existing logic
  return updateUserStatus(req, res);
};

// ✅ Unban User Wrapper
export const unbanUser = async (req, res) => {
  // Force status to active
  req.body.status = "active";
  // Delegate to existing logic
  return updateUserStatus(req, res);
};

// 🛡️ GLOBAL SESSION MONITOR (God View)
// Fetch all active pulses verified by Redis existence
export const getGlobalSessions = async (req, res) => {
    try {
        let cursor = '0';
        let keys = new Set();
        
        // Use SCAN to find all refresh_token keys without blocking the event loop
        do {
            const reply = await redis.scan(cursor, 'MATCH', 'refresh_token:*', 'COUNT', 100);
            cursor = reply[0];
            // 🛡️ SCAN can return duplicates, use a Set logic or manual check
            reply[1].forEach(key => keys.add(key));
        } while (cursor !== '0');

        if (keys.size === 0) {
            return res.status(200).json({ success: true, sessions: [] });
        }

        // Extract IDs: refresh_token:{userId}:{sessionId}
        const sessionMeta = Array.from(keys).map(key => {
            const parts = key.split(':');
            return { userId: parts[1], sessionId: parts[2] };
        });

        const userIds = [...new Set(sessionMeta.map(m => m.userId))];
        const sessionIds = sessionMeta.map(m => m.sessionId);

        // Fetch Metadata in Parallel
        const [users, sessions] = await Promise.all([
            User.find({ _id: { $in: userIds } }).select('username email avatar role'),
            Session.find({ _id: { $in: sessionIds } })
        ]);

        const userMap = users.reduce((acc, user) => {
            acc[user._id.toString()] = user;
            return acc;
        }, {});

        const sessionMap = sessions.reduce((acc, sess) => {
            acc[sess._id.toString()] = sess;
            return acc;
        }, {});

        // Build combined "Pulse" list & filter out orphans
        const globalPulses = sessionMeta
            .map(meta => {
                const user = userMap[meta.userId];
                const sess = sessionMap[meta.sessionId];

                if (!user || !sess) return null; // 🛡️ Hide low-fidelity ghost pulses

                // 🎨 BEAUTIFY MACHINE INFO
                let machineInfo = "Unknown Device";
                const ua = sess.userAgent || "";
                
                if (ua.includes("Windows NT 10.0")) machineInfo = "Windows 10/11";
                else if (ua.includes("iPhone")) machineInfo = "iPhone";
                else if (ua.includes("Android")) machineInfo = "Android Device";
                else if (ua.includes("Macintosh")) machineInfo = "MacBook/iMac";
                else if (ua.includes("Linux")) machineInfo = "Linux Station";

                const browser = ua.includes("Chrome") ? "Chrome" : 
                               ua.includes("Firefox") ? "Firefox" : 
                               ua.includes("Safari") ? "Safari" : 
                               ua.includes("Edge") ? "Edge" : "";

                const machine = browser ? `${browser} on ${machineInfo}` : machineInfo;

                return {
                    _id: meta.sessionId,
                    userId: meta.userId,
                    username: user.username,
                    email: user.email,
                    avatar: user.avatar?.url || '',
                    role: user.role,
                    ip: sess.ip === "::1" ? "Localhost" : sess.ip,
                    userAgent: machine,
                    rawUA: sess.userAgent, // Keep for debugging if needed
                    lastActivity: sess.lastActivity,
                    isCurrent: meta.sessionId === req.sessionId
                };
            })
            .filter(pulse => pulse !== null)
            .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        return res.status(200).json({
            success: true,
            sessions: globalPulses
        });
    } catch (error) {
        console.error("Global Sessions Error:", error);
        return res.status(500).json({ success: false, message: "Failed to scan global pulses" });
    }
};

// 🛡️ REVOKE GLOBAL SESSION
// Strict Deletion Order: Redis -> MongoDB
export const revokeGlobalSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Security: Find the session first to get the userId
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, message: "Pulse signature not found in archives" });
        }

        const userId = session.userId.toString();

        // 1. REVOKE REDIS (Kill the active handshake)
        await redis.del(`refresh_token:${userId}:${sessionId}`);
        
        // 2. CLEANUP REAUTH (Cleanup security state)
        await redis.del(`reauth:${userId}:${sessionId}`);

        // 3. ARCHIVE MONGODB (Remove record)
        await Session.findByIdAndDelete(sessionId);

        await logAudit(req, "REVOKE_GLOBAL_SESSION", {
            targetId: userId,
            targetSessionId: sessionId,
            reason: "Administrative protocol intervention"
        });

        return res.status(200).json({
            success: true,
            message: "Atmospheric pulse neutralized. Connection terminated."
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Intervention failed" });
    }
};
