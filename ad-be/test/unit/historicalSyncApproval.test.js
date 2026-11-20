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
    const context = { exports: {}, writeAuditEvent: async () => {}, ...dependencies };
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

test('saving Seller groups preserves unchanged approvals and stores choices under the selected configuration', async () => {
    const scope = { configId, profileId: 7, type: 'seller' };
    const records = [
        { ...scope, _id: 'kept', groupId: 'catalog', selectedSyncDays: 30, requestStatus: 'COMPLETED' },
        { ...scope, _id: 'removed', groupId: 'listing', selectedSyncDays: 30, requestStatus: 'PENDING' },
        { ...scope, _id: 'ads', type: 'ads', groupId: 'ads-group', selectedSyncDays: 30, requestStatus: 'PENDING' },
        { ...scope, _id: 'other', configId: '222222222222222222222222', groupId: 'listing', selectedSyncDays: 30, requestStatus: 'PENDING' }
    ];
    const matches = (record, filter) => Object.entries(filter).every(([key, value]) => {
        if (value?.$in) return value.$in.includes(record[key]);
        if (value?.$ne) return record[key] !== value.$ne;
        return record[key] === value;
    });
    const pendingWrites = [];
    let failWrite = true;
    const save = loadExport(config, 'saveSynchronizationDetails', {
        mongoose: { isValidObjectId: objectIds.Types.ObjectId.isValid },
        configSchema: { findById: () => ({ lean: async () => ({ organizationId: 'org' }) }) },
        canManageAdsConfig: req => req.organizationId === 'org',
        sellerOwnerScope: (organizationId, userId) => ({ organizationId, userId }),
        profileSchema: { findOne: () => ({ lean: async () => ({ advertiserId: 'merchant' }) }) },
        sellerConfigSchema: { exists: async filter => filter.configId === configId && filter.sellerId === 'merchant' },
        coreGroupSchema: { find: query => ({
            lean: async () => query.id.$in.map(id => ({ id, maxDays: 90 }))
        }) },
        synchronizeDetailsSchema: {
            find(filter) {
                const lean = async () => records.filter(record => matches(record, filter));
                return { lean, sort: () => ({ lean }) };
            },
            findOneAndUpdate(filter, update) {
                return { lean: async () => {
                    if (failWrite) throw new Error('fixture write failure');
                    pendingWrites.push(filter.groupId);
                    const record = { ...filter, ...update.$setOnInsert, _id: 'inserted' };
                    records.push(record);
                    return record;
                } };
            },
            async deleteMany(filter) {
                const ids = new Set(records.filter(record => matches(record, filter)).map(record => record._id));
                for (let index = records.length - 1; index >= 0; index--) {
                    if (ids.has(records[index]._id)) records.splice(index, 1);
                }
                return { deletedCount: ids.size };
            }
        },
        write_logs() {}
    });
    const request = { organizationId: 'org', user: { _id: 'user' },
        body: { ...scope, items: [{ groupId: 'catalog', selectedSyncDays: 30 }, { groupId: 'orders', selectedSyncDays: 60 }] } };
    const failed = reply();
    await save(request, failed);
    assert.equal(failed.code, 500);
    assert.deepEqual(records.map(row => row._id), ['kept', 'removed', 'ads', 'other']);
    failWrite = false;

    const saved = reply();
    await save(request, saved);
    assert.equal(saved.code, 200);
    assert.match(saved.body.message, /Pending Super Admin approval/);
    assert.deepEqual(pendingWrites, ['orders']);
    assert.deepEqual(Array.from(saved.body.data, row => [row.groupId, row.selectedSyncDays, row.requestStatus]),
        [['catalog', 30, 'COMPLETED'], ['orders', 60, 'PENDING']]);
    assert.deepEqual(records.map(row => row._id), ['kept', 'ads', 'other', 'inserted']);

    const denied = reply();
    await save({ ...request, organizationId: 'foreign' }, denied);
    assert.equal(denied.code, 403);
    assert.deepEqual(pendingWrites, ['orders']);
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
    const auditEvents = [];
    const flags = new Map();
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const execute = loadExport(organization, 'executeProfileSyncCron', {
        mongoose: objectIds,
        writeAuditEvent: async event => auditEvents.push(event),
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
    assert.deepEqual(auditEvents.map(row => row.event), [
        'HISTORICAL_SYNC_ACCEPTED', 'HISTORICAL_SYNC_ACCEPTED', 'HISTORICAL_SYNC_ACCEPTED',
        'HISTORICAL_SYNC_COMPLETED', 'HISTORICAL_SYNC_FAILED', 'HISTORICAL_SYNC_FAILED'
    ]);
    assert.equal(auditEvents.filter(row => row.outcome === 'FAILED').length, 2);
    assert.equal(auditEvents[3].operationId, auditEvents[0].operationId);
    assert.ok(auditEvents[3].operationId.endsWith(ids[0]));
    assert.notEqual(auditEvents[0].operationId, auditEvents[1].operationId);
    assert.deepEqual(dispatches, [
        [jobs.CAMPAIGN_REPORT, '2026-08-18', '2026-11-16'],
        [jobs.ORDER_LISTING, '2026-05-20', '2026-11-16'],
        [jobs.SALES_REPORT, '2026-05-20', '2026-11-16']
    ]);
    const replay = reply();
    await execute({ body: { syncIds: [ids[0]] } }, replay);
    assert.equal(replay.code, 404);
});
