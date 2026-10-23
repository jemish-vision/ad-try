const mongoose = require("mongoose");
const permissionSchema = new mongoose.Schema(
  {
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "roles",
    },
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
const clearCacheHook = function () {
  const { clearOrgPagePermissionCache } = require("../../helper/common");
  if (clearOrgPagePermissionCache) clearOrgPagePermissionCache();
};

permissionSchema.post('save', clearCacheHook);
permissionSchema.post('findOneAndUpdate', clearCacheHook);
permissionSchema.post('updateOne', clearCacheHook);
permissionSchema.post('updateMany', clearCacheHook);
permissionSchema.post('deleteOne', clearCacheHook);
permissionSchema.post('deleteMany', clearCacheHook);

module.exports = new mongoose.model("permission", permissionSchema);
