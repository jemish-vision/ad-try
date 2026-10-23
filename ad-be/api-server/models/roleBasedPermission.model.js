const mongoose = require("mongoose");

const roleBasedPermissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "roles",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organization",
      required: true,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

roleBasedPermissionSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
roleBasedPermissionSchema.index({ organizationId: 1 });

const clearCacheHook = function () {
  const { clearOrgPagePermissionCache } = require("../helper/common");
  if (clearOrgPagePermissionCache) clearOrgPagePermissionCache();
};

roleBasedPermissionSchema.post('save', clearCacheHook);
roleBasedPermissionSchema.post('findOneAndUpdate', clearCacheHook);
roleBasedPermissionSchema.post('updateOne', clearCacheHook);
roleBasedPermissionSchema.post('updateMany', clearCacheHook);
roleBasedPermissionSchema.post('deleteOne', clearCacheHook);
roleBasedPermissionSchema.post('deleteMany', clearCacheHook);

module.exports = mongoose.model("roleBasedPermission", roleBasedPermissionSchema);
