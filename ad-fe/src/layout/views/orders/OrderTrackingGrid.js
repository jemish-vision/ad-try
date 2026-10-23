import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import AgTable from "../../../common/grid/AgTable";
import OrderDetailModal from "./OrderDetailsModel";
import { Info as InfoIcon, ArrowUp as ArrowUpwardIcon, ArrowDown as ArrowDownwardIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { CardTitle } from "../../../components/ui/card";
import { exportGridToExcel } from "../../../utility/exportExcel";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";


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

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ value, isRefunded }) => {
    const { t } = useTranslation();
    if (!value) return <span style={{ color: P.neutral400 }}>—</span>;
    const cfg = {
        PENDING_AVAILABILITY: { icon: "fa-hourglass-start", label: t("Pending Availability") },
        PENDING: { icon: "fa-clock", label: t("Pending") },
        UNSHIPPED: { icon: "fa-box", label: t("Unshipped") },
        PARTIALLY_SHIPPED: { icon: "fa-truck-fast", label: t("Partially Shipped") },
        SHIPPED: { icon: "fa-truck", label: t("Payment Complete") },
        CANCELLED: { icon: "fa-circle-xmark", label: t("Cancelled") },
        UNFULFILLABLE: { icon: "fa-triangle-exclamation", label: t("Unfulfillable") },
    }[value] ?? { icon: "fa-circle-dot", label: t(value) };

    const statusClass = value.toLowerCase().replace(/_/g, "-");

    return (
        <div className="flex items-center justify-center h-full flex-wrap" style={{ gap: 5, width: "100%" }}>
            <span className={`order-status-badge status-${statusClass}`}>
                <i className={`fa-solid ${cfg.icon}`} style={{ fontSize: 10 }} />
                {cfg.label}
            </span>

            {/* Refunded tag */}
            {isRefunded && (
                <span className="order-refund-badge">
                    <i className="fa-solid fa-rotate-left" style={{ fontSize: 10 }} />
                    {t("Refund applied")}
                </span>
            )}
        </div>
    );
};

// ─── Payment badge ────────────────────────────────────────────────────────────
const PaymentBadge = ({ value }) => {
    const { t } = useTranslation();
    const isCOD = value === "CashOnDelivery";
    return (
        <span className={`order-payment-badge ${isCOD ? "payment-cod" : "payment-prepaid"}`}>
            <i className={`fa-solid ${isCOD ? "fa-money-bill-wave" : "fa-credit-card"}`} style={{ fontSize: 9 }} />
            {isCOD ? t("COD") : t("Prepaid")}
        </span>
    );
};

// ─── Fulfilment badge ─────────────────────────────────────────────────────────
const FulfilmentBadge = ({ value }) => {
    const isAmazon = value === "AMAZON";
    return (
        <span className={`order-fulfilment-badge ${isAmazon ? "fulfilment-fba" : "fulfilment-mfn"}`}>
            <i className={`fa-solid ${isAmazon ? "fa-warehouse" : "fa-store"}`} style={{ fontSize: 9 }} />
            {isAmazon ? "FBA" : "MFN"}
        </span>
    );
};

// ─── Custom sortable header ───────────────────────────────────────────────────
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
            {currentSort === "asc" && <ArrowUpwardIcon style={{ fontSize: 14, color: "#fff", marginLeft: 4 }} />}
            {currentSort === "desc" && <ArrowDownwardIcon style={{ fontSize: 14, color: "#fff", marginLeft: 4 }} />}
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

