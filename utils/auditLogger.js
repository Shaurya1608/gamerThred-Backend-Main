import { AuditLog } from "../models/AuditLog.js";

export const logAudit = async (req, action, meta = {}) => {
  try {
    // Extract standard metadata
    const logEntry = {
      userId: req.user?._id || null, // Actor
      action: action.toUpperCase(),
      ip: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      userAgent: req.headers["user-agent"],
      
      // Extended Metadata
      targetId: meta.targetId || null, // ID of object being modified
      targetModel: meta.targetModel || null, // Collection name (User, Game, etc.)
      
      // Context
      sessionId: req.user?.sessionId || req.cookies?.sessionId || null,
      status: meta.status || "SUCCESS",
      failureReason: meta.failureReason || null,
      
      // Changes (Before/After)
      changes: meta.changes || null, // { before: {...}, after: {...} }
      
      meta: {
        ...meta,
        path: req.originalUrl,
        method: req.method
      }
    };

    // Remove undefined fields to keep DB clean
    Object.keys(logEntry).forEach(key => logEntry[key] === undefined && delete logEntry[key]);

    await AuditLog.create(logEntry);
  } catch (error) {
    // Fallback: don't crash the request if logging fails, but print to console
    console.error("AUDIT LOG FAILURE:", error);
  }
};
