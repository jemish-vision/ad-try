/**
 * Performance Decline & Root Cause Triage — pure rules (no database access).
 *
 * The controller loads the data; everything that decides *what* is flagged and *why*
 * lives here so it can be unit tested on plain objects.
 *
 * Windows: the last `windowDays` complete days, ending 2 days ago (Amazon keeps adding
 * attributed sales for ~48h), compared with the `windowDays` days just before them.
 */
const moment = require("moment-timezone");

const WINDOW_OPTIONS = [7, 14, 30];
const DEFAULT_WINDOW = 14;
const LAG_BUFFER_DAYS = 2;

// Campaigns smaller than this in the earlier period are too noisy to judge.
const MIN_PRIOR_CLICKS = 20;
const MIN_PRIOR_SPEND = 30;

const T = {
  STEADY: -10, // a metric is "steady" when it fell by no more than 10%
  BLACKOUT_IMPRESSIONS: -60,
  BLACKOUT_CLICKS: -60,
  BLEEDING_ORDERS: -30,
  BLEEDING_CVR: -35,
  BIDDING_CPC: 25,
  BIDDING_CLICKS_MAX: 10, // clicks "flat or down": no more than +10%
  FATIGUE_CTR: -30,
  STARVATION_TIME_IN_BUDGET: 65,
  GOOD_ACOS_FLOOR: 30,
  GOOD_ACOS_TOLERANCE: 1.05,
  DECAY_SALES: -20,
  DECAY_ACOS: 20,
  BID_CUT: -25, // a bid cut this deep can drop a target off page 1
  BID_RAISE: 10,
  PLACEMENT_RAISE: 10, // placement multiplier raised by 10+ percentage points
  OUR_PRICE_RAISE: 5,
  RIVAL_PRICE_CUT: -5,
  WASTE_CLICKS_EQUIVALENT: 10, // a search term is waste when it cost >= 10 clicks' worth with 0 orders
  HISTORY_LOOKBACK_DAYS: 3, // changes made up to 3 days before the current window still count
};

const PATTERNS = {
  TRAFFIC_BLACKOUT: { priority: 1, severity: "CRITICAL" },
  BLEEDING_AD: { priority: 2, severity: "CRITICAL" },
  BIDDING_WAR: { priority: 3, severity: "WARNING" },
  AD_FATIGUE: { priority: 4, severity: "WARNING" },
  BUDGET_STARVATION: { priority: 5, severity: "WARNING" },
  GENERAL_DECAY: { priority: 6, severity: "WARNING" },
};

const round = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};

const normalizeWindow = (w) => (WINDOW_OPTIONS.includes(Number(w)) ? Number(w) : DEFAULT_WINDOW);

/** Current and prior date ranges (YYYY-MM-DD, profile timezone). */
function buildEvaluationWindows(windowDays, timezone, now = new Date()) {
  const w = normalizeWindow(windowDays);
  const today = moment.tz(now, timezone || "UTC").startOf("day");
  const d = (n) => today.clone().subtract(n, "days").format("YYYY-MM-DD");
  const bufferedDays = [];
  for (let i = LAG_BUFFER_DAYS - 1; i >= 0; i--) bufferedDays.push(d(i));
  return {
    windowDays: w,
    today: today.format("YYYY-MM-DD"),
    current: { start: d(w + LAG_BUFFER_DAYS - 1), end: d(LAG_BUFFER_DAYS) },
    prior: { start: d(2 * w + LAG_BUFFER_DAYS - 1), end: d(w + LAG_BUFFER_DAYS) },
    bufferedDays,
  };
}

/** % change; 0 when there is nothing to compare against; null when either side is unknown. */
function pctDelta(current, prior) {
  if (current === null || current === undefined || prior === null || prior === undefined) return null;
  const c = Number(current);
  const p = Number(prior);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
  if (p === 0) return 0;
  return round(((c - p) / p) * 100, 1);
}

