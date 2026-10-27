const { getConditionRows, captureManualSelection, prepareSnapshotBulkUpdates, updateSnapshotHistory } = require("../helpers/ruleConditionSnapshotHelper");
const { validateCampaignAssignment } = require("../helper/ruleCampaignAssignment");

const { sanitizeQueryObject } = require("../helper/sanitizeQuery");
const moment = require("moment-timezone");
const { retryWithBackoff } = require("../helper/retryHelper");
const crypto = require("crypto");

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const path = require('path');
const ExcelJS = require("exceljs");
const pLimit = require("p-limit").default;
const profileLimit = pLimit(Number(process.env.PROCESS_LIMIT) || 3);
const ruleLimit = pLimit(5);

const campaignSchema = require("../models/campaign.model");
const sbCampaignSchema = require("../models/sbCampaign.model");
const sdCampaignSchema = require("../models/sdCampaign.model");

const budgetRulesSchema = require("../models/budgetRules.model");
const campaignsSchema = require("../models/campaign.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const budgetRulesHistorySchema = require("../models/budgetRuleHistory.model");
const { logAudit } = require("../helpers/auditHelper");
const profileSchema = require("../models/profiles.model");
const affectedCampaignByRuleSchema = require("../models/affectedCampaignByRule.model");
const campaignProductEligibleStatusByRuleSchema = require("../models/campaignProductEligibleStatusByRule.model");
const sbCampaignsSchema = require("../models/sbCampaign.model");
const sdCampaignsSchema = require("../models/sdCampaign.model");
const ruleRunHistorySchema = require("../models/ruleRunHistory.model");
const ruleBlockedTimeSchema = require("../models/ruleBlockedTime.model");
const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");

const { campaignPipeline, sbCampaignPipeline, sdCampaignPipeline } = require("./campaign.controller");
const {
  getProfile,
  getAccessToken,
  getRuleDate,
  removeCampaignIdFromQuery,
  getActivePlanProfiles,
  getRuleSettings,
  safeJsonParse,
} = require("../helper/common");

const { checkCampaignProductAvailability } = require("../helper/checkEligibility");
const { recordRuleExecutionChange, enrichWithCampaignMetrics } = require("../helpers/ruleImpactMetricsHelper");
const { write_logs } = require("../../winston/budgetRules/logger");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const amazonAxios = require("../helper/amazonAxios");
const { processBatchUpdates } = require("../services/amazonBatchService");

function getActiveSlot(slots, hour) {
  if (!Array.isArray(slots) || slots.length === 0) return null;
  return slots.find((slot) => {
    const startHour = parseInt(slot.startTime.split(":")[0], 10);
    const endHour = parseInt(slot.endTime.split(":")[0], 10);
    if (endHour === 0 || endHour === 24) {
      return hour >= startHour && hour < 24;
    }
    return hour >= startHour && hour < endHour;
  });
}

exports.getCampaignsName = async (req, res) => {
  const profileId = req.body.profileId;
  const configId = req?.config?.configId;
  try {
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required.",
        isSuccess: false,
      });
    }

    const pipeline = [
      {
        $match: {
          profileId: Number(profileId),
          configId: new ObjectId(configId),
        },
      },
      {
        $sort: {
          reportDate: -1,
        },
      },
      {
        $group: {
          _id: {
            campaignId: "$campaignId",
          },
          campaign: {
            $first: "$$ROOT",
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: "$campaign",
        },
      },
      {
        $match: {
          status: {
            $in: ["ENABLED", "PAUSED"],
          },
        },
      },
      {
        $project: {
          campaignId: 1,
          name: 1,
          type: 1,
          status: 1,
          targetingType: 1,
          acos: 1,
          roas: 1,
          spend: 1,
          sales: 1,
          _id: 0,
        },
      },
    ]

    const spCampaign = await campaignsSchema.aggregate(pipeline);
    const sbCampaign = await sbCampaignsSchema.aggregate(pipeline);
    const sdCampaign = await sdCampaignsSchema.aggregate(pipeline);

    const getCampaigns = [...spCampaign, ...sbCampaign, ...sdCampaign];

    return res.status(200).send({
      message: "Campaigns Name listing successfully",
      data: getCampaigns,
      isSuccess: true,
    });
  } catch (error) {
    write_logs({ message: `[getCampaignsName Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.createRule = async (req, res) => {
  const configId = req?.config?.configId;
  const userId = req.user._id;
  const {
    profileId,
    ruleName,
    conditions,
    actionType,
    times,
    days,
    reportDate,
    toDate,
    ruleType,
    startDate,
    endDate,
    allowMultiTimeChanges,
    query,
    daysSinceCreation,
    isDaysSinceCreation,
    campaignIds,
    isHourlyBudget,
    isHourlyBid,
    hourlyConfig,
  } = req.body;
  try {
    const assignment = validateCampaignAssignment(req.body.campaignIds);
    if (assignment.error) return res.status(400).send({ isSuccess: false, message: assignment.error });

    const getAccount = await getProfile(configId, profileId);
    if (!getAccount) {
      return res
        .status(203)
        .send({ message: "Please select valid account!", isSuccess: false });
    }

    // const duplicationRule = await isDuplicateBudgetRule(configId, userId, profileId, conditions);
    // if (duplicationRule) {
    //   return res.status(203).send({
    //     isSuccess: false,
    //     message: "A rule with the same conditions already exists. Please modify the conditions to create a new rule.",
    //   });
    // }

    const createRule = await budgetRulesSchema({
      configId,
      userId,
      profileId,
      ruleName,
      conditions,
      actionType,
      days,
      times,
      reportDate,
      toDate,
      ruleType,
      startDate,
      query,
      endDate,
      allowMultiTimeChanges,
      daysSinceCreation,
      isDaysSinceCreation,
      isHourlyBudget: isHourlyBudget || isHourlyBid || false,
      isHourlyBid: isHourlyBid || false,
      hourlyConfig: (isHourlyBudget || isHourlyBid) ? hourlyConfig : undefined,
      campaignIds: assignment.campaignIds,
      countryCode: getAccount.countryCode,
      timezone: getAccount.timezone,
    });
    createRule
      .save()
      .then(async (rule) => {
        await logAudit("BUDGET_RULE_CREATION", `Created budget rule: ${rule.ruleName}`, {
          ruleName,
          conditions,
          actionType,
          days,
          times,
          ruleType,
          startDate,
          endDate,
          allowMultiTimeChanges,
          daysSinceCreation,
          reportDate,
          toDate,
        }, req?.user?.id);
        return res.status(200).send({
          isSuccess: true,
          message: "Budget Rule created successfully.",
          data: rule,
        });
      })
      .catch((error) => {
        write_logs({ message: `[createRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          message: "Something went wrong, please try again!",
          isSuccess: false,
          error: "An internal server error occurred",
        });
      });
  } catch (error) {
    write_logs({ message: `[createRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.updateRule = async (req, res) => {
  const configId = req?.config?.configId;
  const ruleId = req.params.ruleId;
  const userId = req.user._id;
  const { profileId, conditions } = req.body;

  try {

    // const duplicationRule = await isDuplicateBudgetRule(configId, userId, profileId, conditions, ruleId);
    // if (duplicationRule) {
    //   return res.status(203).send({
    //     isSuccess: false,
    //     message: "A rule with the same conditions already exists. Please modify the conditions to update the rule.",
    //   });
    // }

    const updateData = { ...req.body };
    delete updateData.userId;
    delete updateData.configId;
    delete updateData.profileId;
    delete updateData._id;
    delete updateData.isActive;

    await budgetRulesSchema
      .findOneAndUpdate({ _id: ruleId, ...(configId && { configId }) }, updateData, { new: true })
      .then(async (rule) => {
        if (!rule) {
          return res
            .status(203)
            .send({ message: "Rule not found!", isSuccess: false });
        }

        const spCampaigns = await campaignSchema.aggregate([
          { $match: { campaignId: { $in: rule?.campaignIds?.SP || [] } } },
          { $sort: { reportDate: -1 } },
          { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
        ]);

        const sbCampaigns = await sbCampaignSchema.aggregate([
          { $match: { campaignId: { $in: rule?.campaignIds?.SB || [] } } },
          { $sort: { reportDate: -1 } },
          { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
        ]);

        const sdCampaigns = await sdCampaignSchema.aggregate([
          { $match: { campaignId: { $in: rule?.campaignIds?.SD || [] } } },
          { $sort: { reportDate: -1 } },
          { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
        ]);

        const campaigns = {
          SponsoredProduct: spCampaigns.map(c => c.campaignName),
          SponsoredBrand: sbCampaigns.map(c => c.campaignName),
          SponsoredDisplay: sdCampaigns.map(c => c.campaignName),
        };

        await logAudit("BUDGET_RULE_UPDATE", `Updated budget rule: ${rule.ruleName}`, {
          ruleName: rule?.ruleName,
          conditions: rule?.conditions,
          actionType: rule?.actionType,
          days: rule?.days,
          times: rule?.times,
          ruleType: rule?.ruleType,
          startDate: rule?.startDate,
          endDate: rule?.endDate,
          allowMultiTimeChanges: rule?.allowMultiTimeChanges,
          daysSinceCreation: rule?.daysSinceCreation,
          reportDate: rule?.reportDate,
          toDate: rule?.toDate,
          campaigns,
        }, req?.user?.id);
        return res.status(200).send({
          message: "Rule updated successfully.",
          isSuccess: true,
        });
      })
      .catch((error) => {
        write_logs({ message: `[updateRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    write_logs({ message: `[updateRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.changeStatus = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { isActive, ids } = req.body;

    // Validation
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).send({
        message: "ids array is required",
        isSuccess: false,
      });
    }

    // Bulk update
    const result = await budgetRulesSchema.updateMany(
      { _id: { $in: ids }, ...(configId && { configId }) },
      { $set: { isActive: isActive } }
    );

    const updatedRules = await budgetRulesSchema.find({ _id: { $in: ids }, ...(configId && { configId }) }, "ruleName");
    const ruleNames = updatedRules.map(r => r.ruleName).join(", ");

    await logAudit("BUDGET_RULE_STATUS_CHANGE", `Budget rules ${ruleNames} ${isActive ? "enabled" : "disabled"}`, {
      ruleNames
    }, req?.user?.id);
    if (result.matchedCount === 0) {
      return res.status(203).send({
        message: "No rules found!",
        isSuccess: false,
      });
    }

    return res.status(200).send({
      message: "Status updated successfully.",
      isSuccess: true,
      updatedCount: result.modifiedCount,
      ruleNames,
    });

  } catch (error) {
    write_logs({ message: `[changeStatus Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const ruleId = req.params.ruleId;
    await budgetRulesSchema
      .findOneAndDelete({ _id: ruleId, ...(configId && { configId }) })
      .then(async (rule) => {
        if (!rule) {
          return res
            .status(203)
            .send({ message: "Rule not found!", isSuccess: false });
        }
        await logAudit("BUDGET_RULE_DELETION", `Deleted budget rule: ${rule.ruleName}`, {
          ruleName: rule?.ruleName,
        }, req?.user?.id);
        return res
          .status(200)
          .send({ message: "Rule deleted successfully.", isSuccess: true });
      })
      .catch((error) => {
        write_logs({ message: `[deleteRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    write_logs({ message: `[deleteRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getBudgetRules = async (req, res) => {
  const configId = req?.config?.configId;
  const userId = req?.user?._id;
  const profileId = req.body.profileId;
  const pageNo = req.body.pageNo ? req.body.pageNo : 1;
  const perPage = req.body.perPage ? req.body.perPage : 10;
  try {
    const pipeline = [
      {
        $match: {
          configId,
          profileId
        }
      },
      {
        $lookup: {
          from: "budgetruleshistories",
          localField: "_id",
          foreignField: "ruleId",
          as: "histories"
        }
      },
      {
        $addFields: {
          lastRunDate: {
            $arrayElemAt: [
              {
                $slice: [
                  {
                    $reverseArray:
                      "$histories.updatedAt"
                  },
                  1
                ]
              },
              0
            ]
          }
        }
      },
      {
        $addFields: {
          lastRun: {
            $dateToString: {
              date: "$lastRunDate",
              timezone: "$timezone",
              format: "%Y-%m-%d %H:%M:%S"
            }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          createdBy: "$user.email",
          userName: "$user.fullName"
        }
      },
      {
        $project: {
          user: 0,
          histories: 0 // optional, remove full history list
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: perPage * pageNo - perPage },
            { $limit: perPage }
          ],
          totalCount: [
            { $count: "count" }
          ],
          allRulesSchedule: [{ $project: { _id: 1, ruleName: 1, days: 1, times: 1, campaignIds: 1, isActive: 1, actionType: 1, conditions: 1, allowMultiTimeChanges: 1 } }],
        }
      }
    ];

    const result = await budgetRulesSchema.aggregate(pipeline);
    const getRules = result[0].data;
    const totalRecords = result[0].totalCount[0]?.count || 0;
    const allRulesSchedule = result[0].allRulesSchedule || [];
    const adminBlockedSchedule = await ruleBlockedTimeSchema.find().lean();

    return res.status(200).send({
      isSuccess: true,
      message: "Budget Rules listing successfully",
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      data: getRules,
      allRulesSchedule,
      adminBlockedSchedule,
    });
  } catch (error) {
    write_logs({ message: `[getBudgetRules Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getRule = async (req, res) => {
  const configId = req?.config?.configId;
  const _id = req.params.ruleId;
  try {
    const getRule = await budgetRulesSchema.findOne({ _id, ...(configId && { configId }) }).lean();
    return res.status(200).send({
      message: "Get Rule successfully",
      data: getRule,
      isSuccess: true,
    });
  } catch (error) {
    write_logs({ message: `[getRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.ruleHistory = async (req, res) => {
  const configId = req?.config?.configId;
  const userId = req.user._id;
  let { profileId, pageNo, perPage, search, fromDate, toDate, affectedFilter } = req.body;
  try {
    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }
    pageNo = Number(pageNo) || 1;
    perPage = Number(perPage) || 10;

    const query = {
      configId: configId,
      profileId: Number(profileId),
      ruleDate: { $gte: fromDate, $lte: toDate },
      ...(search && { ruleName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }),
    }
    const pipeline = [
      { $match: query },
      { $sort: { updatedAt: -1 } },
      {
        $lookup: {
          from: "budgetrules",           // 🔴 collection name
          localField: "ruleId",
          foreignField: "_id",
          as: "budgetRule"
        }
      },
      {
        $unwind: {
          path: "$budgetRule",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          $or: [
            { "budgetRule.userId": userId },
            { "budgetRule": { $exists: false } },
            { "budgetRule": null }
          ]
        }
      },
      {
        $addFields: {
          reportDate: "$budgetRule.reportDate",
          toDate: "$budgetRule.toDate",
          timezone: "$budgetRule.timezone",
          conditions: "$budgetRule.conditions",
        }
      },
      {
        $project: {
          affectedCampaigns: 0,
        }
      },
    ];

    if (affectedFilter && affectedFilter !== "ALL") {
      const isAffected = String(affectedFilter).toUpperCase() === "AFFECTED";
      pipeline.push(
        {
          $lookup: {
            from: "affectedcampaignbyrules",
            let: {
              ruleId: "$ruleId",
              ruleDate: "$ruleDate",
              ruleTime: "$ruleTime",
              profileId: "$profileId",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$profileId", "$$profileId"] },
                      { $eq: ["$ruleSchema", "BudgetRule"] },
                      { $eq: ["$ruleId", "$$ruleId"] },
                      { $eq: ["$ruleDate", "$$ruleDate"] },
                      { $eq: ["$ruleTime", "$$ruleTime"] }
                    ]
                  }
                }
              },
              { $limit: 1 },
              { $project: { _id: 1 } }
            ],
            as: "_affectedCheck"
          }
        },
        {
          $match: isAffected
            ? { "_affectedCheck.0": { $exists: true } }
            : { "_affectedCheck.0": { $exists: false } }
        },
        {
          $project: { _affectedCheck: 0 }
        }
      );
    }

    pipeline.push({
      $facet: {
          data: [
            { $skip: perPage * (pageNo - 1) },
            { $limit: perPage },
            {
              $lookup: {
                from: "affectedcampaignbyrules",
                let: {
                  ruleId: "$ruleId",
                  ruleDate: "$ruleDate",
                  ruleTime: "$ruleTime",
                  profileId: "$profileId",
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$profileId", "$$profileId"] },
                          { $eq: ["$ruleSchema", "BudgetRule"] },
                          { $eq: ["$ruleId", "$$ruleId"] },
                          { $eq: ["$ruleDate", "$$ruleDate"] },
                          { $eq: ["$ruleTime", "$$ruleTime"] }
                        ]
                      }
                    }
                  },
                  {
                    $project: {
                      _id: 1,
                      campaignId: 1,
                      name: 1,
                      oldValue: 1,
                      newValue: 1,
                      ruleDate: 1,
                      ruleTime: 1,
                      type: 1,
                      changed: 1,
                      isReverted: 1,
                      isActive: 1,
                      closedAt: 1,
                      impressions: 1,
                      clicks: 1,
                      spend: 1,
                      sales: 1,
                      orders: 1,
                      acos: 1,
                      roas: 1,
                      cpc: 1,
                      ctr: 1,
                    }
                  }
                ],
                as: "affectedCampaigns"
              }
            },
            {
              $lookup: {
                from: "campaignproducteligiblestatusbyrules",
                let: { ruleId: "$ruleId", ruleDate: "$ruleDate", profileId: "$profileId", configId: "$configId" },
                pipeline: [
                  {
                    $match: { $expr: { $and: [{ $eq: ["$ruleId", "$$ruleId"] }, { $eq: ["$ruleDate", "$$ruleDate"] }, { $eq: ["$profileId", "$$profileId"] }, { $eq: ["$configId", "$$configId"] }] } },
                  },
                  { $count: "count" },
                ],
                as: "lowProductStats",
              },
            }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      });

    const result = await budgetRulesHistorySchema.aggregate(pipeline);
    const getRules = await enrichWithCampaignMetrics(result[0].data, profileId, "BudgetRule");
    const totalRecords = result[0].totalCount[0]?.count || 0;
    return res.status(200).send({
      isSuccess: true,
      message: "Budget Rules History listing successfully",
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

const getTypeBasedRuleData = async (rule, type, model, capture = false) => {
  const hasExplicitCampaigns = (rule.campaignIds?.SP?.length > 0) || (rule.campaignIds?.SB?.length > 0) || (rule.campaignIds?.SD?.length > 0) || (Array.isArray(rule.campaignIds) && rule.campaignIds.length > 0);

  if (!hasExplicitCampaigns) {
    return [];
  }

  if (hasExplicitCampaigns && (!rule.campaignIds?.[type] || rule.campaignIds[type].length === 0)) {
    return [];
  }

  const campaignModel = type === "SB" ? sbCampaignsSchema : (type === "SD" ? sdCampaignsSchema : campaignsSchema);
  const activeCampaigns = await campaignModel.aggregate([
    {
      $match: {
        profileId: Number(rule.profileId),
        ...(rule.configId ? { configId: new ObjectId(rule.configId) } : {})
      }
    },
    { $sort: { reportDate: -1 } },
    {
      $group: {
        _id: "$campaignId",
        status: { $first: "$status" }
      }
    },
    {
      $match: {
        status: { $in: ["ENABLED", "PAUSED", "enabled", "paused", "OUT_OF_BUDGET", "out_of_budget"] }
      }
    }
  ]);
  const activeCampaignIds = activeCampaigns.map(c => Number(c._id));
  if (!activeCampaignIds.length) return [];

  let targetCampaignIds = activeCampaignIds;
  if (rule.campaignIds?.[type]?.length) {
    const assignedIds = rule.campaignIds[type].map(Number);
    targetCampaignIds = assignedIds.filter(id => activeCampaignIds.includes(id));
    if (!targetCampaignIds.length) return [];
  }

  const now = moment().tz(rule.timezone);
  const currentDate = now.format("YYYY-MM-DD");

  let query = {
    configId: rule.configId,
    profileId: rule.profileId,
    campaignId: { $in: targetCampaignIds }
  };

  let { fromDate, toDate } = getRuleDate(rule.timezone, rule.reportDate, rule.toDate);
  if (fromDate) {
    query.reportDate = {
      $gte: fromDate
    }
  }

  const pipeline = await campaignPipeline(query, toDate, type);

  const conditionStages = [];

  if (rule.query && rule?.query?.[type]) {
    let parsedQuery = sanitizeQueryObject(safeJsonParse(rule?.query?.[type]));
    conditionStages.push({ $match: parsedQuery });
  }

  if (rule.isDaysSinceCreation) {
    conditionStages.push({ $match: { daysSinceCreation: { $gte: Number(rule.daysSinceCreation || 0) } } });
  }

  const campaignList = await getConditionRows({ rule, ruleType: "budget", adType: type, model, pipeline, conditionStages, capture, ruleModel: budgetRulesSchema });

  const campaignIds = campaignList.map(c => c.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
  const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate, type);
  const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));

  return campaignList.map(c => ({ ...c, isEligible: !lowStockIds.has(c.campaignId) }));
};

exports.ruleEffectedBudget = async (req, res) => {
  const ruleId = req.params.ruleId;
  try {
    const rule = await budgetRulesSchema.findById(ruleId).lean();
    if (!rule) {
      return res.status(203).send({
        message: "Rule not found!",
        isSuccess: false,
      });
    }

    const SP = await getTypeBasedRuleData(rule, "SP", campaignsSchema)
    const SB = await getTypeBasedRuleData(rule, "SB", sbCampaignsSchema)
    const SD = await getTypeBasedRuleData(rule, "SD", sdCampaignsSchema)

    return res.status(200).send({
      isSuccess: true,
      message: "Budget rule data fetched successfully.",
      data: { SP, SB, SD },
    });

  } catch (error) {
    write_logs({ message: `[ruleEffectedBudget Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

exports.manualRun = async (req, res) => {
  const ruleId = req.params.ruleId;
  const userId = req.user._id;

  let { data: campaignList } = req.body;

  try {
    const rule = await budgetRulesSchema.findOne({ _id: ruleId, userId }).lean();
    if (!rule) {
      return res.status(203).send({
        message: "Rule not found!",
        isSuccess: false,
      });
    }

    const hasAssignedCampaigns = (rule.campaignIds?.SP?.length > 0) || (rule.campaignIds?.SB?.length > 0) || (rule.campaignIds?.SD?.length > 0) || (Array.isArray(rule.campaignIds) && rule.campaignIds.length > 0);
    if (!hasAssignedCampaigns) {
      return res.status(203).send({
        message: "Rule assign campaigns not found",
        isSuccess: false,
      });
    }

    if (!(campaignList?.SP?.length || campaignList?.SB?.length || campaignList?.SD?.length)) {
      return res.status(203).send({
        message: "Budget data not found!",
        isSuccess: false,
      });
    }

    const checkConfigAds = await getAccessToken(rule.configId);
    if (
      checkConfigAds &&
      checkConfigAds.adsAccessToken
    ) {
      const profileId = rule.profileId;
      const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(rule.configId && { configId: rule.configId }) }).lean();

      const now = moment().tz(profile.timezone);
      let currentTime = now.format("HH:mm:ss");
      const currentDate = now.format("YYYY-MM-DD");

      if (rule.isHourlyBudget || rule.isHourlyBid) {
        const nowHour = now.hour();
        const activeSlot = getActiveSlot(rule.hourlyConfig?.slots || [], nowHour);
        if (activeSlot && activeSlot.enabled) {
          // Retain activeSlot configuration without overriding currentTime with slot startTime
          // This preserves distinct manual run history and avoids merging into scheduled cron records.
          const isCampaignState = ["Enabled", "Paused"].includes(rule.actionType?.actionName);

          if (isCampaignState) {
            const isSlotEnabled = activeSlot.state === "ENABLED" || (activeSlot.state === undefined && activeSlot.enabled !== false);
            rule.actionType = { ...rule.actionType, actionName: isSlotEnabled ? "Enabled" : "Paused", actionValue: "", actionValueType: "" };
          } else if (rule.actionType?.actionValueType === "Number") {
            const numVal = Number(activeSlot.value !== undefined && activeSlot.value !== null && activeSlot.value !== "" ? activeSlot.value : (activeSlot.budgetPercentage || activeSlot.bidPercentage));
            rule.actionType = { ...rule.actionType, actionValue: !isNaN(numVal) ? numVal : 0, actionValueType: "Number" };
          } else {
            const numVal = Number(activeSlot.budgetPercentage !== undefined && activeSlot.budgetPercentage !== null && activeSlot.budgetPercentage !== "" ? activeSlot.budgetPercentage : (activeSlot.bidPercentage || activeSlot.value));
            rule.actionType = { ...rule.actionType, actionValue: !isNaN(numVal) ? numVal : 0, actionValueType: "Percentage" };
          }
        }
      }

      if (rule.ruleType != "T" || (rule.ruleType == "T" && moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]"))) {

        campaignList = await captureManualSelection(rule, "budget", campaignList, type => getTypeBasedRuleData(rule, type, { SP: campaignsSchema, SB: sbCampaignsSchema, SD: sdCampaignsSchema }[type], true));

        const spStatus = await runSponsoredProductRule(rule, checkConfigAds, profile, currentDate, currentTime, campaignList?.SP, true);
        const sbStatus = await runSponsoredBrandRule(rule, checkConfigAds, profile, currentDate, currentTime, campaignList?.SB, true);
        const sdStatus = await runSponsoredDisplayRule(rule, checkConfigAds, profile, currentDate, currentTime, campaignList?.SD, true);

        if (!spStatus || !sbStatus || !sdStatus) {
          return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
          });
        }

        return res.status(200).send({
          isSuccess: true,
          message: "Budget rules run successfully",
        });

      } else {
        return res.status(203).send({
          message: "This rule is Time based. So it is not the current time to run this rule.",
          isSuccess: false,
        });
      }
    }
  } catch (error) {
    write_logs({ message: `[manualRun Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

const runSponsoredProductRule = async (rule, checkConfigAds, profile, currentDate, currentTime, data, isManual = false) => {
  let campaigns = []
  if (Array.isArray(data)) {
    // if (!data?.length) return true
    campaigns = data
  } else {
    campaigns = await getTypeBasedRuleData(rule, "SP", campaignsSchema, true)
  }

  cron_logs({
    message: `runSponsoredProductRule -> Condition Matched Campaign Count: ${campaigns.length} for Rule: ${rule.ruleName}`,
    log_type: "info",
  });

  const campaignIds = campaigns.map(t => t.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
  const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate);

  const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
  const eligibleCampaign = campaigns.filter(c => !lowStockIds.has(c.campaignId));

  cron_logs({
    message: `runSponsoredProductRule -> Eligible Campaign Count: ${eligibleCampaign.length} for Rule: ${rule.ruleName}`,
    log_type: "info",
  });

  let remark = isManual ? "Manual Run" : "-";
  if (lowStockCampaigns.length > 0) {

    const lowProduct = lowStockCampaigns?.map(item => ({
      updateOne: {
        filter: {
          configId: rule.configId,
          profileId: rule.profileId,
          ruleId: rule?._id,
          ruleDate: currentDate,
          campaignId: item.campaignId
        },
        update: {
          $set: {
            type: "SP",
            totalProduct: item?.totalProducts,
            inStockProduct: item?.totalInStockProducts,
            availabilityRatio: item?.availabilityRatio
          }
        },
        upsert: true
      }
    }))

    await campaignProductEligibleStatusByRuleSchema.bulkWrite(lowProduct);
    remark = "Rule Blocked - Low Product Eligibility";

  }

  await budgetRulesHistorySchema.findOneAndUpdate(
    {
      configId: rule.configId,
      profileId: rule.profileId,
      ruleDate: currentDate,
      ruleId: rule._id,
      lastRun: currentTime,
      ruleTime: currentTime,
    },
    {
      $set: {
        conditionSnapshot: rule.conditionSnapshot,
        ruleName: rule.ruleName,
        status: "COMPLETED",
        remark: remark
      },
    },
    { new: true, upsert: true }
  ).lean()

  if (eligibleCampaign.length > 0) {
    const budgetThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "budgetRuleSetting");

    const stagedSPCampaigns = [];

    for (const campaign of eligibleCampaign) {
      cron_logs({
        message: `Rule ID: ${rule?._id}, Rule Name: ${rule?.ruleName}, SP-Campaign: ${JSON.stringify(campaign)}`,
        log_type: "info",
      });

      const existingActive = await affectedCampaignByRuleSchema.findOne({
        configId: rule.configId,
        profileId: rule.profileId,
        userId: rule.userId,
        ruleSchema: "BudgetRule",
        ruleId: rule._id,
        type: "SP",
        campaignId: campaign.campaignId,
        isActive: true
      }).lean();

      if (!existingActive || rule.allowMultiTimeChanges || 1 == 1) {
        let changeType, oldValue, newValue, changed;
        let status;
        let calculatedBudget;
        const actionType = rule.actionType;

        if (
          actionType.actionName === "Enabled" ||
          actionType.actionName === "Paused"
        ) {
          status = actionType.actionName.toUpperCase();

          if (status) {
            changeType = "Update Camapign Status";
            oldValue = existingActive ? existingActive.oldValue : campaign.status;
            newValue = status;

            // Check if setting is already in effect
            if (existingActive && String(existingActive.newValue) === String(status) && String(campaign.status).toUpperCase() === String(status)) {
              await recordRuleExecutionChange({
                conditionSnapshot: campaign.conditionSnapshot,
                configId: rule.configId,
                profileId: rule.profileId,
                userId: rule.userId,
                ruleSchema: "BudgetRule",
                ruleId: rule._id,
                ruleDate: currentDate,
                ruleTime: currentTime,
                type: "SP",
                campaignId: campaign.campaignId,
                name: campaign.name,
                oldValue: oldValue,
                newValue: newValue,
                changed: "state",
                metrics: {
                  impressions: campaign?.impressions,
                  clicks: campaign?.clicks,
                  spend: campaign?.spend,
                  sales: campaign?.sales,
                  orders: campaign?.orders,
                  acos: campaign?.acos,
                  roas: campaign?.roas,
                  cpc: campaign?.cpc,
                  ctr: campaign?.ctr,
                },
                notes: `Periodic metric sync snapshot: ${rule.ruleName}`,
              });
              continue;
            }

            changed = "state";
          }
        }

        if (
          actionType.actionName === "Increase" ||
          actionType.actionName === "Decrease" ||
          actionType.actionName == "setBudget"
        ) {
          let actionValue = actionType.actionValue;
          const baseline = (rule.allowMultiTimeChanges || !existingActive) ? (parseFloat(campaign.budget) || parseFloat(existingActive?.oldValue) || 0) : (parseFloat(existingActive?.oldValue) || parseFloat(campaign.budget) || 0);
          calculatedBudget = baseline;

          if (actionType.actionValueType == "Percentage") {
            const delta = (baseline * parseFloat(actionValue)) / 100;
            calculatedBudget = actionType.actionName === "Increase" ? baseline + delta : baseline - delta;
          } else if (actionType.actionName === "Increase") {
            calculatedBudget = baseline + parseFloat(actionValue);
          } else if (actionType.actionName === "Decrease") {
            calculatedBudget = baseline - parseFloat(actionValue);
          } else if (actionType.actionName == "setBudget") {
            calculatedBudget = parseFloat(actionValue);
          }

          calculatedBudget = parseFloat(calculatedBudget.toFixed(2));

          if (budgetThreshold?.maxBudget && calculatedBudget > budgetThreshold?.maxBudget) {
            calculatedBudget = budgetThreshold?.maxBudget;
          }

          if (budgetThreshold?.minBudget && calculatedBudget < budgetThreshold?.minBudget) {
            calculatedBudget = budgetThreshold?.minBudget;
          }

          oldValue = baseline;
          newValue = calculatedBudget;

          if (!rule.allowMultiTimeChanges && existingActive && Number(existingActive.newValue) === calculatedBudget && Number(campaign.budget) === calculatedBudget) {
            await recordRuleExecutionChange({
              conditionSnapshot: campaign.conditionSnapshot,
              configId: rule.configId,
              profileId: rule.profileId,
              userId: rule.userId,
              ruleSchema: "BudgetRule",
              ruleId: rule._id,
              ruleDate: currentDate,
              ruleTime: currentTime,
              type: "SP",
              campaignId: campaign.campaignId,
              name: campaign.name,
              oldValue: oldValue,
              newValue: newValue,
              changed: "budget",
              metrics: {
                impressions: campaign?.impressions,
                clicks: campaign?.clicks,
                spend: campaign?.spend,
                sales: campaign?.sales,
                orders: campaign?.orders,
                acos: campaign?.acos,
                roas: campaign?.roas,
                cpc: campaign?.cpc,
                ctr: campaign?.ctr,
              },
              notes: `Periodic metric sync snapshot: ${rule.ruleName}`,
            });
            continue;
          }

          if (calculatedBudget) {
            changeType = "Update Camapign Budget";
            changed = "budget";
          }
        }

        if (status || calculatedBudget) {
          stagedSPCampaigns.push({
            campaignId: String(campaign.campaignId),
            ...(status ? { state: status } : {}),
            ...(calculatedBudget ? { budget: { budget: calculatedBudget, budgetType: campaign.budgetType } } : {}),
            context: {
              campaign,
              changeType,
              oldValue,
              newValue,
              changed,
              status,
              calculatedBudget
            }
          });
        }
      }
    }

    if (stagedSPCampaigns.length > 0) {
      const { successfulItems } = await processBatchUpdates({
        updates: stagedSPCampaigns,
        entityType: "SP_CAMPAIGNS",
        profile,
        checkConfigAds,
        configId: rule.configId,
      });

      const bulkOps = [];
      for (const item of successfulItems) {
        const ctx = item.context;
        if (!ctx) continue;
        const { campaign, changeType, oldValue, newValue, changed, status, calculatedBudget } = ctx;

        await recordRuleExecutionChange({
          conditionSnapshot: campaign.conditionSnapshot,
          configId: rule.configId,
          profileId: rule.profileId,
          userId: rule.userId,
          ruleSchema: "BudgetRule",
          ruleId: rule._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SP",
          campaignId: campaign.campaignId,
          name: campaign.name,
          oldValue,
          newValue,
          changed,
          metrics: {
            impressions: campaign?.impressions,
            clicks: campaign?.clicks,
            spend: campaign?.spend,
            sales: campaign?.sales,
            orders: campaign?.orders,
            acos: campaign?.acos,
            roas: campaign?.roas,
            cpc: campaign?.cpc,
            ctr: campaign?.ctr,
          },
          notes: `SP Budget rule executed: ${rule.ruleName}`,
        });

        const isDayparting = Boolean(rule.isHourlyBudget || rule.isHourlyBid);
        const historyChangeType = isDayparting
          ? (changeType.includes("Status") ? `Dayparting Rule Run (${rule.ruleName}): Update Campaign Status` : `Dayparting Rule Run (${rule.ruleName}): Update Campaign Budget`)
          : changeType;

        await createHistory(
          campaign.campaignId,
          historyChangeType,
          oldValue,
          newValue,
          campaign.configId,
          campaign.profileId,
          rule.userId,
          "SP",
          isDayparting ? "DAYPARTING" : "RULE"
        );

        const updateFields = {};
        if (status) updateFields.status = status;
        if (calculatedBudget) {
          updateFields.budget = calculatedBudget;
          if (campaign.status === "OUT_OF_BUDGET" || campaign.isOutOfBudget) {
            updateFields.status = "ENABLED";
            if (calculatedBudget > 0 && campaign.spend !== undefined) {
              updateFields["budgetTracking.lastUsagePercentage"] = Math.round((Number(campaign.spend) / calculatedBudget) * 10000) / 100;
            }
          }
        }

        bulkOps.push({
          updateOne: {
            filter: {
              configId: campaign.configId,
              profileId: campaign.profileId,
              campaignId: campaign.campaignId,
              reportDate: currentDate,
            },
            update: { $set: updateFields },
            upsert: true
          }
        });
      }

      if (bulkOps.length > 0) {
        await campaignsSchema.bulkWrite(bulkOps);
      }
    }

  }

  return true;
}

const runSponsoredBrandRule = async (rule, checkConfigAds, profile, currentDate, currentTime, data) => {
  let campaigns = []
  if (Array.isArray(data)) {
    if (!data?.length) return true
    campaigns = data
  } else {
    campaigns = await getTypeBasedRuleData(rule, "SB", sbCampaignsSchema, true)
  }

  await updateSnapshotHistory(rule, budgetRulesHistorySchema, currentDate, currentTime);

  const campaignIds = campaigns.map(t => t.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
  const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate, "SB");

  const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
  const eligibleCampaign = campaigns.filter(c => !lowStockIds.has(c.campaignId));

  if (lowStockCampaigns.length > 0) {
    const lowProduct = lowStockCampaigns?.map(item => ({
      updateOne: {
        filter: {
          configId: rule.configId,
          profileId: rule.profileId,
          ruleId: rule?._id,
          ruleDate: currentDate,
          campaignId: item.campaignId
        },
        update: {
          $set: {
            type: "SB",
            totalProduct: item?.totalProducts,
            inStockProduct: item?.totalInStockProducts,
            availabilityRatio: item?.availabilityRatio
          }
        },
        upsert: true
      }
    }))

    await campaignProductEligibleStatusByRuleSchema.bulkWrite(lowProduct);
  }

  if (eligibleCampaign.length > 0) {
    const budgetThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "budgetRuleSetting");

    const stagedSBCampaigns = [];

    for (const campaign of eligibleCampaign) {
      cron_logs({
        message: `Rule ID: ${rule?._id}, Rule Name: ${rule?.ruleName}, SB-Campaign: ${JSON.stringify(campaign)}`,
        log_type: "info",
      });

      const existingActive = await affectedCampaignByRuleSchema.findOne({
        configId: rule.configId,
        profileId: rule.profileId,
        userId: rule.userId,
        ruleSchema: "BudgetRule",
        ruleId: rule._id,
        type: "SB",
        campaignId: campaign.campaignId,
        isActive: true
      }).lean();

      if (!existingActive || rule.allowMultiTimeChanges || 1 == 1) {
        let changeType, oldValue, newValue, changed, status, calculatedBudget;
        const actionType = rule.actionType;
        if (
          actionType.actionName === "Enabled" ||
          actionType.actionName === "Paused"
        ) {
          status = actionType.actionName.toUpperCase();

          if (status) {
            changeType = "Update Camapign Status";
            oldValue = existingActive ? existingActive.oldValue : campaign.status;
            newValue = status;

            // Check if setting is already in effect
            if (existingActive && String(existingActive.newValue) === String(status) && String(campaign.status).toUpperCase() === String(status)) {
              await recordRuleExecutionChange({
                conditionSnapshot: campaign.conditionSnapshot,
                configId: rule.configId,
                profileId: rule.profileId,
                userId: rule.userId,
                ruleSchema: "BudgetRule",
                ruleId: rule._id,
                ruleDate: currentDate,
                ruleTime: currentTime,
                type: "SB",
                campaignId: campaign.campaignId,
                name: campaign.name,
                oldValue: oldValue,
                newValue: newValue,
                changed: "state",
                metrics: {
                  impressions: campaign?.impressions,
                  clicks: campaign?.clicks,
                  spend: campaign?.spend,
                  sales: campaign?.sales,
                  orders: campaign?.orders,
                  acos: campaign?.acos,
                  roas: campaign?.roas,
                  cpc: campaign?.cpc,
                  ctr: campaign?.ctr,
                },
                notes: `Periodic metric sync snapshot: ${rule.ruleName}`,
              });
              continue;
            }

            changed = "state";
          }
        }
        if (
          actionType.actionName === "Increase" ||
          actionType.actionName === "Decrease" ||
          actionType.actionName == "setBudget"
        ) {
          let actionValue = actionType.actionValue;
          // Anchor to baseline
          const baseline = (rule.allowMultiTimeChanges || !existingActive) ? (parseFloat(campaign.budget) || parseFloat(existingActive?.oldValue) || 0) : (parseFloat(existingActive?.oldValue) || parseFloat(campaign.budget) || 0);
          calculatedBudget = baseline;

          if (actionType.actionValueType == "Percentage") {
            const delta = (baseline * parseFloat(actionValue)) / 100;
            calculatedBudget = actionType.actionName === "Increase" ? baseline + delta : baseline - delta;
          } else if (actionType.actionName === "Increase") {
            calculatedBudget = baseline + parseFloat(actionValue);
          } else if (actionType.actionName === "Decrease") {
            calculatedBudget = baseline - parseFloat(actionValue);
          } else if (actionType.actionName == "setBudget") {
            calculatedBudget = parseFloat(actionValue);
          }

          calculatedBudget = parseFloat(calculatedBudget.toFixed(2));

          if (budgetThreshold?.maxBudget && calculatedBudget > budgetThreshold?.maxBudget) {
            calculatedBudget = budgetThreshold?.maxBudget;
          }

          if (budgetThreshold?.minBudget && calculatedBudget < budgetThreshold?.minBudget) {
            calculatedBudget = budgetThreshold?.minBudget;
          }

          oldValue = baseline;
          newValue = calculatedBudget;

          // Check if setting is already in effect
          if (!rule.allowMultiTimeChanges && existingActive && Number(existingActive.newValue) === calculatedBudget && Number(campaign.budget) === calculatedBudget) {
            await recordRuleExecutionChange({
              conditionSnapshot: campaign.conditionSnapshot,
              configId: rule.configId,
              profileId: rule.profileId,
              userId: rule.userId,
              ruleSchema: "BudgetRule",
              ruleId: rule._id,
              ruleDate: currentDate,
              ruleTime: currentTime,
              type: "SB",
              campaignId: campaign.campaignId,
              name: campaign.name,
              oldValue: oldValue,
              newValue: newValue,
              changed: "budget",
              metrics: {
                impressions: campaign?.impressions,
                clicks: campaign?.clicks,
                spend: campaign?.spend,
                sales: campaign?.sales,
                orders: campaign?.orders,
                acos: campaign?.acos,
                roas: campaign?.roas,
                cpc: campaign?.cpc,
                ctr: campaign?.ctr,
              },
              notes: `Periodic metric sync snapshot: ${rule.ruleName}`,
            });
            continue;
          }

          if (calculatedBudget) {
            changeType = "Update Camapign Budget";
            changed = "budget";
          }
        }

        if (status || calculatedBudget) {
          stagedSBCampaigns.push({
            campaignId: String(campaign.campaignId),
            ...(status ? { state: status } : {}),
            ...(calculatedBudget ? { budget: { budget: calculatedBudget } } : {}),
            context: {
              campaign,
              changeType,
              oldValue,
              newValue,
              changed,
              status,
              calculatedBudget
            }
          });
        }
      }
    }

    if (stagedSBCampaigns.length > 0) {
      const { successfulItems } = await processBatchUpdates({
        updates: stagedSBCampaigns,
        entityType: "SB_CAMPAIGNS",
        profile,
        checkConfigAds,
        configId: rule.configId,
      });

      const bulkOps = [];
      for (const item of successfulItems) {
        const ctx = item.context;
        if (!ctx) continue;
        const { campaign, changeType, oldValue, newValue, changed, status, calculatedBudget } = ctx;

        await recordRuleExecutionChange({
          conditionSnapshot: campaign.conditionSnapshot,
          configId: rule.configId,
          profileId: rule.profileId,
          userId: rule.userId,
          ruleSchema: "BudgetRule",
          ruleId: rule._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SB",
          campaignId: campaign.campaignId,
          name: campaign.name,
          oldValue: oldValue,
          newValue: newValue,
          changed,
          metrics: {
            impressions: campaign?.impressions,
            clicks: campaign?.clicks,
            spend: campaign?.spend,
            sales: campaign?.sales,
            orders: campaign?.orders,
            acos: campaign?.acos,
            roas: campaign?.roas,
            cpc: campaign?.cpc,
            ctr: campaign?.ctr,
          },
          notes: `SB Budget rule executed: ${rule.ruleName}`,
        });

        const isDayparting = Boolean(rule.isHourlyBudget || rule.isHourlyBid);
        const historyChangeType = isDayparting
          ? (changeType.includes("Status") ? `Dayparting Rule Run (${rule.ruleName}): Update Campaign Status` : `Dayparting Rule Run (${rule.ruleName}): Update Campaign Budget`)
          : changeType;

        await createHistory(
          campaign.campaignId,
          historyChangeType,
          oldValue,
          newValue,
          campaign.configId,
          campaign.profileId,
          rule.userId,
          "SB",
          isDayparting ? "DAYPARTING" : "RULE"
        );

        const updateFields = {};
        if (status) updateFields.status = status;
        if (calculatedBudget) {
          updateFields.budget = calculatedBudget;
          if (campaign.status === "OUT_OF_BUDGET" || campaign.isOutOfBudget) {
            updateFields.status = "ENABLED";
            if (calculatedBudget > 0 && campaign.spend !== undefined) {
              updateFields["budgetTracking.lastUsagePercentage"] = Math.round((Number(campaign.spend) / calculatedBudget) * 10000) / 100;
            }
          }
        }

        bulkOps.push({
          updateOne: {
            filter: {
              configId: campaign.configId,
              profileId: campaign.profileId,
              campaignId: campaign.campaignId,
              reportDate: currentDate,
            },
            update: { $set: updateFields },
            upsert: true
          }
        });
      }

      if (bulkOps.length > 0) {
        await sbCampaignsSchema.bulkWrite(bulkOps);
      }
    }

  }

  return true;
}

const runSponsoredDisplayRule = async (rule, checkConfigAds, profile, currentDate, currentTime, data) => {
  let campaigns = []
  if (Array.isArray(data)) {
    if (!data?.length) return true
    campaigns = data
  } else {
    campaigns = await getTypeBasedRuleData(rule, "SD", sdCampaignsSchema, true)
  }

  await updateSnapshotHistory(rule, budgetRulesHistorySchema, currentDate, currentTime);

  const campaignIds = campaigns.map(t => t.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
  const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate, "SD");

  const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
  const eligibleCampaign = campaigns.filter(c => !lowStockIds.has(c.campaignId));

  if (lowStockCampaigns.length > 0) {
    const lowProduct = lowStockCampaigns?.map(item => ({
      updateOne: {
        filter: {
          configId: rule.configId,
          profileId: rule.profileId,
          ruleId: rule?._id,
          ruleDate: currentDate,
          campaignId: item.campaignId
        },
        update: {
          $set: {
            type: "SD",
            totalProduct: item?.totalProducts,
            inStockProduct: item?.totalInStockProducts,
            availabilityRatio: item?.availabilityRatio
          }
        },
        upsert: true
      }
    }))

    await campaignProductEligibleStatusByRuleSchema.bulkWrite(lowProduct);
  }

  if (eligibleCampaign.length > 0) {
    const budgetThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "budgetRuleSetting");

    const stagedSDCampaigns = [];

    for (const campaign of eligibleCampaign) {
      cron_logs({
        message: `Rule ID: ${rule?._id}, Rule Name: ${rule?.ruleName}, SD-Campaign: ${JSON.stringify(campaign)}`,
        log_type: "info",
      });

      const existingActive = await affectedCampaignByRuleSchema.findOne({
        configId: rule.configId,
        profileId: rule.profileId,
        userId: rule.userId,
        ruleSchema: "BudgetRule",
        ruleId: rule._id,
        type: "SD",
        campaignId: campaign.campaignId,
        isActive: true
      }).lean();

      if (!existingActive || rule.allowMultiTimeChanges || 1 == 1) {
        let changeType, oldValue, newValue, changed, status, calculatedBudget;
        const actionType = rule.actionType;
        if (
          actionType.actionName === "Enabled" ||
          actionType.actionName === "Paused"
        ) {
          status = actionType.actionName.toLowerCase();

          if (status) {
            changeType = "Update Camapign Status";
            oldValue = existingActive ? existingActive.oldValue : campaign.status;
            newValue = status;

            // Check if setting is already in effect
            if (existingActive && String(existingActive.newValue).toLowerCase() === String(status).toLowerCase() && String(campaign.status).toLowerCase() === String(status).toLowerCase()) {
              await recordRuleExecutionChange({
                conditionSnapshot: campaign.conditionSnapshot,
                configId: rule.configId,
                profileId: rule.profileId,
                userId: rule.userId,
                ruleSchema: "BudgetRule",
                ruleId: rule._id,
                ruleDate: currentDate,
                ruleTime: currentTime,
                type: "SD",
                campaignId: campaign.campaignId,
                name: campaign.name,
                oldValue: oldValue,
                newValue: newValue,
                changed: "state",
                metrics: {
                  impressions: campaign?.impressions,
                  clicks: campaign?.clicks,
                  spend: campaign?.spend,
                  sales: campaign?.sales,
                  orders: campaign?.orders,
                  acos: campaign?.acos,
                  roas: campaign?.roas,
                  cpc: campaign?.cpc,
                  ctr: campaign?.ctr,
                },
                notes: `Periodic metric sync snapshot: ${rule.ruleName}`,
              });
              continue;
            }

            changed = "state";
          }
        }
        if (
          actionType.actionName === "Increase" ||
          actionType.actionName === "Decrease" ||
          actionType.actionName == "setBudget"
        ) {
          let actionValue = actionType.actionValue;
          // Anchor to baseline
          const baseline = (rule.allowMultiTimeChanges || !existingActive) ? (parseFloat(campaign.budget) || parseFloat(existingActive?.oldValue) || 0) : (parseFloat(existingActive?.oldValue) || parseFloat(campaign.budget) || 0);
          calculatedBudget = baseline;

          if (actionType.actionValueType == "Percentage") {
            const delta = (baseline * parseFloat(actionValue)) / 100;
            calculatedBudget = actionType.actionName === "Increase" ? baseline + delta : baseline - delta;
          } else if (actionType.actionName === "Increase") {
            calculatedBudget = baseline + parseFloat(actionValue);
          } else if (actionType.actionName === "Decrease") {
            calculatedBudget = baseline - parseFloat(actionValue);
          } else if (actionType.actionName == "setBudget") {
            calculatedBudget = parseFloat(actionValue);
          }

          calculatedBudget = parseFloat(calculatedBudget.toFixed(2));

          if (budgetThreshold?.maxBudget && calculatedBudget > budgetThreshold?.maxBudget) {
            calculatedBudget = budgetThreshold?.maxBudget;
          }

          if (budgetThreshold?.minBudget && calculatedBudget < budgetThreshold?.minBudget) {
            calculatedBudget = budgetThreshold?.minBudget;
          }

          oldValue = baseline;
          newValue = calculatedBudget;

          // Check if setting is already in effect
          if (!rule.allowMultiTimeChanges && existingActive && Number(existingActive.newValue) === calculatedBudget && Number(campaign.budget) === calculatedBudget) {
            await recordRuleExecutionChange({
              conditionSnapshot: campaign.conditionSnapshot,
              configId: rule.configId,
              profileId: rule.profileId,
              userId: rule.userId,
              ruleSchema: "BudgetRule",
              ruleId: rule._id,
              ruleDate: currentDate,
              ruleTime: currentTime,
              type: "SD",
              campaignId: campaign.campaignId,
              name: campaign.name,
              oldValue: oldValue,
              newValue: newValue,
              changed: "budget",
              metrics: {
                impressions: campaign?.impressions,
                clicks: campaign?.clicks,
                spend: campaign?.spend,
                sales: campaign?.sales,
                orders: campaign?.orders,
                acos: campaign?.acos,
                roas: campaign?.roas,
                cpc: campaign?.cpc,
                ctr: campaign?.ctr,
              },
              notes: `Periodic metric sync snapshot: ${rule.ruleName}`,
            });
            continue;
          }

          if (calculatedBudget) {
            changeType = "Update Camapign Budget";
            changed = "budget";
          }
        }

        if (status || calculatedBudget) {
          stagedSDCampaigns.push({
            campaignId: String(campaign.campaignId),
            ...(status ? { state: status } : {}),
            ...(calculatedBudget ? { budget: calculatedBudget } : {}),
            context: {
              campaign,
              changeType,
              oldValue,
              newValue,
              changed,
              status,
              calculatedBudget
            }
          });
        }
      }
    }

    if (stagedSDCampaigns.length > 0) {
      const { successfulItems } = await processBatchUpdates({
        updates: stagedSDCampaigns,
        entityType: "SD_CAMPAIGNS",
        profile,
        checkConfigAds,
        configId: rule.configId,
      });

      const bulkOps = [];
      for (const item of successfulItems) {
        const ctx = item.context;
        if (!ctx) continue;
        const { campaign, changeType, oldValue, newValue, changed, status, calculatedBudget } = ctx;

        await recordRuleExecutionChange({
          conditionSnapshot: campaign.conditionSnapshot,
          configId: rule.configId,
          profileId: rule.profileId,
          userId: rule.userId,
          ruleSchema: "BudgetRule",
          ruleId: rule._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SD",
          campaignId: campaign.campaignId,
          name: campaign.name,
          oldValue,
          newValue,
          changed,
          metrics: {
            impressions: campaign?.impressions,
            clicks: campaign?.clicks,
            spend: campaign?.spend,
            sales: campaign?.sales,
            orders: campaign?.orders,
            acos: campaign?.acos,
            roas: campaign?.roas,
            cpc: campaign?.cpc,
            ctr: campaign?.ctr,
          },
          notes: `SD Budget rule executed: ${rule.ruleName}`,
        });

        const isDayparting = Boolean(rule.isHourlyBudget || rule.isHourlyBid);
        const historyChangeType = isDayparting
          ? (changeType.includes("Status") ? `Dayparting Rule Run (${rule.ruleName}): Update Campaign Status` : `Dayparting Rule Run (${rule.ruleName}): Update Campaign Budget`)
          : changeType;

        await createHistory(
          campaign.campaignId,
          historyChangeType,
          oldValue,
          newValue,
          campaign.configId,
          campaign.profileId,
          rule.userId,
          "SD",
          isDayparting ? "DAYPARTING" : "RULE"
        );

        const updateFields = {};
        if (status) updateFields.status = status.toUpperCase();
        if (calculatedBudget) {
          updateFields.budget = calculatedBudget;
          if (campaign.status === "OUT_OF_BUDGET" || campaign.isOutOfBudget) {
            updateFields.status = "ENABLED";
            if (calculatedBudget > 0 && campaign.spend !== undefined) {
              updateFields["budgetTracking.lastUsagePercentage"] = Math.round((Number(campaign.spend) / calculatedBudget) * 10000) / 100;
            }
          }
        }

        bulkOps.push({
          updateOne: {
            filter: {
              configId: campaign.configId,
              profileId: campaign.profileId,
              campaignId: campaign.campaignId,
              reportDate: currentDate,
            },
            update: { $set: updateFields },
            upsert: true
          }
        });
      }

      if (bulkOps.length > 0) {
        await sdCampaignsSchema.bulkWrite(bulkOps);
      }
    }

  }

  return true;
}

exports.executeBudgetRulesForProfile = async (profile, scheduledFor = new Date()) => {
  if (global.updateTaskProgress) global.updateTaskProgress("BudgetRuleSchedules");

  const isQueue = process.env.AUTOMATION_EXECUTION_MODE === "queue";
  const now = moment(scheduledFor).tz(profile.timezone);
  const currentDate = now.format("YYYY-MM-DD");
  const currentTime = now.format("HH:mm");
  const currentDay = now.format("dddd");

  const rules = await budgetRulesSchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    $or: [{ times: { $ne: [] } }, { isHourlyBudget: true }, { isHourlyBid: true }],
    isActive: true,
    ...(!isQueue && { isRunning: false })
  }).lean();

  const todayHistory = await ruleRunHistorySchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    ruleDate: currentDate,
    ruleSchema: "BudgetRule",
    isRun: true
  }).lean();

  const executedMap = new Map();
  todayHistory.forEach(h => {
    executedMap.set(
      `${h.ruleId.toString()}_${h.ruleTime}`,
      true
    );
  });

  const finalRulesToRun = [];
  for (const rule of rules) {
    if (rule.isHourlyBudget || rule.isHourlyBid) {
      const dayOfWeek = now.day();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const frequency = rule.hourlyConfig?.frequency || "DAILY";

      if (frequency === "WEEKDAY" && isWeekend) continue;
      if (frequency === "WEEKEND" && !isWeekend) continue;
      if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) continue;

      const nowHour = now.hour();
      const activeSlot = getActiveSlot(rule.hourlyConfig?.slots || [], nowHour);

      if (activeSlot && activeSlot.enabled) {
        const historyKey = `${rule._id.toString()}_${activeSlot.startTime}`;
        const alreadyExecuted = executedMap.has(historyKey);

        if (!alreadyExecuted) {
          const hourlyRule = { ...rule };
          const isCampaignState = ["Enabled", "Paused"].includes(rule.actionType?.actionName);

          if (isCampaignState) {
            const isSlotEnabled = activeSlot.state === "ENABLED" || (activeSlot.state === undefined && activeSlot.enabled !== false);
            hourlyRule.actionType = { ...rule.actionType, actionName: isSlotEnabled ? "Enabled" : "Paused", actionValue: "", actionValueType: "" };
          } else if (rule.actionType?.actionValueType === "Number") {
            const numVal = Number(activeSlot.value !== undefined && activeSlot.value !== null && activeSlot.value !== "" ? activeSlot.value : (activeSlot.budgetPercentage || activeSlot.bidPercentage));
            hourlyRule.actionType = { ...rule.actionType, actionValue: !isNaN(numVal) ? numVal : 0, actionValueType: "Number" };
          } else {
            const numVal = Number(activeSlot.budgetPercentage !== undefined && activeSlot.budgetPercentage !== null && activeSlot.budgetPercentage !== "" ? activeSlot.budgetPercentage : (activeSlot.bidPercentage || activeSlot.value));
            hourlyRule.actionType = { ...rule.actionType, actionValue: !isNaN(numVal) ? numVal : 0, actionValueType: "Percentage" };
          }

          finalRulesToRun.push({
            rule: hourlyRule,
            scheduledTime: activeSlot.startTime
          });

          if (!isQueue) {
            await budgetRulesSchema.findByIdAndUpdate(
              { _id: rule._id },
              { isRunning: true, lastStartedAt: new Date() },
              { new: true, upsert: true }
            );
          }
        }
      }
    } else {
      if (!rule.days.includes(currentDay)) {
        const isLast7Days = rule?.days?.includes("Every 7 Days") ? 7 : 0;
        const isLast10Days = rule?.days?.includes("Every 10 Days") ? 10 : 0;
        const isLast15Days = rule?.days?.includes("Every 15 Days") ? 15 : 0;
        const isLast30Days = rule?.days?.includes("Every 30 Days") ? 30 : 0;

        if (!isLast7Days && !isLast10Days && !isLast15Days && !isLast30Days) continue;

        const lastRun = await budgetRulesHistorySchema.findOne({ configId: rule?.configId, profileId: rule?.profileId, ruleId: rule?._id }).lean().sort({ ruleDate: -1 });
        const diffDays = moment(currentDate).diff(moment(lastRun?.ruleDate), "days");

        if (lastRun && !((isLast7Days && diffDays >= isLast7Days) || (isLast10Days && diffDays >= isLast10Days) || (isLast15Days && diffDays >= isLast15Days) || (isLast30Days && diffDays >= isLast30Days))) continue;
      }

      for (const time of (rule.times || [])) {
        const ruleDateTime = moment.tz(
          `${currentDate} ${time}`,
          "YYYY-MM-DD HH:mm",
          rule.timezone
        );

        const isPastOrNow = ruleDateTime.isSameOrBefore(now);

        const historyKey = `${rule._id.toString()}_${time}`;
        const alreadyExecuted = executedMap.has(historyKey);

        if (isPastOrNow && !alreadyExecuted) {
          finalRulesToRun.push({
            rule,
            scheduledTime: time
          });

          if (!isQueue) {
            await budgetRulesSchema.findByIdAndUpdate(
              { _id: rule._id },
              { isRunning: true, lastStartedAt: new Date() },
              { new: true, upsert: true }
            );
          }
        }
      }
    }
  }

  cron_logs({
    message: `executeBudgetRulesForProfile, Total Active Rules: ${finalRulesToRun.length} for profile: ${profile.name}`,
    log_type: "info",
  });

  let executedCount = 0;
  if (finalRulesToRun.length > 0) {
    await Promise.all(
      finalRulesToRun.map((finalRule) =>
        ruleLimit(async () => {
          try {
            if (global.updateTaskProgress) global.updateTaskProgress("BudgetRuleSchedules");

            const rule = finalRule.rule;
            if (rule.ruleType != "T" || (rule.ruleType == "T" && moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]"))) {

              const checkConfigAds = await getAccessToken(rule.configId);
              if (checkConfigAds && checkConfigAds.adsAccessToken && profile) {

                const spStatus = await runSponsoredProductRule(rule, checkConfigAds, profile, currentDate, finalRule?.scheduledTime);
                const sbStatus = await runSponsoredBrandRule(rule, checkConfigAds, profile, currentDate, finalRule?.scheduledTime);
                const sdStatus = await runSponsoredDisplayRule(rule, checkConfigAds, profile, currentDate, finalRule?.scheduledTime);

                if (!spStatus || !sbStatus || !sdStatus) {
                  cron_logs({
                    message: `ProfileId: ${profile.name} -> rule: ${rule.ruleName}, Something went wrong while running this rule`,
                    isSuccess: false,
                  });
                }

                await ruleRunHistorySchema.findOneAndUpdate(
                  {
                    configId: profile.configId,
                    profileId: profile.profileId,
                    ruleId: rule._id,
                    ruleSchema: "BudgetRule",
                    ruleDate: currentDate,
                    ruleTime: finalRule.scheduledTime
                  },
                  {
                    $set: { isRun: true }
                  },
                  { new: true, upsert: true }
                ).lean();

                executedCount++;

                cron_logs({
                  message: `ProfileId: ${profile.name} -> rule: ${rule.ruleName}, rule run successfully`,
                  log_type: "info",
                });

              } else {
                cron_logs({
                  message: `Account disconnected for Profile: ${profile.name}`,
                  log_type: "info",
                });
              }
            }

            return;
          } catch (err) {
            cron_logs({
              message: `Error in BudgetRule: ${err.message}`,
              log_type: "error",
            });
            throw err;
          } finally {
            if (!isQueue) {
              await budgetRulesSchema.findByIdAndUpdate(
                { _id: finalRule.rule._id },
                { isRunning: false },
                { new: true, upsert: true }
              );
            }
          }
        })
      )
    );
  }

  await cronJobHistorySchema.findOneAndUpdate(
    {
      configId: profile.configId,
      profileId: profile.profileId,
      cronName: "Budget Rule Schedulers",
      historyDate: currentDate,
    },
    {
      $set: { status: "COMPLETED" }
    },
    { new: true, upsert: true }
  ).lean();

  return {
    success: true,
    totalRulesEvaluated: rules.length,
    finalRulesToRunCount: finalRulesToRun.length,
    executedCount,
  };
};

exports.cronBudgetRulesSchedules = async () => {
  try {
    cron_logs({
      message: `cronBudgetRulesSchedules`,
      log_type: "info",
    });

    const profiles = await getActivePlanProfiles();
    if (!profiles?.length) return;

    await Promise.all(
      profiles.map((profile) =>
        profileLimit(async () => {
          try {
            await exports.executeBudgetRulesForProfile(profile);
          } catch (err) {
            cron_logs({
              message: `Error executing budget rules for profile ${profile.name}: ${err.message}`,
              log_type: "error",
            });
          }
        })
      )
    );

    return cron_logs({
      message: `Budgetrule run successfully`,
      log_type: "info",
    });
  } catch (err) {
    cron_logs({
      message: `Error in cronBudgetRulesSchedules: ${err.message}`,
      log_type: "error",
    });
  }
};

exports.ruleReverted = async (req, res) => {
  const { data: revertList, ruleId } = req.body;

  if (!Array.isArray(revertList) || !revertList.length || !ruleId) {
    return res.status(203).send({
      message: "No records to revert!",
      isSuccess: false,
    });
  }

  const rule = await budgetRulesSchema.findOne({ _id: ruleId }).lean();
  if (!rule) return { _id: item._id, success: false, reason: "Rule not found" };

  const checkConfigAds = await getAccessToken(rule.configId);
  if (!checkConfigAds?.adsAccessToken) return { _id: item._id, success: false, reason: "Access token unavailable" };

  const profile = await profileSchema.findOne({ profileId: Number(rule.profileId), ...(rule.configId && { configId: rule.configId }) }).lean();
  if (!profile) return { _id: item._id, success: false, reason: "Profile not found" };

  try {
    const CHUNK_SIZE = 50;
    const succeeded = [];
    const failed = [];

    for (let i = 0; i < revertList.length; i += CHUNK_SIZE) {
      const chunk = revertList.slice(i, i + CHUNK_SIZE);

      const SPList = chunk.filter(it => it?.type === "SP");
      const SBList = chunk.filter(it => it?.type === "SB");
      const SDList = chunk.filter(it => it?.type === "SD");

      const [spResult, sbResult, sdResult] = await Promise.all([
        revertedSPRuleEffect(SPList, rule, checkConfigAds, profile),
        revertedSBRuleEffect(SBList, rule, checkConfigAds, profile),
        revertedSDRuleEffect(SDList, rule, checkConfigAds, profile),
      ]);

      succeeded.push(
        ...(spResult?.succeeded ?? []),
        ...(sbResult?.succeeded ?? []),
        ...(sdResult?.succeeded ?? [])
      );
      failed.push(
        ...(spResult?.failed ?? []),
        ...(sbResult?.failed ?? []),
        ...(sdResult?.failed ?? [])
      );
    }

    return res.status(200).send({
      isSuccess: true,
      message: `${succeeded.length} record(s) reverted successfully${failed.length ? `, ${failed.length} failed` : ""}.`,
      reverted: succeeded.map(r => r._id),
      failed: failed.map(r => ({ _id: r._id, reason: r.reason })),
    });

  } catch (error) {
    write_logs({ message: `[ruleReverted Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

const revertedSPRuleEffect = async (SPList, rule, checkConfigAds, profile) => {
  const now = moment().tz(profile.timezone);
  const currentDate = now.format("YYYY-MM-DD");

  const succeeded = [];
  const failed = [];

  if (!SPList?.length) return { succeeded, failed };

  // Deduplicate by campaignId, keeping the earliest original baseline oldValue
  const campaignMap = new Map();
  SPList.forEach(item => {
    const cId = String(item.campaignId);
    if (!campaignMap.has(cId)) {
      campaignMap.set(cId, item);
    } else {
      const existing = campaignMap.get(cId);
      if (new Date(item.createdAt || 0) < new Date(existing.createdAt || 0)) {
        campaignMap.set(cId, item);
      }
    }
  });

  const deduplicatedList = Array.from(campaignMap.values());

  let body = deduplicatedList.map(item => {
    if (item.changed === "state") {
      return {
        campaignId: String(item?.campaignId),
        state: item?.oldValue
      };
    } else {
      return {
        campaignId: String(item?.campaignId),
        budget: {
          budget: parseFloat(item?.oldValue),
          budgetType: "DAILY"
        }
      };
    }
  });
  try {
    const options = {
      method: "PUT",
      url: `${profile.amazonUrl}/sp/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Prefer": "return=representation",
        "Accept": "application/vnd.spCampaign.v3+json",
        "Content-Type": "application/vnd.spCampaign.v3+json",
      },
      data: { campaigns: body },
      meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
    };

    const response = await retryWithBackoff(() => amazonAxios(options));

    write_logs({
      message: `revertedSPRuleEffect -> Response: ${JSON.stringify(response.data)}`,
      log_type: "info",
    });

    if (response.status === 207) {
      const successIds = new Set((response.data?.campaigns?.success || []).map(c => String(c.campaignId)));
      const errorMap = Object.fromEntries((response.data?.campaigns?.error || []).map(c => [String(c.campaignId), c.description]));

      SPList.forEach(item => {
        if (successIds.has(String(item.campaignId))) {
          succeeded.push(item);
        } else {
          failed.push({ _id: item._id, reason: errorMap[String(item.campaignId)] || "Amazon rejected this campaign" });
        }
      });

      await Promise.all(
        succeeded.map(async (item) => {

          const oldValue = item?.newValue
          const newValue = item?.oldValue

          await affectedCampaignByRuleSchema.findByIdAndUpdate(
            item._id,
            {
              $set: {
                isReverted: true,
                isActive: false,
                closedAt: new Date(),
              },
              $push: {
                metricsHistory: {
                  timestamp: new Date(),
                  date: currentDate,
                  time: moment().tz(profile.timezone).format("hh:mm A"),
                  impressions: item.impressions || 0,
                  clicks: item.clicks || 0,
                  spend: item.spend || 0,
                  sales: item.sales || 0,
                  orders: item.orders || 0,
                  acos: item.acos || 0,
                  roas: item.roas || 0,
                  cpc: item.cpc || 0,
                  ctr: item.ctr || 0,
                  settingValue: String(newValue ?? ""),
                  eventType: "FINAL_SNAPSHOT",
                  notes: "Rule changes reverted to baseline",
                }
              }
            },
          );

          await createHistory(
            item.campaignId,
            `Revert: Update Campaign ${item.changed}`,
            oldValue,
            newValue,
            rule.configId,
            rule.profileId,
            rule.userId,
            "SP"
          );

          const updateField = item.changed === "state" ? { status: newValue } : { budget: newValue };
          await campaignsSchema.findOneAndUpdate(
            {
              configId: rule.configId,
              profileId: rule.profileId,
              campaignId: item.campaignId,
              reportDate: currentDate,
            },
            { $set: updateField },
          ).lean();
        })
      );

    } else {
      SPList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
    }
  } catch (err) {
    write_logs({
      message: `revertedSPRuleEffect -> Error: ${err.message}`,
      log_type: "error",
    });
    SPList.forEach(item => failed.push({ _id: item._id, reason: err.message }));
  }

  return { succeeded, failed };
}

const revertedSBRuleEffect = async (SBList, rule, checkConfigAds, profile) => {
  const now = moment().tz(profile.timezone);
  const currentDate = now.format("YYYY-MM-DD");

  const succeeded = [];
  const failed = [];

  if (!SBList?.length) return { succeeded, failed };

  // Deduplicate by campaignId, keeping earliest baseline oldValue
  const campaignMap = new Map();
  SBList.forEach(item => {
    const cId = String(item.campaignId);
    if (!campaignMap.has(cId)) {
      campaignMap.set(cId, item);
    } else {
      const existing = campaignMap.get(cId);
      if (new Date(item.createdAt || 0) < new Date(existing.createdAt || 0)) {
        campaignMap.set(cId, item);
      }
    }
  });

  const deduplicatedList = Array.from(campaignMap.values());

  let body = deduplicatedList.map(item => {
    if (item.changed === "state") {
      return {
        campaignId: String(item?.campaignId),
        state: item?.oldValue
      };
    } else {
      return {
        campaignId: String(item?.campaignId),
        budget: parseFloat(item?.oldValue),
      };
    }
  });

  try {
    const options = {
      method: "PUT",
      url: `${profile.amazonUrl}/sb/v4/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Prefer": "return=representation",
        "Accept": "application/vnd.sbcampaignresource.v4+json",
        "Content-Type": "application/vnd.sbcampaignresource.v4+json",
      },
      data: { campaigns: body },
      meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
    };

    const response = await retryWithBackoff(() => amazonAxios(options));

    write_logs({
      message: `revertedSBRuleEffect -> Response: ${JSON.stringify(response.data)}`,
      log_type: "info",
    });

    if (response.status === 207) {
      const successIds = new Set((response.data?.campaigns?.success || []).map(c => String(c.campaignId)));
      const errorMap = Object.fromEntries((response.data?.campaigns?.error || []).map(c => [String(c.campaignId), c.description]));

      SBList.forEach(item => {
        if (successIds.has(String(item.campaignId))) {
          succeeded.push(item);
        } else {
          failed.push({ _id: item._id, reason: errorMap[String(item.campaignId)] || "Amazon rejected this campaign" });
        }
      });

      await Promise.all(
        succeeded.map(async (item) => {

          const oldValue = item?.newValue;
          const newValue = item?.oldValue;

          await affectedCampaignByRuleSchema.findByIdAndUpdate(
            item._id,
            {
              $set: {
                isReverted: true,
                isActive: false,
                closedAt: new Date(),
              },
              $push: {
                metricsHistory: {
                  timestamp: new Date(),
                  date: currentDate,
                  time: moment().tz(profile.timezone).format("hh:mm A"),
                  impressions: item.impressions || 0,
                  clicks: item.clicks || 0,
                  spend: item.spend || 0,
                  sales: item.sales || 0,
                  orders: item.orders || 0,
                  acos: item.acos || 0,
                  roas: item.roas || 0,
                  cpc: item.cpc || 0,
                  ctr: item.ctr || 0,
                  settingValue: String(newValue ?? ""),
                  eventType: "FINAL_SNAPSHOT",
                  notes: "Rule changes reverted to baseline",
                }
              }
            },
          );

          await createHistory(
            item.campaignId,
            `Revert: Update Campaign ${item.changed}`,
            oldValue,
            newValue,
            rule.configId,
            rule.profileId,
            rule.userId,
            "SB"
          );

          const updateField = item.changed === "state" ? { status: newValue } : { budget: newValue };
          await sbCampaignsSchema.findOneAndUpdate(
            {
              configId: rule.configId,
              profileId: rule.profileId,
              campaignId: item.campaignId,
              reportDate: currentDate,
            },
            { $set: updateField },
          ).lean();
        })
      );

    } else {
      SBList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
    }
  } catch (err) {
    write_logs({
      message: `revertedSBRuleEffect -> Error: ${err.message}`,
      log_type: "error",
    });
    SBList.forEach(item => failed.push({ _id: item._id, reason: err.message }));
  }

  return { succeeded, failed };
}

const revertedSDRuleEffect = async (SDList, rule, checkConfigAds, profile) => {
  const now = moment().tz(profile.timezone);
  const currentDate = now.format("YYYY-MM-DD");

  const succeeded = [];
  const failed = [];

  if (!SDList?.length) return { succeeded, failed };

  // Deduplicate by campaignId, keeping earliest baseline oldValue
  const campaignMap = new Map();
  SDList.forEach(item => {
    const cId = String(item.campaignId);
    if (!campaignMap.has(cId)) {
      campaignMap.set(cId, item);
    } else {
      const existing = campaignMap.get(cId);
      if (new Date(item.createdAt || 0) < new Date(existing.createdAt || 0)) {
        campaignMap.set(cId, item);
      }
    }
  });

  const deduplicatedList = Array.from(campaignMap.values());

  let body = deduplicatedList.map(item => {
    if (item.changed === "state") {
      return {
        campaignId: String(item?.campaignId),
        state: `${item?.oldValue}`.toLowerCase(),
      };
    } else {
      return {
        campaignId: String(item?.campaignId),
        budget: parseFloat(item?.oldValue),
      };
    }
  });

  try {
    const options = {
      method: "PUT",
      url: `${profile.amazonUrl}/sd/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Prefer": "return=representation",
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      data: body,
      meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
    };

    const response = await retryWithBackoff(() => amazonAxios(options));

    write_logs({
      message: `revertedSDRuleEffect -> Response: ${JSON.stringify(response.data)}`,
      log_type: "info",
    });

    if (response.status === 207) {
      const responseArray = response.data || [];

      SDList.forEach((item, index) => {
        const result = responseArray[index];
        if (result?.code === "SUCCESS") {
          succeeded.push(item);
        } else {
          failed.push({ _id: item._id, reason: result?.description || result?.code || "Amazon rejected this campaign" });
        }
      });

      await Promise.all(
        succeeded.map(async (item) => {

          const oldValue = item?.newValue;
          const newValue = item?.oldValue;

          await affectedCampaignByRuleSchema.findByIdAndUpdate(
            item._id,
            {
              $set: {
                isReverted: true,
                isActive: false,
                closedAt: new Date(),
              },
              $push: {
                metricsHistory: {
                  timestamp: new Date(),
                  date: currentDate,
                  time: moment().tz(profile.timezone).format("hh:mm A"),
                  impressions: item.impressions || 0,
                  clicks: item.clicks || 0,
                  spend: item.spend || 0,
                  sales: item.sales || 0,
                  orders: item.orders || 0,
                  acos: item.acos || 0,
                  roas: item.roas || 0,
                  cpc: item.cpc || 0,
                  ctr: item.ctr || 0,
                  settingValue: String(newValue ?? ""),
                  eventType: "FINAL_SNAPSHOT",
                  notes: "Rule changes reverted to baseline",
                }
              }
            },
          );

          await createHistory(
            item.campaignId,
            `Revert: Update Campaign ${item.changed}`,
            oldValue,
            newValue,
            rule.configId,
            rule.profileId,
            rule.userId,
            "SD"
          );

          const updateField = item.changed === "state" ? { status: newValue } : { budget: newValue };
          await sdCampaignsSchema.findOneAndUpdate(
            {
              configId: rule.configId,
              profileId: rule.profileId,
              campaignId: item.campaignId,
              reportDate: currentDate,
            },
            { $set: updateField },
          ).lean();
        })
      );

    } else {
      SDList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
    }
  } catch (err) {
    write_logs({
      message: `revertedSDRuleEffect -> Error: ${err.message}`,
      log_type: "error",
    });
    SDList.forEach(item => failed.push({ _id: item._id, reason: err.message }));
  }

  return { succeeded, failed };
}

function getNextTime(times, afterTime) {
  times.sort(); // Ensure the times are sorted in ascending order
  const index = times.findIndex((time) => time > afterTime);
  return index !== -1 ? times[index] : "-";
}


const createHistory = async (campaignId, changeType, oldValue, newValue, configId, profileId, userId, type, explicitSource) => {
  if (oldValue == newValue) return;

  const recentDuplicate = await campaignChangeHistorySchema?.findOne({
    configId,
    profileId,
    changeLevel: campaignId,
    changeType,
    newValue,
    createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
  }).lean();

  if (recentDuplicate) return;

  const computedSource = explicitSource || (/dayparting/i.test(changeType) ? "DAYPARTING" : "RULE");

  await campaignChangeHistorySchema?.create({
    configId,
    profileId,
    changeLevel: campaignId,
    changeType: changeType,
    oldValue,
    newValue,
    updatedFrom: "Campaign",
    source: computedSource,
    userId,
    type: type || "SP"
  });
};

exports.exportBudgetRule = async (req, res) => {
  try {
    const { configId } = req?.config;
    const { profileId, exportIds } = req.body;

    const query = { configId, profileId };

    // ✅ Apply ruleIds filter if provided
    if (Array.isArray(exportIds) && exportIds?.length) {
      query._id = { $in: exportIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) };
    }

    const rules = await budgetRulesSchema.find(query).lean();

    const workbook = new ExcelJS.Workbook();

    const metaSheet = workbook.addWorksheet("_META");
    const secretPayload = `BUDGET_RULE`;
    const signature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(secretPayload).digest("hex");
    metaSheet.getCell("A1").value = signature;
    metaSheet.state = "hidden";

    const sheet = workbook.addWorksheet("BudgetRules");

    sheet.columns = [
      // { header: "Profile ID", key: "profileId", width: 18 },
      // { header: "Config ID", key: "configId", width: 18 },
      // { header: "User ID", key: "userId", width: 18 },

      { header: "Rule Name", key: "ruleName", width: 25 },
      { header: "Is Active", key: "isActive", width: 12 },

      { header: "Query", key: "query", width: 50 },
      { header: "Campaign IDs", key: "campaignIds", width: 30 },

      { header: "Conditions", key: "conditions", width: 40 },
      { header: "Actions", key: "actionType", width: 40 },

      { header: "Budget Threshold", key: "budgetThreshold", width: 40 },

      { header: "Report Date", key: "reportDate", width: 15 },
      { header: "To Date", key: "toDate", width: 15 },

      { header: "Days", key: "days", width: 25 },
      { header: "Times", key: "times", width: 25 },

      { header: "Rule Type", key: "ruleType", width: 20 },
      { header: "Start Date", key: "startDate", width: 20 },
      { header: "End Date", key: "endDate", width: 20 },

      { header: "Allow Multi Time Changes", key: "allowMultiTimeChanges", width: 25 },

      { header: "Days Since Creation", key: "daysSinceCreation", width: 15 },
      { header: "Is Days Since Creation", key: "isDaysSinceCreation", width: 15 },

      // { header: "Country Code", key: "countryCode", width: 15 },
      // { header: "Timezone", key: "timezone", width: 20 },
    ];

    // ✅ Normalize → Rows
    rules.forEach(rule => {
      sheet.addRow({
        // profileId: `${rule.profileId}`,
        // configId: rule.configId,
        // userId: rule.userId,

        ruleName: rule.ruleName,
        isActive: rule.isActive,

        query: JSON.stringify({
          SP: removeCampaignIdFromQuery(rule?.query?.SP) || "",
          SB: removeCampaignIdFromQuery(rule?.query?.SB) || "",
          SD: removeCampaignIdFromQuery(rule?.query?.SD) || ""
        }),

        // 🔑 Arrays / Objects → JSON STRING
        campaignIds: JSON.stringify({ SP: [], SB: [], SD: [] }),
        conditions: JSON.stringify(rule.conditions ?? []),
        actionType: JSON.stringify(rule.actionType ?? []),
        budgetThreshold: JSON.stringify(rule?.budgetThreshold ?? {}),
        days: JSON.stringify(rule.days ?? []),
        times: JSON.stringify(rule.times ?? []),

        reportDate: rule.reportDate ?? "",
        toDate: rule.toDate ?? "",

        ruleType: rule.ruleType ?? "",
        startDate: rule.startDate ?? "",
        endDate: rule.endDate ?? "",

        allowMultiTimeChanges: rule.allowMultiTimeChanges ?? false,

        daysSinceCreation: rule.daysSinceCreation ?? 0,
        isDaysSinceCreation: rule.isDaysSinceCreation ?? false,

        // countryCode: rule.countryCode ?? "",
        // timezone: rule.timezone ?? "",
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
      `attachment; filename=BudgetRules_${profileId}.xlsx`
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition"
    );

    await workbook.xlsx.write(res);
    return res.end();

  } catch (error) {
    write_logs({ message: `[exportBudgetRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error(error);
    return res.status(500).send({
      isSuccess: false,
      message: "Export failed",
      error: "An internal server error occurred",
    });
  }
};

exports.importBudgetRule = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const { configId } = req?.config;
    const { profileId, duplicateAction } = req.body;
    const isReplace = duplicateAction === "replace";

    if (!req.file) {
      return res.status(203).send({
        isSuccess: false,
        message: "Excel file is required",
      });
    }

    const profile = await profileSchema.findOne({ configId, profileId }).lean();
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
    const expectedPayload = `BUDGET_RULE`;

    const storedSignature = metaSheet.getCell("A1").value;
    const expectedSignature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(expectedPayload).digest("hex");

    if (storedSignature !== expectedSignature) {
      return res.status(203).send({
        isSuccess: false,
        message: "Invalid file. Please upload a valid Budget Rule export file."
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
    const existingRules = await budgetRulesSchema.find({ configId, profileId, userId }, { _id: 1, conditions: 1 }).lean();

    /** -----------------------------
     * 3️⃣ Build bulk ops
     * ----------------------------- */
    const bulkOps = [];
    const errors = [];
    let skippedCount = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      try {
        const ruleName = row.getCell("A").value;
        const conditions = safeJsonParse(row.getCell("E").value || "[]");

        if (!ruleName || !conditions.length) {
          skippedCount++;
          return;
        }

        // Skip duplicate
        const matchedRule = checkDuplicateBudgetRule(existingRules, conditions);
        if (!isReplace && matchedRule) {
          skippedCount++;
          return;
        }

        const data = {
          profileId,
          configId,
          userId,

          ruleName,
          isActive: row.getCell("B").value === true,

          query: safeJsonParse(row.getCell("C").value || "{ SP: '', SB: '', SD: '' }"),
          campaignIds: safeJsonParse(row.getCell("D").value || "{ SP: [], SB: [], SD: [] }"),

          conditions,
          actionType: safeJsonParse(row.getCell("F").value || "[]"),
          budgetThreshold: safeJsonParse(row.getCell("G").value || "{}"),

          reportDate: row.getCell("H").value,
          toDate: row.getCell("I").value,

          days: safeJsonParse(row.getCell("J").value || "[]"),
          times: safeJsonParse(row.getCell("K").value || "[]"),

          ruleType: row.getCell("L").value,
          startDate: row.getCell("M").value,
          endDate: row.getCell("N").value,

          allowMultiTimeChanges: row.getCell("O").value === true,

          isDaysSinceCreation: row.getCell("P").value === true,
          daysSinceCreation: row.getCell("Q").value,

          countryCode: profile?.currencyCode,
          timezone: profile?.timezone,
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
        write_logs({ message: `[importBudgetRule Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        errors.push({
          row: rowNumber,
          message: err.message,
        });
      }
    });

    if (bulkOps.length) {
      await prepareSnapshotBulkUpdates(budgetRulesSchema, bulkOps);
      await budgetRulesSchema.bulkWrite(bulkOps);
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
    write_logs({ message: `[importBudgetRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      isSuccess: false,
      message: "Import failed",
      error: "An internal server error occurred",
    });
  }
};
