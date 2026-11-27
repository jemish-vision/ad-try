const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const vm = require("node:vm");
const mongoose = require("mongoose");
const cronJobHistorySchema = require("../../../api-server/models/cronJobHistory.model");
const {
  recordCronStart,
  recordCronSuccess,
  recordCronFailure,
  recordCronExecution,
} = require("../../../api-server/helper/cronHistory.helper");
function loadWithOverrides(filename, overrides) {
  const requireFromModule = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : requireFromModule(name),
    process: { env: { RECEIVER_EMAIL: "cron-test@example.invalid" } },
    console,
  }, { filename });
  return module.exports;
}

function createTestRunner(workerName, alerts) {
  const heartbeat = loadWithOverrides(require.resolve("../../../api-server/helper/heartbeat.helper"), {
    "./emailHelper": { sendEmailHelper: async (to, subject, html) => alerts.push({ to, subject, html }) },
  });
  const { createRunJobSafely } = loadWithOverrides(require.resolve("../../../worker-service/runJobSafely.helper"), {
    "../api-server/helper/heartbeat.helper": heartbeat,
    "../winston/cronAutomation/logger": { cron_logs() {} },
  });
  return createRunJobSafely(workerName);
}

describe("Schema & Helper: cronJobHistory Details & Execution Tracking", () => {
  test("Schema accepts and validates details, recordsCount, durationMs, and error fields", () => {
    const sample = new cronJobHistorySchema({
      profileId: 123456789,
      cronName: "Campaign Report",
      status: "COMPLETED",
      historyDate: "2026-11-03",
      reportType: "spCampaigns",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      recordsCount: 250,
      durationMs: 4500,
      details: {
        totalSpend: 1540.25,
        totalSales: 8900.5,
        reportTypes: ["spCampaigns", "sbCampaigns", "sdCampaigns"],
        batchesProcessed: 3,
      },
    });

    const obj = sample.toObject();
    assert.strictEqual(obj.profileId, 123456789);
    assert.strictEqual(obj.cronName, "Campaign Report");
    assert.strictEqual(obj.status, "COMPLETED");
    assert.strictEqual(obj.recordsCount, 250);
    assert.strictEqual(obj.durationMs, 4500);
    assert.strictEqual(obj.reportType, "spCampaigns");
    assert.strictEqual(obj.startDate, "2026-11-01");
    assert.strictEqual(obj.endDate, "2026-11-03");
    assert.strictEqual(obj.details.totalSpend, 1540.25);
    assert.strictEqual(obj.details.totalSales, 8900.5);
    assert.strictEqual(obj.details.batchesProcessed, 3);
    assert.strictEqual(obj.details.reportTypes.length, 3);
  });

  test("recordCronStart helper builds correct query and set payload", async () => {
    let capturedQuery = null;
    let capturedUpdate = null;

    const mockSchema = {
      findOneAndUpdate: async (q, u, opts) => {
        capturedQuery = q;
        capturedUpdate = u;
        return { _id: "hist-001", ...q, ...u.$set };
      },
    };

    const origFindOneAndUpdate = cronJobHistorySchema.findOneAndUpdate;
    cronJobHistorySchema.findOneAndUpdate = mockSchema.findOneAndUpdate;

    try {
      const doc = await recordCronStart({
        profileId: 999,
        cronName: "Targeting Report",
        historyDate: "2026-11-03",
        startDate: "2026-11-01",
        endDate: "2026-11-03",
        reportType: "spTargeting",
        details: { triggeredBy: "scheduler" },
      });

      assert.strictEqual(capturedQuery.profileId, 999);
      assert.strictEqual(capturedQuery.cronName, "Targeting Report");
      assert.strictEqual(capturedUpdate.$set.status, "PENDING");
      assert.strictEqual(capturedUpdate.$set.startDate, "2026-11-01");
      assert.strictEqual(capturedUpdate.$set["details.triggeredBy"], "scheduler");
      assert.ok(capturedUpdate.$set["details.startedAt"]);
    } finally {
      cronJobHistorySchema.findOneAndUpdate = origFindOneAndUpdate;
    }
  });

  test("recordCronSuccess helper updates status to COMPLETED and sets duration and recordsCount", async () => {
    let capturedUpdate = null;

    const mockSchema = {
      findOneAndUpdate: async (q, u) => {
        capturedUpdate = u;
        return { _id: "hist-002", ...u.$set };
      },
    };

    const origFindOneAndUpdate = cronJobHistorySchema.findOneAndUpdate;
    cronJobHistorySchema.findOneAndUpdate = mockSchema.findOneAndUpdate;

    try {
      await recordCronSuccess({
        historyId: "hist-002",
        recordsCount: 500,
        durationMs: 3200,
        details: { totalSpend: 250 },
      });

      assert.strictEqual(capturedUpdate.$set.status, "COMPLETED");
      assert.strictEqual(capturedUpdate.$set.recordsCount, 500);
      assert.strictEqual(capturedUpdate.$set.durationMs, 3200);
      assert.strictEqual(capturedUpdate.$set["details.totalSpend"], 250);
      assert.ok(capturedUpdate.$set["details.completedAt"]);
    } finally {
      cronJobHistorySchema.findOneAndUpdate = origFindOneAndUpdate;
    }
  });

  test("recordCronFailure helper updates status to FAILED and records error string", async () => {
    let capturedUpdate = null;

    const mockSchema = {
      findOneAndUpdate: async (q, u) => {
        capturedUpdate = u;
        return { _id: "hist-003", ...u.$set };
      },
    };

    const origFindOneAndUpdate = cronJobHistorySchema.findOneAndUpdate;
    cronJobHistorySchema.findOneAndUpdate = mockSchema.findOneAndUpdate;

    try {
      await recordCronFailure({
        historyId: "hist-003",
        error: new Error("Amazon SP-API 429 Quota Exceeded"),
        details: { retryAttempt: 2 },
      });

      assert.strictEqual(capturedUpdate.$set.status, "FAILED");
      assert.strictEqual(capturedUpdate.$set.error, "Amazon SP-API 429 Quota Exceeded");
      assert.strictEqual(capturedUpdate.$set["details.errorMessage"], "Amazon SP-API 429 Quota Exceeded");
      assert.strictEqual(capturedUpdate.$set["details.retryAttempt"], 2);
      assert.ok(capturedUpdate.$set["details.failedAt"]);
    } finally {
      cronJobHistorySchema.findOneAndUpdate = origFindOneAndUpdate;
    }
  });

  test("recordCronExecution performs safe upsert without duplicate key crash", async () => {
    let capturedQuery = null;
    let capturedUpdate = null;

    const mockSchema = {
      findOneAndUpdate: async (q, u, opts) => {
        capturedQuery = q;
        capturedUpdate = u;
        return { _id: "hist-004", ...q, ...u.$set };
      },
    };

    const origFindOneAndUpdate = cronJobHistorySchema.findOneAndUpdate;
    cronJobHistorySchema.findOneAndUpdate = mockSchema.findOneAndUpdate;

    try {
      const doc = await recordCronExecution({
        configId: "507f1f77bcf86cd799439011",
        profileId: 101,
        cronName: "ProductAds Listing",
        status: "COMPLETED",
        recordsCount: 42,
        details: { timezone: "America/Los_Angeles" },
      });

      assert.strictEqual(capturedQuery.cronName, "ProductAds Listing");
      assert.strictEqual(capturedQuery.profileId, 101);
      assert.strictEqual(capturedUpdate.$set.status, "COMPLETED");
      assert.strictEqual(capturedUpdate.$set.recordsCount, 42);
      assert.strictEqual(capturedUpdate.$set["details.timezone"], "America/Los_Angeles");
      assert.ok(capturedUpdate.$set["details.executedAt"]);
    } finally {
      cronJobHistorySchema.findOneAndUpdate = origFindOneAndUpdate;
    }
  });

  test("createRunJobSafely records start and success lifecycle for worker crons", async () => {
    const recordedEvents = [];

    const mockSchema = {
      findOneAndUpdate: async (q, u) => {
        recordedEvents.push({ query: q, update: u });
        return { _id: "hist-run-1" };
      },
    };

    const origFindOneAndUpdate = cronJobHistorySchema.findOneAndUpdate;
    cronJobHistorySchema.findOneAndUpdate = mockSchema.findOneAndUpdate;

    try {
      const alerts = [];
      const runner = createTestRunner("worker-fast", alerts);
      let taskExecuted = false;

      await runner("Review Request", async () => {
        taskExecuted = true;
        return { recordsCount: 15, details: { emailsSent: 15 } };
      });

      assert.strictEqual(taskExecuted, true);
      assert.strictEqual(alerts.length, 0);
      assert.strictEqual(recordedEvents.length, 2);

      // Event 1: Start
      assert.strictEqual(recordedEvents[0].query.cronName, "Review Request");
      assert.strictEqual(recordedEvents[0].update.$set.status, "PENDING");
      assert.strictEqual(recordedEvents[0].update.$set["details.worker"], "worker-fast");

      // Event 2: Success
      assert.strictEqual(recordedEvents[1].query._id, "hist-run-1");
      assert.strictEqual(recordedEvents[1].update.$set.status, "COMPLETED");
      assert.strictEqual(recordedEvents[1].update.$set.recordsCount, 15);
      assert.strictEqual(recordedEvents[1].update.$set["details.emailsSent"], 15);
      assert.ok(recordedEvents[1].update.$set.durationMs >= 0);
    } finally {
      cronJobHistorySchema.findOneAndUpdate = origFindOneAndUpdate;
    }
  });

  test("createRunJobSafely catches errors, logs failure to cronJobHistory, and sends alert", async () => {
    const recordedEvents = [];

    const mockSchema = {
      findOneAndUpdate: async (q, u) => {
        recordedEvents.push({ query: q, update: u });
        return { _id: "hist-run-2" };
      },
    };

    const origFindOneAndUpdate = cronJobHistorySchema.findOneAndUpdate;
    cronJobHistorySchema.findOneAndUpdate = mockSchema.findOneAndUpdate;

    try {
      const alerts = [];
      const runner = createTestRunner("worker-heavy", alerts);

      await runner("FC Storage Fee", async () => {
        throw new Error("Amazon SP-API 500 Internal Error");
      });

      assert.strictEqual(alerts.length, 1);
      assert.strictEqual(alerts[0].to, "cron-test@example.invalid");
      assert.strictEqual(alerts[0].subject, "Cron Failure Alert: FC Storage Fee");
      assert.match(alerts[0].html, /JOB_FAILED/);
      assert.match(alerts[0].html, /Amazon SP-API 500 Internal Error/);
      assert.strictEqual(recordedEvents.length, 2);

      // Event 1: Start
      assert.strictEqual(recordedEvents[0].query.cronName, "FC Storage Fee");
      assert.strictEqual(recordedEvents[0].update.$set.status, "PENDING");

      // Event 2: Failure
      assert.strictEqual(recordedEvents[1].query._id, "hist-run-2");
      assert.strictEqual(recordedEvents[1].update.$set.status, "FAILED");
      assert.strictEqual(recordedEvents[1].update.$set.error, "Amazon SP-API 500 Internal Error");
      assert.strictEqual(recordedEvents[1].update.$set["details.errorMessage"], "Amazon SP-API 500 Internal Error");
    } finally {
      cronJobHistorySchema.findOneAndUpdate = origFindOneAndUpdate;
    }
  });
});
