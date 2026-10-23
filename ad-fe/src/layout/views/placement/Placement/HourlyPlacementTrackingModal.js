import moment from "moment-timezone";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { X } from "lucide-react";
import { useEffect, useState, useRef, useCallback, useContext } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { ApiHourlyPlacementTracking } from "../../../../api-wrapper/campaign/ApiCampaign";
import { Toast } from "../../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../../common/helper/calendarValues/calendarValues";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import loaderGif from "../../../../common/loader/logo_loader.gif";

// ─── Constants ───────────────────────────────────────────────────────────────
const hours = [...Array(24).keys()].map((h) => h.toString().padStart(2, "0"));
const METRICS = ["Impressions", "Clicks", "Spend", "Orders", "Sales", "CTR", "CPC", "ACOS", "ROAS"];
const INT_METRICS = ["Orders", "Clicks", "Impressions"];

const METRIC_FIELDS = {
    Impressions: "impressions",
    Clicks: "clicks",
    Spend: "spends",
    Orders: "orders",
    Sales: "sales",
    CTR: "ctr",
    CPC: "cpc",
    ACOS: "acos",
    ROAS: "roas",
};

const LINE_COLORS = {
    Sales: "#16a34a",
    Orders: "#2563eb",
    Clicks: "#d97706",
    Impressions: "#7c3aed",
    Spend: "#dc2626",
    CTR: "#0891b2",
    CPC: "#c2410c",
    ACOS: "#9333ea",
    ROAS: "#065f46",
};

// ─── Placement Tab Config ─────────────────────────────────────────────────────
const PLACEMENT_TABS = [
    {
        key: "topOfSearch",
        label: "Top of Search",
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
            </svg>
        ),
        color: "#2563eb",
        bg: "#eff6ff",
        border: "#bfdbfe",
    },
    {
        key: "restOfSearch",
        label: "Rest of Search",
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
        ),
        color: "#d97706",
        bg: "#fffbeb",
        border: "#fde68a",
    },
    {
        key: "productPages",
        label: "Product Pages",
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
        ),
        color: "#9333ea",
        bg: "#faf5ff",
        border: "#e9d5ff",
    },
];

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

// ─── Color scale ──────────────────────────────────────────────────────────────
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

