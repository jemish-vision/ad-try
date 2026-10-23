// components/InventoryChart.jsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// ── Helpers ───────────────────────────────────────────────────────────────────
const getVal = (chartData, type, key) => {
    const row = chartData?.find(r => r.fulfillmentType === type);
    return row?.[key] ?? 0;
};

const getMetrics = (t) => [
    {
        key: "currentStock",
        label: t("Current Stock"),
        fbaColor: "#1A9FD4",
        fbmColor: "#1a7bd4",
    },
    {
        key: "inboundStock",
        label: t("Inbound Stock"),
        fbaColor: "#0e7d5b",
        fbmColor: "#22c55e",
    },
    {
        key: "avgDaysLeft",
        label: t("Avg Days Left"),
        fbaColor: "#b45309",
        fbmColor: "#f59e0b",
    },
];

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, fbaVal, fbmVal, fbaColor, fbmColor, unit = "", isDark }) {
    return (
        <div style={{
            background: isDark ? "var(--glass-bg)" : "#ffffff",
            borderRadius: 12,
            padding: "14px 18px",
            border: isDark ? "1px solid var(--glass-border-color)" : "1.5px solid #dce8f7",
            boxShadow: isDark ? "none" : "0 4px 15px rgba(2,70,139,0.02)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            flex: 1,
            minWidth: 0,
        }}>
            <span style={{ fontSize: 11, color: isDark ? "var(--text-secondary)" : "#64748b", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
                {label}
            </span>
            <div style={{
                display: "flex",
                flexDirection: (window.innerWidth < 1200 && window.innerWidth > 1024) || window.innerWidth < 480 ? "column" : "row",
                justifyContent: "space-between",
                gap: 10
            }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: fbaColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: isDark ? "var(--text-secondary)" : "#64748b", fontWeight: 600 }}>FBA</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: isDark ? "var(--text-primary)" : "#1e293b", marginLeft: 2 }}>
                        {typeof fbaVal === "number" && !Number.isInteger(fbaVal)
                            ? fbaVal.toFixed(1)
                            : fbaVal?.toLocaleString()}{unit}
                    </span>
                </div>
                <div className="flex items-center" style={{ gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: fbmColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: isDark ? "var(--text-secondary)" : "#64748b", fontWeight: 600 }}>FBM</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: isDark ? "var(--text-primary)" : "#1e293b", marginLeft: 2 }}>
                        {typeof fbmVal === "number" && !Number.isInteger(fbmVal)
                            ? fbmVal.toFixed(1)
                            : fbmVal?.toLocaleString()}{unit}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── Chart canvas ──────────────────────────────────────────────────────────────
