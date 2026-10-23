import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FiLink, FiArrowRight, FiShield, FiTrendingUp, FiRefreshCw, FiAlertTriangle } from "react-icons/fi";
import { Button } from "../../components/ui/button";

/**
 * Branded prompt component rendered when a user navigates to an SP-API-dependent
 * view (Orders, Inventory, Reconciliation, etc.) but has not connected their
 * Amazon Selling Partner (SP) API account for the active profile.
 *
 * @param {{
 *   feature?: string,
 *   description?: string,
 *   isDark?: boolean,
 *   className?: string,
 *   style?: React.CSSProperties
 * }} props
 */
const SpAccountNotConnected = ({
    feature = "Selling Partner",
    description,
    isDark: customIsDark,
    className = "",
    style = {},
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [isDark, setIsDark] = useState(() => {
        if (typeof customIsDark === "boolean") return customIsDark;
        return document.documentElement.getAttribute("data-theme") === "dark";
    });

    useEffect(() => {
        if (typeof customIsDark === "boolean") {
            setIsDark(customIsDark);
            return;
        }
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, [customIsDark]);

    const handleConnectClick = () => {
        navigate("/settings?tab=seller-config");
    };

    const defaultDescription = t(
        "To view and sync real-time {{feature}} data from Amazon, please connect your Amazon Selling Partner (SP-API) account for this profile.",
        { feature: t(feature) }
    );

    return (
        <div
            className={`w-full flex items-center justify-center p-6 sm:p-10 select-none animate-in fade-in zoom-in-95 duration-200 ${className}`}
            style={{ minHeight: "480px", ...style }}
        >
            <div
                className="max-w-[620px] w-full rounded-2xl p-8 sm:p-10 text-center relative overflow-hidden transition-all duration-300"
                style={{
                    background: isDark
                        ? "linear-gradient(145deg, rgba(15, 23, 42, 0.75) 0%, rgba(30, 41, 59, 0.5) 100%)"
                        : "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: isDark
                        ? "1px solid rgba(56, 189, 248, 0.2)"
                        : "1px solid rgba(2, 132, 199, 0.15)",
                    boxShadow: isDark
                        ? "0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 30px -10px rgba(14, 165, 233, 0.15)"
                        : "0 20px 40px -15px rgba(14, 165, 233, 0.1), 0 1px 3px 0 rgba(0, 0, 0, 0.05)",
                }}
            >
                {/* Background Ambient Glow */}
                <div
                    style={{
                        position: "absolute",
                        top: "-50px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "260px",
                        height: "120px",
                        background: "radial-gradient(circle, rgba(14, 165, 233, 0.3) 0%, rgba(14, 165, 233, 0) 70%)",
                        pointerEvents: "none",
                        zIndex: 0,
                    }}
                />

                <div className="relative z-10 flex flex-col items-center">
                    {/* Icon Badge */}
                    <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 relative transition-transform duration-300 hover:scale-105"
                        style={{
                            background: isDark
                                ? "linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(2, 132, 199, 0.1) 100%)"
                                : "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
                            border: isDark
                                ? "1px solid rgba(56, 189, 248, 0.35)"
                                : "1px solid rgba(14, 165, 233, 0.3)",
                            boxShadow: isDark
                                ? "0 8px 20px -6px rgba(14, 165, 233, 0.4)"
                                : "0 8px 20px -6px rgba(14, 165, 233, 0.3)",
                        }}
                    >
                        <FiLink size={28} className={isDark ? "text-sky-400" : "text-sky-600"} />
                        <span
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ background: "#f59e0b", border: isDark ? "2px solid #0f172a" : "2px solid #ffffff" }}
                        >
                            <FiAlertTriangle size={9} color="#ffffff" />
                        </span>
                    </div>

                    {/* Badge Pill */}
                    <div
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase mb-3"
                        style={{
                            background: isDark ? "rgba(245, 158, 11, 0.15)" : "#fef3c7",
                            color: isDark ? "#fbbf24" : "#b45309",
                            border: isDark ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid #fde68a",
                        }}
                    >
                        <span>{t("Selling Partner API (SP-API)")}</span>
                    </div>

                    {/* Headline */}
                    <h2
                        className="text-lg sm:text-xl font-bold tracking-tight mb-2"
                        style={{ color: isDark ? "rgba(255, 255, 255, 0.95)" : "#0f172a" }}
                    >
                        {t("Connect Your SP Account")}
                    </h2>

                    {/* Description */}
                    <p
                        className="text-xs sm:text-sm leading-relaxed mb-6 max-w-[480px]"
                        style={{ color: isDark ? "rgba(255, 255, 255, 0.65)" : "#64748b" }}
                    >
                        {description || defaultDescription}
                    </p>

                    {/* Features list */}
                    <div
                        className="w-full text-left rounded-xl p-4 mb-6"
                        style={{
                            background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(2, 70, 139, 0.03)",
                            border: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(2, 70, 139, 0.08)",
                        }}
                    >
                        <p
                            className="text-[11px] font-semibold uppercase tracking-wider mb-2.5"
                            style={{ color: isDark ? "rgba(255, 255, 255, 0.5)" : "#475569" }}
                        >
                            {t("Connecting your SP account enables:")}
                        </p>
                        <ul className="flex flex-col gap-2 text-xs" style={{ color: isDark ? "rgba(255, 255, 255, 0.8)" : "#334155" }}>
                            <li className="flex items-center gap-2">
                                <FiRefreshCw size={13} className={isDark ? "text-sky-400" : "text-sky-600"} />
                                <span>{t("Automated live synchronization of orders, shipments, and inventory")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FiTrendingUp size={13} className={isDark ? "text-sky-400" : "text-sky-600"} />
                                <span>{t("Accurate profit calculations, returns tracking, and fees breakdown")}</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <FiShield size={13} className={isDark ? "text-sky-400" : "text-sky-600"} />
                                <span>{t("Reconciliation reports, missing unit claims, and reimbursement recovery")}</span>
                            </li>
                        </ul>
                    </div>

                    {/* CTA Button */}
                    <Button
                        onClick={handleConnectClick}
                        className="flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl text-white transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                        style={{
                            background: "linear-gradient(135deg, #1A9FD4 0%, #0284c7 100%)",
                            boxShadow: "0 8px 20px -4px rgba(26, 159, 212, 0.45)",
                            minWidth: "220px",
                            height: "44px",
                        }}
                    >
                        <span>{t("Connect SP Account")}</span>
                        <FiArrowRight size={16} />
                    </Button>

                    <p
                        className="text-[11px] mt-3.5 m-0"
                        style={{ color: isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8" }}
                    >
                        {t("You will be redirected to Settings > Seller Config to link your Amazon credentials.")}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SpAccountNotConnected;
