import React, { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { ApiProductListing } from "../../../../api-wrapper/product/ApiProduct";
import moment from "moment";

// ─── Helpers ────────────────────────────────────────────────────────────────

const truncate = (str, max = 12) =>
    str && str.length > max ? str.slice(0, max) + "…" : str || "";

const formatNumber = (v) =>
    v >= 1_000_000
        ? (v / 1_000_000).toFixed(1) + "M"
        : v >= 1_000
            ? (v / 1_000).toFixed(1) + "K"
            : Number(v ?? 0) % 1 !== 0
                ? Number(v).toFixed(2)
                : String(v ?? 0);

const calcCVR = (orders, clicks) =>
    clicks > 0 ? parseFloat(((orders / clicks) * 100).toFixed(2)) : 0;

// currency symbol map — fallback to the code itself if not found
const getCurrencySymbol = (code) => {
    try {
        const parts = new Intl.NumberFormat("en", {
            style: "currency",
            currency: code || "INR",
            maximumFractionDigits: 0,
        }).formatToParts(0);
        return parts.find((p) => p.type === "currency")?.value ?? code ?? "$";
    } catch {
        return code ?? "$";
    }
};

// ─── Theme ───────────────────────────────────────────────────────────────────

const THEME = {
    primary: "#1A9FD4",
    primaryLight: "#1a5fa8",
    primaryLighter: "#E0F4FD",
    primaryBorder: "#c5d8f5",
    orders: "#1A9FD4",
    ordersLight: "#E0F4FD",
    sales: "#0e7d5b",
    salesLight: "#e6f5f0",
    cvr: "#b45309",
    cvrLight: "#fef3c7",
    text: "#1a2b4a",
    subtext: "#4b6991",
    cardBg: "#ffffff",
    border: "#dce8f7",
};

const BAR_OPACITIES = [1, 0.88, 0.78, 0.69, 0.62, 0.55, 0.50, 0.45, 0.41, 0.38];

// ─── Build common API payload ─────────────────────────────────────────────────

const buildPayload = ({ profileId, date, searchName, status, type, conditionObj, sortField }) => ({
    searchName: searchName || "",
    status: status || "",
    type: type || "",
    profileId: profileId.value,
    fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
    toDate: moment(date?.[1]).format("YYYY-MM-DD"),
    fieldName: sortField,
    fieldOperator: conditionObj?.firstCondition || "",
    fieldValue: Number(conditionObj?.firstValue || 0),
    conditions: conditionObj?.operator || "",
    extraFieldOperator: conditionObj?.secondCondition || "",
    extraFieldValue: Number(conditionObj?.secondValue || 0),
    sortType: "DESC",
    pageNo: 1,
    perPage: 10,
});

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label, accent, prefix = "", suffix = "", isDark }) => {
    if (!active || !payload?.length) return null;
    const textThemeColor = isDark ? "rgba(255, 255, 255, 0.92)" : "#1a2b4a";
    const subtextThemeColor = isDark ? "rgba(255, 255, 255, 0.55)" : "#4b6991";
    return (
        <div style={{
            background: isDark ? "rgba(15, 23, 42, 0.98)" : "rgba(255, 255, 255, 0.98)",
            backdropFilter: "blur(8px)",
            border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : `1px solid ${accent}30`,
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 12,
            boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(2,70,139,0.08), 0 1px 3px rgba(0,0,0,0.02)",
            maxWidth: 240,
        }}>
            <p style={{ margin: 0, fontWeight: 700, color: textThemeColor, marginBottom: 6, fontSize: 12, wordBreak: "break-word", lineHeight: 1.3 }}>
                {label}
            </p>
            <div className="flex items-center" style={{ gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: accent }} />
                <p style={{ margin: 0, color: textThemeColor, fontSize: 12 }}>
                    <span style={{ color: subtextThemeColor }}>{payload[0].name}: </span>
                    <strong style={{ color: accent, fontWeight: 700 }}>
                        {prefix}{formatNumber(payload[0].value)}{suffix}
                    </strong>
                </p>
            </div>
        </div>
    );
};

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

