const assert = require("node:assert/strict");
const path = require("node:path");
const { test, describe } = require("node:test");
const mongoose = require("mongoose");

// In-memory stand-in for the recommendationTag model
const store = [];
const id = () => new mongoose.Types.ObjectId();
const matches = (doc, q) =>
  Object.entries(q).every(([k, v]) => {
    if (v && v.$in) return v.$in.map(String).includes(String(doc[k]));
    return String(doc[k]) === String(v);
  });
const chain = (fn) => ({ select: () => ({ lean: async () => fn() }), lean: async () => fn() });
const model = {
  createIndexes: async () => {},
  find: (q) => chain(() => store.filter((d) => matches(d, q))),
  findOne: (q) => chain(() => store.find((d) => matches(d, q)) || null),
  findOneAndUpdate: (q, upd) => ({
    lean: async () => {
      let doc = store.find((d) => matches(d, q));
      if (!doc) {
        doc = { _id: id(), ...q, ...upd.$setOnInsert };
        store.push(doc);
      }
      return doc;
    },
  }),
};
const resolved = require.resolve(path.join(__dirname, "../api-server/models/recommendationTag.model.js"));
require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: model };

const H = require("../api-server/helpers/recommendationTags.helper");
const CONFIG_A = id();
const CONFIG_B = id();

describe("recommendation tags", () => {
  test("names are trimmed, collapsed and capped; colors are stable per name", () => {
    assert.equal(H.normalizeTagName("  Brand   Defense  "), "Brand Defense");
    assert.equal(H.normalizeTagName("x".repeat(60)).length, H.MAX_TAG_LENGTH);
    assert.equal(H.colorForTag("Brand"), H.colorForTag(" brand "));
    assert.ok(H.TAG_COLORS.includes(H.colorForTag("Anything")));
  });

  test("find-or-create is case-insensitive per account", async () => {
    const a = await H.findOrCreateTag(CONFIG_A, "Brand");
    const b = await H.findOrCreateTag(CONFIG_A, "  brand ");
    const c = await H.findOrCreateTag(CONFIG_B, "Brand");
    assert.equal(String(a._id), String(b._id));
    assert.notEqual(String(a._id), String(c._id));
    await assert.rejects(H.findOrCreateTag(CONFIG_A, "   "), /required/);
  });

  test("tag ids are de-duplicated and limited to the account's own tags", async () => {
    const mine = await H.findOrCreateTag(CONFIG_A, "Launch");
    const other = await H.findOrCreateTag(CONFIG_B, "Launch");
    const ids = await H.sanitizeTagIds(CONFIG_A, [String(mine._id), String(mine._id), String(other._id), "not-an-id"]);
    assert.deepEqual(ids.map(String), [String(mine._id)]);
    assert.deepEqual(await H.sanitizeTagIds(CONFIG_A, "nope"), []);
  });

  test("rules get { _id, name, color } in their own order; unknown ids are skipped", async () => {
    const t1 = await H.findOrCreateTag(CONFIG_A, "Q4");
    const t2 = await H.findOrCreateTag(CONFIG_A, "Brand");
    const [rule, empty] = await H.attachTags([{ ruleName: "R", tagIds: [t1._id, id(), t2._id] }, { ruleName: "S" }]);
    assert.deepEqual(rule.tags.map((t) => t.name), ["Q4", "Brand"]);
    assert.ok(rule.tags[0].color);
    assert.deepEqual(empty.tags, []);
  });

  test("copying a rule to another account maps tags by name", async () => {
    const src = await H.findOrCreateTag(CONFIG_A, "Clearance");
    assert.deepEqual((await H.mapTagIdsToConfig(CONFIG_A, CONFIG_A, [src._id])).map(String), [String(src._id)]);
    const mapped = await H.mapTagIdsToConfig(CONFIG_A, CONFIG_B, [src._id]);
    const target = store.find((d) => String(d._id) === String(mapped[0]));
    assert.equal(target.name, "Clearance");
    assert.equal(String(target.configId), String(CONFIG_B));
  });
});