/** Ratios for one period of summed totals. ACoS/CVR/CPC/CTR are null when the denominator is 0. */
function deriveMetrics(t = {}) {
  const impressions = Number(t.impressions) || 0;
  const clicks = Number(t.clicks) || 0;
  const spend = Number(t.spend) || 0;
  const sales = Number(t.sales) || 0;
  const orders = Number(t.orders) || 0;
  return {
    impressions,
    clicks,
    spend: round(spend),
    sales: round(sales),
    orders,
    acos: sales > 0 ? round((spend / sales) * 100) : null,
    cvr: clicks > 0 ? round((orders / clicks) * 100) : null,
    cpc: clicks > 0 ? round(spend / clicks) : null,
    ctr: impressions > 0 ? round((clicks / impressions) * 100, 3) : null,
  };
}

const METRIC_KEYS = ["impressions", "clicks", "spend", "sales", "orders", "acos", "cvr", "cpc", "ctr"];

function compareMetrics(currentTotals, priorTotals) {
  const c = deriveMetrics(currentTotals);
  const p = deriveMetrics(priorTotals);
  const out = {};
  for (const k of METRIC_KEYS) out[k] = { current: c[k], prior: p[k], delta: pctDelta(c[k], p[k]) };
  return out;
}

const hasEnoughVolume = (priorTotals = {}) =>
  (Number(priorTotals.clicks) || 0) >= MIN_PRIOR_CLICKS || (Number(priorTotals.spend) || 0) >= MIN_PRIOR_SPEND;

const steady = (delta) => delta !== null && delta >= T.STEADY;

/** ACoS got worse: higher than before, or spending with no sales where there were sales before. */
function acosWorse(m) {
  if (m.acos.prior === null) return false;
  if (m.acos.current === null) return m.spend.current > 0;
  return m.acos.current > m.acos.prior;
}

function isGoodAcos(m, targetAcos) {
  if (m.acos.current === null) return false;
  if (Number(targetAcos) > 0) return m.acos.current <= Number(targetAcos);
  const prior = m.acos.prior === null ? 0 : m.acos.prior * T.GOOD_ACOS_TOLERANCE;
  return m.acos.current <= Math.max(T.GOOD_ACOS_FLOOR, prior);
}

/**
 * Pattern for one campaign, by priority, or null when it isn't declining.
 * ctx: { timeInBudget (avg %, current window, or null), targetAcos }
 */
function classifyPattern(m, ctx = {}) {
  const d = (k) => m[k].delta;
  if (d("impressions") !== null && d("impressions") <= T.BLACKOUT_IMPRESSIONS && d("clicks") !== null && d("clicks") <= T.BLACKOUT_CLICKS) {
    return "TRAFFIC_BLACKOUT";
  }
  // CVR can't be measured once clicks reach 0, but a Blackout would have caught that.
  if (d("orders") !== null && d("orders") <= T.BLEEDING_ORDERS && d("cvr") !== null && d("cvr") <= T.BLEEDING_CVR && steady(d("clicks")) && steady(d("spend"))) {
    return "BLEEDING_AD";
  }
  if (d("cpc") !== null && d("cpc") >= T.BIDDING_CPC && d("clicks") !== null && d("clicks") <= T.BIDDING_CLICKS_MAX && acosWorse(m)) {
    return "BIDDING_WAR";
  }
  if (d("ctr") !== null && d("ctr") <= T.FATIGUE_CTR && steady(d("impressions"))) {
    return "AD_FATIGUE";
  }
  const tib = ctx.timeInBudget;
  if (tib !== null && tib !== undefined && tib > 0 && tib < T.STARVATION_TIME_IN_BUDGET && isGoodAcos(m, ctx.targetAcos)) {
    return "BUDGET_STARVATION";
  }
  const salesDrop = d("sales") !== null && d("sales") <= T.DECAY_SALES;
  const acosUp = d("acos") !== null && d("acos") >= T.DECAY_ACOS;
  const acosFromSalesToNone = m.acos.prior !== null && m.acos.current === null && m.spend.current > 0;
  if (salesDrop || acosUp || acosFromSalesToNone) return "GENERAL_DECAY";
  return null;
}

