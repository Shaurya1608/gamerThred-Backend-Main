import { User } from "../models/User.js";
import { Community } from "../models/Community.js";
import { Message } from "../models/Message.js";
import { Session } from "../models/Session.js";
import { redis } from "../config/redis.js";
import { logAudit } from "../utils/auditLogger.js";

// Fetch users with basic info for moderation list (Paginated)
export const getUsersForModeration = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query, "username email avatar role isBanned chatBan joinBan status")
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({ 
      success: true, 
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

// Apply or update bans on a user
export const updateUserBans = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isBanned, chatBan, joinBan, status } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isBanned, chatBan, joinBan, status },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 🔥 🔑 INSTANT GLOBAL SESSION REVOCATION ON BAN
    if (status === "banned" || isBanned) {
      await Session.deleteMany({ userId });
      
      const keys = await redis.keys(`refresh_token:${userId}:*`);
      if (keys.length > 0) await redis.del(...keys);
    }

    await logAudit(req, "USER_BANS_UPDATED", { userId, isBanned, chatBan, joinBan, status });
    res.json({ success: true, message: "User bans updated successfully", user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update user bans" });
  }
};

// Delete a community and all its messages
export const deleteCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;

    const community = await Community.findByIdAndDelete(communityId);
    if (!community) {
      return res.status(404).json({ success: false, message: "Community not found" });
    }

    // Delete associated messages
    await Message.deleteMany({ community: communityId });

    await logAudit(req, "COMMUNITY_DELETED", { communityId });
    res.json({ success: true, message: "Community and associated messages deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete community" });
  }
};

// Ban user from a specific community
export const banFromCommunity = async (req, res) => {
    try {
        const { communityId, userId } = req.body;
        
        await Community.findByIdAndUpdate(communityId, {
            $addToSet: { bannedUsers: userId },
            $pull: { members: userId }
        });

        await logAudit(req, "COMMUNITY_BAN", { communityId, userId });
        res.json({ success: true, message: "User banned from community" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to ban user from community" });
    }
};
