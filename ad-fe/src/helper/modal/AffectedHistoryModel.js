import AgTable from "../../common/grid/AgTable";
import { CustomModal } from "./CustomModal";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FiClock, FiList, FiRotateCcw, FiTarget, FiDollarSign, FiSliders, FiSearch, FiZap, FiArrowRight, FiInfo } from "react-icons/fi";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { AppTooltip } from "../../components/ui/AppTooltip";
import { getCurrencySymbol } from "../currencyCode/CurrencyCode";
import { CampaignNameCell } from "../../utility/campaignNavigation";
import { Toast } from "../links/Link";
import { StyledCheckbox } from "../../common/grid/StyledCheckbox";
import { formatRunTime, formatRuleDate } from "../../utility/common";
import { getNormalizedTargetingType } from "../../utility/targetingUtils";

const REVERTABLE_FIELDS = [
    "bidAdjustment", "bid", "state", "budget", "campaignState", "adGroupState",
    "percentage", "bid_modifier", "target_harvested", "searchTermAction", 
    "negativeKeyword", "negativeTargeting", "searchTerm", "dayparting"
];

const formatDecimal = (value) => {
    const num = Number(value);
    if (value === null || value === undefined || value === "") return value;
    if (!isFinite(num)) return value;
    return parseFloat(num.toFixed(2));
};

const safeText = (value) => {
    if (value === null || value === undefined) return "—";
    const str = String(value).trim();
    return str || "—";
};

const getLatestAcos = (row) => {
    if (!row) return null;
    if (row.campaignAcos !== undefined && row.campaignAcos !== null && row.campaignAcos !== "" && row.campaignAcos !== -30 && row.campaignAcos !== "-30") {
        const num = Number(row.campaignAcos);
        if (!isNaN(num)) return num;
    }
    if (row.acos !== undefined && row.acos !== null && row.acos !== "" && row.acos !== -30 && row.acos !== "-30") {
        const num = Number(row.acos);
        if (!isNaN(num)) return num;
    }
    if (Array.isArray(row.metricsHistory) && row.metricsHistory.length > 0) {
        const last = row.metricsHistory[row.metricsHistory.length - 1];
        if (last && last.acos !== undefined && last.acos !== null && last.acos !== "" && last.acos !== -30 && last.acos !== "-30") {
            const num = Number(last.acos);
            if (!isNaN(num)) return num;
        }
    }
    if (row.metrics && row.metrics.acos !== undefined && row.metrics.acos !== null && row.metrics.acos !== "" && row.metrics.acos !== -30 && row.metrics.acos !== "-30") {
        const num = Number(row.metrics.acos);
        if (!isNaN(num)) return num;
    }
    return null;
};

const getLatestRoas = (row) => {
    if (!row) return null;
    if (row.campaignRoas !== undefined && row.campaignRoas !== null && row.campaignRoas !== "" && row.campaignRoas !== 9999 && row.campaignRoas !== "9999") {
        const num = Number(row.campaignRoas);
        if (!isNaN(num)) return num;
    }
    if (row.roas !== undefined && row.roas !== null && row.roas !== "" && row.roas !== 9999 && row.roas !== "9999") {
        const num = Number(row.roas);
        if (!isNaN(num)) return num;
    }
    if (Array.isArray(row.metricsHistory) && row.metricsHistory.length > 0) {
        const last = row.metricsHistory[row.metricsHistory.length - 1];
        if (last && last.roas !== undefined && last.roas !== null && last.roas !== "" && last.roas !== 9999 && last.roas !== "9999") {
            const num = Number(last.roas);
            if (!isNaN(num)) return num;
        }
    }
    if (row.metrics && row.metrics.roas !== undefined && row.metrics.roas !== null && row.metrics.roas !== "" && row.metrics.roas !== 9999 && row.metrics.roas !== "9999") {
        const num = Number(row.metrics.roas);
        if (!isNaN(num)) return num;
    }
    return null;
};

// --- Custom Header with Info Tooltip ---
const TooltipHeader = (props) => {
    const { displayName, tooltipText, enableSorting, progressSort } = props;
    const [currentSort, setCurrentSort] = useState(props.column?.getSort ? props.column.getSort() : null);

    useEffect(() => {
        if (!props.column?.addEventListener) return;
        const onSortChanged = () => setCurrentSort(props.column.getSort());
        props.column.addEventListener('sortChanged', onSortChanged);
        return () => props.column.removeEventListener('sortChanged', onSortChanged);
    }, [props.column]);

    const handleClick = (e) => {
        if (enableSorting && progressSort) progressSort(e.shiftKey);
    };

    return (
        <div
            className="flex items-center gap-1.5"
            style={{ cursor: enableSorting ? 'pointer' : 'default', width: '100%', height: '100%' }}
            onClick={handleClick}
        >
            <span className="ag-header-cell-text">{displayName}</span>
            {currentSort === 'asc' && <i className="fa-solid fa-arrow-up ml-1 text-[11px]" />}
            {currentSort === 'desc' && <i className="fa-solid fa-arrow-down ml-1 text-[11px]" />}
            {tooltipText && (
                <AppTooltip text={<div style={{ fontSize: 12, padding: '2px 4px' }}>{tooltipText}</div>} placement="top" arrow>
                    <span
                        className="inline-flex items-center justify-center cursor-help text-slate-400 hover:text-slate-200 transition-colors ml-0.5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <FiInfo size={13} />
                    </span>
                </AppTooltip>
            )}
        </div>
    );
};

const isRevertable = (item) => {
    return item?.changed && REVERTABLE_FIELDS.includes(item.changed);
};