// ── Change history ─────────────────────────────────────────────────────────────
// Change types are saved under several spellings ("Update Camapign Status",
// "update targeting bid", "Update Top of Search Placement Bid", ...), so match by keyword.
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function categorizeChange(row = {}) {
  const type = String(row.changeType || "");
  if (/daypart/i.test(type)) return null; // dayparting moves bids up and down every day; not a lasting change
  if (/placement/i.test(type)) return "PLACEMENT";
  if (/budget/i.test(type)) return "BUDGET";
  if (/bid/i.test(type)) return "BID";
  if (/status|state/i.test(type)) return "STATUS";
  return null;
}

const isPausedValue = (v) => /paus|archiv/i.test(String(v || ""));

/**
 * Evidence from one campaign's change rows.
 * Returns { pause, bidCut, bidRaise, placementRaise } — each the most significant event or null.
 */
function summarizeChanges(rows = []) {
  let pause = null;
  let bidCut = null;
  let bidRaise = null;
  let placementRaise = null;
  let bidCutCount = 0;
  let bidRaiseCount = 0;
  for (const r of rows) {
    const cat = categorizeChange(r);
    if (!cat) continue;
    const date = r.createdAt ? moment(r.createdAt).toISOString() : null;
    if (cat === "STATUS") {
      if (!isPausedValue(r.newValue) || isPausedValue(r.oldValue)) continue;
      const level = /camp|camap/i.test(r.changeType) ? "CAMPAIGN" : /ad ?group/i.test(r.changeType) ? "AD_GROUP" : /product/i.test(r.changeType) ? "PRODUCT_AD" : "TARGET";
      // A campaign pause outranks pausing one target; otherwise keep the latest.
      if (!pause || (level === "CAMPAIGN" && pause.level !== "CAMPAIGN") || (level === pause.level && date > pause.date)) {
        pause = { level, date, newValue: String(r.newValue), targeting: r.targeting || null };
      }
      continue;
    }
    const oldV = num(r.oldValue);
    const newV = num(r.newValue);
    if (oldV === null || newV === null) continue;
    if (cat === "PLACEMENT") {
      const points = newV - oldV; // placement multipliers are percentages already
      if (points >= T.PLACEMENT_RAISE && (!placementRaise || points > placementRaise.points)) {
        placementRaise = { date, oldValue: oldV, newValue: newV, points: round(points, 1), placement: String(r.changeType).replace(/^update\s+/i, "").replace(/\s*placement bid$/i, "") };
      }
      continue;
    }
    if (cat !== "BID" || oldV <= 0) continue;
    const pct = round(((newV - oldV) / oldV) * 100, 1);
    if (pct <= T.BID_CUT) {
      bidCutCount += 1;
      if (!bidCut || pct < bidCut.pct) bidCut = { date, oldValue: oldV, newValue: newV, pct, targeting: r.targeting || null };
    } else if (pct >= T.BID_RAISE) {
      bidRaiseCount += 1;
      if (!bidRaise || pct > bidRaise.pct) bidRaise = { date, oldValue: oldV, newValue: newV, pct, targeting: r.targeting || null };
    }
  }
  if (bidCut) bidCut.count = bidCutCount;
  if (bidRaise) bidRaise.count = bidRaiseCount;
  return { pause, bidCut, bidRaise, placementRaise };
}

// ── Price / Buy Box snapshots ──────────────────────────────────────────────────
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/**
 * From daily OWN snapshots of one ASIN: our average price and Buy Box share in each window.
 * rows: [{ date, ourPrice, weHaveBuyBox }]
 */
