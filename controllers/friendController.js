import { User } from "../models/User.js";
import { createNotification } from "./notificationController.js";

export const searchUsers = async (req, res) => {
  try {
    const { query, excludeFriends } = req.query;
    
    let filter = {
        _id: { $ne: req.user._id },
        status: "active"
    };

    if (excludeFriends === "true") {
        filter._id.$nin = req.user.friends;
    }

    if (query) {
       filter.username = { $regex: query, $options: "i" };
    }

    // If no query, we might want to prioritize recently active or random users
    // For now, standard find is okay, maybe sort by activity later if we had that field index
    const users = await User.find(filter)
    .select("username avatar subscriptionTier")
    .sort({ username: 1 })
    .limit(20);

    // Add friend status and online status
    const io = req.app.get("io");
    const results = users.map(user => {
      const isFriend = req.user.friends.includes(user._id);
      const room = io?.sockets.adapter.rooms.get(`user_${user._id}`);
      const isOnline = !!(room && room.size > 0);
      
      return {
        ...user.toObject(),
        isFriend,
        isOnline
      };
    });

    res.json({ success: true, users: results });
  } catch (error) {
    res.status(500).json({ success: false, message: "Search failed" });
  }
};

export const sendFriendRequest = async (req, res) => {
  try {
    const { userId } = req.body;
    const sender = req.user;

    if (sender._id.toString() === userId) {
      return res.status(400).json({ success: false, message: "Cannot friend yourself" });
    }

    const recipient = await User.findById(userId);
    if (!recipient) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (sender.friends.includes(userId)) {
      return res.status(400).json({ success: false, message: "Already friends" });
    }

    // Check if request already exists
    const existingRequest = recipient.friendRequests.find(r => r.from.toString() === sender._id.toString() && r.status === "pending");
    if (existingRequest) {
      return res.status(400).json({ success: false, message: "Request already sent" });
    }

    // Check if they sent US a request (Auto-accept?)
    // For now, simple flow: just send request.
    recipient.friendRequests.push({ from: sender._id });
    await recipient.save();

    await createNotification({
      recipientId: userId,
      type: "friend_request",
      title: "New Friend Request",
      message: `${sender.username} wants to be your friend!`,
      data: { userId: sender._id }
    });

    // Socket notify
    const io = req.app.get("io");
    if (io) {
        io.to(`user_${String(userId)}`).emit("friend_request_received", {
            from: {
                _id: sender._id,
                username: sender.username,
                avatar: sender.avatar
            }
        });
    }

    res.json({ success: true, message: "Friend request sent!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send request" });
  }
};

export const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId, senderId } = req.body; 
    // We can look up by requester ID actually, simpler since it's an array
    const user = await User.findById(req.user._id);
    const sender = await User.findById(senderId);

    if (!sender) return res.status(404).json({ success: false, message: "Sender not found" });

    // Validate request
    const reqIndex = user.friendRequests.findIndex(r => r.from.toString() === senderId && r.status === "pending");
    if (reqIndex === -1) {
        return res.status(404).json({ success: false, message: "Request not found" });
    }

    // Add friends
    if (!user.friends.includes(senderId)) user.friends.push(senderId);
    if (!sender.friends.includes(user._id)) sender.friends.push(user._id);

    // Remove request
    user.friendRequests.splice(reqIndex, 1);

    await Promise.all([user.save(), sender.save()]);

    await createNotification({
        recipientId: senderId,
        type: "friend_accepted",
        title: "Friend Request Accepted",
        message: `${user.username} is now your friend!`,
        data: { userId: user._id }
    });

    const io = req.app.get("io");
    if (io) {
        io.to(`user_${String(senderId)}`).emit("friend_accepted", { friend: { _id: user._id, username: user.username, avatar: user.avatar } });
        io.to(`user_${String(user._id)}`).emit("friend_update", {}); // Refresh self
    }

    res.json({ success: true, message: "Friend request accepted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to accept request" });
  }
};

export const declineFriendRequest = async (req, res) => {
  try {
    const { senderId } = req.body;
    const user = await User.findById(req.user._id);

    const reqIndex = user.friendRequests.findIndex(r => r.from.toString() === senderId && r.status === "pending");
    if (reqIndex !== -1) {
        user.friendRequests.splice(reqIndex, 1);
        await user.save();
    }

    // Emit socket event to refresh requester's view
    const io = req.app.get("io");
    if (io) {
        io.to(`user_${String(senderId)}`).emit("friend_update", {});
    }

    res.json({ success: true, message: "Request declined" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to decline" });
  }
};

export const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
        .populate("friends", "username avatar status subscriptionTier")
        .populate("friendRequests.from", "username avatar subscriptionTier");
    
    // Filter pending requests
    const pendingRequests = user.friendRequests.filter(r => r.status === "pending");

    // Calculate online status
    const io = req.app.get("io");
    const friendsWithStatus = user.friends.map(f => {
        const friendObj = f.toObject();
        const room = io?.sockets.adapter.rooms.get(`user_${f._id}`);
        friendObj.isOnline = !!(room && room.size > 0);
        return friendObj;
    });

    res.json({ 
        success: true, 
        friends: friendsWithStatus,
        pendingRequests: pendingRequests
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch friends" });
  }
};

export const unfriend = async (req, res) => {
  try {
    const { friendId } = req.body;
    const user = await User.findById(req.user._id);
    const friend = await User.findById(friendId);

    if (!friend) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Remove from both friend lists
    user.friends = user.friends.filter(id => id.toString() !== friendId);
    friend.friends = friend.friends.filter(id => id.toString() !== user._id.toString());

    await Promise.all([user.save(), friend.save()]);

    // Emit socket events to both users
    const io = req.app.get("io");
    if (io) {
        io.to(`user_${String(friendId)}`).emit("friend_removed", { userId: user._id });
        io.to(`user_${String(user._id)}`).emit("friend_update", {});
    }

    res.json({ success: true, message: "Friend removed" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to unfriend" });
  }
};

