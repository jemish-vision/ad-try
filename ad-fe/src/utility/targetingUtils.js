import React from "react";

/**
 * Normalizes any targeting matchType / expression string into a structured descriptor.
 * Handles Amazon SP, SB, and SD targeting formats:
 * - Keywords: EXACT, PHRASE, BROAD, NEGATIVE_EXACT, NEGATIVE_PHRASE
 * - Auto targeting: close-match, loose-match, substitutes, complements, similar-product
 * - Product targeting: asin="...", Category: ..., Brand: ..., Expanded
 * - Audiences: views, purchases, audience
 */
export const getNormalizedTargetingType = (matchType = "", targeting = "", keywordType = "") => {
  const m = String(matchType || "").trim();
  const t = String(targeting || "").trim().toLowerCase();
  const k = String(keywordType || "").trim();
  const lowerM = m.toLowerCase();
  const lowerK = k.toLowerCase();

  // 1. Auto Targeting Expressions
  const isAutoTarget =
    t === "close-match" || lowerM.includes("close-match") ||
    t === "loose-match" || lowerM.includes("loose-match") ||
    t === "substitutes" || lowerM.includes("substitutes") ||
    t === "complements" || lowerM.includes("complements") ||
    t === "similar-product" || lowerM.includes("similar-product") ||
    t === "(_targeting_auto_)" || lowerM.startsWith("automatic");

  if (isAutoTarget) {
    let sub = "auto";
    let label = "Auto";
    if (t === "close-match" || lowerM.includes("close-match")) {
      sub = "close-match";
      label = "Close match";
    } else if (t === "loose-match" || lowerM.includes("loose-match")) {
      sub = "loose-match";
      label = "Loose match";
    } else if (t === "substitutes" || lowerM.includes("substitutes")) {
      sub = "substitutes";
      label = "Substitutes";
    } else if (t === "complements" || lowerM.includes("complements")) {
      sub = "complements";
      label = "Complements";
    } else if (t === "similar-product" || lowerM.includes("similar-product")) {
      sub = "similar-product";
      label = "Similar";
    }
    return {
      type: "AUTO",
      subType: sub,
      label,
      shortLabel: "Auto",
      isAuto: true,
      badgeColor: "emerald",
    };
  }

  // 2. Keyword Match Types
  if (lowerM === "exact" || lowerM === "keyword - exact" || lowerK === "exact") {
    return {
      type: "EXACT",
      subType: "exact",
      label: "Exact",
      shortLabel: "Exact",
      isKeyword: true,
      badgeColor: "purple",
    };
  }
  if (lowerM === "phrase" || lowerM === "keyword - phrase" || lowerK === "phrase") {
    return {
      type: "PHRASE",
      subType: "phrase",
      label: "Phrase",
      shortLabel: "Phrase",
      isKeyword: true,
      badgeColor: "blue",
    };
  }
  if (lowerM === "broad" || lowerM === "keyword - broad" || lowerK === "broad") {
    return {
      type: "BROAD",
      subType: "broad",
      label: "Broad",
      shortLabel: "Broad",
      isKeyword: true,
      badgeColor: "sky",
    };
  }

  // 3. Negatives
  if (lowerM.includes("negative exact") || lowerK.includes("negative exact") || lowerM === "negativeexact") {
    return {
      type: "NEGATIVE_EXACT",
      subType: "negativeExact",
      label: "Negative Exact",
      shortLabel: "Neg Exact",
      badgeColor: "rose",
    };
  }
  if (lowerM.includes("negative phrase") || lowerK.includes("negative phrase") || lowerM === "negativephrase") {
    return {
      type: "NEGATIVE_PHRASE",
      subType: "negativePhrase",
      label: "Negative Phrase",
      shortLabel: "Neg Phrase",
      badgeColor: "rose",
    };
  }

  // 4. Product, Category, and Expanded Targeting
  if (lowerM.includes("category") || t.startsWith("category:") || t.includes("asincategory")) {
    return {
      type: "CATEGORY",
      subType: "category",
      label: "Category",
      shortLabel: "Category",
      isProduct: true,
      badgeColor: "amber",
    };
  }
  if (lowerM.includes("expanded") || t.startsWith("asin-expanded=")) {
    return {
      type: "EXPANDED",
      subType: "expanded",
      label: "Expanded",
      shortLabel: "Expanded",
      isProduct: true,
      badgeColor: "amber",
    };
  }
  if (
    lowerM.includes("product") ||
    lowerM.includes("asin") ||
    t.startsWith("asin=") ||
    /^[bB][0-9A-Z]{9}$/.test(t)
  ) {
    return {
      type: "PRODUCT",
      subType: "product",
      label: "Product",
      shortLabel: "Product",
      isProduct: true,
      badgeColor: "amber",
    };
  }

  // 5. Audiences (SD)
  if (["audience", "audienceslikelyinterestedinad", "views", "purchases"].includes(lowerM)) {
    return {
      type: "AUDIENCE",
      subType: lowerM,
      label: "Audience",
      shortLabel: "Audience",
      badgeColor: "indigo",
    };
  }

  // 6. Generic Fallback
  if (m) {
    const cleaned = m.replace(/^(keyword|automatic|product target)\s*[-:]\s*/i, "").trim();
    if (cleaned) {
      return {
        type: cleaned.toUpperCase(),
        subType: cleaned.toLowerCase(),
        label: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
        shortLabel: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
        badgeColor: "slate",
      };
    }
  }

  return {
    type: "",
    subType: "",
    label: "",
    shortLabel: "",
    badgeColor: "slate",
  };
};

