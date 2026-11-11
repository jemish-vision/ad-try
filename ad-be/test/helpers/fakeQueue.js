/**
 * Minimal fake BullMQ Queue. Records added jobs and returns configurable counts.
 * Adding a job with an existing jobId is ignored (same as BullMQ), which lets
 * tests prove idempotent / deterministic job IDs.
 */
function createFakeQueue(name = "fake-queue", counts = {}) {
  const jobs = new Map();
  let seq = 0;

  return {
    name,

    async add(jobName, data, opts = {}) {
      const id = opts.jobId !== undefined ? String(opts.jobId) : `auto-${++seq}`;
      if (jobs.has(id)) return jobs.get(id);
      const job = { id, name: jobName, data, opts };
      jobs.set(id, job);
      return job;
    },

    async getJob(id) {
      return jobs.get(String(id)) || null;
    },

    async getJobCounts() {
      return { waiting: jobs.size, active: 0, completed: 0, failed: 0, delayed: 0, ...counts };
    },

    async close() {},

    _jobs: jobs,
  };
}

module.exports = { createFakeQueue };
