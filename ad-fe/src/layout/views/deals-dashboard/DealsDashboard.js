import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from "react";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { ApiGetDealsStats, ApiGetDealsList } from "../../../api-wrapper/deals/ApiDeals";
import { Toast } from "../../../helper/links/Link";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import moment from "moment";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import subDays from "date-fns/subDays";
import addDays from "date-fns/addDays";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { firstPageRows } from "../../../helper/table/TableStyle";
import AgCustomHeader from "../../../common/grid/AgCustomHeader";
import { useTranslation } from "react-i18next";
import { FiSearch, FiRefreshCw, FiTrendingUp, FiBox, FiEye, FiActivity } from "react-icons/fi";
import DealsProductGrid from "./DealsProductGrid";
import "./DealsDashboard.css";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { ChevronDown as ExpandMoreIcon } from "lucide-react";
import { MdOutlineClose } from "react-icons/md";
import { useDispatch, handleLoader } from "../../../helper/links/Link";
import { exportGridToExcel } from "../../../utility/exportExcel";
import usePageFilter from "../../../helper/filter/usePageFilter";
import { AppTooltip } from "../../../components/ui/AppTooltip";

const STATUS_OPTIONS = [
    { value: "", label: "All Statuses" },
    { value: "Running", label: "Running" },
    { value: "Upcoming", label: "Upcoming" },
    { value: "Needs Attention", label: "Needs Attention" },
    { value: "Ended", label: "Ended" },
    { value: "Canceled", label: "Canceled" },
    { value: "Draft", label: "Draft" }
];

const TYPE_OPTIONS = [
    { value: "", label: "All Types" },
    { value: "BEST_DEAL", label: "Best Deals" },
    { value: "LIGHTNING_DEAL", label: "Lightning Deals" },
    { value: "TOP_DEAL", label: "Top Deal" }
];

