import express from "express";
import { 
    getCommunities, 
    createCommunity, 
    getMessageHistory, 
    joinCommunity, 
    getMyCommunities,
    createGroup,
    addGroupMember,
    removeGroupMember,
    getGroupMembers,
    deleteGroup,
    toggleChatLock,
    requestJoinCommunity,
    getMyRequestStatus,
    getPendingRequests,
    approveJoinRequest,
    rejectJoinRequest,
    leaveCommunity,
    updateDirective
} from "../controllers/chatController.js";
import { levelGuard } from "../middleware/levelGuard.js";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";
import { isAuthenticated } from "../middleware/isAuthenticated.js";

const router = express.Router();

// Public/Member routes (require login)
router.get("/communities", getCommunities);
router.get("/my-communities", isAuthenticated, getMyCommunities);
router.post("/join/:communityId", isAuthenticated, levelGuard(1), joinCommunity);
router.post("/leave/:communityId", isAuthenticated, leaveCommunity);
router.get("/history/:communityId", isAuthenticated, getMessageHistory);

// 📨 Join Request Routes
router.post("/request-join/:communityId", isAuthenticated, levelGuard(5), requestJoinCommunity);
router.get("/my-request-status/:communityId", isAuthenticated, getMyRequestStatus);
router.get("/pending-requests/:communityId", isAuthenticated, getPendingRequests);
router.post("/approve-request/:communityId", isAuthenticated, approveJoinRequest);
router.post("/reject-request/:communityId", isAuthenticated, rejectJoinRequest);

// 👥 Group management routes
router.post("/groups", isAuthenticated, levelGuard(5), createGroup);
router.post("/groups/add-member", isAuthenticated, addGroupMember);
router.post("/groups/remove-member", isAuthenticated, removeGroupMember);
router.get("/groups/:groupId/members", isAuthenticated, getGroupMembers);
router.delete("/groups/:groupId", isAuthenticated, deleteGroup);
router.post("/groups/:groupId/directive", isAuthenticated, updateDirective);
router.post("/groups/:groupId/toggle-lock", isAuthenticated, toggleChatLock);

// Admin/Moderator routes
router.post("/communities", isAuthenticated, isAdmin, checkPermission("moderate_chat"), createCommunity);

export default router;
