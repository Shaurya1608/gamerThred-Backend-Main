import mongoose from "mongoose";

const rewardSchema = new mongoose.Schema({
  type: {
    type: String, // GTC, ITEM, etc
    enum: ["GTC", "ITEM", "BOOST", "COSMETIC", "TICKET", "PROTECTION", "JACKPOT", "BONUS"],
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // Amount (Number) or ItemCode (String) or Multiplier Object
    required: true
  },
  weight: {
    type: Number,
    required: true
  },
  isRare: {
    type: Boolean,
    default: false
  },
  isJackpot: {
    type: Boolean,
    default: false
  },
  name: String, // Display name
  image: String // Optional override
});

const mysteryBoxSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  cost: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: "GTC"
  },
  image: String,
  rewards: [rewardSchema],
  active: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
});

export const MysteryBox = mongoose.model("MysteryBox", mysteryBoxSchema);
