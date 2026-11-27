const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const vm = require("node:vm");
const moment = require("moment-timezone");

const source = fs.readFileSync(require.resolve("../../api-server/controllers/fcInventory.controller"), "utf8");
const load = (overrides) => {
  const context = {
    fs, path, readline, moment, exports: {},
    getSPAccessToken: async () => ({ spAccessToken: "fixture-token" }),
    marketPlaceConfigSchema: { findOne: () => ({ lean: async () => ({ endPoint: "https://example.test" }) }) },
    retryWithBackoff: (operation) => operation(), cron_logs() {}, console: { log() {} },
    registerDiscoveredWarehouses: async () => assert.fail("backfill must not update the warehouse directory"),
    ...overrides,
  };
  vm.runInNewContext(source.slice(source.indexOf("exports.runFcLedgerBackfillDay ="),
    source.indexOf("exports.cronGenerateFcStorageFeeReport =")), context);
  return context;
};
const profile = { profileId: 1001, configId: "config", isActive: true, isSpSyncEnabled: true, marketplaceStringId: "market" };
const date = "2020-11-22";
const headers = "Date\tFNSKU\tASIN\tMSKU\tDisposition\tEnding Warehouse Balance\tLocation";
const row = (day, sku) => `${day}\tfsku\tB001234567\t${sku}\tSELLABLE\t15\tDEL1`;

test("warehouse report decoder rejects corrupt archives instead of parsing their compressed bytes as TSV", async t => {
  const zlib = require("node:zlib");
  const start = source.indexOf("async function decompressReportFile(");
  const end = source.indexOf("exports.cronGenerateFcInventoryLedgerReport", start);
  const decode = vm.runInNewContext(source.slice(start, end) + "\ndecompressReportFile", { fs, zlib, Buffer });
  const input = testFile(t, "");
  const output = path.join(path.dirname(input), "unpacked.tsv");
  const tsv = "date\tsku\n2026-11-27\tfixture";
  fs.writeFileSync(input, zlib.gzipSync(tsv).subarray(0, -5));
  await assert.rejects(decode(input, output), /unexpected end of file/i);
  assert.equal(fs.existsSync(output), false);
  fs.writeFileSync(input, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  await assert.rejects(decode(input, output), /Invalid ZIP report directory/);
  assert.equal(fs.existsSync(output), false);
  fs.writeFileSync(input, zlib.gzipSync(tsv));
  await decode(input, output);
  assert.equal(fs.readFileSync(output, "utf8"), tsv);
  const compressed = zlib.deflateRawSync(tsv);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50);
  footer.writeUInt32LE(local.length + compressed.length, 16);
  fs.writeFileSync(input, Buffer.concat([local, compressed, central, footer]));
  await decode(input, output);
  assert.equal(fs.readFileSync(output, "utf8"), tsv);
});
const testFile = (t, contents) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fc-ledger-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "fixture.tsv");
  fs.writeFileSync(file, contents);
  return file;
};

test("backfill requests a single completed day and records it separately from recurring ledger reports", async () => {
  const requests = [], reports = [];
  const fixture = load({
    reportsSchema: {
      findOne: (query) => {
        assert.equal(query.startDate, date);
        assert.equal(query.endDate, date);
        assert.equal(query.reportName, "FC_INVENTORY_LEDGER_BACKFILL");
        return { sort: () => ({ lean: async () => null }) };
      },
      create: async (value) => reports.push(value),
    },
    amazonAxios: async (request) => {
      requests.push(request);
      return { data: { reportId: "test-report" } };
    },
  });
  assert.equal(await fixture.exports.runFcLedgerBackfillDay({ ...profile, isSpSyncEnabled: false }, date), "FAILED");
  assert.equal(await fixture.exports.runFcLedgerBackfillDay(profile, "2020-11-99"), "FAILED");
  assert.equal(requests.length, 0);
  assert.equal(await fixture.exports.runFcLedgerBackfillDay(profile, date), "PENDING");
  assert.equal(requests[0].data.dataStartTime, `${date}T00:00:00Z`);
  assert.equal(requests[0].data.dataEndTime, `${date}T23:59:59Z`);
  assert.equal(reports[0].reportName, "FC_INVENTORY_LEDGER_BACKFILL");
  assert.equal(reports[0].status, "PENDING");
});

