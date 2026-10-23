import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";

import KPICard from "../KPICard";
import {
    ComposedChart, Line, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { useTranslation } from "react-i18next";
import CurrencyFormat from "../currencyCode/CurrencyFormat";
import CurrencyCode from "../currencyCode/CurrencyCode";

/* ─────────────────────────────────────────────────────────────
   PALETTE
───────────────────────────────────────────────────────────── */
const P = {
    barSales: "rgba(120, 180, 255, 0.35)",
    barSalesBorder: "rgba(120, 180, 255, 0.70)",
    barSpend: "rgba(255, 160, 100, 0.30)",
    barSpendBorder: "rgba(255, 160, 100, 0.65)",
    neutral50: "var(--button-secondary-bg, #F8FAFC)",
    neutral100: "var(--glass-border-color, #F1F5F9)",
    neutral200: "var(--glass-border-color, #E2E8F0)",
    neutral300: "var(--glass-border-color, #D0D7E2)",
    neutral400: "var(--text-secondary, #94A3B8)",
    neutral600: "var(--text-secondary, #475569)",
    neutral800: "var(--text-primary, #1E293B)",
    primary: "var(--accent-primary, #2374F2)",
    primary50: "var(--accent-primary-bg, rgba(35, 116, 242, 0.08))",
    primary100: "var(--accent-primary, #2374F2)",
};

const getSolidColor = (m) => {
    if (m.key === "spend") return "#f97316";
    if (m.key === "sales" || m.key === "totalSales") return "#3b82f6";
    return m.color;
};

/* ─────────────────────────────────────────────────────────────
   ALL METRICS — matches your existing keys exactly
───────────────────────────────────────────────────────────── */
const ALL_METRICS = [
    { key: "spend", label: "Spend", color: P.barSpend, stroke: P.barSpendBorder, side: "right", format: "currency" },
    { key: "sales", label: "Sales", color: P.barSales, stroke: P.barSalesBorder, side: "right", format: "currency" },
    { key: "orders", label: "Orders", color: "#2374F2", side: "left", format: "number" },
    { key: "acos", label: "ACOS", color: "#F07070", side: "right", format: "percent" },
    { key: "roas", label: "ROAS", color: "#3ECFA8", side: "left", format: "number" },
    { key: "impressions", label: "Impressions", color: "#8B5CF6", side: "right", format: "number" },
    { key: "clicks", label: "Clicks", color: "#06B6D4", side: "left", format: "number" },
];

// Keys that appear in "Frequently Used" section of the metric dropdown
const FREQ_KEYS = ["spend", "sales", "orders", "acos", "roas", "impressions", "clicks"];

// Default metrics shown in chart and cards
const DEFAULT_ACTIVE = ["impressions", "spend", "orders", "sales"];
const MIN_METRICS = 2;
const MAX_METRICS = 6;
const AXIS_WIDTH_DESKTOP = 65;
const AXIS_WIDTH_MOBILE = 42;

/* ─────────────────────────────────────────────────────────────
   TOP CARD METRICS — dynamic based on activeMetrics
───────────────────────────────────────────────────────────── */
const buildSumOfValues = (totalRow, activeMetrics, isTotalsLoading = false, t) => {
    return activeMetrics.map(metric => {
        const hasValue = totalRow?.[metric.key] !== undefined && totalRow?.[metric.key] !== null;
        let formattedValue = "...";

        if (!isTotalsLoading && hasValue) {
            formattedValue = metric.format === "currency"
                ? CurrencyCode(totalRow[metric.key])
                : metric.format === "percent"
                    ? `${totalRow[metric.key]}%`
                    : CurrencyFormat(totalRow[metric.key]);
        } else if (!isTotalsLoading && !hasValue) {
            formattedValue = metric.format === "currency" ? "$" : metric.format === "percent" ? "0%" : "0";
        }

        return {
            name: t ? t(metric.label) : metric.label,
            key: metric.key,
            title: metric.label,
            number: formattedValue,
            color: metric.color,
            type: metric.type || "line",
            format: metric.format,
        };
    });
};

/* ─────────────────────────────────────────────────────────────
   AXIS ASSIGNMENT
───────────────────────────────────────────────────────────── */
function assignAxes(activeMetrics) {
    const n = activeMetrics.length;
    const leftCount = n <= 1 ? 1 : n <= 2 ? 1 : n <= 3 ? 2 : n <= 4 ? 2 : 3;
    const rightCount = n - leftCount;
    const prefLeft = activeMetrics.filter(m => m.side === "left");
    const prefRight = activeMetrics.filter(m => m.side === "right");
    const leftMetrics = [], rightMetrics = [];
    prefLeft.forEach(m => { if (leftMetrics.length < leftCount) leftMetrics.push(m); else rightMetrics.push(m); });
    prefRight.forEach(m => { if (rightMetrics.length < rightCount) rightMetrics.push(m); else leftMetrics.push(m); });
    const result = {};
    leftMetrics.forEach((m, i) => { result[m.key] = `L${i + 1}`; });
    rightMetrics.forEach((m, i) => { result[m.key] = `R${i + 1}`; });
    return { axisMap: result, leftCount, rightCount };
}

/* ─────────────────────────────────────────────────────────────
   FORMAT HELPERS
───────────────────────────────────────────────────────────── */
const fmtDate = (s) => {
    const d = new Date(s);
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
};
const fmtVal = (v, fmt) => {
    if (v == null || v === "") return "";
    const n = Number(v);
    if (fmt === "currency") {
        if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
        if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
        return `₹${n.toFixed(0)}`;
    }
    if (fmt === "percent") return `${n.toFixed(2)}%`;
    return n % 1 === 0 ? `${n}` : n.toFixed(2);
};
const fmtAxis = (v, fmt) => {
    const n = Number(v);
    if (fmt === "currency") {
        if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(0)}L`;
        if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
        return `₹${n}`;
    }
    if (fmt === "percent") return `${n}%`;
    return n;
};

/* ─────────────────────────────────────────────────────────────
   EXCEL DOWNLOAD
───────────────────────────────────────────────────────────── */
const downloadExcel = (data, activeMetrics) => {
    const run = (XLSX) => {
        const rows = data.map(row => {
            const r = { Date: row.label || row.reportDate };
            activeMetrics.forEach(m => { r[m.label] = row[m.key] ?? ""; });
            return r;
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 14 }, ...activeMetrics.map(() => ({ wch: 18 }))];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
        XLSX.writeFile(wb, "dashboard_report.xlsx");
    };
    if (window.XLSX) { run(window.XLSX); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => run(window.XLSX);
    document.head.appendChild(s);
};

/* ─────────────────────────────────────────────────────────────
   ICONS
───────────────────────────────────────────────────────────── */
const ChevronDownIcon = ({ size = 14, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M4 6l4 4 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const DownloadIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path d="M8 2v8M5 7l3 3 3-3M3 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const ExpandIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const CollapseIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const TableIcon = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1.5 5.5h13M1.5 9.5h13M5.5 5.5v9M10.5 5.5v9" stroke="currentColor" strokeWidth="1.3" />
    </svg>
);
const CheckIcon = () => (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const PlusIcon = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

/* ─────────────────────────────────────────────────────────────
   ANIMATED CHECKBOX
───────────────────────────────────────────────────────────── */
const AnimCheckbox = ({ checked, color, onToggle }) => (
    <div
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
        style={{
            width: 19, height: 19, borderRadius: 5, cursor: "pointer", flexShrink: 0,
            border: `2px solid ${checked ? color : "rgba(148, 163, 184, 0.45)"}`,
            background: checked ? color : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border 0.18s, background 0.18s, transform 0.15s, box-shadow 0.18s",
            transform: checked ? "scale(1.08)" : "scale(1)",
            boxShadow: checked ? `0 0 0 3px ${color}28` : "none",
            userSelect: "none",
        }}
    >
        {checked && <CheckIcon />}
    </div>
);

/* ─────────────────────────────────────────────────────────────
   TOGGLE SWITCH
───────────────────────────────────────────────────────────── */
const Toggle = ({ value, onChange, label }) => (
    <label className="flex items-center" style={{ gap: 8, cursor: "pointer", userSelect: "none", fontSize: 13, color: P.neutral600 }}>
        <div
            onPointerDown={(e) => { e.preventDefault(); onChange(!value); }}
            style={{
                width: 38, height: 21, borderRadius: 11,
                background: value ? P.primary : P.neutral200,
                position: "relative", cursor: "pointer", flexShrink: 0,
                transition: "background 0.22s",
            }}
        >
            <div style={{
                position: "absolute", top: 2.5, left: value ? 19 : 2.5,
                width: 16, height: 16, borderRadius: "50%",
                background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                transition: "left 0.22s cubic-bezier(.4,0,.2,1)",
            }} />
        </div>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
    </label>
);

/* ─────────────────────────────────────────────────────────────
   CUSTOM TOOLTIP
───────────────────────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label, activeMetrics, isDark: propIsDark }) => {
    if (!active || !payload?.length) return null;
    const isDark = propIsDark !== undefined ? propIsDark : document.documentElement.getAttribute("data-theme") === "dark";
    return (
        <div style={{
            background: isDark ? "#111827" : "#fff",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : P.neutral200}`,
            borderRadius: 12, padding: "12px 16px",
            boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 8px 32px rgba(2,70,139,0.14)",
            fontSize: 13, minWidth: 195, zIndex: 9999,
        }}>
            <div style={{
                fontWeight: 800, marginBottom: 9,
                color: isDark ? "#F9FAFB" : P.neutral800,
                fontSize: 13,
                borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : P.neutral100}`,
                paddingBottom: 7
            }}>{label}</div>
            {payload.map((entry) => {
                const meta = activeMetrics.find(m => m.key === entry.dataKey);
                if (!meta) return null;
                return (
                    <div className="flex justify-between items-center" key={entry.dataKey} style={{ gap: 16, marginBottom: 5 }}>
                        <div className="flex items-center" style={{ gap: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ color: isDark ? "#9CA3AF" : P.neutral600, fontSize: 12.5 }}>{meta.label}</span>
                        </div>
                        <span style={{ fontWeight: 700, color: isDark ? "#F9FAFB" : P.neutral800, fontVariantNumeric: "tabular-nums" }}>{fmtVal(entry.value, meta.format)}</span>
                    </div>
                );
            })}
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   CHANGE BADGE DOT
───────────────────────────────────────────────────────────── */
const makeCustomDot = (color, allData, metricKey, showChanges) => (props) => {
    const { cx, cy, index } = props;
    const curr = allData[index]?.[metricKey];
    const prev = index > 0 ? allData[index - 1]?.[metricKey] : null;
    const showBadge = showChanges && curr != null && prev != null && prev !== 0;
    const pct = showBadge ? ((curr - prev) / Math.abs(prev)) * 100 : 0;
    const isUp = pct >= 0;
    const bg = isUp ? "#DCFCE7" : "#FEE2E2";
    const fg = isUp ? "#15803D" : "#DC2626";
    return (
        <g key={`dot-${index}-${metricKey}`}>
            <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={2} />
            {showBadge && (
                <foreignObject x={cx - 24} y={cy - 30} width={52} height={22} style={{ overflow: "visible" }}>
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{
                        background: bg, color: fg, borderRadius: 20,
                        fontSize: 9.5, fontWeight: 800, padding: "2px 6px",
                        display: "inline-flex", alignItems: "center", gap: 2,
                        whiteSpace: "nowrap", boxShadow: "0 1px 5px rgba(0,0,0,0.10)",
                        border: `1px solid ${isUp ? "#BBF7D0" : "#FECACA"}`,
                    }}>
                        {isUp ? "▲" : "▼"}{Math.abs(pct).toFixed(0)}%
                    </div>
                </foreignObject>
            )}
        </g>
    );
};

/* ─────────────────────────────────────────────────────────────
   METRIC DROPDOWN (for both chart and card)
───────────────────────────────────────────────────────────── */
const MetricDropdown = ({ activeKeys, onToggle, onClose, position = "bottom-left" }) => {
    const { t } = useTranslation();
    const ref = useRef();
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        const tid = setTimeout(() => document.addEventListener("pointerdown", h), 0);
        return () => { clearTimeout(tid); document.removeEventListener("pointerdown", h); };
    }, [onClose]);

    const freqMetrics = ALL_METRICS.filter(m => FREQ_KEYS.includes(m.key));
    const otherMetrics = ALL_METRICS.filter(m => !FREQ_KEYS.includes(m.key));
    const atMax = activeKeys.length >= MAX_METRICS;

    const getPositionStyles = () => {
        if (position === "top-left") return { bottom: "calc(100% + 8px)", left: 0 };
        if (position === "top-right") return { bottom: "calc(100% + 8px)", right: 0, left: "auto" };
        if (position === "bottom-right") return { top: "calc(100% + 8px)", right: 0, left: "auto" };
        return { top: "calc(100% + 8px)", left: 0 }; // bottom-left default
    };

    const Row = ({ m }) => {
        const active = activeKeys.includes(m.key);
        const disabled = (!active && atMax) || (active && activeKeys.length <= MIN_METRICS);
        return (
            <div
                onPointerDown={(e) => { e.preventDefault(); if (!disabled) onToggle(m.key); }}
                style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
                    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
                    transition: "background 0.12s", userSelect: "none",
                }}
                onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = P.neutral50; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
                <AnimCheckbox checked={active} color={m.color} onToggle={() => !disabled && onToggle(m.key)} />
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, color: P.neutral800, fontWeight: 600 }}>{t(m.label)}</span>
            </div>
        );
    };

    const Section = ({ title, metrics }) => (
        <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: P.neutral400, padding: "10px 16px 4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t(title)}</div>
            {metrics.map(m => <Row key={m.key} m={m} />)}
        </div>
    );

    return (
        <div ref={ref} style={{
            position: "absolute",
            ...getPositionStyles(),
            zIndex: 9500,
            background: "var(--dropdown-bg, #fff)",
            border: `1px solid ${P.neutral200}`,
            borderRadius: 13,
            boxShadow: "var(--glass-shadow, 0 16px 50px rgba(2,70,139,0.16))",
            minWidth: 240,
            maxHeight: 420,
            overflowY: "auto",
            animation: "ddFade 0.14s ease",
        }}>
            {atMax && (
                <div style={{ background: P.primary50, borderBottom: `1px solid ${P.primary100}`, padding: "8px 16px", fontSize: 12.5, color: P.primary, fontWeight: 700 }}>
                    {t("Max {{count}} metrics reached", { count: MAX_METRICS }) || `Max ${MAX_METRICS} metrics reached`}
                </div>
            )}
            {activeKeys.length <= MIN_METRICS && (
                <div style={{ background: "#FEF3C7", borderBottom: `1px solid ${P.primary100}`, padding: "8px 16px", fontSize: 12.5, color: P.primary, fontWeight: 700 }}>
                    {t("Minimum {{count}} metrics required", { count: MIN_METRICS }) || `Minimum ${MIN_METRICS} metrics required`}
                </div>
            )}
            {freqMetrics.length > 0 && <Section title={t("Frequently Used")} metrics={freqMetrics} />}
            {otherMetrics.length > 0 && <Section title={t("Other")} metrics={otherMetrics} />}
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   CHART TYPE DROPDOWN
───────────────────────────────────────────────────────────── */
const ChartTypeDropdown = ({ metricKey, current, onChange, onClose, isFullscreen }) => {
    const { t } = useTranslation();
    const ref = useRef();
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        const tid = setTimeout(() => document.addEventListener("pointerdown", h), 0);
        return () => { clearTimeout(tid); document.removeEventListener("pointerdown", h); };
    }, [onClose]);

    return (
        <div ref={ref} style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 9500,
            background: "var(--dropdown-bg, #fff)", border: `1px solid ${P.neutral200}`, borderRadius: 11,
            boxShadow: "var(--glass-shadow, 0 8px 28px rgba(2,70,139,0.14))", overflow: "hidden", minWidth: 150,
            animation: "ddFade 0.12s ease",
        }}>
            {["line", "bar"].map(type => (
                <div key={type}
                    onPointerDown={(e) => { e.preventDefault(); onChange(metricKey, type); onClose(); }}
                    style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "11px 16px",
                        cursor: "pointer", fontSize: 13.5,
                        fontWeight: current === type ? 700 : 600,
                        color: current === type ? P.primary : P.neutral600,
                        background: current === type ? P.primary50 : "transparent",
                        transition: "all 0.12s",
                    }}
                    onMouseEnter={e => { if (current !== type) e.currentTarget.style.background = P.neutral50; }}
                    onMouseLeave={e => { if (current !== type) e.currentTarget.style.background = "transparent"; }}
                >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{type === "line" ? "〰" : "▌▌"}</span>
                    {type === "line" ? t("Line Chart") : t("Bar Chart")}
                </div>
            ))}
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   GRANULARITY DROPDOWN
───────────────────────────────────────────────────────────── */
const GranularityDropdown = ({ value, onChange }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef();
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("pointerdown", h);
        return () => document.removeEventListener("pointerdown", h);
    }, []);
    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                onPointerDown={(e) => { e.preventDefault(); setOpen(o => !o); }}
                style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "7px 14px",
                    border: `1.5px solid ${open ? P.primary100 : P.neutral200}`, borderRadius: 9,
                    background: open ? P.primary50 : "var(--button-secondary-bg, #fff)",
                    fontSize: 13.5, fontWeight: 700, color: P.neutral800, cursor: "pointer",
                    transition: "all 0.15s", fontFamily: "inherit",
                }}
            >
                {t(value)} <ChevronDownIcon color={P.neutral400} />
            </button>
            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 5px)", right: 0, zIndex: 9500,
                    background: "var(--dropdown-bg, #fff)", border: `1px solid ${P.neutral200}`, borderRadius: 11,
                    boxShadow: "var(--glass-shadow, 0 8px 28px rgba(2,70,139,0.12))", overflow: "hidden", minWidth: 130,
                    animation: "ddFade 0.12s ease",
                }}>
                    {["Daily", "Weekly", "Monthly"].map(g => (
                        <div key={g}
                            onPointerDown={(e) => { e.preventDefault(); onChange(g); setOpen(false); }}
                            style={{
                                padding: "10px 18px", cursor: "pointer", fontSize: 13.5,
                                fontWeight: value === g ? 700 : 600,
                                color: value === g ? P.primary : P.neutral600,
                                background: value === g ? P.primary50 : "transparent",
                                transition: "all 0.12s", userSelect: "none",
                            }}
                            onMouseEnter={e => { if (value !== g) e.currentTarget.style.background = P.neutral50; }}
                            onMouseLeave={e => { if (value !== g) e.currentTarget.style.background = "transparent"; }}
                        >
                            {t(g)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   TABLE VIEW
───────────────────────────────────────────────────────────── */
const TableView = ({ data, activeMetrics, isFullscreen, isDark }) => {
    const { t } = useTranslation();
    return (
        <div style={{
            overflowX: "auto",
            overflowY: "auto",
            maxHeight: isFullscreen ? "none" : 420,
            flex: isFullscreen ? 1 : undefined,
            height: isFullscreen ? "100%" : "auto",
            minHeight: 0,
        }}>
            <table className="chart-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                    <tr style={{
                        borderBottom: "var(--glass-border)",
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                        background: isDark ? "rgba(15, 23, 42, 0.98)" : "rgba(255, 255, 255, 0.98)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                    }}>
                        <th style={{ padding: "12px 18px", textAlign: "left", color: "var(--text-primary)", fontWeight: 800, fontSize: 12.5, borderRight: "var(--glass-border)", whiteSpace: "nowrap" }}>{t("Date")}</th>
                        {activeMetrics.map(m => (
                            <th key={m.key} style={{ padding: "12px 18px", textAlign: "right", color: "var(--text-primary)", fontWeight: 800, fontSize: 12.5, borderRight: "var(--glass-border)", whiteSpace: "nowrap" }}>
                                <div className="flex items-center justify-end" style={{ gap: 6 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, display: "inline-block", opacity: 0.85 }} />
                                    {t(m.label)}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={activeMetrics.length + 1} style={{ textAlign: "center", padding: "36px 18px", color: P.neutral400, fontSize: 14, fontWeight: 600 }}>
                                {t("No data available")}
                            </td>
                        </tr>
                    ) : (
                        data.map((row, i) => (
                            <tr key={i}
                                style={{ background: i % 2 === 0 ? "var(--table-row-even-bg)" : "var(--table-row-odd-bg)", transition: "background 0.1s" }}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--table-row-hover)"}
                                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "var(--table-row-even-bg)" : "var(--table-row-odd-bg)"}
                            >
                                <td style={{ padding: "10px 18px", color: "var(--text-primary)", fontWeight: 700, borderBottom: "var(--glass-border)", borderRight: "var(--glass-border)", whiteSpace: "nowrap", fontSize: 13 }}>
                                    {row.label || row.reportDate}
                                </td>
                                {activeMetrics.map(m => (
                                    <td key={m.key} style={{ padding: "10px 18px", textAlign: "right", borderBottom: "var(--glass-border)", borderRight: "var(--glass-border)", fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>
                                        <span style={{ color: getSolidColor(m), fontWeight: 700, fontSize: 13 }}>{fmtVal(row[m.key], m.format)}</span>
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                    <tr style={{
                        position: "sticky",
                        bottom: 0,
                        zIndex: 10,
                        background: isDark ? "rgba(15, 23, 42, 0.98)" : "rgba(255, 255, 255, 0.98)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        boxShadow: "0 -2px 6px rgba(0,0,0,0.06)",
                    }}>
                        <td style={{ padding: "10px 18px", fontWeight: 800, color: "var(--text-primary)", fontSize: 13, borderTop: "var(--glass-border)" }}>{t("Total / Avg")}</td>
                        {activeMetrics.map(m => {
                            const vals = data.map(r => r[m.key]).filter(v => v != null);
                            const total = vals.reduce((s, v) => s + v, 0);
                            const disp = ["percent"].includes(m.format) ? (vals.length > 0 ? total / vals.length : 0) : total;
                            return (
                                <td key={m.key} style={{ padding: "10px 18px", textAlign: "right", fontWeight: 800, color: "var(--text-primary)", fontSize: 13, borderTop: "var(--glass-border)", fontVariantNumeric: "tabular-nums" }}>
                                    {fmtVal(disp, m.format)}
                                </td>
                            );
                        })}
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   LOADING SKELETON
───────────────────────────────────────────────────────────── */
const Skeleton = () => (
    <div style={{
        height: 260, margin: "20px 22px",
        background: `linear-gradient(90deg,${P.neutral100} 25%,${P.neutral200} 50%,${P.neutral100} 75%)`,
        backgroundSize: "400% 100%", borderRadius: 12,
        animation: "shimmer 1.5s infinite linear",
    }} />
);

/* ─────────────────────────────────────────────────────────────
   CHART INNER
───────────────────────────────────────────────────────────── */
const ChartInner = ({ aggData, activeMetrics, axisMap, leftCount, rightCount, showChanges, showDataLabels, chartHeight, isDark }) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const axisFmtMap = {};
    const axisColorMap = {};
    activeMetrics.forEach(m => {
        const id = axisMap[m.key];
        if (id && !axisFmtMap[id]) {
            axisFmtMap[id] = m.format;
            axisColorMap[id] = getSolidColor(m);
        }
    });

    const lineMetrics = activeMetrics.filter(m => m.type !== "bar");

    return (
        <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart
                data={aggData}
                margin={{ top: showChanges ? 44 : 22, right: 10, left: 10, bottom: 4 }}
            >
                <defs>
                    {lineMetrics.map(m => (
                        <filter key={`glow-${m.key}`} id={`cglow-${m.key}`} x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    ))}
                </defs>
                <CartesianGrid
                    stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}
                    vertical={false}
                    yAxisId={leftCount > 0 ? "L1" : "R1"}
                />
                <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12.5, fill: isDark ? "#9CA3AF" : "#475569", fontWeight: 600 }}
                    axisLine={false} tickLine={false} dy={7}
                />
                {["L1", "L2", "L3"].slice(0, isMobile ? Math.min(leftCount, 1) : leftCount).map((id) => {
                    if (!axisFmtMap[id]) return null;
                    const metricForAxis = activeMetrics.find(m => axisMap[m.key] === id);
                    return (
                        <YAxis key={id} yAxisId={id} orientation="left"
                            tick={{ fontSize: 11.5, fill: axisColorMap[id], fontWeight: 700 }}
                            axisLine={{ stroke: axisColorMap[id], strokeWidth: 1.5, strokeOpacity: 0.25 }}
                            tickLine={false}
                            tickFormatter={v => fmtAxis(v, axisFmtMap[id])}
                            width={isMobile ? AXIS_WIDTH_MOBILE : AXIS_WIDTH_DESKTOP}
                            label={{ value: metricForAxis?.label || "", angle: -90, position: "insideLeft", offset: 15, style: { fontSize: 11, fill: axisColorMap[id], fontWeight: 700, textAnchor: "middle" } }}
                        />
                    );
                })}
                {["R1", "R2", "R3"].slice(0, isMobile ? Math.min(rightCount, 1) : rightCount).map((id) => {
                    if (!axisFmtMap[id]) return null;
                    const metricForAxis = activeMetrics.find(m => axisMap[m.key] === id);
                    return (
                        <YAxis key={id} yAxisId={id} orientation="right"
                            tick={{ fontSize: 11.5, fill: axisColorMap[id], fontWeight: 700 }}
                            axisLine={{ stroke: axisColorMap[id], strokeWidth: 1.5, strokeOpacity: 0.25 }}
                            tickLine={false}
                            tickFormatter={v => fmtAxis(v, axisFmtMap[id])}
                            width={isMobile ? AXIS_WIDTH_MOBILE : AXIS_WIDTH_DESKTOP}
                            label={{ value: metricForAxis?.label || "", angle: 90, position: "insideRight", offset: 15, style: { fontSize: 11, fill: axisColorMap[id], fontWeight: 700, textAnchor: "middle" } }}
                        />
                    );
                })}
                <Tooltip content={<CustomTooltip activeMetrics={activeMetrics} isDark={isDark} />} />
                {activeMetrics.map(m => {
                    const yId = axisMap[m.key];
                    if (!yId) return null;
                    if (m.type === "bar") {
                        return (
                            <Bar key={m.key} dataKey={m.key} fill={m.color}
                                stroke={m.stroke || m.color} strokeWidth={1}
                                yAxisId={yId} radius={[4, 4, 0, 0]} maxBarSize={28}
                            >
                                {showDataLabels && (
                                    <LabelList dataKey={m.key} position="top" style={{ fontSize: 10.5, fill: m.color, fontWeight: 700 }} formatter={v => fmtVal(v, m.format)} />
                                )}
                            </Bar>
                        );
                    }
                    return (
                        <Line key={m.key} type="monotone" dataKey={m.key} stroke={m.color} yAxisId={yId}
                            strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
                            dot={makeCustomDot(m.color, aggData, m.key, showChanges)}
                            activeDot={{ r: 6, fill: m.color, stroke: isDark ? "rgba(255,255,255,0.1)" : "#fff", strokeWidth: 2 }}
                            style={{ filter: `url(#cglow-${m.key})` }}
                        >
                            {showDataLabels && (
                                <LabelList dataKey={m.key} position="top" style={{ fontSize: 10.5, fill: m.color, fontWeight: 700 }} formatter={v => fmtVal(v, m.format)} />
                            )}
                        </Line>
                    );
                })}
            </ComposedChart>
        </ResponsiveContainer>
    );
};

