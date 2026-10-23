const mongoose = require("mongoose");

const searchTermDeletedSchema = new mongoose.Schema({
    configId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "config",
    },
    profileId: Number,

    data: {
        type: Object,
        required: true
    },

    // 🔹 metadata
    deletedType: {
        type: String, // REMOVE_FROM_LIST | NEVER_RECOMMANDED
    },

    deletedAt: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: true
});

// Optional indexes for lookup
searchTermDeletedSchema.index({
    configId: 1,
    profileId: 1,
    "data.searchTerm": 1
});

module.exports = mongoose.model("SearchTermDeleted", searchTermDeletedSchema);