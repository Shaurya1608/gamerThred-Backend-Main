import express from "express";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";
import { isAuthenticated, isAdmin as authIsAdmin } from "../middleware/isAuthenticated.js"; // Renamed isAdmin to authIsAdmin to avoid conflict
import { requireReauth } from "../middleware/requireReauth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  getAllUsers,
  getUserById,
  updateUserRole,
  updateUserPermissions,
  updateUserStatus,
  updateUserChatBan,
  updateUserJoinBan,
  deleteUser,
  getAdminStats,
  getActivityLogs,
  grantPermission,
  revokePermission,
  updateHomeGames,
  getAllGamesAdmin,
  updateGame,
  getAnalyticsData,
  getSubscribers,
  toggleElitePass,
  getAllGemPackages,
  createGemPackage,
  updateGemPackage,
  deleteGemPackage,
  getSeasonRewardsAdmin,
  updateSeasonRewardAdmin,
  deleteSeasonRewardAdmin,
  updateUser, // Added for the new route
  banUser, // Added for the new route
  unbanUser, // Added for the new route
  getGlobalSessions,
  revokeGlobalSession
} from "../controllers/adminController.js";

import {
  getSubscriptionConfigs,
  updateSubscriptionConfig
} from "../controllers/subscriptionConfigController.js";

import {
  uploadMiddleware,
  updateGame as updateGameWithUpload
} from "../controllers/adminGameController.js";

import { updateSetting, exportDatabase, clearSystemCache, getCacheStatus } from "../controllers/systemController.js";

const router = express.Router();

// All admin routes require admin authentication and are rate limited
router.use(isAdmin);
router.use(rateLimit({ keyPrefix: "admin", limit: 300, windowSeconds: 60 })); // 300 requests per minute for admin actions

// Dashboard Stats
router.get("/stats", getAdminStats);
router.get("/activity-logs", getActivityLogs);
// System Settings
router.put("/settings/:key", checkPermission("manage_settings"), updateSetting);
router.get("/system/backup", checkPermission("manage_settings"), exportDatabase);
router.get("/system/cache-status", checkPermission("manage_settings"), getCacheStatus);
router.post("/system/clear-cache", checkPermission("manage_settings"), clearSystemCache);

// User Management
router.get("/logs", checkPermission("view_analytics"), getActivityLogs);
router.get("/analytics", checkPermission("view_analytics"), getAnalyticsData);

// User Management
router.get("/users", isAuthenticated, authIsAdmin, getAllUsers);
router.get("/users/:userId", isAuthenticated, authIsAdmin, getUserById);
router.put("/users/:userId", isAuthenticated, authIsAdmin, updateUser);
router.delete("/users/:userId", isAuthenticated, authIsAdmin, requireReauth, deleteUser); // 🛡️ Protected

// Ban Management
router.post("/users/:userId/ban", isAuthenticated, authIsAdmin, requireReauth, banUser); // 🛡️ Protected
router.post("/users/:userId/unban", isAuthenticated, authIsAdmin, requireReauth, unbanUser); // 🛡️ Protected

// Role & Permissions
router.put("/users/:userId/role", isAuthenticated, authIsAdmin, requireReauth, updateUserRole); // 🛡️ Protected
router.put("/users/:userId/permissions", isAuthenticated, authIsAdmin, requireReauth, updateUserPermissions); // 🛡️ Protected

// Global Session Monitor (God View)
router.get("/global-sessions", isAuthenticated, authIsAdmin, checkPermission("manage_sessions"), getGlobalSessions);
router.delete("/global-sessions/:sessionId", isAuthenticated, authIsAdmin, checkPermission("manage_sessions"), requireReauth, revokeGlobalSession);

// Status & Bans
router.put("/users/:userId/status", isAuthenticated, authIsAdmin, requireReauth, updateUserStatus); // 🛡️ Protected
router.put("/users/:userId/chat-ban", isAuthenticated, authIsAdmin, requireReauth, updateUserChatBan); // 🛡️ Protected
router.put("/users/:userId/join-ban", isAuthenticated, authIsAdmin, requireReauth, updateUserJoinBan); // 🛡️ Protected

// The following routes were replaced or modified by the above new routes,
// but keeping them commented out for reference if they were intended to coexist.
// router.delete("/users/:userId", checkPermission("manage_users"), deleteUser);

// Permission Management (keeping original as it's not fully replaced by the diff)
router.put("/users/:userId/permissions", checkPermission("manage_users"), updateUserPermissions);
router.post("/users/:userId/permissions/grant", checkPermission("manage_users"), grantPermission);
router.post("/users/:userId/permissions/revoke", checkPermission("manage_users"), revokePermission);

router.put("/games/:gameId/home",checkPermission("manage_games"),updateHomeGames,);
router.get("/games",checkPermission(["manage_games", "manage_missions", "manage_weekend_missions"]),getAllGamesAdmin);
// ✅ FIXED: Use specialized controller with upload support
router.put("/games/:gameId", checkPermission("manage_games"), uploadMiddleware, updateGameWithUpload);

// Elite Pass Management
router.get("/subscribers", checkPermission("manage_payments"), getSubscribers);
router.patch("/users/:userId/elite-pass", checkPermission("manage_payments"), toggleElitePass);

// Gem Package Management
router.get("/gem-packages", checkPermission("manage_payments"), getAllGemPackages);
router.post("/gem-packages", checkPermission("manage_payments"), createGemPackage);
router.put("/gem-packages/:packageId", checkPermission("manage_payments"), updateGemPackage);
router.delete("/gem-packages/:packageId", checkPermission("manage_payments"), deleteGemPackage);

// Season Reward Management
router.get("/season-rewards", checkPermission("manage_rewards"), getSeasonRewardsAdmin); 
router.put("/season-rewards", checkPermission("manage_rewards"), updateSeasonRewardAdmin);
router.delete("/season-rewards/:rewardId", checkPermission("manage_rewards"), deleteSeasonRewardAdmin);

// Subscription Configuration Management
router.get("/subscription-configs", checkPermission("manage_payments"), getSubscriptionConfigs);
router.put("/subscription-configs/:tier", checkPermission("manage_payments"), updateSubscriptionConfig);




export default router;
