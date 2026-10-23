'use strict';

// Specialised, read-only report builders for two product questions whose data lives
// OUTSIDE the generic ad-metric pipeline:
//   - "Which products are low on stock?"  -> inventories collection (snapshot)
//   - "What is my TACOS?" / "TACOS by product" -> total ordered sales (dailyordersales /
//     businessproductsales) divided by advertising spend.
//
// These never go through makeMetricRows (which only computes ad metrics), so they are
// assembled here and then handed to the shared, contract-validated buildReportResponse.
//
// ASSUMPTIONS TO VERIFY AGAINST REAL DATA before fully trusting the figures:
//   * inventories: one row per (configId, profileId, asin, fulfillmentType); an ASIN can
//     have both an FBA and FBM row, so currentStock is SUMMED per ASIN (mirrors the portal
//     Inventory dashboard's fbaStock+fbmStock). currentStock = fulfillable/sellable qty.
//   * dailyordersales.orderSales and businessproductsales.sales are total ordered product
//     sales (organic + ad) in the PROFILE's marketplace currency — same currency as ad
//     spend, so TACOS needs no FX conversion.
//   * advertising spend is summed from the daily campaign collections for the requested
//     ad types; per-product spend comes from product_ads (SP). These sums are provisional
//     (no per-grain import-coverage verifier), so every report here is marked 'partial'.

const { Types: { ObjectId } } = require('mongoose');
const { createReportState, buildReportResponse } = require('./reportResponse');

const MAX_ROWS = 50000;
const MAX_TIME_MS = 5000;
const CAMPAIGN_COLLECTIONS = { SP: 'campaigns', SB: 'sbcampaigns', SD: 'sdcampaigns' };
const INVENTORY_NOTE = 'Inventory reflects the latest sync; per-day completeness is not independently verified.';
const SALES_NOTE = 'TACOS uses total ordered product sales (organic + ad) and provisional advertising spend; figures may change as reporting completes.';

function objectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
}

