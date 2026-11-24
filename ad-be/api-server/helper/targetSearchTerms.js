const moment = require("moment-timezone");
const { calcMetrics } = require("./common");

const MAX_NEGATIVE_TERMS = 100;
const METRICS = ["impressions", "clicks", "orders", "spend", "sales"];
const TARGET_TYPES = ["TARGETING_EXPRESSION", "TARGETING_EXPRESSION_PREDEFINED"];
const KEYWORD_MATCH_TYPES = ["NEGATIVE_EXACT", "NEGATIVE_PHRASE"];

function positiveId(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (!/^\d+$/.test(String(value))) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function targetSearchTermScope(body, configId) {
    const { adType, fromDate, toDate } = body;
    const target = /^(?:([KT])-)?(\d+)$/.exec(
        typeof body.targetId === "string" || typeof body.targetId === "number" ? String(body.targetId) : ""
    );
    const keywordId = positiveId(target?.[2]);
    const profileId = positiveId(body.profileId);
    const campaignId = positiveId(body.campaignId);
    const adGroupId = positiveId(body.adGroupId);
    if (!configId || !profileId || !campaignId || !adGroupId || !keywordId || !["SP", "SB"].includes(adType)) return null;

    const hasDates = fromDate !== undefined || toDate !== undefined;
    if (hasDates && (
        typeof fromDate !== "string" || typeof toDate !== "string" ||
        !moment.utc(fromDate, "YYYY-MM-DD", true).isValid() ||
        !moment.utc(toDate, "YYYY-MM-DD", true).isValid() || fromDate > toDate
    )) return null;

    const filter = { configId, profileId, campaignId, adGroupId, keywordId };
    if (hasDates) filter.reportDate = { $gte: fromDate, $lte: toDate };
    const prefix = target[1];
    if (prefix) {
        filter.$or = [
            { prefix },
            { prefix: { $in: [null, ""] }, keywordType: prefix === "T" ? { $in: TARGET_TYPES } : { $nin: TARGET_TYPES } },
        ];
    }
    const isFetchAll = body.fetchAll === true || body.all === true;
    const page = isFetchAll ? 1 : (positiveId(body.page) || positiveId(body.pageNo) || 1);
    const requestedSize = positiveId(body.pageSize) || positiveId(body.perPage);
    const maxLimit = isFetchAll ? 10000 : 5000;
    const pageSize = requestedSize ? Math.min(maxLimit, Math.max(1, requestedSize)) : (isFetchAll ? 10000 : 50);
    return { adType, filter, pagination: { page, pageSize } };
}

// Amazon reports ASIN placements for automatic and product targets. Requiring
// a digit for B-prefixed IDs keeps words such as "basketball" as keyword terms.
const isAsinSearchTerm = (term, isProductTarget) =>
    Boolean(isProductTarget) && /^(?:B(?=[A-Z\d]*\d)[A-Z\d]{9}|\d{10})$/i.test(term);

async function readTargetSearchTerms(model, filter, terms, pagination) {
    const totals = Object.fromEntries(METRICS.map(metric => [metric, 0]));
    const sums = Object.fromEntries(METRICS.map(metric => [metric, { $sum: `$${metric}` }]));
    const basePipeline = [
        { $match: { ...filter, searchTerm: terms ? { $in: terms } : { $type: "string", $ne: "" } } },
        {
            $group: {
                _id: "$searchTerm",
                ...sums,
                isProductTarget: {
                    $max: {
                        $or: [
                            { $eq: ["$prefix", "T"] },
                            { $in: ["$keywordType", TARGET_TYPES] },
                        ],
                    },
                },
            },
        },
        { $sort: { spend: -1, _id: 1 } },
    ];

    if (terms) {
        const grouped = await model.aggregate(basePipeline);
        const searchTerms = grouped.map(({ _id: searchTerm, isProductTarget, ...metrics }) => {
            for (const metric of METRICS) totals[metric] += metrics[metric];
            return { searchTerm, isAsin: isAsinSearchTerm(searchTerm, isProductTarget), ...metrics, ...calcMetrics(metrics) };
        });
        return { searchTerms, totalRow: { ...totals, ...calcMetrics(totals) } };
    }

    const page = Math.max(1, Number(pagination?.page) || 1);
    const pageSize = Math.max(1, Number(pagination?.pageSize) || 50);
    const skip = (page - 1) * pageSize;

    const pipeline = [
        ...basePipeline,
        {
            $facet: {
                paginatedResults: [
                    { $skip: skip },
                    { $limit: pageSize },
                ],
                totalCount: [
                    { $count: "count" },
                ],
            },
        },
    ];

    const result = await model.aggregate(pipeline);
    const isFaceted = Array.isArray(result) && result.length === 1 && result[0] && Array.isArray(result[0].paginatedResults);
    const rows = isFaceted ? result[0].paginatedResults : (Array.isArray(result) ? result.slice(skip, skip + pageSize) : []);
    const totalRecords = isFaceted ? (result[0].totalCount?.[0]?.count || 0) : (Array.isArray(result) ? result.length : 0);

    const searchTerms = rows.map(({ _id: searchTerm, isProductTarget, ...metrics }) => {
        for (const metric of METRICS) totals[metric] += metrics[metric];
        return { searchTerm, isAsin: isAsinSearchTerm(searchTerm, isProductTarget), ...metrics, ...calcMetrics(metrics) };
    });

    return {
        searchTerms,
        totalRecords,
        totalCount: totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
        page,
        pageSize,
        totalRow: { ...totals, ...calcMetrics(totals) },
    };
}

function validateNegativeTerms(terms) {
    if (!Array.isArray(terms) || terms.length < 1 || terms.length > MAX_NEGATIVE_TERMS) return false;
    const seen = new Set();
    return terms.every(item => {
        if (typeof item?.searchTerm !== "string" || !item.searchTerm.trim() || item.searchTerm.length > 512) return false;
        const key = item.searchTerm;
        if (seen.has(key)) return false;
        seen.add(key);
        return item.matchType === "ASIN_SAME_AS" || KEYWORD_MATCH_TYPES.includes(item.matchType);
    });
}

async function submitTargetNegativeTerms({ request, profile, clientId, scope, terms }) {
    const { configId, profileId, campaignId, adGroupId } = scope;
    const results = terms.map(({ searchTerm, matchType }) => ({ searchTerm, matchType, success: false, status: "FAILED" }));
    const groups = [
        {
            rows: results.filter(row => row.matchType !== "ASIN_SAME_AS"),
            path: "negativeKeywords",
            key: "negativeKeywords",
            media: "spNegativeKeyword",
            payload: ({ searchTerm, matchType }) => ({ keywordText: searchTerm, matchType }),
        },
        {
            rows: results.filter(row => row.matchType === "ASIN_SAME_AS"),
            path: "negativeTargets",
            key: "negativeTargetingClauses",
            media: "spNegativeTargetingClause",
            payload: ({ searchTerm }) => ({ expression: [{ type: "ASIN_SAME_AS", value: searchTerm.toUpperCase() }] }),
        },
    ];
    for (const { rows, path, key, media, payload } of groups) {
        if (!rows.length) continue;
        const contentType = `application/vnd.${media}.v3+json`;
        try {
            const response = await request({
                method: "POST",
                url: `${profile.amazonUrl}/sp/${path}`,
                headers: {
                    "Amazon-Advertising-API-ClientId": clientId,
                    "Amazon-Advertising-API-Scope": String(profileId),
                    "Content-Type": contentType,
                    Accept: contentType,
                },
                meta: { configId, profileId, isBackgroundWorker: false },
                data: {
                    [key]: rows.map(row => ({
                        campaignId: String(campaignId), adGroupId: String(adGroupId), state: "ENABLED", ...payload(row),
                    })),
                },
            });
            if (response.status !== 207) continue;
            const details = response.data?.[key];
            for (const item of details?.success || details?.createTargetSuccessResults || []) {
                if (Number.isInteger(item?.index) && rows[item.index]) {
                    Object.assign(rows[item.index], { success: true, status: "NEGATED" });
                }
            }
            for (const item of details?.error || details?.createTargetErrorResults || []) {
                if (!Number.isInteger(item?.index) || !rows[item.index]) continue;
                const duplicate = item.errors?.some(error =>
                    error?.errorType === "duplicateValueError" || error?.errorValue?.duplicateValueError?.reason === "DUPLICATE_VALUE"
                );
                Object.assign(rows[item.index], { success: false, status: duplicate ? "DUPLICATE" : "FAILED" });
            }
        } catch {
            // Each endpoint confirms its own rows. A failure here leaves the other group eligible to run.
        }
    }
    return results;
}

module.exports = {
    targetSearchTermScope,
    readTargetSearchTerms,
    validateNegativeTerms,
    submitTargetNegativeTerms,
};
