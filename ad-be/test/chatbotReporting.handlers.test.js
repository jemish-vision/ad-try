'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createReportService,
  REPORT_HANDLERS
} = require('../api-server/services/chatbotReporting.handlers');
const auth = {
  userId: '000000000000000000000002',
  configId: '000000000000000000000001',
  organizationId: '000000000000000000000003'
};
const dimensions = ['profile', 'campaign', 'ad_group', 'keyword', 'target', 'search_term', 'placement', 'date', 'hour', 'weekday', 'product', 'rule'];

function request(overrides = {}) {
  return {
    schemaVersion: '1.0',
    category: 'summary',
    profileIds: ['1001'],
    adTypes: ['SP'],
    period: {
      preset: 'yesterday'
    },
    metrics: ['spend', 'sales', 'orders', 'acos', 'cpc', 'cvr'],
    ...overrides
  };
}

function raw(overrides = {}) {
  return {
    profileId: '1001',
    adType: 'SP',
    campaignId: '10',
    adGroupId: '20',
    keywordId: '30',
    targetId: '30',
    searchTerm: 'red shoes',
    placement: 'TOP_OF_SEARCH',
    date: '2026-10-19',
    weekday: '1',
    hour: '12',
    productId: 'B000000001',
    name: 'Campaign ten',
    spend: 10,
    sales: 100,
    clicks: 10,
    orders: 2,
    impressions: 100,
    ...overrides
  };
}

function source(rows, overrides = {}) {
  return {
    rows,
    verification: 'unverified',
    warnings: ['IMPORT_COVERAGE_UNVERIFIED'],
    missingInputs: ['VERIFIED_IMPORT_COVERAGE'],
    sourceRefs: [{
      name: 'isolated_test_source'
    }],
    dataAsOf: '2026-10-20T01:00:00.000Z',
    ...overrides
  };
}

function setup(options = {}) {
  const seen = {
    scope: [],
    daily: [],
    special: []
  };
  const service = createReportService({
    db: {},
    now: () => new Date('2026-10-20T12:00:00.000Z'),
    makeReportId: () => 'handler_test',
    resolveScope: async input => {
      seen.scope.push(input);

      if (options.scopeError) {
        throw options.scopeError;
      }

      const profiles = input.profileIds.map((profileId, index) => ({
        profileId,
        timezone: 'Asia/Kolkata',
        currencyCode: index ? 'USD' : 'INR',
        accountType: 'seller',
        adTypes: input.adTypes,
        attributionWindows: Object.fromEntries(input.adTypes.map(type => [type, 7])),
        supportedDimensions: Object.fromEntries(input.adTypes.map(type => [type, type === 'SD' ? dimensions.filter(d => !['keyword', 'search_term', 'placement'].includes(d)) : dimensions]))
      }));

      return {
        configId: auth.configId,
        profiles,
        currencyGroups: profiles.map(p => ({
          currencyCode: p.currencyCode,
          profileIds: [p.profileId]
        }))
      };
    },
    readDaily: async input => {
      seen.daily.push(input);

      if (options.readError) {
        throw options.readError;
      }

      return options.read ? options.read(input) : source(options.rows || [raw()]);
    },
    readKeywords: options.readKeywords,
    readSpecial: async input => {
      seen.special.push(input);

      return options.special ? options.special(input) : source([input.category === 'rules' ? {
        ruleId: 'rule_1',
        ruleType: 'bid',
        entityId: '10',
        name: 'Bid rule',
        changeType: 'bid',
        oldValue: 1,
        newValue: 2,
        status: 'APPLIED',
        ruleTime: '12:00',
        date: '2026-10-19',
        profileId: input.profile.profileId,
        adType: input.adType
      } : raw()]);
    }
  });

  return {
    service,
    seen
  };
}

test('budget exhaustion does not substitute campaign totals for unavailable budget history', async () => {
  const { service, seen } = setup();
  const result = await service(request({ category: 'growth', groupBy: ['campaign'] }), auth);

  assert.equal(seen.daily.length, 0);
  assert.equal(result.status, 'unavailable');
  assert.ok(result.datasets.every(dataset => dataset.rows.length === 0));
  assert.match(result.freshness.missingInputs.join(' '), /budget exhaustion/);
});

