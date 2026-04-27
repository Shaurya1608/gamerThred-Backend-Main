import mongoose from "mongoose";

const seasonSchema = new mongoose.Schema({
    number: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    themeColor: { type: String, default: "#EF4444" } // Default red
}, { timestamps: true });

export const Season = mongoose.model("Season", seasonSchema);
