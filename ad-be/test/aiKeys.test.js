const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { test, describe, beforeEach, after } = require('node:test');
const mongoose = require('mongoose');
const axios = require('axios');
const { createFakeModel } = require('./helpers/fakeMongoModel');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-secret-for-ai-keys';
const PLATFORM = { openai: 'sk-platform-openai-0000000000000000', gemini: 'AIzaPLATFORMgemini000000000000000000', anthropic: 'sk-ant-platform-0000000000000000' };
process.env.OPENAI_API_KEY = PLATFORM.openai;
process.env.GOOGLE_AI_STUDIO_KEY = PLATFORM.gemini;
process.env.ANTHROPIC_API_KEY = PLATFORM.anthropic;
const OWN = { openai: 'sk-proj-OWNopenaiKEY1234567890abcd', gemini: 'AIzaOWNgeminiKEY1234567890abcdefghij', anthropic: 'sk-ant-OWNanthropicKEY1234567890ab' };

const root = path.join(__dirname, '..');
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

// ── In-memory collections ──
const wallets = createFakeModel('aicreditwallets', { unique: [['organizationId']], defaults: { monthlyLimitOverride: null, reserved: 0, used: 0, lifetimeUsed: 0 } });
const transactions = createFakeModel('aicredittransactions', { unique: [['dedupeKey']] });
const usageLogs = createFakeModel('aiusagelogs', { unique: [['requestId']], defaults: { keySource: 'PLATFORM' } });
const summaries = createFakeModel('aiusagedailysummaries', { unique: [['organizationId', 'day', 'userId', 'feature', 'modelKey', 'status', 'keySource']], defaults: { appliedBatches: [], byModel: [] } });
const settings = createFakeModel('aicreditsettings', { unique: [['key']] });
const organizations = createFakeModel('organizations');
const plans = createFakeModel('packages');
const keyDocs = createFakeModel('aiproviderkeys', { unique: [['organizationId', 'provider']], defaults: { status: 'UNVERIFIED', lastUsedAt: null } });
const keySettings = createFakeModel('aikeysettings', { unique: [['organizationId']] });
stub('api-server/models/aiCreditWallet.model.js', wallets);
stub('api-server/models/aiCreditTransaction.model.js', transactions);
stub('api-server/models/aiUsageLog.model.js', usageLogs);
stub('api-server/models/aiUsageDailySummary.model.js', summaries);
stub('api-server/models/aiCreditSetting.model.js', settings);
stub('api-server/models/organization.model.js', organizations);
stub('api-server/models/packages.model.js', plans);
stub('api-server/models/aiProviderKey.model.js', keyDocs);
stub('api-server/models/aiKeySetting.model.js', keySettings);
stub('winston/utility/logger.js', { write_logs: () => {} });

const service = require('../api-server/services/aiCredits/aiCredit.service');
const keys = require('../api-server/services/aiKeys/aiKey.service');
const crypto = require('../api-server/services/aiKeys/aiKeyCrypto');
const routing = require('../api-server/services/aiKeys/aiKeyRouting');
const { withAiCredits, reserveAiCredits } = require('../api-server/services/aiCredits/withAiCredits');
const { recordAiUsage } = require('../api-server/services/aiCredits/aiUsageMeter');
const background = require('../api-server/services/aiCredits/backgroundHolds');
const controller = require('../api-server/controllers/aiKey.controller');

let orgId;
let ownerId;
const verifierCalls = [];
let verdict;

const res = () => {
  const r = { statusCode: 200, status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; return r; } };
  return r;
};
const walletOf = () => wallets.docs.find((w) => String(w.organizationId) === String(orgId));
const logOf = (requestId) => usageLogs.docs.find((l) => l.requestId.endsWith(requestId));
const keyDoc = (provider) => keyDocs.docs.find((k) => String(k.organizationId) === String(orgId) && k.provider === provider);

