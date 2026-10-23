'use strict';

const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const {
  readSummaryPeriods
} = require('../api-server/services/chatbotReporting.repository');
const configId = '507f1f77bcf86cd799439011';
const scope = {
  configId,
  profiles: [{
    profileId: '12345',
    currencyCode: 'USD'
  }]
};
const day = '2026-10-20';
const periods = {
  timezone: 'Asia/Kolkata',
  current: {
    fromDate: day,
    toDate: day,
    isPartial: false
  },
  comparison: null
};
const row = (overrides = {}) => ({
  campaignId: 1,
  reportDate: day,
  spend: 5,
  sales: 20,
  clicks: 2,
  impressions: 100,
  orders: 1,
  lastImportRunId: 'run1',
  updatedAt: new Date('2026-10-21T00:00:00Z'),
  ...overrides
});
const manifest = (overrides = {}) => ({
  reportId: 'report1',
  startDate: day,
  endDate: day,
  status: 'COMPLETED',
  importRunId: 'run1',
  verifiedRows: 1,
  completedAt: new Date('2026-10-21T01:00:00Z'),
  ...overrides
});

function database({
  rows = [row()],
  completed = [manifest()],
  incomplete = [],
  count = rows.length
} = {}) {
  const calls = [];
  const db = {
    collection(name) {
      assert.ok(['campaigns', 'reports'].includes(name));

      return {
        find(filter, options) {
          const call = {
            name,
            operation: 'find',
            filter,
            options
          };
          calls.push(call);
          const records = name === 'campaigns' ? rows : filter.status === 'COMPLETED' ? completed : incomplete;

          return {
            sort(order) {
              call.sort = order;

              return this;
            },
            limit(limit) {
              call.limit = limit;

              return this;
            },
            async toArray() {
              return records.slice(0, call.limit);
            }
          };
        },
        async countDocuments(filter, options) {
          calls.push({
            name,
            operation: 'count',
            filter,
            options
          });

          return count;
        }
      };
    }
  };

  return {
    db,
    calls
  };
}

async function read(options) {
  const fixture = database(options);
  const result = await readSummaryPeriods({
    db: fixture.db,
    scope,
    periods
  });

  return {
    ...fixture,
    ...result
  };
}

test('reads all campaign statuses with exact profile/day scope, narrow projection, and bounded queries', async () => {
  const {
    current,
    calls
  } = await read();
  assert.equal(current.verification, 'verified');
  assert.equal(current.dataAsOf, '2026-10-21T01:00:00.000Z');
  assert.deepEqual(current.sourceRefs, [{
    name: 'SP campaign report report1',
    importRunId: 'run1',
    completedAt: '2026-10-21T01:00:00.000Z'
  }]);
  assert.equal(String(calls[0].filter.configId), configId);
  assert.deepEqual(calls[0].filter, {
    configId: calls[0].filter.configId,
    profileId: 12345,
    reportDate: day
  });
  assert.equal(calls[0].options.projection.streaming, undefined);
  assert.equal(calls[0].options.projection.status, undefined);
  assert.equal(calls[0].limit, 50001);

  for (const call of calls) {
    assert.equal(call.options.maxTimeMS, 5000);
  }

  for (const call of calls.filter(item => item.name === 'reports')) {
    assert.equal(call.filter.profileId, 12345);
    assert.equal(call.filter.reportName, 'CAMPAIGNS');
    assert.equal(call.filter.reportTypeId, 'spCampaigns');
    assert.equal(call.limit, 20);
  }

  assert.deepEqual(calls[1].sort, {
    completedAt: -1,
    createdAt: -1,
    _id: -1
  });
});

test('verified empty single-day and multi-day runs are distinguished from no report', async () => {
  const zero = await read({
    rows: [],
    completed: [manifest({
      verifiedRows: 0
    })],
    count: 0
  });
  assert.equal(zero.current.verification, 'verified');
  const emptyDay = await read({
    rows: [],
    completed: [manifest({
      startDate: '2026-10-19',
      verifiedRows: 4
    })],
    count: 4
  });
  assert.equal(emptyDay.current.verification, 'verified');
  const countCall = emptyDay.calls.find(call => call.operation === 'count');
  assert.deepEqual(countCall.filter.reportDate, {
    $gte: '2026-10-19',
    $lte: day
  });
  assert.equal(countCall.filter.lastImportRunId, 'run1');
  assert.equal(countCall.filter.profileId, 12345);
  assert.equal(String(countCall.filter.configId), configId);
  const missing = await read({
    rows: [],
    completed: []
  });
  assert.equal(missing.current.verification, 'unverified');
  assert.equal(missing.current.dataAsOf, null);
  assert.ok(missing.current.warnings.includes('NO_COMPLETED_IMPORT'));
});

test('COMPLETED without real completion, run ID, and verified count cannot prove completeness', async () => {
  for (const overrides of [{
    completedAt: null
  }, {
    importRunId: ''
  }, {
    verifiedRows: undefined
  }, {
    verifiedRows: -1
  }, {
    verifiedRows: 1.2
  }]) {
    const {
      current
    } = await read({
      completed: [manifest(overrides)]
    });
    assert.equal(current.verification, 'unverified');
    assert.ok(current.warnings.includes('IMPORT_VERIFICATION_METADATA_MISSING'));
  }
});

