// models/recommendationSnapshot.model.js

const mongoose = require("mongoose");

const recommendationSnapshotSchema = new mongoose.Schema({
    configId: { type: mongoose.Schema.Types.ObjectId, required: true },
    profileId: { type: Number, required: true },

    reportedDate: { type: String, required: true },

    campaignType: { type: String, required: true },
    type: { type: String, required: true },

    columns: { type: [String], default: [] },

    data: { type: Array, default: [] },

    totalCount: { type: Number, default: 0 }

}, { timestamps: true });

recommendationSnapshotSchema.index({ configId: 1, profileId: 1, date: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("recommendationSnapshots", recommendationSnapshotSchema);