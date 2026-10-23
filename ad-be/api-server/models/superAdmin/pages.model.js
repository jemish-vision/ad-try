const mongoose = require("mongoose");
const pageSchema = new mongoose.Schema(
  {
    pageName: {
      type: String,
      trim: true,
    },
    pageSlug: {
      type: String,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      trim: true,
    }
  },
  { timestamps: true }
);

const clearCacheHook = function () {
  const { clearOrgPagePermissionCache } = require("../../helper/common");
  if (clearOrgPagePermissionCache) clearOrgPagePermissionCache();
};

pageSchema.post('save', clearCacheHook);
pageSchema.post('findOneAndUpdate', clearCacheHook);
pageSchema.post('updateOne', clearCacheHook);
pageSchema.post('updateMany', clearCacheHook);
pageSchema.post('deleteOne', clearCacheHook);
pageSchema.post('deleteMany', clearCacheHook);

module.exports = new mongoose.model("page", pageSchema);
