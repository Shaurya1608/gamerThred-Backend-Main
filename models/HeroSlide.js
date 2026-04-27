import mongoose from "mongoose";

const heroSlideSchema = new mongoose.Schema(
  {
    titleTop: { type: String, required: true },
    titleBottom: { type: String, required: true },
    description: { type: String, required: true },
    cta: { type: String, default: "Explore Now" },
    badge: { type: String, default: "" },
    participants: { type: String, default: "0" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    image: { type: String, default: "" }, 
    height: { type: String, default: "400px" },
    width: { type: String, default: "100%" },
  },
  { timestamps: true }
);

export const HeroSlide = mongoose.model("HeroSlide", heroSlideSchema);
