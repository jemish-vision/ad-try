import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import {
  Layers,
  Sparkles,
  RefreshCw,
  ShoppingBag,
  Tag,
  Monitor,
  Table as TableIcon,
  LayoutGrid,
  TrendingUp,
} from "lucide-react";
import { ApiGetAdTypeBreakdown } from "../../../../api-wrapper/dashboard/ApiDashboard";
import {
  formatRegionalCurrency,
  formatFullRegionalCurrency,
  formatFullRegionalNumber,
  formatRegionalNumber,
} from "../../../../utility/regionalNumberFormat";

const AD_TYPES = [
  {
    key: "SP",
    label: "Sponsored Products",
    short: "SP",
    icon: ShoppingBag,
    color: "#2374F2",
    badgeBg: "bg-blue-50 dark:bg-blue-950/50",
    badgeBorder: "border-blue-200 dark:border-blue-800/60",
    badgeText: "text-blue-700 dark:text-blue-300",
    barColor: "bg-blue-500",
  },
  {
    key: "SB",
    label: "Sponsored Brands",
    short: "SB",
    icon: Tag,
    color: "#8b5cf6",
    badgeBg: "bg-purple-50 dark:bg-purple-950/50",
    badgeBorder: "border-purple-200 dark:border-purple-800/60",
    badgeText: "text-purple-700 dark:text-purple-300",
    barColor: "bg-purple-500",
  },
  {
    key: "SD",
    label: "Sponsored Display",
    short: "SD",
    icon: Monitor,
    color: "#10b981",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950/50",
    badgeBorder: "border-emerald-200 dark:border-emerald-800/60",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    barColor: "bg-emerald-500",
  },
];

/**
 * Metric Cell with Primary Value on top & Comparison Delta underneath
 * Matching the exact "Data Fuel Software" reference UI
 */
