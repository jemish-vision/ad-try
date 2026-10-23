const mongoose = require("mongoose");

const inboundPlanSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      index: true
    },

    profileId: {
      type: Number,
      index: true
    },

    // wf*** id
    inboundPlanId: {
      type: String,
      index: true
    },

    // sh*** id
    v2ShipmentId: {
      type: String,
      index: true
    },

    // FBA15xxx - old confirmation id
    shipmentConfirmationId: {
      type: String,
      index: true
    },

    amazonReferenceId: {
      type: String,
      index: true
    },

    planName: {
      type: String
    },

    shipmentName: {
      type: String
    },

    planStatus: {
      type: String,
      index: true
    },

    shipmentStatus: {
      type: String,
      index: true
    },

    marketplaceIds: [{ type: String }],

    planCreatedAt: {
      type: Date,
      index: true
    },

    planUpdatedAt: {
      type: Date,
      index: true
    },

    sourceAddress: {
      name: String,
      companyName: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      stateOrProvinceCode: String,
      countryCode: String,
      postalCode: String,
      phoneNumber: String,
      email: String
    },

    destinationAddress: {
      name: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      stateOrProvinceCode: String,
      countryCode: String,
      postalCode: String,
      warehouseId: String
    },

    placementOptionIds: [{ type: String }],

    selectedTransportationOptionId: {
      type: String
    }
  },
  { timestamps: true }
);

inboundPlanSchema.index(
  { configId: 1, profileId: 1, inboundPlanId: 1, v2ShipmentId: 1 },
  { unique: true }
);

module.exports = new mongoose.model("inboundPlan", inboundPlanSchema);