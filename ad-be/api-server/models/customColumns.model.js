const mongoose = require("mongoose");

const customColumnsSchema = new mongoose.Schema({
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
    pageName: { type: String, required: true },
    columns: [
        {
            title: { type: String, required: true },
            width: { type: mongoose.Schema.Types.Mixed, required: false },
            isDisplay: { type: Boolean, default: true },
            order: { type: Number, default: null },
            isDefault: { type: Boolean, default: false },
        },
    ],
}, { timestamps: true });

customColumnsSchema.index({ userId: 1, pageName: 1 }, { unique: true });

module.exports = mongoose.model("customColumns", customColumnsSchema);

