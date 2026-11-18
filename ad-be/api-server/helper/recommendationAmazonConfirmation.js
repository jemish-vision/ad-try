const ENTITY_ID_FIELDS = ['targetId', 'keywordId', 'campaignId', 'adId'];
const RESPONSE_GROUPS = {
    targets: ['targetingClauses'],
    targetingClauses: ['targets'],
    negativeTargets: ['negativeTargetingClauses'],
    negativeTargetingClauses: ['negativeTargets']
};

const hasErrorDetails = value => value && (typeof value !== 'object' || Object.keys(value).length > 0);
const hasError = row => hasErrorDetails(row?.error) || hasErrorDetails(row?.errors) ||
    hasErrorDetails(row?.errorDetails) || (row?.code == null && hasErrorDetails(row?.details));
const isSuccessCode = code => code === 'SUCCESS' || code === 200 || code === 201 || code === '200' || code === '201';
const asArray = value => Array.isArray(value) ? value : [];

// SP and newer SB APIs return named success/error groups with request indices.
// Legacy SB/SD APIs return one outcome per request in an array.
const confirmedRecommendationIndexes = (response, payload, { create = false } = {}) => {
    if (![200, 201, 207].includes(response?.status)) return [];
    const requestGroup = !Array.isArray(payload) && Object.keys(payload || {}).find(key => Array.isArray(payload[key]));
    const requests = requestGroup ? payload[requestGroup] : payload;
    if (!Array.isArray(requests) || !requests.length) return [];

    const data = response.data;
    const responseGroup = requestGroup && [requestGroup, ...(RESPONSE_GROUPS[requestGroup] || [])]
        .map(key => data?.[key]).find(group => group != null);
    const outcomes = responseGroup || data;
    const idField = !create && ENTITY_ID_FIELDS.find(field => requests[0]?.[field] != null);
    const indexById = new Map();
    if (idField) {
        requests.forEach((item, index) => {
            const id = String(item[idField]);
            indexById.set(id, indexById.has(id) ? -1 : index);
        });
    }
    const match = (item, legacyIndex = -1) => {
        const id = idField && item?.[idField];
        const explicitIndex = item?.index;
        if (explicitIndex != null) {
            if (typeof explicitIndex !== 'number' && (typeof explicitIndex !== 'string' || !/^\d+$/.test(explicitIndex))) return -1;
            const index = Number(explicitIndex);
            if (!Number.isInteger(index) || index < 0 || index >= requests.length) return -1;
            if (id != null && id !== false && String(requests[index][idField]) !== String(id)) return -1;
            return index;
        }
        if (idField && id != null) return indexById.get(String(id)) ?? -1;
        return legacyIndex;
    };
    const confirmed = new Set();
    const rejected = new Set();
    if (Array.isArray(outcomes)) {
        outcomes.forEach((item, index) => {
            const positional = outcomes.length === requests.length && (create || item?.code != null) ? index : -1;
            const requestIndex = match(item, positional);
            if (requestIndex < 0 || !item) return;
            const explicitSuccess = isSuccessCode(item.code) || (item.code == null && idField && item[idField] != null);
            (explicitSuccess && !hasError(item) ? confirmed : rejected).add(requestIndex);
        });
    } else {
        for (const item of asArray(outcomes?.success)) {
            const index = match(item);
            if (index >= 0 && !hasError(item) && (item?.code == null || isSuccessCode(item.code))) confirmed.add(index);
        }
        for (const item of [...asArray(outcomes?.error), ...asArray(outcomes?.errors)]) {
            const index = match(item);
            if (index >= 0) rejected.add(index);
        }
    }
    return [...confirmed].filter(index => !rejected.has(index));
};

module.exports = { confirmedRecommendationIndexes };
