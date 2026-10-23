'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  once
} = require('node:events');
const express = require('express');
const {
  createSummaryRouter
} = require('../api-server/routes/chatbotReporting.route');
const {
  createReportController
} = require('../api-server/controllers/chatbotReporting.controller');
const {
  createReportService
} = require('../api-server/services/chatbotReporting.handlers');
const {
  validateReportResponse
} = require('../api-server/contracts/chatbotReporting.contract');
const identity = {
  userId: '000000000000000000000002',
  configId: '000000000000000000000001'
};
const profile = {
  profileId: '1001',
  timezone: 'Asia/Kolkata',
  currencyCode: 'INR',
  accountType: 'seller',
  adTypes: ['SP'],
  attributionWindows: {
    SP: 7
  },
  supportedDimensions: {
    SP: ['profile', 'campaign', 'date']
  }
};
const body = {
  schemaVersion: '1.0',
  category: 'comparison',
  profileIds: ['1001'],
  adTypes: ['SP'],
  period: {
    preset: 'last_7_days'
  },
  comparison: {
    mode: 'previous_period'
  },
  metrics: ['spend', 'sales', 'acos']
};

async function startServer(t, reportService) {
  const app = express();
  app.use(express.json());
  app.use('/api/customer/chatbot-reporting', createSummaryRouter({
    authenticate(req, res, next) {
      if (req.headers.authorization !== 'Bearer test-session') {
        return res.status(401).json({
          isSuccess: false
        });
      }

      req.user = {
        _id: identity.userId
      };
      req.config = {
        configId: identity.configId
      };
      next();
    },
    limiter(req, res, next) {
      next();
    },
    queryController: createReportController({
      reportService
    })
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const url = `http://127.0.0.1:${server.address().port}/api/customer/chatbot-reporting/query`;

  return (input, token = 'test-session') => fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(input)
  });
}

test('query HTTP path executes a real report service and preserves separate period tables', async t => {
  const reads = [];
  const reportService = createReportService({
    db: {},
    now: () => new Date('2026-10-21T12:00:00Z'),
    resolveScope: async () => ({
      configId: identity.configId,
      profiles: [profile],
      currencyGroups: [{
        currencyCode: 'INR',
        profileIds: ['1001']
      }]
    }),
    readDaily: async input => {
      reads.push(input);

      return {
        rows: [{
          campaignId: '101',
          date: input.period.fromDate,
          spend: 30,
          sales: 100,
          orders: 2,
          clicks: 10,
          impressions: 100
        }],
        verification: 'unverified',
        warnings: ['IMPORT_COVERAGE_UNVERIFIED'],
        missingInputs: ['verified import coverage'],
        sourceRefs: [{
          name: 'test daily source'
        }],
        dataAsOf: '2026-10-20T00:00:00.000Z'
      };
    }
  });
  const send = await startServer(t, reportService);
  const response = await send(body);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.isSuccess, true);
  assert.doesNotThrow(() => validateReportResponse(result.data));
  assert.equal(result.data.status, 'partial');
  assert.equal(result.data.datasets.length, 3);
  assert.ok(result.data.blocks.some(block => block.type === 'grouped_bar'));
  assert.equal(result.data.datasets[2].rows[0].currentValue, 30);
  assert.equal(result.data.datasets[2].rows[0].previousValue, 30);
  assert.equal(result.data.datasets[0].rows[0].acos, 30);
  assert.equal(reads.length, 2);
  assert.equal(reads[0].configId, identity.configId);
  assert.equal(reads[0].period.fromDate, '2026-10-14');
  assert.equal(reads[1].period.fromDate, '2026-10-07');
});

test('query HTTP denies missing authentication and arbitrary scope or database input', async t => {
  let calls = 0;
  const send = await startServer(t, createReportService({
    db: {},
    resolveScope: async () => {
      calls++;
      throw new Error('Must not resolve');
    }
  }));
  assert.equal((await send(body, 'wrong-session')).status, 401);

  for (const injection of [{
    configId: identity.configId
  }, {
    pipeline: [{
      $match: {}
    }]
  }, {
    groupBy: ['constructor']
  }]) {
    const response = await send({
      ...body,
      ...injection
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_REPORT_REQUEST');
  }

  assert.equal(calls, 0);
});

test('query HTTP sanitizes unexpected errors', async t => {
  const send = await startServer(t, async () => {
    throw new Error('mongodb://secret-host/private');
  });
  const response = await send(body);
  assert.equal(response.status, 500);
  const result = await response.json();
  assert.equal(result.error.code, 'REPORT_INTERNAL_ERROR');
  assert.ok(!JSON.stringify(result).includes('secret-host'));
});
