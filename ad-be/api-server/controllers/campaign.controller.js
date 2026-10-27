const moment = require("moment-timezone");
const fs = require("fs");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const path = require("path");
const axios = require("axios");
const { Buffer } = require("buffer");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT) || 10);
const amsLimit = pLimit(50);
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");
const { SQSClient, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const sift = require("sift").default;

const campaignsSchema = require("../models/campaign.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const averageAOVSchema = require("../models/averageAOV.model");
const defaultTargetAcosSchema = require("../models/defaultTargetAcos.model");
const profileSchema = require("../models/profiles.model");
const reportsSchema = require("../models/report.model");
const placementSchema = require("../models/placement.model");
const adGroupsSchema = require("../models/adGroups.model");
const keywordSchema = require("../models/keyword.model");
const targetingSchema = require("../models/targeting.model");
const camapignSetting = require("../models/camapignSetting.model");
const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const limitedCPCSchema = require("../models/limitedCPC.model");
const productAdsSchema = require("../models/productAds.model");
const searchTermReportSchema = require("../models/searchTerm.model");
const keywordsHourlyPerformanceSchema = require("../models/keywordsHourlyPerformanceSchema.model");
const orderSchema = require("../models/order.model");
const SQSMessageSchema = require("../models/sqsMessages.model");
const processedSQSMessageSchema = require("../models/processedSQSMessage.model");
const cronJobSchema = require("../models/cronJob.model");
const adNotificationSchema = require("../models/adNotification.model");
const adNotificationSettingSchema = require("../models/adNotificationSetting.model");
const campaignBidThresholdSchema = require("../models/campaignBidThreshold.model");
const bidDataSchema = require("../models/bidData.model");
const budgetRulesSchema = require("../models/budgetRules.model");
const targetingRuleSchema = require("../models/targetingRuleSchema.model");
const placementRulesSchema = require("../models/placementRules.model");
const profitLossHistorySchema = require("../models/profitLossHistory.model");
const healthScoreSettingSchema = require("../models/healthScoreSetting.model");
const pageSchema = require("../models/superAdmin/pages.model");
const filterSchema = require("../models/filter.model");
const performanceScoreSettingSchema = require("../models/performanceScoreSetting.model");
const profileBasedPermissionModel = require("../models/profileBasedPermission.model");

const sbCampaignsSchema = require("../models/sbCampaign.model");
const sbPlacementSchema = require("../models/sbPlacement.model");
const sbTargetingSchema = require("../models/sbTargeting.model");
const { write_logs } = require("../../winston/campaigns/logger");
const sdCampaignsSchema = require("../models/sdCampaign.model");
const sdTargetingSchema = require("../models/sdTargeting.model");
const sdAdGroupSchema = require("../models/sdAdGroups.model");
const targetingHistorySchema = require("../models/targetingHistory.model");

const {
  getProfile,
  getAccessToken,
  parallelBulkWrite,
  downloadFile,
  unzipReport,
  calcMetrics,
  parseStrictMetric,
  safeJSON,
  getActivePlanProfiles,
  getRuleDate,
  autoAssignCampaignToAllRuleTypes,
  safeJsonParse,
  getAllowedSyncProfiles,
  getAxiosErrorMessage,
} = require("../helper/common");
const { stageReportFileInRedis } = require("../services/reportFileStager.service");
const { processStagedReportBatches } = require("../services/reportBatchWriter.service");
const { linkReportHistory } = require("../services/reportHistoryCompletion.service");

const { write_logs: ams_write_logs } = require("../../winston/ams/logger");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const { ARN_MAP } = require("../helper/amsArn");

const {
  buildSqsQueueAlertEmail,
} = require("../../emailTemplate/buildSqsQueueAlertEmail");
const {
  buildSqsConfirmationEmail,
} = require("../../emailTemplate/buildSqsConfirmationEmail");
const { sendNotificationToUser } = require("../helper/sendNotification");
const { sendEmailHelper } = require("../helper/emailHelper");

const {
  generatePlacementAndTargetingAnalysis,
  generateSearchTermsAnalysis,
} = require("../helper/chatgpt");
const amazonAxios = require("../helper/amazonAxios");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { retryWithBackoff } = require("../helper/retryHelper");
const {
  addHealthScoreSettingQuery,
  addCampaignSettingPipelineQuery,
} = require("../helper/generateQuery");
const {
  AddToTargeting,
  AddToNegativeTargeting,
} = require("../helper/recommendation");
const {
  fetchBrands,
  fetchPortfolios,
  fetchStores,
  fetchStorePages,
  fetchFirstSBAd,
  fetchSDCreativePreview,
  fetchSDCreatives,
} = require("../helper/amazonBrandApi");
const { logAudit } = require("../helpers/auditHelper");
const { sanitizeQueryObject } = require("../helper/sanitizeQuery");

RegExp.escape = function (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Unified Campaign Status Update in Amazon Advertising
exports.updateCampaignStatus = async (req, res) => {
  const configId = req?.config?.configId;
  try {
    const { profileId, campaignId, status } = req.body;

    if (!profileId || !campaignId || !status) {
      return res.status(203).send({
        isSuccess: false,
        message: "Profile ID, Campaign ID, and status are required.",
      });
    }

    // Validate status
    const validStatuses = ["ENABLED", "PAUSED", "ARCHIVED"];
    if (!validStatuses.includes(status.toUpperCase())) {
      return res.status(203).send({
        isSuccess: false,
        message: `Invalid status. Valid statuses are: ${validStatuses.join(", ")}`,
      });
    }

    const checkConfigAds = await getAccessToken(configId);
    if (!checkConfigAds || !checkConfigAds.adsAccessToken) {
      return res.status(203).send({
        isSuccess: false,
        message: "Account disconnected. Please reconnect your Amazon account.",
      });
    }

    const getAccount = await getProfile(configId, profileId);
    const updateBodyData = {
      campaigns: [
        {
          campaignId: parseInt(campaignId),
          state: status.toUpperCase(),
        },
      ],
    };

    // const updateOptions = {
    //   method: "PUT",
    //   url: `${getAccount.amazonUrl}/sp/campaigns`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     "Content-Type": "application/vnd.spCampaign.v3+json",
    //   },
    //   data: updateBodyData,
    // };

    // const response = await axios(updateOptions);

    // if (response.status === 200) {
    //   // Update local campaign status
    //   const currentDate = moment().tz(getAccount.timezone).format("YYYY-MM-DD");
    //   await campaignsSchema.updateOne(
    //     {
    //       configId,
    //       profileId,
    //       campaignId: parseInt(campaignId),
    //       reportDate: currentDate,
    //     },
    //     {
    //       $set: {
    //         status: status.toUpperCase(),
    //         updatedAt: new Date(),
    //       },
    //     }
    //   );

    //   write_logs({
    //     message: `Campaign status updated to ${status.toUpperCase()} - Config ID: ${configId}, Profile: ${profileId}, Campaign: ${campaignId}`,
    //     log_type: "info",
    //   });

    //   return res.status(200).send({
    //     isSuccess: true,
    //     message: `Campaign ${status.toLowerCase()} successfully in Amazon Advertising.`,
    //   });
    // } else {
    //   return res.status(203).send({
    //     isSuccess: false,
    //     message: `Failed to ${status.toLowerCase()} campaign in Amazon Advertising.`,
    //     error: response.data,
    //   });
    // }
  } catch (error) {
    write_logs({
      message: `Update campaign status error - Config ID: ${configId}, Error: ${error}`,
      log_type: "error",
    });

    return res.status(203).send({
      message: `Something went wrong while updating campaign status, please try again!`,
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getCampaigns = async (req, res) => {
  const configId = req?.config?.configId;
  const { adTypeCampaignSchema, adTypePlacementSchema } = req.models;

  try {
    let {
      fromDate,
      toDate,
      profileId,
      pageNo = 1,
      perPage = 10,
      type,
      status,
      searchName,
      fieldName,
      fieldOperator,
      fieldValue,
      conditions,
      extraFieldOperator,
      extraFieldValue,
      sortType,
      customFilter,
      filteredCampaignIds,
      profitFilter,
    } = req.body;
    customFilter = sanitizeQueryObject(safeJSON(customFilter));

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required." });
    }

    const profile = await getProfile(configId, profileId);
    const timezone = profile.timezone;
    const hasActiveCampaigns = await campaignsSchema.exists({
      configId,
      profileId: Number(profileId),
      status: "ENABLED",
      reportDate: { $gte: moment().subtract(2, "days").format("YYYY-MM-DD") }
    });

    const reportDate = {
      $gte: fromDate || moment().tz(timezone).format("YYYY-MM-DD"),
      $lte: toDate || moment().tz(timezone).format("YYYY-MM-DD"),
    };

    const cpSetting = await camapignSetting.findOne({ profileId, ...(configId && { configId }) }).lean();
    const healthScore = await healthScoreSettingSchema
      .find({
        configId: configId,
        profileId: profileId,
      })
      .lean();

    const performanceScore = await performanceScoreSettingSchema
      .find({
        configId: configId,
        profileId: profileId,
      })
      .lean();

    const healthScoreBranches = healthScore.map((hs) => ({
      case: addCampaignSettingPipelineQuery(hs.conditions, cpSetting),
      then: hs.scoreName,
    }));

    const performanceScoreBranches = performanceScore.map((hs) => ({
      case: addCampaignSettingPipelineQuery(hs.conditions, cpSetting),
      then: hs.scoreName,
    }));

    const queryConfigId = mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId;
    const queryProfileId = !isNaN(Number(profileId)) ? Number(profileId) : profileId;
    const cleanFilteredCampaignIds = Array.isArray(filteredCampaignIds) && filteredCampaignIds.length > 0
      ? filteredCampaignIds.flatMap((id) => [id, !isNaN(Number(id)) ? Number(id) : null, String(id)].filter(Boolean))
      : [];

    const todayDate = moment().tz(timezone || "UTC").format("YYYY-MM-DD");
    const yesterdayDate = moment().tz(timezone || "UTC").subtract(1, "days").format("YYYY-MM-DD");
    const effectiveStatusMaxDate = (toDate && toDate < todayDate) ? toDate : todayDate;
    const statusReportDateMin = moment(effectiveStatusMaxDate).subtract(14, "days").format("YYYY-MM-DD");

    // Base match stage
    const matchStage = {
      $match: {
        configId: queryConfigId,
        profileId: queryProfileId,
        reportDate,
        ...(cleanFilteredCampaignIds.length > 0 && {
          campaignId: { $in: cleanFilteredCampaignIds },
        }),
        ...(type && { type }),
        ...(searchName && {
          name: {
            $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i"),
          },
        }),
      },
    };

    let effectiveStatusFilter = status;
    if (!effectiveStatusFilter && customFilter?.$or && Array.isArray(customFilter.$or)) {
      if (customFilter.$or.some(c => c.status === "OUT_OF_BUDGET" || c.status === "out_of_budget")) {
        effectiveStatusFilter = "OUT_OF_BUDGET";
      }
    }
    if (customFilter && customFilter.$or && Array.isArray(customFilter.$or)) {
      if (customFilter.$or.some(c => c.status === "OUT_OF_BUDGET" || c.status === "out_of_budget")) {
        delete customFilter.$or;
      }
    }
    if (customFilter?.status) {
      if (!effectiveStatusFilter) effectiveStatusFilter = customFilter.status?.$eq || customFilter.status;
      delete customFilter.status;
    }

    const latestStatusMap = new Map();

    if (effectiveStatusFilter) {
      try {
        const latestStatusDocs = await adTypeCampaignSchema.aggregate([
          {
            $match: {
              configId: queryConfigId,
              profileId: queryProfileId,
              reportDate: { $gte: statusReportDateMin, $lte: effectiveStatusMaxDate },
            },
          },
          {
            $sort: { reportDate: -1, updatedAt: -1 },
          },
          {
            $group: {
              _id: "$campaignId",
              status: { $first: "$status" },
              campaignStatus: { $first: "$campaignStatus" },
              isOutOfBudget: { $first: "$isOutOfBudget" },
              budget: { $first: "$budget" },
              dailySpend: { $first: { $ifNull: ["$dailySpend", "$spend"] } },
              timeInBudget: { $first: "$timeInBudget" },
              budgetTracking: { $first: "$budgetTracking" },
              latestReportDate: { $first: "$reportDate" },
            },
          },
        ]).allowDiskUse(true);

        const matchingCampaignIds = [];
        for (const doc of latestStatusDocs) {
          latestStatusMap.set(doc._id, doc);
          latestStatusMap.set(String(doc._id), doc);
          latestStatusMap.set(Number(doc._id), doc);

          const currentStatus = (doc.status || "").toUpperCase();
          const campaignStatusVal = (doc.campaignStatus || "").toUpperCase();
          const dailySpend = doc.dailySpend !== undefined && doc.dailySpend !== null ? Number(doc.dailySpend) : null;
          const budget = Number(doc.budget) || 0;
          const timeInBudget = doc.timeInBudget !== undefined && doc.timeInBudget !== null ? Number(doc.timeInBudget) : undefined;
          const estSpend = Number(doc.budgetTracking?.estimatedSpend) || 0;
          const usagePct = Number(doc.budgetTracking?.lastUsagePercentage) || 0;

          const isDocOob = Boolean(
            currentStatus === "OUT_OF_BUDGET" ||
            campaignStatusVal === "OUT_OF_BUDGET" ||
            doc.isOutOfBudget === true ||
            (currentStatus === "ENABLED" && budget > 0 && (
              usagePct >= 100 ||
              estSpend >= budget ||
              (dailySpend !== null && dailySpend >= budget) ||
              (timeInBudget !== undefined && timeInBudget > 0 && timeInBudget < 100 && (
                (dailySpend !== null && dailySpend >= budget * 0.8) ||
                (estSpend >= budget * 0.8)
              ))
            ))
          );

          if (effectiveStatusFilter === "OUT_OF_BUDGET" || effectiveStatusFilter === "out_of_budget") {
            if (isDocOob) {
              matchingCampaignIds.push(doc._id);
            }
          } else if (effectiveStatusFilter === "NOT_ARCHIVED") {
            if (currentStatus !== "ARCHIVED") {
              matchingCampaignIds.push(doc._id);
            }
          } else if (effectiveStatusFilter === "ENABLED") {
            if (currentStatus === "ENABLED") {
              matchingCampaignIds.push(doc._id);
            }
          } else if (effectiveStatusFilter === "PAUSED") {
            if (currentStatus === "PAUSED") {
              matchingCampaignIds.push(doc._id);
            }
          } else if (effectiveStatusFilter === "ARCHIVED") {
            if (currentStatus === "ARCHIVED") {
              matchingCampaignIds.push(doc._id);
            }
          } else if (currentStatus === String(effectiveStatusFilter).toUpperCase()) {
            matchingCampaignIds.push(doc._id);
          }
        }

        const numericAndStringMatchingIds = matchingCampaignIds.flatMap(id => [id, !isNaN(Number(id)) ? Number(id) : null, String(id)].filter(Boolean));

        if (matchStage.$match.campaignId?.$in) {
          matchStage.$match.campaignId.$in = matchStage.$match.campaignId.$in.filter(id => numericAndStringMatchingIds.includes(id));
        } else {
          matchStage.$match.campaignId = { $in: numericAndStringMatchingIds };
        }
      } catch (err) {
        write_logs({ message: `[getCampaigns status filtering error] ${err?.message || err}`, log_type: "error" });
      }
    }

    const commonPipeline = [
      matchStage,
      { $sort: { reportDate: -1 } },
      {
        $group: {
          _id: { campaignId: "$campaignId" },
          campaign: { $first: "$$ROOT" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          orders: { $sum: "$orders" },
          timeInBudget: { $last: "$timeInBudget" },
          keywordBid: { $first: "$keywordBid" },
        },
      },
      {
        $project: {
          _id: 0,
          budgetType: "$campaign.budgetType",
          startDate: "$campaign.startDate",
          endDate: "$campaign.endDate",
          type: "$campaign.type",
          campaignId: "$_id.campaignId",
          targetingType: "$campaign.targetingType",
          costType: "$campaign.costType",
          name: "$campaign.name",
          status: "$campaign.status",
          budget: "$campaign.budget",
          keywordBid: 1,
          impressions: 1,
          clicks: 1,
          orders: 1,
          sales: { $round: ["$sales", 2] },
          spend: { $round: ["$spend", 2] },
          timeInBudget: 1,
          conversion: {
            $cond: [
              { $gt: ["$clicks", 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] },
                  2,
                ],
              },
              0,
            ],
          },
          cpc: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$clicks", 0] },
                  then: { $divide: ["$spend", "$clicks"] },
                  else: 0,
                },
              },
              2,
            ],
          },
          ctr: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$impressions", 0] },
                  then: { $divide: ["$clicks", "$impressions"] },
                  else: 0,
                },
              },
              2,
            ],
          },
          acos: {
            $round: [
              {
                $cond: {
                  if: {
                    $gt: ["$sales", 0],
                  },
                  then: {
                    $multiply: [
                      {
                        $divide: ["$spend", "$sales"],
                      },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          roas: {
            $round: [
              {
                $cond: {
                  if: {
                    $gt: ["$spend", 0],
                  },
                  then: {
                    $divide: ["$sales", "$spend"],
                  },
                  else: 9999,
                },
              },
              2,
            ],
          },
        },
      },
      ...((status && !effectiveStatusFilter)
        ? [
          {
            $match: status === "OUT_OF_BUDGET"
              ? {
                $or: [
                  { status: "OUT_OF_BUDGET" },
                  { status: "out_of_budget" },
                ]
              }
              : hasActiveCampaigns
                ? { status: status }
                : {
                  $or: [
                    { status: status },
                    { spend: { $gt: 0 } },
                    { clicks: { $gt: 0 } },
                  ],
                },
          },
        ]
        : []),
      {
        $addFields: {
          healthScore: healthScoreBranches?.length
            ? { $switch: { branches: healthScoreBranches, default: "" } }
            : "",
        },
      },
      {
        $addFields: {
          performanceCategory: performanceScoreBranches?.length
            ? { $switch: { branches: performanceScoreBranches, default: "" } }
            : "",
        },
      },
      ...(customFilter && Object.keys(customFilter).length > 0
        ? [{ $match: customFilter }]
        : []),
    ];

    if (profitFilter) {
      commonPipeline.push({ $match: { performanceCategory: profitFilter } });
    }

    // Add field filtering to the pipeline
    if (fieldName && fieldOperator && fieldValue !== undefined) {
      const fieldFilter = { [fieldName]: { [fieldOperator]: fieldValue } };

      if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
        const extraFieldFilter = {
          [fieldName]: { [extraFieldOperator]: extraFieldValue },
        };

        // Create proper MongoDB logical operator
        const logicalOperator = {
          [`$${conditions.toLowerCase()}`]: [fieldFilter, extraFieldFilter],
        };

        commonPipeline.push({ $match: logicalOperator });
      } else {
        commonPipeline.push({ $match: fieldFilter });
      }
    }

    // Add sorting
    const sortStage = {};
    if (sortType === "ASC") {
      sortStage[fieldName] = 1;
    } else if (sortType === "DESC") {
      sortStage[fieldName] = -1;
    } else {
      sortStage.acos = -1;
      sortStage.updatedAt = -1;
    }

    // Main pipeline with facet
    const pipeline = [
      ...commonPipeline,
      {
        $group: {
          _id: null,
          data: { $push: "$$ROOT" },
          totalBudget: { $sum: "$budget" },
          totalSpend: { $sum: "$spend" },
          totalSales: { $sum: "$sales" },
          totalOrders: { $sum: "$orders" },
          totalImpressions: { $sum: "$impressions" },
          totalClicks: { $sum: "$clicks" },
          avgTimeInBudget: { $avg: "$timeInBudget" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          totalRow: {
            action: "Total",
            name: "Total",
            budget: { $round: ["$totalBudget", 2] },
            timeInBudget: { $round: ["$avgTimeInBudget", 2] },
            impressions: { $round: ["$totalImpressions", 2] },
            clicks: { $round: ["$totalClicks", 2] },
            orders: { $round: ["$totalOrders", 2] },
            spend: { $round: ["$totalSpend", 2] },
            sales: { $round: ["$totalSales", 2] },
            acos: {
              $round: [
                {
                  $cond: {
                    if: {
                      $gt: ["$totalSales", 0],
                    },
                    then: {
                      $multiply: [
                        {
                          $divide: ["$totalSpend", "$totalSales"],
                        },
                        100,
                      ],
                    },
                    else: 0,
                  },
                },
                2,
              ],
            },
            roas: {
              $round: [
                {
                  $cond: {
                    if: {
                      $gt: ["$totalSpend", 0],
                    },
                    then: {
                      $divide: ["$totalSales", "$totalSpend"],
                    },
                    else: 0,
                  },
                },
                2,
              ],
            },
            cpc: {
              $round: [
                {
                  $cond: {
                    if: { $gt: ["$totalClicks", 0] },
                    then: { $divide: ["$totalSpend", "$totalClicks"] },
                    else: 0,
                  },
                },
                2,
              ],
            },
            ctr: {
              $round: [
                {
                  $cond: {
                    if: { $gt: ["$totalImpressions", 0] },
                    then: { $divide: ["$totalClicks", "$totalImpressions"] },
                    else: 0,
                  },
                },
                2,
              ],
            },
            isTotalRow: true,
          },
          data: 1,
          count: 1,
        },
      },
      {
        $project: {
          totalRow: 1,
          totalRecords: "$count",
          // Paginate here
          data: {
            $slice: [
              {
                $sortArray: {
                  input: "$data",
                  sortBy: sortStage,
                },
              },
              (pageNo - 1) * perPage,
              perPage,
            ],
          },
        },
      },
    ];
    const result = await adTypeCampaignSchema.aggregate(pipeline);

    let campaignResult = result[0]?.data || [];
    const totalRecords = result[0]?.totalRecords || 0;
    const totalRow = result[0]?.totalRow || { action: "Total", name: "Total", budget: 0, timeInBudget: 0, impressions: 0, clicks: 0, orders: 0, spend: 0, sales: 0, acos: 0, roas: 0, cpc: 0, ctr: 0 };

    const campaignIds = campaignResult.map((campaign) => campaign?.campaignId);

    const getData = [
      {
        $match: {
          campaignId: { $in: campaignIds },
          profileId: Number(profileId),
          configId: new ObjectId(configId),
          reportDate: { $gte: fromDate, $lte: toDate },
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
            placement: "$placement",
          },
          placement: {
            $first: "$$ROOT",
          },
          spend: {
            $sum: "$spend",
          },
          sales: {
            $sum: "$sales",
          },
          impressions: {
            $sum: "$impressions",
          },
          clicks: {
            $sum: "$clicks",
          },
          orders: {
            $sum: "$orders",
          },
          conversion: {
            $sum: "$conversion",
          },
          units: {
            $sum: "$units",
          },
        },
      },
      {
        $group: {
          _id: "$_id.campaignId",
          campaignName: {
            $last: "$placement.campaignName",
          },
          campaignStatus: {
            $last: "$placement.campaignStatus",
          },
          type: {
            $last: "$placement.type",
          },
          keywordBid: {
            $last: "$placement.keywordBid",
          },
          placementsData: {
            $push: {
              campaignId: "$_id.campaignId",
              placement: "$_id.placement",
              clicks: "$clicks",
              impressions: "$impressions",
              sales: {
                $round: ["$sales", 2],
              },
              spend: {
                $round: ["$spend", 2],
              },
              orders: "$orders",
              units: "$units",
              acos: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$sales", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$spend", "$sales"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              roas: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$spend", 0],
                      },
                      then: {
                        $divide: ["$sales", "$spend"],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              cvr: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$clicks", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$orders", "$clicks"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              ctr: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$impressions", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$clicks", "$impressions"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              cpc: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$clicks", 0],
                      },
                      then: {
                        $divide: ["$spend", "$clicks"],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              conversion: {
                $round: ["$conversion", 2],
              },
              bidStrategy: "$placement.biddingStartegy",
              placementModifier: {
                $ifNull: ["$placement.placementModifier", 0],
              },
              targetAcos: {
                $ifNull: ["$placement.targetAcos", 0],
              },
              keywordBid: {
                $toDouble: {
                  $ifNull: ["$placement.keywordBid", 0],
                },
              },
              newKeywordBid: {
                $ifNull: ["$placement.newKeywordBid", 0],
              },
            },
          },
          totalImpressions: {
            $sum: "$impressions",
          },
          totalClicks: {
            $sum: "$clicks",
          },
          totalOrders: {
            $sum: "$orders",
          },
          totalUnits: {
            $sum: "$units",
          },
          totalSales: {
            $sum: "$sales",
          },
          totalSpend: {
            $sum: "$spend",
          },
        },
      },
      {
        $project: {
          _id: 0,
          campaignId: "$_id",
          placementsData: 1,
        },
      },
    ];
    placementSubResult = await adTypePlacementSchema.aggregate(getData);

    const allPlacements = ["Top of Search", "Product Pages", "Rest of Search"];
    placementSubResult = placementSubResult.map((campaign) => {
      const placementsData = allPlacements.map((placement) => {
        const placementData = campaign.placementsData.find((data) => {
          return (
            data.placement &&
            data.placement.toLowerCase() === placement.toLowerCase()
          );
        });
        return (
          placementData || {
            campaignId: campaign.campaignId,
            placement,
            clicks: 0,
            impressions: 0,
            sales: 0,
            spend: 0,
            orders: 0,
            units: 0,
            acos: 0,
            roas: 0,
            cvr: 0,
            ctr: 0,
            cpc: 0,
            conversion: 0,
          }
        );
      });
      return {
        campaignId: campaign.campaignId,
        placementsData,
      };
    });
    placementSubResult.sort((a, b) => {
      return (
        allPlacements.indexOf(a.placementsData[0].placement) -
        allPlacements.indexOf(b.placementsData[0].placement)
      );
    });

    // Fetch latest record status for each campaign (today's date or yesterday / latest updated record)
    const missingCampaignIds = campaignIds.filter((cid) => !latestStatusMap.has(cid) && !latestStatusMap.has(String(cid)) && !latestStatusMap.has(Number(cid)));
    if (missingCampaignIds.length > 0) {
      try {
        const missingList = missingCampaignIds.flatMap(id => [id, !isNaN(Number(id)) ? Number(id) : null, String(id)].filter(Boolean));
        // First try today or yesterday
        const targetMaxDate = (toDate && toDate < todayDate) ? toDate : todayDate;
        const targetYesterdayDate = moment(targetMaxDate).subtract(1, "days").format("YYYY-MM-DD");
        const latestCampaignDocs = await adTypeCampaignSchema.aggregate([
          {
            $match: {
              configId: queryConfigId,
              profileId: queryProfileId,
              campaignId: { $in: missingList },
              reportDate: { $gte: targetYesterdayDate, $lte: targetMaxDate },
            },
          },
          {
            $sort: { reportDate: -1, updatedAt: -1 },
          },
          {
            $group: {
              _id: "$campaignId",
              status: { $first: "$status" },
              campaignStatus: { $first: "$campaignStatus" },
              isOutOfBudget: { $first: "$isOutOfBudget" },
              budget: { $first: "$budget" },
              dailySpend: { $first: { $ifNull: ["$dailySpend", "$spend"] } },
              timeInBudget: { $first: "$timeInBudget" },
              budgetTracking: { $first: "$budgetTracking" },
              latestReportDate: { $first: "$reportDate" },
            },
          },
        ]);

        for (const doc of latestCampaignDocs) {
          latestStatusMap.set(doc._id, doc);
          latestStatusMap.set(String(doc._id), doc);
          latestStatusMap.set(Number(doc._id), doc);
        }

        // For any campaign not found in today/yesterday, fetch latest available record
        const stillMissing = missingCampaignIds.filter((cid) => !latestStatusMap.has(cid) && !latestStatusMap.has(String(cid)) && !latestStatusMap.has(Number(cid)));
        if (stillMissing.length > 0) {
          const fallbackDocs = await adTypeCampaignSchema.aggregate([
            {
              $match: {
                configId: queryConfigId,
                profileId: queryProfileId,
                campaignId: { $in: stillMissing.flatMap(id => [id, !isNaN(Number(id)) ? Number(id) : null, String(id)].filter(Boolean)) },
              },
            },
            {
              $sort: { reportDate: -1, updatedAt: -1 },
            },
            {
              $group: {
                _id: "$campaignId",
                status: { $first: "$status" },
                campaignStatus: { $first: "$campaignStatus" },
                isOutOfBudget: { $first: "$isOutOfBudget" },
                budget: { $first: "$budget" },
                dailySpend: { $first: { $ifNull: ["$dailySpend", "$spend"] } },
                timeInBudget: { $first: "$timeInBudget" },
                budgetTracking: { $first: "$budgetTracking" },
                latestReportDate: { $first: "$reportDate" },
              },
            },
          ]);

          for (const doc of fallbackDocs) {
            latestStatusMap.set(doc._id, doc);
            latestStatusMap.set(String(doc._id), doc);
            latestStatusMap.set(Number(doc._id), doc);
          }
        }
      } catch (err) {
        write_logs({ message: `[getCampaigns latest status fetch error] ${err?.message || err}`, log_type: "error" });
      }
    }

    campaignResult = campaignResult.map((campaign) => {
      const latest =
        latestStatusMap.get(campaign.campaignId) ||
        latestStatusMap.get(Number(campaign.campaignId)) ||
        latestStatusMap.get(String(campaign.campaignId));

      const currentStatus = latest?.status || campaign.status;
      const currentCampaignStatus = latest?.campaignStatus || campaign.campaignStatus;
      const currentIsOutOfBudget = latest?.isOutOfBudget !== undefined ? latest.isOutOfBudget : campaign.isOutOfBudget;
      const currentBudget = Number(latest?.budget !== undefined ? latest.budget : campaign.budget) || 0;
      const currentDailySpend = latest?.dailySpend !== undefined && latest?.dailySpend !== null ? Number(latest.dailySpend) : null;
      const currentTimeInBudget = latest?.timeInBudget !== undefined && latest?.timeInBudget !== null ? Number(latest.timeInBudget) : (campaign.timeInBudget !== undefined && campaign.timeInBudget !== null ? Number(campaign.timeInBudget) : undefined);
      const latestReportDate = latest?.latestReportDate || null;

      return {
        ...campaign,
        status: currentStatus,
        latestStatus: currentStatus,
        campaignStatus: currentCampaignStatus,
        isOutOfBudget: currentIsOutOfBudget,
        dailySpend: currentDailySpend,
        latestBudget: currentBudget,
        latestReportDate,
        timeInBudget: currentTimeInBudget,
        budgetTracking: latest?.budgetTracking,
        placements:
          placementSubResult.find((p) => p.campaignId === campaign.campaignId)
            ?.placementsData ?? [],
      };
    });

    const notifySetting = await adNotificationSettingSchema
      .findOne({
        profileId: Number(profileId),
        configId: new ObjectId(configId),
      })
      .lean();

    return res.status(200).send({
      isSuccess: true,
      getCampaign: campaignResult,
      totalRow: totalRow ?? {},
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      notifySetting,
    });
  } catch (error) {
    write_logs({ message: `[getCampaigns Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

const getPlacementLevelData = async (
  configId,
  profileId,
  campaignId,
  fromDate,
  toDate,
) => {
  try {
    const pipeline = [
      {
        $match: {
          configId: new ObjectId(configId),
          profileId: Number(profileId),
          campaignId: Number(campaignId),
          reportDate: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $group: {
          _id: "$placement",
          clicks: { $sum: "$clicks" },
          impressions: { $sum: "$impressions" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          orders: { $sum: "$orders" },
          keywordBid: { $last: "$keywordBid" },
        },
      },
      {
        $addFields: {
          cpc: {
            $cond: [
              { $gt: ["$clicks", 0] },
              { $round: [{ $divide: ["$spend", "$clicks"] }, 2] },
              0,
            ],
          },
          ctr: {
            $cond: [
              { $gt: ["$impressions", 0] },
              {
                $round: [
                  {
                    $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          acos: {
            $cond: [
              { $gt: ["$sales", 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] },
                  2,
                ],
              },
              0,
            ],
          },
          roas: {
            $cond: [
              { $gt: ["$spend", 0] },
              { $round: [{ $divide: ["$sales", "$spend"] }, 2] },
              0,
            ],
          },
        },
      },
      {
        $project: {
          _id: 0,
          placement: "$_id",
          clicks: 1,
          impressions: 1,
          cpc: 1,
          ctr: 1,
          keywordBid: 1,
          spend: 1,
          sales: 1,
          orders: 1,
          acos: 1,
          roas: 1,
        },
      },
    ];

    const result = await placementSchema.aggregate(pipeline);
    return result;
  } catch (error) {
    write_logs({ message: `[getPlacementLevelData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return [];
  }
};

const getTargetingLevelData = async (
  configId,
  profileId,
  campaignId,
  fromDate,
  toDate,
) => {
  try {
    const pipeline = [
      {
        $match: {
          configId: new ObjectId(configId),
          profileId: Number(profileId),
          campaignId: Number(campaignId),
          reportDate: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $group: {
          _id: {
            campaignId: "$campaignId",
            adGroupId: "$adGroupId",
            targetId: "$targetId",
            profileId: "$profileId",
          },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          orders: { $sum: "$orders" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          topOfSearchImpressionShare: {
            $avg: {
              $toDouble: { $ifNull: ["$topOfSearchImpressionShare", "0"] },
            },
          },
          targeting: { $first: "$targeting" },
          keywordBid: { $last: "$keywordBid" },
          reportDate: { $last: "$reportDate" },
          status: { $last: "$status" },
          keywordType: { $first: "$keywordType" },
          matchType: { $first: "$matchType" },
          adGroupId: { $first: "$adGroupId" },
        },
      },
      {
        $addFields: {
          cpc: {
            $cond: [
              { $gt: ["$clicks", 0] },
              { $round: [{ $divide: ["$spend", "$clicks"] }, 2] },
              0,
            ],
          },
          ctr: {
            $cond: [
              { $gt: ["$impressions", 0] },
              {
                $round: [
                  {
                    $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          acos: {
            $cond: [
              { $gt: ["$sales", 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] },
                  2,
                ],
              },
              0,
            ],
          },
          roas: {
            $cond: [
              { $gt: ["$spend", 0] },
              { $round: [{ $divide: ["$sales", "$spend"] }, 2] },
              0,
            ],
          },
        },
      },
    ];

    const result = await targetingSchema.aggregate(pipeline);
    return result;
  } catch (error) {
    write_logs({ message: `[getTargetingLevelData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return [];
  }
};

const getSearchTermData = async (
  configId,
  profileId,
  campaignId,
  fromDate,
  toDate,
) => {
  const pipeline = [
    {
      $match: {
        configId: new ObjectId(configId),
        profileId: Number(profileId),
        campaignId: Number(campaignId),
        reportDate: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: {
          campaignId: "$campaignId",
          searchTerm: "$searchTerm",
        },
        clicks: {
          $sum: "$clicks",
        },
        spend: {
          $sum: "$spend",
        },
        sales: {
          $sum: "$sales",
        },
        orders: {
          $sum: "$orders",
        },
        impressions: {
          $sum: "$impressions",
        },
      },
    },
    {
      $project: {
        _id: 0,
        searchTerm: "$_id.searchTerm",
        clicks: 1,
        spend: 1,
        sales: 1,
        orders: 1,
        impressions: 1,
        cpc: {
          $cond: [
            {
              $gt: ["$clicks", 0],
            },
            {
              $round: [
                {
                  $divide: ["$spend", "$clicks"],
                },
                2,
              ],
            },
            0,
          ],
        },
        ctr: {
          $cond: [
            { $gt: ["$impressions", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] },
                2,
              ],
            },
            0,
          ],
        },
        cvr: {
          $cond: [
            { $gt: ["$clicks", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] },
                2,
              ],
            },
            0,
          ],
        },
        acos: {
          $cond: [
            {
              $gt: ["$sales", 0],
            },
            {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: ["$spend", "$sales"],
                    },
                    100,
                  ],
                },
                2,
              ],
            },
            0,
          ],
        },
        roas: {
          $cond: [
            {
              $gt: ["$spend", 0],
            },
            {
              $round: [
                {
                  $divide: ["$sales", "$spend"],
                },
                2,
              ],
            },
            0,
          ],
        },
      },
    },
  ];

  const searchTermData = await searchTermReportSchema.aggregate(pipeline);
  return searchTermData;
};

// Helper function to build field filters
function buildFieldFilter(fieldName, operator, value) {
  const operatorMap = {
    GREATER_THAN: "$gt",
    GREATER_THAN_OR_EQUAL_TO: "$gte",
    LESS_THAN: "$lt",
    LESS_THAN_OR_EQUAL_TO: "$lte",
    EQUAL_TO: "$eq",
  };

  const mongoOperator = operatorMap[operator];
  if (!mongoOperator) return {};

  return {
    [fieldName]: { [mongoOperator]: value },
  };
}

exports.getCampaignDataTable = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const campaignId = Number(req.params.id);
    const { profileId, type, fromDate, toDate } = req.body;
    let dateFormatObj = {};
    if (type == "1" || type == 1) {
      dateFormatObj = splitIntoWeeks(fromDate, toDate);
    } else if (type == "2" || type == 2) {
      dateFormatObj = splitIntoMonths(fromDate, toDate);
    } else {
      dateFormatObj = splitIntoDays(fromDate, toDate);
    }
    const allRows = await campaignsSchema.find({
      configId: new ObjectId(configId),
      profileId: Number(profileId),
      campaignId: Number(campaignId),
      reportDate: { $gte: fromDate, $lte: toDate },
    }).lean();

    const data = [];
    for (const dateFormat of Object.keys(dateFormatObj)) {
      const bucket = dateFormatObj[dateFormat];
      const bucketRows = allRows.filter(
        (r) => r.reportDate >= bucket.fromDate && r.reportDate <= bucket.toDate
      );

      if (bucketRows.length > 0) {
        // Sort newest first to get placement info ($first: "$$ROOT")
        bucketRows.sort((a, b) => (b.reportDate || "").localeCompare(a.reportDate || ""));
        const firstDoc = bucketRows[0];

        let spend = 0;
        let sales = 0;
        let impressions = 0;
        let clicks = 0;
        let orders = 0;
        let units = 0;
        let conversion = 0;

        for (const row of bucketRows) {
          spend += Number(row.spend) || 0;
          sales += Number(row.sales) || 0;
          impressions += Number(row.impressions) || 0;
          clicks += Number(row.clicks) || 0;
          orders += Number(row.orders) || 0;
          units += Number(row.units) || 0;
          conversion += Number(row.conversion) || 0;
        }

        const roundedSpend = Number(spend.toFixed(2));
        const roundedSales = Number(sales.toFixed(2));
        const acos = sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0;
        const roas = spend > 0 ? Number((sales / spend).toFixed(2)) : 0;
        const cvr = clicks > 0 ? Number(((orders / clicks) * 100).toFixed(2)) : 0;
        const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
        const cpc = clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0;
        const roundedConversion = Number(conversion.toFixed(2));

        data.push({
          campaignId: Number(campaignId),
          campaignName: firstDoc.campaignName || firstDoc.name,
          campaignStatus: firstDoc.campaignStatus || firstDoc.status,
          clicks,
          impressions,
          sales: roundedSales,
          spend: roundedSpend,
          orders,
          units,
          acos,
          roas,
          cvr,
          ctr,
          cpc,
          conversion: roundedConversion,
          fromDate: bucket.fromDate,
          toDate: bucket.toDate,
          avgSalesPrice: orders > 0 ? (sales / orders).toFixed(2) : 0,
          costPerOrder: orders > 0 ? (spend / orders).toFixed(2) : 0,
        });
      }
    }
    data.sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate));
    return res.status(200).send({
      isSuccess: true,
      message: "Data table listing Successfully",
      dataTable: data,
    });
  } catch (error) {
    write_logs({ message: `[getCampaignDataTable Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getCampaignDetailsData = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const configId = req?.config?.configId;

    let { adGroupPageNo, adGroupPerPage, fromDate, toDate, profileId, status } =
      req.body;
    adGroupPageNo = adGroupPageNo ? adGroupPageNo : 1;
    adGroupPerPage = adGroupPerPage ? adGroupPerPage : 10;
    let filter = {
      campaignId: id,
      profileId: Number(profileId),
      configId: new ObjectId(configId),
    };
    if (fromDate && toDate) {
      filter.reportDate = { $gte: fromDate, $lte: toDate };
    }
    if (status) {
      filter.status = status;
    }
    if (!profileId) {
      return res
        .status(203)
        .send({ message: "Profile id required!", isSuccess: false });
    }
    const getCampaignData = await campaignsSchema.aggregate([
      {
        $match: filter,
      },
      {
        $group: {
          _id: null,
          campaignId: { $first: "$campaignId" },
          name: { $first: "$name" },
          status: { $first: "$status" },
          type: { $first: "$type" },
          budget: { $first: "$budget" },
          budgetType: { $first: "$budgetType" },
          startDate: { $first: "$startDate" },
          endDate: { $first: "$endDate" },
          totalSpend: { $sum: "$spend" },
          totalSales: { $sum: "$sales" },
          totalImpressions: { $sum: "$impressions" },
          totalCpc: { $sum: "$cpc" },
          totalClicks: { $sum: "$clicks" },
          totalOrders: { $sum: "$orders" },
        },
      },
      {
        $project: {
          _id: 0,
          campaignId: 1,
          name: 1,
          status: 1,
          type: 1,
          budget: 1,
          budgetType: 1,
          startDate: 1,
          endDate: 1,
          totalOrders: 1,
          totalSpend: { $round: ["$totalSpend", 2] },
          totalSales: { $round: ["$totalSales", 2] },
          totalImpressions: { $round: ["$totalImpressions", 2] },
          totalCpc: { $round: ["$totalCpc", 2] },
          totalClicks: { $round: ["$totalClicks", 2] },
          totalAcos: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSales", 0] },
                  then: {
                    $multiply: [
                      { $divide: ["$totalSpend", "$totalSales"] },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          totalRoas: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSpend", 0] },
                  then: { $divide: ["$totalSales", "$totalSpend"] },
                  else: 0,
                },
              },
              2,
            ],
          },
        },
      },
    ]);
    const getData = [
      {
        $match: filter,
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
            placement: "$placement",
          },
          placement: {
            $first: "$$ROOT",
          },
          spend: {
            $sum: "$spend",
          },
          sales: {
            $sum: "$sales",
          },
          impressions: {
            $sum: "$impressions",
          },
          clicks: {
            $sum: "$clicks",
          },
          orders: {
            $sum: "$orders",
          },
          conversion: {
            $sum: "$conversion",
          },
          units: {
            $sum: "$units",
          },
        },
      },
      {
        $group: {
          _id: "$_id.campaignId",
          campaignName: {
            $last: "$placement.campaignName",
          },
          campaignStatus: {
            $last: "$placement.campaignStatus",
          },
          type: {
            $last: "$placement.type",
          },
          keywordBid: {
            $last: "$placement.keywordBid",
          },
          placementsData: {
            $push: {
              campaignId: "$_id.campaignId",
              placement: "$_id.placement",
              clicks: "$clicks",
              impressions: "$impressions",
              sales: {
                $round: ["$sales", 2],
              },
              spend: {
                $round: ["$spend", 2],
              },
              orders: "$orders",
              units: "$units",
              acos: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$sales", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$spend", "$sales"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              roas: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$spend", 0],
                      },
                      then: {
                        $divide: ["$sales", "$spend"],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              cvr: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$clicks", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$orders", "$clicks"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              ctr: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$impressions", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$clicks", "$impressions"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              cpc: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$clicks", 0],
                      },
                      then: {
                        $divide: ["$spend", "$clicks"],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              conversion: {
                $round: ["$conversion", 2],
              },
              bidStrategy: "$placement.biddingStartegy",
              placementModifier: {
                $ifNull: ["$placement.placementModifier", 0],
              },
              targetAcos: {
                $ifNull: ["$placement.targetAcos", 0],
              },
              newKeywordBid: {
                $ifNull: ["$placement.newKeywordBid", 0],
              },
            },
          },
          totalImpressions: {
            $sum: "$impressions",
          },
          totalClicks: {
            $sum: "$clicks",
          },
          totalOrders: {
            $sum: "$orders",
          },
          totalUnits: {
            $sum: "$units",
          },
          totalSales: {
            $sum: "$sales",
          },
          totalSpend: {
            $sum: "$spend",
          },
        },
      },
      {
        $project: {
          _id: 0,
          campaignId: "$_id",
          placementsData: 1,
        },
      },
    ];
    placementSubResult = await placementSchema.aggregate(getData);
    const allPlacements = ["Top of Search", "Product Pages", "Rest of Search"];
    placementSubResult = placementSubResult.map((campaign) => {
      const placementsData = allPlacements.map((placement) => {
        const placementData = campaign.placementsData.find((data) => {
          return (
            data.placement &&
            data.placement.toLowerCase() === placement.toLowerCase()
          );
        });
        return (
          placementData || {
            campaignId: campaign.campaignId,
            placement,
            clicks: 0,
            impressions: 0,
            sales: 0,
            spend: 0,
            orders: 0,
            units: 0,
            acos: 0,
            roas: 0,
            cvr: 0,
            ctr: 0,
            cpc: 0,
            conversion: 0,
          }
        );
      });
      return {
        campaignId: campaign.campaignId,
        placementsData,
      };
    });
    placementSubResult.sort((a, b) => {
      return (
        allPlacements.indexOf(a.placementsData[0].placement) -
        allPlacements.indexOf(b.placementsData[0].placement)
      );
    });
    const adGroupPipeline = [
      {
        $match: filter,
      },
      {
        $sort: { reportDate: -1 },
      },
      {
        $group: {
          _id: "$adGroupId",
          adGroup: { $first: "$$ROOT" },
        },
      },
      {
        $project: {
          _id: 0,
          adGroup: "$adGroup",
          adGroupId: "$_id",
          bid: "$adGroup.defaultBid",
          name: "$adGroup.name",
        },
      },
      {
        $lookup: {
          from: "product_ads",
          let: { adGroupId: "$adGroupId" }, // pass current adGroupId
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$adGroupId", "$$adGroupId"] }, // match joined docs
                profileId: profileId,
                configId: configId,
                reportDate: { $gte: fromDate, $lte: toDate },
              },
            },
            {
              $match: {
                asins: { $exists: true, $ne: null, $not: { $size: 0 } },
              },
            },
            {
              $unwind: {
                path: "$asins",
                preserveNullAndEmptyArrays: false,
              },
            },
            {
              $group: {
                _id: "$asins",
                productAds: {
                  $first: "$$ROOT",
                },
                totalSpend: { $sum: "$spend" },
                totalSales: { $sum: "$sales" },
                totalImpressions: { $sum: "$impressions" },
                totalOrders: { $sum: "$orders" },
                totalCpc: { $sum: "$cpc" },
                totalClicks: { $sum: "$clicks" },
              },
            },
            {
              $project: {
                _id: 0,
                status: "$productAds.status",
                asins: "$productAds.asins",
                sku: "$productAds.sku",
                totalSpend: { $round: ["$totalSpend", 2] },
                totalSales: { $round: ["$totalSales", 2] },
                totalImpressions: { $round: ["$totalImpressions", 2] },
                totalOrders: { $round: ["$totalOrders", 2] },
                totalCpc: { $round: ["$totalCpc", 2] },
                totalClicks: { $round: ["$totalClicks", 2] },
                totalAcos: {
                  $round: [
                    {
                      $cond: {
                        if: { $gt: ["$totalSales", 0] },
                        then: {
                          $multiply: [
                            { $divide: ["$totalSpend", "$totalSales"] },
                            100,
                          ],
                        },
                        else: 0,
                      },
                    },
                    2,
                  ],
                },
                totalRoas: {
                  $round: [
                    {
                      $cond: {
                        if: { $gt: ["$totalSpend", 0] },
                        then: { $divide: ["$totalSales", "$totalSpend"] },
                        else: 0,
                      },
                    },
                    2,
                  ],
                },
              },
            },
            {
              $lookup: {
                from: "products", // collection with asin, sku
                localField: "asins",
                foreignField: "asin",
                as: "product_details",
                pipeline: [
                  {
                    $match: {
                      profileId: profileId,
                      configId: configId,
                      reportDate: { $gte: fromDate, $lte: toDate },
                    },
                  },
                  {
                    $group: {
                      _id: "$asin",
                      product: {
                        $first: "$$ROOT",
                      },
                    },
                  },
                  {
                    $project: {
                      imageUrl: "$product.imageUrl",
                      amount: "$product.amount",
                      productName: "$product.title",
                    },
                  },
                ],
              },
            },
            {
              $match: {
                product_details: {
                  $exists: true,
                  $ne: null,
                  $not: { $size: 0 },
                },
              },
            },
            {
              $unwind: {
                path: "$product_details",
                preserveNullAndEmptyArrays: false,
              },
            },
          ],
          as: "productAds",
        },
      },
      // Step 5: Unwind productAds to process each ad
      {
        $match: {
          productAds: { $exists: true, $ne: null, $not: { $size: 0 } },
        },
      },
      {
        $unwind: {
          path: "$productAds",
          preserveNullAndEmptyArrays: true, // Preserve if no productAds match
        },
      },
      {
        $project: {
          _id: "$adGroup._id",
          adGroupId: "$adGroup.adGroupId",
          campaignId: "$adGroup.campaignId",
          sku: "$productAds.sku",
          asin: "$productAds.asins",
          bid: 1,
          name: 1,
          totalSpend: "$productAds.totalSpend",
          totalSales: "$productAds.totalSales",
          totalImpressions: "$productAds.totalImpressions",
          totalCpc: "$productAds.totalCpc",
          totalOrders: "$productAds.totalOrders",
          totalClicks: "$productAds.totalClicks",
          totalAcos: "$productAds.totalAcos",
          totalRoas: "$productAds.totalRoas",
          status: "$adGroup.status",
          imageUrl: { $ifNull: ["$productAds.product_details.imageUrl", null] },
          amount: { $ifNull: ["$productAds.product_details.amount", 0] },
          productName: {
            $ifNull: ["$productAds.product_details.productName", null],
          },
        },
      },
      {
        $facet: {
          paginatedResults: [
            { $skip: adGroupPerPage * adGroupPageNo - adGroupPerPage },
            { $limit: adGroupPerPage },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];
    const adGroupResult = await adGroupsSchema.aggregate(adGroupPipeline);
    const getAdGroupsData = adGroupResult[0].paginatedResults;

    const totalAdGroupData =
      adGroupResult[0].totalCount.length > 0
        ? adGroupResult[0].totalCount[0].count
        : 0;
    return res.status(200).send({
      getCampaignData,
      getPlacementData: placementSubResult,
      getAdGroupsData,
      totalAdGroupData,
      adGroupCurrentPageNo: adGroupPageNo,
      adGroupTotalPages: Math.ceil(totalAdGroupData / adGroupPerPage),
      message: "Get campaign details data successfully.",
      isSuccess: true,
    });
  } catch (error) {
    write_logs({ message: `[getCampaignDetailsData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

// Helper Function
function formatDateProper(date) {
  return moment(date).format("YYYY-MM-DD");
}

function splitIntoDays(fromDate, toDate) {
  const days = {};
  let currentDate = moment(fromDate);
  let dayNumber = 1;
  while (
    currentDate.isBefore(toDate, "day") ||
    currentDate.isSame(toDate, "day")
  ) {
    const startOfWeek = currentDate.clone().startOf("day");
    const endOfWeek = currentDate.clone().endOf("day");
    const formattedFromDate = formatDateProper(
      startOfWeek.isBefore(fromDate) ? fromDate : startOfWeek,
    );
    const formattedToDate = formatDateProper(
      endOfWeek.isAfter(toDate) ? toDate : endOfWeek,
    );
    days[`day${dayNumber}`] = {
      fromDate: formattedFromDate,
      toDate: formattedToDate,
    };
    currentDate = currentDate.clone().endOf("day").add(1, "day");
    dayNumber++;
  }
  return days;
}

function splitIntoWeeks(fromDate, toDate) {
  const weeks = {};
  let currentDate = moment(fromDate);
  let weekNumber = 1;
  while (
    currentDate.isBefore(toDate, "day") ||
    currentDate.isSame(toDate, "day")
  ) {
    const startOfWeek = currentDate.clone().startOf("week");
    const endOfWeek = currentDate.clone().endOf("week");
    const formattedFromDate = formatDateProper(
      startOfWeek.isBefore(fromDate) ? fromDate : startOfWeek,
    );
    const formattedToDate = formatDateProper(
      endOfWeek.isAfter(toDate) ? toDate : endOfWeek,
    );
    weeks[`week${weekNumber}`] = {
      fromDate: formattedFromDate,
      toDate: formattedToDate,
    };
    currentDate = currentDate.clone().endOf("week").add(1, "day");
    weekNumber++;
  }
  return weeks;
}

function splitIntoMonths(fromDate, toDate) {
  const months = {};
  let currentDate = moment(fromDate);
  let monthNumber = 1;
  while (
    currentDate.isBefore(toDate, "day") ||
    currentDate.isSame(toDate, "day")
  ) {
    const startOfWeek = currentDate.clone().startOf("month");
    const endOfWeek = currentDate.clone().endOf("month");
    const formattedFromDate = formatDateProper(
      startOfWeek.isBefore(fromDate) ? fromDate : startOfWeek,
    );
    const formattedToDate = formatDateProper(
      endOfWeek.isAfter(toDate) ? toDate : endOfWeek,
    );
    months[`month${monthNumber}`] = {
      fromDate: formattedFromDate,
      toDate: formattedToDate,
    };
    currentDate = currentDate.clone().endOf("month").add(1, "day");
    monthNumber++;
  }
  return months;
}

exports.cronGenerateCampaignReport = async (
  generateWeeklyReport = false,
  generateBiWeeklyReport = false,
  pastSyncObj = null,
) => {
  try {
    if (typeof generateBiWeeklyReport === "object" && generateBiWeeklyReport !== null) {
      pastSyncObj = generateBiWeeklyReport;
      generateBiWeeklyReport = false;
    }

    let { profileId, configId, cronjobid, recurring = true } = pastSyncObj ?? {};
    const cronName =
      generateBiWeeklyReport
        ? "BiWeekly Report"
        : generateWeeklyReport || pastSyncObj != null
          ? "Weekly Report"
          : "Campaign Report";

    const allowedProfiles = await getAllowedSyncProfiles("CAMPAIGNS", "ads", recurring);
    const getProfileId = (await profileSchema
      .find({ isActive: true, ...(profileId && { profileId }), ...(configId && { configId }) })
      .lean()).filter((p) =>
        allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
      );


    if (!getProfileId || getProfileId.length === 0) {
      if (cronjobid) {
        await cronJobHistorySchema.findByIdAndUpdate(
          cronjobid,
          { status: "FAILED" },
          { new: true }
        );
      }
      return cron_logs({
        message: `Cron Campaign Report stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
        log_type: "warn"
      });
    }

    cron_logs({
      message: `[${cronName}] Cron started for ${getProfileId.length} profile(s). (Weekly: ${generateWeeklyReport}, BiWeekly: ${generateBiWeeklyReport}, Recurring: ${recurring})`,
      log_type: "info"
    });

    await Promise.all(
      getProfileId.map((profile) =>
        limit(async () => {
          if (global.updateTaskProgress) global.updateTaskProgress(generateBiWeeklyReport ? "BiWeekly Report" : generateWeeklyReport ? "Weekly Report" : "Campaign Report");
          try {
            const checkConfigAds = await getAccessToken(profile.configId);
            if (
              checkConfigAds &&
              checkConfigAds.adsAccessToken
            ) {
              const currentDate = moment
                .tz(profile.timezone)
                .format("YYYY-MM-DD");
              let startDate = moment(currentDate)
                .subtract(3, "days")
                .format("YYYY-MM-DD");
              let endDate = currentDate;

              if (generateBiWeeklyReport) {
                startDate = moment(currentDate)
                  .subtract(14, "days")
                  .format("YYYY-MM-DD");
                endDate = moment(currentDate)
                  .subtract(1, "days")
                  .format("YYYY-MM-DD");
              } else if (generateWeeklyReport) {
                startDate = moment(currentDate)
                  .subtract(9, "days")
                  .format("YYYY-MM-DD");
                endDate = moment(currentDate)
                  .subtract(1, "days")
                  .format("YYYY-MM-DD");
              }

              if (pastSyncObj) {
                if (pastSyncObj.startDate) startDate = pastSyncObj.startDate;
                if (pastSyncObj.endDate) endDate = pastSyncObj.endDate;
              }

              let getCronData;
              if (recurring) {
                getCronData = await cronJobHistorySchema
                  .findOneAndUpdate(
                    {
                      configId: profile.configId,
                      profileId: profile.profileId,
                      cronName: cronName,
                      historyDate: currentDate,
                    },
                    {
                      $set: {
                        status: "PENDING",
                      },
                    },
                    { new: true, upsert: true },
                  )
                  .lean();
              }

              let reportSpResponse = await spGenerateReport(
                profile.profileId,
                startDate,
                endDate,
                checkConfigAds,
                profile.configId,
                profile.timezone,
                recurring,
              );

              cron_logs({
                message: `[${cronName}: Sponsored Products] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSpResponse}`,
                log_type: "info"
              });

              const reportSbResponse = await sbGenerateReport(
                profile.profileId,
                startDate,
                endDate,
                checkConfigAds,
                profile.configId,
                profile.timezone,
                recurring,
              );

              cron_logs({
                message: `[${cronName}: Sponsored Brands] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSbResponse}`,
                log_type: "info"
              });

              const reportSdResponse = await sdGenerateReport(
                profile.profileId,
                startDate,
                endDate,
                checkConfigAds,
                profile.configId,
                profile.timezone,
                recurring,
              );

              cron_logs({
                message: `[${cronName}: Sponsored Display] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSdResponse}`,
                log_type: "info"
              });

              await linkReportHistory({
                historyId: getCronData?._id || cronjobid,
                configId: profile.configId, profileId: profile.profileId,
                reportName: "CAMPAIGNS", startDate, endDate,
              });

              if (recurring && getCronData?._id) {
                const reportStatuses = [reportSpResponse, reportSbResponse, reportSdResponse];
                const combinedStatus = reportStatuses.includes("ERROR") ? "FAILED"
                  : reportStatuses.every((status) => status === "COMPLETED") ? "COMPLETED"
                    : reportStatuses.includes("STAGED") ? "STAGED" : reportSpResponse;
                await cronJobHistorySchema.updateOne(
                  { _id: getCronData._id, status: { $ne: "COMPLETED" } },
                  { $set: { status: combinedStatus } },
                );
              }
              return reportSpResponse;
            } else {
              return cron_logs({
                message: `[${cronName}] Profile ${profile.name} (${profile.profileId}): Account credentials invalid or disconnected.`,
                log_type: "info"
              });
            }
          } catch (profileErr) {
            cron_logs({
              message: `[${cronName}] Error syncing campaigns for profile ${profile.name} (${profile.profileId}): ${profileErr.stack || profileErr.message}`,
              log_type: "error",
            });
            return "ERROR";
          }
        }),
      ),
    );

    return cron_logs({
      message: `[${cronName}] Cron finished successfully for ${getProfileId.length} profile(s).`,
      log_type: "info"
    });
  } catch (error) {
    return cron_logs({
      message: `[Campaign Report] Error during cron execution: ${error.stack || error.message || error}`,
      log_type: "error",
    });
  }
};

exports.cronListCampaignsFromAmazon = async (pastSyncObj) => {
  // cron_logs({ message: "cronListCampaignsFromAmazon" });

  try {
    const { profileId, configId, cronjobid, recurring } = pastSyncObj ?? {};
    const cronName = "Campaign Listing";

    const allowedProfiles = await getAllowedSyncProfiles("CAMPAIGNS", "ads", recurring);
    const getProfiles = (await profileSchema
      .find({ isActive: true, ...(profileId && { profileId }), ...(configId && { configId }) })
      .lean()).filter((p) =>
        allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
      );

    if (!getProfiles || getProfiles.length === 0) {
      if (cronjobid) {
        await cronJobHistorySchema.findByIdAndUpdate(
          cronjobid,
          { status: "FAILED" },
          { new: true }
        );
      }
      return cron_logs({
        message: `Cron Campaign Listing stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
        log_type: "warn"
      });
    }

    await Promise.all(
      getProfiles.map((profile) =>
        limit(async () => {
          if (global.updateTaskProgress) global.updateTaskProgress("CampaignListing");
          const checkConfigAds = await getAccessToken(profile.configId);

          if (!checkConfigAds?.adsAccessToken) {
            cron_logs({
              message: `Account disconnected for profile ${profile.name}`,
            });
            return;
          }

          const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");

          const dates = pastSyncObj?.dates?.length
            ? [...pastSyncObj.dates]
            : [currentDate];

          await processSPCampaigs({
            profile,
            checkConfigAds,
            dates,
          });

          await processSBCampaigs({
            profile,
            checkConfigAds,
            dates,
          });

          await processSDCampaigs({
            profile,
            checkConfigAds,
            dates,
          });

          if (cronjobid) {
            await cronJobHistorySchema.findByIdAndUpdate(
              cronjobid,
              { status: "COMPLETED" },
              { new: true },
            );
          } else {
            await cronJobHistorySchema
              .findOneAndUpdate(
                {
                  configId: profile.configId,
                  profileId: profile.profileId,
                  cronName,
                  historyDate: currentDate,
                },
                { $set: { status: "COMPLETED" } },
                { new: true, upsert: true },
              )
              .lean();
          }

          cron_logs({
            message: `Profile: ${profile.name}, Campaign listed successfully.`,
          });
        }),
      ),
    );

    return cron_logs({ message: "Campaign listing successfully." });
  } catch (err) {
    return cron_logs({
      message: `Campaign listing err: ${err.message}`,
      log_type: "error",
    });
  }
};

async function processSPCampaigs({ profile, checkConfigAds, dates }) {
  const getPage = await fetchSPCampaignPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let nextToken = null;
  let page = 1;

  do {
    const { campaigns, nextToken: token } = await getPage(nextToken);
    nextToken = token;

    if (!campaigns.length) continue;

    const campaignIds = campaigns.map((c) => c.campaignId);
    const budgetMap = new Map();

    for (let i = 0; i < campaignIds.length; i += 100) {
      const idsBatch = campaignIds.slice(i, i + 100);

      const response = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${profile.amazonUrl}/sp/campaigns/budgetRecommendations`,
          headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.budgetrecommendation.v3+json",
            Accept: "application/vnd.budgetrecommendation.v3+json",
          },
          data: { campaignIds: idsBatch },
          meta: {
            configId: profile.configId,
            tokenKey: "adsAccessToken",
          },
        }),
      );

      if (response.status === 200) {
        for (const r of response.data?.budgetRecommendationsSuccessResults ||
          []) {
          budgetMap.set(r.campaignId, r);
        }
      }
    }

    // attach enrichment
    for (const c of campaigns) {
      const found = budgetMap.get(c.campaignId);
      c.timeInBudget = found?.sevenDaysMissedOpportunities?.percentTimeInBudget
        ? found.sevenDaysMissedOpportunities.percentTimeInBudget * 100
        : null;
    }

    const campaignOps = [];
    const placementOps = [];

    for (const item of campaigns) {
      for (const reportDate of dates) {
        if (
          item?.startDate &&
          moment(reportDate).isSame(moment(item?.startDate))
        ) {
          await autoAssignCampaignToAllRuleTypes({
            models: [
              budgetRulesSchema,
              targetingRuleSchema,
              placementRulesSchema,
            ],
            configId: item.configId,
            profileId: item.profileId,
            campaignId: Number(item.campaignId),
            adType: "SP",
          });
        }

        campaignOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              campaignId: item.campaignId,
              reportDate,
            },
            update: {
              $set: { ...item, reportDate },
            },
            upsert: true,
          },
        });

        const biddingStrategy = ["legacy", "LEGACY_FOR_SALES"].includes(
          item?.dynamicBidding?.strategy,
        )
          ? "Dynamic bids - down only"
          : ["optimizeForSales", "AUTO_FOR_SALES"].includes(
            item?.dynamicBidding?.strategy,
          )
            ? "Dynamic bids - up and down"
            : "Fixed bid";

        const placements = [
          { key: "PLACEMENT_TOP", value: "Top of Search" },
          { key: "PLACEMENT_PRODUCT_PAGE", value: "Product pages" },
          { key: "PLACEMENT_REST_OF_SEARCH", value: "Rest of Search" },
          { key: "AUDIENCE_SEGMENT", value: "Audience Segment" },
          { key: "SITE_AMAZON_BUSINESS", value: "Business Placement" },
        ];

        const getPlacement = (dKey, pKey, key) =>
          item?.dynamicBidding?.[dKey]?.find((pb) => pb?.[pKey] === key)
            ?.percentage ?? 0;

        for (const { key, value } of placements) {
          placementOps.push({
            updateOne: {
              filter: {
                configId: item.configId,
                profileId: item.profileId,
                campaignId: item.campaignId,
                reportDate,
                placement: value,
              },
              update: {
                $set: {
                  configId: item.configId,
                  profileId: item.profileId,
                  type: item.type,
                  currencyCode: profile.currencyCode,
                  campaignId: item.campaignId,
                  campaignName: item.name,
                  campaignStatus: item.status,
                  reportDate,
                  campaignBudget: item.budget,
                  campaignBudgetType: item.budgetType.toUpperCase(),
                  timezone: item.timezone,
                  biddingStartegy: biddingStrategy,
                  placement: value,
                  placementModifier:
                    getPlacement("placementBidding", "placement", key) ||
                    getPlacement(
                      "shopperCohortBidding",
                      "shopperCohortType",
                      key,
                    ) ||
                    0,
                  isAudience: key === "AUDIENCE_SEGMENT",
                  isBusiness: key === "SITE_AMAZON_BUSINESS",
                },
              },
              upsert: true,
            },
          });
        }
      }
    }

    if (campaignOps.length > 0) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page++}, Campaign Count: ${campaignOps.length}`,
      });
      await parallelBulkWrite(campaignsSchema, campaignOps);
      await parallelBulkWrite(placementSchema, placementOps);
    }

    campaigns.length = 0;
    campaignOps.length = 0;
    placementOps.length = 0;
  } while (nextToken);
}

async function fetchSPCampaignPage({
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
}) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(nextToken) {
    const bodyData = {
      maxResults: Number(process.env.BATCH),
      ...(nextToken && { nextToken }),
    };

    const response = await retryWithBackoff(() =>
      amazonAxios({
        method: "POST",
        url: `${getAccount.amazonUrl}/sp/campaigns/list`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profileId,
          Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
          Accept: "application/vnd.spCampaign.v3+json",
          "Content-Type": "application/vnd.spCampaign.v3+json",
        },
        data: bodyData,
        meta: { configId, tokenKey: "adsAccessToken" },
      }),
    );

    if (response.status !== 200) return { campaigns: [], nextToken: null };

    const body = response.data;
    const campaigns = (body.campaigns || []).map((item) => ({
      configId,
      profileId,
      campaignId: item.campaignId,
      type: "Sponsored Products",
      name: item.name,
      currencyCode,
      status: item.state.toUpperCase(),
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      budget: item.budget?.budget || "",
      budgetType: item.budget?.budgetType || "",
      targetingType: item.targetingType,
      timezone,
      dynamicBidding: item.dynamicBidding,
    }));

    return {
      campaigns,
      nextToken: body.nextToken || null,
    };
  };
}

async function processSBCampaigs({ profile, checkConfigAds, dates }) {
  const getPage = await fetchSBCampaignPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let nextToken = null;
  let page = 1;

  do {
    const { campaigns, nextToken: token } = await getPage(nextToken);
    nextToken = token;

    if (!campaigns.length) continue;
    const campaignOps = [];
    const placementOps = [];

    for (const item of campaigns) {
      for (const reportDate of dates) {
        if (
          item?.startDate &&
          moment(reportDate).isSame(moment(item?.startDate))
        ) {
          await autoAssignCampaignToAllRuleTypes({
            models: [
              budgetRulesSchema,
              targetingRuleSchema,
              placementRulesSchema,
            ],
            configId: item.configId,
            profileId: item.profileId,
            campaignId: Number(item.campaignId),
            adType: "SB",
          });
        }

        campaignOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              campaignId: item.campaignId,
              reportDate,
            },
            update: {
              $set: { ...item, reportDate },
            },
            upsert: true,
          },
        });

        const biddingStrategy = ["legacy", "LEGACY_FOR_SALES"].includes(
          item?.dynamicBidding?.strategy,
        )
          ? "Dynamic bids - down only"
          : ["optimizeForSales", "AUTO_FOR_SALES"].includes(
            item?.dynamicBidding?.strategy,
          )
            ? "Dynamic bids - up and down"
            : "Fixed bid";

        const placements = [
          { key: "PLACEMENT_TOP", value: "Top of Search" },
          { key: "PLACEMENT_PRODUCT_PAGE", value: "Product pages" },
          { key: "PLACEMENT_REST_OF_SEARCH", value: "Rest of Search" },
          { key: "AUDIENCE_SEGMENT", value: "Audience Segment" },
          { key: "SITE_AMAZON_BUSINESS", value: "Business Placement" },
        ];

        const getPlacement = (dKey, pKey, key) =>
          item?.dynamicBidding?.[dKey]?.find((pb) => pb?.[pKey] === key)
            ?.percentage ?? 0;

        for (const { key, value } of placements) {
          placementOps.push({
            updateOne: {
              filter: {
                configId: item.configId,
                profileId: item.profileId,
                campaignId: item.campaignId,
                reportDate,
                placement: value,
              },
              update: {
                $set: {
                  configId: item.configId,
                  profileId: item.profileId,
                  type: item.type,
                  currencyCode: profile.currencyCode,
                  campaignId: item.campaignId,
                  campaignName: item.name,
                  campaignStatus: item.status,
                  reportDate,
                  campaignBudget: item.budget,
                  campaignBudgetType: item.budgetType.toUpperCase(),
                  timezone: item.timezone,
                  biddingStartegy: biddingStrategy,
                  placement: value,
                  placementModifier:
                    getPlacement("placementBidding", "placement", key) ||
                    getPlacement(
                      "shopperCohortBidding",
                      "shopperCohortType",
                      key,
                    ) ||
                    0,
                  isAudience: key === "AUDIENCE_SEGMENT",
                  isBusiness: key === "SITE_AMAZON_BUSINESS",
                },
              },
              upsert: true,
            },
          });
        }
      }
    }

    if (campaignOps.length > 0) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page++}, SB Campaign Count: ${campaignOps.length}, Placement Count: ${placementOps.length}`,
      });
      await parallelBulkWrite(sbCampaignsSchema, campaignOps);
      await parallelBulkWrite(sbPlacementSchema, placementOps);
    }

    campaigns.length = 0;
    campaignOps.length = 0;
    placementOps.length = 0;
  } while (nextToken);
}

