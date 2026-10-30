const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sift = require('sift').default;

// Exercise the real handlers with database calls stubbed; no live account writes.
function handler(file, name, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '../api-server/controllers', file), 'utf8');
  const start = source.indexOf(`exports.${name} =`);
  const next = source.indexOf('\nexports.', start + 1);
  const context = { exports: {}, ...dependencies };
  vm.runInNewContext(source.slice(start, next < 0 ? undefined : next), context);
  return context.exports[name];
}
const orgId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const mongoose = require('mongoose');
const response = () => ({ status() { return this; }, send(body) { this.body = body; return this; }, json(body) { this.body = body; return this; } });

for (const roleName of ['SUPER_ADMIN', 'MEMBER']) {
  test(`config profile flags survive every ${roleName} projection`, async () => {
    const pipelines = [];
    const aggregate = async pipeline => { pipelines.push(pipeline); return []; };
    const fn = handler('customer.controller.js', 'getAllConfigs', {
      mongoose, ROLES: { SUPER_ADMIN: 'SUPER_ADMIN' }, configSchema: { aggregate },
      profileBasedPermissionSchema: { aggregate }, write_logs: () => {},
    });
    const res = response();
    await fn({ user: { _id: 'u' }, role: { roleName }, organizationId: orgId }, res);
    assert.equal(res.body.isSuccess, true);
    let count = 0;
    for (const pipeline of pipelines) {
      for (const stage of pipeline) {
        if (stage.$lookup?.from !== 'profiles') continue;
        const projection = stage.$lookup.pipeline.find(s => s.$project).$project;
        assert.equal(projection.isAdsSyncEnabled, 1);
        assert.equal(projection.isSpSyncEnabled, 1);
        count++;
      }
    }
    assert.equal(count, roleName === 'SUPER_ADMIN' ? 1 : 2);
  });
}

for (const organizationId of [orgId, null]) {
  test(`profile eligibility and organization constraints both apply (${organizationId ? 'org' : 'legacy'})`, async () => {
    let pipeline;
    let calls = 0;
    const fn = handler('config.controller.js', 'listProfiles', {
      mongoose, profileBasedPermissionSchema: { aggregate: async p => { if (++calls === 1) return [{ configId: 'c' }]; pipeline = p; return []; } },
    });
    const res = response();
    await fn({ user: { _id: 'u' }, organizationId }, res);
    const eligibility = pipeline.find(s => s.$match?.$and)?.$match;
    assert.ok(eligibility);
    const matches = sift(eligibility);
    const config = { organizationId: new mongoose.Types.ObjectId(orgId) };
    assert.equal(matches({ isAdsActive: false, isSpActive: false, config }), false);
    assert.equal(matches({ isAdsActive: true, isSpActive: false, config }), true);
    assert.equal(matches({ isAdsActive: false, isSpActive: true, config }), true);
    if (organizationId) assert.equal(matches({ isAdsActive: true, config: { organizationId: 'other' } }), false);
  });
}
