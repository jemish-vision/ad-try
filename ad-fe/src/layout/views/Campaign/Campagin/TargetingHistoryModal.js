import { BID_TO_BID, BidAcosRange } from "../../History/bidAcos";
import React, { useEffect, useState, useCallback, useContext, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Input } from "../../../../components/ui/input";
import { ApiGetTargetingHistory } from "../../../../api-wrapper/targeting/ApiTargeting";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import {
  FiClock,
  FiRefreshCw,
  FiUser,
  FiSearch,
} from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import moment from "moment-timezone";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import {
  getNormalizedTargetingType,
  formatAmazonChangeType,
  getStatusBadgeProps,
  isAdGroupLevelChange,
} from "../../../../utility/targetingUtils";
import openCampaignViewInNewTab from "../../../../utility/campaignNavigation";
import AgTable from "../../../../common/grid/AgTable";

const STORAGE_KEY_PERIOD = "targeting_bid_history_acos_period";
const STORAGE_KEY_CUSTOM_DAYS = "targeting_bid_history_acos_custom_days";

const TargetingHistoryModal = ({
  show,
  setShow,
  targetId,
  targetText,
  matchType,
  campaignId,
  campaignName,
  adGroupId,
  adGroupName,
  profileId: propProfileId,
  adType = "SP",
  fromDate,
  toDate,
}) => {
  const { t } = useTranslation();
  const contextProfile = useContext(ProfileContext);

  const profileId = useMemo(() => {
    const raw =
      (propProfileId && typeof propProfileId === "object" ? propProfileId.value || propProfileId.profileId : propProfileId) ||
      contextProfile?.profileSendID ||
      contextProfile?.profileValue ||
      (contextProfile?.profileId && typeof contextProfile.profileId === "object" ? contextProfile.profileId.value : contextProfile?.profileId) ||
      (() => {
        try {
          const stored = JSON.parse(localStorage.getItem("profile"));
          return stored?.profile?.profileId || stored?.profileId;
        } catch (e) {
          return null;
        }
      })();
    return raw;
  }, [propProfileId, contextProfile]);

  const [loading, setLoading] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [dailyStats, setDailyStats] = useState(null);
  const [profileTimezone, setProfileTimezone] = useState("UTC");

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [acosPeriod, setAcosPeriod] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PERIOD);
      if (saved && ["7", "14", "30", "custom_days", BID_TO_BID].includes(saved)) {
        return saved;
      }
    } catch (e) {
      // ignore storage errors
    }
    return "7";
  });

  const [customDays, setCustomDays] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY_CUSTOM_DAYS));
      if (!isNaN(saved) && saved >= 1 && saved <= 365) {
        return saved;
      }
    } catch (e) {
      // ignore storage errors
    }
    return 7;
  });

  const gridRef = useRef(null);
  const gridApiRef = useRef(null);
  const acosPeriodRef = useRef(acosPeriod);
  const customDaysRef = useRef(customDays);

  const isAutoTarget = useMemo(() => {
    if (!matchType && !targetText) return false;
    const norm = getNormalizedTargetingType(matchType, targetText);
    if (norm?.isAuto) return true;
    const m = String(matchType || "").toUpperCase();
    const t = String(targetText || "").toLowerCase();
    return (
      m === "TARGETING_EXPRESSION_PREDEFINED" ||
      m === "PREDEFINED" ||
      m.includes("AUTO") ||
      t === "(_targeting_auto_)" ||
      ["close-match", "loose-match", "complements", "substitutes", "similar-product"].includes(t)
    );
  }, [matchType, targetText]);

  useEffect(() => {
    acosPeriodRef.current = acosPeriod;
    try {
      localStorage.setItem(STORAGE_KEY_PERIOD, acosPeriod);
    } catch (e) {
      // ignore
    }
  }, [acosPeriod]);

  useEffect(() => {
    customDaysRef.current = customDays;
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_DAYS, String(customDays));
    } catch (e) {
      // ignore
    }
  }, [customDays]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const historyRequest = useRef(0);

  const fetchHistory = useCallback(
    async (overridePeriod, overrideDays) => {
      if (!targetId && !campaignId) return;
      const activePeriod = overridePeriod !== undefined ? overridePeriod : acosPeriodRef.current;
      const activeDays = overrideDays !== undefined ? overrideDays : customDaysRef.current;
      const lookbackDays =
        activePeriod === "custom_days"
          ? Math.max(1, Number(activeDays) || 7)
          : Number(activePeriod) || 7;

      const request = ++historyRequest.current;
      setLoading(true);
      try {
        const effectiveMatchType = isAutoTarget ? undefined : matchType;
        const payload = {
          profileId,
          campaignId,
          targetId,
          targetText,
          ...(effectiveMatchType ? { matchType: effectiveMatchType } : {}),
          adType,
          fromDate,
          toDate,
          acosLookbackMode: activePeriod === BID_TO_BID ? "7" : activePeriod,
          oldAcosMode: activePeriod === BID_TO_BID ? BID_TO_BID : undefined,
          acosLookbackDays: lookbackDays,
        };
        const res = await ApiGetTargetingHistory(payload);
        if (request !== historyRequest.current) return;
        if (res?.isSuccess) {
          setHistoryList(res?.data || []);
          setDailyStats(Array.isArray(res?.dailyStats) ? res.dailyStats : null);
          if (res?.timezone) {
            setProfileTimezone(res.timezone);
          }
        } else {
          setHistoryList([]);
          setDailyStats(null);
        }
      } catch (err) {
        if (request !== historyRequest.current) return;
        console.error("Failed to fetch targeting history", err);
        setHistoryList([]);
        setDailyStats(null);
      } finally {
        if (request === historyRequest.current) setLoading(false);
      }
    },
    [profileId, campaignId, targetId, targetText, matchType, adType, fromDate, toDate, isAutoTarget]
  );

  useEffect(() => {
    if (show) {
      setPage(1);
      setSearchQuery("");
      setDebouncedSearch("");
      fetchHistory();
    } else {
      setHistoryList([]);
      setDailyStats(null);
      setPage(1);
      setSearchQuery("");
      setDebouncedSearch("");
    }
  }, [show, fetchHistory]);

  const deduplicatedHistoryList = useMemo(() => {
    if (!historyList || historyList.length <= 1) return historyList || [];
    const normalizeVal = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v).trim().replace(/[$%,]/g, "");
      const num = Number(s);
      return !isNaN(num) && s !== "" ? num.toFixed(2) : String(v).trim().toLowerCase();
    };

    const normalizeChangeType = (ct) => {
      if (!ct) return "";
      const s = String(ct).toLowerCase().trim();
      if (s.includes("targeting") && (s.includes("bid") || s.includes("adjust"))) return "targeting_bid";
      if (s.includes("targeting") && s.includes("status")) return "targeting_status";
      if (s.includes("budget")) return "budget";
      if (s.includes("placement")) return "placement";
      if (s.includes("status") || s.includes("state")) return "status";
      return s;
    };

    const getSourcePriority = (doc) => {
      const src = String(doc.source || doc.triggerSource || doc.changeSource || "").toUpperCase();
      if (src.includes("RECOMMENDATION")) return 5;
      if (src.includes("DAYPARTING")) return 4;
      if (src.includes("RULE")) return 3;
      if (src.includes("MANUAL") || doc.updatedBy || doc.userId) return 2;
      return 1;
    };

    const deduped = [];
    for (const doc of historyList) {
      const cId = String(doc.changeLevel || doc.campaignId || campaignId || "");
      const tId = doc.targetId ? String(doc.targetId).replace(/^[TK]-/, "").trim() : "";
      const target = (doc.targeting || targetText) ? String(doc.targeting || targetText).toLowerCase().trim() : "";
      const cType = normalizeChangeType(doc.changeType || doc.action);
      const oldV = normalizeVal(
        doc.oldValue !== undefined
          ? doc.oldValue
          : doc.previousValue !== undefined
          ? doc.previousValue
          : doc.oldBid
      );
      const newV = normalizeVal(
        doc.newValue !== undefined
          ? doc.newValue
          : doc.updatedValue !== undefined
          ? doc.updatedValue
          : doc.bidAmount
      );

      const existingIdx = deduped.findIndex((ex) => {
        const exCId = String(ex.changeLevel || ex.campaignId || campaignId || "");
        const exTId = ex.targetId ? String(ex.targetId).replace(/^[TK]-/, "").trim() : "";
        const exTarget = (ex.targeting || targetText) ? String(ex.targeting || targetText).toLowerCase().trim() : "";
        const exCType = normalizeChangeType(ex.changeType || ex.action);
        const exOldV = normalizeVal(
          ex.oldValue !== undefined
            ? ex.oldValue
            : ex.previousValue !== undefined
            ? ex.previousValue
            : ex.oldBid
        );
        const exNewV = normalizeVal(
          ex.newValue !== undefined
            ? ex.newValue
            : ex.updatedValue !== undefined
            ? ex.updatedValue
            : ex.bidAmount
        );

        const sameCamp = !cId || !exCId || exCId === cId;
        const sameTarget =
          (tId && exTId && tId === exTId) ||
          (target && exTarget && target === exTarget) ||
          (!target && !exTarget && !tId && !exTId);
        const sameType = exCType === cType;
        const sameChange = exOldV === oldV && exNewV === newV;

        if (!sameCamp || !sameTarget || !sameType || !sameChange) return false;

        const t1 = new Date(ex.createdAt || ex.lastChangeDate || 0).getTime();
        const t2 = new Date(doc.createdAt || doc.lastChangeDate || 0).getTime();
        if (!isNaN(t1) && !isNaN(t2)) {
          return Math.abs(t1 - t2) <= 24 * 60 * 60 * 1000;
        }
        return true;
      });

      if (existingIdx >= 0) {
        if (getSourcePriority(doc) > getSourcePriority(deduped[existingIdx])) {
          deduped[existingIdx] = doc;
        }
      } else {
        deduped.push(doc);
      }
    }
    return deduped;
  }, [historyList, campaignId, targetText]);

  // Recalculate Old Bid ACOS in memory whenever lookback days change (0ms latency)
  const computedHistoryList = useMemo(() => {
    if (acosPeriod === BID_TO_BID) return historyList;
    if (!deduplicatedHistoryList.length) return [];
    if (!Array.isArray(dailyStats)) return deduplicatedHistoryList;

    const lookbackNum =
      acosPeriod === "custom_days"
        ? Math.max(1, Number(customDays) || 7)
        : Number(acosPeriod) || 7;

    const tz = profileTimezone || "UTC";
    const todayStr = moment().tz(tz).format("YYYY-MM-DD");

    return deduplicatedHistoryList.map((item) => {
      const changeDateStr = item.lastChangeDate || item.createdAt
        ? moment(item.lastChangeDate || item.createdAt).tz(tz).format("YYYY-MM-DD")
        : todayStr;
      let endDate = changeDateStr;
      let startDate = moment(changeDateStr).subtract(lookbackNum, "days").format("YYYY-MM-DD");

      if (moment(startDate).isAfter(moment(endDate))) {
        const temp = startDate;
        startDate = endDate;
        endDate = temp;
      }

      let totalSpend = 0;
      let totalSales = 0;
      for (let i = 0; i < dailyStats.length; i++) {
        const stat = dailyStats[i];
        if (stat?.reportDate && stat.reportDate >= startDate && stat.reportDate <= endDate) {
          totalSpend += Number(stat.spend) || 0;
          totalSales += Number(stat.sales) || 0;
        }
      }

      const calculatedAcos =
        totalSales > 0 ? Number(((totalSpend / totalSales) * 100).toFixed(2)) : 0;

      const rawOldValue =
        item.oldValue !== undefined && item.oldValue !== null && item.oldValue !== ""
          ? item.oldValue
          : item.previousValue !== undefined && item.previousValue !== null && item.previousValue !== ""
          ? item.previousValue
          : item.oldBid;
      const rawNewValue =
        item.newValue !== undefined && item.newValue !== null && item.newValue !== ""
          ? item.newValue
          : item.updatedValue !== undefined && item.updatedValue !== null && item.updatedValue !== ""
          ? item.updatedValue
          : item.bidAmount;

      return {
        ...item,
        createdAt: item.createdAt || item.lastChangeDate,
        changeLevel: item.changeLevel || item.campaignId || campaignId,
        campaignId: item.campaignId || campaignId,
        campaignName: item.campaignName || campaignName,
        adGroupId: item.adGroupId || adGroupId,
        adGroupName: item.adGroupName || adGroupName,
        targeting: item.targeting || targetText,
        matchType: item.matchType || matchType,
        changeType: item.changeType || item.action || "Update Targeting Bid",
        oldValue: rawOldValue !== undefined && rawOldValue !== null ? rawOldValue : "—",
        newValue: rawNewValue !== undefined && rawNewValue !== null ? rawNewValue : "—",
        triggerSource: item.triggerSource || item.changeSource || item.source,
        updatedBy: item.updatedBy || (item.changeSource === "Manual" ? "User" : "System"),
        oldAcos: calculatedAcos,
        acos: calculatedAcos,
        spend: Number(totalSpend.toFixed(2)),
        sales: Number(totalSales.toFixed(2)),
        acosDateRange: { startDate, endDate },
        dateRange: { startDate, endDate },
      };
    });
  }, [historyList, deduplicatedHistoryList, dailyStats, acosPeriod, customDays, profileTimezone, campaignId, campaignName, adGroupId, adGroupName, targetText, matchType]);

  const filteredHistoryList = useMemo(() => {
    if (!computedHistoryList || !computedHistoryList.length) return [];
    if (!debouncedSearch) return computedHistoryList;
    const q = debouncedSearch.toLowerCase();
    return computedHistoryList.filter((item) => {
      const targetStr = String(item.targeting || "").toLowerCase();
      const changeTypeStr = String(item.changeType || item.action || "").toLowerCase();
      const formattedType = formatAmazonChangeType(item).toLowerCase();
      const sourceStr = String(item.triggerSource || item.source || "").toLowerCase();
      const userStr = String(item.updatedBy || "").toLowerCase();
      const oldValStr = String(item.oldValue || "").toLowerCase();
      const newValStr = String(item.newValue || "").toLowerCase();
      const campStr = String(item.campaignName || campaignName || "").toLowerCase();
      const adGroupStr = String(item.adGroupName || adGroupName || "").toLowerCase();
      return (
        targetStr.includes(q) ||
        changeTypeStr.includes(q) ||
        formattedType.includes(q) ||
        sourceStr.includes(q) ||
        userStr.includes(q) ||
        oldValStr.includes(q) ||
        newValStr.includes(q) ||
        campStr.includes(q) ||
        adGroupStr.includes(q)
      );
    });
  }, [computedHistoryList, debouncedSearch, campaignName, adGroupName]);

  const handleAcosPeriodChange = (val) => {
    acosPeriodRef.current = val;
    setAcosPeriod(val);
    setPage(1);
    if (val === BID_TO_BID || acosPeriod === BID_TO_BID || (!Array.isArray(dailyStats) && val !== "custom_days")) {
      fetchHistory(val, customDays);
    }
  };

  const formatValue = (val) => {
    if (val === undefined || val === null) return "—";
    if (!isNaN(Number(val)) && typeof val !== "boolean") {
      return CurrencyFormat(val);
    }
    return String(val);
  };

  const getSourceBadge = (item) => {
    const rawSource =
      item?.triggerSource ||
      (item?.source === "DAYPARTING"
        ? "Dayparting"
        : item?.source === "RECOMMENDATION"
        ? "Recommendation"
        : item?.source === "AMAZON_SQS" || item?.source === "AMAZON_API"
        ? "Amazon API"
        : item?.source === "RULE"
        ? "Rule"
        : item?.source === "MANUAL"
        ? "Manual"
        : item?.updatedFrom === "Amazon Stream"
        ? "Amazon API"
        : (item?.changeType || "").toLowerCase().includes("dayparting")
        ? "Dayparting"
        : (item?.changeType || "").toLowerCase().match(/^update (targeting bid|camapign budget|campaign budget|placement bid|product pages placement bid|rest of search placement bid|top of search placement bid|targeting status|camapign status|campaign status)$/)
        ? "Recommendation"
        : (item?.changeType || "").toLowerCase().match(/rule|cron/)
        ? "Rule"
        : "Manual");

    if (rawSource === "Dayparting") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/25">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
          {t("Dayparting")}
        </span>
      );
    }
    if (rawSource === "Recommendation") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {t("Recommendation")}
        </span>
      );
    }
    if (rawSource === "Amazon API" || rawSource === "Amazon SQS") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {t("Amazon API")}
        </span>
      );
    }
    if (rawSource === "Rule") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {t("Rule")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        {t("Manual")}
      </span>
    );
  };

  const totalRecords = filteredHistoryList.length;
  const paginatedHistoryList = useMemo(() => {
    if (!filteredHistoryList || !filteredHistoryList.length) return [];
    const start = (page - 1) * perPage;
    return filteredHistoryList.slice(start, start + perPage);
  }, [filteredHistoryList, page, perPage]);

  const gridHeight = useMemo(() => {
    if (loading) return "220px";
    const count = paginatedHistoryList.length;
    if (count === 0) return "220px";
    const calculated = 48 + count * 48 + 2 + 24;
    return `min(${calculated}px, 54vh)`;
  }, [paginatedHistoryList.length, loading]);

  // ── AG-Grid Column Definitions matching Recommendation History Modal ─────────
  const columns = useMemo(() => [
    {
      headerName: t("Date & Time"),
      field: "createdAt",
      colId: "createdAt",
      minWidth: 165,
      width: 175,
      sortable: false,
      resizable: true,
      suppressMenu: true,
      pinned: null,
      lockPinned: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const dateVal = item.createdAt || item.lastChangeDate;
        const formattedDate = moment(dateVal).format("DD/MM/YYYY hh:mm:ss A");
        const dateParts = formattedDate.split(" ");
        const datePart = dateParts[0] || "";
        const timePart = dateParts.slice(1).join(" ") || "";
        return (
          <div className="flex flex-col justify-center h-full leading-tight">
            <div className="flex items-center gap-1 font-semibold text-[12px] text-slate-700 dark:text-slate-200">
              <FiClock size={12} className="opacity-60 text-slate-400 flex-shrink-0" />
              <span>{datePart}</span>
            </div>
            {timePart && (
              <span className="text-[10px] text-slate-400 pl-[16px]">{timePart}</span>
            )}
          </div>
        );
      },
    },
    {
      headerName: t("Change level", "Change level"),
      field: "changeLevel",
      colId: "changeLevel",
      minWidth: 210,
      width: 240,
      sortable: false,
      resizable: true,
      suppressMenu: true,
      pinned: null,
      lockPinned: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const rowCampaignName = item?.campaignDetails?.name || item?.campaignName || campaignName || "";
        const rowCampaignId = item?.campaignDetails?.campaignId || item?.campaignId || item?.changeLevel || campaignId;
        const rawAdGroupName = item?.adGroupDetails?.name || item?.adGroupName || adGroupName || "";
        const rawAdGroupId = item?.adGroupId || item?.adGroupDetails?.adGroupId || adGroupId;
        const isAdGroup = isAdGroupLevelChange(item);

        let primaryAdGroup = "";
        if (rawAdGroupName && rawAdGroupName.toLowerCase() !== rowCampaignName.toLowerCase()) {
          primaryAdGroup = rawAdGroupName;
        } else if (rawAdGroupId && String(rawAdGroupId) !== String(rowCampaignId)) {
          primaryAdGroup = `Ad Group #${rawAdGroupId}`;
        }

        return (
          <div className="flex flex-col justify-center h-full leading-tight min-w-0">
            {isAdGroup && (primaryAdGroup || rowCampaignName) ? (
              <div className="flex flex-col gap-0.5 min-w-0">
                {primaryAdGroup ? (
                  <div className="flex items-center min-w-0 text-[12px] font-semibold">
                    <span className="text-slate-400 dark:text-slate-500 mr-1 flex-shrink-0 font-medium">
                      {t("Ad Group")}:
                    </span>
                    <span
                      className="truncate cursor-pointer text-sky-600 dark:text-[#38bdf8] hover:underline font-semibold"
                      title={primaryAdGroup}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCampaignViewInNewTab(item, rowCampaignName, {
                          campaignId: rowCampaignId,
                          adGroupId: rawAdGroupId,
                          adGroupName: primaryAdGroup,
                        });
                      }}
                    >
                      {primaryAdGroup}
                    </span>
                  </div>
                ) : null}
                {rowCampaignName ? (
                  <div className="flex items-center min-w-0 text-[11px]">
                    <span className="text-slate-400 dark:text-slate-500 mr-1 flex-shrink-0">
                      {t("Campaign")}:
                    </span>
                    <span
                      className="truncate cursor-pointer text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
                      title={rowCampaignName}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCampaignViewInNewTab(item, rowCampaignName, { campaignId: rowCampaignId });
                      }}
                    >
                      {rowCampaignName}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center min-w-0 text-[12px]">
                <span className="text-slate-400 dark:text-slate-500 mr-1 flex-shrink-0 font-medium">
                  {t("Campaign")}:
                </span>
                <span
                  className="truncate cursor-pointer text-sky-600 dark:text-[#38bdf8] hover:underline font-semibold"
                  title={rowCampaignName}
                  onClick={(e) => {
                    e.stopPropagation();
                    openCampaignViewInNewTab(item, rowCampaignName, { campaignId: rowCampaignId });
                  }}
                >
                  {rowCampaignName || "—"}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      headerName: t("Change type", "Change type"),
      field: "changeType",
      colId: "changeType",
      minWidth: 200,
      width: 230,
      sortable: false,
      resizable: true,
      suppressMenu: true,
      pinned: null,
      lockPinned: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const formattedChangeType = formatAmazonChangeType(item);
        return (
          <div className="flex items-center h-full w-full min-w-0">
            <span
              className="truncate text-[12px] font-medium text-slate-800 dark:text-slate-200"
              title={formattedChangeType}
            >
              {formattedChangeType}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("From"),
      field: "oldValue",
      colId: "oldValue",
      minWidth: 85,
      width: 95,
      sortable: false,
      resizable: true,
      suppressMenu: true,
      pinned: null,
      lockPinned: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const val =
          item.oldValue !== undefined && item.oldValue !== null && item.oldValue !== "" && item.oldValue !== "—"
            ? item.oldValue
            : item.previousValue !== undefined && item.previousValue !== null && item.previousValue !== "" && item.previousValue !== "—"
            ? item.previousValue
            : item.oldBid !== undefined && item.oldBid !== null && item.oldBid !== ""
            ? item.oldBid
            : null;
        if (val !== null && val !== undefined && val !== "" && val !== "—") {
          const badgeProps = getStatusBadgeProps(val);
          if (badgeProps) {
            return (
              <div className="flex items-center h-full">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeProps.className}`}>
                  {t(badgeProps.label)}
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center h-full">
              <span className="text-rose-600 dark:text-rose-400 font-semibold text-[12px] truncate" title={formatValue(val)}>
                {formatValue(val)}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center h-full">
            <span className="text-slate-400">—</span>
          </div>
        );
      },
    },
    {
      headerName: t("To"),
      field: "newValue",
      colId: "newValue",
      minWidth: 85,
      width: 95,
      sortable: false,
      resizable: true,
      suppressMenu: true,
      pinned: null,
      lockPinned: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const val =
          item.newValue !== undefined && item.newValue !== null && item.newValue !== "" && item.newValue !== "—"
            ? item.newValue
            : item.updatedValue !== undefined && item.updatedValue !== null && item.updatedValue !== "" && item.updatedValue !== "—"
            ? item.updatedValue
            : item.bidAmount !== undefined && item.bidAmount !== null && item.bidAmount !== ""
            ? item.bidAmount
            : null;
        if (val !== null && val !== undefined && val !== "" && val !== "—") {
          const badgeProps = getStatusBadgeProps(val);
          if (badgeProps) {
            return (
              <div className="flex items-center h-full">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeProps.className}`}>
                  {t(badgeProps.label)}
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center h-full">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[12px] truncate" title={formatValue(val)}>
                {formatValue(val)}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center h-full">
            <span className="text-slate-400">—</span>
          </div>
        );
      },
    },
    {
      headerName: t("Old Bid ACOS"),
      field: "oldAcos",
      colId: "oldAcos",
      minWidth: 130,
      width: 140,
      sortable: false,
      resizable: true,
      suppressMenu: true,
      pinned: null,
      lockPinned: true,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const displayAcos =
          item.oldAcos !== undefined && item.oldAcos !== null
            ? Number(item.oldAcos)
            : (acosPeriod !== BID_TO_BID && item.acos !== undefined && item.acos !== null ? Number(item.acos) : null);

        return (
          <div className="flex flex-col items-center justify-center h-full leading-tight text-center">
            {displayAcos !== null ? (
              <span
                className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-xs border ${
                  displayAcos === 0
                    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    : displayAcos <= 30
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
                    : displayAcos <= 50
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800/60"
                }`}
                title={
                  acosPeriod !== BID_TO_BID && item.dateRange
                    ? `Spend: ${formatValue(item.spend)} | Sales: ${formatValue(item.sales)} (${item.dateRange.startDate} to ${item.dateRange.endDate})`
                    : t("ACOS when old bid was active")
                }
              >
                {displayAcos.toFixed(2)}%
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
            {acosPeriod === BID_TO_BID && <BidAcosRange row={item} />}
          </div>
        );
      },
    },
    {
      headerName: t("Triggered From"),
      field: "triggerSource",
      colId: "triggerSource",
      minWidth: 135,
      width: 145,
      sortable: false,
      resizable: true,
      suppressMenu: true,
      pinned: null,
      lockPinned: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        return (
          <div className="flex items-center h-full">
            {getSourceBadge(item)}
          </div>
        );
      },
    },
    {
      headerName: t("Changed By"),
      field: "updatedBy",
      colId: "updatedBy",
      minWidth: 200,
      width: 220,
      sortable: false,
      resizable: true,
      suppressMenu: true,
      pinned: null,
      lockPinned: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const user = item.updatedBy || "System";
        return (
          <div className="flex items-center h-full">
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
              <FiUser size={13} className="opacity-60 text-slate-400 flex-shrink-0" />
              <span className="truncate max-w-[190px] font-medium" title={user}>
                {user}
              </span>
            </div>
          </div>
        );
      },
    },
  ], [t, campaignName, campaignId, adGroupName, adGroupId, acosPeriod]);

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent
        hideCloseButton={true}
        style={{ zIndex: 100050 }}
        className="max-w-[1260px] w-[95vw] max-h-[88vh] p-0 gap-0 overflow-hidden border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xl bg-white dark:bg-[#0b1329] text-slate-800 dark:text-slate-100 z-[100050] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 flex-shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0 shadow-sm border border-sky-500/20">
                <FiClock size={20} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  {t("Targeting Bid History")}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {targetText && (
                    <span
                      className="font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-2 py-0.5 rounded-md truncate max-w-[260px]"
                      title={targetText}
                    >
                      {targetText}
                    </span>
                  )}
                  {!isAutoTarget && matchType && (
                    <span className="font-semibold text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200/60 dark:border-purple-800/50 px-1.5 py-0.5 rounded">
                      {matchType}
                    </span>
                  )}
                  {targetId && (
                    <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      ID: {String(targetId).replace(/^[TK]-/, "")}
                    </span>
                  )}
                  {campaignName && (
                    <span
                      className="truncate max-w-[280px] text-slate-500 dark:text-slate-400"
                      title={campaignName}
                    >
                      • {campaignName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Search, Old ACOS dropdown, Refresh and Close */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {/* Search bar */}
              <div className="relative min-w-[180px] max-w-[240px]">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <Input
                  type="text"
                  placeholder={t("Search history...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-7 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg shadow-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <MdOutlineClose size={13} />
                  </button>
                )}
              </div>

              {/* Old ACOS lookback */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {t("Old ACOS")}:
                </span>
                <div style={{ width: "145px" }}>
                  <Select value={acosPeriod} onValueChange={handleAcosPeriodChange}>
                    <SelectTrigger className="h-8 w-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                      <SelectValue placeholder={t("Last 7 Days")} />
                    </SelectTrigger>
                    <SelectContent className="z-[100060] min-w-[145px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg">
                      <SelectItem value="7" className="text-xs py-1.5 cursor-pointer">
                        {t("Last 7 Days")}
                      </SelectItem>
                      <SelectItem value="14" className="text-xs py-1.5 cursor-pointer">
                        {t("Last 14 Days")}
                      </SelectItem>
                      <SelectItem value="30" className="text-xs py-1.5 cursor-pointer">
                        {t("Last 30 Days")}
                      </SelectItem>
                      <SelectItem value={BID_TO_BID} className="text-xs py-1.5 cursor-pointer">
                        {t("Bid-to-Bid")}
                      </SelectItem>
                      <SelectItem value="custom_days" className="text-xs py-1.5 cursor-pointer">
                        {t("Custom Days")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {acosPeriod === "custom_days" && (
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 h-8 shadow-sm">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={customDays}
                      onChange={(e) => {
                        const val = Math.min(365, Math.max(1, Number(e.target.value) || 1));
                        setCustomDays(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !Array.isArray(dailyStats)) {
                          fetchHistory(acosPeriod, customDays);
                        }
                      }}
                      onBlur={() => {
                        if (!Array.isArray(dailyStats)) {
                          fetchHistory(acosPeriod, customDays);
                        }
                      }}
                      className="w-11 h-6 text-center text-xs font-bold bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                      title={t("Enter number of lookback days")}
                    />
                    <span className="text-[11px] font-semibold text-slate-400">
                      {t("days")}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchHistory(acosPeriod, customDays)}
                disabled={loading}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer opacity-80 hover:opacity-100 shadow-sm"
                title={t("Refresh History")}
              >
                <FiRefreshCw size={14} className={loading ? "animate-spin text-sky-500" : ""} />
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

        {/* Content Body / AgTable */}
        <div className="overflow-hidden px-5 pt-2 pb-3 w-full max-w-full flex flex-col min-h-0">
          <div
            className="data_table flex flex-col min-h-0 [&_.glass-grid-container]:!rounded-xl [&_.iq-ag-table]:!rounded-t-xl [&_.ag-root-wrapper]:!rounded-t-xl [&_.iq-pagination]:!rounded-b-xl [&_.iq-pagination]:!flex-shrink-0 [&_.ag-cell]:!bg-transparent [&_.ag-row-even]:!bg-white dark:[&_.ag-row-even]:!bg-[#0F172A] [&_.ag-row-odd]:!bg-[#f4f9fd] dark:[&_.ag-row-odd]:!bg-[#111827] [&_.ag-pinned-right-cols-container]:!bg-transparent [&_.ag-pinned-left-cols-container]:!bg-transparent [&_.ag-body-horizontal-scroll]:!opacity-100"
            id="targeting-bid-history-modal-grid-wrapper"
          >
            <AgTable
              ref={gridRef}
              tableId="targeting-bid-history-v2-grid"
              height={gridHeight}
              minHeight={filteredHistoryList.length === 0 || loading ? "220px" : "auto"}
              rowHeight={48}
              rowData={paginatedHistoryList}
              columnDefs={columns}
              totalRecords={totalRecords}
              perPage={perPage}
              currentPage={page}
              onPageChange={(p) => setPage(p)}
              onPerPageChange={(size) => {
                setPerPage(size);
                setPage(1);
              }}
              paginationOptions={[10, 25, 50]}
              isCustomSaveColumns={false}
              enableCustomizeColumns={false}
              alwaysShowHorizontalScroll={true}
              suppressHorizontalScroll={false}
              loading={loading}
              onRefresh={() => fetchHistory(acosPeriod, customDays)}
              defaultColDef={{
                resizable: true,
                sortable: false,
                suppressMenu: true,
                lockPinned: true,
                suppressSizeToFit: true,
              }}
              onGridReady={(params) => {
                gridApiRef.current = params?.api;
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TargetingHistoryModal;