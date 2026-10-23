const mongoose = require("mongoose");

const subscriptionHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "packages",
      required: true,
    },

    subscriptionId: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentDate: {
      type: Date,
      required: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "active",        // currently running
        "cancelled",     // user cancelled
        "expired",       // endDate passed
      ],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);


// --- Performance Indexing ---
subscriptionHistorySchema.index({ subscriptionId: 1, status: 1 });

// TTL index for 396-day data retention
subscriptionHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("subscriptionHistories", subscriptionHistorySchema);