test('all ten approved categories dispatch to their declared source families', async () => {
  assert.equal(Object.keys(REPORT_HANDLERS).length, 10);

  for (const category of Object.keys(REPORT_HANDLERS)) {
    const {
      service,
      seen
    } = setup();
    const result = await service(category === 'definition' ? {
      schemaVersion: '1.0',
      category,
      metrics: ['tacos']
    } : request({
      category
    }), auth);
    assert.equal(result.category, category);
    const family = REPORT_HANDLERS[category].source;
    assert.equal(seen.daily.length, family === 'daily' ? 1 : 0, category);
    assert.equal(seen.special.length, family === 'special' ? 1 : 0, category);
    assert.equal(seen.scope.length, family === 'glossary' ? 0 : 1, category);
  }
});

test('weighted KPIs use sums of base quantities instead of averages of ratios', async () => {
  const {
    service
  } = setup({
    rows: [raw(), raw({
      spend: 90,
      sales: 100,
      clicks: 90,
      orders: 8
    })]
  });
  const result = await service(request(), auth);
  const values = result.datasets[0].rows[0];
  assert.equal(values.spend, 100);
  assert.equal(values.sales, 200);
  assert.equal(values.acos, 50);
  assert.equal(values.cpc, 1);
  assert.equal(values.cvr, 10);
  assert.equal(result.status, 'partial');
  assert.equal(result.freshness.status, 'partial');
  assert.ok(result.freshness.missingInputs.some(value => value.includes('verified import coverage')));
});

test('metric filters run after aggregation and can use metrics omitted from output', async () => {
  const {
    service
  } = setup({
    rows: [raw({
      spend: 20
    }), raw({
      spend: 20
    })]
  });
  const result = await service(request({
    metrics: ['sales'],
    groupBy: ['campaign'],
    filters: [{
      field: 'spend',
      operator: 'gt',
      value: 30,
      currencyCode: 'INR'
    }]
  }), auth);
  assert.equal(result.datasets[0].rows.length, 1);
  assert.equal(result.datasets[0].rows[0].sales, 200);
  assert.equal(Object.hasOwn(result.datasets[0].rows[0], 'spend'), false);
});

test('observed valid data with no filter matches is distinct from unavailable source data', async () => {
  const {
    service
  } = setup({
    rows: [raw()]
  });
  const result = await service(request({
    filters: [{
      field: 'spend',
      operator: 'gt',
      value: 1000,
      currencyCode: 'INR'
    }]
  }), auth);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.datasets[0].rows, []);
  assert.equal(result.datasets[0].page.total, 0);
  assert.equal(result.freshness.status, 'partial');
});

test('explicit descending sort and paging return exact observed total', async () => {
  const {
    service
  } = setup({
    rows: [raw({
      campaignId: '1',
      spend: 2
    }), raw({
      campaignId: '2',
      spend: 10
    }), raw({
      campaignId: '3',
      spend: 5
    })]
  });
  const result = await service(request({
    metrics: ['spend'],
    groupBy: ['campaign'],
    sort: {
      field: 'spend',
      direction: 'desc'
    },
    limit: 1,
    offset: 1
  }), auth);
  assert.equal(result.datasets[0].rows[0].campaignId, '3');
  assert.deepEqual(result.datasets[0].page, {
    offset: 1,
    limit: 1,
    total: 3,
    hasMore: true
  });
  const beyond = await service(request({
    groupBy: ['campaign'],
    offset: 10
  }), auth);
  assert.deepEqual(beyond.datasets[0].rows, []);
  assert.equal(beyond.datasets[0].page.total, 3);
  assert.equal(beyond.datasets[0].page.offset, 10);
  assert.equal(beyond.status, 'partial');
});

