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

test("SP-API producer keeps deterministic ledger IDs, logs the enqueue, and leaves storage fees on the shared queue", async () => {
  const snapshotJobs = new Map();
  const ledgerJobs = new Map();
  const bulkJobs = new Map();
  const logs = [];
  const queue = (name, jobs) => ({
    name,
    add: async (task, data, { jobId }) => {
      jobs.set(jobId, { task, data });
      return { id: jobId };
    },
  });
  const { enqueueSpApiForOccurrence } = loadModule("queue-service/producers/spApi.producer.js", {
    "../queues/queues": { getQueues: () => ({
      spApiQueue: queue(QUEUES.SP_API, bulkJobs),
      asinSnapshotQueue: queue(QUEUES.ASIN_SNAPSHOT, snapshotJobs),
      fcInventoryLedgerQueue: queue(QUEUES.FC_INVENTORY_LEDGER, ledgerJobs),
    }) },
    "../contracts/jobId": require("../../queue-service/contracts/jobId"),
    "../contracts/jobPayload": require("../../queue-service/contracts/jobPayload"),
    "../queues/queueNames": { QUEUES, SP_API_TASKS },
    "../../winston/cronAutomation/logger": { cron_logs: log => logs.push(log) },
  });
  const { resolveMigratedSchedule } = require("../../queue-service/scheduler/scheduleRegistry");
  assert.equal(resolveMigratedSchedule("ASIN Snapshot").queue, QUEUES.ASIN_SNAPSHOT);
  const scheduledFor = "2026-11-18T01:20:00.000Z";
  await enqueueSpApiForOccurrence({ task: SP_API_TASKS.SYNC_PAST_DATA, scheduledFor });
  const first = await enqueueSpApiForOccurrence({ task: SP_API_TASKS.ASIN_SNAPSHOT, scheduledFor });
  const second = await enqueueSpApiForOccurrence({ task: SP_API_TASKS.ASIN_SNAPSHOT, scheduledFor });
  await enqueueSpApiForOccurrence({ task: SP_API_TASKS.FC_STORAGE_FEE, scheduledFor });
  const ledger = await enqueueSpApiForOccurrence({ task: SP_API_TASKS.FC_INVENTORY_LEDGER, scheduledFor });
  const repeatedLedger = await enqueueSpApiForOccurrence({ task: SP_API_TASKS.FC_INVENTORY_LEDGER, scheduledFor });
  assert.equal(first.jobId, second.jobId);
  assert.equal(snapshotJobs.size, 1);
  assert.equal(bulkJobs.size, 2);
  assert.equal(snapshotJobs.get(first.jobId).data.task, SP_API_TASKS.ASIN_SNAPSHOT);
  assert.deepEqual([...bulkJobs.values()].map(({ task }) => task), [SP_API_TASKS.SYNC_PAST_DATA, SP_API_TASKS.FC_STORAGE_FEE]);
  assert.equal(repeatedLedger.jobId, ledger.jobId);
  assert.equal(ledgerJobs.size, 1);
  assert.equal(ledgerJobs.get(ledger.jobId).data.task, SP_API_TASKS.FC_INVENTORY_LEDGER);
  const event = logs.find(log => log.message.includes(ledger.jobId));
  assert.equal(event?.log_type, "info");
  assert.ok(event.message.includes(QUEUES.FC_INVENTORY_LEDGER));
  assert.ok(event.message.includes(new Date(scheduledFor).toISOString()));
});

test("dedicated daily queues inherit SP-API retries and close with the other producers", async () => {
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
  assert.equal(queues.getQueues().fcInventoryLedgerQueue, first.fcInventoryLedgerQueue);
  assert.equal(first.fcInventoryLedgerQueue.name, "fc-inventory-ledger-queue");
  assert.equal(first.fcInventoryLedgerQueue.options.defaultJobOptions, spApiJobOptions);
  assert.equal(first.fcInventoryLedgerQueue.options.connection, connection);
  assert.equal(first.fcInventoryLedgerQueue.options.prefix, "test-prefix");
  assert.notEqual(first.spApiQueue, first.fcInventoryLedgerQueue);
  await queues.closeQueues();
  assert.ok(created.every(queue => queue.closed));
  assert.equal(disconnected, true);
});

test("the queue observer subscribes to and closes the ledger event stream", async () => {
  const streams = [];
  const shutdown = [];
  const connection = { quit: async () => shutdown.push("disconnected") };
  class QueueEvents {
    constructor(name, options) {
      Object.assign(this, { name, options, listeners: {} });
      streams.push(this);
    }
    on(event, callback) { this.listeners[event] = callback; }
    async close() { shutdown.push(this.name); }
  }
  const observer = loadModule("queue-service/observability/queueEvents.js", {
    bullmq: { QueueEvents },
    os: { hostname: () => "fixture-host" },
    "../queues/queueNames": { QUEUES },
    "../config/bullmq.config": {
      getEventsConnection: () => connection,
      getBullMQPrefix: () => "test-prefix",
    },
    "../../winston/cronAutomation/logger": { cron_logs() {} },
  });
  const first = observer.startQueueEventsObserver();
  assert.equal(first.fcInventoryLedgerEvents?.name, "fc-inventory-ledger-queue");
  assert.equal(first.fcInventoryLedgerEvents.options.connection, connection);
  assert.equal(first.fcInventoryLedgerEvents.options.prefix, "test-prefix");
  assert.equal(typeof first.fcInventoryLedgerEvents.listeners.failed, "function");
  assert.equal(observer.startQueueEventsObserver().fcInventoryLedgerEvents, first.fcInventoryLedgerEvents);
  assert.equal(streams.filter(stream => stream.name === QUEUES.FC_INVENTORY_LEDGER).length, 1);
  await observer.closeQueueEventsObserver();
  assert.ok(shutdown.includes(QUEUES.FC_INVENTORY_LEDGER));
  assert.equal(shutdown.at(-1), "disconnected");
});

