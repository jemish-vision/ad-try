import React, { useState, useEffect, useCallback, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import AgTable from "../../../common/grid/AgTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { ApiGetMfnToFbaRecommendations } from "../../../api-wrapper/inventoryManagement/ApiFcInventory";
import Toast from "../../../common/helper/toast/Toast";

const MfnToFbaRecommendations = ({
  activeProfileId: propProfileId,
  activeConfigId: propConfigId,
  externalDateRange = null,
  isDark = false,
}) => {
  const { t } = useTranslation();
  const { profileId, selectedConfig, storeDara, profileData } = useContext(ProfileContext);

  // Resolve Profile ID
  const resolvedProfileId = useMemo(() => {
    if (propProfileId && !isNaN(Number(propProfileId))) return Number(propProfileId);
    let pId = profileId?.value ?? profileId;
    if (Array.isArray(pId)) pId = pId[0];
    if (pId && typeof pId === "object" && pId.value) pId = pId.value;
    if (pId && !isNaN(Number(pId)) && Number(pId) > 0) return Number(pId);

    const candidates = [
      selectedConfig?.profile?.profileId,
      selectedConfig?.profileId,
      profileData?.profile?.profileId,
      profileData?.profileId,
      storeDara?.profile?.profileId,
      storeDara?.profileId,
    ];
    for (const c of candidates) {
      if (c && !isNaN(Number(c)) && Number(c) > 0) return Number(c);
    }
    try {
      const raw = localStorage.getItem("profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        const p = parsed?.profile?.profileId || parsed?.profileId;
        if (p && !isNaN(Number(p)) && Number(p) > 0) return Number(p);
      }
    } catch (e) {}
    return null;
  }, [propProfileId, profileId, selectedConfig, profileData, storeDara]);

  // Resolve Config ID
  const resolvedConfigId = useMemo(() => {
    if (propConfigId) return String(propConfigId).trim();
    const candidates = [
      selectedConfig?.config?.configId,
      selectedConfig?.config?._id,
      selectedConfig?.configId,
      selectedConfig?._id,
      selectedConfig?.profile?.configId,
      storeDara?.config?.configId,
      storeDara?.config?._id,
      storeDara?.configId,
      storeDara?._id,
      profileData?.configId,
    ];
    for (const c of candidates) {
      if (c && typeof c === "string" && c.trim()) return String(c).trim();
      if (c && typeof c === "object" && c._id) return String(c._id);
    }
    try {
      const raw = localStorage.getItem("profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        const c =
          parsed?.config?.configId ||
          parsed?.config?._id ||
          parsed?.configId ||
          parsed?.profile?.configId ||
          parsed?._id;
        if (c) return String(c).trim();
      }
    } catch (e) {}
    return null;
  }, [propConfigId, selectedConfig, storeDara, profileData]);

  // Filters & Controls
  const [periodDays, setPeriodDays] = useState("30");
  const [sendPercentage, setSendPercentage] = useState("70");
  const [minUnits, setMinUnits] = useState("1");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("MFN");
  const [selectedState, setSelectedState] = useState("ALL");
  const [selectedFc, setSelectedFc] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Pagination & Sorting
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sortBy, setSortBy] = useState("unitsSold");
  const [sortOrder, setSortOrder] = useState("desc");

  // Data State
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [items, setItems] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [summary, setSummary] = useState({
    totalMfnSkus: 0,
    totalStates: 0,
    totalSuggestedFcs: 0,
    totalUnitsSold: 0,
    totalSuggestedQty: 0,
    fcBreakdown: [],
  });
  const [availableStates, setAvailableStates] = useState([]);
  const [availableFcs, setAvailableFcs] = useState([]);
  const [resolvedPeriod, setResolvedPeriod] = useState({ start: null, end: null });

  const fetchRecommendations = useCallback(async () => {
    if (!resolvedProfileId) return;
    setLoading(true);
    try {
      const useCustomDates =
        periodDays === "CUSTOM" &&
        Array.isArray(externalDateRange) &&
        externalDateRange.length >= 2;

      const payload = {
        profileId: resolvedProfileId,
        configId: resolvedConfigId,
        ...(useCustomDates
          ? {
              fromDate: moment(externalDateRange[0]).format("YYYY-MM-DD"),
              toDate: moment(externalDateRange[1]).format("YYYY-MM-DD"),
            }
          : { days: periodDays }),
        sendPercentage: Number(sendPercentage) || 70,
        minUnits: Number(minUnits) || 1,
        fulfillmentFilter,
        state: selectedState,
        fcCode: selectedFc,
        search: debouncedSearch,
        sortBy,
        sortOrder,
        page,
        limit: perPage,
      };

      const res = await ApiGetMfnToFbaRecommendations(payload);
      if (res?.isSuccess && res.data) {
        setItems(res.data.items || []);
        setTotalRecords(res.data.totalRecords || 0);
        setSummary(
          res.data.summary || {
            totalMfnSkus: 0,
            totalStates: 0,
            totalSuggestedFcs: 0,
            totalUnitsSold: 0,
            totalSuggestedQty: 0,
            fcBreakdown: [],
          }
        );
        if (Array.isArray(res.data.availableStates)) {
          setAvailableStates(res.data.availableStates);
        }
        if (Array.isArray(res.data.availableFcs)) {
          setAvailableFcs(res.data.availableFcs);
        }
        setResolvedPeriod({
          start: res.data.periodStart,
          end: res.data.periodEnd,
        });
      }
    } catch (err) {
      console.error("Error fetching MFN to FBA recommendations:", err);
    } finally {
      setLoading(false);
    }
  }, [
    resolvedProfileId,
    resolvedConfigId,
    periodDays,
    externalDateRange,
    sendPercentage,
    minUnits,
    fulfillmentFilter,
    selectedState,
    selectedFc,
    debouncedSearch,
    sortBy,
    sortOrder,
    page,
    perPage,
  ]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Export CSV matching client's Excel columns: MFN SKU, State, Units Sold, Suggested FC, Suggested Qty to Send
  const handleExportCsv = async () => {
    if (!resolvedProfileId) return;
    setExporting(true);
    try {
      const useCustomDates =
        periodDays === "CUSTOM" &&
        Array.isArray(externalDateRange) &&
        externalDateRange.length >= 2;

      const res = await ApiGetMfnToFbaRecommendations({
        profileId: resolvedProfileId,
        configId: resolvedConfigId,
        ...(useCustomDates
          ? {
              fromDate: moment(externalDateRange[0]).format("YYYY-MM-DD"),
              toDate: moment(externalDateRange[1]).format("YYYY-MM-DD"),
            }
          : { days: periodDays }),
        sendPercentage: Number(sendPercentage) || 70,
        minUnits: Number(minUnits) || 1,
        fulfillmentFilter,
        state: selectedState,
        fcCode: selectedFc,
        search: debouncedSearch,
        sortBy,
        sortOrder,
        page: 1,
        limit: "ALL",
      });

      const exportRows = res?.data?.items || items || [];
      if (!exportRows.length) {
        Toast.error("No data available to export.");
        return;
      }

      const escapeCsv = (val) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headers = [
        "MFN SKU",
        "State",
        "Units Sold",
        "Suggested FC",
        "Suggested Qty to Send",
      ];

      const csvLines = [
        headers.join(","),
        ...exportRows.map((row) =>
          [
            escapeCsv(row.sku),
            escapeCsv(row.state),
            escapeCsv(row.unitsSold),
            escapeCsv(row.suggestedFc),
            escapeCsv(row.suggestedQty),
          ].join(",")
        ),
      ];

      const csvContent = "\uFEFF" + csvLines.join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `MFN_to_FBA_Recommendations_${moment().format("YYYY-MM-DD")}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      Toast.success("Exported MFN to FBA Recommendations successfully.");
    } catch (err) {
      console.error("Export error:", err);
      Toast.error("Failed to export recommendations.");
    } finally {
      setExporting(false);
    }
  };

  const handleSortChanged = (e) => {
    const colState = e.api.getColumnState();
    const sorted = colState.find((s) => s.sort !== null);
    if (sorted) {
      setSortBy(sorted.colId);
      setSortOrder(sorted.sort);
      setPage(1);
    } else {
      setSortBy("unitsSold");
      setSortOrder("desc");
      setPage(1);
    }
  };

  const columns = useMemo(
    () => [
      {
        headerName: "MFN SKU",
        field: "sku",
        colId: "sku",
        minWidth: 280,
        flex: 1.8,
        wrapText: true,
        autoHeight: true,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          const img = row.imageUrl || row.imageURL;
          return (
            <div className="flex items-center gap-2.5 py-2 w-full min-w-0">
              {img ? (
                <img
                  src={img}
                  alt=""
                  className="w-9 h-9 rounded-md object-contain shrink-0 border border-slate-200 dark:border-slate-800 bg-white"
                />
              ) : (
                <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center text-slate-400">
                  <i className="fa-solid fa-box text-xs" />
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1 leading-snug">
                <span
                  className="text-[13px] font-bold text-slate-800 dark:text-slate-100 break-words"
                  title={row.sku}
                >
                  {row.sku}
                </span>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400 mt-0.5">
                  {row.asin && (
                    <span>
                      ASIN: <b className="text-slate-600 dark:text-slate-300">{row.asin}</b>
                    </span>
                  )}
                  {row.title && (
                    <span
                      className="truncate max-w-[240px] text-slate-500 dark:text-slate-400"
                      title={row.title}
                    >
                      • {row.title}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        headerName: "State",
        field: "state",
        colId: "state",
        minWidth: 180,
        flex: 1,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center justify-between gap-2 h-full py-1">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-location-dot text-blue-500 text-xs" />
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-[13px]">
                  {row.state}
                </span>
              </div>
              {row.region && row.region !== "Other" && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                  {row.region}
                </span>
              )}
            </div>
          );
        },
      },
      {
        headerName: "Units Sold",
        field: "unitsSold",
        colId: "unitsSold",
        width: 140,
        cellRenderer: (params) => {
          const val = Math.round(Number(params.value || 0));
          return (
            <div className="flex items-center justify-center h-full w-full">
              <span className="font-bold text-[14px] text-slate-800 dark:text-slate-100">
                {val.toLocaleString()}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "Suggested FC",
        field: "suggestedFc",
        colId: "suggestedFc",
        minWidth: 190,
        flex: 1,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center gap-2 h-full py-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                <i className="fa-solid fa-warehouse text-[10px]" />
                {row.suggestedFc}
              </span>
              {row.fcCity && (
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {row.fcCity}
                </span>
              )}
            </div>
          );
        },
      },
      {
        headerName: "Suggested Qty to Send",
        field: "suggestedQty",
        colId: "suggestedQty",
        width: 190,
        cellRenderer: (params) => {
          const val = Math.round(Number(params.value || 0));
          return (
            <div className="flex items-center justify-center h-full w-full">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[13px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                <i className="fa-solid fa-truck-fast text-[11px]" />
                {val.toLocaleString()}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "Existing FC Stock",
        field: "currentFcStock",
        colId: "currentFcStock",
        width: 150,
        cellRenderer: (params) => {
          const val = Math.round(Number(params.value || 0));
          return (
            <div className="flex items-center justify-center h-full w-full">
              <span
                className={`text-xs font-semibold ${
                  val > 0
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {val.toLocaleString()}
              </span>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      {/* ── KPI Summary Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-lg shrink-0">
            <i className="fa-solid fa-boxes-packing" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">MFN SKUs Analyzed</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {(summary.totalMfnSkus || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {totalRecords.toLocaleString()} SKU × State pairs
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 text-lg shrink-0">
            <i className="fa-solid fa-map-location-dot" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">High-Demand States</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {(summary.totalStates || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Mapped to {summary.totalSuggestedFcs || 0} Target FBA FCs
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 text-lg shrink-0">
            <i className="fa-solid fa-cart-shopping" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Total MFN Units Sold</div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {(summary.totalUnitsSold || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {resolvedPeriod.start && resolvedPeriod.end
                ? `${moment(resolvedPeriod.start).format("MMM D")} – ${moment(
                    resolvedPeriod.end
                  ).format("MMM D, YYYY")}`
                : "Across selected period"}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-lg shrink-0">
            <i className="fa-solid fa-truck-fast" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Total Suggested Qty to Send</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {(summary.totalSuggestedQty || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              At {sendPercentage}% allocation ratio
            </div>
          </div>
        </div>
      </div>

      {/* ── Target FC Breakdown Strip ────────────────────────────────────── */}
      {summary.fcBreakdown?.length > 0 && (
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <i className="fa-solid fa-warehouse text-blue-500" />
              Recommended FBA Fulfillment Centers by Regional Demand
            </h3>
            {selectedFc !== "ALL" && (
              <button
                type="button"
                onClick={() => {
                  setSelectedFc("ALL");
                  setPage(1);
                }}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear FC Filter ({selectedFc})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {summary.fcBreakdown.map((fc) => {
              const isSelected = selectedFc === fc.fcCode;
              return (
                <div
                  key={fc.fcCode}
                  onClick={() => {
                    setSelectedFc(isSelected ? "ALL" : fc.fcCode);
                    setPage(1);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/50 shadow-sm"
                      : "border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {fc.fcCode}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold">
                      Send {fc.totalSuggestedQty.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate"
                    title={fc.states?.join(", ")}
                  >
                    {fc.states?.join(", ") || fc.fcCity}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-0.5 border-t border-slate-200/50 dark:border-slate-700/50">
                    <span>{fc.skuCount} SKUs</span>
                    <span>{fc.totalUnitsSold.toLocaleString()} sold</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filters & Action Bar ─────────────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Period Filter */}
            <div className="w-40">
              <Select
                value={periodDays}
                onValueChange={(val) => {
                  setPeriodDays(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Sales Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">Last 15 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="60">Last 60 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                  <SelectItem value="ALL">All Time</SelectItem>
                  {Array.isArray(externalDateRange) && externalDateRange.length >= 2 && (
                    <SelectItem value="CUSTOM">Selected Date Range</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* State Filter */}
            <div className="w-44">
              <Select
                value={selectedState}
                onValueChange={(val) => {
                  setSelectedState(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All States</SelectItem>
                  {availableStates.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Suggested FC Filter */}
            <div className="w-40">
              <Select
                value={selectedFc}
                onValueChange={(val) => {
                  setSelectedFc(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Suggested FCs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Suggested FCs</SelectItem>
                  {availableFcs.map((fc) => (
                    <SelectItem key={fc} value={fc}>
                      FC: {fc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Minimum Units Sold Filter */}
            <div className="w-40">
              <Select
                value={minUnits}
                onValueChange={(val) => {
                  setMinUnits(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Min Units Sold" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Min Units: 1+</SelectItem>
                  <SelectItem value="2">Min Units: 2+</SelectItem>
                  <SelectItem value="3">Min Units: 3+</SelectItem>
                  <SelectItem value="4">Min Units: 4+ (High Demand)</SelectItem>
                  <SelectItem value="5">Min Units: 5+</SelectItem>
                  <SelectItem value="10">Min Units: 10+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Suggested Send % Ratio */}
            <div className="w-40">
              <Select
                value={sendPercentage}
                onValueChange={(val) => {
                  setSendPercentage(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Suggested Qty %" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">Send Ratio: 50%</SelectItem>
                  <SelectItem value="60">Send Ratio: 60%</SelectItem>
                  <SelectItem value="70">Send Ratio: 70% (Default)</SelectItem>
                  <SelectItem value="80">Send Ratio: 80%</SelectItem>
                  <SelectItem value="100">Send Ratio: 100%</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Channel Filter */}
            <div className="w-36">
              <Select
                value={fulfillmentFilter}
                onValueChange={(val) => {
                  setFulfillmentFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MFN">MFN Orders Only</SelectItem>
                  <SelectItem value="ALL">All Orders (MFN+FBA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Search & Export */}
          <div className="flex items-center gap-2.5 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Input
                type="text"
                placeholder={t("Search MFN SKU, State, FC...")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="h-9 text-xs pr-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleExportCsv}
              disabled={exporting || loading || totalRecords === 0}
              className="h-9 px-3 text-xs font-semibold flex items-center gap-1.5 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/40 hover:bg-emerald-100/70"
            >
              <i className="fa-solid fa-file-excel text-xs" />
              {exporting ? "Exporting..." : "Export Excel / CSV"}
            </Button>
          </div>
        </div>

        {/* ── AG-Grid Table ──────────────────────────────────────────────── */}
        <div className="w-full">
          <AgTable
            loading={loading}
            height="55vh"
            minHeight="420px"
            rowData={items}
            columnDefs={columns}
            totalRecords={totalRecords}
            rowHeight={60}
            perPage={perPage}
            currentPage={page}
            onPageChange={(p) => setPage(p)}
            onPerPageChange={(pp) => {
              setPerPage(pp);
              setPage(1);
            }}
            onSortChanged={handleSortChanged}
            isCustomSaveColumns={false}
          />
        </div>
      </div>
    </div>
  );
};

export default MfnToFbaRecommendations;
