const mongoose = require("mongoose");
const moment = require("moment-timezone");
const fs = require("fs");
const path = require("path");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT) || 5);

const brandAnalyticsSchema = require("../models/brandAnalytics.model");
const reportsSchema = require("../models/report.model");
const productListingSchema = require("../models/productListing.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");

const {
    getSPAccessToken,
    getActivePlanProfiles,
    downloadFile,
    unzipReport,
    wait,
    safeJsonParse,
    getAllowedSyncProfiles,
} = require("../helper/common");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { write_logs } = require("../../winston/utility/logger");
const amazonAxios = require("../helper/amazonAxios");
const { retryWithBackoff } = require("../helper/retryHelper");

const escapeRegex = (string) => {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
};

exports.cronBrandAnalytics = async (customStartDate = null, customEndDate = null) => {
    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronBrandAnalytics`,
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
        let profiles = await getActivePlanProfiles(targetProfileId || "ALL", "sp", targetConfigId);
        const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", recurring);
        profiles = profiles.filter(p =>
            allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
        );

        if (!profiles || profiles.length === 0) {
            if (cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "FAILED" },
                    { new: true }
                );
            }
            return cron_logs({
                message: `Cron Order Listing stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        for (const profile of profiles) {
            if (global.updateTaskProgress) global.updateTaskProgress("Brand Analytics Report");
            cron_logs({ message: `Profile found: ${profile.name} (${profile.profileId})`, log_type: "info" });
            try {
                const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);
                if (!checkSPConfig) {
                    cron_logs({ message: `Account disconnected ${profile.profileId} for cronBrandAnalytics`, log_type: "info" });
                    continue;
                }

                const currentDate = moment().tz(profile?.timezone).format("YYYY-MM-DD");
                let getCronData;
                if (recurring) {
                    getCronData = await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile?.configId,
                            profileId: profile?.profileId,
                            cronName: "Brand Analytics Report",
                            historyDate: currentDate,
                        },
                        { $set: { status: "PENDING" } },
                        { upsert: true, new: true }
                    );
                }

                // Get all unique ASINs from productlisting schema for this profile
                const asins = await productListingSchema.find({ profileId: profile.profileId }).distinct("asin");
                if (!asins || asins.length === 0) {
                    cron_logs({ message: `No unique ASINs found for profile ${profile.profileId} - ${profile.name}`, log_type: "info" });
                    continue;
                }

                cron_logs({ message: `For profile ${profile.name}, ${asins.length} unique ASINs found`, log_type: "info" });

                // Chunk ASINs into groups of 15 (due to SP-API 200-char limit)
                const ASIN_LIMIT = 15;
                const chunks = [];
                for (let i = 0; i < asins.length; i += ASIN_LIMIT) {
                    chunks.push(asins.slice(i, i + ASIN_LIMIT));
                }

                cron_logs({ message: `For profile ${profile.name}, there are ${chunks.length} chunks of 15 ASINs`, log_type: "info" });

                const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId });
                if (!marketPlaceConfig) {
                    cron_logs({ message: `Marketplace config not found for ID: ${profile.marketplaceStringId}`, log_type: "error" });
                    continue;
                }

                if (startDateParam && endDateParam) {
                    const startDate = startDateParam;
                    const endDate = endDateParam;

                    cron_logs({
                        message: `Processing Brand Analytics for ${profile.name} | ${startDate} -> ${endDate}`,
                        log_type: "info",
                    });

                    await this.storeMonthlyBrandAnalysisData({ profile, checkSPConfig, marketPlaceConfig, chunks, startDate, endDate });
                } else {
                    for (let monthOffset = 1; monthOffset >= 1; monthOffset--) {
                        const startDate = moment().tz(profile?.timezone).subtract(monthOffset, "months").startOf("month").format("YYYY-MM-DD");
                        const endDate = moment().tz(profile?.timezone).subtract(monthOffset, "months").endOf("month").format("YYYY-MM-DD");

                        cron_logs({
                            message: `Processing Brand Analytics for ${profile.name} | ${startDate} -> ${endDate}`,
                            log_type: "info",
                        });

                        await this.storeMonthlyBrandAnalysisData({ profile, checkSPConfig, marketPlaceConfig, chunks, startDate, endDate });
                    }
                }

                if (recurring && getCronData?._id) {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        getCronData._id,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                } else if (!recurring && cronjobid) {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                }

                cron_logs({
                    message: `Monthly Brand Analytics Data Stored Successfully for Profile ${profile.name}.`,
                    log_type: "info",
                });
            } catch (err) {
                cron_logs({
                    message: `Error in profile loop for configId: ${profile.configId}, profileId: ${profile.profileId}. Error: ${err.message}`,
                    log_type: "error",
                });
            }
        }

        return cron_logs({
            message: "Brand Analytics cron completed successfully.",
            log_type: "info",
        });
    } catch (error) {
        return cron_logs({
            message: `Brand Analytics cron err: ${error.message}`,
            log_type: "error",
        });
    }
};

