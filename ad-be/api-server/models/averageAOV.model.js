const mongoose = require("mongoose");
const averageAOVSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    campaignName: {
      type: String,
      trim: true,
    },
    value: {
      type: Number,
      trim: true,
    },
    COGS: {
      type: Number,
      trim: true,
    },
  },
  { timestamps: true }
);

// --- Performance Indexing ---
averageAOVSchema.index({profileId:1,campaignName:1});

module.exports = new mongoose.model("averageAOV", averageAOVSchema);
