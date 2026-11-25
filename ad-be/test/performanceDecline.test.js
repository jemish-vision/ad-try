const assert = require("node:assert/strict");
const path = require("node:path");
const { test, describe, beforeEach } = require("node:test");

const root = path.join(__dirname, "..");
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

// ── Fakes: redis, logger and every model the controller reads ──
const cache = new Map();
const cacheCalls = { get: 0, set: [] };
stub("api-server/services/redis.service.js", {
  getCacheWithLog: async (k) => {
    cacheCalls.get += 1;
    return cache.get(k) ?? null;
  },
  setCacheWithLog: async (k, v, ttl) => {
    cacheCalls.set.push({ k, ttl });
    cache.set(k, v);
  },
});
stub("winston/utility/logger.js", { write_logs: { error: () => {}, info: () => {} } });

const lean = (data) => ({ select: () => ({ lean: async () => (typeof data === "function" ? data() : data) }), lean: async () => data });
const db = { profile: { timezone: "UTC" }, setting: null, changes: [], budget: [], oos: [], own: [], rival: [], products: [], findCalls: [] };
const fakeModel = (name, { find, findOne, aggregate } = {}) => ({
  find: (q) => {
    db.findCalls.push({ name, q });
    return lean(() => (find ? find(q) : []));
  },
  findOne: (q) => lean(() => (findOne ? findOne(q) : null)),
  aggregate: (p) => {
    const run = async () => (aggregate ? aggregate(p) : []);
    const promise = run();
    promise.allowDiskUse = () => run();
    return promise;
  },
});
stub("api-server/models/profiles.model.js", fakeModel("profile", { findOne: () => db.profile }));
stub("api-server/models/camapignSetting.model.js", fakeModel("setting", { findOne: () => db.setting }));
stub("api-server/models/campaignChangeHistory.model.js", fakeModel("changes", { find: () => db.changes }));
stub("api-server/models/campaignOutOfBudgetHistory.model.js", fakeModel("budget", { aggregate: () => db.budget }));
stub("api-server/models/outOfStockAd.model.js", fakeModel("oos", { find: () => db.oos }));
stub("api-server/models/asinSnapshot.model.js", fakeModel("snap", { find: (q) => (q.kind === "OWN" ? db.own : db.rival) }));
stub("api-server/models/product.model.js", fakeModel("product", { aggregate: () => db.products }));

const pd = require("../api-server/services/performanceDecline.service");
const controller = require("../api-server/controllers/performanceDecline.controller");

// totals helper: prior / current period sums
const tot = (impressions, clicks, spend, sales, orders, timeInBudget) => ({ impressions, clicks, spend, sales, orders, timeInBudget });
const metrics = (current, prior) => pd.compareMetrics(current, prior);

describe("evaluation windows (2-day attribution buffer)", () => {
  const now = new Date("2026-11-24T10:00:00Z");

  test("14 days on Nov 24: current Nov 9–22, prior Oct 26–Nov 8, today and yesterday excluded", () => {
    const w = pd.buildEvaluationWindows(14, "UTC", now);
    assert.deepEqual(w.current, { start: "2026-11-09", end: "2026-11-22" });
    assert.deepEqual(w.prior, { start: "2026-10-26", end: "2026-11-08" });
    assert.deepEqual(w.bufferedDays, ["2026-11-23", "2026-11-24"]);
  });

  test("7 and 30 days are full, back-to-back windows", () => {
    for (const days of [7, 30]) {
      const w = pd.buildEvaluationWindows(days, "UTC", now);
      const len = (r) => Math.round((new Date(r.end) - new Date(r.start)) / 86400000) + 1;
      assert.equal(len(w.current), days);
      assert.equal(len(w.prior), days);
      assert.equal(Math.round((new Date(w.current.start) - new Date(w.prior.end)) / 86400000), 1);
      assert.equal(w.current.end, "2026-11-22");
    }
  });

  test("uses the profile's timezone for 'today'", () => {
    // 2026-11-24 02:00 UTC is still Nov 23 in Los Angeles
    const w = pd.buildEvaluationWindows(7, "America/Los_Angeles", new Date("2026-11-24T02:00:00Z"));
    assert.equal(w.today, "2026-11-23");
    assert.equal(w.current.end, "2026-11-21");
  });

  test("anything other than 7/14/30 falls back to 14", () => {
    assert.equal(pd.buildEvaluationWindows(9, "UTC", now).windowDays, 14);
    assert.equal(pd.buildEvaluationWindows("30", "UTC", now).windowDays, 30);
  });

  test("custom date range sets current and exact prior period of equal length", () => {
    const w = pd.buildEvaluationWindows(14, "UTC", now, { startDate: "2026-11-01", endDate: "2026-11-15" });
    assert.equal(w.isCustom, true);
    assert.equal(w.windowDays, 15);
    assert.deepEqual(w.current, { start: "2026-11-01", end: "2026-11-15" });
    assert.deepEqual(w.prior, { start: "2026-10-17", end: "2026-10-31" });
  });
});

