import mongoose from "mongoose";

const gemPackageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  gemAmount: { type: Number, required: true },
  priceInr: { type: Number, required: true },
  showDiscount: { type: Boolean, default: false },
  discountTag: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
}, { timestamps: true });

export const GemPackage = mongoose.model("GemPackage", gemPackageSchema);
