'use strict';

const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const {
  readSpecialReport
} = require('../api-server/services/chatbotReporting.special');
const configId = '507f1f77bcf86cd799439011';
const userId = '507f1f77bcf86cd799439014';
const profile = {
  profileId: '12345',
  currencyCode: 'USD',
  adTypes: ['SP', 'SB', 'SD'],
  attributionWindows: {
    SP: 7,
    SB: 14,
    SD: 14
  }
};
const period = {
  fromDate: '2026-10-01',
  toDate: '2026-10-14',
  isPartial: false
};
const hourly = (extra = {}) => ({
  campaignId: 12,
  adGroupId: 13,
  keywordId: 14,
  placement: 'Top of Search',
  reportDate: '2026-10-01',
  startTime: '08:00',
  spends: 4,
  sales: 12,
  orders: 999,
  clicks: 2,
  impressions: 100,
  currency: 'USD',
  ...extra
});
const product = (extra = {}) => ({
  reportDate: '2026-10-01',
  adId: 15,
  campaignId: 12,
  asins: 'B012345678',
  sku: 'sku1',
  spend: 4,
  sales: 12,
  orders: 1,
  clicks: 2,
  impressions: 100,
  ...extra
});

function setup(rows = []) {
  const calls = [];
  const db = {
    collection(name) {
      return {
        find(filter, options) {
          const call = {
            name,
            filter,
            options
          };
          calls.push(call);

          return {
            limit(value) {
              call.limit = value;

              return this;
            },
            async toArray() {
              return rows;
            }
          };
        }
      };
    }
  };

  return {
    calls,
    run: extra => readSpecialReport({
      db,
      profile,
      configId,
      userId,
      period,
      adType: 'SP',
      category: 'time',
      dimension: 'hour',
      ...extra
    })
  };
}

test('hourly conversion uses 7-day attributed units as a provisional proxy (not blocked)', async () => {
  for (const primary of ['cvr', 'orders', 'aov']) {
    const { run, calls } = setup([hourly()]);
    const report = await run({ metrics: [primary, 'clicks'] });
    assert.equal(calls.length, 1, 'reads the hourly source');
    assert.equal(report.rows[0].orders, 999, 'attributed units carried through as provisional orders');
    assert.ok(report.warnings.includes('HOURLY_ORDERS_ARE_UNITS'));
    assert.ok(report.warnings.some(message => /provisional/i.test(message)));
    assert.ok(!report.missingInputs.some(message => /order counts have not been verified/i.test(message)));
  }
});

test('hourly conversion is still blocked when the attribution window does not match', async () => {
  const { run, calls } = setup([hourly()]);
  const report = await run({ metrics: ['cvr', 'clicks'], profile: { ...profile, attributionWindows: { SP: 14 } } });
  assert.equal(calls.length, 0, 'fails preflight before any read');
  assert.deepEqual(report.rows, []);
  assert.ok(report.missingInputs.some(message => /attribution window/i.test(message)));
});

