const crypto = require("crypto");

class RuleSlotOwnershipError extends Error {
  constructor(message = "Rule slot ownership lost; manual recovery is required before retrying actions.") {
    super(message);
    this.name = "RuleSlotOwnershipError";
    this.code = "RULE_SLOT_OWNERSHIP_LOST";
  }
}

class RuleSlotRecoveryRequiredError extends Error {
  constructor() {
    super("Rule slot requires manual recovery: prior external actions may have partially applied; automatic retry is blocked.");
    this.name = "RuleSlotRecoveryRequiredError";
    this.code = "RULE_SLOT_RECOVERY_REQUIRED";
  }
}

// A slot is never automatically reclaimed. A crashed/partial rule may already
// have changed Amazon values; rerunning its percentage calculation is unsafe.
function createRuleSlotExecutionService({ model, now = () => new Date(), leaseMs = 15 * 60 * 1000, heartbeatMs = 60 * 1000 } = {}) {
  if (!model) throw new Error("A rule-run history model is required.");
  if (!(leaseMs > 0) || !(heartbeatMs > 0 && heartbeatMs < leaseMs)) throw new Error("Heartbeat must be positive and shorter than the lease.");
  let uniqueIndexCheck = null;
  const ensureUniqueSlotIndex = () => {
    if (!uniqueIndexCheck) {
      uniqueIndexCheck = (async () => {
        const fields = ["configId", "profileId", "ruleId", "ruleSchema", "ruleDate", "ruleTime"];
        const indexes = await model.collection.indexes();
        if (!indexes.some(index => index.unique === true && !index.sparse && !index.partialFilterExpression &&
          Object.keys(index.key).length === fields.length && fields.every(field => index.key[field] === 1))) {
          const error = new Error("Rule slot execution requires the existing unique config/profile/rule/schema/date/time index; no actions were started.");
          error.code = "RULE_SLOT_INDEX_REQUIRED";
          throw error;
        }
      })().catch(error => { uniqueIndexCheck = null; throw error; });
    }
    return uniqueIndexCheck;
  };
  const timestamp = () => new Date(now());
  const identityFor = (params) => {
    const identity = { configId: params.configId, profileId: Number(params.profileId), ruleSchema: params.ruleSchema,
      ruleId: params.ruleId, ruleDate: params.ruleDate, ruleTime: params.scheduledTime };
    if (!identity.configId || !identity.ruleId || !identity.ruleSchema || !Number.isFinite(identity.profileId) || !params.profileId ||
        !/^\d{4}-\d{2}-\d{2}$/.test(identity.ruleDate || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(identity.ruleTime || "")) {
      throw new Error("Rule slot requires config, profile, rule schema/id, YYYY-MM-DD date and HH:mm scheduledTime.");
    }
    return identity;
  };
  const ownedFilter = (claim, at, requireLive = true) => {
    if (!claim?.shouldExecute || !claim.ownerToken || !claim.identity) throw new RuleSlotOwnershipError("A valid owned rule slot claim is required.");
    return { ...claim.identity, isRun: { $ne: true }, slotState: "RUNNING", slotOwnerToken: claim.ownerToken,
      ...(requireLive ? { slotLeaseExpiresAt: { $gt: at } } : {}) };
  };
  const read = (identity) => model.findOne(identity).lean();
  const classify = async (identity, record) => {
    if (!record) return { shouldExecute: false, reason: "CLAIM_RACE", identity };
    if (record.isRun === true) return { shouldExecute: false, reason: "ALREADY_COMPLETED", identity, record };
    if (record.slotState === "RUNNING" && !(new Date(record.slotLeaseExpiresAt).getTime() > timestamp().getTime())) {
      // Compare the recorded lease as well as token: a concurrent heartbeat wins
      // over an observer that read a stale expiration timestamp.
      const marked = await model.findOneAndUpdate({ ...identity, isRun: { $ne: true }, slotState: "RUNNING",
        slotOwnerToken: record.slotOwnerToken, slotLeaseExpiresAt: record.slotLeaseExpiresAt }, {
        $set: { slotState: "RECOVERY_REQUIRED", slotFailedAt: timestamp(), slotFailureReason: "Execution lease expired; prior external actions may have partially applied." }
      }, { new: true });
      if (marked) return { shouldExecute: false, reason: "RECOVERY_REQUIRED", identity, record: marked };
      return classify(identity, await read(identity));
    }
    return { shouldExecute: false, reason: record.slotState === "RUNNING" ? "ACTIVE_CLAIM" : "RECOVERY_REQUIRED", identity, record };
  };
  const claimRuleSlot = async (params) => {
    const identity = identityFor(params);
    await ensureUniqueSlotIndex();
    const at = timestamp(), ownerToken = crypto.randomUUID();
    try {
      const record = await model.findOneAndUpdate({ ...identity, isRun: { $ne: true }, slotState: null, slotOwnerToken: { $exists: false } }, {
        $set: { isRun: false, slotState: "RUNNING", slotOwnerToken: ownerToken, slotClaimedAt: at, slotHeartbeatAt: at,
          slotLeaseExpiresAt: new Date(at.getTime() + leaseMs), slotJobId: params.jobId ? String(params.jobId) : null }
      }, { upsert: true, new: true, setDefaultsOnInsert: false, runValidators: true });
      if (record?.slotOwnerToken !== ownerToken) return classify(identity, record);
      return { shouldExecute: true, reason: "CLAIMED", identity, ownerToken, record };
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Existing unique slot index arbitrates both new-slot and legacy-row races.
      return classify(identity, await read(identity));
    }
  };
  const heartbeatRuleSlot = async (claim) => {
    const at = timestamp();
    return Boolean(await model.findOneAndUpdate(ownedFilter(claim, at), { $set: { slotHeartbeatAt: at, slotLeaseExpiresAt: new Date(at.getTime() + leaseMs) } }, { new: true }));
  };
  const assertRuleSlotActive = async (claim) => {
    if (!claim?.shouldExecute || !await model.findOne(ownedFilter(claim, timestamp())).lean()) throw new RuleSlotOwnershipError();
  };
  const completeRuleSlot = async (claim) => {
    const at = timestamp();
    const record = await model.findOneAndUpdate(ownedFilter(claim, at), { $set: { isRun: true, slotState: "COMPLETED", slotCompletedAt: at } }, { new: true });
    if (!record) throw new RuleSlotOwnershipError("Rule slot completion rejected: owner or live lease no longer matches.");
    return record;
  };
  const failRuleSlot = async (claim, error) => {
    const at = timestamp();
    return model.findOneAndUpdate(ownedFilter(claim, at, false), { $set: { isRun: false, slotState: "RECOVERY_REQUIRED", slotFailedAt: at,
      slotFailureReason: String(error?.message || error || "Rule execution failed; inspect partial actions before retrying.").slice(0, 2000) } }, { new: true });
  };
  const runWithRuleSlot = async (params, work) => {
    const claim = await claimRuleSlot(params);
    if (!claim.shouldExecute) {
      if (!["ALREADY_COMPLETED", "ACTIVE_CLAIM"].includes(claim.reason)) throw new RuleSlotRecoveryRequiredError();
      return { ...claim, skipped: true };
    }
    let ownershipError = null, pendingHeartbeat = null;
    const timer = setInterval(() => {
      if (pendingHeartbeat || ownershipError) return;
      pendingHeartbeat = heartbeatRuleSlot(claim).then(ok => { if (!ok) ownershipError = new RuleSlotOwnershipError(); })
        .catch(error => { ownershipError = new RuleSlotOwnershipError(`Rule slot heartbeat failed: ${error.message}`); })
        .finally(() => { pendingHeartbeat = null; });
    }, heartbeatMs);
    timer.unref?.();
    const assertActive = async () => { if (ownershipError) throw ownershipError; await assertRuleSlotActive(claim); };
    try {
      const result = await work({ claim, assertActive });
      clearInterval(timer);
      if (pendingHeartbeat) await pendingHeartbeat;
      await assertActive();
      await completeRuleSlot(claim);
      return { shouldExecute: true, skipped: false, reason: "COMPLETED", result };
    } catch (error) {
      clearInterval(timer);
      if (pendingHeartbeat) await pendingHeartbeat;
      try { await failRuleSlot(claim, error); } catch (persistError) { error.slotFailurePersistenceError = persistError.message; }
      throw error;
    } finally { clearInterval(timer); }
  };
  return { claimRuleSlot, heartbeatRuleSlot, assertRuleSlotActive, completeRuleSlot, failRuleSlot, runWithRuleSlot };
}

let defaultService;
const service = () => defaultService ||= createRuleSlotExecutionService({ model: require("../../models/ruleRunHistory.model") });
module.exports = { createRuleSlotExecutionService, RuleSlotOwnershipError, RuleSlotRecoveryRequiredError };
for (const method of ["claimRuleSlot", "heartbeatRuleSlot", "assertRuleSlotActive", "completeRuleSlot", "failRuleSlot", "runWithRuleSlot"]) {
  module.exports[method] = (...args) => service()[method](...args);
}
