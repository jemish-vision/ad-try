import React, { useEffect, useState, useCallback, useMemo, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { ApiHistory } from "../../../api-wrapper/campaign/ApiCampaign";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import moment from "moment-timezone";
import { Popover, PopoverTrigger, PopoverContent } from "../../../components/ui/popover";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import {
  FiClock,
  FiCalendar,
  FiRefreshCw,
  FiUser,
  FiSearch,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiChevronDown,
} from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import openCampaignViewInNewTab from "../../../utility/campaignNavigation";
import { formatAmazonChangeType } from "../../../utility/targetingUtils";

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
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

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
  const effectiveMatchType = useMemo(
    () => propMatchType || recommendationData?.matchType || recommendationData?.targetType || null,
    [propMatchType, recommendationData?.matchType, recommendationData?.targetType]
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

  const tableContainerRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Support Shift + Mouse Scroll for smooth horizontal scrolling
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (e.shiftKey || Math.abs(e.deltaX) > 0) {
        if (e.deltaY !== 0 && e.shiftKey) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [historyList]);

  const fetchHistory = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      let apiType = selectedType !== "All" ? selectedType : undefined;
      let apiTargeting = undefined;
      let apiMatchType = undefined;
      let apiPlacement = undefined;
      let apiChangeType = undefined;
      let apiSearchName = debouncedSearch || undefined;

      if (filterTargetOnly && effectiveTargeting) {
        apiTargeting = effectiveTargeting;
        if (effectiveMatchType) {
          apiMatchType = effectiveMatchType;
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

      const payload = {
        profileId,
        campaignId,
        adType: adType || "SP",
        pageNo: page,
        perPage: perPage,
        searchName: apiSearchName,
        type: apiType,
        targeting: apiTargeting,
        matchType: apiMatchType,
        placement: apiPlacement,
        changeType: apiChangeType,
        historyScope: apiHistoryScope,
        source: selectedSource !== "All" ? selectedSource : undefined,
      };

      const res = await ApiHistory(payload);
      if (res?.isSuccess) {
        setHistoryList(res?.data || []);
        setTotalRecords(res?.totalRecords || 0);
        setTotalPages(res?.totalPages || Math.ceil((res?.totalRecords || 0) / perPage) || 1);
      } else {
        setHistoryList([]);
        setTotalRecords(0);
        setTotalPages(1);
      }
    } catch (err) {
      console.error("Failed to fetch campaign history:", err);
      setHistoryList([]);
      setTotalRecords(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
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
    propPlacement,
  ]);

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

  const getRelativeDaysText = (dateStr) => {
    if (!dateStr) return "—";
    const dateMoment = moment(dateStr);
    const now = moment();
    const daysDiff = now.diff(dateMoment.clone().startOf("day"), "days");

    if (daysDiff <= 0) {
      return { text: t("Today"), days: 0 };
    } else if (daysDiff === 1) {
      return { text: t("1 day ago"), days: 1 };
    } else {
      return { text: t("{{count}} days ago", { count: daysDiff }), days: daysDiff };
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

  const getChangeCategory = (item) => {
    const rawType = (item?.updatedFrom || "").toLowerCase();
    const rawChange = (item?.changeType || "").toLowerCase();

    if (rawType === "campaign" || rawChange.includes("budget")) {
      return {
        label: t("Budget Change"),
        badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        dotClass: "bg-blue-500",
      };
    }

    if (rawType === "placement" || rawChange.includes("placement") || rawChange.includes("adjustment")) {
      return {
        label: t("Bid Adjustment"),
        badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        dotClass: "bg-purple-500",
      };
    }

    if (rawType === "targeting" || rawChange.includes("bid") || item?.targeting) {
      return {
        label: t("Bid Change"),
        badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        dotClass: "bg-amber-500",
      };
    }

    if (rawChange.includes("state") || rawChange.includes("status") || rawChange.includes("enable") || rawChange.includes("pause")) {
      return {
        label: t("Status Change"),
        badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-500",
      };
    }

    return {
      label: t("Bid Change"),
      badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      dotClass: "bg-amber-500",
    };
  };

  const startRecord = totalRecords === 0 ? 0 : (page - 1) * perPage + 1;
  const endRecord = Math.min(page * perPage, totalRecords);

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent
        hideCloseButton={true}
        style={{ zIndex: 100050 }}
        className="max-w-[1300px] w-[96vw] p-0 gap-0 overflow-hidden border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xl bg-white dark:bg-[#0b1329] text-slate-800 dark:text-slate-100 z-[100050] flex flex-col max-h-[90vh]"
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

            {/* Right: Perfectly aligned Refresh & Close Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={fetchHistory}
                disabled={loading}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer opacity-80 hover:opacity-100"
                title={t("Refresh History")}
              >
                <FiRefreshCw size={14} className={loading ? "animate-spin text-sky-500" : ""} />
              </button>
              <button
                type="button"
                onClick={() => setShow(false)}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer opacity-80 hover:opacity-100"
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
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <Input
              type="text"
              placeholder={t("Search targeting or change...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg"
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

          {/* Right: History Scope Multi-Select, Type & Source Dropdowns */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* History Scope Multi-Select Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("History")}:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 px-3 text-xs font-semibold rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-700/60 text-sky-700 dark:text-sky-300 cursor-pointer flex items-center justify-between gap-2 min-w-[170px] max-w-[240px] hover:bg-sky-100/60 dark:hover:bg-sky-900/40 transition-colors shadow-sm"
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
                <SelectTrigger className="w-[140px] h-9 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer">
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
                <SelectTrigger className="w-[150px] h-9 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer">
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
          </div>
        </div>

        {/* Content Body / Table */}
        <div className="flex-1 overflow-hidden p-6 w-full max-w-full flex flex-col min-h-0">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-9 h-9 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("Fetching campaign history...")}
              </p>
            </div>
          ) : historyList.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400 border border-slate-200 dark:border-slate-700">
                <FiClock size={28} />
              </div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t("No Change History Found")}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                {t("No modifications recorded for this campaign in the selected date range matching your criteria.")}
              </p>
            </div>
          ) : (
            <div
              ref={tableContainerRef}
              className="overflow-x-auto overflow-y-auto max-h-[56vh] w-full max-w-full border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm bg-white dark:bg-[#0b1329]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
                  <tr className="text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[260px] bg-slate-50 dark:bg-slate-900">{t("Change level", "Change level")}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[220px] bg-slate-50 dark:bg-slate-900">{t("Change type", "Change type")}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[120px] bg-slate-50 dark:bg-slate-900">{t("From")}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[120px] bg-slate-50 dark:bg-slate-900">{t("To")}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[140px] bg-slate-50 dark:bg-slate-900">{t("Triggered From")}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[150px] bg-slate-50 dark:bg-slate-900">{t("Changed By")}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px] bg-slate-50 dark:bg-slate-900">{t("Date & Time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {historyList.map((item, idx) => {
                    const rowCampaignName = item?.campaignDetails?.name || item?.campaignName || campaignName || "";
                    const rowCampaignId = item?.campaignDetails?.campaignId || item?.campaignId || item?.changeLevel || campaignId;
                    const rawAdGroupName = item?.adGroupDetails?.name || item?.adGroupName || recommendationData?.adGroupName || "";
                    const rawAdGroupId = item?.adGroupId || item?.adGroupDetails?.adGroupId || recommendationData?.adGroupId;
                    const isAdGroup = isAdGroupLevelChange(item);

                    // Ensure primaryAdGroup only shows the actual ad group name, never falling back to the campaign name
                    let primaryAdGroup = "";
                    if (rawAdGroupName && rawAdGroupName.toLowerCase() !== rowCampaignName.toLowerCase()) {
                      primaryAdGroup = rawAdGroupName;
                    } else if (rawAdGroupId && String(rawAdGroupId) !== String(rowCampaignId)) {
                      primaryAdGroup = `Ad Group #${rawAdGroupId}`;
                    }

                    const formattedChangeType = formatAmazonChangeType(item);

                    const formattedDate = moment(item.createdAt).format("DD/MM/YYYY hh:mm:ss A");
                    const dateParts = formattedDate.split(" ");
                    const datePart = dateParts[0] || "";
                    const timePart = dateParts.slice(1).join(" ") || "";

                    return (
                      <tr
                        key={item._id || idx}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* 1. Change level */}
                        <td className="py-3 px-4 min-w-[260px] max-w-[340px]">
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
                                        adGroupName: primaryAdGroup
                                      });
                                    }}
                                  >
                                    {primaryAdGroup}
                                  </span>
                                </div>
                              ) : null}
                              {rowCampaignName && (
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
                              )}
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
                        </td>

                        {/* 2. Change type */}
                        <td className="py-3 px-4 min-w-[220px] max-w-[320px]">
                          <span
                            className="truncate block text-[12px] font-medium text-slate-800 dark:text-slate-200"
                            title={formattedChangeType}
                          >
                            {formattedChangeType}
                          </span>
                        </td>

                        {/* 3. From */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {item.oldValue !== undefined && item.oldValue !== null ? (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold text-[12px]">
                              {formatValue(item.oldValue)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* 4. To */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {item.newValue !== undefined && item.newValue !== null ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[12px]">
                              {formatValue(item.newValue)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* 5. Triggered From */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {getSourceBadge(item)}
                        </td>

                        {/* 6. Changed By */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <FiUser size={12} className="opacity-60 text-slate-400 flex-shrink-0" />
                            <span className="truncate max-w-[160px]" title={item.updatedBy || "System"}>
                              {item.updatedBy || "System"}
                            </span>
                          </div>
                        </td>

                        {/* 7. Date & Time */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col justify-center leading-tight">
                            <div className="flex items-center gap-1 font-semibold text-[12px] text-slate-700 dark:text-slate-200">
                              <FiClock size={12} className="opacity-60 text-slate-400 flex-shrink-0" />
                              <span>{datePart}</span>
                            </div>
                            {timePart && (
                              <span className="text-[10px] text-slate-400 pl-[16px]">{timePart}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer with Pagination */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 flex-shrink-0 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              {t("Showing")} <strong className="text-slate-900 dark:text-white">{startRecord}</strong>–<strong className="text-slate-900 dark:text-white">{endRecord}</strong> {t("of")} <strong className="text-sky-600 dark:text-sky-400">{totalRecords}</strong>
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] text-slate-500">{t("Rows per page")}:</span>
              <Select
                value={String(perPage)}
                onValueChange={(val) => {
                  setPerPage(Number(val));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[75px] h-7 px-2 text-xs rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer">
                  <SelectValue>{perPage}</SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[100060]">
                  <SelectItem value="10" className="text-xs font-medium cursor-pointer">10</SelectItem>
                  <SelectItem value="25" className="text-xs font-medium cursor-pointer">25</SelectItem>
                  <SelectItem value="50" className="text-xs font-medium cursor-pointer">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span>
              {t("Page")} <strong className="text-slate-900 dark:text-white">{page}</strong> {t("of")} <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                title={t("First page")}
              >
                <FiChevronsLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                title={t("Previous page")}
              >
                <FiChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                title={t("Next page")}
              >
                <FiChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                title={t("Last page")}
              >
                <FiChevronsRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignHistoryModal;
