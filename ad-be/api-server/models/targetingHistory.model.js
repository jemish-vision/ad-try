const mongoose = require("mongoose");

const targetingHistorySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    targetId: {
      type: String,
      trim: true,
      index: true,
    },
    campaignId: {
      type: String,
      trim: true,
      index: true,
    },
    adGroupId: {
      type: String,
      trim: true,
    },
    advertiser_id: {
      type: String,
      trim: true,
    },
    marketplace_id: {
      type: String,
      trim: true,
    },
    dataset_id: {
      type: String,
      trim: true,
    },
    ad_product: {
      type: String,
      trim: true,
    },
    target_type: {
      type: String,
      trim: true,
    },
    match_type: {
      type: String,
      trim: true,
    },
    targeting: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    bid: {
      type: Number,
      default: 0,
    },
    oldBid: {
      type: Number,
      default: null,
    },
    currencyCode: {
      type: String,
      trim: true,
    },
    last_updated_date_time: {
      type: String,
      trim: true,
    },
    creation_date_time: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      default: "Amazon Marketing Stream",
    },
  },
  { strict: false, timestamps: true }
);

targetingHistorySchema.index({ configId: 1, profileId: 1, targetId: 1, createdAt: -1 });
targetingHistorySchema.index({ targetId: 1, last_updated_date_time: -1 });
targetingHistorySchema.index({ campaignId: 1, targetId: 1 });

module.exports = mongoose.model("targetingHistory", targetingHistorySchema);
