import { t } from "i18next";
import React, { useContext, useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";

import Filter from "../../../../helper/filter/Filter";
import Toast from "../../../../common/helper/toast/Toast";
import AgTable from "../../../../common/grid/AgTable";

import { ApiGetAllShippingQueue } from "../../../../api-wrapper/reconciliation-reimbursement/ApiReconciliationReimbursement";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import useSpConnection from "../../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../../common/components/SpAccountNotConnected";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../../helper/permission/PermissionCheck";

import { ShadcnDateRangePicker as DateRangePicker } from "../../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../../common/helper/calendarValues/calendarValues";
import ShipmentDetailsModal from "./ShipmentDetailsModal";
import ReconciliationSettings from "./ReconciliationSettings";
import { FiSettings } from "react-icons/fi";

import { Buffer } from "buffer";
import { useLocation } from "react-router-dom";
import ReconciliationStepsModal from "./ReconciliationStepsModal";
import { MdOutlineClose } from "react-icons/md";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";
import { AppTooltip } from "../../../../components/ui/AppTooltip";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../../../components/ui/select";
const formatDate = (date) => date ? moment(date).format("DD MMM YYYY \n hh:mm A") : "--";

const getStatusCfg = (status, isDark) => {
    const defaultCfg = { label: status || "--", color: isDark ? "rgba(255,255,255,0.6)" : "#6b7280", bg: isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6", dot: isDark ? "rgba(255,255,255,0.4)" : "#9ca3af" };
    const variants = isDark ? {
        WORKING: { label: "Working", color: "rgba(255,255,255,0.6)", bg: "rgba(255,255,255,0.05)", dot: "rgba(255,255,255,0.4)" },
        READY_TO_SHIP: { label: "Ready to Ship", color: "#60a5fa", bg: "rgba(59, 130, 246, 0.15)", dot: "#3b82f6" },
        SHIPPED: { label: "Shipped", color: "#38bdf8", bg: "rgba(6, 182, 212, 0.15)", dot: "#06b6d4" },
        RECEIVING: { label: "Receiving", color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", dot: "#f59e0b" },
        CANCELLED: { label: "Cancelled", color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", dot: "#ef4444" },
        DELETED: { label: "Deleted", color: "rgba(255,255,255,0.6)", bg: "rgba(255,255,255,0.05)", dot: "rgba(255,255,255,0.4)" },
        CLOSED: { label: "Closed", color: "#34d399", bg: "rgba(16, 185, 129, 0.15)", dot: "#22c55e" },
        ERROR: { label: "Error", color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", dot: "#ef4444" },
        IN_TRANSIT: { label: "In Transit", color: "#38bdf8", bg: "rgba(6, 182, 212, 0.15)", dot: "#06b6d4" },
        DELIVERED: { label: "Delivered", color: "#34d399", bg: "rgba(16, 185, 129, 0.15)", dot: "#22c55e" },
        CHECKED_IN: { label: "Checked In", color: "#60a5fa", bg: "rgba(59, 130, 246, 0.15)", dot: "#3b82f6" },
    } : {
        WORKING: { label: "Working", color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" },
        READY_TO_SHIP: { label: "Ready to Ship", color: "#1d4ed8", bg: "#dbeafe", dot: "#3b82f6" },
        SHIPPED: { label: "Shipped", color: "#0e7490", bg: "#cffafe", dot: "#06b6d4" },
        RECEIVING: { label: "Receiving", color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
        CANCELLED: { label: "Cancelled", color: "#991b1b", bg: "#fee2e2", dot: "#ef4444" },
        DELETED: { label: "Deleted", color: "#374151", bg: "#f3f4f6", dot: "#6b7280" },
        CLOSED: { label: "Closed", color: "#14532d", bg: "#dcfce7", dot: "#22c55e" },
        ERROR: { label: "Error", color: "#991b1b", bg: "#fee2e2", dot: "#ef4444" },
        IN_TRANSIT: { label: "In Transit", color: "#0e7490", bg: "#cffafe", dot: "#06b6d4" },
        DELIVERED: { label: "Delivered", color: "#14532d", bg: "#dcfce7", dot: "#22c55e" },
        CHECKED_IN: { label: "Checked In", color: "#1d4ed8", bg: "#dbeafe", dot: "#3b82f6" },
    };
    return variants[status] || defaultCfg;
};

// Portal-based tooltip immune to AG-Grid CSS transform offsets

const CustomHeader = (props) => {
    const { displayName, tooltipText, enableSorting, progressSort } = props;
    const [currentSort, setCurrentSort] = useState(props.column.getSort());

    React.useEffect(() => {
        const onSortChanged = () => {
            setCurrentSort(props.column.getSort());
        };
        props.column.addEventListener('sortChanged', onSortChanged);
        return () => props.column.removeEventListener('sortChanged', onSortChanged);
    }, [props.column]);

    const handleClick = (e) => {
        if (enableSorting) {
            progressSort(e.shiftKey);
        }
    };

    return (
        <div className="flex items-center justify-between w-full" style={{ fontFamily: "Inter", overflow: "hidden" }}>
            <div className="flex items-center"
                onClick={handleClick}
                style={{ gap: 6, cursor: enableSorting ? "pointer" : "default", overflow: "hidden", flex: 1, minWidth: 0 }}
            >
                <span
                    style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#ffffff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontFamily: "Inter"
                    }}
                >
                    {displayName}
                </span>
                {enableSorting && currentSort === 'asc' && (
                    <span style={{ color: "#ffffff", fontSize: 10, flexShrink: 0 }}>▲</span>
                )}
                {enableSorting && currentSort === 'desc' && (
                    <span style={{ color: "#ffffff", fontSize: 10, flexShrink: 0 }}>▼</span>
                )}
            </div>
            {tooltipText && (
                <AppTooltip text={tooltipText}>
                    <i
                        className="fa-solid fa-circle-info ml-1"
                        style={{ fontSize: 13, color: '#fff', cursor: 'help', flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </AppTooltip>
            )}
        </div>
    );
};

function Reconciliation({ isDark }) {

    const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
    const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();
    const location = useLocation();

    const gridRef = useRef(null);

    const [showReconciliationSteps, setShowReconciliationSteps] = useState(false);
    const [reconciliationItem, setReconciliationItem] = useState(null);

    const [loading, setLoading] = useState(false);

    const [rowData, setRowData] = useState([]);

    const [statusOptions] = useState([
        { value: "WORKING", label: "WORKING" },
        { value: "READY_TO_SHIP", label: "READY TO SHIP" },
        { value: "SHIPPED", label: "SHIPPED" },
        { value: "RECEIVING", label: "RECEIVING" },
        { value: "CANCELLED", label: "CANCELLED" },
        { value: "DELETED", label: "DELETED" },
        { value: "CLOSED", label: "CLOSED" },
        { value: "ERROR", label: "ERROR" },
        { value: "IN_TRANSIT", label: "IN TRANSIT" },
        { value: "DELIVERED", label: "DELIVERED" },
        { value: "CHECKED_IN", label: "CHECKED IN" },
    ]);

    const [pagination, setPagination] = useState({ currentPage: 1, perPage: 25, totalRecords: 0 });

    const [sort, setSort] = useState({ sortBy: "shipmentCreatedAt", sortType: "DESC" });

    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedShipmentId, setSelectedShipmentId] = useState("");

    const [showSettings, setShowSettings] = useState(false);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
        }, 350);
        return () => clearTimeout(handler);
    }, [search]);

    const [status, setStatus] = useState("");

    const [date, setDate] = useState(() => {
        if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
            return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
        }
        return [];
    });

    useEffect(() => {
        if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
            setDate([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
        }
    }, [selectedDate]);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    React.useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const lastFetchParamsRef = useRef("");

    const fetchShippingQueue = async ({ page = pagination.currentPage, perPage = pagination.perPage, searchName, sortBy = sort.sortBy, sortType = sort.sortType, isReload = false } = {}) => {
        if (!profileId?.value) return;

        if (isSpLoaded && !isSpConnected) {
            setRowData([]);
            setLoading(false);
            return;
        }

        const payload = {
            pageNo: page,
            perPage,
            fieldName: sortBy,
            sortType,
            profileId: profileId?.value,
            search: searchName ?? debouncedSearch,
            status: status ? [status] : [],
            fromDate: date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : "",
            toDate: date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : "",
        };

        const requestSignature = JSON.stringify(payload);
        if (!isReload && lastFetchParamsRef.current === requestSignature) {
            return;
        }

        lastFetchParamsRef.current = requestSignature;
        setLoading(true);
        try {
            const res = await ApiGetAllShippingQueue(payload);
            if (res?.isSuccess) {
                setRowData(res?.data || []);
                setPagination({ currentPage: res?.currentPageNo || page, perPage, totalRecords: res?.totalRecords || 0 });
            } else {
                Toast.error(res?.message || "Failed to fetch reconciliation");
            }
        } catch (error) {
            Toast.error(error?.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        lastFetchParamsRef.current = "";
    }, [profileId?.value]);

    useEffect(() => {
        if (profileId?.value) {
            fetchShippingQueue();
        }
    }, [profileId?.value, selectedAdType, status, date, debouncedSearch]);

    useEffect(() => {
        const params = new URLSearchParams(location?.search);
        const shipmentIdParam = params.get("search") ?? "";
        if (profileId?.value && shipmentIdParam) {
            const shipmentId = Buffer.from(shipmentIdParam, "base64").toString("utf8");
            setSearch(shipmentId);
            fetchShippingQueue({ searchName: shipmentId });
            setSelectedShipmentId(shipmentId);
            setShowDetailsModal(true);
        }
    }, [profileId?.value, selectedAdType, location.search]);

    useEffect(() => {
        const handleOpenReconciliation = (event) => {
            setReconciliationItem(event.detail);
            setShowReconciliationSteps(true);
        };

        window.addEventListener('openReconciliationModal', handleOpenReconciliation);

        return () => { window.removeEventListener('openReconciliationModal', handleOpenReconciliation) };
    }, []);


    // ── COLUMNS ───────────────────────────────────────────────────────────────────
    const columns = [
        {
            headerName: t("Shipment Name"),
            field: "shipmentName",
            minWidth: 300,
            flex: 1,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <div id={"recon-first-target-" + params.node.rowIndex} className="flex flex-col justify-center py-2" style={{ gap: 4 }}>
                    <span
                        style={{
                            color: "#0066c0",
                            fontWeight: 600,
                            fontSize: 13,
                            lineHeight: "18px",
                            cursor: "pointer",
                        }}
                    >
                        {params?.value || "--"}
                    </span>
                    <span style={{
                        fontSize: 11,
                        color: isDark ? "var(--text-secondary)" : "#9ca3af",
                        fontFamily: "monospace",
                        letterSpacing: "0.02em",
                    }}>
                        {params?.data?.shipmentId || "--"}
                    </span>
                </div>
            ),
        },

        {
            headerName: t("Created"),
            field: "shipmentCreatedAt",
            width: 140,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <div className="flex flex-col justify-center" style={{ gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: isDark ? "var(--text-primary)" : "#374151" }}>
                        {params?.value ? moment(params.value).format("D MMM YYYY") : "--"}
                    </span>
                    <span style={{ fontSize: 11, color: isDark ? "var(--text-secondary)" : "#9ca3af" }}>
                        {params?.value ? moment(params.value).format("hh:mm A") : ""}
                    </span>
                </div>
            ),
        },

        {
            headerName: t("Ship To"),
            field: "destinationFulfillmentCenterId",
            width: 110,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <div className="flex items-center h-full">
                    <span style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: 6,
                        background: isDark ? "rgba(29, 78, 216, 0.15)" : "#eff6ff",
                        color: isDark ? "#60a5fa" : "#1d4ed8",
                        border: isDark ? "1px solid rgba(29, 78, 216, 0.3)" : "none",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                    }}>
                        {params?.value || "--"}
                    </span>
                </div>
            ),
        },

        {
            headerName: t("SKUs"),
            field: "totalSkus",
            width: 80,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <div className="flex items-center justify-center h-full">
                    <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: isDark ? "rgba(255, 255, 255, 0.05)" : "#eff6ff",
                        color: isDark ? "#2374F2" : "#0066c0",
                        border: isDark ? "1px solid var(--glass-border-color)" : "none",
                        fontSize: 13,
                        fontWeight: 700,
                    }}>
                        {params?.value ?? 0}
                    </span>
                </div>
            ),
        },

        {
            headerName: t("Units (Received / Expected)"),
            field: "totalShippedUnits",
            minWidth: 250,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => {
                const status = params?.data?.shipmentStatus;
                const isClosed = status === "CLOSED";

                const expected = params?.value || 0;
                const received = params?.data?.totalReceivedUnits || 0;
                const missing = expected - received;
                const overExtra = received - expected;
                const isOver = received > expected;
                const isMissing = missing > 0;
                const pct = expected > 0 ? Math.min((received / expected) * 100, 100) : 0;

                const barColor = isOver ? "#a78bfa" : pct >= 100 ? "#16a34a" : isMissing ? "#ef4444" : "#f59e0b";

                return (
                    <div className="flex flex-col justify-center py-2" style={{ gap: 5 }}>
                        {/* Numbers row */}
                        <div className="flex items-center" style={{ gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? "var(--text-primary)" : "#111827" }}>
                                {received}
                            </span>
                            <span style={{ fontSize: 11, color: isDark ? "var(--text-secondary)" : "#9ca3af" }}>/ {expected}</span>
                            <span style={{
                                marginLeft: "auto",
                                fontSize: 11,
                                fontWeight: 700,
                                color: barColor,
                            }}>
                                {pct.toFixed(0)}%
                            </span>
                        </div>

                        {/* Progress bar */}
                        <div style={{
                            height: 6,
                            borderRadius: 6,
                            background: isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6",
                            overflow: "hidden",
                        }}>
                            <div style={{
                                height: "100%",
                                width: `${pct}%`,
                                borderRadius: 6,
                                background: barColor,
                                transition: "width 0.3s ease",
                            }} />
                        </div>

                        {/* ✅ Conditional bottom tag */}
                        {isClosed ? (
                            // CLOSED → show missing or over-received
                            <>
                                {isOver && (
                                    <span style={{ fontSize: 10, fontWeight: 600, color: "#a78bfa", letterSpacing: "0.02em" }}>
                                        ↑ {overExtra} {t("over-received")}
                                    </span>
                                )}
                                {isMissing && !isOver && (
                                    <span style={{ fontSize: 10, fontWeight: 600, color: "#ef4444", letterSpacing: "0.02em" }}>
                                        ⚠ {missing} {t("missing")}
                                    </span>
                                )}
                            </>
                        ) : (
                            // Any other status → show In Process ONLY if over or missing
                            <>
                                {isOver && (
                                    <span style={{ fontSize: 10, fontWeight: 600, color: "#a78bfa", letterSpacing: "0.02em" }}>
                                        ↑ {overExtra} {t("over-received")}
                                    </span>
                                )}
                                {isMissing && !isOver && (
                                    <span style={{ fontSize: 10, fontWeight: 600, color: isDark ? "#60a5fa" : "#0369a1", letterSpacing: "0.02em" }}>
                                        ● {t("In Progress")}
                                    </span>
                                )}
                                {!isOver && !isMissing && (
                                    <span style={{ fontSize: 10, fontWeight: 600, color: "#16a34a", letterSpacing: "0.02em" }}>
                                        ✓ {t("Fully Received")}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                );
            },
        },

        {
            headerName: t("Status"),
            field: "shipmentStatus",
            width: 150,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => {
                const cfg = getStatusCfg(params?.value, isDark);
                return (
                    <div className="flex items-center h-full">
                        <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "5px 12px",
                            borderRadius: 20,
                            background: cfg.bg,
                            color: cfg.color,
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            border: isDark ? "1px solid rgba(255,255,255,0.05)" : "none"
                        }}>
                            <span style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: cfg.dot,
                                flexShrink: 0,
                            }} />
                            {cfg.label}
                        </span>
                    </div>
                );
            },
        },

        ...(PermissionCheck(SYSTEM_PAGES.RECONCILIATION_AND_REIMBURSEMENT, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.RECONCILIATION_AND_REIMBURSEMENT, PAGE_ACTIONS.REMOVE) ? [
            {
                headerName: t("Actions"),
                field: "action",
                width: 220,
                sortable: false,
                resizable: false,
                autoHeight: true,
                wrapText: true,
                headerComponent: CustomHeader,
                cellRenderer: (params) => {
                    const totalShipped = params?.data?.totalShippedUnits || 0;
                    const totalReceived = params?.data?.totalReceivedUnits || 0;
                    const missingUnits = totalShipped - totalReceived;
                    const isClosed = params?.data?.shipmentStatus === "CLOSED";

                    return (
                        <div className="flex items-center flex-wrap gap-2 py-2">
                            <Button
                                variant="ghost"
                                className="view-shipment-btn text-primary hover:text-primary hover:bg-primary/10 h-8 px-3 font-semibold"
                                onClick={() => {
                                    setSelectedShipmentId(params?.data?.shipmentId);
                                    setShowDetailsModal(true);
                                }}
                            >
                                View Shipment →
                                {isClosed && missingUnits > 0 && (
                                    <span style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        minWidth: "20px",
                                        height: "18px",
                                        background: "#dc2626",
                                        color: "#fff",
                                        borderRadius: "10px",
                                        fontSize: "11px",
                                        fontWeight: "700",
                                        lineHeight: "1",
                                        padding: "0 4px",
                                    }}>
                                        {missingUnits}
                                    </span>
                                )}
                            </Button>
                        </div>
                    );
                },
            }
        ] : []),
    ];

    return (
        <>
            <Filter name={"Reconciliation"} profileShow={true} dateShow={false} searchShow={false} statusShow={false} />

            <div className="middle_container" style={{ padding: "0 24px 24px 24px" }}>

                <div className="glass-grid-container overflow-hidden mt-4">

                    <div
                        className="data_model_btn camapgin_btn flex-wrap flex items-center justify-between gap-3"
                        style={{ padding: isMobile ? "10px 16px" : "12px 24px" }}
                    >

                        <div>
                            <h5 className="m-0 font-bold" style={{ color: isDark ? "var(--text-primary)" : "#1e293b", fontSize: 15 }}>
                                {t("Reconciliation")}
                            </h5>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-start xl:justify-end">

                            <div
                                id="recon-search"
                                className="search_option m-0 flex items-center relative w-full sm:w-auto sm:min-w-[320px]"
                                style={{ height: "36px" }}
                            >
                                <Input
                                    type="text"
                                    placeholder={t("Search Here")}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="flex-grow w-full h-[36px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none px-0"
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

                            {/* Status Single Select */}
                            <div id="recon-status" className="w-full sm:w-auto" style={{ height: 36, display: "flex", alignItems: "center" }}>
                                <Select value={status} onValueChange={(val) => setStatus(val === "all" ? "" : val)}>
                                    <SelectTrigger className="w-full sm:w-[200px] h-[36px]">
                                        <SelectValue placeholder={t("Select Status")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Statuses</SelectItem>
                                        {statusOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Date Range */}
                            <div id="recon-date-picker" className="w-[calc(100%-48px)] sm:w-auto flex items-center" style={{ height: 36 }}>
                                <DateRangePicker
                                    className="w-full sm:w-[240px]"
                                    ranges={predefinedRanges}
                                    value={date}
                                    placeholder={t("Select Date")}
                                    onChange={(val) => setDate(val)}
                                    placement="bottomEnd"
                                    format="yyyy-MM-dd"
                                    cleanable={true}
                                    style={{ height: 36 }}
                                    align="end"
                                />
                            </div>

                            {/* Settings */}
                            <Button
                                variant="outline"
                                id="recon-settings"
                                className="w-9 h-9 p-0 flex-shrink-0 transition-all duration-150"
                                style={{
                                    background: isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9",
                                    borderColor: isDark ? "var(--glass-border-color)" : "#cbd5e1",
                                    color: isDark ? "#2374F2" : "#64748b",
                                    borderRadius: 7,
                                }}
                                onClick={() => setShowSettings(true)}
                                title={t("Settings")}
                            >
                                <FiSettings size={18} />
                            </Button>

                        </div>
                    </div>

                    {!isSpConnected && isSpLoaded ? (
                        <div style={{ padding: "0 24px 24px 24px" }}>
                            <SpAccountNotConnected feature={t("Reconciliation")} isDark={isDark} />
                        </div>
                    ) : (
                        <div className="data_table position-relative" style={{ padding: "0 24px 24px 24px" }}>
                            <AgTable ref={gridRef}
                                tableId="reconciliation-table"
                                height={"55vh"}
                                loading={loading}
                                onRefresh={() => fetchShippingQueue({ isReload: true })}
                                rowData={rowData}
                                columnDefs={columns}
                                totalRecords={pagination.totalRecords}
                                perPage={pagination.perPage}
                                currentPage={pagination.currentPage}
                                onPageChange={(page) => fetchShippingQueue({ page })}
                                onPerPageChange={(perPage) => fetchShippingQueue({ page: 1, perPage })}
                                onSortChanged={(e) => {
                                    const sortModel = e.columns;
                                    if (!sortModel || sortModel.length === 0) return;
                                    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];

                                    setSort({ sortBy: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }) });
                                    fetchShippingQueue({ sortBy: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), isReload: true });
                                }}
                            />
                        </div>
                    )}

                </div>

                <ShipmentDetailsModal
                    show={showDetailsModal}
                    handleClose={() => setShowDetailsModal(false)}
                    shipmentId={selectedShipmentId}
                    profileId={profileId?.value}
                    isDark={isDark}
                />

                <ReconciliationSettings
                    show={showSettings}
                    handleClose={() => setShowSettings(false)}
                    profileId={profileId?.value}
                    isDark={isDark}
                />

                <ReconciliationStepsModal
                    show={showReconciliationSteps}
                    handleClose={() => setShowReconciliationSteps(false)}
                    shipmentData={reconciliationItem}
                    isDark={isDark}
                />

            </div>
        </>
    );
}

export default Reconciliation;