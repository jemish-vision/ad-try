const mongoose = require("mongoose");

const bidDataSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { strict: false, timestamps: true }
);

bidDataSchema.index({ configId: 1, profileId: 1 });
bidDataSchema.index({ configId: 1, profileId: 1, campaign_id: 1 });
bidDataSchema.index({ dataset_id: 1 });
bidDataSchema.index({ createdAt: 1 });

module.exports = mongoose.model("bidData", bidDataSchema);
