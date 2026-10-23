const mongoose = require("mongoose");

const fulfillmentCenterMasterSchema = new mongoose.Schema(
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
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      uppercase: true,
      default: "IN",
    },
    postalCode: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      trim: true,
      default: "AMAZON_DIRECTORY",
    },
    verifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "fulfillmentcentermasters",
  }
);

module.exports = mongoose.model("fulfillmentcentermaster", fulfillmentCenterMasterSchema);
