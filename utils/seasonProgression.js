import { XP_PER_LEVEL, MAX_SEASON_LEVEL, SEASON_REWARDS } from "../config/seasonRewards.js";

export const calculateSeasonLevel = (xp) => {
    const level = Math.floor(xp / XP_PER_LEVEL) + 1;
    return Math.min(level, MAX_SEASON_LEVEL);
};

export const getSeasonProgression = (xp) => {
    const level = calculateSeasonLevel(xp);
    const xpInLevel = xp % XP_PER_LEVEL;
    const progress = (xpInLevel / XP_PER_LEVEL) * 100;

    return {
        level,
        xpInLevel,
        xpForNext: XP_PER_LEVEL,
        progress: level >= MAX_SEASON_LEVEL ? 100 : progress
    };
};

export const getPendingRewards = (user) => {
    const currentLevel = calculateSeasonLevel(user.seasonXp);
    const pending = [];

    for (let l = 1; l <= currentLevel; l++) {
        if (!user.claimedRewards.includes(l)) {
            const reward = SEASON_REWARDS[l];
            if (reward) {
                // Free reward is always available
                if (reward.free) pending.push({ level: l, type: 'free', data: reward.free });
                // Elite reward only if user has pass
                if (user.hasElitePass && reward.elite) pending.push({ level: l, type: 'elite', data: reward.elite });
            }
        }
    }
    return pending;
};
