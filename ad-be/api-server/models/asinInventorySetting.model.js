const mongoose = require("mongoose");

const asinInventorySettingSchema = new mongoose.Schema(
  {
    profileId: {
      type: Number,
      required: true,
      index: true,
    },

    asin: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    sku: {
      type: String,
      trim: true,
      index: true,
    },

    bufferDays: {
      type: Number,
      default: null,
    },

    transitDays: {
      type: Number,
      default: null,
    },

    coverageDays: {
      type: Number,
      default: null,
    },

    leadTimeDays: {
      type: Number,
      default: null,
    },

    alertThreshold: {
      type: Number,
      default: null,
    },

    isAlertActive: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate ASIN config per profile
asinInventorySettingSchema.index(
  {
    profileId: 1,
    asin: 1,
  },
  {
    unique: true,
  }
);


// --- Performance Indexing ---
asinInventorySettingSchema.index({profileId:1,asin:1,sku:1});
asinInventorySettingSchema.index({fulfillmentType:1});

module.exports = mongoose.model(
  "asinInventorySetting",
  asinInventorySettingSchema
);