import React from "react";
import ReportHeader from "./ReportHeader";
import ChatMessageText from "./ChatMessageText";
import ReportKPICards from "./ReportKPICards";
import ReportCharts from "./ReportCharts";
import ReportTable from "./ReportTable";
import ReportFollowUps from "./ReportFollowUps";
import { ReportEmptyState, ReportUnavailableState, ReportWarningsBanner } from "./ReportStates";
import { friendlyTableTitle, resolvePeriodWindow } from "./reportDisplay";
import "./ReportWorkspace.css";

// The "data is still updating / Amazon is still attributing" caveats. They are
// only meaningful while the numbers can still change — not on fully-settled,
// fully-verified periods.
const SETTLING_NOTE = /IMPORT_COVERAGE_UNVERIFIED|attribution window|imported figures are provisional|complete source coverage is unverified|complete data completeness is unverified|ROWS_NOT_FROM_COMPLETED_IMPORT|NEWER_INCOMPLETE_IMPORT|still updating|totals may change|mature within/i;

function maxAttributionWindow(report) {
  const windows = (report?.scope?.profiles || [])
    .flatMap(profile => Object.values(profile?.attributionWindows || {}))
    .filter(value => typeof value === "number" && value > 0);
  return windows.length ? Math.max(...windows) : 14;
}

