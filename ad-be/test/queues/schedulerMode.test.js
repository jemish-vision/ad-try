const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScheduler() {
  let queueMode = false;
  let shadowMode = false;
  let scheduled = 0;
  let stopped = 0;
  let redisConnections = 0;
  const schedules = [], enqueues = [], watch = new Map(), intervals = new Map();
  let docs = [], shutdown;
  const now = new Date("2026-11-24T05:42:00Z");
  class Clock extends Date { constructor(value = now) { super(value); } }
  const source = fs.readFileSync(path.join(__dirname, "../../queue-service/scheduler/index.js"), "utf8");
  const module = { exports: {} };
  const dependencies = {
    dotenv: { config() {} },
    "node-cron": {
      validate: () => true,
      schedule(expression, run) {
        scheduled++;
        schedules.push({ expression, run });
        return { stop() { stopped++; } };
      },
    },
    "./scheduleRegistry": { resolveMigratedSchedule: name => name === "ASIN Snapshot"
      ? { task: "asin-snapshot", family: "sp-api" } : { task: "budget-rules", family: "rules" } },
    "../queues/queueNames": { SP_API_TASKS: { ASIN_SNAPSHOT: "asin-snapshot" } },
    "../producers/spApi.producer": { enqueueSpApiForOccurrence: async args => enqueues.push(args) },
    "../../api-server/models/cronJob.model": {
      find: () => ({ lean: async () => docs }),
      exists: async () => true,
      watch: () => ({ on: (event, listener) => watch.set(event, listener), close: async () => {} }),
    },
    "./timeBucket": { getBoundedLookbackHours: () => [] },
    "../observability/workerHeartbeat": { WorkerHeartbeat: class { start() {} async stop() {} } },
    "../shutdown": { registerGracefulShutdown: options => { shutdown = options.onShutdown; } },
    "../queues/queues": { closeQueues: async () => {} },
    "../../shared/connection": { closeMongoConnection: async () => {} },
    "../../shared/automationMode": {
      isQueueModeEnabled: () => queueMode,
      isShadowModeEnabled: () => shadowMode,
    },
    "../../winston/cronAutomation/logger": { cron_logs() {} },
    "../config/bullmq.config": { createRedisClient() { redisConnections++; return { quit: async () => {} }; } },
  };
  vm.runInNewContext(source, {
    module,
    require: name => dependencies[name] || {},
    process: { env: {} },
    Date: Clock,
    setInterval: fn => { const id = Symbol(); intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    console,
  });
  return {
    scheduler: module.exports,
    enable: value => { queueMode = value; },
    shadow: value => { shadowMode = value; },
    counts: () => ({ scheduled, stopped, redisConnections }),
    schedules, enqueues, watch, intervals,
    setDocs: value => { docs = value; },
    shutdown: () => shutdown(),
  };
}

test("legacy mode blocks queue startup before creating Redis connections", async () => {
  const fixture = loadScheduler();
  await assert.rejects(fixture.scheduler.startProducerScheduler(), /AUTOMATION_EXECUTION_MODE=queue/);
  assert.equal(fixture.counts().redisConnections, 0);
});

test("snapshot recovers at startup and shares the scheduled hourly job ID", async () => {
  const fixture = loadScheduler();
  fixture.enable(true);
  fixture.setDocs([{ cronName: "ASIN Snapshot", isActive: true, cronExpression: "0 7 * * * *" }]);
  await fixture.scheduler.startProducerScheduler();
  assert.equal(fixture.enqueues.length, 1);
  await fixture.schedules[0].run();
  await fixture.schedules[1].run();
  assert.deepEqual(fixture.enqueues.map(row => row.scheduledFor.toISOString()), Array(3).fill("2026-11-24T05:00:00.000Z"));
  await fixture.watch.get("change")({ operationType: "update" });
  assert.equal(fixture.schedules.length, 2);
  await fixture.shutdown();
});

test("asynchronous watch errors start one fallback poll and a deleted schedule stops recovery", async () => {
  const fixture = loadScheduler();
  fixture.enable(true);
  fixture.setDocs([{ cronName: "ASIN Snapshot", isActive: true, cronExpression: "0 7 * * * *" }]);
  await fixture.scheduler.startProducerScheduler();
  fixture.watch.get("error")(new Error("watch disconnected"));
  fixture.watch.get("error")(new Error("watch disconnected again"));
  assert.equal(fixture.intervals.size, 1);
  fixture.setDocs([]);
  await [...fixture.intervals.values()][0]();
  await fixture.schedules[1].run();
  assert.equal(fixture.enqueues.length, 1);
  await fixture.shutdown();
  assert.equal(fixture.intervals.size, 0);
});

test("shadow mode preserves dry-run schedule registration", () => {
  const fixture = loadScheduler();
  fixture.shadow(true);
  fixture.scheduler.registerSchedule({ cronName: "BudgetRuleSchedules", isActive: true, cronExpression: "* * * * *" });
  assert.equal(fixture.counts().scheduled, 1);
});

test("queue schedule registration respects mode and stops a prior schedule when mode is disabled", () => {
  const fixture = loadScheduler();
  const document = { cronName: "BudgetRuleSchedules", isActive: true, cronExpression: "* * * * *" };
  fixture.scheduler.registerSchedule(document);
  assert.equal(fixture.counts().scheduled, 0);
  fixture.enable(true);
  fixture.scheduler.registerSchedule(document);
  assert.equal(fixture.counts().scheduled, 1);
  fixture.enable(false);
  fixture.scheduler.registerSchedule(document);
  assert.equal(fixture.counts().scheduled, 1);
  assert.equal(fixture.counts().stopped, 1);
});
