import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import {
    ComposedChart, Line, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { Card } from "../../../../components/ui/card";
import { AppTooltip } from "../../../../components/ui/AppTooltip";
import { formatRegionalCurrency } from "../../../../utility/regionalNumberFormat";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

const P = {
    barTotalSales: "rgba(120, 180, 255, 0.35)",
    barTotalSalesBorder: "rgba(120, 180, 255, 0.70)",
    barAdSpend: "rgba(255, 160, 100, 0.30)",
    barAdSpendBorder: "rgba(255, 160, 100, 0.65)",
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

const ALL_METRICS = [
    { key: "totalSales", label: "Total Sales", color: P.barTotalSales, stroke: P.barTotalSalesBorder, side: "right", format: "currency", chartType: "bar" },
    { key: "spend", label: "Ad Spend", color: P.barAdSpend, stroke: P.barAdSpendBorder, side: "right", format: "currency", chartType: "bar" },
    { key: "orders", label: "Orders", color: "#2374F2", side: "left", format: "number" },
    { key: "acos", label: "ACOS", color: "#F07070", side: "right", format: "percent" },
    { key: "adSales", label: "Ad Revenue", color: "#F0B04A", side: "right", format: "currency" },
    { key: "tacos", label: "Total ACOS (TACOS)", color: "#F07070", side: "left", format: "percent" },
    { key: "roas", label: "ROAS", color: "#3ECFA8", side: "left", format: "number" },
    { key: "impressions", label: "Impressions", color: "#8B5CF6", side: "right", format: "number" },
    { key: "clicks", label: "Clicks", color: "#06B6D4", side: "left", format: "number" },
    { key: "ctr", label: "CTR", color: "#EC4899", side: "right", format: "percent" },
    { key: "cpc", label: "Avg CPC", color: "#3ECFA8", side: "right", format: "currency" },
    { key: "profit", label: "Profit", color: "#3ECFA8", side: "right", format: "currency" },
    { key: "organicSales", label: "Organic Sales", color: "#F0B04A", side: "right", format: "currency" },
    { key: "adOrders", label: "Ad Orders", color: "#2374F2", side: "left", format: "number" },
];

const FREQ_KEYS = ["spend", "adSales", "acos", "roas", "impressions", "clicks", "ctr", "cpc", "totalSales"];
const DEFAULT_ACTIVE = ["totalSales", "spend", "orders", "acos"];
const MIN_METRICS = 2;
const MAX_METRICS = 6;
const AXIS_WIDTH = 65; // px per Y-axis

function assignAxes(activeMetrics) {
    const n = activeMetrics.length;
    const leftCount = n <= 1 ? 1 : n <= 2 ? 1 : n <= 3 ? 2 : n <= 4 ? 2 : 3;
    const rightCount = n - leftCount;

    // Separate preferred-left and preferred-right
    const prefLeft = activeMetrics.filter(m => m.side === "left");
    const prefRight = activeMetrics.filter(m => m.side === "right");

    // Fill left slots, overflow goes to right
    const leftMetrics = [];
    const rightMetrics = [];

    prefLeft.forEach(m => {
        if (leftMetrics.length < leftCount) leftMetrics.push(m);
        else rightMetrics.push(m);
    });
    prefRight.forEach(m => {
        if (rightMetrics.length < rightCount) rightMetrics.push(m);
        else leftMetrics.push(m);
    });

    // Assign axis IDs
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
const getActiveLocaleInfo = () => {
    try {
        const p = JSON.parse(localStorage.getItem("profile"));
        return {
            currencyCode: p?.currencyCode || p?.profile?.currencyCode || "INR",
            marketplace: p?.countryCode || p?.profile?.countryCode || "IN",
        };
    } catch (e) {
        return { currencyCode: "INR", marketplace: "IN" };
    }
};

const fmtVal = (v, fmt, currencyCode, marketplace) => {
    if (v == null || v === "") return "";
    const n = Number(v);
    if (fmt === "currency") {
        const localeInfo = (!currencyCode || !marketplace) ? getActiveLocaleInfo() : {};
        const cur = currencyCode || localeInfo.currencyCode || "INR";
        const mp = marketplace || localeInfo.marketplace || "IN";
        return formatRegionalCurrency(n, cur, mp, 1);
    }
    if (fmt === "percent") return `${n.toFixed(2)}%`;
    return n % 1 === 0 ? `${n}` : n.toFixed(2);
};
const fmtAxis = (v, fmt, currencyCode, marketplace) => {
    const n = Number(v);
    if (fmt === "currency") {
        const localeInfo = (!currencyCode || !marketplace) ? getActiveLocaleInfo() : {};
        const cur = currencyCode || localeInfo.currencyCode || "INR";
        const mp = marketplace || localeInfo.marketplace || "IN";
        return formatRegionalCurrency(n, cur, mp, 0);
    }
    if (fmt === "percent") return `${n}%`;
    return n;
};

/* ─────────────────────────────────────────────────────────────
   EXCEL DOWNLOAD
───────────────────────────────────────────────────────────── */
const downloadExcel = async (data, activeMetrics) => {
    try {
        const XLSX = await import("xlsx");
        const rows = data.map(row => {
            const r = { Date: row.label || row.date };
            activeMetrics.forEach(m => { r[m.label] = row[m.key] ?? ""; });
            return r;
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 14 }, ...activeMetrics.map(() => ({ wch: 18 }))];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
        XLSX.writeFile(wb, "dashboard_report.xlsx");
    } catch (err) {
        console.error("Error generating Excel:", err);
    }
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
    <label className="flex items-center" style={{ gap: 8, cursor: "pointer", userSelect: "none", fontSize: 13, color: "var(--text-secondary)" }}>
        <div
            onPointerDown={(e) => { e.preventDefault(); onChange(!value); }}
            style={{
                width: 38, height: 21, borderRadius: 11,
                background: value ? "rgba(59, 132, 223, 0.35)" : "rgba(120, 120, 120, 0.2)",
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
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{label}</span>
    </label>
);

/* ─────────────────────────────────────────────────────────────
   CUSTOM TOOLTIP
───────────────────────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label, activeMetrics }) => {
    const { t } = useTranslation();
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: "var(--dropdown-bg)", border: "var(--glass-border)",
            borderRadius: 12, padding: "12px 16px",
            boxShadow: "var(--glass-shadow)",
            fontSize: 13, minWidth: 195, zIndex: 9999,
            color: "var(--text-primary)"
        }}>
            <div style={{ fontWeight: 800, marginBottom: 9, color: "var(--text-primary)", fontSize: 13, borderBottom: "var(--glass-border)", paddingBottom: 7 }}>{label}</div>
            {payload.map((entry) => {
                const meta = activeMetrics.find(m => m.key === entry.dataKey);
                if (!meta) return null;
                return (
                    <div className="flex justify-between items-center" key={entry.dataKey} style={{ gap: 16, marginBottom: 5 }}>
                        <div className="flex items-center" style={{ gap: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ color: "var(--text-secondary)", fontSize: 12.5 }}>{t(meta.label)}</span>
                        </div>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtVal(entry.value, meta.format)}</span>
                    </div>
                );
            })}
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   VIEW CHANGES BADGE DOT
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
                        fontFamily: "inherit",
                    }}>
                        {isUp ? "▲" : "▼"}{Math.abs(pct).toFixed(0)}%
                    </div>
                </foreignObject>
            )}
        </g>
    );
};

/* ─────────────────────────────────────────────────────────────
   METRIC DROPDOWN  (portal-based to escape stacking context)
───────────────────────────────────────────────────────────── */
const MetricDropdown = ({ activeKeys, onToggle, onClose, triggerRef }) => {
    const { t } = useTranslation();
    const ref = useRef();
    const [pos, setPos] = useState({ bottom: 0, left: 0 });

    useEffect(() => {
        if (triggerRef?.current) {
            const r = triggerRef.current.getBoundingClientRect();
            setPos({ bottom: window.innerHeight - r.top + 8, left: r.left });
        }
    }, [triggerRef]);

    useEffect(() => {
        const h = (e) => {
            if (ref.current && !ref.current.contains(e.target) &&
                !(triggerRef?.current && triggerRef.current.contains(e.target))) onClose();
        };
        const tid = setTimeout(() => document.addEventListener("pointerdown", h), 0);
        return () => { clearTimeout(tid); document.removeEventListener("pointerdown", h); };
    }, [onClose, triggerRef]);

    const freqMetrics = ALL_METRICS.filter(m => FREQ_KEYS.includes(m.key));
    const otherMetrics = ALL_METRICS.filter(m => !FREQ_KEYS.includes(m.key));
    const atMax = activeKeys.length >= MAX_METRICS;

    const Row = ({ m }) => {
        const active = activeKeys.includes(m.key);
        const disabled = (!active && atMax) || (active && activeKeys.length <= MIN_METRICS);
        return (
            <div
                onPointerDown={(e) => { e.preventDefault(); if (!disabled) onToggle(m.key); }}
                style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.4 : 1, transition: "background 0.12s", userSelect: "none",
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
            <div style={{ fontSize: 10, fontWeight: 800, color: P.neutral400, padding: "10px 16px 4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</div>
            {metrics.map(m => <Row key={m.key} m={m} />)}
        </div>
    );

    return ReactDOM.createPortal(
        <div ref={ref} style={{
            position: "fixed", bottom: pos.bottom, left: pos.left, zIndex: 99999,
            background: "var(--dropdown-bg)", border: "var(--glass-border)", borderRadius: 13,
            boxShadow: "0 16px 50px rgba(0,0,0,0.25)", minWidth: 240,
            maxHeight: 420, overflowY: "auto", animation: "ddFade 0.14s ease",
        }}>
            {atMax && (
                <div style={{ background: P.primary50, borderBottom: `1px solid ${P.primary100}`, padding: "8px 16px", fontSize: 12.5, color: P.primary, fontWeight: 700 }}>
                    Max {MAX_METRICS} metrics reached
                </div>
            )}
            {activeKeys.length <= MIN_METRICS && (
                <div style={{ background: "#FEF3C7", borderBottom: `1px solid ${P.primary100}`, padding: "8px 16px", fontSize: 12.5, color: P.primary, fontWeight: 700 }}>
                    Minimum {MIN_METRICS} metrics required
                </div>
            )}
            <Section title={t("Frequently Used")} metrics={freqMetrics} />
            <Section title={t("Other")} metrics={otherMetrics} />
        </div>,
        document.body
    );
};

/* ─────────────────────────────────────────────────────────────
   CHART TYPE DROPDOWN  (portal-based to escape stacking context)
───────────────────────────────────────────────────────────── */
const ChartTypeDropdown = ({ metricKey, current, onChange, onClose, isFullscreen, triggerRef }) => {
    const { t } = useTranslation();
    const ref = useRef();
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (triggerRef?.current) {
            const r = triggerRef.current.getBoundingClientRect();
            if (isFullscreen) {
                setPos({ top: null, bottom: window.innerHeight - r.top + 6, left: r.left });
            } else {
                setPos({ top: r.bottom + 6, bottom: null, left: r.left });
            }
        }
    }, [triggerRef, isFullscreen]);

    useEffect(() => {
        const h = (e) => {
            if (ref.current && !ref.current.contains(e.target) &&
                !(triggerRef?.current && triggerRef.current.contains(e.target))) onClose();
        };
        const tid = setTimeout(() => document.addEventListener("pointerdown", h), 0);
        return () => { clearTimeout(tid); document.removeEventListener("pointerdown", h); };
    }, [onClose, triggerRef]);

    const style = {
        position: "fixed", left: pos.left, zIndex: 99999,
        background: "var(--dropdown-bg)", border: "var(--glass-border)", borderRadius: 11,
        boxShadow: "0 8px 28px rgba(0,0,0,0.2)", overflow: "hidden", minWidth: 150,
        animation: "ddFade 0.12s ease",
    };
    if (pos.top != null) style.top = pos.top;
    if (pos.bottom != null) style.bottom = pos.bottom;

    return ReactDOM.createPortal(
        <div ref={ref} style={style}>
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
                    {t(type === "line" ? "Line Chart" : "Bar Chart")}
                </div>
            ))}
        </div>,
        document.body
    );
};

/* ─────────────────────────────────────────────────────────────
   GRANULARITY DROPDOWN  (portal-based to escape stacking context)
───────────────────────────────────────────────────────────── */
const GranularityDropdown = ({ value, onChange, isMobile }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef();
    const btnRef = useRef();
    const [pos, setPos] = useState({ top: 0, right: 0 });

    useEffect(() => {
        const h = (e) => {
            if (ref.current && !ref.current.contains(e.target) &&
                !(btnRef.current && btnRef.current.contains(e.target))) setOpen(false);
        };
        document.addEventListener("pointerdown", h);
        return () => document.removeEventListener("pointerdown", h);
    }, []);

    const handleToggle = (e) => {
        e.preventDefault();
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 5, right: window.innerWidth - r.right });
        }
        setOpen(o => !o);
    };

    return (
        <div style={{ position: "relative" }}>
            <button
                ref={btnRef}
                onPointerDown={handleToggle}
                style={{
                    display: "flex", alignItems: "center", gap: 7, padding: isMobile ? "6px 10px" : "7px 14px",
                    border: open ? "1.5px solid var(--sidebar-active-border)" : "var(--button-secondary-border)", borderRadius: 9,
                    background: open ? P.primary50 : "var(--button-secondary-bg)",
                    fontSize: isMobile ? 12 : 13.5, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer",
                    transition: "all 0.15s", fontFamily: "inherit",
                }}
            >
                {t(value)} <ChevronDownIcon color={P.neutral400} />
            </button>
            {open && ReactDOM.createPortal(
                <div ref={ref} style={{
                    position: "fixed", top: pos.top, right: pos.right, zIndex: 99999,
                    background: "var(--dropdown-bg)", border: "var(--glass-border)", borderRadius: 11,
                    boxShadow: "0 8px 28px rgba(0,0,0,0.2)", overflow: "hidden", minWidth: 130,
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
                </div>,
                document.body
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
                                    {row.label || row.date}
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
    <>
        <div style={{
            height: 260, margin: "20px 22px",
            background: `linear-gradient(90deg,${P.neutral100} 25%,${P.neutral200} 50%,${P.neutral100} 75%)`,
            backgroundSize: "400% 100%", borderRadius: 12,
            animation: "shimmer 1.5s infinite linear",
        }} />
    </>
);

/* ─────────────────────────────────────────────────────────────
   CHART INNER  (reused for both normal and fullscreen)
───────────────────────────────────────────────────────────── */
const ChartInner = ({
    aggData, activeMetrics, axisMap, leftCount, rightCount,
    showChanges, showDataLabels, chartHeight, isMobile, isDark
}) => {
    const { t } = useTranslation();
    const lineMetrics = activeMetrics.filter(m => m.type !== "bar");
    // Build a map: axisId → format (from first metric using it)
    const axisFmtMap = {};
    const axisColorMap = {};
    activeMetrics.forEach(m => {
        const id = axisMap[m.key];
        if (id && !axisFmtMap[id]) { axisFmtMap[id] = m.format; axisColorMap[id] = getSolidColor(m); }
    });

    // Exact margin based on real axis count
    const marginLeft = 10;
    const marginRight = 10;
    const effectiveAxisWidth = isMobile ? 45 : AXIS_WIDTH;

    return (
        <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart
                data={aggData}
                margin={{ top: showChanges ? 44 : 22, right: marginRight, left: marginLeft, bottom: 4 }}
            >
                <defs>
                    {lineMetrics.map(m => (
                        <filter key={`glow-${m.key}`} id={`glow-${m.key}`} x="-20%" y="-20%" width="140%" height="140%">
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
                    tick={{ fontSize: isMobile ? 10 : 12.5, fill: isDark ? "#9CA3AF" : "#475569", fontWeight: 600 }}
                    axisLine={false} tickLine={false} dy={7}
                />

                {/* LEFT AXES — render only as many as leftCount */}
                {["L1", "L2", "L3"].slice(0, leftCount).map((id, idx) => {
                    if (!axisFmtMap[id]) return null;
                    if (isMobile && idx > 0) return null; // Only show first left axis on mobile
                    const metricForAxis = activeMetrics.find(m => axisMap[m.key] === id);
                    return (
                        <YAxis key={id} yAxisId={id} orientation="left"
                            tick={{ fontSize: isMobile ? 9 : 11.5, fill: axisColorMap[id], fontWeight: 700 }}
                            axisLine={{ stroke: axisColorMap[id], strokeWidth: 1.5, strokeOpacity: 0.25 }}
                            tickLine={false}
                            tickFormatter={v => fmtAxis(v, axisFmtMap[id])}
                            width={effectiveAxisWidth}
                            label={isMobile ? null : {
                                value: metricForAxis?.label ? t(metricForAxis.label) : "",
                                angle: -90,
                                position: "insideLeft",
                                offset: 15,
                                style: { fontSize: 11, fill: axisColorMap[id], fontWeight: 700, textAnchor: "middle" }
                            }}
                        />
                    );
                })}

                {/* RIGHT AXES — render only as many as rightCount */}
                {["R1", "R2", "R3"].slice(0, rightCount).map((id, idx) => {
                    if (!axisFmtMap[id]) return null;
                    if (isMobile && idx > 0) return null; // Only show first right axis on mobile
                    const metricForAxis = activeMetrics.find(m => axisMap[m.key] === id);
                    return (
                        <YAxis key={id} yAxisId={id} orientation="right"
                            tick={{ fontSize: isMobile ? 9 : 11.5, fill: axisColorMap[id], fontWeight: 700 }}
                            axisLine={{ stroke: axisColorMap[id], strokeWidth: 1.5, strokeOpacity: 0.25 }}
                            tickLine={false}
                            tickFormatter={v => fmtAxis(v, axisFmtMap[id])}
                            width={effectiveAxisWidth}
                            label={isMobile ? null : {
                                value: metricForAxis?.label ? t(metricForAxis.label) : "",
                                angle: 90,
                                position: "insideRight",
                                offset: 15,
                                style: { fontSize: 11, fill: axisColorMap[id], fontWeight: 700, textAnchor: "middle" }
                            }}
                        />
                    );
                })}

                <Tooltip content={<CustomTooltip activeMetrics={activeMetrics} />} />

                {activeMetrics.map(m => {
                    const yId = axisMap[m.key];
                    if (!yId) return null;

                    // If mobile and not primary axis, we still render the data but it maps to the visible axes 
                    // or we hide it if it's too confusing? Usually better to keep the lines but hide the labels.
                    // Recharts handles multiple Y-axes fine even if only some are rendered.

                    if (m.type === "bar") {
                        return (
                            <Bar key={m.key} dataKey={m.key} fill={m.color}
                                stroke={m.stroke || m.color} strokeWidth={1}
                                yAxisId={yId} radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 18 : 28}
                            >
                                {showDataLabels && (
                                    <LabelList dataKey={m.key} position="top"
                                        style={{ fontSize: 9, fill: m.color, fontWeight: 700 }}
                                        formatter={v => fmtVal(v, m.format)}
                                    />
                                )}
                            </Bar>
                        );
                    }

                    return (
                        <Line key={m.key} type="monotone" dataKey={m.key}
                            stroke={m.color} yAxisId={yId}
                            strokeWidth={1.5}
                            strokeLinejoin="round" strokeLinecap="round"
                            dot={makeCustomDot(m.color, aggData, m.key, showChanges)}
                            activeDot={{ r: isMobile ? 4 : 6, fill: m.color, stroke: "#fff", strokeWidth: 2 }}
                            style={{ filter: `url(#glow-${m.key})` }}
                        >
                            {showDataLabels && (
                                <LabelList dataKey={m.key} position="top"
                                    style={{ fontSize: 9, fill: m.color, fontWeight: 700 }}
                                    formatter={v => fmtVal(v, m.format)}
                                />
                            )}
                        </Line>
                    );
                })}
            </ComposedChart>
        </ResponsiveContainer>
    );
};

/* ─────────────────────────────────────────────────────────────
   HEADER + FOOTER (shared between normal & fullscreen)
───────────────────────────────────────────────────────────── */
const ChartHeader = ({ viewMode, setViewMode, granularity, setGranularity, onDownload, isFullscreen, onToggleFullscreen, isMobile }) => {
    const { t } = useTranslation();
    return (
        <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: isMobile ? "12px 15px" : "15px 22px",
            borderBottom: "var(--glass-border)",
            flexWrap: "wrap", gap: 10,
        }}>
            <span style={{ fontWeight: 800, fontSize: isMobile ? 16 : 18, color: "var(--text-primary)", letterSpacing: "-0.4px" }}>{t("Charts")}</span>
            <div className="flex items-center flex-wrap justify-end" style={{ gap: isMobile ? 6 : 10 }}>
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
                    <TableIcon /> {!isMobile && t(viewMode === "table" ? "View as chart" : "View as table")}
                </button>
                <GranularityDropdown value={granularity} onChange={setGranularity} isMobile={isMobile} />
                <AppTooltip text={t("Download Excel")}>
                    <button
                        onPointerDown={(e) => { e.preventDefault(); onDownload(); }}
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
                </AppTooltip>
                {!isMobile && (
                    <AppTooltip text={isFullscreen ? t("Exit fullscreen") : t("Fullscreen")}>
                        <button
                            onPointerDown={(e) => { e.preventDefault(); onToggleFullscreen(); }}
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
                    </AppTooltip>
                )}
            </div>
        </div>
    );
};

const ChartFooter = ({ activeMetrics, activeKeys, openDD, setOpenDD, toggleMetric, setChartType, showDataLabels, setShowDataLabels, showChanges, setShowChanges, isFullscreen, isMobile }) => {
    const { t } = useTranslation();
    const openMetricDD = openDD === "metric";
    const openChartTypeKey = openDD?.startsWith("chartType:") ? openDD.slice(10) : null;
    const badgeRefs = useRef({});
    const addMetricsRef = useRef(null);

    return (
        <div style={{
            display: "flex", alignItems: "center", justifyContent: isMobile ? "center" : "space-between",
            flexWrap: "wrap", gap: isMobile ? 16 : 12, padding: isMobile ? "16px 15px" : "13px 22px 17px",
            borderTop: `1px solid ${P.neutral100}`,
        }}>
            {/* Metric Badges Column/Row */}
            <div style={{
                display: "flex", flexWrap: "wrap", gap: 7,
                alignItems: "center", justifyContent: isMobile ? "center" : "flex-start",
                flex: isMobile ? "1 1 100%" : 1
            }}>
                {activeMetrics.map(m => (
                    <div key={m.key} style={{ position: "relative" }}>
                        <div
                            ref={el => { badgeRefs.current[m.key] = el; }}
                            onPointerDown={(e) => { e.preventDefault(); setOpenDD(openChartTypeKey === m.key ? null : `chartType:${m.key}`); }}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                background: openChartTypeKey === m.key ? P.primary50 : P.neutral50,
                                border: `1.5px solid ${openChartTypeKey === m.key ? P.primary100 : P.neutral100}`,
                                borderRadius: 22, padding: isMobile ? "5px 10px" : "5px 12px 5px 10px",
                                fontSize: isMobile ? 11.5 : 13, cursor: "pointer", transition: "all 0.15s", userSelect: "none",
                                whiteSpace: "nowrap", // PREVENT TEXT WRAPPING
                            }}
                            onMouseEnter={e => { if (openChartTypeKey !== m.key) e.currentTarget.style.background = P.neutral100; }}
                            onMouseLeave={e => { if (openChartTypeKey !== m.key) e.currentTarget.style.background = P.neutral50; }}
                        >
                            <span style={{ width: 10, height: 10, flexShrink: 0, borderRadius: m.type === "bar" ? 2 : "50%", background: m.color, display: "inline-block" }} />
                            <span style={{ color: P.neutral800, fontWeight: 700 }}>{t(m.label)}</span>
                            <ChevronDownIcon size={11} color={P.neutral400} />
                        </div>
                        {openChartTypeKey === m.key && (
                            <ChartTypeDropdown
                                metricKey={m.key} current={m.type}
                                onChange={setChartType}
                                onClose={() => setOpenDD(null)}
                                isFullscreen={isFullscreen}
                                triggerRef={{ current: badgeRefs.current[m.key] }}
                            />
                        )}
                    </div>
                ))}

                <div style={{ position: "relative" }}>
                    <button
                        ref={addMetricsRef}
                        onPointerDown={(e) => { e.preventDefault(); setOpenDD(openMetricDD ? null : "metric"); }}
                        style={{
                            background: openMetricDD ? P.primary50 : "transparent",
                            border: `1.5px dashed ${openMetricDD ? P.primary : P.primary100}`,
                            color: P.primary, fontSize: isMobile ? 11.5 : 13, fontWeight: 800,
                            cursor: "pointer", padding: isMobile ? "5px 12px" : "5px 13px", borderRadius: 22,
                            transition: "all 0.15s", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 6,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {t("+ Add Metrics")}
                        <span style={{ background: P.primary, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 5px" }}>
                            {activeKeys.length}/{MAX_METRICS}
                        </span>
                    </button>
                    {openMetricDD && (
                        <MetricDropdown
                            activeKeys={activeKeys}
                            onToggle={toggleMetric}
                            onClose={() => setOpenDD(null)}
                            triggerRef={addMetricsRef}
                        />
                    )}
                </div>
            </div>

            {/* Switches Row */}
            <div style={{
                display: "flex", gap: isMobile ? 24 : 22,
                alignItems: "center", justifyContent: "center",
                flex: isMobile ? "1 1 100%" : "none",
                paddingTop: isMobile ? 8 : 0,
                borderTop: isMobile ? `1px dashed ${P.neutral100}` : "none"
            }}>
                <Toggle value={showDataLabels} onChange={setShowDataLabels} label={isMobile ? t("Labels") : t("View Data Labels")} />
                <Toggle value={showChanges} onChange={setShowChanges} label={isMobile ? t("Changes") : t("View Changes")} />
            </div>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────── */
const DashboardGraph = ({ isChartLoading = false, chartData = [] }) => {
    const [granularity, setGranularity] = useState("Daily");
    const [activeKeys, setActiveKeys] = useState(DEFAULT_ACTIVE);
    const [chartTypes, setChartTypes] = useState({ totalSales: "bar", spend: "bar" });
    const [showDataLabels, setShowDataLabels] = useState(false);
    const [showChanges, setShowChanges] = useState(false);
    const [viewMode, setViewMode] = useState("chart");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [openDD, setOpenDD] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    const { t } = useTranslation();
    useEffect(() => {
        const h = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", h);
        return () => window.removeEventListener("resize", h);
    }, []);

    useEffect(() => {
        const h = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        window.addEventListener("themeChanged", h);
        return () => window.removeEventListener("themeChanged", h);
    }, []);

    // Lock body scroll when fullscreen
    useEffect(() => {
        document.body.style.overflow = isFullscreen ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [isFullscreen]);

    const toggleMetric = useCallback((key) => {
        setActiveKeys(prev => {
            const isActive = prev.includes(key);
            if ((isActive && prev.length <= MIN_METRICS) || (!isActive && prev.length >= MAX_METRICS)) return prev;
            return isActive ? prev.filter(k => k !== key) : [...prev, key];
        });
    }, []);

    const setChartType = useCallback((key, type) => {
        setChartTypes(prev => ({ ...prev, [key]: type }));
    }, []);

    /* Aggregated data */
    const aggData = useMemo(() => {
        if (!chartData?.length) return [];

        const normalizedData = chartData.map(d => {
            const effectiveOrders = (d.orders != null && d.orders > 0) ? d.orders : (d.adOrders || 0);
            const effectiveTotalSales = (d.totalSales != null && d.totalSales > 0) ? d.totalSales : (d.adSales || 0);
            return {
                ...d,
                orders: effectiveOrders,
                totalSales: effectiveTotalSales,
                label: fmtDate(d.date),
            };
        });

        if (granularity === "Daily") return normalizedData;

        const buckets = {};
        normalizedData.forEach(d => {
            const dt = new Date(d.date);
            let key;
            if (granularity === "Weekly") {
                const ws = new Date(dt); ws.setDate(dt.getDate() - dt.getDay()); key = ws.toISOString().slice(0, 10);
            } else {
                key = d.date.slice(0, 7);
            }
            if (!buckets[key]) buckets[key] = { date: key, _n: 0, ...Object.fromEntries(ALL_METRICS.map(m => [m.key, 0])) };
            buckets[key]._n++;
            ALL_METRICS.forEach(m => { buckets[key][m.key] = (buckets[key][m.key] || 0) + (d[m.key] || 0); });
        });
        return Object.values(buckets).map(b => ({
            ...b, label: fmtDate(b.date),
            ...Object.fromEntries(ALL_METRICS.filter(m => ["tacos", "acos", "roas", "ctr", "cpc"].includes(m.key)).map(m => [m.key, b[m.key] / b._n])),
        }));
    }, [chartData, granularity]);

    const activeMetrics = activeKeys.map(k => {
        const base = ALL_METRICS.find(m => m.key === k);
        return base ? { ...base, type: chartTypes[k] || "line" } : null;
    }).filter(Boolean);

    // Smart axis assignment
    const { axisMap, leftCount, rightCount } = useMemo(() => assignAxes(activeMetrics), [activeMetrics]);

    const sharedChartProps = {
        aggData, activeMetrics, axisMap, leftCount, rightCount,
        showChanges, showDataLabels, isMobile, isDark,
    };

    const headerProps = {
        viewMode, setViewMode, granularity, setGranularity,
        onDownload: () => downloadExcel(aggData, activeMetrics),
        isFullscreen, onToggleFullscreen: () => setIsFullscreen(f => !f),
        isMobile,
    };

    const footerProps = {
        activeMetrics, activeKeys, openDD, setOpenDD,
        toggleMetric, setChartType,
        showDataLabels, setShowDataLabels,
        showChanges, setShowChanges, isFullscreen,
        isMobile,
    };

    if (isChartLoading) return (
        <Card className="dg-root border-none" style={{ minHeight: "360px", position: "relative" }}>
            <div style={{ padding: "16px 22px", borderBottom: "var(--glass-border)", fontWeight: 800, fontSize: 17, color: "var(--text-primary)" }}>Charts</div>
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#1A9FD4]" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Loading chart data...</span>
            </div>
        </Card>
    );

    const innerContent = (fullscreen) => (
        <>
            <ChartHeader {...headerProps} isFullscreen={fullscreen} onToggleFullscreen={() => setIsFullscreen(f => !f)} />
            {viewMode === "table" ? (
                <div style={{
                    flex: fullscreen ? 1 : undefined,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    padding: fullscreen ? "8px 0" : 0
                }}>
                    <TableView
                        data={aggData}
                        activeMetrics={activeMetrics}
                        isFullscreen={fullscreen}
                        isDark={isDark}
                    />
                </div>
            ) : (
                <div style={{ padding: "14px 0 4px", flex: 1, minHeight: 0 }}>
                    {aggData.length === 0 ? (
                        <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: 15, fontWeight: 600 }}>
                            {t("No data available")}
                        </div>
                    ) : (
                        <ChartInner {...sharedChartProps} chartHeight={fullscreen ? Math.max(300, window.innerHeight - 152) : (isMobile ? 240 : 300)} />
                    )}
                </div>
            )}
            <ChartFooter {...footerProps} />
        </>
    );

    return (
        <>
            {/* Normal inline card */}
            <Card className="dg-root border-none" style={{
                overflow: "visible",
                visibility: isFullscreen ? "hidden" : "visible",
            }}>
                {innerContent(false)}
            </Card>

            {/* Fullscreen portal overlay */}
            {isFullscreen && ReactDOM.createPortal(
                <div className="dg-root chart-fullscreen-container" style={{
                    position: "fixed", inset: 0, zIndex: 99999,
                    background: "var(--canvas-bg)",
                    backgroundColor: isDark ? "#0A0E1A" : "#F4F7FA",
                    display: "flex", flexDirection: "column",
                    animation: "fsIn 0.2s ease",
                    overflow: "hidden",
                    width: "100vw",
                    height: "100vh",
                    borderRadius: 0,
                    border: "none",
                }}>
                    {innerContent(true)}
                </div>,
                document.body
            )}
        </>
    );
};

export default DashboardGraph;