async function fetchSBCampaignPage({ configId, profileId, checkConfigAds }) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(nextToken) {
    const bodyData = {
      maxResults: Number(process.env.BATCH),
      ...(nextToken && { nextToken }),
    };

    const response = await retryWithBackoff(() =>
      amazonAxios({
        method: "POST",
        url: `${getAccount.amazonUrl}/sb/v4/campaigns/list`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profileId,
          Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
          Accept: "application/vnd.sbcampaignresource.v4+json",
          "Content-Type": "application/vnd.sbcampaignresource.v4+json",
        },
        data: bodyData,
        meta: { configId, tokenKey: "adsAccessToken" },
      }),
    );

    if (response.status !== 200) return { campaigns: [], nextToken: null };

    const body = response.data;
    const campaigns = (body.campaigns || []).map((item) => ({
      configId,
      profileId,
      type: "Sponsored Brands",
      campaignId: item.campaignId,
      name: item.name,
      status: item.state.toUpperCase(),
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      costType: item.costType,
      budget: item.budget || "",
      budgetType: item.budgetType || "",
      isMultiAdGroupsEnabled: item.isMultiAdGroupsEnabled,
      productLocation: item.productLocation,
      bidOptimization: item.bidding?.bidOptimization,
      bidOptimizationStrategy: item.bidding?.bidOptimizationStrategy,
    }));

    return {
      campaigns,
      nextToken: body.nextToken || null,
    };
  };
}

