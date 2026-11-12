/**
 * Pure summary calculations for Competitor Price History (unit-tested).
 */
const round2 = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? null : Math.round(Number(n) * 100) / 100);
const nums = (arr) => arr.filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
const avg = (arr) => {
  const v = nums(arr);
  return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const min = (arr) => {
  const v = nums(arr);
  return v.length ? Math.min(...v) : null;
};
const max = (arr) => {
  const v = nums(arr);
  return v.length ? Math.max(...v) : null;
};

/**
 * @param {Array} own  OWN snapshots sorted by date asc
 * @returns summary used by the history panel
 */
const summarizeOwnHistory = (own = []) => {
  const withBuyBoxInfo = own.filter((s) => s.weHaveBuyBox !== null && s.weHaveBuyBox !== undefined && (s.buyBoxPrice !== null || s.weHaveBuyBox));
  const heldDays = withBuyBoxInfo.filter((s) => s.weHaveBuyBox).length;

  // Days the Buy Box changed hands away from us
  const lostEvents = [];
  for (let i = 1; i < own.length; i++) {
    if (own[i - 1].weHaveBuyBox && own[i].weHaveBuyBox === false) {
      lostEvents.push({ date: own[i].date, to: own[i].buyBoxSellerId || null, buyBoxPrice: own[i].buyBoxPrice ?? null, ourPrice: own[i].ourPrice ?? null });
    }
  }

  const last = own[own.length - 1] || null;
  const ourPrices = own.map((s) => s.ourPrice);
  const bbPrices = own.map((s) => s.buyBoxPrice);
  const latestRank = last?.ranks?.[0]?.rank ?? null;
  const firstRank = own.find((s) => s.ranks?.[0]?.rank)?.ranks?.[0]?.rank ?? null;

  return {
    daysTracked: own.length,
    firstDate: own[0]?.date || null,
    lastDate: last?.date || null,
    buyBoxShare: withBuyBoxInfo.length ? Math.round((heldDays / withBuyBoxInfo.length) * 100) : null,
    buyBoxDaysHeld: heldDays,
    buyBoxDaysKnown: withBuyBoxInfo.length,
    lostEvents,
    ourPrice: { latest: last?.ourPrice ?? null, avg: avg(ourPrices), min: min(ourPrices), max: max(ourPrices) },
    buyBoxPrice: { latest: last?.buyBoxPrice ?? null, avg: avg(bbPrices), min: min(bbPrices), max: max(bbPrices) },
    rank: { latest: latestRank, first: firstRank, change: latestRank && firstRank ? latestRank - firstRank : null, category: last?.ranks?.[0]?.category ?? null },
  };
};

const summarizeRivalHistory = (series = []) => {
  const prices = series.map((s) => s.price);
  const last = series[series.length - 1] || null;
  const first = series[0] || null;
  return {
    latest: last?.price ?? null,
    avg: avg(prices),
    min: min(prices),
    max: max(prices),
    change: last?.price != null && first?.price != null ? round2(last.price - first.price) : null,
  };
};

module.exports = { summarizeOwnHistory, summarizeRivalHistory };