test("rejects an out-of-scope date at the end of a report before writing any batches", async t => {
  const rows = Array.from({ length: 501 }, (_, index) => row(date, `sku-${index}`));
  const file = testFile(t, [headers, ...rows, row("2020-11-23", "outside")].join("\n"));
  const fixture = load({ fcInventoryLedgerSchema: { bulkWrite: async () => assert.fail("date preflight should prevent writes") } });
  await assert.rejects(fixture.processFcLedgerFile(file, { ...profile, exactDate: date, defaultDate: date }), { code: "LEDGER_DATE_MISMATCH" });
});

test("exact-day imports use insert-only updates and preserve the existing row timestamps", async t => {
  const file = testFile(t, [headers, row("11/22/2020", "existing")].join("\n"));
  const writes = [];
  const fixture = load({
    fcInventoryLedgerSchema: { bulkWrite: async (operations) => {
      writes.push(...operations);
      return { matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
    } },
  });
  assert.equal(await fixture.processFcLedgerFile(file, { ...profile, exactDate: date, defaultDate: date }), 0);
  assert.equal(writes.length, 1);
  const operation = writes[0].updateOne;
  assert.equal(operation.filter.reportDate, date);
  assert.equal(operation.update.$set, undefined);
  assert.equal(operation.update.$setOnInsert.endingWarehouseBalance, 15);
  assert.equal(operation.timestamps, false);
  assert.equal(operation.upsert, true);
});

test("resumes a pending Amazon report and records actual stored rows for its exact date", async t => {
  const file = testFile(t, [headers, row(date, "sku-a")].join("\n"));
  const scopes = [], updates = [], requests = [];
  const fixture = load({
    __dirname: path.join(path.dirname(file), "api-server", "controllers"),
    ensureDirExists: dir => fs.mkdirSync(dir, { recursive: true }),
    withReportWorkspace: require("../../api-server/helper/reportFile.helper").withReportWorkspace,
    downloadFile: async (_url, dest) => fs.copyFileSync(file, dest),
    decompressReportFile: async (sourcePath, target) => fs.copyFileSync(sourcePath, target),
    amazonAxios: async (request) => {
      requests.push(request);
      return { data: requests.length === 1
        ? { processingStatus: "DONE", reportDocumentId: "document" }
        : { url: "https://example.test/report" } };
    },
    reportsSchema: {
      findOne: () => ({ sort: () => ({ lean: async () => ({ _id: "pending", reportId: "amazon-report", status: "PENDING" }) }) }),
      updateOne: async (...args) => updates.push(args),
      create: async () => assert.fail("pending report should be reused"),
    },
    fcInventoryLedgerSchema: {
      bulkWrite: async () => ({ matchedCount: 1, upsertedCount: 0 }),
      countDocuments: async (scope) => { scopes.push(scope); return 1; },
    },
  });
  assert.equal(await fixture.exports.runFcLedgerBackfillDay(profile, date), "COMPLETED");
  assert.deepEqual(requests.map(request => request.method), ["GET", "GET"]);
  assert.equal(scopes[0].profileId, profile.profileId);
  assert.equal(scopes[0].configId, profile.configId);
  assert.equal(scopes[0].reportDate, date);
  assert.equal(updates[0][1].$set.status, "COMPLETED");
  assert.equal(updates[0][1].$set.verifiedRows, 1);
});

test("recurring ledger polls ignore exact-day backfill reports", async () => {
  const queries = [];
  const fixture = load({ reportsSchema: { findOne(query) {
    queries.push(query);
    return { sort: () => ({ lean: async () => queries.length === 2 ? { status: "COMPLETED" } : null }) };
  } } });
  assert.equal(await fixture.generateFcLedgerReportForDate(profile, date, date, {}, true), "COMPLETED");
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => query.reportName.$ne === "FC_INVENTORY_LEDGER_BACKFILL"));
});
