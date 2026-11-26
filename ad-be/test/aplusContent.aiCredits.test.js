'use strict';

// A+ Content and AI credits: the batch job settles (charges) or releases the image hold.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadController({ batchStatus, images }) {
  const credit = { settled: [], released: [] };
  const job = {
    _id: 'job-1', configId: 'c1', profileId: 123, marketplaceId: 'market', asin: 'B0FIXTURE', type: 'basic', batchJobName: 'batches/1', status: 'PENDING',
    imageModules: Array.from({ length: 5 }, (_, i) => ({ title: `M${i}`, prompt: 'p', size: '970x300' })),
    productData: { title: 'Bottle' },
    aiCreditHold: { requestId: 'org:bg:1', walletId: 'w1', organizationId: 'org', feature: 'APLUS_CONTENT', amount: 50, enforced: true },
    saves: 0,
    async save() { this.saves += 1; },
  };
  // Google returns an image for the first `images` modules only
  const responses = job.imageModules.map((_, i) => (i < images ? { response: { candidates: [{ content: { parts: [{ inlineData: { data: 'aGk=' } }] } }] } } : { response: { candidates: [] } }));
  const mocks = {
    moment: require('moment-timezone'),
    'p-limit': { default: () => (task) => task() },
    '../helper/retryHelper': { retryWithBackoff: (task) => task() },
    '../models/aPlusBatchJob.model': { find: () => ({ sort: () => ({ limit: async () => [job] }) }) },
    '../models/asinAPlusContent.model': { bulkWrite: async () => {} },
    '../models/adNotification.model': { create: async () => {} },
    '../models/marketPlaceConfig.model': { findOne: () => ({ lean: async () => ({ endPoint: 'https://fixture.invalid', countryCode: 'IN' }) }) },
    '../../winston/cronAutomation/logger': { cron_logs: () => {} },
    '../../winston/utility/logger': { write_logs: () => {} },
    '../helper/common': { getSPAccessToken: async () => ({ spAccessToken: 't' }) },
    '../helper/amazonAxios': async () => ({ status: 200, data: { contentReferenceKey: 'content-1', status: 'DRAFT' } }),
    '../helper/generateAPlusImages': { getAllVariationAsins: async () => ['B0FIXTURE'], addAsinsToAPlusContent: async () => {}, uploadImageToAmazon: async () => 'upload-1' },
    '../helper/geminiBatch.helper': {
      checkBatchJobStatus: async () => (batchStatus === 'FAILED' ? { isFailed: true, error: 'Batch generation failed at Google' } : { isCompleted: true, responses }),
      saveBatchImageToDisk: async () => '/tmp/x.png',
    },
    '../helper/sendNotification': { sendNotificationToUser: async () => {} },
    '../services/aiCredits/backgroundHolds': {
      settleBackgroundHold: async (hold, calls) => credit.settled.push({ hold, calls }),
      releaseBackgroundHold: async (hold, reason) => credit.released.push({ hold, reason }),
      imageCredits: async (n) => n * 10,
      holdForBackgroundJob: async () => null,
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/controllers/aplusContent.controller.js'), 'utf8'), {
    module: mod, exports: mod.exports, require: (name) => mocks[name] || {}, process: { env: {} }, global: {}, setTimeout: (cb) => cb(), console, Buffer,
  });
  return { controller: mod.exports, job, credit };
}

describe('A+ batch job and AI credits', () => {
  test('completed batch: charged for the images Google produced (4 of 5), hold returned for the rest', async () => {
    const { controller, job, credit } = loadController({ batchStatus: 'COMPLETED', images: 4 });
    await controller.cronProcessPendingAPlusBatchJobs();
    assert.equal(job.status, 'COMPLETED');
    assert.equal(credit.released.length, 0);
    assert.equal(credit.settled.length, 1);
    assert.equal(credit.settled[0].hold.requestId, 'org:bg:1');
    assert.deepEqual(JSON.parse(JSON.stringify(credit.settled[0].calls)), [{ provider: 'gemini', model: 'gemini-image-batch', images: 4 }]);
  });

  test('failed batch: whole hold returned, nothing charged', async () => {
    const { controller, job, credit } = loadController({ batchStatus: 'FAILED', images: 0 });
    await controller.cronProcessPendingAPlusBatchJobs();
    assert.equal(job.status, 'FAILED');
    assert.equal(credit.settled.length, 0);
    assert.deepEqual(credit.released.map((r) => [r.hold.requestId, r.reason]), [['org:bg:1', 'Batch generation failed at Google']]);
  });

  test('completed batch with no images fails and returns the whole hold', async () => {
    const { controller, job, credit } = loadController({ batchStatus: 'COMPLETED', images: 0 });
    await controller.cronProcessPendingAPlusBatchJobs();
    assert.equal(job.status, 'FAILED');
    assert.equal(credit.settled.length, 0);
    assert.deepEqual(credit.released.map((r) => [r.hold.requestId, r.reason]), [['org:bg:1', 'Google Gemini batch completed without image data']]);
  });
});

// ── createAIAPlusContent: credits are held before any AI runs ──
class AiCreditsError extends Error { constructor(code) { super(code); this.code = code; } }