const DealsDashboard = () => {
    const { t } = useTranslation();
    const { profileId, selectedAdType, currencyCode, selectedDate, setSelectedDate } = useContext(ProfileContext);
    const gridRef = useRef(null);

    const [date, setDate] = useState(null);

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
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
        }, 350);
        return () => clearTimeout(handler);
    }, [search]);

    const [status, setStatus] = useState("");
    const [type, setType] = useState("");
    const dispatch = useDispatch();

    const [stats, setStats] = useState({ totalSales: 0, totalUnits: 0, totalViews: 0, conversionRate: 0 });
    const [deals, setDeals] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [pageNo, setPageNo] = useState(1);
    const [perPage, setPerPage] = useState(firstPageRows);
    const [sortColumn, setSortColumn] = useState("startDateTime");
    const [sortOrder, setSortOrder] = useState("desc");

    const [isMobile, setIsMobile] = useState(window.innerWidth < 1400);
    const [isNarrow, setIsNarrow] = useState(window.innerWidth < 500);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 1400);
            setIsNarrow(window.innerWidth < 500);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const appliedFiltersObj = useMemo(() => ({
        status,
        type
    }), [status, type]);

    const { isFilterReady } = usePageFilter({
        pageName: "DealsDashboard",
        profileId: profileId?.value,
        selectedAdType,
        appliedFilters: appliedFiltersObj,
        setAppliedFilters: (saved) => {
            if (saved && !Array.isArray(saved) && typeof saved === "object") {
                setStatus(saved.status || "");
                setType(saved.type || "");
            }
        }
    });

    const lastStatsParamsRef = useRef("");

    const loadStats = async () => {
        if (!profileId?.value) return;
        try {
            const params = { profileId: profileId.value };
            if (date && date.length === 2) {
                params.startDate = moment(date[0]).format("YYYY-MM-DD");
                params.endDate = moment(date[1]).format("YYYY-MM-DD");
            }
            
            const requestSignature = JSON.stringify(params);
            if (lastStatsParamsRef.current === requestSignature) {
                return;
            }
            lastStatsParamsRef.current = requestSignature;

            const res = await ApiGetDealsStats(params);
            if (res?.isSuccess) setStats(res.data);
        } catch (error) {
            console.error("Stats Error", error);
        }
    };

    const [loading, setLoading] = useState(true);
    const lastFetchParamsRef = useRef("");

    const loadDeals = async (isReload = false) => {
        if (!profileId?.value) return;

        const params = {
            profileId: profileId.value,
            pageNo,
            perPage,
            search: debouncedSearch || "",
            status: status || "",
            type: type || "",
            ...(date && date.length === 2 ? {
                startDate: moment(date[0]).format("YYYY-MM-DD"),
                endDate: moment(date[1]).format("YYYY-MM-DD")
            } : {}),
            sortColumn: sortColumn || "",
            sortOrder: sortOrder || ""
        };

        const requestSignature = JSON.stringify(params);
        if (!isReload && lastFetchParamsRef.current === requestSignature) {
            return;
        }

        lastFetchParamsRef.current = requestSignature;
        setLoading(true);

        try {
            const res = await ApiGetDealsList(params);
            if (res?.isSuccess) {
                setDeals(res.data);
                setTotalRecords(res.totalRecords);
            }
        } catch (error) {
            console.error("List Error", error);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        if (!profileId?.value) return;
        dispatch(handleLoader(true));
        try {
            const params = {
                profileId: profileId.value,
                pageNo: 1,
                perPage: 100000,
                search,
                status,
                type,
                ...(date && date.length === 2 ? {
                    startDate: moment(date[0]).format("YYYY-MM-DD"),
                    endDate: moment(date[1]).format("YYYY-MM-DD")
                } : {}),
                sortColumn,
                sortOrder
            };

            if (gridRef.current?.api) {
                const columnState = gridRef.current.api.getColumnState();
                const sorted = columnState.find((s) => s.sort !== null && s.sort !== undefined);
                if (sorted) {
                    params.sortColumn = sorted.colId;
                    params.sortOrder = sorted.sort === "asc" ? "ASC" : "DESC";
                }
            }

            const res = await ApiGetDealsList(params);
            if (res?.isSuccess && res.data?.length > 0) {
                exportGridToExcel(res.data, columnDefs, `Deals_${moment().format("YYYY-MM-DD")}.xlsx`);
            }
        } catch (error) {
            console.error("Export Error", error);
        } finally {
            dispatch(handleLoader(false));
        }
    };

    useEffect(() => {
        lastFetchParamsRef.current = "";
        lastStatsParamsRef.current = "";
    }, [profileId?.value]);

    useEffect(() => {
        if (isFilterReady) {
            loadStats();
            loadDeals();
        }
    }, [isFilterReady, profileId, date, status, type, pageNo, perPage, sortColumn, sortOrder]);

    const handleSearch = (e) => {
        if (e.key === "Enter") {
            setPageNo(1);
            setDebouncedSearch(search);
        }
    };

    const handleStatusChange = (e) => {
        const newStatus = e.target.value;
        setStatus(newStatus);

        // Auto-switch calendar to Next 60 days if 'Upcoming' is selected
        if (newStatus === "Upcoming") {
            const newDate = [new Date(), addDays(new Date(), 60)];
            setDate(newDate);
            const arr = [moment(newDate[0]).format("YYYY-MM-DD"), moment(newDate[1]).format("YYYY-MM-DD")];
            setSelectedDate(arr);
            try {
                let storeData = JSON.parse(localStorage.getItem('profile')) || {};
                storeData.date = arr;
                localStorage.setItem('profile', JSON.stringify(storeData));
            } catch (err) { }
        } else if (status === "Upcoming" && newStatus !== "Upcoming") {
            // Revert to all data (null) if navigating away from Upcoming
            setDate(null);
            setSelectedDate(null);
            try {
                let storeData = JSON.parse(localStorage.getItem('profile')) || {};
                delete storeData.date;
                localStorage.setItem('profile', JSON.stringify(storeData));
            } catch (err) { }
        }
    };


    const statusOptions = useMemo(() => [
        { value: "", label: t("All Statuses") },
        { value: "Running", label: t("Running") },
        { value: "Upcoming", label: t("Upcoming") },
        { value: "Needs Attention", label: t("Needs Attention") },
        { value: "Ended", label: t("Ended") },
        { value: "Canceled", label: t("Canceled") },
        { value: "Draft", label: t("Draft") }
    ], [t]);

    const typeOptions = useMemo(() => [
        { value: "", label: t("All Types") },
        { value: "BEST_DEAL", label: t("Best Deals") },
        { value: "LIGHTNING_DEAL", label: t("Lightning Deals") },
        { value: "TOP_DEAL", label: t("Top Deal") }
    ], [t]);

    const columnDefs = useMemo(() => [
        {
            headerName: "",
            field: "expand",
            maxWidth: 50,
            pinned: "left",
            lockPinned: true,
            suppressMovable: true,
            sortable: false,
            resizable: false,
            cellRenderer: "agGroupCellRenderer",
            cellRendererParams: {
                suppressCount: true,
                innerRenderer: () => null,
            },
        },
        {
            headerName: t("Deal Title"),
            field: "promotionName",
            minWidth: 300,
            sortable: true,
            pinned: "left",
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const row = params.data;
                const productsCount = row?.includedProducts?.length || 0;
                const typeMap = {
                    "BEST_DEAL": t("Best Deals"),
                    "LIGHTNING_DEAL": t("Lightning Deals"),
                    "TOP_DEAL": t("Top Deal")
                };
                const displayType = typeMap[row.type] || row.type;
                return (
                    <div id={"deals-first-target-" + params.node.rowIndex} className="deal-title-cell">
                        <div className="deal-name">{row.promotionName}</div>
                        <div className="deal-meta">
                            <span>ID: {row.promotionId}</span>
                            <span className="dot"></span>
                            <span>{productsCount} {t("SKUs")}</span>
                            <span className="dot"></span>
                            <span className="deal-type-tag">{displayType}</span>
                        </div>
                    </div>
                );
            }
        },
        {
            headerName: t("Amazon Store"),
            field: "marketplaceId",
            width: 140,
            cellRenderer: (params) => {
                const marketplaceMap = {
                    "ATVPDKIKX0DER": "USA",
                    "A2EUQ1WTGCTBG2": "Canada",
                    "A1AM78C64UM0Y8": "Mexico",
                    "A1PA6795UKMFR9": "Germany",
                    "A1RKKUPIHCS9HS": "Spain",
                    "A13V1IB3VIYZZH": "France",
                    "A1F8U5G5G5EBQO": "Italy",
                    "A1VC38T7YXB528": "Japan",
                    "A1805IZSGTT6HS": "Netherlands",
                    "A2NODRK31TCZ7C": "Sweden",
                    "A1VBF7S9A6C32S": "UAE",
                    "A1C3O6O3B9U9TR": "UK",
                    "A21TJRUUN4KGV": "IN",
                    "A39IBJ97X76CQR": "Australia",
                    "A2Q3Y263D00KWC": "Brazil",
                    "A1X6Q59KS3A307": "Saudi Arabia",
                    "A33AVAJ2PDY3EV": "Turkey"
                };
                return (
                    <div className="store-cell">
                        <span className="country-code">{marketplaceMap[params.value] || params.value}</span>
                    </div>
                );
            }
        },
        {
            headerName: t("Status"),
            field: "status",
            width: 130,
            cellRenderer: (params) => {
                const row = params.data;
                const now = new Date();
                let displayStatus = row.status;
                let cssClass = row.status.toLowerCase();

                if (row.status === "APPROVED") {
                    const start = new Date(row.startDateTime);
                    const end = new Date(row.endDateTime);
                    if (now >= start && now <= end) {
                        displayStatus = t("Running");
                        cssClass = "running";
                    } else if (now < start) {
                        displayStatus = t("Upcoming");
                        cssClass = "upcoming";
                    } else if (now > end) {
                        displayStatus = t("Ended");
                        cssClass = "expired";
                    }
                } else if (row.status === "EXPIRED") {
                    displayStatus = t("Ended");
                    cssClass = "expired";
                } else if (row.status === "CANCELLED") {
                    displayStatus = t("Canceled");
                    cssClass = "cancelled";
                }

                return <span className={`status-badge ${cssClass}`}>{t(displayStatus)}</span>;
            }
        },
        {
            headerName: t("Start Date"),
            field: "startDateTime",
            width: 160,
            sortable: true,
            cellRenderer: (params) => moment(params.value).format("YYYY-MM-DD HH:mm")
        },
        {
            headerName: t("End Date"),
            field: "endDateTime",
            width: 160,
            cellRenderer: (params) => moment(params.value).format("YYYY-MM-DD HH:mm")
        },
        {
            headerName: t("Glance Views"),
            field: "glanceViews",
            width: 130,
            sortable: true,
            cellRenderer: (params) => (params.value || 0).toLocaleString()
        },
        {
            headerName: t("Units Sold"),
            field: "unitsSold",
            width: 120,
            sortable: true,
            cellRenderer: (params) => (params.value || 0).toLocaleString()
        },
        {
            headerName: t("Conv. Rate"),
            field: "conversionRate",
            width: 120,
            sortable: true,
            cellRenderer: (params) => `${params.value || 0}%`
        },
        {
            headerName: t("Sales"),
            field: "revenue",
            width: 140,
            flex: 1,
            sortable: true,
            cellRenderer: (params) => CurrencyCode(params.value || 0, currencyCode || "INR")
        }
    ], [currencyCode, t]);

    const detailCellRenderer = useCallback(
        (params) => (
            <div style={{
                padding: "16px 20px",
                background: isDark ? "rgba(20, 24, 33, 0.5)" : "#f8f9fa",
                borderLeft: "3px solid #1A9FD4",
                borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                borderRight: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                borderRadius: "0 0 12px 12px",
                marginTop: "-1px"
            }}>
                <h6 className="mb-3 font-semibold" style={{ color: isDark ? "rgba(255, 255, 255, 0.7)" : "#6c757d" }}>Products in Deal: {params.data.promotionName}</h6>
                <DealsProductGrid data={params?.data?.includedProducts} />
            </div>
        ),
        [isDark]
    );
    const detailCellRendererParams = { detailGridOptions: {} };

    return (
        <div className="deals-dashboard-container">
            <Filter nameShow={false} dateShow={false} profileShow={true} />

            <div className="middle_container">

                {/* ── GLOBAL FILTERS: Sticky Header ── */}
                <div
                    className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
                    style={{
                        padding: isMobile ? "12px 14px" : "10px 24px",
                        zIndex: 90,
                        position: isMobile ? "relative" : "sticky",
                        top: 0,
                        marginLeft: 0,
                        marginRight: 0,
                        marginTop: "-10px",
                        marginBottom: "20px",
                        width: "100%"
                    }}
                >
                    {/* Grid Container for responsive layout */}
                    <div className="flex flex-wrap items-center gap-[12px] w-full">
                        {/* Search Option */}
                        <div
                            id="deals-search"
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
                                placeholder={t("Search deals, IDs, ASINs...")}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={handleSearch}
                                className="flex-grow w-full h-[40px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none px-0"
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

                        {/* Right-aligned filters group */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: isMobile ? "0" : "auto", justifyContent: isMobile ? "flex-start" : "flex-end", flex: isMobile ? "1 1 100%" : "1 1 auto", width: isMobile ? "100%" : "auto" }}>
                            {/* Date Picker */}
                            <div id="deals-date-picker" style={{ flex: isMobile ? "1 1 100%" : "0 0 240px", width: isMobile ? "100%" : "240px" }}>
                                <DateRangePicker
                                    className="w-full"
                                    style={{ width: "100%", height: "40px" }}
                                    ranges={predefinedRanges}
                                    value={date || []}
                                    placeholder={t("Select Date")}
                                    onChange={handleDateChange}
                                    placement={isMobile ? "bottomStart" : "bottomEnd"}
                                    format="yyyy-MM-dd"
                                    cleanable={true}
                                />
                            </div>

                            {/* Status Dropdown */}
                            <div id="deals-status" style={{ flex: isMobile ? "1 1 100%" : "0 0 150px", width: isMobile ? "100%" : "150px" }}>
                                <Select
                                    value={status === "" || status === undefined ? "__all_status" : status}
                                    onValueChange={(val) => handleStatusChange({ target: { value: val === "__all_status" ? "" : val } })}
                                >
                                    <SelectTrigger className="h-10 text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {statusOptions.map((opt) => (
                                            <SelectItem key={opt.value || "__all_status"} value={opt.value || "__all_status"}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                     </SelectContent>
                                </Select>
                            </div>

                            {/* Type Dropdown */}
                            <div id="deals-type" style={{ flex: isMobile ? "1 1 100%" : "0 0 150px", width: isMobile ? "100%" : "150px" }}>
                                <Select
                                    value={type === "" || type === undefined ? "__all_type" : type}
                                    onValueChange={(val) => setType(val === "__all_type" ? "" : val)}
                                >
                                    <SelectTrigger className="h-10 text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {typeOptions.map((opt) => (
                                            <SelectItem key={opt.value || "__all_type"} value={opt.value || "__all_type"}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="deals-stats" className="deals-stats-row">
                    <div className="stat-card sales">
                        <div className="stat-icon-wrapper">
                            <FiTrendingUp className="stat-icon" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-label">{t("Total Sales")}</div>
                            <div className="stat-value">{CurrencyCode(stats.totalSales, currencyCode || "INR")}</div>
                        </div>
                    </div>
                    <div className="stat-card units">
                        <div className="stat-icon-wrapper">
                            <FiBox className="stat-icon" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-label">{t("Units Sold")}</div>
                            <div className="stat-value">{stats.totalUnits.toLocaleString()}</div>
                        </div>
                    </div>
                    <div className="stat-card views">
                        <div className="stat-icon-wrapper">
                            <FiEye className="stat-icon" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-label">{t("Glance Views")}</div>
                            <div className="stat-value">{stats.totalViews.toLocaleString()}</div>
                        </div>
                    </div>
                    <div className="stat-card conversion">
                        <div className="stat-icon-wrapper">
                            <FiActivity className="stat-icon" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-label">{t("Avg. Conv. Rate")}</div>
                            <div className="stat-value">{stats.conversionRate}%</div>
                        </div>
                    </div>
                </div>

                {/* Glass Grid Container with rounded table */}
                <div className="glass-grid-container overflow-hidden">
                    {/* Grid Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-bottom">
                        <div className="flex items-center gap-2">
                            <h5 className="m-0 font-bold">
                                {t("Deals")}
                            </h5>
                            {totalRecords > 0 && (
                                <span style={{
                                    fontSize: 11, fontWeight: 600,
                                    background: "#E0F4FD", color: "#1A9FD4",
                                    padding: "2px 8px", borderRadius: 20,
                                }}>
                                    {totalRecords} {t("deals")}
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
                    <div id="deals-main-table" className="data_table position-relative" style={{ padding: "0 14px 14px 14px" }}>
                        <AgTable gridRef={gridRef}
                            loading={!isFilterReady || loading}
                            onRefresh={() => loadDeals(true)}
                            columnDefs={columnDefs}
                            rowData={deals}
                            totalRecords={totalRecords}
                            currentPage={pageNo}
                            perPage={perPage}
                            onPageChange={setPageNo}
                            onPerPageChange={setPerPage}
                            onSortChanged={(params) => {
                                const sortModel = params.api.getColumnState().filter(s => s.sort !== null);
                                if (sortModel.length > 0) {
                                    setSortColumn(sortModel[0].colId);
                                    setSortOrder(sortModel[0].sort);
                                }
                            }}
                            masterDetail={true}
                            detailCellRenderer={detailCellRenderer}
                            detailCellRendererParams={detailCellRendererParams}
                            isRowMaster={(row) => Boolean(row?.includedProducts?.length > 0)}
                            getRowHeight={(params) => {
                                // Automatically adjust the height of the expanded accordion row
                                if (params.node && params.node.detail) {
                                    const productsCount = params.data?.includedProducts?.length || 1;
                                    // 40px Header + 50px per product + 80px extra combined frame padding/margins
                                    return (productsCount * 50) + 120;
                                }
                                return undefined; // use standard rowHeight for normal rows
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DealsDashboard;