test('hourly source is profile/config/type/date scoped and bounded without mixing daily grains', async () => {
  const {
    run,
    calls
  } = setup([hourly()]);
  const report = await run({
    entity: {
      dimension: 'campaign',
      ids: ['12']
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'keywordshourlyperformances');
  assert.equal(String(calls[0].filter.configId), configId);
  assert.equal(calls[0].filter.profileId, 12345);
  assert.equal(calls[0].filter.type, 'SP');
  assert.deepEqual(calls[0].filter.reportDate, {
    $gte: period.fromDate,
    $lte: period.toDate
  });
  assert.deepEqual(calls[0].filter.campaignId, {
    $in: [12]
  });
  assert.equal(calls[0].options.maxTimeMS, 5000);
  assert.equal(calls[0].limit, 50001);
  assert.equal(calls[0].options.projection.orders, 1);
  assert.equal(report.rows[0].spend, 4);
  assert.equal(report.rows[0].hour, 8);
  assert.equal(report.rows[0].weekday, 4);
  assert.equal(report.rows[0].orders, 999);
  assert.ok(report.warnings.includes('HOURLY_ORDERS_ARE_UNITS'));
  assert.equal(report.verification, 'unverified');
});

test('hourly sales are withheld when source seven-day attribution mismatches profile', async () => {
  const {
    run
  } = setup([hourly()]);
  const report = await run({
    profile: {
      ...profile,
      attributionWindows: {
        SP: 14
      }
    }
  });
  assert.equal(report.rows[0].sales, null);
  assert.equal(report.rows[0].spend, 4);
  assert.ok(report.warnings.includes('HOURLY_ATTRIBUTION_WINDOW_MISMATCH'));
});

test('hourly duplicate identity and raw/consolidated overlap cannot double count', async () => {
  for (const rows of [[hourly(), hourly()], [hourly(), hourly({
    startTime: '09:00',
    isHourlyAggregated: true
  })]]) {
    const report = await setup(rows).run();
    assert.equal(report.verification, 'conflict');
    assert.deepEqual(report.rows, []);
  }
});

test('hourly invalid times, missing hierarchy and mismatched currency fail closed', async () => {
  for (const extra of [{
    startTime: '25:00'
  }, {
    campaignId: null
  }, {
    adGroupId: null
  }, {
    currency: 'EUR'
  }, {
    currency: null
  }, {
    currency: ''
  }]) {
    const report = await setup([hourly(extra)]).run();
    assert.equal(report.verification, 'conflict');
    assert.deepEqual(report.rows, []);
  }
});

test('partial-hour reports and absent rows remain missing rather than zero', async () => {
  const partial = setup([hourly()]);
  const report = await partial.run({
    period: {
      ...period,
      isPartial: true
    }
  });
  assert.deepEqual(report.rows, []);
  assert.equal(partial.calls.length, 0);
  assert.ok(report.missingInputs.length);
  const empty = await setup().run();
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.verification, 'unverified');
  assert.ok(empty.missingInputs.some(value => value.includes('No scoped source rows')));
});

test('product ad reports normalize SP and SD metrics at ad/day grain', async () => {
  for (const adType of ['SP', 'SD']) {
    const {
      run,
      calls
    } = setup([product()]);
    const report = await run({
      category: 'products',
      dimension: 'product',
      adType,
      entity: {
        dimension: 'product',
        ids: ['B012345678']
      },
      metrics: ['spend', 'sales']
    });
    assert.equal(calls[0].name, adType === 'SP' ? 'product_ads' : 'sdproductads');
    assert.deepEqual(calls[0].filter.asins, {
      $in: ['B012345678']
    });
    assert.equal(calls[0].filter.profileId, 12345);
    assert.equal(String(calls[0].filter.configId), configId);
    assert.deepEqual(report.rows[0], {
      profileId: '12345',
      adType,
      date: '2026-10-01',
      productId: 'B012345678',
      sku: 'sku1',
      name: 'B012345678',
      campaignId: '12',
      spend: 4,
      sales: adType === 'SP' ? 12 : null,
      orders: adType === 'SP' ? 1 : null,
      clicks: 2,
      impressions: 100
    });

    if (adType === 'SD') {
      assert.ok(report.warnings.includes('PRODUCT_ATTRIBUTION_WINDOW_UNVERIFIED'));
    }
  }
});

test('profit, TACOS and stock require explicit joins instead of zero costs or missing inventory', async () => {
  for (const metric of ['profit', 'tacos', 'stock', 'days_of_stock']) {
    const {
      run,
      calls
    } = setup([product()]);
    const report = await run({
      category: 'products',
      dimension: 'product',
      metrics: [metric]
    });
    assert.deepEqual(report.rows, []);
    assert.ok(report.missingInputs.length);
    assert.equal(calls.length, 0);
  }

  const report = await setup().run({
    category: 'products',
    dimension: 'product',
    adType: 'SB'
  });
  assert.ok(report.missingInputs[0].includes('Sponsored Brands'));
});

test('product prerequisite checks run before any database access for every ad type', async () => {
  const db = { collection() { throw new Error('Product advertising data must not be read for unavailable joins'); } };
  for (const adType of ['SP', 'SB', 'SD']) {
    for (const metric of ['profit', 'tacos', 'stock', 'days_of_stock']) {
      const report = await setup().run({ db, category: 'products', dimension: 'product',
        adType, metrics: [metric, 'spend', 'sales'] });
      assert.deepEqual(report.rows, []);
      assert.equal(report.verification, 'unverified');
      assert.equal(report.missingInputs.length, 1);
      if (metric === 'profit') {
        assert.match(report.missingInputs[0], /costs.*fees/);
        assert.doesNotMatch(report.missingInputs[0], /TACOS|organic/);
      }
    }
  }
  await assert.rejects(() => setup().run({ db, category: 'products', dimension: 'product',
    metrics: ['spend', 'sales'] }), /Product advertising data must not be read/);
});

test('current-week rule history reads available records through today with owner scope', async () => {
  const { run, calls } = setup([{
    ruleId: '507f1f77bcf86cd799439012', ruleDate: '2026-10-20', campaignId: 12,
    changed: 'BID', oldValue: '1.00', newValue: '1.20'
  }]);
  const report = await run({ category: 'rules', dimension: 'rule', period: {
    fromDate: '2026-10-19', toDate: '2026-10-22', isPartial: true
  } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].filter.ruleDate, { $gte: '2026-10-19', $lte: '2026-10-22' });
  assert.equal(String(calls[0].filter.userId), userId);
  assert.equal(String(calls[0].filter.configId), configId);
  assert.equal(calls[0].filter.profileId, Number(profile.profileId));
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].status, 'history_snapshot');
  assert.ok(report.warnings.some(warning => warning.includes('still updating')));
});