// True when the figures can genuinely still change: the report is flagged
// incomplete, or its period is recent enough to still sit inside the
// attribution window. A verified report over a settled period is done moving.
function dataStillSettling(report) {
  const freshness = report?.freshness?.status;
  if (freshness && freshness !== "verified" && freshness !== "complete") return true;

  const current = resolvePeriodWindow(report?.periods, "current");
  const endText = current?.toDate;
  if (!endText) return true; // unknown period — keep the caveat rather than hide a real one
  const end = new Date(`${endText}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return true;

  const asOf = report?.freshness?.dataAsOf ? new Date(report.freshness.dataAsOf) : new Date();
  const ageDays = (asOf.getTime() - end.getTime()) / 86400000;
  return ageDays <= maxAttributionWindow(report) + 1;
}

// Columns that mark a real per-entity / per-time breakdown. If a dataset has
// none of these, its rows are just the account/profile aggregate.
const BREAKDOWN_KEYS = new Set([
  "campaignId", "keywordId", "adGroupId", "targetId", "ruleId", "entityId",
  "campaign", "keyword", "adGroup", "ad_group", "search_term", "searchTerm",
  "placement", "product", "asin", "rule", "date", "hour", "weekday",
]);

// A single aggregate row with no breakdown dimension just restates the KPI
// cards (e.g. "yesterday's ACOS" -> one SP / selected-profile row). When cards
// already show those numbers, the table is a duplicate and adds only noise.
function duplicatesKpiCards(dataset, hasCards) {
  if (!hasCards || !dataset) return false;
  const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
  if (rows.length !== 1) return false;
  const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
  return !columns.some(column => BREAKDOWN_KEYS.has(column.key));
}

export default function ChatReportRenderer({
  report,
  onFollowUp,
  isExpanded = false,
  onToggleExpand,
  isDark = false,
  profileNames = {},
  layoutVariant = "compact",
}) {
  if (!report || typeof report !== "object") return null;

  const currencyCode =
    report.scope?.profiles?.[0]?.currencyCode ||
    report.scope?.currencyGroups?.[0]?.currencyCode ||
    "USD";

  const status = report.status || "ok";
  const isWorkspace = layoutVariant === "workspace";
  const rawWarnings = status === "unavailable"
    ? [...(report.warnings || []), ...(report.freshness?.missingInputs || [])]
    : (report.warnings || []);
  // Show the "still settling" attribution/coverage notes only when they apply;
  // drop them on fully-settled, verified reports. Other warnings always pass.
  const warnings = dataStillSettling(report)
    ? rawWarnings
    : rawWarnings.filter(warning => !SETTLING_NOTE.test(String(warning)));

  // Handle unavailable status
  if (status === "unavailable") {
    return (
      <div className="flex flex-col gap-2.5 mt-2">
        <ReportHeader
          report={report}
          profileNames={profileNames}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
        />
        <ReportUnavailableState
          reason={report.text || "Report data is unavailable."}
          hasSuggestions={Array.isArray(report.followUps) && report.followUps.length > 0}
        />
        <ReportWarningsBanner warnings={warnings} collapsible={isWorkspace} />
        <ReportFollowUps followUps={report.followUps} onFollowUp={onFollowUp} />
      </div>
    );
  }

  // Handle verified empty status
  if (status === "empty") {
    return (
      <div className="flex flex-col gap-2.5 mt-2">
        <ReportHeader
          report={report}
          profileNames={profileNames}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
        />
        <ReportEmptyState
          message={report.text || "No records found matching criteria."}
        />
        <ReportWarningsBanner warnings={warnings} collapsible={isWorkspace} />
        <ReportFollowUps followUps={report.followUps} onFollowUp={onFollowUp} />
      </div>
    );
  }

  // Find visual chart and table blocks from report.blocks or datasets
  const blocks = Array.isArray(report.blocks) ? report.blocks : [];
  const chartBlocks = blocks.filter((b) =>
    ["line", "bar", "grouped_bar", "donut", "heatmap"].includes(b.type)
  );
  const textBlocks = blocks.filter((b) => b.type === "text");

  // Determine datasets to render as tables:
  const tableBlocks = blocks.filter((b) => b.type === "table");
  const hasSpecializedTables = tableBlocks.some((b) =>
    b.datasetId && /(?:opportunities|no_sales|high_acos|movers)/.test(b.datasetId)
  );
  const datasets = Array.isArray(report.datasets) ? report.datasets : [];
  const hasCards = Array.isArray(report.cards) && report.cards.length > 0;
  const visibleTableBlocks = (hasSpecializedTables
    ? tableBlocks.filter((b) => !/^report_\d+$/.test(b.datasetId || ""))
    : tableBlocks
  ).filter((tb) => {
    const ds = datasets.find((d) => d.id === tb.datasetId);
    return ds && Array.isArray(ds.rows) && ds.rows.length > 0 && !duplicatesKpiCards(ds, hasCards);
  });
  const weekdayLabels = report.category === "time" && datasets.some(dataset => (
    dataset.columns?.some(column => column.key === "weekday")
  ));
  const hourlyLabels = weekdayLabels && datasets.some(dataset => (
    dataset.columns?.some(column => column.key === "hour")
  ));
  const showTablesOnDemand = isWorkspace && chartBlocks.length > 0;
  const TableContainer = showTablesOnDemand ? "details" : "div";

  return (
    <div className={`chat-report flex flex-col min-w-0 ${isWorkspace ? "gap-5 mt-4" : "gap-3 mt-2"}`} data-layout={layoutVariant}>
      {/* 1. Header (Category, Date Range, Currency, Freshness, Expand button) */}
      <ReportHeader
        report={report}
        profileNames={profileNames}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
      />

      {/* Synthetic Fixture Indicator if applicable */}
      {report.fixtureLabel && (
        <div className="text-[10px] italic text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/40 p-1 rounded text-center">
          {report.fixtureLabel}
        </div>
      )}

      {/* 2. KPI Cards Grid (spend, sales, acos, roas, orders, cpc, cvr) */}
      {Array.isArray(report.cards) && report.cards.length > 0 && (
        <div className="report-section-card relative z-10 hover:z-20 transition-all">
          {isWorkspace && <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Key metrics</h3>}
          <ReportKPICards
            cards={report.cards}
            profileNames={profileNames}
            periods={report.periods}
            currencyCode={currencyCode}
            isExpanded={isExpanded}
          />
        </div>
      )}

      {/* 3. Text Blocks / Descriptions */}
      {textBlocks.map((b, idx) => (
        <div
          key={idx}
          className="text-xs text-gray-700 dark:text-gray-300 bg-blue-50/40 dark:bg-blue-950/20 p-2 rounded-lg border border-blue-100/50 dark:border-blue-900/30 leading-relaxed"
        >
          <details><summary className="cursor-pointer font-medium">About this report</summary><div className="mt-2"><ChatMessageText text={b.text} isReport /></div></details>
        </div>
      ))}

      {/* 4. Chart Blocks (Line, Bar, Grouped Bar, Donut, Heatmap) */}
      {chartBlocks.map((b, idx) => (
        <div key={idx} className="report-section-card relative z-10 hover:z-30 focus-within:z-30 transition-all overflow-visible">
          <ReportCharts
            block={b}
            datasets={datasets}
            currencyCode={currencyCode}
            isDark={isDark}
            isExpanded={isExpanded}
            profileNames={profileNames}
            periods={report.periods}
          />
        </div>
      ))}

      {/* 5. Tables */}
      {tableBlocks.length > 0 ? (
        visibleTableBlocks.map((tb, idx) => {
          const ds = datasets.find((d) => d.id === tb.datasetId);
          if (!ds) return null;
          return (
            <TableContainer key={idx} className="report-section-card report-table-details relative z-10 hover:z-30 focus-within:z-30 transition-all min-w-0">
              {showTablesOnDemand && (
                <summary className="cursor-pointer rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 focus-visible:outline-blue-500">
                  View data: {friendlyTableTitle(tb.title, report.periods)}
                  <span className="ml-2 font-normal text-xs">{ds.rows?.length || 0} {ds.rows?.length === 1 ? "row" : "rows"}</span>
                </summary>
              )}
              <ReportTable
                dataset={ds}
                weekdayLabels={weekdayLabels}
                hourlyLabels={hourlyLabels}
                profileNames={profileNames}
                periods={report.periods}
                title={tb.title}
                currencyCode={currencyCode}
                isExpanded={isExpanded}
              />
            </TableContainer>
          );
        })
      ) : (
        // Auto-render dataset table if datasets exist and there are no chart blocks
        chartBlocks.length === 0 &&
        datasets.length > 0 &&
        datasets[0]?.rows?.length > 0 &&
        !duplicatesKpiCards(datasets[0], hasCards) && (
          <div className="report-section-card relative z-10 hover:z-30 focus-within:z-30 transition-all overflow-visible">
            <ReportTable
              dataset={datasets[0]}
              weekdayLabels={weekdayLabels}
              hourlyLabels={hourlyLabels}
              profileNames={profileNames}
              periods={report.periods}
              currencyCode={currencyCode}
              isExpanded={isExpanded}
            />
          </div>
        )
      )}

      {/* 6. Warnings Callout (attributions, provisional data, prerequisites) */}
      <ReportWarningsBanner warnings={warnings} collapsible={isWorkspace} />

      {/* 7. Suggested Follow-ups */}
      <ReportFollowUps followUps={report.followUps} onFollowUp={onFollowUp} />
    </div>
  );
}