// --- Setting Information & Type Resolver ---
const getSettingInfo = (row) => {
    const changed = row?.changed;
    const currSym = getCurrencySymbol();

    if (changed === "bid") {
        return {
            label: "Keyword / Target Bid",
            shortLabel: "Bid",
            type: "bid",
            icon: "🎯",
            unit: currSym,
            isCurrency: true,
            color: "#38bdf8",
            bg: "rgba(56, 189, 248, 0.12)",
            border: "rgba(56, 189, 248, 0.25)"
        };
    }
    if (changed === "budget") {
        return {
            label: "Campaign Budget",
            shortLabel: "Budget",
            type: "budget",
            icon: "💰",
            unit: currSym,
            isCurrency: true,
            color: "#34d399",
            bg: "rgba(52, 211, 153, 0.12)",
            border: "rgba(52, 211, 153, 0.25)"
        };
    }
    if (changed === "bidAdjustment" || (row?.placement && !row?.targetId)) {
        return {
            label: "Placement Modifier",
            shortLabel: "Placement %",
            type: "bidAdjustment",
            icon: "📍",
            unit: "%",
            isPercentage: true,
            color: "#a78bfa",
            bg: "rgba(167, 139, 250, 0.12)",
            border: "rgba(167, 139, 250, 0.25)"
        };
    }
    if (changed === "dayparting" || changed === "bid_modifier" || changed === "hourly") {
        return {
            label: "Dayparting Adjustment",
            shortLabel: "Dayparting",
            type: "dayparting",
            icon: "⏱️",
            unit: currSym,
            isCurrency: true,
            color: "#fbbf24",
            bg: "rgba(251, 191, 36, 0.12)",
            border: "rgba(251, 191, 36, 0.25)"
        };
    }
    if (changed === "state") {
        return {
            label: "Target Status",
            shortLabel: "Target State",
            type: "state",
            icon: "⚡",
            unit: "status",
            isStatus: true,
            color: "#f472b6",
            bg: "rgba(244, 114, 182, 0.12)",
            border: "rgba(244, 114, 182, 0.25)"
        };
    }
    if (changed === "campaignState") {
        return {
            label: "Campaign Status",
            shortLabel: "Campaign State",
            type: "campaignState",
            icon: "⚡",
            unit: "status",
            isStatus: true,
            color: "#facc15",
            bg: "rgba(250, 204, 21, 0.12)",
            border: "rgba(250, 204, 21, 0.25)"
        };
    }
    if (changed === "adGroupState") {
        return {
            label: "Ad Group Status",
            shortLabel: "AdGroup State",
            type: "adGroupState",
            icon: "⚡",
            unit: "status",
            isStatus: true,
            color: "#818cf8",
            bg: "rgba(129, 140, 248, 0.12)",
            border: "rgba(129, 140, 248, 0.25)"
        };
    }
    if (changed === "target_harvested" || changed === "target" || (changed === "searchTermAction" && row?.newlyAppliedCampaignName)) {
        return {
            label: "Harvested Target",
            shortLabel: "Target",
            type: "target",
            icon: "🎯",
            unit: "text",
            isSearchTerm: true,
            color: "#34d399",
            bg: "rgba(52, 211, 153, 0.12)",
            border: "rgba(52, 211, 153, 0.25)"
        };
    }
    if (changed === "negative" || changed === "negativeKeyword" || changed === "negativeTargeting") {
        return {
            label: "Negative Search Term",
            shortLabel: "Negative Term",
            type: "searchTerm",
            icon: "⛔",
            unit: "text",
            isSearchTerm: true,
            color: "#fb7185",
            bg: "rgba(251, 113, 133, 0.12)",
            border: "rgba(251, 113, 133, 0.25)"
        };
    }
    if (changed === "searchTerm" || row?.searchTerm || changed === "searchTermAction") {
        return {
            label: "Search Term Action",
            shortLabel: "Search Term",
            type: "searchTerm",
            icon: "🔍",
            unit: "text",
            isSearchTerm: true,
            color: "#22d3ee",
            bg: "rgba(34, 211, 238, 0.12)",
            border: "rgba(34, 211, 238, 0.25)"
        };
    }

    // Heuristics fallback
    if (row?.targetId || row?.targetName) {
        return {
            label: "Target Bid",
            shortLabel: "Bid",
            type: "bid",
            icon: "🎯",
            unit: currSym,
            isCurrency: true,
            color: "#38bdf8",
            bg: "rgba(56, 189, 248, 0.12)",
            border: "rgba(56, 189, 248, 0.25)"
        };
    }
    if (row?.campaignId && !row?.targetId && !row?.placement && !row?.searchTerm) {
        return {
            label: "Campaign Budget",
            shortLabel: "Budget",
            type: "budget",
            icon: "💰",
            unit: currSym,
            isCurrency: true,
            color: "#34d399",
            bg: "rgba(52, 211, 153, 0.12)",
            border: "rgba(52, 211, 153, 0.25)"
        };
    }

    return {
        label: changed || "Setting Change",
        shortLabel: changed || "Setting",
        type: changed || "unknown",
        icon: "⚙️",
        unit: "",
        color: "#94a3b8",
        bg: "rgba(148, 163, 184, 0.12)",
        border: "rgba(148, 163, 184, 0.25)"
    };
};

const isAdGroupLevelChange = (row) => {
    if (!row) return false;
    const rawType = (row.changeType || row.changed || "").toLowerCase();
    return Boolean(
        row.targeting ||
        row.targetName ||
        row.searchTerm ||
        row.adGroupId ||
        row.adGroupName ||
        row.adGroupname ||
        row.adgroup ||
        row.adGroupDetails?.name ||
        rawType.includes("targeting") ||
        rawType.includes("keyword") ||
        rawType.includes("adgroup") ||
        rawType.includes("ad group")
    );
};

const formatAmazonChangeType = (row) => {
    if (!row) return "—";
    if (row.isParent) {
        return `${row.children?.length || 0} Placements Updated`;
    }

    const changed = (row.changed || "").toLowerCase();
    const target = row.targetName || row.targeting || row.keywordText || row.target || "";
    const norm = getNormalizedTargetingType(row.targetType || row.matchType, target);
    const matchStr = norm.type === "AUTO"
        ? "(auto)"
        : norm.subType
            ? `(${norm.subType.toLowerCase()})`
            : "";
    const isAutoOrProduct = norm.type === "AUTO" || norm.type === "PRODUCT" || norm.type === "CATEGORY" || norm.type === "EXPANDED";
    const entityName = isAutoOrProduct ? "Targeting" : "Keyword";
    const placement = row.placement || "";

    // 1. Placement Bids
    if (placement && (changed === "bidadjustment" || !row.targetId)) {
        if (/top of search/i.test(placement)) return "Placement bid(Top of search)";
        if (/product pages/i.test(placement)) return "Placement bid(Product pages)";
        if (/rest of search/i.test(placement)) return "Placement bid(Rest of search)";
        return `Placement bid(${placement})`;
    }

    // 2. Keyword / Target Bid
    if (changed === "bid" || (target && /bid/i.test(changed))) {
        if (target) return `${entityName} bid${matchStr} - ${target}`;
        return `${entityName} bid${matchStr}`;
    }

    // 3. Status changes
    if (changed === "state") {
        if (target) return `${entityName} status${matchStr} - ${target}`;
        return `${entityName} status${matchStr}`;
    }
    if (changed === "campaignstate") {
        return "Campaign status";
    }
    if (changed === "adgroupstate") {
        return "Ad group status";
    }

    // 4. Budget
    if (changed === "budget") {
        return "Campaign budget";
    }

    // 5. Dayparting / Hourly
    if (changed === "dayparting" || changed === "bid_modifier" || changed === "hourly") {
        return "Dayparting bid adjustment";
    }

    // 6. Search Term / Harvesting / Negatives
    if (changed === "negative" || changed === "negativekeyword" || changed === "negativetargeting") {
        const term = row.searchTerm || target;
        return `Negative keyword${matchStr}${term ? ` - ${term}` : ""}`;
    }
    if (changed === "target_harvested" || (changed === "searchtermaction" && row.newlyAppliedCampaignName)) {
        const term = row.searchTerm || target;
        return `Keyword${matchStr}${term ? ` - ${term}` : ""}`;
    }
    if (changed === "searchterm" || row.searchTerm || changed === "searchtermaction") {
        return `Search term harvest - ${row.searchTerm || target}`;
    }

    // Fallback: If target is present
    if (target) {
        return `Target${matchStr} - ${target}`;
    }

    const info = getSettingInfo(row);
    return info.label || changed || "—";
};

