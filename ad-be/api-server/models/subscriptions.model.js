const mongoose = require("mongoose");
const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "packages",
    },
    stripeCustomerId: { type: String, trim: true },
    stripeSubscriptionId: { type: String, trim: true },
    paymentDate: { type: Date, trim: true },
    nextBillingDate: { type: Date, trim: true },
    subscriptionStatus: { type: String }

  },

  { timestamps: true }
);

// --- Performance Indexing ---
subscriptionSchema.index({stripeSubscriptionId:1});
subscriptionSchema.index({subscriptionStatus:1});

module.exports = new mongoose.model("subscriptions", subscriptionSchema);
