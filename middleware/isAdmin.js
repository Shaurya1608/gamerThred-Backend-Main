import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import logger from "../utils/logger.js";

export const isAdmin = async (req, res, next) => {
  try {
    // Get access token from cookies
    const accessToken = req.cookies.accessToken;

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No access token provided"
      });
    }

    // Verify access token
    let decoded;
    try {
      decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: err.name === "TokenExpiredError" 
          ? "Access token expired" 
          : "Invalid access token"
      });
    }

    const userId = decoded.userId;
    const sessionId = decoded.sessionId;

    // 🔥 4️⃣ SESSION & USER CHECK (Multi-device aware)
    const [user, session] = await Promise.all([
      User.findById(userId),
      sessionId ? Session.findById(sessionId) : Session.findOne({ userId })
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!session) {
        logger.warn(`Admin Auth: Session ${sessionId} not found for user ${userId}`);
        return res.status(401).json({
          success: false,
          message: "Session expired or logged out from this device.",
          code: "SESSION_NOT_FOUND"
        });
    }

    // 🕒 ADMIN TIMEOUT CHECK (30 Minutes)
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

    // Standard activity update
    Session.findByIdAndUpdate(sessionId, { lastActivity: new Date() }).exec();

    // Check if staff (admin or moderator)
    if (user.role !== "admin" && user.role !== "moderator") {
      return res.status(403).json({
        success: false,
        message: "Access denied - Staff privileges required"
      });
    }

    if (user.isBanned || user.status === "banned") {
      return res.status(403).json({
        success: false,
        message: "Your account has been banned"
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error in admin middleware",
      error: error.message
    });
  }
};

// Middleware to check specific permission
// export const checkPermission = (requiredPermission) => {
//   return async (req, res, next) => {
//     try {
//       const accessToken = req.cookies.accessToken;

//       if (!accessToken) {
//         return res.status(401).json({
//           success: false,
//           message: "Unauthorized - No access token provided"
//         });
//       }

//       let decoded;
//       try {
//         decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN);
//       } catch (err) {
//         return res.status(401).json({
//           success: false,
//           message: "Invalid access token"
//         });
//       }

//       const user = await User.findById(decoded.userId);

//       if (!user) {
//         return res.status(404).json({
//           success: false,
//           message: "User not found"
//         });
//       }

//       if (!user.permissions.includes(requiredPermission)) {
//         return res.status(403).json({
//           success: false,
//           message: `Access denied - ${requiredPermission} permission required`
//         });
//       }

//       req.user = user;
//       next();
//     } catch (error) {
//       return res.status(500).json({
//         success: false,
//         message: "Error checking permission",
//         error: error.message
//       });
//     }
//   };
// };
export const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    try {
      // user already attached by isAdmin
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const perms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
      
      if (
        req.user.role === "admin" ||
        perms.some(p => req.user.permissions.includes(p))
      ) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `Access denied - ${requiredPermission} permission required`
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error checking permission",
        error: error.message
      });
    }
  };
};
