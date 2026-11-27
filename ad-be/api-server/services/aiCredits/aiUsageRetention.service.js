'use strict';

/**
 * AI usage log retention.
 *
 * Request-by-request AI usage logs are kept for the number of days Super Admin sets
 * (settings.usageLogRetentionDays). Older logs are combined into one daily total per organization,
 * UTC day, user, feature, AI model(s) and outcome (aiUsageDailySummary) and then deleted.
 * 0 days = keep every log: nothing is combined or deleted.
 *
 * Safe to run at any time, more than once, or twice at the same time:
 *  1. Claim: up to `batchSize` finished logs older than the cutoff get a new batch id. A log can
 *     only be claimed by one batch (the claim only matches logs that have none).
 *  2. Combine: each daily total is updated only if it doesn't already list the batch, and lists
 *     it in the same update. A batch is never counted twice, even if it is processed again.
 *  3. Verify: every daily total the batch should touch must now list it.
 *  4. Delete: only then are the batch's logs deleted.
 * If a run stops between 1 and 4, the claimed logs stay and the next run finishes the batch.
 * Unfinished requests (RESERVED) are never combined. Wallet transactions are not touched.
 */
const crypto = require('crypto');
const usageLogModel = require('../../models/aiUsageLog.model');
const summaryModel = require('../../models/aiUsageDailySummary.model');
const service = require('./aiCredit.service');
const { write_logs } = require('../../../winston/utility/logger');

const FINAL_STATUSES = ['SETTLED', 'RELEASED', 'EXPIRED'];
const DAY_MS = 24 * 60 * 60 * 1000;
// A batch claimed this long ago and still not finished was left by a stopped run
const STALE_CLAIM_MINUTES = 30;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const startOfUtcDay = (d) => {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
};

/** Logs created before this are combined: today plus the previous `days - 1` days are kept. */
function retentionCutoff(days, now = new Date()) {
  return new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
}

const modelKeyOf = (models) => [...new Set((models || []).filter(Boolean).map(String))].sort().join(', ');

/** Daily totals for a set of logs, one entry per organization/day/user/feature/models/outcome. */
function groupLogs(logs) {
  const groups = new Map();
  for (const log of logs) {
    const day = startOfUtcDay(log.createdAt);
    const modelKey = modelKeyOf(log.models);
    const userId = log.userId || null;
    const key = [String(log.organizationId), day.toISOString(), String(userId || ''), log.feature, modelKey, log.status].join('|');
    let g = groups.get(key);
    if (!g) {
      g = {
        key: { organizationId: log.organizationId, day, userId, feature: log.feature, modelKey, status: log.status },
        models: modelKey ? modelKey.split(', ') : [],
        totals: { requests: 0, credits: 0, meteredCredits: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, images: 0, backgroundRequests: 0 },
        byModel: new Map(),
        firstRequestAt: log.createdAt,
        lastRequestAt: log.createdAt,
      };
      groups.set(key, g);
    }
    const t = g.totals;
    const input = Number(log.inputTokens) || 0;
    const output = Number(log.outputTokens) || 0;
    t.requests += 1;
    t.credits += Number(log.credits) || 0;
    t.meteredCredits += Number(log.meteredCredits ?? log.credits) || 0;
    t.inputTokens += input;
    t.outputTokens += output;
    t.totalTokens += Number(log.totalTokens ?? input + output) || 0;
    t.images += Number(log.images) || 0;
    if (log.deferred) t.backgroundRequests += 1;
    for (const c of log.calls || []) {
      const name = c.model || 'unknown';
      const m = g.byModel.get(name) || { model: name, calls: 0, inputTokens: 0, outputTokens: 0, images: 0, credits: 0 };
      m.calls += 1;
      m.inputTokens += Number(c.inputTokens) || 0;
      m.outputTokens += Number(c.outputTokens) || 0;
      m.images += Number(c.images) || 0;
      m.credits += Number(c.credits) || 0;
      g.byModel.set(name, m);
    }
    if (new Date(log.createdAt) < new Date(g.firstRequestAt)) g.firstRequestAt = log.createdAt;
    if (new Date(log.createdAt) > new Date(g.lastRequestAt)) g.lastRequestAt = log.createdAt;
  }
  return groups;
}

const isDuplicateKey = (err) => err && (err.code === 11000 || /E11000/.test(String(err.message)));

/** Adds one group to its daily total, once per batch. Returns 'added' or 'already'. */
async function addToDailyTotal(group, batchId) {
  const $inc = Object.fromEntries(Object.entries(group.totals).map(([k, v]) => [k, k === 'credits' || k === 'meteredCredits' ? round4(v) : v]));
  const byModel = [...group.byModel.values()].map((m) => ({ ...m, credits: round4(m.credits) }));
  try {
    const doc = await summaryModel
      .findOneAndUpdate(
        { ...group.key, appliedBatches: { $ne: batchId } },
        {
          $inc,
          $push: { appliedBatches: batchId, byModel: { $each: byModel } },
          $min: { firstRequestAt: group.firstRequestAt },
          $max: { lastRequestAt: group.lastRequestAt },
          $setOnInsert: { models: group.models },
        },
        { upsert: true, new: true }
      )
      .lean();
    return doc ? 'added' : 'already';
  } catch (err) {
    // The daily total exists and already lists this batch: the upsert's insert hit the unique key
    if (isDuplicateKey(err)) return 'already';
    throw err;
  }
}