async function processSDCampaigs({ profile, checkConfigAds, dates }) {
  const getPage = await fetchSDCampaignPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let nextToken = null;
  let page = 0;

  do {
    const { campaigns } = await getPage(page);
    page++;

    if (!campaigns.length) break;
    const campaignOps = [];

    for (const item of campaigns) {
      for (const reportDate of dates) {
        if (
          item?.startDate &&
          moment(reportDate).isSame(moment(item?.startDate))
        ) {
          await autoAssignCampaignToAllRuleTypes({
            models: [
              budgetRulesSchema,
              targetingRuleSchema,
              placementRulesSchema,
            ],
            configId: item.configId,
            profileId: item.profileId,
            campaignId: Number(item.campaignId),
            adType: "SD",
          });
        }

        campaignOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              campaignId: item.campaignId,
              reportDate,
            },
            update: {
              $set: { ...item, reportDate },
            },
            upsert: true,
          },
        });
      }
    }

    if (campaignOps.length > 0) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page}, SD Campaign Count: ${campaignOps.length}`,
      });
      await parallelBulkWrite(sdCampaignsSchema, campaignOps);
    }

    // campaigns.length = 0;
    campaignOps.length = 0;
  } while (true);
}

async function fetchSDCampaignPage({ configId, profileId, checkConfigAds }) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(page) {
    const startIndex = page * 10; // Number(process.env.BATCH);
    const response = await retryWithBackoff(() =>
      amazonAxios({
        method: "GET",
        url: `${getAccount.amazonUrl}/sd/campaigns?startIndex=${startIndex}&count=10`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profileId,
          Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        meta: { configId, tokenKey: "adsAccessToken" },
      }),
    );

    if (response.status !== 200) return { campaigns: [], nextToken: null };

    const body = response.data;
    const campaigns = (body || []).map((item) => ({
      configId,
      profileId,
      type: "Sponsored Display",
      campaignId: item.campaignId,
      name: item.name,
      status: item.state.toUpperCase(),
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      costType: item.costType,
      budget: item.budget || "",
      budgetType: item.budgetType || "",
      tactic: item.tactic,
      deliveryProfile: item.deliveryProfile,
    }));

    return { campaigns };
  };
}

async function spGenerateReport(
  profileId,
  startDate,
  endDate,
  checkConfigAds,
  configId,
  timezone,
  recurring = false,
  forceRefresh = false,
) {
  const getAccount = await getProfile(configId, profileId);
  let existing;
  if (!recurring && !forceRefresh) {
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "spCampaigns",
        reportName: "CAMPAIGNS",
      })
      .lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING"].includes(existing?.status)) {
      existing = null;
    }
  }
  else if (!forceRefresh) {
    // 1️⃣ Check pending report
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "spCampaigns",
        reportName: "CAMPAIGNS",
        status: "PENDING",
      })
      .lean();
  }

  if (!existing) {
    let createResp;
    try {
      const isVendor = getAccount?.type?.toLowerCase() === "vendor";
      const purchasesCol = isVendor ? "purchases14d" : "purchases7d";
      const salesCol = isVendor ? "sales14d" : "sales7d";

      createResp = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${getAccount.amazonUrl}/reporting/reports`,
          headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profileId,
            Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
          },
          data: {
            startDate,
            endDate,
            configuration: {
              adProduct: "SPONSORED_PRODUCTS",
              groupBy: ["campaign"],
              columns: [
                "campaignId",
                "campaignName",
                "campaignStatus",
                "campaignBudgetAmount",
                "impressions",
                "clicks",
                "cost",
                "spend",
                purchasesCol,
                salesCol,
                "date",
              ],
              reportTypeId: "spCampaigns",
              timeUnit: "DAILY",
              format: "GZIP_JSON",
            },
          },
          meta: { configId, tokenKey: "adsAccessToken" },
        }),
      );
    } catch (createErr) {
      cron_logs({
        message: `[Campaign Report SP] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(createErr)}`,
        log_type: "warn",
      });
      return "ERROR";
    }

    await reportsSchema.create({
      profileId,
      configId,
      reportId: createResp.data.reportId,
      startDate,
      endDate,
      status: createResp.data.status,
      reportTypeId: "spCampaigns",
      reportName: "CAMPAIGNS",
    });

    return createResp.data.status;
  }

  // 2️⃣ Poll status
  const statusResp = await retryWithBackoff(() =>
    amazonAxios({
      method: "GET",
      url: `${getAccount.amazonUrl}/reporting/reports/${existing.reportId}`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
    }),
  );

  if (statusResp.data.status !== "COMPLETED") {
    if (["FATAL", "FAILED", "EXPIRED"].includes(statusResp.data.status)) {
      await reportsSchema.updateOne(
        { _id: existing._id },
        { $set: { status: statusResp.data.status } }
      );
    }
    return statusResp.data.status;
  }

  // 3️⃣ Download file
  const zipPath = path.resolve(
    __dirname,
    "../../uploads/campaigns/sp-report",
    `${existing.reportId}.gz.json`,
  );
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  // 4️⃣ Stage report into Redis Streams for durable scheduled bulk writing
  const importRunId = `run_campaign_${existing.reportId}_${Date.now()}`;
  try {
    await stageReportFileInRedis({
      importRunId,
      entity: "campaign",
      filePath: extractionPath,
      meta: {
        profileId,
        configId,
        accountType: getAccount?.type,
        reportId: existing.reportId,
        reportTypeId: "spCampaigns",
        startDate,
        endDate,
        reportCreatedAt: existing.createdAt || statusResp.data?.createdAt || new Date().toISOString(),
      },
    });

    await reportsSchema.updateOne(
      { _id: existing._id },
      { $set: { status: "STAGED", importRunId } },
    );

    // Trigger an immediate processing pass of staged batches
    processStagedReportBatches(["campaign"]).catch((err) => {
      cron_logs({
        message: `[Campaign Report SP] Background batch writer invocation error: ${err.message}`,
        log_type: "error",
      });
    });
  } catch (parseErr) {
    cron_logs({
      message: `[Campaign Report SP] Staging failed for report ${existing.reportId}: ${parseErr.message}`,
      log_type: "error",
    });
    await reportsSchema.updateOne(
      { _id: existing._id },
      { $set: { status: "FAILED" } },
    );
    throw parseErr;
  }

  // ♻️ RECURRING POLL — SAFE RECURSION
  if (recurring) {
    const currentHour = moment().tz(timezone).hour();
    if (currentHour !== 23) {
      // let event loop breathe before next poll
      await new Promise((r) => setTimeout(r, 30000));

      return await spGenerateReport(
        profileId,
        startDate,
        endDate,
        checkConfigAds,
        configId,
        timezone,
        recurring,
      );
    }
  }

  return "COMPLETED";
}

async function sbGenerateReport(
  profileId,
  startDate,
  endDate,
  checkConfigAds,
  configId,
  timezone,
  recurring = false,
) {
  const getAccount = await getProfile(configId, profileId);

  let existing;
  if (!recurring) {
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "sbCampaigns",
        reportName: "CAMPAIGNS",
      })
      .lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && ["STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"].includes(existing.status)) return existing.status;
    if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING"].includes(existing?.status)) {
      existing = null;
    }
  } else {
    // Include staged reports so recurring polls do not request the same report again.
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "sbCampaigns",
        reportName: "CAMPAIGNS",
      })
      .lean();
    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && ["STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"].includes(existing.status)) return existing.status;
  }

  if (!existing) {
    let createResp;
    try {
      createResp = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${getAccount.amazonUrl}/reporting/reports`,
          headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profileId,
            Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
          },
          data: {
            startDate,
            endDate,
            configuration: {
              adProduct: "SPONSORED_BRANDS",
              groupBy: ["campaign"],
              columns: [
                "campaignId",
                "campaignName",
                "campaignStatus",
                "campaignBudgetAmount",
                "impressions",
                "clicks",
                "cost",
                "purchases",
                "sales",
                "date",
              ],
              reportTypeId: "sbCampaigns",
              timeUnit: "DAILY",
              format: "GZIP_JSON",
            },
          },
          meta: { configId, tokenKey: "adsAccessToken" },
        }),
      );
    } catch (createErr) {
      cron_logs({
        message: `[Campaign Report SB] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(createErr)}`,
        log_type: "warn",
      });
      return "ERROR";
    }

    await reportsSchema.create({
      profileId,
      configId,
      reportId: createResp.data.reportId,
      startDate,
      endDate,
      status: createResp.data.status,
      reportTypeId: "sbCampaigns",
      reportName: "CAMPAIGNS",
    });

    return createResp.data.status;
  }

  // 2️⃣ Poll status
  const statusResp = await retryWithBackoff(() =>
    amazonAxios({
      method: "GET",
      url: `${getAccount.amazonUrl}/reporting/reports/${existing.reportId}`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
    }),
  );

  if (statusResp.data.status !== "COMPLETED") {
    if (["FATAL", "FAILED", "EXPIRED"].includes(statusResp.data.status)) {
      await reportsSchema.updateOne(
        { _id: existing._id },
        { $set: { status: statusResp.data.status } }
      );
    }
    return statusResp.data.status;
  }

  // 3️⃣ Download file
  const zipPath = path.resolve(
    __dirname,
    "../../uploads/campaigns/sb-report",
    `${existing.reportId}.gz.json`,
  );
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  // Stage the full report; only the verified writer marks it COMPLETED.
  const importRunId = `run_sbCampaign_${existing.reportId}_${Date.now()}`;
  try {
    await stageReportFileInRedis({
      importRunId,
      entity: "sbCampaign",
      filePath: extractionPath,
      meta: {
        profileId,
        configId,
        accountType: getAccount?.type,
        reportId: existing.reportId,
        reportTypeId: "sbCampaigns",
        startDate,
        endDate,
        reportCreatedAt: existing.createdAt || statusResp.data?.createdAt || new Date().toISOString(),
      },
    });
    await reportsSchema.updateOne(
      { _id: existing._id },
      { $set: { status: "STAGED", importRunId } },
    );
    processStagedReportBatches(["sbCampaign"]).catch((err) => {
      cron_logs({ message: `[Campaign Report SB] Batch writer failed for report ${existing.reportId}: ${err.message}`, log_type: "error" });
    });
  } catch (stageErr) {
    cron_logs({ message: `[Campaign Report SB] Staging failed for report ${existing.reportId}: ${stageErr.message}`, log_type: "error" });
    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
    throw stageErr;
  }

  // ♻️ RECURRING POLL — SAFE RECURSION
  if (recurring) {
    const currentHour = moment().tz(timezone).hour();
    if (currentHour !== 23) {
      // let event loop breathe before next poll
      await new Promise((r) => setTimeout(r, 30000));

      return await sbGenerateReport(
        profileId,
        startDate,
        endDate,
        checkConfigAds,
        configId,
        timezone,
        recurring,
      );
    }
  }

  return "STAGED";
}

async function sdGenerateReport(
  profileId,
  startDate,
  endDate,
  checkConfigAds,
  configId,
  timezone,
  recurring = false,
) {
  const getAccount = await getProfile(configId, profileId);

  let existing;
  if (!recurring) {
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "sdCampaigns",
        reportName: "CAMPAIGNS",
      })
      .lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && ["STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"].includes(existing.status)) return existing.status;
    if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING"].includes(existing?.status)) {
      existing = null;
    }
  } else {
    // Include staged reports so recurring polls do not request the same report again.
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "sdCampaigns",
        reportName: "CAMPAIGNS",
      })
      .lean();
    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && ["STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"].includes(existing.status)) return existing.status;
  }

  if (!existing) {
    let createResp;
    try {
      createResp = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${getAccount.amazonUrl}/reporting/reports`,
          headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profileId,
            Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
          },
          data: {
            startDate,
            endDate,
            configuration: {
              adProduct: "SPONSORED_DISPLAY",
              groupBy: ["campaign"],
              columns: [
                "campaignId",
                "campaignName",
                "campaignStatus",
                "campaignBudgetAmount",
                "impressions",
                "clicks",
                "cost",
                "purchases",
                "sales",
                "date",
              ],
              reportTypeId: "sdCampaigns",
              timeUnit: "DAILY",
              format: "GZIP_JSON",
            },
          },
          meta: { configId, tokenKey: "adsAccessToken" },
        }),
      );
    } catch (createErr) {
      cron_logs({
        message: `[Campaign Report SD] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(createErr)}`,
        log_type: "warn",
      });
      return "ERROR";
    }

    await reportsSchema.create({
      profileId,
      configId,
      reportId: createResp.data.reportId,
      startDate,
      endDate,
      status: createResp.data.status,
      reportTypeId: "sdCampaigns",
      reportName: "CAMPAIGNS",
    });

    return createResp.data.status;
  }

  // 2️⃣ Poll status
  const statusResp = await retryWithBackoff(() =>
    amazonAxios({
      method: "GET",
      url: `${getAccount.amazonUrl}/reporting/reports/${existing.reportId}`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
    }),
  );

  if (statusResp.data.status !== "COMPLETED") {
    if (["FATAL", "FAILED", "EXPIRED"].includes(statusResp.data.status)) {
      await reportsSchema.updateOne(
        { _id: existing._id },
        { $set: { status: statusResp.data.status } }
      );
    }
    return statusResp.data.status;
  }

  // 3️⃣ Download file
  const zipPath = path.resolve(
    __dirname,
    "../../uploads/campaigns/sd-report",
    `${existing.reportId}.gz.json`,
  );
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  // Stage the full report; only the verified writer marks it COMPLETED.
  const importRunId = `run_sdCampaign_${existing.reportId}_${Date.now()}`;
  try {
    await stageReportFileInRedis({
      importRunId,
      entity: "sdCampaign",
      filePath: extractionPath,
      meta: {
        profileId,
        configId,
        accountType: getAccount?.type,
        reportId: existing.reportId,
        reportTypeId: "sdCampaigns",
        startDate,
        endDate,
        reportCreatedAt: existing.createdAt || statusResp.data?.createdAt || new Date().toISOString(),
      },
    });
    await reportsSchema.updateOne(
      { _id: existing._id },
      { $set: { status: "STAGED", importRunId } },
    );
    processStagedReportBatches(["sdCampaign"]).catch((err) => {
      cron_logs({ message: `[Campaign Report SD] Batch writer failed for report ${existing.reportId}: ${err.message}`, log_type: "error" });
    });
  } catch (stageErr) {
    cron_logs({ message: `[Campaign Report SD] Staging failed for report ${existing.reportId}: ${stageErr.message}`, log_type: "error" });
    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
    throw stageErr;
  }

  // ♻️ RECURRING POLL — SAFE RECURSION
  if (recurring) {
    const currentHour = moment().tz(timezone).hour();
    if (currentHour !== 23) {
      // let event loop breathe before next poll
      await new Promise((r) => setTimeout(r, 30000));

      return await sdGenerateReport(
        profileId,
        startDate,
        endDate,
        checkConfigAds,
        configId,
        timezone,
        recurring,
      );
    }
  }

  return "STAGED";
}

const processReportFileStream = async (
  schema,
  filePath,
  { profileId, configId, accountType },
) => {
  BULK_SIZE = Number(process.env.BATCH);
  return new Promise((resolve, reject) => {
    const pipeline = chain([
      fs.createReadStream(filePath),
      parser(),
      streamArray(),
    ]);

    let bulkOps = [];

    pipeline.on("data", async ({ value }) => {
      pipeline.pause();

      const isSP = schema === campaignsSchema;
      const isVendor = accountType?.toLowerCase() === "vendor";
      const purchaseField = isSP ? (isVendor ? "purchases14d" : "purchases7d") : "purchases";
      const salesField = isSP ? (isVendor ? "sales14d" : "sales7d") : "sales";
      const context = `campaign report profile=${profileId} config=${configId} type=${accountType || 'unknown'} schema=${isSP ? 'SP' : 'SB/SD'}`;

      let orders = 0;
      let sales = 0;
      let impressions = 0;
      let clicks = 0;
      let spend = 0;

      try {
        impressions = parseStrictMetric(value.impressions, "impressions", context);
        clicks = parseStrictMetric(value.clicks, "clicks", context);
        spend = parseStrictMetric(value.spend ?? value.cost, "spend", context);
        if (isSP) {
          orders = parseStrictMetric(value[purchaseField], purchaseField, context);
          sales = parseStrictMetric(value[salesField], salesField, context);
        } else {
          // Preserve existing SB/SD contracts
          orders = parseStrictMetric(value.purchases ?? value.purchases7d ?? 0, "purchases", context);
          sales = parseStrictMetric(value.sales ?? value.sales7d ?? 0, "sales", context);
        }
      } catch (err) {
        pipeline.destroy(err);
        return reject(err);
      }

      const baseData = {
        impressions,
        clicks,
        spend,
        sales,
        orders,
      };

      const metrics = calcMetrics(baseData);

      bulkOps.push({
        updateOne: {
          filter: {
            profileId,
            configId,
            campaignId: value.campaignId,
            reportDate: value.date,
          },
          update: {
            $set: {
              name: value.campaignName,
              budget: value.campaignBudgetAmount,

              impressions,
              clicks,
              spend,
              sales,
              orders,

              ...metrics,
            },
          },
          upsert: true,
        },
      });

      if (bulkOps.length >= BULK_SIZE) {
        pipeline.pause();
        try {
          await parallelBulkWrite(schema, bulkOps.splice(0));
          pipeline.resume();
        } catch (bulkErr) {
          pipeline.destroy(bulkErr);
          return reject(bulkErr);
        }
      } else {
        pipeline.resume();
      }
    });

    pipeline.on("end", async () => {
      try {
        if (bulkOps && bulkOps.length > 0) {
          await parallelBulkWrite(schema, bulkOps);
        }
        pipeline.removeAllListeners();
        pipeline.destroy();
        bulkOps = null;
        resolve();
      } catch (endErr) {
        pipeline.removeAllListeners();
        pipeline.destroy();
        bulkOps = null;
        reject(endErr);
      }
    });

    pipeline.on("error", (err) => {
      pipeline.removeAllListeners();
      pipeline.destroy();
      bulkOps = null;
      reject(err);
    });
  });
};

exports.listCampaignName = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, type } = req.body;
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required!",
        isSuccess: false,
      });
    }
    if (!type) {
      return res.status(203).send({
        message: "Type is required!",
        isSuccess: false,
      });
    }
    const campaigns = await campaignsSchema.aggregate([
      {
        $match: {
          profileId,
          configId: new ObjectId(configId),
          type,
          status: {
            $in: ["ENABLED", "PAUSED"],
          },
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
        $project: {
          name: 1,
          campaignId: 1,
          type: 1,
          _id: 0,
        },
      },
    ]);
    if (campaigns.length === 0) {
      return res.status(203).send({
        message: "Campaign not found!",
        isSuccess: false,
      });
    }
    return res.status(200).send({
      data: campaigns,
      totalRecords: campaigns.length,
      message: "Campaign list successfully.",
      isSuccess: true,
    });
  } catch (error) {
    write_logs({ message: `[listCampaignName Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getKeywordByAdId = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    let {
      keywordPageNo,
      keywordPerPage,
      profileId,
      status,
      productAdsPageNo,
      productAdsPerPage,
      startDate,
      productStatus,
      endDate,
    } = req.body;
    let filter = {
      adGroupId: Number(req.params.id),
      configId: new ObjectId(configId),
      profileId: Number(profileId),
    };

    if (!profileId) {
      return res
        .status(203)
        .send({ message: "Profile id required!", isSuccess: false });
    }
    keywordPageNo = keywordPageNo ? keywordPageNo : 1;
    keywordPerPage = keywordPerPage ? keywordPerPage : 10;
    productAdsPageNo = productAdsPageNo ? productAdsPageNo : 1;
    productAdsPerPage = productAdsPerPage ? productAdsPerPage : 10;
    if (status) {
      filter.status = status;
    }
    if (startDate && endDate) {
      filter.reportDate = { $gte: startDate, $lte: endDate };
    }
    const keywordPipeline = [
      {
        $match: filter,
      },
      {
        $sort: {
          reportDate: -1,
        },
      },
      {
        $group: {
          _id: "$keywordId",
          keyword: {
            $first: "$$ROOT",
          },
          totalSpend: { $sum: "$spend" },
          totalSales: { $sum: "$sales" },
          totalImpressions: { $sum: "$impressions" },
          totalClicks: { $sum: "$clicks" },
          totalOrders: { $sum: "$orders" },
        },
      },
      {
        $project: {
          _id: 0,
          keywordName: "$keyword.name",
          status: "$keyword.status",
          keywordId: "$_id",
          bid: "$keyword.bid",
          totalSpend: { $round: ["$totalSpend", 2] },
          totalSales: { $round: ["$totalSales", 2] },
          totalImpressions: { $round: ["$totalImpressions", 2] },
          orders: { $round: ["$totalOrders", 2] },
          totalCpc: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalClicks", 0] },
                  then: { $divide: ["$totalSpend", "$totalClicks"] },
                  else: 0,
                },
              },
              2,
            ],
          },
          totalClicks: { $round: ["$totalClicks", 2] },
          totalAcos: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSales", 0] },
                  then: {
                    $multiply: [
                      { $divide: ["$totalSpend", "$totalSales"] },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          totalRoas: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSpend", 0] },
                  then: { $divide: ["$totalSales", "$totalSpend"] },
                  else: 0,
                },
              },
              2,
            ],
          },
        },
      },
      {
        $sort: { totalAcos: -1 },
      },
      {
        $facet: {
          paginatedResults: [
            { $skip: keywordPerPage * keywordPageNo - keywordPerPage },
            { $limit: keywordPerPage },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];
    const keywordResult = await keywordSchema.aggregate(keywordPipeline);
    const getKeywordsData = keywordResult[0].paginatedResults;

    const totalKeywordData =
      keywordResult[0].totalCount.length > 0
        ? keywordResult[0].totalCount[0].count
        : 0;

    const { status: keywordStatus, ...restProductAdsFilter } = { ...filter };
    if (productStatus) {
      restProductAdsFilter.status = productStatus;
    }
    const productAdsPipeline = [
      {
        $match: restProductAdsFilter,
      },
      {
        $sort: {
          reportDate: -1,
        },
      },
      {
        $group: {
          _id: "$adId",
          ad: {
            $first: "$$ROOT",
          },
          totalSpend: { $sum: "$spend" },
          totalSales: { $sum: "$sales" },
          totalImpressions: { $sum: "$impressions" },
          totalCpc: { $sum: "$cpc" },
          totalClicks: { $sum: "$clicks" },
          totalOrders: { $sum: "$orders" },
        },
      },
      {
        $project: {
          _id: 0,
          adId: "$_id.adId",
          name: "$ad.name",
          adGroupId: "$ad.adGroupId",
          type: "$ad.type",
          status: "$ad.status",
          sku: "$ad.sku",
          asins: {
            $cond: {
              if: { $eq: ["$ad.type", "Sponsored Products"] },
              then: { $arrayElemAt: ["$ad.asins", 0] },
              else: "$ad.asins",
            },
          },
          pageType: "$ad.pageType",
          url: "$ad.url",
          headline: "$ad.headline",
          adType: {
            $cond: {
              if: { $eq: ["$ad.adType", "PRODUCT_COLLECTION"] },
              then: "Product Collection",
              else: "Video",
            },
          },
          brandName: "$ad.brandName",
          brandLogoAssetID: "$ad.brandLogoAssetID",
          videoAssetIds: { $arrayElemAt: ["$ad.videoAssetIds", 0] },
          customImageAssetId: "$ad.customImageAssetId",
          campaignId: "$ad.campaignId",
          totalSpend: { $round: ["$totalSpend", 2] },
          totalSales: { $round: ["$totalSales", 2] },
          totalImpressions: { $round: ["$totalImpressions", 2] },
          totalCpc: { $round: ["$totalCpc", 2] },
          totalClicks: { $round: ["$totalClicks", 2] },
          totalOrders: { $round: ["$totalOrders", 2] },
          totalAcos: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSales", 0] },
                  then: {
                    $multiply: [
                      { $divide: ["$totalSpend", "$totalSales"] },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          totalRoas: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSpend", 0] },
                  then: { $divide: ["$totalSales", "$totalSpend"] },
                  else: 0,
                },
              },
              2,
            ],
          },
        },
      },
      {
        $sort: { totalAcos: -1 },
      },
      {
        $facet: {
          paginatedResults: [
            { $skip: productAdsPerPage * productAdsPageNo - productAdsPerPage },
            { $limit: productAdsPerPage },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];
    const productAdsResult =
      await productAdsSchema.aggregate(productAdsPipeline);
    const getProductAdsData = productAdsResult[0].paginatedResults;
    const totalProductAdsData =
      productAdsResult[0].totalCount.length > 0
        ? productAdsResult[0].totalCount[0].count
        : 0;
    return res.status(200).send({
      isSuccess: true,
      message: "Get keyword details and product ads data successfully.",
      getKeywordsData,
      totalKeywordData,
      keywordCurrentPageNo: keywordPageNo,
      keywordTotalPages: Math.ceil(totalKeywordData / keywordPerPage),
      getProductAdsData,
      totalProductAdsData,
      productAdsCurrentPageNo: productAdsPageNo,
      productAdsTotalPages: Math.ceil(totalProductAdsData / productAdsPerPage),
    });
  } catch (error) {
    write_logs({ message: `[getKeywordByAdId Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

const checkFirstError = (data) => {
  const errorValue = data?.error?.[0]?.errors?.[0]?.errorValue;
  const dynamicKey = errorValue ? Object.keys(errorValue)?.[0] : null;
  const errorMessage = dynamicKey ? errorValue[dynamicKey]?.message : null;
  return errorMessage;
};

const AddCampaginAndAdGroups = async (
  req,
  profileId,
  getAccount,
  checkConfigAds,
) => {
  const {
    campaignName,
    dailyBudget,
    startDate,
    endDate,
    adGroups,
    siteType,
    targetingType,
    bidStrategy,
    placements,
  } = req?.body;

  const campaignBodyData = {
    campaigns: [
      {
        // For Testing
        // campaignId: "553014119048569",

        budget: { budget: parseFloat(dailyBudget), budgetType: "DAILY" },
        dynamicBidding: {
          placementBidding: [
            {
              percentage: parseFloat(placements?.productPage),
              placement: "PLACEMENT_PRODUCT_PAGE",
            },
            {
              percentage: parseFloat(placements?.topOfSearch),
              placement: "PLACEMENT_TOP",
            },
            {
              percentage: parseFloat(placements?.restOfSearch),
              placement: "PLACEMENT_REST_OF_SEARCH",
            },
          ],
          strategy: bidStrategy,
        },
        ...(endDate && { endDate }),
        name: campaignName,
        offAmazonSettings: { offAmazonBudgetControlStrategy: "MAXIMIZE_REACH" },
        ...(!Boolean(siteType === "AMAZON_HAUL") && {
          siteRestrictions: [siteType],
        }),
        startDate,
        // state: "PAUSED",
        state: "ENABLED",
        targetingType,
      },
    ],
  };

  const createCampaign = {
    method: "POST",
    // method: "PUT",
    url: `${getAccount.amazonUrl}/sp/campaigns`,
    headers: {
      "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
      "Amazon-Advertising-API-Scope": profileId,
      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      "Content-Type": "application/vnd.spCampaign.v3+json",
      Accept: "application/vnd.spCampaign.v3+json",
    },
    data: campaignBodyData,
  };

  const response = await axios(createCampaign);
  const campaignData = response.data;

  const errorMessage = checkFirstError(campaignData?.campaigns);
  if (errorMessage) {
    return { statusCode: 203, isSuccess: false, message: errorMessage };
  }

  const campaignId = campaignData?.campaigns?.success?.[0]?.campaignId;

  // For AdGroup
  const adGroupBodyData = {
    adGroups: adGroups?.map((name) => ({
      campaignId,
      defaultBid: 1,
      name: `${name}`?.trim(),
      state: "ENABLED",
    })),
  };

  const createAdGroup = {
    method: "POST",
    url: `${getAccount.amazonUrl}/sp/adGroups`,
    headers: {
      "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
      "Amazon-Advertising-API-Scope": profileId,
      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      "Content-Type": "application/vnd.spAdGroup.v3+json",
      Accept: "application/vnd.spAdGroup.v3+json",
    },
    data: adGroupBodyData,
  };

  const adGroupResponse = await axios(createAdGroup);
  const adGroupData = adGroupResponse.data;

  const adGrouperrorMessage = checkFirstError(adGroupData?.adGroups);
  if (adGrouperrorMessage) {
    return { statusCode: 203, isSuccess: false, message: adGrouperrorMessage };
  }

  const adGroupId = adGroupData?.adGroups?.success?.[0]?.adGroupId;

  return {
    statusCode: 200,
    isSuccess: true,
    message: "Campaign added successfully.",
    campaignId,
    adGroupId,
  };
};

const AddProductAds = async (req, profileId, getAccount, checkConfigAds) => {
  const { campaignId, adGroupId, products } = req?.body;

  const productBodyData = {
    productAds: products?.map((p) => ({
      adGroupId,
      asin: p?.asin,
      campaignId,
      sku: p?.sku,
      state: "ENABLED",
    })),
  };

  const createProduct = {
    method: "POST",
    url: `${getAccount.amazonUrl}/sp/productAds`,
    headers: {
      "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
      "Amazon-Advertising-API-Scope": profileId,
      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      "Content-Type": "application/vnd.spProductAd.v3+json",
      Accept: "application/vnd.spProductAd.v3+json",
    },
    data: productBodyData,
  };

  const response = await axios(createProduct);
  const productData = response.data;

  const errorMessage = checkFirstError(productData?.productAds);
  if (errorMessage) {
    return { statusCode: 203, isSuccess: false, message: errorMessage };
  }

  return {
    statusCode: 200,
    isSuccess: true,
    message: "Product added successfully.",
    campaignId,
    adGroupId,
  };
};

const AddTargeting = async (req, profileId, getAccount, checkConfigAds) => {
  const {
    campaignId,
    adGroupId,
    manualTargetType,
    manualKeywordTargeting,
    manualProductTargeting,
    targetingType,
    autoBidDefault,
    autoBidMode,
    autoBidGroups,
  } = req?.body;

  if (targetingType === "AUTO") {
    // 1️⃣ STEP 1: Fetch existing auto targets for this ad group
    const listConfig = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/targets/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.spTargetingClause.v3+json",
        Accept: "application/vnd.spTargetingClause.v3+json",
      },
      data: {
        campaignIdFilter: { include: [campaignId] },
      },
    };

    const listResponse = await axios(listConfig);
    const autoTargets = listResponse?.data?.targetingClauses || [];

    if (!autoTargets.length) {
      return {
        statusCode: 203,
        isSuccess: false,
        message: "No AUTO targets found for this Campagin.",
      };
    }

    // 2️⃣ STEP 2: Prepare updates
    let updateTargets = [];

    if (autoBidMode === "default") {
      updateTargets = autoTargets.map((t) => ({
        targetId: t?.targetId,
        bid: Number(autoBidDefault),
      }));
    }

    if (autoBidMode === "group") {
      const groupMapping = {
        QUERY_HIGH_REL_MATCHES: "closeMatch",
        QUERY_BROAD_REL_MATCHES: "looseMatch",
        ASIN_SUBSTITUTE_RELATED: "substitutes",
        ASIN_ACCESSORY_RELATED: "complements",
      };

      updateTargets = autoTargets
        .map((t) => {
          const groupKey = groupMapping[t?.expression?.[0]?.type];
          if (!groupKey) return null;

          const bidValue = autoBidGroups[groupKey];
          return { targetId: t?.targetId, bid: Number(bidValue) };
        })
        .filter(Boolean);
    }

    // 3️⃣ STEP 3: Send update request
    const updateConfig = {
      method: "PUT",
      url: `${getAccount.amazonUrl}/sp/targets`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.spTargetingClause.v3+json",
        Accept: "application/vnd.spTargetingClause.v3+json",
      },
      data: { targetingClauses: updateTargets },
    };

    const updateResponse = await axios(updateConfig);

    const errorMessage = checkFirstError(updateResponse?.data?.targets);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  if (manualTargetType === "keyword") {
    const bodyData = {
      keywords: manualKeywordTargeting?.map((keyword) => ({
        adGroupId,
        bid: keyword?.bid,
        campaignId,
        keywordText: `${keyword?.keyword}`,
        matchType: `${keyword?.matchType}`.toUpperCase(),
        state: "ENABLED",
      })),
    };

    const config = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/keywords`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.spKeyword.v3+json",
        Accept: "application/vnd.spKeyword.v3+json",
      },
      data: bodyData,
    };

    const response = await axios(config);
    const ResData = response.data;

    const errorMessage = checkFirstError(ResData?.keywords);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  if (manualTargetType === "product") {
    const bodyData = {
      targetingClauses: manualProductTargeting?.map((keyword) => ({
        adGroupId,
        bid: keyword?.bid,
        campaignId,
        expression: [
          {
            type:
              keyword?.type === "Exact" ? "ASIN_SAME_AS" : "ASIN_EXPANDED_FROM",
            value: keyword?.asin,
          },
        ],
        expressionType: "MANUAL",
        state: "ENABLED",
      })),
    };

    const config = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/targets`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.spTargetingClause.v3+json",
        Accept: "application/vnd.spTargetingClause.v3+json",
      },
      data: bodyData,
    };

    const response = await axios(config);
    const ResData = response.data;

    const errorMessage = checkFirstError(ResData?.targetingClauses);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  return {
    statusCode: 200,
    isSuccess: true,
    message: "Targeting added successfully.",
    campaignId,
    adGroupId,
  };
};

const AddNegativeTargeting = async (
  req,
  profileId,
  getAccount,
  checkConfigAds,
) => {
  const { campaignId, adGroupId, negativeKeywords, negativeProducts } =
    req?.body;

  if (negativeKeywords?.length) {
    const bodyData = {
      negativeKeywords: negativeKeywords?.map((keyword) => ({
        campaignId,
        adGroupId,
        keywordText: `${keyword?.keyword}`,
        matchType: `${keyword?.matchType}`.toUpperCase(),
        state: "ENABLED",
      })),
    };

    const config = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/negativeKeywords`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.spNegativeKeyword.v3+json",
        Accept: "application/vnd.spNegativeKeyword.v3+json",
      },
      data: bodyData,
    };

    const response = await axios(config);
    const ResData = response.data;

    const errorMessage = checkFirstError(ResData?.negativeKeywords);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  if (negativeProducts?.length) {
    const bodyData = {
      negativeTargetingClauses: negativeProducts?.map((product) => ({
        campaignId,
        adGroupId,
        expression: [{ type: "ASIN_SAME_AS", value: product?.product?.asin }],
        state: "ENABLED",
      })),
    };

    const config = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/negativeTargets`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.spNegativeTargetingClause.v3+json",
        Accept: "application/vnd.spNegativeTargetingClause.v3+json",
      },
      data: bodyData,
    };

    const response = await axios(config);
    const ResData = response.data;

    const errorMessage = checkFirstError(ResData?.negativeTargetingClauses);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  return {
    statusCode: 200,
    isSuccess: true,
    message: "Negative Targeting added successfully.",
    campaignId,
    adGroupId,
  };
};

