const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

// FC Inventory Ledger / FC Storage Fee used to run only from worker-service/worker-report.js.
const root = path.join(__dirname, "../..");
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};
const calls = [];
stub("winston/cronAutomation/logger.js", { cron_logs: () => {} });
stub("api-server/controllers/fcInventory.controller.js", {
  cronGenerateFcInventoryLedgerReport: async (arg) => { calls.push(["ledger", arg]); return { ok: true }; },
  cronGenerateFcStorageFeeReport: async (arg) => { calls.push(["storage", arg]); return { ok: true }; },
});

const { resolveMigratedSchedule } = require("../../queue-service/scheduler/scheduleRegistry");
const { QUEUES, SP_API_TASKS } = require("../../queue-service/queues/queueNames");
const { isMigratedTask } = require("../../shared/automationMode");
const { createSpApiProcessor } = require("../../queue-service/processors/spApi.processor");

test("FC Inventory Ledger has a dedicated queue and storage fees stay on the shared SP-API queue", () => {
  assert.equal(QUEUES.FC_INVENTORY_LEDGER, "fc-inventory-ledger-queue");
  assert.deepEqual(resolveMigratedSchedule("FC Inventory Ledger"), { queue: QUEUES.FC_INVENTORY_LEDGER, task: SP_API_TASKS.FC_INVENTORY_LEDGER, family: "sp-api" });
  assert.deepEqual(resolveMigratedSchedule("FC Storage Fee"), { queue: QUEUES.SP_API, task: SP_API_TASKS.FC_STORAGE_FEE, family: "sp-api" });
});

test("legacy workers treat them as migrated (no double run)", () => {
  assert.ok(isMigratedTask("FC Inventory Ledger"));
  assert.ok(isMigratedTask("FC Storage Fee"));
});

test("the SP-API processor runs each report like the old worker did (no arguments)", async () => {
  const processor = createSpApiProcessor();
  const job = (task) => ({ id: task, data: { schemaVersion: 1, task, scheduledFor: "2026-11-18T03:00:00.000Z", timeBlock: "x", trigger: "scheduled" } });
  await processor(job(SP_API_TASKS.FC_INVENTORY_LEDGER));
  await processor(job(SP_API_TASKS.FC_STORAGE_FEE));
  assert.deepEqual(calls, [["ledger", undefined], ["storage", undefined]]);
});
