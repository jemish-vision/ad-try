"use strict";

// Generic "All" (SP + SB + SD) wrapper for paginated list endpoints.
//
// Rather than rewrite each controller's large, per-type aggregation into a
// single $unionWith (risky across six 2000-5000 line controllers with per-type
// schema differences), this wrapper REUSES each handler's exact, already-tested
// per-type query. When req.adType === "All" it runs the original handler once
// per resolved ad type, captures each JSON response, then merges the rows,
// re-sorts and re-paginates across the union, and sums the KPI totals. A
// single-type request (SP/SB/SD) is passed straight through — zero change to
// existing behaviour.
//
// Memory is bounded: to assemble global page N under a global sort, only the
// top N*perPage rows of each type can possibly land on it, so each per-type
// fetch is capped at N*perPage. Per-type total counts and KPI rollups come from
// each sub-response's own facet, which is computed over the full match and is
// therefore independent of this cap.

const { resolveAdTypes } = require("./adTypeResolver");

function round(n, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(n) || 0) * factor) / factor;
}

// Standard Amazon Ads KPI ratios derived from summed base metrics. Mirrors the
// acos/roas/cpc/ctr $project math used by the single-type aggregations, so the
// merged total row matches what a real union would produce.
function deriveStandardRatios(totals) {
  const impressions = Number(totals.impressions) || 0;
  const clicks = Number(totals.clicks) || 0;
  const spend = Number(totals.spend) || 0;
  const sales = Number(totals.sales) || 0;
  return {
    acos: sales > 0 ? round((spend / sales) * 100) : 0,
    roas: spend > 0 ? round(sales / spend) : 0,
    cpc: clicks > 0 ? round(spend / clicks) : 0,
    ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
  };
}

// A minimal Express res stand-in that captures the first status()/send()/json()
// a handler emits and resolves with { statusCode, body }.
function captureResponse() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  let statusCode = 200;
  let settled = false;
  const finish = (body) => {
    if (!settled) {
      settled = true;
      resolve({ statusCode, body });
    }
    return mockRes;
  };
  const mockRes = {
    status(code) {
      statusCode = code;
      return mockRes;
    },
    send(body) {
      return finish(body);
    },
    json(body) {
      return finish(body);
    },
    end() {
      return finish(undefined);
    },
  };
  return { mockRes, promise };
}

// A per-type request that delegates to the real req (so handlers still read
// req.config / req.headers / req.query / req.params unchanged) but overrides the
// ad-type context and the pagination window.
function buildSubRequest(req, adType, fetchLimit) {
  const subReq = Object.create(req);
  subReq.adType = adType;
  subReq.adTypes = [adType];
  subReq.isAllAdTypes = false;
  subReq.models = (req.modelsByType && req.modelsByType[adType]) || req.models;
  subReq.body = { ...req.body, pageNo: 1, perPage: fetchLimit };
  return subReq;
}

function compareRows(field, dir) {
  const factor = dir === "asc" ? 1 : -1;
  // Dates are captured as Date objects (the handler's res.send runs before JSON
  // serialization), so normalise them to timestamps for a correct order.
  const norm = (v) => (v instanceof Date ? v.getTime() : v);
  return (a, b) => {
    const av = a == null ? null : norm(a[field]);
    const bv = b == null ? null : norm(b[field]);
    // nulls always sort last, regardless of direction
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  };
}

