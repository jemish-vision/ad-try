import React from 'react';
import { useTranslation } from "react-i18next";
import {
    PieChart, Pie, Cell, Tooltip as ReTooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import CurrencyCode from '../../../helper/currencyCode/CurrencyCode';


const getColors = (isDark) => ({
    primary: "#1A9FD4",
    primary50: isDark ? "rgba(26, 159, 212, 0.15)" : "#E0F4FD",
    accent: "#E8845A",
    accent2: "#16A34A",
    neutral50: isDark ? "#0f172a" : "#F8FAFC",
    neutral100: isDark ? "rgba(255, 255, 255, 0.05)" : "#F1F5F9",
    neutral200: isDark ? "rgba(255, 255, 255, 0.08)" : "#E2E8F0",
    neutral300: isDark ? "rgba(255, 255, 255, 0.15)" : "#D0D7E2",
    neutral400: isDark ? "rgba(255, 255, 255, 0.4)" : "#94A3B8",
    neutral600: isDark ? "rgba(255, 255, 255, 0.6)" : "#475569",
    neutral800: isDark ? "rgba(255, 255, 255, 0.9)" : "#1E293B",
    danger: "#E74C3C",
    warning: "#F59E0B",
});

const PIE_COLORS = [
    "#1A9FD4", "#E8845A", "#16A34A", "#F59E0B", "#0EA5E9",
    "#8B5CF6", "#EC4899", "#EF4444", "#14B8A6", "#F97316"
];

const BAR_COLORS = [
    "#1A9FD4", "#1A6FC4", "#3B8FDD", "#63AEF0", "#1A9FD499",
    "#E8845A", "#F59E0B", "#16A34A", "#0EA5E9", "#8B5CF6"
];



const ChartCard = ({ title, subtitle, children, P, isDark }) => (
    <div style={{
        background: isDark ? "rgba(255, 255, 255, 0.02)" : "#fff",
        borderRadius: 14,
        border: `1px solid ${P.neutral200}`, overflow: "visible",
        height: "100%", display: "flex", flexDirection: "column"
    }}>
        <div style={{
            display: "flex", flexDirection: "column", gap: 2,
            padding: "16px 22px", borderBottom: `1px solid ${P.neutral100}`
        }}>
            <span style={{ fontWeight: 800, fontSize: 17, color: P.neutral800, letterSpacing: "-0.4px" }}>{title}</span>
            <span style={{ color: P.neutral400, fontSize: 12, fontWeight: 600 }}>{subtitle}</span>
        </div>
        <div style={{ padding: "14px 0 4px", flex: 1, minHeight: 0 }}>
            {children}
        </div>
    </div>
);

const ReturnTrackingCharts = ({ data, loading, isDark }) => {
    const { t } = useTranslation();
    const P = getColors(isDark);

    // Custom Pie Tooltip
    const PieCustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            return (
                <div style={{
                    background: isDark ? "#0f172a" : "#fff",
                    border: `1px solid ${P.neutral200}`,
                    borderRadius: 12, padding: "12px 16px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.30)",
                    fontSize: 13, minWidth: 200
                }}>
                    <div style={{ fontWeight: 800, color: P.neutral800, marginBottom: 8, borderBottom: `1px solid ${P.neutral100}`, paddingBottom: 6, fontSize: 13 }}>
                        {d.returnReason}
                    </div>
                    <div className="flex justify-between" style={{ marginBottom: 4 }}>
                        <span style={{ color: P.neutral600 }}>Return Count</span>
                        <span style={{ fontWeight: 700, color: P.neutral800 }}>{d.returnCount}</span>
                    </div>
                    <div className="flex justify-between" style={{ marginBottom: 4 }}>
                        <span style={{ color: P.neutral600 }}>Refund Amount</span>
                        <span style={{ fontWeight: 700, color: P.accent }}>{CurrencyCode(d.refundAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between" >
                        <span style={{ color: P.neutral600 }}>Order Amount</span>
                        <span style={{ fontWeight: 700, color: P.primary }}>{CurrencyCode(d.totalOrderAmount || 0)}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    // Custom Bar Tooltip
    const BarCustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const d = payload[0]?.payload;
            return (
                <div style={{
                    background: isDark ? "#0f172a" : "#fff",
                    border: `1px solid ${P.neutral200}`,
                    borderRadius: 12, padding: "12px 16px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.30)",
                    fontSize: 13, minWidth: 220
                }}>
                    <div style={{ fontWeight: 800, color: P.neutral800, marginBottom: 8, borderBottom: `1px solid ${P.neutral100}`, paddingBottom: 6, fontSize: 12 }}>
                        {d?.productName?.slice(0, 60)}{d?.productName?.length > 60 ? '...' : ''}
                    </div>
                    <div style={{ marginBottom: 2, fontSize: 11, color: P.neutral400 }}>ASIN: {d?.asin}</div>
                    <div className="flex justify-between" style={{ marginBottom: 4, marginTop: 6 }}>
                        <span style={{ color: P.neutral600 }}>Return Count</span>
                        <span style={{ fontWeight: 700, color: P.neutral800 }}>{d?.returnCount}</span>
                    </div>
                    <div className="flex justify-between" style={{ marginBottom: 4 }}>
                        <span style={{ color: P.neutral600 }}>Refund Amount</span>
                        <span style={{ fontWeight: 700, color: P.accent }}>{CurrencyCode(d?.refundAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between" >
                        <span style={{ color: P.neutral600 }}>Order Amount</span>
                        <span style={{ fontWeight: 700, color: P.primary }}>{CurrencyCode(d?.totalOrderAmount || 0)}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    // Custom Pie Legend
    const renderCustomLegend = (props) => {
        const { payload } = props;
        return (
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
                justifyContent: 'center', padding: '0 16px 8px'
            }}>
                {payload.map((entry, i) => (
                    <div className="flex items-center" key={i} style={{ gap: 5, fontSize: 11 }}>
                        <span style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: entry.color, flexShrink: 0, display: 'inline-block'
                        }} />
                        <span style={{ color: P.neutral600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <div className="w-full">
                    <ChartCard title={t("Top Returns by Reason")} subtitle={t("Loading...")} P={P} isDark={isDark}>
                        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ height: 300 }}>
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#1A9FD4]" />
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("Loading chart data...")}</span>
                        </div>
                    </ChartCard>
                </div>
                <div className="w-full">
                    <ChartCard title={t("Top Returns by ASIN")} subtitle={t("Loading...")} P={P} isDark={isDark}>
                        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ height: 300 }}>
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#1A9FD4]" />
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("Loading chart data...")}</span>
                        </div>
                    </ChartCard>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { topReturnReasons = [], topAsinReturns = [] } = data;

    // Truncate ASIN labels for bar chart x-axis
    const barData = topAsinReturns.map((d, i) => ({
        ...d,
        shortAsin: d.asin,
        barColor: BAR_COLORS[i % BAR_COLORS.length],
    }));

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {/* Pie Chart — Top Return Reasons */}
            {topReturnReasons.length > 0 && (
                <div className="w-full">
                    <ChartCard
                        title={t("Top Returns by Reason")}
                        subtitle={t("Return count & refund amount by reason code")}
                        P={P}
                        isDark={isDark}
                    >
                        <div style={{ width: '100%', height: 300 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={topReturnReasons}
                                        dataKey="returnCount"
                                        nameKey="returnReason"
                                        cx="50%"
                                        cy="45%"
                                        outerRadius={105}
                                        innerRadius={52}
                                        paddingAngle={2}
                                        stroke="none"
                                    >
                                        {topReturnReasons.map((_, i) => (
                                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <ReTooltip content={<PieCustomTooltip />} />
                                    <Legend
                                        content={renderCustomLegend}
                                        formatter={(val) => val}
                                        payload={topReturnReasons.map((d, i) => ({
                                            value: d.returnReason,
                                            color: PIE_COLORS[i % PIE_COLORS.length],
                                            type: 'circle'
                                        }))}
                                        verticalAlign="bottom"
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>
                </div>
            )}

            {/* Bar Chart — Top ASINs by Returns */}
            {barData.length > 0 && (
                <div className="w-full">
                    <ChartCard
                        title={t("Top Returns by ASIN")}
                        subtitle={t("Return count & refund amount by product")}
                        P={P}
                        isDark={isDark}
                    >
                        <div style={{ width: '100%', height: 300 }}>
                            <ResponsiveContainer>
                                <BarChart
                                    data={barData}
                                    layout="vertical"
                                    margin={{ top: 8, right: 60, left: 10, bottom: 8 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={P.neutral200} />
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 11, fill: P.neutral400, fontWeight: 600 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => v}
                                        label={{
                                            value: t("Return Count"),
                                            position: "insideBottom",
                                            offset: -2,
                                            style: { fontSize: 10, fill: P.primary, fontWeight: 700 }
                                        }}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="shortAsin"
                                        tick={{ fontSize: 11, fill: P.neutral600, fontWeight: 600 }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={80}
                                    />
                                    <ReTooltip content={<BarCustomTooltip />} cursor={{ fill: P.neutral100 }} />
                                    <Bar
                                        dataKey="returnCount"
                                        name="Return Count"
                                        radius={[0, 6, 6, 0]}
                                        maxBarSize={28}
                                    >
                                        {barData.map((entry, i) => (
                                            <Cell key={i} fill={entry.barColor} />
                                        ))}
                                        <LabelList
                                            dataKey="returnCount"
                                            position="right"
                                            style={{ fontSize: 11, fill: P.neutral600, fontWeight: 700 }}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>
                </div>
            )}

            {/* Empty state */}
            {topReturnReasons.length === 0 && topAsinReturns.length === 0 && (
                <div className="col-span-1 md:col-span-2 w-full">
                    <div style={{
                        background: isDark ? "rgba(255, 255, 255, 0.02)" : '#fff', borderRadius: 14,
                        border: `1px solid ${P.neutral200}`,
                        padding: '48px 24px', textAlign: 'center'
                    }}>
                        <i className="fa-solid fa-chart-pie" style={{ fontSize: 36, color: P.neutral300, marginBottom: 12 }} />
                        <div style={{ fontSize: 15, fontWeight: 600, color: P.neutral600, marginBottom: 4 }}>
                            {t("No chart data available")}
                        </div>
                        <div style={{ fontSize: 13, color: P.neutral400 }}>
                            {t("Adjust filters to see return analytics")}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReturnTrackingCharts;