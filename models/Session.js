import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ip: { type: String, default: "Unknown" },
  userAgent: { type: String, default: "Unknown" },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, expires: '7d' } // Auto-delete after 7 days
});

// Update lastActivity on save
// Update lastActivity on save
sessionSchema.pre('save', async function() {
  if (this.isModified('lastActivity')) {
    this.lastActivity = new Date();
  }
});

export const Session = mongoose.model("Session", sessionSchema);
