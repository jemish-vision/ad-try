const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const mongoose = require("mongoose");

const root = path.join(__dirname, "..");
const stub = (rel, exp) => {
  const r = require.resolve(path.join(root, rel));
  require.cache[r] = { id: r, filename: r, loaded: true, exports: exp };
};
const CONFIG = new mongoose.Types.ObjectId();
const tagA = { _id: new mongoose.Types.ObjectId(), configId: CONFIG, name: "Brand", nameKey: "brand" };
const tagB = { _id: new mongoose.Types.ObjectId(), configId: CONFIG, name: "Launch", nameKey: "launch" };
let tags = [tagA, tagB];
const pulls = [];
const lean = (v) => ({ lean: async () => v, select: () => ({ lean: async () => v }) });
stub("api-server/models/recommendationTag.model.js", {
  findOne: (q) => lean(tags.find((t) => t.nameKey === q.nameKey && String(t._id) !== String(q._id.$ne)) || null),
  findOneAndUpdate: (q, u) => {
    const t = tags.find((x) => String(x._id) === String(q._id));
    if (t) Object.assign(t, u.$set);
    return lean(t || null);
  },
  findOneAndDelete: (q) => {
    const t = tags.find((x) => String(x._id) === String(q._id));
    tags = tags.filter((x) => x !== t);
    return lean(t || null);
  },
});
stub("api-server/models/recomandationRules.model.js", { updateMany: async (q, u) => (pulls.push([q, u]), { modifiedCount: 3 }) });
stub("winston/recommendation/logger.js", { recommendation_logs: () => {} });

const { renameTag, deleteTag } = require("../api-server/controllers/recommendationTag.controller");
const call = async (fn, body) => {
  let out;
  await fn({ config: { configId: CONFIG }, body }, { status: () => ({ send: (b) => (out = b) }) });
  return out;
};

test("rename: trims the name, refuses a name another tag already has", async () => {
  const ok = await call(renameTag, { tagId: String(tagA._id), name: "  Brand   Defense " });
  assert.equal(ok.isSuccess, true);
  assert.equal(tagA.name, "Brand Defense");
  assert.equal(tagA.nameKey, "brand defense");
  const clash = await call(renameTag, { tagId: String(tagA._id), name: "launch" });
  assert.equal(clash.isSuccess, false);
  assert.match(clash.message, /already exists/);
  assert.equal((await call(renameTag, { tagId: String(tagA._id), name: " " })).isSuccess, false);
});

test("delete: removes the tag and pulls it from the account's configurations", async () => {
  const res = await call(deleteTag, { tagId: String(tagB._id) });
  assert.equal(res.isSuccess, true);
  assert.equal(res.data.removedFromRules, 3);
  assert.ok(!tags.includes(tagB));
  assert.equal(String(pulls[0][0].configId), String(CONFIG));
  assert.equal(String(pulls[0][1].$pull.tagIds), String(tagB._id));
  assert.equal((await call(deleteTag, { tagId: "bad" })).isSuccess, false);
});
