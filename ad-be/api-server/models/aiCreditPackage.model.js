const mongoose = require("mongoose");

/**
 * An AI credit package organizations can buy (Super Admin manages them).
 * Price: `price` in `currency` by default; a pricing region can have its own price in the region's
 * currency (same regions and country detection as plans).
 */
const regionalPriceSchema = new mongoose.Schema(
  {
    regionId: { type: mongoose.Schema.Types.ObjectId, ref: "pricingRegion", required: true },
    price: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const aiCreditPackageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    credits: { type: Number, min: 1, required: true },
    price: { type: Number, min: 0, required: true },
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    regionalPrices: { type: [regionalPriceSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false }, // kept for payment history once bought
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true, versionKey: false }
);

aiCreditPackageSchema.index({ isDeleted: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model("aiCreditPackage", aiCreditPackageSchema);
