const { test, describe } = require("node:test");
const assert = require("node:assert");
const { createFakeRedis } = require("../helpers/fakeRedis");
const { sendHealthAlert, buildHealthAlertHtml } = require("../../monitoring/alerts/emailAlert");

describe("Health Alert: Email Dispatcher & Deduplication", () => {
  const sampleCritical = {
    name: "queue_watcher",
    status: "CRITICAL",
    summary: "SQS DLQ contains 5 poison messages",
    details: { dlqMessages: 5, queue: "us-east-1" },
    timestamp: "2026-11-03T10:00:00.000Z",
  };

  test("Healthy status skips email dispatch", async () => {
    let sent = false;
    const mockSender = async () => { sent = true; };

    const res = await sendHealthAlert({
      checkResult: { name: "test_check", status: "OK", summary: "All fine" },
      emailSender: mockSender,
    });

    assert.strictEqual(res.sent, false);
    assert.strictEqual(res.reason, "STATUS_OK");
    assert.strictEqual(sent, false);
  });

  test("Critical check dispatches email with correct subject and HTML", async () => {
    let captured = null;
    const mockSender = async (to, subject, html) => {
      captured = { to, subject, html };
      return { delivered: true };
    };

    const res = await sendHealthAlert({
      checkResult: sampleCritical,
      emailSender: mockSender,
      options: { receiverEmail: "admin@example.com" },
    });

    assert.strictEqual(res.sent, true);
    assert.strictEqual(captured.to, "admin@example.com");
    assert.ok(captured.subject.includes("[AdvertiseIQ CRITICAL]"));
    assert.ok(captured.subject.includes("QUEUE_WATCHER"));
    assert.ok(captured.html.includes("SQS DLQ contains 5 poison messages"));
    assert.ok(captured.html.includes("CRITICAL ALERT"));
  });

  test("Redis deduplication: second alert within 30 minutes is deduplicated", async () => {
    const redis = createFakeRedis();
    let emailCallCount = 0;
    const mockSender = async () => {
      emailCallCount++;
      return { delivered: true };
    };

    // First attempt sends
    const firstRes = await sendHealthAlert({
      checkResult: sampleCritical,
      redisClient: redis,
      emailSender: mockSender,
    });
    assert.strictEqual(firstRes.sent, true);
    assert.strictEqual(emailCallCount, 1);

    // Second immediate attempt is deduplicated by Redis lock
    const secondRes = await sendHealthAlert({
      checkResult: sampleCritical,
      redisClient: redis,
      emailSender: mockSender,
    });
    assert.strictEqual(secondRes.sent, false);
    assert.strictEqual(secondRes.reason, "DEDUPLICATED_BY_REDIS");
    assert.strictEqual(emailCallCount, 1); // No new email sent!
  });

  test("buildHealthAlertHtml generates valid HTML with colors and summary", () => {
    const htmlCrit = buildHealthAlertHtml({
      name: "worker_health",
      status: "CRITICAL",
      summary: "sync-worker is dead",
      details: { role: "sync-worker", pid: 999 },
    });

    assert.ok(htmlCrit.includes("#d32f2f")); // Red header
    assert.ok(htmlCrit.includes("CRITICAL ALERT"));
    assert.ok(htmlCrit.includes("sync-worker is dead"));

    const htmlWarn = buildHealthAlertHtml({
      name: "report_checker",
      status: "WARN",
      summary: "spCampaigns is 2.5h stale",
    });

    assert.ok(htmlWarn.includes("#f57c00")); // Orange header
    assert.ok(htmlWarn.includes("WARNING"));
  });
});
