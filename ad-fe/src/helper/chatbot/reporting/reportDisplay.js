const LABELS = {
  spend: "Ad spend", sales: "Ad sales", orders: "Orders", clicks: "Clicks",
  impressions: "Impressions", acos: "ACOS", roas: "ROAS", cpc: "Cost per click",
  cvr: "Conversion rate", ctr: "Click-through rate", aov: "Average order value",
  tacos: "TACOS", profit: "Profit after ads", stock: "Available stock",
  days_of_stock: "Days of stock", name: "Name", productId: "ASIN", sku: "SKU",
  adType: "Ad type", date: "Date", hour: "Hour", weekday: "Day",
  searchTerm: "Search term", placement: "Placement", oldValue: "Before",
  newValue: "After", status: "Status", ruleTime: "Time", ruleType: "Rule type",
  changeType: "Change", currentValue: "This period", previousValue: "Previous period",
  absoluteChange: "Change", relativeChangePercent: "Change (%)",
};

export function resolvePeriodWindow(periods, type = "current") {
  if (!periods) return null;

  if (Array.isArray(periods) && periods.length > 0) {
    const item = periods[0];
    return item?.[type] || null;
  }

  if (typeof periods === "object") {
    if (periods[type]) return periods[type];
    const firstVal = Object.values(periods)[0];
    if (firstVal && typeof firstVal === "object" && firstVal[type]) {
      return firstVal[type];
    }
  }

  return null;
}

export function formatPeriodRange(window) {
  if (!window || !window.fromDate) return null;
  if (!window.toDate || window.fromDate === window.toDate) {
    return window.fromDate;
  }
  return `${window.fromDate} → ${window.toDate}`;
}

