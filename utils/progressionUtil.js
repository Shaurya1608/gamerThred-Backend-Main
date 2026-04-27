import { ProgressionConfig } from "../models/ProgressionConfig.js";

/**
 * Calculates level from total XP based on dynamic progression configuration.
 * @param {number} totalXp - The user's current total XP.
 * @returns {Promise<{level: number, xpInCurrentLevel: number, xpForNextLevel: number, progress: number}>}
 */
export const calculateLevelInfo = async (totalXp) => {
  const config = await ProgressionConfig.findOne({ key: "default" });
  if (!config) {
    // Fallback logic if config is missing
    const level = Math.floor(totalXp / 100) + 1;
    return { level, xpInCurrentLevel: totalXp % 100, xpForNextLevel: 100, progress: (totalXp % 100) / 100 };
  }

  let level = 1;
  let remainingXp = totalXp;
  let xpNeededForNext = 0;

  for (const tier of config.levels) {
    const tierSize = tier.maxLevel - tier.minLevel + 1;
    for (let i = 0; i < tierSize; i++) {
        xpNeededForNext = tier.xpPerLevel;
        if (remainingXp < xpNeededForNext) {
            return {
                level,
                xpInCurrentLevel: remainingXp,
                xpForNextLevel: xpNeededForNext,
                progress: (remainingXp / xpNeededForNext) * 100
            };
        }
        remainingXp -= xpNeededForNext;
        level++;
    }
  }

  // If we surpass all tiers, use the last tier's XP requirement
  return {
    level,
    xpInCurrentLevel: remainingXp,
    xpForNextLevel: xpNeededForNext,
    progress: (remainingXp / xpNeededForNext) * 100
  };
};
