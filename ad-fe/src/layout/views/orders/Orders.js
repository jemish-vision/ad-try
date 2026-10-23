import React, { useState, useEffect, useContext, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import Filter from "../../../helper/filter/Filter";
import { ApiGetAllOrders } from "../../../api-wrapper/orders/ApiOrders";
import moment from "moment";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { MultiSelect } from "../../../components/ui/multi-select";
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import AgTable from "../../../common/grid/AgTable";
import { OrdersGrid } from "./OrderTrackingGrid";
import { Search as SearchIcon } from "lucide-react";
import { MdOutlineClose } from "react-icons/md";
import { Input } from "../../../components/ui/input";

// ─── Theme ────────────────────────────────────────────────────────────────────
const P = {
  primary: "#1A9FD4",
  primary50: "#E0F4FD",
  neutral100: "#F1F5F9",
  neutral200: "#E2E8F0",
  neutral400: "#94A3B8",
  neutral600: "#475569",
  neutral800: "#1E293B",
  danger: "#E74C3C",
  warning: "#F59E0B",
  success: "#16A34A",
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

const STATUS_OPTIONS = Object.keys(STATUS_STYLES).map(key => {
  const st = STATUS_STYLES[key];
  return {
    value: key,
    label: st.label,
    badgeLabel: st.label,
    searchLabel: st.label,
    statusColor: st.color,
    statusBg: st.bg,
    statusDarkBg: st.darkBg,
    statusDarkColor: st.darkColor,
  };
});

// ─── Main Component ───────────────────────────────────────────────────────────
const OrderTracking = () => {
  const { t } = useTranslation();
  const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  useEffect(() => {
    const handleTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handleTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);



  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 500);
  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsNarrow(window.innerWidth < 500);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Sticky bar state ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const [status, setStatus] = useState(["PENDING_AVAILABILITY", "PENDING", "UNSHIPPED", "PARTIALLY_SHIPPED", "SHIPPED", "UNFULFILLABLE"]);
  const [fulfillmentChannel, setFulfillmentChannel] = useState("ALL");

  const statusOptions = useMemo(() => Object.keys(STATUS_STYLES).map(key => {
    const st = STATUS_STYLES[key];
    const translatedLabel = t(st.label);
    return {
      value: key,
      label: translatedLabel,
      badgeLabel: translatedLabel,
      searchLabel: translatedLabel,
      statusColor: st.color,
      statusBg: st.bg,
      statusDarkBg: st.darkBg,
      statusDarkColor: st.darkColor,
    };
  }), [t]);
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

  const handleDateChange = (e) => {
    setOrderDateRange(e);
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

  // ── Grid state ────────────────────────────────────────────────────────────
  const [gridData, setGridData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [gridPage, setGridPage] = useState(1);
  const [gridPerPage, setGridPerPage] = useState(25);
  const [sortCol, setSortCol] = useState("orderCreatedTime");
  const [sortOrder, setSortOrder] = useState("desc");

  const lastFetchParamsRef = useRef("");

  const handleRefresh = () => {
    fetchGrid(gridPage, gridPerPage, sortCol, sortOrder, true);
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchGrid = async (
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
      setLoadingGrid(false);
      return;
    }

    const fromDateStr = orderDateRange?.[0] ? moment(orderDateRange[0]).format("YYYY-MM-DD") : undefined;
    const toDateStr = orderDateRange?.[1] ? moment(orderDateRange[1]).format("YYYY-MM-DD") : undefined;

    const getFulfilledByArray = (val) => {
      if (!val || val === "ALL") return undefined;
      if (val === "AMAZON") return ["AMAZON"];
      if (val === "MERCHANT") return ["MERCHANT"];
      return [val];
    };

    const requestSignature = JSON.stringify({
      profileId: profileId.value,
      pageNo: page,
      perPage,
      search: debouncedSearch || "",
      orderStatus: status || [],
      fulfilledBy: getFulfilledByArray(fulfillmentChannel) || [],
      fromDate: fromDateStr,
      toDate: toDateStr,
      fieldName: col || "",
      sortType: order || ""
    });

    if (!isReload && lastFetchParamsRef.current === requestSignature) {
      return;
    }

    lastFetchParamsRef.current = requestSignature;
    setLoadingGrid(true);
    try {
      const payload = {
        profileId: profileId.value,
        pageNo: page,
        perPage,
        search: debouncedSearch || undefined,
        orderStatus: status.length ? status : undefined,
        fulfilledBy: getFulfilledByArray(fulfillmentChannel),
        fromDate: fromDateStr,
        toDate: toDateStr,
        fieldName: col || undefined,
        sortType: order === "desc" ? "DESC" : order === "asc" ? "ASC" : undefined,
      };
      const res = await ApiGetAllOrders(payload);
      if (res?.isSuccess) {
        setGridData(res.data || []);
        setTotalRecords(res.totalRecords || 0);
        setGridPage(page);
      }
    } catch (err) {
      console.error("Orders Grid Error:", err);
    } finally {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
  }, [profileId?.value]);

  // Re-fetch on filter change
  useEffect(() => {
    if (!profileId?.value) return;
    fetchGrid(1);
  }, [profileId?.value, selectedAdType, debouncedSearch, status, fulfillmentChannel, orderDateRange]);

  const handleGridSort = (e) => {
    const columnState = e.api.getColumnState();
    const sorted = columnState.find((s) => s.sort !== null);
    if (sorted) {
      const { colId, sort } = sorted;
      setSortCol(colId);
      setSortOrder(sort);
      fetchGrid(gridPage, gridPerPage, colId, sort);
    } else {
      setSortCol(null);
      setSortOrder(null);
      fetchGrid(gridPage, gridPerPage, null, null);
    }
  };

  const refreshGrid = () => fetchGrid(1);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="order-tracking-container">
      <Filter nameShow={false} dateShow={false} profileShow={true} />

      {/* ── Page Content ── */}
      <div className="middle_container">
        {/* ── Sticky Top Bar ── */}
        <div
          id="orders-filters"
          className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            overflowX: "auto",
            columnGap: 12,
            rowGap: 10,
            padding: isMobile ? "10px 16px" : "10px 24px",
            zIndex: 90,
            top: 0,
            marginLeft: 0,
            marginRight: 0,
            marginBottom: "16px",
          }}
        >
          {/* Search */}
          <div
            id="orders-search"
            className="search_option"
            style={{
              display: "flex",
              alignItems: "center",
              position: "relative",
              flex: "1 1 auto",
              minWidth: 200,
              maxWidth: isNarrow ? "100%" : 320,
              width: isNarrow ? "100%" : undefined,
              borderRadius: 6,
              border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : P.neutral200}`,
              background: isDark ? "rgba(255, 255, 255, 0.04)" : P.neutral100,
            }}
          >
            <Input
              type="text"
              value={search}
              placeholder={t("Search by Order ID, ASIN, SKU, Buyer, Product...")}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setDebouncedSearch(search)}
              className="flex-grow border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none px-0 h-10"
              style={{
                paddingRight: search ? "30px" : "10px",
                color: isDark ? "#cbd5e1" : P.neutral800
              }}
            />
            {search && (
              <MdOutlineClose
                onClick={() => setSearch("")}
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginLeft: "auto", justifyContent: "flex-end", flex: "1 1 auto", width: isNarrow ? "100%" : undefined }}>
            {/* Fulfillment Channel Select */}
            <div id="orders-fulfillment" style={{ flex: "1 1 auto", minWidth: 190, maxWidth: isNarrow ? "100%" : 230, width: isNarrow ? "100%" : undefined }}>
              <ShadcnSelect
                value={fulfillmentChannel}
                onValueChange={(val) => setFulfillmentChannel(val)}
              >
                <SelectTrigger className="h-10 w-full bg-transparent border border-slate-200 dark:border-slate-800 text-xs shadow-none">
                  <SelectValue placeholder={t("All Fulfillment")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">{t("All Fulfillment")}</SelectItem>
                  <SelectItem value="AMAZON" className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                        <i className="fa-solid fa-warehouse text-[9px]" />
                        FBA
                      </span>
                      <span>{t("Fulfilled by Amazon")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="MERCHANT" className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                        <i className="fa-solid fa-store text-[9px]" />
                        MFN
                      </span>
                      <span>{t("Fulfilled by Merchant")}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </ShadcnSelect>
            </div>

            {/* Status Multi-Select */}
            <div id="orders-status" style={{ flex: "1 1 auto", minWidth: 200, maxWidth: isNarrow ? "100%" : 280, width: isNarrow ? "100%" : undefined }}>
              <MultiSelect
                options={statusOptions}
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
            <div id="orders-date-picker" style={{ flex: "1 1 auto", minWidth: 240, maxWidth: isNarrow ? "100%" : 260, width: isNarrow ? "100%" : undefined }}>
              <DateRangePicker
                className="w-full"
                ranges={predefinedRanges}
                value={orderDateRange}
                placeholder={t("Select Date Range")}
                onChange={handleDateChange}
                placement="bottomEnd"
                format="yyyy-MM-dd"
                cleanable={true}
                style={{ height: 40, width: "100%" }}
              />
            </div>
          </div>
        </div>

        {/* Active Filter Badges Row */}
        {((status && status.length > 0) || (fulfillmentChannel && fulfillmentChannel !== "ALL")) && (
          <div
            id="orders-applied-filter"
            className="mb-3 flex items-center flex-wrap gap-2 p-2 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 backdrop-blur-sm shadow-sm transition-all duration-300 w-full"
          >
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider select-none shrink-0 ml-1.5 mr-1">
              {t("Active Filters:")}
            </span>
            {fulfillmentChannel && fulfillmentChannel !== "ALL" && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/70 hover:text-slate-800 dark:hover:text-slate-100 transition-all select-none shadow-sm cursor-pointer"
                onClick={() => setFulfillmentChannel("ALL")}
              >
                <i className={`fa-solid ${fulfillmentChannel === "AMAZON" ? "fa-warehouse" : "fa-store"} text-[10px] text-slate-400 dark:text-slate-500`} />
                {fulfillmentChannel === "AMAZON" ? t("Fulfillment: FBA") : t("Fulfillment: MFN")}
                <MdOutlineClose className="w-3.5 h-3.5 opacity-60 hover:opacity-100 transition-opacity ml-1 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400" />
              </span>
            )}
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
                  {st?.label ? t(st.label) : t(s)}
                  <MdOutlineClose className="w-3.5 h-3.5 opacity-60 hover:opacity-100 transition-opacity ml-1 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400" />
                </span>
              );
            })}
            <span
              className="text-[11px] font-bold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 transition-colors cursor-pointer select-none underline decoration-rose-500/30 decoration-2 underline-offset-2 ml-auto shrink-0 mr-1.5"
              onClick={() => {
                setStatus([]);
                setFulfillmentChannel("ALL");
              }}
            >
              {t("Clear All")}
            </span>
          </div>
        )}

        <div id="orders-main-table" className="w-full mt-4">
          {!isSpConnected && isSpLoaded ? (
            <SpAccountNotConnected feature={t("Orders")} isDark={isDark} />
          ) : (
            <OrdersGrid
              onRefresh={handleRefresh}
              rowData={gridData}
              totalRecords={totalRecords}
              loading={loadingGrid}
              currentPage={gridPage}
              rowsPerPage={gridPerPage}
              onPageChange={(p) => fetchGrid(p)}
              onPerPageChange={(pp) => { setGridPerPage(pp); fetchGrid(1, pp); }}
              onSortChanged={handleGridSort}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderTracking;