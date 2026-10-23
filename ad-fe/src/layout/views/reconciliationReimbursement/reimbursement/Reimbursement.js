import { t } from "i18next";
import React, { useContext, useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReactDOM from "react-dom";

import moment from "moment";

import Filter from "../../../../helper/filter/Filter";
import Toast from "../../../../common/helper/toast/Toast";
import AgTable from "../../../../common/grid/AgTable";

import { ApiGetReimbursement } from "../../../../api-wrapper/reconciliation-reimbursement/ApiReconciliationReimbursement";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import useSpConnection from "../../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../../common/components/SpAccountNotConnected";

import { ShadcnDateRangePicker as DateRangePicker } from "../../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../../common/helper/calendarValues/calendarValues";
import { MdOutlineClose } from "react-icons/md";
import { Input } from "../../../../components/ui/input";
import { AppTooltip } from "../../../../components/ui/AppTooltip";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../../../components/ui/select";

const formatDate = (date) => date ? moment(date).format("DD/MM/YYYY hh:mm:ss A") : "--";

const formatCurrency = (amount, currency = "INR") => {
    if (!amount && amount !== 0) return "--";
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
};

const getStatusCfg = (status, isDark) => {
    const defaultCfg = { label: status || "--", color: isDark ? "rgba(255,255,255,0.6)" : "#6b7280", bg: isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6", dot: isDark ? "rgba(255,255,255,0.4)" : "#9ca3af" };
    const variants = isDark ? {
        REIMBURSED: { label: "Reimbursed", color: "#34d399", bg: "rgba(16, 185, 129, 0.15)", dot: "#22c55e" },
        APPROVED: { label: "Approved", color: "#34d399", bg: "rgba(16, 185, 129, 0.15)", dot: "#22c55e" },
        PENDING: { label: "Pending", color: "#fbbf24", bg: "rgba(245, 158, 11, 0.15)", dot: "#f59e0b" },
        PROCESSING: { label: "Processing", color: "#60a5fa", bg: "rgba(59, 130, 246, 0.15)", dot: "#3b82f6" },
        REJECTED: { label: "Rejected", color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", dot: "#ef4444" },
    } : {
        REIMBURSED: { label: "Reimbursed", color: "#14532d", bg: "#dcfce7", dot: "#22c55e" },
        APPROVED: { label: "Approved", color: "#14532d", bg: "#dcfce7", dot: "#22c55e" },
        PENDING: { label: "Pending", color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
        PROCESSING: { label: "Processing", color: "#1d4ed8", bg: "#dbeafe", dot: "#3b82f6" },
        REJECTED: { label: "Rejected", color: "#991b1b", bg: "#fee2e2", dot: "#ef4444" },
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

function Reimbursement({ isDark }) {
    const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
    const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();

    const gridRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [rowData, setRowData] = useState([]);

    const [reasonOptions, setReasonOptions] = useState([]);

    const [pagination, setPagination] = useState({ currentPage: 1, perPage: 10, totalRecords: 0 });
    const [sort, setSort] = useState({ sortBy: "approvalDate", sortType: -1 });

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
        }, 350);
        return () => clearTimeout(handler);
    }, [search]);

    const [reason, setReason] = useState("");
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

    const fetchReimbursement = async ({ page = pagination.currentPage, perPage = pagination.perPage, sortBy = sort.sortBy, sortType = sort.sortType, isReload = false } = {}) => {
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
            search: debouncedSearch,
            status: reason ? [reason] : [],
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
            const res = await ApiGetReimbursement(payload);
            if (res?.isSuccess) {
                setRowData(res?.data || []);
                setReasonOptions((res?.reasonList || []).map((item) => ({ value: item, label: item.replaceAll("_", " ") })));
                setPagination({ currentPage: res?.currentPage || page, perPage: res?.perPage || perPage, totalRecords: res?.totalRecords || 0 });
            } else {
                Toast.error(res?.message || "Failed to fetch reimbursements");
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
            fetchReimbursement();
        }
    }, [profileId?.value, selectedAdType, reason, date, debouncedSearch]);

    const columns = [
        {
            headerName: t("Reimbursement ID"),
            field: "reimbursementId",
            minWidth: 180,
            sortable: true,
            resizable: true,
            pinned: "left",
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <span className="font-bold" style={{ color: isDark ? "rgba(255, 255, 255, 0.9)" : "inherit" }}>
                    {params?.value || "--"}
                </span>
            ),
        },
        {
            headerName: t("Product"),
            field: "productName",
            minWidth: 350,
            sortable: true,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <div className="flex items-center gap-2 py-1">
                    <img
                        src={params?.data?.productData?.imageURL}
                        alt="product"
                        style={{
                            width: 45,
                            height: 45,
                            objectFit: "contain",
                            borderRadius: 6,
                            border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #eee",
                            background: isDark ? "rgba(255, 255, 255, 0.05)" : "#fff",
                            padding: 2
                        }}
                    />

                    <div className="flex flex-col">
                        <span className="font-semibold" style={{ color: isDark ? "rgba(255, 255, 255, 0.9)" : "inherit" }}>
                            {params?.value || "--"}
                        </span>

                        <small style={{ color: isDark ? "rgba(255, 255, 255, 0.5)" : "#6c757d" }}>
                            {params?.data?.sku || "--"}
                        </small>
                    </div>
                </div>
            ),
        },
        {
            headerName: t("ASIN"),
            field: "asin",
            minWidth: 150,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
        },
        {
            headerName: t("FNSKU"),
            field: "fnsku",
            minWidth: 150,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
        },
        {
            headerName: t("Amazon Order ID"),
            field: "amazonOrderId",
            minWidth: 220,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => params?.value || "--",
        },
        {
            headerName: t("Reimbursement Type"),
            field: "reimbursementType",
            minWidth: 220,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9",
                    color: isDark ? "rgba(255, 255, 255, 0.7)" : "#475569",
                    fontSize: 11,
                    fontWeight: 600,
                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0"
                }}>
                    {params?.value || "--"}
                </span>
            ),
        },
        {
            headerName: t("Reason"),
            field: "reason",
            minWidth: 220,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <span className="text-capitalize">
                    {(params?.value || "--").replaceAll("_", " ")}
                </span>
            ),
        },
        {
            headerName: t("Status"),
            field: "reimbursementStatus",
            minWidth: 150,
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
        {
            headerName: t("Qty Reimbursed"),
            field: "quantityReimbursedTotal",
            minWidth: 150,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <span className="font-bold">
                    {params?.value || 0}
                </span>
            ),
        },
        {
            headerName: t("Amount / Unit"),
            field: "amountPerUnit",
            minWidth: 160,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <span className="font-semibold">
                    {formatCurrency(params?.value, params?.data?.currencyUnit)}
                </span>
            ),
        },
        {
            headerName: t("Total Amount"),
            field: "amountTotal",
            minWidth: 170,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => (
                <span style={{ fontWeight: "bold", color: "#16a34a" }}>
                    {formatCurrency(params?.value, params?.data?.currencyUnit)}
                </span>
            ),
        },
        {
            headerName: t("Currency"),
            field: "currencyUnit",
            minWidth: 120,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
        },
        {
            headerName: t("Condition"),
            field: "condition",
            minWidth: 140,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
        },
        {
            headerName: t("Approval Date"),
            field: "approvalDate",
            minWidth: 190,
            sortable: true,
            resizable: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => formatDate(params?.value),
        },
    ];

    return (
        <>
            <Filter name={"Reimbursement"} profileShow={true} dateShow={false} searchShow={false} statusShow={false} />

            <div className="middle_container" style={{ padding: "0 24px 24px 24px" }}>

                <div className="glass-grid-container overflow-hidden mt-4">

                    <div
                        className="data_model_btn camapgin_btn flex-wrap flex items-center justify-between gap-3"
                        style={{ padding: isMobile ? "10px 16px" : "12px 24px" }}
                    >

                        <div>
                            <h5 className="m-0 font-bold" style={{ color: isDark ? "var(--text-primary)" : "#1e293b", fontSize: 15 }}>
                                {t("Reimbursement")}
                            </h5>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-start xl:justify-end">

                            {/* Search */}

                            <div
                                id="reimbursement-search"
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

                            {/* Reason Single Select */}

                            <div id="reimbursement-reason" className="w-full sm:w-auto" style={{ height: "36px", display: "flex", alignItems: "center" }}>
                                <Select value={reason} onValueChange={(val) => setReason(val === "all" ? "" : val)}>
                                    <SelectTrigger className="w-full sm:w-[260px] h-[36px]">
                                        <SelectValue placeholder={t("Select Reason")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t("All Reasons")}</SelectItem>
                                        {reasonOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {t(opt.label)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Date Range */}

                            <div id="reimbursement-date-picker" className="w-full sm:w-auto flex items-center" style={{ height: 36 }}>
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

                        </div>
                    </div>

                    {!isSpConnected && isSpLoaded ? (
                        <div style={{ padding: "0 24px 24px 24px" }}>
                            <SpAccountNotConnected feature={t("Reimbursement")} isDark={isDark} />
                        </div>
                    ) : (
                        <div className="data_table position-relative" style={{ padding: "0 24px 24px 24px" }}>
                            <AgTable ref={gridRef}
                                tableId="reimbursement-table"
                                height={"55vh"}
                                loading={loading}
                                onRefresh={() => fetchReimbursement({ isReload: true })}
                                rowData={rowData}
                                columnDefs={columns}
                                totalRecords={pagination.totalRecords}
                                perPage={pagination.perPage}
                                currentPage={pagination.currentPage}
                                onPageChange={(page) => fetchReimbursement({ page })}
                                onPerPageChange={(perPage) => fetchReimbursement({ page: 1, perPage })}
                                onSortChanged={(e) => {
                                    const sortModel = e.columns;
                                    if (!sortModel || sortModel.length === 0) return;
                                    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];

                                    setSort({ sortBy: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }) });
                                    fetchReimbursement({ sortBy: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), isReload: true });
                                }}
                                isCustomSaveColumns={true}
                                customSaveColumnName={"Reimbursement"}
                                handleSaveColumns={undefined}
                            />
                        </div>
                    )}

                </div>

            </div>
        </>
    );
}

export default Reimbursement;