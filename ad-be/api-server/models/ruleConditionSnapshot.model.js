const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  configId: { type: mongoose.Schema.Types.ObjectId, required: true },
  profileId: { type: Number, required: true },
  ruleId: { type: mongoose.Schema.Types.ObjectId, required: true },
  ruleType: { type: String, required: true },
  adType: { type: String, required: true },
  revision: { type: String, required: true },
  entityKey: { type: String, required: true },
  capturedAt: { type: Date, required: true },
  conditionConfig: mongoose.Schema.Types.Mixed,
  values: mongoose.Schema.Types.Mixed,
}, { timestamps: true, autoIndex: true });
schema.index({ configId: 1, profileId: 1, ruleId: 1, ruleType: 1, adType: 1, revision: 1, entityKey: 1 }, { unique: true });
module.exports = mongoose.model("ruleConditionSnapshot", schema);
