import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Receipt, Wallet } from "lucide-react";
import Reconciliation from "./reconciliation/Reconciliation";
import Reimbursement from "./reimbursement/Reimbursement";
import { Button } from "../../../components/ui/button";

function ReconciliationReimbursement() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState(0);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const TABS = [
        {
            label: "Reconciliation",
            icon: <Receipt className="h-4 w-4" />,
            description:
                "Track shipment mismatches, missing units, damaged inventory and Amazon reconciliation reports.",
            component: <Reconciliation isDark={isDark} />,
        },
        {
            label: "Reimbursement",
            icon: <Wallet className="h-4 w-4" />,
            description:
                "Monitor reimbursement claims, recovered amounts and pending recovery opportunities.",
            component: <Reimbursement isDark={isDark} />,
        },
    ];

    return (
        <div className="w-full bg-transparent rounded-lg">
            {/* Folder-style Tab Selector */}
            <div
                className="flex justify-start overflow-x-auto no-scrollbar"
                style={{
                    gap: "6px",
                    marginBottom: "-1px",
                    position: "relative",
                    zIndex: 2,
                    background: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.7)",
                    backdropFilter: "blur(20px) saturate(120%)",
                    WebkitBackdropFilter: "blur(20px) saturate(120%)",
                    borderRadius: "16px 16px 0 0",
                    borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(2, 70, 139, 0.08)",
                    padding: "16px 24px 0 24px",
                }}
            >
                {TABS.map((tab, index) => {
                    const isActive = activeTab === index;
                    const isHovered = hoveredIndex === index;

                    return (
                        <Button
                            variant="ghost"
                            id={`recon-tab-${index}`}
                            key={index}
                            className="flex-shrink-0"
                            onClick={() => setActiveTab(index)}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            style={{
                                position: "relative",
                                padding: "10px 42px 10px 22px", /* Left/right padding matches the slant offset */
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                outline: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease",
                                minHeight: "42px"
                            }}
                        >
                            {/* 
                                SVG Background Tab (Hardware-accelerated, perfectly anti-aliased curved vector).
                                Uses vectorEffect="non-scaling-stroke" to maintain 1.5px border regardless of stretching.
                            */}
                            <svg
                                viewBox="0 0 180 40"
                                preserveAspectRatio="none"
                                style={{
                                    position: "absolute",
                                    top: "1px",
                                    left: "1px",
                                    width: "calc(100% - 2px)",
                                    height: "calc(100% - 1px)",
                                    zIndex: 0,
                                    pointerEvents: "none",
                                    overflow: "visible"
                                }}
                            >
                                <defs>
                                    <linearGradient id={`tabGrad-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#1A9FD4" />
                                        <stop offset="100%" stopColor="#2374F2" />
                                    </linearGradient>
                                </defs>
                                <path
                                    /* Path: start bottom-left, vertical line up, rounded corner, top flat line, smooth curve to straight diagonal slant to bottom-right, close */
                                    d="M 0,40 L 0,8 A 8,8 0 0 1 8,0 L 145,0 Q 153,0 160,10 L 180,40 Z"
                                    fill={isActive ? `url(#tabGrad-${index})` : isHovered ? (isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0") : (isDark ? "rgba(255,255,255,0.03)" : "#eaeef5")}
                                    stroke={isActive ? "#1A9FD4" : (isDark ? "rgba(255,255,255,0.08)" : "rgba(2, 70, 139, 0.15)")}
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </svg>

                            {/* Inner Content Layer (Text and Icon) */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    color: isActive ? "#ffffff" : isHovered ? "#1A9FD4" : (isDark ? "rgba(255,255,255,0.6)" : "#475569"),
                                    position: "relative",
                                    zIndex: 1,
                                    fontFamily: "'Inter', sans-serif",
                                    fontWeight: "600",
                                    fontSize: "14px",
                                    transition: "color 0.2s ease"
                                }}
                            >
                                <span style={{ display: "inline-flex" }}>
                                    {tab.icon}
                                </span>
                                <span>{t(tab.label)}</span>
                            </div>
                        </Button>
                    );
                })}
            </div>

            {/* Description */}
            <div
                className={`px-6 py-4 backdrop-blur-md ${
                    isDark ? "bg-white/5 border-b border-white/10" : "bg-white/35 border-b border-sky-950/10"
                }`}
            >
                <p
                    className={`font-sans font-medium text-sm ${
                        isDark ? "text-white/60" : "text-slate-500"
                    }`}
                >
                    {t(TABS[activeTab].description)}
                </p>
            </div>

            {/* Content */}
            <div className="mt-2">
                {TABS[activeTab].component}
            </div>
        </div>
    );
}

export default ReconciliationReimbursement;