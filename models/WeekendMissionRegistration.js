import mongoose from "mongoose";

const weekendMissionRegistrationSchema = new mongoose.Schema(
  {
    missionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeekendMission",
      required: true,
      index: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
      index: true,
    },
    lockedMemberIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    finalTotal: {
      type: Number,
      default: 0,
    },
    userContributions: {
      type: Map,
      of: Number,
      default: {},
    },
    status: {
      type: String,
      enum: ["registered", "completed", "failed"],
      default: "registered",
    },
    claimedMemberIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

// 📈 PERFORMANCE INDEXES
weekendMissionRegistrationSchema.index({ missionId: 1, groupId: 1 }, { unique: true });
weekendMissionRegistrationSchema.index({ lockedMemberIds: 1 }); // For finding which group a user belongs to in an event

export const WeekendMissionRegistration = mongoose.model(
  "WeekendMissionRegistration",
  weekendMissionRegistrationSchema
);
