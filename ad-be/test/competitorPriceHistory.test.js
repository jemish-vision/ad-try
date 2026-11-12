const assert = require("node:assert/strict");
const { test, describe } = require("node:test");

const svc = require("../api-server/services/automation/asinSnapshot.service");
const { summarizeOwnHistory, summarizeRivalHistory } = require("../api-server/helpers/priceHistory.helper");
const AsinSnapshot = require("../api-server/models/asinSnapshot.model");
const Organization = require("../api-server/models/organization.model");

describe("retention", () => {
  test("only 7/14/30/60 are allowed; anything else falls back to 30", () => {
    assert.deepEqual([...svc.RETENTION_OPTIONS], [7, 14, 30, 60]);
    for (const d of [7, 14, 30, 60]) assert.equal(svc.normalizeRetentionDays(d), d);
    for (const d of [0, 1, 90, null, undefined, "abc"]) assert.equal(svc.normalizeRetentionDays(d), 30);
  });

  test("expiresAt = snapshotAt + retention days", () => {
    const at = new Date("2026-11-12T06:00:00Z");
    assert.equal(svc.computeExpiresAt(at, 7).toISOString(), "2026-11-19T06:00:00.000Z");
    assert.equal(svc.computeExpiresAt(at, 60).toISOString(), "2027-01-11T06:00:00.000Z");
  });

  test("organization default retention is 30 and invalid values are rejected", () => {
    assert.equal(new Organization({ organizationName: "x", userId: "64b000000000000000000001" }).historyRetentionDays, 30);
    const bad = new Organization({ organizationName: "x", userId: "64b000000000000000000001", historyRetentionDays: 90 }).validateSync();
    assert.ok(bad?.errors?.historyRetentionDays);
  });

  test("snapshot model has a TTL index on expiresAt and a unique per-day key", () => {
    const idx = AsinSnapshot.schema.indexes();
    assert.ok(idx.some(([key, opts]) => key.expiresAt === 1 && opts.expireAfterSeconds === 0), "TTL index missing");
    assert.ok(idx.some(([key, opts]) => key.asin === 1 && key.date === 1 && key.kind === 1 && opts.unique), "unique index missing");
  });
});

describe("when a profile is due", () => {
  test("not before 06:00 local time", () => {
    // 05:30 IST
    assert.equal(svc.snapshotDateIfDue({ timezone: "Asia/Kolkata", now: new Date("2026-11-12T00:00:00Z") }), null);
  });
  test("due after 06:00 local, keyed by the local date", () => {
    // 06:30 IST on Nov 12
    assert.equal(svc.snapshotDateIfDue({ timezone: "Asia/Kolkata", now: new Date("2026-11-12T01:00:00Z") }), "2026-11-12");
  });
  test("not due again the same local day", () => {
    assert.equal(svc.snapshotDateIfDue({ timezone: "Asia/Kolkata", now: new Date("2026-11-12T10:00:00Z"), alreadySnapshottedDates: ["2026-11-12"] }), null);
  });
  test("uses the profile's own timezone (US profile at 06:30 PT)", () => {
    assert.equal(svc.snapshotDateIfDue({ timezone: "America/Los_Angeles", now: new Date("2026-11-12T14:30:00Z") }), "2026-11-12");
    assert.equal(svc.snapshotDateIfDue({ timezone: "America/Los_Angeles", now: new Date("2026-11-12T12:30:00Z") }), null);
  });
});

describe("own snapshot from getItemOffers payload", () => {
  const off = (o) => ({
    SellerId: o.id, MyOffer: !!o.mine, SubCondition: "new",
    ListingPrice: { Amount: o.p, CurrencyCode: "USD" }, Shipping: { Amount: o.s || 0, CurrencyCode: "USD" },
    IsFulfilledByAmazon: !!o.fba, IsBuyBoxWinner: !!o.bb, PrimeInformation: { IsPrime: !!o.fba },
    SellerFeedbackRating: { SellerPositiveFeedbackRating: 95, FeedbackCount: 10 },
  });
  const payload = {
    ASIN: "B0X",
    Summary: {
      TotalOfferCount: 3,
      NumberOfOffers: [{ condition: "new", OfferCount: 3 }],
      BuyBoxEligibleOffers: [{ condition: "new", OfferCount: 2 }],
      BuyBoxPrices: [{ condition: "New", LandedPrice: { Amount: 19.99 } }],
      LowestPrices: [
        { condition: "new", fulfillmentChannel: "Amazon", LandedPrice: { Amount: 19.99 } },
        { condition: "new", fulfillmentChannel: "Merchant", LandedPrice: { Amount: 18.5 } },
      ],
    },
    Offers: [off({ id: "ME", mine: true, p: 21 }), off({ id: "ATVPDKIKX0DER", p: 19.99, fba: true, bb: true }), off({ id: "X", p: 17, s: 1.5 })],
  };

  test("captures price, Buy Box, Amazon presence, lowest prices and counts", () => {
    const f = svc.buildOwnSnapshotFields({ offersPayload: payload, ourSellerId: "ME", marketplaceId: "ATVPDKIKX0DER" });
    assert.equal(f.ourPrice, 21);
    assert.equal(f.ourFulfillment, "FBM");
    assert.equal(f.hasActiveOffer, true);
    assert.equal(f.buyBoxPrice, 19.99);
    assert.equal(f.buyBoxSellerId, "ATVPDKIKX0DER");
    assert.equal(f.weHaveBuyBox, false);
    assert.equal(f.amazonSelling, true);
    assert.equal(f.lowestFbaPrice, 19.99);
    assert.equal(f.lowestFbmPrice, 18.5);
    assert.equal(f.offerCount, 3);
    assert.equal(f.buyBoxEligibleCount, 2);
  });

  test("Amazon presence is unknown (null) for marketplaces without a known retail seller id", () => {
    const f = svc.buildOwnSnapshotFields({ offersPayload: payload, ourSellerId: "ME", marketplaceId: "A21TJRUUN4KGV" });
    assert.equal(f.amazonSelling, null);
  });

  test("missing payload → no offer data", () => {
    assert.deepEqual(svc.buildOwnSnapshotFields({ offersPayload: undefined }), { hasActiveOffer: null });
  });
});

