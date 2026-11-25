const assert = require('node:assert/strict');
const path = require('node:path');
const { test, describe, beforeEach } = require('node:test');

const root = path.join(__dirname, '..');
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

// ── Scheduler: built-in default schedules ──
const db = { docs: [], all: [] };
const scheduled = [];
stub('shared/connection.js', { closeMongoConnection: async () => {} });
stub('api-server/models/cronJob.model.js', {
  find: (q) => ({ lean: async () => db.docs.filter((d) => !q?.isActive || d.isActive) }),
  exists: async (q) => db.all.some((d) => q.cronName.$in.includes(d.cronName)),
});
stub('winston/cronAutomation/logger.js', { cron_logs: () => {} });
stub('shared/automationMode.js', { isQueueModeEnabled: () => true, isShadowModeEnabled: () => false });
stub('queue-service/producers/rules.producer.js', { enqueueRulesForOccurrence: async () => {} });
stub('queue-service/producers/hourlySync.producer.js', { enqueueSyncForOccurrence: async () => {} });
stub('queue-service/producers/spApi.producer.js', { enqueueSpApiForOccurrence: async () => {} });
stub('queue-service/config/bullmq.config.js', { createRedisClient: () => ({}) });
stub('queue-service/queues/queues.js', { closeQueues: async () => {} });
stub('queue-service/shutdown.js', { registerGracefulShutdown: () => {} });
const cronPath = require.resolve('node-cron', { paths: [path.join(root, 'queue-service')] });
require.cache[cronPath] = {
  id: cronPath, filename: cronPath, loaded: true,
  exports: { schedule: (expression, fn) => { const job = { expression, stopped: false, stop() { job.stopped = true; } }; scheduled.push(job); return job; }, validate: () => true },
};

const { loadSchedules } = require('../queue-service/scheduler/index');
const { SP_API_TASKS } = require('../queue-service/queues/queueNames');
const { resolveMigratedSchedule } = require('../queue-service/scheduler/scheduleRegistry');

const active = () => scheduled.filter((j) => !j.stopped).map((j) => j.expression).sort();

describe('AI credit maintenance schedule', () => {
  beforeEach(async () => {
    // stop everything from the previous test
    db.docs = [];
    db.all = [{ cronName: 'HourlyDataConsolidation' }, { cronName: 'AdBlackoutMonitor' }, { cronName: 'AI Credit Maintenance' }];
    await loadSchedules();
    scheduled.length = 0;
  });

  test('"AI Credit Maintenance" maps to the SP-API maintenance task', () => {
    assert.deepEqual(resolveMigratedSchedule('AI Credit Maintenance'), { queue: 'sp-api-queue', task: SP_API_TASKS.AI_CREDIT_MAINTENANCE, family: 'sp-api' });
  });

  test('runs hourly at :05 with no cron doc in MongoDB, alongside the other built-in jobs', async () => {
    db.all = [];
    await loadSchedules();
    assert.deepEqual(active(), ['0 30 2 * * *', '0 40 * * * *', '0 5 * * * *'].sort());
  });

  test('an inactive cron doc switches it off', async () => {
    db.all = [{ cronName: 'AI Credit Maintenance', isActive: false }];
    await loadSchedules();
    assert.ok(!active().includes('0 5 * * * *'));
    assert.ok(active().includes('0 40 * * * *'));
  });

  test('an active cron doc sets its own schedule', async () => {
    db.docs = [{ cronName: 'AI Credit Maintenance', cronExpression: '0 0 * * * *', isActive: true }];
    db.all = [...db.docs];
    await loadSchedules();
    assert.ok(active().includes('0 0 * * * *'));
    assert.ok(!active().includes('0 5 * * * *'));
  });
});

// ── Audit: Super Admin credit actions are recorded ──
describe('audit log for Super Admin AI credit actions', () => {
  const { events } = require('../api-server/constants/auditEvents');
  const { eventForRoute } = require('../api-server/constants/auditRouteEvents');

  test('the three admin actions are known audit events, mapped to their routes', () => {
    for (const e of ['AI_CREDIT_SETTINGS_UPDATED', 'AI_CREDITS_ADJUSTED', 'AI_CREDIT_LIMIT_UPDATED']) assert.ok(events.includes(e), e);
    assert.equal(eventForRoute('POST', '/api/ai-credits/admin/settings/update'), 'AI_CREDIT_SETTINGS_UPDATED');
    assert.equal(eventForRoute('POST', '/api/ai-credits/admin/adjust'), 'AI_CREDITS_ADJUSTED');
    assert.equal(eventForRoute('POST', '/api/ai-credits/admin/monthly-limit'), 'AI_CREDIT_LIMIT_UPDATED');
  });

  test('reading credits is not audited', () => {
    for (const p of ['/api/ai-credits/summary', '/api/ai-credits/usage', '/api/ai-credits/admin/overview', '/api/ai-credits/admin/settings']) assert.equal(eventForRoute('POST', p), undefined, p);
  });

  test('controllers hand the before/after values to the audit middleware', async () => {
    const wallet = (limit, source) => ({ monthlyLimit: limit, limitSource: source, allocated: limit, available: limit });
    stub('winston/utility/logger.js', { write_logs: () => {} });
    stub('api-server/services/aiCredits/aiCredit.service.js', {
      FEATURES: { AI_ASSISTANT: { key: 'AI_ASSISTANT', label: 'AI Assistant', reserve: 20 } },
      AiCreditsError: class extends Error {},
      getSettings: async () => ({ inputCreditsPer1K: 1 }),
      updateSettings: async () => ({ inputCreditsPer1K: 2 }),
      adjustCredits: async () => wallet(1100, 'PLAN'),
      getWallet: async () => ({}),
      walletView: () => wallet(1000, 'PLAN'),
      setMonthlyLimitOverride: async () => wallet(2000, 'OVERRIDE'),
    });
    stub('api-server/services/aiCredits/aiCreditReport.service.js', {});
    stub('api-server/services/aiCredits/aiCredit.mock.js', {});
    const c = require('../api-server/controllers/aiCredit.controller');
    const res = () => { const r = { status: () => r, json: (b) => ((r.body = b), r) }; return r; };
    const orgId = '64b7f0c2a1b2c3d4e5f60718';

    let req = { body: { inputCreditsPer1K: 2 }, user: { _id: 'u1' } };
    await c.adminUpdateSettings(req, res());
    assert.deepEqual([req.auditChange.previousValue.inputCreditsPer1K, req.auditChange.newValue.inputCreditsPer1K], [1, 2]);

    req = { body: { organizationId: orgId, credits: 100, note: 'Goodwill' }, user: { _id: 'u1' } };
    await c.adminAdjustCredits(req, res());
    assert.deepEqual([req.auditChange.organizationId, req.auditChange.metadata], [orgId, { credits: 100, note: 'Goodwill' }]);

    req = { body: { organizationId: orgId, monthlyLimit: 2000 }, user: { _id: 'u1' } };
    await c.adminSetMonthlyLimit(req, res());
    assert.deepEqual([req.auditChange.previousValue, req.auditChange.newValue], [{ monthlyLimit: 1000, limitSource: 'PLAN' }, { monthlyLimit: 2000, limitSource: 'OVERRIDE' }]);
  });
});
