import moment from "moment";

/** Pattern keys from the API, in priority order, with their label and colour. */
export const SCENARIOS = {
  TRAFFIC_BLACKOUT: { label: "Traffic Blackout", tone: "rose" },
  BLEEDING_AD: { label: "Bleeding Ad", tone: "rose" },
  BIDDING_WAR: { label: "Bidding War", tone: "amber" },
  AD_FATIGUE: { label: "Ad Fatigue", tone: "amber" },
  BUDGET_STARVATION: { label: "Budget Starvation", tone: "amber" },
  GENERAL_DECAY: { label: "General Decay", tone: "slate" },
};

/** Metric chips shown for each pattern: the numbers that explain it. */
export const CHIPS_BY_SCENARIO = {
  TRAFFIC_BLACKOUT: ["impressions", "clicks", "sales"],
  BLEEDING_AD: ["orders", "cvr", "acos"],
  BIDDING_WAR: ["cpc", "clicks", "acos"],
  AD_FATIGUE: ["impressions", "ctr", "clicks"],
  BUDGET_STARVATION: ["acos", "sales", "spend"],
  GENERAL_DECAY: ["sales", "acos", "spend"],
};

export const METRIC_LABELS = {
  impressions: "Impr.",
  clicks: "Clicks",
  spend: "Spend",
  sales: "Sales",
  orders: "Orders",
  acos: "ACoS",
  cvr: "CVR",
  cpc: "CPC",
  ctr: "CTR",
};

// For these a rise is bad; for the rest a fall is bad.
const HIGHER_IS_WORSE = new Set(["acos", "cpc", "spend"]);

/** "bad" | "good" | "flat" for colouring a delta. */
export function deltaTone(metric, delta) {
  if (delta === null || delta === undefined || Math.abs(delta) < 0.5) return "flat";
  const worse = HIGHER_IS_WORSE.has(metric) ? delta > 0 : delta < 0;
  return worse ? "bad" : "good";
}

export const signedPct = (v) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  const n = Math.round(Number(v));
  return `${n > 0 ? "+" : ""}${n}%`;
};

const shortDate = (d) => (d ? moment(d).format("DD MMM") : null);

/**
 * Headline and explanation for a root cause (or a supporting finding).
 * fmt: { money(v), number(v) }
 */
