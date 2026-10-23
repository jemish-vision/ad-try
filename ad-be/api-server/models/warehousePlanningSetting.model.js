const mongoose = require("mongoose");

const warehousePlanningSettingSchema = new mongoose.Schema(
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
      required: true,
      trim: true,
      index: true,
    },
    warehouseId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    warehouseName: {
      type: String,
      trim: true,
      default: "",
    },
    alertThreshold: {
      type: Number,
      default: null,
      min: 0,
    },
    coverageDays: {
      type: Number,
      default: null,
      min: 0,
    },
    transitDays: {
      type: Number,
      default: null,
      min: 0,
    },
    bufferDays: {
      type: Number,
      default: null,
      min: 0,
    },
    isAlertActive: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastNotifiedAt: {
      type: Date,
      default: null,
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

// Unique compound index: One planning configuration per profile + asin + sku + warehouse
warehousePlanningSettingSchema.index(
  {
    profileId: 1,
    asin: 1,
    sku: 1,
    warehouseId: 1,
  },
  {
    unique: true,
  }
);

warehousePlanningSettingSchema.index({ profileId: 1, warehouseId: 1 });

module.exports = mongoose.model(
  "warehousePlanningSetting",
  warehousePlanningSettingSchema
);
