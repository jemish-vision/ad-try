const mongoose = require("mongoose");
const productSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    currencyCode: {
      type: String,
      trim: true,
    },
    asin: {
      type: String,
      trim: true,
    },
    availability: {
      type: String,
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    eligibilityStatus: {
      type: String,
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    reportDate: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// 1️⃣ Unique identity
productSchema.index(
  {
    configId: 1,
    profileId: 1,
    asin: 1,
    sku: 1,
    reportDate: 1,
  },
  { unique: true }
);

// 2️⃣ Profile + date listing
productSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
});

// 3️⃣ ASIN lookup
productSchema.index({
  configId: 1,
  profileId: 1,
  asin: 1,
});

// 4️⃣ SKU lookup (optional)
productSchema.index({
  configId: 1,
  profileId: 1,
  sku: 1,
});

productSchema.index({
  asin: 1,
  reportDate: 1
});

module.exports = new mongoose.model("product", productSchema);