const Skeleton = ({ isDark }) => (
    <div className="flex flex-wrap" style={{ gap: 14 }}>
        {[0, 1, 2].map(i => (
            <div key={i} style={{
                flex: "1 1 280px", minWidth: 260, height: 230,
                borderRadius: 14, overflow: "hidden",
                background: isDark ? "rgba(255, 255, 255, 0.05)" : "#E0F4FD", position: "relative",
            }}>
                <div style={{
                    position: "absolute", inset: 0,
                    background: isDark
                        ? "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)"
                        : "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.65) 50%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "skshimmer 1.4s infinite",
                }} />
            </div>
        ))}
        <style>{`@keyframes skshimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
);

// ─── Single Chart Card ────────────────────────────────────────────────────────

const ChartCard = ({ title, subtitle, icon, data, dataKey, accent, accentLight, prefix, suffix, loading, isDark, theme }) => {
    const { t } = useTranslation();
    const top = data?.[0];

    return (
        <div style={{
            flex: "1 1 280px",
            minWidth: 260,
            background: theme.cardBg,
            borderRadius: 14,
            border: `1.5px solid ${theme.border}`,
            boxShadow: isDark ? "none" : "0 4px 20px rgba(2,70,139,0.05)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            transition: "all 0.3s ease",
        }}>
            {/* ── Header ── */}
            <div style={{
                background: theme.headerBg,
                padding: "16px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                borderBottom: `1px solid ${theme.border}`,
            }}>
                <div className="flex items-center" style={{ gap: 12 }}>
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: accentLight || `${accent}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        flexShrink: 0,
                    }}>
                        {icon}
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, fontFamily: "'Inter', sans-serif" }}>{title}</div>
                        <div style={{ fontSize: 11, color: theme.subtext, marginTop: 2, fontFamily: "'Inter', sans-serif" }}>{subtitle}</div>
                    </div>
                </div>
                {!loading && top && (
                    <div style={{
                        background: accentLight || `${accent}15`,
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 10,
                        color: accent,
                        fontWeight: 600,
                        maxWidth: 130,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        border: `1px solid ${accent}25`,
                    }} title={top.name}>
                        🏆 {truncate(top.name, 15)}
                    </div>
                )}
            </div>

            {/* ── Chart body ── */}
            <div style={{ padding: "18px 12px 12px", flex: 1, background: theme.bodyBg }}>
                {loading ? (
                    <div style={{
                        height: 150, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                        <div style={{
                            width: 28, height: 28,
                            border: `3px solid ${accent}30`,
                            borderTop: `3px solid ${accent}`,
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite",
                        }} />
                        <span style={{ fontSize: 11, color: theme.subtext }}>{t("Loading…")}</span>
                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    </div>
                ) : !data?.length ? (
                    <div style={{
                        height: 150, display: "flex", alignItems: "center",
                        justifyContent: "center", color: theme.subtext, fontSize: 12,
                    }}>
                        {t("No data available")}
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barCategoryGap="28%">
                            <CartesianGrid vertical={false} stroke={theme.border} strokeDasharray="3 3" />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: theme.subtext, fontSize: 9, fontWeight: 500 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => truncate(v, 9)}
                            />
                            <YAxis
                                tick={{ fill: theme.subtext, fontSize: 9 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={formatNumber}
                                width={38}
                            />
                            <Tooltip
                                content={<CustomTooltip accent={accent} prefix={prefix} suffix={suffix} isDark={isDark} />}
                                cursor={{ fill: isDark ? "rgba(255, 255, 255, 0.04)" : `${accent}08` }}
                            />
                            <Bar dataKey={dataKey} name={title} radius={[6, 6, 0, 0]}>
                                {data.map((_, i) => (
                                    <Cell key={i} fill={accent} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* ── Footer ── */}
            {!loading && top && (
                <div style={{
                    borderTop: `1px solid ${theme.border}`,
                    padding: "10px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: accentLight || `${accent}08`,
                }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: theme.subtext }}>{t("Top performer value")}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
                        {prefix}{formatNumber(top[dataKey])}{suffix}
                    </span>
                </div>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ProductPerformanceCharts = ({ date, searchName, status, type, conditionObj }) => {
    const { t } = useTranslation();
    const { profileId, selectedAdType, currencyCode } = useContext(ProfileContext);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const currencySymbol = getCurrencySymbol(currencyCode);

    // Each chart has its own data + loading state
    const [ordersData, setOrdersData] = useState([]);
    const [salesData, setSalesData] = useState([]);
    const [cvrData, setCvrData] = useState([]);

    const [loadingOrders, setLoadingOrders] = useState(false);
    const [loadingSales, setLoadingSales] = useState(false);
    const [loadingCvr, setLoadingCvr] = useState(false);

    // ── Shared fetch util ──────────────────────────────────────────────────────
    const fetchChart = async ({ sortField, setData, setLoading }) => {
        if (!profileId?.value || !selectedAdType || !date?.length) return;
        setLoading(true);
        try {
            const payload = buildPayload({
                profileId, date, searchName, status, type, conditionObj, sortField,
            });
            const res = await ApiProductListing(payload);
            if (res?.isSuccess && res?.getProductAds?.length) {
                setData(
                    res.getProductAds.map((row) => ({
                        name: row?.productData?.title || row?.asins || t("Unknown"),
                        orders: row?.orders ?? 0,
                        sales: row?.sales ?? 0,
                        conversionRate: row?.conversionRate != null
                            ? row.conversionRate
                            : calcCVR(row?.orders ?? 0, row?.clicks ?? 0),
                    }))
                );
            } else {
                setData([]);
            }
        } catch {
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    // ── Trigger all 3 fetches independently ───────────────────────────────────
    const fromDateStr = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : "";
    const toDateStr = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : "";

    useEffect(() => {
        fetchChart({ sortField: "orders", setData: setOrdersData, setLoading: setLoadingOrders });
        fetchChart({ sortField: "sales", setData: setSalesData, setLoading: setLoadingSales });
        fetchChart({ sortField: "conversionRate", setData: setCvrData, setLoading: setLoadingCvr });
    }, [profileId?.value, selectedAdType, fromDateStr, toDateStr, status, type, searchName]);

    const anyData = ordersData.length || salesData.length || cvrData.length;
    const allLoading = loadingOrders && loadingSales && loadingCvr;

    const theme = {
        primary: "#1A9FD4",
        primaryLight: "#1a5fa8",
        primaryLighter: isDark ? "rgba(26, 159, 212, 0.12)" : "#E0F4FD",
        primaryBorder: isDark ? "rgba(26, 159, 212, 0.3)" : "#c5d8f5",
        orders: isDark ? "#2374F2" : "#1A9FD4",
        ordersLight: isDark ? "rgba(60, 187, 242, 0.12)" : "#E0F4FD",
        sales: isDark ? "#3ECFA8" : "#0e7d5b",
        salesLight: isDark ? "rgba(62, 207, 168, 0.12)" : "#e6f5f0",
        cvr: isDark ? "#F59E0B" : "#b45309",
        cvrLight: isDark ? "rgba(245, 158, 11, 0.12)" : "#fef3c7",
        text: isDark ? "rgba(255, 255, 255, 0.92)" : "#1a2b4a",
        subtext: isDark ? "rgba(255, 255, 255, 0.55)" : "#4b6991",
        cardBg: isDark ? "var(--glass-bg)" : "#ffffff",
        border: isDark ? "var(--glass-border-color)" : "#dce8f7",
        headerBg: isDark ? "rgba(30, 41, 59, 0.3)" : "#ffffff",
        bodyBg: isDark ? "transparent" : "linear-gradient(180deg, #ffffff 0%, #fcfdfe 100%)",
        tooltipBg: isDark ? "rgba(15, 23, 42, 0.98)" : "rgba(255, 255, 255, 0.98)",
    };

    return (
        <div id="product-ads-top-cards" className="glass-card drawer-card-override" style={{ margin: "0 0 20px 0", padding: "20px 24px", borderRadius: "16px", fontFamily: "'Inter', sans-serif" }}>
            {/* ── Section header ── */}
            <div className="flex items-center" style={{ gap: 10, marginBottom: 18 }}>
                <div style={{
                    width: 4, height: 22, borderRadius: 4,
                    background: `linear-gradient(180deg, ${theme.primary}, #1a7bd4)`,
                }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: theme.primary, letterSpacing: 0.2, fontFamily: "'Inter', sans-serif" }}>
                    {t("Product Performance Overview")}
                </span>
                <span style={{
                    fontSize: 10,
                    color: theme.primary,
                    background: theme.primaryLighter,
                    border: `1px solid ${theme.primaryBorder}`,
                    borderRadius: 20,
                    padding: "2px 10px",
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif"
                }}>
                    {t("Top 10 Products")}
                </span>
            </div>

            {/* ── Charts row ── */}
            {allLoading ? <Skeleton isDark={isDark} /> : (
                <div className="flex flex-wrap" style={{ gap: 14 }}>
                    {/* 1 — Orders */}
                    <ChartCard
                        title={t("Orders")}
                        subtitle={t("Top 10 products by orders")}
                        icon="📦"
                        data={ordersData}
                        dataKey="orders"
                        accent={theme.orders}
                        accentLight={theme.ordersLight}
                        prefix=""
                        suffix=""
                        loading={loadingOrders}
                        isDark={isDark}
                        theme={theme}
                    />

                    {/* 2 — Sales */}
                    <ChartCard
                        title={t("Sales")}
                        subtitle={t("Top 10 products by revenue")}
                        icon="💰"
                        data={salesData}
                        dataKey="sales"
                        accent={theme.sales}
                        accentLight={theme.salesLight}
                        prefix={currencySymbol}
                        suffix=""
                        loading={loadingSales}
                        isDark={isDark}
                        theme={theme}
                    />

                    {/* 3 — CVR */}
                    <ChartCard
                        title={t("CVR %")}
                        subtitle={t("Top 10 products by conversion rate")}
                        icon="🎯"
                        data={cvrData}
                        dataKey="conversionRate"
                        accent={theme.cvr}
                        accentLight={theme.cvrLight}
                        prefix=""
                        suffix="%"
                        loading={loadingCvr}
                        isDark={isDark}
                        theme={theme}
                    />
                </div>
            )}
        </div>
    );
};

export default ProductPerformanceCharts;