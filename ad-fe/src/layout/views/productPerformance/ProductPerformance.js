import React, { useState, useEffect, useContext, useCallback, useMemo } from "react";
import moment from "moment";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import AgTable from "../../../common/grid/AgTable";
import Toast from "../../../common/helper/toast/Toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "../../../components/ui/popover";
import { Dialog, DialogContent } from "../../../components/ui/dialog";
import { Checkbox } from "../../../components/ui/checkbox";
import { ApiGetProductTrend } from "../../../api-wrapper/productPerformance/ApiProductPerformance";

const METRICS = [
  { value: "sales", label: "Total Sales", type: "currency" },
  { value: "orders", label: "Orders", type: "integer" },
  { value: "adSpend", label: "Ad Spend", type: "currency" },
  { value: "adSales", label: "Ad Sales", type: "currency" },
  { value: "acos", label: "ACoS", type: "percent", lowerIsBetter: true },
  { value: "tacos", label: "TACoS", type: "percent", lowerIsBetter: true },
  { value: "roas", label: "ROAS", type: "ratio" },
  { value: "clicks", label: "Clicks", type: "integer" },
  { value: "impressions", label: "Impressions", type: "integer" },
];

const GRANULARITIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
];

const PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
];

const formatValue = (val, type) => {
  if (val === null || val === undefined || isNaN(val)) {
    if (type === "integer") return "0";
    if (type === "currency") return "₹0";
    if (type === "percent") return "0.00%";
    if (type === "ratio") return "0.00x";
    return "0";
  }
  const n = Number(val);
  switch (type) {
    case "currency":
      return `₹${n.toLocaleString("en-IN", {
        minimumFractionDigits: n % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${n.toFixed(2)}%`;
    case "ratio":
      return `${n.toFixed(2)}x`;
    case "integer":
      return Math.round(n).toLocaleString("en-IN");
    case "number":
    default:
      return n.toLocaleString("en-IN", {
        minimumFractionDigits: n % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      });
  }
};

const pctChange = (curr, prev) => {
  if (prev === undefined || prev === null || Number(prev) === 0) return null;
  return ((Number(curr || 0) - Number(prev)) / Math.abs(Number(prev))) * 100;
};

const ChangeBadge = ({ change, lowerIsBetter }) => {
  if (change === null || change === undefined || !isFinite(change)) {
    return null;
  }
  const up = change > 0;
  const flat = Math.abs(change) < 0.005;
  const good = lowerIsBetter ? !up : up;
  const color = flat ? "text-slate-400" : good ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  return (
    <span className={`text-[10px] font-bold ${color} mt-0.5`}>
      {flat ? "0.00%" : `${up ? "+" : ""}${change.toFixed(2)}%`}
    </span>
  );
};

