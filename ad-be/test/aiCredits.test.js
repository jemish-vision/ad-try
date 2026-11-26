const assert = require('node:assert/strict');
const path = require('node:path');
const { test, describe, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { createFakeModel } = require('./helpers/fakeMongoModel');

const root = path.join(__dirname, '..');
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

// ── In-memory collections ──
const wallets = createFakeModel('aicreditwallets', { unique: [['organizationId']], defaults: { monthlyLimitOverride: null, reserved: 0, used: 0, lifetimeUsed: 0, lifetimeInputTokens: 0, lifetimeOutputTokens: 0 } });
const transactions = createFakeModel('aicredittransactions', { unique: [['dedupeKey']] });
const usageLogs = createFakeModel('aiusagelogs', { unique: [['requestId']] });
const settings = createFakeModel('aicreditsettings', { unique: [['key']] });
const organizations = createFakeModel('organizations');
const packages = createFakeModel('packages');
stub('api-server/models/aiCreditWallet.model.js', wallets);
stub('api-server/models/aiCreditTransaction.model.js', transactions);
stub('api-server/models/aiUsageLog.model.js', usageLogs);
stub('api-server/models/aiCreditSetting.model.js', settings);
stub('api-server/models/organization.model.js', organizations);
stub('api-server/models/packages.model.js', packages);
const logs = [];
stub('winston/utility/logger.js', { write_logs: (l) => logs.push(l) });

const meterLib = require('../api-server/services/aiCredits/aiUsageMeter');
const service = require('../api-server/services/aiCredits/aiCredit.service');
const { withAiCredits, reserveAiCredits } = require('../api-server/services/aiCredits/withAiCredits');
const background = require('../api-server/services/aiCredits/backgroundHolds');
const mock = require('../api-server/services/aiCredits/aiCredit.mock');
const { requestTurn } = require('../api-server/services/aiProvider.service');

const NOV = new Date('2026-11-25T10:00:00Z');
const DEC = new Date('2026-12-01T00:05:00Z');
let planId;
let orgId;

async function newOrg({ planCredits = 1000 } = {}) {
  const plan = await packages.create({ name: 'Pro', aiMonthlyCredits: planCredits });
  const org = await organizations.create({ organizationName: 'Acme', planId: plan._id });
  return { org, plan };
}
const call = (model, inputTokens, outputTokens, provider = 'openai') => ({ provider, model, inputTokens, outputTokens });
const walletOf = () => wallets.docs.find((w) => String(w.organizationId) === String(orgId));
const txTypes = () => transactions.docs.map((t) => t.type);

beforeEach(async () => {
  for (const m of [wallets, transactions, usageLogs, settings, organizations, packages]) m.reset();
  service._resetSettingsCache();
  logs.length = 0;
  const { org, plan } = await newOrg();
  orgId = org._id;
  planId = plan._id;
});

describe('token tracking', () => {
  test('Anthropic cache tokens count as input; OpenAI/Gemini prompt counts already include them', () => {
    assert.equal(meterLib.normalizeUsage({ provider: 'anthropic', inputTokens: 100, cacheReadInputTokens: 900, cacheCreationInputTokens: 50, outputTokens: 20 }).inputTokens, 1050);
    assert.equal(meterLib.normalizeUsage({ provider: 'openai', inputTokens: 1000, cacheReadInputTokens: 900, outputTokens: 20 }).inputTokens, 1000);
  });

  test('reads usage from raw OpenAI, Gemini (thinking tokens = output) and Anthropic responses', () => {
    assert.deepEqual(meterLib.normalizeUsage(meterLib.usageFromResponse('openai', 'gpt-4o-mini', { model: 'gpt-4o-mini-2024', usage: { prompt_tokens: 1200, completion_tokens: 300 } })), { provider: 'openai', model: 'gpt-4o-mini-2024', inputTokens: 1200, outputTokens: 300, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, images: 0 });
    const g = meterLib.normalizeUsage(meterLib.usageFromResponse('gemini', 'gemini-3.8-flash', { usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 1500, thoughtsTokenCount: 500 } }));
    assert.deepEqual([g.inputTokens, g.outputTokens], [4000, 2000]);
    const a = meterLib.normalizeUsage(meterLib.usageFromResponse('anthropic', 'claude-haiku-5-5', { usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90 } }));
    assert.deepEqual([a.inputTokens, a.outputTokens], [100, 5]);
  });

  test('recording only happens inside a metered request, and not inside runOutsideAiMeter', async () => {
    assert.equal(meterLib.recordAiUsage(call('m', 10, 10)), false);
    const meter = { calls: [] };
    await meterLib.runWithAiMeter(meter, async () => {
      await Promise.resolve();
      meterLib.recordAiUsage(call('m', 10, 10));
      meterLib.runOutsideAiMeter(() => meterLib.recordAiUsage(call('internal', 999, 999)));
      meterLib.recordAiUsage(call('m', 0, 0)); // empty usage ignored
    });
    assert.deepEqual(meter.calls.map((c) => c.model), ['m']);
  });

  test('the shared AI provider layer holds credits before the call and records tokens after', async () => {
    const order = [];
    const meter = { calls: [], reserve: async () => order.push('reserve') };
    const client = { messages: { create: async (payload) => { order.push('call'); return { model: payload.model, content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 300 } }; } } };
    await meterLib.runWithAiMeter(meter, () => requestTurn({ messages: [{ role: 'user', content: 'hi' }], options: { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'test' } }, client));
    assert.deepEqual(order, ['reserve', 'call']);
    assert.deepEqual(meter.calls, [{ provider: 'anthropic', model: 'claude-haiku-5-5', inputTokens: 1500, outputTokens: 80, cacheReadInputTokens: 300, cacheCreationInputTokens: 0, images: 0 }]);
  });
});