function safeInt(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

// The resolved scope carries no profile display name (the contract forbids unknown
// keys), so label by position exactly like readableExplanation does.
function profileLabel(scope, profileId) {
  const index = scope.profiles.findIndex(profile => profile.profileId === profileId);
  return scope.profiles.length > 1 ? `Profile ${index + 1}` : 'Selected profile';
}

function currentWindow(periods, profileId) {
  return periods.find(entry => entry.profileId === profileId)?.current || null;
}

// ─────────────────────────── Low stock ───────────────────────────

async function readInventoryByAsin(db, configId, profile) {
  const rows = await db.collection('inventories').find({
    configId: objectId(configId),
    profileId: Number(profile.profileId),
  }, {
    projection: { _id: 0, asin: 1, name: 1, currentStock: 1, inboundStock: 1, totalStock: 1, daysLeft: 1, status: 1, fulfillmentType: 1 },
    maxTimeMS: MAX_TIME_MS,
  }).limit(MAX_ROWS + 1).toArray();

  const byAsin = new Map();
  for (const row of rows) {
    if (!row.asin || typeof row.asin !== 'string') continue;
    const entry = byAsin.get(row.asin) || {
      asin: row.asin, name: '', current: 0, inbound: 0, total: 0, seen: false, daysLeft: null, status: '',
    };
    for (const [field, key] of [['currentStock', 'current'], ['inboundStock', 'inbound'], ['totalStock', 'total']]) {
      if (typeof row[field] === 'number' && Number.isFinite(row[field])) {
        entry[key] += row[field];
        entry.seen = true;
      }
    }
    if (!entry.name && typeof row.name === 'string') entry.name = row.name;
    if (!entry.status && typeof row.status === 'string') entry.status = row.status;
    if (entry.daysLeft === null && typeof row.daysLeft === 'number' && Number.isFinite(row.daysLeft)) {
      entry.daysLeft = Math.max(0, Math.round(row.daysLeft));
    }
    byAsin.set(row.asin, entry);
  }
  return [...byAsin.values()];
}

async function buildInventoryReport({ db, request, scope, periods, reportId }) {
  const state = createReportState();
  const wantsDaysOfStock = request.metrics.includes('days_of_stock');

  for (const profile of scope.profiles) {
    let inventory;
    try {
      inventory = await readInventoryByAsin(db, scope.configId, profile);
    } catch (_) {
      state.missingInputs.add(`${profile.profileId}: readable inventory snapshot`);
      state.allVerified = false;
      continue;
    }

    const rows = inventory
      .map(item => {
        const row = {
          profileId: profile.profileId,
          productId: item.asin,
          name: (item.name || item.asin).slice(0, 500),
          status: (item.status || 'UNKNOWN').slice(0, 500),
          stock: item.seen ? safeInt(item.current) : null,
          inboundStock: safeInt(item.inbound),
          totalStock: safeInt(item.total),
        };
        if (wantsDaysOfStock) row.days_of_stock = item.daysLeft;
        return row;
      })
      // "Low on stock": lowest sellable stock first; unknown stock sorts last.
      .sort((left, right) => (left.stock ?? Infinity) - (right.stock ?? Infinity));

    const columns = [
      { key: 'profileId', label: 'profileId', type: 'string' },
      { key: 'productId', label: 'productId', type: 'string' },
      { key: 'name', label: 'name', type: 'string' },
      { key: 'status', label: 'status', type: 'string' },
      { key: 'stock', label: 'stock', type: 'number', unit: 'count', nullable: true },
      { key: 'inboundStock', label: 'inboundStock', type: 'number', unit: 'count', nullable: true },
      { key: 'totalStock', label: 'totalStock', type: 'number', unit: 'count', nullable: true },
    ];
    if (wantsDaysOfStock) {
      columns.push({ key: 'days_of_stock', label: 'days_of_stock', type: 'number', unit: 'count', nullable: true });
    }

    const paged = rows.slice(request.offset, request.offset + request.limit);
    if (!rows.length) {
      state.missingInputs.add(`${profile.profileId}: current inventory records`);
      state.allVerified = false;
      continue;
    }

    state.hasUsableEvidence = true;
    state.allVerified = false; // snapshot freshness is not independently verified
    state.warnings.add(INVENTORY_NOTE);
    if (wantsDaysOfStock && rows.every(row => row.days_of_stock === null)) {
      state.missingInputs.add(`${profile.profileId}: validated sales velocity for days-of-stock`);
    }

    const id = `report_${state.sourceIndex++}`;
    state.datasets.push({
      id,
      columns,
      rows: paged,
      page: { offset: request.offset, limit: request.limit, total: rows.length, hasMore: request.offset + paged.length < rows.length },
    });
    state.blocks.push({ type: 'table', title: `Low stock · ${profileLabel(scope, profile.profileId)}`, datasetId: id, sortable: true });
    state.analysisText.push(`${profileLabel(scope, profile.profileId)}: ${rows.length} product${rows.length === 1 ? '' : 's'} with current inventory; the lowest-stock items are listed first.`);
  }

  // Present the stock column as a bar; keep the sortable table alongside.
  return buildReportResponse(state, { ...request, presentation: 'bar', metrics: ['stock'] }, scope, periods, reportId);
}

// ─────────────────────────── TACOS ───────────────────────────

async function sumAdvertisingSpend(db, configId, profile, adTypes, window) {
  let total = 0;
  let any = false;
  let currencyMismatch = false;
  for (const adType of adTypes) {
    const collection = CAMPAIGN_COLLECTIONS[adType];
    if (!collection) continue;
    const rows = await db.collection(collection).find({
      configId: objectId(configId),
      profileId: Number(profile.profileId),
      reportDate: { $gte: window.fromDate, $lte: window.toDate },
    }, { projection: { _id: 0, spend: 1, currencyCode: 1 }, maxTimeMS: MAX_TIME_MS }).limit(MAX_ROWS + 1).toArray();
    for (const row of rows) {
      const spend = safeNumber(row.spend);
      if (spend !== null) { total += spend; any = true; }
      if (row.currencyCode && row.currencyCode !== profile.currencyCode) currencyMismatch = true;
    }
  }
  return { total: any ? total : null, currencyMismatch };
}

async function sumTotalOrderedSales(db, configId, profile, window) {
  const rows = await db.collection('dailyordersales').find({
    configId: objectId(configId),
    profileId: Number(profile.profileId),
    date: { $gte: window.fromDate, $lte: window.toDate },
  }, { projection: { _id: 0, orderSales: 1 }, maxTimeMS: MAX_TIME_MS }).limit(MAX_ROWS + 1).toArray();
  let total = 0;
  let any = false;
  for (const row of rows) {
    const sales = safeNumber(row.orderSales);
    if (sales !== null) { total += sales; any = true; }
  }
  return any ? total : null;
}

async function readProductSalesByAsin(db, configId, profile, window) {
  const rows = await db.collection('businessproductsales').find({
    configId: objectId(configId),
    profileId: Number(profile.profileId),
    reportDate: { $gte: window.fromDate, $lte: window.toDate },
  }, { projection: { _id: 0, asin: 1, sales: 1 }, maxTimeMS: MAX_TIME_MS }).limit(MAX_ROWS + 1).toArray();
  const byAsin = new Map();
  for (const row of rows) {
    if (!row.asin) continue;
    const sales = safeNumber(row.sales);
    if (sales === null) continue;
    byAsin.set(row.asin, (byAsin.get(row.asin) || 0) + sales);
  }
  return byAsin;
}

async function readProductAdSpendByAsin(db, configId, profile, window) {
  // SP advertised-product spend. product_ads stores per-ad rows keyed by ASIN.
  const rows = await db.collection('product_ads').find({
    configId: objectId(configId),
    profileId: Number(profile.profileId),
    reportDate: { $gte: window.fromDate, $lte: window.toDate },
  }, { projection: { _id: 0, asins: 1, name: 1, spend: 1 }, maxTimeMS: MAX_TIME_MS }).limit(MAX_ROWS + 1).toArray();
  const byAsin = new Map();
  for (const row of rows) {
    const asin = typeof row.asins === 'string' ? row.asins : null;
    if (!asin) continue;
    const spend = safeNumber(row.spend);
    const entry = byAsin.get(asin) || { spend: 0, name: '', seen: false };
    if (spend !== null) { entry.spend += spend; entry.seen = true; }
    if (!entry.name && typeof row.name === 'string') entry.name = row.name;
    byAsin.set(asin, entry);
  }
  return byAsin;
}

function tacosValue(spend, sales) {
  if (spend === null || sales === null) return { value: null, status: 'missing_data' };
  if (sales === 0) return { value: null, status: 'no_sales' };
  return { value: spend / sales * 100, status: 'available' };
}

// One TACOS report: a headline account TACOS card (total ad spend / total ordered
// sales) plus, when advertised-product data exists, a per-product TACOS breakdown.
async function buildTacosReport({ db, request, scope, periods, reportId }) {
  const state = createReportState();
  let cardIndex = 0;

  for (const profile of scope.profiles) {
    const window = currentWindow(periods, profile.profileId);
    if (!window) continue;
    const label = profileLabel(scope, profile.profileId);
    state.allVerified = false;
    state.warnings.add(SALES_NOTE);

    // 1) Account-level headline TACOS.
    const { total: spend, currencyMismatch } = await sumAdvertisingSpend(db, scope.configId, profile, request.adTypes, window);
    const sales = await sumTotalOrderedSales(db, scope.configId, profile, window);
    if (currencyMismatch) state.missingInputs.add(`${profile.profileId}: single-currency advertising spend for TACOS`);
    if (spend === null) state.missingInputs.add(`${profile.profileId}: advertising spend for the period`);
    if (sales === null) state.missingInputs.add(`${profile.profileId}: total ordered product sales (organic + ad)`);

    const { value, status } = tacosValue(spend, sales);
    if (value !== null) state.hasUsableEvidence = true;
    const card = {
      id: `tacos_${cardIndex++}`,
      metric: 'tacos',
      title: `TACOS · ${label}`.slice(0, 150),
      value,
      unit: 'percent',
      status,
    };
    state.cards.push(card);
    state.blocks.push({ type: 'number_card', metricId: card.id });
    if (value !== null) {
      state.analysisText.push(`${label}: TACOS is ${value.toFixed(2)}% — advertising spend as a share of total ordered product sales (including organic).`);
    }

    // 2) Per-product TACOS breakdown (SP advertised products).
    const salesByAsin = await readProductSalesByAsin(db, scope.configId, profile, window);
    const spendByAsin = await readProductAdSpendByAsin(db, scope.configId, profile, window);
    if (!spendByAsin.size) {
      state.missingInputs.add(`${profile.profileId}: advertised product spend for a per-product TACOS breakdown`);
      continue;
    }

    const rows = [...spendByAsin.entries()].map(([asin, info]) => {
      const productSpend = info.seen ? info.spend : null;
      const productSales = salesByAsin.has(asin) ? salesByAsin.get(asin) : null;
      return {
        profileId: profile.profileId,
        productId: asin,
        name: (info.name || asin).slice(0, 500),
        adSpend: productSpend,
        totalSales: productSales,
        tacos: tacosValue(productSpend, productSales).value,
      };
    }).sort((left, right) => (right.tacos ?? -Infinity) - (left.tacos ?? -Infinity));
    if (rows.some(row => row.tacos !== null)) state.hasUsableEvidence = true;

    const columns = [
      { key: 'profileId', label: 'profileId', type: 'string' },
      { key: 'productId', label: 'productId', type: 'string' },
      { key: 'name', label: 'name', type: 'string' },
      { key: 'adSpend', label: 'adSpend', type: 'number', unit: 'currency', nullable: true },
      { key: 'totalSales', label: 'totalSales', type: 'number', unit: 'currency', nullable: true },
      { key: 'tacos', label: 'tacos', type: 'number', unit: 'percent', nullable: true },
    ];
    const paged = rows.slice(request.offset, request.offset + request.limit);
    const id = `report_${state.sourceIndex++}`;
    state.datasets.push({
      id,
      currencyCode: profile.currencyCode,
      columns,
      rows: paged,
      page: { offset: request.offset, limit: request.limit, total: rows.length, hasMore: request.offset + paged.length < rows.length },
    });
    state.blocks.push({ type: 'table', title: `TACOS by product · ${label}`, datasetId: id, sortable: true });
  }

  // 'bar' lets the presentation layer chart per-product TACOS from the table; the
  // headline number_card block renders regardless of the chosen presentation.
  return buildReportResponse(state, { ...request, presentation: 'bar', metrics: ['tacos'] }, scope, periods, reportId);
}

function isInventoryRequest(request) {
  return request.category === 'products' && request.metrics.some(metric => ['stock', 'days_of_stock'].includes(metric));
}

function isTacosRequest(request) {
  return request.metrics.includes('tacos');
}

function buildProductInsightReport(context) {
  const { request } = context;
  if (isInventoryRequest(request)) return buildInventoryReport(context);
  if (isTacosRequest(request)) return buildTacosReport(context);
  return null;
}

module.exports = {
  isInventoryRequest,
  isTacosRequest,
  buildProductInsightReport,
  buildInventoryReport,
  buildTacosReport,
};
