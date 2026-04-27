import mongoose from "mongoose";

const inventoryLedgerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },
  change: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: ["purchase", "mission_reward", "mystery_box", "admin_gift", "usage", "trade", "expired", "streak_reward"]
  },
  referenceId: {
    type: String, // e.g., transactionId, missionId
    required: false
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const InventoryLedger = mongoose.model("InventoryLedger", inventoryLedgerSchema);
