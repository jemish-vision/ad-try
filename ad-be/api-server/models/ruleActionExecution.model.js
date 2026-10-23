const mongoose = require("mongoose");

const ruleActionExecutionSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: true,
      index: true,
    },
    profileId: {
      type: Number,
      required: true,
      index: true,
    },
    ruleFamily: {
      type: String,
      required: true,
      enum: ["budget-rules", "targeting-rules", "placement-rules", "dayparting-rules"],
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    scheduledSlot: {
      type: String, // e.g. "20261009T0530Z"
      required: true,
    },
    amazonEntityType: {
      type: String, // e.g. "campaign", "adGroup", "keyword", "target"
      required: true,
    },
    amazonEntityId: {
      type: String, // stringified ID to support arbitrary ID lengths/types
      required: true,
    },
    actionType: {
      type: String, // e.g. "BID_UPDATE", "BUDGET_UPDATE", "STATUS_PAUSE", "STATUS_ENABLE"
      required: true,
    },
    state: {
      type: String,
      enum: ["CLAIMED", "APPLIED", "FAILED"],
      required: true,
      default: "CLAIMED",
      index: true,
    },
    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    desiredValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true, // Absolute frozen target to prevent compounding
    },
    payloadHash: {
      type: String,
      default: null,
    },
    requestPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    jobId: {
      type: String,
      required: true,
    },
    owner: {
      type: String, // Worker lease / host token
      default: null,
    },
    claimExpiresAt: {
      type: Date,
      index: true,
    },
    amazonRequestId: {
      type: String,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    appliedAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    isDryRun: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// --- Compound Unique Index for Action-Level Idempotency ---
ruleActionExecutionSchema.index(
  {
    configId: 1,
    profileId: 1,
    ruleFamily: 1,
    ruleId: 1,
    scheduledSlot: 1,
    amazonEntityType: 1,
    amazonEntityId: 1,
    actionType: 1,
  },
  {
    unique: true,
    name: "idx_unique_rule_action_identity",
  }
);

// Query indexes for recovery and reclamation
ruleActionExecutionSchema.index({ state: 1, claimExpiresAt: 1 });

// TTL retention index (e.g. 180 days)
ruleActionExecutionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 });

module.exports = mongoose.model("ruleActionExecution", ruleActionExecutionSchema);
