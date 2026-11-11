const mongoose = require("mongoose");

const cronJobHistorySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    cronName: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    historyDate: {
      type: String,
      trim: true,
    },
    reportType: {
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
    recordsCount: {
      type: Number,
      default: 0,
    },
    durationMs: {
      type: Number,
    },
    error: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      trim: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// 1. Cron execution tracking index (supports multiple executions per day)
cronJobHistorySchema.index({
  configId: 1,
  profileId: 1,
  cronName: 1,
  historyDate: 1,
  createdAt: -1,
});

// Auto-drop legacy unique index if it exists in MongoDB
if (mongoose.connection) {
  const dropLegacyUniqueIndex = async () => {
    try {
      const col = mongoose.connection.collection("cronjobhistories");
      const indexes = await col.indexes();
      const uniqueIdx = indexes.find(
        (idx) => idx.name === "configId_1_profileId_1_cronName_1_historyDate_1" && idx.unique
      );
      if (uniqueIdx) {
        await col.dropIndex("configId_1_profileId_1_cronName_1_historyDate_1");
      }
    } catch (_) {}
  };
  if (mongoose.connection.readyState === 1) {
    dropLegacyUniqueIndex();
  } else {
    mongoose.connection.once("connected", dropLegacyUniqueIndex);
  }
}

// 2. Fast cron history listing (latest first)
cronJobHistorySchema.index({
  configId: 1,
  profileId: 1,
  historyDate: -1,
});

// 3. Cron-wise execution tracking
cronJobHistorySchema.index({
  configId: 1,
  cronName: 1,
  historyDate: -1,
});

// 4. Performance Indexing
cronJobHistorySchema.index({ configId: 1, profileId: 1, cronName: 1, status: 1, historyDate: 1 });

// TTL index for 396-day data retention
cronJobHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = mongoose.models.cronJobHistory || mongoose.model("cronJobHistory", cronJobHistorySchema);
