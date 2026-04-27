import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ["protection", "cosmetic", "booster", "box", "currency_pack"],
    required: true
  },
  description: String,
  image: String, // URL
  rarity: {
    type: String,
    enum: ["common", "rare", "epic", "legendary", "mythic"],
    default: "common"
  },
  stackable: {
    type: Boolean,
    default: true
  },
  maxStack: {
    type: Number,
    default: 999
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const Item = mongoose.model("Item", itemSchema);
