const crypto = require("crypto");
const RuleActionExecution = require("../../models/ruleActionExecution.model");

/**
 * Computes deterministic payload hash
 */
function hashPayload(payload) {
  if (!payload) return null;
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Claims a specific Amazon action execution for a given entity and slot.
 * Ensures strict action-level idempotency:
 * - If APPLIED: returns { shouldExecute: false, reason: "ALREADY_APPLIED", record }
 * - If CLAIMED (active & owned by another): returns { shouldExecute: false, reason: "ACTIVE_CLAIM", record }
 * - If CLAIMED (expired) or FAILED: reclaims with frozen desiredValue
 * - If NEW: claims and freezes desiredValue before any Amazon API call
 *
 * @param {Object} params
 * @param {string} params.configId
 * @param {number} params.profileId
 * @param {string} params.ruleFamily
 * @param {string} params.ruleId
 * @param {string} params.scheduledSlot
 * @param {string} params.amazonEntityType
 * @param {string} params.amazonEntityId
 * @param {string} params.actionType
 * @param {any} params.previousValue
 * @param {any} params.desiredValue
 * @param {any} [params.requestPayload]
 * @param {string} params.jobId
 * @param {string} params.owner
 * @param {number} [params.leaseMs=300000] 5 minutes default
 */
async function claimAction({
  configId,
  profileId,
  ruleFamily,
  ruleId,
  scheduledSlot,
  amazonEntityType,
  amazonEntityId,
  actionType,
  previousValue,
  desiredValue,
  requestPayload = null,
  jobId,
  owner,
  leaseMs = 300000,
  isDryRun = false,
}) {
  const identity = {
    configId,
    profileId,
    ruleFamily,
    ruleId,
    scheduledSlot,
    amazonEntityType,
    amazonEntityId,
    actionType,
  };

  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + leaseMs);
  const payloadHash = hashPayload(requestPayload);

  // 1. Try to find existing action
  const existing = await RuleActionExecution.findOne(identity);

  if (existing) {
    if (existing.state === "APPLIED") {
      return {
        shouldExecute: false,
        reason: "ALREADY_APPLIED",
        record: existing,
        frozenDesiredValue: existing.desiredValue,
      };
    }

    // If claimed and not expired, and claimed by another worker
    if (existing.state === "CLAIMED" && existing.claimExpiresAt > now && existing.owner !== owner) {
      return {
        shouldExecute: false,
        reason: "ACTIVE_CLAIM",
        record: existing,
        frozenDesiredValue: existing.desiredValue,
      };
    }

    // Reclaim: Preserve the original frozen desiredValue so retries do not compound!
    const effectiveDesiredValue = existing.desiredValue !== undefined ? existing.desiredValue : desiredValue;

    existing.state = "CLAIMED";
    existing.owner = owner;
    existing.jobId = jobId;
    existing.claimExpiresAt = claimExpiresAt;
    existing.attempts = (existing.attempts || 0) + 1;
    existing.startedAt = now;
    existing.lastError = null;
    if (requestPayload) {
      existing.requestPayload = requestPayload;
      existing.payloadHash = payloadHash;
    }
    await existing.save();

    return {
      shouldExecute: true,
      reason: "RECLAIMED",
      record: existing,
      frozenDesiredValue: effectiveDesiredValue,
    };
  }

  // 2. New action record creation
  try {
    const created = await RuleActionExecution.create({
      ...identity,
      state: "CLAIMED",
      previousValue,
      desiredValue,
      payloadHash,
      requestPayload,
      jobId,
      owner,
      claimExpiresAt,
      attempts: 1,
      startedAt: now,
      isDryRun,
    });

    return {
      shouldExecute: true,
      reason: "CLAIMED_NEW",
      record: created,
      frozenDesiredValue: desiredValue,
    };
  } catch (err) {
    // In case of race condition resulting in duplicate key error
    if (err.code === 11000) {
      const raced = await RuleActionExecution.findOne(identity);
      if (raced && raced.state === "APPLIED") {
        return {
          shouldExecute: false,
          reason: "ALREADY_APPLIED",
          record: raced,
          frozenDesiredValue: raced.desiredValue,
        };
      }
      return {
        shouldExecute: false,
        reason: "ACTIVE_CLAIM",
        record: raced,
        frozenDesiredValue: raced?.desiredValue,
      };
    }
    throw err;
  }
}

/**
 * Marks a claimed action as successfully APPLIED with Amazon
 */
async function markActionApplied(recordId, { amazonRequestId = null, appliedAt = new Date() } = {}) {
  return await RuleActionExecution.findByIdAndUpdate(
    recordId,
    {
      $set: {
        state: "APPLIED",
        amazonRequestId,
        appliedAt,
        claimExpiresAt: null,
      },
    },
    { new: true }
  );
}

/**
 * Marks an action as FAILED
 */
async function markActionFailed(recordId, error) {
  const lastError = error instanceof Error ? { message: error.message, stack: error.stack } : error;
  return await RuleActionExecution.findByIdAndUpdate(
    recordId,
    {
      $set: {
        state: "FAILED",
        lastError,
      },
    },
    { new: true }
  );
}

module.exports = {
  claimAction,
  markActionApplied,
  markActionFailed,
  hashPayload,
};
