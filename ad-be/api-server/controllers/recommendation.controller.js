const { sanitizeQueryObject } = require("../helper/sanitizeQuery");
const moment = require("moment");
const { default: mongoose } = require("mongoose");
const crypto = require("crypto");

const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));
const ExcelJS = require("exceljs");
const path = require("path");

const cronJobHistorySchema = require("../models/cronJobHistory.model");

const profileSchema = require("../models/profiles.model");
const campaignSchema = require("../models/campaign.model");
const targetingSchema = require("../models/targeting.model");
const searchTermSchema = require("../models/searchTerm.model");
const recommendationSnapshotSchema = require("../models/recommendation.model");
const recommendationRuleSchema = require("../models/recomandationRules.model");
const recommandationStatusSchema = require("../models/recommandationStatus.model");
const recommandationCampaignByRuleSchema = require("../models/recommandationCampaignByRule.model");
const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const amazonAxios = require("../helper/amazonAxios");
const { retryWithBackoff } = require("../helper/retryHelper");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { recommendation_logs } = require("../../winston/recommendation/logger");

const { getProfile, getAccessToken, getActivePlanProfiles, getRuleDate, getRuleSettings, getMarketplaceMinBid, removeCampaignIdFromQuery, safeJsonParse, isValidASIN } = require("../helper/common");
const {
    AddToTargeting,
    UpdateTargetingBid,
    UpdateTargetingStatus,
    AddToNegativeTargeting,
    UpdateCampaignBudget
} = require("../helper/recommendation");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { CampaignSPBudget, CampaignSBBudget, CampaignSDBudget, CampaignSPStatus, CampaignSBStatus, CampaignSDStatus, PlacementSPBid, PlacementSBBid, TargetingSPBid, TargetingSBBid, TargetingSDBid, TargetingSPStatus, TargetingSBStatus, TargetingSDStatus, AddToSPTargeting, AddToSBTargeting, AddToSDTargeting, AddToSPNegativeTargeting, AddToSBNegativeTargeting, AddToSDNegativeTargeting, SaveSearchTermRecord } = require("../services/recommandation.services");
const { logAudit, logAuditBatch } = require("../helpers/auditHelper");
const { checkDuplicateRecommandationRule } = require("../helper/ruleChecker");
// =========================
// 📊 COLUMN CONFIG
// =========================
const RECOMMENDATION_COLUMNS = {
    GOOD_SEARCH_TERMS: ["_id", "campaignId", "campaignName", "adGroupId", "adGroupName", "searchTerm", "clicks", "orders", "sales", "spend", "acos", "cvr", "action"],
    HIGH_ACOS_TERMS: ["_id", "campaignId", "campaignName", "adGroupId", "adGroupName", "targeting", "targetId", "clicks", "sales", "spend", "acos", "keywordBid", "suggestedBid", "action"],
    ZERO_SALES_KEYWORDS: ["_id", "campaignId", "campaignName", "adGroupId", "adGroupName", "targeting", "targetId", "clicks", "spend", "sales", "action"],
    UNIQUE_ZERO_SALE_WORDS: ["_id", "campaignId", "campaignName", "adGroupId", "adGroupName", "searchTerm", "clicks", "sales", "action"],
    GOOD_WORDS_NO_TARGET: ["_id", "campaignId", "campaignName", "adGroupId", "adGroupName", "searchTerm", "orders", "sales", "acos", "action"],
    ZERO_SALES_SEARCH_TERMS: ["_id", "campaignId", "campaignName", "adGroupId", "adGroupName", "searchTerm", "clicks", "sales", "action"],
    HIGH_ACOS_CAMPAIGNS: ["_id", "campaignId", "campaignName", "spend", "sales", "acos", "budget", "suggestedBudget", "action"],
    GROWTH_CAMPAIGNS: ["_id", "campaignId", "campaignName", "spend", "sales", "acos", "budget", "suggestedBudget", "action"],
    SMART_RECOMMENDATIONS: ["_id", "campaignId", "campaignName", "clicks", "sales", "ctr", "cvr", "pattern", "suggestion", "action"]
};

const RECOMMENDATION_TYPES = [
    "GOOD_SEARCH_TERMS",
    "HIGH_ACOS_TERMS",
    "ZERO_SALES_KEYWORDS",
    "UNIQUE_ZERO_SALE_WORDS",
    "GOOD_WORDS_NO_TARGET",
    "ZERO_SALES_SEARCH_TERMS",
    "HIGH_ACOS_CAMPAIGNS",
    "GROWTH_CAMPAIGNS",
    // "SMART_RECOMMENDATIONS"
];

const buildPipeline = (type, campaignType, configId, profileId, fromDate, toDate) => {
    let pipeline = [];
    let model = null;

    const { campaignSchema, searchTermSchema, targetingSchema } = AD_TYPE_COLLECTIONS?.[`${campaignType}Model`];
    const { campaign, adGroup } = AD_TYPE_COLLECTIONS?.[campaignType];

    switch (type) {

        case "GOOD_SEARCH_TERMS":
            model = searchTermSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                {
                    $group: {
                        _id: "$searchTerm",
                        campaignId: { $first: "$campaignId" },
                        campaignName: { $first: "$campaignName" },
                        adGroupId: { $first: "$adGroupId" },
                        adGroupName: { $first: "$adGroupName" },
                        clicks: { $sum: "$clicks" },
                        spend: { $sum: "$spend" },
                        sales: { $sum: "$sales" },
                        orders: { $sum: "$orders" }
                    }
                },
                {
                    $addFields: {
                        acos: { $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] },
                        cvr: { $cond: [{ $gt: ["$clicks", 0] }, { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 0] }
                    }
                },
                { $match: { orders: { $gt: 2 }, acos: { $lt: 40 }, cvr: { $gt: 10 } } },
                {
                    $project: {
                        _id: "$_id",
                        searchTerm: "$_id",
                        campaignName: 1,
                        campaignId: 1,
                        adGroupName: 1,
                        adGroupId: 1,
                        clicks: 1,
                        orders: 1,
                        sales: 1,
                        spend: 1,
                        acos: 1,
                        cvr: 1,
                        action: { $literal: "Add Exact" }
                    }
                }
            ];
            break;

        case "HIGH_ACOS_TERMS":
            model = targetingSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                { $sort: { reportDate: -1 } },
                {
                    $group: {
                        _id: "$targetId",
                        campaignId: { $first: "$campaignId" },
                        adGroupId: { $first: "$adGroupId" },
                        targeting: { $first: "$targeting" },
                        keywordBid: { $first: "$keywordBid" },
                        status: { $first: "$status" },
                        clicks: { $sum: "$clicks" },
                        spend: { $sum: "$spend" },
                        sales: { $sum: "$sales" }
                    }
                },
                {
                    $lookup: {
                        from: campaign,
                        let: { campaignId: "$campaignId" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$campaignId", "$$campaignId"] } } },
                            { $sort: { reportDate: -1 } },
                            { $limit: 1 },
                            { $project: { name: 1, campaignId: 1 } }
                        ],
                        as: "campaignData"
                    }
                },
                { $unwind: { path: "$campaignData", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: adGroup,
                        let: { adGroupId: "$adGroupId" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$adGroupId", "$$adGroupId"] } } },
                            { $sort: { reportDate: -1 } },
                            { $limit: 1 },
                            { $project: { name: 1, adGroupId: 1 } }
                        ],
                        as: "adGroupData"
                    }
                },
                { $unwind: { path: "$adGroupData", preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        acos: { $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] },
                        suggestedBid: { $max: [{ $round: [{ $multiply: ["$keywordBid", 0.75] }, 2] }, 1] }
                    }
                },
                { $match: { clicks: { $gt: 10 }, acos: { $gt: 50 }, status: "ENABLED" } },
                {
                    $project: {
                        _id: "$_id",
                        targetId: "$_id",
                        targeting: 1,
                        campaignId: 1,
                        campaignName: "$campaignData.name",
                        adGroupId: 1,
                        adGroupName: "$adGroupData.name",
                        clicks: 1,
                        spend: 1,
                        sales: 1,
                        acos: 1,
                        keywordBid: 1,
                        suggestedBid: 1,
                        action: { $literal: "Reduce 25% Bid" }
                    }
                }
            ];
            break;

        case "ZERO_SALES_KEYWORDS":
            model = targetingSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                { $sort: { reportDate: -1 } },
                {
                    $group: {
                        _id: "$targetId",
                        campaignId: { $first: "$campaignId" },
                        adGroupId: { $first: "$adGroupId" },
                        targeting: { $first: "$targeting" },
                        keywordBid: { $first: "$keywordBid" },
                        status: { $first: "$status" },
                        clicks: { $sum: "$clicks" },
                        spend: { $sum: "$spend" },
                        sales: { $sum: "$sales" }
                    }
                },
                {
                    $lookup: {
                        from: campaign,
                        let: { campaignId: "$campaignId" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$campaignId", "$$campaignId"] } } },
                            { $sort: { reportDate: -1 } },
                            { $limit: 1 },
                            { $project: { name: 1, campaignId: 1 } }
                        ],
                        as: "campaignData"
                    }
                },
                { $unwind: { path: "$campaignData", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: adGroup,
                        let: { adGroupId: "$adGroupId" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$adGroupId", "$$adGroupId"] } } },
                            { $sort: { reportDate: -1 } },
                            { $limit: 1 },
                            { $project: { name: 1, adGroupId: 1 } }
                        ],
                        as: "adGroupData"
                    }
                },
                { $unwind: { path: "$adGroupData", preserveNullAndEmptyArrays: true } },
                { $match: { clicks: { $gt: 10 }, spend: { $gt: 8 }, sales: 0, status: "ENABLED" } },
                {
                    $project: {
                        _id: "$_id",
                        targetId: "$_id",
                        targeting: 1,
                        campaignId: 1,
                        campaignName: "$campaignData.name",
                        adGroupId: 1,
                        adGroupName: "$adGroupData.name",
                        clicks: 1,
                        spend: 1,
                        sales: 1,
                        action: { $literal: "Pause or Negative" }
                    }
                }
            ];
            break;

        case "UNIQUE_ZERO_SALE_WORDS":
            model = searchTermSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                {
                    $group: {
                        _id: "$searchTerm",
                        campaignId: { $first: "$campaignId" },
                        campaignName: { $first: "$campaignName" },
                        adGroupId: { $first: "$adGroupId" },
                        adGroupName: { $first: "$adGroupName" },
                        clicks: { $sum: "$clicks" },
                        spend: { $sum: "$spend" },
                        sales: { $sum: "$sales" },
                        orders: { $sum: "$orders" }
                    }
                },
                { $match: { clicks: { $gt: 10 }, sales: 0 } },
                {
                    $project: {
                        _id: "$_id",
                        searchTerm: "$_id",
                        campaignName: 1,
                        campaignId: 1,
                        adGroupName: 1,
                        adGroupId: 1,
                        clicks: 1,
                        sales: 1,
                        action: { $literal: "Negative Phrase" }
                    }
                }
            ];
            break;

        case "GOOD_WORDS_NO_TARGET":
            model = searchTermSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                {
                    $group: {
                        _id: "$searchTerm",
                        campaignId: { $first: "$campaignId" },
                        campaignName: { $first: "$campaignName" },
                        adGroupId: { $first: "$adGroupId" },
                        adGroupName: { $first: "$adGroupName" },
                        clicks: { $sum: "$clicks" },
                        spend: { $sum: "$spend" },
                        sales: { $sum: "$sales" },
                        orders: { $sum: "$orders" }
                    }
                },
                {
                    $addFields: {
                        acos: { $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] }
                    }
                },
                { $match: { orders: { $gt: 2 }, acos: { $lt: 35 } } },
                {
                    $project: {
                        _id: "$_id",
                        searchTerm: "$_id",
                        campaignName: 1,
                        campaignId: 1,
                        adGroupName: 1,
                        adGroupId: 1,
                        orders: 1,
                        sales: 1,
                        acos: 1,
                        action: { $literal: "Add Keyword" }
                    }
                }
            ];
            break;

        case "ZERO_SALES_SEARCH_TERMS":
            model = searchTermSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                {
                    $group: {
                        _id: "$searchTerm",
                        campaignId: { $first: "$campaignId" },
                        campaignName: { $first: "$campaignName" },
                        adGroupId: { $first: "$adGroupId" },
                        adGroupName: { $first: "$adGroupName" },
                        clicks: { $sum: "$clicks" },
                        spend: { $sum: "$spend" },
                        sales: { $sum: "$sales" },
                        orders: { $sum: "$orders" }
                    }
                },
                { $match: { clicks: { $gt: 10 }, sales: 0 } },
                {
                    $project: {
                        _id: "$_id",
                        searchTerm: "$_id",
                        campaignName: 1,
                        campaignId: 1,
                        adGroupName: 1,
                        adGroupId: 1,
                        clicks: 1,
                        sales: 1,
                        action: { $literal: "Negative keyword or product" }
                    }
                }
            ];
            break;

        case "HIGH_ACOS_CAMPAIGNS":
            model = campaignSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                { $sort: { reportDate: -1 } },
                {
                    $group: {
                        _id: "$campaignId",
                        campaignName: { $first: "$name" },
                        status: { $first: "$status" },
                        budget: { $first: "$budget" },
                        spend: { $sum: "$spend" },
                        sales: { $sum: "$sales" }
                    }
                },
                {
                    $addFields: {
                        acos: { $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] },
                        suggestedBudget: { $cond: [{ $gt: ["$budget", 0] }, { $round: [{ $multiply: ["$budget", 0.9] }, 2] }, 0] }
                    }
                },
                { $match: { spend: { $gt: 20 }, acos: { $gt: 55 }, status: "ENABLED" } },
                {
                    $project: {
                        _id: "$_id",
                        campaignId: "$_id",
                        campaignName: 1,
                        spend: 1,
                        sales: 1,
                        acos: 1,
                        budget: 1,
                        suggestedBudget: 1,
                        action: { $literal: "Reduce 10% Budget" }
                    }
                }
            ];
            break;

        case "GROWTH_CAMPAIGNS":
            model = campaignSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                {
                    $group: {
                        _id: "$campaignId",
                        campaignName: { $first: "$name" },
                        status: { $first: "$status" },
                        budget: { $first: "$budget" },
                        spend: { $sum: "$spend" },
                        sales: { $sum: "$sales" }
                    }
                },
                {
                    $addFields: {
                        acos: { $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] },
                        suggestedBudget: { $cond: [{ $gt: ["$budget", 0] }, { $round: [{ $multiply: ["$budget", 1.1] }, 2] }, 0] }
                    }
                },
                { $match: { acos: { $lt: 30 }, spend: { $lt: 300 }, status: "ENABLED" } },
                {
                    $project: {
                        _id: "$_id",
                        campaignId: "$_id",
                        campaignName: 1,
                        spend: 1,
                        sales: 1,
                        acos: 1,
                        budget: 1,
                        suggestedBudget: 1,
                        action: { $literal: "Scale 10% Campaign Budget" }
                    }
                }
            ];
            break;

        case "SMART_RECOMMENDATIONS":
            model = campaignSchema;
            pipeline = [
                { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
                {
                    $group: {
                        _id: "$campaignId",
                        campaignName: { $first: "$name" },
                        clicks: { $sum: "$clicks" },
                        sales: { $sum: "$sales" },
                        orders: { $sum: "$orders" },
                        impressions: { $sum: "$impressions" },
                        status: { $first: "$status" }
                    }
                },
                { $match: { status: "ENABLED" } },
                {
                    $addFields: {
                        ctr: { $cond: [{ $gt: ["$impressions", 0] }, { $divide: ["$clicks", "$impressions"] }, 0] },
                        cvr: { $cond: [{ $gt: ["$clicks", 0] }, { $divide: ["$orders", "$clicks"] }, 0] }
                    }
                },
                {
                    $addFields: {
                        // Detect which pattern applies (priority order: Case 1 → 2 → 3)
                        pattern: {
                            $switch: {
                                branches: [
                                    {
                                        // Case 1: High CTR but low CVR → listing problem
                                        case: { $and: [{ $gt: ["$ctr", 0.05] }, { $lt: ["$cvr", 0.05] }] },
                                        then: "High CTR + Low CVR"
                                    },
                                    {
                                        // Case 2: High clicks + barely any sales → remarketing opportunity
                                        case: { $and: [{ $gt: ["$clicks", 20] }, { $lt: ["$sales", 5] }] },
                                        then: "High clicks + Low sales"
                                    },
                                    {
                                        // Case 3: Strong repeat purchase behavior → cross-sell opportunity
                                        case: { $and: [{ $gt: ["$orders", 5] }, { $gt: ["$cvr", 0.1] }] },
                                        then: "Repeat purchase pattern"
                                    }
                                ],
                                default: null
                            }
                        },
                        suggestion: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $and: [{ $gt: ["$ctr", 0.05] }, { $lt: ["$cvr", 0.05] }] },
                                        then: "Optimize listing"
                                    },
                                    {
                                        case: { $and: [{ $gt: ["$clicks", 20] }, { $lt: ["$sales", 5] }] },
                                        then: "Add Sponsored Display"
                                    },
                                    {
                                        case: { $and: [{ $gt: ["$orders", 5] }, { $gt: ["$cvr", 0.1] }] },
                                        then: "Cross-sell campaign"
                                    }
                                ],
                                default: null
                            }
                        }
                    }
                },
                // Only return rows where a valid pattern was detected
                { $match: { pattern: { $ne: null } } },
                {
                    $project: {
                        _id: "$_id",
                        campaignId: "$_id",
                        campaignName: 1,
                        clicks: 1,
                        sales: 1,
                        ctr: { $round: [{ $multiply: ["$ctr", 100] }, 2] },
                        cvr: { $round: [{ $multiply: ["$cvr", 100] }, 2] },
                        pattern: 1,
                        suggestion: 1,
                        action: { $literal: "Apply suggestion" }
                    }
                }
            ];
            break;

        default:
            return null;
    }

    return { pipeline, model };
};