exports.storeMonthlyBrandAnalysisData = async ({ profile, checkSPConfig, marketPlaceConfig, chunks, startDate, endDate }) => {
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const chunkAsinsStr = chunk.join(" ");
        const reportTypeId = `GET_BRAND_ANALYTICS_MONTH_chunk_${chunkIndex}`;

        // Check if entry exists in reportsSchema
        let existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            startDate,
            endDate,
            reportTypeId,
            reportName: "Brand Analytics Report",
        });

        // 1. Create report if not exists (retry until success)
        if (!existing) {
            let success = false;
            let retryCount = 0;
            const maxRetries = 5;
            while (!success && retryCount < maxRetries) {
                cron_logs({
                    message: `Requesting monthly brand analytics report for profile ${profile.name}, chunk ${chunkIndex}...`,
                    log_type: "info",
                });

                try {
                    const createResp = await retryWithBackoff(() => amazonAxios({
                        method: "POST",
                        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
                        headers: {
                            "x-amz-access-token": checkSPConfig.spAccessToken,
                            "Content-Type": "application/json",
                        },
                        data: {
                            reportType: "GET_BRAND_ANALYTICS_SEARCH_QUERY_PERFORMANCE_REPORT",
                            marketplaceIds: [profile.marketplaceStringId],
                            dataStartTime: `${startDate}T00:00:00Z`,
                            dataEndTime: `${endDate}T23:59:59Z`,
                            reportOptions: { reportPeriod: "MONTH", asin: chunkAsinsStr },
                        },
                        meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId, isBackgroundWorker: true }
                    }));

                    existing = await reportsSchema.create({
                        profileId: profile.profileId,
                        configId: profile.configId,
                        reportId: createResp?.data?.reportId,
                        startDate,
                        endDate,
                        adProduct: "BRAND_ANALYTICS",
                        reportTypeId,
                        reportName: "Brand Analytics Report",
                        status: "PENDING",
                    });

                    cron_logs({
                        message: `Requested report. ID: ${createResp?.data?.reportId} for profile ${profile.name}, chunk ${chunkIndex}`,
                        log_type: "info",
                    });
                    success = true;
                } catch (err) {
                    retryCount++;
                    cron_logs({
                        message: `Failed to request monthly brand analytics report for profile ${profile.name}, chunk ${chunkIndex}. Error: ${err.message}. Retry ${retryCount}/${maxRetries} in 2 seconds...`,
                        log_type: "error",
                    });
                    if (retryCount >= maxRetries) {
                        cron_logs({
                            message: `Max retries reached for profile ${profile.name}, chunk ${chunkIndex}. Skipping brand analytics report creation.`,
                            log_type: "error",
                        });
                        break;
                    }
                } finally {
                    await wait(2000);
                }
            }
        }

        // 2. Process pending reports (poll until terminal state: DONE/FAILED)
        if (existing && existing.status === "PENDING") {
            let isFinished = false;
            while (!isFinished) {
                cron_logs({
                    message: `Checking report status for ID: ${existing.reportId} (chunk ${chunkIndex})`,
                    log_type: "info",
                });

                try {
                    const statusRes = await retryWithBackoff(() => amazonAxios({
                        method: "GET",
                        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${existing.reportId}`,
                        headers: {
                            "x-amz-access-token": checkSPConfig.spAccessToken,
                            "Content-Type": "application/json",
                        },
                        meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId, isBackgroundWorker: true }
                    }));

                    const processingStatus = statusRes?.data?.processingStatus;
                    cron_logs({
                        message: `Report ID: ${existing.reportId} status is ${processingStatus}`,
                        log_type: "info",
                    });

                    if (processingStatus === "DONE") {
                        let docRes;
                        try {
                            docRes = await retryWithBackoff(() => amazonAxios({
                                method: "GET",
                                url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${statusRes.data.reportDocumentId}`,
                                headers: {
                                    "x-amz-access-token": checkSPConfig.spAccessToken,
                                    "Content-Type": "application/json",
                                },
                                meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId, isBackgroundWorker: true }
                            }));
                        } catch (docErr) {
                            cron_logs({
                                message: `Failed to get document for report ID: ${existing.reportId}. Error: ${docErr.message}`,
                                log_type: "error",
                            });
                        } finally {
                            await wait(2000);
                        }

                        if (docRes?.data?.url) {
                            const dirPath = path.resolve(__dirname, "../../uploads/brandAnalytics");
                            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

                            const zipPath = path.join(dirPath, `${existing.reportId}.gz`);
                            const extractionPath = path.join(dirPath, `${existing.reportId}.json`);

                            await downloadFile(docRes.data.url, zipPath);
                            await unzipReport(zipPath, extractionPath);

                            const reportData = safeJsonParse(fs.readFileSync(extractionPath, "utf8"));
                            const items = reportData.dataByAsin || [];

                            cron_logs({
                                message: `Parsed JSON from report. Processing ${items.length} items for chunk ${chunkIndex}.`,
                                log_type: "info",
                            });

                            const periodMeta = {
                                year: moment(startDate).tz(profile?.timezone).year(),
                                month: moment(startDate).tz(profile?.timezone).format("MMMM"),
                            };

                            const bulkOps = items.map((item) => ({
                                updateOne: {
                                    filter: {
                                        configId: profile.configId,
                                        profileId: profile.profileId,
                                        asin: item.asin,
                                        startDate: item.startDate,
                                        endDate: item.endDate,
                                        "searchQueryData.searchQuery": item.searchQueryData?.searchQuery,
                                    },
                                    update: {
                                        $set: {
                                            reportPeriod: "MONTH",
                                            periodMeta,
                                            searchQueryData: {
                                                searchQuery: item.searchQueryData?.searchQuery,
                                                searchQueryScore: item.searchQueryData?.searchQueryScore,
                                                searchQueryVolume: item.searchQueryData?.searchQueryVolume,
                                            },
                                            impressionData: {
                                                totalQueryImpressionCount: item.impressionData?.totalQueryImpressionCount,
                                                asinImpressionCount: item.impressionData?.asinImpressionCount,
                                                asinImpressionShare: item.impressionData?.asinImpressionShare,
                                            },
                                            clickData: {
                                                totalClickCount: item.clickData?.totalClickCount,
                                                totalClickRate: item.clickData?.totalClickRate,
                                                asinClickCount: item.clickData?.asinClickCount,
                                                asinClickShare: item.clickData?.asinClickShare,
                                                totalSameDayShippingClickCount: item.clickData?.totalSameDayShippingClickCount,
                                            },
                                            cartAddData: {
                                                totalCartAddCount: item.cartAddData?.totalCartAddCount,
                                                totalCartAddRate: item.cartAddData?.totalCartAddRate,
                                                asinCartAddCount: item.cartAddData?.asinCartAddCount,
                                                asinCartAddShare: item.cartAddData?.asinCartAddShare,
                                                totalSameDayShippingCartAddCount: item.cartAddData?.totalSameDayShippingCartAddCount,
                                            },
                                            purchaseData: {
                                                totalPurchaseCount: item.purchaseData?.totalPurchaseCount,
                                                totalPurchaseRate: item.purchaseData?.totalPurchaseRate,
                                                asinPurchaseCount: item.purchaseData?.asinPurchaseCount,
                                                asinPurchaseShare: item.purchaseData?.asinPurchaseShare,
                                                totalSameDayShippingPurchaseCount: item.purchaseData?.totalSameDayShippingPurchaseCount,
                                            },
                                        },
                                    },
                                    upsert: true,
                                },
                            }));

                            if (bulkOps.length > 0) {
                                await brandAnalyticsSchema.bulkWrite(bulkOps);
                            }

                            await reportsSchema.updateOne(
                                { _id: existing._id },
                                { $set: { status: "COMPLETED" } }
                            );

                            cron_logs({
                                message: `Report ID: ${existing.reportId} processed and marked COMPLETED.`,
                                log_type: "info",
                            });
                        }

                        isFinished = true;

                    } else if (processingStatus === "FATAL" || processingStatus === "CANCELLED") {
                        await reportsSchema.updateOne(
                            { _id: existing._id },
                            { $set: { status: "FAILED" } }
                        );
                        cron_logs({
                            message: `Report ID: ${existing.reportId} status is ${processingStatus}, marked FAILED.`,
                            log_type: "error",
                        });
                        isFinished = true;
                    } else {
                        cron_logs({
                            message: `Report ID: ${existing.reportId} status is ${processingStatus}. Waiting 30 seconds before checking again...`,
                            log_type: "info",
                        });
                        await wait(30000);
                    }

                } catch (err) {
                    cron_logs({
                        message: `Error processing status for report ID: ${existing.reportId}. Error: ${err.message}. Retrying in 30 seconds...`,
                        log_type: "error",
                    });
                    await wait(30000);
                }
            }
        }

        cron_logs({
            message: `For profile ${profile.name}, chunk ${chunkIndex} done`,
            log_type: "info",
        });
    }
};