// ─── Multi-item product cell ──────────────────────────────────────────────────
const ProductItemsCell = ({ items = [] }) => {
    const { t } = useTranslation();
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (!items.length) return <span style={{ color: P.neutral400 }}>—</span>;

    return (
        <div className="flex flex-col" style={{ gap: 10, padding: "8px 0" }}>
            {items.map((item, idx) => {
                const pd = item.productData ?? {};
                const img = pd.imageURL || null;
                const title = pd.itemName || item.product?.title || "—";
                const asin = pd.asin || item.product?.asin || "—";
                const sku = pd.sku || item.product?.sellerSku || "—";
                const qty = item.quantityOrdered ?? 0;
                const price = item.product?.price ?? pd.sellingPrice ?? 0;
                const subtotal = qty * price;

                return (
                    <div
                        key={item.orderItemId || idx}
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            paddingBottom: idx < items.length - 1 ? 10 : 0,
                            borderBottom: idx < items.length - 1 ? `1px dashed ${isDark ? "rgba(255,255,255,0.08)" : P.neutral200}` : "none",
                        }}
                    >
                        {/* Thumbnail */}
                        <div className="product-img-wrapper" style={{
                            width: 52, minWidth: 52, height: 52,
                            flexShrink: 0,
                        }}>
                            {img
                                ? <img src={img} alt="product" style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }} />
                                : <i className="fa-regular fa-image" style={{ fontSize: 18, color: P.neutral400 }} />
                            }
                        </div>

                        {/* Details */}
                        <div className="flex flex-col" style={{ gap: 3, minWidth: 0 }}>
                            {/* Title */}
                            <span style={{
                                fontSize: 12, fontWeight: 600, color: isDark ? "#cbd5e1" : P.neutral800,
                                whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.4,
                            }}>
                                {title}
                            </span>

                            {/* ASIN + SKU */}
                            <div className="flex flex-wrap" style={{ gap: 12, fontSize: 11, color: isDark ? "#94a3b8" : P.neutral600 }}>
                                <span><strong style={{ color: P.neutral400 }}>ASIN:</strong> {asin}</span>
                                <span><strong style={{ color: P.neutral400 }}>SKU:</strong>  {sku}</span>
                            </div>

                            {/* Qty · Subtotal · Item ID */}
                            <div style={{
                                display: "flex", gap: 8, flexWrap: "wrap",
                                marginTop: 2,
                            }}>
                                <span className="product-qty-badge">
                                    <i className="fa-solid fa-cubes" style={{ fontSize: 9 }} />
                                    {t("Qty")}: {qty}
                                </span>
                                <span className="product-subtotal-badge">
                                    <i className="fa-solid fa-indian-rupee-sign" style={{ fontSize: 9 }} />
                                    {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="product-itemid-badge">
                                    <i className="fa-solid fa-hashtag" style={{ fontSize: 9 }} />
                                    {item.orderItemId || "—"}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export const OrdersGrid = forwardRef(({
    rowData, totalRecords, loading,
    currentPage, rowsPerPage,
    onPageChange, onPerPageChange, onSortChanged, onRefresh,
}, ref) => {
    const { t } = useTranslation();
    const gridRef = useRef(null);

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    useEffect(() => {
        const handleTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handleTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showModal, setShowModal] = useState(false);

    const handleOrderClick = (order) => {
        setSelectedOrder(order);
        setShowModal(true);
    };

    const handleExport = () => {
        setTimeout(() => {
            try {
                exportGridToExcel(rowData, columns, `Orders_${moment().format("YYYY-MM-DD")}.xlsx`);
            } catch (error) {
                console.error("Export failed", error);
            }
        }, 100);
    };

    const columns = useMemo(() => [

        // 1. Order Date
        {
            headerName: t("Order Date"),
            field: "orderCreatedTime",
            title: "Order Created Time",
            width: 155,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Date and time when the order was placed.") },
            exportFormatter: (val) => val ? moment(val).format("DD MMM YYYY hh:mm A") : "—",
            cellRenderer: (params) => {
                const val = params.value;
                return (
                    <div className="flex flex-col justify-center h-full" style={{ gap: 2 }}>
                        <span style={{ fontSize: 11, color: P.neutral400, fontWeight: 500 }}>
                            {val ? moment(val).fromNow() : "—"}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#cbd5e1" : P.neutral800 }}>
                            {val ? moment(val).format("DD MMM YYYY") : "—"}
                        </span>
                        <span style={{ fontSize: 10, color: P.neutral400 }}>
                            {val ? moment(val).format("hh:mm A") + " IST" : ""}
                        </span>
                    </div>
                );
            },
        },

        // 2. Order Details
        {
            headerName: t("Order Details"),
            field: "orderId",
            title: "Order ID",
            minWidth: 230,
            flex: 1,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="flex flex-col justify-center h-full" style={{ gap: 4, padding: "6px 0" }}>
                        <span
                            id={"orders-first-target-" + params.node.rowIndex}
                            style={{
                                fontSize: 12, fontWeight: 700,
                                color: "var(--accent-primary)", fontFamily: "monospace",
                                letterSpacing: "0.3px",
                                cursor: "pointer", textDecoration: "underline"
                            }}
                            onClick={() => handleOrderClick(row)}
                        >
                            {row.orderId}
                        </span>
                        {row.buyer?.buyerName && (
                            <span style={{ fontSize: 11, color: isDark ? "#94a3b8" : P.neutral600 }}>
                                <i className="fa-solid fa-user mr-1" style={{ fontSize: 9, color: P.neutral400 }} />
                                {row.buyer.buyerName}
                            </span>
                        )}
                        <div className="flex items-center flex-wrap" style={{ gap: 4 }}>
                            <FulfilmentBadge value={row.fulfillment?.fulfilledBy} />
                            <PaymentBadge value={row.paymentMethod} />
                        </div>
                        <span style={{ fontSize: 10, color: P.neutral400 }}>
                            {row.salesChannel?.marketplaceName}
                            {row.fulfillment?.fulfillmentServiceLevel
                                ? ` · ${row.fulfillment.fulfillmentServiceLevel}`
                                : ""}
                        </span>
                    </div>
                );
            },
        },

        // 3. Product (Image + Name + All Items)
        {
            headerName: t("Product"),
            field: "productName",
            title: "Product Name",
            minWidth: 380,
            flex: 2,
            wrapText: true,
            autoHeight: true,
            sortable: false,
            exportFormatter: (val, row) => {
                if (!row?.orderItems?.length) return "—";
                return row.orderItems.map(item => {
                    const pd = item.productData ?? {};
                    return pd.itemName || item.product?.title || "—";
                }).join(" | ");
            },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return <ProductItemsCell items={row.orderItems || []} />;
            },
        },

        // 4. Order Type
        {
            headerName: t("Order Type"),
            field: "fulfillmentServiceLevel",
            title: "Fulfillment Service Level",
            width: 135,
            sortable: false,
            cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
            exportFormatter: (val, row) => row?.fulfillment?.fulfillmentServiceLevel || "—",
            cellRenderer: (params) => {
                const level = params.data?.fulfillment?.fulfillmentServiceLevel;
                if (!level) return <span style={{ color: P.neutral400 }}>—</span>;
                return (
                    <div className="flex items-center justify-center h-full">
                        <span className="order-type-badge">
                            <i className="fa-solid fa-bolt" style={{ fontSize: 10 }} />
                            {level}
                        </span>
                    </div>
                );
            },
        },

        // 5. Order Status
        {
            headerName: t("Order Status"),
            field: "orderStatus",
            minWidth: 160,
            title: "Order Status",
            cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
            cellRenderer: (params) => <StatusBadge value={params.value} isRefunded={params.data?.isRefunded} />,
        },

        // 6. Shipping Date  (NEW — separate column)
        {
            headerName: t("Shipping Date"),
            field: "orderLastUpdatedTime",
            title: "Order Last Updated Time",
            width: 145,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Date when the order was last updated / shipped.") },
            exportFormatter: (val, row) => {
                const shippable = ["SHIPPED", "PARTIALLY_SHIPPED"].includes(row?.orderStatus);
                return (shippable && val) ? moment(val).format("DD MMM YYYY hh:mm A") : "—";
            },
            cellRenderer: (params) => {
                const row = params.data;
                // Only show shipping date for SHIPPED / PARTIALLY_SHIPPED
                const shippable = ["SHIPPED", "PARTIALLY_SHIPPED"].includes(row?.orderStatus);
                const val = shippable ? row?.orderLastUpdatedTime : null;
                return (
                    <div className="flex flex-col justify-center h-full" style={{ gap: 2 }}>
                        {val ? (
                            <>
                                <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#cbd5e1" : P.neutral800 }}>
                                    {moment(val).format("DD MMM YYYY")}
                                </span>
                                <span style={{ fontSize: 10, color: P.neutral400 }}>
                                    {moment(val).format("hh:mm A") + " IST"}
                                </span>
                            </>
                        ) : (
                            <span style={{ fontSize: 12, color: P.neutral400 }}>—</span>
                        )}
                    </div>
                );
            },
        },

        // 7. Amount
        {
            headerName: t("Amount"),
            field: "totalAmount",
            title: "Total Amount",
            width: 130,
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Total order value and quantity.") },
            exportFormatter: (val, row) => val != null ? `${CurrencyCode(val, row.currencyCode)} (Qty: ${row.totalQuantity || 0})` : "—",
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="flex flex-col justify-center h-full">
                        <span style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#f8fafc" : P.neutral800 }}>
                            {CurrencyCode(row.totalAmount || 0, row.currencyCode)}
                        </span>
                        <span style={{ fontSize: 10, color: P.neutral400 }}>
                            Qty: {row.totalQuantity || 0}
                        </span>
                    </div>
                );
            },
        },

        // 8. View Details (pinned right)
        {
            headerName: t("Action"),
            field: "action",
            width: 140,
            sortable: false,
            pinned: "right",
            lockPinned: true,
            resizable: false,
            cellRenderer: (params) => (
                <div className="flex items-center h-full">
                    <Button
                        variant="default"
                        className="btn-view-order"
                        style={{
                            borderRadius: 7,
                            padding: "7px 16px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            letterSpacing: "0.02em",
                        }}
                        onClick={() => handleOrderClick(params?.data)}
                    >
                        {t("View Order")} →
                    </Button>
                </div>
            ),
        },
    ], [t, isDark]);

    useImperativeHandle(ref, () => ({
        getColumns: () => columns
    }));

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden glass-grid-container" style={{ padding: "15px" }}>

            {/* Grid Header */}
            <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pb-4">
                <div className="flex items-center">
                    <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#f8fafc" : "#0F172A" }}>
                        {t("Orders")}
                    </CardTitle>
                </div>

                {/* Export Button */}
                <div style={{ flex: "0 0 auto" }}>
                    <Button
                        className="customize-button m-0"
                        style={{
                            height: "36px",
                            padding: "0 16px",
                            fontSize: 13,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            whiteSpace: "nowrap"
                        }}
                        onClick={handleExport}
                    >
                        {t("Export")}
                    </Button>
                </div>
            </div>

            <AgTable
                onRefresh={() => {
                    if (onRefresh) onRefresh();
                    else onPageChange?.(currentPage);
                }} ref={gridRef}
                tableId="orders-grid"
                height="65vh"
                rowHeight={80}
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
                customSaveColumnName="Orders Grid"
            />

            <OrderDetailModal
                show={showModal}
                onHide={() => setShowModal(false)}
                order={selectedOrder}
            />
        </div>
    );
});

export default OrdersGrid;