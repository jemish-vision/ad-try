import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import Filter from "../../../helper/filter/Filter";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { AdTypeScopeNote } from "../../../helper/filter/AdTypeScopeNote";
import { isShowingAllAdTypes } from "../../../helper/filter/adTypeAll";
import moment from "moment-timezone";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { t } from "i18next";
import { saveAs } from "file-saver";
import Toast from "../../../common/helper/toast/Toast";
import { ApiHourlyCampaignTracking } from "../../../api-wrapper/campaign/ApiCampaign";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../components/ui/dropdown-menu";

// ─── Hourly Tracking Constants ────────────────────────────────────────────────
const hours = [...Array(24).keys()].map((h) => h.toString().padStart(2, "0"));
const METRICS = ["Impressions", "Clicks", "Spend", "Total Orders", "Ads Orders", "Organic Orders", "Total Sales", "Ads Sales", "Organic Sales", "CTR", "CPC", "ACOS", "ROAS"];
const INT_METRICS = ["Total Orders", "Clicks", "Impressions"];

const METRIC_FIELDS = {
  Impressions: "impressions",
  Clicks: "clicks",
  Spend: "spends",
  "Total Orders": "orders",
  "Ads Orders": "adsOrders",
  "Organic Orders": "organicOrders",
  "Total Sales": "sales",
  "Ads Sales": "adsSales",
  "Organic Sales": "organicSales",
  CTR: "ctr",
  CPC: "cpc",
  ACOS: "acos",
  ROAS: "roas",
};

const LINE_COLORS = {
  "Total Sales": "#16a34a",
  "Ads Sales": "#15803d",
  "Organic Sales": "#4ade80",
  "Total Orders": "#2563eb",
  "Ads Orders": "#1d4ed8",
  "Organic Orders": "#60a5fa",
  Clicks: "#d97706",
  Impressions: "#7c3aed",
  Spend: "#dc2626",
  CTR: "#0891b2",
  CPC: "#c2410c",
  ACOS: "#9333ea",
  ROAS: "#065f46",
};

// ─── Formatters ───────────────────────────────────────────────────────────────
const formatCurrency = (val, currencyCode = "INR") => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  } catch {
    return `${currencyCode} ${Number(val).toFixed(2)}`;
  }
};

