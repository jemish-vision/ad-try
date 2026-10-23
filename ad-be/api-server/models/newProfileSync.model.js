const mongoose = require("mongoose");

const newProfileSyncSchema = new mongoose.Schema(
    {
        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "config",
            required: true,
        },

        profileId: {
            type: Number,
            trim: true,
        },

        sync: {
            type: String,
            default: false,
        },

        startDate: {type: String, trim: true},
        endDate: {type: String, trim: true},
    },
    { timestamps: true }
);



// --- Performance Indexing ---
newProfileSyncSchema.index({isActive:1});
newProfileSyncSchema.index({profileId:1});
newProfileSyncSchema.index({configId:1});
newProfileSyncSchema.index({sync:1});
newProfileSyncSchema.index({profileId:1,configId:1,isActive:1});
newProfileSyncSchema.index({profileId:1,configId:1});
newProfileSyncSchema.index({isActive:1,profileId:1});

module.exports = mongoose.model("newprofilesyncs", newProfileSyncSchema);
