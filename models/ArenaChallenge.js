import mongoose from "mongoose";

const arenaChallengeSchema = new mongoose.Schema(
  {
    challenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    opponent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },
    wager: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "completed", "expired"],
      default: "pending",
    },
    challengerScore: {
      type: Number,
      default: 0,
    },
    opponentScore: {
      type: Number,
      default: 0,
    },
    challengerFinished: {
      type: Boolean,
      default: false,
    },
    opponentFinished: {
      type: Boolean,
      default: false,
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    challengerStartedAt: {
      type: Date,
      default: null,
    },
    opponentStartedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// 📈 PERFORMANCE INDEXES
arenaChallengeSchema.index({ status: 1 });
arenaChallengeSchema.index({ challenger: 1, opponent: 1 }); // Fast match lookups
arenaChallengeSchema.index({ expiresAt: 1 }); // For automated expiration cleanup

export const ArenaChallenge = mongoose.model("ArenaChallenge", arenaChallengeSchema);
