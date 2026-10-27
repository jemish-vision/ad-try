import React, { useState, useCallback, useEffect, useContext, useRef, useMemo } from "react";
import { SYSTEM_PAGES, PAGE_ACTIONS, ROLES } from "src/common/constants";
import subDays from "date-fns/subDays";
import ReactApexChart from "react-apexcharts";
import { useNavigate } from "react-router-dom";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import { ApiGetProductTypes } from "../../../api-wrapper/productList/ApiProductList";
import { ApiGetAllMarketplaces } from "../../../api-wrapper/ApiAdsConfig";
import { ApiGetDashboardCards, ApiGetDashboardGraph, ApiGetDashboardGrid, ApiGetPerformanceMatrix, ApiGetSmartInsights } from "../../../api-wrapper/inventoryManagement/ApiInventoryManagement";
import { Toast } from "../../../helper/links/Link";
import moment from "moment";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { addDashboardQuery } from "../../../utility/createQuery";
import Filter from "../../../helper/filter/Filter";
import { FiSearch, FiFilter, FiArrowDownCircle, FiRefreshCw, FiCheckCircle, FiXCircle, FiLayers } from "react-icons/fi";
import { TbPercentage } from "react-icons/tb";
import { MdOutlineClose } from "react-icons/md";
import AgTable from "../../../common/grid/AgTable";
import CustomizeColumns from "../../../helper/modal/CustomizeColumns";
import { ApiListGetColumns, ApiListUpdateColumns } from "../../../api-wrapper/columns/ApiColumns";
import { useDebouncedColumnSave } from "../../../utility/useDebouncedColumnSave";
import { handleLoader, useDispatch } from "../../../helper/links/Link";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AgCustomHeader from "../../../common/grid/AgCustomHeader";
import { useTranslation } from "react-i18next";
import "./AdminDashboard.css";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import KPICard from "../../../helper/KPICard";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import DashbordGraph from "./Dashboard/DashbordGraph";
import DashboardRecommendations from "./Dashboard/DashboardRecommendations";
import AssignedCampaignsWidget from "./Dashboard/AssignedCampaignsWidget";
import AdTypeBreakdownWidget from "./Dashboard/AdTypeBreakdownWidget";
import TimeBasedAnalyticsWidget, { OrdersByDayWidget, PeakHoursWidget } from "./Dashboard/TimeBasedAnalyticsWidget";
import WasteAndScalingAlertsWidget, { WasteSpendWidget } from "./Dashboard/WasteAndScalingAlertsWidget";
import ProductPerformanceMatrixWidget from "./Dashboard/ProductPerformanceMatrixWidget";
import SmartInsightsWidget from "./Dashboard/SmartInsightsWidget";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { AppTooltip } from "../../../components/ui/AppTooltip";

const ACTION_LABELS = {
  SCALE: { label: "⚡ SCALE", className: "scale" },
  OPTIMIZE: { label: "⚠ OPTIMIZE", className: "optimize" },
  FIX: { label: "🔧 FIX LISTING", className: "fix" },
  STOP: { label: "✕ STOP ADS", className: "stop" },
  IMPROVE: { label: "🔧 FIX LISTING", className: "fix" },
};

const PERFORMANCE_MATRIX = [
  { key: "scale", label: "SCALE", sub: "High Demand / High Profit", icon: <FiArrowDownCircle size={15} /> },
  { key: "improve", label: "IMPROVE", sub: "Low Demand / High Profit", icon: <FiRefreshCw size={15} /> },
  { key: "optimize", label: "OPTIMIZE", sub: "High Demand / Low Profit", icon: <FiCheckCircle size={15} /> },
  { key: "stop", label: "STOP", sub: "Low Demand / Low Profit", icon: <FiXCircle size={15} /> },
];

// Portal-based tooltip immune to AG-Grid CSS transform offsets

// ─── Sparkline Chart Helper ───────────────────────────────────────────────────

function Sparkline({ data, color }) {
  // Ensure data is an array of numbers to prevent ApexCharts SVG path errors
  const seriesData = Array.isArray(data)
    ? data.map(v => {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    })
    : [];

  const options = {
    chart: {
      type: "area",
      sparkline: { enabled: true },
      animations: { enabled: false }
    },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.35, opacityTo: 0 },
    },
    colors: [color],
    tooltip: { enabled: false },
  };

  return (
    <div className="dash-kpi-sparkline">
      <ReactApexChart
        type="area"
        options={options}
        series={[{ data: seriesData }]}
        height={40}
        width={90}
      />
    </div>
  );
}

// ─── KPI Cards Config ─────────────────────────────────────────────────────────

