import React from 'react';
import { useTranslation } from "react-i18next";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, ReferenceLine
} from 'recharts';
import moment from "moment";

// Colors matching AdminDashboard
const P = {
  primary: "#1A9FD4",
  primary50: "#E0F4FD",
  primary100: "#C0D4F0",
  primary300: "#4A90D9",
  accent: "#E8845A",
  accent2: "#16A34A",
  neutral50: "#F8FAFC",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral300: "#D0D7E2",
  neutral400: "#94A3B8",
  neutral600: "#475569",
  neutral800: "#1E293B",
  danger: "#E74C3C",
  warning: "#F59E0B"
};

const CustomTooltip = ({ active, payload, label, unit, isDark }) => {
  const { t } = useTranslation();

  if (active && payload && payload.length) {
    const bg = isDark ? "rgba(15, 23, 42, 0.98)" : "#fff";
    const border = isDark ? "1px solid var(--glass-border-color)" : `1px solid ${P.neutral200}`;
    const textColor = isDark ? "var(--text-primary)" : P.neutral800;
    const textSecColor = isDark ? "var(--text-secondary)" : P.neutral600;
    const borderColor = isDark ? "rgba(255, 255, 255, 0.1)" : P.neutral100;
    return (
      <div style={{
        background: bg, border: border,
        borderRadius: 12, padding: "12px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        fontSize: 13, minWidth: 195, zIndex: 9999,
      }}>
        <div style={{ fontWeight: 800, marginBottom: 9, color: textColor, fontSize: 13, borderBottom: `1px solid ${borderColor}`, paddingBottom: 7 }}>
          {moment(label).format("MMM DD, YYYY")}
        </div>
        <div className="flex justify-between items-center" style={{ gap: 16, marginBottom: 5 }}>
          <div className="flex items-center" style={{ gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: payload[0].color || payload[0].stroke, display: "inline-block", flexShrink: 0 }} />
            <span style={{ color: textSecColor, fontSize: 12.5 }}>{payload[0].name}</span>
          </div>
          <span style={{ fontWeight: 700, color: textColor, fontVariantNumeric: "tabular-nums" }}>{payload[0].value} {unit}</span>
        </div>
        {payload[0].payload.zone && (
          <div className="flex justify-between items-center" style={{ gap: 16, marginTop: 5 }}>
            <div className="flex items-center" style={{ gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: P.warning, display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: textSecColor, fontSize: 12.5 }}>{t("Status")}</span>
            </div>
            <span style={{ fontWeight: 700, color: textColor, fontVariantNumeric: "tabular-nums" }}>
              {payload[0].payload.zone.replace('_', ' ')}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};


const ChartCard = ({ title, subtitle, isDark, children }) => {
  return (
    <div style={{
      background: isDark ? "var(--glass-bg)" : "#fff",
      borderRadius: 14,
      border: isDark ? "1px solid var(--glass-border-color)" : `1px solid ${P.neutral200}`,
      overflow: "hidden",
      height: "100%",
      display: "flex",
      flexDirection: "column"
    }}>
      <div style={{
        display: "flex", flexDirection: "column", gap: 2,
        padding: "16px 22px", borderBottom: isDark ? "1px solid rgba(255,255,255,0.1)" : `1px solid ${P.neutral100}`
      }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: isDark ? "var(--text-primary)" : P.neutral800, letterSpacing: "-0.4px" }}>{title}</span>
        <span style={{ color: isDark ? "var(--text-secondary)" : P.neutral400, fontSize: 12, fontWeight: 600 }}>{subtitle}</span>
      </div>
      <div style={{ padding: "14px 0 4px", flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
};

const FbaPlanningCharts = ({ data, loading, isDark }) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="w-full min-w-0">
          <ChartCard title={t("Sales Trend")} subtitle={t("Loading...")} isDark={isDark}>
            <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ height: 300 }}>
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#1A9FD4]" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("Loading chart data...")}</span>
            </div>
          </ChartCard>
        </div>
        <div className="w-full min-w-0">
          <ChartCard title={t("Inventory Forecast")} subtitle={t("Loading...")} isDark={isDark}>
            <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ height: 300 }}>
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#1A9FD4]" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("Loading chart data...")}</span>
            </div>
          </ChartCard>
        </div>
      </div>
    );
  }

  if (!data || (!data.salesTrend && !data.inventoryForecast)) {
    return null;
  }

  const { salesTrend, inventoryForecast } = data;
  const formatXAxisDate = (tickItem) => moment(tickItem).format('MMM DD');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Sales Trend Chart (Matching Orders Metric Style) */}
      {salesTrend && (
        <div id="fba-sales-trend-chart" className="w-full min-w-0">
          <ChartCard title={t("Sales Trend")} subtitle={salesTrend.label || t("Daily Units Sold")} isDark={isDark}>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={salesTrend.data}
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={P.primary} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={P.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.08)" : P.neutral300} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatXAxisDate}
                    tick={{ fontSize: 11, fill: isDark ? "rgba(255,255,255,0.5)" : P.neutral400, fontWeight: 600 }}
                    axisLine={false} tickLine={false} dy={7}
                  />
                  <YAxis
                    domain={[0, 'auto']}
                    tick={{ fontSize: 11, fill: isDark ? "rgba(255,255,255,0.5)" : P.neutral400, fontWeight: 600 }}
                    axisLine={{ stroke: P.primary, strokeWidth: 1.5, strokeOpacity: 0.25 }}
                    tickLine={false}
                    width={65}
                    label={{ value: t("Units Sold"), angle: -90, position: "insideLeft", offset: 15, style: { fontSize: 11, fill: P.primary, fontWeight: 700, textAnchor: "middle" } }}
                  />
                  <Tooltip content={<CustomTooltip unit="Units" isDark={isDark} />} cursor={{ stroke: isDark ? "rgba(255,255,255,0.15)" : P.neutral300, strokeWidth: 1, strokeDasharray: "4 4" }} />

                  <Area
                    type="monotone"
                    dataKey="orders"
                    stroke="none"
                    fillOpacity={1}
                    fill="url(#colorOrders)"
                  />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    name={t("Orders")}
                    stroke={P.primary}
                    strokeWidth={2}
                    dot={{ r: 3, fill: P.primary, stroke: "#fff", strokeWidth: 1.5 }}
                    activeDot={{ r: 6, fill: P.primary, stroke: "#fff", strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}

      {/* Inventory Forecast Chart (Matching Ad Spend/Revenue Style) */}
      {inventoryForecast && (
        <div id="fba-inventory-forecast-chart" className="w-full min-w-0">
          <ChartCard title={t("Inventory Forecast")} subtitle={inventoryForecast.label || t("Projected Stock Level")} isDark={isDark}>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={inventoryForecast.data}
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.08)" : P.neutral300} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatXAxisDate}
                    tick={{ fontSize: 11, fill: isDark ? "rgba(255,255,255,0.5)" : P.neutral400, fontWeight: 600 }}
                    axisLine={false} tickLine={false} dy={7}
                  />
                  <YAxis
                    domain={[0, 'auto']}
                    tick={{ fontSize: 11, fill: isDark ? "rgba(255,255,255,0.5)" : P.neutral400, fontWeight: 600 }}
                    axisLine={{ stroke: P.accent, strokeWidth: 1.5, strokeOpacity: 0.25 }}
                    tickLine={false}
                    width={65}
                    label={{ value: t("Projected Stock"), angle: -90, position: "insideLeft", offset: 15, style: { fontSize: 11, fill: P.accent, fontWeight: 700, textAnchor: "middle" } }}
                  />
                  <Tooltip content={<CustomTooltip unit="Units" isDark={isDark} />} cursor={{ stroke: isDark ? "rgba(255,255,255,0.15)" : P.neutral300, strokeWidth: 1, strokeDasharray: "4 4" }} />

                  {inventoryForecast.referenceLines?.reorderPoint > 0 && (
                    <ReferenceLine
                      y={inventoryForecast.referenceLines.reorderPoint}
                      stroke={P.warning}
                      strokeDasharray="3 3"
                      ifOverflow="extendDomain"
                      label={{ position: 'insideTopLeft', value: t('Reorder Point'), fill: P.warning, fontSize: 10, fontWeight: 700 }}
                    />
                  )}
                  {inventoryForecast.referenceLines?.dangerPoint > 0 && (
                    <ReferenceLine
                      y={inventoryForecast.referenceLines.dangerPoint}
                      stroke={P.danger}
                      strokeDasharray="3 3"
                      ifOverflow="extendDomain"
                      label={{ position: 'insideBottomLeft', value: t('Danger Point'), fill: P.danger, fontSize: 10, fontWeight: 700 }}
                    />
                  )}

                  <Line
                    type="linear"
                    dataKey="projectedStock"
                    name={t("Projected Stock")}
                    stroke={P.accent}
                    strokeWidth={2}
                    dot={{ r: 3, fill: P.accent, stroke: "#fff", strokeWidth: 1.5 }}
                    activeDot={{ r: 6, fill: P.accent, stroke: "#fff", strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
};

export default FbaPlanningCharts;