// ─── CHART 1: Hourly Performance Line Chart ───────────────────────────────────
const HourlyLineChart = ({ hourlyData, selectedMetrics, currencyCode }) => {
    const { t } = useTranslation();
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [dims, setDims] = useState({ w: 500, h: 280 });
    const [hovered, setHovered] = useState(null);

    useEffect(() => {
        const ro = new ResizeObserver(([e]) =>
            setDims({ w: Math.max(e.contentRect.width, 400), h: 280 })
        );
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const aggByHour = useCallback(() => {
        const raw = {};
        hours.forEach((h) => {
            raw[h] = {
                impressions: 0,
                clicks: 0,
                spends: 0,
                orders: 0,
                sales: 0,
            };
        });
        hourlyData.forEach((item) => {
            const hr = item._id.startTime.substring(0, 2);
            if (!raw[hr]) return;
            raw[hr].impressions += item.impressions || 0;
            raw[hr].clicks += item.clicks || 0;
            raw[hr].spends += item.spends || 0;
            raw[hr].orders += item.orders || 0;
            raw[hr].sales += item.sales || 0;
        });

        const acc = {};
        hours.forEach((h) => {
            const r = raw[h];
            acc[h] = {
                Impressions: r.impressions,
                Clicks: r.clicks,
                Spend: r.spends,
                Orders: r.orders,
                Sales: r.sales,
                CTR: r.impressions ? (r.clicks / r.impressions) * 100 : 0,
                CPC: r.clicks ? r.spends / r.clicks : 0,
                ACOS: r.sales ? (r.spends / r.sales) * 100 : 0,
                ROAS: r.spends ? r.sales / r.spends : 0,
            };
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

    const renderTooltip = () => {
        if (hovered === null) return null;
        const bx = PAD.left + hovered * xStep;
        const tooltipW = 175;
        const padH = 12;
        const rowH = 22;
        const tooltipH = padH * 2 + 22 + selectedMetrics.length * rowH;
        const tx = bx + tooltipW + 14 > dims.w ? bx - tooltipW - 10 : bx + 10;
        return (
            <foreignObject x={tx} y={PAD.top + 10} width={tooltipW} height={tooltipH} style={{ overflow: "visible" }}>
                <div xmlns="http://www.w3.org/1999/xhtml"
                    style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: `${padH}px 13px`, width: tooltipW, pointerEvents: "none" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 7, borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>
                        {t("Hour")} {hours[hovered]}:00
                    </div>
                    {selectedMetrics.map((m) => (
                        <div className="flex justify-between items-center" key={m} style={{ marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: LINE_COLORS[m] }}>{t(m)}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: LINE_COLORS[m] }}>{fmt(agg[hours[hovered]][m], m, currencyCode)}</span>
                        </div>
                    ))}
                </div>
            </foreignObject>
        );
    };

    return (
        <div ref={containerRef} style={{ width: "100%", overflowX: "auto" }}>
            <div className="flex flex-wrap" style={{ gap: 10, marginBottom: 10, paddingLeft: PAD.left, minWidth: dims.w }}>
                {selectedMetrics.map((m) => (
                    <span className="flex items-center" key={m} style={{ gap: 5, fontSize: 12, color: "#6b7280" }}>
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
                    {selectedMetrics.map((m) => (
                        <linearGradient key={m} id={`grad-placement-${m}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={LINE_COLORS[m]} stopOpacity="0.15" />
                            <stop offset="100%" stopColor={LINE_COLORS[m]} stopOpacity="0.01" />
                        </linearGradient>
                    ))}
                </defs>
                {yTicks.map((tick, i) => (
                    <g key={i}>
                        <line x1={PAD.left} y1={tick.y} x2={PAD.left + W} y2={tick.y} stroke="#f0f0f0" strokeWidth={1} />
                        <text x={PAD.left - 6} y={tick.y + 4} textAnchor="end" fontSize={11} fill="#9ca3af">{tick.label}</text>
                    </g>
                ))}
                {hours.map((h, i) => i % 4 === 0
                    ? <text key={h} x={PAD.left + i * xStep} y={PAD.top + H + 18} textAnchor="middle" fontSize={11} fill="#9ca3af">{h}</text>
                    : null
                )}
                {bestHour && (
                    <rect x={PAD.left + hours.indexOf(bestHour) * xStep - 7} y={PAD.top} width={14} height={H} fill="#16a34a" opacity={0.07} rx={3} />
                )}
                {selectedMetrics.map((m) => <path key={`area-${m}`} d={buildArea(m)} fill={`url(#grad-placement-${m})`} />)}
                {selectedMetrics.map((m) => <path key={`line-${m}`} d={buildPath(m)} stroke={LINE_COLORS[m]} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
                {hovered !== null && (
                    <>
                        <line x1={PAD.left + hovered * xStep} y1={PAD.top} x2={PAD.left + hovered * xStep} y2={PAD.top + H} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" />
                        {selectedMetrics.map((m) => (
                            <circle key={m} cx={PAD.left + hovered * xStep} cy={PAD.top + toY(agg[hours[hovered]][m], m)} r={5} fill={LINE_COLORS[m]} stroke="#fff" strokeWidth={2} />
                        ))}
                        {renderTooltip()}
                    </>
                )}
                <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + H} stroke="#e5e7eb" strokeWidth={1} />
                <line x1={PAD.left} y1={PAD.top + H} x2={PAD.left + W} y2={PAD.top + H} stroke="#e5e7eb" strokeWidth={1} />
            </svg>
        </div>
    );
};

// ─── CHART 2: {t("Date × Hour Heatmap")} ─────────────────────────────────────────────
const DateHourHeatmap = ({ hourlyData, metric, currencyCode, isDark = false }) => {
    const { t } = useTranslation();
    const isLowerBetter = ["ACOS", "CPC", "Spend"].includes(metric);
    const scrollRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);

    const isRatio = ["CTR", "CPC", "ACOS", "ROAS"].includes(metric);
    const computeRatio = (spends, sales, clicks, impressions) => {
        if (metric === "CTR") return impressions ? (clicks / impressions) * 100 : 0;
        if (metric === "CPC") return clicks ? spends / clicks : 0;
        if (metric === "ACOS") return sales ? (spends / sales) * 100 : 0;
        if (metric === "ROAS") return spends ? sales / spends : 0;
        return 0;
    };

    const dates = [...new Set(hourlyData.map((r) => r._id.date))].sort();
    const matrix = {};
    const rawCell = {};
    dates.forEach((d) => {
        matrix[d] = {};
        rawCell[d] = {};
        hours.forEach((h) => {
            matrix[d][h] = 0;
            rawCell[d][h] = { impressions: 0, clicks: 0, spends: 0, sales: 0, orders: 0 };
        });
    });
    hourlyData.forEach((row) => {
        const d = row._id.date;
        const h = row._id.startTime.substring(0, 2);
        if (rawCell[d] && rawCell[d][h]) {
            rawCell[d][h].impressions += row.impressions || 0;
            rawCell[d][h].clicks += row.clicks || 0;
            rawCell[d][h].spends += row.spends || 0;
            rawCell[d][h].sales += row.sales || 0;
            rawCell[d][h].orders += row.orders || 0;
        }
    });

    dates.forEach((d) => {
        hours.forEach((h) => {
            const r = rawCell[d][h];
            if (isRatio) {
                matrix[d][h] = computeRatio(r.spends, r.sales, r.clicks, r.impressions);
            } else {
                if (metric === "Impressions") matrix[d][h] = r.impressions;
                else if (metric === "Clicks") matrix[d][h] = r.clicks;
                else if (metric === "Spend") matrix[d][h] = r.spends;
                else if (metric === "Sales") matrix[d][h] = r.sales;
                else if (metric === "Orders") matrix[d][h] = r.orders;
                else matrix[d][h] = 0;
            }
        });
    });

    const allVals = dates.flatMap((d) => hours.map((h) => matrix[d][h])).filter((v) => v > 0);
    const globalMin = allVals.length ? Math.min(...allVals) : 0;
    const globalMax = allVals.length ? Math.max(...allVals) : 1;

    const hourTotals = {};
    hours.forEach((h) => {
        if (isRatio) {
            const hSpend = dates.reduce((s, d) => s + (rawCell[d]?.[h]?.spends || 0), 0);
            const hSales = dates.reduce((s, d) => s + (rawCell[d]?.[h]?.sales || 0), 0);
            const hClicks = dates.reduce((s, d) => s + (rawCell[d]?.[h]?.clicks || 0), 0);
            const hImp = dates.reduce((s, d) => s + (rawCell[d]?.[h]?.impressions || 0), 0);
            hourTotals[h] = computeRatio(hSpend, hSales, hClicks, hImp);
        } else {
            hourTotals[h] = dates.reduce((s, d) => s + (matrix[d][h] || 0), 0);
        }
    });
    const totalVals = Object.values(hourTotals).filter((v) => v > 0);
    const totalMin = totalVals.length ? Math.min(...totalVals) : 0;
    const totalMax = totalVals.length ? Math.max(...totalVals) : 1;

    // Calculate daily totals for sticky right column
    const dailyTotals = {};
    dates.forEach((d) => {
        if (isRatio) {
            const dSpend = hours.reduce((s, h) => s + (rawCell[d]?.[h]?.spends || 0), 0);
            const dSales = hours.reduce((s, h) => s + (rawCell[d]?.[h]?.sales || 0), 0);
            const dClicks = hours.reduce((s, h) => s + (rawCell[d]?.[h]?.clicks || 0), 0);
            const dImp = hours.reduce((s, h) => s + (rawCell[d]?.[h]?.impressions || 0), 0);
            dailyTotals[d] = computeRatio(dSpend, dSales, dClicks, dImp);
        } else {
            dailyTotals[d] = hours.reduce((s, h) => s + (matrix[d][h] || 0), 0);
        }
    });
    const dailyTotalVals = Object.values(dailyTotals).filter((v) => v > 0);
    const dailyTotalMin = dailyTotalVals.length ? Math.min(...dailyTotalVals) : 0;
    const dailyTotalMax = dailyTotalVals.length ? Math.max(...dailyTotalVals) : 1;

    const grandTotalVal = isRatio
        ? computeRatio(
            dates.reduce((s, d) => s + hours.reduce((hs, h) => hs + (rawCell[d]?.[h]?.spends || 0), 0), 0),
            dates.reduce((s, d) => s + hours.reduce((hs, h) => hs + (rawCell[d]?.[h]?.sales || 0), 0), 0),
            dates.reduce((s, d) => s + hours.reduce((hs, h) => hs + (rawCell[d]?.[h]?.clicks || 0), 0), 0),
            dates.reduce((s, d) => s + hours.reduce((hs, h) => hs + (rawCell[d]?.[h]?.impressions || 0), 0), 0)
        )
        : Object.values(dailyTotals).reduce((a, b) => a + b, 0);

    const CELL_W = 40;
    const CELL_H = 30;
    const DATE_COL_W = 68;
    const TOTAL_COL_W = 58;

    return (
        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
            <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 12, fontSize: 12, color: isDark ? "rgba(255,255,255,0.6)" : "#6b7280", flexShrink: 0 }}>
                <span style={{ fontWeight: 600 }}>{isLowerBetter ? t("High (bad)") : t("Low")}</span>
                {[
                    { bg: isDark ? "rgba(239, 68, 68, 0.25)" : "#fee2e2", border: isDark ? "rgba(239, 68, 68, 0.5)" : "#fca5a5", color: isDark ? "#f87171" : "#b91c1c", label: "Low" },
                    { bg: isDark ? "rgba(245, 158, 11, 0.28)" : "#fef3c7", border: isDark ? "rgba(245, 158, 11, 0.5)" : "#fde68a", color: isDark ? "#fbbf24" : "#b45309", label: "Med" },
                    { bg: isDark ? "rgba(14, 165, 233, 0.28)" : "#e0f2fe", border: isDark ? "rgba(14, 165, 233, 0.5)" : "#bae6fd", color: isDark ? "#38bdf8" : "#0369a1", label: "Good" },
                    { bg: isDark ? "rgba(16, 185, 129, 0.35)" : "#dcfce7", border: isDark ? "rgba(16, 185, 129, 0.55)" : "#86efac", color: isDark ? "#4ade80" : "#15803d", label: "Best" },
                ].map((c) => (
                    <span className="flex items-center" key={c.label} style={{ gap: 4 }}>
                        <span style={{ width: 14, height: 14, background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 3, display: "inline-block" }} />
                        <span style={{ fontWeight: 600, color: c.color }}>{t(c.label)}</span>
                    </span>
                ))}
                <span style={{ fontWeight: 600 }}>{isLowerBetter ? t("Low (good)") : t("High")}</span>
            </div>
            <div
                ref={scrollRef}
                style={{ overflowX: "auto", overflowY: "auto", maxHeight: "360px", border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #f0f0f0", borderRadius: 6 }}
            >
                <table style={{ borderCollapse: "separate", borderSpacing: 2, tableLayout: "fixed", minWidth: DATE_COL_W + hours.length * (CELL_W + 2) + TOTAL_COL_W }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 3, background: isDark ? "#181f34" : "#fff" }}>
                        <tr>
                            <th style={{ width: DATE_COL_W, fontSize: 11, color: "#9ca3af", fontWeight: 600, textAlign: "left", padding: "4px 4px 4px 6px", position: "sticky", left: 0, background: isDark ? "#181f34" : "#fff", zIndex: 4 }}>{t("Date")}</th>
                            {hours.map((h) => (
                                <th key={h} style={{ width: CELL_W, fontSize: 11, color: "#9ca3af", fontWeight: 600, textAlign: "center", padding: "4px 0" }}>{h}</th>
                            ))}
                            <th style={{ width: TOTAL_COL_W, fontSize: 11, color: "#9ca3af", fontWeight: 600, textAlign: "center", padding: "4px 4px", background: isDark ? "#181f34" : "#fff", position: "sticky", right: 0, zIndex: 4 }}>
                                Daily Total
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {dates.map((date) => {
                            const label = moment(date).format("MMM D");
                            const dow = moment(date).format("ddd");
                            const isWeekend = ["Sat", "Sun"].includes(dow);
                            const dailyTotal = dailyTotals[date];
                            const { bg: dailyBg, text: dailyText } = dailyTotal > 0 ? heatColor(dailyTotal, dailyTotalMin, dailyTotalMax, isLowerBetter, isDark) : { bg: isDark ? "rgba(255, 255, 255, 0.02)" : "#f9fafb", text: isDark ? "rgba(255, 255, 255, 0.15)" : "#d1d5db" };

                            return (
                                <tr key={date}>
                                    <td style={{ fontSize: 12, fontWeight: 500, color: isWeekend ? "#6366f1" : (isDark ? "rgba(255,255,255,0.70)" : "#374151"), padding: "0 4px 0 6px", whiteSpace: "nowrap", position: "sticky", left: 0, background: isDark ? "#181f34" : "#fff", zIndex: 2 }}>
                                        <span style={{ display: "block" }}>{label}</span>
                                        <span style={{ fontSize: 10, color: isWeekend ? "#a5b4fc" : "#9ca3af" }}>{dow}</span>
                                    </td>
                                    {hours.map((h) => {
                                        const val = matrix[date][h];
                                        const { bg, text } = val > 0 ? heatColor(val, globalMin, globalMax, isLowerBetter, isDark) : { bg: isDark ? "rgba(255, 255, 255, 0.02)" : "#f9fafb", text: isDark ? "rgba(255, 255, 255, 0.15)" : "#d1d5db" };
                                        return (
                                            <td key={h}
                                                style={{ width: CELL_W, height: CELL_H, background: bg, borderRadius: 4, textAlign: "center", fontSize: 11, fontWeight: 600, color: text, cursor: val > 0 ? "pointer" : "default", verticalAlign: "middle", padding: 0 }}
                                                title={val > 0 ? `${label} ${h}:00 — ${fmt(val, metric, currencyCode)}` : t("No data")}
                                                onMouseEnter={(e) => { if (val > 0) setTooltip({ date: label, hour: h, val, x: e.clientX, y: e.clientY }); }}
                                                onMouseLeave={() => setTooltip(null)}
                                            >
                                                {val > 0 ? fmtShort(val, metric) : ""}
                                            </td>
                                        );
                                    })}
                                    {/* Sticky right column for daily total */}
                                    <td
                                        style={{
                                            width: TOTAL_COL_W,
                                            height: CELL_H,
                                            background: dailyTotal > 0
                                                ? (isDark ? `linear-gradient(0deg, ${dailyBg}, ${dailyBg}), #181f34` : `linear-gradient(0deg, ${dailyBg}, ${dailyBg}), #ffffff`)
                                                : (isDark ? "#181f34" : "#f9fafb"),
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
                                            borderLeft: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb",
                                            cursor: "pointer"
                                        }}
                                        title={`${t("Daily Total")} — ${fmt(dailyTotal, metric, currencyCode)}`}
                                    >
                                        {fmtShort(dailyTotal, metric)}
                                    </td>
                                </tr>
                            );
                        })}
                        <tr style={{ position: "sticky", bottom: 0, background: isDark ? "#181f34" : "#fff", zIndex: 3 }}>
                            <td style={{ fontSize: 11, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.75)" : "#374151", padding: "4px 4px 4px 6px", position: "sticky", left: 0, background: isDark ? "#181f34" : "#fff", zIndex: 4 }}>{t("Total")}</td>
                            {hours.map((h) => {
                                const val = hourTotals[h];
                                const { bg, text } = val > 0 ? heatColor(val, totalMin, totalMax, isLowerBetter, isDark) : { bg: isDark ? "rgba(255, 255, 255, 0.02)" : "#f9fafb", text: isDark ? "rgba(255, 255, 255, 0.15)" : "#d1d5db" };
                                return (
                                    <td key={h}
                                        style={{ height: CELL_H, background: bg, borderRadius: 4, textAlign: "center", fontSize: 11, fontWeight: 700, color: text, verticalAlign: "middle", padding: 0, border: "1px solid rgba(0,0,0,0.05)" }}
                                        title={`${t("Total")} ${h}:00 — ${fmt(val, metric, currencyCode)}`}>
                                        {fmtShort(val, metric)}
                                    </td>
                                );
                            })}
                            {/* Total of totals - grand total */}
                            <td style={{ height: CELL_H, background: isDark ? "#232b42" : "#f1f5f9", borderRadius: 4, textAlign: "center", fontSize: 11, fontWeight: 700, color: isDark ? "#ffffff" : "#0f172a", verticalAlign: "middle", padding: 0, position: "sticky", right: 0, zIndex: 4, borderLeft: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb" }}
                                title={`${t("Grand Total")} — ${fmt(grandTotalVal, metric, currencyCode)}`}>
                                {fmtShort(grandTotalVal, metric)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            {tooltip && (
                <div style={{ position: "fixed", left: tooltip.x + 14, top: tooltip.y - 32, background: isDark ? "rgba(14,18,30,0.97)" : "#1e293b", color: isDark ? "rgba(255,255,255,0.90)" : "#e2e8f0", padding: "6px 12px", border: isDark ? "1px solid rgba(255,255,255,0.1)" : "none", borderRadius: 6, fontSize: 13, fontWeight: 500, pointerEvents: "none", zIndex: 9999, whiteSpace: "nowrap" }}>
                    {tooltip.date} · {tooltip.hour}:00 — {fmt(tooltip.val, metric, currencyCode)}
                </div>
            )}
        </div>
    );
};

// ─── Dayparting Insights ──────────────────────────────────────────────────────
const DaypartingInsights = ({ hourlyData, isDark = false }) => {
    const { t } = useTranslation();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const agg = {};
    hours.forEach((h) => (agg[h] = { Sales: 0, Orders: 0, Clicks: 0, Spend: 0 }));
    hourlyData.forEach((item) => {
        const hr = item._id.startTime.substring(0, 2);
        if (!agg[hr]) return;
        agg[hr].Sales += item.sales || 0;
        agg[hr].Orders += item.orders || 0;
        agg[hr].Clicks += item.clicks || 0;
        agg[hr].Spend += item.spends || 0;
    });

    const scored = hours.map((h) => ({ h, score: agg[h].Sales * 0.5 + agg[h].Orders * 30 + agg[h].Clicks * 0.5 - agg[h].Spend * 0.2, ...agg[h] }));
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
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div style={{ background: isDark ? "rgba(22,163,74,0.10)" : "#f0fdf4", border: isDark ? "1px solid rgba(22,163,74,0.25)" : "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#4ade80" : "#166534", marginBottom: 6 }}>↑ {t("Best hours — Increase bids")}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: isDark ? "#86efac" : "#15803d" }}>{rangeStr(top5)}</div>
                <div style={{ fontSize: 11, color: isDark ? "rgba(74,222,128,0.70)" : "#4ade80", marginTop: 4 }}>{t("Highest sales + order conversion")}</div>
            </div>
            <div style={{ background: isDark ? "rgba(239,68,68,0.10)" : "#fff1f2", border: isDark ? "1px solid rgba(239,68,68,0.25)" : "1px solid #fecdd3", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#f87171" : "#9f1239", marginBottom: 6 }}>↓ {t("Worst hours — Pause / reduce bids")}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: isDark ? "#fca5a5" : "#be123c" }}>{rangeStr(bot5)}</div>
                <div style={{ fontSize: 11, color: isDark ? "rgba(251,113,133,0.70)" : "#fb7185", marginTop: 4 }}>{t("Low conversion, high wasted spend")}</div>
            </div>
        </div>
    );
};

// ─── Per-placement Stats ──────────────────────────────────────────────────────
const computeTotalStats = (data) => {
    const s = {
        Impressions: data.reduce((a, r) => a + (r.impressions || 0), 0),
        Clicks: data.reduce((a, r) => a + (r.clicks || 0), 0),
        Spend: data.reduce((a, r) => a + (r.spends || 0), 0),
        Orders: data.reduce((a, r) => a + (r.adsOrders || r.orders || 0), 0),
        Sales: data.reduce((a, r) => a + (r.adsSales || r.sales || 0), 0),
    };
    s.CTR = s.Impressions ? (s.Clicks / s.Impressions) * 100 : 0;
    s.ROAS = s.Spend ? s.Sales / s.Spend : 0;
    s.ACOS = s.Sales ? (s.Spend / s.Sales) * 100 : 0;
    s.CPC = s.Clicks ? s.Spend / s.Clicks : 0;
    return s;
};

// ─── Placement Content Panel ──────────────────────────────────────────────────
const PlacementPanel = ({ data, currencyCode, isDark = false }) => {
    const { t } = useTranslation();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const [heatMetric, setHeatMetric] = useState("Sales");
    const [lineMetrics, setLineMetrics] = useState(["Sales", "Orders"]);

    const toggleLineMetric = (m) =>
        setLineMetrics((prev) =>
            prev.includes(m) ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m].slice(-4)
        );

    const totalStats = computeTotalStats(data);

    const statCardStyle = {
        background: isDark ? "rgba(255, 255, 255, 0.03)" : "#f9fafb",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f0f0f0",
        borderRadius: 8,
        padding: "9px 14px",
        textAlign: "center",
        flex: "1 1 88px",
        color: isDark ? "#F9FAFB" : "#111827",
    };

    const panelStyle = {
        background: isDark ? "#181f34" : "#fff",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f0f0f0",
        borderRadius: 10,
        padding: "16px 18px",
        minWidth: 0,
        overflow: "hidden",
        color: isDark ? "#F9FAFB" : "#111827",
    };

    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center" style={{ height: 260, gap: 12, color: "#9ca3af" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{t("No data available for this placement")}</div>
                <div style={{ fontSize: 12 }}>{t("Try adjusting the date range")}</div>
            </div>
        );
    }

    return (
        <>
            {/* Stats row */}
            <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(110px, 1fr))",
                gap: 10,
                marginBottom: 14
            }}>
                {["Impressions", "Clicks", "Spend", "Orders", "Sales", "CTR", "CPC", "ROAS", "ACOS"].map((m) => (
                    <div key={m} style={statCardStyle}>
                        <div style={{ fontSize: 11, color: isDark ? "#9CA3AF" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>{t(m)}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? "#F9FAFB" : "#111827" }}>{fmt(totalStats[m], m, currencyCode)}</div>
                    </div>
                ))}
            </div>

            {/* Side-by-side: Line chart | Heatmap */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14, alignItems: "start" }}>
                {/* Left — Line chart */}
                <div style={panelStyle}>
                    <div className="flex items-start justify-between flex-wrap" style={{ marginBottom: 12, gap: 10 }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#F9FAFB" : "#111827" }}>{t("Hourly Performance Trends")}</div>
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>{t("Up to 4 metrics • hours 00–23")}</div>
                        </div>
                        <div className="flex flex-wrap" style={{ gap: 6 }}>
                            {METRICS.map((m) => {
                                const active = lineMetrics.includes(m);
                                return (
                                    <button key={m} onClick={() => toggleLineMetric(m)}
                                        style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, border: `1.5px solid ${active ? LINE_COLORS[m] : (isDark ? "rgba(255, 255, 255, 0.08)" : "#e5e7eb")}`, background: active ? LINE_COLORS[m] + "18" : (isDark ? "#1F2937" : "#fff"), color: active ? LINE_COLORS[m] : "#6b7280", cursor: "pointer", fontWeight: active ? 600 : 400, transition: "all 0.15s" }}>
                                        {t(m)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <HourlyLineChart hourlyData={data} selectedMetrics={lineMetrics} currencyCode={currencyCode} />
                </div>

                {/* Right — Heatmap */}
                <div style={panelStyle}>
                    <div className="flex items-start justify-between flex-wrap" style={{ marginBottom: 12, gap: 10 }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#F9FAFB" : "#111827" }}>{t("Date × Hour Heatmap")} </div>
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>{t("Best day + hour combinations")}</div>
                        </div>
                        <Select
                            value={heatMetric}
                            onValueChange={setHeatMetric}
                        >
                            <SelectTrigger className="w-[120px] h-8 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <SelectValue placeholder={t("Metric")} />
                            </SelectTrigger>
                            <SelectContent>
                                {METRICS.map((m) => (
                                    <SelectItem key={m} value={m} className="text-xs">
                                        {t(m)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DateHourHeatmap hourlyData={data} metric={heatMetric} currencyCode={currencyCode} isDark={isDark} />
                </div>
            </div>

            {/* Dayparting — full width */}
            <div style={panelStyle}>
                <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#F9FAFB" : "#111827", marginBottom: 12 }}>
                    {t("Dayparting Strategy Recommendations")}
                </div>
                <DaypartingInsights hourlyData={data} isDark={isDark} />
            </div>
        </>
    );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────
export const HourlyPlacementTrackingModal = ({ showModal, setShowModal, campaignId, profileId: propProfileId, closeHandler, handleClose }) => {
    const { t } = useTranslation();
    const { profileId: contextProfileId, currencyCode, selectedDate, setSelectedDate } = useContext(ProfileContext);
    const profileId = propProfileId || contextProfileId;

    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    const [date, setDate] = useState([]);
    const [activeTab, setActiveTab] = useState("topOfSearch");
    const [chartLoading, setChartLoading] = useState(true);
    const [placementData, setPlacementData] = useState({
        topOfSearch: [],
        restOfSearch: [],
        productPages: [],
    });
    const [modalReady, setModalReady] = useState(false);

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        window.addEventListener("themeChanged", handle);
        return () => window.removeEventListener("themeChanged", handle);
    }, []);

    const exportCSV = () => {
        const tab = PLACEMENT_TABS.find((t) => t.key === activeTab);
        const data = placementData[activeTab] || [];
        let csv = `Placement,Date,Hour,${METRICS.join(",")}\n`;
        data.forEach((row) => {
            const values = METRICS.map((m) => (row[METRIC_FIELDS[m]] || 0).toFixed(2)).join(",");
            csv += `${t(tab.label)},${row._id.date},${row._id.startTime.substring(0, 2)},${values}\n`;
        });
        saveAs(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `hourly_placement_${activeTab}.csv`);
    };

    const exportExcel = () => {
        const tab = PLACEMENT_TABS.find((t) => t.key === activeTab);
        const data = placementData[activeTab] || [];
        let tsv = `Placement\tDate\tHour\t${METRICS.join("\t")}\n`;
        data.forEach((row) => {
            const values = METRICS.map((m) => (row[METRIC_FIELDS[m]] || 0).toFixed(2)).join("\t");
            tsv += `${tab.label}\t${row._id.date}\t${row._id.startTime.substring(0, 2)}\t${values}\n`;
        });
        saveAs(new Blob([tsv], { type: "application/vnd.ms-excel" }), `hourly_placement_${activeTab}.xls`);
    };

    const fetchPlacementData = async () => {
        try {
            setChartLoading(true);
            const payload = {
                campaignId: campaignId ?? [],
                profileId,
                startDate: moment(date?.[0]).format("YYYY-MM-DD"),
                endDate: moment(date?.[1]).format("YYYY-MM-DD"),
            };
            const response = await ApiHourlyPlacementTracking(payload);
            if (response?.isSuccess) {
                setPlacementData({
                    topOfSearch: response?.result?.topOfSearch || [],
                    restOfSearch: response?.result?.restOfSearch || [],
                    productPages: response?.result?.productPages || [],
                });
            } else {
                Toast.error(response?.message);
            }
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            setChartLoading(false);
        }
    };

    useEffect(() => {
        if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
            setDate([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
        } else if (!date?.length) {
            setDate([new Date(moment().startOf("month")), new Date()]);
        }
    }, [selectedDate]);

    useEffect(() => {
        if (modalReady && date?.length) fetchPlacementData();
    }, [modalReady, date]);

    // Clear previous data & set loading immediately when modal opens/closes
    useEffect(() => {
        if (showModal) {
            setChartLoading(true);
            setPlacementData({
                topOfSearch: [],
                restOfSearch: [],
                productPages: [],
            });
        } else {
            setModalReady(false);
            setChartLoading(true);
            setPlacementData({
                topOfSearch: [],
                restOfSearch: [],
                productPages: [],
            });
        }
    }, [showModal]);

    const activeTabConfig = PLACEMENT_TABS.find((t) => t.key === activeTab);

    return (
        <Dialog open={showModal} onOpenChange={(open) => { if (!open) closeHandler(); }}>
            <DialogContent hideCloseButton={true} staticBackdrop={false} className="max-w-[90vw] p-0 h-[90vh] overflow-hidden gap-0 border-0 bg-transparent shadow-none" onOpenAutoFocus={() => setModalReady(true)}>
                <div id="hourly-tracking-modal" style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    maxHeight: "100vh",
                    background: isDark ? "#0c1222" : "#fff",
                    borderRadius: "20px",
                    border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
                    boxShadow: isDark ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)" : "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
                    overflow: "hidden",
                    position: "relative"
                }}>
                    {/* Glow Line Indicator */}
                    <div
                        className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                        style={{
                            background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
                            opacity: 0.8
                        }}
                    />
                    {/* ── FIXED HEADER ─────────────────────────────────────────── */}
                    <div
                        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-3.5 border-b flex-shrink-0"
                        style={{
                            background: isDark ? "rgba(11,17,32,0.97)" : "#fff",
                            borderColor: isDark ? "rgba(255,255,255,0.08)" : "#f0f0f0",
                        }}
                    >
                        {/* Left: Title + Currency Badge */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: isDark ? "#F9FAFB" : "#111827", margin: 0 }}>
                                {t("Hourly Placement Tracking")}
                            </h3>
                            {currencyCode && (
                                <span style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: isDark ? "rgba(59, 130, 246, 0.15)" : "#f0f9ff",
                                    color: isDark ? "#60A5FA" : "#0369a1",
                                    border: isDark ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid #bae6fd",
                                    borderRadius: 99,
                                    padding: "2px 10px",
                                }}>
                                    {currencyCode}
                                </span>
                            )}
                        </div>

                        {/* Right: DateRangePicker + CSV + Excel + Close Button */}
                        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                            <DateRangePicker
                                className="w-full sm:w-[240px]"
                                ranges={predefinedRanges}
                                value={date}
                                placeholder={t("Select Date")}
                                onChange={setDate}
                                placement={isMobile ? "bottomStart" : "bottomEnd"}
                                format="yyyy-MM-dd"
                                cleanable={false}
                            />
                            <div className="hidden sm:block h-6 w-[1px]" style={{ background: isDark ? "rgba(255, 255, 255, 0.1)" : "#e5e7eb" }} />

                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 h-8 px-3 text-xs font-semibold bg-transparent dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    {t("CSV")}
                                </Button>

                                <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5 h-8 px-3 text-xs font-semibold bg-transparent dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    {t("Excel")}
                                </Button>
                            </div>

                            <Button variant="ghost" size="icon" onClick={closeHandler} className="h-8 w-8 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* ── PLACEMENT TABS — rendered as a sibling div, NOT inside Modal.Body
                The CSS class `hpt-tabs-bar` gives it flex-shrink:0 so it never scrolls away */}
                    <div className="flex hpt-tabs-bar flex-shrink-0" style={{ background: isDark ? "#111c34" : "#f8fafc", borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb" }}>
                        {PLACEMENT_TABS.map((tab) => {
                            const isActive = activeTab === tab.key;
                            const count = placementData[tab.key]?.length ?? 0;
                            const tabColor = isDark ? (tab.key === "topOfSearch" ? "#60A5FA" : tab.key === "restOfSearch" ? "#F59E0B" : "#C084FC") : tab.color;
                            const tabBg = isDark ? "rgba(255,255,255,0.04)" : tab.bg;
                            const tabBorder = isDark ? "rgba(255,255,255,0.08)" : tab.border;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 7,
                                        padding: "11px 18px",
                                        fontSize: 13,
                                        fontWeight: isActive ? 700 : 500,
                                        color: isActive ? tabColor : (isDark ? "rgba(255,255,255,0.55)" : "#6b7280"),
                                        background: "transparent",
                                        border: "none",
                                        borderBottom: isActive ? `2.5px solid ${tabColor}` : "2.5px solid transparent",
                                        cursor: "pointer",
                                        transition: "all 0.15s",
                                        marginBottom: -1,
                                        whiteSpace: "nowrap",
                                    }}
                                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = tabColor; }}
                                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = isDark ? "rgba(255,255,255,0.55)" : "#6b7280"; }}
                                >
                                    <span style={{ color: isActive ? tabColor : (isDark ? "rgba(255,255,255,0.4)" : "#9ca3af") }}>{tab.icon}</span>
                                    {t(tab.label)}
                                    {!chartLoading && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 600,
                                            background: isActive ? tabBg : (isDark ? "rgba(255,255,255,0.02)" : "#f3f4f6"),
                                            color: isActive ? tabColor : (isDark ? "rgba(255,255,255,0.4)" : "#9ca3af"),
                                            border: `1px solid ${isActive ? tabBorder : (isDark ? "rgba(255,255,255,0.06)" : "#e5e7eb")}`,
                                            borderRadius: 99, padding: "1px 7px", marginLeft: 2,
                                        }}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── SCROLLABLE BODY — only this div scrolls ───────────────── */}
                    <div className="flex-1 overflow-y-auto" data-scrollable style={{ background: isDark ? "#0B1120" : "#f4f6f9", color: isDark ? "#F9FAFB" : "#111827", padding: "16px 22px" }}>
                        {chartLoading ? (
                            <div style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                minHeight: 350,
                                height: "100%",
                                width: "100%",
                                background: isDark ? "#0B1120" : "#f4f6f9",
                            }}>
                                <img
                                    src={loaderGif}
                                    alt="Loading..."
                                    style={{ width: "240px", height: "240px", objectFit: "contain" }}
                                />
                            </div>
                        ) : (
                            PLACEMENT_TABS.map((tab) =>
                                tab.key === activeTab ? (
                                    <PlacementPanel key={tab.key} data={placementData[tab.key]} currencyCode={currencyCode} isDark={isDark} />
                                ) : null
                            )
                        )}
                    </div>

                    {/* ── FIXED FOOTER ─────────────────────────────────────────── */}
                    <DialogFooter className="px-5 py-3 sm:justify-between flex-row items-center border-t flex-shrink-0" style={{ background: isDark ? "rgba(11,17,32,0.97)" : "#fff", borderColor: isDark ? "rgba(255,255,255,0.08)" : "#f0f0f0" }}>
                        <div className="flex items-center" style={{ gap: 8, marginRight: "auto" }}>
                            {activeTabConfig && (
                                <span style={{
                                    display: "flex", alignItems: "center", gap: 6,
                                    fontSize: 12, fontWeight: 600,
                                    color: isDark ? (activeTabConfig.key === "topOfSearch" ? "#60A5FA" : activeTabConfig.key === "restOfSearch" ? "#F59E0B" : "#C084FC") : activeTabConfig.color,
                                    background: isDark ? "rgba(255,255,255,0.04)" : activeTabConfig.bg,
                                    border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : activeTabConfig.border}`,
                                    borderRadius: 6, padding: "4px 10px",
                                }}>
                                    <span>{activeTabConfig.icon}</span>
                                    {t(activeTabConfig.label)}
                                </span>
                            )}
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>
                                {placementData[activeTab]?.length ?? 0} {t("records")}
                            </span>
                        </div>
                        <Button id="hourly-tracking-close-btn" variant="secondary" size="sm" onClick={closeHandler} style={{ fontSize: 13 }} className="rounded-xl font-semibold px-4">
                            {t("Close")}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default HourlyPlacementTrackingModal;