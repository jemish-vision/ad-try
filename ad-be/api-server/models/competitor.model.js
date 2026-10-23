const mongoose = require("mongoose");

const competitorSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    myAsin: {
      type: String,
      trim: true,
    },
    asin: {
      type: String,
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    classification: {
      type: String,
      trim: true,
    },
    classificationRanks: {
      type: mongoose.Schema.Types.Mixed,
    },
    price: {
      type: Number,
      trim: true,
    },
    itemForm: {
      type: String,
      trim: true,
    },
    lastUpdatedAt: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

competitorSchema.index({
  configId: 1,
  profileId: 1,
  asin: 1,
});

module.exports = new mongoose.model("competitor", competitorSchema);
