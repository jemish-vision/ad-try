const mongoose = require("mongoose");
const moment = require("moment-timezone");

const businessProductSalesSchema = require("../models/businessProductSales.model");
const productAdsSchema = require("../models/productAds.model");
const productListingSchema = require("../models/productListing.model");
const fcInventoryLedgerSchema = require("../models/fcInventoryLedger.model");
const profilesSchema = require("../models/profiles.model");

const MAX_RANGE_DAYS = 365;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Derived ratios (ACoS / TACoS / ROAS) from raw sums */
const derive = (m) => {
  const units = m.units || m.orders || 0;
  const organicSales = round2(Math.max(0, m.sales - m.adSales));
  const organicOrders = Math.max(0, m.orders - m.adOrders);
  const organicUnits = Math.max(0, units - m.adOrders);
  return {
    ...m,
    units,
    sales: round2(m.sales),
    adSpend: round2(m.adSpend),
    adSales: round2(m.adSales),
    organicSales,
    organicOrders,
    organicUnits,
    acos: m.adSales > 0 ? round2((m.adSpend / m.adSales) * 100) : 0,
    tacos: m.sales > 0 ? round2((m.adSpend / m.sales) * 100) : 0,
    roas: m.adSpend > 0 ? round2(m.adSales / m.adSpend) : 0,
    cpc: m.clicks > 0 ? round2(m.adSpend / m.clicks) : 0,
  };
};

const emptyMetrics = () => ({
  sales: 0,
  orders: 0,
  units: 0,
  adSpend: 0,
  adSales: 0,
  adOrders: 0,
  clicks: 0,
  impressions: 0,
  organicSales: 0,
  organicOrders: 0,
  organicUnits: 0,
});

async function resolveIds(profileId, configId) {
  let cleanProfileId = null;
  if (profileId && typeof profileId === "object") {
    cleanProfileId = Number(profileId.value ?? profileId.profileId ?? (Array.isArray(profileId) ? profileId[0] : null));
  } else if (profileId) {
    cleanProfileId = Number(profileId);
  }

  let cleanConfigId = null;
  if (configId && typeof configId === "object") {
    cleanConfigId = configId.configId || configId._id || null;
  } else if (configId && typeof configId === "string") {
    cleanConfigId = configId.trim();
  }

  if ((!cleanConfigId || !mongoose.Types.ObjectId.isValid(cleanConfigId)) && cleanProfileId && !isNaN(cleanProfileId)) {
    try {
      const prof = await profilesSchema.findOne({ profileId: cleanProfileId }).select("configId").lean();
      if (prof?.configId) cleanConfigId = String(prof.configId);
    } catch (e) { }
  }
  return { cleanProfileId, cleanConfigId };
}

/**
 * Builds date buckets matching the screenshot:
 * - Weekly: "WEEK 39", subtitle "SEP 24 - SEP 30"
 * - Monthly: "SEP 2026", subtitle "SEP 01 - SEP 30"
 * - Bi-Weekly: "BI-WEEK 2", subtitle "SEP 17 - SEP 30"
 * - Daily: "SEP 30", subtitle "SEP 30"
 */