describe("metric deltas", () => {
  test("% change, 0 when the earlier value is 0, null when unknown", () => {
    assert.equal(pd.pctDelta(50, 100), -50);
    assert.equal(pd.pctDelta(10, 0), 0);
    assert.equal(pd.pctDelta(null, 5), null);
  });

  test("ACoS, CVR, CPC, CTR are null instead of dividing by zero", () => {
    const m = pd.deriveMetrics(tot(0, 0, 10, 0, 0));
    assert.equal(m.acos, null);
    assert.equal(m.cvr, null);
    assert.equal(m.cpc, null);
    assert.equal(m.ctr, null);
    const ok = pd.deriveMetrics(tot(1000, 50, 100, 400, 5));
    assert.equal(ok.acos, 25);
    assert.equal(ok.cvr, 10);
    assert.equal(ok.cpc, 2);
    assert.equal(ok.ctr, 5);
  });

  test("small campaigns are skipped: under 20 clicks and under 30 spend", () => {
    assert.equal(pd.hasEnoughVolume(tot(100, 19, 29, 0, 0)), false);
    assert.equal(pd.hasEnoughVolume(tot(100, 20, 5, 0, 0)), true);
    assert.equal(pd.hasEnoughVolume(tot(100, 2, 30, 0, 0)), true);
  });
});

