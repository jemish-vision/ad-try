import React, { useLayoutEffect, useRef, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { cartesianData, donutData, formatChartValue, heatmapData } from "./reportChartData";
import { cleanCategoryLabel, friendlyChartLabel, friendlyChartTitle, friendlyLabel } from "./reportDisplay";

const CHART_COLORS = ["#2374F2", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
const CARTESIAN_TYPES = ["line", "bar", "grouped_bar"];

function attachTooltipClamper(chartContext) {
  const canvas = chartContext?.el;
  if (!canvas) return;

  canvas.style.overflow = "visible";
  const svg = canvas.querySelector("svg");
  if (svg) svg.style.overflow = "visible";

  const tooltip = canvas.querySelector(".apexcharts-tooltip");
  if (!tooltip || tooltip.__clamperAttached) return;
  tooltip.__clamperAttached = true;

  tooltip.style.zIndex = "99999";
  tooltip.style.pointerEvents = "none";
  tooltip.style.whiteSpace = "normal";
  tooltip.style.maxWidth = "280px";
}

function chartOptions(isDark) {
  return {
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: "Inter, system-ui, sans-serif",
      background: "transparent",
      parentHeightOffset: 0,
      events: {
        mounted: context => attachTooltipClamper(context),
        updated: context => attachTooltipClamper(context),
      },
    },
    theme: { mode: isDark ? "dark" : "light" },
    colors: CHART_COLORS,
    grid: { borderColor: isDark ? "#334155" : "#e2e8f0", strokeDashArray: 3 },
    dataLabels: { enabled: false },
    stroke: { curve: "straight", width: 2 },
    legend: { position: "bottom", fontSize: "11px" },
    noData: { text: "Chart data is unavailable" },
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function paintHeatmapCoverage(chartContext, series, isDark) {
  // ApexCharts shades null like zero internally. Restore the visual distinction
  // using the original coverage metadata after each library render.
  const rectangles = chartContext.el?.querySelectorAll(".apexcharts-heatmap-rect") || [];

  for (const rectangle of rectangles) {
    const cell = series[Number(rectangle.getAttribute("i"))]?.data[Number(rectangle.getAttribute("j"))];
    if (!cell) continue;

    rectangle.setAttribute("data-coverage-status", cell.status);

    if (cell.y === null) {
      const excluded = ["filtered", "insufficient_sample"].includes(cell.status);
      rectangle.setAttribute("fill", excluded ? (isDark ? "#78350f" : "#fef3c7") : (isDark ? "#334155" : "#e2e8f0"));
    }

    const label = `${cell.x}: ${cell.y === null ? "Unavailable" : cell.y}; ${cell.status.replace(/_/g, " ")}`;
    rectangle.setAttribute("aria-label", label);
    let title = rectangle.querySelector("title");

    if (!title) {
      title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      rectangle.appendChild(title);
    }

    title.textContent = label;
  }
}

function chartContent(block, dataset, isDark, isExpanded, currencyCode, chartWidth, profileNames, categoryLimit) {
  const options = chartOptions(isDark);
  const format = (value, key) => formatChartValue(
    value,
    dataset.columns.find(column => column.key === key)?.unit,
    dataset.currencyCode || currencyCode,
  );

  if (CARTESIAN_TYPES.includes(block.type)) {
    const data = cartesianData(block, dataset);
    data.categories = data.categories.map(label => friendlyChartLabel(label, profileNames));
    const horizontal = block.type === "bar";
    const formatValue = value => format(value, data.keys[0]);

    if (!data.series.some(series => series.data.some(value => value !== null))) {
      return <p className="text-xs text-gray-500">No observed values are available for this chart.</p>;
    }

    const isGrouped = block.type === "grouped_bar";
    const totalCount = data.categories.length;
    const isLimited = isGrouped && totalCount > 8 && categoryLimit && categoryLimit < totalCount;
    const displayCategories = isLimited ? data.categories.slice(0, categoryLimit) : data.categories;
    const displaySeries = isLimited
      ? data.series.map(s => ({ ...s, data: s.data.slice(0, categoryLimit) }))
      : data.series;

    // Clean axis labels (strip repetitive profile/adType prefix like "Tagdo SP · " or "Selected profile · ")
    const axisCategories = displayCategories.map(cat => cleanCategoryLabel(cat, profileNames));

    // When there are many categories, ensure generous minimum category width so bars never compress into slivers
    const minCategoryWidth = isGrouped ? (isExpanded ? 68 : 56) : 48;
    const totalNeededWidth = displayCategories.length * minCategoryWidth;
    const hasHorizontalOverflow = !horizontal && typeof chartWidth === "number" && totalNeededWidth > chartWidth;
    const effectiveChartWidth = hasHorizontalOverflow ? totalNeededWidth : chartWidth;

    return (
      <div
        className={horizontal ? "overflow-y-auto overflow-x-visible relative" : "relative overflow-visible"}
        style={{ maxHeight: horizontal ? (isExpanded ? 520 : 360) : undefined }}
      >
        <div className={hasHorizontalOverflow ? "overflow-x-auto overflow-y-visible pb-1.5 pt-0.5 relative" : "w-full overflow-visible"}>
          <div style={{ minWidth: hasHorizontalOverflow ? effectiveChartWidth : undefined }}>
            <ReactApexChart
              key={`cartesian-${effectiveChartWidth}-${displayCategories.length}`}
              width={effectiveChartWidth}
              type={block.type === "line" ? "line" : "bar"}
              series={displaySeries}
              height={horizontal ? Math.max(200, data.categories.length * 34 + 60) : (isExpanded ? 280 : 230)}
              options={{
                ...options,
                stroke: { ...options.stroke, width: block.type === "line" ? 2 : 0 },
                plotOptions: {
                  bar: {
                    horizontal,
                    borderRadius: 3,
                    borderRadiusApplication: "end",
                    columnWidth: isGrouped
                      ? (displayCategories.length <= 6 ? "42%" : (displayCategories.length <= 10 ? "52%" : "65%"))
                      : "55%",
                  },
                },
                xaxis: {
                  categories: axisCategories,
                  labels: {
                    trim: true,
                    rotate: horizontal ? 0 : (displayCategories.length > 5 ? -25 : 0),
                    rotateAlways: false,
                    style: { fontSize: "10px", fontFamily: "Inter, system-ui, sans-serif" },
                    ...(horizontal ? { formatter: formatValue } : {}),
                  },
                },
                yaxis: {
                  labels: {
                    maxWidth: isExpanded ? 260 : 130,
                    style: { fontSize: "10px", fontFamily: "Inter, system-ui, sans-serif" },
                    ...(!horizontal ? { formatter: formatValue } : {}),
                  },
                },
                tooltip: {
                  theme: isDark ? "dark" : "light",
                  followCursor: true,
                  x: { formatter: (value, context) => displayCategories[context?.dataPointIndex] ?? String(value) },
                  y: { formatter: (value, context) => format(value, data.keys[context?.seriesIndex || 0]) },
                },
              }}
            />
          </div>
        </div>
        {hasHorizontalOverflow && (
          <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 pt-1 px-1">
            <span>Showing all {displayCategories.length} entities</span>
            <span>← Scroll horizontally to view all →</span>
          </div>
        )}
      </div>
    );
  }

  if (block.type === "donut") {
    const data = donutData(block, dataset);
    data.labels = data.labels.map(label => friendlyChartLabel(label, profileNames));

    if (!data.series.some(value => value > 0)) {
      return <p className="text-xs text-gray-500">No positive observed values are available for a share chart.</p>;
    }

    const total = data.series.reduce((sum, value) => sum + value, 0);
    const breakdown = data.labels.map((label, index) => {
      const value = data.series[index] || 0;
      const percent = total > 0 ? (value / total) * 100 : 0;
      const color = CHART_COLORS[index % CHART_COLORS.length];
      return { label, value, percent, color };
    });

    const metricCol = dataset.columns?.find(column => column.key === data.key);
    const metricLabel = metricCol?.label || (data.key ? data.key.charAt(0).toUpperCase() + data.key.slice(1) : "Total");

    const donutOptions = {
      ...options,
      labels: data.labels,
      colors: CHART_COLORS,
      stroke: {
        width: 3,
        colors: [isDark ? "#0f172a" : "#ffffff"],
      },
      legend: {
        show: false,
      },
      dataLabels: {
        enabled: false,
      },
      tooltip: {
        theme: isDark ? "dark" : "light",
        followCursor: true,
        fillSeriesColor: false,
        style: {
          fontSize: "12px",
          fontFamily: "Inter, system-ui, sans-serif",
        },
        y: {
          formatter: (value) => {
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
            return `${format(value, data.key)} (${pct}%)`;
          },
        },
      },
      plotOptions: {
        pie: {
          donut: {
            size: "70%",
            labels: {
              show: true,
              name: {
                show: true,
                fontSize: "11px",
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 600,
                color: isDark ? "#94a3b8" : "#64748b",
                offsetY: -4,
              },
              value: {
                show: true,
                fontSize: "18px",
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 700,
                color: isDark ? "#f8fafc" : "#0f172a",
                offsetY: 4,
                formatter: value => format(Number(value), data.key),
              },
              total: {
                show: true,
                showAlways: true,
                label: `Total ${metricLabel}`,
                fontSize: "11px",
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 600,
                color: isDark ? "#94a3b8" : "#64748b",
                formatter: () => format(total, data.key),
              },
            },
          },
        },
      },
    };

    return (
      <div className="space-y-3 overflow-visible">
        {data.missingCount > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Shares use observed values only; {data.missingCount} unavailable values are excluded.
          </p>
        )}
        <div className={isExpanded ? "grid grid-cols-1 md:grid-cols-12 gap-5 items-center overflow-visible" : "flex flex-col gap-3 overflow-visible"}>
          <div className={isExpanded ? "md:col-span-6 flex justify-center py-1 overflow-visible" : "flex justify-center py-1 overflow-visible"}>
            <div className="w-full max-w-[280px] flex justify-center overflow-visible relative">
              <ReactApexChart
                key={`donut-${chartWidth}`}
                type="donut"
                series={data.series}
                height={220}
                width={Math.min(typeof chartWidth === "number" ? chartWidth : 250, 280)}
                options={donutOptions}
              />
            </div>
          </div>

          <div className={isExpanded ? "md:col-span-6 space-y-2" : "space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800/80"}>
            {breakdown.map((item, idx) => (
              <div
                key={idx}
                className="group flex flex-col p-2 rounded-lg bg-gray-50/60 dark:bg-slate-800/30 hover:bg-gray-100/80 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-medium text-gray-800 dark:text-gray-200 truncate" title={item.label}>
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {format(item.value, data.key)}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 min-w-[42px] text-center">
                      {item.percent.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-gray-200/70 dark:bg-slate-700/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, item.percent))}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (block.type === "heatmap") {
    const data = heatmapData(block, dataset);

    return (
      <>
        <div className="overflow-x-auto overflow-y-visible relative">
          <div style={{ minWidth: isExpanded ? 560 : 440 }}>
            <ReactApexChart
              key={`heatmap-${chartWidth}`}
              width={Math.max(typeof chartWidth === "number" ? chartWidth : 0, isExpanded ? 560 : 440)}
              type="heatmap"
              series={data.series}
              height={isExpanded ? 300 : 260}
              options={{
                ...options,
                chart: {
                  ...options.chart,
                  events: {
                    mounted: context => {
                      paintHeatmapCoverage(context, data.series, isDark);
                      attachTooltipClamper(context);
                    },
                    updated: context => {
                      paintHeatmapCoverage(context, data.series, isDark);
                      attachTooltipClamper(context);
                    },
                  },
                },
                colors: ["#2374F2"],
                stroke: { width: 1, colors: [isDark ? "#0f172a" : "#ffffff"] },
                plotOptions: { heatmap: { radius: 2, enableShades: true } },
                xaxis: { labels: { rotate: -45, style: { fontSize: "9px" } } },
                yaxis: { labels: { style: { fontSize: "10px" } } },
                tooltip: {
                  theme: isDark ? "dark" : "light",
                  followCursor: true,
                  custom: ({ seriesIndex, dataPointIndex }) => {
                    const series = data.series[seriesIndex];
                    const cell = series?.data[dataPointIndex];
                    if (!cell) return "";
                    return `<div style="padding:8px">${escapeHtml(series.name)} ${escapeHtml(cell.x)}<br/>${escapeHtml(format(cell.y, data.key))}<br/>${escapeHtml(cell.status.replace(/_/g, " "))}</div>`;
                  },
                },
              }}
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-500">Grey cells are unavailable or outside the period; amber cells are excluded or below the sample threshold. These cells do not indicate zero. Hover a cell to inspect its coverage status.</p>
      </>
    );
  }

  return null;
}

export default function ReportCharts({
  block,
  datasets = [],
  currencyCode = "USD",
  isDark = false,
  isExpanded = false,
  profileNames = {},
  periods = null,
}) {
  const containerRef = useRef(null);
  const [chartWidth, setChartWidth] = useState("100%");
  const [categoryLimit, setCategoryLimit] = useState(8);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateWidth = () => {
      const width = Math.floor(container.getBoundingClientRect().width);
      if (width > 0) setChartWidth(width);
    };

    updateWidth();
    if (typeof ResizeObserver === "undefined") return undefined;

    // Chat can collapse from 860px to 420px without resizing the browser.
    // Measure its actual content width and recreate Apex's fixed-width SVG.
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isExpanded, block?.datasetId]);

  if (!block || typeof block !== "object") return null;

  const dataset = datasets.find(item => item.id === block.datasetId);
  const chartTitle = friendlyChartTitle(block?.title, profileNames, periods);
  const displayDataset = dataset && {
    ...dataset,
    columns: dataset.columns.map(column => ({
      ...column,
      label: friendlyLabel(column.key, column.label, periods),
    })),
  };

  const isGroupedBar = block.type === "grouped_bar";
  const totalCategories = (isGroupedBar && dataset?.rows)
    ? new Set(dataset.rows.map(row => String(row[block.xKey] ?? "Unknown"))).size
    : 0;
  const showLimitControls = isGroupedBar && totalCategories > 8;

  const limitOptions = showLimitControls ? [
    { key: "8", label: "Top 8", value: 8 },
    ...(totalCategories > 15 ? [{ key: "15", label: "Top 15", value: 15 }] : []),
    { key: "all", label: `All (${totalCategories})`, value: totalCategories },
  ] : [];

  return (
    <div className="report-chart-card min-w-0 p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-slate-900/60 shadow-sm transition-all relative z-10 hover:z-30 focus-within:z-30 overflow-visible">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        {chartTitle ? (
          <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 break-words flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span className="truncate">{chartTitle}</span>
          </div>
        ) : <div />}

        <div className="flex items-center gap-1.5 shrink-0">
          {showLimitControls && (
            <div className="inline-flex items-center rounded-lg p-0.5 bg-gray-100 dark:bg-slate-800 border border-gray-200/60 dark:border-gray-700/60 text-[10px]">
              {limitOptions.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setCategoryLimit(opt.value)}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                    categoryLimit === opt.value
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-semibold"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {block.type === "donut" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50 shrink-0">
              Share
            </span>
          )}
        </div>
      </div>
      <div ref={containerRef} className="w-full min-w-0 max-w-full">
        {displayDataset
          ? chartContent(block, displayDataset, isDark, isExpanded, currencyCode, chartWidth, profileNames, categoryLimit)
          : <p className="text-xs text-gray-500">The data for this chart is not available yet.</p>}
      </div>
    </div>
  );
}
