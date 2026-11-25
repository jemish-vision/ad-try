import moment from "moment";

export const REASON_META = {
  BUY_BOX_LOST: { badge: "Buy Box Lost", tone: "rose" },
  PRODUCT_UNBUYABLE: { badge: "Product Unbuyable", tone: "rose" },
  CREATIVE_REJECTED: { badge: "Creative Rejected", tone: "rose" },
  LISTING_SUPPRESSED: { badge: "Listing Suppressed", tone: "rose" },
  LISTING_INELIGIBLE: { badge: "Listing Ineligible", tone: "amber" },
  PORTFOLIO_CAP_HIT: { badge: "Portfolio Cap Hit", tone: "amber" },
  CAMPAIGN_END_DATE: { badge: "End Date Reached", tone: "amber" },
  RULE_PAUSED_ALL_TARGETS: { badge: "Rule Paused Targets", tone: "amber" },
  CAMPAIGN_OUT_OF_BUDGET: { badge: "Out of Budget", tone: "amber" },
  CAMPAIGN_OR_ADGROUP_PAUSED: { badge: "Paused on Amazon", tone: "slate" },
  UNKNOWN_SERVING_HALT: { badge: "Delivery Halted", tone: "amber" },
};

/**
 * Translates a blackout alert's reasonCode + reasonParams into plain-language
 * badge, headline, and explanation text. Never includes monetary loss amounts.
 */
export function blackoutReasonText(alert, t) {
  const code = alert?.reasonCode || "UNKNOWN_SERVING_HALT";
  const p = alert?.reasonParams || {};
  const asin = p.asin || alert?.affectedAsins?.[0] || "";
  const meta = REASON_META[code] || REASON_META.UNKNOWN_SERVING_HALT;

  switch (code) {
    case "BUY_BOX_LOST":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: asin ? t("{{asin}} lost the Buy Box", { asin }) : t("Product lost the Buy Box"),
        explanation: t("Another seller won the Buy Box, so Amazon stopped serving ads for this product."),
      };
    case "PRODUCT_UNBUYABLE":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: asin ? t("{{asin}} is unbuyable or out of stock", { asin }) : t("Product became unbuyable"),
        explanation: t("No buyable offer or stock is available on Amazon, halting ad impressions."),
      };
    case "CREATIVE_REJECTED":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: t("Creative rejected in Amazon review"),
        explanation: p.detail
          ? t("Amazon moderation flagged this creative ({{detail}}).", { detail: p.detail })
          : t("Sponsored Brands or Display creative was rejected during moderation."),
      };
    case "LISTING_SUPPRESSED":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: asin ? t("Listing {{asin}} is suppressed", { asin }) : t("Product listing suppressed"),
        explanation: p.issueMessage
          ? t("Amazon catalog issue: {{message}}", { message: p.issueMessage })
          : t("Listing is suppressed or missing required variation/attribute details on Amazon."),
      };
    case "LISTING_INELIGIBLE":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: asin ? t("{{asin}} flagged ineligible for ads", { asin }) : t("Listing flagged ineligible"),
        explanation: p.detail
          ? t("Amazon ad eligibility issue: {{detail}}", { detail: p.detail })
          : t("Amazon marked the advertised product ineligible to serve ads."),
      };
    case "PORTFOLIO_CAP_HIT":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: p.portfolioName ? t("Portfolio \"{{name}}\" reached its cap", { name: p.portfolioName }) : t("Portfolio cap or end date hit"),
        explanation: t("Its portfolio reached its budget cap or date limit, stopping all campaigns inside it."),
      };
    case "CAMPAIGN_END_DATE":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: p.endDate ? t("Campaign ended on {{date}}", { date: p.endDate }) : t("Campaign end date reached"),
        explanation: t("The scheduled campaign end date was reached, so Amazon stopped serving it."),
      };
    case "RULE_PAUSED_ALL_TARGETS":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: p.ruleName ? t("Rule \"{{name}}\" paused all targets", { name: p.ruleName }) : t("All targets in ad group paused"),
        explanation: t("Zero enabled keywords or targets remain active in this ad."),
      };
    case "CAMPAIGN_OUT_OF_BUDGET":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: t("Daily campaign budget exhausted"),
        explanation: t("Daily budget ran out, pausing ad delivery until budget resets or increases."),
      };
    case "CAMPAIGN_OR_ADGROUP_PAUSED":
      return {
        ...meta,
        badge: t(meta.badge),
        headline: t("Paused or archived on Amazon"),
        explanation: t("Amazon currently reports this campaign or ad group as paused."),
      };
    default:
      return {
        ...meta,
        badge: t(meta.badge),
        headline: t("Zero impressions detected in active hour"),
        explanation: p.rawServingStatus
          ? t("Impressions dropped to 0 (Amazon status: {{status}}).", { status: p.rawServingStatus })
          : t("Impressions abruptly dropped to zero despite normally active hourly traffic."),
      };
  }
}

export function formatBlackoutHour(hourKey) {
  if (!hourKey) return "";
  const timePart = String(hourKey).trim().split(/\s+/).pop();
  const parsed = moment(timePart, ["HH:mm", "HH:mm:ss", "H:mm"], true);
  return parsed.isValid() ? parsed.format("hh:mm A") : timePart;
}
