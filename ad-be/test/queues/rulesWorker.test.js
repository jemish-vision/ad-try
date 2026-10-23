const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
require("dotenv").config();
const { createRedisClient } = require("../../queue-service/config/bullmq.config");
const {
  acquireProfileLease,
  renewProfileLease,
  releaseProfileLease,
  getLeaseKey,
} = require("../../queue-service/utils/profileLease");

describe("1. Profile Execution Lease Primitives & Safety", () => {
  let redisClient;
  const configId = "64f1234567890abcdef12345";
  const profileId = 123456789;

  before(() => {
    redisClient = createRedisClient("worker");
  });

  beforeEach(async () => {
    const key = getLeaseKey(configId, profileId);
    await redisClient.del(key);
  });

  after(async () => {
    const key = getLeaseKey(configId, profileId);
    await redisClient.del(key);
    await redisClient.quit().catch(() => {});
  });

  test("Acquires lease successfully with unique owner token", async () => {
    const lease = await acquireProfileLease({
      redisClient,
      configId,
      profileId,
      ttlMs: 5000,
    });

    assert.strictEqual(lease.acquired, true);
    assert.ok(lease.ownerToken);
    assert.strictEqual(lease.leaseKey, getLeaseKey(configId, profileId));

    // Cleanup
    await releaseProfileLease({
      redisClient,
      configId,
      profileId,
      ownerToken: lease.ownerToken,
    });
  });

  test("Second concurrent acquire fails while lease is active", async () => {
    const lease1 = await acquireProfileLease({
      redisClient,
      configId,
      profileId,
      ttlMs: 5000,
    });
    assert.strictEqual(lease1.acquired, true);

    const lease2 = await acquireProfileLease({
      redisClient,
      configId,
      profileId,
      ttlMs: 5000,
    });
    assert.strictEqual(lease2.acquired, false, "Second worker must not acquire busy lease");

    await releaseProfileLease({
      redisClient,
      configId,
      profileId,
      ownerToken: lease1.ownerToken,
    });
  });

  test("Only owner can renew the lease via Lua script", async () => {
    const lease = await acquireProfileLease({
      redisClient,
      configId,
      profileId,
      ttlMs: 5000,
    });

    // Wrong owner renewal fails
    const falseRenew = await renewProfileLease({
      redisClient,
      configId,
      profileId,
      ownerToken: "wrong-token-999",
      ttlMs: 5000,
    });
    assert.strictEqual(falseRenew, false);

    // Correct owner renewal succeeds
    const correctRenew = await renewProfileLease({
      redisClient,
      configId,
      profileId,
      ownerToken: lease.ownerToken,
      ttlMs: 5000,
    });
    assert.strictEqual(correctRenew, true);

    await releaseProfileLease({
      redisClient,
      configId,
      profileId,
      ownerToken: lease.ownerToken,
    });
  });

  test("Only owner can release the lease via Lua script", async () => {
    const lease = await acquireProfileLease({
      redisClient,
      configId,
      profileId,
      ttlMs: 5000,
    });

    // Wrong owner release fails
    const falseRelease = await releaseProfileLease({
      redisClient,
      configId,
      profileId,
      ownerToken: "attacker-token-123",
    });
    assert.strictEqual(falseRelease, false);

    // Lease should still be intact in Redis
    const currentVal = await redisClient.get(getLeaseKey(configId, profileId));
    assert.strictEqual(currentVal, lease.ownerToken);

    // Correct owner release succeeds
    const correctRelease = await releaseProfileLease({
      redisClient,
      configId,
      profileId,
      ownerToken: lease.ownerToken,
    });
    assert.strictEqual(correctRelease, true);

    const afterVal = await redisClient.get(getLeaseKey(configId, profileId));
    assert.strictEqual(afterVal, null);
  });
});
