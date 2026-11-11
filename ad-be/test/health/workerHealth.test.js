const { test, describe } = require("node:test");
const assert = require("node:assert");
const { createFakeRedis } = require("../helpers/fakeRedis");
const { checkWorkerHealth } = require("../../monitoring/checks/workerHealth");

describe("Health Check: Worker Liveness & Heartbeat Health", () => {
  const baseNow = new Date("2026-11-03T10:00:00.000Z");

  test("Healthy case: all 4 expected workers present with fresh heartbeats and normal memory", async () => {
    const redis = createFakeRedis();
    const roles = ["rules-worker", "sync-worker", "sp-api-worker", "queue-producer"];

    for (const role of roles) {
      await redis.set(
        `advertiseiq:heartbeat:${role}:host-1:1234`,
        JSON.stringify({
          role,
          hostname: "host-1",
          pid: 1234,
          updatedAt: new Date("2026-11-03T09:59:45.000Z").toISOString(), // 15s ago
          uptimeSec: 3600,
          memoryUsage: { rss: 150 * 1024 * 1024, heapUsed: 80 * 1024 * 1024, heapTotal: 100 * 1024 * 1024 },
        })
      );
    }

    const res = await checkWorkerHealth({ redisClient: redis, now: baseNow });
    assert.strictEqual(res.name, "worker_health");
    assert.strictEqual(res.status, "OK");
    assert.strictEqual(res.details.totalActiveWorkers, 4);
    assert.strictEqual(res.details.missingRoles.length, 0);
    assert.strictEqual(res.details.staleWorkers.length, 0);
  });

  test("Missing role: missing sp-api-worker returns CRITICAL", async () => {
    const redis = createFakeRedis();
    const roles = ["rules-worker", "sync-worker", "queue-producer"]; // missing sp-api-worker

    for (const role of roles) {
      await redis.set(
        `advertiseiq:heartbeat:${role}:host-1:1234`,
        JSON.stringify({
          role,
          updatedAt: new Date("2026-11-03T09:59:50.000Z").toISOString(),
          uptimeSec: 500,
        })
      );
    }

    const res = await checkWorkerHealth({ redisClient: redis, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.strictEqual(res.details.missingRoles.includes("sp-api-worker"), true);
    assert.ok(res.summary.includes('Required worker role "sp-api-worker" is NOT running'));
  });

  test("Stale heartbeat: heartbeat older than 45 seconds returns CRITICAL", async () => {
    const redis = createFakeRedis();
    const roles = ["rules-worker", "sync-worker", "sp-api-worker", "queue-producer"];

    for (const role of roles) {
      const isStale = role === "sync-worker";
      const updatedAt = isStale
        ? new Date("2026-11-03T09:58:30.000Z").toISOString() // 90s ago
        : new Date("2026-11-03T09:59:50.000Z").toISOString(); // 10s ago

      await redis.set(
        `advertiseiq:heartbeat:${role}:host-1:1234`,
        JSON.stringify({
          role,
          hostname: "host-1",
          pid: 1234,
          updatedAt,
          uptimeSec: 100,
        })
      );
    }

    const res = await checkWorkerHealth({ redisClient: redis, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.strictEqual(res.details.staleWorkers.length, 1);
    assert.strictEqual(res.details.staleWorkers[0].role, "sync-worker");
    assert.ok(res.summary.includes('Worker "sync-worker" (PID 1234) heartbeat is DEAD/STALE'));
  });

  test("High memory: worker exceeding 1.2GB RSS triggers WARN", async () => {
    const redis = createFakeRedis();
    const roles = ["rules-worker", "sync-worker", "sp-api-worker", "queue-producer"];

    for (const role of roles) {
      const isHighMem = role === "rules-worker";
      await redis.set(
        `advertiseiq:heartbeat:${role}:host-1:1234`,
        JSON.stringify({
          role,
          hostname: "host-1",
          pid: 1234,
          updatedAt: new Date("2026-11-03T09:59:50.000Z").toISOString(),
          uptimeSec: 3600,
          memoryUsage: {
            rss: isHighMem ? 1400 * 1024 * 1024 : 100 * 1024 * 1024,
            heapUsed: 50 * 1024 * 1024,
            heapTotal: 100 * 1024 * 1024,
          },
        })
      );
    }

    const res = await checkWorkerHealth({ redisClient: redis, now: baseNow });
    assert.strictEqual(res.status, "WARN");
    assert.strictEqual(res.details.highMemoryWorkers.length, 1);
    assert.strictEqual(res.details.highMemoryWorkers[0].role, "rules-worker");
    assert.ok(res.summary.includes("has high RSS memory"));
  });

  test("Missing Redis connection returns CRITICAL safely", async () => {
    const res = await checkWorkerHealth({ redisClient: null, now: baseNow });
    assert.strictEqual(res.status, "CRITICAL");
    assert.ok(res.summary.includes("Redis client not provided"));
  });
});
