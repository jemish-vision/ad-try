import React from "react";
import { useTranslation } from "react-i18next";
import moment from "moment-timezone";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "../../../components/ui/dialog";

// ─── Keys to hide from the modal entirely ───────────────────────────────────
const SKIP_KEYS = [
    "id",
    "_id",
    "campaignId",
    "adGroupId",
    "placementId",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const isDateString = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);

const formatKey = (key) =>
    key
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim();

// Skip null / undefined / empty string / empty array / empty object
const isEmpty = (v) => {
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) return true;
    return false;
};

const filterEntries = (entries) => entries.filter(([k, v]) => !isEmpty(v) && !SKIP_KEYS.includes(k));

// ─── Primitive chip ──────────────────────────────────────────────────────────

const PrimitiveChip = ({ value, isDark }) => {
    if (typeof value === "boolean") {
        return (
            <span style={{
                display: "inline-block", fontSize: "11px", fontWeight: 600,
                padding: "2px 10px", borderRadius: "20px",
                background: value ? (isDark ? "rgba(16, 185, 129, 0.15)" : "#d1fae5") : (isDark ? "rgba(239, 68, 68, 0.15)" : "#fee2e2"),
                color: value ? (isDark ? "#34d399" : "#065f46") : (isDark ? "#f87171" : "#991b1b"),
                border: `1px solid ${value ? (isDark ? "rgba(16, 185, 129, 0.3)" : "#6ee7b7") : (isDark ? "rgba(239, 68, 68, 0.3)" : "#fca5a5")}`,
            }}>
                {value ? "true" : "false"}
            </span>
        );
    }
    if (typeof value === "number") {
        return (
            <span style={{
                fontFamily: "monospace", fontSize: "13px",
                background: isDark ? "#0f172a" : "#f3f4f6", padding: "1px 7px",
                borderRadius: "4px", color: isDark ? "#60a5fa" : "#1d4ed8",
                border: isDark ? "1px solid #334155" : "1px solid #e5e7eb",
            }}>
                {value}
            </span>
        );
    }
    if (isDateString(value)) {
        return (
            <span style={{ fontSize: "13px", color: isDark ? "#e2e8f0" : "#374151" }}>
                {moment(value).format("MMM DD, YYYY hh:mm:ss A")}
            </span>
        );
    }
    return <span style={{ fontSize: "13px", color: isDark ? "#f8fafc" : "#111827", wordBreak: "break-word" }}>{String(value)}</span>;
};

// ─── Array of primitives → pill list ────────────────────────────────────────

const PillList = ({ items, isDark }) => (
    <div className="flex flex-wrap" style={{ gap: "5px" }}>
        {items.map((item, i) => (
            <span key={i} style={{
                fontSize: "11px", fontWeight: 500, padding: "3px 10px",
                borderRadius: "20px",
                background: isDark ? "rgba(26, 159, 212, 0.15)" : "#deeaff",
                color: "#1A9FD4",
                border: isDark ? "1px solid rgba(26, 159, 212, 0.3)" : "1px solid #b8d0f7",
            }}>
                {String(item)}
            </span>
        ))}
    </div>
);

// ─── Object card (nested) ────────────────────────────────────────────────────

