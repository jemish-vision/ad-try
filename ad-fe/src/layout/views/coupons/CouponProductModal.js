import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { X } from "lucide-react";
// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
    d
        ? new Date(d).toLocaleDateString("en-US", {
            day: "2-digit", month: "short", year: "numeric",
        })
        : "-";

const fmtNum = (val) =>
    val != null ? Number(val).toLocaleString() : "-";

const FmtDiscount = ({ type, amount }) => {
    if (amount == null) return <>-</>;
    if (type === "PERCENT_OFF_LIST_PRICE") return <>{amount}%</>;
    return <>{CurrencyCode(amount)}</>;
};

// ─── Status map ───────────────────────────────────────────────────────────────
const STATUS_MAP = {
    RUNNING: { label: "Running", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" },
    EXPIRING_SOON: { label: "Expiring Soon", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" },
    EXPIRED: { label: "Expired", className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400" },
    UPCOMING: { label: "Upcoming", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" },
    CANCELLED: { label: "Cancelled", className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400" },
};

// ─── Performance map ──────────────────────────────────────────────────────────
const PERF_MAP = {
    PROFITABLE: { label: "Profitable", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" },
    LOSS_MAKING: { label: "Loss Making", className: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" },
    BREAKEVEN: { label: "Breakeven", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" },
    NO_DATA: { label: "No Data", className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400" },
    OPTIMIZATION_NEEDED: { label: "Optimization Needed", className: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400" },
};

// ─── Deduplicate by _id ───────────────────────────────────────────────────────
const dedupeProducts = (products = []) => {
    const seen = new Set();
    return products.filter((p) => {
        const key = p._id || `${p.asin}_${p.sku}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

// ─── Metric card ─────────────────────────────────────────────────────────────
const MetricCell = ({ label, primary, sub, accent = false, last = false }) => (
    <div className={`p-4 flex flex-col gap-1 ${last ? '' : 'border-r border-slate-200 dark:border-white/10'}`}>
        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {label}
        </div>
        <div className={`text-base font-bold ${accent ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'} leading-tight`}>
            {primary}
        </div>
        {sub && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {sub}
            </div>
        )}
    </div>
);

// ─── Product row ─────────────────────────────────────────────────────────────
const ProductRow = ({ product }) => {
    const { t } = useTranslation();
    return (
    <div className="flex items-start gap-4 p-4 bg-white dark:bg-transparent border-b border-slate-200 dark:border-white/10 transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
        {/* Image */}
        <div className="w-[76px] h-[76px] shrink-0 border border-slate-200 dark:border-white/10 rounded-md bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden shadow-sm">
            {product.imageURL ? (
                <img
                    src={product.imageURL}
                    alt={product.itemName}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                        e.target.style.display = "none";
                        e.target.parentNode.innerHTML = '<span class="text-2xl">📦</span>';
                    }}
                />
            ) : (
                <span className="text-2xl">📦</span>
            )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
            <p className="m-0 mb-2 text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                {product.itemName || "-"}
            </p>
            <div className="flex gap-5 flex-wrap">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t("ASIN")}:{" "}
                    <strong className="text-blue-600 dark:text-blue-400 font-mono tracking-wide font-bold">
                        {product.asin}
                    </strong>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t("SKU")}:{" "}
                    <strong className="text-slate-900 dark:text-white font-semibold">
                        {product.sku || "-"}
                    </strong>
                </span>
            </div>
        </div>
    </div>
    );
};

// ─── Section divider label ────────────────────────────────────────────────────
const SectionHeader = ({ label, right }) => (
    <div className="bg-slate-100 dark:bg-slate-800/50 py-2.5 px-5 flex items-center justify-between border-y border-slate-200 dark:border-white/10">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            {label}
        </span>
        {right && (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {right}
            </span>
        )}
    </div>
);

// ─── Main Modal ───────────────────────────────────────────────────────────────
const CouponProductModal = ({ coupon, onClose }) => {
    const { t } = useTranslation();
    const products = useMemo(() => dedupeProducts(coupon?.productData), [coupon]);

    if (!coupon) return null;

    const statusInfo = STATUS_MAP[coupon.status] || {
        label: coupon.status, className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400",
    };
    const perfInfo = PERF_MAP[coupon.performanceTag] || {
        label: coupon.performanceTag, className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400",
    };

    const budgetUtilPct =
        coupon.budget > 0
            ? Math.round(((coupon.budgetSpent || 0) / coupon.budget) * 100)
            : 0;

    const couponPageUrl = coupon.couponId ? `https://www.amazon.in/promotion/psp/${coupon.couponId}` : null;

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent hideCloseButton={true} id="coupons-modal" className="max-w-[900px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-[#0f172a] border-slate-200 dark:border-white/10 shadow-2xl">
                {/* ── Top header ── */}
                <DialogHeader className="p-6 shrink-0 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-[#0f172a] border-b border-slate-200 dark:border-white/10 text-left">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            {/* Breadcrumb */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    {t("Coupon Details")}
                                </span>
                                {coupon.couponId && (
                                    <>
                                        <span className="text-slate-300 dark:text-slate-600 text-[10px]">•</span>
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tracking-wide">
                                            {coupon.couponId}
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Name */}
                            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white leading-snug mb-3">
                                {coupon.name}
                            </DialogTitle>

                            {/* Badges row */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-3 py-1 rounded-md text-xs font-bold ${statusInfo.className}`}>
                                    {t(statusInfo.label)}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${perfInfo.className}`}>
                                    {t(perfInfo.label)}
                                </span>
                                {coupon.status === "RUNNING" && couponPageUrl && (
                                    <a
                                        href={couponPageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20 transition-colors border border-slate-200 dark:border-white/10"
                                    >
                                        {t("View Coupon Page ↗")}
                                    </a>
                                )}
                            </div>
                        </div>
                        <button id="coupons-modal-close" className="absolute right-4 top-4 rounded-full border border-gray-300 dark:border-gray-600 p-1.5 opacity-70 ring-offset-background transition-all text-slate-800 dark:text-slate-200 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground self-start mt-2" onClick={onClose}>
                            <X className="h-5 w-5" />
                            <span className="sr-only">{t("Close")}</span>
                        </button>
                    </div>
                </DialogHeader>

                {/* ── Scrollable Body ── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-transparent">
                    {/* ── Info strip: Discount + Duration ── */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 px-6 flex flex-wrap gap-0 items-center">
                    {[
                        {
                            label: t("Discount"),
                            content: (
                                <span className="text-lg font-extrabold text-red-600 dark:text-red-400">
                                    <FmtDiscount type={coupon.discountType} amount={coupon.discountAmount} />
                                </span>
                            ),
                        },
                        {
                            label: t("Start Date"),
                            content: (
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {fmtDate(coupon.startDateTime)}
                                </span>
                            ),
                        },
                        {
                            label: t("End Date"),
                            content: (
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {fmtDate(coupon.endDateTime)}
                                </span>
                            ),
                        },
                        {
                            label: t("Discount Type"),
                            content: (
                                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900/50 rounded px-2.5 py-0.5 inline-block">
                                    {coupon.discountType === "PERCENT_OFF_LIST_PRICE"
                                        ? t("% Off List Price")
                                        : t("Fixed Amount Off")}
                                </span>
                            ),
                        },
                    ].map((item, i, arr) => (
                        <div
                            key={item.label}
                            className={`flex flex-col gap-1 pr-6 mr-6 ${i < arr.length - 1 ? 'border-r border-slate-200 dark:border-white/10' : ''}`}
                        >
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                {item.label}
                            </span>
                            {item.content}
                        </div>
                    ))}
                </div>

                {/* ── Budget & Activity metrics ── */}
                <SectionHeader label={t("Budget & Activity")} />
                <div id="coupons-modal-budget-activity" className="grid grid-cols-5 bg-white dark:bg-transparent">
                    <MetricCell label={t("Budget")} primary={<>{CurrencyCode(coupon.budget)}</>} sub={t("{{pct}}% utilised", { pct: budgetUtilPct })} accent />
                    <MetricCell label={t("Budget Spent")} primary={<>{CurrencyCode(coupon.budgetSpent)}</>} sub={null} />
                    <MetricCell label={t("Budget Remaining")} primary={<>{CurrencyCode(coupon.budgetRemaining)}</>} sub={null} />
                    <MetricCell label={t("Clips / Redeemed")} primary={fmtNum(coupon.clips)} sub={t("{{count}} redeemed", { count: fmtNum(coupon.redemptions) })} />
                    <MetricCell label={t("Sales")} primary={<>{CurrencyCode(coupon.sales)}</>} sub={null} accent last />
                </div>

                {/* ── Performance metrics ── */}
                {coupon.performanceMetrics && (
                    <>
                        <SectionHeader label={t("Performance Metrics")} />
                        <div id="coupons-modal-performance" className="grid grid-cols-5 bg-slate-50/50 dark:bg-slate-800/30">
                            <MetricCell label={t("Revenue")} primary={<>{CurrencyCode(coupon.performanceMetrics.revenue)}</>} accent />
                            <MetricCell label={t("Coupon Cost")} primary={<>{CurrencyCode(coupon.performanceMetrics.couponCost)}</>} />
                            <MetricCell label={t("Profit")} primary={<>{CurrencyCode(coupon.performanceMetrics.profit)}</>} accent />
                            <MetricCell
                                label={t("ROI")}
                                primary={coupon.performanceMetrics.roi != null ? `${parseFloat(coupon.performanceMetrics.roi).toFixed(2)}%` : "-"}
                            />
                            <MetricCell
                                label={t("Margin")}
                                primary={coupon.performanceMetrics.margin != null ? `${parseFloat(coupon.performanceMetrics.margin).toFixed(2)}%` : "-"}
                                last
                            />
                        </div>
                    </>
                )}

                    {/* ── Product Details ── */}
                    <SectionHeader
                        label={t("Product Details")}
                        right={products.length === 1 ? t("{{count}} product", { count: products.length }) : t("{{count}} products", { count: products.length })}
                    />

                    <div id="coupons-modal-products">
                        {products.length === 0 ? (
                            <div className="py-10 px-5 text-center text-slate-500 dark:text-slate-400 text-sm">
                                {t("No product data available")}
                            </div>
                        ) : (
                            products.map((product, idx) => (
                                <ProductRow key={product._id || idx} product={product} />
                            ))
                        )}
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="p-4 px-6 shrink-0 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {t("Showing 1–{{count}} of {{total}}", { count: products.length, total: products.length })}
                    </span>
                    <Button
                        variant="default"
                        onClick={onClose}
                        className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {t("Close")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default CouponProductModal;