export function friendlyLabel(key, fallback, periods = null) {
  if (key === "currentValue") {
    const range = formatPeriodRange(resolvePeriodWindow(periods, "current"));
    return range ? `Current period (${range})` : (LABELS.currentValue || fallback || "Current period");
  }
  if (key === "previousValue") {
    const range = formatPeriodRange(resolvePeriodWindow(periods, "comparison"));
    return range ? `Previous period (${range})` : (LABELS.previousValue || fallback || "Previous period");
  }
  if (LABELS[key]) return LABELS[key];
  const comparison = String(key).match(/^(.*?)(Current|Previous)$/);
  if (comparison && LABELS[comparison[1]]) {
    return `${LABELS[comparison[1]]} · ${comparison[2] === "Current" ? "this period" : "previous period"}`;
  }
  return String(fallback || key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

export function friendlyText(value = "") {
  return String(value)
    .replace(/Attributed sales and orders may mature within their attribution window; imported figures are provisional\./gi,
      "Recent sales and orders can change as Amazon finishes attributing purchases to ads.")
    .replace(/(SP|SB|SD): the source attribution window is not verified; keep this ad type separate from other totals\./gi,
      (_, type) => `${adTypeLabel(type)} uses an unconfirmed sales attribution period, so its totals are shown separately.`)
    .replace(/Current totals are (?:observed imported rows|available reporting data); complete (?:source coverage|data completeness) is unverified\./gi,
      "These totals use the data available so far. They may change when all reports have finished updating.")
    .replace(/^verified data completeness$/i, "Confirmation that all data is available is still pending.")
    .replace(/Verified, conflict-free, matched reporting periods with known attribution are required for changes and mover rankings\./gi,
      "Changes and biggest movers will be available when both periods have complete, comparable data.")
    .replace(/requested metric inputs/gi, "the information needed to calculate this metric")
    .replace(/verified data completeness/gi, "confirmation that all data is available")
    .replace(/\b\d{13,20}(?:\/(?:SP|SB|SD)(?:\/(?:current|comparison))?)?:\s*/g, "")
    .replace(/\b\d{13,20}\b/g, "your profile")
    .replace(/^Read-only \w+ report\. Each table keeps its own profile, currency, ad type and period\.\s*/, "")
    .replace(/\bIMPORT_COVERAGE_UNVERIFIED\b/g, "Data is still updating, so totals may change.")
    .replace(/\b(?:VERIFIED_IMPORT_COVERAGE|SOURCE_COMPLETENESS_UNVERIFIED)\b/g, "Complete data is not yet available.")
    .replace(/\bHOURLY_ORDERS_ARE_UNITS\b/g, "Hourly order counts are not available, so hourly conversion rates cannot be calculated.")
    .replace(/\b(?:HOURLY_ATTRIBUTION_WINDOW_MISMATCH|PRODUCT_ATTRIBUTION_WINDOW_UNVERIFIED)\b/g, "Sales for this report are not yet comparable with your selected attribution period.")
    .replace(/\bRULE_HISTORY_IS_NOT_APPLIED_EXECUTION_PROOF\b/g, "Rule history does not confirm that every recorded change was applied.")
    .replace(/\bROWS_NOT_FROM_COMPLETED_IMPORT\b/g, "Some reporting data is still being updated.")
    .replace(/\bNEWER_INCOMPLETE_IMPORT\b/g, "The latest data update is still in progress.")
    .replace(/\bNO_COMPLETED_IMPORT\b/g, "The report for these dates is not available yet.")
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, "Some information is not available yet.")
    .replace(/observed imported rows/gi, "available reporting data")
    .replace(/source coverage/gi, "data completeness")
    .replace(/verified import coverage/gi, "complete data")
    .replace(/import coverage/gi, "data completeness")
    .replace(/prerequisites/gi, "information needed")
    .replace(/reporting inputs/gi, "report information")
    .replace(/^complete data$/i, "Complete reporting data is needed before comparisons are available.")
    .replace(/^the information needed to calculate this metric$/i, "Some information needed to calculate this metric is missing.")
    .replace(/Comparison bars show observed period values; coverage warnings still apply and reliable change may be unavailable\./gi,
      "The bars show available totals. Differences may change as more data arrives.")
    .replace(/Fresh sellable inventory joined to advertised ASIN\/SKU identities\./gi,
      "Current stock levels matched to your advertised products are needed.")
    .replace(/Fresh sellable inventory and validated product sales velocity\./gi,
      "Current stock levels and recent product sales are needed to estimate days of stock.");
}

export function friendlyTableTitle(title = "", periods = null) {
  const parts = title.split(" · ");
  const category = parts[0];
  const titles = {
    summary: "Performance", comparison: "Performance comparison", change: "Performance changes",
    waste: "Spend to review", growth: "Growth opportunities", time: "Ad performance by time",
    products: "Product performance", rules: "Rule history", unusual: "Changes to review",
  };

  if (!titles[category]) return friendlyText(title || "Report details");

  const isComparison = parts[parts.length - 1] === "comparison";
  const range = formatPeriodRange(resolvePeriodWindow(periods, isComparison ? "comparison" : "current"));

  let period;
  if (isComparison) {
    period = range ? `Previous period (${range})` : "Previous period";
  } else {
    period = range ? `Current period (${range})` : (periods ? "Current period" : "Selected period");
  }

  return `${titles[category]} · ${period}`;
}

export function friendlyChartTitle(title = "", profileNames = {}, periods = null) {
  if (!title) return "";
  let clean = String(title);

  // Generated table titles contain routing details that are useful to the
  // server, but users need the report name, ad type and reporting period.
  if (/^(summary|comparison|change|waste|growth|time|products|rules|unusual) · /.test(clean)) {
    const parts = clean.split(" · ").filter(part => part !== "returned rows");
    const profile = profileNames[parts[2]];
    return [friendlyTableTitle(parts.join(" · "), periods), profile, adTypeLabel(parts[1])]
      .filter(Boolean).join(" · ");
  }

  // Substitute known profile IDs with their friendly names
  for (const [id, name] of Object.entries(profileNames || {})) {
    if (id && name) {
      clean = clean.replaceAll(id, name);
    }
  }

  // Format "Observed <metric> share · <scope>" to "<Metric> Share · <scope>"
  clean = clean.replace(/^Observed\s+(\w+)\s+share\s*·\s*/i, (_, m) => {
    const metricLabel = LABELS[m.toLowerCase()] || (m.charAt(0).toUpperCase() + m.slice(1));
    return `${metricLabel} Share · `;
  });

  // Replace remaining raw numeric profile IDs with "Selected profile"
  clean = clean.replace(/\b\d{14,20}\b/g, "Selected profile");

  // Clean up slash separators into clean middots
  clean = clean.replace(/\s*\/\s*/g, " · ");
  clean = clean.replace(/^Observed\s+(\w+)\s+by profile-local weekday and hour$/i,
    (_, metric) => `${friendlyLabel(metric, undefined, periods)} by day and hour (profile time)`);
  clean = clean.replace(/^(\w+) by entity/i, (_, metric) => `${friendlyLabel(metric, undefined, periods)} comparison`);

  return clean;
}

export function adTypeLabel(value) {
  return { SP: "Sponsored Products", SB: "Sponsored Brands", SD: "Sponsored Display" }[value] || "";
}

export function friendlyChartLabel(value, profileNames = {}) {
  let label = String(value);

  for (const [id, name] of Object.entries(profileNames)) {
    label = label.replaceAll(id, name);
  }

  return label.replace(/\b\d{13,20}\b/g, "Selected profile")
    .replace(/\bSelected profile\s*·\s*Selected profile\b/g, "Selected profile");
}

export function cleanCategoryLabel(value, profileNames = {}) {
  const friendly = friendlyChartLabel(value, profileNames);
  const match = friendly.match(/^(?:.*?\s+(?:SP|SB|SD)\s*·\s*|(?:Selected profile|[A-Za-z0-9_-]+)\s*·\s*)(.+)$/i);
  return match && match[1] && match[1].trim() ? match[1].trim() : friendly;
}

export function displayColumns(dataset) {
  return (dataset?.columns || []).filter(column => ![
    "profileId", "campaignId", "adGroupId", "keywordId", "targetId", "ruleId", "entityId",
  ].includes(column.key));
}

export function createReportContext(report) {
  const current = report?.periods?.[0]?.current;
  const profiles = report?.scope?.profiles || [];

  return {
    reportId: report.reportId,
    category: report.category,
    profileIds: profiles.map(profile => profile.profileId),
    period: current
      ? { preset: "custom", fromDate: current.fromDate, toDate: current.toDate }
      : { preset: "last_7_days" },
    adTypes: [...new Set(profiles.flatMap(profile => profile.adTypes || []))],
    groupBy: [],
    generatedAt: report.freshness?.dataAsOf || Date.now(),
  };
}

export function profileNameMap(groups = []) {
  const names = {};
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const profile of group.profiles || [group]) {
      if (profile.profileId && profile.name) names[String(profile.profileId)] = profile.name;
    }
  }

  // Also check active browser profile in localStorage
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem("profile");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.profile?.profileId && parsed?.profile?.name) {
        names[String(parsed.profile.profileId)] = parsed.profile.name;
      }
      if (parsed?.profileId && parsed?.name) {
        names[String(parsed.profileId)] = parsed.name;
      }
      if (Array.isArray(parsed?.config?.profiles)) {
        for (const p of parsed.config.profiles) {
          if (p.profileId && p.name) names[String(p.profileId)] = p.name;
        }
      }
    }
  } catch {}

  return names;
}