// --- Value Formatter ---
const formatImpactValue = (val, settingInfo, isDark) => {
    if (val === null || val === undefined || val === "") return "—";

    const strVal = String(val).trim();
    const upper = strVal.toUpperCase();

    // Check for Status values
    if (upper === "ENABLED" || upper === "PAUSED" || upper === "ARCHIVED") {
        const isEnabled = upper === "ENABLED";
        const isPaused = upper === "PAUSED";
        return (
            <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.3px",
                background: isEnabled
                    ? (isDark ? "rgba(52, 211, 153, 0.15)" : "rgba(22, 163, 74, 0.1)")
                    : isPaused
                        ? (isDark ? "rgba(248, 113, 113, 0.15)" : "rgba(220, 53, 69, 0.1)")
                        : "rgba(148, 163, 184, 0.15)",
                color: isEnabled
                    ? (isDark ? "#34d399" : "#16a34a")
                    : isPaused
                        ? (isDark ? "#f87171" : "#dc3545")
                        : "#94a3b8",
                border: `1px solid ${isEnabled
                    ? (isDark ? "rgba(52, 211, 153, 0.3)" : "rgba(22, 163, 74, 0.2)")
                    : isPaused
                        ? (isDark ? "rgba(248, 113, 113, 0.3)" : "rgba(220, 53, 69, 0.2)")
                        : "rgba(148, 163, 184, 0.2)"}`
            }}>
                <span style={{ fontSize: "7px" }}>●</span>
                {upper}
            </span>
        );
    }

    const num = Number(strVal);
    if (!isNaN(num) && isFinite(num)) {
        const formattedNum = formatDecimal(num);
        if (settingInfo.isCurrency) {
            return `${settingInfo.unit}${formattedNum}`;
        }
        if (settingInfo.isPercentage) {
            return `${formattedNum}%`;
        }
        return formattedNum;
    }

    return strVal;
};

