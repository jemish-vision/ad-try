const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { Types: { ObjectId } } = require("mongoose");
const model = require("../../api-server/models/amsSubscription.model");
const { ROLES } = require("../../api-server/constants/roles");

const read = name => fs.readFileSync(require.resolve(`../../api-server/${name}`), "utf8");
const configId = "111111111111111111111111";
const otherConfig = "222222222222222222222222";
const profileId = 12345;
const arn = "arn:aws:sqs:eu-west-1:123456789012:ams-destination";
const euUrl = "https://advertising-api-eu.amazon.com";
const naUrl = "https://advertising-api.amazon.com";
const feUrl = "https://advertising-api-fe.amazon.com";
const adsConfig = { adsClientId: "test-client", adsAccessToken: "test-token" };

function loadExport(source, name, deps) {
  const start = source.indexOf(`exports.${name} =`);
  const end = source.indexOf("\nexports.", start + 1);
  assert.ok(start >= 0);
  const context = { exports: {}, ...deps };
  vm.runInNewContext(source.slice(start, end < 0 ? undefined : end), context);
  return context.exports[name];
}

function makeDestination(env = {}) {
  const source = read("helper/amsArn").replaceAll("export const ", "const ");
  return vm.runInNewContext(`${source}\ngetAmsDestination`, { process: { env: {
    ROOT_LINK: naUrl, EU_ROOT_LINK: euUrl, FE_ROOT_LINK: feUrl, EU_SQS_ARN: ` ${arn} `, ...env,
  } } });
}

function harness({ url = euUrl, env, allowed = true, existing = [], amazonError, saveError, credentials = adsConfig } = {}) {
  const requests = [];
  const tokenLookups = [];
  const rows = existing.map((row, index) => ({ _id: `seed-${index}`, configId, profileId, ...row }));
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) =>
    value === null ? row[key] == null : row[key] === value
  );
  const service = { exports: {}, require(name) {
    if (name.includes("logger")) return { write_logs() {} };
    if (name.includes("retryHelper")) return { retryWithBackoff: fn => fn() };
    assert.equal(name, "../helper/amazonAxios");
    return async request => {
      requests.push(request);
      const error = amazonError?.(request);
      if (error) throw error;
      return { status: 200, data: { subscriptionId: `amazon-${request.data.clientRequestToken}` } };
    };
  } };
  vm.runInNewContext(read("services/amazonAms.service"), service);
  const manage = loadExport(read("controllers/config.controller"), "manageSubscribeAMS", {
    ObjectId, ROLES, crypto, getAmsDestination: makeDestination(env), ...service.exports,
    write_logs() {}, logAudit: async () => {},
    profileBasedPermissionSchema: { exists: async filter => allowed && matches({
      configId, profileId, userId: "user", hasAccess: true,
    }, filter) },
    profileSchema: { findOne: filter => ({ lean: async () =>
      matches({ configId, profileId }, filter) ? { configId, profileId, amazonUrl: url } : null,
    }) },
    getAccessToken: async id => {
      tokenLookups.push(id);
      return credentials;
    },
    amsSubscriptionSchema: {
      schema: model.schema,
      find: filter => ({ lean: async () => rows.filter(row => matches(row, filter)).map(row => ({ ...row })) }),
      updateOne: async (filter, { $set }, options) => {
        if (saveError?.(filter)) throw new Error("Storage unavailable");
        let row = rows.find(item => matches(item, filter));
        if (!row && options?.upsert) {
          assert.ok(!rows.some(item => item.configId === filter.configId &&
            item.profileId === filter.profileId && item.dataset === filter.dataset), "would violate Mongo unique index");
          row = { _id: `new-${rows.length}`, ...filter };
          rows.push(row);
        }
        if (row) Object.assign(row, $set);
        return { matchedCount: Number(Boolean(row)) };
      },
    },
  });
  return { requests, tokenLookups, rows, async submit(datasets, scope = {}) {
    const res = { status(code) { this.code = code; return this; }, json(body) {
      this.body = JSON.parse(JSON.stringify(body));
      return this;
    } };
    await manage({ user: { id: "user" }, body: { configId, profileId, datasets, ...scope } }, res);
    return res;
  } };
}

