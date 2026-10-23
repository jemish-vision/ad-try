const mongoose = require("mongoose");

const asinAPlusContentSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
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
      index: true,
    },

    asin: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    locale: {
      type: String,
      trim: true,
      default: "en_IN",
    },

    contentType: {
      type: String,
      trim: true,
      default: "EBC",
    },

    contentSubType: {
      type: String,
      trim: true,
      default: "",
    },

    contentReferenceKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    contentName: {
      type: String,
      trim: true,
    },

    contentStatus: {
      type: String,
      trim: true,
      // enum: [
      //   "DRAFT",
      //   "SUBMITTED",
      //   "APPROVED",
      //   "REJECTED",
      //   "ARCHIVED",
      // ],
    },

    badgeSet: {
      type: [String],
      default: [],
    },

    updateTime: {
      type: Date,
    },

    rawData: {
      type: Object,
      default: null,
    },

    lastUpdatedAt: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

asinAPlusContentSchema.index({
  configId: 1,
  profileId: 1,
  marketplaceId: 1,
  asin: 1,
  locale: 1,
  contentReferenceKey: 1,
});

asinAPlusContentSchema.index(
  { contentReferenceKey: 1 },
  { unique: true }
);

module.exports = mongoose.model("asinAPlusContent", asinAPlusContentSchema);