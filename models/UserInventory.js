import mongoose from "mongoose";

const userInventorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// CRITICAL INDEX: Prevent duplicate rows for same user+item
userInventorySchema.index({ userId: 1, itemId: 1 }, { unique: true });

export const UserInventory = mongoose.model("UserInventory", userInventorySchema);
