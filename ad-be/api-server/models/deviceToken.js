const mongoose = require("mongoose");

const DeviceTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
    },
    profileId: { type: Number },
    deviceToken: { type: String, index: true },
    userAgent: String,
    createdAt: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now }
});


// --- Performance Indexing ---
DeviceTokenSchema.index({userId:1});

module.exports = mongoose.model("DeviceToken", DeviceTokenSchema);
