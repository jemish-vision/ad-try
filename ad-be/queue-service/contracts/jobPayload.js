const mongoose = require("mongoose");
const { RULE_TASKS, SYNC_TASKS, SP_API_TASKS } = require("../queues/queueNames");

const VALID_TASKS = new Set([
  ...Object.values(RULE_TASKS),
  ...Object.values(SYNC_TASKS),
  ...Object.values(SP_API_TASKS),
]);

const VALID_TRIGGERS = new Set(["scheduled", "manual", "replay"]);

/**
 * Validates and normalizes a queue job payload.
 * Enforces contract:
 * - schemaVersion: 1
 * - task: string in VALID_TASKS
 * - configId: string (valid ObjectId)
 * - profileId: number
 * - scheduledFor: ISO date string
 * - timeBlock: string (compact UTC bucket, e.g. 20261009T0530Z)
 * - trigger: string ("scheduled" | "manual" | "replay")
 */
function validateJobPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Job payload must be a non-null object.");
  }

  const { schemaVersion = 1, task, configId, profileId, scheduledFor, timeBlock, trigger = "scheduled" } = payload;

  if (schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion: ${schemaVersion}. Expected 1.`);
  }

  if (!task || !VALID_TASKS.has(task)) {
    throw new Error(`Invalid or unrecognized task: "${task}".`);
  }

  const isSingleton =
    task === SYNC_TASKS.REPORT_BATCH_WRITER ||
    task === SYNC_TASKS.HOURLY_DATA_CONSOLIDATION ||
    Object.values(SP_API_TASKS).includes(task);

  const strConfigId = String(configId || (isSingleton ? "000000000000000000000000" : ""));
  if (!mongoose.Types.ObjectId.isValid(strConfigId)) {
    throw new Error(`Invalid configId: "${configId}". Must be a valid MongoDB ObjectId.`);
  }

  const numProfileId = isSingleton ? (Number(profileId) || 0) : Number(profileId);
  if (!isSingleton && (!Number.isFinite(numProfileId) || numProfileId <= 0)) {
    throw new Error(`Invalid profileId: "${profileId}". Must be a positive integer.`);
  }

  if (!scheduledFor || isNaN(Date.parse(scheduledFor))) {
    throw new Error(`Invalid scheduledFor: "${scheduledFor}". Must be a valid parseable ISO date.`);
  }

  if (!timeBlock || typeof timeBlock !== "string" || timeBlock.includes(":")) {
    throw new Error(`Invalid timeBlock: "${timeBlock}". Must be non-empty string without colons.`);
  }

  if (!VALID_TRIGGERS.has(trigger)) {
    throw new Error(`Invalid trigger: "${trigger}". Must be one of [scheduled, manual, replay].`);
  }

  // Ensure security: no sensitive token keys are ever in payload
  const forbiddenKeys = ["token", "accessToken", "refreshToken", "credentials", "password", "secret"];
  for (const key of forbiddenKeys) {
    if (key in payload) {
      throw new Error(`Security violation: Job payload must never contain sensitive key "${key}".`);
    }
  }

  return {
    schemaVersion: 1,
    task,
    configId: strConfigId,
    profileId: numProfileId,
    scheduledFor: new Date(scheduledFor).toISOString(),
    timeBlock,
    trigger,
  };
}

module.exports = {
  validateJobPayload,
  VALID_TASKS,
  VALID_TRIGGERS,
};
