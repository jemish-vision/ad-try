import { useTranslation } from "react-i18next";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import { ApiCouponList } from "../../../api-wrapper/ApiCoupon";
import Filter from "../../../helper/filter/Filter";
import { useEffect, useState, useRef, useContext, useMemo } from "react";
import usePageFilter from "../../../helper/filter/usePageFilter";
import AgTable from "../../../common/grid/AgTable";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import CouponProductModal from "./CouponProductModal";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { ChevronDown as ExpandMoreIcon } from "lucide-react";
import { exportGridToExcel } from "../../../utility/exportExcel";
import { useDispatch, handleLoader } from "../../../helper/links/Link";
import { MdOutlineClose } from "react-icons/md";
import { AppTooltip } from "../../../components/ui/AppTooltip";

import moment from "moment";

// ─── Dropdown options — exact schema enums ────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "RUNNING", label: "Running" },
  { value: "EXPIRING_SOON", label: "Expiring Soon" },
  { value: "EXPIRED", label: "Expired" },
  { value: "UPCOMING", label: "Upcoming" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PERFORMANCE_OPTIONS = [
  { value: "", label: "All Performance" },
  { value: "PROFITABLE", label: "Profitable" },
  { value: "LOSS_MAKING", label: "Loss Making" },
  { value: "BREAKEVEN", label: "Breakeven" },
  { value: "NO_DATA", label: "No Data" },
  { value: "OPTIMIZATION_NEEDED", label: "Optimization Needed" },
];

// ─── Badge styles (matching schema enums) ─────────────────────────────────────
const STATUS_STYLE = {
  RUNNING: { bg: "#e6f4ea", color: "#137333" },
  EXPIRING_SOON: { bg: "#fef7e0", color: "#b06000" },
  EXPIRED: { bg: "#f1f3f4", color: "#5f6368" },
  UPCOMING: { bg: "#e8f0fe", color: "#1a73e8" },
  CANCELLED: { bg: "#f1f3f4", color: "#5f6368" },
};

const PERF_STYLE = {
  PROFITABLE: { bg: "#e6f4ea", color: "#137333" },
  LOSS_MAKING: { bg: "#fce8e6", color: "#c5221f" },
  BREAKEVEN: { bg: "#fef7e0", color: "#b06000" },
  NO_DATA: { bg: "#f1f3f4", color: "#5f6368" },
  OPTIMIZATION_NEEDED: { bg: "#f3e8ff", color: "#7c3aed" },
};

const LABEL_MAP = {
  RUNNING: "Running", EXPIRING_SOON: "Expiring Soon", EXPIRED: "Expired",
  UPCOMING: "Upcoming", CANCELLED: "Cancelled",
  PROFITABLE: "Profitable", LOSS_MAKING: "Loss Making", BREAKEVEN: "Breakeven",
  NO_DATA: "No Data", OPTIMIZATION_NEEDED: "Optimization Needed",
};

// ─── Inline Badge renderer ────────────────────────────────────────────────────
// ─── Inline Badge renderer ────────────────────────────────────────────────────
const Badge = ({ value, styleMap, isDark }) => {
  const { t } = useTranslation();
  if (!value) return <span style={{ color: "var(--text-secondary, #9ca3af)" }}>-</span>;

  const darkPerfStyles = {
    PROFITABLE: { bg: "rgba(6, 95, 70, 0.25)", color: "#34d399" },
    LOSS_MAKING: { bg: "rgba(153, 27, 27, 0.25)", color: "#f87171" },
    BREAKEVEN: { bg: "rgba(146, 64, 14, 0.25)", color: "#fbbf24" },
    NO_DATA: { bg: "rgba(255, 255, 255, 0.05)", color: "rgba(255, 255, 255, 0.55)" },
    OPTIMIZATION_NEEDED: { bg: "rgba(91, 33, 182, 0.25)", color: "#c084fc" },
  };

  const darkStatusStyles = {
    RUNNING: { bg: "rgba(6, 125, 98, 0.25)", color: "#34d399" },
    EXPIRING_SOON: { bg: "rgba(217, 119, 6, 0.25)", color: "#fbbf24" },
    EXPIRED: { bg: "rgba(255, 255, 255, 0.05)", color: "rgba(255, 255, 255, 0.55)" },
    UPCOMING: { bg: "rgba(37, 99, 235, 0.25)", color: "#60a5fa" },
    CANCELLED: { bg: "rgba(255, 255, 255, 0.05)", color: "rgba(255, 255, 255, 0.45)" },
  };

  let s;
  if (isDark) {
    s = (styleMap === PERF_STYLE ? darkPerfStyles[value] : darkStatusStyles[value]) || { bg: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" };
  } else {
    s = styleMap[value] || { bg: "#f3f4f6", color: "#555" };
  }

  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        padding: "3px 10px",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 700,
        display: "inline-block",
        whiteSpace: "nowrap",
        border: isDark ? `1px solid ${s.color}20` : "1.5px solid transparent",
      }}
    >
      {LABEL_MAP[value] ? t(LABEL_MAP[value]) : value}
    </span>
  );
};

