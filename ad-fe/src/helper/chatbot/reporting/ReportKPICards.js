import React from "react";
import {
  ArrowUpRight, ArrowDownRight, Minus,
  Wallet, TrendingUp, Target, Gauge, ShoppingCart, MousePointerClick,
  MousePointer, Eye, Percent, Receipt, PiggyBank, Activity,
} from "lucide-react";
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

// A small, stable icon + accent hue per metric so a row of cards reads as a set
// at a glance instead of a wall of identical tiles. Accents are drawn from the
// validated chart palette; the hue is identity, never status.
const METRIC_VISUAL = {
  spend: { icon: Wallet, accent: "#64748b" },
  sales: { icon: TrendingUp, accent: "#10b981" },
  acos: { icon: Target, accent: "#f59e0b" },
  roas: { icon: Gauge, accent: "#8b5cf6" },
  orders: { icon: ShoppingCart, accent: "#06b6d4" },
  cpc: { icon: MousePointerClick, accent: "#ec4899" },
  clicks: { icon: MousePointer, accent: "#2374f2" },
  impressions: { icon: Eye, accent: "#2374f2" },
  cvr: { icon: Percent, accent: "#06b6d4" },
  ctr: { icon: Percent, accent: "#8b5cf6" },
  aov: { icon: Receipt, accent: "#10b981" },
  profit: { icon: PiggyBank, accent: "#10b981" },
  tacos: { icon: Target, accent: "#f59e0b" },
};
const DEFAULT_VISUAL = { icon: Activity, accent: "#2374f2" };

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
      // Pin the locale so card grouping matches the backend narrative (en-US),
      // instead of varying with each viewer's browser locale.
      return `${symbol}${Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "multiple":
      return `${Number(value).toFixed(2)}x`;
    case "count":
      return Number(value).toLocaleString("en-US");
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
              const visual = METRIC_VISUAL[metric] || DEFAULT_VISUAL;
              const Icon = visual.icon;

              let deltaText = null;
              let deltaType = "neutral"; // 'good' | 'bad' | 'neutral'
              let deltaValue = null; // the signed number behind deltaText, so the arrow matches the text

              if (comp && comp.status !== "unavailable") {
                const positiveIsGood = isPositiveGood(metric);

                if (typeof comp.percentagePoints === "number" || typeof comp.percentagePointChange === "number") {
                  const pp = comp.percentagePoints ?? comp.percentagePointChange;
                  const sign = pp > 0 ? "+" : "";
                  deltaText = `${sign}${pp.toFixed(1)} pts`;
                  deltaValue = pp;
                  if (pp > 0) deltaType = positiveIsGood ? "good" : "bad";
                  else if (pp < 0) deltaType = positiveIsGood ? "bad" : "good";
                } else if (typeof comp.relativePercent === "number" || typeof comp.relativeChangePercent === "number") {
                  const rel = comp.relativePercent ?? comp.relativeChangePercent;
                  const sign = rel > 0 ? "+" : "";
                  deltaText = `${sign}${rel.toFixed(1)}%`;
                  deltaValue = rel;
                  if (rel > 0) deltaType = positiveIsGood ? "good" : "bad";
                  else if (rel < 0) deltaType = positiveIsGood ? "bad" : "good";
                } else if (typeof comp.absoluteChange === "number") {
                  const abs = comp.absoluteChange;
                  const sign = abs > 0 ? "+" : "";
                  deltaText = `${sign}${formatMetricValue(abs, card.unit, card.currencyCode || currencyCode)}`;
                  deltaValue = abs;
                  if (abs > 0) deltaType = positiveIsGood ? "good" : "bad";
                  else if (abs < 0) deltaType = positiveIsGood ? "bad" : "good";
                }
              }

              const deltaColor =
                metric === "spend" ? "text-gray-600 dark:text-gray-300 bg-gray-100/80 dark:bg-gray-800/50" : deltaType === "good"
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
                  : deltaType === "bad"
                  ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40"
                  : "text-gray-500 dark:text-gray-400 bg-gray-100/80 dark:bg-gray-800/50";

              return (
                <div
                  key={metric + index}
                  className="report-kpi-card relative flex flex-col justify-between gap-2 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800/80 bg-white dark:bg-slate-900/60 shadow-xs overflow-hidden hover:-translate-y-0.5 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900/50 transition-all duration-150"
                >
                  {/* identity accent — hue follows the metric, not its value */}
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ backgroundColor: visual.accent, opacity: 0.9 }}
                    aria-hidden="true"
                  />

                  <div className="flex items-center justify-between gap-1">
                    <span className="report-kpi-label text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate">
                      {label}
                    </span>
                    {card.status && card.status !== "available" && card.status !== "ok" ? (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 uppercase">
                        {card.status === "missing_data" ? "Not available" : card.status.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                        style={{ color: visual.accent, backgroundColor: `${visual.accent}1f` }}
                        aria-hidden="true"
                      >
                        <Icon size={13} />
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="report-kpi-value text-[1.6rem] leading-none font-extrabold text-gray-900 dark:text-gray-100 tracking-tight tabular-nums">
                      {formattedValue}
                    </span>

                    {deltaText && (
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10.5px] font-bold tabular-nums ${deltaColor}`}
                          title={comparisonTooltip}
                        >
                          {deltaValue > 0 ? (
                            <ArrowUpRight size={12} />
                          ) : deltaValue < 0 ? (
                            <ArrowDownRight size={12} />
                          ) : (
                            <Minus size={12} />
                          )}
                          <span>{deltaText}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">vs prev</span>
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
