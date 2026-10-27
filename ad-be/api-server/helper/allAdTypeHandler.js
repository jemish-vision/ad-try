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
// ad-type context and, optionally, some body fields (e.g. the pagination window).
function buildSubRequest(req, adType, bodyOverride) {
  const subReq = Object.create(req);
  subReq.adType = adType;
  subReq.adTypes = [adType];
  subReq.isAllAdTypes = false;
  subReq.models = (req.modelsByType && req.modelsByType[adType]) || req.models;
  subReq.body = bodyOverride ? { ...req.body, ...bodyOverride } : { ...req.body };
  return subReq;
}

// Resolve a possibly dotted field path (e.g. "campaignDetails.name") on a row.
function getPath(obj, path) {
  if (obj == null) return undefined;
  if (path.indexOf(".") === -1) return obj[path];
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function compareRows(field, dir) {
  const factor = dir === "asc" ? 1 : -1;
  // Dates are captured as Date objects (the handler's res.send runs before JSON
  // serialization), so normalise them to timestamps for a correct order.
  const norm = (v) => (v instanceof Date ? v.getTime() : v);
  return (a, b) => {
    const av = a == null ? null : norm(getPath(a, field));
    const bv = b == null ? null : norm(getPath(b, field));
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
//   mergeTotalRow      (perTypeTotalRows[], summedTotals, perTypeBodies[]) =>
//                      merged total row. When given it fully owns the merged
//                      total row (use it for endpoints with averaged fields or
//                      extra ratios the default sum + acos/roas/cpc/ctr cannot
//                      reproduce). perTypeBodies lets it read per-type counts for
//                      weighted averages.
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
    mergeTotalRow = null,
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
      const subReq = buildSubRequest(req, adType, { pageNo: 1, perPage: fetchLimit });
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
    let mergedTotalRow;
    if (typeof mergeTotalRow === "function") {
      const perTypeTotalRows = subResults.map(({ body }) => (body[totalRowKey] || {}));
      const perTypeBodies = subResults.map(({ body }) => body);
      mergedTotalRow = { ...mergeTotalRow(perTypeTotalRows, summedTotals, perTypeBodies), ...totalRowExtra };
    } else {
      mergedTotalRow = { ...summedTotals, ...deriveRatios(summedTotals), ...totalRowExtra };
    }

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

// Standard per-row chart ratios (adds conversionRate to the usual four).
function deriveChartRatios(totals) {
  const r = deriveStandardRatios(totals);
  const clicks = Number(totals.clicks) || 0;
  const orders = Number(totals.orders) || 0;
  r.conversionRate = clicks > 0 ? round((orders / clicks) * 100) : 0;
  return r;
}

// "All" wrapper for time-series chart endpoints. Unlike a grid, chart rows from
// different ad types that share the same bucket (e.g. a reportDate) must be
// SUMMED into one point, not concatenated — and there is no pagination. For a
// single type it passes straight through; for "All" it runs each type, groups
// the rows by `groupKey`, sums `sumFields`, re-derives the ratios, sorts the
// buckets ascending, and merges any extra top-level fields.
//
// config:
//   dataKey      response key holding the series array  (default "data")
//   groupKey     bucket field to group/sum on            (default "reportDate")
//   sumFields    base metrics to sum per bucket           (default impressions/clicks/orders/spend/sales)
//   deriveRatios (summedBucket) => ratio fields           (default cpc/acos/roas/ctr/conversionRate)
//   excludeSD    true for SP+SB-only features
//   mergeExtra   (perTypeBodies[]) => extra top-level fields to set on the payload
function withAllAdTypesChart(handler, config = {}) {
  const {
    dataKey = "data",
    groupKey = "reportDate",
    sumFields = ["impressions", "clicks", "orders", "spend", "sales"],
    deriveRatios = deriveChartRatios,
    excludeSD = false,
    mergeExtra = null,
  } = config;

  return async function allAdTypeChartRoute(req, res) {
    if (req.adType !== "All") {
      return handler(req, res);
    }

    const adTypes = resolveAdTypes("All", { excludeSD });
    const excludedAdTypes = resolveAdTypes("All").filter((t) => !adTypes.includes(t));

    const subResults = [];
    for (const adType of adTypes) {
      const subReq = buildSubRequest(req, adType); // charts have no pagination
      const { mockRes, promise } = captureResponse();
      await handler(subReq, mockRes);
      const result = await promise;
      if (!result || result.statusCode !== 200 || !result.body || result.body.isSuccess !== true) {
        return res
          .status((result && result.statusCode) || 500)
          .send((result && result.body) || { isSuccess: false, message: "Something went wrong" });
      }
      subResults.push({ adType, body: result.body });
    }

    // Group every type's rows by the bucket key, summing the base metrics.
    const buckets = new Map();
    for (const { body } of subResults) {
      const rows = Array.isArray(body[dataKey]) ? body[dataKey] : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const key = row[groupKey];
        let agg = buckets.get(key);
        if (!agg) {
          agg = { [groupKey]: key };
          for (const f of sumFields) agg[f] = 0;
          buckets.set(key, agg);
        }
        for (const f of sumFields) agg[f] += Number(row[f]) || 0;
      }
    }

    const merged = Array.from(buckets.values())
      .map((agg) => {
        const base = {};
        for (const f of sumFields) base[f] = round(agg[f]);
        return { [groupKey]: agg[groupKey], ...base, ...deriveRatios(agg) };
      })
      .sort((a, b) => compareRows(groupKey, "asc")(a, b));

    const payload = {
      ...subResults[0].body,
      [dataKey]: merged,
      adTypes,
    };
    if (typeof mergeExtra === "function") {
      Object.assign(payload, mergeExtra(subResults.map(({ body }) => body)) || {});
    }
    if (excludedAdTypes.length > 0) payload.excludedAdTypes = excludedAdTypes;

    return res.status(200).send(payload);
  };
}

// "All" wrapper for a per-rule item list that is sorted by a flag (not a
// metric) and whose response carries several count fields to sum. Unlike the
// grid wrapper there is no numeric global sort, so it fetches the FULL item set
// from each type (via fetchAllBody), concatenates (tagging each row's adType),
// optionally floats "new" rows first, then paginates in memory and sums the
// count fields. Used for recommendation per-rule items.
//
// config:
//   dataKey        item array key                      (default "data")
//   countFields    response count fields to sum         (e.g. ["count","totalRecords","validCount",…])
//   totalKey       which summed field drives totalPages (default "totalRecords")
//   pageNoKey      current-page key                     (default "currentPage")
//   perPageKey     page-size key                        (default "perPage")
//   totalPagesKey  page-count key                       (default "totalPages")
//   fetchAllBody   body override making the handler return every item (default {page:0,perPage:0})
//   newField       boolean row field floated first      (default "isNew"; null to keep order)
//   excludeSD      true for SP+SB-only features
//   tagField       row ad-type tag                      (default "adType")
function withAllAdTypesItemList(handler, config = {}) {
  const {
    dataKey = "data",
    countFields = [],
    totalKey = "totalRecords",
    pageNoKey = "currentPage",
    perPageKey = "perPage",
    totalPagesKey = "totalPages",
    fetchAllBody = { page: 0, perPage: 0 },
    newField = "isNew",
    excludeSD = false,
    tagField = "adType",
  } = config;

  return async function allAdTypeItemListRoute(req, res) {
    if (req.adType !== "All") {
      return handler(req, res);
    }

    const adTypes = resolveAdTypes("All", { excludeSD });
    const excludedAdTypes = resolveAdTypes("All").filter((t) => !adTypes.includes(t));

    const realPageNo = Math.max(0, Number(req.body && (req.body.page || req.body.pageNo)) || 0);
    const realPerPage = Math.max(0, Number(req.body && (req.body.perPage || req.body.limit)) || 0);

    const subResults = [];
    for (const adType of adTypes) {
      const subReq = buildSubRequest(req, adType, fetchAllBody);
      const { mockRes, promise } = captureResponse();
      await handler(subReq, mockRes);
      const result = await promise;
      if (!result || result.statusCode !== 200 || !result.body || result.body.isSuccess !== true) {
        return res
          .status((result && result.statusCode) || 500)
          .send((result && result.body) || { isSuccess: false, message: "Something went wrong" });
      }
      subResults.push({ adType, body: result.body });
    }

    let merged = [];
    for (const { adType, body } of subResults) {
      const rows = Array.isArray(body[dataKey]) ? body[dataKey] : [];
      for (const row of rows) {
        merged.push(row && typeof row === "object" && !Array.isArray(row)
          ? { ...row, [tagField]: row[tagField] || adType }
          : row);
      }
    }
    if (newField) {
      // stable: "new" rows first, original order preserved otherwise
      merged = merged
        .map((row, i) => ({ row, i, isNew: !!(row && row[newField]) }))
        .sort((a, b) => (a.isNew === b.isNew ? a.i - b.i : a.isNew ? -1 : 1))
        .map((x) => x.row);
    }

    const totalRecords = subResults.reduce((s, { body }) => s + (Number(body[totalKey]) || 0), 0);
    const pageRows = (realPageNo > 0 && realPerPage > 0)
      ? merged.slice((realPageNo - 1) * realPerPage, realPageNo * realPerPage)
      : merged;

    const payload = { ...subResults[0].body, [dataKey]: pageRows, adTypes };
    for (const f of countFields) {
      payload[f] = subResults.reduce((s, { body }) => s + (Number(body[f]) || 0), 0);
    }
    if (pageNoKey) payload[pageNoKey] = realPageNo || 1;
    if (perPageKey) payload[perPageKey] = realPerPage || totalRecords;
    if (totalPagesKey) {
      payload[totalPagesKey] = (realPageNo > 0 && realPerPage > 0)
        ? (Math.ceil(totalRecords / realPerPage) || 1)
        : 1;
    }
    if (excludedAdTypes.length > 0) payload.excludedAdTypes = excludedAdTypes;

    return res.status(200).send(payload);
  };
}

module.exports = {
  withAllAdTypes,
  withAllAdTypesChart,
  withAllAdTypesItemList,
  deriveStandardRatios,
  deriveChartRatios,
  round,
  // exported for tests
  captureResponse,
  buildSubRequest,
  compareRows,
};
