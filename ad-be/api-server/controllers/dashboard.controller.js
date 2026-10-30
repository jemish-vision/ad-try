const moment = require("moment");
const { getRollingReportDates } = require("../helper/rollingReportDates");

const mongoose = require("mongoose");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));

const campaignSchema = require("../models/campaign.model");
const targetingSchema = require("../models/targeting.model");
const productAdsSchema = require("../models/productAds.model");
const roleSchema = require("../models/superAdmin/role.model");
const userSchema = require("../models/user.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const affectedCampaignByRuleSchema = require("../models/affectedCampaignByRule.model");
const daypartingRuleSchema = require("../models/daypartingRule.model");
const budgetRulesSchema = require("../models/budgetRules.model");
const placementRulesSchema = require("../models/placementRules.model");
const targetingRuleSchema = require("../models/targetingRuleSchema.model");
const sbCampaignSchema = require("../models/sbCampaign.model");
const sdCampaignSchema = require("../models/sdCampaign.model");
const keywordsHourlyPerformanceSchema = require("../models/keywordsHourlyPerformanceSchema.model");
const daypartingRuleHistorySchema = require("../models/daypartingRuleHistory.model");
const ruleRunHistorySchema = require("../models/ruleRunHistory.model");
const searchTermRulesSchema = require("../models/searchTermRules.model");

const { buildWeeklyPerformanceEmail } = require("../../emailTemplate/buildWeeklyPerformanceEmail");
const { sendEmailHelper } = require("../helper/emailHelper");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const { ROLES } = require("../constants/roles");
const { write_logs } = require("../../winston/utility/logger");
const { getCacheWithLog, setCacheWithLog } = require("../services/redis.service");

exports.getChangesByCampaign = async (req, res) => {
    const configId = req?.config?.configId;
    const { adTypeCampaignSchema } = req?.models

    try {
        let {
            profileId,
            fromDate,
            toDate,
            metric = "sales",
            pageNo = 1,
            perPage = 5,
        } = req.body;

        if (!profileId) {
            return res.status(203).json({
                isSuccess: false,
                message: "Profile Id is required",
            });
        }

        metric = (metric || "sales").toLowerCase().trim();
        perPage = Number(perPage) || 5;
        pageNo = Number(pageNo) || 1;

        const ALLOWED_METRICS = ["sales", "spend", "acos", "roas", "impressions", "orders", "clicks", "ctr", "cpc"];
        if (!ALLOWED_METRICS.includes(metric)) {
            return res.status(203).json({
                isSuccess: false,
                message: `Invalid metric "${metric}". Allowed metrics are: ${ALLOWED_METRICS.join(", ")}`,
            });
        }

        // ✅ Default dates
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const diffDays = moment(toDate).diff(moment(fromDate), "days") + 1;

        // ✅ Previous range
        const prevFromDate = moment(fromDate).subtract(diffDays, "days").format("YYYY-MM-DD");
        const prevToDate = moment(fromDate).subtract(1, "days").format("YYYY-MM-DD");

        const skip = (pageNo - 1) * perPage;

        const hasActiveCampaigns = await adTypeCampaignSchema.exists({
            configId,
            profileId: Number(profileId),
            status: "ENABLED",
            reportDate: { $gte: moment().subtract(2, "days").format("YYYY-MM-DD") }
        });

        const activeCampaigns = hasActiveCampaigns
            ? await adTypeCampaignSchema.distinct("campaignId", {
                configId,
                profileId: Number(profileId),
                status: "ENABLED",
                reportDate: toDate,
            })
            : await adTypeCampaignSchema.distinct("campaignId", {
                configId,
                profileId: Number(profileId),
                reportDate: { $gte: fromDate, $lte: toDate },
            });

        if (!activeCampaigns || !activeCampaigns.length) {
            return res.status(200).json({
                isSuccess: true,
                data: [],
                totalRecords: 0,
                pageNo,
                perPage,
                currentRange: { fromDate, toDate },
                previousRange: { prevFromDate, prevToDate },
            });
        }

        // ✅ Aggregation
        const pipeline = [
            {
                $match: {
                    configId,
                    profileId: Number(profileId),
                    campaignId: { $in: activeCampaigns },
                    reportDate: { $gte: prevFromDate, $lte: toDate },
                },
            },
            {
                $project: {
                    campaignId: 1,
                    name: 1,
                    reportDate: 1,

                    sales: { $ifNull: ["$sales", 0] },
                    spend: { $ifNull: ["$spend", 0] },
                    clicks: { $ifNull: ["$clicks", 0] },
                    impressions: { $ifNull: ["$impressions", 0] },
                    orders: { $ifNull: ["$orders", 0] },
                },
            },
            {
                $group: {
                    _id: {
                        campaignId: "$campaignId",
                        name: "$name",
                    },

                    // CURRENT
                    current_sales: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$sales", 0] } },
                    current_spend: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$spend", 0] } },
                    current_clicks: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$clicks", 0] } },
                    current_impressions: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$impressions", 0] } },
                    current_orders: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$orders", 0] } },

                    // PREVIOUS
                    prev_sales: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$sales", 0] } },
                    prev_spend: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$spend", 0] } },
                    prev_clicks: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$clicks", 0] } },
                    prev_impressions: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$impressions", 0] } },
                    prev_orders: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$orders", 0] } },
                },
            },

            // ✅ Compute metric dynamically (CORRECT WAY)
            {
                $addFields: {
                    current: {
                        $switch: {
                            branches: [
                                { case: { $eq: [metric, "sales"] }, then: "$current_sales" },
                                { case: { $eq: [metric, "spend"] }, then: "$current_spend" },
                                { case: { $eq: [metric, "clicks"] }, then: "$current_clicks" },
                                { case: { $eq: [metric, "impressions"] }, then: "$current_impressions" },
                                { case: { $eq: [metric, "orders"] }, then: "$current_orders" },

                                {
                                    case: { $eq: [metric, "ctr"] },
                                    then: { $cond: [{ $eq: ["$current_impressions", 0] }, 0, { $multiply: [{ $divide: ["$current_clicks", "$current_impressions"] }, 100] }] }
                                },
                                {
                                    case: { $eq: [metric, "cpc"] },
                                    then: { $cond: [{ $eq: ["$current_clicks", 0] }, 0, { $divide: ["$current_spend", "$current_clicks"] }] }
                                },
                                {
                                    case: { $eq: [metric, "acos"] },
                                    then: { $cond: [{ $eq: ["$current_sales", 0] }, 0, { $multiply: [{ $divide: ["$current_spend", "$current_sales"] }, 100] }] }
                                },
                                {
                                    case: { $eq: [metric, "roas"] },
                                    then: { $cond: [{ $eq: ["$current_spend", 0] }, 0, { $divide: ["$current_sales", "$current_spend"] }] }
                                },
                            ],
                            default: "$current_sales"
                        }
                    },

                    previous: {
                        $switch: {
                            branches: [
                                { case: { $eq: [metric, "sales"] }, then: "$prev_sales" },
                                { case: { $eq: [metric, "spend"] }, then: "$prev_spend" },
                                { case: { $eq: [metric, "clicks"] }, then: "$prev_clicks" },
                                { case: { $eq: [metric, "impressions"] }, then: "$prev_impressions" },
                                { case: { $eq: [metric, "orders"] }, then: "$prev_orders" },

                                {
                                    case: { $eq: [metric, "ctr"] },
                                    then: { $cond: [{ $eq: ["$prev_impressions", 0] }, 0, { $multiply: [{ $divide: ["$prev_clicks", "$prev_impressions"] }, 100] }] }
                                },
                                {
                                    case: { $eq: [metric, "cpc"] },
                                    then: { $cond: [{ $eq: ["$prev_clicks", 0] }, 0, { $divide: ["$prev_spend", "$prev_clicks"] }] }
                                },
                                {
                                    case: { $eq: [metric, "acos"] },
                                    then: { $cond: [{ $eq: ["$prev_sales", 0] }, 0, { $multiply: [{ $divide: ["$prev_spend", "$prev_sales"] }, 100] }] }
                                },
                                {
                                    case: { $eq: [metric, "roas"] },
                                    then: { $cond: [{ $eq: ["$prev_spend", 0] }, 0, { $divide: ["$prev_sales", "$prev_spend"] }] }
                                },
                            ],
                            default: "$prev_sales"
                        }
                    }
                }
            },

            // ✅ Difference calculation
            {
                $addFields: {
                    differenceValue: { $subtract: ["$current", "$previous"] },
                    differencePercentage: {
                        $cond: [
                            { $eq: ["$previous", 0] },
                            { $cond: [{ $eq: ["$current", 0] }, 0, 100] },
                            {
                                $multiply: [
                                    { $divide: [{ $subtract: ["$current", "$previous"] }, "$previous"] },
                                    100
                                ]
                            }
                        ]
                    }
                }
            },

            {
                $project: {
                    _id: 0,
                    campaignId: "$_id.campaignId",
                    name: "$_id.name",
                    current: { $round: ["$current", 2] },
                    previous: { $round: ["$previous", 2] },
                    differenceValue: { $round: ["$differenceValue", 2] },
                    differencePercentage: { $round: ["$differencePercentage", 2] },
                }
            },

            { $match: { $nor: [{ current: 0, previous: 0 }] } },

            { $sort: { differenceValue: -1 } },

            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: perPage }],
                    totalRecords: [{ $count: "count" }]
                }
            },

            {
                $project: {
                    data: 1,
                    totalRecords: {
                        $ifNull: [{ $arrayElemAt: ["$totalRecords.count", 0] }, 0]
                    }
                }
            }
        ];

        const result = await adTypeCampaignSchema.aggregate(pipeline);

        return res.status(200).json({
            isSuccess: true,
            data: result[0]?.data || [],
            totalRecords: result[0]?.totalRecords || 0,
            pageNo,
            perPage,
            currentRange: { fromDate, toDate },
            previousRange: { prevFromDate, prevToDate },
        });

    } catch (error) {
        write_logs({ message: `[getChangesByCampaign Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.getChangesByKeyword = async (req, res) => {
    const configId = req?.config?.configId;
    const { adTypeTargetingSchema, adTypeCampaignSchema } = req?.models;

    try {
        let {
            profileId,
            campaignId, // optional filter
            adGroupId,  // optional filter
            fromDate,
            toDate,
            metric = "sales",
            pageNo = 1,
            perPage = 5,
        } = req.body;

        if (!profileId) {
            return res.status(203).json({
                isSuccess: false,
                message: "Profile Id is required",
            });
        }

        metric = (metric || "sales").toLowerCase().trim();
        perPage = Number(perPage) || 5;
        pageNo = Number(pageNo) || 1;

        const ALLOWED_METRICS = ["sales", "spend", "acos", "roas", "impressions", "orders", "clicks", "ctr", "cpc"];
        if (!ALLOWED_METRICS.includes(metric)) {
            return res.status(203).json({
                isSuccess: false,
                message: `Invalid metric "${metric}"`,
            });
        }

        // ✅ Dates
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const diffDays = moment(toDate).diff(moment(fromDate), "days") + 1;

        const prevFromDate = moment(fromDate).subtract(diffDays, "days").format("YYYY-MM-DD");
        const prevToDate = moment(fromDate).subtract(1, "days").format("YYYY-MM-DD");

        const skip = (pageNo - 1) * perPage;

        const hasActiveCampaigns = await adTypeCampaignSchema.exists({
            configId,
            profileId: Number(profileId),
            status: "ENABLED",
            reportDate: { $gte: moment().subtract(2, "days").format("YYYY-MM-DD") }
        });

        const activeKeywords = hasActiveCampaigns
            ? await adTypeTargetingSchema.distinct("targetId", {
                configId,
                profileId: Number(profileId),
                ...(campaignId && { campaignId: Number(campaignId) }),
                ...(adGroupId && { adGroupId: Number(adGroupId) }),
                status: "ENABLED",
                keywordType: { $in: ["EXACT", "PHRASE", "BROAD"] },
                reportDate: toDate,
            })
            : await adTypeTargetingSchema.distinct("targetId", {
                configId,
                profileId: Number(profileId),
                ...(campaignId && { campaignId: Number(campaignId) }),
                ...(adGroupId && { adGroupId: Number(adGroupId) }),
                keywordType: { $in: ["EXACT", "PHRASE", "BROAD"] },
                reportDate: { $gte: fromDate, $lte: toDate },
            });

        if (!activeKeywords.length) {
            return res.status(200).json({
                isSuccess: true,
                data: [],
                totalRecords: 0,
                pageNo,
                perPage,
            });
        }

        const pipeline = [
            {
                $match: {
                    configId,
                    profileId: Number(profileId),
                    targetId: { $in: activeKeywords },
                    ...(campaignId && { campaignId: Number(campaignId) }),
                    ...(adGroupId && { adGroupId: Number(adGroupId) }),
                    reportDate: { $gte: prevFromDate, $lte: toDate },
                },
            },

            // ✅ Base fields only
            {
                $project: {
                    targetId: 1,
                    targeting: 1,
                    keywordType: 1,
                    campaignId: 1,
                    adGroupId: 1,
                    reportDate: 1,

                    sales: { $ifNull: ["$sales", 0] },
                    spend: { $ifNull: ["$spend", 0] },
                    clicks: { $ifNull: ["$clicks", 0] },
                    impressions: { $ifNull: ["$impressions", 0] },
                    orders: { $ifNull: ["$orders", 0] },
                },
            },

            // ✅ Aggregate
            {
                $group: {
                    _id: {
                        // targetId: "$targetId",
                        targeting: "$targeting",
                        keywordType: "$keywordType",
                        // campaignId: "$campaignId",
                        // adGroupId: "$adGroupId",
                    },

                    current_sales: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$sales", 0] } },
                    current_spend: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$spend", 0] } },
                    current_clicks: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$clicks", 0] } },
                    current_impressions: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$impressions", 0] } },
                    current_orders: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$orders", 0] } },

                    prev_sales: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$sales", 0] } },
                    prev_spend: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$spend", 0] } },
                    prev_clicks: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$clicks", 0] } },
                    prev_impressions: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$impressions", 0] } },
                    prev_orders: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$orders", 0] } },
                },
            },

            // ✅ Dynamic metric calc
            {
                $addFields: {
                    current: {
                        $switch: {
                            branches: [
                                { case: { $eq: [metric, "sales"] }, then: "$current_sales" },
                                { case: { $eq: [metric, "spend"] }, then: "$current_spend" },
                                { case: { $eq: [metric, "clicks"] }, then: "$current_clicks" },
                                { case: { $eq: [metric, "impressions"] }, then: "$current_impressions" },
                                { case: { $eq: [metric, "orders"] }, then: "$current_orders" },

                                { case: { $eq: [metric, "ctr"] }, then: { $cond: [{ $eq: ["$current_impressions", 0] }, 0, { $multiply: [{ $divide: ["$current_clicks", "$current_impressions"] }, 100] }] } },
                                { case: { $eq: [metric, "cpc"] }, then: { $cond: [{ $eq: ["$current_clicks", 0] }, 0, { $divide: ["$current_spend", "$current_clicks"] }] } },
                                { case: { $eq: [metric, "acos"] }, then: { $cond: [{ $eq: ["$current_sales", 0] }, 0, { $multiply: [{ $divide: ["$current_spend", "$current_sales"] }, 100] }] } },
                                { case: { $eq: [metric, "roas"] }, then: { $cond: [{ $eq: ["$current_spend", 0] }, 0, { $divide: ["$current_sales", "$current_spend"] }] } },
                            ],
                            default: "$current_sales"
                        }
                    },

                    previous: {
                        $switch: {
                            branches: [
                                { case: { $eq: [metric, "sales"] }, then: "$prev_sales" },
                                { case: { $eq: [metric, "spend"] }, then: "$prev_spend" },
                                { case: { $eq: [metric, "clicks"] }, then: "$prev_clicks" },
                                { case: { $eq: [metric, "impressions"] }, then: "$prev_impressions" },
                                { case: { $eq: [metric, "orders"] }, then: "$prev_orders" },

                                { case: { $eq: [metric, "ctr"] }, then: { $cond: [{ $eq: ["$prev_impressions", 0] }, 0, { $multiply: [{ $divide: ["$prev_clicks", "$prev_impressions"] }, 100] }] } },
                                { case: { $eq: [metric, "cpc"] }, then: { $cond: [{ $eq: ["$prev_clicks", 0] }, 0, { $divide: ["$prev_spend", "$prev_clicks"] }] } },
                                { case: { $eq: [metric, "acos"] }, then: { $cond: [{ $eq: ["$prev_sales", 0] }, 0, { $multiply: [{ $divide: ["$prev_spend", "$prev_sales"] }, 100] }] } },
                                { case: { $eq: [metric, "roas"] }, then: { $cond: [{ $eq: ["$prev_spend", 0] }, 0, { $divide: ["$prev_sales", "$prev_spend"] }] } },
                            ],
                            default: "$prev_sales"
                        }
                    }
                }
            },

            {
                $addFields: {
                    differenceValue: { $subtract: ["$current", "$previous"] },
                    differencePercentage: {
                        $cond: [
                            { $eq: ["$previous", 0] },
                            { $cond: [{ $eq: ["$current", 0] }, 0, 100] },
                            { $multiply: [{ $divide: [{ $subtract: ["$current", "$previous"] }, "$previous"] }, 100] }
                        ]
                    }
                }
            },

            {
                $project: {
                    _id: 0,
                    targetId: "$_id.targetId",
                    targeting: "$_id.targeting",
                    keywordType: "$_id.keywordType",
                    campaignId: "$_id.campaignId",
                    adGroupId: "$_id.adGroupId",
                    current: { $round: ["$current", 2] },
                    previous: { $round: ["$previous", 2] },
                    differenceValue: { $round: ["$differenceValue", 2] },
                    differencePercentage: { $round: ["$differencePercentage", 2] },
                }
            },

            { $match: { $nor: [{ current: 0, previous: 0 }] } },

            { $sort: { differenceValue: -1 } },

            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: perPage }],
                    totalRecords: [{ $count: "count" }]
                }
            },

            {
                $project: {
                    data: 1,
                    totalRecords: { $ifNull: [{ $arrayElemAt: ["$totalRecords.count", 0] }, 0] }
                }
            }
        ];

        const result = await adTypeTargetingSchema.aggregate(pipeline);

        return res.status(200).json({
            isSuccess: true,
            data: result[0]?.data || [],
            totalRecords: result[0]?.totalRecords || 0,
            pageNo,
            perPage,
            currentRange: { fromDate, toDate },
            previousRange: { prevFromDate, prevToDate },
        });

    } catch (error) {
        write_logs({ message: `[getChangesByKeyword Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};


exports.getChangesByProduct = async (req, res) => {
    const configId = req?.config?.configId;
    const { adTypeProductAdsSchema } = req?.models;

    try {
        let {
            profileId,
            fromDate,
            toDate,
            metric = "sales",
            pageNo = 1,
            perPage = 5,
        } = req.body;

        if (!profileId) {
            return res.status(203).json({
                isSuccess: false,
                message: "Profile Id is required",
            });
        }

        metric = (metric || "sales").toLowerCase().trim();
        perPage = Number(perPage) || 5;
        pageNo = Number(pageNo) || 1;

        const ALLOWED_METRICS = ["sales", "spend", "acos", "roas", "impressions", "orders", "clicks", "ctr", "cpc"];
        if (!ALLOWED_METRICS.includes(metric)) {
            return res.status(203).json({
                isSuccess: false,
                message: `Invalid metric "${metric}"`,
            });
        }

        // ✅ Dates
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const diffDays = moment(toDate).diff(moment(fromDate), "days") + 1;

        const prevFromDate = moment(fromDate).subtract(diffDays, "days").format("YYYY-MM-DD");
        const prevToDate = moment(fromDate).subtract(1, "days").format("YYYY-MM-DD");

        const skip = (pageNo - 1) * perPage;

        const pipeline = [
            {
                $match: {
                    configId,
                    profileId: Number(profileId),
                    reportDate: { $gte: prevFromDate, $lte: toDate },
                },
            },

            // ✅ Normalize fields
            {
                $project: {
                    sku: 1,
                    asin: { $ifNull: ["$asins", { $ifNull: ["$asin", "$advertisedAsin"] }] },
                    reportDate: 1,

                    sales: { $ifNull: ["$sales", 0] },
                    spend: { $ifNull: ["$spend", 0] },
                    clicks: { $ifNull: ["$clicks", 0] },
                    impressions: { $ifNull: ["$impressions", 0] },
                    orders: { $ifNull: ["$orders", 0] },
                }
            },

            // ✅ Group by product (SKU priority)
            {
                $group: {
                    _id: {
                        sku: "$sku",
                        asin: "$asin"
                    },

                    current_sales: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$sales", 0] } },
                    current_spend: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$spend", 0] } },
                    current_clicks: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$clicks", 0] } },
                    current_impressions: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$impressions", 0] } },
                    current_orders: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$orders", 0] } },

                    prev_sales: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$sales", 0] } },
                    prev_spend: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$spend", 0] } },
                    prev_clicks: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$clicks", 0] } },
                    prev_impressions: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$impressions", 0] } },
                    prev_orders: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, "$orders", 0] } },
                }
            },

            // ✅ Compute metric
            {
                $addFields: {
                    current: {
                        $switch: {
                            branches: [
                                { case: { $eq: [metric, "sales"] }, then: "$current_sales" },
                                { case: { $eq: [metric, "spend"] }, then: "$current_spend" },
                                { case: { $eq: [metric, "clicks"] }, then: "$current_clicks" },
                                { case: { $eq: [metric, "impressions"] }, then: "$current_impressions" },
                                { case: { $eq: [metric, "orders"] }, then: "$current_orders" },

                                { case: { $eq: [metric, "ctr"] }, then: { $cond: [{ $eq: ["$current_impressions", 0] }, 0, { $multiply: [{ $divide: ["$current_clicks", "$current_impressions"] }, 100] }] } },
                                { case: { $eq: [metric, "cpc"] }, then: { $cond: [{ $eq: ["$current_clicks", 0] }, 0, { $divide: ["$current_spend", "$current_clicks"] }] } },
                                { case: { $eq: [metric, "acos"] }, then: { $cond: [{ $eq: ["$current_sales", 0] }, 0, { $multiply: [{ $divide: ["$current_spend", "$current_sales"] }, 100] }] } },
                                { case: { $eq: [metric, "roas"] }, then: { $cond: [{ $eq: ["$current_spend", 0] }, 0, { $divide: ["$current_sales", "$current_spend"] }] } },
                            ],
                            default: "$current_sales"
                        }
                    },

                    previous: {
                        $switch: {
                            branches: [
                                { case: { $eq: [metric, "sales"] }, then: "$prev_sales" },
                                { case: { $eq: [metric, "spend"] }, then: "$prev_spend" },
                                { case: { $eq: [metric, "clicks"] }, then: "$prev_clicks" },
                                { case: { $eq: [metric, "impressions"] }, then: "$prev_impressions" },
                                { case: { $eq: [metric, "orders"] }, then: "$prev_orders" },

                                { case: { $eq: [metric, "ctr"] }, then: { $cond: [{ $eq: ["$prev_impressions", 0] }, 0, { $multiply: [{ $divide: ["$prev_clicks", "$prev_impressions"] }, 100] }] } },
                                { case: { $eq: [metric, "cpc"] }, then: { $cond: [{ $eq: ["$prev_clicks", 0] }, 0, { $divide: ["$prev_spend", "$prev_clicks"] }] } },
                                { case: { $eq: [metric, "acos"] }, then: { $cond: [{ $eq: ["$prev_sales", 0] }, 0, { $multiply: [{ $divide: ["$prev_spend", "$prev_sales"] }, 100] }] } },
                                { case: { $eq: [metric, "roas"] }, then: { $cond: [{ $eq: ["$prev_spend", 0] }, 0, { $divide: ["$prev_sales", "$prev_spend"] }] } },
                            ],
                            default: "$prev_sales"
                        }
                    }
                }
            },

            // ✅ Remove full zero rows
            {
                $match: {
                    $nor: [{ current: 0, previous: 0 }]
                }
            },

            // ✅ Difference
            {
                $addFields: {
                    differenceValue: { $subtract: ["$current", "$previous"] },
                    differencePercentage: {
                        $cond: [
                            { $eq: ["$previous", 0] },
                            { $cond: [{ $eq: ["$current", 0] }, 0, 100] },
                            { $multiply: [{ $divide: [{ $subtract: ["$current", "$previous"] }, "$previous"] }, 100] }
                        ]
                    }
                }
            },

            // ✅ Lookup product info
            {
                $lookup: {
                    from: "productlistings",
                    let: { sku: "$_id.sku", asin: "$_id.asin" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        {
                                            $and: [
                                                { $ne: ["$$sku", null] },
                                                { $eq: ["$sku", "$$sku"] }
                                            ]
                                        },
                                        {
                                            $and: [
                                                { $ne: ["$$asin", null] },
                                                { $eq: ["$asin", "$$asin"] }
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        { $project: { itemName: 1, imageURL: 1 } }
                    ],
                    as: "productInfo"
                }
            },

            {
                $unwind: {
                    path: "$productInfo",
                    preserveNullAndEmptyArrays: true
                }
            },

            {
                $project: {
                    _id: 0,
                    sku: "$_id.sku",
                    asin: "$_id.asin",
                    itemName: "$productInfo.itemName",
                    image: "$productInfo.imageURL",

                    current: { $round: ["$current", 2] },
                    previous: { $round: ["$previous", 2] },
                    differenceValue: { $round: ["$differenceValue", 2] },
                    differencePercentage: { $round: ["$differencePercentage", 2] },
                }
            },

            { $sort: { differenceValue: -1 } },

            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: perPage }],
                    totalRecords: [{ $count: "count" }]
                }
            },

            {
                $project: {
                    data: 1,
                    totalRecords: {
                        $ifNull: [{ $arrayElemAt: ["$totalRecords.count", 0] }, 0]
                    }
                }
            }
        ];

        const result = await adTypeProductAdsSchema.aggregate(pipeline);

        return res.status(200).json({
            isSuccess: true,
            data: result[0]?.data || [],
            totalRecords: result[0]?.totalRecords || 0,
            pageNo,
            perPage,
            currentRange: { fromDate, toDate },
            previousRange: { prevFromDate, prevToDate },
        });

    } catch (error) {
        write_logs({ message: `[getChangesByProduct Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

const getWeeklyPerformance = async (profileId, timezone) => {
    try {
        const now = moment().tz(timezone);
        const today = now.format('YYYY-MM-DD');
        const last7Range = getRollingReportDates(now, "LAST_7_DAYS");
        const last30Range = getRollingReportDates(now, "LAST_30_DAYS");
        const mtdStart = moment().tz(timezone).startOf("month").format("YYYY-MM-DD");
        const ytdStart = moment().tz(timezone).startOf("year").format("YYYY-MM-DD");

        const aggregateData = async (startDate, endDate) => {

            const pipeline = [
                {
                    $match: {
                        profileId: profileId,
                        reportDate: { $gte: startDate, $lte: endDate },
                    },
                },
                {
                    $group: {
                        _id: null,
                        spend: { $sum: "$spend" },
                        revenue: { $sum: "$sales" },
                        impressions: { $sum: "$impressions" },
                        clicks: { $sum: "$clicks" },
                        orders: { $sum: "$orders" },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        spend: 1,
                        revenue: 1,
                        impressions: 1,
                        clicks: 1,
                        orders: 1,
                        acos: { $cond: [{ $gt: ["$revenue", 0] }, { $round: [{ $multiply: [{ $divide: ["$spend", "$revenue"] }, 100] }, 2] }, 0] },
                        roas: { $cond: [{ $gt: ["$spend", 0] }, { $round: [{ $divide: ["$revenue", "$spend"] }, 2] }, 0] },
                        cpc: { $cond: [{ $gt: ["$clicks", 0] }, { $divide: ["$spend", "$clicks"] }, 0] },
                        cvr: { $cond: [{ $gt: ["$clicks", 0] }, { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 0] },
                    },
                },
            ]

            const result = await campaignSchema.aggregate(pipeline);

            return result[0] || { spend: 0, revenue: 0, impressions: 0, clicks: 0, orders: 0, acos: 0, roas: 0, cpc: 0, cvr: 0 };
        };

        const [last7, last30, mtd, ytd] = await Promise.all([
            aggregateData(last7Range.fromDate, last7Range.toDate),
            aggregateData(last30Range.fromDate, last30Range.toDate),
            aggregateData(mtdStart, today),
            aggregateData(ytdStart, today),
        ]);

        const fmt = (d) => moment(d).format("DD/MM");

        return {
            last7Days: last7,
            last30Days: last30,
            mtd,
            ytd,
            dateRanges: {
                last7Days: { from: fmt(last7Range.fromDate), to: fmt(last7Range.toDate) },
                last30Days: { from: fmt(last30Range.fromDate), to: fmt(last30Range.toDate) },
                mtd: { from: fmt(mtdStart), to: fmt(today) },
                ytd: { from: fmt(ytdStart), to: fmt(today) },
            },
        };
    } catch (error) {
        write_logs({ message: `[aggregateData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.error("getWeeklyPerformance error:", error);
        return null;
    }
};

exports.cronWeeklyPerformanceEmail = async () => {
    cron_logs({
        message: `cronWeeklyPerformanceEmail`,
        log_type: "info",
    });

    try {

        const roles = await roleSchema.find({ roleName: { $in: [ROLES.SUPER_ADMIN] } }).lean().select("_id");
        const users = await userSchema.find({ isActive: true, roleId: { $nin: roles } }).lean().select("_id email fullName");

        if (!users.length) return;

        await Promise.all(
            users.map((user) =>
                limit(async () => {
                    try {
                        const userAccessPipeline = [
                            { $match: { userId: user._id, hasAccess: true } },
                            {
                                $lookup: {
                                    from: "profiles",
                                    localField: "profileId",
                                    foreignField: "profileId",
                                    as: "profile",
                                },
                            },
                            { $unwind: "$profile" },
                            { $match: { "profile.isActive": true } },
                            {
                                $lookup: {
                                    from: "configs",
                                    localField: "profile.configId",
                                    foreignField: "_id",
                                    as: "config",
                                },
                            },
                            { $unwind: "$config" },
                            { $match: { "config.isActive": true } },
                            {
                                $project: {
                                    profileId: "$profile.profileId",
                                    profileName: "$profile.name",
                                    timezone: "$profile.timezone",
                                    currencyCode: "$profile.currencyCode",
                                    companyName: "$config.companyName",
                                },
                            },
                        ];

                        const profilesData = await profileBasedPermissionSchema.aggregate(userAccessPipeline);

                        if (!profilesData.length) return;

                        const profileReports = [];

                        for (const profile of profilesData) {
                            const report = await getWeeklyPerformance(profile?.profileId, profile?.timezone);

                            if (!report) continue;

                            profileReports.push({
                                profileName: profile.profileName,
                                companyName: profile.companyName,
                                currency: profile.currencyCode,
                                data: report,
                                dateRanges: report.dateRanges,
                            });
                        }

                        if (!profileReports.length) return;

                        const encodedData = Buffer.from(JSON.stringify({ userId: user._id, route: "/dashboard" })).toString("base64");

                        await sendEmailHelper(
                            user.email,
                            `${`${user.fullName}`.toUpperCase()}, Here's How Your Ads Performed This Week`,
                            buildWeeklyPerformanceEmail({
                                userName: user.fullName,
                                profiles: profileReports,
                                dashboardUrl: `${process.env.FRONTEND_REDIRECT_URL}/login?payload=${encodedData}`,
                                dateRanges: profileReports[0]?.dateRanges,
                            })
                        );

                        cron_logs({
                            message: `Weekly report sent to ${user.email}`,
                            log_type: "info",
                        });
                    } catch (err) {
                        cron_logs({
                            message: `User ${user.email} error: ${err}`,
                            log_type: "error",
                        });
                    }
                })
            )
        );

        cron_logs({
            message: "Weekly performance emails sent successfully.",
            log_type: "info",
        });

    } catch (error) {
        cron_logs({
            message: `Weekly performance email error: ${error}`,
            log_type: "error",
        });
    }
};

const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100;
const round1 = (val) => Math.round((Number(val) || 0) * 10) / 10;

// ─── Phase 3: Assigned vs. Without Assign Campaign Comparison ────────────────
exports.getAssignedCampaignComparison = async (req, res) => {
    const configId = req?.config?.configId;
    const adType = (req.body?.adType || "SP").toUpperCase();
    let campaignModel = req?.models?.adTypeCampaignSchema;
    if (!campaignModel) {
        if (adType === "SB") campaignModel = sbCampaignSchema;
        else if (adType === "SD") campaignModel = sdCampaignSchema;
        else campaignModel = campaignSchema;
    }

    try {
        let { profileId, fromDate, toDate } = req.body;
        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile Id is required" });
        }
        profileId = Number(profileId);
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(30, "days").format("YYYY-MM-DD");

        const dateStart = moment(fromDate).startOf("day").toDate();
        const dateEnd = moment(toDate).endOf("day").toDate();

        const formatRuleName = (schema) => {
            if (!schema) return "Rule";
            const s = String(schema).trim();
            if (s.toLowerCase().includes("targeting")) return "Targeting Rule";
            if (s.toLowerCase().includes("budget")) return "Budget Rule";
            if (s.toLowerCase().includes("placement")) return "Placement Rule";
            if (s.toLowerCase().includes("daypart")) return "Dayparting Rule";
            if (s.toLowerCase().includes("search")) return "Search Term Rule";
            return s.replace(/Rule$/i, "") + " Rule";
        };

        // 1. Map campaigns to the rules that worked/executed on them strictly within [fromDate, toDate]
        const campaignRuleMap = new Map(); // campaignId (Number) -> Set of rule names

        const recordRuleCampaign = (campaignId, ruleName) => {
            if (!campaignId) return;
            const cid = Number(campaignId);
            if (!cid || isNaN(cid)) return;
            if (!campaignRuleMap.has(cid)) {
                campaignRuleMap.set(cid, new Set());
            }
            campaignRuleMap.get(cid).add(ruleName);
        };

        // 1a. Query affected campaigns in date range
        // 1b. Query active rule runs in date range
        // 1c. Query dayparting rule execution history in date range
        const [affectedRules, activeRuleRuns, daypartHistories] = await Promise.all([
            affectedCampaignByRuleSchema.find(
                {
                    configId,
                    profileId,
                    $or: [
                        { ruleDate: { $gte: fromDate, $lte: toDate } },
                        { createdAt: { $gte: dateStart, $lte: dateEnd } },
                    ],
                },
                { campaignId: 1, ruleSchema: 1, name: 1 }
            ).lean().catch(() => []),

            ruleRunHistorySchema.find(
                {
                    configId,
                    profileId,
                    isRun: true,
                    $or: [
                        { ruleDate: { $gte: fromDate, $lte: toDate } },
                        { createdAt: { $gte: dateStart, $lte: dateEnd } },
                    ],
                },
                { ruleId: 1, ruleSchema: 1 }
            ).lean().catch(() => []),

            daypartingRuleHistorySchema.find(
                {
                    configId,
                    profileId,
                    $or: [
                        { executedAt: { $gte: dateStart, $lte: dateEnd } },
                        { createdAt: { $gte: dateStart, $lte: dateEnd } },
                    ],
                },
                { ruleId: 1, baseBudget: 1, appliedBudget: 1, basePlacementBid: 1, appliedPlacementBid: 1 }
            ).lean().catch(() => []),
        ]);

        // Process directly affected records
        (affectedRules || []).forEach((doc) => {
            const ruleName = formatRuleName(doc.ruleSchema);
            recordRuleCampaign(doc.campaignId, ruleName);
        });

        // Process dayparting histories
        (daypartHistories || []).forEach((d) => {
            const cids = [
                ...Object.keys(d.basePlacementBid || {}),
                ...Object.keys(d.appliedPlacementBid || {}),
                ...Object.keys(d.baseBudget || {}),
                ...Object.keys(d.appliedBudget || {}),
            ];
            cids.forEach((id) => recordRuleCampaign(id, "Dayparting Rule"));
        });

        // Process rule run histories (if a rule ran in this date window, its assigned campaigns worked)
        if (activeRuleRuns && activeRuleRuns.length > 0) {
            const budgetIds = [];
            const placementIds = [];
            const targetingIds = [];
            const searchtermIds = [];
            const daypartingIds = [];

            activeRuleRuns.forEach((r) => {
                if (!r.ruleId) return;
                const schema = (r.ruleSchema || "").toLowerCase();
                if (schema.includes("budget")) budgetIds.push(r.ruleId);
                else if (schema.includes("placement")) placementIds.push(r.ruleId);
                else if (schema.includes("targeting")) targetingIds.push(r.ruleId);
                else if (schema.includes("search")) searchtermIds.push(r.ruleId);
                else if (schema.includes("daypart")) daypartingIds.push(r.ruleId);
            });

            const [bRules, pRules, tRules, sRules, dRules] = await Promise.all([
                budgetIds.length > 0
                    ? budgetRulesSchema.find({ _id: { $in: budgetIds }, configId, profileId }, { campaignIds: 1 }).lean().catch(() => [])
                    : [],
                placementIds.length > 0
                    ? placementRulesSchema.find({ _id: { $in: placementIds }, configId, profileId }, { campaignIds: 1 }).lean().catch(() => [])
                    : [],
                targetingIds.length > 0
                    ? targetingRuleSchema.find({ _id: { $in: targetingIds }, configId, profileId }, { campaignIds: 1 }).lean().catch(() => [])
                    : [],
                searchtermIds.length > 0
                    ? searchTermRulesSchema.find({ _id: { $in: searchtermIds }, configId, profileId }, { campaignIds: 1 }).lean().catch(() => [])
                    : [],
                daypartingIds.length > 0
                    ? daypartingRuleSchema.find({ _id: { $in: daypartingIds }, configId, profileId }, { campaignIds: 1 }).lean().catch(() => [])
                    : [],
            ]);

            const extractRuleCamps = (rules, ruleName) => {
                (rules || []).forEach((r) => {
                    if (!r.campaignIds) return;
                    if (Array.isArray(r.campaignIds)) {
                        r.campaignIds.forEach((id) => recordRuleCampaign(id, ruleName));
                    } else if (typeof r.campaignIds === "object") {
                        ["SP", "SB", "SD"].forEach((k) => {
                            if (Array.isArray(r.campaignIds[k])) {
                                r.campaignIds[k].forEach((id) => recordRuleCampaign(id, ruleName));
                            }
                        });
                    }
                });
            };

            extractRuleCamps(bRules, "Budget Rule");
            extractRuleCamps(pRules, "Placement Rule");
            extractRuleCamps(tRules, "Targeting Rule");
            extractRuleCamps(sRules, "Search Term Rule");
            extractRuleCamps(dRules, "Dayparting Rule");
        }

        // 2. Aggregate campaigns active in the selected date range
        const campaigns = await campaignModel.aggregate([
            {
                $match: {
                    configId,
                    profileId,
                    reportDate: { $gte: fromDate, $lte: toDate },
                },
            },
            {
                $group: {
                    _id: "$campaignId",
                    name: { $last: "$name" },
                    spend: { $sum: { $ifNull: ["$spend", 0] } },
                    sales: { $sum: { $ifNull: ["$sales", 0] } },
                    orders: { $sum: { $ifNull: ["$orders", 0] } },
                    clicks: { $sum: { $ifNull: ["$clicks", 0] } },
                    impressions: { $sum: { $ifNull: ["$impressions", 0] } },
                },
            },
        ]).allowDiskUse(true);

        const assignedGroup = { count: 0, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
        const unassignedGroup = { count: 0, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
        const assignedTop = [];
        const unassignedTop = [];

        campaigns.forEach((c) => {
            const cid = Number(c._id);
            const isAssigned = campaignRuleMap.has(cid);
            const target = isAssigned ? assignedGroup : unassignedGroup;
            target.count += 1;
            target.spend += c.spend;
            target.sales += c.sales;
            target.orders += c.orders;
            target.clicks += c.clicks;
            target.impressions += c.impressions;

            const rules = isAssigned ? Array.from(campaignRuleMap.get(cid)) : [];
            const primaryRule = rules.length > 0 ? rules[0] : null;

            const campObj = {
                campaignId: c._id,
                name: c.name || `Campaign #${c._id}`,
                spend: round2(c.spend),
                sales: round2(c.sales),
                orders: c.orders,
                clicks: c.clicks,
                impressions: c.impressions,
                acos: c.sales > 0 ? round2((c.spend / c.sales) * 100) : 0,
                roas: c.spend > 0 ? round2(c.sales / c.spend) : 0,
                rules,
                primaryRule,
            };
            if (isAssigned) assignedTop.push(campObj);
            else unassignedTop.push(campObj);
        });

        const finalizeMetrics = (g) => {
            const acos = g.sales > 0 ? round2((g.spend / g.sales) * 100) : 0;
            const roas = g.spend > 0 ? round2(g.sales / g.spend) : 0;
            const cvr = g.clicks > 0 ? round2((g.orders / g.clicks) * 100) : 0;
            const cpc = g.clicks > 0 ? round2(g.spend / g.clicks) : 0;
            return {
                count: g.count,
                spend: round2(g.spend),
                sales: round2(g.sales),
                orders: g.orders,
                clicks: g.clicks,
                impressions: g.impressions,
                acos,
                roas,
                cvr,
                cpc,
            };
        };

        const assigned = finalizeMetrics(assignedGroup);
        const unassigned = finalizeMetrics(unassignedGroup);

        const totalSpend = assigned.spend + unassigned.spend;
        const totalSales = assigned.sales + unassigned.sales;
        const totalOrders = assigned.orders + unassigned.orders;

        const spendShareAssigned = totalSpend > 0 ? round1((assigned.spend / totalSpend) * 100) : 0;
        const acosAdvantage = (unassigned.acos > 0 && assigned.acos > 0)
            ? round1(((unassigned.acos - assigned.acos) / unassigned.acos) * 100)
            : 0;
        const roasAdvantage = (unassigned.roas > 0 && assigned.roas > 0)
            ? round1(((assigned.roas - unassigned.roas) / unassigned.roas) * 100)
            : 0;

        // Rule-wise breakdown for assigned campaigns
        const ruleStatsMap = {};
        assignedTop.forEach((camp) => {
            const campRules = camp.rules.length > 0 ? camp.rules : ["Assigned Rule"];
            campRules.forEach((ruleName) => {
                if (!ruleStatsMap[ruleName]) {
                    ruleStatsMap[ruleName] = {
                        ruleName,
                        campaignCount: 0,
                        spend: 0,
                        sales: 0,
                        orders: 0,
                        clicks: 0,
                        impressions: 0,
                    };
                }
                ruleStatsMap[ruleName].campaignCount += 1;
                ruleStatsMap[ruleName].spend += camp.spend;
                ruleStatsMap[ruleName].sales += camp.sales;
                ruleStatsMap[ruleName].orders += camp.orders;
                ruleStatsMap[ruleName].clicks += (camp.clicks || 0);
                ruleStatsMap[ruleName].impressions += (camp.impressions || 0);
            });
        });

        const ruleBreakdown = Object.values(ruleStatsMap).map((r) => {
            const acos = r.sales > 0 ? round2((r.spend / r.sales) * 100) : 0;
            const roas = r.spend > 0 ? round2(r.sales / r.spend) : 0;
            const cvr = r.clicks > 0 ? round2((r.orders / r.clicks) * 100) : 0;
            const cpc = r.clicks > 0 ? round2(r.spend / r.clicks) : 0;
            return {
                ruleName: r.ruleName,
                campaignCount: r.campaignCount,
                spend: round2(r.spend),
                sales: round2(r.sales),
                orders: r.orders,
                clicks: r.clicks,
                impressions: r.impressions,
                acos,
                roas,
                cvr,
                cpc,
            };
        }).sort((a, b) => b.campaignCount - a.campaignCount);

        return res.status(200).json({
            isSuccess: true,
            data: {
                assigned,
                unassigned,
                ruleBreakdown,
                summary: {
                    totalCampaigns: assigned.count + unassigned.count,
                    totalSpend: round2(totalSpend),
                    totalSales: round2(totalSales),
                    totalOrders,
                    spendShareAssigned,
                    acosAdvantage,
                    roasAdvantage,
                },
                topAssigned: assignedTop.sort((a, b) => b.sales - a.sales).slice(0, 20),
                topUnassigned: unassignedTop.sort((a, b) => b.sales - a.sales).slice(0, 20),
                range: { fromDate, toDate },
            },
        });
    } catch (err) {
        return res.status(500).json({ isSuccess: false, message: err.message });
    }
};

// ─── Phase 3: SP / SB / SD Ad Type Breakdown Widget ─────────────────────────
exports.getAdTypeBreakdown = async (req, res) => {
    const configId = req?.config?.configId;
    try {
        let { profileId, fromDate, toDate } = req.body;
        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile Id is required" });
        }
        profileId = Number(profileId);
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(30, "days").format("YYYY-MM-DD");

        const diffDays = moment(toDate).diff(moment(fromDate), "days") + 1;
        const prevFromDate = moment(fromDate).subtract(diffDays, "days").format("YYYY-MM-DD");
        const prevToDate = moment(fromDate).subtract(1, "days").format("YYYY-MM-DD");

        const calcDelta = (curr, prev) => {
            const diff = round2((Number(curr) || 0) - (Number(prev) || 0));
            const pct = (Number(prev) || 0) > 0
                ? round1((((Number(curr) || 0) - Number(prev)) / Number(prev)) * 100)
                : ((Number(curr) || 0) > 0 ? 100 : 0);
            return { diff, pct };
        };

        const aggregateAdType = async (model) => {
            const [res] = await model.aggregate([
                { $match: { configId, profileId, reportDate: { $gte: prevFromDate, $lte: toDate } } },
                {
                    $group: {
                        _id: null,
                        spend: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, { $ifNull: ["$spend", 0] }, 0] } },
                        sales: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, { $ifNull: ["$sales", 0] }, 0] } },
                        orders: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, { $ifNull: ["$orders", 0] }, 0] } },
                        clicks: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, { $ifNull: ["$clicks", 0] }, 0] } },
                        impressions: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, { $ifNull: ["$impressions", 0] }, 0] } },

                        prevSpend: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, { $ifNull: ["$spend", 0] }, 0] } },
                        prevSales: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, { $ifNull: ["$sales", 0] }, 0] } },
                        prevOrders: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, { $ifNull: ["$orders", 0] }, 0] } },
                        prevClicks: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, { $ifNull: ["$clicks", 0] }, 0] } },
                        prevImpressions: { $sum: { $cond: [{ $and: [{ $gte: ["$reportDate", prevFromDate] }, { $lte: ["$reportDate", prevToDate] }] }, { $ifNull: ["$impressions", 0] }, 0] } },

                        campaigns: { $addToSet: { $cond: [{ $and: [{ $gte: ["$reportDate", fromDate] }, { $lte: ["$reportDate", toDate] }] }, "$campaignId", "$$REMOVE"] } },
                    },
                },
            ]).allowDiskUse(true);

            const spend = round2(res?.spend || 0);
            const sales = round2(res?.sales || 0);
            const orders = res?.orders || 0;
            const clicks = res?.clicks || 0;
            const impressions = res?.impressions || 0;
            const campaignCount = res?.campaigns?.length || 0;

            const prevSpend = round2(res?.prevSpend || 0);
            const prevSales = round2(res?.prevSales || 0);
            const prevOrders = res?.prevOrders || 0;
            const prevClicks = res?.prevClicks || 0;
            const prevImpressions = res?.prevImpressions || 0;

            const acos = sales > 0 ? round2((spend / sales) * 100) : 0;
            const roas = spend > 0 ? round2(sales / spend) : 0;
            const ctr = impressions > 0 ? round2((clicks / impressions) * 100) : 0;
            const cvr = clicks > 0 ? round2((orders / clicks) * 100) : 0;
            const cpc = clicks > 0 ? round2(spend / clicks) : 0;

            const prevAcos = prevSales > 0 ? round2((prevSpend / prevSales) * 100) : 0;
            const prevRoas = prevSpend > 0 ? round2(prevSales / prevSpend) : 0;
            const prevCtr = prevImpressions > 0 ? round2((prevClicks / prevImpressions) * 100) : 0;
            const prevCvr = prevClicks > 0 ? round2((prevOrders / prevClicks) * 100) : 0;
            const prevCpc = prevClicks > 0 ? round2(prevSpend / prevClicks) : 0;

            return {
                campaignCount,
                spend,
                sales,
                orders,
                clicks,
                impressions,
                acos,
                roas,
                ctr,
                cvr,
                cpc,
                prevSpend,
                prevSales,
                prevOrders,
                prevClicks,
                prevImpressions,
                prevAcos,
                prevRoas,
                prevCtr,
                prevCvr,
                prevCpc,
                deltaSpend: calcDelta(spend, prevSpend),
                deltaSales: calcDelta(sales, prevSales),
                deltaOrders: calcDelta(orders, prevOrders),
                deltaClicks: calcDelta(clicks, prevClicks),
                deltaImpressions: calcDelta(impressions, prevImpressions),
                deltaAcos: calcDelta(acos, prevAcos),
                deltaRoas: calcDelta(roas, prevRoas),
                deltaCtr: calcDelta(ctr, prevCtr),
                deltaCvr: calcDelta(cvr, prevCvr),
                deltaCpc: calcDelta(cpc, prevCpc),
            };
        };

        const [sp, sb, sd] = await Promise.all([
            aggregateAdType(campaignSchema),
            aggregateAdType(sbCampaignSchema),
            aggregateAdType(sdCampaignSchema),
        ]);

        const totalSpend = round2(sp.spend + sb.spend + sd.spend);
        const totalSales = round2(sp.sales + sb.sales + sd.sales);
        const totalOrders = sp.orders + sb.orders + sd.orders;
        const totalClicks = sp.clicks + sb.clicks + sd.clicks;
        const totalImpressions = sp.impressions + sb.impressions + sd.impressions;

        const prevTotalSpend = round2(sp.prevSpend + sb.prevSpend + sd.prevSpend);
        const prevTotalSales = round2(sp.prevSales + sb.prevSales + sd.prevSales);
        const prevTotalOrders = sp.prevOrders + sb.prevOrders + sd.prevOrders;
        const prevTotalClicks = sp.prevClicks + sb.prevClicks + sd.prevClicks;
        const prevTotalImpressions = sp.prevImpressions + sb.prevImpressions + sd.prevImpressions;

        const overallAcos = totalSales > 0 ? round2((totalSpend / totalSales) * 100) : 0;
        const overallRoas = totalSpend > 0 ? round2(totalSales / totalSpend) : 0;
        const overallCtr = totalImpressions > 0 ? round2((totalClicks / totalImpressions) * 100) : 0;

        const prevOverallAcos = prevTotalSales > 0 ? round2((prevTotalSpend / prevTotalSales) * 100) : 0;
        const prevOverallRoas = prevTotalSpend > 0 ? round2(prevTotalSales / prevTotalSpend) : 0;
        const prevOverallCtr = prevTotalImpressions > 0 ? round2((prevTotalClicks / prevTotalImpressions) * 100) : 0;

        sp.spendShare = totalSpend > 0 ? round1((sp.spend / totalSpend) * 100) : (totalSpend === 0 ? 100 : 0);
        sb.spendShare = totalSpend > 0 ? round1((sb.spend / totalSpend) * 100) : 0;
        sd.spendShare = totalSpend > 0 ? round1((sd.spend / totalSpend) * 100) : 0;

        sp.salesShare = totalSales > 0 ? round1((sp.sales / totalSales) * 100) : (totalSales === 0 ? 100 : 0);
        sb.salesShare = totalSales > 0 ? round1((sb.sales / totalSales) * 100) : 0;
        sd.salesShare = totalSales > 0 ? round1((sd.sales / totalSales) * 100) : 0;

        return res.status(200).json({
            isSuccess: true,
            data: {
                breakdown: {
                    SP: { name: "Sponsored Products", code: "SP", color: "#2374F2", ...sp },
                    SB: { name: "Sponsored Brands", code: "SB", color: "#8b5cf6", ...sb },
                    SD: { name: "Sponsored Display", code: "SD", color: "#10b981", ...sd },
                },
                totals: {
                    totalSpend,
                    totalSales,
                    totalOrders,
                    totalClicks,
                    totalImpressions,
                    overallAcos,
                    overallRoas,
                    overallCtr,
                    prevTotalSpend,
                    prevTotalSales,
                    prevTotalOrders,
                    prevTotalClicks,
                    prevTotalImpressions,
                    prevOverallAcos,
                    prevOverallRoas,
                    prevOverallCtr,
                    deltaSpend: calcDelta(totalSpend, prevTotalSpend),
                    deltaSales: calcDelta(totalSales, prevTotalSales),
                    deltaOrders: calcDelta(totalOrders, prevTotalOrders),
                    deltaClicks: calcDelta(totalClicks, prevTotalClicks),
                    deltaImpressions: calcDelta(totalImpressions, prevTotalImpressions),
                    deltaAcos: calcDelta(overallAcos, prevOverallAcos),
                    deltaRoas: calcDelta(overallRoas, prevOverallRoas),
                    deltaCtr: calcDelta(overallCtr, prevOverallCtr),
                },
                range: { fromDate, toDate },
                previousRange: { prevFromDate, prevToDate },
            },
        });
    } catch (err) {
        return res.status(500).json({ isSuccess: false, message: err.message });
    }
};

