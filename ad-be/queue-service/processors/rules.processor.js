const { DelayedError } = require("bullmq");
const { validateJobPayload } = require("../contracts/jobPayload");
const { RULE_TASKS } = require("../queues/queueNames");
const {
  acquireProfileLease,
  renewProfileLease,
  releaseProfileLease,
} = require("../utils/profileLease");
const {
  processBudgetRulesForProfile,
  processTargetingRulesForProfile,
  processPlacementRulesForProfile,
  processDaypartingRulesForProfile,
} = require("../../api-server/services/automation/ruleAutomation.service");
const {
  ProfileInactiveError,
  PermanentJobError,
} = require("../contracts/errors");

const LEASE_MS = parseInt(process.env.RULES_PROFILE_LEASE_MS, 10) || 900000; // 15 mins
const RENEW_INTERVAL_MS = parseInt(process.env.RULES_PROFILE_LEASE_RENEW_MS, 10) || 300000; // 5 mins
const MIN_JITTER_MS = parseInt(process.env.RULES_LEASE_RETRY_MIN_MS, 10) || 5000;
const MAX_JITTER_MS = parseInt(process.env.RULES_LEASE_RETRY_MAX_MS, 10) || 15000;

function getRandomJitterMs() {
  return Math.floor(Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS + 1)) + MIN_JITTER_MS;
}

/**
 * BullMQ processor for rules queue.
 * Handles single-profile rule family execution with profile-level lease protection.
 */
function createRulesProcessor(redisClient) {
  return async function rulesProcessor(job, token) {
    const validated = validateJobPayload(job.data);
    const { task, configId, profileId, scheduledFor, timeBlock } = validated;

    // 1. Acquire Profile Execution Lease to prevent adjacent blocks from overlapping
    const lease = await acquireProfileLease({
      redisClient,
      configId,
      profileId,
      ttlMs: LEASE_MS,
    });

    if (!lease.acquired) {
      // Lease busy: Reschedule job to delayed without consuming a retry attempt
      const jitterMs = getRandomJitterMs();
      const delayUntil = Date.now() + jitterMs;
      console.log(
        `[RulesProcessor] Lease busy for profile ${profileId} (${configId}). Rescheduling job ${job.id} in ${jitterMs}ms.`
      );
      await job.moveToDelayed(delayUntil, token);
      throw new DelayedError();
    }

    // 2. Setup periodic renewal
    let renewTimer = setInterval(async () => {
      try {
        await renewProfileLease({
          redisClient,
          configId,
          profileId,
          ownerToken: lease.ownerToken,
          ttlMs: LEASE_MS,
        });
      } catch (err) {
        console.warn(`[RulesProcessor] Failed to renew lease for ${profileId}:`, err.message);
      }
    }, RENEW_INTERVAL_MS);

    if (renewTimer.unref) renewTimer.unref();

    try {
      let result = null;

      switch (task) {
        case RULE_TASKS.BUDGET:
          result = await processBudgetRulesForProfile({
            configId,
            profileId,
            scheduledFor,
            jobId: job.id,
          });
          break;

        case RULE_TASKS.TARGETING:
          result = await processTargetingRulesForProfile({
            configId,
            profileId,
            scheduledFor,
            jobId: job.id,
          });
          break;

        case RULE_TASKS.PLACEMENT:
          result = await processPlacementRulesForProfile({
            configId,
            profileId,
            scheduledFor,
            jobId: job.id,
          });
          break;

        case RULE_TASKS.DAYPARTING:
          result = await processDaypartingRulesForProfile({
            configId,
            profileId,
            scheduledFor,
            jobId: job.id,
          });
          break;

        default:
          throw new PermanentJobError(`Unknown rule task "${task}" in job ${job.id}`);
      }

      return result;
    } catch (err) {
      if (err instanceof ProfileInactiveError) {
        // Inactive / deactivated profile: successful skip with reason
        return {
          skipped: true,
          reason: "PROFILE_INACTIVE",
          message: err.message,
        };
      }
      throw err;
    } finally {
      clearInterval(renewTimer);
      await releaseProfileLease({
        redisClient,
        configId,
        profileId,
        ownerToken: lease.ownerToken,
      });
    }
  };
}

module.exports = {
  createRulesProcessor,
};