const KPI_CARDS_MOCK = [
  { label: "Total Sales", value: "...", delta: null, green: true, colorTheme: "theme-blue", metricKey: "sales" },
  { label: "Ad Sales", value: "...", delta: null, green: true, colorTheme: "theme-green", metricKey: "sales" },
  { label: "TACoS", value: "...", delta: null, colorTheme: "theme-purple", metricKey: "acos" },
  { label: "ACoS", value: "...", delta: null, colorTheme: "theme-orange", metricKey: "acos" },
  { label: "roas", value: "...", delta: null, colorTheme: "theme-yellow", metricKey: "roas" },
  {
    label: "conversionRate",
    value: "...",
    sparkline: null,
    colorTheme: "theme-pink",
    metricKey: "clicks"
  },
  {
    label: "Inventory Health",
    value: "...",
    sparkline: null,
    colorTheme: "theme-teal",
    metricKey: "orders"
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { isConnected: isSpConnected, isLoaded: isSpLoaded, profile: activeProfile } = useSpConnection();

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const gridRef = useRef(null);
  const role = localStorage.getItem("role");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // All hooks must be declared before any early return (Rules of Hooks)
  const [filterModal, setFilterModal] = useState(null); // { col, label, type }
  const [filterCondition, setFilterCondition] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const openFilter = (col, label, type) => {
    setFilterModal({ col, label, type });
    setFilterCondition("");
    setFilterValue("");
  };

  const closeFilter = () => setFilterModal(null);

  const handleFilterSubmit = () => {
    closeFilter();
  };

  const { profileId, currencyCode, pagePermission, selectedDate, setSelectedDate, selectedAdType } = useContext(ProfileContext);

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
      const p = JSON.parse(localStorage.getItem("profile"));
      return p?.profile || p || null;
    } catch (e) {
      return null;
    }
  };

  const [activeProfileObj, setActiveProfileObj] = useState(() => getStoredProfile());

  const currentProfileId = useMemo(() => {
    return getProfileIdString(profileId) || activeProfileObj?.profileId || getStoredProfile()?.profileId || null;
  }, [profileId, activeProfileObj]);

  useEffect(() => {
    const handleProfileChange = (e) => {
      const prof = e?.detail?.profile;
      if (prof) {
        setActiveProfileObj(prof);
      }
    };
    window.addEventListener("profileChanged", handleProfileChange);
    return () => window.removeEventListener("profileChanged", handleProfileChange);
  }, []);

  const [date, setDate] = useState(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
    }
    return [subDays(new Date(), 7), subDays(new Date(), 1)];
  });

  const [marketplace, setMarketplace] = useState("A21TJRUUN4KGV");
  const [category, setCategory] = useState("");
  const [searchSku, setSearchSku] = useState("");
  const [selectedMatrix, setSelectedMatrix] = useState([]);

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDate([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
    }
  }, [selectedDate]);

  const handleDateChange = (e) => {
    setDate(e);
    if (e && Array.isArray(e) && e.length >= 2) {
      const arr = [moment(e[0]).format("YYYY-MM-DD"), moment(e[1]).format("YYYY-MM-DD")];
      setSelectedDate(arr);
      try {
        let storeData = JSON.parse(localStorage.getItem('profile')) || {};
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData));
      } catch (err) { }
    }
  };
  const isVendor = useMemo(() => {
    let storedProfile = null;
    let storedUser = null;
    try {
      const rawProf = localStorage.getItem("profile");
      if (rawProf) storedProfile = JSON.parse(rawProf)?.profile || null;
      const rawUser = localStorage.getItem("user");
      if (rawUser) storedUser = JSON.parse(rawUser);
    } catch (e) {}

    const prof = activeProfile || storedProfile;
    const typeStr = String(
      prof?.type ||
      prof?.subType ||
      prof?.accountType ||
      prof?.accountInfo?.type ||
      storedUser?.accountType ||
      storedUser?.role ||
      ""
    ).toLowerCase();

    return typeStr.includes("vendor");
  }, [activeProfile]);

  const [dashboardMode, setDashboardMode] = useState(() => (isVendor ? "ads" : "seller")); // "seller" | "ads"

  useEffect(() => {
    if (isVendor && dashboardMode !== "ads") {
      setDashboardMode("ads");
    }
  }, [isVendor, dashboardMode]);
  const [productTypes, setProductTypes] = useState([]);
  const [marketplaceList, setMarketplaceList] = useState([]);
  const activeCountryCode = useMemo(() => {
    return activeProfileObj?.countryCode || marketplaceList.find(m => m.marketPlaceId === marketplace)?.countryCode || "IN";
  }, [activeProfileObj, marketplaceList, marketplace]);
  const activeCurrencyCode = useMemo(() => {
    return activeProfileObj?.currencyCode || currencyCode || "INR";
  }, [activeProfileObj, currencyCode]);

  useEffect(() => {
    if (activeProfileObj?.countryCode && marketplaceList.length > 0) {
      const matched = marketplaceList.find(m => m.countryCode === activeProfileObj.countryCode);
      if (matched && matched.marketPlaceId !== marketplace) {
        setMarketplace(matched.marketPlaceId);
      }
    }
  }, [activeProfileObj?.countryCode, marketplaceList, marketplace]);
  const [kpiData, setKpiData] = useState(null);
  const [isKpiLoading, setIsKpiLoading] = useState(false);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [graphData, setGraphData] = useState(null);
  const [matrixData, setMatrixData] = useState(null);
  const [isMatrixLoading, setIsMatrixLoading] = useState(false);

  const [insightsData, setInsightsData] = useState([]);
  const [insightsPage, setInsightsPage] = useState(1);
  const [hasMoreInsights, setHasMoreInsights] = useState(true);
  const [isInsightsLoadingMore, setIsInsightsLoadingMore] = useState(false);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);

  // ── Grid state ─────────────────────────────────────────────────────────────
  const [gridData, setGridData] = useState([]);
  const [gridTotal, setGridTotal] = useState(0);
  const [gridPage, setGridPage] = useState(1);
  const [gridPerPage, setGridPerPage] = useState(firstPageRows);
  const [gridSortField, setGridSortField] = useState("totalSales");
  const [gridSortType, setGridSortType] = useState("desc");
  const [loadingGrid, setLoadingGrid] = useState(false);

  const defaultValue = { firstCondition: "", firstValue: 0, operator: "", secondCondition: "", secondValue: 0, sortType: "" };
  const [conditionObj, setConditionObj] = useState(defaultValue);
  const [fieldName, setfieldName] = useState("");
  const [customFilterFlag, setCustomFilterFlag] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState([]);

  const sharedFilterParams = useMemo(() => ({
    conditionObj,
    setConditionObj,
    setfieldName,
    setCustomFilterFlag,
    defaultValue,
    hideOperator: true
  }), [conditionObj]);

  const getConditionLabel = (cond) => {
    switch (cond) {
      case "$lt": return "<";
      case "$lte": return "<=";
      case "$eq": return "=";
      case "$gte": return ">=";
      case "$gt": return ">";
      default: return cond;
    }
  };

  const getFilterBadgeText = (filter) => {
    const titleMap = {
      title: "Product",
      totalSales: "Total Sales",
      adSales: "Ad Sales",
      organicSales: "Organic Sales",
      totalOrders: "Total Orders",
      adOrders: "Ad Orders",
      organicOrders: "Organic Orders",
      acos: "ACoS",
      cvr: "CVR",
      stockDays: "Stock Days"
    };

    const colName = titleMap[filter.apiFieldName] || filter.apiFieldName;
    let text = `${t(colName)} ${getConditionLabel(filter.condition)} ${filter.value}`;
    if (filter.operator && filter.secondCondition) {
      text += ` ${filter.operator} ${getConditionLabel(filter.secondCondition)} ${filter.secondValue}`;
    }
    return text;
  };

  const applyFilterToGrid = (newFilters) => {
    setGridPage(1);
    loadGridData({ page: 1, dynamicFilters: newFilters });
  };

  const removeFilter = (fieldNameToRemove) => {
    const updatedFilters = appliedFilters.filter(f => f.apiFieldName !== fieldNameToRemove);
    setAppliedFilters(updatedFilters);
    if (fieldName === fieldNameToRemove) {
      setConditionObj(defaultValue);
      setfieldName("");
    }
    applyFilterToGrid(updatedFilters);
  };

  const clearAllFilters = () => {
    setAppliedFilters([]);
    setConditionObj(defaultValue);
    setfieldName("");
    applyFilterToGrid([]);
  };

  const handleMatrixClick = (key) => {
    setSelectedMatrix((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      return next;
    });
    setGridPage(1);
  };

  const clearMatrixFilter = () => {
    setSelectedMatrix([]);
    setGridPage(1);
  };

  // ── Columns state ──────────────────────────────────────────────────────────
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const defaultColumns = ["Product"];

  const checkOrderColumns = useCallback((title) => ({
    width: visibleColumns?.find((col) => col?.title === title)?.width ?? 150,
    hide: Boolean(visibleColumns?.length && !visibleColumns?.find((col) => col?.title === title)),
    order: visibleColumns?.find((col) => col?.title === title)?.order,
  }), [visibleColumns]);

  const productColumns = useMemo(() => [
    {
      headerName: "Product", field: "title", title: "Product",
      ...(checkOrderColumns("Product")),
      pinned: isMobile ? null : "left", lockPinned: !isMobile, suppressMovable: true,
      sortable: true, resizable: true, minWidth: 280,
      headerComponent: AgCustomHeader,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex items-center my-1 cursor-pointer truncate">
            {row?.productImage && (
              <img src={row?.productImage} alt="product" style={{ width: "38px", height: "38px", objectFit: "cover" }} className="rounded mr-2 shrink-0" />
            )}
            <div className="campaignStatus flex items-center min-w-0">
              <div className="flex flex-col min-w-0">
                <span className="font-semibold truncate" title={row?.title}>
                  {row?.title}
                </span>
                <div className="flex items-center gap-2 small text-gray-500 mt-0.5">
                  <span className="truncate">
                    <strong style={{ color: "var(--text-primary)" }}>{t("asins")}:</strong> {row?.asin || "-"}
                  </span>
                  <span className="truncate">
                    <strong style={{ color: "var(--text-primary)" }}>{t("sku")}:</strong> {row?.sku || "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      headerName: "Total Sales", field: "totalSales", title: "Total Sales",
      ...(checkOrderColumns("Total Sales")), sortable: true, resizable: true,
      cellRenderer: (params) => <>{CurrencyCode(params.value || 0)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "totalSales", hasFilter: true },
    },
    {
      headerName: "Ad Sales", field: "adSales", title: "Ad Sales",
      ...(checkOrderColumns("Ad Sales")), sortable: true, resizable: true,
      cellRenderer: (params) => <>{params.value > 0 ? CurrencyCode(params.value) : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "adSales", hasFilter: true },
    },
    {
      headerName: "Organic Sales", field: "organicSales", title: "Organic Sales",
      ...(checkOrderColumns("Organic Sales")), sortable: true, resizable: true,
      cellRenderer: (params) => {
        const v = params.value;
        return <span style={{ color: v < 0 ? "#e74c3c" : v > 0 ? "#27ae60" : "#7f8c9a" }}>{v !== 0 ? CurrencyCode(v) : "—"}</span>;
      },
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "organicSales", hasFilter: true },
    },
    {
      headerName: "Total Orders", field: "totalOrders", title: "Total Orders",
      ...(checkOrderColumns("Total Orders")), sortable: true, resizable: true,
      cellRenderer: (params) => <>{params.value ?? 0}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "totalOrders", hasFilter: true },
    },
    {
      headerName: "Ad Orders", field: "adOrders", title: "Ad Orders",
      ...(checkOrderColumns("Ad Orders")), sortable: true, resizable: true,
      cellRenderer: (params) => <>{params.value ?? 0}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "adOrders", hasFilter: true },
    },
    {
      headerName: "Organic Orders", field: "organicOrders", title: "Organic Orders",
      ...(checkOrderColumns("Organic Orders")), sortable: true, resizable: true,
      cellRenderer: (params) => <span style={{ color: params.value < 0 ? "#e74c3c" : "inherit" }}>{params.value}</span>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "organicOrders", hasFilter: true },
    },
    {
      headerName: "ACoS", field: "acos", title: "ACoS",
      ...(checkOrderColumns("ACoS")), sortable: true, resizable: true,
      cellRenderer: (params) => {
        const v = params.value;
        if (!v) return <span style={{ color: "#7f8c9a" }}>—</span>;
        return <span style={{ color: v > 50 ? "#e74c3c" : v > 30 ? "#f39c12" : "#27ae60", fontWeight: 600 }}>{v}%</span>;
      },
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "acos", hasFilter: true },
    },
    {
      headerName: "CVR", field: "cvr", title: "CVR",
      ...(checkOrderColumns("CVR")), sortable: true, resizable: true,
      cellRenderer: (params) => <>{params.value ? `${params.value}%` : "—"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "cvr", hasFilter: true },
    },
    {
      headerName: "Stock Days", field: "stockDays", title: "Stock Days",
      ...(checkOrderColumns("Stock Days")), sortable: true, resizable: true,
      cellRenderer: (params) => {
        const v = params.value;
        return <span style={{ color: v <= 7 ? "#e74c3c" : v <= 14 ? "#f39c12" : "#27ae60", fontWeight: v <= 14 ? 600 : 400 }}>{v} {v === 1 ? t("Day") : t("Days")}</span>;
      },
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "stockDays", hasFilter: true },
    },
    {
      headerName: "Action", field: "action", title: "Action",
      ...(checkOrderColumns("Action")), sortable: false, resizable: false,
      minWidth: 145,
      headerComponent: AgCustomHeader,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const key = (row.action || "").toUpperCase();
        const action = ACTION_LABELS[key] || { label: row.action, className: "improve" };
        return (
          <span
            className={`inline-flex items-center justify-center h-7 px-2.5 text-[10px] font-bold uppercase rounded-md shadow-xs select-none cursor-default pointer-events-none dash-action-btn ${action.className}`}
          >
            {t(action.label)}
          </span>
        );
      },
    },
  ], [isMobile, checkOrderColumns, sharedFilterParams, t]);

  // ── Column persistence ─────────────────────────────────────────────────────
  useEffect(() => {
    const fetchCustomColumns = async () => {
      const response = await ApiListGetColumns({ pageName: "Dashboard" });
      if (response?.isSuccess && response?.data?.columns?.length) {
        const visible = productColumns
          .map(c => ({ ...c, ...response.data.columns.find(col => col.title === c.title) }))
          .filter(c => c?.isDisplay || !c?.title)
          .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
        setVisibleColumns(visible);
      } else {
        setVisibleColumns(productColumns);
      }
    };
    if (profileId?.value) fetchCustomColumns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId?.value]);

  const handleSaveColumns = async (selectedColumns) => {
    setShowCustomizeModal(false);

    const optimisticVisible = productColumns
      .map(c => ({ ...c, ...selectedColumns.find(col => col.title === c.title) }))
      .filter(c => c?.isDisplay || !c?.title)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    setVisibleColumns(optimisticVisible);

    const response = await ApiListUpdateColumns({ pageName: "Dashboard", columns: selectedColumns });
    if (response?.isSuccess && response?.data?.columns) {
      const visible = productColumns
        .map(c => ({ ...c, ...response.data.columns.find(col => col.title === c.title) }))
        .filter(c => c?.isDisplay || !c?.title)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      setVisibleColumns(visible);
    }
  };

  useDebouncedColumnSave(handleSaveColumns);

  // Fetch Marketplaces
  const loadMarketplaces = async () => {
    try {
      const res = await ApiGetAllMarketplaces();
      if (res?.isSuccess) {
        setMarketplaceList(res.data || []);
      }
    } catch {
      Toast.error(t("Something went wrong loading marketplaces"));
    }
  };

  useEffect(() => {
    loadMarketplaces();
  }, []);

  // Fetch Product Types for Category Dropdown
  const loadProductTypes = async () => {
    try {
      const pid = currentProfileId;
      if (!pid) return;
      const res = await ApiGetProductTypes({ profileId: pid });
      if (res?.isSuccess) {
        if (res.marketplace_id) setMarketplace(res.marketplace_id);
        setProductTypes(
          res.productType?.map((p) => ({
            value: p.name,
            label: p.displayName,
          })) || []
        );
      } else {
        setProductTypes([]);
      }
    } catch {
      setProductTypes([]);
      Toast.error(t("Something went wrong loading categories"));
    }
  };

  // Fetch KPI Cards
  const loadKpiData = async () => {
    const pid = currentProfileId;
    if (!pid) return;
    try {
      setIsKpiLoading(true);
      const res = await ApiGetDashboardCards({
        profileId: pid,
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        marketplaceId: marketplace || "",
        performanceMatrix: selectedMatrix,
        productTypes: category === "all" ? "" : (category || ""),
        productName: searchSku || ""
      });
      if (res?.isSuccess && res.data) {
        setKpiData(res.data);
      }
    } catch {
      Toast.error(t("Something went wrong loading KPI data"));
    } finally {
      setIsKpiLoading(false);
    }
  };

  // Fetch Chart Data
  const loadChartData = async () => {
    const pid = currentProfileId;
    if (!pid) return;
    try {
      setIsGraphLoading(true);
      const res = await ApiGetDashboardGraph({
        profileId: pid,
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        marketplaceId: marketplace || "",
        performanceMatrix: selectedMatrix,
        productTypes: category === "all" ? "" : (category || ""),
        productName: searchSku || ""
      });
      if (res?.isSuccess && res.data) {
        setGraphData(res.data);
      }
    } catch {
      Toast.error(t("Something went wrong loading Chart data"));
    } finally {
      setIsGraphLoading(false);
    }
  };

  const loadGridData = async ({ page = gridPage, limit = gridPerPage, sortField = gridSortField, sortType = gridSortType, dynamicFilters = appliedFilters, overrides = {} } = {}) => {
    try {
      setLoadingGrid(true);
      const customFilter = addDashboardQuery({ appliedFilters: dynamicFilters, selectedMatrix });

      const payload = {
        profileId: currentProfileId,
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        marketplaceId: marketplace || "",
        performanceMatrix: selectedMatrix,
        productTypes: category === "all" ? "" : (category || ""),
        productName: searchSku || "",
        page,
        limit,
        sortField,
        sortType,
        ...(customFilter && customFilter !== "{}" && { customFilter }),
        ...overrides,
      };

      const res = await ApiGetDashboardGrid(payload);
      if (res?.data?.isSuccess) {
        setGridData(res?.data?.data || []);
        setGridTotal(res?.data?.total || 0);
      }
    } catch {
      Toast.error(t("Something went wrong loading product data"));
    } finally {
      setLoadingGrid(false);
    }
  };

  // Fetch Performance Matrix
  const loadMatrixData = async () => {
    const pid = currentProfileId;
    if (!pid) return;
    try {
      setIsMatrixLoading(true);
      const res = await ApiGetPerformanceMatrix({
        profileId: pid,
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        marketplaceId: marketplace || "",
        performanceMatrix: selectedMatrix,
        productTypes: category === "all" ? "" : (category || ""),
        productName: searchSku || ""
      });
      if (res?.isSuccess && res.data) {
        setMatrixData(res.data);
      }
    } catch {
      Toast.error(t("Something went wrong loading Matrix data"));
    } finally {
      setIsMatrixLoading(false);
    }
  };

  // Fetch Smart Insights
  const loadInsightsData = async (pageNum = 1) => {
    const pid = currentProfileId;
    if (!pid) return;
    try {
      if (pageNum === 1) {
        setIsInsightsLoading(true);
        setInsightsPage(1);
      } else {
        setIsInsightsLoadingMore(true);
      }
      const res = await ApiGetSmartInsights({
        profileId: pid,
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        marketplaceId: marketplace || "",
        performanceMatrix: selectedMatrix,
        productTypes: category === "all" ? "" : (category || ""),
        productName: searchSku || "",
        page: pageNum,
        limit: 15,
      });
      const newItems = res?.data || [];
      const hasMore = res?.pagination?.hasMore ?? (newItems.length >= 15);
      setHasMoreInsights(hasMore);
      setInsightsPage(pageNum);
      if (pageNum === 1) {
        setInsightsData(Array.isArray(newItems) ? newItems : []);
      } else {
        setInsightsData((prev) => [...prev, ...newItems]);
      }
    } catch {
      if (pageNum === 1) {
        setInsightsData([]);
        Toast.error(t("Something went wrong loading Smart Insights"));
      }
    } finally {
      setIsInsightsLoading(false);
      setIsInsightsLoadingMore(false);
    }
  };

  const loadMoreInsights = () => {
    if (!isInsightsLoadingMore && hasMoreInsights) {
      loadInsightsData(insightsPage + 1);
    }
  };


  // Load product types only when currentProfileId changes
  useEffect(() => {
    if (currentProfileId) {
      loadProductTypes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfileId]);

  // Listen for custom filter applies
  useEffect(() => {
    if (customFilterFlag && fieldName && conditionObj?.firstCondition) {
      let currentFilters = [...appliedFilters];
      const existingIdx = currentFilters.findIndex(f => f.apiFieldName === fieldName);
      const filterData = {
        apiFieldName: fieldName,
        condition: conditionObj.firstCondition,
        value: conditionObj.firstValue,
        operator: conditionObj.operator,
        secondCondition: conditionObj.secondCondition,
        secondValue: conditionObj.secondValue
      };

      if (existingIdx >= 0) {
        currentFilters[existingIdx] = filterData;
      } else {
        currentFilters.push(filterData);
      }

      setAppliedFilters(currentFilters);
      applyFilterToGrid(currentFilters);
      setCustomFilterFlag(false);
    }
  }, [customFilterFlag]);

  // Load KPI data with debounce to handle typing in the Search SKU input
  useEffect(() => {
    if (currentProfileId && date?.length) {
      const timeoutId = setTimeout(() => {
        loadKpiData();
        loadChartData();
        if (dashboardMode === "seller") {
          loadGridData({ page: 1 });
          setGridPage(1);
          loadMatrixData();
        }
        loadInsightsData();
      }, 350); // debounce API call by 350ms
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfileId, date, marketplace, selectedMatrix, category, searchSku, selectedAdType, dashboardMode]);

  useEffect(() => {
    if (currentProfileId) {
      setInsightsData([]);
      setKpiData(null);
      setGraphData(null);
      setMatrixData(null);
      setGridData([]);
    }
  }, [currentProfileId]);

  // Remove the duplicate useEffect that was causing multiple calls on fieldName/customFilterFlag change
  // The filter changes are now handled explicitly in the customFilterFlag effect above or in applyFilterToGrid

  const handlePageChange = (page) => { setGridPage(page); loadGridData({ page }); };
  const handlePerRowsChange = (newPerPage) => { setGridPerPage(newPerPage); setGridPage(1); loadGridData({ page: 1, limit: newPerPage }); };
  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    const sortType = sort === "asc" ? "asc" : "desc";
    setGridSortField(colId);
    setGridSortType(sortType);
    setGridPage(1);
    loadGridData({ sortField: colId, ...(sort && { sortType }), page: 1 });
  };

  const formatDeltaAbs = (absVal, isCurrency) => {
    if (absVal === null || absVal === undefined) return "";
    const sign = absVal >= 0 ? "+" : "-";
    const abs = Math.abs(absVal);
    const valStr = isCurrency ? CurrencyCode(abs) : abs;
    return `(${sign}${valStr})`;
  };

  const sellerKpiCards = kpiData ? [
    { label: "Total Sales", value: CurrencyCode(kpiData.totalSales || 0), delta: kpiData.totalSalesChange, deltaAbs: kpiData.totalSalesChangeAbs, isCurrency: true, green: kpiData.totalSalesChange >= 0, colorTheme: "theme-blue", isPrimary: true, accentColor: "var(--accent-primary)", metricKey: "sales" },
    { label: "Sales", value: CurrencyCode(kpiData.adSales || 0), delta: kpiData.adSalesChange, deltaAbs: kpiData.adSalesChangeAbs, isCurrency: true, green: kpiData.adSalesChange >= 0, colorTheme: "theme-green", isPrimary: true, accentColor: "var(--accent-primary)", metricKey: "sales" },
    { label: "Organic Sales", value: CurrencyCode(kpiData.organicSales || 0), delta: kpiData.organicSalesChange, deltaAbs: kpiData.organicSalesChangeAbs, isCurrency: true, green: (kpiData.organicSalesChange || 0) >= 0, colorTheme: "theme-teal", isPrimary: false, accentColor: "var(--accent-positive)", metricKey: "sales" },
    { label: "TACoS", value: `${kpiData.tacos}%`, delta: kpiData.tacosChange, deltaAbs: kpiData.tacosChangeAbs, isCurrency: false, green: kpiData.tacosChange <= 0, colorTheme: "theme-purple", accentColor: "var(--accent-warning)", metricKey: "acos" },
    { label: "ACoS", value: `${kpiData.acos}%`, delta: kpiData.acosChange, deltaAbs: kpiData.acosChangeAbs, isCurrency: false, green: kpiData.acosChange <= 0, colorTheme: "theme-orange", accentColor: "var(--accent-negative)", metricKey: "acos" },
    { label: "roas", value: `${kpiData.roas}`, delta: kpiData.roasChange, deltaAbs: kpiData.roasChangeAbs, isCurrency: false, green: kpiData.roasChange >= 0, colorTheme: "theme-yellow", accentColor: "var(--accent-positive)", metricKey: "roas" },
    {
      label: "conversionRate",
      value: `${kpiData.conversionRate}%`,
      delta: kpiData.conversionRateChange,
      deltaAbs: kpiData.conversionRateChangeAbs,
      isCurrency: false,
      green: kpiData.conversionRateChange >= 0,
      sparkline: { data: (kpiData.cvrTimeline || []).map(t => t?.cvr), color: "#2374F2" },
      colorTheme: "theme-pink",
      accentColor: "var(--accent-primary)",
      metricKey: "clicks",
    },
    {
      label: "Inventory Health",
      value: `${kpiData.healthScore}%`,
      colorTheme: "theme-teal",
      accentColor: "var(--accent-positive)",
      metricKey: "orders",
    },
  ] : KPI_CARDS_MOCK;

  const adsKpiCards = kpiData ? [
    { label: "Spend", value: CurrencyCode(kpiData.spend || 0), delta: kpiData.spendChange, deltaAbs: kpiData.spendChangeAbs, isCurrency: true, green: (kpiData.spendChange || 0) <= 0, colorTheme: "theme-orange", isPrimary: true, accentColor: "var(--accent-warning)", metricKey: "spend" },
    { label: "Ad Sales", value: CurrencyCode(kpiData.adSales || 0), delta: kpiData.adSalesChange, deltaAbs: kpiData.adSalesChangeAbs, isCurrency: true, green: (kpiData.adSalesChange || 0) >= 0, colorTheme: "theme-green", isPrimary: true, accentColor: "var(--accent-primary)", metricKey: "sales" },
    { label: "ACoS", value: `${kpiData.acos || 0}%`, delta: kpiData.acosChange, deltaAbs: kpiData.acosChangeAbs, isCurrency: false, green: (kpiData.acosChange || 0) <= 0, colorTheme: "theme-orange", accentColor: "var(--accent-negative)", metricKey: "acos" },
    { label: "roas", value: `${kpiData.roas || 0}`, delta: kpiData.roasChange, deltaAbs: kpiData.roasChangeAbs, isCurrency: false, green: (kpiData.roasChange || 0) >= 0, colorTheme: "theme-yellow", accentColor: "var(--accent-positive)", metricKey: "roas" },
    { label: "Orders", value: CurrencyFormat(kpiData.adOrders || 0), delta: kpiData.adOrdersChange, deltaAbs: kpiData.adOrdersChangeAbs, isCurrency: false, green: (kpiData.adOrdersChange || 0) >= 0, colorTheme: "theme-blue", accentColor: "var(--accent-primary)", metricKey: "orders" },
    { label: "Impressions", value: CurrencyFormat(kpiData.impressions || 0), delta: kpiData.impressionsChange, deltaAbs: kpiData.impressionsChangeAbs, isCurrency: false, green: (kpiData.impressionsChange || 0) >= 0, colorTheme: "theme-purple", accentColor: "var(--accent-primary)", metricKey: "impressions" },
    { label: "Clicks", value: CurrencyFormat(kpiData.clicks || 0), delta: kpiData.clicksChange, deltaAbs: kpiData.clicksChangeAbs, isCurrency: false, green: (kpiData.clicksChange || 0) >= 0, colorTheme: "theme-pink", accentColor: "var(--accent-primary)", metricKey: "clicks" },
    { label: "Avg CPC", value: CurrencyCode(kpiData.cpc || 0), delta: kpiData.cpcChange, deltaAbs: kpiData.cpcChangeAbs, isCurrency: true, green: (kpiData.cpcChange || 0) <= 0, colorTheme: "theme-teal", accentColor: "var(--accent-warning)", metricKey: "cpc" },
  ] : KPI_CARDS_MOCK;

  const currentCards = dashboardMode === "ads" ? adsKpiCards : sellerKpiCards;
  const kpiCards = (isSpLoaded && !isSpConnected)
    ? currentCards.filter(card => card.label !== "Total Sales" && card.label !== "Organic Sales")
    : currentCards;

  const getInsightIcon = (type) => {
    switch (type?.toLowerCase()) {
      case "scale":
        return <div className="insight-icon" style={{ background: "rgba(16, 185, 129, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>🚀</div>;
      case "improve":
      case "fix":
        return <div className="insight-icon" style={{ background: "rgba(245, 158, 11, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>⚠️</div>;
      case "optimize":
        return <div className="insight-icon" style={{ background: "rgba(249, 115, 22, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>⚠️</div>;
      case "stop":
        return <div className="insight-icon" style={{ background: "rgba(239, 68, 68, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>⚠️</div>;
      default:
        return <div className="insight-icon" style={{ background: "rgba(100, 116, 139, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>💡</div>;
    }
  };

  // Dashboard is for Admin only — redirect everyone else
  const hasViewPermission = PermissionCheck(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY);

  useEffect(() => {
    if (role === ROLES.SUPER_ADMIN) {
      navigate("/admin-dashboard", { replace: true });
    } else if (pagePermission && pagePermission.length > 0) {
      const isRootAvailable = pagePermission.some((p) => p.pageName === SYSTEM_PAGES.DASHBOARD || p.pageName === "Dashboard");
      if (!isRootAvailable || !hasViewPermission) {
        navigate("/", { replace: true });
      }
    }
  }, [role, hasViewPermission, pagePermission, navigate]);

  if (role === ROLES.SUPER_ADMIN || (pagePermission && pagePermission.length > 0 && !hasViewPermission)) return null;

  return (
    <div className="order-tracking-container">
      {/* ── Standard Header (profile, notifications, learning guide) ─── */}
      <Filter name={"Dashboard"} nameShow={false} dateShow={false} profileShow={true} />

      <div className="middle_container" style={{ paddingBottom: "120px" }}>

        {/* ── Filter Bar ───────────────────────────────────────────────── */}
        <div
          id={"dashboard-top-filters"}
          className={`glass-sticky-header dash-filter-bar ${!isMobile ? "sticky-top" : ""}`}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px 12px",
            padding: "8px 16px",
            zIndex: 90,
            marginTop: "-10px",
            marginBottom: "12px",
          }}
        >

          {/* ── Mode Switch: Seller vs Ads (Only shown when not vendor / when seller view exists) ── */}
          {!isVendor && (
            <div className="dash-mode-switcher inline-flex items-center h-9 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-white/10 shadow-xs shrink-0">
              <button
                type="button"
                onClick={() => setDashboardMode("seller")}
                className={`relative flex items-center gap-1.5 h-7 px-3 text-xs font-semibold rounded-lg transition-all duration-150 ${dashboardMode === "seller"
                  ? "bg-white text-[#2374F2] shadow-xs font-bold dark:bg-[#2374F2] dark:text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span>{t("Seller View")}</span>
              </button>
              <button
                type="button"
                onClick={() => setDashboardMode("ads")}
                className={`relative flex items-center gap-1.5 h-7 px-3 text-xs font-semibold rounded-lg transition-all duration-150 ${dashboardMode === "ads"
                  ? "bg-white text-[#2374F2] shadow-xs font-bold dark:bg-[#2374F2] dark:text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 11 18-5v12L3 14v-3z" />
                  <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                </svg>
                <span>{t("Ads View")}</span>
              </button>
            </div>
          )}

          {/* ── Group 1: Date + VS pill ────────────────────────────── */}
          <div className="dash-filter-left-group flex items-center gap-2 flex-wrap">
            {/* DATE */}
            <div className="dash-date-row flex items-center gap-2">
              <span className="dash-filter-label font-medium text-sm text-slate-700 whitespace-nowrap shrink-0">{t("Date")}:</span>
              <DateRangePicker
                className="dash-date-picker shrink-0"
                ranges={predefinedRanges}
                value={date}
                placeholder={t("Select Date")}
                onChange={handleDateChange}
              />
            </div>

            {/* VS comparison pill */}
            {kpiData?.prevFromDate && kpiData?.prevToDate && (
              <div id="previouse-date-range" className="flex items-center gap-1.5 bg-sky-500/[0.04] border border-sky-500/20 dark:bg-sky-500/[0.08] dark:border-sky-500/30 px-2 h-9 rounded-xl transition-all shrink-0">
                <span className="flex items-center justify-center p-1 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </span>
                <span className="text-[10px] font-extrabold text-sky-600 dark:text-sky-400 uppercase tracking-widest shrink-0">vs</span>
                <span className="text-[11px] font-bold text-sky-800 dark:text-sky-300 shrink-0 whitespace-nowrap">
                  {moment(kpiData.prevFromDate).format("DD MMM YYYY")}
                  {" – "}
                  {moment(kpiData.prevToDate).format("DD MMM YYYY")}
                </span>
              </div>
            )}
          </div>

          {/* ── Group 2: Marketplace ──────────────────────────────── */}
          <div className="dash-marketplace-group flex items-center gap-2 shrink-0">
            <span className="dash-filter-label font-medium text-sm text-slate-700 whitespace-nowrap shrink-0">{t("Marketplace")}:</span>
            <Select value={marketplace || undefined} onValueChange={(val) => setMarketplace(val)}>
              <SelectTrigger className="dash-marketplace-trigger w-[140px] lg:w-[180px] h-9">
                <SelectValue placeholder={t("Select Marketplace")}>
                  {marketplaceList.find(m => m.marketPlaceId === marketplace)?.countryCode || undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="z-[9999]">
                {marketplaceList.map((m) => (
                  <SelectItem key={m.marketPlaceId} value={m.marketPlaceId}>
                    {m.countryCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Group 3: Search Bar ───────────────────────────────── */}
          <div className="dash-search-group relative" style={{ height: "44px" }}>
            <Input
              type="text"
              placeholder={t("Search By Product Name, ASIN, SKU...")}
              value={searchSku}
              onChange={(e) => setSearchSku(e.target.value)}
              className="w-full h-full bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-slate-400 px-3 pr-[30px] text-sm text-slate-900 dark:text-white"
            />
            {searchSku && (
              <MdOutlineClose
                onClick={() => setSearchSku("")}
                style={{
                  position: "absolute",
                  top: "50%",
                  transform: "translateY(-50%)",
                  right: "10px",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  fontSize: "18px",
                  opacity: 0.7,
                  transition: "opacity 0.2s"
                }}
                onMouseEnter={(e) => e.target.style.opacity = 1}
                onMouseLeave={(e) => e.target.style.opacity = 0.7}
              />
            )}
          </div>

        </div>

        {/* ── KPI Metric Cards ─────────────────────────────────────────── */}
        <div id={"dashboard-top-cards"} className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6 w-full">
          {isKpiLoading ? (
            Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="dash-kpi-card-item h-[135px]">
                <div className="card glass-card h-full p-5 flex flex-col justify-between animate-pulse">
                  <div className="flex justify-between items-center w-full">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24"></div>
                    <div className="h-5 w-5 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
                  </div>
                  <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-36 mt-2"></div>
                  <div className="flex justify-between items-center w-full mt-2">
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-16"></div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-12"></div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            kpiCards.map((card, idx) => (
              <div
                key={card.label}
                className="dash-kpi-card-item"
                style={{
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <KPICard
                  label={card.label}
                  value={card.value}
                  delta={card.delta}
                  deltaAbs={card.deltaAbs}
                  green={card.green}
                  sparkline={card.sparkline}
                  colorTheme={card.colorTheme}
                  isCurrency={card.isCurrency}
                  isPrimary={card.isPrimary}
                  accentColor={card.accentColor}
                  index={idx}
                  metricKey={card.metricKey}
                  marketplace={activeCountryCode}
                  currencyCode={currencyCode}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            ))
          )}
        </div>

        {/* ── Main Chart (Full Width) ────────────────────────────────── */}
        <div className="dash-chart-card" id={"dashboard-chart"}>
          <DashbordGraph
            isChartLoading={isGraphLoading}
            chartData={graphData}
            currencyCode={currencyCode || "INR"}
            marketplace={activeCountryCode}
          />
        </div>

        {/* ── Row 4: Assigned vs. Without Assign Campaigns ── */}
        <div id="dashboard-campaign-breakdowns" className="w-full mb-5">
          <AssignedCampaignsWidget
            profileId={profileId?.value}
            adType={selectedAdType || "SP"}
            date={date}
            currencyCode={currencyCode || "INR"}
            marketplace={activeCountryCode}
          />
        </div>

        {/* ── Row 5: Ad Type Performance (Full Width Table) ─────────── */}
        <div id="dashboard-ad-type-breakdown" className="w-full mb-5">
          <AdTypeBreakdownWidget
            profileId={currentProfileId}
            date={date}
            currencyCode={activeCurrencyCode}
            marketplace={activeCountryCode}
          />
        </div>

        {/* ── Row 6: Time-Based Analytics & Recommendations (3 Equal Columns) ── */}
        <div id="dashboard-time-recommendations" className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5 w-full items-stretch">
          {/* Col 1: Orders by Day of Week */}
          <div className="w-full flex flex-col min-h-0">
            <OrdersByDayWidget
              profileId={currentProfileId}
              adType={selectedAdType || "SP"}
              date={date}
              currencyCode={activeCurrencyCode}
              marketplace={activeCountryCode}
            />
          </div>

          {/* Col 2: Peak Hours */}
          <div className="w-full flex flex-col min-h-0">
            <PeakHoursWidget
              profileId={currentProfileId}
              adType={selectedAdType || "SP"}
              date={date}
              currencyCode={activeCurrencyCode}
              marketplace={activeCountryCode}
            />
          </div>

          {/* Col 3: Recommendations Hub */}
          <div className="w-full flex flex-col min-h-0" id="dashboard-recommendations-hub">
            <DashboardRecommendations
              profileId={currentProfileId}
              adType={selectedAdType || "SP"}
              date={date}
            />
          </div>
        </div>

        {/* ── Row 7: Waste Spend (1/3) & Smart Insights (2/3) ── */}
        <div id="dashboard-waste-matrix-section" className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8 w-full items-stretch">
          {/* Col 1: Waste Spend Monitor */}
          <div className="w-full lg:col-span-1 flex flex-col min-h-0">
            <WasteSpendWidget
              profileId={currentProfileId}
              adType={selectedAdType || "SP"}
              date={date}
              currencyCode={activeCurrencyCode}
              marketplace={activeCountryCode}
            />
          </div>

          {/* Col 2 & 3: Smart Insights (Expanded Width) */}
          <div className="w-full lg:col-span-2 flex flex-col min-h-0" id="dashboard-smart-insights">
            <SmartInsightsWidget
              insightsData={insightsData}
              loading={isInsightsLoading}
              loadingMore={isInsightsLoadingMore}
              hasMore={hasMoreInsights}
              onLoadMore={loadMoreInsights}
              onRefresh={() => loadInsightsData(1)}
            />
          </div>
        </div>

        {/* ── Product Performance Matrix & Top Products: Only visible in Seller View ── */}
        {dashboardMode === "seller" && (
          <>
            {/* ── Row 8: Product Performance Matrix (Full Width 4-Block Bar) ── */}
            <div id="dash-matrix-section" className="w-full">
              <ProductPerformanceMatrixWidget
                matrixData={matrixData}
                loading={isMatrixLoading}
                selectedMatrix={selectedMatrix}
                onMatrixClick={handleMatrixClick}
                onClearFilter={clearMatrixFilter}
              />
            </div>

            {/* ── Row 9: Top Products Table (Full Width) ── */}
            <div id="dashboard-top-products" className="w-full mb-6">
              <div className="dash-products-section bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-xs p-5 flex flex-col">
              <div className="dash-products-header flex items-center justify-between" style={{ marginBottom: "12px" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <FiLayers className="w-4 h-4" />
                  </div>
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
                    {t("Top Products")}
                  </h3>
                </div>

                <AppTooltip text={t("Customize Columns")}>
                  <button
                    id={"dashboard-top-products-customize"}
                    onClick={() => setShowCustomizeModal(true)}
                    className="customize-button m-0 gap-0"
                    style={{ height: "36px", whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {t("Columns")}
                    <span style={{ fontSize: 9, marginLeft: 6, display: "inline-block", verticalAlign: "middle" }}>▼</span>
                  </button>
                </AppTooltip>
              </div>

              {/* Badges Area */}
              {appliedFilters.length > 0 && (
                <div className="filter-bar" style={{ marginBottom: "12px" }}>
                  <div className="filter-bar__inner">
                    <div className="filter-bar__left">
                      <span className="filter-bar__label" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <FiFilter />
                        {t("FILTERS")}
                      </span>

                      <div className="filter-bar__chips">
                        {appliedFilters.map((filter, idx) => (
                          <div
                            key={idx}
                            className="filter-chip"
                            style={{ display: "inline-flex", alignItems: "center" }}
                          >
                            <span className="filter-chip__label">
                              {getFilterBadgeText(filter)}
                            </span>
                            <button
                              className="filter-chip__remove"
                              onClick={() => removeFilter(filter.apiFieldName)}
                              aria-label={`Remove filter: ${getFilterBadgeText(filter)}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}

                        <button className="filter-bar__clear-btn" onClick={clearAllFilters}>
                          <span style={{ marginRight: 4, fontWeight: "bold" }}>×</span>
                          {t("Clear all")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div id={"dashboard-product-grid"} className="data_table position-relative glass-grid-container overflow-hidden flex-1">
                <AgTable ref={gridRef}
                  tableId="dashboard-top-products-table"
                  customSaveColumnName="Dashboard"
                  isCustomSaveColumns={true}
                  rowData={gridData}
                  columnDefs={productColumns}
                  totalRecords={gridTotal}
                  perPage={gridPerPage}
                  currentPage={gridPage}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  paginationOptions={paginationRowsPerPageOptions}
                  handleSaveColumns={handleSaveColumns}
                  pinnedBottomRowData={[]}
                  masterDetail={false}
                  height="calc(100vh - 460px)"
                  loading={loadingGrid}
                  onRefresh={() => loadGridData({ page: gridPage, limit: gridPerPage })}
                />
              </div>
            </div>
          </div>
        </>
      )}

      </div>

      {/* ── Column Filter Modal ───────────────────────────────────────── */}
      {filterModal && (
        <div className="dash-filter-modal-backdrop" onClick={closeFilter}>
          <div className="dash-filter-modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="dfm-header">
              <div className="flex items-center gap-2" style={{ flex: 1 }}>
                <div className="dfm-header-icon">
                  <FiFilter size={16} />
                </div>
                <span className="dfm-title">{t("Filter")}: {t(filterModal.label)}</span>
              </div>
              <button className="dfm-close" onClick={closeFilter}>
                <MdOutlineClose size={18} />
              </button>
            </div>

            {/* Condition */}
            <div className="dfm-field">
              <label className="dfm-label">
                {t("Condition")} <span className="dfm-required">*</span>
              </label>
              <div className="dfm-select-wrapper">
                <select
                  className="dfm-select"
                  value={filterCondition}
                  onChange={(e) => setFilterCondition(e.target.value)}
                >
                  <option value="">{t("Select Condition")}</option>
                  <option value="lt">{t("Less than")}</option>
                  <option value="lte">{t("Less than or equal")}</option>
                  <option value="eq">{t("Equal to")}</option>
                  <option value="gte">{t("Greater than or equal")}</option>
                  <option value="gt">{t("Greater than")}</option>
                </select>
              </div>
            </div>

            {/* Value */}
            <div className="dfm-field" style={{ paddingBottom: "16px" }}>
              <label className="dfm-label">
                {t("Value")} <span className="dfm-required">*</span>
              </label>
              <div className="dfm-input-wrapper">
                <span className="dfm-input-icon">
                  {filterModal.type === "percent"
                    ? <TbPercentage size={15} />
                    : (currencyCode === "INR" ? "₹" : "$")}
                </span>
                <input
                  className="dfm-input"
                  type="number"
                  min="0"
                  step={filterModal.type === "percent" ? "0.1" : "1"}
                  placeholder={filterModal.type === "percent" ? "e.g. 25.5" : "e.g. 10000"}
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                />
                {filterModal.type === "percent" && (
                  <span className="dfm-input-suffix">%</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="dfm-actions">
              <button className="dfm-btn-cancel" onClick={closeFilter}>
                {t("Cancel")}
              </button>
              <button
                className="dfm-btn-apply"
                onClick={handleFilterSubmit}
                disabled={!filterCondition || filterValue === ""}
              >
                {t("Apply Filter")}
              </button>
            </div>

          </div>
        </div>
      )}

      <CustomizeColumns
        showModal={showCustomizeModal}
        setShowModal={setShowCustomizeModal}
        allColumns={productColumns}
        selectedColumn={visibleColumns}
        handler={handleSaveColumns}
        defaultColumns={defaultColumns}
      />
    </div>
  );
};