test("the exact empty destination failure returns a regional configuration error before any Amazon call", async () => {
  for (const [url, key, value] of [[naUrl, "NA_SQS_ARN", ""], [feUrl, "FE_SQS_ARN", " "], [euUrl, "EU_SQS_ARN", "invalid"]]) {
    const h = harness({ url, env: { [key]: value } });
    const res = await h.submit(["budget-usage"]);
    assert.equal(res.code, 203);
    assert.match(res.body.message, new RegExp(key));
    assert.deepEqual(res.body.result.failed, [{ dataset: "budget-usage", action: "SUBSCRIBE", reason: res.body.message }]);
    assert.equal(h.requests.length, 0);
    assert.equal(h.tokenLookups.length, 0);
    assert.equal(h.rows.length, 0);
  }
});

test("destination selection uses each Ads region's configured SQS queue", () => {
  const naArn = "arn:aws:sqs:us-east-1:123456789012:na-queue";
  const feArn = "arn:aws:sqs:us-west-2:123456789012:fe-queue";
  const destination = makeDestination({ NA_SQS_ARN: naArn, FE_SQS_ARN: feArn });
  assert.equal(destination(naUrl).sqsArn, naArn);
  assert.equal(destination(euUrl).sqsArn, arn);
  assert.equal(destination(feUrl).sqsArn, feArn);
  assert.throws(() => destination("https://unknown.example"), /not configured/);
});

test("create, unchanged save, selection update, archive, and re-subscribe preserve a single record per dataset", async () => {
  const h = harness({ existing: [{ configId: otherConfig, dataset: "budget-usage", status: "ACTIVE" }] });
  assert.deepEqual((await h.submit(["budget-usage", "budget-usage"])).body.result.subscribed, ["budget-usage"]);
  const first = h.requests[0];
  assert.equal(first.method, "POST");
  assert.equal(first.url, `${euUrl}/streams/subscriptions`);
  assert.equal(first.data.destinationArn, arn);
  assert.equal(first.data.dataSetId, "budget-usage");
  assert.equal(first.headers["Amazon-Advertising-API-Scope"], profileId);
  assert.equal(h.rows[1].status, "ACTIVE");
  const rowId = h.rows[1]._id;
  assert.deepEqual((await h.submit(["budget-usage"])).body.result, { subscribed: [], archived: [], failed: [] });
  assert.equal(h.requests.length, 1);
  assert.equal(h.tokenLookups.length, 1);
  assert.deepEqual((await h.submit(["sp-traffic"])).body.result, { subscribed: ["sp-traffic"], archived: ["budget-usage"], failed: [] });
  assert.equal(h.requests[2].method, "PUT");
  assert.equal(h.requests[2].url, `${euUrl}/streams/subscriptions/amazon-${first.data.clientRequestToken}`);
  assert.equal(h.requests[2].data.status, "ARCHIVED");
  assert.equal(h.rows[1].status, "ARCHIVED");
  assert.deepEqual((await h.submit(["budget-usage", "sp-traffic"])).body.result.subscribed, ["budget-usage"]);
  assert.equal(h.rows[1]._id, rowId);
  assert.equal(h.rows[1].status, "ACTIVE");
  assert.notEqual(h.requests[3].data.clientRequestToken, first.data.clientRequestToken);
  assert.deepEqual((await h.submit([])).body.result.archived, ["budget-usage", "sp-traffic"]);
  assert.equal(h.rows[0].status, "ACTIVE");
  assert.equal(h.rows.length, 3);
});

test("invalid input, wrong config/profile scope, and denied access have no side effects", async () => {
  const h = harness();
  assert.match((await h.submit(["bad-dataset"])).body.message, /supported/);
  assert.match((await h.submit(undefined)).body.message, /array/);
  assert.match((await h.submit([], { profileId: "abc" })).body.message, /valid/);
  assert.match((await h.submit([], { configId: undefined })).body.message, /valid/);
  assert.match((await h.submit([], { configId: otherConfig })).body.message, /permission/);
  assert.match((await h.submit([], { profileId: profileId + 1 })).body.message, /permission/);
  assert.equal(h.requests.length, 0);
  assert.equal(h.tokenLookups.length, 0);
});

