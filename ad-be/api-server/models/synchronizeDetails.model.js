const mongoose = require("mongoose");

const synchronizeDetailsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
        },
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
        groupId: {
            type: String,
            trim: true,
            required: true,
        },
        selectedSyncDays: {
            type: Number,
            default: 30,
        },
        requestStatus: {
            type: String,
            enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"],
            default: "PENDING",
            index: true,
        },
        syncRequestTime: {
            type: Date,
            default: Date.now,
        },
        type: {
            type: String,
            enum: ["ads", "seller"],
            default: "ads",
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("synchronizeDetails", synchronizeDetailsSchema);