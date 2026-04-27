import mongoose from "mongoose";

const gameSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,

    categoryId: String,
    categoryName: String,

    image: String,
    previewUrl: String, 
    gameUrl: String,
    integrationType: { type: String, enum: ["local", "remote"], default: "local" },

    missionCost: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 1 },
    gameKey: {
      type: String,
      required: true,
      unique: true, // example: "highway-rush"
    },

    objectives: { type: Array, default: [] },

    totalPlays: { type: Number, default: 0 },
    funModePlays: { type: Number, default: 0 },
    missionModePlays: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },

    // 🔥 THIS ALREADY EXISTS
    isFeatured: { type: Boolean, default: false },

    // 🆕 ADD THIS FOR HOME PAGE
    showOnHome: { type: Boolean, default: false },
    homeOrder: { type: Number, default: 0 },

    createdBy: String,
    
    // 🛡️ ANTI-CHEAT FIELDS
    maxPossibleScore: { type: Number, default: 0 }, // 0 means no limit
    maxPointsPerSecond: { type: Number, default: 0 }, // 0 means no limit
    minPlayTimeSeconds: { type: Number, default: 0 }, // Minimum time to finish a game session legitimately

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      index: true,
    },
  },
  { timestamps: true },
);

// 📈 PERFORMANCE INDEXES
gameSchema.index({ isActive: 1, isFeatured: 1 }); // For featured games query
gameSchema.index({ isActive: 1, showOnHome: 1, homeOrder: 1 }); // For home page query
gameSchema.index({ categoryId: 1, isActive: 1 }); // For category filtering


export const Game = mongoose.model("Game", gameSchema);
