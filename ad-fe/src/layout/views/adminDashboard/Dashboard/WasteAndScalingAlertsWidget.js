import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import {
  Flame,
  Zap,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { ApiGetWasteAndScalingAlerts } from "../../../../api-wrapper/dashboard/ApiDashboard";
import {
  getCurrencySymbol,
  isIndianMarketplace,
  formatFullRegionalNumber,
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

  const sign = num < 0 ? "-" : "";
  return `${sign}${symbol}${str}`;
}

// Request deduplication cache by key
const wasteDataCache = new Map();
const inflightWasteRequests = new Map();

const getProfileIdString = (p) => {
  if (!p) return null;
  if (typeof p === "string") return p;
  if (typeof p === "object") {
    return p.value || p.profileId || p._id || p.id || null;
  }
  return String(p);
};

const getStoredProfile = () => {
  try {
    const raw = localStorage.getItem("profile");
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p?.profile || p || null;
  } catch (e) {
    return null;
  }
};

export function useWasteAndScalingData({
  profileId,
  adType = "SP",
  date,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const [currentPid, setCurrentPid] = useState(() => getProfileIdString(profileId) || getStoredProfile()?.profileId);
  const [activeMarketplace, setActiveMarketplace] = useState(() => marketplace || getStoredProfile()?.countryCode || "IN");
  const [activeCurrency, setActiveCurrency] = useState(() => currencyCode || getStoredProfile()?.currencyCode || "INR");

  useEffect(() => {
    const normalized = getProfileIdString(profileId);
    if (normalized && normalized !== currentPid) {
      setCurrentPid(normalized);
    }
  }, [profileId]);

  useEffect(() => {
    if (marketplace) setActiveMarketplace(marketplace);
  }, [marketplace]);

  useEffect(() => {
    if (currencyCode) setActiveCurrency(currencyCode);
  }, [currencyCode]);

  useEffect(() => {
    const handleProfileChange = (e) => {
      const prof = e?.detail?.profile;
      if (prof?.profileId && prof.profileId !== currentPid) {
        setCurrentPid(prof.profileId);
      }
      if (prof?.countryCode) {
        setActiveMarketplace(prof.countryCode);
      }
      if (prof?.currencyCode) {
        setActiveCurrency(prof.currencyCode);
      }
    };
    window.addEventListener("profileChanged", handleProfileChange);
    return () => window.removeEventListener("profileChanged", handleProfileChange);
  }, [currentPid]);

  const [data, setData] = useState(() => {
    const pid = currentPid;
    return pid ? (wasteDataCache.get(pid) || null) : null;
  });
  const [loading, setLoading] = useState(!data);

  const { fromDate, toDate } = useMemo(() => {
    if (date && Array.isArray(date) && date.length >= 2) {
      return {
        fromDate: moment(date[0]).format("YYYY-MM-DD"),
        toDate: moment(date[1]).format("YYYY-MM-DD"),
      };
    }
    return {
      fromDate: moment().subtract(21, "days").format("YYYY-MM-DD"),
      toDate: moment().format("YYYY-MM-DD"),
    };
  }, [date]);

  const fetchData = useCallback(async (force = false) => {
    const pid = currentPid || getProfileIdString(profileId) || getStoredProfile()?.profileId;
    if (!pid) return;

    const paramsKey = `${pid}_${adType}_${fromDate}_${toDate}_${activeCurrency}_${activeMarketplace}`;
    if (!force && wasteDataCache.has(paramsKey)) {
      setData(wasteDataCache.get(paramsKey));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let promise = inflightWasteRequests.get(paramsKey);
      if (!promise) {
        promise = ApiGetWasteAndScalingAlerts({
          profileId: pid,
          adType: adType || "SP",
          fromDate,
          toDate,
          currencyCode: activeCurrency,
          marketplace: activeMarketplace,
        }).finally(() => {
          inflightWasteRequests.delete(paramsKey);
        });
        inflightWasteRequests.set(paramsKey, promise);
      }

      const res = await promise;

      if (res?.isSuccess && res?.data) {
        wasteDataCache.set(paramsKey, res.data);
        wasteDataCache.set(pid, res.data);
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error("useWasteAndScalingData error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [currentPid, profileId, adType, fromDate, toDate, activeCurrency, activeMarketplace]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    fetchData(true);
  }, [currentPid, adType, fromDate, toDate, activeCurrency, activeMarketplace]);

  return { data, loading, refetch: () => fetchData(true) };
}

/**
 * Waste Spend Monitor Card (Row 7, Col 1)
 * Columns: SEARCH TERM | SPEND | ORDERS
 * Matching exact reference UI layout
 */
export function WasteSpendWidget({
  profileId,
  adType = "SP",
  date,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading, refetch } = useWasteAndScalingData({
    profileId,
    adType,
    date,
    currencyCode,
    marketplace,
  });

  const wasteSummary = data?.wasteSpend?.summary || { totalWastedSpend: 0 };
  const [extraSearchTerms, setExtraSearchTerms] = useState([]);
  const [zeroOrderPage, setZeroOrderPage] = useState(1);
  const [hasMoreZeroOrders, setHasMoreZeroOrders] = useState(true);
  const [loadingMoreZeroOrders, setLoadingMoreZeroOrders] = useState(false);

  useEffect(() => {
    setExtraSearchTerms([]);
    setZeroOrderPage(1);
    setHasMoreZeroOrders(data?.wasteSpend?.hasMore ?? true);
  }, [data]);

  const searchTerms = useMemo(() => {
    const initial = data?.wasteSpend?.zeroOrderSearchTerms || [];
    return [...initial, ...extraSearchTerms];
  }, [data, extraSearchTerms]);

  const loadMoreZeroOrders = async () => {
    if (loadingMoreZeroOrders || !hasMoreZeroOrders) return;
    const nextPage = zeroOrderPage + 1;
    setLoadingMoreZeroOrders(true);
    try {
      const pid = profileId || getStoredProfile()?.profileId;
      const fDate = date && Array.isArray(date) && date.length >= 2 ? moment(date[0]).format("YYYY-MM-DD") : moment().subtract(21, "days").format("YYYY-MM-DD");
      const tDate = date && Array.isArray(date) && date.length >= 2 ? moment(date[1]).format("YYYY-MM-DD") : moment().format("YYYY-MM-DD");
      const res = await ApiGetWasteAndScalingAlerts({
        profileId: pid,
        adType: adType || "SP",
        fromDate: fDate,
        toDate: tDate,
        currencyCode,
        marketplace,
        zeroOrderPage: nextPage,
        zeroOrderLimit: 15,
      });
      const newItems = res?.data?.wasteSpend?.zeroOrderSearchTerms || [];
      if (newItems.length > 0) {
        setExtraSearchTerms((prev) => [...prev, ...newItems]);
        setZeroOrderPage(nextPage);
      }
      setHasMoreZeroOrders(res?.data?.wasteSpend?.hasMore ?? (newItems.length >= 15));
    } catch (err) {
      console.error("loadMoreZeroOrders error:", err);
    } finally {
      setLoadingMoreZeroOrders(false);
    }
  };

  const handleWasteScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40 && hasMoreZeroOrders && !loadingMoreZeroOrders) {
      loadMoreZeroOrders();
    }
  };

  return (
    <div className="dg-root rounded-2xl overflow-hidden flex flex-col h-[380px] min-h-[380px] max-h-[380px] transition-all">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200/60 dark:border-rose-800/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <Flame className="w-4 h-4" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
            {t("Waste Spend Monitor")}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/search-term")}
            className="text-[13px] font-medium text-slate-500 hover:text-[#2374F2] dark:hover:text-sky-400 inline-flex items-center gap-1 transition-colors"
          >
            <span>{t("View all")}</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            title={t("Refresh")}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table Content: SEARCH TERM | SPEND | ORDERS */}
      <div onScroll={handleWasteScroll} className="p-2 sm:p-2.5 overflow-x-auto flex-1 min-h-0 overflow-y-auto dash-custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
            <tr className="border-b border-slate-100 dark:border-white/5 text-[12px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              <th className="py-2 px-2.5 font-semibold">{t("SEARCH TERM")}</th>
              <th className="py-2 px-2.5 text-right font-semibold">{t("SPEND")}</th>
              <th className="py-2 px-2.5 text-right font-semibold">{t("ORDERS")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
            {loading && !searchTerms.length ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`wst-skel-${i}`} className="animate-pulse">
                  <td className="py-2.5 px-2.5">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-28" />
                  </td>
                  <td className="py-2.5 px-2.5 text-right">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-12 ml-auto" />
                  </td>
                  <td className="py-2.5 px-2.5 text-right">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-8 ml-auto" />
                  </td>
                </tr>
              ))
            ) : searchTerms.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-[13px] text-slate-400">
                  {t("No zero-order wasted spend found")}
                </td>
              </tr>
            ) : (
              <>
                {searchTerms.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"
                  >
                    {/* SEARCH TERM */}
                    <td className="py-2.5 px-2.5 max-w-[160px] sm:max-w-[190px]">
                      <div className="text-[14px] font-medium text-slate-800 dark:text-slate-200 truncate" title={item.searchTerm}>
                        {item.searchTerm}
                      </div>
                    </td>

                    {/* SPEND (Red bold text matching reference) */}
                    <td className="py-2.5 px-2.5 text-right font-bold text-rose-600 dark:text-rose-400 text-[14px] tabular-nums">
                      {formatCompactCurrency(item.spend, currencyCode, marketplace)}
                    </td>

                    {/* ORDERS (0) */}
                    <td className="py-2.5 px-2.5 text-right font-medium text-slate-600 dark:text-slate-300 text-[14px] tabular-nums">
                      0
                    </td>
                  </tr>
                ))}
                {loadingMoreZeroOrders && (
                  <tr>
                    <td colSpan={3} className="py-2.5 text-center text-xs text-slate-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin inline-block mr-1 text-[#2374F2]" />
                      <span>{t("Loading more...")}</span>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Low ROI / Scaling Alerts Card (Row 7, Col 2)
 * Columns: CAMPAIGN | TYPE | POTENTIAL SALES
 * Matching exact reference UI layout
 */
export function ScalingAlertsWidget({
  profileId,
  adType = "SP",
  date,
  currencyCode = "INR",
  marketplace = "IN",
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading, refetch } = useWasteAndScalingData({
    profileId,
    adType,
    date,
    currencyCode,
    marketplace,
  });

  const scalingSummary = data?.scalingAlerts?.summary || { totalEstimatedLostSales: 0 };
  const [extraCampaigns, setExtraCampaigns] = useState([]);
  const [scalingPage, setScalingPage] = useState(1);
  const [hasMoreScaling, setHasMoreScaling] = useState(true);
  const [loadingMoreScaling, setLoadingMoreScaling] = useState(false);

  useEffect(() => {
    setExtraCampaigns([]);
    setScalingPage(1);
    setHasMoreScaling(data?.scalingAlerts?.hasMore ?? true);
  }, [data]);

  const campaigns = useMemo(() => {
    const initial = data?.scalingAlerts?.campaigns || [];
    return [...initial, ...extraCampaigns];
  }, [data, extraCampaigns]);

  const loadMoreScaling = async () => {
    if (loadingMoreScaling || !hasMoreScaling) return;
    const nextPage = scalingPage + 1;
    setLoadingMoreScaling(true);
    try {
      const pid = profileId || getStoredProfile()?.profileId;
      const fDate = date && Array.isArray(date) && date.length >= 2 ? moment(date[0]).format("YYYY-MM-DD") : moment().subtract(21, "days").format("YYYY-MM-DD");
      const tDate = date && Array.isArray(date) && date.length >= 2 ? moment(date[1]).format("YYYY-MM-DD") : moment().format("YYYY-MM-DD");
      const res = await ApiGetWasteAndScalingAlerts({
        profileId: pid,
        adType: adType || "SP",
        fromDate: fDate,
        toDate: tDate,
        currencyCode,
        marketplace,
        scalingPage: nextPage,
        scalingLimit: 15,
      });
      const newItems = res?.data?.scalingAlerts?.campaigns || [];
      if (newItems.length > 0) {
        setExtraCampaigns((prev) => [...prev, ...newItems]);
        setScalingPage(nextPage);
      }
      setHasMoreScaling(res?.data?.scalingAlerts?.hasMore ?? (newItems.length >= 15));
    } catch (err) {
      console.error("loadMoreScaling error:", err);
    } finally {
      setLoadingMoreScaling(false);
    }
  };

  const handleScalingScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40 && hasMoreScaling && !loadingMoreScaling) {
      loadMoreScaling();
    }
  };

  return (
    <div className="dg-root rounded-2xl overflow-hidden flex flex-col h-[380px] min-h-[380px] max-h-[380px] transition-all">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Zap className="w-4 h-4" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
            {t("Low ROI / Scaling Alerts")}
          </h3>
          {scalingSummary.totalEstimatedLostSales > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[13px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30">
              {formatCompactCurrency(scalingSummary.totalEstimatedLostSales, currencyCode, marketplace)} {t("Lost Sales")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/campaigns")}
            className="text-[13px] font-medium text-slate-500 hover:text-[#2374F2] dark:hover:text-sky-400 inline-flex items-center gap-1 transition-colors"
          >
            <span>{t("View all")}</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            title={t("Refresh")}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table Content: CAMPAIGN | TYPE | POTENTIAL SALES */}
      <div onScroll={handleScalingScroll} className="p-2 sm:p-2.5 overflow-x-auto flex-1 min-h-0 overflow-y-auto dash-custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
            <tr className="border-b border-slate-100 dark:border-white/5 text-[12px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              <th className="py-2 px-2.5 font-semibold">{t("CAMPAIGN")}</th>
              <th className="py-2 px-2.5 text-center font-semibold">{t("TYPE")}</th>
              <th className="py-2 px-2.5 text-right font-semibold">{t("POTENTIAL SALES")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
            {loading && !campaigns.length ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sca-skel-${i}`} className="animate-pulse">
                  <td className="py-2.5 px-2.5">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-28" />
                  </td>
                  <td className="py-2.5 px-2.5 text-center">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-12 mx-auto" />
                  </td>
                  <td className="py-2.5 px-2.5 text-right">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-14 ml-auto" />
                  </td>
                </tr>
              ))
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-[13px] text-slate-400">
                  {t("No scaling alert campaigns found")}
                </td>
              </tr>
            ) : (
              <>
                {campaigns.map((camp) => (
                  <tr
                    key={camp.id}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"
                  >
                    {/* CAMPAIGN */}
                    <td className="py-2.5 px-2.5 max-w-[140px] sm:max-w-[170px]">
                      <div className="text-[14px] font-medium text-slate-800 dark:text-slate-200 truncate" title={camp.campaignName}>
                        {camp.campaignName}
                      </div>
                    </td>

                    {/* TYPE (Scale blue pill matching reference) */}
                    <td className="py-2.5 px-2.5 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[12px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
                        {t("Scale")}
                      </span>
                    </td>

                    {/* POTENTIAL SALES (Bold green text matching reference) */}
                    <td className="py-2.5 px-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 text-[14px] tabular-nums">
                      +{formatCompactCurrency(camp.estimatedLostSales, currencyCode, marketplace)}
                    </td>
                  </tr>
                ))}
                {loadingMoreScaling && (
                  <tr>
                    <td colSpan={3} className="py-2.5 text-center text-xs text-slate-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin inline-block mr-1 text-[#2374F2]" />
                      <span>{t("Loading more...")}</span>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Combined default export for backwards compatibility
 */
export default function WasteAndScalingAlertsWidget(props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      <WasteSpendWidget {...props} />
      <ScalingAlertsWidget {...props} />
    </div>
  );
}
