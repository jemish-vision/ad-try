import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import ReactApexChart from "react-apexcharts";
import { PieChart, RefreshCw } from "lucide-react";
import { ApiGetAdTypeBreakdown } from "../../../../api-wrapper/dashboard/ApiDashboard";
import {
  getCurrencySymbol,
  isIndianMarketplace,
} from "../../../../utility/regionalNumberFormat";

function formatCompactCurrency(amount, currencyCode = "INR", marketplace = "IN", decimals = 2) {
  if (amount == null || isNaN(amount)) return "—";
  const num = Number(amount);
  const symbol = getCurrencySymbol(currencyCode);
  const isIndia = isIndianMarketplace(marketplace, currencyCode);
  const abs = Math.abs(num);
  let str = "";

  if (isIndia) {
    if (abs >= 10000000) {
      str = `${(abs / 10000000).toFixed(decimals).replace(/\.00$/, "")}Cr`;
    } else if (abs >= 100000) {
      str = `${(abs / 100000).toFixed(decimals).replace(/\.00$/, "")}L`;
    } else if (abs >= 1000) {
      str = `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    } else {
      str = abs.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    }
  } else {
    if (abs >= 1000000000) {
      str = `${(abs / 1000000000).toFixed(decimals).replace(/\.00$/, "")}B`;
    } else if (abs >= 1000000) {
      str = `${(abs / 1000000).toFixed(decimals).replace(/\.00$/, "")}M`;
    } else if (abs >= 1000) {
      str = `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    } else {
      str = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
  }

  return `${num < 0 ? "-" : ""}${symbol}${str}`;
}

export default function AdSpendByTypeWidget({
  profileId,
  date,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const effectiveProfileId = useMemo(() => {
    if (profileId) return profileId;
    try {
      const p = JSON.parse(localStorage.getItem("profile"));
      return p?.profile?.profileId || p?.profileId || p?.id;
    } catch (e) {
      return null;
    }
  }, [profileId]);

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
      console.error("AdSpendByTypeWidget error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveProfileId, date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const breakdown = data?.breakdown || {};
  const spSpend = Number(breakdown?.SP?.spend || 0);
  const sbSpend = Number(breakdown?.SB?.spend || 0);
  const sdSpend = Number(breakdown?.SD?.spend || 0);
  const totalSpend = spSpend + sbSpend + sdSpend;

  const spPct = totalSpend > 0 ? ((spSpend / totalSpend) * 100).toFixed(1) : "0.0";
  const sbPct = totalSpend > 0 ? ((sbSpend / totalSpend) * 100).toFixed(1) : "0.0";
  const sdPct = totalSpend > 0 ? ((sdSpend / totalSpend) * 100).toFixed(1) : "0.0";

  const prevRangeText = useMemo(() => {
    if (!data?.previousRange?.prevFromDate || !data?.previousRange?.prevToDate) return "";
    const f = moment(data.previousRange.prevFromDate).format("DD MMM");
    const to = moment(data.previousRange.prevToDate).format("DD MMM, YYYY");
    return `${f} – ${to}`;
  }, [data]);

  const series = totalSpend > 0 ? [spSpend, sbSpend, sdSpend] : [1, 1, 1];
  const chartColors = ["#2374F2", "#8b5cf6", "#f59e0b"];

  const options = {
    chart: {
      type: "donut",
      sparkline: { enabled: false },
      toolbar: { show: false },
      animations: { enabled: true },
    },
    labels: ["Sponsored Products", "Sponsored Brands", "Sponsored Display"],
    colors: chartColors,
    dataLabels: { enabled: false },
    stroke: { width: 2, colors: ["#ffffff"] },
    legend: { show: false }, // Custom legend on right matching reference
    tooltip: {
      y: {
        formatter: (val) => formatCompactCurrency(val, currencyCode, marketplace),
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "74%",
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: "12px",
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              color: "#64748b",
              offsetY: 18,
            },
            value: {
              show: true,
              fontSize: "17px",
              fontFamily: "Inter, sans-serif",
              fontWeight: 700,
              color: "#0f172a",
              offsetY: -14,
              formatter: () => formatCompactCurrency(totalSpend, currencyCode, marketplace),
            },
            total: {
              show: true,
              label: t("Ad Spend"),
              fontSize: "11px",
              fontFamily: "Inter, sans-serif",
              color: "#64748b",
              formatter: () => formatCompactCurrency(totalSpend, currencyCode, marketplace),
            },
          },
        },
      },
    },
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-xs overflow-hidden transition-all h-full flex flex-col justify-between">
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <PieChart className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              {t("Ad Spend by Type")}
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {prevRangeText ? `${t("Comparison to")} ${prevRangeText}` : t("Spend share across ad types")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          title={t("Refresh")}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
        </button>
      </div>

      {/* ── Body: Donut Chart on Left, Legend on Right ────────── */}
      <div className="p-4 flex-1 flex items-center justify-between gap-2">
        {/* Donut Chart */}
        <div className="w-[160px] sm:w-[170px] h-[160px] sm:h-[170px] flex items-center justify-center shrink-0">
          {loading && !totalSpend ? (
            <div className="w-32 h-32 rounded-full border-4 border-slate-100 border-t-blue-500 animate-spin" />
          ) : (
            <ReactApexChart
              options={options}
              series={series}
              type="donut"
              width={170}
              height={170}
            />
          )}
        </div>

        {/* Legend on Right (matching reference image) */}
        <div className="flex-1 space-y-2.5 pl-2">
          {/* SP */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2374F2] shrink-0" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">{t("Sponsored Products")}</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">{spPct}%</span>
          </div>

          {/* SB */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] shrink-0" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">{t("Sponsored Brands")}</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">{sbPct}%</span>
          </div>

          {/* SD */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">{t("Sponsored Display")}</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">{sdPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
