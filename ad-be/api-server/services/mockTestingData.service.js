const moment = require("moment-timezone");
const MockTestingData = require("../models/mockTestingData.model");

let isSeededCache = false;

const MOCK_PROFILE_ID = 99999901;

const AD_TYPE_LABEL = {
  SP: "Sponsored Products",
  SB: "Sponsored Brands",
  SD: "Sponsored Display",
};

/**
 * Helper to compute derived advertising KPIs consistently
 */
function computeMetrics(item) {
  const impressions = Number(item.impressions || item.totalImpressions || 0);
  const clicks = Number(item.clicks || item.totalClicks || 0);
  const spend = Number(Number(item.spend ?? item.totalSpend ?? 0).toFixed(2));
  const sales = Number(Number(item.sales ?? item.totalSales ?? 0).toFixed(2));
  const orders = Number(item.orders ?? item.totalOrders ?? 0);
  const units = Number(item.units ?? item.totalUnits ?? orders);

  const cpc = clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0;
  const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
  const cvr = clicks > 0 ? Number(((orders / clicks) * 100).toFixed(2)) : 0;
  const acos = sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0;
  const roas = spend > 0 ? Number((sales / spend).toFixed(2)) : 0;

  return {
    impressions,
    clicks,
    spend,
    sales,
    orders,
    units,
    cpc,
    ctr,
    cvr,
    conversion: cvr,
    conversionRate: cvr,
    acos,
    roas,
  };
}

/**
 * Compute a standard totalRow for tables
 */
function buildTotalRow(rows = [], labelField = "name") {
  const totals = rows.reduce(
    (acc, r) => {
      acc.impressions += Number(r.impressions ?? r.totalImpressions ?? 0);
      acc.clicks += Number(r.clicks ?? r.totalClicks ?? 0);
      acc.spend += Number(r.spend ?? r.totalSpend ?? 0);
      acc.sales += Number(r.sales ?? r.totalSales ?? 0);
      acc.orders += Number(r.orders ?? r.totalOrders ?? 0);
      acc.units += Number(r.units ?? r.totalUnits ?? r.orders ?? 0);
      acc.budget += Number(r.budget ?? 0);
      return acc;
    },
    { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0, budget: 0 }
  );

  const metrics = computeMetrics(totals);
  return {
    [labelField]: "Total",
    isTotalRow: true,
    budget: Number(totals.budget.toFixed(2)),
    ...metrics,
    totalImpressions: metrics.impressions,
    totalClicks: metrics.clicks,
    totalSpend: metrics.spend,
    totalSales: metrics.sales,
    totalOrders: metrics.orders,
    totalUnits: metrics.units,
    totalCpc: metrics.cpc,
    totalCtr: metrics.ctr,
    totalCvr: metrics.cvr,
    totalAcos: metrics.acos,
    totalRoas: metrics.roas,
  };
}

/**
 * Generic search, sort, and paginate utility
 */
