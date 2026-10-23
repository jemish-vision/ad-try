'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readDailyReport } = require('../api-server/services/chatbotReporting.daily');

function requestWithDatabaseError(error) {
  const calls = [];

  return {
    calls,
    input: {
      configId: '69809498df1b0ea4ae334fc5',
      profile: { profileId: '2630925322373862', currencyCode: 'INR' },
      period: { fromDate: '2026-10-19', toDate: '2026-10-21', isPartial: false },
      adType: 'SP',
      dimension: 'search_term',
      db: {
        collection(name) {
          return {
            find(query, options) {
              const call = { name, query, options };
              calls.push(call);

              return {
                limit(value) {
                  call.limit = value;
                  return this;
                },
                async toArray() {
                  throw error;
                }
              };
            }
          };
        }
      }
    }
  };
}

for (const error of [
  Object.assign(new Error('Internal database detail'), { code: 50 }),
  Object.assign(new Error('Internal database detail'), { codeName: 'MaxTimeMSExpired' })
]) {
  test(`daily timeout ${error.code || error.codeName} returns a safe narrowing explanation`, async () => {
    const fixture = requestWithDatabaseError(error);

    await assert.rejects(readDailyReport(fixture.input), failure => {
      assert.equal(failure.statusCode, 422);
      assert.equal(failure.code, 'REPORT_QUERY_TIMEOUT');
      assert.match(failure.message, /fewer dates or a single campaign/);
      assert.doesNotMatch(failure.message, /Internal database detail/);
      return true;
    });

    assert.equal(fixture.calls.length, 1, 'The timed-out query is not retried with weaker limits');
    const [call] = fixture.calls;
    assert.equal(call.name, 'searchterms');
    assert.equal(String(call.query.configId), fixture.input.configId);
    assert.equal(call.query.profileId, Number(fixture.input.profile.profileId));
    assert.deepEqual(call.query.reportDate, {
      $gte: '2026-10-19', $lte: '2026-10-21'
    });
    assert.equal(call.options.maxTimeMS, 5000);
    assert.equal(call.limit, 50001);
    assert.equal(call.options.projection.currencyCode, 1);
    assert.equal(call.options.projection.updatedAt, 1);
  });
}

test('unrelated source failures retain their original identity for upstream handling', async () => {
  const original = Object.assign(new Error('Connection interrupted'), { code: 'ECONNRESET' });
  const fixture = requestWithDatabaseError(original);

  await assert.rejects(readDailyReport(fixture.input), failure => failure === original);
});