function loadCreate({ walletCredits, batchError = null, textError = null }) {
  const calls = [];
  let held = 0;
  const imageCredits = async (n) => n * 10;
  const res = { statusCode: 200, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  const take = (n) => {
    if (n > walletCredits - held) throw new AiCreditsError('AI_CREDITS_EXHAUSTED');
    held += n;
  };
  const mocks = {
    moment: require('moment-timezone'),
    'p-limit': { default: () => (task) => task() },
    axios: { get: async () => ({ headers: {}, data: Buffer.from('img') }) },
    '../helper/retryHelper': { retryWithBackoff: (task) => task() },
    '../models/aPlusBatchJob.model': { create: async (doc) => { calls.push(['batchJob', doc.aiCreditHold?.amount]); return { _id: 'job-1' }; } },
    '../models/asinAPlusContent.model': { bulkWrite: async () => {} },
    '../models/marketPlaceConfig.model': { findOne: () => ({ lean: async () => ({ endPoint: 'https://fixture.invalid', marketPlaceId: 'market', countryCode: 'IN' }) }) },
    '../../winston/utility/logger': { write_logs: () => {} },
    '../../winston/cronAutomation/logger': { cron_logs: () => {} },
    '../helper/common': { getProfile: async () => ({ marketplaceStringId: 'market' }), getSPAccessToken: async () => ({ spAccessToken: 't' }) },
    '../helper/amazonAxios': async () => ({ status: 200, data: { summaries: [{ itemName: 'Bottle' }], images: [{ images: [{ variant: 'MAIN', link: 'https://img', width: 10, height: 10 }] }], contentReferenceKey: 'content-1' } }),
    '../helper/chatgpt': { generateAPlusModulesAI: async () => { calls.push(['ai:text']); if (textError) throw new Error(textError); return { _imageModules: [1, 2, 3, 4, 5].map((i) => ({ title: `M${i}`, prompt: 'p', size: '970x300' })) }; } },
    '../helper/geminiBatch.helper': { submitAPlusImageBatchJob: async () => { calls.push(['batch:submit']); if (batchError) throw new Error(batchError); return { batchJobName: 'batches/1' }; } },
    '../helper/generateAPlusImages': { generateAndUploadModuleImages: async () => { calls.push(['ai:images:direct']); return []; }, getAllVariationAsins: async () => ['B0FIXTURE'], addAsinsToAPlusContent: async () => {} },
    '../services/aiCredits/aiCredit.service': { AiCreditsError },
    '../services/aiCredits/withAiCredits': {
      reserveAiCredits: async (_req, r, { extraCredits = 0 } = {}) => {
        try { take(20 + extraCredits); calls.push(['hold:request', 20 + extraCredits]); return true; } catch (e) { r.status(200).json({ isSuccess: false, code: e.code }); return false; }
      },
      creditErrorBody: (e) => ({ isSuccess: false, code: e.code }),
    },
    '../services/aiCredits/backgroundHolds': {
      imageCredits,
      holdForBackgroundJob: async (_req, _f, amount) => { take(amount); calls.push(['hold:images', amount]); return { requestId: 'bg-1', amount }; },
      releaseBackgroundHold: async (hold, reason) => { if (hold) { held -= hold.amount; calls.push(['release:images', reason]); } },
      moveHoldToRequest: async (hold) => { calls.push(['move:images->request', hold.amount]); return true; },
      settleBackgroundHold: async () => {},
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/controllers/aplusContent.controller.js'), 'utf8'), {
    module: mod, exports: mod.exports, require: (name) => mocks[name] || {}, process: { env: {} }, global: {}, setTimeout: (cb) => cb(), console, Buffer,
  });
  const run = () => mod.exports.createAIAPlusContent({ body: { asin: 'B0FIXTURE', profileId: 123, generateImageOption: true, type: 'basic', useBatch: true }, config: { configId: 'c1' } }, res);
  return { run, calls, res, held: () => held };
}

describe('A+ create: credits held before any AI runs', () => {
  const names = (calls) => calls.map((c) => c[0]);

  test('25 credits (enough for the text, not the 5 images): refused before Gemini is called', async () => {
    const { run, calls, res } = loadCreate({ walletCredits: 25 });
    await run();
    assert.deepEqual(names(calls), ['hold:request']);
    assert.deepEqual([res.body.isSuccess, res.body.code], [false, 'AI_CREDITS_EXHAUSTED']);
  });

  test('enough credits: text and images are held, then the batch job takes the image hold', async () => {
    const { run, calls, res } = loadCreate({ walletCredits: 100 });
    await run();
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['hold:request', 20], ['hold:images', 50], ['ai:text'], ['batch:submit'], ['batchJob', 50]]);
    assert.equal(res.body.isBatch, true);
  });

  test('batch submission fails: the image hold moves onto the request before images are generated directly', async () => {
    const { run, calls } = loadCreate({ walletCredits: 100, batchError: 'Internal error' });
    await run();
    assert.deepEqual(names(calls), ['hold:request', 'hold:images', 'ai:text', 'batch:submit', 'move:images->request', 'ai:images:direct']);
  });

  test('spending-cap error: image hold returned, nothing generated', async () => {
    const { run, calls, res } = loadCreate({ walletCredits: 100, batchError: 'spending cap exceeded' });
    await run();
    assert.deepEqual(names(calls), ['hold:request', 'hold:images', 'ai:text', 'batch:submit', 'release:images']);
    assert.equal(res.statusCode, 203);
  });

  test('text generation throws: the image hold is returned', async () => {
    const { run, calls, held } = loadCreate({ walletCredits: 100, textError: 'Gemini down' });
    await run();
    assert.deepEqual(names(calls), ['hold:request', 'hold:images', 'ai:text', 'release:images']);
    assert.equal(held(), 20); // only the request hold is left; the wrapper returns it for the failed request
  });
});