function buildBuckets(startDate, endDate, granularity) {
  const buckets = [];
  const start = moment(startDate);
  let bucketEnd = moment(endDate);

  if (granularity === "monthly") {
    while (!bucketEnd.isBefore(start)) {
      let bucketStart = bucketEnd.clone().startOf("month");
      if (bucketStart.isBefore(start)) bucketStart = start.clone();
      const s = bucketStart.format("YYYY-MM-DD");
      const e = bucketEnd.format("YYYY-MM-DD");
      buckets.push({
        key: `${s}_${e}`,
        start: s,
        end: e,
        title: bucketEnd.format("MMM YYYY").toUpperCase(),
        subLabel: `${bucketStart.format("MMM DD").toUpperCase()} - ${bucketEnd.format("MMM DD").toUpperCase()}`,
        label: bucketEnd.format("MMM YYYY").toUpperCase(),
        days: bucketEnd.diff(bucketStart, "days") + 1,
      });
      bucketEnd = bucketStart.clone().subtract(1, "days");
    }
  } else if (granularity === "weekly") {
    while (!bucketEnd.isBefore(start)) {
      let bucketStart = bucketEnd.clone().subtract(6, "days");
      if (bucketStart.isBefore(start)) bucketStart = start.clone();
      const s = bucketStart.format("YYYY-MM-DD");
      const e = bucketEnd.format("YYYY-MM-DD");
      const weekNum = bucketEnd.isoWeek();
      buckets.push({
        key: `${s}_${e}`,
        start: s,
        end: e,
        title: `WEEK ${weekNum}`,
        subLabel: `${bucketStart.format("MMM DD").toUpperCase()} - ${bucketEnd.format("MMM DD").toUpperCase()}`,
        label: `WEEK ${weekNum}`,
        days: bucketEnd.diff(bucketStart, "days") + 1,
      });
      bucketEnd = bucketStart.clone().subtract(1, "days");
    }
  } else if (granularity === "biweekly") {
    let biIdx = 1;
    while (!bucketEnd.isBefore(start)) {
      let bucketStart = bucketEnd.clone().subtract(13, "days");
      if (bucketStart.isBefore(start)) bucketStart = start.clone();
      const s = bucketStart.format("YYYY-MM-DD");
      const e = bucketEnd.format("YYYY-MM-DD");
      buckets.push({
        key: `${s}_${e}`,
        start: s,
        end: e,
        title: `BI-WEEK ${biIdx++}`,
        subLabel: `${bucketStart.format("MMM DD").toUpperCase()} - ${bucketEnd.format("MMM DD").toUpperCase()}`,
        label: `BI-WEEK ${biIdx - 1}`,
        days: bucketEnd.diff(bucketStart, "days") + 1,
      });
      bucketEnd = bucketStart.clone().subtract(1, "days");
    }
  } else {
    // daily
    while (!bucketEnd.isBefore(start)) {
      const s = bucketEnd.format("YYYY-MM-DD");
      buckets.push({
        key: s,
        start: s,
        end: s,
        title: bucketEnd.format("MMM DD").toUpperCase(),
        subLabel: bucketEnd.format("MMM DD").toUpperCase(),
        label: bucketEnd.format("MMM DD").toUpperCase(),
        days: 1,
      });
      bucketEnd = bucketEnd.clone().subtract(1, "days");
    }
  }
  return buckets;
}

/**
 * @route POST /api/seller/product-performance/get-product-trend
 * Product-wise sales / ad spend / orders by daily, weekly, bi-weekly, monthly.
 */
