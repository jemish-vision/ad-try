'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readDailyReport
} = require('../api-server/services/chatbotReporting.daily');
const defaults = {
  configId: '69809498df1b0ea4ae334fc5',
  profile: {
    profileId: '2630925322373862',
    currencyCode: 'INR'
  },
  period: {
    fromDate: '2026-10-01',
    toDate: '2026-10-14',
    isPartial: false
  },
  adType: 'SP',
  dimension: 'campaign'
};

function fixture(rows = []) {
  const calls = [];
  const db = {
    collection(name) {
      return {
        find(query, options) {
          const call = {
            name,
            query,
            options
          };
          calls.push(call);

          return {
            limit(limit) {
              call.limit = limit;

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
    db,
    calls,
    read: overrides => readDailyReport({
      ...defaults,
      db,
      ...overrides
    })
  };
}

function row(overrides = {}) {
  return {
    campaignId: 123,
    reportDate: '2026-10-10',
    name: 'Paused campaign',
    status: 'PAUSED',
    spend: 35,
    sales: 70,
    orders: 2,
    clicks: 5,
    impressions: 100,
    ...overrides
  };
}

test('scope is applied before native reads with bounded time, rows and projected fields', async () => {
  const source = fixture([row()]);
  const result = await source.read();
  const call = source.calls[0];
  assert.equal(call.name, 'campaigns');
  assert.equal(String(call.query.configId), defaults.configId);
  assert.equal(call.query.profileId, Number(defaults.profile.profileId));
  assert.deepEqual(call.query.reportDate, {
    $gte: '2026-10-01',
    $lte: '2026-10-14'
  });
  assert.equal(call.query.status, undefined);
  assert.equal(call.options.maxTimeMS, 5000);
  assert.equal(call.limit, 50001);
  assert.equal(call.options.projection.streaming, undefined);
  assert.equal(call.options.projection.spend, 1);
  assert.equal(result.rows[0].spend, 35);
  assert.equal(result.rows[0].campaignId, '123');
  assert.equal(result.rows[0].profileId, defaults.profile.profileId);
});

for (const [adType, campaign, target, terms, placements] of [['SP', 'campaigns', 'targetings', 'searchterms', 'placements'], ['SB', 'sbcampaigns', 'sbtargetings', 'sbsearchterms', 'sbplacements'], ['SD', 'sdcampaigns', 'sdtargetings', 'sdsearchterms', 'sdplacements']]) {
  test(`${adType} maps every daily grain to exactly one actual collection`, async () => {
    const source = fixture();

    for (const [dimension, collection] of [['profile', campaign], ['date', campaign], ['campaign', campaign], ['keyword', target], ['target', target], ['ad_group', target], ['search_term', terms], ['placement', placements]]) {
      await source.read({
        adType,
        dimension
      });
      assert.equal(source.calls.at(-1).name, collection);
    }

    assert.equal(source.calls.length, 8);
  });
}

test('keyword reports explicitly select keyword match types', async () => {
  const source = fixture([row({
    adGroupId: 456,
    targetId: '789',
    targeting: 'shoe',
    keywordType: 'EXACT'
  })]);
  const result = await source.read({
    dimension: 'keyword',
    entity: {
      dimension: 'keyword',
      ids: ['789']
    }
  });
  assert.deepEqual(source.calls[0].query.keywordType, {
    $in: ['EXACT', 'PHRASE', 'BROAD']
  });
  assert.deepEqual(source.calls[0].query.targetId, {
    $in: ['789']
  });
  assert.equal(result.rows[0].keywordId, '789');
  assert.equal(result.rows[0].targeting, 'shoe');
  assert.equal(result.rows[0].name, 'shoe');
});

test('campaign drilldown and profile filters stay within tenant scope', async () => {
  const source = fixture();
  await source.read({
    entity: {
      dimension: 'campaign',
      ids: ['123']
    }
  });
  assert.deepEqual(source.calls[0].query.campaignId, {
    $in: [123]
  });
  await source.read({
    entity: {
      dimension: 'profile',
      ids: [defaults.profile.profileId]
    }
  });
  await assert.rejects(source.read({
    entity: {
      dimension: 'profile',
      ids: ['123']
    }
  }), {
    code: 'INVALID_REPORT_SCOPE'
  });
  await assert.rejects(source.read({
    entity: {
      dimension: 'keyword',
      ids: ['123']
    }
  }), {
    code: 'UNSUPPORTED_REPORT_SELECTION'
  });
  await assert.rejects(source.read({
    entity: {
      dimension: 'campaign',
      ids: ['$where']
    }
  }), {
    code: 'UNSUPPORTED_REPORT_SELECTION',
    statusCode: 422
  });
  await assert.rejects(source.read({
    entity: {
      dimension: 'toString',
      ids: ['123']
    }
  }), {
    code: 'UNSUPPORTED_REPORT_SELECTION'
  });
  assert.equal(source.calls.length, 2);
});

test('malformed, partial, reversed and overlong periods fail before queries', async () => {
  const source = fixture();

  for (const period of [{
    fromDate: '2026-02-30',
    toDate: '2026-03-01'
  }, {
    fromDate: '2026-10-02',
    toDate: '2026-10-01'
  }, {
    fromDate: '2026-01-01',
    toDate: '2026-04-03'
  }, {
    ...defaults.period,
    isPartial: true
  }]) {
    await assert.rejects(source.read({
      period
    }), {
      code: 'UNSUPPORTED_REPORT_PERIOD',
      statusCode: 422
    });
  }

  await source.read({
    period: {
      fromDate: '2026-01-01',
      toDate: '2026-04-02'
    }
  });
  assert.equal(source.calls.length, 1);
});

test('scope and unknown enum validation prevent collection access', async () => {
  const source = fixture();

  for (const patch of [{
    configId: 'bad'
  }, {
    profile: {
      profileId: '9007199254740993',
      currencyCode: 'USD'
    }
  }, {
    profile: {
      profileId: '123',
      currencyCode: ''
    }
  }, {
    adType: 'toString'
  }, {
    dimension: '__proto__'
  }, {
    dimension: 'product'
  }]) {
    await assert.rejects(source.read(patch));
  }

  assert.equal(source.calls.length, 0);
});

test('duplicate identity clears every row instead of allowing inflated totals', async () => {
  const result = await fixture([row(), row()]).read();
  assert.equal(result.verification, 'conflict');
  assert.deepEqual(result.rows, []);
  assert.ok(result.warnings.includes('DUPLICATE_DAILY_ROW'));
});

test('different search terms remain separate while exact unique key duplicates conflict', async () => {
  const first = row({
    adGroupId: 456,
    keywordId: null,
    searchTerm: 'red shoes'
  });
  const result = await fixture([first, {
    ...first,
    searchTerm: 'blue shoes'
  }]).read({
    dimension: 'search_term'
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].keywordId, null);
  assert.equal(result.rows[0].name, 'red shoes');
  const duplicate = await fixture([first, {
    ...first
  }]).read({
    dimension: 'search_term'
  });
  assert.equal(duplicate.verification, 'conflict');
});

test('invalid IDs, dates, missing grain identity and currency mismatch fail closed', async () => {
  for (const patch of [{
    campaignId: null
  }, {
    campaignId: 9007199254740992
  }, {
    reportDate: '2026-10-15'
  }, {
    reportDate: '2026-02-30'
  }, {
    currencyCode: 'USD'
  }]) {
    const result = await fixture([row(patch)]).read();
    assert.equal(result.verification, 'conflict');
    assert.deepEqual(result.rows, []);
  }

  assert.equal((await fixture([row()]).read({
    dimension: 'target'
  })).verification, 'conflict');
  assert.equal((await fixture([row()]).read({
    dimension: 'placement'
  })).verification, 'conflict');
});

test('missing metrics stay missing and nullable values stay null', async () => {
  const input = row({
    sales: null
  });
  delete input.orders;
  const result = await fixture([input]).read();
  assert.equal(result.rows[0].sales, null);
  assert.equal(Object.hasOwn(result.rows[0], 'orders'), false);
  assert.ok(result.missingInputs.includes('MISSING_ORDERS'));
  assert.ok(result.missingInputs.includes('MISSING_SALES'));
});

test('row existence and timestamps never imply full import coverage', async () => {
  const result = await fixture([row({
    updatedAt: new Date('2026-10-11T10:00:00Z')
  })]).read();
  assert.equal(result.verification, 'unverified');
  assert.equal(result.dataAsOf, '2026-10-11T10:00:00.000Z');
  assert.ok(result.missingInputs.includes('VERIFIED_IMPORT_COVERAGE'));
  const empty = await fixture().read();
  assert.ok(empty.missingInputs.includes('NO_REPORT_ROWS'));
  assert.deepEqual(empty.rows, []);
});

test('overflow is rejected rather than silently truncating totals', async () => {
  await assert.rejects(fixture(Array(50001).fill(row())).read(), {
    code: 'REPORT_ROW_LIMIT',
    statusCode: 422
  });
});

test('invalid metric types and fractional counts cannot reach aggregation', async () => {
  for (const patch of [{
    spend: -1
  }, {
    spend: '10'
  }, {
    sales: Infinity
  }, {
    orders: 0.5
  }, {
    impressions: NaN
  }]) {
    const result = await fixture([row(patch)]).read();
    assert.equal(result.verification, 'conflict');
    assert.deepEqual(result.rows, []);
    assert.ok(result.warnings.includes('INVALID_DAILY_METRICS'));
  }
});

test('placement rows use the readable placement label rather than campaign name', async () => {
  const result = await fixture([row({
    placement: 'TOP_OF_SEARCH'
  })]).read({
    dimension: 'placement'
  });
  assert.equal(result.rows[0].name, 'TOP_OF_SEARCH');
});