describe("pattern classifier", () => {
  const prior = tot(10000, 200, 400, 2000, 40); // CTR 2%, CPC 2, CVR 20%, ACoS 20%

  test("Traffic Blackout: impressions and clicks both down 60%+", () => {
    assert.equal(pd.classifyPattern(metrics(tot(3000, 60, 120, 500, 10), prior)), "TRAFFIC_BLACKOUT");
  });

  test("only impressions down 60% is not a Blackout", () => {
    assert.notEqual(pd.classifyPattern(metrics(tot(3000, 150, 300, 1500, 30), prior)), "TRAFFIC_BLACKOUT");
  });

  test("Bleeding Ad: orders -30%+, CVR -35%+, clicks and spend steady", () => {
    assert.equal(pd.classifyPattern(metrics(tot(10000, 200, 400, 1000, 20), prior)), "BLEEDING_AD");
  });

  test("orders and CVR down but clicks fell 20% is not a Bleeding Ad", () => {
    assert.notEqual(pd.classifyPattern(metrics(tot(10000, 160, 400, 900, 10), prior)), "BLEEDING_AD");
  });

  test("Bidding War: CPC +25%+, clicks flat, ACoS worse", () => {
    // CPC 2 -> 2.6, clicks flat, sales flat -> ACoS 20% -> 26%
    assert.equal(pd.classifyPattern(metrics(tot(10000, 200, 520, 2000, 40), prior)), "BIDDING_WAR");
  });

  test("CPC up but clicks up 30% is not a Bidding War", () => {
    assert.notEqual(pd.classifyPattern(metrics(tot(13000, 260, 676, 2000, 40), prior)), "BIDDING_WAR");
  });

  test("Ad Fatigue: CTR -30%+ with impressions steady", () => {
    // impressions +10%, clicks -40% -> CTR 2% -> 1.09%
    assert.equal(pd.classifyPattern(metrics(tot(11000, 120, 240, 1300, 26), prior)), "AD_FATIGUE");
  });

  test("Budget Starvation: under 65% in budget with good ACoS", () => {
    const m = metrics(tot(10000, 200, 400, 2000, 40), prior); // nothing declined
    assert.equal(pd.classifyPattern(m, { timeInBudget: 48 }), "BUDGET_STARVATION");
    assert.equal(pd.classifyPattern(m, { timeInBudget: 70 }), null);
  });

  test("good ACoS: target ACoS when set, otherwise max(30%, earlier × 1.05)", () => {
    const m = metrics(tot(10000, 200, 500, 2000, 40), prior); // ACoS 25%
    assert.equal(pd.isGoodAcos(m, null), true); // 25 <= max(30, 21)
    assert.equal(pd.isGoodAcos(m, 20), false); // target 20% wins
    const high = metrics(tot(10000, 200, 760, 2000, 40), tot(10000, 200, 740, 2000, 40)); // 38% now vs 37% before: within +5% -> still good
    assert.equal(pd.isGoodAcos(high, null), true);
    const worse = metrics(tot(10000, 200, 800, 2000, 40), tot(10000, 200, 740, 2000, 40)); // 40% vs 37%: worse than +5%, above 30%
    assert.equal(pd.isGoodAcos(worse, null), false);
  });

  test("General Decay: sales down 20%+ matching nothing else", () => {
    assert.equal(pd.classifyPattern(metrics(tot(9500, 190, 380, 1500, 34), prior)), "GENERAL_DECAY");
  });

  test("healthy campaign is not flagged", () => {
    assert.equal(pd.classifyPattern(metrics(tot(10200, 205, 410, 2100, 41), prior)), null);
  });

  test("precedence: Blackout wins over everything else that also matches", () => {
    const m = metrics(tot(1000, 10, 40, 0, 0), prior);
    assert.equal(pd.classifyPattern(m, { timeInBudget: 30 }), "TRAFFIC_BLACKOUT");
  });

  test("precedence: Bleeding Ad wins over Bidding War", () => {
    // CPC 2 -> 2.5 and ACoS worse, but orders/CVR collapsed with steady clicks
    assert.equal(pd.classifyPattern(metrics(tot(10000, 200, 500, 800, 20), prior)), "BLEEDING_AD");
  });
});

describe("change history evidence", () => {
  const at = (d) => new Date(`${d}T12:00:00Z`);

  test("matches misspelled and lower-case change types", () => {
    const s = pd.summarizeChanges([
      { changeType: "Update Camapign Status", oldValue: "ENABLED", newValue: "PAUSED", createdAt: at("2026-11-12") },
      { changeType: "update targeting bid", oldValue: "1.40", newValue: "0.90", createdAt: at("2026-11-18"), targeting: "roof bag" },
      { changeType: "Update Targeting Bid", oldValue: "1.00", newValue: "1.50", createdAt: at("2026-11-15") },
      { changeType: "Update Top of Search Placement Bid", oldValue: "20", newValue: "80", createdAt: at("2026-11-16") },
    ]);
    assert.equal(s.pause.level, "CAMPAIGN");
    assert.equal(s.bidCut.pct, -35.7);
    assert.equal(s.bidCut.oldValue, 1.4);
    assert.equal(s.bidCut.targeting, "roof bag");
    assert.equal(s.bidRaise.pct, 50);
    assert.equal(s.placementRaise.points, 60);
    assert.equal(s.placementRaise.placement, "Top of Search");
  });

  test("dayparting bid moves, small cuts, budget status and un-pauses are ignored", () => {
    const s = pd.summarizeChanges([
      { changeType: "Cron Job: Dayparting rule updated a targeting bid", oldValue: "2", newValue: "0.5" },
      { changeType: "Update Targeting Bid", oldValue: "1.00", newValue: "0.90" },
      { changeType: "Update Campaign Budget Status", oldValue: "ENABLED", newValue: "PAUSED" },
      { changeType: "Update Campaign Status", oldValue: "PAUSED", newValue: "ENABLED" },
      { changeType: "Update Targeting Bid", oldValue: "—", newValue: "1" },
    ]);
    assert.deepEqual(s, { pause: null, bidCut: null, bidRaise: null, placementRaise: null });
  });

  test("a campaign pause outranks a target pause", () => {
    const s = pd.summarizeChanges([
      { changeType: "Update Campaign Status", oldValue: "ENABLED", newValue: "paused", createdAt: at("2026-11-10") },
      { changeType: "Update Targeting Status", oldValue: "ENABLED", newValue: "PAUSED", createdAt: at("2026-11-20") },
    ]);
    assert.equal(s.pause.level, "CAMPAIGN");
  });
});