const ObjectCard = ({ data, depth = 0, isDark }) => {
    // Apply SKIP_KEYS filter recursively inside nested objects too
    const entries = filterEntries(Object.entries(data));
    if (entries.length === 0) return null;
    return (
        <div style={{
            background: depth === 0 ? (isDark ? "#1e293b" : "#f9fafb") : (isDark ? "#0f172a" : "#f3f4f6"),
            border: isDark ? "1px solid #334155" : "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "10px 14px",
            marginTop: "2px",
        }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <tbody>
                    {entries.map(([k, v]) => (
                        <tr key={k} style={{ borderBottom: isDark ? "1px solid #334155" : "1px solid #f3f4f6" }}>
                            <td style={{
                                color: isDark ? "#94a3b8" : "#6b7280", fontWeight: 600,
                                padding: "6px 12px 6px 0",
                                width: "35%", verticalAlign: "top",
                                whiteSpace: "nowrap", fontSize: "12px",
                            }}>
                                {formatKey(k)}
                            </td>
                            <td style={{ padding: "6px 0", verticalAlign: "top" }}>
                                <RenderValue value={v} depth={depth + 1} isDark={isDark} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ─── Array of objects → accordion cards ─────────────────────────────────────

const ObjectArrayCards = ({ items, depth, isDark }) => {
    const { t } = useTranslation();
    return (
    <div className="flex flex-col" style={{ gap: "6px", marginTop: "4px" }}>
        {items.map((item, i) => (
            <div key={i} style={{
                border: isDark ? "1px solid #334155" : "1px solid #e5e7eb", borderRadius: "8px",
                overflow: "hidden",
            }}>
                <div style={{
                    background: isDark ? "#172554" : "#f0f4ff", padding: "5px 12px",
                    fontSize: "11px", fontWeight: 600, color: "#1A9FD4",
                    borderBottom: isDark ? "1px solid #1e3a8a" : "1px solid #dde8ff",
                    display: "flex", alignItems: "center", gap: "6px",
                }}>
                    <span style={{
                        background: "#1A9FD4", color: "#fff",
                        borderRadius: "50%", width: "16px", height: "16px",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: "10px", fontWeight: 700, flexShrink: 0,
                    }}>{i + 1}</span>
                    {t("Item {{number}}", { number: i + 1 })}
                </div>
                <div style={{ padding: "8px 12px", background: isDark ? "#0f172a" : "#fff" }}>
                    {typeof item === "object" && item !== null ? (
                        <ObjectCard data={item} depth={depth} isDark={isDark} />
                    ) : (
                        <PrimitiveChip value={item} isDark={isDark} />
                    )}
                </div>
            </div>
        ))}
    </div>
    );
};

// ─── Main recursive renderer ─────────────────────────────────────────────────

const RenderValue = ({ value, depth = 0, isDark }) => {
    if (isEmpty(value)) return null;

    if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
        return <PrimitiveChip value={value} isDark={isDark} />;
    }

    if (Array.isArray(value)) {
        const allPrimitive = value.every((v) => typeof v !== "object" || v === null);
        if (allPrimitive) return <PillList items={value} isDark={isDark} />;
        return <ObjectArrayCards items={value} depth={depth + 1} isDark={isDark} />;
    }

    if (typeof value === "object") {
        return <ObjectCard data={value} depth={depth} isDark={isDark} />;
    }

    return <span style={{ fontSize: "13px", color: isDark ? "#f8fafc" : "#111827" }}>{String(value)}</span>;
};

// ─── Section component ───────────────────────────────────────────────────────

const SectionLabel = ({ icon, label, count, isDark }) => {
    const { t } = useTranslation();
    return (
    <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        marginBottom: "12px",
    }}>
        <div style={{
            width: "28px", height: "28px", borderRadius: "7px",
            background: isDark ? "#172554" : "#f0f4ff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px",
        }}>
            {icon}
        </div>
        <span style={{ fontSize: "12px", fontWeight: 700, color: isDark ? "#f8fafc" : "#374151", textTransform: "uppercase", letterSpacing: "0.7px" }}>
            {label}
        </span>
        {count !== undefined && (
            <span style={{
                marginLeft: "auto", fontSize: "11px", background: isDark ? "#1e293b" : "#f3f4f6",
                color: isDark ? "#94a3b8" : "#6b7280", padding: "1px 7px", borderRadius: "20px",
                border: isDark ? "1px solid #334155" : "1px solid #e5e7eb", fontWeight: 500,
            }}>
                {count} {count === 1 ? t("field") : t("fields")}
            </span>
        )}
    </div>
    );
};

const SectionTable = ({ entries, isDark }) => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <tbody>
            {entries.map(([key, val]) => (
                <tr key={key} style={{ borderBottom: isDark ? "1px solid #334155" : "1px solid #f3f4f6" }}>
                    <td style={{
                        color: isDark ? "#94a3b8" : "#6b7280", fontWeight: 600,
                        padding: "10px 14px 10px 0",
                        width: "30%", verticalAlign: "top",
                        whiteSpace: "nowrap", fontSize: "12px",
                    }}>
                        {formatKey(key)}
                    </td>
                    <td style={{ padding: "10px 0", verticalAlign: "top" }}>
                        <RenderValue value={val} isDark={isDark} />
                    </td>
                </tr>
            ))}
        </tbody>
    </table>
);

// ─── MetadataModal ───────────────────────────────────────────────────────────

function MetadataModal({ show, onHide, event, metadata, extraFields = {}, isDark }) {
    const { t } = useTranslation();
    // Apply SKIP_KEYS filter on top-level sections
    const extraEntries = filterEntries(Object.entries(extraFields));
    const metaEntries = metadata && typeof metadata === "object"
        ? filterEntries(Object.entries(metadata))
        : [];

    const hasExtra = extraEntries.length > 0;
    const hasMetadata = metaEntries.length > 0;
    const hasAnything = hasExtra || hasMetadata;

    return (
        <Dialog open={show} onOpenChange={(open) => { if (!open) onHide(); }}>
            <DialogContent
                staticBackdrop={false}
                className="max-w-2xl flex flex-col overflow-hidden max-h-[85vh] p-0 gap-0"
                style={{
                    backgroundColor: isDark ? "#0f172a" : "#f9fafb",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                }}
            >
                {/* ── Header ── */}
                <DialogHeader
                    className="flex flex-row items-center border-b px-5 py-4 shrink-0"
                    style={{
                        borderBottomColor: isDark ? "#334155" : "#e2e8f0",
                        backgroundColor: isDark ? "#1e293b" : "#fff",
                    }}
                >
                    <div className="flex items-center gap-2">
                        <DialogTitle
                            style={{
                                fontSize: "15px",
                                fontWeight: 600,
                                margin: 0,
                                color: isDark ? "#f8fafc" : "#111827",
                            }}
                        >
                            {t("Event Details")}
                        </DialogTitle>
                        {event && (
                            <span
                                style={{
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    background: isDark ? "rgba(26, 159, 212, 0.15)" : "#deeaff",
                                    color: "#1A9FD4",
                                    borderRadius: "20px",
                                    padding: "3px 10px",
                                    border: isDark ? "1px solid rgba(26, 159, 212, 0.3)" : "1px solid #b8d0f7",
                                }}
                            >
                                {event.replaceAll("_", " ")}
                            </span>
                        )}
                    </div>
                </DialogHeader>

                {/* ── Body ── */}
                <div id="audit-log-modal-body" className="flex-1 overflow-y-auto custom-scroll" style={{ padding: "0 0 16px 0", backgroundColor: isDark ? "#0f172a" : "#f9fafb" }}>
                    {!hasAnything && (
                        <div style={{ padding: "32px 20px", textAlign: "center" }}>
                            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📭</div>
                            <p style={{ color: isDark ? "#64748b" : "#9ca3af", fontSize: "13px", margin: 0 }}>{t("No details available for this event.")}</p>
                        </div>
                    )}

                    {/* General section */}
                    {hasExtra && (
                        <div style={{
                            margin: "16px 20px",
                            background: isDark ? "#1e293b" : "#fff",
                            border: isDark ? "1px solid #334155" : "1px solid #e5e7eb",
                            borderRadius: "10px",
                            padding: "16px 18px",
                        }}>
                            <SectionLabel icon="ℹ️" label={t("General")} count={extraEntries.length} isDark={isDark} />
                            <SectionTable entries={extraEntries} isDark={isDark} />
                        </div>
                    )}

                    {/* Metadata section */}
                    {hasMetadata && (
                        <div style={{
                            margin: hasExtra ? "0 20px 16px" : "16px 20px",
                            background: isDark ? "#1e293b" : "#fff",
                            border: isDark ? "1px solid #334155" : "1px solid #e5e7eb",
                            borderRadius: "10px",
                            padding: "16px 18px",
                        }}>
                            <SectionLabel icon="🗂️" label={t("Metadata")} count={metaEntries.length} isDark={isDark} />
                            <SectionTable entries={metaEntries} isDark={isDark} />
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <DialogFooter
                    className="border-t px-5 py-3"
                    style={{
                        borderTopColor: isDark ? "#334155" : "#e2e8f0",
                        backgroundColor: isDark ? "#1e293b" : "#fff",
                    }}
                >
                    <button
                        id="audit-log-close-btn"
                        onClick={onHide}
                        style={{
                            border: isDark ? "1px solid #334155" : "1px solid #d1d5db",
                            borderRadius: "7px",
                            padding: "7px 22px",
                            fontSize: "13px",
                            fontWeight: 500,
                            background: "transparent",
                            color: isDark ? "#e2e8f0" : "#374151",
                            cursor: "pointer",
                            transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isDark ? "#334155" : "#f9fafb"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                        {t("Close")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default MetadataModal;