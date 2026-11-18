const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { QUEUES, SP_API_TASKS } = require("../../queue-service/queues/queueNames");
const { spApiJobOptions } = require("../../queue-service/queues/jobOptions");

function loadModule(filename, dependencies) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, "../..", filename), "utf8");
  vm.runInNewContext(source, {
    module,
    require: (name) => {
      assert.ok(name in dependencies, "Unexpected dependency: " + name);
      return dependencies[name];
    },
    process: { env: {}, pid: 1 },
    console: { log() {} },
  }, { filename });
  return module.exports;
}

test("snapshot producer uses its own queue and keeps deterministic occurrence IDs", async () => {
  const snapshotJobs = new Map();
  const bulkJobs = new Map();
  const queue = (jobs) => ({
    add: async (task, data, { jobId }) => {
      jobs.set(jobId, { task, data });
      return { id: jobId };
    },
  });
  const { enqueueSpApiForOccurrence } = loadModule("queue-service/producers/spApi.producer.js", {
    "../queues/queues": { getQueues: () => ({
      spApiQueue: queue(bulkJobs),
      asinSnapshotQueue: queue(snapshotJobs),
    }) },
    "../contracts/jobId": require("../../queue-service/contracts/jobId"),
    "../contracts/jobPayload": require("../../queue-service/contracts/jobPayload"),
    "../queues/queueNames": { SP_API_TASKS },
  });
  const { resolveMigratedSchedule } = require("../../queue-service/scheduler/scheduleRegistry");
  assert.equal(resolveMigratedSchedule("ASIN Snapshot").queue, QUEUES.ASIN_SNAPSHOT);
  const scheduledFor = "2026-11-18T01:20:00.000Z";
  await enqueueSpApiForOccurrence({ task: SP_API_TASKS.SYNC_PAST_DATA, scheduledFor });
  const first = await enqueueSpApiForOccurrence({ task: SP_API_TASKS.ASIN_SNAPSHOT, scheduledFor });
  const second = await enqueueSpApiForOccurrence({ task: SP_API_TASKS.ASIN_SNAPSHOT, scheduledFor });
  assert.equal(first.jobId, second.jobId);
  assert.equal(snapshotJobs.size, 1);
  assert.equal(bulkJobs.size, 1);
  assert.equal(snapshotJobs.get(first.jobId).data.task, SP_API_TASKS.ASIN_SNAPSHOT);
});

test("snapshot queue inherits SP-API retries and closes with the other producers", async () => {
  const created = [];
  let disconnected = false;
  const connection = { quit: async () => { disconnected = true; } };
  class Queue {
    constructor(name, options) {
      Object.assign(this, { name, options, closed: false });
      created.push(this);
    }
    async close() { this.closed = true; }
  }
  const queues = loadModule("queue-service/queues/queues.js", {
    bullmq: { Queue },
    "./queueNames": { QUEUES },
    "./jobOptions": require("../../queue-service/queues/jobOptions"),
    "../config/bullmq.config": {
      getProducerConnection: () => connection,
      getBullMQPrefix: () => "test-prefix",
    },
  });
  const first = queues.getQueues();
  assert.equal(queues.getQueues().asinSnapshotQueue, first.asinSnapshotQueue);
  assert.equal(first.asinSnapshotQueue.name, QUEUES.ASIN_SNAPSHOT);
  assert.equal(first.asinSnapshotQueue.options.defaultJobOptions, spApiJobOptions);
  assert.equal(first.asinSnapshotQueue.options.prefix, "test-prefix");
  assert.notEqual(first.spApiQueue, first.asinSnapshotQueue);
  await queues.closeQueues();
  assert.ok(created.every(queue => queue.closed));
  assert.equal(disconnected, true);
});

test("SP-API service starts an independent snapshot worker and drains both on shutdown", async () => {
  const workers = [];
  let shutdown;
  let heartbeatStopped = false;
  const disconnected = [];
  const connection = { quit: async () => { disconnected.push("worker"); } };
  class Worker {
    constructor(name, processor, options) {
      Object.assign(this, { name, processor, options, closed: false, listeners: {} });
      workers.push(this);
    }
    on(event, callback) { this.listeners[event] = callback; }
    async close() { this.closed = true; }
  }
  class WorkerHeartbeat {
    start() {}
    async stop() { heartbeatStopped = true; }
  }
  const processor = async () => ({ success: true });
  const service = loadModule("queue-service/workers/spApi.worker.js", {
    dotenv: { config() {} },
    "../../shared/connection": { closeMongoConnection: async () => {} },
    bullmq: { Worker },
    "../queues/queueNames": { QUEUES },
    "../config/bullmq.config": {
      getWorkerConnection: () => connection,
      createRedisClient: () => ({ quit: async () => { disconnected.push("heartbeat"); } }),
      getBullMQPrefix: () => "test-prefix",
    },
    "../processors/spApi.processor": { createSpApiProcessor: () => processor },
    "../observability/workerHeartbeat": { WorkerHeartbeat },
    "../shutdown": { registerGracefulShutdown: options => { shutdown = options.onShutdown; } },
    "../../winston/cronAutomation/logger": { cron_logs() {} },
  });
  const originalWorker = await service.startSpApiWorker();
  assert.equal(originalWorker, workers[0]);
  assert.deepEqual(workers.map(worker => worker.name), [QUEUES.SP_API, QUEUES.ASIN_SNAPSHOT]);
  assert.equal(workers[1].options.concurrency, 1);
  assert.equal(workers[1].options.prefix, workers[0].options.prefix);
  assert.equal(workers[1].processor, workers[0].processor);
  for (const worker of workers) {
    for (const event of ["active", "completed", "failed", "error"]) {
      assert.equal(typeof worker.listeners[event], "function");
    }
  }
  await shutdown();
  assert.ok(workers.every(worker => worker.closed));
  assert.equal(heartbeatStopped, true);
  assert.equal(disconnected.length, 2);
});

test("snapshot processor can complete while a historical import remains active", async () => {
  let releaseImport;
  let importCompleted = false;
  let snapshots = 0;
  const importPending = new Promise(resolve => { releaseImport = resolve; });
  const { createSpApiProcessor } = loadModule("queue-service/processors/spApi.processor.js", {
    "../contracts/jobPayload": require("../../queue-service/contracts/jobPayload"),
    "../queues/queueNames": { SP_API_TASKS },
    "../../shared/automationMode": { isShadowModeEnabled: () => false },
    "../../winston/cronAutomation/logger": { cron_logs() {} },
    "../../api-server/controllers/config.controller": {
      SyncPastData: async () => { await importPending; importCompleted = true; },
    },
    "../../api-server/services/automation/asinSnapshot.service": {
      cronAsinSnapshot: async () => { snapshots++; return { completed: 1 }; },
    },
  });
  const processor = createSpApiProcessor();
  const job = task => ({ id: task, data: {
    task, scheduledFor: "2026-11-18T01:20:00.000Z", timeBlock: "20261118T0120Z",
  } });
  const historicalRun = processor(job(SP_API_TASKS.SYNC_PAST_DATA));
  try {
    const result = await processor(job(SP_API_TASKS.ASIN_SNAPSHOT));
    assert.equal(importCompleted, false);
    assert.equal(snapshots, 1);
    assert.equal(result.result.completed, 1);
  } finally {
    releaseImport();
    await historicalRun;
  }
});
