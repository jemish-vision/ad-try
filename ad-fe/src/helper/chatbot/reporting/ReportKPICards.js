import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getCurrencySymbol } from "../../currencyCode/CurrencyCode";
import { adTypeLabel, formatPeriodRange, resolvePeriodWindow } from "./reportDisplay";

const METRIC_LABELS = {
  spend: "Spend",
  sales: "Sales",
  acos: "ACOS",
  roas: "ROAS",
  orders: "Orders",
  clicks: "Clicks",
  impressions: "Impressions",
  cpc: "CPC",
  cvr: "Conversion rate",
  ctr: "Click-through rate",
  aov: "Average order value",
  profit: "Ad Profit",
  tacos: "TACOS",
};

// Returns whether a positive change is beneficial (e.g. higher sales is good, higher ACOS is bad)
function isPositiveGood(metric) {
  if (["acos", "cpc", "tacos"].includes(metric)) return false;
  return true;
}

export function formatMetricValue(value, unit, currencyCode = "USD") {
  if (value === null || value === undefined || isNaN(value)) {
    return "—";
  }

  const symbol = getCurrencySymbol(currencyCode);

  switch (unit) {
    case "currency":
      return `${symbol}${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "multiple":
      return `${Number(value).toFixed(2)}x`;
    case "count":
      return Number(value).toLocaleString();
    default:
      return String(value);
  }
}

export default function ReportKPICards({
  cards = [],
  currencyCode = "USD",
  isExpanded = false,
  profileNames = {},
  periods = null,
}) {
  if (!Array.isArray(cards) || cards.length === 0) return null;

  const comparisonRange = formatPeriodRange(resolvePeriodWindow(periods, "comparison"));
  const comparisonTooltip = comparisonRange ? `vs previous period (${comparisonRange})` : "vs previous period";
  const groups = new Map();
  for (const card of cards) {
    const profileId = card.profileId || Object.keys(profileNames).find(id => String(card.title || "").includes(id))
      || String(card.title || "").match(/\b\d{13,20}\b/)?.[0] || "";
    const adType = card.adType || String(card.title || "").match(/\b(SP|SB|SD)\b/)?.[1];
    const currency = card.currencyCode || currencyCode;
    const key = JSON.stringify([profileId, adType, currency]);
    if (!groups.has(key)) {
      const caption = [profileNames[profileId] || (profileId ? "Selected profile" : ""), adTypeLabel(adType), currency]
        .filter(Boolean).join(" · ");
      groups.set(key, { caption, cards: [] });
    }
    groups.get(key).cards.push(card);
  }

  return (
    <div className="space-y-4">
      {[...groups].map(([groupKey, group]) => (
        <section key={groupKey} className="min-w-0" aria-label={group.caption}>
          <h4 className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">{group.caption}</h4>
          <div
            className={`report-kpi-grid grid gap-2 ${
              group.cards.length === 1 ? "grid-cols-1 sm:max-w-xs" : isExpanded ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-2"
            }`}
          >
            {group.cards.map((card, index) => {
              const metric = card.metric || card.id || `metric_${index}`;
              const label = card.label || METRIC_LABELS[metric] || card.title || metric.toUpperCase();
              const formattedValue = formatMetricValue(card.value, card.unit, card.currencyCode || currencyCode);
              const comp = card.comparison;

              let deltaText = null;
              let deltaType = "neutral"; // 'good' | 'bad' | 'neutral'

              if (comp && comp.status !== "unavailable") {
                const positiveIsGood = isPositiveGood(metric);

                if (typeof comp.percentagePoints === "number" || typeof comp.percentagePointChange === "number") {
                  const pp = comp.percentagePoints ?? comp.percentagePointChange;
                  const sign = pp > 0 ? "+" : "";
                  deltaText = `${sign}${pp.toFixed(1)} pts`;
                  if (pp > 0) deltaType = positiveIsGood ? "good" : "bad";
                  else if (pp < 0) deltaType = positiveIsGood ? "bad" : "good";
                } else if (typeof comp.relativePercent === "number" || typeof comp.relativeChangePercent === "number") {
                  const rel = comp.relativePercent ?? comp.relativeChangePercent;
                  const sign = rel > 0 ? "+" : "";
                  deltaText = `${sign}${rel.toFixed(1)}%`;
                  if (rel > 0) deltaType = positiveIsGood ? "good" : "bad";
                  else if (rel < 0) deltaType = positiveIsGood ? "bad" : "good";
                } else if (typeof comp.absoluteChange === "number") {
                  const abs = comp.absoluteChange;
                  const sign = abs > 0 ? "+" : "";
                  deltaText = `${sign}${formatMetricValue(abs, card.unit, card.currencyCode || currencyCode)}`;
                  if (abs > 0) deltaType = positiveIsGood ? "good" : "bad";
                  else if (abs < 0) deltaType = positiveIsGood ? "bad" : "good";
                }
              }

              const deltaColor =
                metric === "spend" ? "text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/40" : deltaType === "good"
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
                  : deltaType === "bad"
                  ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40"
                  : "text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40";

              return (
                <div
                  key={metric + index}
                  className="report-kpi-card flex flex-col justify-between p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/80 bg-white dark:bg-slate-900/60 shadow-xs hover:border-blue-200 dark:hover:border-blue-900/40 transition-all"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="report-kpi-label text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate">
                      {label}
                    </span>
                    {card.status && card.status !== "available" && card.status !== "ok" && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 uppercase">
                        {card.status === "missing_data" ? "Not available" : card.status.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline justify-between gap-2 mt-1.5">
                    <span className="report-kpi-value text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                      {formattedValue}
                    </span>

                    {deltaText && (
                      <div
                        className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold ${deltaColor}`}
                        title={comparisonTooltip}
                      >
                        {comp?.absoluteChange > 0 ? (
                          <TrendingUp size={11} />
                        ) : comp?.absoluteChange < 0 ? (
                          <TrendingDown size={11} />
                        ) : (
                          <Minus size={11} />
                        )}
                        <span>{deltaText}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
