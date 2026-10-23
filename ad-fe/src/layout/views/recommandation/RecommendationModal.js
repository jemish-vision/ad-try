import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { Dialog, DialogContent } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AgTable from "../../../common/grid/AgTable";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import { ApiGetRecommendationData, ApiApplyRuleRecommendation } from "../../../api-wrapper/recommendation/ApiRecommendation";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { Toast } from "../../../helper/links/Link";
import moment from "moment-timezone";
import { openCampaignViewInNewTab } from "../../../utility/campaignNavigation";
import { FiClock, FiFilter, FiX, FiCalendar, FiInfo } from "react-icons/fi";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "../../../components/ui/tooltip";
import CampaignHistoryModal from "./CampaignHistoryModal";
import RecommendationReviewModal from "./RecommendationReviewModal";
import { ApiGetLatestCampaignHistory } from "../../../api-wrapper/campaign/ApiCampaign";

const CONDITION_SYMBOLS = {
    LESS_THAN_OR_EQUAL_TO: '≤',
    GREATER_THAN_OR_EQUAL_TO: '≥',
    LESS_THAN: '<',
    GREATER_THAN: '>',
    EQUAL_TO: '=',
    NOT_EQUAL_TO: '≠',
    BETWEEN: 'Between',
    '<=': '≤',
    '>=': '≥',
    '<': '<',
    '>': '>',
    '==': '=',
    '=': '=',
    '!=': '≠',
};

const DATE_FILTER_LABEL_MAP = {
    TODAY: "Today",
    YESTERDAY: "Yesterday",
    LAST_7_DAYS: "Last 7 Days",
    THIS_WEEK: "This Week",
    LAST_WEEK: "Last Week",
    LAST_30_DAYS: "Last 30 Days",
    THIS_MONTH: "This Month",
    LAST_MONTH: "Last Month",
    YEAR_TO_DATE: "Year to Date",
    LIFETIME: "Lifetime",
};

const formatConditionValue = (type, value, valueType) => {
    if (value === undefined || value === null || value === '') return '—';
    const key = String(type || '').toLowerCase();
    if (['acos', 'ctr', 'cvr', 'conversionrate', 'top of search is', 'topofsearchimpressionshare'].includes(key) || valueType === 'Percentage') {
        return `${value}%`;
    }
    if (key === 'roas') return `${value}x`;
    if (['cost', 'spend', 'sales', 'cpc', 'keywordbid', 'bid', 'budget'].includes(key)) {
        return CurrencyCode(value);
    }
    if (['orders', 'clicks', 'impressions'].includes(key)) {
        return Number(value).toLocaleString();
    }
    return String(value);
};

export const parseRuleConditions = (rule) => {
    if (!rule) return [];
    const rawList = Array.isArray(rule.conditions)
        ? rule.conditions
        : Array.isArray(rule.ruleCondition)
            ? rule.ruleCondition
            : [];

    const list = rawList.map((c) => {
        let op = CONDITION_SYMBOLS[c.conditionOperator] || c.conditionOperator || '';
        let val = formatConditionValue(c.conditionType, c.conditionValue, c.conditionValueType);
        if (c.conditionOperator === 'BETWEEN') {
            const maxVal = formatConditionValue(c.conditionType, c.conditionMaxValue, c.conditionValueType);
            val = `${val} - ${maxVal}`;
        }
        if (c.conditionStatus) {
            op = c.conditionStatus === 'NOT_ARCHIVED' ? '≠' : '=';
            val = c.conditionStatus === 'NOT_ARCHIVED' ? 'ARCHIVED' : c.conditionStatus;
        }
        if (c.conditionType === 'TargetingType') {
            op = 'in';
            val = (c.targetingTypes || []).join(', ') || '—';
        }
        return {
            type: c.conditionType || 'Condition',
            op,
            val,
            text: `${c.conditionType || ''} ${op} ${val}`.trim(),
        };
    });

    if (rule.isDaysSinceCreation && rule.daysSinceCreation != null) {
        list.push({
            type: 'Days Since Creation',
            op: '≥',
            val: String(rule.daysSinceCreation),
            text: `Days Since Creation ≥ ${rule.daysSinceCreation}`,
        });
    }

    return list;
};

