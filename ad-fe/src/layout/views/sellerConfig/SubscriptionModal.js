import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Toast from "../../../common/helper/toast/Toast";
import { ApiManageSubscribeAMS } from "../../../api-wrapper/ApiAdsConfig";

const DATASET_GROUPS = [
    {
        groupKey: "sp",
        label: "Sponsored Products",
        abbr: "SP",
        color: "#3b82f6",
        bg: "rgba(59, 130, 246, 0.12)",
        border: "rgba(59, 130, 246, 0.3)",
        icon: "🛍️",
        datasets: [
            { key: "sp-traffic", label: "Traffic" },
            { key: "sp-conversion", label: "Conversion" },
        ],
    },
    {
        groupKey: "sb",
        label: "Sponsored Brands",
        abbr: "SB",
        color: "#8b5cf6",
        bg: "rgba(139, 92, 246, 0.12)",
        border: "rgba(139, 92, 246, 0.3)",
        icon: "🏷️",
        datasets: [
            { key: "sb-traffic", label: "Traffic" },
            { key: "sb-conversion", label: "Conversion" },
        ],
    },
    {
        groupKey: "sd",
        label: "Sponsored Display",
        abbr: "SD",
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.12)",
        border: "rgba(16, 185, 129, 0.3)",
        icon: "📊",
        datasets: [
            { key: "sd-traffic", label: "Traffic" },
            { key: "sd-conversion", label: "Conversion" },
        ],
    },
    {
        groupKey: "cm",
        label: "Campaign Management",
        abbr: "CM",
        color: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.12)",
        border: "rgba(245, 158, 11, 0.3)",
        icon: "📋",
        datasets: [
            { key: "ads-campaign-management-campaigns", label: "Campaigns" },
            { key: "ads-campaign-management-adgroups", label: "Ad Groups" },
            { key: "ads-campaign-management-targets", label: "Targets" },
        ],
    },
];