function filterSortPaginate(items, { searchName, searchFields = [], status, fieldName, sortType, pageNo = 1, perPage = 10 }) {
  let filtered = [...items];

  if (status && status !== "ALL") {
    const statusUpper = String(status).toUpperCase();
    filtered = filtered.filter((item) => String(item.status || item.campaignStatus || "").toUpperCase() === statusUpper);
  }

  if (searchName && String(searchName).trim()) {
    const q = String(searchName).trim().toLowerCase();
    filtered = filtered.filter((item) =>
      searchFields.some((f) => String(item[f] || "").toLowerCase().includes(q))
    );
  }

  if (fieldName && sortType) {
    const dir = String(sortType).toUpperCase() === "ASC" ? 1 : -1;
    filtered.sort((a, b) => {
      const aVal = a[fieldName] ?? 0;
      const bVal = b[fieldName] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return dir === 1 ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return dir === 1 ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
  }

  const page = Math.max(Number(pageNo) || 1, 1);
  const limit = Math.max(Number(perPage) || 10, 1);
  const totalRecords = filtered.length;
  const totalPages = Math.max(Math.ceil(totalRecords / limit), 1);
  const data = filtered.slice((page - 1) * limit, page * limit);

  return {
    allFiltered: filtered,
    data,
    currentPageNo: page,
    perPage: limit,
    totalRecords,
    totalPages,
  };
}

/**
 * Generate default seed documents across all 11 modules stored in `mock_testing_data`
 */
function buildDefaultMockDocuments() {
  const today = moment().format("YYYY-MM-DD");
  const startOfMonth = moment().subtract(20, "days").format("YYYY-MM-DD");
  const nextMonth = moment().add(30, "days").format("YYYY-MM-DD");
  const docs = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. PRODUCT LIST & PRODUCT ADS (`PRODUCT_LIST`)
  // ─────────────────────────────────────────────────────────────────────────────
  const baseProducts = [
    {
      asin: "B0MOCK0001",
      sku: "APEX-EARBUDS-PRO",
      itemName: "ApexGear Wireless Noise Cancelling Earbuds Pro - Bluetooth 5.3",
      title: "ApexGear Wireless Noise Cancelling Earbuds Pro - Bluetooth 5.3",
      imageURL: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
      imageUrl: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
      price: 59.99,
      amount: 59.99,
      sellingPrice: 59.99,
      basePrice: 18.5,
      productCost: 18.5,
      status: "Active",
      fulfillmentChannel: "FBA",
      quantity: 340,
      isFavorite: true,
      brand: "ApexGear",
    },
    {
      asin: "B0MOCK0002",
      sku: "APEX-SMARTWATCH-X1",
      itemName: "ApexGear Fitness Smart Watch X1 with Heart Rate & Sleep Monitor",
      title: "ApexGear Fitness Smart Watch X1 with Heart Rate & Sleep Monitor",
      imageURL: "https://m.media-amazon.com/images/I/71Swqqe7XAL._AC_SL1500_.jpg",
      imageUrl: "https://m.media-amazon.com/images/I/71Swqqe7XAL._AC_SL1500_.jpg",
      price: 89.99,
      amount: 89.99,
      sellingPrice: 89.99,
      basePrice: 27.0,
      productCost: 27.0,
      status: "Active",
      fulfillmentChannel: "FBA",
      quantity: 215,
      isFavorite: true,
      brand: "ApexGear",
    },
  ];
  const products = new Proxy(baseProducts, {
    get(target, prop) {
      if (typeof prop === "string" && !isNaN(prop)) {
        const idx = Number(prop);
        return target[idx % target.length];
      }
      return target[prop];
    }
  });

  products.forEach((p, idx) => {
    docs.push({
      userId: null,
      moduleType: "PRODUCT_LIST",
      subType: "MAIN",
      adType: "SP",
      recordId: p.asin,
      parentId: null,
      isDefault: true,
      data: {
        ...p,
        profileId: MOCK_PROFILE_ID,
        openDate: startOfMonth,
        reportDate: today,
      },
    });

    // Also create Product Ad entries
    const adMetrics = computeMetrics({
      impressions: 18500 - idx * 2100,
      clicks: 640 - idx * 75,
      spend: 420 - idx * 52,
      sales: 1980 - idx * 240,
      orders: 34 - idx * 4,
    });
    const campaignId = 800001 + (idx % 4);
    const adGroupId = 810001 + (idx % 4);
    docs.push({
      userId: null,
      moduleType: "PRODUCT_LIST",
      subType: "PRODUCT_AD",
      adType: "SP",
      recordId: `AD-${820001 + idx}`,
      parentId: String(campaignId),
      isDefault: true,
      data: {
        adId: 820001 + idx,
        sku: p.sku,
        asins: p.asin,
        asin: p.asin,
        status: "ENABLED",
        campaignId,
        adGroupId,
        productName: p.title,
        imageUrl: p.imageUrl,
        price: p.price,
        ...adMetrics,
        totalSpend: adMetrics.spend,
        totalSales: adMetrics.sales,
        totalImpressions: adMetrics.impressions,
        totalClicks: adMetrics.clicks,
        totalOrders: adMetrics.orders,
        totalCpc: adMetrics.cpc,
        totalCtr: adMetrics.ctr,
        totalCvr: adMetrics.cvr,
        totalAcos: adMetrics.acos,
        totalRoas: adMetrics.roas,
        productData: {
          title: p.title,
          imageUrl: p.imageUrl,
        },
        campaigns: [
          {
            campaignId,
            adGroupId,
            name: `SP | ${p.sku} | Exact & Phrase`,
            status: "ENABLED",
            ...adMetrics,
          },
        ],
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CAMPAIGNS & AD GROUPS (`CAMPAIGN`)
  // ─────────────────────────────────────────────────────────────────────────────
  const campaigns = [
    {
      campaignId: 800001,
      name: "SP | Wireless Earbuds Pro | Exact Match",
      adType: "SP",
      type: "Sponsored Products",
      targetingType: "MANUAL",
      status: "ENABLED",
      budget: 120,
      budgetType: "DAILY",
      biddingStrategy: "LEGACY_FOR_SALES",
      startDate: startOfMonth,
      endDate: null,
      impressions: 64200,
      clicks: 2150,
      spend: 1462.0,
      sales: 6840.0,
      orders: 114,
      units: 126,
      asin: "B0MOCK0001",
      sku: "APEX-EARBUDS-PRO",
    },
    {
      campaignId: 800002,
      name: "SP | Smart Watch X1 | Auto Discovery",
      adType: "SP",
      type: "Sponsored Products",
      targetingType: "AUTO",
      status: "ENABLED",
      budget: 85,
      budgetType: "DAILY",
      biddingStrategy: "AUTO_FOR_SALES",
      startDate: startOfMonth,
      endDate: null,
      impressions: 48900,
      clicks: 1580,
      spend: 1090.2,
      sales: 4950.0,
      orders: 55,
      units: 59,
      asin: "B0MOCK0002",
      sku: "APEX-SMARTWATCH-X1",
    },
  ];

  campaigns.forEach((c, idx) => {
    const m = computeMetrics(c);
    const prod = products.find((p) => p.asin === c.asin) || products[0];
    docs.push({
      userId: null,
      moduleType: "CAMPAIGN",
      subType: "MAIN",
      adType: c.adType,
      recordId: String(c.campaignId),
      parentId: null,
      isDefault: true,
      data: {
        ...c,
        ...m,
        totalSpend: m.spend,
        totalSales: m.sales,
        totalImpressions: m.impressions,
        totalClicks: m.clicks,
        totalOrders: m.orders,
        totalUnits: m.units,
        totalCpc: m.cpc,
        totalAcos: m.acos,
        totalRoas: m.roas,
        totalCtr: m.ctr,
        totalCvr: m.cvr,
        reportDate: today,
      },
    });

    // Ad Group for each campaign
    const adGroupId = 810001 + idx;
    docs.push({
      userId: null,
      moduleType: "CAMPAIGN",
      subType: "AD_GROUP",
      adType: c.adType,
      recordId: String(adGroupId),
      parentId: String(c.campaignId),
      isDefault: true,
      data: {
        adGroupId,
        campaignId: c.campaignId,
        campaignName: c.name,
        name: `${c.name} - AdGroup 1`,
        defaultBid: 1.25,
        bid: 1.25,
        status: c.status,
        type: c.type,
        sku: prod.sku,
        asin: prod.asin,
        productName: prod.title,
        imageUrl: prod.imageUrl,
        amount: prod.price,
        ...m,
        totalSpend: m.spend,
        totalSales: m.sales,
        totalImpressions: m.impressions,
        totalClicks: m.clicks,
        totalOrders: m.orders,
        totalCpc: m.cpc,
        totalAcos: m.acos,
        totalRoas: m.roas,
        totalCtr: m.ctr,
        totalCvr: m.cvr,
        productAdsCount: 2,
        keywordsCount: 4,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TARGETING & KEYWORD SUGGESTIONS (`TARGETING`)
  // ─────────────────────────────────────────────────────────────────────────────
  const targets = [
    {
      targetId: "T-900001",
      keywordId: 900001,
      targeting: "wireless noise cancelling earbuds",
      keywordText: "wireless noise cancelling earbuds",
      matchType: "EXACT",
      keywordType: "KEYWORD",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      status: "ENABLED",
      bid: 1.45,
      keywordBid: 1.45,
      impressions: 24500,
      clicks: 890,
      spend: 596.3,
      sales: 2999.5,
      orders: 50,
    },
    {
      targetId: "T-900002",
      keywordId: 900002,
      targeting: "bluetooth 5.3 earbuds waterproof",
      keywordText: "bluetooth 5.3 earbuds waterproof",
      matchType: "EXACT",
      keywordType: "KEYWORD",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      status: "ENABLED",
      bid: 1.35,
      keywordBid: 1.35,
      impressions: 19800,
      clicks: 710,
      spend: 482.8,
      sales: 2279.62,
      orders: 38,
    },
    {
      targetId: "T-900003",
      keywordId: 900003,
      targeting: "fitness tracker smart watch heart rate",
      keywordText: "fitness tracker smart watch heart rate",
      matchType: "PHRASE",
      keywordType: "KEYWORD",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800002,
      campaignName: "SP | Smart Watch X1 | Auto Discovery",
      campaignStatus: "ENABLED",
      adGroupId: 810002,
      adGroupName: "SP | Smart Watch X1 | Auto Discovery - AdGroup 1",
      status: "ENABLED",
      bid: 1.2,
      keywordBid: 1.2,
      impressions: 28400,
      clicks: 940,
      spend: 648.6,
      sales: 3149.65,
      orders: 35,
    },
    {
      targetId: "T-900004",
      keywordId: 900004,
      targeting: "65w usb c fast charger block",
      keywordText: "65w usb c fast charger block",
      matchType: "BROAD",
      keywordType: "KEYWORD",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800003,
      campaignName: "SP | 65W GaN Charger | Broad & Phrase",
      campaignStatus: "ENABLED",
      adGroupId: 810003,
      adGroupName: "SP | 65W GaN Charger | Broad & Phrase - AdGroup 1",
      status: "ENABLED",
      bid: 0.95,
      keywordBid: 0.95,
      impressions: 22100,
      clicks: 780,
      spend: 468.0,
      sales: 2169.38,
      orders: 62,
    },
    {
      targetId: "T-900005",
      keywordId: 900005,
      targeting: "portable charger 20000mah fast charging",
      keywordText: "portable charger 20000mah fast charging",
      matchType: "EXACT",
      keywordType: "KEYWORD",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800004,
      campaignName: "SP | PowerBank 20K | Competitor ASIN Defense",
      campaignStatus: "PAUSED",
      adGroupId: 810004,
      adGroupName: "SP | PowerBank 20K | Competitor ASIN Defense - AdGroup 1",
      status: "PAUSED",
      bid: 1.1,
      keywordBid: 1.1,
      impressions: 12400,
      clicks: 380,
      spend: 319.2,
      sales: 1124.75,
      orders: 25,
    },
    {
      targetId: "T-900006",
      keywordId: 900006,
      targeting: 'asin="B09COMPET1"',
      keywordText: 'asin="B09COMPET1"',
      matchType: "TARGETING_EXPRESSION",
      keywordType: "TARGET",
      targetingType: "TARGET",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800004,
      campaignName: "SP | PowerBank 20K | Competitor ASIN Defense",
      campaignStatus: "PAUSED",
      adGroupId: 810004,
      adGroupName: "SP | PowerBank 20K | Competitor ASIN Defense - AdGroup 1",
      status: "ENABLED",
      bid: 1.05,
      keywordBid: 1.05,
      impressions: 9400,
      clicks: 230,
      spend: 199.3,
      sales: 674.85,
      orders: 15,
    },
    {
      targetId: "T-900007",
      keywordId: 900007,
      targeting: "apexgear wireless audio",
      keywordText: "apexgear wireless audio",
      matchType: "EXACT",
      keywordType: "KEYWORD",
      targetingType: "KEYWORD",
      adType: "SB",
      type: "Sponsored Brands",
      campaignId: 800005,
      campaignName: "SB | ApexGear Brand Store | Headline Search",
      campaignStatus: "ENABLED",
      adGroupId: 810005,
      adGroupName: "SB | ApexGear Brand Store | Headline Search - AdGroup 1",
      status: "ENABLED",
      bid: 1.6,
      keywordBid: 1.6,
      impressions: 31200,
      clicks: 920,
      spend: 736.0,
      sales: 3420.0,
      orders: 54,
    },
    {
      targetId: "T-900008",
      keywordId: 900008,
      targeting: "views-remarketing-30d",
      keywordText: "views-remarketing-30d",
      matchType: "TARGETING_EXPRESSION_PREDEFINED",
      keywordType: "TARGETING_EXPRESSION_PREDEFINED",
      targetingType: "AUTO",
      adType: "SD",
      type: "Sponsored Display",
      campaignId: 800006,
      campaignName: "SD | ApexGear Retargeting | Views Remarketing",
      campaignStatus: "ENABLED",
      adGroupId: 810006,
      adGroupName: "SD | ApexGear Retargeting | Views Remarketing - AdGroup 1",
      status: "ENABLED",
      bid: 0.85,
      keywordBid: 0.85,
      topOfSearchImpressionShare: 31.4,
      impressions: 34600,
      clicks: 820,
      spend: 615.0,
      sales: 2580.0,
      orders: 43,
    },
    {
      targetId: "T-900009",
      keywordId: 900009,
      targeting: "active noise cancelling earbuds for flights",
      keywordText: "active noise cancelling earbuds for flights",
      matchType: "PHRASE",
      keywordType: "PHRASE",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      status: "ENABLED",
      bid: 1.38,
      keywordBid: 1.38,
      topOfSearchImpressionShare: 46.8,
      impressions: 18400,
      clicks: 640,
      spend: 435.2,
      sales: 2159.64,
      orders: 36,
    },
    {
      targetId: "T-900010",
      keywordId: 900010,
      targeting: "workout gym wireless earbuds",
      keywordText: "workout gym wireless earbuds",
      matchType: "BROAD",
      keywordType: "BROAD",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      status: "ENABLED",
      bid: 1.15,
      keywordBid: 1.15,
      topOfSearchImpressionShare: 34.2,
      impressions: 15900,
      clicks: 510,
      spend: 336.6,
      sales: 1619.73,
      orders: 27,
    },
    {
      targetId: "T-900011",
      keywordId: 900011,
      targeting: "mens fitness smartwatch blood oxygen",
      keywordText: "mens fitness smartwatch blood oxygen",
      matchType: "EXACT",
      keywordType: "EXACT",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800002,
      campaignName: "SP | Smart Watch X1 | Auto Discovery",
      campaignStatus: "ENABLED",
      adGroupId: 810002,
      adGroupName: "SP | Smart Watch X1 | Auto Discovery - AdGroup 1",
      status: "ENABLED",
      bid: 1.52,
      keywordBid: 1.52,
      topOfSearchImpressionShare: 52.1,
      impressions: 21300,
      clicks: 740,
      spend: 532.8,
      sales: 2609.71,
      orders: 29,
    },
    {
      targetId: "T-900012",
      keywordId: 900012,
      targeting: "usb c laptop charger 65w foldable",
      keywordText: "usb c laptop charger 65w foldable",
      matchType: "EXACT",
      keywordType: "EXACT",
      targetingType: "KEYWORD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800003,
      campaignName: "SP | 65W GaN Charger | Broad & Phrase",
      campaignStatus: "ENABLED",
      adGroupId: 810003,
      adGroupName: "SP | 65W GaN Charger | Broad & Phrase - AdGroup 1",
      status: "ENABLED",
      bid: 1.08,
      keywordBid: 1.08,
      topOfSearchImpressionShare: 49.5,
      impressions: 19200,
      clicks: 690,
      spend: 414.0,
      sales: 1959.44,
      orders: 56,
    },
    {
      targetId: "T-900013",
      keywordId: 900013,
      targeting: 'asin="B08EARBUD2"',
      keywordText: 'asin="B08EARBUD2"',
      matchType: "TARGETING_EXPRESSION",
      keywordType: "TARGETING_EXPRESSION",
      targetingType: "TARGET",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      status: "ENABLED",
      bid: 1.25,
      keywordBid: 1.25,
      topOfSearchImpressionShare: 28.4,
      impressions: 14200,
      clicks: 430,
      spend: 309.6,
      sales: 1439.76,
      orders: 24,
    },
    {
      targetId: "T-900014",
      keywordId: 900014,
      targeting: 'category="Headphones & Earbuds" price<70',
      keywordText: 'category="Headphones & Earbuds" price<70',
      matchType: "TARGETING_EXPRESSION",
      keywordType: "TARGETING_EXPRESSION",
      targetingType: "TARGET",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      status: "ENABLED",
      bid: 0.98,
      keywordBid: 0.98,
      topOfSearchImpressionShare: 22.9,
      impressions: 16800,
      clicks: 490,
      spend: 328.3,
      sales: 1319.78,
      orders: 22,
    },
    {
      targetId: "T-900015",
      keywordId: 900015,
      targeting: "close-match",
      keywordText: "close-match",
      matchType: "TARGETING_EXPRESSION_PREDEFINED",
      keywordType: "TARGETING_EXPRESSION_PREDEFINED",
      targetingType: "AUTO",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800002,
      campaignName: "SP | Smart Watch X1 | Auto Discovery",
      campaignStatus: "ENABLED",
      adGroupId: 810002,
      adGroupName: "SP | Smart Watch X1 | Auto Discovery - AdGroup 1",
      status: "ENABLED",
      bid: 1.18,
      keywordBid: 1.18,
      topOfSearchImpressionShare: 41.2,
      impressions: 24100,
      clicks: 790,
      spend: 521.4,
      sales: 2519.72,
      orders: 28,
    },
    {
      targetId: "T-900016",
      keywordId: 900016,
      targeting: "substitutes",
      keywordText: "substitutes",
      matchType: "TARGETING_EXPRESSION_PREDEFINED",
      keywordType: "TARGETING_EXPRESSION_PREDEFINED",
      targetingType: "AUTO",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800002,
      campaignName: "SP | Smart Watch X1 | Auto Discovery",
      campaignStatus: "ENABLED",
      adGroupId: 810002,
      adGroupName: "SP | Smart Watch X1 | Auto Discovery - AdGroup 1",
      status: "ENABLED",
      bid: 0.92,
      keywordBid: 0.92,
      topOfSearchImpressionShare: 27.6,
      impressions: 13600,
      clicks: 410,
      spend: 266.5,
      sales: 1259.86,
      orders: 14,
    },
    {
      targetId: "T-900017",
      keywordId: 900017,
      targeting: "smartwatch fitness tracker waterproof",
      keywordText: "smartwatch fitness tracker waterproof",
      matchType: "PHRASE",
      keywordType: "PHRASE",
      targetingType: "KEYWORD",
      adType: "SB",
      type: "Sponsored Brands",
      campaignId: 800005,
      campaignName: "SB | ApexGear Brand Store | Headline Search",
      campaignStatus: "ENABLED",
      adGroupId: 810005,
      adGroupName: "SB | ApexGear Brand Store | Headline Search - AdGroup 1",
      status: "ENABLED",
      bid: 1.48,
      keywordBid: 1.48,
      topOfSearchImpressionShare: 44.0,
      impressions: 22900,
      clicks: 710,
      spend: 539.6,
      sales: 2519.72,
      orders: 28,
    },
  ];

  targets.forEach((t) => {
    const m = computeMetrics(t);
    const normalizedKeywordType =
      t.keywordType === "KEYWORD"
        ? t.matchType || "EXACT"
        : t.keywordType === "TARGET"
          ? "TARGETING_EXPRESSION"
          : t.keywordType || t.matchType || "EXACT";
    docs.push({
      userId: null,
      moduleType: "TARGETING",
      subType: "MAIN",
      adType: t.adType,
      recordId: String(t.targetId),
      parentId: String(t.campaignId),
      isDefault: true,
      data: {
        ...t,
        keywordType: normalizedKeywordType,
        topOfSearchImpressionShare: t.topOfSearchImpressionShare ?? 42.5,
        ...m,
        reportDate: today,
      },
    });
  });

  // Keyword Suggestions (`TARGETING`, `subType: "SUGGESTION"`)
  const suggestions = [
    { keywordText: "noise cancelling earbuds for work", matchType: "EXACT", bid: 1.42, rangeStart: 0.95, rangeEnd: 1.85, theme: "High Conversion", impressions: 14200, clicks: 520, orders: 31, spend: 312, sales: 1859 },
    { keywordText: "gym workout bluetooth earbuds", matchType: "PHRASE", bid: 1.18, rangeStart: 0.80, rangeEnd: 1.55, theme: "Category Trend", impressions: 11800, clicks: 410, orders: 24, spend: 246, sales: 1439 },
    { keywordText: "smart watch for android and iphone", matchType: "EXACT", bid: 1.55, rangeStart: 1.10, rangeEnd: 2.05, theme: "High Conversion", impressions: 19500, clicks: 680, orders: 29, spend: 442, sales: 2609 },
    { keywordText: "usb c laptop charger 65w fast", matchType: "BROAD", bid: 0.98, rangeStart: 0.65, rangeEnd: 1.30, theme: "Low ACOS", impressions: 16400, clicks: 590, orders: 42, spend: 295, sales: 1469 },
    { keywordText: "travel power bank 20000mah airline approved", matchType: "PHRASE", bid: 1.12, rangeStart: 0.78, rangeEnd: 1.45, theme: "Seasonal Peak", impressions: 9800, clicks: 340, orders: 19, spend: 204, sales: 854 },
  ];

  suggestions.forEach((s, idx) => {
    const m = computeMetrics(s);
    docs.push({
      userId: null,
      moduleType: "TARGETING",
      subType: "SUGGESTION",
      adType: "SP",
      recordId: `SUGG-${idx + 1}`,
      parentId: null,
      isDefault: true,
      data: {
        ...s,
        ...m,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SEARCH TERM (`SEARCH_TERM`)
  // ─────────────────────────────────────────────────────────────────────────────
  const searchTerms = [
    {
      searchTerm: "best wireless noise cancelling earbuds",
      query: "best wireless noise cancelling earbuds",
      keywordText: "wireless noise cancelling earbuds",
      keywordId: 900001,
      matchType: "EXACT",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      adGroupStatus: "ENABLED",
      asin: "B0MOCK0001",
      asins: "B0MOCK0001",
      sku: "APEX-EARBUDS-PRO",
      productName: products[0].title,
      imageUrl: products[0].imageUrl,
      status: "ENABLED",
      keywordBid: 1.45,
      impressions: 15200,
      clicks: 560,
      spend: 375.2,
      sales: 1919.68,
      orders: 32,
      units: 35,
    },
    {
      searchTerm: "bluetooth earbuds with mic for calls",
      query: "bluetooth earbuds with mic for calls",
      keywordText: "bluetooth 5.3 earbuds waterproof",
      keywordId: 900002,
      matchType: "EXACT",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      adGroupStatus: "ENABLED",
      asin: "B0MOCK0001",
      asins: "B0MOCK0001",
      sku: "APEX-EARBUDS-PRO",
      productName: products[0].title,
      imageUrl: products[0].imageUrl,
      status: "ENABLED",
      keywordBid: 1.35,
      impressions: 11400,
      clicks: 420,
      spend: 285.6,
      sales: 1379.77,
      orders: 23,
      units: 24,
    },
    {
      searchTerm: "waterproof fitness watch sleep tracker",
      query: "waterproof fitness watch sleep tracker",
      keywordText: "fitness tracker smart watch heart rate",
      keywordId: 900003,
      matchType: "PHRASE",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800002,
      campaignName: "SP | Smart Watch X1 | Auto Discovery",
      campaignStatus: "ENABLED",
      adGroupId: 810002,
      adGroupName: "SP | Smart Watch X1 | Auto Discovery - AdGroup 1",
      adGroupStatus: "ENABLED",
      asin: "B0MOCK0002",
      asins: "B0MOCK0002",
      sku: "APEX-SMARTWATCH-X1",
      productName: products[1].title,
      imageUrl: products[1].imageUrl,
      status: "ENABLED",
      keywordBid: 1.2,
      impressions: 18600,
      clicks: 610,
      spend: 420.9,
      sales: 2069.77,
      orders: 23,
      units: 25,
    },
    {
      searchTerm: "65w gan usb c charger macbook pro",
      query: "65w gan usb c charger macbook pro",
      keywordText: "65w usb c fast charger block",
      keywordId: 900004,
      matchType: "BROAD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800003,
      campaignName: "SP | 65W GaN Charger | Broad & Phrase",
      campaignStatus: "ENABLED",
      adGroupId: 810003,
      adGroupName: "SP | 65W GaN Charger | Broad & Phrase - AdGroup 1",
      adGroupStatus: "ENABLED",
      asin: "B0MOCK0003",
      asins: "B0MOCK0003",
      sku: "APEX-CHARGER-65W",
      productName: products[2].title,
      imageUrl: products[2].imageUrl,
      status: "ENABLED",
      keywordBid: 0.95,
      impressions: 14900,
      clicks: 530,
      spend: 318.0,
      sales: 1539.56,
      orders: 44,
      units: 48,
    },
    {
      searchTerm: "cheap wired earphones",
      query: "cheap wired earphones",
      keywordText: "wireless noise cancelling earbuds",
      keywordId: 900001,
      matchType: "BROAD",
      adType: "SP",
      type: "Sponsored Products",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      adGroupStatus: "ENABLED",
      asin: "B0MOCK0001",
      asins: "B0MOCK0001",
      sku: "APEX-EARBUDS-PRO",
      productName: products[0].title,
      imageUrl: products[0].imageUrl,
      status: "ENABLED",
      keywordBid: 1.1,
      impressions: 6200,
      clicks: 145,
      spend: 118.9,
      sales: 59.99,
      orders: 1,
      units: 1,
    },
    {
      searchTerm: "apexgear official store earbuds",
      query: "apexgear official store earbuds",
      keywordText: "apexgear wireless audio",
      keywordId: 900007,
      matchType: "EXACT",
      adType: "SB",
      type: "Sponsored Brands",
      campaignId: 800005,
      campaignName: "SB | ApexGear Brand Store | Headline Search",
      campaignStatus: "ENABLED",
      adGroupId: 810005,
      adGroupName: "SB | ApexGear Brand Store | Headline Search - AdGroup 1",
      adGroupStatus: "ENABLED",
      asin: "B0MOCK0001",
      asins: "B0MOCK0001",
      sku: "APEX-EARBUDS-PRO",
      productName: products[0].title,
      imageUrl: products[0].imageUrl,
      status: "ENABLED",
      keywordBid: 1.6,
      impressions: 19400,
      clicks: 640,
      spend: 512.0,
      sales: 2460.0,
      orders: 39,
      units: 42,
    },
  ];

  const extraSearchTerms = [
    {
      adType: "SP",
      campaignId: 800001,
      campaignName: "SP | ApexGear ANC Earbuds | Exact Core",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "AG - ANC Earbuds Exact",
      searchTerm: "best anc earbuds for running sweatproof",
      query: "best anc earbuds for running sweatproof",
      keywordText: "wireless anc earbuds",
      matchType: "EXACT",
      keywordType: "EXACT",
      asin: "B0MOCK0001",
      sku: "APEX-EARBUD-PRO-BLK",
      impressions: 24600,
      clicks: 940,
      spend: 812.4,
      sales: 4680.0,
      orders: 78,
      units: 84,
      existTargeting: { isExist: true, list: [{ status: "ENABLED", keywordType: "EXACT" }] },
    },
    {
      adType: "SP",
      campaignId: 800001,
      campaignName: "SP | ApexGear ANC Earbuds | Exact Core",
      campaignStatus: "ENABLED",
      adGroupId: 810001,
      adGroupName: "AG - ANC Earbuds Exact",
      searchTerm: "bluetooth 5.3 earbuds noise cancelling",
      query: "bluetooth 5.3 earbuds noise cancelling",
      keywordText: "bluetooth 5.3 earbuds",
      matchType: "EXACT",
      keywordType: "EXACT",
      asin: "B0MOCK0001",
      sku: "APEX-EARBUD-PRO-BLK",
      impressions: 18900,
      clicks: 710,
      spend: 596.4,
      sales: 3420.0,
      orders: 57,
      units: 60,
      existTargeting: { isExist: false, list: [] },
    },
    {
      adType: "SP",
      campaignId: 800002,
      campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery",
      campaignStatus: "ENABLED",
      adGroupId: 810002,
      adGroupName: "AG - ANC Earbuds Auto",
      searchTerm: "cheap wired headphones 3.5mm jack",
      query: "cheap wired headphones 3.5mm jack",
      keywordText: "close-match",
      matchType: "AUTO",
      keywordType: "TARGETING_EXPRESSION_PREDEFINED",
      asin: "B0MOCK0001",
      sku: "APEX-EARBUD-PRO-BLK",
      impressions: 11200,
      clicks: 245,
      spend: 198.45,
      sales: 0,
      orders: 0,
      units: 0,
      existTargeting: { isExist: false, list: [] },
    },
    {
      adType: "SP",
      campaignId: 800002,
      campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery",
      campaignStatus: "ENABLED",
      adGroupId: 810002,
      adGroupName: "AG - ANC Earbuds Auto",
      searchTerm: "kids volume limited headphones",
      query: "kids volume limited headphones",
      keywordText: "loose-match",
      matchType: "AUTO",
      keywordType: "TARGETING_EXPRESSION_PREDEFINED",
      asin: "B0MOCK0001",
      sku: "APEX-EARBUD-PRO-BLK",
      impressions: 8400,
      clicks: 162,
      spend: 126.36,
      sales: 0,
      orders: 0,
      units: 0,
      existTargeting: { isExist: false, list: [] },
    },
    {
      adType: "SP",
      campaignId: 800003,
      campaignName: "SP | ApexGear 65W GaN Charger | Phrase & Broad",
      campaignStatus: "ENABLED",
      adGroupId: 810003,
      adGroupName: "AG - 65W Charger Phrase",
      searchTerm: "macbook air m3 fast charger 65w usb c",
      query: "macbook air m3 fast charger 65w usb c",
      keywordText: "65w gan charger",
      matchType: "PHRASE",
      keywordType: "PHRASE",
      asin: "B0MOCK0002",
      sku: "APEX-GAN65W-WHT",
      impressions: 29400,
      clicks: 1180,
      spend: 896.8,
      sales: 4960.0,
      orders: 124,
      units: 132,
      existTargeting: { isExist: true, list: [{ status: "ENABLED", keywordType: "PHRASE" }] },
    },
    {
      adType: "SP",
      campaignId: 800003,
      campaignName: "SP | ApexGear 65W GaN Charger | Phrase & Broad",
      campaignStatus: "ENABLED",
      adGroupId: 810003,
      adGroupName: "AG - 65W Charger Phrase",
      searchTerm: "multiport travel charger usb c Foldable plug",
      query: "multiport travel charger usb c Foldable plug",
      keywordText: "usb c fast charger block",
      matchType: "BROAD",
      keywordType: "BROAD",
      asin: "B0MOCK0002",
      sku: "APEX-GAN65W-WHT",
      impressions: 16800,
      clicks: 580,
      spend: 435.0,
      sales: 2120.0,
      orders: 53,
      units: 56,
      existTargeting: { isExist: false, list: [] },
    },
    {
      adType: "SP",
      campaignId: 800004,
      campaignName: "SP | ApexGear MagSafe PowerBank | PAT Competitor",
      campaignStatus: "ENABLED",
      adGroupId: 810004,
      adGroupName: "AG - PowerBank PAT",
      searchTerm: "magsafe battery pack 10000mah slim",
      query: "magsafe battery pack 10000mah slim",
      keywordText: 'asin="B08N5WRWNW"',
      matchType: "TARGETING_EXPRESSION",
      keywordType: "TARGETING_EXPRESSION",
      asin: "B0MOCK0003",
      sku: "APEX-MAGBANK-10K",
      impressions: 21500,
      clicks: 790,
      spend: 647.8,
      sales: 3150.0,
      orders: 63,
      units: 66,
      existTargeting: { isExist: true, list: [{ status: "ENABLED", keywordType: "EXACT" }] },
    },
    {
      adType: "SB",
      campaignId: 800005,
      campaignName: "SB | ApexGear Audio Collection | Headline Search",
      campaignStatus: "ENABLED",
      adGroupId: 810005,
      adGroupName: "AG - SB Audio Store Spotlight",
      searchTerm: "apexgear wireless earbuds official store",
      query: "apexgear wireless earbuds official store",
      keywordText: "apexgear earbuds",
      matchType: "EXACT",
      keywordType: "EXACT",
      asin: "B0MOCK0001",
      sku: "APEX-EARBUD-PRO-BLK",
      impressions: 19800,
      clicks: 820,
      spend: 615.0,
      sales: 3960.0,
      orders: 66,
      units: 71,
      existTargeting: { isExist: true, list: [{ status: "ENABLED", keywordType: "EXACT" }] },
    },
    {
      adType: "SB",
      campaignId: 800006,
      campaignName: "SBV | ApexGear Mechanical Keyboard | Video Showcase",
      campaignStatus: "ENABLED",
      adGroupId: 810006,
      adGroupName: "AG - SBV Keyboard Video",
      searchTerm: "custom hot swappable mechanical keyboard rgb",
      query: "custom hot swappable mechanical keyboard rgb",
      keywordText: "rgb wireless mechanical keyboard",
      matchType: "PHRASE",
      keywordType: "PHRASE",
      asin: "B0MOCK0004",
      sku: "APEX-MECH-KBD-RGB",
      impressions: 26400,
      clicks: 920,
      spend: 782.0,
      sales: 4230.0,
      orders: 47,
      units: 49,
      existTargeting: { isExist: true, list: [{ status: "ENABLED", keywordType: "PHRASE" }] },
    },
    {
      adType: "SP",
      campaignId: 800008,
      campaignName: "SP | ApexGear 4K Webcam | Defensive Brand",
      campaignStatus: "ENABLED",
      adGroupId: 810008,
      adGroupName: "AG - 4K Webcam Brand Exact",
      searchTerm: "4k streaming webcam with dual microphone",
      query: "4k streaming webcam with dual microphone",
      keywordText: "apexgear 4k webcam",
      matchType: "EXACT",
      keywordType: "EXACT",
      asin: "B0MOCK0005",
      sku: "APEX-WEBCAM-4K",
      impressions: 15200,
      clicks: 610,
      spend: 427.0,
      sales: 2800.0,
      orders: 40,
      units: 43,
      existTargeting: { isExist: true, list: [{ status: "ENABLED", keywordType: "EXACT" }] },
    },
  ];

  [...searchTerms, ...extraSearchTerms].forEach((st, idx) => {
    const m = computeMetrics(st);
    const parentCamp = campaigns.find((c) => Number(c.campaignId) === Number(st.campaignId));
    docs.push({
      userId: null,
      moduleType: "SEARCH_TERM",
      subType: "MAIN",
      adType: st.adType,
      recordId: `ST-${910001 + idx}`,
      parentId: String(st.campaignId),
      isDefault: true,
      data: {
        guid: `ST-GUID-${910001 + idx}`,
        campaignStatus: st.campaignStatus || parentCamp?.status || "ENABLED",
        adGroupName: st.adGroupName || `AG - ${st.campaignName?.split("|")[1]?.trim() || "Core"}`,
        keywordType: st.keywordType || st.matchType || "EXACT",
        existTargeting: st.existTargeting || {
          isExist: idx % 2 === 0,
          list: idx % 2 === 0 ? [{ status: "ENABLED", keywordType: st.matchType === "AUTO" ? "EXACT" : st.matchType }] : [],
        },
        ...st,
        ...m,
        reportDate: today,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. PLACEMENT (`PLACEMENT`)
  // ─────────────────────────────────────────────────────────────────────────────
  campaigns.forEach((c) => {
    const topMetrics = computeMetrics({
      impressions: Math.round(c.impressions * 0.45),
      clicks: Math.round(c.clicks * 0.52),
      spend: Number((c.spend * 0.54).toFixed(2)),
      sales: Number((c.sales * 0.58).toFixed(2)),
      orders: Math.round(c.orders * 0.58),
      units: Math.round(c.units * 0.58),
    });
    const prodMetrics = computeMetrics({
      impressions: Math.round(c.impressions * 0.35),
      clicks: Math.round(c.clicks * 0.30),
      spend: Number((c.spend * 0.29).toFixed(2)),
      sales: Number((c.sales * 0.27).toFixed(2)),
      orders: Math.round(c.orders * 0.27),
      units: Math.round(c.units * 0.27),
    });
    const restMetrics = computeMetrics({
      impressions: Math.max(c.impressions - topMetrics.impressions - prodMetrics.impressions, 100),
      clicks: Math.max(c.clicks - topMetrics.clicks - prodMetrics.clicks, 10),
      spend: Number(Math.max(c.spend - topMetrics.spend - prodMetrics.spend, 10).toFixed(2)),
      sales: Number(Math.max(c.sales - topMetrics.sales - prodMetrics.sales, 50).toFixed(2)),
      orders: Math.max(c.orders - topMetrics.orders - prodMetrics.orders, 1),
      units: Math.max(c.units - topMetrics.units - prodMetrics.units, 1),
    });

    const totalM = computeMetrics(c);

    docs.push({
      userId: null,
      moduleType: "PLACEMENT",
      subType: "MAIN",
      adType: c.adType,
      recordId: `PL-${c.campaignId}`,
      parentId: String(c.campaignId),
      isDefault: true,
      data: {
        campaignId: c.campaignId,
        campaignName: c.name,
        campaignStatus: c.status,
        type: c.type,
        keywordBid: 1.25,
        totalImpressions: totalM.impressions,
        totalClicks: totalM.clicks,
        totalOrders: totalM.orders,
        totalUnits: totalM.units,
        totalSales: totalM.sales,
        totalSpend: totalM.spend,
        totalAcos: totalM.acos,
        totalRoas: totalM.roas,
        totalCpc: totalM.cpc,
        totalCtr: totalM.ctr,
        totalCvr: totalM.cvr,
        placementsData: [
          {
            campaignId: c.campaignId,
            placement: "Top of Search",
            ...topMetrics,
            biddingStartegy: c.biddingStrategy,
            bidStrategy: c.biddingStrategy,
            placementModifier: 25,
            targetAcos: 25,
            newKeywordBid: 1.45,
          },
          {
            campaignId: c.campaignId,
            placement: "Product Pages",
            ...prodMetrics,
            biddingStartegy: c.biddingStrategy,
            bidStrategy: c.biddingStrategy,
            placementModifier: 10,
            targetAcos: 25,
            newKeywordBid: 1.25,
          },
          {
            campaignId: c.campaignId,
            placement: "Rest of Search",
            ...restMetrics,
            biddingStartegy: c.biddingStrategy,
            bidStrategy: c.biddingStrategy,
            placementModifier: 0,
            targetAcos: 25,
            newKeywordBid: 1.15,
          },
        ],
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. KEYWORD ANALYSIS (`KEYWORD_ANALYSIS`)
  // ─────────────────────────────────────────────────────────────────────────────
  const keywordAnalysisItems = [
    {
      keywordText: "wireless earbuds",
      word: "wireless earbuds",
      searchTermCount: 4,
      impressions: 38400,
      clicks: 1380,
      spend: 924.6,
      sales: 4499.25,
      orders: 75,
      units: 82,
      searchTerms: [
        { searchTerm: "best wireless noise cancelling earbuds", impressions: 15200, clicks: 560, spend: 375.2, sales: 1919.68, orders: 32, acos: 19.54, roas: 5.12, cpc: 0.67, ctr: 3.68, cvr: 5.71 },
        { searchTerm: "wireless earbuds bluetooth 5.3", impressions: 12100, clicks: 450, spend: 301.5, sales: 1499.75, orders: 25, acos: 20.1, roas: 4.97, cpc: 0.67, ctr: 3.72, cvr: 5.56 },
      ],
    },
    {
      keywordText: "noise cancelling",
      word: "noise cancelling",
      searchTermCount: 3,
      impressions: 29200,
      clicks: 1040,
      spend: 707.2,
      sales: 3479.42,
      orders: 58,
      units: 62,
      searchTerms: [
        { searchTerm: "active noise cancelling earbuds for flights", impressions: 14000, clicks: 480, spend: 331.2, sales: 1559.74, orders: 26, acos: 21.23, roas: 4.71, cpc: 0.69, ctr: 3.43, cvr: 5.42 },
      ],
    },
    {
      keywordText: "smart watch",
      word: "smart watch",
      searchTermCount: 3,
      impressions: 28400,
      clicks: 940,
      spend: 648.6,
      sales: 3149.65,
      orders: 35,
      units: 38,
      searchTerms: [
        { searchTerm: "waterproof fitness watch sleep tracker", impressions: 18600, clicks: 610, spend: 420.9, sales: 2069.77, orders: 23, acos: 20.34, roas: 4.92, cpc: 0.69, ctr: 3.28, cvr: 3.77 },
      ],
    },
    {
      keywordText: "65w gan charger",
      word: "65w gan charger",
      searchTermCount: 2,
      impressions: 22100,
      clicks: 780,
      spend: 468.0,
      sales: 2169.38,
      orders: 62,
      units: 66,
      searchTerms: [
        { searchTerm: "65w gan usb c charger macbook pro", impressions: 14900, clicks: 530, spend: 318.0, sales: 1539.56, orders: 44, acos: 20.66, roas: 4.84, cpc: 0.6, ctr: 3.56, cvr: 8.3 },
      ],
    },
    {
      keywordText: "portable power bank",
      word: "portable power bank",
      searchTermCount: 2,
      impressions: 16800,
      clicks: 520,
      spend: 395.2,
      sales: 1574.65,
      orders: 35,
      units: 37,
      searchTerms: [
        { searchTerm: "portable power bank 20000mah pd 30w", impressions: 16800, clicks: 520, spend: 395.2, sales: 1574.65, orders: 35, acos: 25.1, roas: 3.98, cpc: 0.76, ctr: 3.1, cvr: 6.73 },
      ],
    },
  ];

  keywordAnalysisItems.forEach((ka, idx) => {
    const m = computeMetrics(ka);
    docs.push({
      userId: null,
      moduleType: "KEYWORD_ANALYSIS",
      subType: "MAIN",
      adType: "SP",
      recordId: `KA-${idx + 1}`,
      parentId: null,
      isDefault: true,
      data: {
        ...ka,
        ...m,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. KEYWORD TRACKER / LIFETIME MATRIX (`KEYWORD_TRACKER`)
  // ─────────────────────────────────────────────────────────────────────────────
  const trackerItems = [
    {
      targeting: "wireless noise cancelling earbuds",
      matchType: "EXACT",
      adType: "SP",
      impressions: 42800,
      clicks: 1540,
      spend: 1031.8,
      sales: 5159.14,
      orders: 86,
      campaignIds: [800001, 800005],
      campaignCount: 2,
      productCount: 2,
      customStatus: "WINNER",
    },
    {
      targeting: "bluetooth 5.3 earbuds waterproof",
      matchType: "EXACT",
      adType: "SP",
      impressions: 29400,
      clicks: 1020,
      spend: 693.6,
      sales: 3299.45,
      orders: 55,
      campaignIds: [800001],
      campaignCount: 1,
      productCount: 1,
      customStatus: "WINNER",
    },
    {
      targeting: "fitness tracker smart watch heart rate",
      matchType: "PHRASE",
      adType: "SP",
      impressions: 34200,
      clicks: 1120,
      spend: 772.8,
      sales: 3779.58,
      orders: 42,
      campaignIds: [800002],
      campaignCount: 1,
      productCount: 1,
      customStatus: "WINNER",
    },
    {
      targeting: "65w usb c fast charger block",
      matchType: "BROAD",
      adType: "SP",
      impressions: 26500,
      clicks: 910,
      spend: 546.0,
      sales: 2519.28,
      orders: 72,
      campaignIds: [800003],
      campaignCount: 1,
      productCount: 1,
      customStatus: "WINNER",
    },
    {
      targeting: "portable charger 20000mah fast charging",
      matchType: "EXACT",
      adType: "SP",
      impressions: 15900,
      clicks: 490,
      spend: 411.6,
      sales: 1124.75,
      orders: 25,
      campaignIds: [800004],
      campaignCount: 1,
      productCount: 1,
      customStatus: "NEUTRAL",
    },
    {
      targeting: "cheap electronics clearance",
      matchType: "BROAD",
      adType: "SP",
      impressions: 8400,
      clicks: 210,
      spend: 189.0,
      sales: 0,
      orders: 0,
      campaignIds: [800003],
      campaignCount: 1,
      productCount: 1,
      customStatus: "POOR",
    },
  ];

  trackerItems.forEach((kt, idx) => {
    const m = computeMetrics(kt);
    docs.push({
      userId: null,
      moduleType: "KEYWORD_TRACKER",
      subType: "MAIN",
      adType: kt.adType,
      recordId: `KT-${idx + 1}`,
      parentId: null,
      isDefault: true,
      data: {
        profileId: MOCK_PROFILE_ID,
        ...kt,
        ...m,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. PURCHASE / ORDERS & ORDER REPORT (`PURCHASE_ORDER`)
  // ─────────────────────────────────────────────────────────────────────────────
  const catalogProducts = [
    {
      asin: "B0MOCK0001",
      sku: "APEX-EARBUDS-PRO",
      title: "ApexGear Wireless Noise Cancelling Earbuds Pro - Bluetooth 5.3",
      itemName: "ApexGear Wireless Noise Cancelling Earbuds Pro - Bluetooth 5.3",
      imageUrl: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
      imageURL: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
      price: 59.99,
      basePrice: 18.5,
      cost: 18.5,
    },
    {
      asin: "B0MOCK0002",
      sku: "APEX-SMARTWATCH-X1",
      title: "ApexGear Fitness Smart Watch X1 with Heart Rate & Sleep Monitor",
      itemName: "ApexGear Fitness Smart Watch X1 with Heart Rate & Sleep Monitor",
      imageUrl: "https://m.media-amazon.com/images/I/71Swqqe7XAL._AC_SL1500_.jpg",
      imageURL: "https://m.media-amazon.com/images/I/71Swqqe7XAL._AC_SL1500_.jpg",
      price: 89.99,
      basePrice: 27.0,
      cost: 27.0,
    },
    {
      asin: "B0MOCK0003",
      sku: "APEX-STAND-ALU",
      title: "ApexGear Ergonomic Aluminum Laptop Stand - Adjustable Height",
      itemName: "ApexGear Ergonomic Aluminum Laptop Stand - Adjustable Height",
      imageUrl: "https://m.media-amazon.com/images/I/71Zf9uUp+GL._AC_SL1500_.jpg",
      imageURL: "https://m.media-amazon.com/images/I/71Zf9uUp+GL._AC_SL1500_.jpg",
      price: 39.99,
      basePrice: 12.0,
      cost: 12.0,
    },
    {
      asin: "B0MOCK0004",
      sku: "APEX-CABLE-60W",
      title: "ApexGear Braided USB-C to USB-C Fast Charging Cable (2-Pack, 6ft)",
      itemName: "ApexGear Braided USB-C to USB-C Fast Charging Cable (2-Pack, 6ft)",
      imageUrl: "https://m.media-amazon.com/images/I/61Nl3y2Q6lL._AC_SL1500_.jpg",
      imageURL: "https://m.media-amazon.com/images/I/61Nl3y2Q6lL._AC_SL1500_.jpg",
      price: 15.99,
      basePrice: 4.5,
      cost: 4.5,
    },
    {
      asin: "B0MOCK0005",
      sku: "APEX-KB-RGB",
      title: "ApexGear Compact Mechanical Gaming Keyboard - Hot-Swappable RGB",
      itemName: "ApexGear Compact Mechanical Gaming Keyboard - Hot-Swappable RGB",
      imageUrl: "https://m.media-amazon.com/images/I/71cngLX2CUL._AC_SL1500_.jpg",
      imageURL: "https://m.media-amazon.com/images/I/71cngLX2CUL._AC_SL1500_.jpg",
      price: 69.99,
      basePrice: 22.0,
      cost: 22.0,
    },
    {
      asin: "B0MOCK0006",
      sku: "APEX-POWER-20K",
      title: "ApexGear 20000mAh 65W PD Power Bank Fast Portable Charger",
      itemName: "ApexGear 20000mAh 65W PD Power Bank Fast Portable Charger",
      imageUrl: "https://m.media-amazon.com/images/I/61tE7IcfmgL._AC_SL1500_.jpg",
      imageURL: "https://m.media-amazon.com/images/I/61tE7IcfmgL._AC_SL1500_.jpg",
      price: 54.99,
      basePrice: 16.5,
      cost: 16.5,
    },
  ];

  const buildItem = (prod, qty = 1) => ({
    orderItemId: `OI-${prod.asin.replace(/\D/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`,
    asin: prod.asin,
    sku: prod.sku,
    sellerSKU: prod.sku,
    title: prod.title,
    itemName: prod.itemName,
    quantityOrdered: qty,
    quantityShipped: qty,
    price: prod.price,
    itemPrice: { currencyCode: "USD", amount: prod.price },
    sellingPrice: prod.price,
    basePrice: prod.basePrice,
    productCost: prod.cost,
    imageUrl: prod.imageUrl,
    imageURL: prod.imageURL,
    productData: {
      itemName: prod.itemName,
      asin: prod.asin,
      sku: prod.sku,
      imageURL: prod.imageURL,
      sellingPrice: prod.price,
    },
    product: {
      title: prod.title,
      asin: prod.asin,
      sellerSku: prod.sku,
      price: prod.price,
    },
    proceeds: {
      proceedsTotal: Number((prod.price * qty).toFixed(2)),
      breakdowns: [
        { subTotalType: "PRINCIPAL", subTotalAmount: Number((prod.price * qty).toFixed(2)) },
        { subTotalType: "TAX", subTotalAmount: Number((prod.price * qty * 0.08).toFixed(2)) },
        { subTotalType: "FEE", subTotalAmount: -Number((prod.price * qty * 0.15).toFixed(2)) },
      ],
    },
  });

  const rawOrders = [
    {
      orderId: "114-4829101-7738201",
      orderCreatedTime: moment().subtract(2, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(30, "minutes").toISOString(),
      orderStatus: "SHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "Alex Rivera", buyerEmail: "alex.rivera@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Alex Rivera",
          addressLine1: "742 Evergreen Terrace",
          city: "Los Angeles",
          stateOrRegion: "California",
          postalCode: "90001",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[0], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "112-9840212-6204812",
      orderCreatedTime: moment().subtract(6, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(6, "hours").toISOString(),
      orderStatus: "UNSHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Expedited" },
      buyer: { buyerName: "Sarah Jenkins", buyerEmail: "sarah.jenkins@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Sarah Jenkins",
          addressLine1: "1204 Congress Ave",
          city: "Austin",
          stateOrRegion: "Texas",
          postalCode: "73301",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[1], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "113-7462019-3382910",
      orderCreatedTime: moment().subtract(1, "days").subtract(3, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(1, "days").subtract(1, "hours").toISOString(),
      orderStatus: "SHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "Michael Chang", buyerEmail: "michael.chang@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Michael Chang",
          addressLine1: "450 Pike St, Apt 8B",
          city: "Seattle",
          stateOrRegion: "Washington",
          postalCode: "98101",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[2], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "111-5582910-1829402",
      orderCreatedTime: moment().subtract(1, "days").subtract(6, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(1, "days").subtract(2, "hours").toISOString(),
      orderStatus: "PARTIALLY_SHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "NextDay" },
      buyer: { buyerName: "Emily Davis", buyerEmail: "emily.davis@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Emily Davis",
          addressLine1: "350 5th Avenue",
          city: "New York",
          stateOrRegion: "New York",
          postalCode: "10118",
          countryCode: "US",
        },
      },
      items: [
        { prod: catalogProducts[0], qty: 1 },
        { prod: catalogProducts[3], qty: 2 },
      ],
      isRefunded: false,
    },
    {
      orderId: "115-3829104-9402811",
      orderCreatedTime: moment().subtract(1, "days").subtract(10, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(1, "days").subtract(10, "hours").toISOString(),
      orderStatus: "PENDING",
      paymentMethod: "CashOnDelivery",
      fulfillment: { fulfilledBy: "MERCHANT", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "David Wilson", buyerEmail: "david.wilson@example.com" },
      recipient: {
        deliveryAddress: {
          name: "David Wilson",
          addressLine1: "233 S Wacker Dr",
          city: "Chicago",
          stateOrRegion: "Illinois",
          postalCode: "60606",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[4], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "116-2910482-7749102",
      orderCreatedTime: moment().subtract(2, "days").subtract(4, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(1, "days").subtract(8, "hours").toISOString(),
      orderStatus: "SHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "Jessica Taylor", buyerEmail: "jessica.taylor@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Jessica Taylor",
          addressLine1: "1101 Brickell Ave",
          city: "Miami",
          stateOrRegion: "Florida",
          postalCode: "33131",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[5], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "117-6401928-5501928",
      orderCreatedTime: moment().subtract(2, "days").subtract(8, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(2, "days").subtract(8, "hours").toISOString(),
      orderStatus: "PENDING_AVAILABILITY",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "MERCHANT", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "Robert Martinez", buyerEmail: "robert.martinez@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Robert Martinez",
          addressLine1: "100 N Central Ave",
          city: "Phoenix",
          stateOrRegion: "Arizona",
          postalCode: "85004",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[1], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "118-8492018-2910482",
      orderCreatedTime: moment().subtract(2, "days").subtract(12, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(1, "days").subtract(14, "hours").toISOString(),
      orderStatus: "SHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Expedited" },
      buyer: { buyerName: "Amanda White", buyerEmail: "amanda.white@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Amanda White",
          addressLine1: "1701 Champa St",
          city: "Denver",
          stateOrRegion: "Colorado",
          postalCode: "80202",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[0], qty: 1 }],
      isRefunded: true,
      refundData: {
        amazonOrderId: "118-8492018-2910482",
        currencyCode: "USD",
        totalProductCharges: 59.99,
      },
    },
    {
      orderId: "119-1928401-8392019",
      orderCreatedTime: moment().subtract(3, "days").subtract(2, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(3, "days").subtract(2, "hours").toISOString(),
      orderStatus: "UNSHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "Daniel Harris", buyerEmail: "daniel.harris@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Daniel Harris",
          addressLine1: "265 Peachtree St NE",
          city: "Atlanta",
          stateOrRegion: "Georgia",
          postalCode: "30303",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[3], qty: 2 }],
      isRefunded: false,
    },
    {
      orderId: "120-7391028-4829104",
      orderCreatedTime: moment().subtract(3, "days").subtract(7, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(2, "days").subtract(5, "hours").toISOString(),
      orderStatus: "SHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "NextDay" },
      buyer: { buyerName: "Sophia Clark", buyerEmail: "sophia.clark@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Sophia Clark",
          addressLine1: "555 California St",
          city: "San Francisco",
          stateOrRegion: "California",
          postalCode: "94104",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[4], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "121-3920194-6602819",
      orderCreatedTime: moment().subtract(4, "days").subtract(5, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(4, "days").subtract(5, "hours").toISOString(),
      orderStatus: "UNFULFILLABLE",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "James Lewis", buyerEmail: "james.lewis@example.com" },
      recipient: {
        deliveryAddress: {
          name: "James Lewis",
          addressLine1: "100 Federal St",
          city: "Boston",
          stateOrRegion: "Massachusetts",
          postalCode: "02110",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[2], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "122-8291048-1928401",
      orderCreatedTime: moment().subtract(4, "days").subtract(11, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(3, "days").subtract(9, "hours").toISOString(),
      orderStatus: "SHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Expedited" },
      buyer: { buyerName: "Olivia Walker", buyerEmail: "olivia.walker@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Olivia Walker",
          addressLine1: "1717 Main St",
          city: "Dallas",
          stateOrRegion: "Texas",
          postalCode: "75201",
          countryCode: "US",
        },
      },
      items: [
        { prod: catalogProducts[1], qty: 1 },
        { prod: catalogProducts[5], qty: 1 },
      ],
      isRefunded: false,
    },
    {
      orderId: "123-4829102-5592018",
      orderCreatedTime: moment().subtract(5, "days").subtract(3, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(5, "days").subtract(1, "hours").toISOString(),
      orderStatus: "CANCELLED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "MERCHANT", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "Ethan Hall", buyerEmail: "ethan.hall@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Ethan Hall",
          addressLine1: "1120 SW 5th Ave",
          city: "Portland",
          stateOrRegion: "Oregon",
          postalCode: "97204",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[0], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "124-9182736-4567890",
      orderCreatedTime: moment().subtract(5, "days").subtract(8, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(4, "days").subtract(12, "hours").toISOString(),
      orderStatus: "SHIPPED",
      paymentMethod: "CashOnDelivery",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "Mia Allen", buyerEmail: "mia.allen@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Mia Allen",
          addressLine1: "1500 Market St",
          city: "Philadelphia",
          stateOrRegion: "Pennsylvania",
          postalCode: "19102",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[3], qty: 1 }],
      isRefunded: false,
    },
    {
      orderId: "125-6789012-3456789",
      orderCreatedTime: moment().subtract(5, "days").subtract(14, "hours").toISOString(),
      orderLastUpdatedTime: moment().subtract(4, "days").subtract(18, "hours").toISOString(),
      orderStatus: "SHIPPED",
      paymentMethod: "Prepaid",
      fulfillment: { fulfilledBy: "AMAZON", fulfillmentServiceLevel: "Standard" },
      buyer: { buyerName: "Lucas Young", buyerEmail: "lucas.young@example.com" },
      recipient: {
        deliveryAddress: {
          name: "Lucas Young",
          addressLine1: "401 B St",
          city: "San Diego",
          stateOrRegion: "California",
          postalCode: "92101",
          countryCode: "US",
        },
      },
      items: [{ prod: catalogProducts[2], qty: 1 }],
      isRefunded: false,
    },
  ];

  const processedOrders = rawOrders.map((ro) => {
    const builtItems = ro.items.map((i) => buildItem(i.prod, i.qty));
    const totalAmount = Number(builtItems.reduce((acc, it) => acc + (it.price * it.quantityOrdered), 0).toFixed(2));
    const totalCost = Number(builtItems.reduce((acc, it) => acc + (it.productCost * it.quantityOrdered), 0).toFixed(2));
    const totalQuantity = builtItems.reduce((acc, it) => acc + it.quantityOrdered, 0);
    const firstProd = ro.items[0].prod;

    return {
      orderId: ro.orderId,
      amazonOrderId: ro.orderId,
      orderCreatedTime: ro.orderCreatedTime,
      purchaseDate: ro.orderCreatedTime,
      orderLastUpdatedTime: ro.orderLastUpdatedTime,
      lastUpdateDate: ro.orderLastUpdatedTime,
      orderStatus: ro.orderStatus,
      status: ro.orderStatus,
      fulfillmentChannel: ro.fulfillment.fulfilledBy === "AMAZON" ? "AFN" : "MFN",
      orderType: "StandardOrder",
      orderTotal: {
        currencyCode: "USD",
        amount: totalAmount,
      },
      totalAmount,
      totalQuantity,
      numberOfItemsShipped: ro.orderStatus === "SHIPPED" ? totalQuantity : ro.orderStatus === "PARTIALLY_SHIPPED" ? 1 : 0,
      numberOfItemsUnshipped: ro.orderStatus === "UNSHIPPED" ? totalQuantity : 0,
      isBusinessOrder: false,
      currencyCode: "USD",
      paymentMethod: ro.paymentMethod,
      fulfillment: ro.fulfillment,
      salesChannel: { marketplaceName: "Amazon.com" },
      buyer: ro.buyer,
      recipient: ro.recipient,
      asin: firstProd.asin,
      sku: firstProd.sku,
      sellerSKU: firstProd.sku,
      title: firstProd.title,
      itemName: firstProd.itemName,
      imageUrl: firstProd.imageUrl,
      imageURL: firstProd.imageURL,
      quantityOrdered: totalQuantity,
      itemPrice: firstProd.price,
      price: firstProd.price,
      sellingPrice: firstProd.price,
      basePrice: firstProd.basePrice,
      productCost: firstProd.cost,
      totalSales: totalAmount,
      totalCost,
      orderItems: builtItems,
      proceeds: {
        proceedsTotal: totalAmount,
        breakdowns: [
          { subTotalType: "PRINCIPAL", subTotalAmount: totalAmount },
          { subTotalType: "TAX", subTotalAmount: Number((totalAmount * 0.08).toFixed(2)) },
          { subTotalType: "FEE", subTotalAmount: -Number((totalAmount * 0.15).toFixed(2)) },
        ],
      },
      isRefunded: Boolean(ro.isRefunded),
      refundData: ro.refundData || null,
    };
  });

  processedOrders.forEach((ord) => {
    docs.push({
      userId: null,
      moduleType: "PURCHASE_ORDER",
      subType: "MAIN",
      adType: "ALL",
      recordId: ord.orderId,
      parentId: null,
      isDefault: true,
      data: ord,
    });
  });

  // Order Reports aggregated per catalog product
  const orderReports = catalogProducts.map((prod, idx) => {
    const relatedOrders = processedOrders.filter((o) =>
      o.orderItems.some((it) => it.asin === prod.asin)
    );
    const ordersCount = Math.max(relatedOrders.length, 1);
    const totalQty = relatedOrders.reduce((sum, o) => {
      const match = o.orderItems.find((it) => it.asin === prod.asin);
      return sum + (match ? match.quantityOrdered : 1);
    }, 0) || 1;
    const totalSalesValue = Number((prod.price * totalQty).toFixed(2));
    const totalCost = Number((prod.cost * totalQty).toFixed(2));
    const adSpend = Number((12.5 + idx * 4.2).toFixed(2));
    const netProfit = Number((totalSalesValue - totalCost - adSpend).toFixed(2));

    return {
      asin: prod.asin,
      sku: prod.sku,
      sellerSKU: prod.sku,
      title: prod.title,
      itemName: prod.itemName,
      imageUrl: prod.imageUrl,
      imageURL: prod.imageURL,
      basePrice: prod.basePrice,
      productCost: prod.cost,
      cost: prod.cost,
      totalCost,
      sellingPrice: prod.price,
      price: prod.price,
      totalSalesValue,
      totalSales: totalSalesValue,
      sales: totalSalesValue,
      ordersCount,
      totalOrders: ordersCount,
      orders: ordersCount,
      totalQty,
      totalUnits: totalQty,
      quantityOrdered: totalQty,
      orderStatus: "SHIPPED",
      adSpend,
      adSpent: adSpend,
      adOrders: Math.max(ordersCount - 1, 1),
      adSales: totalSalesValue,
      netProfit,
      roi: Number(((netProfit / (totalCost + adSpend || 1)) * 100).toFixed(2)),
      acos: Number(((adSpend / (totalSalesValue || 1)) * 100).toFixed(2)),
      roas: Number(((totalSalesValue / (adSpend || 1))).toFixed(2)),
      ordersList: relatedOrders.map((o) => ({
        orderId: o.orderId,
        orderCreatedTime: o.orderCreatedTime,
        orderStatus: o.orderStatus,
        buyerName: o.buyer.buyerName,
        quantityOrdered: 1,
        price: prod.price,
        totalAmount: prod.price,
        currencyCode: "USD",
      })),
    };
  });

  orderReports.forEach((or) => {
    docs.push({
      userId: null,
      moduleType: "PURCHASE_ORDER",
      subType: "ORDER_REPORT",
      adType: "ALL",
      recordId: `OR-${or.sku}`,
      parentId: or.asin,
      isDefault: true,
      data: or,
    });
  });

  // 9. COUPONS (`COUPON`)
  // ─────────────────────────────────────────────────────────────────────────────
  const coupons = [
    {
      couponId: "CPN-MOCK-101",
      name: "Save 15% on ApexGear Wireless Earbuds Pro",
      message: "Save 15% on Wireless Noise Cancelling Earbuds",
      status: "RUNNING",
      discountType: "PERCENT_OFF_LIST_PRICE",
      discountAmount: 15,
      budget: 1500,
      budgetType: "TOTAL_BUDGET",
      totalSpend: 642.5,
      spend: 642.5,
      budgetPercentageUsed: 42.8,
      clips: 890,
      redemptions: 214,
      sales: 10912.18,
      startDate: startOfMonth,
      endDate: nextMonth,
      startDateTime: startOfMonth,
      endDateTime: nextMonth,
      asinCount: 1,
      asins: ["B0MOCK0001"],
      products: [products[0]],
    },
    {
      couponId: "CPN-MOCK-102",
      name: "$10 Off ApexGear Fitness Smart Watch X1",
      message: "Save $10.00 on Smart Watch X1",
      status: "RUNNING",
      discountType: "AMOUNT_OFF_LIST_PRICE",
      discountAmount: 10,
      budget: 2000,
      budgetType: "TOTAL_BUDGET",
      totalSpend: 920.0,
      spend: 920.0,
      budgetPercentageUsed: 46.0,
      clips: 640,
      redemptions: 92,
      sales: 7359.08,
      startDate: startOfMonth,
      endDate: nextMonth,
      startDateTime: startOfMonth,
      endDateTime: nextMonth,
      asinCount: 1,
      asins: ["B0MOCK0002"],
      products: [products[1]],
    },
    {
      couponId: "CPN-MOCK-103",
      name: "Save 20% on 65W GaN USB-C Fast Charger",
      message: "Save 20% on ApexGear 65W Charger",
      status: "RUNNING",
      discountType: "PERCENT_OFF_LIST_PRICE",
      discountAmount: 20,
      budget: 1000,
      budgetType: "TOTAL_BUDGET",
      totalSpend: 489.8,
      spend: 489.8,
      budgetPercentageUsed: 49.0,
      clips: 520,
      redemptions: 140,
      sales: 3918.88,
      startDate: startOfMonth,
      endDate: nextMonth,
      startDateTime: startOfMonth,
      endDateTime: nextMonth,
      asinCount: 1,
      asins: ["B0MOCK0003"],
      products: [products[2]],
    },
    {
      couponId: "CPN-MOCK-104",
      name: "Holiday Bundle $5 Off Portable Power Bank",
      message: "Save $5.00 on 20000mAh Power Bank",
      status: "SUBMITTED",
      discountType: "AMOUNT_OFF_LIST_PRICE",
      discountAmount: 5,
      budget: 800,
      budgetType: "TOTAL_BUDGET",
      totalSpend: 0,
      spend: 0,
      budgetPercentageUsed: 0,
      clips: 0,
      redemptions: 0,
      sales: 0,
      startDate: today,
      endDate: nextMonth,
      startDateTime: today,
      endDateTime: nextMonth,
      asinCount: 1,
      asins: ["B0MOCK0004"],
      products: [products[3]],
    },
    {
      couponId: "CPN-MOCK-105",
      name: "Spring Flash 10% Off Bluetooth Speaker",
      message: "Save 10% on Waterproof Bluetooth Speaker",
      status: "EXPIRED",
      discountType: "PERCENT_OFF_LIST_PRICE",
      discountAmount: 10,
      budget: 600,
      budgetType: "TOTAL_BUDGET",
      totalSpend: 540.0,
      spend: 540.0,
      budgetPercentageUsed: 90.0,
      clips: 410,
      redemptions: 108,
      sales: 4859.02,
      startDate: moment().subtract(45, "days").format("YYYY-MM-DD"),
      endDate: moment().subtract(10, "days").format("YYYY-MM-DD"),
      startDateTime: moment().subtract(45, "days").format("YYYY-MM-DD"),
      endDateTime: moment().subtract(10, "days").format("YYYY-MM-DD"),
      asinCount: 1,
      asins: ["B0MOCK0005"],
      products: [products[4]],
    },
  ];

  coupons.forEach((cpn) => {
    docs.push({
      userId: null,
      moduleType: "COUPON",
      subType: "MAIN",
      adType: "ALL",
      recordId: cpn.couponId,
      parentId: null,
      isDefault: true,
      data: cpn,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. DEALS (`DEAL`)
  // ─────────────────────────────────────────────────────────────────────────────
  const deals = [
    {
      dealId: "DEAL-MOCK-201",
      campaignName: "ApexGear Wireless Earbuds Pro - 7-Day Deal",
      dealDescription: "ApexGear Wireless Earbuds Pro - 7-Day Deal",
      dealType: "7_DAY_DEAL",
      status: "ACTIVE",
      startDate: startOfMonth,
      endDate: nextMonth,
      dealPrice: 47.99,
      regularPrice: 59.99,
      discountPercentage: 20,
      sales: 14876.9,
      unitsSold: 310,
      glanceViews: 6820,
      conversionRate: 4.55,
      feeAmount: 300,
      feeStatus: "CHARGED",
      skuCount: 1,
      asin: "B0MOCK0001",
      sku: "APEX-EARBUDS-PRO",
      imageUrl: products[0].imageUrl,
      items: [
        {
          asin: "B0MOCK0001",
          sku: "APEX-EARBUDS-PRO",
          productName: products[0].title,
          imageUrl: products[0].imageUrl,
          dealPrice: 47.99,
          regularPrice: 59.99,
          unitsSold: 310,
          sales: 14876.9,
          glanceViews: 6820,
          conversionRate: 4.55,
        },
      ],
    },
    {
      dealId: "DEAL-MOCK-202",
      campaignName: "ApexGear Smart Watch X1 - Lightning Deal",
      dealDescription: "ApexGear Smart Watch X1 - Lightning Deal",
      dealType: "LIGHTNING_DEAL",
      status: "ACTIVE",
      startDate: today,
      endDate: nextMonth,
      dealPrice: 69.99,
      regularPrice: 89.99,
      discountPercentage: 22,
      sales: 9798.6,
      unitsSold: 140,
      glanceViews: 4120,
      conversionRate: 3.4,
      feeAmount: 150,
      feeStatus: "CHARGED",
      skuCount: 1,
      asin: "B0MOCK0002",
      sku: "APEX-SMARTWATCH-X1",
      imageUrl: products[1].imageUrl,
      items: [
        {
          asin: "B0MOCK0002",
          sku: "APEX-SMARTWATCH-X1",
          productName: products[1].title,
          imageUrl: products[1].imageUrl,
          dealPrice: 69.99,
          regularPrice: 89.99,
          unitsSold: 140,
          sales: 9798.6,
          glanceViews: 4120,
          conversionRate: 3.4,
        },
      ],
    },
    {
      dealId: "DEAL-MOCK-203",
      campaignName: "ApexGear 65W GaN Fast Charger - Best Deal",
      dealDescription: "ApexGear 65W GaN Fast Charger - Best Deal",
      dealType: "BEST_DEAL",
      status: "UPCOMING",
      startDate: moment().add(5, "days").format("YYYY-MM-DD"),
      endDate: nextMonth,
      dealPrice: 27.99,
      regularPrice: 34.99,
      discountPercentage: 20,
      sales: 0,
      unitsSold: 0,
      glanceViews: 0,
      conversionRate: 0,
      feeAmount: 150,
      feeStatus: "PENDING",
      skuCount: 1,
      asin: "B0MOCK0003",
      sku: "APEX-CHARGER-65W",
      imageUrl: products[2].imageUrl,
      items: [
        {
          asin: "B0MOCK0003",
          sku: "APEX-CHARGER-65W",
          productName: products[2].title,
          imageUrl: products[2].imageUrl,
          dealPrice: 27.99,
          regularPrice: 34.99,
          unitsSold: 0,
          sales: 0,
          glanceViews: 0,
          conversionRate: 0,
        },
      ],
    },
    {
      dealId: "DEAL-MOCK-204",
      campaignName: "ApexGear 20000mAh Power Bank - Weekend Deal",
      dealDescription: "ApexGear 20000mAh Power Bank - Weekend Deal",
      dealType: "LIGHTNING_DEAL",
      status: "ENDED",
      startDate: moment().subtract(15, "days").format("YYYY-MM-DD"),
      endDate: moment().subtract(8, "days").format("YYYY-MM-DD"),
      dealPrice: 35.99,
      regularPrice: 44.99,
      discountPercentage: 20,
      sales: 6838.1,
      unitsSold: 190,
      glanceViews: 3890,
      conversionRate: 4.88,
      feeAmount: 150,
      feeStatus: "CHARGED",
      skuCount: 1,
      asin: "B0MOCK0004",
      sku: "APEX-POWERBANK-20K",
      imageUrl: products[3].imageUrl,
      items: [
        {
          asin: "B0MOCK0004",
          sku: "APEX-POWERBANK-20K",
          productName: products[3].title,
          imageUrl: products[3].imageUrl,
          dealPrice: 35.99,
          regularPrice: 44.99,
          unitsSold: 190,
          sales: 6838.1,
          glanceViews: 3890,
          conversionRate: 4.88,
        },
      ],
    },
  ];

  deals.forEach((deal) => {
    docs.push({
      userId: null,
      moduleType: "DEAL",
      subType: "MAIN",
      adType: "ALL",
      recordId: deal.dealId,
      parentId: null,
      isDefault: true,
      data: deal,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. INVENTORY (`INVENTORY`)
  // ─────────────────────────────────────────────────────────────────────────────
  const inventoryItems = [
    {
      sku: "APEX-EARBUDS-PRO",
      asin: "B0MOCK0001",
      title: products[0].title,
      image: products[0].imageUrl,
      fulfillmentType: "FBA",
      status: "HEALTHY",
      currentStock: 340,
      inboundStock: 150,
      reservedStock: 28,
      totalStock: 518,
      salesPerDay: 11.4,
      daysLeft: 45,
      agingBucket: "60",
      deadInventoryStatus: "ACTIVE",
      suggestion: "Healthy velocity. Maintain current FBA restock schedule.",
      minOrders: 10,
      lookbackDays: 30,
      isEnabled: true,
    },
    {
      sku: "APEX-SMARTWATCH-X1",
      asin: "B0MOCK0002",
      title: products[1].title,
      image: products[1].imageUrl,
      fulfillmentType: "FBA",
      status: "HEALTHY",
      currentStock: 215,
      inboundStock: 80,
      reservedStock: 19,
      totalStock: 314,
      salesPerDay: 6.2,
      daysLeft: 51,
      agingBucket: "60",
      deadInventoryStatus: "ACTIVE",
      suggestion: "Optimal stock cover. Consider increasing Top-of-Search bid.",
      minOrders: 8,
      lookbackDays: 30,
      isEnabled: true,
    },
    {
      sku: "APEX-CHARGER-65W",
      asin: "B0MOCK0003",
      title: products[2].title,
      image: products[2].imageUrl,
      fulfillmentType: "FBA",
      status: "HEALTHY",
      currentStock: 480,
      inboundStock: 200,
      reservedStock: 42,
      totalStock: 722,
      salesPerDay: 14.5,
      daysLeft: 50,
      agingBucket: "60",
      deadInventoryStatus: "ACTIVE",
      suggestion: "Strong daily sales velocity.",
      minOrders: 15,
      lookbackDays: 30,
      isEnabled: true,
    },
    {
      sku: "APEX-POWERBANK-20K",
      asin: "B0MOCK0004",
      title: products[3].title,
      image: products[3].imageUrl,
      fulfillmentType: "FBA",
      status: "MEDIUM",
      currentStock: 65,
      inboundStock: 20,
      reservedStock: 10,
      totalStock: 95,
      salesPerDay: 7.5,
      daysLeft: 13,
      agingBucket: "30",
      deadInventoryStatus: "ACTIVE",
      suggestion: "Stock below 15 days cover. Expedite FBA inbound shipment.",
      minOrders: 10,
      lookbackDays: 30,
      isEnabled: true,
    },
    {
      sku: "APEX-SPEAKER-MINI",
      asin: "B0MOCK0005",
      title: products[4].title,
      image: products[4].imageUrl,
      fulfillmentType: "FBM",
      status: "LOW",
      currentStock: 16,
      inboundStock: 0,
      reservedStock: 2,
      totalStock: 18,
      salesPerDay: 4.5,
      daysLeft: 4,
      agingBucket: "30",
      deadInventoryStatus: "ACTIVE",
      suggestion: "Low stock alert (4 days remaining). Replenish warehouse inventory.",
      minOrders: 5,
      lookbackDays: 30,
      isEnabled: true,
    },
    {
      sku: "APEX-STAND-ALUM",
      asin: "B0MOCK0006",
      title: products[5].title,
      image: products[5].imageUrl,
      fulfillmentType: "FBA",
      status: "HEALTHY",
      currentStock: 190,
      inboundStock: 0,
      reservedStock: 4,
      totalStock: 194,
      salesPerDay: 1.2,
      daysLeft: 162,
      agingBucket: "180+",
      deadInventoryStatus: "DEAD",
      suggestion: "Low velocity aging stock (162 days cover). Run a 20% Coupon or Lightning Deal to clear aged units.",
      minOrders: 10,
      lookbackDays: 30,
      isEnabled: true,
    },
    {
      sku: "APEX-CABLE-3PACK",
      asin: "B0MOCK0007",
      title: "ApexGear Braided USB-C to USB-C 100W Cable (3-Pack, 6ft)",
      image: "https://m.media-amazon.com/images/I/61bK6PMOC3L._AC_SL1500_.jpg",
      fulfillmentType: "FBA",
      status: "OUT_OF_STOCK",
      currentStock: 0,
      inboundStock: 0,
      reservedStock: 0,
      totalStock: 0,
      salesPerDay: 8.0,
      daysLeft: 0,
      agingBucket: "30",
      deadInventoryStatus: "ACTIVE",
      suggestion: "Out of stock! Ads automatically paused to prevent wasted spend.",
      minOrders: 10,
      lookbackDays: 30,
      isEnabled: true,
    },
  ];

  inventoryItems.forEach((inv) => {
    docs.push({
      userId: null,
      moduleType: "INVENTORY",
      subType: "MAIN",
      adType: "ALL",
      recordId: inv.sku,
      parentId: inv.asin,
      isDefault: true,
      data: inv,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. CHANGE HISTORY (`HISTORY`)
  // ─────────────────────────────────────────────────────────────────────────────
  const nowMs = Date.now();
  const historyRows = [
    {
      historyId: "HIST-001",
      adType: "SP",
      type: "Targeting",
      entityType: "Keyword Bid",
      changeType: "update targeting bid",
      name: "wireless noise cancelling earbuds",
      targeting: "wireless noise cancelling earbuds",
      matchType: "EXACT",
      keywordType: "EXACT",
      campaignId: 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      adGroupId: 810001,
      adGroupName: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      changeLevel: 800001,
      oldValue: 1.25,
      newValue: 1.45,
      oldBid: 1.25,
      newBid: 1.45,
      oldAcos: 24.5,
      currentAcos: 19.2,
      spend: 412.50,
      sales: 2148.00,
      currentSpend: 596.30,
      currentSales: 2999.50,
      triggerSource: "Rule",
      source: "RULE",
      updatedFrom: "Rule Automation",
      updatedBy: "Target ACOS Rule (22%)",
      changedBy: "Target ACOS Rule (22%)",
      reason: "ACOS dropped to 19.2% (target: 22%) with 14.8% CVR — raised bid +$0.20 to capture top-of-search placement.",
      createdAt: new Date(nowMs - 2 * 3600 * 1000).toISOString(),
      dateRange: {
        startDate: moment().subtract(14, "days").format("YYYY-MM-DD"),
        endDate: moment().subtract(7, "days").format("YYYY-MM-DD"),
      },
      currentDateRange: {
        startDate: moment().subtract(7, "days").format("YYYY-MM-DD"),
        endDate: moment().format("YYYY-MM-DD"),
      },
      campaignDetails: {
        campaignId: 800001,
        name: "SP | Wireless Earbuds Pro | Exact Match",
        type: "Sponsored Products",
      },
      adGroupDetails: {
        adGroupId: 810001,
        name: "SP | Wireless Earbuds Pro | Exact Match - AdGroup 1",
      },
      dailyStats: null,
    },
    {
      historyId: "HIST-002",
      adType: "SP",
      type: "Campaign",
      entityType: "Campaign Budget",
      changeType: "update campaign budget",
      name: "SP | Smart Watch X1 | Auto Discovery",
      targeting: "",
      matchType: "",
      keywordType: "",
      campaignId: 800002,
      campaignName: "SP | Smart Watch X1 | Auto Discovery",
      adGroupId: 810002,
      adGroupName: "SP | Smart Watch X1 | Auto Discovery - AdGroup 1",
      changeLevel: 800002,
      oldValue: 70.00,
      newValue: 85.00,
      oldBudget: 70.00,
      newBudget: 85.00,
      oldAcos: 28.4,
      currentAcos: 22.0,
      spend: 820.00,
      sales: 3727.00,
      currentSpend: 1090.20,
      currentSales: 4950.00,
      triggerSource: "Recommendation",
      source: "RECOMMENDATION",
      updatedFrom: "AI Optimization Engine",
      updatedBy: "Budget Recommendation",
      changedBy: "Budget Recommendation",
      reason: "Campaign hit daily budget limit by 2:00 PM with 4.54 ROAS — increased daily budget by +$15.00.",
      createdAt: new Date(nowMs - 5 * 3600 * 1000).toISOString(),
      dateRange: {
        startDate: moment().subtract(14, "days").format("YYYY-MM-DD"),
        endDate: moment().subtract(7, "days").format("YYYY-MM-DD"),
      },
      currentDateRange: {
        startDate: moment().subtract(7, "days").format("YYYY-MM-DD"),
        endDate: moment().format("YYYY-MM-DD"),
      },
      campaignDetails: {
        campaignId: 800002,
        name: "SP | Smart Watch X1 | Auto Discovery",
        type: "Sponsored Products",
      },
      adGroupDetails: {
        adGroupId: 810002,
        name: "SP | Smart Watch X1 | Auto Discovery - AdGroup 1",
      },
      dailyStats: null,
    },
  ];

  historyRows.forEach((h) => {
    docs.push({
      userId: null,
      moduleType: "HISTORY",
      subType: "MAIN",
      adType: h.adType,
      recordId: h.historyId,
      parentId: String(h.campaignId),
      isDefault: true,
      data: h,
    });
  });

  // 13. BRAND ANALYTICS (`BRAND_ANALYTICS`) & BRAND DETAILS (`BRAND_DETAILS`)
  // ─────────────────────────────────────────────────────────────────────────────
  const brandAnalyticsQueries = [
    {
      searchQuery: "wireless anc earbuds",
      asin: "B0MOCK0001",
      searchQueryScore: 98,
      searchQueryVolume: 184500,
      impressionsTotalCount: 412000,
      impressionsAsinCount: 64200,
      impressionsAsinShare: 15.58,
      clicksTotalCount: 28400,
      clicksClickRate: 6.89,
      clicksAsinCount: 5120,
      clicksAsinShare: 18.03,
      clicksPriceMedian: 64.99,
      clicksAsinPriceMedian: 59.99,
      clicksSameDayShippingCount: 19200,
      clicksOneDayShippingCount: 7400,
      clicksTwoDayShippingCount: 1800,
      cartAddsTotalCount: 6840,
      cartAddsCartAddRate: 24.08,
      cartAddsAsinCount: 1420,
      cartAddsAsinShare: 20.76,
      cartAddsPriceMedian: 62.99,
      cartAddsAsinPriceMedian: 59.99,
      cartAddsSameDayShippingCount: 4600,
      cartAddsOneDayShippingCount: 1840,
      cartAddsTwoDayShippingCount: 400,
      purchasesTotalCount: 3420,
      purchasesPurchaseRate: 50.0,
      purchasesAsinCount: 780,
      purchasesAsinShare: 22.81,
      purchasesPriceMedian: 61.99,
      purchasesAsinPriceMedian: 59.99,
      purchasesSameDayShippingCount: 2400,
      purchasesOneDayShippingCount: 820,
      purchasesTwoDayShippingCount: 200,
      reportingDate: today,
      periodType: "WEEK",
      weekValue: "2026-W44",
      year: 2026,
    },
    {
      searchQuery: "65w gan usb c charger",
      asin: "B0MOCK0002",
      searchQueryScore: 95,
      searchQueryVolume: 142000,
      impressionsTotalCount: 318000,
      impressionsAsinCount: 52400,
      impressionsAsinShare: 16.48,
      clicksTotalCount: 22600,
      clicksClickRate: 7.11,
      clicksAsinCount: 4380,
      clicksAsinShare: 19.38,
      clicksPriceMedian: 42.99,
      clicksAsinPriceMedian: 39.99,
      clicksSameDayShippingCount: 15800,
      clicksOneDayShippingCount: 5200,
      clicksTwoDayShippingCount: 1600,
      cartAddsTotalCount: 5920,
      cartAddsCartAddRate: 26.19,
      cartAddsAsinCount: 1290,
      cartAddsAsinShare: 21.79,
      cartAddsPriceMedian: 41.99,
      cartAddsAsinPriceMedian: 39.99,
      cartAddsSameDayShippingCount: 4120,
      cartAddsOneDayShippingCount: 1400,
      cartAddsTwoDayShippingCount: 400,
      purchasesTotalCount: 3180,
      purchasesPurchaseRate: 53.72,
      purchasesAsinCount: 740,
      purchasesAsinShare: 23.27,
      purchasesPriceMedian: 40.99,
      purchasesAsinPriceMedian: 39.99,
      purchasesSameDayShippingCount: 2280,
      purchasesOneDayShippingCount: 700,
      purchasesTwoDayShippingCount: 200,
      reportingDate: today,
      periodType: "WEEK",
      weekValue: "2026-W44",
      year: 2026,
    },
    {
      searchQuery: "magsafe power bank 10000mah",
      asin: "B0MOCK0003",
      searchQueryScore: 92,
      searchQueryVolume: 118400,
      impressionsTotalCount: 264000,
      impressionsAsinCount: 38900,
      impressionsAsinShare: 14.73,
      clicksTotalCount: 18400,
      clicksClickRate: 6.97,
      clicksAsinCount: 3120,
      clicksAsinShare: 16.96,
      clicksPriceMedian: 52.99,
      clicksAsinPriceMedian: 49.99,
      clicksSameDayShippingCount: 12400,
      clicksOneDayShippingCount: 4600,
      clicksTwoDayShippingCount: 1400,
      cartAddsTotalCount: 4480,
      cartAddsCartAddRate: 24.35,
      cartAddsAsinCount: 890,
      cartAddsAsinShare: 19.87,
      cartAddsPriceMedian: 51.99,
      cartAddsAsinPriceMedian: 49.99,
      cartAddsSameDayShippingCount: 3100,
      cartAddsOneDayShippingCount: 1080,
      cartAddsTwoDayShippingCount: 300,
      purchasesTotalCount: 2240,
      purchasesPurchaseRate: 50.0,
      purchasesAsinCount: 490,
      purchasesAsinShare: 21.88,
      purchasesPriceMedian: 50.99,
      purchasesAsinPriceMedian: 49.99,
      purchasesSameDayShippingCount: 1580,
      purchasesOneDayShippingCount: 510,
      purchasesTwoDayShippingCount: 150,
      reportingDate: today,
      periodType: "WEEK",
      weekValue: "2026-W44",
      year: 2026,
    },
    {
      searchQuery: "rgb wireless mechanical keyboard",
      asin: "B0MOCK0004",
      searchQueryScore: 89,
      searchQueryVolume: 96200,
      impressionsTotalCount: 214000,
      impressionsAsinCount: 29800,
      impressionsAsinShare: 13.93,
      clicksTotalCount: 14900,
      clicksClickRate: 6.96,
      clicksAsinCount: 2420,
      clicksAsinShare: 16.24,
      clicksPriceMedian: 94.99,
      clicksAsinPriceMedian: 89.99,
      clicksSameDayShippingCount: 9800,
      clicksOneDayShippingCount: 3900,
      clicksTwoDayShippingCount: 1200,
      cartAddsTotalCount: 3420,
      cartAddsCartAddRate: 22.95,
      cartAddsAsinCount: 640,
      cartAddsAsinShare: 18.71,
      cartAddsPriceMedian: 92.99,
      cartAddsAsinPriceMedian: 89.99,
      cartAddsSameDayShippingCount: 2300,
      cartAddsOneDayShippingCount: 880,
      cartAddsTwoDayShippingCount: 240,
      purchasesTotalCount: 1680,
      purchasesPurchaseRate: 49.12,
      purchasesAsinCount: 340,
      purchasesAsinShare: 20.24,
      purchasesPriceMedian: 91.99,
      purchasesAsinPriceMedian: 89.99,
      purchasesSameDayShippingCount: 1140,
      purchasesOneDayShippingCount: 420,
      purchasesTwoDayShippingCount: 120,
      reportingDate: today,
      periodType: "WEEK",
      weekValue: "2026-W44",
      year: 2026,
    },
    {
      searchQuery: "4k streaming webcam microphone",
      asin: "B0MOCK0005",
      searchQueryScore: 86,
      searchQueryVolume: 78500,
      impressionsTotalCount: 176000,
      impressionsAsinCount: 26400,
      impressionsAsinShare: 15.0,
      clicksTotalCount: 12100,
      clicksClickRate: 6.88,
      clicksAsinCount: 2140,
      clicksAsinShare: 17.69,
      clicksPriceMedian: 74.99,
      clicksAsinPriceMedian: 69.99,
      clicksSameDayShippingCount: 8100,
      clicksOneDayShippingCount: 3100,
      clicksTwoDayShippingCount: 900,
      cartAddsTotalCount: 2890,
      cartAddsCartAddRate: 23.88,
      cartAddsAsinCount: 580,
      cartAddsAsinShare: 20.07,
      cartAddsPriceMedian: 72.99,
      cartAddsAsinPriceMedian: 69.99,
      cartAddsSameDayShippingCount: 1980,
      cartAddsOneDayShippingCount: 710,
      cartAddsTwoDayShippingCount: 200,
      purchasesTotalCount: 1420,
      purchasesPurchaseRate: 49.13,
      purchasesAsinCount: 310,
      purchasesAsinShare: 21.83,
      purchasesPriceMedian: 71.99,
      purchasesAsinPriceMedian: 69.99,
      purchasesSameDayShippingCount: 980,
      purchasesOneDayShippingCount: 340,
      purchasesTwoDayShippingCount: 100,
      reportingDate: today,
      periodType: "WEEK",
      weekValue: "2026-W44",
      year: 2026,
    },
    {
      searchQuery: "ergonomic aluminum laptop stand",
      asin: "B0MOCK0006",
      searchQueryScore: 81,
      searchQueryVolume: 64200,
      impressionsTotalCount: 142000,
      impressionsAsinCount: 18400,
      impressionsAsinShare: 12.96,
      clicksTotalCount: 9600,
      clicksClickRate: 6.76,
      clicksAsinCount: 1420,
      clicksAsinShare: 14.79,
      clicksPriceMedian: 36.99,
      clicksAsinPriceMedian: 34.99,
      clicksSameDayShippingCount: 6400,
      clicksOneDayShippingCount: 2400,
      clicksTwoDayShippingCount: 800,
      cartAddsTotalCount: 2180,
      cartAddsCartAddRate: 22.71,
      cartAddsAsinCount: 390,
      cartAddsAsinShare: 17.89,
      cartAddsPriceMedian: 35.99,
      cartAddsAsinPriceMedian: 34.99,
      cartAddsSameDayShippingCount: 1480,
      cartAddsOneDayShippingCount: 540,
      cartAddsTwoDayShippingCount: 160,
      purchasesTotalCount: 1090,
      purchasesPurchaseRate: 50.0,
      purchasesAsinCount: 210,
      purchasesAsinShare: 19.27,
      purchasesPriceMedian: 35.49,
      purchasesAsinPriceMedian: 34.99,
      purchasesSameDayShippingCount: 740,
      purchasesOneDayShippingCount: 270,
      purchasesTwoDayShippingCount: 80,
      reportingDate: today,
      periodType: "WEEK",
      weekValue: "2026-W44",
      year: 2026,
    },
    {
      searchQuery: "apexgear earbuds pro",
      asin: "B0MOCK0001",
      searchQueryScore: 99,
      searchQueryVolume: 48200,
      impressionsTotalCount: 94000,
      impressionsAsinCount: 41200,
      impressionsAsinShare: 43.83,
      clicksTotalCount: 9200,
      clicksClickRate: 9.79,
      clicksAsinCount: 4840,
      clicksAsinShare: 52.61,
      clicksPriceMedian: 59.99,
      clicksAsinPriceMedian: 59.99,
      clicksSameDayShippingCount: 6800,
      clicksOneDayShippingCount: 1900,
      clicksTwoDayShippingCount: 500,
      cartAddsTotalCount: 2940,
      cartAddsCartAddRate: 31.96,
      cartAddsAsinCount: 1720,
      cartAddsAsinShare: 58.5,
      cartAddsPriceMedian: 59.99,
      cartAddsAsinPriceMedian: 59.99,
      cartAddsSameDayShippingCount: 2200,
      cartAddsOneDayShippingCount: 590,
      cartAddsTwoDayShippingCount: 150,
      purchasesTotalCount: 1760,
      purchasesPurchaseRate: 59.86,
      purchasesAsinCount: 1090,
      purchasesAsinShare: 61.93,
      purchasesPriceMedian: 59.99,
      purchasesAsinPriceMedian: 59.99,
      purchasesSameDayShippingCount: 1320,
      purchasesOneDayShippingCount: 350,
      purchasesTwoDayShippingCount: 90,
      reportingDate: today,
      periodType: "WEEK",
      weekValue: "2026-W44",
      year: 2026,
    },
    {
      searchQuery: "noise cancelling workout earbuds",
      asin: "B0MOCK0001",
      searchQueryScore: 88,
      searchQueryVolume: 112000,
      impressionsTotalCount: 248000,
      impressionsAsinCount: 34600,
      impressionsAsinShare: 13.95,
      clicksTotalCount: 16800,
      clicksClickRate: 6.77,
      clicksAsinCount: 2780,
      clicksAsinShare: 16.55,
      clicksPriceMedian: 64.99,
      clicksAsinPriceMedian: 59.99,
      clicksSameDayShippingCount: 11200,
      clicksOneDayShippingCount: 4200,
      clicksTwoDayShippingCount: 1400,
      cartAddsTotalCount: 3920,
      cartAddsCartAddRate: 23.33,
      cartAddsAsinCount: 740,
      cartAddsAsinShare: 18.88,
      cartAddsPriceMedian: 62.99,
      cartAddsAsinPriceMedian: 59.99,
      cartAddsSameDayShippingCount: 2680,
      cartAddsOneDayShippingCount: 980,
      cartAddsTwoDayShippingCount: 260,
      purchasesTotalCount: 1960,
      purchasesPurchaseRate: 50.0,
      purchasesAsinCount: 410,
      purchasesAsinShare: 20.92,
      purchasesPriceMedian: 61.99,
      purchasesAsinPriceMedian: 59.99,
      purchasesSameDayShippingCount: 1340,
      purchasesOneDayShippingCount: 490,
      purchasesTwoDayShippingCount: 130,
      reportingDate: today,
      periodType: "WEEK",
      weekValue: "2026-W44",
      year: 2026,
    },
  ];

  brandAnalyticsQueries.forEach((ba, idx) => {
    docs.push({
      userId: null,
      moduleType: "BRAND_ANALYTICS",
      subType: "MAIN",
      adType: "ALL",
      recordId: `BA-${950001 + idx}`,
      parentId: ba.asin,
      isDefault: true,
      data: ba,
    });
  });

  docs.push({
    userId: null,
    moduleType: "BRAND_DETAILS",
    subType: "MAIN",
    adType: "SB",
    recordId: "BRAND-APEXGEAR-01",
    parentId: String(MOCK_PROFILE_ID),
    isDefault: true,
    data: {
      adId: 830001,
      campaignId: 800005,
      adGroupId: 810005,
      name: "ApexGear Official Store Collection",
      state: "ENABLED",
      brandEntityId: "ENTITY-APEXGEAR-MOCK01",
      brandRegistryName: "ApexGear Official",
      creative: {
        brandName: "ApexGear Official",
        brandLogoAssetID: "amzn1.assetlibrary.asset1.mockapexgearlogo01:version_v1",
        brandLogoUrl: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
        headline: "Experience Pure Sound & Next-Gen GaN Power with ApexGear",
        asins: ["B0MOCK0001", "B0MOCK0002", "B0MOCK0003"],
        shouldOptimizeAsins: true,
      },
      landingPage: {
        pageType: "STORE",
        url: "https://www.amazon.com/stores/page/APEXGEAR-DEMO-STORE",
      },
    },
  });

  return docs;
}

/**
 * Ensures the `mock_testing_data` collection is seeded with default records.
 */
async function ensureMockDataSeeded(force = false) {
  if (isSeededCache && !force) return;
  try {
    const [existingCount, campCount, histCount, orderCount] = await Promise.all([
      MockTestingData.countDocuments({ isDefault: true }),
      MockTestingData.countDocuments({ isDefault: true, moduleType: "CAMPAIGN", subType: "MAIN" }),
      MockTestingData.countDocuments({ isDefault: true, moduleType: "HISTORY", subType: "MAIN" }),
      MockTestingData.countDocuments({ isDefault: true, moduleType: "PURCHASE_ORDER", subType: "MAIN" }),
    ]);
    if (force || existingCount === 0 || campCount !== 2 || histCount !== 2 || orderCount < 10) {
      await MockTestingData.deleteMany({ isDefault: true });
      const defaultDocs = buildDefaultMockDocuments();
      await MockTestingData.insertMany(defaultDocs, { ordered: false });
      await MockTestingData.createIndexes();
    }
    isSeededCache = true;
  } catch (err) {
    console.error("[MockTestingData] Seed check error:", err.message);
  }
}

exports.ensureMockDataSeeded = ensureMockDataSeeded;

/**
 * Fetch combined default + user-specific mock records from `mock_testing_data`
 */
async function getMockRecords({ userId, moduleType, subType = "MAIN", adType = null, parentId = null }) {
  await ensureMockDataSeeded();

  const userFilter = userId ? [{ userId: null }, { userId }] : [{ userId: null }];
  const query = {
    moduleType,
    subType,
    isActive: true,
    $or: userFilter,
  };

  if (adType && adType !== "ALL" && adType !== "All") {
    query.adType = { $in: [String(adType).toUpperCase(), "ALL"] };
  }
  if (parentId) {
    query.parentId = String(parentId);
  }

  const docs = await MockTestingData.find(query).sort({ isDefault: 1, createdAt: -1 }).lean();
  return docs.map((d) => ({ ...d.data, _mockDocId: d._id, isUserCreatedMock: !d.isDefault }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1: CAMPAIGN CREATE & FETCH
// ═══════════════════════════════════════════════════════════════════════════════

exports.createMockCampaign = async (req, res, forcedAdType = null) => {
  await ensureMockDataSeeded();
  const userId = req.user?._id || req.user?.id || null;
  const body = req.body || {};

  const rawType = forcedAdType || body.type || req.adType || "SP";
  const adType =
    String(rawType).toUpperCase().includes("BRAND") || String(rawType).toUpperCase() === "SB"
      ? "SB"
      : String(rawType).toUpperCase().includes("DISPLAY") || String(rawType).toUpperCase() === "SD"
        ? "SD"
        : "SP";

  const typeLabel = AD_TYPE_LABEL[adType] || "Sponsored Products";
  const campaignId = Math.floor(850000 + Math.random() * 49000);
  const adGroupId = Math.floor(860000 + Math.random() * 39000);
  const today = moment().format("YYYY-MM-DD");

  const campaignName =
    body.name ||
    body.campaignName ||
    `${adType} | Mock Campaign ${moment().format("MMM DD HH:mm")}`;
  const budget = Number(body.budget || body.dailyBudget || 50);
  const status = String(body.status || body.state || "ENABLED").toUpperCase();
  const targetingType = String(body.targetingType || "MANUAL").toUpperCase();
  const biddingStrategy =
    body.bidding?.strategy || body.dynamicBidding?.strategy || body.biddingStrategy || "AUTO_FOR_SALES";

  // Generate realistic initial sample metrics so user immediately sees what data displays after creation
  const sampleMetrics = computeMetrics({
    impressions: 12400,
    clicks: 410,
    spend: Number((budget * 3.4).toFixed(2)),
    sales: Number((budget * 14.8).toFixed(2)),
    orders: 26,
    units: 29,
  });

  const campaignData = {
    campaignId,
    name: campaignName,
    adType,
    type: typeLabel,
    targetingType,
    status,
    budget,
    budgetType: body.budgetType || "DAILY",
    biddingStrategy,
    startDate: body.startDate || today,
    endDate: body.endDate || null,
    reportDate: today,
    ...sampleMetrics,
    totalSpend: sampleMetrics.spend,
    totalSales: sampleMetrics.sales,
    totalImpressions: sampleMetrics.impressions,
    totalClicks: sampleMetrics.clicks,
    totalOrders: sampleMetrics.orders,
    totalUnits: sampleMetrics.units,
    totalCpc: sampleMetrics.cpc,
    totalAcos: sampleMetrics.acos,
    totalRoas: sampleMetrics.roas,
    totalCtr: sampleMetrics.ctr,
    totalCvr: sampleMetrics.cvr,
  };

  const docsToInsert = [
    {
      userId,
      moduleType: "CAMPAIGN",
      subType: "MAIN",
      adType,
      recordId: String(campaignId),
      parentId: null,
      isDefault: false,
      data: campaignData,
    },
  ];

  // Extract submitted products or fallback to default product
  const submittedProducts = Array.isArray(body.productAds)
    ? body.productAds
    : Array.isArray(body.products)
      ? body.products
      : Array.isArray(body.asins)
        ? body.asins.map((a) => (typeof a === "string" ? { asin: a, sku: `SKU-${a}` } : a))
        : [];

  const firstProd = submittedProducts[0] || {
    asin: "B0MOCK0001",
    sku: "APEX-EARBUDS-PRO",
    title: "ApexGear Wireless Noise Cancelling Earbuds Pro - Bluetooth 5.3",
    imageUrl: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
    price: 59.99,
  };

  const adGroupName =
    body.adGroupName || body.adGroup?.name || `${campaignName} - AdGroup 1`;
  const defaultBid = Number(body.defaultBid || body.adGroup?.defaultBid || 1.25);

  docsToInsert.push({
    userId,
    moduleType: "CAMPAIGN",
    subType: "AD_GROUP",
    adType,
    recordId: String(adGroupId),
    parentId: String(campaignId),
    isDefault: false,
    data: {
      adGroupId,
      campaignId,
      campaignName,
      name: adGroupName,
      defaultBid,
      bid: defaultBid,
      status: "ENABLED",
      type: typeLabel,
      sku: firstProd.sku || "APEX-EARBUDS-PRO",
      asin: firstProd.asin || "B0MOCK0001",
      productName: firstProd.title || firstProd.itemName || firstProd.productName || "ApexGear Wireless Earbuds Pro",
      imageUrl: firstProd.imageUrl || firstProd.imageURL || "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
      amount: Number(firstProd.price || firstProd.amount || 59.99),
      ...sampleMetrics,
      totalSpend: sampleMetrics.spend,
      totalSales: sampleMetrics.sales,
      totalImpressions: sampleMetrics.impressions,
      totalClicks: sampleMetrics.clicks,
      totalOrders: sampleMetrics.orders,
      totalCpc: sampleMetrics.cpc,
      totalAcos: sampleMetrics.acos,
      totalRoas: sampleMetrics.roas,
      totalCtr: sampleMetrics.ctr,
      totalCvr: sampleMetrics.cvr,
      productAdsCount: Math.max(submittedProducts.length, 1),
      keywordsCount: 3,
    },
  });

  // Product Ads for the created campaign
  const prodsToSave = submittedProducts.length > 0 ? submittedProducts : [firstProd];
  prodsToSave.forEach((p, idx) => {
    const adId = Math.floor(870000 + Math.random() * 29000) + idx;
    docsToInsert.push({
      userId,
      moduleType: "PRODUCT_LIST",
      subType: "PRODUCT_AD",
      adType,
      recordId: `AD-${adId}`,
      parentId: String(campaignId),
      isDefault: false,
      data: {
        adId,
        sku: p.sku || `SKU-${p.asin || "MOCK"}`,
        asins: p.asin || "B0MOCK0001",
        asin: p.asin || "B0MOCK0001",
        status: "ENABLED",
        campaignId,
        adGroupId,
        productName: p.title || p.itemName || p.productName || "ApexGear Product",
        imageUrl: p.imageUrl || p.imageURL || "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
        price: Number(p.price || 59.99),
        ...sampleMetrics,
        totalSpend: sampleMetrics.spend,
        totalSales: sampleMetrics.sales,
        totalImpressions: sampleMetrics.impressions,
        totalClicks: sampleMetrics.clicks,
        totalOrders: sampleMetrics.orders,
        totalCpc: sampleMetrics.cpc,
        totalCtr: sampleMetrics.ctr,
        totalCvr: sampleMetrics.cvr,
        totalAcos: sampleMetrics.acos,
        totalRoas: sampleMetrics.roas,
        productData: {
          title: p.title || p.itemName || "ApexGear Product",
          imageUrl: p.imageUrl || p.imageURL || "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
        },
        campaigns: [
          {
            campaignId,
            adGroupId,
            name: campaignName,
            status: "ENABLED",
            ...sampleMetrics,
          },
        ],
      },
    });
  });

  // Extract submitted keywords / targets or generate realistic ones for this campaign
  const rawKeywords = Array.isArray(body.keywords)
    ? body.keywords
    : Array.isArray(body.targets)
      ? body.targets
      : Array.isArray(body.targetingClauses)
        ? body.targetingClauses
        : [
          { keywordText: `${campaignName.split("|")[1]?.trim() || "apexgear"} wireless`, matchType: "EXACT", bid: defaultBid },
          { keywordText: `${campaignName.split("|")[1]?.trim() || "apexgear"} pro`, matchType: "PHRASE", bid: defaultBid },
        ];

  rawKeywords.forEach((kw, idx) => {
    const targetId = `T-${Math.floor(920000 + Math.random() * 70000) + idx}`;
    const kwText = kw.keywordText || kw.targeting || kw.value || kw.asin || `mock target ${idx + 1}`;
    const matchType = String(kw.matchType || "EXACT").toUpperCase();
    const bidVal = Number(kw.bid || kw.keywordBid || defaultBid);
    const kwMetrics = computeMetrics({
      impressions: 6200,
      clicks: 205,
      spend: Number((sampleMetrics.spend / Math.max(rawKeywords.length, 1)).toFixed(2)),
      sales: Number((sampleMetrics.sales / Math.max(rawKeywords.length, 1)).toFixed(2)),
      orders: Math.max(Math.round(sampleMetrics.orders / Math.max(rawKeywords.length, 1)), 1),
    });

    docsToInsert.push({
      userId,
      moduleType: "TARGETING",
      subType: "MAIN",
      adType,
      recordId: targetId,
      parentId: String(campaignId),
      isDefault: false,
      data: {
        targetId,
        keywordId: Number(targetId.replace("T-", "")),
        targeting: kwText,
        keywordText: kwText,
        matchType,
        keywordType: kw.targetingType || "KEYWORD",
        targetingType: kw.targetingType || "KEYWORD",
        adType,
        type: typeLabel,
        campaignId,
        campaignName,
        campaignStatus: status,
        adGroupId,
        adGroupName,
        status: "ENABLED",
        bid: bidVal,
        keywordBid: bidVal,
        ...kwMetrics,
        reportDate: today,
      },
    });

    // Also add to Keyword Tracker & Search Term so user sees the newly created campaign's keywords across all tabs
    docsToInsert.push({
      userId,
      moduleType: "KEYWORD_TRACKER",
      subType: "MAIN",
      adType,
      recordId: `KT-${targetId}`,
      parentId: String(campaignId),
      isDefault: false,
      data: {
        profileId: Number(body.profileId || MOCK_PROFILE_ID),
        targeting: kwText,
        matchType,
        adType,
        ...kwMetrics,
        campaignIds: [campaignId],
        campaignCount: 1,
        productCount: prodsToSave.length,
        customStatus: "WINNER",
      },
    });

    docsToInsert.push({
      userId,
      moduleType: "SEARCH_TERM",
      subType: "MAIN",
      adType,
      recordId: `ST-${targetId}`,
      parentId: String(campaignId),
      isDefault: false,
      data: {
        searchTerm: `best ${kwText}`,
        query: `best ${kwText}`,
        keywordText: kwText,
        keywordId: Number(targetId.replace("T-", "")),
        matchType,
        adType,
        type: typeLabel,
        campaignId,
        campaignName,
        campaignStatus: status,
        adGroupId,
        adGroupName,
        adGroupStatus: "ENABLED",
        asin: firstProd.asin || "B0MOCK0001",
        asins: firstProd.asin || "B0MOCK0001",
        sku: firstProd.sku || "APEX-EARBUDS-PRO",
        productName: firstProd.title || "ApexGear Wireless Earbuds Pro",
        imageUrl: firstProd.imageUrl || "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
        status: "ENABLED",
        keywordBid: bidVal,
        ...kwMetrics,
        reportDate: today,
      },
    });
  });

  // Also add Placement record for the newly created campaign
  docsToInsert.push({
    userId,
    moduleType: "PLACEMENT",
    subType: "MAIN",
    adType,
    recordId: `PL-${campaignId}`,
    parentId: String(campaignId),
    isDefault: false,
    data: {
      campaignId,
      campaignName,
      campaignStatus: status,
      type: typeLabel,
      keywordBid: defaultBid,
      totalImpressions: sampleMetrics.impressions,
      totalClicks: sampleMetrics.clicks,
      totalOrders: sampleMetrics.orders,
      totalUnits: sampleMetrics.units,
      totalSales: sampleMetrics.sales,
      totalSpend: sampleMetrics.spend,
      totalAcos: sampleMetrics.acos,
      totalRoas: sampleMetrics.roas,
      totalCpc: sampleMetrics.cpc,
      totalCtr: sampleMetrics.ctr,
      totalCvr: sampleMetrics.cvr,
      placementsData: [
        {
          campaignId,
          placement: "Top of Search",
          ...sampleMetrics,
          biddingStartegy: biddingStrategy,
          bidStrategy: biddingStrategy,
          placementModifier: Number(body.placementTop || 20),
          targetAcos: 25,
          newKeywordBid: defaultBid,
        },
        {
          campaignId,
          placement: "Product Pages",
          ...computeMetrics({ impressions: 4200, clicks: 130, spend: 95, sales: 410, orders: 8 }),
          biddingStartegy: biddingStrategy,
          bidStrategy: biddingStrategy,
          placementModifier: Number(body.placementProductPage || 10),
          targetAcos: 25,
          newKeywordBid: defaultBid,
        },
        {
          campaignId,
          placement: "Rest of Search",
          ...computeMetrics({ impressions: 2100, clicks: 65, spend: 45, sales: 195, orders: 4 }),
          biddingStartegy: biddingStrategy,
          bidStrategy: biddingStrategy,
          placementModifier: 0,
          targetAcos: 25,
          newKeywordBid: defaultBid,
        },
      ],
    },
  });

  await MockTestingData.insertMany(docsToInsert, { ordered: false });

  return res.status(200).send({
    isSuccess: true,
    message: "Mock Campaign created successfully! Dummy performance data has been generated for testing.",
    data: campaignData,
    campaignId,
    adGroupId,
  });
};

exports.getCampaigns = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.adType || "SP";
  const records = await getMockRecords({ userId, moduleType: "CAMPAIGN", subType: "MAIN", adType });

  const { data, allFiltered, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchName,
    searchFields: ["name", "campaignId", "type", "status"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "spend",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  const totalRow = buildTotalRow(allFiltered, "name");

  return res.status(200).send({
    isSuccess: true,
    getCampaign: data,
    totalRow,
    currentPageNo,
    totalRecords,
    totalPages,
    notifySetting: null,
  });
};

exports.getCampaignChartData = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.adType || "SP";
  const records = await getMockRecords({ userId, moduleType: "CAMPAIGN", subType: "MAIN", adType });

  const fromDate = req.body?.fromDate ? moment(req.body.fromDate) : moment().subtract(6, "days");
  const toDate = req.body?.toDate ? moment(req.body.toDate) : moment();
  const daysDiff = Math.min(Math.max(toDate.diff(fromDate, "days") + 1, 1), 60);

  const totalTotals = buildTotalRow(records);
  const chartPoints = [];

  for (let i = 0; i < daysDiff; i++) {
    const dateStr = fromDate.clone().add(i, "days").format("YYYY-MM-DD");
    const wave = 0.75 + ((i * 7 + 3) % 10) * 0.05;
    const dayMetrics = computeMetrics({
      impressions: Math.round((totalTotals.impressions / Math.max(daysDiff, 7)) * wave),
      clicks: Math.round((totalTotals.clicks / Math.max(daysDiff, 7)) * wave),
      spend: Number(((totalTotals.spend / Math.max(daysDiff, 7)) * wave).toFixed(2)),
      sales: Number(((totalTotals.sales / Math.max(daysDiff, 7)) * wave).toFixed(2)),
      orders: Math.max(Math.round((totalTotals.orders / Math.max(daysDiff, 7)) * wave), 1),
    });

    chartPoints.push({
      reportDate: dateStr,
      ...dayMetrics,
    });
  }

  return res.status(200).send({
    isSuccess: true,
    data: chartPoints,
    filteredCampaignIds: records.map((r) => r.campaignId),
    totalFilteredCampaigns: records.length,
  });
};

exports.getCampaignDataTable = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const campaignId = Number(req.params?.id || req.body?.campaignId || 800001);
  const records = await getMockRecords({ userId, moduleType: "CAMPAIGN", subType: "MAIN", adType: "ALL" });
  const camp = records.find((c) => Number(c.campaignId) === campaignId) || records[0];

  const fromDate = req.body?.fromDate ? moment(req.body.fromDate) : moment().subtract(6, "days");
  const toDate = req.body?.toDate ? moment(req.body.toDate) : moment();
  const daysDiff = Math.min(Math.max(toDate.diff(fromDate, "days") + 1, 1), 14);

  const dataTable = [];
  for (let i = 0; i < daysDiff; i++) {
    const dStr = fromDate.clone().add(i, "days").format("YYYY-MM-DD");
    const wave = 0.8 + ((i * 5 + 2) % 7) * 0.06;
    const m = computeMetrics({
      impressions: Math.round(((camp?.impressions || 20000) / daysDiff) * wave),
      clicks: Math.round(((camp?.clicks || 700) / daysDiff) * wave),
      spend: Number((((camp?.spend || 450) / daysDiff) * wave).toFixed(2)),
      sales: Number((((camp?.sales || 2100) / daysDiff) * wave).toFixed(2)),
      orders: Math.max(Math.round(((camp?.orders || 35) / daysDiff) * wave), 1),
    });

    dataTable.push({
      campaignId: camp?.campaignId || campaignId,
      campaignName: camp?.name || "SP | Wireless Earbuds Pro | Exact Match",
      campaignStatus: camp?.status || "ENABLED",
      ...m,
      fromDate: dStr,
      toDate: dStr,
      avgSalesPrice: m.orders > 0 ? Number((m.sales / m.orders).toFixed(2)) : 0,
      costPerOrder: m.orders > 0 ? Number((m.spend / m.orders).toFixed(2)) : 0,
    });
  }

  return res.status(200).send({
    isSuccess: true,
    message: "Data table listing Successfully",
    dataTable,
  });
};

exports.getCampaignDetailsData = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const campaignId = Number(req.params?.id || req.body?.campaignId);

  const campaigns = await getMockRecords({ userId, moduleType: "CAMPAIGN", subType: "MAIN", adType: "ALL" });
  const foundCampaign = campaigns.find((c) => Number(c.campaignId) === campaignId) || campaigns[0];

  const adGroups = await getMockRecords({
    userId,
    moduleType: "CAMPAIGN",
    subType: "AD_GROUP",
    adType: "ALL",
    parentId: foundCampaign ? String(foundCampaign.campaignId) : null,
  });

  const placements = await getMockRecords({
    userId,
    moduleType: "PLACEMENT",
    subType: "MAIN",
    adType: "ALL",
    parentId: foundCampaign ? String(foundCampaign.campaignId) : null,
  });

  return res.status(200).send({
    isSuccess: true,
    message: "Get campaign details data successfully.",
    getCampaignData: foundCampaign ? [foundCampaign] : [],
    getPlacementData: placements,
    getAdGroupsData: adGroups,
    totalAdGroupData: adGroups.length,
    adGroupCurrentPageNo: 1,
    adGroupTotalPages: 1,
  });
};

exports.listCampaignName = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.type || "ALL";
  const campaigns = await getMockRecords({ userId, moduleType: "CAMPAIGN", subType: "MAIN", adType });

  const data = campaigns.map((c) => ({
    campaignId: c.campaignId,
    name: c.name,
    type: c.type,
    status: c.status,
  }));

  return res.status(200).send({
    isSuccess: true,
    message: "Campaign list successfully.",
    data,
    totalRecords: data.length,
  });
};

exports.getAdGroupsByCampaign = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const campaignId = req.params?.id || req.body?.campaignId;
  let adGroups = await getMockRecords({
    userId,
    moduleType: "CAMPAIGN",
    subType: "AD_GROUP",
    adType: "ALL",
    parentId: campaignId ? String(campaignId) : null,
  });

  if (adGroups.length === 0) {
    adGroups = await getMockRecords({ userId, moduleType: "CAMPAIGN", subType: "AD_GROUP", adType: "ALL" });
  }

  const { data, allFiltered, currentPageNo, perPage, totalRecords, totalPages } = filterSortPaginate(adGroups, {
    searchName: req.body?.searchName,
    searchFields: ["name", "adGroupId", "sku", "asin"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "totalSpend",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    getAdGroupsData: data,
    totalAdGroupData: totalRecords,
    totalRow: buildTotalRow(allFiltered, "name"),
    currentPageNo,
    perPage,
    totalPages,
  });
};

exports.getProductAdsByAdGroup = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adGroupId = Number(req.params?.id || req.body?.adGroupId);
  let productAds = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "PRODUCT_AD", adType: "ALL" });

  const matching = productAds.filter((p) => Number(p.adGroupId) === adGroupId);
  if (matching.length > 0) productAds = matching;

  const { data, allFiltered, currentPageNo, perPage, totalRecords, totalPages } = filterSortPaginate(productAds, {
    searchName: req.body?.searchName,
    searchFields: ["productName", "sku", "asin"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "totalSpend",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    getProductAdsData: data,
    totalProductAdsData: totalRecords,
    totalRow: buildTotalRow(allFiltered, "productName"),
    currentPageNo,
    perPage,
    totalPages,
  });
};

exports.getCampaignHelperEntities = async (req, res, entityType) => {
  if (entityType === "BRANDS") {
    return res.status(200).send({
      isSuccess: true,
      data: [{ brandEntityId: "BRAND-MOCK-01", brandRegistryName: "ApexGear Official" }],
    });
  }
  if (entityType === "PORTFOLIOS") {
    return res.status(200).send({
      isSuccess: true,
      data: [
        { portfolioId: 70001, name: "ApexGear Audio Flagship", state: "ENABLED" },
        { portfolioId: 70002, name: "ApexGear Charging & Power", state: "ENABLED" },
      ],
    });
  }
  if (entityType === "STORES" || entityType === "STORE_PAGES") {
    return res.status(200).send({
      isSuccess: true,
      data: [
        {
          storeName: "ApexGear Official Store",
          entityId: "STORE-MOCK-01",
          storePageId: "PAGE-HOME-01",
          storePageName: "Home Page",
          storePageUrl: "https://www.amazon.com/stores/page/MOCK0001",
        },
      ],
    });
  }
  return res.status(200).send({ isSuccess: true, data: [] });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2: TARGETING FETCHING & CREATION
// ═══════════════════════════════════════════════════════════════════════════════

exports.getTargeting = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.adType || "SP";
  let records = await getMockRecords({ userId, moduleType: "TARGETING", subType: "MAIN", adType });

  // Normalize keywordType and topOfSearchImpressionShare for all records
  records = records.map((r, idx) => ({
    ...r,
    keywordType:
      r.keywordType === "KEYWORD"
        ? r.matchType || "EXACT"
        : r.keywordType === "TARGET"
          ? "TARGETING_EXPRESSION"
          : r.keywordType || r.matchType || "EXACT",
    topOfSearchImpressionShare: r.topOfSearchImpressionShare ?? Number((32 + (idx % 6) * 4.3).toFixed(1)),
  }));

  // Filter by campaignId (can be a single value or an array)
  const rawCampaignId = req.body?.campaignId;
  if (Array.isArray(rawCampaignId) && rawCampaignId.length > 0) {
    const cIds = rawCampaignId.map(Number).filter(Boolean);
    if (cIds.length > 0) records = records.filter((r) => cIds.includes(Number(r.campaignId)));
  } else if (rawCampaignId && !Array.isArray(rawCampaignId)) {
    records = records.filter((r) => Number(r.campaignId) === Number(rawCampaignId));
  }

  // Filter by adGroupId (can be a single value or an array)
  const rawAdGroupId = req.body?.adGroupId;
  if (Array.isArray(rawAdGroupId) && rawAdGroupId.length > 0) {
    const agIds = rawAdGroupId.map(Number).filter(Boolean);
    if (agIds.length > 0) records = records.filter((r) => agIds.includes(Number(r.adGroupId)));
  } else if (rawAdGroupId && !Array.isArray(rawAdGroupId)) {
    records = records.filter((r) => Number(r.adGroupId) === Number(rawAdGroupId));
  }

  // Filter by targetingTabFilter (All / Keyword Targets / Product Targets / Other Targets)
  const tabKeywordType = req.body?.targetingTabFilter?.keywordType;
  if (tabKeywordType) {
    if (Array.isArray(tabKeywordType.$in) && tabKeywordType.$in.length > 0) {
      records = records.filter((r) => tabKeywordType.$in.includes(r.keywordType) || tabKeywordType.$in.includes(r.matchType));
    } else if (Array.isArray(tabKeywordType.$nin) && tabKeywordType.$nin.length > 0) {
      records = records.filter((r) => !tabKeywordType.$nin.includes(r.keywordType) && !tabKeywordType.$nin.includes(r.matchType));
    }
  }

  // Filter by targetingType array if selected
  if (Array.isArray(req.body?.targetingType) && req.body.targetingType.length > 0) {
    records = records.filter(
      (r) => req.body.targetingType.includes(r.keywordType) || req.body.targetingType.includes(r.matchType)
    );
  }

  // Filter by targetingStatus / campaignStatus
  const targetStatus = req.body?.targetingStatus || req.body?.status;
  if (targetStatus && targetStatus !== "ALL") {
    records = records.filter((r) => String(r.status || "ENABLED").toUpperCase() === String(targetStatus).toUpperCase());
  }
  if (req.body?.campaignStatus && req.body.campaignStatus !== "ALL") {
    records = records.filter(
      (r) => String(r.campaignStatus || "ENABLED").toUpperCase() === String(req.body.campaignStatus).toUpperCase()
    );
  }

  const { data, allFiltered, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchName,
    searchFields: ["targeting", "keywordText", "campaignName", "matchType", "keywordType"],
    fieldName: req.body?.fieldName || "sales",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  const totalRow = buildTotalRow(allFiltered, "targeting");
  totalRow.keywordBid =
    allFiltered.length > 0
      ? Number((allFiltered.reduce((sum, r) => sum + Number(r.keywordBid || 0), 0) / allFiltered.length).toFixed(2))
      : 0;
  totalRow.topOfSearchImpressionShare =
    allFiltered.length > 0
      ? Number(
        (
          allFiltered.reduce((sum, r) => sum + Number(r.topOfSearchImpressionShare || 0), 0) / allFiltered.length
        ).toFixed(1)
      )
      : 0;

  return res.status(200).send({
    isSuccess: true,
    getTargeting: data,
    totalRow,
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

exports.getTargetingChartData = async (req, res) => {
  return exports.getCampaignChartData(req, res);
};

exports.getTargetingByCampaigns = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "TARGETING", subType: "MAIN", adType: "ALL" });
  return res.status(200).send({
    isSuccess: true,
    data: records,
  });
};

exports.addMockTargets = async (req, res) => {
  await ensureMockDataSeeded();
  const userId = req.user?._id || req.user?.id || null;
  const body = req.body || {};
  const today = moment().format("YYYY-MM-DD");

  const list = Array.isArray(body.keywords)
    ? body.keywords
    : Array.isArray(body.targets)
      ? body.targets
      : Array.isArray(body.updateTargets)
        ? body.updateTargets
        : [body];

  const docs = list.map((item, idx) => {
    const targetId = `T-${Math.floor(940000 + Math.random() * 50000) + idx}`;
    const kwText = item.keywordText || item.targeting || item.value || "new mock keyword";
    const matchType = String(item.matchType || "EXACT").toUpperCase();
    const bidVal = Number(item.bid || item.keywordBid || 1.25);
    const m = computeMetrics({ impressions: 4500, clicks: 150, spend: 112.5, sales: 539.9, orders: 9 });

    return {
      userId,
      moduleType: "TARGETING",
      subType: "MAIN",
      adType: item.adType || "SP",
      recordId: targetId,
      parentId: String(item.campaignId || 800001),
      isDefault: false,
      data: {
        targetId,
        keywordId: Number(targetId.replace("T-", "")),
        targeting: kwText,
        keywordText: kwText,
        matchType,
        keywordType: "KEYWORD",
        targetingType: "KEYWORD",
        adType: item.adType || "SP",
        type: "Sponsored Products",
        campaignId: Number(item.campaignId || 800001),
        campaignName: item.campaignName || "SP | Wireless Earbuds Pro | Exact Match",
        campaignStatus: "ENABLED",
        adGroupId: Number(item.adGroupId || 810001),
        adGroupName: item.adGroupName || "AdGroup 1",
        status: "ENABLED",
        bid: bidVal,
        keywordBid: bidVal,
        ...m,
        reportDate: today,
      },
    };
  });

  if (docs.length > 0) {
    await MockTestingData.insertMany(docs, { ordered: false });
  }

  return res.status(200).send({
    isSuccess: true,
    message: "Mock targets added successfully!",
    data: docs.map((d) => d.data),
  });
};

exports.getKeywordSuggestions = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "TARGETING", subType: "SUGGESTION", adType: "ALL" });

  const enriched = records.map((r, idx) => ({
    id: r._mockDocId || `SUGG-${idx + 1}`,
    searchTerm: r.keywordText,
    targeting: r.keywordText,
    keywordText: r.keywordText,
    matchType: r.matchType || "EXACT",
    keywordType: r.matchType || "EXACT",
    campaignId: 800001 + (idx % 3),
    adGroupId: 810001 + (idx % 3),
    campaignName: idx % 2 === 0 ? "SP | Wireless Earbuds Pro | Exact Match" : "SP | Smart Watch X1 | Auto Discovery",
    adGroupName: "AdGroup 1",
    keywordExistsInAccount: false,
    reason: "revenue generating",
    bid: r.bid,
    days30: {
      spend: r.spend,
      sales: r.sales,
      clicks: r.clicks,
      impressions: r.impressions,
      orders: r.orders,
      cpc: r.cpc,
      acos: r.acos,
      roas: r.roas,
    },
    days14: {
      spend: Number((r.spend * 0.55).toFixed(2)),
      sales: Number((r.sales * 0.58).toFixed(2)),
      clicks: Math.round(r.clicks * 0.55),
      impressions: Math.round(r.impressions * 0.55),
      orders: Math.round(r.orders * 0.58),
      cpc: r.cpc,
      acos: r.acos,
      roas: r.roas,
    },
    days7: {
      spend: Number((r.spend * 0.28).toFixed(2)),
      sales: Number((r.sales * 0.30).toFixed(2)),
      clicks: Math.round(r.clicks * 0.28),
      impressions: Math.round(r.impressions * 0.28),
      orders: Math.round(r.orders * 0.30),
      cpc: r.cpc,
      acos: r.acos,
      roas: r.roas,
    },
    ...r,
  }));

  const { data, totalRecords } = filterSortPaginate(enriched, {
    searchName: req.body?.searchText || req.body?.searchName,
    searchFields: ["keywordText", "searchTerm", "matchType", "theme", "campaignName"],
    fieldName: req.body?.sortBy || "clicks",
    sortType: req.body?.sortOrder || "DESC",
    pageNo: req.body?.pageNo || req.body?.page,
    perPage: req.body?.perPage || req.body?.limit,
  });

  return res.status(200).send({
    isSuccess: true,
    totalRows: totalRecords,
    result: data,
  });
};

exports.getKeywordUniqueFilterValues = async (req, res) => {
  return res.status(200).send({
    isSuccess: true,
    data: ["EXACT", "PHRASE", "BROAD"],
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3: SEARCH TERM
// ═══════════════════════════════════════════════════════════════════════════════

exports.getAllSearchTerms = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.adType || "SP";
  let records = await getMockRecords({ userId, moduleType: "SEARCH_TERM", subType: "MAIN", adType });

  records = records.map((r, idx) => ({
    ...r,
    guid: r.guid || r.recordId || `ST-GUID-${910001 + idx}`,
    campaignStatus: r.campaignStatus || "ENABLED",
    adGroupName: r.adGroupName || `AG - ${r.campaignName?.split("|")[1]?.trim() || "Core"}`,
    keywordType: r.keywordType || r.matchType || "EXACT",
    existTargeting: r.existTargeting || {
      isExist: idx % 2 === 0,
      list: idx % 2 === 0 ? [{ status: "ENABLED", keywordType: r.matchType === "AUTO" ? "EXACT" : r.matchType || "EXACT" }] : [],
    },
  }));

  const rawAdGroupId = req.body?.adGroupId;
  if (Array.isArray(rawAdGroupId) && rawAdGroupId.length > 0) {
    const agIds = rawAdGroupId.map(Number).filter(Boolean);
    if (agIds.length > 0) records = records.filter((r) => agIds.includes(Number(r.adGroupId)));
  } else if (rawAdGroupId && !Array.isArray(rawAdGroupId)) {
    records = records.filter((r) => Number(r.adGroupId) === Number(rawAdGroupId));
  }

  const rawCampaignStatus = req.body?.campaignStatus;
  if (rawCampaignStatus && rawCampaignStatus !== "All") {
    const statuses = Array.isArray(rawCampaignStatus)
      ? rawCampaignStatus.map((s) => String(s).toUpperCase())
      : [String(rawCampaignStatus).toUpperCase()];
    records = records.filter((r) => statuses.includes(String(r.campaignStatus || "ENABLED").toUpperCase()));
  }

  const rawCampaignId = req.body?.campaignId;
  if (Array.isArray(rawCampaignId) && rawCampaignId.length > 0) {
    const cIds = rawCampaignId.map(Number).filter(Boolean);
    if (cIds.length > 0) records = records.filter((r) => cIds.includes(Number(r.campaignId)));
  } else if (rawCampaignId && !Array.isArray(rawCampaignId)) {
    records = records.filter((r) => Number(r.campaignId) === Number(rawCampaignId));
  }

  const { data, allFiltered, currentPageNo, perPage, totalRecords } = filterSortPaginate(records, {
    searchName: req.body?.searchName,
    searchFields: ["searchTerm", "query", "keywordText", "campaignName", "asin", "sku"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "spend",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    totalSearchTerm: totalRecords,
    getSearchTerm: data,
    totalRow: buildTotalRow(allFiltered, "searchTerm"),
    pageNo: currentPageNo,
    perPage,
  });
};

exports.getSearchTermDetailsData = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const targetId = Number(req.params.id) || Number(req.body?.campaignId);
  const adType = req.headers?.adtype || req.body?.adType || "SP";

  let records = await getMockRecords({ userId, moduleType: "SEARCH_TERM", subType: "MAIN", adType: "ALL" });

  let matched = [];
  if (targetId) {
    matched = records.filter((r) => Number(r.campaignId) === targetId);
  }

  // If no mock records specifically tagged with this campaignId, or fewer than 4, provide rich search terms tailored to the campaign
  if (matched.length < 4) {
    const campaigns = await getMockRecords({ userId, moduleType: "CAMPAIGN", subType: "MAIN", adType: "ALL" });
    const camp = campaigns.find((c) => Number(c.campaignId) === targetId) || {
      campaignId: targetId || 800001,
      campaignName: "SP | Wireless Earbuds Pro | Exact Match",
      asin: "B0MOCK0001",
      sku: "APEX-EARBUD-PRO-BLK",
      adGroupId: 810001,
      adGroupName: "AG - Wireless Earbuds Exact",
    };

    const campName = camp.campaignName || "Wireless Earbuds Pro";
    const prodTitle = campName.split("|")?.[1]?.trim() || "Wireless Earbuds Pro";

    const defaultTerms = [
      {
        searchTerm: "wireless noise cancelling earbuds",
        impressions: 24600,
        clicks: 940,
        spend: 812.40,
        sales: 4680.00,
        orders: 78,
        units: 84,
      },
      {
        searchTerm: "bluetooth 5.3 earbuds waterproof",
        impressions: 18900,
        clicks: 710,
        spend: 596.40,
        sales: 3420.00,
        orders: 57,
        units: 60,
      },
      {
        searchTerm: "best anc earbuds for gym workout",
        impressions: 14200,
        clicks: 580,
        spend: 493.00,
        sales: 2850.00,
        orders: 48,
        units: 52,
      },
      {
        searchTerm: "true wireless in ear headphones with mic",
        impressions: 11800,
        clicks: 420,
        spend: 357.00,
        sales: 1980.00,
        orders: 33,
        units: 35,
      },
      {
        searchTerm: "deep bass running earbuds usb c",
        impressions: 9600,
        clicks: 310,
        spend: 263.50,
        sales: 1420.00,
        orders: 24,
        units: 25,
      },
      {
        searchTerm: "sweatproof sport earbuds wireless charging",
        impressions: 7400,
        clicks: 245,
        spend: 208.25,
        sales: 1140.00,
        orders: 19,
        units: 20,
      },
    ];

    const generated = defaultTerms.map((t) => ({
      campaignId: camp.campaignId,
      campaignName: camp.campaignName,
      adGroupId: camp.adGroupId || 810001,
      adGroupName: camp.adGroupName || "AG - Core Exact",
      status: "ENABLED",
      asin: camp.asin || "B0MOCK0001",
      sku: camp.sku || "APEX-EARBUD-PRO-BLK",
      productName: prodTitle,
      title: prodTitle,
      ...t,
      ...computeMetrics(t),
    }));

    // Merge existing matched + generated (avoid duplicate searchTerm)
    const existingTerms = new Set(matched.map((m) => m.searchTerm));
    generated.forEach((g) => {
      if (!existingTerms.has(g.searchTerm)) {
        matched.push(g);
      }
    });
  }

  // Format every record with all fields expected by ViewCampaign.js
  let enriched = matched.map((r) => {
    const m = computeMetrics(r);
    const prodName = r.productName || r.title || r.campaignName?.split("|")?.[1]?.trim() || "Wireless Earbuds Pro";
    return {
      ...r,
      productName: prodName,
      title: prodName,
      searchTerm: r.searchTerm || r.query || "wireless earbuds",
      status: r.status || "ENABLED",
      totalImpressions: Number(r.impressions ?? 0),
      impressions: Number(r.impressions ?? 0),
      totalClicks: Number(r.clicks ?? 0),
      clicks: Number(r.clicks ?? 0),
      totalSales: Number(r.sales ?? 0),
      sales: Number(r.sales ?? 0),
      totalOrders: Number(r.orders ?? 0),
      orders: Number(r.orders ?? 0),
      totalSpend: Number(r.spend ?? 0),
      spend: Number(r.spend ?? 0),
      totalAcos: Number(m.acos ?? 0),
      acos: Number(m.acos ?? 0),
      totalRoas: Number(m.roas ?? 0),
      roas: Number(m.roas ?? 0),
      totalCtr: Number(m.ctr ?? 0),
      ctr: Number(m.ctr ?? 0),
      totalCpc: Number(m.cpc ?? 0),
      cpc: Number(m.cpc ?? 0),
      totalCvr: Number(m.cvr ?? 0),
      cvr: Number(m.cvr ?? 0),
    };
  });

  // Sorting
  const sortField = req.body?.fieldName || "totalSales";
  const sortType = (req.body?.sortType || "DESC").toUpperCase();
  enriched.sort((a, b) => {
    let va = a[sortField] ?? a[sortField.replace("total", "").toLowerCase()] ?? 0;
    let vb = b[sortField] ?? b[sortField.replace("total", "").toLowerCase()] ?? 0;
    if (typeof va === "string") {
      return sortType === "ASC" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortType === "ASC" ? va - vb : vb - va;
  });

  // Pagination
  const pageNo = Number(req.body?.searchTermPageNo || req.body?.pageNo || 1);
  const perPage = Number(req.body?.searchTermPerPage || req.body?.perPage || 10);
  const totalCount = enriched.length;
  const skip = (pageNo - 1) * perPage;
  const paginated = enriched.slice(skip, skip + perPage);

  // Calculate totalRow
  let sumImpressions = 0;
  let sumClicks = 0;
  let sumSales = 0;
  let sumOrders = 0;
  let sumSpend = 0;

  enriched.forEach((row) => {
    sumImpressions += Number(row.totalImpressions || 0);
    sumClicks += Number(row.totalClicks || 0);
    sumSales += Number(row.totalSales || 0);
    sumOrders += Number(row.totalOrders || 0);
    sumSpend += Number(row.totalSpend || 0);
  });

  sumSpend = Number(sumSpend.toFixed(2));
  sumSales = Number(sumSales.toFixed(2));

  const totalAcos = sumSales > 0 ? Number(((sumSpend / sumSales) * 100).toFixed(2)) : 0;
  const totalRoas = sumSpend > 0 ? Number((sumSales / sumSpend).toFixed(2)) : 0;
  const totalCtr = sumImpressions > 0 ? Number(((sumClicks / sumImpressions) * 100).toFixed(2)) : 0;
  const totalCpc = sumClicks > 0 ? Number((sumSpend / sumClicks).toFixed(2)) : 0;
  const totalCvr = sumClicks > 0 ? Number(((sumOrders / sumClicks) * 100).toFixed(2)) : 0;

  const totalRow = {
    productName: "Total",
    searchTerm: "Total",
    isTotalRow: true,
    totalImpressions: sumImpressions,
    totalClicks: sumClicks,
    totalSales: sumSales,
    totalOrders: sumOrders,
    totalSpend: sumSpend,
    totalAcos,
    totalRoas,
    totalCtr,
    totalCpc,
    totalCvr,
  };

  return res.status(200).send({
    isSuccess: true,
    getSearchTermData: paginated,
    totalSearchTermData: totalCount,
    totalRow,
    data: paginated,
    totalRecords: totalCount,
    searchTermCurrentPageNo: pageNo,
    searchTermCurrentPerPage: perPage,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4: PLACEMENT
// ═══════════════════════════════════════════════════════════════════════════════

exports.getAllPlacements = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.adType || "SP";
  const records = await getMockRecords({ userId, moduleType: "PLACEMENT", subType: "MAIN", adType });

  const normalizePlacementName = (raw) => {
    if (!raw) return "Top of Search";
    if (raw === "Top of Search on-Amazon") return "Top of Search";
    if (raw === "Detail Page on-Amazon") return "Product Pages";
    if (raw === "Other on-Amazon") return "Rest of Search";
    return raw;
  };

  let flatRows = [];
  records.forEach((r, idx) => {
    const inferredAdType = r.adType || (String(r.type || "").includes("Brand") ? "SB" : "SP");
    if (Array.isArray(r.placementsData) && r.placementsData.length > 0) {
      r.placementsData.forEach((p) => {
        const placementName = normalizePlacementName(p.placement);
        const strategy = p.biddingStartegy || p.bidStrategy || r.biddingStrategy || "Dynamic bids - down only";
        const m = computeMetrics(p);
        flatRows.push({
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          campaignStatus: r.campaignStatus || "ENABLED",
          adType: inferredAdType,
          type: r.type || "Sponsored Products",
          placement: placementName,
          biddingStartegy: strategy,
          bidStrategy: strategy,
          biddingStrategy: strategy,
          placementModifier: Number(p.placementModifier ?? 0),
          keywordBid: Number(p.newKeywordBid || r.keywordBid || 1.25),
          ...m,
          placementsData: r.placementsData,
        });
      });

      // Add sample Audience Segment & Business Placement rows for the other tabs in /placement
      if (idx < 3) {
        const audMetrics = computeMetrics({
          impressions: Math.round((r.totalImpressions || 5000) * 0.18),
          clicks: Math.round((r.totalClicks || 150) * 0.18),
          spend: Number(((r.totalSpend || 120) * 0.18).toFixed(2)),
          sales: Number(((r.totalSales || 540) * 0.2).toFixed(2)),
          orders: Math.max(Math.round((r.totalOrders || 10) * 0.2), 1),
        });
        const bizMetrics = computeMetrics({
          impressions: Math.round((r.totalImpressions || 5000) * 0.14),
          clicks: Math.round((r.totalClicks || 150) * 0.15),
          spend: Number(((r.totalSpend || 120) * 0.15).toFixed(2)),
          sales: Number(((r.totalSales || 540) * 0.18).toFixed(2)),
          orders: Math.max(Math.round((r.totalOrders || 10) * 0.18), 1),
        });
        const strategy = r.placementsData[0]?.bidStrategy || "Dynamic bids - down only";
        flatRows.push(
          {
            campaignId: r.campaignId,
            campaignName: r.campaignName,
            campaignStatus: r.campaignStatus || "ENABLED",
            adType: inferredAdType,
            type: r.type || "Sponsored Products",
            placement: "Audience Segment",
            biddingStartegy: strategy,
            bidStrategy: strategy,
            biddingStrategy: strategy,
            placementModifier: 15,
            ...audMetrics,
          },
          {
            campaignId: r.campaignId,
            campaignName: r.campaignName,
            campaignStatus: r.campaignStatus || "ENABLED",
            adType: inferredAdType,
            type: r.type || "Sponsored Products",
            placement: "Business Placement",
            biddingStartegy: strategy,
            bidStrategy: strategy,
            biddingStrategy: strategy,
            placementModifier: 20,
            ...bizMetrics,
          }
        );
      }
    } else {
      const placementName = normalizePlacementName(r.placement);
      const strategy = r.biddingStartegy || r.bidStrategy || r.biddingStrategy || "Dynamic bids - down only";
      const m = computeMetrics(r);
      flatRows.push({
        ...r,
        adType: inferredAdType,
        placement: placementName,
        biddingStartegy: strategy,
        bidStrategy: strategy,
        biddingStrategy: strategy,
        placementModifier: Number(r.placementModifier ?? 0),
        ...m,
      });
    }
  });

  const allowedTabPlacements = req.body?.placementTabFilter?.placement?.$in;
  if (Array.isArray(allowedTabPlacements) && allowedTabPlacements.length > 0) {
    flatRows = flatRows.filter((row) => allowedTabPlacements.includes(row.placement));
  }

  if (Array.isArray(req.body?.campaignId) && req.body.campaignId.length > 0) {
    const cIds = req.body.campaignId.map(Number);
    flatRows = flatRows.filter((row) => cIds.includes(Number(row.campaignId)));
  }

  const { data, allFiltered, currentPageNo, totalRecords, totalPages } = filterSortPaginate(flatRows, {
    searchName: req.body?.searchName,
    searchFields: ["campaignName", "campaignId", "placement", "biddingStartegy", "type"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "sales",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    getPlacement: data,
    totalRow: { ...buildTotalRow(allFiltered, "campaignName"), placement: "" },
    currentPageNo,
    totalRecords,
    totalPages,
    message: "Get placement data successfully.",
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5: KEYWORD ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

exports.getKeywordAnalysisData = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "KEYWORD_ANALYSIS", subType: "MAIN", adType: "ALL" });

  const defaultMockItems = [
    {
      targeting: "wireless earbuds",
      keywordText: "wireless earbuds",
      word: "wireless earbuds",
      EXACT: 2,
      PHRASE: 1,
      BROAD: 0,
      impressions: 38400,
      clicks: 1380,
      spend: 924.60,
      sales: 4499.25,
      orders: 75,
      campaigns: [
        {
          targetId: "T-840001-1",
          campaignId: 800001,
          campaignName: "SP | Wireless Earbuds Pro | Exact Match",
          campaignStatus: "ENABLED",
          keywordType: "EXACT",
          matchType: "EXACT",
          impressions: 22400,
          clicks: 810,
          spend: 542.70,
          sales: 2710.00,
          orders: 45,
          cpc: 0.67,
          ctr: 3.62,
          cvr: 5.56,
          acos: 20.03,
          roas: 4.99,
        },
        {
          targetId: "T-840002-1",
          campaignId: 800002,
          campaignName: "SP | Wireless Earbuds Pro | Auto Discovery",
          campaignStatus: "ENABLED",
          keywordType: "EXACT",
          matchType: "EXACT",
          impressions: 9600,
          clicks: 340,
          spend: 227.80,
          sales: 1089.25,
          orders: 18,
          cpc: 0.67,
          ctr: 3.54,
          cvr: 5.29,
          acos: 20.91,
          roas: 4.78,
        },
        {
          targetId: "T-840007-1",
          campaignId: 800007,
          campaignName: "SP | Wireless Earbuds Pro | Competitor Conquest",
          campaignStatus: "ENABLED",
          keywordType: "PHRASE",
          matchType: "PHRASE",
          impressions: 6400,
          clicks: 230,
          spend: 154.10,
          sales: 700.00,
          orders: 12,
          cpc: 0.67,
          ctr: 3.59,
          cvr: 5.22,
          acos: 22.01,
          roas: 4.54,
        },
      ],
    },
    {
      targeting: "noise cancelling",
      keywordText: "noise cancelling",
      word: "noise cancelling",
      EXACT: 1,
      PHRASE: 1,
      BROAD: 1,
      impressions: 29200,
      clicks: 1040,
      spend: 707.20,
      sales: 3479.42,
      orders: 58,
      campaigns: [
        {
          targetId: "T-840001-2",
          campaignId: 800001,
          campaignName: "SP | Wireless Earbuds Pro | Exact Match",
          campaignStatus: "ENABLED",
          keywordType: "EXACT",
          matchType: "EXACT",
          impressions: 15200,
          clicks: 540,
          spend: 367.20,
          sales: 1850.00,
          orders: 31,
          cpc: 0.68,
          ctr: 3.55,
          cvr: 5.74,
          acos: 19.85,
          roas: 5.04,
        },
        {
          targetId: "T-840002-2",
          campaignId: 800002,
          campaignName: "SP | Wireless Earbuds Pro | Auto Discovery",
          campaignStatus: "ENABLED",
          keywordType: "PHRASE",
          matchType: "PHRASE",
          impressions: 8800,
          clicks: 310,
          spend: 210.80,
          sales: 1029.42,
          orders: 17,
          cpc: 0.68,
          ctr: 3.52,
          cvr: 5.48,
          acos: 20.48,
          roas: 4.88,
        },
        {
          targetId: "T-840007-2",
          campaignId: 800007,
          campaignName: "SP | Wireless Earbuds Pro | Competitor Conquest",
          campaignStatus: "ENABLED",
          keywordType: "BROAD",
          matchType: "BROAD",
          impressions: 5200,
          clicks: 190,
          spend: 129.20,
          sales: 600.00,
          orders: 10,
          cpc: 0.68,
          ctr: 3.65,
          cvr: 5.26,
          acos: 21.53,
          roas: 4.64,
        },
      ],
    },
    {
      targeting: "smart watch",
      keywordText: "smart watch",
      word: "smart watch",
      EXACT: 1,
      PHRASE: 1,
      BROAD: 0,
      impressions: 28400,
      clicks: 940,
      spend: 648.60,
      sales: 3149.65,
      orders: 35,
      campaigns: [
        {
          targetId: "T-840004-1",
          campaignId: 800004,
          campaignName: "SP | Smart Watch V2 | Auto Discovery",
          campaignStatus: "ENABLED",
          keywordType: "EXACT",
          matchType: "EXACT",
          impressions: 17800,
          clicks: 590,
          spend: 407.10,
          sales: 1980.00,
          orders: 22,
          cpc: 0.69,
          ctr: 3.31,
          cvr: 3.73,
          acos: 20.56,
          roas: 4.86,
        },
        {
          targetId: "T-840004-2",
          campaignId: 800004,
          campaignName: "SP | Smart Watch V2 | Auto Discovery",
          campaignStatus: "ENABLED",
          keywordType: "PHRASE",
          matchType: "PHRASE",
          impressions: 10600,
          clicks: 350,
          spend: 241.50,
          sales: 1169.65,
          orders: 13,
          cpc: 0.69,
          ctr: 3.30,
          cvr: 3.71,
          acos: 20.65,
          roas: 4.84,
        },
      ],
    },
    {
      targeting: "65w gan charger",
      keywordText: "65w gan charger",
      word: "65w gan charger",
      EXACT: 1,
      PHRASE: 1,
      BROAD: 0,
      impressions: 22100,
      clicks: 780,
      spend: 468.00,
      sales: 2169.38,
      orders: 62,
      campaigns: [
        {
          targetId: "T-840003-1",
          campaignId: 800003,
          campaignName: "SP | 65W GaN Charger | Phrase & Broad",
          campaignStatus: "ENABLED",
          keywordType: "EXACT",
          matchType: "EXACT",
          impressions: 14200,
          clicks: 500,
          spend: 300.00,
          sales: 1420.00,
          orders: 41,
          cpc: 0.60,
          ctr: 3.52,
          cvr: 8.20,
          acos: 21.13,
          roas: 4.73,
        },
        {
          targetId: "T-840003-2",
          campaignId: 800003,
          campaignName: "SP | 65W GaN Charger | Phrase & Broad",
          campaignStatus: "ENABLED",
          keywordType: "PHRASE",
          matchType: "PHRASE",
          impressions: 7900,
          clicks: 280,
          spend: 168.00,
          sales: 749.38,
          orders: 21,
          cpc: 0.60,
          ctr: 3.54,
          cvr: 7.50,
          acos: 22.42,
          roas: 4.46,
        },
      ],
    },
    {
      targeting: "portable power bank",
      keywordText: "portable power bank",
      word: "portable power bank",
      EXACT: 1,
      PHRASE: 1,
      BROAD: 0,
      impressions: 16800,
      clicks: 520,
      spend: 395.20,
      sales: 1574.65,
      orders: 35,
      campaigns: [
        {
          targetId: "T-840005-1",
          campaignId: 800005,
          campaignName: "SP | PowerBank 20K | Product Targeting",
          campaignStatus: "ENABLED",
          keywordType: "EXACT",
          matchType: "EXACT",
          impressions: 10200,
          clicks: 320,
          spend: 243.20,
          sales: 980.00,
          orders: 22,
          cpc: 0.76,
          ctr: 3.14,
          cvr: 6.88,
          acos: 24.82,
          roas: 4.03,
        },
        {
          targetId: "T-840005-2",
          campaignId: 800003,
          campaignName: "SP | 65W GaN Charger | Phrase & Broad",
          campaignStatus: "ENABLED",
          keywordType: "PHRASE",
          matchType: "PHRASE",
          impressions: 6600,
          clicks: 200,
          spend: 152.00,
          sales: 594.65,
          orders: 13,
          cpc: 0.76,
          ctr: 3.03,
          cvr: 6.50,
          acos: 25.56,
          roas: 3.91,
        },
      ],
    },
  ];

  // Map and merge with existing records if available
  let enrichedList = [];
  if (Array.isArray(records) && records.length > 0) {
    enrichedList = records.map((r, idx) => {
      const term = r.targeting || r.keywordText || r.word || defaultMockItems[idx % defaultMockItems.length].targeting;
      const defaultItem = defaultMockItems.find(d => d.targeting === term) || defaultMockItems[idx % defaultMockItems.length];
      const campaigns = Array.isArray(r.campaigns) && r.campaigns.length > 0 ? r.campaigns : defaultItem.campaigns;
      const exactCount = campaigns.filter(c => (c.keywordType || c.matchType) === "EXACT").length;
      const phraseCount = campaigns.filter(c => (c.keywordType || c.matchType) === "PHRASE").length;
      const broadCount = campaigns.filter(c => (c.keywordType || c.matchType) === "BROAD").length;
      const m = computeMetrics(r);

      return {
        ...r,
        targeting: term,
        keywordText: term,
        word: term,
        EXACT: exactCount || defaultItem.EXACT || 1,
        PHRASE: phraseCount || defaultItem.PHRASE || 0,
        BROAD: broadCount || defaultItem.BROAD || 0,
        campaigns,
        impressions: Number(r.impressions || defaultItem.impressions || 0),
        clicks: Number(r.clicks || defaultItem.clicks || 0),
        spend: Number((r.spend || defaultItem.spend || 0).toFixed(2)),
        sales: Number((r.sales || defaultItem.sales || 0).toFixed(2)),
        orders: Number(r.orders || defaultItem.orders || 0),
        cpc: Number(m.cpc || defaultItem.campaigns[0]?.cpc || 0),
        ctr: Number(m.ctr || defaultItem.campaigns[0]?.ctr || 0),
        cvr: Number(m.cvr || defaultItem.campaigns[0]?.cvr || 0),
        acos: Number(m.acos || defaultItem.campaigns[0]?.acos || 0),
        roas: Number(m.roas || defaultItem.campaigns[0]?.roas || 0),
      };
    });
  } else {
    enrichedList = defaultMockItems.map(d => ({
      ...d,
      ...computeMetrics(d),
    }));
  }

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(enrichedList, {
    searchName: req.body?.searchName,
    searchFields: ["targeting", "keywordText", "word"],
    fieldName: req.body?.fieldName || "spend",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.searchTermPageNo || req.body?.pageNo,
    perPage: req.body?.searchTermPerPage || req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    getKeywordAnalysisData: data,
    totalKeywordAnalysisData: totalRecords,
    searchTermCurrentPageNo: currentPageNo,
    searchTermTotalPages: totalPages,
    message: "Get keyword analysis data successfully.",
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 6: KEYWORD TRACKER (LIFETIME TARGETING MATRIX)
// ═══════════════════════════════════════════════════════════════════════════════

exports.getLifeTimeTargetingMatrix = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.adType || "SP";
  let records = await getMockRecords({ userId, moduleType: "KEYWORD_TRACKER", subType: "MAIN", adType });

  if (req.body?.customStatus) {
    records = records.filter((r) => r.customStatus === req.body.customStatus);
  }

  const { data, allFiltered, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchName,
    searchFields: ["targeting", "matchType", "customStatus"],
    fieldName: req.body?.fieldName || "spend",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    getTargeting: data,
    totalRow: buildTotalRow(allFiltered, "targeting"),
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

exports.getTargetingKeywordDetails = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const campaigns = await getMockRecords({ userId, moduleType: "CAMPAIGN", subType: "MAIN", adType: "ALL" });
  const products = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" });

  const requestedIds = Array.isArray(req.body?.campaignIds) && req.body.campaignIds.length > 0
    ? req.body.campaignIds.map(Number)
    : [800001];

  const data = requestedIds.map((cid, idx) => {
    const camp = campaigns.find((c) => Number(c.campaignId) === cid) || campaigns[0];
    const prod = products[idx % products.length] || products[0];
    return {
      campaignId: cid,
      campaignName: camp?.name || `SP | Campaign ${cid}`,
      productCount: 1,
      products: [
        {
          adId: 820001 + idx,
          sku: prod.sku,
          asin: prod.asin,
          name: prod.title,
          image: prod.imageUrl,
        },
      ],
    };
  });

  return res.status(200).send({
    isSuccess: true,
    data,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 7: PURCHASE (ORDERS & ORDER REPORT)
// ═══════════════════════════════════════════════════════════════════════════════

exports.getAllOrders = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "PURCHASE_ORDER", subType: "MAIN", adType: "ALL" });

  // 1. Status Filter (case-insensitive & maps STATUS_STYLES keys)
  if (req.body?.orderStatus) {
    const rawStatuses = Array.isArray(req.body.orderStatus) ? req.body.orderStatus : [req.body.orderStatus];
    const statusSet = new Set(rawStatuses.filter(Boolean).map((s) => String(s).toUpperCase().trim()));
    if (statusSet.size > 0 && !statusSet.has("ALL")) {
      records = records.filter((r) => {
        const curStatus = String(r.orderStatus || r.status || "").toUpperCase().trim();
        if (statusSet.has(curStatus)) return true;
        if (curStatus === "SHIPPED" && (statusSet.has("PAYMENT COMPLETE") || statusSet.has("SHIPPED"))) return true;
        if ((curStatus === "SHIPPED" || curStatus === "DELIVERED") && statusSet.has("SHIPPED")) return true;
        return false;
      });
    }
  }

  // 2. Fulfillment Channel Filter
  if (req.body?.fulfilledBy && Array.isArray(req.body.fulfilledBy) && req.body.fulfilledBy.length > 0) {
    const fBySet = new Set(req.body.fulfilledBy.map((f) => String(f).toUpperCase().trim()));
    if (!fBySet.has("ALL")) {
      records = records.filter((r) => {
        const val = String(r.fulfillment?.fulfilledBy || (r.fulfillmentChannel === "AFN" ? "AMAZON" : "MERCHANT")).toUpperCase().trim();
        return fBySet.has(val);
      });
    }
  }

  // 3. Date Range Filter
  if (req.body?.fromDate && req.body?.toDate) {
    const start = moment(req.body.fromDate).startOf("day");
    const end = moment(req.body.toDate).endOf("day");
    records = records.filter((r) => {
      const d = moment(r.orderCreatedTime || r.purchaseDate || r.createdAt);
      return d.isValid() ? d.isBetween(start, end, null, "[]") : true;
    });
  }

  // 4. Search Filter (checks ID, buyer, items, ASIN, SKU, title)
  const query = String(req.body?.search || req.body?.searchText || req.body?.searchName || "").trim().toLowerCase();
  if (query) {
    records = records.filter((r) => {
      const orderId = String(r.orderId || r.amazonOrderId || "").toLowerCase();
      const buyerName = String(r.buyer?.buyerName || "").toLowerCase();
      const statusStr = String(r.orderStatus || "").toLowerCase();
      if (orderId.includes(query) || buyerName.includes(query) || statusStr.includes(query)) return true;
      if (Array.isArray(r.orderItems)) {
        return r.orderItems.some((it) => {
          const title = String(it.productData?.itemName || it.product?.title || it.title || "").toLowerCase();
          const asin = String(it.productData?.asin || it.product?.asin || it.asin || "").toLowerCase();
          const sku = String(it.productData?.sku || it.product?.sellerSku || it.sellerSKU || it.sku || "").toLowerCase();
          return title.includes(query) || asin.includes(query) || sku.includes(query);
        });
      }
      return false;
    });
  }

  // 5. Sort & Paginate
  const rawFieldName = req.body?.fieldName || "orderCreatedTime";
  const sortCol = rawFieldName === "orderCreatedTime" || rawFieldName === "purchaseDate" ? "orderCreatedTime" : rawFieldName;
  const sortType = req.body?.sortType || "DESC";

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: "", // already filtered deeply
    fieldName: sortCol,
    sortType,
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  // 6. Ensure consistent response format for OrdersGrid and OrderDetailModal
  const formattedData = data.map((r) => {
    const orderId = r.orderId || r.amazonOrderId;
    const orderCreatedTime = r.orderCreatedTime || r.purchaseDate;
    const orderLastUpdatedTime = r.orderLastUpdatedTime || r.lastUpdateDate || orderCreatedTime;
    const totalAmount = Number(r.totalAmount ?? r.orderTotal?.amount ?? 0);
    const totalQuantity = Number(r.totalQuantity ?? r.numberOfItemsShipped ?? 1);
    const currencyCode = r.currencyCode || r.orderTotal?.currencyCode || "USD";
    const orderStatus = String(r.orderStatus || "SHIPPED").toUpperCase();

    const orderItems = (Array.isArray(r.orderItems) ? r.orderItems : []).map((it, idx) => ({
      orderItemId: it.orderItemId || `OI-${String(orderId).replace(/\D/g, "").slice(-5) || "95000"}-${idx + 1}`,
      quantityOrdered: Number(it.quantityOrdered ?? 1),
      quantityShipped: Number(it.quantityShipped ?? it.quantityOrdered ?? 1),
      productData: {
        itemName: it.productData?.itemName || it.title || it.itemName || "ApexGear Product",
        asin: it.productData?.asin || it.asin || "B0MOCK0001",
        sku: it.productData?.sku || it.sku || it.sellerSKU || "APEX-MOCK-SKU",
        imageURL: it.productData?.imageURL || it.imageURL || it.imageUrl || "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
        sellingPrice: Number(it.productData?.sellingPrice ?? it.price ?? it.itemPrice?.amount ?? it.sellingPrice ?? 59.99),
      },
      product: {
        title: it.product?.title || it.title || it.itemName || "ApexGear Product",
        asin: it.product?.asin || it.asin || "B0MOCK0001",
        sellerSku: it.product?.sellerSku || it.sellerSKU || it.sku || "APEX-MOCK-SKU",
        price: Number(it.product?.price ?? it.price ?? it.itemPrice?.amount ?? it.sellingPrice ?? 59.99),
      },
      proceeds: it.proceeds || null,
    }));

    return {
      ...r,
      orderId,
      amazonOrderId: orderId,
      orderCreatedTime,
      purchaseDate: orderCreatedTime,
      orderLastUpdatedTime,
      lastUpdateDate: orderLastUpdatedTime,
      orderStatus,
      totalAmount,
      totalQuantity,
      currencyCode,
      paymentMethod: r.paymentMethod || "Prepaid",
      salesChannel: r.salesChannel || { marketplaceName: "Amazon.com" },
      fulfillment: r.fulfillment || {
        fulfilledBy: r.fulfillmentChannel === "MFN" ? "MERCHANT" : "AMAZON",
        fulfillmentServiceLevel: "Standard",
      },
      buyer: r.buyer || { buyerName: "Amazon Customer", buyerEmail: "customer@example.com" },
      recipient: r.recipient || {
        deliveryAddress: {
          name: r.buyer?.buyerName || "Amazon Customer",
          addressLine1: "123 Main Street",
          city: "New York",
          stateOrRegion: "New York",
          postalCode: "10001",
          countryCode: "US",
        },
      },
      orderItems,
      proceeds: r.proceeds || {
        proceedsTotal: totalAmount,
        breakdowns: [
          { subTotalType: "PRINCIPAL", subTotalAmount: totalAmount },
          { subTotalType: "TAX", subTotalAmount: Number((totalAmount * 0.08).toFixed(2)) },
          { subTotalType: "FEE", subTotalAmount: -Number((totalAmount * 0.15).toFixed(2)) },
        ],
      },
      isRefunded: Boolean(r.isRefunded),
    };
  });

  return res.status(200).send({
    isSuccess: true,
    data: formattedData,
    orderStatusList: [
      "PENDING_AVAILABILITY",
      "PENDING",
      "UNSHIPPED",
      "PARTIALLY_SHIPPED",
      "SHIPPED",
      "CANCELLED",
      "UNFULFILLABLE",
    ],
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

exports.getOrderReport = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "PURCHASE_ORDER", subType: "ORDER_REPORT", adType: "ALL" });

  const { data, allFiltered, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchText || req.body?.searchName,
    searchFields: ["asin", "sku", "title", "itemName"],
    fieldName: req.body?.fieldName || "totalSalesValue",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  const formattedData = data.map((r) => {
    const qty = Number(r.totalQty ?? r.totalUnits ?? r.quantityOrdered ?? 1);
    const basePrice = Number(r.basePrice ?? r.productCost ?? 0);
    const sellingPrice = Number(r.sellingPrice ?? r.price ?? 0);
    const cost = Number(r.productCost ?? r.totalCost ?? (basePrice * qty));
    const sales = Number(r.totalSalesValue ?? r.totalSales ?? (sellingPrice * qty));
    const ordersCount = Number(r.ordersCount ?? r.totalOrders ?? 1);
    const adSpent = Number(r.adSpent ?? r.adSpend ?? 0);
    const adOrders = Number(r.adOrders ?? 0);

    return {
      ...r,
      imageURL: r.imageURL || r.imageUrl,
      basePrice,
      sellingPrice,
      productCost: cost,
      totalSalesValue: sales,
      ordersCount,
      totalQty: qty,
      adSpent,
      adOrders,
      ordersList: Array.isArray(r.ordersList) && r.ordersList.length > 0 ? r.ordersList : [
        {
          orderId: `114-${String(r.asin).replace(/\D/g, "") || "4829101"}-7738201`,
          orderCreatedTime: new Date().toISOString(),
          orderStatus: "SHIPPED",
          buyerName: "Amazon Customer",
          quantityOrdered: qty,
          price: sellingPrice,
          totalAmount: sales,
          currencyCode: "USD",
        }
      ],
    };
  });

  const totals = allFiltered.reduce(
    (acc, r) => {
      const qty = Number(r.totalQty ?? r.totalUnits ?? r.quantityOrdered ?? 1);
      const basePrice = Number(r.basePrice ?? r.productCost ?? 0);
      const sellingPrice = Number(r.sellingPrice ?? r.price ?? 0);
      acc.totalOrders += Number(r.ordersCount ?? r.totalOrders ?? 1);
      acc.globalCost += Number(r.productCost ?? r.totalCost ?? (basePrice * qty));
      acc.globalSales += Number(r.totalSalesValue ?? r.totalSales ?? (sellingPrice * qty));
      acc.globalAdSpent += Number(r.adSpent ?? r.adSpend ?? 0);
      acc.globalAdOrders += Number(r.adOrders ?? 0);
      return acc;
    },
    { totalOrders: 0, globalCost: 0, globalSales: 0, globalAdSpent: 0, globalAdOrders: 0 }
  );

  return res.status(200).send({
    isSuccess: true,
    data: formattedData,
    orderStatusList: ["Shipped", "Delivered", "Pending", "Unshipped"],
    currentPageNo,
    totalRecords,
    totalOrders: totals.totalOrders,
    globalCost: Number(totals.globalCost.toFixed(2)),
    globalSales: Number(totals.globalSales.toFixed(2)),
    globalAdSpent: Number(totals.globalAdSpent.toFixed(2)),
    globalAdOrders: totals.globalAdOrders,
    totalPages,
  });
};

exports.getStateWiseOrderCount = async (req, res) => {
  const data = [
    { state: "California", district: "Los Angeles County", city: "Los Angeles", order: 42 },
    { state: "Texas", district: "Travis County", city: "Austin", order: 31 },
    { state: "New York", district: "New York County", city: "New York", order: 28 },
    { state: "Florida", district: "Miami-Dade", city: "Miami", order: 22 },
    { state: "Washington", district: "King County", city: "Seattle", order: 18 },
    { state: "Illinois", district: "Cook County", city: "Chicago", order: 14 },
  ];
  return res.status(200).send({
    isSuccess: true,
    data,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 8: PRODUCT LIST & PRODUCT ADS
// ═══════════════════════════════════════════════════════════════════════════════

exports.getSPProduct = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" });

  if (req.body?.onlyFavorites) {
    records = records.filter((r) => Boolean(r.isFavorite));
  }

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchText || req.body?.searchName,
    searchFields: ["itemName", "title", "asin", "sku"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "price",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    products: data,
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

exports.listProductAds = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.adType || "SP";
  const records = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "PRODUCT_AD", adType });

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchName,
    searchFields: ["sku", "asins", "asin", "productName"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "spend",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    getProductAds: data,
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 9: COUPONS
// ═══════════════════════════════════════════════════════════════════════════════

exports.listCouponsGrid = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const rawRecords = await getMockRecords({ userId, moduleType: "COUPON", subType: "MAIN", adType: "ALL" });

  const records = rawRecords.map((r) => ({
    ...r,
    startDateTime: r.startDateTime || r.startDate || new Date().toISOString(),
    endDateTime: r.endDateTime || r.endDate || moment().add(30, "days").toISOString(),
    startDate: r.startDate || r.startDateTime || new Date().toISOString(),
    endDate: r.endDate || r.endDateTime || moment().add(30, "days").toISOString(),
  }));

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchText || req.body?.searchName,
    searchFields: ["name", "message", "couponId", "status"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "sales",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    data,
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 10: DEALS
// ═══════════════════════════════════════════════════════════════════════════════

exports.getDealsDashboardStats = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "DEAL", subType: "MAIN", adType: "ALL" });

  const stats = records.reduce(
    (acc, d) => {
      acc.totalSales += Number(d.sales || 0);
      acc.totalUnits += Number(d.unitsSold || 0);
      acc.totalViews += Number(d.glanceViews || 0);
      return acc;
    },
    { totalSales: 0, totalUnits: 0, totalViews: 0 }
  );

  const conversionRate = stats.totalViews > 0 ? Number(((stats.totalUnits / stats.totalViews) * 100).toFixed(2)) : 0;

  return res.status(200).send({
    isSuccess: true,
    data: {
      totalSales: Number(stats.totalSales.toFixed(2)),
      totalUnits: stats.totalUnits,
      totalViews: stats.totalViews,
      conversionRate,
    },
  });
};

exports.getDealsList = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "DEAL", subType: "MAIN", adType: "ALL" });

  const { data, totalRecords } = filterSortPaginate(records, {
    searchName: req.body?.searchText || req.body?.searchName,
    searchFields: ["campaignName", "dealDescription", "dealId", "dealType", "status"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "sales",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo || 1,
    perPage: req.body?.perPage || 50,
  });

  return res.status(200).send({
    isSuccess: true,
    totalRecords,
    data,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 11: INVENTORY
// ═══════════════════════════════════════════════════════════════════════════════

function computeInventorySummaries(records, fulfillmentType) {
  const fbaItems = records.filter((r) => r.fulfillmentType === "FBA");
  const fbmItems = records.filter((r) => r.fulfillmentType === "FBM");
  const filtered = fulfillmentType ? records.filter((r) => r.fulfillmentType === fulfillmentType) : records;

  const summaryData = {
    totalSKUs: records.length,
    fbaStock: fbaItems.reduce((s, r) => s + Number(r.currentStock || 0), 0),
    fbmStock: fbmItems.reduce((s, r) => s + Number(r.currentStock || 0), 0),
    totalFBASkus: fbaItems.length,
    totalFBMSkus: fbmItems.length,
    alertCount: filtered.filter((r) => ["OUT_OF_STOCK", "LOW", "MEDIUM"].includes(r.status)).length,
    outOfStockCount: filtered.filter((r) => r.status === "OUT_OF_STOCK").length,
    lowStockCount: filtered.filter((r) => r.status === "LOW").length,
    mediumStockCount: filtered.filter((r) => r.status === "MEDIUM").length,
    healthyCount: filtered.filter((r) => r.status === "HEALTHY").length,
    deadInventoryCount: filtered.filter((r) => r.deadInventoryStatus === "DEAD").length,
  };

  const chartData = ["FBA", "FBM"].map((type) => {
    const group = records.filter((r) => r.fulfillmentType === type);
    const totalDays = group.reduce((s, r) => s + Number(r.daysLeft || 0), 0);
    return {
      fulfillmentType: type,
      currentStock: group.reduce((s, r) => s + Number(r.currentStock || 0), 0),
      inboundStock: group.reduce((s, r) => s + Number(r.inboundStock || 0), 0),
      reservedStock: group.reduce((s, r) => s + Number(r.reservedStock || 0), 0),
      totalStock: group.reduce((s, r) => s + Number(r.totalStock || 0), 0),
      avgDaysLeft: group.length > 0 ? Number((totalDays / group.length).toFixed(1)) : 0,
      skuCount: group.length,
    };
  });

  const agingData = {
    bucket30: filtered.filter((r) => Number(r.daysLeft) <= 30).length,
    bucket60: filtered.filter((r) => Number(r.daysLeft) > 30 && Number(r.daysLeft) <= 60).length,
    bucket90: filtered.filter((r) => Number(r.daysLeft) > 60 && Number(r.daysLeft) <= 90).length,
    bucket180: filtered.filter((r) => Number(r.daysLeft) > 90).length,
    deadCount: filtered.filter((r) => r.deadInventoryStatus === "DEAD").length,
  };

  return { summaryData, chartData, agingData };
}

exports.getInventoryCards = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "INVENTORY", subType: "MAIN", adType: "ALL" });
  const { summaryData } = computeInventorySummaries(records, req.body?.fulfillmentType);
  return res.status(200).send({
    isSuccess: true,
    summaryData,
  });
};

exports.getInventoryGraph = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "INVENTORY", subType: "MAIN", adType: "ALL" });
  const { chartData } = computeInventorySummaries(records, req.body?.fulfillmentType);
  return res.status(200).send({
    isSuccess: true,
    chartData,
  });
};

exports.getInventoryList = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "INVENTORY", subType: "MAIN", adType: "ALL" });

  if (req.body?.fulfillmentType) {
    records = records.filter((r) => r.fulfillmentType === req.body.fulfillmentType);
  }

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchName,
    searchFields: ["sku", "asin", "title", "status"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "title",
    sortType: req.body?.sortType || "ASC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    data,
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

exports.listInventory = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "INVENTORY", subType: "MAIN", adType: "ALL" });
  const { summaryData, chartData } = computeInventorySummaries(records, req.body?.fulfillmentType);

  if (req.body?.fulfillmentType) {
    records = records.filter((r) => r.fulfillmentType === req.body.fulfillmentType);
  }

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchName,
    searchFields: ["sku", "asin", "title", "status"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "title",
    sortType: req.body?.sortType || "ASC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    data,
    currentPageNo,
    totalRecords,
    totalPages,
    summaryData,
    chartData,
  });
};

exports.getAgingCards = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "INVENTORY", subType: "MAIN", adType: "ALL" });
  const { agingData } = computeInventorySummaries(records, req.body?.fulfillmentType);
  return res.status(200).send({
    isSuccess: true,
    agingData,
  });
};

exports.getAgingInventoryList = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "INVENTORY", subType: "MAIN", adType: "ALL" });

  if (req.body?.agingBucket) {
    records = records.filter((r) => r.agingBucket === req.body.agingBucket);
  }
  if (req.body?.deadOnly) {
    records = records.filter((r) => r.deadInventoryStatus === "DEAD");
  }

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchName,
    searchFields: ["sku", "asin", "title", "suggestion"],
    status: req.body?.status,
    fieldName: req.body?.fieldName || "daysLeft",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    data,
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

exports.getAgingConfig = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "INVENTORY", subType: "MAIN", adType: "ALL" });
  const data = records.map((r) => ({
    sku: r.sku,
    asin: r.asin,
    minOrders: r.minOrders || 10,
    lookbackDays: r.lookbackDays || 30,
    isEnabled: r.isEnabled ?? true,
  }));
  return res.status(200).send({
    isSuccess: true,
    data,
  });
};

exports.ensureMockDataSeeded = ensureMockDataSeeded;
// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 12: SEARCH TERM PRODUCT VIEW & RULE HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

exports.getSearchTermsProductView = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const adType = req.adType || req.body?.adType || "SP";
  const [stRecords, prodRecords] = await Promise.all([
    getMockRecords({ userId, moduleType: "SEARCH_TERM", subType: "MAIN", adType }),
    getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" }),
  ]);

  const prodMap = new Map(prodRecords.map((p) => [p.asin, p]));
  const grouped = new Map();

  stRecords.forEach((st) => {
    const asin = st.asin || "B0MOCK0001";
    const prod = prodMap.get(asin) || prodRecords[0] || {};
    if (!grouped.has(asin)) {
      grouped.set(asin, {
        asin,
        sku: st.sku || prod.sku || "APEX-EARBUD-PRO-BLK",
        productName: prod.title || "ApexGear Pro Active Noise Cancelling Wireless Earbuds",
        imageUrl: prod.imageUrl || "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
        price: prod.price || 59.99,
        searchTermsCount: 0,
        impressions: 0,
        clicks: 0,
        spend: 0,
        sales: 0,
        orders: 0,
        units: 0,
        searchTerms: [],
      });
    }
    const g = grouped.get(asin);
    g.searchTermsCount += 1;
    g.impressions += Number(st.impressions || 0);
    g.clicks += Number(st.clicks || 0);
    g.spend = Number((g.spend + Number(st.spend || 0)).toFixed(2));
    g.sales = Number((g.sales + Number(st.sales || 0)).toFixed(2));
    g.orders += Number(st.orders || 0);
    g.units += Number(st.units || 0);
    g.searchTerms.push(st);
  });

  const rows = Array.from(grouped.values()).map((g) => ({
    ...g,
    ...computeMetrics(g),
  }));

  const { data, allFiltered, currentPageNo, perPage, totalRecords } = filterSortPaginate(rows, {
    searchName: req.body?.searchName,
    searchFields: ["asin", "sku", "productName"],
    fieldName: req.body?.fieldName || "spend",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo,
    perPage: req.body?.perPage,
  });

  return res.status(200).send({
    isSuccess: true,
    totalProducts: totalRecords,
    totalSearchTerm: totalRecords,
    products: data,
    getSearchTerm: data,
    totalRow: buildTotalRow(allFiltered, "product"),
    pageNo: currentPageNo,
    perPage,
  });
};

exports.getSearchTermRuleHistory = async (req, res) => {
  const now = Date.now();
  const history = [
    {
      _id: "STRH-1001",
      ruleName: "Auto-Harvest High Converting Search Terms (Orders >= 3, ACOS < 22%)",
      executedAt: new Date(now - 3 * 3600 * 1000).toISOString(),
      status: "COMPLETED",
      keywordsCreated: 4,
      negativesCreated: 0,
      details: [
        { searchTerm: "best anc earbuds for running sweatproof", action: "ADDED_AS_EXACT_KEYWORD", campaignName: "SP | ApexGear ANC Earbuds | Exact Core", bid: 1.35 },
        { searchTerm: "macbook air m3 fast charger 65w usb c", action: "ADDED_AS_PHRASE_KEYWORD", campaignName: "SP | ApexGear 65W GaN Charger | Phrase & Broad", bid: 1.18 },
      ],
    },
    {
      _id: "STRH-1002",
      ruleName: "Wasted Spend Negative Guardrail (Spend > $25, Orders = 0)",
      executedAt: new Date(now - 18 * 3600 * 1000).toISOString(),
      status: "COMPLETED",
      keywordsCreated: 0,
      negativesCreated: 3,
      details: [
        { searchTerm: "cheap wired headphones 3.5mm jack", action: "ADDED_AS_NEGATIVE_EXACT", campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery" },
        { searchTerm: "kids volume limited headphones", action: "ADDED_AS_NEGATIVE_EXACT", campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery" },
        { searchTerm: "apple airpods pro 2nd generation", action: "ADDED_AS_NEGATIVE_EXACT", campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery" },
      ],
    },
  ];
  return res.status(200).send({
    isSuccess: true,
    data: history,
    totalRecords: history.length,
    currentPageNo: 1,
    totalPages: 1,
  });
};

exports.getSearchTermRules = async (req, res) => {
  const rules = [
    {
      _id: "STR-2001",
      ruleName: "Auto-Harvest Winners to Exact",
      isActive: true,
      lookbackDays: 14,
      minOrders: 3,
      maxAcos: 22,
      actionType: "ADD_POSITIVE_KEYWORD",
      matchType: "EXACT",
    },
    {
      _id: "STR-2002",
      ruleName: "Negate Wasted Spend Queries",
      isActive: true,
      lookbackDays: 14,
      minSpend: 25,
      maxOrders: 0,
      actionType: "ADD_NEGATIVE_KEYWORD",
      matchType: "NEGATIVE_EXACT",
    },
  ];
  return res.status(200).send({
    isSuccess: true,
    data: rules,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 13: CHANGE HISTORY (`getHistory`, `getLatestCampaignHistory`)
// ═══════════════════════════════════════════════════════════════════════════════

exports.getHistory = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const requestedAdType = req.adType || req.body?.adType || "ALL";
  let records = await getMockRecords({
    userId,
    moduleType: "HISTORY",
    subType: "MAIN",
    adType: requestedAdType === "All" || requestedAdType === "ALL" ? "ALL" : requestedAdType,
  });

  if (requestedAdType && requestedAdType !== "All" && requestedAdType !== "ALL") {
    records = records.filter((r) => String(r.adType || "SP").toUpperCase() === String(requestedAdType).toUpperCase());
  }

  const rawCampaignId = req.body?.campaignId;
  if (Array.isArray(rawCampaignId) && rawCampaignId.length > 0) {
    const cIds = rawCampaignId.map(Number).filter(Boolean);
    if (cIds.length > 0) records = records.filter((r) => cIds.includes(Number(r.campaignId)));
  } else if (rawCampaignId && !Array.isArray(rawCampaignId)) {
    records = records.filter((r) => Number(r.campaignId) === Number(rawCampaignId));
  }

  const rawAdGroupId = req.body?.adGroupId;
  if (Array.isArray(rawAdGroupId) && rawAdGroupId.length > 0) {
    const agIds = rawAdGroupId.map(Number).filter(Boolean);
    if (agIds.length > 0) records = records.filter((r) => agIds.includes(Number(r.adGroupId)));
  } else if (rawAdGroupId && !Array.isArray(rawAdGroupId)) {
    records = records.filter((r) => Number(r.adGroupId) === Number(rawAdGroupId));
  }

  // Handle type filter (can be array or string)
  if (Array.isArray(req.body?.type) && req.body.type.length > 0) {
    const typesLower = req.body.type.map((t) => String(t).toLowerCase());
    records = records.filter((r) => typesLower.includes(String(r.type || "").toLowerCase()));
  } else if (typeof req.body?.type === "string" && req.body.type && req.body.type !== "All" && req.body.type !== "ALL") {
    records = records.filter((r) => String(r.type || "").toLowerCase() === String(req.body.type).toLowerCase());
  }

  // Handle source / triggerSource filter (can be array or string)
  const sourceFilter = req.body?.source || req.body?.triggerSource;
  if (Array.isArray(sourceFilter) && sourceFilter.length > 0) {
    const sourcesLower = sourceFilter.map((s) => String(s).toLowerCase());
    records = records.filter((r) => sourcesLower.includes(String(r.triggerSource || r.source || "").toLowerCase()));
  } else if (typeof sourceFilter === "string" && sourceFilter && sourceFilter !== "All" && sourceFilter !== "ALL") {
    records = records.filter((r) => String(r.triggerSource || r.source || "").toLowerCase() === String(sourceFilter).toLowerCase());
  }

  // Handle text searches
  if (req.body?.searchName && String(req.body.searchName).trim()) {
    const q = String(req.body.searchName).trim().toLowerCase();
    records = records.filter((r) =>
      String(r.campaignName || "").toLowerCase().includes(q) ||
      String(r.adGroupName || "").toLowerCase().includes(q) ||
      String(r.name || "").toLowerCase().includes(q)
    );
  }
  if (req.body?.targeting && String(req.body.targeting).trim()) {
    const q = String(req.body.targeting).trim().toLowerCase();
    records = records.filter((r) => String(r.targeting || r.name || "").toLowerCase().includes(q));
  }

  const { data, currentPageNo, totalRecords, totalPages } = filterSortPaginate(records, {
    fieldName: req.body?.fieldName || "createdAt",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo || 1,
    perPage: req.body?.perPage || 50,
  });

  return res.status(200).send({
    isSuccess: true,
    data,
    dailyStats: null,
    timezone: "Asia/Kolkata",
    currentPageNo,
    totalRecords,
    totalPages,
  });
};

exports.getLatestCampaignHistory = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "HISTORY", subType: "MAIN", adType: "ALL" });

  const rawCampaignId = req.body?.campaignId;
  if (rawCampaignId) {
    records = records.filter((r) => Number(r.campaignId) === Number(rawCampaignId));
  }

  return res.status(200).send({
    isSuccess: true,
    data: records.slice(0, 10),
    totalRecords: records.length,
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 14: BRAND DETAILS, BRAND ANALYTICS & PRODUCT SEARCH (CAMPAIGN WIZARD)
// ═══════════════════════════════════════════════════════════════════════════════

exports.getBrandDetails = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "BRAND_DETAILS", subType: "MAIN", adType: "ALL" });
  const brandDoc = records[0] || {
    adId: 830001,
    campaignId: 800005,
    adGroupId: 810005,
    name: "ApexGear Official Store Collection",
    state: "ENABLED",
    brandEntityId: "ENTITY-APEXGEAR-MOCK01",
    brandRegistryName: "ApexGear Official",
    creative: {
      brandName: "ApexGear Official",
      brandLogoAssetID: "amzn1.assetlibrary.asset1.mockapexgearlogo01:version_v1",
      brandLogoUrl: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
      headline: "Experience Pure Sound & Next-Gen GaN Power with ApexGear",
      asins: ["B0MOCK0001", "B0MOCK0002", "B0MOCK0003"],
      shouldOptimizeAsins: true,
    },
    landingPage: {
      pageType: "STORE",
      url: "https://www.amazon.com/stores/page/APEXGEAR-DEMO-STORE",
    },
  };

  return res.status(200).send({
    isSuccess: true,
    message: "Brand details fetched successfully.",
    data: brandDoc,
  });
};

exports.previewSDCreative = async (req, res) => {
  const headline = req.body?.creative?.headline || "ApexGear Official — Premium Tech & Audio Gear";
  const html = `
    <div style="font-family: Arial, sans-serif; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fff; max-width: 340px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        <img src="https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg" style="width:42px;height:42px;object-fit:cover;border-radius:6px;" />
        <div>
          <div style="font-size:11px;color:#64748b;font-weight:600;">Sponsored • ApexGear Official</div>
          <div style="font-size:13px;color:#0f172a;font-weight:700;">${headline}</div>
        </div>
      </div>
      <img src="https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg" style="width:100%;height:160px;object-fit:contain;background:#f8fafc;border-radius:8px;" />
      <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:16px;font-weight:700;color:#0f172a;">$59.99 <span style="font-size:11px;color:#0284c7;">✓ Prime</span></span>
        <span style="background:#f59e0b;color:#111827;font-size:12px;font-weight:700;padding:6px 12px;border-radius:16px;">Shop Now</span>
      </div>
    </div>
  `;
  return res.status(200).send({
    isSuccess: true,
    message: "Creative preview fetched successfully.",
    previewHtml: html,
    previewHtmlList: [html],
    raw: { previewHtml: html },
  });
};

exports.getBrandAnalyticsFilters = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const prodRecords = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" });
  const asins = prodRecords.map((p) => p.asin).filter(Boolean);

  return res.status(200).send({
    isSuccess: true,
    data: {
      years: [2026, 2025],
      periodTypes: ["WEEK", "MONTH", "QUARTER"],
      weeksByYear: {
        2026: [
          { value: "2026-W44", label: "Week 44 (Oct 25 - Oct 31, 2026)", startDate: "2026-10-25", endDate: "2026-10-31" },
          { value: "2026-W43", label: "Week 43 (Oct 18 - Oct 24, 2026)", startDate: "2026-10-18", endDate: "2026-10-24" },
          { value: "2026-W42", label: "Week 42 (Oct 11 - Oct 17, 2026)", startDate: "2026-10-11", endDate: "2026-10-17" },
        ],
        2025: [
          { value: "2025-W52", label: "Week 52 (Dec 21 - Dec 27, 2025)", startDate: "2025-12-21", endDate: "2025-12-27" },
        ],
      },
      asins: asins.length > 0 ? asins : ["B0MOCK0001", "B0MOCK0002", "B0MOCK0003", "B0MOCK0004", "B0MOCK0005", "B0MOCK0006"],
    },
  });
};

exports.getAllBrandAnalytics = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "BRAND_ANALYTICS", subType: "MAIN", adType: "ALL" });

  if (req.body?.asin && req.body.asin !== "All") {
    const asins = Array.isArray(req.body.asin) ? req.body.asin : [req.body.asin];
    if (asins.length > 0) {
      records = records.filter((r) => asins.includes(r.asin));
    }
  }

  const { data, allFiltered, currentPageNo, perPage, totalRecords, totalPages } = filterSortPaginate(records, {
    searchName: req.body?.searchQuery || req.body?.searchName || req.body?.searchText,
    searchFields: ["searchQuery", "asin"],
    fieldName: req.body?.fieldName || "searchQueryVolume",
    sortType: req.body?.sortType || "DESC",
    pageNo: req.body?.pageNo || 1,
    perPage: req.body?.perPage || 50,
  });

  const summary = allFiltered.reduce(
    (acc, r) => {
      acc.searchQueryVolume += Number(r.searchQueryVolume || 0);
      acc.impressionsTotalCount += Number(r.impressionsTotalCount || 0);
      acc.impressionsAsinCount += Number(r.impressionsAsinCount || 0);
      acc.clicksTotalCount += Number(r.clicksTotalCount || 0);
      acc.clicksAsinCount += Number(r.clicksAsinCount || 0);
      acc.cartAddsTotalCount += Number(r.cartAddsTotalCount || 0);
      acc.cartAddsAsinCount += Number(r.cartAddsAsinCount || 0);
      acc.purchasesTotalCount += Number(r.purchasesTotalCount || 0);
      acc.purchasesAsinCount += Number(r.purchasesAsinCount || 0);
      return acc;
    },
    {
      searchQueryVolume: 0,
      impressionsTotalCount: 0,
      impressionsAsinCount: 0,
      clicksTotalCount: 0,
      clicksAsinCount: 0,
      cartAddsTotalCount: 0,
      cartAddsAsinCount: 0,
      purchasesTotalCount: 0,
      purchasesAsinCount: 0,
    }
  );

  summary.impressionsAsinShare = summary.impressionsTotalCount > 0 ? Number(((summary.impressionsAsinCount / summary.impressionsTotalCount) * 100).toFixed(2)) : 0;
  summary.clicksAsinShare = summary.clicksTotalCount > 0 ? Number(((summary.clicksAsinCount / summary.clicksTotalCount) * 100).toFixed(2)) : 0;
  summary.cartAddsAsinShare = summary.cartAddsTotalCount > 0 ? Number(((summary.cartAddsAsinCount / summary.cartAddsTotalCount) * 100).toFixed(2)) : 0;
  summary.purchasesAsinShare = summary.purchasesTotalCount > 0 ? Number(((summary.purchasesAsinCount / summary.purchasesTotalCount) * 100).toFixed(2)) : 0;

  return res.status(200).send({
    isSuccess: true,
    data,
    summary,
    currentPageNo,
    perPage,
    totalRecords,
    totalPages,
  });
};

exports.checkASINFromDB = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" });

  const search = String(req.body?.search || "").trim().toLowerCase();
  if (search) {
    records = records.filter(
      (p) =>
        String(p.asin || "").toLowerCase().includes(search) ||
        String(p.sku || "").toLowerCase().includes(search) ||
        String(p.title || "").toLowerCase().includes(search)
    );
  }

  const pageNo = Math.max(Number(req.body?.pageNo) || 1, 1);
  const limit = Math.max(Number(req.body?.limit) || 20, 1);
  const startIdx = (pageNo - 1) * limit;
  const paged = records.slice(startIdx, startIdx + limit).map((p) => ({
    asin: p.asin,
    sellerSku: p.sku,
    sku: p.sku,
    itemName: p.title,
    title: p.title,
    price: p.price,
    imageURL: p.imageUrl,
    imageUrl: p.imageUrl,
    status: "Active",
    quantity: 120,
    fulfillmentChannel: "AMAZON_NA",
  }));

  return res.status(200).send({
    isSuccess: true,
    message: "Products fetched successfully!",
    data: paged,
    pagination: {
      total: records.length,
      pageNo,
      limit,
      totalPages: Math.max(Math.ceil(records.length / limit), 1),
    },
  });
};

exports.checkASIN = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const records = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" });
  const requestedAsin = String(req.body?.asin || "").trim();
  const matched = records.find((p) => p.asin === requestedAsin) || records[0] || {
    asin: requestedAsin || "B0MOCK0001",
    sku: "APEX-EARBUD-PRO-BLK",
    title: "ApexGear Pro Active Noise Cancelling Wireless Earbuds",
    price: 59.99,
    imageUrl: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
  };

  return res.status(200).send({
    isSuccess: true,
    message: "ASIN verified successfully (Demo Mode).",
    data: {
      asin: matched.asin,
      sku: matched.sku,
      itemName: matched.title,
      title: matched.title,
      price: matched.price,
      imageURL: matched.imageUrl,
      imageUrl: matched.imageUrl,
      brandName: "ApexGear Official",
    },
  });
};

exports.productSearchOnAmazon = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  let records = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" });

  const kw = String(req.body?.keyword || req.body?.query || "").trim().toLowerCase();
  if (kw) {
    const filtered = records.filter(
      (p) =>
        String(p.title || "").toLowerCase().includes(kw) ||
        String(p.asin || "").toLowerCase().includes(kw) ||
        String(p.sku || "").toLowerCase().includes(kw)
    );
    if (filtered.length > 0) records = filtered;
  }

  const items = records.map((p) => ({
    asin: p.asin,
    summaries: [
      {
        marketplaceId: "ATVPDKIKX0DER",
        itemName: p.title,
        brandName: "ApexGear Official",
        manufacturer: "ApexGear",
      },
    ],
    images: [
      {
        marketplaceId: "ATVPDKIKX0DER",
        images: [
          {
            variant: "MAIN",
            link: p.imageUrl,
            height: 1500,
            width: 1500,
          },
        ],
      },
    ],
  }));

  return res.status(200).send({
    isSuccess: true,
    message: "Product get Successfully!",
    data: {
      numberOfResults: items.length,
      items,
    },
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 15: DASHBOARD ANALYTICS & INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

exports.getSalesDashboard = async (req, res) => {
  const fromDate = req.body?.fromDate || moment().subtract(6, "days").format("YYYY-MM-DD");
  const toDate = req.body?.toDate || moment().format("YYYY-MM-DD");
  const diffDays = Math.max(moment(toDate).diff(moment(fromDate), "days") + 1, 1);
  const prevTo = moment(fromDate).subtract(1, "days").format("YYYY-MM-DD");
  const prevFrom = moment(prevTo).subtract(diffDays - 1, "days").format("YYYY-MM-DD");

  const totalSales = 58920.0;
  const pTotalSales = 49850.0;
  const adSales = 43470.0;
  const pAdSales = 36650.0;
  const organicSales = 15450.0;
  const pOrganicSales = 13200.0;
  const spend = 8489.5;
  const pSpend = 7640.0;
  const tacos = 14.41;
  const pTacos = 15.33;
  const acos = 19.53;
  const pAcos = 20.85;
  const roas = 5.12;
  const pRoas = 4.8;
  const conversionRate = 12.1;
  const pConversionRate = 11.4;
  const ctr = 2.58;
  const pCtr = 2.59;
  const clicks = 31420;
  const pClicks = 27100;
  const impressions = 1218400;
  const pImpressions = 1045000;
  const cpc = 0.27;
  const pCpc = 0.28;
  const totalOrders = 892;
  const adOrders = 660;
  const pAdOrders = 558;

  const cvrTimeline = [
    { label: "1 Nov", cvr: 11.8 },
    { label: "2 Nov", cvr: 12.4 },
    { label: "3 Nov", cvr: 12.1 },
    { label: "4 Nov", cvr: 11.9 },
    { label: "5 Nov", cvr: 12.5 },
    { label: "6 Nov", cvr: 12.2 },
  ];

  const calcChange = (cur, prev) => (prev > 0 ? Number((((cur - prev) / prev) * 100).toFixed(2)) : 0);

  const payload = {
    prevFromDate: prevFrom,
    prevToDate: prevTo,

    totalSales,
    totalSalesChange: calcChange(totalSales, pTotalSales),
    totalSalesChangeAbs: Number((totalSales - pTotalSales).toFixed(2)),

    adSales,
    adSalesChange: calcChange(adSales, pAdSales),
    adSalesChangeAbs: Number((adSales - pAdSales).toFixed(2)),

    organicSales,
    organicSalesChange: calcChange(organicSales, pOrganicSales),
    organicSalesChangeAbs: Number((organicSales - pOrganicSales).toFixed(2)),

    spend,
    spendChange: calcChange(spend, pSpend),
    spendChangeAbs: Number((spend - pSpend).toFixed(2)),

    tacos,
    tacosChange: calcChange(tacos, pTacos),
    tacosChangeAbs: Number((tacos - pTacos).toFixed(2)),

    acos,
    acosChange: calcChange(acos, pAcos),
    acosChangeAbs: Number((acos - pAcos).toFixed(2)),

    roas,
    roasChange: calcChange(roas, pRoas),
    roasChangeAbs: Number((roas - pRoas).toFixed(2)),

    conversionRate,
    conversionRateChange: calcChange(conversionRate, pConversionRate),
    conversionRateChangeAbs: Number((conversionRate - pConversionRate).toFixed(2)),

    ctr,
    ctrChange: calcChange(ctr, pCtr),
    ctrChangeAbs: Number((ctr - pCtr).toFixed(2)),

    clicks,
    clicksChange: calcChange(clicks, pClicks),
    clicksChangeAbs: Number((clicks - pClicks).toFixed(2)),

    impressions,
    impressionsChange: calcChange(impressions, pImpressions),
    impressionsChangeAbs: Number((impressions - pImpressions).toFixed(2)),

    cpc,
    cpcChange: calcChange(cpc, pCpc),
    cpcChangeAbs: Number((cpc - pCpc).toFixed(2)),

    totalOrders,
    adOrders,
    adOrdersChange: calcChange(adOrders, pAdOrders),
    adOrdersChangeAbs: Number((adOrders - pAdOrders).toFixed(2)),

    cvrTimeline,
    healthScore: 84.5,
  };

  return res.status(200).send({
    isSuccess: true,
    data: payload,
    metrics: payload,
  });
};

exports.getSalesTrendGraph = async (req, res) => {
  const fromDate = req.body?.fromDate ? moment(req.body.fromDate) : moment().subtract(5, "days");
  const toDate = req.body?.toDate ? moment(req.body.toDate) : moment();
  const current = moment(fromDate);
  const result = [];

  let dayIndex = 0;
  while (current.isSameOrBefore(toDate)) {
    const date = current.format("YYYY-MM-DD");
    const wave = 1 + Math.sin(dayIndex * 0.75) * 0.15;
    const adSales = Number((6210 * wave).toFixed(2));
    const organicSales = Number((2207 * wave).toFixed(2));
    const totalSales = Number((adSales + organicSales).toFixed(2));
    const spend = Number((1212 * wave).toFixed(2));
    const adOrders = Math.round(94 * wave);
    const organicOrders = Math.round(33 * wave);
    const totalOrders = adOrders + organicOrders;
    const clicks = Math.round(4480 * wave);
    const impressions = Math.round(174000 * wave);
    const acos = Number(((spend / adSales) * 100).toFixed(2));
    const tacos = Number(((spend / totalSales) * 100).toFixed(2));
    const roas = Number((adSales / spend).toFixed(2));
    const ctr = Number(((clicks / impressions) * 100).toFixed(2));
    const cpc = Number((spend / clicks).toFixed(2));
    const profit = Number((totalSales - spend).toFixed(2));

    result.push({
      date,
      reportDate: date,
      spend,
      adSales,
      totalSales,
      organicSales,
      profit,
      tacos,
      acos,
      roas,
      impressions,
      clicks,
      ctr,
      cpc,
      orders: totalOrders,
      adOrders,
      organicOrders,
    });

    current.add(1, "day");
    dayIndex++;
  }

  return res.status(200).send({
    isSuccess: true,
    data: result,
  });
};

exports.getTopProductsGrid = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const products = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" });

  const actions = ["scale", "improve", "scale", "improve", "optimize", "stop", "scale"];
  let rows = products.map((p, idx) => {
    const organicSales = Number((p.sales * 0.35).toFixed(2));
    const totalSales = Number((p.sales + organicSales).toFixed(2));
    const totalOrders = Math.round(p.orders * 1.35);
    const organicOrders = totalOrders - p.orders;
    const profit = Number((totalSales - p.spend).toFixed(2));
    const tacos = Number(((p.spend / totalSales) * 100).toFixed(2));
    const action = actions[idx % actions.length];

    return {
      _id: p.asin || `ASIN-${idx}`,
      asin: p.asin,
      sku: p.sku,
      title: p.title,
      productName: p.title,
      productImage: p.imageUrl,
      image: p.imageUrl,
      imageUrl: p.imageUrl,
      price: p.price,
      itemPrice: p.price,
      demand: p.orders,
      profit,
      totalSales,
      adSales: p.sales,
      organicSales,
      totalOrders,
      adOrders: p.orders,
      organicOrders,
      spend: p.spend,
      adSpend: p.spend,
      acos: p.acos,
      roas: p.roas,
      tacos,
      cpc: p.cpc,
      ctr: p.ctr,
      cvr: p.cvr,
      clicks: p.clicks,
      impressions: p.impressions,
      action,
      status: "Active",
      totalStock: 120 + idx * 15,
      stockDays: 25 + idx * 4,
      daysLeft: 25 + idx * 4,
    };
  });

  // Filter by selectedMatrix / customFilter if passed
  const customFilter = req.body?.customFilter;
  let parsedFilter = null;
  if (customFilter) {
    try {
      parsedFilter = typeof customFilter === "string" ? JSON.parse(customFilter) : customFilter;
    } catch (_) { }
  }
  const selectedMatrix = req.body?.performanceMatrix || parsedFilter?.action?.$in;
  if (Array.isArray(selectedMatrix) && selectedMatrix.length > 0) {
    const allowed = selectedMatrix.map((m) => String(m).toLowerCase());
    rows = rows.filter((r) => allowed.includes(String(r.action).toLowerCase()));
  }

  // Filter by productName / searchSku
  const search = String(req.body?.productName || "").trim().toLowerCase();
  if (search) {
    rows = rows.filter(
      (r) =>
        String(r.title || "").toLowerCase().includes(search) ||
        String(r.asin || "").toLowerCase().includes(search) ||
        String(r.sku || "").toLowerCase().includes(search)
    );
  }

  const page = Math.max(Number(req.body?.page) || 1, 1);
  const limit = Math.max(Number(req.body?.limit) || 10, 1);
  const startIdx = (page - 1) * limit;
  const paged = rows.slice(startIdx, startIdx + limit);

  return res.status(200).send({
    isSuccess: true,
    total: rows.length,
    data: paged,
  });
};

exports.getProductDecisionMatrix = async (req, res) => {
  return res.status(200).send({
    isSuccess: true,
    data: {
      scale: 3,
      improve: 2,
      optimize: 1,
      stop: 1,
    },
  });
};

exports.getDashboardInsights = async (req, res) => {
  const insights = [
    {
      asin: "B0MOCK0001",
      title: "ApexGear ANC Wireless Earbuds (Black)",
      image: "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
      sku: "APEX-EARBUD-PRO-BLK",
      message: "Strong performing listing with 5.56x ROAS and healthy inventory. Recommended to scale Top of Search ad placement.",
      badge: "Scale Ad Spend",
      type: "scale",
      color: "green",
      metrics: {
        roas: 5.6,
        acos: 18,
        cvr: 14.2,
        clicks: 1240,
        stockDays: 45,
      },
      smallMessage: "High ROAS (5.6x) and low ACOS (18%)",
    },
    {
      asin: "B0MOCK0002",
      title: "ApexGear 65W GaN Fast Wall Charger",
      image: "https://m.media-amazon.com/images/I/61CGHv6kmWL._AC_SL1500_.jpg",
      sku: "APEX-GAN65W-WHT",
      message: "High demand with 5.55x ROAS. Conversion rate at 12.8%. Maintain competitive price.",
      badge: "High ROAS",
      type: "scale",
      color: "green",
      metrics: {
        roas: 5.5,
        acos: 18,
        cvr: 12.8,
        clicks: 1450,
        stockDays: 38,
      },
      smallMessage: "Strong ROAS and consistent high velocity",
    },
    {
      asin: "B0MOCK0005",
      title: "ApexGear 4K Ultra HD Streaming Webcam",
      image: "https://m.media-amazon.com/images/I/71k3f9ep0kL._AC_SL1500_.jpg",
      sku: "APEX-WEBCAM-4K",
      message: "Critical low inventory cover (4 days left). Moderate ad spend or raise bid adjustments to prevent stockout.",
      badge: "Low Stock Alert",
      type: "low_stock",
      color: "yellow",
      metrics: {
        roas: 4.8,
        acos: 21,
        cvr: 10.5,
        clicks: 610,
        stockDays: 4,
      },
      smallMessage: "Only 4 days of stock cover remaining",
    },
  ];

  const page = Math.max(Number(req.body?.page) || 1, 1);
  const limit = Math.max(Number(req.body?.limit) || 10, 1);
  const total = insights.length;
  const pagedData = insights.slice((page - 1) * limit, page * limit);

  return res.status(200).send({
    isSuccess: true,
    data: pagedData,
    pagination: {
      page,
      limit,
      total,
      hasMore: page * limit < total,
    },
  });
};

exports.getChangesByCampaign = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const history = await getMockRecords({ userId, moduleType: "HISTORY", subType: "MAIN", adType: "ALL" });
  const rows = history.filter((h) => h.type === "Campaign" || h.type === "Placement" || h.type === "Status");
  return res.status(200).send({
    isSuccess: true,
    data: rows,
    totalRecords: rows.length,
  });
};

exports.getChangesByKeyword = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const history = await getMockRecords({ userId, moduleType: "HISTORY", subType: "MAIN", adType: "ALL" });
  const rows = history.filter((h) => h.type === "Targeting");
  return res.status(200).send({
    isSuccess: true,
    data: rows,
    totalRecords: rows.length,
  });
};

exports.getChangesByProduct = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const products = await getMockRecords({ userId, moduleType: "PRODUCT_LIST", subType: "MAIN", adType: "ALL" });
  const rows = products.map((p, idx) => ({
    asin: p.asin,
    sku: p.sku,
    productName: p.title,
    imageUrl: p.imageUrl,
    changesCount: 4 - (idx % 3),
    lastChangeType: idx % 2 === 0 ? "Keyword Bid Scaled (+18%)" : "Daily Budget Increased (+25%)",
    oldAcos: Number((p.acos + 2.4).toFixed(2)),
    currentAcos: p.acos,
    spend: p.spend,
    sales: p.sales,
    updatedAt: new Date(Date.now() - (idx + 1) * 3600 * 1000 * 4).toISOString(),
  }));

  return res.status(200).send({
    isSuccess: true,
    data: rows,
    totalRecords: rows.length,
  });
};

exports.getAssignedCampaignComparison = async (req, res) => {
  return res.status(200).send({
    isSuccess: true,
    data: {
      assigned: {
        campaignCount: 6,
        spend: 6814.3,
        sales: 36550.0,
        orders: 558,
        acos: 18.64,
        roas: 5.36,
        cvr: 12.8,
        ctr: 2.74,
      },
      unassigned: {
        campaignCount: 3,
        spend: 1675.2,
        sales: 6920.0,
        orders: 102,
        acos: 24.21,
        roas: 4.13,
        cvr: 9.6,
        ctr: 2.12,
      },
    },
  });
};

exports.getAdTypeBreakdown = async (req, res) => {
  const sp = {
    name: "Sponsored Products",
    code: "SP",
    color: "#2374F2",
    campaignCount: 6,
    impressions: 866700,
    clicks: 22480,
    spend: 5013.9,
    sales: 25920.0,
    orders: 433,
    acos: 19.34,
    roas: 5.17,
    cpc: 0.22,
    ctr: 2.59,
    cvr: 1.93,
    spendShare: 59.1,
    salesShare: 59.6,
    prevSpend: 4420.0,
    prevSales: 21850.0,
    prevOrders: 366,
    prevClicks: 19300,
    prevImpressions: 745000,
    prevAcos: 20.23,
    prevRoas: 4.94,
    prevCtr: 2.59,
    deltaSpend: { diff: 593.9, pct: 13.4 },
    deltaSales: { diff: 4070.0, pct: 18.6 },
    deltaOrders: { diff: 67, pct: 18.3 },
    deltaClicks: { diff: 3180, pct: 16.5 },
    deltaImpressions: { diff: 121700, pct: 16.3 },
    deltaAcos: { diff: -0.89, pct: -4.4 },
    deltaRoas: { diff: 0.23, pct: 4.7 },
    deltaCtr: { diff: 0.0, pct: 0.0 },
  };

  const sb = {
    name: "Sponsored Brands",
    code: "SB",
    color: "#8b5cf6",
    campaignCount: 2,
    impressions: 249700,
    clicks: 6960,
    spend: 2710.6,
    sales: 13870.0,
    orders: 166,
    acos: 19.54,
    roas: 5.12,
    cpc: 0.39,
    ctr: 2.79,
    cvr: 2.39,
    spendShare: 31.9,
    salesShare: 31.9,
    prevSpend: 2450.0,
    prevSales: 11980.0,
    prevOrders: 142,
    prevClicks: 6100,
    prevImpressions: 218000,
    prevAcos: 20.45,
    prevRoas: 4.89,
    prevCtr: 2.8,
    deltaSpend: { diff: 260.6, pct: 10.6 },
    deltaSales: { diff: 1890.0, pct: 15.8 },
    deltaOrders: { diff: 24, pct: 16.9 },
    deltaClicks: { diff: 860, pct: 14.1 },
    deltaImpressions: { diff: 31700, pct: 14.5 },
    deltaAcos: { diff: -0.91, pct: -4.5 },
    deltaRoas: { diff: 0.23, pct: 4.7 },
    deltaCtr: { diff: -0.01, pct: -0.4 },
  };

  const sd = {
    name: "Sponsored Display",
    code: "SD",
    color: "#10b981",
    campaignCount: 1,
    impressions: 102000,
    clicks: 1980,
    spend: 765.0,
    sales: 3680.0,
    orders: 61,
    acos: 20.79,
    roas: 4.81,
    cpc: 0.39,
    ctr: 1.94,
    cvr: 3.08,
    spendShare: 9.0,
    salesShare: 8.5,
    prevSpend: 770.0,
    prevSales: 2820.0,
    prevOrders: 50,
    prevClicks: 1700,
    prevImpressions: 82000,
    prevAcos: 27.3,
    prevRoas: 3.66,
    prevCtr: 2.07,
    deltaSpend: { diff: -5.0, pct: -0.6 },
    deltaSales: { diff: 860.0, pct: 30.5 },
    deltaOrders: { diff: 11, pct: 22.0 },
    deltaClicks: { diff: 280, pct: 16.5 },
    deltaImpressions: { diff: 20000, pct: 24.4 },
    deltaAcos: { diff: -6.51, pct: -23.8 },
    deltaRoas: { diff: 1.15, pct: 31.4 },
    deltaCtr: { diff: -0.13, pct: -6.3 },
  };

  const totalSpend = 8489.5;
  const totalSales = 43470.0;
  const totalOrders = 660;
  const totalClicks = 31420;
  const totalImpressions = 1218400;

  const prevTotalSpend = 7640.0;
  const prevTotalSales = 36650.0;
  const prevTotalOrders = 558;
  const prevTotalClicks = 27100;
  const prevTotalImpressions = 1045000;

  const totals = {
    totalSpend,
    totalSales,
    totalOrders,
    totalClicks,
    totalImpressions,
    overallAcos: 19.53,
    overallRoas: 5.12,
    overallCtr: 2.58,
    prevTotalSpend,
    prevTotalSales,
    prevTotalOrders,
    prevTotalClicks,
    prevTotalImpressions,
    prevOverallAcos: 20.85,
    prevOverallRoas: 4.8,
    prevOverallCtr: 2.59,
    deltaSpend: { diff: 849.5, pct: 11.1 },
    deltaSales: { diff: 6820.0, pct: 18.6 },
    deltaOrders: { diff: 102, pct: 18.3 },
    deltaClicks: { diff: 4320, pct: 15.9 },
    deltaImpressions: { diff: 173400, pct: 16.6 },
    deltaAcos: { diff: -1.32, pct: -6.3 },
    deltaRoas: { diff: 0.32, pct: 6.7 },
    deltaCtr: { diff: -0.01, pct: -0.4 },
  };

  return res.status(200).send({
    isSuccess: true,
    data: {
      breakdown: { SP: sp, SB: sb, SD: sd },
      totals,
      previousRange: {
        prevFromDate: moment().subtract(13, "days").format("YYYY-MM-DD"),
        prevToDate: moment().subtract(7, "days").format("YYYY-MM-DD"),
      },
    },
  });
};

exports.getTimeBasedAnalytics = async (req, res) => {
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const fullDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const orderShares = [16.4, 15.8, 17.2, 18.5, 14.2, 9.6, 8.3];
  const dayOrders = [108, 104, 114, 122, 94, 63, 55];
  const daySales = [7128.0, 6864.0, 7524.0, 8052.0, 6204.0, 4158.0, 3540.0];
  const daySpend = [1390.0, 1340.0, 1460.0, 1570.0, 1210.0, 810.0, 709.5];

  const dayOfWeek = dayNames.map((name, i) => ({
    dayOfWeek: i + 1,
    dayName: name,
    fullDayName: fullDayNames[i],
    orders: dayOrders[i],
    sales: daySales[i],
    spend: daySpend[i],
    orderShare: orderShares[i],
    salesShare: orderShares[i],
    acos: Number(((daySpend[i] / daySales[i]) * 100).toFixed(2)),
    roas: Number((daySales[i] / daySpend[i]).toFixed(2)),
    aov: Number((daySales[i] / dayOrders[i]).toFixed(2)),
    isBestDay: i === 3, // Thursday is peak
  }));

  const formatHourLabel = (h) => {
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
  };

  const peakHoursList = Array.from({ length: 24 }, (_, i) => {
    const isPeak = i >= 18 && i <= 22;
    const isMorning = i >= 9 && i <= 13;
    const mult = isPeak ? 1.7 : isMorning ? 1.25 : 0.55;
    const orders = Math.round(28 * mult);
    const sales = Number((1840 * mult).toFixed(2));
    const spend = Number((360 * mult).toFixed(2));
    const clicks = Math.round(1310 * mult);
    const impressions = Math.round(51000 * mult);
    return {
      hour: i,
      label: formatHourLabel(i),
      orders,
      sales,
      spend,
      clicks,
      impressions,
      aov: orders > 0 ? Number((sales / orders).toFixed(2)) : 0,
      acos: sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0,
      roas: spend > 0 ? Number((sales / spend).toFixed(2)) : 0,
      cvr: clicks > 0 ? Number(((orders / clicks) * 100).toFixed(2)) : 0,
      cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
      isPeak,
    };
  });

  const sortedPeakHours = [...peakHoursList].sort((a, b) => b.orders - a.orders || b.sales - a.sales);

  return res.status(200).send({
    isSuccess: true,
    data: {
      dayOfWeek,
      dayOfWeekSummary: {
        totalOrders: 660,
        totalSales: 43470.0,
        totalSpend: 8489.5,
        bestDay: "Thursday",
        bestDayOrders: 122,
        bestDayShare: 18.5,
        weekendOrders: 118,
        weekdayOrders: 542,
        weekendPct: 17.9,
        weekdayPct: 82.1,
      },
      peakHours: sortedPeakHours,
      hourlyChronological: peakHoursList,
      peakHoursSummary: {
        peakWindow: "6 PM – 10 PM",
        peakHour: "8 PM",
        peakHourOrders: 48,
        peakHourSales: 3128.0,
        totalHourlyOrders: 660,
        totalHourlySales: 43470.0,
      },
      range: {
        fromDate: req.body?.fromDate || moment().subtract(6, "days").format("YYYY-MM-DD"),
        toDate: req.body?.toDate || moment().format("YYYY-MM-DD"),
      },
    },
  });
};

exports.getRecommendations = async (req, res) => {
  const recommendations = [
    {
      _id: "REC-DEMO-01",
      ruleName: "Scale Exact Keywords Below 20% ACOS",
      gridName: "Targeting Optimization",
      ruleType: "TARGETING",
      actions: [
        { actionName: "IncreaseBid", actionValue: 15, actionValueType: "Percentage", matchType: "EXACT" },
      ],
      fromDate: moment().subtract(14, "days").format("YYYY-MM-DD"),
      toDate: moment().format("YYYY-MM-DD"),
      count: 4,
      newCount: 4,
    },
    {
      _id: "REC-DEMO-02",
      ruleName: "Negate Wasted Zero-Order Search Terms",
      gridName: "Search Term Guardrail",
      ruleType: "SEARCH_TERM",
      actions: [
        { actionName: "AddAsNegativeTargeting", matchType: "NEGATIVE_EXACT" },
      ],
      fromDate: moment().subtract(14, "days").format("YYYY-MM-DD"),
      toDate: moment().format("YYYY-MM-DD"),
      count: 3,
      newCount: 3,
    },
    {
      _id: "REC-DEMO-03",
      ruleName: "High Performing Campaign Budget Scaling",
      gridName: "Budget Scaling",
      ruleType: "CAMPAIGN",
      actions: [
        { actionName: "IncreaseBudget", actionValue: 25, actionValueType: "Percentage" },
      ],
      fromDate: moment().subtract(7, "days").format("YYYY-MM-DD"),
      toDate: moment().format("YYYY-MM-DD"),
      count: 2,
      newCount: 2,
    },
  ];

  return res.status(200).send({
    isSuccess: true,
    message: "Recommendation data fetched successfully.",
    data: recommendations,
    pagination: {
      page: 1,
      limit: 10,
      total: recommendations.length,
      hasMore: false,
    },
  });
};

exports.getRecommendationsHub = async (req, res) => {
  const recommendations = [
    {
      _id: "REC-3001",
      category: "BID_SCALING",
      priority: "HIGH",
      adType: "SP",
      entityType: "Keyword",
      entityName: "wireless anc earbuds",
      matchType: "EXACT",
      campaignId: 800001,
      campaignName: "SP | ApexGear ANC Earbuds | Exact Core",
      currentValue: 1.45,
      recommendedValue: 1.65,
      spend: 980.4,
      sales: 5820.0,
      orders: 97,
      acos: 16.85,
      roas: 5.94,
      expectedImpact: "+$1,120 projected monthly ad sales at ~18.5% ACOS",
      reason: "Keyword is converting at 7.58% CVR with ACOS 5.1% below target.",
      status: "PENDING",
    },
    {
      _id: "REC-3002",
      category: "NEGATIVE_KEYWORD",
      priority: "HIGH",
      adType: "SP",
      entityType: "Search Term",
      entityName: "cheap wired headphones 3.5mm jack",
      matchType: "NEGATIVE_EXACT",
      campaignId: 800002,
      campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery",
      currentValue: "ACTIVE",
      recommendedValue: "NEGATIVE_EXACT",
      spend: 198.45,
      sales: 0,
      orders: 0,
      acos: 100,
      roas: 0,
      expectedImpact: "Save ~$198.45 in wasted spend per 14 days",
      reason: "245 clicks and $198.45 spend with 0 orders on incompatible product query.",
      status: "PENDING",
    },
    {
      _id: "REC-3003",
      category: "BUDGET_SCALING",
      priority: "MEDIUM",
      adType: "SP",
      entityType: "Campaign",
      entityName: "SP | ApexGear 65W GaN Charger | Phrase & Broad",
      matchType: "-",
      campaignId: 800003,
      campaignName: "SP | ApexGear 65W GaN Charger | Phrase & Broad",
      currentValue: 95.0,
      recommendedValue: 125.0,
      spend: 1654.2,
      sales: 9180.0,
      orders: 229,
      acos: 18.02,
      roas: 5.55,
      expectedImpact: "+38 incremental orders/month",
      reason: "Campaign consistently exhausts daily budget before 8 PM EST.",
      status: "PENDING",
    },
    {
      _id: "REC-3004",
      category: "HARVEST_KEYWORD",
      priority: "HIGH",
      adType: "SP",
      entityType: "Search Term",
      entityName: "bluetooth 5.3 earbuds noise cancelling",
      matchType: "EXACT",
      campaignId: 800001,
      campaignName: "SP | ApexGear ANC Earbuds | Exact Core",
      currentValue: "DISCOVERY",
      recommendedValue: "ADD_EXACT ($1.38 Bid)",
      spend: 596.4,
      sales: 3420.0,
      orders: 57,
      acos: 17.44,
      roas: 5.73,
      expectedImpact: "+$2,400/mo isolated Exact match revenue",
      reason: "57 orders at 17.44% ACOS without dedicated Exact match target.",
      status: "PENDING",
    },
  ];

  return res.status(200).send({
    isSuccess: true,
    data: recommendations,
    recommendations,
    summary: {
      totalCount: recommendations.length,
      potentialSavings: 386.66,
      potentialSalesGain: 4850.0,
    },
  });
};

exports.getWasteAndScalingAlerts = async (req, res) => {
  const zeroOrderSearchTerms = [
    {
      id: "zst-800002-apple-airpods",
      searchTerm: "apple airpods pro 2nd generation",
      campaignId: 800002,
      campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery",
      clicks: 230,
      impressions: 14500,
      spend: 188.25,
      cpc: 0.82,
      ctr: 1.59,
      orders: 0,
      purchases: 0,
      suggestedAction: "Add as Negative Exact",
    },
    {
      id: "zst-800002-wired-headphones",
      searchTerm: "cheap wired headphones 3.5mm jack",
      campaignId: 800002,
      campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery",
      clicks: 245,
      impressions: 11200,
      spend: 198.45,
      cpc: 0.81,
      ctr: 2.19,
      orders: 0,
      purchases: 0,
      suggestedAction: "Add as Negative Exact",
    },
    {
      id: "zst-800002-kids-headphones",
      searchTerm: "kids volume limited headphones",
      campaignId: 800002,
      campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery",
      clicks: 162,
      impressions: 8400,
      spend: 126.36,
      cpc: 0.78,
      ctr: 1.93,
      orders: 0,
      purchases: 0,
      suggestedAction: "Add as Negative Exact",
    },
  ];

  const highAcosCampaigns = [
    {
      id: "hac-800009",
      campaignId: 800009,
      campaignName: "SP | ApexGear Aluminum Laptop Stand | Clearance",
      spend: 319.2,
      sales: 1140.0,
      orders: 38,
      acos: 28.0,
      targetAcos: 20.0,
      excessSpend: 91.2,
      status: "ENABLED",
      suggestedAction: "Trim bids or adjust placement modifier",
    },
  ];

  const wasteSpend = {
    summary: {
      totalWastedSpend: 513.06,
      wastedSpendPct: 6.04,
      totalZeroOrderSpend: 513.06,
      zeroOrderTermsCount: zeroOrderSearchTerms.length,
      totalExcessSpend: 91.2,
      highAcosCampaignsCount: 1,
      accountAcos: 19.53,
      totalAccountSpend: 8489.5,
      totalAccountSales: 43470.0,
    },
    zeroOrderSearchTerms,
    page: Math.max(1, Number(req.body?.zeroOrderPage) || 1),
    limit: Number(req.body?.zeroOrderLimit) || 15,
    totalCount: zeroOrderSearchTerms.length,
    hasMore: false,
    highAcosCampaigns,
  };

  return res.status(200).send({
    isSuccess: true,
    data: {
      wasteSpend,
      currencyCode: req.body?.currencyCode || "USD",
      marketplace: req.body?.marketplace || "US",
      range: {
        fromDate: req.body?.fromDate || moment().subtract(21, "days").format("YYYY-MM-DD"),
        toDate: req.body?.toDate || moment().format("YYYY-MM-DD"),
      },
    },
  });
};

exports.getHourlyCampaignTracking = async (req, res) => {
  const startDate = req.body?.startDate || moment().subtract(5, "days").format("YYYY-MM-DD");
  const endDate = req.body?.endDate || moment().format("YYYY-MM-DD");
  const current = moment(startDate);
  const hourlyData = [];

  const campaignsList = [
    { campaignId: 800001, campaignName: "SP | ApexGear ANC Earbuds | Exact Core" },
    { campaignId: 800002, campaignName: "SP | ApexGear ANC Earbuds | Auto Discovery" },
    { campaignId: 800003, campaignName: "SP | ApexGear 65W GaN Charger | Phrase & Broad" },
  ];

  while (current.isSameOrBefore(endDate)) {
    const dateStr = current.format("YYYY-MM-DD");

    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      const nextH = String((h + 1) % 24).padStart(2, "0");
      const startTime = `${hh}:00:00`;
      const endTime = `${nextH}:00:00`;

      const isPeak = h >= 18 && h <= 22;
      const isMorning = h >= 9 && h <= 13;
      const mult = isPeak ? 2.1 : isMorning ? 1.4 : 0.45;

      const baseOrders = Math.round(5 * mult);
      const baseSales = Number((280 * mult).toFixed(2));
      const baseSpend = Number((54 * mult).toFixed(2));
      const baseClicks = Math.round(210 * mult);
      const baseImpressions = Math.round(8200 * mult);

      const campaignData = campaignsList.map((c, cIdx) => {
        const cShare = [0.55, 0.25, 0.20][cIdx];
        const cOrders = Math.round(baseOrders * cShare);
        const cSales = Number((baseSales * cShare).toFixed(2));
        const cSpend = Number((baseSpend * cShare).toFixed(2));
        const cClicks = Math.round(baseClicks * cShare);
        const cImpressions = Math.round(baseImpressions * cShare);

        return {
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          impressions: cImpressions,
          clicks: cClicks,
          spends: cSpend,
          sales: cSales,
          orders: cOrders,
          adsSales: cSales,
          adsOrders: cOrders,
          cpc: cClicks > 0 ? Number((cSpend / cClicks).toFixed(2)) : 0,
          acos: cSales > 0 ? Number(((cSpend / cSales) * 100).toFixed(2)) : 0,
          roas: cSpend > 0 ? Number((cSales / cSpend).toFixed(2)) : 0,
        };
      });

      const totalOrders = Math.round(baseOrders * 1.35);
      const totalSales = Number((baseSales * 1.35).toFixed(2));
      const organicOrders = totalOrders - baseOrders;
      const organicSales = Number((totalSales - baseSales).toFixed(2));

      campaignData.push({
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
      });

      const acos = baseSales > 0 ? Number(((baseSpend / baseSales) * 100).toFixed(2)) : 0;
      const roas = baseSpend > 0 ? Number((baseSales / baseSpend).toFixed(2)) : 0;
      const ctr = baseImpressions > 0 ? Number(((baseClicks / baseImpressions) * 100).toFixed(2)) : 0;
      const cpc = baseClicks > 0 ? Number((baseSpend / baseClicks).toFixed(2)) : 0;

      hourlyData.push({
        _id: {
          date: dateStr,
          startTime,
          endTime,
        },
        impressions: baseImpressions,
        clicks: baseClicks,
        spends: baseSpend,
        adsOrders: baseOrders,
        adsSales: baseSales,
        orders: totalOrders,
        sales: totalSales,
        totalOrders,
        totalSales,
        organicOrders,
        organicSales,
        ctr,
        cpc,
        acos,
        roas,
        campaignData,
      });
    }

    current.add(1, "day");
  }

  return res.status(200).json({
    isSuccess: true,
    message: "Data fetched successfully (Demo Mode)",
    result: { hourlyData },
  });
};

exports.getHourlyPlacementTracking = async (req, res) => {
  // Reuse the hourly campaign generator, then split every hour across the
  // three placements in the shape the Hourly Placement Tracking modal expects:
  // result.topOfSearch / result.restOfSearch / result.productPages.
  let captured = null;
  const fakeRes = {
    status() { return this; },
    json(payload) { captured = payload; return this; },
    send(payload) { captured = payload; return this; },
  };
  await exports.getHourlyCampaignTracking(req, fakeRes);
  const hourlyData = captured?.result?.hourlyData || [];

  // Share of traffic / sales per placement (slight variation per placement).
  const SPLITS = {
    topOfSearch: { imp: 0.45, clk: 0.52, spend: 0.54, sales: 0.58 },
    restOfSearch: { imp: 0.30, clk: 0.27, spend: 0.26, sales: 0.24 },
    productPages: { imp: 0.25, clk: 0.21, spend: 0.20, sales: 0.18 },
  };

  const buildRows = (s) =>
    hourlyData.map((row) => {
      const impressions = Math.round((row.impressions || 0) * s.imp);
      const clicks = Math.round((row.clicks || 0) * s.clk);
      const spends = Number(((row.spends || 0) * s.spend).toFixed(2));
      const sales = Number(((row.adsSales ?? row.sales ?? 0) * s.sales).toFixed(2));
      const orders = Math.round((row.adsOrders ?? row.orders ?? 0) * s.sales);
      return {
        _id: { ...row._id },
        impressions,
        clicks,
        spends,
        sales,
        orders,
        adsSales: sales,
        adsOrders: orders,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        cpc: clicks > 0 ? Number((spends / clicks).toFixed(2)) : 0,
        acos: sales > 0 ? Number(((spends / sales) * 100).toFixed(2)) : 0,
        roas: spends > 0 ? Number((sales / spends).toFixed(2)) : 0,
      };
    });

  return res.status(200).json({
    isSuccess: true,
    message: "Data fetched successfully (Demo Mode)",
    result: {
      topOfSearch: buildRows(SPLITS.topOfSearch),
      restOfSearch: buildRows(SPLITS.restOfSearch),
      productPages: buildRows(SPLITS.productPages),
    },
  });
};

exports.MOCK_PROFILE_ID = MOCK_PROFILE_ID;
