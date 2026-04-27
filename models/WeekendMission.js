import mongoose from "mongoose";

const weekendMissionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    image: {
      type: String, // URL/Path to image
      default: "",
    },
    targetMissions: {
      type: Number,
      required: true,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    rewardConfig: {
      baseGems: { type: Number, default: 10 },
      perMissionGems: { type: Number, default: 1 },
      capGems: { type: Number, default: 30 },
    },
    status: {
      type: String,
      enum: ["pending", "active", "ended", "rewarded"],
      default: "pending",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }
  },
  { timestamps: true }
);

// 📈 PERFORMANCE INDEXES
weekendMissionSchema.index({ status: 1, startsAt: 1, expiresAt: 1 });

export const WeekendMission = mongoose.model("WeekendMission", weekendMissionSchema);
