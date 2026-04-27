import { calculateLevelInfo } from "../utils/progressionUtil.js";

/**
 * Middleware to restrict access based on user level.
 * @param {number} minLevel - The minimum level required to access the route.
 */
export const levelGuard = (minLevel) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: "Unauthorized: Protocol requires authentication" });
            }

            const { level } = await calculateLevelInfo(req.user.xp || 0);

            if (level < minLevel) {
                return res.status(403).json({ 
                    success: false, 
                    message: `ACCESS DENIED: Required Level ${minLevel} (Current Level: ${level})`,
                    requiredLevel: minLevel,
                    currentLevel: level,
                    code: "LEVEL_INSUFFICIENT"
                });
            }

            next();
        } catch (error) {
            console.error("Level guard error:", error);
            res.status(500).json({ success: false, message: "Internal server error during level verification" });
        }
    };
};