exports.createSPCampaigns = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { campaignName, profileId } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    const getAccount = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    const responseCampaign = await AddCampaginAndAdGroups(
      req,
      profileId,
      getAccount,
      checkConfigAds,
    );
    if (responseCampaign?.statusCode !== 200) {
      return res.status(responseCampaign?.statusCode).send(responseCampaign);
    }

    req.body.campaignId = responseCampaign?.campaignId;
    req.body.adGroupId = responseCampaign?.adGroupId;

    const responseProduct = await AddProductAds(
      req,
      profileId,
      getAccount,
      checkConfigAds,
    );
    if (responseProduct?.statusCode !== 200) {
      return res.status(responseProduct?.statusCode).send(responseProduct);
    }

    const responseTargeting = await AddTargeting(
      req,
      profileId,
      getAccount,
      checkConfigAds,
    );
    if (responseTargeting?.statusCode !== 200) {
      return res.status(responseTargeting?.statusCode).send(responseTargeting);
    }

    const responseNegativeTargeting = await AddNegativeTargeting(
      req,
      profileId,
      getAccount,
      checkConfigAds,
    );
    if (responseNegativeTargeting?.statusCode !== 200) {
      return res
        .status(responseNegativeTargeting?.statusCode)
        .send(responseNegativeTargeting);
    }

    await logAudit(
      "CAMPAIGN_CREATION",
      `Campaign ${campaignName} created successfully.`,
      {
        ...(!campaignName && { campaignId: responseCampaign?.campaignId }),
        campaignName,
      },
      req?.user?.id,
    );

    return res.status(200).send({
      isSuccess: true,
      message: "Campaign created successfully.",
    });
  } catch (error) {
    write_logs({ message: `[createSPCampaigns Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.log("Error Creating Campaign:", error?.response?.data || error);

    return res.status(error?.response?.status || 500).send({
      isSuccess: false,
      message: error?.response?.data?.message || error.message,
      code: error?.response?.data?.code || "ERROR",
      details: error?.response?.data || null,
    });
  }
};

exports.addCampaigns = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, step, campaignId, adGroupId } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    const getAccount = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    if (step === "Campaign") {
      const response = await AddCampaginAndAdGroups(
        req,
        profileId,
        getAccount,
        checkConfigAds,
      );
      return res.status(response?.statusCode).send(response);
    }

    if (!campaignId || !adGroupId) {
      return res.status(203).send({
        isSuccess: false,
        message: "Campaign Id and AdGroup Id required!",
      });
    }

    if (step === "Products") {
      const response = await AddProductAds(
        req,
        profileId,
        getAccount,
        checkConfigAds,
      );
      return res.status(response?.statusCode).send(response);
    }

    if (step === "Targeting") {
      const response = await AddTargeting(
        req,
        profileId,
        getAccount,
        checkConfigAds,
      );
      return res.status(response?.statusCode).send(response);
    }

    if (step === "Negative Targeting") {
      const response = await AddNegativeTargeting(
        req,
        profileId,
        getAccount,
        checkConfigAds,
      );
      return res.status(response?.statusCode).send(response);
    }

    return res.status(203).send({
      isSuccess: false,
      message: "Please Select a Proper Step to Fill Campagin Data.",
    });
  } catch (error) {
    write_logs({ message: `[addCampaigns Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.log("Error Creating Campaign:", error?.response?.data || error);

    return res.status(error?.response?.status || 500).send({
      isSuccess: false,
      message: error?.response?.data?.message || error.message,
      code: error?.response?.data?.code || "ERROR",
      details: error?.response?.data || null,
    });
  }
};

const AddSBCampaignAndAdGroup = async (
  req,
  profileId,
  getAccount,
  checkConfigAds,
) => {
  const {
    campaignName,
    dailyBudget,
    startDate, // "YYYYMMDD"
    endDate, // "YYYYMMDD" (optional)
    brandEntityId,
    portfolioId,
    siteType,
    placements,
    adGroupName, // string — name for the single ad group
  } = req?.body;

  // ── 1a. Create Campaign ──────────────────────────────────────
  const campaignBody = {
    name: campaignName,
    budget: parseFloat(dailyBudget),
    budgetType: "DAILY",
    startDate, // "YYYYMMDD"
    ...(endDate && { endDate }),
    state: "ENABLED",
    bidding: {
      bidOptimization: false,
      bidAdjustmentsByPlacement: [
        {
          percentage: parseFloat(placements?.topOfSearch),
          placement: "TOP_OF_SEARCH",
        },
        {
          percentage: parseFloat(placements?.restOfSearch),
          placement: "OTHER",
        },
      ],
    },
    ...(!Boolean(siteType === "AMAZON_HAUL") && {
      siteRestrictions: [siteType],
    }),
    brandEntityId,
    portfolioId,
  };

  const createCampaignConfig = {
    method: "POST",
    url: `${getAccount.amazonUrl}/sb/v4/campaigns`,
    headers: {
      "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
      "Amazon-Advertising-API-Scope": profileId,
      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      "Content-Type": "application/vnd.sbcampaign.v4+json",
      Accept: "application/vnd.sbcampaign.v4+json",
    },
    data: { campaigns: [campaignBody] },
  };

  const campaignResponse = await axios(createCampaignConfig);
  const campaignData = campaignResponse.data;

  const campaignError = checkFirstError(campaignData?.campaigns);
  if (campaignError) {
    return { statusCode: 203, isSuccess: false, message: campaignError };
  }

  const campaignId = campaignData?.campaigns?.success?.[0]?.campaignId;

  // ── 1b. Create Ad Group ──────────────────────────────────────
  const adGroupBody = {
    adGroups: [
      {
        campaignId,
        name: adGroupName?.trim() || campaignName,
        defaultBid: 1,
        state: "ENABLED",
      },
    ],
  };

  const createAdGroupConfig = {
    method: "POST",
    url: `${getAccount.amazonUrl}/sb/v4/adGroups`,
    headers: {
      "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
      "Amazon-Advertising-API-Scope": profileId,
      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      "Content-Type": "application/vnd.sbadgroup.v4+json",
      Accept: "application/vnd.sbadgroup.v4+json",
    },
    data: adGroupBody,
  };

  const adGroupResponse = await axios(createAdGroupConfig);
  const adGroupData = adGroupResponse.data;

  const adGroupError = checkFirstError(adGroupData?.adGroups);
  if (adGroupError) {
    return { statusCode: 203, isSuccess: false, message: adGroupError };
  }

  const adGroupId = adGroupData?.adGroups?.success?.[0]?.adGroupId;

  return {
    statusCode: 200,
    isSuccess: true,
    message: "SB Campaign and Ad Group created successfully.",
    campaignId,
    adGroupId,
  };
};

const AddSBProductAds = async (req, profileId, getAccount, checkConfigAds) => {
  const {
    campaignId,
    adGroupId,
    adFormat, // "productCollection" | "storeSpotlight" | "video"
    landingPageType,
    storePageUrl,
    creative,
    products, // [{ asin, sku }]
  } = req?.body;

  const baseHeaders = {
    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
    "Amazon-Advertising-API-Scope": profileId,
    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    "Content-Type": "application/vnd.sbadresource.v4+json",
    Accept: "application/vnd.sbadresource.v4+json",
  };

  let url = "";
  let adsBody = {};

  // ── 1. Product Collection ─────────────────────────────────────────────────
  if (adFormat === "productCollection") {
    url = `${getAccount.amazonUrl}/sb/v4/ads/productCollection`;
    adsBody = {
      ads: [
        {
          campaignId,
          adGroupId,
          name: creative?.name,
          state: "ENABLED",
          creative: {
            brandName: creative?.brandName,
            headline: creative?.headline,
            brandLogoAssetID: creative?.brandLogoAssetID,
            asins: creative?.asins,
          },
          landingPage:
            landingPageType === "store"
              ? { url: storePageUrl }
              : { asins: creative?.asins },
        },
      ],
    };
  }

  // ── 2. Store Spotlight ────────────────────────────────────────────────────
  else if (adFormat === "storeSpotlight") {
    url = `${getAccount.amazonUrl}/sb/v4/ads/storeSpotlight`;
    adsBody = {
      ads: [
        {
          campaignId,
          adGroupId,
          name: creative?.name,
          state: "ENABLED",
          creative: {
            brandName: creative?.brandName,
            brandLogoAssetID: creative?.brandLogoAssetID,
            headline: creative?.headline,
            subpages: creative?.asins?.map((asin) => ({
              pageTitle: creative?.name,
              asin: asin,
              url: storePageUrl,
            })),
          },
          landingPage:
            landingPageType === "store"
              ? { url: storePageUrl }
              : { asins: creative?.asins },
        },
      ],
    };
  }

  // ── 3. Video ──────────────────────────────────────────────────────────────
  else if (adFormat === "video") {
    url = `${getAccount.amazonUrl}/sb/v4/ads/video`;
    adsBody = {
      ads: [
        {
          campaignId,
          adGroupId,
          state: "ENABLED",
          creative: {
            brandName: creative?.brandName,
            brandLogoAssetID: creative?.brandLogoAssetID,
            headline: creative?.headline,
            videoAssetId: creative?.videoAssetId,
            asins: creative?.asins ?? [],
          },
          landingPage: {
            url: creative?.storePageUrl,
          },
        },
      ],
    };
  } else {
    return {
      statusCode: 400,
      isSuccess: false,
      message: `Unknown adFormat: ${adFormat}`,
    };
  }

  const response = await axios({
    method: "POST",
    url,
    headers: baseHeaders,
    data: adsBody,
  });
  const adsData = response.data;

  const errorMessage = checkFirstError(adsData?.ads);
  if (errorMessage) {
    return { statusCode: 203, isSuccess: false, message: errorMessage };
  }

  return {
    statusCode: 200,
    isSuccess: true,
    message: `SB ${adFormat} Ad created successfully.`,
    campaignId,
    adGroupId,
  };
};

const AddSBTargeting = async (req, profileId, getAccount, checkConfigAds) => {
  const {
    campaignId,
    adGroupId,
    sbTargetType, // "keyword" | "product"
    sbKeywordTargeting, // [{ keyword, matchType, bid }]
    sbProductTargeting, // [{ asin, type: "Exact" | "Expanded", bid }]
  } = req?.body;

  if (sbTargetType === "keyword" && sbKeywordTargeting?.length) {
    const keywordBody = sbKeywordTargeting.map((k) => ({
      campaignId,
      adGroupId,
      keywordText: `${k?.keyword}`,
      matchType: `${k?.matchType}`.toLowerCase(), // "broad" | "phrase" | "exact"
      bid: parseFloat(k?.bid),
    }));

    const keywordConfig = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sb/keywords`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      data: keywordBody,
    };

    const keywordResponse = await axios(keywordConfig);
    const keywordData = keywordResponse.data;

    const errorMessage = checkFirstError(keywordData?.keywords);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  if (sbTargetType === "product" && sbProductTargeting?.length) {
    const targetBody = {
      targets: sbProductTargeting.map((t) => ({
        campaignId,
        adGroupId,
        bid: parseFloat(t?.bid),
        expressions: [{ type: "asinSameAs", value: t?.asin }],
      })),
    };

    const targetConfig = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sb/targets`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      data: targetBody,
    };

    const targetResponse = await axios(targetConfig);
    const targetData = targetResponse.data;

    const errorMessage = checkFirstError(targetData?.targets);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  return {
    statusCode: 200,
    isSuccess: true,
    message: "SB Targeting added successfully.",
    campaignId,
    adGroupId,
  };
};

const AddSBNegativeTargeting = async (
  req,
  profileId,
  getAccount,
  checkConfigAds,
) => {
  const { campaignId, adGroupId, negativeKeywords, negativeProducts } =
    req?.body;

  if (negativeKeywords?.length) {
    const negKeywordBody = negativeKeywords.map((k) => ({
      campaignId,
      adGroupId,
      keywordText: `${k?.keyword}`,
      matchType:
        k?.matchType?.toUpperCase() === "NEGATIVE_EXACT"
          ? "negativeExact"
          : "negativePhrase", // "negativeExact" | "negativePhrase"
    }));

    const negKeywordConfig = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sb/negativeKeywords`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.sbkeywordresponse.v3+json",
      },
      data: negKeywordBody,
    };

    const negKeywordResponse = await axios(negKeywordConfig);
    const negKeywordData = negKeywordResponse.data;

    const errorMessage = checkFirstError(negKeywordData?.negativeKeywords);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  if (negativeProducts?.length) {
    const negTargetBody = {
      negativeTargets: negativeProducts.map((p) => ({
        campaignId,
        adGroupId,
        expressions: [{ type: "asinSameAs", value: p?.product?.asin }],
      })),
    };

    const negTargetConfig = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sb/negativeTargets`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.sbcreatenegativetargetsrequest.v3+json",
      },
      data: negTargetBody,
    };

    const negTargetResponse = await axios(negTargetConfig);
    const negTargetData = negTargetResponse.data;

    const errorMessage = checkFirstError(negTargetData?.negativeTargets);
    if (errorMessage) {
      return { statusCode: 203, isSuccess: false, message: errorMessage };
    }
  }

  return {
    statusCode: 200,
    isSuccess: true,
    message: "SB Negative Targeting added successfully.",
    campaignId,
    adGroupId,
  };
};

