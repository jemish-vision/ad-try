const mongoose = require("mongoose");

/**
 * Daily price / Buy Box / rank snapshot per ASIN (Competitor Price History, Enterprise plans).
 *
 * kind = "OWN"   → one of our ASINs (data from getItemOffers batch + catalog ranks)
 * kind = "RIVAL" → a rival brand ASIN tracked by the competitor sync (stored once per profile per
 *                  day, linked to the own ASINs it competes with via `forAsins`)
 *
 * Retention: `expiresAt` = snapshotAt + organization.historyRetentionDays; MongoDB's TTL monitor
 * deletes documents once expiresAt passes. Changing the setting recalculates expiresAt.
 */
const rankSchema = new mongoose.Schema(
  { rank: Number, category: String, type: { type: String, enum: ["category", "overall"] } },
  { _id: false }
);

const asinSnapshotSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", default: null },
    configId: { type: mongoose.Schema.Types.ObjectId, ref: "config", required: true },
    profileId: { type: Number, required: true },
    asin: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["OWN", "RIVAL"], required: true },
    date: { type: String, required: true }, // YYYY-MM-DD in the profile's timezone
    snapshotAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    currency: { type: String, default: null },

    // OWN
    ourPrice: { type: Number, default: null }, // landed (listing + shipping)
    ourFulfillment: { type: String, default: null }, // FBA | FBM
    hasActiveOffer: { type: Boolean, default: null },
    buyBoxPrice: { type: Number, default: null },
    buyBoxSellerId: { type: String, default: null },
    weHaveBuyBox: { type: Boolean, default: null },
    amazonSelling: { type: Boolean, default: null },
    lowestFbaPrice: { type: Number, default: null },
    lowestFbmPrice: { type: Number, default: null },
    offerCount: { type: Number, default: null },
    buyBoxEligibleCount: { type: Number, default: null },
    ranks: { type: [rankSchema], default: undefined },

    // RIVAL
    forAsins: { type: [String], default: undefined },
    brand: { type: String, default: null },
    price: { type: Number, default: null },
    bsr: { type: Number, default: null },
    bsrCategory: { type: String, default: null },
  },
  { timestamps: false, versionKey: false }
);

// One snapshot per ASIN per day per profile (re-runs overwrite instead of duplicating)
asinSnapshotSchema.index({ configId: 1, profileId: 1, kind: 1, asin: 1, date: 1 }, { unique: true });
// Rival lookups by the own ASIN they compete with
asinSnapshotSchema.index({ configId: 1, profileId: 1, kind: 1, forAsins: 1, date: 1 });
// Retention updates per organization
asinSnapshotSchema.index({ organizationId: 1 });
// TTL: delete when expiresAt passes
asinSnapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.asinSnapshot || mongoose.model("asinSnapshot", asinSnapshotSchema);