class RetentionError extends Error {}

// autoIndex is off for the app connection. The unique index on the daily totals is what refuses a
// second copy of a total, so it must exist before anything is combined (created once per process).
let indexesReady = null;
function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = Promise.all([summaryModel.createIndexes(), usageLogModel.createIndexes()]).catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}

/** Combines, verifies and deletes the logs of one claimed batch. */
async function processBatch(batchId) {
  const logs = await usageLogModel.find({ aggregationBatch: batchId }).lean();
  if (!logs.length) return { logs: 0, summaries: 0, deleted: 0 };
  const unfinished = logs.filter((l) => !FINAL_STATUSES.includes(l.status));
  if (unfinished.length) throw new RetentionError(`batch ${batchId} holds ${unfinished.length} unfinished request(s)`);

  const groups = groupLogs(logs);
  const counted = [...groups.values()].reduce((n, g) => n + g.totals.requests, 0);
  if (counted !== logs.length) throw new RetentionError(`batch ${batchId}: grouped ${counted} of ${logs.length} logs`);

  for (const group of groups.values()) await addToDailyTotal(group, batchId);

  // Verify before deleting anything: every daily total for this batch must list it
  const applied = await summaryModel.countDocuments({ appliedBatches: batchId });
  if (applied !== groups.size) throw new RetentionError(`batch ${batchId}: ${applied} of ${groups.size} daily totals saved`);

  const deleted = await usageLogModel.deleteMany({ aggregationBatch: batchId });
  return { logs: logs.length, summaries: groups.size, deleted: deleted?.deletedCount ?? 0 };
}

/**
 * Scheduled job (daily). Combines logs older than the retention period into daily totals and
 * deletes them. Returns what it did; does nothing when retention is 0.
 */
async function runUsageLogRetention({ now = new Date(), batchSize = 1000, maxBatches = 500, settings = null } = {}) {
  const s = settings || (await service.getSettings({ fresh: true }));
  const days = Number(s.usageLogRetentionDays) || 0;
  const result = { retentionDays: days, enabled: days > 0, cutoff: null, batches: 0, recoveredBatches: 0, logsCombined: 0, dailyTotals: 0, logsDeleted: 0, failed: null };
  if (!(days > 0)) return result; // 0 = keep every request: nothing combined or deleted
  const cutoff = retentionCutoff(days, now);
  result.cutoff = cutoff;
  try {
    await ensureIndexes();
  } catch (err) {
    result.failed = `indexes not ready: ${err.message}`;
    write_logs({ message: `[aiCredits] usage log retention skipped, indexes not ready: ${err.message}`, log_type: 'error' });
    return result;
  }

  const run = async (batchId, recovered) => {
    const r = await processBatch(batchId);
    result.batches += 1;
    if (recovered) result.recoveredBatches += 1;
    result.logsCombined += r.logs;
    result.dailyTotals += r.summaries;
    result.logsDeleted += r.deleted;
  };

  try {
    // 1. Finish batches a stopped run left behind
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60 * 1000);
    const seen = new Set();
    for (;;) {
      const left = await usageLogModel.findOne({ aggregationBatch: { $ne: null }, aggregationClaimedAt: { $lt: staleBefore } }).lean();
      if (!left || seen.has(left.aggregationBatch)) break;
      seen.add(left.aggregationBatch);
      await run(left.aggregationBatch, true);
    }

    // 2. New batches, oldest logs first
    while (result.batches < maxBatches) {
      const due = await usageLogModel
        .find({ createdAt: { $lt: cutoff }, status: { $in: FINAL_STATUSES }, aggregationBatch: null })
        .select('_id')
        .sort({ createdAt: 1 })
        .limit(batchSize)
        .lean();
      if (!due.length) break;
      const batchId = `ret_${crypto.randomUUID()}`;
      // Only logs no other batch has claimed (two runs at once never share a log)
      await usageLogModel.updateMany({ _id: { $in: due.map((d) => d._id) }, aggregationBatch: null }, { $set: { aggregationBatch: batchId, aggregationClaimedAt: now } });
      await run(batchId, false);
      if (due.length < batchSize) break;
    }
  } catch (err) {
    // Claimed logs are kept; the next run finishes the batch
    result.failed = err.message;
    write_logs({ message: `[aiCredits] usage log retention stopped: ${err.message}`, log_type: 'error' });
  }
  return result;
}

const _resetIndexesForTests = () => {
  indexesReady = null;
};

module.exports = { _resetIndexesForTests, runUsageLogRetention, processBatch, groupLogs, retentionCutoff, startOfUtcDay, modelKeyOf, FINAL_STATUSES, STALE_CLAIM_MINUTES };
