import React, { useState, useEffect, useContext, useCallback } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ShadcnDatePicker } from "../../../components/ui/date-picker";
import { ShadcnDateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

import Toast from "../../../common/helper/toast/Toast";

import {
  ApiGetFcCards,
  ApiGetFcGeoDistribution,
  ApiGetFcInventoryGrid,
  ApiGetFcStorageFees,
  ApiGetFcList,
  ApiGetWarehouseMasterList,
  ApiSaveWarehouseLocation,
  ApiGetFcSkuMatrix,
} from "../../../api-wrapper/inventoryManagement/ApiFcInventory";

// ─── Storage Fee Cutoff Helper ───────────────────────────────────────────────
// Storage fee billing month based on 16th cutoff rule:
// - Until 16th of current month (day <= 16): Fee month is 2 months prior (e.g. Aug, 2026 until 16th Oct)
// - After 16th of current month (day > 16): Fee month is 1 month prior (e.g. Sep, 2026 from 17th Oct until 16th Nov)
export const getDefaultStorageFeeMonth = (refDate = moment()) => {
  const m = moment(refDate);
  return m.date() <= 16
    ? m.clone().subtract(2, "months").format("YYYY-MM")
    : m.clone().subtract(1, "months").format("YYYY-MM");
};

// ─── Clean White Month Picker ────────────────────────────────────────────────
const MonthPicker = ({ value, onChange, formatBadge }) => {
  const [isOpen, setIsOpen] = useState(false);
  const defaultFeeMonth = getDefaultStorageFeeMonth();
  const currentMoment = value ? moment(value, "YYYY-MM") : moment(defaultFeeMonth, "YYYY-MM");
  const [viewYear, setViewYear] = useState(currentMoment.isValid() ? currentMoment.year() : moment(defaultFeeMonth, "YYYY-MM").year());

  useEffect(() => {
    if (value && moment(value, "YYYY-MM").isValid()) {
      setViewYear(moment(value, "YYYY-MM").year());
    }
  }, [value]);

  const months = [
    { label: "Jan", index: 0 },
    { label: "Feb", index: 1 },
    { label: "Mar", index: 2 },
    { label: "Apr", index: 3 },
    { label: "May", index: 4 },
    { label: "Jun", index: 5 },
    { label: "Jul", index: 6 },
    { label: "Aug", index: 7 },
    { label: "Sep", index: 8 },
    { label: "Oct", index: 9 },
    { label: "Nov", index: 10 },
    { label: "Dec", index: 11 },
  ];

  // Maximum selectable month is based on 16th cutoff rule
  const maxAllowedMoment = moment(defaultFeeMonth, "YYYY-MM");
  const maxYear = maxAllowedMoment.year();
  const maxMonth = maxAllowedMoment.month();

  const handlePrevYear = (e) => {
    e.stopPropagation();
    setViewYear((prev) => prev - 1);
  };

  const handleNextYear = (e) => {
    e.stopPropagation();
    if (viewYear < maxYear) {
      setViewYear((prev) => prev + 1);
    }
  };

  const handleSelectMonth = (monthIndex) => {
    const monthStr = `${viewYear}-${String(monthIndex + 1).padStart(2, "0")}`;
    onChange(monthStr);
    setIsOpen(false);
  };

  const selectedYear = currentMoment.isValid() ? currentMoment.year() : null;
  const selectedMonthIndex = currentMoment.isValid() ? currentMoment.month() : null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 px-3 text-sm font-medium bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded-md shadow-sm flex items-center justify-between min-w-[190px]"
        >
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-slate-500 font-normal">Fee Month:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {formatBadge ? formatBadge(value || defaultFeeMonth) : currentMoment.format("MMM, YYYY")}
            </span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 opacity-60 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-[9999]"
        align="start"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
            onClick={handlePrevYear}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {viewYear}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={viewYear >= maxYear}
            className="h-7 w-7 p-0 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30"
            onClick={handleNextYear}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3">
          {months.map((m) => {
            const isSelected = selectedYear === viewYear && selectedMonthIndex === m.index;
            const isFuture = viewYear > maxYear || (viewYear === maxYear && m.index > maxMonth);

            return (
              <button
                key={m.label}
                type="button"
                disabled={isFuture}
                onClick={() => handleSelectMonth(m.index)}
                className={`py-2 px-1 text-sm font-semibold rounded-lg transition-all text-center ${isSelected
                    ? "bg-blue-600 text-white shadow-sm font-bold"
                    : isFuture
                      ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ─── Reusable Product Cell Renderer (Full Title with Word Wrap) ───────────────
const WarehouseProductCell = ({ row }) => {
  const [imgErr, setImgErr] = useState(false);
  if (!row) return null;
  const title = row.title || row.productName || row.itemName || row.sku || row.asin || "-";
  const asin = row.asin;
  const sku = row.sku;
  const image = !imgErr && (row.imageUrl || row.imageURL);

  return (
    <div className="flex items-start gap-2.5 py-2 px-1 w-full min-w-0 group">
      {image ? (
        <img
          src={image}
          alt=""
          onError={() => setImgErr(true)}
          className="w-10 h-10 rounded-md object-contain shrink-0 border border-slate-200 dark:border-slate-800 bg-white mt-0.5"
        />
      ) : (
        <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center text-slate-400 mt-0.5">
          <i className="fa-solid fa-box text-sm" />
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1 leading-snug justify-center">
        <span
          className="text-xs font-semibold text-slate-800 dark:text-slate-200"
          style={{
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            lineHeight: "1.4",
          }}
          title={title}
        >
          {title}
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 mt-1">
          {asin && (
            <span className="inline-flex items-center gap-1">
              ASIN: <b className="text-slate-600 dark:text-slate-300 font-medium">{asin}</b>
              <a
                href={`https://www.amazon.in/dp/${asin}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-slate-400 hover:text-blue-500 inline-flex items-center ml-0.5"
                title="View on Amazon"
              >
                ↗
              </a>
            </span>
          )}
          {asin && sku && <span className="text-slate-300 dark:text-slate-600">|</span>}
          {sku && (
            <span>
              SKU: <b className="text-slate-600 dark:text-slate-300 font-medium">{sku}</b>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Multi-line wrapped header component for summary columns ─────────────────
const MultiLineHeader = (props) => {
  const { title, subLabel, displayName, progressSort, enableSorting } = props;
  const label = title || displayName || "";

  const handleClick = (e) => {
    if (enableSorting && progressSort) {
      progressSort(e.shiftKey);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="flex flex-col items-center justify-center text-center w-full px-1 py-1 leading-tight select-none cursor-pointer"
    >
      <span
        className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight text-center"
        style={{
          whiteSpace: "normal",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          lineHeight: "1.25",
        }}
      >
        {label}
      </span>
      {subLabel && (
        <span
          className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5 text-center"
          style={{
            whiteSpace: "normal",
            wordBreak: "break-word",
            lineHeight: "1.2",
          }}
        >
          {subLabel}
        </span>
      )}
    </div>
  );
};

const WarehouseDetails = () => {
  const { t } = useTranslation();
  const {
    profileId,
    selectedConfig,
    storeDara,
    profileData,
    selectedDate,
    setSelectedDate,
  } = useContext(ProfileContext);
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Robust Profile & Config ID resolution
  const activeProfileId = React.useMemo(() => {
    let pId = profileId?.value ?? profileId;
    if (Array.isArray(pId)) {
      pId = pId.length > 0 ? pId[0] : null;
    }
    if (pId && typeof pId === "object" && pId.value) {
      pId = pId.value;
    }
    if (pId && !isNaN(Number(pId)) && Number(pId) > 0) {
      return Number(pId);
    }

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
    } catch (e) { }
    return null;
  }, [profileId, selectedConfig, profileData, storeDara]);

  const activeConfigId = React.useMemo(() => {
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
      storeDara?.profile?.configId,
      profileData?.configId,
      profileData?._id,
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
    } catch (e) { }
    return null;
  }, [selectedConfig, storeDara, profileData]);

  const [selectedSingleDate, setSelectedSingleDate] = useState("");
  const [latestAvailableDate, setLatestAvailableDate] = useState(null);

  const [activeTab, setActiveTab] = useState("LEDGER"); // "LEDGER" | "STORAGE_FEES" | "WAREHOUSE_MASTER"
  const [cardsData, setCardsData] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [fcList, setFcList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolvedReportDate, setResolvedReportDate] = useState(null);

  // Filter States
  const [selectedFc, setSelectedFc] = useState("ALL");
  const [selectedDisposition, setSelectedDisposition] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);

  const [gridData, setGridData] = useState([]);
  const [storageFeeData, setStorageFeeData] = useState([]);
  const [storageFeeMonthYear, setStorageFeeMonthYear] = useState(() => getDefaultStorageFeeMonth());
  const [selectedStorageMonth, setSelectedStorageMonth] = useState(() => getDefaultStorageFeeMonth());
  const [availableStorageMonths, setAvailableStorageMonths] = useState([]);
  const [warehouseMasterData, setWarehouseMasterData] = useState([]);
  const [matrixData, setMatrixData] = useState([]);
  const [matrixFcCodes, setMatrixFcCodes] = useState([]);
  const [matrixFcStates, setMatrixFcStates] = useState({});
  const [matrixDays, setMatrixDays] = useState("30");
  const [matrixCustomRange, setMatrixCustomRange] = useState(() => [
    moment().subtract(30, "days").toDate(),
    moment().subtract(1, "days").toDate(),
  ]);
  const [matrixPeriodStart, setMatrixPeriodStart] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Format monthYear (e.g., "2026-09") into readable badge format like "Sep, 2026"
  const formatFeeMonthBadge = (monthYear) => {
    if (!monthYear) return "";
    const m = moment(monthYear, "YYYY-MM");
    if (m.isValid()) {
      return m.format("MMM, YYYY");
    }
    return monthYear;
  };

  // Single Date Handlers
  const handleSingleDateChange = (val) => {
    if (!val) return;
    const formatted = moment(val).format("YYYY-MM-DD");
    setSelectedSingleDate(formatted);
    setPage(1);
  };

  // Fetch KPI Cards
  const fetchCards = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const res = await ApiGetFcCards({
        profileId: activeProfileId,
        configId: activeConfigId,
        date: selectedSingleDate || undefined,
      });
      if (res?.isSuccess) {
        setCardsData(res.data);
        if (res.data?.reportDate) {
          setResolvedReportDate(res.data.reportDate);
          if (!selectedSingleDate) {
            setSelectedSingleDate(res.data.reportDate);
          }
        }
        if (res.data?.latestAvailableDate) {
          setLatestAvailableDate(res.data.latestAvailableDate);
        }
        if (res.data?.storageFeeMonth) {
          setStorageFeeMonthYear(res.data.storageFeeMonth);
        }
      }
    } catch (e) {
      console.error("Error fetching FC cards:", e);
    }
  }, [activeProfileId, activeConfigId, selectedSingleDate]);

  // Fetch Geo Distribution
  const fetchGeoDistribution = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const res = await ApiGetFcGeoDistribution({
        profileId: activeProfileId,
        configId: activeConfigId,
        date: selectedSingleDate || undefined,
      });
      if (res?.isSuccess) {
        setGeoData(res.data);
      }
    } catch (e) {
      console.error("Error fetching Geo distribution:", e);
    }
  }, [activeProfileId, activeConfigId, selectedSingleDate]);

  // Fetch FC Dropdown List
  const fetchFcDropdown = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const res = await ApiGetFcList({
        profileId: activeProfileId,
        configId: activeConfigId,
      });
      if (res?.isSuccess && Array.isArray(res.data)) {
        setFcList(res.data);
      }
    } catch (e) {
      console.error("Error fetching FC list:", e);
    }
  }, [activeProfileId, activeConfigId]);

  // Fetch Ledger Grid
  const fetchGrid = useCallback(async () => {
    if (!activeProfileId) return;
    setLoading(true);
    try {
      const res = await ApiGetFcInventoryGrid({
        profileId: activeProfileId,
        configId: activeConfigId,
        date: selectedSingleDate || undefined,
        fcCode: selectedFc,
        disposition: selectedDisposition,
        search: searchQuery,
        page,
        limit: perPage,
      });
      if (res?.isSuccess) {
        setGridData(res.data?.items || []);
        setTotalRecords(res.data?.totalRecords || 0);
        setResolvedReportDate(res.data?.reportDate || null);
        if (!selectedSingleDate && res.data?.reportDate) {
          setSelectedSingleDate(res.data.reportDate);
        }
        if (res.data?.latestAvailableDate) {
          setLatestAvailableDate(res.data.latestAvailableDate);
        }
      }
    } catch (e) {
      console.error("Error fetching FC grid:", e);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId, activeConfigId, selectedSingleDate, selectedFc, selectedDisposition, searchQuery, page, perPage]);

  // Fetch Storage Fees
  const fetchStorageFees = useCallback(async () => {
    if (!activeProfileId) return;
    setLoading(true);
    try {
      const targetMonth = selectedStorageMonth || getDefaultStorageFeeMonth();

      const res = await ApiGetFcStorageFees({
        profileId: activeProfileId,
        configId: activeConfigId,
        monthYear: targetMonth,
        fcCode: selectedFc,
        page,
        limit: perPage,
      });
      if (res?.isSuccess) {
        setStorageFeeData(res.data?.items || []);
        setTotalRecords(res.data?.totalRecords || 0);
        if (res.data?.monthYear) {
          setStorageFeeMonthYear(res.data.monthYear);
          if (!selectedStorageMonth) {
            setSelectedStorageMonth(res.data.monthYear);
          }
        }
        if (Array.isArray(res.data?.availableMonths)) {
          setAvailableStorageMonths(res.data.availableMonths);
        }
      }
    } catch (e) {
      console.error("Error fetching storage fees:", e);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId, activeConfigId, selectedStorageMonth, selectedFc, page, perPage]);

  // Fetch Master Warehouses List
  const fetchWarehouseMaster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiGetWarehouseMasterList({
        countryCode: "IN",
        search: searchQuery,
      });
      if (res?.isSuccess) {
        setWarehouseMasterData(res.data || []);
        setTotalRecords(res.data?.length || 0);
      }
    } catch (e) {
      console.error("Error fetching warehouse master list:", e);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // Fetch SKU x FC Matrix (stock / orders / send)
  const fetchMatrix = useCallback(async () => {
    if (!activeProfileId) return;
    const isCustom =
      matrixDays === "CUSTOM" &&
      Array.isArray(matrixCustomRange) &&
      matrixCustomRange.length >= 2 &&
      matrixCustomRange[0] &&
      matrixCustomRange[1];

    if (matrixDays === "CUSTOM" && !isCustom) return;

    setLoading(true);
    try {
      const payload = {
        profileId: activeProfileId,
        configId: activeConfigId,
        date: selectedSingleDate || undefined,
        ...(isCustom
          ? {
              fromDate: moment(matrixCustomRange[0]).format("YYYY-MM-DD"),
              toDate: moment(matrixCustomRange[1]).format("YYYY-MM-DD"),
            }
          : { days: Number(matrixDays) || 30 }),
        fcCode: selectedFc,
        search: searchQuery,
        page,
        limit: perPage,
      };

      const res = await ApiGetFcSkuMatrix(payload);
      if (res?.isSuccess) {
        setMatrixData(res.data?.items || []);
        setMatrixFcCodes(res.data?.fcCodes || []);
        setMatrixFcStates(res.data?.fcStates || {});
        setTotalRecords(res.data?.totalRecords || 0);
        setMatrixPeriodStart(res.data?.periodStart || null);
        setResolvedReportDate(res.data?.reportDate || null);
      }
    } catch (e) {
      console.error("Error fetching SKU FC matrix:", e);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId, activeConfigId, selectedSingleDate, matrixDays, matrixCustomRange, selectedFc, searchQuery, page, perPage]);

  // Universal Export handler across tabs (SKU Replenishment Matrix, Ledger, Storage Fees, Directory)
  const handleExport = async () => {
    if (!activeProfileId) return;
    setExporting(true);
    try {
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      let csvLines = [];
      let fileName = `Warehouse_Export_${moment().format("YYYY-MM-DD")}.csv`;

      if (activeTab === "SKU_MATRIX") {
        fileName = `SKU_Replenishment_Matrix_${moment().format("YYYY-MM-DD")}.csv`;
        const isCustom =
          matrixDays === "CUSTOM" &&
          Array.isArray(matrixCustomRange) &&
          matrixCustomRange.length >= 2 &&
          matrixCustomRange[0] &&
          matrixCustomRange[1];

        const payload = {
          profileId: activeProfileId,
          configId: activeConfigId,
          date: selectedSingleDate || undefined,
          ...(isCustom
            ? {
                fromDate: moment(matrixCustomRange[0]).format("YYYY-MM-DD"),
                toDate: moment(matrixCustomRange[1]).format("YYYY-MM-DD"),
              }
            : { days: Number(matrixDays) || 30 }),
          fcCode: selectedFc,
          search: searchQuery,
          page: 1,
          limit: "ALL",
        };

        const res = await ApiGetFcSkuMatrix(payload);
        const exportRows = res?.data?.items || matrixData || [];
        const fcCodesList = res?.data?.fcCodes || matrixFcCodes || [];
        const fcStatesMap = res?.data?.fcStates || matrixFcStates || {};

        if (!exportRows.length) {
          Toast.error(t("No data available to export."));
          return;
        }

        const headers = [
          "ASIN",
          "SKU",
          "Product Title",
          ...fcCodesList.flatMap((fc) => {
            const st = fcStatesMap[fc];
            const label = st && st !== "Unknown" ? `${fc} (${st})` : fc;
            return [`${label} Stock`, `${label} Orders`, `${label} Send`];
          }),
          "Total Stock",
          `Total Orders (${effectiveMatrixDays}D)`,
          "Avg Orders / Day",
          "Total Send",
        ];

        csvLines.push(headers.join(","));
        for (const row of exportRows) {
          const line = [
            escapeCsv(row.asin),
            escapeCsv(row.sku),
            escapeCsv(row.title),
            ...fcCodesList.flatMap((fc) => {
              const cell = row.fcs?.[fc] || {};
              return [
                escapeCsv(cell.stock || 0),
                escapeCsv(cell.orders || 0),
                escapeCsv(cell.send || 0),
              ];
            }),
            escapeCsv(row.totalStock || 0),
            escapeCsv(row.totalOrders || 0),
            escapeCsv(row.avgDailyOrders || 0),
            escapeCsv(row.totalSend || 0),
          ];
          csvLines.push(line.join(","));
        }
      } else if (activeTab === "LEDGER") {
        fileName = `FC_Inventory_Ledger_${moment().format("YYYY-MM-DD")}.csv`;
        const res = await ApiGetFcInventoryGrid({
          profileId: activeProfileId,
          configId: activeConfigId,
          date: selectedSingleDate || undefined,
          fcCode: selectedFc,
          disposition: selectedDisposition,
          search: searchQuery,
          page: 1,
          limit: "ALL",
        });
        const exportRows = res?.data?.items || gridData || [];
        if (!exportRows.length) {
          Toast.error(t("No data available to export."));
          return;
        }
        const headers = [
          "FC Code",
          "Warehouse Name",
          "City",
          "State",
          "ASIN",
          "SKU",
          "Product Title",
          "Disposition",
          "Starting Balance",
          "Receipts",
          "Customer Shipments",
          "Customer Returns",
          "Vendor Returns",
          "Ending Balance",
        ];
        csvLines.push(headers.join(","));
        for (const r of exportRows) {
          csvLines.push([
            escapeCsv(r.fcCode),
            escapeCsv(r.fcName),
            escapeCsv(r.city),
            escapeCsv(r.state),
            escapeCsv(r.asin),
            escapeCsv(r.sku),
            escapeCsv(r.title),
            escapeCsv(r.disposition),
            escapeCsv(r.startingWarehouseBalance || 0),
            escapeCsv(r.receipts || 0),
            escapeCsv(r.customerShipments || 0),
            escapeCsv(r.customerReturns || 0),
            escapeCsv(r.vendorReturns || 0),
            escapeCsv(r.endingWarehouseBalance || 0),
          ].join(","));
        }
      } else if (activeTab === "STORAGE_FEES") {
        fileName = `FC_Storage_Fees_${moment().format("YYYY-MM-DD")}.csv`;
        const res = await ApiGetFcStorageFees({
          profileId: activeProfileId,
          configId: activeConfigId,
          monthYear: selectedStorageMonth,
          fcCode: selectedFc,
          page: 1,
          limit: "ALL",
        });
        const exportRows = res?.data?.items || storageFeeData || [];
        if (!exportRows.length) {
          Toast.error(t("No data available to export."));
          return;
        }
        const headers = [
          "FC Code",
          "ASIN",
          "SKU",
          "Product Title",
          "Avg Qty On Hand",
          "Pending Removal",
          "Volume (Cu. Ft.)",
          "Est. Monthly Storage Fee",
        ];
        csvLines.push(headers.join(","));
        for (const r of exportRows) {
          csvLines.push([
            escapeCsv(r.fcCode),
            escapeCsv(r.asin),
            escapeCsv(r.sku),
            escapeCsv(r.title),
            escapeCsv(r.averageQuantityOnHand || 0),
            escapeCsv(r.averageQuantityPendingRemoval || 0),
            escapeCsv(r.volumeCubicFeet || 0),
            escapeCsv(r.estimatedMonthlyStorageFee || 0),
          ].join(","));
        }
      } else {
        fileName = `Warehouse_Directory_${moment().format("YYYY-MM-DD")}.csv`;
        const res = await ApiGetWarehouseMasterList({
          countryCode: "IN",
          search: searchQuery,
        });
        const exportRows = res?.data || warehouseMasterData || [];
        if (!exportRows.length) {
          Toast.error(t("No data available to export."));
          return;
        }
        const headers = ["FC Code", "Warehouse Name", "City", "State", "Region / Zone", "Discovery Source"];
        csvLines.push(headers.join(","));
        for (const r of exportRows) {
          csvLines.push([
            escapeCsv(r.fcCode),
            escapeCsv(r.fcName),
            escapeCsv(r.city),
            escapeCsv(r.state),
            escapeCsv(r.region),
            escapeCsv(r.source),
          ].join(","));
        }
      }

      const csvContent = "\uFEFF" + csvLines.join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      Toast.success(t("Export completed successfully."));
    } catch (err) {
      console.error("Export error:", err);
      Toast.error(t("Failed to export data."));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchCards();
    fetchGeoDistribution();
    fetchFcDropdown();
  }, [fetchCards, fetchGeoDistribution, fetchFcDropdown]);

  useEffect(() => {
    if (activeTab === "LEDGER") {
      fetchGrid();
    } else if (activeTab === "STORAGE_FEES") {
      fetchStorageFees();
    } else if (activeTab === "WAREHOUSE_MASTER") {
      fetchWarehouseMaster();
    } else if (activeTab === "SKU_MATRIX") {
      fetchMatrix();
    }
  }, [activeTab, fetchGrid, fetchStorageFees, fetchWarehouseMaster, fetchMatrix]);

  // ── Column Definitions ──────────────────────────────────────────────────────
  const ledgerColumns = [
    {
      headerName: "Fulfillment Center",
      field: "fcCode",
      width: 170,
      cellRenderer: (params) => {
        const row = params.data;
        return (
          <div className="flex flex-col py-1">
            <span className="font-semibold text-blue-600 dark:text-blue-400">{row.fcCode}</span>
            <span className="text-xs text-gray-500">{row.city ? `${row.city}, ${row.state}` : row.state || "Warehouse"}</span>
          </div>
        );
      },
    },
    {
      headerName: "Product (ASIN / SKU)",
      field: "asin",
      minWidth: 320,
      width: 380,
      wrapText: true,
      autoHeight: true,
      cellStyle: {
        whiteSpace: "normal",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        lineHeight: "1.4",
      },
      cellRenderer: (params) => <WarehouseProductCell row={params.data} />,
    },
    {
      headerName: "Report Date",
      field: "reportDate",
      width: 130,
      cellRenderer: (params) => {
        const val = params.value || params.data?.reportDate;
        return (
          <div className="flex items-center gap-1.5 py-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
              <i className="fa-regular fa-calendar text-[10px] mr-1" />
              {val ? moment(val).format("YYYY-MM-DD") : "-"}
            </span>
          </div>
        );
      },
    },
    {
      headerName: "Starting Balance",
      field: "startingWarehouseBalance",
      width: 135,
      cellRenderer: (p) => (
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          {(p.value || 0).toLocaleString()}
        </span>
      ),
    },
    {
      headerName: "Ending Balance",
      field: "endingWarehouseBalance",
      width: 145,
      cellRenderer: (p) => (
        <div className="flex flex-col py-1">
          <span className="font-bold text-green-600 dark:text-green-400">
            {(p.value || 0).toLocaleString()}
          </span>
          {p.data?.reportDate && (
            <span className="text-[10px] text-gray-400">
              as of {moment(p.data.reportDate).format("MMM DD, YYYY")}
            </span>
          )}
        </div>
      ),
    },
    {
      headerName: "In-Transit (Between FCs)",
      field: "inTransitBetweenWarehouses",
      width: 170,
      cellRenderer: (p) => (
        <span className={`font-semibold ${p.value > 0 ? "text-amber-500" : "text-gray-400"}`}>
          {(p.value || 0).toLocaleString()}
        </span>
      ),
    },
    {
      headerName: "Receipts",
      field: "receipts",
      width: 110,
      valueFormatter: (p) => (p.value || 0).toLocaleString(),
    },
    {
      headerName: "Shipments",
      field: "customerShipments",
      width: 120,
      valueFormatter: (p) => (p.value || 0).toLocaleString(),
    },
    {
      headerName: "Cust Returns",
      field: "customerReturns",
      width: 125,
      cellRenderer: (p) => (
        <span className={p.value > 0 ? "text-red-500 font-medium" : "text-gray-400"}>
          {(p.value || 0).toLocaleString()}
        </span>
      ),
    },
    {
      headerName: "Unfulfillable",
      field: "unfulfillableBalance",
      width: 130,
      cellRenderer: (p) => (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${p.value > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "text-gray-400"}`}>
          {(p.value || 0).toLocaleString()}
        </span>
      ),
    },
  ];

  const storageColumns = [
    {
      headerName: "Fulfillment Center",
      field: "fcCode",
      width: 160,
      cellRenderer: (p) => <span className="font-semibold text-blue-600">{p.value}</span>,
    },
    {
      headerName: "Product (ASIN / SKU)",
      field: "asin",
      minWidth: 320,
      width: 380,
      wrapText: true,
      autoHeight: true,
      cellStyle: {
        whiteSpace: "normal",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        lineHeight: "1.4",
      },
      cellRenderer: (p) => <WarehouseProductCell row={p.data} />,
    },
    {
      headerName: "Avg Qty On Hand",
      field: "averageQuantityOnHand",
      width: 150,
      valueFormatter: (p) => Math.round(p.value || 0).toLocaleString(),
    },
    {
      headerName: "Pending Removal",
      field: "averageQuantityPendingRemoval",
      width: 150,
      valueFormatter: (p) => Math.round(p.value || 0).toLocaleString(),
    },
    {
      headerName: "Volume (Cu. Ft.)",
      field: "volumeCubicFeet",
      width: 150,
      valueFormatter: (p) => (p.value || 0).toFixed(3),
    },
    {
      headerName: "Est. Monthly Storage Fee",
      field: "estimatedMonthlyStorageFee",
      width: 180,
      cellRenderer: (p) => (
        <span className="font-bold text-amber-600 dark:text-amber-400">
          ₹{(p.value || 0).toFixed(2)}
        </span>
      ),
    },
  ];

  const masterColumns = [
    {
      headerName: "FC Code",
      field: "fcCode",
      width: 120,
      cellRenderer: (p) => (
        <span className="font-bold text-blue-600 dark:text-blue-400 px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/50">
          {p.value}
        </span>
      ),
    },
    {
      headerName: "Warehouse Name",
      field: "fcName",
      width: 220,
    },
    {
      headerName: "City",
      field: "city",
      width: 150,
      cellRenderer: (p) => p.value || <span className="text-gray-400 italic">Not set</span>,
    },
    {
      headerName: "State",
      field: "state",
      width: 160,
      cellRenderer: (p) => p.value || <span className="text-gray-400 italic">Not set</span>,
    },
    {
      headerName: "Region / Zone",
      field: "region",
      width: 130,
      cellRenderer: (p) => (
        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          {p.value || "Other"}
        </span>
      ),
    },
    {
      headerName: "Discovery Source",
      field: "source",
      width: 180,
      cellRenderer: (p) => {
        const source = p.value || "AUTO_DETECTED";
        let colorClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300";
        if (source === "REPORT_LEDGER") colorClass = "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300";
        if (source === "REPORT_GST") colorClass = "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300";
        if (source === "USER_OVERRIDE") colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300";

        return (
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${colorClass}`}>
            {source}
          </span>
        );
      },
    },
  ];

  // SKU x FC matrix: product info + totals, then Stock / Orders / Send for every FC
  const numCell = (val, cls = "text-slate-700 dark:text-slate-300") => (
    <div className="w-full h-full flex items-center justify-center">
      <span className={`font-semibold ${cls}`}>{Number(val || 0).toLocaleString()}</span>
    </div>
  );

  const effectiveMatrixDays = React.useMemo(() => {
    if (
      matrixDays === "CUSTOM" &&
      Array.isArray(matrixCustomRange) &&
      matrixCustomRange.length >= 2 &&
      matrixCustomRange[0] &&
      matrixCustomRange[1]
    ) {
      return Math.max(
        1,
        moment(matrixCustomRange[1]).startOf("day").diff(moment(matrixCustomRange[0]).startOf("day"), "days") + 1
      );
    }
    return Number(matrixDays) || 30;
  }, [matrixDays, matrixCustomRange]);

  const matrixColumns = [
    {
      headerName: "PRODUCT (SKU / ASIN)",
      field: "sku",
      minWidth: 320,
      width: 380,
      pinned: "left",
      wrapText: true,
      autoHeight: true,
      cellStyle: {
        whiteSpace: "normal",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        lineHeight: "1.4",
      },
      cellRenderer: (params) => <WarehouseProductCell row={params.data} />,
    },
    ...matrixFcCodes.map((fc) => {
      const st = matrixFcStates?.[fc];
      const groupHeader = st && st !== "Unknown" ? `${fc} (${st})` : fc;
      return {
        headerName: groupHeader,
        marryChildren: true,
        children: [
          {
            headerName: "Stock",
            colId: `${fc}_stock`,
            width: 80,
            valueGetter: (p) => p.data?.fcs?.[fc]?.stock || 0,
            cellRenderer: (p) => numCell(p.value),
          },
          {
            headerName: "Orders",
            colId: `${fc}_orders`,
            width: 85,
            valueGetter: (p) => p.data?.fcs?.[fc]?.orders || 0,
            cellRenderer: (p) => numCell(p.value, "text-blue-600 dark:text-blue-400"),
          },
          {
            headerName: "Send",
            colId: `${fc}_send`,
            width: 80,
            valueGetter: (p) => p.data?.fcs?.[fc]?.send || 0,
            cellRenderer: (p) => numCell(p.value, p.value > 0 ? "text-amber-600 font-semibold" : "text-slate-400"),
          },
        ],
      };
    }),
    // ── 4 Fixed Totals Columns in LAST (Pinned Right with Word Wrap) ───
    {
      headerName: "Total Stock",
      field: "totalStock",
      colId: "totalStock",
      width: 105,
      pinned: "right",
      wrapHeaderText: true,
      autoHeaderHeight: true,
      headerComponent: MultiLineHeader,
      headerComponentParams: { title: "TOTAL STOCK" },
      cellRenderer: (p) => numCell(p.value, "font-bold text-slate-800 dark:text-slate-100"),
    },
    {
      headerName: `Total Orders (${effectiveMatrixDays}d)`,
      field: "totalOrders",
      colId: "totalOrders",
      width: 110,
      pinned: "right",
      wrapHeaderText: true,
      autoHeaderHeight: true,
      headerComponent: MultiLineHeader,
      headerComponentParams: {
        title: "TOTAL ORDERS",
        subLabel: `(${effectiveMatrixDays}D)`,
      },
      cellRenderer: (p) => numCell(p.value, "font-bold text-blue-600 dark:text-blue-400"),
    },
    {
      headerName: "Avg Orders / Day",
      field: "avgDailyOrders",
      colId: "avgDailyOrders",
      width: 110,
      pinned: "right",
      wrapHeaderText: true,
      autoHeaderHeight: true,
      headerComponent: MultiLineHeader,
      headerComponentParams: { title: "AVG ORDERS", subLabel: "/ DAY" },
      cellRenderer: (p) => numCell(p.value, "font-bold text-slate-700 dark:text-slate-200"),
    },
    {
      headerName: "Total Send",
      field: "totalSend",
      colId: "totalSend",
      width: 105,
      pinned: "right",
      wrapHeaderText: true,
      autoHeaderHeight: true,
      headerComponent: MultiLineHeader,
      headerComponentParams: { title: "TOTAL SEND" },
      cellRenderer: (p) => numCell(p.value, p.value > 0 ? "font-bold text-amber-600 dark:text-amber-400" : "text-slate-400"),
    },
  ];

  if (isSpLoaded && !isSpConnected) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8">
        <SpAccountNotConnected />
      </div>
    );
  }

  return (
    <div
      className="warehouse-details-page middle_container w-full min-h-full bg-slate-50/50 dark:bg-slate-950/50"
      style={{ paddingBottom: "140px" }}
    >
      {/* ── Top Global Filter Bar ────────────────────────────────────────── */}
      <Filter nameShow={false} dateShow={false} profileShow={true} />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pt-4 pb-6">
        {/* ── Sticky Top Header (Single Date Picker) ────────────────────── */}
        <div
          className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
          style={{
            padding: isMobile ? "10px 16px" : "10px 24px",
            zIndex: 90,
            position: isMobile ? "relative" : "sticky",
            top: 0,
            marginBottom: "20px",
            borderRadius: "12px",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <div id="warehouse-date-picker" style={{ flex: isMobile ? "1 1 100%" : "0 0 150px", width: isMobile ? "100%" : "150px" }}>
            <ShadcnDatePicker
              value={selectedSingleDate}
              onChange={handleSingleDateChange}
              disabledDate={(d) => d > new Date()}
              placeholder={t("Select Date")}
              className="h-10 w-full text-[13px] font-normal text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1e293b] border-slate-200 dark:border-slate-700 rounded-md shadow-sm px-3"
            />
          </div>
        </div>

        {/* ── KPI Summary Cards ──────────────────────────────────────────── */}
        <div id="warehouse-kpi-cards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl flex-shrink-0">
              <i className="fa-solid fa-boxes-stacked" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Total In-Warehouse Units</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {(cardsData?.totalUnits || 0).toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Across {cardsData?.totalActiveWarehouses || 0} Fulfillment Centers</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 text-xl flex-shrink-0">
              <i className="fa-solid fa-truck-ramp-box" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">In-Transit Units (FC-to-FC)</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {(cardsData?.totalInTransitUnits || 0).toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Inter-Warehouse Movement</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 text-xl flex-shrink-0">
              <i className="fa-solid fa-triangle-exclamation" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Unfulfillable Units</div>
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {(cardsData?.totalUnfulfillableUnits || 0).toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Damaged / Defective Stock</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl flex-shrink-0">
              <i className="fa-solid fa-indian-rupee-sign" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Est. Monthly Storage Fee</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                ₹{(cardsData?.estimatedMonthlyStorageFee || 0).toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Vol: {cardsData?.totalVolumeCft || 0} Cu. Ft.
                {(storageFeeMonthYear || cardsData?.storageFeeMonth) && (
                  <span className="ml-1.5 font-medium text-slate-500 dark:text-slate-400">
                    ({formatFeeMonthBadge(storageFeeMonthYear || cardsData?.storageFeeMonth)})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Geographic State-Wise Stock Distribution ────────────────────── */}
        {geoData?.stateDistribution?.length > 0 && (
          <div id="warehouse-geo-distribution" className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <i className="fa-solid fa-map-location-dot text-blue-500" />
                State-wise Warehouse Stock Distribution
              </h2>
              <span className="text-xs text-slate-400">Active States: {geoData.stateDistribution.length}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {geoData.stateDistribution.map((st, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col justify-between space-y-2 hover:border-blue-300 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{st.state}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-medium">
                      {st.region || "Zone"}
                    </span>
                  </div>
                  <div>
                    <div className="text-base font-bold text-blue-600 dark:text-blue-400">
                      {st.totalUnits.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">units</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex justify-between mt-1">
                      <span>{st.warehouseCount} FC{st.warehouseCount > 1 ? "s" : ""}</span>
                      <span>{st.totalSkus} SKUs</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Main Data View Card (Tabs, Filters & Table) ────────────────── */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 mb-8">
          {/* Row 1: Sub Tabs & Monthly Picker */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Sub Tabs */}
            <div id="warehouse-tabs" className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                onClick={() => setActiveTab("LEDGER")}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "LEDGER"
                  ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
              >
                <i className="fa-solid fa-list-check mr-1.5" />
                FC Inventory Ledger
              </button>
              <button
                onClick={() => setActiveTab("STORAGE_FEES")}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "STORAGE_FEES"
                  ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
              >
                <i className="fa-solid fa-coins mr-1.5" />
                Storage Fee Breakdown
              </button>
              <button
                onClick={() => setActiveTab("WAREHOUSE_MASTER")}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "WAREHOUSE_MASTER"
                  ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
              >
                <i className="fa-solid fa-building-circle-check mr-1.5" />
                Warehouse Directory
              </button>
              <button
                onClick={() => { setActiveTab("SKU_MATRIX"); setPage(1); }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === "SKU_MATRIX"
                  ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
              >
                <i className="fa-solid fa-table-cells mr-1.5" />
                SKU Replenishment
              </button>
            </div>

            {/* Monthly DatePicker when on STORAGE_FEES tab */}
            {activeTab === "STORAGE_FEES" && (
              <MonthPicker
                value={selectedStorageMonth || storageFeeMonthYear || getDefaultStorageFeeMonth()}
                onChange={(val) => {
                  setSelectedStorageMonth(val);
                  setPage(1);
                }}
                formatBadge={formatFeeMonthBadge}
              />
            )}
          </div>

          {/* Row 2: Filter Controls & Export Button (Moved to dedicated new line) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            {/* Filters on Left */}
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {activeTab !== "WAREHOUSE_MASTER" && (
                <div className="w-48">
                  <Select value={selectedFc} onValueChange={(val) => { setSelectedFc(val); setPage(1); }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="All Warehouses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Warehouses (FC)</SelectItem>
                      {fcList.map((fc) => (
                        <SelectItem key={fc.fcCode} value={fc.fcCode}>
                          {fc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeTab === "LEDGER" && (
                <div className="w-36">
                  <Select value={selectedDisposition} onValueChange={(val) => { setSelectedDisposition(val); setPage(1); }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Disposition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Dispositions</SelectItem>
                      <SelectItem value="SELLABLE">Sellable</SelectItem>
                      <SelectItem value="CUSTOMER_DAMAGED">Customer Damaged</SelectItem>
                      <SelectItem value="DEFECTIVE">Defective</SelectItem>
                      <SelectItem value="CARRIER_DAMAGED">Carrier Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeTab === "SKU_MATRIX" && (
                <>
                  <div className="w-44">
                    <Select value={matrixDays} onValueChange={(val) => { setMatrixDays(val); setPage(1); }}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Orders period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Orders: Last 7 days</SelectItem>
                        <SelectItem value="15">Orders: Last 15 days</SelectItem>
                        <SelectItem value="30">Orders: Last 30 days</SelectItem>
                        <SelectItem value="60">Orders: Last 60 days</SelectItem>
                        <SelectItem value="CUSTOM">Orders: Custom Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {matrixDays === "CUSTOM" && (
                    <div style={{ minWidth: 230, width: 245 }}>
                      <ShadcnDateRangePicker
                        defaultOpen={true}
                        className="w-full"
                        ranges={predefinedRanges}
                        value={matrixCustomRange}
                        placeholder={t("Select Date Range")}
                        onChange={(range) => {
                          if (range && Array.isArray(range) && range.length >= 2) {
                            setMatrixCustomRange([
                              moment(range[0]).toDate(),
                              moment(range[1]).toDate(),
                            ]);
                            setPage(1);
                          }
                        }}
                        placement="bottomEnd"
                        format="yyyy-MM-dd"
                        cleanable={false}
                        style={{ height: 36, width: "100%" }}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="relative flex-1 sm:max-w-xs min-w-[200px]">
                <Input
                  type="text"
                  placeholder={activeTab === "WAREHOUSE_MASTER" ? "Search FC Code, City, State..." : "Search ASIN, SKU, FC..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 text-xs pr-8"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                )}
              </div>
            </div>

            {/* Export Button on Right */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting || loading || totalRecords === 0}
              className="h-9 text-xs font-semibold border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm transition-all flex items-center gap-1.5 px-3 flex-shrink-0"
              title={t("Export to CSV / Excel")}
            >
              {exporting ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin text-xs text-blue-500" />
                  <span>{t("Exporting...")}</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-file-excel text-xs text-emerald-600 dark:text-emerald-400" />
                  <span>{t("Export")}</span>
                </>
              )}
            </Button>
          </div>

          {/* ── Table Grid ─────────────────────────────────────────────────── */}
          <div id="warehouse-main-grid" className="w-full">
            <AgTable
              loading={loading}
              height="55vh"
              minHeight="450px"
              rowData={
                activeTab === "LEDGER"
                  ? gridData
                  : activeTab === "STORAGE_FEES"
                    ? storageFeeData
                    : activeTab === "SKU_MATRIX"
                      ? matrixData
                      : warehouseMasterData
              }
              columnDefs={
                activeTab === "LEDGER"
                  ? ledgerColumns
                  : activeTab === "STORAGE_FEES"
                    ? storageColumns
                    : activeTab === "SKU_MATRIX"
                      ? matrixColumns
                      : masterColumns
              }
              totalRecords={totalRecords}
              rowHeight={activeTab === "WAREHOUSE_MASTER" ? 50 : 64}
              perPage={perPage}
              currentPage={page}
              onPageChange={(p) => setPage(p)}
              onPerPageChange={(pp) => { setPerPage(pp); setPage(1); }}
              isCustomSaveColumns={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarehouseDetails;