describe('credit calculation', () => {
  const s = service.normalizeSettings({ inputCreditsPer1K: 1, outputCreditsPer1K: 4, modelRates: [{ model: 'gpt-4o', inputCreditsPer1K: 2, outputCreditsPer1K: 8 }, { model: 'gpt-4o-mini', inputCreditsPer1K: 0.2, outputCreditsPer1K: 0.8 }] });

  test('longest matching model rate wins; unknown models use the defaults', () => {
    assert.equal(service.rateForModel('gpt-4o-mini-2024-07-18', s).matched, 'gpt-4o-mini');
    assert.equal(service.rateForModel('gpt-4o-2024', s).matched, 'gpt-4o');
    assert.deepEqual(service.rateForModel('claude-haiku-5-5', s), { inputCreditsPer1K: 1, outputCreditsPer1K: 4, matched: null });
  });

  test('cost = input/1K × input rate + output/1K × output rate, summed and rounded to 0.01', () => {
    const p = service.priceCalls([call('claude-x', 12000, 900), call('gpt-4o-mini', 1500, 500)], s);
    // 12 + 3.6 = 15.6 ; 0.3 + 0.4 = 0.7
    assert.equal(p.credits, 16.3);
    assert.deepEqual([p.inputTokens, p.outputTokens, p.totalTokens], [13500, 1400, 14900]);
    assert.deepEqual(p.models, ['claude-x', 'gpt-4o-mini']);
  });

  test('minimum charge applies only when AI was used', () => {
    const withMin = { ...s, minimumChargePerRequest: 1 };
    assert.equal(service.priceCalls([call('claude-x', 10, 10)], withMin).credits, 1);
    assert.equal(service.priceCalls([], withMin).credits, 0);
  });
});