exports.getBrandAnalyticsFilters = async (req, res) => {
    try {

        const { configId } = req?.config;
        let { profileId, asin, year, month } = req.body;

        if (!configId || !profileId) {
            return res.status(400).json({ isSuccess: false, message: "configId and profileId are required" });
        }

        if (!year) {
            year = new Date().getFullYear().toString();
        }

        // 1. Products (distinct ASINs with title if available)
        const products = await productListingSchema.aggregate([
            { $match: { profileId: Number(profileId), configId: new mongoose.Types.ObjectId(configId) } },
            { $group: { _id: "$asin", itemName: { $first: "$itemName" }, imageURL: { $first: "$imageURL" } } },
            { $project: { _id: 0, asin: "$_id", itemName: 1, imageURL: 1 } },
            { $sort: { asin: 1 } },
        ]);

        // 2. Search Queries (distinct)
        let searchQueries = await brandAnalyticsSchema.aggregate([
            { $match: { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId), ...(asin && { asin }), "periodMeta.year": year, ...(month && { "periodMeta.month": month }) } },
            {
                $group: {
                    _id: "$searchQueryData.searchQuery",
                    totalImpressions: { $sum: { $ifNull: ["$searchQueryData.impressionData.totalQueryImpressionCount", 0] } },
                    totalClicks: { $sum: { $ifNull: ["$searchQueryData.clickData.totalClickCount", 0] } },
                    totalCartAdds: { $sum: { $ifNull: ["$searchQueryData.cartAddData.totalCartAddCount", 0] } },
                    totalPurchases: { $sum: { $ifNull: ["$searchQueryData.purchaseData.totalPurchaseCount", 0] } },
                },
            },
            { $sort: { totalImpressions: -1, totalClicks: -1, totalCartAdds: -1, totalPurchases: -1, _id: 1 } },
            { $project: { _id: 0, searchQuery: "$_id" } },
        ]);
        searchQueries = searchQueries.map((item) => item?.searchQuery);

        // 3. Reporting Periods (distinct)
        let reportingPeriods = await brandAnalyticsSchema.aggregate([
            { $match: { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId), "periodMeta.year": year } },
            { $group: { _id: "$reportPeriod" } },
            {
                $addFields: {
                    sortOrder: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$_id", "DAY"] }, then: 1 },
                                { case: { $eq: ["$_id", "WEEK"] }, then: 2 },
                                { case: { $eq: ["$_id", "MONTH"] }, then: 3 },
                                { case: { $eq: ["$_id", "QUARTER"] }, then: 4 },
                                { case: { $eq: ["$_id", "YEAR"] }, then: 5 },
                            ],
                            default: 999,
                        },
                    },
                },
            },
            { $sort: { sortOrder: 1 } },
            { $project: { _id: 0, value: "$_id" } },
        ]);
        reportingPeriods = reportingPeriods.map((item) => item?.value);

        // 4. Years (distinct)
        let years = await brandAnalyticsSchema.aggregate([
            { $match: { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) } },
            { $group: { _id: "$periodMeta.year" } },
            { $sort: { _id: -1 } },
            { $project: { _id: 0, value: "$_id" } },
        ]);
        years = years.map((item) => item?.value);

        // 5. Months (distinct)
        let months = await brandAnalyticsSchema.aggregate([
            { $match: { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId), "periodMeta.year": year } },
            { $group: { _id: "$periodMeta.month" } },
            {
                $addFields: {
                    monthOrder: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$_id", "December"] }, then: 1 },
                                { case: { $eq: ["$_id", "November"] }, then: 2 },
                                { case: { $eq: ["$_id", "October"] }, then: 3 },
                                { case: { $eq: ["$_id", "September"] }, then: 4 },
                                { case: { $eq: ["$_id", "August"] }, then: 5 },
                                { case: { $eq: ["$_id", "July"] }, then: 6 },
                                { case: { $eq: ["$_id", "June"] }, then: 7 },
                                { case: { $eq: ["$_id", "May"] }, then: 8 },
                                { case: { $eq: ["$_id", "April"] }, then: 9 },
                                { case: { $eq: ["$_id", "March"] }, then: 10 },
                                { case: { $eq: ["$_id", "February"] }, then: 11 },
                                { case: { $eq: ["$_id", "January"] }, then: 12 },
                            ],
                            default: 999,
                        },
                    },
                },
            },
            { $sort: { monthOrder: 1 } },
            { $project: { _id: 0, value: "$_id" } },
        ]);
        months = months.map((item) => item?.value);

        return res.status(200).json({
            isSuccess: true,
            data: { products, searchQueries, reportingPeriods, years, months },
        });
    } catch (error) {
        write_logs({ message: `[getBrandAnalyticsFilters Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
};

exports.getAllBrandAnalytics = async (req, res) => {
    try {
        const { configId } = req?.config;
        const { profileId, asin, searchQuery, reportPeriod, year, month, page = 1, limit = 10, fieldName = "totalQueryImpressionCount", sortOrder = -1 } = req.body;

        if (!configId || !profileId) {
            return res.status(400).json({ isSuccess: false, message: "configId and profileId are required" });
        }

        const matchStage = {
            configId: new mongoose.Types.ObjectId(configId),
            profileId: Number(profileId),
        };

        if (asin) matchStage.asin = asin;
        if (reportPeriod) matchStage.reportPeriod = reportPeriod;
        if (year) matchStage["periodMeta.year"] = Number(year);
        if (month) matchStage["periodMeta.month"] = month;
        if (searchQuery) matchStage["searchQueryData.searchQuery"] = searchQuery;

        const skip = (Number(page) - 1) * Number(limit);
        const lim = Number(limit);
        const sort = { [fieldName]: Number(sortOrder) };

        const pipeline = [
            { $match: matchStage },
            {
                $lookup: {
                    from: "productlistings",
                    let: { asin: "$asin" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$asin", "$$asin"] } } },
                        { $sort: { reportDate: -1 } },
                        { $limit: 1 },
                        { $project: { itemName: "$itemName", imageURL: "$imageURL" } }
                    ],
                    as: "productInfo"
                }
            },
            { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
            {
                $facet: {
                    totalFunnel: [
                        {
                            $group: {
                                _id: "$searchQueryData.searchQuery",
                                totalImpressions: { $first: "$impressionData.totalQueryImpressionCount" },
                                totalClicks: { $first: "$clickData.totalClickCount" },
                                totalCartAdds: { $first: "$cartAddData.totalCartAddCount" },
                                totalPurchases: { $first: "$purchaseData.totalPurchaseCount" },
                            },
                        },
                        {
                            $group: {
                                _id: null,
                                totalImpressions: { $sum: "$totalImpressions" },
                                totalClicks: { $sum: "$totalClicks" },
                                totalCartAdds: { $sum: "$totalCartAdds" },
                                totalPurchases: { $sum: "$totalPurchases" },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                impressions: "$totalImpressions",
                                clicks: "$totalClicks",
                                cartAdds: "$totalCartAdds",
                                purchases: "$totalPurchases",
                                clickRate: { $cond: [{ $gt: ["$totalImpressions", 0] }, { $round: [{ $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] }, 2] }, 0] },
                                cartRate: { $cond: [{ $gt: ["$totalClicks", 0] }, { $round: [{ $multiply: [{ $divide: ["$totalCartAdds", "$totalClicks"] }, 100] }, 2] }, 0] },
                                purchaseRate: { $cond: [{ $gt: ["$totalCartAdds", 0] }, { $round: [{ $multiply: [{ $divide: ["$totalPurchases", "$totalCartAdds"] }, 100] }, 2] }, 0] },
                            },
                        },
                    ],

                    // ── Brand Funnel (Right) ───────────────────────────
                    brandFunnel: [
                        {
                            $group: {
                                _id: null,
                                asinImpressions: { $sum: "$impressionData.asinImpressionCount" },
                                asinClicks: { $sum: "$clickData.asinClickCount" },
                                asinCartAdds: { $sum: "$cartAddData.asinCartAddCount" },
                                asinPurchases: { $sum: "$purchaseData.asinPurchaseCount" },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                impressions: "$asinImpressions",
                                clicks: "$asinClicks",
                                cartAdds: "$asinCartAdds",
                                purchases: "$asinPurchases",
                                clickRate: { $cond: [{ $gt: ["$asinImpressions", 0] }, { $round: [{ $multiply: [{ $divide: ["$asinClicks", "$asinImpressions"] }, 100] }, 2] }, 0] },
                                cartRate: { $cond: [{ $gt: ["$asinClicks", 0] }, { $round: [{ $multiply: [{ $divide: ["$asinCartAdds", "$asinClicks"] }, 100] }, 2] }, 0] },
                                purchaseRate: { $cond: [{ $gt: ["$asinCartAdds", 0] }, { $round: [{ $multiply: [{ $divide: ["$asinPurchases", "$asinCartAdds"] }, 100] }, 2] }, 0] },
                            },
                        },
                    ],

                    gridData: [
                        {
                            $group: {
                                _id: "$searchQueryData.searchQuery",

                                searchQueryScore: { $first: "$searchQueryData.searchQueryScore" },
                                searchQueryVolume: { $first: "$searchQueryData.searchQueryVolume" },

                                totalImpressions: { $first: "$impressionData.totalQueryImpressionCount" },
                                asinImpressions: { $sum: "$impressionData.asinImpressionCount" },
                                // asinImpressionShare: { $avg: "$impressionData.asinImpressionShare" },

                                totalClicks: { $first: "$clickData.totalClickCount" },
                                totalClickRate: { $avg: "$clickData.totalClickRate" },
                                asinClicks: { $sum: "$clickData.asinClickCount" },
                                // asinClickShare: { $avg: "$clickData.asinClickShare" },

                                totalCartAdds: { $first: "$cartAddData.totalCartAddCount" },
                                totalCartAddRate: { $avg: "$cartAddData.totalCartAddRate" },
                                asinCartAdds: { $sum: "$cartAddData.asinCartAddCount" },
                                // asinCartAddShare: { $avg: "$cartAddData.asinCartAddShare" },

                                totalPurchases: { $first: "$purchaseData.totalPurchaseCount" },
                                totalPurchaseRate: { $avg: "$purchaseData.totalPurchaseRate" },
                                asinPurchases: { $sum: "$purchaseData.asinPurchaseCount" },
                                // asinPurchaseShare: { $avg: "$purchaseData.asinPurchaseShare" },

                                searchQueryProducts: {
                                    $push: {
                                        asin: "$asin",
                                        itemName: "$productInfo.itemName",
                                        imageURL: "$productInfo.imageURL",
                                        asinImpressions: "$impressionData.asinImpressionCount",
                                        asinClicks: "$clickData.asinClickCount",
                                        asinCartAdds: "$cartAddData.asinCartAddCount",
                                        asinPurchases: "$purchaseData.asinPurchaseCount",
                                        asinClickRate: "$clickData.asinClickShare",
                                        asinCartAddRate: "$cartAddData.asinCartAddShare",
                                        asinPurchaseRate: "$purchaseData.asinPurchaseShare",
                                    },
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                searchQuery: "$_id",
                                searchQueryScore: 1,
                                searchQueryVolume: 1,
                                totalImpressions: 1,
                                asinImpressions: 1,
                                asinImpressionShare: { $round: [{ $cond: [{ $gt: ["$totalImpressions", 0] }, { $multiply: [{ $divide: ["$asinImpressions", "$totalImpressions"] }, 100] }, 0] }, 2] },
                                totalClicks: 1,
                                totalClickRate: { $round: ["$totalClickRate", 2] },
                                asinClicks: 1,
                                asinClickShare: { $round: [{ $cond: [{ $gt: ["$totalClicks", 0] }, { $multiply: [{ $divide: ["$asinClicks", "$totalClicks"] }, 100] }, 0] }, 2] },
                                totalCartAdds: 1,
                                totalCartAddRate: { $round: ["$totalCartAddRate", 2] },
                                asinCartAdds: 1,
                                asinCartAddShare: { $round: [{ $cond: [{ $gt: ["$totalCartAdds", 0] }, { $multiply: [{ $divide: ["$asinCartAdds", "$totalCartAdds"] }, 100] }, 0] }, 2] },
                                totalPurchases: 1,
                                totalPurchaseRate: { $round: ["$totalPurchaseRate", 2] },
                                asinPurchases: 1,
                                asinPurchaseShare: { $round: [{ $cond: [{ $gt: ["$totalPurchases", 0] }, { $multiply: [{ $divide: ["$asinPurchases", "$totalPurchases"] }, 100] }, 0] }, 2] },

                                searchQueryProducts: {
                                    $map: {
                                        input: "$searchQueryProducts",
                                        as: "p",
                                        in: {
                                            asin: "$$p.asin",
                                            itemName: "$$p.itemName",
                                            imageURL: "$$p.imageURL",
                                            asinImpressions: "$$p.asinImpressions",
                                            asinClicks: "$$p.asinClicks",
                                            asinCartAdds: "$$p.asinCartAdds",
                                            asinPurchases: "$$p.asinPurchases",
                                            asinClickRate: "$$p.asinClickRate",
                                            asinCartAddRate: "$$p.asinCartAddRate",
                                            asinPurchaseRate: "$$p.asinPurchaseRate",
                                        },
                                    },
                                },
                            },
                        },
                        { $sort: sort },
                        { $group: { _id: null, allRows: { $push: "$$ROOT" }, totalRecords: { $sum: 1 } } },
                        { $project: { _id: 0, totalRecords: 1, data: { $slice: ["$allRows", skip, lim] } } },
                    ],
                },
            },

            // ── Reshape final output ───────────────────────────────────
            {
                $project: {
                    funnelData: {
                        total: { $ifNull: [{ $arrayElemAt: ["$totalFunnel", 0] }, {}] },
                        brandSpecific: { $ifNull: [{ $arrayElemAt: ["$brandFunnel", 0] }, {}] },
                    },
                    gridData: { $ifNull: [{ $arrayElemAt: ["$gridData", 0] }, { data: [], totalRecords: 0 }] },
                },
            },
        ];

        const [result] = await brandAnalyticsSchema.aggregate(pipeline);

        const gridData = result?.gridData ?? { data: [], totalRecords: 0 };
        const totalRecords = gridData.totalRecords ?? 0;

        return res.status(200).json({
            isSuccess: true,
            data: {
                funnelData: result?.funnelData ?? { total: {}, brandSpecific: {} },
                gridData: gridData.data,
                pagination: {
                    totalRecords,
                    currentPage: Number(page),
                    totalPages: Math.ceil(totalRecords / lim),
                    limit: lim,
                },
            },
        });

    } catch (error) {
        write_logs({ message: `[getAllBrandAnalytics Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
};
