import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateScore, validateSessionTiming } from "../utils/securityUtil.js";
import { Game } from "../models/Game.js";

vi.mock("../models/Game.js");

describe("securityUtil", () => {
  describe("validateScore", () => {
    it("should return valid for a normal score", async () => {
      Game.findById.mockResolvedValue({ maxPossibleScore: 1000 });
      const result = await validateScore(500, "game123");
      expect(result.isValid).toBe(true);
    });

    it("should return invalid if score exceeds maxPossibleScore", async () => {
      Game.findById.mockResolvedValue({ maxPossibleScore: 1000 });
      const result = await validateScore(1500, "game123");
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("exceeds maximum");
    });

    it("should return invalid for negative scores", async () => {
      Game.findById.mockResolvedValue({ maxPossibleScore: 1000 });
      const result = await validateScore(-10, "game123");
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("cannot be negative");
    });

    it("should return invalid if score is not a number", async () => {
      const result = await validateScore("cheat", "game123");
      expect(result.isValid).toBe(false);
    });
  });

  describe("validateSessionTiming", () => {
    it("should return valid if no minPlayTimeSeconds is set", async () => {
      Game.findById.mockResolvedValue({ minPlayTimeSeconds: 0 });
      const result = await validateSessionTiming(new Date(), "game123");
      expect(result.isValid).toBe(true);
    });

    it("should return invalid if session completed too fast", async () => {
      Game.findById.mockResolvedValue({ minPlayTimeSeconds: 60 });
      // Session started 10 seconds ago
      const startTime = new Date(Date.now() - 10000); 
      const result = await validateSessionTiming(startTime, "game123");
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("too quickly");
    });

    it("should return valid if session took long enough", async () => {
      Game.findById.mockResolvedValue({ minPlayTimeSeconds: 30 });
      // Session started 40 seconds ago
      const startTime = new Date(Date.now() - 40000); 
      const result = await validateSessionTiming(startTime, "game123");
      expect(result.isValid).toBe(true);
    });
  });
});
