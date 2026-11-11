const { test, describe } = require("node:test");
const assert = require("node:assert");
const { createFakeRedis } = require("../helpers/fakeRedis");
const { checkDataContinuity } = require("../../monitoring/checks/dataContinuity");
const { runDailyMonitor, buildDailyDigestHtml } = require("../../monitoring/runDaily");

describe("Daily Health Monitor: Data Continuity & Daily Digest", () => {
  const baseNow = new Date("2026-11-03T10:00:00.000Z");

  test("Healthy continuity: steady spend and zero failures returns OK", async () => {
    const mockDb = {
      campaigns: {
        aggregate: () => ({
          toArray: async () => [
            { _id: "2026-11-02", totalSpend: 500, totalSales: 2500, count: 10 },
            { _id: "2026-11-01", totalSpend: 520, totalSales: 2600, count: 10 },
          ],
        }),
      },
      cronjobhistories: {
        countDocuments: async () => 0,
      },
    };

    const res = await checkDataContinuity({ db: mockDb, now: baseNow });
    assert.strictEqual(res.name, "data_continuity");
    assert.strictEqual(res.status, "OK");
    assert.strictEqual(res.details.metrics.yesterdaySpend, 500);
    assert.strictEqual(res.details.failuresLast24h, 0);
  });

  test("Metric drop: > 80% spend drop returns WARN", async () => {
    const mockDb = {
      campaigns: {
        aggregate: () => ({
          toArray: async () => [
            { _id: "2026-11-02", totalSpend: 50, totalSales: 200, count: 5 }, // 90% drop
            { _id: "2026-11-01", totalSpend: 500, totalSales: 2500, count: 10 },
          ],
        }),
      },
      cronjobhistories: { countDocuments: async () => 0 },
    };

    const res = await checkDataContinuity({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "WARN");
    assert.ok(res.summary.includes("spend drop detected"));
  });

  test("Metric disappearance: 100% spend drop returns CRITICAL", async () => {
    const mockDb = {
      campaigns: {
        aggregate: () => ({
          toArray: async () => [
            { _id: "2026-11-02", totalSpend: 0, totalSales: 0, count: 0 }, // zero!
            { _id: "2026-11-01", totalSpend: 600, totalSales: 3000, count: 12 },
          ],
        }),
      },
      cronjobhistories: { countDocuments: async () => 0 },
    };

    const res = await checkDataContinuity({ db: mockDb, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.ok(res.summary.includes("Yesterday's spend is 0.00 (100% drop"));
  });

  test("High 24h cron failures: 15 failures -> WARN, 35 failures -> CRITICAL", async () => {
    const warnDb = {
      campaigns: { aggregate: () => ({ toArray: async () => [] }) },
      cronjobhistories: { countDocuments: async () => 15 },
    };
    const resWarn = await checkDataContinuity({ db: warnDb, now: baseNow });
    assert.strictEqual(resWarn.status, "WARN");
    assert.ok(resWarn.summary.includes("15 cron/sync jobs failed in last 24h"));

    const critDb = {
      campaigns: { aggregate: () => ({ toArray: async () => [] }) },
      cronjobhistories: { countDocuments: async () => 35 },
    };
    const resCrit = await checkDataContinuity({ db: critDb, now: baseNow });
    assert.strictEqual(resCrit.status, "CRITICAL");
    assert.ok(resCrit.summary.includes("35 cron/sync jobs failed in last 24h"));
  });

  test("runDailyMonitor executes all 5 checks and dispatches digest email", async () => {
    const redis = createFakeRedis();
    const roles = ["rules-worker", "sync-worker", "sp-api-worker", "queue-producer"];
    for (const role of roles) {
      redis.set(
        `advertiseiq:heartbeat:${role}:host-1:1234`,
        JSON.stringify({
          role,
          updatedAt: new Date("2026-11-03T09:59:50.000Z").toISOString(),
          uptimeSec: 3600,
        })
      );
    }

    const mockDb = {
      reports: {
        find: (q) => {
          if (q.status && q.status.$in && q.status.$in.includes("PENDING")) {
            return { toArray: async () => [] };
          }
          return { toArray: async () => [{ reportType: "spCampaigns", status: "COMPLETED", updatedAt: new Date("2026-11-03T09:40:00.000Z") }] };
        },
      },
      cronjobhistories: {
        find: () => ({ toArray: async () => [] }),
        countDocuments: async () => 0,
      },
      campaigns: {
        aggregate: () => ({
          toArray: async () => [
            { _id: "2026-11-02", totalSpend: 500, totalSales: 2500, count: 10 },
            { _id: "2026-11-01", totalSpend: 500, totalSales: 2500, count: 10 },
          ],
        }),
      },
      budgetrules: { find: () => ({ toArray: async () => [] }) },
      targetingrules: { find: () => ({ toArray: async () => [] }) },
      placementrules: { find: () => ({ toArray: async () => [] }) },
      recomandationrules: { find: () => ({ toArray: async () => [] }) },
      rulerunhistories: { findOne: async () => ({ _id: "hist-1" }) },
    };

    const queues = {
      rules: { getJobCounts: async () => ({ waiting: 0, active: 0, completed: 10, failed: 0, delayed: 0 }) },
    };

    let digestEmailSent = false;
    let emailSubject = "";
    const mockSender = async (to, subject, html) => {
      digestEmailSent = true;
      emailSubject = subject;
      return { delivered: true };
    };

    const outcome = await runDailyMonitor({
      db: mockDb,
      redisClient: redis,
      queues,
      emailSender: mockSender,
      now: baseNow,
    });

    assert.strictEqual(outcome.verdict, "GO");
    assert.strictEqual(outcome.exitCode, 0);
    assert.strictEqual(outcome.results.length, 5); // All 5 checks executed
    assert.strictEqual(digestEmailSent, true);
    assert.ok(emailSubject.includes("Status: GO (5/5 Healthy)"));
  });

  test("buildDailyDigestHtml renders full HTML table with check names", () => {
    const html = buildDailyDigestHtml({
      verdict: "GO",
      results: [
        { name: "report_checker", status: "OK", summary: "All reports fresh" },
        { name: "queue_watcher", status: "OK", summary: "Queues normal" },
      ],
      timestamp: "2026-11-03T10:00:00.000Z",
    });

    assert.ok(html.includes("report_checker"));
    assert.ok(html.includes("queue_watcher"));
    assert.ok(html.includes("#2e7d32")); // Green badge
  });
});
