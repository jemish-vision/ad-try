const IORedis = require("ioredis");
require("dotenv").config();

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required for BullMQ initialization.");
}

function getBullMQPrefix() {
  if (process.env.BULLMQ_PREFIX) {
    return process.env.BULLMQ_PREFIX;
  }
  const mode = (process.env.AUTOMATION_EXECUTION_MODE || "legacy").toLowerCase().trim();
  if (mode === "shadow") {
    return "advertiseiq:bull:shadow:v1";
  }
  return "advertiseiq:bull:v1";
}

/**
 * Creates an IORedis client with settings specifically tuned for BullMQ.
 * Note: Never configure ioredis `keyPrefix` - BullMQ provides its own prefix configuration.
 */
function createRedisClient(type = "default") {
  const options = {
    // BullMQ requires maxRetriesPerRequest: null for workers and blocking commands
    maxRetriesPerRequest: type === "producer" ? 1 : null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (type === "producer" && times > 3) {
        // Fail fast for producer so requests do not hang
        return null;
      }
      // Workers reconnect indefinitely with backoff
      return Math.min(times * 100, 3000);
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ETIMEDOUT", "ECONNRESET"];
      if (targetErrors.some((code) => err.message.includes(code))) {
        return true;
      }
      return false;
    },
  };

  return new IORedis(REDIS_URL, options);
}

module.exports = {
  REDIS_URL,
  get BULLMQ_PREFIX() {
    return getBullMQPrefix();
  },
  getBullMQPrefix,
  createRedisClient,
  getProducerConnection: () => createRedisClient("producer"),
  getWorkerConnection: () => createRedisClient("worker"),
  getEventsConnection: () => createRedisClient("events"),
};