async function saveOwn(provider, apiKey = OWN[provider]) {
  verdict = { status: 'VALID', message: null };
  return keys.saveKey({ organizationId: orgId, provider, apiKey });
}
const turnOn = (allowWalletFallback = false) => keys.updateSettings({ organizationId: orgId, usePersonalKeys: true, allowWalletFallback });

/** A fake provider call: remembers the key it got, records 1,000 in / 500 out (= 3 credits). */
function call(provider, { fail = null, seen = [] } = {}) {
  return {
    provider,
    seen,
    run: async (apiKey) => {
      seen.push(apiKey);
      const err = typeof fail === 'function' ? fail(apiKey) : fail;
      if (err) throw err;
      recordAiUsage({ provider, model: provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3.8-flash', inputTokens: 1000, outputTokens: 500 });
      return `${provider}-ok`;
    },
  };
}

/** Run a metered request (LISTING_GENERATION) that makes the given provider calls. */
async function runRequest(calls, { requestId = `req${Math.random().toString(36).slice(2, 12)}`, role = 'ADMIN' } = {}) {
  const handler = async (req, r) => {
    try {
      if (!(await reserveAiCredits(req, r))) return undefined;
      const out = [];
      for (const c of calls) out.push(await routing.withProviderKey(c.provider, c.run));
      return r.status(200).json({ isSuccess: true, data: out });
    } catch (err) {
      if (routing.sendAiAccessError(r, err)) return undefined;
      return r.status(500).json({ isSuccess: false, message: err.message, code: err.code });
    }
  };
  const req = { organizationId: String(orgId), user: { _id: ownerId }, role: { roleName: role }, headers: { 'x-ai-request-id': requestId }, body: {} };
  const r = res();
  await withAiCredits('LISTING_GENERATION', handler)(req, r, () => {});
  return { r, req, log: logOf(requestId) };
}

const providerError = (status, message) => Object.assign(new Error(message), { status });

beforeEach(async () => {
  for (const m of [wallets, transactions, usageLogs, summaries, settings, organizations, plans, keyDocs, keySettings]) m.reset();
  service._resetSettingsCache();
  keys._resetForTests();
  verifierCalls.length = 0;
  verdict = { status: 'VALID', message: null };
  keys.setKeyVerifier(async (provider, apiKey) => {
    verifierCalls.push([provider, apiKey]);
    return verdict;
  });
  const plan = await plans.create({ name: 'Pro', aiMonthlyCredits: 1000 });
  orgId = (await organizations.create({ organizationName: 'Acme', planId: plan._id }))._id;
  ownerId = new mongoose.Types.ObjectId();
});
after(() => keys._resetForTests());

// ─────────────────────────────────────────────────────────────────────────────
describe('secure storage', () => {
  test('keys are encrypted (AES-256-GCM), unique per save and bound to organization and provider', () => {
    const at = { organizationId: orgId, provider: 'openai' };
    const a = crypto.encryptApiKey(OWN.openai, at);
    const b = crypto.encryptApiKey(OWN.openai, at);
    assert.notEqual(a, b); // random IV
    assert.ok(!a.includes(OWN.openai) && a.startsWith('v1:'));
    assert.equal(crypto.decryptApiKey(a, at), OWN.openai);
    assert.throws(() => crypto.decryptApiKey(a, { organizationId: new mongoose.Types.ObjectId(), provider: 'openai' }));
    assert.throws(() => crypto.decryptApiKey(a, { ...at, provider: 'gemini' }));
    const parts = a.split(':');
    parts[3] = Buffer.from('tampered-ciphertext').toString('base64');
    assert.throws(() => crypto.decryptApiKey(parts.join(':'), at));
    assert.throws(() => crypto.decryptApiKey(OWN.openai, at), /supported format/); // no plain-text fallback
  });

  test('only a masked hint is ever shown', () => {
    assert.equal(crypto.keyHint('sk-ant-api03-abcdefghijklmnopWXYZ'), 'sk-ant-…WXYZ');
    assert.equal(crypto.keyHint('sk-proj-abcdefghijklmnop1234'), 'sk-proj-…1234');
    assert.equal(crypto.keyHint('AIzaSyABCDEFGHIJKLMNOPQRSTUVWX9876'), 'AIza…9876');
  });

  test('saving stores the encrypted key only; the overview never contains it', async () => {
    const { after: saved } = await saveOwn('openai');
    assert.deepEqual([saved.keyHint, saved.status], ['sk-proj-…abcd', 'VALID']);
    const doc = keyDoc('openai');
    assert.ok(doc.encryptedKey && !doc.encryptedKey.includes(OWN.openai));
    assert.ok(!JSON.stringify(saved).includes(OWN.openai));
    const view = await keys.overview(orgId);
    const text = JSON.stringify(view);
    assert.ok(!text.includes(OWN.openai) && !text.includes('encryptedKey') && !text.includes(doc.encryptedKey));
    assert.deepEqual(view.providers.find((p) => p.provider === 'openai').features, ['LISTING_OPTIMIZATION', 'LISTING_GENERATION', 'CAMPAIGN_ANALYSIS']);
  });
});

describe('adding, checking and removing keys', () => {
  test('obviously wrong keys are refused before the provider is asked', async () => {
    for (const [provider, key, msg] of [
      ['openai', 'too-short', /doesn't look like an API key/],
      ['openai', 'sk-has a space in it 1234567890', /doesn't look like an API key/],
      ['anthropic', 'sk-proj-notanthropic1234567890abc', /doesn't look like an Anthropic \(Claude\) key/],
      ['mistral', 'sk-whatever-1234567890abcdefgh', /Choose Anthropic, OpenAI or Google Gemini/],
    ]) {
      await assert.rejects(keys.saveKey({ organizationId: orgId, provider, apiKey: key }), msg);
    }
    assert.equal(verifierCalls.length, 0);
    assert.equal(keyDocs.docs.length, 0);
  });

  test('a key the provider rejects is not saved', async () => {
    verdict = { status: 'INVALID', message: 'Incorrect API key provided: [key]' };
    await assert.rejects(keys.saveKey({ organizationId: orgId, provider: 'openai', apiKey: OWN.openai }), { code: 'KEY_REJECTED', message: /OpenAI rejected this key: Incorrect API key provided/ });
    assert.equal(keyDocs.docs.length, 0);
  });

  test('a key that could not be checked (provider unreachable) is saved as not verified', async () => {
    verdict = { status: 'UNVERIFIED', message: 'Google Gemini could not be reached to check the key.' };
    const { after: saved } = await keys.saveKey({ organizationId: orgId, provider: 'gemini', apiKey: OWN.gemini });
    assert.equal(saved.status, 'UNVERIFIED');
  });

  test('replace, check again and remove', async () => {
    await saveOwn('openai');
    const second = 'sk-proj-SECONDopenaiKEY987654321wxyz';
    const { before, after: replaced } = await saveOwn('openai', second);
    assert.deepEqual([before.keyHint, replaced.keyHint, keyDocs.docs.length], ['sk-proj-…abcd', 'sk-proj-…wxyz', 1]);
    verdict = { status: 'QUOTA_EXCEEDED', message: 'You exceeded your current quota' };
    const rechecked = await keys.revalidateKey({ organizationId: orgId, provider: 'openai' });
    assert.equal(rechecked.status, 'QUOTA_EXCEEDED');
    assert.deepEqual(verifierCalls.at(-1), ['openai', second]); // the decrypted key was checked
    await keys.removeKey({ organizationId: orgId, provider: 'openai' });
    assert.equal(keyDocs.docs.length, 0);
    await assert.rejects(keys.removeKey({ organizationId: orgId, provider: 'openai' }), { code: 'KEY_NOT_FOUND' });
  });

  test('own keys can only be turned on once a key is saved; the wallet fallback is off by default', async () => {
    await assert.rejects(turnOn(), { code: 'KEYS_REQUIRED' });
    await saveOwn('gemini');
    const { after: on } = await turnOn();
    assert.deepEqual(on, { usePersonalKeys: true, allowWalletFallback: false });
    const { after: fb } = await keys.updateSettings({ organizationId: orgId, allowWalletFallback: true });
    assert.deepEqual(fb, { usePersonalKeys: true, allowWalletFallback: true });
  });

  test('checking with the provider: what each answer means, and the key goes in a header (never the URL)', async () => {
    keys._resetForTests(); // the real verifier, with axios stubbed
    const realGet = axios.get;
    const seen = [];
    try {
      const cases = [
        [null, 'VALID'],
        [{ response: { status: 401, data: { error: { message: 'Incorrect API key provided: sk-proj-abc***' } } } }, 'INVALID'],
        [{ response: { status: 400, data: { error: { message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } } } }, 'INVALID'],
        [{ response: { status: 429, data: { error: { message: 'You exceeded your current quota, please check your plan and billing details.' } } } }, 'QUOTA_EXCEEDED'],
        [{ response: { status: 429, data: { error: { message: 'Rate limit reached' } } } }, 'RATE_LIMITED'],
        [Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }), 'UNVERIFIED'],
      ];
      for (const [err, expected] of cases) {
        axios.get = async (url, opts) => {
          seen.push([url, opts.headers]);
          if (err) throw err;
          return { status: 200, data: {} };
        };
        for (const provider of ['openai', 'anthropic', 'gemini']) {
          const r = await keys.defaultVerifier(provider, OWN[provider]);
          assert.equal(r.status, expected, `${provider} ${expected}`);
          assert.ok(!String(r.message || '').includes(OWN[provider]));
        }
      }
      assert.ok(seen.every(([url]) => !Object.values(OWN).some((k) => url.includes(k))));
      const [, geminiHeaders] = seen.find(([url]) => url.includes('generativelanguage'));
      assert.equal(geminiHeaders['x-goog-api-key'], OWN.gemini);
    } finally {
      axios.get = realGet;
    }
  });
});

describe('API (owner manages, everyone sees the masked status)', () => {
  const reqAs = (role, body = {}, extra = {}) => ({ organizationId: String(orgId), user: { _id: ownerId }, role: { roleName: role }, body, ...extra });

  test('the owner adds a key; the audit record and the response never contain it', async () => {
    const rq = reqAs('ADMIN', { provider: 'openai', apiKey: OWN.openai });
    const r = res();
    await controller.saveKey(rq, r);
    assert.deepEqual([r.body.isSuccess, r.body.message, r.body.data.keyHint], [true, 'API key saved', 'sk-proj-…abcd']);
    assert.ok(!JSON.stringify(r.body).includes(OWN.openai));
    assert.ok(!JSON.stringify(rq.auditChange).includes(OWN.openai));
    assert.equal(rq.auditChange.newValue.keyHint, 'sk-proj-…abcd');
    const { eventForRoute } = require('../api-server/constants/auditRouteEvents');
    assert.deepEqual(['/save', '/validate', '/remove', '/settings'].map((p) => eventForRoute('POST', `/api/ai-keys${p}`)), ['AI_KEY_SAVED', 'AI_KEY_VALIDATED', 'AI_KEY_REMOVED', 'AI_KEY_SETTINGS_UPDATED']);
    // The audit middleware drops request fields named like apiKey
    const { sanitizeAuditValue } = require('../api-server/helpers/auditHelper');
    assert.deepEqual(sanitizeAuditValue({ provider: 'openai', apiKey: OWN.openai }), { provider: 'openai' });
  });

  test('team members can see the status but not change anything', async () => {
    await saveOwn('openai');
    for (const [fn, body] of [['saveKey', { provider: 'gemini', apiKey: OWN.gemini }], ['removeKey', { provider: 'openai' }], ['validateKey', { provider: 'openai' }], ['updateSettings', { usePersonalKeys: true }]]) {
      const r = res();
      await controller[fn](reqAs('Analyst', body), r);
      assert.deepEqual([r.body.isSuccess, r.body.code], [false, 'NOT_ALLOWED'], fn);
    }
    const v = res();
    await controller.getKeys(reqAs('Analyst'), v);
    assert.deepEqual([v.body.isSuccess, v.body.data.canManage, v.body.data.providers.find((p) => p.provider === 'openai').key.keyHint], [true, false, 'sk-proj-…abcd']);
    assert.equal(keyDocs.docs.length, 1);
    assert.equal(keySettings.docs.length, 0);
  });

  test('demo accounts see sample keys and can never save', async () => {
    const v = res();
    await controller.getKeys(reqAs('ADMIN', {}, { isMockTestingUser: true }), v);
    assert.deepEqual([v.body.data.isDemo, v.body.data.canManage, v.body.data.settings.usePersonalKeys], [true, false, true]);
    const s = res();
    await controller.saveKey(reqAs('ADMIN', { provider: 'openai', apiKey: OWN.openai }, { isMockTestingUser: true }), s);
    assert.deepEqual([s.body.isSuccess, s.body.code], [false, 'NOT_ALLOWED']);
    assert.equal(keyDocs.docs.length, 0);
  });

  test('errors are clear and never echo the key', async () => {
    const r = res();
    verdict = { status: 'INVALID', message: 'Incorrect API key provided: [key]' };
    await controller.saveKey(reqAs('ADMIN', { provider: 'openai', apiKey: OWN.openai }), r);
    assert.deepEqual([r.body.isSuccess, r.body.code, r.body.provider], [false, 'KEY_REJECTED', 'openai']);
    assert.ok(!JSON.stringify(r.body).includes(OWN.openai));
    const t = res();
    await controller.updateSettings(reqAs('ADMIN', { usePersonalKeys: true }), t);
    assert.deepEqual([t.body.isSuccess, t.body.code], [false, 'KEYS_REQUIRED']);
  });
});

describe('AI requests with the organization\'s own keys', () => {
  test('own key on: the request uses it, holds and charges nothing, and is still logged with tokens', async () => {
    await saveOwn('openai');
    await turnOn();
    await service.adjustCredits({ organizationId: orgId, credits: -1000, note: 'empty the wallet' }); // works even with 0 credits
    const before = walletOf().balance;
    const c = call('openai');
    const { r, log } = await runRequest([c]);
    assert.equal(r.body.isSuccess, true);
    assert.deepEqual(c.seen, [OWN.openai]);
    assert.equal(walletOf().balance, before);
    assert.deepEqual([log.status, log.credits, log.reservedCredits, log.keySource, log.inputTokens, log.outputTokens, log.totalTokens, log.models], ['SETTLED', 0, 0, 'PERSONAL', 1000, 500, 1500, ['gpt-4o-mini']]);
    assert.equal(log.calls[0].keySource, 'PERSONAL');
    assert.equal(transactions.docs.filter((t) => t.type === 'DEDUCTION').length, 0);
    assert.ok(keyDoc('openai').lastUsedAt);
  });

  test('own keys off: the platform key and the wallet, as before', async () => {
    await saveOwn('openai'); // saved but not switched on
    const c = call('openai');
    const { r, log } = await runRequest([c]);
    assert.equal(r.body.isSuccess, true);
    assert.deepEqual(c.seen, [PLATFORM.openai]);
    assert.deepEqual([log.keySource, log.credits], ['PLATFORM', 3]);
    assert.equal(walletOf().used, 3);
  });

  test('no key for the provider and no consent: stops with a clear message, nothing called or charged', async () => {
    await saveOwn('openai');
    await turnOn(false);
    const c = call('gemini');
    const { r, log } = await runRequest([c]);
    assert.deepEqual([r.body.isSuccess, r.body.code, r.body.provider], [false, 'PERSONAL_KEY_MISSING', 'gemini']);
    assert.match(r.body.message, /no Google Gemini key is saved/);
    assert.deepEqual(c.seen, []);
    assert.deepEqual([log.status, log.credits, walletOf().used, walletOf().reserved], ['RELEASED', 0, 0, 0]);
  });

  test('no key for the provider, wallet fallback allowed: platform key, charged to the wallet', async () => {
    await saveOwn('openai');
    await turnOn(true);
    const c = call('gemini');
    const { r, log } = await runRequest([c]);
    assert.equal(r.body.isSuccess, true);
    assert.deepEqual(c.seen, [PLATFORM.gemini]);
    assert.deepEqual([log.keySource, log.credits], ['PLATFORM', 3]);
    assert.deepEqual([walletOf().used, walletOf().reserved], [3, 0]);
  });

  test('one request on both: own OpenAI key free, Gemini on the wallet → MIXED, only Gemini charged', async () => {
    await saveOwn('openai');
    await turnOn(true);
    const o = call('openai');
    const g = call('gemini');
    const { r, log } = await runRequest([o, g]);
    assert.equal(r.body.isSuccess, true);
    assert.deepEqual([o.seen, g.seen], [[OWN.openai], [PLATFORM.gemini]]);
    assert.deepEqual([log.keySource, log.credits, log.inputTokens], ['MIXED', 3, 2000]);
    assert.deepEqual(log.calls.map((x) => [x.provider, x.keySource, x.credits]), [['openai', 'PERSONAL', 0], ['gemini', 'PLATFORM', 3]]);
  });

  for (const [label, err, code, status] of [
    ['rejected (invalid / expired / revoked)', providerError(401, 'Incorrect API key provided: sk-proj-OWN***'), 'PERSONAL_KEY_INVALID', 'INVALID'],
    ['out of quota', providerError(429, 'You exceeded your current quota, please check your plan and billing details.'), 'PERSONAL_KEY_QUOTA', 'QUOTA_EXCEEDED'],
    ['rate limited', providerError(429, 'Rate limit reached for gpt-4o-mini'), 'PERSONAL_KEY_RATE_LIMITED', 'RATE_LIMITED'],
  ]) {
    test(`own key ${label}, no consent: the request stops, the key is flagged, nothing charged, no retry`, async () => {
      await saveOwn('openai');
      await turnOn(false);
      const c = call('openai', { fail: err });
      const { r, log } = await runRequest([c]);
      assert.deepEqual([r.body.isSuccess, r.body.code, r.body.provider], [false, code, 'openai']);
      assert.ok(!JSON.stringify(r.body).includes(OWN.openai));
      assert.equal(c.seen.length, 1);
      assert.equal(keyDoc('openai').status, status);
      assert.ok(!String(keyDoc('openai').statusMessage).includes('sk-proj-OWN'));
      assert.deepEqual([log.status, walletOf().used, walletOf().reserved], ['RELEASED', 0, 0]);
    });
  }

  test('own key rejected, consent given: retried once on the platform key and charged', async () => {
    await saveOwn('openai');
    await turnOn(true);
    const c = call('openai', { fail: (apiKey) => (apiKey === OWN.openai ? providerError(401, 'invalid x-api-key') : null) });
    const { r, log } = await runRequest([c]);
    assert.equal(r.body.isSuccess, true);
    assert.deepEqual(c.seen, [OWN.openai, PLATFORM.openai]);
    assert.deepEqual([log.keySource, log.credits, keyDoc('openai').status], ['PLATFORM', 3, 'INVALID']);
  });

  test('errors that are not about the key are passed through and leave the key alone', async () => {
    await saveOwn('openai');
    await turnOn(true);
    const c = call('openai', { fail: providerError(503, 'The model is overloaded') });
    const { r } = await runRequest([c]);
    assert.deepEqual([r.statusCode, r.body.message], [500, 'The model is overloaded']);
    assert.deepEqual([c.seen.length, keyDoc('openai').status, walletOf().used], [1, 'VALID', 0]);
  });

  test('fallback with an empty wallet: out-of-credits message, nothing called on the platform key', async () => {
    await saveOwn('openai');
    await turnOn(true);
    await service.adjustCredits({ organizationId: orgId, credits: -1000, note: 'empty' });
    const c = call('gemini');
    const { r } = await runRequest([c]);
    assert.deepEqual([r.body.isSuccess, r.body.code], [false, 'AI_CREDITS_EXHAUSTED']);
    assert.deepEqual(c.seen, []);
  });

  test('if the key settings cannot be read, the request stops instead of charging the wallet', async () => {
    const realFind = keySettings.findOne;
    keySettings.findOne = () => ({ lean: async () => { throw new Error('db down'); } });
    let ran = false;
    const r = res();
    try {
      await withAiCredits('LISTING_GENERATION', async () => { ran = true; })({ organizationId: String(orgId), user: { _id: ownerId }, headers: {}, body: {} }, r, () => {});
    } finally {
      keySettings.findOne = realFind;
    }
    assert.deepEqual([ran, r.body.code], [false, 'AI_KEY_SETTINGS_UNAVAILABLE']);
  });

  test('a removed key stops being used within the request after the next lookup', async () => {
    await saveOwn('openai');
    await turnOn(false);
    await keys.removeKey({ organizationId: orgId, provider: 'openai' });
    const { r } = await runRequest([call('openai')]);
    assert.equal(r.body.code, 'PERSONAL_KEY_MISSING');
  });

  test('the shared AI provider layer (AI Assistant) uses the own key and records it as PERSONAL', async () => {
    await saveOwn('anthropic');
    await turnOn(false);
    const aiProvider = require('../api-server/services/aiProvider.service');
    const keysSeen = [];
    class FakeAnthropic {
      constructor({ apiKey }) {
        keysSeen.push(apiKey);
        this.messages = { create: async () => ({ id: 'm', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', usage: { input_tokens: 800, output_tokens: 200 } }) };
      }
    }
    const handler = async (req, r) => {
      await aiProvider.requestTurn({ instructions: 'x', messages: [{ role: 'user', content: 'hello' }], options: { provider: 'anthropic' } }, FakeAnthropic);
      return r.status(200).json({ isSuccess: true });
    };
    const r = res();
    await withAiCredits('AI_ASSISTANT', handler)({ organizationId: String(orgId), user: { _id: ownerId }, headers: { 'x-ai-request-id': 'assistant-own-key' }, body: {} }, r, () => {});
    assert.equal(r.body.isSuccess, true);
    assert.deepEqual(keysSeen, [OWN.anthropic]);
    const log = logOf('assistant-own-key');
    assert.deepEqual([log.keySource, log.credits, log.inputTokens], ['PERSONAL', 0, 800]);
  });
});

describe('background work (A+ batch images) and pricing', () => {
  const meterReq = async (feature = 'APLUS_CONTENT') => {
    let captured;
    await withAiCredits(feature, async (req, r) => {
      captured = req;
      r.status(200).json({ isSuccess: true });
    })({ organizationId: String(orgId), user: { _id: ownerId }, headers: {}, body: {} }, res(), () => {});
    return captured;
  };

  test('own Gemini key: the batch hold is 0 and the images are logged but not charged', async () => {
    await saveOwn('gemini');
    await turnOn(false);
    const req = await meterReq();
    const hold = await background.holdForBackgroundJob(req, 'APLUS_CONTENT', 70, { provider: 'gemini' });
    assert.deepEqual([hold.amount, hold.keySource, walletOf().reserved], [0, 'PERSONAL', 0]);
    await background.settleBackgroundHold(hold, [{ provider: 'gemini', model: 'gemini-image-batch', images: 7 }]);
    const log = usageLogs.docs.find((l) => l.requestId === hold.requestId);
    assert.deepEqual([log.status, log.credits, log.images, log.keySource], ['SETTLED', 0, 7, 'PERSONAL']);
  });

  test('no Gemini key, wallet fallback allowed: a normal wallet hold', async () => {
    await saveOwn('openai');
    await turnOn(true);
    const req = await meterReq();
    const hold = await background.holdForBackgroundJob(req, 'APLUS_CONTENT', 70, { provider: 'gemini' });
    assert.deepEqual([hold.amount, hold.keySource, walletOf().reserved], [70, 'PLATFORM', 70]);
  });

  test('calls on the own key cost 0 and never trigger the minimum charge', async () => {
    await settings.findOneAndUpdate({ key: 'global' }, { $set: { minimumChargePerRequest: 2 } }, { upsert: true });
    service._resetSettingsCache();
    const s = await service.getSettings({ fresh: true });
    const own = service.priceCalls([{ model: 'gpt-4o-mini', inputTokens: 5000, outputTokens: 1000, keySource: 'PERSONAL' }], s);
    assert.deepEqual([own.credits, own.inputTokens, own.keySource], [0, 5000, 'PERSONAL']);
    const mixed = service.priceCalls([{ model: 'a', inputTokens: 100, outputTokens: 0, keySource: 'PERSONAL' }, { model: 'b', inputTokens: 100, outputTokens: 0 }], s);
    assert.deepEqual([mixed.credits, mixed.keySource], [2, 'MIXED']);
  });

  test('Gemini batch helper sends the key in a header and polls with the given key', async () => {
    const realPost = axios.post;
    const realGet = axios.get;
    const seen = [];
    axios.post = async (url, body, opts) => (seen.push(['post', url, opts.headers]), { data: { name: 'batches/1' } });
    axios.get = async (url, opts) => (seen.push(['get', url, opts.headers]), { data: { metadata: { state: 'BATCH_STATE_RUNNING' } } });
    try {
      const batch = require('../api-server/helper/geminiBatch.helper');
      await batch.submitAPlusImageBatchJob({ imageModules: [{ prompt: 'p', size: '970x300' }], apiKey: OWN.gemini });
      await batch.checkBatchJobStatus('batches/1', OWN.gemini);
    } finally {
      axios.post = realPost;
      axios.get = realGet;
    }
    assert.deepEqual(seen.map(([m, , h]) => [m, h['x-goog-api-key']]), [['post', OWN.gemini], ['get', OWN.gemini]]);
    assert.ok(seen.every(([, url]) => !url.includes('key=')));
  });

  test('every AI call site goes through withProviderKey (no platform key read directly)', () => {
    const src = (f) => fs.readFileSync(path.join(root, 'api-server', f), 'utf8');
    const gpt = src('helper/chatgpt.js');
    for (const fn of ['runModuleCreation', 'analyzeImageWithGPT4oMini', 'analyzeTextWithGemini', 'AIPlacementAndTargetingAnalysis', 'AISearchTermsAnalysis', 'generateAPlusModulesAI']) {
      const start = gpt.indexOf(`function ${fn}`);
      const body = gpt.slice(start, gpt.indexOf('\nexport ', start + 10) === -1 ? undefined : gpt.indexOf('\nexport ', start + 10));
      assert.match(body, /withProviderKey\("(openai|gemini)"/, fn);
      assert.doesNotMatch(body, /process\.env\.(OPENAI_API_KEY|GOOGLE_AI_STUDIO_KEY)/, fn);
    }
    assert.match(src('helper/generateAPlusImages.js'), /withProviderKey\("gemini"/);
    assert.match(src('services/aiProvider.service.js'), /withProviderKey\(config\.provider/);
    assert.match(src('controllers/aplusContent.controller.js'), /checkBatchJobStatus\(batchJobName, pollKey\)/);
  });
});
