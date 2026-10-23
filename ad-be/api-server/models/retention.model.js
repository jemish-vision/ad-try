const mongoose = require("mongoose");

const retentionSchema = new mongoose.Schema(
    {
        days: {
            type: Number,
            required: true,
            unique: true,
        },
        label: {
            type: String,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("retention", retentionSchema);