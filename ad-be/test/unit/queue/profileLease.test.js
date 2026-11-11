const { test, describe } = require("node:test");
const assert = require("node:assert");
const { createFakeRedis } = require("../../helpers/fakeRedis");
const { createFakeClock } = require("../../helpers/fakeClock");
const {
  acquireProfileLease,
  renewProfileLease,
  releaseProfileLease,
  getLeaseKey,
} = require("../../../queue-service/utils/profileLease");

describe("Redis Concurrency: profileLease (Distributed Lock)", () => {
  const configId = "507f1f77bcf86cd799439011";
  const profileId = 123456789;

  test("Single winner: first worker acquires lock, second worker gets rejected", async () => {
    const redis = createFakeRedis();

    const w1 = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 10000 });
    assert.strictEqual(w1.acquired, true);
    assert.ok(w1.ownerToken);

    const w2 = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 10000 });
    assert.strictEqual(w2.acquired, false);
    assert.strictEqual(w2.ownerToken, null);
  });

  test("Safe release: only owner can release the lease", async () => {
    const redis = createFakeRedis();

    const w1 = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 10000 });
    assert.strictEqual(w1.acquired, true);

    // Another worker tries to release w1's lease with invalid token
    const fakeRelease = await releaseProfileLease({
      redisClient: redis,
      configId,
      profileId,
      ownerToken: "wrong-fake-token",
    });
    assert.strictEqual(fakeRelease, false);

    // Lock must still be held
    const leaseKey = getLeaseKey(configId, profileId);
    assert.strictEqual(await redis.get(leaseKey), w1.ownerToken);

    // Genuine owner releases
    const genuineRelease = await releaseProfileLease({
      redisClient: redis,
      configId,
      profileId,
      ownerToken: w1.ownerToken,
    });
    assert.strictEqual(genuineRelease, true);
    assert.strictEqual(await redis.get(leaseKey), null);

    // Now a new worker can acquire
    const w2 = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 10000 });
    assert.strictEqual(w2.acquired, true);
  });

  test("Lease expiration and clock advance: allows new acquisition after TTL", async () => {
    const clock = createFakeClock();
    const redis = createFakeRedis({ nowMs: clock.nowMs });

    const w1 = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 5000 });
    assert.strictEqual(w1.acquired, true);

    // Fast-forward clock by 4 seconds: still held
    clock.advance(4000);
    const tryBeforeExpire = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 5000 });
    assert.strictEqual(tryBeforeExpire.acquired, false);

    // Fast-forward past TTL (2 more seconds -> 6s total)
    clock.advance(2000);
    const tryAfterExpire = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 5000 });
    assert.strictEqual(tryAfterExpire.acquired, true);
  });

  test("Lease renewal: renewProfileLease extends lock TTL for owner only", async () => {
    const clock = createFakeClock();
    const redis = createFakeRedis({ nowMs: clock.nowMs });

    const w1 = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 5000 });
    assert.strictEqual(w1.acquired, true);

    // Wrong token cannot renew
    const badRenew = await renewProfileLease({
      redisClient: redis,
      configId,
      profileId,
      ownerToken: "imposter",
      ttlMs: 5000,
    });
    assert.strictEqual(badRenew, false);

    // Advance 4s and renew for another 5s
    clock.advance(4000);
    const goodRenew = await renewProfileLease({
      redisClient: redis,
      configId,
      profileId,
      ownerToken: w1.ownerToken,
      ttlMs: 5000,
    });
    assert.strictEqual(goodRenew, true);

    // Advance 2s (6s from start, would have expired without renewal)
    clock.advance(2000);
    const w2 = await acquireProfileLease({ redisClient: redis, configId, profileId, ttlMs: 5000 });
    assert.strictEqual(w2.acquired, false); // Still locked!
  });
});
