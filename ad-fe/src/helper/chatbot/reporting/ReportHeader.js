import React from "react";
import { Maximize2, Minimize2, CheckCircle2, AlertTriangle, AlertCircle, Calendar, Clock, Globe } from "lucide-react";

const CATEGORY_TITLES = {
  summary: "Performance Summary",
  comparison: "Period Comparison",
  change: "Performance Changes",
  waste: "Waste Identification",
  growth: "Growth Opportunities",
  time: "Time Analysis",
  products: "Product Analysis",
  rules: "Rule History",
  unusual: "Unusual Account Changes",
  definition: "Metric Definition",
};

export default function ReportHeader({
  report,
  isExpanded,
  onToggleExpand,
  profileNames = {},
}) {
  if (!report) return null;

  const category = report.category || "summary";
  const title = CATEGORY_TITLES[category] || "Advertising Report";
  const freshness = report.freshness?.status || "verified";
  const hasRows = (report.datasets || []).some((d) => Array.isArray(d.rows) && d.rows.length > 0);
  const hasCards = Array.isArray(report.cards) && report.cards.length > 0;
  const hasContent = hasRows || hasCards;

  // Resolve active profile & period details
  const profile = report.scope?.profiles?.[0] || {};
  const periods = report.periods;
  let currentPeriod = null;
  if (Array.isArray(periods) && periods.length > 0) {
    currentPeriod = periods[0]?.current;
  } else if (periods && typeof periods === "object") {
    const firstKey = Object.keys(periods)[0];
    currentPeriod = periods[firstKey]?.current;
  }

  const dateLabel = currentPeriod?.fromDate && currentPeriod?.toDate
    ? (currentPeriod.fromDate === currentPeriod.toDate
        ? currentPeriod.fromDate
        : `${currentPeriod.fromDate} → ${currentPeriod.toDate}`)
    : null;

  return (
    <div className="flex flex-col gap-1.5 pb-2 border-b border-gray-200 dark:border-gray-800 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            {title}
          </span>
          {(freshness === "verified" || freshness === "complete") && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 size={10} /> Verified
            </span>
          )}
          {freshness === "partial" && !hasContent && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <AlertTriangle size={10} /> Incomplete data
            </span>
          )}
          {freshness === "unavailable" && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              <AlertCircle size={10} /> Unavailable
            </span>
          )}
        </div>

        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse report view" : "Expand report view"}
            className="p-1 rounded text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}
      </div>

      {/* Scope / Metadata subtitles */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        {report.scope?.profiles?.length > 0 && (
          <span className="font-medium">
            {report.scope.profiles.length > 1
              ? `${report.scope.profiles.length} profiles`
              : profileNames[profile.profileId] || "Selected profile"}
          </span>
        )}
        {dateLabel && (
          <span className="inline-flex items-center gap-1">
            <Calendar size={11} className="opacity-70" />
            {dateLabel}
          </span>
        )}
        {profile.currencyCode && (
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {profile.currencyCode}
          </span>
        )}
        {profile.timezone && (
          <span className="inline-flex items-center gap-1">
            <Globe size={11} className="opacity-70" />
            {profile.timezone}
          </span>
        )}
        {report.freshness?.dataAsOf && (
          <span className="inline-flex items-center gap-1 opacity-75">
            <Clock size={11} />
            as of {new Date(report.freshness.dataAsOf).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
