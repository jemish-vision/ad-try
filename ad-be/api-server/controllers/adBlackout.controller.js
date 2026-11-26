const mongoose = require("mongoose");
const moment = require("moment-timezone");
const adBlackoutAlertSchema = require("../models/adBlackoutAlert.model");
const profileSchema = require("../models/profiles.model");
const { evaluateProfileBlackouts } = require("../services/adBlackoutDetector.service");
const { write_logs } = require("../../winston/utility/logger");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 50;
const VALID_AD_TYPES = new Set(["SP", "SB", "SD"]);
const VALID_STATUSES = new Set(["ACTIVE", "RESOLVED", "ALL"]);

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : id);

function sanitizeAlert(doc) {
  return {
    _id: String(doc._id),
    adType: doc.adType,
    entityLevel: doc.entityLevel,
    campaignId: doc.campaignId,
    campaignName: doc.campaignName || "",
    adGroupId: doc.adGroupId ?? null,
    adGroupName: doc.adGroupName || null,
    portfolioId: doc.portfolioId ?? null,
    status: doc.status,
    detectedAt: doc.detectedAt,
    firstBlackoutHour: doc.firstBlackoutHour,
    lastZeroHour: doc.lastZeroHour,
    lastCheckedHour: doc.lastCheckedHour,
    resolvedAt: doc.resolvedAt || null,
    reasonCode: doc.reasonCode,
    reasonParams: doc.reasonParams || {},
    plainReason: doc.plainReason || "",
    affectedAsins: Array.isArray(doc.affectedAsins) ? doc.affectedAsins : [],
    // Expose only non-monetary hourly traffic baseline; never expose rupee/currency loss
    avgHourlyImpressions: doc.baseline?.avgHourlyImpressions || 0,
  };
}