export function causeText(cause, t, fmt) {
  const p = cause?.params || {};
  const money = (v) => (v === null || v === undefined ? "—" : fmt.money(v));
  const date = shortDate(p.date);
  switch (cause?.code) {
    case "CAMPAIGN_PAUSED":
      return {
        headline: date ? t("Campaign paused on {{date}}", { date }) : t("Campaign is paused"),
        explanation: t("The campaign was set to {{status}}, so its ads stopped serving.", { status: String(p.newValue || "PAUSED").toUpperCase() }),
      };
    case "TARGET_PAUSED": {
      const what = { AD_GROUP: t("An ad group"), PRODUCT_AD: t("A product ad") }[p.level] || t("A target");
      return {
        headline: date ? t("{{what}} was paused on {{date}}", { what, date }) : t("{{what}} was paused", { what }),
        explanation: p.targeting
          ? t("\"{{target}}\" stopped serving, which cut the campaign's impressions.", { target: p.targeting })
          : t("Part of the campaign stopped serving, which cut its impressions."),
      };
    }
    case "OUT_OF_STOCK":
      return {
        headline: t("Advertised product {{asin}} is out of stock", { asin: p.asin }),
        explanation: t("Amazon stops showing ads for products that are out of stock."),
      };
    case "BUY_BOX_LOST":
      return {
        headline: t("Buy Box lost on {{asin}}", { asin: p.asin || "" }),
        explanation: t("You held the Buy Box on {{prior}}% of days before and on {{current}}% of days now. Amazon shows ads only for the Buy Box offer.", { prior: p.priorShare, current: p.currentShare }),
      };
    case "BID_CUT":
      return {
        headline: t("Bid cut {{pct}} on {{date}}", { pct: signedPct(p.pct), date }),
        explanation:
          (p.count > 1
            ? t("{{count}} bids were cut by 25% or more; the largest went from {{from}} to {{to}}.", { count: p.count, from: money(p.oldValue), to: money(p.newValue) })
            : t("A bid was lowered from {{from}} to {{to}}.", { from: money(p.oldValue), to: money(p.newValue) })) +
          " " +
          t("Lower bids can push the ad off the first page of results."),
      };
    case "OUTBID_OR_SUPPRESSED":
      return {
        headline: t("Likely outbid by competitors"),
        explanation: t("Impressions fell {{pct}} with no pause, stock-out, Buy Box loss or bid cut on record. Competitors may be bidding higher, or Amazon is showing the ad less.", { pct: signedPct(p.impressionsDelta) }),
      };
    case "WASTED_SEARCH_TERMS":
      return {
        headline: t("{{count}} search terms spent {{spend}} with no orders", { count: p.terms, spend: money(p.spend) }),
        explanation: t("The top one, \"{{term}}\", spent {{topSpend}}. Each of these cost at least {{limit}} (about 10 clicks) without a sale.", { term: p.topTerm, topSpend: money(p.topSpend), limit: money(p.limit) }),
      };
    case "PRICE_RAISED":
      return {
        headline: t("Price raised {{pct}} on {{asin}}", { pct: signedPct(p.pct), asin: p.asin || "" }),
        explanation: t("Your average price went from {{from}} to {{to}}. Shoppers still click but buy less.", { from: money(p.from), to: money(p.to) }),
      };
    case "LISTING_FRICTION":
      return {
        headline: t("Likely a listing problem"),
        explanation: t("Conversion rate fell {{pct}} with no wasted search terms or price change on record. Check recent reviews, star rating, price and listing content.", { pct: signedPct(p.cvrDelta) }),
      };
    case "BID_RAISED":
      return {
        headline: t("Bid raised {{pct}} on {{date}}", { pct: signedPct(p.pct), date }),
        explanation:
          (p.count > 1
            ? t("{{count}} bids were raised by 10% or more; the largest went from {{from}} to {{to}}.", { count: p.count, from: money(p.oldValue), to: money(p.newValue) })
            : t("A bid went from {{from}} to {{to}}.", { from: money(p.oldValue), to: money(p.newValue) })) +
          " " +
          t("Higher bids make each click cost more."),
      };
    case "PLACEMENT_RAISED":
      return {
        headline: t("{{placement}} placement raised to {{to}}%", { placement: p.placement || t("Placement"), to: p.newValue }),
        explanation: t("The placement bid adjustment went from {{from}}% to {{to}}% on {{date}}, so clicks there cost more.", { from: p.oldValue, to: p.newValue, date }),
      };
    case "COMPETITOR_BIDS":
      return {
        headline: t("Likely a bidding war"),
        explanation: t("Cost per click rose {{pct}} with no bid or placement increase on record. Competitors are probably bidding more on the same keywords, which is common in Q4 and during sales events.", { pct: signedPct(p.cpcDelta) }),
      };
    case "RIVAL_PRICE_CUT":
      return {
        headline: t("Competitors cut prices {{pct}}", { pct: signedPct(p.avgPct) }),
        explanation: t("{{cutters}} of {{rivals}} tracked competitor products lowered their price, so shoppers click on them instead.", { cutters: p.cutters, rivals: p.rivals }),
      };
    case "LOW_CLICK_APPEAL":
      return {
        headline: t("Likely lower click appeal"),
        explanation: t("Click-through rate fell {{pct}} while the ad was still shown. Check for competitor coupons, a lower star rating, a lost badge, or a changed main image or title.", { pct: signedPct(p.ctrDelta) }),
      };
    case "BUDGET_RUNS_OUT":
      return {
        headline: t("In budget only {{pct}}% of the day", { pct: p.timeInBudget ?? "—" }),
        explanation:
          t("ACoS is a healthy {{acos}}%, but the budget runs out early and the ad misses later shoppers.", { acos: p.acos === null || p.acos === undefined ? "—" : Math.round(p.acos) }) +
          (p.outOfBudgetDays > 0 ? " " + t("It ran out of budget on {{days}} of {{window}} days.", { days: p.outOfBudgetDays, window: p.windowDays }) : ""),
      };
    case "GENERAL_DECLINE":
      return {
        headline: t("General decline"),
        explanation: t("Sales changed {{sales}} and ACoS changed {{acos}} without matching a specific pattern. This is often seasonal, or several small changes at once.", { sales: signedPct(p.salesDelta), acos: signedPct(p.acosDelta) }),
      };
    default:
      return { headline: t("Performance declined"), explanation: "" };
  }
}