function summarizeOwnSnapshots(rows = [], windows) {
  const inW = (r, w) => r.date >= w.start && r.date <= w.end;
  const side = (w) => {
    const rs = rows.filter((r) => inW(r, w));
    const prices = rs.map((r) => Number(r.ourPrice)).filter((n) => Number.isFinite(n) && n > 0);
    const bb = rs.filter((r) => typeof r.weHaveBuyBox === "boolean");
    return {
      price: prices.length ? round(avg(prices)) : null,
      buyBoxShare: bb.length ? round((bb.filter((r) => r.weHaveBuyBox).length / bb.length) * 100, 0) : null,
      lastBuyBox: bb.length ? bb.sort((a, b) => (a.date < b.date ? -1 : 1))[bb.length - 1].weHaveBuyBox : null,
    };
  };
  const prior = side(windows.prior);
  const current = side(windows.current);
  const priceDelta = pctDelta(current.price, prior.price);
  return {
    prior,
    current,
    priceRaised: priceDelta !== null && prior.price !== null && priceDelta >= T.OUR_PRICE_RAISE ? { from: prior.price, to: current.price, pct: priceDelta } : null,
    // Lost: held it most days before, and holds it on fewer than half the days now.
    buyBoxLost: prior.buyBoxShare !== null && current.buyBoxShare !== null && prior.buyBoxShare >= 50 && current.buyBoxShare < 50 ? { priorShare: prior.buyBoxShare, currentShare: current.buyBoxShare } : null,
  };
}

/**
 * Rival products' price change: average % change across rivals seen in both windows.
 * rows: [{ asin, date, price }]
 */
