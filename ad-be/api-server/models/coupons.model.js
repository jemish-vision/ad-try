const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },

    couponId: { type: String, index: true },
    merchantId: String,
    marketplaceId: String,

    name: String,
    websiteMessage: String,

    currencyCode: String,

    discountType: String, // PERCENT_OFF_LIST_PRICE, FIXED_AMOUNT_OFF_LIST_PRICE
    discountAmount: Number,

    startDateTime: Date,
    endDateTime: Date,

    budget: Number,
    budgetSpent: Number,
    budgetRemaining: Number,

    clips: Number,
    redemptions: Number,
    sales: Number,

    asins: [String],

    status: {
      type: String,
      enum: [
        "RUNNING",
        "EXPIRING_SOON",
        "EXPIRED",
        "UPCOMING",
        "CANCELLED"
      ]
    },

    performanceTag: {
      type: String,
      enum: [
        "PROFITABLE",
        "LOSS_MAKING",
        "BREAKEVEN",
        "NO_DATA",
        "OPTIMIZATION_NEEDED"
      ],
      default: "NO_DATA"
    },

    performanceMetrics: {
      revenue: { type: Number, default: 0 },
      couponCost: { type: Number, default: 0 },
      profit: { type: Number, default: 0 },
      roi: { type: Number, default: 0 },
      margin: { type: Number, default: 0 }
    }

  },
  { timestamps: true }
);

module.exports = new mongoose.model("coupon", couponSchema);
