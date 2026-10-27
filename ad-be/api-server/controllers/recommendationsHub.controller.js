const moment = require("moment");

const inventorySchema = require("../models/inventory.model");
const productListingSchema = require("../models/productListing.model");
const businessProductSalesSchema = require("../models/businessProductSales.model");
const competitorSchema = require("../models/competitor.model");
const { write_logs } = require("../../winston/utility/logger");

// ─── Tunable thresholds ───────────────────────────────────────────────────────
const RULES = {
    WASTE_TERM_MIN_CLICKS: 3,          // search term must have at least N clicks with 0 orders
    WASTE_CAMPAIGN_MIN_CLICKS: 10,     // campaign / ASIN with 0 sales after N clicks
    HIGH_ACOS_MULTIPLIER: 1.5,         // campaign ACoS > account ACoS × 1.5
    HIGH_ACOS_FLOOR: 30,               // …and ACoS above 30% at minimum
    SCALE_ACOS_MULTIPLIER: 0.6,        // campaign ACoS < account ACoS × 0.6
    SCALE_MIN_ORDERS: 3,
    RESTOCK_LEAD_DAYS: 14,             // horizon used to estimate lost sales from stock-outs
    SALES_DROP_PCT: 25,                // own ASIN sales decline vs previous period
    COMPETITOR_PRICE_GAP_PCT: 10,      // competitor cheaper by ≥ 10%
    TOP_N: 10,
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const buildItem = ({ id, category, type, severity, title, description, entity = {}, metrics = [], impact = null, action = null }) => ({
    id, category, type, severity, title, description, entity, metrics,
    impact: impact ? { type: impact.type, value: impact.value === null ? null : round2(impact.value) } : null,
    action,
});

// ─── ADS ──────────────────────────────────────────────────────────────────────

async function getWastedSearchTerms({ model, baseMatch, fromDate, toDate }) {
    const [result] = await model.aggregate([
        { $match: { ...baseMatch, reportDate: { $gte: fromDate, $lte: toDate }, spend: { $gt: 0 } } },
        {
            $group: {
                _id: { searchTerm: "$searchTerm", campaignId: "$campaignId" },
                campaignName: { $first: "$campaignName" },
                spend: { $sum: "$spend" },
                clicks: { $sum: "$clicks" },
                orders: { $sum: "$orders" },
            },
        },
        { $match: { orders: 0, clicks: { $gte: RULES.WASTE_TERM_MIN_CLICKS }, "_id.searchTerm": { $ne: null } } },
        {
            $facet: {
                total: [{ $group: { _id: null, spend: { $sum: "$spend" }, count: { $sum: 1 } } }],
                top: [{ $sort: { spend: -1 } }, { $limit: RULES.TOP_N }],
            },
        },
    ]).allowDiskUse(true);

    const total = result?.total?.[0] || { spend: 0, count: 0 };
    const items = (result?.top || []).map((r) => buildItem({
        id: `ads-waste-term-${r._id.campaignId}-${r._id.searchTerm}`,
        category: "ads",
        type: "WASTED_SEARCH_TERM",
        severity: r.spend >= total.spend * 0.1 ? "high" : "medium",
        title: `"${r._id.searchTerm}" is spending with zero orders`,
        description: `${r.clicks} clicks in ${r.campaignName || "campaign"} without a single conversion. Consider adding it as a negative keyword.`,
        entity: { name: r._id.searchTerm, campaignId: r._id.campaignId, campaignName: r.campaignName },
        metrics: [
            { label: "Spend", value: round2(r.spend), format: "currency" },
            { label: "Clicks", value: r.clicks, format: "number" },
            { label: "Orders", value: 0, format: "number" },
        ],
        impact: { type: "waste", value: r.spend },
        action: { label: "Add as Negative", route: "/search-term" },
    }));

    return { items, totalWaste: total.spend, totalCount: total.count };
}

async function getCampaignInsights({ model, baseMatch, fromDate, toDate }) {
    const rows = await model.aggregate([
        { $match: { ...baseMatch, reportDate: { $gte: fromDate, $lte: toDate } } },
        {
            $group: {
                _id: "$campaignId",
                name: { $last: "$name" },
                status: { $last: "$status" },
                spend: { $sum: { $ifNull: ["$spend", 0] } },
                sales: { $sum: { $ifNull: ["$sales", 0] } },
                clicks: { $sum: { $ifNull: ["$clicks", 0] } },
                orders: { $sum: { $ifNull: ["$orders", 0] } },
            },
        },
    ]).allowDiskUse(true);

    const totals = rows.reduce((a, r) => ({ spend: a.spend + r.spend, sales: a.sales + r.sales }), { spend: 0, sales: 0 });
    const accountAcos = totals.sales > 0 ? (totals.spend / totals.sales) * 100 : 0;
    const highAcosLimit = Math.max(accountAcos * RULES.HIGH_ACOS_MULTIPLIER, RULES.HIGH_ACOS_FLOOR);
    const minSpend = totals.spend * 0.01;

    const waste = [];
    const scale = [];

    rows.forEach((r) => {
        if (r.status && r.status !== "ENABLED") return;
        const acos = r.sales > 0 ? (r.spend / r.sales) * 100 : null;

        if (r.sales === 0 && r.spend > 0 && r.clicks >= RULES.WASTE_CAMPAIGN_MIN_CLICKS) {
            waste.push({ ...r, acos, excess: r.spend, reason: "NO_SALES" });
        } else if (acos !== null && acos > highAcosLimit && r.spend >= minSpend) {
            const excess = r.spend - (r.sales * accountAcos) / 100;
            if (excess > 0) waste.push({ ...r, acos, excess, reason: "HIGH_ACOS" });
        } else if (acos !== null && accountAcos > 0 && acos < accountAcos * RULES.SCALE_ACOS_MULTIPLIER && r.orders >= RULES.SCALE_MIN_ORDERS) {
            scale.push({ ...r, acos });
        }
    });

    const totalWaste = waste.reduce((s, r) => s + r.excess, 0);

    const wasteItems = waste.sort((a, b) => b.excess - a.excess).slice(0, RULES.TOP_N).map((r) => buildItem({
        id: `ads-campaign-${r.reason}-${r._id}`,
        category: "ads",
        type: r.reason === "NO_SALES" ? "CAMPAIGN_NO_SALES" : "HIGH_ACOS_CAMPAIGN",
        severity: r.reason === "NO_SALES" || r.acos > highAcosLimit * 1.5 ? "high" : "medium",
        title: r.reason === "NO_SALES"
            ? `${r.name} has spend but no sales`
            : `${r.name} ACoS is ${round2(r.acos)}% (account ${round2(accountAcos)}%)`,
        description: r.reason === "NO_SALES"
            ? `${r.clicks} clicks without a sale. Review targeting or pause the campaign.`
            : `Reducing bids to bring ACoS in line with your account average would save the excess spend.`,
        entity: { name: r.name, campaignId: r._id },
        metrics: [
            { label: "Spend", value: round2(r.spend), format: "currency" },
            { label: "Sales", value: round2(r.sales), format: "currency" },
            { label: "ACoS", value: r.acos === null ? null : round2(r.acos), format: "percent" },
        ],
        impact: { type: "waste", value: r.excess },
        action: { label: r.reason === "NO_SALES" ? "Review Campaign" : "Lower Bids", route: "/campaigns" },
    }));

    const scaleItems = scale.sort((a, b) => b.sales - a.sales).slice(0, 5).map((r) => buildItem({
        id: `ads-scale-${r._id}`,
        category: "ads",
        type: "SCALE_CAMPAIGN",
        severity: "low",
        title: `Scale ${r.name} — ACoS ${round2(r.acos)}%`,
        description: `Performing well below your account ACoS of ${round2(accountAcos)}% with ${r.orders} orders. Increase budget or bids to capture more sales.`,
        entity: { name: r.name, campaignId: r._id },
        metrics: [
            { label: "Sales", value: round2(r.sales), format: "currency" },
            { label: "Orders", value: r.orders, format: "number" },
            { label: "ACoS", value: round2(r.acos), format: "percent" },
        ],
        impact: { type: "opportunity", value: r.sales },
        action: { label: "Increase Budget", route: "/campaigns" },
    }));

    return { items: [...wasteItems, ...scaleItems], totalWaste, accountAcos };
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────

async function getInventoryInsights({ profileId, priceMap, productAdsModel, baseMatch, fromDate, toDate }) {
    const rows = await inventorySchema.aggregate([
        { $match: { profileId } },
        {
            $group: {
                _id: "$asin",
                name: { $first: "$name" },
                sku: { $first: "$sku" },
                currentStock: { $sum: { $ifNull: ["$currentStock", 0] } },
                inboundStock: { $sum: { $ifNull: ["$inboundStock", 0] } },
                salesPerDay: { $sum: { $ifNull: ["$salesPerDay", 0] } },
                isDead: { $max: { $cond: [{ $or: [{ $eq: ["$deadInventoryStatus", "DEAD"] }, { $eq: ["$agingBucket", "180+"] }] }, 1, 0] } },
            },
        },
        { $match: { _id: { $ne: null } } },
    ]);

    const items = [];
    let salesAtRisk = 0;
    const oosAsins = [];

    rows.forEach((r) => {
        const listing = priceMap.get(r._id) || {};
        const price = listing.price || 0;
        const daysLeft = r.salesPerDay > 0 ? r.currentStock / r.salesPerDay : Infinity;
        const entity = { name: listing.name || r.name || r._id, asin: r._id, sku: r.sku, image: listing.image };

        if (r.salesPerDay > 0 && r.currentStock <= 0) {
            oosAsins.push(r._id);
            const risk = r.salesPerDay * price * RULES.RESTOCK_LEAD_DAYS;
            salesAtRisk += risk;
            items.push(buildItem({
                id: `inv-oos-${r._id}`, category: "inventory", type: "OUT_OF_STOCK", severity: "high",
                title: `${entity.name} is out of stock`,
                description: `Selling ~${round2(r.salesPerDay)} units/day. ${r.inboundStock > 0 ? `${r.inboundStock} units inbound.` : "No inbound shipment — restock immediately."}`,
                entity,
                metrics: [
                    { label: "Stock", value: 0, format: "number" },
                    { label: "Units/Day", value: round2(r.salesPerDay), format: "number" },
                    { label: "Inbound", value: r.inboundStock, format: "number" },
                ],
                impact: { type: "risk", value: risk },
                action: { label: "Restock", route: "/inventory-management" },
            }));
        } else if (r.salesPerDay > 0 && daysLeft < RULES.RESTOCK_LEAD_DAYS) {
            const coveredDays = (r.currentStock + r.inboundStock) / r.salesPerDay;
            const lostDays = Math.max(0, RULES.RESTOCK_LEAD_DAYS - coveredDays);
            const risk = lostDays * r.salesPerDay * price;
            salesAtRisk += risk;
            items.push(buildItem({
                id: `inv-low-${r._id}`, category: "inventory", type: "LOW_STOCK",
                severity: daysLeft < 7 ? "high" : "medium",
                title: `${entity.name} runs out in ${Math.max(0, Math.floor(daysLeft))} days`,
                description: `Only ${r.currentStock} units left at ~${round2(r.salesPerDay)} units/day.`,
                entity,
                metrics: [
                    { label: "Stock", value: r.currentStock, format: "number" },
                    { label: "Days Left", value: Math.floor(daysLeft), format: "number" },
                    { label: "Inbound", value: r.inboundStock, format: "number" },
                ],
                impact: { type: "risk", value: risk },
                action: { label: "Plan Shipment", route: "/fba-planning" },
            }));
        } else if (r.isDead && r.currentStock > 0) {
            items.push(buildItem({
                id: `inv-dead-${r._id}`, category: "inventory", type: "AGED_INVENTORY", severity: "low",
                title: `${entity.name} is aged / slow-moving`,
                description: `${r.currentStock} units sitting 180+ days. Consider a discount, deal or removal to avoid storage fees.`,
                entity,
                metrics: [
                    { label: "Stock", value: r.currentStock, format: "number" },
                    { label: "Stock Value", value: round2(r.currentStock * price), format: "currency" },
                ],
                impact: { type: "stuck", value: r.currentStock * price },
                action: { label: "Create Deal", route: "/deals" },
            }));
        }
    });

    // Ad spend on out-of-stock ASINs → pure waste
    let wasted = 0;
    if (oosAsins.length && productAdsModel) {
        const adRows = await productAdsModel.aggregate([
            { $match: { ...baseMatch, asins: { $in: oosAsins }, reportDate: { $gte: fromDate, $lte: toDate }, spend: { $gt: 0 } } },
            { $group: { _id: "$asins", spend: { $sum: "$spend" }, campaigns: { $addToSet: "$campaignName" } } },
            { $sort: { spend: -1 } },
        ]);
        adRows.forEach((r) => {
            wasted += r.spend;
            const listing = priceMap.get(r._id) || {};
            items.push(buildItem({
                id: `inv-ads-oos-${r._id}`, category: "inventory", type: "ADS_ON_OOS", severity: "high",
                title: `Ads still running on out-of-stock ${listing.name || r._id}`,
                description: `Active in ${r.campaigns.length} campaign(s). Pause these ads until stock is replenished.`,
                entity: { name: listing.name || r._id, asin: r._id, image: listing.image },
                metrics: [
                    { label: "Spend", value: round2(r.spend), format: "currency" },
                    { label: "Campaigns", value: r.campaigns.length, format: "number" },
                ],
                impact: { type: "waste", value: r.spend },
                action: { label: "Pause Ads", route: "/products" },
            }));
        });
    }

    return { items, salesAtRisk, totalWaste: wasted };
}

// ─── OWN ASINs ────────────────────────────────────────────────────────────────

async function getOwnAsinInsights({ configId, profileId, priceMap, productAdsModel, baseMatch, fromDate, toDate }) {
    const diffDays = moment(toDate).diff(moment(fromDate), "days") + 1;
    const prevFromDate = moment(fromDate).subtract(diffDays, "days").format("YYYY-MM-DD");
    const prevToDate = moment(fromDate).subtract(1, "days").format("YYYY-MM-DD");

    const salesRows = await businessProductSalesSchema.aggregate([
        { $match: { configId, profileId, reportDate: { $gte: prevFromDate, $lte: toDate } } },
        {
            $group: {
                _id: "$asin",
                current: { $sum: { $cond: [{ $gte: ["$reportDate", fromDate] }, "$sales", 0] } },
                previous: { $sum: { $cond: [{ $lte: ["$reportDate", prevToDate] }, "$sales", 0] } },
            },
        },
        { $match: { _id: { $ne: null }, previous: { $gt: 0 } } },
    ]);

    const items = [];
    let salesAtRisk = 0;

    salesRows
        .map((r) => ({ ...r, dropPct: ((r.previous - r.current) / r.previous) * 100, lost: r.previous - r.current }))
        .filter((r) => r.dropPct >= RULES.SALES_DROP_PCT)
        .sort((a, b) => b.lost - a.lost)
        .slice(0, RULES.TOP_N)
        .forEach((r) => {
            salesAtRisk += r.lost;
            const listing = priceMap.get(r._id) || {};
            items.push(buildItem({
                id: `asin-drop-${r._id}`, category: "ownAsins", type: "SALES_DROP",
                severity: r.dropPct >= 50 ? "high" : "medium",
                title: `${listing.name || r._id} sales down ${round2(r.dropPct)}%`,
                description: `Compared with the previous ${diffDays} days. Check Buy Box, pricing, reviews and stock.`,
                entity: { name: listing.name || r._id, asin: r._id, image: listing.image },
                metrics: [
                    { label: "Current", value: round2(r.current), format: "currency" },
                    { label: "Previous", value: round2(r.previous), format: "currency" },
                    { label: "Change", value: round2(-r.dropPct), format: "percent" },
                ],
                impact: { type: "risk", value: r.lost },
                action: { label: "Analyze ASIN", route: "/product-performance" },
            }));
        });

    let wasted = 0;
    if (productAdsModel) {
        const adRows = await productAdsModel.aggregate([
            { $match: { ...baseMatch, reportDate: { $gte: fromDate, $lte: toDate }, asins: { $ne: null } } },
            { $group: { _id: "$asins", spend: { $sum: "$spend" }, clicks: { $sum: "$clicks" }, orders: { $sum: "$orders" } } },
            { $match: { spend: { $gt: 0 }, orders: 0, clicks: { $gte: RULES.WASTE_CAMPAIGN_MIN_CLICKS } } },
            { $sort: { spend: -1 } },
            { $limit: RULES.TOP_N },
        ]);
        adRows.forEach((r) => {
            wasted += r.spend;
            const listing = priceMap.get(r._id) || {};
            items.push(buildItem({
                id: `asin-noconv-${r._id}`, category: "ownAsins", type: "ASIN_NOT_CONVERTING", severity: "medium",
                title: `${listing.name || r._id} gets clicks but no ad orders`,
                description: `${r.clicks} ad clicks without conversion. The listing (images, price, reviews) may need work.`,
                entity: { name: listing.name || r._id, asin: r._id, image: listing.image },
                metrics: [
                    { label: "Spend", value: round2(r.spend), format: "currency" },
                    { label: "Clicks", value: r.clicks, format: "number" },
                    { label: "Orders", value: 0, format: "number" },
                ],
                impact: { type: "waste", value: r.spend },
                action: { label: "Fix Listing", route: "/product-list" },
            }));
        });
    }

    return { items, salesAtRisk, totalWaste: wasted };
}

// ─── COMPETITORS ──────────────────────────────────────────────────────────────

async function getCompetitorInsights({ profileId, priceMap }) {
    const rows = await competitorSchema.aggregate([
        { $match: { profileId, price: { $gt: 0 }, myAsin: { $ne: null } } },
        {
            $group: {
                _id: "$myAsin",
                lowestPrice: { $min: "$price" },
                competitors: { $push: { asin: "$asin", brand: "$brand", price: "$price" } },
            },
        },
    ]);

    const items = [];
    rows.forEach((r) => {
        const listing = priceMap.get(r._id);
        if (!listing?.price) return;
        const cheaper = r.competitors.filter((c) => c.price < listing.price * (1 - RULES.COMPETITOR_PRICE_GAP_PCT / 100));
        if (!cheaper.length) return;
        const gapPct = ((listing.price - r.lowestPrice) / listing.price) * 100;
        const cheapest = cheaper.sort((a, b) => a.price - b.price)[0];
        items.push(buildItem({
            id: `comp-price-${r._id}`, category: "competitors", type: "COMPETITOR_UNDERCUT",
            severity: gapPct >= 25 ? "high" : "medium",
            title: `${cheaper.length} competitor(s) undercut ${listing.name || r._id} by up to ${round2(gapPct)}%`,
            description: `Lowest: ${cheapest.brand || cheapest.asin} at ${round2(cheapest.price)}. Review your pricing or promote with a coupon.`,
            entity: { name: listing.name || r._id, asin: r._id, image: listing.image, competitorAsin: cheapest.asin },
            metrics: [
                { label: "Your Price", value: round2(listing.price), format: "currency" },
                { label: "Lowest Rival", value: round2(r.lowestPrice), format: "currency" },
                { label: "Gap", value: round2(gapPct), format: "percent" },
            ],
            impact: null,
            action: { label: "Review Pricing", route: "/products" },
        }));
    });

    items.sort((a, b) => (b.metrics[2].value || 0) - (a.metrics[2].value || 0));
    return { items: items.slice(0, RULES.TOP_N) };
}

// ─── Controller ───────────────────────────────────────────────────────────────

exports.getRecommendationsHub = async (req, res) => {
    const configId = req?.config?.configId;
    const { adTypeCampaignSchema, adTypeSearchTermSchema, adTypeProductAdsSchema } = req?.models || {};

    try {
        let { profileId, fromDate, toDate } = req.body;
        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile Id is required" });
        }

        profileId = Number(profileId);
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment(toDate).subtract(7, "days").format("YYYY-MM-DD");
        const baseMatch = { configId, profileId };

        const listings = await productListingSchema
            .find({ configId, profileId }, { asin: 1, itemName: 1, sellingPrice: 1, basePrice: 1, imageURL: 1 })
            .lean();
        const priceMap = new Map();
        listings.forEach((l) => {
            if (!l.asin || priceMap.has(l.asin)) return;
            priceMap.set(l.asin, { name: l.itemName, price: l.sellingPrice || l.basePrice || 0, image: l.imageURL });
        });

        const tasks = {
            searchTerms: adTypeSearchTermSchema ? getWastedSearchTerms({ model: adTypeSearchTermSchema, baseMatch, fromDate, toDate }) : null,
            campaigns: adTypeCampaignSchema ? getCampaignInsights({ model: adTypeCampaignSchema, baseMatch, fromDate, toDate }) : null,
            inventory: getInventoryInsights({ profileId, priceMap, productAdsModel: adTypeProductAdsSchema, baseMatch, fromDate, toDate }),
            ownAsins: getOwnAsinInsights({ configId, profileId, priceMap, productAdsModel: adTypeProductAdsSchema, baseMatch, fromDate, toDate }),
            competitors: getCompetitorInsights({ profileId, priceMap }),
        };

        const keys = Object.keys(tasks);
        const settled = await Promise.allSettled(keys.map((k) => tasks[k] || Promise.resolve(null)));
        const out = {};
        settled.forEach((s, i) => {
            if (s.status === "fulfilled") out[keys[i]] = s.value;
            else write_logs?.error?.(`[RecommendationsHub] ${keys[i]} failed: ${s.reason?.message}`);
        });

        const items = [
            ...(out.searchTerms?.items || []),
            ...(out.campaigns?.items || []),
            ...(out.inventory?.items || []),
            ...(out.ownAsins?.items || []),
            ...(out.competitors?.items || []),
        ];

        const severityRank = { high: 0, medium: 1, low: 2 };
        items.sort((a, b) => (severityRank[a.severity] - severityRank[b.severity]) || ((b.impact?.value || 0) - (a.impact?.value || 0)));

        const counts = { all: items.length, ads: 0, inventory: 0, ownAsins: 0, competitors: 0 };
        items.forEach((i) => { counts[i.category] = (counts[i.category] || 0) + 1; });

        const wastedSpend =
            (out.searchTerms?.totalWaste || 0) +
            (out.campaigns?.totalWaste || 0) +
            (out.inventory?.totalWaste || 0) +
            (out.ownAsins?.totalWaste || 0);
        const salesAtRisk = (out.inventory?.salesAtRisk || 0) + (out.ownAsins?.salesAtRisk || 0);

        return res.status(200).json({
            isSuccess: true,
            data: {
                summary: {
                    wastedSpend: round2(wastedSpend),
                    salesAtRisk: round2(salesAtRisk),
                    accountAcos: round2(out.campaigns?.accountAcos || 0),
                    wastedSearchTermCount: out.searchTerms?.totalCount || 0,
                    counts,
                },
                items,
                range: { fromDate, toDate },
            },
        });
    } catch (error) {
        write_logs?.error?.(`[RecommendationsHub] ${error.message}`);
        return res.status(500).json({ isSuccess: false, message: error.message });
    }
};