test('empty partial rule history describes missing records without claiming no changes', async () => {
  const { run, calls } = setup();
  const report = await run({ category: 'rules', dimension: 'rule', period: { ...period, isPartial: true } });
  assert.equal(calls.length, 1);
  assert.deepEqual(report.rows, []);
  assert.ok(report.missingInputs.some(message => message.startsWith('No matching rule-history records found')));
  assert.ok(report.missingInputs.some(message => message.includes('does not establish that no changes occurred')));
});

test('product duplicate identities, absent ASIN and currency conflicts are withheld', async () => {
  for (const rows of [[product(), product()], [product({
    asins: null
  })], [product({
    currencyCode: 'EUR'
  })], [product({
    currencyCode: null
  })], [product({
    currencyCode: ''
  })]]) {
    const report = await setup(rows).run({
      category: 'products',
      dimension: 'product'
    });
    assert.deepEqual(report.rows, []);
    assert.equal(report.verification, 'conflict');
  }
});

test('rule history projects no metric snapshots and labels records as history, never applied proof', async () => {
  const {
    run,
    calls
  } = setup([{
    ruleId: '507f1f77bcf86cd799439012',
    ruleSchema: 'BudgetRule',
    ruleDate: '2026-10-02',
    ruleTime: '10:30',
    campaignId: 12,
    name: 'Campaign',
    changed: 'budget',
    oldValue: '10',
    newValue: '15',
    metricsHistory: [{
      secret: true
    }]
  }]);
  const report = await run({
    category: 'rules',
    dimension: 'rule',
    entity: {
      dimension: 'rule',
      ids: ['507f1f77bcf86cd799439012']
    }
  });
  assert.equal(calls[0].name, 'affectedcampaignbyrules');
  assert.deepEqual(calls[0].filter.ruleDate, {
    $gte: period.fromDate,
    $lte: period.toDate
  });
  assert.equal(calls[0].filter.reportDate, undefined);
  assert.equal(calls[0].filter.profileId, 12345);
  assert.equal(String(calls[0].filter.configId), configId);
  assert.equal(calls[0].filter.type, 'SP');
  assert.equal(calls[0].options.projection.metricsHistory, undefined);
  assert.equal(String(calls[0].filter.userId), userId);
  assert.equal(report.rows[0].status, 'history_snapshot');
  assert.equal(report.rows[0].oldValue, '10');
  assert.equal(report.rows[0].newValue, '15');
  assert.equal(report.rows[0].metricsHistory, undefined);
  assert.ok(report.warnings.includes('RULE_HISTORY_IS_NOT_APPLIED_EXECUTION_PROOF'));
});

