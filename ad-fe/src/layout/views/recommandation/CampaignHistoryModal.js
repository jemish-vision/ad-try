import { BID_TO_BID, BidAcosRange } from "../History/bidAcos";
import React, { useEffect, useState, useCallback, useMemo, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { ApiHistory } from "../../../api-wrapper/campaign/ApiCampaign";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { getNormalizedTargetingType } from "../../../utility/targetingUtils";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import moment from "moment-timezone";
import { Popover, PopoverTrigger, PopoverContent } from "../../../components/ui/popover";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import AgTable from "../../../common/grid/AgTable";
import {
  FiClock,
  FiRefreshCw,
  FiUser,
  FiSearch,
  FiChevronDown,
} from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import openCampaignViewInNewTab from "../../../utility/campaignNavigation";
import { formatAmazonChangeType, getStatusBadgeProps } from "../../../utility/targetingUtils";

const STORAGE_KEY_PERIOD = "recommendation_history_acos_period";
const STORAGE_KEY_CUSTOM_DAYS = "recommendation_history_acos_custom_days";

const isAdGroupLevelChange = (row) => {
  if (!row) return false;
  const rawType = (row.changeType || "").toLowerCase();
  return Boolean(
    row.targeting ||
    row.adGroupId ||
    row.adGroupName ||
    row.adGroupDetails?.name ||
    rawType.includes("targeting") ||
    rawType.includes("keyword") ||
    rawType.includes("adgroup") ||
    rawType.includes("ad group")
  );
};

const TYPE_OPTIONS = [
  { value: "All", label: "All Types" },
  { value: "Campaign", label: "Budget" },
  { value: "Targeting", label: "Bid" },
  { value: "Placement", label: "Bid Adjustment" },
  { value: "Status", label: "Status" },
];

const SOURCE_OPTIONS = [
  { value: "All", label: "All Sources" },
  { value: "Dayparting", label: "Dayparting" },
  { value: "Rule", label: "Rule" },
  { value: "Manual", label: "Manual" },
  { value: "Recommendation", label: "Recommendation" },
  { value: "Amazon API", label: "Amazon API" },
];

const CampaignHistoryModal = ({
  show,
  setShow,
  campaignId,
  campaignName,
  profileId: propProfileId,
  adType = "SP",
  gridName,
  targeting: propTargeting,
  matchType: propMatchType,
  placement: propPlacement,
  ruleName,
  actions,
  recommendationData,
  initialHistoryScope,
  latestCreatedAt,
}) => {
  const { t } = useTranslation();
  const contextProfile = useContext(ProfileContext);

  // Robust profile ID extraction across all possible context/prop shapes
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
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // ACOS Lookback Period states
  const [acosPeriod, setAcosPeriod] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PERIOD);
      if (saved && ["7", "14", "30", "custom_days", BID_TO_BID].includes(saved)) {
        return saved;
      }
    } catch (e) {
      // ignore
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
      // ignore
    }
    return 7;
  });

  const acosPeriodRef = useRef(acosPeriod);
  const customDaysRef = useRef(customDays);

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

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedSource, setSelectedSource] = useState("All");
  const INDIVIDUAL_SCOPES = useMemo(() => ["recommendation", "dayparting", "other"], []);

  const [selectedScopes, setSelectedScopes] = useState(() => {
    if (initialHistoryScope === "all") {
      return ["all", "recommendation", "dayparting", "other"];
    }
    if (Array.isArray(initialHistoryScope)) {
      return initialHistoryScope;
    }
    if (initialHistoryScope) {
      return [initialHistoryScope];
    }
    return ["all", "recommendation", "dayparting", "other"];
  });

  const effectiveTargeting = useMemo(
    () => propTargeting || (gridName === "Search Term" ? recommendationData?.searchTerm : null),
    [propTargeting, gridName, recommendationData?.searchTerm]
  );
  const isAutoTarget = useMemo(() => {
    const t = String(effectiveTargeting || "").toLowerCase().trim();
    const m = String(propMatchType || recommendationData?.matchType || recommendationData?.targetType || "").toUpperCase().trim();
    if (getNormalizedTargetingType(m, t)?.isAuto) return true;
    return (
      m === "TARGETING_EXPRESSION_PREDEFINED" ||
      m === "PREDEFINED" ||
      m.includes("AUTO") ||
      t === "(_targeting_auto_)" ||
      ["close-match", "loose-match", "complements", "substitutes", "similar-product"].includes(t)
    );
  }, [effectiveTargeting, propMatchType, recommendationData]);

  const effectiveMatchType = useMemo(() => {
    if (isAutoTarget) return null;
    return propMatchType || recommendationData?.matchType || recommendationData?.targetType || null;
  }, [isAutoTarget, propMatchType, recommendationData?.matchType, recommendationData?.targetType]);
  const effectiveTargetId = useMemo(
    () => recommendationData?.targetId || recommendationData?._id?.targetId || null,
    [recommendationData?.targetId, recommendationData?._id?.targetId]
  );
  // Targeting filter is always active in the background when targeting is present
  const filterTargetOnly = Boolean(effectiveTargeting);

  const scopeOptions = useMemo(() => [
    { value: "all", label: t("All History") },
    { value: "recommendation", label: t("Recommendation History") },
    { value: "dayparting", label: t("Dayparting History") },
    { value: "other", label: t("Other History") },
  ], [t]);

  const toggleScope = (scopeVal) => {
    setPage(1);
    setSelectedSource("All");
    setSelectedScopes((prev) => {
      if (scopeVal === "all") {
        if (prev.includes("all")) {
          return [];
        } else {
          return ["all", ...INDIVIDUAL_SCOPES];
        }
      }

      const isSelected = prev.includes(scopeVal);
      let next;
      if (isSelected) {
        next = prev.filter((s) => s !== scopeVal && s !== "all");
      } else {
        const withoutAll = prev.filter((s) => s !== "all");
        next = [...withoutAll, scopeVal];
        if (INDIVIDUAL_SCOPES.every((s) => next.includes(s))) {
          next.push("all");
        }
      }
      return next;
    });
  };

  const availableSourceOptions = useMemo(() => {
    const isAll = selectedScopes.includes("all") || INDIVIDUAL_SCOPES.every((s) => selectedScopes.includes(s)) || selectedScopes.length === 0;
    if (isAll || selectedScopes.length > 1) {
      return SOURCE_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }));
    }
    if (selectedScopes.includes("other")) {
      return [
        { value: "All", label: t("All Sources") },
        { value: "Rule", label: t("Rule") },
        { value: "Manual", label: t("Manual") },
        { value: "Amazon API", label: t("Amazon API") },
      ];
    }
    if (selectedScopes.includes("dayparting")) {
      return [{ value: "All", label: t("Dayparting") }];
    }
    if (selectedScopes.includes("recommendation")) {
      return [{ value: "All", label: t("Recommendation") }];
    }
    return SOURCE_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }));
  }, [selectedScopes, INDIVIDUAL_SCOPES, t]);

  const isOnlyRecommendation = selectedScopes.length === 1 && selectedScopes.includes("recommendation");
  const isOnlyDayparting = selectedScopes.length === 1 && selectedScopes.includes("dayparting");

  const gridRef = useRef(null);
  const gridApiRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleResize = () => {
      if (gridApiRef.current && typeof gridApiRef.current.sizeColumnsToFit === "function") {
        gridApiRef.current.sizeColumnsToFit();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const historyRequest = useRef(0);

  const fetchHistory = useCallback(async (overridePeriod, overrideDays) => {
    if (!campaignId) return;
    const request = ++historyRequest.current;
    setLoading(true);
    try {
      let apiType = selectedType !== "All" ? selectedType : undefined;
      let apiTargeting = undefined;
      let apiMatchType = undefined;
      let apiTargetId = undefined;
      let apiPlacement = undefined;
      let apiChangeType = undefined;
      let apiSearchName = debouncedSearch || undefined;

      if (filterTargetOnly && effectiveTargeting) {
        apiTargeting = effectiveTargeting;
        if (!isAutoTarget && effectiveMatchType) {
          apiMatchType = effectiveMatchType;
        }
        if (effectiveTargetId) {
          apiTargetId = effectiveTargetId;
        }
      }
      if (gridName === "Placement" && propPlacement) {
        apiPlacement = propPlacement;
        apiSearchName = apiSearchName || propPlacement;
      }
      if (gridName === "Campaign" && selectedType === "All") {
        apiType = "Campaign";
      }

      const isAllScope =
        selectedScopes.includes("all") ||
        INDIVIDUAL_SCOPES.every((s) => selectedScopes.includes(s)) ||
        selectedScopes.length === 0;
      const apiHistoryScope = isAllScope ? "all" : selectedScopes.filter((s) => s !== "all");

      const activePeriod = overridePeriod !== undefined ? overridePeriod : acosPeriodRef.current;
      const activeDays = overrideDays !== undefined ? overrideDays : customDaysRef.current;
      const lookbackDays =
        activePeriod === "custom_days"
          ? Math.max(1, Number(activeDays) || 7)
          : Number(activePeriod) || 7;

      const payload = {
        profileId,
        campaignId,
        adType: adType || "SP",
        pageNo: page,
        perPage: perPage,
        searchName: apiSearchName,
        type: apiType,
        targetId: apiTargetId,
        targeting: apiTargeting,
        matchType: apiMatchType,
        placement: apiPlacement,
        changeType: apiChangeType,
        historyScope: apiHistoryScope,
        source: selectedSource !== "All" ? selectedSource : undefined,
        acosLookbackMode: activePeriod === BID_TO_BID ? "7" : activePeriod,
        oldAcosMode: activePeriod === BID_TO_BID ? BID_TO_BID : undefined,
        acosLookbackDays: lookbackDays,
      };

      const res = await ApiHistory(payload);
      if (request !== historyRequest.current) return;
      if (res?.isSuccess) {
        setHistoryList(res?.data || []);
        setDailyStats(Array.isArray(res?.dailyStats) ? res.dailyStats : null);
        if (res?.timezone) {
          setProfileTimezone(res.timezone);
        }
        setTotalRecords(res?.totalRecords || 0);
        setTotalPages(res?.totalPages || Math.ceil((res?.totalRecords || 0) / perPage) || 1);
      } else {
        setHistoryList([]);
        setDailyStats(null);
        setTotalRecords(0);
        setTotalPages(1);
      }
    } catch (err) {
      if (request !== historyRequest.current) return;
      console.error("Failed to fetch campaign history:", err);
      setHistoryList([]);
      setDailyStats(null);
      setTotalRecords(0);
      setTotalPages(1);
    } finally {
      if (request === historyRequest.current) setLoading(false);
    }
  }, [
    profileId,
    campaignId,
    adType,
    page,
    perPage,
    debouncedSearch,
    selectedType,
    selectedSource,
    selectedScopes,
    INDIVIDUAL_SCOPES,
    filterTargetOnly,
    gridName,
    effectiveTargeting,
    effectiveMatchType,
    effectiveTargetId,
    propPlacement,
  ]);

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
      const src = String(doc.source || doc.triggerSource || doc.updatedFrom || "").toUpperCase();
      if (src.includes("RECOMMENDATION")) return 5;
      if (src.includes("DAYPARTING")) return 4;
      if (src.includes("RULE")) return 3;
      if (src.includes("MANUAL") || doc.updatedBy || doc.userId) return 2;
      return 1;
    };

    const deduped = [];
    for (const doc of historyList) {
      const cId = String(doc.changeLevel || doc.campaignId || doc?.campaignDetails?.campaignId || "");
      const tId = doc.targetId ? String(doc.targetId).replace(/^[TK]-/, "").trim() : "";
      const target = doc.targeting ? String(doc.targeting).toLowerCase().trim() : "";
      const cType = normalizeChangeType(doc.changeType);
      const oldV = normalizeVal(doc.oldValue !== undefined ? doc.oldValue : doc.previousValue);
      const newV = normalizeVal(doc.newValue !== undefined ? doc.newValue : doc.updatedValue);

      const existingIdx = deduped.findIndex((ex) => {
        const exCId = String(ex.changeLevel || ex.campaignId || ex?.campaignDetails?.campaignId || "");
        const exTId = ex.targetId ? String(ex.targetId).replace(/^[TK]-/, "").trim() : "";
        const exTarget = ex.targeting ? String(ex.targeting).toLowerCase().trim() : "";
        const exCType = normalizeChangeType(ex.changeType);
        const exOldV = normalizeVal(ex.oldValue !== undefined ? ex.oldValue : ex.previousValue);
        const exNewV = normalizeVal(ex.newValue !== undefined ? ex.newValue : ex.updatedValue);

        const sameCamp = !cId || !exCId || exCId === cId;
        const sameTarget =
          (tId && exTId && tId === exTId) ||
          (target && exTarget && target === exTarget) ||
          (!target && !exTarget && !tId && !exTId);
        const sameType = exCType === cType;
        if ((doc.statusHistoryEvent || ex.statusHistoryEvent) && +new Date(doc.createdAt) !== +new Date(ex.createdAt)) return false;
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
  }, [historyList]);

  // Recalculate Old Bid ACOS in memory whenever lookback days change (0ms latency)
  const computedHistoryList = useMemo(() => {
    if (acosPeriod === BID_TO_BID) return historyList;
    if (!deduplicatedHistoryList.length) return [];
    if (!Array.isArray(dailyStats) || !dailyStats.length) return deduplicatedHistoryList;

    const lookbackNum =
      acosPeriod === "custom_days"
        ? Math.max(1, Number(customDays) || 7)
        : Number(acosPeriod) || 7;

    const tz = profileTimezone || "UTC";
    const todayStr = moment().tz(tz).format("YYYY-MM-DD");

    return deduplicatedHistoryList.map((item) => {
      const changeDateStr = item.createdAt
        ? moment(item.createdAt).tz(tz).format("YYYY-MM-DD")
        : todayStr;
      let endDate = changeDateStr;
      let startDate = moment(changeDateStr).subtract(lookbackNum, "days").format("YYYY-MM-DD");

      if (moment(startDate).isAfter(moment(endDate))) {
        const temp = startDate;
        startDate = endDate;
        endDate = temp;
      }

      const itemTargetText = item.targeting ? String(item.targeting).trim().toLowerCase() : "";
      const itemTargetId = item.targetId ? String(item.targetId).replace(/^[TK]-/, "") : "";
      const itemCampaignId = String(item.changeLevel || "");

      let totalSpend = 0;
      let totalSales = 0;

      for (let i = 0; i < dailyStats.length; i++) {
        const stat = dailyStats[i];
        if (stat?.reportDate && stat.reportDate >= startDate && stat.reportDate <= endDate) {
          if (itemTargetText || itemTargetId) {
            const statText = stat.targeting ? String(stat.targeting).trim().toLowerCase() : "";
            const statId = stat.targetId ? String(stat.targetId).replace(/^[TK]-/, "") : "";
            if (itemTargetId && statId) {
              if (statId === itemTargetId) {
                totalSpend += Number(stat.spend) || 0;
                totalSales += Number(stat.sales) || 0;
              }
            } else if (itemTargetText && statText === itemTargetText) {
              totalSpend += Number(stat.spend) || 0;
              totalSales += Number(stat.sales) || 0;
            }
          } else if (stat.campaignId && String(stat.campaignId) === itemCampaignId) {
            totalSpend += Number(stat.spend) || 0;
            totalSales += Number(stat.sales) || 0;
          }
        }
      }

      const calculatedAcos = totalSales > 0 ? Number(((totalSpend / totalSales) * 100).toFixed(2)) : 0;

      return {
        ...item,
        oldAcos: calculatedAcos,
        spend: Number(totalSpend.toFixed(2)),
        sales: Number(totalSales.toFixed(2)),
        dateRange: { startDate, endDate },
      };
    });
  }, [historyList, dailyStats, acosPeriod, customDays, profileTimezone]);

  const handleAcosPeriodChange = (val) => {
    acosPeriodRef.current = val;
    setAcosPeriod(val);
    if (val === BID_TO_BID || acosPeriod === BID_TO_BID || (!Array.isArray(dailyStats) && val !== "custom_days")) {
      fetchHistory(val, customDays);
    }
  };

  // 1. Reset state ONLY when the modal opens or closes, or when campaignId/gridName changes
  useEffect(() => {
    if (show) {
      const initScopes = initialHistoryScope === "all"
        ? ["all", "recommendation", "dayparting", "other"]
        : Array.isArray(initialHistoryScope)
        ? initialHistoryScope
        : initialHistoryScope
        ? [initialHistoryScope]
        : ["all", "recommendation", "dayparting", "other"];
      setSelectedScopes(initScopes);
      setPage(1);
      setSearchQuery("");
      setDebouncedSearch("");
      setSelectedType("All");
      setSelectedSource("All");
    } else {
      setHistoryList([]);
      setDailyStats(null);
      setTotalRecords(0);
      setTotalPages(1);
      setPage(1);
      setSearchQuery("");
      setDebouncedSearch("");
      setSelectedType("All");
      setSelectedSource("All");
    }
  }, [show, campaignId, gridName, effectiveTargeting, initialHistoryScope]);

  // 2. Fetch history whenever query parameters change while modal is open
  useEffect(() => {
    if (show) {
      fetchHistory();
    }
  }, [show, fetchHistory]);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "—";
    const m = moment(dateStr);
    return m.isValid() ? m.format("DD/MM/YYYY, hh:mm A") : dateStr;
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

  const startRecord = totalRecords === 0 ? 0 : (page - 1) * perPage + 1;
  const endRecord = Math.min(page * perPage, totalRecords);

  const gridHeight = useMemo(() => {
    if (loading) return "220px";
    const count = computedHistoryList.length;
    if (count === 0) return "220px";
    // Horizontal overflow takes space from the row viewport.
    const calculated = 48 + count * 48 + 2 + 16;
    return `min(${calculated}px, 52vh)`;
  }, [computedHistoryList.length, loading]);

  const columns = useMemo(() => [
    {
      headerName: t("Date & Time"),
      field: "createdAt",
      colId: "createdAt",
      lockPosition: "left",
      minWidth: 150,
      width: 165,
      flex: 1.1,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const formattedDate = moment(item.createdAt).format("DD/MM/YYYY hh:mm:ss A");
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
      minWidth: 190,
      flex: 1.5,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const rowCampaignName = item?.campaignDetails?.name || item?.campaignName || campaignName || "";
        const rowCampaignId = item?.campaignDetails?.campaignId || item?.campaignId || item?.changeLevel || campaignId;
        const rawAdGroupName = item?.adGroupDetails?.name || item?.adGroupName || recommendationData?.adGroupName || "";
        const rawAdGroupId = item?.adGroupId || item?.adGroupDetails?.adGroupId || recommendationData?.adGroupId;
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
      minWidth: 180,
      flex: 1.2,
      sortable: false,
      resizable: true,
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
      minWidth: 80,
      width: 90,
      flex: 0.7,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        if (item.oldValue !== undefined && item.oldValue !== null && item.oldValue !== "" && item.oldValue !== "—") {
          const badgeProps = getStatusBadgeProps(item.oldValue);
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
              <span className="text-rose-600 dark:text-rose-400 font-semibold text-[12px] truncate" title={formatValue(item.oldValue)}>
                {formatValue(item.oldValue)}
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
      minWidth: 80,
      width: 90,
      flex: 0.7,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        if (item.newValue !== undefined && item.newValue !== null && item.newValue !== "" && item.newValue !== "—") {
          const badgeProps = getStatusBadgeProps(item.newValue);
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
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[12px] truncate" title={formatValue(item.newValue)}>
                {formatValue(item.newValue)}
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
      minWidth: 125,
      width: 135,
      flex: 1.0,
      sortable: false,
      resizable: true,
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
      minWidth: 125,
      width: 135,
      flex: 1.0,
      sortable: false,
      resizable: true,
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
      minWidth: 110,
      width: 120,
      flex: 0.8,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const item = params.data;
        if (!item) return null;
        const user = item.updatedBy || "System";
        return (
          <div className="flex items-center h-full">
            <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <FiUser size={12} className="opacity-60 text-slate-400 flex-shrink-0" />
              <span className="truncate max-w-[140px]" title={user}>
                {user}
              </span>
            </div>
          </div>
        );
      },
    },
  ], [t, campaignName, campaignId, recommendationData, acosPeriod]);

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent
        hideCloseButton={true}
        style={{ zIndex: 100050 }}
        className="max-w-[1260px] w-[95vw] max-h-[86vh] p-0 gap-0 overflow-hidden border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xl bg-white dark:bg-[#0b1329] text-slate-800 dark:text-slate-100 z-[100050] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Modal Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 flex-shrink-0">
          <div className="flex items-center justify-between">
            {/* Left: Icon + Title + Badges */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0 shadow-sm border border-sky-500/20">
                <FiClock size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
                    {t("Change History")}
                  </DialogTitle>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {campaignName && (
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[480px]" title={campaignName}>
                      {campaignName}
                    </span>
                  )}
                  {campaignId && (
                    <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      ID: {campaignId}
                    </span>
                  )}
                  {effectiveTargeting && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded">
                      {t("Targeting")}: {effectiveTargeting}
                    </span>
                  )}
                  {effectiveMatchType && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                      {t("Target Type")}: {effectiveMatchType}
                    </span>
                  )}
                  {gridName === "Placement" && propPlacement && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                      {t("Placement")}: {propPlacement}
                    </span>
                  )}
                  {gridName === "Campaign" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                      {t("Scope")}: {t("Campaign")}
                    </span>
                  )}
                  {ruleName && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium truncate max-w-[280px]" title={ruleName}>
                      • {ruleName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Refresh & Close Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
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

        {/* Filter Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          {/* Left: Search bar */}
          <div className="relative flex-1 min-w-[200px] max-w-[280px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <Input
              type="text"
              placeholder={t("Search targeting or change...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <MdOutlineClose size={14} />
              </button>
            )}
          </div>

          {/* Right: History Scope Multi-Select, Type, Source, and Lookback Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* History Scope Multi-Select Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("History")}:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 px-3 text-xs font-semibold rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-700/60 text-sky-700 dark:text-sky-300 cursor-pointer flex items-center justify-between gap-2 min-w-[150px] max-w-[220px] hover:bg-sky-100/60 dark:hover:bg-sky-900/40 transition-colors shadow-sm"
                  >
                    <span className="truncate">
                      {selectedScopes.includes("all") || INDIVIDUAL_SCOPES.every((s) => selectedScopes.includes(s))
                        ? t("All History")
                        : selectedScopes.length === 0
                        ? t("Select History")
                        : selectedScopes.length === 1
                        ? scopeOptions.find((o) => o.value === selectedScopes[0])?.label || t("History")
                        : t("{{count}} Selected", { count: selectedScopes.filter((s) => s !== "all").length })}
                    </span>
                    <FiChevronDown size={14} className="shrink-0 opacity-70" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl z-[100060]">
                  <div className="space-y-0.5">
                    {/* All History option */}
                    <div
                      onClick={() => toggleScope("all")}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        selectedScopes.includes("all") || INDIVIDUAL_SCOPES.every((s) => selectedScopes.includes(s))
                          ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{t("All History")}</span>
                      <StyledCheckbox
                        checked={selectedScopes.includes("all") || INDIVIDUAL_SCOPES.every((s) => selectedScopes.includes(s))}
                        onChange={() => toggleScope("all")}
                      />
                    </div>
                    <div className="h-px bg-slate-200 dark:bg-slate-800 my-1" />
                    {/* Individual scopes */}
                    {INDIVIDUAL_SCOPES.map((scopeVal) => {
                      const opt = scopeOptions.find((o) => o.value === scopeVal);
                      const isChecked = selectedScopes.includes(scopeVal);
                      return (
                        <div
                          key={scopeVal}
                          onClick={() => toggleScope(scopeVal)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-sky-50/50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-300"
                              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <span>{opt?.label}</span>
                          <StyledCheckbox
                            checked={isChecked}
                            onChange={() => toggleScope(scopeVal)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("Type")}:</span>
              <Select
                value={selectedType}
                onValueChange={(val) => {
                  setSelectedType(val);
                  setPage(1);
                }}
                disabled={isOnlyRecommendation && Boolean(gridName)}
              >
                <SelectTrigger className="w-[125px] h-9 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-sm">
                  <SelectValue>
                    {t(TYPE_OPTIONS.find((opt) => opt.value === selectedType)?.label || selectedType)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[100060]">
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs font-medium cursor-pointer">
                      {t(opt.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("Triggered From")}:</span>
              <Select
                value={selectedSource}
                onValueChange={(val) => {
                  setSelectedSource(val);
                  setPage(1);
                }}
                disabled={isOnlyDayparting || isOnlyRecommendation}
              >
                <SelectTrigger className="w-[135px] h-9 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-sm">
                  <SelectValue>
                    {availableSourceOptions.find((opt) => opt.value === selectedSource)?.label || selectedSource}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[100060]">
                  {availableSourceOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs font-medium cursor-pointer">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ACOS Lookback Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("Old ACOS")}:</span>
              <div style={{ width: "135px" }}>
                <Select value={acosPeriod} onValueChange={handleAcosPeriodChange}>
                  <SelectTrigger className="w-[135px] h-9 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-sm">
                    <SelectValue placeholder={t("Last 7 Days")} />
                  </SelectTrigger>
                  <SelectContent className="z-[100060] min-w-[135px]">
                    <SelectItem value="7" className="text-xs font-medium cursor-pointer">
                      {t("Last 7 Days")}
                    </SelectItem>
                    <SelectItem value="14" className="text-xs font-medium cursor-pointer">
                      {t("Last 14 Days")}
                    </SelectItem>
                    <SelectItem value="30" className="text-xs font-medium cursor-pointer">
                      {t("Last 30 Days")}
                    </SelectItem>
                    <SelectItem value={BID_TO_BID} className="text-xs font-medium cursor-pointer">
                      {t("Bid-to-Bid")}
                    </SelectItem>
                    <SelectItem value="custom_days" className="text-xs font-medium cursor-pointer">
                      {t("Custom Days")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {acosPeriod === "custom_days" && (
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 h-9 shadow-sm">
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
          </div>
        </div>

        {/* Content Body / AgTable */}
        <div className="overflow-hidden px-5 pt-2 pb-3 w-full max-w-full flex flex-col min-h-0">
          <div
            className="data_table flex flex-col min-h-0 [&_.glass-grid-container]:!rounded-xl [&_.iq-ag-table]:!rounded-t-xl [&_.ag-root-wrapper]:!rounded-t-xl [&_.iq-pagination]:!rounded-b-xl [&_.iq-pagination]:!flex-shrink-0"
            id="campaign-history-modal-grid-wrapper"
          >
            <AgTable
              ref={gridRef}
              tableId="campaign-history-modal-grid"
              height={gridHeight}
              minHeight={computedHistoryList.length === 0 || loading ? "220px" : "auto"}
              rowHeight={48}
              rowData={computedHistoryList}
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
              loading={loading}
              onRefresh={() => fetchHistory(acosPeriod, customDays)}
              defaultColDef={{ resizable: true, suppressSizeToFit: false, sortable: false }}
              onGridReady={(params) => {
                gridApiRef.current = params?.api;
                setTimeout(() => {
                  if (params?.api && typeof params.api.sizeColumnsToFit === "function") {
                    params.api.sizeColumnsToFit();
                  }
                }, 100);
              }}
              onFirstDataRendered={(params) => {
                params?.api?.sizeColumnsToFit?.();
              }}
              onRowDataUpdated={(params) => {
                params?.api?.sizeColumnsToFit?.();
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignHistoryModal;
