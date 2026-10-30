const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const controller = fs.readFileSync(path.resolve(__dirname, '../api-server/controllers/targeting.controller.js'), 'utf8').replace(/\r\n/g, '\n');
const common = fs.readFileSync(path.resolve(__dirname, '../api-server/helper/common.js'), 'utf8');
const metricsContext = {};
vm.runInNewContext(common.slice(common.indexOf('const calcMetrics ='), common.indexOf('const downloadFile =')) + ';globalThis.calculate = calcMetrics;', metricsContext);

function helper() {
  const file = path.resolve(__dirname, '../api-server/helper/targetingReconciliation.helper.js');
  if (!fs.existsSync(file)) return undefined;
  const ctx = { module: { exports: {} }, require: name => {
    assert.equal(name, './common');
    return { calcMetrics: metricsContext.calculate };
  } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
  return ctx.module.exports.mergeTargetingRecords;
}

async function fixture(mode, { rVersion = 200, tVersion = 100, rMetrics = {}, tMetrics = {}, failWrite = false, raceDestination = false, raceTemporary = false, noExisting = false, rRun = 'new-run', tRun = 'old-run', rUpdated = new Date('2026-10-28T12:00:00Z'), tUpdated = new Date('2026-10-28T11:00:00Z') } = {}) {
  const identity = { configId: 'config', profileId: 1, campaignId: 2, adGroupId: 3, reportDate: '2026-10-28', targeting: 'close-match', keywordType: 'TARGETING_EXPRESSION_PREDEFINED' };
  const r = { ...identity, _id: 'r', targetId: 'R-temp', impressions: 100, clicks: 10, spend: 50, sales: 80, orders: 2, importSourceVersion: rVersion, lastImportRunId: rRun, updatedAt: rUpdated, ...rMetrics };
  const t = { ...identity, _id: 't', targetId: 'T-123', impressions: 200, clicks: 20, spend: 200, sales: 20, orders: 1, importSourceVersion: tVersion, lastImportRunId: tRun, updatedAt: tUpdated, ...tMetrics };
  const rows = new Map([['r', { ...r }], ['t', { ...t }]]);
  if (noExisting) rows.delete('t');
  const writes = [];
  const deletions = [];
  let reads = 0;
  const same = (a, b) => a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : (a ?? null) === (b ?? null);
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => value && typeof value === 'object' && '$in' in value ? value.$in.includes(row[key]) : same(row[key], value));
  const apply = async (filter, update) => {
    if (failWrite) throw new Error('write failed');
    if (raceDestination) rows.get('t').importSourceVersion = 300;
    const row = [...rows.values()].find(row => matches(row, filter));
    if (!row) return { acknowledged: true, matchedCount: 0 };
    writes.push(update);
    Object.assign(row, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete row[key];
    if (raceTemporary) rows.get('r').importSourceVersion = 400;
    return { acknowledged: true, matchedCount: 1 };
  };
  const remove = async filter => {
    deletions.push(filter);
    const row = [...rows.values()].find(row => matches(row, filter));
    if (row) rows.delete(row._id);
    return { acknowledged: true, deletedCount: row ? 1 : 0 };
  };
  const model = {
    find() { ++reads; const data = reads === 1 ? [r] : noExisting && (mode === 'clauses' || reads === 3) ? [] : [t]; return { select() { return this; }, lean: async () => data }; },
    bulkWrite: async ops => { for (const op of ops) await apply(op.updateOne.filter, op.updateOne.update); },
    updateOne: apply,
    deleteMany: remove,
    deleteOne: remove,
  };
  const ctx = { exports: {}, mongoose: { Types: { ObjectId: { isValid: () => false } } }, targetingSchema: model, cron_logs: () => {}, mergeTargetingRecords: helper() };
  if (mode === 'clauses') {
    const start = controller.indexOf('async function reconcileTargetingRRecordsForClauses(');
    const end = controller.indexOf('\n}\n', start) + 2;
    vm.runInNewContext(controller.slice(start, end) + ';globalThis.run = reconcileTargetingRRecordsForClauses;', ctx);
    await ctx.run({ configId: 'config', profileId: 1, targetingClauses: [{ ...t, status: 'PAUSED', keywordBid: 0 }] });
  } else {
    const start = controller.indexOf('exports.reconcileAllProfileTargetingRRecords =');
    const end = controller.indexOf('\n};', start) + 3;
    vm.runInNewContext(controller.slice(start, end), ctx);
    await ctx.exports.reconcileAllProfileTargetingRRecords({ configId: 'config', profileId: 1 });
  }
  return { rows, writes, deletions };
}

for (const mode of ['clauses', 'profile']) {
  test(`${mode}: newer report supplies all metrics and import tracking`, async () => {
    const f = await fixture(mode);
    const row = f.rows.get('t');
    assert.equal(row.spend, 50);
    assert.equal(row.sales, 80);
    assert.equal(row.lastImportRunId, 'new-run');
    assert.equal(row.importSourceVersion, 200);
    assert.equal(row.acos, 62.5);
    assert.equal(row.roas, 1.6);
    assert.equal(row.targetId, 'T-123');
    assert.equal(f.rows.has('r'), false);
  });
  test(`${mode}: older temporary row cannot overwrite newer genuine report`, async () => {
    const f = await fixture(mode, { rVersion: 50 });
    assert.equal(f.rows.get('t').sales, 20);
    assert.equal(f.rows.get('t').lastImportRunId, 'old-run');
  });
  test(`${mode}: zero metrics from newer report are preserved`, async () => {
    const f = await fixture(mode, { rMetrics: { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, topOfSearchImpressionShare: '0' } });
    for (const key of ['spend', 'sales', 'clicks', 'orders', 'acos', 'roas']) assert.equal(f.rows.get('t')[key], 0);
  });
  test(`${mode}: write failure never deletes temporary data`, async () => {
    const f = await fixture(mode, { failWrite: true });
    assert.equal(f.rows.has('r'), true);
    assert.equal(f.deletions.length, 0);
  });
  test(`${mode}: concurrent destination update leaves temporary row for retry`, async () => {
    const f = await fixture(mode, { raceDestination: true });
    assert.equal(f.rows.has('r'), true);
    assert.equal(f.deletions.length, 0);
  });
  test(`${mode}: concurrent temporary update is not deleted`, async () => {
    const f = await fixture(mode, { raceTemporary: true });
    assert.equal(f.rows.has('r'), true);
  });
  test(`${mode}: equal source versions retain the genuine snapshot consistently`, async () => {
    const f = await fixture(mode, { rVersion: 100 });
    const row = f.rows.get('t');
    assert.equal(row.spend, 200);
    assert.equal(row.sales, 20);
    assert.equal(row.lastImportRunId, 'old-run');
  });
  test(`${mode}: provenance takes precedence over listing update time`, async () => {
    const f = await fixture(mode, { rMetrics: { importSourceVersion: undefined, lastImportRunId: undefined }, rUpdated: new Date('2026-10-28T23:00:00Z') });
    assert.equal(f.rows.get('t').spend, 200);
    assert.equal(f.rows.get('t').lastImportRunId, 'old-run');
  });
  test(`${mode}: legacy rows use the newer full snapshot without inventing import metadata`, async () => {
    const unversioned = { importSourceVersion: undefined, lastImportRunId: undefined };
    const f = await fixture(mode, { rMetrics: unversioned, tMetrics: unversioned });
    const row = f.rows.get('t');
    assert.equal(row.spend, 50);
    assert.equal(row.sales, 80);
    assert.equal(row.importSourceVersion, undefined);
    assert.equal(row.lastImportRunId, undefined);
  });
  test(`${mode}: renaming a lone temporary row preserves its metrics and provenance`, async () => {
    const f = await fixture(mode, { noExisting: true });
    const row = f.rows.get('r');
    assert.equal(row.targetId, 'T-123');
    assert.equal(row.spend, 50);
    assert.equal(row.lastImportRunId, 'new-run');
    assert.equal(f.deletions.length, 0);
  });
}

test('targeting schema retains all recalculated metrics', () => {
  const mongoose = require('mongoose');
  const ctx = { module: { exports: {} }, require: name => name === 'mongoose' ? mongoose : { calcMetrics: metricsContext.calculate } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../api-server/models/targeting.model.js'), 'utf8'), ctx);
  const Model = ctx.module.exports;
  const update = Model.updateOne({}, { $set: { cpc: 5, ctr: 10, cvr: 20, conversionRate: 20 } });
  const cast = update._castUpdate(update.getUpdate());
  for (const field of ['cpc', 'ctr', 'cvr', 'conversionRate']) assert.equal(cast.$set[field], field === 'cpc' ? 5 : field === 'ctr' ? 10 : 20);
});