exports.createSBCampaigns = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    const getAccount = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    // ── STEP 1: Campaign + Ad Group ──────────────────────────
    const responseCampaign = await AddSBCampaignAndAdGroup(
      req,
      profileId,
      getAccount,
      checkConfigAds,
    );
    if (responseCampaign?.statusCode !== 200) {
      return res.status(responseCampaign?.statusCode).send(responseCampaign);
    }

    req.body.campaignId = responseCampaign?.campaignId;
    req.body.adGroupId = responseCampaign?.adGroupId;

    // ── STEP 2: Product Ads ──────────────────────────────────
    const responseAds = await AddSBProductAds(
      req,
      profileId,
      getAccount,
      checkConfigAds,
    );
    if (responseAds?.statusCode !== 200) {
      return res.status(responseAds?.statusCode).send(responseAds);
    }

    // ── STEP 3: Targeting ────────────────────────────────────
    const responseTargeting = await AddSBTargeting(
      req,
      profileId,
      getAccount,
      checkConfigAds,
    );
    if (responseTargeting?.statusCode !== 200) {
      return res.status(responseTargeting?.statusCode).send(responseTargeting);
    }

    // ── STEP 4: Negative Targeting ───────────────────────────
    const responseNegative = await AddSBNegativeTargeting(
      req,
      profileId,
      getAccount,
      checkConfigAds,
    );
    if (responseNegative?.statusCode !== 200) {
      return res.status(responseNegative?.statusCode).send(responseNegative);
    }

    return res.status(200).send({
      isSuccess: true,
      message: "SB Campaign created successfully.",
    });
  } catch (error) {
    write_logs({ message: `[createSBCampaigns Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.log("Error Creating SB Campaign:", error?.response?.data || error);

    return res.status(error?.response?.status || 500).send({
      isSuccess: false,
      message: error?.response?.data?.message || error.message,
      code: error?.response?.data?.code || "ERROR",
      details: error?.response?.data || null,
    });
  }
};

const handleError = (res, error, label) => {
  console.log(`Error in ${label}:`, error?.response?.data || error);
  return res.status(error?.response?.status || 500).send({
    isSuccess: false,
    message: error?.response?.data?.message || error.message,
    code: error?.response?.data?.code || "ERROR",
    details: error?.response?.data || null,
  });
};

exports.getBrands = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    const profile = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    const data = await fetchBrands(profile, checkConfigAds);

    return res.status(200).send({
      isSuccess: true,
      message: "Brands fetched successfully.",
      data,
    });
  } catch (error) {
    write_logs({ message: `[getBrands Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return handleError(res, error, "getBrands");
  }
};

exports.getPortfolios = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, ...body } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    const profile = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    const data = await fetchPortfolios(profile, checkConfigAds, body);

    return res.status(200).send({
      isSuccess: true,
      message: "Portfolios fetched successfully.",
      data,
    });
  } catch (error) {
    write_logs({ message: `[getPortfolios Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return handleError(res, error, "getPortfolios");
  }
};

exports.getStores = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, ...body } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    const profile = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    const data = await fetchStores(profile, checkConfigAds, body);

    return res.status(200).send({
      isSuccess: true,
      message: "Stores fetched successfully.",
      data,
    });
  } catch (error) {
    write_logs({ message: `[getStores Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return handleError(res, error, "getStores");
  }
};

exports.getStorePages = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const {
      profileId,
      identifier,
      identifierType = "ENTITY_ID",
      maxResults = 30,
    } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    if (!identifier) {
      return res.status(203).send({
        isSuccess: false,
        message: "identifier (Entity ID) required!",
      });
    }

    const profile = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    const data = await fetchStorePages(profile, checkConfigAds, {
      identifier,
      identifierType,
      maxResults,
    });

    return res.status(200).send({
      isSuccess: true,
      message: "Store pages fetched successfully.",
      data,
    });
  } catch (error) {
    write_logs({ message: `[getStorePages Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return handleError(res, error, "getStorePages");
  }
};

exports.getBrandDetails = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, ...body } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    const profile = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    const data = await fetchFirstSBAd(profile, checkConfigAds, body);

    return res.status(200).send({
      isSuccess: true,
      message: "Brand details fetched successfully.",
      data,
    });
  } catch (error) {
    write_logs({ message: `[getBrandDetails Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return handleError(res, error, "getBrandDetails");
  }
};

exports.fileUpload = async (req, res) => {
  try {
    const BASE_URL = `${process?.env?.BASE_URL}/public/campaignSupportedFiles/`;

    const images = req.files?.image
      ? req.files.image.map((file) => `${BASE_URL}${file.filename}`)
      : [];
    const audios = req.files?.audio
      ? req.files.audio.map((file) => `${BASE_URL}${file.filename}`)
      : [];
    const videos = req.files?.video
      ? req.files.video.map((file) => `${BASE_URL}${file.filename}`)
      : [];

    return res.status(200).json({
      isSuccess: true,
      message: "File Uploaded Successfully.",
      data: { images, audios, videos },
    });
  } catch (error) {
    write_logs({ message: `[fileUpload Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Failed to Upload File.",
      error: "An internal server error occurred",
    });
  }
};

exports.previewSDCreative = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, campaignId } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }

    // if (!campaignId) {
    //   return res.status(203).send({ isSuccess: false, message: "Campaign id required!" });
    // }

    // const adGroup = await sdAdGroupSchema?.findOne({ campaignId })?.sort({ createdAt: -1 });
    // if (!adGroup || !adGroup?.adGroupId) {
    //   return res.status(203).send({ isSuccess: false, message: "Ad group not found!" });
    // }

    const profile = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    // const creative = await fetchSDCreatives(profile, checkConfigAds, adGroup?.adGroupId);
    // if (!creative) {
    //   return res.status(203).send({ isSuccess: false, message: "No creative found for this ad group!" });
    // }

    const creative = await fetchFirstSBAd(profile, checkConfigAds);
    const [assetId, assetVersion] =
      `${creative?.creative?.brandLogoAssetID}`?.split(":");

    const availableSize = [
      { width: 300, height: 250 },
      { width: 650, height: 130 },
      { width: 245, height: 250 },
      { width: 414, height: 125 },
      { width: 160, height: 600 },
      { width: 300, height: 600 },
      { width: 728, height: 90 },
      { width: 980, height: 55 },
      { width: 320, height: 50 },
      { width: 970, height: 250 },
      { width: 970, height: 66 },
      { width: 320, height: 480 },
      { width: 270, height: 480 },
      { width: 320, height: 130 },
      { width: 120, height: 600 },
    ];

    const previewPayload = {
      creative: {
        creativeType: "IMAGE",
        properties: {
          brandLogo: { assetId, assetVersion },
          hasTermsAndConditions: true,
        },
      },
      previewConfigurations: availableSize.map((size) => ({
        size,
        products: [{ asin: "B0F44B8KD3" }],
        isMobile: true,
        isOnAmazon: true,
      })),
    };

    let previews = await fetchSDCreativePreview(
      profile,
      checkConfigAds,
      previewPayload,
    );
    previews = previews?.previewHtmls?.map((preview, index) => ({
      size: availableSize[index],
      preview,
    }));

    return res.status(200).send({
      isSuccess: true,
      message: "Preview fetched successfully.",
      previews,
    });
  } catch (error) {
    write_logs({ message: `[previewSDCreative Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return handleError(res, error, "getBrands");
  }
};

exports.manualListCampaignsFromAmazon = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema
      .findOne({
        cronName: "Campaign Listing",
        isActive: false,
      })
      .lean();
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your campaign listing status is deactive.`,
        isSuccess: false,
      });
    }
    if (!profileId || !cronId) {
      return res.status(203).send({
        isSuccess: false,
        message: "Profile id and cron id required!",
      });
    }
    const getCron = await cronJobSchema.findById(cronId).lean();
    if (!getCron) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Cron id not found!" });
    }
    if (!(getCron.cronName == "Campaign Listing")) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Enter correct cron id." });
    }
    const getProfileId = await profileSchema
      .find({
        profileId,
        configId,
        isActive: true,
      })
      .lean();
    let reportDate = "";
    await Promise.all(
      getProfileId.map(async (i) => {
        const checkConfigAds = await getAccessToken(i.configId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {
          reportDate = moment().tz(i.timezone).format("YYYY-MM-DD");
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: i.configId,
              profileId: i.profileId,
              cronName: "Campaign Listing",
              status: "PENDING",
              historyDate: reportDate,
            })
            .lean();
          if (!getCronData) {
            const createCronHistory = new cronJobHistorySchema({
              configId: i.configId,
              profileId: i.profileId,
              cronName: "Campaign Listing",
              status: "PENDING",
              historyDate: reportDate,
            });
            await createCronHistory.save();
          }

          let campaigns = [];

          const spCampaigns = await getSPCampaigns(
            i.configId,
            i.profileId,
            checkConfigAds,
            i.currencyCode,
            i.timezone,
            reportDate,
          );

          campaigns = campaigns.concat(spCampaigns);

          if (campaigns.length > 0) {
            await Promise.all(
              campaigns.map(async (item) => {
                const getCampaign = await campaignsSchema
                  .findOne({
                    configId: item.configId,
                    profileId: item.profileId,
                    campaignId: item.campaignId,
                    reportDate: item.reportDate,
                  })
                  .lean();
                if (!getCampaign) {
                  let createCampaign = new campaignsSchema(item);
                  await createCampaign.save();
                } else {
                  await campaignsSchema.findByIdAndUpdate(
                    { _id: getCampaign._id },
                    item,
                    { new: true },
                  );
                }
              }),
            );
          }
        } else {
          return res.status(203).send({
            message: `Account disconnected in campaign listing.`,
            isSuccess: false,
          });
        }
      }),
    );
    const getUpdateCronData = await cronJobHistorySchema
      .findOne({
        configId: configId,
        profileId: profileId,
        cronName: "Campaign Listing",
        status: "PENDING",
        historyDate: reportDate,
      })
      .lean();
    if (getUpdateCronData) {
      await cronJobHistorySchema.findByIdAndUpdate(
        { _id: getUpdateCronData._id },
        {
          status: "COMPLETED",
        },
        { new: true },
      );
    }
    return res.status(200).send({
      isSuccess: true,
      message: "Campaigns listing successfully.",
    });
  } catch (error) {
    write_logs({ message: `[manualListCampaignsFromAmazon Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getPlacement = async (req, res) => {
  const configId = req?.config?.configId;
  let { profileId } = req.body;
  try {
    if (!profileId) {
      return res.status(203).send({
        isSuccess: false,
        message: "Profile id required.",
      });
    }

    const getSettingData = await camapignSetting
      .findOne({
        configId,
        profileId,
      })
      .lean();
    const getLimitedCPCData = await limitedCPCSchema
      .findOne({
        configId,
        profileId,
      })
      .lean();
    const getDefaultTargetAcos = await defaultTargetAcosSchema
      .find({
        configId,
        profileId,
      })
      .lean();
    const getAOVData = await averageAOVSchema
      .find(
        {
          configId,
          profileId,
        },
        { campaignName: 1, value: 1, COGS: 1 },
      )
      .lean();

    return res.status(200).send({
      isSuccess: true,
      campaginTargetAcos: getSettingData ? getSettingData.targetAcos : 0,
      minTargetCPC: getSettingData ? getSettingData.minTargetCPC : 0,
      maxTargetCPC: getSettingData ? getSettingData.maxTargetCPC : 0,
      limitedCPCValue: getLimitedCPCData ? getLimitedCPCData : [],
      defaultTargetAcos: getDefaultTargetAcos ? getDefaultTargetAcos : [],
      getAOVData: getAOVData ? getAOVData : null,
    });
  } catch (error) {
    write_logs({ message: `[getPlacement Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res
      .status(203)
      .send({ isSuccess: false, message: "An internal server error occurred", error });
  }
};

exports.manualGenerateReport = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema
      .findOne({
        cronName: "Campaign Report",
        isActive: false,
      })
      .lean();
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your campaign report status is deactive.`,
        isSuccess: false,
      });
    }
    if (!profileId || !cronId) {
      return res.status(203).send({
        isSuccess: false,
        message: "Profile id and cron id required!",
      });
    }
    const getCron = await cronJobSchema.findById(cronId).lean();
    if (!getCron) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Cron id not found!" });
    }
    if (!(getCron.cronName == "Campaign Report")) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Enter correct cron id." });
    }
    const getProfile = await profileSchema
      .findOne({
        profileId,
        configId,
        isActive: true,
      })
      .lean();
    const startDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
    const endDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
    const checkConfigAds = await getAccessToken(configId);
    if (checkConfigAds && checkConfigAds.adsAccessToken) {
      const getCronData = await cronJobHistorySchema
        .findOne({
          configId: configId,
          profileId: profileId,
          cronName: "Campaign Report",
          status: "PENDING",
          historyDate: startDate,
        })
        .lean();
      if (!getCronData) {
        const createCronHistory = new cronJobHistorySchema({
          configId: configId,
          profileId: profileId,
          cronName: "Campaign Report",
          status: "PENDING",
          historyDate: startDate,
        });
        await createCronHistory.save();
      }
      let responseSPStatus = "PENDING";
      let responseSBStatus = "IN_PROGRESS";
      let responseSDStatus = "IN_PROGRESS";
      let responseSD1Status = "IN_PROGRESS";
      while (
        responseSPStatus != "COMPLETED" ||
        responseSBStatus != "SUCCESS" ||
        responseSD1Status != "SUCCESS" ||
        responseSDStatus != "SUCCESS"
      ) {
        if (responseSPStatus != "COMPLETED" && responseSPStatus != "ERROR") {
          const reportSpResponse = await spGenerateReport(
            getProfile.profileId,
            startDate,
            endDate,
            checkConfigAds,
            getProfile.configId,
            getProfile.timezone,
          );
          console.log("SP", reportSpResponse);
          responseSPStatus = reportSpResponse;
        }
        if (responseSBStatus != "SUCCESS" && responseSBStatus != "ERROR") {
          const reportSbResponse = await sbGenerateReport(
            getProfile.profileId,
            startDate,
            endDate,
            checkConfigAds,
            getProfile.configId,
            getProfile.timezone,
          );
          console.log("SB", reportSbResponse);
          responseSBStatus = reportSbResponse;
        }
        if (responseSDStatus != "SUCCESS" && responseSDStatus != "ERROR") {
          const reportSdResponse = await sdGenerateReport(
            getProfile.profileId,
            startDate,
            endDate,
            checkConfigAds,
            getProfile.configId,
            getProfile.timezone,
          );
          console.log("SD", reportSdResponse);
          responseSDStatus = reportSdResponse;
        }
        if (responseSD1Status != "SUCCESS" && responseSD1Status != "ERROR") {
          const reportSd1Response = await sd1GenerateReport(
            getProfile.profileId,
            startDate,
            endDate,
            checkConfigAds,
            getProfile.configId,
            getProfile.timezone,
          );
          console.log("SD 1", reportSd1Response);
          responseSD1Status = reportSd1Response;
        }
        if (
          responseSPStatus != "COMPLETED" ||
          responseSBStatus != "SUCCESS" ||
          responseSDStatus != "SUCCESS" ||
          responseSD1Status != "SUCCESS"
        ) {
          if (
            responseSPStatus != "ERROR" ||
            responseSBStatus != "ERROR" ||
            responseSDStatus != "ERROR" ||
            responseSD1Status != "ERROR"
          ) {
            await new Promise((resolve) => setTimeout(resolve, 60000));
          }
        }
      }
      const getUpdateCronData = await cronJobHistorySchema
        .findOne({
          configId: configId,
          profileId: profileId,
          cronName: "Campaign Report",
          status: "PENDING",
          historyDate: startDate,
        })
        .lean();
      if (getUpdateCronData) {
        await cronJobHistorySchema.findByIdAndUpdate(
          { _id: getUpdateCronData._id },
          {
            status: "COMPLETED",
          },
          { new: true },
        );
      }
      return res.status(200).send({
        message: "Campaign Report updated successfully..",
        isSuccess: true,
      });
    } else {
      return res.status(203).send({
        message: `Account disconnected in campaign report.`,
        isSuccess: false,
      });
    }
  } catch (error) {
    write_logs({ message: `[manualGenerateReport Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const configId = new mongoose.Types.ObjectId(req?.config?.configId);
    const adType = req.adType;

    let { pageNo = 1, perPage = 10, fromDate, toDate, profileId, type, searchName, targeting, matchType, placement, source, campaignId, fieldName, sortType, changeType, historyScope, dateOption } = req.body;

    if (!profileId) {
      return res.status(400).send({
        isSuccess: false,
        message: "Profile id required!",
      });
    }

    const numericProfileId = Number(profileId);
    const getProfile = await profileSchema.findOne({
      configId,
      profileId: !isNaN(numericProfileId) ? numericProfileId : profileId,
    }).lean();
    const timezone = getProfile?.timezone || "UTC";

    const filter = {
      configId,
      profileId: !isNaN(numericProfileId) ? numericProfileId : profileId,
    };

    if (adType) {
      let typeConditions;
      if (adType === "SP") {
        // SP: show SP records + legacy records that have no type (old records default to SP)
        typeConditions = [
          { type: { $in: ["SP", "sp", "Sponsored Products"] } },
          { type: { $exists: false } },
          { type: null },
          { type: "" },
        ];
      } else if (adType === "SD") {
        // SD: show ONLY SD records — strict, no fallback
        typeConditions = [
          { type: { $in: ["SD", "sd", "Sponsored Display"] } },
        ];
      } else if (adType === "SB") {
        // SB: show ONLY SB records — strict, no fallback
        typeConditions = [
          { type: { $in: ["SB", "sb", "Sponsored Brands"] } },
        ];
      } else {
        // Other/unknown adType: fall back to matching by value + nulls
        typeConditions = [
          { type: { $in: [adType, adType.toLowerCase(), adType.toUpperCase()] } },
          { type: { $exists: false } },
          { type: null },
          { type: "" },
        ];
      }
      if (filter.$and) {
        filter.$and.push({ $or: typeConditions });
      } else {
        filter.$and = [{ $or: typeConditions }];
      }
    }


        const isAllDates = String(dateOption).toLowerCase() === "all" || (!fromDate && !toDate);
    if (!isAllDates && fromDate && toDate) {
      filter.createdAt = {
        $gte: moment(fromDate).tz(timezone).startOf("day").toDate(),
        $lte: moment(toDate).tz(timezone).endOf("day").toDate(),
      };
    }

    if (type) {
      const selectedTypes = (Array.isArray(type) ? type : [type]).filter(
        (t) => t && !["SP", "SB", "SD", "All"].includes(t)
      );

      if (selectedTypes.length > 0) {
        const typeBranchConditions = [];

        selectedTypes.forEach((t) => {
          const lower = String(t).toLowerCase();
          if (lower === "budget") {
            typeBranchConditions.push({ changeType: { $regex: /budget/i } });
          } else if (lower === "campaign") {
            typeBranchConditions.push(
              { updatedFrom: "Campaign" },
              { changeType: { $regex: /budget|campaign status|camapign status|^update state/i } }
            );
          } else if (lower === "targeting" || lower === "bid") {
            typeBranchConditions.push(
              { changeType: { $regex: /targeting.*bid|bid.*adjust|targeting.*adjust/i } },
              { updatedFrom: "Targeting", changeType: { $not: /status|state/i } }
            );
          } else if (lower === "placement" || lower === "bid adjustment") {
            typeBranchConditions.push(
              { changeType: { $regex: /placement|top of search|rest of search|product page/i } },
              { updatedFrom: "Placement" }
            );
          } else if (lower === "status" || lower === "state") {
            typeBranchConditions.push({ changeType: { $regex: /status|state/i } });
          } else {
            typeBranchConditions.push({ updatedFrom: t });
          }
        });

        if (typeBranchConditions.length > 0) {
          if (filter.$and) {
            filter.$and.push({ $or: typeBranchConditions });
          } else {
            filter.$and = [{ $or: typeBranchConditions }];
          }
        }
      }
    }

    if (campaignId) {
      const numericCampaignId = Number(campaignId);
      const possibleCampaignIds = [campaignId, String(campaignId)];
      if (!isNaN(numericCampaignId)) possibleCampaignIds.push(numericCampaignId);

      filter.changeLevel = { $in: Array.from(new Set(possibleCampaignIds)) };

      try {
        const streamDocs = await bidDataSchema
          .find({
            configId,
            profileId: !isNaN(numericProfileId) ? numericProfileId : profileId,
            campaign_id: { $in: [String(campaignId), Number(campaignId)] },
            dataset_id: "ads-campaign-management-campaigns",
          })
          .lean();

        if (streamDocs && streamDocs.length > 1) {
          streamDocs.sort((a, b) => {
            const da = new Date(a.last_updated_date_time || a.creation_date_time || a.createdAt).getTime();
            const db = new Date(b.last_updated_date_time || b.creation_date_time || b.createdAt).getTime();
            return da - db;
          });
        }

        if (streamDocs.length > 1) {
          const placementNames = {
            TOP_OF_SEARCH: "Top of Search",
            REST_OF_SEARCH: "Rest of Search",
            PRODUCT_PAGE: "Product pages",
          };

          const existingHistory = await campaignChangeHistorySchema.find({
            changeLevel: filter.changeLevel,
            updatedFrom: "Amazon Stream",
          }).select("changeType newValue").lean();

          const existingSet = new Set(existingHistory.map((h) => `${h.changeType}_${h.newValue}`));
          const historyToInsert = [];

          for (let i = 1; i < streamDocs.length; i++) {
            const prev = streamDocs[i - 1];
            const curr = streamDocs[i];

            let prevParsed = prev;
            if (typeof prev.data === "string") {
              try { prevParsed = { ...JSON.parse(prev.data), ...prev }; } catch (e) { }
            } else if (prev.data && typeof prev.data === "object") {
              prevParsed = { ...prev.data, ...prev };
            }

            let currParsed = curr;
            if (typeof curr.data === "string") {
              try { currParsed = { ...JSON.parse(curr.data), ...curr }; } catch (e) { }
            } else if (curr.data && typeof curr.data === "object") {
              currParsed = { ...curr.data, ...curr };
            }

            const changeDate = currParsed.last_updated_date_time || currParsed.creation_date_time || curr.createdAt;

            // Budget change
            const oldB = prevParsed?.budgets?.[0]?.budget_value?.monetary_budget_value?.monetary_budget?.value;
            const newB = currParsed?.budgets?.[0]?.budget_value?.monetary_budget_value?.monetary_budget?.value;
            if (oldB !== undefined && newB !== undefined && Number(oldB) !== Number(newB)) {
              const key = `Update Budget_${String(newB)}`;
              if (!existingSet.has(key)) {
                existingSet.add(key);
                historyToInsert.push({
                  configId,
                  profileId: numericProfileId || profileId,
                  changeLevel: filter.changeLevel,
                  changeType: "Update Budget",
                  oldValue: String(oldB),
                  newValue: String(newB),
                  updatedFrom: "Amazon Stream",
                  type: adType || "SP",
                  createdAt: new Date(changeDate),
                });
              }
            }

            // State change
            if (prevParsed.state && currParsed.state && prevParsed.state !== currParsed.state) {
              const key = `Update State_${currParsed.state}`;
              if (!existingSet.has(key)) {
                existingSet.add(key);
                historyToInsert.push({
                  configId,
                  profileId: numericProfileId || profileId,
                  changeLevel: filter.changeLevel,
                  changeType: "Update State",
                  oldValue: prevParsed.state,
                  newValue: currParsed.state,
                  updatedFrom: "Amazon Stream",
                  type: adType || "SP",
                  createdAt: new Date(changeDate),
                });
              }
            }

            // Placement adjustment changes
            const oldPlacements = prevParsed?.optimizations?.bid_settings?.bid_adjustments?.placement_bid_adjustments || [];
            const newPlacements = currParsed?.optimizations?.bid_settings?.bid_adjustments?.placement_bid_adjustments || [];
            for (const newAdj of newPlacements) {
              const oldAdj = oldPlacements.find((o) => o.placement === newAdj.placement);
              if (oldAdj && oldAdj.percentage !== newAdj.percentage) {
                const pName = placementNames[newAdj.placement] || newAdj.placement;
                const changeType = `Update ${pName} Placement Bid`;
                const key = `${changeType}_${newAdj.percentage}%`;
                if (!existingSet.has(key)) {
                  existingSet.add(key);
                  historyToInsert.push({
                    configId,
                    profileId: numericProfileId || profileId,
                    changeLevel: filter.changeLevel,
                    changeType,
                    oldValue: `${oldAdj.percentage}%`,
                    newValue: `${newAdj.percentage}%`,
                    updatedFrom: "Amazon Stream",
                    type: adType || "SP",
                    createdAt: new Date(changeDate),
                  });
                }
              }
            }
          }

          if (historyToInsert.length > 0) {
            const bulkOps = historyToInsert.map((item) => ({
              updateOne: {
                filter: {
                  configId: item.configId,
                  profileId: item.profileId,
                  changeLevel: item.changeLevel,
                  changeType: item.changeType,
                  newValue: item.newValue,
                  createdAt: item.createdAt,
                },
                update: { $setOnInsert: item },
                upsert: true,
              },
            }));
            await campaignChangeHistorySchema.bulkWrite(bulkOps, { ordered: false });
          }
        }
      } catch (streamSyncErr) {
        console.error("Error syncing stream history:", streamSyncErr);
      }
    }

    if (targeting && `${targeting}`.trim()) {
      const escapeRegex = (s) => (RegExp.escape ? RegExp.escape(s) : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      filter.targeting = { $regex: new RegExp(`^${escapeRegex(`${targeting}`.trim())}$`, "i") };
    }

    if (matchType && `${matchType}`.trim()) {
      const escapeRegex = (s) => (RegExp.escape ? RegExp.escape(s) : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const cleanMatch = String(matchType).toLowerCase().replace(/^(keyword|automatic|targeting)\s*[-:]\s*/i, "").trim();
      const matchRegex = new RegExp(escapeRegex(cleanMatch), "i");
      const matchTypeCondition = {
        $or: [
          { matchType: { $regex: matchRegex } },
          { matchType: null },
          { matchType: { $exists: false } },
          { matchType: "" },
        ],
      };
      if (filter.$and) {
        filter.$and.push(matchTypeCondition);
      } else {
        filter.$and = [matchTypeCondition];
      }
    }

    if (placement && `${placement}`.trim()) {
      const escapeRegex = (s) => (RegExp.escape ? RegExp.escape(s) : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const pRegex = new RegExp(escapeRegex(`${placement}`.trim()), "i");
      const placementCondition = {
        $or: [
          { changeType: pRegex },
          { placement: pRegex },
        ],
      };
      if (filter.$and) {
        filter.$and.push(placementCondition);
      } else {
        filter.$and = [placementCondition];
      }
    }

    if (changeType && `${changeType}`.trim()) {
      filter.changeType = { $regex: new RegExp(`${changeType}`.trim(), "i") };
    }

    if (searchName && `${searchName}`.trim()) {
      const escapeRegex = (s) => (RegExp.escape ? RegExp.escape(s) : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const searchRegex = new RegExp(escapeRegex(`${searchName}`.trim()), "i");

      if (filter.changeLevel !== undefined) {
        // When campaignId is already specified, search targeting, changeType, updatedFrom, and values
        const searchConditions = [
          { targeting: searchRegex },
          { changeType: searchRegex },
          { updatedFrom: searchRegex },
          { oldValue: searchRegex },
          { newValue: searchRegex },
        ];
        if (filter.$and) {
          filter.$and.push({ $or: searchConditions });
        } else {
          filter.$and = [{ $or: searchConditions }];
        }
      } else {
        const campaignModel = req?.models?.adTypeCampaignSchema || campaignsSchema;
        const matchingCampaigns = await campaignModel.find({
          configId,
          profileId: !isNaN(numericProfileId) ? numericProfileId : profileId,
          name: searchRegex,
        }).select("campaignId").lean();

        const matchingIds = matchingCampaigns.map((c) => c.campaignId).filter(Boolean);
        const searchChangeLevels = matchingIds.flatMap((id) => [id, Number(id), String(id)].filter((x) => x !== undefined && !isNaN(x)));

        const searchConditions = [
          { changeLevel: { $in: searchChangeLevels } },
          { targeting: searchRegex },
          { changeType: searchRegex },
        ];

        if (filter.$and) {
          filter.$and.push({ $or: searchConditions });
        } else {
          filter.$and = [{ $or: searchConditions }];
        }
      }
    }
    // Retroactively ensure changes from rules with hourly scheduling / dayparting are tagged as DAYPARTING
    let hourlyRuleNames = [];
    try {
      const escapeRegex = (s) => (RegExp.escape ? RegExp.escape(s) : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const [hourlyTargeting, hourlyPlacement, hourlyBudget] = await Promise.all([
        targetingRuleSchema.find({
          configId,
          profileId: !isNaN(numericProfileId) ? numericProfileId : profileId,
          isHourlyBid: true,
        }).select("ruleName").lean(),
        placementRulesSchema.find({
          configId,
          profileId: !isNaN(numericProfileId) ? numericProfileId : profileId,
          isHourlyBid: true,
        }).select("ruleName").lean(),
        budgetRulesSchema.find({
          configId,
          profileId: !isNaN(numericProfileId) ? numericProfileId : profileId,
          $or: [{ isHourlyBid: true }, { isHourlyBudget: true }],
        }).select("ruleName").lean(),
      ]);

      hourlyRuleNames = [
        ...hourlyTargeting.map((r) => r.ruleName),
        ...hourlyPlacement.map((r) => r.ruleName),
        ...hourlyBudget.map((r) => r.ruleName),
      ].filter(Boolean);

      if (hourlyRuleNames.length > 0) {
        const regexPatterns = hourlyRuleNames.map((name) => new RegExp(`\\(${escapeRegex(name)}\\)`, "i"));
        setImmediate(async () => {
          try {
            await campaignChangeHistorySchema.updateMany(
              {
                configId,
                profileId: !isNaN(numericProfileId) ? numericProfileId : profileId,
                source: { $ne: "DAYPARTING" },
                $or: regexPatterns.map((rx) => ({ changeType: { $regex: rx } })),
              },
              { $set: { source: "DAYPARTING" } }
            );
          } catch (e) {
            console.error("Error aligning hourly rule history sources in background:", e?.message || e);
          }
        });
      }
    } catch (hourlySyncErr) {
      console.error("Error aligning hourly rule history sources:", hourlySyncErr?.message || hourlySyncErr);
    }

    // History Scope Classification Filter (Dayparting / Recommendation / Other / All)
    if (historyScope) {
      const rawScopes = Array.isArray(historyScope) ? historyScope : [historyScope];
      const scopes = rawScopes.map((s) => String(s).toLowerCase().trim()).filter(Boolean);
      const isAll = scopes.includes("all") || (scopes.includes("dayparting") && scopes.includes("recommendation") && (scopes.includes("other") || scopes.includes("rule")));

      if (!isAll && scopes.length > 0) {
        const combinedScopeOr = [];

        if (scopes.includes("dayparting")) {
          combinedScopeOr.push(
            { source: "DAYPARTING" },
            { changeType: { $regex: /dayparting/i } }
          );
        }

        if (scopes.includes("recommendation")) {
          combinedScopeOr.push(
            { source: "RECOMMENDATION" },
            {
              $and: [
                { source: { $nin: ["AMAZON_SQS", "AMAZON_API", "DAYPARTING"] } },
                { updatedFrom: { $ne: "Amazon Stream" } },
                {
                  changeType: {
                    $regex: /^Update (Targeting Bid|Camapign Budget|Campaign Budget|Placement Bid|Product pages Placement Bid|Rest of Search Placement Bid|Top of Search Placement Bid|Targeting Status|Camapign Status|Campaign Status)$|^Add (Target|Negative Target)$|^Revert/i,
                  },
                },
              ],
            }
          );
        }

        if (scopes.includes("other") || scopes.includes("rule")) {
          combinedScopeOr.push({
            $and: [
              { source: { $nin: ["DAYPARTING", "RECOMMENDATION"] } },
              { changeType: { $not: /dayparting/i } },
              {
                $or: [
                  { source: { $in: ["AMAZON_SQS", "AMAZON_API"] } },
                  { updatedFrom: "Amazon Stream" },
                  {
                    changeType: {
                      $not: /^Update (Targeting Bid|Camapign Budget|Campaign Budget|Placement Bid|Product pages Placement Bid|Rest of Search Placement Bid|Top of Search Placement Bid|Targeting Status|Camapign Status|Campaign Status)$|^Add (Target|Negative Target)$/i,
                    },
                  },
                ],
              },
            ],
          });
        }

        if (combinedScopeOr.length > 0) {
          if (filter.$and) {
            filter.$and.push({ $or: combinedScopeOr });
          } else {
            filter.$and = [{ $or: combinedScopeOr }];
          }
        }
      }
    }

    if (source && (Array.isArray(source) ? source.length > 0 : Boolean(source)) && source !== "All") {
      const sources = Array.isArray(source) ? source : [source];
      const sourceConditions = [];

      if (sources.includes("Dayparting")) {
        sourceConditions.push(
          { source: "DAYPARTING" },
          { changeType: { $regex: /dayparting/i } }
        );
      }
      if (sources.includes("Amazon SQS") || sources.includes("Amazon API")) {
        sourceConditions.push(
          { source: "AMAZON_SQS" },
          { source: "AMAZON_API" },
          { updatedFrom: "Amazon Stream" }
        );
      }
      if (sources.includes("Recommendation")) {
        sourceConditions.push(
          { source: "RECOMMENDATION" },
          {
            changeType: {
              $regex: /^Update (Targeting Bid|Camapign Budget|Campaign Budget|Placement Bid|Product pages Placement Bid|Rest of Search Placement Bid|Top of Search Placement Bid|Targeting Status|Camapign Status|Campaign Status)$|^Add (Target|Negative Target)$/i,
            },
          }
        );
      }
      if (sources.includes("Rule")) {
        sourceConditions.push(
          { source: "RULE" },
          {
            source: { $nin: ["DAYPARTING", "RECOMMENDATION", "AMAZON_SQS", "AMAZON_API"] },
            updatedFrom: { $ne: "Amazon Stream" },
            changeType: { $regex: /rule|cron/i },
          }
        );
      }
      if (sources.includes("Manual")) {
        sourceConditions.push(
          { source: "MANUAL" },
          {
            source: { $nin: ["DAYPARTING", "RECOMMENDATION", "AMAZON_SQS", "AMAZON_API"] },
            updatedFrom: { $ne: "Amazon Stream" },
            changeType: {
              $not: /dayparting|rule|cron|^Update (Targeting Bid|Camapign Budget|Campaign Budget|Placement Bid|Product pages Placement Bid|Rest of Search Placement Bid|Top of Search Placement Bid|Targeting Status|Camapign Status|Campaign Status)$|^Add (Target|Negative Target)$/i,
            },
          }
        );
      }

      if (sourceConditions.length > 0) {
        if (filter.$and) {
          filter.$and.push({ $or: sourceConditions });
        } else {
          filter.$and = [{ $or: sourceConditions }];
        }
      }
    }

    const triggerSourceSwitch = {
      $switch: {
        branches: [
          {
            case: {
              $or: [
                { $eq: ["$source", "DAYPARTING"] },
                { $regexMatch: { input: { $ifNull: ["$changeType", ""] }, regex: "dayparting", options: "i" } },
              ],
            },
            then: "Dayparting",
          },
          {
            case: {
              $or: [
                { $eq: ["$source", "AMAZON_SQS"] },
                { $eq: ["$source", "AMAZON_API"] },
                { $eq: ["$updatedFrom", "Amazon Stream"] },
              ],
            },
            then: "Amazon API",
          },
          {
            case: {
              $or: [
                { $eq: ["$source", "RECOMMENDATION"] },
                {
                  $regexMatch: {
                    input: { $ifNull: ["$changeType", ""] },
                    regex: "^Update (Targeting Bid|Camapign Budget|Campaign Budget|Placement Bid|Product pages Placement Bid|Rest of Search Placement Bid|Top of Search Placement Bid|Targeting Status|Camapign Status|Campaign Status)$",
                    options: "i",
                  },
                },
              ],
            },
            then: "Recommendation",
          },
          {
            case: {
              $or: [
                { $eq: ["$source", "RULE"] },
                { $regexMatch: { input: { $ifNull: ["$changeType", ""] }, regex: "rule|cron", options: "i" } },
              ],
            },
            then: "Rule",
          },
        ],
        default: "Manual",
      },
    };

    const page = Math.max(1, Number(pageNo) || 1);
    const limitCount = Math.max(1, Number(perPage) || 10);
    const skipCount = (page - 1) * limitCount;

    const sortField = fieldName || "createdAt";
    const sortOrder = sortType === "ASC" || sortType === 1 ? 1 : -1;
    const isSortOnJoinedField = sortField.startsWith("campaignDetails.") || sortField === "updatedBy";

    let totalRecords = 0;
    let data = [];

    const hourlyRuleSetLower = new Set(hourlyRuleNames.map((n) => n.toLowerCase()));

    const computeTriggerSource = (row) => {
      const source = row.source;
      const changeType = row.changeType || "";
      const updatedFrom = row.updatedFrom;

      if (source === "DAYPARTING" || /dayparting/i.test(changeType)) return "Dayparting";
      if (hourlyRuleSetLower.size > 0) {
        const lowerChange = changeType.toLowerCase();
        for (const rName of hourlyRuleSetLower) {
          if (lowerChange.includes(`(${rName})`)) return "Dayparting";
        }
      }
      if (source === "AMAZON_SQS" || source === "AMAZON_API" || updatedFrom === "Amazon Stream") return "Amazon API";
      if (
        source === "RECOMMENDATION" ||
        /^Update (Targeting Bid|Camapign Budget|Campaign Budget|Placement Bid|Product pages Placement Bid|Rest of Search Placement Bid|Top of Search Placement Bid|Targeting Status|Camapign Status|Campaign Status)$|^Add (Target|Negative Target)$/i.test(
          changeType
        )
      ) {
        return "Recommendation";
      }
      if (source === "RULE" || /rule|cron/i.test(changeType)) return "Rule";
      return "Manual";
    };

    if (!isSortOnJoinedField) {
      const [count, rawDocs] = await Promise.all([
        campaignChangeHistorySchema.countDocuments(filter),
        campaignChangeHistorySchema
          .find(filter)
          .sort({ [sortField]: sortOrder })
          .skip(skipCount)
          .limit(limitCount)
          .lean(),
      ]);

      totalRecords = count || 0;

      const uniqueCampaignKeys = [];
      const uniqueAdGroupKeys = [];
      const uniqueUserIds = [];

      for (const d of rawDocs) {
        if (d.changeLevel != null && d.changeLevel !== "") {
          const num = Number(d.changeLevel);
          if (!isNaN(num)) {
            uniqueCampaignKeys.push(num);
            uniqueCampaignKeys.push(String(num));
          } else {
            uniqueCampaignKeys.push(d.changeLevel);
          }
        }
        if (d.adGroupId != null && d.adGroupId !== "") {
          const num = Number(d.adGroupId);
          if (!isNaN(num)) {
            uniqueAdGroupKeys.push(num);
            uniqueAdGroupKeys.push(String(num));
          } else {
            uniqueAdGroupKeys.push(d.adGroupId);
          }
        }
        if (d.userId) {
          uniqueUserIds.push(d.userId);
        }
      }

      // Collect targetings and targetIds where matchType is missing
      const uniqueTargetTexts = [];
      const uniqueTargetIds = [];
      for (const d of rawDocs) {
        if (d.targeting && !d.matchType) {
          uniqueTargetTexts.push(d.targeting);
          if (d.targetId) uniqueTargetIds.push(d.targetId);
        }
      }

      const cleanCampaignKeys = [...new Set(uniqueCampaignKeys)];
      const cleanAdGroupKeys = [...new Set(uniqueAdGroupKeys)];
      const cleanUserIds = [...new Set(uniqueUserIds)];
      const cleanTargetTexts = [...new Set(uniqueTargetTexts)];
      const cleanTargetIds = [...new Set(uniqueTargetIds)];

      const campaignCollection = AD_TYPE_COLLECTIONS?.[adType]?.["campaign"] || "campaigns";
      const adGroupCollection = AD_TYPE_COLLECTIONS?.[adType]?.["adGroup"] || "ad_groups";
      const targetingCollection = AD_TYPE_COLLECTIONS?.[adType]?.["targeting"] || "targetings";
      const queryProfileId = !isNaN(numericProfileId) ? numericProfileId : profileId;

      const targetOrClauses = [];
      if (cleanTargetIds.length) targetOrClauses.push({ targetId: { $in: cleanTargetIds } });
      if (cleanTargetTexts.length) targetOrClauses.push({ targeting: { $in: cleanTargetTexts } });

      const targetFilter = {
        configId,
        profileId: queryProfileId,
        ...(cleanCampaignKeys.length ? { campaignId: { $in: cleanCampaignKeys } } : {}),
        $or: targetOrClauses,
      };

      const [campaignDocs, adGroupDocs, userDocs, targetDocs] = await Promise.all([
        cleanCampaignKeys.length
          ? mongoose.connection
            .collection(campaignCollection)
            .find({
              configId,
              profileId: queryProfileId,
              campaignId: { $in: cleanCampaignKeys },
            })
            .project({ campaignId: 1, name: 1, status: 1, type: 1, reportDate: 1, createdAt: 1 })
            .sort({ reportDate: -1, createdAt: -1 })
            .limit(cleanCampaignKeys.length * 5)
            .toArray()
          : [],
        cleanAdGroupKeys.length
          ? mongoose.connection
            .collection(adGroupCollection)
            .find({
              configId,
              profileId: queryProfileId,
              adGroupId: { $in: cleanAdGroupKeys },
            })
            .project({ adGroupId: 1, name: 1, reportDate: 1, createdAt: 1 })
            .sort({ reportDate: -1, createdAt: -1 })
            .limit(cleanAdGroupKeys.length * 5)
            .toArray()
          : [],
        cleanUserIds.length
          ? mongoose.connection
            .collection("users")
            .find({ _id: { $in: cleanUserIds } })
            .project({ email: 1 })
            .toArray()
          : [],
        targetOrClauses.length
          ? mongoose.connection
            .collection(targetingCollection)
            .find(targetFilter)
            .project({ targetId: 1, targeting: 1, matchType: 1, keywordType: 1, adGroupId: 1, campaignId: 1 })
            .limit((cleanTargetIds.length + cleanTargetTexts.length) * 5)
            .toArray()
          : [],
      ]);

      const campMap = new Map();
      for (const c of campaignDocs) {
        if (!campMap.has(c.campaignId)) campMap.set(c.campaignId, c);
        if (!campMap.has(String(c.campaignId))) campMap.set(String(c.campaignId), c);
        const n = Number(c.campaignId);
        if (!isNaN(n) && !campMap.has(n)) campMap.set(n, c);
      }

      const agMap = new Map();
      const campAdGroupsMap = new Map();
      for (const a of adGroupDocs) {
        if (!agMap.has(a.adGroupId)) agMap.set(a.adGroupId, a);
        if (!agMap.has(String(a.adGroupId))) agMap.set(String(a.adGroupId), a);
        const n = Number(a.adGroupId);
        if (!isNaN(n) && !agMap.has(n)) agMap.set(n, a);

        if (a.campaignId != null) {
          const cidStr = String(a.campaignId);
          if (!campAdGroupsMap.has(cidStr)) {
            campAdGroupsMap.set(cidStr, []);
          }
          const list = campAdGroupsMap.get(cidStr);
          if (!list.some((existing) => String(existing.adGroupId) === String(a.adGroupId))) {
            list.push(a);
          }
        }
      }

      const userMap = new Map();
      for (const u of userDocs) {
        userMap.set(String(u._id), u.email);
      }

      const targetMap = new Map();
      const targetAdGroupMap = new Map();
      for (const t of targetDocs) {
        const m = t.matchType || t.keywordType;
        if (m) {
          if (t.targetId && !targetMap.has(t.targetId)) targetMap.set(t.targetId, m);
          if (t.targeting && !targetMap.has(t.targeting)) targetMap.set(t.targeting, m);
        }
        if (t.adGroupId) {
          if (t.targetId && !targetAdGroupMap.has(String(t.targetId))) targetAdGroupMap.set(String(t.targetId), t.adGroupId);
          if (t.targeting) {
            const key = `${t.campaignId}_${t.targeting}`;
            if (!targetAdGroupMap.has(key)) targetAdGroupMap.set(key, t.adGroupId);
            if (!targetAdGroupMap.has(t.targeting)) targetAdGroupMap.set(t.targeting, t.adGroupId);
          }
        }
      }

      // Check fallback targeting collections if some targets were not found
      const stillMissingTexts = cleanTargetTexts.filter((txt) => !targetMap.has(txt) || !targetAdGroupMap.has(txt));
      if (stillMissingTexts.length > 0) {
        try {
          const fallbackCols = ["sbtargetings", "sdtargetings", "targetings"].filter(
            (c) => c !== targetingCollection
          );
          for (const col of fallbackCols) {
            const fbDocs = await mongoose.connection
              .collection(col)
              .find({
                configId,
                profileId: queryProfileId,
                ...(cleanCampaignKeys.length ? { campaignId: { $in: cleanCampaignKeys } } : {}),
                targeting: { $in: stillMissingTexts },
              })
              .project({ targetId: 1, targeting: 1, matchType: 1, keywordType: 1, adGroupId: 1, campaignId: 1 })
              .limit(stillMissingTexts.length * 5)
              .toArray();
            for (const fb of fbDocs) {
              const m = fb.matchType || fb.keywordType;
              if (m && fb.targeting && !targetMap.has(fb.targeting)) {
                targetMap.set(fb.targeting, m);
              }
              if (fb.adGroupId) {
                if (fb.targetId && !targetAdGroupMap.has(String(fb.targetId))) targetAdGroupMap.set(String(fb.targetId), fb.adGroupId);
                if (fb.targeting) {
                  const key = `${fb.campaignId}_${fb.targeting}`;
                  if (!targetAdGroupMap.has(key)) targetAdGroupMap.set(key, fb.adGroupId);
                  if (!targetAdGroupMap.has(fb.targeting)) targetAdGroupMap.set(fb.targeting, fb.adGroupId);
                }
              }
            }
          }
        } catch (e) {
          // silently continue
        }
      }

      data = rawDocs.map((row) => {
        const camp = campMap.get(row.changeLevel) || (!isNaN(Number(row.changeLevel)) ? campMap.get(Number(row.changeLevel)) : null) || null;
        const ag = row.adGroupId ? (agMap.get(row.adGroupId) || (!isNaN(Number(row.adGroupId)) ? agMap.get(Number(row.adGroupId)) : null) || null) : null;
        const updatedEmail = row.userId ? userMap.get(String(row.userId)) || null : null;
        const resolvedMatchType = row.matchType || (row.targetId && targetMap.get(row.targetId)) || (row.targeting && targetMap.get(row.targeting)) || null;

        return {
          ...row,
          matchType: resolvedMatchType,
          campaignDetails: camp,
          adGroupDetails: ag ? { name: ag.name, adGroupId: ag.adGroupId } : null,
          triggerSource: computeTriggerSource(row),
          updatedBy: updatedEmail,
        };
      });
    } else {
      const queryProfileId = !isNaN(numericProfileId) ? numericProfileId : profileId;
      const pipeline = [
        { $match: filter },
        {
          $lookup: {
            from: AD_TYPE_COLLECTIONS?.[adType]?.["campaign"] || "campaigns",
            let: { campaignKey: "$changeLevel", cfg: "$configId", pid: "$profileId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$configId", "$$cfg"] },
                      { $eq: ["$profileId", "$$pid"] },
                      { $eq: ["$campaignId", "$$campaignKey"] },
                    ],
                  },
                },
              },
              { $sort: { reportDate: -1, createdAt: -1 } },
              { $limit: 1 },
            ],
            as: "campaignDetails",
          },
        },
        {
          $lookup: {
            from: AD_TYPE_COLLECTIONS?.[adType]?.["adGroup"] || "ad_groups",
            let: { agKey: "$adGroupId", cfg: "$configId", pid: "$profileId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $ne: ["$$agKey", null] },
                      { $eq: ["$configId", "$$cfg"] },
                      { $eq: ["$profileId", "$$pid"] },
                      { $eq: ["$adGroupId", "$$agKey"] },
                    ],
                  },
                },
              },
              { $sort: { reportDate: -1, createdAt: -1 } },
              { $limit: 1 },
              { $project: { _id: 0, name: 1, adGroupId: 1 } },
            ],
            as: "adGroupDetails",
          },
        },
        {
          $addFields: {
            campaignDetails: { $arrayElemAt: ["$campaignDetails", 0] },
            adGroupDetails: { $arrayElemAt: ["$adGroupDetails", 0] },
            triggerSource: triggerSourceSwitch,
          },
        },
        {
          $lookup: {
            from: "users",
            let: { uid: "$userId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
              { $project: { _id: 0, email: 1 } },
            ],
            as: "user",
          },
        },
        { $addFields: { updatedBy: { $arrayElemAt: ["$user.email", 0] } } },
        { $sort: { [sortField]: sortOrder } },
        { $skip: skipCount },
        { $limit: limitCount },
      ];

      const [count, aggData] = await Promise.all([
        campaignChangeHistorySchema.countDocuments(filter),
        campaignChangeHistorySchema.aggregate(pipeline),
      ]);
      totalRecords = count || 0;
      data = aggData || [];
    }

    return res.status(200).send({
      isSuccess: true,
      currentPageNo: page,
      totalRecords: totalRecords || 0,
      totalPages: Math.ceil((totalRecords || 0) / limitCount),
      data: data || [],
    });
  } catch (error) {
    write_logs({ message: `[getHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("getHistory error:", error);
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getLatestCampaignHistory = async (req, res) => {
  const configId = req?.config?.configId;
  const { profileId, campaignIds, historyScope } = req.body;

  try {
    if (!profileId || !Array.isArray(campaignIds) || !campaignIds.length) {
      return res.status(200).send({ isSuccess: true, data: {} });
    }

    const numericProfileId = Number(profileId) || profileId;
    const allCampaignIds = campaignIds.flatMap((id) => [
      id,
      String(id),
      ...(isNaN(Number(id)) ? [] : [Number(id)]),
    ]);

    const baseMatch = {
      configId,
      profileId: numericProfileId,
      changeLevel: { $in: allCampaignIds },
    };

    if (historyScope) {
      const rawScopes = Array.isArray(historyScope) ? historyScope : [historyScope];
      const scopes = rawScopes.map((s) => String(s).toLowerCase().trim()).filter(Boolean);
      const isAll = scopes.includes("all") || (scopes.includes("dayparting") && scopes.includes("recommendation") && (scopes.includes("other") || scopes.includes("rule")));

      if (!isAll && scopes.length > 0) {
        const combinedScopeOr = [];

        if (scopes.includes("dayparting")) {
          combinedScopeOr.push(
            { source: { $regex: /^dayparting$/i } },
            { changeType: { $regex: /dayparting/i } }
          );
        }

        if (scopes.includes("recommendation")) {
          combinedScopeOr.push(
            { source: { $regex: /^recommendation$/i } },
            {
              changeType: {
                $regex: /^Update (Targeting Bid|Camapign Budget|Campaign Budget|Placement Bid|Product pages Placement Bid|Rest of Search Placement Bid|Top of Search Placement Bid|Targeting Status|Camapign Status|Campaign Status)$|^Add (Target|Negative Target)$/i,
              },
            }
          );
        }

        if (scopes.includes("other") || scopes.includes("rule")) {
          combinedScopeOr.push({
            source: { $not: /^(dayparting|recommendation)$/i },
            changeType: {
              $not: /dayparting|^Update (Targeting Bid|Camapign Budget|Campaign Budget|Placement Bid|Product pages Placement Bid|Rest of Search Placement Bid|Top of Search Placement Bid|Targeting Status|Camapign Status|Campaign Status)$|^Add (Target|Negative Target)$/i,
            },
          });
        }

        if (combinedScopeOr.length > 0) {
          baseMatch.$or = combinedScopeOr;
        }
      }
    }

    // 1. Campaign-level records ONLY (Budget, Status, State changes - strictly excluding Targeting and Placement changes)
    const campaignMatch = {
      $and: [
        baseMatch,
        {
          $or: [
            { updatedFrom: "Campaign" },
            { changeType: { $regex: /budget|campaign status|camapign status|^update state/i } },
          ],
        },
        { targeting: { $in: [null, ""] } },
        { changeType: { $not: /placement|top of search|product page|rest of search/i } },
      ],
    };

    const results = await campaignChangeHistorySchema.aggregate([
      {
        $match: campaignMatch,
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $toString: "$changeLevel" },
          latestCreatedAt: { $first: "$createdAt" },
          changeType: { $first: "$changeType" },
          updatedFrom: { $first: "$updatedFrom" },
          targeting: { $first: "$targeting" },
          oldValue: { $first: "$oldValue" },
          newValue: { $first: "$newValue" },
        },
      },
    ]);

    // 2. Placement-level records (Top of Search, Product pages, Rest of Search)
    const placementMatch = {
      $and: [
        baseMatch,
        {
          $or: [
            { updatedFrom: "Placement" },
            { changeType: { $regex: /placement|top of search|product page|rest of search/i } },
          ],
        },
      ],
    };

    const placementResults = await campaignChangeHistorySchema.aggregate([
      {
        $match: placementMatch,
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            cid: { $toString: "$changeLevel" },
            changeType: "$changeType",
          },
          latestCreatedAt: { $first: "$createdAt" },
          changeType: { $first: "$changeType" },
          updatedFrom: { $first: "$updatedFrom" },
          oldValue: { $first: "$oldValue" },
          newValue: { $first: "$newValue" },
        },
      },
    ]);

    // 3. Targeting & Search Term records (grouped by Campaign + Targeting + MatchType)
    const targetingMatch = {
      $and: [
        baseMatch,
        { targeting: { $exists: true, $ne: null, $ne: "" } },
      ],
    };

    const targetingResults = await campaignChangeHistorySchema.aggregate([
      {
        $match: targetingMatch,
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            cid: { $toString: "$changeLevel" },
            targeting: { $toLower: { $trim: { input: "$targeting" } } },
            matchType: {
              $cond: [
                { $and: [{ $ne: ["$matchType", null] }, { $ne: ["$matchType", ""] }] },
                { $toLower: { $trim: { input: "$matchType" } } },
                null,
              ],
            },
          },
          latestCreatedAt: { $first: "$createdAt" },
          changeType: { $first: "$changeType" },
          updatedFrom: { $first: "$updatedFrom" },
          targeting: { $first: "$targeting" },
          matchType: { $first: "$matchType" },
          oldValue: { $first: "$oldValue" },
          newValue: { $first: "$newValue" },
        },
      },
    ]);

    const map = {};
    for (const r of results) {
      map[r._id] = {
        latestCreatedAt: r.latestCreatedAt,
        changeType: r.changeType,
        updatedFrom: r.updatedFrom,
        targeting: r.targeting,
        oldValue: r.oldValue,
        newValue: r.newValue,
      };
    }

    for (const r of placementResults) {
      const cid = r._id?.cid;
      const cType = String(r.changeType || "").toLowerCase();
      let normPlacement = null;
      if (cType.includes("top of search")) normPlacement = "top_of_search";
      else if (cType.includes("product page")) normPlacement = "product_pages";
      else if (cType.includes("rest of search")) normPlacement = "rest_of_search";

      const info = {
        latestCreatedAt: r.latestCreatedAt,
        changeType: r.changeType,
        updatedFrom: r.updatedFrom,
        oldValue: r.oldValue,
        newValue: r.newValue,
      };

      if (normPlacement) {
        const pKey = `${cid}_placement_${normPlacement}`;
        if (!map[pKey] || new Date(r.latestCreatedAt) > new Date(map[pKey].latestCreatedAt)) {
          map[pKey] = info;
        }
      }
      const genKey = `${cid}_placement`;
      if (!map[genKey] || new Date(r.latestCreatedAt) > new Date(map[genKey].latestCreatedAt)) {
        map[genKey] = info;
      }
    }

    for (const r of targetingResults) {
      if (r._id?.targeting) {
        const cid = r._id.cid;
        const normTarget = String(r._id.targeting).toLowerCase().trim();
        const rawMatch = r._id?.matchType;

        const info = {
          latestCreatedAt: r.latestCreatedAt,
          changeType: r.changeType,
          updatedFrom: r.updatedFrom,
          targeting: r.targeting,
          matchType: r.matchType,
          oldValue: r.oldValue,
          newValue: r.newValue,
        };

        if (rawMatch) {
          const normMatch = String(rawMatch)
            .toLowerCase()
            .replace(/^(keyword|automatic|targeting)\s*[-:]\s*/i, "")
            .trim();
          const matchKey = `${cid}_${normTarget}_${normMatch}`;
          map[matchKey] = info;
        } else {
          const generalKey = `${cid}_${normTarget}`;
          if (!map[generalKey]) {
            map[generalKey] = info;
          }
        }
      }
    }

    return res.status(200).send({
      isSuccess: true,
      data: map,
    });
  } catch (error) {
    write_logs({
      message: `[getLatestCampaignHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
      log_type: "error",
    });
    return res.status(500).send({
      isSuccess: false,
      message: "An internal server error occurred",
    });
  }
};


async function getFilteredCampaignIds(req) {
  const configId = req?.config?.configId;
  const { adTypeCampaignSchema } = req.models;
  const adType = req?.adType;

  try {
    let {
      fromDate,
      toDate,
      profileId,
      type,
      status,
      searchName,
      fieldName,
      fieldOperator,
      fieldValue,
      conditions,
      extraFieldOperator,
      customFilter,
      extraFieldValue,
      profitFilter,
      filteredCampaignIds,
      campaignId
    } = req.body;
    customFilter = sanitizeQueryObject(safeJSON(customFilter));

    if (!profileId) {
      return { success: false, message: "Profile id required." };
    }

    const effectiveFilteredCampaignIds = (filteredCampaignIds && filteredCampaignIds.length > 0)
      ? filteredCampaignIds
      : (campaignId ? (Array.isArray(campaignId) ? campaignId : [campaignId]) : []);

    const profile = await getProfile(configId, profileId);
    const timezone = profile.timezone;
    const reportDate = {
      $gte: fromDate || moment().tz(timezone).format("YYYY-MM-DD"),
    };

    // Get settings (same as getCampaigns)
    const cpSetting = await camapignSetting.findOne({ profileId, ...(configId && { configId }) }).lean();
    const healthScore = await healthScoreSettingSchema.find({ configId: configId, profileId: profileId }).lean();

    const performanceScore = await performanceScoreSettingSchema.find({ configId: configId, profileId: profileId }).lean();
    const healthScoreBranches = healthScore.map(hs => ({ case: addCampaignSettingPipelineQuery(hs.conditions, cpSetting), then: hs.scoreName }));
    const performanceScoreBranches = performanceScore.map(hs => ({ case: addCampaignSettingPipelineQuery(hs.conditions, cpSetting), then: hs.scoreName }));

    // Build match stage (EXACTLY same as getCampaigns)
    const matchStage = {
      $match: {
        configId,
        profileId,
        reportDate,
        ...(effectiveFilteredCampaignIds?.length > 0 && {
          campaignId: {
            $in: effectiveFilteredCampaignIds.flatMap(id => {
              const num = Number(id);
              return !isNaN(num) ? [num, String(id)] : [String(id)];
            })
          }
        }),
        ...(type && typeof type === "string" && { type }),
        ...(searchName && { name: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } })
      }
    };

    // Build pipeline to get ONLY campaign IDs
    const pipeline = [
      matchStage,
      {
        $setWindowFields: {
          partitionBy: "$campaignId",
          sortBy: { reportDate: -1 },
          output: { status: { $first: "$status" } }
        }
      },
      {
        $match: {
          reportDate: { $lte: toDate || moment().tz(timezone).format("YYYY-MM-DD") },
          ...(status && { status })
        }
      },
      {
        $group: {
          _id: { campaignId: "$campaignId" },
          campaign: { $first: "$$ROOT" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          orders: { $sum: "$orders" },
          timeInBudget: { $last: "$timeInBudget" },
          keywordBid: { $first: "$keywordBid" }
        },
      },
      {
        $project: {
          _id: 0,
          campaignId: "$_id.campaignId",
          budgetType: "$campaign.budgetType",
          startDate: "$campaign.startDate",
          endDate: "$campaign.endDate",
          type: "$campaign.type",
          targetingType: "$campaign.targetingType",
          costType: "$campaign.costType",
          name: "$campaign.name",
          status: "$campaign.status",
          budget: "$campaign.budget",
          keywordBid: 1,
          impressions: 1,
          clicks: 1,
          orders: 1,
          sales: { $round: ["$sales", 2] },
          spend: { $round: ["$spend", 2] },
          timeInBudget: 1,
          conversion: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] }, 0] },
          cpc: { $round: [{ $cond: { if: { $gt: ["$clicks", 0] }, then: { $divide: ["$spend", "$clicks"] }, else: 0 } }, 2] },
          ctr: { $round: [{ $cond: { if: { $gt: ["$impressions", 0] }, then: { $divide: ["$clicks", "$impressions"] }, else: 0 } }, 2] },
          acos: { $round: [{ $cond: { if: { $gt: ["$sales", 0] }, then: { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, else: 0 } }, 2] },
          roas: { $round: [{ $cond: { if: { $gt: ["$spend", 0] }, then: { $divide: ["$sales", "$spend"] }, else: 9999 } }, 2] },
        },
      },
      {
        $addFields: { healthScore: healthScoreBranches?.length ? ({ $switch: { branches: healthScoreBranches, default: "" } }) : ("") }
      },
      {
        $addFields: { performanceCategory: performanceScoreBranches?.length ? ({ $switch: { branches: performanceScoreBranches, default: "" } }) : ("") }
      },
      ...(customFilter && Object.keys(customFilter).length > 0
        ? [{ $match: customFilter }]
        : []),
    ];

    if (profitFilter) {
      pipeline.push({ $match: { performanceCategory: profitFilter } });
    }

    // Add field filtering
    if (fieldName && fieldOperator && fieldValue !== undefined) {
      const fieldFilter = { [fieldName]: { [fieldOperator]: fieldValue } };
      if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
        const extraFieldFilter = { [fieldName]: { [extraFieldOperator]: extraFieldValue } };
        const logicalOperator = { [`$${conditions.toLowerCase()}`]: [fieldFilter, extraFieldFilter] };
        pipeline.push({ $match: logicalOperator });
      } else {
        pipeline.push({ $match: fieldFilter });
      }
    }

    // Final projection - ONLY return campaign IDs
    pipeline.push({ $project: { campaignId: 1, _id: 0 } });

    const result = await adTypeCampaignSchema.aggregate(pipeline);
    const campaignIds = result.map(item => item.campaignId);

    return { success: true, campaignIds: campaignIds, totalCampaigns: campaignIds.length };
  } catch (error) {
    write_logs({ message: `[getFilteredCampaignIds Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return { success: false, error: "An internal server error occurred" };
  }
}


exports.getCampaignChartData = async (req, res) => {
  const configId = req?.config?.configId;
  const { adTypeCampaignSchema } = req.models;

  try {
    let {
      fromDate,
      toDate,
      profileId,
      type,
      customFilter,
      campaignId,
      filteredCampaignIds,
    } = req.body;
    customFilter = sanitizeQueryObject(safeJSON(customFilter));

    if (!profileId) {
      return res.status(203).send({ isSuccess: false, message: "Profile id required." });
    }

    let targetCampaignIds = [];
    const directCampaignId = campaignId || (Array.isArray(filteredCampaignIds) && filteredCampaignIds.length === 1 ? filteredCampaignIds[0] : null);

    if (directCampaignId) {
      const rawIds = Array.isArray(directCampaignId) ? directCampaignId : [directCampaignId];
      const parsedIds = new Set();
      rawIds.forEach(id => {
        if (id != null && id !== "") {
          const num = Number(id);
          if (!isNaN(num)) parsedIds.add(num);
          parsedIds.add(String(id));
        }
      });
      targetCampaignIds = Array.from(parsedIds);
    } else {
      const filterResult = await getFilteredCampaignIds(req);

      if (!filterResult.success) {
        return res.status(203).send({ isSuccess: false, message: filterResult.message || "Failed to filter campaigns", error: filterResult.error });
      }

      targetCampaignIds = filterResult.campaignIds;
    }

    if (!targetCampaignIds || targetCampaignIds.length === 0) {
      return res.status(200).send({ isSuccess: true, data: [], message: "No campaigns found matching the filters" });
    }

    const profile = await getProfile(configId, profileId);
    const timezone = profile.timezone;
    const fromDateValue = fromDate || moment().tz(timezone).format("YYYY-MM-DD");
    const toDateValue = toDate || moment().tz(timezone).format("YYYY-MM-DD");

    const chartPipeline = [
      {
        $match: {
          configId,
          profileId: Number(profileId),
          campaignId: { $in: targetCampaignIds },
          reportDate: { $gte: fromDateValue, $lte: toDateValue },
          ...(!directCampaignId && type && typeof type === "string" && { type }),
        }
      },
      {
        $group: {
          _id: { reportDate: "$reportDate" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          orders: { $sum: "$orders" }
        }
      },
      {
        $project: {
          _id: 0,
          reportDate: "$_id.reportDate",
          clicks: 1,
          impressions: 1,
          orders: 1,
          cpc: { $round: [{ $cond: { if: { $gt: ["$clicks", 0] }, then: { $divide: ["$spend", "$clicks"] }, else: 0 } }, 2] },
          sales: { $round: ["$sales", 2] },
          spend: { $round: ["$spend", 2] },
          acos: { $round: [{ $cond: { if: { $gt: ["$sales", 0] }, then: { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, else: 0 } }, 2] },
          roas: { $round: [{ $cond: { if: { $gt: ["$spend", 0] }, then: { $divide: ["$sales", "$spend"] }, else: 0 } }, 2] }
        }
      },
      { $sort: { reportDate: 1 } }
    ];

    const result = await adTypeCampaignSchema.aggregate(chartPipeline);

    return res.status(200).send({
      isSuccess: true,
      data: result,
      filteredCampaignIds: targetCampaignIds,
      totalFilteredCampaigns: directCampaignId ? 1 : targetCampaignIds.length
    });
  } catch (error) {
    write_logs({ message: `[getCampaignChartData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.saveCampaignNotifySetting = async (req, res) => {
  const configId = req?.config?.configId;
  try {
    let { profileId, lowACOS, highACOS } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required." });
    }

    const newItem = await adNotificationSettingSchema
      .findOneAndUpdate(
        {
          profileId,
          configId,
        },
        {
          $set: {
            lowACOS,
            highACOS,
          },
        },
        { upsert: true, new: true },
      )
      .lean();

    await logAudit(
      "CAMPAIGN_NOTIFICATION_THRESHOLD",
      `Campaign notification setting saved successfully.`,
      { lowACOS, highACOS },
      req?.user?.id,
    );

    return res.status(200).send({
      isSuccess: true,
      message: "Notification Setting Saved Successfully!",
    });
  } catch (error) {
    write_logs({ message: `[saveCampaignNotifySetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.AIAnalysis = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const {
      campaignId,
      profileId,
      startDate,
      endDate,
      aiModel,
      findNegative,
      messages,
    } = req.body;

    if (!campaignId) {
      return res.status(203).json({
        isSuccess: false,
        message: "Campaign ID is required",
      });
    }

    if (!profileId) {
      return res.status(203).json({
        isSuccess: false,
        message: "Profile ID is required",
      });
    }

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(203).json({
        isSuccess: false,
        message: "Start Date and End Date are required",
      });
    }

    const profile = await profileSchema.findOne({ configId, profileId }).lean();

    if (findNegative) {
      const searchTermData = await getSearchTermData(
        configId,
        profileId,
        campaignId,
        startDate,
        endDate,
      );

      const Messages = safeJsonParse(messages);
      const payload = {
        aiModel,
        messages: Messages,
        campaign: { searchTerm: searchTermData },
        range: { startDate, endDate },
        currencyCode: profile.currencyCode,
      };
      const campaignAnalysis = await generateSearchTermsAnalysis(payload);

      return res.status(200).json({
        isSuccess: true,
        message: "Data fetched successfully",
        result: { payload, campaignAnalysis },
      });
    } else {
      const placementData = await getPlacementLevelData(
        configId,
        profileId,
        campaignId,
        startDate,
        endDate,
      );
      const targetingData = await getTargetingLevelData(
        configId,
        profileId,
        campaignId,
        startDate,
        endDate,
      );

      const Messages = safeJsonParse(messages);
      const payload = {
        aiModel,
        messages: Messages,
        campaign: { placements: placementData, targeting: targetingData },
        range: { startDate, endDate },
        currencyCode: profile.currencyCode,
      };
      const campaignAnalysis =
        await generatePlacementAndTargetingAnalysis(payload);

      return res.status(200).json({
        isSuccess: true,
        message: "Data fetched successfully",
        result: { payload, campaignAnalysis },
      });
    }
  } catch (error) {
    write_logs({ message: `[AIAnalysis Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Something went wrong",
      error: "An internal server error occurred",
    });
  }
};

exports.hourlyCampaignTracking = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { campaignId, profileId, startDate, endDate } = req.body;

    const profile = await getProfile(configId, profileId);
    if (!profileId || !profile) {
      return res.status(203).json({
        isSuccess: false,
        message: "Profile ID is required",
      });
    }

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(203).json({
        isSuccess: false,
        message: "Start Date and End Date are required",
      });
    }

    // Indexed (profileId + purchaseDate) range for the orders lookup below. The
    // lookup already filters precisely by timezone-local date/time via $expr
    // (which can't use an index); adding this direct range lets Mongo narrow to
    // the window with an index first instead of scanning every order. Buffered
    // by a day each side so timezone conversion can never exclude a valid order
    // — the precise $expr still does the exact per-slot matching.
    const ordersTz = profile?.timezone || "UTC";
    const ordersRangeStart = moment.tz(startDate, "YYYY-MM-DD", ordersTz).subtract(1, "day").startOf("day").toDate();
    const ordersRangeEnd = moment.tz(endDate, "YYYY-MM-DD", ordersTz).add(1, "day").endOf("day").toDate();

    const pipeline = [
      {
        $match: {
          configId: new mongoose.Types.ObjectId(configId),
          profileId: Number(profileId),
          ...(campaignId &&
            campaignId.length > 0 && {
            campaignId: { $in: campaignId.map((cp) => Number(cp)) },
          }),
          reportDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: "$reportDate",
            startTime: "$startTime",
            endTime: "$endTime",
            campaignId: "$campaignId",
          },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          spends: { $sum: "$spends" },
          sales: { $sum: "$sales" },
          orders: { $sum: "$orders" },
        },
      },
      {
        $lookup: {
          from: "campaigns",
          let: { cId: "$_id.campaignId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$campaignId", "$$cId"] } } },
            { $limit: 1 },
            { $project: { name: 1 } },
          ],
          as: "campaign",
        },
      },
      {
        $unwind: { path: "$campaign", preserveNullAndEmptyArrays: true },
      },
      {
        $group: {
          _id: {
            date: "$_id.date",
            startTime: "$_id.startTime",
            endTime: "$_id.endTime",
          },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          spends: { $sum: "$spends" },

          // Ads Data
          adsSales: { $sum: "$sales" },
          adsOrders: { $sum: "$orders" },
          campaignData: {
            $push: {
              campaignId: "$_id.campaignId",
              campaignName: { $ifNull: ["$campaign.name", "Unknown Campaign"] },
              type: "ads",

              impressions: "$impressions",
              clicks: "$clicks",
              spends: "$spends",

              sales: "$sales",
              orders: "$orders",

              adsSales: "$sales",
              adsOrders: "$orders",

              organicSales: 0,
              organicOrders: 0,

              ctr: {
                $round: [
                  {
                    $cond: [
                      { $gt: ["$impressions", 0] },
                      {
                        $multiply: [
                          { $divide: ["$clicks", "$impressions"] },
                          100,
                        ],
                      },
                      0,
                    ],
                  },
                  2,
                ],
              },
              cpc: {
                $round: [
                  {
                    $cond: [
                      { $gt: ["$clicks", 0] },
                      { $divide: ["$spends", "$clicks"] },
                      0,
                    ],
                  },
                  2,
                ],
              },
              acos: {
                $cond: [
                  { $gt: ["$sales", 0] },
                  {
                    $round: [
                      { $multiply: [{ $divide: ["$spends", "$sales"] }, 100] },
                      2,
                    ],
                  },
                  0,
                ],
              },
              roas: {
                $cond: [
                  { $gt: ["$spends", 0] },
                  { $round: [{ $divide: ["$sales", "$spends"] }, 2] },
                  0,
                ],
              },
            },
          },
        },
      },
      {
        // Ads-side derived metrics only. Orders / organic totals are merged in
        // below from a single decorrelated orders pass (not a per-bucket lookup).
        $addFields: {
          ctr: {
            $round: [
              {
                $cond: [
                  { $gt: ["$impressions", 0] },
                  { $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] },
                  0,
                ],
              },
              2,
            ],
          },
          cpc: {
            $round: [
              {
                $cond: [
                  { $gt: ["$clicks", 0] },
                  { $divide: ["$spends", "$clicks"] },
                  0,
                ],
              },
              2,
            ],
          },
          acos: {
            $cond: [
              { $gt: ["$adsSales", 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ["$spends", "$adsSales"] }, 100] },
                  2,
                ],
              },
              0,
            ],
          },
          roas: {
            $cond: [
              { $gt: ["$spends", 0] },
              { $round: [{ $divide: ["$adsSales", "$spends"] }, 2] },
              0,
            ],
          },
        },
      },
      {
        $sort: {
          "_id.date": 1,
          "_id.startTime": 1,
        },
      },
    ];

    const adsRows =
      await keywordsHourlyPerformanceSchema.aggregate(pipeline).allowDiskUse(true);

    // ── Orders / organic totals, decorrelated ──────────────────────────────
    // The previous version joined `orders` as a correlated $lookup INSIDE every
    // hourly bucket (up to 24×days ≈ hundreds of executions), and each run
    // re-scanned the whole order window computing three timezone conversions per
    // order plus a nested per-order `transactions` lookup — the 20–40s cost.
    // The per-hour order/sales totals don't depend on the keyword grouping, so
    // compute them ONCE here (one indexed scan over { profileId, purchaseDate },
    // grouped by the timezone-local date + hour) and merge in memory below.
    const ordersByHour = await orderSchema
      .aggregate([
        {
          $match: {
            profileId: Number(profileId),
            purchaseDate: { $gte: ordersRangeStart, $lte: ordersRangeEnd },
            orderStatus: { $ne: "Cancelled" },
          },
        },
        {
          $addFields: {
            _locDate: { $dateToString: { format: "%Y-%m-%d", date: "$purchaseDate", timezone: ordersTz } },
            _locHour: { $dateToString: { format: "%H", date: "$purchaseDate", timezone: ordersTz } },
          },
        },
        // Trim the ±1-day buffer back to the exact requested window (tz-local).
        { $match: { $expr: { $and: [{ $gte: ["$_locDate", startDate] }, { $lte: ["$_locDate", endDate] }] } } },
        {
          $lookup: {
            from: "transactions",
            let: { orderId: "$amazonOrderId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$amazonOrderId", "$$orderId"] },
                  transactionType: "Order Payment",
                },
              },
              { $group: { _id: "$amazonOrderId", principal: { $sum: "$principal" } } },
            ],
            as: "transactionData",
          },
        },
        {
          $addFields: {
            principalAmount: {
              $cond: [
                { $gt: [{ $size: "$transactionData" }, 0] },
                { $ifNull: [{ $arrayElemAt: ["$transactionData.principal", 0] }, 0] },
                { $round: [{ $divide: ["$itemPrice", 1.05] }, 2] },
              ],
            },
          },
        },
        {
          $group: {
            _id: { date: "$_locDate", hour: "$_locHour" },
            totalOrders: { $sum: 1 },
            totalSales: { $sum: "$principalAmount" },
          },
        },
      ])
      .allowDiskUse(true);

    // Key order totals by `${date}|${HH}` for O(1) lookup per hourly slot.
    const ordersByKey = new Map();
    for (const o of ordersByHour || []) {
      ordersByKey.set(`${o?._id?.date}|${o?._id?.hour}`, {
        totalOrders: o?.totalOrders || 0,
        totalSales: o?.totalSales || 0,
      });
    }

    // Left-join the per-hour order totals onto each ads bucket and derive the
    // organic split + the trailing "Organic Sales" campaignData entry — exactly
    // as the old in-pipeline stages did.
    const hourlyData = (adsRows || []).map((row) => {
      const hh = parseInt(String(row?._id?.startTime || "").split(":")[0], 10);
      const hourKey = Number.isNaN(hh) ? "" : String(hh).padStart(2, "0");
      const tot = ordersByKey.get(`${row?._id?.date}|${hourKey}`) || { totalOrders: 0, totalSales: 0 };

      const adsSales = row.adsSales || 0;
      const adsOrders = row.adsOrders || 0;
      const totalOrders = tot.totalOrders;
      const totalSales = tot.totalSales;
      const organicOrders = totalOrders - adsOrders;
      const organicSales = totalSales - adsSales;

      const campaignData = [
        ...(row.campaignData || []),
        {
          campaignId: null,
          campaignName: "Organic Sales",
          type: "organic",
          impressions: 0,
          clicks: 0,
          spends: 0,
          sales: organicSales,
          orders: organicOrders,
          adsSales: 0,
          adsOrders: 0,
          organicSales,
          organicOrders,
          totalSales,
          totalOrders,
          ctr: 0,
          cpc: 0,
          acos: 0,
          roas: 0,
        },
      ];

      return {
        ...row,
        campaignData,
        totalOrders,
        totalSales,
        organicOrders,
        organicSales,
        sales: totalSales,
        orders: totalOrders,
      };
    });

    return res.status(200).json({
      isSuccess: true,
      message: "Data fetched successfully",
      result: { hourlyData },
    });
  } catch (error) {
    write_logs({ message: `[hourlyCampaignTracking Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Something went wrong",
      error: "An internal server error occurred",
    });
  }
};

exports.hourlyPlacementTracking = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { campaignId = [], profileId, startDate, endDate } = req.body;

    // Validation
    if (!profileId) {
      return res.status(203).json({
        isSuccess: false,
        message: "Profile ID is required",
      });
    }

    if (!startDate || !endDate) {
      return res.status(203).json({
        isSuccess: false,
        message: "Start Date and End Date are required",
      });
    }

    // Common stages (reuse to avoid duplication)
    const groupStage = {
      $group: {
        _id: {
          date: "$reportDate",
          startTime: "$startTime",
          endTime: "$endTime",
        },
        impressions: { $sum: "$impressions" },
        clicks: { $sum: "$clicks" },
        spends: { $sum: "$spends" },
        sales: { $sum: "$sales" },
        orders: { $sum: "$orders" },
      },
    };

    const addFieldsStage = {
      $addFields: {
        ctr: {
          $round: [
            {
              $cond: [
                { $gt: ["$impressions", 0] },
                { $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] },
                0,
              ],
            },
            2,
          ],
        },
        cpc: {
          $round: [
            {
              $cond: [
                { $gt: ["$clicks", 0] },
                { $divide: ["$spends", "$clicks"] },
                0,
              ],
            },
            2,
          ],
        },
        acos: {
          $cond: [
            { $gt: ["$sales", 0] },
            { $round: [{ $divide: ["$spends", "$sales"] }, 2] },
            0,
          ],
        },
        roas: {
          $cond: [
            { $gt: ["$spends", 0] },
            { $round: [{ $divide: ["$sales", "$spends"] }, 2] },
            0,
          ],
        },
      },
    };

    const sortStage = {
      $sort: {
        "_id.date": 1,
        "_id.startTime": 1,
      },
    };

    const pipeline = [
      {
        $match: {
          configId: new mongoose.Types.ObjectId(configId),
          profileId: Number(profileId),
          ...(campaignId.length > 0 && {
            campaignId: { $in: campaignId.map((cp) => Number(cp)) },
          }),
          reportDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $facet: {
          topOfSearch: [
            { $match: { placement: "Top of Search" } },
            groupStage,
            addFieldsStage,
            sortStage,
          ],
          restOfSearch: [
            { $match: { placement: "Rest of Search" } },
            groupStage,
            addFieldsStage,
            sortStage,
          ],
          productPages: [
            { $match: { placement: "Product pages" } },
            groupStage,
            addFieldsStage,
            sortStage,
          ],
        },
      },
    ];

    const [result] = await keywordsHourlyPerformanceSchema.aggregate(pipeline);

    return res.status(200).json({
      isSuccess: true,
      message: "Placement-wise hourly data fetched successfully",
      result: {
        topOfSearch: result?.topOfSearch || [],
        restOfSearch: result?.restOfSearch || [],
        productPages: result?.productPages || [],
      },
    });
  } catch (error) {
    write_logs({ message: `[hourlyPlacementTracking Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Something went wrong",
      error: "An internal server error occurred",
    });
  }
};

exports.acosMonitor = async (req, res) => {
  cron_logs({
    message: `India Time = ${moment()
      .tz("Asia/Kolkata")
      .format("HH:mm")} acosMonitor`,
    log_type: "info",
  });

  try {
    const getProfileId = await getActivePlanProfiles();
    const listPromises = getProfileId.map((profile) =>
      limit(async () => {
        let { fromDate, toDate } = getRuleDate(profile.timezone, "LAST_7_DAYS");
        const notifySetting = await adNotificationSettingSchema
          .findOne({
            profileId: profile.profileId,
            configId: profile.configId,
          })
          .lean();

        if (notifySetting) {
          const query = {
            reportDate: { $gte: fromDate, $lte: toDate },
            profileId: profile.profileId,
            configId: profile.configId,
          };

          const pipeline = await this.campaignPipeline(query, toDate, "SP");
          pipeline.push({
            $match: {
              spend: { $gt: 0 },
              sales: { $gt: 0 },
              $or: [
                { acos: { $lt: notifySetting.lowACOS } },
                { acos: { $gt: notifySetting.highACOS } },
              ],
            },
          });
          const campaigns = await campaignsSchema
            .aggregate(pipeline)
            .allowDiskUse(true);
          if (campaigns.length > 0) {
            const campaignObj = campaigns.map((cp) => ({
              profileId: profile.profileId,
              configId: profile.configId,
              notificationTitle:
                cp.acos < notifySetting.lowACOS
                  ? "Low ACOS — Great Performance!"
                  : "High ACOS Alert!",
              notificationText:
                cp.acos < notifySetting.lowACOS
                  ? `Your <span data-link="/?search=${Buffer.from(String(cp?.name)).toString("base64")}" class="text-blue text-decoration-underline"><b>${cp?.name},</b></span> are performing efficiently. Maintain current bids or scale budget to boost sales further.`
                  : `<span data-link="/?search=${Buffer.from(String(cp?.name)).toString("base64")}" class="text-blue text-decoration-underline"><b>${cp?.name},</b></span> Your ad spend is high compared to sales. Review your keywords, bids, and targeting to reduce cost.`,
              searchable: cp.name,
            }));
            await adNotificationSchema.insertMany(campaignObj);

            await Promise.all(
              campaigns?.map(async (cp) => {
                const notificationTitle =
                  cp.acos < notifySetting.lowACOS
                    ? "Low ACOS — Great Performance!"
                    : "High ACOS Alert!";
                const notificationMessage =
                  cp.acos < notifySetting.lowACOS
                    ? `Your ${cp?.name}, are performing efficiently. Maintain current bids or scale budget to boost sales further.`
                    : `${cp?.name}, Your ad spend is high compared to sales. Review your keywords, bids, and targeting to reduce cost.`;
                await sendNotificationToUser(
                  profile?.profileId,
                  notificationTitle,
                  notificationMessage,
                );
              }),
            );
          }
          cron_logs({
            message: `Config ID: ${profile.configId}, Profile ID: ${profile.profileId}, Total ${campaigns.length} ACOS Monitored successfully.`,
            log_type: "info",
          });
        }
      }),
    );

    await Promise.all(listPromises);
    cron_logs({
      message: "ACOS Monitored successfully.",
      log_type: "info",
    });
  } catch (error) {
    cron_logs({
      message: `ACOS Monitored err: ${error}`,
      log_type: "error",
    });
  }
};

exports.budgetMonitor = async (req, res) => {
  cron_logs({
    message: `India Time = ${moment()
      .tz("Asia/Kolkata")
      .format("HH:mm")} budgetMonitor`,
    log_type: "info",
  });

  try {
    const getProfileId = await getActivePlanProfiles();
    const listPromises = getProfileId.map((profile) =>
      limit(async () => {
        let { fromDate, toDate } = getRuleDate(profile.timezone, "LAST_7_DAYS");
        const query = {
          reportDate: { $gte: fromDate, $lte: toDate },
          profileId: profile.profileId,
          configId: profile.configId,
        };

        const pipeline = await this.campaignPipeline(query, toDate, "SP");
        pipeline.push({
          $match: {
            status: "OUT_OF_BUDGET",
          },
        });
        const campaigns = await campaignsSchema
          .aggregate(pipeline)
          .allowDiskUse(true);
        if (campaigns.length > 0) {
          const campaignObj = campaigns.map((cp) => ({
            profileId: profile.profileId,
            configId: profile.configId,
            notificationTitle: `Campaign Out Of Budget!`,
            notificationText: `Your <span data-link="/?search=${Buffer.from(String(cp?.name)).toString("base64")}" class="text-blue text-decoration-underline"><b>${cp?.name},</b></span> daily budget has been exceeded. Ads in this campaign are not eligible for display until midnight.`,
            searchable: cp.name,
          }));

          await adNotificationSchema.insertMany(campaignObj);

          await Promise.all(
            campaigns?.map(async (cp) => {
              const notificationTitle = `Campaign Out Of Budget!`;
              const notificationMessage = `Your ${cp?.name}, daily budget has been exceeded. Ads in this campaign are not eligible for display until midnight.`;
              await sendNotificationToUser(
                profile?.profileId,
                notificationTitle,
                notificationMessage,
              );
            }),
          );
        }

        cron_logs({
          message: `Config ID: ${profile.configId}, Profile ID: ${profile.profileId}, Total ${campaigns.length} Camapign Out Of Budget Monitored successfully.`,
          log_type: "info",
        });

        const createCronHistory = new cronJobHistorySchema({
          configId: profile.configId,
          profileId: profile.profileId,
          cronName: "Campaign Monitor",
          status: "COMPLETED",
          historyDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
        });
        await createCronHistory.save();
      }),
    );

    await Promise.all(listPromises);
    cron_logs({
      message: "Campaign Out Of Budget Monitored successfully.",
      log_type: "info",
    });
  } catch (error) {
    cron_logs({
      message: `Campaign Out Of Budget Monitored err: ${error}`,
      log_type: "error",
    });
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.processQueue = async () => {
  ams_write_logs({
    message: `processQueue`,
    log_type: "info",
  });

  while (true) {
    try {
      const processedCount = await processAMSQueue();
      if (processedCount === 0) {
        await sleep(2000);
      }

      ams_write_logs({
        message: `processQueue: queue processed...`,
        log_type: "info",
      });
    } catch (err) {
      ams_write_logs({
        message: `Process queue Error: ${err?.stack || err?.message || err}`,
        log_type: "error",
      });

      await sleep(5000);
    }
  }
};

async function processAMSQueue() {
  const messages = await retryWithBackoff(
    () =>
      SQSMessageSchema.aggregate([
        {
          $match: {
            $or: [
              { retryCount: { $exists: false } },
              { retryCount: { $lt: 3 } }
            ]
          }
        },
        { $sort: { createdAt: 1 } },
        { $limit: 500 },
      ]),
    3,
    3000,
  );

  if (messages.length === 0) return 0;

  const profiles = await retryWithBackoff(
    () => profileSchema.find({ isActive: true }).lean(),
    3,
    3000,
  );

  const deleteIds = [];
  const failedIds = [];

  let count = 1;

  await Promise.all(
    messages.map((message) =>
      amsLimit(async () => {
        ams_write_logs({
          message: `Process Message : ${count++}`,
          log_type: "info",
        });

        let body = message.body || {};
        try {
          if (body.Type === "SubscriptionConfirmation") {
            ams_write_logs({
              message: `SubscriptionConfirmation Message: [${message._id}]: ${JSON.stringify(body)}`,
              log_type: "info",
            });

            await sendEmailHelper(
              process.env.RECEIVER_EMAIL,
              "Action Required: Confirm SNS to SQS Subscription",
              buildSqsConfirmationEmail({
                topicArn: body.TopicArn,
                subscribeUrl: body.SubscribeURL,
                requestBody: body,
              }),
            );
          }

          const profile = profiles.find(
            (p) =>
              p.marketplaceStringId === body.marketplace_id &&
              p.advertiserId === body.advertiser_id,
          );

          if (profile) {
            switch (body.dataset_id) {
              case "budget-usage":
                await updateCampaignBudgetUsage(body, profile);
                break;
              case "sp-traffic":
              case "sb-traffic":
              case "sd-traffic":
                await updateKeywordsHourlyData(body, profile);
                break;
              case "sp-conversion":
              case "sb-conversion":
              case "sd-conversion":
                await updateConversionData(body, profile);
                break;
              case "campaigns":
              case "ads-campaign-management-campaigns":
                await updateCampaignManagementData(body, profile);
                break;
              case "adgroups":
              case "ads-campaign-management-adgroups":
                await updateAdgroupManagementData(body, profile);
                break;
              case "targets":
              case "ads-campaign-management-targets":
                await updateTargetManagementData(body, profile);
                break;
            }
          }

          deleteIds.push(message._id);
        } catch (error) {
          failedIds.push(message._id);
          ams_write_logs({
            message: `Message processing failed [${message._id}]: ${error.message}`,
            log_type: "error",
          });
          await retryWithBackoff(
            () =>
              SQSMessageSchema.updateOne(
                { _id: message._id },
                {
                  $inc: { retryCount: 1 },
                  $set: { lastError: error.message }
                }
              ),
            3,
            2000
          ).catch((dbErr) => {
            ams_write_logs({
              message: `Failed to update retryCount for message [${message._id}]: ${dbErr.message}`,
              log_type: "error",
            });
          });
        }
      }),
    ),
  );

  if (deleteIds.length > 0) {
    await retryWithBackoff(
      () => SQSMessageSchema.deleteMany({ _id: { $in: deleteIds } }),
      3,
      2000,
    );
  }

  ams_write_logs({
    message: `Queue batch done — Success: ${deleteIds.length}, Failed: ${failedIds.length}`,
    log_type: "info",
  });

  return messages.length;
}

const incrementCampaignTotals = async (
  adTypeSchema,
  profile,
  reportDate,
  campaignId,
  deltas = {},
  session = null
) => {
  const incFields = {};
  for (const [field, val] of Object.entries(deltas)) {
    const num = Number(val);
    if (!isNaN(num) && num !== 0) {
      incFields[`streaming.${field}`] = num;
    }
  }

  if (Object.keys(incFields).length === 0) return;

  await adTypeSchema
    .findOneAndUpdate(
      {
        profileId: profile?.profileId,
        configId: profile?.configId,
        campaignId: Number(campaignId),
        reportDate: reportDate,
      },
      {
        $inc: incFields,
        $set: {
          "streaming.lastSyncAt": new Date(),
        },
      },
      { upsert: true, ...(session && { session }) }
    )
    .lean();
};

const updateCampaignHourlyData = async (
  adTypeSchema,
  type,
  profile,
  reportDate,
  campaignId,
) => {
  const campaignHourlyData = await keywordsHourlyPerformanceSchema.aggregate([
    {
      $match: {
        profileId: profile?.profileId,
        configId: profile?.configId,
        campaignId: campaignId,
        reportDate: reportDate,
        type,
      },
    },
    {
      $group: {
        _id: "$campaignId",
        totalImpressions: { $sum: "$impressions" },
        totalClicks: { $sum: "$clicks" },
        totalSpends: { $sum: "$spends" },
        totalSales: { $sum: "$sales" },
        totalUnits: { $sum: "$units" },
        totalOrders: { $sum: "$orders" },
      },
    },
  ]);

  const campaignHourly = campaignHourlyData?.[0];

  if (campaignHourlyData?.length > 0) {
    await adTypeSchema
      .findOneAndUpdate(
        {
          profileId: profile?.profileId,
          configId: profile?.configId,
          campaignId: campaignId,
          reportDate: reportDate,
        },
        {
          $set: {
            "streaming.impressions": campaignHourly?.totalImpressions,
            "streaming.clicks": campaignHourly?.totalClicks,
            "streaming.spend": campaignHourly?.totalSpends,
            "streaming.sales": campaignHourly?.totalSales,
            "streaming.units": campaignHourly?.totalUnits,
            "streaming.orders": campaignHourly?.totalOrders,
            "streaming.lastSyncAt": new Date(),
          },
        },
        { upsert: true },
      )
      .lean();
  }
};

async function updateCampaignBudgetUsage(data, profile) {
  const currentDate = moment(data.usage_updated_timestamp)
    .tz(profile.timezone)
    .format("YYYY-MM-DD");
  const spend = Number(
    ((data.budget_usage_percentage * data.budget) / 100).toFixed(2),
  );

  let adTypeSchema = campaignsSchema;

  if (data.advertising_product_type == "sb") {
    adTypeSchema = sbCampaignsSchema;
  }
  if (data.advertising_product_type == "sd") {
    adTypeSchema = sdCampaignsSchema;
  }

  const campaign = await adTypeSchema
    .findOne({
      configId: profile.configId,
      profileId: profile.profileId,
      campaignId: Number(data.budget_scope_id),
      reportDate: currentDate,
    })
    .lean();

  if (!campaign) return false;

  const result = await adTypeSchema
    .findOneAndUpdate(
      { _id: campaign._id },
      {
        $set: {
          "budgetTracking.estimatedSpend": spend,
          "budgetTracking.lastUsagePercentage": data.budget_usage_percentage,
          "budgetTracking.lastUpdated": new Date(),
          status:
            spend > 0.95 * data.budget ? "OUT_OF_BUDGET" : campaign.status,
        },
      },
      { upsert: true },
    )
    .lean();

  return true;
}

async function updateKeywordsHourlyData(data, profile) {
  const reportDate = moment(data.time_window_start)
    .tz(profile.timezone)
    .format("YYYY-MM-DD");
  const startTime = moment(data.time_window_start)
    .tz(profile.timezone)
    .format("HH:mm");
  const endTime = moment(data.time_window_start)
    .tz(profile.timezone)
    .add(1, "hours")
    .format("HH:mm");

  let placementName = "";
  if (
    data.placement == "Other on-Amazon" ||
    data.placement == "Other Placements"
  ) {
    placementName = "Rest of Search";
  } else if (data.placement == "Detail Page on-Amazon") {
    placementName = "Product pages";
  } else if (
    data.placement == "Top of Search on-Amazon" ||
    data.placement == "Top of Search"
  ) {
    placementName = "Top of Search";
  }

  let type = "SP";
  let adTypeSchema = campaignsSchema;
  if (data.dataset_id == "sb-traffic") {
    type = "SB";
    adTypeSchema = sbCampaignsSchema;
  }
  if (data.dataset_id == "sd-traffic") {
    type = "SD";
    adTypeSchema = sdCampaignsSchema;
  }

  try {
    await processedSQSMessageSchema.create(
      [{ idempotencyId: data.idempotency_id }],
    );
  } catch (error) {
    const isDuplicate = error?.code === 11000
      || error?.keyPattern?.idempotencyId
      || error?.writeErrors?.some((e) => e.code === 11000)
      || (typeof error?.message === "string" && error.message.includes("E11000"));
    if (isDuplicate) return true;
    write_logs({ message: `[updateKeywordsHourlyData Error] ${error?.message || error}`, log_type: "error" });
    return true;
  }

  await keywordsHourlyPerformanceSchema
    .findOneAndUpdate(
      {
        configId: profile.configId,
        profileId: profile.profileId,
        reportDate,
        campaignId: Number(data.campaign_id),
        adGroupId: Number(data.ad_group_id),
        keywordId: Number(data.keyword_id || data.target_id),
        placement: placementName,
        startTime,
        type,
      },
      {
        $inc: {
          impressions: data.impressions || 0,
          clicks: data.clicks || 0,
          spends: data.cost || 0,
        },
        $set: {
          keywordText: data.keyword_text,
          matchType: data.match_type,
          marketplaceId: data.marketplace_id,
          endTime: endTime,
        },
      },
      { upsert: true, new: true },
    )
    .lean();

  await incrementCampaignTotals(
    adTypeSchema,
    profile,
    reportDate,
    Number(data.campaign_id),
    {
      impressions: data.impressions || 0,
      clicks: data.clicks || 0,
      spend: data.cost || 0,
    },
  );

  return true;
}

async function updateConversionData(data, profile) {
  const reportDate = moment(data.time_window_start)
    .tz(profile.timezone)
    .format("YYYY-MM-DD");
  const startTime = moment(data.time_window_start)
    .tz(profile.timezone)
    .format("HH:mm");
  const endTime = moment(data.time_window_start)
    .tz(profile.timezone)
    .add(1, "hours")
    .format("HH:mm");

  let placementName = "";
  if (
    data.placement == "Other on-Amazon" ||
    data.placement == "Other Placements"
  ) {
    placementName = "Rest of Search";
  } else if (data.placement == "Detail Page on-Amazon") {
    placementName = "Product pages";
  } else if (
    data.placement == "Top of Search on-Amazon" ||
    data.placement == "Top of Search"
  ) {
    placementName = "Top of Search";
  }

  let type = "SP";
  let adTypeSchema = campaignsSchema;
  if (data.dataset_id == "sb-conversion") {
    type = "SB";
    adTypeSchema = sbCampaignsSchema;
  }
  if (data.dataset_id == "sd-conversion") {
    type = "SD";
    adTypeSchema = sdCampaignsSchema;
  }

  try {
    await processedSQSMessageSchema.create(
      [{ idempotencyId: data.idempotency_id }],
    );
  } catch (error) {
    const isDuplicate = error?.code === 11000
      || error?.keyPattern?.idempotencyId
      || error?.writeErrors?.some((e) => e.code === 11000)
      || (typeof error?.message === "string" && error.message.includes("E11000"));
    if (isDuplicate) return true;
    write_logs({ message: `[updateConversionData Error] ${error?.message || error}`, log_type: "error" });
    return true;
  }

  const prevDoc = await keywordsHourlyPerformanceSchema
    .findOneAndUpdate(
      {
        configId: profile.configId,
        profileId: profile.profileId,
        reportDate,
        campaignId: Number(data.campaign_id),
        adGroupId: Number(data.ad_group_id),
        keywordId: Number(data.keyword_id || data.target_id),
        placement: placementName,
        startTime,
        type,
      },
      {
        $set: {
          marketplaceId: data.marketplace_id,
          sales: data.attributed_sales_7d,
          units: data.attributed_units_ordered_7d,
          orders: data.attributed_units_ordered_7d,
          endTime: endTime,
        },
      },
      { upsert: true, new: false },
    )
    .lean();

  const prevSales = Number(prevDoc?.sales) || 0;
  const prevUnits = Number(prevDoc?.units) || 0;
  const prevOrders = Number(prevDoc?.orders) || 0;
  const currentSales = Number(data.attributed_sales_7d) || 0;
  const currentUnits = Number(data.attributed_units_ordered_7d) || 0;
  const currentOrders = Number(data.attributed_units_ordered_7d) || 0;

  await incrementCampaignTotals(
    adTypeSchema,
    profile,
    reportDate,
    Number(data.campaign_id),
    {
      sales: currentSales - prevSales,
      units: currentUnits - prevUnits,
      orders: currentOrders - prevOrders,
    },
  );

  return true;
}

async function updateCampaignManagementData(data, profile) {
  let parsedData = data;
  if (typeof data === "string") {
    try {
      parsedData = JSON.parse(data);
    } catch (err) {
      parsedData = data;
    }
  }

  try {
    if (parsedData?.idempotency_id) {
      await new processedSQSMessageSchema({
        idempotencyId: parsedData.idempotency_id,
      }).save();
    }
  } catch (e) {
    ams_write_logs({
      message: `[updateCampaignManagementData SQS Deduplication] ${e?.message || e}`,
      log_type: "error",
    });
    return true;
  }

  try {
    const campaignId = parsedData?.campaign_id || parsedData?.campaignId || parsedData?.data?.campaign_id;
    if (campaignId && profile?.configId) {
      const possibleProfileIds = [];
      if (profile?.profileId !== undefined && profile?.profileId !== null) {
        possibleProfileIds.push(profile.profileId);
        const numPId = Number(profile.profileId);
        if (!isNaN(numPId)) possibleProfileIds.push(numPId);
        possibleProfileIds.push(String(profile.profileId));
      }
      const profileIdList = Array.from(new Set(possibleProfileIds));

      const possibleCampaignIds = [campaignId];
      const numCId = Number(campaignId);
      if (!isNaN(numCId)) possibleCampaignIds.push(numCId);
      possibleCampaignIds.push(String(campaignId));
      const campaignIdList = Array.from(new Set(possibleCampaignIds));

      const andConditions = [
        {
          $or: [
            { campaign_id: { $in: campaignIdList } },
            { "data.campaign_id": { $in: campaignIdList } },
          ],
        },
        {
          $or: [
            { dataset_id: "ads-campaign-management-campaigns" },
            { "data.dataset_id": "ads-campaign-management-campaigns" },
          ],
        },
      ];

      if (profileIdList.length > 0) {
        andConditions.push({
          $or: [
            { profileId: { $in: profileIdList } },
            { profile_id: { $in: profileIdList } },
            { "data.profile_id": { $in: profileIdList } },
          ],
        });
      }

      const prevRecord = await bidDataSchema
        .findOne({
          configId: profile.configId,
          $and: andConditions,
        })
        .sort({ last_updated_date_time: -1, createdAt: -1 })
        .lean();

      if (prevRecord) {
        let prevParsed = prevRecord;
        if (typeof prevRecord.data === "string") {
          try {
            prevParsed = { ...JSON.parse(prevRecord.data), ...prevRecord };
          } catch (err) { }
        } else if (prevRecord.data && typeof prevRecord.data === "object") {
          prevParsed = { ...prevRecord.data, ...prevRecord };
        }

        const numericProfileId = Number(profile.profileId) || profile.profileId;
        const numericCampaignId = Number(campaignId) || campaignId;

        // Compare budget safely
        const oldBudget = prevParsed?.budgets?.[0]?.budget_value?.monetary_budget_value?.monetary_budget?.value;
        const newBudget = parsedData?.budgets?.[0]?.budget_value?.monetary_budget_value?.monetary_budget?.value;
        if (
          oldBudget !== undefined &&
          oldBudget !== null &&
          oldBudget !== "" &&
          newBudget !== undefined &&
          newBudget !== null &&
          newBudget !== "" &&
          !isNaN(Number(oldBudget)) &&
          !isNaN(Number(newBudget)) &&
          Number(oldBudget) !== Number(newBudget)
        ) {
          const existingChange = await campaignChangeHistorySchema.findOne({
            configId: profile.configId,
            profileId: numericProfileId,
            changeLevel: numericCampaignId,
            changeType: "Update Budget",
            newValue: String(newBudget),
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
          }).lean();

          if (!existingChange) {
            await campaignChangeHistorySchema.create({
              configId: profile.configId,
              profileId: numericProfileId,
              changeLevel: numericCampaignId,
              changeType: "Update Budget",
              oldValue: String(oldBudget),
              newValue: String(newBudget),
              updatedFrom: "Amazon Stream",
              type: "SP",
            });
          }
        }

        // Compare status / state safely
        if (
          prevParsed?.state &&
          parsedData?.state &&
          prevParsed.state !== parsedData.state
        ) {
          const existingStateChange = await campaignChangeHistorySchema.findOne({
            configId: profile.configId,
            profileId: numericProfileId,
            changeLevel: numericCampaignId,
            changeType: "Update State",
            newValue: parsedData.state,
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
          }).lean();

          if (!existingStateChange) {
            await campaignChangeHistorySchema.create({
              configId: profile.configId,
              profileId: numericProfileId,
              changeLevel: numericCampaignId,
              changeType: "Update State",
              oldValue: prevParsed.state,
              newValue: parsedData.state,
              updatedFrom: "Amazon Stream",
              type: "SP",
            });
          }
        }

        // Compare placement adjustments safely
        const oldPlacements = prevParsed?.optimizations?.bid_settings?.bid_adjustments?.placement_bid_adjustments || [];
        const newPlacements = parsedData?.optimizations?.bid_settings?.bid_adjustments?.placement_bid_adjustments || [];
        const placementNames = {
          TOP_OF_SEARCH: "Top of Search",
          REST_OF_SEARCH: "Rest of Search",
          PRODUCT_PAGE: "Product pages",
        };
        for (const newAdj of newPlacements) {
          const oldAdj = oldPlacements.find((o) => o.placement === newAdj.placement);
          if (
            oldAdj &&
            oldAdj.percentage !== undefined &&
            newAdj.percentage !== undefined &&
            oldAdj.percentage !== newAdj.percentage
          ) {
            const pName = placementNames[newAdj.placement] || newAdj.placement;
            const changeType = `Update ${pName} Placement Bid`;
            const existingAdj = await campaignChangeHistorySchema.findOne({
              configId: profile.configId,
              profileId: numericProfileId,
              changeLevel: numericCampaignId,
              changeType,
              newValue: `${newAdj.percentage}%`,
              createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
            }).lean();

            if (!existingAdj) {
              await campaignChangeHistorySchema.create({
                configId: profile.configId,
                profileId: numericProfileId,
                changeLevel: numericCampaignId,
                changeType,
                oldValue: `${oldAdj.percentage}%`,
                newValue: `${newAdj.percentage}%`,
                updatedFrom: "Amazon Stream",
                type: "SP",
              });
            }
          }
        }
      }
    }
  } catch (changeErr) {
    ams_write_logs({
      message: `[updateCampaignManagementData ChangeHistory] ${changeErr?.message || changeErr}`,
      log_type: "error",
    });
  }

  try {
    await new bidDataSchema({
      configId: profile?.configId,
      profileId: Number(profile?.profileId) || profile?.profileId,
      ...(typeof parsedData === "object" && parsedData !== null ? parsedData : {}),
    }).save();
  } catch (e) {
    ams_write_logs({
      message: `[updateCampaignManagementData Save] ${e?.message || e}`,
      log_type: "error",
    });
  }

  return true;
}

async function updateAdgroupManagementData(data, profile) {
  let parsedData = data;
  if (typeof data === "string") {
    try {
      parsedData = JSON.parse(data);
    } catch (err) {
      parsedData = data;
    }
  }

  try {
    if (parsedData?.idempotency_id) {
      await new processedSQSMessageSchema({
        idempotencyId: parsedData.idempotency_id,
      }).save();
    }
  } catch (e) {
    ams_write_logs({
      message: `[updateAdgroupManagementData SQS Deduplication] ${e?.message || e}`,
      log_type: "error",
    });
    return true;
  }

  try {
    const adGroupId = parsedData?.ad_group_id || parsedData?.adGroupId || parsedData?.data?.ad_group_id;
    const campaignId = parsedData?.campaign_id || parsedData?.campaignId || parsedData?.data?.campaign_id;

    if (adGroupId && profile?.configId) {
      const possibleProfileIds = [];
      if (profile?.profileId !== undefined && profile?.profileId !== null) {
        possibleProfileIds.push(profile.profileId);
        const numPId = Number(profile.profileId);
        if (!isNaN(numPId)) possibleProfileIds.push(numPId);
        possibleProfileIds.push(String(profile.profileId));
      }
      const profileIdList = Array.from(new Set(possibleProfileIds));

      const possibleAdGroupIds = [adGroupId];
      const numAId = Number(adGroupId);
      if (!isNaN(numAId)) possibleAdGroupIds.push(numAId);
      possibleAdGroupIds.push(String(adGroupId));
      const adGroupIdList = Array.from(new Set(possibleAdGroupIds));

      const andConditions = [
        {
          $or: [
            { ad_group_id: { $in: adGroupIdList } },
            { "data.ad_group_id": { $in: adGroupIdList } },
          ],
        },
        {
          $or: [
            { dataset_id: "ads-campaign-management-adgroups" },
            { dataset_id: "adgroups" },
            { "data.dataset_id": "ads-campaign-management-adgroups" },
            { "data.dataset_id": "adgroups" },
          ],
        },
      ];

      if (campaignId) {
        const possibleCampaignIds = [campaignId];
        const numCId = Number(campaignId);
        if (!isNaN(numCId)) possibleCampaignIds.push(numCId);
        possibleCampaignIds.push(String(campaignId));
        andConditions.push({
          $or: [
            { campaign_id: { $in: Array.from(new Set(possibleCampaignIds)) } },
            { "data.campaign_id": { $in: Array.from(new Set(possibleCampaignIds)) } },
          ],
        });
      }

      if (profileIdList.length > 0) {
        andConditions.push({
          $or: [
            { profileId: { $in: profileIdList } },
            { profile_id: { $in: profileIdList } },
            { "data.profile_id": { $in: profileIdList } },
          ],
        });
      }

      const prevRecord = await bidDataSchema
        .findOne({
          configId: profile.configId,
          $and: andConditions,
        })
        .sort({ last_updated_date_time: -1, createdAt: -1 })
        .lean();

      if (prevRecord) {
        let prevParsed = prevRecord;
        if (typeof prevRecord.data === "string") {
          try {
            prevParsed = { ...JSON.parse(prevRecord.data), ...prevRecord };
          } catch (err) { }
        } else if (prevRecord.data && typeof prevRecord.data === "object") {
          prevParsed = { ...prevRecord.data, ...prevRecord };
        }

        const numericProfileId = Number(profile.profileId) || profile.profileId;
        const numericCampaignId = Number(campaignId) || campaignId;
        const numericAdGroupId = Number(adGroupId) || adGroupId;

        // Compare default bid safely
        const oldDefaultBid = prevParsed?.default_bid?.bid !== undefined ? prevParsed.default_bid.bid : (typeof prevParsed?.default_bid === "number" ? prevParsed.default_bid : undefined);
        const newDefaultBid = parsedData?.default_bid?.bid !== undefined ? parsedData.default_bid.bid : (typeof parsedData?.default_bid === "number" ? parsedData.default_bid : undefined);

        if (
          oldDefaultBid !== undefined &&
          oldDefaultBid !== null &&
          oldDefaultBid !== "" &&
          newDefaultBid !== undefined &&
          newDefaultBid !== null &&
          newDefaultBid !== "" &&
          !isNaN(Number(oldDefaultBid)) &&
          !isNaN(Number(newDefaultBid)) &&
          Number(oldDefaultBid) !== Number(newDefaultBid)
        ) {
          const existingBidChange = await campaignChangeHistorySchema.findOne({
            configId: profile.configId,
            profileId: numericProfileId,
            changeLevel: numericCampaignId,
            adGroupId: numericAdGroupId,
            changeType: "Update Default Bid",
            newValue: String(newDefaultBid),
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
          }).lean();

          if (!existingBidChange) {
            await campaignChangeHistorySchema.create({
              configId: profile.configId,
              profileId: numericProfileId,
              changeLevel: numericCampaignId,
              adGroupId: numericAdGroupId,
              changeType: "Update Default Bid",
              oldValue: String(oldDefaultBid),
              newValue: String(newDefaultBid),
              updatedFrom: "Amazon Stream",
              type: "SP",
            });
          }
        }

        // Compare state safely
        if (
          prevParsed?.state &&
          parsedData?.state &&
          prevParsed.state !== parsedData.state
        ) {
          const existingStateChange = await campaignChangeHistorySchema.findOne({
            configId: profile.configId,
            profileId: numericProfileId,
            changeLevel: numericCampaignId,
            adGroupId: numericAdGroupId,
            changeType: "Update AdGroup State",
            newValue: parsedData.state,
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
          }).lean();

          if (!existingStateChange) {
            await campaignChangeHistorySchema.create({
              configId: profile.configId,
              profileId: numericProfileId,
              changeLevel: numericCampaignId,
              adGroupId: numericAdGroupId,
              changeType: "Update AdGroup State",
              oldValue: prevParsed.state,
              newValue: parsedData.state,
              updatedFrom: "Amazon Stream",
              type: "SP",
            });
          }
        }
      }
    }
  } catch (changeErr) {
    ams_write_logs({
      message: `[updateAdgroupManagementData ChangeHistory] ${changeErr?.message || changeErr}`,
      log_type: "error",
    });
  }

  try {
    await new bidDataSchema({
      configId: profile?.configId,
      profileId: Number(profile?.profileId) || profile?.profileId,
      ...(typeof parsedData === "object" && parsedData !== null ? parsedData : {}),
    }).save();
  } catch (e) {
    ams_write_logs({
      message: `[updateAdgroupManagementData Save] ${e?.message || e}`,
      log_type: "error",
    });
  }

  return true;
}

async function updateTargetManagementData(data, profile) {
  let parsedData = data;
  if (typeof data === "string") {
    try {
      parsedData = JSON.parse(data);
    } catch (err) {
      parsedData = data;
    }
  }

  try {
    if (parsedData?.idempotency_id) {
      await new processedSQSMessageSchema({
        idempotencyId: parsedData.idempotency_id,
      }).save();
    }
  } catch (e) {
    ams_write_logs({
      message: `[updateTargetManagementData SQS Deduplication] ${e?.message || e}`,
      log_type: "error",
    });
    return true;
  }

  // 1. Maintain backward compatibility with bidData
  try {
    await new bidDataSchema({
      configId: profile?.configId,
      profileId: Number(profile?.profileId) || profile?.profileId,
      ...(typeof parsedData === "object" && parsedData !== null ? parsedData : {}),
    }).save();
  } catch (e) {
    ams_write_logs({
      message: `[updateTargetManagementData Save bidData] ${e?.message || e}`,
      log_type: "error",
    });
  }

  // 2. Save structured record in targetingHistory table
  try {
    const rawTargetId = String(parsedData?.target_id || parsedData?.targetId || "");
    const campaignId = String(parsedData?.campaign_id || parsedData?.campaignId || "");
    const adGroupId = String(parsedData?.ad_group_id || parsedData?.adGroupId || "");
    const adProduct = parsedData?.ad_product || "SPONSORED_PRODUCTS";
    const targetType = parsedData?.target_type || "";
    const matchType =
      parsedData?.target_details?.theme_target?.match_type ||
      parsedData?.target_details?.keyword_target?.match_type ||
      parsedData?.match_type ||
      "";
    const state = parsedData?.state || "";
    const currencyCode = parsedData?.bid?.currency_code || parsedData?.currency_code || "";
    const lastUpdated = parsedData?.last_updated_date_time || parsedData?.creation_date_time || new Date().toISOString();

    let newBid = null;
    if (parsedData?.bid?.bid !== undefined && parsedData?.bid?.bid !== null && !isNaN(Number(parsedData.bid.bid))) {
      newBid = Number(parsedData.bid.bid);
    } else if (typeof parsedData?.bid === "number" && !isNaN(parsedData.bid)) {
      newBid = parsedData.bid;
    }

    const possibleProfileIds = [];
    if (profile?.profileId !== undefined && profile?.profileId !== null) {
      possibleProfileIds.push(profile.profileId);
      const numPId = Number(profile.profileId);
      if (!isNaN(numPId)) possibleProfileIds.push(numPId);
      possibleProfileIds.push(String(profile.profileId));
    }
    const profileIdList = Array.from(new Set(possibleProfileIds));

    // Look up target metadata for targeting text strictly within the same profile & campaign
    let targetingText = "";
    let targetDoc = null;
    if (rawTargetId) {
      const cleanTId = rawTargetId.replace(/^[TK]-/, "");
      const possibleIds = [rawTargetId, cleanTId, `T-${cleanTId}`, `K-${cleanTId}`];
      let targetModel = targetingSchema;
      if (adProduct === "SPONSORED_BRANDS") targetModel = sbTargetingSchema;
      else if (adProduct === "SPONSORED_DISPLAY") targetModel = sdTargetingSchema;

      const targetFilter = {
        targetId: { $in: possibleIds },
        ...(profile?.configId ? { configId: profile.configId } : {}),
      };

      if (profileIdList.length > 0) {
        targetFilter.$or = [
          { profileId: { $in: profileIdList } },
          { profile_id: { $in: profileIdList } },
        ];
      }

      if (campaignId) {
        const possibleCIds = [campaignId];
        const numCId = Number(campaignId);
        if (!isNaN(numCId)) possibleCIds.push(numCId);
        possibleCIds.push(String(campaignId));
        targetFilter.campaignId = { $in: Array.from(new Set(possibleCIds)) };
      }

      if (adGroupId) {
        const possibleAIds = [adGroupId];
        const numAId = Number(adGroupId);
        if (!isNaN(numAId)) possibleAIds.push(numAId);
        possibleAIds.push(String(adGroupId));
        targetFilter.adGroupId = { $in: Array.from(new Set(possibleAIds)) };
      }

      targetDoc = await targetModel
        .findOne(targetFilter)
        .sort({ reportDate: -1, createdAt: -1, createdDate: -1 })
        .lean();

      if (targetDoc) {
        targetingText = targetDoc.targeting || targetDoc.keywordText || "";
      }
    }

    const cleanTargetId = rawTargetId.replace(/^[TK]-/, "");

    // Look up previous bid from targetingHistory to populate oldBid
    // strictly within the same configId, profileId, campaignId, and targetId
    let oldBid = null;
    let prevRecord = null;
    if (rawTargetId) {
      const historyAndConditions = [
        {
          $or: [
            { targetId: cleanTargetId },
            { targetId: rawTargetId },
            { target_id: cleanTargetId },
            { target_id: rawTargetId },
          ],
        },
      ];

      if (profileIdList.length > 0) {
        historyAndConditions.push({
          $or: [
            { profileId: { $in: profileIdList } },
            { profile_id: { $in: profileIdList } },
          ],
        });
      }

      if (campaignId) {
        const possibleCIds = [campaignId];
        const numCId = Number(campaignId);
        if (!isNaN(numCId)) possibleCIds.push(numCId);
        possibleCIds.push(String(campaignId));
        historyAndConditions.push({
          $or: [
            { campaignId: { $in: Array.from(new Set(possibleCIds)) } },
            { campaign_id: { $in: Array.from(new Set(possibleCIds)) } },
          ],
        });
      }

      if (adGroupId) {
        const possibleAIds = [adGroupId];
        const numAId = Number(adGroupId);
        if (!isNaN(numAId)) possibleAIds.push(numAId);
        possibleAIds.push(String(adGroupId));
        historyAndConditions.push({
          $or: [
            { adGroupId: { $in: Array.from(new Set(possibleAIds)) } },
            { ad_group_id: { $in: Array.from(new Set(possibleAIds)) } },
          ],
        });
      }

      prevRecord = await targetingHistorySchema
        .findOne({
          ...(profile?.configId ? { configId: profile.configId } : {}),
          $and: historyAndConditions,
        })
        .sort({ last_updated_date_time: -1, createdAt: -1 })
        .lean();

      if (prevRecord && prevRecord.bid !== undefined && prevRecord.bid !== null && !isNaN(Number(prevRecord.bid))) {
        oldBid = Number(prevRecord.bid);
      } else if (targetDoc && (targetDoc.keywordBid !== undefined || targetDoc.bid !== undefined)) {
        const docBid = Number(targetDoc.keywordBid || targetDoc.bid);
        if (!isNaN(docBid)) {
          oldBid = docBid;
        }
      }
    }

    // 2. DEDUPLICATION:
    // If targetingHistory already has an entry for this target with the same new bid
    // (e.g. user just updated bid from our portal, or identical AMS event received),
    // DO NOT insert a duplicate entry in targetingHistory!
    if (newBid !== null && prevRecord && Number(prevRecord.bid) === Number(newBid)) {
      return true;
    }

    // Store directly at root level without any data wrapper or duplicate snake_case keys
    const {
      data: _unusedData,
      target_id: _unusedTargetId,
      campaign_id: _unusedCampaignId,
      ad_group_id: _unusedAdGroupId,
      currency_code: _unusedCurrencyCode,
      acos: _unusedAcos,
      oldAcos: _unusedOldAcos,
      ...cleanFields
    } = (typeof parsedData === "object" && parsedData !== null) ? parsedData : {};

    await new targetingHistorySchema({
      configId: profile?.configId,
      profileId: Number(profile?.profileId) || profile?.profileId,
      ...cleanFields,
      targetId: cleanTargetId,
      campaignId,
      adGroupId,
      adProduct,
      targetType,
      matchType,
      targeting: targetingText,
      state,
      bid: newBid !== null ? newBid : 0,
      oldBid: (oldBid !== null && !isNaN(oldBid)) ? oldBid : null,
      currencyCode,
      last_updated_date_time: lastUpdated,
      creation_date_time: parsedData?.creation_date_time || "",
      source: "Amazon Marketing Stream",
    }).save();
  } catch (historyErr) {
    ams_write_logs({
      message: `[updateTargetManagementData Save targetingHistory] ${historyErr?.message || historyErr}`,
      log_type: "error",
    });
  }

  return true;
}


exports.getCampaignBidThreshold = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, campaignId } = req.body;

    const bidThreshold = await campaignBidThresholdSchema
      .findOne({
        configId,
        profileId,
        campaignId,
      })
      .lean();

    return res.status(200).json({
      isSuccess: true,
      message: "Data fetch successfully",
      data: bidThreshold,
    });
  } catch (error) {
    write_logs({ message: `[getCampaignBidThreshold Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Something went wrong",
      error: "An internal server error occurred",
    });
  }
};

exports.saveCamapignBidThreshold = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, campaignId, minBid, maxBid, targetACOS } = req.body;

    await campaignBidThresholdSchema
      .findOneAndUpdate(
        {
          configId,
          profileId,
          campaignId,
        },
        {
          $set: {
            maxBid,
            minBid,
            targetACOS,
          },
        },
        { new: true, upsert: true },
      )
      .lean();

    const campaign = await campaignsSchema.findOne({
      configId,
      profileId,
      campaignId,
    });
    await logAudit(
      "CAMPAIGN_BID_THRESHOLD",
      `Campaign ${campaign?.name} bid threshold saved successfully.`,
      {
        ...(!campaign?.campaignName && { campaignId }),
        campaignName: campaign?.campaignName,
        minBid,
        maxBid,
        targetACOS,
      },
      req?.user?.id,
    );

    return res.status(200).json({
      isSuccess: true,
      message: "Data saved successfully",
    });
  } catch (error) {
    write_logs({ message: `[saveCamapignBidThreshold Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Something went wrong",
      error: "An internal server error occurred",
    });
  }
};

exports.removePausedCampaignFromRules = async () => {
  cron_logs({
    message: `India Time = ${moment()
      .tz("Asia/Kolkata")
      .format("HH:mm")} removePausedCampaignFromRules`,
    log_type: "info",
  });

  try {
    const getProfileId = await getActivePlanProfiles();
    const listPromises = getProfileId.map((profile) =>
      limit(async () => {
        const reportDate = moment.tz(profile.timezone).format("YYYY-MM-DD");

        const spCampaigns = await campaignsSchema
          .find({
            configId: profile.configId,
            profileId: profile.profileId,
            reportDate,
            status: { $in: ["PAUSED", "ARCHIVED"] },
          })
          .lean();

        const sbCampaigns = await sbCampaignsSchema
          .find({
            configId: profile.configId,
            profileId: profile.profileId,
            reportDate,
            status: { $in: ["PAUSED", "ARCHIVED"] },
          })
          .lean();

        const sdCampaigns = await sdCampaignsSchema
          .find({
            configId: profile.configId,
            profileId: profile.profileId,
            reportDate,
            status: { $in: ["PAUSED", "ARCHIVED"] },
          })
          .lean();

        if (
          spCampaigns.length > 0 ||
          sbCampaigns.length > 0 ||
          sdCampaigns.length > 0
        ) {
          const pausedSPCampaignIds = spCampaigns.map((cp) => cp.campaignId);
          const pausedSBCampaignIds = sbCampaigns.map((cp) => cp.campaignId);
          const pausedSDCampaignIds = sdCampaigns.map((cp) => cp.campaignId);

          const budgetRuleResult = await budgetRulesSchema.updateMany(
            {
              configId: profile.configId,
              profileId: profile.profileId,
            },
            {
              $pull: {
                "campaignIds.SP": { $in: pausedSPCampaignIds },
                "campaignIds.SB": { $in: pausedSBCampaignIds },
                "campaignIds.SD": { $in: pausedSDCampaignIds },
              },
            },
          );

          const targetingRuleResult = await targetingRuleSchema.updateMany(
            {
              configId: profile.configId,
              profileId: profile.profileId,
            },
            {
              $pull: {
                "campaignIds.SP": { $in: pausedSPCampaignIds },
                "campaignIds.SB": { $in: pausedSBCampaignIds },
                "campaignIds.SD": { $in: pausedSDCampaignIds },
              },
            },
          );

          const placementRuleResult = await placementRulesSchema.updateMany(
            {
              configId: profile.configId,
              profileId: profile.profileId,
            },
            {
              $pull: {
                "campaignIds.SP": { $in: pausedSPCampaignIds },
                "campaignIds.SB": { $in: pausedSBCampaignIds },
                "campaignIds.SD": { $in: pausedSDCampaignIds },
              },
            },
          );
        }

        const createCronHistory = new cronJobHistorySchema({
          configId: profile.configId,
          profileId: profile.profileId,
          cronName: "Rules Update",
          status: "COMPLETED",
          historyDate: reportDate,
        });
        await createCronHistory.save();
      }),
    );

    await Promise.all(listPromises);
    cron_logs({
      message: "Removed Paused Campaigns from rules successfully.",
      log_type: "info",
    });
  } catch (error) {
    cron_logs({
      message: `Removed Paused Campaigns from rules, Error: ${error}`,
      log_type: "error",
    });
  }
};

exports.getPLHistory = async (req, res) => {
  const configId = req?.config?.configId;

  try {
    let { profileId } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required." });
    }

    const pipeline = [
      { $match: { configId, profileId: Number(profileId) } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 1,
          profileId: 1,
          units: "$totalUnitsOrdered",
          revenue: "$totalOrderedProductSales",
          cogs: "$totalProductCosts",
          amazonFees: "$totalAmazonFees",
          shipping: "$totalAmazonExp",
          itemFees: "$itemFees",
          adSpend: "$totalAdvertisingSpend",
          netPL: "$netProfit",
          profitPercent: "$profitPercentage",
          tcos: "$tcos",
          createdAt: 1,
        },
      },
    ];

    const result = await profitLossHistorySchema.aggregate(pipeline);
    const history = result || [];

    return res.status(200).send({
      isSuccess: true,
      message: "P/L History fetched successfully",
      data: history,
    });
  } catch (error) {
    write_logs({ message: `[getPLHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.savePLHistory = async (req, res) => {
  const configId = req?.config?.configId;
  try {
    let {
      profileId,
      units,
      revenue,
      cogs,
      amazonFees,
      shipping,
      itemFees,
      adSpend,
      netPL,
      profitPercent,
      tcos,
    } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required." });
    }

    const newItem = new profitLossHistorySchema({
      configId,
      profileId,
      totalUnitsOrdered: units,
      totalOrderedProductSales: revenue,
      totalProductCosts: cogs,
      totalAmazonFees: amazonFees,
      totalAmazonExp: shipping,
      itemFees,
      totalAdvertisingSpend: adSpend,
      netProfit: netPL,
      profitPercentage: profitPercent,
      tcos,
    });
    await newItem.save();

    return res.status(200).send({
      isSuccess: true,
      message: "History Saved Successfully!",
    });
  } catch (error) {
    write_logs({ message: `[savePLHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.removePLHistory = async (req, res) => {
  const configId = req?.config?.configId;

  try {
    const { profileId, ids } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required." });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "History ids required." });
    }

    const result = await profitLossHistorySchema.deleteMany({
      _id: { $in: ids },
      configId,
      profileId: Number(profileId),
    });

    return res.status(200).send({
      isSuccess: true,
      message: "History removed successfully!",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    write_logs({ message: `[removePLHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.cronMaxBidSetting = async () => {
  cron_logs({
    message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronMaxBidSetting`,
    log_type: "info",
  });

  try {
    const profiles = await profileSchema.find({ isActive: true }).lean();
    await Promise.all(
      profiles.map((profile) =>
        limit(async () => {
          const reportDate = moment.tz(profile.timezone).format("YYYY-MM-DD");

          const pipeline = [
            {
              $match: {
                configId: profile?.configId,
                profileId: profile?.profileId,
                status: "ENABLED",
                reportDate,
              },
            },
            {
              $lookup: {
                from: "product_ads",
                let: { campaignId: "$campaignId" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$campaignId", "$$campaignId"] },
                          { $eq: ["$profileId", profile?.profileId] },
                          { $eq: ["$configId", profile?.configId] },
                          { $eq: ["$reportDate", reportDate] },
                        ],
                      },
                    },
                  },
                  { $match: { asins: { $ne: null } } },
                  { $project: { asins: 1 } },
                ],
                as: "productAds",
              },
            },
            { $unwind: "$productAds" },
            {
              $lookup: {
                from: "products",
                let: { asin: "$productAds.asins" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$asin", "$$asin"] },
                          { $eq: ["$profileId", profile?.profileId] },
                          { $eq: ["$configId", profile?.configId] },
                          { $eq: ["$reportDate", reportDate] },
                          { $gt: ["$amount", 0] },
                        ],
                      },
                    },
                  },
                  { $sort: { amount: 1 } },
                  { $limit: 1 },
                ],
                as: "products",
              },
            },
            { $unwind: "$products" },
            {
              $group: {
                _id: "$campaignId",
                name: { $first: "$name" },
                lowestProduct: {
                  $first: {
                    asin: "$products.asin",
                    amount: "$products.amount",
                  },
                },
                minPrice: { $min: "$products.amount" },
              },
            },
            {
              $project: {
                campaignId: "$_id",
                name: 1,
                asin: "$lowestProduct.asin",
                productPrice: "$minPrice",
                _id: 0,
              },
            },
          ];

          const campaignData = await campaignsSchema.aggregate(pipeline);

          if (!campaignData.length) {
            return;
          }

          const defaultSetting = await camapignSetting
            .findOne({
              configId: profile.configId,
              profileId: profile.profileId,
            })
            .lean();
          const thresholds = await campaignBidThresholdSchema
            .find({ configId: profile.configId, profileId: profile.profileId })
            .lean();

          const thresholdMap = new Map();
          thresholds.forEach((t) => {
            thresholdMap.set(t.campaignId, t);
          });

          const users = await profileBasedPermissionModel
            ?.findOne({
              profileId: profile.profileId,
              configId: profile.configId,
              hasAccess: true,
            })
            .sort({ createdAt: 1 })
            .lean();

          const bulkOps = [];

          await Promise.all(
            campaignData.map(async (row) => {
              const threshold = thresholdMap.get(row?.campaignId);
              const targetACOS =
                threshold?.targetACOS ||
                defaultSetting?.bidLimitTargetACOS ||
                0;

              if (!targetACOS) return;

              const maxBid = Number(
                (row.productPrice * (targetACOS / 100)).toFixed(2),
              );

              await logAudit(
                "CAMPAIGN_BID_THRESHOLD",
                `Campaign ${row?.name} bid threshold saved successfully.`,
                {
                  ...(!row?.name && { campaignId: row?.campaignId }),
                  campaignName: row?.name,
                  maxBid,
                  targetACOS,
                },
                users?.userId || req?.user?.id,
              );

              bulkOps.push({
                updateOne: {
                  filter: {
                    configId: profile.configId,
                    profileId: profile.profileId,
                    campaignId: row.campaignId,
                  },
                  update: { $set: { maxBid, targetACOS } },
                  upsert: true,
                },
              });
            }),
          );

          if (bulkOps.length) {
            await campaignBidThresholdSchema.bulkWrite(bulkOps);
          }

          const createCronHistory = new cronJobHistorySchema({
            configId: profile.configId,
            profileId: profile.profileId,
            cronName: "Max Bid Setting",
            status: "COMPLETED",
            historyDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
          });
          await createCronHistory.save();
        }),
      ),
    );

    cron_logs({
      message: "cronMaxBidSetting completed successfully",
      log_type: "info",
    });
  } catch (error) {
    cron_logs({
      message: `cronMaxBidSetting error: ${error.message}`,
      log_type: "error",
    });
  }
};

exports.calculateCampaignMaxBid = async (req, res) => {
  const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
  try {
    const { profileId, campaignId, targetACOS } = req.body;
    const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
    const reportDate = moment.tz(profile.timezone).format("YYYY-MM-DD");

    const pipeline = [
      {
        $match: {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId,
          reportDate,
        },
      },
      {
        $lookup: {
          from: "product_ads",
          let: { campaignId: "$campaignId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$campaignId", "$$campaignId"] },
                    { $eq: ["$profileId", profile?.profileId] },
                    { $eq: ["$configId", profile?.configId] },
                    { $eq: ["$reportDate", reportDate] },
                  ],
                },
              },
            },
            { $match: { asins: { $ne: null } } },
            { $project: { asins: 1 } },
          ],
          as: "productAds",
        },
      },
      { $unwind: "$productAds" },
      {
        $lookup: {
          from: "products",
          let: { asin: "$productAds.asins" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$asin", "$$asin"] },
                    { $eq: ["$profileId", profile?.profileId] },
                    { $eq: ["$configId", profile?.configId] },
                    { $eq: ["$reportDate", reportDate] },
                    { $gt: ["$amount", 0] },
                  ],
                },
              },
            },
            { $sort: { amount: 1 } },
            { $limit: 1 },
          ],
          as: "products",
        },
      },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$campaignId",
          name: { $first: "$name" },
          lowestProduct: {
            $first: { asin: "$products.asin", amount: "$products.amount" },
          },
          minPrice: { $min: "$products.amount" },
        },
      },
      {
        $project: {
          campaignId: "$_id",
          name: 1,
          asin: "$lowestProduct.asin",
          productPrice: "$minPrice",
          _id: 0,
        },
      },
    ];

    const campaignData = await campaignsSchema.aggregate(pipeline);
    if (!campaignData.length) {
      return res.status(200).send({
        isSuccess: false,
        message: `No product ads found.`,
      });
    }

    const campaign = campaignData[0];
    const maxBid = Number(
      (campaign.productPrice * (targetACOS / 100)).toFixed(2),
    );

    return res.status(200).send({
      isSuccess: true,
      message: `Max bid updated successfully.`,
      maxBid: maxBid,
    });
  } catch (error) {
    write_logs({ message: `[calculateCampaignMaxBid Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: `Something went wrong while updating campaign status, please try again!`,
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.addTargetings = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { items = [], profileId } = req.body;
    // {
    //   searchTerm: "test",
    //   campaignId: 123,
    //   adGroupId: 123,
    //   suggestedBid: 12,
    //   type: "EXACT" | "PHASE" | "BROAD"
    // }

    const profile = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    if (!items.length) {
      return res
        .status(400)
        .json({ isSuccess: false, message: "No items provided" });
    }

    const results = [];

    for (const item of items) {
      let response = await AddToTargeting(
        item?.campaignType,
        item,
        profile,
        checkConfigAds,
        [item?.type],
      );
      results.push({
        _id: item._id,
        ...response,
      });

      const campaign = await campaignsSchema.findOne({
        campaignId: item?.campaignId,
      });
      const adGroup = await adGroupsSchema.findOne({
        adGroupId: item?.adGroupId,
      });

      await logAudit(
        "SEARCH_TERM_ADD_AS_KEYWORD",
        `Search term added as keyword successfully.`,
        {
          campaignName: campaign?.name,
          adGroupName: adGroup?.name,
          ...item,
          ...response,
        },
        req?.user?.id,
      );
    }

    return res.status(200).send({
      isSuccess: true,
      message: `Keywords added successfully.`,
      results,
    });
  } catch (error) {
    write_logs({ message: `[addTargetings Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: `Something went wrong while adding targetings, please try again!`,
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.addNegativeTargetings = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { items = [], profileId } = req.body;
    // {
    //   searchTerm: "test",
    //   campaignId: 123,
    //   adGroupId: 123,
    //   type: "NEGATIVE_EXACT" | "NEGATIVE_PHRASE"
    // }

    const profile = await getProfile(configId, profileId);
    const checkConfigAds = await getAccessToken(configId);

    if (!items.length) {
      return res
        .status(400)
        .json({ isSuccess: false, message: "No items provided" });
    }

    const results = [];

    for (const item of items) {
      let response = await AddToNegativeTargeting(
        item?.campaignType,
        item,
        profile,
        checkConfigAds,
        [item?.type],
      );
      results.push({
        _id: item._id,
        ...response,
      });

      const campaign = await campaignsSchema.findOne({
        campaignId: item?.campaignId,
      });
      const adGroup = await adGroupsSchema.findOne({
        adGroupId: item?.adGroupId,
      });

      await logAudit(
        "SEARCH_TERM_ADD_AS_NEGATIVE_KEYWORD",
        `Search term added as negative keyword successfully.`,
        {
          campaignName: campaign?.name,
          adGroupName: adGroup?.name,
          ...item,
          ...response,
        },
        req?.user?.id,
      );
    }

    return res.status(200).send({
      isSuccess: true,
      message: `Negative keywords added successfully.`,
      results,
    });
  } catch (error) {
    write_logs({ message: `[addNegativeTargetings Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: `Something went wrong while adding negative targetings, please try again!`,
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};


const getOutOfBudgetAggregationCondition = () => ({
  $or: [
    { $eq: ["$campaign.campaignStatus", "OUT_OF_BUDGET"] },
    { $eq: ["$campaign.campaignStatus", "out_of_budget"] },
    { $eq: ["$campaign.status", "OUT_OF_BUDGET"] },
    { $eq: ["$campaign.status", "out_of_budget"] },
    { $eq: ["$latestStatus.status", "OUT_OF_BUDGET"] },
    { $eq: ["$latestStatus.status", "out_of_budget"] },
    {
      $gte: [
        { $ifNull: ["$latestStatus.budgetTracking.lastUsagePercentage", { $ifNull: ["$campaign.budgetTracking.lastUsagePercentage", 0] }] },
        100,
      ],
    },
    {
      $and: [
        { $gt: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0] },
        {
          $gte: [
            { $ifNull: ["$latestStatus.budgetTracking.estimatedSpend", { $ifNull: ["$campaign.budgetTracking.estimatedSpend", 0] }] },
            { $ifNull: ["$latestStatus.budget", "$campaign.budget"] },
          ],
        },
      ],
    },
    {
      $and: [
        { $gt: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0] },
        {
          $gte: [
            { $ifNull: ["$latestStatus.dailySpend", { $ifNull: ["$campaign.dailySpend", 0] }] },
            { $ifNull: ["$latestStatus.budget", "$campaign.budget"] },
          ],
        },
      ],
    },
    {
      $and: [
        { $gt: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0] },
        { $gte: ["$campaign.spend", { $ifNull: ["$latestStatus.budget", "$campaign.budget"] }] },
      ],
    },
    {
      $and: [
        { $gt: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0] },
        { $gte: ["$spend", { $ifNull: ["$latestStatus.budget", "$campaign.budget"] }] },
      ],
    },
    {
      $and: [
        { $gt: [{ $ifNull: ["$latestStatus.timeInBudget", { $ifNull: ["$campaign.timeInBudget", 0] }] }, 0] },
        { $lt: [{ $ifNull: ["$latestStatus.timeInBudget", { $ifNull: ["$campaign.timeInBudget", 100] }] }, 100] },
        { $gt: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0] },
        {
          $or: [
            { $gte: ["$campaign.spend", { $multiply: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0.8] }] },
            { $gte: ["$spend", { $multiply: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0.8] }] },
            { $gte: [{ $ifNull: ["$latestStatus.budgetTracking.estimatedSpend", 0] }, { $multiply: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0.8] }] },
            { $gte: [{ $ifNull: ["$latestStatus.dailySpend", 0] }, { $multiply: [{ $ifNull: ["$latestStatus.budget", "$campaign.budget"] }, 0.8] }] },
          ],
        },
      ],
    },
  ],
});

exports.campaignPipeline = (query, toDate, type = "SP") => {
  const matchStage = {
    $match: query,
  };

  const commonPipeline = [
    matchStage,
    {
      $sort: {
        reportDate: -1,
      },
    },
    {
      $lookup: {
        from: AD_TYPE_COLLECTIONS?.[type]?.["campaign"],
        let: {
          campaignId: "$campaignId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$campaignId", "$$campaignId"],
                  },
                ],
              },
            },
          },
          {
            $sort: {
              updatedAt: -1,
            },
          },
          // Get latest before date
          {
            $limit: 1,
          },
        ],
        as: "latestStatus",
      },
    },
    {
      $unwind: "$latestStatus",
    },
    {
      $addFields: {
        campaignStatus: "$latestStatus.status",
      },
    },
    {
      $match: {
        campaignStatus: { $nin: ["ARCHIVED", "archived"] },
        reportDate: {
          $lte: toDate,
        },
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
        totalBudget: {
          $sum: "$budget",
        },
        spend: {
          $sum: "$spend",
        },
        sales: {
          $sum: "$sales",
        },
        impressions: {
          $sum: "$impressions",
        },
        clicks: {
          $sum: "$clicks",
        },
        orders: {
          $sum: "$orders",
        },
        timeInBudget: {
          $first: "$timeInBudget",
        },
        configId: {
          $first: "configId",
        },
        profileId: {
          $first: "profileId",
        },
      },
    },
    {
      $project: {
        _id: 0,
        budgetType: "$campaign.budgetType",
        startDate: "$campaign.startDate",
        endDate: "$campaign.endDate",
        daysSinceCreation: {
          $cond: [
            {
              $and: [
                { $ne: ["$campaign.startDate", null] },
                { $ne: ["$campaign.startDate", ""] },
              ],
            },
            {
              $floor: {
                $divide: [
                  {
                    $subtract: [
                      { $toDate: toDate },
                      { $toDate: "$campaign.startDate" },
                    ],
                  },
                  86400000,
                ],
              },
            },
            0,
          ],
        },
        type: "$campaign.type",
        configId: "$campaign.configId",
        profileId: "$campaign.profileId",
        campaignId: "$_id.campaignId",
        targetingType: "$campaign.targetingType",
        costType: "$campaign.costType",
        clicks: 1,
        name: "$campaign.name",
        status: {
          $cond: [
            getOutOfBudgetAggregationCondition(),
            "OUT_OF_BUDGET",
            "$campaign.campaignStatus",
          ],
        },
        isOutOfBudget: {
          $cond: [
            getOutOfBudgetAggregationCondition(),
            true,
            false,
          ],
        },
        budget: { $ifNull: ["$latestStatus.budget", "$campaign.budget"] },
        todayBudget: { $ifNull: ["$latestStatus.budget", "$campaign.budget"] },
        todaySpend: "$campaign.spend",
        totalBudget: 1,
        timeInBudget: 1,
        cpc: {
          $round: [
            {
              $cond: {
                if: { $gt: ["$clicks", 0] },
                then: { $divide: ["$spend", "$clicks"] },
                else: 0,
              },
            },
            2,
          ],
        },
        ctr: {
          $round: [
            {
              $cond: {
                if: { $gt: ["$impressions", 0] },
                then: { $divide: ["$clicks", "$impressions"] },
                else: 0,
              },
            },
            2,
          ],
        },
        conversionRate: {
          $cond: [
            { $gt: ["$clicks", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] },
                2,
              ],
            },
            0,
          ],
        },
        impressions: 1,
        orders: 1,
        sales: { $round: ["$sales", 2] },
        spend: { $round: ["$spend", 2] },
        acos: {
          $round: [
            {
              $cond: {
                if: {
                  $gt: ["$sales", 0],
                },
                then: {
                  $multiply: [
                    {
                      $divide: ["$spend", "$sales"],
                    },
                    100,
                  ],
                },
                else: 0,
              },
            },
            2,
          ],
        },
        roas: {
          $round: [
            {
              $cond: {
                if: {
                  $gt: ["$spend", 0],
                },
                then: {
                  $divide: ["$sales", "$spend"],
                },
                else: 9999,
              },
            },
            2,
          ],
        },
      },
    },
    {
      $sort: { acos: -1, updatedAt: -1 },
    },
    // { $match: { roas: { $ne: 9999 } } }
  ];

  return commonPipeline;
};

exports.sbCampaignPipeline = (query, toDate) => {
  const matchStage = {
    $match: query,
  };

  const commonPipeline = [
    matchStage,
    {
      $sort: {
        reportDate: -1,
      },
    },
    {
      $lookup: {
        from: "sbcampaigns",
        let: {
          campaignId: "$campaignId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$campaignId", "$$campaignId"],
                  },
                ],
              },
            },
          },
          {
            $sort: {
              updatedAt: -1,
            },
          },
          {
            $limit: 1,
          },
        ],
        as: "latestStatus",
      },
    },
    {
      $unwind: "$latestStatus",
    },
    {
      $addFields: {
        campaignStatus: "$latestStatus.status",
      },
    },
    {
      $match: {
        reportDate: {
          $lte: toDate,
        },
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
        spend: {
          $sum: "$spend",
        },
        sales: {
          $sum: "$sales",
        },
        impressions: {
          $sum: "$impressions",
        },
        clicks: {
          $sum: "$clicks",
        },
        orders: {
          $sum: "$orders",
        },
        configId: {
          $first: "configId",
        },
        profileId: {
          $first: "profileId",
        },
      },
    },
    {
      $project: {
        _id: 0,
        budgetType: "$campaign.budgetType",
        startDate: "$campaign.startDate",
        endDate: "$campaign.endDate",
        type: "$campaign.type",
        configId: "$campaign.configId",
        profileId: "$campaign.profileId",
        campaignId: "$_id.campaignId",
        costType: "$campaign.costType",
        clicks: 1,
        name: "$campaign.name",
        status: {
          $cond: [
            getOutOfBudgetAggregationCondition(),
            "OUT_OF_BUDGET",
            "$campaign.campaignStatus",
          ],
        },
        isOutOfBudget: {
          $cond: [
            getOutOfBudgetAggregationCondition(),
            true,
            false,
          ],
        },
        budget: { $ifNull: ["$latestStatus.budget", "$campaign.budget"] },
        todayBudget: { $ifNull: ["$latestStatus.budget", "$campaign.budget"] },
        todaySpend: "$spend",
        cpc: {
          $round: [
            {
              $cond: {
                if: { $gt: ["$clicks", 0] },
                then: { $divide: ["$spend", "$clicks"] },
                else: 0,
              },
            },
            2,
          ],
        },
        ctr: {
          $round: [
            {
              $cond: {
                if: { $gt: ["$impressions", 0] },
                then: { $divide: ["$clicks", "$impressions"] },
                else: 0,
              },
            },
            2,
          ],
        },
        conversionRate: {
          $cond: [
            { $gt: ["$clicks", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] },
                2,
              ],
            },
            0,
          ],
        },
        impressions: 1,
        orders: 1,
        sales: { $round: ["$sales", 2] },
        spend: { $round: ["$spend", 2] },
        acos: {
          $round: [
            {
              $cond: {
                if: {
                  $gt: ["$sales", 0],
                },
                then: {
                  $multiply: [
                    {
                      $divide: ["$spend", "$sales"],
                    },
                    100,
                  ],
                },
                else: 0,
              },
            },
            2,
          ],
        },
        roas: {
          $round: [
            {
              $cond: {
                if: {
                  $gt: ["$spend", 0],
                },
                then: {
                  $divide: ["$sales", "$spend"],
                },
                else: 0,
              },
            },
            2,
          ],
        },
      },
    },
    {
      $sort: { acos: -1, updatedAt: -1 },
    },
  ];

  return commonPipeline;
};

