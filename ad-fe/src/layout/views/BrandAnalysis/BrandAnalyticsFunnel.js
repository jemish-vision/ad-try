import React, { useState } from "react";
import { useTranslation } from "react-i18next";

const formatNumber = (num = 0) => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return Number(num).toLocaleString();
};

const formatExact = (num = 0) => Number(num).toLocaleString();
const p = (n) => Number(n).toFixed(2);

function BrandAnalyticsFunnel({ funnelData, isDark, loading = false }) {
    const { t } = useTranslation();
    const [displayExact, setDisplayExact] = useState({});

    const font = "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

    if (loading || !funnelData) {
        const bgFill = isDark ? "rgba(51, 65, 85, 0.45)" : "rgba(226, 232, 240, 0.85)";
        const bgFillDarker = isDark ? "rgba(30, 41, 59, 0.7)" : "rgba(241, 245, 249, 0.95)";
        const strokeColor = isDark ? "rgba(71, 85, 105, 0.4)" : "rgba(203, 213, 225, 0.6)";

        return (
            <div className="relative w-full flex items-center justify-center select-none py-2 min-h-[420px]">
                {/* Localized centered loading spinner card */}
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                    <div className="flex flex-col items-center gap-2.5 p-4 px-6 bg-white/95 dark:bg-slate-800/95 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 backdrop-blur-sm">
                        <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[#1A9FD4]" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Loading funnel analysis...</span>
                    </div>
                </div>

                <svg
                    viewBox="0 0 940 680"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ width: "100%", maxWidth: 940, display: "block", margin: "0 auto", overflow: "visible" }}
                    className="animate-pulse opacity-40 dark:opacity-25"
                    role="img"
                    aria-label="Loading funnel analysis"
                >
                    {/* Column Headers Skeleton */}
                    <rect x="252" y="10" width="112" height="26" rx="6" fill={bgFill} stroke={strokeColor} />
                    <rect x="576" y="10" width="96" height="26" rx="6" fill={bgFill} stroke={strokeColor} />
                    <line x1="470" y1="10" x2="470" y2="36" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3,3" />

                    {/* Impressions Stage */}
                    <polygon points="200,40 740,40 700,165 240,165" fill={bgFill} />
                    <polygon points="470,40 740,40 700,165 470,165" fill={bgFillDarker} />
                    <rect x="350" y="170" width="210" height="26" rx="13" fill={bgFill} stroke={strokeColor} />

                    {/* Clicks Stage */}
                    <polygon points="248,200 692,200 660,325 280,325" fill={bgFill} />
                    <polygon points="470,200 692,200 660,325 470,325" fill={bgFillDarker} />
                    <rect x="350" y="330" width="210" height="26" rx="13" fill={bgFill} stroke={strokeColor} />

                    {/* Cart Adds Stage */}
                    <polygon points="290,360 650,360 618,485 322,485" fill={bgFill} />
                    <polygon points="470,360 650,360 618,485 470,485" fill={bgFillDarker} />
                    <rect x="350" y="490" width="210" height="26" rx="13" fill={bgFill} stroke={strokeColor} />

                    {/* Purchases Stage */}
                    <polygon points="330,520 610,520 578,645 362,645" fill={bgFill} />
                    <polygon points="470,520 610,520 578,645 470,645" fill={bgFillDarker} />

                    {/* Left labels skeleton */}
                    <rect x="90" y="75" width="95" height="14" rx="4" fill={bgFill} />
                    <rect x="120" y="94" width="65" height="10" rx="3" fill={bgFill} />

                    <rect x="150" y="242" width="80" height="14" rx="4" fill={bgFill} />
                    <rect x="140" y="261" width="90" height="10" rx="3" fill={bgFill} />

                    <rect x="180" y="402" width="90" height="14" rx="4" fill={bgFill} />
                    <rect x="170" y="421" width="100" height="10" rx="3" fill={bgFill} />

                    <rect x="220" y="564" width="90" height="14" rx="4" fill={bgFill} />
                    <rect x="230" y="583" width="80" height="10" rx="3" fill={bgFill} />

                    {/* Right badges skeleton */}
                    <rect x="718" y="70" width="86" height="38" rx="8" fill={bgFill} stroke={strokeColor} />
                    <rect x="674" y="234" width="88" height="50" rx="8" fill={bgFill} stroke={strokeColor} />
                    <rect x="632" y="396" width="88" height="50" rx="8" fill={bgFill} stroke={strokeColor} />
                    <rect x="592" y="557" width="88" height="50" rx="8" fill={bgFill} stroke={strokeColor} />
                </svg>
            </div>
        );
    }

    const total = funnelData?.total || {};
    const brand = funnelData?.brandSpecific || {};

    const imp_t = total.impressions ?? 0;
    const imp_b = brand.impressions ?? 0;
    const clk_t = total.clicks ?? 0;
    const clk_b = brand.clicks ?? 0;
    const cart_t = total.cartAdds ?? 0;
    const cart_b = brand.cartAdds ?? 0;
    const pur_t = total.purchases ?? 0;
    const pur_b = brand.purchases ?? 0;

    const clk_share = brand.asinClickShare ?? (clk_t > 0 ? ((clk_b / clk_t) * 100) : 0);
    const cart_share = brand.asinCartAddShare ?? (cart_t > 0 ? ((cart_b / cart_t) * 100) : 0);
    const pur_share = brand.asinPurchaseShare ?? (pur_t > 0 ? ((pur_b / pur_t) * 100) : 0);

    const ctr_market = total.totalClickRate ?? (imp_t > 0 ? ((clk_t / imp_t) * 100) : 0);
    const ctr_brand = brand.asinClickRate ?? (imp_b > 0 ? ((clk_b / imp_b) * 100) : 0);
    const cart_market = total.totalCartAddRate ?? (clk_t > 0 ? ((cart_t / clk_t) * 100) : 0);
    const cart_brand_r = brand.asinCartAddRate ?? (clk_b > 0 ? ((cart_b / clk_b) * 100) : 0);
    const pur_market = total.totalPurchaseRate ?? (cart_t > 0 ? ((pur_t / cart_t) * 100) : 0);
    const pur_brand_r = brand.asinPurchaseRate ?? (cart_b > 0 ? ((cart_b / cart_b) * 100) : 0);

    const f = (num, key) => {
        if (displayExact[key]) return formatExact(num);
        return formatNumber(num);
    };

    const handleClick = (key) => {
        setDisplayExact(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <svg
            viewBox="0 0 940 680"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: "100%", maxWidth: 940, display: "block", margin: "0 auto", cursor: "pointer", overflow: "visible" }}
            role="img"
            aria-label={t("Brand analytics funnel")}
        >
            <defs>
                {/* Gradient fills per stage */}
                <linearGradient id="grad-imp-total" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1a56db" />
                    <stop offset="100%" stopColor="#1A9FD4" />
                </linearGradient>
                <linearGradient id="grad-imp-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2374F2" />
                    <stop offset="100%" stopColor="#1a56db" />
                </linearGradient>
                <linearGradient id="grad-clk-total" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0f766e" />
                    <stop offset="100%" stopColor="#0d9488" />
                </linearGradient>
                <linearGradient id="grad-clk-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#14b8a6" />
                    <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
                <linearGradient id="grad-cart-total" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#c2410c" />
                    <stop offset="100%" stopColor="#ea580c" />
                </linearGradient>
                <linearGradient id="grad-cart-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#c2410c" />
                </linearGradient>
                <linearGradient id="grad-pur-total" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#15803d" />
                    <stop offset="100%" stopColor="#16a34a" />
                </linearGradient>
                <linearGradient id="grad-pur-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#15803d" />
                </linearGradient>

                {/* Drop shadow */}
                <filter id="shadow" x="-5%" y="-5%" width="115%" height="125%">
                    <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.18)" />
                </filter>
                <filter id="shadow-sm" x="-10%" y="-10%" width="130%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.10)" />
                </filter>
            </defs>

            <title>{t("Brand analytics funnel")}</title>

            {/* ──────────────── COLUMN HEADERS (above funnel, clearly visible) ──────────────── */}
            {/* Total Market header - left side */}
            <rect x="252" y="10" width="112" height="26" rx="6" fill={isDark ? "#1e293b" : "#EFF6FF"} stroke="#2374F2" strokeWidth="1.5" />
            <text x="308" y="28" textAnchor="middle" fill={isDark ? "#60a5fa" : "#1a56db"} fontSize="12" fontWeight="700" fontFamily={font}>
                {t("Total Market")}
            </text>

            {/* Your Brand header - right side */}
            <rect x="576" y="10" width="96" height="26" rx="6" fill={isDark ? "#1e3a8a" : "#DBEAFE"} stroke="#1a56db" strokeWidth="1.5" />
            <text x="624" y="28" textAnchor="middle" fill={isDark ? "#93c5fd" : "#1A9FD4"} fontSize="12" fontWeight="700" fontFamily={font}>
                {t("Your Brand")}
            </text>

            {/* Divider line between the two header badges */}
            <line x1="470" y1="10" x2="470" y2="36" stroke={isDark ? "#475569" : "#CBD5E1"} strokeWidth="1.5" strokeDasharray="3,3" />

            {/* ──────────────── IMPRESSIONS ──────────────── */}
            <g filter="url(#shadow)">
                <polygon points="200,40 740,40 700,165 240,165" fill="url(#grad-imp-total)" />
                <polygon points="470,40 740,40 700,165 470,165" fill="url(#grad-imp-brand)" />
                <line x1="470" y1="40" x2="470" y2="165" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeDasharray="6,4" />
                <line x1="242" y1="165" x2="698" y2="165" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
            </g>

            {/* CTR conversion pill */}
            <g filter="url(#shadow-sm)">
                <rect x="350" y="170" width="210" height="26" rx="13" fill={isDark ? "#172554" : "#EFF6FF"} stroke="#2374F2" strokeWidth="1.5" />
                <text x="413" y="188" textAnchor="middle" fill={isDark ? "#60a5fa" : "#1a56db"} fontSize="11" fontWeight="700" fontFamily={font}>{p(ctr_market)}%</text>
                <text x="454" y="188" textAnchor="middle" fill={isDark ? "#94a3b8" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("CTR")}</text>
                <text x="496" y="188" textAnchor="middle" fill="#2374F2" fontSize="11" fontWeight="700" fontFamily={font}>{p(ctr_brand)}%</text>
            </g>

            {/* ──────────────── CLICKS ──────────────── */}
            <g filter="url(#shadow)">
                <polygon points="248,200 692,200 660,325 280,325" fill="url(#grad-clk-total)" />
                <polygon points="470,200 692,200 660,325 470,325" fill="url(#grad-clk-brand)" />
                <line x1="470" y1="200" x2="470" y2="325" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeDasharray="6,4" />
                <line x1="282" y1="325" x2="658" y2="325" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
            </g>

            {/* Cart Rate conversion pill */}
            <g filter="url(#shadow-sm)">
                <rect x="350" y="330" width="210" height="26" rx="13" fill={isDark ? "#431407" : "#FFF7ED"} stroke="#f97316" strokeWidth="1.5" />
                <text x="413" y="348" textAnchor="middle" fill={isDark ? "#f97316" : "#c2410c"} fontSize="11" fontWeight="700" fontFamily={font}>{p(cart_market)}%</text>
                <text x="454" y="348" textAnchor="middle" fill={isDark ? "#94a3b8" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("Cart")}</text>
                <text x="496" y="348" textAnchor="middle" fill="#f97316" fontSize="11" fontWeight="700" fontFamily={font}>{p(cart_brand_r)}%</text>
            </g>

            {/* ──────────────── CART ADDS ──────────────── */}
            <g filter="url(#shadow)">
                <polygon points="290,360 650,360 618,485 322,485" fill="url(#grad-cart-total)" />
                <polygon points="470,360 650,360 618,485 470,485" fill="url(#grad-cart-brand)" />
                <line x1="470" y1="360" x2="470" y2="485" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeDasharray="6,4" />
                <line x1="324" y1="485" x2="616" y2="485" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
            </g>

            {/* Purchase Rate conversion pill */}
            <g filter="url(#shadow-sm)">
                <rect x="350" y="490" width="210" height="26" rx="13" fill={isDark ? "#052e16" : "#F0FDF4"} stroke="#22c55e" strokeWidth="1.5" />
                <text x="413" y="508" textAnchor="middle" fill={isDark ? "#4ade80" : "#15803d"} fontSize="11" fontWeight="700" fontFamily={font}>{p(pur_market)}%</text>
                <text x="454" y="508" textAnchor="middle" fill={isDark ? "#94a3b8" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("Purch.")}</text>
                <text x="496" y="508" textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="700" fontFamily={font}>{p(pur_brand_r)}%</text>
            </g>

            {/* ──────────────── PURCHASES ──────────────── */}
            <g filter="url(#shadow)">
                <polygon points="330,520 610,520 578,645 362,645" fill="url(#grad-pur-total)" />
                <polygon points="470,520 610,520 578,645 470,645" fill="url(#grad-pur-brand)" />
                <line x1="470" y1="520" x2="470" y2="645" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeDasharray="6,4" />
            </g>

            {/* Outer stroke border */}
            <polygon points="200,40 740,40 578,645 362,645" fill="none" stroke={isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.07)"} strokeWidth="1.5" />

            {/* ──────────────── VALUES — Clickable ──────────────── */}
            {/* Impressions */}
            <text x="340" y="90" textAnchor="middle" fill="white" fontSize="25" fontWeight="700" fontFamily={font}
                onClick={() => handleClick('imp_t')} style={{ cursor: 'pointer' }}>
                {f(imp_t, 'imp_t')}
            </text>
            <text x="340" y="112" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontFamily={font}>{t("total")}</text>
            <text x="600" y="90" textAnchor="middle" fill="white" fontSize="25" fontWeight="700" fontFamily={font}
                onClick={() => handleClick('imp_b')} style={{ cursor: 'pointer' }}>
                {f(imp_b, 'imp_b')}
            </text>
            <text x="600" y="112" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontFamily={font}>{t("brand")}</text>

            {/* Clicks */}
            <text x="363" y="254" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily={font}
                onClick={() => handleClick('clk_t')} style={{ cursor: 'pointer' }}>
                {f(clk_t, 'clk_t')}
            </text>
            <text x="363" y="274" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontFamily={font}>{t("total")}</text>
            <text x="578" y="254" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily={font}
                onClick={() => handleClick('clk_b')} style={{ cursor: 'pointer' }}>
                {f(clk_b, 'clk_b')}
            </text>
            <text x="578" y="274" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontFamily={font}>{t("brand")}</text>

            {/* Cart Adds */}
            <text x="382" y="415" textAnchor="middle" fill="white" fontSize="20" fontWeight="700" fontFamily={font}
                onClick={() => handleClick('cart_t')} style={{ cursor: 'pointer' }}>
                {f(cart_t, 'cart_t')}
            </text>
            <text x="382" y="435" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontFamily={font}>{t("total")}</text>
            <text x="558" y="415" textAnchor="middle" fill="white" fontSize="20" fontWeight="700" fontFamily={font}
                onClick={() => handleClick('cart_b')} style={{ cursor: 'pointer' }}>
                {f(cart_b, 'cart_b')}
            </text>
            <text x="558" y="435" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontFamily={font}>{t("brand")}</text>

            {/* Purchases */}
            <text x="416" y="577" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily={font}
                onClick={() => handleClick('pur_t')} style={{ cursor: 'pointer' }}>
                {f(pur_t, 'pur_t')}
            </text>
            <text x="416" y="597" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontFamily={font}>{t("total")}</text>
            <text x="536" y="577" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily={font}
                onClick={() => handleClick('pur_b')} style={{ cursor: 'pointer' }}>
                {f(pur_b, 'pur_b')}
            </text>
            <text x="536" y="597" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontFamily={font}>{t("brand")}</text>

            {/* ──────────────── LEFT LABELS ──────────────── */}
            <text x="188" y="80" textAnchor="end" fill={isDark ? "#f8fafc" : "#1E293B"} fontSize="13" fontWeight="700" fontFamily={font}>{t("Impressions")}</text>
            <text x="188" y="97" textAnchor="end" fill={isDark ? "#94a3b8" : "#94A3B8"} fontSize="10" fontFamily={font}>{formatExact(imp_t)}</text>

            <text x="236" y="246" textAnchor="end" fill={isDark ? "#f8fafc" : "#1E293B"} fontSize="13" fontWeight="700" fontFamily={font}>{t("Clicks")}</text>
            <text x="236" y="263" textAnchor="end" fill={isDark ? "#94a3b8" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("CTR")} {p(ctr_market)}%</text>

            <text x="278" y="406" textAnchor="end" fill={isDark ? "#f8fafc" : "#1E293B"} fontSize="13" fontWeight="700" fontFamily={font}>{t("Cart Adds")}</text>
            <text x="278" y="423" textAnchor="end" fill={isDark ? "#94a3b8" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("Cart rate")} {p(cart_market)}%</text>

            <text x="318" y="568" textAnchor="end" fill={isDark ? "#f8fafc" : "#1E293B"} fontSize="13" fontWeight="700" fontFamily={font}>{t("Purchases")}</text>
            <text x="318" y="585" textAnchor="end" fill={isDark ? "#94a3b8" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("Rate")} {p(pur_market)}%</text>

            {/* ──────────────── RIGHT LABELS — badges ──────────────── */}
            {/* Impressions share badge */}
            <rect x="718" y="70" width="86" height="38" rx="8" fill={isDark ? "#172554" : "#EFF6FF"} stroke="#2374F2" strokeWidth="1.5" />
            <text x="761" y="84" textAnchor="middle" fill={isDark ? "#94a3b8" : "#64748B"} fontSize="10" fontFamily={font}>{t("Market share")}</text>
            <text x="761" y="101" textAnchor="middle" fill={isDark ? "#60a5fa" : "#1a56db"} fontSize="14" fontWeight="700" fontFamily={font}>100%</text>

            {/* Clicks share badge */}
            <rect x="674" y="234" width="88" height="50" rx="8" fill={isDark ? "#022c22" : "#ECFDF5"} stroke="#14b8a6" strokeWidth="1.5" />
            <text x="718" y="248" textAnchor="middle" fill={isDark ? "#94a3b8" : "#64748B"} fontSize="10" fontFamily={font}>{t("Click share")}</text>
            <text x="718" y="265" textAnchor="middle" fill={isDark ? "#2dd4bf" : "#0f766e"} fontSize="14" fontWeight="700" fontFamily={font}>{p(clk_share)}%</text>
            <text x="718" y="279" textAnchor="middle" fill={isDark ? "#64748b" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("CTR")} {p(ctr_brand)}%</text>

            {/* Cart share badge */}
            <rect x="632" y="396" width="88" height="50" rx="8" fill={isDark ? "#431407" : "#FFF7ED"} stroke="#f97316" strokeWidth="1.5" />
            <text x="676" y="410" textAnchor="middle" fill={isDark ? "#94a3b8" : "#64748B"} fontSize="10" fontFamily={font}>{t("Cart share")}</text>
            <text x="676" y="427" textAnchor="middle" fill={isDark ? "#f97316" : "#c2410c"} fontSize="14" fontWeight="700" fontFamily={font}>{p(cart_share)}%</text>
            <text x="676" y="441" textAnchor="middle" fill={isDark ? "#64748b" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("Rate")} {p(cart_brand_r)}%</text>

            {/* Purchases share badge */}
            <rect x="592" y="557" width="88" height="50" rx="8" fill={isDark ? "#052e16" : "#F0FDF4"} stroke="#22c55e" strokeWidth="1.5" />
            <text x="636" y="571" textAnchor="middle" fill={isDark ? "#94a3b8" : "#64748B"} fontSize="10" fontFamily={font}>{t("Purch. share")}</text>
            <text x="636" y="588" textAnchor="middle" fill={isDark ? "#4ade80" : "#15803d"} fontSize="14" fontWeight="700" fontFamily={font}>{p(pur_share)}%</text>
            <text x="636" y="602" textAnchor="middle" fill={isDark ? "#64748b" : "#94A3B8"} fontSize="10" fontFamily={font}>{t("Rate")} {p(pur_brand_r)}%</text>

            {/* ──────────────── BOTTOM HINT ──────────────── */}
            <text x="470" y="668" textAnchor="middle" fill={isDark ? "#475569" : "#CBD5E1"} fontSize="10" fontFamily={font}>
                {t("Click values to toggle exact numbers")}
            </text>
        </svg>
    );
}

export default BrandAnalyticsFunnel;