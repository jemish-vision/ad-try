const mongoose = require("mongoose");
const crypto = require("crypto");
const { calcMetrics, parseStrictMetric } = require("./common");

const models = {
  searchTerm: () => require("../models/searchTerm.model"),
  sbSearchTerm: () => require("../models/sbSearchTerm.model"),
  placement: () => require("../models/placement.model"),
  sbPlacement: () => require("../models/sbPlacement.model"),
  targeting: () => require("../models/targeting.model"),
  sbTargeting: () => require("../models/sbTargeting.model"),
  sdTargeting: () => require("../models/sdTargeting.model"),
  sbCampaign: () => require("../models/sbCampaign.model"),
  sdCampaign: () => require("../models/sdCampaign.model"),
  sdAdGroup: () => require("../models/sdAdGroups.model"),
};

const EXTENDED_REPORT_ENTITIES = Object.freeze(Object.keys(models));
const isExtendedEntity = (entity) => Object.hasOwn(models, entity);
const getExtendedModel = (entity) => {
  if (!isExtendedEntity(entity)) throw new Error(`Unsupported report entity: ${entity}`);
  return models[entity]();
};

const requiredNumber = (value, field, context) => {
  if (value === undefined || value === null || value === "" || !Number.isFinite(Number(value))) {
    throw new Error(`[Validation Failure] Invalid ${field} in ${context}`);
  }
  return Number(value);
};

const placementLabel = (classification) => {
  if (["Other on-Amazon", "Other Placements"].includes(classification)) return "Rest of Search";
  if (classification === "Detail Page on-Amazon") return "Product pages";
  if (["Top of Search on-Amazon", "Top of Search"].includes(classification)) return "Top of Search";
  return "";
};

const biddingStrategy = (strategy) => {
  if (["legacy", "LEGACY_FOR_SALES"].includes(strategy)) return "Dynamic bids - down only";
  if (["optimizeForSales", "AUTO_FOR_SALES"].includes(strategy)) return "Dynamic bids - up and down";
  if (["manual", "MANUAL"].includes(strategy)) return "Fixed bid";
  return "";
};

