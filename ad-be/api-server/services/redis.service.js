require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const redis = require('redis');
const { write_logs } = require("../../winston/redis/logger");

// Connect to Redis with TLS using the redis package
const redisClient = redis.createClient({ url: process.env.REDIS_URL });

redisClient.on('connect', () => write_logs({ message: 'Redis connected', log_type: 'info' }));
redisClient.on('ready', () => write_logs({ message: 'Redis ready', log_type: 'info' }));
redisClient.on('error', (err) => write_logs({ message: `Redis connection error: ${err}`, log_type: 'error' }));
redisClient.on('end', () => write_logs({ message: 'Redis disconnected', log_type: 'info' }));
redisClient.on('reconnecting', () => write_logs({ message: 'Redis reconnecting', log_type: 'info' }));

redisClient.connect().catch((err) => {
  write_logs({ message: `Redis connect failed: ${err}`, log_type: 'error' });
});

// Cache TTL 10 minutes (600 seconds)
const CACHE_TTL = 600;

const setCacheWithLog = async (key, value, ttl = CACHE_TTL) => {
  try {
    await redisClient.set(key, value, { EX: ttl });
    write_logs({ message: `Redis key stored/updated: ${key}`, log_type: 'info' });
  } catch (err) {
    write_logs({ message: `Redis key store error for ${key}: ${err}`, log_type: 'error' });
  }
};

const getCacheWithLog = async (key) => {
  try {
    const data = await redisClient.get(key);
    write_logs({ message: `Redis key retrieved: ${key}`, log_type: 'info' });
    return data;
  } catch (err) {
    write_logs({ message: `Redis key retrieval error for ${key}: ${err}`, log_type: 'error' });
    return null;
  }
};

const deleteWithLog = async (key) => {
  try {
    await redisClient.del(key);
    write_logs({ message: `Redis key cleared: ${key}`, log_type: 'info' });
  } catch (err) {
    write_logs({ message: `Redis key clear error for ${key}: ${err}`, log_type: 'error' });
  }
};

const deletePatternWithLog = async (pattern) => {
  try {
    for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      await deleteWithLog(key);
    }
  } catch (err) {
    write_logs({ message: `Redis pattern clear error for ${pattern}: ${err}`, log_type: 'error' });
  }
};

// Helper clear functions
const clearAccessTokenCache = async (configId) => await deleteWithLog(`accessToken_${configId}`);
const clearSPAccessTokenCache = async (configId, profileId) => await deleteWithLog(`spAccessToken_${configId}_${profileId}`);
const clearProfileCache = async (configId, profileId) => await deleteWithLog(`profile_${configId}_${profileId}`);
const clearActivePlanProfilesCache = async (profileId) => {
  const target = profileId || "ALL";
  await deleteWithLog(`activePlanProfiles_${target}`);
  await deleteWithLog(`activePlanProfiles_${target}_all`);
  await deleteWithLog(`activePlanProfiles_${target}_ads`);
  await deleteWithLog(`activePlanProfiles_${target}_sp`);
  await deleteWithLog(`activePlanProfiles_ALL_all`);
  await deleteWithLog(`activePlanProfiles_ALL_ads`);
  await deleteWithLog(`activePlanProfiles_ALL_sp`);
  try {
    const pattern = profileId ? `activePlanProfiles_${profileId}_*` : 'activePlanProfiles_*';
    for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      await deleteWithLog(key);
    }
  } catch (err) {
    write_logs({ message: `Error clearing activePlanProfiles cache: ${err}`, log_type: 'error' });
  }
};
const clearOrgPagePermissionCache = async () => {
  try {
    for await (const key of redisClient.scanIterator({ MATCH: 'orgPagePerm_*', COUNT: 100 })) {
      await deleteWithLog(key);
    }
  } catch (err) {
    write_logs({ message: `Error clearing orgPagePermissionCache: ${err}`, log_type: 'error' });
  }
};

