const { test, describe } = require("node:test");
const assert = require("node:assert");
const { checkReportHealth } = require("../../monitoring/checks/reportChecker");

describe("Health Check: Report Checker", () => {
  const baseNow = new Date("2026-11-03T10:00:00.000Z");

  test("Healthy case: reports completed recently and no stuck items returns OK", async () => {
    const mockReports = [
      {
        reportType: "spCampaigns",
        status: "COMPLETED",
        profileId: 101,
        updatedAt: new Date("2026-11-03T09:30:00.000Z"), // 30 mins ago
      },
      {
        reportType: "sbCampaigns",
        status: "COMPLETED",
        profileId: 101,
        updatedAt: new Date("2026-11-03T09:15:00.000Z"), // 45 mins ago
      },
    ];

    const mockDb = {
      reports: {
        find: (query) => {
          if (query.status && query.status.$in.includes("PENDING")) {
            return { toArray: async () => [] };
          }
          return { toArray: async () => mockReports };
        },
      },
      cronjobhistories: {
        find: () => ({ toArray: async () => [] }),
      },
    };

    const res = await checkReportHealth({ db: mockDb, now: baseNow });
    assert.strictEqual(res.name, "report_checker");
    assert.strictEqual(res.status, "OK");
    assert.strictEqual(res.details.staleSyncs.length, 0);
    assert.strictEqual(res.details.stuckReports.length, 0);
  });

  test("Staleness Warning: report completed 3 hours ago (> 2h threshold) returns WARN", async () => {
    const mockReports = [
      {
        reportType: "spCampaigns",
        status: "COMPLETED",
        profileId: 101,
        updatedAt: new Date("2026-11-03T07:00:00.000Z"), // 3 hours ago
      },
    ];

    const mockDb = {
      reports: {
        find: (query) => {
          if (query.status && query.status.$in.includes("PENDING")) {
            return { toArray: async () => [] };
          }
          return { toArray: async () => mockReports };
        },
      },
      cronjobhistories: {
        find: () => ({ toArray: async () => [] }),
      },
    };

    const res = await checkReportHealth({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "WARN");
    assert.ok(res.summary.includes("is stale"));
    assert.strictEqual(res.details.staleSyncs.length, 1);
    assert.strictEqual(res.details.staleSyncs[0].severity, "WARN");
  });

  test("Staleness Critical: report completed 7 hours ago (> 6h threshold) returns CRITICAL", async () => {
    const mockReports = [
      {
        reportType: "spCampaigns",
        status: "COMPLETED",
        profileId: 101,
        updatedAt: new Date("2026-11-03T03:00:00.000Z"), // 7 hours ago
      },
    ];

    const mockDb = {
      reports: {
        find: (query) => {
          if (query.status && query.status.$in.includes("PENDING")) {
            return { toArray: async () => [] };
          }
          return { toArray: async () => mockReports };
        },
      },
      cronjobhistories: {
        find: () => ({ toArray: async () => [] }),
      },
    };

    const res = await checkReportHealth({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.ok(res.summary.includes("CRITICALLY stale"));
    assert.strictEqual(res.details.staleSyncs[0].severity, "CRITICAL");
  });

  test("Stuck Report Warning: report in PENDING for 75 mins (> 1h threshold) returns WARN", async () => {
    const mockDb = {
      reports: {
        find: (query) => {
          if (query.status && query.status.$in.includes("PENDING")) {
            return {
              toArray: async () => [
                {
                  _id: "rep-001",
                  reportType: "sdCampaigns",
                  status: "PENDING",
                  profileId: 202,
                  createdAt: new Date("2026-11-03T08:45:00.000Z"), // 75 mins ago
                },
              ],
            };
          }
          return { toArray: async () => [] };
        },
      },
      cronjobhistories: {
        find: () => ({ toArray: async () => [] }),
      },
    };

    const res = await checkReportHealth({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "WARN");
    assert.strictEqual(res.details.stuckReports.length, 1);
    assert.strictEqual(res.details.stuckReports[0].severity, "WARN");
  });

  test("Stuck Report Critical: report in IN_PROGRESS for 2.5 hours (> 2h threshold) returns CRITICAL", async () => {
    const mockDb = {
      reports: {
        find: (query) => {
          if (query.status && query.status.$in.includes("PENDING")) {
            return {
              toArray: async () => [
                {
                  _id: "rep-002",
                  reportType: "spTargeting",
                  status: "IN_PROGRESS",
                  profileId: 303,
                  createdAt: new Date("2026-11-03T07:30:00.000Z"), // 2.5 hours ago
                },
              ],
            };
          }
          return { toArray: async () => [] };
        },
      },
      cronjobhistories: {
        find: () => ({ toArray: async () => [] }),
      },
    };

    const res = await checkReportHealth({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.strictEqual(res.details.stuckReports.length, 1);
    assert.strictEqual(res.details.stuckReports[0].severity, "CRITICAL");
  });

  test("Cron failures: multiple recent failures trigger appropriate status", async () => {
    const mockDb = {
      reports: {
        find: () => ({ toArray: async () => [] }),
      },
      cronjobhistories: {
        find: (query) => {
          if (query.status && query.status.$in.includes("FAILED")) {
            return {
              toArray: async () => [
                { cronName: "Campaign Report", profileId: 101, createdAt: new Date("2026-11-03T09:40:00.000Z") },
                { cronName: "Campaign Report", profileId: 102, createdAt: new Date("2026-11-03T09:45:00.000Z") },
              ],
            };
          }
          return { toArray: async () => [] };
        },
      },
    };

    const res = await checkReportHealth({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "WARN");
    assert.strictEqual(res.details.recentFailures.length, 2);
  });

  test("Missing DB connection: returns CRITICAL safely", async () => {
    const res = await checkReportHealth({ db: null, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.ok(res.summary.includes("Database connection not provided"));
  });
});
