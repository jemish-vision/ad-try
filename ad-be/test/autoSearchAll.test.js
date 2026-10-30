"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const customerController = require("../api-server/controllers/customer.controller");

test("getCampaignAndAdGroupAutoSearch queries SP, SB, and SD collections without null lookups when adType is All", async () => {
  const executedPipelines = {};

  const makeMockModel = (type) => ({
    aggregate: async (pipeline) => {
      executedPipelines[type] = pipeline;
      return [{
        metadata: [{ total: 1 }],
        data: [
          {
            _id: { campaignId: `${type}-c1`, adGroupId: `${type}-ag1` },
            campaign: `${type} Campaign 1`,
            adGroup: `${type} AdGroup 1`,
            campaignId: `${type}-c1`,
            adGroupId: `${type}-ag1`,
            campaignType: type,
          }
        ]
      }];
    }
  });

  const req = {
    adType: "All",
    isAllAdTypes: true,
    adTypes: ["SP", "SB", "SD"],
    modelsByType: {
      SP: { adTypeCampaignSchema: makeMockModel("SP") },
      SB: { adTypeCampaignSchema: makeMockModel("SB") },
      SD: { adTypeCampaignSchema: makeMockModel("SD") },
    },
    config: { configId: "fake-config-id" },
    body: { profileId: 123456, searchName: "" },
  };

  let responseData = null;
  const res = {
    status: (code) => {
      assert.equal(code, 200);
      return {
        send: (data) => {
          responseData = data;
          return data;
        }
      };
    }
  };

  await customerController.getCampaignAndAdGroupAutoSearch(req, res);

  assert.ok(responseData, "Expected a response");
  assert.equal(responseData.isSuccess, true);
  assert.equal(responseData.result.length, 3);
  assert.deepEqual(
    responseData.result.map(r => r.campaignType),
    ["SP", "SB", "SD"]
  );

  // Verify lookup collections are valid strings and never undefined / null
  for (const type of ["SP", "SB", "SD"]) {
    const pipeline = executedPipelines[type];
    assert.ok(pipeline, `Pipeline for ${type} was executed`);
    const lookupStage = pipeline.find(s => s.$lookup);
    assert.ok(lookupStage, `Lookup stage exists for ${type}`);
    assert.ok(typeof lookupStage.$lookup.from === "string", `Lookup from for ${type} is a string`);
    assert.notEqual(lookupStage.$lookup.from, "undefined");
    assert.notEqual(lookupStage.$lookup.from, "null");
  }
});

test("getCampaignAndAdGroupAutoSearch runs single-type query when adType is SP", async () => {
  let executedPipeline = null;
  const mockModel = {
    aggregate: async (pipeline) => {
      executedPipeline = pipeline;
      return [{
        metadata: [{ total: 1 }],
        data: [
          {
            _id: { campaignId: "sp-1", adGroupId: "sp-ag1" },
            campaign: "SP Campaign",
            adGroup: "SP AdGroup",
            campaignId: "sp-1",
            adGroupId: "sp-ag1",
          }
        ]
      }];
    }
  };

  const req = {
    adType: "SP",
    isAllAdTypes: false,
    models: { adTypeCampaignSchema: mockModel },
    config: { configId: "fake-config-id" },
    body: { profileId: 123456, searchName: "test" },
  };

  let responseData = null;
  const res = {
    status: (code) => {
      assert.equal(code, 200);
      return {
        send: (data) => {
          responseData = data;
          return data;
        }
      };
    }
  };

  await customerController.getCampaignAndAdGroupAutoSearch(req, res);

  assert.ok(responseData);
  assert.equal(responseData.isSuccess, true);
  assert.equal(responseData.result.length, 1);
  assert.equal(responseData.result[0].campaign, "SP Campaign");
  assert.equal(executedPipeline.find(s => s.$lookup).$lookup.from, "ad_groups");
});

test.after(() => {
  setTimeout(() => process.exit(0), 100).unref();
});

