const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            index: true
        },
        otp: {
            type: String,
            required: true
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        expiresAt: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("otp", otpSchema);