// =========================
// 🧠 GET ALL RECOMMENDATIONS (CARDS)
// =========================
exports.getAllRecommendation = async (req, res) => {
    const configId = req?.config?.configId;
    const profileId = Number(req?.body?.profileId);

    try {
        const toDate = moment().format("YYYY-MM-DD");
        const fromDate = moment().subtract(14, "days").format("YYYY-MM-DD");

        // ---------- SEARCH TERM ----------
        const searchResult = await searchTermSchema.aggregate([
            { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
            {
                $group: {
                    _id: "$searchTerm",
                    clicks: { $sum: "$clicks" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                    orders: { $sum: "$orders" }
                }
            },
            {
                $addFields: {
                    acos: { $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] },
                    cvr: { $cond: [{ $gt: ["$clicks", 0] }, { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 0] }
                }
            },
            {
                $facet: {
                    goodSearchTerms: [{ $match: { orders: { $gt: 2 }, acos: { $lt: 40 }, cvr: { $gt: 10 } } }, { $count: "count" }],
                    zeroSalesSearchTerms: [{ $match: { clicks: { $gt: 10 }, sales: 0 } }, { $count: "count" }],
                    goodWordsNoTarget: [{ $match: { orders: { $gt: 2 }, acos: { $lt: 35 } } }, { $count: "count" }],
                    uniqueZeroWords: [
                        { $match: { clicks: { $gt: 10 }, sales: 0 } },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        // ---------- TARGETING ----------
        const targetingResult = await targetingSchema.aggregate([
            { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
            { $sort: { reportDate: -1 } },
            {
                $group: {
                    _id: "$targetId",
                    status: { $first: "$status" },
                    clicks: { $sum: "$clicks" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                }
            },
            {
                $addFields: {
                    acos: { $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] }
                }
            },
            {
                $facet: {
                    highAcosTerms: [{ $match: { clicks: { $gt: 10 }, acos: { $gt: 50 }, status: "ENABLED" } }, { $count: "count" }],
                    zeroSalesKeywords: [{ $match: { clicks: { $gt: 10 }, spend: { $gt: 8 }, sales: 0, status: "ENABLED" } }, { $count: "count" }]
                }
            }
        ]);

        // ---------- CAMPAIGN ----------
        const campaignResult = await campaignSchema.aggregate([
            { $match: { configId, profileId, reportDate: { $gte: fromDate, $lte: toDate } } },
            { $sort: { reportDate: -1 } },
            {
                $group: {
                    _id: "$campaignId",
                    status: { $first: "$status" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                    clicks: { $sum: "$clicks" },
                    orders: { $sum: "$orders" },
                    impressions: { $sum: "$impressions" }
                }
            },
            {
                $addFields: {
                    acos: { $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] },
                    ctr: { $cond: [{ $gt: ["$impressions", 0] }, { $divide: ["$clicks", "$impressions"] }, 0] },
                    cvr: { $cond: [{ $gt: ["$clicks", 0] }, { $divide: ["$orders", "$clicks"] }, 0] }
                }
            },
            {
                $facet: {
                    highAcosCampaigns: [{ $match: { spend: { $gt: 20 }, acos: { $gt: 55 }, status: "ENABLED" } }, { $count: "count" }],
                    growthCampaigns: [{ $match: { acos: { $lt: 30 }, spend: { $lt: 300 }, status: "ENABLED" } }, { $count: "count" }],
                    smart: [
                        {
                            $match: {
                                status: "ENABLED",
                                $or: [
                                    // Case 1: High CTR + Low CVR → listing issue
                                    { $and: [{ ctr: { $gt: 0.05 } }, { cvr: { $lt: 0.05 } }] },
                                    // Case 2: High clicks + Low sales → remarketing
                                    { $and: [{ clicks: { $gt: 20 } }, { sales: { $lt: 5 } }] },
                                    // Case 3: Repeat purchase pattern → cross-sell
                                    { $and: [{ orders: { $gt: 5 } }, { cvr: { $gt: 0.1 } }] }
                                ]
                            }
                        },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const s = searchResult[0];
        const t = targetingResult[0];
        const c = campaignResult[0];

        const data = [
            { key: "GOOD_SEARCH_TERMS", count: s.goodSearchTerms[0]?.count || 0 },
            { key: "HIGH_ACOS_TERMS", count: t.highAcosTerms[0]?.count || 0 },
            { key: "ZERO_SALES_KEYWORDS", count: t.zeroSalesKeywords[0]?.count || 0 },
            { key: "UNIQUE_ZERO_SALE_WORDS", count: s.uniqueZeroWords[0]?.count || 0 },
            { key: "GOOD_WORDS_NO_TARGET", count: s.goodWordsNoTarget[0]?.count || 0 },
            { key: "ZERO_SALES_SEARCH_TERMS", count: s.zeroSalesSearchTerms[0]?.count || 0 },
            { key: "HIGH_ACOS_CAMPAIGNS", count: c.highAcosCampaigns[0]?.count || 0 },
            { key: "GROWTH_CAMPAIGNS", count: c.growthCampaigns[0]?.count || 0 },
            { key: "SMART_RECOMMENDATIONS", count: c.smart[0]?.count || 0 }
        ];

        return res.status(200).json({ isSuccess: true, data });

    } catch (error) {
        recommendation_logs({ message: `[getAllRecommendation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
};

// =========================
// 📋 GET GRID DATA
// =========================
exports.getRecommendationGrid = async (req, res) => {
    const { type } = req.body;
    const configId = req?.config?.configId;
    const profileId = Number(req?.body?.profileId);

    try {
        const toDate = moment().format("YYYY-MM-DD");
        const fromDate = moment().subtract(14, "days").format("YYYY-MM-DD");

        const { pipeline, model } = buildPipeline(type, configId, profileId, fromDate, toDate);

        if (!pipeline || !model) {
            return res.status(400).json({ isSuccess: false, message: "Invalid type" });
        }

        const data = await model.aggregate(pipeline);

        return res.status(200).json({
            isSuccess: true,
            columns: RECOMMENDATION_COLUMNS[type],
            data
        });

    } catch (error) {
        recommendation_logs({ message: `[getRecommendationGrid Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
};

exports.applyRecommendation = async (req, res) => {
    try {
        const { items = [], profileId, type } = req.body;
        const configId = req?.config?.configId;
        const adType = req?.adType;

        const profile = await getProfile(configId, profileId);
        const checkConfigAds = await getAccessToken(configId);

        if (!items.length) {
            return res.status(400).json({ isSuccess: false, message: "No items provided" });
        }

        const results = [];

        for (const item of items) {
            let response;

            switch (type) {

                // ✅ 1. GOOD SEARCH TERMS
                case "GOOD_SEARCH_TERMS":
                    response = await AddToTargeting(adType, item, profile, checkConfigAds, ["EXACT"]);
                    break;

                // ✅ 2. HIGH ACOS TERMS
                case "HIGH_ACOS_TERMS":
                    response = await UpdateTargetingBid(adType, item, profile, checkConfigAds, -25);
                    break;

                // ✅ 3. ZERO SALES KEYWORDS
                case "ZERO_SALES_KEYWORDS":
                    response = await UpdateTargetingStatus(adType, item, profile, checkConfigAds, "PAUSED");
                    break;

                // ✅ 3. ZERO SALES TERMS
                case "ZERO_SALES_SEARCH_TERMS":
                    response = await AddToNegativeTargeting(adType, item, profile, checkConfigAds, ["NEGATIVE_EXACT", "NEGATIVE_PHRASE"]);
                    break;

                // ✅ 4. UNIQUE ZERO WORDS
                case "UNIQUE_ZERO_SALE_WORDS":
                    response = await AddToNegativeTargeting(adType, item, profile, checkConfigAds, ["PHRASE"]);
                    break;

                // ✅ 5. GOOD WORDS NO TARGET (MISSING BEFORE)
                case "GOOD_WORDS_NO_TARGET":
                    response = await AddToTargeting(adType, item, profile, checkConfigAds, ["EXACT"]);
                    break;

                // ✅ 6. HIGH ACOS CAMPAIGN
                case "HIGH_ACOS_CAMPAIGNS":
                    response = await UpdateCampaignBudget(adType, item, profile, checkConfigAds, -10);
                    break;

                // ✅ 7. GROWTH CAMPAIGN
                case "GROWTH_CAMPAIGNS":
                    response = await UpdateCampaignBudget(adType, item, profile, checkConfigAds, +10);
                    break;

                // ✅ 9. SMART RECOMMENDATIONS — Routes by detected suggestion
                case "SMART_RECOMMENDATIONS":
                    if (item.suggestion === "Optimize listing") {
                        // Case 1: High CTR + Low CVR → listing/images/price needs work
                        response = {
                            isSuccess: true,
                            message: "Flagged for listing review. Check title, bullet points, images, and price competitiveness.",
                            action: "LISTING_REVIEW",
                            campaignId: item.campaignId
                        };
                    } else if (item.suggestion === "Add Sponsored Display") {
                        // Case 2: High clicks + Low sales → retarget shoppers with Sponsored Display
                        response = {
                            isSuccess: true,
                            message: "Remarketing opportunity logged. Create a Sponsored Display retargeting campaign for visitors who did not convert.",
                            action: "CREATE_SPONSORED_DISPLAY",
                            campaignId: item.campaignId
                        };
                    } else if (item.suggestion === "Cross-sell campaign") {
                        // Case 3: Repeat purchase pattern → expand to related ASINs
                        response = {
                            isSuccess: true,
                            message: "Cross-sell opportunity logged. Build a new campaign targeting complementary or accessory ASINs.",
                            action: "CREATE_CROSSSELL_CAMPAIGN",
                            campaignId: item.campaignId
                        };
                    } else {
                        response = {
                            isSuccess: true,
                            message: `Suggestion applied: ${item.suggestion || "Optimize"}`,
                            action: "GENERIC_OPTIMIZE",
                            campaignId: item.campaignId
                        };
                    }
                    break;

                default:
                    response = { isSuccess: false, message: "Invalid type" };
            }

            results.push({
                _id: item._id,
                ...response
            });
        }

        return res.status(200).json({
            isSuccess: true,
            data: results
        });

    } catch (error) {
        recommendation_logs({ message: `[applyRecommendation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred"
        });
    }
};

exports.runRecommendationSnapshot = async (req, res) => {
    try {

        cron_logs({
            message: `Recommendation Snapshot Started`,
            log_type: "info",
        });

        const getProfiles = await getActivePlanProfiles();
        await Promise.all(
            getProfiles.map((profile) =>

                limit(async () => {
                    const { configId, profileId } = profile;
                    const toDate = moment().format("YYYY-MM-DD");
                    const fromDate = moment().subtract(14, "days").format("YYYY-MM-DD");

                    const bulkOps = [];

                    for (const campaignType of ["SP", "SB", "SD"]) {
                        for (const type of RECOMMENDATION_TYPES) {

                            const { pipeline, model } = buildPipeline(type, campaignType, configId, profileId, fromDate, toDate);

                            const data = await model.aggregate(pipeline);

                            bulkOps.push({
                                updateOne: {
                                    filter: { configId, profileId, reportedDate: toDate, type, campaignType },
                                    update: { $set: { columns: RECOMMENDATION_COLUMNS[type], data, totalCount: data?.length } },
                                    upsert: true
                                }
                            });
                        }
                    }

                    if (bulkOps.length) {
                        await recommendationSnapshotSchema.bulkWrite(bulkOps);
                        cron_logs({
                            message: `[Sponsored Products] Profile: ${profile.name}, Date: ${fromDate} - ${toDate}`,
                            log_type: "info",
                        });
                    }
                })
            )
        )

        return cron_logs({
            message: `Recommendation Snapshot Created Successfully`,
            log_type: "info",
        });

    } catch (error) {
        return cron_logs({
            message: `Recommendation Snapshot Error: ${error.message}`,
            log_type: "error",
        });
    }
};

exports.getRecommendationSnapshots = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const profileId = Number(req?.body?.profileId);
        const adType = req?.adType;

        const page = Number(req?.body?.page || 1);
        const limit = Number(req?.body?.limit || 15);

        const skip = (page - 1) * limit;
        const sevenDaysAgo = moment().subtract(6, "days").format("YYYY-MM-DD");

        const filter = {
            configId,
            profileId,
            reportedDate: { $gte: sevenDaysAgo },
            ...(adType && { campaignType: adType }),
            totalCount: { $gt: 0 }
        };

        const data = await recommendationSnapshotSchema.aggregate([
            {
                $match: filter
            },
            {
                $sort: { reportedDate: -1, createdAt: -1 }
            },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limit }
                    ],
                    totalCount: [
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const result = data[0];

        return res.status(200).json({
            data: result.data,
            pagination: {
                total: result.totalCount[0]?.count || 0,
                page,
                limit,
                totalPages: Math.ceil((result.totalCount[0]?.count || 0) / limit)
            }
        });

    } catch (error) {
        recommendation_logs({ message: `[getRecommendationSnapshots Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred"
        });
    }
};

exports.deleteRecommendationSnapshot = async (req, res) => {
    try {
        const { id } = req.body;

        const deleted = await recommendationSnapshotSchema.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({
                isSuccess: false,
                message: "Recommendation snapshot not found"
            });
        }

        return res.status(200).json({
            isSuccess: true,
            message: "Recommendation snapshot deleted successfully"
        });

    } catch (error) {
        recommendation_logs({ message: `[deleteRecommendationSnapshot Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred"
        });
    }
};

const buildRecommendationQueryFromConditions = (conditions) => {
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return {};
    let mongoQuery = {};

    const fieldMapping = {
        'Impressions': 'impressions',
        'Clicks': 'clicks',
        'Orders': 'orders',
        'Sales': 'sales',
        'ACOS': 'acos',
        'ROAS': 'roas',
        'Spend': 'spend',
        'CPC': 'cpc',
        'CTR': 'ctr',
        'CVR': 'cvr',
    };

    conditions.forEach((cond) => {
        const { conditionType, conditionOperator, conditionValue } = cond;
        const dbField = fieldMapping[conditionType] || (conditionType ? conditionType.toLowerCase() : null);

        if (dbField && conditionValue !== undefined && conditionValue !== null && conditionValue !== '') {
            let operator = {};
            const numVal = Number(conditionValue);

            switch (conditionOperator) {
                case 'LESS_THAN':
                    operator = { $lt: numVal };
                    break;
                case 'LESS_THAN_OR_EQUAL_TO':
                    operator = { $lte: numVal };
                    break;
                case 'GREATER_THAN_OR_EQUAL_TO':
                    operator = { $gte: numVal };
                    break;
                case 'GREATER_THAN':
                    operator = { $gt: numVal };
                    break;
                case 'EQUAL_TO':
                    operator = { $eq: numVal };
                    break;
                default:
                    operator = { $eq: numVal };
            }

            mongoQuery[dbField] = { ...(mongoQuery[dbField] || {}), ...operator };
        }
    });

    return mongoQuery;
};

const getEffectiveRuleQuery = (rule) => {
    if (rule?.conditions && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
        const conditionQuery = buildRecommendationQueryFromConditions(rule.conditions);
        if (Object.keys(conditionQuery).length > 0) {
            return conditionQuery;
        }
    }
    if (rule?.query) {
        return sanitizeQueryObject(safeJsonParse(rule.query));
    }
    return null;
};

/**
 * Create Rule
 */
exports.addRules = async (req, res) => {
    const configId = req?.config?.configId;
    const userId = req?.user?._id;

    const {
        profileId,
        ruleName,
        gridName,
        reportDate,
        conditions,
        actions,
        query,
        campaignSelectionType,
        campaignIds,
    } = req.body;

    try {
        const getAccount = await getProfile(configId, profileId);

        if (!getAccount) {
            return res.status(203).send({
                isSuccess: false,
                message: "Please select valid account!",
            });
        }

        const queryToSave = (conditions && Array.isArray(conditions) && conditions.length > 0)
            ? JSON.stringify(buildRecommendationQueryFromConditions(conditions))
            : (query || "");

        const createRule = new recommendationRuleSchema({
            configId,
            userId,
            profileId,
            ruleName,
            gridName,
            reportDate,
            conditions,
            actions,
            query: queryToSave,
            campaignSelectionType: campaignSelectionType || "ALL",
            campaignIds: campaignIds || { SP: [], SB: [], SD: [] },
            countryCode: getAccount.countryCode,
            timezone: getAccount.timezone,
        });

        await createRule.save();

        await logAudit("RECOMMENDATION_RULE_CREATION", `Created recommendation rule: ${createRule?.ruleName}`, {
            ruleName: createRule?.ruleName,
            gridName: createRule?.gridName,
            reportDate: createRule?.reportDate,
            conditions: createRule?.conditions,
            actions: createRule?.actions,
            campaignSelectionType: createRule?.campaignSelectionType,
            campaignIds: createRule?.campaignIds,
        }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation Rule created successfully.",
            data: createRule,
        });
    } catch (error) {
        recommendation_logs({ message: `[addRules Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

/**
 * Update Rule
 */
exports.updateRules = async (req, res) => {
    const configId = req?.config?.configId;
    const ruleId = req?.params?.id;

    try {
        const updateData = { ...req?.body, isDeleted: false };
        delete updateData.userId;
        delete updateData.configId;
        delete updateData.profileId;
        delete updateData._id;
        delete updateData.isActive;

        if (req?.body?.conditions && Array.isArray(req.body.conditions) && req.body.conditions.length > 0) {
            updateData.query = JSON.stringify(buildRecommendationQueryFromConditions(req.body.conditions));
        }

        const updateRule = await recommendationRuleSchema.findOneAndUpdate({ _id: ruleId, ...(configId && { configId }) }, updateData, { new: true });

        if (!updateRule) {
            return res.status(203).send({
                isSuccess: false,
                message: "Rule not found!",
            });
        }

        await logAudit("RECOMMENDATION_RULE_UPDATE", `Updated recommendation rule: ${updateRule?.ruleName}`, {
            ruleName: updateRule?.ruleName,
            gridName: updateRule?.gridName,
            reportDate: updateRule?.reportDate,
            conditions: updateRule?.conditions,
            actions: updateRule?.actions,
            campaignSelectionType: updateRule?.campaignSelectionType,
            campaignIds: updateRule?.campaignIds,
        }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation Rule updated successfully.",
            data: updateRule,
        });
    } catch (error) {
        recommendation_logs({ message: `[updateRules Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

/**
 * Change Status
 */
exports.statusChange = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { ids, isActive } = req.body;

        if (!Array.isArray(ids) || !ids.length) {
            return res.status(203).send({
                isSuccess: false,
                message: "ids array is required.",
            });
        }

        const result = await recommendationRuleSchema.updateMany({ _id: { $in: ids }, ...(configId && { configId }) }, { $set: { isActive } });

        const updatedRules = await recommendationRuleSchema.find({ _id: { $in: ids }, ...(configId && { configId }) }, "ruleName profileId");
        const ruleNames = updatedRules.map(r => r.ruleName).join(", ");

        await logAudit("RECOMMENDATION_RULE_STATUS_CHANGE", `Recommendation rule ${ruleNames} ${isActive === true ? "activated" : "paused"}`, {
            ruleNames,
        }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: "Status updated successfully.",
            updatedCount: result.modifiedCount,
        });
    } catch (error) {
        recommendation_logs({ message: `[statusChange Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

/**
 * Delete Rule
 */
exports.deleteRule = async (req, res) => {
    const configId = req?.config?.configId;
    const ruleId = req?.params?.id;

    try {
        const deleteRule = await recommendationRuleSchema.findOneAndDelete({ _id: ruleId, ...(configId && { configId }) });

        if (!deleteRule) {
            return res.status(203).send({
                isSuccess: false,
                message: "Rule not found!",
            });
        }

        await recommandationStatusSchema.deleteMany({ ruleId });
        await recommandationCampaignByRuleSchema.deleteMany({ ruleId });

        await logAudit("RECOMMENDATION_RULE_DELETION", `Deleted recommendation rule: ${deleteRule?.ruleName}`, {
            ruleName: deleteRule?.ruleName,
        }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation Rule deleted successfully.",
        });
    } catch (error) {
        recommendation_logs({ message: `[deleteRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

/**
 * Get Rules Listing
 */
exports.getRules = async (req, res) => {
    const configId = req?.config?.configId;
    const profileId = req.body.profileId;

    const pageNo = req.body.pageNo || 1;
    const perPage = req.body.perPage || 10;

    try {
        const pipeline = [
            {
                $match: {
                    configId,
                    profileId,
                },
            },
            {
                $sort: { createdAt: -1 },
            },
            {
                $facet: {
                    data: [
                        { $skip: perPage * pageNo - perPage },
                        { $limit: perPage },
                    ],
                    totalCount: [{ $count: "count" }],
                },
            },
        ];

        const result = await recommendationRuleSchema.aggregate(pipeline);

        const data = result[0].data;
        const totalRecords = result[0].totalCount[0]?.count || 0;

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation Rules fetched successfully.",
            data,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
        });
    } catch (error) {
        recommendation_logs({ message: `[getRules Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

/**
 * Get Rule By Id
 */
exports.getRuleById = async (req, res) => {
    const configId = req?.config?.configId;
    const ruleId = req.params.id;

    try {
        const getRule = await recommendationRuleSchema.findOne({ _id: ruleId, ...(configId && { configId }) }).lean();

        if (!getRule) {
            return res.status(203).send({
                isSuccess: false,
                message: "Rule not found!",
            });
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Rule fetched successfully.",
            data: getRule,
        });
    } catch (error) {
        recommendation_logs({ message: `[getRuleById Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

exports.exportRecommandationRule = async (req, res) => {
    try {
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const { profileId, exportIds } = req.body;

        const query = { configId, profileId };

        // ✅ Apply ruleIds filter if provided
        if (Array.isArray(exportIds) && exportIds?.length) {
            query._id = { $in: exportIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) };
        }

        const rules = await recommendationRuleSchema.find(query).lean();

        const workbook = new ExcelJS.Workbook();

        const metaSheet = workbook.addWorksheet("_META");
        const secretPayload = `RECOMMENDATION_RULE`;
        const signature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(secretPayload).digest("hex");
        metaSheet.getCell("A1").value = signature;
        metaSheet.state = "hidden";

        const sheet = workbook.addWorksheet("RecommandationRules");

        sheet.columns = [
            // { header: "Profile ID", key: "profileId", width: 18 },
            // { header: "Config ID", key: "configId", width: 18 },
            // { header: "User ID", key: "userId", width: 18 },

            { header: "Rule Name", key: "ruleName", width: 25 },
            { header: "Is Active", key: "isActive", width: 12 },

            { header: "Grid Name", key: "gridName", width: 20 },

            { header: "Query", key: "query", width: 50 },
            { header: "Conditions", key: "conditions", width: 40 },
            { header: "Actions", key: "actions", width: 40 },

            { header: "Report Date", key: "reportDate", width: 15 },
            { header: "Campaign Selection Type", key: "campaignSelectionType", width: 25 },
            { header: "Campaign IDs", key: "campaignIds", width: 35 },

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

                gridName: rule?.gridName,

                // 🔑 Arrays / Objects → JSON STRING
                query: JSON.stringify(rule?.query ?? {}),
                conditions: JSON.stringify(rule.conditions ?? []),
                actions: JSON.stringify(rule.actions ?? []),

                reportDate: rule.reportDate ?? "",
                campaignSelectionType: rule.campaignSelectionType ?? "ALL",
                campaignIds: JSON.stringify(rule.campaignIds ?? { SP: [], SB: [], SD: [] }),

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
            `attachment; filename=RecommandationRules_${profileId}.xlsx`
        );
        res.setHeader(
            "Access-Control-Expose-Headers",
            "Content-Disposition"
        );

        await workbook.xlsx.write(res);
        return res.end();

    } catch (error) {
        recommendation_logs({ message: `[exportRecommandationRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.error(error);
        return res.status(500).send({
            isSuccess: false,
            message: "Export failed",
            error: "An internal server error occurred",
        });
    }
};

exports.importRecommandationRule = async (req, res) => {
    try {
        const { _id: userId } = req.user;
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
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
        const expectedPayload = `RECOMMENDATION_RULE`;

        const storedSignature = metaSheet.getCell("A1").value;
        const expectedSignature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(expectedPayload).digest("hex");

        if (storedSignature !== expectedSignature) {
            return res.status(203).send({
                isSuccess: false,
                message: "Invalid file. Please upload a valid Recommendation Rule export file."
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
        const existingRules = await recommendationRuleSchema.find({ configId, profileId, userId }, { _id: 1, conditions: 1, gridName: 1 }).lean();

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
                const gridName = row.getCell("C").value;
                const conditions = safeJsonParse(row.getCell("E").value || "[]");

                if (!ruleName || !conditions.length || !gridName) {
                    skippedCount++;
                    return;
                }

                // Skip duplicate
                const matchedRule = checkDuplicateRecommandationRule(existingRules, conditions, gridName);
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

                    gridName,

                    query: safeJsonParse(row.getCell("D").value || "{}"),
                    conditions,
                    actions: safeJsonParse(row.getCell("F").value || "[]"),

                    reportDate: row.getCell("G").value,
                    campaignSelectionType: row.getCell("H").value || "ALL",
                    campaignIds: safeJsonParse(row.getCell("I").value || "{ \"SP\": [], \"SB\": [], \"SD\": [] }"),

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
                recommendation_logs({ message: `[importRecommandationRule Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                errors.push({
                    row: rowNumber,
                    message: err.message,
                });
            }
        });

        if (bulkOps.length) {
            await recommendationRuleSchema.bulkWrite(bulkOps);
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
        recommendation_logs({ message: `[importRecommandationRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Import failed",
            error: "An internal server error occurred",
        });
    }
};

exports.recommendationPipeline = (query, lastDate, rule, adType = "SP", options = {}) => {
    const { fromDate } = getRuleDate(rule?.timezone, rule?.reportDate);
    const ruleConfigId = (rule?.configId && mongoose.Types.ObjectId.isValid(rule.configId)) ? new mongoose.Types.ObjectId(rule.configId) : rule?.configId;
    const ruleId = (rule?._id && mongoose.Types.ObjectId.isValid(rule._id)) ? new mongoose.Types.ObjectId(rule._id) : rule?._id;
    const ruleProfileId = Number(rule?.profileId) || rule?.profileId;

    if (query?.configId && mongoose.Types.ObjectId.isValid(query.configId)) {
        query.configId = new mongoose.Types.ObjectId(query.configId);
    }
    if (query?.profileId) {
        query.profileId = Number(query.profileId) || query.profileId;
    }

    // =========================
    // CAMPAIGN SELECTION (INCLUDE / EXCLUDE)
    // =========================
    if (rule?.campaignSelectionType === "INCLUDE") {
        const rawIds = rule?.campaignIds?.[adType] || [];
        const includeIds = Array.isArray(rawIds) ? rawIds.map(Number).filter(id => !isNaN(id)) : [];
        if (includeIds.length > 0) {
            query.campaignId = { $in: includeIds };
        } else {
            query.campaignId = { $in: [] };
        }
    } else if (rule?.campaignSelectionType === "EXCLUDE") {
        const rawIds = rule?.campaignIds?.[adType] || [];
        const excludeIds = Array.isArray(rawIds) ? rawIds.map(Number).filter(id => !isNaN(id)) : [];
        if (excludeIds.length > 0) {
            query.campaignId = { $nin: excludeIds };
        }
    }

    // =========================
    // PLACEMENT SELECTION
    // =========================
    if (rule?.gridName === "Placement") {
        const placementActions = (rule?.actions || []).filter(a => a?.placementType);
        if (placementActions.length > 0) {
            const placementTypes = placementActions.map(a => a.placementType);
            const mappedPlacements = [];
            placementTypes.forEach(pt => {
                if (typeof pt === "string") {
                    const norm = pt.toLowerCase().replace(/[^a-z0-9]/g, "");
                    if (norm.includes("top")) {
                        mappedPlacements.push("Top of Search", "Top Search", "Top of Search on-Amazon");
                    } else if (norm.includes("rest")) {
                        mappedPlacements.push("Rest of Search", "Rest Search");
                    } else if (norm.includes("product")) {
                        mappedPlacements.push("Product pages", "Product Page", "Product Pages");
                    } else {
                        mappedPlacements.push(pt);
                    }
                }
            });
            if (mappedPlacements.length > 0) {
                query.placement = { $in: [...new Set(mappedPlacements)] };
            }
        }
    }

    let groupId = {};

    // =========================
    // GROUP ID
    // =========================

    if (rule.gridName === "Campaign") {
        groupId = {
            campaignId: "$campaignId",
            profileId: "$profileId",
        };
    }

    if (rule.gridName === "Placement") {
        groupId = {
            campaignId: "$campaignId",
            placement: "$placement",
            profileId: "$profileId",
        };
    }

    if (rule.gridName === "Targeting") {
        groupId = {
            campaignId: "$campaignId",
            adGroupId: "$adGroupId",
            targetId: "$targetId",
            profileId: "$profileId",
        };
    }

    if (rule.gridName === "Search Term") {
        groupId = {
            campaignId: "$campaignId",
            adGroupId: "$adGroupId",
            keywordId: "$keywordId",
            searchTerm: "$searchTerm",
            profileId: "$profileId",
        };
    }

    // =========================
    // UNIQUE MATCH
    // =========================

    const uniqueMatch = [];

    if (rule.gridName === "Campaign") {
        uniqueMatch.push({
            $eq: ["$campaignId", "$$campaignId"],
        });
    }

    if (rule.gridName === "Placement") {
        uniqueMatch.push(
            { $eq: ["$campaignId", "$$campaignId"] },
            { $eq: ["$placement", "$$placement"] }
        );
    }

    if (rule.gridName === "Targeting") {
        uniqueMatch.push(
            { $eq: ["$campaignId", "$$campaignId"] },
            { $eq: ["$adGroupId", "$$adGroupId"] },
            { $eq: ["$targetId", "$$targetId"] }
        );
    }

    if (rule.gridName === "Search Term") {
        uniqueMatch.push(
            { $eq: ["$campaignId", "$$campaignId"] },
            { $eq: ["$adGroupId", "$$adGroupId"] },
            { $eq: ["$keywordId", "$$keywordId"] },
            { $eq: ["$searchTerm", "$$searchTerm"] }
        );
    }

    // =========================
    // EFFECTIVE RULE QUERY
    // =========================
    const effectiveQuery = getEffectiveRuleQuery(rule);
    const hasEffectiveQuery = effectiveQuery && Object.keys(effectiveQuery).length > 0;

    // =========================
    // COMMON PIPELINE
    // =========================

    const commonPipeline = [
        { $match: query },
        {
            $group: {
                _id: groupId,
                campaignId: { $last: "$campaignId" },
                adGroupId: { $last: "$adGroupId" },
                targetId: { $last: "$targetId" },
                keywordId: { $last: "$keywordId" },
                placement: { $last: "$placement" },
                targeting: { $last: "$targeting" },
                keywordType: { $last: "$keywordType" },
                matchType: { $last: "$matchType" },
                searchTerm: { $last: "$searchTerm" },
                profileId: { $last: "$profileId" },

                status: { $last: "$status" },
                budget: { $last: "$budget" },
                placementBid: { $last: "$placementModifier" },
                targetingBid: { $last: "$keywordBid" },

                impressions: { $sum: "$impressions" },
                clicks: { $sum: "$clicks" },
                orders: { $sum: "$orders" },
                spend: { $sum: "$spend" },
                sales: { $sum: "$sales" },

                reportDate: { $max: "$reportDate" },
            }
        },

        // Calculate derived metrics early
        {
            $addFields: {
                acos: { $cond: [{ $gt: ["$sales", 0] }, { $round: [{ $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 2] }, 0] },
                roas: { $cond: [{ $gt: ["$spend", 0] }, { $round: [{ $divide: ["$sales", "$spend"] }, 2] }, 0] },
                cpc: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $divide: ["$spend", "$clicks"] }, 2] }, 0] },
                ctr: { $cond: [{ $gt: ["$impressions", 0] }, { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] }, 0] },
                cvr: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] }, 0] },
            }
        },

        // Early filter: Drop records that do not match rule criteria BEFORE heavy lookups
        ...(hasEffectiveQuery ? [{ $match: effectiveQuery }] : []),

        // =========================
        // 4. CAMPAIGN LOOKUP
        // =========================

        {
            $lookup: {
                from: AD_TYPE_COLLECTIONS?.[adType]?.["campaign"],
                let: { cId: "$_id.campaignId", pId: "$_id.profileId", end: lastDate },
                pipeline: [
                    { $match: { $expr: { $and: [{ $eq: ["$campaignId", "$$cId"] }, { $eq: ["$profileId", "$$pId"] }, { $eq: ["$reportDate", "$$end"] }] } } },
                    { $limit: 1 },
                    { $project: { _id: 0, campaignId: 1, name: 1, status: 1, targetingType: 1 } },
                ],
                as: "campaign",
            },
        },
        { $unwind: { path: "$campaign", preserveNullAndEmptyArrays: true } },
        { $match: { "campaign.status": "ENABLED" } },
        ...(
            rule?.gridName === "Search Term" && rule?.actions?.some(a => a?.actionName === "AddAsTargeting")
                ? [{ $match: { "campaign.targetingType": "MANUAL" } }]
                : []
        ),
        ...(["Targeting", "Search Term"].includes(rule.gridName) ?
            [
                {
                    $lookup: {
                        from: AD_TYPE_COLLECTIONS?.[adType]?.["adGroup"],
                        let: { agId: "$_id.adGroupId", pId: "$_id.profileId", end: lastDate },
                        pipeline: [
                            { $match: { $expr: { $and: [{ $eq: ["$adGroupId", "$$agId"] }, { $eq: ["$profileId", "$$pId"] }, { $eq: ["$reportDate", "$$end"] }] } } },
                            { $limit: 1 },
                            { $project: { _id: 0, adGroupId: 1, name: 1, status: 1 } },
                        ],
                        as: "adGroup",
                    },
                },
                { $unwind: { path: "$adGroup", preserveNullAndEmptyArrays: true } },
                { $match: { "adGroup.status": "ENABLED" } }
            ]
            : []
        ),

        // =========================
        // 7. TARGETING STATUS CHECK
        // Targeting only
        // =========================

        ...(rule.gridName === "Targeting"
            ? [
                {
                    $lookup: {
                        from: AD_TYPE_COLLECTIONS?.[adType]?.["targeting"],

                        let: {
                            campaignId: "$_id.campaignId",
                            adGroupId: "$_id.adGroupId",
                            profileId: "$_id.profileId",
                            targetId: "$_id.targetId",
                            targeting: "$targeting",
                            matchType: "$matchType"
                        },

                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            {
                                                $eq: [
                                                    "$campaignId",
                                                    "$$campaignId"
                                                ]
                                            },
                                            {
                                                $eq: [
                                                    "$adGroupId",
                                                    "$$adGroupId"
                                                ]
                                            },
                                            {
                                                $eq: [
                                                    "$profileId",
                                                    "$$profileId"
                                                ]
                                            },
                                            {
                                                $eq: [
                                                    "$reportDate",
                                                    lastDate
                                                ]
                                            },
                                            {
                                                $cond: [
                                                    { $ne: [{ $ifNull: ["$$targetId", null] }, null] },
                                                    { $eq: ["$targetId", "$$targetId"] },
                                                    {
                                                        $and: [
                                                            { $eq: ["$targeting", "$$targeting"] },
                                                            { $eq: ["$matchType", "$$matchType"] }
                                                        ]
                                                    }
                                                ]
                                            },
                                            {
                                                $eq: [
                                                    "$status",
                                                    "ENABLED"
                                                ]
                                            }
                                        ]
                                    }
                                }
                            },

                            {
                                $sort: {
                                    reportDate: -1
                                }
                            },

                            {
                                $limit: 1
                            },

                            {
                                $project: {
                                    _id: 0,
                                    targetId: 1,
                                    status: 1,
                                    targeting: 1,
                                    keywordType: 1,
                                    matchType: 1,
                                    keywordBid: 1
                                }
                            }
                        ],

                        as: "targetingData"
                    }
                },

                // Targeting must exist and be ENABLED
                {
                    $match: {
                        "targetingData.0": {
                            $exists: true
                        }
                    }
                },

                // Take targetId/status/etc from targeting collection
                {
                    $set: {
                        targetId: {
                            $arrayElemAt: [
                                "$targetingData.targetId",
                                0
                            ]
                        },
                        status: {
                            $arrayElemAt: [
                                "$targetingData.status",
                                0
                            ]
                        },
                        keywordType: {
                            $arrayElemAt: [
                                "$targetingData.keywordType",
                                0
                            ]
                        },
                        matchType: {
                            $arrayElemAt: [
                                "$targetingData.matchType",
                                0
                            ]
                        },
                        targetingBid: {
                            $arrayElemAt: [
                                "$targetingData.keywordBid",
                                0
                            ]
                        }
                    }
                }
            ]
            : []
        ),

        // =========================
        // 8. SEARCH TERM
        // CHECK IF ALREADY TARGETING
        // =========================
        ...(
            rule.gridName === "Search Term"
                ? [
                    {
                        $lookup: {
                            from: AD_TYPE_COLLECTIONS?.[adType]?.["targeting"],
                            let: { cId: "$_id.campaignId", agId: "$_id.adGroupId", pId: "$_id.profileId", st: "$searchTerm" },
                            pipeline: [
                                { $match: { $expr: { $and: [{ $eq: ["$campaignId", "$$cId"] }, { $eq: ["$adGroupId", "$$agId"] }, { $eq: ["$profileId", "$$pId"] }, { $eq: ["$reportDate", lastDate] }, { $eq: ["$targeting", "$$st"] }, { $eq: ["$status", "ENABLED"] }] } } },
                                { $limit: 1 },
                                { $project: { _id: 0, targetId: 1 } },
                            ],
                            as: "existsInTargeting",
                        },
                    },

                    // Search term must NOT already
                    // exist as enabled targeting
                    { $match: { existsInTargeting: { $size: 0 } } },
                ]
                : []
        ),

        // =========================
        // 9. EXISTING RECOMMENDATION
        // =========================

        ...(options?.hasExistingNotNew === false
            ? []
            : [
                {
                    $lookup: {
                        from: "recommandationstatuses",

                        let: {
                            campaignId: "$_id.campaignId",
                            adGroupId: "$_id.adGroupId",
                            targetId: "$_id.targetId",
                            keywordId: "$_id.keywordId",
                            placement: "$_id.placement",
                            searchTerm: "$_id.searchTerm",
                            profileId: "$_id.profileId",
                        },

                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$configId", ruleConfigId] },
                                            { $eq: ["$profileId", "$$profileId"] },
                                            { $eq: ["$ruleId", ruleId] },
                                            { $eq: ["$campaignId", "$$campaignId"] },
                                            ...(rule.gridName === "Campaign" ? [] : [
                                                { $eq: ["$adGroupId", "$$adGroupId"] }
                                            ]),
                                            ...(rule.gridName === "Targeting" ? [
                                                { $eq: ["$targetId", "$$targetId"] }
                                            ] : []),
                                            ...(rule.gridName === "Search Term" ? [
                                                { $eq: ["$keywordId", "$$keywordId"] },
                                                { $eq: ["$searchTerm", "$$searchTerm"] }
                                            ] : []),
                                            ...(rule.gridName === "Placement" ? [
                                                { $eq: ["$placement", "$$placement"] }
                                            ] : []),
                                            { $gte: ["$reportDate", fromDate] },
                                            { $lte: ["$reportDate", lastDate] },
                                            { $eq: ["$isNew", false] },
                                        ]
                                    }
                                }
                            },
                            { $limit: 1 },
                            { $project: { _id: 1, isNew: 1 } }
                        ],

                        as: "existingRecommendation",
                    },
                }
            ]
        ),

        // =========================
        // 10. FINAL RESPONSE
        // =========================

        ...(options?.isCountOnly
            ? []
            : [
                {
                    $project: {

                        profileId: 1,
                        campaignId: 1,
                        adGroupId: 1,
                        targetId: 1,
                        keywordId: 1,
                        placement: 1,
                        targeting: 1,
                        keywordType: 1,
                        matchType: 1,
                        searchTerm: 1,

                        impressions: 1,
                        clicks: 1,
                        orders: 1,
                        spend: 1,
                        sales: 1,
                        budget: 1,
                        placementBid: 1,
                        targetingBid: 1,
                        status: 1,

                        campaignName: "$campaign.name",
                        campaignStatus: "$campaign.status",

                        adGroupName: "$adGroup.name",
                        adGroupStatus: "$adGroup.status",

                        acos: 1,
                        roas: 1,
                        cpc: 1,
                        ctr: 1,
                        cvr: 1,

                        // New recommendation
                        isNew: options?.hasExistingNotNew === false ? { $literal: true } : { $eq: [{ $size: "$existingRecommendation" }, 0] },
                    }
                }
            ]
        )
    ];

    return commonPipeline;
};

const computeRecommendationCounts = async ({ configId, profileId, adType, models }) => {
    const { adTypeCampaignSchema, adTypeAdGroupSchema, adTypePlacementSchema, adTypeTargetingSchema, adTypeSearchTermSchema } = models;
    const rules = await recommendationRuleSchema.find({ configId, profileId, isActive: true, isDeleted: { $ne: true } }).lean();

    if (!rules.length) {
        return [];
    }

    // Current eligibility is identical for rules ending on the same date. Read it
    // once instead of running three correlated lookups for every matching target.
    const targetingEligibility = new Map();
    const identity = (...parts) => JSON.stringify(parts);
    const getTargetingEligibility = (date) => {
        if (!targetingEligibility.has(date)) {
            targetingEligibility.set(date, (async () => {
                const scope = { configId, profileId, reportDate: date };
                const [campaigns, adGroups, targets] = await Promise.all([
                    adTypeCampaignSchema.find(scope, { campaignId: 1, status: 1 }).lean(),
                    adTypeAdGroupSchema.find(scope, { adGroupId: 1, status: 1 }).lean(),
                    adTypeTargetingSchema.find({ ...scope, status: "ENABLED" }, {
                        campaignId: 1, adGroupId: 1, targetId: 1, targeting: 1, matchType: 1
                    }).lean(),
                ]);
                // The detail pipeline takes the first current campaign/ad group.
                const firstStatus = (rows, field) => {
                    const result = new Map();
                    for (const row of rows) {
                        if (!result.has(row[field])) result.set(row[field], row.status);
                    }
                    return result;
                };
                return {
                    campaigns: firstStatus(campaigns, "campaignId"),
                    adGroups: firstStatus(adGroups, "adGroupId"),
                    targets: new Set(targets.map(t => identity(t.campaignId, t.adGroupId, t.targetId))),
                    fallbackTargets: new Set(targets.map(t => identity(t.campaignId, t.adGroupId, t.targeting, t.matchType))),
                };
            })());
        }
        return targetingEligibility.get(date);
    };

    const hasSearchTerm = rules.some(r => r.gridName === "Search Term");
    let enabledCampIds = null;
    let enabledAgIds = null;
    let enabledTgtSet = null;

    if (hasSearchTerm && adTypeSearchTermSchema) {
        try {
            const sampleRule = rules.find(r => r.gridName === "Search Term");
            const today = moment.tz(sampleRule?.timezone || "America/Los_Angeles").format("YYYY-MM-DD");
            const [enabledCampaigns, enabledAdGroups, enabledTargetings] = await Promise.all([
                adTypeCampaignSchema ? adTypeCampaignSchema.find({ profileId, reportDate: today, status: 'ENABLED' }, { campaignId: 1 }).lean() : [],
                adTypeAdGroupSchema ? adTypeAdGroupSchema.find({ profileId, reportDate: today, status: 'ENABLED' }, { adGroupId: 1 }).lean() : [],
                adTypeTargetingSchema ? adTypeTargetingSchema.find({ profileId, reportDate: today, status: 'ENABLED' }, { adGroupId: 1, targeting: 1 }).lean() : []
            ]);

            enabledCampIds = enabledCampaigns.map(c => c.campaignId);
            enabledAgIds = enabledAdGroups.map(a => a.adGroupId);
            enabledTgtSet = new Set(enabledTargetings.map(t => `${t.adGroupId}:::${(t.targeting || '').toLowerCase().trim()}`));
        } catch (e) {
            // graceful fallback if error fetching pre-cached sets
        }
    }

    const computedRules = await Promise.all(
        rules.map(async (rule) => {
            try {
                let model = null;
                const currentDate = moment.tz(rule?.timezone).format("YYYY-MM-DD");

                if (rule.gridName === "Campaign") model = adTypeCampaignSchema;
                if (rule.gridName === "Placement") model = adTypePlacementSchema;
                if (rule.gridName === "Targeting") model = adTypeTargetingSchema;
                if (rule.gridName === "Search Term") model = adTypeSearchTermSchema;

                if (!model) return null;

                let matchQuery = { configId: rule.configId, profileId: rule.profileId };
                let { fromDate, toDate } = getRuleDate(rule?.timezone, rule?.reportDate);
                if (rule?.reportDate !== "LIFETIME") matchQuery.reportDate = { $gte: fromDate, $lte: toDate };
                else toDate = currentDate;

                const notNewRecords = await recommandationStatusSchema.find({
                    configId: rule.configId,
                    profileId: rule.profileId,
                    ruleId: rule._id,
                    isNew: false,
                    reportDate: { $gte: fromDate, $lte: toDate }
                }, { campaignId: 1, adGroupId: 1, keywordId: 1, targetId: 1, placement: 1, searchTerm: 1 }).lean();

                const hasNotNew = notNewRecords.length > 0;

                if (rule.gridName === "Targeting") {
                    const pipeline = exports.recommendationPipeline(matchQuery, toDate, rule, adType, {
                        hasExistingNotNew: false, isCountOnly: true,
                    });
                    const lookupIndex = pipeline.findIndex(stage => stage.$lookup);
                    const [candidates, eligibility] = await Promise.all([
                        model.aggregate([
                            ...pipeline.slice(0, lookupIndex),
                            { $project: { _id: 1, targeting: 1, matchType: 1 } },
                        ]).allowDiskUse(true),
                        getTargetingEligibility(toDate),
                    ]);
                    const notNew = new Set(notNewRecords.map(r => identity(r.campaignId, r.adGroupId, r.targetId)));
                    let count = 0;
                    let newCount = 0;
                    for (const item of candidates) {
                        const id = item._id;
                        if (eligibility.campaigns.get(id.campaignId) !== "ENABLED" ||
                            eligibility.adGroups.get(id.adGroupId) !== "ENABLED") continue;
                        const enabled = id.targetId != null
                            ? eligibility.targets.has(identity(id.campaignId, id.adGroupId, id.targetId))
                            : eligibility.fallbackTargets.has(identity(id.campaignId, id.adGroupId, item.targeting, item.matchType));
                        if (!enabled) continue;
                        count++;
                        if (!notNew.has(identity(id.campaignId, id.adGroupId, id.targetId))) newCount++;
                    }
                    return { rule, fromDate, toDate, count, newCount };
                }

                if (rule.gridName === "Search Term" && enabledCampIds && enabledAgIds && enabledTgtSet) {
                    const effectiveQuery = getEffectiveRuleQuery(rule);
                    const hasEffectiveQuery = effectiveQuery && Object.keys(effectiveQuery).length > 0;
                    const queryStr = JSON.stringify(effectiveQuery || {});
                    const needsDerived = queryStr.includes('"acos"') || queryStr.includes('"roas"') || queryStr.includes('"cpc"') || queryStr.includes('"ctr"') || queryStr.includes('"cvr"');

                    const groupFields = {};
                    if (!hasEffectiveQuery) {
                        groupFields.spend = { $sum: "$spend" };
                    } else {
                        if (queryStr.includes('"spend"') || queryStr.includes('"acos"') || queryStr.includes('"roas"') || queryStr.includes('"cpc"')) {
                            groupFields.spend = { $sum: "$spend" };
                        }
                        if (queryStr.includes('"sales"') || queryStr.includes('"acos"') || queryStr.includes('"roas"')) {
                            groupFields.sales = { $sum: "$sales" };
                        }
                        if (queryStr.includes('"orders"') || queryStr.includes('"cvr"')) {
                            groupFields.orders = { $sum: "$orders" };
                        }
                        if (queryStr.includes('"clicks"') || queryStr.includes('"cpc"') || queryStr.includes('"ctr"') || queryStr.includes('"cvr"')) {
                            groupFields.clicks = { $sum: "$clicks" };
                        }
                        if (queryStr.includes('"impressions"') || queryStr.includes('"ctr"')) {
                            groupFields.impressions = { $sum: "$impressions" };
                        }
                    }

                    const p = [
                        {
                            $match: {
                                ...matchQuery,
                                campaignId: { $in: enabledCampIds },
                                adGroupId: { $in: enabledAgIds }
                            }
                        },
                        {
                            $group: {
                                _id: {
                                    campaignId: "$campaignId",
                                    adGroupId: "$adGroupId",
                                    keywordId: "$keywordId",
                                    searchTerm: "$searchTerm",
                                },
                                ...groupFields,
                            }
                        }
                    ];

                    if (needsDerived) {
                        p.push({
                            $addFields: {
                                acos: { $cond: [{ $gt: ["$sales", 0] }, { $round: [{ $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 2] }, 0] },
                                roas: { $cond: [{ $gt: ["$spend", 0] }, { $round: [{ $divide: ["$sales", "$spend"] }, 2] }, 0] },
                                cpc: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $divide: ["$spend", "$clicks"] }, 2] }, 0] },
                                ctr: { $cond: [{ $gt: ["$impressions", 0] }, { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] }, 0] },
                                cvr: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] }, 0] },
                            }
                        });
                    }

                    if (hasEffectiveQuery) {
                        p.push({ $match: effectiveQuery });
                    }

                    p.push({ $project: { _id: 1 } });
                    const candidates = await model.aggregate(p).allowDiskUse(true);

                    const notNewSet = new Set(notNewRecords.map(r => `${r.campaignId}_${r.adGroupId}_${r.keywordId}_${r.searchTerm}`));
                    let total = 0;
                    let newCount = 0;
                    for (const item of candidates) {
                        const id = item._id;
                        const key = `${id.adGroupId}:::${(id.searchTerm || '').toLowerCase().trim()}`;
                        if (!enabledTgtSet.has(key)) {
                            total++;
                            const notNewKey = `${id.campaignId}_${id.adGroupId}_${id.keywordId}_${id.searchTerm}`;
                            if (!notNewSet.has(notNewKey)) {
                                newCount++;
                            }
                        }
                    }

                    return {
                        rule,
                        fromDate,
                        toDate,
                        count: total,
                        newCount,
                    };
                }

                // Other rules (Targeting, Campaign, Placement)
                const pipeline = exports.recommendationPipeline(matchQuery, toDate, rule, adType, {
                    hasExistingNotNew: hasNotNew,
                    isCountOnly: true
                });

                if (!hasNotNew) {
                    pipeline.push({ $count: "count" });
                    const result = await model.aggregate(pipeline).allowDiskUse(true);
                    const total = result?.[0]?.count || 0;
                    return {
                        rule,
                        fromDate,
                        toDate,
                        count: total,
                        newCount: total,
                    };
                } else {
                    pipeline.push({
                        $facet: {
                            total: [{ $count: "count" }],
                            newCount: [{ $match: { isNew: true } }, { $count: "count" }],
                        }
                    });
                    const result = await model.aggregate(pipeline).allowDiskUse(true);
                    const total = result?.[0]?.total?.[0]?.count || 0;
                    const newCount = result?.[0]?.newCount?.[0]?.count || 0;
                    return {
                        rule,
                        fromDate,
                        toDate,
                        count: total,
                        newCount,
                    };
                }
            } catch (err) {
                recommendation_logs({ message: `[computeRecommendationCounts Rule Error] ${err?.message || err} [ruleId] ${rule?._id}`, log_type: "error" });
                return null;
            }
        })
    );

    return computedRules.filter(Boolean);
};

const inflightRecComputes = new Map();

const computeRecommendationCountsWithDedupe = async (params) => {
    const key = `${params.configId}_${params.profileId}_${params.adType}`;
    if (inflightRecComputes.has(key)) {
        return inflightRecComputes.get(key);
    }
    const promise = computeRecommendationCounts(params).finally(() => {
        inflightRecComputes.delete(key);
    });
    inflightRecComputes.set(key, promise);
    return promise;
};

exports.getRecommendation = async (req, res) => {
    const configId = req?.config?.configId;
    const profileId = req?.body?.profileId;
    const adType = req?.adType;

    try {
        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "profileId is required.",
            });
        }

        const computed = await computeRecommendationCountsWithDedupe({ configId, profileId, adType, models: req.models });

        const finalResponse = computed
            .filter((item) => item.count > 0)
            .map((item) => ({
                _id: item.rule._id,
                ...item.rule,
                ruleName: item.rule.ruleName,
                gridName: item.rule.gridName,
                actions: item.rule.actions,
                fromDate: item.fromDate,
                toDate: item.toDate,
                count: item.count,
                newCount: item.newCount,
            }));

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation data fetched successfully.",
            data: finalResponse,
        });
    } catch (error) {
        recommendation_logs({ message: `[getRecommendation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

const getTargetingRecommendationDetails = async ({ query, fromDate, toDate, rule, adType, models, processBatch, batchSize = 500 }) => {
    const { adTypeCampaignSchema, adTypeAdGroupSchema, adTypeTargetingSchema } = models;
    const scope = { configId: rule.configId, profileId: rule.profileId, reportDate: toDate };
    const pipeline = exports.recommendationPipeline(query, toDate, rule, adType, {
        hasExistingNotNew: false, isCountOnly: true,
    });
    const candidateQuery = adTypeTargetingSchema.aggregate(pipeline.slice(0, pipeline.findIndex(stage => stage.$lookup))).allowDiskUse(true);
    const [candidates, campaigns, adGroups, targets, dismissed] = await Promise.all([
        processBatch ? [] : candidateQuery,
        adTypeCampaignSchema.find(scope, { campaignId: 1, name: 1, status: 1 }).lean(),
        adTypeAdGroupSchema.find(scope, { adGroupId: 1, name: 1, status: 1 }).lean(),
        adTypeTargetingSchema.find({ ...scope, status: "ENABLED" }, {
            campaignId: 1, adGroupId: 1, targetId: 1, status: 1,
            targeting: 1, matchType: 1, keywordType: 1, keywordBid: 1,
        }).lean(),
        recommandationStatusSchema.find({
            configId: rule.configId, profileId: rule.profileId, ruleId: rule._id,
            isNew: false, reportDate: { $gte: fromDate, $lte: toDate },
        }, { campaignId: 1, adGroupId: 1, targetId: 1 }).lean(),
    ]);
    const key = (...parts) => JSON.stringify(parts);
    const firstBy = (rows, getKey) => {
        const map = new Map();
        for (const row of rows) {
            const id = getKey(row);
            if (!map.has(id)) map.set(id, row);
        }
        return map;
    };
    const campaignMap = firstBy(campaigns, row => row.campaignId);
    const adGroupMap = firstBy(adGroups, row => row.adGroupId);
    const targetMap = firstBy(targets, row => key(row.campaignId, row.adGroupId, row.targetId));
    const fallbackMap = firstBy(targets, row => key(row.campaignId, row.adGroupId, row.targeting, row.matchType));
    const dismissedSet = new Set(dismissed.map(row => key(row.campaignId, row.adGroupId, row.targetId)));
    const fields = ["profileId", "campaignId", "adGroupId", "keywordId", "placement", "targeting", "searchTerm",
        "impressions", "clicks", "orders", "spend", "sales", "budget", "placementBid", "acos", "roas", "cpc", "ctr", "cvr"];
    const items = [];
    let count = 0;
    let newCount = 0;
    const source = processBatch ? candidateQuery.cursor({ batchSize }) : candidates;
    try {
        for await (const candidate of source) {
            const id = candidate._id;
            const campaign = campaignMap.get(id.campaignId);
            const adGroup = adGroupMap.get(id.adGroupId);
            if (campaign?.status !== "ENABLED" || adGroup?.status !== "ENABLED") continue;
            const target = id.targetId != null
                ? targetMap.get(key(id.campaignId, id.adGroupId, id.targetId))
                : fallbackMap.get(key(id.campaignId, id.adGroupId, candidate.targeting, candidate.matchType));
            if (!target) continue;
            const item = { _id: id };
            for (const field of fields) {
                if (Object.prototype.hasOwnProperty.call(candidate, field)) item[field] = candidate[field];
            }
            Object.assign(item, {
                targetId: target.targetId, status: target.status, keywordType: target.keywordType,
                matchType: target.matchType, targetingBid: target.keywordBid,
                campaignName: campaign.name, campaignStatus: campaign.status,
                adGroupName: adGroup.name, adGroupStatus: adGroup.status,
                isNew: !dismissedSet.has(key(id.campaignId, id.adGroupId, id.targetId)),
            });
            items.push(item);
            count++;
            if (item.isNew) newCount++;
            if (processBatch && items.length === batchSize) {
                await processBatch(items);
                items.length = 0;
            }
        }
        if (processBatch && items.length) await processBatch(items);
    } finally {
        if (processBatch) await source.close();
    }
    if (processBatch) return { count, newCount };
    // Stable ties keep page boundaries consistent across fresh aggregations.
    return items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || key(a._id).localeCompare(key(b._id)));
};

const calculateUpdatedValue = (item, actions = [], gridName = "") => {
    if (!item) return null;

    // 1. Campaign: budget column
    if (gridName === "Campaign" || (!gridName && (item?.budget != null || item?.dailyBudget != null) && !item?.targeting && !item?.placement)) {
        const rawBudget = item?.budget != null ? item.budget : item?.dailyBudget;
        if (rawBudget == null || isNaN(parseFloat(rawBudget))) return null;
        const curr = parseFloat(rawBudget);
        const action = (actions || []).find((a) => ['SetBudget', 'IncreaseBudget', 'DecreaseBudget'].includes(a?.actionName));
        if (!action) return curr;

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBudget") next = curr + diff;
        if (action.actionName === "DecreaseBudget") next = Math.max(1, curr - diff);
        if (action.actionName === "SetBudget") next = actionVal;
        return next;
    }

    // 2. Targeting: keyword bid column
    if (gridName === "Targeting" || (!gridName && (item?.targetingBid != null || item?.keywordBid != null || item?.targeting != null))) {
        const rawBid = item?.targetingBid != null ? item.targetingBid : (item?.keywordBid != null ? item.keywordBid : item?.bid);
        if (rawBid == null || isNaN(parseFloat(rawBid))) return null;
        const curr = parseFloat(rawBid);
        const action = (actions || []).find((a) => ['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(a?.actionName));
        if (!action) return curr;

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBid") next = curr + diff;
        if (action.actionName === "DecreaseBid") next = Math.max(0.02, curr - diff);
        if (action.actionName === "SetBid") next = actionVal;
        return next;
    }

    // 3. Placement: placement bid column
    if (gridName === "Placement" || (!gridName && (item?.placement != null || item?.placementBid != null))) {
        const rawBid = item?.placementBid != null ? item.placementBid : item?.bid;
        if (rawBid == null || isNaN(parseFloat(rawBid))) return null;
        const curr = parseFloat(rawBid);
        const action = (actions || []).find((a) => a?.placementType === item?.placement || (!a?.placementType && ['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(a?.actionName)));
        if (!action) return curr;

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBid") next = curr + diff;
        if (action.actionName === "DecreaseBid") next = Math.max(0, curr - diff);
        if (action.actionName === "SetBid") next = actionVal;
        return next;
    }

    return null;
};
exports.calculateUpdatedValue = calculateUpdatedValue;

exports.getRecommendationData = async (req, res) => {
    const configId = req?.config?.configId;
    const profileId = req?.body?.profileId;
    const ruleId = req?.params?.ruleId;

    const customFromDate = req?.body?.fromDate;
    const customToDate = req?.body?.toDate;

    const { adTypeCampaignSchema, adTypeAdGroupSchema, adTypePlacementSchema, adTypeTargetingSchema, adTypeSearchTermSchema } = req.models;

    const adType = req?.adType;

    try {
        if (!ruleId) {
            return res.status(203).send({
                isSuccess: false,
                message: "ruleId is required.",
            });
        }

        /** Get Rule */
        const rule = await recommendationRuleSchema.findOne({ _id: ruleId, configId, profileId, isActive: true }).lean();
        if (!rule) {
            return res.status(203).send({ isSuccess: false, message: "Rule not found." });
        }

        /** Select model */
        let model = null;

        if (rule.gridName === "Campaign") model = adTypeCampaignSchema;
        if (rule.gridName === "Placement") model = adTypePlacementSchema;
        if (rule.gridName === "Targeting") model = adTypeTargetingSchema;
        if (rule.gridName === "Search Term") model = adTypeSearchTermSchema;

        if (!model) {
            return res.status(203).send({ isSuccess: false, message: "Invalid grid type." });
        }

        const currentDate = moment.tz(rule?.timezone).format("YYYY-MM-DD");

        /** Base Query */
        let query = { configId: rule.configId, profileId: rule.profileId };

        let fromDate;
        let toDate;

        if (customFromDate && customToDate) {
            fromDate = customFromDate;
            toDate = customToDate;
        } else {
            const ruleDates = getRuleDate(rule?.timezone, rule?.reportDate);
            fromDate = ruleDates?.fromDate;
            toDate = ruleDates?.toDate;
        }

        if (rule?.reportDate !== "LIFETIME") query.reportDate = { $gte: fromDate, $lte: toDate };
        else toDate = currentDate;

        const page = Number(req?.body?.page || req?.body?.pageNo || req?.query?.page);
        const perPage = Number(req?.body?.perPage || req?.body?.limit || req?.query?.perPage || req?.query?.limit);

        let allItems = null;
        // Always read fresh recommendation data.
        if (!allItems) {
            if (rule.gridName === "Targeting") {
                allItems = await getTargetingRecommendationDetails({ query, fromDate, toDate, rule, adType, models: req.models });
            } else if (rule.gridName === "Search Term" && adTypeCampaignSchema && adTypeAdGroupSchema && adTypeTargetingSchema) {
                const campFilter = { profileId, reportDate: toDate, status: "ENABLED" };
                if (rule?.actions?.some(a => a?.actionName === "AddAsTargeting")) {
                    campFilter.targetingType = "MANUAL";
                }

                const [enabledCampaigns, enabledAdGroups, enabledTargetings, notNewRecords] = await Promise.all([
                    adTypeCampaignSchema.find(campFilter, { campaignId: 1, name: 1, status: 1 }).lean(),
                    adTypeAdGroupSchema.find({ profileId, reportDate: toDate, status: "ENABLED" }, { adGroupId: 1, name: 1, status: 1 }).lean(),
                    adTypeTargetingSchema.find({ profileId, reportDate: toDate, status: "ENABLED" }, { campaignId: 1, adGroupId: 1, targeting: 1 }).lean(),
                    recommandationStatusSchema.find({
                        configId,
                        profileId,
                        ruleId: rule._id,
                        isNew: false,
                        reportDate: { $gte: fromDate, $lte: toDate }
                    }, { campaignId: 1, adGroupId: 1, keywordId: 1, searchTerm: 1 }).lean(),
                ]);

                const campMap = new Map(enabledCampaigns.map(c => [c.campaignId, c]));
                const agMap = new Map(enabledAdGroups.map(a => [a.adGroupId, a]));
                const enabledCampIds = Array.from(campMap.keys());
                const enabledAgIds = Array.from(agMap.keys());

                if (enabledCampIds.length === 0 || enabledAgIds.length === 0) {
                    allItems = [];
                } else {
                    const enabledTgtSet = new Set(enabledTargetings.map(t => `${t.campaignId}_${t.adGroupId}_${t.targeting}`));
                    const notNewSet = new Set(notNewRecords.map(r => `${r.campaignId}_${r.adGroupId}_${r.keywordId}_${r.searchTerm}`));

                    const effectiveQuery = getEffectiveRuleQuery(rule);
                    const hasEffectiveQuery = effectiveQuery && Object.keys(effectiveQuery).length > 0;

                    const matchStage = {
                        ...query,
                        campaignId: { $in: enabledCampIds },
                        adGroupId: { $in: enabledAgIds }
                    };

                    const candidates = await adTypeSearchTermSchema.aggregate([
                        { $match: matchStage },
                        {
                            $group: {
                                _id: {
                                    campaignId: "$campaignId",
                                    adGroupId: "$adGroupId",
                                    keywordId: "$keywordId",
                                    searchTerm: "$searchTerm",
                                    profileId: "$profileId",
                                },
                                targeting: { $first: "$targeting" },
                                keywordType: { $first: "$keywordType" },
                                matchType: { $first: "$matchType" },
                                status: { $first: "$status" },
                                impressions: { $sum: "$impressions" },
                                clicks: { $sum: "$clicks" },
                                orders: { $sum: "$orders" },
                                spend: { $sum: "$spend" },
                                sales: { $sum: "$sales" },
                            }
                        },
                        {
                            $addFields: {
                                acos: { $cond: [{ $gt: ["$sales", 0] }, { $round: [{ $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 2] }, 0] },
                                roas: { $cond: [{ $gt: ["$spend", 0] }, { $round: [{ $divide: ["$sales", "$spend"] }, 2] }, 0] },
                                cpc: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $divide: ["$spend", "$clicks"] }, 2] }, 0] },
                                ctr: { $cond: [{ $gt: ["$impressions", 0] }, { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] }, 0] },
                                cvr: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] }, 0] },
                            }
                        },
                        ...(hasEffectiveQuery ? [{ $match: effectiveQuery }] : [])
                    ]).allowDiskUse(true);

                    allItems = [];
                    for (const item of candidates) {
                        const id = item._id;
                        const tgtKey = `${id.campaignId}_${id.adGroupId}_${id.searchTerm}`;
                        if (!enabledTgtSet.has(tgtKey)) {
                            const notNewKey = `${id.campaignId}_${id.adGroupId}_${id.keywordId}_${id.searchTerm}`;
                            const isNew = !notNewSet.has(notNewKey);
                            const camp = campMap.get(id.campaignId);
                            const ag = agMap.get(id.adGroupId);
                            allItems.push({
                                _id: id,
                                campaignId: id.campaignId,
                                adGroupId: id.adGroupId,
                                targetId: null,
                                keywordId: id.keywordId,
                                placement: null,
                                targeting: item.targeting || null,
                                keywordType: item.keywordType || null,
                                matchType: item.matchType || null,
                                searchTerm: id.searchTerm,
                                profileId: id.profileId,
                                status: item.status || "ENABLED",
                                budget: null,
                                placementBid: null,
                                targetingBid: null,
                                impressions: item.impressions,
                                clicks: item.clicks,
                                orders: item.orders,
                                spend: item.spend,
                                sales: item.sales,
                                acos: item.acos,
                                roas: item.roas,
                                cpc: item.cpc,
                                ctr: item.ctr,
                                cvr: item.cvr,
                                campaignName: camp?.name || "",
                                campaignStatus: camp?.status || "",
                                adGroupName: ag?.name || "",
                                adGroupStatus: ag?.status || "",
                                isNew
                            });
                        }
                    }
                }
            } else {
                const hasNotNew = await recommandationStatusSchema.exists({
                    configId,
                    profileId,
                    ruleId: rule._id,
                    isNew: false,
                    reportDate: { $gte: fromDate, $lte: toDate }
                });
                const pipeline = this.recommendationPipeline(query, toDate, rule, adType, { hasExistingNotNew: !!hasNotNew });
                allItems = await model.aggregate(pipeline).allowDiskUse(true);
            }

            allItems.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
        }

        const filterType = req?.body?.filterType || req?.query?.filterType || "all";

        const lessThanOneList = [];
        const validList = [];

        for (const item of allItems) {
            const val = calculateUpdatedValue(item, rule?.actions, rule?.gridName);
            if (val !== null && Number(val.toFixed(2)) < 1) {
                lessThanOneList.push(item);
            } else {
                validList.push(item);
            }
        }

        let targetList = validList;
        if (filterType === "less_than_one") {
            targetList = lessThanOneList;
        } else if (filterType === "raw_all") {
            targetList = allItems;
        } else {
            targetList = validList;
        }

        const totalRecords = targetList.length;
        let data = [];
        if (page > 0 && perPage > 0) {
            const skip = (page - 1) * perPage;
            data = targetList.slice(skip, skip + perPage);
        } else {
            data = targetList;
        }

        const newItemsToUpdate = data.filter((item) => item.isNew);
        if (newItemsToUpdate.length) {
            const bulkOps = newItemsToUpdate.map((item) => ({
                updateMany: {
                    filter: {
                        configId,
                        profileId,
                        ruleId: rule._id,
                        campaignId: item?.campaignId || null,
                        adGroupId: item?.adGroupId || null,
                        targetId: item?.targetId || null,
                        keywordId: item?.keywordId || null,
                        placement: item?.placement || "",
                        targeting: item?.targeting || "",
                        searchTerm: item?.searchTerm || "",
                        isNew: true
                    },
                    update: {
                        $set: { isNew: false }
                    },
                    upsert: false,
                }
            }));
            await recommandationStatusSchema.bulkWrite(bulkOps);
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation rule data fetched successfully.",
            rule: {
                _id: rule._id,
                ...rule,
                ruleName: rule.ruleName,
                gridName: rule.gridName,
                actions: rule.actions,
                fromDate,
                toDate,
            },
            count: totalRecords,
            totalRecords,
            validCount: validList.length,
            lessThanOneCount: lessThanOneList.length,
            totalAllRecords: allItems.length,
            currentPage: page || 1,
            perPage: perPage || totalRecords,
            totalPages: page > 0 && perPage > 0 ? (Math.ceil(totalRecords / perPage) || 1) : 1,
            data,
        });
    } catch (error) {
        recommendation_logs({ message: `[getRecommendationData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

exports.fetchRecommendationData = async ({ configId, profileId, ruleId, models, adType, fromDate, toDate, onBatch, batchSize = 500 }) => {

    if (onBatch && (!Number.isInteger(batchSize) || batchSize < 1)) throw new Error("Invalid recommendation batch size.");

    const { campaignSchema, placementSchema, targetingSchema, searchTermSchema } = models;
    const { adTypeCampaignSchema, adTypePlacementSchema, adTypeTargetingSchema, adTypeSearchTermSchema } = models;

    const rule = await recommendationRuleSchema.findOne({ _id: ruleId, configId, profileId, isActive: true }).lean();

    if (!rule) throw new Error("Rule not found.");

    let model = null;

    if (rule.gridName === "Campaign") model = campaignSchema ?? adTypeCampaignSchema;
    if (rule.gridName === "Placement") model = placementSchema ?? adTypePlacementSchema;
    if (rule.gridName === "Targeting") model = targetingSchema ?? adTypeTargetingSchema;
    if (rule.gridName === "Search Term") model = searchTermSchema ?? adTypeSearchTermSchema;

    if (!model) throw new Error("Invalid grid type.");

    let query = {
        configId: rule.configId,
        profileId: rule.profileId
    };

    const currentDate = moment.tz(rule.timezone).format("YYYY-MM-DD");

    if (!fromDate || !toDate) {
        const ruleDates = getRuleDate(rule.timezone, rule.reportDate);
        fromDate = ruleDates?.fromDate;
        toDate = ruleDates?.toDate;
    }

    if (rule.reportDate !== "LIFETIME") {
        query.reportDate = { $gte: fromDate, $lte: toDate };
    } else {
        toDate = currentDate;
    }

    if (rule.gridName === "Targeting") {
        const result = await getTargetingRecommendationDetails({
            query, fromDate, toDate, rule, adType,
            processBatch: onBatch ? items => onBatch(items, { rule, fromDate, toDate }) : undefined,
            batchSize,
            models: {
                adTypeCampaignSchema: campaignSchema ?? adTypeCampaignSchema,
                adTypeAdGroupSchema: models.adGroupSchema ?? models.adTypeAdGroupSchema,
                adTypeTargetingSchema: model,
            },
        });
        if (onBatch) return { rule, fromDate, toDate, data: [], ...result };
        return { rule, fromDate, toDate, data: result, newCount: result.filter(item => item.isNew).length };
    }

    const pipeline = exports.recommendationPipeline(query, toDate, rule, adType);

    if (onBatch) {
        const cursor = model.aggregate(pipeline).allowDiskUse(true).cursor({ batchSize });
        let batch = [];
        let count = 0;
        let newCount = 0;
        try {
            for await (const item of cursor) {
                batch.push(item);
                count++;
                if (item.isNew) newCount++;
                if (batch.length === batchSize) {
                    await onBatch(batch, { rule, fromDate, toDate });
                    batch = [];
                }
            }
            if (batch.length) await onBatch(batch, { rule, fromDate, toDate });
        } finally {
            await cursor.close();
        }
        return { rule, fromDate, toDate, data: [], count, newCount };
    }

    pipeline.push({ $facet: { data: [], newCount: [{ $match: { isNew: true } }, { $count: "count" }] } });

    const result = await model.aggregate(pipeline).allowDiskUse(true);

    const data = result?.[0]?.data || [];
    const newCount = result?.[0]?.newCount?.[0]?.count || 0;

    return {
        rule,
        fromDate,
        toDate,
        data,
        newCount,
    };
};

exports.getTotalRecommendationCount = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const profileId = req?.body?.profileId;
        const adType = req?.adType;

        if (!profileId) {
            return res.status(203).send({ isSuccess: false, message: "profileId is required." });
        }

        const computed = await computeRecommendationCountsWithDedupe({ configId, profileId, adType, models: req.models });

        if (!computed.length) {
            return res.status(200).send({
                isSuccess: true,
                message: "No active rules found.",
                totalRules: 0,
                rulesWithNew: 0,
                totalNewCount: 0,
            });
        }

        const results = computed.map((item) => ({
            ruleId: item.rule._id,
            ruleName: item.rule.ruleName,
            gridName: item.rule.gridName,
            count: item.count,
            newCount: item.newCount,
        }));

        const rulesWithNew = results.filter((r) => r.newCount > 0).length;
        const totalNewCount = results.reduce((sum, r) => sum + r.newCount, 0);

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation count fetched successfully.",
            totalRules: results.length,
            rulesWithNew,
            totalNewCount,
            rules: results,
        });

    } catch (error) {
        recommendation_logs({ message: `[getTotalRecommendationCount Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};


exports.deleteRecommendation = async (req, res) => {
    const configId = req?.config?.configId;
    const profileId = req?.body?.profileId;
    const ruleId = req?.params?.ruleId;

    try {
        if (!ruleId) {
            return res.status(203).send({
                isSuccess: false,
                message: "ruleId is required.",
            });
        }

        if (!profileId) {
            return res.status(203).send({ isSuccess: false, message: "profileId is required." });
        }

        // Bound payload size and await each batch before requesting more rows.
        let deletionTime;
        const persistBatch = async (data, { rule }) => {
            deletionTime ??= moment.tz(rule?.timezone);
            const currentDate = deletionTime.format("YYYY-MM-DD");
            const currentTime = deletionTime.format("HH:mm:ss");
            const auditEntries = data.map((item) => ({
                event: "RECOMMENDATION_DISMISSED",
                message: `Recommendation dismissed: ${rule?.ruleName}`,
                userId: req?.user?.id,
                metadata: {
                    ruleName: rule?.ruleName,
                    gridName: rule?.gridName,
                    fromDate: rule?.fromDate,
                    toDate: rule?.toDate,
                    campaignName: item?.campaignName || null,
                    adGroupName: item?.adGroupName || null,
                    keywordType: item?.keywordType || null,
                    targeting: item?.targeting || null,
                    matchType: item?.matchType || null,
                    placement: item?.placement || null,
                    searchTerm: item?.searchTerm || null,
                    budget: item?.budget || null,
                    placementBid: item?.placementBid || null,
                    targetingBid: item?.targetingBid || null,
                    impressions: item?.impressions || null,
                    clicks: item?.clicks || null,
                    spend: item?.spend || null,
                    sales: item?.sales || null,
                    cpc: item?.cpc || null,
                    ctr: item?.ctr || null,
                    cvr: item?.cvr || null,
                    orders: item?.orders || null,
                    acos: item?.acos || null,
                    roas: item?.roas || null
                },
            }));

            // 2. Prepare bulk insert/update rows
            const bulkOps = data.map((item) => ({
                updateOne: {
                    filter: {
                        configId: rule.configId,
                        profileId: rule.profileId,
                        userId: rule.userId,
                        ruleSchema: rule.gridName,
                        ruleId: rule._id,
                        ruleDate: currentDate,
                        ruleTime: currentTime,
                        type: req?.adType,
                        campaignId: item?.campaignId || null,
                        adGroupId: item?.adGroupId || null,
                        keywordId: item?.keywordId || null,
                        targetId: item?.targetId || null,
                        placement: item?.placement || null,
                        searchTerm: item?.searchTerm || null
                    },
                    update: {
                        $set: {
                            name: item?.campaignName || item?.name || "",
                            adGroupName: item?.adGroupName || "",
                            targetName: item?.targeting || "",
                            targetType: item?.matchType || "",
                            changed: "Deleted",
                            oldValue: "",
                            newValue: "",
                            isDeleted: true
                        }
                    },
                    upsert: true
                }
            }));

            // 3. Insert all rows
            if (bulkOps.length) {
                await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);
                await logAuditBatch(auditEntries);
            }

        };
        await exports.fetchRecommendationData({
            configId, profileId, ruleId, models: req?.models, adType: req?.adType,
            batchSize: 500, onBatch: persistBatch,
        });

        if (typeof recommendationRuleSchema?.findOneAndDelete === "function") {
            const deletedRule = await recommendationRuleSchema.findOneAndDelete({
                _id: ruleId,
                ...(configId && { configId }),
            });
            if (deletedRule && typeof logAudit === "function") {
                await logAudit("RECOMMENDATION_RULE_DELETION", `Deleted recommendation rule: ${deletedRule?.ruleName}`, {
                    ruleName: deletedRule?.ruleName,
                }, req?.user?.id);
            }
        }

        if (typeof recommandationStatusSchema?.deleteMany === "function") {
            await recommandationStatusSchema.deleteMany({ ruleId });
        }
        if (typeof recommandationCampaignByRuleSchema?.deleteMany === "function") {
            await recommandationCampaignByRuleSchema.deleteMany({ ruleId });
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation deleted successfully.",
        });

    } catch (error) {
        recommendation_logs({ message: `[deleteRecommendation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

exports.applyRuleRecommendation = async (req, res) => {
    const configId = req?.config?.configId;
    const ruleId = req?.params?.ruleId;
    const { profileId, items = [] } = req?.body
    const adType = req?.adType;

    try {
        if (!ruleId) return res.status(203).send({ isSuccess: false, message: "Rule Id is required." });

        const rule = await recommendationRuleSchema.findOne({ _id: ruleId, configId, profileId, isActive: true, isDeleted: false, }).lean();
        if (!rule) return res.status(203).send({ isSuccess: false, message: "Rule not found." });

        const profile = await getProfile(configId, profileId);
        if (!profile) return res.status(203).send({ isSuccess: false, message: "Profile not found." });

        const checkConfigAds = await getAccessToken(configId);
        if (!checkConfigAds) return res.status(203).send({ isSuccess: false, message: "Access token not found. Please try again later." });

        if (!items.length) return res.status(203).send({ isSuccess: false, message: "Items not found." });

        let result = [];

        const auditEntries = items.map((item) => ({
            event: "RECOMMENDATION_APPLIED",
            message: `Recommendation applied: ${rule?.ruleName}`,
            userId: req?.user?.id,
            metadata: {
                ruleName: rule?.ruleName,
                gridName: rule?.gridName,
                fromDate: rule?.fromDate,
                toDate: rule?.toDate,
                campaignName: item?.campaignName || null,
                adGroupName: item?.adGroupName || null,
                keywordType: item?.keywordType || null,
                targeting: item?.targeting || null,
                matchType: item?.matchType || null,
                placement: item?.placement || null,
                searchTerm: item?.searchTerm || null,
                budget: item?.budget || null,
                placementBid: item?.placementBid || null,
                targetingBid: item?.targetingBid || null,
                impressions: item?.impressions || null,
                clicks: item?.clicks || null,
                spend: item?.spend || null,
                sales: item?.sales || null,
                cpc: item?.cpc || null,
                ctr: item?.ctr || null,
                cvr: item?.cvr || null,
                orders: item?.orders || null,
                acos: item?.acos || null,
                roas: item?.roas || null,
                targetId: item?.targetId || null,
            }
        }));

        if (auditEntries.length) {
            await logAuditBatch(auditEntries);
        }

        /** Grid based handler */
        if (rule?.gridName === "Campaign") {
            result = await applyCampaignRecommendation(rule, items, profile, checkConfigAds, adType);
        }

        if (rule.gridName === "Placement") {
            result = await applyPlacementRecommendation(rule, items, profile, checkConfigAds, adType);
        }

        if (rule.gridName === "Targeting") {
            result = await applyTargetingRecommendation(rule, items, profile, checkConfigAds, adType);
        }

        if (rule.gridName === "Search Term") {
            result = await applySearchTermRecommendation(rule, items, profile, checkConfigAds, adType);
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Recommendation applied successfully.",
            data: result,
        });

    } catch (error) {
        recommendation_logs({ message: `[applyRuleRecommendation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred",
        });
    }
};

const chunkArray = (array, size = 1000) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
};

const SP_PLACEMENT_MAP = {
    "Top of Search": "PLACEMENT_TOP",
    "Rest of Search": "PLACEMENT_REST_OF_SEARCH",
    "Product pages": "PLACEMENT_PRODUCT_PAGE",
    "Product Page": "PLACEMENT_PRODUCT_PAGE",
};

const applyCampaignRecommendation = async (rule, items, profile, checkConfigAds, adType) => {
    const action = rule?.actions?.[0] ?? null;
    if (!action) return { isSuccess: false, message: "No action found" };

    const budgetThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "budgetRuleSetting");
    const now = moment().tz(profile.timezone || "UTC");
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let results = [];

    // ─── BUDGET ACTIONS (SetBudget, IncreaseBudget, DecreaseBudget) ─────────
    if (['SetBudget', 'IncreaseBudget', 'DecreaseBudget'].includes(action?.actionName)) {
        const validCampaigns = [];

        for (const item of items) {
            let actionValue = parseFloat(action?.actionValue ?? 0);
            if (action?.actionValueType === "Percentage") {
                actionValue = (parseFloat(item?.budget ?? 0) * actionValue) / 100;
            }
            if (action?.actionName === "IncreaseBudget") {
                actionValue = parseFloat(item?.budget ?? 0) + actionValue;
            }
            if (action?.actionName === "DecreaseBudget") {
                actionValue = parseFloat(item?.budget ?? 0) - actionValue;
            }
            if (budgetThreshold?.maxBudget && actionValue > budgetThreshold?.maxBudget) {
                actionValue = budgetThreshold?.maxBudget;
            }
            if (budgetThreshold?.minBudget && actionValue < budgetThreshold?.minBudget) {
                actionValue = budgetThreshold?.minBudget;
            }
            if (actionValue < 1) actionValue = 1;
            actionValue = parseFloat(Number(actionValue).toFixed(2));

            if (actionValue > 0) {
                validCampaigns.push({ item, actionValue });
            }
        }

        if (!validCampaigns.length) {
            return { isSuccess: false, message: "No valid campaign budget adjustments found" };
        }

        if (adType === "SP") {
            const chunks = chunkArray(validCampaigns, 1000);
            for (const chunk of chunks) {
                try {
                    const payload = {
                        campaigns: chunk.map(({ item, actionValue }) => ({
                            campaignId: String(item.campaignId),
                            budget: { budget: actionValue, budgetType: "DAILY" },
                        }))
                    };
                    const response = await retryWithBackoff(() => amazonAxios({
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
                        data: payload,
                        meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                    }));

                    if (response?.status === 207 || response?.status === 200) {
                        const bulkOps = chunk.map(({ item, actionValue }) => ({
                            updateOne: {
                                filter: {
                                    configId: rule.configId,
                                    profileId: rule.profileId,
                                    userId: rule.userId,
                                    ruleSchema: "Campaign",
                                    ruleId: rule?._id,
                                    ruleDate: currentDate,
                                    ruleTime: currentTime,
                                    type: "SP",
                                    campaignId: item?.campaignId
                                },
                                update: {
                                    $set: {
                                        name: item?.campaignName,
                                        oldValue: item?.budget,
                                        newValue: actionValue,
                                        changed: "Budget"
                                    }
                                },
                                upsert: true
                            }
                        }));
                        await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                        const historyDocs = chunk.map(({ item, actionValue }) => ({
                            configId: profile?.configId,
                            profileId: profile?.profileId,
                            changeLevel: item?.campaignId,
                            changeType: "Update Camapign Budget",
                            oldValue: item?.budget,
                            newValue: actionValue,
                            updatedFrom: "Campaign",
                            userId: rule?.userId,
                            type: "SP",
                            source: "RECOMMENDATION",
                            createdAt: new Date(),
                        }));
                        await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                        const campBulkOps = chunk.map(({ item, actionValue }) => ({
                            updateOne: {
                                filter: {
                                    configId: profile?.configId,
                                    profileId: profile?.profileId,
                                    campaignId: item?.campaignId,
                                    reportDate: currentDate,
                                },
                                update: {
                                    $set: { dailyBudget: actionValue }
                                }
                            }
                        }));
                        await campaignSchema.bulkWrite(campBulkOps).catch(() => {});

                        results.push({ isSuccess: true, count: chunk.length });
                    } else {
                        results.push({ isSuccess: false, count: chunk.length, message: `Status: ${response?.status}` });
                    }
                } catch (err) {
                    recommendation_logs({
                        log_type: "error",
                        message: `[applyCampaignRecommendation SP Budget Batch Error] ${err?.message || err}`
                    });
                    results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                }
            }
        } else {
            for (const { item, actionValue } of validCampaigns) {
                const res = adType === "SB"
                    ? await CampaignSBBudget(profile, checkConfigAds, rule, item, actionValue)
                    : await CampaignSDBudget(profile, checkConfigAds, rule, item, actionValue);
                results.push(res);
            }
        }
    }
    // ─── STATUS ACTIONS (CampaignEnable, CampaignPause) ─────────────────────
    else if (['CampaignEnable', 'CampaignPause'].includes(action?.actionName)) {
        const newStatus = action?.actionName === "CampaignEnable" ? "ENABLED" : "PAUSED";

        if (adType === "SP") {
            const chunks = chunkArray(items, 1000);
            for (const chunk of chunks) {
                try {
                    const payload = {
                        campaigns: chunk.map(item => ({
                            campaignId: String(item.campaignId),
                            state: newStatus
                        }))
                    };
                    const response = await retryWithBackoff(() => amazonAxios({
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
                        data: payload,
                        meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                    }));

                    if (response?.status === 207 || response?.status === 200) {
                        const bulkOps = chunk.map(item => ({
                            updateOne: {
                                filter: {
                                    configId: rule.configId,
                                    profileId: rule.profileId,
                                    userId: rule.userId,
                                    ruleSchema: "Campaign",
                                    ruleId: rule?._id,
                                    ruleDate: currentDate,
                                    ruleTime: currentTime,
                                    type: "SP",
                                    campaignId: item?.campaignId
                                },
                                update: {
                                    $set: {
                                        name: item?.campaignName,
                                        oldValue: item?.campaignStatus || item?.status,
                                        newValue: newStatus,
                                        changed: "Status"
                                    }
                                },
                                upsert: true
                            }
                        }));
                        await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                        const historyDocs = chunk.map(item => ({
                            configId: profile?.configId,
                            profileId: profile?.profileId,
                            changeLevel: item?.campaignId,
                            changeType: "Update Campaign Status",
                            oldValue: item?.campaignStatus || item?.status,
                            newValue: newStatus,
                            updatedFrom: "Campaign",
                            userId: rule?.userId,
                            type: "SP",
                            source: "RECOMMENDATION",
                            createdAt: new Date(),
                        }));
                        await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                        const campBulkOps = chunk.map(item => ({
                            updateOne: {
                                filter: {
                                    configId: profile?.configId,
                                    profileId: profile?.profileId,
                                    campaignId: item?.campaignId,
                                    reportDate: currentDate,
                                },
                                update: {
                                    $set: { state: newStatus, status: newStatus }
                                }
                            }
                        }));
                        await campaignSchema.bulkWrite(campBulkOps).catch(() => {});

                        results.push({ isSuccess: true, count: chunk.length });
                    } else {
                        results.push({ isSuccess: false, count: chunk.length, message: `Status: ${response?.status}` });
                    }
                } catch (err) {
                    recommendation_logs({
                        log_type: "error",
                        message: `[applyCampaignRecommendation SP Status Batch Error] ${err?.message || err}`
                    });
                    results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                }
            }
        } else {
            for (const item of items) {
                const res = adType === "SB"
                    ? await CampaignSBStatus(profile, checkConfigAds, rule, item, newStatus)
                    : await CampaignSDStatus(profile, checkConfigAds, rule, item, newStatus);
                results.push(res);
            }
        }
    } else {
        return { isSuccess: false, message: "Invalid action type" };
    }

    const hasAnyError = results.some(r => r.isSuccess === false);
    const hasAnySuccess = results.some(r => r.isSuccess === true);
    if (hasAnySuccess && !hasAnyError) {
        return { isSuccess: true, message: `All ${items.length} campaign(s) updated successfully` };
    } else if (hasAnySuccess && hasAnyError) {
        return { isSuccess: true, message: `Campaigns updated with some partial errors` };
    } else {
        return { isSuccess: false, message: `Failed to update campaign(s)` };
    }
};

const computeBidValue = (currentBid, action, bidThreshold) => {
    let actionValue = parseFloat(action?.actionValue ?? 0);
    const base = parseFloat(currentBid ?? 0);

    if (action?.actionValueType === "Percentage") {
        actionValue = (base * actionValue) / 100;
    }

    if (action?.actionName === "IncreaseBid") actionValue = base + actionValue;
    if (action?.actionName === "DecreaseBid") actionValue = base - actionValue;
    if (action?.actionName === "SetBid") actionValue = actionValue;

    if (bidThreshold?.maxBid && actionValue > bidThreshold?.maxBid) actionValue = bidThreshold?.maxBid;
    if (bidThreshold?.minBid && actionValue < bidThreshold?.minBid) actionValue = bidThreshold?.minBid;

    return parseInt(actionValue, 10);
};

const applyPlacementRecommendation = async (rule, items, profile, checkConfigAds, adType) => {
    const actions = rule?.actions ?? [];
    const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "placementRuleSetting");
    const now = moment().tz(profile.timezone || "UTC");
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    const validEntries = [];
    for (const item of items) {
        const action = actions.find((a) => a?.placementType === item?.placement) ?? null;
        if (!action) continue;
        if (["IncreaseBid", "DecreaseBid", "SetBid"].includes(action?.actionName)) {
            const newBid = computeBidValue(item?.placementBid, action, bidThreshold);
            if (newBid >= 0) {
                const placementPredicate = SP_PLACEMENT_MAP[item?.placement] || item?.placement;
                validEntries.push({ item, action, newBid, placementPredicate });
            }
        }
    }

    if (!validEntries.length) {
        return { isSuccess: false, message: "No valid placement adjustments found" };
    }

    let results = [];

    if (adType === "SP") {
        const chunks = chunkArray(validEntries, 1000);
        for (const chunk of chunks) {
            try {
                const payload = {
                    campaigns: chunk.map(({ item, placementPredicate, newBid }) => ({
                        campaignId: String(item.campaignId),
                        dynamicBidding: {
                            placementBidding: [
                                { placement: placementPredicate, percentage: newBid }
                            ]
                        }
                    }))
                };
                const response = await retryWithBackoff(() => amazonAxios({
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
                    data: payload,
                    meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                }));

                if (response?.status === 207 || response?.status === 200) {
                    const bulkOps = chunk.map(({ item, newBid }) => ({
                        updateOne: {
                            filter: {
                                configId: rule?.configId,
                                profileId: rule?.profileId,
                                userId: rule?.userId,
                                ruleSchema: "Placement",
                                ruleId: rule?._id,
                                ruleDate: currentDate,
                                ruleTime: currentTime,
                                type: "SP",
                                campaignId: item?.campaignId,
                                placement: item?.placement,
                            },
                            update: {
                                $set: {
                                    name: item?.campaignName,
                                    oldValue: item?.placementBid,
                                    newValue: newBid,
                                    changed: "PlacementBid",
                                }
                            },
                            upsert: true
                        }
                    }));
                    await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                    const historyDocs = chunk.map(({ item, newBid }) => ({
                        configId: profile?.configId,
                        profileId: profile?.profileId,
                        changeLevel: item?.campaignId,
                        changeType: `Update ${item?.placement || "Placement"} Placement Bid`,
                        oldValue: item?.placementBid,
                        newValue: newBid,
                        updatedFrom: "Placement",
                        userId: rule?.userId,
                        type: "SP",
                        source: "RECOMMENDATION",
                        createdAt: new Date(),
                    }));
                    await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                    const placementBulkOps = chunk.map(({ item, newBid }) => ({
                        updateOne: {
                            filter: {
                                configId: profile?.configId,
                                profileId: profile?.profileId,
                                campaignId: item?.campaignId,
                                placement: item?.placement,
                                reportDate: currentDate,
                            },
                            update: {
                                $set: { percentage: newBid }
                            }
                        }
                    }));
                    await placementSchema.bulkWrite(placementBulkOps).catch(() => {});

                    results.push({ isSuccess: true, count: chunk.length });
                } else {
                    results.push({ isSuccess: false, count: chunk.length, message: `Status: ${response?.status}` });
                }
            } catch (err) {
                recommendation_logs({
                    log_type: "error",
                    message: `[applyPlacementRecommendation SP Batch Error] ${err?.message || err}`
                });
                results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
            }
        }
    } else {
        for (const { item, newBid } of validEntries) {
            const res = await PlacementSBBid(profile, checkConfigAds, rule, item, newBid);
            results.push(res);
        }
    }

    const hasAnyError = results.some(r => r.isSuccess === false);
    const hasAnySuccess = results.some(r => r.isSuccess === true);
    if (hasAnySuccess && !hasAnyError) {
        return { isSuccess: true, message: `All ${validEntries.length} placement(s) updated successfully` };
    } else if (hasAnySuccess && hasAnyError) {
        return { isSuccess: true, message: `Placement(s) updated with some partial errors` };
    } else {
        return { isSuccess: false, message: `Failed to update placement(s)` };
    }
};

const applyTargetingRecommendation = async (rule, items, profile, checkConfigAds, adType) => {
    const action = rule?.actions?.[0] ?? null;
    if (!action) return { isSuccess: false, message: "No action found" };

    const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "targetingRuleSetting");
    const now = moment().tz(profile.timezone || "UTC");
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let results = [];

    // ─── BID ACTIONS (IncreaseBid, DecreaseBid, SetBid) ─────────────────────
    if (['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(action?.actionName)) {
        const validEntries = [];
        const marketMin = getMarketplaceMinBid(profile?.currencyCode, profile?.countryCode);
        const minAllowed = Math.max(marketMin, (bidThreshold?.minBid && Number(bidThreshold.minBid) > 0) ? Number(bidThreshold.minBid) : marketMin);

        for (const item of items) {
            let actionValue = parseFloat(action?.actionValue ?? 0);
            if (action?.actionValueType === "Percentage") {
                actionValue = (parseFloat(item?.targetingBid ?? 0) * actionValue) / 100;
            }
            if (action?.actionName === "IncreaseBid") actionValue = parseFloat(item?.targetingBid ?? 0) + actionValue;
            if (action?.actionName === "DecreaseBid") actionValue = parseFloat(item?.targetingBid ?? 0) - actionValue;

            if (bidThreshold?.maxBid && actionValue > Number(bidThreshold.maxBid)) actionValue = Number(bidThreshold.maxBid);
            if (actionValue < minAllowed) actionValue = minAllowed;
            actionValue = parseFloat(Number(actionValue).toFixed(2));

            validEntries.push({ item, actionValue });
        }

        if (adType === "SP") {
            const targetEntries = validEntries.filter(e => e.item?.targetId?.startsWith("T-"));
            const keywordEntries = validEntries.filter(e => e.item?.targetId?.startsWith("K-"));

            if (targetEntries.length) {
                const chunks = chunkArray(targetEntries, 1000);
                for (const chunk of chunks) {
                    try {
                        const payload = {
                            targetingClauses: chunk.map(({ item, actionValue }) => ({
                                targetId: item.targetId.replace("T-", ""),
                                bid: Number(actionValue)
                            }))
                        };
                        const response = await retryWithBackoff(() => amazonAxios({
                            method: "PUT",
                            url: `${profile.amazonUrl}/sp/targets`,
                            headers: {
                                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                "Amazon-Advertising-API-Scope": profile.profileId,
                                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                "Content-Type": "application/vnd.sptargetingClause.v3+json",
                                "Accept": "application/vnd.sptargetingClause.v3+json",
                            },
                            data: payload,
                            meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                        }));
                        if (response?.status === 207 || response?.status === 200) {
                            const bulkOps = chunk.map(({ item, actionValue }) => ({
                                updateOne: {
                                    filter: {
                                        configId: rule?.configId,
                                        profileId: rule?.profileId,
                                        userId: rule?.userId,
                                        ruleSchema: "Targeting",
                                        ruleId: rule?._id,
                                        ruleDate: currentDate,
                                        ruleTime: currentTime,
                                        type: "SP",
                                        campaignId: item?.campaignId,
                                        adGroupId: item?.adGroupId,
                                        targetId: item?.targetId,
                                    },
                                    update: {
                                        $set: {
                                            name: item?.campaignName,
                                            adGroupName: item?.adGroupName,
                                            oldValue: item?.targetingBid,
                                            newValue: actionValue,
                                            changed: "TargetingBid",
                                        }
                                    },
                                    upsert: true
                                }
                            }));
                            await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                            const historyDocs = chunk.map(({ item, actionValue }) => ({
                                configId: profile?.configId,
                                profileId: profile?.profileId,
                                changeLevel: item?.campaignId,
                                changeType: "Update Target Bid",
                                oldValue: item?.targetingBid,
                                newValue: actionValue,
                                updatedFrom: "Targeting",
                                userId: rule?.userId,
                                type: "SP",
                                source: "RECOMMENDATION",
                                createdAt: new Date(),
                            }));
                            await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                            results.push({ isSuccess: true, count: chunk.length });
                        } else {
                            results.push({ isSuccess: false, count: chunk.length, message: `Status: ${response?.status}` });
                        }
                    } catch (err) {
                        recommendation_logs({
                            log_type: "error",
                            message: `[applyTargetingRecommendation SP Target Bid Batch Error] ${err?.message || err}`
                        });
                        results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                    }
                }
            }

            if (keywordEntries.length) {
                const chunks = chunkArray(keywordEntries, 1000);
                for (const chunk of chunks) {
                    try {
                        const payload = {
                            keywords: chunk.map(({ item, actionValue }) => ({
                                keywordId: item.targetId.replace("K-", ""),
                                bid: Number(actionValue)
                            }))
                        };
                        const response = await retryWithBackoff(() => amazonAxios({
                            method: "PUT",
                            url: `${profile.amazonUrl}/sp/keywords`,
                            headers: {
                                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                "Amazon-Advertising-API-Scope": profile.profileId,
                                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                "Content-Type": "application/vnd.spKeyword.v3+json",
                                "Accept": "application/vnd.spKeyword.v3+json",
                            },
                            data: payload,
                            meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                        }));
                        if (response?.status === 207 || response?.status === 200) {
                            const bulkOps = chunk.map(({ item, actionValue }) => ({
                                updateOne: {
                                    filter: {
                                        configId: rule?.configId,
                                        profileId: rule?.profileId,
                                        userId: rule?.userId,
                                        ruleSchema: "Targeting",
                                        ruleId: rule?._id,
                                        ruleDate: currentDate,
                                        ruleTime: currentTime,
                                        type: "SP",
                                        campaignId: item?.campaignId,
                                        adGroupId: item?.adGroupId,
                                        targetId: item?.targetId,
                                    },
                                    update: {
                                        $set: {
                                            name: item?.campaignName,
                                            adGroupName: item?.adGroupName,
                                            oldValue: item?.targetingBid,
                                            newValue: actionValue,
                                            changed: "TargetingBid",
                                        }
                                    },
                                    upsert: true
                                }
                            }));
                            await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                            const historyDocs = chunk.map(({ item, actionValue }) => ({
                                configId: profile?.configId,
                                profileId: profile?.profileId,
                                changeLevel: item?.campaignId,
                                changeType: "Update Target Bid",
                                oldValue: item?.targetingBid,
                                newValue: actionValue,
                                updatedFrom: "Targeting",
                                userId: rule?.userId,
                                type: "SP",
                                source: "RECOMMENDATION",
                                createdAt: new Date(),
                            }));
                            await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                            results.push({ isSuccess: true, count: chunk.length });
                        } else {
                            results.push({ isSuccess: false, count: chunk.length, message: `Status: ${response?.status}` });
                        }
                    } catch (err) {
                        recommendation_logs({
                            log_type: "error",
                            message: `[applyTargetingRecommendation SP Keyword Bid Batch Error] ${err?.message || err}`
                        });
                        results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                    }
                }
            }
        } else {
            for (const { item, actionValue } of validEntries) {
                const res = adType === "SB"
                    ? await TargetingSBBid(profile, checkConfigAds, rule, item, actionValue)
                    : await TargetingSDBid(profile, checkConfigAds, rule, item, actionValue);
                results.push(res);
            }
        }
    }
    // ─── STATUS ACTIONS (EnableTargeting, PauseTargeting) ───────────────────
    else if (['EnableTargeting', 'PauseTargeting'].includes(action?.actionName)) {
        const newStatus = action?.actionName === "EnableTargeting" ? "ENABLED" : "PAUSED";

        if (adType === "SP") {
            const targetEntries = items.filter(it => it?.targetId?.startsWith("T-"));
            const keywordEntries = items.filter(it => it?.targetId?.startsWith("K-"));

            if (targetEntries.length) {
                const chunks = chunkArray(targetEntries, 1000);
                for (const chunk of chunks) {
                    try {
                        const payload = {
                            targetingClauses: chunk.map(item => ({
                                targetId: item.targetId.replace("T-", ""),
                                state: newStatus
                            }))
                        };
                        const response = await retryWithBackoff(() => amazonAxios({
                            method: "PUT",
                            url: `${profile.amazonUrl}/sp/targets`,
                            headers: {
                                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                "Amazon-Advertising-API-Scope": profile.profileId,
                                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                "Content-Type": "application/vnd.sptargetingClause.v3+json",
                                "Accept": "application/vnd.sptargetingClause.v3+json",
                            },
                            data: payload,
                            meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                        }));
                        if (response?.status === 207 || response?.status === 200) {
                            const bulkOps = chunk.map(item => ({
                                updateOne: {
                                    filter: {
                                        configId: rule?.configId,
                                        profileId: rule?.profileId,
                                        userId: rule?.userId,
                                        ruleSchema: "Targeting",
                                        ruleId: rule?._id,
                                        ruleDate: currentDate,
                                        ruleTime: currentTime,
                                        type: "SP",
                                        campaignId: item?.campaignId,
                                        adGroupId: item?.adGroupId,
                                        targetId: item?.targetId,
                                    },
                                    update: {
                                        $set: {
                                            name: item?.campaignName,
                                            adGroupName: item?.adGroupName,
                                            oldValue: item?.keywordStatus || item?.status,
                                            newValue: newStatus,
                                            changed: "TargetingStatus",
                                        }
                                    },
                                    upsert: true
                                }
                            }));
                            await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                            const historyDocs = chunk.map(item => ({
                                configId: profile?.configId,
                                profileId: profile?.profileId,
                                changeLevel: item?.campaignId,
                                changeType: "Update Target Status",
                                oldValue: item?.keywordStatus || item?.status,
                                newValue: newStatus,
                                updatedFrom: "Targeting",
                                userId: rule?.userId,
                                type: "SP",
                                source: "RECOMMENDATION",
                                createdAt: new Date(),
                            }));
                            await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                            results.push({ isSuccess: true, count: chunk.length });
                        } else {
                            results.push({ isSuccess: false, count: chunk.length, message: `Status: ${response?.status}` });
                        }
                    } catch (err) {
                        recommendation_logs({
                            log_type: "error",
                            message: `[applyTargetingRecommendation SP Target Status Batch Error] ${err?.message || err}`
                        });
                        results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                    }
                }
            }

            if (keywordEntries.length) {
                const chunks = chunkArray(keywordEntries, 1000);
                for (const chunk of chunks) {
                    try {
                        const payload = {
                            keywords: chunk.map(item => ({
                                keywordId: item.targetId.replace("K-", ""),
                                state: newStatus
                            }))
                        };
                        const response = await retryWithBackoff(() => amazonAxios({
                            method: "PUT",
                            url: `${profile.amazonUrl}/sp/keywords`,
                            headers: {
                                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                "Amazon-Advertising-API-Scope": profile.profileId,
                                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                "Content-Type": "application/vnd.spKeyword.v3+json",
                                "Accept": "application/vnd.spKeyword.v3+json",
                            },
                            data: payload,
                            meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                        }));
                        if (response?.status === 207 || response?.status === 200) {
                            const bulkOps = chunk.map(item => ({
                                updateOne: {
                                    filter: {
                                        configId: rule?.configId,
                                        profileId: rule?.profileId,
                                        userId: rule?.userId,
                                        ruleSchema: "Targeting",
                                        ruleId: rule?._id,
                                        ruleDate: currentDate,
                                        ruleTime: currentTime,
                                        type: "SP",
                                        campaignId: item?.campaignId,
                                        adGroupId: item?.adGroupId,
                                        targetId: item?.targetId,
                                    },
                                    update: {
                                        $set: {
                                            name: item?.campaignName,
                                            adGroupName: item?.adGroupName,
                                            oldValue: item?.keywordStatus || item?.status,
                                            newValue: newStatus,
                                            changed: "TargetingStatus",
                                        }
                                    },
                                    upsert: true
                                }
                            }));
                            await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                            const historyDocs = chunk.map(item => ({
                                configId: profile?.configId,
                                profileId: profile?.profileId,
                                changeLevel: item?.campaignId,
                                changeType: "Update Target Status",
                                oldValue: item?.keywordStatus || item?.status,
                                newValue: newStatus,
                                updatedFrom: "Targeting",
                                userId: rule?.userId,
                                type: "SP",
                                source: "RECOMMENDATION",
                                createdAt: new Date(),
                            }));
                            await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                            results.push({ isSuccess: true, count: chunk.length });
                        } else {
                            results.push({ isSuccess: false, count: chunk.length, message: `Status: ${response?.status}` });
                        }
                    } catch (err) {
                        recommendation_logs({
                            log_type: "error",
                            message: `[applyTargetingRecommendation SP Keyword Status Batch Error] ${err?.message || err}`
                        });
                        results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                    }
                }
            }
        } else {
            for (const item of items) {
                const res = adType === "SB"
                    ? await TargetingSBStatus(profile, checkConfigAds, rule, item, newStatus)
                    : await TargetingSDStatus(profile, checkConfigAds, rule, item, newStatus);
                results.push(res);
            }
        }
    } else {
        return { isSuccess: false, message: "Invalid action type" };
    }

    const hasAnyError = results.some(r => r.isSuccess === false);
    const hasAnySuccess = results.some(r => r.isSuccess === true);
    if (hasAnySuccess && !hasAnyError) {
        return { isSuccess: true, message: `All ${items.length} targeting(s) updated successfully` };
    } else if (hasAnySuccess && hasAnyError) {
        return { isSuccess: true, message: `Targeting(s) updated with some partial errors` };
    } else {
        return { isSuccess: false, message: `Failed to update targeting(s)` };
    }
};

const applySearchTermRecommendation = async (rule, items, profile, checkConfigAds, adType) => {
    const actions = rule?.actions ?? [];

    recommendation_logs({
        log_type: "info",
        message: `[ApplySearchTermRecommendation Start] RuleId: ${rule?._id} | AdType: ${adType} | ProfileId: ${profile?.profileId} | ItemsCount: ${items?.length} | ActionsCount: ${actions?.length}`
    });

    const now = moment().tz(profile.timezone || "UTC");
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let results = [];

    if (!actions.length) {
        return { isSuccess: false, message: "No actions configured for this rule" };
    }

    for (const action of actions) {
        const rawMatch = (action?.matchType || "EXACT").toUpperCase();
        const asinItems = items.filter(it => it && it.campaignId && isValidASIN(it?.searchTerm));
        const keywordItems = items.filter(it => it && it.campaignId && !isValidASIN(it?.searchTerm));

        let successfulItems = [];

        // ─── AddAsNegativeTargeting ──────────────────────────────────────
        if (action?.actionName === "AddAsNegativeTargeting") {
            const spNegativeMatchType = rawMatch.includes("PHRASE") ? "NEGATIVE_PHRASE" : "NEGATIVE_EXACT";
            const sbNegativeMatchType = rawMatch.includes("PHRASE") ? "negativePhrase" : "negativeExact";

            // 1. Process Negative Keywords
            if (keywordItems.length) {
                const chunks = chunkArray(keywordItems, 1000);
                for (const chunk of chunks) {
                    try {
                        if (adType === "SP") {
                            const payload = {
                                negativeKeywords: chunk.map(it => ({
                                    campaignId: String(it.campaignId),
                                    adGroupId: String(it.adGroupId),
                                    keywordText: it.searchTerm,
                                    matchType: spNegativeMatchType,
                                    state: "ENABLED",
                                }))
                            };
                            const response = await retryWithBackoff(() => amazonAxios({
                                method: "POST",
                                url: `${profile.amazonUrl}/sp/negativeKeywords`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/vnd.spNegativeKeyword.v3+json",
                                    "Accept": "application/vnd.spNegativeKeyword.v3+json",
                                },
                                data: payload,
                                meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                            }));
                            if (response?.status === 207 || response?.status === 200) {
                                successfulItems.push(...chunk);
                                results.push({ isSuccess: true, count: chunk.length });
                            } else {
                                results.push({ isSuccess: false, message: `Status: ${response?.status}`, count: chunk.length });
                            }
                        } else if (adType === "SB") {
                            const payload = {
                                negativeKeywords: chunk.map(it => ({
                                    campaignId: String(it.campaignId),
                                    adGroupId: String(it.adGroupId),
                                    keywordText: it.searchTerm,
                                    matchType: sbNegativeMatchType,
                                }))
                            };
                            const response = await retryWithBackoff(() => amazonAxios({
                                method: "POST",
                                url: `${profile.amazonUrl}/sb/negativeKeywords`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                    "Accept": "application/vnd.sbkeywordresponse.v3+json",
                                },
                                data: payload,
                                meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                            }));
                            if (response?.status === 207 || response?.status === 200) {
                                successfulItems.push(...chunk);
                                results.push({ isSuccess: true, count: chunk.length });
                            } else {
                                results.push({ isSuccess: false, message: `Status: ${response?.status}`, count: chunk.length });
                            }
                        }
                    } catch (err) {
                        recommendation_logs({
                            log_type: "error",
                            message: `[applySearchTermRecommendation Batch Negative Keywords Error] ${err?.message || err}`
                        });
                        results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                    }
                }
            }

            // 2. Process Negative Product Targets (ASINs)
            if (asinItems.length) {
                const chunks = chunkArray(asinItems, 1000);
                for (const chunk of chunks) {
                    try {
                        if (adType === "SP") {
                            const payload = {
                                negativeTargetingClauses: chunk.map(it => ({
                                    campaignId: String(it.campaignId),
                                    adGroupId: String(it.adGroupId),
                                    expression: [{ type: "ASIN_SAME_AS", value: `${it.searchTerm}`.toUpperCase() }],
                                    state: "ENABLED",
                                }))
                            };
                            const response = await retryWithBackoff(() => amazonAxios({
                                method: "POST",
                                url: `${profile.amazonUrl}/sp/negativeTargets`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/vnd.spNegativeTargetingClause.v3+json",
                                    "Accept": "application/vnd.spNegativeTargetingClause.v3+json",
                                },
                                data: payload,
                                meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                            }));
                            if (response?.status === 207 || response?.status === 200) {
                                successfulItems.push(...chunk);
                                results.push({ isSuccess: true, count: chunk.length });
                            } else {
                                results.push({ isSuccess: false, message: `Status: ${response?.status}`, count: chunk.length });
                            }
                        } else if (adType === "SB") {
                            const payload = {
                                negativeTargets: chunk.map(it => ({
                                    campaignId: String(it.campaignId),
                                    adGroupId: String(it.adGroupId),
                                    expression: [{ type: "asinSameAs", value: `${it.searchTerm}`.toUpperCase() }],
                                }))
                            };
                            const response = await retryWithBackoff(() => amazonAxios({
                                method: "POST",
                                url: `${profile.amazonUrl}/sb/negativeTargets`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                    "Accept": "application/vnd.sbcreatenegativetargetsrequest.v3+json",
                                },
                                data: payload,
                                meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                            }));
                            if (response?.status === 207 || response?.status === 200) {
                                successfulItems.push(...chunk);
                                results.push({ isSuccess: true, count: chunk.length });
                            } else {
                                results.push({ isSuccess: false, message: `Status: ${response?.status}`, count: chunk.length });
                            }
                        }
                    } catch (err) {
                        recommendation_logs({
                            log_type: "error",
                            message: `[applySearchTermRecommendation Batch Negative ASINs Error] ${err?.message || err}`
                        });
                        results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                    }
                }
            }

            // 3. Save DB & history for successful items in bulk
            if (successfulItems.length) {
                const bulkOps = successfulItems.map(item => ({
                    updateOne: {
                        filter: {
                            configId: rule?.configId,
                            profileId: rule?.profileId,
                            userId: rule?.userId,
                            ruleSchema: "SearchTerm",
                            ruleId: rule?._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            type: adType,
                            campaignId: item?.campaignId,
                            adGroupId: item?.adGroupId,
                            keywordId: item?.keywordId,
                            searchTerm: item?.searchTerm,
                        },
                        update: {
                            $set: {
                                name: item?.campaignName,
                                adGroupName: item?.adGroupName,
                                searchTerm: item?.searchTerm,
                                targetType: action?.matchType,
                                changed: action?.actionName,
                            }
                        },
                        upsert: true
                    }
                }));
                await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                const historyDocs = successfulItems.map(item => ({
                    configId: rule?.configId,
                    profileId: rule?.profileId,
                    changeLevel: item?.campaignId,
                    changeType: "Add Negative Target",
                    targeting: item?.searchTerm,
                    matchType: action?.matchType || "EXACT",
                    oldValue: "—",
                    newValue: `Negative (${action?.matchType || "EXACT"})`,
                    updatedFrom: "Search Term",
                    userId: rule?.userId,
                    type: adType || "SP",
                    source: "RECOMMENDATION",
                    createdAt: new Date(),
                }));
                await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                const statusBulkOps = successfulItems.map(item => ({
                    updateOne: {
                        filter: {
                            configId: rule?.configId,
                            profileId: rule?.profileId,
                            ruleId: rule?._id,
                            campaignId: item?.campaignId,
                            adGroupId: item?.adGroupId,
                            searchTerm: item?.searchTerm,
                        },
                        update: {
                            $set: { isNew: false }
                        }
                    }
                }));
                await recommandationStatusSchema.bulkWrite(statusBulkOps).catch(() => {});
            }
        }

        // ─── AddAsTargeting ──────────────────────────────────────────────
        else if (action?.actionName === "AddAsTargeting") {
            if (keywordItems.length) {
                const chunks = chunkArray(keywordItems, 1000);
                for (const chunk of chunks) {
                    try {
                        if (adType === "SP") {
                            const payload = {
                                keywords: chunk.map(it => ({
                                    campaignId: String(it.campaignId),
                                    adGroupId: String(it.adGroupId),
                                    keywordText: it.searchTerm,
                                    matchType: rawMatch,
                                    bid: Number(it?.suggestedBid || 1),
                                    state: "ENABLED",
                                }))
                            };
                            const response = await retryWithBackoff(() => amazonAxios({
                                method: "POST",
                                url: `${profile.amazonUrl}/sp/keywords`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/vnd.spKeyword.v3+json",
                                    "Accept": "application/vnd.spKeyword.v3+json",
                                },
                                data: payload,
                                meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                            }));
                            if (response?.status === 207 || response?.status === 200) {
                                successfulItems.push(...chunk);
                                results.push({ isSuccess: true, count: chunk.length });
                            } else {
                                results.push({ isSuccess: false, message: `Status: ${response?.status}`, count: chunk.length });
                            }
                        } else if (adType === "SB") {
                            const payload = {
                                keywords: chunk.map(it => ({
                                    campaignId: String(it.campaignId),
                                    adGroupId: String(it.adGroupId),
                                    keywordText: it.searchTerm,
                                    matchType: rawMatch.toLowerCase(),
                                    bid: Number(it?.suggestedBid || 1),
                                    state: "ENABLED",
                                }))
                            };
                            const response = await retryWithBackoff(() => amazonAxios({
                                method: "POST",
                                url: `${profile.amazonUrl}/sb/keywords`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                    "Accept": "application/vnd.sbkeywordresponse.v3+json",
                                },
                                data: payload,
                                meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                            }));
                            if (response?.status === 207 || response?.status === 200) {
                                successfulItems.push(...chunk);
                                results.push({ isSuccess: true, count: chunk.length });
                            } else {
                                results.push({ isSuccess: false, message: `Status: ${response?.status}`, count: chunk.length });
                            }
                        }
                    } catch (err) {
                        recommendation_logs({
                            log_type: "error",
                            message: `[applySearchTermRecommendation Batch Target Keywords Error] ${err?.message || err}`
                        });
                        results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                    }
                }
            }

            if (asinItems.length) {
                const chunks = chunkArray(asinItems, 1000);
                for (const chunk of chunks) {
                    try {
                        if (adType === "SP") {
                            const payload = {
                                targetingClauses: chunk.map(it => ({
                                    campaignId: String(it.campaignId),
                                    adGroupId: String(it.adGroupId),
                                    expression: [{ type: "ASIN_SAME_AS", value: it.searchTerm }],
                                    expressionType: "MANUAL",
                                    bid: Number(it?.suggestedBid || 1),
                                    state: "ENABLED",
                                }))
                            };
                            const response = await retryWithBackoff(() => amazonAxios({
                                method: "POST",
                                url: `${profile.amazonUrl}/sp/targets`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/vnd.spTargetingClause.v3+json",
                                    "Accept": "application/vnd.spTargetingClause.v3+json",
                                },
                                data: payload,
                                meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                            }));
                            if (response?.status === 207 || response?.status === 200) {
                                successfulItems.push(...chunk);
                                results.push({ isSuccess: true, count: chunk.length });
                            } else {
                                results.push({ isSuccess: false, message: `Status: ${response?.status}`, count: chunk.length });
                            }
                        } else if (adType === "SB") {
                            const payload = {
                                targets: chunk.map(it => ({
                                    campaignId: String(it.campaignId),
                                    adGroupId: String(it.adGroupId),
                                    expressions: [{ type: "asinSameAs", value: it.searchTerm }],
                                    bid: Number(it?.suggestedBid || 1),
                                }))
                            };
                            const response = await retryWithBackoff(() => amazonAxios({
                                method: "POST",
                                url: `${profile.amazonUrl}/sb/targets`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                    "Accept": "application/vnd.sbcreatetargetsrequest.v3+json",
                                },
                                data: payload,
                                meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
                            }));
                            if (response?.status === 207 || response?.status === 200) {
                                successfulItems.push(...chunk);
                                results.push({ isSuccess: true, count: chunk.length });
                            } else {
                                results.push({ isSuccess: false, message: `Status: ${response?.status}`, count: chunk.length });
                            }
                        }
                    } catch (err) {
                        recommendation_logs({
                            log_type: "error",
                            message: `[applySearchTermRecommendation Batch Target ASINs Error] ${err?.message || err}`
                        });
                        results.push({ isSuccess: false, message: err?.message || "Amazon API error" });
                    }
                }
            }

            if (successfulItems.length) {
                const bulkOps = successfulItems.map(item => ({
                    updateOne: {
                        filter: {
                            configId: rule?.configId,
                            profileId: rule?.profileId,
                            userId: rule?.userId,
                            ruleSchema: "SearchTerm",
                            ruleId: rule?._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            type: adType,
                            campaignId: item?.campaignId,
                            adGroupId: item?.adGroupId,
                            keywordId: item?.keywordId,
                            searchTerm: item?.searchTerm,
                        },
                        update: {
                            $set: {
                                name: item?.campaignName,
                                adGroupName: item?.adGroupName,
                                searchTerm: item?.searchTerm,
                                targetType: action?.matchType,
                                changed: action?.actionName,
                            }
                        },
                        upsert: true
                    }
                }));
                await recommandationCampaignByRuleSchema.bulkWrite(bulkOps);

                const historyDocs = successfulItems.map(item => ({
                    configId: rule?.configId,
                    profileId: rule?.profileId,
                    changeLevel: item?.campaignId,
                    changeType: "Add Target",
                    targeting: item?.searchTerm,
                    matchType: action?.matchType || "EXACT",
                    oldValue: "—",
                    newValue: `Target (${action?.matchType || "EXACT"})`,
                    updatedFrom: "Search Term",
                    userId: rule?.userId,
                    type: adType || "SP",
                    source: "RECOMMENDATION",
                    createdAt: new Date(),
                }));
                await campaignChangeHistorySchema.insertMany(historyDocs, { ordered: false }).catch(() => {});

                const statusBulkOps = successfulItems.map(item => ({
                    updateOne: {
                        filter: {
                            configId: rule?.configId,
                            profileId: rule?.profileId,
                            ruleId: rule?._id,
                            campaignId: item?.campaignId,
                            adGroupId: item?.adGroupId,
                            searchTerm: item?.searchTerm,
                        },
                        update: {
                            $set: { isNew: false }
                        }
                    }
                }));
                await recommandationStatusSchema.bulkWrite(statusBulkOps).catch(() => {});
            }
        }
    }

    const hasAnyError = results.some(r => r.isSuccess === false);
    const hasAnySuccess = results.some(r => r.isSuccess === true);

    const summaryMsg = `Total chunks/calls: ${results.length}, Success: ${hasAnySuccess}, Error: ${hasAnyError}`;
    recommendation_logs({
        log_type: hasAnySuccess && !hasAnyError ? "info" : "warn",
        message: `[ApplySearchTermRecommendation Completed] RuleId: ${rule?._id} | Summary: ${summaryMsg}`
    });

    if (hasAnySuccess && !hasAnyError) {
        return { isSuccess: true, message: `All ${items.length} search term action(s) applied successfully` };
    } else if (hasAnySuccess && hasAnyError) {
        return { isSuccess: true, message: `Search term actions applied with some warnings/partial updates` };
    } else {
        return { isSuccess: false, message: `Failed to apply search term actions` };
    }
};

exports.cronRecommendationSnapshot = async (req, res) => {
    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronRecommendationSnapshot`,
        log_type: "info",
    });

    try {
        const adTypeMap = ["SP", "SB", "SD"];

        const profiles = await profileSchema.find({ isActive: true }).lean();

        await Promise.all(
            profiles.map((profile) =>
                limit(async () => {
                    try {
                        const currentDate = moment.tz(profile.timezone || "Asia/Kolkata").format("YYYY-MM-DD");

                        const rules = await recommendationRuleSchema.find({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            isActive: true,
                            isDeleted: false
                        }).lean();

                        /**
                         * Run Every Rule For All 3 Ad Types
                         */
                        for (const rule of rules) {
                            for (const adType of adTypeMap) {
                                try {
                                    const result = await this.fetchRecommendationData({
                                        configId: profile.configId,
                                        profileId: profile.profileId,
                                        ruleId: rule._id,
                                        models: AD_TYPE_COLLECTIONS[`${adType}Model`],
                                        adType
                                    });

                                    const data = result?.data || [];

                                    if (!data.length) continue;

                                    const bulkOps = data.map((item) => ({
                                        updateOne: {
                                            filter: {
                                                configId: profile.configId,
                                                profileId: profile.profileId,
                                                ruleId: rule._id,
                                                campaignId: item?.campaignId || null,
                                                adGroupId: item?.adGroupId || null,
                                                targetId: item?.targetId || null,
                                                placement: item?.placement || "",
                                                targeting: item?.targeting || "",
                                                keywordId: item?.keywordId || null,
                                                reportDate: currentDate,
                                            },
                                            update: {
                                                $set: {
                                                    keywordType: item?.keywordType || "",
                                                    matchType: item?.matchType || "",
                                                    searchTerm: item?.searchTerm || "",
                                                    status: item?.status || "",
                                                    budget: item?.budget || 0,
                                                    placementBid: item?.placementBid || 0,
                                                    targetingBid: item?.targetingBid || 0,
                                                    impression: item?.impression || 0,
                                                    clicks: item?.clicks || 0,
                                                    orders: item?.orders || 0,
                                                    sales: item?.sales || 0,
                                                    spend: item?.spend || 0
                                                },
                                                $setOnInsert: {
                                                    isNew: true
                                                }
                                            },
                                            upsert: true
                                        }
                                    }));

                                    await recommandationStatusSchema.bulkWrite(bulkOps);

                                } catch (error) {
                                    cron_logs({
                                        message: `Rule ${rule._id} ${adType} Error: ${error.message}`,
                                        log_type: "error",
                                    });
                                }
                            }
                        }

                        /**
                         * History
                         */
                        await cronJobHistorySchema.create({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Recommendation Snapshot",
                            status: "COMPLETED",
                            historyDate: currentDate,
                        });

                    } catch (error) {
                        cron_logs({
                            message: `Profile ${profile.profileId} Error: ${error.message}`,
                            log_type: "error",
                        });
                    }
                })
            )
        );

        cron_logs({
            message: "Recommendation Snapshot completed successfully",
            log_type: "info",
        });

    } catch (error) {
        cron_logs({
            message: `cronRecommendationSnapshot error: ${error.message}`,
            log_type: "error",
        });
    }
};
