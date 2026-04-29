// models/missionSession.model.js
import mongoose from "mongoose";

const missionSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    missionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mission",
      required: true,
      index: true,
    },

    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },

    gameKey: {
      type: String,
      required: true,
    },

    attemptsUsed: {
      type: Number,
      default: 0,
    },
    rewardXp: {
      type: Number,
      required: true,
    },
    minScore: {
      type: Number,
      required: true,
    },
    minTime: {
      type: Number,
      default: 0,
    },

    maxAttempts: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "completed", "failed", "expired"],
      default: "active",
    },

    expiresAt: {
      type: Date,
      required: true,
    },
    
    lastAttemptStartedAt: {
      type: Date,
      default: Date.now
    },

    // Result saved only after GAME_OVER
    result: {
      score: Number,
      distance: Number,
    },

    rewardGtc: {
      type: Number,
      required: true,
    },
    rewardLoyalty: {
      type: Number,
      default: 0,
    },
    securitySecret: {
      type: String,
    },
  },
  { timestamps: true },
);

// 📈 PERFORMANCE INDEXES
missionSessionSchema.index({ status: 1 });
missionSessionSchema.index({ expiresAt: 1 }); // For scheduled cleanup jobs

// Prevent duplicate active sessions
missionSessionSchema.index(
  { userId: 1, missionId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);

export const MissionSession =
  mongoose.models.MissionSession ||
  mongoose.model("MissionSession", missionSessionSchema);