function TableCellWithDelta({
  value,
  diff,
  pct,
  isCurrency = false,
  isPercent = false,
  isAcos = false,
  isSpend = false,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const isPositive = diff > 0;
  const isNegative = diff < 0;
  const isZero = diff === 0 || diff == null;

  // Color logic matching marketing analytics:
  // For ACoS: lower is better (negative diff = green, positive diff = red)
  // For others: higher is better (positive diff = green, negative diff = red)
  let colorClass = "text-slate-400 dark:text-slate-500";
  if (!isZero) {
    if (isAcos) {
      colorClass = isNegative
        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
        : "text-rose-600 dark:text-rose-400 font-semibold";
    } else if (isSpend) {
      colorClass = isPositive
        ? "text-slate-600 dark:text-slate-300"
        : "text-slate-500 dark:text-slate-400";
    } else {
      colorClass = isPositive
        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
        : "text-rose-600 dark:text-rose-400 font-semibold";
    }
  }

  const sign = isPositive ? "+" : isNegative ? "-" : "";
  const absDiff = Math.abs(diff || 0);

  let formattedDiff = "";
  if (isCurrency) {
    formattedDiff = `${sign}${formatFullRegionalCurrency(absDiff, currencyCode, marketplace, 0)}`;
  } else if (isPercent) {
    formattedDiff = `${sign}${absDiff.toFixed(2)}%`;
  } else {
    formattedDiff = `${sign}${formatFullRegionalNumber(absDiff, marketplace, 0)}`;
  }

  const signPct = pct > 0 ? "+" : "";
  const formattedPct = isZero ? "0.0%" : `${signPct}${pct}%`;

  return (
    <div className="flex flex-col items-end justify-center py-0.5">
      <span className="text-[14px] font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
        {value}
      </span>
      <div className={`flex items-center gap-1.5 text-[11px] tabular-nums ${colorClass} mt-0.5 leading-none`}>
        <span>{formattedDiff}</span>
        <span>{formattedPct}</span>
      </div>
    </div>
  );
}

export default function AdTypeBreakdownWidget({
  profileId,
  date,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState("table"); // "table" | "cards"

  const getProfileIdString = (p) => {
    if (!p) return null;
    if (typeof p === "string") return p;
    if (typeof p === "object") {
      return p.value || p.profileId || p._id || p.id || null;
    }
    return String(p);
  };

  const getStoredProfileId = () => {
    try {
      const p = JSON.parse(localStorage.getItem("profile"));
      return p?.profile?.profileId || p?.profileId || p?.id || null;
    } catch (e) {
      return null;
    }
  };

  const [currentPid, setCurrentPid] = useState(() => getProfileIdString(profileId) || getStoredProfileId());

  useEffect(() => {
    const normalized = getProfileIdString(profileId);
    if (normalized && normalized !== currentPid) {
      setCurrentPid(normalized);
    }
  }, [profileId]);

  useEffect(() => {
    const handleProfileChange = (e) => {
      const newPid = e?.detail?.profile?.profileId;
      if (newPid && newPid !== currentPid) {
        setCurrentPid(newPid);
      }
    };
    window.addEventListener("profileChanged", handleProfileChange);
    return () => window.removeEventListener("profileChanged", handleProfileChange);
  }, [currentPid]);

  const effectiveProfileId = currentPid || getProfileIdString(profileId) || getStoredProfileId();

  const fetchData = useCallback(async () => {
    const pid = effectiveProfileId;
    if (!pid) return;

    let fromDate = moment().subtract(30, "days").format("YYYY-MM-DD");
    let toDate = moment().subtract(1, "days").format("YYYY-MM-DD");
    if (date && Array.isArray(date) && date.length >= 2) {
      fromDate = moment(date[0]).format("YYYY-MM-DD");
      toDate = moment(date[1]).format("YYYY-MM-DD");
    }

    setLoading(true);
    try {
      const res = await ApiGetAdTypeBreakdown({
        profileId: pid,
        fromDate,
        toDate,
      });

      if (res?.isSuccess && res?.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error("AdTypeBreakdownWidget error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveProfileId, date]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    fetchData();
  }, [effectiveProfileId, date, fetchData]);

  const breakdown = data?.breakdown || {};
  const totals = data?.totals || {
    totalSpend: 0,
    totalSales: 0,
    totalOrders: 0,
    totalClicks: 0,
    totalImpressions: 0,
    overallAcos: 0,
    overallRoas: 0,
    overallCtr: 0,
  };

  // Determine top efficiency format (highest ROAS among active)
  const bestRoasType = useMemo(() => {
    let best = null;
    let maxRoas = 0;
    AD_TYPES.forEach((type) => {
      const item = breakdown[type.key];
      if (item && item.roas > maxRoas && item.spend > 0) {
        maxRoas = item.roas;
        best = type;
      }
    });
    return best ? { ...best, roas: maxRoas } : null;
  }, [breakdown]);

  const prevRangeText = useMemo(() => {
    if (!data?.previousRange?.prevFromDate || !data?.previousRange?.prevToDate) return "";
    const f = moment(data.previousRange.prevFromDate).format("DD MMM");
    const to = moment(data.previousRange.prevToDate).format("DD MMM, YYYY");
    return `${f} – ${to}`;
  }, [data]);

  return (
    <div className="dg-root rounded-2xl overflow-hidden transition-all">
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 flex-wrap gap-2.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200/60 dark:border-purple-800/40 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>{t("Ad Type Performance")}</span>
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {prevRangeText
                ? `${t("Compared to")} ${prevRangeText}`
                : t("Performance comparison across Sponsored Products, Brands, and Display")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {prevRangeText && (
            <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 border border-slate-200/80 dark:border-white/10">
              <span className="text-slate-400">{t("Compare to")}:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{prevRangeText}</span>
            </div>
          )}

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            title={t("Refresh Ad Type Performance")}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Table View ────────── */}
      {true ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-white/[0.03] border-b border-slate-200/80 dark:border-white/10 text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-6 text-left">{t("Ad Type")}</th>
                <th className="py-3 px-4 text-right">{t("Impressions")}</th>
                <th className="py-3 px-4 text-right">{t("Clicks")}</th>
                <th className="py-3 px-4 text-right">{t("Spend")}</th>
                <th className="py-3 px-4 text-right">{t("Sales")}</th>
                <th className="py-3 px-4 text-right">{t("Orders")}</th>
                <th className="py-3 px-4 text-right">{t("ACoS")}</th>
                <th className="py-3 px-4 text-right">{t("ROAS")}</th>
                <th className="py-3 px-6 text-right">{t("CTR")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {AD_TYPES.map((type) => {
                const item = breakdown[type.key] || {
                  impressions: 0,
                  clicks: 0,
                  spend: 0,
                  sales: 0,
                  orders: 0,
                  acos: 0,
                  roas: 0,
                  ctr: 0,
                  deltaImpressions: { diff: 0, pct: 0 },
                  deltaClicks: { diff: 0, pct: 0 },
                  deltaSpend: { diff: 0, pct: 0 },
                  deltaSales: { diff: 0, pct: 0 },
                  deltaOrders: { diff: 0, pct: 0 },
                  deltaAcos: { diff: 0, pct: 0 },
                  deltaRoas: { diff: 0, pct: 0 },
                  deltaCtr: { diff: 0, pct: 0 },
                };

                return (
                  <tr
                    key={type.key}
                    className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Ad Type Label */}
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold border ${type.badgeBg} ${type.badgeBorder} ${type.badgeText}`}
                        >
                          {type.short}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">
                            {type.label}
                          </span>
                          <span className="text-[12px] text-slate-400">
                            {item.campaignCount || 0} {t("campaigns")}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Impressions */}
                    <td className="py-3.5 px-4 text-right">
                      <TableCellWithDelta
                        value={formatFullRegionalNumber(item.impressions, marketplace, 0)}
                        diff={item.deltaImpressions?.diff}
                        pct={item.deltaImpressions?.pct}
                        marketplace={marketplace}
                      />
                    </td>

                    {/* Clicks */}
                    <td className="py-3.5 px-4 text-right">
                      <TableCellWithDelta
                        value={formatFullRegionalNumber(item.clicks, marketplace, 0)}
                        diff={item.deltaClicks?.diff}
                        pct={item.deltaClicks?.pct}
                        marketplace={marketplace}
                      />
                    </td>

                    {/* Spend */}
                    <td className="py-3.5 px-4 text-right">
                      <TableCellWithDelta
                        value={formatFullRegionalCurrency(item.spend, currencyCode, marketplace, 0)}
                        diff={item.deltaSpend?.diff}
                        pct={item.deltaSpend?.pct}
                        isCurrency={true}
                        isSpend={true}
                        currencyCode={currencyCode}
                        marketplace={marketplace}
                      />
                    </td>

                    {/* Sales */}
                    <td className="py-3.5 px-4 text-right">
                      <TableCellWithDelta
                        value={formatFullRegionalCurrency(item.sales, currencyCode, marketplace, 0)}
                        diff={item.deltaSales?.diff}
                        pct={item.deltaSales?.pct}
                        isCurrency={true}
                        currencyCode={currencyCode}
                        marketplace={marketplace}
                      />
                    </td>

                    {/* Orders */}
                    <td className="py-3.5 px-4 text-right">
                      <TableCellWithDelta
                        value={formatFullRegionalNumber(item.orders, marketplace, 0)}
                        diff={item.deltaOrders?.diff}
                        pct={item.deltaOrders?.pct}
                        marketplace={marketplace}
                      />
                    </td>

                    {/* ACoS */}
                    <td className="py-3.5 px-4 text-right">
                      <TableCellWithDelta
                        value={item.acos > 0 ? `${item.acos.toFixed(2)}%` : "—"}
                        diff={item.deltaAcos?.diff}
                        pct={item.deltaAcos?.pct}
                        isPercent={true}
                        isAcos={true}
                      />
                    </td>

                    {/* ROAS */}
                    <td className="py-3.5 px-4 text-right">
                      <TableCellWithDelta
                        value={item.roas > 0 ? `${item.roas.toFixed(2)}` : "—"}
                        diff={item.deltaRoas?.diff}
                        pct={item.deltaRoas?.pct}
                      />
                    </td>

                    {/* CTR */}
                    <td className="py-3.5 px-6 text-right">
                      <TableCellWithDelta
                        value={item.ctr > 0 ? `${item.ctr.toFixed(2)}%` : "0%"}
                        diff={item.deltaCtr?.diff}
                        pct={item.deltaCtr?.pct}
                        isPercent={true}
                      />
                    </td>
                  </tr>
                );
              })}

              {/* ── Summary / Totals Row ──────────────────────────── */}
              <tr className="bg-slate-50/90 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-white/10">
                <td className="py-3.5 px-6">
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    {t("Total")}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right">
                  <TableCellWithDelta
                    value={formatFullRegionalNumber(totals.totalImpressions, marketplace, 0)}
                    diff={totals.deltaImpressions?.diff}
                    pct={totals.deltaImpressions?.pct}
                    marketplace={marketplace}
                  />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <TableCellWithDelta
                    value={formatFullRegionalNumber(totals.totalClicks, marketplace, 0)}
                    diff={totals.deltaClicks?.diff}
                    pct={totals.deltaClicks?.pct}
                    marketplace={marketplace}
                  />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <TableCellWithDelta
                    value={formatFullRegionalCurrency(totals.totalSpend, currencyCode, marketplace, 0)}
                    diff={totals.deltaSpend?.diff}
                    pct={totals.deltaSpend?.pct}
                    isCurrency={true}
                    isSpend={true}
                    currencyCode={currencyCode}
                    marketplace={marketplace}
                  />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <TableCellWithDelta
                    value={formatFullRegionalCurrency(totals.totalSales, currencyCode, marketplace, 0)}
                    diff={totals.deltaSales?.diff}
                    pct={totals.deltaSales?.pct}
                    isCurrency={true}
                    currencyCode={currencyCode}
                    marketplace={marketplace}
                  />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <TableCellWithDelta
                    value={formatFullRegionalNumber(totals.totalOrders, marketplace, 0)}
                    diff={totals.deltaOrders?.diff}
                    pct={totals.deltaOrders?.pct}
                    marketplace={marketplace}
                  />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <TableCellWithDelta
                    value={totals.overallAcos > 0 ? `${totals.overallAcos.toFixed(2)}%` : "—"}
                    diff={totals.deltaAcos?.diff}
                    pct={totals.deltaAcos?.pct}
                    isPercent={true}
                    isAcos={true}
                  />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <TableCellWithDelta
                    value={totals.overallRoas > 0 ? `${totals.overallRoas.toFixed(2)}` : "—"}
                    diff={totals.deltaRoas?.diff}
                    pct={totals.deltaRoas?.pct}
                  />
                </td>
                <td className="py-3.5 px-6 text-right">
                  <TableCellWithDelta
                    value={totals.overallCtr > 0 ? `${totals.overallCtr.toFixed(2)}%` : "0%"}
                    diff={totals.deltaCtr?.diff}
                    pct={totals.deltaCtr?.pct}
                    isPercent={true}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Cards View ────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-white/5 p-6 gap-6 md:gap-0">
          {AD_TYPES.map((type, idx) => {
            const item = breakdown[type.key] || {
              spend: 0,
              sales: 0,
              orders: 0,
              clicks: 0,
              impressions: 0,
              acos: 0,
              roas: 0,
              ctr: 0,
              cvr: 0,
              cpc: 0,
              campaignCount: 0,
              spendShare: 0,
              salesShare: 0,
            };
            const Icon = type.icon;
            const padClass = idx === 0 ? "md:pr-5" : idx === 1 ? "md:px-5" : "md:pl-5";

            return (
              <div key={type.key} className={`${padClass} space-y-3 pt-3 md:pt-0`}>
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${type.badgeBg} ${type.badgeBorder} ${type.badgeText}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{type.label}</span>
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {item.campaignCount || 0} {t("camps")}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5">
                    <span className="text-[10.5px] font-medium text-slate-400 uppercase tracking-wider">{t("Spend")}</span>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {formatRegionalCurrency(item.spend, currencyCode, marketplace)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5">
                    <span className="text-[10.5px] font-medium text-slate-400 uppercase tracking-wider">{t("Sales")}</span>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {formatRegionalCurrency(item.sales, currencyCode, marketplace)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-200/80 dark:border-slate-700/50">
                    <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider">{t("ACoS")}</span>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {item.acos > 0 ? `${item.acos}%` : "—"}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-200/80 dark:border-slate-700/50">
                    <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider">{t("ROAS")}</span>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {item.roas > 0 ? `${item.roas}x` : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <span>{t("Impr")}: <strong className="text-slate-800 dark:text-slate-200">{formatRegionalNumber(item.impressions, marketplace)}</strong></span>
                  <span>{t("Clicks")}: <strong className="text-slate-800 dark:text-slate-200">{formatRegionalNumber(item.clicks, marketplace)}</strong></span>
                  <span>{t("CTR")}: <strong className="text-slate-800 dark:text-slate-200">{item.ctr || 0}%</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
