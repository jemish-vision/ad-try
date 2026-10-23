const mongoose = require("mongoose");

const configHistorySchema = new mongoose.Schema(
    {
        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "config",
        },
        event: { type: String, required: true },
    },
    { timestamps: true }
);

// TTL index for 396-day data retention
configHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = mongoose.model("configHistory", configHistorySchema);
