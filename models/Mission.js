import mongoose from "mongoose";

const missionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String, // URL from Cloudinary or local path
      default: "",
    },

    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
      index: true,
    },
    // gameKey: {
    //   type: String,
    //   required: true,
    // },

    minScore: {
      type: Number,
      required: true,
    },
    minTime: {
      type: Number,
      default: 0, // in seconds
    },

    rewardGtc: {
      type: Number,
      required: true,
    },
    entryFeeTickets: {
      type: Number,
      default: 1,
    },
    entryFeeGtc: { // DEPRECATED: Kept for backward compat script, but logic will use tickets
      type: Number,
      default: 0,
    },
    rewardXp: {
      type: Number,
      default: 50,
    },

    rewardLoyalty: {
      type: Number,
      default: 0,
    },
    
    maxAttempts: {
      type: Number,
      default: 5,
    },

    startsAt: {
      type: Date,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isTrending: {
      type: Boolean,
      default: false,
    },

    missionType: {
      type: String,
      enum: ["regular", "special"],
      default: "regular",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    // 🎲 DYNAMIC RULES (JSON string or Object)
    rules: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },

    category: {
      type: String,
      default: "general",
      trim: true,
    },
  },
  { timestamps: true },
);

// 📈 PERFORMANCE INDEXES
missionSchema.index({ isActive: 1, expiresAt: 1, startsAt: 1 }); // For finding active missions
missionSchema.index({ gameId: 1, isActive: 1 }); // For finding missions by game
missionSchema.index({ isTrending: 1, isActive: 1 }); // For trending missions


export const Mission = mongoose.model("Mission", missionSchema);
