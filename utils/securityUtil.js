import cacheService from "./cacheService.js";

/**
 * Validates a submitted game score against the game's metadata.
 * @param {number} score - The score submitted by the client.
 * @param {string} gameId - The ID of the game being played.
 * @returns {Promise<{isValid: boolean, reason?: string}>}
 */
export const validateScore = async (score, gameId, startTime = null) => {
  try {
    const game = await cacheService.getGame(gameId);
    if (!game) {
      return { isValid: false, reason: "Game not found" };
    }

    // 1. Basic type check
    if (typeof score !== "number" || isNaN(score)) {
      return { isValid: false, reason: "Invalid score format" };
    }

    // 2. Maximum absolute score check
    if (game.maxPossibleScore > 0 && score > game.maxPossibleScore) {
      return { 
        isValid: false, 
        reason: `Score ${score} exceeds maximum possible score ${game.maxPossibleScore}` 
      };
    }

    // 3. Score per Second (Progression Speed) check
    if (startTime && game.maxPointsPerSecond > 0) {
        const elapsedSeconds = (Date.now() - new Date(startTime).getTime()) / 1000;
        const scorePerSecond = score / Math.max(elapsedSeconds, 1);
        
        if (scorePerSecond > game.maxPointsPerSecond) {
            console.warn(`[ANTI-CHEAT] PPS Violation: User ${gameId} score ${score} in ${(Date.now() - new Date(startTime).getTime())/1000}s (${scorePerSecond.toFixed(1)} pts/s > ${game.maxPointsPerSecond})`);
            return {
                isValid: false,
                reason: `Impossible progression speed (${scorePerSecond.toFixed(1)} pts/s > ${game.maxPointsPerSecond} pts/s)`
            };
        }
    }

    // 4. Negative score check
    if (score < 0) {
      return { isValid: false, reason: "Score cannot be negative" };
    }

    return { isValid: true };
  } catch (error) {
    console.error("Score validation error:", error);
    return { isValid: false, reason: "Validation process failed" };
  }
};

/**
 * Validates the time taken to complete a game session.
 * @param {Date} startTime - When the session was started.
 * @param {string} gameId - The ID of the game.
 * @returns {Promise<{isValid: boolean, reason?: string}>}
 */
export const validateSessionTiming = async (startTime, gameId) => {
  try {
    const game = await cacheService.getGame(gameId);
    if (!game || !game.minPlayTimeSeconds) {
      return { isValid: true }; // No timing constraints
    }

    const elapsedSeconds = (Date.now() - new Date(startTime).getTime()) / 1000;

    if (elapsedSeconds < game.minPlayTimeSeconds) {
      return { 
        isValid: false, 
        reason: `Session completed too quickly (${elapsedSeconds.toFixed(1)}s < ${game.minPlayTimeSeconds}s)` 
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error("Timing validation error:", error);
    return { isValid: true }; // Fail-safe: allow if validation fails
  }
};
