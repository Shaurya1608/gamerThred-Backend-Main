import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    action: String,
    ip: String,
    userAgent: String,
    meta: Object,
  },
  { timestamps: true }
);

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
