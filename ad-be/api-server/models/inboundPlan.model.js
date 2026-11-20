const mongoose = require("mongoose");

const inboundPlanSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config"
    },

    profileId: {
      type: Number
    },

    // wf*** id
    inboundPlanId: {
      type: String
    },

    // sh*** id
    v2ShipmentId: {
      type: String
    },

    // FBA15xxx - old confirmation id
    shipmentConfirmationId: {
      type: String
    },

    amazonReferenceId: {
      type: String
    },

    planName: {
      type: String
    },

    shipmentName: {
      type: String
    },

    planStatus: {
      type: String
    },

    shipmentStatus: {
      type: String
    },

    marketplaceIds: [{ type: String }],

    planCreatedAt: {
      type: Date
    },

    planUpdatedAt: {
      type: Date
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

// 1. Unique identity and deduplication index (serves report stream upserts and inboundPlanId lookups)
inboundPlanSchema.index(
  { configId: 1, profileId: 1, inboundPlanId: 1, v2ShipmentId: 1 },
  { unique: true }
);

// 2. Primary chronological listing & range query index (serves plan listing and pagination)
inboundPlanSchema.index({
  configId: 1,
  profileId: 1,
  planCreatedAt: -1
});

// 3. Shipment confirmation lookup index (serves legacy FBA shipment confirmation lookups)
inboundPlanSchema.index({
  configId: 1,
  profileId: 1,
  shipmentConfirmationId: 1
});

module.exports = new mongoose.model("inboundPlan", inboundPlanSchema);