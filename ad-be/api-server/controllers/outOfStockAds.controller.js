const mongoose = require("mongoose");
const outOfStockAdSchema = require("../models/outOfStockAd.model");
const profileSchema = require("../models/profiles.model");
const { ELIGIBLE_PROFILE_TYPES } = require("../services/automation/outOfStockAds.service");
const { write_logs } = require("../../winston/utility/logger");

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Dashboard: out-of-stock products that are still advertised in running campaigns.
 * Reads the list saved by the daily "Out Of Stock Ads" job. Seller and vendor profiles only.
 * Body: { profileId, pageNo = 1, perPage = 10, search } — search matches ASIN, SKU, title or campaign name.
 */
exports.getOutOfStockAds = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const profileId = Number(req.body?.profileId);
    if (!configId || !profileId) return res.status(203).json({ isSuccess: false, message: "Profile Id is required" });

    const profile = await profileSchema.findOne({ configId, profileId }).select("type").lean();
    if (!profile) return res.status(203).json({ isSuccess: false, message: "Profile not found" });
    if (!ELIGIBLE_PROFILE_TYPES.has(String(profile.type || "").toLowerCase())) {
      return res.status(200).json({ isSuccess: true, available: false, data: [], totalRecords: 0 });
    }

    const pageNo = Math.max(1, parseInt(req.body?.pageNo, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.body?.perPage, 10) || 10));
    const base = { configId: new mongoose.Types.ObjectId(String(configId)), profileId };
    const search = String(req.body?.search || "").trim();
    const filter = search
      ? {
          ...base,
          $or: [
            { asin: { $regex: escapeRegex(search), $options: "i" } },
            { sku: { $regex: escapeRegex(search), $options: "i" } },
            { title: { $regex: escapeRegex(search), $options: "i" } },
            { "campaigns.campaignName": { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : base;

    const [data, totalRecords, summary] = await Promise.all([
      outOfStockAdSchema.find(filter).sort({ spend7d: -1, campaignCount: -1, asin: 1 }).skip((pageNo - 1) * perPage).limit(perPage).lean(),
      outOfStockAdSchema.countDocuments(filter),
      outOfStockAdSchema.aggregate([
        { $match: base },
        { $group: { _id: null, products: { $sum: 1 }, campaigns: { $sum: "$campaignCount" }, spend7d: { $sum: "$spend7d" }, checkedAt: { $max: "$checkedAt" } } },
      ]),
    ]);

    const s = summary[0] || {};
    return res.status(200).json({
      isSuccess: true,
      available: true,
      data,
      totalRecords,
      currentPageNo: pageNo,
      totalPages: Math.ceil(totalRecords / perPage),
      summary: { products: s.products || 0, campaigns: s.campaigns || 0, spend7d: Math.round((s.spend7d || 0) * 100) / 100 },
      lastCheckedAt: s.checkedAt || null,
    });
  } catch (error) {
    write_logs({ message: `[getOutOfStockAds Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({ isSuccess: false, message: "Something went wrong, please try again!" });
  }
};
