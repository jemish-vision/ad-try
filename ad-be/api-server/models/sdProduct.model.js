const mongoose = require("mongoose");
const sdProductSchema = new mongoose.Schema(
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
sdProductSchema.index(
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
sdProductSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
});

// 3️⃣ ASIN lookup
sdProductSchema.index({
  configId: 1,
  profileId: 1,
  asin: 1,
});

// 4️⃣ SKU lookup (optional)
sdProductSchema.index({
  configId: 1,
  profileId: 1,
  sku: 1,
});

// TTL index for 396-day data retention
sdProductSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("sdproduct", sdProductSchema);
