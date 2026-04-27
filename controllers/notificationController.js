import { Notification } from "../models/Notification.js";

// ✅ Get User Notifications (Optimized)
export const getUserNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const results = await Notification.aggregate([
      { $match: { recipient: req.user._id } },
      {
        $facet: {
          notifications: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [{ $count: "count" }],
          unreadCount: [
            { $match: { isRead: false } },
            { $count: "count" }
          ]
        }
      }
    ]);

    const notifications = results[0].notifications;
    const total = results[0].totalCount[0]?.count || 0;
    const unreadCount = results[0].unreadCount[0]?.count || 0;

    res.json({
      success: true,
      notifications,
      meta: {
        page,
        limit,
        total,
        unreadCount
      }
    });
  } catch (error) {
    console.error("Fetch notifications error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

// ✅ Mark as Read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Mark specific notification
    if (id !== "all") {
        const { isRead = true } = req.body;
        await Notification.findOneAndUpdate(
            { _id: id, recipient: req.user._id },
            { isRead: isRead }
        );
    } 
    // Mark ALL as read
    else {
        await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { isRead: true }
        );
    }

    res.json({ success: true, message: "Notifications updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update notification" });
  }
};

// ✅ Delete All Notifications
export const clearNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ recipient: req.user._id });
    res.json({ 
      success: true, 
      message: "Inbox cleared", 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to clear notifications" });
  }
};

// 🔒 Internal Helper: Create Notification
export const createNotification = async ({ recipientId, type, title, message, data = {} }) => {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      data
    });
    
    // 🔔 Emit real-time notification via socket
    if (global.io) {
      global.io.to(`user_${recipientId}`).emit("notification_received", {
        notification: {
          _id: notification._id,
          type,
          title,
          message,
          data,
          isRead: false,
          createdAt: notification.createdAt
        }
      });
    }
    
    return notification;
  } catch (error) {
    console.error("Notification creation failed:", error);
    return null;
  }
};