describe("price and Buy Box snapshots", () => {
  const w = pd.buildEvaluationWindows(7, "UTC", new Date("2026-11-24T10:00:00Z")); // prior Nov 9–15, current Nov 16–22

  test("our price raise and Buy Box loss", () => {
    const rows = [
      { date: "2026-11-10", ourPrice: 100, weHaveBuyBox: true },
      { date: "2026-11-12", ourPrice: 100, weHaveBuyBox: true },
      { date: "2026-11-17", ourPrice: 110, weHaveBuyBox: false },
      { date: "2026-11-19", ourPrice: 110, weHaveBuyBox: false },
      { date: "2026-11-23", ourPrice: 999, weHaveBuyBox: true }, // buffer day — ignored
    ];
    const s = pd.summarizeOwnSnapshots(rows, w);
    assert.deepEqual(s.priceRaised, { from: 100, to: 110, pct: 10 });
    assert.deepEqual(s.buyBoxLost, { priorShare: 100, currentShare: 0 });
  });

  test("no data means no evidence", () => {
    const s = pd.summarizeOwnSnapshots([], w);
    assert.equal(s.priceRaised, null);
    assert.equal(s.buyBoxLost, null);
  });

  test("rival price cut: average change across rivals seen in both windows", () => {
    const r = pd.summarizeRivalPrices(
      [
        { asin: "R1", date: "2026-11-10", price: 100 },
        { asin: "R1", date: "2026-11-18", price: 80 },
        { asin: "R2", date: "2026-11-10", price: 50 },
        { asin: "R2", date: "2026-11-18", price: 50 },
        { asin: "R3", date: "2026-11-18", price: 10 }, // only in one window
      ],
      w,
    );
    assert.deepEqual(r.priceCut, { avgPct: -10, cutters: 1, rivals: 2 });
  });
});