// ─── Phase 4: Time-Based Analytics (Tasks 5 & 6) ───────────────────────────
exports.getTimeBasedAnalytics = async (req, res) => {
    const configId = req?.config?.configId || req?.headers?.["x-config-id"] || req?.body?.configId;
    const { adTypeCampaignSchema } = req?.models || {};
    const campaignModel = adTypeCampaignSchema || campaignSchema;

    try {
        let { profileId, fromDate, toDate } = req.body;
        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile Id is required" });
        }
        profileId = Number(profileId);
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(30, "days").format("YYYY-MM-DD");

        const cacheKey = `time_analytics:${profileId}:${configId || "all"}:${fromDate}:${toDate}`;
        try {
            const cached = await getCacheWithLog(cacheKey);
            if (cached) {
                return res.status(200).json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
        } catch (_) {}

        const configIdFilter = configId
            ? (mongoose.Types.ObjectId.isValid(configId)
                ? new mongoose.Types.ObjectId(configId)
                : String(configId))
            : null;

        // 1. Day of Week Breakdown (Mon to Sun) across all campaigns
        const campaignMatch = {
            profileId,
            reportDate: { $gte: fromDate, $lte: toDate },
        };
        if (configIdFilter) {
            campaignMatch.configId = configIdFilter;
        }

        const hourlyMatch = {
            profileId,
            reportDate: { $gte: fromDate, $lte: toDate },
        };
        if (configIdFilter) {
            hourlyMatch.configId = configIdFilter;
        }

        const [dailyCampaignData, hourlyData] = await Promise.all([
            campaignModel.aggregate([
                {
                    $match: campaignMatch,
                },
                {
                    $project: {
                        reportDate: 1,
                        orders: 1,
                        sales: 1,
                        spend: 1,
                        clicks: 1,
                        impressions: 1,
                    },
                },
                {
                    $group: {
                        _id: "$reportDate",
                        orders: { $sum: { $ifNull: ["$orders", 0] } },
                        sales: { $sum: { $ifNull: ["$sales", 0] } },
                        spend: { $sum: { $ifNull: ["$spend", 0] } },
                        clicks: { $sum: { $ifNull: ["$clicks", 0] } },
                        impressions: { $sum: { $ifNull: ["$impressions", 0] } },
                    },
                },
            ]).allowDiskUse(true),
            keywordsHourlyPerformanceSchema.aggregate([
                {
                    $match: hourlyMatch,
                },
                {
                    $project: {
                        startTime: 1,
                        orders: 1,
                        sales: 1,
                        spends: 1,
                        clicks: 1,
                        impressions: 1,
                    },
                },
                {
                    $group: {
                        _id: "$startTime",
                        orders: { $sum: { $ifNull: ["$orders", 0] } },
                        sales: { $sum: { $ifNull: ["$sales", 0] } },
                        spend: { $sum: { $ifNull: ["$spends", 0] } },
                        clicks: { $sum: { $ifNull: ["$clicks", 0] } },
                        impressions: { $sum: { $ifNull: ["$impressions", 0] } },
                    },
                },
            ]).allowDiskUse(true),
        ]);

        const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        const dayOfWeekMap = Array.from({ length: 7 }, (_, i) => ({
            dayIndex: i,
            dayName: DAY_NAMES[i],
            fullDayName: FULL_DAY_NAMES[i],
            orders: 0,
            sales: 0,
            spend: 0,
            clicks: 0,
            impressions: 0,
            daysCount: 0,
        }));

        (dailyCampaignData || []).forEach((row) => {
            if (!row._id) return;
            const dayIdx = moment(row._id, "YYYY-MM-DD").day();
            if (dayIdx >= 0 && dayIdx < 7) {
                dayOfWeekMap[dayIdx].orders += Number(row.orders) || 0;
                dayOfWeekMap[dayIdx].sales += Number(row.sales) || 0;
                dayOfWeekMap[dayIdx].spend += Number(row.spend) || 0;
                dayOfWeekMap[dayIdx].clicks += Number(row.clicks) || 0;
                dayOfWeekMap[dayIdx].impressions += Number(row.impressions) || 0;
                dayOfWeekMap[dayIdx].daysCount += 1;
            }
        });

        const totalWeekOrders = dayOfWeekMap.reduce((acc, d) => acc + d.orders, 0);
        const totalWeekSales = round2(dayOfWeekMap.reduce((acc, d) => acc + d.sales, 0));
        const totalWeekSpend = round2(dayOfWeekMap.reduce((acc, d) => acc + d.spend, 0));

        let maxDayOrders = -1;
        let bestDayIdx = 0;

        const rawDayOfWeek = dayOfWeekMap.map((d) => {
            const spend = round2(d.spend);
            const sales = round2(d.sales);
            const orders = d.orders;
            const clicks = d.clicks;
            const impressions = d.impressions;
            const aov = orders > 0 ? round2(sales / orders) : 0;
            const acos = sales > 0 ? round2((spend / sales) * 100) : 0;
            const roas = spend > 0 ? round2(sales / spend) : 0;
            const cvr = clicks > 0 ? round2((orders / clicks) * 100) : 0;
            const cpc = clicks > 0 ? round2(spend / clicks) : 0;
            const orderShare = totalWeekOrders > 0 ? round1((orders / totalWeekOrders) * 100) : 0;
            const salesShare = totalWeekSales > 0 ? round1((sales / totalWeekSales) * 100) : 0;

            if (orders > maxDayOrders) {
                maxDayOrders = orders;
                bestDayIdx = d.dayIndex;
            }

            return {
                dayIndex: d.dayIndex,
                dayName: d.dayName,
                fullDayName: d.fullDayName,
                orders,
                sales,
                aov,
                spend,
                clicks,
                impressions,
                acos,
                roas,
                cvr,
                cpc,
                orderShare,
                salesShare,
                isBestDay: false,
            };
        });

        if (maxDayOrders > 0 && rawDayOfWeek[bestDayIdx]) {
            rawDayOfWeek[bestDayIdx].isBestDay = true;
        }

        // Ordered Mon -> Tue -> Wed -> Thu -> Fri -> Sat -> Sun (indexes: 1, 2, 3, 4, 5, 6, 0)
        const dayOfWeek = [1, 2, 3, 4, 5, 6, 0].map((idx) => rawDayOfWeek[idx]);

        const weekendOrders = (rawDayOfWeek[0]?.orders || 0) + (rawDayOfWeek[6]?.orders || 0);
        const weekdayOrders = totalWeekOrders - weekendOrders;
        const weekendPct = totalWeekOrders > 0 ? round1((weekendOrders / totalWeekOrders) * 100) : 0;
        const weekdayPct = totalWeekOrders > 0 ? round1((weekdayOrders / totalWeekOrders) * 100) : 0;

        // 2. Peak Hours 24-Hour Breakdown across all campaigns (pre-computed in parallel above)

        const formatHourLabel = (h) => {
            if (h === 0) return "12 AM";
            if (h === 12) return "12 PM";
            return h < 12 ? `${h} AM` : `${h - 12} PM`;
        };

        const hoursMap = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            label: formatHourLabel(i),
            orders: 0,
            sales: 0,
            spend: 0,
            clicks: 0,
            impressions: 0,
        }));

        (hourlyData || []).forEach((row) => {
            if (!row._id) return;
            const hour = parseInt(String(row._id).split(":")[0], 10);
            if (!isNaN(hour) && hour >= 0 && hour < 24) {
                hoursMap[hour].orders += Number(row.orders) || 0;
                hoursMap[hour].sales += Number(row.sales) || 0;
                hoursMap[hour].spend += Number(row.spend) || 0;
                hoursMap[hour].clicks += Number(row.clicks) || 0;
                hoursMap[hour].impressions += Number(row.impressions) || 0;
            }
        });

        const sortedHours = [...hoursMap].sort((a, b) => b.orders - a.orders || b.sales - a.sales);
        const top3Hours = new Set(sortedHours.slice(0, 3).filter((h) => h.orders > 0 || h.sales > 0).map((h) => h.hour));

        const peakHoursList = hoursMap.map((h) => {
            const spend = round2(h.spend);
            const sales = round2(h.sales);
            const orders = h.orders;
            const clicks = h.clicks;
            const impressions = h.impressions;
            const aov = orders > 0 ? round2(sales / orders) : 0;
            const acos = sales > 0 ? round2((spend / sales) * 100) : 0;
            const roas = spend > 0 ? round2(sales / spend) : 0;
            const cvr = clicks > 0 ? round2((orders / clicks) * 100) : 0;
            const cpc = clicks > 0 ? round2(spend / clicks) : 0;

            return {
                hour: h.hour,
                label: h.label,
                orders,
                sales,
                aov,
                spend,
                clicks,
                impressions,
                acos,
                roas,
                cvr,
                cpc,
                isPeak: top3Hours.has(h.hour),
            };
        });

        // Sorted descending by peak order volume, then sales volume (matches reference UI!)
        const sortedPeakHours = [...peakHoursList].sort((a, b) => b.orders - a.orders || b.sales - a.sales);

        let maxWindowSum = -1;
        let bestWindowStart = 18;
        for (let i = 0; i < 22; i++) {
            const sum = (hoursMap[i]?.orders || 0) + (hoursMap[i + 1]?.orders || 0) + (hoursMap[i + 2]?.orders || 0);
            if (sum > maxWindowSum) {
                maxWindowSum = sum;
                bestWindowStart = i;
            }
        }
        const peakWindow = `${formatHourLabel(bestWindowStart)} – ${formatHourLabel(bestWindowStart + 3)}`;

        const responsePayload = {
            isSuccess: true,
            data: {
                dayOfWeek,
                dayOfWeekSummary: {
                    totalOrders: totalWeekOrders,
                    totalSales: totalWeekSales,
                    totalSpend: totalWeekSpend,
                    bestDay: rawDayOfWeek[bestDayIdx]?.fullDayName || "N/A",
                    bestDayOrders: rawDayOfWeek[bestDayIdx]?.orders || 0,
                    bestDayShare: rawDayOfWeek[bestDayIdx]?.orderShare || 0,
                    weekendOrders,
                    weekdayOrders,
                    weekendPct,
                    weekdayPct,
                },
                peakHours: sortedPeakHours,
                hourlyChronological: peakHoursList,
                peakHoursSummary: {
                    peakWindow,
                    peakHour: sortedHours[0]?.label || "N/A",
                    peakHourOrders: sortedHours[0]?.orders || 0,
                    peakHourSales: round2(sortedHours[0]?.sales || 0),
                    totalHourlyOrders: hoursMap.reduce((acc, h) => acc + h.orders, 0),
                    totalHourlySales: round2(hoursMap.reduce((acc, h) => acc + h.sales, 0)),
                },
                range: { fromDate, toDate },
            },
        };

        try {
            await setCacheWithLog(cacheKey, JSON.stringify(responsePayload), 900);
        } catch (_) {}

        return res.status(200).json(responsePayload);
    } catch (err) {
        return res.status(500).json({ isSuccess: false, message: err.message });
    }
};
