const mongoose = require("mongoose");
const keywordSearchHistorySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    search: {
      type: String,
      trim: true,
    },
    currentDate: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// --- Performance Indexing ---
keywordSearchHistorySchema.index({ currentDate: 1 });

// TTL index for 396-day data retention
keywordSearchHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model(
  "keywordSearchHistory",
  keywordSearchHistorySchema
);