describe('wallet', () => {
  test('first use creates the wallet with the plan allowance and logs the allocation', async () => {
    const w = service.walletView(await service.getWallet(orgId, { now: NOV }));
    assert.deepEqual([w.monthlyLimit, w.limitSource, w.available, w.used], [1000, 'PLAN', 1000, 0]);
    assert.equal(new Date(w.periodStart).toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(new Date(w.nextResetAt).toISOString(), '2026-12-01T00:00:00.000Z');
    assert.deepEqual(txTypes(), ['ALLOCATION']);
  });

  test('plan without an allowance uses the global default', async () => {
    const { org } = await newOrg({ planCredits: null });
    await settings.create({ key: 'global', defaultMonthlyCredits: 250 });
    service._resetSettingsCache();
    const w = await service.getWallet(org._id, { now: NOV });
    assert.deepEqual([w.monthlyLimit, w.limitSource], [250, 'DEFAULT']);
  });

  test('concurrent first use creates exactly one wallet and one allocation', async () => {
    await Promise.all(Array.from({ length: 6 }, () => service.getWallet(orgId, { now: NOV })));
    assert.equal(wallets.docs.length, 1);
    assert.deepEqual(txTypes(), ['ALLOCATION']);
  });

  test('hold, then charge actual tokens: balance, used, ledger and usage log line up', async () => {
    const hold = await service.reserve({ organizationId: orgId, userId: new mongoose.Types.ObjectId(), feature: 'AI_ASSISTANT', requestId: 'r1', now: NOV });
    assert.equal(hold.amount, 51);
    assert.deepEqual([walletOf().balance, walletOf().reserved], [949, 51]);

    const r = await service.settle(hold, [call('claude-x', 12000, 900, 'anthropic')]);
    assert.equal(r.credits, 15.6);
    const w = walletOf();
    assert.deepEqual([w.balance, w.used, w.reserved, w.lifetimeInputTokens, w.lifetimeOutputTokens], [984.4, 15.6, 0, 12000, 900]);
    const deduction = transactions.docs.find((t) => t.type === 'DEDUCTION');
    assert.deepEqual([deduction.credits, deduction.balanceAfter, deduction.feature], [-15.6, 984.4, 'AI_ASSISTANT']);
    const log = usageLogs.docs[0];
    assert.deepEqual([log.status, log.credits, log.inputTokens, log.outputTokens, log.totalTokens], ['SETTLED', 15.6, 12000, 900, 12900]);
    assert.deepEqual(log.models, ['claude-x']);
  });

  test('settling the same request twice charges once', async () => {
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'r2', now: NOV });
    await Promise.all([service.settle(hold, [call('m', 5000, 0)]), service.settle(hold, [call('m', 5000, 0)])]);
    assert.deepEqual(await service.release(hold, 'x'), { released: false });
    assert.equal(walletOf().used, 5);
    assert.equal(walletOf().balance, 995);
    assert.equal(transactions.docs.filter((t) => t.type === 'DEDUCTION').length, 1);
  });

  test('failed request: hold returned, nothing charged, tokens still logged', async () => {
    const hold = await service.reserve({ organizationId: orgId, feature: 'LISTING_OPTIMIZATION', requestId: 'r3', now: NOV });
    await service.release(hold, 'AI provider error', [call('gemini', 4000, 0)]);
    assert.deepEqual([walletOf().balance, walletOf().used, walletOf().reserved], [1000, 0, 0]);
    const log = usageLogs.docs[0];
    assert.deepEqual([log.status, log.credits, log.inputTokens, log.failureReason], ['RELEASED', 0, 4000, 'AI provider error']);
    assert.equal(transactions.docs.filter((t) => t.type === 'DEDUCTION').length, 0);
  });

  test('not enough credits: request is refused with the wallet state', async () => {
    await service.getWallet(orgId, { now: NOV });
    await service.adjustCredits({ organizationId: orgId, credits: -990, note: 'test', now: NOV }); // 10 left, hold is 51
    await assert.rejects(service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'r4', now: NOV }), (e) => e.code === 'AI_CREDITS_EXHAUSTED' && e.statusCode === 402 && e.details.wallet.available === 10 && e.details.required === 51);
    assert.equal(usageLogs.docs.length, 0);
  });

  test('a zero hold still needs a positive balance', async () => {
    await settings.create({ key: 'global', featureReserves: { AI_ASSISTANT: 0 } });
    service._resetSettingsCache();
    await service.getWallet(orgId, { now: NOV });
    await service.adjustCredits({ organizationId: orgId, credits: -1000, note: 'drain', now: NOV });
    await assert.rejects(service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'r5', now: NOV }), { code: 'AI_CREDITS_EXHAUSTED' });
  });

  test('concurrent requests cannot overspend: 10 requests, credits for 5', async () => {
    await service.getWallet(orgId, { now: NOV });
    await service.adjustCredits({ organizationId: orgId, credits: -745, note: 'leave 255', now: NOV }); // 5 × 51
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: `c${i}`, now: NOV })));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
    assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'AI_CREDITS_EXHAUSTED'));
    assert.deepEqual([walletOf().balance, walletOf().reserved], [0, 255]);
  });

  test('a repeated request id is refused and its hold returned', async () => {
    await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'same', now: NOV });
    await assert.rejects(service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'same', now: NOV }), { code: 'DUPLICATE_AI_REQUEST' });
    assert.deepEqual([walletOf().balance, walletOf().reserved], [949, 51]);
  });

  test('enforcement off: never blocks or charges, but usage is still tracked', async () => {
    await settings.create({ key: 'global', enforcementEnabled: false });
    service._resetSettingsCache();
    await service.getWallet(orgId, { now: NOV });
    await service.adjustCredits({ organizationId: orgId, credits: -1000, note: 'drain', now: NOV });
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'off', now: NOV });
    await service.settle(hold, [call('m', 3000, 0)]);
    assert.deepEqual([walletOf().balance, walletOf().used], [0, 0]);
    const log = usageLogs.docs[0];
    assert.deepEqual([log.enforced, log.credits, log.meteredCredits, log.inputTokens], [false, 0, 3, 3000]);
  });

  test('settlement caps all features at the confirmed hold and records full metered cost', async () => {
    await service.updateSettings({ modelRates: [{ model: 'claude-haiku-5-5', inputCreditsPer1K: 0.1, outputCreditsPer1K: 0.5 }] });
    const features = Object.keys(service.FEATURES);
    await service.adjustCredits({ organizationId: orgId, credits: -989, note: 'Leave exactly five holds', now: NOV });
    const holds = await Promise.all(features.map(feature => service.reserve({
      organizationId: orgId, feature, requestId: feature, amount: 2.2, now: NOV,
    })));
    const settled = await Promise.all(holds.map(hold => service.settle(
      { ...hold, amount: 100 }, [call('claude-haiku-5-5', 22132, 1433, 'anthropic')], { now: NOV },
    )));
    for (const result of settled) assert.deepEqual([result.credits, result.meteredCredits], [2.2, 2.93]);
    assert.deepEqual([service.walletView(walletOf()).available, walletOf().used, service.walletView(walletOf()).reserved], [0, 11, 0]);
    assert.equal(transactions.docs.filter(row => row.type === 'DEDUCTION' && row.credits === -2.2).length, features.length);
    assert.ok(usageLogs.docs.every(row => row.credits === 2.2 && row.meteredCredits === 2.93));
  });
});

