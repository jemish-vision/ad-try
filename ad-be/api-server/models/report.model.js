const mongoose = require("mongoose");
const reportsSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    reportName: {
      type: String,
      trim: true,
    },
    adProduct: {
      type: String,
      trim: true,
    },
    reportTypeId: {
      type: String,
      trim: true,
    },
    reportId: {
      type: String,
      trim: true,
    },
    startDate: {
      type: String,
      trim: true,
    },
    endDate: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    importRunId: { type: String },
    verifiedRows: { type: Number },
    errorMessage: { type: String },
    failedAt: { type: Date },
    completedAt: { type: Date },
    cronHistoryId: { type: mongoose.Schema.Types.ObjectId, ref: "cronJobHistory" },
  },
  { timestamps: true }
);

// 1. Fast report status polling (Amazon report flow)
reportsSchema.index({
  configId: 1,
  profileId: 1,
  status: 1,
  createdAt: -1,
});

// 2. Report history listing (latest first)
reportsSchema.index({
  configId: 1,
  profileId: 1,
  createdAt: -1,
});

// --- Performance & Lifecycle Indexing ---
// Date-range queries for existing completed/pending reports
reportsSchema.index({ profileId: 1, configId: 1, startDate: 1, endDate: 1, reportTypeId: 1, status: 1 });

// Recent report status queries without date constraints
reportsSchema.index({ profileId: 1, configId: 1, reportTypeId: 1, status: 1 });

// Cron job execution link & history finalization (REQUIRED - DO NOT REMOVE)
reportsSchema.index({ cronHistoryId: 1 }, { name: "cronHistoryId_1" });

// TTL index for 396-day data retention
reportsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("reports", reportsSchema);
