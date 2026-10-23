const mongoose = require("mongoose");

const tempStateConfigSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "organization",
            required: false,
            default: null,
        },

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: false,
            default: null,
        },

        profileId: {
            type: Number,
            required: false,
            default: null,
        },

        sellerConfigId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "sellerConfig",
            required: false,
        },

        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "config",
            required: false,
        },

        clientId: {
            type: String,
            required: true,
        },

        clientSeceret: {
            type: String,
            required: true,
        },

        companyName: {
            type: String,
            required: false,
        },

        sellerId: {
            type: String,
            required: false,
        },

        type: {
            type: String,
            enum: ["ADS", "SP"],
            default: "ADS",
        },

        state: {
            type: String,
            required: true,
            unique: true,
        },

        isNew: {
            type: Boolean,
            default: true,
        },

        isUsed: {
            type: Boolean,
            default: false,
        },

        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 }, // Auto delete after expiry
        },
    },
    { timestamps: true, suppressReservedKeysWarning: true }
);

module.exports = mongoose.model("tempStateConfig", tempStateConfigSchema);