describe('monthly reset', () => {
  test('a new month closes the old period and grants the allowance again', async () => {
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'n1', now: NOV });
    await service.settle(hold, [call('m', 50000, 0)]); // 50 credits
    const w = service.walletView(await service.getWallet(orgId, { now: DEC }));
    assert.deepEqual([w.allocated, w.used, w.available], [1000, 0, 1000]);
    assert.equal(new Date(w.periodStart).toISOString(), '2026-12-01T00:00:00.000Z');
    assert.equal(new Date(w.nextResetAt).toISOString(), '2027-01-01T00:00:00.000Z');
    const reset = transactions.docs.find((t) => t.type === 'RESET');
    assert.equal(reset.credits, -950); // 950 unused credits expired
    assert.deepEqual(txTypes(), ['ALLOCATION', 'DEDUCTION', 'RESET', 'ALLOCATION']);
  });

  test('many requests at the turn of the month reset the wallet exactly once', async () => {
    await service.getWallet(orgId, { now: NOV });
    await Promise.all(Array.from({ length: 8 }, () => service.getWallet(orgId, { now: DEC })));
    assert.equal(transactions.docs.filter((t) => t.type === 'RESET').length, 1);
    assert.equal(transactions.docs.filter((t) => t.type === 'ALLOCATION').length, 2);
  });

  test('a request running across the reset is charged to the new month', async () => {
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'x1', now: NOV });
    await service.getWallet(orgId, { now: DEC });
    assert.deepEqual([walletOf().balance, walletOf().reserved], [949, 51]); // hold carried over
    await service.settle(hold, [call('m', 10000, 0)]);
    assert.deepEqual([walletOf().balance, walletOf().used, walletOf().reserved], [990, 10, 0]);
  });

  test('a wallet idle for months resets straight to the current month', async () => {
    await service.getWallet(orgId, { now: new Date('2026-08-10T00:00:00Z') });
    const w = await service.getWallet(orgId, { now: DEC });
    assert.equal(new Date(w.periodStart).toISOString(), '2026-12-01T00:00:00.000Z');
  });

  test('scheduled maintenance resets due wallets and returns stale holds', async () => {
    await service.getWallet(orgId, { now: NOV });
    const other = (await newOrg({ planCredits: 300 })).org;
    await service.reserve({ organizationId: other._id, feature: 'AI_ASSISTANT', requestId: 'stuck', now: NOV });
    usageLogs.docs[0].createdAt = new Date(DEC.getTime() - 60 * 60 * 1000); // an hour old
    const r = await service.runMonthlyMaintenance({ now: DEC });
    assert.deepEqual(r, { reset: 2, expiredHolds: 1 });
    const w2 = wallets.docs.find((w) => String(w.organizationId) === String(other._id));
    assert.deepEqual([w2.balance, w2.reserved, w2.allocated], [300, 0, 300]);
    assert.equal(usageLogs.docs[0].status, 'EXPIRED');
  });
});

