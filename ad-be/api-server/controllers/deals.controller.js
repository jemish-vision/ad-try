const mongoose = require("mongoose");
const { withDownloadedReportFile } = require("../helper/reportFile.helper");
const { retryWithBackoff } = require("../helper/retryHelper");
const { runHistoricalSellerReport, aggregateSellerReportStatus } = require("../services/historicalSellerReport.service");

const moment = require("moment-timezone");
const fs = require("fs");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");

const dealPerformanceSchema = require("../models/dealPerformance.model");
const reportsSchema = require("../models/report.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const { reportRequestFailureReason, syncNotCompletedReason } = require("../helpers/cronHistoryError.helper");
const profileSchema = require("../models/profiles.model");

const {
    getSPAccessToken,
    getActivePlanProfiles,
    parallelBulkWrite,
    downloadFile,
    getAllowedSyncProfiles
} = require("../helper/common");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const amazonAxios = require("../helper/amazonAxios");
const { write_logs } = require("../../winston/utility/logger");

exports.cronSyncDealPerformance = async (customStartDate = null, customEndDate = null) => {
    const reportPhase = customStartDate?.reportPhase;
    const phaseResults = [];
    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronSyncDealPerformance`,
        log_type: "info",
    });

    try {
        let pastSyncObj = null;
        let startDateParam = null;
        let endDateParam = null;
        let cronjobid = null;
        let recurring = true;

        if (customStartDate && typeof customStartDate === "object") {
            pastSyncObj = customStartDate;
            cronjobid = pastSyncObj.cronjobid;
            startDateParam = pastSyncObj.startDate;
            endDateParam = pastSyncObj.endDate;
            recurring = pastSyncObj.recurring;
        } else {
            startDateParam = customStartDate;
            endDateParam = customEndDate;
        }

        const targetProfileId = pastSyncObj?.profileId;
        const targetConfigId = pastSyncObj?.configId;
        let profiles = await getActivePlanProfiles(targetProfileId, "sp", targetConfigId);
        const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", recurring);
        profiles = profiles.filter(p =>
            allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
        );

        if (!profiles || profiles.length === 0) {
            if (cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "FAILED", error: syncNotCompletedReason("SELLER_CATALOG", "seller") },
                    { new: true }
                );
            }
            if (reportPhase) return "ERROR";
            return cron_logs({
                message: `Cron Deals sync stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        for (const profile of profiles) {
            try {
                const token = await getSPAccessToken(profile.configId, profile.profileId);
                if (!token) { if (reportPhase) phaseResults.push("ERROR"); continue; }

                const now = moment().tz(profile.timezone);
                const currentDate = now.format("YYYY-MM-DD");

                // Check or Create Cron History
                let cronData;
                if (recurring) {
                    cronData = await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Sync Deals Dashboard",
                            historyDate: currentDate
                        },
                        { $set: { status: "PENDING" } },
                        { upsert: true, new: true }
                    ).lean();
                }

                // Sync logic: Request last 90 days to ensure updates are caught, and 60 days into the future to fetch Upcoming scheduled deals.
                let startDate, endDate;
                if (startDateParam && endDateParam) {
                    startDate = startDateParam;
                    endDate = endDateParam;
                } else {
                    startDate = now.clone().subtract(90, "days").format("YYYY-MM-DD");
                    endDate = now.clone().add(60, "days").format("YYYY-MM-DD");
                }

                const syncStatus = await syncDealsReport(profile, token, startDate, endDate, recurring, { phase: reportPhase });
                if (reportPhase) phaseResults.push(syncStatus);

                if (recurring && cronData?._id && syncStatus !== "FAILED") {
                    await cronJobHistorySchema.findByIdAndUpdate(cronData._id, { status: "COMPLETED" });
                } else if (!reportPhase && !recurring && cronjobid && syncStatus === "COMPLETED") {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                }
            } catch (err) {
                if (reportPhase) phaseResults.push("ERROR");
                cron_logs({ message: `Err for profile ${profile.profileId}: ${err}`, log_type: "error" });
            }
        }

        if (reportPhase) {
            const result = aggregateSellerReportStatus(phaseResults);
            if (cronjobid) await cronJobHistorySchema.findByIdAndUpdate(cronjobid, { status: result === "ERROR" ? "FAILED" : result });
            return result;
        }
        return cron_logs({ message: "Deals Dashboard sync completed.", log_type: "info" });
    } catch (error) {
        if (reportPhase) {
            if (customStartDate?.cronjobid) await cronJobHistorySchema.findByIdAndUpdate(customStartDate.cronjobid, { status: "FAILED" });
            return "ERROR";
        }
        return cron_logs({ message: `Deals Dashboard cron err: ${error}`, log_type: "error" });
    }
};


