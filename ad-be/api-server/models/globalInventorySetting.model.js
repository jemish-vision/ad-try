const mongoose = require("mongoose");

const globalInventorySettingSchema = new mongoose.Schema(
  {
    profileId: {
      type: Number,
      required: true,
      index: true,
    },

    bufferDays: {
      type: Number,
      default: 7,
      min: 0,
    },

    transitDays: {
      type: Number,
      default: 14,
      min: 0,
    },

    coverageDays: {
      type: Number,
      default: 30,
      min: 0,
    },

    leadTimeDays: {
      type: Number,
      default: 0,
      min: 0,
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

module.exports = mongoose.model(
  "globalInventorySetting",
  globalInventorySettingSchema
);