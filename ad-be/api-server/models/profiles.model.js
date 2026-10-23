const mongoose = require("mongoose");
const profileSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    amazonUrl: {
      type: String,
      trim: true,
    },
    countryCode: {
      type: String,
      trim: true,
    },
    currencyCode: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    marketplaceStringId: {
      type: String,
      trim: true,
    },
    advertiserId: {
      type: String,
      trim: true
    },
    name: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },

    isFavorite: {
      type: Boolean,
      default: false,
    },
    isAdsSyncEnabled: {
      type: Boolean,
      default: false,
    },
    isSpSyncEnabled: {
      type: Boolean,
      default: false,
    }
  },

  { timestamps: true }
);
module.exports = new mongoose.model("profile", profileSchema);
