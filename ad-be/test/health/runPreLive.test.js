const { test, describe } = require("node:test");
const assert = require("node:assert");
const { createFakeRedis } = require("../helpers/fakeRedis");
const { runPreLiveGate } = require("../../monitoring/runPreLive");

describe("Pre-Live Gate: Aggregated Decision & Alerts", () => {
  const baseNow = new Date("2026-11-03T10:00:00.000Z");

  function createHealthyMocks() {
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

    const db = {
      reports: {
        find: (q) => {
          if (q.status && q.status.$in && q.status.$in.includes("PENDING")) {
            return { toArray: async () => [] };
          }
          return {
            toArray: async () => [
              { reportType: "spCampaigns", status: "COMPLETED", updatedAt: new Date("2026-11-03T09:40:00.000Z") },
            ],
          };
        },
      },
      cronjobhistories: { find: () => ({ toArray: async () => [] }) },
      budgetrules: { find: () => ({ toArray: async () => [] }) },
      targetingrules: { find: () => ({ toArray: async () => [] }) },
      placementrules: { find: () => ({ toArray: async () => [] }) },
      recomandationrules: { find: () => ({ toArray: async () => [] }) },
      rulerunhistories: { findOne: async () => ({ _id: "hist-1" }) },
    };

    const queues = {
      rules: {
        getJobCounts: async () => ({ waiting: 0, active: 0, completed: 10, failed: 0, delayed: 0 }),
      },
    };

    return { db, redis, queues };
  }

  test("Healthy environment produces GO verdict and exitCode 0", async () => {
    const { db, redis, queues } = createHealthyMocks();
    let emailSent = false;

    const outcome = await runPreLiveGate({
      db,
      redisClient: redis,
      queues,
      emailSender: async () => { emailSent = true; },
      now: baseNow,
    });

    assert.strictEqual(outcome.verdict, "GO");
    assert.strictEqual(outcome.exitCode, 0);
    assert.strictEqual(emailSent, false); // No alerts on GO
    assert.ok(outcome.summary.includes("All pre-live health checks passed"));
  });

  test("Warning status produces GO_WITH_CAUTION and exitCode 0", async () => {
    const { db, redis, queues } = createHealthyMocks();
    // Simulate elevated waiting backlog (WARN)
    queues.rules.getJobCounts = async () => ({ waiting: 60, active: 0, completed: 10, failed: 0, delayed: 0 });

    const outcome = await runPreLiveGate({
      db,
      redisClient: redis,
      queues,
      sendAlerts: false,
      now: baseNow,
    });

    assert.strictEqual(outcome.verdict, "GO_WITH_CAUTION");
    assert.strictEqual(outcome.exitCode, 0);
    assert.ok(outcome.summary.includes("Passed with 1 warning(s)"));
  });

  test("Critical check produces NO_GO, exitCode 1, and dispatches email alert", async () => {
    const { db, redis, queues } = createHealthyMocks();
    // Simulate dead worker by deleting heartbeats
    const emptyRedis = createFakeRedis();
    let alertDispatched = false;

    const outcome = await runPreLiveGate({
      db,
      redisClient: emptyRedis, // Missing all worker roles -> CRITICAL!
      queues,
      emailSender: async () => {
        alertDispatched = true;
        return { delivered: true };
      },
      now: baseNow,
    });

    assert.strictEqual(outcome.verdict, "NO_GO");
    assert.strictEqual(outcome.exitCode, 1);
    assert.strictEqual(alertDispatched, true);
    assert.ok(outcome.summary.includes("Deployment gate FAILED"));
  });
});
