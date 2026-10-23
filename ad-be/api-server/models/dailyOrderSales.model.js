const mongoose = require("mongoose");

const dailyOrderSalesSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: true,
    },
    profileId: {
      type: Number,
      required: true,
    },
    date: {
      type: String,
      trim: true,
      required: true,
    },
    orderSales: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Unique index: profileId + configId + date
dailyOrderSalesSchema.index(
  {
    profileId: 1,
    configId: 1,
    date: 1,
  },
  { unique: true }
);

module.exports = mongoose.model("dailyOrderSales", dailyOrderSalesSchema);