describe('Super Admin actions', () => {
  test('adjust credits adds to this period and needs a reason', async () => {
    await service.getWallet(orgId, { now: NOV });
    const w = await service.adjustCredits({ organizationId: orgId, credits: 150, note: 'Goodwill', actorId: new mongoose.Types.ObjectId(), now: NOV });
    assert.deepEqual([w.allocated, w.available], [1150, 1150]);
    const tx = transactions.docs.find((t) => t.type === 'ADJUSTMENT');
    assert.deepEqual([tx.credits, tx.note, tx.balanceAfter], [150, 'Goodwill', 1150]);
    await assert.rejects(service.adjustCredits({ organizationId: orgId, credits: 10, note: ' ', now: NOV }), { code: 'INVALID_ADJUSTMENT' });
    await assert.rejects(service.adjustCredits({ organizationId: orgId, credits: 0, note: 'x', now: NOV }), { code: 'INVALID_ADJUSTMENT' });
  });

  test('organization override takes effect now and survives the reset; clearing it goes back to the plan', async () => {
    const hold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'o1', now: NOV });
    await service.settle(hold, [call('m', 50000, 0)]); // used 50
    let w = await service.setMonthlyLimitOverride({ organizationId: orgId, limit: 2000, now: NOV });
    assert.deepEqual([w.monthlyLimit, w.limitSource, w.allocated, w.available, w.used], [2000, 'OVERRIDE', 2000, 1950, 50]);
    w = service.walletView(await service.getWallet(orgId, { now: DEC }));
    assert.deepEqual([w.allocated, w.limitSource], [2000, 'OVERRIDE']);
    w = await service.setMonthlyLimitOverride({ organizationId: orgId, limit: null, now: DEC });
    assert.deepEqual([w.monthlyLimit, w.limitSource, w.available], [1000, 'PLAN', 1000]);
  });

  test('a changed plan allowance applies from the next reset', async () => {
    await service.getWallet(orgId, { now: NOV });
    packages.docs.find((p) => String(p._id) === String(planId)).aiMonthlyCredits = 5000;
    assert.equal((await service.getWallet(orgId, { now: NOV })).allocated, 1000);
    assert.equal((await service.getWallet(orgId, { now: DEC })).allocated, 5000);
  });

  test('settings validation and update', async () => {
    assert.deepEqual(service.validateSettingsInput({ inputCreditsPer1K: -1, modelRates: [{ model: 'a', inputCreditsPer1K: 1, outputCreditsPer1K: 1 }, { model: 'A', inputCreditsPer1K: 1, outputCreditsPer1K: 1 }], featureReserves: { NOPE: 1 } }), ['inputCreditsPer1K must be 0 or more', 'modelRates has "A" twice', 'Unknown feature NOPE']);
    await assert.rejects(service.updateSettings({ outputCreditsPer1K: 'x' }), { code: 'INVALID_SETTINGS' });
    const s = await service.updateSettings({ inputCreditsPer1K: 0.5, modelRates: [{ model: ' gpt-4o ', inputCreditsPer1K: 2, outputCreditsPer1K: 6 }], featureReserves: { LISTING_OPTIMIZATION: 40 } });
    assert.deepEqual([s.inputCreditsPer1K, s.outputCreditsPer1K, s.modelRates[0].model, s.featureReserves.LISTING_OPTIMIZATION, s.featureReserves.AI_ASSISTANT], [0.5, 4, 'gpt-4o', 40, 33.5]);
    const hold = await service.reserve({ organizationId: orgId, feature: 'LISTING_OPTIMIZATION', requestId: 'cfg', now: NOV });
    assert.equal(hold.amount, 40);

    // Clearing featureReserves reverts all holds to dynamic worst-case estimation covering multi-turn calls
    const cleared = await service.updateSettings({
      modelRates: [
        { model: 'claude-haiku-5-5', inputCreditsPer1K: 0.1, outputCreditsPer1K: 0.5 },
        { model: 'gpt-4o-mini', inputCreditsPer1K: 0.15, outputCreditsPer1K: 0.6 },
        { model: 'gemini-3.8-flash', inputCreditsPer1K: 0.75, outputCreditsPer1K: 3.75 },
      ],
      featureReserves: {},
    });
    assert.equal(cleared.featureReserves.AI_ASSISTANT, 5.5);
    assert.equal(cleared.featureReserves.LISTING_GENERATION, 2.55);
    assert.equal(cleared.featureReserves.LISTING_OPTIMIZATION, 21.9);
    assert.equal(cleared.featureReserves.APLUS_CONTENT, 23.25);
    assert.equal(cleared.featureReserves.CAMPAIGN_ANALYSIS, 22.5);
    const dynHold = await service.reserve({ organizationId: orgId, feature: 'AI_ASSISTANT', requestId: 'dyn1', now: NOV });
    assert.equal(dynHold.amount, 5.5);
    const settled = await service.settle(dynHold, [call('claude-haiku-5-5', 22132, 1433, 'anthropic')]);
    assert.equal(settled.credits, 2.93);
    assert.ok(dynHold.amount >= settled.credits);
  });
});

