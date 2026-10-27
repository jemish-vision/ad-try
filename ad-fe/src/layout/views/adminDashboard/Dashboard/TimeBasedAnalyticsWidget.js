import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import moment from "moment";
import {
  Clock,
  Calendar,
  RefreshCw,
  BarChart2,
  Table as TableIcon,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { ApiGetTimeBasedAnalytics } from "../../../../api-wrapper/dashboard/ApiDashboard";
import {
  getCurrencySymbol,
  isIndianMarketplace,
  formatFullRegionalNumber,
} from "../../../../utility/regionalNumberFormat";

// Compact currency formatting matching reference UI: e.g. ₹8.72L, ₹3.06L, ₹652
function formatCompactCurrency(amount, currencyCode = "INR", marketplace = "IN", decimals = 2) {
  if (amount == null || isNaN(amount)) return "—";
  const num = Number(amount);
  const symbol = getCurrencySymbol(currencyCode);
  const isIndia = isIndianMarketplace(marketplace, currencyCode);
  const abs = Math.abs(num);
  let str = "";

  if (isIndia) {
    if (abs >= 10000000) {
      str = `${(abs / 10000000).toFixed(decimals).replace(/\.00$/, "")}Cr`;
    } else if (abs >= 100000) {
      str = `${(abs / 100000).toFixed(decimals).replace(/\.00$/, "")}L`;
    } else if (abs >= 1000) {
      str = `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    } else {
      str = abs.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    }
  } else {
    if (abs >= 1000000000) {
      str = `${(abs / 1000000000).toFixed(decimals).replace(/\.00$/, "")}B`;
    } else if (abs >= 1000000) {
      str = `${(abs / 1000000).toFixed(decimals).replace(/\.00$/, "")}M`;
    } else if (abs >= 1000) {
      str = `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    } else {
      str = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
  }

  return `${num < 0 ? "-" : ""}${symbol}${str}`;
}

// AOV formatting: whole currency number, e.g. ₹652
function formatAOV(aov, currencyCode = "INR", marketplace = "IN") {
  if (aov == null || isNaN(aov) || aov <= 0) return "—";
  const symbol = getCurrencySymbol(currencyCode);
  const isIndia = isIndianMarketplace(marketplace, currencyCode);
  const rounded = Math.round(Number(aov));
  return `${symbol}${rounded.toLocaleString(isIndia ? "en-IN" : "en-US")}`;
}

// Hook to track active dark mode in real-time
function useIsDarkMode() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      (document.documentElement.getAttribute("data-theme") === "dark" ||
        document.documentElement.classList.contains("dark"))
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => {
      setIsDark(
        document.documentElement.getAttribute("data-theme") === "dark" ||
          document.documentElement.classList.contains("dark")
      );
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

// Request deduplication cache by key
const timeDataCache = new Map();
const inflightTimeRequests = new Map();

const getProfileIdString = (p) => {
  if (!p) return null;
  if (typeof p === "string") return p;
  if (typeof p === "object") {
    return p.value || p.profileId || p._id || p.id || null;
  }
  return String(p);
};

const getStoredProfileId = () => {
  try {
    const raw = localStorage.getItem("profile");
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p?.profile?.profileId || p?.profileId || p?.id || null;
  } catch (e) {
    return null;
  }
};

export function useTimeBasedAnalyticsData({ profileId, adType = "SP", date }) {
  const [currentPid, setCurrentPid] = useState(() => getProfileIdString(profileId) || getStoredProfileId());

  useEffect(() => {
    const normalized = getProfileIdString(profileId);
    if (normalized && normalized !== currentPid) {
      setCurrentPid(normalized);
    }
  }, [profileId]);

  useEffect(() => {
    const handleProfileChange = (e) => {
      const newPid = e?.detail?.profile?.profileId;
      if (newPid && newPid !== currentPid) {
        setCurrentPid(newPid);
      }
    };
    window.addEventListener("profileChanged", handleProfileChange);
    return () => window.removeEventListener("profileChanged", handleProfileChange);
  }, [currentPid]);

  const [data, setData] = useState(() => {
    const pid = currentPid;
    return pid ? (timeDataCache.get(pid) || null) : null;
  });
  const [loading, setLoading] = useState(!data);

  const { fromDate, toDate } = useMemo(() => {
    let f = moment().subtract(30, "days").format("YYYY-MM-DD");
    let t = moment().subtract(1, "days").format("YYYY-MM-DD");
    if (date && Array.isArray(date) && date.length >= 2) {
      f = moment(date[0]).format("YYYY-MM-DD");
      t = moment(date[1]).format("YYYY-MM-DD");
    }
    return { fromDate: f, toDate: t };
  }, [date]);

  const fetchData = useCallback(async (force = false) => {
    const pid = currentPid || getProfileIdString(profileId) || getStoredProfileId();
    if (!pid) return;

    const paramsKey = `${pid}_${adType}_${fromDate}_${toDate}`;
    if (!force && timeDataCache.has(paramsKey)) {
      setData(timeDataCache.get(paramsKey));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let promise = inflightTimeRequests.get(paramsKey);
      if (!promise) {
        promise = ApiGetTimeBasedAnalytics({
          profileId: pid,
          adType,
          fromDate,
          toDate,
        }).finally(() => {
          inflightTimeRequests.delete(paramsKey);
        });
        inflightTimeRequests.set(paramsKey, promise);
      }

      const res = await promise;

      if (res?.isSuccess && res?.data) {
        timeDataCache.set(paramsKey, res.data);
        timeDataCache.set(pid, res.data);
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error("useTimeBasedAnalyticsData error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [currentPid, profileId, adType, fromDate, toDate]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    fetchData(true);
  }, [currentPid, adType, fromDate, toDate]);

  return { data, loading, refetch: () => fetchData(true) };
}

/**
 * Custom High-Definition Glassmorphic Chart Tooltip
 */
function CustomChartTooltip({
  active,
  payload,
  label,
  currencyCode,
  marketplace,
  isDark,
}) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const orders = item.orders || 0;
  const sales = item.sales || 0;
  const aov = item.aov || (orders > 0 ? sales / orders : 0);
  const title = label || item.dayName || item.label;

  return (
    <div
      style={{
        background: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
        backdropFilter: "blur(12px)",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)",
        borderRadius: "10px",
        boxShadow: isDark
          ? "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)"
          : "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
        padding: "10px 14px",
        fontSize: "12px",
        color: isDark ? "#f8fafc" : "#0f172a",
        minWidth: "160px",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: "13px",
          marginBottom: "6px",
          borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
          paddingBottom: "4px",
          color: isDark ? "#f1f5f9" : "#0f172a",
        }}
      >
        {title}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px", marginBottom: "4px" }}>
        <span style={{ color: isDark ? "#94a3b8" : "#64748b", fontWeight: 500 }}>Orders:</span>
        <span style={{ fontWeight: 700, color: "#2374F2", fontVariantNumeric: "tabular-nums" }}>
          {formatFullRegionalNumber(orders, marketplace, 0)}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px", marginBottom: item.aov != null ? "4px" : "0px" }}>
        <span style={{ color: isDark ? "#94a3b8" : "#64748b", fontWeight: 500 }}>Revenue:</span>
        <span style={{ fontWeight: 700, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
          {formatCompactCurrency(sales, currencyCode, marketplace)}
        </span>
      </div>

      {item.aov != null && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px" }}>
          <span style={{ color: isDark ? "#94a3b8" : "#64748b", fontWeight: 500 }}>AOV:</span>
          <span style={{ fontWeight: 600, color: isDark ? "#cbd5e1" : "#475569", fontVariantNumeric: "tabular-nums" }}>
            {formatAOV(aov, currencyCode, marketplace)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Portal-based View Mode Dropdown Component (Bar Chart vs Table View)
 * Immune to any parent overflow-hidden
 */
function ViewModeDropdown({ viewMode, metric, onSelectView }) {
  const { t } = useTranslation();
  const isDark = useIsDarkMode();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + 6,
        right: Math.max(12, window.innerWidth - r.right),
      });
    }
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", () => setOpen(false), true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", () => setOpen(false), true);
    };
  }, [open]);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-white/10 transition-all select-none shadow-2xs"
        aria-expanded={open}
      >
        {viewMode === "chart" ? (
          <>
            <BarChart2 className="w-3.5 h-3.5 text-blue-500" />
            <span>{t("Bar Chart")}</span>
          </>
        ) : (
          <>
            <TableIcon className="w-3.5 h-3.5 text-blue-500" />
            <span>{t("Table View")}</span>
          </>
        )}
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 999999,
              background: isDark ? "rgba(20, 26, 46, 0.98)" : "rgba(255, 255, 255, 0.98)",
              backdropFilter: "blur(20px)",
            }}
            className="w-48 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t("Select View")}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectView("chart", "orders");
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-[12px] font-medium flex items-center justify-between transition-colors ${
                viewMode === "chart" && metric === "orders"
                  ? "bg-blue-50/80 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex items-center gap-2">
                <BarChart2 className="w-3.5 h-3.5 text-blue-500" />
                <span>{t("Bar Chart (Orders)")}</span>
              </span>
              {viewMode === "chart" && metric === "orders" && (
                <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              )}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectView("chart", "revenue");
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-[12px] font-medium flex items-center justify-between transition-colors ${
                viewMode === "chart" && metric === "revenue"
                  ? "bg-blue-50/80 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex items-center gap-2">
                <BarChart2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t("Bar Chart (Revenue)")}</span>
              </span>
              {viewMode === "chart" && metric === "revenue" && (
                <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              )}
            </button>

            <div className="my-1 border-t border-slate-100 dark:border-white/5" />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectView("table", metric);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-[12px] font-medium flex items-center justify-between transition-colors ${
                viewMode === "table"
                  ? "bg-blue-50/80 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex items-center gap-2">
                <TableIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>{t("Table View")}</span>
              </span>
              {viewMode === "table" && (
                <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              )}
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

/**
 * Orders by Day of Week Card (Row 6, Col 1)
 * Toggleable between Bar Chart and Table View based on dropdown
 */
export function OrdersByDayWidget({
  profileId,
  adType = "SP",
  date,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const { t } = useTranslation();
  const isDark = useIsDarkMode();
  const { data, loading, refetch } = useTimeBasedAnalyticsData({ profileId, adType, date });

  // "chart" (Bar Chart) or "table" (Table View)
  const [viewMode, setViewMode] = useState("chart");
  // "orders" or "revenue" for chart mode
  const [metric, setMetric] = useState("orders");

  const dayOfWeek = useMemo(() => {
    if (!data?.dayOfWeek?.length) return [];
    return data.dayOfWeek;
  }, [data]);

  const maxDayOrders = useMemo(() => {
    if (!dayOfWeek.length) return 1;
    return Math.max(...dayOfWeek.map((d) => d.orders || 0), 1);
  }, [dayOfWeek]);

  const maxDaySales = useMemo(() => {
    if (!dayOfWeek.length) return 1;
    return Math.max(...dayOfWeek.map((d) => d.sales || 0), 1);
  }, [dayOfWeek]);

  const peakDay = useMemo(() => {
    if (!dayOfWeek.length) return null;
    const sorted = [...dayOfWeek].sort((a, b) => (b.orders || 0) - (a.orders || 0));
    return sorted[0];
  }, [dayOfWeek]);

  const totals = useMemo(() => {
    let orders = 0;
    let sales = 0;
    dayOfWeek.forEach((d) => {
      orders += d.orders || 0;
      sales += d.sales || 0;
    });
    return { orders, sales };
  }, [dayOfWeek]);

  const handleSelectView = (newMode, newMetric) => {
    setViewMode(newMode);
    if (newMetric) setMetric(newMetric);
  };

  return (
    <div className="dg-root rounded-2xl overflow-hidden flex flex-col h-[380px] min-h-[380px] max-h-[380px] transition-all">
      {/* Block Header: Guaranteed single-line header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="text-[14.5px] font-bold text-slate-900 dark:text-white tracking-tight truncate">
            {t("Orders by Day of Week")}
          </h3>
        </div>

        {/* Right Header Controls: Dropdown + Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <ViewModeDropdown
            viewMode={viewMode}
            metric={metric}
            onSelectView={handleSelectView}
          />

          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            title={t("Refresh")}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── VIEW MODE 1: BAR CHART ───────────────────────────────── */}
      {viewMode === "chart" ? (
        <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between overflow-hidden">
          {/* Top highlight stats row with Orders/Revenue pills */}
          <div className="flex items-center justify-between text-xs mb-2 px-1 text-slate-500 dark:text-slate-400">
            {peakDay ? (
              <span className="flex items-center gap-1.5 font-medium truncate pr-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="truncate">
                  {t("Peak Day")}:{" "}
                  <strong className="text-slate-800 dark:text-slate-100 font-bold">
                    {peakDay.dayName}
                  </strong>{" "}
                  ({formatFullRegionalNumber(peakDay.orders || 0, marketplace, 0)} {t("orders")})
                </span>
              </span>
            ) : (
              <span />
            )}

            {/* Quick Segmented Metric Pills */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200/60 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setMetric("orders")}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                  metric === "orders"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t("Orders")}
              </button>
              <button
                type="button"
                onClick={() => setMetric("revenue")}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                  metric === "revenue"
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t("Revenue")}
              </button>
            </div>
          </div>

          {/* Chart Container / Skeleton */}
          {loading && !dayOfWeek.length ? (
            <div className="h-[210px] flex items-end justify-between gap-3 px-4 pb-4 animate-pulse">
              {[40, 75, 55, 65, 30, 85, 95].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full max-w-[34px] bg-slate-200 dark:bg-slate-800 rounded-t-md"
                    style={{ height: `${h}%` }}
                  />
                  <div className="h-3 w-8 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : dayOfWeek.length === 0 ? (
            <div className="h-[210px] flex items-center justify-center text-[13px] text-slate-400">
              {t("No order data found")}
            </div>
          ) : (
            <div className="w-full h-[215px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dayOfWeek}
                  margin={{ top: 10, right: 8, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="orderBarGradient_day" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.75} />
                    </linearGradient>
                    <linearGradient id="revenueBarGradient_day" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}
                  />
                  <XAxis
                    dataKey="dayName"
                    tick={{
                      fontSize: 12,
                      fill: isDark ? "#94a3b8" : "#64748b",
                      fontWeight: 600,
                    }}
                    tickLine={false}
                    axisLine={{
                      stroke: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                    }}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: isDark ? "#94a3b8" : "#64748b",
                      fontWeight: 500,
                    }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => {
                      if (metric === "revenue") {
                        return formatCompactCurrency(val, currencyCode, marketplace, 0);
                      }
                      return formatFullRegionalNumber(val, marketplace, 0);
                    }}
                  />
                  <Tooltip
                    content={
                      <CustomChartTooltip
                        currencyCode={currencyCode}
                        marketplace={marketplace}
                        isDark={isDark}
                      />
                    }
                    cursor={{
                      fill: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
                      radius: 6,
                    }}
                  />
                  <Bar
                    dataKey={metric === "revenue" ? "sales" : "orders"}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={34}
                  >
                    {dayOfWeek.map((entry, index) => {
                      const val = metric === "revenue" ? entry.sales : entry.orders;
                      const maxVal = metric === "revenue" ? maxDaySales : maxDayOrders;
                      const isPeak = val === maxVal && val > 0;
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            metric === "revenue"
                              ? isPeak
                                ? "#059669"
                                : "url(#revenueBarGradient_day)"
                              : isPeak
                              ? "#2563eb"
                              : "url(#orderBarGradient_day)"
                          }
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        /* ── VIEW MODE 2: TABLE VIEW ─────────────────────────────── */
        <div className="p-2 sm:p-2.5 overflow-x-auto flex-1 min-h-0 overflow-y-auto dash-custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
              <tr className="border-b border-slate-100 dark:border-white/5 text-[12px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="py-2 px-2.5 font-semibold">{t("DAY")}</th>
                <th className="py-2 px-2.5 text-right font-semibold">{t("ORDERS")}</th>
                <th className="py-2 px-2.5 text-right font-semibold">{t("REVENUE")}</th>
                <th className="py-2 px-2.5 text-right font-semibold">{t("AOV")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !dayOfWeek.length ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <tr key={`dow-skel-${i}`} className="animate-pulse">
                    <td className="py-2.5 px-2.5">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" />
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-10 ml-auto" />
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-12 ml-auto" />
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-10 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : dayOfWeek.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[13px] text-slate-400">
                    {t("No order data found")}
                  </td>
                </tr>
              ) : (
                dayOfWeek.map((row) => {
                  const orders = row.orders || 0;
                  const sales = row.sales || 0;
                  const aov = row.aov || (orders > 0 ? sales / orders : 0);
                  const barWidth =
                    maxDayOrders > 0
                      ? Math.max(6, Math.round((orders / maxDayOrders) * 100))
                      : 0;

                  return (
                    <tr
                      key={row.dayIndex ?? row.dayName}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"
                    >
                      {/* DAY + Horizontal Blue Bar */}
                      <td className="py-2.5 px-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                            {row.dayName}
                          </span>
                          <div className="w-10 sm:w-12 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#2374F2] transition-all duration-500"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* ORDERS */}
                      <td className="py-2.5 px-2.5 text-right font-medium text-slate-800 dark:text-slate-100 text-[14px] tabular-nums">
                        {formatFullRegionalNumber(orders, marketplace, 0)}
                      </td>

                      {/* REVENUE */}
                      <td className="py-2.5 px-2.5 text-right font-semibold text-slate-800 dark:text-slate-100 text-[14px] tabular-nums">
                        {formatCompactCurrency(sales, currencyCode, marketplace)}
                      </td>

                      {/* AOV */}
                      <td className="py-2.5 px-2.5 text-right text-slate-600 dark:text-slate-300 text-[14px] tabular-nums">
                        {formatAOV(aov, currencyCode, marketplace)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Peak Hours Card (Row 6, Col 2)
 * Toggleable between Bar Chart and Table View based on dropdown
 */
export function PeakHoursWidget({
  profileId,
  adType = "SP",
  date,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const { t } = useTranslation();
  const isDark = useIsDarkMode();
  const { data, loading, refetch } = useTimeBasedAnalyticsData({ profileId, adType, date });

  // "chart" (Bar Chart) or "table" (Table View)
  const [viewMode, setViewMode] = useState("chart");
  // "orders" or "revenue" for chart mode
  const [metric, setMetric] = useState("orders");

  const peakHours = useMemo(() => {
    if (!data?.peakHours?.length) return [];
    return data.peakHours.slice(0, 7); // Exactly top 7 rows matching reference
  }, [data]);

  const maxPeakOrders = useMemo(() => {
    if (!peakHours.length) return 1;
    return Math.max(...peakHours.map((h) => h.orders || 0), 1);
  }, [peakHours]);

  const maxPeakSales = useMemo(() => {
    if (!peakHours.length) return 1;
    return Math.max(...peakHours.map((h) => h.sales || 0), 1);
  }, [peakHours]);

  const topPeak = useMemo(() => {
    if (!peakHours.length) return null;
    return peakHours[0];
  }, [peakHours]);

  const handleSelectView = (newMode, newMetric) => {
    setViewMode(newMode);
    if (newMetric) setMetric(newMetric);
  };

  return (
    <div className="dg-root rounded-2xl overflow-hidden flex flex-col h-[380px] min-h-[380px] max-h-[380px] transition-all">
      {/* Block Header: Guaranteed single-line header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <h3 className="text-[14.5px] font-bold text-slate-900 dark:text-white tracking-tight truncate">
            {t("Peak Hours")}
          </h3>
        </div>

        {/* Right Header Controls: Dropdown + Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <ViewModeDropdown
            viewMode={viewMode}
            metric={metric}
            onSelectView={handleSelectView}
          />

          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            title={t("Refresh")}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── VIEW MODE 1: BAR CHART ───────────────────────────────── */}
      {viewMode === "chart" ? (
        <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between overflow-hidden">
          {/* Top highlight stats row with Orders/Revenue pills */}
          <div className="flex items-center justify-between text-xs mb-2 px-1 text-slate-500 dark:text-slate-400">
            {topPeak ? (
              <span className="flex items-center gap-1.5 font-medium truncate pr-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="truncate">
                  {t("Peak Hour")}:{" "}
                  <strong className="text-slate-800 dark:text-slate-100 font-bold">
                    {topPeak.label}
                  </strong>{" "}
                  ({formatFullRegionalNumber(topPeak.orders || 0, marketplace, 0)} {t("orders")})
                </span>
              </span>
            ) : (
              <span />
            )}

            {/* Quick Segmented Metric Pills */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200/60 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setMetric("orders")}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                  metric === "orders"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t("Orders")}
              </button>
              <button
                type="button"
                onClick={() => setMetric("revenue")}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all ${
                  metric === "revenue"
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t("Revenue")}
              </button>
            </div>
          </div>

          {/* Chart Container / Skeleton */}
          {loading && !peakHours.length ? (
            <div className="h-[210px] flex items-end justify-between gap-3 px-4 pb-4 animate-pulse">
              {[85, 70, 65, 50, 48, 45, 40].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full max-w-[34px] bg-slate-200 dark:bg-slate-800 rounded-t-md"
                    style={{ height: `${h}%` }}
                  />
                  <div className="h-3 w-8 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : peakHours.length === 0 ? (
            <div className="h-[210px] flex items-center justify-center text-[13px] text-slate-400">
              {t("No hourly data found")}
            </div>
          ) : (
            <div className="w-full h-[215px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={peakHours}
                  margin={{ top: 10, right: 8, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="orderBarGradient_hour" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.75} />
                    </linearGradient>
                    <linearGradient id="revenueBarGradient_hour" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 11,
                      fill: isDark ? "#94a3b8" : "#64748b",
                      fontWeight: 600,
                    }}
                    tickLine={false}
                    axisLine={{
                      stroke: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                    }}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: isDark ? "#94a3b8" : "#64748b",
                      fontWeight: 500,
                    }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => {
                      if (metric === "revenue") {
                        return formatCompactCurrency(val, currencyCode, marketplace, 0);
                      }
                      return formatFullRegionalNumber(val, marketplace, 0);
                    }}
                  />
                  <Tooltip
                    content={
                      <CustomChartTooltip
                        currencyCode={currencyCode}
                        marketplace={marketplace}
                        isDark={isDark}
                      />
                    }
                    cursor={{
                      fill: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
                      radius: 6,
                    }}
                  />
                  <Bar
                    dataKey={metric === "revenue" ? "sales" : "orders"}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={34}
                  >
                    {peakHours.map((entry, index) => {
                      const val = metric === "revenue" ? entry.sales : entry.orders;
                      const maxVal = metric === "revenue" ? maxPeakSales : maxPeakOrders;
                      const isPeak = val === maxVal && val > 0;
                      return (
                        <Cell
                          key={`cell-hour-${index}`}
                          fill={
                            metric === "revenue"
                              ? isPeak
                                ? "#059669"
                                : "url(#revenueBarGradient_hour)"
                              : isPeak
                              ? "#2563eb"
                              : "url(#orderBarGradient_hour)"
                          }
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        /* ── VIEW MODE 2: TABLE VIEW ─────────────────────────────── */
        <div className="p-2 sm:p-2.5 overflow-x-auto flex-1 min-h-0 overflow-y-auto dash-custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
              <tr className="border-b border-slate-100 dark:border-white/5 text-[12px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th className="py-2 px-2.5 font-semibold">{t("HOUR")}</th>
                <th className="py-2 px-2.5 text-right font-semibold">{t("ORDERS")}</th>
                <th className="py-2 px-2.5 text-right font-semibold">{t("REVENUE")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !peakHours.length ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <tr key={`ph-skel-${i}`} className="animate-pulse">
                    <td className="py-2.5 px-2.5">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" />
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-10 ml-auto" />
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-12 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : peakHours.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-[13px] text-slate-400">
                    {t("No hourly data found")}
                  </td>
                </tr>
              ) : (
                peakHours.map((row) => {
                  const orders = row.orders || 0;
                  const sales = row.sales || 0;
                  const barWidth =
                    maxPeakOrders > 0
                      ? Math.max(6, Math.round((orders / maxPeakOrders) * 100))
                      : 0;

                  return (
                    <tr
                      key={row.hour ?? row.label}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"
                    >
                      {/* HOUR + Horizontal Blue Bar */}
                      <td className="py-2.5 px-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-12 text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                            {row.label}
                          </span>
                          <div className="w-10 sm:w-12 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#2374F2] transition-all duration-500"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* ORDERS */}
                      <td className="py-2.5 px-2.5 text-right font-medium text-slate-800 dark:text-slate-100 text-[14px] tabular-nums">
                        {formatFullRegionalNumber(orders, marketplace, 0)}
                      </td>

                      {/* REVENUE */}
                      <td className="py-2.5 px-2.5 text-right font-semibold text-slate-800 dark:text-slate-100 text-[14px] tabular-nums">
                        {formatCompactCurrency(sales, currencyCode, marketplace)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Combined default export for backwards compatibility
 */
export default function TimeBasedAnalyticsWidget(props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      <OrdersByDayWidget {...props} />
      <PeakHoursWidget {...props} />
    </div>
  );
}
