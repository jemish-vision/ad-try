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
    '../models/marketPlaceConfig.model': { findOne: () => ({ lean: async () => ({ endPoint: 'https://fixture.invalid' }) }) },
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
});
