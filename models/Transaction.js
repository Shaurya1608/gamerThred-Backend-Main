// models/Transaction.js
import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    type: {
      type: String,
      enum: ["MISSION_REWARD", "ADMIN_ADJUST", "PURCHASE", "MEMBERSHIP", "STREAK_BONUS", "STREAK_REWARD", "REFERRAL_BONUS", "EXCHANGE", "DAILY_REWARD", "AD_REWARD", "BOOST_RENEWAL", "MYSTERY_BOX"],
      required: true,
    },

    amount: Number,
    currency: {
      type: String,
      enum: ["GTC", "GEMS", "INR", "TICKETS"],
    },

    source: String, // gameId / missionId
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true, // Only for rewards/logic that requires idempotency
    },
  },
  { timestamps: true }
);

// 📈 PERFORMANCE INDEXES
transactionSchema.index({ userId: 1, createdAt: -1 }); // Fast transaction history sorting
transactionSchema.index({ type: 1 });
transactionSchema.index({ source: 1 }, { unique: true, partialFilterExpression: { source: { $exists: true, $ne: null } } });

export const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
