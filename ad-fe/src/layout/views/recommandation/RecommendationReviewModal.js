import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "../../../components/ui/dialog";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { FiCheckCircle, FiClock, FiTrash2, FiSearch, FiAlertTriangle, FiX, FiLayers, FiArrowRight, FiArrowLeft, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import moment from "moment-timezone";

const getRelativeDaysText = (dateStr) => {
    if (!dateStr) return { text: "No History", days: 999 };
    const dateMoment = moment(dateStr);
    const now = moment();
    const daysDiff = now.diff(dateMoment.clone().startOf("day"), "days");

    if (daysDiff <= 0) {
        return { text: "Today", days: 0 };
    } else if (daysDiff === 1) {
        return { text: "1 day ago", days: 1 };
    } else {
        return { text: `${daysDiff} days ago`, days: daysDiff };
    }
};

const getTargetHistoryKey = (cid, targeting, matchType) => {
    if (!cid || !targeting) return null;
    const cleanCid = String(cid);
    const cleanTarget = String(targeting).toLowerCase().trim();
    const isAuto =
        ["close-match", "loose-match", "complements", "substitutes", "similar-product", "(_targeting_auto_)"].includes(cleanTarget) ||
        String(matchType || "").toUpperCase().includes("PREDEFINED") ||
        String(matchType || "").toUpperCase().startsWith("AUTOMATIC");

    if (!isAuto && matchType) {
        const cleanMatch = String(matchType).toLowerCase().replace(/^(keyword|automatic|targeting)\s*[-:]\s*/i, "").trim();
        return `${cleanCid}_${cleanTarget}_${cleanMatch}`;
    }
    return `${cleanCid}_${cleanTarget}`;
};

const getPlacementHistoryKey = (cid, placement) => {
    if (!cid || !placement) return null;
    const cleanCid = String(cid);
    let normPlacement = String(placement).toLowerCase().trim();
    if (normPlacement.includes("top of search")) normPlacement = "top_of_search";
    else if (normPlacement.includes("product page")) normPlacement = "product_pages";
    else if (normPlacement.includes("rest of search")) normPlacement = "rest_of_search";
    else normPlacement = normPlacement.replace(/\s+/g, "_");
    return `${cleanCid}_placement_${normPlacement}`;
};

const ACTION_LABEL_MAP = {
    SetBudget: "Set Budget",
    IncreaseBudget: "Increase Budget",
    DecreaseBudget: "Decrease Budget",
    CampaignEnable: "Enable Campaign",
    CampaignPause: "Pause Campaign",
    IncreaseBid: "Increase Bid",
    DecreaseBid: "Decrease Bid",
    SetBid: "Set Bid",
    EnableTargeting: "Enable Targeting",
    PauseTargeting: "Pause Targeting",
    AddAsTargeting: "Add as Targeting",
    AddAsNegativeTargeting: "Add as Negative Targeting",
};

const formatActionDisplay = (action, gridName) => {
    const label = ACTION_LABEL_MAP[action.actionName] || action.actionName;
    let actionText = label;

    if (gridName === "Placement" && action.placementType) {
        actionText = `${label} (${action.placementType})`;
    }

    if (action.actionValue && action.actionValueType) {
        const symbol = action.actionValueType === "Percentage" ? "%" : "";
        actionText = `${actionText} ${action.actionValue}${symbol}`;
    }

    if (gridName === "Search Term" && action.matchType) {
        actionText = `${actionText} - ${action.matchType}`;
    }

    return actionText;
};

const calculateProposedValue = (item, actions, gridName) => {
    if (gridName === "Campaign") {
        const curr = parseFloat(item?.budget || 0);
        const action = actions.find((a) => ['SetBudget', 'IncreaseBudget', 'DecreaseBudget'].includes(a.actionName));
        if (!action) return { currentText: CurrencyCode(curr), newText: CurrencyCode(curr), isDiff: false };

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBudget") next = curr + diff;
        if (action.actionName === "DecreaseBudget") next = Math.max(1, curr - diff);
        if (action.actionName === "SetBudget") next = actionVal;

        return {
            currentText: CurrencyCode(curr),
            newText: CurrencyCode(next),
            isDiff: next !== curr,
            isIncrease: next > curr,
        };
    }

    if (gridName === "Placement") {
        const curr = parseFloat(item?.placementBid || item?.bid || 0);
        const action = actions.find((a) => a.placementType === item?.placement || (!a.placementType && ['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(a.actionName)));
        const isPercentage = action?.actionValueType === "Percentage" || typeof item?.placementBid === "number";

        if (!action) {
            return {
                currentText: isPercentage ? `${curr.toFixed(0)}%` : CurrencyCode(curr),
                newText: isPercentage ? `${curr.toFixed(0)}%` : CurrencyCode(curr),
                isDiff: false,
            };
        }

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBid") next = curr + diff;
        if (action.actionName === "DecreaseBid") next = Math.max(0, curr - diff);
        if (action.actionName === "SetBid") next = actionVal;

        return {
            currentText: isPercentage ? `${curr.toFixed(0)}%` : CurrencyCode(curr),
            newText: isPercentage ? `${next.toFixed(0)}%` : CurrencyCode(next),
            isDiff: next !== curr,
            isIncrease: next > curr,
        };
    }

    if (gridName === "Targeting") {
        const curr = parseFloat(item?.targetingBid || item?.keywordBid || item?.bid || 0);
        const action = actions.find((a) => ['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(a.actionName));
        if (!action) return { currentText: CurrencyCode(curr), newText: CurrencyCode(curr), isDiff: false };

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBid") next = curr + diff;
        if (action.actionName === "DecreaseBid") next = Math.max(0.02, curr - diff);
        if (action.actionName === "SetBid") next = actionVal;

        return {
            currentText: CurrencyCode(curr),
            newText: CurrencyCode(next),
            isDiff: next !== curr,
            isIncrease: next > curr,
        };
    }

    if (gridName === "Search Term") {
        const action = actions.find((a) => ['AddAsTargeting', 'AddAsNegativeTargeting'].includes(a.actionName));
        const matchType = action?.matchType || "Exact";
        const isNeg = action?.actionName === "AddAsNegativeTargeting";
        return {
            currentText: "Search Term",
            newText: `${isNeg ? "Negative Target" : "Target"} (${matchType})`,
            isDiff: true,
            isIncrease: !isNeg,
        };
    }

    return { currentText: "—", newText: "—", isDiff: false };
};

const RecommendationReviewModal = ({
    show,
    onHide,
    rule,
    actions = [],
    gridName = "Campaign",
    selectedItems = [],
    onRemoveItem,
    onConfirmApply,
    applyLoading = false,
    latestHistoryMap = {},
    filterType = "all",
    filterDays = 7,
    getRowId,
}) => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    const filteredReviewItems = useMemo(() => {
        if (!searchQuery.trim()) return selectedItems;
        const query = searchQuery.toLowerCase().trim();
        return selectedItems.filter((item) => {
            const name = item.campaignName || item.name || "";
            const cid = item.campaignId || item.campaignID || "";
            const sub = item.adGroupName || item.targeting || item.searchTerm || "";
            return (
                name.toLowerCase().includes(query) ||
                String(cid).toLowerCase().includes(query) ||
                sub.toLowerCase().includes(query)
            );
        });
    }, [selectedItems, searchQuery]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedItems.length]);

    const totalPages = Math.max(1, Math.ceil(filteredReviewItems.length / pageSize));
    const paginatedReviewItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredReviewItems.slice(start, start + pageSize);
    }, [filteredReviewItems, currentPage, pageSize]);

    const getFilterBadgeText = () => {
        if (filterType === "less_than_one") return t("Filtered: Data Less Than 1");
        if (filterType === "unchanged") return t("Filtered: Unchanged Campaigns (No Prior Changes)");
        if (filterType === "before_days") return t("Filtered: Changed Before {{days}} Days", { days: filterDays });
        if (filterType === "exact_days") return t("Filtered: Changed Exactly {{days}} Days Ago", { days: filterDays });
        return t("All Campaigns Selected");
    };

    return (
        <Dialog open={show} onOpenChange={(open) => !open && !applyLoading && onHide()}>
            <DialogContent
                hideCloseButton={true}
                className="max-w-[960px] w-[95vw] p-0 rounded-[24px] bg-white text-slate-900 border border-slate-200/90 shadow-[0_25px_60px_rgba(0,0,0,0.15)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.7)] overflow-hidden dark:text-white flex flex-col max-h-[88vh] font-sans"
                onInteractOutside={(e) => {
                    if (applyLoading) e.preventDefault();
                }}
            >
                {/* Circuit top glow line indicator */}
                <div
                    className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #2374F2 25%, #3ECFA8 60%, #7c64ff 80%, transparent 100%)",
                        opacity: 0.9,
                    }}
                />

                {/* ── Modal Header ── */}
                <div className="p-6 pb-4 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 dark:bg-sky-500/20 text-[#1A9FD4] dark:text-[#38bdf8] border border-sky-500/20 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <FiLayers size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight mb-0.5">
                                    {t("Review Recommendation Changes")}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0">
                                    {t("Rule:")} <span className="font-semibold text-slate-700 dark:text-slate-200">{rule?.ruleName || "Recommendation"}</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 px-3 py-1 rounded-full text-xs font-bold tracking-wide shadow-sm">
                                {selectedItems.length} {gridName === "Targeting" ? (selectedItems.length === 1 ? t("Target Selected") : t("Targets Selected")) : gridName === "Placement" ? (selectedItems.length === 1 ? t("Placement Selected") : t("Placements Selected")) : gridName === "Search Term" ? (selectedItems.length === 1 ? t("Search Term Selected") : t("Search Terms Selected")) : (selectedItems.length === 1 ? t("Campaign Selected") : t("Campaigns Selected"))}
                            </span>
                            <button
                                type="button"
                                onClick={onHide}
                                disabled={applyLoading}
                                className="w-8 h-8 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer disabled:opacity-50"
                                title={t("Close")}
                            >
                                <FiX size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Summary bar */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/50 dark:border-white/5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t("Action to Apply:")}
                            </span>
                            {actions.map((act, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/10 text-sky-600 dark:text-[#38bdf8] border border-sky-500/20"
                                >
                                    <FiCheckCircle size={11} />
                                    {formatActionDisplay(act, gridName)}
                                </span>
                            ))}

                            {filterType !== "all" && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                                    {getFilterBadgeText()}
                                </span>
                            )}
                        </div>

                        {/* Search inside review items */}
                        <div className="relative w-full sm:w-[220px]">
                            <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t("Search campaigns...")}
                                className="w-full h-[32px] pl-8 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                        </div>
                    </div>
                </div>

                {/* ── Modal Body: Selected Campaigns Table ── */}
                <div className="flex-1 overflow-y-auto p-6 max-h-[50vh]">
                    {applyLoading && (
                        <div className="mb-4 p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 flex items-center justify-between gap-3 text-xs text-sky-800 dark:text-sky-200 shadow-sm animate-pulse">
                            <div className="flex items-center gap-2.5">
                                <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                <span className="font-semibold">{t("Applying recommendation changes in bulk to Amazon Ads...")}</span>
                            </div>
                            <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-300 border border-sky-500/20">
                                {t("{{count}} total items", { count: selectedItems.length })}
                            </span>
                        </div>
                    )}

                    {selectedItems.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center">
                            <FiAlertTriangle size={36} className="text-amber-500 mb-2 opacity-80" />
                            <span className="font-semibold text-sm">{t("No campaigns currently selected.")}</span>
                            <span className="text-xs text-slate-400 mt-1">{t("Please close this review and select at least one campaign.")}</span>
                        </div>
                    ) : filteredReviewItems.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 dark:text-slate-500">
                            <span className="text-sm">{t("No selected campaigns match your search.")}</span>
                        </div>
                    ) : (
                        <>
                        <div className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-[#0f172a]/60">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-white/[0.04] border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                                        <th className="py-3 px-3 w-[65px] text-center">Tag</th>
                                        <th className="py-3 px-4">{t("Campaign Name")}</th>
                                        <th className="py-3 px-3 w-[110px]">{t("Status")}</th>
                                        <th className="py-3 px-4">{t("Proposed Adjustment")}</th>
                                        <th className="py-3 px-3 w-[140px] text-center">{t("Last Change")}</th>
                                        <th className="py-3 px-3 w-[50px] text-center">{t("Action")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {paginatedReviewItems.map((item, idx) => {
                                        const cid = item?.campaignId || item?.campaignID || item?.campaign_id;
                                        const cname = item?.campaignName || item?.name || `Campaign #${cid}`;
                                        const isNew = Boolean(item?.isNew);
                                        const status = item?.campaignStatus || item?.status || "ENABLED";
                                        const isEnabled = String(status).toUpperCase() === "ENABLED";
                                        const targeting = item?.targeting || item?.keywordText || item?.keyword || item?.targetName || item?.searchTerm;
                                        const matchType = item?.matchType || item?.targetType;
                                        let historyInfo = null;
                                        if (gridName === "Placement" || item?.placement) {
                                            if (item?.placement) {
                                                const pKey = getPlacementHistoryKey(cid, item.placement);
                                                historyInfo = latestHistoryMap[pKey] || null;
                                            }
                                            if (!historyInfo) {
                                                historyInfo = latestHistoryMap[`${cid}_placement`] || null;
                                            }
                                        } else if (targeting) {
                                            const rawTargetId = item?.targetId || item?._id?.targetId;
                                            const cleanTId = rawTargetId ? String(rawTargetId).replace(/^[TK]-/, "").trim() : "";
                                            if (cleanTId && latestHistoryMap[`${cid}_id_${cleanTId}`]) {
                                                historyInfo = latestHistoryMap[`${cid}_id_${cleanTId}`];
                                            } else {
                                                const matchKey = getTargetHistoryKey(cid, targeting, matchType);
                                                if (matchKey && latestHistoryMap[matchKey]) {
                                                    historyInfo = latestHistoryMap[matchKey];
                                                }
                                                if (!historyInfo) {
                                                    const targetKey = `${cid}_${String(targeting).toLowerCase().trim()}`;
                                                    historyInfo = latestHistoryMap[targetKey] || null;
                                                }
                                            }
                                        } else {
                                            historyInfo = latestHistoryMap[String(cid)] || latestHistoryMap[Number(cid)] || null;
                                        }
                                        const latestDate = historyInfo?.latestCreatedAt;
                                        const relative = getRelativeDaysText(latestDate);
                                        const prop = calculateProposedValue(item, actions, gridName);

                                        return (
                                            <tr
                                                key={getRowId ? getRowId(item) : `${cid}-${idx}`}
                                                className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
                                            >
                                                {/* Tag */}
                                                <td className="py-3 px-3 text-center">
                                                    <span
                                                        style={{
                                                            background: isNew ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
                                                            color: isNew ? "#22c55e" : "#94a3b8",
                                                            border: `1px solid ${isNew ? "rgba(34, 197, 94, 0.35)" : "rgba(148, 163, 184, 0.3)"}`,
                                                            padding: "2px 7px",
                                                            borderRadius: 20,
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            display: "inline-block",
                                                        }}
                                                    >
                                                        {isNew ? "NEW" : "OLD"}
                                                    </span>
                                                </td>

                                                {/* Campaign Name */}
                                                <td className="py-3 px-4">
                                                    <div className="font-semibold text-slate-800 dark:text-slate-100 max-w-[280px] truncate" title={cname}>
                                                        {cname}
                                                    </div>
                                                    {item?.adGroupName && (
                                                        <div className="text-[10px] text-slate-400 truncate max-w-[280px]">
                                                            {item.adGroupName}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Status */}
                                                <td className="py-3 px-3">
                                                    <span
                                                        style={{
                                                            background: isEnabled ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                                                            color: isEnabled ? "#22c55e" : "#ef4444",
                                                            border: `1px solid ${isEnabled ? "rgba(34, 197, 94, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                                                            padding: "1px 7px",
                                                            borderRadius: 14,
                                                            fontSize: 10,
                                                            fontWeight: 600,
                                                            display: "inline-block",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {isEnabled ? "Enabled" : "Paused"}
                                                    </span>
                                                </td>

                                                {/* Proposed Adjustment */}
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-1.5 font-medium">
                                                        <span className="text-slate-600 dark:text-slate-300 font-semibold">{prop.currentText}</span>
                                                        <span className="text-slate-400 dark:text-slate-500 font-bold">→</span>
                                                        <span
                                                            className={`font-bold border px-1.5 py-0.5 rounded text-[11px] ${prop.isIncrease
                                                                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                                                    : "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20"
                                                                }`}
                                                        >
                                                            {prop.newText}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Last Change History */}
                                                <td className="py-3 px-3 text-center">
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${!latestDate
                                                                ? "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10"
                                                                : relative.days <= 3
                                                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
                                                                    : "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200 dark:border-sky-800/60"
                                                            }`}
                                                    >
                                                        <FiClock size={10} className="opacity-70 flex-shrink-0" />
                                                        <span>{relative.text}</span>
                                                    </span>
                                                </td>

                                                {/* Exclude / Remove Button */}
                                                <td className="py-3 px-3 text-center">
                                                    {onRemoveItem && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onRemoveItem(item)}
                                                            title={t("Exclude this campaign from apply batch")}
                                                            disabled={applyLoading}
                                                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-40"
                                                        >
                                                            <FiTrash2 size={13} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {filteredReviewItems.length > pageSize && (
                            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 px-1">
                                <div>
                                    {t("Showing")} <span className="font-semibold text-slate-700 dark:text-slate-200">{(currentPage - 1) * pageSize + 1}</span>–<span className="font-semibold text-slate-700 dark:text-slate-200">{Math.min(currentPage * pageSize, filteredReviewItems.length)}</span> {t("of")} <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredReviewItems.length}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage <= 1 || applyLoading}
                                        className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-medium transition-colors"
                                    >
                                        <FiChevronLeft size={13} />
                                        <span>{t("Prev")}</span>
                                    </button>
                                    <span className="px-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                        {t("Page {{current}} of {{total}}", { current: currentPage, total: totalPages })}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages || applyLoading}
                                        className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-medium transition-colors"
                                    >
                                        <span>{t("Next")}</span>
                                        <FiChevronRight size={13} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                    )}
                </div>

                {/* ── Modal Footer ── */}
                <div className="p-5 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-4">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        {t("Ready to execute adjustments on")}{" "}
                        <span className="font-bold text-slate-800 dark:text-white">
                            {selectedItems.length} {gridName === "Targeting" ? (selectedItems.length === 1 ? t("target") : t("targets")) : gridName === "Placement" ? (selectedItems.length === 1 ? t("placement") : t("placements")) : gridName === "Search Term" ? (selectedItems.length === 1 ? t("search term") : t("search terms")) : (selectedItems.length === 1 ? t("campaign") : t("campaigns"))}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onHide}
                            disabled={applyLoading}
                            className="inline-flex items-center justify-center gap-1.5 h-[38px] px-5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white disabled:opacity-50 active:scale-[0.98] whitespace-nowrap cursor-pointer shadow-sm"
                        >
                            <FiArrowLeft size={13} className="opacity-80" />
                            <span>{t("Back")}</span>
                        </button>

                        <button
                            type="button"
                            id="review-modal-apply"
                            onClick={onConfirmApply}
                            disabled={selectedItems.length === 0 || applyLoading}
                            className="inline-flex items-center justify-center gap-2 h-[38px] px-5 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.98] transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer border-0"
                        >
                            {applyLoading ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
                                    <span>{t("Applying...")}</span>
                                </>
                            ) : (
                                <>
                                    <FiCheckCircle size={14} className="flex-shrink-0" />
                                    <span>{t("Apply")}</span>
                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white leading-none">
                                        {selectedItems.length}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default RecommendationReviewModal;