function summarizeRivalPrices(rows = [], windows) {
  const byAsin = new Map();
  for (const r of rows) {
    const price = Number(r.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const key = r.asin;
    if (!byAsin.has(key)) byAsin.set(key, { prior: [], current: [] });
    if (r.date >= windows.prior.start && r.date <= windows.prior.end) byAsin.get(key).prior.push(price);
    else if (r.date >= windows.current.start && r.date <= windows.current.end) byAsin.get(key).current.push(price);
  }
  const changes = [];
  for (const [asin, v] of byAsin) {
    if (!v.prior.length || !v.current.length) continue;
    changes.push({ asin, pct: pctDelta(avg(v.current), avg(v.prior)) });
  }
  if (!changes.length) return null;
  const avgPct = round(avg(changes.map((c) => c.pct)), 1);
  const cutters = changes.filter((c) => c.pct <= T.RIVAL_PRICE_CUT).length;
  return { rivals: changes.length, avgPct, cutters, priceCut: avgPct <= T.RIVAL_PRICE_CUT ? { avgPct, cutters, rivals: changes.length } : null };
}

// ── Root cause ─────────────────────────────────────────────────────────────────
/**
 * Pick the root cause for a pattern from the evidence.
 * evidence: { changes, own, rivals, outOfStock, campaignStatus, waste, budget }
 * Returns { confidence: "CONFIRMED" | "LIKELY", code, params, supporting: [{ code, params }] }
 * The frontend turns code + params into translated text.
 */
function explainRootCause(pattern, m, ev = {}) {
  const ch = ev.changes || {};
  const own = ev.own || {};
  const found = [];
  const add = (code, params = {}) => found.push({ code, params });

  if (pattern === "TRAFFIC_BLACKOUT") {
    const status = String(ev.campaignStatus || "").toUpperCase();
    if (ch.pause) add(ch.pause.level === "CAMPAIGN" ? "CAMPAIGN_PAUSED" : "TARGET_PAUSED", ch.pause);
    else if (status === "PAUSED" || status === "ARCHIVED") add("CAMPAIGN_PAUSED", { level: "CAMPAIGN", newValue: status, date: null });
    if (ev.outOfStock) add("OUT_OF_STOCK", ev.outOfStock);
    if (own.buyBoxLost) add("BUY_BOX_LOST", own.buyBoxLost);
    if (ch.bidCut) add("BID_CUT", ch.bidCut);
    if (!found.length) return { confidence: "LIKELY", code: "OUTBID_OR_SUPPRESSED", params: { impressionsDelta: m.impressions.delta }, supporting: [] };
  } else if (pattern === "BLEEDING_AD") {
    if (ev.waste && ev.waste.terms > 0) add("WASTED_SEARCH_TERMS", ev.waste);
    if (own.priceRaised) add("PRICE_RAISED", own.priceRaised);
    if (!found.length) return { confidence: "LIKELY", code: "LISTING_FRICTION", params: { cvrDelta: m.cvr.delta }, supporting: [] };
  } else if (pattern === "BIDDING_WAR") {
    if (ch.bidRaise) add("BID_RAISED", ch.bidRaise);
    if (ch.placementRaise) add("PLACEMENT_RAISED", ch.placementRaise);
    if (!found.length) return { confidence: "LIKELY", code: "COMPETITOR_BIDS", params: { cpcDelta: m.cpc.delta }, supporting: [] };
  } else if (pattern === "AD_FATIGUE") {
    if (ev.rivals && ev.rivals.priceCut) add("RIVAL_PRICE_CUT", ev.rivals.priceCut);
    if (own.buyBoxLost) add("BUY_BOX_LOST", own.buyBoxLost);
    if (!found.length) return { confidence: "LIKELY", code: "LOW_CLICK_APPEAL", params: { ctrDelta: m.ctr.delta }, supporting: [] };
  } else if (pattern === "BUDGET_STARVATION") {
    return { confidence: "CONFIRMED", code: "BUDGET_RUNS_OUT", params: { ...(ev.budget || {}), acos: m.acos.current }, supporting: [] };
  } else {
    return { confidence: "LIKELY", code: "GENERAL_DECLINE", params: { salesDelta: m.sales.delta, acosDelta: m.acos.delta }, supporting: [] };
  }
  const [main, ...rest] = found;
  return { confidence: "CONFIRMED", code: main.code, params: main.params, supporting: rest };
}

/** Sales lost versus the earlier period, plus money spent on search terms with no orders. */
function estimateLoss(m, wastedSpend = 0) {
  return round(Math.max(0, (m.sales.prior || 0) - (m.sales.current || 0)) + (Number(wastedSpend) || 0));
}

/** Spend at or above which a 0-order search term counts as waste: the cost of ~10 clicks. */
function wasteSpendLimit(m) {
  const cpc = m.cpc.current || m.cpc.prior || 0;
  return round(cpc * T.WASTE_CLICKS_EQUIVALENT);
}

/** Order alerts: biggest estimated loss first; on a tie, the more urgent pattern. */
function sortAlerts(alerts) {
  return alerts.sort((a, b) => b.estimatedLoss - a.estimatedLoss || PATTERNS[a.scenarioKey].priority - PATTERNS[b.scenarioKey].priority);
}

function summarize(alerts) {
  return {
    totalDeclines: alerts.length,
    criticalCount: alerts.filter((a) => a.severity === "CRITICAL").length,
    warningCount: alerts.filter((a) => a.severity === "WARNING").length,
    totalEstimatedLoss: round(alerts.reduce((s, a) => s + (a.estimatedLoss || 0), 0)),
    byScenario: Object.keys(PATTERNS).reduce((acc, k) => ({ ...acc, [k]: alerts.filter((a) => a.scenarioKey === k).length }), {}),
  };
}

module.exports = {
  WINDOW_OPTIONS,
  DEFAULT_WINDOW,
  LAG_BUFFER_DAYS,
  MIN_PRIOR_CLICKS,
  MIN_PRIOR_SPEND,
  THRESHOLDS: T,
  PATTERNS,
  normalizeWindow,
  buildEvaluationWindows,
  pctDelta,
  deriveMetrics,
  compareMetrics,
  hasEnoughVolume,
  isGoodAcos,
  classifyPattern,
  categorizeChange,
  summarizeChanges,
  summarizeOwnSnapshots,
  summarizeRivalPrices,
  explainRootCause,
  estimateLoss,
  wasteSpendLimit,
  sortAlerts,
  summarize,
};
