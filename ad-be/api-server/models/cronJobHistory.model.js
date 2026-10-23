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
    }
  },
  { timestamps: true }
);

// 1. Prevent duplicate cron execution per day (MOST IMPORTANT)
cronJobHistorySchema.index(
  {
    configId: 1,
    profileId: 1,
    cronName: 1,
    historyDate: 1,
  },
  { unique: true }
);

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


// --- Performance Indexing ---
cronJobHistorySchema.index({ configId: 1, profileId: 1, cronName: 1, status: 1, historyDate: 1 });

// TTL index for 396-day data retention
cronJobHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("cronJobHistory", cronJobHistorySchema);
