// components/InventorySummaryCards.jsx
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

function InventorySummaryCards({ summaryData = {}, loading = false }) {
    const { t } = useTranslation();
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const {
        totalSKUs = 0,
        fbaStock = 0,
        fbmStock = 0,
        totalFBASkus = 0,
        totalFBMSkus = 0,
        alertCount = 0,
        outOfStockCount = 0,
        lowStockCount = 0,
        mediumStockCount = 0,
        deadInventoryCount = 0,
    } = summaryData;

    const cards = [
        {
            label: t("Total SKUs"),
            value: totalSKUs,
            sub: t("FBA: {{fba}} · FBM: {{fbm}}", { fba: totalFBASkus, fbm: totalFBMSkus }),
            accent: isDark ? "#2374F2" : "#1A9FD4",
            lightBg: isDark ? "rgba(60, 187, 242, 0.12)" : "#E0F4FD",
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#2374F2" : "#1A9FD4"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                    <line x1="12" y1="12" x2="12" y2="16" />
                    <line x1="10" y1="14" x2="14" y2="14" />
                </svg>
            ),
        },
        {
            label: t("FBA Stock"),
            value: fbaStock.toLocaleString(),
            sub: t("Units in Amazon warehouse"),
            accent: isDark ? "#34d399" : "#0e7d5b",
            lightBg: isDark ? "rgba(52, 211, 153, 0.12)" : "#e6f5f0",
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#34d399" : "#0e7d5b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
            ),
        },
        {
            label: t("FBM Stock"),
            value: fbmStock.toLocaleString(),
            sub: t("Units in your warehouse"),
            accent: isDark ? "#a78bfa" : "#7c3aed",
            lightBg: isDark ? "rgba(167, 139, 250, 0.12)" : "#f5f3ff",
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#a78bfa" : "#7c3aed"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" rx="2" />
                    <path d="M16 8h4l3 3v5h-7V8z" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
            ),
        },
        {
            label: t("Stock Alerts"),
            value: alertCount,
            sub: t("Out of stock: {{outOfStock}} · Low: {{low}}", { outOfStock: outOfStockCount, low: lowStockCount + mediumStockCount }),
            accent: isDark ? "#f87171" : "#dc2626",
            lightBg: isDark ? "rgba(248, 113, 113, 0.12)" : "#fff1f2",
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#f87171" : "#dc2626"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            ),
            highlight: alertCount > 0,
        },
        {
            label: t("Dead Inventory (FBA)"),
            value: deadInventoryCount,
            sub: t("FBA items with no/low sales"),
            accent: isDark ? "#fbbf24" : "#b45309",
            lightBg: isDark ? "rgba(251, 191, 36, 0.12)" : "#fef3c7",
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#fbbf24" : "#b45309"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="5" />
                    <path d="M9 8h.01M15 8h.01" />
                    <path d="M9.5 13.5C9.5 13.5 10 15 12 15s2.5-1.5 2.5-1.5" />
                    <path d="M5.5 17.5c0 0 1-2 2-2h9c1 0 2 2 2 2" />
                    <path d="M10 20h4" />
                    <path d="M12 15v5" />
                </svg>
            ),
            highlight: deadInventoryCount > 0,
        },
    ];

    const cardBg = isDark ? "var(--glass-bg)" : "#fff";
    const borderDefault = isDark ? "var(--glass-border-color)" : "#dce8f7";
    const textPrimary = isDark ? "var(--text-primary)" : "#1e293b";
    const textSecondary = isDark ? "var(--text-secondary)" : "#94a3b8";
    const textLabel = isDark ? "var(--text-secondary)" : "#64748b";

    return (
        <div id="inventory-summary-cards" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 20,
            fontFamily: "'Inter', sans-serif"
        }}>
            {cards.map((card, i) => (
                <div
                    key={i}
                    style={{
                        background: cardBg,
                        border: `1.5px solid ${card.highlight && !loading ? card.accent + "40" : borderDefault}`,
                        borderRadius: 14,
                        padding: "20px 22px",
                        position: "relative",
                        overflow: "hidden",
                        boxShadow: (card.highlight && !loading)
                            ? `0 0 0 1px ${card.accent}20, 0 10px 30px ${card.accent}0a`
                            : isDark ? "none" : "0 4px 20px rgba(2,70,139,0.03)",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        cursor: "default",
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = `0 10px 30px ${card.accent}18`;
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.borderColor = card.accent;
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = (card.highlight && !loading)
                            ? `0 0 0 1px ${card.accent}20, 0 10px 30px ${card.accent}0a`
                            : isDark ? "none" : "0 4px 20px rgba(2,70,139,0.03)";
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.borderColor = (card.highlight && !loading) ? card.accent + "40" : borderDefault;
                    }}
                >
                    {/* Accent left bar */}
                    <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: 4, background: card.accent, borderRadius: "14px 0 0 14px",
                    }} />

                    {/* Icon + label row */}
                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                        <span style={{
                            fontSize: 11, fontWeight: 700, color: textLabel,
                            letterSpacing: 0.6, textTransform: "uppercase",
                        }}>
                            {card.label}
                        </span>
                        <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: card.lightBg,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                        }}>
                            {card.icon}
                        </div>
                    </div>

                    {/* Value */}
                    {loading ? (
                        <div className="h-7 w-20 rounded-md bg-slate-200/90 dark:bg-slate-700/60 animate-pulse mb-2" />
                    ) : (
                        <div style={{
                            fontSize: 28, fontWeight: 800, color: textPrimary,
                            lineHeight: 1.1, marginBottom: 8, letterSpacing: "-0.5px",
                        }}>
                            {card.value}
                        </div>
                    )}

                    {/* Sub label */}
                    {loading ? (
                        <div className="h-3.5 w-32 rounded bg-slate-200/90 dark:bg-slate-700/60 animate-pulse" />
                    ) : (
                        <div style={{ fontSize: 11, color: textSecondary, fontWeight: 500, lineHeight: 1.4 }}>
                            {card.sub}
                        </div>
                    )}

                    {/* Alert pulse dot */}
                    {card.highlight && !loading && (
                        <div style={{
                            position: "absolute", top: 12, right: 12,
                            width: 6, height: 6, borderRadius: "50%",
                            background: card.accent,
                            boxShadow: `0 0 0 3px ${card.accent}30`,
                        }} />
                    )}
                </div>
            ))}
        </div>
    );
}

export default InventorySummaryCards;