test("archive still works with no queue configured; an Amazon 404 clears the stale local selection", async () => {
  const h = harness({
    url: naUrl,
    existing: [{ dataset: "sp-traffic", status: "ACTIVE", subscriptionId: "removed-in-amazon" }],
    amazonError: () => Object.assign(new Error("Not found"), { response: { status: 404 } }),
  });
  const res = await h.submit(["budget-usage"]);
  assert.equal(res.body.partialSuccess, true);
  assert.deepEqual(res.body.result.archived, ["sp-traffic"]);
  assert.equal(res.body.result.failed[0].action, "SUBSCRIBE");
  assert.deepEqual(h.requests.map(request => request.method), ["PUT"]);
  assert.equal(h.rows[0].status, "ARCHIVED");
});

test("failed archive keeps the dataset active and other successful actions are saved", async () => {
  const h = harness({
    existing: [{ dataset: "sp-traffic", status: "ACTIVE", subscriptionId: "existing" }],
    amazonError: request => request.method === "PUT" &&
      Object.assign(new Error("Forbidden"), { response: { status: 403, data: { message: "Forbidden" } } }),
  });
  const res = await h.submit(["budget-usage"]);
  assert.equal(res.body.partialSuccess, true);
  assert.deepEqual(res.body.result.subscribed, ["budget-usage"]);
  assert.deepEqual(res.body.result.failed, [{ dataset: "sp-traffic", action: "ARCHIVE", reason: "Forbidden" }]);
  assert.equal(h.rows[0].status, "ACTIVE");
  assert.equal(h.rows[1].status, "ACTIVE");
});

test("retrying after a failed database write reuses the same Amazon create token", async () => {
  let failed = false;
  const h = harness({ saveError: () => !failed && (failed = true) });
  const res = await h.submit(["budget-usage"]);
  assert.equal(res.body.isSuccess, false);
  assert.equal(res.body.result.failed[0].reason, "Storage unavailable");
  assert.equal((await h.submit(["budget-usage"])).body.isSuccess, true);
  assert.equal(h.requests[0].data.clientRequestToken, h.requests[1].data.clientRequestToken);
  assert.equal(h.rows.length, 1);
});

test("listing filters subscriptions to active datasets for the same configuration and profile", async () => {
  const source = read("controllers/customer.controller");
  const rows = [
    { configId, profileId, dataset: "budget-usage", status: "ACTIVE" },
    { configId, profileId, dataset: "sp-traffic", status: "ARCHIVED" },
    { configId: otherConfig, profileId, dataset: "sb-traffic", status: "ACTIVE" },
    { configId, profileId: profileId + 1, dataset: "sd-traffic", status: "ACTIVE" },
  ];
  const aggregate = async pipeline => {
    const scope = pipeline.find(stage => stage.$lookup?.from === "amssubscriptions").$lookup;
    const input = { configId, profileId, profiles: { configId } };
    const evaluate = (value, row, variables) => {
      if (typeof value === "string" && value.startsWith("$$")) return variables[value.slice(2)];
      if (typeof value === "string" && value.startsWith("$")) {
        return value.slice(1).split(".").reduce((entry, key) => entry?.[key], row);
      }
      if (value?.$ifNull) return evaluate(value.$ifNull[0], row, variables) ?? evaluate(value.$ifNull[1], row, variables);
      return value;
    };
    const vars = Object.fromEntries(Object.entries(scope.let).map(([key, value]) => [key, evaluate(value, input)]));
    const filter = scope.pipeline[0].$match;
    return [{ amsSubscription: rows.filter(row => row.status === filter.status &&
      filter.$expr.$and.every(({ $eq: [left, right] }) => evaluate(left, row, vars) === evaluate(right, row, vars))
    ).map(({ dataset }) => ({ dataset })) }];
  };
  const list = loadExport(source, "getAllSellerConfigs", {
    ROLES, mongoose: { Types: { ObjectId } }, sellerConnectionLookup() {},
    profileSchema: { aggregate }, profileBasedPermissionSchema: { aggregate }, write_logs() {},
  });
  for (const roleName of [ROLES.SUPER_ADMIN, ROLES.ADMIN]) {
    const res = { status(code) { this.code = code; return this; }, send(body) { this.body = body; } };
    await list({ user: { _id: "user" }, role: { roleName }, body: {} }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.data[0].amsSubscription, [{ dataset: "budget-usage" }]);
  }
});
