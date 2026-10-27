'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  question: { type: String, required: true, maxlength: 4000 },
  questionTruncated: { type: Boolean, default: false },
  normalizedQuestion: { type: String, required: true, maxlength: 4000 },
  questionHash: { type: String, required: true },
  configId: { type: mongoose.Schema.Types.ObjectId, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  profileId: { type: String, required: true },
  profileName: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  reason: { type: String, enum: ['unsupported', 'unanswered', 'error'], required: true },
  count: { type: Number, default: 0, min: 0 },
  firstAskedAt: { type: Date, required: true },
  lastAskedAt: { type: Date, required: true },
}, { timestamps: true, bufferCommands: false, autoIndex: true });

schema.index({ configId: 1, profileId: 1, questionHash: 1 }, { unique: true });
schema.index({ configId: 1, profileId: 1, lastAskedAt: -1, _id: -1 });
schema.index({ configId: 1, profileId: 1, question: 'text' });
schema.index({ lastAskedAt: -1, _id: -1 });
schema.index({ firstAskedAt: -1, _id: -1 });
schema.index({ profileId: 1, lastAskedAt: -1, _id: -1 });
schema.index({ reason: 1, lastAskedAt: -1, _id: -1 });
schema.index({ count: -1, _id: -1 });

module.exports = mongoose.models.unansweredQuestion || mongoose.model('unansweredQuestion', schema);