describe('withAiCredits route wrapper', () => {
  const fakeRes = () => {
    const res = { statusCode: 200, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
    res.send = (b) => (typeof b === 'object' ? res.json(b) : res);
    return res;
  };
  const req = (extra = {}) => ({ organizationId: String(orgId), user: { _id: new mongoose.Types.ObjectId() }, headers: {}, body: {}, ...extra });
  const aiHandler = (tokens, result = { isSuccess: true }) => async (rq, rs) => {
    await rq.aiMeter.reserve();
    meterLib.recordAiUsage(call('gemini-x', tokens, 0, 'gemini'));
    return rs.status(200).json(result);
  };

  test('success: charged for the tokens used', async () => {
    await withAiCredits('LISTING_OPTIMIZATION', aiHandler(8000))(req(), fakeRes());
    assert.deepEqual([walletOf().used, walletOf().reserved, usageLogs.docs[0].status, usageLogs.docs[0].feature], [8, 0, 'SETTLED', 'LISTING_OPTIMIZATION']);
  });

  test('isSuccess: false, a 203 or an exception: nothing charged', async () => {
    await withAiCredits('AI_ASSISTANT', aiHandler(8000, { isSuccess: false, message: 'AI failed' }))(req(), fakeRes());
    await withAiCredits('AI_ASSISTANT', async (rq, rs) => { await rq.aiMeter.reserve(); meterLib.recordAiUsage(call('m', 5000, 0)); return rs.status(203).json({ message: 'x' }); })(req(), fakeRes());
    await assert.rejects(withAiCredits('AI_ASSISTANT', async (rq) => { await rq.aiMeter.reserve(); throw new Error('boom'); })(req(), fakeRes()), /boom/);
    assert.deepEqual([walletOf().used, walletOf().balance], [0, 1000]);
    assert.deepEqual(usageLogs.docs.map((l) => l.status), ['RELEASED', 'RELEASED', 'RELEASED']);
    assert.equal(usageLogs.docs[0].inputTokens, 8000);
  });

  test('a request that never needs AI (cached result) is not held, blocked or charged', async () => {
    await service.getWallet(orgId, { now: new Date() });
    await service.adjustCredits({ organizationId: orgId, credits: -1000, note: 'drain' });
    const res = fakeRes();
    await withAiCredits('LISTING_OPTIMIZATION', async (rq, rs) => rs.json({ isSuccess: true, fromCache: true }))(req(), res);
    assert.equal(res.body.fromCache, true);
    assert.equal(usageLogs.docs.length, 0);
  });

  test('AI calls through the shared provider layer hold credits automatically', async () => {
    const client = { messages: { create: async () => ({ model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 500 } }) } };
    await withAiCredits('AI_ASSISTANT', async (rq, rs) => {
      await requestTurn({ messages: [{ role: 'user', content: 'q' }], options: { provider: 'anthropic', apiKey: 'k' } }, client);
      return rs.json({ isSuccess: true });
    })(req(), fakeRes());
    assert.deepEqual([walletOf().used, usageLogs.docs[0].models[0]], [4, 'claude-haiku-5-5']); // 2 + 0.5×4
  });

  test('meter.finalize(res) settles before SSE done and stays idempotent in finally', async () => {
    let beforeDoneState = null;
    await withAiCredits('AI_ASSISTANT', async (rq, rs) => {
      await rq.aiMeter.reserve();
      meterLib.recordAiUsage(call('claude-haiku-5-5', 22132, 1433, 'anthropic'));
      await rq.aiMeter.finalize(rs);
      beforeDoneState = { used: walletOf().used, reserved: walletOf().reserved, balance: walletOf().balance };
      return rs.json({ isSuccess: true });
    })(req(), fakeRes());
    assert.deepEqual(beforeDoneState, { used: 27.86, reserved: 0, balance: 972.14 });
    assert.equal(transactions.docs.filter((t) => t.type === 'DEDUCTION').length, 1);
  });

  test('the same X-AI-Request-Id twice is charged once', async () => {
    const handler = async (rq, rs) => {
      try {
        await rq.aiMeter.reserve();
      } catch (e) {
        return rs.json({ isSuccess: false, code: e.code });
      }
      meterLib.recordAiUsage(call('m', 6000, 0));
      return rs.json({ isSuccess: true });
    };
    const r1 = fakeRes();
    const r2 = fakeRes();
    await Promise.all([withAiCredits('AI_ASSISTANT', handler)(req({ headers: { 'x-ai-request-id': 'click-123456' } }), r1), withAiCredits('AI_ASSISTANT', handler)(req({ headers: { 'x-ai-request-id': 'click-123456' } }), r2)]);
    assert.deepEqual([r1.body.isSuccess, r2.body.code].sort(), ['DUPLICATE_AI_REQUEST', true].sort());
    assert.equal(walletOf().used, 6);
  });

  test('demo users and requests without an organization are not metered', async () => {
    let meterSeen = 'unset';
    const handler = async (rq, rs) => { meterSeen = rq.aiMeter; return rs.json({ ok: 1 }); };
    await withAiCredits('AI_ASSISTANT', handler)(req({ isMockTestingUser: true }), fakeRes());
    assert.equal(meterSeen, undefined);
    await withAiCredits('AI_ASSISTANT', handler)(req({ organizationId: null, user: {} }), fakeRes());
    assert.equal(meterSeen, undefined);
    assert.equal(wallets.docs.length, 0);
  });

  test('unknown feature keys are rejected when the route is defined', () => {
    assert.throws(() => withAiCredits('NOT_A_FEATURE', () => {}), /unknown feature/);
  });
});

describe('demo (mock) data', () => {
  test('summary, usage and transactions are consistent and stable', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    const s1 = mock.summary(now);
    assert.deepEqual(mock.summary(now), s1);
    assert.equal(s1.isDemo, true);
    assert.equal(s1.wallet.used, s1.byFeature.reduce((a, f) => Math.round((a + f.credits) * 100) / 100, 0));
    assert.equal(s1.wallet.available, Math.round((s1.wallet.allocated - s1.wallet.used + s1.wallet.purchasedBalance) * 100) / 100);
    const u = mock.usage({ perPage: 5, feature: 'AI_ASSISTANT' }, now);
    assert.equal(u.data.length, 5);
    assert.ok(u.data.every((r) => r.feature === 'AI_ASSISTANT'));
    const t = mock.transactions({ perPage: 200 }, now);
    assert.equal(t.data.at(-1).type, 'ALLOCATION');
  });
});

