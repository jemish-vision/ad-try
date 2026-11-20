const assert = require("node:assert/strict");
const path = require("node:path");
const { test, describe, beforeEach } = require("node:test");
const mongoose = require("mongoose");

/* ── in-memory stand-ins for the tag, rule and config models ─────────────────── */
const oid = () => new mongoose.Types.ObjectId();
const S = String;
let tags = [];
let rules = [];
let configs = [];
const valueMatches = (actual, cond) => {
  if (cond && typeof cond === "object" && !(cond instanceof mongoose.Types.ObjectId)) {
    if ("$in" in cond) return cond.$in.map(S).some((v) => (Array.isArray(actual) ? actual.map(S).includes(v) : S(actual) === v));
    if ("$ne" in cond) return S(actual) !== S(cond.$ne);
  }
  if (cond === null) return actual == null;
  return Array.isArray(actual) ? actual.map(S).includes(S(cond)) : S(actual) === S(cond);
};
const matches = (doc, q = {}) =>
  Object.entries(q).every(([k, v]) => (k === "$or" ? v.some((sub) => matches(doc, sub)) : valueMatches(doc[k], v)));
const q = (fn) => {
  const api = { sort: () => api, select: () => api, lean: async () => fn() };
  return api;
};
const tagModel = {
  collection: { dropIndex: async () => {} },
  createIndexes: async () => {},
  find: (f) => q(() => tags.filter((d) => matches(d, f))),
  findOne: (f) => q(() => tags.find((d) => matches(d, f)) || null),
  exists: async (f) => tags.some((d) => matches(d, f)),
  create: async (doc) => { const d = { _id: oid(), ...doc }; tags.push(d); return { toObject: () => d }; },
  findOneAndUpdate: (f, u) => q(() => {
    let d = tags.find((x) => matches(x, f));
    if (!d && u.$setOnInsert) { d = { _id: oid(), ...f, ...u.$setOnInsert }; tags.push(d); }
    else if (d && u.$set) Object.assign(d, u.$set);
    return d || null;
  }),
  findOneAndDelete: (f) => q(() => { const d = tags.find((x) => matches(x, f)); tags = tags.filter((x) => x !== d); return d || null; }),
  updateOne: async (f, u) => { const d = tags.find((x) => matches(x, f)); if (d) Object.assign(d, u.$set); },
  deleteOne: async (f) => { tags = tags.filter((x) => !matches(x, f)); },
};
const ruleModel = {
  updateMany: async (f, u) => {
    let n = 0;
    for (const r of rules.filter((x) => matches(x, f))) {
      if (u.$addToSet) { const v = u.$addToSet.tagIds; if (!r.tagIds.map(S).includes(S(v))) r.tagIds.push(v); }
      if (u.$pull) r.tagIds = r.tagIds.filter((t) => S(t) !== S(u.$pull.tagIds));
      n += 1;
    }
    return { modifiedCount: n };
  },
  aggregate: async () => [],
};
const configModel = {
  find: (f) => q(() => configs.filter((c) => matches(c, f))),
  findById: (id) => q(() => configs.find((c) => S(c._id) === S(id)) || null),
};
const root = path.join(__dirname, "..");
const stub = (rel, exp) => { const r = require.resolve(path.join(root, rel)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp }; };
stub("api-server/models/recommendationTag.model.js", tagModel);
stub("api-server/models/recomandationRules.model.js", ruleModel);
stub("api-server/models/config.model.js", configModel);
stub("winston/recommendation/logger.js", { recommendation_logs: () => {} });

const H = require("../api-server/helpers/recommendationTags.helper");
const C = require("../api-server/controllers/recommendationTag.controller");

const ORG1 = oid(), ORG2 = oid();
const CFG_A = oid(), CFG_B = oid(), CFG_X = oid(); // A, B → ORG1 ; X → ORG2
beforeEach(() => {
  tags = []; rules = [];
  configs = [{ _id: CFG_A, organizationId: ORG1 }, { _id: CFG_B, organizationId: ORG1 }, { _id: CFG_X, organizationId: ORG2 }];
  H._resetCachesForTests();
});
const call = async (fn, configId, body) => {
  let out;
  await fn({ config: { configId }, body, user: { _id: oid() } }, { status: () => ({ send: (b) => (out = b) }) });
  return out;
};