const syncDealsReport = async (profile, token, startDate, endDate, recurring = true, options = {}) => {
    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
    if (!marketPlaceConfig) return "FAILED";

    const reportTypeId = "GET_PROMOTION_PERFORMANCE_REPORT";
    if (options.phase) {
        return runHistoricalSellerReport({
            phase: options.phase,
            identity: { configId: profile.configId, profileId: profile.profileId, reportName: "Deals Performance", reportTypeId, startDate, endDate },
            createRequest: () => syncDealsReport(profile, token, startDate, endDate, false, { createOnly: true }),
            processReport: report => syncDealsReport(profile, token, startDate, endDate, false, { report }),
        });
    }

    // Check for existing pending report
    let existing = options.report || null;
    if (options.report || options.createOnly) {
        // Explicit phases consume the locked exact report or create under the request lease.
    } else if (recurring) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            reportName: "Deals Performance",
            reportTypeId: reportTypeId,
            status: { $in: ["PENDING"] },
            createdAt: { $gte: twentyFourHoursAgo },
        }).lean().sort({ createdAt: -1 });
    } else {
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            reportName: "Deals Performance",
            startDate,
            endDate,
            reportTypeId: reportTypeId
        }).lean().sort({ createdAt: -1 });
        if (existing && existing.status == "COMPLETED") return "COMPLETED";
        if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING"].includes(existing?.status)) {
            existing = null;
        }
    }

    let reportId = existing?.reportId;

    if (!existing) {
        const createResp = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
            headers: {
                "x-amz-access-token": token?.spAccessToken,
                "Content-Type": "application/json",
            },
            data: {
                reportType: reportTypeId,
                marketplaceIds: [profile?.marketplaceStringId],
                dataStartTime: `${startDate}T00:00:00Z`,
                dataEndTime: `${endDate}T23:59:59Z`,
                reportOptions: {
                    promotionStartDateFrom: `${startDate}T00:00:00Z`,
                    promotionStartDateTo: `${endDate}T23:59:59Z`
                }
            },
            meta: { configId: profile?.configId, profileId: profile?.profileId, tokenKey: "spAccessToken", sp: true }
        }));

        if (!createResp?.data?.reportId) return "FAILED";

        reportId = createResp.data.reportId;
        cron_logs({ message: `Report requested successfully. ReportId: ${reportId}`, log_type: "info" });

        const createdReport = await reportsSchema.create({
            profileId: profile.profileId,
            configId: profile.configId,
            reportId: reportId,
            startDate: startDate,
            endDate: endDate,
            reportName: "Deals Performance",
            reportTypeId: reportTypeId,
            status: "PENDING"
        });

        return options.createOnly ? createdReport : "PENDING";
    }

    // Polling Status
    const statusRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${reportId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile?.configId, profileId: profile?.profileId, tokenKey: "spAccessToken", sp: true }
    }));

    if (statusRes?.data?.processingStatus === "FATAL" || (options.report && ["FAILED", "ERROR"].includes(statusRes?.data?.processingStatus))) {
        await reportsSchema.updateOne({ reportId }, { $set: { status: "FATAL" } });
        cron_logs({ message: `Report FATAL: ${reportId}`, log_type: "error" });
        return "FAILED";
    }
    if (options.report && statusRes?.data?.processingStatus === "CANCELLED") {
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "CANCELLED" } });
        return "COMPLETED";
    }

    if (statusRes?.data?.processingStatus !== "DONE") {
        cron_logs({ message: `Report ${reportId} is still ${statusRes?.data?.processingStatus} on Amazon. Waiting for next cron cycle.`, log_type: "info" });
        return "PENDING";
    }

    // GET DOCUMENT
    cron_logs({ message: `Report ${reportId} is DONE. Preparing to download...`, log_type: "info" });
    const docRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${statusRes?.data?.reportDocumentId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile?.configId, profileId: profile?.profileId, tokenKey: "spAccessToken", sp: true }
    }));

    if (!docRes?.data?.url) return "FAILED";

    await withDownloadedReportFile(docRes.data.url, downloadFile,
      filePath => processDealsReport(filePath, { profileId: profile?.profileId, configId: profile?.configId }));

    await reportsSchema.updateOne({ reportId }, { $set: { status: "COMPLETED" } });
    return "COMPLETED";
};

