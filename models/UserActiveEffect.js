import mongoose from "mongoose";

const userActiveEffectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  effectType: {
    type: String,
    enum: ["gtc_multiplier", "xp_multiplier", "rank_protection", "cosmetic_frame", "cosmetic_badge"],
    required: true
  },
  value: {
    type: Number, // e.g., 2 for 2x multiplier
    required: true
  },
  remainingUses: {
    type: Number,
    default: null // null means unlimited/time-based only
  },
  sourceItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item"
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-delete expired effects
userActiveEffectSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserActiveEffect = mongoose.model("UserActiveEffect", userActiveEffectSchema);