test('profiles, currencies, ad types and comparison periods remain separate datasets', async () => {
  const {
    service,
    seen
  } = setup({
    read: input => source([raw({
      spend: input.profile.currencyCode === 'USD' ? 50 : 10
    })])
  });
  const result = await service(request({
    profileIds: ['1001', '1002'],
    adTypes: ['SP', 'SB'],
    comparison: {
      mode: 'previous_period'
    }
  }), auth);
  assert.equal(seen.daily.length, 8);
  const sources = result.datasets.filter(item => /^report_\d+$/.test(item.id));
  const charts = result.datasets.filter(item => /^chart_comparison_\d+$/.test(item.id));
  assert.equal(sources.length, 8);
  assert.equal(sources.filter(item => item.currencyCode === 'USD').length, 4);
  assert.equal(sources.filter(item => item.currencyCode === 'INR').length, 4);
  assert.equal(charts.length, 4);
  assert.equal(charts.filter(item => item.currencyCode === 'USD').length, 2);
  assert.equal(charts.filter(item => item.currencyCode === 'INR').length, 2);
  assert.equal(result.datasets.length, sources.length + charts.length);
  for (const chart of charts) {
    const expectedSpend = chart.currencyCode === 'USD' ? 50 : 10;
    assert.equal(chart.rows[0].currentValue, expectedSpend);
    assert.equal(chart.rows[0].previousValue, expectedSpend);
    assert.ok(result.blocks.some(block => block.type === 'grouped_bar' && block.datasetId === chart.id));
  }
  assert.equal(result.datasets[0].rows[0].spend, 10);
  assert.equal(result.datasets[4].rows[0].spend, 50);
  assert.equal(seen.daily[0].period.fromDate, '2026-10-19');
  assert.equal(seen.daily[1].period.fromDate, '2026-10-18');
});

test('leaf identifiers retain campaign and ad-group ancestors to avoid collisions', async () => {
  for (const dimension of ['keyword', 'target', 'search_term']) {
    const {
      service
    } = setup({
      rows: [raw({
        campaignId: '1',
        adGroupId: '1'
      }), raw({
        campaignId: '2',
        adGroupId: '1'
      }), raw({
        campaignId: '2',
        adGroupId: '2'
      })]
    });
    const result = await service(request({
      category: 'change',
      groupBy: [dimension]
    }), auth);
    assert.equal(result.datasets[0].rows.length, 3, dimension);
    assert.ok(result.datasets[0].columns.some(column => column.key === 'campaignId'));
    assert.ok(result.datasets[0].columns.some(column => column.key === 'adGroupId'));
  }
});

test('mixed reporting grains and omitted sort metrics reject before any reads', async () => {
  const {
    service,
    seen
  } = setup();

  for (const patch of [{
    category: 'waste',
    groupBy: ['keyword', 'placement']
  }, {
    category: 'change',
    groupBy: ['target'],
    entity: {
      dimension: 'search_term',
      ids: ['shoes']
    }
  }, {
    metrics: ['sales'],
    sort: {
      field: 'spend',
      direction: 'desc'
    }
  }]) {
    await assert.rejects(service(request(patch), auth), error => error.statusCode === 422);
  }

  assert.equal(seen.scope.length, 0);
  assert.equal(seen.daily.length, 0);
});

test('unknown fields, query operators and fake scope cannot reach data readers', async () => {
  const {
    service,
    seen
  } = setup();

  for (const patch of [{
    configId: auth.configId
  }, {
    profileIds: [{
      $ne: null
    }]
  }, {
    filters: [{
      field: '$where',
      operator: 'eq',
      value: 1
    }]
  }, {
    entity: {
      dimension: 'campaign',
      ids: [{
        $gt: 0
      }]
    }
  }, {
    category: 'constructor'
  }]) {
    await assert.rejects(service(request(patch), auth), error => error.statusCode === 400);
  }

  assert.equal(seen.scope.length, 0);
  assert.equal(seen.daily.length, 0);
});

test('missing authenticated identity and denied scope never reach data readers', async () => {
  const noIdentity = setup();
  await assert.rejects(noIdentity.service(request(), {}), {
    statusCode: 401
  });
  assert.equal(noIdentity.seen.scope.length, 0);
  const denied = setup({
    scopeError: Object.assign(new Error('Denied'), {
      statusCode: 403,
      code: 'FORBIDDEN'
    })
  });
  await assert.rejects(denied.service(request(), auth), {
    statusCode: 403
  });
  assert.equal(denied.seen.daily.length, 0);
  assert.equal(denied.seen.special.length, 0);
});