const processDealsReport = async (filePath, { profileId, configId }) => {
    const BULK_SIZE = Number(process.env.BATCH) || 100;
    return new Promise((resolve, reject) => {
        const pipeline = chain([
            fs.createReadStream(filePath),
            parser(),
            pick({ filter: "promotions" }),
            streamArray(),
        ]);

        let bulkOps = [];

        pipeline.on("data", async ({ value }) => {
            pipeline.pause();

            bulkOps.push({
                updateOne: {
                    filter: { profileId, promotionId: value.promotionId },
                    update: {
                        $set: {
                            configId,
                            marketplaceId: value.marketplaceId,
                            merchantId: value.merchantId,
                            promotionName: value.promotionName,
                            type: value.type,
                            status: value.status,
                            glanceViews: value.glanceViews || 0,
                            unitsSold: value.unitsSold || 0,
                            revenue: value.revenue || 0,
                            revenueCurrencyCode: value.revenueCurrencyCode,
                            startDateTime: value.startDateTime ? new Date(value.startDateTime) : null,
                            endDateTime: value.endDateTime ? new Date(value.endDateTime) : null,
                            createdDateTime: value.createdDateTime ? new Date(value.createdDateTime) : null,
                            lastUpdatedDateTime: value.lastUpdatedDateTime ? new Date(value.lastUpdatedDateTime) : null,
                            includedProducts: (value.includedProducts || []).map(p => ({
                                asin: p.asin,
                                productName: p.productName,
                                productGlanceViews: p.productGlanceViews || 0,
                                productUnitsSold: p.productUnitsSold || 0,
                                productRevenue: p.productRevenue || 0,
                                productRevenueCurrencyCode: p.productRevenueCurrencyCode
                            }))
                        }
                    },
                    upsert: true
                },
            });

            if (bulkOps.length >= BULK_SIZE) {
                await parallelBulkWrite(dealPerformanceSchema, bulkOps.splice(0));
            }
            pipeline.resume();
        });

        pipeline.on("end", async () => {
            if (bulkOps.length > 0) await parallelBulkWrite(dealPerformanceSchema, bulkOps);
            resolve();
        });

        pipeline.on("error", reject);
    });
};

/**
 * API Endpoint: Get Dashboard Stats
 */
