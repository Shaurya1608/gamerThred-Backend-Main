import mongoose from "mongoose";

const subscriptionConfigSchema = new mongoose.Schema({
  tier: {
    type: String,
    required: true,
    enum: ["premium", "elite"],
    unique: true
  },
  priceInr: {
    type: Number,
    required: true,
    min: 0
  },
  missionLimit: {
    type: Number,
    required: true,
    min: 1,
    max: 100
  },
  xpMultiplier: {
    type: Number,
    required: true,
    min: 1.0,
    max: 10.0
  },
  benefits: [{
    type: String,
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  hasActiveBoost: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

export const SubscriptionConfig = mongoose.model("SubscriptionConfig", subscriptionConfigSchema);