// Wrap a list handler so it transparently serves merged "All" data.
//
// config:
//   dataKey            response key holding the row array      (e.g. "getSearchTerm")
//   totalKey           response key holding the total count    (e.g. "totalSearchTerm")
//   totalRowKey        response key holding the KPI totals obj  (e.g. "totalRow")
//   numericTotalFields base totals to sum across types         (e.g. ["impressions","clicks","orders","spend","sales"])
//   deriveRatios       (summedTotals) => extra ratio fields     (default: acos/roas/cpc/ctr)
//   excludeSD          true for keyword/search-term/placement views (SP+SB only)
//   tagField           row field recording its ad type          (default "adType")
//   sortField          (body) => field name to sort on          (default body.fieldName || "spend")
//   sortDir            (body) => "asc" | "desc"                  (default body.sortType === "ASC")
//   totalRowExtra      static fields to keep on the merged total row (default { isTotalRow: true })
//   pageNoKey          response key for the current page number  (default "pageNo"; null to omit)
//   perPageKey         response key for the page size            (default "perPage"; null to omit)
//   totalPagesKey      response key for the page count            (optional, e.g. "totalPages")
function withAllAdTypes(handler, config = {}) {
  const {
    dataKey,
    totalKey,
    totalRowKey,
    numericTotalFields = [],
    deriveRatios = deriveStandardRatios,
    excludeSD = false,
    tagField = "adType",
    sortField = (body) => (body && body.fieldName) || "spend",
    sortDir = (body) => (body && body.sortType === "ASC" ? "asc" : "desc"),
    totalRowExtra = { isTotalRow: true },
    pageNoKey = "pageNo",
    perPageKey = "perPage",
    totalPagesKey = null,
  } = config;

  if (!dataKey || !totalKey) {
    throw new Error("withAllAdTypes requires at least dataKey and totalKey in config");
  }

  return async function allAdTypeRoute(req, res) {
    // Single ad type (or an un-"All" request): run the original handler as-is.
    if (req.adType !== "All") {
      return handler(req, res);
    }

    const adTypes = resolveAdTypes("All", { excludeSD });
    const excludedAdTypes = resolveAdTypes("All").filter((t) => !adTypes.includes(t));

    const realPageNo = Math.max(1, Number(req.body && req.body.pageNo) || 1);
    const realPerPage = Math.max(1, Number(req.body && req.body.perPage) || 10);
    const fetchLimit = realPageNo * realPerPage;

    // Run each type's native query, capped at the rows that could reach this page.
    const subResults = [];
    for (const adType of adTypes) {
      const subReq = buildSubRequest(req, adType, fetchLimit);
      const { mockRes, promise } = captureResponse();
      await handler(subReq, mockRes);
      const result = await promise;
      // Any non-OK / failure from a single type is surfaced verbatim: "All" is
      // only correct if every contributing type succeeded.
      if (!result || result.statusCode !== 200 || !result.body || result.body.isSuccess !== true) {
        return res
          .status((result && result.statusCode) || 500)
          .send((result && result.body) || { isSuccess: false, message: "Something went wrong" });
      }
      subResults.push({ adType, body: result.body });
    }

    // Merge + tag rows with their ad type.
    const merged = [];
    for (const { adType, body } of subResults) {
      const rows = Array.isArray(body[dataKey]) ? body[dataKey] : [];
      for (const row of rows) {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          merged.push({ ...row, [tagField]: row[tagField] || adType });
        } else {
          merged.push(row);
        }
      }
    }

    // Global sort, then slice the requested page out of the union.
    const field = typeof sortField === "function" ? sortField(req.body) : sortField;
    const dir = typeof sortDir === "function" ? sortDir(req.body) : sortDir;
    merged.sort(compareRows(field, dir));
    const pageRows = merged.slice((realPageNo - 1) * realPerPage, realPageNo * realPerPage);

    // Sum the total count and KPI base metrics across types, re-derive ratios.
    const total = subResults.reduce((sum, { body }) => sum + (Number(body[totalKey]) || 0), 0);
    const summedTotals = {};
    for (const f of numericTotalFields) {
      summedTotals[f] = subResults.reduce(
        (sum, { body }) => sum + (Number(body[totalRowKey] && body[totalRowKey][f]) || 0),
        0,
      );
    }
    const mergedTotalRow = { ...summedTotals, ...deriveRatios(summedTotals), ...totalRowExtra };

    // Start from the first type's body to carry through any endpoint-specific
    // static fields, then override the merged bits.
    const payload = {
      ...subResults[0].body,
      [dataKey]: pageRows,
      [totalKey]: total,
      adTypes,
    };
    if (totalRowKey) payload[totalRowKey] = mergedTotalRow;
    if (pageNoKey) payload[pageNoKey] = realPageNo;
    if (perPageKey) payload[perPageKey] = realPerPage;
    if (totalPagesKey) payload[totalPagesKey] = Math.ceil(total / realPerPage) || 0;
    if (excludedAdTypes.length > 0) payload.excludedAdTypes = excludedAdTypes;

    return res.status(200).send(payload);
  };
}

module.exports = {
  withAllAdTypes,
  deriveStandardRatios,
  // exported for tests
  captureResponse,
  buildSubRequest,
  compareRows,
};
