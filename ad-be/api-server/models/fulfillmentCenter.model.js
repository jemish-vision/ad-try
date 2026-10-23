const mongoose = require("mongoose");

const fulfillmentCenterSchema = new mongoose.Schema(
  {
    fcCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    fcName: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      index: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      index: true,
      default: "",
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "IN",
      index: true,
    },
    pincode: {
      type: String,
      trim: true,
      default: "",
    },
    region: {
      type: String, // "North", "South", "East", "West", "Central", etc.
      trim: true,
      default: "",
    },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    gstin: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      enum: ["REPORT_GST", "STATIC_REGISTRY", "USER_OVERRIDE", "AUTO_DETECTED"],
      default: "STATIC_REGISTRY",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

fulfillmentCenterSchema.index({ fcCode: 1, countryCode: 1 }, { unique: true });
fulfillmentCenterSchema.index({ state: 1, city: 1 });

module.exports = mongoose.model("fulfillmentCenter", fulfillmentCenterSchema);
