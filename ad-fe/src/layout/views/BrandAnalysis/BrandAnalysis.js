import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import moment from "moment-timezone";
import React, { useContext, useState, useEffect, useMemo, useRef } from "react";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { Toast } from "../../../helper/links/Link";
import { useTranslation } from "react-i18next";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import AgTable from "../../../common/grid/AgTable";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../../components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "../../../components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "../../../components/ui/command";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../../components/ui/sheet";
import { Button as ShadcnButton } from "../../../components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../../components/ui/card";
import {
  Eye as EyeOutlined,
  ShoppingCart as ShoppingCartOutlined,
  CurrencyDollar as DollarOutlined,
  Percent as PercentageOutlined,
  Funnel as FilterOutlined,
  MagnifyingGlass as SearchOutlined,
  TrendUp as RiseOutlined,
  ChartBar as BarChartOutlined,
  Eraser as ClearOutlined,
  X as CloseOutlined,
  Info as InfoCircleOutlined,
  Check as CheckOutlined,
  CaretDown as CaretDownOutlined
} from "@phosphor-icons/react";
import { cn } from "../../../lib/utils";
import { ApiGetAllBrandAnalytics, ApiGetBrandAnalyticsFilters } from "../../../api-wrapper/brandAnalysis/ApiBrandAnalysis";
import Filter from "../../../helper/filter/Filter";
import "./BrandAnalysis.css";
import BrandAnalyticsFunnel from "./BrandAnalyticsFunnel";
import usePageFilter from "../../../helper/filter/usePageFilter";

const P = {
  primary: "#1A9FD4",
  primary50: "#E0F4FD",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral400: "#94A3B8",
  neutral500: "#475569",
  neutral600: "#475569",
  neutral800: "#1E293B",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#E74C3C",
  info: "#3B82F6",
};

// Progress Bar Component
const ProgressBar = ({ value, maxValue, color = P.primary, height = "6px", showLabel = false }) => {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <div style={{ width: "100%" }}>
      {showLabel && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "4px"
        }}>
          <span style={{ fontSize: "10px", fontWeight: 500, color: P.neutral600 }}>Share</span>
          <span style={{ fontSize: "10px", fontWeight: 600, color: P.neutral800 }}>{percentage.toFixed(1)}%</span>
        </div>
      )}
      <div style={{
        backgroundColor: P.neutral100,
        borderRadius: "4px",
        overflow: "hidden",
        height: height
      }}>
        <div style={{
          width: `${percentage}%`,
          backgroundColor: color,
          height: "100%",
          transition: "width 0.3s ease"
        }} />
      </div>
    </div>
  );
};

// Metric Cell Component — clean readable layout
const MetricCell = ({ total, brand, share, color, showCtr = false, ctr = null, showCartRate = false, cartRate = null, showPurchaseRate = false, purchaseRate = null, isDark }) => {
  const { t } = useTranslation();
  const barPct = total > 0 ? Math.min((brand / total) * 100, 100) : 0;
  const rateVal = showCtr ? ctr : showCartRate ? cartRate : showPurchaseRate ? purchaseRate : null;
  const rateLabel = showCtr ? t("CTR") : showCartRate ? t("Cart Rate") : showPurchaseRate ? t("Purchase Rate") : null;

  return (
    <div style={{ padding: "8px 12px" }}>
      {/* 3-column header: Total | Brand | Share */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 4,
        marginBottom: 8,
      }}>
        {/* Total */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: isDark ? "#64748b" : "#94A3B8", fontWeight: 500, marginBottom: 2 }}>{t("Total")}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#f8fafc" : "#1E293B", lineHeight: 1 }}>
            {total?.toLocaleString() ?? 0}
          </div>
        </div>

        {/* Divider */}
        <div style={{ textAlign: "center", borderLeft: isDark ? "1px solid #334155" : "1px solid #E2E8F0", borderRight: isDark ? "1px solid #334155" : "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 10, color, fontWeight: 600, marginBottom: 2, opacity: 0.85 }}>{t("Brand")}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color, lineHeight: 1 }}>
            {brand?.toLocaleString() ?? 0}
          </div>
        </div>

        {/* Share */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: isDark ? "#64748b" : "#94A3B8", fontWeight: 500, marginBottom: 2 }}>{t("Share")}</div>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color,
            lineHeight: 1,
          }}>
            {(share ?? 0).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: isDark ? "#1e293b" : "#F1F5F9", borderRadius: 99, overflow: "hidden", marginBottom: rateVal !== null ? 6 : 0 }}>
        <div style={{
          height: "100%",
          width: `${barPct}%`,
          background: color,
          borderRadius: 99,
        }} />
      </div>

      {/* Rate */}
      {rateLabel && rateVal !== null && (
        <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748B", textAlign: "center" }}>
          {rateLabel}: <span style={{ fontWeight: 700, color }}>{rateVal?.toFixed(2)}%</span>
        </div>
      )}
    </div>
  );
};

