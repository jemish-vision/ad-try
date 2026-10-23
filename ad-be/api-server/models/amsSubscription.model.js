const mongoose = require("mongoose");

const amsSubscriptionSchema = new mongoose.Schema(
    {
        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "config",
            required: true,
            index: true,
        },

        profileId: {
            type: Number,
            required: true,
            index: true,
        },

        dataset: {
            type: String,
            enum: [
                "budget-usage",
                "sp-traffic",
                "sp-conversion",
                "sb-traffic",
                "sb-conversion",
                "sd-traffic",
                "sd-conversion",
                "campaigns",
                "ads-campaign-management-campaigns",
                "adgroups",
                "ads-campaign-management-adgroups",
                "targets",
                "ads-campaign-management-targets"
            ],
            required: true,
        },

        region: {
            type: String, // NA | EU | FE
            required: true,
        },

        sqsArn: {
            type: String,
            default: null,
        },

        clientRequestToken: {
            type: String,
            default: null,
        },

        subscriptionId: {
            type: String,
            default: null,
        },

        status: {
            type: String,
            enum: ["ACTIVE", "PENDING_CONFIRMATION", "SUSPENDED", "FAILED_CONFIRMATION", "ARCHIVED"],
            default: "PENDING_CONFIRMATION",
            index: true,
        },

        lastError: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

/**
 * One dataset can be subscribed only once per profile
 */
amsSubscriptionSchema.index(
    { configId: 1, profileId: 1, dataset: 1 },
    { unique: true }
);

module.exports = mongoose.model("AmsSubscription", amsSubscriptionSchema);
