import { Game } from "../models/Game.js";

/**
 * Cache Service - Scalability Phase 1
 * Implements a check-on-read TTL pattern to avoid redundant DB lookups for static metadata.
 */
class CacheService {
    constructor() {
        this.gameCache = new Map();
        this.TTL = 10 * 60 * 1000; // 10 Minutes
    }

    /**
     * Get game metadata with auto-refresh on expiry
     * @param {string} gameId 
     */
    async getGame(gameId) {
        if (!gameId) return null;
        
        const idStr = gameId.toString();
        const now = Date.now();
        const cached = this.gameCache.get(idStr);

        // Cache Hit
        if (cached && now < cached.expiresAt) {
            return cached.data;
        }

        // Cache Miss / Expired
        try {
            const game = await Game.findById(idStr).lean();
            if (game) {
                this.gameCache.set(idStr, {
                    data: game,
                    expiresAt: now + this.TTL
                });
            }
            return game;
        } catch (error) {
            console.error(`[CacheService] Error fetching game ${idStr}:`, error);
            return null;
        }
    }

    /**
     * Get all active games (cached)
     */
    async getActiveGames() {
        const now = Date.now();
        const cacheKey = "active_games_list";
        const cached = this.gameCache.get(cacheKey);

        if (cached && now < cached.expiresAt) {
            return cached.data;
        }

        try {
            const games = await Game.find({ isActive: true }).lean();
            this.gameCache.set(cacheKey, {
                data: games,
                expiresAt: now + this.TTL
            });
            return games;
        } catch (error) {
            console.error("[CacheService] Error fetching active games:", error);
            return [];
        }
    }

    /**
     * Clear specific game from cache
     */
    invalidateGame(gameId) {
        if (gameId) {
            this.gameCache.delete(gameId.toString());
            this.gameCache.delete("active_games_list"); // Reset list too
        }
    }

    /**
     * Clear entire cache
     */
    flushAll() {
        this.gameCache.clear();
    }
}

export default new CacheService();
