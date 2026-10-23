'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readKeywordInventory } = require('../api-server/services/chatbotReporting/keywordInventory');

test('historical keyword storage cannot establish a complete current snapshot', async () => {
  let databaseRead = false;
  const result = await readKeywordInventory({
    db: { collection() { databaseRead = true; throw new Error('Unexpected read'); } },
    configId: 'a'.repeat(24),
    profile: { profileId: '123' },
    adType: 'SP',
    now: new Date(),
  });
  assert.equal(databaseRead, false);
  assert.deepEqual(result.rows, []);
  assert.equal(result.verified, false);
  assert.equal(result.dataAsOf, null);
  assert.match(result.missingInputs[0], /complete, dated current keyword inventory/);
});
