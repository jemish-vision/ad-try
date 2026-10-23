const moment = require("moment");

const mongoose = require("mongoose");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));

const campaignSchema = require("../models/campaign.model");
const targetingSchema = require("../models/targeting.model");
const productAdsSchema = require("../models/productAds.model");
const roleSchema = require("../models/superAdmin/role.model");
const userSchema = require("../models/user.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");

const { buildWeeklyPerformanceEmail } = require("../../emailTemplate/buildWeeklyPerformanceEmail");
const { sendEmailHelper } = require("../helper/emailHelper");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const { ROLES } = require("../constants/roles");
const { write_logs } = require("../../winston/utility/logger");

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
        const today = moment().tz(timezone).format('YYYY-MM-DD');

        const last7Days = moment().tz(timezone).subtract(7, "day").format('YYYY-MM-DD');
        const last30Days = moment().tz(timezone).subtract(30, "days").startOf("day").format("YYYY-MM-DD");
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
            aggregateData(last7Days, today),
            aggregateData(last30Days, today),
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
                last7Days: { from: fmt(last7Days), to: fmt(today) },
                last30Days: { from: fmt(last30Days), to: fmt(today) },
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