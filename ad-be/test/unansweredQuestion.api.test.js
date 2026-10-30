'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const sift = require('sift').default;
const { parseUnansweredQuestionQuery, createUnansweredQuestionController } = require('../api-server/controllers/superAdmin/unansweredQuestion.controller');
const { createUnansweredQuestionRouter } = require('../api-server/routes/superAdmin/unansweredQuestion.route');
const { requireSuperAdmin } = require('../api-server/middleware/superAdmin.auth');

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const records = Array.from({ length: 25 }, (_, index) => ({
  _id: String(index).padStart(3, '0'), question: index === 0 ? 'Missing [profit]?' : `Unsupported question ${index}`,
  profileId: index % 2 ? 'p1' : 'p2', profileName: index % 2 ? 'One' : 'Two',
  reason: index % 2 ? 'unsupported' : 'unanswered', count: index + 1,
  firstAskedAt: new Date('2026-10-01T00:00:00Z'), lastAskedAt: new Date(`2026-10-20T${String(index % 24).padStart(2, '0')}:00:00Z`),
}));

// In-memory execution adapter checks request behavior and emitted Mongo stages;
// production Mongo execution is separately covered by integration verification.
function fakeModel(rows = records) {
  const calls = [];
  return { calls, aggregate(pipeline) {
    calls.push(pipeline);
    let options;
    return { option(value) { options = value; return this; }, then(resolve, reject) {
      assert.equal(options.maxTimeMS, 15000);
      let data = rows.slice();
      for (const stage of pipeline) {
        if (stage.$match) data = data.filter(sift(stage.$match));
        if (stage.$sort) {
          const entries = Object.entries(stage.$sort);
          data.sort((a, b) => { for (const [key, direction] of entries) { if (a[key] < b[key]) return -direction; if (a[key] > b[key]) return direction; } return 0; });
        }
        if (stage.$facet) {
          const [skip, limit] = stage.$facet.data;
          data = [{ data: data.slice(skip.$skip, skip.$skip + limit.$limit), total: data.length ? [{ count: data.length }] : [] }];
        }
        if (stage.$group) data = [...new Map(data.map(row => [row.profileId, { _id: row.profileId, profileName: row.profileName }])).values()];
        if (stage.$limit) data = data.slice(0, stage.$limit);
        if (stage.$project?.profileId) data = data.map(row => ({ profileId: row._id, profileName: row.profileName }));
      }
      return Promise.resolve(data).then(resolve, reject);
    } };
  } };
}

test('query parsing rejects injection, unbounded sizes, invalid dates and sort fields', () => {
  for (const query of [
    { page: '0' }, { page: '-1' }, { page: '1.1' }, { page: '100001' },
    { pageSize: '101' }, { pageSize: ['10'] }, { search: { $ne: '' } }, { search: 'x'.repeat(201) },
    { reason: 'anything' }, { sortBy: '$where' }, { sortOrder: 'ASC' }, { includeProfiles: 'yes' },
    { fromDate: '2026-02-30' }, { fromDate: '2026-10-20', toDate: '2026-10-19' },
  ]) assert.throws(() => parseUnansweredQuestionQuery(query), { statusCode: 400 });
});

test('filter dates include the entire UTC end day and escape regex metacharacters', () => {
  const parsed = parseUnansweredQuestionQuery({ search: '[profit]?', profileId: 'p2', reason: 'unanswered', fromDate: '2026-10-20', toDate: '2026-10-20' });
  assert.equal(parsed.match.lastAskedAt.$gte.toISOString(), '2026-10-20T00:00:00.000Z');
  assert.equal(parsed.match.lastAskedAt.$lt.toISOString(), '2026-10-21T00:00:00.000Z');
  assert.deepEqual(records.filter(sift(parsed.match)).map(row => row._id), ['000']);
  assert.deepEqual(parsed.sort, { lastAskedAt: -1, _id: -1 });
});

