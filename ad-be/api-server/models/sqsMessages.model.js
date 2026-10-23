const mongoose = require("mongoose");

const SQSMessageSchema = new mongoose.Schema({
    messageId: {type: String},
    receiptHandle: {type: String},
    body: { type: Object },
    message: {type: String},
    retryCount: { type: Number, default: 0 },
    lastError: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("sqsMessages", SQSMessageSchema);
