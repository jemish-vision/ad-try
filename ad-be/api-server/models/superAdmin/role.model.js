const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
    {
        roleName: {
            type: String,
            trim: true,
        },
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "organization",
            default: null,
        },
    },
    { timestamps: true }
);

// Prevent duplicate roles entries within the same organization (or globally for system roles)
roleSchema.index({ roleName: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model("roles", roleSchema);