const normalizeExtendedRow = (source, contextObj) => {
  const { entity, importRunId, configId, profileId, accountType, targetIdMap } = contextObj || {};
  if (!isExtendedEntity(entity)) throw new Error(`Unsupported report entity: ${entity}`);
  const context = `run=${importRunId} entity=${entity} profile=${profileId}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.date || "")) {
    throw new Error(`[Validation Failure] Invalid date in ${context}`);
  }
  const campaignId = requiredNumber(source.campaignId, "campaignId", context);
  const reportDate = source.date;
  const impressions = parseStrictMetric(source.impressions, "impressions", context);
  const clicks = parseStrictMetric(source.clicks, "clicks", context);
  const spend = parseStrictMetric(source.spend ?? source.cost ?? 0, "spend", context);
  const isSponsoredProducts = ["searchTerm", "placement", "targeting"].includes(entity);
  const attributionDays = accountType?.toLowerCase() === "vendor" ? 14 : 7;
  const purchaseField = isSponsoredProducts ? `purchases${attributionDays}d` : "purchases";
  const salesField = isSponsoredProducts ? `sales${attributionDays}d` : "sales";
  const purchases = parseStrictMetric(source[purchaseField], purchaseField, context);
  const sales = parseStrictMetric(source[salesField], salesField, context);
  const metrics = { impressions, clicks, spend, purchases, sales };
  const setFields = {
    impressions, clicks, spend, sales, orders: purchases,
    ...calcMetrics({ impressions, clicks, spend, sales, orders: purchases }),
  };
  let identity = { campaignId, reportDate };

  if (entity === "searchTerm" || entity === "sbSearchTerm") {
    if (!source.searchTerm || !source.campaignStatus) {
      throw new Error(`[Validation Failure] Missing searchTerm or campaignStatus in ${context}`);
    }
    identity = {
      campaignId,
      adGroupId: requiredNumber(source.adGroupId, "adGroupId", context),
      keywordId: source.keywordId == null ? null : requiredNumber(source.keywordId, "keywordId", context),
      searchTerm: source.searchTerm,
      reportDate,
    };
    Object.assign(setFields, {
      campaignName: source.campaignName,
      adGroupName: source.adGroupName,
      prefix: ["TARGETING_EXPRESSION_PREDEFINED", "TARGETING_EXPRESSION"].includes(source.keywordType) ? "T" : "K",
      keywordType: source.keywordType,
      targeting: source.targeting || source.keywordText,
      status: source.campaignStatus.toUpperCase(),
    });
  } else if (entity === "placement" || entity === "sbPlacement") {
    identity = { campaignId, placement: placementLabel(source.placementClassification), reportDate };
    Object.assign(setFields, {
      units: isSponsoredProducts
        ? parseStrictMetric(source[`unitsSoldClicks${attributionDays}d`], `unitsSoldClicks${attributionDays}d`, context)
        : source.unitsSoldClicks ?? 0,
      biddingStartegy: biddingStrategy(source.campaignBiddingStrategy),
      ...(source.campaignName && { campaignName: source.campaignName }),
      ...(source.campaignStatus && { campaignStatus: String(source.campaignStatus).toUpperCase() }),
    });
  } else if (["targeting", "sbTargeting", "sdTargeting"].includes(entity)) {
    identity = {
      campaignId,
      adGroupId: requiredNumber(source.adGroupId, "adGroupId", context),
      reportDate,
    };
    if (source.keywordType) {
      const targeting = source.targeting || source.targetingText;
      if (!targeting) throw new Error(`[Validation Failure] Missing targeting text in ${context}`);
      identity.targeting = targeting;
      identity.keywordType = String(source.keywordType).toUpperCase();
      if (source.targetingId) {
        setFields.targetId = `${["BROAD", "PHRASE", "EXACT"].includes(source.keywordType) ? "K" : "T"}-${source.targetingId}`;
      } else {
        // SP targeting reports omit the API target ID for auto-targets.
        // Check if known targetId exists in context map (preloaded from listing sync)
        const knownTargetId = targetIdMap?.get(`${campaignId}:${identity.adGroupId}:${targeting}`);
        if (knownTargetId) {
          setFields.defaultTargetId = knownTargetId;
        } else {
          // Give newly inserted rows a stable ID for the model's unique (targetId, date) index
          const digest = crypto.createHash("sha256")
            .update(JSON.stringify([campaignId, identity.adGroupId, targeting, identity.keywordType]))
            .digest("hex").slice(0, 24);
          setFields.defaultTargetId = `R-${digest}`;
        }
      }
    } else {
      if (!source.targetingId) throw new Error(`[Validation Failure] Missing targetingId in ${context}`);
      identity.targetId = `T-${source.targetingId}`;
      identity.type = "Sponsored Display";
    }
    if (source.topOfSearchImpressionShare !== undefined) {
      setFields.topOfSearchImpressionShare = source.topOfSearchImpressionShare;
    }
    const statusVal = source.adKeywordStatus || source.status || source.state || source.campaignStatus;
    if (statusVal) {
      setFields.status = String(statusVal).toUpperCase();
    }
    if (source.matchType) {
      setFields.matchType = source.matchType;
    }
    if (source.keywordBid !== undefined && source.keywordBid !== null) {
      setFields.keywordBid = Number(source.keywordBid) || 0;
    }
  } else if (entity === "sbCampaign" || entity === "sdCampaign") {
    if (source.campaignName !== undefined) setFields.name = source.campaignName;
    if (source.campaignBudgetAmount !== undefined) setFields.budget = source.campaignBudgetAmount;
    const statusVal = source.campaignStatus || source.status || source.state;
    if (statusVal) {
      setFields.status = String(statusVal).toUpperCase();
    }
    if (entity === "sbCampaign") {
      setFields.type = "Sponsored Brands";
    } else if (entity === "sdCampaign") {
      setFields.type = "Sponsored Display";
    }
  } else if (entity === "sdAdGroup") {
    identity = { campaignId, adGroupId: requiredNumber(source.adGroupId, "adGroupId", context), reportDate };
  }

  // Mongoose's old $set omitted undefined values; keep that behavior explicitly.
  for (const [field, value] of Object.entries(setFields)) {
    if (value === undefined) delete setFields[field];
  }
  return {
    importRunId, entity, configId: String(configId), profileId: Number(profileId),
    reportDate, identity, setFields, metrics,
  };
};

const extendedRowKey = (row) => `v2:${JSON.stringify(Object.entries(row.identity))}`;

const buildExtendedUpsertOp = (row, sourceVersion) => {
  const configId = mongoose.Types.ObjectId.isValid(row.configId)
    ? new mongoose.Types.ObjectId(row.configId) : row.configId;
  const current = { $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] };
  const guarded = {};
  for (const [field, value] of Object.entries({
    ...row.setFields,
    lastImportRunId: row.importRunId,
    importSourceVersion: sourceVersion,
  })) {
    if (field === "defaultTargetId") {
      // If the targetId in DB is missing OR is a synthetic "R-" ID and we now have a genuine "T-"/"K-" ID,
      // update to the genuine ID. Otherwise keep the existing targetId.
      const isValGenuine = typeof value === "string" && (value.startsWith("T-") || value.startsWith("K-"));
      if (isValGenuine) {
        const isSynthetic = {
          $eq: [{ $substrCP: [{ $ifNull: ["$targetId", ""] }, 0, 2] }, "R-"]
        };
        const shouldReplace = {
          $or: [
            { $eq: [{ $ifNull: ["$targetId", null] }, null] },
            isSynthetic
          ]
        };
        guarded.targetId = {
          $cond: [
            current,
            { $cond: [shouldReplace, { $literal: value }, "$targetId"] },
            "$targetId"
          ]
        };
      } else {
        guarded.targetId = { $cond: [current, { $ifNull: ["$targetId", { $literal: value }] }, "$targetId"] };
      }
      continue;
    }
    guarded[field] = { $cond: [current, { $literal: value }, `$${field}`] };
  }
  return {
    updateOne: {
      filter: { configId, profileId: row.profileId, ...row.identity },
      update: [{ $set: guarded }],
      upsert: true,
    },
  };
};

module.exports = {
  EXTENDED_REPORT_ENTITIES, isExtendedEntity, getExtendedModel,
  normalizeExtendedRow, extendedRowKey, buildExtendedUpsertOp,
};
