import React, { useState, useEffect, useContext, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import Filter from "../../../helper/filter/Filter";
import { ApiGetOrderReport } from "../../../api-wrapper/orders/ApiOrders";
import IndiaStateMap from "./IndiaStateMap";
import moment from "moment";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { Input } from "../../../components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../../components/ui/sheet";
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { MultiSelect } from "../../../components/ui/multi-select";
import AgTable from "../../../common/grid/AgTable";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { Search as SearchIcon, Info as InfoIcon, X as CloseIcon, List as ViewListIcon, Map as MapIcon, TrendingUp as TrendingUpIcon, ShoppingCart as ShoppingCartIcon, Wallet as AccountBalanceWalletIcon, LineChart as ShowChartIcon } from "lucide-react";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";


const P = {
  primary: "#1A9FD4",
  primary50: "#E0F4FD",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral400: "#94A3B8",
  neutral600: "#475569",
  neutral800: "#1E293B",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#E74C3C",
};

const STATUS_STYLES = {
  PENDING_AVAILABILITY: { label: "Pending Availability", color: "#166534", bg: "#f0fdf4", darkBg: "rgba(22,101,52,0.15)", darkColor: "#86efac" },
  PENDING: { label: "Pending", color: "#b45309", bg: "#fef3c7", darkBg: "rgba(245,158,11,0.15)", darkColor: "#fbbf24" },
  UNSHIPPED: { label: "Unshipped", color: "#7e22ce", bg: "#f3e8ff", darkBg: "rgba(139,92,246,0.15)", darkColor: "#c4b5fd" },
  PARTIALLY_SHIPPED: { label: "Partially Shipped", color: "#0369a1", bg: "#e0f2fe", darkBg: "rgba(14,165,233,0.15)", darkColor: "#7dd3fc" },
  SHIPPED: { label: "Payment Complete", color: "#1d4ed8", bg: "#dbeafe", darkBg: "rgba(59,130,246,0.15)", darkColor: "#93bbfd" },
  CANCELLED: { label: "Cancelled", color: "#b91c1c", bg: "#fee2e2", darkBg: "rgba(239,68,68,0.15)", darkColor: "#fca5a5" },
  UNFULFILLABLE: { label: "Unfulfillable", color: "#9d174d", bg: "#fce7f3", darkBg: "rgba(236,72,153,0.15)", darkColor: "#f9a8d4" },
};

// Custom Header Component
const CustomHeader = (props) => {
  const { displayName, tooltipText, enableSorting, progressSort } = props;
  const [currentSort, setCurrentSort] = React.useState(props.column.getSort());

  React.useEffect(() => {
    const onSortChanged = () => setCurrentSort(props.column.getSort());
    props.column.addEventListener("sortChanged", onSortChanged);
    return () => props.column.removeEventListener("sortChanged", onSortChanged);
  }, [props.column]);

  return (
    <div
      className="flex items-center gap-1"
      style={{ cursor: enableSorting ? "pointer" : "default" }}
      onClick={(e) => enableSorting && progressSort(e.shiftKey)}
    >
      <span className="ag-header-cell-text">{displayName}</span>
      {currentSort === "asc" && <i className="fa fa-arrow-up ml-1" style={{ fontSize: 11, color: "#fff" }} />}
      {currentSort === "desc" && <i className="fa fa-arrow-down ml-1" style={{ fontSize: 11, color: "#fff" }} />}
      {tooltipText && (
        <AppTooltip
          text={<div style={{ fontSize: 12, padding: "4px" }}>{tooltipText}</div>}
          placement="top"
          arrow
        >
          <InfoIcon
            size={13}
            style={{ color: "#fff", cursor: "help", marginLeft: 4 }}
            onClick={(e) => e.stopPropagation()}
          />
        </AppTooltip>
      )}
    </div>
  );
};

const OrderReport = () => {
  const { t } = useTranslation();
  const { profileId, selectedAdType, selectedDate, setSelectedDate, currencyCode } = useContext(ProfileContext);
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();
  const gridRef = useRef(null);

  const STATUS_OPTIONS = useMemo(() => Object.keys(STATUS_STYLES).map(key => ({
    value: key,
    label: (
      <div className="flex items-center" style={{ gap: 6, fontSize: 12 }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: "#94a3b8",
          display: "inline-block"
        }} />
        <span>{t(STATUS_STYLES[key].label)}</span>
      </div>
    ),
    searchLabel: t(STATUS_STYLES[key].label)
  })), [t]);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  useEffect(() => {
    const handleTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handleTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);



  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 720);
  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsNarrow(window.innerWidth < 720);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [activeTab, setActiveTab] = useState("product"); // "product" | "state"

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const [status, setStatus] = useState(["PENDING_AVAILABILITY", "PENDING", "UNSHIPPED", "PARTIALLY_SHIPPED", "SHIPPED", "UNFULFILLABLE"]);
  const [orderDateRange, setOrderDateRange] = useState(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
    }
    return [moment().subtract(30, "days").toDate(), new Date()];
  });

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      const newD1 = moment(selectedDate[0]).toDate();
      const newD2 = moment(selectedDate[1]).toDate();
      setOrderDateRange((prevDate) => {
        if (
          prevDate &&
          prevDate.length >= 2 &&
          moment(prevDate[0]).format("YYYY-MM-DD") === moment(newD1).format("YYYY-MM-DD") &&
          moment(prevDate[1]).format("YYYY-MM-DD") === moment(newD2).format("YYYY-MM-DD")
        ) {
          return prevDate;
        }
        return [newD1, newD2];
      });
    }
  }, [selectedDate]);

  const [gridData, setGridData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gridPage, setGridPage] = useState(1);
  const [gridPerPage, setGridPerPage] = useState(25);
  const [sortCol, setSortCol] = useState("totalQty");
  const [sortOrder, setSortOrder] = useState("desc");

  // State for the slide-out Drawer details view
  const [selectedProductOrders, setSelectedProductOrders] = useState(null);

  // Search state inside the orders breakdown drawer
  const [drawerSearch, setDrawerSearch] = useState("");
  const [drawerStatus, setDrawerStatus] = useState(undefined);
  const [drawerPage, setDrawerPage] = useState(1);

  // Summary statistics
  const [summary, setSummary] = useState({
    totalCost: 0,
    totalSales: 0,
    totalProfit: 0,
    currency: "INR"
  });

  const lastFetchParamsRef = useRef("");

  const handleRefresh = () => {
    fetchReport(gridPage, gridPerPage, sortCol, sortOrder, true);
  };

  const fetchReport = async (
    page = gridPage,
    perPage = gridPerPage,
    col = sortCol,
    order = sortOrder,
    isReload = false
  ) => {
    if (!profileId?.value) return;

    if (isSpLoaded && !isSpConnected) {
      setGridData([]);
      setTotalRecords(0);
      setTotalOrders(0);
      setSummary({ totalCost: 0, totalSales: 0, totalProfit: 0, currency: "INR" });
      setLoading(false);
      return;
    }

    const fromDateStr = orderDateRange?.[0] ? moment(orderDateRange[0]).format("YYYY-MM-DD") : undefined;
    const toDateStr = orderDateRange?.[1] ? moment(orderDateRange[1]).format("YYYY-MM-DD") : undefined;

    const requestSignature = JSON.stringify({
      profileId: profileId.value,
      pageNo: page,
      perPage,
      search: debouncedSearch || "",
      orderStatus: status || [],
      fromDate: fromDateStr,
      toDate: toDateStr,
      fieldName: col || "",
      sortType: order || ""
    });

    if (!isReload && lastFetchParamsRef.current === requestSignature) {
      return;
    }

    lastFetchParamsRef.current = requestSignature;
    setLoading(true);
    try {
      const payload = {
        profileId: profileId.value,
        pageNo: page,
        perPage,
        search: debouncedSearch || undefined,
        orderStatus: status.length ? status : undefined,
        fromDate: fromDateStr,
        toDate: toDateStr,
        fieldName: col || undefined,
        sortType: order === "desc" ? "DESC" : order === "asc" ? "ASC" : undefined,
      };
      const res = await ApiGetOrderReport(payload);
      if (res?.isSuccess) {
        const data = res.data || [];
        setGridData(data);
        setTotalRecords(res.totalRecords || 0);
        setTotalOrders(res.totalOrders || 0);
        setGridPage(page);

        setSummary({
          totalCost: res.globalCost || 0,
          totalSales: res.globalSales || 0,
          totalProfit: (res.globalSales || 0) - (res.globalCost || 0),
          currency: "INR"
        });
      }
    } catch (err) {
      console.error("Order Report Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
  }, [profileId?.value]);

  // Re-fetch on filter change
  useEffect(() => {
    if (!profileId?.value) return;
    fetchReport(1);
  }, [profileId?.value, selectedAdType, debouncedSearch, status, orderDateRange]);

  const handleGridSort = (e) => {
    const columnState = e.api.getColumnState();
    const sorted = columnState.find((s) => s.sort !== null);
    if (sorted) {
      const { colId, sort } = sorted;
      setSortCol(colId);
      setSortOrder(sort);
      fetchReport(gridPage, gridPerPage, colId, sort);
    } else {
      setSortCol(null);
      setSortOrder(null);
      fetchReport(gridPage, gridPerPage, null, null);
    }
  };

  // Reset drawer pagination when drawer filters or selected product change
  useEffect(() => {
    setDrawerPage(1);
  }, [drawerSearch, drawerStatus, selectedProductOrders]);

  // All status options available in the module
  const drawerStatusOptions = useMemo(() => {
    return Object.keys(STATUS_STYLES).map(key => ({
      label: STATUS_STYLES[key].label,
      value: key
    }));
  }, []);

  // Filter orders in-memory by drawerSearch and drawerStatus
  const filteredOrders = useMemo(() => {
    if (!selectedProductOrders?.orders) return [];
    let list = selectedProductOrders.orders;
    if (drawerSearch.trim()) {
      list = list.filter(o => o.orderId?.toLowerCase().includes(drawerSearch.toLowerCase().trim()));
    }
    if (drawerStatus) {
      list = list.filter(o => o.orderStatus === drawerStatus);
    }
    return list;
  }, [selectedProductOrders?.orders, drawerSearch, drawerStatus]);

  // Paginate filtered orders
  const paginatedOrders = useMemo(() => {
    const start = (drawerPage - 1) * 10;
    const end = start + 10;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, drawerPage]);

  const columns = useMemo(() => [
    {
      title: "Product Details",
      headerName: t("Product Details"),
      field: "title",
      minWidth: 320,
      flex: 2.5,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex items-center gap-3 h-full" style={{ padding: "4px 0" }}>
            <div style={{
              width: 48, minWidth: 48, height: 48,
              borderRadius: 6, overflow: "hidden",
              border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.08)" : P.neutral200}`,
              background: isDark ? "rgba(255, 255, 255, 0.05)" : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
            }}>
              {row.imageURL
                ? <img src={row.imageURL} alt="product" style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }} />
                : <i className="fa fa-picture-o" style={{ fontSize: 16, color: P.neutral400 }} />
              }
            </div>
            <div className="flex flex-col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: isDark ? "#cbd5e1" : P.neutral800,
                lineHeight: 1.3,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "normal"
              }}>
                {row.title}
              </span>
              <div className="flex flex-col" style={{ gap: 1, fontSize: 10, color: P.neutral600 }}>
                <span>ASIN: <span style={{ color: isDark ? "#2374F2" : P.primary, fontWeight: 600, fontFamily: "inherit" }}>{row.asin}</span></span>
                <span style={{ wordBreak: "break-all" }}>SKU: <span style={{ color: isDark ? "#2374F2" : P.primary, fontWeight: 600, fontFamily: "inherit" }}>{row.sku}</span></span>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: "Costing Details",
      headerName: t("Costing Details"),
      field: "productCost",
      width: 220,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("Base Unit Price and calculated total Product Cost (Quantity x Base Price).") },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex flex-col justify-center h-full" style={{ gap: 5, padding: "8px 0" }}>
            <div className="flex items-center justify-between" style={{ fontSize: 11, color: P.neutral600 }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>{t("Base Price")}:</span>
              <span style={{ fontWeight: 600, color: isDark ? "#cbd5e1" : P.neutral800 }}>
                ₹{(row.basePrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
              background: isDark ? "rgba(239, 68, 68, 0.08)" : "linear-gradient(135deg, rgba(231, 76, 60, 0.04) 0%, rgba(231, 76, 60, 0.08) 100%)",
              border: `1px solid ${isDark ? "rgba(239, 68, 68, 0.25)" : "rgba(231, 76, 60, 0.2)"}`,
              borderRadius: 6,
              padding: "5px 10px"
            }}>
              <span style={{ fontWeight: 600, color: isDark ? "#f87171" : P.danger }}>{t("Cost")}:</span>
              <span style={{ fontWeight: 700, color: isDark ? "#f87171" : P.danger }}>
                {CurrencyCode(row.productCost || 0, currencyCode)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: "Sales & Pricing",
      headerName: t("Sales & Pricing"),
      field: "totalSalesValue",
      width: 170,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("Unit Selling Price and calculated total Sales Value (Quantity x Selling Price).") },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex flex-col justify-center h-full" style={{ gap: 5, padding: "8px 0" }}>
            <div className="flex items-center justify-between" style={{ fontSize: 11, color: P.neutral600 }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>{t("Selling Price")}:</span>
              <span style={{ fontWeight: 600, color: isDark ? "#cbd5e1" : P.neutral800 }}>
                {CurrencyCode(row.sellingPrice || 0, currencyCode)}
              </span>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
              background: isDark ? "rgba(74, 222, 128, 0.08)" : "linear-gradient(135deg, rgba(22, 163, 74, 0.04) 0%, rgba(22, 163, 74, 0.08) 100%)",
              border: `1px solid ${isDark ? "rgba(74, 222, 128, 0.25)" : "rgba(22, 163, 74, 0.2)"}`,
              borderRadius: 6,
              padding: "5px 10px"
            }}>
              <span style={{ fontWeight: 600, color: isDark ? "#4ade80" : P.success }}>{t("Sales Value")}:</span>
              <span style={{ fontWeight: 700, color: isDark ? "#4ade80" : P.success }}>
                {CurrencyCode(row.totalSalesValue || 0, currencyCode)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: "Orders Summary",
      headerName: t("Orders Summary"),
      field: "ordersCount",
      width: 160,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex flex-col justify-center h-full" style={{ gap: 4 }}>
            <span style={{ fontSize: 11, color: P.neutral600 }}>
              {t("Total Orders")}: <strong style={{ color: isDark ? "#2374F2" : P.primary }}>{row.ordersCount}</strong>
            </span>
            <span style={{ fontSize: 11, color: P.neutral600 }}>
              {t("Total Qty")}: <strong style={{ color: isDark ? "#cbd5e1" : P.neutral800 }}>{row.totalQty} {t("units")}</strong>
            </span>
          </div>
        );
      },
    },
    {
      title: "Ad Spend",
      headerName: t("Ad Spend"),
      field: "adSpent",
      width: 170,
      headerComponent: CustomHeader,
      headerComponentParams: { tooltipText: t("Total Ad Spend and Ad Orders count.") },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex flex-col justify-center h-full" style={{ gap: 5, padding: "8px 0" }}>
            <div className="flex items-center justify-between" style={{ fontSize: 11, color: P.neutral600 }}>
              <span style={{ color: "#64748b", fontWeight: 500 }}>{t("Ad Orders")}:</span>
              <span style={{ fontWeight: 600, color: isDark ? "#cbd5e1" : P.neutral800 }}>
                {row.adOrders ?? 0}
              </span>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
              background: isDark ? "rgba(26, 159, 212, 0.08)" : "linear-gradient(135deg, rgba(2, 70, 139, 0.04) 0%, rgba(2, 70, 139, 0.08) 100%)",
              border: `1px solid ${isDark ? "rgba(26, 159, 212, 0.25)" : "rgba(2, 70, 139, 0.2)"}`,
              borderRadius: 6,
              padding: "5px 10px"
            }}>
              <span style={{ fontWeight: 600, color: isDark ? "#2374F2" : P.primary }}>{t("Ad Spend")}:</span>
              <span style={{ fontWeight: 700, color: isDark ? "#2374F2" : P.primary }}>
                {CurrencyCode(row.adSpent || 0, currencyCode)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: "Orders Breakdown",
      headerName: t("Orders Breakdown"),
      field: "ordersList",
      width: 160,
      cellRenderer: (params) => {
        const orders = params.value || [];
        return (
          <div className="flex items-center h-full">
            <span
              style={{
                color: isDark ? "#2374F2" : P.primary,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: 12
              }}
              onClick={() => {
                setDrawerSearch("");
                setSelectedProductOrders({ title: params.data.title, sku: params.data.sku, imageURL: params.data.imageURL, asin: params.data.asin, orders });
              }}
            >
              {t("View Details")} →
            </span>
          </div>
        );
      },
    },
  ], [t, isDark]);

  return (
    <div className="order-tracking-container">
      <Filter nameShow={false} dateShow={false} profileShow={true} />

      {/* ── Page Content ── */}
      <div className="middle_container">
        {/* ── Sticky Top Bar ── */}
        <div
          id="order-report-filters"
          className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            flexWrap: isNarrow ? "wrap" : "nowrap",
            overflowX: "auto",
            columnGap: 12,
            rowGap: 10,
            padding: isMobile ? "10px 16px" : "10px 24px",
            zIndex: 90,
            top: 0,
            marginLeft: 0,
            marginRight: 0,
            marginTop: "-10px",
            marginBottom: "20px",
          }}
        >
          {/* Search */}
          <div
            id="order-report-search"
            className="search_option relative flex items-center"
            style={{
              flex: "1 1 auto",
              minWidth: 100,
              maxWidth: isNarrow ? "100%" : 320,
              width: isNarrow ? "100%" : undefined,
            }}
          >
            <Input
              type="text"
              value={search}
              placeholder={t("Search by ASIN, SKU, Product Title...")}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setDebouncedSearch(search)}
              className="flex-grow border-none outline-none bg-transparent shadow-none px-0 focus-visible:ring-0"
            />
            {search && (
              <span
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                }}
                style={{
                  padding: "0 8px",
                  cursor: "pointer",
                  color: P.neutral400,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <CloseIcon style={{ fontSize: 16 }} />
              </span>
            )}
          </div>

          {/* Right-aligned filters group */}
          <div style={{ display: "flex", flexWrap: isNarrow ? "wrap" : "nowrap", gap: 12, marginLeft: "auto", justifyContent: "flex-end", flex: "1 1 auto", width: isNarrow ? "100%" : undefined }}>
            {/* Status Multi-Select */}
            <div id="order-report-status" style={{ flex: "1 1 auto", minWidth: 100, maxWidth: isNarrow ? "100%" : 360, width: isNarrow ? "100%" : undefined }}>
              <MultiSelect
                options={STATUS_OPTIONS}
                value={status}
                onChange={(val) => setStatus(val || [])}
                placeholder={t("All Statuses")}
                className="bg-transparent h-10 w-full"
                useSummaryDisplay={true}
                summaryTitle={t("Statuses")}
                showSelectAll={true}
                dropdownWidth="w-[280px]"
              />
            </div>

            {/* Date Range */}
            <div id="order-report-date-picker" style={{ flex: "1 1 auto", minWidth: 150, maxWidth: isNarrow ? "100%" : 260, width: isNarrow ? "100%" : undefined }}>
              <DateRangePicker
                className="w-full"
                ranges={predefinedRanges}
                value={orderDateRange}
                placeholder={t("Select Date Range")}
                onChange={(range) => setOrderDateRange(range || [])}
                placement="bottomEnd"
                format="yyyy-MM-dd"
                cleanable={true}
                style={{ height: 40, width: "100%" }}
              />
            </div>
          </div>
        </div>

        {/* Active Filter Badges Row */}
        {status && status.length > 0 && (
          <div
            id="order-report-applied-filter"
            className="mb-3 flex items-center flex-wrap gap-2 p-2 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 backdrop-blur-sm shadow-sm transition-all duration-300 w-full"
          >
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider select-none shrink-0 ml-1.5 mr-1">
              {t("Active Filters:")}
            </span>
            {status.map((s) => {
              const st = STATUS_STYLES[s];
              return (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/70 hover:text-slate-800 dark:hover:text-slate-100 transition-all select-none shadow-sm cursor-pointer"
                  onClick={() => setStatus(status.filter((val) => val !== s))}
                >
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: st?.color || "#64748b",
                    display: "inline-block"
                  }} />
                  {st?.label ? t(st.label) : s}
                  <CloseIcon className="w-3.5 h-3.5 opacity-60 hover:opacity-100 transition-opacity ml-1 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400" />
                </span>
              );
            })}
            <span
              className="text-[11px] font-bold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 transition-colors cursor-pointer select-none underline decoration-rose-500/30 decoration-2 underline-offset-2 ml-auto shrink-0 mr-1.5"
              onClick={() => setStatus([])}
            >
              {t("Clear All")}
            </span>
          </div>
        )}

        <div className="w-full">
          {!isSpConnected && isSpLoaded ? (
            <SpAccountNotConnected feature={t("Order Report")} isDark={isDark} />
          ) : (
            <>
              {/* ── Summary Metric Cards (always visible) ── */}
              <div id="order-report-top-cards" className="or-metric-cards">
                <div className="or-metric-card">
                  <div className="or-metric-card__icon" style={{ background: isDark ? "rgba(26, 159, 212, 0.15)" : "linear-gradient(135deg, #E0F4FD, #C5DCF5)" }}>
                    <ShoppingCartIcon style={{ fontSize: 20, color: isDark ? "#2374F2" : P.primary }} />
                  </div>
                  <div className="or-metric-card__content">
                    <span className="or-metric-card__label">{t("Total Orders")}</span>
                    <span className="or-metric-card__value" style={{ color: isDark ? "#2374F2" : P.primary }}>
                      {totalOrders.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
                <div className="or-metric-card">
                  <div className="or-metric-card__icon" style={{ background: isDark ? "rgba(22, 163, 74, 0.15)" : "linear-gradient(135deg, #DCFCE7, #BBF7D0)" }}>
                    <TrendingUpIcon style={{ fontSize: 20, color: isDark ? "#4ade80" : P.success }} />
                  </div>
                  <div className="or-metric-card__content">
                    <span className="or-metric-card__label">{t("Total Sales")}</span>
                    <span className="or-metric-card__value" style={{ color: isDark ? "#4ade80" : P.success }}>
                      {summary.currency} {summary.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="or-metric-card">
                  <div className="or-metric-card__icon" style={{ background: isDark ? "rgba(239, 68, 68, 0.15)" : "linear-gradient(135deg, #FEE2E2, #FECACA)" }}>
                    <AccountBalanceWalletIcon style={{ fontSize: 20, color: isDark ? "#f87171" : P.danger }} />
                  </div>
                  <div className="or-metric-card__content">
                    <span className="or-metric-card__label">{t("Total Cost")}</span>
                    <span className="or-metric-card__value" style={{ color: isDark ? "#f87171" : P.danger }}>
                      {summary.currency} {summary.totalCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="or-metric-card">
                  <div className="or-metric-card__icon" style={{ background: summary.totalProfit >= 0 ? (isDark ? "rgba(124, 58, 237, 0.15)" : "linear-gradient(135deg, #EDE9FE, #DDD6FE)") : (isDark ? "rgba(239, 68, 68, 0.15)" : "linear-gradient(135deg, #FEE2E2, #FECACA)") }}>
                    <ShowChartIcon style={{ fontSize: 20, color: summary.totalProfit >= 0 ? (isDark ? "#a78bfa" : "#7C3AED") : (isDark ? "#f87171" : P.danger) }} />
                  </div>
                  <div className="or-metric-card__content">
                    <span className="or-metric-card__label">{t("Gross Margin")}</span>
                    <span className="or-metric-card__value" style={{ color: summary.totalProfit >= 0 ? (isDark ? "#a78bfa" : "#7C3AED") : (isDark ? "#f87171" : P.danger) }}>
                      {summary.currency} {summary.totalProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Content Container with integrated tabs ── */}
              <div id="order-report-main-table" className="glass-grid-container overflow-hidden mt-4">
                {/* Header with integrated tab switcher */}
                <div className="or-container-header">
                  <div id="order-report-tab-view" className="or-tab-switcher">
                    <div className="or-tab-switcher__track">
                      <div
                        className="or-tab-switcher__indicator"
                        style={{ transform: activeTab === "product" ? "translateX(0)" : "translateX(100%)" }}
                      />
                      <button
                        className={`or-tab-switcher__btn ${activeTab === "product" ? "or-tab-switcher__btn--active" : ""}`}
                        onClick={() => setActiveTab("product")}
                      >
                        <ViewListIcon style={{ fontSize: 16 }} />
                        <span>{t("Product Wise")}</span>
                      </button>
                      <button
                        className={`or-tab-switcher__btn ${activeTab === "state" ? "or-tab-switcher__btn--active" : ""}`}
                        onClick={() => setActiveTab("state")}
                      >
                        <MapIcon style={{ fontSize: 16 }} />
                        <span>{t("State Wise")}</span>
                      </button>
                    </div>
                  </div>
                  {activeTab === "product" && (
                    <span style={{ fontSize: 11, color: P.neutral400, fontWeight: 500 }}>
                      {totalRecords} {t("products")}
                    </span>
                  )}
                </div>

                {/* Product Wise Content */}
                {activeTab === "product" && (
                  <AgTable ref={gridRef}
                    onRefresh={handleRefresh}
                    tableId="order-report-grid"
                    height="65vh"
                    rowHeight={80}
                    rowData={gridData}
                    columnDefs={columns}
                    totalRecords={totalRecords}
                    perPage={gridPerPage}
                    currentPage={gridPage}
                    onPageChange={(p) => fetchReport(p, gridPerPage)}
                    onPerPageChange={(pp) => { setGridPerPage(pp); fetchReport(1, pp); }}
                    onSortChanged={handleGridSort}
                    loading={loading}
                    isCustomSaveColumns={true}
                    customSaveColumnName="Order Report Grid"
                  />
                )}

                {/* State Wise Content */}
                {activeTab === "state" && (
                  <div style={{ padding: 16 }}>
                    <IndiaStateMap
                      profileId={profileId}
                      orderDateRange={orderDateRange}
                      isMobile={isMobile}
                      isDark={isDark}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slide-out Drawer for Orders Breakdown */}
      <Sheet open={!!selectedProductOrders} onOpenChange={(open) => !open && setSelectedProductOrders(null)}>
        <SheetContent className="w-[500px] sm:max-w-none p-0 flex flex-col bg-[#f8fafc] dark:bg-[#0e121e]">
          <SheetHeader className="px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#111726]">
            <SheetTitle asChild>
              <div className="flex items-center" style={{ gap: 10, fontFamily: '"Inter", sans-serif' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 6, overflow: "hidden",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : P.neutral200}`,
                  display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: isDark ? "rgba(255,255,255,0.05)" : "#fff"
                }}>
                  {selectedProductOrders?.imageURL ? (
                    <img src={selectedProductOrders.imageURL} alt="Product" style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }} />
                  ) : (
                    <i className="fa fa-picture-o" style={{ fontSize: 12, color: P.neutral400 }} />
                  )}
                </div>
                <div className="flex flex-col items-start" style={{ gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#cbd5e1" : P.neutral800, fontFamily: "inherit" }}>{t("Orders Breakdown")}</span>
                  {selectedProductOrders && (
                    <span style={{ fontSize: 10, color: isDark ? "#94a3b8" : P.neutral600, fontFamily: "inherit", fontWeight: "normal" }}>
                      ASIN: {selectedProductOrders.asin} | SKU: {selectedProductOrders.sku}
                    </span>
                  )}
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4" style={{ fontFamily: '"Inter", sans-serif' }}>
            {selectedProductOrders && (
              <div className="flex flex-col" style={{ gap: 8, maxHeight: "100%", overflowY: "auto", fontFamily: "inherit" }}>

                {/* Compact Product Banner */}
                <div style={{
                  background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : P.neutral200}`,
                  fontSize: 11,
                  fontWeight: 600,
                  color: isDark ? "#cbd5e1" : P.neutral800,
                  lineHeight: 1.3,
                  fontFamily: "inherit"
                }}>
                  {selectedProductOrders.title}
                </div>

                {/* In-Drawer Filters Bar */}
                <div className="flex items-center" style={{ gap: 8, fontFamily: "inherit" }}>
                  <div className="relative flex items-center" style={{ flex: 1.5 }}>
                    <Input
                      placeholder={t("Search Order ID...")}
                      value={drawerSearch}
                      onChange={(e) => setDrawerSearch(e.target.value)}
                      className="pl-2 h-[34px] text-xs rounded-md w-full bg-white dark:bg-[#161b26] border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                      style={{ fontFamily: "inherit" }}
                    />
                    {drawerSearch && (
                      <CloseIcon
                        className="absolute right-2 text-slate-400 cursor-pointer"
                        style={{ fontSize: 16 }}
                        onClick={() => setDrawerSearch("")}
                      />
                    )}
                  </div>
                  <ShadcnSelect value={drawerStatus || "all"} onValueChange={(val) => setDrawerStatus(val === "all" ? null : val)}>
                    <SelectTrigger className="w-[150px] h-[34px] text-xs bg-white dark:bg-[#161b26] border-slate-200 dark:border-slate-700">
                      <SelectValue placeholder={t("Filter Status")} />
                    </SelectTrigger>
                    <SelectContent className="z-[99999] bg-white dark:bg-[#161b26] border-slate-200 dark:border-slate-700">
                      <SelectItem value="all">{t("All")}</SelectItem>
                      {drawerStatusOptions.filter(o => o.value !== null).map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{t(opt.label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </ShadcnSelect>
                </div>

                {/* List of High-Legibility Compact Order Cards */}
                <div className="flex flex-col" style={{ gap: 6, fontFamily: "inherit" }}>
                  {paginatedOrders.length > 0 ? (
                    paginatedOrders.map((o, idx) => {
                      const isShipped = o.orderStatus === "SHIPPED";
                      return (
                        <div
                          key={idx}
                          style={{
                            borderRadius: 6,
                            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : P.neutral200}`,
                            borderLeft: `3px solid ${isShipped ? P.success : P.warning}`,
                            background: isDark ? "rgba(255,255,255,0.02)" : "#fff",
                            fontFamily: "inherit",
                            padding: "8px 12px"
                          }}
                        >
                          <div className="flex justify-between items-center" style={{ marginBottom: 6, fontFamily: "inherit" }}>
                            <div style={{ fontFamily: "inherit" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#2374F2" : P.primary, fontFamily: "inherit" }}>
                                {o.orderId}
                              </div>
                              <div style={{ fontSize: 9, color: isDark ? "#94a3b8" : P.neutral600, marginTop: 1, fontFamily: "inherit" }}>
                                {moment(o.orderCreatedTime).format("DD MMM YYYY, hh:mm A")}
                              </div>
                            </div>
                            <span style={{ fontSize: 8, fontWeight: 700, margin: 0, textTransform: "uppercase", padding: "2px 6px", fontFamily: "inherit", borderRadius: "4px", backgroundColor: isShipped ? "rgba(34, 197, 94, 0.15)" : "rgba(249, 115, 22, 0.15)", color: isShipped ? "#22c55e" : "#f97316", border: `1px solid ${isShipped ? "#22c55e" : "#f97316"}` }}>
                              {isShipped ? t("Shipped") : t(STATUS_STYLES[o.orderStatus]?.label || o.orderStatus?.toLowerCase())}
                            </span>
                          </div>

                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "1.2fr 1fr 1fr",
                            gap: 6,
                            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : P.neutral100}`,
                            paddingTop: 6,
                            fontFamily: "inherit"
                          }}>
                            <div className="flex flex-col" style={{ fontFamily: "inherit" }}>
                              <span style={{ fontSize: 8, color: isDark ? "#64748b" : P.neutral400, textTransform: "uppercase", fontWeight: 600, fontFamily: "inherit" }}>{t("Buyer")}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: isDark ? "#cbd5e1" : P.neutral800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "inherit" }}>
                                {o.buyerName || "—"}
                              </span>
                            </div>

                            <div className="flex flex-col items-center" style={{ fontFamily: "inherit" }}>
                              <span style={{ fontSize: 8, color: isDark ? "#64748b" : P.neutral400, textTransform: "uppercase", fontWeight: 600, fontFamily: "inherit" }}>{t("Qty")}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: isDark ? "#cbd5e1" : P.neutral800, fontFamily: "inherit" }}>
                                {o.quantityOrdered} {o.quantityOrdered > 1 ? t("units") : t("unit")}
                              </span>
                            </div>

                            <div className="flex flex-col items-end" style={{ fontFamily: "inherit" }}>
                              <span style={{ fontSize: 8, color: isDark ? "#64748b" : P.neutral400, textTransform: "uppercase", fontWeight: 600, fontFamily: "inherit" }}>{t("Amount")}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#cbd5e1" : P.neutral800, fontFamily: "inherit" }}>
                                {CurrencyCode((o.totalAmount || (o.quantityOrdered * o.price) || 0), o.currencyCode || currencyCode)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: "center", padding: "16px 0", color: P.neutral400, fontSize: 11, fontFamily: "inherit" }}>
                      {t("No matching orders found.")}
                    </div>
                  )}
                </div>

                {/* Pagination Controls */}
                {filteredOrders.length > 10 && (
                  <div className="flex justify-center items-center gap-2" style={{ marginTop: 12, paddingBottom: 12, fontFamily: "inherit", fontSize: 12 }}>
                    <button
                      disabled={drawerPage === 1}
                      onClick={() => setDrawerPage(p => p - 1)}
                      style={{ padding: "4px 8px", border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`, borderRadius: 4, background: isDark ? "#1e293b" : "#fff", color: isDark ? "#cbd5e1" : "#0f172a", opacity: drawerPage === 1 ? 0.5 : 1, cursor: drawerPage === 1 ? "not-allowed" : "pointer" }}
                    >
                      {t("Prev")}
                    </button>
                    <span style={{ color: isDark ? "#cbd5e1" : "#475569" }}>
                      {t("Page {{current}} of {{total}}", { current: drawerPage, total: Math.ceil(filteredOrders.length / 10) })}
                    </span>
                    <button
                      disabled={drawerPage === Math.ceil(filteredOrders.length / 10)}
                      onClick={() => setDrawerPage(p => p + 1)}
                      style={{ padding: "4px 8px", border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`, borderRadius: 4, background: isDark ? "#1e293b" : "#fff", color: isDark ? "#cbd5e1" : "#0f172a", opacity: drawerPage === Math.ceil(filteredOrders.length / 10) ? 0.5 : 1, cursor: drawerPage === Math.ceil(filteredOrders.length / 10) ? "not-allowed" : "pointer" }}
                    >
                      {t("Next")}
                    </button>
                  </div>
                )}

              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default OrderReport;
