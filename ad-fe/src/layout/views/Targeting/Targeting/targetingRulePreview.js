import isPropValid from '@emotion/is-prop-valid';
import CurrencyCode from '../../../../helper/currencyCode/CurrencyCode';

const SYMBOLS = { LESS_THAN_OR_EQUAL_TO: '≤', GREATER_THAN_OR_EQUAL_TO: '≥', LESS_THAN: '<', GREATER_THAN: '>', EQUAL_TO: '=', NOT_EQUAL_TO: '≠', BETWEEN: 'Between' };
const DATES = { LAST_7_DAYS_1: 'Last 7 Days (excluding today)', TODAY: 'Today', YESTERDAY: 'Yesterday', THIS_WEEK: 'This Week', LAST_WEEK: 'Last Week', THIS_MONTH: 'This Month', LAST_MONTH: 'Last Month', YEAR_TO_DATE: 'Year to Date', LIFETIME: 'Lifetime' };
export const formatRuleValue = (type, value) => {
    if (value === undefined || value === null || value === '') return '—';
    const key = String(type).toLowerCase();
    if (['acos', 'ctr', 'cvr', 'conversionrate', 'top of search is', 'topofsearchimpressionshare'].includes(key)) return `${value}%`;
    if (key === 'roas') return `${value}x`;
    if (['cost', 'spend', 'sales', 'cpc', 'keywordbid', 'bid', 'budget'].includes(key)) return CurrencyCode(value);
    return String(value);
};
const describeIds = (items) => (items || []).map(item => typeof item === 'object' ? (item.label || item.name || item.value || item._id) : item).join(', ');
export const getConditionSummary = (rule) => {
    if (!rule) return { conditions: [], dateLabel: 'Not configured', actionLabel: '', ariaSummary: '' };
    const dateLabel = (DATES[rule.reportDate] || String(rule.reportDate || 'Not configured').replace(/_/g, ' ').replace(/LAST (\d+) DAYS/, 'Last $1 Days')) + (rule.reportDate === 'YEAR_TO_DATE' && rule.toDate ? ` (through ${rule.toDate})` : '');
    const conditions = (rule.conditions || []).map(c => {
        let op = SYMBOLS[c.conditionOperator] || c.conditionOperator || '';
        let val = formatRuleValue(c.conditionType, c.conditionValue);
        if (c.conditionOperator === 'BETWEEN') val = `${val} and ${formatRuleValue(c.conditionType, c.conditionMaxValue)}`;
        if (c.conditionStatus) { op = c.conditionStatus === 'NOT_ARCHIVED' ? '≠' : '='; val = c.conditionStatus === 'NOT_ARCHIVED' ? 'ARCHIVED' : c.conditionStatus; }
        if (c.conditionType === 'TargetingType') { op = 'in'; val = (c.targetingTypes || []).join(', ') || '—'; }
        if (c.conditionType === 'CampaignsAndAdGroups') { op = ''; val = [`Campaigns: ${describeIds(c.campaigns?.length ? c.campaigns : c.campaignIds) || 'All'}`, `Ad groups: ${describeIds(c.adGroups?.length ? c.adGroups : c.adGroupIds) || 'All'}`].join('; '); }
        return { type: c.conditionType, op, val, text: `${c.conditionType} ${op} ${val}`.trim() };
    });
    if (rule.isDaysSinceCreation) conditions.push({ type: 'Days Since Creation', op: '≥', val: rule.daysSinceCreation ?? 0, text: `Days Since Creation ≥ ${rule.daysSinceCreation ?? 0}` });
    const action = rule.actionType || {};
    const stateAction = ['Enabled', 'Paused', 'CampaignEnabled', 'CampaignPaused', 'AdGroupEnabled', 'AdGroupPaused'].includes(action.actionName);
    const actionLabel = !action.actionName ? '' : stateAction ? action.actionName : `${action.actionName} ${action.actionValueType === 'Percentage' ? `${action.actionValue ?? 0}%` : CurrencyCode(action.actionValue ?? 0)}`;
    return { conditions, dateLabel, actionLabel, ariaSummary: [`Date Range: ${dateLabel}`, ...conditions.map(c => c.text), actionLabel && `Action: ${actionLabel}`].filter(Boolean).join('; ') };
};
export const rowIdentity = (type, row) => JSON.stringify([type, row.campaignId, row.adGroupId, row.targetId ?? row.keywordId].map(value => String(value ?? '')));
export const consumeShiftWheel = (event, scrollable) => {
    if (!event.shiftKey || event.deltaX || !event.deltaY || !scrollable) return false;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scrollable.clientWidth : 1;
    const next = Math.max(0, Math.min(scrollable.scrollWidth - scrollable.clientWidth, scrollable.scrollLeft + event.deltaY * scale));
    if (next === scrollable.scrollLeft) return false;
    scrollable.scrollLeft = next;
    event.preventDefault();
    return true;
};

// Table v7 layout props remain available to styled components, but must not reach DOM nodes.
export const forwardTableProp = (prop, target) => typeof target !== "string" || isPropValid(prop);
