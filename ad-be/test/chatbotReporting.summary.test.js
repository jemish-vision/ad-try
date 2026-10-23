'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSummaryService
} = require('../api-server/services/chatbotReporting.summary');
const {
  validateReportResponse
} = require('../api-server/contracts/chatbotReporting.contract');
const fixtures = require('../../R-AdvertiseIQ/src/helper/chatbot/fixtures/reporting.v1.json');
const oracle = require('./fixtures/chatbotReporting.reference.json');
const clone = value => JSON.parse(JSON.stringify(value));
const metrics = ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr'];
const auth = {
  userId: '000000000000000000000002',
  configId: '000000000000000000000001',
  organizationId: '000000000000000000000003'
};
const request = () => ({
  schemaVersion: '1.0',
  category: 'summary',
  profileIds: ['1001'],
  adTypes: ['SP'],
  period: {
    preset: 'yesterday'
  },
  comparison: {
    mode: 'previous_period'
  },
  metrics: [...metrics]
});

function period(rows, verification = 'verified') {
  return {
    rows,
    verification,
    sourceRefs: [{
      name: 'fixture_campaign_report',
      completedAt: '2026-10-20T02:00:00.000Z'
    }],
    dataAsOf: '2026-10-20T02:00:00.000Z',
    warnings: []
  };
}

function setup(options = {}) {
  const seen = {
    permissions: [],
    scopes: [],
    reads: []
  };
  const db = {};
  const scope = clone(fixtures.scenarios[0].response.scope);
  const service = createSummaryService({
    db,
    now: () => new Date('2026-10-20T12:00:00.000Z'),
    makeReportId: () => 'summary_test_001',
    checkReportPermission: async (...args) => {
      seen.permissions.push(args);

      if (options.denied) {
        throw Object.assign(new Error('Forbidden'), {
          statusCode: 403,
          code: 'FORBIDDEN'
        });
      }

      return true;
    },
    resolveScope: async (...args) => {
      seen.scopes.push(args);

      if (options.scopeError) {
        throw options.scopeError;
      }

      // Mirror the real resolver boundary: authorization is rechecked inside scope resolution.
      await args[2].checkReportPermission(auth.userId, auth.organizationId);

      return scope;
    },
    readPeriods: async input => {
      seen.reads.push(input);

      if (options.readError) {
        throw options.readError;
      }

      return options.source || {
        current: period(clone(oracle.weightedSummary.rows)),
        comparison: period([clone(oracle.weightedSummary.previousTotals)])
      };
    }
  });

  return {
    service,
    seen,
    db
  };
}

const card = (report, metric) => report.cards.find(item => item.metric === metric);

test('summary returns a strict v1 report with independently weighted seven metrics', async () => {
  const {
    service,
    seen,
    db
  } = setup();
  const result = await service(request(), auth);
  assert.doesNotThrow(() => validateReportResponse(result));
  assert.equal(result.reportId, 'summary_test_001');
  assert.equal(result.dataOrigin, 'reporting');
  assert.equal(result.category, 'summary');
  assert.deepEqual(result.cards.map(item => item.metric).sort(), [...metrics].sort());

  for (const metric of metrics) {
    assert.equal(card(result, metric).value, oracle.weightedSummary.expectedValues[metric], metric);
  }

  for (const metric of ['acos', 'cpc', 'cvr']) {
    for (const [key, expected] of Object.entries(oracle.weightedSummary.expectedChanges[metric])) {
      assert.ok(Math.abs(card(result, metric).comparison[key] - expected) < 1e-10 || card(result, metric).comparison[key] === expected, `${metric}.${key}`);
    }
  }

  assert.equal(seen.reads.length, 1);
  assert.equal(seen.reads[0].db, db);
  assert.equal(result.periods[0].current.fromDate, '2026-10-19');
  assert.equal(result.periods[0].comparison.fromDate, '2026-10-18');
  assert.ok(result.freshness.sourceRefs.some(source => source.name === 'fixture_campaign_report'));
  assert.equal(result.freshness.dataAsOf, '2026-10-20T02:00:00.000Z');
});

test('public request remains unchanged while the service resolves backend-only context', async () => {
  const input = request();
  const before = clone(input);
  const {
    service
  } = setup();
  await service(input, auth);
  assert.deepEqual(input, before);
});

test('summary resolves scope and verifies report permission before reading', async () => {
  const {
    service,
    seen
  } = setup({
    denied: true
  });
  await assert.rejects(() => service(request(), auth), error => error.statusCode === 403);
  assert.equal(seen.reads.length, 0);
});

test('foreign or invalid profile scope is rejected before reporting reads', async () => {
  const {
    service,
    seen
  } = setup({
    scopeError: Object.assign(new Error('Forbidden profile'), {
      statusCode: 403,
      code: 'FORBIDDEN'
    })
  });
  await assert.rejects(() => service(request(), auth), error => error.statusCode === 403);
  assert.equal(seen.reads.length, 0);
});