test('invalid scope, excessive/invalid dates, unsupported dimension/ad type/entity reject before reads', async () => {
  for (const extra of [{
    configId: 'bad'
  }, {
    profile: {
      ...profile,
      profileId: '9007199254740993'
    }
  }, {
    adType: 'X'
  }, {
    profile: {
      ...profile,
      adTypes: ['SB']
    }
  }, {
    period: {
      ...period,
      fromDate: '2026-02-30'
    }
  }, {
    period: {
      fromDate: '2026-01-01',
      toDate: '2026-04-03'
    }
  }, {
    dimension: 'keyword'
  }, {
    entity: {
      dimension: 'rule',
      ids: ['1']
    }
  }, {
    entity: {
      dimension: 'campaign',
      ids: ['9007199254740993']
    }
  }, {
    adType: 'SD',
    entity: {
      dimension: 'keyword',
      ids: ['14']
    }
  }, {
    category: 'waste'
  }]) {
    const {
      run,
      calls
    } = setup();
    await assert.rejects(() => run(extra), error => error.statusCode === 422);
    assert.equal(calls.length, 0);
  }
});

test('rule old/new values preserve numeric zero and booleans; malformed identities are withheld', async () => {
  const rule = {
    ruleId: '507f1f77bcf86cd799439012',
    ruleDate: '2026-10-02',
    campaignId: 12
  };
  const report = await setup([{
    ...rule,
    oldValue: 0,
    newValue: 1.25
  }, {
    ...rule,
    oldValue: false,
    newValue: true
  }]).run({
    category: 'rules',
    dimension: 'rule'
  });
  assert.equal(report.rows[0].oldValue, '0');
  assert.equal(report.rows[0].newValue, '1.25');
  assert.equal(report.rows[1].oldValue, 'false');
  assert.equal(report.rows[1].newValue, 'true');

  for (const extra of [{
    ruleId: 'invalid'
  }, {
    campaignId: null
  }, {
    ruleDate: '2026-02-30'
  }]) {
    const invalid = await setup([{
      ...rule,
      ...extra
    }]).run({
      category: 'rules',
      dimension: 'rule'
    });
    assert.equal(invalid.verification, 'conflict');
    assert.deepEqual(invalid.rows, []);
  }
});

test('rule history requires an authenticated owner before reading and accepts canonical ObjectIds', async () => {
  for (const value of [undefined, null, '', 'invalid']) {
    const {
      run,
      calls
    } = setup();
    await assert.rejects(() => run({
      category: 'rules',
      dimension: 'rule',
      userId: value
    }), error => error.statusCode === 401);
    assert.equal(calls.length, 0);
  }

  const {
    Types: {
      ObjectId
    }
  } = require('mongoose');
  const {
    run,
    calls
  } = setup();
  await run({
    category: 'rules',
    dimension: 'rule',
    userId: new ObjectId(userId)
  });
  assert.equal(String(calls[0].filter.userId), userId);
});

test('row cap withholds truncated hourly data and invalid numbers cannot become zero', async () => {
  const limited = await setup(new Array(50001).fill(hourly())).run();
  assert.deepEqual(limited.rows, []);
  assert.equal(limited.verification, 'unverified');
  assert.ok(limited.missingInputs.some(message => message.includes('shorter date range')));
  await assert.rejects(() => setup([hourly({
    spends: -1
  })]).run(), error => error.code === 'INVALID_SOURCE_DATA');
  const report = await setup([hourly({
    spends: null,
    clicks: undefined
  })]).run();
  assert.equal(report.rows[0].spend, null);
  assert.equal(report.rows[0].clicks, null);
});

test('hourly query timeout gives a scoped limitation while other database failures still propagate', async () => {
  for (const code of [50, 6]) {
    const input = setup();
    const db = { collection() { return { find() { return { limit() { return this; },
      async toArray() { throw Object.assign(new Error('Database read failed'), { code }); }
    }; } }; } };
    if (code === 50) {
      const report = await input.run({ db });
      assert.deepEqual(report.rows, []);
      assert.ok(report.missingInputs.some(message => message.includes('select one campaign')));
    } else {
      await assert.rejects(() => input.run({ db }), error => error.code === code);
    }
  }
});