exports.sdCampaignPipeline = (query, toDate) => {
  const matchStage = {
    $match: query,
  };

  const commonPipeline = [
    matchStage,
    {
      $sort: {
        reportDate: -1,
      },
    },
    {
      $lookup: {
        from: "sdcampaigns",
        let: {
          campaignId: "$campaignId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$campaignId", "$$campaignId"],
                  },
                ],
              },
            },
          },
          {
            $sort: {
              updatedAt: -1,
            },
          },
          {
            $limit: 1,
          },
        ],
        as: "latestStatus",
      },
    },
    {
      $unwind: "$latestStatus",
    },
    {
      $addFields: {
        campaignStatus: "$latestStatus.status",
      },
    },
    {
      $match: {
        reportDate: {
          $lte: toDate,
        },
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
        spend: {
          $sum: "$spend",
        },
        sales: {
          $sum: "$sales",
        },
        impressions: {
          $sum: "$impressions",
        },
        clicks: {
          $sum: "$clicks",
        },
        orders: {
          $sum: "$orders",
        },
        configId: {
          $first: "configId",
        },
        profileId: {
          $first: "profileId",
        },
      },
    },
    {
      $project: {
        _id: 0,
        budgetType: "$campaign.budgetType",
        startDate: "$campaign.startDate",
        endDate: "$campaign.endDate",
        type: "$campaign.type",
        configId: "$campaign.configId",
        profileId: "$campaign.profileId",
        campaignId: "$_id.campaignId",
        costType: "$campaign.costType",
        clicks: 1,
        name: "$campaign.name",
        status: {
          $cond: [
            getOutOfBudgetAggregationCondition(),
            "OUT_OF_BUDGET",
            "$campaign.campaignStatus",
          ],
        },
        isOutOfBudget: {
          $cond: [
            getOutOfBudgetAggregationCondition(),
            true,
            false,
          ],
        },
        budget: { $ifNull: ["$latestStatus.budget", "$campaign.budget"] },
        todayBudget: { $ifNull: ["$latestStatus.budget", "$campaign.budget"] },
        todaySpend: "$spend",
        cpc: {
          $round: [
            {
              $cond: {
                if: { $gt: ["$clicks", 0] },
                then: { $divide: ["$spend", "$clicks"] },
                else: 0,
              },
            },
            2,
          ],
        },
        ctr: {
          $round: [
            {
              $cond: {
                if: { $gt: ["$impressions", 0] },
                then: { $divide: ["$clicks", "$impressions"] },
                else: 0,
              },
            },
            2,
          ],
        },
        conversionRate: {
          $cond: [
            { $gt: ["$clicks", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] },
                2,
              ],
            },
            0,
          ],
        },
        impressions: 1,
        orders: 1,
        sales: { $round: ["$sales", 2] },
        spend: { $round: ["$spend", 2] },
        acos: {
          $round: [
            {
              $cond: {
                if: {
                  $gt: ["$sales", 0],
                },
                then: {
                  $multiply: [
                    {
                      $divide: ["$spend", "$sales"],
                    },
                    100,
                  ],
                },
                else: 0,
              },
            },
            2,
          ],
        },
        roas: {
          $round: [
            {
              $cond: {
                if: {
                  $gt: ["$spend", 0],
                },
                then: {
                  $divide: ["$sales", "$spend"],
                },
                else: 0,
              },
            },
            2,
          ],
        },
      },
    },
    {
      $sort: { acos: -1, updatedAt: -1 },
    },
  ];

  return commonPipeline;
};

