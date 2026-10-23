import { useEffect, useMemo, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import moment from "moment";

import AgTable from "../../../../common/grid/AgTable";
import Toast from "../../../../common/helper/toast/Toast";

import { ApiGetShippingQueueDetails } from "../../../../api-wrapper/reconciliation-reimbursement/ApiReconciliationReimbursement";

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────
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

function StatusBadge({ status, isDark }) {
    const cfg = getStatusCfg(status, isDark);
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 16px", borderRadius: 20,
            background: cfg.bg, color: cfg.color,
            fontSize: 12, fontWeight: 700,
            border: isDark ? `1px solid rgba(255,255,255,0.05)` : `1px solid rgba(0,0,0,0.03)`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
        }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot }} />
            {cfg.label}
        </span>
    );
}

function InfoRow({ label, value, isDark }) {
    return (
        <div style={{ marginBottom: 12 }} className="flex justify-between items-center">
            <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.4)" : "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.9)" : "#1e293b", lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
                {value || "--"}
            </div>
        </div>
    );
}

function StatCard({ label, value, color, sub, isDark }) {
    const displayColor = color || (isDark ? "rgba(255,255,255,0.9)" : "#111827");
    return (
        <div style={{
            flex: 1,
            background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.85)",
            border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(2, 70, 139, 0.06)",
            borderRadius: 12,
            padding: "12px 16px",
            minWidth: 90,
            boxShadow: "0 4px 20px rgba(0,0,0,0.02)",
        }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.4)" : "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: displayColor, lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: 10, color: isDark ? "rgba(255,255,255,0.5)" : "#64748b", marginTop: 4, fontWeight: 500 }}>{sub}</div>}
        </div>
    );
}