describe("organization-wide recommendation tags", () => {
  test("names are normalized; colors are stable per name", () => {
    assert.equal(H.normalizeTagName("  Brand   Defense  "), "Brand Defense");
    assert.equal(H.normalizeTagName("x".repeat(60)).length, H.MAX_TAG_LENGTH);
    assert.equal(H.colorForTag("Brand"), H.colorForTag(" brand "));
  });

  test("the organization comes from the Amazon account; tags are shared by its accounts", async () => {
    assert.equal(S(await H.resolveOrganizationId({ configId: CFG_A })), S(ORG1));
    assert.equal(S(await H.resolveOrganizationId({ configId: oid(), organizationId: ORG2 })), S(ORG2));
    const created = await call(C.createTag, CFG_A, { name: "Brand" });
    assert.equal(created.isSuccess, true);
    const fromB = await call(C.getTags, CFG_B, {});
    assert.deepEqual(fromB.data.map((t) => t.name), ["Brand"]); // other account, same organization
    const fromX = await call(C.getTags, CFG_X, {});
    assert.deepEqual(fromX.data, []); // other organization
  });

  test("tag names are unique within an organization (case-insensitive), not across organizations", async () => {
    assert.equal((await call(C.createTag, CFG_A, { name: "Q4 Sale" })).isSuccess, true);
    const dup = await call(C.createTag, CFG_B, { name: "  q4   sale " });
    assert.equal(dup.isSuccess, false);
    assert.match(dup.message, /already exists/);
    assert.equal((await call(C.createTag, CFG_X, { name: "Q4 Sale" })).isSuccess, true);
    assert.equal((await call(C.createTag, CFG_A, { name: "   " })).isSuccess, false);
  });

  test("configurations can only use existing tags of their organization", async () => {
    const mine = (await call(C.createTag, CFG_A, { name: "Launch" })).data;
    const other = (await call(C.createTag, CFG_X, { name: "Launch" })).data;
    const ids = await H.sanitizeTagIds(ORG1, [S(mine._id), S(mine._id), S(other._id), S(oid()), "bad"]);
    assert.deepEqual(ids.map(S), [S(mine._id)]);
    assert.deepEqual(await H.sanitizeTagIds(null, [S(mine._id)]), []);
  });

  test("rename shows everywhere; a taken name is refused", async () => {
    const a = (await call(C.createTag, CFG_A, { name: "Brand" })).data;
    await call(C.createTag, CFG_A, { name: "Launch" });
    rules = [{ _id: oid(), configId: CFG_B, tagIds: [a._id] }];
    const ok = await call(C.renameTag, CFG_B, { tagId: S(a._id), name: "Brand Defense" });
    assert.equal(ok.isSuccess, true);
    const [withTags] = await H.attachTags(rules);
    assert.equal(withTags.tags[0].name, "Brand Defense");
    assert.equal((await call(C.renameTag, CFG_A, { tagId: S(a._id), name: "LAUNCH" })).isSuccess, false);
    assert.equal((await call(C.renameTag, CFG_X, { tagId: S(a._id), name: "Other org" })).isSuccess, false); // not its tag
  });

  test("delete removes the tag from configurations of every account in the organization", async () => {
    const a = (await call(C.createTag, CFG_A, { name: "Clearance" })).data;
    rules = [{ _id: oid(), configId: CFG_A, tagIds: [a._id] }, { _id: oid(), configId: CFG_B, tagIds: [a._id, oid()] }];
    const res = await call(C.deleteTag, CFG_B, { tagId: S(a._id) });
    assert.equal(res.isSuccess, true);
    assert.equal(res.data.removedFromRules, 2);
    assert.ok(rules.every((r) => !r.tagIds.map(S).includes(S(a._id))));
  });

  test("account-level tags from before are moved to the organization; duplicates are merged", async () => {
    const legacyA = { _id: oid(), configId: CFG_A, organizationId: null, name: "Brand", nameKey: "brand", createdAt: 1 };
    const legacyB = { _id: oid(), configId: CFG_B, name: "brand", nameKey: "brand", createdAt: 2 };
    const legacyB2 = { _id: oid(), configId: CFG_B, name: "Launch", nameKey: "launch", createdAt: 3 };
    tags = [legacyA, legacyB, legacyB2];
    rules = [{ _id: oid(), configId: CFG_B, tagIds: [legacyB._id, legacyB2._id] }];
    const res = await call(C.getTags, CFG_A, {});
    assert.deepEqual(res.data.map((t) => t.name).sort(), ["Brand", "Launch"]);
    assert.ok(tags.every((t) => S(t.organizationId) === S(ORG1)));
    assert.deepEqual(rules[0].tagIds.map(S).sort(), [S(legacyA._id), S(legacyB2._id)].sort()); // re-pointed to the kept "Brand"
  });

  test("copying a rule: same organization keeps tag ids, another organization maps by name", async () => {
    const src = (await call(C.createTag, CFG_A, { name: "Seasonal" })).data;
    assert.deepEqual((await H.mapTagIdsToConfig(CFG_A, CFG_B, [src._id])).map(S), [S(src._id)]);
    const mapped = await H.mapTagIdsToConfig(CFG_A, CFG_X, [src._id]);
    const target = tags.find((t) => S(t._id) === S(mapped[0]));
    assert.equal(target.name, "Seasonal");
    assert.equal(S(target.organizationId), S(ORG2));
  });
});
