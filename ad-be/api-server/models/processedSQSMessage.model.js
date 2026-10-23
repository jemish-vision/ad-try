const mongoose = require('mongoose');

const processedSQSMessageSchema = new mongoose.Schema({
  idempotencyId: {
    type: String,
    required: true,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '7d' // Automatically deletes record after 7 days
  }
});

processedSQSMessageSchema.index({ idempotencyId: 1 }, { unique: true });

module.exports = mongoose.model('processedSQSMessage', processedSQSMessageSchema);