test('invalid and unsupported requests fail before scope/database access', async () => {
  const patches = [{
    configId: auth.configId
  }, {
    organizationId: auth.organizationId
  }, {
    profileIds: ['1001', '1002']
  }, {
    category: 'waste'
  }, {
    adTypes: ['SB']
  }, {
    period: {
      preset: 'last_7_days'
    }
  }, {
    comparison: {
      mode: 'none'
    }
  }, {
    metrics: ['spend']
  }, {
    filters: [{
      field: 'orders',
      operator: 'eq',
      value: 0
    }]
  }, {
    groupBy: ['campaign']
  }, {
    sort: {
      field: 'spend',
      direction: 'desc'
    }
  }, {
    entity: {
      dimension: 'campaign',
      ids: ['100']
    }
  }, {
    offset: 1
  }, {
    profileIds: ['bad']
  }, {
    presentation: 'heatmap'
  }];

  for (const patch of patches) {
    const {
      service,
      seen
    } = setup();
    await assert.rejects(() => service({
      ...request(),
      ...patch
    }, auth), error => [400, 422].includes(error.statusCode), JSON.stringify(patch));
    assert.equal(seen.reads.length, 0);
    assert.equal(seen.scopes.length, 0);
  }

  for (const body of [null, [], 'summary']) {
    const {
      service,
      seen
    } = setup();
    await assert.rejects(() => service(body, auth));
    assert.equal(seen.reads.length, 0);
  }
});

test('missing authentication cannot invoke reporting reads', async () => {
  for (const context of [undefined, {}, {
    userId: auth.userId
  }]) {
    let reads = 0;
    const service = createSummaryService({
      db: {},
      checkReportPermission: async () => true,
      readPeriods: async () => {
        reads++;
        throw new Error('Unexpected read');
      }
    });
    await assert.rejects(() => service(request(), context), error => [401, 403].includes(error.statusCode));
    assert.equal(reads, 0);
  }
});

test('zero sales keeps zero ROAS/CVR and undefined ACOS explicit', async () => {
  const {
    service
  } = setup({
    source: {
      current: period([clone(oracle.zeroSales.totals)]),
      comparison: period([clone(oracle.weightedSummary.previousTotals)])
    }
  });
  const result = await service(request(), auth);
  assert.doesNotThrow(() => validateReportResponse(result));
  assert.equal(card(result, 'acos').value, null);
  assert.equal(card(result, 'acos').status, 'no_sales');
  assert.equal(card(result, 'roas').value, 0);
  assert.equal(card(result, 'cvr').value, 0);
  assert.equal(card(result, 'orders').value, 0);
});

test('missing source sales is not silently treated as zero sales', async () => {
  const {
    service
  } = setup({
    source: {
      current: period(clone(oracle.missingSales.rows)),
      comparison: period([clone(oracle.weightedSummary.previousTotals)])
    }
  });
  const result = await service(request(), auth);
  assert.doesNotThrow(() => validateReportResponse(result));
  assert.equal(result.status, 'partial');
  assert.equal(card(result, 'spend').value, 120);

  for (const metric of ['sales', 'acos', 'roas']) {
    assert.equal(card(result, metric).value, null);
    assert.equal(card(result, metric).status, 'missing_data');
  }
});

test('unverified previous data does not manufacture growth comparisons', async () => {
  const {
    service
  } = setup({
    source: {
      current: period(clone(oracle.weightedSummary.rows)),
      comparison: period([clone(oracle.weightedSummary.previousTotals)], 'unverified')
    }
  });
  const result = await service(request(), auth);
  assert.doesNotThrow(() => validateReportResponse(result));

  for (const item of result.cards) {
    assert.equal(item.comparison.status, 'unavailable');
    assert.equal(item.comparison.previousValue, null);
    assert.equal(item.comparison.absoluteChange, null);
    assert.equal(item.comparison.relativeChangePercent, null);
  }
});

test('observed but unverified data is explicitly partial', async () => {
  const {
    service
  } = setup({
    source: {
      current: period(clone(oracle.weightedSummary.rows), 'unverified'),
      comparison: period([])
    }
  });
  const result = await service(request(), auth);
  assert.doesNotThrow(() => validateReportResponse(result));
  assert.equal(result.status, 'partial');
  assert.equal(card(result, 'spend').value, 120);
  assert.ok(result.warnings.length > 0);
});

test('unverified empty data and conflicts cannot become a successful zero report', async () => {
  for (const source of [period([], 'unverified'), period(clone(oracle.weightedSummary.rows), 'conflict')]) {
    const {
      service
    } = setup({
      source: {
        current: source,
        comparison: period([])
      }
    });
    const result = await service(request(), auth);
    assert.doesNotThrow(() => validateReportResponse(result));
    assert.equal(result.status, 'unavailable');
    assert.equal(result.cards.filter(item => item.value !== null).length, 0);
    assert.ok(result.warnings.length > 0);
  }
});

test('verified empty current and previous reports represent real zero activity', async () => {
  const {
    service
  } = setup({
    source: {
      current: period([]),
      comparison: period([])
    }
  });
  const result = await service(request(), auth);
  assert.doesNotThrow(() => validateReportResponse(result));
  assert.equal(result.status, 'empty');
  assert.equal(card(result, 'spend').value, 0);
  assert.equal(card(result, 'orders').value, 0);
  assert.equal(card(result, 'spend').comparison.status, 'both_zero');
});

test('database errors reject instead of returning synthetic success', async () => {
  const {
    service
  } = setup({
    readError: new Error('Database unavailable')
  });
  await assert.rejects(() => service(request(), auth));
});
