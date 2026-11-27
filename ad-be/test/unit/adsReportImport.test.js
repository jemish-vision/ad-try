const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { gzipSync } = require("node:zlib");
const { withDownloadedReportFile } = require("../../api-server/helper/reportFile.helper");

function loadModule(name, overrides) {
  const file = require.resolve(`../../api-server/services/${name}.service`);
  const localRequire = createRequire(file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    module, Buffer, setInterval, clearInterval,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name),
  }, { filename: file });
  return module.exports;
}

function fixture({ stage } = {}) {
  const record = { _id: "record", status: "PENDING" };
  let lock = false;
  const attempts = [];
  const staged = [];
  const states = [];
  const matches = filter => Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some(matches);
    return value === null ? record[key] == null : record[key] === value;
  });
  const { stageDownloadedAdsReport } = loadModule("adsReportImport", {
    "../models/report.model": {
      findById: () => ({ select: () => ({ lean: async () => ({ ...record }) }) }),
      updateOne: async (filter, update) => {
        if (!matches(filter)) return { matchedCount: 0 };
        Object.assign(record, update.$set);
        for (const key of Object.keys(update.$unset || {})) delete record[key];
        states.push(record.status);
        return { matchedCount: 1 };
      },
    },
    "./reportStaging.service": {
      acquireImportLock: async () => {
        if (lock) return null;
        lock = true;
        return "token";
      },
      checkImportLock: async () => lock,
      renewImportLock: async () => lock,
      releaseImportLock: async () => { lock = false; },
    },
    "./reportFileStager.service": {
      stageReportFileInRedis: async input => {
        staged.push(input);
        return stage ? stage(input, record) : input.beforeReady();
      },
    },
  });
  const run = (bytes, beforeDownload = async () => {}) => stageDownloadedAdsReport({
    report: { _id: "record", reportId: "same-report" },
    url: "https://example.invalid/report", entity: "productAd", runPrefix: "run_productad",
    meta: { configId: "config", profileId: 123, reportId: "same-report" }, retryOnFailure: true,
    downloadFile: async (_url, file) => {
      attempts.push(file);
      await beforeDownload();
      await fs.promises.writeFile(file, bytes);
    },
  });
  return { run, record, attempts, staged, states };
}

test("two workers staging the same provider report perform one download and publish one run", async () => {
  let release;
  let started;
  const begin = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const h = fixture({ stage: async ({ filePath, beforeReady }, record) => {
    assert.deepEqual(JSON.parse(await fs.promises.readFile(filePath, "utf8")), [{ id: 1 }]);
    assert.equal(record.status, "PENDING");
    await beforeReady();
    assert.equal(record.status, "STAGED");
  } });
  const pending = h.run(gzipSync('[{"id":1}]'), async () => { started(); await wait; });
  await begin;
  assert.equal(await h.run(gzipSync('[{"id":1}]')), "PENDING");
  release();
  assert.equal(await pending, "STAGED");
  assert.equal(await h.run(gzipSync('[{"id":1}]')), "STAGED");
  assert.equal(h.attempts.length, 1);
  assert.equal(h.staged.length, 1);
  assert.deepEqual(h.states, ["STAGED"]);
  assert.equal(fs.existsSync(path.dirname(h.attempts[0])), false);
});

test("truncated gzip fails before parsing and a retry uses a fresh temporary file", async () => {
  const h = fixture();
  await assert.rejects(h.run(gzipSync("[{}]").subarray(0, -5)), /unexpected end of file/i);
  assert.equal(h.record.status, "PENDING");
  assert.equal(h.staged.length, 0);
  assert.match(h.record.errorMessage, /Staging failed/);
  assert.equal(await h.run(Buffer.from("[{}]")), "STAGED");
  assert.notEqual(h.attempts[0], h.attempts[1]);
  assert.ok(h.attempts.every(file => !fs.existsSync(path.dirname(file))));
  assert.equal(h.record.errorMessage, undefined);
});

test("overlapping direct imports keep their files separate until processing finishes", async () => {
  const files = [];
  let unblock;
  let startReading;
  const blocked = new Promise(resolve => { unblock = resolve; });
  const reading = new Promise(resolve => { startReading = resolve; });
  const reportUrl = "https://example.invalid/same-report";
  const download = text => (_url, file) => fs.promises.writeFile(file, gzipSync(text));
  const first = withDownloadedReportFile(reportUrl, download("first TSV"), async file => {
    files.push(file);
    startReading();
    await blocked;
    return fs.promises.readFile(file, "utf8");
  });
  await Promise.race([reading, first]);
  try {
    const second = await withDownloadedReportFile(reportUrl, download("second TSV"), async file => {
      files.push(file);
      return fs.promises.readFile(file, "utf8");
    });
    assert.equal(second, "second TSV");
    assert.notEqual(path.dirname(files[0]), path.dirname(files[1]));
    assert.ok(fs.existsSync(files[0]));
    assert.equal(fs.existsSync(files[1]), false);
  } finally {
    unblock();
    assert.equal(await first, "first TSV");
  }
  assert.ok(files.every(file => !fs.existsSync(file)));
});

test("a staging run waits for a stream batch before publishing READY", async () => {
  const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), "advertiseiq-report-stage-test-"));
  try {
    const filePath = path.join(folder, "report.json");
    await fs.promises.writeFile(filePath, JSON.stringify(Array.from({ length: 500 }, (_, id) => ({ id }))));
    const transitions = [];
    let batchStarted;
    let failBatch;
    const started = new Promise(resolve => { batchStarted = resolve; });
    const gate = new Promise((_, reject) => { failBatch = reject; });
    const { stageReportFileInRedis } = loadModule("reportFileStager", {
      "stream-chain": { chain: streams => require("stream-chain").chain(Array.from(streams)) },
      "../helper/reportNormalization.helper": {
        normalizeReportRow: row => ({ campaignId: row.id, reportDate: "2026-11-27", metrics: {} }),
      },
      "../helper/reportExtendedEntities.helper": { isExtendedEntity: () => false },
      "./redis.service": { redisClient: { async sAdd() {}, async expire() {} } },
      "./reportStaging.service": {
        getFileChecksum: async () => "checksum",
        saveRunManifest: async (_id, update) => transitions.push(update.status),
        stageBatchInRedis: async (_run, _entity, _index, rows) => {
          assert.equal(rows.length, 500);
          batchStarted();
          await gate;
        },
        RUN_STATUS: { STAGING: "STAGING", READY: "READY", VALIDATION_FAILED: "VALIDATION_FAILED" },
        MANIFEST_KEY_PREFIX: "test:",
      },
      "../../winston/utility/logger": { write_logs() {} },
    });
    const run = stageReportFileInRedis({
      filePath, entity: "campaign", importRunId: "run",
      meta: { reportId: "report", profileId: 123, configId: "config" },
      beforeReady: async () => transitions.push("MONGO_STAGED"),
    });
    const rejection = assert.rejects(run, /redis batch fixture/);
    await Promise.race([started, run]);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(transitions, ["STAGING"]);
    failBatch(new Error("redis batch fixture"));
    await rejection;
    assert.deepEqual(transitions, ["STAGING", "VALIDATION_FAILED"]);
  } finally {
    await fs.promises.rm(folder, { recursive: true, force: true });
  }
});