test('source budget and date bounds stop oversized requests before data reads', async () => {
  const {
    service,
    seen
  } = setup();
  await assert.rejects(service(request({
    profileIds: Array.from({
      length: 11
    }, (_, i) => String(1001 + i)),
    comparison: {
      mode: 'previous_period'
    }
  }), auth), {
    code: 'REPORT_SCOPE_LIMIT'
  });
  await assert.rejects(service(request({
    period: {
      preset: 'custom',
      fromDate: '2026-01-01',
      toDate: '2026-04-03'
    }
  }), auth), {
    code: 'REPORT_DATE_LIMIT'
  });
  const currentDay = await service(request({
    period: {
      preset: 'today'
    }
  }), auth);
  assert.equal(currentDay.status, 'unavailable');
  assert.equal(currentDay.cards.length, 0);
  assert.ok(currentDay.freshness.missingInputs.length > 0);
  assert.equal(seen.daily.length, 0);
});

test('definitions need no database or profile lookup and never invent benchmarks', async () => {
  const service = createReportService({
    db: () => {
      throw new Error('No database allowed');
    },
    resolveScope: () => {
      throw new Error('No scope lookup allowed');
    }
  });
  const result = await service({
    schemaVersion: '1.0',
    category: 'definition',
    metrics: ['acos', 'tacos']
  }, auth);
  assert.equal(result.status, 'ok');
  assert.equal(result.scope, null);
  assert.match(result.text, /no category benchmark/);
  assert.match(result.text, /including organic sales/);
});

test('unsupported product profit and untrusted hourly orders remain unavailable', async () => {
  for (const [category, metric] of [['products', 'profit'], ['time', 'cvr']]) {
    const {
      service
    } = setup({
      special: () => source([raw({
        orders: null
      })], {
        missingInputs: ['VALIDATED_ORDER_SEMANTICS_OR_COSTS']
      })
    });
    const result = await service(request({
      category,
      metrics: [metric]
    }), auth);
    assert.equal(result.status, 'unavailable');
    assert.ok(result.datasets.every(dataset => dataset.rows.length === 0));
    assert.ok(result.freshness.missingInputs.some(value => value.includes('supported requested metrics')));
  }
});

test('rules retain applied/failed statuses and old/new values as strings', async () => {
  const {
    service
  } = setup();
  const result = await service(request({
    category: 'rules'
  }), auth);
  const record = result.datasets[0].rows[0];
  assert.equal(record.oldValue, '1');
  assert.equal(record.newValue, '2');
  assert.equal(record.status, 'APPLIED');
  assert.equal(record.ruleId, 'rule_1');
  assert.ok(Object.values(record).every(value => typeof value === 'string'));
});

test('source conflicts discard numeric evidence and database failures are sanitized', async () => {
  const conflict = setup({
    read: () => source([raw()], {
      verification: 'conflict',
      warnings: ['DUPLICATE_DAILY_ROW']
    })
  });
  const result = await conflict.service(request(), auth);
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.datasets, []);
  const broken = setup({
    readError: new Error('mongodb://secret-password')
  });
  await assert.rejects(broken.service(request(), auth), error => error.statusCode === 503 && !error.message.includes('secret'));
});

test('profile entities select requested profiles without forwarding foreign IDs to readers', async () => {
  const {
    service,
    seen
  } = setup();
  const result = await service(request({
    profileIds: ['1001', '1002'],
    entity: {
      dimension: 'profile',
      ids: ['1002']
    }
  }), auth);
  assert.equal(result.datasets.length, 1);
  assert.equal(seen.daily[0].profile.profileId, '1002');
  assert.equal(seen.daily[0].entity, undefined);
});

test('hourly order-based filters reject before source access until order semantics are validated', async () => {
  const {
    service,
    seen
  } = setup();

  for (const field of ['orders', 'cvr', 'aov']) {
    const filter = {
      field,
      operator: 'gt',
      value: 1
    };

    if (field === 'aov') {
      filter.currencyCode = 'INR';
    }

    await assert.rejects(service(request({
      category: 'time',
      filters: [filter]
    }), auth), {
      statusCode: 422,
      code: 'UNSUPPORTED_HOURLY_FILTER'
    });
  }

  assert.equal(seen.scope.length, 0);
  assert.equal(seen.special.length, 0);
});