// Applied Filters Component
const BrandAnalysisAppliedFilters = ({
  selectedAsin,
  selectedSearchQuery,
  selectedReportPeriod,
  selectedYear,
  selectedMonth,
  defaultReportPeriod,
  defaultYear,
  defaultMonth,
  onClearAll,
  onClearFilter,
  isDark,
}) => {
  const { t } = useTranslation();
  const filters = [];

  if (selectedAsin) {
    filters.push({
      id: "asin",
      label: t("Product"),
      value: selectedAsin,
      displayText: `${t("Product")}: ${selectedAsin}`,
      isDefault: false,
    });
  }
  if (selectedSearchQuery) {
    filters.push({
      id: "searchQuery",
      label: t("Search Query"),
      value: selectedSearchQuery,
      displayText: `${t("Search")}: ${selectedSearchQuery}`,
      isDefault: false,
    });
  }
  if (selectedReportPeriod) {
    filters.push({
      id: "period",
      label: t("Period"),
      value: selectedReportPeriod,
      displayText: `${t("Period")}: ${t(selectedReportPeriod)}`,
      isDefault: selectedReportPeriod === defaultReportPeriod,
    });
  }
  if (selectedYear) {
    filters.push({
      id: "year",
      label: t("Year"),
      value: selectedYear,
      displayText: `${t("Year")}: ${selectedYear}`,
      isDefault: selectedYear === defaultYear,
    });
  }
  if (selectedMonth && selectedReportPeriod !== "YEAR") {
    filters.push({
      id: "month",
      label: t("Month"),
      value: selectedMonth,
      displayText: `${t("Month")}: ${t(selectedMonth)}`,
      isDefault: selectedMonth === defaultMonth,
    });
  }

  if (filters.length === 0) return null;

  const hasNonDefaultFilter = filters.some((filter) => !filter.isDefault);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10,
      padding: "12px 20px",
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        color: isDark ? "#94a3b8" : "#475569",
        marginRight: 6,
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }}>
        <i className="fa fa-filter" style={{ color: "#1A9FD4", opacity: 0.8 }}></i>
        {t("Active Filters:")}
      </span>
      {filters.map((filter) => (
        <span
          key={filter.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: filter.isDefault
              ? (isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(100, 116, 139, 0.06)")
              : (isDark ? "rgba(26, 159, 212, 0.15)" : "linear-gradient(135deg, rgba(2, 70, 139, 0.06) 0%, rgba(30, 103, 184, 0.06) 100%)"),
            color: filter.isDefault ? (isDark ? "#94a3b8" : "#475569") : "#1A9FD4",
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            border: filter.isDefault
              ? (isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(100, 116, 139, 0.12)")
              : (isDark ? "1px solid rgba(26, 159, 212, 0.3)" : "1px solid rgba(2, 70, 139, 0.15)"),
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.02)",
            transition: "all 0.15s ease",
          }}
        >
          {filter.displayText}
          {!filter.isDefault && (
            <span
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginLeft: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                width: 16,
                height: 16,
                borderRadius: "50%",
                lineHeight: 1,
                transition: "all 0.15s",
              }}
              className="filter-remove-cross"
              onClick={() => onClearFilter(filter.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(2, 70, 139, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              ×
            </span>
          )}
        </span>
      ))}
      {hasNonDefaultFilter && (
        <ShadcnButton
          variant="destructive"
          size="sm"
          className="ml-auto"
          onClick={onClearAll}
          style={{ height: 28, fontSize: 11, padding: "0 12px" }}
        >
          {t("Clear All")}
        </ShadcnButton>
      )}
    </div>
  );
};

// Searchable Product Selector Component


const ProductMetricStat = ({ label, value, rate, color, icon }) => {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      flex: 1,
      background: color ? `${color}08` : "#F8FAFC",
      borderRadius: 8,
      padding: "8px 6px",
      border: `1px solid ${color ? `${color}20` : "#E2E8F0"}`,
    }}>
      <span style={{ fontSize: 9, color: color ?? "#64748B", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </span>
      <span style={{ fontSize: 17, fontWeight: 800, color: color ?? "#1E293B", lineHeight: 1 }}>
        {value?.toLocaleString() ?? 0}
      </span>
      {rate !== undefined && rate !== null && (
        <span style={{ fontSize: 10, fontWeight: 600, color: color ?? "#64748B", marginTop: 2 }}>
          {rate.toFixed(2)}%
        </span>
      )}
    </div>
  );
};

