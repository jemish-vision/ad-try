const { test, describe } = require("node:test");
const assert = require("node:assert");
const { createFakeClock } = require("../../helpers/fakeClock");
const { createFakeRedis } = require("../../helpers/fakeRedis");
const { createFakeQueue } = require("../../helpers/fakeQueue");

describe("helpers: fakeClock", () => {
  test("returns fixed time and advances", () => {
    const c = createFakeClock("2026-10-09T05:30:00.000Z");
    assert.strictEqual(c.now().toISOString(), "2026-10-09T05:30:00.000Z");
    c.advance(60_000);
    assert.strictEqual(c.now().toISOString(), "2026-10-09T05:31:00.000Z");
  });

  test("rejects invalid start date", () => {
    assert.throws(() => createFakeClock("not-a-date"));
  });
});

describe("helpers: fakeRedis", () => {
  test("set/get/del", async () => {
    const r = createFakeRedis();
    await r.set("a", "1");
    assert.strictEqual(await r.get("a"), "1");
    assert.strictEqual(await r.del("a"), 1);
    assert.strictEqual(await r.get("a"), null);
  });

  test("EX expiry follows the clock", async () => {
    const c = createFakeClock();
    const r = createFakeRedis({ nowMs: c.nowMs });
    await r.set("hb", "x", "EX", 45);
    c.advance(44_000);
    assert.strictEqual(await r.get("hb"), "x");
    c.advance(2_000);
    assert.strictEqual(await r.get("hb"), null);
  });

  test("NX only sets when key is free (lock behaviour)", async () => {
    const r = createFakeRedis();
    assert.strictEqual(await r.set("lock", "w1", "PX", 1000, "NX"), "OK");
    assert.strictEqual(await r.set("lock", "w2", "PX", 1000, "NX"), null);
    assert.strictEqual(await r.get("lock"), "w1");
  });

  test("keys supports * pattern and skips expired", async () => {
    const c = createFakeClock();
    const r = createFakeRedis({ nowMs: c.nowMs });
    await r.set("advertiseiq:heartbeat:a", "1", "EX", 10);
    await r.set("advertiseiq:heartbeat:b", "1", "EX", 100);
    await r.set("other", "1");
    c.advance(20_000);
    assert.deepStrictEqual(await r.keys("advertiseiq:heartbeat:*"), ["advertiseiq:heartbeat:b"]);
  });

  test("incr", async () => {
    const r = createFakeRedis();
    assert.strictEqual(await r.incr("n"), 1);
    assert.strictEqual(await r.incr("n"), 2);
  });
});

describe("helpers: fakeQueue", () => {
  test("same jobId is only added once", async () => {
    const q = createFakeQueue();
    await q.add("t", { a: 1 }, { jobId: "job-1" });
    await q.add("t", { a: 2 }, { jobId: "job-1" });
    assert.strictEqual(q._jobs.size, 1);
    assert.deepStrictEqual((await q.getJob("job-1")).data, { a: 1 });
  });

  test("counts can be overridden", async () => {
    const q = createFakeQueue("q", { failed: 3 });
    assert.strictEqual((await q.getJobCounts()).failed, 3);
  });
});