test('product filter inputs are explicitly requested from the specialized source', async () => {
  for (const field of ['profit', 'tacos', 'stock']) {
    const {
      service,
      seen
    } = setup({
      special: () => source([], {
        missingInputs: [`UNSUPPORTED_${field.toUpperCase()}`]
      })
    });
    const filter = {
      field,
      operator: 'gt',
      value: 1
    };

    if (field === 'profit') {
      filter.currencyCode = 'INR';
    }

    const result = await service(request({
      category: 'products',
      metrics: ['sales'],
      filters: [filter]
    }), auth);
    assert.deepEqual(seen.special[0].metrics, ['sales', field]);
    assert.equal(result.status, 'unavailable');
    assert.ok(result.freshness.missingInputs.some(value => value.includes(`UNSUPPORTED_${field.toUpperCase()}`)));
  }
});

test('source user identity is injected from auth and a body userId is rejected', async () => {
  const {
    service,
    seen
  } = setup();
  await service(request(), auth);
  await service(request({
    category: 'rules'
  }), auth);
  assert.equal(seen.daily[0].userId, auth.userId);
  assert.equal(seen.special[0].userId, auth.userId);
  const fresh = setup();
  await assert.rejects(fresh.service(request({
    userId: '000000000000000000000099'
  }), auth), {
    statusCode: 400,
    code: 'INVALID_REPORT_REQUEST'
  });
  assert.equal(fresh.seen.scope.length, 0);
  assert.equal(fresh.seen.daily.length, 0);
});

test('future, overlapping and unequal custom periods return a clear client error before reads', async () => {
  const {
    service,
    seen
  } = setup();
  const patches = [{
    period: {
      preset: 'custom',
      fromDate: '2026-10-21',
      toDate: '2026-10-22'
    }
  }, {
    period: {
      preset: 'custom',
      fromDate: '2026-10-10',
      toDate: '2026-10-12'
    },
    comparison: {
      mode: 'custom',
      fromDate: '2026-10-09',
      toDate: '2026-10-11'
    }
  }, {
    period: {
      preset: 'custom',
      fromDate: '2026-10-10',
      toDate: '2026-10-12'
    },
    comparison: {
      mode: 'custom',
      fromDate: '2026-10-07',
      toDate: '2026-10-08'
    }
  }];

  for (const patch of patches) {
    await assert.rejects(service(request(patch), auth), {
      statusCode: 400,
      code: 'INVALID_REPORT_PERIOD'
    });
  }

  assert.equal(seen.daily.length, 0);
  assert.equal(seen.special.length, 0);
});

test('a money filter in another currency is rejected before source reads', async () => {
  const {
    service,
    seen
  } = setup();
  await assert.rejects(service(request({
    filters: [{
      field: 'spend',
      operator: 'gt',
      value: 30,
      currencyCode: 'USD'
    }]
  }), auth), {
    statusCode: 400,
    code: 'REPORT_CURRENCY_MISMATCH',
    currencyCode: 'INR'
  });
  assert.equal(seen.daily.length, 0);
  assert.equal(seen.special.length, 0);
});


test('Step 5: summary report computes KPI cards and opt-in top movers table', async () => {
  const currentRows = [
    raw({ campaignId: 'c1', spend: 50, sales: 200, clicks: 50, orders: 10 }),
    raw({ campaignId: 'c2', spend: 50, sales: 100, clicks: 50, orders: 5 }),
  ];
  const comparisonRows = [
    raw({ campaignId: 'c1', spend: 20, sales: 100, clicks: 20, orders: 5 }),
    raw({ campaignId: 'c2', spend: 30, sales: 100, clicks: 30, orders: 5 }),
  ];

  const { service } = setup({
    read: input => source(
      input.period.fromDate === '2026-10-19' ? currentRows : comparisonRows,
      { verification: 'verified', warnings: [], missingInputs: [] }
    ),
  });

  const result = await service(request({
    category: 'summary',
    comparison: { mode: 'previous_period' },
    analysis: { includeMovers: true },
  }), auth);

  assert.equal(result.status, 'partial');
  assert.equal(result.cards.length, 6); // spend, sales, orders, acos, cpc, cvr
  const spendCard = result.cards.find(c => c.metric === 'spend');
  assert.equal(spendCard.value, 100);
  assert.equal(spendCard.comparison.previousValue, 50);

  // Mover dataset was added
  const moverDataset = result.datasets.find(d => d.id.includes('movers'));
  assert.ok(moverDataset);
  assert.equal(moverDataset.rows.length, 1); // c1 had sales change from 100 to 200
  assert.ok(result.blocks.some(b => b.type === 'number_card'));
  assert.ok(result.blocks.some(b => b.type === 'table' && b.datasetId.includes('movers')));
});

