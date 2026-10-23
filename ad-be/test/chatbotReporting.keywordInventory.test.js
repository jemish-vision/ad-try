'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { readKeywordInventory } = require('../api-server/services/chatbotReporting/keywordInventory');

const HEX24 = 'a'.repeat(24);
const NOW = new Date('2026-10-22T12:00:00.000Z');

function fakeDb(rows) {
  return {
    collection(name) {
      const data = name === 'keywords' ? rows : [];
      return {
        find() {
          return {
            limit() {
              return { toArray: async () => data };
            },
          };
        },
      };
    },
  };
}

test('reads the keywords collection into a best-effort inventory', async () => {
  const rows = [
    // same keyword across two report dates collapses to one identity
    { campaignId: 1, adGroupId: 2, name: 'red shoes', matchType: 'EXACT', status: 'enabled' },
    { campaignId: 1, adGroupId: 2, name: 'red shoes', matchType: 'EXACT', status: 'enabled' },
    { campaignId: 3, adGroupId: 4, name: 'blue boots', matchType: 'PHRASE', status: 'paused' },
    // dropped: unusable rows never poison the inventory
    { campaignId: 5, adGroupId: 6, name: '', matchType: 'EXACT', status: 'enabled' },
    { campaignId: 7, adGroupId: 8, name: 'x', matchType: 'NEGATIVE', status: 'enabled' },
  ];
  const result = await readKeywordInventory({
    db: fakeDb(rows), configId: HEX24, profile: { profileId: '1001' }, now: NOW.getTime(),
  });

  assert.equal(result.bestEffort, true);
  assert.equal(result.verified, false);
  assert.equal(result.dataAsOf, NOW.toISOString());
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every(row => row.campaignId && row.adGroupId && row.text && row.matchType));
});

test('returns the unavailable fallback when nothing usable is found', async () => {
  const result = await readKeywordInventory({
    db: fakeDb([]), configId: HEX24, profile: { profileId: '1001' }, now: NOW.getTime(),
  });
  assert.deepEqual(result.rows, []);
  assert.equal(result.verified, false);
  assert.equal(result.bestEffort, false);
  assert.equal(result.dataAsOf, null);
  assert.match(result.missingInputs[0], /keyword inventory/);
});

test('without a database it never claims an inventory', async () => {
  const result = await readKeywordInventory({ configId: HEX24, profile: { profileId: '1001' } });
  assert.equal(result.bestEffort, false);
  assert.deepEqual(result.rows, []);
});

test('a database error degrades to the fallback, never throws', async () => {
  const db = { collection() { return { find() { throw new Error('boom'); } }; } };
  const result = await readKeywordInventory({ db, configId: HEX24, profile: { profileId: '1001' }, now: NOW.getTime() });
  assert.equal(result.bestEffort, false);
  assert.deepEqual(result.rows, []);
});

test('accepts an ObjectId configId as well as a hex string', async () => {
  const result = await readKeywordInventory({
    db: fakeDb([{ campaignId: 1, adGroupId: 2, name: 'red shoes', matchType: 'BROAD', status: 'enabled' }]),
    configId: new Types.ObjectId(HEX24), profile: { profileId: '1001' }, now: NOW.getTime(),
  });
  assert.equal(result.rows.length, 1);
});
