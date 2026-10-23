const mongoose = require("mongoose");

const asanaConfigSchema = new mongoose.Schema(
    {
        baseUrl: { type: String, required: false },

        projectId: { type: String, required: false },
        projectAssignId: { type: String, required: false },
        workspaceId: { type: String, required: false },

        clientId: { type: String, required: false },
        clientSecret: { type: String, required: false },
        accessToken: { type: String, required: false },
        refreshToken: { type: String, required: false },
    },
    { timestamps: true }
);


// --- Performance Indexing ---
asanaConfigSchema.index({adsClientId:1,adsClientSeceret:1});
asanaConfigSchema.index({isActive:1,disconnectedAt:1});
asanaConfigSchema.index({isActive:1});

module.exports = mongoose.model("asanaConfig", asanaConfigSchema);
