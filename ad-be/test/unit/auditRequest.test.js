const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { eventForRoute, events } = require("../../api-server/constants/auditRouteEvents");

function fixture(writeAuditEvent = async () => {}) {
  const file = require.resolve("../../api-server/middleware/auditRequest");
  const context = {
    module: { exports: {} }, Buffer, setTimeout, clearTimeout,
    require(name) {
      if (name.endsWith("/auditHelper")) {
        return { runWithAuditRequest: (req, fn) => fn(), writeAuditEvent };
      }
      if (name.endsWith("/auditRouteEvents")) return { eventForRoute };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context.module.exports;
}

function send(middleware, req, body, statusCode = 200) {
  const res = {
    statusCode,
    end(payload) { return payload; },
    json(payload) { return this.end(JSON.stringify(payload)); },
    send(payload) { return this.json(payload); },
  };
  return middleware(req, res, () => res.send(body));
}

test("registered mutation records partial outcomes and confirmed changes without copying the input body", async () => {
  const logged = [];
  const { auditRequest, drainAuditRequests } = fixture(async entry => logged.push(entry));
  const req = {
    baseUrl: "/api/targeting", route: { path: "/adjustBid" }, method: "POST",
    user: { _id: "actor" }, body: { bid: 5, password: "fixture-only", authorization: "fixture-only" },
    auditChange: { profileId: 101, configId: "config", counts: { succeeded: 1, failed: 1 },
      items: [{ targetId: "T-1", previousBid: 0, newBid: 5 }] },
  };
  assert.equal(send(auditRequest, req, { isSuccess: true }), '{"isSuccess":true}');
  await drainAuditRequests();
  assert.equal(logged.length, 1);
  const entry = logged[0];
  assert.equal(entry.event, "TARGETING_BID_UPDATED");
  assert.equal(entry.outcome, "PARTIAL");
  assert.equal(entry.profileId, 101);
  assert.equal(entry.metadata.items[0].previousBid, 0);
  assert.equal(entry.metadata.requestedChanges.bid, 5);
  assert.equal(JSON.stringify(entry.metadata).includes("fixture-only"), false);
  assert.equal(entry.operationId, req.auditOperationId);
});

test("audit middleware excludes reads, avoids duplicate events, and recognizes application failure responses", async () => {
  const logged = [];
  const { auditRequest, drainAuditRequests } = fixture(async entry => logged.push(entry));
  send(auditRequest, { method: "GET", baseUrl: "/api/products", route: { path: "/history-settings" } }, {});
  send(auditRequest, { method: "POST", baseUrl: "/api/user", route: { path: "/createUser" },
    auditEvents: new Set(["TEAM_USER_CREATED"]) }, { isSuccess: true });
  send(auditRequest, { method: "POST", baseUrl: "/api/user", route: { path: "/inviteUser" } }, { isSuccess: false }, 203);
  send(auditRequest, { method: "POST", baseUrl: "/api/role", route: { path: "/deleteRole" } }, { isSuccess: false }, 403);
  await drainAuditRequests();
  assert.deepEqual(logged.map(entry => entry.outcome), ["FAILURE", "DENIED"]);
  assert.ok(events.includes(eventForRoute("GET", "/api/google/disconnect")));
  assert.equal(eventForRoute("GET", "/api/products/history-settings"), undefined);
});

test("cron route captures cronName as job resourceId", async () => {
  const logged = [];
  const { auditRequest, drainAuditRequests } = fixture(async entry => logged.push(entry));
  const req = {
    baseUrl: "/api/cronJob", route: { path: "/manuallyRunCronJob" }, method: "POST",
    user: { _id: "actor" }, body: { cronName: "Campaign Listing", profileId: "123456" },
  };
  send(auditRequest, req, { isSuccess: true });
  await drainAuditRequests();
  assert.equal(logged.length, 1);
  const entry = logged[0];
  assert.equal(entry.event, "MANUAL_CRON_REQUESTED");
  assert.equal(entry.resourceType, "job");
  assert.equal(entry.resourceId, "Campaign Listing");
  assert.equal(entry.outcome, "PENDING");
});
