const { validateCampaignAssignment } = require("../helper/ruleCampaignAssignment");
const mongoose = require("mongoose");
const { retryWithBackoff } = require("../helper/retryHelper");
const crypto = require("crypto");

const moment = require("moment-timezone");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));
const ExcelJS = require("exceljs");
const path = require("path");

const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const campaignSchema = require("../models/campaign.model");
const placementSchema = require("../models/placement.model");
const targetingSchema = require("../models/targeting.model");
const daypartingRuleSchema = require("../models/daypartingRule.model");
const daypartingRuleHistorySchema = require("../models/daypartingRuleHistory.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const sbCampaignsSchema = require("../models/sbCampaign.model");
const sdCampaignsSchema = require("../models/sdCampaign.model");
const sbTargetingSchema = require("../models/sbTargeting.model");
const sdTargetingSchema = require("../models/sdTargeting.model");
const sbPlacementSchema = require("../models/sbPlacement.model");
const sdPlacementSchema = require("../models/sdPlacement.model")

const { targetingPipeline } = require("./targeting.controller");

const { getActiveSlot, getAccessToken, wait, getActivePlanProfiles, applyMinMax, getRuleSettings, getProfile, safeJsonParse } = require("../helper/common");
const { checkCampaignProductAvailability } = require("../helper/checkEligibility");

const { cron_logs } = require("../../winston/cronAutomation/logger");

const amazonAxios = require("../helper/amazonAxios");
const { processBatchUpdates } = require("../services/amazonBatchService");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { logAudit } = require("../helpers/auditHelper");
const { write_logs } = require("../../winston/utility/logger");

const safeInsertHistoryDocs = async (docs) => {
  if (!docs || !docs.length) return;
  try {
    const configId = docs[0]?.configId;
    const profileId = docs[0]?.profileId;
    if (!configId || !profileId) {
      await campaignChangeHistorySchema.insertMany(docs, { ordered: false });
      return;
    }

    // Filter out no-op changes (oldValue equals newValue)
    const validDocs = docs.filter((d) => {
      if (d.oldValue !== undefined && d.oldValue !== null && d.oldValue !== "—" && d.newValue !== undefined && d.newValue !== null) {
        const oldValStr = String(d.oldValue).trim();
        const newValStr = String(d.newValue).trim();
        if (oldValStr && newValStr && oldValStr === newValStr) return false;
      }
      return true;
    });

    if (!validDocs.length) return;

    // Check for identical changes within the last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const changeLevels = [...new Set(validDocs.map((d) => d.changeLevel).filter(Boolean))];

    const existing = await campaignChangeHistorySchema.find({
      configId,
      profileId,
      changeLevel: { $in: changeLevels },
      createdAt: { $gte: fifteenMinutesAgo },
    }).select("changeLevel changeType targeting matchType newValue").lean();

    const makeKey = (e) => `${e.changeLevel}_${e.changeType}_${(e.targeting || "").toLowerCase().trim()}_${(e.matchType || "").toLowerCase().trim()}_${String(e.newValue || "").trim()}`;
    const existingKeys = new Set(existing.map(makeKey));

    const deduplicated = [];
    const seenInBatch = new Set();
    for (const d of validDocs) {
      const key = makeKey(d);
      if (!existingKeys.has(key) && !seenInBatch.has(key)) {
        seenInBatch.add(key);
        deduplicated.push(d);
      }
    }

    if (deduplicated.length > 0) {
      await campaignChangeHistorySchema.insertMany(deduplicated, { ordered: false });
    }
  } catch (err) {
    console.error("Error in safeInsertHistoryDocs:", err?.message || err);
    await campaignChangeHistorySchema.insertMany(docs, { ordered: false }).catch(() => {});
  }
};

exports.getAllDayparting = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const adType = req.adType;

    const {
      profileId,
      status,
      searchName = "",
      pageNo = 1,
      perPage = 20,
    } = req.body;

    const page = Number(pageNo);
    const limit = Number(perPage);
    const skip = (page - 1) * limit;

    /* ---------- MATCH CONDITION ---------- */
    const matchStage = { ...(configId && { configId }) };

    if (profileId) {
      matchStage.profileId = Number(profileId);
    }

    if (status) {
      matchStage.status = status;
    }

    if (searchName) {
      matchStage.name = { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") };
    }

    const pipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: AD_TYPE_COLLECTIONS?.[adType]?.["campaign"],
          let: { campaignIds: `$campaignIds.${adType}`, profileId: "$profileId" },
          pipeline: [
            { $match: { $expr: { $and: [{ $in: ["$campaignId", "$$campaignIds"] }, { $eq: ["$profileId", "$$profileId"] }] } } },
            { $sort: { updatedAt: -1 } },
            {
              $group: {
                _id: "$campaignId",
                campaignId: { $first: "$campaignId" },
                name: { $first: "$name" },
                status: { $first: "$status" },
              },
            },
            { $project: { _id: 0, campaignId: 1, name: 1, status: 1 } },
          ],
          as: "campaignDetails",
        },
      },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
          ],
          totalCount: [
            { $count: "count" },
          ],
          usedCampaignIds: [
            { $unwind: `$campaignIds.${adType}` },
            { $group: { _id: null, campaignIds: { $addToSet: `$campaignIds.${adType}` } } },
          ],
        },
      },
    ];

    const result = await daypartingRuleSchema.aggregate(pipeline);

    const list = result[0]?.data || [];
    const totalRecords = result[0]?.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalRecords / limit);
    const usedCampaignIds = result[0]?.usedCampaignIds[0]?.campaignIds || [];

    return res.status(200).send({
      isSuccess: true,
      data: list,
      totalRow: list.length,
      currentPageNo: page,
      totalRecords,
      totalPages,
      usedCampaignIds,
    });

  } catch (error) {
      write_logs({ message: `[getAllDayparting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Get Dayparting Error:", error);

    return res.status(500).send({
      isSuccess: false,
      message: "Failed to fetch dayparting strategies",
      error: "An internal server error occurred",
    });
  }
};

exports.createDayparting = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { _id: userId } = req.user;
    const { profileId, name, type, frequency, slotType, bidChangeType, campaigns, targetingIds, slots } = req.body;


    const assignment = validateCampaignAssignment(campaigns);
    if (assignment.error) return res.status(400).send({ isSuccess: false, message: assignment.error });

    /* ---------- BASIC VALIDATION ---------- */
    if (!name || !frequency || !slotType) {
      return res.status(400).send({
        isSuccess: false,
        message: "Required fields are missing",
      });
    }

    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).send({
        isSuccess: false,
        message: "Slots configuration is required",
      });
    }

    /* ---------- CREATE RULE ---------- */
    const newRule = await daypartingRuleSchema.create({
      configId,
      userId,
      profileId,
      name,
      type,
      frequency,
      slotType,
      bidChangeType,
      campaignIds: assignment.campaignIds,
      targetingIds,
      slots,
    });

    const spCampaigns = await campaignSchema.aggregate([
      { $match: { campaignId: { $in: campaigns?.SP || [] } } },
      { $sort: { reportDate: -1 } },
      { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
    ]);

    const sbCampaigns = await sbCampaignsSchema.aggregate([
      { $match: { campaignId: { $in: campaigns?.SB || [] } } },
      { $sort: { reportDate: -1 } },
      { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
    ]);

    const sdCampaigns = await sdCampaignsSchema.aggregate([
      { $match: { campaignId: { $in: campaigns?.SD || [] } } },
      { $sort: { reportDate: -1 } },
      { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
    ]);

    const campaignsMap = {
      SponsoredProduct: spCampaigns.map(c => c.campaignName),
      SponsoredBrand: sbCampaigns.map(c => c.campaignName),
      SponsoredDisplay: sdCampaigns.map(c => c.campaignName),
    };

    const campaignIdToName = {};
    spCampaigns.forEach(c => campaignIdToName[c._id] = c.campaignName);
    sbCampaigns.forEach(c => campaignIdToName[c._id] = c.campaignName);
    sdCampaigns.forEach(c => campaignIdToName[c._id] = c.campaignName);

    const getTargetNames = async (ids, Schema) => {
      if (!ids || ids.length === 0) return [];

      const latestDoc = await Schema.findOne({
        $or: [{ keywordId: { $in: ids } }, { targetId: { $in: ids } }]
      }, { reportDate: 1 }).sort({ reportDate: -1 }).lean();

      if (!latestDoc || !latestDoc.reportDate) return [];

      const targets = await Schema.aggregate([
        {
          $match: {
            reportDate: latestDoc.reportDate,
            $or: [{ keywordId: { $in: ids } }, { targetId: { $in: ids } }]
          }
        },
        {
          $project: {
            campaignId: 1,
            name: { $ifNull: ["$keywordText", { $ifNull: ["$targetingText", { $ifNull: ["$targeting", "$resolvedText"] }] }] }
          }
        }
      ]);
      return targets.map(t => {
        const campName = campaignIdToName[t.campaignId] || t.campaignId;
        return `${campName} : ${t.name}`;
      }).filter(Boolean);
    };

    const targetingsMap = {
      SponsoredProduct: await getTargetNames(targetingIds?.SP, targetingSchema),
      SponsoredBrand: await getTargetNames(targetingIds?.SB, sbTargetingSchema),
      SponsoredDisplay: await getTargetNames(targetingIds?.SD, sdTargetingSchema),
    };

    await logAudit("DAYPARTING_RULE_CREATION", `Created dayparting rule: ${newRule?.name}`, {
      name: newRule?.name,
      type: newRule?.type,
      frequency: newRule?.frequency,
      slotType: newRule?.slotType,
      bidChangeType: newRule?.bidChangeType,
      slots: newRule?.slots,
      campaigns: campaignsMap,
      targetings: targetingsMap,
    }, req?.user?.id);

    return res.status(200).send({
      isSuccess: true,
      message: "Strategy created successfully",
      data: newRule,
    });

  } catch (error) {
      write_logs({ message: `[getTargetNames Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Create Dayparting Error:", error);

    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong, please try again",
      error: "An internal server error occurred",
    });
  }
};