const CheckIcon = ({ color = "#fff" }) => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 6l3 3 5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const SubscriptionModal = ({ show, onHide, rowData, refreshGrid }) => {
    const { t } = useTranslation();
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (show && Array.isArray(rowData?.amsSubscription)) {
            setSelected(rowData.amsSubscription.map((s) => s?.dataset));
        }
    }, [show, rowData]);

    const toggle = (key) => {
        if (loading) return;
        setSelected((prev) => prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]);
    };

    const toggleGroup = (datasets) => {
        if (loading) return;
        const keys = datasets.map((d) => d.key);
        const allSelected = keys.every((k) => selected.includes(k));
        setSelected((prev) =>
            allSelected ? prev.filter((k) => !keys.includes(k)) : [...new Set([...prev, ...keys])]
        );
    };

    const getGroupState = (datasets) => {
        const keys = datasets.map((d) => d.key);
        const count = keys.filter((k) => selected.includes(k)).length;
        if (count === 0) return "none";
        if (count === keys.length) return "all";
        return "partial";
    };

    const handleSubmit = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await ApiManageSubscribeAMS({
                profileId: rowData?.profileId,
                configId: rowData?.configId?._id || rowData?.configId,
                datasets: selected,
            });
            if (res?.isSuccess) {
                Toast.success(t("Subscription updated successfully"));
                refreshGrid();
                onHide();
                return;
            }
            if (res?.partialSuccess) {
                Toast.warn(t("Partial success: {{count}} dataset(s) failed", { count: res.result.failed.length }));
                refreshGrid();
                onHide();
                return;
            }
            Toast.error(res?.message || t("Failed to manage subscription"));
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    const totalSelected = selected.length;

    return (
        <Dialog open={Boolean(show)} onOpenChange={(isOpen) => { if (!isOpen && !loading) onHide(); }}>
            <DialogContent
                className="sm:max-w-[600px] premium-modal modal-content sub-modal p-0 flex flex-col max-h-[90vh] overflow-hidden bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white"
                onInteractOutside={(e) => { if (loading) e.preventDefault(); }}
                onEscapeKeyDown={(e) => { if (loading) e.preventDefault(); }}
            >
                <div id="ams-subscription" className="flex flex-col flex-1 overflow-hidden relative">
                    <DialogHeader className="modal-header border-b-0 p-4 pb-0 shrink-0">
                        <DialogTitle className="modal-title text-base font-medium">{t("Manage Subscriptions")}</DialogTitle>
                    </DialogHeader>

                    {/* Loading Overlay */}
                    {loading && (
                        <div className="absolute inset-0 bg-white/80 dark:bg-[#0f172a]/85 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center gap-3">
                            <div className="w-10 h-10 border-3 border-blue-500/25 border-t-blue-500 rounded-full animate-spin" />
                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {t("Saving...")}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                {t("Connecting to Amazon Marketing Stream...")}
                            </div>
                        </div>
                    )}

                    <div className="modal-body overflow-y-auto p-4 flex-1">
                        {/* Summary bar */}
                        <div className="summary-bar">
                            <span className="summary-count">{totalSelected}</span>
                            <span>{totalSelected !== 1 ? t("datasets selected") : t("dataset selected")}</span>
                            {totalSelected > 0 && (
                                <button
                                    disabled={loading}
                                    onClick={() => !loading && setSelected([])}
                                    style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef4444", fontSize: "0.78rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.5 : 1 }}
                                >
                                    {t("Clear all")}
                                </button>
                            )}
                        </div>

                        {/* Common */}
                        <div className="section-label">{t("Common")}</div>
                        <div
                            className={`common-pill${selected.includes("budget-usage") ? " active" : ""}${loading ? " opacity-60 cursor-not-allowed" : ""}`}
                            onClick={() => toggle("budget-usage")}
                        >
                            <div className="common-badge">💰</div>
                            <div className="common-info">
                                <div className="common-name">{t("Budget Usage")}</div>
                                <div className="common-sub">{t("Applies across all campaign types")}</div>
                            </div>
                            <div className="custom-check">
                                <CheckIcon />
                            </div>
                        </div>

                        {/* Groups */}
                        <div className="section-label" style={{ marginTop: 4 }}>{t("Campaign Types")}</div>
                        {DATASET_GROUPS.map((group) => {
                            const state = getGroupState(group.datasets);
                            const isAll = state === "all";
                            const isPartial = state === "partial";

                            return (
                                <div
                                    key={group.groupKey}
                                    className={`group-card${isPartial ? " partial" : ""}${loading ? " opacity-60 pointer-events-none" : ""}`}
                                    style={isAll || isPartial ? { borderColor: group.color, boxShadow: `0 2px 12px ${group.color}22` } : {}}
                                >
                                    <div className="group-header" onClick={() => toggleGroup(group.datasets)}>
                                        <div className="group-icon-wrap" style={{ background: group.bg }}>
                                            {group.icon}
                                        </div>
                                        <div className="group-label-wrap">
                                            <div className="group-label">{t(group.label)}</div>
                                            <div className="group-count">
                                                {group.datasets.filter((d) => selected.includes(d.key)).length} / {group.datasets.length} {t("selected")}
                                            </div>
                                        </div>
                                        <div
                                            className={`group-toggle-check${isPartial ? " indeterminate" : ""}${isAll ? " checked" : ""}`}
                                            style={isAll ? { background: group.color, borderColor: group.color } : isPartial ? { borderColor: group.color } : {}}
                                        >
                                            {isAll && <CheckIcon />}
                                        </div>
                                    </div>

                                    {/* Chips */}
                                    <div className="chips-row">
                                        {group.datasets.map((d) => {
                                            const isActive = selected.includes(d.key);
                                            return (
                                                <div
                                                    key={d.key}
                                                    className={`chip ${isActive ? "chip-active" : "chip-inactive"}`}
                                                    style={isActive ? { borderColor: group.color, background: group.bg, color: group.color } : {}}
                                                    onClick={(e) => { e.stopPropagation(); toggle(d.key); }}
                                                >
                                                    <span className="chip-dot" style={isActive ? { background: group.color } : {}} />
                                                    {t(d.label)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="cm-footer p-4 flex justify-end shrink-0 border-t border-slate-200 dark:border-white/10">
                        <div className="flex" style={{ gap: 10 }}>
                            <Button
                                variant="outline"
                                disabled={loading}
                                className="customize-button h-[36px] !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800 px-4 font-medium rounded-md shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={onHide}
                            >
                                {t("Cancel")}
                            </Button>
                            <Button
                                disabled={loading}
                                className="h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 whitespace-nowrap px-4 font-semibold shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed min-w-[150px]"
                                onClick={handleSubmit}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>{t("Saving...")}</span>
                                    </>
                                ) : (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                            <path d="M2 7l4 4 6-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span>{t("Save Subscription")}</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SubscriptionModal;