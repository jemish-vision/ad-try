const { randomUUID } = require("node:crypto");
const { eventForRoute } = require("../constants/auditRouteEvents");
const { runWithAuditRequest, writeAuditEvent } = require("../helpers/auditHelper");
const pendingWrites = new Set();

const targetKeys = [
  "targetUserId", "packageId", "planId", "roleId", "pageId", "permissionId", "invitationId",
  "subscriptionId", "campaignId", "adGroupId", "keywordId", "targetId", "adId", "ruleId", "tagId",
  "cronId", "cronJobId", "cronName", "ticketId", "chatSessionId", "contentReferenceKey", "sku", "asin", "warehouseId", "groupId", "userId",
];
const targetTypes = {
  targetUserId: "user", userId: "user", roleId: "role", pageId: "page",
  packageId: "plan", planId: "plan", invitationId: "invitation", subscriptionId: "subscription",
  campaignId: "campaign", adGroupId: "ad group", keywordId: "keyword", targetId: "target",
  adId: "product ad", ruleId: "rule", tagId: "tag", ticketId: "ticket",
  cronId: "job", cronJobId: "job", cronName: "job", sku: "product", asin: "product", warehouseId: "warehouse",
};
const acceptedChangeKeys = [
  "enabled", "isActive", "isEnabled", "state", "campaignStatus", "status",
  "bid", "newBid", "placementBid", "budget", "selectedSyncDays", "percent", "startDate", "endDate",
];

function boundedFields(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(keys.flatMap(key => {
    const value = input[key];
    return ((typeof value === "string" && value.length <= 120) ||
      (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") ? [[key, value]] : [];
  }));
}

function countsOf(payload) {
  const counts = {};
  for (const result of [payload, payload?.data, payload?.result, payload?.data?.result]) {
    if (!result || Array.isArray(result) || typeof result !== "object") continue;
    const success = result.succeeded ?? result.successCount ?? result.appliedCount ?? result.successList;
    const failure = result.failedCount ?? result.failed ?? result.errorCount ?? result.failedList ?? result.errors;
    if (Array.isArray(success)) counts.succeeded = success.length;
    else if (Number.isSafeInteger(success)) counts.succeeded = success;
    if (Array.isArray(failure)) counts.failed = failure.length;
    else if (Number.isSafeInteger(failure)) counts.failed = failure;
  }
  return counts;
}

function captureResponse(req, res) {
  const originalJson = res.json;
  const originalSend = res.send;
  const originalEnd = res.end;
  let body;
  res.json = function (value) {
    if (value && typeof value === "object") body = value;
    return originalJson.call(this, value);
  };
  res.send = function (value) {
    if (value && typeof value === "object" && !Buffer.isBuffer(value)) body = value;
    return originalSend.call(this, value);
  };
  res.end = function (...args) {
    const routePath = req.route?.path;
    if (typeof routePath === "string") {
      const path = `${req.baseUrl}${routePath}`;
      const event = eventForRoute(req.method, path);
      if (event && !req.auditEvents?.has(event)) {
        const targets = {
          ...boundedFields(req.body, targetKeys),
          ...boundedFields(req.params, targetKeys),
        };
        const firstTarget = Object.keys(targets).find(key => targetTypes[key]);
        const change = req.auditChange || {};
        const counts = { ...countsOf(body), ...change.counts };
        const outcome = change.outcome || ([401, 403].includes(res.statusCode) ? "DENIED"
          : res.statusCode >= 400 || body?.isSuccess === false || body?.success === false || body?.received === false
          ? "FAILURE"
          : counts.failed
            ? counts.succeeded ? "PARTIAL" : "FAILURE"
            : res.statusCode === 202 || event.endsWith("_REQUESTED") ? "PENDING" : "SUCCESS");
        const webhook = event === "BILLING_WEBHOOK_PROCESSED";
        const requestedChanges = boundedFields(req.body, acceptedChangeKeys);
        const pending = writeAuditEvent({
          req, event, outcome, source: webhook ? "webhook" : "api",
          actorType: change.actorType || (webhook ? "integration" : req.user?._id ? "user" : "anonymous"),
          resourceType: change.resourceType || (firstTarget ? targetTypes[firstTarget] : undefined),
          resourceId: change.resourceId || (firstTarget ? String(targets[firstTarget]) : undefined),
          organizationId: change.organizationId,
          configId: change.configId,
          profileId: change.profileId,
          previousValue: change.previousValue,
          newValue: change.newValue,
          operationId: req.auditOperationId,
          metadata: {
            route: path,
            httpStatus: res.statusCode,
            ...targets,
            ...counts,
            ...change.metadata,
            ...(change.items && { items: change.items }),
            ...(Object.keys(requestedChanges).length && { requestedChanges }),
          },
        });
        pendingWrites.add(pending);
        void pending.then(() => pendingWrites.delete(pending), () => pendingWrites.delete(pending));
      }
    }
    return originalEnd.apply(this, args);
  };
}

function auditRequest(req, res, next) {
  req.auditOperationId = randomUUID();
  captureResponse(req, res);
  return runWithAuditRequest(req, next);
}

async function drainAuditRequests(timeoutMs = 3000) {
  let timer;
  try {
    await Promise.race([
      Promise.allSettled([...pendingWrites]),
      new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { auditRequest, drainAuditRequests };