const ExpandedComponent = ({ data }) => {
    const { t } = useTranslation();
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    return (
        <div style={{ padding: "0 24px 16px 48px" }}>
            <div className="expanded-container" style={{
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: isDark ? "inset 0 2px 8px rgba(0,0,0,0.2)" : "inset 0 2px 8px rgba(0,0,0,0.03)",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(0,0,0,0.06)",
                background: isDark ? "rgba(255, 255, 255, 0.01)" : "rgba(0,0,0,0.01)",
                backdropFilter: "blur(2px)"
            }}>
                <div className="expanded-header-row" style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                    fontSize: "10px",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0,0,0,0.4)",
                    borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid rgba(0,0,0,0.05)"
                }}>
                    <div style={{ width: "320px" }}>{t("Placement Name")}</div>
                    <div style={{ width: "130px" }}>{t("From")}</div>
                    <div style={{ width: "130px" }}>{t("To")}</div>
                    <div style={{ width: "140px" }}>{t("Effect / Change")}</div>
                    <div style={{ width: "120px", display: "flex", alignItems: "center", gap: "4px" }}>
                        <span>{t("ACOS")}</span>
                        <AppTooltip text={<div style={{ fontSize: 12, padding: '2px 4px' }}>{t("Calculated based on campaign performance data for the rule's configured date filter.")}</div>} placement="top" arrow>
                            <span className="inline-flex items-center justify-center cursor-help text-slate-400 hover:text-slate-200 transition-colors">
                                <FiInfo size={11} />
                            </span>
                        </AppTooltip>
                    </div>
                    <div style={{ width: "120px", display: "flex", alignItems: "center", gap: "4px" }}>
                        <span>{t("ROAS")}</span>
                        <AppTooltip text={<div style={{ fontSize: 12, padding: '2px 4px' }}>{t("Calculated based on campaign performance data for the rule's configured date filter.")}</div>} placement="top" arrow>
                            <span className="inline-flex items-center justify-center cursor-help text-slate-400 hover:text-slate-200 transition-colors">
                                <FiInfo size={11} />
                            </span>
                        </AppTooltip>
                    </div>
                    <div style={{ flex: 1 }}></div>
                </div>
                {(data.children || []).map((row, idx) => {
                    const settingInfo = getSettingInfo(row);
                    const oldNum = Number(row.oldValue);
                    const newNum = Number(row.newValue);
                    const isNum = !isNaN(oldNum) && !isNaN(newNum);
                    const diff = isNum ? newNum - oldNum : null;
                    const isUp = diff !== null && diff > 0;
                    const isDown = diff !== null && diff < 0;
                    const acosVal = getLatestAcos(row);
                    const roasVal = getLatestRoas(row);

                    return (
                        <div key={idx} className={`expanded-row ${idx % 2 === 0 ? 'even' : 'odd'}`} style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "12px 16px",
                            fontSize: "12px",
                            borderBottom: idx === (data.children || []).length - 1 ? "none" : isDark ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(0,0,0,0.03)",
                            background: idx % 2 === 0 ? "transparent" : isDark ? "rgba(255, 255, 255, 0.01)" : "rgba(0,0,0,0.01)"
                        }}>
                            <div style={{ width: "320px", display: "flex", alignItems: "center" }}>
                                <span className="expanded-placement-badge" style={{
                                    borderRadius: "6px",
                                    padding: "3px 8px",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
                                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.06)",
                                    color: isDark ? "#e2e8f0" : "#334155"
                                }}>
                                    {row.placement}
                                </span>
                            </div>

                            <div style={{ width: "130px", textAlign: "left", fontFamily: "monospace" }}>
                                <span className="expanded-old-badge font-semibold" style={{
                                    borderRadius: "6px",
                                    padding: "2px 6px", fontSize: "11px",
                                    background: isDark ? "rgba(244, 63, 94, 0.08)" : "rgba(225, 29, 72, 0.08)",
                                    border: isDark ? "1px solid rgba(244, 63, 94, 0.2)" : "1px solid rgba(225, 29, 72, 0.15)",
                                    color: isDark ? "#fb7185" : "#e11d48"
                                }}>
                                    {formatImpactValue(row.oldValue, settingInfo, isDark)}
                                </span>
                            </div>

                            <div style={{ width: "130px", textAlign: "left", fontFamily: "monospace" }}>
                                <span className="expanded-new-badge font-semibold" style={{
                                    borderRadius: "6px", padding: "2px 6px", fontSize: "11px",
                                    background: isDark ? "rgba(52, 211, 153, 0.1)" : "rgba(22, 163, 74, 0.08)",
                                    border: isDark ? "1px solid rgba(52, 211, 153, 0.25)" : "1px solid rgba(22, 163, 74, 0.18)",
                                    color: isDark ? "#34d399" : "#16a34a"
                                }}>
                                    {formatImpactValue(row.newValue, settingInfo, isDark)}
                                </span>
                            </div>

                            <div style={{ width: "140px", textAlign: "left" }}>
                                {diff !== null ? (
                                    <span style={{
                                        display: "inline-flex", alignItems: "center", gap: "4px",
                                        fontWeight: "700", fontSize: "11px", fontFamily: "monospace",
                                        color: isUp ? (isDark ? "#34d399" : "#16a34a") : isDown ? (isDark ? "#f87171" : "#dc3545") : "#94a3b8",
                                        background: isUp ? (isDark ? "rgba(52, 211, 153, 0.1)" : "rgba(22, 163, 74, 0.08)") : isDown ? (isDark ? "rgba(248, 113, 113, 0.1)" : "rgba(220, 53, 69, 0.08)") : "rgba(148, 163, 184, 0.1)",
                                        border: `1px solid ${isUp ? (isDark ? "rgba(52, 211, 153, 0.2)" : "rgba(22, 163, 74, 0.15)") : isDown ? (isDark ? "rgba(248, 113, 113, 0.2)" : "rgba(220, 53, 69, 0.15)") : "rgba(148, 163, 184, 0.2)"}`,
                                        borderRadius: "5px", padding: "2px 6px",
                                    }}>
                                        {isUp ? "▲ +" : isDown ? "▼ " : "● "}{formatDecimal(diff)}%
                                    </span>
                                ) : (
                                    <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>
                                )}
                            </div>

                            <div style={{ width: "120px", textAlign: "left" }}>
                                {acosVal !== null && !isNaN(acosVal) ? (
                                    <span style={{
                                        borderRadius: "6px",
                                        padding: "2px 6px",
                                        fontSize: "11px",
                                        fontWeight: "600",
                                        fontFamily: "monospace",
                                        background: isDark ? "rgba(244, 63, 94, 0.08)" : "rgba(225, 29, 72, 0.08)",
                                        border: isDark ? "1px solid rgba(244, 63, 94, 0.2)" : "1px solid rgba(225, 29, 72, 0.15)",
                                        color: isDark ? "#fb7185" : "#e11d48"
                                    }}>
                                        {formatDecimal(acosVal)}%
                                    </span>
                                ) : (
                                    <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>
                                )}
                            </div>

                            <div style={{ width: "120px", textAlign: "left" }}>
                                {roasVal !== null && !isNaN(roasVal) ? (
                                    <span style={{
                                        borderRadius: "6px",
                                        padding: "2px 6px",
                                        fontSize: "11px",
                                        fontWeight: "600",
                                        fontFamily: "monospace",
                                        background: isDark ? "rgba(52, 211, 153, 0.08)" : "rgba(16, 185, 129, 0.08)",
                                        border: isDark ? "1px solid rgba(52, 211, 153, 0.2)" : "1px solid rgba(16, 185, 129, 0.15)",
                                        color: isDark ? "#34d399" : "#059669"
                                    }}>
                                        {formatDecimal(roasVal)}
                                    </span>
                                ) : (
                                    <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>
                                )}
                            </div>

                            <div style={{ flex: 1 }}></div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const AffectedHistoryModel = ({ show, onClose, data = [], onRevert }) => {
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    useEffect(() => {
        const handleTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handleTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const PRIMARY = isDark ? "#38bdf8" : "#1A9FD4";
    const hasParentRows = useMemo(() => data.some(row => row.isParent), [data]);

    const [revertConfirm, setRevertConfirm] = useState(null);
    const [selectedRowsMap, setSelectedRowsMap] = useState({});

    const getRowKey = (row, fallbackIdx = 0) => {
        if (!row) return String(fallbackIdx);
        return String(
            row._id ||
            row.id ||
            `${row.campaignId || row.campaign_id || ''}_${row.targetId || row.target_id || ''}_${row.placement || ''}_${row.changed || ''}_${row.adGroupId || ''}_${fallbackIdx}`
        );
    };

    const revertableRows = data.filter(item => !item.isReverted && isRevertable(item));
    const hasRevertableRows = revertableRows.length > 0;
    const { t } = useTranslation();

    const selectedRevertList = useMemo(() => {
        return revertableRows.filter((row, idx) => {
            const key = getRowKey(row, idx);
            return !!selectedRowsMap[key];
        });
    }, [revertableRows, selectedRowsMap]);

    const handleSelectRow = (row, fallbackIdx, checked) => {
        const key = getRowKey(row, fallbackIdx);
        if (checked) {
            const currentSelectedCount = Object.values(selectedRowsMap).filter(Boolean).length;
            if (currentSelectedCount >= 50) {
                Toast.error(t("Maximum 50 records can be selected at a time"));
                return;
            }
            setSelectedRowsMap(prev => ({ ...prev, [key]: row }));
        } else {
            setSelectedRowsMap(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    };

    const handleToggleSelectAll = (checked) => {
        if (!checked) {
            setSelectedRowsMap({});
            return;
        }

        const newMap = {};
        const maxToSelect = Math.min(revertableRows.length, 50);
        for (let i = 0; i < maxToSelect; i++) {
            const row = revertableRows[i];
            const key = getRowKey(row, i);
            newMap[key] = row;
        }
        setSelectedRowsMap(newMap);

        if (revertableRows.length > 50) {
            Toast.info(t("Selected first 50 revertable records (maximum limit is 50)"));
        }
    };

    const isAllSelected = revertableRows.length > 0 && selectedRevertList.length === Math.min(revertableRows.length, 50);

    const handleRevertRow = (row) => {
        setRevertConfirm({ type: 'single', row });
    };
    const handleRevertSelected = () => {
        setRevertConfirm({ type: 'selected' });
    };
    const handleRevertAll = () => {
        setRevertConfirm({ type: 'all' });
    };

    const handleConfirmRevert = () => {
        if (!revertConfirm) return;
        if (revertConfirm.type === 'single') onRevert?.([revertConfirm.row]);
        if (revertConfirm.type === 'selected') onRevert?.(selectedRevertList);
        if (revertConfirm.type === 'all') onRevert?.(revertableRows);
        setRevertConfirm(null);
        setSelectedRowsMap({});
    };

    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedRowsMap({});
    }, [show, data?.length]);

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * perPage;
        return data.slice(start, start + perPage);
    }, [data, currentPage, perPage]);

    // Compute setting breakdown counts for summary pills
    const summaryBreakdown = useMemo(() => {
        const counts = {
            bid: 0,
            budget: 0,
            placement: 0,
            dayparting: 0,
            status: 0,
            searchTerm: 0,
        };
        data.forEach(item => {
            const info = getSettingInfo(item);
            if (info.type === "bid" || info.type === "target") counts.bid++;
            else if (info.type === "budget") counts.budget++;
            else if (info.type === "bidAdjustment") counts.placement++;
            else if (info.type === "dayparting") counts.dayparting++;
            else if (info.isStatus) counts.status++;
            else if (info.type === "searchTerm") counts.searchTerm++;
        });
        return counts;
    }, [data]);

    const columns = useMemo(() => [
        onRevert && {
            headerName: "",
            title: "",
            width: 48,
            minWidth: 48,
            maxWidth: 48,
            pinned: "left",
            lockPinned: true,
            suppressMovable: true,
            sortable: false,
            resizable: false,
            headerComponent: () => (
                <div className="flex items-center justify-center w-full h-full">
                    <StyledCheckbox
                        checked={isAllSelected}
                        disabled={!hasRevertableRows}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        title={t("Select All (Max 50)")}
                    />
                </div>
            ),
            cellRenderer: (params) => {
                const row = params.data;
                if (!row || row.isParent) return null;
                const revertable = !row.isReverted && isRevertable(row);
                if (!revertable) return null;

                const fallbackIdx = (currentPage - 1) * perPage + (params.node.rowIndex || 0);
                const key = getRowKey(row, fallbackIdx);
                const isChecked = !!selectedRowsMap[key];

                return (
                    <div className="flex items-center justify-center w-full h-full">
                        <StyledCheckbox
                            checked={isChecked}
                            onChange={(e) => handleSelectRow(row, fallbackIdx, e.target.checked)}
                        />
                    </div>
                );
            }
        },
        hasParentRows && {
            headerName: "",
            title: "",
            width: 44,
            minWidth: 44,
            maxWidth: 44,
            sortable: false,
            resizable: false,
            cellRenderer: "agGroupCellRenderer",
            cellRendererParams: {
                suppressCount: true,
                innerRenderer: () => null,
            }
        },
        {
            headerName: t("Type"),
            title: t("Type"),
            field: "type",
            width: 95,
            minWidth: 95,
            sortable: true,
            cellRenderer: (params) => {
                const row = params.data;
                const typeMap = { SP: "Products", SB: "Brands", SD: "Display" };
                const colorMap = { SP: isDark ? "#38bdf8" : "#0d6efd", SB: isDark ? "#34d399" : "#198754", SD: isDark ? "#fb923c" : "#fd7e14" };
                const type = row?.type;
                return type ? (
                    <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        background: `${colorMap[type]}1a`,
                        color: colorMap[type],
                        border: `1px solid ${colorMap[type]}33`,
                        whiteSpace: "nowrap"
                    }}>
                        {t(typeMap[type] ?? type)}
                    </span>
                ) : null;
            },
        },
        // ── 1. Change level (Amazon style) ──
        {
            headerName: t("Change level", "Change level"),
            title: t("Change level"),
            field: "name",
            minWidth: 260,
            flex: 2,
            sortable: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const campaignName = row.name || row.campaignName || row.campaign || "";
                const campaignId = row.campaignId || row.campaign_id;
                const adGroupName = row.adGroupName || row.adGroupname || row.adgroup || "";
                const isAdGroup = isAdGroupLevelChange(row);
                const primaryAdGroup = adGroupName || (row.adGroupId ? `AdGroup #${row.adGroupId}` : (row.targetName || row.targeting ? campaignName : ""));

                if (isAdGroup && (primaryAdGroup || campaignName)) {
                    return (
                        <div className="flex flex-col justify-center h-full gap-0.5 min-w-0" style={{ lineHeight: 1.25 }}>
                            {primaryAdGroup && (
                                <div className="flex items-center min-w-0 text-[12px] font-semibold">
                                    <span style={{ color: isDark ? "#94a3b8" : "#64748b", marginRight: "4px", flexShrink: 0, fontWeight: "500" }}>
                                        {t("Ad Group")}:
                                    </span>
                                    <span
                                        className="truncate"
                                        style={{ color: isDark ? "#f1f5f9" : "#1e293b", fontWeight: 600 }}
                                        title={primaryAdGroup}
                                    >
                                        {primaryAdGroup}
                                    </span>
                                </div>
                            )}
                            {campaignName && (
                                <div className="flex items-center min-w-0 text-[11px]">
                                    <span style={{ color: isDark ? "#94a3b8" : "#64748b", marginRight: "4px", flexShrink: 0, fontWeight: "500" }}>
                                        {t("Campaign")}:
                                    </span>
                                    <div className="truncate flex-1 min-w-0">
                                        <CampaignNameCell
                                            row={row}
                                            name={campaignName}
                                            campaignId={campaignId}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                }

                return (
                    <div className="flex items-center h-full min-w-0 text-[12px]">
                        <span style={{ color: isDark ? "#94a3b8" : "#64748b", marginRight: "4px", flexShrink: 0, fontWeight: "500" }}>
                            {t("Campaign")}:
                        </span>
                        <div className="truncate flex-1 min-w-0">
                            <CampaignNameCell
                                row={row}
                                name={campaignName || "—"}
                                campaignId={campaignId}
                            />
                        </div>
                    </div>
                );
            },
        },
        // ── 2. Change type (Amazon style) ──
        {
            headerName: t("Change type", "Change type"),
            title: t("Change type"),
            field: "changed",
            minWidth: 220,
            flex: 1.5,
            sortable: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const text = formatAmazonChangeType(row);
                const info = getSettingInfo(row);

                return (
                    <div className="flex items-center h-full w-full min-w-0" style={{ gap: "6px" }}>
                        <span style={{ fontSize: "14px", flexShrink: 0 }}>{info.icon}</span>
                        <span
                            className="truncate text-[12px] font-medium"
                            style={{
                                color: isDark ? "#e2e8f0" : "#1e293b",
                            }}
                            title={text}
                        >
                            {text}
                        </span>
                    </div>
                );
            },
        },
        // ── 3. From (Old Value) ──
        {
            headerName: t("From"),
            title: t("From"),
            field: "oldValue",
            minWidth: 110,
            width: 125,
            sortable: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                if (row.isParent) return <div className="flex items-center h-full"><span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span></div>;
                const settingInfo = getSettingInfo(row);
                const formatted = formatImpactValue(row.oldValue, settingInfo, isDark);

                return (
                    <div className="flex items-center h-full">
                        {typeof formatted === "object" ? formatted : (
                            <span className="font-semibold truncate text-[12px]" style={{ color: isDark ? "#fb7185" : "#e11d48", fontFamily: "monospace" }} title={formatted}>
                                {formatted}
                            </span>
                        )}
                    </div>
                );
            },
        },
        // ── 4. To (New Value) ──
        {
            headerName: t("To"),
            title: t("To"),
            field: "newValue",
            minWidth: 110,
            width: 125,
            sortable: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                if (row.isParent) return <div className="flex items-center h-full"><span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span></div>;
                const settingInfo = getSettingInfo(row);
                const formatted = formatImpactValue(row.newValue, settingInfo, isDark);

                return (
                    <div className="flex items-center h-full">
                        {typeof formatted === "object" ? formatted : (
                            <span className="font-semibold truncate text-[12px]" style={{ color: isDark ? "#34d399" : "#16a34a", fontFamily: "monospace" }} title={formatted}>
                                {formatted}
                            </span>
                        )}
                    </div>
                );
            },
        },
        // ── Effect / Impact Change (Delta & Transition) ──
        {
            headerName: t("Effect / Change"),
            title: t("Effect / Change"),
            minWidth: 160,
            flex: 1.3,
            sortable: true,
            valueGetter: (params) => {
                const row = params.data;
                if (!row) return null;
                const diff = Number(row.newValue) - Number(row.oldValue);
                return isNaN(diff) ? 0 : diff;
            },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                if (row.isParent) return <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>;

                const settingInfo = getSettingInfo(row);
                const oldValStr = String(row.oldValue || "").toUpperCase().trim();
                const newValStr = String(row.newValue || "").toUpperCase().trim();

                // 1. Status Transition
                if ((oldValStr === "ENABLED" || oldValStr === "PAUSED") && (newValStr === "ENABLED" || newValStr === "PAUSED")) {
                    const isNowEnabled = newValStr === "ENABLED";
                    return (
                        <span style={{
                            display: "inline-flex", alignItems: "center", gap: "5px",
                            fontWeight: "700", fontSize: "11px",
                            color: isNowEnabled ? (isDark ? "#34d399" : "#16a34a") : (isDark ? "#f87171" : "#dc3545"),
                            background: isNowEnabled ? (isDark ? "rgba(52, 211, 153, 0.1)" : "rgba(22, 163, 74, 0.08)") : (isDark ? "rgba(248, 113, 113, 0.1)" : "rgba(220, 53, 69, 0.08)"),
                            border: `1px solid ${isNowEnabled ? (isDark ? "rgba(52, 211, 153, 0.25)" : "rgba(22, 163, 74, 0.2)") : (isDark ? "rgba(248, 113, 113, 0.25)" : "rgba(220, 53, 69, 0.2)")}`,
                            borderRadius: "6px", padding: "3px 8px",
                            whiteSpace: "nowrap",
                        }}>
                            <span>{oldValStr}</span>
                            <FiArrowRight size={11} />
                            <span>{newValStr}</span>
                        </span>
                    );
                }

                // 2. Numeric Delta (Bid, Budget, Dayparting, Placement Modifier)
                const oldNum = Number(row.oldValue);
                const newNum = Number(row.newValue);
                const isValidNums = !isNaN(oldNum) && !isNaN(newNum);

                if (isValidNums) {
                    const diff = newNum - oldNum;
                    const isUp = diff > 0;
                    const isDown = diff < 0;
                    const pctChange = oldNum > 0 ? ((diff / oldNum) * 100).toFixed(1) : null;

                    const currSym = settingInfo.isCurrency ? getCurrencySymbol() : "";
                    const suffix = settingInfo.isPercentage ? "%" : "";

                    return (
                        <span style={{
                            display: "inline-flex", alignItems: "center", gap: "4px",
                            fontWeight: "700", fontSize: "11px", fontFamily: "monospace",
                            color: isUp ? (isDark ? "#34d399" : "#16a34a") : isDown ? (isDark ? "#f87171" : "#dc3545") : "#94a3b8",
                            background: isUp ? (isDark ? "rgba(52, 211, 153, 0.1)" : "rgba(22, 163, 74, 0.08)") : isDown ? (isDark ? "rgba(248, 113, 113, 0.1)" : "rgba(220, 53, 69, 0.08)") : "rgba(148, 163, 184, 0.1)",
                            border: `1px solid ${isUp ? (isDark ? "rgba(52, 211, 153, 0.2)" : "rgba(22, 163, 74, 0.15)") : isDown ? (isDark ? "rgba(248, 113, 113, 0.2)" : "rgba(220, 53, 69, 0.15)") : "rgba(148, 163, 184, 0.2)"}`,
                            borderRadius: "6px", padding: "3px 8px",
                            whiteSpace: "nowrap",
                        }}>
                            {isUp ? "▲" : isDown ? "▼" : "●"}
                            {isUp ? "+" : ""}{currSym}{formatDecimal(diff)}{suffix}
                            {pctChange && !settingInfo.isPercentage && (
                                <span style={{ opacity: 0.8, fontSize: "10px", marginLeft: "2px" }}>
                                    ({isUp ? "+" : ""}{pctChange}%)
                                </span>
                            )}
                        </span>
                    );
                }

                // 3. Search Term / Keyword Addition
                if (settingInfo.isSearchTerm) {
                    return (
                        <span style={{
                            display: "inline-flex", alignItems: "center", gap: "4px",
                            fontWeight: "700", fontSize: "11px",
                            color: isDark ? "#22d3ee" : "#0891b2",
                            background: isDark ? "rgba(34, 211, 238, 0.1)" : "rgba(6, 182, 212, 0.08)",
                            border: isDark ? "1px solid rgba(34, 211, 238, 0.2)" : "1px solid rgba(6, 182, 212, 0.15)",
                            borderRadius: "6px", padding: "3px 8px",
                            whiteSpace: "nowrap",
                        }}>
                            <span>+ Applied</span>
                        </span>
                    );
                }

                return <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>;
            },
        },
        // ── ACOS ──
        {
            headerName: t("ACOS"),
            title: t("ACOS"),
            field: "acos",
            minWidth: 130,
            flex: 1,
            sortable: true,
            headerComponent: TooltipHeader,
            headerComponentParams: {
                displayName: t("ACOS"),
                tooltipText: data[0]?.ruleDateFilter
                    ? `${t("Calculated based on campaign performance data for configured date filter")}: ${data[0].ruleDateFilter.replace(/_/g, " ")}${data[0]?.ruleDateRange ? ` (${data[0].ruleDateRange.fromDate} ~ ${data[0].ruleDateRange.toDate})` : ""}`
                    : t("Calculated based on campaign performance data for the rule's configured date filter."),
            },
            valueGetter: (params) => getLatestAcos(params.data),
            cellRenderer: (params) => {
                const row = params.data;
                if (!row || row.isParent) return <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>;
                const acosVal = getLatestAcos(row);
                if (acosVal === null || isNaN(acosVal)) {
                    return <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>;
                }
                return (
                    <div className="flex items-center" style={{ height: "100%" }}>
                        <span style={{
                            borderRadius: "6px",
                            padding: "3px 8px",
                            fontSize: "11px",
                            fontWeight: "600",
                            fontFamily: "monospace",
                            background: isDark ? "rgba(244, 63, 94, 0.08)" : "rgba(225, 29, 72, 0.08)",
                            border: isDark ? "1px solid rgba(244, 63, 94, 0.2)" : "1px solid rgba(225, 29, 72, 0.15)",
                            color: isDark ? "#fb7185" : "#e11d48"
                        }}>
                            {formatDecimal(acosVal)}%
                        </span>
                    </div>
                );
            }
        },
        // ── ROAS ──
        {
            headerName: t("ROAS"),
            title: t("ROAS"),
            field: "roas",
            minWidth: 130,
            flex: 1,
            sortable: true,
            headerComponent: TooltipHeader,
            headerComponentParams: {
                displayName: t("ROAS"),
                tooltipText: data[0]?.ruleDateFilter
                    ? `${t("Calculated based on campaign performance data for configured date filter")}: ${data[0].ruleDateFilter.replace(/_/g, " ")}${data[0]?.ruleDateRange ? ` (${data[0].ruleDateRange.fromDate} ~ ${data[0].ruleDateRange.toDate})` : ""}`
                    : t("Calculated based on campaign performance data for the rule's configured date filter."),
            },
            valueGetter: (params) => getLatestRoas(params.data),
            cellRenderer: (params) => {
                const row = params.data;
                if (!row || row.isParent) return <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>;
                const roasVal = getLatestRoas(row);
                if (roasVal === null || isNaN(roasVal)) {
                    return <span style={{ color: isDark ? "#475569" : "#94a3b8" }}>—</span>;
                }
                return (
                    <div className="flex items-center" style={{ height: "100%" }}>
                        <span style={{
                            borderRadius: "6px",
                            padding: "3px 8px",
                            fontSize: "11px",
                            fontWeight: "600",
                            fontFamily: "monospace",
                            background: isDark ? "rgba(52, 211, 153, 0.08)" : "rgba(16, 185, 129, 0.08)",
                            border: isDark ? "1px solid rgba(52, 211, 153, 0.2)" : "1px solid rgba(16, 185, 129, 0.15)",
                            color: isDark ? "#34d399" : "#059669"
                        }}>
                            {formatDecimal(roasVal)}
                        </span>
                    </div>
                );
            }
        },
        onRevert && {
            headerName: t("Revert"),
            title: t("Revert"),
            width: 160,
            minWidth: 160,
            sortable: false,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                if (row.isReverted) {
                    return (
                        <span
                            className="inline-flex items-center gap-1 border font-bold"
                            style={{
                                borderRadius: "6px",
                                padding: "4px 10px",
                                fontSize: "11px",
                                letterSpacing: "0.3px",
                                whiteSpace: "nowrap",
                                background: "rgba(52, 211, 153, 0.1)",
                                borderColor: "rgba(52, 211, 153, 0.2)",
                                color: isDark ? "#34d399" : "#16a34a",
                                cursor: "not-allowed",
                            }}
                        >
                            <span>✓</span>
                            {t("Already Reverted")}
                        </span>
                    );
                }

                if (!isRevertable(row)) {
                    return (
                        <span
                            title={!row?.changed ? t("No change field found") : `'${row?.changed}' ${t("is not revertable")}`}
                            className="inline-flex items-center gap-1 border font-bold"
                            style={{
                                background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0,0,0,0.02)",
                                borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0,0,0,0.06)",
                                color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
                                borderRadius: "6px",
                                padding: "4px 10px",
                                fontSize: "11px",
                                letterSpacing: "0.3px",
                                whiteSpace: "nowrap",
                                cursor: "default",
                            }}
                        >
                            <span>—</span>
                            {t("Not Revertable")}
                        </span>
                    );
                }

                return (
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => handleRevertRow(row)}
                        className="h-7 px-3 text-xs font-semibold border border-amber-400/60 dark:border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 !text-amber-700 dark:!text-amber-300 hover:!bg-amber-600 hover:!text-white dark:hover:!bg-amber-500 dark:hover:!text-white hover:!border-amber-600 dark:hover:!border-amber-500 active:scale-95 transition-all duration-200 shadow-sm gap-1.5 cursor-pointer"
                    >
                        <FiRotateCcw className="w-3.5 h-3.5 !stroke-current !text-current shrink-0" style={{ stroke: "currentColor", color: "currentColor" }} />
                        {t("Revert")}
                    </Button>
                );
            },
        },
    ].filter(Boolean), [
        isDark, PRIMARY, hasParentRows,
        onRevert, currentPage, perPage, t, selectedRowsMap, isAllSelected, hasRevertableRows,
        handleSelectRow, handleToggleSelectAll
    ]);

    return (
        <>
            <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-[1460px] w-[96vw] p-6 md:p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[92vh]">
                    {/* Circuit top glow line indicator */}
                    <div
                        className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                        style={{
                            background: "linear-gradient(90deg, transparent 0%, #2374F2 25%, #3ECFA8 60%, #7c64ff 80%, transparent 100%)",
                            opacity: 0.8
                        }}
                    />

                    {/* ── Header ── */}
                    <div className="flex items-center justify-between w-full pb-4 border-b border-slate-100 dark:border-white/10 pr-8 shrink-0">
                        <div style={{
                            fontSize: "18px", fontWeight: "700",
                            display: "flex", alignItems: "center", gap: "12px",
                            color: isDark ? "#ffffff" : "#1e293b"
                        }}>
                            <span className="history-title-icon bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 p-2.5 rounded-xl flex items-center justify-center">
                                <FiList size={18} />
                            </span>
                            {t("Rule Impact & Change History")}
                        </div>

                        {/* ── Revert Action Buttons (top-right of header) ── */}
                        {onRevert && hasRevertableRows && (
                            <div className="flex items-center gap-2 ml-auto">
                                {selectedRevertList.length > 0 && (
                                    <Button
                                        id="history-revert-selected-btn"
                                        type="button"
                                        size="sm"
                                        onClick={handleRevertSelected}
                                        className="inline-flex items-center gap-2 h-9 px-4 text-xs font-semibold border border-amber-400/60 dark:border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 !text-amber-700 dark:!text-amber-300 hover:!bg-amber-600 hover:!text-white dark:hover:!bg-amber-500 dark:hover:!text-white hover:!border-amber-600 dark:hover:!border-amber-500 active:scale-95 transition-all duration-200 shadow-sm rounded-xl cursor-pointer group"
                                    >
                                        <FiRotateCcw className="w-3.5 h-3.5 !stroke-current !text-current shrink-0" style={{ stroke: "currentColor", color: "currentColor" }} />
                                        {t("Revert Selected")}
                                        <span className="bg-amber-500/20 text-amber-800 dark:text-amber-200 group-hover:bg-white/20 group-hover:text-white rounded-full px-2 py-0.5 ml-1 text-[11px] font-bold transition-colors">
                                            {selectedRevertList.length}
                                        </span>
                                    </Button>
                                )}

                                <Button
                                    id="history-revert-all-btn"
                                    type="button"
                                    size="sm"
                                    onClick={handleRevertAll}
                                    className="inline-flex items-center gap-2 h-9 px-4 text-xs font-semibold border border-rose-400/60 dark:border-rose-500/40 bg-rose-500/10 dark:bg-rose-500/15 !text-rose-700 dark:!text-rose-300 hover:!bg-rose-600 hover:!text-white dark:hover:!bg-rose-600 dark:hover:!text-white hover:!border-rose-600 dark:hover:!border-rose-600 active:scale-95 transition-all duration-200 shadow-sm rounded-xl cursor-pointer group"
                                >
                                    <FiRotateCcw className="w-3.5 h-3.5 !stroke-current !text-current shrink-0" style={{ stroke: "currentColor", color: "currentColor" }} />
                                    {t("Revert All")}
                                    <span className="bg-rose-500/20 text-rose-800 dark:text-rose-200 group-hover:bg-white/20 group-hover:text-white rounded-full px-2 py-0.5 ml-1 text-[11px] font-bold transition-colors">
                                        {revertableRows.length}
                                    </span>
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* ── Top Summary & Timestamp Section ── */}
                    {data.length > 0 && (
                        <div className="flex items-center justify-between flex-wrap gap-3 pt-4 pb-2 shrink-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Timestamp pill */}
                                <div className="history-timestamp-pill bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl px-4 py-2 inline-flex items-center gap-2 text-sm shadow-sm">
                                    <FiClock size={15} className="text-sky-500 dark:text-sky-400" />
                                    <span className="text-[11px] font-bold tracking-wider text-sky-500 dark:text-sky-400 uppercase">
                                        {t("Executed At")}
                                    </span>
                                    <span className="text-slate-300 dark:text-white/20">|</span>
                                    <span className="text-slate-800 dark:text-white/90 font-medium text-xs">
                                        {formatRuleDate(data[0]?.ruleDate)}{data[0]?.ruleTime ? `, ${formatRunTime(data[0]?.ruleTime)}` : ""}
                                    </span>
                                </div>
                            </div>

                            {/* Summary breakdown badges */}
                            <div className="flex gap-2 flex-wrap items-center">
                                <span className="badge-summary-record" style={{
                                    background: "rgba(14, 165, 233, 0.12)",
                                    color: isDark ? "#38bdf8" : "#0369a1",
                                    border: isDark ? "1px solid rgba(14, 165, 233, 0.25)" : "1px solid #7dd3fc",
                                    borderRadius: "20px", padding: "4px 12px",
                                    fontSize: "12px", fontWeight: "600",
                                }}>
                                    📁 {data.length} {data.length === 1 ? t("Total Impact") : t("Total Impacts")}
                                </span>

                                {summaryBreakdown.bid > 0 && (
                                    <span style={{
                                        background: "rgba(56, 189, 248, 0.12)",
                                        color: isDark ? "#38bdf8" : "#0284c7",
                                        border: isDark ? "1px solid rgba(56, 189, 248, 0.25)" : "1px solid #bae6fd",
                                        borderRadius: "20px", padding: "4px 12px",
                                        fontSize: "12px", fontWeight: "600",
                                    }}>
                                        🎯 {summaryBreakdown.bid} {summaryBreakdown.bid === 1 ? t("Bid") : t("Bids")}
                                    </span>
                                )}

                                {summaryBreakdown.budget > 0 && (
                                    <span style={{
                                        background: "rgba(52, 211, 153, 0.12)",
                                        color: isDark ? "#34d399" : "#059669",
                                        border: isDark ? "1px solid rgba(52, 211, 153, 0.25)" : "1px solid #a7f3d0",
                                        borderRadius: "20px", padding: "4px 12px",
                                        fontSize: "12px", fontWeight: "600",
                                    }}>
                                        💰 {summaryBreakdown.budget} {summaryBreakdown.budget === 1 ? t("Budget") : t("Budgets")}
                                    </span>
                                )}

                                {summaryBreakdown.placement > 0 && (
                                    <span style={{
                                        background: "rgba(167, 139, 250, 0.12)",
                                        color: isDark ? "#a78bfa" : "#7c3aed",
                                        border: isDark ? "1px solid rgba(167, 139, 250, 0.25)" : "1px solid #ddd6fe",
                                        borderRadius: "20px", padding: "4px 12px",
                                        fontSize: "12px", fontWeight: "600",
                                    }}>
                                        📍 {summaryBreakdown.placement} {summaryBreakdown.placement === 1 ? t("Placement") : t("Placements")}
                                    </span>
                                )}

                                {summaryBreakdown.dayparting > 0 && (
                                    <span style={{
                                        background: "rgba(251, 191, 36, 0.12)",
                                        color: isDark ? "#fbbf24" : "#d97706",
                                        border: isDark ? "1px solid rgba(251, 191, 36, 0.25)" : "1px solid #fde68a",
                                        borderRadius: "20px", padding: "4px 12px",
                                        fontSize: "12px", fontWeight: "600",
                                    }}>
                                        ⏱️ {summaryBreakdown.dayparting} {t("Dayparting")}
                                    </span>
                                )}

                                {summaryBreakdown.searchTerm > 0 && (
                                    <span style={{
                                        background: "rgba(34, 211, 238, 0.12)",
                                        color: isDark ? "#22d3ee" : "#0891b2",
                                        border: isDark ? "1px solid rgba(34, 211, 238, 0.25)" : "1px solid #a5f3fc",
                                        borderRadius: "20px", padding: "4px 12px",
                                        fontSize: "12px", fontWeight: "600",
                                    }}>
                                        🔍 {summaryBreakdown.searchTerm} {summaryBreakdown.searchTerm === 1 ? t("Search Term") : t("Search Terms")}
                                    </span>
                                )}

                                {summaryBreakdown.status > 0 && (
                                    <span style={{
                                        background: "rgba(244, 114, 182, 0.12)",
                                        color: isDark ? "#f472b6" : "#db2777",
                                        border: isDark ? "1px solid rgba(244, 114, 182, 0.25)" : "1px solid #fbcfe8",
                                        borderRadius: "20px", padding: "4px 12px",
                                        fontSize: "12px", fontWeight: "600",
                                    }}>
                                        ⚡ {summaryBreakdown.status} {summaryBreakdown.status === 1 ? t("Status Change") : t("Status Changes")}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Body Table Container ── */}
                    <div className="flex-1 min-h-0 pt-2 flex flex-col overflow-hidden">
                        <div className="history-table-wrapper flex-1 min-h-0 flex flex-col" style={{
                            borderRadius: "12px",
                            overflow: "hidden",
                        }}>
                            <AgTable tableId="affected-history-modal-grid"
                                height="calc(92vh - 275px)"
                                minHeight="350px"
                                rowHeight={52}
                                rowData={paginatedData}
                                columnDefs={columns}
                                totalRecords={data.length}
                                perPage={perPage}
                                currentPage={currentPage}
                                onPageChange={(page) => setCurrentPage(page)}
                                onPerPageChange={(size) => {
                                    setPerPage(size);
                                    setCurrentPage(1);
                                }}
                                paginationOptions={[10, 20, 50]}
                                detailCellRenderer={data.some(row => row.isParent) ? ExpandedComponent : undefined}
                                isRowMaster={(row) => Boolean(row?.isParent && (row?.children?.length > 0))}
                                detailRowAutoHeight={true}
                                isCustomSaveColumns={false}
                            />
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div className="flex items-center justify-end pt-4 mt-2 border-t border-slate-100 dark:border-white/10 shrink-0">
                        <Button
                            id="history-modal-close-btn"
                            onClick={onClose}
                            className="auth-btn-primary h-[40px] px-8 flex items-center justify-center !py-0 !leading-none cursor-pointer rounded-lg font-semibold transition-all"
                            style={{
                                width: "auto",
                                marginBottom: 0
                            }}
                            type="button"
                        >
                            {t("Close")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            <CustomModal
                show={!!revertConfirm}
                onHide={() => setRevertConfirm(null)}
                title={
                    revertConfirm?.type === 'all'
                        ? 'Revert All Changes'
                        : revertConfirm?.type === 'selected'
                            ? 'Revert Selected Changes'
                            : 'Revert This Change'
                }
                subtitle={
                    revertConfirm?.type === 'all'
                        ? `${revertableRows.length} record${revertableRows.length !== 1 ? 's' : ''} will be reverted`
                        : revertConfirm?.type === 'selected'
                            ? `${selectedRevertList.length} selected record${selectedRevertList.length !== 1 ? 's' : ''} will be reverted`
                            : 'Single record revert'
                }
                icon="history"
                iconVariant="warning"
                message={
                    revertConfirm?.type === 'all'
                        ? `You are about to revert <span class="cm-highlight">all ${revertableRows.length} revertable changes</span> back to their previous values. This will take effect immediately.`
                        : revertConfirm?.type === 'selected'
                            ? `You are about to revert <span class="cm-highlight">${selectedRevertList.length} selected record${selectedRevertList.length !== 1 ? 's' : ''}</span> back to their previous values. This will take effect immediately.`
                            : `You are about to revert <span class="cm-highlight">${revertConfirm?.row?.name || revertConfirm?.row?.targetName || 'this record'
                            }</span> back to its previous value of <span class="cm-highlight">${formatDecimal(revertConfirm?.row?.oldValue) ?? '—'
                            }</span>.`
                }
                alertText={
                    revertConfirm?.type === 'all' || revertConfirm?.type === 'selected'
                        ? 'Reverting changes cannot be undone. All selected rule changes will be restored to previous values.'
                        : 'This action will immediately restore the previous value and cannot be undone.'
                }
                alertVariant="danger"
                closeOnBackdrop={false}
                actions={[
                    {
                        label: 'Cancel',
                        cancel: true,
                        icon: 'close',
                        onClick: () => setRevertConfirm(null),
                    },
                    {
                        label: revertConfirm?.type === 'all'
                            ? `Revert All (${revertableRows.length})`
                            : revertConfirm?.type === 'selected'
                                ? `Revert Selected (${selectedRevertList.length})`
                                : 'Revert',
                        variant: 'warning',
                        icon: 'history',
                        onClick: handleConfirmRevert,
                    },
                ]}
            />
        </>
    );
};

export default AffectedHistoryModel;