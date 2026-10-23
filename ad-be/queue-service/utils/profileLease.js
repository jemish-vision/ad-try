const crypto = require("crypto");

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const RENEW_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

function getLeaseKey(configId, profileId) {
  return `automation:rules:${configId}:${profileId}:lease`;
}

/**
 * Acquires a non-blocking execution lease for a profile.
 * Replaces the Mongo isRunning flag with an expiring, crash-safe distributed lock.
 */
async function acquireProfileLease({
  redisClient,
  configId,
  profileId,
  ttlMs = parseInt(process.env.RULES_PROFILE_LEASE_MS, 10) || 900000, // 15 mins default
}) {
  const leaseKey = getLeaseKey(configId, profileId);
  const ownerToken = crypto.randomUUID();

  // SET key value NX PX ttlMs
  const result = await redisClient.set(leaseKey, ownerToken, "PX", ttlMs, "NX");
  if (result === "OK") {
    return {
      acquired: true,
      ownerToken,
      leaseKey,
      ttlMs,
    };
  }

  return {
    acquired: false,
    ownerToken: null,
    leaseKey,
    ttlMs,
  };
}

/**
 * Renews the lease only if this worker is still the registered owner.
 */
async function renewProfileLease({ redisClient, configId, profileId, ownerToken, ttlMs = 900000 }) {
  if (!ownerToken) return false;
  const leaseKey = getLeaseKey(configId, profileId);
  const res = await redisClient.eval(RENEW_LUA, 1, leaseKey, ownerToken, ttlMs);
  return res === 1;
}

/**
 * Releases the lease safely using Lua script to verify token ownership.
 * Never deletes another worker's lease.
 */
async function releaseProfileLease({ redisClient, configId, profileId, ownerToken }) {
  if (!ownerToken) return false;
  const leaseKey = getLeaseKey(configId, profileId);
  const res = await redisClient.eval(RELEASE_LUA, 1, leaseKey, ownerToken);
  return res === 1;
}

module.exports = {
  getLeaseKey,
  acquireProfileLease,
  renewProfileLease,
  releaseProfileLease,
};