describe("root cause", () => {
  const m = metrics(tot(3000, 60, 120, 500, 10), tot(10000, 200, 400, 2000, 40));

  test("Blackout: pause is the main cause, others are supporting", () => {
    const rc = pd.explainRootCause("TRAFFIC_BLACKOUT", m, {
      changes: { pause: { level: "CAMPAIGN", date: "2026-11-12" }, bidCut: { pct: -40 } },
      outOfStock: { asin: "B0X" },
    });
    assert.equal(rc.confidence, "CONFIRMED");
    assert.equal(rc.code, "CAMPAIGN_PAUSED");
    assert.deepEqual(rc.supporting.map((s) => s.code), ["OUT_OF_STOCK", "BID_CUT"]);
  });

  test("Blackout: a paused campaign with no history row is still confirmed", () => {
    assert.equal(pd.explainRootCause("TRAFFIC_BLACKOUT", m, { campaignStatus: "PAUSED" }).code, "CAMPAIGN_PAUSED");
  });

  test("no evidence gives the 'likely' cause for each pattern", () => {
    const likely = (p) => pd.explainRootCause(p, m, {});
    assert.deepEqual(likely("TRAFFIC_BLACKOUT"), { confidence: "LIKELY", code: "OUTBID_OR_SUPPRESSED", params: { impressionsDelta: m.impressions.delta }, supporting: [] });
    assert.equal(likely("BLEEDING_AD").code, "LISTING_FRICTION");
    assert.equal(likely("BIDDING_WAR").code, "COMPETITOR_BIDS");
    assert.equal(likely("AD_FATIGUE").code, "LOW_CLICK_APPEAL");
    assert.equal(likely("GENERAL_DECAY").code, "GENERAL_DECLINE");
  });

  test("Bleeding Ad: wasted search terms, then price raise", () => {
    const rc = pd.explainRootCause("BLEEDING_AD", m, { waste: { terms: 3, spend: 90 }, own: { priceRaised: { pct: 12 } } });
    assert.equal(rc.code, "WASTED_SEARCH_TERMS");
    assert.equal(rc.supporting[0].code, "PRICE_RAISED");
  });

  test("Bidding War: bid raise or placement raise", () => {
    assert.equal(pd.explainRootCause("BIDDING_WAR", m, { changes: { placementRaise: { points: 50 } } }).code, "PLACEMENT_RAISED");
  });

  test("Ad Fatigue: rival price cut, Buy Box loss", () => {
    assert.equal(pd.explainRootCause("AD_FATIGUE", m, { own: { buyBoxLost: { currentShare: 0 } } }).code, "BUY_BOX_LOST");
  });

  test("loss = sales lost + wasted spend; never negative", () => {
    assert.equal(pd.estimateLoss(m, 25.5), 1525.5);
    assert.equal(pd.estimateLoss(metrics(tot(1, 1, 1, 900, 1), tot(1, 1, 1, 100, 1)), 0), 0);
  });

  test("waste limit is the cost of 10 clicks in the profile's currency", () => {
    assert.equal(pd.wasteSpendLimit(m), 20); // CPC 2
  });
});

