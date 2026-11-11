const moment = require("moment-timezone");

const normalized = value => String(value ?? "").trim().toLowerCase();
const targetId = value => normalized(value).replace(/^[tk]-/, "");
const campaignId = row => normalized(row.changeLevel || row.campaignId || row.campaignDetails?.campaignId);
const matchType = value => normalized(value)
    .replace(/^(keyword|automatic|targeting|product target)\s*[-:]\s*/, "")
    .replace(/^targeting_expression_/, "");

function placementKey(value) {
    const text = normalized(value).replace(/[_-]+/g, " ");
    if (/^(placement )?top$|top (?:of )?search/.test(text)) return "top";
    if (/rest (?:of )?search/.test(text)) return "rest";
    if (/product pages?/.test(text)) return "product";
    if (/off (?:amazon|site)/.test(text)) return "off";
    return null;
}

function bidNumber(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    const text = String(value).trim().replace(/%$/, "");
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

function bidKind(row) {
    const type = normalized(row.changeType || row.action);
    if (/status|state|budget|delivery/.test(type)) return null;
    if (/placement|top of search|rest of search|product pages?/.test(type)) {
        return placementKey(row.placement || type) ? "placement" : null;
    }
    if (!/bid|adjust/.test(type)) return null;
    if (row.targetId || row.targeting) return "target";
    if (row.adGroupId && /default bid|ad.?group.*bid/.test(type)) return "adGroup";
    return null;
}

const autoTargets = new Set(["close-match", "loose-match", "complements", "substitutes", "similar-product"]);
function targetLabel(row) {
    const text = normalized(row.targeting);
    const group = normalized(row.adGroupId);
    const type = autoTargets.has(text) ? "auto" : matchType(row.matchType);
    return text && group && type ? JSON.stringify([campaignId(row), group, text, type]) : null;
}

function targetMatches(a, b, realIdsByLabel) {
    const aGroup = normalized(a.adGroupId);
    const bGroup = normalized(b.adGroupId);
    if (aGroup && bGroup && aGroup !== bGroup) return false;
    const aId = targetId(a.targetId);
    const bId = targetId(b.targetId);
    if (aId && aId === bId) return true;
    if (aId && !aId.startsWith("r-") && bId && !bId.startsWith("r-")) return false;
    const label = targetLabel(a);
    return Boolean(label && label === targetLabel(b) && (realIdsByLabel.get(label)?.size || 0) <= 1);
}

function sameEntity(row, candidate, kind, realIdsByLabel) {
    const campaign = campaignId(row);
    if (!campaign || campaign !== campaignId(candidate)) return false;
    if (kind === "target") return targetMatches(row, candidate, realIdsByLabel);
    if (kind === "adGroup") return normalized(row.adGroupId) === normalized(candidate.adGroupId);
    return placementKey(row.placement || row.changeType) === placementKey(candidate.placement || candidate.changeType);
}

function describeBid(row) {
    if (row.isRecordedBid === false) return null;
    const kind = bidKind(row);
    const at = +new Date(row.createdAt || row.lastChangeDate);
    const oldBid = bidNumber(row.oldValue ?? row.previousValue);
    const newBid = bidNumber(row.newValue ?? row.updatedValue);
    if (!kind || !Number.isFinite(at) || oldBid === null || newBid === null || oldBid === newBid) return null;
    return { row, kind, at, oldBid, newBid };
}

function applyBidHistoryAcos(rows, timeline, reports, timezone) {
    const realIdsByLabel = new Map();
    const indexTarget = row => {
        const label = targetLabel(row);
        const id = targetId(row.targetId);
        if (!label || !id || id.startsWith("r-")) return;
        if (!realIdsByLabel.has(label)) realIdsByLabel.set(label, new Set());
        realIdsByLabel.get(label).add(id);
    };
    rows.forEach(indexTarget);
    timeline.forEach(indexTarget);
    const byReportEntity = new Map();
    for (const [kind, records] of Object.entries(reports)) {
        for (const stat of records) {
            if (kind === "target") indexTarget(stat);
            const key = JSON.stringify([kind, campaignId(stat)]);
            if (!byReportEntity.has(key)) byReportEntity.set(key, []);
            byReportEntity.get(key).push(stat);
        }
    }
    const byCampaign = new Map();
    for (const row of timeline) {
        const bid = describeBid(row);
        if (!bid) continue;
        const key = campaignId(row);
        if (!byCampaign.has(key)) byCampaign.set(key, []);
        byCampaign.get(key).push(bid);
    }
    for (const bids of byCampaign.values()) bids.sort((a, b) => b.at - a.at);

    for (const row of rows) {
        row.oldAcos = null;
        row.bidAcosFrom = null;
        row.bidAcosTo = null;
        const current = describeBid(row);
        if (!current) continue;

        const bids = byCampaign.get(campaignId(row)) || [];
        const matchesEntity = bid => bid.row !== row && bid.kind === current.kind &&
            sameEntity(row, bid.row, current.kind, realIdsByLabel);
        // A linked change at the same timestamp has no daily report interval.
        if (bids.some(bid => bid.at === current.at && bid.newBid === current.oldBid && matchesEntity(bid))) continue;

        const latest = bids.find(bid => bid.at < current.at && matchesEntity(bid));
        if (!latest) continue;
        const previous = bids.find(bid => bid.at === latest.at && bid.newBid === current.oldBid && matchesEntity(bid));
        if (!previous) continue;

        row.bidAcosFrom = moment(previous.at).tz(timezone).format("YYYY-MM-DD");
        row.bidAcosTo = moment(current.at).tz(timezone).format("YYYY-MM-DD");
        const daily = new Map();
        const reportKey = JSON.stringify([current.kind, campaignId(row)]);
        for (const stat of byReportEntity.get(reportKey) || []) {
            if (!stat.reportDate || stat.reportDate < row.bidAcosFrom || stat.reportDate >= row.bidAcosTo ||
                !sameEntity(row, stat, current.kind, realIdsByLabel)) continue;
            const day = daily.get(stat.reportDate) || { spend: 0, sales: 0 };
            day.spend = Math.max(day.spend, Number(stat.spend) || 0);
            day.sales = Math.max(day.sales, Number(stat.sales) || 0);
            daily.set(stat.reportDate, day);
        }
        let spend = 0;
        let sales = 0;
        for (const day of daily.values()) {
            spend += day.spend;
            sales += day.sales;
        }
        if (daily.size > 0) row.oldAcos = sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0;
    }
}

module.exports = { applyBidHistoryAcos, bidKind, describeBid, placementKey };
