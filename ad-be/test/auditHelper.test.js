const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
function load(insertMany) {
  const errors = [];
  const context = { module: { exports: {} }, require: () => ({ insertMany }), console: { error: (...args) => errors.push(args) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/helpers/auditHelper.js'), 'utf8'), context);
  return { ...context.module.exports, errors };
}
test('audit batch writes all entries with unordered insertMany and awaits completion', async () => {
  let release;
  let called = false;
  const pendingInsert = new Promise(resolve => release = resolve);
  const entries = [{ event: 'RECOMMENDATION_DISMISSED', metadata: { spend: 0 } }];
  const { logAuditBatch } = load(async (rows, options) => {
    called = true;
    assert.equal(rows, entries);
    assert.equal(options.ordered, false);
    await pendingInsert;
  });
  let finished = false;
  const operation = logAuditBatch(entries).then(() => { finished = true; });
  assert.equal(called, true);
  assert.equal(finished, false);
  release();
  await operation;
  assert.equal(finished, true);
});
test('empty audit batch does not issue a database write', async () => {
  const { logAuditBatch } = load(() => { throw new Error('unexpected write'); });
  await logAuditBatch([]);
});
test('audit batch failure preserves best-effort behavior and reports the error', async () => {
  const failure = new Error('audit database unavailable');
  const { logAuditBatch, errors } = load(async () => { throw failure; });
  await logAuditBatch([{ event: 'RECOMMENDATION_DISMISSED' }]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1], failure);
});
