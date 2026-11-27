const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { test, describe, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { createFakeModel } = require('./helpers/fakeMongoModel');

const root = path.join(__dirname, '..');
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

// ── In-memory collections ──
const wallets = createFakeModel('aicreditwallets', { unique: [['organizationId']], defaults: { monthlyLimitOverride: null, reserved: 0, used: 0, lifetimeUsed: 0 } });
const transactions = createFakeModel('aicredittransactions', { unique: [['dedupeKey']] });
const usageLogs = createFakeModel('aiusagelogs', { unique: [['requestId']], defaults: { aggregationBatch: null, aggregationClaimedAt: null } });
const summaries = createFakeModel('aiusagedailysummaries', { unique: [['organizationId', 'day', 'userId', 'feature', 'modelKey', 'status', 'keySource']], defaults: { appliedBatches: [], byModel: [] } });
const settings = createFakeModel('aicreditsettings', { unique: [['key']] });
const organizations = createFakeModel('organizations');
const plans = createFakeModel('packages');
stub('api-server/models/aiCreditWallet.model.js', wallets);
stub('api-server/models/aiCreditTransaction.model.js', transactions);
stub('api-server/models/aiUsageLog.model.js', usageLogs);
stub('api-server/models/aiUsageDailySummary.model.js', summaries);
stub('api-server/models/aiCreditSetting.model.js', settings);
stub('api-server/models/organization.model.js', organizations);
stub('api-server/models/packages.model.js', plans);
stub('winston/utility/logger.js', { write_logs: () => {} });

const service = require('../api-server/services/aiCredits/aiCredit.service');
const retention = require('../api-server/services/aiCredits/aiUsageRetention.service');
const report = require('../api-server/services/aiCredits/aiCreditReport.service');

const NOW = new Date('2026-11-27T10:00:00Z');
const orgA = new mongoose.Types.ObjectId();
const orgB = new mongoose.Types.ObjectId();
const asha = new mongoose.Types.ObjectId();
const rahul = new mongoose.Types.ObjectId();
let n = 0;

/** A finished request log, `daysAgo` days before NOW. */
const log = (daysAgo, over = {}) => {
  n += 1;
  const credits = over.credits ?? 10;
  return usageLogs.create({
    requestId: `req-${n}`,
    organizationId: orgA,
    walletId: new mongoose.Types.ObjectId(),
    userId: asha,
    feature: 'AI_ASSISTANT',
    status: 'SETTLED',
    reservedCredits: 20,
    credits,
    meteredCredits: credits,
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    images: 0,
    models: ['claude-haiku-5-5'],
    calls: [{ provider: 'anthropic', model: 'claude-haiku-5-5', inputTokens: 1000, outputTokens: 500, credits }],
    createdAt: new Date(NOW.getTime() - daysAgo * 86400000),
    ...over,
  });
};
const setRetention = (days) => settings.findOneAndUpdate({ key: 'global' }, { $set: { usageLogRetentionDays: days } }, { upsert: true });
const run = (opts = {}) => retention.runUsageLogRetention({ now: NOW, ...opts });
const sum = (rows, f) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);

