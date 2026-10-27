import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import moment from "moment-timezone";
import { useTranslation } from "react-i18next";
import {
  FiClock,
  FiTrendingUp,
  FiTrendingDown,
  FiActivity,
  FiArrowLeft,
  FiSearch,
  FiDownload,
  FiCheckCircle,
  FiPauseCircle,
  FiLayers,
  FiTag,
  FiExternalLink,
  FiDollarSign,
  FiBarChart2,
} from "react-icons/fi";

import Filter from "../../../helper/filter/Filter";
import Chart from "../../../helper/charts/Chart";
import AgTable from "../../../common/grid/AgTable";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { TargetingTypeBadge } from "../../../utility/targetingUtils";
import {
  ApiTargetingListing,
  ApiTargetingChartListing,
  ApiGetTargetingHistory,
} from "../../../api-wrapper/targeting/ApiTargeting";
import { exportGridToExcel } from "../../../utility/exportExcel";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { Toast, useDispatch, handleLoader } from "../../../helper/links/Link";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "../../../common/constants";
import { openCampaignViewInNewTab } from "../../../utility/campaignNavigation";

export default function TargetingDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { targetId } = useParams();
  const [searchParams] = useSearchParams();

  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const queryCampaignId = searchParams.get("campaignId") || "";
  const queryTargeting = searchParams.get("targeting") || "";
  const queryMatchType = searchParams.get("matchType") || "";
  const queryCampaignName = searchParams.get("campaignName") || "";

  const { profileId, profileSendID, selectedAdType, selectedDate, setSelectedDate } =
    useContext(ProfileContext);
  const activeProfileId = profileId?.value || profileSendID;

  // Date range state
  const [date, setDate] = useState(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
    }
    return [new Date(moment().startOf("month")), new Date()];
  });

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDate((prev) => {
        const newStart = moment(selectedDate[0]).toDate();
        const newEnd = moment(selectedDate[1]).toDate();
        if (prev[0]?.getTime() === newStart.getTime() && prev[1]?.getTime() === newEnd.getTime()) {
          return prev;
        }
        return [newStart, newEnd];
      });
    }
  }, [selectedDate]);

  const onChangeDate = (arr) => {
    if (arr) {
      setDate(arr);
      if (setSelectedDate) setSelectedDate(arr);
    }
  };

  // Targeting details
  const [targetInfo, setTargetInfo] = useState({
    targeting: queryTargeting || "",
    matchType: queryMatchType || "",
    campaignName: queryCampaignName || "",
    campaignId: queryCampaignId || "",
    targetId: targetId || "",
    status: "ENABLED",
    keywordBid: null,
  });

  // KPI and Chart states
  const [totalRow, setTotalRow] = useState({});
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);

  // History states
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeSourceTab, setActiveSourceTab] = useState("All");

  // ACOS Lookback Period states
  const [acosPeriod, setAcosPeriod] = useState("7");
  const [customDays, setCustomDays] = useState(7);
  const [customDateRange, setCustomDateRange] = useState([
    moment().subtract(7, "days").toDate(),
    moment().subtract(1, "days").toDate(),
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [perPage, setPerPage] = useState(firstPageRows);
  const [currentPage, setCurrentPage] = useState(1);
  const historyGridRef = useRef(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch KPI, Chart, and History data
  const fetchData = async () => {
    if (!activeProfileId || !targetId || !date?.length) return;

    const fromDateStr = moment(date[0]).format("YYYY-MM-DD");
    const toDateStr = moment(date[1]).format("YYYY-MM-DD");

    setChartLoading(true);
    setLoadingHistory(true);

    try {
      const cleanId = String(targetId).replace(/^[TK]-/, "").trim();
      const possibleIds = [String(targetId), cleanId, `T-${cleanId}`, `K-${cleanId}`];

      // 1. Fetch scoped KPI totalRow and Targeting details
      const listingPayload = {
        profileId: activeProfileId,
        fromDate: fromDateStr,
        toDate: toDateStr,
        filteredTargetingIds: possibleIds,
        campaignId: targetInfo.campaignId ? [targetInfo.campaignId] : [],
        pageNo: 1,
        perPage: 10,
      };

      const [listingRes, chartRes, historyRes] = await Promise.all([
        ApiTargetingListing(listingPayload, { skipLoader: true }),
        ApiTargetingChartListing(listingPayload),
        ApiGetTargetingHistory({
          profileId: activeProfileId,
          targetId,
          campaignId: targetInfo.campaignId || queryCampaignId,
          adType: selectedAdType || "SP",
          fromDate: fromDateStr,
          toDate: toDateStr,
          acosLookbackMode: acosPeriod,
          acosLookbackDays: acosPeriod === "custom_days" ? customDays : Number(acosPeriod) || 7,
          customAcosFromDate:
            acosPeriod === "custom_range" && customDateRange?.[0]
              ? moment(customDateRange[0]).format("YYYY-MM-DD")
              : undefined,
          customAcosToDate:
            acosPeriod === "custom_range" && customDateRange?.[1]
              ? moment(customDateRange[1]).format("YYYY-MM-DD")
              : undefined,
        }),
      ]);

      // Set KPIs
      if (listingRes?.isSuccess) {
        setTotalRow(listingRes.totalRow || {});
        if (listingRes.getTargeting?.length > 0) {
          const item = listingRes.getTargeting[0];
          setTargetInfo((prev) => ({
            ...prev,
            targeting: item.targeting || prev.targeting,
            matchType: item.matchType || prev.matchType,
            campaignName: item.campaignName || prev.campaignName,
            campaignId: item.campaignId || prev.campaignId,
            status: item.status || prev.status,
            keywordBid: item.keywordBid ?? prev.keywordBid,
          }));
        }
      }

      // Set Chart
      if (chartRes?.isSuccess) {
        setChartData(chartRes.data || []);
      }

      // Set History
      if (historyRes?.isSuccess) {
        setHistoryList(historyRes.data || []);
        if (historyRes.targetInfo) {
          setTargetInfo((prev) => ({
            ...prev,
            targeting: prev.targeting || historyRes.targetInfo.targeting,
            matchType: prev.matchType || historyRes.targetInfo.matchType,
            campaignName: prev.campaignName || historyRes.targetInfo.campaignName,
          }));
        }
      } else {
        setHistoryList([]);
      }
    } catch (err) {
      console.error("[TargetingDetail] Fetch Error:", err);
      Toast.error(t("Something went wrong while loading targeting details"));
    } finally {
      setChartLoading(false);
      setLoadingHistory(false);
    }
  };

  const fetchHistory = async (
    period = acosPeriod,
    days = customDays,
    customRange = customDateRange
  ) => {
    if (!activeProfileId || !targetId) return;

    const fromDateStr = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : undefined;
    const toDateStr = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : undefined;

    setLoadingHistory(true);
    try {
      const payload = {
        profileId: activeProfileId,
        targetId,
        campaignId: targetInfo.campaignId || queryCampaignId,
        adType: selectedAdType || "SP",
        fromDate: fromDateStr,
        toDate: toDateStr,
        acosLookbackMode: period,
        acosLookbackDays: period === "custom_days" ? days : Number(period) || 7,
        customAcosFromDate:
          period === "custom_range" && customRange?.[0]
            ? moment(customRange[0]).format("YYYY-MM-DD")
            : undefined,
        customAcosToDate:
          period === "custom_range" && customRange?.[1]
            ? moment(customRange[1]).format("YYYY-MM-DD")
            : undefined,
      };

      const historyRes = await ApiGetTargetingHistory(payload);
      if (historyRes?.isSuccess) {
        setHistoryList(historyRes.data || []);
        if (historyRes.targetInfo) {
          setTargetInfo((prev) => ({
            ...prev,
            targeting: prev.targeting || historyRes.targetInfo.targeting,
            matchType: prev.matchType || historyRes.targetInfo.matchType,
            campaignName: prev.campaignName || historyRes.targetInfo.campaignName,
          }));
        }
      } else {
        setHistoryList([]);
      }
    } catch (err) {
      console.error("[TargetingDetail] Fetch History Error:", err);
      Toast.error(t("Something went wrong while loading targeting history"));
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAcosPeriodChange = (val) => {
    setAcosPeriod(val);
    if (val !== "custom_days" && val !== "custom_range") {
      fetchHistory(val, customDays, customDateRange);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeProfileId, targetId, date, selectedAdType]);

  // Compute source counts
  const sourceCounts = useMemo(() => {
    const counts = { All: historyList.length, Manual: 0, Rule: 0, Dayparting: 0, Amazon: 0 };
    historyList.forEach((item) => {
      const src = item.changeSource || "Manual";
      if (counts[src] !== undefined) counts[src]++;
      else counts.Manual++;
    });
    return counts;
  }, [historyList]);

  // Filter history rows by tab and search
  const filteredHistory = useMemo(() => {
    let result = [...historyList];

    if (activeSourceTab !== "All") {
      result = result.filter((item) => (item.changeSource || "Manual") === activeSourceTab);
    }

    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase().trim();
      result = result.filter((item) => {
        const targetingStr = String(item.targeting || "").toLowerCase();
        const actionStr = String(item.action || "").toLowerCase();
        const sourceStr = String(item.source || "").toLowerCase();
        const cSourceStr = String(item.changeSource || "").toLowerCase();
        const prevStr = String(item.previousValue || "").toLowerCase();
        const updatedStr = String(item.updatedValue || "").toLowerCase();
        return (
          targetingStr.includes(query) ||
          actionStr.includes(query) ||
          sourceStr.includes(query) ||
          cSourceStr.includes(query) ||
          prevStr.includes(query) ||
          updatedStr.includes(query)
        );
      });
    }

    return result;
  }, [historyList, activeSourceTab, debouncedSearch]);

  // Export history to Excel
  const handleExportHistory = async () => {
    if (!filteredHistory.length) {
      Toast.error(t("No history records available to export"));
      return;
    }
    dispatch(handleLoader(true));
    try {
      await exportGridToExcel(
        filteredHistory,
        historyColumns,
        `targeting_history_${targetInfo.targeting || targetId}.xlsx`
      );
      Toast.success(t("Targeting history exported successfully"));
    } catch (e) {
      console.error(e);
      Toast.error(t("Failed to export targeting history"));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  // Render Change Source Badge
  const renderSourceBadge = (source) => {
    switch (source) {
      case "Manual":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
            Manual
          </span>
        );
      case "Rule":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Rule
          </span>
        );
      case "Dayparting":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Dayparting
          </span>
        );
      case "Amazon":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
            Amazon Stream
          </span>
        );
    }
  };

  // Render Action Badge
  const renderActionBadge = (action) => {
    const actStr = String(action || "").toLowerCase();
    if (actStr.includes("increased") || actStr.includes("boost")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
          <FiTrendingUp className="text-emerald-600 dark:text-emerald-400" size={13} />
          {action}
        </span>
      );
    }
    if (actStr.includes("decreased") || actStr.includes("reduced")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800">
          <FiTrendingDown className="text-blue-600 dark:text-blue-400" size={13} />
          {action}
        </span>
      );
    }
    if (actStr.includes("pause")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800">
          <FiPauseCircle className="text-amber-600 dark:text-amber-400" size={13} />
          {action}
        </span>
      );
    }
    if (actStr.includes("enable")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800">
          <FiCheckCircle className="text-teal-600 dark:text-teal-400" size={13} />
          {action}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
        <FiActivity className="text-slate-500" size={13} />
        {action || "Bid Updated"}
      </span>
    );
  };

  // Datatable Column Definitions
  const historyColumns = useMemo(
    () => [
      {
        headerName: t("Date & Time"),
        field: "lastChangeDate",
        title: "Date & Time",
        minWidth: 180,
        flex: 1.2,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => {
          if (!params.value) return <span className="text-slate-400">—</span>;
          const formatted = moment(params.value).format("DD/MM/YYYY hh:mm:ss A");
          const [datePart, ...timeParts] = formatted.split(" ");
          return (
            <div className="flex flex-col justify-center py-1 leading-tight">
              <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200 text-xs">
                <FiClock size={12} className="text-slate-400" />
                <span>{datePart}</span>
              </div>
              <span className="text-[10px] text-slate-400 pl-4.5">{timeParts.join(" ")}</span>
            </div>
          );
        },
      },
      {
        headerName: t("Targeting Keyword"),
        field: "targeting",
        title: "Targeting Keyword",
        minWidth: 260,
        flex: 2.2,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => {
          const kw = params.value || targetInfo.targeting || "—";
          const matchType = params.data?.matchType || targetInfo.matchType;
          return (
            <div className="flex items-center gap-2 py-1 max-w-full overflow-hidden">
              <span
                className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate"
                title={kw}
              >
                {kw}
              </span>
              <TargetingTypeBadge matchType={matchType} targeting={kw} />
            </div>
          );
        },
      },
      {
        headerName: t("From"),
        field: "previousValue",
        title: "From",
        minWidth: 120,
        flex: 1,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => {
          const val = params.value;
          if (val === null || val === undefined || val === "—") {
            return <span className="text-slate-400 font-mono text-xs">—</span>;
          }
          if (typeof val === "number" || !isNaN(Number(val))) {
            return (
              <span className="font-mono text-xs font-semibold text-rose-600 dark:text-rose-400">
                {CurrencyCode(Number(val))}
              </span>
            );
          }
          return <span className="font-semibold text-xs text-rose-600 dark:text-rose-400">{val}</span>;
        },
      },
      {
        headerName: t("To"),
        field: "updatedValue",
        title: "To",
        minWidth: 150,
        flex: 1.2,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => {
          const val = params.value;
          const oldVal = params.data?.previousValue;
          if (val === null || val === undefined || val === "—") {
            return <span className="text-slate-400 font-mono text-xs">—</span>;
          }
          if (typeof val === "number" || !isNaN(Number(val))) {
            const numVal = Number(val);
            const numOld = Number(oldVal);
            const hasDelta = !isNaN(numOld) && oldVal !== null && oldVal !== "—";
            const delta = hasDelta ? numVal - numOld : null;

            return (
              <div className="flex items-center gap-1.5 py-1">
                <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {CurrencyCode(numVal)}
                </span>
                {delta !== null && delta !== 0 && (
                  <span
                    className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded font-mono tracking-tight border ${
                      delta > 0
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/25 dark:text-emerald-300 dark:border-emerald-500/40"
                        : "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/25 dark:text-rose-300 dark:border-rose-500/40"
                    }`}
                  >
                    {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                  </span>
                )}
              </div>
            );
          }
          return <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">{val}</span>;
        },
      },
      {
        headerName: t("ACOS"),
        field: "acos",
        title: "ACOS",
        minWidth: 140,
        flex: 1.1,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => {
          const val = params.value;
          const range = params.data?.acosDateRange || params.data?.dateRange;
          const spend = params.data?.spend;
          const sales = params.data?.sales;

          const rangeText =
            range?.startDate && range?.endDate
              ? `${moment(range.startDate).format("DD/MM/YYYY")} – ${moment(range.endDate).format("DD/MM/YYYY")}`
              : "";

          if (val === null || val === undefined || val === "—") {
            return <span className="text-slate-400 font-mono text-xs">—</span>;
          }

          const numVal = Number(val);
          if (isNaN(numVal) || (numVal === 0 && (!sales || sales === 0))) {
            return (
              <div
                className="flex flex-col justify-center py-1 leading-tight"
                title={rangeText ? `Period: ${rangeText}\nSpend: ${CurrencyCode(spend || 0)}\nSales: ${CurrencyCode(0)}` : ""}
              >
                <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
                {rangeText && (
                  <span className="text-[10px] text-slate-400 tracking-tight">{rangeText}</span>
                )}
              </div>
            );
          }

          return (
            <div
              className="flex flex-col justify-center py-1 leading-tight"
              title={
                rangeText
                  ? `Period: ${rangeText}\nSpend: ${CurrencyCode(spend || 0)}\nSales: ${CurrencyCode(sales || 0)}`
                  : `Spend: ${CurrencyCode(spend || 0)}\nSales: ${CurrencyCode(sales || 0)}`
              }
            >
              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                {numVal.toFixed(2)}%
              </span>
              {rangeText && (
                <span className="text-[10px] text-slate-400 tracking-tight font-medium">
                  {rangeText}
                </span>
              )}
            </div>
          );
        },
      },
      {
        headerName: t("Change Source"),
        field: "changeSource",
        title: "Change Source",
        minWidth: 160,
        flex: 1.2,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (
          <div className="flex items-center h-full py-1">
            {renderSourceBadge(params.value)}
          </div>
        ),
      },
      {
        headerName: t("Source Detail"),
        field: "source",
        title: "Source Detail",
        minWidth: 240,
        flex: 2.2,
        sortable: true,
        resizable: true,
        cellRenderer: (params) => (
          <div className="flex items-center h-full py-1">
            <span
              className="text-xs text-slate-600 dark:text-slate-300 truncate"
              title={params.value}
            >
              {params.value || "—"}
            </span>
          </div>
        ),
      },
    ],
    [t, targetInfo]
  );

  return (
    <>
      <Filter
        name={"Targeting Detail"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />

      <div className="targeting-detail-container px-4 py-4 min-h-screen">
        <div className="middle_container budget_container max-w-full mx-auto space-y-4">
          {/* 1. Breadcrumb Navigation */}
          <div className="flex items-center justify-between">
            <Breadcrumb
              paths={[
                { label: t("Targeting"), link: "/targeting" },
                { label: targetInfo.targeting || targetId },
              ]}
              onBack={() => navigate("/targeting")}
            />
          </div>

          {/* 2. Target Hero Card (Sticky Box matching Campaign Page) */}
          <div
            id="targeting-detail-hero"
            className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""} p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md shadow-sm flex flex-wrap items-center justify-between gap-4`}
            style={{
              zIndex: 90,
              position: !isMobile ? "sticky" : "relative",
              top: !isMobile ? "0px" : "auto",
              marginBottom: "16px",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner">
                <FiTag size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 m-0">
                    {targetInfo.targeting || `Target #${targetId}`}
                  </h2>
                  <TargetingTypeBadge
                    matchType={targetInfo.matchType}
                    targeting={targetInfo.targeting}
                    full
                  />
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      targetInfo.status === "ENABLED"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        targetInfo.status === "ENABLED" ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                    {targetInfo.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                  {targetInfo.campaignName && (
                    <span className="flex items-center gap-1 font-medium">
                      <FiLayers size={12} className="text-slate-400" />
                      {t("Campaign")}:{" "}
                      <span
                        className="cursor-pointer text-sky-600 dark:text-[#38bdf8] hover:underline font-semibold flex items-center gap-1"
                        title={targetInfo.campaignName}
                        onClick={(e) => {
                          e.stopPropagation();
                          openCampaignViewInNewTab(
                            {
                              campaignId: targetInfo.campaignId || queryCampaignId,
                              name: targetInfo.campaignName,
                            },
                            targetInfo.campaignName,
                            { campaignId: targetInfo.campaignId || queryCampaignId }
                          );
                        }}
                      >
                        {targetInfo.campaignName}
                        <FiExternalLink size={11} className="opacity-70" />
                      </span>
                    </span>
                  )}
                  <span className="font-mono text-slate-400">ID: {targetId}</span>
                  {targetInfo.keywordBid !== null && (
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {t("Current Bid")}:{" "}
                      <span className="font-bold font-mono text-blue-600 dark:text-blue-400">
                        {CurrencyCode(targetInfo.keywordBid)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Date Range Picker */}
            <div id="targeting-detail-date-picker" className="flex items-center gap-2">
              <DateRangePicker
                className="filter_date w-full sm:w-[260px] h-[38px] text-xs font-medium"
                ranges={predefinedRanges}
                value={date}
                onChange={(e) => onChangeDate(e)}
              />
            </div>
          </div>

          {/* 2. KPIs & Chart for this specific targeting */}
          <div className="targeting-metrics-section">
            <Chart
              chartLoading={chartLoading}
              chartData={chartData}
              totalRow={totalRow}
              id={"targeting-detail-chart"}
            />
          </div>

          {/* 3. History Datatable Section */}
          <div className="data_content data_content_btn glass-grid-container rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 shadow-sm overflow-hidden p-0">
            {/* History Section Header */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="m-0 font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FiClock className="text-blue-600 dark:text-blue-400" />
                  {t("Targeting Change History")}
                </h4>
              </div>

              {/* Source Dropdown, Search & Export Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Source Filter Dropdown */}
                <div id="targeting-detail-source-filter" style={{ width: "150px" }}>
                  <Select value={activeSourceTab} onValueChange={(val) => setActiveSourceTab(val)}>
                    <SelectTrigger className="h-9 w-full text-xs font-medium bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <SelectValue placeholder={t("All Sources")} />
                    </SelectTrigger>
                    <SelectContent className="z-[99999] min-w-[150px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg">
                      <SelectItem value="All" className="text-xs py-1.5 cursor-pointer">
                        {t("All Sources")}
                      </SelectItem>
                      <SelectItem value="Manual" className="text-xs py-1.5 cursor-pointer">
                        {t("Manual")}
                      </SelectItem>
                      <SelectItem value="Rule" className="text-xs py-1.5 cursor-pointer">
                        {t("Rules")}
                      </SelectItem>
                      <SelectItem value="Dayparting" className="text-xs py-1.5 cursor-pointer">
                        {t("Dayparting")}
                      </SelectItem>
                      <SelectItem value="Amazon" className="text-xs py-1.5 cursor-pointer">
                        {t("Amazon Stream")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* ACOS Lookback Period Selector */}
                <div id="targeting-detail-acos-period" className="flex items-center gap-1.5 flex-wrap">
                  <div style={{ width: "150px" }}>
                    <Select value={acosPeriod} onValueChange={(val) => handleAcosPeriodChange(val)}>
                      <SelectTrigger className="h-9 w-full text-xs font-medium bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <SelectValue placeholder={t("7 Days ACOS")} />
                      </SelectTrigger>
                      <SelectContent className="z-[99999] min-w-[150px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg">
                        <SelectItem value="7" className="text-xs py-1.5 cursor-pointer">
                          {t("7 Days ACOS")}
                        </SelectItem>
                        <SelectItem value="14" className="text-xs py-1.5 cursor-pointer">
                          {t("14 Days ACOS")}
                        </SelectItem>
                        <SelectItem value="30" className="text-xs py-1.5 cursor-pointer">
                          {t("30 Days ACOS")}
                        </SelectItem>
                        <SelectItem value="custom_days" className="text-xs py-1.5 cursor-pointer">
                          {t("Custom Days")}
                        </SelectItem>
                        <SelectItem value="custom_range" className="text-xs py-1.5 cursor-pointer">
                          {t("Custom Date Range")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {acosPeriod === "custom_days" && (
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-950 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800 h-9 shadow-sm">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={customDays}
                        onChange={(e) => setCustomDays(Math.max(1, Number(e.target.value) || 1))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            fetchHistory(acosPeriod, customDays, customDateRange);
                          }
                        }}
                        onBlur={() => fetchHistory(acosPeriod, customDays, customDateRange)}
                        className="w-12 h-7 text-center text-xs font-bold bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                        title={t("Enter number of lookback days and press Enter")}
                      />
                      <span className="text-[11px] font-semibold text-slate-400">
                        {t("days")}
                      </span>
                    </div>
                  )}

                  {acosPeriod === "custom_range" && (
                    <div style={{ width: "230px" }}>
                      <DateRangePicker
                        className="w-full h-9 text-xs font-medium"
                        ranges={predefinedRanges}
                        value={customDateRange}
                        onChange={(val) => {
                          if (val && val[0] && val[1]) {
                            setCustomDateRange(val);
                            fetchHistory(acosPeriod, customDays, val);
                          }
                        }}
                        placeholder={t("Select Date Range")}
                      />
                    </div>
                  )}
                </div>

                <div id="targeting-detail-search" className="relative flex items-center" style={{ width: "240px", height: "36px" }}>
                  <FiSearch className="absolute left-3 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("Search history...")}
                    className="w-full h-9 pl-9 pr-3 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-slate-100"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 text-xs text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  id="targeting-detail-export"
                  onClick={handleExportHistory}
                  disabled={!filteredHistory.length}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <FiDownload size={13} />
                  {t("Export")}
                </button>
              </div>
            </div>

            {/* Datatable */}
            <div id="targeting-detail-history-grid" className="p-3" style={{ minHeight: "400px" }}>
              <AgTable
                ref={historyGridRef}
                tableId="targeting-detail-history-grid"
                height="520px"
                rowData={filteredHistory}
                columnDefs={historyColumns}
                totalRecords={filteredHistory.length}
                perPage={perPage}
                currentPage={currentPage}
                onPageChange={(page) => setCurrentPage(page)}
                onPerPageChange={(rows) => setPerPage(rows)}
                paginationOptions={paginationRowsPerPageOptions}
                loading={loadingHistory}
                defaultColDef={{ resizable: true, suppressSizeToFit: false }}
                onGridReady={(params) => {
                  setTimeout(() => {
                    if (params?.api && typeof params.api.sizeColumnsToFit === "function") {
                      params.api.sizeColumnsToFit();
                    }
                  }, 120);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