// ─── Shared select style ──────────────────────────────────────────────────────
const selectStyle = {
  height: "36px",
  padding: "0 12px",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: "13px",
  color: "#374151",
  cursor: "pointer",
  outline: "none",
  minWidth: "150px",
};

// ─── Format helpers ───────────────────────────────────────────────────────────
const fmt = (val) =>
  val != null ? Number(val).toLocaleString() : "-";

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
      day: "2-digit", month: "short", year: "numeric",
    })
    : "-";

const fmtDiscount = (type, amount) => {
  if (amount == null) return "-";
  return type === "PERCENT_OFF_LIST_PRICE" ? `${amount}%` : amount;
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Coupons = () => {
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);
  const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1400);
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 500);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsNarrow(window.innerWidth < 500);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [couponList, setCouponList] = useState([]);
  const [groupsData, setGroupsData] = useState({});

  // Filter state
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [date, setDate] = useState(null);
  const [status, setStatus] = useState("");
  const [performanceTag, setPerformanceTag] = useState("");

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDate([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
    } else {
      let storeData;
      try {
        storeData = JSON.parse(localStorage.getItem('profile'));
      } catch (err) { }
      if (storeData?.date && Array.isArray(storeData.date) && storeData.date.length >= 2) {
        setSelectedDate(storeData.date);
      } else {
        const firstDate = moment().startOf("month").format("YYYY-MM-DD");
        const lastDate = moment().format("YYYY-MM-DD");
        setSelectedDate([firstDate, lastDate]);
      }
    }
  }, [selectedDate, setSelectedDate]);

  // Modal state
  const [selectedCoupon, setSelectedCoupon] = useState(null);

  const gridRef = useRef(null);
  const dispatch = useDispatch();

  const appliedFiltersObj = useMemo(() => ({
    status,
    performanceTag
  }), [status, performanceTag]);

  const { isFilterReady } = usePageFilter({
    pageName: "Coupons",
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters: appliedFiltersObj,
    setAppliedFilters: (saved) => {
      if (saved && !Array.isArray(saved) && typeof saved === "object") {
        setStatus(saved.status || "");
        setPerformanceTag(saved.performanceTag || "");
      }
    }
  });

  const handleExport = async () => {
    if (!profileId?.value) return;
    dispatch(handleLoader(true));
    try {
      const payload = {
        profileId: profileId.value,
        pageNo: 1,
        perPage: 100000,
        ...(searchName && { searchName }),
        ...(status && { status }),
        ...(performanceTag && { performanceTag }),
        ...(date?.[0] && { fromDate: date[0].toISOString() }),
        ...(date?.[1] && { toDate: date[1].toISOString() }),
        fieldName: "startDateTime",
        sortType: "DESC",
      };

      if (gridRef.current?.api) {
        const columnState = gridRef.current.api.getColumnState();
        const sorted = columnState.find((s) => s.sort !== null && s.sort !== undefined);
        if (sorted) {
          payload.fieldName = sorted.colId;
          payload.sortType = sorted.sort === "asc" ? "ASC" : "DESC";
        }
      }

      const res = await ApiCouponList(payload);
      if (res?.isSuccess && res.data?.length > 0) {
        exportGridToExcel(res.data, columns, `Coupons_${new Date().toISOString().split('T')[0]}.xlsx`);
      }
    } catch (err) {
      console.error("Export Error:", err);
    } finally {
      dispatch(handleLoader(false));
    }
  };

  const [loading, setLoading] = useState(true);
  const lastFetchParamsRef = useRef("");

  // ── API ─────────────────────────────────────────────────────────────────────
  const ApiListing = async (extraArgs = {}) => {
    if (!profileId?.value) return;

    const isReload = !!extraArgs?.isReload;
    const payload = {
      profileId: profileId?.value,
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      searchName: extraArgs?.hasOwnProperty("searchName") ? extraArgs.searchName : debouncedSearchName,
      status: extraArgs?.hasOwnProperty("status") ? extraArgs.status : status,
      performanceTag: extraArgs?.hasOwnProperty("performanceTag") ? extraArgs.performanceTag : performanceTag,
      fromDate: extraArgs?.hasOwnProperty("fromDate") ? extraArgs.fromDate : (date?.[0] ? date[0].toISOString() : undefined),
      toDate: extraArgs?.hasOwnProperty("toDate") ? extraArgs.toDate : (date?.[1] ? date[1].toISOString() : undefined),
      fieldName: "startDateTime",
      sortType: "DESC",
      ...extraArgs,
    };

    // Clean undefined fields
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const requestSignature = JSON.stringify(payload);
    if (!isReload && lastFetchParamsRef.current === requestSignature) {
      return;
    }

    lastFetchParamsRef.current = requestSignature;
    setLoading(true);

    try {
      const res = await ApiCouponList(payload);
      if (res?.isSuccess) {
        setCouponList(res.data);
        setGroupsData(res);
      } else {
        Toast.error(res?.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
  }, [profileId?.value]);

  useEffect(() => {
    if (isFilterReady && profileId?.value) ApiListing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilterReady, profileId?.value, date, status, performanceTag]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const handleDateChange = (val) => {
    setDate(val);
    if (val && Array.isArray(val) && val.length >= 2) {
      const arr = [moment(val[0]).format("YYYY-MM-DD"), moment(val[1]).format("YYYY-MM-DD")];
      setSelectedDate(arr);
      try {
        let storeData = JSON.parse(localStorage.getItem('profile')) || {};
        storeData.date = arr;
        localStorage.setItem('profile', JSON.stringify(storeData));
      } catch (err) { }
    }
  };

  const handleStatusChange = (e) => {
    setStatus(e.target.value);
    setStatus(e.target.value);
  };

  const handlePerformanceChange = (e) => {
    setPerformanceTag(e.target.value);
    setPerformanceTag(e.target.value);
  };

  const handlePageChange = (page) => {
    setArg((prev) => ({ ...prev, pageNo: page }));
    ApiListing({ pageNo: page });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    ApiListing({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({
      fieldName: colId,
      ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }),
      ...arg,
    });
  };

  // ── Columns ─────────────────────────────────────────────────────────────────
  const columns = [
    // ① Coupon Title + product count
    {
      headerName: t("Coupon Title"),
      field: "name",
      title: "Coupon Title",
      minWidth: 240,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const count = row.productData?.length || row.asins?.length || 0;
        return (
          <div style={{ padding: "6px 0", lineHeight: 1.5 }}>
            <div
              id={"coupons-first-target-" + params.node.rowIndex}
              style={{
                color: isDark ? "#60a5fa" : "#0066c0",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                marginBottom: "2px",
              }}
              onClick={() => setSelectedCoupon(row)}
            >
              {params.value || "-"}
            </div>
            <div style={{ fontSize: "12px", color: isDark ? "var(--text-secondary)" : "#555" }}>Standard</div>
            {count > 0 && (
              <div style={{ fontSize: "12px", color: isDark ? "var(--text-secondary)" : "#555" }}>
                {count} {t("products")}
              </div>
            )}
          </div>
        );
      },
    },

    // ② Status + "View Coupon Page" link for RUNNING
    {
      headerName: t("Status"),
      field: "status",
      title: "Status",
      minWidth: 160,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const { status, couponId } = params.data || {};
        const couponPageUrl = couponId ? `https://www.amazon.in/promotion/psp/${couponId}` : null;
        return (
          <div style={{ padding: "6px 0", lineHeight: 1.6 }}>
            <Badge value={status} styleMap={STATUS_STYLE} isDark={isDark} />
            {status === "RUNNING" && couponPageUrl && (
              <div style={{ marginTop: "4px" }}>
                <a
                  href={couponPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "12px",
                    color: isDark ? "#60a5fa" : "#0066c0",
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("View coupon page")}
                </a>
              </div>
            )}
          </div>
        );
      },
    },

    // ③ Start date
    {
      headerName: t("Start Date"),
      field: "startDateTime",
      title: "Start Date",
      minWidth: 120,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => fmtDate(params.value),
    },

    // ④ End date
    {
      headerName: t("End Date"),
      field: "endDateTime",
      title: "End Date",
      minWidth: 120,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => fmtDate(params.value),
    },

    // ⑤ Discount — percentage stays as-is, fixed amount uses CurrencyCode
    {
      headerName: t("Discount"),
      field: "discountAmount",
      title: "Discount",
      minWidth: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const { discountType, discountAmount } = params.data || {};
        const isPercent = discountType === "PERCENT_OFF_LIST_PRICE";
        return (
          <div style={{ lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: "#B12704" }}>
              {isPercent
                ? `${discountAmount ?? "-"}%`
                : <>{CurrencyCode(discountAmount)}</>
              }
            </div>
            <div style={{ fontSize: "12px", color: isDark ? "var(--text-secondary)" : "#555" }}>{t("All customers")}</div>
          </div>
        );
      },
    },

    // ⑥ Budget / Budget utilisation — CurrencyCode on budget value
    {
      headerName: t("Budget"),
      field: "budget",
      title: "Budget",
      minWidth: 160,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const { budget, budgetSpent } = params.data || {};
        const pct = budget > 0 ? Math.round(((budgetSpent || 0) / budget) * 100) : 0;
        return (
          <div style={{ lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>
              <>{CurrencyCode(budget)}</>
            </div>
            <div style={{ fontSize: "12px", color: isDark ? "var(--text-secondary)" : "#555" }}>
              {budgetSpent > 0 ? `${pct}%` : "-"}
            </div>
          </div>
        );
      },
    },

    // ⑦ Clips / Redeemed — plain numbers, no currency
    {
      headerName: t("Clips / Redeemed"),
      field: "clips",
      title: "Clips / Redeemed",
      minWidth: 140,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const { clips, redemptions } = params.data || {};
        return (
          <div style={{ lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>{fmt(clips)}</div>
            <div style={{ fontSize: "12px", color: isDark ? "var(--text-secondary)" : "#555" }}>
              {redemptions != null ? fmt(redemptions) : "-"}
            </div>
          </div>
        );
      },
    },

    // ⑧ Sales / Budget Spent — CurrencyCode on both
    {
      headerName: t("Sales / Spends"),
      field: "sales",
      title: "Sales / Spends",
      minWidth: 150,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const { sales, budgetSpent } = params.data || {};
        return (
          <div style={{ lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>
              <>{CurrencyCode(sales)}</>
            </div>
            <div style={{ fontSize: "12px", color: isDark ? "var(--text-secondary)" : "#555" }}>
              <>{CurrencyCode(budgetSpent)}</>
            </div>
          </div>
        );
      },
    },

    // ⑨ Performance tag
    {
      headerName: t("Performance"),
      field: "performanceTag",
      title: "Performance",
      minWidth: 170,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <Badge value={params.value} styleMap={PERF_STYLE} isDark={isDark} />,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="coupons-page-container">
      <Filter
        name={"Coupons"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />

      {/* ── GLOBAL FILTERS: Sticky Header ── */}
      <div
        className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
        style={{
          padding: isMobile ? "12px 14px" : "10px 24px",
          zIndex: 90,
          position: isMobile ? "relative" : "sticky",
          top: 0,
          marginBottom: "20px",
          borderRadius: "12px",
          width: "100%"
        }}
      >
        <div className="flex flex-wrap items-center gap-[12px] w-full">
          {/* Search */}
          <div
            id="coupons-search"
            className="search_option m-0 flex items-center relative"
            style={{
              flex: isMobile ? "1 1 100%" : "1 1 260px",
              maxWidth: isMobile ? "100%" : "280px",
              height: "40px",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
              background: isDark ? "rgba(255, 255, 255, 0.04)" : "#F1F5F9",
              borderRadius: 6,
              paddingLeft: 12
            }}
          >
            <Input
              type="text"
              placeholder={t("searchHere")}
              value={searchName}
              onChange={handleSearch}
              className="flex-grow w-full h-[40px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none px-0"
              style={{ paddingRight: searchName ? "30px" : "10px" }}
            />
            {searchName && (
              <MdOutlineClose
                onClick={() => setSearchName("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.7,
                  transition: "opacity 0.2s"
                }}
                onMouseEnter={(e) => e.target.style.opacity = 1}
                onMouseLeave={(e) => e.target.style.opacity = 0.7}
              />
            )}
          </div>

          {/* Right-aligned filters group */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: isMobile ? "0" : "auto", justifyContent: isMobile ? "flex-start" : "flex-end", flex: isMobile ? "1 1 100%" : "1 1 auto", width: isMobile ? "100%" : "auto" }}>
            {/* Date Picker */}
            <div id="coupons-date-picker" style={{ flex: isMobile ? "1 1 100%" : "0 0 240px", width: isMobile ? "100%" : "240px" }}>
              <DateRangePicker
                className="w-full"
                style={{ width: "100%", height: "40px" }}
                ranges={predefinedRanges}
                value={date}
                placeholder={t("Select Date")}
                onChange={handleDateChange}
                placement={isMobile ? "bottomStart" : "bottomEnd"}
                format="yyyy-MM-dd"
                cleanable={true}
              />
            </div>

            {/* Status Dropdown */}
            <div id="coupons-status" style={{ flex: isMobile ? "1 1 100%" : "0 0 150px", width: isMobile ? "100%" : "150px" }}>
              <Select
                value={status === "" || status === undefined ? "__all" : status}
                onValueChange={(val) => handleStatusChange({ target: { value: val === "__all" ? "" : val } })}
              >
                <SelectTrigger className="h-10 text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || "__all"} value={opt.value || "__all"}>{t(opt.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Performance Dropdown */}
            <div id="coupons-performance" style={{ flex: isMobile ? "1 1 100%" : "0 0 150px", width: isMobile ? "100%" : "150px" }}>
              <Select
                value={performanceTag === "" || performanceTag === undefined ? "__all" : performanceTag}
                onValueChange={(val) => handlePerformanceChange({ target: { value: val === "__all" ? "" : val } })}
              >
                <SelectTrigger className="h-10 text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || "__all"} value={opt.value || "__all"}>{t(opt.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="middle_container">
        {/* Glass Grid Container */}
        <div className="glass-grid-container overflow-hidden">
          {/* Grid Header */}
          <div className="flex items-center justify-between px-4 py-3 border-bottom">
            <div className="flex items-center gap-2">
              <h5 className="m-0 font-bold">
                {t("Coupons")}
              </h5>
              {groupsData?.totalRecords > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  background: "#E0F4FD", color: "#1A9FD4",
                  padding: "2px 8px", borderRadius: 20,
                }}>
                  {groupsData.totalRecords} coupons
                </span>
              )}
            </div>

            {/* Export Button */}
            <div style={{ flex: "0 0 auto" }}>
              <AppTooltip text={t("Export to Excel")} arrow placement="top">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  className="h-[36px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 px-4 font-medium rounded-md shadow-sm"
                  style={{ flexGrow: isMobile ? 1 : 0 }}
                >
                  {t("Export")}
                </Button>
              </AppTooltip>
            </div>
          </div>

          {/* Grid Table */}
          <div className="data_table position-relative" style={{ padding: "0 14px 14px 14px" }}>
            <AgTable
              onRefresh={() => ApiListing({ isReload: true })} ref={gridRef}
              tableId="coupons-main-table"
              loading={!isFilterReady || loading}
              height={"65vh"}
              rowData={couponList}
              columnDefs={columns}
              totalRecords={groupsData?.totalRecords ?? 0}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"Coupons"}
              handleSaveColumns={undefined}
            />
          </div>
        </div>
      </div>

      {/* ── Modal ── */}
      {selectedCoupon && (
        <CouponProductModal
          coupon={selectedCoupon}
          onClose={() => setSelectedCoupon(null)}
        />
      )}
    </div>
  );
};

export default Coupons;