test('Step 5: change explanation decomposes metric drivers and links them to movers', async () => {
  const currentRows = [
    raw({ campaignId: 'c1', spend: 100, sales: 100, clicks: 20, orders: 2 }), // CPC = 5, CVR = 10%
  ];
  const comparisonRows = [
    raw({ campaignId: 'c1', spend: 40, sales: 100, clicks: 20, orders: 5 }), // CPC = 2, CVR = 25%
  ];

  const { service } = setup({
    read: input => source(
      input.period.fromDate === '2026-10-19' ? currentRows : comparisonRows,
      { verification: 'verified', warnings: [], missingInputs: [] }
    ),
  });

  const result = await service(request({
    category: 'change',
    metrics: ['acos'],
    comparison: { mode: 'previous_period' },
  }), auth);

  assert.equal(result.status, 'partial');
  assert.ok(result.text.includes('higher CPC'));
  assert.ok(result.text.includes('lower conversion rate'));
  assert.ok(result.datasets.some(d => d.id.includes('movers')));
});

test('Step 5: waste reporting separates zero-sales spenders from high-ACOS spenders', async () => {
  const rows = [
    raw({ campaignId: 'c1', spend: 40, sales: 0, clicks: 25, orders: 0 }),
    raw({ campaignId: 'c2', spend: 60, sales: 50, clicks: 30, orders: 1, acos: 120 }),
  ];

  const { service } = setup({
    read: () => source(rows, { verification: 'verified', warnings: [], missingInputs: [] }),
  });

  const result = await service(request({
    category: 'waste',
    metrics: ['spend', 'sales', 'clicks', 'orders', 'acos'],
    groupBy: ['campaign'],
    filters: [{ field: 'spend', operator: 'gt', value: 30, currencyCode: 'INR' }],
  }), auth);

  assert.equal(result.status, 'partial');
  const noSales = result.datasets.find(d => d.id.includes('no_sales'));
  const highAcos = result.datasets.find(d => d.id.includes('high_acos'));
  assert.ok(noSales);
  assert.ok(highAcos);
  assert.equal(noSales.rows.length, 1);
  assert.equal(noSales.rows[0].campaignId, 'c1');
  assert.equal(highAcos.rows.length, 1);
  assert.equal(highAcos.rows[0].campaignId, 'c2');
});

test('Step 5: growth reporting with search terms checks keyword inventory', async () => {
  const rows = [
    raw({ campaignId: 'c1', adGroupId: 'a1', searchTerm: 'wireless headphones', spend: 20, sales: 100, clicks: 25, orders: 5, impressions: 80 }),
  ];

  const { service } = setup({
    read: () => source(rows, { verification: 'verified', warnings: [], missingInputs: [] }),
    readKeywords: async () => ({
      rows: [{ campaignId: 'c1', adGroupId: 'a1', text: 'wired headphones', matchType: 'EXACT', status: 'enabled' }],
      verified: true,
      dataAsOf: '2026-10-20T11:00:00.000Z',
    }),
  });

  const result = await service(request({
    category: 'growth',
    metrics: ['spend', 'sales', 'clicks', 'orders', 'acos', 'cvr'],
    groupBy: ['search_term'],
    analysis: { targetAcos: 35 },
  }), auth);

  assert.equal(result.status, 'partial');
  assert.ok(result.datasets.some(d => d.id.includes('opportunities')));
  assert.ok(result.text.includes('wireless headphones') || result.text.includes('target'));
});

test('Step 5: time reporting generates 24x7 heatmap grid block', async () => {
  const rows = [
    raw({ weekday: '1', hour: '10', spend: 20, sales: 100, clicks: 20, orders: 4 }),
  ];

  const { service } = setup({
    special: () => source(rows, { verification: 'verified', warnings: [], missingInputs: [] }),
  });

  const result = await service(request({
    category: 'time',
    metrics: ['spend', 'sales', 'clicks', 'orders', 'cvr'],
    groupBy: ['weekday', 'hour'],
  }), auth);

  assert.equal(result.status, 'partial');
  assert.ok(result.blocks.some(b => b.type === 'heatmap'));
  const grid = result.datasets.find(d => d.id.includes('time_grid'));
  assert.ok(grid);
  assert.equal(grid.rows.length, 168);
});
