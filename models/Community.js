import mongoose from "mongoose";

const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: "",
    },
    icon: {
      type: String,
      default: null,
    },
    directiveMessage: {
      type: String,
      default: "",
    },
    showDirective: {
      type: Boolean,
      default: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    bannedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    type: {
        type: String,
        enum: ["public", "group"],
        default: "public"
    },
    privacy: {
        type: String,
        enum: ["open", "private"],
        default: "open"
    },
    isLocked: {
        type: Boolean,
        default: false
    },
    pendingRequests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true
        },
        requestedAt: {
          type: Date,
          default: Date.now
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending"
        }
      }
    ]
  },
  { timestamps: true }
);

// 📈 PERFORMANCE INDEXES
communitySchema.index({ type: 1, privacy: 1 }); // Community discovery filtering
communitySchema.index({ owner: 1 });
communitySchema.index({ members: 1 }); // Faster member lookup

export const Community = mongoose.model("Community", communitySchema);