test("ledger worker runs independently of a held historical import and ignores leftover shared-queue ledger jobs", async () => {
  const workers = [];
  let shutdown;
  let heartbeatStopped = false;
  const disconnected = [];
  const logs = [];
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
  let releaseImport;
  let importCompleted = false;
  const importPending = new Promise(resolve => { releaseImport = resolve; });
  const processed = [];
  const processor = async (job) => {
    processed.push(job.data.task);
    if (job.data.task === SP_API_TASKS.SYNC_PAST_DATA) {
      await importPending;
      importCompleted = true;
    }
    return { success: true };
  };
  const service = loadModule("queue-service/workers/spApi.worker.js", {
    dotenv: { config() {} },
    "../../shared/connection": { closeMongoConnection: async () => {} },
    bullmq: { Worker },
    "../queues/queueNames": { QUEUES, SP_API_TASKS },
    "../config/bullmq.config": {
      getWorkerConnection: () => connection,
      createRedisClient: () => ({ quit: async () => { disconnected.push("heartbeat"); } }),
      getBullMQPrefix: () => "test-prefix",
    },
    "../processors/spApi.processor": { createSpApiProcessor: () => processor },
    "../observability/workerHeartbeat": { WorkerHeartbeat },
    "../shutdown": { registerGracefulShutdown: options => { shutdown = options.onShutdown; } },
    "../../winston/cronAutomation/logger": { cron_logs: entry => logs.push(entry) },
  });
  const originalWorker = await service.startSpApiWorker();
  assert.equal(originalWorker, workers[0]);
  assert.deepEqual(workers.map(worker => worker.name).sort(), [
    QUEUES.SP_API, QUEUES.ASIN_SNAPSHOT, QUEUES.OUT_OF_STOCK_ADS, QUEUES.FC_INVENTORY_LEDGER,
  ].sort());
  for (const dedicated of workers.slice(1)) {
    assert.equal(dedicated.options.concurrency, 1);
    assert.equal(dedicated.options.prefix, workers[0].options.prefix);
  }
  for (const worker of workers) {
    for (const event of ["active", "completed", "failed", "error"]) {
      assert.equal(typeof worker.listeners[event], "function");
    }
  }
  const ledgerWorker = workers.find(worker => worker.name === QUEUES.FC_INVENTORY_LEDGER);
  const historicalRun = originalWorker.processor({ id: "historical", data: { task: SP_API_TASKS.SYNC_PAST_DATA } });
  try {
    const staleJob = { id: "stale-ledger", data: { task: SP_API_TASKS.FC_INVENTORY_LEDGER } };
    const stale = await originalWorker.processor(staleJob);
    assert.equal(stale.skipped, true);
    assert.equal(stale.reason, "FC_INVENTORY_LEDGER_MOVED");
    originalWorker.listeners.completed(staleJob, stale);
    assert.ok(logs.some(({ message }) => message.includes("SKIPPED Job stale-ledger") && message.includes(stale.reason)));
    const current = await ledgerWorker.processor({ id: "current-ledger", data: { task: SP_API_TASKS.FC_INVENTORY_LEDGER } });
    assert.equal(current.success, true);
    assert.equal(importCompleted, false);
    assert.deepEqual(processed, [SP_API_TASKS.SYNC_PAST_DATA, SP_API_TASKS.FC_INVENTORY_LEDGER]);
  } finally {
    releaseImport();
    await historicalRun;
    await shutdown();
  }
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

test("a partial snapshot fails the BullMQ attempt so the configured retry can run", async () => {
  const { createSpApiProcessor } = loadModule("queue-service/processors/spApi.processor.js", {
    "../contracts/jobPayload": require("../../queue-service/contracts/jobPayload"),
    "../queues/queueNames": { SP_API_TASKS },
    "../../shared/automationMode": { isShadowModeEnabled: () => false },
    "../../winston/cronAutomation/logger": { cron_logs() {} },
    "../../api-server/services/automation/asinSnapshot.service": {
      cronAsinSnapshot: async () => ({ completed: 1, failed: 1 }),
    },
  });
  await assert.rejects(createSpApiProcessor()({
    id: "snapshot",
    data: { task: SP_API_TASKS.ASIN_SNAPSHOT, scheduledFor: "2026-11-24T05:00:00.000Z", timeBlock: "20261124T0500Z" },
  }), /ASIN Snapshot incomplete for 1 profile/);
});
