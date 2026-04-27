import mongoose from "mongoose";

const progressionConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    levels: [
      {
        minLevel: { type: Number, required: true },
        maxLevel: { type: Number, required: true },
        xpPerLevel: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

export const ProgressionConfig = mongoose.model("ProgressionConfig", progressionConfigSchema);
