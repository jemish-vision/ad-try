const mongoose = require("mongoose");
const packageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    monthlyPrice: { type: Number, trim: true },
    yearlyPrice: { type: Number, trim: true },
    price: { type: Number, trim: true },
    currency: { type: String, default: "USD", trim: true },
    description: { type: String, trim: true },
    features: [{ type: String }],
    isPopular: { type: Boolean, default: false },
    amazonConnectLimit: { type: Number, trim: true },
    allowAmazonConnection: { type: Number, trim: true },
    profileLimit: { type: Number, trim: true },
    numberOfInvites: { type: Number, trim: true },
    trialDays: { type: Number, trim: true },
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true },
    pages: [
      {
        pageId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "page",
        },
        allocatedActions: [
          {
            actionId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "pageAction",
            },
            status: {
              type: Boolean,
              default: true,
              trim: true,
            },
          },
        ],
        allocatedOn: {
          type: Date,
          default: new Date(),
        },
      },
    ],
  },

  { timestamps: true }
);

// --- Performance Indexing ---
packageSchema.index({name:1});
packageSchema.index({name:1,_id:1});

const clearCacheHook = function () {
  const { clearOrgPagePermissionCache } = require("../helper/common");
  if (clearOrgPagePermissionCache) clearOrgPagePermissionCache();
};

packageSchema.post('save', clearCacheHook);
packageSchema.post('findOneAndUpdate', clearCacheHook);
packageSchema.post('updateOne', clearCacheHook);
packageSchema.post('updateMany', clearCacheHook);
packageSchema.post('deleteOne', clearCacheHook);
packageSchema.post('deleteMany', clearCacheHook);

module.exports = new mongoose.model("packages", packageSchema);