exports.cronCampaignHealthCheck = async (req, res) => {
  cron_logs({
    message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronCampaignHealthCheck`,
    log_type: "info",
  });

  try {
    const profiles = await profileSchema.find({ isActive: true }).lean();
    await Promise.all(
      profiles.map((profile) =>
        limit(async () => {
          const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");

          let query = {
            configId: profile.configId,
            profileId: profile.profileId,
          };

          let { fromDate, toDate } = getRuleDate(
            profile.timezone,
            "LAST_7_DAYS",
          );
          if (fromDate) {
            query.reportDate = {
              $gte: fromDate,
            };
          }

          const pipeline = await this.campaignPipeline(query, toDate);
          pipeline.push({ $match: { status: "ENABLED" } });
          const campaignData = await campaignsSchema.aggregate(pipeline);

          if (!campaignData.length) {
            return;
          }

          const cpSetting = await camapignSetting
            .findOne({ profileId: profile.profileId })
            .lean();
          const bulkOps = [];

          const healthScore = await healthScoreSettingSchema
            .find({
              configId: profile.configId,
              profileId: profile.profileId,
            })
            .lean();

          const page = await pageSchema
            .findOne({ pageName: "Campaign Setting" })
            .lean();
          const filtes = await filterSchema.find({ pageId: page._id }).lean();

          const healthScoreRules = healthScore.map((hs) => ({
            score: hs.scoreName,
            criteria: addHealthScoreSettingQuery(
              hs.conditions,
              filtes,
              cpSetting,
            ),
          }));

          campaignData.forEach((campaign) => {
            let matchedRule = healthScoreRules.find((rule) =>
              sift(rule.criteria)(campaign),
            );

            const score = matchedRule ? matchedRule.score : null;
            if (score) {
              bulkOps.push({
                updateOne: {
                  filter: {
                    configId: profile.configId,
                    profileId: profile.profileId,
                    reportDate: currentDate,
                    campaignId: campaign.campaignId,
                  },
                  update: {
                    $set: { healthScore: score },
                  },
                  upsert: true,
                },
              });
            }
          });

          if (bulkOps.length) {
            await campaignsSchema.bulkWrite(bulkOps);
          }

          const createCronHistory = new cronJobHistorySchema({
            configId: profile.configId,
            profileId: profile.profileId,
            cronName: "Campaign Health Check",
            status: "COMPLETED",
            historyDate: currentDate,
          });
          await createCronHistory.save();
        }),
      ),
    );

    cron_logs({
      message: "Campaign Health Check completed successfully",
      log_type: "info",
    });
  } catch (error) {
    cron_logs({
      message: `campaignHealthCheck error: ${error.message}`,
      log_type: "error",
    });
  }
};

exports.cronMonitorSQSMessageCount = async () => {
  cron_logs({
    message: "cronMonitorSQSMessageCount",
    log_type: "info",
  });

  try {
    const REGION_CONFIGS = Object.values(ARN_MAP).filter(
      (r) => r?.sqsQueueUrl && r?.regionName,
    );

    await Promise.all(
      REGION_CONFIGS.map(async (config) => {
        const sqsClient = new SQSClient({
          region: config.regionName,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        });

        const command = new GetQueueAttributesCommand({
          QueueUrl: config.sqsQueueUrl,
          AttributeNames: [
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
            "ApproximateNumberOfMessagesDelayed",
          ],
        });

        const response = await sqsClient.send(command);

        const visible = Number(response.Attributes.ApproximateNumberOfMessages);
        const inFlight = Number(
          response.Attributes.ApproximateNumberOfMessagesNotVisible,
        );
        const delayed = Number(
          response.Attributes.ApproximateNumberOfMessagesDelayed,
        );
        const total = visible + inFlight + delayed;

        if (total > 10000) {
          await sendEmailHelper(
            process.env.RECEIVER_EMAIL,
            "Alert: SQS Queue Pending Message Count",
            buildSqsQueueAlertEmail({
              queueName: config.regionName,
              visibleCount: visible,
              inFlightCount: inFlight,
              delayedCount: delayed,
              totalCount: total,
            }),
          );
        }

        return true;
      }),
    );

    cron_logs({
      message: `Monitor SQS Message Count successfully.`,
      log_type: "info",
    });
  } catch (error) {
    cron_logs({
      message: `cronMonitorSQSMessageCount error: ${error.message}`,
      log_type: "error",
    });
  }
};

exports.processReportFileStream = processReportFileStream;
exports.spGenerateReport = spGenerateReport;
exports.incrementCampaignTotals = incrementCampaignTotals;
