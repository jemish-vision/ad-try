const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const moment = require('moment');
const jobs = require('../../worker-service/cronJobs.enum');
const { ROLES } = require('../../api-server/constants/roles');
const { historicalReportFilter } = require('../../api-server/helper/historicalSyncReports');

const read = name => fs.readFileSync(require.resolve(`../../api-server/${name}`), 'utf8');
const config = read('controllers/config.controller');
const organization = read('controllers/organization.controller');
const reply = () => ({ status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; } });
const objectIds = { Types: { ObjectId: { isValid: id => /^[a-f0-9]{24}$/.test(id) } } };
const configId = '111111111111111111111111';

function loadExport(source, name, dependencies) {
    const start = source.indexOf(`exports.${name} =`);
    const end = source.indexOf('\nexports.', start + 1);
    assert.ok(start >= 0);
    const context = { exports: {}, ...dependencies };
    vm.runInNewContext(source.slice(start, end < 0 ? undefined : end), context);
    return context.exports[name];
}

test('approval endpoints use Super Admin middleware and the same import handler', () => {
    const routes = read('routes/config.route');
    const orgRoutes = read('routes/organization.route');
    assert.match(routes, /"\/executeSync", verifyToken, requireSuperAdmin, executeProfileSyncCron/);
    assert.match(routes, /"\/syncLast30Days", verifyToken, requireSuperAdmin, syncLast30Days/);
    assert.match(routes, /"\/getSyncRequests", verifyToken, requireSuperAdmin, getSyncRequests/);
    assert.match(orgRoutes, /"\/superAdmin\/executeProfileSyncCron", verifyToken, requireSuperAdmin, executeProfileSyncCron/);
    const { requireSuperAdmin } = require('../../api-server/middleware/superAdmin.auth');
    const denied = { status(code) { this.code = code; return this; }, json() {} };
    requireSuperAdmin({ role: { roleName: ROLES.ADMIN } }, denied, () => assert.fail('not Super Admin'));
    assert.equal(denied.code, 403);
});

test('profile controls require access and an existing completed request for each enabled sync type', async () => {
    let access = false;
    let approved = [];
    const writes = [];
    const update = loadExport(config, 'updateProfileSyncSettings', {
        mongoose: objectIds, ROLES,
        profileBasedPermissionSchema: { exists: async () => access },
        sellerConfigSchema: { exists: async () => false },
        synchronizeDetailsSchema: {
            distinct: async (_field, filter) => {
                assert.equal(filter.configId, configId);
                assert.equal(filter.profileId, 7);
                assert.equal(filter.requestStatus, 'COMPLETED');
                return approved;
            },
            findOne: () => ({ lean: async () => null })
        },
        profileSchema: { updateOne: async (...args) => writes.push(args) },
        clearProfileCache: () => {}, clearActivePlanProfilesCache: () => {}, write_logs: () => {}
    });
    const invoke = async flags => {
        const res = reply();
        await update({ user: { _id: 'requester' }, body: { configId, profileId: 7, ...flags } }, res);
        return res.code;
    };
    assert.equal(await invoke({ isAdsSyncEnabled: true }), 403);
    access = true;
    assert.equal(await invoke({ isAdsSyncEnabled: true }), 403);
    approved = ['ads'];
    assert.equal(await invoke({ isAdsSyncEnabled: true, isSpSyncEnabled: true }), 403);
    assert.equal(writes.length, 0);
    assert.equal(await invoke({ isAdsSyncEnabled: false }), 200);
    assert.equal(await invoke({ isAdsSyncEnabled: true }), 200);
    assert.deepEqual(writes.map(([scope, update]) => [scope.configId, scope.profileId, update.$set.isAdsSyncEnabled]), [[configId, 7, false], [configId, 7, true]]);
});

test('connecting Seller can resume an approved profile but does not enable a new profile', async () => {
    const start = config.indexOf('async function resumeApprovedSellerSync(');
    const source = config.slice(start, config.indexOf('exports.amazonSPCallback =', start));
    let approved = false;
    const writes = [];
    const resume = vm.runInNewContext(`${source}\nresumeApprovedSellerSync`, {
        synchronizeDetailsSchema: { exists: async query => {
            assert.equal(query.configId, configId);
            assert.equal(query.profileId, 7);
            assert.equal(query.type, 'seller');
            assert.equal(query.requestStatus, 'COMPLETED');
            return approved;
        } },
        profileSchema: { updateOne: async (_, update) => writes.push(update.$set.isSpSyncEnabled) },
        clearProfileCache: async () => {}, clearActivePlanProfilesCache: async () => {}
    });
    await resume(configId, '7');
    assert.deepEqual(writes, []);
    approved = true;
    await resume(configId, '7');
    assert.deepEqual(writes, [true]);
});

