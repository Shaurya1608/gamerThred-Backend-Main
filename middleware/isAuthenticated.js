import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";

export const isAuthenticated = async (req, res, next) => {
  try {
    // 1️⃣ Read access token
    let accessToken = req.cookies.accessToken;

    // 📱 Support Bearer Token for Mobile Apps (Backward Compatible)
    if (!accessToken && req.headers.authorization?.startsWith("Bearer ")) {
      accessToken = req.headers.authorization.split(" ")[1];
    }

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No access token provided",
      });
    }

    // 2️⃣ Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN);
    } catch (err) {
      // Return specific error for expired tokens so frontend can refresh
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Access token expired",
          code: "TOKEN_EXPIRED", // Frontend can check this
        });
      }
      return res.status(401).json({
        success: false,
        message: "Invalid access token",
        code: "TOKEN_INVALID",
      });
    }

    // 3️⃣ Find user
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isVerified && process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    // 🛡️ BAN CHECK
    if (user.status === "banned" || user.isBanned) {
      // Check if temporary ban has expired
      if (user.banExpires && new Date(user.banExpires) < new Date()) {
        user.status = "active";
        user.isBanned = false;
        user.banExpires = null;
        await user.save();
      } else {
        return res.status(403).json({
          success: false,
          message: "PROTOCOL TERMINATED: Access Denied",
          code: "USER_BANNED",
          userId: user._id,
          banReason: user.banReason || "Violation of Platform Protocol",
          banExpires: user.banExpires
        });
      }
    }

    // 🔥 4️⃣ SESSION CHECK (Multi-device aware)
    const sessionId = decoded.sessionId;
    
    // Legacy support: if no sessionId in token, fallback to old userId check
    // This allows transition without forcing immediate logouts, but we prefer sessionId
    let session;
    if (sessionId) {
        session = await Session.findById(sessionId);
    } else {
        // Fallback for old tokens (will be replaced on next refresh)
        session = await Session.findOne({ userId: user._id });
        logger.debug(`Legacy session detected for user ${user._id}`);
    }

    if (!session) {
      logger.warn(`Session check failed for user ${user._id}. sessionId: ${sessionId}`);
      return res.status(401).json({
        success: false,
        message: "Session expired or logged out from this device.",
        code: "SESSION_NOT_FOUND"
      });
    }

    // 🕒 ADMIN TIMEOUT CHECK (30 Minutes)
    if (user.role === 'admin') {
        const lastActivity = new Date(session.lastActivity || 0);
        const now = new Date();
        const diffMinutes = (now - lastActivity) / 1000 / 60;

        if (diffMinutes > 30) {
            // Session expired
            await Session.findByIdAndDelete(sessionId);
            return res.status(401).json({
                success: false,
                message: "Admin session expired due to inactivity.",
                code: "SESSION_TIMEOUT"
            });
        }
        
        // 🔥 PROACTIVE IDENTITY RECOVERY
        // If the session record exists but lacks fidelity, patch it now
        if (session.ip === "Unknown" || session.userAgent === "Unknown") {
            const currentIp = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
            const currentUA = req.headers['user-agent'] || 'Unknown';
            
            if (currentIp !== "Unknown" || currentUA !== "Unknown") {
                await Session.findByIdAndUpdate(sessionId, { 
                    ip: session.ip === "Unknown" ? currentIp : session.ip,
                    userAgent: session.userAgent === "Unknown" ? currentUA : session.userAgent,
                    lastActivity: new Date()
                });
                logger.debug(`[Security] Patched mission identity for session ${sessionId}`);
            }
        } else {
            // Standard activity update
            Session.findByIdAndUpdate(sessionId, { lastActivity: new Date() }).exec();
        }
    }

    // 5️⃣ Attach user info
    req.userId = user._id;
    req.user = user;
    req.sessionId = sessionId;
    req.sessionMetadata = {
        ip: session.ip,
        userAgent: session.userAgent
    };

    // 6️⃣ Allow request
    next();

  } catch (error) {

    console.error("Auth Middleware Error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }

};

// Admin middleware
export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required"
      });
    }

    next();
  } catch (error) {
    console.error("Admin Middleware Error:", error);
    return res.status(500).json({
      success: false,
      message: "Authorization failed",
    });
  }
};

// 🔓 OPTIONAL AUTH (Populates req.user if present, but doesn't block if not)
export const optionalAuth = async (req, res, next) => {
  try {
    let accessToken = req.cookies.accessToken;

    // 📱 Support Bearer Token for Mobile Apps (Fallback)
    if (!accessToken && req.headers.authorization?.startsWith("Bearer ")) {
      accessToken = req.headers.authorization.split(" ")[1];
    }

    if (!accessToken) return next();

    let decoded;
    try {
      decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN);
    } catch (err) {
      // If token is invalid/expired, we just treat them as a guest instead of erroring
      return next();
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user || user.status === "banned" || user.isBanned) return next();

    // Session check
    const sessionId = decoded.sessionId;
    if (sessionId) {
        const session = await Session.findById(sessionId);
        if (!session) return next();
    }

    req.userId = user._id;
    req.user = user;
    next();
  } catch (error) {
    // Fail silently to next() for optional auth
    next();
  }
};
