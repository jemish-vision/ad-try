const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
require("dotenv").config();
const redis = require("redis");

const {
  isRedisReady,
  readAuthToken,
  writeAuthToken,
  acquireAuthLock,
  extendAuthLock,
  commitTokenIfOwner,
  releaseAuthLock,
  closeRedis,
} = require("../api-server/services/redis.service");

const {
  normalizeIdentity,
  getTokenKey,
  getLockKey,
} = require("../api-server/services/amazonAuth.service");

describe("1. Amazon Auth Identity & Key Generation", () => {
  test("Normalizes valid Ads identity", () => {
    const id = normalizeIdentity({ kind: "ads", configId: "64f1234567890abcdef12345" });
    assert.strictEqual(id.kind, "ads");
    assert.strictEqual(id.configId, "64f1234567890abcdef12345");
    assert.strictEqual(id.profileId, null);
  });

  test("Normalizes valid SP identity", () => {
    const id = normalizeIdentity({ kind: "sp", configId: "64f1234567890abcdef12345", profileId: 12345678 });
    assert.strictEqual(id.kind, "sp");
    assert.strictEqual(id.configId, "64f1234567890abcdef12345");
    assert.strictEqual(id.profileId, 12345678);
  });

  test("Rejects invalid auth kind", () => {
    assert.throws(() => {
      normalizeIdentity({ kind: "invalid", configId: "abc" });
    }, /Invalid auth kind/);
  });

  test("Rejects missing configId", () => {
    assert.throws(() => {
      normalizeIdentity({ kind: "ads", configId: null });
    }, /Missing configId/);
  });

  test("Rejects missing profileId for SP", () => {
    assert.throws(() => {
      normalizeIdentity({ kind: "sp", configId: "abc", profileId: null });
    }, /Missing or invalid profileId for SP-API/);
  });

  test("Generates correct Redis token & lock keys", () => {
    const adsTokenKey = getTokenKey("ads", "cfg-123");
    const adsLockKey = getLockKey("ads", "cfg-123");
    assert.strictEqual(adsTokenKey, "amzn:auth:v1:ads:cfg-123:token");
    assert.strictEqual(adsLockKey, "amzn:auth:v1:ads:cfg-123:lock");

    const spTokenKey = getTokenKey("sp", "cfg-123", 987654);
    const spLockKey = getLockKey("sp", "cfg-123", 987654);
    assert.strictEqual(spTokenKey, "amzn:auth:v1:sp:cfg-123:987654:token");
    assert.strictEqual(spLockKey, "amzn:auth:v1:sp:cfg-123:987654:lock");
  });
});

