import { Community } from "../models/Community.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";

// Get all PUBLIC communities
export const getCommunities = async (req, res) => {
  try {
    const communities = await Community.find({ 
        isActive: true, 
        type: { $ne: "group" }, 
        privacy: { $ne: "private" } 
    }).populate("owner", "username avatar");
    res.json({ success: true, communities });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch communities" });
  }
};

// Create a new community (PLATFORM PUBLIC - ADMIN ONLY)
export const createCommunity = async (req, res) => {
  try {
    const { name, description, icon } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const community = await Community.create({
      name,
      slug,
      description,
      icon,
      type: "public",
      privacy: "open",
      owner: req.user._id,
      members: [req.user._id]
    });

    res.status(201).json({ success: true, community });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Community name already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to create community" });
  }
};

/** 👥 GROUP CHAT LOGIC **/

// Create a Private Group
export const createGroup = async (req, res) => {
    try {
        const { name, description, members = [], type: reqType = "group" } = req.body;
        const slug = `group-${Date.now()}-${name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;

        // Ensure creator is in members
        const allMembers = Array.from(new Set([req.user._id, ...members]));

        // Determine type and privacy based on intent
        const finalType = reqType === "community" ? "public" : "group";
        const finalPrivacy = reqType === "community" ? "open" : "private";

        const group = await Community.create({
            name,
            slug,
            description,
            type: finalType,
            privacy: finalPrivacy,
            owner: req.user._id,
            members: allMembers
        });

        const populatedGroup = await Community.findById(group._id).populate("owner", "username avatar");

        res.status(201).json({ success: true, group: populatedGroup });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to create group" });
    }
};

// Add Member to Group (Owner Only)
export const addGroupMember = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const group = await Community.findById(groupId);

        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (String(group.owner) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Unauthorized: Only owners can add members" });
        }

        if (group.isLocked) {
            // Allow owner to override if it's just about adding members
            // But we need to make sure the added member is also in the lockedMemberIds of the mission registration
            const { WeekendMissionRegistration } = await import("../models/WeekendMissionRegistration.js");
            const registration = await WeekendMissionRegistration.findOne({ groupId, status: "registered" });
            
            if (registration) {
                if (!registration.lockedMemberIds.some(id => String(id) === String(userId))) {
                    registration.lockedMemberIds.push(userId);
                    await registration.save();
                }
            }
        }

        if (group.members.includes(userId)) {
            return res.status(400).json({ success: false, message: "User already in group" });
        }

        group.members.push(userId);
        await group.save();

        const newUser = await User.findById(userId).select("username avatar elo role tier");

        res.json({ 
            success: true, 
            message: "Member added successfully",
            member: newUser
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to add member" });
    }
};

// Remove Member from Group (Owner Only)
export const removeGroupMember = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const group = await Community.findById(groupId);

        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (String(group.owner) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Unauthorized: Only owners can remove members" });
        }

        if (String(group.owner) === String(userId)) {
            return res.status(400).json({ success: false, message: "Cannot remove the owner" });
        }

        if (group.isLocked) {
            // Allow owner to remove members even if locked (e.g. kicking inactive people or toxic people)
            const { WeekendMissionRegistration } = await import("../models/WeekendMissionRegistration.js");
            const registration = await WeekendMissionRegistration.findOne({ groupId, status: "registered" });
            
            if (registration) {
                registration.lockedMemberIds = registration.lockedMemberIds.filter(id => String(id) !== String(userId));
                await registration.save();
            }
        }

        group.members = group.members.filter(m => String(m) !== String(userId));
        await group.save();

        res.json({ success: true, message: "Member removed successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to remove member" });
    }
};

// Delete Group (Owner Only)
export const deleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Community.findById(groupId);

        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (String(group.owner) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        await Community.findByIdAndDelete(groupId);
        // Optional: Delete all messages in the group
        await Message.deleteMany({ community: groupId });

        // 📡 Emit real-time group deletion
        const io = req.app.get("io");
        if (io) {
            io.to(groupId).emit("group_deleted", { groupId });
        }

        res.json({ success: true, message: "Group deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to delete group" });
    }
};

// Get group members with details
export const getGroupMembers = async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Community.findById(groupId).populate("members", "username avatar elo role tier");
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        
        res.json({ success: true, members: group.members });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch members" });
    }
};

// Get message history for a community/group
export const getMessageHistory = async (req, res) => {
  try {
    const { communityId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Auth Check: Is user a member?
    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ success: false, message: "Not found" });
    
    // ✅ NEW: Check if user is a member (for both public and private communities)
    if (!community.members.includes(req.user._id)) {
        return res.status(403).json({ 
            success: false, 
            message: "Access Denied: You must be a member to view messages",
            isMember: false
        });
    }

    const [messages, total] = await Promise.all([
      Message.find({ community: communityId })
        .populate("sender", "username avatar role")
        .sort({ createdAt: -1 }) // Get newest first for cursor-like pagination
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ community: communityId })
    ]);

    res.json({ 
      success: true, 
      messages: messages.reverse(), // Reverse to show chronological order
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: total > skip + messages.length
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
};

// Seed initial communities if none exist
export const seedCommunities = async () => {
    try {
        const count = await Community.countDocuments();
        if (count === 0) {
            console.log("No communities found. Waiting for manual creation or first admin action.");
        }
    } catch (err) {
        console.error("Seeding error:", err);
    }
};

// Join a PUBLIC community
export const joinCommunity = async (req, res) => {
    try {
        const { communityId } = req.params;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ success: false, message: "Community not found" });

        // If already a member, return success (idempotent)
        if (community.members.includes(userId)) {
            return res.json({ success: true, message: "Already a member" });
        }

        if (community.privacy === "private") {
            return res.status(403).json({ success: false, message: "Cannot join private groups. Must be invited." });
        }

        community.members.push(userId);
        await community.save();

        res.json({ success: true, message: "Joined community successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to join community" });
    }
};

// Toggle Chat Lock (Owner Only)
export const toggleChatLock = async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Community.findById(groupId);

        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (String(group.owner) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        group.isLocked = !group.isLocked;
        await group.save();

        // 📡 Emit real-time lock update
        const io = req.app.get("io");
        if (io) {
            io.to(groupId).emit("chat_lock_updated", {
                groupId,
                isLocked: group.isLocked
            });
        }

        res.json({ success: true, isLocked: group.isLocked, message: `Chat ${group.isLocked ? 'Locked' : 'Unlocked'}` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to toggle chat lock" });
    }
};

// Update Squad Directive (Owner Only)
export const updateDirective = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { directiveMessage, showDirective } = req.body;
        const group = await Community.findById(groupId);

        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (String(group.owner) !== String(req.user._id)) {
            // Special exception: Global admins can only moderate PUBLIC hubs, not private squads
            if (req.user.role !== "admin" || group.type === "group") {
                return res.status(403).json({ success: false, message: "Unauthorized: Only commanders can update the directive for this squad" });
            }
        }

        if (directiveMessage !== undefined) group.directiveMessage = directiveMessage;
        if (showDirective !== undefined) group.showDirective = showDirective;

        await group.save();

        // 📡 Emit real-time directive update
        const io = req.app.get("io");
        if (io) {
            io.to(groupId).emit("directive_updated", {
                groupId,
                directiveMessage: group.directiveMessage,
                showDirective: group.showDirective
            });
        }

        res.json({ 
            success: true, 
            message: "Directive updated successfully",
            directiveMessage: group.directiveMessage,
            showDirective: group.showDirective
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to update directive" });
    }
};

// Get communities/groups user has joined
export const getMyCommunities = async (req, res) => {
    try {
        const userId = req.user._id;
        const communities = await Community.find({ members: userId, isActive: true })
            .populate("owner", "username avatar")
            .sort({ updatedAt: -1 });
        res.json({ success: true, communities });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch your communities" });
    }
};

// ========================================
// 📨 JOIN REQUEST SYSTEM
// ========================================

// Request to join a community
export const requestJoinCommunity = async (req, res) => {
    try {
        const { communityId } = req.params;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ success: false, message: "Community not found" });

        // Check if already a member
        if (community.members.includes(userId)) {
            return res.status(400).json({ success: false, message: "Already a member" });
        }

        // Check if already has a pending request
        const existingRequest = community.pendingRequests.find(
            req => String(req.user) === String(userId) && req.status === "pending"
        );
        if (existingRequest) {
            return res.status(400).json({ success: false, message: "Request already pending" });
        }

        // Add join request
        community.pendingRequests.push({
            user: userId,
            requestedAt: new Date(),
            status: "pending"
        });
        await community.save();

        // 📡 Emit real-time notification to community owner
        const io = req.app.get("io");
        if (io) {
            const populatedCommunity = await Community.findById(communityId)
                .populate("pendingRequests.user", "username avatar");
            const request = populatedCommunity.pendingRequests.find(
                r => String(r.user._id) === String(userId)
            );
            // Fix: Emit to 'user_' prefixed room
            io.to(`user_${String(community.owner)}`).emit("join_request_received", {
                communityId,
                communityName: community.name,
                request
            });
        }

        res.json({ success: true, message: "Join request sent successfully" });
    } catch (error) {
        console.error("Request join error:", error);
        res.status(500).json({ success: false, message: "Failed to send join request" });
    }
};

// Get user's request status for a specific community
export const getMyRequestStatus = async (req, res) => {
    try {
        const { communityId } = req.params;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ success: false, message: "Community not found" });

        // Check if member
        const isMember = community.members.includes(userId);
        if (isMember) {
            return res.json({ success: true, status: "member" });
        }

        // Check for pending/rejected request
        const request = community.pendingRequests.find(
            req => String(req.user) === String(userId)
        );

        if (!request) {
            return res.json({ success: true, status: "none" });
        }

        res.json({ 
            success: true, 
            status: request.status,
            requestedAt: request.requestedAt
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to check request status" });
    }
};

// Get pending join requests for a community (Owner only)
export const getPendingRequests = async (req, res) => {
    try {
        const { communityId } = req.params;
        const community = await Community.findById(communityId)
            .populate("pendingRequests.user", "username avatar elo tier");

        if (!community) return res.status(404).json({ success: false, message: "Community not found" });

        // Check if user is owner OR global admin
        if (String(community.owner) !== String(req.user._id)) {
            // Global admins can see/manage requests for public communities, but not private groups
            if (req.user.role !== "admin" || community.type === "group") {
                return res.status(403).json({ success: false, message: "Unauthorized: Only commanders can view requests for this squad" });
            }
        }

        const pendingRequests = community.pendingRequests.filter(req => req.status === "pending");

        res.json({ success: true, requests: pendingRequests });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch pending requests" });
    }
};

// Approve a join request (Owner only)
export const approveJoinRequest = async (req, res) => {
    try {
        const { communityId } = req.params;
        const { userId } = req.body;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ success: false, message: "Community not found" });

        // Check if user is owner OR global admin
        if (String(community.owner) !== String(req.user._id)) {
            if (req.user.role !== "admin" || community.type === "group") {
                return res.status(403).json({ success: false, message: "Unauthorized: Only commanders can approve requests for this squad" });
            }
        }

        // Find the request
        const requestIndex = community.pendingRequests.findIndex(
            req => String(req.user) === String(userId) && req.status === "pending"
        );

        if (requestIndex === -1) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }

        // Update request status
        community.pendingRequests[requestIndex].status = "approved";

        // Add user to members
        if (!community.members.includes(userId)) {
            community.members.push(userId);
        }

        await community.save();

        // 📡 Emit real-time notification to user
        const io = req.app.get("io");
        if (io) {
            // Fix: Emit to 'user_' prefixed room
            io.to(`user_${String(userId)}`).emit("join_request_approved", {
                communityId,
                communityName: community.name
            });
        }

        res.json({ success: true, message: "Join request approved" });
    } catch (error) {
        console.error("Approve request error:", error);
        res.status(500).json({ success: false, message: "Failed to approve request" });
    }
};

// Reject a join request (Owner only)
export const rejectJoinRequest = async (req, res) => {
    try {
        const { communityId } = req.params;
        const { userId } = req.body;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ success: false, message: "Community not found" });

        // Check if user is owner OR global admin
        if (String(community.owner) !== String(req.user._id)) {
            if (req.user.role !== "admin" || community.type === "group") {
                return res.status(403).json({ success: false, message: "Unauthorized: Only commanders can reject requests for this squad" });
            }
        }

        // Find the request
        const requestIndex = community.pendingRequests.findIndex(
            req => String(req.user) === String(userId) && req.status === "pending"
        );

        if (requestIndex === -1) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }

        // Update request status
        community.pendingRequests[requestIndex].status = "rejected";
        await community.save();

        // 📡 Emit real-time notification to user
        const io = req.app.get("io");
        if (io) {
            // Fix: Emit to 'user_' prefixed room
            io.to(`user_${String(userId)}`).emit("join_request_rejected", {
                communityId,
                communityName: community.name
            });
        }

        res.json({ success: true, message: "Join request rejected" });
    } catch (error) {
        console.error("Reject request error:", error);
        res.status(500).json({ success: false, message: "Failed to reject request" });
    }
};

// Leave a community (Member only)
export const leaveCommunity = async (req, res) => {
    try {
        const { communityId } = req.params;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) return res.status(404).json({ success: false, message: "Community not found" });

        // Owners cannot leave, they must delete the group
        if (String(community.owner) === String(userId)) {
            return res.status(400).json({ success: false, message: "Owners cannot leave the group. You must delete it or transfer ownership." });
        }

        // Check if member
        if (!community.members.includes(userId)) {
            return res.status(400).json({ success: false, message: "You are not a member of this community" });
        }

        // Cleanup Weekend Mission Registration if exists
        if (community.type === 'group') {
             const { WeekendMissionRegistration } = await import("../models/WeekendMissionRegistration.js");
             const registration = await WeekendMissionRegistration.findOne({ groupId: communityId, status: "registered" });
             
             if (registration) {
                 registration.lockedMemberIds = registration.lockedMemberIds.filter(id => String(id) !== String(userId));
                 await registration.save();
             }
        }

        community.members = community.members.filter(m => String(m) !== String(userId));
        await community.save();

        res.json({ success: true, message: "Successfully left the group" });
    } catch (error) {
        console.error("Leave community error:", error);
        res.status(500).json({ success: false, message: "Failed to leave community" });
    }
};

