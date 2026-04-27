import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },
    type: {
        type: String,
        enum: ["text", "image", "file"],
        default: "text",
    },
    metadata: {
        type: Object,
        default: {},
    }
  },
  { timestamps: true }
);

// 📈 PERFORMANCE INDEXES
messageSchema.index({ community: 1, createdAt: -1 }); // Fast chat history fetching

export const Message = mongoose.model("Message", messageSchema);
