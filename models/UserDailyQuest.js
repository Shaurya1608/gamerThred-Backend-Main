import mongoose from "mongoose";

const userDailyQuestSchema = new mongoose.Schema(
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
    },
    date: {
      type: String, // Format: YYYY-MM-DD
      required: true,
    },
    status: {
      type: String,
      enum: ["assigned", "completed", "failed"],
      default: "assigned",
    },
    rewardClaimed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index to ensure a user doesn't get the same mission twice on the same day
userDailyQuestSchema.index({ userId: 1, missionId: 1, date: 1 }, { unique: true });

export const UserDailyQuest = mongoose.model("UserDailyQuest", userDailyQuestSchema);
