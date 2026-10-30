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

// Report type IDs are reused across categories (for example, spCampaigns for
// campaigns, placements and ad groups), so reportName belongs in this identity.
reportsSchema.index(
  {
    configId: 1,
    profileId: 1,
    reportName: 1,
    reportTypeId: 1,
    startDate: 1,
    endDate: 1,
  },
  { unique: true, name: "uniq_report_request_by_name" }
);

// 2. Fast report status polling (Amazon report flow)
reportsSchema.index({
  configId: 1,
  profileId: 1,
  status: 1,
  createdAt: -1,
});

// 3. Report history listing (latest first)
reportsSchema.index({
  configId: 1,
  profileId: 1,
  createdAt: -1,
});


// --- Performance Indexing ---
reportsSchema.index({ reportTypeId: 1, reportName: 1, status: 1 });
reportsSchema.index({ profileId: 1, configId: 1, startDate: 1, endDate: 1, reportTypeId: 1, status: 1 });
reportsSchema.index({ profileId: 1, configId: 1, reportTypeId: 1, status: 1 });
reportsSchema.index({ profileId: 1, configId: 1, startDate: 1, endDate: 1, adProduct: 1, reportTypeId: 1, status: 1 });
reportsSchema.index({ startDate: 1, endDate: 1, reportTypeId: 1, reportName: 1, status: 1 });
reportsSchema.index({ cronHistoryId: 1 }, { name: "cronHistoryId_1" })

// TTL index for 396-day data retention
reportsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("reports", reportsSchema);
