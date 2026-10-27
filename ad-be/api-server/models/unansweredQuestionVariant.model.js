'use strict';

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  configId: { type: mongoose.Schema.Types.ObjectId, required: true },
  profileId: { type: String, required: true },
  originalHash: { type: String, required: true },
  questionHash: { type: String, required: true },
}, { timestamps: true, bufferCommands: false, autoIndex: true });
schema.index({ configId: 1, profileId: 1, originalHash: 1 }, { unique: true });
module.exports = mongoose.models.unansweredQuestionVariant || mongoose.model('unansweredQuestionVariant', schema);
