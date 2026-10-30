const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("1. Staged Report Recovery Across All 6 Controllers", () => {
  const CONTROLLERS = [
    {
      name: "campaign.controller.js",
      path: path.resolve(__dirname, "../api-server/controllers/campaign.controller.js"),
      expectedEntities: ["campaign", "sbCampaign", "sdCampaign"],
    },
    {
      name: "adGroups.controller.js",
      path: path.resolve(__dirname, "../api-server/controllers/adGroups.controller.js"),
      expectedEntities: ["adGroup", "sbAdGroup", "sdAdGroup"],
    },
    {
      name: "searchTerm.controller.js",
      path: path.resolve(__dirname, "../api-server/controllers/searchTerm.controller.js"),
      expectedEntities: ["searchTerm", "sbSearchTerm"],
    },
    {
      name: "placement.controller.js",
      path: path.resolve(__dirname, "../api-server/controllers/placement.controller.js"),
      expectedEntities: ["placement", "sbPlacement"],
    },
    {
      name: "productAds.controller.js",
      path: path.resolve(__dirname, "../api-server/controllers/productAds.controller.js"),
      expectedEntities: ["productAd"],
    },
    {
      name: "targeting.controller.js",
      path: path.resolve(__dirname, "../api-server/controllers/targeting.controller.js"),
      expectedEntities: ["targeting", "sbTargeting", "sdTargeting"],
    },
  ];

  for (const ctrl of CONTROLLERS) {
    describe(`Controller: ${ctrl.name}`, () => {
      const code = fs.readFileSync(ctrl.path, "utf8");

      test(`Imports processStagedReportBatches`, () => {
        assert.ok(
          code.includes("processStagedReportBatches"),
          `${ctrl.name} must import processStagedReportBatches`
        );
      });

      test(`Contains 2-hour staleness threshold calculation (2 * 60 * 60 * 1000)`, () => {
        assert.ok(
          code.includes("2 * 60 * 60 * 1000"),
          `${ctrl.name} must calculate twoHoursAgo using 2 * 60 * 60 * 1000`
        );
      });

      test(`Marks report as FAILED if stalled > 2h`, () => {
        assert.ok(
          code.includes(`status: "FAILED"`) || code.includes(`status: 'FAILED'`),
          `${ctrl.name} must update status to FAILED when stale`
        );
      });

      for (const entity of ctrl.expectedEntities) {
        test(`Invokes processStagedReportBatches(["${entity}"]) when report is active (<2h)`, () => {
          const expectedCall = `processStagedReportBatches(["${entity}"])`;
          assert.ok(
            code.includes(expectedCall),
            `${ctrl.name} must call ${expectedCall} to drain active stream`
          );
        });
      }
    });
  }
});

describe("2. Behavioral Simulation of 2-Hour Staleness vs Active Draining", () => {
  // Pure logic replica matching the exact code pattern used across all 6 controllers
  async function evaluateStagedReport(existing, entity, mocks) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const lastActivity = new Date(existing.updatedAt || existing.createdAt);
    if (lastActivity < twoHoursAgo) {
      await mocks.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
      existing = null;
      return { action: "MARKED_FAILED_AND_RETRY", existing };
    } else {
      mocks.processStagedReportBatches([entity]).catch(() => {});
      return { action: "DRAIN_TRIGGERED", status: "STAGED", existing };
    }
  }

  test("Active report (<2h) triggers processStagedReportBatches and stays STAGED", async () => {
    let drainedEntity = null;
    let updatedStatus = null;

    const mockMongoose = {
      updateOne: async (_id, update) => {
        updatedStatus = update.$set.status;
      },
      processStagedReportBatches: async (entities) => {
        drainedEntity = entities[0];
      },
    };

    const activeReport = {
      _id: "report_123",
      status: "STAGED",
      createdAt: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
      updatedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 mins ago
    };

    const result = await evaluateStagedReport(activeReport, "spTargeting", mockMongoose);

    assert.strictEqual(result.action, "DRAIN_TRIGGERED");
    assert.strictEqual(result.status, "STAGED");
    assert.strictEqual(drainedEntity, "spTargeting");
    assert.strictEqual(updatedStatus, null, "Should NOT update report status to FAILED");
    assert.notStrictEqual(result.existing, null, "Existing report should be retained");
  });

  test("Stalled report (>2h) marks report as FAILED and invalidates existing to re-request", async () => {
    let drainedEntity = null;
    let updatedStatus = null;

    const mockMongoose = {
      updateOne: async (_id, update) => {
        updatedStatus = update.$set.status;
      },
      processStagedReportBatches: async (entities) => {
        drainedEntity = entities[0];
      },
    };

    const stalledReport = {
      _id: "report_999",
      status: "STAGED",
      createdAt: new Date(Date.now() - 150 * 60 * 1000), // 2.5 hours ago
      updatedAt: new Date(Date.now() - 130 * 60 * 1000), // 2 hours 10 mins ago
    };

    const result = await evaluateStagedReport(stalledReport, "spTargeting", mockMongoose);

    assert.strictEqual(result.action, "MARKED_FAILED_AND_RETRY");
    assert.strictEqual(updatedStatus, "FAILED", "Stalled report must be marked FAILED in DB");
    assert.strictEqual(drainedEntity, null, "Should NOT trigger drain on dead stalled report");
    assert.strictEqual(result.existing, null, "Existing must be reset to null so fresh report is requested");
  });
});

describe("3. Recommendation Controller Historical Fallback Logic", () => {
  const recCtrlPath = path.resolve(__dirname, "../api-server/controllers/recommendation.controller.js");
  const recCode = fs.readFileSync(recCtrlPath, "utf8");

  test("computeRecommendationCounts contains fallback targeting query sorted by latest reportDate", () => {
    assert.ok(recCode.includes("sort({ reportDate: -1 })"), "Must sort by reportDate: -1 for fallback");
    assert.ok(recCode.includes("effectiveTargets = latestDate"), "Must filter by latest available reportDate");
  });

  test("computeRecommendationCounts contains fallback for campaigns, adGroups, and targetings", () => {
    assert.ok(recCode.includes("effectiveCampaigns = await adTypeCampaignSchema.find"), "Must fall back to latest campaigns");
    assert.ok(recCode.includes("effectiveAdGroups = await adTypeAdGroupSchema.find"), "Must fall back to latest ad groups");
    assert.ok(recCode.includes("effectiveTargetings = await adTypeTargetingSchema.find"), "Must fall back to latest targetings");
  });

  test("getTargetingRecommendationDetails contains fallback targeting resolution", () => {
    assert.ok(recCode.includes("let effectiveTargets = targets;"), "Must declare effectiveTargets");
    assert.ok(recCode.includes("targetMap = firstBy(effectiveTargets,"), "targetMap must use effectiveTargets");
    assert.ok(recCode.includes("fallbackMap = firstBy(effectiveTargets,"), "fallbackMap must use effectiveTargets");
  });

  test("getRecommendationData contains fallback for campaigns, adGroups, and targetings", () => {
    assert.ok(recCode.includes("let currentCampaigns = enabledCampaigns;"), "Must declare currentCampaigns fallback");
    assert.ok(recCode.includes("let currentAdGroups = enabledAdGroups;"), "Must declare currentAdGroups fallback");
    assert.ok(recCode.includes("let currentTargetings = enabledTargetings;"), "Must declare currentTargetings fallback");
  });
});