/**
 * Returns Tailwind badge classes based on badgeColor
 */
export const getBadgeClasses = (badgeColor = "slate") => {
  switch (badgeColor) {
    case "purple":
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60";
    case "blue":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60";
    case "sky":
      return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60";
    case "emerald":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60";
    case "amber":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60";
    case "rose":
      return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60";
    case "indigo":
      return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60";
    case "slate":
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  }
};

/**
 * React Component for displaying a clean, stylized Targeting Type Badge
 */
export const TargetingTypeBadge = ({
  matchType,
  targeting,
  keywordType,
  full = false,
  className = "",
}) => {
  const norm = getNormalizedTargetingType(matchType, targeting, keywordType);
  if (!norm.label && !norm.shortLabel) return null;

  const displayText = full ? norm.label : (norm.shortLabel || norm.label);
  const colorClasses = getBadgeClasses(norm.badgeColor);

  return React.createElement(
    "span",
    {
      className: `inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase border flex-shrink-0 select-none ${colorClasses} ${className}`,
      title: `Targeting Type: ${norm.label}`,
    },
    displayText
  );
};

/**
 * Format changeType into Amazon Ads standard notation.
 * e.g., "Keyword bid(exact) - spirulina", "Targeting bid(auto) - complements", "Campaign status", etc.
 */
export const formatAmazonChangeType = (row) => {
  if (!row) return "";
  const rawType = (row.changeType || "").trim();
  const targeting = row.targeting || "";

  // Normalize match type & targeting type
  const norm = getNormalizedTargetingType(row.matchType, targeting, row.keywordType);
  const matchStr = norm.type === "AUTO"
    ? `(auto)`
    : norm.subType
      ? `(${norm.subType.toLowerCase()})`
      : "";

  const isAutoOrProduct = norm.type === "AUTO" || norm.type === "PRODUCT" || norm.type === "CATEGORY" || norm.type === "EXPANDED";
  const entityName = isAutoOrProduct ? "Targeting" : "Keyword";

  // 1. Keyword / Targeting Bid
  if (
    /targeting bid|keyword bid/i.test(rawType) ||
    (targeting && /bid/i.test(rawType) && !/placement/i.test(rawType))
  ) {
    if (targeting) {
      return `${entityName} bid${matchStr} - ${targeting}`;
    }
    return `${entityName} bid${matchStr}`;
  }

  // 2. Keyword / Targeting Status
  if (
    /targeting status|keyword status/i.test(rawType) ||
    (targeting && /status|state/i.test(rawType))
  ) {
    if (targeting) {
      return `${entityName} status${matchStr} - ${targeting}`;
    }
    return `${entityName} status${matchStr}`;
  }

  // 3. Add Target / Negative Target
  if (/add negative target|negative/i.test(rawType)) {
    return `Negative keyword${matchStr}${targeting ? ` - ${targeting}` : ""}`;
  }
  if (/add target/i.test(rawType)) {
    return `${entityName}${matchStr}${targeting ? ` - ${targeting}` : ""}`;
  }

  // 4. Campaign Status
  if (/campaign status|campaign state|update state|update campaign state|update camapign status/i.test(rawType)) {
    return "Campaign status";
  }

  // 5. Campaign Budget
  if (/campaign budget|update budget|update campaign budget|update camapign budget/i.test(rawType)) {
    return "Campaign budget";
  }

  // 6. Ad Group Default Bid / State
  if (/default bid/i.test(rawType)) {
    return "Ad group default bid";
  }
  if (/adgroup state|ad group state/i.test(rawType)) {
    return "Ad group status";
  }

  // 7. Placement Bids
  if (/placement/i.test(rawType)) {
    if (/top of search/i.test(rawType)) {
      return "Placement bid(Top of search)";
    }
    if (/product pages|product page/i.test(rawType)) {
      return "Placement bid(Product pages)";
    }
    if (/rest of search/i.test(rawType)) {
      return "Placement bid(Rest of search)";
    }
    return "Placement bid adjustment";
  }

  // Fallback: If targeting is present but rawType was something else
  if (targeting) {
    return `${rawType}${matchStr} - ${targeting}`;
  }

  return rawType || "—";
};

export const isAdGroupLevelChange = (row) => {
  if (!row) return false;
  const rawType = (row.changeType || "").toLowerCase();
  return Boolean(
    row.targeting ||
    row.adGroupId ||
    row.adGroupName ||
    row.adGroupDetails?.name ||
    rawType.includes("targeting") ||
    rawType.includes("keyword") ||
    rawType.includes("adgroup") ||
    rawType.includes("ad group")
  );
};

export default TargetingTypeBadge;