// Main Brand Analysis Component
function BrandAnalysis() {
  const { t } = useTranslation();
  const { profileId, selectedAdType } = useContext(ProfileContext);

  // Responsive breakpoints
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // State for filters
  const [products, setProducts] = useState([]);
  const [selectedAsin, setSelectedAsin] = useState("");
  const [searchQueries, setSearchQueries] = useState([]);
  const [selectedSearchQuery, setSelectedSearchQuery] = useState("");
  const [reportPeriods, setReportPeriods] = useState([]);
  const [selectedReportPeriod, setSelectedReportPeriod] = useState("MONTH");
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(moment().subtract(1, "month").format("MMMM"));

  const [selectedSearchQueryProducts, setSelectedSearchQueryProducts] = useState(null);

  // State for data
  const [funnelData, setFunnelData] = useState(null);
  const [gridData, setGridData] = useState([]);
  const [pagination, setPagination] = useState({
    totalRecords: 0,
    currentPage: 1,
    totalPages: 0,
    limit: 10,
  });

  // UI State
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(firstPageRows);
  const [sortField, setSortField] = useState("searchQueryVolume");
  const [sortOrder, setSortOrder] = useState(-1);
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [searchQueryPopoverOpen, setSearchQueryPopoverOpen] = useState(false);

  const appliedFiltersObj = useMemo(() => ({
    selectedAsin,
    selectedSearchQuery,
    selectedReportPeriod,
    selectedYear,
    selectedMonth
  }), [selectedAsin, selectedSearchQuery, selectedReportPeriod, selectedYear, selectedMonth]);

  const { isFilterReady } = usePageFilter({
    pageName: "BrandAnalysis",
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters: appliedFiltersObj,
    setAppliedFilters: (saved) => {
      if (saved && !Array.isArray(saved) && typeof saved === "object") {
        setSelectedAsin(saved.selectedAsin || "");
        setSelectedSearchQuery(saved.selectedSearchQuery || "");
        setSelectedReportPeriod(saved.selectedReportPeriod || "MONTH");
        setSelectedYear(saved.selectedYear || new Date().getFullYear());
        setSelectedMonth(saved.selectedMonth || moment().subtract(1, "month").format("MMMM"));
      }
    }
  });

  const defaultReportPeriod = reportPeriods[0] || "MONTH";
  const defaultYear = years[0] || new Date().getFullYear();
  const defaultMonth = months[0] || moment().subtract(1, "month").format("MMMM");

  // Fetch filters on component mount or profile change
  useEffect(() => {
    if (!isFilterReady) return;
    if (profileId?.value) {
      fetchFilters();
    }
  }, [isFilterReady, profileId?.value, selectedAsin, selectedYear, selectedMonth]);

  // Fetch data when filters or pagination changes
  useEffect(() => {
    if (!isFilterReady) return;
    if (profileId?.value) {
      fetchBrandAnalyticsData();
    }
  }, [
    isFilterReady,
    profileId?.value,
    selectedAsin,
    selectedSearchQuery,
    selectedReportPeriod,
    selectedYear,
    selectedMonth,
    currentPage,
    perPage,
    sortField,
    sortOrder,
  ]);

  const fetchFilters = async () => {
    if (!profileId?.value) return;
    setLoadingFilters(true);
    try {
      const response = await ApiGetBrandAnalyticsFilters({ profileId: profileId.value, ...(selectedAsin && { asin: selectedAsin }), ...(selectedYear && { year: selectedYear }), ...(selectedMonth && { month: selectedMonth }) })
      if (response?.isSuccess) {
        const filtersData = response.data;
        setProducts(filtersData.products || []);
        setSearchQueries(filtersData.searchQueries || []);
        setReportPeriods(filtersData.reportingPeriods || ["MONTH"]);
        setYears(filtersData.years || [new Date().getFullYear()]);
        setMonths(filtersData.months || []);

        if (filtersData.years?.length) {
          setSelectedYear(selectedYear ?? filtersData.years[0]);
        }
        if (filtersData.months?.length) {
          setSelectedMonth(selectedMonth || filtersData.months[0]);
        }
        if (filtersData.reportingPeriods?.length) {
          setSelectedReportPeriod(filtersData.reportingPeriods[0]);
        }
      } else {
        Toast.error(response.data?.message || "Failed to fetch filters");
      }
    } catch (error) {
      console.error("Error fetching filters:", error);
      Toast.error(t("Something went wrong while fetching filters"));
    } finally {
      setLoadingFilters(false);
    }
  };

  const fetchBrandAnalyticsData = async () => {
    if (!profileId?.value) return;
    setLoadingData(true);
    try {
      const requestBody = {
        profileId: profileId.value,
        reportPeriod: selectedReportPeriod,
        year: selectedYear,
        page: currentPage,
        limit: perPage,
        fieldName: sortField,
        sortOrder: sortOrder,
      };

      if (selectedAsin) {
        requestBody.asin = selectedAsin;
      }
      if (selectedSearchQuery) {
        requestBody.searchQuery = selectedSearchQuery;
      }
      if (selectedMonth && selectedReportPeriod !== "YEAR") {
        requestBody.month = selectedMonth;
      }

      const response = await ApiGetAllBrandAnalytics(requestBody);
      if (response.isSuccess) {
        setFunnelData(response?.data?.funnelData);
        setGridData(response?.data?.gridData || []);
        setPagination(response?.data?.pagination || {
          totalRecords: 0,
          currentPage: 1,
          totalPages: 0,
          limit: perPage,
        });
      } else {
        Toast.error(response?.message || "Failed to fetch brand analytics data");
      }
    } catch (error) {
      console.error("Error fetching brand analytics:", error);
      Toast.error(t("Something went wrong while fetching data"));
    } finally {
      setLoadingData(false);
    }
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setCurrentPage(1);
  };

  const handleSortChange = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    setSortField(colId);
    setSortOrder(sort === "asc" ? 1 : -1);
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setSelectedAsin("");
    setSelectedSearchQuery("");
    setSelectedReportPeriod(reportPeriods[0] || "MONTH");
    setSelectedYear(years[0] || new Date().getFullYear());
    if (months.length) {
      setSelectedMonth(months[0]);
    }
    setCurrentPage(1);
  };

  const handleClearFilter = (filterId) => {
    switch (filterId) {
      case "asin":
        setSelectedAsin("");
        break;
      case "searchQuery":
        setSelectedSearchQuery("");
        break;
      case "period":
        setSelectedReportPeriod(reportPeriods[0] || "MONTH");
        break;
      case "year":
        setSelectedYear(years[0] || new Date().getFullYear());
        break;
      case "month":
        setSelectedMonth(months[0] || moment().subtract(1, "month").format("MMMM"));
        break;
      default:
        break;
    }
    setCurrentPage(1);
  };

  // AG Grid Column Definitions
  const columnDefs = [
    {
      headerName: t("Search Query"),
      field: "searchQuery",
      title: "Search Query",
      sortable: true,
      resizable: true,
      pinned: "left",
      wrapText: true,
      minWidth: 240,
      flex: 1.5,
      cellRenderer: (params) => (
        <div style={{ padding: "12px 8px" }}>
          <div style={{ fontWeight: 600, color: P.primary, fontSize: 13, lineHeight: 1.5 }}>
            {params.value || "--"}
          </div>
        </div>
      ),
    },
    {
      headerName: t("Volume"),
      field: "searchQueryVolume",
      title: "Volume",
      sortable: true,
      resizable: true,
      width: 110,
      cellRenderer: (params) => (
        <div style={{ padding: "12px 8px", fontWeight: 700, fontSize: 14, color: isDark ? "#f8fafc" : P.neutral800 }}>
          {(params.value ?? 0).toLocaleString()}
        </div>
      ),
    },
    {
      headerName: t("Impressions"),
      field: "totalImpressions",
      title: "Impressions",
      sortable: true,
      resizable: true,
      autoHeight: true,
      width: 220,
      cellRenderer: (params) => (
        <MetricCell
          total={params.data?.totalImpressions}
          brand={params.data?.asinImpressions}
          share={params.data?.asinImpressionShare}
          color={P.primary}
          isDark={isDark}
        />
      ),
    },
    {
      headerName: t("Clicks"),
      field: "totalClicks",
      title: "Clicks",
      sortable: true,
      resizable: true,
      width: 220,
      autoHeight: true,
      cellRenderer: (params) => (
        <MetricCell
          total={params.data?.totalClicks}
          brand={params.data?.asinClicks}
          share={params.data?.asinClickShare}
          color={P.warning}
          showCtr={true}
          ctr={params.data?.totalClickRate}
          isDark={isDark}
        />
      ),
    },
    {
      headerName: t("Cart Adds"),
      field: "totalCartAdds",
      title: "Cart Adds",
      sortable: true,
      resizable: true,
      width: 220,
      autoHeight: true,
      cellRenderer: (params) => (
        <MetricCell
          total={params.data?.totalCartAdds}
          brand={params.data?.asinCartAdds}
          share={params.data?.asinCartAddShare}
          color="#EA580C"
          showCartRate={true}
          cartRate={params.data?.totalCartAddRate}
          isDark={isDark}
        />
      ),
    },
    {
      headerName: t("Purchases"),
      field: "totalPurchases",
      title: "Purchases",
      sortable: true,
      resizable: true,
      width: 220,
      autoHeight: true,
      cellRenderer: (params) => (
        <MetricCell
          total={params.data?.totalPurchases}
          brand={params.data?.asinPurchases}
          share={params.data?.asinPurchaseShare}
          color={P.success}
          showPurchaseRate={true}
          purchaseRate={params.data?.totalPurchaseRate}
          isDark={isDark}
        />
      ),
    },
    {
      headerName: t("Products"),
      field: "action",
      title: "Products",
      resizable: true,
      width: 150,
      cellRenderer: (params) => {
        const count = params.data?.searchQueryProducts?.length ?? 0;
        if (!count) return <div style={{ padding: "12px 8px", color: "#CBD5E1", fontSize: 12 }}>—</div>;
        const isFirstRow = params?.node?.rowIndex === 0;
        return (
          <div style={{ padding: "12px 8px" }}>
            <span
              id={isFirstRow ? "brand-analysis-products-first-btn" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 600,
                color: P.info,
                cursor: "pointer",
              }}
              onClick={() => {
                setSelectedSearchQueryProducts({
                  searchQuery: params.data.searchQuery,
                  searchQueryVolume: params.data.searchQueryVolume,
                  products: params.data.searchQueryProducts,
                });
              }}
            >
              <EyeOutlined style={{ fontSize: 12 }} />
              {count} {t("Products")}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="brand-analysis-container">
      <Filter nameShow={false} dateShow={false} profileShow={true} />
      <div className="middle_container">
        {/* Sticky Filter Bar */}
        <div
          className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
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
          {/* Select Product Filter */}
          <div id="brand-analysis-asin" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", minWidth: isMobile ? "100%" : 300, maxWidth: isMobile ? "100%" : 300 }}>
            <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
              <PopoverTrigger asChild>
                <ShadcnButton
                  variant="outline"
                  role="combobox"
                  className={cn("w-full justify-between font-normal text-left px-3 h-10 transition-colors duration-200", !selectedAsin && "text-muted-foreground")}
                  style={{
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#334155" : "#ced4da",
                    color: isDark ? "#f8fafc" : "#1e293b",
                    overflow: "hidden",
                  }}
                >
                  {selectedAsin ? (
                    <div className="flex items-center justify-between w-full min-w-0" style={{ overflow: "hidden" }}>
                      <div className="flex items-center gap-2 min-w-0" style={{ overflow: "hidden", flex: "1 1 0", marginRight: 8 }}>
                        {(() => {
                          const product = products.find((p) => p.asin === selectedAsin);
                          return product ? (
                            <>
                              {product.imageURL ? (
                                <img src={product.imageURL} alt={product.itemName} style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: 24, height: 24, backgroundColor: isDark ? "#0f172a" : "#f1f5f9", borderRadius: 4, flexShrink: 0 }} />
                              )}
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", minWidth: 0 }}>{product.itemName}</span>
                            </>
                          ) : <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedAsin}</span>;
                        })()}
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAsin("");
                          setCurrentPage(1);
                        }}
                        className="hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors"
                        style={{ cursor: "pointer", color: P.neutral400, flexShrink: 0, width: 14, height: 14, display: "inline-flex" }}
                      >
                        <span style={{ fontSize: "10px", fontWeight: "bold", lineHeight: 1, marginTop: "-1px" }}>×</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span>{t("Select Product")}</span>
                      <CaretDownOutlined style={{ fontSize: 11, color: P.neutral400, marginLeft: 8 }} />
                    </div>
                  )}
                </ShadcnButton>
              </PopoverTrigger>
              <PopoverContent
                className="w-[300px] p-0"
                align="start"
                style={{
                  zIndex: 999,
                  backgroundColor: isDark ? "#1e293b" : "#fff",
                  borderColor: isDark ? "#334155" : "#e2e8f0",
                  color: isDark ? "#f8fafc" : "#1e293b"
                }}
              >
                <Command style={{ backgroundColor: "transparent", color: "inherit" }}>
                  <CommandInput
                    placeholder={t("Search Product...")}
                    style={{ color: isDark ? "#f8fafc" : "#1e293b", border: "none", boxShadow: "none", outline: "none" }}
                    className="focus:ring-0 focus-visible:ring-0 border-none outline-none shadow-none focus:outline-none focus-visible:outline-none"
                  />
                  <CommandList>
                    <CommandEmpty style={{ color: isDark ? "#94a3b8" : "#64748b" }}>{t("No product found.")}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value=""
                        onSelect={() => {
                          setSelectedAsin("");
                          setCurrentPage(1);
                          setProductPopoverOpen(false);
                        }}
                        style={{
                          backgroundColor: selectedAsin === "" ? (isDark ? "#2d3748" : "#f1f5f9") : "transparent",
                          color: isDark ? "#f8fafc" : "#1e293b",
                          cursor: "pointer"
                        }}
                        className={cn(
                          "transition-colors duration-200",
                          isDark ? "hover:bg-slate-800 focus:bg-slate-800" : "hover:bg-slate-100 focus:bg-slate-100"
                        )}
                      >
                        <div className="flex flex-col w-full">
                          <div style={{ fontWeight: 500, fontSize: 13, color: "inherit" }}>{t("All Products")}</div>
                          <div style={{ fontSize: 11, color: isDark ? "#94a3b8" : "#64748b" }}>{t("Show data for all products")}</div>
                        </div>
                        <CheckOutlined className={cn("ml-auto", selectedAsin === "" ? "opacity-100" : "opacity-0")} />
                      </CommandItem>
                      {products.map((product) => (
                        <CommandItem
                          key={product.asin}
                          value={`${product.itemName} ${product.asin}`}
                          onSelect={() => {
                            setSelectedAsin(product.asin);
                            setCurrentPage(1);
                            setProductPopoverOpen(false);
                          }}
                          style={{
                            backgroundColor: selectedAsin === product.asin ? (isDark ? "#2d3748" : "#f1f5f9") : "transparent",
                            color: isDark ? "#f8fafc" : "#1e293b",
                            cursor: "pointer"
                          }}
                          className={cn(
                            "transition-colors duration-200",
                            isDark ? "hover:bg-slate-800 focus:bg-slate-800" : "hover:bg-slate-100 focus:bg-slate-100"
                          )}
                        >
                          <div className="flex items-center gap-3 w-full" style={{ padding: "4px 0" }}>
                            {product.imageURL ? (
                              <img
                                src={product.imageURL}
                                alt={product.itemName}
                                style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                              />
                            ) : (
                              <div style={{ width: 32, height: 32, backgroundColor: isDark ? "#0f172a" : "#f1f5f9", borderRadius: 4, flexShrink: 0 }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {product.itemName}
                              </div>
                              <div style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" }}>ASIN: {product.asin}</div>
                            </div>
                          </div>
                          <CheckOutlined className={cn("ml-auto", selectedAsin === product.asin ? "opacity-100" : "opacity-0")} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Search Query Filter */}
          <div id="brand-analysis-search-query" style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", minWidth: isMobile ? "100%" : 200, maxWidth: isMobile ? "100%" : 220 }}>
            <Popover open={searchQueryPopoverOpen} onOpenChange={setSearchQueryPopoverOpen}>
              <PopoverTrigger asChild>
                <ShadcnButton
                  variant="outline"
                  role="combobox"
                  className={cn("w-full justify-between font-normal text-left px-3 h-10 transition-colors duration-200", !selectedSearchQuery && "text-muted-foreground")}
                  style={{
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#334155" : "#ced4da",
                    color: isDark ? "#f8fafc" : "#1e293b",
                    overflow: "hidden",
                  }}
                >
                  {selectedSearchQuery ? (
                    <div className="flex items-center justify-between w-full min-w-0" style={{ overflow: "hidden" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: "1 1 0", marginRight: 8 }}>{selectedSearchQuery}</span>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSearchQuery("");
                          setCurrentPage(1);
                        }}
                        className="hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors"
                        style={{ cursor: "pointer", color: P.neutral400, flexShrink: 0, width: 14, height: 14, display: "inline-flex" }}
                      >
                        <span style={{ fontSize: "10px", fontWeight: "bold", lineHeight: 1, marginTop: "-1px" }}>×</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span>{t("Search Query")}</span>
                      <CaretDownOutlined style={{ fontSize: 11, color: P.neutral400, marginLeft: 8 }} />
                    </div>
                  )}
                </ShadcnButton>
              </PopoverTrigger>
              <PopoverContent
                className="w-[250px] p-0"
                align="start"
                style={{
                  zIndex: 999,
                  backgroundColor: isDark ? "#1e293b" : "#fff",
                  borderColor: isDark ? "#334155" : "#e2e8f0",
                  color: isDark ? "#f8fafc" : "#1e293b"
                }}
              >
                <Command style={{ backgroundColor: "transparent", color: "inherit" }}>
                  <CommandInput
                    placeholder={t("Search query...")}
                    style={{ color: isDark ? "#f8fafc" : "#1e293b", border: "none", boxShadow: "none", outline: "none" }}
                    className="focus:ring-0 focus-visible:ring-0 border-none outline-none shadow-none focus:outline-none focus-visible:outline-none"
                  />
                  <CommandList>
                    <CommandEmpty style={{ color: isDark ? "#94a3b8" : "#64748b" }}>{t("No queries found.")}</CommandEmpty>
                    <CommandGroup>
                      {searchQueries.map((sq) => (
                        <CommandItem
                          key={sq}
                          value={sq}
                          onSelect={(currentValue) => {
                            setSelectedSearchQuery(currentValue === selectedSearchQuery ? "" : sq);
                            setCurrentPage(1);
                            setSearchQueryPopoverOpen(false);
                          }}
                          style={{
                            backgroundColor: selectedSearchQuery === sq ? (isDark ? "#2d3748" : "#f1f5f9") : "transparent",
                            color: isDark ? "#f8fafc" : "#1e293b",
                            cursor: "pointer"
                          }}
                          className={cn(
                            "transition-colors duration-200",
                            isDark ? "hover:bg-slate-800 focus:bg-slate-800" : "hover:bg-slate-100 focus:bg-slate-100"
                          )}
                        >
                          {sq}
                          <CheckOutlined className={cn("ml-auto", selectedSearchQuery === sq ? "opacity-100" : "opacity-0")} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Report Period */}
          <div id="brand-analysis-period" style={{ flex: isMobile ? "1 1 auto" : "0 0 auto", minWidth: 120 }}>
            <Select
              value={selectedReportPeriod}
              onValueChange={(val) => {
                setSelectedReportPeriod(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-10 transition-colors duration-200 mt-0" style={{ backgroundColor: isDark ? "#1e293b" : "#fff", borderColor: isDark ? "#334155" : "#ced4da", color: isDark ? "#f8fafc" : "#1e293b", marginTop: 0 }}>
                <SelectValue placeholder={t("Period")} />
              </SelectTrigger>
              <SelectContent
                style={{
                  zIndex: 9999,
                  backgroundColor: isDark ? "#1e293b" : "#fff",
                  borderColor: isDark ? "#334155" : "#e2e8f0",
                  color: isDark ? "#f8fafc" : "#1e293b"
                }}
              >
                {reportPeriods.map(p => (
                  <SelectItem
                    key={p}
                    value={p}
                    style={{
                      cursor: "pointer",
                      backgroundColor: selectedReportPeriod === p ? (isDark ? "#2d3748" : "#f1f5f9") : "transparent",
                      color: isDark ? "#f8fafc" : "#1e293b",
                    }}
                    className={cn(
                      "transition-colors duration-200",
                      isDark ? "hover:bg-slate-800 focus:bg-slate-800" : "hover:bg-slate-100 focus:bg-slate-100"
                    )}
                  >
                    {t(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Year */}
          <div id="brand-analysis-year" style={{ flex: isMobile ? "1 1 auto" : "0 0 auto", minWidth: 100 }}>
            <Select
              value={selectedYear?.toString()}
              onValueChange={(val) => {
                setSelectedYear(parseInt(val, 10));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-10 transition-colors duration-200 mt-0" style={{ backgroundColor: isDark ? "#1e293b" : "#fff", borderColor: isDark ? "#334155" : "#ced4da", color: isDark ? "#f8fafc" : "#1e293b", marginTop: 0 }}>
                <SelectValue placeholder={t("Year")} />
              </SelectTrigger>
              <SelectContent
                style={{
                  zIndex: 9999,
                  backgroundColor: isDark ? "#1e293b" : "#fff",
                  borderColor: isDark ? "#334155" : "#e2e8f0",
                  color: isDark ? "#f8fafc" : "#1e293b"
                }}
              >
                {years.map(y => (
                  <SelectItem
                    key={y}
                    value={y.toString()}
                    style={{
                      cursor: "pointer",
                      backgroundColor: selectedYear === y ? (isDark ? "#2d3748" : "#f1f5f9") : "transparent",
                      color: isDark ? "#f8fafc" : "#1e293b",
                    }}
                    className={cn(
                      "transition-colors duration-200",
                      isDark ? "hover:bg-slate-800 focus:bg-slate-800" : "hover:bg-slate-100 focus:bg-slate-100"
                    )}
                  >
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month */}
          {selectedReportPeriod !== "YEAR" && months.length > 0 && (
            <div id="brand-analysis-month" style={{ flex: isMobile ? "1 1 auto" : "0 0 auto", minWidth: 120 }}>
              <Select
                value={selectedMonth || ""}
                onValueChange={(val) => {
                  setSelectedMonth(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 transition-colors duration-200 mt-0" style={{ backgroundColor: isDark ? "#1e293b" : "#fff", borderColor: isDark ? "#334155" : "#ced4da", color: isDark ? "#f8fafc" : "#1e293b", marginTop: 0 }}>
                  <SelectValue placeholder={t("Month")} />
                </SelectTrigger>
                <SelectContent
                  style={{
                    zIndex: 9999,
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                    color: isDark ? "#f8fafc" : "#1e293b"
                  }}
                >
                  {months.map(m => (
                    <SelectItem
                      key={m}
                      value={m}
                      style={{
                        cursor: "pointer",
                        backgroundColor: selectedMonth === m ? (isDark ? "#2d3748" : "#f1f5f9") : "transparent",
                        color: isDark ? "#f8fafc" : "#1e293b",
                      }}
                      className={cn(
                        "transition-colors duration-200",
                        isDark ? "hover:bg-slate-800 focus:bg-slate-800" : "hover:bg-slate-100 focus:bg-slate-100"
                      )}
                    >
                      {t(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {PermissionCheck(SYSTEM_PAGES.BRAND_ANALYTICS, PAGE_ACTIONS.VIEW_ONLY) && (
          <div className="data_content data_content_btn m-0 h-maxContent" style={{ padding: "12px 16px" }}>

            {/* Applied Filters Chips in a Card layout */}
            <style>{`
              .active-filters-glass-card {
                border-radius: 8px !important;
              }
            `}</style>
            <div id="brand-analysis-applied-filters" className="glass-grid-container active-filters-glass-card" style={{ marginBottom: 16 }}>
              <BrandAnalysisAppliedFilters
                selectedAsin={selectedAsin}
                selectedSearchQuery={selectedSearchQuery}
                selectedReportPeriod={selectedReportPeriod}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                defaultReportPeriod={defaultReportPeriod}
                defaultYear={defaultYear}
                defaultMonth={defaultMonth}
                onClearAll={handleClearAllFilters}
                onClearFilter={handleClearFilter}
                isDark={isDark}
              />
            </div>

            {/* Funnel View Section — inside a Shadcn card */}
            <Card id="brand-analysis-funnel" className="overflow-hidden" style={{ marginBottom: 16, backgroundColor: isDark ? "#1e293b" : "#fff", borderColor: isDark ? "#334155" : "#e2e8f0" }}>
              {/* Card Header */}
              <CardHeader className="flex flex-row items-center justify-between py-3 border-b px-3 space-y-0" style={{ paddingLeft: 20, paddingRight: 20, borderBottomColor: isDark ? "#334155" : "#e2e8f0" }}>
                <div className="flex items-center gap-2">
                  <BarChartOutlined style={{ color: "#1A9FD4", fontSize: 18 }} />
                  <CardTitle className="m-0 font-bold" style={{ fontSize: 15, color: isDark ? "#f8fafc" : "#1E293B" }}>
                    {t("Funnel Analysis: Total vs Brand")}
                  </CardTitle>
                </div>
                {/* Column legend */}
                <div className="flex items-center" style={{ gap: 16 }}>
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(135deg,#1a56db,#1A9FD4)" }} />
                    <span style={{ fontSize: 12, color: isDark ? "#94a3b8" : "#475569", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>{t("Total Market")}</span>
                  </div>
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(135deg,#2374F2,#1a56db)" }} />
                    <span style={{ fontSize: 12, color: isDark ? "#94a3b8" : "#475569", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>{t("Your Brand")}</span>
                  </div>
                </div>
              </CardHeader>
              {/* Funnel SVG body */}
              <CardContent className="p-5">
                <BrandAnalyticsFunnel
                  funnelData={funnelData}
                  isDark={isDark}
                  loading={!profileId?.value || !isFilterReady || loadingData}
                />
              </CardContent>
            </Card>

            {/* Grid View Section — inside a Shadcn card */}
            <Card className="overflow-hidden" style={{ backgroundColor: isDark ? "#1e293b" : "#fff", borderColor: isDark ? "#334155" : "#e2e8f0" }}>
              {/* Grid header bar — matches Placement/Campaign page pattern */}
              <CardHeader
                className="p-4 border-b space-y-0"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  flexWrap: "wrap",
                  gap: 10,
                  padding: isMobile ? "10px 14px" : "12px 24px",
                  borderBottomColor: isDark ? "#334155" : "#e2e8f0",
                  backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "transparent"
                }}
              >
                <div className="flex items-center" style={{ gap: 8 }}>
                  <CardTitle className="m-0 font-bold" style={{ fontSize: 15, color: isDark ? "#f8fafc" : "#1E293B" }}>
                    {t("Search Query Performance")}
                  </CardTitle>
                </div>
              </CardHeader>

              {/* Grid table */}
              <CardContent className="p-0">
                <div id="brand-analysis-main-table" className="data_table position-relative" style={{ padding: "14px" }}>
                  <AgTable tableId=""
                    height={"55vh"}
                    rowData={gridData}
                    columnDefs={columnDefs}
                    totalRecords={pagination.totalRecords}
                    perPage={perPage}
                    currentPage={currentPage}
                    onPageChange={handlePageChange}
                    onPerPageChange={handlePerRowsChange}
                    onSortChanged={handleSortChange}
                    paginationOptions={paginationRowsPerPageOptions}
                    isCustomSaveColumns={true}
                    customSaveColumnName={"Brand Analysis"}
                    loading={!isFilterReady || loadingData}
                    onRefresh={fetchBrandAnalyticsData}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Sheet open={!!selectedSearchQueryProducts} onOpenChange={(open) => !open && setSelectedSearchQueryProducts(null)}>
        <SheetContent
          hideCloseButton={true}
          side="right"
          id="brand-analysis-product-drawer"
          style={{
            width: 480,
            maxWidth: "100vw",
            background: isDark ? "#0f172a" : "#F8FAFC",
            fontFamily: "'DM Sans', 'Inter', sans-serif",
            padding: 0,
            borderLeft: isDark ? "1px solid #334155" : "1px solid #e2e8f0"
          }}
        >
          {/* Custom Header */}
          <div style={{
            padding: "16px 24px",
            backgroundColor: isDark ? "#1e293b" : "#fff",
            borderBottom: isDark ? "1px solid #334155" : "1px solid #f0f0f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div className="flex flex-col" style={{ gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#f8fafc" : P.neutral800 }}>
                📦 {t("Product Breakdown")}
              </span>
              {selectedSearchQueryProducts && (
                <span style={{ fontSize: 11, color: isDark ? "#94a3b8" : P.neutral500, fontWeight: 400 }}>
                  “{selectedSearchQueryProducts.searchQuery}”
                  {selectedSearchQueryProducts.searchQueryVolume != null && (
                    <span style={{ color: "#2374F2", fontWeight: 600 }}>
                      {" "}· {selectedSearchQueryProducts.searchQueryVolume.toLocaleString()} {t("searches")}
                    </span>
                  )}
                </span>
              )}
            </div>
            <button
              id="brand-analysis-drawer-close"
              onClick={() => setSelectedSearchQueryProducts(null)}
              className="btn-close rounded-full border border-gray-300 dark:border-gray-600 p-1.5 opacity-70 hover:opacity-100 transition-all text-slate-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <i className="fa-solid fa-xmark text-sm" />
              <span className="sr-only">{t("Close")}</span>
            </button>
          </div>

          {/* Body Content */}
          <div style={{ height: "calc(100vh - 74px)", overflowY: "auto" }}>
            {selectedSearchQueryProducts && (
              <div className="flex flex-col" style={{ flex: 1 }}>
                {/* Summary banner */}
                <div style={{
                  background: "linear-gradient(135deg, #1A9FD4 0%, #1a56db 100%)",
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0,
                  }}>
                    🛋
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", mb: 2 }}>
                      {selectedSearchQueryProducts.products.length} {t("Products Found")}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                      {t("Contributing to")} “{selectedSearchQueryProducts.searchQuery}”
                    </div>
                  </div>
                </div>

                {/* Product list */}
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {selectedSearchQueryProducts.products.map((product, idx) => (
                    <div
                      key={product.asin || idx}
                      style={{
                        background: isDark ? "#1e293b" : "#fff",
                        borderRadius: 12,
                        border: isDark ? "1px solid #334155" : "1px solid #E2E8F0",
                        overflow: "hidden",
                        boxShadow: isDark ? "0 1px 6px rgba(0,0,0,0.3)" : "0 1px 6px rgba(0,0,0,0.06)",
                      }}
                    >
                      {/* Product header */}
                      <div className="flex items-start" style={{ gap: 12, padding: "14px 14px 12px" }}>
                        {/* Rank badge */}
                        <div style={{
                          width: 20, height: 20, borderRadius: 4,
                          background: isDark ? "#1e3a8a" : "#EFF6FF", border: isDark ? "1px solid #3b82f6" : "1px solid #BFDBFE",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: isDark ? "#60a5fa" : "#1a56db",
                          flexShrink: 0, marginTop: 1,
                        }}>
                          {idx + 1}
                        </div>

                        {/* Image */}
                        <div style={{
                          width: 40, minWidth: 40, height: 40,
                          borderRadius: 6,
                          border: isDark ? "1px solid #334155" : "1px solid #E2E8F0",
                          background: isDark ? "#0f172a" : "#F8FAFC",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          overflow: "hidden", flexShrink: 0,
                        }}>
                          {product.imageURL ? (
                            <img src={product.imageURL} alt={product.itemName} style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }} />
                          ) : (
                            <span style={{ fontSize: 16 }}>📷</span>
                          )}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 11, fontWeight: 600, color: isDark ? "#f8fafc" : "#1E293B",
                            lineHeight: 1.4, marginBottom: 3,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}>
                            {product.itemName}
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: 600,
                            color: isDark ? "#60a5fa" : "#1a56db",
                            background: isDark ? "rgba(59, 130, 246, 0.15)" : "#EFF6FF",
                            border: isDark ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid #BFDBFE",
                            borderRadius: 3, padding: "1px 5px",
                          }}>
                            {product.asin}
                          </span>
                        </div>
                      </div>

                      {/* Metrics — compact single row */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        borderTop: isDark ? "1px solid #334155" : "1px solid #F1F5F9",
                        background: isDark ? "#111827" : "#FAFAFA",
                      }}>
                        {[
                          { label: t("Impr."), value: product.asinImpressions, rate: null, color: P.primary },
                          { label: t("Clicks"), value: product.asinClicks, rate: product.asinClickRate, color: P.warning },
                          { label: t("Cart"), value: product.asinCartAdds, rate: product.asinCartAddRate, color: "#EA580C" },
                          { label: t("Purch."), value: product.asinPurchases, rate: product.asinPurchaseRate, color: P.success },
                        ].map((m, i) => (
                          <div key={i} style={{
                            padding: "8px 10px",
                            borderRight: i < 3 ? (isDark ? "1px solid #334155" : "1px solid #F1F5F9") : "none",
                            textAlign: "center",
                          }}>
                            <div style={{ fontSize: 9, color: isDark ? "#64748b" : "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 2 }}>{m.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: m.color, lineHeight: 1 }}>{m.value?.toLocaleString() ?? 0}</div>
                            {m.rate != null && (
                              <div style={{ fontSize: 9, color: m.color, marginTop: 2 }}>{m.rate.toFixed(1)}%</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default BrandAnalysis;