/* ─────────────────────────────────────────────────────────────
   CHART HEADER
───────────────────────────────────────────────────────────── */
const ChartHeader = ({ viewMode, setViewMode, granularity, setGranularity, onDownload, isFullscreen, onToggleFullscreen }) => {
    const { t } = useTranslation();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            padding: isMobile ? "12px 16px" : "15px 22px",
            borderBottom: "var(--glass-border)",
            gap: isMobile ? 12 : 0,
        }}>
            <span style={{ fontWeight: 800, fontSize: isMobile ? 16 : 18, color: "var(--text-primary)", letterSpacing: "-0.4px" }}>{t("Charts")}</span>
            <div className="flex items-center flex-wrap" style={{ gap: 10, width: isMobile ? "100%" : "auto" }}>
                <button
                    onPointerDown={(e) => { e.preventDefault(); setViewMode(v => v === "chart" ? "table" : "chart"); }}
                    style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "var(--button-secondary-bg)",
                        border: "var(--button-secondary-border)", color: "var(--text-primary)", fontWeight: 700, fontSize: isMobile ? 12 : 13.5,
                        cursor: "pointer", padding: isMobile ? "6px 10px" : "7px 14px", borderRadius: 9,
                        transition: "all 0.15s", fontFamily: "inherit",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--button-secondary-bg-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--button-secondary-bg)"; }}
                >
                    <TableIcon /> {viewMode === "table" ? (isMobile ? t("Chart") : t("View as chart")) : (isMobile ? t("Table") : t("View as table"))}
                </button>
                <GranularityDropdown value={granularity} onChange={setGranularity} />
                <button
                    onPointerDown={(e) => { e.preventDefault(); onDownload(); }}
                    title={t("Download Excel")}
                    style={{
                        background: "transparent", border: "var(--glass-border)", cursor: "pointer",
                        color: "var(--text-secondary)", display: "flex", alignItems: "center",
                        padding: "7px 11px", borderRadius: 9, transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--sidebar-active-bg, rgba(59, 132, 223, 0.18))"; e.currentTarget.style.borderColor = "var(--sidebar-active-border)"; e.currentTarget.style.color = "var(--sidebar-active-text)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--glass-border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                    <DownloadIcon />
                </button>
                {(!isMobile || isFullscreen) && (
                    <button
                        onPointerDown={(e) => { e.preventDefault(); onToggleFullscreen(); }}
                        title={isFullscreen ? t("Exit fullscreen") : t("Fullscreen")}
                        style={{
                            background: isFullscreen ? "var(--sidebar-active-bg, rgba(59, 132, 223, 0.18))" : "transparent",
                            border: isFullscreen ? "var(--sidebar-active-border)" : "var(--glass-border)",
                            cursor: "pointer", color: isFullscreen ? "var(--sidebar-active-text)" : "var(--text-secondary)",
                            display: "flex", alignItems: "center",
                            padding: "7px 11px", borderRadius: 9, transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--sidebar-active-bg, rgba(59, 132, 223, 0.18))"; e.currentTarget.style.borderColor = "var(--sidebar-active-border)"; e.currentTarget.style.color = "var(--sidebar-active-text)"; }}
                        onMouseLeave={e => {
                            if (!isFullscreen) {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.borderColor = "var(--glass-border)";
                                e.currentTarget.style.color = "var(--text-secondary)";
                            }
                        }}
                    >
                        {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
                    </button>
                )}
            </div>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   CHART FOOTER
───────────────────────────────────────────────────────────── */
const ChartFooter = ({ activeMetrics, activeKeys, openDD, setOpenDD, toggleMetric, setChartType, showDataLabels, setShowDataLabels, showChanges, setShowChanges, isFullscreen, onToggleFullscreen }) => {
    const { t } = useTranslation();
    const openMetricDD = openDD === "metric";
    const openChartTypeKey = openDD?.startsWith("chartType:") ? openDD.slice(10) : null;

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div style={{
            display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between",
            flexDirection: isMobile ? "column" : "row",
            flexWrap: "wrap", gap: isMobile ? 16 : 12, padding: isMobile ? "12px 16px" : "13px 22px 17px",
            borderTop: "var(--glass-border)",
        }}>
            <div className="flex flex-wrap items-center" style={{ gap: isMobile ? 8 : 7, width: isMobile ? "100%" : "auto" }}>
                {activeMetrics.map(m => (
                    <div key={m.key} style={{ position: "relative" }}>
                        <div
                            onPointerDown={(e) => { e.preventDefault(); setOpenDD(openChartTypeKey === m.key ? null : `chartType:${m.key}`); }}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                background: openChartTypeKey === m.key ? P.primary50 : P.neutral50,
                                border: `1.5px solid ${openChartTypeKey === m.key ? P.primary100 : P.neutral100}`,
                                borderRadius: 22, padding: isMobile ? "4px 10px 4px 8px" : "5px 12px 5px 10px",
                                fontSize: isMobile ? 12 : 13, cursor: "pointer", transition: "all 0.15s", userSelect: "none",
                                whiteSpace: "nowrap"
                            }}
                            onMouseEnter={e => { if (openChartTypeKey !== m.key) e.currentTarget.style.background = P.neutral100; }}
                            onMouseLeave={e => { if (openChartTypeKey !== m.key) e.currentTarget.style.background = P.neutral50; }}
                        >
                            <span style={{ width: 10, height: 10, flexShrink: 0, borderRadius: m.type === "bar" ? 2 : "50%", background: m.color, display: "inline-block" }} />
                            <span style={{ color: P.neutral800, fontWeight: 700, fontSize: isMobile ? 11.5 : 13 }}>{t(m.label)}</span>
                            <ChevronDownIcon size={10} color={P.neutral400} />
                        </div>
                        {openChartTypeKey === m.key && (
                            <ChartTypeDropdown metricKey={m.key} current={m.type} onChange={setChartType} onClose={() => setOpenDD(null)} isFullscreen={isFullscreen} />
                        )}
                    </div>
                ))}
                <div style={{ position: "relative", width: isMobile ? "100%" : "auto" }}>
                    <button
                        onPointerDown={(e) => { e.preventDefault(); setOpenDD(openMetricDD ? null : "metric"); }}
                        style={{
                            background: openMetricDD ? P.primary50 : "transparent",
                            border: `1.5px dashed ${openMetricDD ? P.primary : P.primary100}`,
                            color: P.primary, fontSize: isMobile ? 11.5 : 13, fontWeight: 800,
                            cursor: "pointer", padding: isMobile ? "5px 12px" : "5px 13px", borderRadius: 22,
                            transition: "all 0.15s", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 6,
                            justifyContent: isMobile ? "center" : "flex-start",
                            width: isMobile ? "100%" : "auto",
                            marginTop: isMobile ? 4 : 0
                        }}
                    >
                        <PlusIcon size={12} /> {isMobile ? t("Add New Metric") : t("Add Metrics")}
                        <span style={{ background: P.primary, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>
                            {activeKeys.length}/{MAX_METRICS}
                        </span>
                    </button>
                    {openMetricDD && (
                        <MetricDropdown activeKeys={activeKeys} onToggle={toggleMetric} onClose={() => setOpenDD(null)} position={isMobile ? "top-right" : "top-left"} />
                    )}
                </div>
            </div>
            <div className="flex items-center" style={{ gap: isMobile ? 12 : 22, width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "space-between" : "flex-end" }}>
                <div className="flex items-center" style={{ gap: isMobile ? 12 : 22 }}>
                    <Toggle value={showDataLabels} onChange={setShowDataLabels} label={isMobile ? t("Labels") : t("View Data Labels")} />
                    <Toggle value={showChanges} onChange={setShowChanges} label={isMobile ? t("Changes") : t("View Changes")} />
                </div>
                {(!isMobile || isFullscreen) && (
                    <button
                        onPointerDown={(e) => { e.preventDefault(); onToggleFullscreen(); }}
                        title={isFullscreen ? t("Exit fullscreen") : t("Fullscreen")}
                        style={{
                            background: isFullscreen ? P.primary50 : "transparent",
                            border: `1.5px solid ${isFullscreen ? P.primary100 : P.neutral200}`,
                            cursor: "pointer", color: isFullscreen ? P.primary : P.neutral600,
                            display: "flex", alignItems: "center",
                            padding: "7px 11px", borderRadius: 9, transition: "all 0.15s",
                            marginLeft: isMobile ? "auto" : 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = P.primary50; e.currentTarget.style.borderColor = P.primary100; e.currentTarget.style.color = P.primary; }}
                        onMouseLeave={e => {
                            if (!isFullscreen) {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.borderColor = P.neutral200;
                                e.currentTarget.style.color = P.neutral600;
                            }
                        }}
                    >
                        {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
                    </button>
                )}
            </div>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   TOP PERFORMANCE CARDS (dynamic, linked with chart metrics)
───────────────────────────────────────────────────────────── */
const getMetricColorTheme = (key) => {
    switch (key) {
        case "spend": return "theme-blue";
        case "sales": return "theme-orange";
        case "orders": return "theme-purple";
        case "acos": return "theme-yellow";
        case "roas": return "theme-green";
        case "impressions": return "theme-pink";
        case "clicks": return "theme-teal";
        default: return "theme-blue";
    }
};

const TopCards = ({ sumOfValues, activeMetrics, activeKeys, toggleMetric, openDD, setOpenDD, isDark }) => {
    const { t } = useTranslation();
    const openMetricDD = openDD === "card-metric";

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1100);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
            setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1100);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div className="mb-3" id="campaignTop">
            <div id="performance-cards" style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "stretch",
                gap: "12px",
                width: "100%",
            }}>
                {/* Dynamic cards based on active metrics */}
                {sumOfValues.map((cards) => (
                    <div key={cards.key} style={{
                        flex: isMobile ? "1 1 calc(50% - 6px)" : isTablet ? "1 1 calc(33.33% - 8px)" : "1 1 0px",
                        minWidth: isMobile ? "130px" : "150px"
                    }}>
                        <KPICard
                            label={t(cards.name)}
                            value={cards.number}
                            accentColor={cards.color}
                            colorTheme={getMetricColorTheme(cards.key)}
                            onRemove={() => toggleMetric(cards.key)}
                            metricKey={cards.key}
                        />
                    </div>
                ))}

                {/* Add Metric Button - Fixed width on the right */}
                <div style={{
                    flex: isMobile ? "1 1 calc(50% - 6px)" : isTablet ? "1 1 calc(33.33% - 8px)" : "0 0 100px",
                    width: isMobile || isTablet ? "auto" : "100px",
                    position: "relative",
                    marginLeft: isMobile || isTablet ? "0" : "auto"
                }}>
                    <button
                        onPointerDown={(e) => { e.preventDefault(); setOpenDD(openMetricDD ? null : "card-metric"); }}
                        style={{
                            width: "100%",
                            height: "100%",
                            minHeight: isMobile ? "60px" : "80px",
                            background: isDark
                                ? (openMetricDD ? "rgba(31, 41, 55, 0.9)" : "rgba(15, 23, 42, 0.8)")
                                : (openMetricDD ? P.primary50 : "rgba(255, 255, 255, 0.4)"),
                            border: isDark
                                ? `2px dashed ${openMetricDD ? "#3B82F6" : "rgba(255, 255, 255, 0.15)"}`
                                : `2px dashed ${openMetricDD ? P.primary : P.neutral300}`,
                            borderRadius: 16,
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: isMobile ? "row" : "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: isMobile ? 10 : 6,
                            padding: isMobile ? "0 12px" : "8px",
                            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                            color: isDark
                                ? (openMetricDD ? "#3B82F6" : "#E5E7EB")
                                : (openMetricDD ? P.primary : P.neutral600),
                            backdropFilter: isDark ? "blur(16px)" : undefined,
                            WebkitBackdropFilter: isDark ? "blur(16px)" : undefined,
                        }}
                        onMouseEnter={e => {
                            if (!openMetricDD) {
                                e.currentTarget.style.background = isDark ? "rgba(31, 41, 55, 0.9)" : P.primary50;
                                e.currentTarget.style.borderColor = isDark ? "#3B82F6" : P.primary;
                                e.currentTarget.style.color = isDark ? "#3B82F6" : P.primary;
                                e.currentTarget.style.transform = "translateY(-4px)";
                            }
                        }}
                        onMouseLeave={e => {
                            if (!openMetricDD) {
                                e.currentTarget.style.background = isDark ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.4)";
                                e.currentTarget.style.borderColor = isDark ? "rgba(255, 255, 255, 0.15)" : P.neutral300;
                                e.currentTarget.style.color = isDark ? "#E5E7EB" : P.neutral600;
                                e.currentTarget.style.transform = "translateY(0px)";
                            }
                        }}
                    >
                        <PlusIcon size={isMobile ? 18 : 22} strokeWidth={2} />
                        <div className="flex flex-col" style={{ alignItems: isMobile ? "flex-start" : "center" }}>
                            <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700 }}>{t("Add Metric")}</span>
                            <span style={{ fontSize: 10, color: isDark ? "#94A3B8" : P.neutral400, fontWeight: 600 }}>{activeKeys.length}/{MAX_METRICS}</span>
                        </div>
                    </button>
                    {openMetricDD && (
                        <MetricDropdown
                            activeKeys={activeKeys}
                            onToggle={toggleMetric}
                            onClose={() => setOpenDD(null)}
                            position="bottom-right"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   MAIN CHART COMPONENT
   Props:
     chartLoading  — boolean
     chartData     — array of objects with { reportDate, ...metric keys }
     totalRow      — object with aggregated totals (same shape as before)
───────────────────────────────────────────────────────────── */
const Chart = ({ chartLoading = false, isTotalsLoading = false, chartData = [], totalRow = {}, id }) => {
    const { t } = useTranslation();

    /* ── theme observer to repaint chart reactively ── */
    const [theme, setTheme] = useState(document.documentElement.getAttribute("data-theme") || "light");
    useEffect(() => {
        const observer = new MutationObserver(() => {
            const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
            setTheme(currentTheme);
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const isDark = theme === "dark";

    /* ── CHART PANEL STATE ── */
    const [granularity, setGranularity] = useState("Daily");
    const [activeKeys, setActiveKeys] = useState(DEFAULT_ACTIVE);
    const [chartTypes, setChartTypes] = useState({ sales: "bar", spend: "bar" });
    const [showDataLabels, setShowDataLabels] = useState(false);
    const [showChanges, setShowChanges] = useState(false);
    const [viewMode, setViewMode] = useState("chart");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [openDD, setOpenDD] = useState(null);

    // Lock body scroll in fullscreen
    useEffect(() => {
        document.body.style.overflow = isFullscreen ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [isFullscreen]);

    // Toggle metric - sync between chart and cards
    const toggleMetric = useCallback((key) => {
        setActiveKeys(prev => {
            const isActive = prev.includes(key);
            // Enforce min/max limits
            if ((isActive && prev.length <= MIN_METRICS) || (!isActive && prev.length >= MAX_METRICS)) return prev;
            return isActive ? prev.filter(k => k !== key) : [...prev, key];
        });
        // Close any open dropdowns after toggling
        setOpenDD(null);
    }, []);

    // Replace metric (for card dropdown replacement)
    const replaceMetric = useCallback((oldKey, newKey) => {
        setActiveKeys(prev => {
            if (!prev.includes(oldKey) || prev.includes(newKey)) return prev;
            return prev.map(k => k === oldKey ? newKey : k);
        });
        setOpenDD(null);
    }, []);

    const setChartType = useCallback((key, type) => {
        setChartTypes(prev => ({ ...prev, [key]: type }));
    }, []);

    /* ── ACTIVE METRICS (derived from activeKeys) ── */
    const activeMetrics = useMemo(() => {
        return activeKeys.map(k => {
            const base = ALL_METRICS.find(m => m.key === k);
            if (!base) return null;
            const existingType = chartTypes[k] || "line";
            const isBar = existingType === "bar";
            let color = base.color;
            // Override line metric colors per theme; bar metrics keep RGBA fills as-is
            if (!isBar) {
                if (k === "orders") color = "#2374F2";
                else if (k === "acos") color = "#F07070";
                else if (k === "roas") color = "#3ECFA8";
                else if (k === "impressions") color = "#8B5CF6";
                else if (k === "clicks") color = "#06B6D4";
            }
            return { ...base, color, type: existingType };
        }).filter(Boolean);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeKeys, chartTypes, isDark]);

    /* ── TOP CARDS VALUES (dynamic based on activeMetrics) ── */
    const sumOfValues = useMemo(() => {
        const loadingState = isTotalsLoading || (Object.keys(totalRow || {}).length === 0 && chartLoading);
        return buildSumOfValues(totalRow, activeMetrics, loadingState, t);
    }, [totalRow, activeMetrics, isTotalsLoading, chartLoading, t]);

    /* ── AGGREGATED DATA (uses reportDate as the date key) ── */
    const aggData = useMemo(() => {
        if (!chartData?.length) return [];
        if (granularity === "Daily") {
            return chartData.map(d => ({ ...d, label: fmtDate(d.reportDate) }));
        }
        const buckets = {};
        chartData.forEach(d => {
            const dt = new Date(d.reportDate);
            let key;
            if (granularity === "Weekly") {
                const ws = new Date(dt); ws.setDate(dt.getDate() - dt.getDay()); key = ws.toISOString().slice(0, 10);
            } else {
                key = d.reportDate?.slice(0, 7) ?? "";
            }
            if (!buckets[key]) buckets[key] = { reportDate: key, _n: 0, ...Object.fromEntries(ALL_METRICS.map(m => [m.key, 0])) };
            buckets[key]._n++;
            ALL_METRICS.forEach(m => { buckets[key][m.key] = (buckets[key][m.key] || 0) + (d[m.key] || 0); });
        });
        return Object.values(buckets).map(b => ({
            ...b,
            label: fmtDate(b.reportDate),
            // Average out ratio-type metrics
            ...Object.fromEntries(
                ALL_METRICS.filter(m => ["acos", "roas", "ctr", "cpc"].includes(m.key))
                    .map(m => [m.key, b[m.key] / b._n])
            ),
        }));
    }, [chartData, granularity]);

    const { axisMap, leftCount, rightCount } = useMemo(() => assignAxes(activeMetrics), [activeMetrics]);

    /* ── SHARED PROPS ── */
    const sharedChartProps = { aggData, activeMetrics, axisMap, leftCount, rightCount, showChanges, showDataLabels };
    const headerProps = {
        viewMode, setViewMode, granularity, setGranularity,
        onDownload: () => downloadExcel(aggData, activeMetrics),
        isFullscreen, onToggleFullscreen: () => setIsFullscreen(f => !f),
    };
    const footerProps = {
        activeMetrics, activeKeys, openDD, setOpenDD,
        toggleMetric, setChartType,
        showDataLabels, setShowDataLabels,
        showChanges, setShowChanges, isFullscreen,
        onToggleFullscreen: () => setIsFullscreen(f => !f),
    };

    /* ── INNER CONTENT (shared between normal & fullscreen) ── */
    const innerChartContent = (fullscreen) => (
        <>
            {!fullscreen && <ChartHeader {...headerProps} isFullscreen={false} />}
            {viewMode === "table" ? (
                <div style={{
                    flex: fullscreen ? 1 : undefined,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    padding: fullscreen ? "8px 0" : 0,
                }}>
                    <TableView
                        data={aggData}
                        activeMetrics={activeMetrics}
                        isFullscreen={fullscreen}
                        isDark={isDark}
                    />
                </div>
            ) : (
                <div style={{ padding: "14px 0 4px", flex: 1, minHeight: 0, height: fullscreen ? "100%" : "auto" }}>
                    {aggData.length === 0 ? (
                        <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: P.neutral400, fontSize: 15, fontWeight: 600 }}>
                            {t("No data available")}
                        </div>
                    ) : (
                        <ChartInner {...sharedChartProps} isDark={isDark} chartHeight={fullscreen ? "100%" : 300} />
                    )}
                </div>
            )}
            <ChartFooter {...footerProps} />
        </>
    );

    return (
        <>
            {/* ── TOP PERFORMANCE CARDS (dynamic, linked) ── */}
            <TopCards
                sumOfValues={sumOfValues}
                activeMetrics={activeMetrics}
                activeKeys={activeKeys}
                toggleMetric={toggleMetric}
                replaceMetric={replaceMetric}
                openDD={openDD}
                setOpenDD={setOpenDD}
                isDark={isDark}
            />

            <div className="mb-3" id={id}>
                {/* ── CHART PANEL ── */}
                {(() => {
                    return chartLoading ? (
                        <div className="dg-root" style={{ minHeight: "360px", position: "relative" }}>
                            <div style={{
                                padding: "16px 22px",
                                borderBottom: "var(--glass-border)",
                                fontWeight: 800,
                                fontSize: 17,
                                color: "var(--text-primary)"
                            }}>
                                {t("Performance Overview")}
                            </div>
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#1A9FD4]" />
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("Loading chart data...")}</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Normal inline card */}
                            <div className="dg-root" style={{
                                overflow: "visible",
                                visibility: isFullscreen ? "hidden" : "visible",
                            }}>
                                {innerChartContent(false)}
                            </div>

                            {/* Fullscreen portal */}
                            {isFullscreen && ReactDOM.createPortal(
                                <div className="chart-fullscreen-container" style={{
                                    position: "fixed", inset: 0, zIndex: 99999,
                                    background: "var(--canvas-bg)",
                                    backgroundColor: isDark ? "#0A0E1A" : "#F4F7FA",
                                    display: "flex", flexDirection: "column",
                                    animation: "fsIn 0.2s ease", overflow: "hidden",
                                    borderRadius: 0,
                                    border: "none",
                                    width: "100vw",
                                    height: "100vh",
                                }}>
                                    <ChartHeader {...headerProps} isFullscreen={true} />
                                    {innerChartContent(true)}
                                </div>,
                                document.body
                            )}
                        </>
                    );
                })()}
            </div>
        </>
    );
};

export default Chart;