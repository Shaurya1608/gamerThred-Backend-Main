import { redis } from "../config/redis.js";

/**
 * Middleware to require password re-authentication for sensitive actions.
 * Checks for a 'adminVerified' flag in Redis for the current session.
 */
export const requireReauth = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const sessionId = req.sessionId || req.cookies.sessionId; // Correctly accessing sessionId attached by isAuthenticated

    if (!sessionId) {
         // Fallback for legacy sessions without explicit IDs in token
         // We can't securely track re-auth without a session ID, so we block.
         return res.status(401).json({
            success: false,
            message: "Session context missing. Please re-login.",
            code: "SESSION_MISSING"
         });
    }

    // Check Redis for re-auth flag
    const key = `reauth:${userId.toString()}:${sessionId}`;
    const isVerified = await redis.get(key);

    if (!isVerified) {
      return res.status(403).json({
        success: false,
        message: "Security Protocol: Password verification required.",
        code: "REAUTH_REQUIRED" // Frontend listens for this to show modal
      });
    }

    // Refresh the flag expiry (optional - sliding window)
    // await redis.expire(`reauth:${userId}:${sessionId}`, 5 * 60); 

    next();
  } catch (error) {
    console.error("Re-auth Middleware Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal security error"
    });
  }
};
