const mongoose = require("mongoose");
const cronJobSchedularSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    cronId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "cronJob",
    },
    cronName: {
      type: String,
      trim: true,
    },
    profileId: {
      type: Number,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    lastRun: {
      type: String,
      default: "",
    },
    nextRun: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// --- Performance Indexing ---
cronJobSchedularSchema.index({profileId:1,cronId:1});

module.exports = new mongoose.model(
  "cronJobSchedular",
  cronJobSchedularSchema
);
