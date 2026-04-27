import { describe, it, expect } from "vitest";
import { calculateTier, calculateEloChange, TIERS } from "../utils/tierUtil.js";

describe("tierUtil", () => {
    describe("calculateTier", () => {
        it("should return BRONZE for ELO < 1200", () => {
            expect(calculateTier(0)).toBe("BRONZE");
            expect(calculateTier(1199)).toBe("BRONZE");
        });

        it("should return SILVER for ELO 1200-1499", () => {
            expect(calculateTier(1200)).toBe("SILVER");
            expect(calculateTier(1499)).toBe("SILVER");
        });

        it("should return GOLD for ELO 1500-1799", () => {
            expect(calculateTier(1500)).toBe("GOLD");
            expect(calculateTier(1799)).toBe("GOLD");
        });

        it("should return PLATINUM for ELO 1800-2099", () => {
            expect(calculateTier(1800)).toBe("PLATINUM");
            expect(calculateTier(2099)).toBe("PLATINUM");
        });

        it("should return DIAMOND for ELO 2100-2499", () => {
            expect(calculateTier(2100)).toBe("DIAMOND");
            expect(calculateTier(2499)).toBe("DIAMOND");
        });

        it("should return ELITE for ELO >= 2500", () => {
            expect(calculateTier(2500)).toBe("ELITE");
            expect(calculateTier(5000)).toBe("ELITE");
        });
    });

    describe("calculateEloChange", () => {
        it("should return 15 for a win if calculation is lower than minimum", () => {
            const playerElo = 1000;
            const opponentElo = 500; // Stronger player winning against weaker player
            const change = calculateEloChange(playerElo, opponentElo, true);
            expect(change).toBe(15);
        });

        it("should return -15 for a loss if calculation is higher than minimum", () => {
            const playerElo = 500;
            const opponentElo = 1000; // Weaker player losing to stronger player
            const change = calculateEloChange(playerElo, opponentElo, false);
            expect(change).toBe(-15);
        });

        it("should return a larger gain for winning against a stronger opponent", () => {
            const playerElo = 1000;
            const opponentElo = 1400;
            const change = calculateEloChange(playerElo, opponentElo, true);
            expect(change).toBeGreaterThan(15);
        });

        it("should return a larger loss for losing to a weaker opponent", () => {
            const playerElo = 1400;
            const opponentElo = 1000;
            const change = calculateEloChange(playerElo, opponentElo, false);
            expect(change).toBeLessThan(-15);
        });
    });
});
