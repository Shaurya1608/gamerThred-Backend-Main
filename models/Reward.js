// server/models/Reward.js
import mongoose from "mongoose";

const rewardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,

    priceDiamonds: { type: Number, required: true, default: 0 }, // cost to redeem with diamonds/gems
    stock: { type: Number, default: 0 },

    category: {
      type: String,
      enum: ["Daily", "Special", "Weekly"],
      required: true,
    },

    imageUrl: { type: String, required: true },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

// Optimize for high-volume reward fetching and filtering
rewardSchema.index({ isActive: 1, category: 1 });
rewardSchema.index({ title: "text" }); // Enable search if needed later

export const Reward = mongoose.model("Reward", rewardSchema);
