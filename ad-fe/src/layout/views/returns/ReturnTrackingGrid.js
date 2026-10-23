import React, { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from "react-i18next";
import AgTable from "../../../common/grid/AgTable";
import moment from "moment";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";


const getColors = (isDark) => ({
    primary: "#1A9FD4",
    primary50: isDark ? "rgba(26, 159, 212, 0.15)" : "#E0F4FD",
    neutral100: isDark ? "rgba(255, 255, 255, 0.05)" : "#F1F5F9",
    neutral200: isDark ? "rgba(255, 255, 255, 0.08)" : "#E2E8F0",
    neutral400: isDark ? "rgba(255, 255, 255, 0.4)" : "#94A3B8",
    neutral600: isDark ? "rgba(255, 255, 255, 0.6)" : "#475569",
    neutral800: isDark ? "rgba(255, 255, 255, 0.9)" : "#1E293B",
    danger: "#E74C3C",
    warning: "#F59E0B",
    success: "#16A34A",
    info: "#0EA5E9",
});

const SOURCE_CONFIG = {
    FBA: {
        label: "FBA",
        fullLabel: "Fulfillment by Amazon",
        badgeClass: "rt-badge-info",
        icon: "fa-warehouse",
    },
    MFN: {
        label: "MFN",
        fullLabel: "Merchant Fulfilled",
        badgeClass: "rt-badge-warning",
        icon: "fa-store",
    },
};

// Custom sortable header (same pattern as FbaPlanningGrid)
const CustomHeader = (props) => {
    const { displayName, tooltipText, enableSorting, progressSort } = props;
    const [currentSort, setCurrentSort] = React.useState(props.column.getSort());

    React.useEffect(() => {
        const onSortChanged = () => setCurrentSort(props.column.getSort());
        props.column.addEventListener('sortChanged', onSortChanged);
        return () => props.column.removeEventListener('sortChanged', onSortChanged);
    }, [props.column]);

    const handleClick = (e) => {
        if (enableSorting) progressSort(e.shiftKey);
    };

    return (
        <div className="flex items-center gap-1" style={{ cursor: 'pointer' }} onClick={handleClick}>
            <span className="ag-header-cell-text">{displayName}</span>
            {currentSort === 'asc' && <i className="fa-solid fa-arrow-up ml-1" style={{ fontSize: 11, color: '#fff' }} />}
            {currentSort === 'desc' && <i className="fa-solid fa-arrow-down ml-1" style={{ fontSize: 11, color: '#fff' }} />}
            {tooltipText && (
                <AppTooltip text={<div style={{ fontSize: 12, padding: '4px' }}>{tooltipText}</div>} placement="top" arrow>
                    <i
                        className="fa-solid fa-circle-info ml-1"
                        style={{ fontSize: 13, color: '#fff', cursor: 'help' }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </AppTooltip>
            )}
        </div>
    );
};

// Shared badge renderer
const YesNoBadge = ({ value }) => {
    const isYes = value === true || value === "true";
    return (
        <div className="flex items-center h-full">
            <span className={`rt-grid-badge ${isYes ? 'rt-badge-success' : 'rt-badge-danger'}`}>
                <i className={`fa-solid ${isYes ? 'fa-check' : 'fa-xmark'}`} style={{ fontSize: 9 }} />
                {isYes ? 'Yes' : 'No'}
            </span>
        </div>
    );
};

// Return Source badge cell
const ReturnSourceBadge = ({ value, P }) => {
    if (!value) return <div className="flex items-center h-full" style={{ color: P.neutral400, fontSize: 12 }}>—</div>;
    const cfg = SOURCE_CONFIG[value];

    if (!cfg) {
        // Fallback for unknown source values
        return (
            <div className="flex items-center h-full">
                <span className="rt-grid-badge rt-badge-neutral">
                    <i className="fa-solid fa-box" style={{ fontSize: 10 }} />
                    {value}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center h-full">
            <AppTooltip
                text={<div style={{ fontSize: 12, padding: '4px' }}>{cfg.fullLabel}</div>}
                placement="top"
                arrow
            >
                <span className={`rt-grid-badge ${cfg.badgeClass}`}>
                    <i className={`fa-solid ${cfg.icon}`} style={{ fontSize: 10 }} />
                    {cfg.label}
                </span>
            </AppTooltip>
        </div>
    );
};

const ReturnTrackingGrid = forwardRef(({
    rowData,
    totalRecords,
    loading,
    currentPage,
    rowsPerPage,
    onPageChange,
    onPerPageChange,
    onSortChanged,
    onRefresh,
    isDark,
    onExport,
}, ref) => {
    const { t } = useTranslation();
    const gridRef = useRef(null);
    const P = getColors(isDark);

    const columns = useMemo(() => [
        // 1. Product Details
        {
            headerName: t("Product Details"),
            field: "productName",
            title: "Product Details",
            minWidth: 380,
            flex: 2,
            pinned: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div id={"returns-first-target-" + params.node.rowIndex} className="flex items-center py-2 h-full">
                        <div
                            className="rounded border flex items-center justify-center overflow-hidden mr-3"
                            style={{
                                width: 54, minWidth: 54, height: 54,
                                background: isDark ? "rgba(255,255,255,0.05)" : '#fff',
                                border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e2e8f0"
                            }}
                        >
                            {row.productImage ? (
                                <img
                                    src={row.productImage}
                                    alt="product"
                                    style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                                />
                            ) : (
                                <i className="fa-regular fa-image text-gray-500" style={{ fontSize: 20 }} />
                            )}
                        </div>
                        <div className="flex flex-col" style={{ minWidth: 0, lineHeight: '1.4' }}>
                            <span
                                className="font-bold mb-1"
                                style={{ fontSize: 12, color: P.neutral800, whiteSpace: 'normal', wordBreak: 'break-word' }}
                                title={row.productName}
                            >
                                {row.productName}
                            </span>
                            <div
                                className="flex flex-wrap"
                                style={{ fontSize: 11, color: P.neutral600, columnGap: '16px', rowGap: '2px' }}
                            >
                                <span><strong style={{ color: P.neutral400 }}>ASIN:</strong> {row.asin}</span>
                                <span><strong style={{ color: P.neutral400 }}>SKU:</strong> {row.sku}</span>
                            </div>
                        </div>
                    </div>
                );
            }
        },

        // ── 2. Return Source  (NEW — sits right after Product Details) ──────────
        {
            headerName: t("Source"),
            field: "returnSource",
            title: "Source",
            width: 120,
            headerComponent: CustomHeader,
            headerComponentParams: {
                tooltipText: t("Whether the order was fulfilled by Amazon (FBA) or by the Merchant (MFN)."),
            },
            cellRenderer: (params) => <ReturnSourceBadge value={params.value} P={P} />,
        },

        // ── 3. Return Reason ────────────────────────────────────────────────────
        {
            headerName: t("Return Reason"),
            field: "returnReasonCode",
            title: "Return Reason",
            width: 175,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="flex flex-col justify-center h-full" style={{ gap: 4 }}>
                        <span style={{
                            fontSize: 11, fontWeight: 700, color: P.neutral800,
                            background: P.neutral100, borderRadius: 5,
                            padding: '3px 7px', display: 'inline-block', maxWidth: '100%',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            border: isDark ? "1px solid rgba(255,255,255,0.05)" : "none"
                        }} title={row.returnReasonCode}>
                            {row.returnReasonCode || '—'}
                        </span>
                        <span style={{ fontSize: 10, color: P.neutral400 }}>
                            {row.returnType || '—'}
                        </span>
                    </div>
                );
            },
        },

        // ── 4. Return Status ────────────────────────────────────────────────────
        {
            headerName: t("Status"),
            field: "returnRequestStatus",
            title: "Status",
            width: 130,
            cellRenderer: (params) => {
                const status = params.value;
                if (!status) return null;
                let badgeClass = 'rt-badge-neutral', icon = 'fa-circle-dot';
                if (status === 'Approved') { badgeClass = 'rt-badge-success'; icon = 'fa-circle-check'; }
                else if (status === 'Rejected') { badgeClass = 'rt-badge-danger'; icon = 'fa-circle-xmark'; }
                else if (status === 'Pending') { badgeClass = 'rt-badge-warning'; icon = 'fa-clock'; }
                return (
                    <div className="flex items-center h-full">
                        <span className={`rt-grid-badge ${badgeClass}`}>
                            <i className={`fa-solid ${icon}`} style={{ fontSize: 10 }} />
                            {status}
                        </span>
                    </div>
                );
            },
        },

        // ── 5. In Policy ────────────────────────────────────────────────────────
        {
            headerName: t("In Policy"),
            field: "inPolicy",
            title: "In Policy",
            width: 105,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Whether this return falls within Amazon's return policy window (7 Days).") },
            cellRenderer: (params) => <YesNoBadge value={params.value} />,
        },

        // ── 6. Is Prime ─────────────────────────────────────────────────────────
        {
            headerName: t("Prime"),
            field: "isPrime",
            title: "Prime",
            width: 95,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Whether the original order was a Prime order.") },
            cellRenderer: (params) => <YesNoBadge value={params.value} />,
        },

        // ── 7. Order ID ─────────────────────────────────────────────────────────
        {
            headerName: t("Order ID"),
            field: "orderId",
            title: "Order ID",
            width: 185,
            cellRenderer: (params) => (
                <div className="flex items-center h-full">
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: P.primary, fontWeight: 600, letterSpacing: '0.3px' }}>
                        {params.value || '—'}
                    </span>
                </div>
            ),
        },

        // ── 8. Order Date ───────────────────────────────────────────────────────
        {
            headerName: t("Order Date"),
            field: "orderDate",
            title: "Order Date",
            width: 130,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Date when the original order was placed.") },
            cellRenderer: (params) => (
                <div className="flex flex-col justify-center h-full">
                    <span style={{ fontSize: 12, fontWeight: 600, color: P.neutral800 }}>
                        {params.value ? moment(params.value).format("DD MMM YYYY") : '—'}
                    </span>
                    <span style={{ fontSize: 10, color: P.neutral400 }}>
                        {params.value ? moment(params.value).format("hh:mm A") : ''}
                    </span>
                </div>
            ),
        },

        // ── 9. Return Request Date ──────────────────────────────────────────────
        {
            headerName: t("Return Request"),
            field: "returnRequestDate",
            title: "Return Request",
            width: 140,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Date when the return was requested by the customer.") },
            cellRenderer: (params) => (
                <div className="flex flex-col justify-center h-full">
                    <span style={{ fontSize: 12, fontWeight: 600, color: P.neutral800 }}>
                        {params.value ? moment(params.value).format("DD MMM YYYY") : '—'}
                    </span>
                    <span style={{ fontSize: 10, color: P.neutral400 }}>
                        {params.value ? moment(params.value).format("hh:mm A") : ''}
                    </span>
                </div>
            ),
        },

        // ── 10. Return Delivery Date ────────────────────────────────────────────
        {
            headerName: t("Return Delivery"),
            field: "returnDeliveryDate",
            title: "Return Delivery",
            width: 140,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Date when the returned item was delivered back to the warehouse.") },
            cellRenderer: (params) => (
                <div className="flex flex-col justify-center h-full">
                    <span style={{ fontSize: 12, fontWeight: 600, color: params.value ? P.neutral800 : P.neutral400 }}>
                        {params.value ? moment(params.value).format("DD MMM YYYY") : '—'}
                    </span>
                    <span style={{ fontSize: 10, color: P.neutral400 }}>
                        {params.value ? moment(params.value).format("hh:mm A") : ''}
                    </span>
                </div>
            ),
        },

        // ── 11. Order Qty + Amount ──────────────────────────────────────────────
        {
            headerName: t("Order"),
            field: "orderAmount",
            title: "Order",
            width: 130,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Original order quantity and total order amount.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="flex flex-col justify-center h-full">
                        <div className="font-bold" style={{ fontSize: 14, color: P.neutral800 }}>
                            {CurrencyCode(row.orderAmount || 0)}
                        </div>
                        <div style={{ fontSize: 10, color: P.neutral400 }}>Qty: {row.orderQuantity || 0}</div>
                    </div>
                );
            },
        },

        // ── 12. Return Qty + Refund Amount ──────────────────────────────────────
        {
            headerName: t("Refund"),
            field: "refundAmount",
            title: "Refund",
            width: 130,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Number of units returned and total refund issued to the customer.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const refund = row.refundAmount || 0;
                return (
                    <div className="flex flex-col justify-center h-full">
                        <div className="font-bold" style={{ fontSize: 14, color: refund > 0 ? P.danger : P.neutral400 }}>
                            {CurrencyCode(refund)}
                        </div>
                        <div style={{ fontSize: 10, color: P.neutral400 }}>Qty: {row.returnQuantity || 0}</div>
                    </div>
                );
            },
        },

    ], [t, P, isDark]);

    useImperativeHandle(ref, () => ({
        getColumns: () => columns
    }));

    return (
        <div className="glass-grid-container overflow-hidden" style={{ marginTop: "24px" }}>

            {/* Grid Header */}
            <div
                className="data_model_btn camapgin_btn flex flex-col md:flex-row md:items-center justify-between gap-3"
                style={{ padding: "12px 24px", width: "100%" }}
            >
                <div className="flex items-center gap-2">
                    <h5 className="m-0 font-bold" style={{ color: P.neutral800 }}>{t("Return Details")}</h5>
                </div>

                {/* Export Button */}
                <div style={{ flex: "0 0 auto" }}>
                    <AppTooltip text={t("Export to Excel")} arrow placement="top">
                        <button
                            onClick={onExport}
                            className="customize-button m-0"
                            style={{ height: "36px", whiteSpace: "nowrap" }}
                        >
                            {t("Export")}
                        </button>
                    </AppTooltip>
                </div>
            </div>

            <div className="data_table position-relative" style={{ padding: "0 24px 24px 24px" }}>
                <AgTable
                    ref={gridRef}
                    onRefresh={onRefresh}
                    tableId="return-tracking-grid"
                    height="500px"
                    rowHeight={70}
                    rowData={rowData}
                    columnDefs={columns}
                    totalRecords={totalRecords}
                    perPage={rowsPerPage}
                    currentPage={currentPage}
                    onPageChange={onPageChange}
                    onPerPageChange={onPerPageChange}
                    onSortChanged={onSortChanged}
                    loading={loading}
                    isCustomSaveColumns={true}
                    customSaveColumnName="Return Tracking Grid"
                />
            </div>
        </div>
    );
});

export default ReturnTrackingGrid;