exports.getProductPerformanceTrend = async (req, res) => {
  try {
    const {
      profileId,
      configId,
      startDate,
      endDate,
      granularity = "weekly",
      search,
      sortMetric = "sales",
      sortOrder = "desc",
      page = 1,
      limit: pageLimit = 25,
    } = req.body;

    const validGrans = ["daily", "weekly", "biweekly", "monthly"];
    const gran = validGrans.includes(granularity) ? granularity : "weekly";

    const end = endDate && moment(endDate).isValid() ? moment(endDate) : moment().subtract(1, "days");
    let start = startDate && moment(startDate).isValid() ? moment(startDate) : end.clone().subtract(29, "days");
    if (start.isAfter(end)) start = end.clone();
    if (end.diff(start, "days") + 1 > MAX_RANGE_DAYS) start = end.clone().subtract(MAX_RANGE_DAYS - 1, "days");

    const rangeStart = start.format("YYYY-MM-DD");
    const rangeEnd = end.format("YYYY-MM-DD");
    const buckets = buildBuckets(rangeStart, rangeEnd, gran);

    const { cleanProfileId, cleanConfigId } = await resolveIds(profileId, configId);
    let targetProfileId = cleanProfileId;
    let targetConfigId = cleanConfigId;

    if (!targetProfileId) {
      const foundSale = await businessProductSalesSchema
        .findOne({
          profileId: { $exists: true, $ne: null },
          reportDate: { $gte: rangeStart, $lte: rangeEnd },
        })
        .sort({ reportDate: -1 })
        .select("profileId configId")
        .lean();
      if (foundSale?.profileId) {
        targetProfileId = Number(foundSale.profileId);
        if (!targetConfigId && foundSale.configId) targetConfigId = String(foundSale.configId);
      } else {
        const foundSaleAny = await businessProductSalesSchema
          .findOne({ profileId: { $exists: true, $ne: null } })
          .sort({ reportDate: -1 })
          .select("profileId configId")
          .lean();
        if (foundSaleAny?.profileId) {
          targetProfileId = Number(foundSaleAny.profileId);
          if (!targetConfigId && foundSaleAny.configId) targetConfigId = String(foundSaleAny.configId);
        } else {
          const foundProf = await profilesSchema
            .findOne({ profileId: { $exists: true, $ne: null } })
            .select("profileId configId")
            .lean();
          if (foundProf?.profileId) {
            targetProfileId = Number(foundProf.profileId);
            if (!targetConfigId && foundProf.configId) targetConfigId = String(foundProf.configId);
          }
        }
      }
    }

    // date -> bucket index
    const dateToBucket = new Map();
    buckets.forEach((b, idx) => {
      for (let d = moment(b.start); !d.isAfter(b.end); d.add(1, "days")) {
        dateToBucket.set(d.format("YYYY-MM-DD"), idx);
      }
    });

    const baseMatch = { reportDate: { $gte: rangeStart, $lte: rangeEnd } };
    if (targetProfileId) {
      baseMatch.profileId = targetProfileId;
    }
    if (targetConfigId && mongoose.Types.ObjectId.isValid(targetConfigId)) {
      baseMatch.configId = new mongoose.Types.ObjectId(targetConfigId);
    }

    const [salesRows, adRows] = await Promise.all([
      businessProductSalesSchema.aggregate([
        { $match: { ...baseMatch, asin: { $ne: null } } },
        {
          $group: {
            _id: { asin: "$asin", date: "$reportDate" },
            sku: { $first: "$sku" },
            sales: { $sum: { $add: [{ $ifNull: ["$sales", 0] }, { $ifNull: ["$salesB2B", 0] }] } },
            orders: { $sum: { $add: [{ $ifNull: ["$orders", 0] }, { $ifNull: ["$ordersB2B", 0] }] } },
            units: { $sum: { $add: [{ $ifNull: ["$units", { $ifNull: ["$orders", 0] }] }, { $ifNull: ["$unitsB2B", { $ifNull: ["$ordersB2B", 0] }] }] } },
          },
        },
      ]),
      productAdsSchema.aggregate([
        { $match: { ...baseMatch, asins: { $ne: null } } },
        {
          $group: {
            _id: { asin: "$asins", date: "$reportDate" },
            sku: { $first: "$sku" },
            adSpend: { $sum: "$spend" },
            adSales: { $sum: "$sales" },
            adOrders: { $sum: "$orders" },
            clicks: { $sum: "$clicks" },
            impressions: { $sum: "$impressions" },
          },
        },
      ]),
    ]);

    const products = new Map();
    const getProduct = (asin, sku) => {
      if (!products.has(asin)) {
        products.set(asin, {
          asin,
          sku: sku || "",
          raw: buckets.map(emptyMetrics),
          rawTotal: emptyMetrics(),
        });
      }
      const p = products.get(asin);
      if (!p.sku && sku) p.sku = sku;
      return p;
    };
    const addTo = (p, date, patch) => {
      const idx = dateToBucket.get(date);
      if (idx === undefined) return;
      for (const [k, v] of Object.entries(patch)) {
        p.raw[idx][k] += v || 0;
        p.rawTotal[k] += v || 0;
      }
    };

    for (const r of salesRows) {
      addTo(getProduct(r._id.asin, r.sku), r._id.date, { sales: r.sales, orders: r.orders, units: r.units });
    }
    for (const r of adRows) {
      addTo(getProduct(r._id.asin, r.sku), r._id.date, {
        adSpend: r.adSpend,
        adSales: r.adSales,
        adOrders: r.adOrders,
        clicks: r.clicks,
        impressions: r.impressions,
      });
    }

    const rangeDays = Math.max(1, end.diff(start, "days") + 1);
    const nextStart = end.clone().add(1, "days");
    const nextEnd = nextStart.clone().endOf("month");
    const nextDays = Math.max(1, nextEnd.diff(nextStart, "days") + 1);

    let rows = Array.from(products.values()).map((p) => {
      const totalDerived = derive(p.rawTotal);
      const bucketsDerived = p.raw.map(derive);
      const trendPoints = [...p.raw].reverse().map((b) => round2(b.sales));

      const avgDailySales = rangeDays > 0 ? p.rawTotal.sales / rangeDays : 0;
      const forecastSales = round2(avgDailySales * nextDays * 1.05);
      const lastMonthSales = round2(p.rawTotal.sales);
      const forecastGrowth = lastMonthSales > 0 ? round2(((forecastSales - lastMonthSales) / lastMonthSales) * 100) : 0;

      return {
        asin: p.asin,
        sku: p.sku,
        total: totalDerived,
        buckets: bucketsDerived,
        trend: trendPoints,
        forecast: {
          amount: forecastSales,
          lastMonth: lastMonthSales,
          growth: forecastGrowth,
          periodLabel: `${nextStart.format("MMM 01").toUpperCase()} - ${nextEnd.format("MMM DD").toUpperCase()}`,
        },
        rangeTotal: {
          amount: round2(p.rawTotal.sales),
          periodLabel: `${start.format("MMM DD").toUpperCase()} - ${end.format("MMM DD").toUpperCase()}`,
        },
      };
    });

    // Enrich title / image
    const asinList = rows.map((r) => r.asin);
    const listingMatch = { asin: { $in: asinList } };
    if (targetProfileId) listingMatch.profileId = targetProfileId;
    const listings = await productListingSchema
      .find(listingMatch)
      .select("asin sku itemName imageURL")
      .lean();
    const listingMap = new Map();
    for (const l of listings) {
      if (!listingMap.has(l.asin)) listingMap.set(l.asin, l);
    }
    rows = rows.map((r) => {
      const l = listingMap.get(r.asin);
      return { ...r, sku: r.sku || l?.sku || "", title: l?.itemName || "", imageUrl: l?.imageURL || "" };
    });

    if (search && search.trim()) {
      const raw = search.trim();
      const escapeReg = (s) => s.replace(/[+?^${}()|[\]\\]/g, "\\$&");
      const flex = escapeReg(raw)
        .replace(/[*xX]/g, "[*xX]")
        .replace(/pou[rn]?ch/gi, "pou[unr]?ch")
        .replace(/[-_]/g, "[-_ ]*")
        .replace(/\s+/g, "\\s*");
      const mainRegex = new RegExp(flex, "i");
      const tokens = raw.split(/[\s,]+/).filter((t) => t.length > 1 && t !== "-");
      const tokenRegexes = tokens.map(
        (t) => new RegExp(escapeReg(t).replace(/[*xX]/g, "[*xX]").replace(/pou[rn]?ch/gi, "pou[unr]?ch"), "i")
      );

      rows = rows.filter((r) => {
        const text = `${r.asin || ""} ${r.sku || ""} ${r.title || ""}`;
        if (mainRegex.test(text)) return true;
        if (tokenRegexes.length > 1 && tokenRegexes.every((tr) => tr.test(text))) return true;
        return false;
      });
    }

    // Drop products with no activity in the range
    rows = rows.filter((r) => r.total.sales > 0 || r.total.adSpend > 0 || r.total.orders > 0);

    const metricKey = ["sales", "orders", "adSpend", "adSales", "acos", "tacos", "roas", "clicks", "impressions"].includes(sortMetric)
      ? sortMetric
      : "sales";
    const dir = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
    rows.sort((a, b) => (a.total[metricKey] - b.total[metricKey]) * dir);

    // Grand totals (all matching products) per bucket
    const grandRaw = buckets.map(emptyMetrics);
    const grandTotalRaw = emptyMetrics();
    for (const r of rows) {
      r.buckets.forEach((b, i) => {
        for (const k of Object.keys(grandRaw[i])) grandRaw[i][k] += b[k] || 0;
      });
      for (const k of Object.keys(grandTotalRaw)) grandTotalRaw[k] += r.total[k] || 0;
    }

    const totalRecords = rows.length;
    const skip = (Number(page) - 1) * Number(pageLimit);
    const items = rows.slice(skip, skip + Number(pageLimit));

    // Detailed Stock breakdown (Available, In-Transfer, On-Hand, FC-wise) for the visible page
    const inventoryDetailsMap = new Map();
    if (items.length) {
      const stockFind = { reportDate: { $exists: true, $ne: null } };
      if (targetProfileId) stockFind.profileId = targetProfileId;
      const latest = await fcInventoryLedgerSchema
        .findOne(stockFind)
        .sort({ reportDate: -1 })
        .select("reportDate")
        .lean();
      if (latest?.reportDate) {
        const stockMatch = {
          reportDate: latest.reportDate,
          disposition: "SELLABLE",
          asin: { $in: items.map((i) => i.asin) },
        };
        if (targetProfileId) stockMatch.profileId = targetProfileId;
        const fcRows = await fcInventoryLedgerSchema.aggregate([
          { $match: stockMatch },
          {
            $group: {
              _id: { asin: "$asin", fc: "$fcCode" },
              available: { $sum: "$endingWarehouseBalance" },
              inTransfer: { $sum: "$inTransitBetweenWarehouses" },
            },
          },
          { $sort: { available: -1 } },
        ]);

        for (const row of fcRows) {
          const asin = row._id.asin;
          if (!inventoryDetailsMap.has(asin)) {
            inventoryDetailsMap.set(asin, {
              reportDate: latest.reportDate,
              available: 0,
              inTransfer: 0,
              onHand: 0,
              sellerFlex: 0,
              warehouses: [],
            });
          }
          const det = inventoryDetailsMap.get(asin);
          const avail = row.available || 0;
          const transfer = row.inTransfer || 0;
          det.available += avail;
          det.inTransfer += transfer;
          det.onHand += (avail + transfer);
          if (avail > 0 || transfer > 0) {
            det.warehouses.push({
              fcCode: row._id.fc,
              available: avail,
              inTransfer: transfer,
              qty: avail + transfer,
            });
          }
        }
        // Sort warehouses by qty descending
        for (const det of inventoryDetailsMap.values()) {
          det.warehouses.sort((a, b) => b.qty - a.qty);
        }
      }
    }

    const pagedItems = items.map((it) => {
      const inv = inventoryDetailsMap.get(it.asin);
      return {
        ...it,
        stock: inv ? inv.onHand : (it.total?.stock ?? 0),
        inventoryDetails: inv || {
          reportDate: null,
          available: 0,
          inTransfer: 0,
          onHand: 0,
          sellerFlex: 0,
          warehouses: [],
        },
      };
    });

    return res.status(200).json({
      isSuccess: true,
      message: "Product performance trend fetched successfully.",
      data: {
        granularity: gran,
        startDate: rangeStart,
        endDate: rangeEnd,
        rangeLabel: `${start.format("MMM DD").toUpperCase()} - ${end.format("MMM DD").toUpperCase()}`,
        nextPeriodLabel: `${nextStart.format("MMM 01").toUpperCase()} - ${nextEnd.format("MMM DD").toUpperCase()}`,
        buckets,
        totalRecords,
        currentPage: Number(page),
        grandTotal: { total: derive(grandTotalRaw), buckets: grandRaw.map(derive) },
        items: pagedItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Internal server error fetching product performance trend.",
    });
  }
};
