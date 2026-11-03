const mongoose = require("mongoose");
const ruleRunHistorySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    ruleSchema: {
      type: String,
      trim: true,
    },
    ruleDate: {
      type: String
    },
    ruleTime: {
      type: String
    },
    isRun: { type: Boolean, default: false },
    slotState: { type: String, enum: ["RUNNING", "COMPLETED", "RECOVERY_REQUIRED"] },
    slotOwnerToken: { type: String },
    slotClaimedAt: { type: Date },
    slotHeartbeatAt: { type: Date },
    slotLeaseExpiresAt: { type: Date },
    slotCompletedAt: { type: Date },
    slotFailedAt: { type: Date },
    slotFailureReason: { type: String },
    slotJobId: { type: String }
  },
  { timestamps: true }
);

// --- Performance Indexing ---
ruleRunHistorySchema.index({ configId: 1, profileId: 1, ruleDate: 1, ruleSchema: 1, isRun: 1 });
ruleRunHistorySchema.index({ configId: 1, profileId: 1, ruleId: 1, ruleSchema: 1, ruleDate: 1, ruleTime: 1 }, { unique: true });

// TTL index for 396-day data retention
ruleRunHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("ruleRunHistories", ruleRunHistorySchema);
