const os = require("os");

/**
 * Worker Heartbeat helper to maintain instance liveness in Redis
 */
class WorkerHeartbeat {
  /**
   * @param {Object} options
   * @param {import('ioredis')} options.redisClient
   * @param {'rules-worker'|'sync-worker'|'queue-producer'} options.role
   * @param {number} [options.intervalMs]
   * @param {number} [options.ttlSec]
   */
  constructor({ redisClient, role, intervalMs = 15000, ttlSec = 45 }) {
    this.redisClient = redisClient;
    this.role = role;
    this.intervalMs = intervalMs;
    this.ttlSec = ttlSec;
    this.instanceId = `${role}:${os.hostname()}:${process.pid}`;
    this.key = `advertiseiq:heartbeat:${this.instanceId}`;
    this.timer = null;
  }

  async beat() {
    try {
      const payload = JSON.stringify({
        instanceId: this.instanceId,
        role: this.role,
        hostname: os.hostname(),
        pid: process.pid,
        updatedAt: new Date().toISOString(),
        uptimeSec: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage(),
      });
      await this.redisClient.set(this.key, payload, "EX", this.ttlSec);
    } catch (err) {
      console.warn(`[Heartbeat] Failed to record heartbeat for ${this.instanceId}:`, err.message);
    }
  }

  start() {
    if (this.timer) return;
    this.beat();
    this.timer = setInterval(() => this.beat(), this.intervalMs);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      await this.redisClient.del(this.key);
    } catch (_) {}
  }
}

module.exports = {
  WorkerHeartbeat,
};