test('backend filters, counts, sorts, paginates, and optionally loads profile options', async () => {
  const model = fakeModel();
  const profileCalls = [];
  const profileModel = { aggregate(pipeline) {
    profileCalls.push(pipeline);
    return { option() { return Promise.resolve([
      { profileId: 'p1', profileName: 'One' },
      { profileId: 'p2', profileName: 'Two' },
      { profileId: 'p3', profileName: 'Without any questions' },
    ]); } };
  } };
  const controller = createUnansweredQuestionController({ model, profileModel });
  const res = response();
  await controller({ query: { profileId: 'p1', reason: 'unsupported', page: '2', pageSize: '5', sortBy: 'count', sortOrder: 'asc', includeProfiles: 'true' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totalRecords, 12);
  assert.equal(res.body.totalPages, 3);
  assert.deepEqual(res.body.data.map(row => row.count), [12, 14, 16, 18, 20]);
  assert.deepEqual(res.body.profiles.map(row => row.profileId), ['p1', 'p2', 'p3']);
  assert.equal(res.body.profilesTruncated, false);
  assert.equal(model.calls.length, 1);
  assert.equal(profileCalls.length, 1);
  assert.deepEqual(profileCalls[0][1].$group._id, { $toString: '$profileId' });
  assert.equal(model.calls[0][2].$facet.data[2].$project.questionTruncated, 1);
  const empty = response();
  await controller({ query: { search: 'no matches' } }, empty);
  assert.deepEqual(empty.body.data, []);
  assert.equal(empty.body.totalRecords, 0);
  assert.equal(empty.body.totalPages, 0);
  assert.equal('profiles' in empty.body, false);
  assert.equal(profileCalls.length, 1, 'pagination/search must not reload the profile directory');
});

test('stable tie ordering prevents duplicates across adjacent pages', async () => {
  const rows = records.map(row => ({ ...row, lastAskedAt: new Date('2026-10-20T00:00:00Z') }));
  const controller = createUnansweredQuestionController({ model: fakeModel(rows) });
  const first = response(); const second = response();
  await controller({ query: { pageSize: '10' } }, first);
  await controller({ query: { pageSize: '10', page: '2' } }, second);
  assert.equal(new Set([...first.body.data, ...second.body.data].map(row => row._id)).size, 20);
  assert.equal(first.body.data[0]._id, '024');
  assert.equal(second.body.data[0]._id, '014');
});

test('controller validates before database access and sanitizes database failures', async () => {
  let accessed = false;
  const controller = createUnansweredQuestionController({ model: { aggregate() { accessed = true; throw new Error('mongodb://secret'); } } });
  const invalid = response();
  await controller({ query: { page: 'bad' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(accessed, false);
  const failed = response();
  await controller({ query: {} }, failed);
  assert.equal(failed.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(failed.body), /mongodb|secret/);
});

test('HTTP endpoint denies anonymous and non-super-admin requests before listing', async t => {
  let delegated = 0;
  const app = express();
  app.use('/api/superAdmin', createUnansweredQuestionRouter({
    authenticate(req, res, next) {
      if (!req.headers.authorization) return res.status(401).json({ isSuccess: false });
      req.role = { roleName: req.headers.authorization }; next();
    },
    authorize: requireSuperAdmin,
    controller(req, res) { delegated++; return res.json({ isSuccess: true }); },
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/superAdmin/unanswered-questions`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: 'ADMIN' } })).status, 403);
  assert.equal(delegated, 0);
  assert.equal((await fetch(url, { headers: { authorization: 'SUPER_ADMIN' } })).status, 200);
  assert.equal(delegated, 1);
});

test('profiles endpoint filters, searches, and paginates profiles with hasMore', async () => {
  const { createUnansweredQuestionProfilesController, parseProfileQuery } = require('../api-server/controllers/superAdmin/unansweredQuestion.controller');
  assert.throws(() => parseProfileQuery({ page: '0' }), { statusCode: 400 });
  assert.throws(() => parseProfileQuery({ pageSize: '101' }), { statusCode: 400 });
  assert.throws(() => parseProfileQuery({ search: 'x'.repeat(101) }), { statusCode: 400 });

  const profileCalls = [];
  const profileModel = {
    aggregate(pipeline) {
      profileCalls.push(pipeline);
      return {
        option() {
          return Promise.resolve([{
            data: [
              { profileId: 'p1', profileName: 'Apple Profile', isActive: true },
              { profileId: 'p2', profileName: 'Banana Profile', isActive: true },
            ],
            total: [{ count: 5 }],
          }]);
        }
      };
    }
  };

  const controller = createUnansweredQuestionProfilesController({ profileModel });
  const res = response();
  await controller({ query: { page: '1', pageSize: '2', search: 'profile' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.isSuccess, true);
  assert.equal(res.body.totalRecords, 5);
  assert.equal(res.body.page, 1);
  assert.equal(res.body.pageSize, 2);
  assert.equal(res.body.totalPages, 3);
  assert.equal(res.body.hasMore, true);
  assert.equal(res.body.data.length, 2);
  assert.equal(profileCalls.length, 1);
});
