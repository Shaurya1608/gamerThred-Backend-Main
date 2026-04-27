import mongoose from "mongoose";

const seasonRewardSchema = new mongoose.Schema({
    level: { type: Number, required: true, unique: true },
    free: {
        diamonds: { type: Number, default: 0 },
        gtc: { type: Number, default: 0 },
        item: { type: String, default: "" } // Placeholder for future cosmetic items
    },
    elite: {
        diamonds: { type: Number, default: 0 },
        gtc: { type: Number, default: 0 },
        item: { type: String, default: "" }
    },
    isMilestone: { type: Boolean, default: false }
}, { timestamps: true });

export const SeasonReward = mongoose.model("SeasonReward", seasonRewardSchema);
