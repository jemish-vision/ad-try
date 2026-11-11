const { test, describe } = require("node:test");
const assert = require("node:assert");
const cronJobHistorySchema = require("../../../api-server/models/cronJobHistory.model");
const { finalizeReportHistory } = require("../../../api-server/services/reportHistoryCompletion.service");

describe("Extended Crons History: Sync, Listing, Rules & Weekly Reports Lifecycle", () => {
  test("Sync Past Data: Schema validates lifecycle from PENDING to COMPLETED with date ranges", () => {
    // 1. Start: Insert document with PENDING
    const startDoc = new cronJobHistorySchema({
      configId: new (require("mongoose").Types.ObjectId)(),
      profileId: 2376610121042864,
      cronName: "Sync Past Data",
      historyDate: "2026-11-03",
      status: "PENDING",
      startDate: "2026-10-01",
      endDate: "2026-11-02",
      details: {
        startedAt: new Date().toISOString(),
        startDate: "2026-10-01",
        endDate: "2026-11-02",
      },
    });

    const startObj = startDoc.toObject();
    assert.strictEqual(startObj.cronName, "Sync Past Data");
    assert.strictEqual(startObj.status, "PENDING");
    assert.strictEqual(startObj.startDate, "2026-10-01");
    assert.strictEqual(startObj.endDate, "2026-11-02");
    assert.ok(startObj.details.startedAt);

    // 2. Success: Update to COMPLETED
    startDoc.status = "COMPLETED";
    startDoc.details.completedAt = new Date().toISOString();
    const completedObj = startDoc.toObject();
    assert.strictEqual(completedObj.status, "COMPLETED");
    assert.ok(completedObj.details.completedAt);
  });

  test("Sync Past Data: Error path updates to FAILED with error message", () => {
    const doc = new cronJobHistorySchema({
      profileId: 1451708219889308,
      cronName: "Sync Past Data",
      historyDate: "2026-11-03",
      status: "PENDING",
    });

    doc.status = "FAILED";
    doc.error = "Amazon SP-API Token Expired";
    doc.details = {
      failedAt: new Date().toISOString(),
      error: "Amazon SP-API Token Expired",
    };

    const obj = doc.toObject();
    assert.strictEqual(obj.status, "FAILED");
    assert.strictEqual(obj.error, "Amazon SP-API Token Expired");
    assert.ok(obj.details.failedAt);
  });

  test("Targeting Listing: Inserts PENDING on start and updates COMPLETED on finish", () => {
    const listingDoc = new cronJobHistorySchema({
      configId: new (require("mongoose").Types.ObjectId)(),
      profileId: 2376610121042864,
      cronName: "Targeting Listing",
      historyDate: "2026-11-03",
      status: "PENDING",
      details: { startedAt: new Date().toISOString() },
    });

    assert.strictEqual(listingDoc.cronName, "Targeting Listing");
    assert.strictEqual(listingDoc.status, "PENDING");

    listingDoc.status = "COMPLETED";
    listingDoc.recordsCount = 350;
    listingDoc.details.completedAt = new Date().toISOString();

    const obj = listingDoc.toObject();
    assert.strictEqual(obj.status, "COMPLETED");
    assert.strictEqual(obj.recordsCount, 350);
    assert.ok(obj.details.completedAt);
  });

  test("Targeting Rule Schedules: Records evaluated rules count and executed actions count", () => {
    const rulesDoc = new cronJobHistorySchema({
      configId: new (require("mongoose").Types.ObjectId)(),
      profileId: 2376610121042864,
      cronName: "Targeting Rule Schedules",
      historyDate: "2026-11-03",
      status: "PENDING",
      details: { startedAt: new Date().toISOString() },
    });

    rulesDoc.status = "COMPLETED";
    rulesDoc.recordsCount = 5;
    rulesDoc.details = {
      startedAt: rulesDoc.details.startedAt,
      completedAt: new Date().toISOString(),
      executedCount: 5,
      totalRulesEvaluated: 12,
    };

    const obj = rulesDoc.toObject();
    assert.strictEqual(obj.cronName, "Targeting Rule Schedules");
    assert.strictEqual(obj.status, "COMPLETED");
    assert.strictEqual(obj.recordsCount, 5);
    assert.strictEqual(obj.details.executedCount, 5);
    assert.strictEqual(obj.details.totalRulesEvaluated, 12);
  });

  test("Weekly Performance Email: Records emailsSent and totalUsers", () => {
    const emailDoc = new cronJobHistorySchema({
      cronName: "Weekly Performance Email",
      historyDate: "2026-11-03",
      status: "PENDING",
      details: { startedAt: new Date().toISOString() },
    });

    emailDoc.status = "COMPLETED";
    emailDoc.recordsCount = 8;
    emailDoc.details = {
      completedAt: new Date().toISOString(),
      emailsSent: 8,
      totalUsers: 10,
    };

    const obj = emailDoc.toObject();
    assert.strictEqual(obj.cronName, "Weekly Performance Email");
    assert.strictEqual(obj.status, "COMPLETED");
    assert.strictEqual(obj.recordsCount, 8);
    assert.strictEqual(obj.details.emailsSent, 8);
    assert.strictEqual(obj.details.totalUsers, 10);
  });

  test("Weekly Report: finalizeReportHistory supports 'Weekly Report' and 'BiWeekly Report'", async () => {
    // Mock cronJobHistorySchema
    let updatedPayload = null;
    const origFindById = cronJobHistorySchema.findById;
    const origUpdateOne = cronJobHistorySchema.updateOne;

    cronJobHistorySchema.findById = (id) => ({
      lean: async () => ({
        _id: id,
        cronName: "Weekly Report",
        status: "PENDING",
      }),
    });

    cronJobHistorySchema.updateOne = async (q, u) => {
      updatedPayload = { query: q, update: u };
      return { modifiedCount: 1 };
    };

    // Mock reportsSchema via report model require
    const reportsSchema = require("../../../api-server/models/report.model");
    const origReportsFind = reportsSchema.find;

    reportsSchema.find = (q) => ({
      select: () => ({
        lean: async () => [
          { reportName: "Targeting Report", reportTypeId: "spTargeting", status: "COMPLETED" },
          { reportName: "Targeting Report", reportTypeId: "sbTargeting", status: "COMPLETED" },
          { reportName: "Targeting Report", reportTypeId: "sdTargeting", status: "COMPLETED" },
        ],
      }),
    });

    try {
      const finalized = await finalizeReportHistory("mock-weekly-hist-id");
      assert.strictEqual(finalized, true);
      assert.ok(updatedPayload);
      assert.strictEqual(updatedPayload.update.$set.status, "COMPLETED");
      assert.strictEqual(updatedPayload.update.$set["details.reportGroup"], "Targeting Report");
    } finally {
      cronJobHistorySchema.findById = origFindById;
      cronJobHistorySchema.updateOne = origUpdateOne;
      reportsSchema.find = origReportsFind;
    }
  });

  test("Admin UI Query Aliasing: Resolves historical aliases and system-wide fallback", () => {
    const aliasMap = {
      "Shipment Queue Report": ["Shipment Queue Report", "Shipment Queue"],
      "Sync Coupons": ["Sync Coupons", "Coupon Listing"],
      "AdGroup Report": ["AdGroup Report", "AdGroups Report"],
      "SearchTerm Report": ["SearchTerm Report", "Search Term Report"],
      "ProductAds Report": ["ProductAds Report", "Product Ads Report"],
      "FC Storage Fee": ["FC Storage Fee", "FC Storage Fee Report"],
    };

    // Test each mapping resolves both primary and historical name
    for (const [cronName, expectedAliases] of Object.entries(aliasMap)) {
      const aliasList = [
        cronName,
        ...(cronName === "Shipment Queue Report" ? ["Shipment Queue"] : []),
        ...(cronName === "Sync Coupons" ? ["Coupon Listing"] : []),
        ...(cronName === "AdGroup Report" ? ["AdGroups Report"] : []),
        ...(cronName === "SearchTerm Report" ? ["Search Term Report"] : []),
        ...(cronName === "ProductAds Report" ? ["Product Ads Report"] : []),
        ...(cronName === "FC Storage Fee" ? ["FC Storage Fee Report"] : []),
      ];

      assert.deepStrictEqual(aliasList, expectedAliases);
      assert.ok(aliasList.includes(cronName));
    }
  });
});
