import React, { useState } from 'react';
import { useTranslation } from "react-i18next";
import { Package as Inventory2Outlined, AlertCircle as ErrorOutline, CalendarDays as EventNoteOutlined, CheckCircle as CheckCircleOutline, MinusCircle as RemoveCircleOutline, Filter as FilterAltOutlined } from "lucide-react";

const FbaPlanningCards = ({ data, loading, selectedStatus, onStatusChange, isDark }) => {
    const { t } = useTranslation();
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const cards = [
        {
            title: t("Total SKUs"),
            value: data?.totalSKUs || 0,
            icon: <Inventory2Outlined style={{ fontSize: 18 }} />,
            accent: "#1A9FD4",
            id: null,
            sub: t("Total Catalog in FBA"),
            tagText: t("All Items"),
            tagBg: isDark ? "rgba(60, 187, 242, 0.15)" : "rgba(2, 70, 139, 0.08)",
            tagColor: isDark ? "#2374F2" : "#1A9FD4"
        },
        {
            title: t("Urgent"),
            value: data?.urgentCount || 0,
            icon: <ErrorOutline style={{ fontSize: 18 }} />,
            accent: "#ef4444",
            id: "URGENT",
            sub: t("Needs Immediate Attention"),
            tagText: t("Critical Action"),
            tagBg: isDark ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.08)",
            tagColor: isDark ? "#f87171" : "#ef4444"
        },
        {
            title: t("Plan"),
            value: data?.planCount || 0,
            icon: <EventNoteOutlined style={{ fontSize: 18 }} />,
            accent: "#f59e0b",
            id: "PLAN_SHIPMENT",
            sub: t("Shipments to Prepare Now"),
            tagText: t("Restock Alert"),
            tagBg: isDark ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.08)",
            tagColor: isDark ? "#fbbf24" : "#d97706"
        },
        {
            title: t("Healthy"),
            value: data?.healthyCount || 0,
            icon: <CheckCircleOutline style={{ fontSize: 18 }} />,
            accent: "#10b981",
            id: "HEALTHY",
            sub: t("Stock in Optimal Ranges"),
            tagText: t("Optimal Level"),
            tagBg: isDark ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.08)",
            tagColor: isDark ? "#34d399" : "#16a34a"
        },
        {
            title: t("Overstock"),
            value: data?.overstockCount || 0,
            icon: <RemoveCircleOutline style={{ fontSize: 18 }} />,
            accent: "#8b5cf6",
            id: "OVERSTOCK",
            sub: t("Reduction Recommended"),
            tagText: t("Storage Fee Risk"),
            tagBg: isDark ? "rgba(139, 92, 246, 0.15)" : "rgba(139, 92, 246, 0.08)",
            tagColor: isDark ? "#a78bfa" : "#7c3aed"
        }
    ];

    return (
        <div style={{ marginBottom: "20px", fontFamily: "'Inter', sans-serif" }}>
            {/* Filter Instruction Cue */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11.5px",
                color: isDark ? "var(--text-secondary)" : "#475569",
                fontWeight: 600,
                marginBottom: "12px",
                marginLeft: "4px"
            }}>
                <FilterAltOutlined style={{ fontSize: 14, color: "#1A9FD4" }} />
                <span>{t("Click any card below to filter the inventory details grid by status.")}</span>
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "18px",
                padding: "2px"
            }}>
                {cards.map((card, index) => {
                    const isActive = selectedStatus === card.id;
                    const isHovered = hoveredIndex === index;
                    return (
                        <div
                            key={index}
                            onClick={() => onStatusChange && onStatusChange(card.id)}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            style={{
                                background: isDark ? "var(--glass-bg)" : "rgba(255, 255, 255, 0.65)",
                                backdropFilter: "blur(20px) saturate(130%)",
                                WebkitBackdropFilter: "blur(20px) saturate(130%)",
                                border: isActive ? `2px solid ${card.accent}` : (isDark ? "1px solid var(--glass-border-color)" : "1px solid rgba(2, 70, 139, 0.12)"),
                                borderRadius: "16px",
                                padding: "18px 20px",
                                cursor: "pointer",
                                position: "relative",
                                overflow: "hidden",
                                display: "flex",
                                flexDirection: "column",
                                minHeight: "135px",
                                justifyContent: "space-between",
                                transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
                                transform: isHovered ? "translateY(-4px)" : "translateY(0)",
                                boxShadow: isActive
                                    ? `0 12px 24px ${card.accent}12, 0 4px 8px ${card.accent}08, inset 0 1px 0 rgba(255,255,255,0.7)`
                                    : isHovered
                                        ? `0 14px 28px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)`
                                        : "0 4px 12px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
                                userSelect: "none"
                            }}
                            title={isActive ? t("Click to remove filter") : `${t("Filter grid by")} ${card.title}`}
                        >
                            {/* Ambient background glow on active/hover */}
                            <div
                                style={{
                                    position: "absolute",
                                    bottom: "-35px",
                                    right: "-35px",
                                    width: "110px",
                                    height: "110px",
                                    borderRadius: "50%",
                                    background: `radial-gradient(circle, ${card.accent}22 0%, transparent 70%)`,
                                    filter: "blur(15px)",
                                    transition: "all 0.4s ease",
                                    opacity: (isActive || isHovered) ? "1" : "0",
                                    transform: isHovered ? "scale(1.5)" : "scale(1)",
                                    pointerEvents: "none",
                                    zIndex: 0
                                }}
                            />

                            {/* Top row: Title and Icon */}
                            <div className="flex items-center justify-between" style={{ zIndex: 1 }}>
                                <span style={{
                                    fontSize: "10.5px",
                                    fontWeight: "700",
                                    color: isDark ? "var(--text-secondary)" : "#64748b",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em"
                                }}>
                                    {card.title}
                                </span>
                                <div className="flex items-center gap-2" >
                                    {isActive && (
                                        <span style={{
                                            backgroundColor: card.accent,
                                            color: "#fff",
                                            borderRadius: "50%",
                                            width: "16px",
                                            height: "16px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "9px",
                                            fontWeight: "bold",
                                            boxShadow: `0 0 6px ${card.accent}60`
                                        }}>
                                            ✓
                                        </span>
                                    )}
                                    <span style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "28px",
                                        height: "28px",
                                        borderRadius: "8px",
                                        background: isActive ? `${card.accent}20` : `${card.accent}0d`,
                                        color: card.accent,
                                        transition: "all 0.3s ease"
                                    }}>
                                        {card.icon}
                                    </span>
                                </div>
                            </div>

                            {/* Middle row: Large Value & Status Spark Tag */}
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                                zIndex: 1,
                                marginTop: "12px",
                                marginBottom: "4px"
                            }}>
                                <span style={{
                                    fontSize: "30px",
                                    fontWeight: "850",
                                    color: isDark ? "var(--text-primary)" : "#0f172a",
                                    letterSpacing: "-0.03em",
                                    lineHeight: "1"
                                }}>
                                    {loading ? "..." : card.value.toLocaleString()}
                                </span>

                                <span style={{
                                    fontSize: "9px",
                                    fontWeight: "700",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    backgroundColor: card.tagBg,
                                    color: card.tagColor,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.02em"
                                }}>
                                    {card.tagText}
                                </span>
                            </div>

                            {/* Bottom row: Subtext description and Filter Cue */}
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                zIndex: 1,
                                marginTop: "8px"
                            }}>
                                <span style={{
                                    fontSize: "11px",
                                    fontWeight: "500",
                                    color: isDark ? "var(--text-secondary)" : "#94a3b8"
                                }}>
                                    {card.sub}
                                </span>
                                {(isActive || isHovered) && (
                                    <span style={{
                                        fontSize: "9px",
                                        fontWeight: "800",
                                        color: card.accent,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        animation: "fadeIn 0.2s ease-in-out"
                                    }}>
                                        {isActive ? t("Active Filter") : t("Filter Grid →")}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FbaPlanningCards;
