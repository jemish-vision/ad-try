const { test, describe } = require("node:test");
const assert = require("node:assert");
const { createFakeRedis } = require("../helpers/fakeRedis");
const { executeLiveSyncAudit } = require("../../api-server/services/liveSyncAudit.service");

describe("Live Sync & Data Insertion Diagnostic Service", () => {
  const baseNow = new Date("2026-11-03T10:00:00.000Z");

  test("Healthy profile: reports completed and schema records present returns HEALTHY", async () => {
    const mockDb = {
      profiles: {
        find: () => ({
          toArray: async () => [
            { profileId: 101, name: "Test US Store", countryCode: "US", timezone: "America/Los_Angeles", isActive: true },
          ],
        }),
      },
      reports: {
        find: () => ({
          toArray: async () => [
            {
              profileId: 101,
              reportType: "spCampaigns",
              status: "COMPLETED",
              startDate: "2026-11-02",
              endDate: "2026-11-02",
              updatedAt: new Date("2026-11-03T02:00:00.000Z"),
            },
          ],
        }),
      },
      campaigns: {
        find: () => ({
          toArray: async () => [
            { profileId: 101, reportDate: "2026-11-02", spend: 150.5, sales: 900 },
          ],
        }),
        countDocuments: async () => 5,
      },
      sbcampaigns: { countDocuments: async () => 0 },
      sdcampaigns: { countDocuments: async () => 0 },
      targeting: { countDocuments: async () => 12 },
      cronjobhistories: { find: () => ({ toArray: async () => [] }) },
    };

    const redis = createFakeRedis();

    const diagnostic = await executeLiveSyncAudit({
      db: mockDb,
      redisClient: redis,
      options: { now: baseNow, targetDate: "2026-11-02" },
    });

    assert.strictEqual(diagnostic.summary.activeProfiles, 1);
    assert.strictEqual(diagnostic.summary.syncedProfiles, 1);
    assert.strictEqual(diagnostic.summary.missingDataProfiles, 0);
    assert.strictEqual(diagnostic.summary.totalYesterdaySpend, 150.5);
    assert.strictEqual(diagnostic.profiles[0].syncStatus, "HEALTHY");
  });

  test("Missing Data Alert: Amazon report completed but 0 docs in schema flags MISSING_DATA", async () => {
    const mockDb = {
      profiles: {
        find: () => ({
          toArray: async () => [
            { profileId: 202, name: "Stalled Store", countryCode: "US", isActive: true },
          ],
        }),
      },
      reports: {
        find: () => ({
          toArray: async () => [
            {
              profileId: 202,
              reportType: "spCampaigns",
              status: "COMPLETED",
              startDate: "2026-11-02",
              endDate: "2026-11-02",
              updatedAt: new Date("2026-11-03T02:00:00.000Z"),
            },
          ],
        }),
      },
      campaigns: {
        find: () => ({ toArray: async () => [] }), // ZERO DOCS IN SCHEMA!
        countDocuments: async () => 0,
      },
      sbcampaigns: { countDocuments: async () => 0 },
      sdcampaigns: { countDocuments: async () => 0 },
      targeting: { countDocuments: async () => 0 },
      cronjobhistories: { find: () => ({ toArray: async () => [] }) },
    };

    const redis = createFakeRedis();

    const diagnostic = await executeLiveSyncAudit({
      db: mockDb,
      redisClient: redis,
      options: { now: baseNow, targetDate: "2026-11-02" },
    });

    assert.strictEqual(diagnostic.summary.missingDataProfiles, 1);
    assert.strictEqual(diagnostic.profiles[0].syncStatus, "MISSING_DATA");
    assert.strictEqual(diagnostic.criticalAlerts.length, 1);
    assert.ok(diagnostic.criticalAlerts[0].includes("Data Missing: Report completed but 0 docs in schema!"));
  });

  test("Redis Staging Buffer: stalled batch in Redis for > 15m triggers STALLED status", async () => {
    const mockDb = {
      profiles: { find: () => ({ toArray: async () => [] }) },
      reports: { find: () => ({ toArray: async () => [] }) },
      campaigns: { find: () => ({ toArray: async () => [] }), countDocuments: async () => 0 },
      cronjobhistories: { find: () => ({ toArray: async () => [] }) },
    };

    const redis = createFakeRedis();
    // Simulate stalled import manifest in Redis (30 mins old, status IMPORTING)
    await redis.set(
      "import_manifest:run-stalled-99",
      JSON.stringify({
        importRunId: "run-stalled-99",
        status: "IMPORTING",
        entity: "campaign",
        profileId: 303,
        createdAt: new Date("2026-11-03T09:30:00.000Z").toISOString(), // 30m ago
      })
    );

    const diagnostic = await executeLiveSyncAudit({
      db: mockDb,
      redisClient: redis,
      options: { now: baseNow },
    });

    assert.strictEqual(diagnostic.summary.redisStagingStatus, "STALLED");
    assert.strictEqual(diagnostic.redisBuffer.stalledRuns.length, 1);
    assert.strictEqual(diagnostic.redisBuffer.stalledRuns[0].runId, "run-stalled-99");
    assert.ok(diagnostic.criticalAlerts.some((a) => a.includes("stalled in \"IMPORTING\"")));
  });

  test("Obsolete/failed Redis manifest whose report is already COMPLETED in MongoDB is NOT flagged as stalled", async () => {
    const reportId = "01202233-f6cb-448b-ac92-68a5ede00670";
    const mockDb = {
      profiles: { find: () => ({ toArray: async () => [] }) },
      reports: {
        findOne: async (query) => {
          if (query.reportId === reportId && query.status?.$in?.includes("COMPLETED")) {
            return {
              _id: "6ae321891276f1ca1fa88f9e",
              reportId,
              status: "COMPLETED",
              verifiedRows: 148269,
            };
          }
          return null;
        },
        find: () => ({ toArray: async () => [] }),
      },
      campaigns: { find: () => ({ toArray: async () => [] }), countDocuments: async () => 0 },
      cronjobhistories: { find: () => ({ toArray: async () => [] }) },
    };

    const redis = createFakeRedis();
    await redis.set(
      `import_manifest:run_searchTerm_${reportId}_1793277289468`,
      JSON.stringify({
        importRunId: `run_searchTerm_${reportId}_1793277289468`,
        reportId,
        status: "VALIDATION_FAILED",
        entity: "searchTerm",
        profileId: 2376610121042864,
        createdAt: new Date("2026-10-29T12:00:00.000Z").toISOString(),
      })
    );

    const diagnostic = await executeLiveSyncAudit({
      db: mockDb,
      redisClient: redis,
      options: { now: baseNow },
    });

    assert.strictEqual(diagnostic.summary.redisStagingStatus, "CLEAR");
    assert.strictEqual(diagnostic.redisBuffer.stalledRuns.length, 0);
    assert.ok(!diagnostic.criticalAlerts.some((a) => a.includes("VALIDATION_FAILED")));
  });

  test("Cron failures and BullMQ failed jobs are surfaced in pipeline diagnostic", async () => {
    const mockDb = {
      profiles: { find: () => ({ toArray: async () => [] }) },
      reports: { find: () => ({ toArray: async () => [] }) },
      campaigns: { find: () => ({ toArray: async () => [] }), countDocuments: async () => 0 },
      cronjobhistories: {
        find: () => ({
          toArray: async () => [
            {
              cronName: "Campaign Report",
              status: "FAILED",
              createdAt: new Date("2026-11-03T08:00:00.000Z"),
              error: "SP-API Quota Exceeded",
            },
          ],
        }),
      },
    };

    const mockQueues = {
      hourlySync: {
        getJobCounts: async () => ({ waiting: 0, active: 0, completed: 10, failed: 1, delayed: 0 }),
        getFailed: async () => [
          {
            id: "job-fail-1",
            data: { task: "campaign-report", profileId: 404 },
            failedReason: "Amazon 500 Internal Error",
          },
        ],
      },
    };

    const diagnostic = await executeLiveSyncAudit({
      db: mockDb,
      queues: mockQueues,
      options: { now: baseNow },
    });

    assert.strictEqual(diagnostic.cronStatus.length, 1);
    assert.strictEqual(diagnostic.cronStatus[0].status, "FAILED");
    assert.strictEqual(diagnostic.summary.failedBullmqJobs, 1);
    assert.strictEqual(diagnostic.pipeline.failedJobs[0].failedReason, "Amazon 500 Internal Error");
  });

  test("Cron execution tracking: today vs yesterday, profile resolution, and Redis drain verification", async () => {
    const mockDb = {
      profiles: {
        find: () => ({
          toArray: async () => [
            { profileId: 501, name: "Alpha Brand", countryCode: "US", isActive: true },
          ],
        }),
      },
      reports: { find: () => ({ toArray: async () => [] }) },
      campaigns: { find: () => ({ toArray: async () => [] }), countDocuments: async () => 0 },
      cronjobhistories: {
        find: () => ({
          toArray: async () => [
            {
              cronName: "Rules Update",
              profileId: 501,
              status: "COMPLETED",
              historyDate: "2026-11-03",
              recordsCount: 45,
              durationMs: 1200,
              createdAt: new Date("2026-11-03T07:30:00.000Z"),
              updatedAt: new Date("2026-11-03T07:30:01.200Z"),
            },
            {
              cronName: "Campaign Report",
              profileId: 501,
              status: "COMPLETED",
              historyDate: "2026-11-02",
              recordsCount: 150,
              durationMs: 8500,
              createdAt: new Date("2026-11-02T14:00:00.000Z"),
              updatedAt: new Date("2026-11-02T14:00:08.500Z"),
            },
          ],
        }),
      },
    };

    const redis = createFakeRedis();

    const diagnostic = await executeLiveSyncAudit({
      db: mockDb,
      redisClient: redis,
      options: { now: baseNow, targetDate: "2026-11-02" },
    });

    assert.strictEqual(diagnostic.availableProfiles.length, 1);
    assert.strictEqual(diagnostic.availableProfiles[0].name, "Alpha Brand");
    assert.strictEqual(diagnostic.cronHistories.length, 2);
    assert.strictEqual(diagnostic.cronHistories[0].profileName, "Alpha Brand");
    assert.strictEqual(diagnostic.cronHistories[0].redisStatus, "VERIFIED_DRAINED");
    assert.strictEqual(diagnostic.cronSummary.today.total, 1);
    assert.strictEqual(diagnostic.cronSummary.today.completed, 1);
    assert.strictEqual(diagnostic.cronSummary.yesterday.total, 1);
    assert.strictEqual(diagnostic.cronSummary.yesterday.completed, 1);
    assert.strictEqual(diagnostic.cronSummary.byCron["Rules Update"].today.total, 1);
    assert.strictEqual(diagnostic.cronSummary.byCron["Campaign Report"].yesterday.total, 1);
  });

  test("Profile sync flags: excludes disabled profiles and evaluates based on seller vs ads flags", async () => {
    const mockDb = {
      profiles: {
        find: (query) => ({
          toArray: async () => [
            // Disabled profile: both false
            { profileId: 901, name: "Disabled Store", isActive: true, isAdsSyncEnabled: false, isSpSyncEnabled: false },
            // Ads only profile
            { profileId: 902, name: "Ads Only Store", isActive: true, isAdsSyncEnabled: true, isSpSyncEnabled: false },
            // Seller only profile
            { profileId: 903, name: "Seller Only Store", isActive: true, isAdsSyncEnabled: false, isSpSyncEnabled: true },
            // Inactive profile with sync flags on: should be excluded because isActive: false
            { profileId: 904, name: "Inactive Store", isActive: false, isAdsSyncEnabled: true, isSpSyncEnabled: true },
          ],
        }),
      },
      reports: {
        find: () => ({ toArray: async () => [] }),
      },
      campaigns: {
        find: (q) => ({
          toArray: async () => (q.profileId === 902 ? [{ profileId: 902, reportDate: "2026-11-02", spend: 50, sales: 200 }] : []),
        }),
        countDocuments: async () => 1,
      },
      orders: {
        countDocuments: async (q) => (q.profileId === 903 ? 15 : 0),
      },
      sbcampaigns: { countDocuments: async () => 0 },
      sdcampaigns: { countDocuments: async () => 0 },
      targeting: { countDocuments: async () => 0 },
      cronjobhistories: { find: () => ({ toArray: async () => [] }) },
    };

    const redis = createFakeRedis();

    // 1. Audit all sync-enabled profiles
    const diagnostic = await executeLiveSyncAudit({
      db: mockDb,
      redisClient: redis,
      options: { now: baseNow, targetDate: "2026-11-02" },
    });

    // Disabled Store (901) should be excluded
    assert.strictEqual(diagnostic.summary.totalProfiles, 2);
    assert.strictEqual(diagnostic.summary.activeProfiles, 2);
    const profileIds = diagnostic.profiles.map((p) => p.profileId);
    assert.ok(!profileIds.includes(901), "Disabled Store should not be displayed");
    assert.ok(!profileIds.includes(904), "Inactive Store (isActive: false) should not be displayed");
    assert.ok(profileIds.includes(902), "Ads Only Store should be displayed");
    assert.ok(profileIds.includes(903), "Seller Only Store should be displayed");

    // Both 902 and 903 should be HEALTHY based on their respective flags!
    const adsStore = diagnostic.profiles.find((p) => p.profileId === 902);
    const sellerStore = diagnostic.profiles.find((p) => p.profileId === 903);
    assert.strictEqual(adsStore.syncStatus, "HEALTHY");
    assert.strictEqual(sellerStore.syncStatus, "HEALTHY");
    assert.strictEqual(diagnostic.summary.staleProfiles, 0);

    // 2. Explicitly query disabled profile (901)
    const disabledDiag = await executeLiveSyncAudit({
      db: mockDb,
      redisClient: redis,
      options: { now: baseNow, targetDate: "2026-11-02", profileId: 901 },
    });

    assert.strictEqual(disabledDiag.profiles.length, 1);
    assert.strictEqual(disabledDiag.profiles[0].profileId, 901);
    assert.strictEqual(disabledDiag.profiles[0].syncStatus, "DISABLED");
    assert.strictEqual(disabledDiag.summary.staleProfiles, 0);
  });
});
