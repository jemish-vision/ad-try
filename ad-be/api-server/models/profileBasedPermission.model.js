const mongoose = require("mongoose");

const profileBasedPermissionSchema = new mongoose.Schema(
  {
    profileId: {
      type: Number,
      required: true,
      trim: true,
    },
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organization",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    hasAccess: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

profileBasedPermissionSchema.index({ userId: 1, organizationId: 1, configId: 1, profileId: 1 }, { unique: true });
profileBasedPermissionSchema.index({ organizationId: 1 });

module.exports = mongoose.model("profileBasedPermission", profileBasedPermissionSchema);
