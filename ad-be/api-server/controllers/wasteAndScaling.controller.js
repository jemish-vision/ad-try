const moment = require("moment");
const { write_logs } = require("../../winston/utility/logger");
const { getCacheWithLog, setCacheWithLog } = require("../services/redis.service");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;



/**
 * Controller: getWasteAndScalingAlerts
 * Phase 5: Waste Spend & Scaling Alerts (Tasks 8 & 9)
 * - Task 8: Waste Spend: Zero-order search terms with spend + high ACoS campaigns.
 * - Task 9: Budget Pacing & Early Out-of-Budget Alerts: High-performing campaigns exhausting budget before 4:00 PM with lost sales calculation.
 */
exports.getWasteAndScalingAlerts = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { adTypeCampaignSchema, adTypeSearchTermSchema } = req?.models || {};

        let {
            profileId,
            fromDate,
            toDate,
            currencyCode = "INR",
            marketplace = "IN",
            zeroOrderPage = 1,
            zeroOrderLimit = 15,
        } = req.body;

        zeroOrderPage = Math.max(1, Number(zeroOrderPage) || 1);
        zeroOrderLimit = Math.max(1, Math.min(100, Number(zeroOrderLimit) || 15));

        const cacheKey = `waste_spend:${profileId}:${configId || "all"}:${fromDate}:${toDate}:${zeroOrderPage}:${zeroOrderLimit}`;
        try {
            const cached = await getCacheWithLog(cacheKey);
            if (cached) {
                return res.status(200).json(typeof cached === "string" ? JSON.parse(cached) : cached);
            }
        } catch (_) {}

        if (!profileId) {
            return res.status(203).json({
                isSuccess: false,
                message: "Profile Id is required",
            });
        }

        profileId = Number(profileId);
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(21, "days").format("YYYY-MM-DD");

        const baseMatch = {
            profileId,
            reportDate: { $gte: fromDate, $lte: toDate },
        };
        if (configId) {
            baseMatch.configId = configId;
        }

        // =====================================================================
        // PART 1: TASK 8 - WASTE SPEND ANALYTICS
        // =====================================================================

        // 1A. Zero-Order Search Terms with Spend
        let zeroOrderSearchTerms = [];
        let totalZeroOrderSpend = 0;
        let totalZeroOrderClicks = 0;
        let zeroOrderTermsCount = 0;

        if (adTypeSearchTermSchema) {
            const stMatch = {
                ...baseMatch,
                spend: { $gt: 0 },
                searchTerm: { $exists: true, $ne: null, $ne: "" },
            };

            const [stAggResult] = await adTypeSearchTermSchema.aggregate([
                { $match: stMatch },
                {
                    $group: {
                        _id: {
                            searchTerm: "$searchTerm",
                            campaignId: "$campaignId",
                        },
                        searchTerm: { $first: "$searchTerm" },
                        campaignId: { $first: "$campaignId" },
                        campaignName: { $first: "$campaignName" },
                        spend: { $sum: { $ifNull: ["$spend", 0] } },
                        clicks: { $sum: { $ifNull: ["$clicks", 0] } },
                        impressions: { $sum: { $ifNull: ["$impressions", 0] } },
                        orders: { $sum: { $ifNull: ["$orders", 0] } },
                    },
                },
                {
                    $match: {
                        orders: 0,
                        clicks: { $gte: 1 },
                    },
                },
                {
                    $facet: {
                        totals: [
                            {
                                $group: {
                                    _id: null,
                                    totalSpend: { $sum: "$spend" },
                                    totalClicks: { $sum: "$clicks" },
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                        topList: [
                            { $sort: { spend: -1 } },
                            { $skip: (zeroOrderPage - 1) * zeroOrderLimit },
                            { $limit: zeroOrderLimit },
                        ],
                    },
                },
            ]).allowDiskUse(true);

            const totals = stAggResult?.totals?.[0] || { totalSpend: 0, totalClicks: 0, count: 0 };
            totalZeroOrderSpend = round2(totals.totalSpend);
            totalZeroOrderClicks = totals.totalClicks;
            zeroOrderTermsCount = totals.count;

            zeroOrderSearchTerms = (stAggResult?.topList || []).map((item, idx) => {
                const spend = round2(item.spend);
                const clicks = item.clicks || 0;
                const impressions = item.impressions || 0;
                const cpc = clicks > 0 ? round2(spend / clicks) : 0;
                const ctr = impressions > 0 ? round2((clicks / impressions) * 100) : 0;

                return {
                    id: `zst-${item.campaignId || idx}-${item.searchTerm}`,
                    searchTerm: item.searchTerm,
                    campaignId: item.campaignId,
                    campaignName: item.campaignName || "Campaign",
                    spend,
                    clicks,
                    impressions,
                    cpc,
                    ctr,
                    orders: 0,
                    action: "Add as Negative",
                };
            });
        }

        // 1B. High ACoS Campaigns & Bleeding Zero-Sales Campaigns
        let highAcosCampaigns = [];
        let totalExcessSpend = 0;
        let highAcosCampaignsCount = 0;
        let totalAccountSpend = 0;
        let totalAccountSales = 0;
        let accountAcos = 0;

        let allCampaignsAgg = [];
        if (adTypeCampaignSchema) {
            allCampaignsAgg = await adTypeCampaignSchema.aggregate([
                { $match: baseMatch },
                {
                    $group: {
                        _id: "$campaignId",
                        campaignId: { $first: "$campaignId" },
                        campaignName: { $last: "$name" },
                        status: { $last: "$status" },
                        budget: { $last: { $ifNull: ["$budget", 0] } },
                        spend: { $sum: { $ifNull: ["$spend", 0] } },
                        sales: { $sum: { $ifNull: ["$sales", 0] } },
                        orders: { $sum: { $ifNull: ["$orders", 0] } },
                        clicks: { $sum: { $ifNull: ["$clicks", 0] } },
                        impressions: { $sum: { $ifNull: ["$impressions", 0] } },
                        timeInBudget: { $last: "$timeInBudget" },
                        budgetTracking: { $last: "$budgetTracking" },
                        isOutOfBudgetFlag: {
                            $max: {
                                $cond: [
                                    {
                                        $or: [
                                            { $eq: ["$status", "OUT_OF_BUDGET"] },
                                            { $eq: ["$isOutOfBudget", true] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                    },
                },
            ]).allowDiskUse(true);

            allCampaignsAgg.forEach((c) => {
                totalAccountSpend += Number(c.spend) || 0;
                totalAccountSales += Number(c.sales) || 0;
            });

            accountAcos = totalAccountSales > 0 ? round2((totalAccountSpend / totalAccountSales) * 100) : 0;
            const highAcosThreshold = Math.max(accountAcos * 1.35, 30);
            const minSpendFloor = Math.max(50, totalAccountSpend * 0.005);

            const bleedingList = [];
            allCampaignsAgg.forEach((c) => {
                if (c.status && c.status === "ARCHIVED") return;

                const spend = round2(c.spend);
                const sales = round2(c.sales);
                const orders = c.orders || 0;
                const clicks = c.clicks || 0;
                const acos = sales > 0 ? round2((spend / sales) * 100) : null;
                const roas = spend > 0 ? round2(sales / spend) : 0;

                if (sales === 0 && spend >= minSpendFloor && clicks >= 5) {
                    // 100% wasted spend
                    bleedingList.push({
                        id: `hac-zero-${c.campaignId}`,
                        campaignId: c.campaignId,
                        campaignName: c.campaignName || `Campaign #${c.campaignId}`,
                        spend,
                        sales: 0,
                        orders: 0,
                        clicks,
                        acos: null,
                        roas: 0,
                        excessSpend: spend,
                        reason: "ZERO_SALES",
                        reasonLabel: "Zero Sales with Spend",
                        severity: "HIGH",
                        action: "Pause / Review",
                    });
                } else if (acos !== null && acos > highAcosThreshold && spend >= minSpendFloor) {
                    const excess = round2(spend - (sales * accountAcos) / 100);
                    if (excess > 0) {
                        bleedingList.push({
                            id: `hac-high-${c.campaignId}`,
                            campaignId: c.campaignId,
                            campaignName: c.campaignName || `Campaign #${c.campaignId}`,
                            spend,
                            sales,
                            orders,
                            clicks,
                            acos,
                            roas,
                            excessSpend: excess,
                            reason: "HIGH_ACOS",
                            reasonLabel: `ACoS ${acos}% exceeds ${round1(highAcosThreshold)}%`,
                            severity: acos > highAcosThreshold * 1.5 ? "HIGH" : "MEDIUM",
                            action: "Lower Bids",
                        });
                    }
                }
            });

            bleedingList.sort((a, b) => b.excessSpend - a.excessSpend);
            highAcosCampaignsCount = bleedingList.length;
            totalExcessSpend = round2(bleedingList.reduce((acc, curr) => acc + curr.excessSpend, 0));
            highAcosCampaigns = bleedingList.slice(0, 25);
        }

        const totalWastedSpend = round2(totalZeroOrderSpend + totalExcessSpend);
        const wastedSpendPct = totalAccountSpend > 0 ? round1((totalWastedSpend / totalAccountSpend) * 100) : 0;

        const responsePayload = {
            isSuccess: true,
            data: {
                wasteSpend: {
                    summary: {
                        totalWastedSpend,
                        wastedSpendPct,
                        totalZeroOrderSpend,
                        zeroOrderTermsCount,
                        totalExcessSpend,
                        highAcosCampaignsCount,
                        accountAcos,
                        totalAccountSpend: round2(totalAccountSpend),
                        totalAccountSales: round2(totalAccountSales),
                    },
                    zeroOrderSearchTerms,
                    page: zeroOrderPage,
                    limit: zeroOrderLimit,
                    totalCount: zeroOrderTermsCount,
                    hasMore: (zeroOrderPage * zeroOrderLimit) < zeroOrderTermsCount,
                    highAcosCampaigns,
                },
                currencyCode,
                marketplace,
                range: { fromDate, toDate },
            },
        };

        try {
            await setCacheWithLog(cacheKey, JSON.stringify(responsePayload), 180);
        } catch (_) {}

        return res.status(200).json(responsePayload);
    } catch (err) {
        write_logs?.error?.(`[getWasteAndScalingAlerts Error] ${err.message}`);
        return res.status(500).json({
            isSuccess: false,
            message: err.message || "Internal server error occurred",
        });
    }
};
