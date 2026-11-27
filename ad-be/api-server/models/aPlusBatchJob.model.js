const mongoose = require("mongoose");

const aPlusBatchJobSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: true,
      index: true,
    },
    profileId: {
      type: Number,
      required: true,
      index: true,
    },
    marketplaceId: {
      type: String,
      required: true,
      trim: true,
    },
    asin: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["basic", "premium"],
      default: "basic",
    },
    batchJobName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    contentReferenceKey: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    imageModules: {
      type: Array,
      default: [],
    },
    productData: {
      type: Object,
      default: {},
    },
    generatedImages: {
      type: Array,
      default: [],
    },
    error: {
      type: String,
      default: null,
    },
    // Whose Gemini key submitted the batch: the platform's, or the organization's own (PERSONAL).
    // The status checks must use the same key; own-key jobs are never charged.
    keySource: { type: String, enum: ["PLATFORM", "PERSONAL"], default: "PLATFORM" },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", default: null },
    // AI credits held for this job's images; charged when the images arrive, returned if the job fails
    aiCreditHold: {
      type: Object,
      default: null,
    },
  },
  { timestamps: true }
);

aPlusBatchJobSchema.index({ configId: 1, profileId: 1, status: 1 });

module.exports = mongoose.model("aPlusBatchJob", aPlusBatchJobSchema);
