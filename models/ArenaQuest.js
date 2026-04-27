import mongoose from "mongoose";

const arenaQuestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String, // Format: YYYY-MM-DD
      required: true,
    },
    // Quest types: "win_matches", "play_matches", "wager_gtc"
    questType: {
      type: String,
      required: true,
      enum: ["win_matches", "play_matches", "wager_gtc"],
    },
    targetValue: {
      type: Number,
      required: true,
    },
    currentValue: {
      type: Number,
      default: 0,
    },
    rewardGtc: {
      type: Number,
      required: true,
    },
    rewardXp: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "completed", "claimed"],
      default: "active",
    },
  },
  { timestamps: true }
);

// Index to ensure a user doesn't get duplicate quest types on the same day
arenaQuestSchema.index({ userId: 1, date: 1, questType: 1 }, { unique: true });

export const ArenaQuest = mongoose.model("ArenaQuest", arenaQuestSchema);