describe("getPerformanceDeclineAlerts controller", () => {
  // Campaign 1: blackout (paused on Nov 12). Campaign 2: bleeding with wasted terms.
  // Campaign 3: healthy. Campaign 4: too small to judge.
  const campaignRows = [
    { _id: { campaignId: 1, isCurrent: false }, name: "Roof Bag", status: "ENABLED", impressions: 12400, clicks: 180, spend: 320, sales: 890, orders: 20 },
    { _id: { campaignId: 1, isCurrent: true }, name: "Roof Bag", status: "PAUSED", impressions: 3200, clicks: 42, spend: 84, sales: 120, orders: 2 },
    { _id: { campaignId: 2, isCurrent: false }, name: "Bottle", status: "ENABLED", impressions: 10000, clicks: 200, spend: 400, sales: 2000, orders: 40 },
    { _id: { campaignId: 2, isCurrent: true }, name: "Bottle", status: "ENABLED", impressions: 10000, clicks: 200, spend: 420, sales: 1000, orders: 20 },
    { _id: { campaignId: 3, isCurrent: false }, name: "Healthy", status: "ENABLED", impressions: 5000, clicks: 100, spend: 200, sales: 1000, orders: 20 },
    { _id: { campaignId: 3, isCurrent: true }, name: "Healthy", status: "ENABLED", impressions: 5100, clicks: 102, spend: 204, sales: 1010, orders: 20 },
    { _id: { campaignId: 4, isCurrent: false }, name: "Tiny", status: "ENABLED", impressions: 300, clicks: 5, spend: 4, sales: 50, orders: 1 },
    { _id: { campaignId: 4, isCurrent: true }, name: "Tiny", status: "ENABLED", impressions: 10, clicks: 0, spend: 0, sales: 0, orders: 0 },
  ];
  const models = {
    adTypeCampaignSchema: fakeModel("campaign", { aggregate: () => campaignRows }),
    adTypeProductAdsSchema: fakeModel("productAds", { aggregate: () => [{ _id: { campaignId: 1, asin: "B09V7YZ2RP" }, sku: "RG-HP68", spend: 300 }] }),
    // Wasted search terms for campaign 2 (CPC 2.1 -> limit 21): two count, one is under the limit, one had orders.
    adTypeSearchTermSchema: fakeModel("searchTerm", {
      aggregate: () => [
        { _id: { campaignId: 2, searchTerm: "free bottle" }, spend: 60, orders: 0 },
        { _id: { campaignId: 2, searchTerm: "bottle cheap" }, spend: 30, orders: 0 },
        { _id: { campaignId: 2, searchTerm: "bottle tiny" }, spend: 5, orders: 0 },
      ],
    }),
  };

  const call = async (body = {}, extra = {}) => {
    const req = { config: { configId: "64b7f0c2a1b2c3d4e5f60718" }, body: { profileId: 111, windowDays: 14, ...body }, adTypes: ["SP"], models, ...extra };
    let status;
    let json;
    const res = { status: (s) => ((status = s), res), json: (j) => ((json = j), res) };
    await controller.getPerformanceDeclineAlerts(req, res);
    return { status, json };
  };

  beforeEach(() => {
    cache.clear();
    cacheCalls.get = 0;
    cacheCalls.set = [];
    db.findCalls = [];
    db.changes = [{ changeLevel: 1, changeType: "Update Camapign Status", oldValue: "ENABLED", newValue: "PAUSED", createdAt: new Date() }];
    db.oos = [];
    db.products = [{ _id: "B09V7YZ2RP", title: "Extra Cargo Roof Bag", imageUrl: "https://img/x.jpg", sku: "RG-HP68" }];
  });

  test("flags the blackout and the bleeding ad, sorted by estimated loss", async () => {
    const { status, json } = await call();
    assert.equal(status, 200);
    assert.equal(json.isSuccess, true);
    const { alerts, summary } = json.data;
    assert.deepEqual(alerts.map((a) => [a.campaignId, a.scenarioKey]), [[2, "BLEEDING_AD"], [1, "TRAFFIC_BLACKOUT"]]);
    assert.deepEqual([summary.totalDeclines, summary.criticalCount, summary.warningCount], [2, 2, 0]);

    const bleed = alerts[0];
    assert.equal(bleed.rootCause.code, "WASTED_SEARCH_TERMS");
    assert.equal(bleed.rootCause.params.terms, 2);
    assert.equal(bleed.wastedSpend, 90);
    assert.equal(bleed.estimatedLoss, 1090); // 1000 sales lost + 90 waste

    const blackout = alerts[1];
    assert.equal(blackout.rootCause.code, "CAMPAIGN_PAUSED");
    assert.equal(blackout.productContext.asin, "B09V7YZ2RP");
    assert.equal(blackout.productContext.title, "Extra Cargo Roof Bag");
    assert.equal(blackout.metrics.impressions.delta, -74.2);
    assert.equal(blackout.estimatedLoss, 770);
    assert.equal(summary.totalEstimatedLoss, 1860);
  });

  test("change history is only read for flagged campaigns", async () => {
    await call();
    const q = db.findCalls.find((c) => c.name === "changes").q;
    assert.deepEqual(q.changeLevel.$in.sort(), [1, 2]);
  });

  test("limit slices the list but the summary counts all", async () => {
    const { json } = await call({ page: 1, limit: 1 });
    assert.equal(json.data.alerts.length, 1);
    assert.equal(json.data.summary.totalDeclines, 2);
    assert.deepEqual(json.data.pagination, {
      page: 1,
      limit: 1,
      totalRecords: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });

    const page2 = await call({ page: 2, limit: 1 });
    assert.equal(page2.json.data.alerts.length, 1);
    assert.notEqual(page2.json.data.alerts[0].campaignId, json.data.alerts[0].campaignId);
    assert.deepEqual(page2.json.data.pagination, {
      page: 2,
      limit: 1,
      totalRecords: 2,
      totalPages: 2,
      hasNextPage: false,
      hasPrevPage: true,
    });
  });

  test("out-of-stock ASIN becomes a supporting cause for the blackout", async () => {
    db.oos = [{ asin: "B09V7YZ2RP", availability: "OUT_OF_STOCK", title: "Roof Bag", campaigns: [{ campaignId: 1 }] }];
    const { json } = await call();
    const blackout = json.data.alerts.find((a) => a.campaignId === 1);
    assert.deepEqual(blackout.rootCause.supporting.map((s) => s.code), ["OUT_OF_STOCK"]);
  });

  test("result is cached for 15 minutes and served from cache next time", async () => {
    const first = await call();
    assert.equal(cacheCalls.set.length, 1);
    assert.equal(cacheCalls.set[0].ttl, 900);
    assert.match(cacheCalls.set[0].k, /^perf_decline_all:64b7f0c2a1b2c3d4e5f60718:111:SP:14:\d{4}-\d{2}-\d{2}$/);
    db.changes = []; // would change the answer if it were recomputed
    const second = await call();
    assert.equal(cacheCalls.set.length, 1);
    assert.deepEqual(second.json, first.json);
  });

  test("severity filter returns only matching alerts but keeps overall summary counts", async () => {
    const critRes = await call({ severity: "CRITICAL" });
    assert.equal(critRes.json.data.alerts.length, 2);
    assert.equal(critRes.json.data.summary.totalDeclines, 2);
    assert.equal(critRes.json.data.summary.criticalCount, 2);
    assert.equal(critRes.json.data.activeSeverity, "CRITICAL");
    assert.equal(critRes.json.data.pagination.totalRecords, 2);

    const warnRes = await call({ severity: "WARNING" });
    assert.equal(warnRes.json.data.alerts.length, 0);
    // Summary still preserves total declines & critical count
    assert.equal(warnRes.json.data.summary.totalDeclines, 2);
    assert.equal(warnRes.json.data.summary.criticalCount, 2);
    assert.equal(warnRes.json.data.activeSeverity, "WARNING");
    assert.equal(warnRes.json.data.pagination.totalRecords, 0);
  });

  test("refresh: true recomputes instead of reading the cache", async () => {
    await call();
    db.changes = [];
    const { json } = await call({ refresh: true });
    assert.equal(json.data.alerts.find((a) => a.campaignId === 1).rootCause.code, "CAMPAIGN_PAUSED"); // still paused: status is PAUSED
    assert.equal(cacheCalls.set.length, 2);
  });

  test("different windows use different cache entries", async () => {
    await call({ windowDays: 7 });
    await call({ windowDays: 30 });
    assert.equal(new Set(cacheCalls.set.map((c) => c.k)).size, 2);
  });

  test("custom date range queries and caches under custom key", async () => {
    const { json } = await call({ startDate: "2026-11-01", endDate: "2026-11-15" });
    assert.equal(json.data.evaluationWindow.isCustom, true);
    assert.equal(json.data.windowDays, 15);
    assert.deepEqual(json.data.evaluationWindow.current, { start: "2026-11-01", end: "2026-11-15" });
    assert.deepEqual(json.data.evaluationWindow.prior, { start: "2026-10-17", end: "2026-10-31" });
    assert.match(cacheCalls.set[0].k, /^perf_decline_all:64b7f0c2a1b2c3d4e5f60718:111:SP:custom_2026-11-01_2026-11-15:\d{4}-\d{2}-\d{2}$/);
  });

  test("missing profileId is rejected", async () => {
    const { status, json } = await call({ profileId: undefined });
    assert.equal(status, 203);
    assert.equal(json.isSuccess, false);
  });

  test("no declines gives an empty, healthy result", async () => {
    const healthy = { ...models, adTypeCampaignSchema: fakeModel("campaign", { aggregate: () => campaignRows.filter((r) => r._id.campaignId === 3) }) };
    const { json } = await call({}, { models: healthy });
    assert.deepEqual(json.data.alerts, []);
    assert.equal(json.data.summary.totalDeclines, 0);
  });

  test("'All' ad types runs each type and tags alerts with their type", async () => {
    const sd = { adTypeCampaignSchema: fakeModel("sdCampaign", { aggregate: () => campaignRows.filter((r) => r._id.campaignId === 1).map((r) => ({ ...r, _id: { ...r._id, campaignId: 9 } })) }) };
    const { json } = await call({}, { adTypes: ["SP", "SD"], modelsByType: { SP: models, SD: sd } });
    const types = json.data.alerts.map((a) => `${a.adType}:${a.campaignId}`).sort();
    assert.deepEqual(types, ["SD:9", "SP:1", "SP:2"]);
  });
});
