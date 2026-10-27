import React, { useRef, useState, useEffect, useContext } from 'react';
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import Filter from "../../../helper/filter/Filter";
import {
  ApiRefundGraph,
  ApiRefundFilterDropdowns,
  ApiRefundGrid
} from "../../../api-wrapper/returns/ApiReturns";
import ReturnTrackingCharts from "./ReturnTrackingCharts";
import ReturnTrackingGrid from "./ReturnTrackingGrid";
import ReturnTrackingFilterModal from "./ReturnTrackingFilterModal";
import ReturnTrackingAppliedFilters from "./ReturnTrackingAppliedFilters";
import usePageFilter from "../../../helper/filter/usePageFilter";
import moment from "moment";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { FiSearch } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import { exportGridToExcel } from "../../../utility/exportExcel";
import { useDispatch, handleLoader } from "../../../helper/links/Link";
import "./ReturnTracking.css";

// ─── Filter option definitions ────────────────────────────────────────────────
const FILTER_OPTIONS = [
  { label: "Return Type", value: "ReturnType", labelKey: "Return Type" },
  { label: "Return Reason", value: "ReturnReasonCode", labelKey: "Return Reason" },
  { label: "Return Status", value: "ReturnStatus", labelKey: "Return Status" },
  { label: "Return Source", value: "ReturnSource", labelKey: "Return Source" },
  { label: "Is Prime", value: "IsPrime", labelKey: "Is Prime" },
  { label: "In Policy", value: "InPolicy", labelKey: "In Policy" },
  { label: "Return Request Date", value: "ReturnRequestDate", labelKey: "Return Request Date" },
  { label: "Return Delivery Date", value: "ReturnDeliveryDate", labelKey: "Return Delivery Date" },
];

// ─── Build chip display text ──────────────────────────────────────────────────
const buildDisplayText = (type, state, dropdownOptions) => {
  if (type === "ReturnType") {
    if (!state.selectedReturnTypes?.length) return null;
    const labels = state.selectedReturnTypes.map(
      (v) => dropdownOptions?.returnTypes?.find((o) => o.value === v)?.label ?? v
    );
    return `Return Type: ${labels.join(", ")}`;
  }
  if (type === "ReturnReasonCode") {
    if (!state.selectedReturnReasonCodes?.length) return null;
    const labels = state.selectedReturnReasonCodes.map(
      (v) => dropdownOptions?.returnReasonCodes?.find((o) => o.value === v)?.label ?? v
    );
    return `Return Reason: ${labels.join(", ")}`;
  }
  if (type === "ReturnStatus") {
    if (!state.selectedReturnStatuses?.length) return null;
    return `Status: ${state.selectedReturnStatuses.join(", ")}`;
  }
  if (type === "ReturnSource") {
    if (!state.selectedReturnSources?.length) return null;
    const labels = state.selectedReturnSources.map(
      (v) => dropdownOptions?.returnSources?.find((o) => o.value === v)?.label ?? v
    );
    return `Source: ${labels.join(", ")}`;
  }
  if (type === "IsPrime") {
    if (state.isPrime === null) return null;
    return `Prime: ${state.isPrime ? "Yes" : "No"}`;
  }
  if (type === "InPolicy") {
    if (state.inPolicy === null) return null;
    return `In Policy: ${state.inPolicy ? "Yes" : "No"}`;
  }
  if (type === "ReturnRequestDate") {
    if (!state.returnRequestDateRange?.[0] || !state.returnRequestDateRange?.[1]) return null;
    return `Return Request: ${moment(state.returnRequestDateRange[0]).format("MMM DD, YYYY")} – ${moment(state.returnRequestDateRange[1]).format("MMM DD, YYYY")}`;
  }
  if (type === "ReturnDeliveryDate") {
    if (!state.returnDeliveryDateRange?.[0] || !state.returnDeliveryDateRange?.[1]) return null;
    return `Delivery Date: ${moment(state.returnDeliveryDateRange[0]).format("MMM DD, YYYY")} – ${moment(state.returnDeliveryDateRange[1]).format("MMM DD, YYYY")}`;
  }
  return null;
};