function ShipmentDetailsModal({ show, handleClose, shipmentId, profileId, isDark }) {
    const gridRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [details, setDetails] = useState(null);

    const fetchShipmentDetails = async () => {
        if (!shipmentId || !profileId) return;
        setLoading(true);
        try {
            const res = await ApiGetShippingQueueDetails(shipmentId, { profileId });
            if (res?.isSuccess) {
                setDetails(res?.data || null);
            } else {
                Toast.error(res?.message || "Failed to fetch shipment details");
            }
        } catch (error) {
            Toast.error(error?.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (show) fetchShipmentDetails();
    }, [show, shipmentId]);

    const totalExpected = useMemo(() =>
        details?.items?.reduce((acc, item) => acc + (item?.quantityShipped || 0), 0) || 0,
        [details]);

    const totalReceived = useMemo(() =>
        details?.items?.reduce((acc, item) => acc + (item?.quantityReceived || 0), 0) || 0,
        [details]);

    const totalMissing = Math.max(0, totalExpected - totalReceived);
    const totalOver = Math.max(0, totalReceived - totalExpected);
    const progressPct = totalExpected > 0 ? Math.min((totalReceived / totalExpected) * 100, 100) : 0;

    const isClosed = details?.shipmentStatus === "CLOSED";
    const isOver = totalReceived > totalExpected;
    const isMissing = totalMissing > 0;

    const progressColor = isOver ? "#7c3aed" : progressPct >= 100 ? "#16a34a" : isMissing ? "#ef4444" : "#f59e0b";

    // Dynamic Card Style
    const getCardStyle = () => ({
        background: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(2, 70, 139, 0.08)",
        borderRadius: 16,
        padding: "14px 18px",
        boxShadow: isDark ? "none" : "0 8px 32px rgba(2, 70, 139, 0.03)",
        minWidth: 0,
        maxWidth: "100%",
        width: "100%",
        boxSizing: "border-box",
        overflowWrap: "anywhere",
        wordBreak: "break-word"
    });

    const getTagStyle = () => ({
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 6,
        background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9",
        color: isDark ? "rgba(255, 255, 255, 0.6)" : "#475569",
        fontSize: 11,
        fontWeight: 600,
        border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
    });

    // ── COLUMNS ──────────────────────────────────────────────────────────────
    const columns = [
        {
            headerName: "Product",
            field: "product.itemName",
            minWidth: 420,
            sortable: false,
            pinned: "left",
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const expected = params?.data?.quantityShipped || 0;
                const received = params?.data?.quantityReceived || 0;
                const missing = expected - received;
                const isOverItem = received > expected;
                const isClosed = details?.shipmentStatus === "CLOSED";
                const tagStyleVal = getTagStyle();

                return (
                    <div className="flex items-start" style={{ gap: 12, padding: "12px 4px" }}>
                        {/* Product image */}
                        <img
                            src={params?.data?.product?.imageURL}
                            alt="product"
                            style={{
                                width: 60, height: 60,
                                objectFit: "contain",
                                borderRadius: 8,
                                border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb",
                                background: isDark ? "rgba(255,255,255,0.05)" : "#fff",
                                padding: 4,
                                flexShrink: 0,
                            }}
                            onError={(e) => { e.target.style.display = "none"; }}
                        />

                        <div style={{ minWidth: 0 }}>
                            {/* Title */}
                            <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#111827", lineHeight: "18px", marginBottom: 5 }}>
                                {params?.data?.product?.itemName || "--"}
                            </div>

                            {/* SKU row */}
                            <div style={{ fontSize: 11, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#6b7280", marginBottom: 6 }}>
                                SKU: <strong style={{ color: isDark ? "rgba(255, 255, 255, 0.8)" : "#374151" }}>{params?.data?.sellerSKU || "--"}</strong>
                            </div>

                            {/* Pill tags */}
                            <div className="flex flex-wrap" style={{ gap: 5 }}>
                                <span style={tagStyleVal}>ASIN: {params?.data?.product?.asin || "--"}</span>
                                <span style={tagStyleVal}>FNSKU: {params?.data?.fulfillmentNetworkSKU || "--"}</span>
                                {isClosed ? (
                                    <>
                                        {missing > 0 && !isOverItem && (
                                            <span style={{ ...tagStyleVal, background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fee2e2", color: isDark ? "#f87171" : "#991b1b", border: isDark ? "1px solid rgba(239, 68, 68, 0.2)" : "", fontWeight: 700 }}>
                                                ⚠ Missing: {missing}
                                            </span>
                                        )}
                                        {isOverItem && (
                                            <span style={{ ...tagStyleVal, background: isDark ? "rgba(124, 58, 237, 0.15)" : "#ede9fe", color: isDark ? "#a78bfa" : "#7c3aed", border: isDark ? "1px solid rgba(124, 58, 237, 0.2)" : "", fontWeight: 700 }}>
                                                ↑ Over: +{received - expected}
                                            </span>
                                        )}
                                        {!missing && !isOverItem && (
                                            <span style={{ ...tagStyleVal, background: isDark ? "rgba(22, 163, 74, 0.15)" : "#dcfce7", color: isDark ? "#34d399" : "#14532d", border: isDark ? "1px solid rgba(22, 163, 74, 0.2)" : "", fontWeight: 700 }}>
                                                ✓ Fully Received
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {isOverItem && (
                                            <span style={{ ...tagStyleVal, background: isDark ? "rgba(124, 58, 237, 0.15)" : "#ede9fe", color: isDark ? "#a78bfa" : "#7c3aed", border: isDark ? "1px solid rgba(124, 58, 237, 0.2)" : "", fontWeight: 700 }}>
                                                ↑ Over: +{received - expected}
                                            </span>
                                        )}
                                        {missing > 0 && !isOverItem && (
                                            <span style={{ ...tagStyleVal, background: isDark ? "rgba(2, 132, 199, 0.15)" : "#e0f2fe", color: isDark ? "#60a5fa" : "#0369a1", border: isDark ? "1px solid rgba(2, 132, 199, 0.2)" : "", fontWeight: 700 }}>
                                                ● In Progress
                                            </span>
                                        )}
                                        {!isOverItem && !missing && (
                                            <span style={{ ...tagStyleVal, background: isDark ? "rgba(22, 163, 74, 0.15)" : "#dcfce7", color: isDark ? "#34d399" : "#14532d", border: isDark ? "1px solid rgba(22, 163, 74, 0.2)" : "", fontWeight: 700 }}>
                                                ✓ Fully Received
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            },
        },

        {
            headerName: "Expected",
            field: "quantityShipped",
            width: 110,
            sortable: true,
            headerClass: "ag-center-header",
            cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
            cellRenderer: (params) => (
                <span style={{ fontSize: 16, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.9)" : "#374151" }}>
                    {params?.value ?? 0}
                </span>
            ),
        },

        {
            headerName: "Received",
            field: "quantityReceived",
            width: 110,
            sortable: true,
            headerClass: "ag-center-header",
            cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
            cellRenderer: (params) => (
                <span style={{ fontSize: 16, fontWeight: 700, color: "#16a34a" }}>
                    {params?.value ?? 0}
                </span>
            ),
        },

        {
            headerName: "Variance",
            field: "missingUnits",
            width: 110,
            sortable: false,
            headerClass: "ag-center-header",
            cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
            cellRenderer: (params) => {
                const expected = params?.data?.quantityShipped || 0;
                const received = params?.data?.quantityReceived || 0;
                const missing = expected - received;
                const isOverItem = received > expected;

                return (
                    <span style={{ fontSize: 16, fontWeight: 700, color: missing > 0 ? "#ef4444" : isOverItem ? "#a78bfa" : "#16a34a" }}>
                        {missing > 0 ? `-${missing}` : isOverItem ? `+${received - expected}` : "0"}
                    </span>
                );
            },
        },

        {
            headerName: "Receiving Progress",
            field: "progress",
            minWidth: 200,
            sortable: false,
            cellRenderer: (params) => {
                const expected = params?.data?.quantityShipped || 0;
                const received = params?.data?.quantityReceived || 0;
                const pct = expected > 0 ? Math.min((received / expected) * 100, 100) : 0;
                const color = pct >= 100 ? "#16a34a" : received === 0 ? "#ef4444" : "#f59e0b";
                const isClosed = details?.shipmentStatus === "CLOSED";
                const missing = (params?.data?.quantityShipped || 0) - (params?.data?.quantityReceived || 0);

                return (
                    <div style={{ padding: "0 4px", display: "flex", flexDirection: "column", gap: 5, justifyContent: "center", height: "100%" }}>
                        <div className="flex justify-between items-center" >
                            <span style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.5)" : "#6b7280" }}>{received} / {expected}</span>
                            <span style={{ marginLeft: "15px", fontSize: 12, fontWeight: 700, color }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 8, background: isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6", overflow: "hidden" }}>
                            <div style={{
                                height: "100%",
                                width: `${pct}%`,
                                borderRadius: 8,
                                background: color,
                                transition: "width 0.4s ease",
                            }} />
                        </div>
                        {
                            isClosed && missing > 0 && (
                                <div className="mt-2 flex items-center justify-center" style={{ height: "100%" }}>
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            const reconciliationData = {
                                                shipmentId: details?.shipmentId,
                                                sellerSKU: params?.data?.sellerSKU,
                                                fnsku: params?.data?.fulfillmentNetworkSKU,
                                                asin: params?.data?.product?.asin,
                                                quantityShipped: params?.data?.quantityShipped,
                                                quantityReceived: params?.data?.quantityReceived,
                                                marketplace: "IN",
                                            };
                                            window.dispatchEvent(new CustomEvent('openReconciliationModal', { detail: reconciliationData }));
                                        }}
                                        className="h-[28px] px-3 text-[11px] font-bold flex items-center gap-1.5 rounded-lg border hover:opacity-90"
                                        style={{
                                            background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fee2e2",
                                            borderColor: isDark ? "rgba(239, 68, 68, 0.3)" : "#fecaca",
                                            color: isDark ? "#f87171" : "#b91c1c"
                                        }}
                                    >
                                        <span>⚠️</span>
                                        Reconcile ({missing})
                                    </Button>
                                </div>
                            )
                        }
                    </div>
                );
            },
        },

        {
            headerName: "Prep Details",
            field: "prepDetails",
            minWidth: 160,
            sortable: false,
            cellRenderer: (params) => {
                const prep = params?.data?.prepDetailsList?.[0];
                return (
                    <div className="flex flex-col justify-center" style={{ gap: 3, height: "100%", padding: "0 4px" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.9)" : "#374151" }}>
                            {prep?.prepInstruction || "--"}
                        </span>
                        <span style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.4)" : "#9ca3af" }}>
                            Owner: {prep?.prepOwner || "--"}
                        </span>
                    </div>
                );
            },
        },
    ];

    return (
        <Dialog open={show} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent
                className="max-w-[1140px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans max-h-[88vh]"
            >
                {/* Glow Line Indicator */}
                <div 
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                {/* ── HEADER ─────────────────────────────────────────────────────── */}
                <DialogHeader
                    className="px-7 py-4 flex-shrink-0 border-b border-slate-100 dark:border-white/10"
                    style={{
                        background: isDark ? "rgba(255, 255, 255, 0.02)" : "#fff",
                    }}
                >
                    <DialogTitle className="flex flex-col" style={{ gap: 6 }}>
                        <div className="flex items-center flex-wrap" style={{ gap: 14 }}>
                            <span style={{ fontSize: 20, fontWeight: 800, color: isDark ? "rgba(255, 255, 255, 0.92)" : "#1e293b", fontFamily: "'Outfit', sans-serif" }}>
                                Shipment Summary
                            </span>
                            {details?.shipmentStatus && <StatusBadge status={details.shipmentStatus} isDark={isDark} />}
                            {details?.shipmentStatus === "CLOSED" && totalMissing > 0 && (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fee2e2", borderRadius: 20, padding: "4px 12px", border: isDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid #fecaca" }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#f87171" : "#b91c1c" }}>
                                        ⚠️ {totalMissing} Missing Unit{totalMissing !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-primary)" }}>
                            {details?.shipmentName || "--"}
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {/* ── BODY ───────────────────────────────────────────────────────── */}
                <div style={{ background: isDark ? "linear-gradient(180deg, #0e121e 0%, #151c2e 100%)" : "linear-gradient(180deg, #f8fafc 0%, #edf2f7 100%)", padding: 0, maxHeight: "65vh", overflowY: "auto", flex: 1 }}>
                    {loading ? (
                        <div className="flex items-center justify-center flex-col" style={{ height: 420, gap: 16 }}>
                            <div className="animate-spin rounded-full h-9 w-9 border-4 border-sky-500 border-t-transparent" />
                            <span style={{ fontSize: 14, color: isDark ? "rgba(255, 255, 255, 0.6)" : "#6b7280" }}>Loading shipment details…</span>
                        </div>
                    ) : (
                        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

                            {/* ── ROW 1: INFO CARDS ─────────────────────────────── */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">

                                {/* Shipment card */}
                                <div style={getCardStyle()}>
                                    <div style={cardHeading}>Shipment</div>
                                    <InfoRow label="Shipment ID" value={<span style={{ fontFamily: "monospace", fontSize: 13 }}>{details?.shipmentId}</span>} isDark={isDark} />
                                    <InfoRow label="Created At" value={details?.shipmentCreatedAt ? moment(details.shipmentCreatedAt).format("D MMM YYYY, hh:mm A") : "--"} isDark={isDark} />
                                    <InfoRow label="Label Prep" value={details?.labelPrepType} isDark={isDark} />
                                    <InfoRow label="Box Source" value={details?.boxContentsSource} isDark={isDark} />
                                </div>

                                {/* Ship From card */}
                                <div style={getCardStyle()}>
                                    <div style={cardHeading}>Ship From</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#1e293b", marginBottom: 8 }}>
                                        {details?.shipFromAddress?.name || "--"}
                                    </div>
                                    <div style={{ fontSize: 13, color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b", lineHeight: 1.8 }}>
                                        <div>{details?.shipFromAddress?.addressLine1}</div>
                                        <div>{details?.shipFromAddress?.addressLine2}</div>
                                        <div>{details?.shipFromAddress?.city}, {details?.shipFromAddress?.stateOrProvinceCode}</div>
                                        <div>{details?.shipFromAddress?.postalCode} — {details?.shipFromAddress?.countryCode}</div>
                                    </div>
                                </div>

                                {/* Destination card */}
                                <div style={getCardStyle()}>
                                    <div style={cardHeading}>Destination</div>
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.4)" : "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                                            Fulfillment Center
                                        </div>
                                        <span style={{
                                            display: "inline-block",
                                            padding: "6px 16px",
                                            borderRadius: 10,
                                            background: isDark ? "rgba(29, 78, 216, 0.15)" : "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                                            border: isDark ? "1px solid rgba(29, 78, 216, 0.3)" : "1px solid rgba(29, 78, 216, 0.15)",
                                            color: isDark ? "#60a5fa" : "#1d4ed8",
                                            fontSize: 20,
                                            fontWeight: 800,
                                            fontFamily: "'Outfit', sans-serif",
                                            letterSpacing: "0.08em",
                                            boxShadow: isDark ? "none" : "0 4px 12px rgba(29, 78, 216, 0.05)",
                                        }}>
                                            {details?.destinationFulfillmentCenterId || "--"}
                                        </span>
                                    </div>
                                    <InfoRow label="Total SKUs" value={`${details?.items?.length || 0} SKUs`} isDark={isDark} />
                                </div>
                            </div>

                            {/* ── ROW 2: RECEIVING PROGRESS ─────────────────────── */}
                            <div style={getCardStyle()}>
                                <div className="flex items-center justify-between flex-wrap" style={{ marginBottom: 16, gap: 12 }}>
                                    <div style={cardHeading}>Receiving Progress</div>
                                    <span style={{
                                        fontSize: 24,
                                        fontWeight: 800,
                                        color: progressColor,
                                    }}>
                                        {progressPct.toFixed(0)}%
                                    </span>
                                </div>

                                {/* Big progress bar */}
                                <div style={{ height: 12, borderRadius: 12, background: isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6", overflow: "hidden", marginBottom: 20 }}>
                                    <div style={{
                                        height: "100%",
                                        width: `${progressPct}%`,
                                        borderRadius: 12,
                                        background: progressPct >= 100 ? "#16a34a" : totalMissing > 0 ? "#ef4444" : "#f59e0b",
                                        transition: "width 0.5s ease",
                                    }} />
                                </div>

                                {/* Stat pills */}
                                <div className="flex flex-wrap" style={{ gap: 14 }}>
                                    <StatCard label="Expected Units" value={totalExpected} sub="Total units expected" isDark={isDark} />
                                    <StatCard label="Received Units" value={totalReceived} color="#16a34a" sub="Total units received" isDark={isDark} />
                                    {isOver && (
                                        <StatCard
                                            label="Over Received"
                                            value={`+${totalOver}`}
                                            color="#a78bfa"
                                            sub="Extra units received"
                                            isDark={isDark}
                                        />
                                    )}
                                    {!isOver && isMissing && (
                                        <StatCard
                                            label={isClosed ? "Missing Units" : "In Progress"}
                                            value={isClosed ? totalMissing : `${totalReceived} / ${totalExpected}`}
                                            color={isClosed ? "#ef4444" : isDark ? "#60a5fa" : "#0369a1"}
                                            sub={isClosed ? "Units not yet received" : "Receiving in progress"}
                                            isDark={isDark}
                                        />
                                    )}
                                    {!isOver && !isMissing && (
                                        <StatCard
                                            label="Fully Received"
                                            value="✓"
                                            color="#16a34a"
                                            sub="All units accounted for"
                                            isDark={isDark}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* ── ROW 3: CONTENTS TABLE ─────────────────────────── */}
                            <div style={{ ...getCardStyle(), padding: 0, overflow: "hidden" }}>
                                {/* Table header */}
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "16px 20px",
                                    borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(2, 70, 139, 0.08)",
                                    background: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(2, 70, 139, 0.02)",
                                }}>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.92)" : "#1e293b", fontFamily: "'Outfit', sans-serif" }}>Shipment Contents</div>
                                        <div style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.5)" : "#64748b", marginTop: 3 }}>
                                            Track all shipped and received inventory units
                                        </div>
                                    </div>
                                    <span style={{
                                        padding: "4px 14px",
                                        borderRadius: 20,
                                        background: isDark ? "rgba(29, 78, 216, 0.15)" : "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                                        border: isDark ? "1px solid rgba(29, 78, 216, 0.3)" : "1px solid rgba(29, 78, 216, 0.12)",
                                        color: isDark ? "#60a5fa" : "#1d4ed8",
                                        fontSize: 12,
                                        fontWeight: 700,
                                    }}>
                                        {details?.items?.length || 0} SKUs
                                    </span>
                                </div>

                                <AgTable ref={gridRef}
                                    tableId="shipment-details-table"
                                    height={"25vh"}
                                    rowData={details?.items || []}
                                    columnDefs={columns}
                                    showPagination={false}
                                    suppressPaginationPanel={true}
                                />
                            </div>

                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const cardHeading = {
    fontSize: 13,
    fontWeight: 700,
    color: "#1A9FD4",
    marginBottom: 16,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
};

export default ShipmentDetailsModal;