import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateLevelInfo } from "../utils/progressionUtil.js";
import { ProgressionConfig } from "../models/ProgressionConfig.js";

vi.mock("../models/ProgressionConfig.js");

describe("progressionUtil", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("calculateLevelInfo", () => {
        it("should use fallback logic if config is missing", async () => {
            ProgressionConfig.findOne.mockResolvedValue(null);
            
            const info = await calculateLevelInfo(250); // Level 3 (0-99 L1, 100-199 L2, 200-299 L3)
            expect(info.level).toBe(3);
            expect(info.xpInCurrentLevel).toBe(50);
            expect(info.xpForNextLevel).toBe(100);
            expect(info.progress).toBe(0.5);
        });

        it("should correctly calculate level based on config", async () => {
            const mockConfig = {
                levels: [
                    { minLevel: 1, maxLevel: 5, xpPerLevel: 100 },
                    { minLevel: 6, maxLevel: 10, xpPerLevel: 200 }
                ]
            };
            ProgressionConfig.findOne.mockResolvedValue(mockConfig);

            // Level 1: 0-99 XP
            const info1 = await calculateLevelInfo(50);
            expect(info1.level).toBe(1);
            expect(info1.xpInCurrentLevel).toBe(50);
            expect(info1.xpForNextLevel).toBe(100);

            // Level 6: (5 * 100) = 500 XP to finish L5. 
            // 550 XP should be L6 with 50 XP in. XP for next level is 200.
            const info6 = await calculateLevelInfo(550);
            expect(info6.level).toBe(6);
            expect(info6.xpInCurrentLevel).toBe(50);
            expect(info6.xpForNextLevel).toBe(200);
            expect(info6.progress).toBe(25);
        });

        it("should handle surpassing all tiers by using the last tier's XP", async () => {
            const mockConfig = {
                levels: [
                    { minLevel: 1, maxLevel: 2, xpPerLevel: 100 }
                ]
            };
            ProgressionConfig.findOne.mockResolvedValue(mockConfig);

            // L1 (100) + L2 (100) = 200 to reach L3.
            // 250 XP should be L3 with 50 XP in.
            const info3 = await calculateLevelInfo(250);
            expect(info3.level).toBe(3);
            expect(info3.xpInCurrentLevel).toBe(50);
            expect(info3.xpForNextLevel).toBe(100);
        });
    });
});