test('zero verified count with observed rows is a conflict', async () => {
  const {
    current
  } = await read({
    completed: [manifest({
      verifiedRows: 0
    })]
  });
  assert.equal(current.verification, 'conflict');
  assert.ok(current.warnings.includes('ZERO_IMPORT_HAS_OBSERVED_ROWS'));
});

test('run count mismatch cannot verify a report', async () => {
  const {
    current
  } = await read({
    count: 0
  });
  assert.equal(current.verification, 'unverified');
  assert.ok(current.warnings.includes('IMPORT_RUN_COUNT_MISMATCH'));
});

test('untagged, obsolete, or mixed-run rows are returned as unverified', async () => {
  for (const run of [undefined, 'old-run']) {
    const {
      current,
      calls
    } = await read({
      rows: [row({
        lastImportRunId: run
      })]
    });
    assert.equal(current.verification, 'unverified');
    assert.ok(current.warnings.includes('ROWS_NOT_FROM_COMPLETED_IMPORT'));
    assert.equal(calls.some(call => call.operation === 'count'), false);
  }
});

test('does not default missing or null metrics to zero', async () => {
  const sparse = row({
    sales: null
  });
  delete sparse.orders;
  const {
    current
  } = await read({
    rows: [sparse]
  });
  assert.equal(current.rows[0].sales, null);
  assert.equal(Object.hasOwn(current.rows[0], 'orders'), false);
});

test('duplicate campaign/date identities report conflict instead of silently summing', async () => {
  const {
    current
  } = await read({
    rows: [row(), row()]
  });
  assert.equal(current.verification, 'conflict');
  assert.ok(current.warnings.includes('DUPLICATE_CAMPAIGN_DATE'));
});

test('malformed campaign/date identity cannot produce verified numeric totals', async () => {
  for (const overrides of [{
    campaignId: undefined
  }, {
    campaignId: null
  }, {
    campaignId: ''
  }, {
    campaignId: '1'
  }, {
    campaignId: -1
  }, {
    campaignId: 1.5
  }, {
    reportDate: undefined
  }, {
    reportDate: null
  }, {
    reportDate: '2026-10-19'
  }]) {
    const {
      current,
      calls
    } = await read({
      rows: [row(overrides)]
    });
    assert.equal(current.verification, 'conflict');
    assert.ok(current.warnings.includes('INVALID_CAMPAIGN_DATE_IDENTITY'));
    assert.equal(calls.length, 1);
  }
});

test('explicit currency must match profile while absent currency remains supported for legacy rows', async () => {
  const matching = await read({
    rows: [row({
      currencyCode: 'USD'
    })]
  });
  assert.equal(matching.current.verification, 'verified');
  const legacy = await read();
  assert.equal(legacy.current.verification, 'verified');

  for (const currencyCode of ['EUR', 'usd', '', null]) {
    const {
      current,
      calls
    } = await read({
      rows: [row({
        currencyCode
      })]
    });
    assert.equal(current.verification, 'conflict');
    assert.ok(current.warnings.includes('CAMPAIGN_CURRENCY_MISMATCH'));
    assert.equal(calls.length, 1);
  }
});

test('newer incomplete import warns even when older completed run remains verifiable', async () => {
  const {
    current
  } = await read({
    incomplete: [manifest({
      status: 'FAILED',
      updatedAt: new Date('2026-10-21T02:00:00Z')
    })]
  });
  assert.equal(current.verification, 'verified');
  assert.ok(current.warnings.includes('NEWER_INCOMPLETE_IMPORT'));
});

test('rejects row overflow explicitly and does not issue additional reads', async () => {
  const fixture = database({
    rows: Array.from({
      length: 50001
    }, (_, campaignId) => row({
      campaignId
    }))
  });
  await assert.rejects(readSummaryPeriods({
    db: fixture.db,
    scope,
    periods
  }), {
    code: 'REPORT_ROW_LIMIT'
  });
  assert.equal(fixture.calls.length, 1);
});

test('rejects invalid or ambiguous scope and unsupported periods', async () => {
  const {
    db
  } = database();

  for (const invalid of [{
    ...scope,
    configId: 'invalid'
  }, {
    ...scope,
    profiles: []
  }, {
    ...scope,
    profiles: [{
      profileId: '9007199254740993'
    }]
  }, {
    ...scope,
    profiles: [{
      profileId: 12345
    }]
  }]) {
    await assert.rejects(readSummaryPeriods({
      db,
      scope: invalid,
      periods
    }), {
      code: 'INVALID_REPORT_SCOPE'
    });
  }

  await assert.rejects(readSummaryPeriods({
    db,
    scope,
    periods: {
      current: {
        fromDate: day,
        toDate: '2026-10-21'
      }
    }
  }), {
    code: 'UNSUPPORTED_REPORT_PERIOD'
  });
});

test('returns separate current and comparison results', async () => {
  const {
    db,
    calls
  } = database();
  const result = await readSummaryPeriods({
    db,
    scope,
    periods: {
      ...periods,
      comparison: {
        fromDate: '2026-10-19',
        toDate: '2026-10-19'
      }
    }
  });
  assert.ok(result.current);
  assert.ok(result.comparison);
  assert.deepEqual(calls.filter(call => call.name === 'campaigns' && call.operation === 'find').map(call => call.filter.reportDate), [day, '2026-10-19']);
});
