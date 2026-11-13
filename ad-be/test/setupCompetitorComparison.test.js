const assert = require("node:assert/strict");
const { test } = require("node:test");

process.argv.push("--apply"); // exercise the write path with fake models
const { moveAllocations, ensureActions } = require("../scripts/setup-competitor-comparison");

const OLD = "oldPage", NEW = "newPage";
const fakeModel = (docs) => ({
  docs,
  find: (q) => ({ lean: async () => docs.filter((d) => d.pages.some((p) => String(p.pageId) === String(q["pages.pageId"]))) }),
  updateOne: async ({ _id }, { $set }) => { Object.assign(docs.find((d) => d._id === _id), $set); },
});

test("plan/role allocations move from the old page to Competitor Comparison, keeping action statuses", async () => {
  const plans = fakeModel([
    { _id: "enterprise", name: "Enterprise", pages: [{ pageId: "productList", allocatedActions: [] }, { pageId: OLD, allocatedActions: [{ actionId: "oldView", status: true }, { actionId: "oldUpdate", status: false }] }] },
    { _id: "both", name: "Has both", pages: [{ pageId: OLD, allocatedActions: [] }, { pageId: NEW, allocatedActions: [{ actionId: "newView", status: true }] }] },
    { _id: "pro", name: "Pro", pages: [{ pageId: "productList", allocatedActions: [] }] },
  ]);
  const moved = await moveAllocations(plans, "plan", OLD, NEW, { oldView: "View Only", oldUpdate: "Update" }, { "View Only": "newView", Update: "newUpdate" });
  assert.equal(moved, 2);

  const ent = plans.docs[0].pages;
  assert.ok(!ent.some((p) => p.pageId === OLD));
  assert.deepEqual(ent.find((p) => p.pageId === NEW).allocatedActions, [{ actionId: "newView", status: true }, { actionId: "newUpdate", status: false }]);

  const both = plans.docs[1].pages;
  assert.deepEqual(both.map((p) => p.pageId), [NEW], "duplicate old entry removed, existing new entry kept");
  assert.deepEqual(both[0].allocatedActions, [{ actionId: "newView", status: true }]);

  assert.deepEqual(plans.docs[2].pages.map((p) => p.pageId), ["productList"], "unrelated plan untouched");
});

test("missing actions are created", async () => {
  const created = [];
  const PageAction = {
    findOne: (q) => ({ lean: async () => (q.actionType === "View Only" ? { _id: "existingView" } : null) }),
    create: async (doc) => { created.push(doc.actionType); return { toObject: () => ({ _id: "newUpdate" }) }; },
  };
  const ids = await ensureActions(PageAction, NEW);
  assert.deepEqual(created, ["Update"]);
  assert.deepEqual(ids, { "View Only": "existingView", Update: "newUpdate" });
});