exports.getDealsDashboardStats = async (req, res) => {
    if (req.user?.isMockUser) return require("../services/mockTestingData.service").getDealsDashboardStats(req, res);
    try {
        const configId = req?.config?.configId;
        const { profileId, startDate, endDate } = req.query;
        if (!profileId) return res.status(203).json({ isSuccess: false, message: "Profile ID required" });

        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
        if (!profile) return res.status(203).json({ isSuccess: false, message: "Access denied or profile not found" });
        const timezone = profile?.timezone ?? "Asia/Kolkata";

        let filter = { profileId: Number(profileId), ...(configId && { configId }) };

        if (startDate && endDate) {
            const startDt = moment.tz(startDate, timezone).startOf("day").toDate();
            const endDt = moment.tz(endDate, timezone).endOf("day").toDate();
            filter.startDateTime = { $gte: startDt, $lte: endDt };
        }

        const stats = await dealPerformanceSchema.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$revenue" },
                    totalUnits: { $sum: "$unitsSold" },
                    totalViews: { $sum: "$glanceViews" },
                }
            }
        ]);

        const result = stats[0] || { totalSales: 0, totalUnits: 0, totalViews: 0 };
        // Conversion Rate calculation
        result.conversionRate = result.totalViews > 0 ? ((result.totalUnits / result.totalViews) * 100).toFixed(2) : 0;

        res.json({ isSuccess: true, data: result });
    } catch (error) {
        write_logs({ message: `[getDealsDashboardStats Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
};

/**
 * API Endpoint: Get Deals List
 */
exports.getDealsList = async (req, res) => {
    if (req.user?.isMockUser) return require("../services/mockTestingData.service").getDealsList(req, res);
    try {
        const configId = req?.config?.configId;
        const { profileId, pageNo = 1, perPage = 10, search, status, type, startDate, endDate, sortColumn, sortOrder } = req.query;
        if (!profileId) return res.status(203).json({ isSuccess: false, message: "Profile ID required" });

        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
        if (!profile) return res.status(203).json({ isSuccess: false, message: "Access denied or profile not found" });
        const timezone = profile?.timezone ?? "Asia/Kolkata";

        let filter = { profileId: Number(profileId), ...(configId && { configId }) };
        const now = moment().tz(timezone).toDate();
        const andConditions = [];

        if (status) {
            switch (status) {
                case "Running":
                    filter.status = "APPROVED";
                    filter.startDateTime = { $lte: now };
                    filter.endDateTime = { $gte: now };
                    break;
                case "Upcoming":
                    filter.status = "APPROVED";
                    filter.startDateTime = { $gt: now };
                    break;
                case "Ended":
                    andConditions.push({
                        $or: [
                            { status: "EXPIRED" },
                            { status: "APPROVED", endDateTime: { $lt: now } }
                        ]
                    });
                    break;
                case "Canceled":
                    filter.status = "CANCELLED";
                    break;
                case "Needs Attention":
                    filter.status = { $nin: ["APPROVED", "EXPIRED", "CANCELLED"] };
                    break;
                default:
                    filter.status = status;
            }
        }

        if (type) filter.type = type;

        if (startDate && endDate) {
            const startDt = moment.tz(startDate, timezone).startOf("day").toDate();
            const endDt = moment.tz(endDate, timezone).endOf("day").toDate();
            andConditions.push({
                startDateTime: { $gte: startDt, $lte: endDt }
            });
        }

        if (search) {
            andConditions.push({
                $or: [
                    { promotionName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                    { promotionId: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                    { "includedProducts.asin": { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }
                ]
            });
        }

        if (andConditions.length > 0) {
            filter.$and = andConditions;
        }

        const sort = {};
        if (sortColumn) {
            sort[sortColumn] = sortOrder === "asc" ? 1 : -1;
        } else {
            sort.startDateTime = -1;
        }

        const totalRecords = await dealPerformanceSchema.countDocuments(filter);
        const deals = await dealPerformanceSchema.aggregate([
            { $match: filter },
            {
                $addFields: {
                    conversionRate: {
                        $cond: [
                            { $gt: ["$glanceViews", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$unitsSold", "$glanceViews"] }, 100] }, 2] },
                            0
                        ]
                    }
                }
            },
            { $sort: sort },
            { $skip: (Number(pageNo) - 1) * Number(perPage) },
            { $limit: Number(perPage) }
        ]);

        res.json({
            isSuccess: true,
            totalRecords,
            data: deals
        });
    } catch (error) {
        write_logs({ message: `[getDealsList Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
};
