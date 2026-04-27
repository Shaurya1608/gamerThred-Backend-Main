import { Session } from "../models/Session.js";
import { redis } from "../config/redis.js";

// GET /auth/sessions
export const getActiveSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user._id })
      .sort({ lastActivity: -1 })
      .select("ip userAgent lastActivity createdAt");

    // Augment with current session flag
    const safeSessions = sessions.map(session => ({
      _id: session._id,
      ip: session.ip,
      userAgent: session.userAgent,
      lastActivity: session.lastActivity,
      createdAt: session.createdAt,
      isCurrent: session._id.toString() === req.sessionId?.toString()
    }));

    return res.status(200).json({
      success: true,
      sessions: safeSessions
    });
  } catch (error) {
    console.error("Get sessions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve sessions"
    });
  }
};

// DELETE /auth/sessions/:sessionId
export const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;

    // Prevent revoking current session via this endpoint (users should use logout)
    if (sessionId === req.sessionId) {
      return res.status(400).json({
        success: false,
        message: "Cannot revoke current session. Please use logout instead."
      });
    }

    const session = await Session.findOne({ _id: sessionId, userId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found"
      });
    }

    // 1. Remove from MongoDB
    await Session.findByIdAndDelete(sessionId);

    // 2. Remove refresh token from Redis
    await redis.del(`refresh_token:${userId}:${sessionId}`);

    return res.status(200).json({
      success: true,
      message: "Session revoked successfully"
    });
  } catch (error) {
    console.error("Revoke session error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to revoke session"
    });
  }
};
