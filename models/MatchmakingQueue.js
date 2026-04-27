import mongoose from "mongoose";

const matchmakingQueueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },
    wager: {
      type: Number,
      default: 10,
    },
    isGlobal: {
      type: Boolean,
      default: false,
    },
    elo: {
      type: Number,
      required: true,
    },
    region: {
      type: String,
      default: "Global",
    },
    status: {
      type: String,
      enum: ["waiting", "processing"],
      default: "waiting",
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      expires: 300, // Auto-remove from queue after 5 minutes if no match found
    },
  },
  { timestamps: true }
);

// 🚀 PERFORMANCE INDEXES
matchmakingQueueSchema.index({ status: 1, joinedAt: 1 }); // Atomic batching lookup
matchmakingQueueSchema.index({ status: 1, wager: 1, elo: 1 }); // Partner search lookup

export const MatchmakingQueue = mongoose.model("MatchmakingQueue", matchmakingQueueSchema);