beforeEach(async () => {
  for (const m of [wallets, transactions, usageLogs, summaries, settings, organizations, plans]) m.reset();
  service._resetSettingsCache();
  n = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
describe('retention setting', () => {
  test('defaults to 90 days; 0 and whole days up to 3,650 are accepted', async () => {
    assert.equal((await service.getSettings({ fresh: true })).usageLogRetentionDays, 90);
    for (const ok of [0, 30, 60, 90, '45', 3650]) assert.deepEqual(service.validateSettingsInput({ usageLogRetentionDays: ok }), [], String(ok));
    for (const bad of [-1, 1.5, '', null, 'abc', 3651]) assert.match(service.validateSettingsInput({ usageLogRetentionDays: bad }).join(), /usageLogRetentionDays must be a whole number from 0 to 3650/, String(bad));
    const saved = await service.updateSettings({ usageLogRetentionDays: 30 }, null);
    assert.equal(saved.usageLogRetentionDays, 30);
    const zero = await service.updateSettings({ usageLogRetentionDays: 0 }, null);
    assert.equal(zero.usageLogRetentionDays, 0);
  });

  test('cutoff keeps today plus the previous days-1 whole UTC days', () => {
    assert.equal(retention.retentionCutoff(30, NOW).toISOString(), '2026-10-29T00:00:00.000Z');
    assert.equal(retention.retentionCutoff(1, NOW).toISOString(), '2026-11-27T00:00:00.000Z');
  });
});

describe('combining old logs into daily totals', () => {
  test('one daily total per user, AI model, feature and outcome, with exact totals', async () => {
    await setRetention(30);
    // 40 days ago: 3 requests by Asha on the same model, 1 by Rahul, 1 on two models, 1 not charged
    await log(40, { credits: 10, inputTokens: 1000, outputTokens: 500, totalTokens: 1500 });
    await log(40, { credits: 12.5, inputTokens: 2000, outputTokens: 700, totalTokens: 2700 });
    await log(40, { credits: 7.25, inputTokens: 300, outputTokens: 100, totalTokens: 400 });
    await log(40, { userId: rahul, credits: 4 });
    await log(40, {
      feature: 'LISTING_OPTIMIZATION',
      models: ['gpt-4o-mini', 'gemini-3.8-flash'],
      credits: 9,
      inputTokens: 5000,
      outputTokens: 2000,
      totalTokens: 7000,
      calls: [
        { model: 'gemini-3.8-flash', inputTokens: 4000, outputTokens: 1500, credits: 7 },
        { model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 500, credits: 3 },
      ],
    });
    await log(40, { status: 'RELEASED', credits: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, failureReason: 'AI error' });
    // Kept: inside the 30 days
    await log(5);
    await log(0);

    const result = await run();
    assert.equal(result.failed, null);
    assert.deepEqual([result.enabled, result.logsCombined, result.logsDeleted, result.dailyTotals], [true, 6, 6, 4]);

    const ashaAssistant = summaries.docs.find((s) => String(s.userId) === String(asha) && s.feature === 'AI_ASSISTANT' && s.status === 'SETTLED');
    assert.deepEqual(
      [ashaAssistant.requests, ashaAssistant.credits, ashaAssistant.inputTokens, ashaAssistant.outputTokens, ashaAssistant.totalTokens, ashaAssistant.modelKey],
      [3, 29.75, 3300, 1300, 4600, 'claude-haiku-5-5']
    );
    assert.equal(ashaAssistant.day.toISOString(), '2026-10-18T00:00:00.000Z');
    const two = summaries.docs.find((s) => s.feature === 'LISTING_OPTIMIZATION');
    assert.deepEqual([two.modelKey, two.models, two.requests, two.credits], ['gemini-3.8-flash, gpt-4o-mini', ['gemini-3.8-flash', 'gpt-4o-mini'], 1, 9]);
    assert.deepEqual(two.byModel.map((m) => [m.model, m.calls, m.inputTokens, m.credits]), [['gemini-3.8-flash', 1, 4000, 7], ['gpt-4o-mini', 1, 1000, 3]]);
    const notCharged = summaries.docs.find((s) => s.status === 'RELEASED');
    assert.deepEqual([notCharged.requests, notCharged.credits], [1, 0]);

    // Totals across all daily records equal the deleted logs
    assert.equal(sum(summaries.docs, 'requests'), 6);
    assert.equal(sum(summaries.docs, 'credits'), 10 + 12.5 + 7.25 + 4 + 9);
    // Recent logs are untouched
    assert.equal(usageLogs.docs.length, 2);
    assert.ok(usageLogs.docs.every((l) => l.aggregationBatch === null));
  });

  test('retention 0 turns combining and deleting off', async () => {
    await setRetention(0);
    await log(400);
    await log(40);
    const result = await run();
    assert.deepEqual([result.enabled, result.logsCombined, result.logsDeleted, result.cutoff], [false, 0, 0, null]);
    assert.deepEqual([usageLogs.docs.length, summaries.docs.length], [2, 0]);
  });

  test('unfinished requests are never combined; they are picked up once they finish', async () => {
    await setRetention(30);
    const pending = await log(40, { status: 'RESERVED', credits: 0, deferred: true });
    await log(40);
    await run();
    assert.equal(usageLogs.docs.length, 1);
    assert.equal(usageLogs.docs[0].status, 'RESERVED');
    // The background job finishes later: it joins the same daily total in a later run
    await usageLogs.updateOne({ _id: pending._id }, { $set: { status: 'SETTLED', credits: 15 } });
    await run();
    const total = summaries.docs.filter((s) => s.status === 'SETTLED');
    assert.equal(total.length, 1);
    assert.deepEqual([total[0].requests, total[0].credits, total[0].backgroundRequests, total[0].appliedBatches.length], [2, 25, 1, 2]);
    assert.equal(usageLogs.docs.length, 0);
  });

  test('running again adds nothing twice', async () => {
    await setRetention(30);
    for (let i = 0; i < 5; i += 1) await log(31 + i);
    await run();
    const before = summaries.docs.map((s) => [String(s.day), s.requests, s.credits]);
    const again = await run();
    assert.deepEqual([again.logsCombined, again.batches], [0, 0]);
    assert.deepEqual(summaries.docs.map((s) => [String(s.day), s.requests, s.credits]), before);
  });

  test('a day split over several batches ends up in one daily total', async () => {
    await setRetention(30);
    for (let i = 0; i < 10; i += 1) await log(45, { credits: 1.1 });
    const result = await run({ batchSize: 3 });
    assert.equal(result.batches, 4);
    assert.equal(summaries.docs.length, 1);
    // Credits are added per batch like MongoDB's $inc on doubles; reports round to 2 decimals
    assert.deepEqual([summaries.docs[0].requests, Math.round(summaries.docs[0].credits * 1e4) / 1e4, summaries.docs[0].appliedBatches.length], [10, 11, 4]);
    assert.equal(usageLogs.docs.length, 0);
  });

  test('two runs at the same time never count a request twice', async () => {
    await setRetention(30);
    for (let i = 0; i < 12; i += 1) await log(31 + (i % 3), { userId: i % 2 ? asha : rahul });
    const [a, b] = await Promise.all([run({ batchSize: 4 }), run({ batchSize: 4 })]);
    assert.equal(a.logsCombined + b.logsCombined, 12);
    assert.equal(sum(summaries.docs, 'requests'), 12);
    assert.equal(sum(summaries.docs, 'credits'), 120);
    assert.equal(usageLogs.docs.length, 0);
  });

  test('logs another run claims between finding and claiming are left to that run', async () => {
    await setRetention(30);
    for (let i = 0; i < 3; i += 1) await log(40);
    const realUpdateMany = usageLogs.updateMany;
    usageLogs.updateMany = async (filter, update) => {
      // Another run claims the same logs first (it is still working on them)
      await realUpdateMany({ _id: filter._id }, { $set: { aggregationBatch: 'ret_other', aggregationClaimedAt: NOW } });
      return realUpdateMany(filter, update);
    };
    let result;
    try {
      result = await run();
    } finally {
      usageLogs.updateMany = realUpdateMany;
    }
    assert.deepEqual([result.logsCombined, result.failed, summaries.docs.length], [0, null, 0]);
    assert.ok(usageLogs.docs.every((l) => l.aggregationBatch === 'ret_other'));
  });

  test('if a run stops after saving the totals but before deleting, the next run finishes without double counting', async () => {
    await setRetention(30);
    for (let i = 0; i < 4; i += 1) await log(40);
    const realDelete = usageLogs.deleteMany;
    usageLogs.deleteMany = async () => {
      throw new Error('connection lost');
    };
    const first = await run();
    usageLogs.deleteMany = realDelete;
    assert.match(first.failed, /connection lost/);
    assert.equal(usageLogs.docs.length, 4); // kept, still claimed
    assert.equal(summaries.docs[0].requests, 4);

    // Too soon: another run may still be working on that batch, so it is left alone
    const soon = await run();
    assert.deepEqual([soon.recoveredBatches, usageLogs.docs.length], [0, 4]);

    const later = await retention.runUsageLogRetention({ now: new Date(NOW.getTime() + 31 * 60000) });
    assert.deepEqual([later.recoveredBatches, later.logsDeleted, later.failed], [1, 4, null]);
    assert.equal(usageLogs.docs.length, 0);
    assert.equal(summaries.docs.length, 1);
    assert.equal(summaries.docs[0].requests, 4); // not 8
  });

  test('logs are not deleted when the daily totals cannot be verified', async () => {
    await setRetention(30);
    await log(40);
    await log(41);
    const realCount = summaries.countDocuments;
    summaries.countDocuments = async () => 0;
    const result = await run();
    summaries.countDocuments = realCount;
    assert.match(result.failed, /daily totals saved/);
    assert.equal(usageLogs.docs.length, 2);
  });

  test('nothing is combined until the daily totals have their unique index', async () => {
    await setRetention(30);
    await log(40);
    const real = summaries.createIndexes;
    summaries.createIndexes = async () => {
      throw new Error('not primary');
    };
    retention._resetIndexesForTests();
    const r = await run();
    summaries.createIndexes = real;
    retention._resetIndexesForTests();
    assert.match(r.failed, /indexes not ready: not primary/);
    assert.deepEqual([usageLogs.docs.length, summaries.docs.length, usageLogs.docs[0].aggregationBatch], [1, 0, null]);
    const ok = await run();
    assert.deepEqual([ok.failed, ok.logsDeleted], [null, 1]);
  });

  test('wallet transactions are never touched', async () => {
    await setRetention(30);
    await transactions.create({ organizationId: orgA, type: 'DEDUCTION', credits: -10, dedupeKey: 'deduct:req-old', createdAt: new Date(NOW.getTime() - 200 * 86400000) });
    await transactions.create({ organizationId: orgA, type: 'PURCHASE', credits: 500, dedupeKey: 'purchase:p1', createdAt: new Date(NOW.getTime() - 300 * 86400000) });
    await log(200);
    await run();
    assert.equal(usageLogs.docs.length, 0);
    assert.equal(transactions.docs.length, 2);
  });

  test("requests on the organization's own key and on the wallet stay separate daily totals", async () => {
    await setRetention(30);
    await log(40, { keySource: 'PERSONAL', credits: 0 });
    await log(40, { keySource: 'PERSONAL', credits: 0 });
    await log(40);
    await run();
    const own = summaries.docs.find((s) => s.keySource === 'PERSONAL');
    const wallet = summaries.docs.find((s) => s.keySource === 'PLATFORM');
    assert.deepEqual([own.requests, own.credits, wallet.requests, wallet.credits], [2, 0, 1, 10]);
  });

  test('organizations and days stay separate', async () => {
    await setRetention(30);
    await log(40);
    await log(40, { organizationId: orgB });
    await log(41);
    await run();
    assert.equal(summaries.docs.length, 3);
  });
});

describe('usage history and reports include the daily totals', () => {
  test('daily view lists the combined records, newest day first, with the same filters', async () => {
    await setRetention(30);
    await log(40, { credits: 5 });
    await log(42, { feature: 'CAMPAIGN_ANALYSIS', models: ['gemini-3.8-flash'], credits: 3 });
    await log(42, { status: 'RELEASED', credits: 0 });
    await run();
    const all = await report.listUsage({ view: 'daily' }, { organizationId: orgA });
    assert.equal(all.view, 'daily');
    assert.equal(all.totalRecords, 3);
    assert.equal(new Date(all.data[0].day).toISOString(), '2026-10-18T00:00:00.000Z');
    assert.deepEqual(Object.keys(all.data[0]).sort(), ['_id', 'backgroundRequests', 'credits', 'day', 'feature', 'images', 'inputTokens', 'keySource', 'models', 'organization', 'outputTokens', 'requests', 'status', 'totalTokens', 'user'].sort());
    assert.equal(all.data[0].keySource, 'PLATFORM');
    const charged = await report.listUsage({ view: 'daily', status: 'SETTLED', feature: 'CAMPAIGN_ANALYSIS' }, { organizationId: orgA });
    assert.deepEqual(charged.data.map((r) => [r.feature, r.requests, r.credits]), [['CAMPAIGN_ANALYSIS', 1, 3]]);
    const other = await report.listUsage({ view: 'daily' }, { organizationId: orgB });
    assert.equal(other.totalRecords, 0);
    // Request view is unchanged
    const requests = await report.listUsage({}, { organizationId: orgA });
    assert.equal(requests.view, undefined);
  });

  test("this month's charts add the daily totals to the request logs", async () => {
    const realRaw = usageLogs.aggregate;
    const realDaily = summaries.aggregate;
    usageLogs.aggregate = async (p) => (typeof p[1].$group._id === 'object' && '$dateToString' in p[1].$group._id ? [{ _id: '2026-11-20', credits: 5, requests: 1 }] : [{ _id: 'AI_ASSISTANT', credits: 5, requests: 1, inputTokens: 100, outputTokens: 10 }]);
    summaries.aggregate = async (p) =>
      typeof p[1].$group._id === 'object' && '$dateToString' in p[1].$group._id
        ? [{ _id: '2026-11-01', credits: 30, requests: 6 }, { _id: '2026-11-20', credits: 1, requests: 1 }]
        : [{ _id: 'AI_ASSISTANT', credits: 30, requests: 6, inputTokens: 900, outputTokens: 90 }, { _id: 'CAMPAIGN_ANALYSIS', credits: 40, requests: 2, inputTokens: 50, outputTokens: 5 }];
    try {
      const b = await report.periodBreakdown(orgA, { periodStart: '2026-11-01T00:00:00Z', nextResetAt: '2026-12-01T00:00:00Z' });
      assert.deepEqual(b.byFeature.map((f) => [f.feature, f.credits, f.requests, f.inputTokens]), [['CAMPAIGN_ANALYSIS', 40, 2, 50], ['AI_ASSISTANT', 35, 7, 1000]]);
      assert.deepEqual(b.byDay, [{ date: '2026-11-01', credits: 30, requests: 6 }, { date: '2026-11-20', credits: 6, requests: 2 }]);
    } finally {
      usageLogs.aggregate = realRaw;
      summaries.aggregate = realDaily;
    }
  });

  test('daily totals use the same status filter as the request charts (charged only)', async () => {
    const pipelines = [];
    const realDaily = summaries.aggregate;
    summaries.aggregate = async (p) => (pipelines.push(p), []);
    try {
      await report.periodBreakdown(orgA, { periodStart: '2026-11-01T00:00:00Z', nextResetAt: '2026-12-01T00:00:00Z' });
      await report.getAdminOverview({});
    } finally {
      summaries.aggregate = realDaily;
    }
    const matches = pipelines.map((p) => p[0].$match);
    assert.ok(matches.length >= 7);
    assert.ok(matches.every((m) => m.day));
    // Only the overall totals include not-charged requests (to count them)
    assert.equal(matches.filter((m) => !m.status).length, 1);
  });

  test('mergeRows adds matching keys and keeps the top N', () => {
    const rows = report.mergeRows([[{ _id: 'a', credits: 1, requests: 1 }, { _id: 'b', credits: 5, requests: 2 }], [{ _id: 'a', credits: 10, requests: 3 }, { _id: 'c', credits: 2, requests: 1 }]], ['credits', 'requests'], { sortBy: 'credits', limit: 2 });
    assert.deepEqual(rows, [{ _id: 'a', credits: 11, requests: 4 }, { _id: 'b', credits: 5, requests: 2 }]);
  });

  test('demo accounts get sample daily totals and the retention setting', () => {
    const mock = require('../api-server/services/aiCredits/aiCredit.mock');
    const d = mock.usage({ view: 'daily', perPage: 5 });
    assert.equal(d.view, 'daily');
    assert.equal(d.data.length, 5);
    assert.ok(d.data.every((r) => r.requests > 0 && r.day instanceof Date));
    assert.equal(mock.summary().usageLogRetentionDays, 90);
  });
});

describe('scheduled job wiring', () => {
  test('AI Usage Log Retention runs daily on the sp-api queue and fails the job when a batch stops', () => {
    const { resolveMigratedSchedule } = require('../queue-service/scheduler/scheduleRegistry');
    const { SP_API_TASKS } = require('../queue-service/queues/queueNames');
    assert.deepEqual(resolveMigratedSchedule('AI Usage Log Retention'), { queue: 'sp-api-queue', task: SP_API_TASKS.AI_USAGE_LOG_RETENTION, family: 'sp-api' });
    const scheduler = fs.readFileSync(path.join(root, 'queue-service/scheduler/index.js'), 'utf8');
    assert.match(scheduler, /cronName: "AiUsageLogRetention".*AI_USAGE_LOG_RETENTION_CRON \|\| "0 20 3 \* \* \*"/);
    const processor = fs.readFileSync(path.join(root, 'queue-service/processors/spApi.processor.js'), 'utf8');
    assert.match(processor, /case SP_API_TASKS\.AI_USAGE_LOG_RETENTION:[\s\S]*cronAiUsageLogRetention\(\)[\s\S]*if \(result\?\.failed\) throw/);
  });

  test('the cron entry point runs the job with the saved setting', async () => {
    const controller = require('../api-server/controllers/aiCredit.controller');
    await setRetention(0);
    const r = await controller.cronAiUsageLogRetention();
    assert.deepEqual([r.enabled, r.retentionDays], [false, 0]);
  });

  test('request logs no longer expire on their own (a TTL would ignore the retention setting)', () => {
    const src = fs.readFileSync(path.join(root, 'api-server/models/aiUsageLog.model.js'), 'utf8');
    assert.doesNotMatch(src, /expireAfterSeconds/);
  });
});