// ─── Main Component ───────────────────────────────────────────────────────────
const ReturnTracking = () => {
  const { t } = useTranslation();
  const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Responsive breakpoints — mirrors Targeting
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Sticky bar filter state ──────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  // removed isExactSearchMatch
  const [orderDateRange, setOrderDateRange] = useState([
    moment().subtract(30, "days").toDate(),
    moment().subtract(1, "days").toDate(),
  ]);

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setOrderDateRange([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
    }
  }, [selectedDate]);

  // ── Filter modal ─────────────────────────────────────────────────────────
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilterOption, setSelectedFilterOption] = useState(null);

  // ── Per-filter local state ────────────────────────────────────────────────
  const [selectedReturnTypes, setSelectedReturnTypes] = useState([]);
  const [selectedReturnReasonCodes, setSelectedReturnReasonCodes] = useState([]);
  const [selectedReturnStatuses, setSelectedReturnStatuses] = useState([]);
  const [selectedReturnSources, setSelectedReturnSources] = useState([]);
  const [isPrime, setIsPrime] = useState(null);
  const [inPolicy, setInPolicy] = useState(null);
  const [returnRequestDateRange, setReturnRequestDateRange] = useState([null, null]);
  const [returnDeliveryDateRange, setReturnDeliveryDateRange] = useState([null, null]);
  const [selectedCondition, setSelectedCondition] = useState("$eq");
  const [filterValue, setFilterValue] = useState("0.00");

  // ── Applied chips ─────────────────────────────────────────────────────────
  const [appliedFilters, setAppliedFilters] = useState([]);

  // ── Dropdown options ──────────────────────────────────────────────────────
  const [dropdownOptions, setDropdownOptions] = useState({
    returnReasonCodes: [],
    returnTypes: [],
    returnStatuses: [],
    returnSources: [],
  });
  // eslint-disable-next-line no-unused-vars
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  // ── Chart state ───────────────────────────────────────────────────────────
  const [graphData, setGraphData] = useState(null);
  const [loadingGraph, setLoadingGraph] = useState(true);

  // ── Grid state ────────────────────────────────────────────────────────────
  const [gridData, setGridData] = useState([]);
  const [totalGridRecords, setTotalGridRecords] = useState(0);
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [gridPage, setGridPage] = useState(1);
  const [gridPerPage, setGridPerPage] = useState(25);
  const [sortCol, setSortCol] = useState("returnRequestDate");
  const [sortOrder, setSortOrder] = useState("desc");

  // removed exporting
  const gridRef = useRef(null);
  const dispatch = useDispatch();

  // ── Auto-save and restore page filter ──────────────────────────────────────
  const { isFilterReady } = usePageFilter({
    pageName: "Returns",
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters,
    setAppliedFilters,
    onFilterLoad: (savedFilters) => {
      const getFilterVal = (type) => savedFilters.find(f => f.type === type)?.value;

      setSelectedReturnTypes(getFilterVal("ReturnType") || []);
      setSelectedReturnReasonCodes(getFilterVal("ReturnReasonCode") || []);
      setSelectedReturnStatuses(getFilterVal("ReturnStatus") || []);
      setSelectedReturnSources(getFilterVal("ReturnSource") || []);
      setIsPrime(getFilterVal("IsPrime") ?? null);
      setInPolicy(getFilterVal("InPolicy") ?? null);
      setReturnRequestDateRange(getFilterVal("ReturnRequestDate") || [null, null]);
      setReturnDeliveryDateRange(getFilterVal("ReturnDeliveryDate") || [null, null]);
    }
  });

  // ── Build API payload ─────────────────────────────────────────────────────
  const buildPayload = () => {
    const getChip = (type) => appliedFilters.find((f) => f.type === type);

    const rtChip = getChip("ReturnType");
    const rrcChip = getChip("ReturnReasonCode");
    const rsChip = getChip("ReturnStatus");
    const srcChip = getChip("ReturnSource");
    const primeChip = getChip("IsPrime");
    const policyChip = getChip("InPolicy");
    const rrDateChip = getChip("ReturnRequestDate");
    const rdDateChip = getChip("ReturnDeliveryDate");

    const payload = {
      profileId: profileId.value,
      search: debouncedSearch || undefined,
      returnType: rtChip?.value?.length ? rtChip.value : undefined,
      returnReasonCode: rrcChip?.value?.length ? rrcChip.value : undefined,
      returnRequestStatus: rsChip?.value?.length ? rsChip.value : undefined,
      returnSource: srcChip?.value?.length ? srcChip.value : undefined,
      isPrime: primeChip ? primeChip.value : undefined,
      inPolicy: policyChip ? policyChip.value : undefined,
    };

    if (orderDateRange?.[0] && orderDateRange?.[1]) {
      payload.orderDateFrom = moment(orderDateRange[0]).format("YYYY-MM-DD");
      payload.orderDateTo = moment(orderDateRange[1]).format("YYYY-MM-DD");
    }
    if (rrDateChip?.value?.[0] && rrDateChip?.value?.[1]) {
      payload.returnRequestDateFrom = moment(rrDateChip.value[0]).format("YYYY-MM-DD");
      payload.returnRequestDateTo = moment(rrDateChip.value[1]).format("YYYY-MM-DD");
    }
    if (rdDateChip?.value?.[0] && rdDateChip?.value?.[1]) {
      payload.returnDeliveryDateFrom = moment(rdDateChip.value[0]).format("YYYY-MM-DD");
      payload.returnDeliveryDateTo = moment(rdDateChip.value[1]).format("YYYY-MM-DD");
    }

    return payload;
  };

  // ── API calls ─────────────────────────────────────────────────────────────
  const fetchDropdowns = async () => {
    if (!profileId?.value) return;
    if (isSpLoaded && !isSpConnected) {
      setDropdownOptions(null);
      setLoadingDropdowns(false);
      return;
    }
    setLoadingDropdowns(true);
    try {
      const res = await ApiRefundFilterDropdowns({ profileId: profileId.value });
      if (res?.isSuccess) setDropdownOptions(res.data);
    } catch (err) {
      console.error("Return Dropdowns Error:", err);
    } finally {
      setLoadingDropdowns(false);
    }
  };

  const fetchGraph = async () => {
    if (!profileId?.value) return;
    if (isSpLoaded && !isSpConnected) {
      setGraphData(null);
      setLoadingGraph(false);
      return;
    }
    setLoadingGraph(true);
    try {
      const [res] = await Promise.all([
        ApiRefundGraph(buildPayload()),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);
      if (res?.isSuccess) setGraphData(res.data);
    } catch (err) {
      console.error("Return Graph Error:", err);
    } finally {
      setLoadingGraph(false);
    }
  };

  const lastFetchGridParamsRef = useRef("");

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
      setTotalGridRecords(0);
      setLoadingGrid(false);
      return;
    }

    const payload = {
      ...buildPayload(),
      pageNo: page,
      perPage,
      fieldName: col || undefined,
      sortType: order === "desc" ? -1 : order === "asc" ? 1 : undefined,
    };

    const requestSignature = JSON.stringify(payload);
    if (!isReload && lastFetchGridParamsRef.current === requestSignature) {
      return;
    }

    lastFetchGridParamsRef.current = requestSignature;
    setLoadingGrid(true);
    try {
      const [res] = await Promise.all([
        ApiRefundGrid(payload),
        new Promise(resolve => setTimeout(resolve, 300)) // Ensure loader flashes so user knows it refreshed
      ]);
      if (res?.isSuccess) {
        setGridData(res.data || []);
        setTotalGridRecords(res.totalRecords || 0);
        setGridPage(page);
      }
    } catch (err) {
      console.error("ReturnTracking Grid Error:", err);
    } finally {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    lastFetchGridParamsRef.current = "";
  }, [profileId?.value]);

  // eslint-disable-next-line no-unused-vars
  const handleExport = async () => {
    if (!profileId?.value || !gridRef.current) return;
    dispatch(handleLoader(true));
    try {
      const payload = {
        ...buildPayload(),
        pageNo: 1,
        perPage: 100000,
        fieldName: sortCol || undefined,
        sortType: sortOrder === "desc" ? -1 : sortOrder === "asc" ? 1 : undefined,
      };

      const res = await ApiRefundGrid(payload);
      if (res?.isSuccess && res.data?.length > 0) {
        const cols = gridRef.current.getColumns();
        exportGridToExcel(res.data, cols, `Returns_${moment().format("YYYY-MM-DD")}.xlsx`);
      }
    } catch (err) {
      console.error("Export Error:", err);
    } finally {
      dispatch(handleLoader(false));
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDropdowns(); }, [profileId?.value]);

  useEffect(() => {
    if (!isFilterReady || !profileId?.value) return;
    const id = setTimeout(() => {
      fetchGraph();
      fetchGrid(1);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilterReady, profileId?.value, selectedAdType, search, orderDateRange, appliedFilters]);

  // ── Grid sort ─────────────────────────────────────────────────────────────
  const handleGridSort = (e) => {
    const columnState = e.api.getColumnState();
    const sorted = columnState.find((s) => s.sort !== null);
    if (sorted) {
      const { colId, sort } = sorted;
      setSortCol(colId);
      setSortOrder(sort);
      fetchGrid(gridPage, gridPerPage, colId, sort, true);
    } else {
      setSortCol(null);
      setSortOrder(null);
      fetchGrid(gridPage, gridPerPage, null, null, true);
    }
  };

  // ── Refresh ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  const refreshGrid = () => {
    fetchGraph();
    fetchGrid(1, gridPerPage, sortCol, sortOrder, true);
  };

  // ── "Filter By" dropdown → open modal ────────────────────────────────────
  const handleFilterOptionClick = (option) => {
    const existing = appliedFilters.find((f) => f.type === option.value);
    setSelectedFilterOption(option);

    if (option.value === "ReturnType") setSelectedReturnTypes(existing?.value ?? []);
    else if (option.value === "ReturnReasonCode") setSelectedReturnReasonCodes(existing?.value ?? []);
    else if (option.value === "ReturnStatus") setSelectedReturnStatuses(existing?.value ?? []);
    else if (option.value === "ReturnSource") setSelectedReturnSources(existing?.value ?? []);
    else if (option.value === "IsPrime") setIsPrime(existing ? existing.value : null);
    else if (option.value === "InPolicy") setInPolicy(existing ? existing.value : null);
    else if (option.value === "ReturnRequestDate") setReturnRequestDateRange(existing?.value ?? [null, null]);
    else if (option.value === "ReturnDeliveryDate") setReturnDeliveryDateRange(existing?.value ?? [null, null]);

    setTimeout(() => {
      setShowFilterModal(true);
    }, 10);
  };

  // ── Modal Apply ───────────────────────────────────────────────────────────
  const handleApplyFilter = () => {
    if (!selectedFilterOption) return;
    const type = selectedFilterOption.value;

    const modalState = {
      selectedReturnTypes,
      selectedReturnReasonCodes,
      selectedReturnStatuses,
      selectedReturnSources,
      isPrime,
      inPolicy,
      returnRequestDateRange,
      returnDeliveryDateRange,
    };

    const displayText = buildDisplayText(type, modalState, dropdownOptions);

    if (!displayText) {
      setAppliedFilters((prev) => prev.filter((f) => f.type !== type));
      handleModalClose();
      return;
    }

    const valueMap = {
      ReturnType: selectedReturnTypes,
      ReturnReasonCode: selectedReturnReasonCodes,
      ReturnStatus: selectedReturnStatuses,
      ReturnSource: selectedReturnSources,
      IsPrime: isPrime,
      InPolicy: inPolicy,
      ReturnRequestDate: returnRequestDateRange,
      ReturnDeliveryDate: returnDeliveryDateRange,
    };

    const chip = {
      id: `${type}-${Date.now()}`,
      type,
      label: selectedFilterOption.label,
      displayText,
      value: valueMap[type],
    };

    setAppliedFilters((prev) => [
      ...prev.filter((f) => f.type !== type),
      chip,
    ]);

    handleModalClose();
  };

  // ── Modal close / reset ───────────────────────────────────────────────────
  const handleModalClose = () => {
    setShowFilterModal(false);
    setSelectedFilterOption(null);
    setSelectedReturnTypes([]);
    setSelectedReturnReasonCodes([]);
    setSelectedReturnStatuses([]);
    setSelectedReturnSources([]);
    setIsPrime(null);
    setInPolicy(null);
    setReturnRequestDateRange([null, null]);
    setReturnDeliveryDateRange([null, null]);
    setSelectedCondition("$eq");
    setFilterValue("0.00");
  };

  const handleEditFilter = (chip) => {
    const option = FILTER_OPTIONS.find((o) => o.value === chip.type);
    if (option) handleFilterOptionClick(option);
  };
  const handleRemoveFilter = (id) => setAppliedFilters((prev) => prev.filter((f) => f.id !== id));
  const handleClearAll = () => {
    setAppliedFilters([]);
    setSearch("");
    setOrderDateRange([moment().subtract(30, "days").toDate(), moment().subtract(1, "days").toDate()]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="return-tracking-container">
      <Filter nameShow={false} dateShow={false} profileShow={true} />

      <div className="middle_container">
        <div
          className={`glass-sticky-header grid grid-cols-1 min-[500px]:grid-cols-2 min-[653px]:flex items-center gap-3 w-full max-w-full box-border ${!isMobile ? "sticky-top" : ""}`}
          style={{
            padding: isMobile ? "10px 16px" : "10px 24px",
            zIndex: 99,
            top: 0,
            marginTop: "-10px",
            marginBottom: "20px",
          }}
        >
          {/* ── Filter By dropdown ── */}
          <div id="returns-filter-by" className="w-full min-w-0 min-[500px]:col-span-2 min-[653px]:w-auto min-[653px]:flex-shrink-0">
            <Popover>
              <div className="dropdown border override-scope bulk-actions-dropdown active m-0 w-full min-[653px]:w-auto">
                <PopoverTrigger asChild>
                  <button
                    id="rt-filter-by-dropdown"
                    type="button"
                    className="dropdown-toggle btn w-full"
                  >
                    <span>
                      <i className="fa-solid fa-filter mr-2" style={{ fontSize: 12 }} />
                      {t("Filter By")}
                    </span>
                  </button>
                </PopoverTrigger>
              </div>
              <PopoverContent align="start" className="w-56 bg-white z-50 bulk-actions-dropdown dropdown-menu shadow-sm">
                <div className="px-2 py-1.5 text-sm font-semibold fw-bolder text-dark dropdown-header" style={{ fontSize: 12 }}>
                  {t("Filter Options")}
                </div>
                {FILTER_OPTIONS.map((option) => (
                  <div className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer dropdown-item d-flex align-items-center"
                    key={option.value}
                    onClick={() => handleFilterOptionClick(option)}

                  >
                    {appliedFilters.some((f) => f.type === option.value) && (
                      <span className="text-success font-bold mr-1">✓</span>
                    )}
                    {t(option.labelKey)}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* ── Search box ── */}
          <div
            id="returns-search"
            className="search_option m-0 flex items-center relative w-full min-w-0 min-[653px]:flex-1 min-[653px]:max-w-[420px] min-[653px]:ml-auto"
            style={{ height: "40px" }}
          >
            <span style={{ padding: "0 10px", color: "#94a3b8", display: "flex", alignItems: "center" }}>
              <FiSearch style={{ fontSize: 18 }} />
            </span>
            <input
              type="text"
              value={search}
              placeholder={t("Search by Product, ASIN, SKU, Order ID...")}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setDebouncedSearch(search)}
              className="w-full min-w-0 h-full border-none outline-none bg-transparent shadow-none"
              style={{ paddingRight: search ? "30px" : "10px" }}
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

          {/* ── Date picker ── */}
          <div id="returns-date-picker" className="w-full min-w-0 min-[653px]:w-auto min-[653px]:flex-shrink-0">
            <DateRangePicker
              className="w-full min-[653px]:w-[260px]"
              ranges={predefinedRanges}
              value={orderDateRange}
              placeholder={t("Select Date Range")}
              onChange={setOrderDateRange}
              placement="bottomEnd"
              format="yyyy-MM-dd"
              cleanable={true}
              style={{ height: 40 }}
            />
          </div>
        </div>

        {/* ══ APPLIED FILTER CHIPS ══ */}
        <ReturnTrackingAppliedFilters
          appliedFilters={appliedFilters}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearAll}
          onEdit={handleEditFilter}
          isDark={isDark}
        />

        {/* ══ PAGE CONTENT ══ */}
        {!isSpConnected && isSpLoaded ? (
          <SpAccountNotConnected feature={t("Returns & Refunds")} isDark={isDark} />
        ) : (
          <>
            <div id="returns-charts">
              <ReturnTrackingCharts data={graphData} loading={!isFilterReady || loadingGraph} isDark={isDark} />
            </div>

            <div id="returns-grid">
              <ReturnTrackingGrid
                rowData={gridData}
                totalRecords={totalGridRecords}
                loading={!isFilterReady || loadingGrid}
                currentPage={gridPage}
                rowsPerPage={gridPerPage}
                onPageChange={(p) => fetchGrid(p)}
                onPerPageChange={(pp) => { setGridPerPage(pp); fetchGrid(1, pp); }}
                onSortChanged={handleGridSort}
                onRefresh={() => refreshGrid()}
                isDark={isDark}
              />
            </div>
          </>
        )}
      </div>

      {/* ══ FILTER MODAL ══ */}
      <ReturnTrackingFilterModal
        showFilterModal={showFilterModal}
        handleModalClose={handleModalClose}
        selectedFilterOption={selectedFilterOption}
        dropdownOptions={dropdownOptions}
        // multi-select
        selectedReturnTypes={selectedReturnTypes}
        setSelectedReturnTypes={setSelectedReturnTypes}
        selectedReturnReasonCodes={selectedReturnReasonCodes}
        setSelectedReturnReasonCodes={setSelectedReturnReasonCodes}
        // single-select
        selectedReturnStatuses={selectedReturnStatuses}
        setSelectedReturnStatuses={setSelectedReturnStatuses}
        selectedReturnSources={selectedReturnSources}
        setSelectedReturnSources={setSelectedReturnSources}
        // boolean
        isPrime={isPrime}
        setIsPrime={setIsPrime}
        inPolicy={inPolicy}
        setInPolicy={setInPolicy}
        // date ranges
        orderDateRange={orderDateRange}
        setOrderDateRange={setOrderDateRange}
        returnRequestDateRange={returnRequestDateRange}
        setReturnRequestDateRange={setReturnRequestDateRange}
        returnDeliveryDateRange={returnDeliveryDateRange}
        setReturnDeliveryDateRange={setReturnDeliveryDateRange}
        // numeric
        selectedCondition={selectedCondition}
        setSelectedCondition={setSelectedCondition}
        filterValue={filterValue}
        setFilterValue={setFilterValue}
        // apply
        onApply={handleApplyFilter}
        isDark={isDark}
      />
    </div>
  );
};

export default ReturnTracking;
