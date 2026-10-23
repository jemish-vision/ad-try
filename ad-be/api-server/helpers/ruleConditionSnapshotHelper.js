const crypto = require("crypto");
const CONFIG_FIELDS = ["conditions", "query", "reportDate", "toDate", "isDaysSinceCreation", "daysSinceCreation"];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).filter(k => k !== "_id").sort().map(k => [k, canonical(value[k])]));
  return value;
}
function conditionConfig(rule) {
  const config = Object.fromEntries(CONFIG_FIELDS.map(k => [k, rule[k] ?? null]));
  if (config.query) config.query = Object.fromEntries(Object.entries(config.query).map(([adType, raw]) => {
    const parsed = typeof raw === "string" ? (raw ? JSON.parse(raw) : {}) : { ...(raw || {}) };
    delete parsed.campaignId; // Campaign assignment is live scope, not a condition revision.
    return [adType, parsed];
  }));
  return canonical(config);
}
function conditionRevision(rule) {
  return crypto.createHash("sha256").update(JSON.stringify(conditionConfig(rule)) + ":" + (rule.conditionSnapshotRevision || "initial")).digest("hex");
}
function entityKey(ruleType, row) {
  const fields = ruleType === "budget" ? [row.campaignId] : ruleType === "placement" ? [row.campaignId, row.placement] : ruleType === "targeting" ? [row.campaignId, row.adGroupId, row.targetId ?? row.keywordId] : [row.campaignId, row.adGroupId, row.keywordId, row.searchTerm];
  if (fields[0] == null) throw new Error("Cannot snapshot a rule entity without a campaign ID");
  return JSON.stringify(fields.map(v => v == null ? null : String(v)));
}
// MongoDB evaluates the original generated queries, including $expr/percentage comparisons.
// Live action values and availability checks remain outside these saved condition inputs.
async function getConditionRows({ rule, ruleType, adType, model, pipeline, conditionStages, capture = false, snapshotModel, ruleModel, useSavedConditions = true }) {
  const revision = conditionRevision(rule);
  const scope = { configId: rule.configId, profileId: Number(rule.profileId), ruleId: rule._id, ruleType, adType, revision };
  const assertCurrentRevision = async () => {
    if (!ruleModel) return;
    const current = await ruleModel.findOne({ _id: rule._id, configId: rule.configId, profileId: Number(rule.profileId) }).lean();
    if (!current || conditionRevision(current) !== revision) throw new Error("Rule conditions changed during evaluation; retry with the current configuration");
  };
  if (!useSavedConditions) {
    // Targeting uses the selected report window on each run; retained baselines stay untouched.
    const rows = await model.aggregate([...pipeline, ...conditionStages]).allowDiskUse(true);
    await assertCurrentRevision();
    delete rule.conditionSnapshot;
    return rows;
  }
  const snapshots = snapshotModel || require("../models/ruleConditionSnapshot.model");
  await snapshots.init?.();
  // Read the complete live scope before matching: first execution freezes nonmatches too.
  const rows = await model.aggregate(pipeline).allowDiskUse(true);
  await assertCurrentRevision();
  if (!rows.length) return [];
  const keys = rows.map(row => entityKey(ruleType, row));
  if (capture) {
    const capturedAt = new Date();
    const ops = rows.map((row, i) => ({ updateOne: {
      filter: { ...scope, entityKey: keys[i] },
      update: { $setOnInsert: { ...scope, entityKey: keys[i], capturedAt,
        conditionConfig: conditionConfig(rule), values: { ...row, __conditionSnapshotKey: keys[i] } } },
      upsert: true
    } }));
    try { await snapshots.bulkWrite(ops, { ordered: false }); }
    catch (error) {
      const failures = error.writeErrors || [];
      if (!failures.length || failures.some(e => (e.code ?? e.err?.code) !== 11000) || error.writeConcernErrors?.length || error.result?.getWriteConcernError?.() || (error.code && error.code !== 11000)) throw error;
    }
  }
  // Re-read after capture so concurrent first writers determine both inputs and timestamps.
  const saved = await snapshots.find({ ...scope, entityKey: { $in: keys } }).lean();
  const savedByKey = new Map(saved.map(item => [item.entityKey, item]));
  const matchedSaved = saved.length ? await snapshots.aggregate([
    { $match: { ...scope, entityKey: { $in: keys } } },
    { $replaceRoot: { newRoot: "$values" } }, ...conditionStages
  ]).allowDiskUse(true) : [];
  const evaluated = new Map(matchedSaved.map(row => [row.__conditionSnapshotKey, row]));
  if (savedByKey.size < new Set(keys).size) {
    const matchedLive = await model.aggregate([...pipeline, ...conditionStages]).allowDiskUse(true);
    for (const row of matchedLive) {
      const key = entityKey(ruleType, row);
      if (!savedByKey.has(key)) evaluated.set(key, row);
    }
  }
  await assertCurrentRevision();
  // Only expose predicate fields as condition metrics; keep bids and operational data live.
  const conditionFields = new Set();
  const collectFields = (value, queryObject = false) => {
    if (typeof value === "string" && value.startsWith("$") && !value.startsWith("$$")) conditionFields.add(value.slice(1).split(".")[0]);
    else if (Array.isArray(value)) value.forEach(item => collectFields(item, queryObject));
    else if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) {
      if (queryObject && !key.startsWith("$")) conditionFields.add(key.split(".")[0]);
      collectFields(nested, queryObject);
    }
  };
  conditionStages.forEach(stage => collectFields(stage.$match || stage, true));
  const captured = saved.filter(item => item.capturedAt).sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
  if (captured.length) rule.conditionSnapshot = { revision, capturedAt: captured[0].capturedAt };
  else delete rule.conditionSnapshot;
  return rows.filter((row, i) => evaluated.has(keys[i])).map(row => {
    const key = entityKey(ruleType, row);
    const values = evaluated.get(key);
    const snapshot = savedByKey.get(key);
    const conditionValues = Object.fromEntries([...conditionFields].filter(field => Object.prototype.hasOwnProperty.call(values, field)).map(field => [field, values[field]]));
    return { ...row, conditionValues, ...(snapshot ? { conditionSnapshot: { revision, capturedAt: snapshot.capturedAt } } : {}) };
  });
}
async function captureManualSelection(rule, ruleType, selected, loadRows) {
  const result = {};
  for (const adType of (ruleType === "placement" ? ["SP", "SB"] : ["SP", "SB", "SD"])) {
    const rows = await loadRows(adType);
    const choices = new Map((selected?.[adType] || []).map(row => [entityKey(ruleType, row), row]));
    result[adType] = rows.filter(row => choices.has(entityKey(ruleType, row))).map(row => ({ ...row, ...(ruleType === "searchTerm" ? { addToNegative: choices.get(entityKey(ruleType, row)).addToNegative } : {}) }));
  }
  return result;
}
async function updateSnapshotHistory(rule, historyModel, currentDate, currentTime) {
  if (!rule.conditionSnapshot) return;
  // SP initializes the shared run entry first. Later ad types only enrich that exact entry.
  await historyModel.findOneAndUpdate({
    configId: rule.configId,
    profileId: rule.profileId,
    ruleDate: currentDate,
    ruleId: rule._id,
    lastRun: currentTime,
    ruleTime: currentTime,
  }, { $set: { conditionSnapshot: rule.conditionSnapshot } }, { new: true }).lean();
}
async function prepareSnapshotBulkUpdates(model, operations) {
  for (const operation of operations) {
    const mutation = operation.updateOne;
    if (!mutation) continue;
    const changes = mutation.update.$set || mutation.update;
    delete changes.conditionSnapshotRevision;
    if (!CONFIG_FIELDS.some(k => Object.prototype.hasOwnProperty.call(changes, k))) continue;
    const previous = await model.findOne(mutation.filter).lean();
    if (previous && JSON.stringify(conditionConfig(previous)) !== JSON.stringify(conditionConfig({ ...previous, ...changes }))) changes.conditionSnapshotRevision = crypto.randomUUID();
  }
}
function attachSnapshotLifecycle(schema, ruleType, snapshotModel) {
  schema.add({ conditionSnapshotRevision: { type: String, default: "initial" } });
  schema.pre(["findOneAndUpdate", "updateOne"], async function () {
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return;
    const changes = update.$set || update;
    delete changes.conditionSnapshotRevision;
    if (!CONFIG_FIELDS.some(k => Object.prototype.hasOwnProperty.call(changes, k))) return;
    const previous = await this.model.findOne(this.getQuery()).lean();
    if (!previous) return;
    if (JSON.stringify(conditionConfig(previous)) !== JSON.stringify(conditionConfig({ ...previous, ...changes }))) changes.conditionSnapshotRevision = crypto.randomUUID();
  });
  schema.pre(["deleteOne", "deleteMany", "findOneAndDelete"], { query: true, document: false }, async function () {
    const rules = await this.model.find(this.getQuery(), { _id: 1 }).lean();
    this._snapshotDeletedIds = rules.map(r => r._id);
  });
  schema.post(["deleteOne", "deleteMany", "findOneAndDelete"], { query: true, document: false }, async function (result) {
    if (!result || result.acknowledged === false || !this._snapshotDeletedIds?.length) return;
    const remaining = await this.model.find({ _id: { $in: this._snapshotDeletedIds } }, { _id: 1 }).lean();
    const surviving = new Set(remaining.map(r => String(r._id)));
    const deleted = this._snapshotDeletedIds.filter(id => !surviving.has(String(id)));
    if (deleted.length) await (snapshotModel || require("../models/ruleConditionSnapshot.model")).deleteMany({ ruleType, ruleId: { $in: deleted } });
  });
}
module.exports = { getConditionRows, conditionConfig, conditionRevision, entityKey, captureManualSelection, prepareSnapshotBulkUpdates, updateSnapshotHistory, attachSnapshotLifecycle };