test('ingestion timestamp is reported separately from unverified completeness', async () => {
  const report = await setup([hourly({
    updatedAt: new Date('2026-10-15T01:00:00Z')
  })]).run();
  assert.equal(report.dataAsOf, '2026-10-15T01:00:00.000Z');
  assert.equal(report.verification, 'unverified');
  assert.ok(report.warnings.includes('SOURCE_COMPLETENESS_UNVERIFIED'));
});


test('hourly database aggregation preserves exact values and checks original identity provenance', async () => {
  const mockAggregated = [
    {
      _id: { reportDate: '2026-10-01', startTime: '08:00' },
      spends: 25.5,
      sales: 10,
      clicks: 12,
      impressions: 450,
      updatedAt: new Date('2026-10-01T09:00:00Z'),
      currencies: ['USD'],
      forms: ['raw']
    },
    {
      _id: { reportDate: '2026-10-01', startTime: '09:00' },
      spends: 30.0,
      sales: 120.0,
      clicks: 15,
      impressions: 500,
      updatedAt: new Date('2026-10-01T10:00:00Z'),
      currencies: ['USD'],
      forms: ['raw']
    }
  ];

  let capturedPipeline;
  const db = {
    collection(name) {
      assert.equal(name, 'keywordshourlyperformances');
      return {
        aggregate(pipeline) {
          capturedPipeline = pipeline;
          return {
            async toArray() {
              return mockAggregated;
            }
          };
        }
      };
    }
  };

  const report = await setup().run({ db });
  assert.ok(capturedPipeline, 'aggregation pipeline was executed');
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0].hour, 8);
  assert.equal(report.rows[0].spend, 25.5);
  assert.equal(report.rows[0].sales, 10);
  assert.equal(report.rows[0].clicks, 12);
  assert.equal(report.rows[1].sales, 120.0);
  assert.equal(report.dataAsOf, '2026-10-01T10:00:00.000Z');
  assert.deepEqual(capturedPipeline[1].$group.count, { $sum: 1 });
  assert.ok(capturedPipeline[1].$group.invalid, 'original values are checked before sums hide them');
  assert.ok(capturedPipeline[2].$group.spendsMissing, 'missing values retain explicit provenance');
  mockAggregated[0].spendsMissing = 1;
  assert.equal((await setup().run({ db })).rows[0].spend, null);
  delete mockAggregated[0].spendsMissing;
  mockAggregated[0].sales = -10;
  await assert.rejects(() => setup().run({ db }), error => error.code === 'INVALID_SOURCE_DATA');
  mockAggregated[0].sales = 10;
  mockAggregated[0].clicks = 1.5;
  await assert.rejects(() => setup().run({ db }), error => error.code === 'INVALID_SOURCE_DATA');
  mockAggregated[0].clicks = 12;
  for (const flag of ['duplicate', 'invalid']) {
    mockAggregated[0][flag] = 1;
    const conflictReport = await setup().run({ db });
    assert.equal(conflictReport.verification, 'conflict');
    assert.deepEqual(conflictReport.rows, []);
    delete mockAggregated[0][flag];
  }

  const overlappingDb = {
    collection() {
      return {
        aggregate() {
          return {
            async toArray() {
              return [{
                _id: { reportDate: '2026-10-01', startTime: '08:00' },
                forms: ['raw', 'consolidated'],
                spends: 10, sales: 20, clicks: 5, impressions: 100
              }];
            }
          };
        }
      };
    }
  };
  const overlapReport = await setup().run({ db: overlappingDb });
  assert.equal(overlapReport.verification, 'conflict');
  assert.ok(overlapReport.warnings.includes('OVERLAPPING_HOURLY_CONSOLIDATION'));

  const mismatchDb = {
    collection() {
      return {
        aggregate() {
          return {
            async toArray() {
              return [{
                _id: { reportDate: '2026-10-01', startTime: '08:00' },
                forms: ['raw'],
                currencies: ['EUR'],
                spends: 10, sales: 20, clicks: 5, impressions: 100
              }];
            }
          };
        }
      };
    }
  };
  const mismatchReport = await setup().run({ db: mismatchDb });
  assert.equal(mismatchReport.verification, 'conflict');
  assert.ok(mismatchReport.warnings.includes('SOURCE_CURRENCY_MISMATCH'));
});
