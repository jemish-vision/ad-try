const { test, describe } = require("node:test");
const assert = require("node:assert");
const { checkQueueHealth } = require("../../monitoring/checks/queueWatcher");

describe("Health Check: Queue Watcher (BullMQ & SQS)", () => {
  const baseNow = new Date("2026-11-03T10:00:00.000Z");

  test("Healthy case: all queues have 0 failures and low waiting count", async () => {
    const mockQueues = {
      rules: {
        getJobCounts: async () => ({ waiting: 5, active: 2, completed: 100, failed: 0, delayed: 1 }),
        getActive: async () => [],
      },
      hourlySync: {
        getJobCounts: async () => ({ waiting: 0, active: 1, completed: 50, failed: 0, delayed: 0 }),
        getActive: async () => [],
      },
    };

    const res = await checkQueueHealth({ queues: mockQueues, now: baseNow });
    assert.strictEqual(res.name, "queue_watcher");
    assert.strictEqual(res.status, "OK");
    assert.strictEqual(res.details.bullmq.rules.waiting, 5);
    assert.strictEqual(res.details.stuckJobs.length, 0);
  });

  test("Waiting backlog: warning at 50 jobs, critical at 200 jobs", async () => {
    const warnQueues = {
      rules: {
        getJobCounts: async () => ({ waiting: 75, active: 1, completed: 10, failed: 0, delayed: 0 }),
      },
    };
    const resWarn = await checkQueueHealth({ queues: warnQueues, now: baseNow });
    assert.strictEqual(resWarn.status, "WARN");
    assert.ok(resWarn.summary.includes("elevated waiting backlog"));

    const critQueues = {
      rules: {
        getJobCounts: async () => ({ waiting: 250, active: 1, completed: 10, failed: 0, delayed: 0 }),
      },
    };
    const resCrit = await checkQueueHealth({ queues: critQueues, now: baseNow });
    assert.strictEqual(resCrit.status, "CRITICAL");
    assert.ok(resCrit.summary.includes("CRITICAL waiting backlog"));
  });

  test("Failed jobs: warning at 1 job, critical at 10 jobs", async () => {
    const warnQueues = {
      rules: {
        getJobCounts: async () => ({ waiting: 0, active: 0, completed: 10, failed: 2, delayed: 0 }),
      },
    };
    const resWarn = await checkQueueHealth({ queues: warnQueues, now: baseNow });
    assert.strictEqual(resWarn.status, "WARN");
    assert.ok(resWarn.summary.includes("failed jobs: 2"));

    const critQueues = {
      rules: {
        getJobCounts: async () => ({ waiting: 0, active: 0, completed: 10, failed: 12, delayed: 0 }),
      },
    };
    const resCrit = await checkQueueHealth({ queues: critQueues, now: baseNow });
    assert.strictEqual(resCrit.status, "CRITICAL");
    assert.ok(resCrit.summary.includes("high failed count: 12"));
  });

  test("Active stuck jobs: warning at 15m, critical at 30m", async () => {
    const warnQueues = {
      rules: {
        getJobCounts: async () => ({ waiting: 0, active: 1, completed: 0, failed: 0, delayed: 0 }),
        getActive: async () => [
          {
            id: "job-stuck-1",
            processedOn: new Date("2026-11-03T09:42:00.000Z").getTime(), // 18 mins ago
          },
        ],
      },
    };
    const resWarn = await checkQueueHealth({ queues: warnQueues, now: baseNow });
    assert.strictEqual(resWarn.status, "WARN");
    assert.strictEqual(resWarn.details.stuckJobs.length, 1);
    assert.strictEqual(resWarn.details.stuckJobs[0].severity, "WARN");

    const critQueues = {
      rules: {
        getJobCounts: async () => ({ waiting: 0, active: 1, completed: 0, failed: 0, delayed: 0 }),
        getActive: async () => [
          {
            id: "job-stuck-2",
            processedOn: new Date("2026-11-03T09:20:00.000Z").getTime(), // 40 mins ago
          },
        ],
      },
    };
    const resCrit = await checkQueueHealth({ queues: critQueues, now: baseNow });
    assert.strictEqual(resCrit.status, "CRITICAL");
    assert.strictEqual(resCrit.details.stuckJobs.length, 1);
    assert.strictEqual(resCrit.details.stuckJobs[0].severity, "CRITICAL");
  });

  test("SQS DLQ: any message in Dead-Letter-Queue triggers CRITICAL", async () => {
    const mockSqsClient = {
      getQueueAttributes: async (queueUrl) => {
        if (queueUrl.includes("dlq")) {
          return { ApproximateNumberOfMessages: "3" };
        }
        return {
          ApproximateNumberOfMessages: "100",
          ApproximateNumberOfMessagesNotVisible: "10",
          ApproximateNumberOfMessagesDelayed: "0",
        };
      },
    };

    const sqsQueues = [
      {
        name: "us-east-1",
        queueUrl: "https://sqs.us-east-1.amazonaws.com/123/main-queue",
        dlqUrl: "https://sqs.us-east-1.amazonaws.com/123/dlq",
      },
    ];

    const res = await checkQueueHealth({
      sqsClient: mockSqsClient,
      sqsQueues,
      now: baseNow,
    });

    assert.strictEqual(res.status, "CRITICAL");
    assert.ok(res.summary.includes("contains 3 unhandled poison messages"));
    assert.strictEqual(res.details.sqs[0].dlqCount, 3);
  });

  test("SQS total volume: critical when backlog exceeds 10,000", async () => {
    const mockSqsClient = {
      getQueueAttributes: async () => ({
        ApproximateNumberOfMessages: "8500",
        ApproximateNumberOfMessagesNotVisible: "2000",
        ApproximateNumberOfMessagesDelayed: "0",
      }),
    };

    const sqsQueues = [
      {
        name: "eu-west-1",
        queueUrl: "https://sqs.eu-west-1.amazonaws.com/123/main-queue",
      },
    ];

    const res = await checkQueueHealth({
      sqsClient: mockSqsClient,
      sqsQueues,
      now: baseNow,
    });

    assert.strictEqual(res.status, "CRITICAL");
    assert.strictEqual(res.details.sqs[0].total, 10500);
    assert.ok(res.summary.includes("critically high: 10500"));
  });
});