const getRelativeDaysText = (dateStr) => {
    if (!dateStr) return { text: "—", days: 999 };
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

export const getTargetHistoryKey = (cid, targeting, matchType) => {
    if (!cid || !targeting) return null;
    const cleanCid = String(cid);
    const cleanTarget = String(targeting).toLowerCase().trim();
    if (matchType) {
        const cleanMatch = String(matchType).toLowerCase().replace(/^(keyword|automatic|targeting)\s*[-:]\s*/i, "").trim();
        return `${cleanCid}_${cleanTarget}_${cleanMatch}`;
    }
    return `${cleanCid}_${cleanTarget}`;
};

export const getPlacementHistoryKey = (cid, placement) => {
    if (!cid || !placement) return null;
    const cleanCid = String(cid);
    let normPlacement = String(placement).toLowerCase().trim();
    if (normPlacement.includes("top of search")) normPlacement = "top_of_search";
    else if (normPlacement.includes("product page")) normPlacement = "product_pages";
    else if (normPlacement.includes("rest of search")) normPlacement = "rest_of_search";
    else normPlacement = normPlacement.replace(/\s+/g, "_");
    return `${cleanCid}_placement_${normPlacement}`;
};

export const getUpdatedNumericValue = (item, actions = [], gridName = "") => {
    if (!item) return null;

    // 1. Campaign: budget column
    if (gridName === "Campaign" || (!gridName && item?.budget != null && !item?.targeting && !item?.placement)) {
        const rawBudget = item?.budget;
        if (rawBudget == null || isNaN(parseFloat(rawBudget))) return null;
        const curr = parseFloat(rawBudget);
        const action = (actions || []).find((a) => ['SetBudget', 'IncreaseBudget', 'DecreaseBudget'].includes(a?.actionName));
        if (!action) return curr;

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBudget") next = curr + diff;
        if (action.actionName === "DecreaseBudget") next = Math.max(1, curr - diff);
        if (action.actionName === "SetBudget") next = actionVal;
        return next;
    }

    // 2. Targeting: keyword bid column
    if (gridName === "Targeting" || (!gridName && (item?.targetingBid != null || item?.keywordBid != null || item?.targeting != null))) {
        const rawBid = item?.targetingBid != null ? item.targetingBid : (item?.keywordBid != null ? item.keywordBid : item?.bid);
        if (rawBid == null || isNaN(parseFloat(rawBid))) return null;
        const curr = parseFloat(rawBid);
        const action = (actions || []).find((a) => ['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(a?.actionName));
        if (!action) return curr;

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBid") next = curr + diff;
        if (action.actionName === "DecreaseBid") next = Math.max(0.02, curr - diff);
        if (action.actionName === "SetBid") next = actionVal;
        return next;
    }

    // 3. Placement: placement bid column
    if (gridName === "Placement" || (!gridName && (item?.placement != null || item?.placementBid != null))) {
        const rawBid = item?.placementBid != null ? item.placementBid : item?.bid;
        if (rawBid == null || isNaN(parseFloat(rawBid))) return null;
        const curr = parseFloat(rawBid);
        const action = (actions || []).find((a) => a?.placementType === item?.placement || (!a?.placementType && ['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(a?.actionName)));
        if (!action) return curr;

        const actionVal = parseFloat(action.actionValue || 0);
        let diff = actionVal;
        if (action.actionValueType === "Percentage") {
            diff = (curr * actionVal) / 100;
        }

        let next = curr;
        if (action.actionName === "IncreaseBid") next = curr + diff;
        if (action.actionName === "DecreaseBid") next = Math.max(0, curr - diff);
        if (action.actionName === "SetBid") next = actionVal;
        return next;
    }

    return null;
};

// ─── Column Definitions for each Grid Type ─────────────────────────────────────

const CAMPAIGN_COLUMNS = [
    { field: "isNew", headerName: "Tag", minWidth: 80, width: 85, maxWidth: 95, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "isNewCell" },
    { field: "campaignName", headerName: "Campaign Name", minWidth: 200, flex: 2, cellRenderer: "campaignNameCell" },
    { field: "campaignStatus", headerName: "Status", minWidth: 110, maxWidth: 170, cellRenderer: "campaignStatusCell" },
    { field: "budget", headerName: "Budget", minWidth: 130, cellRenderer: "budgetChangeCell" },
    { field: "impressions", headerName: "Impressions", minWidth: 110, cellRenderer: "numberCell" },
    { field: "clicks", headerName: "Clicks", minWidth: 90, cellRenderer: "numberCell" },
    { field: "spend", headerName: "Spend", minWidth: 100, cellRenderer: "currencyCell" },
    { field: "orders", headerName: "Orders", minWidth: 90, cellRenderer: "numberCell" },
    { field: "sales", headerName: "Sales", minWidth: 100, cellRenderer: "currencyCell" },
    { field: "acos", headerName: "ACoS", minWidth: 90, maxWidth: 100, cellRenderer: "acosCell" },
    { field: "roas", headerName: "ROAS", minWidth: 90, maxWidth: 100, cellRenderer: "roasCell" },
    { field: "cvr", headerName: "CVR", minWidth: 90, maxWidth: 100, cellRenderer: "cvrCell" },
    { field: "_history", headerName: "History", minWidth: 110, width: 130, maxWidth: 160, pinned: "right", suppressMovable: true, sortable: false, resizable: true, filter: false, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "historyActionCell" },
];

const PLACEMENT_COLUMNS = [
    { field: "isNew", headerName: "Tag", minWidth: 80, width: 85, maxWidth: 95, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "isNewCell" },
    { field: "campaignName", headerName: "Campaign Name", minWidth: 200, flex: 1.5, cellRenderer: "campaignNameCell" },
    { field: "campaignStatus", headerName: "Status", minWidth: 100, maxWidth: 120, cellRenderer: "statusCell" },
    { field: "placement", headerName: "Placement", minWidth: 140 },
    { field: "placementBid", headerName: "Placement Bid", minWidth: 140, cellRenderer: "placementBidChangeCell" },
    { field: "impressions", headerName: "Impressions", minWidth: 110, cellRenderer: "numberCell" },
    { field: "clicks", headerName: "Clicks", minWidth: 90, cellRenderer: "numberCell" },
    { field: "spend", headerName: "Spend", minWidth: 100, cellRenderer: "currencyCell" },
    { field: "orders", headerName: "Orders", minWidth: 90, cellRenderer: "numberCell" },
    { field: "sales", headerName: "Sales", minWidth: 100, cellRenderer: "currencyCell" },
    { field: "acos", headerName: "ACoS", minWidth: 90, maxWidth: 100, cellRenderer: "acosCell" },
    { field: "roas", headerName: "ROAS", minWidth: 90, maxWidth: 100, cellRenderer: "roasCell" },
    { field: "cvr", headerName: "CVR", minWidth: 90, maxWidth: 100, cellRenderer: "cvrCell" },
    { field: "_history", headerName: "History", minWidth: 110, width: 130, maxWidth: 160, pinned: "right", suppressMovable: true, sortable: false, resizable: true, filter: false, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "historyActionCell" },
];

const TARGETING_COLUMNS = [
    { field: "isNew", headerName: "Tag", minWidth: 80, width: 85, maxWidth: 95, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "isNewCell" },
    { field: "campaignName", headerName: "Campaign Name", minWidth: 180, flex: 1, cellRenderer: "campaignNameCell" },
    { field: "campaignStatus", headerName: "Campaign Status", minWidth: 110, maxWidth: 130, cellRenderer: "statusCell" },
    { field: "adGroupName", headerName: "Ad Group Name", minWidth: 160, flex: 1 },
    { field: "adGroupStatus", headerName: "Ad Group Status", minWidth: 110, maxWidth: 130, cellRenderer: "statusCell" },
    { field: "targeting", headerName: "Targeting", minWidth: 180, flex: 1 },
    { field: "matchType", headerName: "Target Type", minWidth: 110 },
    { field: "targetingBid", headerName: "Keyword Bid", minWidth: 140, cellRenderer: "targetingBidChangeCell" },
    { field: "keywordStatus", headerName: "Status", minWidth: 110, maxWidth: 170, cellRenderer: "targetingStatusCell" },
    { field: "impressions", headerName: "Impressions", minWidth: 110, cellRenderer: "numberCell" },
    { field: "clicks", headerName: "Clicks", minWidth: 90, cellRenderer: "numberCell" },
    { field: "spend", headerName: "Spend", minWidth: 100, cellRenderer: "currencyCell" },
    { field: "orders", headerName: "Orders", minWidth: 90, cellRenderer: "numberCell" },
    { field: "sales", headerName: "Sales", minWidth: 100, cellRenderer: "currencyCell" },
    { field: "acos", headerName: "ACoS", minWidth: 90, maxWidth: 100, cellRenderer: "acosCell" },
    { field: "roas", headerName: "ROAS", minWidth: 90, maxWidth: 100, cellRenderer: "roasCell" },
    { field: "cvr", headerName: "CVR", minWidth: 90, maxWidth: 100, cellRenderer: "cvrCell" },
    { field: "_history", headerName: "History", minWidth: 110, width: 130, maxWidth: 160, pinned: "right", suppressMovable: true, sortable: false, resizable: true, filter: false, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "historyActionCell" },
];

const SEARCH_TERM_COLUMNS = [
    { field: "isNew", headerName: "Tag", minWidth: 80, width: 85, maxWidth: 95, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "isNewCell" },
    { field: "campaignName", headerName: "Campaign Name", minWidth: 180, flex: 1, cellRenderer: "campaignNameCell" },
    { field: "campaignStatus", headerName: "Campaign Status", minWidth: 110, maxWidth: 130, cellRenderer: "statusCell" },
    { field: "adGroupName", headerName: "Ad Group Name", minWidth: 160, flex: 1 },
    { field: "adGroupStatus", headerName: "Ad Group Status", minWidth: 110, maxWidth: 130, cellRenderer: "statusCell" },
    { field: "searchTerm", headerName: "Search Term", minWidth: 180, flex: 1.2 },
    { field: "recommendedAction", headerName: "Recommended Action", minWidth: 180, cellRenderer: "searchTermActionCell" },
    { field: "impressions", headerName: "Impressions", minWidth: 110, cellRenderer: "numberCell" },
    { field: "clicks", headerName: "Clicks", minWidth: 90, cellRenderer: "numberCell" },
    { field: "spend", headerName: "Spend", minWidth: 100, cellRenderer: "currencyCell" },
    { field: "orders", headerName: "Orders", minWidth: 90, cellRenderer: "numberCell" },
    { field: "sales", headerName: "Sales", minWidth: 100, cellRenderer: "currencyCell" },
    { field: "acos", headerName: "ACoS", minWidth: 90, maxWidth: 100, cellRenderer: "acosCell" },
    { field: "roas", headerName: "ROAS", minWidth: 90, maxWidth: 100, cellRenderer: "roasCell" },
    { field: "cvr", headerName: "CVR", minWidth: 90, maxWidth: 100, cellRenderer: "cvrCell" },
    { field: "_history", headerName: "History", minWidth: 110, width: 130, maxWidth: 160, pinned: "right", suppressMovable: true, sortable: false, resizable: true, filter: false, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "historyActionCell" },
];

// ─── Column Configurations by Grid Type ───────────────────────────────────────
const GRID_COLUMN_CONFIG = {
    Campaign: CAMPAIGN_COLUMNS,
    Placement: PLACEMENT_COLUMNS,
    Targeting: TARGETING_COLUMNS,
    "Search Term": SEARCH_TERM_COLUMNS,
};

// Default columns if grid type not found
const DEFAULT_COLUMNS = [
    { field: "campaignName", headerName: "Campaign Name", minWidth: 200, flex: 1, cellRenderer: "campaignNameCell" },
    { field: "impressions", headerName: "Impressions", cellRenderer: "numberCell" },
    { field: "clicks", headerName: "Clicks", cellRenderer: "numberCell" },
    { field: "spend", headerName: "Spend", cellRenderer: "currencyCell" },
    { field: "sales", headerName: "Sales", cellRenderer: "currencyCell" },
    { field: "acos", headerName: "ACoS", cellRenderer: "acosCell" },
    { field: "_history", headerName: "History", minWidth: 110, width: 130, maxWidth: 160, pinned: "right", suppressMovable: true, sortable: false, resizable: true, filter: false, cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" }, cellRenderer: "historyActionCell" },
];


// ─── Static Cell Renderers ────────────────────────────────────────────────────
const StatusCell = ({ value, isNewTarget = false }) => {
    const isEnabled = value === "ENABLED";
    return (
        <span style={{
            background: isEnabled ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            color: isEnabled ? "#22c55e" : "#ef4444",
            border: `1px solid ${isEnabled ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            padding: "2px 8px",
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            boxShadow: isNewTarget ? (isEnabled ? "0 0 8px rgba(34, 197, 94, 0.25)" : "0 0 8px rgba(239, 68, 68, 0.25)") : "none"
        }}>
            {isEnabled ? "Enabled" : "Paused"}
        </span>
    );
};

const ACoSCell = ({ value }) => {
    if (value == null || isNaN(parseFloat(value))) return <span>—</span>;
    const num = parseFloat(value);
    const v = num.toFixed(2);
    const color = num === 0 ? "inherit" : num > 50 ? "#ef4444" : num > 30 ? "#f97316" : "#22c55e";
    return <span style={{ color, fontWeight: 600 }}>{v}%</span>;
};

const RoaSCell = ({ value }) => {
    if (value == null || isNaN(parseFloat(value))) return <span>—</span>;
    const num = parseFloat(value);
    const v = num.toFixed(2);
    const color = num < 1 ? "#ef4444" : num < 2 ? "#f97316" : "#22c55e";
    return <span style={{ color, fontWeight: 600 }}>{v}x</span>;
};

const CvrCell = ({ value }) => {
    if (value == null || isNaN(parseFloat(value))) return <span>—</span>;
    const num = parseFloat(value);
    const v = num.toFixed(2);
    const color = num > 10 ? "#22c55e" : num > 5 ? "#f97316" : "#ef4444";
    return <span style={{ color, fontWeight: 600 }}>{v}%</span>;
};

const CurrencyCell = ({ value }) => (
    <span className="text-slate-700 dark:text-slate-200 font-medium">{value != null ? CurrencyCode(value) : "—"}</span>
);

const NumberCell = ({ value }) => (
    <span className="text-slate-700 dark:text-slate-200 font-medium">{value != null ? Number(value).toLocaleString() : "—"}</span>
);

const DecimalCell = ({ value }) => (
    <span className="text-slate-700 dark:text-slate-200 font-medium">{value != null ? parseFloat(value).toFixed(2) : "—"}</span>
);

const IsNewCell = ({ value }) => {
    const isNew = Boolean(value);
    return (
        <span style={{
            background: isNew ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
            color: isNew ? "#22c55e" : "#94a3b8",
            border: `1px solid ${isNew ? "rgba(34, 197, 94, 0.35)" : "rgba(148, 163, 184, 0.3)"}`,
            padding: "2px 8px",
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.5px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "nowrap",
            lineHeight: "normal"
        }}>
            {isNew ? "NEW" : "OLD"}
        </span>
    );
};

// ─── Action label mapping ────────────────────────────────────────────────────
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

const PLACEMENT_LABEL_MAP = {
    "Top of Search": "Top Search",
    "Rest of Search": "Rest Search",
    "Product Page": "Product Page",
    "Product pages": "Product Page",
};

const getActionIcon = (actionName, size = 12) => {
    if (!actionName) return null;
    if (actionName.includes("Increase")) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
    if (actionName.includes("Decrease")) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>;
    if (actionName.includes("Pause")) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>;
    if (actionName.includes("Enable")) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
    if (actionName === "AddAsNegativeTargeting") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;
    if (actionName === "AddAsTargeting") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;

    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
};

const getActionColors = (actionName, isDark) => {
    return {
        bg: isDark ? "rgba(56, 189, 248, 0.12)" : "rgba(26, 159, 212, 0.08)",
        text: isDark ? "#38bdf8" : "#1A9FD4",
        border: isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(26, 159, 212, 0.18)"
    };
};

// ─── Helper: format date to yyyy-MM-dd ───────────────────────────────────────
function toYMD(date) {
    if (!date) return null;
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

const isPlacementMatch = (itemPlacement, targetPlacementType) => {
    if (!targetPlacementType || !itemPlacement) return false;
    const normTarget = String(targetPlacementType).toLowerCase().replace(/[^a-z0-9]/g, "");
    const normItem = String(itemPlacement).toLowerCase().replace(/[^a-z0-9]/g, "");

    if (normTarget.includes("top") && normItem.includes("top")) return true;
    if (normTarget.includes("rest") && normItem.includes("rest")) return true;
    if (normTarget.includes("product") && normItem.includes("product")) return true;

    return normTarget === normItem;
};

const formatActionDisplay = (action, gridName = "") => {
    if (!action) return "";
    const label = ACTION_LABEL_MAP[action.actionName] || action.actionName;
    let actionText = label;

    if (gridName === "Placement" && action.placementType) {
        const placementLabel = PLACEMENT_LABEL_MAP[action.placementType] || action.placementType;
        actionText = `${label} (${placementLabel})`;
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

const RecommendationInfoTooltip = ({ message, label }) => {
    const { t } = useTranslation();

    const tooltipMessage = message || t("These are the conditions and actions configured for this recommendation rule.");
    const tooltipLabel = label || t("View recommendation configuration details");

    return (
        <TooltipProvider delayDuration={100}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="w-5 h-5 rounded-full inline-flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 dark:hover:bg-sky-500/20 transition-all cursor-pointer border border-slate-200/80 dark:border-white/10 hover:border-sky-500/30 flex-shrink-0"
                        aria-label={tooltipLabel}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <FiInfo size={11} />
                    </button>
                </TooltipTrigger>
                <TooltipContent
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    className="z-[99999] max-w-[280px] bg-slate-900/95 dark:bg-[#0c1222]/95 backdrop-blur-xl text-white border border-slate-700/80 dark:border-white/15 rounded-xl px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.4)] animate-in fade-in-0 zoom-in-95 pointer-events-auto"
                >
                    <div className="flex items-center gap-2 text-xs text-left">
                        <span className="p-1 rounded-md bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0">
                            <FiInfo size={12} />
                        </span>
                        <span className="text-[11px] leading-relaxed text-slate-200 dark:text-slate-100 font-medium">
                            {tooltipMessage}
                        </span>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

const RecommendationHeaderCheckbox = React.memo(({ getRowId, toggleAll, headerCheckboxEvents, paginatedDataRef, selectedRowsRef }) => {
    const computeChecked = useCallback(() => {
        const visibleRows = paginatedDataRef?.current || [];
        if (!visibleRows.length || !selectedRowsRef?.current?.length) return false;
        const selIds = new Set(selectedRowsRef.current.map(getRowId));
        return visibleRows.every((r) => selIds.has(getRowId(r)));
    }, [getRowId, paginatedDataRef, selectedRowsRef]);

    const [checked, setChecked] = useState(computeChecked);

    useEffect(() => {
        const onUpdate = () => {
            setChecked(computeChecked());
        };
        headerCheckboxEvents?.addEventListener("change", onUpdate);
        onUpdate();
        return () => {
            headerCheckboxEvents?.removeEventListener("change", onUpdate);
        };
    }, [computeChecked, headerCheckboxEvents]);

    const handleToggle = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const nextVal = !checked;
        setChecked(nextVal);
        toggleAll(nextVal);
    };

    return (
        <div
            className="flex items-center justify-center w-full h-full cursor-pointer py-1"
            onClick={handleToggle}
            onMouseDown={(e) => e.stopPropagation()}
            title={checked ? "Deselect this page" : "Select all on this page"}
        >
            <StyledCheckbox
                checked={checked}
                onChange={handleToggle}
            />
        </div>
    );
});

function RecommendationModal({ show, onHide, snapshot, profileId, adType, loading: externalLoading, refreshGrid }) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    useEffect(() => {
        const handleTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handleTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const [internalRule, setInternalRule] = useState(snapshot?.rule || {});
    const rule = internalRule || snapshot?.rule || {};
    const actions = useMemo(() => (Array.isArray(rule?.actions) ? rule.actions : []), [rule?.actions]);
    const gridName = rule?.gridName || "";
    const ruleConditions = useMemo(() => parseRuleConditions(rule), [rule]);
    const lookbackLabel = rule?.reportDate
        ? (DATE_FILTER_LABEL_MAP[rule.reportDate] || String(rule.reportDate).replace(/_/g, " "))
        : null;
    const gridRef = useRef(null);
    const lastFetchedKeyRef = useRef("");

    // ─── Date range & pagination state ───
    const [dateRange, setDateRange] = useState([null, null]);
    const [internalData, setInternalData] = useState(snapshot?.data || []);
    const [internalCount, setInternalCount] = useState(snapshot?.totalRecords ?? snapshot?.count ?? 0);
    const [totalRecords, setTotalRecords] = useState(snapshot?.totalRecords ?? snapshot?.count ?? 0);
    const [currentPage, setCurrentPage] = useState(snapshot?.currentPage || 1);
    const [perPage, setPerPage] = useState(snapshot?.perPage || 25);
    const [dateLoading, setDateLoading] = useState(false);
    const [applyLoading, setApplyLoading] = useState(false);
    const [selectAllLoading, setSelectAllLoading] = useState(false);
    const allFetchedDataRef = useRef(null);

    // Seed date range and data whenever the snapshot or show changes
    useEffect(() => {
        if (!show || !snapshot) {
            setInternalData([]);
            setInternalCount(0);
            setTotalRecords(0);
            setInternalRule(null);
            setDateRange([null, null]);
            setLatestHistoryMap({});
            setSelectedRows([]);
            setOutsideHistoryScope("recommendation");
            setHistoryFilter("all");
            setCurrentPage(1);
            setPerPage(25);
            lastFetchedKeyRef.current = "";
            allFetchedDataRef.current = null;
            return;
        }

        const currentRule = snapshot?.rule || {};
        setInternalRule(currentRule);
        const from = currentRule?.fromDate ? new Date(currentRule.fromDate) : null;
        const to = currentRule?.toDate ? new Date(currentRule.toDate) : null;
        setDateRange([from, to]);
        setInternalData(snapshot?.data || []);
        const total = snapshot?.totalRecords ?? snapshot?.count ?? (snapshot?.data?.length || 0);
        setInternalCount(total);
        setTotalRecords(total);
        setCurrentPage(snapshot?.currentPage || 1);
    }, [show, snapshot?._id, snapshot?.rule?._id, snapshot?.data]);

    const transformedData = useMemo(() => {
        let list = (internalData || []).map((item, index) => ({
            ...item,
            id: item._id || `${item.campaignId}-${index}`,
            placementBid: item.placementBid || item.bid || null,
            keywordBid: item.keywordBid || item.bid || null,
            targetType: item.targetType || (item.targeting ? "Keyword" : null),
            keywordStatus: item.keywordStatus || item.status || "ENABLED",
            cvr: item.cvr || (item.orders && item.clicks ? (item.orders / item.clicks) * 100 : 0),
            placement: item.placement || item.placementType || null,
        }));

        if (gridName === "Placement" && actions.length > 0) {
            const placementTypes = actions.map((a) => a.placementType).filter(Boolean);
            if (placementTypes.length > 0) {
                list = list.filter((item) => {
                    if (!item.placement) return false;
                    return placementTypes.some((pt) => isPlacementMatch(item.placement, pt));
                });
            }
        }

        return list;
    }, [internalData, gridName, actions]);

    const [selectedRows, setSelectedRows] = useState([]);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedHistoryCampaign, setSelectedHistoryCampaign] = useState(null);
    const [latestHistoryMap, setLatestHistoryMap] = useState({});
    const latestHistoryMapRef = useRef(latestHistoryMap);
    useEffect(() => { latestHistoryMapRef.current = latestHistoryMap; }, [latestHistoryMap]);
    const [outsideHistoryScope, setOutsideHistoryScope] = useState("recommendation");
    const [historyFilter, setHistoryFilter] = useState("all"); // "all" | "unchanged" | "before_days"
    const [filterDays, setFilterDays] = useState(7);
    const selectedRowsRef = useRef([]);

    // ─── Filtered Data based on History Filter & Bid/Budget Threshold ───
    const filteredData = useMemo(() => {
        const list = transformedData || [];

        if (historyFilter === "less_than_one") {
            return list.filter((item) => {
                const val = getUpdatedNumericValue(item, actions, gridName);
                return val !== null && Number(val.toFixed(2)) < 1;
            });
        }

        // For all other filters ("all", "unchanged", "before_days"), exclude items whose updated value is < 1
        const nonLessThanOneList = list.filter((item) => {
            const val = getUpdatedNumericValue(item, actions, gridName);
            if (val === null) return true;
            return !(Number(val.toFixed(2)) < 1);
        });

        const getRowHistoryInfo = (item) => {
            const cid = item?.campaignId || item?.campaignID || item?.campaign_id;
            if (!cid) return null;

            // 1. Placement Grid / Row
            if (gridName === "Placement" || item?.placement) {
                if (item?.placement) {
                    const pKey = getPlacementHistoryKey(cid, item.placement);
                    if (latestHistoryMap[pKey]) return latestHistoryMap[pKey];
                }
                return latestHistoryMap[`${cid}_placement`] || null;
            }

            // 2. Targeting / Search Term Grid / Row
            const targeting = item?.targeting || item?.keywordText || item?.keyword || item?.targetName || item?.searchTerm;
            const matchType = item?.matchType || item?.targetType;
            if (targeting) {
                if (matchType) {
                    const matchKey = getTargetHistoryKey(cid, targeting, matchType);
                    return latestHistoryMap[matchKey] || null;
                }
                const targetKey = `${cid}_${String(targeting).toLowerCase().trim()}`;
                return latestHistoryMap[targetKey] || null;
            }

            // 3. Campaign Grid / Row (Campaign budget/status)
            return latestHistoryMap[String(cid)] || latestHistoryMap[Number(cid)] || null;
        };

        if (historyFilter === "all") return nonLessThanOneList;

        if (historyFilter === "unchanged") {
            return nonLessThanOneList.filter((item) => {
                const historyInfo = getRowHistoryInfo(item);
                return !historyInfo?.latestCreatedAt;
            });
        }

        if (historyFilter === "before_days") {
            const daysThreshold = Math.max(1, Number(filterDays) || 7);
            return nonLessThanOneList.filter((item) => {
                const historyInfo = getRowHistoryInfo(item);
                if (!historyInfo?.latestCreatedAt) return false;
                const relative = getRelativeDaysText(historyInfo.latestCreatedAt);
                return relative.days >= daysThreshold;
            });
        }

        if (historyFilter === "exact_days") {
            const targetDay = Math.max(0, parseInt(filterDays, 10) || 0);
            return nonLessThanOneList.filter((item) => {
                const historyInfo = getRowHistoryInfo(item);
                if (!historyInfo?.latestCreatedAt) return false;
                const relative = getRelativeDaysText(historyInfo.latestCreatedAt);
                return relative.days === targetDay;
            });
        }

        return nonLessThanOneList;
    }, [transformedData, historyFilter, filterDays, latestHistoryMap, actions, gridName]);

    // ─── Data slice / view for current page ───
    // If backend returned paginated data (totalRecords > internalData.length),
    // internalData is already the sliced page from backend. Otherwise fallback to client slice.
    const isServerPaginated = Boolean(totalRecords && totalRecords > internalData.length);
    const displayData = useMemo(() => {
        if (isServerPaginated) {
            return filteredData;
        }
        const start = (currentPage - 1) * perPage;
        return (filteredData || []).slice(start, start + perPage);
    }, [filteredData, isServerPaginated, currentPage, perPage]);

    const paginatedDataRef = useRef(displayData);
    paginatedDataRef.current = displayData;
    selectedRowsRef.current = selectedRows;

    const rowDataRef = useRef(filteredData);
    rowDataRef.current = filteredData;

    const headerCheckboxEvents = useMemo(() => new EventTarget(), []);

    useEffect(() => {
        headerCheckboxEvents.dispatchEvent(new Event("change"));
    }, [selectedRows, displayData, headerCheckboxEvents]);

    // Ensure currentPage does not exceed total pages
    useEffect(() => {
        const total = totalRecords || filteredData?.length || 0;
        const maxPage = Math.max(1, Math.ceil(total / perPage));
        if (currentPage > maxPage) {
            setCurrentPage(maxPage);
        }
    }, [totalRecords, filteredData?.length, perPage, currentPage]);

    const uniqueCampaignIds = useMemo(() => {
        const set = new Set();
        (transformedData || []).forEach((row) => {
            const cid = row?.campaignId || row?.campaignID || row?.campaign_id;
            if (cid) set.add(String(cid));
        });
        return Array.from(set).sort();
    }, [transformedData]);

    const campaignIdsKey = useMemo(() => {
        return uniqueCampaignIds.join(",");
    }, [uniqueCampaignIds]);

    useEffect(() => {
        if (!show) {
            lastFetchedKeyRef.current = "";
            return;
        }

        const activeProfileId = profileId || snapshot?.profileId;
        if (!campaignIdsKey || !activeProfileId) return;

        const requestKey = `${activeProfileId}_${campaignIdsKey}_${outsideHistoryScope}`;
        if (lastFetchedKeyRef.current === requestKey) {
            return;
        }

        let isMounted = true;
        lastFetchedKeyRef.current = requestKey;

        ApiGetLatestCampaignHistory({
            profileId: activeProfileId,
            campaignIds: uniqueCampaignIds,
            historyScope: outsideHistoryScope,
        }).then((res) => {
            if (isMounted && res?.isSuccess) {
                const mapData = res?.data || {};
                setLatestHistoryMap(mapData);
                latestHistoryMapRef.current = mapData;
                if (gridRef.current?.api) {
                    if (typeof gridRef.current.api.refreshCells === "function") {
                        gridRef.current.api.refreshCells({ columns: ["_history"], force: true });
                    }
                    if (typeof gridRef.current.api.redrawRows === "function") {
                        gridRef.current.api.redrawRows();
                    }
                }
            }
        }).catch((err) => {
            console.error("Failed to load latest campaign history:", err);
            if (lastFetchedKeyRef.current === requestKey) {
                lastFetchedKeyRef.current = "";
            }
        });

        return () => { isMounted = false; };
    }, [show, campaignIdsKey, uniqueCampaignIds, profileId, snapshot?.profileId, outsideHistoryScope]);

    useEffect(() => {
        setSelectedRows([]);
        setHistoryFilter("all");
        setCurrentPage(1);
    }, [show, snapshot?._id, adType]);

    const fetchData = useCallback(async (targetPage = 1, targetPerPage = perPage, targetDateRange = dateRange, targetFilter = historyFilter) => {
        const ruleId = snapshot?.rule?._id || snapshot?._id || internalRule?._id;
        if (!ruleId) return;

        const activeProfileId = profileId || snapshot?.profileId;
        const payload = {
            profileId: activeProfileId,
            page: targetPage,
            perPage: targetPerPage,
            filterType: targetFilter || "all",
        };

        if (targetDateRange && targetDateRange[0] && targetDateRange[1]) {
            payload.fromDate = toYMD(targetDateRange[0]);
            payload.toDate = toYMD(targetDateRange[1]);
        }

        setDateLoading(true);
        try {
            const res = await ApiGetRecommendationData(ruleId, payload);
            if (res?.isSuccess) {
                setInternalData(res.data || []);
                const total = res?.totalRecords ?? res?.count ?? (res.data ? res.data.length : 0);
                setInternalCount(total);
                setTotalRecords(total);
                setCurrentPage(res?.currentPage || targetPage);
                setPerPage(res?.perPage || targetPerPage);
                if (res?.rule) setInternalRule(res.rule);
                allFetchedDataRef.current = null;
            } else {
                Toast.error(res?.message || t("Failed to load recommendation data"));
            }
        } catch (err) {
            console.error("Failed to load recommendation data:", err);
            Toast.error(t("Failed to load recommendation data"));
        } finally {
            setDateLoading(false);
        }
    }, [snapshot, internalRule, profileId, perPage, dateRange, historyFilter, t]);

    const handleDateChange = useCallback(async (value) => {
        setDateRange(value);
        allFetchedDataRef.current = null;
        if (!value || !value[0] || !value[1]) return;
        setSelectedRows([]);
        fetchData(1, perPage, value, historyFilter);
    }, [fetchData, perPage, historyFilter]);

    const handlePageChange = useCallback((newPage) => {
        setCurrentPage(newPage);
        fetchData(newPage, perPage, dateRange, historyFilter);
    }, [fetchData, perPage, dateRange, historyFilter]);

    const handlePerPageChange = useCallback((newSize) => {
        setPerPage(newSize);
        setCurrentPage(1);
        fetchData(1, newSize, dateRange, historyFilter);
    }, [fetchData, dateRange, historyFilter]);

    const handleRefresh = useCallback(() => {
        allFetchedDataRef.current = null;
        fetchData(currentPage, perPage, dateRange, historyFilter);
        if (typeof refreshGrid === "function") {
            refreshGrid();
        }
    }, [fetchData, currentPage, perPage, dateRange, historyFilter, refreshGrid]);

    const loading = externalLoading || dateLoading;
    const rowData = transformedData;

    const getRowId = useCallback((row) => {
        if (!row) return "";
        if (gridName === "Campaign") return String(row.campaignId || row.campaignName || "");
        if (gridName === "Placement") return `${row.campaignId}-${row.placement}`;
        if (gridName === "Targeting") return `${row.campaignId}-${row.adGroupId}-${row.targetId || row.keywordId || row.targeting || ""}`;
        if (gridName === "Search Term") return `${row.campaignId}-${row.adGroupId}-${row.searchTerm}`;
        return String(row._id || `${row.campaignId}-${row.targetId || row.placement || ""}`);
    }, [gridName]);

    const refreshCheckboxCells = useCallback(() => {
        if (gridRef.current?.api) {
            gridRef.current.api.refreshCells({ columns: ["_checkbox"], force: true });
        }
    }, []);

    const toggleRow = useCallback((row) => {
        const rowId = getRowId(row);
        const already = selectedRowsRef.current.some((r) => getRowId(r) === rowId);

        if (already) {
            setSelectedRows((prev) => prev.filter((r) => getRowId(r) !== rowId));
        } else {
            setSelectedRows((prev) => [...prev, row]);
        }
        setTimeout(refreshCheckboxCells, 0);
    }, [refreshCheckboxCells, getRowId]);

    const toggleAll = useCallback((checked) => {
        const pageItems = paginatedDataRef.current || [];
        if (checked) {
            setSelectedRows((prev) => {
                const prevIds = new Set(prev.map(getRowId));
                const newItems = pageItems.filter((r) => !prevIds.has(getRowId(r)));
                return [...prev, ...newItems];
            });
        } else {
            const pageIds = new Set(pageItems.map(getRowId));
            setSelectedRows((prev) => prev.filter((r) => !pageIds.has(getRowId(r))));
        }
        setTimeout(refreshCheckboxCells, 0);
    }, [refreshCheckboxCells, getRowId]);

    const totalCount = totalRecords || (snapshot?.totalRecords ?? snapshot?.count ?? (filteredData?.length || 0));

    const isAllTotalSelected = useMemo(() => {
        if (!totalCount || totalCount === 0 || selectedRows.length === 0) return false;
        return selectedRows.length >= totalCount;
    }, [selectedRows.length, totalCount]);


    const handleSelectAllPagesToggle = useCallback(async () => {
        if (!totalCount || totalCount === 0) return;

        if (isAllTotalSelected) {
            setSelectedRows([]);
            setTimeout(refreshCheckboxCells, 0);
            return;
        }

        // If we already cached the all-rows list in memory:
        if (allFetchedDataRef.current && allFetchedDataRef.current.length >= totalCount) {
            setSelectedRows(allFetchedDataRef.current);
            setTimeout(refreshCheckboxCells, 0);
            return;
        }

        // If transformedData already has all records:
        if (transformedData && transformedData.length >= totalCount) {
            setSelectedRows(transformedData);
            allFetchedDataRef.current = transformedData;
            setTimeout(refreshCheckboxCells, 0);
            return;
        }

        // Otherwise fetch all items from API
        const ruleId = snapshot?.rule?._id || snapshot?._id || internalRule?._id;
        if (!ruleId) return;

        const activeProfileId = profileId || snapshot?.profileId;
        const payload = {
            profileId: activeProfileId,
            page: 1,
            perPage: totalCount,
            filterType: historyFilter || "all",
        };

        if (dateRange && dateRange[0] && dateRange[1]) {
            payload.fromDate = toYMD(dateRange[0]);
            payload.toDate = toYMD(dateRange[1]);
        }

        setSelectAllLoading(true);
        try {
            const res = await ApiGetRecommendationData(ruleId, payload);
            if (res?.isSuccess && Array.isArray(res?.data)) {
                let allList = (res.data || []).map((item, index) => ({
                    ...item,
                    id: item._id || `${item.campaignId}-${index}`,
                    placementBid: item.placementBid || item.bid || null,
                    keywordBid: item.keywordBid || item.bid || null,
                    targetType: item.targetType || (item.targeting ? "Keyword" : null),
                    keywordStatus: item.keywordStatus || item.status || "ENABLED",
                    cvr: item.cvr || (item.orders && item.clicks ? (item.orders / item.clicks) * 100 : 0),
                    placement: item.placement || item.placementType || null,
                }));

                if (gridName === "Placement" && actions.length > 0) {
                    const placementTypes = actions.map((a) => a.placementType).filter(Boolean);
                    if (placementTypes.length > 0) {
                        allList = allList.filter((item) => {
                            if (!item.placement) return false;
                            return placementTypes.some((pt) => isPlacementMatch(item.placement, pt));
                        });
                    }
                }

                if (historyFilter === "less_than_one") {
                    allList = allList.filter((item) => {
                        const val = getUpdatedNumericValue(item, actions, gridName);
                        return val !== null && Number(val.toFixed(2)) < 1;
                    });
                } else {
                    allList = allList.filter((item) => {
                        const val = getUpdatedNumericValue(item, actions, gridName);
                        if (val === null) return true;
                        return !(Number(val.toFixed(2)) < 1);
                    });
                }

                allFetchedDataRef.current = allList;
                setSelectedRows(allList);
                setTimeout(refreshCheckboxCells, 0);
            } else {
                Toast.error(res?.message || t("Failed to select all records"));
            }
        } catch (err) {
            console.error("Failed to fetch all recommendation records:", err);
            Toast.error(t("Failed to select all records"));
        } finally {
            setSelectAllLoading(false);
        }
    }, [totalCount, isAllTotalSelected, transformedData, snapshot, internalRule, profileId, dateRange, gridName, actions, historyFilter, refreshCheckboxCells, t]);

    const handleApplyDaysFilter = useCallback(() => {
        const minVal = historyFilter === "exact_days" ? 0 : 1;
        const val = Math.max(minVal, Number(filterDays) || (historyFilter === "exact_days" ? 0 : 7));
        setFilterDays(val);
        setCurrentPage(1);
        setTimeout(refreshCheckboxCells, 0);
    }, [filterDays, historyFilter, refreshCheckboxCells]);

    const handleFilterChange = useCallback((newFilter) => {
        const prevFilter = historyFilter;
        setHistoryFilter(newFilter);
        setCurrentPage(1);
        setSelectedRows([]);
        allFetchedDataRef.current = null;
        if (newFilter === "before_days" || newFilter === "exact_days") {
            const minVal = newFilter === "exact_days" ? 0 : 1;
            const val = Math.max(minVal, Number(filterDays) || (newFilter === "exact_days" ? 0 : 7));
            setFilterDays(val);
        }
        if (newFilter === "less_than_one" || prevFilter === "less_than_one") {
            fetchData(1, perPage, dateRange, newFilter);
        }
        setTimeout(refreshCheckboxCells, 0);
    }, [historyFilter, filterDays, perPage, dateRange, fetchData, refreshCheckboxCells]);

    const handleResetFilter = useCallback(() => {
        const prevFilter = historyFilter;
        setHistoryFilter("all");
        setFilterDays(7);
        setCurrentPage(1);
        setSelectedRows([]);
        allFetchedDataRef.current = null;
        if (prevFilter === "less_than_one") {
            fetchData(1, perPage, dateRange, "all");
        }
        setTimeout(refreshCheckboxCells, 0);
    }, [historyFilter, perPage, dateRange, fetchData, refreshCheckboxCells]);

    const handleScopeChange = useCallback((newScope) => {
        setOutsideHistoryScope(newScope);
        setCurrentPage(1);
        setTimeout(refreshCheckboxCells, 0);
    }, [refreshCheckboxCells]);

    // ─── Dynamic Cell Renderers with Recommended Changes & Navigation ───────────
    const cellRendererMap = useMemo(() => ({
        statusCell: StatusCell,
        acosCell: ACoSCell,
        roasCell: RoaSCell,
        cvrCell: CvrCell,
        currencyCell: CurrencyCell,
        numberCell: NumberCell,
        decimalCell: DecimalCell,
        isNewCell: IsNewCell,

        // Clickable Campaign Name navigation - Opens Campaign View in a new tab
        campaignNameCell: ({ value, data }) => {
            const campaignName = value || data?.campaignName || data?.name;
            const campaignId = data?.campaignId || data?.campaignID || data?.campaign_id;
            if (!campaignName && !campaignId) return <span>—</span>;

            const handleCampaignClick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                openCampaignViewInNewTab(data, campaignName, { campaignId });
            };

            return (
                <span
                    onClick={handleCampaignClick}
                    title={t("Open Campaign View: {{name}}", { name: campaignName || campaignId })}
                    className="text-sky-600 dark:text-[#38bdf8] hover:text-sky-700 dark:hover:text-sky-300 font-medium hover:underline cursor-pointer inline-flex items-center gap-1.5 max-w-full truncate group transition-colors"
                >
                    <span className="truncate">{campaignName || campaignId}</span>
                    <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0 text-sky-500"
                    >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                </span>
            );
        },

        // Campaign Status Change: e.g. [Enabled] → [Paused]
        campaignStatusCell: ({ value, data }) => {
            const action = actions.find((a) => ['CampaignEnable', 'CampaignPause'].includes(a.actionName));
            const currentStatus = value || data?.campaignStatus || "ENABLED";
            if (!action) {
                return <StatusCell value={currentStatus} />;
            }
            const targetStatus = action.actionName === "CampaignEnable" ? "ENABLED" : "PAUSED";
            if (currentStatus === targetStatus) {
                return <StatusCell value={currentStatus} />;
            }
            return (
                <div className="flex items-center gap-1.5 flex-nowrap">
                    <StatusCell value={currentStatus} />
                    <span className="text-slate-400 dark:text-slate-500 font-bold text-xs select-none">→</span>
                    <StatusCell value={targetStatus} isNewTarget />
                </div>
            );
        },

        // Budget Change: e.g. $30 → $40 (Positive Green / Negative Red)
        budgetChangeCell: ({ value, data }) => {
            const rawBudget = value != null ? value : data?.budget;
            if (rawBudget == null || isNaN(parseFloat(rawBudget))) return <span>—</span>;
            const currBudget = parseFloat(rawBudget);

            const action = actions.find((a) => ['SetBudget', 'IncreaseBudget', 'DecreaseBudget'].includes(a.actionName));
            if (!action) {
                return <span>{CurrencyCode(currBudget)}</span>;
            }

            const actionVal = parseFloat(action.actionValue || 0);
            let diff = actionVal;
            if (action.actionValueType === "Percentage") {
                diff = (currBudget * actionVal) / 100;
            }

            let newBudget = currBudget;
            if (action.actionName === "IncreaseBudget") newBudget = currBudget + diff;
            if (action.actionName === "DecreaseBudget") newBudget = Math.max(1, currBudget - diff);
            if (action.actionName === "SetBudget") newBudget = actionVal;

            const isPositive = newBudget > currBudget;
            const isNegative = newBudget < currBudget;
            const badgeClass = isPositive
                ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20"
                : isNegative
                    ? "text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/20"
                    : "text-sky-600 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/20";

            return (
                <div className="flex items-center gap-1.5 whitespace-nowrap font-medium text-xs">
                    <span className="text-slate-700 dark:text-slate-200 font-semibold">{CurrencyCode(currBudget)}</span>
                    <span className="text-slate-400 dark:text-slate-500 font-bold select-none">→</span>
                    <span className={`font-bold border px-1.5 py-0.5 rounded ${badgeClass}`}>
                        {CurrencyCode(newBudget)}
                    </span>
                </div>
            );
        },

        // Placement Bid Change: e.g. 20% → 40% or $1.50 → $2.00 (Positive Green / Negative Red)
        placementBidChangeCell: ({ value, data }) => {
            const rawBid = value != null ? value : data?.placementBid;
            const currBid = rawBid != null ? parseFloat(rawBid) : 0;
            const action = actions.find((a) => a.placementType === data?.placement || (!a.placementType && ['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(a.actionName)));

            const isPercentage = action?.actionValueType === "Percentage" || typeof value === "number" || (data?.placement && !String(value).includes("$"));

            if (!action) {
                return <span>{isPercentage ? `${parseFloat(currBid).toFixed(0)}%` : CurrencyCode(currBid)}</span>;
            }

            const actionVal = parseFloat(action.actionValue || 0);
            let diff = actionVal;
            if (action.actionValueType === "Percentage") {
                diff = (currBid * actionVal) / 100;
            }

            let newBid = currBid;
            if (action.actionName === "IncreaseBid") newBid = currBid + diff;
            if (action.actionName === "DecreaseBid") newBid = Math.max(0, currBid - diff);
            if (action.actionName === "SetBid") newBid = actionVal;

            const isPositive = newBid > currBid;
            const isNegative = newBid < currBid;
            const badgeClass = isPositive
                ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20"
                : isNegative
                    ? "text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/20"
                    : "text-sky-600 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/20";

            return (
                <div className="flex items-center gap-1.5 whitespace-nowrap font-medium text-xs">
                    <span className="text-slate-700 dark:text-slate-200 font-semibold">
                        {isPercentage ? `${parseFloat(currBid).toFixed(0)}%` : CurrencyCode(currBid)}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 font-bold select-none">→</span>
                    <span className={`font-bold border px-1.5 py-0.5 rounded ${badgeClass}`}>
                        {isPercentage ? `${parseFloat(newBid).toFixed(0)}%` : CurrencyCode(newBid)}
                    </span>
                </div>
            );
        },

        // Keyword/Targeting Bid Change: e.g. $1.50 → $1.80 (Positive Green / Negative Red)
        targetingBidChangeCell: ({ value, data }) => {
            const rawBid = value != null ? value : (data?.targetingBid != null ? data.targetingBid : data?.keywordBid);
            if (rawBid == null || isNaN(parseFloat(rawBid))) return <span>—</span>;
            const currBid = parseFloat(rawBid);

            const action = actions.find((a) => ['IncreaseBid', 'DecreaseBid', 'SetBid'].includes(a.actionName));
            if (!action) {
                return <span>{CurrencyCode(currBid)}</span>;
            }

            const actionVal = parseFloat(action.actionValue || 0);
            let diff = actionVal;
            if (action.actionValueType === "Percentage") {
                diff = (currBid * actionVal) / 100;
            }

            let newBid = currBid;
            if (action.actionName === "IncreaseBid") newBid = currBid + diff;
            if (action.actionName === "DecreaseBid") newBid = Math.max(0.02, currBid - diff);
            if (action.actionName === "SetBid") newBid = actionVal;

            const isPositive = newBid > currBid;
            const isNegative = newBid < currBid;
            const badgeClass = isPositive
                ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20"
                : isNegative
                    ? "text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/20"
                    : "text-sky-600 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/20";

            return (
                <div className="flex items-center gap-1.5 whitespace-nowrap font-medium text-xs">
                    <span className="text-slate-700 dark:text-slate-200 font-semibold">{CurrencyCode(currBid)}</span>
                    <span className="text-slate-400 dark:text-slate-500 font-bold select-none">→</span>
                    <span className={`font-bold border px-1.5 py-0.5 rounded ${badgeClass}`}>
                        {CurrencyCode(newBid)}
                    </span>
                </div>
            );
        },

        // Targeting Status Change: e.g. [Enabled] → [Paused]
        targetingStatusCell: ({ value, data }) => {
            const action = actions.find((a) => ['EnableTargeting', 'PauseTargeting'].includes(a.actionName));
            const currentStatus = value || data?.keywordStatus || data?.status || "ENABLED";
            if (!action) {
                return <StatusCell value={currentStatus} />;
            }
            const targetStatus = action.actionName === "EnableTargeting" ? "ENABLED" : "PAUSED";
            if (currentStatus === targetStatus) {
                return <StatusCell value={currentStatus} />;
            }
            return (
                <div className="flex items-center gap-1.5 flex-nowrap">
                    <StatusCell value={currentStatus} />
                    <span className="text-slate-400 dark:text-slate-500 font-bold text-xs select-none">→</span>
                    <StatusCell value={targetStatus} isNewTarget />
                </div>
            );
        },

        // Search Term Action: e.g. + Add Target (Exact)
        searchTermActionCell: () => {
            const action = actions.find((a) => ['AddAsTargeting', 'AddAsNegativeTargeting'].includes(a.actionName));
            if (!action) return <span className="text-slate-400">—</span>;

            const isNegative = action.actionName === "AddAsNegativeTargeting";
            const matchType = action.matchType || "Exact";

            return (
                <span
                    style={{
                        background: isNegative ? "rgba(239, 68, 68, 0.12)" : "rgba(34, 197, 94, 0.12)",
                        color: isNegative ? "#ef4444" : "#22c55e",
                        border: `1px solid ${isNegative ? "rgba(239, 68, 68, 0.25)" : "rgba(34, 197, 94, 0.25)"}`,
                        padding: "2px 8px",
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        whiteSpace: "nowrap"
                    }}
                >
                    {isNegative ? "− Add Negative" : "+ Add Target"} ({matchType})
                </span>
            );
        },

        // Sticky Campaign History Action Cell - Shows latest updated days (Click opens Campaign History Modal)
        historyActionCell: ({ data }) => {
            const cid = data?.campaignId || data?.campaignID || data?.campaign_id;
            const cname = data?.campaignName || data?.name || "";
            if (!cid) return <span className="text-slate-400">—</span>;

            const targeting = data?.targeting || data?.keywordText || data?.keyword || data?.targetName || data?.searchTerm;
            const matchType = data?.matchType || data?.targetType;
            const historyMap = latestHistoryMapRef.current || {};
            let historyInfo = null;

            if (gridName === "Placement" || data?.placement) {
                if (data?.placement) {
                    const pKey = getPlacementHistoryKey(cid, data.placement);
                    historyInfo = historyMap[pKey] || null;
                }
                if (!historyInfo) {
                    historyInfo = historyMap[`${cid}_placement`] || null;
                }
            } else if (targeting) {
                if (matchType) {
                    const matchKey = getTargetHistoryKey(cid, targeting, matchType);
                    historyInfo = historyMap[matchKey] || null;
                } else {
                    const targetKey = `${cid}_${String(targeting).toLowerCase().trim()}`;
                    historyInfo = historyMap[targetKey] || null;
                }
            } else {
                historyInfo = historyMap[String(cid)] || historyMap[Number(cid)] || null;
            }
            const latestDate = historyInfo?.latestCreatedAt;

            const handleHistoryClick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedHistoryCampaign({
                    campaignId: cid,
                    campaignName: cname,
                    profileId: data?.profileId || data?.profileSendID || profileId || snapshot?.profileId,
                    adType: data?.adType || adType || "SP",
                    gridName: gridName,
                    targeting: targeting,
                    matchType: matchType,
                    placement: data?.placement,
                    ruleName: rule?.ruleName || snapshot?.ruleName,
                    actions: actions,
                    rowData: data,
                    latestCreatedAt: latestDate,
                });
                setShowHistoryModal(true);
            };

            if (!latestDate) {
                return (
                    <button
                        type="button"
                        onClick={handleHistoryClick}
                        title={t("No change history found (Click to view)")}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-slate-400 dark:text-slate-400 hover:text-slate-200 border border-slate-300 dark:border-slate-700/60 hover:border-slate-500 bg-slate-100 dark:bg-slate-800/40 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                    >
                        <FiClock size={11} className="opacity-50 flex-shrink-0" />
                        <span>—</span>
                    </button>
                );
            }

            const relative = getRelativeDaysText(latestDate);
            const days = relative.days;
            const badgeColor =
                days <= 3
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-300 dark:hover:border-emerald-700"
                    : days <= 14
                        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200 dark:border-sky-800/60 hover:border-sky-300 dark:hover:border-sky-700"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600";

            return (
                <button
                    type="button"
                    onClick={handleHistoryClick}
                    title={t("Last updated: {{date}} (Click to view history)", { date: moment(latestDate).format("DD/MM/YYYY, hh:mm A") })}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-[11px] border transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer whitespace-nowrap ${badgeColor}`}
                >
                    <FiClock size={11} className="opacity-70 flex-shrink-0" />
                    <span>{relative.text}</span>
                </button>
            );
        },
    }), [actions, navigate, onHide, t, adType, profileId, snapshot]);

    const canUpdate = PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE);

    const columnDefs = useMemo(() => {
        const columns = GRID_COLUMN_CONFIG[gridName] || DEFAULT_COLUMNS;

        const checkboxColumn = {
            headerName: "",
            field: "_checkbox",
            minWidth: 46,
            width: 46,
            maxWidth: 50,
            pinned: "left",
            lockPinned: true,
            suppressMovable: true,
            sortable: false,
            resizable: false,
            filter: false,
            headerComponent: () => (
                <RecommendationHeaderCheckbox
                    getRowId={getRowId}
                    toggleAll={toggleAll}
                    headerCheckboxEvents={headerCheckboxEvents}
                    paginatedDataRef={paginatedDataRef}
                    selectedRowsRef={selectedRowsRef}
                />
            ),
            cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const checked = selectedRowsRef.current.some((r) => getRowId(r) === getRowId(row));
                return (
                    <StyledCheckbox
                        checked={checked}
                        onChange={() => toggleRow(row)}
                    />
                );
            },
        };

        const mappedColumns = columns.map((col) => {
            const base = {
                field: col.field,
                headerName: col.headerName,
                title: col.title || col.headerName,
                sortable: col.sortable !== undefined ? col.sortable : true,
                resizable: col.resizable !== undefined ? col.resizable : true,
                minWidth: col.minWidth || 100,
                width: col.width || null,
                flex: col.flex || null,
                maxWidth: col.maxWidth || null,
                pinned: col.pinned || undefined,
                suppressMovable: col.suppressMovable || (col.pinned ? true : undefined),
                lockPinned: col.lockPinned || (col.pinned ? true : undefined),
                lockPosition: col.lockPosition || (col.pinned ? "right" : undefined),
                cellStyle: col.cellStyle || undefined,
            };

            if (col.wrapText) base.wrapText = true;
            if (col.autoHeight) base.autoHeight = true;

            if (col.cellRenderer && cellRendererMap[col.cellRenderer]) {
                base.cellRenderer = cellRendererMap[col.cellRenderer];
            }

            return base;
        });

        return [
            ...(canUpdate ? [checkboxColumn] : []),
            ...mappedColumns
        ];
    }, [gridName, cellRendererMap, canUpdate, getRowId, toggleAll, headerCheckboxEvents, toggleRow]);

    const defaultColDef = useMemo(() => ({
        flex: 0,
        minWidth: 100,
        resizable: true,
        sortable: true,
    }), []);

    const formatAction = (action) => formatActionDisplay(action, gridName);

    const getGridTitle = () => {
        switch (gridName) {
            case "Campaign": return "Campaign Performance Data";
            case "Placement": return "Placement Performance Data";
            case "Targeting": return "Targeting Performance Data";
            case "Search Term": return "Search Term Performance Data";
            default: return "Performance Data";
        }
    };

    const isApplyingRef = useRef(false);

    const handleApplyClick = () => {
        if (applyLoading || isApplyingRef.current) return;
        if (selectedRows.length === 0) {
            Toast.error(t("Please select at least one campaign to apply."));
            return;
        }
        setShowReviewModal(true);
    };

    const handleRemoveReviewItem = (itemToRemove) => {
        const removeId = getRowId(itemToRemove);
        setSelectedRows((prev) => prev.filter((r) => getRowId(r) !== removeId));
        setTimeout(refreshCheckboxCells, 0);
    };

    const handleApplyConfirm = async () => {
        if (applyLoading || isApplyingRef.current) return;
        isApplyingRef.current = true;
        const ruleId = snapshot?.rule?._id || snapshot?._id;

        if (!ruleId) {
            Toast.error(t("Rule ID not found"));
            isApplyingRef.current = false;
            return;
        }

        setApplyLoading(true);

        try {
            const res = await ApiApplyRuleRecommendation(ruleId, { profileId, items: selectedRows });

            if (res?.isSuccess && res?.data?.isSuccess) {
                Toast.success(res?.data?.message || "Recommendation applied successfully");
                setShowReviewModal(false);
                setSelectedRows([]);
                lastFetchedKeyRef.current = "";
                await fetchData(currentPage, perPage, dateRange);
                if (typeof refreshGrid === "function") {
                    refreshGrid();
                }
            } else {
                Toast.error(res?.data?.message || "Failed to apply recommendation");
            }
        } catch (error) {
            console.error("Error applying recommendation:", error);
            Toast.error(t("Failed to apply recommendation"));
        } finally {
            setApplyLoading(false);
            isApplyingRef.current = false;
        }
    };

    return (
        <>
            <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
                <DialogContent
                    className="max-w-[1240px] w-[95vw] p-6 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[92vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
                    onInteractOutside={(e) => e.preventDefault()}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    {/* Circuit top glow line indicator */}
                    <div
                        className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                        style={{
                            background: "linear-gradient(90deg, transparent 0%, #2374F2 25%, #3ECFA8 60%, #7c64ff 80%, transparent 100%)",
                            opacity: 0.8
                        }}
                    />

                    {/* ── Header ── */}
                    <div className="flex flex-col w-full pb-4 border-b border-slate-100 dark:border-white/10 pr-8">
                        {/* Row 1: Rule name */}
                        <div style={{ fontSize: 18, fontWeight: 700, color: isDark ? "#ffffff" : "#1e293b", marginBottom: 10, lineHeight: 1.3 }}>
                            {rule?.ruleName || "Recommendation"}
                        </div>

                        {/* Row 2: Badges LEFT | Date picker RIGHT */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            {/* Left: badges */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="bg-sky-500/10 dark:bg-sky-500/12 text-sky-600 dark:text-[#38bdf8] border border-sky-500/20 dark:border-sky-500/25 px-3 py-1 rounded-full text-xs font-semibold">
                                    {gridName || "Unknown"}
                                </span>
                                <span className="bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/8 px-3 py-1 rounded-full text-xs font-semibold">
                                    Total: {totalRecords || transformedData.length} items
                                </span>
                                {selectedRows.length > 0 && (
                                    <span className="bg-emerald-500/10 dark:bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/25 px-3 py-1 rounded-full text-xs font-semibold">
                                        Selected: {selectedRows.length}
                                    </span>
                                )}
                            </div>

                            {/* Right: date picker + spinner */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {dateLoading && (
                                    <div className="w-4 h-4 border-2 border-slate-200 border-t-sky-500 dark:border-white/10 dark:border-t-[#38bdf8] rounded-full animate-spin" />
                                )}
                                <DateRangePicker
                                    className="w-full sm:w-[260px]"
                                    style={{ minWidth: 210, height: 34 }}
                                    ranges={predefinedRanges}
                                    value={dateRange}
                                    placeholder={t("Select Date")}
                                    onChange={handleDateChange}
                                    placement="bottomEnd"
                                    format="yyyy-MM-dd"
                                    cleanable={false}
                                />
                            </div>
                        </div>

                        {/* Row 3: Configured Conditions */}
                        {(ruleConditions.length > 0 || lookbackLabel) && (
                            <div className="flex flex-wrap items-center gap-2 mt-3.5">
                                <div className="inline-flex items-center gap-1.5">
                                    <span className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/40 border border-slate-200/50 dark:border-white/8 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider">
                                        {t("Conditions")}
                                    </span>
                                    <RecommendationInfoTooltip
                                        message={t("These are the conditions configured for this recommendation rule.")}
                                        label={t("View recommendation configuration conditions")}
                                    />
                                </div>
                                {lookbackLabel && (
                                    <span
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 shadow-sm"
                                        title={t("Configured lookback period: {{val}}", { val: lookbackLabel })}
                                    >
                                        <FiCalendar size={11} className="text-indigo-500 flex-shrink-0" />
                                        <span>{t(lookbackLabel)}</span>
                                    </span>
                                )}
                                {ruleConditions.map((cond, idx) => (
                                    <div key={idx} className="inline-flex items-center gap-1.5">
                                        {(idx > 0 || lookbackLabel) && (
                                            <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider select-none">
                                                AND
                                            </span>
                                        )}
                                        <span
                                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-700 dark:text-[#38bdf8] border border-sky-500/25 shadow-sm"
                                            title={cond.text}
                                        >
                                            <span className="font-bold">{cond.type}</span>
                                            <span className="font-mono text-slate-500 dark:text-slate-400 font-bold">{cond.op}</span>
                                            <span className="font-mono font-bold text-sky-600 dark:text-sky-300">{cond.val}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Row 4: Action pills */}
                        {actions.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mt-2.5">
                                <div className="inline-flex items-center gap-1.5">
                                    <span className="bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/40 border border-slate-200/50 dark:border-white/8 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider">
                                        Action
                                    </span>
                                    <RecommendationInfoTooltip
                                        message={t("These are the actions configured for this recommendation rule.")}
                                        label={t("View recommendation configuration actions")}
                                    />
                                </div>
                                {actions.map((action, idx) => {
                                    const actionText = formatAction(action);
                                    const colors = getActionColors(action.actionName, isDark);
                                    return (
                                        <div key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border" style={{
                                            background: colors.bg,
                                            borderColor: colors.border,
                                            color: colors.text
                                        }}>
                                            <span className="flex items-center justify-center">
                                                {getActionIcon(action.actionName, 12)}
                                            </span>
                                            <span className="font-bold text-xs">
                                                {actionText}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Section Title & History Filter (Above and outside table container) ── */}
                    <div className="pt-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                {getGridTitle()}
                            </span>
                            {historyFilter !== "all" && historyFilter !== "less_than_one" && (
                                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-[#38bdf8] border border-sky-500/20">
                                    {t("Filtered: {{count}} of {{total}}", { count: filteredData.length, total: transformedData.length })}
                                </span>
                            )}
                            {canUpdate && displayData.length > 0 && (
                                <button
                                    type="button"
                                    id="recommendation-select-all-total-btn"
                                    onClick={handleSelectAllPagesToggle}
                                    disabled={selectAllLoading}
                                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-wait ${
                                        isAllTotalSelected
                                            ? "bg-sky-500 text-white border-sky-600 dark:bg-sky-600 dark:border-sky-500 hover:bg-sky-600"
                                            : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-white/10 hover:border-sky-500/50 hover:bg-sky-50/50 dark:hover:bg-white/5"
                                    }`}
                                    title={isAllTotalSelected ? t("Deselect all records") : t("Select all {{count}} records", { count: totalCount })}
                                >
                                    {selectAllLoading ? (
                                        <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin flex-shrink-0" />
                                    ) : (
                                        <StyledCheckbox
                                            checked={isAllTotalSelected}
                                            onChange={handleSelectAllPagesToggle}
                                        />
                                    )}
                                    <span>
                                        {selectAllLoading
                                            ? t("Selecting all...")
                                            : isAllTotalSelected
                                                ? t("Deselect All")
                                                : t("Select All")}
                                    </span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                                            isAllTotalSelected
                                                ? "bg-white/25 text-white"
                                                : "bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-[#38bdf8]"
                                        }`}
                                    >
                                        {selectedRows.length > 0 && isAllTotalSelected
                                            ? `${selectedRows.length} / ${totalCount}`
                                            : totalCount.toLocaleString()}
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Filter controls right where red box is */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* History Scope Filter */}
                            <Select
                                value={outsideHistoryScope}
                                onValueChange={(val) => handleScopeChange(val)}
                            >
                                <SelectTrigger
                                    id="recommendation-outside-history-scope"
                                    className="w-auto min-w-[210px] h-[34px] px-3 text-xs font-medium bg-white dark:bg-[#1e293b]/70 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1e293b] focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-sm cursor-pointer gap-2 transition-colors"
                                >
                                    <SelectValue>
                                        {outsideHistoryScope === "recommendation"
                                            ? t("Recommendation History")
                                            : outsideHistoryScope === "dayparting"
                                            ? t("Dayparting History")
                                            : outsideHistoryScope === "other"
                                            ? t("Other History")
                                            : t("All History")}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="z-[100000]">
                                    <SelectItem value="recommendation" className="text-xs font-medium cursor-pointer">
                                        {t("Recommendation History")}
                                    </SelectItem>
                                    <SelectItem value="dayparting" className="text-xs font-medium cursor-pointer">
                                        {t("Dayparting History")}
                                    </SelectItem>
                                    <SelectItem value="other" className="text-xs font-medium cursor-pointer">
                                        {t("Other History")}
                                    </SelectItem>
                                    <SelectItem value="all" className="text-xs font-medium cursor-pointer">
                                        {t("All History")}
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Campaign / History Filter */}
                            <Select
                                value={historyFilter}
                                onValueChange={(val) => handleFilterChange(val)}
                            >
                                <SelectTrigger
                                    id="recommendation-history-filter"
                                    className="w-auto min-w-[195px] h-[34px] px-3 text-xs font-medium bg-white dark:bg-[#1e293b]/70 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1e293b] focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-sm cursor-pointer gap-2 transition-colors"
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <FiFilter size={13} className="text-slate-400 dark:text-slate-400 shrink-0" />
                                        <SelectValue>
                                            {historyFilter === "all"
                                                ? t("All Campaigns")
                                                : historyFilter === "less_than_one"
                                                ? t("Show Data Less Than 1")
                                                : historyFilter === "unchanged"
                                                ? t("Unchanged Campaigns (No History)")
                                                : historyFilter === "before_days"
                                                ? t("Changed Before")
                                                : historyFilter === "exact_days"
                                                ? t("Exact Match")
                                                : t("Filter")}
                                        </SelectValue>
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="z-[100000]">
                                    <SelectItem value="all" className="text-xs font-medium cursor-pointer">
                                        {t("All Campaigns")}
                                    </SelectItem>
                                    <SelectItem value="less_than_one" className="text-xs font-medium cursor-pointer">
                                        {t("Show Data Less Than 1")}
                                    </SelectItem>
                                    <SelectItem value="unchanged" className="text-xs font-medium cursor-pointer">
                                        {t("Unchanged Campaigns (No History)")}
                                    </SelectItem>
                                    <SelectItem value="before_days" className="text-xs font-medium cursor-pointer">
                                        {t("Changed Before")}
                                    </SelectItem>
                                    <SelectItem value="exact_days" className="text-xs font-medium cursor-pointer">
                                        {t("Exact Match")}
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            {(historyFilter === "before_days" || historyFilter === "exact_days") && (
                                <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                                    <input
                                        id="recommendation-history-filter-days"
                                        type="number"
                                        min={historyFilter === "exact_days" ? "0" : "1"}
                                        max="365"
                                        value={filterDays}
                                        onChange={(e) => setFilterDays(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleApplyDaysFilter();
                                            }
                                        }}
                                        placeholder={t("Days")}
                                        className="w-[60px] h-[34px] px-2 text-xs font-bold text-center bg-white dark:bg-[#1e293b]/70 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-sm"
                                    />
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                        {t("Days")}
                                    </span>
                                </div>
                            )}

                            {historyFilter !== "all" && (
                                <button
                                    type="button"
                                    onClick={handleResetFilter}
                                    title={t("Reset filter")}
                                    className="h-[34px] w-[34px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e293b]/70 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shadow-sm"
                                >
                                    <FiX size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Body ── */}
                    <div className="flex-1 overflow-hidden py-1 flex flex-col min-h-0">
                        {(externalLoading || (dateLoading && displayData.length === 0)) ? (
                            <div className="text-center py-12 flex flex-col items-center justify-center">
                                <div className="w-8 h-8 border-3 border-slate-100 border-t-sky-500 dark:border-white/5 dark:border-t-[#38bdf8] rounded-full animate-spin mb-3" />
                                <span className="text-sm font-medium text-slate-500 dark:text-white/50">{t("Loading data...")}</span>
                            </div>
                        ) : (displayData.length === 0 && !dateLoading) ? (
                            <div className="text-center py-10 text-slate-400 dark:text-white/40 flex flex-col items-center justify-center">
                                <span className="text-4xl mb-3">🔍</span>
                                <span className="text-sm">{historyFilter !== "all" ? t("No campaigns match the selected filter criteria.") : t("No data available for this recommendation.")}</span>
                                {historyFilter !== "all" && (
                                    <button
                                        type="button"
                                        onClick={handleResetFilter}
                                        className="mt-3 text-xs text-sky-600 dark:text-[#38bdf8] underline cursor-pointer font-semibold"
                                    >
                                        {t("Reset Filter")}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="data_table flex flex-col flex-1 min-h-0 [&_.glass-grid-container]:!rounded-2xl [&_.iq-ag-table]:!rounded-t-2xl [&_.ag-root-wrapper]:!rounded-t-2xl [&_.iq-pagination]:!rounded-b-2xl [&_.iq-pagination]:!flex-shrink-0" id="recommandation-modal-grid">
                                <AgTable
                                    onRefresh={handleRefresh}
                                    ref={gridRef}
                                    tableId={`recommendation-table-${gridName}`}
                                    height={"calc(86vh - 430px)"}
                                    minHeight={"240px"}
                                    rowData={displayData}
                                    columnDefs={columnDefs}
                                    defaultColDef={defaultColDef}
                                    totalRecords={totalRecords || filteredData.length}
                                    perPage={perPage}
                                    currentPage={currentPage}
                                    onPageChange={handlePageChange}
                                    onPerPageChange={handlePerPageChange}
                                    paginationOptions={[25, 50, 100, 200]}
                                    isCustomSaveColumns={true}
                                    customSaveColumnName={`Recommendation_${gridName || "grid"}`}
                                    loading={dateLoading}
                                />
                            </div>
                        )}
                    </div>

                    {/* ── Footer ── */}
                    <div className="flex items-center justify-end pt-4 border-t border-slate-100 dark:border-white/10 gap-3">
                        <button
                            id="recommandation-modal-close"
                            onClick={onHide}
                            className="h-[40px] px-6 rounded-xl flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
                            type="button"
                        >
                            Close
                        </button>
                        {PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE) && (
                            <button
                                id="recommandation-review"
                                onClick={handleApplyClick}
                                disabled={selectedRows.length === 0 || loading || applyLoading}
                                className="auth-btn-primary h-[40px] px-6 flex items-center justify-center !py-0 !leading-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    width: "auto",
                                    marginBottom: 0,
                                    opacity: selectedRows.length === 0 ? 0.6 : 1,
                                    background: selectedRows.length === 0 ? (isDark ? "rgba(255,255,255,0.08)" : "#cbd5e1") : undefined,
                                    color: selectedRows.length === 0 ? (isDark ? "rgba(255,255,255,0.3)" : "#94a3b8") : undefined,
                                    border: selectedRows.length === 0 ? "none" : undefined
                                }}
                                type="button"
                            >
                                {applyLoading ? t("Loading...") : `Review ${selectedRows.length > 0 ? `(${selectedRows.length})` : ""}`}
                            </button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Campaign History Modal (Last 30 Days) */}
            {showHistoryModal && selectedHistoryCampaign && (
                <CampaignHistoryModal
                    show={showHistoryModal}
                    setShow={setShowHistoryModal}
                    campaignId={selectedHistoryCampaign.campaignId}
                    campaignName={selectedHistoryCampaign.campaignName}
                    profileId={selectedHistoryCampaign.profileId || profileId || snapshot?.profileId}
                    adType={selectedHistoryCampaign.adType || adType || "SP"}
                    gridName={selectedHistoryCampaign.gridName || gridName}
                    targeting={selectedHistoryCampaign.targeting}
                    matchType={selectedHistoryCampaign.matchType}
                    placement={selectedHistoryCampaign.placement}
                    ruleName={selectedHistoryCampaign.ruleName || rule?.ruleName || snapshot?.ruleName}
                    actions={selectedHistoryCampaign.actions || actions}
                    recommendationData={selectedHistoryCampaign.rowData}
                    initialHistoryScope={outsideHistoryScope}
                    latestCreatedAt={selectedHistoryCampaign.latestCreatedAt}
                />
            )}

            {/* Recommendation Review & Confirmation Modal */}
            {showReviewModal && (
                <RecommendationReviewModal
                    show={showReviewModal}
                    onHide={() => setShowReviewModal(false)}
                    rule={rule}
                    actions={actions}
                    gridName={gridName}
                    selectedItems={selectedRows}
                    onRemoveItem={handleRemoveReviewItem}
                    onConfirmApply={handleApplyConfirm}
                    applyLoading={applyLoading}
                    latestHistoryMap={latestHistoryMap}
                    filterType={historyFilter}
                    filterDays={filterDays}
                    getRowId={getRowId}
                />
            )}
        </>
    );
}

export default RecommendationModal;