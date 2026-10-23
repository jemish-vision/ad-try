const mongoose = require("mongoose");
const cronJobSchema = new mongoose.Schema(
  {
    cronName: {
      type: String,
      trim: true,
    },
    cronDescription: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    frequency: {
      type: String,
      trim: true
    },
    dates: {
      type: [Number],
      trim: true
    },
    days: {
      type: [String],
      trim: true
    },
    times: {
      type: [String],
      trim: true
    },
    interval: {
      type: Number,
      trim: true
    },
    hours: {
      type: [Number],
      trim: true
    },
    minutes: {
      type: Number,
      trim: true
    },
    cronExpression: {
      type: String,
      trim: true
    },
  },
  { timestamps: true }
);

// --- Performance Indexing ---
cronJobSchema.index({cronName:1,isActive:1});
cronJobSchema.index({isActive:1});

module.exports = new mongoose.model("cronJob", cronJobSchema);
