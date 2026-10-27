import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Sparkles, RefreshCw } from "lucide-react";

const DEFAULT_INSIGHTS = [
  {
    type: "scale",
    message: "Increase budget to scale sales for RG-HP68_RD",
    smallMessage: "(ROAS 105.3)",
    asin: "B09V7YZ2RP",
  },
  {
    type: "improve",
    message: "Improve listing quality for ART-SK-32",
    smallMessage: "(High clicks 199, Low CVR 2%)",
    asin: "B08N5WRWNW",
  },
  {
    type: "improve",
    message: "Improve listing quality for RG-HP68_DB",
    smallMessage: "(High clicks 24, Low CVR 0%)",
    asin: "B09V7W9L2F",
  },
  {
    type: "improve",
    message: "Improve listing quality for 82-C654-N7AI",
    smallMessage: "(High clicks 58, Low CVR 1.7%)",
    asin: "B09R2CQF7P",
  },
  {
    type: "scale",
    message: "Increase budget to scale sales for ART-SK-28",
    smallMessage: "(ROAS 4)",
    asin: "B08N5X9P7L",
  },
];

export default function SmartInsightsWidget({
  insightsData = [],
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onRefresh,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedIdx, setSelectedIdx] = useState(null);

  // Use real data from API; if empty array, display empty state
  const items = Array.isArray(insightsData) ? insightsData : [];

  React.useEffect(() => {
    const handleProfileChange = () => {
      if (onRefresh) onRefresh();
    };
    window.addEventListener("profileChanged", handleProfileChange);
    return () => window.removeEventListener("profileChanged", handleProfileChange);
  }, [onRefresh]);

  const renderBadge = (type) => {
    const isScale = type?.toLowerCase() === "scale";
    if (isScale) {
      return (
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-lg shadow-xs"
          style={{ backgroundColor: "#DDF5EB" }}
        >
          <span role="img" aria-label="rocket">🚀</span>
        </div>
      );
    }

    return (
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-lg shadow-xs"
        style={{ backgroundColor: "#FDF1DC" }}
      >
        <span role="img" aria-label="alert">⚠️</span>
      </div>
    );
  };

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40 && hasMore && !loadingMore && onLoadMore) {
      onLoadMore();
    }
  };

  return (
    <div className="dg-root rounded-2xl overflow-hidden flex flex-col h-[380px] min-h-[380px] max-h-[380px] transition-all">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
            {t("Smart Insights")}
          </h3>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title={t("Refresh Smart Insights")}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
          </button>
        )}
      </div>

      {/* List Content */}
      <div onScroll={handleScroll} className="p-3 sm:p-3.5 overflow-y-auto dash-custom-scrollbar flex-1 min-h-0 space-y-2">
        {loading && !items.length ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl animate-pulse">
              <div className="w-10 h-10 rounded-2xl bg-slate-200 dark:bg-slate-800 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-4/5" />
                <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/3" />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-slate-400 flex flex-col items-center justify-center">
            <span className="mb-1 text-base">✨</span>
            <span>{t("No insights available right now")}</span>
          </div>
        ) : (
          items.map((item, idx) => {
            const isSelected = selectedIdx === idx;
            return (
              <div
                key={idx}
                onClick={() => {
                  setSelectedIdx(idx);
                  if (item?.asin) {
                    navigate(`/product-list?search=${btoa(item.asin)}`);
                  }
                }}
                className={`flex items-start gap-3 p-2.5 rounded-2xl cursor-pointer transition-all ${
                  isSelected
                    ? "border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-xs"
                    : "border border-transparent hover:border-slate-200 dark:hover:border-white/10 hover:bg-slate-50/80 dark:hover:bg-white/[0.02]"
                }`}
              >
                {renderBadge(item.type)}
                <div className="flex-1 min-w-0 flex flex-col pt-0.5">
                  <strong
                    className="text-[14px] font-bold text-slate-900 dark:text-slate-100 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2"
                    title={item.message}
                  >
                    {t(item.message)}
                  </strong>
                  {item.smallMessage && (
                    <span className="text-[13px] font-medium text-slate-400 dark:text-slate-500 mt-1">
                      {t(item.smallMessage)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        {loadingMore && (
          <div className="flex items-center justify-center py-2 text-xs text-slate-400 gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2374F2]" />
            <span>{t("Loading more insights...")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