describe('image generation and background (batch) work', () => {
  test('generated images are priced per image, text by tokens', () => {
    const s = service.normalizeSettings({ creditsPerImage: 12 });
    const p = service.priceCalls([{ provider: 'gemini', model: 'gemini-3.8-flash', inputTokens: 4000, outputTokens: 1000 }, { provider: 'gemini', model: 'gemini-3-pro-image-preview', inputTokens: 900, outputTokens: 1300, images: 1 }, { provider: 'gemini', model: 'gemini-image-batch', images: 5 }], s);
    // text 4 + 4 = 8 ; images 6 × 12 = 72 (their tokens are not charged)
    assert.equal(p.credits, 80);
    assert.equal(p.images, 6);
    assert.deepEqual(p.calls.map((c) => c.credits), [8, 12, 60]);
  });

  test('image-only usage is recorded (no tokens needed)', async () => {
    const meter = { calls: [] };
    await meterLib.runWithAiMeter(meter, async () => meterLib.recordAiResponse('gemini', 'img', null, { images: 1 }));
    assert.equal(meter.calls[0].images, 1);
  });

  test('credits per image is a validated, saved setting', async () => {
    assert.deepEqual(service.validateSettingsInput({ creditsPerImage: -1 }), ['creditsPerImage must be 0 or more']);
    const s = await service.updateSettings({ creditsPerImage: 7.5 });
    assert.equal(s.creditsPerImage, 7.5);
    assert.equal(await background.imageCredits(4), 30);
  });

  const fakeRes = () => {
    const res = { statusCode: 200, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
    return res;
  };
  const req = () => ({ organizationId: String(orgId), user: { _id: new mongoose.Types.ObjectId() }, headers: {}, body: {} });

  test('reserveAiCredits holds the feature default plus extra credits (text + direct images)', async () => {
    await withAiCredits('APLUS_CONTENT', async (rq, rs) => {
      assert.equal(await reserveAiCredits(rq, rs, { extraCredits: await background.imageCredits(5) }), true);
      assert.equal(walletOf().reserved, 76); // 26 + 5 × 10
      for (let i = 0; i < 5; i += 1) meterLib.recordAiUsage({ provider: 'gemini', model: 'img', images: 1 });
      meterLib.recordAiUsage(call('gemini-3.8-flash', 4000, 1000, 'gemini'));
      return rs.json({ isSuccess: true });
    })(req(), fakeRes());
    assert.deepEqual([walletOf().used, walletOf().reserved, usageLogs.docs[0].images, usageLogs.docs[0].feature], [58, 0, 5, 'APLUS_CONTENT']);
  });

  test('reserveAiCredits answers "out of credits" and stops the handler', async () => {
    await service.getWallet(orgId);
    await service.adjustCredits({ organizationId: orgId, credits: -990, note: 'leave 10' });
    const res = fakeRes();
    let ranAi = false;
    await withAiCredits('LISTING_GENERATION', async (rq, rs) => {
      if (!(await reserveAiCredits(rq, rs))) return undefined;
      ranAi = true;
      return rs.json({ isSuccess: true });
    })(req(), res);
    assert.equal(ranAi, false);
    assert.deepEqual([res.statusCode, res.body.isSuccess, res.body.code], [200, false, 'AI_CREDITS_EXHAUSTED']);
    assert.equal(walletOf().reserved, 0);
  });

  test('batch images: held during the request, charged for what Google produced when the job finishes', async () => {
    let hold;
    await withAiCredits('APLUS_CONTENT', async (rq, rs) => {
      await reserveAiCredits(rq, rs);
      meterLib.recordAiUsage(call('gemini-3.8-flash', 3000, 500, 'gemini')); // text: 5 credits
      hold = await background.holdForBackgroundJob(rq, 'APLUS_CONTENT', await background.imageCredits(7));
      return rs.json({ isSuccess: true, isBatch: true });
    })(req(), fakeRes());
    // text charged; 70 still held for the images
    assert.deepEqual([walletOf().used, walletOf().reserved, walletOf().balance], [5, 70, 925]);
    assert.equal(JSON.parse(JSON.stringify(hold)).requestId, hold.requestId); // storable with the job
    await background.settleBackgroundHold(hold, [{ provider: 'gemini', model: 'gemini-image-batch', images: 6 }]);
    await background.settleBackgroundHold(hold, [{ provider: 'gemini', model: 'gemini-image-batch', images: 6 }]); // retried run
    assert.deepEqual([walletOf().used, walletOf().reserved, walletOf().balance], [65, 0, 935]);
    const bg = usageLogs.docs.find((l) => l.requestId === hold.requestId);
    assert.deepEqual([bg.status, bg.images, bg.credits, bg.deferred], ['SETTLED', 6, 60, true]);
  });

  test('a failed batch returns the whole image hold', async () => {
    let hold;
    await withAiCredits('APLUS_CONTENT', async (rq, rs) => {
      hold = await background.holdForBackgroundJob(rq, 'APLUS_CONTENT', 50);
      return rs.json({ isSuccess: true });
    })(req(), fakeRes());
    await background.releaseBackgroundHold(hold, 'Batch generation failed at Google');
    assert.deepEqual([walletOf().used, walletOf().reserved, walletOf().balance], [0, 0, 1000]);
  });

  test('not enough credits for the batch images is refused before anything is submitted', async () => {
    await service.getWallet(orgId);
    await service.adjustCredits({ organizationId: orgId, credits: -960, note: 'leave 40' });
    await withAiCredits('APLUS_CONTENT', async (rq, rs) => {
      await assert.rejects(background.holdForBackgroundJob(rq, 'APLUS_CONTENT', 70), { code: 'AI_CREDITS_EXHAUSTED' });
      return rs.json({ isSuccess: false });
    })(req(), fakeRes());
    assert.equal(walletOf().reserved, 0);
  });

  test('not metered (demo user): no hold, nothing to settle', async () => {
    assert.equal(await background.holdForBackgroundJob({}, 'APLUS_CONTENT', 50), null);
    assert.equal(await background.settleBackgroundHold(null, []), null);
  });

  test('batch holds survive the 15-minute cleanup and are returned after 72 hours', async () => {
    const now = new Date('2026-11-20T12:00:00Z');
    let hold;
    await withAiCredits('APLUS_CONTENT', async (rq, rs) => {
      hold = await background.holdForBackgroundJob(rq, 'APLUS_CONTENT', 50);
      return rs.json({ isSuccess: true });
    })(req(), fakeRes());
    const log = usageLogs.docs.find((l) => l.requestId === hold.requestId);
    log.createdAt = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours old
    assert.deepEqual(await service.expireStaleHolds({ now }), { expired: 0 });
    log.createdAt = new Date(now.getTime() - 73 * 60 * 60 * 1000);
    assert.deepEqual(await service.expireStaleHolds({ now }), { expired: 1 });
    assert.equal(walletOf().reserved, 0);
  });
});

describe('moving a batch hold onto the request (A+ fallback)', () => {
  const fakeRes = () => {
    const res = { statusCode: 200, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
    return res;
  };
  const req = () => ({ organizationId: String(orgId), user: { _id: new mongoose.Types.ObjectId() }, headers: {}, body: {} });

  test('the image credits stay held and cover images generated in the request', async () => {
    await withAiCredits('APLUS_CONTENT', async (rq, rs) => {
      await reserveAiCredits(rq, rs); // text: 26
      const bg = await background.holdForBackgroundJob(rq, 'APLUS_CONTENT', 50); // images
      assert.deepEqual([walletOf().reserved, walletOf().balance], [76, 924]);
      assert.equal(await background.moveHoldToRequest(bg, rq), true);
      // still held — nothing went back to the wallet in between
      assert.deepEqual([walletOf().reserved, walletOf().balance], [76, 924]);
      assert.equal(usageLogs.docs.find((l) => l.requestId === bg.requestId).status, 'RELEASED');
      for (let i = 0; i < 5; i += 1) meterLib.recordAiUsage({ provider: 'gemini', model: 'img', images: 1 });
      meterLib.recordAiUsage(call('gemini-3.8-flash', 3000, 500, 'gemini'));
      return rs.json({ isSuccess: true });
    })(req(), fakeRes());
    // 50 images + 5 text = 55 charged, never below the hold
    assert.deepEqual([walletOf().used, walletOf().reserved, walletOf().balance], [55, 0, 945]);
  });

  test('moving twice moves nothing the second time', async () => {
    await withAiCredits('APLUS_CONTENT', async (rq, rs) => {
      await reserveAiCredits(rq, rs);
      const bg = await background.holdForBackgroundJob(rq, 'APLUS_CONTENT', 50);
      assert.equal(await service.transferHold(bg, rq.aiMeter.hold), 50);
      assert.equal(await service.transferHold(bg, rq.aiMeter.hold), 0);
      return rs.json({ isSuccess: false }); // failed: everything returned
    })(req(), fakeRes());
    assert.deepEqual([walletOf().used, walletOf().reserved, walletOf().balance], [0, 0, 1000]);
  });

  test('if the request already finished, the moved credits go back to the wallet', async () => {
    let bg;
    let finishedHold;
    await withAiCredits('APLUS_CONTENT', async (rq, rs) => {
      await reserveAiCredits(rq, rs);
      bg = await background.holdForBackgroundJob(rq, 'APLUS_CONTENT', 50);
      finishedHold = rq.aiMeter.hold;
      return rs.json({ isSuccess: false });
    })(req(), fakeRes());
    assert.equal(await service.transferHold(bg, finishedHold), 0);
    assert.deepEqual([walletOf().reserved, walletOf().balance], [0, 1000]);
  });
});