function BarChart({ chartData, isDark }) {
    const { t } = useTranslation();
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const fba = chartData?.find(r => r.fulfillmentType === "FBA");
        const fbm = chartData?.find(r => r.fulfillmentType === "FBM");

        const labels = [t("Current Stock"), t("Inbound Stock"), t("Days Left (avg)")];
        const fbaVals = [fba?.currentStock ?? 0, fba?.inboundStock ?? 0, fba?.avgDaysLeft ?? 0];
        const fbmVals = [fbm?.currentStock ?? 0, fbm?.inboundStock ?? 0, fbm?.avgDaysLeft ?? 0];

        if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
        }

        chartRef.current = new Chart(canvasRef.current, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "FBA",
                        data: fbaVals,
                        backgroundColor: isDark ? ["#2374F2", "#34d399", "#fbbf24"] : ["#1A9FD4", "#0e7d5b", "#b45309"],
                        borderRadius: 6,
                        borderSkipped: false,
                        barThickness: 28,
                        borderWidth: { right: 3 },
                        borderColor: "transparent",
                    },
                    {
                        label: "FBM",
                        data: fbmVals,
                        backgroundColor: isDark ? ["#1a7bd4", "#22c55e", "#f59e0b"] : ["#1a7bd4", "#22c55e", "#f59e0b"],
                        borderRadius: 6,
                        borderSkipped: false,
                        barThickness: 28,
                        borderWidth: { left: 3 },
                        borderColor: "transparent",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "top",
                        align: "end",
                        labels: {
                            boxWidth: 10,
                            boxHeight: 10,
                            borderRadius: 5,
                            useBorderRadius: true,
                            font: { size: 12, weight: "600", family: "Inter" },
                            color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b",
                            padding: 16,
                        },
                    },
                    tooltip: {
                        backgroundColor: isDark ? "rgba(15, 23, 42, 0.98)" : "rgba(15, 23, 42, 0.95)",
                        titleColor: isDark ? "rgba(255, 255, 255, 0.92)" : "#f8fafc",
                        bodyColor: isDark ? "rgba(255, 255, 255, 0.7)" : "#e2e8f0",
                        padding: 12,
                        cornerRadius: 10,
                        titleFont: { size: 12, weight: "700", family: "Inter" },
                        bodyFont: { size: 13, family: "Inter" },
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString()}`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            font: { size: 11, weight: "600", family: "Inter" },
                            color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b",
                        },
                    },
                    y: {
                        grid: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#E0F4FD", lineWidth: 1 },
                        border: { display: false, dash: [4, 4] },
                        ticks: {
                            font: { size: 11, family: "Inter" },
                            color: isDark ? "rgba(255, 255, 255, 0.6)" : "#94a3b8",
                            maxTicksLimit: 6,
                            callback: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v,
                        },
                    },
                },
            },
        });

        return () => {
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    }, [chartData, isDark, t]);

    return (
        <div style={{ position: "relative", height: 220 }}>
            <canvas ref={canvasRef} />
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
function InventoryChart({ chartData = [], loading = false }) {
    const { t } = useTranslation();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1200);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
            setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1200);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const isEmpty = !chartData || chartData.length === 0;

    return (
        <div id="inventory-chart" className="glass-card drawer-card-override" style={{
            background: isDark ? "var(--glass-bg)" : "#fff",
            borderRadius: 16,
            border: isDark ? "1px solid var(--glass-border-color)" : "1.5px solid #dce8f7",
            boxShadow: isDark ? "none" : "0 4px 20px rgba(2,70,139,0.05)",
            padding: "20px 24px",
            marginBottom: 20,
            fontFamily: "'Inter', sans-serif"
        }}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
                <div className="flex items-center" style={{ gap: 12 }}>
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: isDark ? "rgba(60, 187, 242, 0.12)" : "#E0F4FD",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        flexShrink: 0,
                    }}>
                        📊
                    </div>
                    <div>
                        <h6 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: isDark ? "var(--text-primary)" : "#1e293b" }}>
                            {t("Inventory Overview")}
                        </h6>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: isDark ? "var(--text-secondary)" : "#94a3b8" }}>
                            {t("FBA vs FBM stock breakdown")}
                        </p>
                    </div>
                </div>
                <div className="flex" style={{ gap: 6 }}>
                    {[
                        { label: "FBA", color: isDark ? "#2374F2" : "#1A9FD4", bg: isDark ? "rgba(60, 187, 242, 0.12)" : "#E0F4FD" },
                        { label: "FBM", color: isDark ? "#a78bfa" : "#7c3aed", bg: isDark ? "rgba(167, 139, 250, 0.12)" : "#f5f3ff" },
                    ].map(b => (
                        <span key={b.label} style={{
                            padding: "4px 12px", borderRadius: 20,
                            fontSize: 11, fontWeight: 700,
                            color: b.color, background: b.bg,
                        }}>{b.label}</span>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col gap-5">
                    {/* Chart area skeleton */}
                    <div className="relative h-[220px] w-full rounded-xl bg-slate-100/50 dark:bg-slate-800/20 p-4 border border-slate-100 dark:border-slate-800/40 flex flex-col justify-between overflow-hidden">
                        {/* Legend top right */}
                        <div className="flex justify-end gap-3 animate-pulse">
                            <div className="h-3 w-12 rounded bg-slate-200/90 dark:bg-slate-700/60" />
                            <div className="h-3 w-12 rounded bg-slate-200/90 dark:bg-slate-700/60" />
                        </div>

                        {/* Bars simulation */}
                        <div className="h-36 w-full flex items-end justify-around px-8 pb-2">
                            {[
                                { h1: "h-24", h2: "h-28" },
                                { h1: "h-16", h2: "h-20" },
                                { h1: "h-28", h2: "h-20" },
                            ].map((pair, idx) => (
                                <div key={idx} className="flex items-end gap-2 animate-pulse">
                                    <div className={`w-7 ${pair.h1} rounded-t-md bg-slate-200/90 dark:bg-slate-700/60`} />
                                    <div className={`w-7 ${pair.h2} rounded-t-md bg-slate-300/80 dark:bg-slate-600/50`} />
                                </div>
                            ))}
                        </div>

                        {/* X-axis labels skeleton */}
                        <div className="flex justify-around px-4 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 animate-pulse">
                            <div className="h-3 w-20 rounded bg-slate-200/90 dark:bg-slate-700/60" />
                            <div className="h-3 w-20 rounded bg-slate-200/90 dark:bg-slate-700/60" />
                            <div className="h-3 w-20 rounded bg-slate-200/90 dark:bg-slate-700/60" />
                        </div>
                    </div>

                    {/* 3 Stat pill skeletons */}
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
                        gap: 14,
                        marginTop: 4,
                    }}>
                        {[1, 2, 3].map((k) => (
                            <div key={k} style={{
                                background: isDark ? "var(--glass-bg)" : "#ffffff",
                                borderRadius: 12,
                                padding: "14px 18px",
                                border: isDark ? "1px solid var(--glass-border-color)" : "1.5px solid #dce8f7",
                                boxShadow: isDark ? "none" : "0 4px 15px rgba(2,70,139,0.02)",
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                            }} className="animate-pulse">
                                <div className="h-3 w-24 rounded bg-slate-200/90 dark:bg-slate-700/60" />
                                <div className="flex justify-between items-center gap-4">
                                    <div className="h-4 w-16 rounded bg-slate-200/90 dark:bg-slate-700/60" />
                                    <div className="h-4 w-16 rounded bg-slate-200/90 dark:bg-slate-700/60" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : isEmpty ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: isDark ? "var(--text-secondary)" : "#94a3b8", fontSize: 13 }}>
                    {t("No chart data available")}
                </div>
            ) : (
                <>
                    {/* Bar chart */}
                    <BarChart chartData={chartData} isDark={isDark} />

                    {/* Stat pills */}
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
                        gap: 14,
                        marginTop: 20
                    }}>
                        {getMetrics(t).map(m => (
                            <StatPill
                                key={m.key}
                                label={m.label}
                                fbaVal={getVal(chartData, "FBA", m.key)}
                                fbmVal={getVal(chartData, "FBM", m.key)}
                                fbaColor={m.fbaColor}
                                fbmColor={m.fbmColor}
                                unit={m.key === "avgDaysLeft" ? ` ${t("days")}` : ""}
                                isDark={isDark}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default InventoryChart;