// Smooth SVG Sparkline component for TREND column with soft gradient area
const Sparkline = ({ points = [], color = "emerald", width = 68, height = 22 }) => {
  if (!points || points.length < 2) {
    return <span className="text-slate-300 text-xs">—</span>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = height - pad - ((p - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const pathD = `M ${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ")}`;
  const areaD = `${pathD} L ${coords[coords.length - 1][0].toFixed(1)},${height} L ${coords[0][0].toFixed(1)},${height} Z`;

  const colorMap = {
    emerald: { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.22)" },
    rose: { stroke: "#f43f5e", fill: "rgba(244, 63, 94, 0.22)" },
    blue: { stroke: "#3b82f6", fill: "rgba(59, 130, 246, 0.22)" },
    indigo: { stroke: "#6366f1", fill: "rgba(99, 102, 241, 0.22)" },
    amber: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.22)" },
  };
  const theme = colorMap[color] || colorMap.emerald;

  return (
    <div className="flex items-center justify-center">
      <svg width={width} height={height} className="overflow-visible">
        <path d={areaD} fill={theme.fill} />
        <path
          d={pathD}
          fill="none"
          stroke={theme.stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// Two-line header component
const TwoLineHeader = (props) => {
  const { title, subLabel } = props;
  return (
    <div className="flex flex-col items-center justify-center text-center leading-tight py-1 w-full select-none">
      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">
        {title}
      </span>
      {subLabel && (
        <span className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5">
          {subLabel}
        </span>
      )}
    </div>
  );
};

// Stock at Amazon Popover breakdown matching reference toaster
const InventoryPopover = ({ row }) => {
  const [open, setOpen] = useState(false);
  const inv = row?.inventoryDetails || {
    available: 0,
    inTransfer: 0,
    onHand: row?.stock || 0,
    sellerFlex: 0,
    reportDate: null,
    warehouses: [],
  };

  const onHand = inv.onHand || row?.stock || 0;
  const available = inv.available ?? onHand;
  const inTransfer = inv.inTransfer ?? 0;
  const sellerFlex = inv.sellerFlex ?? 0;
  const warehouses = inv.warehouses || [];

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((prev) => !prev);
            }}
            className="flex flex-col items-center justify-center leading-tight py-1 w-full text-center group cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/70 rounded-md px-1 transition-colors"
          >
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
              {onHand === null || onHand === undefined ? "-" : Number(onHand).toLocaleString("en-IN")}
            </span>
            <span className="text-[9px] font-semibold text-slate-400 group-hover:text-blue-500 uppercase mt-0.5 tracking-wider">
              FBA
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="w-72 p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[100000] text-xs space-y-3"
        >
          {/* Top Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 text-xs">
              <span>Stock at Amazon</span>
              <i className="fa-regular fa-copy text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer" title="Copy info" />
            </div>
          </div>

          {/* Stock Breakdown */}
          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center justify-between">
              <span>Available</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{Number(available).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>In transfer between FCs</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{Number(inTransfer).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>On hand</span>
              <span>{Number(onHand).toLocaleString("en-IN")}</span>
            </div>
          </div>

          {/* Inventory by Warehouse Section */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">Inventory by warehouse</span>
              {inv.reportDate && (
                <span className="text-[10px] text-slate-400">{inv.reportDate}</span>
              )}
            </div>

            {/* Seller Flex vs Amazon FC Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center">
                <div className="text-[10px] text-slate-400">Seller Flex</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{sellerFlex}</div>
              </div>
              <div className="p-2 rounded-lg bg-orange-50/70 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 text-center">
                <div className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">Amazon FC</div>
                <div className="text-sm font-bold text-orange-600 dark:text-orange-400 mt-0.5">{Number(onHand).toLocaleString("en-IN")}</div>
              </div>
            </div>

            {/* Where it sits */}
            <div className="pt-1">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">WHERE IT SITS</div>
              <div className="max-h-40 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                {warehouses.length > 0 ? (
                  warehouses.map((w, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{w.fcCode}</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {Number(w.qty || w.available || 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] text-slate-400 text-center py-2">No warehouse stock data</div>
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Available metric rows for the product detail modal matching reference screenshot
const METRIC_ROWS = [
  { key: "sales", label: "Total Sales", type: "currency", color: "emerald" },
  { key: "orders", label: "Total Orders", type: "integer", color: "rose" },
  { key: "units", label: "Total Units", type: "integer", color: "rose" },
  { key: "organicSales", label: "Organic Sales", type: "currency", color: "emerald" },
  { key: "organicOrders", label: "Organic Units", type: "integer", color: "rose" },
  { key: "adSpend", label: "Ad Spend", type: "currency", color: "indigo" },
  { key: "adSales", label: "Ad Sales", type: "currency", color: "blue" },
  { key: "adOrders", label: "Ad Orders", type: "integer", color: "amber" },
  { key: "roas", label: "ROAS", type: "ratio", color: "blue" },
  { key: "acos", label: "ACOS", type: "percent", color: "amber", lowerIsBetter: true },
  { key: "tacos", label: "TACOS", type: "percent", color: "amber", lowerIsBetter: true },
  { key: "impressions", label: "Impressions", type: "integer", color: "blue" },
  { key: "clicks", label: "Clicks", type: "integer", color: "blue" },
  { key: "cpc", label: "CPC", type: "currency", color: "indigo", lowerIsBetter: true },
];

// Product detail modal displaying multi-metric breakdown table across all periods
const ProductDetailModal = ({
  open,
  onOpenChange,
  product,
  buckets = [],
  rangeLabel = "",
  nextPeriodLabel = "",
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleMetricKeys, setVisibleMetricKeys] = useState(
    METRIC_ROWS.map((m) => m.key)
  );

  if (!product) return null;

  const toggleMetric = (key) => {
    setVisibleMetricKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllMetrics = () => {
    setVisibleMetricKeys(METRIC_ROWS.map((m) => m.key));
  };

  const resetMetrics = () => {
    setVisibleMetricKeys([
      "sales",
      "orders",
      "units",
      "organicSales",
      "organicOrders",
      "adSpend",
      "adSales",
      "roas",
      "acos",
    ]);
  };

  const activeRows = METRIC_ROWS.filter((m) => visibleMetricKeys.includes(m.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className={
          isFullscreen
            ? "!fixed !inset-0 !w-screen !h-screen !max-w-none !max-h-none !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0 z-[100000] p-0 overflow-hidden flex flex-col bg-white dark:bg-slate-900 border-0 shadow-2xl"
            : "!fixed !top-1/2 !left-1/2 !-translate-x-1/2 !-translate-y-1/2 !w-[94vw] !max-w-6xl !h-[86vh] !max-h-[86vh] rounded-2xl z-[100000] p-0 overflow-hidden flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl"
        }
      >
        {/* Modal Top Header matching reference screenshot */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          {/* Left: Thumbnail & Meta */}
          <div className="flex items-center gap-3 overflow-hidden pr-4">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt=""
                className="w-10 h-10 rounded-md object-contain border border-slate-200 dark:border-slate-700 bg-white shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center">
                <i className="fa-solid fa-box text-slate-400 text-sm" />
              </div>
            )}
            <div className="flex flex-col overflow-hidden leading-tight">
              <h2
                className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-100 truncate"
                title={product.title}
              >
                {product.title || product.sku || product.asin}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                <span className="flex items-center gap-1">
                  ASIN: <b className="text-slate-700 dark:text-slate-200 font-semibold">{product.asin}</b>
                  <a
                    href={`https://www.amazon.in/dp/${product.asin}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-blue-500 ml-0.5"
                  >
                    ↗
                  </a>
                </span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span>
                  SKU: <b className="text-slate-700 dark:text-slate-200 font-semibold">{product.sku || "-"}</b>
                </span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span>
                  Data Points: <b className="text-slate-700 dark:text-slate-200 font-semibold">{buckets.length}</b>
                </span>
              </div>
            </div>
          </div>

          {/* Right Action Icons: Fullscreen, Columns, Close */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Fullscreen / Restore Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              title={isFullscreen ? "Restore size" : "Expand to fullscreen"}
            >
              <i className={`fa-solid ${isFullscreen ? "fa-compress" : "fa-expand"} text-xs`} />
            </button>

            {/* Columns Customizer Dropdown */}
            <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <span>Columns</span>
                  <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-56 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-[100010] text-xs space-y-2"
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Visible Metrics</span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={selectAllMetrics}
                      className="text-blue-600 hover:underline"
                    >
                      All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={resetMetrics}
                      className="text-slate-500 hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {METRIC_ROWS.map((m) => {
                    const checked = visibleMetricKeys.includes(m.key);
                    return (
                      <label
                        key={m.key}
                        className="flex items-center gap-2 p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-slate-700 dark:text-slate-300"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleMetric(m.key)}
                        />
                        <span className="text-xs">{m.label}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              title="Close"
            >
              <i className="fa-solid fa-times text-sm" />
            </button>
          </div>
        </div>

        {/* Modal Table Container with horizontal & vertical scroll */}
        <div className="flex-1 overflow-auto bg-slate-50/20 dark:bg-slate-900/20">
          <table className="w-full border-collapse text-xs text-left">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 z-30 border-b border-slate-200 dark:border-slate-800 shadow-sm">
              <tr>
                {/* 1. METRIC Header (sticky left 0) */}
                <th className="sticky left-0 bg-white dark:bg-slate-900 z-40 px-4 py-2.5 font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-tight w-[140px] min-w-[140px] border-r border-slate-200 dark:border-slate-800">
                  METRIC
                </th>

                {/* 2. TREND Header (sticky left 140) */}
                <th className="sticky left-[140px] bg-white dark:bg-slate-900 z-40 px-2 py-2.5 font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-tight text-center w-[95px] min-w-[95px] border-r border-slate-200 dark:border-slate-800">
                  TREND
                </th>

                {/* 3. RANGE TOTAL Header (sticky left 235) */}
                <th className="sticky left-[235px] bg-white dark:bg-slate-900 z-40 px-3 py-1.5 text-center w-[125px] min-w-[125px] border-r border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col items-center justify-center leading-tight">
                    <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-tight">
                      RANGE TOTAL
                    </span>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5">
                      {rangeLabel || "RANGE"}
                    </span>
                  </div>
                </th>

                {/* 4. FORECAST Header (sticky left 360 with drop shadow) */}
                <th className="sticky left-[360px] bg-white dark:bg-slate-900 z-40 px-3 py-1.5 text-center w-[135px] min-w-[135px] border-r border-slate-200 dark:border-slate-800 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)]">
                  <div className="flex flex-col items-center justify-center leading-tight">
                    <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-tight flex items-center gap-1 justify-center">
                      <span>FORECAST</span>
                      <i className="fa-solid fa-circle-info text-[9px] text-slate-400" title="Projected metrics for next period" />
                    </span>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5">
                      {nextPeriodLabel || "NEXT PERIOD"}
                    </span>
                  </div>
                </th>

                {/* 5. Date Bucket Headers (scrollable) */}
                {buckets.map((b) => (
                  <th
                    key={b.key}
                    className="px-3 py-1.5 text-center min-w-[105px] border-r border-slate-100 dark:border-slate-800"
                  >
                    <TwoLineHeader title={b.title} subLabel={b.subLabel} />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {activeRows.map((m) => {
                // Calculate chronological trend points for sparkline
                const sparkPoints = [...(product?.buckets || [])].reverse().map((b) => Number(b[m.key] || 0));

                // Range total for this metric
                const rangeTotalVal = product?.total?.[m.key] ?? 0;

                // Forecast projection
                let forecastVal = rangeTotalVal;
                let lastMonthVal = rangeTotalVal;
                let growthVal = product?.forecast?.growth ?? 10.0;

                if (m.key === "sales" && product?.forecast) {
                  forecastVal = product.forecast.amount;
                  lastMonthVal = product.forecast.lastMonth ?? rangeTotalVal;
                  growthVal = product.forecast.growth ?? 0;
                } else if (m.type === "percent" || m.type === "ratio") {
                  forecastVal = rangeTotalVal;
                  lastMonthVal = rangeTotalVal;
                  growthVal = 0;
                } else {
                  forecastVal = Math.round(rangeTotalVal * (1 + growthVal / 100) * 100) / 100;
                  lastMonthVal = rangeTotalVal;
                }

                return (
                  <tr
                    key={m.key}
                    className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {/* Sticky Metric Title */}
                    <td className="sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50/80 dark:group-hover:bg-slate-800/50 z-20 px-4 py-3 font-bold text-xs text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 transition-colors">
                      {m.label}
                    </td>

                    {/* Sticky Trend Sparkline */}
                    <td className="sticky left-[140px] bg-white dark:bg-slate-900 group-hover:bg-slate-50/80 dark:group-hover:bg-slate-800/50 z-20 px-2 py-3 border-r border-slate-200 dark:border-slate-800 text-center transition-colors">
                      <Sparkline points={sparkPoints} color={m.color} width={76} height={24} />
                    </td>

                    {/* Sticky Range Total */}
                    <td className="sticky left-[235px] bg-white dark:bg-slate-900 group-hover:bg-slate-50/80 dark:group-hover:bg-slate-800/50 z-20 px-3 py-2 text-center border-r border-slate-200 dark:border-slate-800 transition-colors">
                      <div className="flex flex-col items-center justify-center leading-tight">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {formatValue(rangeTotalVal, m.type)}
                        </span>
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-0.5 justify-center">
                          <span>↗</span> Range
                        </span>
                      </div>
                    </td>

                    {/* Sticky Forecast */}
                    <td className="sticky left-[360px] bg-white dark:bg-slate-900 group-hover:bg-slate-50/80 dark:group-hover:bg-slate-800/50 z-20 px-3 py-2 text-center border-r border-slate-200 dark:border-slate-800 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)] transition-colors">
                      <div className="flex flex-col items-center justify-center leading-tight">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                          {formatValue(forecastVal, m.type)}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          Last Month: {formatValue(lastMonthVal, m.type)}
                        </span>
                        <span
                          className={`text-[10px] font-bold mt-0.5 ${
                            growthVal > 0 ? "text-emerald-600 dark:text-emerald-400" : growthVal < 0 ? "text-red-500" : "text-slate-400"
                          }`}
                        >
                          {growthVal > 0 ? `+${growthVal.toFixed(1)}%` : `${growthVal.toFixed(1)}%`}
                        </span>
                      </div>
                    </td>

                    {/* Scrollable Date Buckets */}
                    {product.buckets?.map((b, bIdx) => {
                      const prevB = product.buckets[bIdx + 1];
                      const currVal = b[m.key];
                      const prevVal = prevB ? prevB[m.key] : null;
                      const delta = pctChange(currVal, prevVal);

                      return (
                        <td
                          key={b.key || bIdx}
                          className="px-3 py-2 text-center min-w-[105px] border-r border-slate-100 dark:border-slate-800"
                        >
                          <div className="flex flex-col items-center justify-center leading-tight">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {formatValue(currVal, m.type)}
                            </span>
                            <ChangeBadge change={delta} lowerIsBetter={m.lowerIsBetter} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ProductPerformance = () => {
  const { profileId, selectedConfig, storeDara, profileData } = useContext(ProfileContext);

  const activeProfileId = useMemo(() => {
    let pId = profileId?.value ?? profileId;
    if (Array.isArray(pId)) pId = pId.length > 0 ? pId[0] : null;
    if (pId && typeof pId === "object" && pId.value) pId = pId.value;
    if (pId && !isNaN(Number(pId)) && Number(pId) > 0) return Number(pId);

    const candidates = [
      selectedConfig?.profile?.profileId,
      selectedConfig?.profileId,
      profileData?.profile?.profileId,
      profileData?.profileId,
      storeDara?.profile?.profileId,
      storeDara?.profileId,
    ];
    for (const c of candidates) {
      if (c && !isNaN(Number(c)) && Number(c) > 0) return Number(c);
    }
    try {
      const raw = localStorage.getItem("profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        const p = parsed?.profile?.profileId || parsed?.profileId;
        if (p && !isNaN(Number(p)) && Number(p) > 0) return Number(p);
      }
    } catch (e) { }
    return null;
  }, [profileId, selectedConfig, profileData, storeDara]);

  const activeConfigId = useMemo(() => {
    const candidates = [
      selectedConfig?.config?.configId,
      selectedConfig?.config?._id,
      selectedConfig?.configId,
      selectedConfig?._id,
      storeDara?.config?.configId,
      storeDara?.configId,
      profileData?.configId,
    ];
    for (const c of candidates) {
      if (c && typeof c === "string" && c.trim()) return c.trim();
    }
    return null;
  }, [selectedConfig, storeDara, profileData]);

  // Filters
  const [preset, setPreset] = useState("30");
  const [endDate, setEndDate] = useState(moment().subtract(1, "days").format("YYYY-MM-DD"));
  const [startDate, setStartDate] = useState(moment().subtract(30, "days").format("YYYY-MM-DD"));
  const [granularity, setGranularity] = useState("weekly");
  const [metric, setMetric] = useState("sales");
  const [sortBy, setSortBy] = useState("sales_desc");
  const [groupBy, setGroupBy] = useState("none");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  // Data
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [rangeLabel, setRangeLabel] = useState("");
  const [nextPeriodLabel, setNextPeriodLabel] = useState("");
  const [grandTotal, setGrandTotal] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const metricMeta = METRICS.find((m) => m.value === metric) || METRICS[0];

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Prevent outer page scrolling on large screens
  useEffect(() => {
    const outlet = document.querySelector(".outlet_wrapper");
    if (outlet) {
      outlet.classList.add("outlet-no-scroll");
    }
    return () => {
      if (outlet) {
        outlet.classList.remove("outlet-no-scroll");
      }
    };
  }, []);

  const handlePreset = (val) => {
    setPreset(val);
    const end = moment().subtract(1, "days");
    setEndDate(end.format("YYYY-MM-DD"));
    setStartDate(end.clone().subtract(Number(val) - 1, "days").format("YYYY-MM-DD"));
    setPage(1);
  };

  const buildPayload = useCallback(
    (extra = {}) => ({
      profileId: activeProfileId || undefined,
      configId: activeConfigId || undefined,
      startDate,
      endDate,
      granularity,
      search: searchQuery,
      sortMetric: metric,
      sortOrder: "desc",
      page,
      limit: perPage,
      ...extra,
    }),
    [activeProfileId, activeConfigId, startDate, endDate, granularity, searchQuery, metric, page, perPage]
  );

  const fetchData = useCallback(async () => {
    if (moment(startDate).isAfter(endDate)) {
      Toast.error("Start date cannot be after end date");
      return;
    }
    setLoading(true);
    try {
      const res = await ApiGetProductTrend(buildPayload());
      if (res?.isSuccess) {
        setRows(res.data?.items || []);
        setBuckets(res.data?.buckets || []);
        setRangeLabel(res.data?.rangeLabel || "");
        setNextPeriodLabel(res.data?.nextPeriodLabel || "");
        setGrandTotal(res.data?.grandTotal || null);
        setTotalRecords(res.data?.totalRecords || 0);
      } else {
        setRows([]);
        setBuckets([]);
        setGrandTotal(null);
        setTotalRecords(0);
        if (res?.message) Toast.error(res.message);
      }
    } catch (e) {
      console.error("Error fetching product performance:", e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, buildPayload]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Export Data as CSV
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await ApiGetProductTrend(buildPayload({ page: 1, limit: 5000 }));
      if (!res?.isSuccess) {
        Toast.error(res?.message || "Export failed");
        return;
      }
      const data = res.data;
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["ASIN", "SKU", "Title", "Inventory FBA", "Forecast", `Range Total (${metricMeta.label})`, ...data.buckets.map((b) => `${b.title} (${b.subLabel})`)];
      const lines = [header.map(esc).join(",")];
      data.items.forEach((r) => {
        lines.push(
          [
            r.asin,
            r.sku,
            r.title,
            r.stock ?? 0,
            r.forecast?.amount ?? 0,
            r.total?.[metric] ?? 0,
            ...r.buckets.map((b) => b[metric]),
          ].map(esc).join(",")
        );
      });
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `product-performance_${granularity}_${startDate}_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      Toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // AG-Grid Columns matching the exact reference UI
  const columns = useMemo(() => {
    const bucketCell = (value, prev) => (
      <div
        className="flex flex-col items-center justify-center text-center w-full h-full"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          minHeight: "56px",
          textAlign: "center",
        }}
      >
        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
          {formatValue(value, metricMeta.type)}
        </span>
        <ChangeBadge change={pctChange(value, prev)} lowerIsBetter={metricMeta.lowerIsBetter} />
      </div>
    );

    return [
      {
        headerName: "PRODUCT",
        field: "asin",
        width: 320,
        pinned: "left",
        cellClass: "flex items-center",
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
        },
        cellRenderer: (p) => {
          const r = p.data;
          return (
            <div
              className="flex items-center gap-2.5 py-1.5 overflow-hidden cursor-pointer group"
              onClick={() => setSelectedProduct(r)}
              title="Click to view detailed metrics breakdown"
            >
              <span className="text-slate-400 text-xs group-hover:text-blue-600 transition-colors">›</span>
              {r.imageUrl ? (
                <img
                  src={r.imageUrl}
                  alt=""
                  className="w-9 h-9 rounded-md object-contain shrink-0 border border-slate-200 dark:border-slate-800 bg-white group-hover:border-blue-400 transition-colors"
                />
              ) : (
                <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-800 shrink-0" />
              )}
              <div className="flex flex-col overflow-hidden leading-snug">
                <span
                  className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors truncate"
                  title={r.title}
                >
                  {r.title || r.sku || r.asin}
                </span>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                  <span>
                    ASIN: <b className="text-slate-600 dark:text-slate-300 font-medium">{r.asin}</b>
                  </span>
                  <a
                    href={`https://www.amazon.in/dp/${r.asin}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-400 hover:text-blue-500"
                  >
                    ↗
                  </a>
                </div>
                <span className="text-[11px] text-slate-400 truncate">
                  SKU: <b className="text-slate-600 dark:text-slate-300 font-medium">{r.sku || "-"}</b>
                </span>
              </div>
            </div>
          );
        },
      },
      {
        headerName: "TREND",
        colId: "trend",
        width: 90,
        cellClass: "flex items-center justify-center text-center",
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        },
        cellRenderer: (p) => (
          <div className="flex items-center justify-center w-full h-full" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
            <Sparkline points={p.data?.trend || []} />
          </div>
        ),
      },
      {
        headerName: "INV",
        field: "stock",
        width: 90,
        cellClass: "flex items-center justify-center text-center",
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        },
        cellRenderer: (p) => (
          <div className="flex items-center justify-center w-full h-full" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
            <InventoryPopover row={p.data} />
          </div>
        ),
      },
      {
        headerName: "FORECAST",
        title: "FORECAST",
        headerComponent: TwoLineHeader,
        headerComponentParams: {
          title: "FORECAST ⓘ",
          subLabel: nextPeriodLabel || "NEXT PERIOD",
        },
        colId: `forecast_${nextPeriodLabel || "init"}`,
        width: 140,
        cellClass: "flex items-center justify-center text-center",
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        },
        cellRenderer: (p) => {
          const f = p.data?.forecast;
          if (!f) return <div className="flex items-center justify-center w-full h-full text-xs text-slate-400" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>-</div>;
          const isUp = f.growth >= 0;
          return (
            <div
              className="flex flex-col items-center justify-center leading-tight w-full h-full text-center"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                minHeight: "56px",
                textAlign: "center",
              }}
            >
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                {formatValue(f.amount, metricMeta.type)}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">
                Last Month: {formatValue(f.lastMonth, metricMeta.type)}
              </span>
              <span className={`text-[10px] font-bold ${isUp ? "text-emerald-600" : "text-red-500"}`}>
                {isUp ? "+" : ""}{f.growth?.toFixed(2)}%
              </span>
            </div>
          );
        },
      },
      {
        headerName: "RANGE TOTAL",
        title: "RANGE TOTAL",
        headerComponent: TwoLineHeader,
        headerComponentParams: {
          title: "RANGE TOTAL",
          subLabel: rangeLabel || "SELECTED RANGE",
        },
        colId: `rangeTotal_${rangeLabel || "init"}`,
        width: 140,
        cellClass: "flex items-center justify-center text-center",
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        },
        cellRenderer: (p) => {
          const val = p.data?.total?.[metric] || 0;
          return (
            <div
              className="flex flex-col items-center justify-center leading-tight w-full h-full text-center"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                minHeight: "56px",
                textAlign: "center",
              }}
            >
              <span className="text-xs font-bold text-amber-600 dark:text-amber-500">
                {formatValue(val, metricMeta.type)}
              </span>
              <span className="text-[10px] font-medium text-amber-500/80 mt-0.5">
                ⤹ Range
              </span>
            </div>
          );
        },
      },
      ...buckets.map((b, i) => ({
        headerName: b.title,
        title: `${b.title}${b.subLabel && b.subLabel !== b.title ? ` (${b.subLabel})` : ""}`,
        headerComponent: TwoLineHeader,
        headerComponentParams: {
          title: b.title,
          subLabel: b.subLabel,
        },
        colId: `b_${b.key}`,
        width: granularity === "monthly" ? 140 : granularity === "daily" ? 110 : 135,
        cellClass: "flex items-center justify-center text-center",
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        },
        valueGetter: (p) => p.data?.buckets?.[i]?.[metric] || 0,
        cellRenderer: (p) => bucketCell(p.value, p.data?.buckets?.[i + 1]?.[metric]),
      })),
    ];
  }, [buckets, metric, metricMeta, granularity, nextPeriodLabel, rangeLabel]);

  // Comparison label text
  const prevDateRangeText = useMemo(() => {
    const s = moment(startDate);
    const e = moment(endDate);
    const days = e.diff(s, "days") + 1;
    const prevEnd = s.clone().subtract(1, "days");
    const prevStart = prevEnd.clone().subtract(days - 1, "days");
    return `${prevStart.format("MMM D, YYYY")} - ${prevEnd.format("MMM D, YYYY")}`;
  }, [startDate, endDate]);

  return (
    <div className="product-performance-page w-full flex flex-col bg-slate-50/60 dark:bg-slate-950/60 p-2.5 sm:p-3.5 gap-2.5">
      {/* Top Control Bar with Date Range */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm shrink-0">
        {/* Date Range Picker Display */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Date Range</span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
            <i className="fa-regular fa-calendar text-[11px] text-slate-400 mr-1" />
            <span>{moment(startDate).format("MMM D, YYYY")} - {moment(endDate).format("MMM D, YYYY")}</span>
          </div>
          <span className="text-slate-400 text-[11px] mx-1">compared to</span>
          <div className="px-2.5 py-1 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
            {prevDateRangeText}
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="flex flex-col p-3 sm:p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-2.5">
        {/* Secondary Controls Bar */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
              <Input
                type="text"
                placeholder="Search by ASIN, product name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-9 text-xs pr-8 bg-slate-50/50 dark:bg-slate-800/40"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>

            {/* Metric Dropdown */}
            <div className="w-36">
              <Select value={metric} onValueChange={(v) => { setMetric(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Metric" /></SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Granularity Dropdown (Daily, Weekly, Bi-Weekly, Monthly) */}
            <div className="w-36">
              <Select value={granularity} onValueChange={(v) => { setGranularity(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Granularity" /></SelectTrigger>
                <SelectContent>
                  {GRANULARITIES.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Date Preset Dropdown */}
            <div className="w-36">
              <Select value={preset} onValueChange={handlePreset}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Export Data Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs ml-auto font-semibold"
              onClick={handleExport}
              disabled={exporting || !rows.length}
            >
              <i className="fa-solid fa-download mr-1.5" />
              {exporting ? "Exporting..." : "Export Data"}
            </Button>
          </div>

          {/* Table Grid */}
          <div className="w-full data_table">
            <AgTable
              defaultColDef={{
                cellClass: "flex items-center justify-center text-center",
                cellStyle: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                },
              }}
              loading={loading}
              height="calc(100vh - 385px)"
              minHeight="350px"
              rowData={rows}
              columnDefs={columns}
              totalRecords={totalRecords}
              rowHeight={64}
              headerHeight={46}
              perPage={perPage}
              currentPage={page}
              onPageChange={(p) => setPage(p)}
              onPerPageChange={(pp) => { setPerPage(pp); setPage(1); }}
              onCellClicked={(params) => {
                if (params?.colDef?.field === "asin") {
                  setSelectedProduct(params.data);
                }
              }}
              isCustomSaveColumns={false}
            />
          </div>
        </div>

      {/* Product Performance Detail Modal matching reference */}
      <ProductDetailModal
        open={!!selectedProduct}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        product={selectedProduct}
        buckets={buckets}
        rangeLabel={rangeLabel}
        nextPeriodLabel={nextPeriodLabel}
      />
    </div>
  );
};

export default ProductPerformance;
