const mongoose = require("mongoose");

const chartSettingsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "sellerConfigs",
            required: false,
        },
        profileId: {
            type: mongoose.Schema.Types.Mixed,
            required: false,
        },
        pageName: {
            type: String,
            required: true,
        },
        settings: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
            default: {},
        },
    },
    { timestamps: true }
);

chartSettingsSchema.index({ userId: 1, pageName: 1 }, { unique: true });

module.exports = mongoose.model("chartSettings", chartSettingsSchema);
