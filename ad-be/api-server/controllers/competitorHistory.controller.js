/**
 * Competitor Price History (Enterprise) — read APIs + organization retention setting.
 *
 * GET  /api/products/:asin/history?profileId=&days=&rivalAsin=   (Competitor Comparison · View Only)
 * GET  /api/products/history-settings                            (Competitor Comparison · View Only)
 * PUT  /api/products/history-settings  { retentionDays }         (Competitor Comparison · Update)
 */
const moment = require("moment-timezone");

const asinSnapshotSchema = require("../models/asinSnapshot.model");
const organizationSchema = require("../models/organization.model");
const { getProfile } = require("../helper/common");
const { write_logs } = require("../../winston/utility/logger");
const { summarizeOwnHistory, summarizeRivalHistory } = require("../helpers/priceHistory.helper");
const {
  RETENTION_OPTIONS,
  DEFAULT_RETENTION_DAYS,
  normalizeRetentionDays,
  applyRetentionToOrganization,
} = require("../services/automation/asinSnapshot.service");

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const MAX_RIVAL_SERIES = 5;

const OWN_FIELDS = "date ourPrice ourFulfillment hasActiveOffer buyBoxPrice buyBoxSellerId weHaveBuyBox amazonSelling lowestFbaPrice lowestFbmPrice offerCount buyBoxEligibleCount ranks currency -_id";
const RIVAL_FIELDS = "date asin brand price bsr bsrCategory -_id";

const getOrgRetention = async (organizationId) => {
  if (!organizationId) return DEFAULT_RETENTION_DAYS;
  const org = await organizationSchema.findById(organizationId).select("historyRetentionDays").lean();
  return normalizeRetentionDays(org?.historyRetentionDays);
};

exports.getAsinHistory = async (req, res) => {
  const asin = String(req.params.asin || "").trim().toUpperCase();
  const configId = req?.config?.configId || req.query.configId || req.headers?.["x-config-id"];
  const profileId = Number(req.query.profileId);
  const rivalAsin = req.query.rivalAsin ? String(req.query.rivalAsin).trim().toUpperCase() : null;

  try {
    if (!ASIN_REGEX.test(asin)) return res.status(200).send({ isSuccess: false, message: "A valid 10-character ASIN is required" });
    if (rivalAsin && !ASIN_REGEX.test(rivalAsin)) return res.status(200).send({ isSuccess: false, message: "Invalid rival ASIN" });
    if (!configId || !profileId) return res.status(200).send({ isSuccess: false, message: "configId and profileId are required" });

    const profile = await getProfile(configId, profileId);
    if (!profile) return res.status(200).send({ isSuccess: false, message: "Profile not found or inactive" });

    const retentionDays = await getOrgRetention(req.organizationId);
    const requested = Number(req.query.days) || retentionDays;
    const days = Math.min(Math.max(requested, 1), retentionDays);
    const tz = profile.timezone || "UTC";
    const fromDate = moment.tz(tz).subtract(days - 1, "days").format("YYYY-MM-DD");
    const scope = { configId: profile.configId, profileId: Number(profile.profileId) };

    const [own, firstSnapshot] = await Promise.all([
      asinSnapshotSchema.find({ ...scope, kind: "OWN", asin, date: { $gte: fromDate } }).select(OWN_FIELDS).sort({ date: 1 }).lean(),
      asinSnapshotSchema.findOne({ ...scope, kind: "OWN" }).select("date -_id").sort({ date: 1 }).lean(),
    ]);

    // Rival series: the requested rival, otherwise the top rivals (by rank) for this ASIN on the latest day.
    let rivalAsins = [];
    if (rivalAsin) {
      rivalAsins = [rivalAsin];
    } else {
      const latest = await asinSnapshotSchema.findOne({ ...scope, kind: "RIVAL", forAsins: asin }).select("date -_id").sort({ date: -1 }).lean();
      if (latest) {
        const top = await asinSnapshotSchema
          .find({ ...scope, kind: "RIVAL", forAsins: asin, date: latest.date })
          .select("asin bsr price -_id")
          .lean();
        rivalAsins = top
          .sort((a, b) => (a.bsr ?? Infinity) - (b.bsr ?? Infinity) || (a.price ?? Infinity) - (b.price ?? Infinity))
          .slice(0, MAX_RIVAL_SERIES)
          .map((r) => r.asin);
      }
    }
    const rivalDocs = rivalAsins.length
      ? await asinSnapshotSchema.find({ ...scope, kind: "RIVAL", asin: { $in: rivalAsins }, date: { $gte: fromDate } }).select(RIVAL_FIELDS).sort({ date: 1 }).lean()
      : [];
    const rivals = rivalAsins.map((ra) => {
      const series = rivalDocs.filter((d) => d.asin === ra);
      const last = series[series.length - 1];
      return { asin: ra, brand: last?.brand || null, bsrCategory: last?.bsrCategory || null, series, summary: summarizeRivalHistory(series) };
    });

    return res.status(200).send({
      isSuccess: true,
      data: {
        asin,
        days,
        fromDate,
        retentionDays,
        historyStartDate: firstSnapshot?.date || null,
        currency: own.find((s) => s.currency)?.currency || profile.currencyCode || null,
        own,
        summary: summarizeOwnHistory(own),
        rivals,
      },
    });
  } catch (error) {
    write_logs({ message: `[getAsinHistory Error] asin=${asin} ${error?.message || error}`, log_type: "error" });
    return res.status(500).send({ isSuccess: false, message: "Something went wrong", error: "An internal server error occurred" });
  }
};

exports.getHistorySettings = async (req, res) => {
  try {
    if (!req.organizationId) return res.status(200).send({ isSuccess: false, message: "Organization not found" });
    const retentionDays = await getOrgRetention(req.organizationId);
    return res.status(200).send({ isSuccess: true, data: { retentionDays, options: RETENTION_OPTIONS } });
  } catch (error) {
    write_logs({ message: `[getHistorySettings Error] ${error?.message || error}`, log_type: "error" });
    return res.status(500).send({ isSuccess: false, message: "Something went wrong" });
  }
};

exports.updateHistorySettings = async (req, res) => {
  try {
    if (!req.organizationId) return res.status(200).send({ isSuccess: false, message: "Organization not found" });
    const retentionDays = Number(req.body?.retentionDays);
    if (!RETENTION_OPTIONS.includes(retentionDays)) {
      return res.status(200).send({ isSuccess: false, message: `retentionDays must be one of ${RETENTION_OPTIONS.join(", ")}` });
    }

    const previous = await getOrgRetention(req.organizationId);
    await organizationSchema.updateOne({ _id: req.organizationId }, { $set: { historyRetentionDays: retentionDays } });
    const result = await applyRetentionToOrganization(req.organizationId, retentionDays);

    write_logs({
      message: `[updateHistorySettings] org=${req.organizationId} user=${req?.user?._id} retention ${previous} -> ${retentionDays} days (${result?.modifiedCount ?? 0} snapshots re-dated)`,
      log_type: "info",
    });

    return res.status(200).send({
      isSuccess: true,
      message: "History retention updated",
      data: { retentionDays, previousRetentionDays: previous, options: RETENTION_OPTIONS },
    });
  } catch (error) {
    write_logs({ message: `[updateHistorySettings Error] ${error?.message || error}`, log_type: "error" });
    return res.status(500).send({ isSuccess: false, message: "Something went wrong" });
  }
};
