const mongoose = require("mongoose");

const postalCodeStateSchema = new mongoose.Schema(
    {
        pincode: {
            type: String,
            required: true,

        },
        state: {
            type: String,
            required: true,

        },
        city: {
            type: String,

        },
        district: {
            type: String,

        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("postalCodeState", postalCodeStateSchema);