describe("2. Redis Auth Primitives & Lua Lease Safety", () => {
  const testKey = "test:amzn:auth:v1:ads:unit-test:token";
  const testLockKey = "test:amzn:auth:v1:ads:unit-test:lock";
  const ownerA = "owner-worker-A";
  const ownerB = "owner-worker-B";

  before(async () => {
    // Wait up to 5s for Redis to connect if not already ready
    const start = Date.now();
    while (!isRedisReady() && Date.now() - start < 5000) {
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(isRedisReady(), "Redis must be connected for integration test");
    const { redisClient } = require("../api-server/services/redis.service");
    await redisClient.del(testKey);
    await redisClient.del(testLockKey);
  });

  after(async () => {
    if (isRedisReady()) {
      const { redisClient } = require("../api-server/services/redis.service");
      await redisClient.del(testKey);
      await redisClient.del(testLockKey);
    }
  });

  test("writeAuthToken stores only token payload with TTL", async () => {
    const payload = { accessToken: "Atza|test-token-123", issuedAt: Date.now() };
    await writeAuthToken(testKey, payload, 3600);

    const read = await readAuthToken(testKey);
    assert.ok(read !== null, "Token must be readable");
    assert.strictEqual(read.payload.accessToken, "Atza|test-token-123");
    assert.ok(read.pttl > 3500000 && read.pttl <= 3600000, `PTTL should be ~3600000, got ${read.pttl}`);
  });

  test("acquireAuthLock allows only one worker", async () => {
    const lockA = await acquireAuthLock(testLockKey, ownerA, 30000);
    assert.strictEqual(lockA, true, "Worker A must acquire lock");

    const lockB = await acquireAuthLock(testLockKey, ownerB, 30000);
    assert.strictEqual(lockB, false, "Worker B must be denied lock");
  });

  test("extendAuthLock enforces owner matching", async () => {
    const extBad = await extendAuthLock(testLockKey, ownerB, 40000);
    assert.strictEqual(extBad, false, "Wrong owner cannot extend lock");

    const extGood = await extendAuthLock(testLockKey, ownerA, 40000);
    assert.strictEqual(extGood, true, "Valid owner must extend lock");
  });

  test("commitTokenIfOwner ensures only owner can write token", async () => {
    const freshPayload = { accessToken: "Atza|winner-token-456", issuedAt: Date.now() };

    const commitBad = await commitTokenIfOwner(testLockKey, ownerB, testKey, freshPayload, 3600);
    assert.strictEqual(commitBad, false, "Impostor cannot commit token");

    const commitGood = await commitTokenIfOwner(testLockKey, ownerA, testKey, freshPayload, 3600);
    assert.strictEqual(commitGood, true, "Valid owner commits token successfully");

    const updated = await readAuthToken(testKey);
    assert.strictEqual(updated.payload.accessToken, "Atza|winner-token-456");
  });

  test("releaseAuthLock enforces owner matching", async () => {
    const relBad = await releaseAuthLock(testLockKey, ownerB);
    assert.strictEqual(relBad, false, "Wrong owner cannot release lock");

    const relGood = await releaseAuthLock(testLockKey, ownerA);
    assert.strictEqual(relGood, true, "Valid owner releases lock");

    // Lock now free: Worker B can acquire
    const lockBNow = await acquireAuthLock(testLockKey, ownerB, 10000);
    assert.strictEqual(lockBNow, true, "Worker B can now acquire released lock");
    await releaseAuthLock(testLockKey, ownerB);
  });
});

describe("3. Distributed Concurrency & Preemptive Refresh Simulation", () => {
  const simTokenKey = "amzn:auth:v1:ads:sim-config-999:token";
  const simLockKey = "amzn:auth:v1:ads:sim-config-999:lock";

  before(async () => {
    const { redisClient } = require("../api-server/services/redis.service");
    await redisClient.del(simTokenKey);
    await redisClient.del(simLockKey);
  });

  after(async () => {
    const { redisClient } = require("../api-server/services/redis.service");
    await redisClient.del(simTokenKey);
    await redisClient.del(simLockKey);
    await closeRedis();
  });

  test("Cache hit: returns token immediately without lock when PTTL > 300s", async () => {
    // Seed token with 3500s TTL (> 300,000ms)
    await writeAuthToken(simTokenKey, { accessToken: "Atza|fresh-cached-token", issuedAt: Date.now() }, 3500);

    const { getValidAccessToken } = require("../api-server/services/amazonAuth.service");
    const token = await getValidAccessToken({ kind: "ads", configId: "sim-config-999" });
    assert.strictEqual(token, "Atza|fresh-cached-token");
  });

  test("Two concurrent workers refreshing simultaneously: exactly one winner, waiter receives winner's token", async () => {
    // Set token to expiring soon (e.g. 100s TTL, which is < 300s buffer)
    await writeAuthToken(simTokenKey, { accessToken: "Atza|expiring-soon-token", issuedAt: Date.now() }, 100);

    let lwaCallCount = 0;
    const worker1Owner = "worker-1-sim";
    const worker2Owner = "worker-2-sim";

    // Worker 1 acquires lock
    const w1Lock = await acquireAuthLock(simLockKey, worker1Owner, 10000);
    assert.strictEqual(w1Lock, true, "Worker 1 got the talking stick");

    // Worker 2 tries and is denied
    const w2Lock = await acquireAuthLock(simLockKey, worker2Owner, 10000);
    assert.strictEqual(w2Lock, false, "Worker 2 denied talking stick");

    // Worker 1 calls simulated LwA
    lwaCallCount++;
    const newWinnerToken = "Atza|brand-new-refreshed-token";

    // Worker 2 starts polling in background
    const waiterPromise = (async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 100));
        const res = await readAuthToken(simTokenKey);
        if (res && res.payload?.accessToken === newWinnerToken) {
          return res.payload.accessToken;
        }
      }
      throw new Error("Waiter timed out");
    })();

    // Worker 1 simulates network latency then commits token and releases lock
    await new Promise(r => setTimeout(r, 200));
    await commitTokenIfOwner(simLockKey, worker1Owner, simTokenKey, { accessToken: newWinnerToken, issuedAt: Date.now() }, 3600);
    await releaseAuthLock(simLockKey, worker1Owner);

    // Worker 2 receives the token
    const waiterResult = await waiterPromise;
    assert.strictEqual(waiterResult, newWinnerToken, "Worker 2 received winner's token without calling LwA");
    assert.strictEqual(lwaCallCount, 1, "Exactly one LwA call was made under concurrent contention");
  });
});