function createAdBlackoutController({
  alertModel = adBlackoutAlertSchema,
  profileModel = profileSchema,
  runEvaluator = evaluateProfileBlackouts,
} = {}) {
  async function getAdBlackoutAlerts(req, res) {
    try {
      const configId = req?.config?.configId || req.body?.configId || req.headers?.["x-config-id"];
      const profileId = Number(req.body?.profileId);
      const rawAdType = String(req.body?.adType || req.headers?.adtype || "All").trim();
      const rawStatus = String(req.body?.status || "ACTIVE").toUpperCase();
      const reasonCode = req.body?.reasonCode ? String(req.body.reasonCode).toUpperCase() : null;
      const page = Math.max(1, Number(req.body?.page) || DEFAULT_PAGE);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.body?.limit) || DEFAULT_LIMIT));
      const refresh = Boolean(req.body?.refresh);

      if (!configId || !Number.isFinite(profileId) || profileId <= 0) {
        return res.status(200).send({ isSuccess: false, message: "configId and valid profileId are required." });
      }

      const objConfigId = toObjectId(configId);
      if (refresh) {
        await runEvaluator({ configId: objConfigId, profileId, scheduledFor: new Date() }).catch(() => null);
      }

      const profile = await profileModel.findOne({ configId: objConfigId, profileId }).select("timezone").lean();
      const timezone = profile?.timezone || "UTC";
      const todayStart = moment.tz(timezone).startOf("day").toDate();

      const adTypeFilter = VALID_AD_TYPES.has(rawAdType.toUpperCase()) ? rawAdType.toUpperCase() : null;
      const baseScope = {
        configId: objConfigId,
        profileId,
        ...(adTypeFilter ? { adType: adTypeFilter } : {}),
      };

      const statusMode = VALID_STATUSES.has(rawStatus) ? rawStatus : "ACTIVE";
      const activeEntityAgg = await alertModel.aggregate([
        { $match: { ...baseScope, status: "ACTIVE" } },
        {
          $group: {
            _id: {
              adType: "$adType",
              entityLevel: "$entityLevel",
              campaignId: "$campaignId",
              adGroupId: "$adGroupId",
            },
          },
        },
      ]);
      const activeEntityClauses = (activeEntityAgg || [])
        .map((r) => r?._id)
        .filter((k) => k && typeof k === "object" && k.campaignId != null)
        .map((k) => ({
          adType: k.adType,
          entityLevel: k.entityLevel,
          campaignId: k.campaignId,
          adGroupId: k.adGroupId ?? null,
        }));

      const resolvedTodayFilter = {
        ...baseScope,
        status: "RESOLVED",
        resolvedAt: { $gte: todayStart },
        ...(activeEntityClauses.length ? { $nor: activeEntityClauses } : {}),
      };
      const listFilter =
        statusMode === "RESOLVED"
          ? { ...resolvedTodayFilter, ...(reasonCode ? { reasonCode } : {}) }
          : {
              ...baseScope,
              ...(statusMode === "ALL" ? { status: { $in: ["ACTIVE", "RESOLVED"] } } : { status: statusMode }),
              ...(reasonCode ? { reasonCode } : {}),
            };

      const [activeCount, resolvedTodayCount, totalRecords, docs, reasonAgg] = await Promise.all([
        alertModel.countDocuments({ ...baseScope, status: "ACTIVE" }),
        alertModel.countDocuments(resolvedTodayFilter),
        alertModel.countDocuments(listFilter),
        alertModel
          .find(listFilter)
          .sort({ "baseline.sales7d": -1, "baseline.impressions7d": -1, detectedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        alertModel.aggregate([
          { $match: { ...baseScope, status: "ACTIVE" } },
          { $group: { _id: "$reasonCode", count: { $sum: 1 } } },
        ]),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
      const byReason = {};
      for (const r of reasonAgg || []) {
        if (r?._id) byReason[r._id] = r.count;
      }

      return res.status(200).send({
        isSuccess: true,
        message: "Hourly ad blackout alerts fetched successfully.",
        data: {
          timezone,
          alerts: docs.map(sanitizeAlert),
          summary: {
            activeCount,
            resolvedTodayCount,
            byReason,
          },
          pagination: {
            page,
            limit,
            totalRecords,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
      });
    } catch (error) {
      write_logs({ message: `[getAdBlackoutAlerts] Error: ${error?.message || error}`, log_type: "error" });
      return res.status(200).send({ isSuccess: false, message: "Something went wrong while fetching ad blackout alerts." });
    }
  }

  async function dismissAdBlackoutAlert(req, res) {
    try {
      const configId = req?.config?.configId || req.body?.configId || req.headers?.["x-config-id"];
      const profileId = Number(req.body?.profileId);
      const alertId = req.body?.alertId;

      if (!configId || !Number.isFinite(profileId) || profileId <= 0 || !mongoose.Types.ObjectId.isValid(String(alertId || ""))) {
        return res.status(200).send({ isSuccess: false, message: "configId, profileId, and valid alertId are required." });
      }

      const objConfigId = toObjectId(configId);
      const objAlertId = new mongoose.Types.ObjectId(String(alertId));
      const userId = req.user?.user_id || req.user?._id || null;

      const updated = await alertModel.findOneAndUpdate(
        { _id: objAlertId, configId: objConfigId, profileId, status: { $in: ["ACTIVE", "RESOLVED"] } },
        {
          $set: {
            status: "DISMISSED",
            dismissedAt: new Date(),
            ...(mongoose.Types.ObjectId.isValid(String(userId || "")) ? { dismissedBy: toObjectId(userId) } : {}),
          },
        },
        { new: true }
      );

      if (!updated) {
        return res.status(200).send({ isSuccess: false, message: "Alert not found or already dismissed." });
      }

      return res.status(200).send({
        isSuccess: true,
        message: "Alert dismissed successfully.",
        data: { alertId: String(updated._id), status: updated.status },
      });
    } catch (error) {
      write_logs({ message: `[dismissAdBlackoutAlert] Error: ${error?.message || error}`, log_type: "error" });
      return res.status(200).send({ isSuccess: false, message: "Something went wrong while dismissing alert." });
    }
  }

  return { getAdBlackoutAlerts, dismissAdBlackoutAlert };
}

const defaultController = createAdBlackoutController();

module.exports = {
  createAdBlackoutController,
  sanitizeAlert,
  ...defaultController,
};
