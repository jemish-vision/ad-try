import React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../../components/ui/dialog";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { X } from "lucide-react";

const MINUS_VALUES = ["DISCOUNT"];

// ─── Small helpers ────────────────────────────────────────────────────────────
const InfoRow = ({ label, value, valueStyle = {} }) => (
    <div className="info-row">
        <span className="info-row-label">
            {label}
        </span>
        <span className="info-row-value" style={valueStyle}>
            {value || "—"}
        </span>
    </div>
);

const Chip = ({ icon, label, typeClass }) => (
    <span className={`detail-chip ${typeClass}`}>
        <i className={`fa-solid ${icon}`} />
        {label}
    </span>
);

const RefundedChip = () => {
    const { t } = useTranslation();
    return <Chip icon="fa-rotate-left" label={t("Refunded")} typeClass="chip-refunded" />;
};

const StatusChip = ({ status }) => {
    const { t } = useTranslation();
    const cfg = {
        SHIPPED: { typeClass: "chip-shipped", icon: "fa-truck", label: "Payment Complete" },
        PENDING: { typeClass: "chip-pending", icon: "fa-clock", label: "Pending" },
        PENDING_AVAILABILITY: { typeClass: "chip-pending-availability", icon: "fa-hourglass-start", label: "Pending Availability" },
        UNSHIPPED: { typeClass: "chip-unshipped", icon: "fa-box", label: "Unshipped" },
        PARTIALLY_SHIPPED: { typeClass: "chip-partially-shipped", icon: "fa-truck-fast", label: "Partially Shipped" },
        CANCELLED: { typeClass: "chip-cancelled", icon: "fa-circle-xmark", label: "Cancelled" },
        UNFULFILLABLE: { typeClass: "chip-unfulfillable", icon: "fa-triangle-exclamation", label: "Unfulfillable" },
    }[status] ?? { typeClass: "chip-default", icon: "fa-circle-dot", label: status };
    return <Chip {...cfg} label={t(cfg.label)} />;
};

// ─── Section wrapper ──────────────────────────────────────────────────────────
const Section = ({ title, icon, children }) => (
    <div className="detail-section">
        <div className="detail-section-header">
            <i className={`fa-solid ${icon}`} />
            <span>{title}</span>
        </div>
        <div className="detail-section-body">
            {children}
        </div>
    </div>
);