exports.updateDayparting = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { ruleId, profileId, name, type, frequency, slotType, bidChangeType, campaigns, targetingIds, slots } = req.body;


    /* ---------- VALIDATION ---------- */
    if (!ruleId) {
      return res.status(400).send({
        isSuccess: false,
        message: "ruleId is required",
      });
    }

    if (!name || !frequency || !slotType) {
      return res.status(400).send({
        isSuccess: false,
        message: "Required fields are missing",
      });
    }

    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).send({
        isSuccess: false,
        message: "Slots configuration is required",
      });
    }

    /* ---------- CHECK RULE EXISTS ---------- */
    const existingRule = await daypartingRuleSchema.findOne({ _id: ruleId, ...(configId && { configId }) });
    if (!existingRule) {
      return res.status(404).send({
        isSuccess: false,
        message: "Dayparting rule not found",
      });
    }

    /* ---------- UPDATE RULE ---------- */
    existingRule.name = name;
    existingRule.type = type;
    existingRule.frequency = frequency;
    existingRule.slotType = slotType;
    existingRule.bidChangeType = bidChangeType;
    existingRule.campaignIds = campaigns;
    if (targetingIds) {
      existingRule.targetingIds = targetingIds;
    }
    existingRule.slots = slots;


    const spCampaigns = await campaignSchema.aggregate([
      { $match: { campaignId: { $in: campaigns?.SP || [] } } },
      { $sort: { reportDate: -1 } },
      { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
    ]);

    const sbCampaigns = await sbCampaignsSchema.aggregate([
      { $match: { campaignId: { $in: campaigns?.SB || [] } } },
      { $sort: { reportDate: -1 } },
      { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
    ]);

    const sdCampaigns = await sdCampaignsSchema.aggregate([
      { $match: { campaignId: { $in: campaigns?.SD || [] } } },
      { $sort: { reportDate: -1 } },
      { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
    ]);

    const campaignsMap = {
      SponsoredProduct: spCampaigns.map(c => c.campaignName),
      SponsoredBrand: sbCampaigns.map(c => c.campaignName),
      SponsoredDisplay: sdCampaigns.map(c => c.campaignName),
    };

    const campaignIdToName = {};
    spCampaigns.forEach(c => campaignIdToName[c._id] = c.campaignName);
    sbCampaigns.forEach(c => campaignIdToName[c._id] = c.campaignName);
    sdCampaigns.forEach(c => campaignIdToName[c._id] = c.campaignName);

    const getTargetNames = async (ids, Schema) => {
      if (!ids || ids.length === 0) return [];

      const latestDoc = await Schema.findOne({
        $or: [{ keywordId: { $in: ids } }, { targetId: { $in: ids } }]
      }, { reportDate: 1 }).sort({ reportDate: -1 }).lean();

      if (!latestDoc || !latestDoc.reportDate) return [];

      const targets = await Schema.aggregate([
        {
          $match: {
            reportDate: latestDoc.reportDate,
            $or: [{ keywordId: { $in: ids } }, { targetId: { $in: ids } }]
          }
        },
        {
          $project: {
            campaignId: 1,
            name: { $ifNull: ["$keywordText", { $ifNull: ["$targetingText", { $ifNull: ["$targeting", "$resolvedText"] }] }] }
          }
        }
      ]);
      return targets.map(t => {
        const campName = campaignIdToName[t.campaignId] || t.campaignId;
        return `${campName} : ${t.name}`;
      }).filter(Boolean);
    };

    const targetingsMap = {
      SponsoredProduct: await getTargetNames(targetingIds?.SP, targetingSchema),
      SponsoredBrand: await getTargetNames(targetingIds?.SB, sbTargetingSchema),
      SponsoredDisplay: await getTargetNames(targetingIds?.SD, sdTargetingSchema),
    };

    await existingRule.save();

    await logAudit("DAYPARTING_RULE_UPDATE", `Updated dayparting rule: ${existingRule?.name}`, {
      name: existingRule?.name,
      type: existingRule?.type,
      frequency: existingRule?.frequency,
      slotType: existingRule?.slotType,
      bidChangeType: existingRule?.bidChangeType,
      slots: existingRule?.slots,
      campaigns: campaignsMap,
      targetings: targetingsMap,
    }, req?.user?.id);

    return res.status(200).send({
      isSuccess: true,
      message: "Dayparting strategy updated successfully",
      data: existingRule,
    });

  } catch (error) {
      write_logs({ message: `[getTargetNames Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Update Dayparting Error:", error);

    return res.status(500).send({
      isSuccess: false,
      message: "Failed to update dayparting strategy",
      error: "An internal server error occurred",
    });
  }
};

exports.statusChangeDayparting = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { ruleId, status } = req.body;

    /* ---------- VALIDATION ---------- */
    if (!ruleId || !status) {
      return res.status(400).send({
        isSuccess: false,
        message: "ruleId and status are required",
      });
    }

    if (!["ACTIVE", "PAUSED"].includes(status)) {
      return res.status(400).send({
        isSuccess: false,
        message: "Invalid status value",
      });
    }

    /* ---------- FIND RULE ---------- */
    const rule = await daypartingRuleSchema.findOne({ _id: ruleId, ...(configId && { configId }) });
    if (!rule) {
      return res.status(404).send({
        isSuccess: false,
        message: "Dayparting rule not found",
      });
    }

    /* ---------- NO CHANGE ---------- */
    if (rule.status === status) {
      return res.status(200).send({
        isSuccess: true,
        message: `Strategy is already ${status}`,
        data: rule,
      });
    }

    /* ---------- UPDATE STATUS ---------- */
    rule.status = status;
    await rule.save();

    await logAudit("DAYPARTING_RULE_STATUS_CHANGE", `Dayparting rule ${rule?.name} ${status === "ACTIVE" ? "activated" : "paused"}`, {
      ruleName: rule?.name,
    }, req?.user?.id);

    return res.status(200).send({
      isSuccess: true,
      message: `Strategy ${status === "ACTIVE" ? "activated" : "paused"} successfully`,
      data: { _id: rule._id, status: rule.status },
    });

  } catch (error) {
      write_logs({ message: `[statusChangeDayparting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Dayparting Status Change Error:", error);

    return res.status(500).send({
      isSuccess: false,
      message: "Failed to update dayparting status",
      error: "An internal server error occurred",
    });
  }
};

exports.deleteDayparting = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { ruleId } = req.body;

    /* ---------- VALIDATION ---------- */
    if (!ruleId) {
      return res.status(400).send({
        isSuccess: false,
        message: "ruleId is required",
      });
    }

    /* ---------- CHECK EXISTENCE ---------- */
    const rule = await daypartingRuleSchema.findOne({ _id: ruleId, ...(configId && { configId }) }).lean();
    if (!rule) {
      return res.status(404).send({
        isSuccess: false,
        message: "Dayparting rule not found",
      });
    }

    /* ---------- DELETE RULE ---------- */
    await daypartingRuleSchema.deleteOne({ _id: ruleId, configId });

    await logAudit("DAYPARTING_RULE_DELETION", `Deleted dayparting rule: ${rule?.name}`, {
      ruleName: rule?.name,
    }, req?.user?.id);

    return res.status(200).send({
      isSuccess: true,
      message: "Dayparting strategy deleted successfully",
      data: { ruleId },
    });

  } catch (error) {
      write_logs({ message: `[deleteDayparting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Delete Dayparting Error:", error);

    return res.status(500).send({
      isSuccess: false,
      message: "Failed to delete dayparting strategy",
      error: "An internal server error occurred",
    });
  }
};

const updateSPTargetingBidInternal = async (profile, rule, targetingList, bidMap, reportDate) => {
  const checkConfigAds = await getAccessToken(rule?.configId);

  try {

    const targets = [];
    const updateTargetList = [];

    const keywords = [];
    const updateKeywordList = [];

    await Promise.all(
      targetingList.flatMap(async (targeting) => {

        const newBid = typeof bidMap[targeting.targetId] === 'object' && bidMap[targeting.targetId] !== null ? bidMap[targeting.targetId].value : bidMap[targeting.targetId];
        if (!newBid) return null;


        if (targeting.targetId.startsWith("T-")) {
          targets.push({
            "targetId": targeting.targetId.replace("T-", ""),
            "bid": Number(newBid)
          });
          updateTargetList.push(targeting);
          return null
        }

        if (targeting.targetId.startsWith("K-")) {
          keywords.push({
            "keywordId": targeting.targetId.replace("K-", ""),
            "bid": Number(newBid),
          });
          updateKeywordList.push(targeting);
          return null
        }

      })
    )

    let existingTargets = [];

    if (targets?.length) {
      const { successfulItems: successfulTargets } = await processBatchUpdates({
        updates: targets,
        entityType: "SP_TARGETS",
        profile,
        checkConfigAds,
        configId: profile.configId
      });

      const successTargetIds = new Set(successfulTargets.map(t => String(t.targetId)));
      const verifiedTargets = updateTargetList.filter(t => successTargetIds.has(String(t.targetId).replace(/^T-/, "")));
      existingTargets = existingTargets.concat(verifiedTargets);
    }

    if (keywords?.length) {
      const { successfulItems: successfulKeywords } = await processBatchUpdates({
        updates: keywords,
        entityType: "SP_KEYWORDS",
        profile,
        checkConfigAds,
        configId: profile.configId
      });

      const successKeywordIds = new Set(successfulKeywords.map(k => String(k.keywordId)));
      const verifiedKeywords = updateKeywordList.filter(k => successKeywordIds.has(String(k.targetId).replace(/^K-/, "")));
      existingTargets = existingTargets.concat(verifiedKeywords);
    }

    if (existingTargets.length > 0) {


      const targetIds = existingTargets.map(t => t.targetId);
      const dbTargets = await targetingSchema.find({ targetId: { $in: targetIds }, reportDate }).lean();

      const oldValueMap = {};
      dbTargets.forEach(t => {
        if (t.targetId && !isNaN(t.keywordBid)) {
          oldValueMap[t.targetId] = Number(t.keywordBid);
        }
      });

      const historyDocs = [];
      const bulkUpdates = [];

      for (const t of existingTargets) {

        const oldValue = typeof oldValueMap[t.targetId] === 'object' ? oldValueMap[t.targetId].value : oldValueMap[t.targetId];
        const newValue = typeof bidMap[t.targetId] === 'object' ? bidMap[t.targetId].value : bidMap[t.targetId]

        // 🔹 Skip if no change
        if (Number(oldValue) === Number(newValue)) continue;

        /* ---------- HISTORY ---------- */
        historyDocs.push({
          configId: rule?.configId,
          profileId: profile?.profileId,
          changeLevel: t.campaignId,
          changeType: "Cron Job: Dayparting rule updated a targeting bid",
          targeting: t.targeting,
          oldValue,
          newValue,
          updatedFrom: "Targeting",
          source: "DAYPARTING",
          userId: rule?.userId,
          type: "SP"
        });

        /* ---------- DB UPDATE ---------- */
        bulkUpdates.push({
          updateMany: {
            filter: {
              campaignId: Number(t.campaignId),
              targetId: t.targetId,
              reportDate
            },
            update: { $set: { keywordBid: newValue } },
          },
        });

      }

      /* ---------- EXECUTE WRITES ---------- */
      if (historyDocs.length) {
        await safeInsertHistoryDocs(historyDocs);
      }

      if (bulkUpdates.length) {
        await targetingSchema.bulkWrite(bulkUpdates);
      }

      cron_logs({
        message: `Dayparting Rule | Profile: ${profile.name} | ${existingTargets.length} keywords bid updated successfully`,
        log_type: "info",
      });
    }

  } catch (err) {
    cron_logs({
      message: `Targeting bid update failed - ${err}`,
      log_type: "error",
    });
  }
};

async function sponsoredProductTargtingDayparting({ rule, profile, campaignIds, activeSlot, now, history }) {
  const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "targetingRuleSetting");

  const currentDate = now.format("YYYY-MM-DD");

  const isKeywordDayparting = rule?.type === "KEYWORDS";
  const targetingIds = rule?.targetingIds?.SP ?? [];

  const query = {
    campaignId: { $in: campaignIds },
    ...(isKeywordDayparting && { targetId: { $in: targetingIds } }),
    profileId: rule.profileId,
    configId: rule.configId,
    reportDate: currentDate
  };

  const pipeline = targetingPipeline(query, currentDate);
  pipeline.push({
    $match: {
      campaignStatus: { $nin: ["PAUSED", "ARCHIVED"] },
      status: { $nin: ["PAUSED", "ARCHIVED"] }
    }
  });
  const targetingList = await targetingSchema.aggregate(pipeline);
  if (!targetingList.length) return { spTargetingExecutionState: null, baseSPTargetingBid: null, appliedSPTargetingBid: null, isSPTargetingReverted: false };

  const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate);
  const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
  const eligibleTargeting = targetingList.filter(c => !lowStockIds.has(c.campaignId));

  const baseBidMap = {};
  targetingList.forEach(t => {
    if (t.targetId && !isNaN(t.keywordBid)) {
      baseBidMap[t.targetId] = { value: Number(t.keywordBid || t.bid), name: t.targeting || t.keywordText || t.targetText || t.keywordName || t.targetName || t.expression || t.resolvedExpression || "", campaignId: t.campaignId, targetType: t.targetType || t.type || t.keywordType || "" };
    }
  });

  /* ---------- SLOT CHANGE ---------- */
  if (activeSlot && history && history.slotIndex !== activeSlot.slotIndex) {

    let appliedBidMap = {};
    if (eligibleTargeting.length > 0) {

      if (activeSlot.multiplier === 1) {
        await updateSPTargetingBidInternal(profile, rule, eligibleTargeting, history?.baseTargetingBid?.SP, currentDate);
      } else {
        Object.entries(history.baseTargetingBid.SP).forEach(([k, v]) => {
          if (eligibleTargeting.filter(r => r.targetId == k)?.length > 0) {
            appliedBidMap[k] = { ...(typeof v === "object" && v !== null ? v : {}), value: applyMinMax(Number(((typeof v === "object" && v !== null ? v.value : v) * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid) };
          }
        });

        await updateSPTargetingBidInternal(profile, rule, eligibleTargeting, appliedBidMap, currentDate);
      }

    }

    return {
      spExecutionState: "APPLIED",
      baseSPTargetingBid: history?.baseTargetingBid?.SP,
      baseAppliedSPTargetingBid: history?.appliedTargetingBid?.SP,
      appliedSPTargetingBid: appliedBidMap,
      isSPReverted: true
    }
  }

  /* ---------- FIRST APPLY ---------- */
  else if (activeSlot && !history && eligibleTargeting.length > 0) {

    const appliedBidMap = {};
    Object.entries(baseBidMap).forEach(([k, v]) => {
      if (eligibleTargeting.filter(r => r.targetId == k)?.length > 0) {
        appliedBidMap[k] = { ...(typeof v === "object" && v !== null ? v : {}), value: applyMinMax(Number(((typeof v === "object" && v !== null ? v.value : v) * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid) };
      }
    });

    if (activeSlot.multiplier !== 1) {
      await updateSPTargetingBidInternal(profile, rule, eligibleTargeting, appliedBidMap, currentDate);
    }

    return {
      spExecutionState: "APPLIED",
      baseSPTargetingBid: baseBidMap,
      baseAppliedSPTargetingBid: baseBidMap,
      appliedSPTargetingBid: appliedBidMap,
      isSPReverted: false
    }
  }

  /* ---------- REVERT ---------- */
  else if (!activeSlot && history) {
    if (history.multiplier !== 1 && history.multiplier !== 0) {
      await updateSPTargetingBidInternal(profile, rule, targetingList, history.baseTargetingBid.SP, currentDate);
    }
    return {
      spExecutionState: null,
      // Capture pre-revert (the applied multiplied bids) and post-revert (the original base bids)
      preRevertSPTargetingBid: history.appliedTargetingBid?.SP ?? null,
      postRevertSPTargetingBid: history.baseTargetingBid?.SP ?? null,
      isSPReverted: true
    }
  }

  return {
    spExecutionState: history?.executionState ?? null,
    baseSPTargetingBid: history?.baseTargetingBid?.SP ?? null,
    baseAppliedSPTargetingBid: history?.appliedTargetingBid?.SP ?? null,
    appliedSPTargetingBid: history?.appliedTargetingBid?.SP ?? null,
    isSPReverted: false
  }

}

const updateSBTargetingBidInternal = async (profile, rule, targetingList, bidMap, reportDate) => {
  const checkConfigAds = await getAccessToken(rule?.configId);

  try {

    const targets = [];
    const updateTargetList = [];

    const keywords = [];
    const updateKeywordList = [];

    await Promise.all(
      targetingList.flatMap(async (targeting) => {

        const newBid = typeof bidMap[targeting.targetId] === 'object' && bidMap[targeting.targetId] !== null ? bidMap[targeting.targetId].value : bidMap[targeting.targetId];
        if (!newBid) return null;


        if (targeting.targetId.startsWith("T-")) {
          targets.push({
            "targetId": Number(targeting.targetId.replace("T-", "")),
            "bid": Number(newBid)
          });
          updateTargetList.push(targeting);
          return null
        }

        if (targeting.targetId.startsWith("K-")) {
          keywords.push({
            "keywordId": Number(targeting.targetId.replace("K-", "")),
            "bid": Number(newBid),
          });
          updateKeywordList.push(targeting);
          return null
        }

      })
    )

    let existingTargets = [];

    if (targets?.length) {
      const { successfulItems: successfulTargets } = await processBatchUpdates({
        updates: targets,
        entityType: "SB_TARGETS",
        profile,
        checkConfigAds,
        configId: profile.configId,
      });

      const successTargetIds = new Set(successfulTargets.map(t => String(t.targetId)));
      const verifiedTargets = updateTargetList.filter(t => successTargetIds.has(String(t.targetId).replace(/^T-/, "")));
      existingTargets = existingTargets.concat(verifiedTargets);
    }

    if (keywords?.length) {
      const { successfulItems: successfulKeywords } = await processBatchUpdates({
        updates: keywords,
        entityType: "SB_KEYWORDS",
        profile,
        checkConfigAds,
        configId: profile.configId,
      });

      const successKeywordIds = new Set(successfulKeywords.map(k => String(k.keywordId)));
      const verifiedKeywords = updateKeywordList.filter(k => successKeywordIds.has(String(k.targetId).replace(/^K-/, "")));
      existingTargets = existingTargets.concat(verifiedKeywords);
    }

    if (existingTargets.length > 0) {

      const targetIds = existingTargets.map(t => t.targetId);
      const dbTargets = await sbTargetingSchema.find({ targetId: { $in: targetIds }, reportDate }).lean();

      const oldValueMap = {};
      dbTargets.forEach(t => {
        if (t.targetId && !isNaN(t.keywordBid)) {
          oldValueMap[t.targetId] = Number(t.keywordBid);
        }
      });

      const historyDocs = [];
      const bulkUpdates = [];

      for (const t of existingTargets) {

        const oldValue = typeof oldValueMap[t.targetId] === 'object' ? oldValueMap[t.targetId].value : oldValueMap[t.targetId];
        const newValue = typeof bidMap[t.targetId] === 'object' ? bidMap[t.targetId].value : bidMap[t.targetId]

        // 🔹 Skip if no change
        if (Number(oldValue) === Number(newValue)) continue;

        /* ---------- HISTORY ---------- */
        historyDocs.push({
          configId: rule?.configId,
          profileId: profile?.profileId,
          changeLevel: t.campaignId,
          changeType: "Cron Job: Dayparting rule updated a targeting bid",
          targeting: t.targeting,
          oldValue,
          newValue,
          updatedFrom: "Targeting",
          source: "DAYPARTING",
          userId: rule?.userId,
          type: "SB"
        });

        /* ---------- DB UPDATE ---------- */
        bulkUpdates.push({
          updateMany: {
            filter: {
              campaignId: t.campaignId,
              targetId: t.targetId,
              reportDate
            },
            update: { $set: { keywordBid: newValue } },
          },
        });

      }

      /* ---------- EXECUTE WRITES ---------- */
      if (historyDocs.length) {
        await safeInsertHistoryDocs(historyDocs);
      }

      if (bulkUpdates.length) {
        await sbTargetingSchema.bulkWrite(bulkUpdates);
      }

      cron_logs({
        message: `Dayparting Rule | Profile: ${profile.name} | ${existingTargets.length} keywords bid updated successfully`,
        log_type: "info",
      });
    }

  } catch (err) {
    cron_logs({
      message: `Targeting bid update failed - ${err}`,
      log_type: "error",
    });
  }
};

async function sponsoredBrandTargtingDayparting({ rule, profile, campaignIds, activeSlot, now, history }) {
  const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "targetingRuleSetting");

  const currentDate = now.format("YYYY-MM-DD");

  const isKeywordDayparting = rule?.type === "KEYWORDS";
  const targetingIds = rule?.targetingIds?.SB ?? [];

  const query = {
    campaignId: { $in: campaignIds },
    ...(isKeywordDayparting && { targetId: { $in: targetingIds } }),
    profileId: rule.profileId,
    configId: rule.configId,
    reportDate: currentDate
  };

  const pipeline = targetingPipeline(query, currentDate);
  pipeline.push({
    $match: {
      campaignStatus: { $nin: ["PAUSED", "ARCHIVED"] },
      status: { $nin: ["PAUSED", "ARCHIVED"] }
    }
  });

  const targetingList = await sbTargetingSchema.aggregate(pipeline);
  if (!targetingList.length) return { sbTargetingExecutionState: null, baseSBTargetingBid: null, appliedSBTargetingBid: null, isSBTargetingReverted: false };


  const baseBidMap = {};
  targetingList.forEach(t => {
    if (t.targetId && !isNaN(t.keywordBid)) {
      baseBidMap[t.targetId] = { value: Number(t.keywordBid || t.bid), name: t.targeting || t.keywordText || t.targetText || t.keywordName || t.targetName || t.expression || t.resolvedExpression || "", campaignId: t.campaignId, targetType: t.targetType || t.type || t.keywordType || "" };
    }
  });

  /* ---------- SLOT CHANGE ---------- */
  if (activeSlot && history && history.slotIndex !== activeSlot.slotIndex) {

    let appliedBidMap = {};
    if (targetingList.length > 0) {

      if (activeSlot.multiplier === 1) {
        await updateSBTargetingBidInternal(profile, rule, targetingList, history?.baseTargetingBid?.SB, currentDate);
      } else {
        Object.entries(history.baseTargetingBid.SB).forEach(([k, v]) => {
          if (targetingList.filter(r => r.targetId == k)?.length > 0) {
            appliedBidMap[k] = { ...(typeof v === "object" && v !== null ? v : {}), value: applyMinMax(Number(((typeof v === "object" && v !== null ? v.value : v) * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid) };
          }
        });

        await updateSBTargetingBidInternal(profile, rule, targetingList, appliedBidMap, currentDate);
      }

    }

    return {
      sbExecutionState: "APPLIED",
      baseSBTargetingBid: history?.baseTargetingBid?.SB,
      baseAppliedSBTargetingBid: history?.appliedTargetingBid?.SB,
      appliedSBTargetingBid: appliedBidMap,
      isSBReverted: true
    }
  }

  /* ---------- FIRST APPLY ---------- */
  else if (activeSlot && !history && targetingList.length > 0) {

    const appliedBidMap = {};
    Object.entries(baseBidMap).forEach(([k, v]) => {
      if (targetingList.filter(r => r.targetId == k)?.length > 0) {
        appliedBidMap[k] = { ...(typeof v === "object" && v !== null ? v : {}), value: applyMinMax(Number(((typeof v === "object" && v !== null ? v.value : v) * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid) };
      }
    });

    if (activeSlot.multiplier !== 1) {
      await updateSBTargetingBidInternal(profile, rule, targetingList, appliedBidMap, currentDate);
    }

    return {
      sbExecutionState: "APPLIED",
      baseSBTargetingBid: baseBidMap,
      baseAppliedSBTargetingBid: baseBidMap,
      appliedSBTargetingBid: appliedBidMap,
      isSBReverted: false
    }
  }

  /* ---------- REVERT ---------- */
  else if (!activeSlot && history) {
    if (history.multiplier !== 1 && history.multiplier !== 0) {
      await updateSBTargetingBidInternal(profile, rule, targetingList, history.baseTargetingBid.SB, currentDate);
    }
    return {
      sbExecutionState: null,
      preRevertSBTargetingBid: history.appliedTargetingBid?.SB ?? null,
      postRevertSBTargetingBid: history.baseTargetingBid?.SB ?? null,
      isSBReverted: true
    }
  }

  return {
    sbExecutionState: history?.executionState ?? null,
    baseSBTargetingBid: history?.baseTargetingBid?.SB ?? null,
    baseAppliedSBTargetingBid: history?.baseTargetingBid?.SB ?? null,
    appliedSBTargetingBid: history?.appliedTargetingBid?.SB ?? null,
    isSBReverted: false
  }

}

const updateSDTargetingBidInternal = async (profile, rule, targetingList, bidMap, reportDate) => {
  const checkConfigAds = await getAccessToken(rule?.configId);

  try {

    const targets = [];
    const updateTargetList = [];

    await Promise.all(
      targetingList.flatMap(async (targeting) => {

        const newBid = typeof bidMap[targeting.targetId] === 'object' && bidMap[targeting.targetId] !== null ? bidMap[targeting.targetId].value : bidMap[targeting.targetId];
        if (!newBid) return null;


        if (targeting.targetId.startsWith("T-")) {
          targets.push({
            "targetId": Number(targeting.targetId.replace("T-", "")),
            "bid": Number(newBid)
          });
          updateTargetList.push(targeting);
          return null
        }

      })
    )

    let existingTargets = [];

    if (targets?.length) {
      const { successfulItems: successfulTargets } = await processBatchUpdates({
        updates: targets,
        entityType: "SD_TARGETS",
        profile,
        checkConfigAds,
        configId: profile.configId,
      });

      const successTargetIds = new Set(successfulTargets.map(t => String(t.targetId)));
      const verifiedTargets = updateTargetList.filter(t => successTargetIds.has(String(t.targetId).replace(/^T-/, "")));
      existingTargets = existingTargets.concat(verifiedTargets);
    }

    if (existingTargets.length > 0) {

      const targetIds = existingTargets.map(t => t.targetId);
      const dbTargets = await sdTargetingSchema.find({ targetId: { $in: targetIds }, reportDate }).lean();

      const oldValueMap = {};
      dbTargets.forEach(t => {
        if (t.targetId && !isNaN(t.keywordBid)) {
          oldValueMap[t.targetId] = Number(t.keywordBid);
        }
      });

      const historyDocs = [];
      const bulkUpdates = [];

      for (const t of existingTargets) {

        const oldValue = typeof oldValueMap[t.targetId] === 'object' ? oldValueMap[t.targetId].value : oldValueMap[t.targetId];
        const newValue = typeof bidMap[t.targetId] === 'object' ? bidMap[t.targetId].value : bidMap[t.targetId]

        // 🔹 Skip if no change
        if (Number(oldValue) === Number(newValue)) continue;

        /* ---------- HISTORY ---------- */
        historyDocs.push({
          configId: rule?.configId,
          profileId: profile?.profileId,
          changeLevel: t.campaignId,
          changeType: "Cron Job: Dayparting rule updated a targeting bid",
          targeting: t.targeting,
          oldValue,
          newValue,
          updatedFrom: "Targeting",
          source: "DAYPARTING",
          userId: rule?.userId,
          type: "SD"
        });

        /* ---------- DB UPDATE ---------- */
        bulkUpdates.push({
          updateMany: {
            filter: {
              campaignId: t.campaignId,
              targetId: t.targetId,
              reportDate
            },
            update: { $set: { keywordBid: newValue } },
          },
        });

      }

      /* ---------- EXECUTE WRITES ---------- */
      if (historyDocs.length) {
        await safeInsertHistoryDocs(historyDocs);
      }

      if (bulkUpdates.length) {
        await sdTargetingSchema.bulkWrite(bulkUpdates);
      }

      cron_logs({
        message: `Dayparting Rule | Profile: ${profile.name} | ${existingTargets.length} keywords bid updated successfully`,
        log_type: "info",
      });
    }

  } catch (err) {
    cron_logs({
      message: `Targeting bid update failed - ${err}`,
      log_type: "error",
    });
  }
};

async function sponsoredDisplayTargtingDayparting({ rule, profile, campaignIds, activeSlot, now, history }) {
  const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "targetingRuleSetting");

  const currentDate = now.format("YYYY-MM-DD");

  const isKeywordDayparting = rule?.type === "KEYWORDS";
  const targetingIds = rule?.targetingIds?.SD ?? [];

  const query = {
    campaignId: { $in: campaignIds },
    ...(isKeywordDayparting && { targetId: { $in: targetingIds } }),
    profileId: rule.profileId,
    configId: rule.configId,
    reportDate: currentDate
  };

  const pipeline = targetingPipeline(query, currentDate);
  pipeline.push({
    $match: {
      campaignStatus: { $nin: ["PAUSED", "ARCHIVED"] },
      status: { $nin: ["PAUSED", "ARCHIVED"] }
    }
  });

  const targetingList = await sdTargetingSchema.aggregate(pipeline);
  if (!targetingList.length) return { sdTargetingExecutionState: null, baseSDTargetingBid: null, appliedSDTargetingBid: null, isSDTargetingReverted: false };


  const baseBidMap = {};
  targetingList.forEach(t => {
    if (t.targetId && !isNaN(t.keywordBid)) {
      baseBidMap[t.targetId] = { value: Number(t.keywordBid || t.bid), name: t.targeting || t.keywordText || t.targetText || t.keywordName || t.targetName || t.expression || t.resolvedExpression || "", campaignId: t.campaignId, targetType: t.targetType || t.type || t.keywordType || "" };
    }
  });

  /* ---------- SLOT CHANGE ---------- */
  if (activeSlot && history && history.slotIndex !== activeSlot.slotIndex) {

    let appliedBidMap = {};
    if (targetingList.length > 0) {

      if (activeSlot.multiplier === 1) {
        await updateSDTargetingBidInternal(profile, rule, targetingList, history?.baseTargetingBid?.SD, currentDate);
      } else {
        Object.entries(history.baseTargetingBid.SD).forEach(([k, v]) => {
          if (targetingList.filter(r => r.targetId == k)?.length > 0) {
            appliedBidMap[k] = { ...(typeof v === "object" && v !== null ? v : {}), value: applyMinMax(Number(((typeof v === "object" && v !== null ? v.value : v) * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid) };
          }
        });

        await updateSDTargetingBidInternal(profile, rule, targetingList, appliedBidMap, currentDate);
      }

    }

    return {
      sdExecutionState: "APPLIED",
      baseSDTargetingBid: history?.baseTargetingBid?.SD,
      baseAppliedSDTargetingBid: history?.appliedTargetingBid?.SD,
      appliedSDTargetingBid: appliedBidMap,
      isSDReverted: true
    }
  }

  /* ---------- FIRST APPLY ---------- */
  else if (activeSlot && !history && targetingList.length > 0) {

    const appliedBidMap = {};
    Object.entries(baseBidMap).forEach(([k, v]) => {
      if (targetingList.filter(r => r.targetId == k)?.length > 0) {
        appliedBidMap[k] = { ...(typeof v === "object" && v !== null ? v : {}), value: applyMinMax(Number(((typeof v === "object" && v !== null ? v.value : v) * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid) };
      }
    });

    if (activeSlot.multiplier !== 1) {
      await updateSDTargetingBidInternal(profile, rule, targetingList, appliedBidMap, currentDate);
    }

    return {
      sdExecutionState: "APPLIED",
      baseSDTargetingBid: baseBidMap,
      baseAppliedSDTargetingBid: baseBidMap,
      appliedSDTargetingBid: appliedBidMap,
      isSDReverted: false
    }
  }

  /* ---------- REVERT ---------- */
  else if (!activeSlot && history) {
    if (history.multiplier !== 1 && history.multiplier !== 0) {
      await updateSDTargetingBidInternal(profile, rule, targetingList, history.baseTargetingBid.SD, currentDate);
    }
    return {
      sdExecutionState: null,
      preRevertSDTargetingBid: history.appliedTargetingBid?.SD ?? null,
      postRevertSDTargetingBid: history.baseTargetingBid?.SD ?? null,
      isSDReverted: true
    }
  }

  return {
    sdExecutionState: history?.executionState ?? null,
    baseSDTargetingBid: history?.baseTargetingBid?.SD ?? null,
    baseAppliedSDTargetingBid: history?.appliedTargetingBid?.SD ?? null,
    appliedSDTargetingBid: history?.appliedTargetingBid?.SD ?? null,
    isSDReverted: false
  }

}

async function handleTargetingDayparting({ rule, profile, activeSlot, now }) {
  /* ---------- FETCH HISTORY ---------- */
  const history = await daypartingRuleHistorySchema.findOne({
    ruleId: rule._id,
    executionState: { $in: ["PENDING", "APPLIED"] },
  });

  const { spExecutionState: spTargetingExecutionState, baseAppliedSPTargetingBid, baseSPTargetingBid, appliedSPTargetingBid, isSPReverted, preRevertSPTargetingBid, postRevertSPTargetingBid } = await sponsoredProductTargtingDayparting({ rule, profile, campaignIds: rule.campaignIds.SP, activeSlot, now, history });
  const { sbExecutionState: sbTargetingExecutionState, baseAppliedSBTargetingBid, baseSBTargetingBid, appliedSBTargetingBid, isSBReverted, preRevertSBTargetingBid, postRevertSBTargetingBid } = await sponsoredBrandTargtingDayparting({ rule, profile, campaignIds: rule.campaignIds.SB, activeSlot, now, history });
  const { sdExecutionState: sdTargetingExecutionState, baseAppliedSDTargetingBid, baseSDTargetingBid, appliedSDTargetingBid, isSDReverted, preRevertSDTargetingBid, postRevertSDTargetingBid } = await sponsoredDisplayTargtingDayparting({ rule, profile, campaignIds: rule.campaignIds.SD, activeSlot, now, history });

  if (isSPReverted || isSBReverted || isSDReverted) {
    history.executionState = "REVERTED";
    history.revertedAt = now.toDate();
    // Save the pre-revert (multiplied) bids in appliedTargetingBid
    // and the post-revert (original) bids in baseAppliedTargetingBid
    // so the history modal can show a proper before/after diff
    history.appliedTargetingBid = {
      SP: preRevertSPTargetingBid ?? history.appliedTargetingBid?.SP ?? null,
      SB: preRevertSBTargetingBid ?? history.appliedTargetingBid?.SB ?? null,
      SD: preRevertSDTargetingBid ?? history.appliedTargetingBid?.SD ?? null,
    };
    history.baseAppliedTargetingBid = {
      SP: postRevertSPTargetingBid ?? history.baseAppliedTargetingBid?.SP ?? null,
      SB: postRevertSBTargetingBid ?? history.baseAppliedTargetingBid?.SB ?? null,
      SD: postRevertSDTargetingBid ?? history.baseAppliedTargetingBid?.SD ?? null,
    };
    await history.save();
  }

  if ((spTargetingExecutionState || sbTargetingExecutionState || sdTargetingExecutionState) && (!history || (activeSlot && history.slotIndex !== activeSlot.slotIndex)) && (activeSlot?.multiplier !== 1)) {
    const baseTargetingBid = {
      SP: baseSPTargetingBid,
      SB: baseSBTargetingBid,
      SD: baseSDTargetingBid
    }
    const baseAppliedTargetingBid = {
      SP: baseAppliedSPTargetingBid,
      SB: baseAppliedSBTargetingBid,
      SD: baseAppliedSDTargetingBid
    }
    const appliedTargetingBid = {
      SP: appliedSPTargetingBid,
      SB: appliedSBTargetingBid,
      SD: appliedSDTargetingBid
    }

    await daypartingRuleHistorySchema.create({
      ruleId: rule._id,
      configId: rule.configId,
      profileId: rule.profileId,
      slotIndex: activeSlot.slotIndex,
      startTime: activeSlot.startTime,
      endTime: activeSlot.endTime,
      multiplier: activeSlot.multiplier,
      baseTargetingBid,
      baseAppliedTargetingBid,
      appliedTargetingBid,
      executionState: spTargetingExecutionState || sbTargetingExecutionState || sdTargetingExecutionState,
    });

  }

}

const updateSPCampaignBudgetInternal = async (profile, rule, campaignList, campaignMap, reportDate) => {
  const checkConfigAds = await getAccessToken(rule?.configId);

  const campaignIdSet = new Set(campaignList.map(c => c.campaignId));
  const campaignIds = Array.from(campaignIdSet);
  try {
    /* ---------- AMAZON API ---------- */
    const campaignsPayload = campaignIds.map(campaignId => ({
      campaignId: String(campaignId),
      budget: { budget: campaignMap[campaignId], budgetType: "DAILY" },
    }));

    if (!campaignsPayload.length) return;

    const { successfulItems } = await processBatchUpdates({
      updates: campaignsPayload,
      entityType: "SP_CAMPAIGNS",
      profile,
      checkConfigAds,
      configId: profile.configId,
    });

    const successIds = new Set(successfulItems.map(c => String(c.campaignId)));
    if (successIds.size === 0) return;

      const existingCampaigns = await campaignSchema.find({ campaignId: { $in: campaignIds }, reportDate }).lean();

      const oldValueMap = {};
      existingCampaigns.forEach(cp => {
        if (cp.campaignId && !isNaN(cp.budget)) {
          oldValueMap[cp.campaignId] = Number(cp.budget);
        }
      });

      const historyDocs = [];
      const bulkUpdates = [];

      for (const [campaignId] of Object.entries(campaignMap)) {

        // 🔹 Skip if Amazon rejected this campaign
        if (successIds.size > 0 && !successIds.has(String(campaignId))) continue;

        const oldValue = oldValueMap[campaignId];
        const newValue = campaignMap[campaignId]

        // 🔹 Skip if no change
        if (Number(oldValue) === Number(newValue)) continue;

        /* ---------- HISTORY ---------- */
        historyDocs.push({
          configId: rule?.configId,
          profileId: profile?.profileId,
          changeLevel: campaignId,
          changeType: "Cron Job: Dayparting rule updated Budget",
          oldValue,
          newValue,
          updatedFrom: "Campaign",
          source: "DAYPARTING",
          userId: rule?.userId,
          type: "SP"
        });

        /* ---------- DB UPDATE ---------- */
        bulkUpdates.push({
          updateMany: {
            filter: {
              campaignId: Number(campaignId),
              reportDate
            },
            update: { $set: { budget: newValue } },
          },
        });

      }

      /* ---------- EXECUTE WRITES ---------- */
      if (historyDocs.length) {
        await safeInsertHistoryDocs(historyDocs);
      }

      if (bulkUpdates.length) {
        await campaignSchema.bulkWrite(bulkUpdates);
      }

      cron_logs({
        message: `Dayparting Rule | Profile: ${profile.name} | budget updated for ${bulkUpdates.length} SP campaigns.`,
        log_type: "info",
      });

  } catch (err) {
    cron_logs({
      message: `Campaign budget update failed - ${err}`,
      log_type: "error",
    });
  }
};

async function sponsoredProductBudgetDayparting({ rule, profile, campaignIds, activeSlot, now, history }) {
  const budgetThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "budgetRuleSetting");

  const currentDate = now.format("YYYY-MM-DD");
  const pipeline = [
    {
      $match: {
        campaignId: { $in: campaignIds },
        profileId: rule.profileId,
        configId: rule.configId,
        reportDate: currentDate,
        status: { $nin: ["PAUSED", "ARCHIVED"] }
      }
    },
  ];

  const campaignList = await campaignSchema.aggregate(pipeline);
  if (!campaignList.length) return { spExecutionState: null, baseSPBudget: null, apliedSPBudget: null, isSPReverted: false };


  const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate);
  const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
  const eligibleCampaign = campaignList.filter(c => !lowStockIds.has(c.campaignId));

  /* ---------- BASE PLACEMENT MAP ---------- */
  const baseBudget = {};
  campaignList.forEach(cp => {
    if (cp.campaignId && !isNaN(cp.budget)) {
      baseBudget[cp.campaignId] = Number(cp.budget);
    }
  });

  /* ---------- SLOT CHANGED ---------- */
  if (activeSlot && history && history.slotIndex !== activeSlot.slotIndex) {

    let appliedBudget = {};
    if (eligibleCampaign.length > 0) {

      if (activeSlot.multiplier === 1) {
        await updateSPCampaignBudgetInternal(profile, rule, eligibleCampaign, history?.baseBudget?.SP, currentDate);
      } else {
        Object.entries(history.baseBudget.SP).forEach(([k, v]) => {
          if (eligibleCampaign.filter(r => r.campaignId == k)?.length > 0) {
            appliedBudget[k] = applyMinMax(Number((v * activeSlot.multiplier).toFixed(2)), budgetThreshold?.minBudget, budgetThreshold?.maxBudget);
          }
        });

        await updateSPCampaignBudgetInternal(profile, rule, eligibleCampaign, appliedBudget, currentDate);
      }

    }

    return {
      spExecutionState: "APPLIED",
      baseSPBudget: history?.baseBudget?.SP,
      baseAppliedSPBudget: history?.appliedBudget?.SP,
      apliedSPBudget: appliedBudget,
      isSPReverted: true
    }
  }

  /* ---------- FIRST APPLY ---------- */
  else if (activeSlot && !history && eligibleCampaign.length > 0) {

    const appliedBudget = {};
    Object.entries(baseBudget).forEach(([k, v]) => {
      if (eligibleCampaign.filter(r => r.campaignId == k)?.length > 0) {
        appliedBudget[k] = applyMinMax(Number((v * activeSlot.multiplier).toFixed(2)), budgetThreshold?.minBudget, budgetThreshold?.maxBudget);
      }
    });

    if (activeSlot.multiplier !== 1) {
      await updateSPCampaignBudgetInternal(profile, rule, eligibleCampaign, appliedBudget, currentDate);
    }

    return {
      spExecutionState: "APPLIED",
      baseSPBudget: baseBudget,
      baseAppliedSPBudget: baseBudget,
      apliedSPBudget: appliedBudget,
      isSPReverted: false
    }

  }

  /* ---------- SLOT ENDED (REVERT) ---------- */
  else if (!activeSlot && history) {
    if (history.multiplier !== 1 && history.multiplier !== 0) {
      await updateSPCampaignBudgetInternal(profile, rule, campaignList, history.baseBudget.SP, currentDate);
    }
    return {
      spExecutionState: null,
      isSPReverted: true
    }
  }

  return {
    spExecutionState: history?.executionState ?? null,
    baseSPBudget: history?.baseBudget?.SP ?? null,
    baseAppliedSPBudget: history?.baseBudget?.SP ?? null,
    apliedSPBudget: history?.appliedBudget?.SP ?? null,
    isSPReverted: false
  }
}

const updateSBCampaignBudgetInternal = async (profile, rule, campaignList, campaignMap, reportDate) => {
  const checkConfigAds = await getAccessToken(rule?.configId);

  const campaignIdSet = new Set(campaignList.map(c => c.campaignId));
  const campaignIds = Array.from(campaignIdSet);
  try {
    /* ---------- AMAZON API ---------- */
    const campaignsPayload = campaignIds.map(campaignId => ({
      campaignId: String(campaignId),
      budget: campaignMap[campaignId],
    }));

    if (!campaignsPayload.length) return;

    const { successfulItems } = await processBatchUpdates({
      updates: campaignsPayload,
      entityType: "SB_CAMPAIGNS",
      profile,
      checkConfigAds,
      configId: profile.configId,
    });

    const successIds = new Set(successfulItems.map(c => String(c.campaignId)));
    if (successIds.size === 0) return;

      const existingCampaigns = await sbCampaignsSchema.find({ campaignId: { $in: campaignIds }, reportDate }).lean();

      const oldValueMap = {};
      existingCampaigns.forEach(cp => {
        if (cp.campaignId && !isNaN(cp.budget)) {
          oldValueMap[cp.campaignId] = Number(cp.budget);
        }
      });

      const historyDocs = [];
      const bulkUpdates = [];

      for (const [campaignId] of Object.entries(campaignMap)) {

        // 🔹 Skip if Amazon rejected this campaign
        if (successIds.size > 0 && !successIds.has(String(campaignId))) continue;

        const oldValue = oldValueMap[campaignId];
        const newValue = campaignMap[campaignId]

        // 🔹 Skip if no change
        if (Number(oldValue) === Number(newValue)) continue;

        /* ---------- HISTORY ---------- */
        historyDocs.push({
          configId: rule?.configId,
          profileId: profile?.profileId,
          changeLevel: campaignId,
          changeType: "Cron Job: Dayparting rule updated Budget",
          oldValue,
          newValue,
          updatedFrom: "Campaign",
          source: "DAYPARTING",
          userId: rule?.userId,
          type: "SB"
        });

        /* ---------- DB UPDATE ---------- */
        bulkUpdates.push({
          updateMany: {
            filter: {
              campaignId: Number(campaignId),
              reportDate
            },
            update: { $set: { budget: newValue } },
          },
        });

      }

      /* ---------- EXECUTE WRITES ---------- */
      if (historyDocs.length) {
        await safeInsertHistoryDocs(historyDocs);
      }

      if (bulkUpdates.length) {
        await sbCampaignsSchema.bulkWrite(bulkUpdates);
      }

      cron_logs({
        message: `Dayparting Rule | Profile: ${profile.name} | budget updated for ${bulkUpdates.length} SB campaigns.`,
        log_type: "info",
      });

  } catch (err) {
    cron_logs({
      message: `Campaign budget update failed - ${err}`,
      log_type: "error",
    });
  }
};

async function sponsoredBrandBudgetDayparting({ rule, profile, campaignIds, activeSlot, now, history }) {
  const budgetThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "budgetRuleSetting");

  const currentDate = now.format("YYYY-MM-DD");
  const pipeline = [
    {
      $match: {
        campaignId: { $in: campaignIds },
        profileId: rule.profileId,
        configId: rule.configId,
        reportDate: currentDate,
        status: { $nin: ["PAUSED", "ARCHIVED"] }
      }
    },
  ];

  const campaignList = await sbCampaignsSchema.aggregate(pipeline);
  if (!campaignList.length) return { sbExecutionState: null, baseSBBudget: null, apliedSBBudget: null, isSBReverted: false };

  /* ---------- BASE PLACEMENT MAP ---------- */
  const baseBudget = {};
  campaignList.forEach(cp => {
    if (cp.campaignId && !isNaN(cp.budget)) {
      baseBudget[cp.campaignId] = Number(cp.budget);
    }
  });

  /* ---------- SLOT CHANGED ---------- */
  if (activeSlot && history && history.slotIndex !== activeSlot.slotIndex) {

    let appliedBudget = {};
    if (campaignList.length > 0) {

      if (activeSlot.multiplier === 1) {
        await updateSBCampaignBudgetInternal(profile, rule, campaignList, history?.baseBudget?.SB, currentDate);
      } else {
        Object.entries(history.baseBudget.SB).forEach(([k, v]) => {
          if (campaignList.filter(r => r.campaignId == k)?.length > 0) {
            appliedBudget[k] = applyMinMax(Number((v * activeSlot.multiplier).toFixed(2)), budgetThreshold?.minBudget, budgetThreshold?.maxBudget);
          }
        });

        await updateSBCampaignBudgetInternal(profile, rule, campaignList, appliedBudget, currentDate);
      }

    }

    return {
      sbExecutionState: "APPLIED",
      baseSBBudget: history?.baseBudget?.SB,
      baseAppliedSBBudget: history?.appliedBudget?.SB,
      apliedSBBudget: appliedBudget,
      isSBReverted: true
    }
  }

  /* ---------- FIRST APPLY ---------- */
  else if (activeSlot && !history && campaignList.length > 0) {

    // 1️⃣ Apply new slot budget
    const appliedBudget = {};
    Object.entries(baseBudget).forEach(([k, v]) => {
      if (campaignList.filter(r => r.campaignId == k)?.length > 0) {
        appliedBudget[k] = applyMinMax(Number((v * activeSlot.multiplier).toFixed(2)), budgetThreshold?.minBudget, budgetThreshold?.maxBudget);
      }
    });

    if (activeSlot.multiplier !== 1) {
      await updateSBCampaignBudgetInternal(profile, rule, campaignList, appliedBudget, currentDate);
    }

    return {
      sbExecutionState: "APPLIED",
      baseSBBudget: baseBudget,
      baseAppliedSBBudget: baseBudget,
      apliedSBBudget: appliedBudget,
      isSBReverted: false
    }

  }

  /* ---------- SLOT ENDED (REVERT) ---------- */
  else if (!activeSlot && history) {
    if (history.multiplier !== 1 && history.multiplier !== 0) {
      await updateSBCampaignBudgetInternal(profile, rule, campaignList, history.baseBudget.SB, currentDate);
    }
    return {
      sbExecutionState: null,
      isSBReverted: true
    }
  }

  return {
    sbExecutionState: history?.executionState ?? null,
    baseSBBudget: history?.baseBudget?.SB ?? null,
    baseAppliedSBBudget: history?.baseBudget?.SB ?? null,
    apliedSBBudget: history?.appliedBudget?.SB ?? null,
    isSBReverted: false
  }

}


const updateSDCampaignBudgetInternal = async (profile, rule, campaignList, campaignMap, reportDate) => {
  const checkConfigAds = await getAccessToken(rule?.configId);

  const campaignIdSet = new Set(campaignList.map(c => c.campaignId));
  const campaignIds = Array.from(campaignIdSet);
  try {
    /* ---------- AMAZON API ---------- */
    const campaignsPayload = campaignIds.map(campaignId => ({
      campaignId: String(campaignId),
      budget: campaignMap[campaignId],
    }));

    if (!campaignsPayload.length) return;

    const { successfulItems } = await processBatchUpdates({
      updates: campaignsPayload,
      entityType: "SD_CAMPAIGNS",
      profile,
      checkConfigAds,
      configId: profile.configId,
    });

    const successIds = new Set(successfulItems.map(c => String(c.campaignId)));
    if (successIds.size === 0) return;

      const existingCampaigns = await sdCampaignsSchema.find({ campaignId: { $in: campaignIds }, reportDate }).lean();

      const oldValueMap = {};
      existingCampaigns.forEach(cp => {
        if (cp.campaignId && !isNaN(cp.budget)) {
          oldValueMap[cp.campaignId] = Number(cp.budget);
        }
      });

      const historyDocs = [];
      const bulkUpdates = [];

      for (const [campaignId] of Object.entries(campaignMap)) {

        // 🔹 Skip if Amazon rejected this campaign
        if (successIds.size > 0 && !successIds.has(String(campaignId))) continue;

        const oldValue = oldValueMap[campaignId];
        const newValue = campaignMap[campaignId]

        // 🔹 Skip if no change
        if (Number(oldValue) === Number(newValue)) continue;

        /* ---------- HISTORY ---------- */
        historyDocs.push({
          configId: rule?.configId,
          profileId: profile?.profileId,
          changeLevel: campaignId,
          changeType: "Cron Job: Dayparting rule updated Budget",
          oldValue,
          newValue,
          updatedFrom: "Campaign",
          source: "DAYPARTING",
          userId: rule?.userId,
          type: "SD"
        });

        /* ---------- DB UPDATE ---------- */
        bulkUpdates.push({
          updateMany: {
            filter: {
              campaignId: Number(campaignId),
              reportDate
            },
            update: { $set: { budget: newValue } },
          },
        });

      }

      /* ---------- EXECUTE WRITES ---------- */
      if (historyDocs.length) {
        await safeInsertHistoryDocs(historyDocs);
      }

      if (bulkUpdates.length) {
        await sdCampaignsSchema.bulkWrite(bulkUpdates);
      }

      cron_logs({
        message: `Dayparting Rule | Profile: ${profile.name} | budget updated for ${bulkUpdates.length} SD campaigns.`,
        log_type: "info",
      });

  } catch (err) {
    cron_logs({
      message: `Campaign budget update failed - ${err}`,
      log_type: "error",
    });
  }
};

async function sponsoredDisplayBudgetDayparting({ rule, profile, campaignIds, activeSlot, now, history }) {
  const budgetThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "budgetRuleSetting");

  const currentDate = now.format("YYYY-MM-DD");
  const pipeline = [
    {
      $match: {
        campaignId: { $in: campaignIds },
        profileId: rule.profileId,
        configId: rule.configId,
        reportDate: currentDate,
        status: { $nin: ["PAUSED", "ARCHIVED"] }
      }
    },
  ];

  const campaignList = await sdCampaignsSchema.aggregate(pipeline);
  if (!campaignList.length) return { sdExecutionState: null, baseSDBudget: null, apliedSDBudget: null, isSDReverted: false };

  /* ---------- BASE PLACEMENT MAP ---------- */
  const baseBudget = {};
  campaignList.forEach(cp => {
    if (cp.campaignId && !isNaN(cp.budget)) {
      baseBudget[cp.campaignId] = Number(cp.budget);
    }
  });

  /* ---------- SLOT CHANGED ---------- */
  if (activeSlot && history && history.slotIndex !== activeSlot.slotIndex) {

    let appliedBudget = {};
    if (campaignList.length > 0) {

      if (activeSlot.multiplier === 1) {
        await updateSDCampaignBudgetInternal(profile, rule, campaignList, history?.baseBudget?.SD, currentDate);
      } else {
        Object.entries(history.baseBudget.SD).forEach(([k, v]) => {
          if (campaignList.filter(r => r.campaignId == k)?.length > 0) {
            appliedBudget[k] = applyMinMax(Number((v * activeSlot.multiplier).toFixed(2)), budgetThreshold?.minBudget, budgetThreshold?.maxBudget);
          }
        });

        await updateSDCampaignBudgetInternal(profile, rule, campaignList, appliedBudget, currentDate);
      }

    }

    return {
      sdExecutionState: "APPLIED",
      baseSDBudget: history.baseBudget.SD,
      baseAppliedSDBudget: history?.appliedBudget?.SD,
      apliedSDBudget: appliedBudget,
      isSDReverted: true
    }
  }

  /* ---------- FIRST APPLY ---------- */
  else if (activeSlot && !history && campaignList.length > 0) {

    const appliedBudget = {};
    Object.entries(baseBudget).forEach(([k, v]) => {
      if (campaignList.filter(r => r.campaignId == k)?.length > 0) {
        appliedBudget[k] = applyMinMax(Number((v * activeSlot.multiplier).toFixed(2)), budgetThreshold?.minBudget, budgetThreshold?.maxBudget);
      }
    });

    if (activeSlot.multiplier !== 1) {
      await updateSDCampaignBudgetInternal(profile, rule, campaignList, appliedBudget, currentDate);
    }

    return {
      sdExecutionState: "APPLIED",
      baseSDBudget: baseBudget,
      baseAppliedSDBudget: baseBudget,
      apliedSDBudget: appliedBudget,
      isSDReverted: false
    }

  }

  /* ---------- SLOT ENDED (REVERT) ---------- */
  else if (!activeSlot && history) {
    if (history.multiplier !== 1 && history.multiplier !== 0) {
      await updateSDCampaignBudgetInternal(profile, rule, campaignList, history.baseBudget.SD, currentDate);
    }
    return {
      sdExecutionState: null,
      isSDReverted: true
    }
  }

  return {
    sdExecutionState: history?.executionState ?? null,
    baseSDBudget: history?.baseBudget?.SD ?? null,
    baseAppliedSDBudget: history?.baseBudget?.SD ?? null,
    apliedSDBudget: history?.appliedBudget?.SD ?? null,
    isSDReverted: false
  }

}

async function handleBudgetDayparting({ rule, profile, activeSlot, now }) {

  /* ---------- FETCH HISTORY ---------- */
  const history = await daypartingRuleHistorySchema.findOne({
    ruleId: rule._id,
    executionState: { $in: ["PENDING", "APPLIED"] },
  });

  const { spExecutionState, baseSPBudget, baseAppliedSPBudget, apliedSPBudget, isSPReverted } = await sponsoredProductBudgetDayparting({ rule, profile, campaignIds: rule.campaignIds.SP, activeSlot, now, history });
  const { sbExecutionState, baseSBBudget, baseAppliedSBBudget, apliedSBBudget, isSBReverted } = await sponsoredBrandBudgetDayparting({ rule, profile, campaignIds: rule.campaignIds.SB, activeSlot, now, history });
  const { sdExecutionState, baseSDBudget, baseAppliedSDBudget, apliedSDBudget, isSDReverted } = await sponsoredDisplayBudgetDayparting({ rule, profile, campaignIds: rule.campaignIds.SD, activeSlot, now, history });

  if (isSPReverted || isSBReverted || isSDReverted) {
    history.executionState = "REVERTED";
    history.revertedAt = now.toDate();
    await history.save();
  }
  if ((spExecutionState || sbExecutionState || sdExecutionState) && (!history || (activeSlot && history.slotIndex !== activeSlot.slotIndex)) && (activeSlot?.multiplier !== 1)) {
    const baseBudget = {
      SP: baseSPBudget,
      SB: baseSBBudget,
      SD: baseSDBudget
    }
    const baseAppliedBudget = {
      SP: baseAppliedSPBudget,
      SB: baseAppliedSBBudget,
      SD: baseAppliedSDBudget
    }
    const appliedBudget = {
      SP: apliedSPBudget,
      SB: apliedSBBudget,
      SD: apliedSDBudget
    }

    await daypartingRuleHistorySchema.create({
      ruleId: rule._id,
      configId: rule.configId,
      profileId: rule.profileId,
      slotIndex: activeSlot.slotIndex,
      startTime: activeSlot.startTime,
      endTime: activeSlot.endTime,
      multiplier: activeSlot.multiplier,
      baseBudget,
      baseAppliedBudget,
      appliedBudget,
      executionState: spExecutionState || sbExecutionState || sdExecutionState,
    });

  }

}

const updateSPPlacementModifierInternal = async (profile, rule, PlacementList, placementMap, reportDate) => {
  const checkConfigAds = await getAccessToken(rule?.configId);

  const campaignIdSet = new Set(PlacementList.map(c => c.campaignId));
  const campaignIds = Array.from(campaignIdSet);

  const getAmazonPlacement = (placement) => {
    if (placement === "Top of Search") return "PLACEMENT_TOP";
    if (placement === "Rest of Search") return "PLACEMENT_REST_OF_SEARCH";
    if (placement === "Product pages") return "PLACEMENT_PRODUCT_PAGE";
    else return null
  }

  try {
    /* ---------- AMAZON API ---------- */
    const campaignsPayload = campaignIds.filter(campaignId => placementMap[campaignId])
      .map(campaignId => ({
        campaignId: String(campaignId),
        dynamicBidding: {
          placementBidding: Object.entries(placementMap[campaignId]).map(([placement, modifier]) => ({
            placement: getAmazonPlacement(placement),
            percentage: modifier,
          })).filter(p => p.placement !== null),
        },
      }));

    if (!campaignsPayload.length) return;

    const { successfulItems } = await processBatchUpdates({
      updates: campaignsPayload,
      entityType: "SP_CAMPAIGNS",
      profile,
      checkConfigAds,
      configId: profile.configId,
    });

    const successCampaignIds = new Set(successfulItems.map(c => String(c.campaignId)));
    if (successCampaignIds.size === 0) return;

    const existingPlacements = await placementSchema.find({ campaignId: { $in: campaignIds }, reportDate }).lean();

    const oldValueMap = {};
    existingPlacements.forEach(p => {
      if (!oldValueMap[p.campaignId]) oldValueMap[p.campaignId] = {};
      oldValueMap[p.campaignId][p.placement] = Number(p.placementModifier);
    });

    const historyDocs = [];
    const bulkUpdates = [];

    for (const [campaignId, placements] of Object.entries(placementMap)) {
      if (!successCampaignIds.has(String(campaignId))) continue;
        for (const [placement, newValue] of Object.entries(placements)) {

          const oldValue = oldValueMap?.[campaignId]?.[placement];

          if (Number(oldValue) === Number(newValue)) continue;

          /* ---------- HISTORY ---------- */
          historyDocs.push({
            configId: rule?.configId,
            profileId: profile?.profileId,
            changeLevel: campaignId,
            changeType: "Cron Job: Dayparting rule updated placement",
            placement,
            oldValue,
            newValue,
            updatedFrom: "Placement",
            source: "DAYPARTING",
            userId: rule?.userId,
            type: "SP"
          });

          /* ---------- DB UPDATE ---------- */
          bulkUpdates.push({
            updateMany: {
              filter: { campaignId, placement, reportDate },
              update: { $set: { placementModifier: newValue } },
            },
          });
        }
      }

      /* ---------- EXECUTE WRITES ---------- */
      if (historyDocs.length) {
        await safeInsertHistoryDocs(historyDocs);
      }

      if (bulkUpdates.length) {
        await placementSchema.bulkWrite(bulkUpdates);
      }

      cron_logs({
        message: `Dayparting Rule | Profile ${profile.name} placement modifiers updated`,
        log_type: "info",
      });

  } catch (err) {
    cron_logs({
      message: `Placement modifier update failed - ${err}`,
      log_type: "error",
    });
  }
};

async function sponsoredProductPlacementDayparting({ rule, profile, campaignIds, activeSlot, now, history }) {
  const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "placementRuleSetting");

  const currentDate = now.format("YYYY-MM-DD");
  const pipeline = [
    {
      $match: {
        campaignId: { $in: campaignIds },
        profileId: rule.profileId,
        configId: rule.configId,
        reportDate: currentDate,
        campaignStatus: { $nin: ["PAUSED", "ARCHIVED"] },
      },
    },
  ];

  const placementList = await placementSchema.aggregate(pipeline);
  if (!placementList.length) {
    return {
      spExecutionState: null,
      baseSPPlacementBid: {},
      baseAppliedSPPlacementBid: {},
      appliedSPPlacementBid: {},
      isSPReverted: false
    };
  }

  const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate);
  const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
  const eligiblePlacement = placementList.filter(c => !lowStockIds.has(c.campaignId));

  /* ---------- BASE PLACEMENT MAP ---------- */
  const basePlacementMap = {};
  placementList.forEach(p => {
    if (p?.placement && p?.placementModifier !== undefined) {
      if (!basePlacementMap[p.campaignId]) basePlacementMap[p.campaignId] = {};
      basePlacementMap[p?.campaignId][p.placement] = Number(p.placementModifier);
    }
  });

  /* ---------- SLOT CHANGE ---------- */
  if (activeSlot && history && history.slotIndex !== activeSlot.slotIndex) {

    let appliedPlacementMap = {};
    if (eligiblePlacement.length > 0) {

      if (activeSlot.multiplier === 1) {
        await updateSPPlacementModifierInternal(profile, rule, eligiblePlacement, history?.basePlacementBid?.SP, currentDate);
      } else {
        Object.entries(history.basePlacementBid.SP).forEach(([campaignId, placements]) => {
          if (eligiblePlacement.filter(r => r.campaignId == campaignId)?.length > 0) {
            appliedPlacementMap[campaignId] = {};

            Object.entries(placements).forEach(([placement, bid]) => {
              appliedPlacementMap[campaignId][placement] = applyMinMax(Number((bid * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid);
            });
          }
        });

        await updateSPPlacementModifierInternal(profile, rule, eligiblePlacement, appliedPlacementMap, currentDate);
      }
    }

    return {
      spExecutionState: "APPLIED",
      baseSPPlacementBid: history?.basePlacementBid?.SP,
      baseAppliedSPPlacementBid: history?.appliedPlacementBid?.SP,
      appliedSPPlacementBid: appliedPlacementMap,
      isSPReverted: true
    }

  }
  else if (activeSlot && !history && eligiblePlacement.length > 0) {

    const appliedPlacementMap = {};
    Object.entries(basePlacementMap).forEach(([campaignId, placements]) => {
      if (eligiblePlacement.filter(r => r.campaignId == campaignId)?.length > 0) {
        appliedPlacementMap[campaignId] = {};

        Object.entries(placements).forEach(([placement, bid]) => {
          appliedPlacementMap[campaignId][placement] = applyMinMax(Number((bid * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid);
        });
      }
    });

    if (activeSlot.multiplier !== 1) {
      await updateSPPlacementModifierInternal(profile, rule, eligiblePlacement, appliedPlacementMap, currentDate);
    }

    return {
      spExecutionState: "APPLIED",
      baseSPPlacementBid: basePlacementMap,
      baseAppliedSPPlacementBid: basePlacementMap,
      appliedSPPlacementBid: appliedPlacementMap,
      isSPReverted: false
    }

  }
  else if (!activeSlot && history) {
    if (history.multiplier !== 1 && history.multiplier !== 0) {
      await updateSPPlacementModifierInternal(profile, rule, placementList, history.basePlacementBid.SP, currentDate);
    }
    return {
      spExecutionState: null,
      isSPReverted: true
    }
  }

  return {
    spExecutionState: history?.executionState ?? null,
    baseSPPlacementBid: history?.basePlacementBid?.SP ?? null,
    baseAppliedSPPlacementBid: history?.basePlacementBid?.SP ?? null,
    appliedSPPlacementBid: history?.appliedPlacementBid?.SP ?? null,
    isSPReverted: false
  }

}

const updateSBPlacementModifierInternal = async (profile, rule, PlacementList, placementMap, reportDate) => {
  const checkConfigAds = await getAccessToken(rule?.configId);

  const campaignIdSet = new Set(PlacementList.map(c => c.campaignId));
  const campaignIds = Array.from(campaignIdSet);

  const getAmazonPlacement = (placement) => {
    if (placement === "Top of Search") return "TOP_OF_SEARCH";
    if (placement === "Rest of Search") return "OTHER";
    if (placement === "Product pages") return "DETAIL_PAGE";
    else return null
  }

  try {
    /* ---------- AMAZON API ---------- */
    const campaignsPayload = campaignIds.filter(campaignId => placementMap[campaignId])
      .map(campaignId => ({
        campaignId: String(campaignId),
        bidding: {
          bidOptimization: false,
          bidAdjustmentsByPlacement: Object.entries(placementMap[campaignId]).map(([placement, modifier]) => ({
            placement: getAmazonPlacement(placement),
            percentage: modifier,
          })).filter(p => p.placement !== null),
        },
      }));

    if (!campaignsPayload.length) return;

    const { successfulItems } = await processBatchUpdates({
      updates: campaignsPayload,
      entityType: "SB_CAMPAIGNS",
      profile,
      checkConfigAds,
      configId: profile.configId,
    });

    const successCampaignIds = new Set(successfulItems.map(c => String(c.campaignId)));
    if (successCampaignIds.size === 0) return;

    const existingPlacements = await sbPlacementSchema.find({ campaignId: { $in: campaignIds }, reportDate }).lean();

    const oldValueMap = {};
    existingPlacements.forEach(p => {
      if (!oldValueMap[p.campaignId]) oldValueMap[p.campaignId] = {};
      oldValueMap[p.campaignId][p.placement] = Number(p.placementModifier);
    });

    const historyDocs = [];
    const bulkUpdates = [];

    for (const [campaignId, placements] of Object.entries(placementMap)) {
      if (!successCampaignIds.has(String(campaignId))) continue;
        for (const [placement, newValue] of Object.entries(placements)) {

          const oldValue = oldValueMap?.[campaignId]?.[placement];

          if (Number(oldValue) === Number(newValue)) continue;

          /* ---------- HISTORY ---------- */
          historyDocs.push({
            configId: rule?.configId,
            profileId: profile?.profileId,
            changeLevel: campaignId,
            changeType: "Cron Job: Dayparting rule updated placement",
            placement,
            oldValue,
            newValue,
            updatedFrom: "Placement",
            source: "DAYPARTING",
            userId: rule?.userId,
            type: "SB"
          });

          /* ---------- DB UPDATE ---------- */
          bulkUpdates.push({
            updateMany: {
              filter: { campaignId, placement, reportDate },
              update: { $set: { placementModifier: newValue } },
            },
          });
        }
      }

      /* ---------- EXECUTE WRITES ---------- */
      if (historyDocs.length) {
        await safeInsertHistoryDocs(historyDocs);
      }

      if (bulkUpdates.length) {
        await sbPlacementSchema.bulkWrite(bulkUpdates);
      }

      cron_logs({
        message: `Dayparting Rule | Profile ${profile.name} placement modifiers updated`,
        log_type: "info",
      });

  } catch (err) {
    cron_logs({
      message: `Placement modifier update failed - ${err}`,
      log_type: "error",
    });
  }
};

async function sponsoredBrandPlacementDayparting({ rule, profile, campaignIds, activeSlot, now, history }) {
  const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "placementRuleSetting");

  const currentDate = now.format("YYYY-MM-DD");
  const pipeline = [
    {
      $match: {
        campaignId: { $in: campaignIds },
        profileId: rule.profileId,
        configId: rule.configId,
        reportDate: currentDate,
        campaignStatus: { $nin: ["PAUSED", "ARCHIVED"] },
      },
    },
  ];

  const placementList = await sbPlacementSchema.find({ profileId: rule.profileId, reportDate: currentDate, campaignId: { $in: campaignIds }, status: { $nin: ["PAUSED", "ARCHIVED"] } }).lean();
  if (!placementList.length) {
    return {
      sbExecutionState: null,
      baseSBPlacementBid: {},
      baseAppliedSBPlacementBid: {},
      appliedSBPlacementBid: {},
      isSBReverted: false
    };
  }

  /* ---------- BASE PLACEMENT MAP ---------- */
  const basePlacementMap = {};
  placementList.forEach(p => {
    if (p?.placement && p?.placementModifier !== undefined) {
      if (!basePlacementMap[p.campaignId]) basePlacementMap[p.campaignId] = {};
      basePlacementMap[p?.campaignId][p.placement] = Number(p.placementModifier);
    }
  });

  /* ---------- SLOT CHANGE ---------- */
  if (activeSlot && history && history.slotIndex !== activeSlot.slotIndex) {

    let appliedPlacementMap = {};
    if (placementList.length > 0) {

      if (activeSlot.multiplier === 1) {
        await updateSBPlacementModifierInternal(profile, rule, placementList, history?.basePlacementBid?.SB, currentDate);
      } else {
        Object.entries(history.basePlacementBid.SB).forEach(([campaignId, placements]) => {
          if (placementList.filter(r => r.campaignId == campaignId)?.length > 0) {
            appliedPlacementMap[campaignId] = {};

            Object.entries(placements).forEach(([placement, bid]) => {
              appliedPlacementMap[campaignId][placement] = applyMinMax(Number((bid * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid);
            });
          }
        });

        await updateSBPlacementModifierInternal(profile, rule, placementList, appliedPlacementMap, currentDate);
      }
    }

    return {
      sbExecutionState: "APPLIED",
      baseSBPlacementBid: history?.basePlacementBid?.SB,
      baseAppliedSBPlacementBid: history?.appliedPlacementBid?.SB,
      appliedSBPlacementBid: appliedPlacementMap,
      isSBReverted: true
    }

  }
  else if (activeSlot && !history && placementList.length > 0) {

    const appliedPlacementMap = {};
    Object.entries(basePlacementMap).forEach(([campaignId, placements]) => {
      if (placementList.filter(r => r.campaignId == campaignId)?.length > 0) {
        appliedPlacementMap[campaignId] = {};

        Object.entries(placements).forEach(([placement, bid]) => {
          appliedPlacementMap[campaignId][placement] = applyMinMax(Number((bid * activeSlot.multiplier).toFixed(2)), bidThreshold?.minBid, bidThreshold?.maxBid);
        });
      }
    });

    if (activeSlot.multiplier !== 1) {
      await updateSBPlacementModifierInternal(profile, rule, placementList, appliedPlacementMap, currentDate);
    }

    return {
      sbExecutionState: "APPLIED",
      baseSBPlacementBid: basePlacementMap,
      baseAppliedSBPlacementBid: basePlacementMap,
      appliedSBPlacementBid: appliedPlacementMap,
      isSBReverted: false
    }

  }
  else if (!activeSlot && history) {
    if (history.multiplier !== 1 && history.multiplier !== 0) {
      await updateSBPlacementModifierInternal(profile, rule, placementList, history.basePlacementBid.SB, currentDate);
    }
    return {
      sbExecutionState: null,
      isSBReverted: true
    }
  }

  return {
    sbExecutionState: history?.executionState ?? null,
    baseSBPlacementBid: history?.basePlacementBid?.SB ?? null,
    baseAppliedSBPlacementBid: history?.basePlacementBid?.SB ?? null,
    appliedSBPlacementBid: history?.appliedPlacementBid?.SB ?? null,
    isSBReverted: false
  }

}

async function handlePlacementDayparting({ rule, profile, campaignIds, activeSlot, now }) {
  /* ---------- FETCH HISTORY ---------- */
  const history = await daypartingRuleHistorySchema.findOne({
    ruleId: rule._id,
    executionState: { $in: ["PENDING", "APPLIED"] },
  });

  const { spExecutionState, baseSPPlacementBid, baseAppliedSPPlacementBid, appliedSPPlacementBid, isSPReverted } = await sponsoredProductPlacementDayparting({ rule, profile, campaignIds: rule.campaignIds.SP, activeSlot, now, history });
  const { sbExecutionState, baseSBPlacementBid, baseAppliedSBPlacementBid, appliedSBPlacementBid, isSBReverted } = await sponsoredBrandPlacementDayparting({ rule, profile, campaignIds: rule.campaignIds.SB, activeSlot, now, history });

  if (isSPReverted || isSBReverted) {
    history.executionState = "REVERTED";
    history.revertedAt = now.toDate();
    await history.save();
  }
  if ((spExecutionState || sbExecutionState) && (!history || (activeSlot && history.slotIndex !== activeSlot.slotIndex)) && (activeSlot?.multiplier !== 1)) {
    const basePlacementBid = {
      SP: baseSPPlacementBid,
      SB: baseSBPlacementBid,
    }
    const baseAppliedPlacementBid = {
      SP: baseAppliedSPPlacementBid,
      SB: baseAppliedSBPlacementBid,
    }
    const appliedPlacementBid = {
      SP: appliedSPPlacementBid,
      SB: appliedSBPlacementBid,
    }

    await daypartingRuleHistorySchema.create({
      ruleId: rule._id,
      configId: rule.configId,
      profileId: rule.profileId,
      slotIndex: activeSlot.slotIndex,
      startTime: activeSlot.startTime,
      endTime: activeSlot.endTime,
      multiplier: activeSlot.multiplier,
      basePlacementBid,
      baseAppliedPlacementBid,
      appliedPlacementBid,
      executionState: spExecutionState || sbExecutionState,
    });

  }

}

exports.executeDaypartingRulesForProfile = async (profile, scheduledFor = new Date()) => {
  const now = moment(scheduledFor).tz(profile.timezone);
  const currentDate = now.format("YYYY-MM-DD");
  const currentHour = now.hour();

  const rules = await daypartingRuleSchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    status: "ACTIVE"
  }).lean();

  let executedCount = 0;
  if (rules?.length) {
    await Promise.all(
      rules?.map(async (rule) => {

        let activeSlot = getActiveSlot(rule.slots, currentHour);
        if (activeSlot) {
          const isMultiplierDefault = rule.bidChangeType === "MULTIPLIER" && activeSlot.multiplier === 1;
          const isPercentageDefault = rule.bidChangeType === "PERCENTAGE" && activeSlot.multiplier === 0;
          if (isMultiplierDefault || isPercentageDefault) {
            activeSlot = null;
          }
        }

        switch (rule.type) {

          /* ================= BUDGETS ================= */
          case "BUDGETS":
            await handleBudgetDayparting({ rule, profile, activeSlot, now });
            executedCount++;
            break;

          /* ================= TARGETS ================= */
          case "TARGETS":
            await handleTargetingDayparting({ rule, profile, activeSlot, now });
            executedCount++;
            break;

          /* ================= PLACEMENTS ================= */
          case "PLACEMENTS":
            await handlePlacementDayparting({ rule, profile, activeSlot, now });
            executedCount++;
            break;

          /* ================= KEYWORDS ================= */
          case "KEYWORDS":
            await handleTargetingDayparting({ rule, profile, activeSlot, now });
            executedCount++;
            break;

          default:
            cron_logs({
              message: `Unknown rule type ${rule.type}`,
              log_type: "error",
            });
        }

        return;

      })
    );
  }

  await cronJobHistorySchema.findOneAndUpdate(
    {
      configId: profile.configId,
      profileId: profile.profileId,
      cronName: "Dayparting Rule Schedules",
      historyDate: currentDate,
    },
    {
      $set: { status: "COMPLETED", }
    },
    { new: true, upsert: true }
  ).lean();

  return {
    success: true,
    totalRulesEvaluated: rules?.length || 0,
    executedCount,
  };
};

exports.cronDaypartingRule = async () => {
  cron_logs({
    message: `cronDaypartingRule`,
    log_type: "info",
  });

  try {
    const profiles = await getActivePlanProfiles();
    if (!profiles?.length) return;
    await Promise.all(
      profiles.map((profile) =>
        limit(async () => {
          try {
            await exports.executeDaypartingRulesForProfile(profile);
          } catch (err) {
            cron_logs({
              message: `Error executing dayparting rules for profile ${profile.name}: ${err.message}`,
              log_type: "error",
            });
          }
        })
      )
    );

    return cron_logs({
      message: `Dayparting cron executed successfully`,
      log_type: "info",
    });

  } catch (error) {
    cron_logs({
      message: `Cron failed: ${error.message}`,
      log_type: "error",
    });
  }
};

exports.ruleHistory = async (req, res) => {
  const configId = req?.config?.configId;
  let { profileId, pageNo, perPage, search, fromDate, toDate, affectedFilter } = req.body;
  try {
    if (!profileId) {
      return res.status(203).send({ isSuccess: false, message: "Profile id required!" });
    }
    pageNo = pageNo ? pageNo : 1;
    perPage = perPage ? perPage : 10;

    let query = {
      configId: new mongoose.Types.ObjectId(configId),
      profileId: Number(profileId),
      executedAt: { $gte: new Date(fromDate), $lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)) }
    };

    const pipeline = [
      { $match: query },
      { $sort: { executedAt: -1 } },
      {
        $lookup: {
          from: "daypartingrules",
          localField: "ruleId",
          foreignField: "_id",
          as: "rule"
        }
      },
      {
        $unwind: {
          path: "$rule",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          ...(search ? { "rule.name": { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } } : {})
        }
      },
      {
        $project: {
          ruleName: { $ifNull: ["$rule.name", "Deleted Rule"] },
          bidChangeType: "$rule.bidChangeType",
          executionState: 1,
          executedAt: 1,
          slotIndex: 1,
          startTime: 1,
          endTime: 1,
          multiplier: 1,
          baseBudget: "$baseAppliedBudget",
          appliedBudget: 1,
          baseTargetingBid: "$baseAppliedTargetingBid",
          appliedTargetingBid: 1,
          basePlacementBid: "$baseAppliedPlacementBid",
          appliedPlacementBid: 1,
          error: 1
        }
      },
    ];

    if (affectedFilter && affectedFilter !== "ALL") {
      const isAffected = String(affectedFilter).toUpperCase() === "AFFECTED";
      pipeline.push({
        $match: isAffected
          ? {
              appliedBudget: { $exists: true, $ne: null },
              $expr: { $gt: [{ $size: { $objectToArray: "$appliedBudget" } }, 0] }
            }
          : {
              $or: [
                { appliedBudget: { $exists: false } },
                { appliedBudget: null },
                { $expr: { $eq: [{ $size: { $objectToArray: { $ifNull: ["$appliedBudget", {}] } } }, 0] } }
              ]
            }
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $skip: perPage * (pageNo - 1) },
          { $limit: Number(perPage) }
        ],
        totalCount: [
          { $count: "count" }
        ]
      }
    });

    const result = await daypartingRuleHistorySchema.aggregate(pipeline);
    const getRules = result[0].data;
    const totalRecords = result[0].totalCount[0]?.count || 0;

    return res.status(200).send({
      isSuccess: true,
      message: "Dayparting Rules History listing successfully",
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      data: getRules,
    });

  } catch (error) {
      write_logs({ message: `[ruleHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.exportDaypartingRule = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, exportIds } = req.body;

    const query = { profileId, ...(configId && { configId }) };

    // ✅ Apply ruleIds filter if provided
    if (Array.isArray(exportIds) && exportIds?.length) {
      query._id = { $in: exportIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) };
    }

    const rules = await daypartingRuleSchema.find(query).lean();

    const workbook = new ExcelJS.Workbook();

    const metaSheet = workbook.addWorksheet("_META");
    const secretPayload = `DAYPARTING_RULE`;
    const signature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(secretPayload).digest("hex");
    metaSheet.getCell("A1").value = signature;
    metaSheet.state = "hidden";

    const sheet = workbook.addWorksheet("DaypartingRules");

    sheet.columns = [
      // { header: "Profile ID", key: "profileId", width: 18 },
      // { header: "Config ID", key: "configId", width: 18 },
      // { header: "User ID", key: "userId", width: 18 },

      { header: "Name", key: "name", width: 25 },
      { header: "Status", key: "status", width: 12 },

      { header: "Type", key: "type", width: 20 },
      { header: "Frequency", key: "frequency", width: 15 },

      { header: "Slot Type", key: "slotType", width: 20 },
      { header: "Bid Change Type", key: "bidChangeType", width: 20 },

      { header: "Campaign IDs", key: "campaignIds", width: 30 },

      { header: "Slots", key: "slots", width: 50 },
    ];

    // ✅ Normalize → Rows
    rules.forEach(rule => {
      sheet.addRow({
        // profileId: `${rule.profileId}`,
        // configId: rule.configId,
        // userId: rule.userId,

        name: rule.name,
        status: rule.status,

        type: rule.type,
        frequency: rule.frequency,

        slotType: rule.slotType,
        bidChangeType: rule.bidChangeType,

        campaignIds: JSON.stringify({ SP: [], SB: [], SD: [] }),

        slots: JSON.stringify(rule?.slots ?? []),
      });
    });

    // ✅ Styling
    sheet.eachRow((row) => { row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" } }) });
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => { cell.font = { bold: true } });
    headerRow.height = 25;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=DaypartingRules_${profileId}.xlsx`
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition"
    );

    await workbook.xlsx.write(res);
    return res.end();

  } catch (error) {
      write_logs({ message: `[exportDaypartingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error(error);
    return res.status(500).send({
      isSuccess: false,
      message: "Export failed",
      error: "An internal server error occurred",
    });
  }
};

exports.importDaypartingRule = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const configId = req?.config?.configId;
    const { profileId, duplicateAction } = req.body;
    const isReplace = duplicateAction === "replace";

    if (!req.file) {
      return res.status(203).send({
        isSuccess: false,
        message: "Excel file is required",
      });
    }

    const profile = await getProfile(configId, profileId);
    if (!profile) {
      return res.status(203).send({
        isSuccess: false,
        message: "Profile not found",
      });
    }

    const workbook = new ExcelJS.Workbook();
    const filePath = path.join(__dirname, "../../public/excelImportFiles", req?.file?.filename);

    await workbook.xlsx.readFile(filePath);

    const metaSheet = workbook.getWorksheet("_META");
    const expectedPayload = `DAYPARTING_RULE`;

    const storedSignature = metaSheet.getCell("A1").value;
    const expectedSignature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(expectedPayload).digest("hex");

    if (storedSignature !== expectedSignature) {
      return res.status(203).send({
        isSuccess: false,
        message: "Invalid file. Please upload a valid Dayparting Rule export file."
      });
    }

    const sheet = workbook.getWorksheet(2);
    if (!sheet) {
      return res.status(203).send({
        isSuccess: false,
        message: "Invalid Excel file",
      });
    }

    /** -----------------------------
     * 1️⃣ Collect rule names (skip header)
     * ----------------------------- */
    const ruleNames = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const name = row.getCell("A").value;
      if (name) ruleNames.push(name);
    });

    /** -----------------------------
     * 2️⃣ Fetch existing rules if SKIP
     * ----------------------------- */
    const existingRules = await daypartingRuleSchema.find({ configId, profileId, userId }, { _id: 1, slots: 1, type: 1 }).lean();

    /** -----------------------------
     * 3️⃣ Build bulk ops
     * ----------------------------- */
    const bulkOps = [];
    const errors = [];
    let skippedCount = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      try {
        const name = row.getCell("A").value;
        const type = row.getCell("C").value;
        const slots = safeJsonParse(row.getCell("H").value || "[]");

        if (!name || !slots.length || !type) {
          skippedCount++;
          return;
        }

        // Skip duplicate
        const matchedRule = checkDuplicateDaypartingRule(existingRules, slots, type);
        if (!isReplace && matchedRule) {
          skippedCount++;
          return;
        }

        const data = {
          profileId,
          configId,
          userId,

          name,
          status: row.getCell("B").value,

          type,
          frequency: row.getCell("D").value,

          slotType: row.getCell("E").value,
          bidChangeType: row.getCell("F").value,

          campaignIds: safeJsonParse(row.getCell("G").value || "{ SP: [], SB: [], SD: [] }"),

          slots,
        };

        // 🔁 Replace existing rule
        if (matchedRule && isReplace) {
          bulkOps.push({
            updateOne: {
              filter: { _id: matchedRule?._id },
              update: { $set: data },
            },
          });
        }
        // ➕ Insert new rule
        else if (!matchedRule) {
          bulkOps.push({
            insertOne: {
              document: data,
            },
          });
        }
      } catch (err) {
          write_logs({ message: `[importDaypartingRule Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        errors.push({
          row: rowNumber,
          message: err.message,
        });
      }
    });

    if (bulkOps.length) {
      await daypartingRuleSchema.bulkWrite(bulkOps);
    }

    return res.status(200).send({
      isSuccess: true,
      message: "Import completed",
      successCount: bulkOps.length,
      skippedCount,
      errorCount: errors.length,
      errors,
    });

  } catch (error) {
      write_logs({ message: `[importDaypartingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      isSuccess: false,
      message: "Import failed",
      error: "An internal server error occurred",
    });
  }
};