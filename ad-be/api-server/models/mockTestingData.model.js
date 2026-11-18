const mongoose = require("mongoose");

/**
 * Single unified schema table (`mock_testing_data`) for storing all dummy records
 * across all 11 modules for Mock User Testing Mode (`isMockUser`).
 */
const mockTestingDataSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null, // null = global default dummy records; populated = user-created records in mock mode
    },
    moduleType: {
      type: String,
      required: true,
      enum: [
        "CAMPAIGN",
        "TARGETING",
        "SEARCH_TERM",
        "PLACEMENT",
        "KEYWORD_ANALYSIS",
        "KEYWORD_TRACKER",
        "PURCHASE_ORDER",
        "PRODUCT_LIST",
        "COUPON",
        "DEAL",
        "INVENTORY",
        "DASHBOARD",
        "HISTORY",
        "BRAND_ANALYTICS",
        "BRAND_DETAILS",
      ],
    },
    subType: {
      type: String,
      default: "MAIN", // e.g., "MAIN", "AD_GROUP", "PRODUCT_AD", "SUGGESTION", "ORDER_REPORT", "AGING"
    },
    adType: {
      type: String,
      default: "SP", // "SP" | "SB" | "SD" | "ALL"
    },
    recordId: {
      type: String,
      required: true, // e.g., campaignId, targetId, orderId, asin, sku, couponId, dealId
    },
    parentId: {
      type: String,
      default: null, // e.g., campaignId for adGroup/target/placement/searchTerm
    },
    isDefault: {
      type: Boolean,
      default: true, // true for pre-seeded mock records, false for user-created mock records
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true, // Complete payload matching the module's response structure
    },
  },
  {
    timestamps: true,
  }
);

mockTestingDataSchema.index({ moduleType: 1, subType: 1, adType: 1, userId: 1 });
mockTestingDataSchema.index({ moduleType: 1, recordId: 1 });
mockTestingDataSchema.index({ moduleType: 1, parentId: 1 });

module.exports = mongoose.model("mock_testing_data", mockTestingDataSchema);
