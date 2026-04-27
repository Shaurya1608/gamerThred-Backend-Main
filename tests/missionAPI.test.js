import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { completeMission } from "../controllers/missionController.js";
import { MissionSession } from "../models/MissionSession.js";
import { rewardQueue } from "../utils/rewardQueue.js";
import { validateScore, validateSessionTiming } from "../utils/securityUtil.js";

// Mock dependencies
vi.mock("../models/MissionSession.js");
vi.mock("../utils/rewardQueue.js");
vi.mock("../utils/securityUtil.js");
vi.mock("../models/UserDailyQuest.js");
vi.mock("../utils/progressionUtil.js");

const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, res, next) => {
  req.user = { _id: "user123" };
  next();
});

app.post("/api/missions/complete", completeMission);

describe("Mission API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail if session is not found", async () => {
    MissionSession.findById.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/missions/complete")
      .send({ sessionId: "invalid", score: 100 });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Session not found");
  });

  it("should fail if anti-cheat validation fails", async () => {
    MissionSession.findById.mockResolvedValue({ 
      _id: "session123", 
      userId: "user123",
      gameId: "game123",
      status: "active"
    });
    
    validateScore.mockResolvedValue({ isValid: false, reason: "Impossible score" });

    const res = await request(app)
      .post("/api/missions/complete")
      .send({ sessionId: "session123", score: 999999 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Anti-cheat");
  });

  it("should add to reward queue on success", async () => {
    const mockSession = {
      _id: "session123",
      userId: "user123",
      gameId: "game123",
      status: "active",
      minScore: 50,
      rewardGtc: 10,
      rewardXp: 50,
      expiresAt: new Date(Date.now() + 100000),
      attemptsUsed: 0,
      maxAttempts: 3,
      save: vi.fn().mockResolvedValue(true)
    };

    MissionSession.findById.mockResolvedValue(mockSession);
    validateScore.mockResolvedValue({ isValid: true });
    validateSessionTiming.mockResolvedValue({ isValid: true });

    const res = await request(app)
      .post("/api/missions/complete")
      .send({ sessionId: "session123", score: 100 });

    expect(res.status).toBe(200);
    expect(rewardQueue.add).toHaveBeenCalledWith("process-reward", expect.objectContaining({
      userId: "user123",
      gtcReward: 10,
      xpReward: 50
    }));
    expect(mockSession.status).toBe("completed");
  });
});