const READ_AUTH_TOKEN_LUA = `
local val = redis.call("GET", KEYS[1])
if not val then
  return nil
end
local pttl = redis.call("PTTL", KEYS[1])
return { val, tostring(pttl) }
`;

const EXTEND_AUTH_LOCK_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

const COMMIT_TOKEN_IF_OWNER_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[3])
  return 1
else
  return 0
end
`;

const RELEASE_AUTH_LOCK_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

const isRedisReady = () => {
  return Boolean(redisClient && redisClient.isOpen && redisClient.isReady);
};

const closeRedis = async () => {
  if (redisClient && redisClient.isOpen) {
    if (typeof redisClient.close === 'function') {
      await redisClient.close();
    } else if (typeof redisClient.quit === 'function') {
      await redisClient.quit();
    }
  }
};

const readAuthToken = async (key) => {
  if (!isRedisReady()) {
    throw new Error("REDIS_UNAVAILABLE");
  }
  const result = await redisClient.eval(READ_AUTH_TOKEN_LUA, {
    keys: [key],
    arguments: []
  });
  if (!result || !result[0]) {
    return null;
  }
  let parsedPayload = null;
  try {
    parsedPayload = JSON.parse(result[0]);
  } catch (e) {
    parsedPayload = result[0];
  }
  const pttl = Number(result[1]);
  return {
    payload: parsedPayload,
    pttl: isNaN(pttl) ? -2 : pttl
  };
};

const writeAuthToken = async (key, payload, expiresInSeconds) => {
  if (!isRedisReady()) {
    throw new Error("REDIS_UNAVAILABLE");
  }
  const val = typeof payload === "string" ? payload : JSON.stringify(payload);
  const ttl = Math.max(1, Math.floor(Number(expiresInSeconds) || 3600));
  await redisClient.set(key, val, { EX: ttl });
};

const acquireAuthLock = async (key, owner, ttlMs = 60000) => {
  if (!isRedisReady()) {
    throw new Error("REDIS_UNAVAILABLE");
  }
  const result = await redisClient.set(key, String(owner), { NX: true, PX: ttlMs });
  return result === "OK";
};

const extendAuthLock = async (key, owner, ttlMs = 60000) => {
  if (!isRedisReady()) {
    throw new Error("REDIS_UNAVAILABLE");
  }
  const result = await redisClient.eval(EXTEND_AUTH_LOCK_LUA, {
    keys: [key],
    arguments: [String(owner), String(ttlMs)]
  });
  return Number(result) === 1;
};

const commitTokenIfOwner = async (lockKey, owner, tokenKey, payload, ttlSeconds) => {
  if (!isRedisReady()) {
    throw new Error("REDIS_UNAVAILABLE");
  }
  const val = typeof payload === "string" ? payload : JSON.stringify(payload);
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 3600));
  const result = await redisClient.eval(COMMIT_TOKEN_IF_OWNER_LUA, {
    keys: [lockKey, tokenKey],
    arguments: [String(owner), val, String(ttl)]
  });
  return Number(result) === 1;
};

const releaseAuthLock = async (key, owner) => {
  if (!isRedisReady()) {
    return 0;
  }
  const result = await redisClient.eval(RELEASE_AUTH_LOCK_LUA, {
    keys: [key],
    arguments: [String(owner)]
  });
  return Number(result) === 1;
};

module.exports = {
  redisClient,
  CACHE_TTL,
  setCacheWithLog,
  getCacheWithLog,
  deleteWithLog,
  deletePatternWithLog,
  clearAccessTokenCache,
  clearSPAccessTokenCache,
  clearProfileCache,
  clearActivePlanProfilesCache,
  clearOrgPagePermissionCache,
  // Strict Auth Primitives
  isRedisReady,
  closeRedis,
  readAuthToken,
  writeAuthToken,
  acquireAuthLock,
  extendAuthLock,
  commitTokenIfOwner,
  releaseAuthLock
};

