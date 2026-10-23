import React, { useContext } from 'react';
import { useTranslation } from "react-i18next";
import ReactApexChart from "react-apexcharts";
import CurrencyFormat from "../../../../../helper/currencyCode/CurrencyFormat";
import { getCurrencySymbol } from "../../../../../helper/currencyCode/CurrencyCode";
import { ProfileContext } from "../../../../../helper/usecontext/useContext";
import { Benchmarks, Hu } from "./calculatorLogic";

export default function WizardCharts({ type, metrics, formData, isDark }) {
  const { t } = useTranslation();
  const { currencyCode } = useContext(ProfileContext);
  const sym = getCurrencySymbol(currencyCode);


  if (type === 'breakdown') {
    const sp = formData?.sellingPrice || 999;

    const items = [
      { label: t("Your product cost"), value: metrics.breakdown.productCost, color: "bg-slate-500", dot: "text-slate-500" },
      { label: t("Packaging"), value: metrics.breakdown.packaging, color: "bg-slate-400", dot: "text-slate-400" },
      { label: t("Amazon referral (7.0%)"), value: metrics.breakdown.referralFee, color: "bg-red-500", dot: "text-red-500" },
      { label: t("Closing fee"), value: metrics.breakdown.closingFee, color: "bg-orange-500", dot: "text-orange-500" },
      { label: t("Shipping"), value: metrics.breakdown.shippingFee, color: "bg-yellow-400", dot: "text-yellow-400" },
      { label: t("FBA pick & pack"), value: metrics.breakdown.fbaPickPack, color: "bg-fuchsia-500", dot: "text-fuchsia-500" },
      { label: t("FBA storage"), value: metrics.breakdown.fbaStorage, color: "bg-pink-400", dot: "text-pink-400" },
      { label: t("GST on Amazon fees"), value: metrics.breakdown.gstOnFees, color: "bg-red-600", dot: "text-red-600" },
      { label: t("Marketing / ads"), value: metrics.breakdown.marketing, color: "bg-purple-500", dot: "text-purple-500" },
      { label: t("Return loss"), value: metrics.breakdown.returnLoss, color: "bg-indigo-500", dot: "text-indigo-500" },
      { label: t("Net profit kept"), value: metrics.breakdown.netProfitKept, color: "bg-emerald-500", dot: "text-emerald-500" },
    ];

    const hexColors = {
      "bg-slate-500": "#64748b",
      "bg-slate-400": "#94a3b8",
      "bg-red-500": "#ef4444",
      "bg-orange-500": "#f97316",
      "bg-yellow-400": "#facc15",
      "bg-fuchsia-500": "#d946ef",
      "bg-pink-400": "#f472b6",
      "bg-purple-500": "#a855f7",
      "bg-blue-600": "#2563eb",
      "bg-emerald-500": "#10b981"
    };

    const validItems = items.filter(item => item.value > 0);
    const totalValue = sp > 0 ? sp : 1; // avoid division by zero

    const series = validItems.map(item => item.value);
    const labels = validItems.map(item => item.label);
    const colors = validItems.map(item => hexColors[item.color] || "#cbd5e1");

    const apexOptions = {
      chart: {
        type: 'donut',
        background: 'transparent',
        toolbar: { show: false },
        animations: { enabled: true, dynamicAnimation: { speed: 400 } }
      },
      colors: colors,
      labels: labels,
      stroke: { show: false, width: 0 },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: {
        padding: { top: 0, bottom: 0, left: 0, right: 0 }
      },
      states: {
        hover: { filter: { type: 'darken', value: 0.9 } },
        active: { filter: { type: 'none' } }
      },
      plotOptions: {
        pie: {
          expandOnClick: false,
          donut: {
            size: '58%',
            labels: {
              show: true,
              name: {
                show: true,
                fontSize: '11px',
                fontWeight: 700,
                color: isDark ? '#94a3b8' : '#64748b',
                offsetY: -4,
              },
              value: {
                show: true,
                fontSize: '20px',
                fontWeight: 700,
                color: isDark ? '#f8fafc' : '#0f172a',
                offsetY: 6,
                formatter: function (val) {
                  return sym + CurrencyFormat(val, currencyCode);
                }
              },
              total: {
                show: true,
                showAlways: true,
                label: 'TOTAL',
                fontSize: '11px',
                fontWeight: 700,
                color: isDark ? '#94a3b8' : '#64748b',
                formatter: function (w) {
                  return sym + CurrencyFormat(sp, currencyCode);
                }
              }
            }
          }
        }
      },
      tooltip: {
        theme: isDark ? 'dark' : 'light',
        custom: function({series, seriesIndex, dataPointIndex, w}) {
          const label = w.globals.labels[seriesIndex];
          const val = series[seriesIndex];
          const percent = totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : 0;
          const color = w.globals.colors[seriesIndex];
          
          return `
            <div class="px-4 py-2.5 rounded-xl shadow-lg border relative z-50" style="background: ${isDark ? '#1e293b' : '#ffffff'}; border-color: ${isDark ? '#334155' : '#e2e8f0'}; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${color}"></span>
                <span class="text-[11px] font-bold uppercase tracking-wider" style="color: ${isDark ? '#94a3b8' : '#64748b'}">${label}</span>
              </div>
              <div class="flex items-center justify-between gap-6">
                <span class="font-extrabold text-[15px]" style="color: ${isDark ? '#f8fafc' : '#0f172a'}">${sym}${CurrencyFormat(val, currencyCode)}</span>
                <span class="text-xs font-bold" style="color: ${color}">${percent}%</span>
              </div>
            </div>
          `;
        }
      }
    };

    return (
      <div id="pl-breakdown-chart" className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 shadow-sm h-full flex flex-col">
        <style>{`
          .apexcharts-tooltip {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
        `}</style>
        <div className="flex justify-between items-center mb-8">
          <h3 className="font-bold text-[18px] text-slate-900 dark:text-white">
            {t("Where every ")}{sym}{sp}{t(" goes")}
          </h3>
        </div>

        <div className="flex flex-col 2xl:flex-row items-center gap-8 flex-1">
          {/* Donut Chart */}
          <div className="relative w-[220px] h-[220px] flex-shrink-0 flex items-center justify-center -ml-2 drop-shadow-sm">
            <ReactApexChart options={apexOptions} series={series} type="donut" width="100%" height="100%" />
          </div>

          {/* Legend List */}
          <div className="flex flex-col gap-3 w-full">
            {validItems.map((item, i) => {
              const percent = sp > 0 ? (item.value / sp) * 100 : 0;
              return (
                <div key={i} className="flex items-center justify-between text-[13px]">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-slate-600 dark:text-slate-400 font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-900 dark:text-white">{sym}{CurrencyFormat(item.value, currencyCode)}</span>
                    <span className="text-slate-400 w-12 text-right font-semibold">{CurrencyFormat(percent)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'benchmark') {
    const catKey = formData?.category || 'electronics';
    const benchmark = Benchmarks[catKey] || Benchmarks.other;
    const catName = t(Hu[catKey]?.categoryName || "Electronics");

    const currentMargin = metrics.netMargin;
    const catMedian = benchmark.median;
    const minMargin = benchmark.low;
    const maxMargin = benchmark.high;
    const isAbove = currentMargin >= catMedian;

    const getPercent = (val) => {
      const p = (val - minMargin) / (maxMargin - minMargin);
      return Math.min(Math.max(p, 0), 1) * 100;
    };

    const medianPercent = getPercent(catMedian);
    const currentPercent = getPercent(currentMargin);

    let status = 'on_par';
    if (currentMargin <= catMedian - 1) {
      status = 'below';
    } else if (currentMargin >= catMedian + 1) {
      status = 'above';
    }

    const statusMap = {
      above: {
        pillText: t("Above category median"),
        pillBg: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800",
        pillIcon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
        boxTitle: t("Great! Your margin is above the category median."),
        boxDesc: t("You're in a healthy position to scale profitably."),
        boxBg: "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/50",
        boxIcon: (
          <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0 text-emerald-600 dark:text-emerald-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
        )
      },
      below: {
        pillText: t("Below category median"),
        pillBg: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800",
        pillIcon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" /></svg>,
        boxTitle: t("Warning! Your margin is below the category median."),
        boxDesc: t("Consider optimizing costs or raising prices to reach a sustainable level."),
        boxBg: "bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-800/50",
        boxIcon: (
          <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0 text-red-600 dark:text-red-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
        )
      },
      on_par: {
        pillText: t("On par with category"),
        pillBg: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
        pillIcon: <span className="font-bold text-[14px] leading-none">-</span>,
        boxTitle: t("Your margin is on par with the category median."),
        boxDesc: t("You have a solid baseline. Focus on scaling volume or slight optimizations."),
        boxBg: "bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/50",
        boxIcon: (
          <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0 text-blue-600 dark:text-blue-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
        )
      }
    };

    const currentStatus = statusMap[status];

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm h-full flex flex-col">
        <div className="flex justify-between items-center mb-8">
          <h3 className="font-bold text-[18px] text-slate-900 dark:text-white">
            {t("Your margin vs.")} {catName} {t("benchmark")}
          </h3>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold ${currentStatus.pillBg}`}>
            {currentStatus.pillIcon}
            {currentStatus.pillText}
          </div>
        </div>
        <div id="pl-benchmark" className="bg-white dark:bg-slate-800/40 rounded-xl p-6 border border-slate-200 dark:border-slate-700/60 mb-4 shadow-sm relative pt-10">
          <div className="absolute top-4 left-6 text-[14px] font-bold text-slate-800 dark:text-slate-200">
            {t("Net margin %")}
          </div>

          <div className="relative pt-6 pb-2">
            {/* The Track */}
            <div
              className="h-3 w-full rounded-full overflow-hidden"
              style={{
                background: `linear-gradient(to right, #ef4444 0%, #facc15 ${medianPercent}%, #22c55e 100%)`
              }}
            ></div>

            {/* Category Median Marker */}
            <div className="absolute top-4 bottom-0 w-0.5 bg-slate-300 dark:bg-slate-600 transform -translate-x-1/2" style={{ left: `${medianPercent}%` }}></div>

            {/* You Marker (Thumb) */}
            <div
              className="absolute top-[22px] w-6 h-6 rounded-full bg-blue-600 shadow-md ring-4 ring-white dark:ring-slate-900 transform -translate-x-1/2 -translate-y-1.5 flex items-center justify-center"
              style={{ left: `${currentPercent}%` }}
            >
              <div className="w-2 h-2 rounded-full bg-white"></div>
            </div>

            {/* Labels */}
            <div className="absolute top-12 left-0 text-[12px] font-semibold text-slate-400">Low {minMargin}%</div>
            
            {/* You Label (Fixed in center) */}
            <div 
              className="absolute top-12 left-1/2 transform -translate-x-1/2 text-[13px] font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap"
            >
              You {CurrencyFormat(currentMargin)}%
            </div>

            <div className="absolute top-12 right-0 text-[12px] font-semibold text-slate-400">High {maxMargin}%</div>

          </div>

          <div className="mt-8 text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400">
            Category median: <span className="text-slate-700 dark:text-slate-300">{catMedian}%</span>
          </div>
        </div>

        {/* Insight Box */}
        <div className={`mt-auto rounded-xl p-4 flex gap-3.5 items-start border ${currentStatus.boxBg}`}>
          {currentStatus.boxIcon}
          <div>
            <div className="font-bold text-[14px] text-slate-800 dark:text-slate-200">{currentStatus.boxTitle}</div>
            <div className="text-[13px] mt-1 text-slate-600 dark:text-slate-400">{currentStatus.boxDesc}</div>
          </div>
        </div>

      </div>
    );
  }

  return null;
}
