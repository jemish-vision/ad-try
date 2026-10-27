import React, { useEffect, useState, useCallback, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { ApiGetTargetingHistory } from "../../../../api-wrapper/targeting/ApiTargeting";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import { FiClock, FiRefreshCw } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import moment from "moment-timezone";
import { ProfileContext } from "../../../../helper/usecontext/useContext";

const TargetingHistoryModal = ({
  show,
  setShow,
  targetId,
  targetText,
  campaignId,
  campaignName,
  profileId,
  adType = "SP",
  fromDate,
  toDate,
}) => {
  const { t } = useTranslation();
  const { currencyCode } = useContext(ProfileContext) || {};
  const [loading, setLoading] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const tableContainerRef = useRef(null);

  const fetchHistory = useCallback(async () => {
    if (!targetId && !campaignId) return;
    setLoading(true);
    try {
      const payload = {
        profileId,
        campaignId,
        targetId,
        adType,
        fromDate,
        toDate,
      };
      const res = await ApiGetTargetingHistory(payload);
      if (res?.isSuccess) {
        setHistoryList(res?.data || []);
      } else {
        setHistoryList([]);
      }
    } catch (err) {
      console.error("Failed to fetch targeting history", err);
      setHistoryList([]);
    } finally {
      setLoading(false);
    }
  }, [profileId, campaignId, targetId, adType, fromDate, toDate]);

  useEffect(() => {
    if (show) {
      fetchHistory();
    } else {
      setHistoryList([]);
    }
  }, [show, fetchHistory]);

  // Support Shift + Mouse Scroll for horizontal scrolling
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (e.shiftKey && e.deltaY !== 0) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      } else if (Math.abs(e.deltaX) > 0) {
        el.scrollLeft += e.deltaX;
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [loading, historyList.length, show]);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "—";
    const m = moment(dateStr);
    return m.isValid() ? m.format("DD/MM/YYYY, hh:mm A") : dateStr;
  };

  const formatBid = (val) => {
    if (val === null || val === undefined || isNaN(Number(val))) return "—";
    return CurrencyCode(Number(val));
  };

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent
        hideCloseButton={true}
        className="max-w-[1050px] w-[95vw] p-0 gap-0 overflow-hidden border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xl bg-white dark:bg-[#0f172a] text-slate-800 dark:text-slate-100 z-[1050] flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 shadow-sm border border-blue-500/20">
                <FiClock size={20} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  {t("Targeting Bid History")}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {targetText && (
                    <span className="font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md truncate max-w-[260px]" title={targetText}>
                      {targetText}
                    </span>
                  )}
                  {targetId && (
                    <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      ID: {String(targetId).replace(/^[TK]-/, "")}
                    </span>
                  )}
                  {campaignName && (
                    <span className="truncate max-w-[280px] text-slate-500 dark:text-slate-400" title={campaignName}>
                      • {campaignName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Perfectly aligned Refresh and Close button pair */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={fetchHistory}
                disabled={loading}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer opacity-80 hover:opacity-100 shadow-sm"
                title={t("Refresh History")}
              >
                <FiRefreshCw size={14} className={loading ? "animate-spin text-blue-500" : ""} />
              </button>
              <button
                type="button"
                onClick={() => setShow(false)}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer opacity-80 hover:opacity-100 shadow-sm"
                title={t("Close")}
              >
                <MdOutlineClose size={18} />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="p-6 overflow-hidden flex-1 flex flex-col min-h-0">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("Fetching targeting history...")}
              </p>
            </div>
          ) : historyList.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <FiClock size={24} />
              </div>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t("No Targeting History Found")}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {t("No bid changes or historical snapshots recorded for this target yet.")}
              </p>
            </div>
          ) : (
            <div
              ref={tableContainerRef}
              className="overflow-x-auto overflow-y-auto max-h-[60vh] w-full max-w-full border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm bg-white dark:bg-[#0f172a]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <table className="w-full text-left border-collapse text-xs min-w-[950px]">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 whitespace-nowrap min-w-[190px] bg-slate-50 dark:bg-slate-900">
                      {t("Last Updated Time")}
                    </th>
                    <th className="py-3 px-4 text-center whitespace-nowrap min-w-[120px] bg-slate-50 dark:bg-slate-900">
                      {t("Old Bid")}
                    </th>
                    <th className="py-3 px-4 text-center whitespace-nowrap min-w-[130px] bg-slate-50 dark:bg-slate-900">
                      {t("New Bid")}
                    </th>
                    <th className="py-3 px-4 text-center whitespace-nowrap min-w-[130px] bg-slate-50 dark:bg-slate-900">
                      {t("Old Bid ACOS")}
                    </th>
                    <th className="py-3 px-4 text-left whitespace-nowrap min-w-[340px] bg-slate-50 dark:bg-slate-900">
                      {t("Source / Change Details")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {historyList.map((item, idx) => {
                    const hasChange =
                      item.oldBid !== null &&
                      item.oldBid !== undefined &&
                      Number(item.oldBid) !== Number(item.bidAmount);

                    const isIncrease = hasChange && Number(item.bidAmount) > Number(item.oldBid);
                    const displayAcos =
                      item.oldAcos !== undefined && item.oldAcos !== null
                        ? Number(item.oldAcos)
                        : (item.acos !== undefined && item.acos !== null ? Number(item.acos) : null);

                    return (
                      <tr
                        key={item._id || idx}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Last Updated Date & Time */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-900 dark:text-slate-200">
                          {formatDateTime(item.lastChangeDate)}
                        </td>

                        {/* Old Bid */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap font-medium text-slate-500 dark:text-slate-400">
                          {hasChange ? (
                            <span className="font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {formatBid(item.oldBid)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* New Bid */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {hasChange ? (
                            <span
                              className={`inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-md border ${isIncrease
                                  ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40"
                                  : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/40"
                                }`}
                            >
                              <span>{formatBid(item.bidAmount)}</span>
                              <span className="text-[10px] font-normal">
                                {isIncrease ? "↑" : "↓"}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-block font-semibold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40">
                              {formatBid(item.bidAmount)}
                            </span>
                          )}
                        </td>

                        {/* Old Bid ACOS at time of change */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap font-medium">
                          {displayAcos !== null ? (
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-xs border ${displayAcos === 0
                                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                                  : displayAcos <= 30
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
                                    : displayAcos <= 50
                                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
                                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800/60"
                                }`}
                              title={
                                item.dateRange
                                  ? `Spend: ${formatBid(item.spend)} | Sales: ${formatBid(item.sales)} (${item.dateRange.startDate} to ${item.dateRange.endDate})`
                                  : t("ACOS when old bid was active")
                              }
                            >
                              {displayAcos.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Source / Change Details */}
                        <td className="py-3.5 px-4 text-left whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium border ${
                              item.changeSource === "Dayparting"
                                ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/60"
                                : item.changeSource === "Rule"
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60"
                                : item.changeSource === "Manual"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/60"
                                : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/60"
                            }`}
                            title={item.source || "Amazon Marketing Stream"}
                          >
                            <span>{item.source || "Amazon Marketing Stream"}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TargetingHistoryModal;