test('the report dispatcher only succeeds on a completed report history record', async () => {
    const start = organization.indexOf('const runReportCronByName =');
    const source = organization.slice(start, organization.indexOf('\nexports.', start));
    let status;
    const dispatched = [];
    const run = vm.runInNewContext(`${source}\nrunReportCronByName`, {
        process: { env: { MAX_AUTO_CRON_LIMIT: 1 } }, moment: () => moment('2026-11-16'),
        profileSchema: { findOne: () => ({ lean: async () => null }) },
        cronJobHistorySchema: {
            findOneAndUpdate: () => ({ lean: async () => ({ _id: 'history' }) }),
            findById: () => ({ lean: async () => ({ status }) }),
            findByIdAndUpdate: async () => { status = 'FAILED'; }
        },
        cron_logs: () => {}, CRON_JOBS: jobs,
        cronGenerateCampaignReport: async (_weekly, _biweekly, scope) => {
            dispatched.push([scope.recurring, scope.cronjobid]);
        }
    });
    const scope = () => ({ configId, profileId: 7 });
    status = 'COMPLETED';
    assert.equal(await run(jobs.CAMPAIGN_REPORT, scope()), true);
    status = 'FAILED';
    assert.equal(await run(jobs.CAMPAIGN_REPORT, scope()), false);
    status = 'PENDING';
    await assert.rejects(run(jobs.CAMPAIGN_REPORT, scope()), /did not reach COMPLETED/);
    assert.equal(await run('Unknown report', scope()), false);
    assert.deepEqual(dispatched, [[false, 'history'], [false, 'history'], [false, 'history']]);
});

test('admin claims each request once, imports both account types and leaves failed groups retryable', async () => {
    const ids = ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccc'];
    const rows = [
        { _id: ids[0], profileId: 7, configId, groupId: 'CAMPAIGNS', type: 'ads', selectedSyncDays: 90, requestStatus: 'PENDING' },
        { _id: ids[1], profileId: 8, configId, groupId: 'ORDERS_AND_FINANCE', type: 'seller', selectedSyncDays: 180, requestStatus: 'FAILED' },
        { _id: ids[2], profileId: 8, configId, groupId: 'EMPTY', type: 'seller', selectedSyncDays: 30, requestStatus: 'PENDING' }
    ];
    const dispatches = [];
    const flags = new Map();
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const execute = loadExport(organization, 'executeProfileSyncCron', {
        mongoose: objectIds,
        synchronizeDetailsSchema: {
            findOneAndUpdate: (filter, update) => ({ lean: async () => {
                const row = rows.find(r => r._id === filter._id && filter.requestStatus.$in.includes(r.requestStatus));
                return row && Object.assign(row, update.$set);
            } }),
            findByIdAndUpdate: async (id, update) => Object.assign(rows.find(r => r._id === id), update.$set)
        },
        profileSchema: { updateOne: async (scope, update) => flags.set(scope.profileId, update.$set) },
        clearProfileCache: () => {}, clearActivePlanProfilesCache: () => {}, write_logs: () => {},
        moment: () => moment('2026-11-16'), getDatesBetween: () => [],
        historicalReportFilter, reportDetailsSchema: { find: filter => {
            assert.deepEqual(filter.name.$nin, [jobs.BEST_PERFORMER_REPORT, jobs.KEYWORD_ANALYSIS_REPORT]);
            return { lean: async () => filter.groupId === 'EMPTY' ? [] : filter.groupId === 'CAMPAIGNS'
                ? [{ name: jobs.CAMPAIGN_REPORT }] : [{ name: jobs.ORDER_LISTING }, { name: jobs.SALES_REPORT }] };
        } },
        runReportCronByName: async (name, settings) => {
            const profile = rows.find(row => row.profileId === settings.profileId);
            assert.equal(profile.requestStatus, 'IN_PROGRESS');
            assert.equal(flags.get(settings.profileId)[profile.type === 'ads' ? 'isAdsSyncEnabled' : 'isSpSyncEnabled'], true);
            dispatches.push([name, settings.startDate, settings.endDate]);
            return name !== jobs.ORDER_LISTING;
        },
        cron_logs: ({ message }) => { if (message.includes('Sync batch completed')) finish(); }
    });
    const res = reply();
    await execute({ body: { syncIds: [...ids, ids[0]] } }, res);
    assert.equal(res.code, 200);
    await finished;
    assert.deepEqual(rows.map(row => row.requestStatus), ['COMPLETED', 'FAILED', 'FAILED']);
    assert.deepEqual(dispatches, [
        [jobs.CAMPAIGN_REPORT, '2026-08-18', '2026-11-16'],
        [jobs.ORDER_LISTING, '2026-05-20', '2026-11-16'],
        [jobs.SALES_REPORT, '2026-05-20', '2026-11-16']
    ]);
    const replay = reply();
    await execute({ body: { syncIds: [ids[0]] } }, replay);
    assert.equal(replay.code, 404);
});
