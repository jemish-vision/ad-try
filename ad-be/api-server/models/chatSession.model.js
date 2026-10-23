const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    from: { type: String, default: "user" },
    sender: { type: String, default: "user" },
    text: { type: String, default: "" },
    time: { type: Number, default: () => Date.now() },
    isReport: { type: Boolean, default: false },
    report: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, default: null }
  },
  { _id: false }
);

const chatSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true
    },
    profileId: {
      type: String,
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      required: true,
      index: true
    },
    title: {
      type: String,
      default: "New Chat",
      trim: true
    },
    messages: [chatMessageSchema],
    reportContext: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    createdAt: {
      type: Number,
      default: () => Date.now()
    },
    updatedAt: {
      type: Number,
      default: () => Date.now()
    }
  },
  {
    timestamps: true
  }
);

// Performance compound indexes
chatSessionSchema.index({ userId: 1, profileId: 1, updatedAt: -1 });
chatSessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.models.chatSession || mongoose.model("chatSession", chatSessionSchema);
