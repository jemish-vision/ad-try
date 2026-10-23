const mongoose = require("mongoose");

const reportDetailsSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
        },
        groupId: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("reportDetails", reportDetailsSchema);