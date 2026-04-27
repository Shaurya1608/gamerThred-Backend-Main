// server/models/RewardOrder.js
import mongoose from "mongoose";

const rewardOrderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reward: { type: mongoose.Schema.Types.ObjectId, ref: "Reward" },

    priceDiamonds: Number,
    quantity: { type: Number, default: 1 },
    paymentMethod: { type: String, enum: ["Diamonds", "Gems", "Loyalty Credits"], default: "Loyalty Credits" },
    deliveryStatus: {
      type: String,
      enum: ["Pending", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Rejected"],
      default: "Pending",
    },
    refunded: { type: Boolean, default: false },
    cancellationRequested: { type: Boolean, default: false },
    cancellationStatus: { 
      type: String, 
      enum: ["None", "Pending", "Approved", "Rejected"], 
      default: "None" 
    },
    shippingDetails: {
        name: String,
        address: Object,
        phone: String
    },
    status: {
      type: String,
      enum: ["completed", "failed"],
      default: "completed",
    },
  },
  { timestamps: true }
);

// 📈 PERFORMANCE INDEXES
rewardOrderSchema.index({ user: 1, createdAt: -1 }); // Fast history retrieval
rewardOrderSchema.index({ status: 1 });
rewardOrderSchema.index({ deliveryStatus: 1 }); // For admin dashboard filtering

export const RewardOrder = mongoose.model("RewardOrder", rewardOrderSchema);