describe("rival selection", () => {
  const mk = (myAsin, asin, price, rank) => ({ myAsin, asin, price, classificationRanks: rank, brand: "B", classification: "Totes" });

  test("caps rivals per own ASIN, ranked first then cheapest, and skips priceless rivals", () => {
    const docs = [];
    for (let i = 0; i < 30; i++) docs.push(mk("OWN1", `R${i}`, 100 + i, i < 5 ? null : 1000 - i));
    docs.push(mk("OWN1", "NOPRICE", 0, 1));
    const out = svc.selectRivalsForSnapshot(docs, 20);
    assert.equal(out.length, 20);
    assert.ok(!out.some((r) => r.asin === "NOPRICE"));
    assert.equal(out[0].asin, "R29"); // best (lowest) rank first
    assert.ok(!out.some((r) => ["R0", "R1", "R2", "R3", "R4"].includes(r.asin)), "unranked rivals should come after ranked ones");
  });

  test("a rival shared by several own ASINs is stored once with all of them", () => {
    const out = svc.selectRivalsForSnapshot([mk("OWN1", "R1", 10, 5), mk("OWN2", "R1", 10, 5), mk("OWN2", "R2", 12, 9)]);
    assert.equal(out.length, 2);
    assert.deepEqual(out.find((r) => r.asin === "R1").forAsins.sort(), ["OWN1", "OWN2"]);
  });
});

describe("history summaries", () => {
  const day = (date, o) => ({ date, ...o });
  const own = [
    day("2026-11-01", { ourPrice: 20, buyBoxPrice: 20, weHaveBuyBox: true, buyBoxSellerId: "ME", ranks: [{ rank: 500, category: "Totes" }] }),
    day("2026-11-02", { ourPrice: 20, buyBoxPrice: 19, weHaveBuyBox: false, buyBoxSellerId: "A1X", ranks: [{ rank: 520, category: "Totes" }] }),
    day("2026-11-03", { ourPrice: 18, buyBoxPrice: 18, weHaveBuyBox: true, buyBoxSellerId: "ME", ranks: [{ rank: 450, category: "Totes" }] }),
    day("2026-11-04", { ourPrice: 18, buyBoxPrice: 17.5, weHaveBuyBox: false, buyBoxSellerId: "A2Y", ranks: [{ rank: 470, category: "Totes" }] }),
  ];

  test("Buy Box share, lost events, price stats and rank change", () => {
    const s = summarizeOwnHistory(own);
    assert.equal(s.daysTracked, 4);
    assert.equal(s.buyBoxShare, 50);
    assert.deepEqual(s.lostEvents.map((e) => [e.date, e.to]), [["2026-11-02", "A1X"], ["2026-11-04", "A2Y"]]);
    assert.deepEqual(s.ourPrice, { latest: 18, avg: 19, min: 18, max: 20 });
    assert.equal(s.buyBoxPrice.min, 17.5);
    assert.deepEqual(s.rank, { latest: 470, first: 500, change: -30, category: "Totes" });
  });

  test("days without any Buy Box info are not counted in the share", () => {
    const s = summarizeOwnHistory([day("d1", { weHaveBuyBox: true, buyBoxPrice: 10 }), day("d2", { weHaveBuyBox: null, buyBoxPrice: null })]);
    assert.equal(s.buyBoxShare, 100);
    assert.equal(s.buyBoxDaysKnown, 1);
  });

  test("empty history", () => {
    const s = summarizeOwnHistory([]);
    assert.equal(s.daysTracked, 0);
    assert.equal(s.buyBoxShare, null);
  });

  test("rival price change over the window", () => {
    assert.deepEqual(summarizeRivalHistory([{ price: 10 }, { price: 12 }, { price: 9 }]), { latest: 9, avg: 10.33, min: 9, max: 12, change: -1 });
  });
});