const fmt = (val, metric, currencyCode = "INR") => {
  if (val == null || isNaN(val)) return "—";
  if (["Spend", "Sales", "CPC"].includes(metric)) return formatCurrency(val, currencyCode);
  if (["CTR", "ACOS"].includes(metric)) return `${Number(val).toFixed(2)}%`;
  if (metric === "ROAS") return `${Number(val).toFixed(2)}x`;
  return Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const fmtShort = (val, metric = "") => {
  if (!val && val !== 0) return "0";
  const isInt = INT_METRICS.includes(metric);
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(isInt ? 0 : 1) + "M";
  if (val >= 1_000) return (val / 1_000).toFixed(isInt ? 0 : 1) + "k";
  if (isInt) return Math.round(val).toString();
  return Number(val).toFixed(val < 10 ? 1 : 0);
};

// ─── Heat Color ───────────────────────────────────────────────────────────────
function heatColor(val, min, max, isLowerBetter = false, isDark = false) {
  if (!val || val === 0) return { bg: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc", text: isDark ? "rgba(255, 255, 255, 0.15)" : "#94a3b8" };
  const pct = Math.min(1, Math.max(0, (val - min) / (max - min || 1)));
  const score = isLowerBetter ? 1 - pct : pct;
  if (isDark) {
    if (score < 0.25) return { bg: "rgba(239, 68, 68, 0.22)", text: "#f87171" };
    if (score < 0.5) return { bg: "rgba(245, 158, 11, 0.25)", text: "#fbbf24" };
    if (score < 0.75) return { bg: "rgba(14, 165, 233, 0.25)", text: "#38bdf8" };
    return { bg: "rgba(16, 185, 129, 0.32)", text: "#4ade80" };
  }
  if (score < 0.25) return { bg: "#fee2e2", text: "#b91c1c" };
  if (score < 0.5) return { bg: "#fef3c7", text: "#b45309" };
  if (score < 0.75) return { bg: "#e0f2fe", text: "#0369a1" };
  return { bg: "#dcfce7", text: "#15803d" };
}

// ─── Hourly Line Chart ────────────────────────────────────────────────────────
const HourlyLineChart = ({ hourlyData, selectedMetrics, currencyCode, isDark = false }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 500, h: 320 });
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) =>
      setDims({ w: Math.max(e.contentRect.width, 400), h: 280 })
    );
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const aggByHour = useCallback(() => {
    const acc = {};
    hours.forEach((h) => { acc[h] = {}; METRICS.forEach((m) => (acc[h][m] = 0)); });
    hourlyData.forEach((item) => {
      const hr = item._id.startTime.substring(0, 2);
      if (!acc[hr]) return;
      METRICS.forEach((m) => (acc[hr][m] += item[METRIC_FIELDS[m]] || 0));
    });
    return acc;
  }, [hourlyData]);

  const agg = aggByHour();

  const PAD = { top: 24, right: 18, bottom: 44, left: 56 };
  const W = dims.w - PAD.left - PAD.right;
  const H = dims.h - PAD.top - PAD.bottom;
  const xStep = W / (hours.length - 1);

  const ranges = {};
  selectedMetrics.forEach((m) => {
    const vals = hours.map((h) => agg[h][m]);
    ranges[m] = { min: Math.min(...vals), max: Math.max(...vals) };
  });

  const toY = (val, m) => {
    const { min, max } = ranges[m];
    if (max === min) return H / 2;
    return H - ((val - min) / (max - min)) * H;
  };

  const buildPath = (m) =>
    hours.map((h, i) => `${i === 0 ? "M" : "L"}${PAD.left + i * xStep},${PAD.top + toY(agg[h][m], m)}`).join(" ");

  const buildArea = (m) => {
    const pts = hours.map((h, i) => `${PAD.left + i * xStep},${PAD.top + toY(agg[h][m], m)}`).join(" L");
    return `M${PAD.left},${PAD.top + H} L${pts} L${PAD.left + (hours.length - 1) * xStep},${PAD.top + H} Z`;
  };

  const primaryMetric = selectedMetrics[0];
  const yTicks = primaryMetric
    ? [...Array(5)].map((_, i) => {
      const { min, max } = ranges[primaryMetric];
      const val = min + ((max - min) * i) / 4;
      return { y: PAD.top + toY(val, primaryMetric), label: fmtShort(val, primaryMetric) };
    }) : [];

  const bestHour = primaryMetric && hours.reduce((b, h) => (agg[h][primaryMetric] || 0) > (agg[b][primaryMetric] || 0) ? h : b);
  const worstHour = primaryMetric && hours.reduce((w, h) => (agg[h][primaryMetric] || 0) < (agg[w][primaryMetric] || 0) ? h : w);

  const safeId = (m) => m.replace(/\s+/g, "-");

  const renderTooltip = () => {
    if (hovered === null) return null;
    const bx = PAD.left + hovered * xStep;
    const tooltipW = 190;
    const tooltipH = 45 + selectedMetrics.length * 24 + 10;
    const tx = bx + tooltipW + 14 > dims.w ? bx - tooltipW - 10 : bx + 10;
    return (
      <foreignObject x={tx} y={PAD.top + 10} width={tooltipW} height={tooltipH} style={{ overflow: "visible" }}>
        <div xmlns="http://www.w3.org/1999/xhtml"
          style={{
            background: isDark ? "#1e293b" : "#fff",
            border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
            borderRadius: 12,
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.3)",
            width: tooltipW,
            pointerEvents: "none",
            overflow: "hidden"
          }}>
          <div style={{
            padding: "10px 14px",
            borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #f1f5f9",
            background: isDark ? "#161e2e" : "#f8fafc",
            fontSize: 11,
            fontWeight: 800,
            color: isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}>
            {t("Hour")} {hours[hovered]}:00
          </div>
          <div style={{ padding: "12px 14px" }}>
            {selectedMetrics.map((m) => (
              <div className="flex justify-between items-center" key={m} style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: LINE_COLORS[m] }} />
                  {t(m)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#1e293b" }}>{fmt(agg[hours[hovered]][m], m, currencyCode)}</span>
              </div>
            ))}
          </div>
        </div>
      </foreignObject>
    );
  };

  return (
    <div ref={containerRef} style={{ width: "100%", overflowX: "auto" }}>
      <div className="flex flex-wrap" style={{ gap: 10, marginBottom: 10, paddingLeft: PAD.left, minWidth: dims.w }}>
        {selectedMetrics.map((m) => (
          <span className="flex items-center" key={m} style={{ gap: 5, fontSize: 12, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#6b7280" }}>
            <span style={{ width: 20, height: 2.5, background: LINE_COLORS[m], display: "inline-block", borderRadius: 2 }} />{t(m)}
          </span>
        ))}
        {bestHour && <span style={{ marginLeft: "auto", fontSize: 12, color: "#16a34a", fontWeight: 700 }}>↑ {t("Peak")}: {bestHour}:00</span>}
        {worstHour && <span style={{ marginLeft: 10, fontSize: 12, color: "#dc2626", fontWeight: 700 }}>↓ {t("Low")}: {worstHour}:00</span>}
      </div>
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{ overflow: "visible", display: "block" }}
        onMouseMove={(e) => {
          const rect = svgRef.current.getBoundingClientRect();
          const idx = Math.round((e.clientX - rect.left - PAD.left) / xStep);
          if (idx >= 0 && idx < hours.length) setHovered(idx);
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.12" floodColor="#000000" />
          </filter>
          {selectedMetrics.map((m) => (
            <linearGradient key={m} id={`grad-${safeId(m)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE_COLORS[m]} stopOpacity="0.18" />
              <stop offset="100%" stopColor={LINE_COLORS[m]} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={tick.y} x2={PAD.left + W} y2={tick.y} stroke={isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.8} />
            <text x={PAD.left - 8} y={tick.y + 4} textAnchor="end" fontSize={11} fill={isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8"} fontWeight={500}>{tick.label}</text>
          </g>
        ))}
        {hours.map((h, i) => i % 4 === 0
          ? <text key={h} x={PAD.left + i * xStep} y={PAD.top + H + 18} textAnchor="middle" fontSize={11} fill={isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8"} fontWeight={500}>{h}</text>
          : null
        )}
        {bestHour && (
          <rect x={PAD.left + hours.indexOf(bestHour) * xStep - 7} y={PAD.top} width={14} height={H} fill="#16a34a" opacity={0.05} rx={3} />
        )}
        {selectedMetrics.map((m) => <path key={`area-${m}`} d={buildArea(m)} fill={`url(#grad-${safeId(m)})`} />)}
        {selectedMetrics.map((m) => <path key={`line-${m}`} d={buildPath(m)} stroke={LINE_COLORS[m]} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#shadow)" />)}
        {hovered !== null && (
          <>
            <line x1={PAD.left + hovered * xStep} y1={PAD.top} x2={PAD.left + hovered * xStep} y2={PAD.top + H} stroke={isDark ? "rgba(255, 255, 255, 0.25)" : "#64748b"} strokeWidth={1.2} strokeDasharray="3 3" />
            {selectedMetrics.map((m) => (
              <g key={`hover-marker-${m}`}>
                <circle cx={PAD.left + hovered * xStep} cy={PAD.top + toY(agg[hours[hovered]][m], m)} r={8} fill={LINE_COLORS[m]} opacity={0.25} />
                <circle cx={PAD.left + hovered * xStep} cy={PAD.top + toY(agg[hours[hovered]][m], m)} r={4} fill={LINE_COLORS[m]} stroke={isDark ? "#1e293b" : "#fff"} strokeWidth={2} />
              </g>
            ))}
            {renderTooltip()}
          </>
        )}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + H} stroke={isDark ? "rgba(255, 255, 255, 0.15)" : "#cbd5e1"} strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top + H} x2={PAD.left + W} y2={PAD.top + H} stroke={isDark ? "rgba(255, 255, 255, 0.15)" : "#cbd5e1"} strokeWidth={1} />
      </svg>
    </div>
  );
};

// ─── Date × Hour Heatmap ─────────────────────────────────────────────────────
const DateHourHeatmap = ({ hourlyData, metric, currencyCode, isDark = false }) => {
  const { t } = useTranslation();
  const isLowerBetter = ["ACOS", "CPC", "Spend"].includes(metric);
  const scrollRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const hideTimeout = useRef(null);

  const handleMouseEnterCell = (e, label, h, val, cellRefData) => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (val > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const flipY = rect.top < 380; // Flip to bottom if cell is near the top of the viewport
      const x = rect.left + rect.width / 2;
      const y = rect.top;
      setTooltip({ date: label, hour: h, val, data: cellRefData, x, y, flipY });
    } else {
      setTooltip(null);
    }
  };

  const handleCopyCampaign = (name) => {
    navigator.clipboard.writeText(name).then(() => Toast.success(t("Campaign name copied!")));
  };

  const handleMouseLeaveCell = () => {
    hideTimeout.current = setTimeout(() => setTooltip(null), 300);
  };

  const dates = [...new Set(hourlyData.map((r) => r._id.date))].sort();

  const matrix = {};
  const cellData = {};
  dates.forEach((d) => {
    matrix[d] = {};
    cellData[d] = {};
    hours.forEach((h) => { matrix[d][h] = 0; cellData[d][h] = null; });
  });
  hourlyData.forEach((row) => {
    const d = row._id.date;
    const h = row._id.startTime.substring(0, 2);
    if (matrix[d] && matrix[d][h] !== undefined) {
      matrix[d][h] += row[METRIC_FIELDS[metric]] || 0;
      cellData[d][h] = row;
    }
  });

  const allVals = dates.flatMap((d) => hours.map((h) => matrix[d][h])).filter((v) => v > 0);
  const globalMin = allVals.length ? Math.min(...allVals) : 0;
  const globalMax = allVals.length ? Math.max(...allVals) : 1;

  const hourTotals = {};
  hours.forEach((h) => { hourTotals[h] = dates.reduce((s, d) => s + (matrix[d][h] || 0), 0); });
  const totalVals = Object.values(hourTotals).filter((v) => v > 0);
  const totalMin = totalVals.length ? Math.min(...totalVals) : 0;
  const totalMax = totalVals.length ? Math.max(...totalVals) : 1;

  const dailyTotals = {};
  dates.forEach((d) => { dailyTotals[d] = hours.reduce((s, h) => s + (matrix[d][h] || 0), 0); });
  const dailyTotalVals = Object.values(dailyTotals).filter((v) => v > 0);
  const dailyTotalMin = dailyTotalVals.length ? Math.min(...dailyTotalVals) : 0;
  const dailyTotalMax = dailyTotalVals.length ? Math.max(...dailyTotalVals) : 1;

  const CELL_W = 40;
  const CELL_H = 30;
  const DATE_COL_W = 68;
  const TOTAL_COL_W = 58;

  const getOpaqueBg = () => isDark ? "#181f34" : "#ffffff";
  const getHeaderOpaqueBg = () => isDark ? "#161d30" : "#ffffff";

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: ${isDark ? "rgba(255,255,255,0.02)" : "#f8fafc"};
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: ${isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1"};
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${isDark ? "rgba(255,255,255,0.3)" : "#94a3b8"};
        }
        .heatmap-cell {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .heatmap-cell:hover {
          transform: scale(1.18);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
          z-index: 10;
          position: relative;
        }
      `}</style>
      <div className="flex items-center flex-wrap" style={{ gap: 10, marginBottom: 14, fontSize: 12, color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b", flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em" }}>{isLowerBetter ? t("High (Poor)") : t("Low (Poor)")}</span>
        <div className="flex items-center" style={{ gap: 4, background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9", padding: "3px 6px", borderRadius: 8 }}>
          {[
            { bg: isDark ? "rgba(239, 68, 68, 0.25)" : "#fee2e2", border: isDark ? "rgba(239, 68, 68, 0.5)" : "#fca5a5", color: isDark ? "#f87171" : "#b91c1c", label: "Poor" },
            { bg: isDark ? "rgba(245, 158, 11, 0.28)" : "#fef3c7", border: isDark ? "rgba(245, 158, 11, 0.5)" : "#fde68a", color: isDark ? "#fbbf24" : "#b45309", label: "Fair" },
            { bg: isDark ? "rgba(14, 165, 233, 0.28)" : "#e0f2fe", border: isDark ? "rgba(14, 165, 233, 0.5)" : "#bae6fd", color: isDark ? "#38bdf8" : "#0369a1", label: "Good" },
            { bg: isDark ? "rgba(16, 185, 129, 0.35)" : "#dcfce7", border: isDark ? "rgba(16, 185, 129, 0.55)" : "#86efac", color: isDark ? "#4ade80" : "#15803d", label: "Excellent" }
          ].map((c) => (
            <span className="flex items-center" key={c.label} style={{ gap: 5, padding: "2px 8px", borderRadius: 6, background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, border: `1px solid ${c.border}` }}>
              {t(c.label)}
            </span>
          ))}
        </div>
        <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em" }}>{isLowerBetter ? t("Low (Excellent)") : t("High (Excellent)")}</span>
      </div>

      <div ref={scrollRef} className="custom-scrollbar" style={{ overflowX: "auto", overflowY: "auto", height: "320px", border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e2e8f0", borderRadius: 10 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 2, tableLayout: "fixed", minWidth: DATE_COL_W + hours.length * (CELL_W + 2) + TOTAL_COL_W }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 3, background: getHeaderOpaqueBg() }}>
            <tr>
              <th style={{ width: DATE_COL_W, fontSize: 10, color: isDark ? "rgba(255,255,255,0.5)" : "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", padding: "6px 4px 6px 8px", position: "sticky", left: 0, background: getHeaderOpaqueBg(), zIndex: 4, borderBottom: isDark ? "1.5px solid rgba(255,255,255,0.08)" : "1.5px solid #e2e8f0" }}>{t("Date")}</th>
              {hours.map((h) => (
                <th key={h} style={{ width: CELL_W, fontSize: 10, color: isDark ? "rgba(255,255,255,0.5)" : "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", padding: "6px 0", borderBottom: isDark ? "1.5px solid rgba(255,255,255,0.08)" : "1.5px solid #e2e8f0" }}>{h}</th>
              ))}
              <th style={{ width: TOTAL_COL_W, fontSize: 10, color: isDark ? "rgba(255,255,255,0.5)" : "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", padding: "6px 4px", background: getHeaderOpaqueBg(), position: "sticky", right: 0, zIndex: 4, borderBottom: isDark ? "1.5px solid rgba(255,255,255,0.08)" : "1.5px solid #e2e8f0", borderLeft: isDark ? "1.5px solid rgba(255,255,255,0.08)" : "1.5px solid #e2e8f0" }}>{t("Daily Total")}</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const label = moment(date).format("MMM D");
              const dow = moment(date).format("ddd");
              const isWeekend = ["Sat", "Sun"].includes(dow);
              const dailyTotal = dailyTotals[date];
              const formattedDaily = dailyTotal > 0 ? fmtShort(dailyTotal, metric) : "";
              const displayDaily = (formattedDaily === "0.0" || formattedDaily === "0") ? "" : formattedDaily;
              const { bg: dailyBg, text: dailyText } = (dailyTotal > 0 && displayDaily !== "") ? heatColor(dailyTotal, dailyTotalMin, dailyTotalMax, isLowerBetter, isDark) : { bg: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc", text: isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1" };
              return (
                <tr key={date}>
                  <td style={{ fontSize: 12, fontWeight: 600, color: isWeekend ? "#6366f1" : (isDark ? "rgba(255,255,255,0.8)" : "#334155"), padding: "0 4px 0 8px", whiteSpace: "nowrap", position: "sticky", left: 0, background: getOpaqueBg(), zIndex: 2, borderRight: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid #f1f5f9" }}>
                    <span style={{ display: "block" }}>{label}</span>
                    <span style={{ fontSize: 10, color: isWeekend ? "#818cf8" : (isDark ? "rgba(255,255,255,0.4)" : "#94a3b8"), fontWeight: 500 }}>{dow}</span>
                  </td>
                  {hours.map((h) => {
                    const val = matrix[date][h];
                    const formattedVal = val > 0 ? fmtShort(val, metric) : "";
                    const displayVal = (formattedVal === "0.0" || formattedVal === "0") ? "" : formattedVal;
                    const { bg, text } = (val > 0 && displayVal !== "") ? heatColor(val, globalMin, globalMax, isLowerBetter, isDark) : { bg: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc", text: isDark ? "rgba(255, 255, 255, 0.15)" : "#cbd5e1" };
                    return (
                      <td key={h}
                        className={(val > 0 && displayVal !== "") ? "heatmap-cell" : ""}
                        style={{ width: CELL_W, height: CELL_H, background: bg, borderRadius: 4, textAlign: "center", fontSize: 11, fontWeight: 600, color: text, cursor: (val > 0 && displayVal !== "") ? "pointer" : "default", verticalAlign: "middle", padding: 0 }}
                        onMouseEnter={(e) => handleMouseEnterCell(e, label, h, val, cellData[date][h])}
                        onMouseLeave={handleMouseLeaveCell}
                      >
                        {displayVal}
                      </td>
                    );
                  })}
                  <td style={{
                    width: TOTAL_COL_W,
                    height: CELL_H,
                    background: (dailyTotal > 0 && displayDaily !== "")
                      ? (isDark ? `linear-gradient(0deg, ${dailyBg}, ${dailyBg}), #181f34` : `linear-gradient(0deg, ${dailyBg}, ${dailyBg}), #ffffff`)
                      : (isDark ? "#181f34" : "#f8fafc"),
                    borderRadius: 4,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: dailyText,
                    verticalAlign: "middle",
                    padding: 0,
                    position: "sticky",
                    right: 0,
                    zIndex: 2,
                    borderLeft: isDark ? "1.5px solid rgba(255, 255, 255, 0.08)" : "1.5px solid #e2e8f0",
                    cursor: "pointer"
                  }}>
                    {displayDaily}
                  </td>
                </tr>
              );
            })}
            <tr style={{ position: "sticky", bottom: 0, background: getHeaderOpaqueBg(), zIndex: 3 }}>
              <td style={{ fontSize: 11, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.8)" : "#334155", padding: "6px 4px 6px 8px", position: "sticky", left: 0, background: getHeaderOpaqueBg(), zIndex: 4, borderTop: isDark ? "1.5px solid rgba(255,255,255,0.08)" : "1.5px solid #e2e8f0" }}>{t("Total")}</td>
              {hours.map((h) => {
                const val = hourTotals[h];
                const formattedVal = val > 0 ? fmtShort(val, metric) : "";
                const displayVal = (formattedVal === "0.0" || formattedVal === "0") ? "" : formattedVal;
                const { bg, text } = (val > 0 && displayVal !== "") ? heatColor(val, totalMin, totalMax, isLowerBetter, isDark) : { bg: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc", text: isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1" };
                return (
                  <td key={h} style={{ height: CELL_H, background: bg, borderRadius: 4, textAlign: "center", fontSize: 11, fontWeight: 700, color: text, verticalAlign: "middle", padding: 0, border: isDark ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.05)" }}>
                    {displayVal}
                  </td>
                );
              })}
              <td style={{ height: CELL_H, background: isDark ? "#232b42" : "#f1f5f9", borderRadius: 4, textAlign: "center", fontSize: 11, fontWeight: 700, color: isDark ? "#ffffff" : "#0f172a", verticalAlign: "middle", padding: 0, position: "sticky", right: 0, zIndex: 4, borderLeft: isDark ? "1.5px solid rgba(255, 255, 255, 0.08)" : "1.5px solid #e2e8f0" }}>
                {fmtShort(Object.values(dailyTotals).reduce((a, b) => a + b, 0), metric)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {tooltip && ReactDOM.createPortal(
        <div
          onMouseEnter={() => { if (hideTimeout.current) clearTimeout(hideTimeout.current); }}
          onMouseLeave={handleMouseLeaveCell}
          style={{
            position: "fixed",
            left: Math.max(10, Math.min(window.innerWidth - 330, tooltip.x - 160)),
            top: tooltip.flipY ? tooltip.y + 40 : tooltip.y - 10,
            transform: tooltip.flipY ? "none" : "translateY(-100%)",
            background: isDark ? "#1e293b" : "#ffffff",
            color: isDark ? "rgba(255,255,255,0.9)" : "#0f172a",
            borderRadius: "14px",
            pointerEvents: "auto",
            zIndex: 9999,
            width: "320px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
            border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #eaecf0",
            borderTop: "4px solid #6366f1",
            overflow: "hidden",
            animation: "fadeIn 0.15s ease-out"
          }}
        >
          <div style={{ padding: "16px 20px", background: isDark ? "#161e2e" : "#f8fafc", borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #eaecf0" }}>
            <div className="flex justify-between items-center" >
              <div>
                <div style={{ fontSize: "10.5px", fontWeight: 700, color: isDark ? "rgba(255,255,255,0.4)" : "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                  {tooltip.date} · {tooltip.hour}:00
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: isDark ? "rgba(255,255,255,0.85)" : "#334155" }}>{t("Hourly Contribution")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: isDark ? "rgba(255,255,255,0.4)" : "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>{t(metric)}</div>
                <div style={{ fontSize: "22px", fontWeight: 850, color: isDark ? "rgba(255,255,255,0.95)" : "#0f172a", lineHeight: 1, letterSpacing: "-0.03em" }}>{fmt(tooltip.val, metric, currencyCode)}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: "16px 18px" }}>
            {(() => {
              const hasDataForMetric = (c, m) => {
                switch (m) {
                  case "Impressions": return (c.impressions || 0) > 0;
                  case "Clicks": return (c.clicks || 0) > 0;
                  case "Spend": return (c.spends || 0) > 0;
                  case "Total Orders": return (c.orders || 0) > 0;
                  case "Ads Orders": return (c.orders || 0) > 0;
                  case "Organic Orders": return (c.organicOrders || 0) > 0;
                  case "Total Sales": return (c.sales || 0) > 0;
                  case "Ads Sales": return (c.adsSales || 0) > 0;
                  case "Organic Sales": return (c.organicSales || 0) > 0;
                  case "CTR": return (c.impressions || 0) > 0;
                  case "CPC": return (c.clicks || 0) > 0;
                  case "ACOS": return (c.spends || 0) > 0 || (c.sales || 0) > 0;
                  case "ROAS": return (c.spends || 0) > 0 || (c.sales || 0) > 0;
                  default: return (c[METRIC_FIELDS[m]] || 0) > 0;
                }
              };

              const campaignList = (tooltip.data?.campaignData || []).filter(c => hasDataForMetric(c, metric));

              if (campaignList.length === 0) {
                return <div style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#64748b", fontSize: "12px", textAlign: "center", padding: "10px 0" }}>{t("No individual campaign data.")}</div>;
              }

              const isOrganic = (name = "") => name.toLowerCase().includes("organic");

              const organicCampaigns = campaignList.filter(c => isOrganic(c.campaignName));
              const paidCampaigns = campaignList.filter(c => !isOrganic(c.campaignName));

              const sortByMetric = (list) => [...list].sort((a, b) => (b[METRIC_FIELDS[metric]] || 0) - (a[METRIC_FIELDS[metric]] || 0));

              const sortedOrganic = sortByMetric(organicCampaigns);
              const sortedPaid = sortByMetric(paidCampaigns);
              const allSorted = sortByMetric(campaignList);
              const maxVal = allSorted[0]?.[METRIC_FIELDS[metric]] || 1;

              const renderCampaignRow = (c, i) => {
                const curVal = c[METRIC_FIELDS[metric]] || 0;
                const ratio = (curVal / maxVal) * 100;
                const organic = isOrganic(c.campaignName);
                return (
                  <div key={i} style={{ marginBottom: "12px" }}>
                    <div className="flex justify-between" style={{ marginBottom: "4px", gap: "10px" }}>
                      <div
                        onClick={() => handleCopyCampaign(c.campaignName)}
                        style={{ fontSize: "11.5px", fontWeight: 600, color: isDark ? "rgba(255,255,255,0.6)" : "#475569", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                        title={t("Click to copy")}
                      >
                        {c.campaignName}
                      </div>
                      <div style={{ fontSize: "11.5px", fontWeight: 700, color: isDark ? "rgba(255,255,255,0.9)" : "#0f172a" }}>{fmt(curVal, metric, currencyCode)}</div>
                    </div>
                    <div style={{ height: "5px", background: organic ? (isDark ? "rgba(16, 185, 129, 0.1)" : "#e8f5e9") : (isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9"), borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{ width: `${ratio}%`, height: "100%", borderRadius: "3px", background: organic ? "#10b981" : "#6366f1" }} />
                    </div>
                  </div>
                );
              };

              const SectionHeader = ({ label, count, dot }) => (
                <div className="flex items-center" style={{ gap: "6px", marginBottom: "10px", marginTop: "2px" }}>
                  <span style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: dot, flexShrink: 0, display: "inline-block"
                  }} />
                  <span style={{ fontSize: "10.5px", fontWeight: 700, color: isDark ? "rgba(255,255,255,0.4)" : "#64748b", textTransform: "uppercase", letterSpacing: "0.03em", flex: 1 }}>
                    {t(label)}
                  </span>
                  <span style={{ fontSize: "10.5px", color: isDark ? "rgba(255,255,255,0.3)" : "#94a3b8", fontWeight: 500 }}>{count} {t("total")}</span>
                </div>
              );

              return (
                <>
                  <div className="flex justify-between" style={{ marginBottom: "12px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: isDark ? "rgba(255,255,255,0.4)" : "#64748b", textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("Top Campaigns")}</span>
                    <span style={{ fontSize: "11px", color: isDark ? "rgba(255,255,255,0.3)" : "#94a3b8", fontWeight: 500 }}>{campaignList.length} {t("total")}</span>
                  </div>

                  <div style={{ maxHeight: "260px", overflowY: "auto", paddingRight: "6px" }} className="custom-scrollbar">

                    {/* ── Organic section ── */}
                    {sortedOrganic.length > 0 && (
                      <div style={{
                        background: isDark ? "rgba(16, 185, 129, 0.05)" : "#f0fdf4", border: isDark ? "1px solid rgba(16, 185, 129, 0.15)" : "1px solid #dcfce7",
                        borderRadius: "10px", padding: "10px 12px", marginBottom: "12px"
                      }}>
                        <SectionHeader label="Organic" count={sortedOrganic.length} dot="#10b981" />
                        {sortedOrganic.map(renderCampaignRow)}
                      </div>
                    )}

                    {/* ── Paid section ── */}
                    {sortedPaid.length > 0 && (
                      <div style={{
                        background: isDark ? "rgba(255,255,255,0.02)" : "#fafafa", border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid #f0f0f0",
                        borderRadius: "10px", padding: "10px 12px", marginBottom: "12px"
                      }}>
                        <SectionHeader label="Paid" count={sortedPaid.length} dot="#6366f1" />
                        {sortedPaid.map(renderCampaignRow)}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// ─── Dayparting Insights ──────────────────────────────────────────────────────
const DaypartingInsights = ({ hourlyData, isDark = false }) => {
  const [isStacked, setIsStacked] = useState(window.innerWidth < 1440);
  const { t } = useTranslation();
  useEffect(() => {
    const handleResize = () => setIsStacked(window.innerWidth < 1440);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const agg = {};
  hours.forEach((h) => (agg[h] = { "Total Sales": 0, "Total Orders": 0, Clicks: 0, Spend: 0 }));
  hourlyData.forEach((item) => {
    const hr = item._id.startTime.substring(0, 2);
    if (!agg[hr]) return;
    agg[hr]["Total Sales"] += item.sales || 0;
    agg[hr]["Total Orders"] += item.orders || 0;
    agg[hr].Clicks += item.clicks || 0;
    agg[hr].Spend += item.spends || 0;
  });
  const scored = hours.map((h) => ({ h, score: agg[h]["Total Sales"] * 0.5 + agg[h]["Total Orders"] * 30 + agg[h].Clicks * 0.5 - agg[h].Spend * 0.2, ...agg[h] }));
  scored.sort((a, b) => b.score - a.score);
  const top5 = scored.slice(0, 5).map((x) => x.h);
  const bot5 = scored.slice(-5).map((x) => x.h);
  const rangeStr = (hrs) => {
    const sorted = [...hrs].sort();
    const groups = [];
    let start = sorted[0], prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i];
      if (!cur || parseInt(cur) !== parseInt(prev) + 1) {
        groups.push(start === prev ? `${start}:00` : `${start}:00–${prev}:00`);
        start = cur;
      }
      prev = cur;
    }
    return groups.join(", ");
  };


  return (
    <div id="dayparting-strategy-recommendation" style={{ display: "grid", gridTemplateColumns: isStacked ? "1fr" : "1fr 1fr", gap: 12 }}>
      <div style={{ background: isDark ? "rgba(22, 163, 74, 0.08)" : "#f0fdf4", border: isDark ? "1px solid rgba(22, 163, 74, 0.2)" : "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#4ade80" : "#166534", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>↑ {t("Best hours — Increase bids")}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: isDark ? "#86efac" : "#15803d" }}>{rangeStr(top5)}</div>
        <div style={{ fontSize: 11, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#4ade80", marginTop: 4 }}>{t("Highest sales + order conversion")}</div>
      </div>
      <div style={{ background: isDark ? "rgba(220, 38, 38, 0.08)" : "#fff1f2", border: isDark ? "1px solid rgba(220, 38, 38, 0.2)" : "1px solid #fecdd3", borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#f87171" : "#9f1239", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>↓ {t("Worst hours — Pause / reduce bids")}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: isDark ? "#fca5a5" : "#be123c" }}>{rangeStr(bot5)}</div>
        <div style={{ fontSize: 11, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#fb7185", marginTop: 4 }}>{t("Low conversion, high wasted spend")}</div>
      </div>
    </div>
  );
};

// ─── Inline Hourly Tracking Section ──────────────────────────────────────────
const HourlyTrackingSection = ({ profileId }) => {
  const { currencyCode, selectedDate, setSelectedDate, selectedAdType } = useContext(ProfileContext);
  const showAllTypes = isShowingAllAdTypes(
    typeof window !== "undefined" ? window.location.pathname : "",
    selectedAdType
  );

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1440);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1440);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    window.addEventListener("themeChanged", handleTheme);
    return () => window.removeEventListener("themeChanged", handleTheme);
  }, []);

  const [date, setDate] = useState(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
    }
    return [new Date(moment().startOf("month")), new Date()];
  });

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      const newD1 = moment(selectedDate[0]).toDate();
      const newD2 = moment(selectedDate[1]).toDate();
      setDate((prevDate) => {
        if (
          prevDate &&
          prevDate.length >= 2 &&
          moment(prevDate[0]).format("YYYY-MM-DD") === moment(newD1).format("YYYY-MM-DD") &&
          moment(prevDate[1]).format("YYYY-MM-DD") === moment(newD2).format("YYYY-MM-DD")
        ) {
          return prevDate;
        }
        return [newD1, newD2];
      });
    }
  }, [selectedDate]);
  const [heatMetric, setHeatMetric] = useState("Total Sales");
  const [lineMetrics, setLineMetrics] = useState(["Total Sales", "Total Orders"]);
  const [chartLoading, setChartLoading] = useState(false);
  const [hourlyData, setHourlyData] = useState([]);

  const toggleLineMetric = (m) =>
    setLineMetrics((prev) =>
      prev.includes(m) ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m].slice(-4)
    );

  const totalStats = {
    Impressions: hourlyData.reduce((s, r) => s + (r.impressions || 0), 0),
    Clicks: hourlyData.reduce((s, r) => s + (r.clicks || 0), 0),
    Spend: hourlyData.reduce((s, r) => s + (r.spends || 0), 0),
    "Total Orders": hourlyData.reduce((s, r) => s + (r.orders || 0), 0),
    "Ads Orders": hourlyData.reduce((s, r) => s + (r.adsOrders || 0), 0),
    "Organic Orders": hourlyData.reduce((s, r) => s + (r.organicOrders || 0), 0),
    "Total Sales": hourlyData.reduce((s, r) => s + (r.sales || 0), 0),
    "Ads Sales": hourlyData.reduce((s, r) => s + (r.adsSales || 0), 0),
    "Organic Sales": hourlyData.reduce((s, r) => s + (r.organicSales || 0), 0),
  };
  totalStats.CTR = totalStats.Impressions ? (totalStats.Clicks / totalStats.Impressions) * 100 : 0;
  totalStats.ROAS = totalStats.Spend ? totalStats["Ads Sales"] / totalStats.Spend : 0;
  totalStats.ACOS = totalStats["Ads Sales"] ? (totalStats.Spend / totalStats["Ads Sales"]) * 100 : 0;
  totalStats.CPC = totalStats.Clicks ? totalStats.Spend / totalStats.Clicks : 0;

  const exportCSV = () => {
    let csv = "Date,Hour," + METRICS.join(",") + "\n";
    hourlyData.forEach((row) => {
      const values = METRICS.map((m) => (row[METRIC_FIELDS[m]] || 0).toFixed(2)).join(",");
      csv += `${row._id.date},${row._id.startTime.substring(0, 2)},${values}\n`;
    });
    saveAs(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "hourly_report.csv");
  };

  const exportExcel = () => {
    let tsv = "Date\tHour\t" + METRICS.join("\t") + "\n";
    hourlyData.forEach((row) => {
      const values = METRICS.map((m) => (row[METRIC_FIELDS[m]] || 0).toFixed(2)).join("\t");
      tsv += `${row._id.date}\t${row._id.startTime.substring(0, 2)}\t${values}\n`;
    });
    saveAs(new Blob([tsv], { type: "application/vnd.ms-excel" }), "hourly_report.xls");
  };

  const lastFetchParamsRef = useRef("");

  const fetchHourlyData = async (selectedDateArg) => {
    const d = selectedDateArg || date;
    if (!d?.length || !profileId) return;

    const startDateStr = moment(d[0]).format("YYYY-MM-DD");
    const endDateStr = moment(d[1]).format("YYYY-MM-DD");

    const requestSignature = JSON.stringify({
      profileId,
      startDate: startDateStr,
      endDate: endDateStr,
    });

    if (lastFetchParamsRef.current === requestSignature) {
      return;
    }

    lastFetchParamsRef.current = requestSignature;

    try {
      setChartLoading(true);
      const payload = {
        campaignId: null,
        profileId,
        startDate: startDateStr,
        endDate: endDateStr,
      };
      const response = await ApiHourlyCampaignTracking(payload);
      if (response?.isSuccess) {
        setHourlyData(response?.result?.hourlyData);
      } else {
        Toast.error(response?.message);
      }
    } catch {
      lastFetchParamsRef.current = "";
      Toast.error(t("Something went wrong"));
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
  }, [profileId]);

  useEffect(() => {
    if (profileId && date?.length) {
      fetchHourlyData(date);
    }
  }, [profileId, date]);

  const handleDateChange = (newDate) => {
    setDate(newDate);
  };

  const panelStyle = {
    background: isDark ? "rgba(255, 255, 255, 0.03)" : "#ffffff",
    border: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #e2e8f0",
    borderRadius: 14,
    padding: "20px 22px",
    minWidth: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.06)",
  };

  const statCardStyle = {
    background: isDark ? "rgba(255, 255, 255, 0.03)" : "#ffffff",
    border: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #e8edf5",
    borderRadius: 12,
    padding: "12px 14px",
    textAlign: "center",
    flex: "1 1 88px",
    boxShadow: isDark ? "0 2px 10px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.05)",
    position: "relative",
    overflow: "hidden",
  };

  return (
    <div style={{ marginTop: 20 }}>
      {showAllTypes && (
        <div style={{ marginBottom: 12 }}>
          <AdTypeScopeNote selectedAdType={selectedAdType} />
        </div>
      )}
      {/* ── Section Header ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexDirection: isMobile ? "column" : "row",
        flexWrap: "wrap",
        gap: 16,
        background: isDark ? "rgba(255, 255, 255, 0.03)" : "#ffffff",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
        borderRadius: "16px 16px 0 0",
        padding: "18px 22px",
        borderBottom: "none",
        boxShadow: isDark ? "0 4px 14px rgba(0,0,0,0.15)" : "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <div className="flex items-center" style={{ gap: 12, width: isMobile ? "100%" : "auto" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 42, height: 42, borderRadius: 12,
            background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
            flexShrink: 0, boxShadow: "0 4px 12px rgba(99,102,241,0.28)"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: isDark ? "rgba(255, 255, 255, 0.95)" : "#0f172a", letterSpacing: "-0.01em" }}>{t("Hourly Performance Tracking")}</div>
            <div style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.5)" : "#64748b", marginTop: 2 }}>{t("All campaigns")} · {currencyCode || "INR"}</div>
          </div>
        </div>

        <div className="flex items-center flex-wrap" style={{ gap: 10, width: isMobile ? "100%" : "auto" }}>
          <div id="dayparting-strategy-date-range">
            <DateRangePicker
              className="w-full sm:w-[260px]"
              ranges={predefinedRanges}
              value={date}
              placeholder={t("Select Date")}
              onChange={handleDateChange}
              placement="bottomEnd"
              format="yyyy-MM-dd"
              cleanable={false}
              style={{ width: isMobile ? "100%" : 230 }}
            />
          </div>
          {!isMobile && <div style={{ width: 1, height: 30, background: isDark ? "rgba(255,255,255,0.08)" : "#cbd5e1", borderRadius: 2 }} />}
          <div className="flex gap-2" style={{ width: isMobile ? "100%" : "auto" }}>
            <button
              id="dayparting-strategy-csv"
              className="customize-button m-0 px-3 flex items-center"
              style={{
                flex: isMobile ? 1 : "auto",
                height: "40px",
                justifyContent: "center",
                whiteSpace: "nowrap",
                gap: "6px"
              }}
              onClick={exportCSV}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              CSV
            </button>
            <button
              id="dayparting-strategy-excel"
              className="customize-button m-0 px-3 flex items-center"
              style={{
                flex: isMobile ? 1 : "auto",
                height: "40px",
                justifyContent: "center",
                whiteSpace: "nowrap",
                gap: "6px"
              }}
              onClick={exportExcel}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{
        background: isDark ? "rgba(255,255,255,0.01)" : "#f8fafc",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid #e2e8f0",
        borderTop: "none",
        borderRadius: "0 0 16px 16px",
        padding: "20px 22px",
      }}>
        {chartLoading ? (
          <div className="flex items-center justify-center" style={{ minHeight: 200, fontSize: 15, color: "#6b7280", gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span style={{ color: isDark ? "rgba(255,255,255,0.5)" : "#64748b", fontWeight: 500 }}>{t("Loading hourly data...")}</span>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div id="dayparting-strategy-cards" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fill, minmax(110px, 1fr))" : "repeat(9, 1fr)", gap: 10, marginBottom: 18 }}>
              {[
                { label: "Impressions", accent: "#6366f1" },
                { label: "Clicks", accent: "#0ea5e9" },
                { label: "Spend", accent: "#dc2626" },
                { label: "Total Orders", accent: "#2563eb" },
                { label: "Total Sales", accent: "#16a34a" },
                { label: "CTR", accent: "#0891b2" },
                { label: "CPC", accent: "#c2410c" },
                { label: "ROAS", accent: "#065f46" },
                { label: "ACOS", accent: "#9333ea" },
              ].map(({ label, accent }) => (
                <div key={label} style={{ ...statCardStyle, flex: "none" }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0,
                    height: 3, background: accent, borderRadius: "12px 12px 0 0",
                  }} />
                  <div style={{ fontSize: 9.5, color: isDark ? "rgba(255,255,255,0.4)" : "#94a3b8", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t(label)}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: isDark ? "rgba(255,255,255,0.9)" : "#0f172a", letterSpacing: "-0.02em" }}>{fmt(totalStats[label], label, currencyCode)}</div>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
              {/* Line Chart */}
              <div id="dayparting-strategy-line-chart" style={panelStyle}>
                <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 4, height: 36, borderRadius: 4, background: "linear-gradient(180deg, #6366f1 0%, #0ea5e9 100%)", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.95)" : "#0f172a" }}>{t("Hourly Performance Trends")}</div>
                    <div style={{ fontSize: 11.5, color: isDark ? "rgba(255,255,255,0.4)" : "#94a3b8", marginTop: 2 }}>{t("Select up to 4 metrics · hours 00–23")}</div>
                  </div>
                </div>
                <div className="flex flex-wrap" style={{ gap: 5, marginBottom: 12, paddingBottom: 12, borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #f1f5f9" }}>
                  {METRICS.map((m) => {
                    const active = lineMetrics.includes(m);
                    return (
                      <button key={m} onClick={() => toggleLineMetric(m)}
                        style={{
                          fontSize: 11, padding: "4px 11px", borderRadius: 99,
                          border: `1.5px solid ${active ? LINE_COLORS[m] : (isDark ? "rgba(255,255,255,0.15)" : "#e2e8f0")}`,
                          background: active ? LINE_COLORS[m] + "33" : (isDark ? "rgba(255,255,255,0.03)" : "#f8fafc"),
                          color: active ? LINE_COLORS[m] : (isDark ? "rgba(255,255,255,0.5)" : "#94a3b8"),
                          cursor: "pointer", fontWeight: active ? 700 : 500,
                          transition: "all 0.18s",
                          boxShadow: active ? `0 0 0 2px ${LINE_COLORS[m]}20` : "none",
                        }}>
                        {t(m)}
                      </button>
                    );
                  })}
                </div>
                <HourlyLineChart hourlyData={hourlyData} selectedMetrics={lineMetrics} currencyCode={currencyCode} isDark={isDark} />
              </div>

              {/* Heatmap */}
              <div id="dayparting-strategy-heatmap" style={panelStyle}>
                <div className="flex items-center justify-between" style={{ justifyConstraint: "space-between", marginBottom: 12, gap: 10 }}>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <div style={{ width: 4, height: 36, borderRadius: 4, background: "linear-gradient(180deg, #f59e0b 0%, #ef4444 100%)", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.95)" : "#0f172a" }}>{t("Date × Hour Heatmap")} </div>
                      <div style={{ fontSize: 11.5, color: isDark ? "rgba(255,255,255,0.4)" : "#94a3b8", marginTop: 2 }}>{t("Best day + hour combinations")}</div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        id="heatmap-metric-dropdown"
                        className="h-10 px-4 rounded-lg border text-xs font-bold transition-all duration-200 flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap"
                        style={{ minWidth: 150 }}
                      >
                        <span>{heatMetric}</span>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[180px] max-h-[300px] overflow-y-auto custom-scroll z-[999]">
                      {METRICS.map((m) => {
                        const isSelected = m === heatMetric;
                        return (
                          <DropdownMenuItem
                            key={m}
                            onClick={() => setHeatMetric(m)}
                            className={`text-xs font-semibold cursor-pointer py-2 px-3 transition-colors ${isSelected
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                              }`}
                          >
                            {t(m)}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9", marginBottom: 12 }} />
                <DateHourHeatmap hourlyData={hourlyData} metric={heatMetric} currencyCode={currencyCode} isDark={isDark} />
              </div>
            </div>

            {/* Dayparting Insights */}
            <div style={{ ...panelStyle, height: "auto" }}>
              <div className="flex items-center" style={{ gap: 10, marginBottom: 14 }}>
                <div style={{ width: 4, height: 36, borderRadius: 4, background: "linear-gradient(180deg, #1A9FD4 0%, #0ea5e9 100%)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.95)" : "#0f172a" }}>{t("Dayparting Strategy Recommendations")}</div>
                  <div style={{ fontSize: 11.5, color: isDark ? "rgba(255,255,255,0.4)" : "#94a3b8", marginTop: 2 }}>{t("Based on your hourly performance data")}</div>
                </div>
              </div>
              <DaypartingInsights hourlyData={hourlyData} isDark={isDark} />
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─── Main Page Component ──────────────────────────────────────────────────────
function DaypartingStretegy() {
  const { profileId } = useContext(ProfileContext);

  return (
    <div className="dayparting-tracking-container" id="dayparting-stretegy-page">
      <Filter
        name={"Hourly Performance Tracking"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container budget_container">
        {PermissionCheck(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING, PAGE_ACTIONS.VIEW_ONLY) && (
          <HourlyTrackingSection profileId={profileId?.value} />
        )}
      </div>
    </div>
  );
}

export default DaypartingStretegy;
