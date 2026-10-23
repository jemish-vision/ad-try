const mongoose = require("mongoose");

const syncRunSchema = new mongoose.Schema(
  {
    task: {
      type: String,
      required: true,
      index: true,
      enum: [
        "campaign-listing",
        "adgroup-listing",
        "targeting-listing",
        "product-ads-listing",
        "campaign-report",
        "adgroup-report",
        "targeting-report",
        "product-ads-report",
        "placement-report",
        "search-term-report",
        "biweekly-report",
        "weekly-report",
        "report-batch-writer",
      ],
    },
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
    timeBlock: {
      type: String, // e.g. "20261009T05Z"
      required: true,
    },
    state: {
      type: String,
      enum: ["QUEUED", "RUNNING", "WAITING", "COMPLETED", "FAILED"],
      required: true,
      default: "QUEUED",
      index: true,
    },
    jobId: {
      type: String,
      required: true,
    },
    providerReportId: {
      type: String,
      default: null,
      index: true,
    },
    providerRequestId: {
      type: String,
      default: null,
    },
    sourceDateRange: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    importCursor: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    resultCounts: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    scheduledFor: {
      type: Date,
      required: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
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

// --- Compound Unique Index for Sync-Run Idempotency ---
syncRunSchema.index(
  {
    task: 1,
    configId: 1,
    profileId: 1,
    timeBlock: 1,
  },
  {
    unique: true,
    name: "idx_unique_sync_run_identity",
  }
);

// Query indexes
syncRunSchema.index({ task: 1, state: 1, scheduledFor: 1 });

// TTL retention index (180 days)
syncRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 });

module.exports = mongoose.model("syncRun", syncRunSchema);
