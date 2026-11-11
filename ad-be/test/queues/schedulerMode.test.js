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
  const source = fs.readFileSync(path.join(__dirname, "../../queue-service/scheduler/index.js"), "utf8");
  const module = { exports: {} };
  const dependencies = {
    dotenv: { config() {} },
    "node-cron": {
      validate: () => true,
      schedule() {
        scheduled++;
        return { stop() { stopped++; } };
      },
    },
    "./scheduleRegistry": { resolveMigratedSchedule: () => ({ task: "budget-rules", family: "rules" }) },
    "../../shared/automationMode": {
      isQueueModeEnabled: () => queueMode,
      isShadowModeEnabled: () => shadowMode,
    },
    "../../winston/cronAutomation/logger": { cron_logs() {} },
    "../config/bullmq.config": { createRedisClient() { redisConnections++; } },
  };
  vm.runInNewContext(source, {
    module,
    require: name => dependencies[name] || {},
    process: { env: {} },
    console,
  });
  return {
    scheduler: module.exports,
    enable: value => { queueMode = value; },
    shadow: value => { shadowMode = value; },
    counts: () => ({ scheduled, stopped, redisConnections }),
  };
}

test("legacy mode blocks queue startup before creating Redis connections", async () => {
  const fixture = loadScheduler();
  await assert.rejects(fixture.scheduler.startProducerScheduler(), /AUTOMATION_EXECUTION_MODE=queue/);
  assert.equal(fixture.counts().redisConnections, 0);
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