// ─── Order Item Row ───────────────────────────────────────────────────────────
const OrderItemRow = ({ item, currencyCode = "INR", idx, total }) => {
    const { t } = useTranslation();
    const pd = item.productData ?? {};
    const img = pd.imageURL || null;
    const title = pd.itemName || item.product?.title || "—";
    const asin = pd.asin || item.product?.asin || "—";
    const sku = pd.sku || item.product?.sellerSku || "—";
    const qty = item.quantityOrdered ?? 0;
    const unitPrice = item.product?.price ?? pd.sellingPrice ?? 0;
    const subtotal = qty * unitPrice;
    const symbol = currencyCode === "INR" ? "₹" : "$";

    const itemProceeds = item.proceeds;

    return (
        <div className="order-item-row">
            {/* Status pill — left side */}
            <div className="item-status-col">
                <span className="item-delivered-badge">
                    <i className="fa-solid fa-circle-check text-[9px]" />
                    {t("Delivered")}
                </span>
            </div>

            {/* Image */}
            <div className="product-img-wrapper">
                {img
                    ? <img src={img} alt="product" className="max-w-[90%] max-h-[90%] object-contain" />
                    : <i className="fa-regular fa-image text-[22px]" />
                }
            </div>

            {/* Product info */}
            <div className="product-info-col">
                <span className="product-title">
                    {title}
                </span>
                <div className="product-meta-row">
                    <span><strong>ASIN:</strong> {asin}</span>
                    <span><strong>SKU:</strong> {sku}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-0.5">
                    <span className="badge-condition">
                        {t("Condition")}: {t("New")}
                    </span>
                    <span className="badge-item-id">
                        {t("Order Item ID")}: {item.orderItemId || "—"}
                    </span>
                </div>
            </div>

            {/* Qty */}
            <div className="item-qty-col">
                <span>{qty}</span>
            </div>

            {/* Unit price */}
            <div className="item-price-col">
                <span>
                    {symbol}{unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
            </div>

            {/* Proceeds breakdown */}
            <div className="item-proceeds-col">
                {itemProceeds?.breakdowns && itemProceeds.breakdowns.length > 0 ? (
                    <>
                        {itemProceeds.breakdowns.map((breakdown, bIdx) => (
                            <div key={bIdx} className={`flex justify-between w-full gap-3 ${MINUS_VALUES.includes(breakdown?.subTotalType) ? "minus-value" : ""}`}>
                                <span className="capitalize">{breakdown?.subTotalType ? t(breakdown.subTotalType.toLowerCase()) : ""}:</span>
                                <span className="font-semibold">
                                    {MINUS_VALUES.includes(breakdown?.subTotalType) ? "-" : ""}{symbol}{breakdown?.subTotalAmount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        ))}
                        <div className="proceeds-total">
                            <span>{t("Total")}:</span>
                            <span>{symbol}{itemProceeds.proceedsTotal?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                        </div>
                    </>
                ) : (
                    <div className="flex justify-between w-full text-[13px] font-bold">
                        <span>{t("Total")}:</span>
                        <span>{symbol}{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────
const OrderDetailModal = ({ show, onHide, order }) => {
    const { t } = useTranslation();
    if (!order) return null;

    const {
        orderId,
        fulfillment,
        orderCreatedTime,
        orderLastUpdatedTime,
        orderStatus,
        paymentMethod,
        salesChannel,
        recipient,
        orderItems = [],
        totalAmount = 0,
        currencyCode = "INR",
        proceeds,
        isRefunded,
    } = order;

    const symbol = currencyCode === "INR" ? "₹" : "$";
    const isCOD = paymentMethod === "CashOnDelivery";
    const isAmazon = fulfillment?.fulfilledBy === "AMAZON";

    const addr = recipient?.deliveryAddress;

    return (
        <Dialog open={show} onOpenChange={onHide}>
            <DialogContent hideCloseButton={true} className="max-w-[1200px] p-0 gap-0 overflow-hidden bg-[#F8FAFC] dark:bg-[#0f172a] border-slate-200 dark:border-white/10" id="order-detail-modal">
                <div className="flex flex-col h-full max-h-[85vh] overflow-hidden" id="orders-drawer">
                    {/* ── Header ── */}
                    <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-white/10 m-0 space-y-0">
                        <DialogTitle className="flex items-center justify-between m-0 p-0 text-slate-900 dark:text-white w-full">
                            <div className="flex items-center" style={{ gap: 12 }}>
                                <div className="flex items-center justify-center rounded-md bg-blue-50 dark:bg-white/5" style={{ width: 40, height: 40 }}>
                                    <i className="fa-solid fa-file-lines text-blue-500 dark:text-blue-400 text-lg" />
                                </div>
                                <div className="flex flex-col items-start justify-center">
                                    <div className="font-normal text-sm text-slate-500 dark:text-slate-400">
                                        {t("Order Details")}
                                    </div>
                                    <div className="font-bold text-lg text-slate-900 dark:text-white">
                                        {orderId}
                                    </div>
                                </div>
                                <div className="ml-4 flex items-center gap-2">
                                    <StatusChip status={orderStatus} />
                                    {order?.isRefunded && <RefundedChip />}
                                </div>
                            </div>
                            <button className="absolute right-4 top-4 rounded-full border border-gray-300 dark:border-gray-600 p-1.5 opacity-70 ring-offset-background transition-all text-slate-800 dark:text-slate-200 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground" onClick={() => onHide(false)}>
                                <X className="h-5 w-5" />
                                <span className="sr-only">Close</span>
                            </button>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="order-detail-modal-body overflow-y-auto p-6" style={{ height: "100%" }}>

                        {/* ── Row 1: Order Summary + Ship To ── */}
                        <div className="grid grid-cols-2 gap-3.5">

                            {/* Order Summary */}
                            <Section title={t("Order Summary")} icon="fa-clipboard-list">
                                <div className="grid grid-cols-2 gap-3.5">
                                    <InfoRow
                                        label={t("Ship By")}
                                        value={orderLastUpdatedTime ? moment(orderLastUpdatedTime).format("ddd, DD MMM YYYY") + " IST" : "—"}
                                        valueStyle={{ color: "#1A9FD4", fontWeight: 700 }}
                                    />
                                    <InfoRow
                                        label={t("Purchase Date")}
                                        value={orderCreatedTime ? moment(orderCreatedTime).format("ddd, DD MMM YYYY, h:mm A") + " IST" : "—"}
                                    />
                                    <InfoRow
                                        label={t("Shipping Service")}
                                        value={fulfillment?.fulfillmentServiceLevel || "—"}
                                    />
                                    <InfoRow
                                        label={t("Fulfillment")}
                                        value={isAmazon ? t("Amazon (FBA)") : t("Seller (MFN)")}
                                    />
                                    <InfoRow
                                        label={t("Sales Channel")}
                                        value={salesChannel?.marketplaceName || "—"}
                                    />
                                    <InfoRow
                                        label={t("Payment Method")}
                                        value={isCOD ? t("Cash on Delivery") : (paymentMethod ? t(paymentMethod) : t("Prepaid"))}
                                    />
                                </div>
                            </Section>

                            {/* Ship To */}
                            <Section title={t("Ship To")} icon="fa-location-dot">
                                {addr ? (
                                    <div className="flex flex-col gap-2.5">
                                        <div className="flex justify-between items-start" >
                                            <div className="flex flex-col gap-1">
                                                <span className="recipient-name">
                                                    {addr.name}
                                                </span>
                                                <span className="recipient-address">
                                                    {[addr.addressLine1, addr.addressLine2].filter(Boolean).join(", ")}
                                                    <br />
                                                    {[addr.city, addr.stateOrRegion, addr.postalCode].filter(Boolean).join(", ")}
                                                    <br />
                                                    {addr.countryCode}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <span style={{ fontSize: 13, color: "#94a3b8" }}>{t("No address available")}</span>
                                )}
                            </Section>
                        </div>

                        {/* ── Row 2: Order Contents (col-8) + Sales Proceeds (col-4) ── */}
                        <div className="grid grid-cols-[3fr_1fr] gap-3.5 mt-3">

                            {/* Order Contents - col-8 */}
                            <Section title={t("Order Contents")} icon="fa-boxes-stacked">
                                <div className="max-h-[385px] overflow-y-auto overflow-x-hidden pr-2">
                                    {/* Table header */}
                                    <div className="order-contents-sticky-header">
                                        <div className="header-col" style={{ minWidth: 110 }}>{t("Status")}</div>
                                        <div className="header-col" style={{ width: 72 }}>{t("Image")}</div>
                                        <div className="header-col" style={{ flex: 1 }}>{t("Product Name")}</div>
                                        <div className="header-col" style={{ minWidth: 50, textAlign: "center" }}>{t("Qty")}</div>
                                        <div className="header-col" style={{ minWidth: 80, textAlign: "right" }}>{t("Unit Price")}</div>
                                        <div className="header-col" style={{ minWidth: 180, textAlign: "right" }}>{t("Proceeds")}</div>
                                    </div>

                                    {orderItems.length > 0
                                        ? orderItems.map((item, idx) => (
                                            <OrderItemRow
                                                key={item.orderItemId || idx}
                                                item={item}
                                                currencyCode={currencyCode}
                                                idx={idx}
                                                total={orderItems.length}
                                            />
                                        ))
                                        : <span style={{ fontSize: 13, color: "#94a3b8" }}>{t("No items found.")}</span>
                                    }
                                </div>
                            </Section>

                            {/* Sales Proceeds - col-4 - Show main proceeds breakdown */}
                            <Section title={t("Sales Proceeds")} icon="fa-indian-rupee-sign">
                                <div className="proceeds-summary-box">

                                    {proceeds?.breakdowns && proceeds.breakdowns.length > 0 ? (
                                        <>
                                            {/* All breakdowns — rename DISCOUNT → Promotion */}
                                            {proceeds.breakdowns.map((breakdown, idx) => {
                                                return (
                                                    <div key={idx} className={`proceeds-summary-row ${MINUS_VALUES.includes(breakdown?.subTotalType) ? "minus-value" : ""}`}>
                                                        <span className="capitalize font-medium">
                                                            {breakdown?.subTotalType ? t(breakdown.subTotalType.toLowerCase()) : t("Item")}:
                                                        </span>
                                                        <span className="font-semibold">
                                                            {MINUS_VALUES.includes(breakdown?.subTotalType) ? "-" : ""}{symbol}{breakdown?.subTotalAmount?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "0.00"}
                                                        </span>
                                                    </div>
                                                )
                                            })}

                                            {isRefunded && proceeds?.proceedsTotal != null && (
                                                <div className="proceeds-summary-row refund-row">
                                                    <span className="inline-flex items-center gap-[5px] capitalize">
                                                        <i className="fa-solid fa-rotate-left text-[10px]" />
                                                        {t("Refunds")}:
                                                    </span>
                                                    <span className="font-bold">
                                                        -{symbol}{Math.abs(proceeds.proceedsTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            )}

                                            {(() => {
                                                const nonDiscountSum = proceeds.breakdowns.filter(b => b?.subTotalType !== "DISCOUNT").reduce((acc, b) => acc + (b?.subTotalAmount ?? 0), 0);
                                                const discountSum = proceeds.breakdowns.filter(b => b?.subTotalType === "DISCOUNT").reduce((acc, b) => acc + (b?.subTotalAmount ?? 0), 0);
                                                const refundDeduction = isRefunded ? (proceeds.proceedsTotal ?? 0) : 0;
                                                const grandTotal = nonDiscountSum - discountSum - refundDeduction;

                                                return (
                                                    <div className="proceeds-grand-total">
                                                        <span>{t("Grand Total")}:</span>
                                                        <span className={`total-val ${grandTotal < 0 ? "minus-val" : ""}`}>
                                                            {grandTotal < 0 ? "-" : ""}{symbol}{Math.abs(grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    ) : (
                                        <div className="proceeds-grand-total">
                                            <span>{t("Grand Total")}:</span>
                                            <span className="total-val">
                                                {symbol}{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </Section>
                        </div>

                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default OrderDetailModal;