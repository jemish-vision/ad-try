const { write_logs } = require("../../winston/keywords/logger");
const mongoose = require("mongoose");
const searchTermSchema = require("../models/searchTerm.model");
const campaignSchema = require("../models/campaign.model");
const moment = require("moment-timezone");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const mockTestingDataService = require("../services/mockTestingData.service");

exports.getKeywordSuggestions = async (req, res) => {
    if (req.user?.isMockUser) {
        return mockTestingDataService.getKeywordSuggestions(req, res);
    }
    try {
        const configId = req?.config?.configId;
        const { adTypeSearchTermSchema, adTypeCampaignSchema, adTypeTargetingSchema } = req.models || {};
        const adType = req?.adType;

        const {
            profileId,
            pageNo = 1,
            perPage = 10,
            searchName,
            campaignType,
            gridFilter,
            fieldFilters, // For the advanced action filters
            isExactSearchMatch = false,
        } = req.body;

        const _pageNo = Number(pageNo) || 1;
        const _perPage = Number(perPage) || 10;

        if (!profileId) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required." });
        }

        const typedConfigId = (configId && mongoose.Types.ObjectId.isValid(configId)) ? new mongoose.Types.ObjectId(configId) : configId;
        const numericProfileId = Number(profileId);

        const currentDate = moment().format("YYYY-MM-DD");
        const past30Days = moment().subtract(30, 'days').format("YYYY-MM-DD");
        const past14Days = moment().subtract(14, 'days').format("YYYY-MM-DD");
        const past7Days = moment().subtract(7, 'days').format("YYYY-MM-DD");

        const campaignModel = adTypeCampaignSchema || campaignSchema;
        const searchTermBlockModel = mongoose.models.SearchTermBlock || require("../models/searchTermBlocked.model");

        // Run campaign active check and blocked items lookup in parallel
        const [hasActiveCampaigns, blockedItems] = await Promise.all([
            campaignModel.exists({
                configId: typedConfigId,
                profileId: numericProfileId,
                status: "ENABLED",
                reportDate: { $gte: moment().subtract(2, "days").format("YYYY-MM-DD") }
            }),
            searchTermBlockModel.find({
                configId: typedConfigId,
                profileId: numericProfileId
            }).select("campaignId adGroupId searchTerm").lean()
        ]);

        const activeLookupDate = hasActiveCampaigns
            ? past30Days
            : moment().subtract(180, 'days').format("YYYY-MM-DD");

        // Step 1: Pre-discover search terms that generated revenue (sales > 0) in the active window.
        // In search terms, 98%+ of records have 0 sales.
        // Querying distinct candidates first eliminates scanning/grouping 100k+ non-converting docs.
        const candidateTermsQuery = {
            configId: typedConfigId,
            profileId: numericProfileId,
            reportDate: { $gte: activeLookupDate },
            sales: { $gt: 0 },
            ...(campaignType === "MANUAL"
                ? { keywordType: { $in: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] } }
                : campaignType === "AUTO"
                ? { keywordType: { $nin: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] } }
                : {})
        };

        if (searchName) {
            candidateTermsQuery.searchTerm = isExactSearchMatch
                ? searchName
                : { $regex: new RegExp(searchName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i") };
        }

        const candidateTerms = await adTypeSearchTermSchema.distinct("searchTerm", candidateTermsQuery);

        if (!candidateTerms || candidateTerms.length === 0) {
            return res.status(200).send({
                isSuccess: true,
                totalRows: 0,
                result: [],
            });
        }

        // 1. Initial Match (Past 30 Days or 180 Days if paused)
        let matchQuery = {
            configId: typedConfigId,
            profileId: numericProfileId,
            reportDate: { $gte: activeLookupDate },
            searchTerm: { $in: candidateTerms }
        };

        // Filter by Manual or Auto campaign type
        if (campaignType === "MANUAL") {
            matchQuery.keywordType = { $in: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] };
        } else if (campaignType === "AUTO") {
            matchQuery.keywordType = { $nin: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] };
        }

        if (searchName) {
            matchQuery.searchTerm = isExactSearchMatch
                ? searchName
                : { $regex: new RegExp(searchName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i") };
        }

        if (fieldFilters && Object.keys(fieldFilters).length > 0) {
            for (const [key, filterConfig] of Object.entries(fieldFilters)) {
                if (!filterConfig || !filterConfig.value) continue;

                let valArr = filterConfig.value.split(/,|\n/).map(v => v.trim()).filter(Boolean);
                if (valArr.length === 0) continue;
                if (key === "keywordExistsInAccount") continue;

                if (key === "type") {
                    let typePattern = "";
                    if (filterConfig.value.includes("Sponsored Products")) typePattern = "^SP\\b";
                    else if (filterConfig.value.includes("Sponsored Brands")) typePattern = "^SB\\b";
                    else if (filterConfig.value.includes("Sponsored Display")) typePattern = "^SD\\b";

                    if (typePattern) {
                        if (!matchQuery.$or) {
                            matchQuery.$or = [];
                        }
                        matchQuery.$or.push(
                            { campaignName: { $regex: new RegExp(typePattern.trim(), "i") } },
                            { type: filterConfig.value }
                        );
                    }
                    continue;
                }

                let operator = filterConfig.operator;
                let regexArr = valArr.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

                if (operator === "EQUALS" || operator === "SELECT") {
                    matchQuery[key] = { $in: regexArr.map(v => new RegExp("^" + v + "$", "i")) };
                } else if (operator === "CONTAINS") {
                    let regexPattern = regexArr.join("|");
                    matchQuery[key] = { $regex: new RegExp(regexPattern.trim(), "i") };
                } else if (operator === "NOT_CONTAINS") {
                    let regexPattern = regexArr.join("|");
                    matchQuery[key] = { $not: { $regex: new RegExp(regexPattern.trim(), "i") } };
                } else if (operator === "NOT_EQUALS") {
                    matchQuery[key] = { $nin: regexArr.map(v => new RegExp("^" + v + "$", "i")) };
                }
            }
        }

        const pipeline = [
            { $match: matchQuery },
            {
                $project: {
                    searchTerm: 1,
                    campaignId: 1,
                    adGroupId: 1,
                    targeting: 1,
                    campaignName: 1,
                    adGroupName: 1,
                    keywordType: 1,
                    spend: 1,
                    sales: 1,
                    clicks: 1,
                    impressions: 1,
                    reportDate: 1,
                }
            },
            {
                $group: {
                    _id: {
                        searchTerm: "$searchTerm",
                        campaignId: "$campaignId",
                        adGroupId: "$adGroupId",
                    },
                    docId: { $first: "$_id" },
                    targeting: { $first: "$targeting" },
                    campaignName: { $first: "$campaignName" },
                    adGroupName: { $first: "$adGroupName" },
                    keywordType: { $first: "$keywordType" },

                    // 30 Days aggregations
                    spend30d: { $sum: "$spend" },
                    sales30d: { $sum: "$sales" },
                    clicks30d: { $sum: "$clicks" },
                    impr30d: { $sum: "$impressions" },

                    // 14 Days aggregations
                    spend14d: { $sum: { $cond: [{ $gte: ["$reportDate", past14Days] }, "$spend", 0] } },
                    sales14d: { $sum: { $cond: [{ $gte: ["$reportDate", past14Days] }, "$sales", 0] } },
                    clicks14d: { $sum: { $cond: [{ $gte: ["$reportDate", past14Days] }, "$clicks", 0] } },
                    impr14d: { $sum: { $cond: [{ $gte: ["$reportDate", past14Days] }, "$impressions", 0] } },

                    // 7 Days aggregations
                    spend7d: { $sum: { $cond: [{ $gte: ["$reportDate", past7Days] }, "$spend", 0] } },
                    sales7d: { $sum: { $cond: [{ $gte: ["$reportDate", past7Days] }, "$sales", 0] } },
                    clicks7d: { $sum: { $cond: [{ $gte: ["$reportDate", past7Days] }, "$clicks", 0] } },
                    impr7d: { $sum: { $cond: [{ $gte: ["$reportDate", past7Days] }, "$impressions", 0] } },
                }
            },
            // Pre-filter: Only keep revenue generating search terms with clicks > 0 and sales > 0
            { $match: { clicks30d: { $gt: 0 }, sales30d: { $gt: 0 } } }
        ];

        // Filter blocked items directly without slow in-pipeline correlated $lookup
        if (blockedItems && blockedItems.length > 0) {
            const norConditions = blockedItems.map((b) => ({
                "_id.searchTerm": b.searchTerm,
                "_id.campaignId": b.campaignId,
                "_id.adGroupId": b.adGroupId,
            }));
            pipeline.push({ $match: { $nor: norConditions } });
        }

        const hasKeywordExistsFilter = Boolean(fieldFilters && fieldFilters.keywordExistsInAccount && fieldFilters.keywordExistsInAccount.value !== "");

        // If user specifically filtered by keywordExistsInAccount, perform lookup in pipeline
        if (hasKeywordExistsFilter) {
            pipeline.push(
                {
                    $lookup: {
                        from: AD_TYPE_COLLECTIONS?.[adType]?.["targeting"] || "targetings",
                        let: { st: "$_id.searchTerm", type: "$keywordType" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$configId", typedConfigId] },
                                            { $eq: ["$profileId", numericProfileId] },
                                            { $eq: ["$targeting", "$$st"] },
                                            { $eq: ["$status", "ENABLED"] },
                                            { $eq: ["$keywordType", "$$type"] }
                                        ]
                                    }
                                }
                            },
                            { $sort: { reportDate: -1 } },
                            { $limit: 1 },
                            { $project: { _id: 1 } }
                        ],
                        as: "existingKeyword"
                    }
                },
                {
                    $addFields: {
                        keywordExistsInAccount: { $gt: [{ $size: { $ifNull: ["$existingKeyword", []] } }, 0] }
                    }
                }
            );

            const kwExistsValue = fieldFilters.keywordExistsInAccount.value === "true";
            if (kwExistsValue === true) {
                pipeline.push({ $match: { keywordExistsInAccount: true } });
            } else {
                pipeline.push({ $match: { $or: [{ keywordExistsInAccount: false }, { keywordExistsInAccount: { $exists: false } }, { keywordExistsInAccount: null }] } });
            }
        }

        // Sort by 30-day sales before facet pagination
        pipeline.push({ $sort: { sales30d: -1 } });

        // Facet pagination: compute full mathematical projections ONLY on the paginated slice
        const facetPipeline = [
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [
                        { $skip: (_pageNo - 1) * _perPage },
                        { $limit: _perPage },
                        {
                            $project: {
                                _id: 0,
                                id: "$docId",
                                searchTerm: "$_id.searchTerm",
                                campaignId: "$_id.campaignId",
                                adGroupId: "$_id.adGroupId",
                                targeting: 1,
                                campaignName: 1,
                                adGroupName: 1,
                                keywordType: 1,
                                ...(hasKeywordExistsFilter ? { keywordExistsInAccount: 1 } : {}),

                                reason: "revenue generating",

                                days30: {
                                    spend: { $round: ["$spend30d", 2] },
                                    sales: { $round: ["$sales30d", 2] },
                                    clicks: "$clicks30d",
                                    impressions: "$impr30d",
                                    cpc: { $round: [{ $cond: [{ $gt: ["$clicks30d", 0] }, { $divide: ["$spend30d", "$clicks30d"] }, 0] }, 2] },
                                    acos: { $round: [{ $cond: [{ $gt: ["$sales30d", 0] }, { $multiply: [{ $divide: ["$spend30d", "$sales30d"] }, 100] }, 0] }, 2] },
                                    roas: { $round: [{ $cond: [{ $gt: ["$spend30d", 0] }, { $divide: ["$sales30d", "$spend30d"] }, 0] }, 2] },
                                },
                                days14: {
                                    spend: { $round: ["$spend14d", 2] },
                                    sales: { $round: ["$sales14d", 2] },
                                    clicks: "$clicks14d",
                                    impressions: "$impr14d",
                                    cpc: { $round: [{ $cond: [{ $gt: ["$clicks14d", 0] }, { $divide: ["$spend14d", "$clicks14d"] }, 0] }, 2] },
                                    acos: { $round: [{ $cond: [{ $gt: ["$sales14d", 0] }, { $multiply: [{ $divide: ["$spend14d", "$sales14d"] }, 100] }, 0] }, 2] },
                                    roas: { $round: [{ $cond: [{ $gt: ["$spend14d", 0] }, { $divide: ["$sales14d", "$spend14d"] }, 0] }, 2] },
                                },
                                days7: {
                                    spend: { $round: ["$spend7d", 2] },
                                    sales: { $round: ["$sales7d", 2] },
                                    clicks: "$clicks7d",
                                    impressions: "$impr7d",
                                    cpc: { $round: [{ $cond: [{ $gt: ["$clicks7d", 0] }, { $divide: ["$spend7d", "$clicks7d"] }, 0] }, 2] },
                                    acos: { $round: [{ $cond: [{ $gt: ["$sales7d", 0] }, { $multiply: [{ $divide: ["$spend7d", "$sales7d"] }, 100] }, 0] }, 2] },
                                    roas: { $round: [{ $cond: [{ $gt: ["$spend7d", 0] }, { $divide: ["$sales7d", "$spend7d"] }, 0] }, 2] },
                                }
                            }
                        }
                    ],
                },
            },
            {
                $project: {
                    data: 1,
                    totalCount: { $arrayElemAt: ["$metadata.total", 0] },
                },
            },
        ];

        const fullPipeline = [...pipeline, ...facetPipeline];
        const result = await adTypeSearchTermSchema.aggregate(fullPipeline).allowDiskUse(true);

        const data = result[0]?.data || [];
        const totalCount = result[0]?.totalCount || 0;

        // When keywordExistsInAccount was not used as a filter, enrich the paginated rows in a single fast query
        if (!hasKeywordExistsFilter && data.length > 0) {
            const targetingModel = adTypeTargetingSchema || (AD_TYPE_COLLECTIONS?.[adType]?.targetingSchema) || mongoose.models.targeting || require("../models/targeting.model");
            const pageTerms = [...new Set(data.map(d => d.searchTerm).filter(Boolean))];

            // Resolve latest available targeting reportDate so enrichment works even if today's sync is in-flight
            const latestTargetingDoc = await targetingModel.findOne({
                configId: typedConfigId,
                profileId: numericProfileId,
                status: "ENABLED"
            }).sort({ reportDate: -1 }).select("reportDate").lean();
            const targetReportDate = latestTargetingDoc?.reportDate || currentDate;

            const existingKeywords = await targetingModel.find({
                configId: typedConfigId,
                profileId: numericProfileId,
                status: "ENABLED",
                reportDate: targetReportDate,
                targeting: { $in: pageTerms }
            }, { targeting: 1, keywordType: 1 }).lean();

            const existingMap = new Set(existingKeywords.map(k => `${(k.targeting || "").toLowerCase()}_${k.keywordType}`));
            data.forEach(item => {
                item.keywordExistsInAccount = existingMap.has(`${(item.searchTerm || "").toLowerCase()}_${item.keywordType}`);
            });
        }

        return res.status(200).send({
            isSuccess: true,
            totalRows: totalCount,
            result: data,
        });

    } catch (error) {
        write_logs({ message: `[getKeywordSuggestions Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.log("Error fetching Keyword Suggestions", error);
        return res.status(500).send({
            isSuccess: false,
            message: "Something went wrong fetching keyword suggestions.",
            error: "An internal server error occurred"
        });
    }
};

exports.getKeywordUniqueFilterValues = async (req, res) => {
    if (req.user?.isMockUser) {
        return mockTestingDataService.getKeywordUniqueFilterValues(req, res);
    }
    try {
        const configId = req?.config?.configId;
        const { profileId, fieldName, campaignType } = req.body;
        const { adTypeSearchTermSchema } = req.models;

        if (!profileId || !fieldName) {
            return res.status(203).send({ isSuccess: false, message: "Profile id and field name required." });
        }

        const typedConfigId = (configId && mongoose.Types.ObjectId.isValid(configId)) ? new mongoose.Types.ObjectId(configId) : configId;
        const numericProfileId = Number(profileId);

        const past30Days = moment().subtract(30, 'days').format("YYYY-MM-DD");

        let matchQuery = {
            configId: typedConfigId,
            profileId: numericProfileId,
            reportDate: { $gte: past30Days },
            sales: { $gt: 0 }
        };

        if (campaignType === "MANUAL") {
            matchQuery.keywordType = { $in: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] };
        } else if (campaignType === "AUTO") {
            matchQuery.keywordType = { $nin: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] };
        }

        const uniqueValues = await adTypeSearchTermSchema.distinct(fieldName, matchQuery);
        const filteredValues = (uniqueValues || []).filter(v => v !== null && v !== undefined && v !== "").sort();

        return res.status(200).send({
            isSuccess: true,
            data: filteredValues
        });

    } catch (error) {
        write_logs({ message: `[getKeywordUniqueFilterValues Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.log(error);
        return res.status(500).send({ isSuccess: false, message: "Internal server error." });
    }
};
