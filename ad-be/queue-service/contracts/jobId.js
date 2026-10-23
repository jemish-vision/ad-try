const { RULE_TASKS, SYNC_TASKS, SP_API_TASKS } = require("../queues/queueNames");

/**
 * Formats a Date object or ISO string into a compact UTC time block without colons.
 * @param {Date|string|number} dateInput
 * @param {'minute'|'hour'} granularity
 * @returns {string} e.g. "20261009T0530Z" or "20261009T05Z"
 */
function formatTimeBlock(dateInput, granularity = "minute") {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided to formatTimeBlock: ${dateInput}`);
  }

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");

  if (granularity === "day") {
    return `${year}${month}${day}`;
  }

  if (granularity === "hour") {
    return `${year}${month}${day}T${hour}Z`;
  }

  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}Z`;
}

/**
 * Generates a deterministic BullMQ jobId.
 * Rules:
 * - Must never contain colons ':'.
 * - Must not be digits-only.
 * - Must include task/family, configId, profileId, and UTC time block.
 *
 * @param {Object} params
 * @param {string} params.task
 * @param {string} params.configId
 * @param {number|string} params.profileId
 * @param {Date|string} params.scheduledFor
 * @param {string} [params.replayId]
 * @returns {string} deterministic jobId
 */
function generateJobId({ task, configId, profileId, scheduledFor, replayId }) {
  if (task === SYNC_TASKS.REPORT_BATCH_WRITER) {
    if (!scheduledFor) {
      throw new Error("generateJobId for REPORT_BATCH_WRITER requires scheduledFor.");
    }
    const timeBlock = formatTimeBlock(scheduledFor, "minute");
    let baseId = `sync-report-batch-writer-${timeBlock}`;
    if (replayId) {
      const cleanReplayId = String(replayId).replace(/[^a-zA-Z0-9_-]/g, "");
      baseId += `-replay-${cleanReplayId}`;
    }
    return baseId;
  }

  if (task === SYNC_TASKS.HOURLY_DATA_CONSOLIDATION) {
    if (!scheduledFor) {
      throw new Error("generateJobId for HOURLY_DATA_CONSOLIDATION requires scheduledFor.");
    }
    const timeBlock = formatTimeBlock(scheduledFor, "day");
    let baseId = `sync-hourly-data-consolidation-${timeBlock}`;
    if (replayId) {
      const cleanReplayId = String(replayId).replace(/[^a-zA-Z0-9_-]/g, "");
      baseId += `-replay-${cleanReplayId}`;
    }
    return baseId;
  }

  const isSpApi = Object.values(SP_API_TASKS || {}).includes(task);
  if (isSpApi) {
    if (!scheduledFor) {
      throw new Error(`generateJobId for SP-API task "${task}" requires scheduledFor.`);
    }
    const timeBlock = formatTimeBlock(scheduledFor, "minute");
    let baseId = "";
    if (configId && profileId && profileId !== 0 && profileId !== "0") {
      const cleanConfigId = String(configId).replace(/[^a-zA-Z0-9_-]/g, "");
      const cleanProfileId = String(profileId).replace(/[^a-zA-Z0-9_-]/g, "");
      baseId = `sp-${task}-${cleanConfigId}-${cleanProfileId}-${timeBlock}`;
    } else {
      baseId = `sp-${task}-${timeBlock}`;
    }
    if (replayId) {
      const cleanReplayId = String(replayId).replace(/[^a-zA-Z0-9_-]/g, "");
      baseId += `-replay-${cleanReplayId}`;
    }
    return baseId;
  }

  if (!task || !configId || !profileId || !scheduledFor) {
    throw new Error("generateJobId requires task, configId, profileId, and scheduledFor.");
  }

  const isRule = Object.values(RULE_TASKS).includes(task);
  const isSync = Object.values(SYNC_TASKS).includes(task);

  if (!isRule && !isSync) {
    throw new Error(`Unrecognized task for jobId generation: "${task}"`);
  }

  // Short family name for prefix
  let prefix = "";
  let cleanTask = task;
  let timeBlock = "";

  if (isRule) {
    prefix = "rules";
    cleanTask = task.replace(/-rules$/, "");
    timeBlock = formatTimeBlock(scheduledFor, "minute");
  } else {
    prefix = "sync";
    cleanTask = task;
    timeBlock = formatTimeBlock(scheduledFor, "hour");
  }

  const cleanConfigId = String(configId).replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanProfileId = String(profileId).replace(/[^a-zA-Z0-9_-]/g, "");

  let baseId = `${prefix}-${cleanTask}-${cleanConfigId}-${cleanProfileId}-${timeBlock}`;

  if (replayId) {
    const cleanReplayId = String(replayId).replace(/[^a-zA-Z0-9_-]/g, "");
    baseId += `-replay-${cleanReplayId}`;
  }

  // Verification checks:
  if (baseId.includes(":")) {
    throw new Error(`Generated jobId must not contain colons: "${baseId}"`);
  }
  if (/^\d+$/.test(baseId)) {
    throw new Error(`Generated jobId must not be digits-only: "${baseId}"`);
  }

  return baseId;
}

module.exports = {
  formatTimeBlock,
  generateJobId,
};
