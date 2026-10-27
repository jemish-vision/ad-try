import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Check, LayoutGrid, Sparkles } from "lucide-react";

export default function ProductPerformanceMatrixWidget({
  matrixData,
  loading = false,
  selectedMatrix = [],
  onMatrixClick,
  onClearFilter,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const blocks = [
    {
      key: "scale",
      label: "Scale",
      sub: "High Demand / High Profit",
      icon: "🚀",
      colorClass: "text-emerald-700 dark:text-emerald-400",
      badgeBg: "bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300",
      bgClass: "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40",
      activeRing: "ring-2 ring-emerald-500 shadow-sm border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
      key: "improve",
      label: "Improve",
      sub: "Low Demand / High Profit",
      icon: "💡",
      colorClass: "text-amber-700 dark:text-amber-400",
      badgeBg: "bg-amber-100/80 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300",
      bgClass: "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/40",
      activeRing: "ring-2 ring-amber-500 shadow-sm border-amber-400 bg-amber-50 dark:bg-amber-950/40",
    },
    {
      key: "optimize",
      label: "Optimize",
      sub: "High Demand / Low Profit",
      icon: "⚙️",
      colorClass: "text-blue-700 dark:text-blue-400",
      badgeBg: "bg-blue-100/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300",
      bgClass: "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-800/40",
      activeRing: "ring-2 ring-blue-500 shadow-sm border-blue-400 bg-blue-50 dark:bg-blue-950/40",
    },
    {
      key: "stop",
      label: "Stop",
      sub: "Low Demand / Low Profit",
      icon: "🛑",
      colorClass: "text-rose-700 dark:text-rose-400",
      badgeBg: "bg-rose-100/80 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300",
      bgClass: "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-800/40",
      activeRing: "ring-2 ring-rose-500 shadow-sm border-rose-400 bg-rose-50 dark:bg-rose-950/40",
    },
  ];

  const totalProducts = blocks.reduce((acc, b) => acc + (matrixData ? (matrixData[b.key] || 0) : 0), 0);

  return (
    <div className="dg-root rounded-2xl p-4 sm:p-5 mb-5 transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <LayoutGrid className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
                {t("Product Performance Matrix")}
              </h3>
              {selectedMatrix.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/30">
                    {selectedMatrix.length} {t("filtered")}
                  </span>
                  <button
                    type="button"
                    onClick={onClearFilter}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    ({t("Clear filter")})
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {t("Click any card to filter products below")}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/product-list")}
          className="text-xs font-medium text-slate-500 hover:text-[#2374F2] dark:hover:text-sky-400 inline-flex items-center gap-1 transition-colors ml-auto"
        >
          <span>{t("View all")}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 4-block horizontal interactive strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-3.5">
        {blocks.map((block) => {
          const isActive = selectedMatrix.includes(block.key);
          const count = matrixData ? (matrixData[block.key] ?? 0) : 0;

          return (
            <div
              key={block.key}
              onClick={() => onMatrixClick && onMatrixClick(block.key)}
              className={`rounded-xl border p-3.5 sm:p-4 flex items-center justify-between cursor-pointer transition-all duration-200 relative ${
                block.bgClass
              } ${
                isActive
                  ? block.activeRing
                  : "hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5"
              }`}
              title={isActive ? t("Click to remove filter") : t("Click to filter Top Products")}
            >
              {/* Left Content */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg shadow-xs ${block.badgeBg}`}
                >
                  <span role="img" aria-label={block.label}>
                    {block.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-black uppercase tracking-wider ${block.colorClass}`}>
                      {t(block.label)}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[9px] font-bold">
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[170px]" title={t(block.sub)}>
                    {t(block.sub)}
                  </div>
                </div>
              </div>

              {/* Right Big Count */}
              <div className="shrink-0 pl-2 text-right">
                {loading ? (
                  <div className="h-7 w-10 bg-slate-200/80 dark:bg-slate-700/60 rounded animate-pulse" />
                ) : (
                  <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                    {Number(count).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
