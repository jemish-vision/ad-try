
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { retryWithBackoff } = require("../helper/retryHelper");

const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));
const fs = require("fs");
const path = require("path");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");

const campaignSchema = require("../models/campaign.model");
const sbCampaignSchema = require("../models/sbCampaign.model");
const sdCampaignSchema = require("../models/sdCampaign.model");

const inventorySchema = require("../models/inventory.model");
const productListingSchema = require("../models/productListing.model");
const productAdsSchema = require("../models/productAds.model");
const businessProductSalesSchema = require("../models/businessProductSales.model");
const dailyOrderSalesSchema = require("../models/dailyOrderSales.model");
const inventoryAgingConfigSchema = require("../models/inventoryAgingConfig.model");
const adNotificationSchema = require("../models/adNotification.model");
const globalInventorySettingSchema = require("../models/globalInventorySetting.model");
const asinInventorySettingSchema = require("../models/asinInventorySetting.model");
const warehousePlanningSettingSchema = require("../models/warehousePlanningSetting.model");
const fcInventoryLedgerSchema = require("../models/fcInventoryLedger.model");
const fulfillmentCenterMasterSchema = require("../models/fulfillmentCenterMaster.model");
const fulfillmentCenterSchema = require("../models/fulfillmentCenter.model");
const profilesSchema = require("../models/profiles.model");

const { sendEmailHelper } = require("../helper/emailHelper");
const { logAudit } = require("../helpers/auditHelper");
const { sendNotificationToUser } = require("../helper/sendNotification");

const reportsSchema = require("../models/report.model");

const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");

const {
    getSPAccessToken,
    buildFieldFilter,
    getActivePlanProfiles,
    parallelBulkWrite,
    downloadFile,
    unzipReport,
    safeJSON,
    getDatesBetween,
    getAllowedSyncProfiles
} = require("../helper/common");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { write_logs } = require("../../winston/inventory/logger");
const amazonAxios = require("../helper/amazonAxios");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { buildInventoryForecastAlertEmail } = require("../../emailTemplate/buildInventoryForecastAlertEmail");
const { sanitizeQueryObject } = require("../helper/sanitizeQuery");

exports.cronGenerateInvetoryReport = async (customParam1 = null, customParam2 = null) => {
    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronGenerateInvetoryReport`,
        log_type: "info",
    });

    try {

        let pastSyncObj = null;
        let cronjobid = null;
        let recurring = true;

        if (customParam1 && typeof customParam1 === "object") {
            pastSyncObj = customParam1;
            cronjobid = pastSyncObj.cronjobid;
            recurring = pastSyncObj.recurring ?? true;
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
                message: `Cron Sync Inventory stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const promises = profiles.map(profile => limit(async () => {
            if (global.updateTaskProgress) global.updateTaskProgress("Sync Inventory");
            const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);

            if (!checkSPConfig) {
                return cron_logs({
                    message: `Account disconnected ${profile.profileId}`,
                    log_type: "info",
                });
            }

            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            let cronData;
            if (recurring) {
                cronData = await cronJobHistorySchema.findOneAndUpdate(
                    {
                        configId: profile.configId,
                        profileId: profile.profileId,
                        cronName: "Sync Inventory",
                        historyDate: currentDate
                    },
                    { $set: { status: "PENDING" } },
                    { upsert: true, new: true }
                ).lean();
            }

            await syncFBAInventory(profile, checkSPConfig);

            await syncFBMInventory(profile, checkSPConfig);

            if (recurring && cronData?._id) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronData._id,
                    { status: "COMPLETED" }
                );
            } else if (!recurring && cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "COMPLETED" },
                    { new: true },
                );
            }

        }));

        await Promise.all(promises);

        return cron_logs({
            message: "Inventory sync completed.",
            log_type: "info",
        });
    } catch (error) {
        return cron_logs({
            message: `Inventory cron err: ${error}`,
            log_type: "error",
        });
    }
};

const syncFBAInventory = async (profile, checkSPConfig) => {
    let nextToken = null;
    let page = 1;
    let bulkOps = [];

    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
    do {

        const reqOption = {
            method: "GET",
            url: `${marketPlaceConfig.endPoint}/fba/inventory/v1/summaries?marketplaceIds=${profile.marketplaceStringId}&granularityType=Marketplace&details=true&granularityId=${profile.marketplaceStringId}&nextToken=${nextToken ?? ""}`,
            headers: {
                "x-amz-access-token": `${checkSPConfig.spAccessToken}`,
                "Content-Type": "application/json",
            },
            meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
        };

        const response = await retryWithBackoff(() => amazonAxios(reqOption));

        const items = response?.data?.payload?.inventorySummaries || [];

        for (const item of items) {
            const currentStock = item.inventoryDetails?.fulfillableQuantity || 0;
            const inboundStock = item.inventoryDetails?.inboundWorkingQuantity + item.inventoryDetails?.inboundShippedQuantity + item.inventoryDetails?.inboundReceivingQuantity || 0;
            const reservedStock = item.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0;

            bulkOps.push({
                updateOne: {
                    filter: {
                        profileId: profile.profileId,
                        sellerId: checkSPConfig?.sellerId,
                        sku: item.sellerSku,
                        fulfillmentType: "FBA",
                    },
                    update: {
                        $set: {
                            configId: profile.configId,
                            asin: item.asin,
                            name: item.productName || "",
                            fulfillmentType: "FBA",
                            currentStock,
                            inboundStock,
                            reservedStock,
                            totalStock: currentStock + inboundStock - reservedStock,
                        }
                    },
                    upsert: true
                }
            });
        }

        if (bulkOps.length) {
            cron_logs({
                message: `FBA Profile: ${profile.name}, Page: ${page++}, Inventory Count: ${bulkOps?.length}`,
            });
            await parallelBulkWrite(inventorySchema, bulkOps);
            bulkOps = [];
        }

        nextToken = response?.data?.pagination?.nextToken;
    } while (nextToken);

    if (bulkOps.length) {
        await parallelBulkWrite(inventorySchema, bulkOps);
    }
};

const syncFBMInventory = async (profile, checkSPConfig) => {
    let nextToken = null;
    let page = 1;
    let bulkOps = [];

    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();

    do {

        const reqOption = {
            method: "GET",
            url: `${marketPlaceConfig.endPoint}/listings/2021-08-01/items/${checkSPConfig.sellerId}?marketplaceIds=${profile.marketplaceStringId}&includedData=summaries,fulfillmentAvailability&pageToken=${nextToken ? encodeURIComponent(nextToken) : ""}`,
            headers: {
                "x-amz-access-token": checkSPConfig.spAccessToken,
                "Content-Type": "application/json"
            },
            meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
        };

        const response = await retryWithBackoff(() => amazonAxios(reqOption));

        const items = response?.data?.items || [];

        for (const item of items) {
            const summary = item?.summaries?.[0];
            const fulfillment = item?.fulfillmentAvailability?.[0];

            const qty = fulfillment?.quantity || 0;

            if (fulfillment?.quantity) {
                bulkOps.push({
                    updateOne: {
                        filter: {
                            profileId: profile.profileId,
                            sellerId: checkSPConfig.sellerId,
                            sku: item.sku,
                            fulfillmentType: "FBM",
                        },
                        update: {
                            $set: {
                                configId: profile.configId,
                                marketplaceId: profile.marketplaceStringId,
                                asin: summary?.asin,
                                name: summary?.itemName || "",
                                fulfillmentType: "FBM",
                                currentStock: qty,
                                reservedStock: 0,
                                inboundStock: 0,
                                totalStock: qty,
                            }
                        },
                        upsert: true
                    }
                });
            }
        }

        if (bulkOps.length) {
            cron_logs({
                message: `FBM Profile: ${profile.name}, Page: ${page++}, Count: ${bulkOps.length}`
            });
            await parallelBulkWrite(inventorySchema, bulkOps);
            bulkOps = [];
        }

        nextToken = response?.data?.pagination?.nextToken;

    } while (nextToken);
    if (bulkOps.length) {
        await parallelBulkWrite(inventorySchema, bulkOps);
    }
};

exports.cronGenerateSalesReport = async (customStartDate = null, customEndDate = null) => {
    try {
        cron_logs({
            message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronGenerateSalesReport`,
            log_type: "info",
        });

        let pastSyncObj = null;
        let startDateParam = null;
        let endDateParam = null;
        let cronjobid = null;
        let recurring = true;

        if (customStartDate && typeof customStartDate === "object") {
            pastSyncObj = customStartDate;
            startDateParam = pastSyncObj.startDate;
            endDateParam = pastSyncObj.endDate;
            cronjobid = pastSyncObj.cronjobid;
            recurring = pastSyncObj.recurring;
        } else {
            startDateParam = customStartDate;
            endDateParam = customEndDate;
        }

        const targetConfigId = pastSyncObj?.configId;
        const targetProfileId = pastSyncObj?.profileId;
        let profiles = await getActivePlanProfiles(targetProfileId, "sp", targetConfigId);

        const allowedProfiles = await getAllowedSyncProfiles("ORDERS_AND_FINANCE", "seller", recurring);
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
                message: `Cron Sales Report stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }
        const promises = profiles.map(profile => limit(async () => {
            try {
                if (global.updateTaskProgress) global.updateTaskProgress("Sales Report");
                const token = await getSPAccessToken(profile?.configId, profile?.profileId);
                if (!token) {
                    return cron_logs({ message: `Account disconnected in report for profile ${profile.name}` });
                }

                const now = moment().tz(profile.timezone);
                const currentDate = now.format("YYYY-MM-DD");
                let getCronData;
                if (recurring) {
                    getCronData = await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Sales Report",
                            historyDate: currentDate
                        },
                        { $set: { status: "PENDING" } },
                        { upsert: true, new: true }
                    ).lean();
                }

                let datesToSync = [];
                if (startDateParam && endDateParam) {
                    datesToSync = getDatesBetween(startDateParam, endDateParam);
                } else {
                    const profileNow = moment().tz(profile.timezone || "Asia/Kolkata");
                    for (let i = 4; i >= 0; i--) {
                        datesToSync.push(moment(profileNow).subtract(i, "days").format("YYYY-MM-DD"));
                    }
                }
                let allCompleted = true;
                for (const date of datesToSync) {
                    const reportResponse = await generateSalesReportForDate(profile, date, token, recurring);
                    cron_logs({
                        message: `Sales Report: Profile: ${profile.name}, Date: ${date} - ${reportResponse}`
                        , log_type: "info"
                    });
                    if (reportResponse !== "COMPLETED") {
                        allCompleted = false;
                    }
                }
                if (recurring && getCronData?._id) {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        getCronData._id,
                        { status: "COMPLETED" }
                    );
                }
                if (allCompleted && cronjobid) {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true },
                    );
                }
            } catch (profileErr) {
                cron_logs({
                    message: `Error syncing sales report for profile ${profile?.name || profile?.profileId}: ${profileErr.stack || profileErr.message}`,
                    log_type: "error",
                });
            }
        }));

        await Promise.all(promises);

        cron_logs({ message: "Business Sales cron completed", log_type: "info" });

    } catch (e) {
        cron_logs({ message: `Business Sales cron error ${e}`, log_type: "error" });
    }
};

async function generateSalesReportForDate(profile, date, token, recurring = true) {
    let existing = null;

    if (recurring) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            startDate: date,
            endDate: date,
            adProduct: "BUSINESS_SALES",
            reportTypeId: "BUSINESS_SALES",
            status: "PENDING",
            createdAt: { $gte: twentyFourHoursAgo },
        }).sort({ createdAt: -1 }).lean();
    }
    else {
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            startDate: date,
            endDate: date,
            adProduct: "BUSINESS_SALES",
            reportTypeId: "BUSINESS_SALES"
        }).lean();
        if (existing && existing.status == "COMPLETED") return "COMPLETED";
        if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING"].includes(existing?.status)) {
            existing = null;
        }
    }

    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();

    // CREATE REPORT
    if (!existing) {
        const createResp = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
            headers: {
                "x-amz-access-token": token?.spAccessToken,
                "Content-Type": "application/json",
            },
            data: {
                reportType: "GET_SALES_AND_TRAFFIC_REPORT",
                marketplaceIds: [profile?.marketplaceStringId],
                dataStartTime: `${date}T00:00:00Z`,
                dataEndTime: `${date}T23:59:59Z`,
                reportOptions: {
                    dateGranularity: "DAY",
                    asinGranularity: "CHILD"
                }
            },
            meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
        }));

        await reportsSchema.create({
            profileId: profile.profileId,
            configId: profile.configId,
            reportId: createResp?.data?.reportId,
            startDate: date,
            endDate: date,
            adProduct: "BUSINESS_SALES",
            reportTypeId: "BUSINESS_SALES",
            status: "PENDING"
        });

        return "PENDING";
    }
    cron_logs({
        message: `Sales Report Generating Start`
        , log_type: "info"
    });
    const statusRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${existing?.reportId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
    }));

    cron_logs({
        message: `Sales Report: Status : ${statusRes.data?.processingStatus}`
        , log_type: "info"
    });

    if (statusRes?.data?.processingStatus !== "DONE") {
        cron_logs({
            message: `Sales Report is PENDING`
            , log_type: "info"
        });
        return "PENDING";
    }

    // GET DOCUMENT
    const docRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${statusRes?.data?.reportDocumentId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
    }));


    // Download file
    const zipPath = path.resolve(__dirname, "../../uploads/businessProductSales/sp-report", `${existing.reportId}.gz.json`);
    const extractionPath = zipPath.replace(".gz.json", ".json");

    cron_logs({
        message: `Sales Report: Zip Generate Successfully for profile: ${profile?.profileId}`
        , log_type: "info"
    });

    await downloadFile(docRes?.data?.url, zipPath);
    await unzipReport(zipPath, extractionPath);

    await processDailyOrderSalesStream(extractionPath, { profileId: profile?.profileId, configId: profile?.configId, date });
    await processReportFileStream(businessProductSalesSchema, extractionPath, { profileId: profile?.profileId, configId: profile?.configId, date });

    await reportsSchema.updateOne(
        { _id: existing._id },
        { $set: { status: "COMPLETED" } }
    );
    cron_logs({
        message: `Sales Report is COMPLETED`
        , log_type: "info"
    });
    return "COMPLETED";
}

const processDailyOrderSalesStream = async (filePath, { profileId, configId, date }) => {
    return new Promise((resolve) => {
        const pipeline = chain([
            fs.createReadStream(filePath),
            parser(),
            pick({ filter: "salesAndTrafficByDate" }),
            streamArray(),
        ]);

        pipeline.on("data", async ({ value }) => {
            pipeline.pause();
            try {
                const orderSalesAmount = value?.salesByDate?.orderedProductSales?.amount;
                const recordDate = value?.date || date;

                if (orderSalesAmount !== undefined && orderSalesAmount !== null) {
                    await dailyOrderSalesSchema.updateOne(
                        {
                            profileId: Number(profileId),
                            configId,
                            date: String(recordDate),
                        },
                        {
                            $set: {
                                orderSales: Number(orderSalesAmount),
                            },
                            $setOnInsert: {
                                profileId: Number(profileId),
                                configId,
                                date: String(recordDate),
                            },
                        },
                        { upsert: true }
                    );
                }
            } catch (err) {
                cron_logs({ message: `Error updating dailyOrderSales: ${err.message}`, log_type: "error" });
            } finally {
                pipeline.resume();
            }
        });

        pipeline.on("end", () => {
            pipeline.removeAllListeners();
            pipeline.destroy();
            resolve();
        });

        pipeline.on("error", (err) => {
            pipeline.removeAllListeners();
            pipeline.destroy();
            resolve();
        });
    });
};

const processReportFileStream = async (
    schema,
    filePath,
    {
        profileId,
        configId,
        date
    }
) => {
    BULK_SIZE = Number(process.env.BATCH);
    return new Promise((resolve, reject) => {

        const pipeline = chain([
            fs.createReadStream(filePath),
            parser(),
            pick({ filter: "salesAndTrafficByAsin" }),
            streamArray(),
        ]);

        let bulkOps = [];

        pipeline.on("data", async ({ value }) => {

            pipeline.pause();

            bulkOps.push({
                updateOne: {
                    filter: {
                        profileId,
                        configId,
                        asin: value?.childAsin,
                        reportDate: date
                    },
                    update: {
                        $set: {
                            sales: value?.salesByAsin?.orderedProductSales?.amount || 0,
                            orders: value?.salesByAsin?.unitsOrdered || 0,
                            salesB2B: value?.salesByAsin?.orderedProductSalesB2B?.amount || 0,
                            ordersB2B: value?.salesByAsin?.unitsOrderedB2B || 0
                        }
                    },
                    upsert: true
                },
            });

            if (bulkOps.length >= BULK_SIZE) {
                pipeline.pause();
                await parallelBulkWrite(schema, bulkOps.splice(0));
                pipeline.resume();
            } else {
                pipeline.resume();
            }
        });

        pipeline.on("end", async () => {
            await parallelBulkWrite(schema, bulkOps);
            pipeline.removeAllListeners();
            pipeline.destroy();
            bulkOps = null;
            resolve();
        });

        pipeline.on("error", err => {
            pipeline.removeAllListeners();
            pipeline.destroy();
            bulkOps = null;
            reject(err);
        });
    });
}

const buildInventoryBasePipeline = (req) => {
    const configId = req?.config?.configId;
    let {
        profileId,
        fulfillmentType,
        status,
        searchName,
        fieldName,
        fieldOperator,
        fieldValue,
        fromDate,
        toDate
    } = req.body;

    toDate = toDate || moment().format("YYYY-MM-DD");
    fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

    const totalDays = Math.max(moment(toDate).diff(moment(fromDate), "days"), 1);

    const filter = {
        configId,
        profileId: Number(profileId),
        ...(fulfillmentType && { fulfillmentType }),
    };

    let extraMatchStage = null;
    if (fieldName && fieldOperator && fieldValue !== undefined) {
        extraMatchStage = buildFieldFilter(fieldName, fieldOperator, fieldValue);
    }

    return [
        { $match: filter },
        ...(extraMatchStage ? [{ $match: extraMatchStage }] : []),
        {
            $lookup: {
                from: "product_ads",
                localField: "sku",
                foreignField: "sku",
                pipeline: [
                    { $match: { profileId: Number(profileId), reportDate: { $gte: fromDate, $lte: toDate } } },
                    { $group: { _id: null, totalSales: { $sum: "$orders" } } }
                ],
                as: "salesData"
            }
        },
        { $unwind: { path: "$salesData", preserveNullAndEmptyArrays: true } },
        { $addFields: { salesPerDay: { $cond: [{ $gt: ["$salesData.totalSales", 0] }, { $ceil: { $divide: ["$salesData.totalSales", totalDays] } }, 0] } } },
        { $addFields: { daysLeft: { $cond: [{ $gt: ["$salesPerDay", 0] }, { $round: [{ $divide: ["$totalStock", "$salesPerDay"] }, 0] }, 30] } } },
        {
            $addFields: {
                status: {
                    $switch: {
                        branches: [
                            { case: { $lte: ["$totalStock", 0] }, then: "OUT_OF_STOCK" },
                            { case: { $and: [{ $gt: ["$daysLeft", 0] }, { $lte: ["$daysLeft", 5] }] }, then: "LOW" },
                            { case: { $and: [{ $gt: ["$daysLeft", 5] }, { $lte: ["$daysLeft", 15] }] }, then: "MEDIUM" }
                        ],
                        default: "HEALTHY"
                    }
                }
            }
        },
        {
            $lookup: {
                from: "productlistings",
                let: { asin: "$asin", sku: "$sku" },
                pipeline: [
                    { $match: { $expr: { $or: [{ $eq: ["$asin", "$$asin"] }, { $eq: ["$sku", "$$sku"] }] } } },
                    { $sort: { reportDate: -1 } },
                    { $limit: 1 },
                    { $project: { title: "$itemName", imageUrl: "$imageURL" } }
                ],
                as: "productData"
            }
        },
        { $unwind: { path: "$productData", preserveNullAndEmptyArrays: true } },
        ...(searchName ? [{
            $match: {
                $or: [
                    { sku: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                    { asin: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                    { "productData.title": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } }
                ]
            }
        }] : []),
        // ── Filter by status (supports DEAD_INVENTORY via deadInventoryStatus field) ──
        ...(status === "DEAD_INVENTORY"
            ? [{ $match: { deadInventoryStatus: "DEAD" } }]
            : status ? [{ $match: { status } }] : []),
        // ── Aging bucket field (computed from daysLeft) ────────────────────────
        {
            $addFields: {
                agingBucket: {
                    $switch: {
                        branches: [
                            { case: { $lte: ["$daysLeft", 30] }, then: "30" },
                            { case: { $lte: ["$daysLeft", 60] }, then: "60" },
                            { case: { $lte: ["$daysLeft", 90] }, then: "90" },
                        ],
                        default: "180+"
                    }
                }
            }
        },
    ];
};

exports.getInventoryList = async (req, res) => {
    try {

        let {
            pageNo = 1,
            perPage = 10,
            fieldName,
            sortType,
        } = req.body;

        const basePipeline = buildInventoryBasePipeline(req);

        const pipeline = [
            ...basePipeline,
            {
                $project: {
                    _id: 0,
                    sku: 1,
                    asin: 1,
                    fulfillmentType: 1,
                    status: 1,
                    currentStock: 1,
                    inboundStock: 1,
                    reservedStock: 1,
                    totalStock: 1,
                    salesPerDay: { $round: ["$salesPerDay", 2] },
                    daysLeft: 1,
                    title: "$productData.title",
                    image: "$productData.imageUrl",
                    // Aging Tracker fields
                    agingBucket: 1,
                    deadInventoryStatus: 1,
                    suggestion: 1,
                }
            },
            ...(sortType
                ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }]
                : [{ $sort: { title: 1 } }]
            ),
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (pageNo - 1) * perPage }, { $limit: perPage }]
                }
            }
        ];

        const result = await inventorySchema.aggregate(pipeline);

        const totalRecords = result[0].metadata[0]?.total || 0;
        const inventoryList = result[0].data;

        return res.status(200).send({
            isSuccess: true,
            data: inventoryList,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
        });
    } catch (e) {
        write_logs({ message: `[getInventoryList Error] ${e?.message || e} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        res.send(e);
    }
};

exports.getInventoryCards = async (req, res) => {

    try {

        const originalFulfillmentType = req.body.fulfillmentType;
        req.body.fulfillmentType = undefined;
        const basePipeline = buildInventoryBasePipeline(req);
        req.body.fulfillmentType = originalFulfillmentType;

        const pipeline = [
            ...basePipeline,
            {
                $facet: {
                    globalStats: [
                        {
                            $group: {
                                _id: null,
                                totalSKUs: { $sum: 1 },
                                fbaStock: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "FBA"] }, "$currentStock", 0] } },
                                fbmStock: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "FBM"] }, "$currentStock", 0] } },
                                totalFBASkus: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "FBA"] }, 1, 0] } },
                                totalFBMSkus: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "FBM"] }, 1, 0] } },
                            }
                        }
                    ],
                    filteredStats: [
                        ...(originalFulfillmentType ? [{ $match: { fulfillmentType: originalFulfillmentType } }] : []),
                        {
                            $group: {
                                _id: null,
                                alertCount: {
                                    $sum: {
                                        $cond: [
                                            { $in: ["$status", ["OUT_OF_STOCK", "LOW", "MEDIUM"]] },
                                            1, 0
                                        ]
                                    }
                                },
                                outOfStockCount: { $sum: { $cond: [{ $eq: ["$status", "OUT_OF_STOCK"] }, 1, 0] } },
                                lowStockCount: { $sum: { $cond: [{ $eq: ["$status", "LOW"] }, 1, 0] } },
                                mediumStockCount: { $sum: { $cond: [{ $eq: ["$status", "MEDIUM"] }, 1, 0] } },
                                healthyCount: { $sum: { $cond: [{ $eq: ["$status", "HEALTHY"] }, 1, 0] } },
                                deadInventoryCount: { $sum: { $cond: [{ $eq: ["$deadInventoryStatus", "DEAD"] }, 1, 0] } },
                            }
                        }
                    ]
                }
            }
        ];

        const result = await inventorySchema.aggregate(pipeline);
        const globalData = result[0]?.globalStats[0] || {};
        const filteredData = result[0]?.filteredStats[0] || {};

        return res.status(200).send({
            isSuccess: true,
            summaryData: {
                totalSKUs: globalData.totalSKUs ?? 0,
                fbaStock: globalData.fbaStock ?? 0,
                fbmStock: globalData.fbmStock ?? 0,
                totalFBASkus: globalData.totalFBASkus ?? 0,
                totalFBMSkus: globalData.totalFBMSkus ?? 0,
                alertCount: filteredData.alertCount ?? 0,
                outOfStockCount: filteredData.outOfStockCount ?? 0,
                lowStockCount: filteredData.lowStockCount ?? 0,
                mediumStockCount: filteredData.mediumStockCount ?? 0,
                healthyCount: filteredData.healthyCount ?? 0,
                deadInventoryCount: filteredData.deadInventoryCount ?? 0,
            },
        });


    } catch (e) {
        write_logs({ message: `[getInventoryCards Error] ${e?.message || e} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        res.send(e);
    }
};

exports.getInventoryGraph = async (req, res) => {

    try {

        const basePipeline = buildInventoryBasePipeline(req);

        const pipeline = [
            ...basePipeline,
            {
                $group: {
                    _id: "$fulfillmentType",
                    currentStock: { $sum: "$currentStock" },
                    inboundStock: { $sum: "$inboundStock" },
                    reservedStock: { $sum: "$reservedStock" },
                    totalStock: { $sum: "$totalStock" },
                    avgDaysLeft: { $avg: "$daysLeft" },
                    skuCount: { $sum: 1 },
                }
            },
            {
                $project: {
                    _id: 0,
                    fulfillmentType: "$_id",
                    currentStock: 1,
                    inboundStock: 1,
                    reservedStock: 1,
                    totalStock: 1,
                    avgDaysLeft: { $round: ["$avgDaysLeft", 1] },
                    skuCount: 1,
                }
            },
            { $sort: { fulfillmentType: 1 } }
        ];

        const result = await inventorySchema.aggregate(pipeline);
        const chartData = result || [];

        return res.status(200).send({
            isSuccess: true,
            chartData,
        });

    } catch (e) {
        write_logs({ message: `[getInventoryGraph Error] ${e?.message || e} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        res.send(e);
    }
};

exports.listInventory = async (req, res) => {
    const configId = req?.config?.configId;

    try {
        let {
            profileId,
            pageNo = 1,
            perPage = 10,
            fulfillmentType,
            status,
            searchName,
            fieldName,
            fieldOperator,
            fieldValue,
            sortType,
            fromDate,
            toDate
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const totalDays = Math.max(moment(toDate).diff(moment(fromDate), "days"), 1);

        const filter = {
            configId,
            profileId: Number(profileId),
            ...(fulfillmentType && { fulfillmentType }),
        };

        let extraMatchStage = null;
        if (fieldName && fieldOperator && fieldValue !== undefined) {
            extraMatchStage = buildFieldFilter(fieldName, fieldOperator, fieldValue);
        }

        // ── Shared base pipeline (reused across all 3 aggregations) ───────────
        const basePipeline = [
            { $match: filter },
            ...(extraMatchStage ? [{ $match: extraMatchStage }] : []),
            {
                $lookup: {
                    from: "product_ads",
                    localField: "sku",
                    foreignField: "sku",
                    pipeline: [
                        { $match: { profileId: Number(profileId), reportDate: { $gte: fromDate, $lte: toDate } } },
                        { $group: { _id: null, totalSales: { $sum: "$orders" } } }
                    ],
                    as: "salesData"
                }
            },
            { $unwind: { path: "$salesData", preserveNullAndEmptyArrays: true } },
            { $addFields: { salesPerDay: { $cond: [{ $gt: ["$salesData.totalSales", 0] }, { $ceil: { $divide: ["$salesData.totalSales", totalDays] } }, 0] } } },
            { $addFields: { daysLeft: { $cond: [{ $gt: ["$salesPerDay", 0] }, { $round: [{ $divide: ["$totalStock", "$salesPerDay"] }, 0] }, 30] } } },
            {
                $addFields: {
                    status: {
                        $switch: {
                            branches: [
                                { case: { $lte: ["$totalStock", 0] }, then: "OUT_OF_STOCK" },
                                { case: { $and: [{ $gt: ["$daysLeft", 0] }, { $lte: ["$daysLeft", 5] }] }, then: "LOW" },
                                { case: { $and: [{ $gt: ["$daysLeft", 5] }, { $lte: ["$daysLeft", 15] }] }, then: "MEDIUM" }
                            ],
                            default: "HEALTHY"
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "productlistings",
                    let: { asin: "$asin", sku: "$sku" },
                    pipeline: [
                        { $match: { $expr: { $or: [{ $eq: ["$asin", "$$asin"] }, { $eq: ["$sku", "$$sku"] }] } } },
                        { $sort: { reportDate: -1 } },
                        { $limit: 1 },
                        { $project: { title: "$itemName", imageUrl: "$imageURL" } }
                    ],
                    as: "productData"
                }
            },
            { $unwind: { path: "$productData", preserveNullAndEmptyArrays: true } },
            ...(searchName ? [{
                $match: {
                    $or: [
                        { sku: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                        { asin: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                        { "productData.title": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } }
                    ]
                }
            }] : []),
            ...(status ? [{ $match: { status } }] : []),
        ];

        // ── 1. Main paginated list ────────────────────────────────────────────
        const listPipeline = [
            ...basePipeline,
            {
                $project: {
                    _id: 0,
                    sku: 1,
                    asin: 1,
                    fulfillmentType: 1,
                    status: 1,
                    currentStock: 1,
                    inboundStock: 1,
                    reservedStock: 1,
                    totalStock: 1,
                    salesPerDay: { $round: ["$salesPerDay", 2] },
                    daysLeft: 1,
                    title: "$productData.title",
                    image: "$productData.imageUrl",
                }
            },
            ...(sortType
                ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }]
                : [{ $sort: { title: 1 } }]
            ),
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (pageNo - 1) * perPage }, { $limit: perPage }]
                }
            }
        ];

        // ── 2. Summary cards ─────────────────────────────────────────────────
        const summaryPipeline = [
            ...basePipeline,
            {
                $group: {
                    _id: null,
                    totalSKUs: { $sum: 1 },
                    fbaStock: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "FBA"] }, "$currentStock", 0] } },
                    fbmStock: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "FBM"] }, "$currentStock", 0] } },
                    totalFBASkus: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "FBA"] }, 1, 0] } },
                    totalFBMSkus: { $sum: { $cond: [{ $eq: ["$fulfillmentType", "FBM"] }, 1, 0] } },
                    alertCount: {
                        $sum: {
                            $cond: [
                                { $in: ["$status", ["OUT_OF_STOCK", "LOW", "MEDIUM"]] },
                                1, 0
                            ]
                        }
                    },
                    outOfStockCount: { $sum: { $cond: [{ $eq: ["$status", "OUT_OF_STOCK"] }, 1, 0] } },
                    lowStockCount: { $sum: { $cond: [{ $eq: ["$status", "LOW"] }, 1, 0] } },
                    mediumStockCount: { $sum: { $cond: [{ $eq: ["$status", "MEDIUM"] }, 1, 0] } },
                    healthyCount: { $sum: { $cond: [{ $eq: ["$status", "HEALTHY"] }, 1, 0] } },
                }
            },
            { $project: { _id: 0 } }
        ];

        // ── 3. Chart data ─────────────────────────────────────────────────────
        const chartPipeline = [
            ...basePipeline,
            {
                $group: {
                    _id: "$fulfillmentType",
                    currentStock: { $sum: "$currentStock" },
                    inboundStock: { $sum: "$inboundStock" },
                    reservedStock: { $sum: "$reservedStock" },
                    totalStock: { $sum: "$totalStock" },
                    avgDaysLeft: { $avg: "$daysLeft" },
                    skuCount: { $sum: 1 },
                }
            },
            {
                $project: {
                    _id: 0,
                    fulfillmentType: "$_id",
                    currentStock: 1,
                    inboundStock: 1,
                    reservedStock: 1,
                    totalStock: 1,
                    avgDaysLeft: { $round: ["$avgDaysLeft", 1] },
                    skuCount: 1,
                }
            },
            { $sort: { fulfillmentType: 1 } }
        ];

        // ── Run all 3 in parallel ─────────────────────────────────────────────
        const [listResult, summaryResult, chartResult] = await Promise.all([
            inventorySchema.aggregate(listPipeline),
            inventorySchema.aggregate(summaryPipeline),
            inventorySchema.aggregate(chartPipeline),
        ]);

        const totalRecords = listResult[0].metadata[0]?.total || 0;
        const inventoryList = listResult[0].data;
        const summaryData = summaryResult[0] || {};
        const chartData = chartResult || [];

        return res.status(200).send({
            isSuccess: true,
            data: inventoryList,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
            summaryData: {
                totalSKUs: summaryData.totalSKUs ?? 0,
                fbaStock: summaryData.fbaStock ?? 0,
                fbmStock: summaryData.fbmStock ?? 0,
                totalFBASkus: summaryData.totalFBASkus ?? 0,
                totalFBMSkus: summaryData.totalFBMSkus ?? 0,
                alertCount: summaryData.alertCount ?? 0,
                outOfStockCount: summaryData.outOfStockCount ?? 0,
                lowStockCount: summaryData.lowStockCount ?? 0,
                mediumStockCount: summaryData.mediumStockCount ?? 0,
                healthyCount: summaryData.healthyCount ?? 0,
            },
            chartData,
        });

    } catch (error) {
        write_logs({ message: `[listInventory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong!",
            isSuccess: false,
        });
    }
};

exports.getSalesDashboard = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        let {
            profileId,
            fromDate,
            toDate,
            marketplaceId,
            productTypes,
            productName
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const fM = moment(fromDate);
        const tM = moment(toDate);

        let prevFrom, prevTo;

        const isFullMonth = fM.date() === 1 &&
            tM.date() === fM.clone().endOf('month').date() &&
            fM.month() === tM.month() &&
            fM.year() === tM.year();

        if (isFullMonth) {
            prevFrom = fM.clone().subtract(1, 'month').startOf('month').format("YYYY-MM-DD");
            prevTo = fM.clone().subtract(1, 'month').endOf('month').format("YYYY-MM-DD");
        } else {
            const lengthDays = tM.diff(fM, "days") + 1;
            prevTo = fM.clone().subtract(1, "days").format("YYYY-MM-DD");
            prevFrom = fM.clone().subtract(lengthDays, "days").format("YYYY-MM-DD");
        }

        const diffDays = Math.max(tM.diff(fM, "days"), 1);

        // ⭐ PRODUCT FILTER
        const hasProductFilter = !!(productTypes || productName || marketplaceId);
        let asinList = [];

        if (hasProductFilter) {
            const listingFilter = {
                configId,
                profileId: Number(profileId),
                ...(marketplaceId && { marketplaceId }),
                ...(productTypes && { productType: { $in: [productTypes] } }),
                ...(productName && {
                    $or: [
                        { sku: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                        { asin: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                        { itemName: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } }
                    ]
                }),
            };
            const products = await productListingSchema.find(listingFilter).select("asin").limit(2000).lean();
            asinList = products.map(p => p.asin);
        }

        const adType = req.adType || "SP";
        const mainCampaignModel = AD_TYPE_COLLECTIONS?.[`${adType}Model`]?.campaignSchema || campaignSchema;

        const campaignsMatch = (f, t) => ({
            configId,
            profileId: Number(profileId),
            reportDate: { $gte: f, $lte: t },
        });

        const bizMatch = (f, t) => ({
            configId,
            profileId: Number(profileId),
            reportDate: { $gte: f, $lte: t },
            ...(hasProductFilter && { asin: { $in: asinList } }),
        });

        const [
            curAds,
            curDailySales,
            curBizSales,
            prevAds,
            prevDailySales,
            prevBizSales,
            cvrData,
            inventoryData,
            salesUnitsTimeline
        ] = await Promise.all([

            mainCampaignModel.aggregate([
                { $match: campaignsMatch(fromDate, toDate) },
                {
                    $group: {
                        _id: null,
                        adSales: { $sum: "$sales" },
                        adOrders: { $sum: "$orders" },
                        spend: { $sum: "$spend" },
                        clicks: { $sum: "$clicks" },
                        impressions: { $sum: "$impressions" }
                    }
                }
            ]),

            dailyOrderSalesSchema.aggregate([
                {
                    $match: {
                        profileId: Number(profileId),
                        ...(configId && { configId: mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId }),
                        date: { $gte: fromDate, $lte: toDate }
                    }
                },
                {
                    $group: {
                        _id: "$date",
                        sales: { $first: "$orderSales" }
                    }
                }
            ]),

            businessProductSalesSchema.aggregate([
                { $match: bizMatch(fromDate, toDate) },
                {
                    $group: {
                        _id: "$reportDate",
                        sales: { $sum: "$sales" },
                        orders: { $sum: "$orders" }
                    }
                }
            ]),

            mainCampaignModel.aggregate([
                { $match: campaignsMatch(prevFrom, prevTo) },
                {
                    $group: {
                        _id: null,
                        adSales: { $sum: "$sales" },
                        spend: { $sum: "$spend" },
                        adOrders: { $sum: "$orders" },
                        clicks: { $sum: "$clicks" },
                        impressions: { $sum: "$impressions" }
                    }
                }
            ]),

            dailyOrderSalesSchema.aggregate([
                {
                    $match: {
                        profileId: Number(profileId),
                        ...(configId && { configId: mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId }),
                        date: { $gte: prevFrom, $lte: prevTo }
                    }
                },
                {
                    $group: {
                        _id: "$date",
                        sales: { $first: "$orderSales" }
                    }
                }
            ]),

            businessProductSalesSchema.aggregate([
                { $match: bizMatch(prevFrom, prevTo) },
                {
                    $group: {
                        _id: "$reportDate",
                        sales: { $sum: "$sales" },
                        orders: { $sum: "$orders" }
                    }
                }
            ]),

            mainCampaignModel.aggregate([
                { $match: campaignsMatch(fromDate, toDate) },
                {
                    $group: {
                        _id: "$reportDate",
                        clicks: { $sum: "$clicks" },
                        orders: { $sum: "$orders" }
                    }
                },
                { $sort: { _id: 1 } }
            ]),

            inventorySchema.find({
                configId,
                profileId: Number(profileId),
                asin: { $in: asinList },
            }).lean(),

            businessProductSalesSchema.aggregate([
                { $match: bizMatch(fromDate, toDate) },
                { $group: { _id: "$reportDate", orders: { $sum: "$orders" } } },
                { $sort: { _id: 1 } }
            ])

        ]);

        const ads = curAds[0] || {};
        const pAds = prevAds[0] || {};

        // 1. Calculate Current totalSales & totalOrders date by date
        const curDailyMap = {};
        curDailySales.forEach(d => {
            if (d._id && typeof d.sales === "number") {
                curDailyMap[d._id] = d.sales;
            }
        });

        let totalSales = 0;
        let totalOrders = 0;
        const curDates = new Set([...Object.keys(curDailyMap), ...curBizSales.map(b => b._id)]);

        curDates.forEach(dateStr => {
            const bizData = curBizSales.find(b => b._id === dateStr);
            if (curDailyMap[dateStr] !== undefined) {
                totalSales += curDailyMap[dateStr];
            } else if (bizData?.sales) {
                totalSales += bizData.sales;
            }
            if (bizData?.orders) {
                totalOrders += bizData.orders;
            }
        });

        // 2. Calculate Previous comparison totalSales date by date
        const prevDailyMap = {};
        prevDailySales.forEach(d => {
            if (d._id && typeof d.sales === "number") {
                prevDailyMap[d._id] = d.sales;
            }
        });

        let pTotalSales = 0;
        const prevDates = new Set([...Object.keys(prevDailyMap), ...prevBizSales.map(b => b._id)]);

        prevDates.forEach(dateStr => {
            const bizData = prevBizSales.find(b => b._id === dateStr);
            if (prevDailyMap[dateStr] !== undefined) {
                pTotalSales += prevDailyMap[dateStr];
            } else if (bizData?.sales) {
                pTotalSales += bizData.sales;
            }
        });

        const adSales = ads.adSales || 0;
        const spend = ads.spend || 0;
        const clicks = ads.clicks || 0;
        const impressions = ads.impressions || 0;
        const adOrders = ads.adOrders || 0;

        const pAdSales = pAds.adSales || 0;
        const pSpend = pAds.spend || 0;
        const pClicks = pAds.clicks || 0;
        const pAdOrders = pAds.adOrders || 0;

        const organicSales = totalSales - adSales;

        const tacos = totalSales ? (spend / totalSales) * 100 : 0;
        const acos = adSales ? (spend / adSales) * 100 : 0;
        const roas = spend ? adSales / spend : 0;
        const conversionRate = clicks ? (adOrders / clicks) * 100 : 0;
        const ctr = impressions ? (clicks / impressions) * 100 : 0;

        const pTacos = pTotalSales ? (pSpend / pTotalSales) * 100 : 0;
        const pAcos = pAdSales ? (pSpend / pAdSales) * 100 : 0;
        const pRoas = pSpend ? pAdSales / pSpend : 0;
        const pConversionRate = pClicks ? (pAdOrders / pClicks) * 100 : 0;

        const calcChange = (cur, prev) =>
            prev ? Number((((cur - prev) / prev) * 100).toFixed(2)) : 0;

        // ⭐ CVR BUCKET LOGIC
        const bucketSize = Math.ceil(diffDays / 5);
        let timeline = [];

        let bClicks = 0;
        let bOrders = 0;
        let count = 0;
        let startLabel = null;

        cvrData.forEach((d, i) => {

            if (!startLabel) startLabel = d._id;

            bClicks += d.clicks;
            bOrders += d.orders;
            count++;

            if (count === bucketSize || i === cvrData.length - 1) {

                timeline.push({
                    label: `${startLabel} to ${d._id}`,
                    cvr: bClicks ? Number(((bOrders / bClicks) * 100).toFixed(2)) : 0
                });

                bClicks = 0;
                bOrders = 0;
                count = 0;
                startLabel = null;
            }
        });

        let totalScore = 0;

        inventoryData.forEach(inv => {
            const totalStock = (inv.currentStock || 0) + (inv.inboundStock || 0) - (inv.reservedStock || 0);

            const unitsSold = salesUnitsTimeline.filter(s => s.asin === inv.asin).reduce((a, b) => a + b?.orders, 0);

            const salesPerDay = unitsSold / diffDays;
            const daysLeft = salesPerDay > 0 ? totalStock / salesPerDay : 30;

            let score = 0;

            if (daysLeft <= 0) score = 0;
            else if (daysLeft <= 7) score = 25;
            else if (daysLeft <= 20) score = 60;
            else if (daysLeft <= 60) score = 90;
            else score = 70;

            totalScore += score;
        });

        const healthScore = inventoryData.length ? Number((totalScore / inventoryData.length).toFixed(2)) : 0;

        return res.status(200).send({
            isSuccess: true,
            data: {
                prevFromDate: prevFrom,
                prevToDate: prevTo,

                totalSales: Number(totalSales.toFixed(2)),
                totalSalesChange: calcChange(totalSales, pTotalSales),
                totalSalesChangeAbs: Number((totalSales - pTotalSales).toFixed(2)),

                adSales: Number(adSales.toFixed(2)),
                adSalesChange: calcChange(adSales, pAdSales),
                adSalesChangeAbs: Number((adSales - pAdSales).toFixed(2)),

                organicSales: Number(organicSales.toFixed(2)),

                spend: Number(spend.toFixed(2)),
                spendChange: calcChange(spend, pSpend),
                spendChangeAbs: Number((spend - pSpend).toFixed(2)),

                tacos: Number(tacos.toFixed(2)),
                tacosChange: calcChange(tacos, pTacos),
                tacosChangeAbs: Number((tacos - pTacos).toFixed(2)),

                acos: Number(acos.toFixed(2)),
                acosChange: calcChange(acos, pAcos),
                acosChangeAbs: Number((acos - pAcos).toFixed(2)),

                roas: Number(roas.toFixed(2)),
                roasChange: calcChange(roas, pRoas),
                roasChangeAbs: Number((roas - pRoas).toFixed(2)),

                conversionRate: Number(conversionRate.toFixed(2)),
                conversionRateChange: calcChange(conversionRate, pConversionRate),
                conversionRateChangeAbs: Number((conversionRate - pConversionRate).toFixed(2)),

                ctr: Number(ctr.toFixed(2)),

                totalOrders,
                adOrders,

                cvrTimeline: timeline,

                healthScore,
            }
        });

    } catch (err) {
        write_logs({ message: `[getSalesDashboard Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        return res.status(203).send({
            isSuccess: false,
            message: err.message
        });

    }
};

exports.getSalesTrendGraph = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        let {
            profileId,
            fromDate,
            toDate,
            marketplaceId,
            productTypes,
            productName
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const listingFilter = {
            configId,
            profileId: Number(profileId),
            ...(marketplaceId && { marketplaceId }),
            ...(productTypes && { productType: { $in: [productTypes] } }),
            ...(productName && {
                $or: [
                    { sku: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                    { asin: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                    { itemName: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } }
                ]
            }),
        };

        const products = await productListingSchema.find(listingFilter).select("asin").limit(2000).lean();
        const asinList = products.map(p => p.asin);

        const matchAds = {
            configId,
            profileId: Number(profileId),
            reportDate: { $gte: fromDate, $lte: toDate },
            asins: { $in: asinList },
        };

        const matchBusiness = {
            configId,
            profileId: Number(profileId),
            reportDate: { $gte: fromDate, $lte: toDate },
            asin: { $in: asinList },
        };

        const adType = req.adType || "SP";
        const mainProductAdsModel = AD_TYPE_COLLECTIONS?.[`${adType}Model`]?.productAdsSchema || productAdsSchema;

        const [adsAgg, salesAgg, dailyAgg] = await Promise.all([
            mainProductAdsModel.aggregate([
                { $match: matchAds },
                {
                    $group: {
                        _id: "$reportDate",
                        spend: { $sum: "$spend" },
                        adSales: { $sum: "$sales" },
                        impressions: { $sum: "$impressions" },
                        clicks: { $sum: "$clicks" },
                        adOrders: { $sum: "$orders" },
                    }
                }
            ]),
            businessProductSalesSchema.aggregate([
                { $match: matchBusiness },
                {
                    $group: {
                        _id: "$reportDate",
                        totalSales: { $sum: "$sales" },
                        totalOrders: { $sum: "$orders" }
                    }
                }
            ]),
            dailyOrderSalesSchema.aggregate([
                {
                    $match: {
                        profileId: Number(profileId),
                        ...(configId && { configId: mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId }),
                        date: { $gte: fromDate, $lte: toDate }
                    }
                },
                {
                    $group: {
                        _id: "$date",
                        sales: { $first: "$orderSales" }
                    }
                }
            ])
        ]);

        const adsMap = {};
        adsAgg.forEach(d => { adsMap[d._id] = d });

        const salesMap = {};
        salesAgg.forEach(d => { salesMap[d._id] = d });

        const dailyMap = {};
        dailyAgg.forEach(d => {
            if (d._id && typeof d.sales === "number") {
                dailyMap[d._id] = d.sales;
            }
        });

        let result = [];
        let current = moment(fromDate);

        while (current.isSameOrBefore(toDate)) {

            const date = current.format("YYYY-MM-DD");

            const adsData = adsMap[date] || {};
            const salesData = salesMap[date] || {};

            const spend = adsData.spend || 0;
            const adSales = adsData.adSales || 0;
            const impressions = adsData.impressions || 0;
            const clicks = adsData.clicks || 0;
            const adOrders = adsData.adOrders || 0;

            const totalSales = dailyMap[date] !== undefined ? dailyMap[date] : (salesData.totalSales || 0);
            const totalOrders = salesData.totalOrders || 0;

            const profit = totalSales - spend;
            const organicSales = totalSales - adSales;
            const organicOrders = totalOrders - adOrders;

            const tacos = totalSales ? (spend / totalSales) * 100 : 0;
            const acos = adSales ? (spend / adSales) * 100 : 0;
            const roas = spend ? (adSales / spend) : 0;

            const ctr = impressions ? (clicks / impressions) * 100 : 0;
            const cpc = clicks ? (spend / clicks) : 0;

            result.push({
                date,

                // SALES
                spend: Number(spend.toFixed(2)),
                adSales: Number(adSales.toFixed(2)),
                totalSales: Number(totalSales.toFixed(2)),
                organicSales: Number(organicSales.toFixed(2)),
                profit: Number(profit.toFixed(2)),

                // PERFORMANCE
                tacos: Number(tacos.toFixed(2)),
                acos: Number(acos.toFixed(2)),
                roas: Number(roas.toFixed(2)),

                // TRAFFIC
                impressions,
                clicks,
                ctr: Number(ctr.toFixed(2)),
                cpc: Number(cpc.toFixed(2)),

                // ORDERS
                orders: totalOrders,
                adOrders,
                organicOrders
            });

            current.add(1, "day");
        }

        return res.status(200).send({
            isSuccess: true,
            data: result
        });

    } catch (error) {
        write_logs({ message: `[getSalesTrendGraph Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });

    }
};

exports.getTopProductsGrid = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        let {
            profileId,
            fromDate,
            toDate,
            marketplaceId,
            productTypes,
            productName,
            page = 1,
            limit = 10,
            fieldName = "totalSales",
            fieldOperator,
            conditions,
            extraFieldOperator,
            extraFieldValue,
            fieldValue,
            customFilter,
            sortType = "desc"
        } = req.body;
        customFilter = sanitizeQueryObject(safeJSON(customFilter));

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const currentDate = moment().format("YYYY-MM-DD");
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const diffDays = Math.max(moment(toDate).diff(moment(fromDate), "days"), 1);

        const sortOrder = sortType === "asc" ? 1 : -1;

        let gridMatchStage = null;
        if (fieldName && fieldOperator && fieldValue !== undefined) {
            const firstCondition = { [fieldName]: { [fieldOperator]: Number(fieldValue) } };
            if (extraFieldOperator && extraFieldValue !== undefined) {
                const secondCondition = { [fieldName]: { [extraFieldOperator]: Number(extraFieldValue) } };
                if (conditions === "OR") {
                    gridMatchStage = { $match: { $or: [firstCondition, secondCondition] } };
                } else {
                    gridMatchStage = { $match: { $and: [firstCondition, secondCondition] } };
                }
            } else {
                gridMatchStage = { $match: firstCondition };
            }
        }

        const matchListing = {
            configId,
            profileId: Number(profileId),
            ...(marketplaceId && { marketplaceId }),
            ...(productTypes && { productType: { $in: [productTypes] } }),
            ...(productName && {
                $or: [
                    { sku: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                    { asin: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                    { itemName: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } }
                ]
            }),
        };

        const hasActiveCampaigns = await campaignSchema.exists({
            configId,
            profileId: Number(profileId),
            status: "ENABLED",
            reportDate: { $gte: moment().subtract(2, "days").format("YYYY-MM-DD") }
        });

        const adType = req.adType || "SP";
        const mainCampaignModel = AD_TYPE_COLLECTIONS?.[`${adType}Model`]?.campaignSchema || campaignSchema;

        const activeCampaigns = hasActiveCampaigns
            ? await mainCampaignModel.distinct("campaignId", { configId, profileId: Number(profileId), status: "ENABLED", reportDate: { $eq: currentDate } })
            : await mainCampaignModel.distinct("campaignId", { configId, profileId: Number(profileId), reportDate: { $gte: fromDate, $lte: toDate } });

        const pipeline = [

            { $match: matchListing },

            {
                $lookup: {
                    from: "businessproductsales",
                    let: { asin: "$asin" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$asin", "$$asin"] },
                                configId,
                                profileId: Number(profileId),
                                reportDate: { $gte: fromDate, $lte: toDate }
                            }
                        },
                        {
                            $group: {
                                _id: "$asin",
                                totalSales: { $sum: "$sales" },
                                totalOrders: { $sum: "$orders" },
                                unitsSold: { $sum: "$orders" }
                            }
                        }
                    ],
                    as: "sales"
                }
            },

            { $unwind: { path: "$sales", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: AD_TYPE_COLLECTIONS?.[adType]?.productAds || "product_ads",
                    let: { asin: "$asin" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$$asin", "$asins"] },
                                configId,
                                profileId: Number(profileId),
                                campaignId: { $in: activeCampaigns },
                                reportDate: { $gte: fromDate, $lte: toDate }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                adSales: { $sum: "$sales" },
                                adOrders: { $sum: "$orders" },
                                clicks: { $sum: "$clicks" },
                                spend: { $sum: "$spend" }
                            }
                        }
                    ],
                    as: "ads"
                }
            },

            { $unwind: "$ads" },

            {
                $lookup: {
                    from: "inventories",
                    let: { asin: "$asin" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$asin", "$$asin"] } } },
                        {
                            $group: {
                                _id: "$asin",
                                currentStock: { $sum: "$currentStock" },
                                inboundStock: { $sum: "$inboundStock" },
                                reservedStock: { $sum: "$reservedStock" }
                            }
                        }
                    ],
                    as: "inv"
                }
            },

            { $unwind: { path: "$inv", preserveNullAndEmptyArrays: true } },

            {
                $addFields: {

                    totalSales: { $ifNull: ["$sales.totalSales", 0] },
                    totalOrders: { $ifNull: ["$sales.totalOrders", 0] },
                    adSales: { $ifNull: ["$ads.adSales", 0] },
                    adOrders: { $ifNull: ["$ads.adOrders", 0] },
                    organicSales: { $subtract: [{ $ifNull: ["$sales.totalSales", 0] }, { $ifNull: ["$ads.adSales", 0] }] },
                    organicOrders: { $subtract: [{ $ifNull: ["$sales.totalOrders", 0] }, { $ifNull: ["$ads.adOrders", 0] }] },
                    spend: { $ifNull: ["$ads.spend", 0] },
                    clicks: { $ifNull: ["$ads.clicks", 0] },
                    acos: { $cond: [{ $gt: ["$ads.adSales", 0] }, { $multiply: [{ $divide: ["$ads.spend", "$ads.adSales"] }, 100] }, 0] },
                    roas: { $cond: [{ $gt: ["$ads.spend", 0] }, { $divide: ["$ads.adSales", "$ads.spend"] }, 0] },
                    cvr: { $cond: [{ $gt: ["$ads.clicks", 0] }, { $multiply: [{ $divide: ["$ads.adOrders", "$ads.clicks"] }, 100] }, 0] },
                    demand: { $add: [{ $ifNull: ["$ads.clicks", 0] }, { $ifNull: ["$sales.totalOrders", 0] }] },
                    profit: {
                        $subtract: [
                            { $ifNull: ["$sales.totalSales", 0] },
                            { $add: [{ $ifNull: ["$ads.spend", 0] }, { $multiply: [{ $ifNull: ["$sales.totalSales", 0] }, 0.30] }] }
                        ]
                    },
                    stockDays: {
                        $let: {
                            vars: {
                                totalStock: {
                                    $subtract: [
                                        { $add: [{ $ifNull: ["$inv.currentStock", 0] }, { $ifNull: ["$inv.inboundStock", 0] }] },
                                        { $ifNull: ["$inv.reservedStock", 0] }
                                    ]
                                },
                                spd: { $divide: [{ $ifNull: ["$sales.unitsSold", 0] }, diffDays] }
                            },
                            in: { $cond: [{ $gt: ["$$spd", 0] }, { $divide: ["$$totalStock", "$$spd"] }, 30] }
                        }
                    }
                }
            },

            {
                $addFields: {
                    highDemand: { $gte: ["$demand", 20] },
                    highProfit: { $gt: ["$profit", 0] }
                }
            },

            {
                $addFields: {
                    action: {
                        $switch: {
                            branches: [
                                {
                                    case: { $and: [{ $gt: ["$roas", 4] }, { $gt: ["$cvr", 10] }] },
                                    then: "SCALE"
                                },
                                {
                                    case: { $gt: ["$acos", 50] },
                                    then: "STOP"
                                },
                                {
                                    case: { $and: [{ $lt: ["$cvr", 5] }, { $gt: ["$clicks", 25] }] },
                                    then: "IMPROVE"
                                },
                                {
                                    case: { $and: ["$highDemand", "$highProfit"] },
                                    then: "SCALE"
                                },
                                {
                                    case: { $and: [{ $not: ["$highDemand"] }, "$highProfit"] },
                                    then: "IMPROVE"
                                },
                                {
                                    case: { $and: ["$highDemand", { $not: ["$highProfit"] }] },
                                    then: "OPTIMIZE"
                                },
                                {
                                    case: { $and: [{ $not: ["$highDemand"] }, { $not: ["$highProfit"] }] },
                                    then: "STOP"
                                }
                            ],
                            default: "OPTIMIZE"
                        }
                    }
                }
            },

            {
                $project: {
                    asin: 1,
                    sku: 1,

                    productImage: "$imageURL",
                    title: "$itemName",

                    totalSales: { $round: ["$totalSales", 2] },
                    adSales: { $round: ["$adSales", 2] },
                    organicSales: { $round: ["$organicSales", 2] },

                    totalOrders: 1,
                    adOrders: 1,
                    organicOrders: 1,

                    acos: { $round: ["$acos", 2] },
                    cvr: { $round: ["$cvr", 2] },
                    stockDays: { $round: ["$stockDays", 0] },

                    action: 1
                }
            },

            ...(gridMatchStage ? [gridMatchStage] : []),
            ...(customFilter && Object.keys(customFilter).length > 0 ? [{ $match: customFilter }] : []),
            { $sort: { [fieldName || "totalSales"]: sortOrder || "desc" } },

            {
                $facet: {
                    data: [
                        { $skip: (page - 1) * parseInt(limit) },
                        { $limit: parseInt(limit) }
                    ],
                    total: [
                        { $count: "count" }
                    ]
                }
            }
        ];

        const result = await productListingSchema.aggregate(pipeline);

        return res.status(200).send({
            isSuccess: true,
            total: result[0].total[0]?.count || 0,
            data: result[0].data
        });

    } catch (err) {
        write_logs({ message: `[getTopProductsGrid Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        return res.status(203).send({
            isSuccess: false,
            message: err.message
        });

    }
};

exports.getProductDecisionMatrix = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        let {
            profileId,
            fromDate,
            toDate,
            marketplaceId,
            productTypes,
            productName
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const currentDate = moment().format("YYYY-MM-DD");
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const matchListing = {
            configId,
            profileId: Number(profileId),
            ...(marketplaceId && { marketplaceId }),
            ...(productTypes && { productType: { $in: [productTypes] } }),
            ...(productName && {
                $or: [
                    { sku: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                    { asin: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                    { itemName: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } }
                ]
            }),
        };

        const hasActiveCampaigns = await campaignSchema.exists({
            configId,
            profileId: Number(profileId),
            status: "ENABLED",
            reportDate: { $gte: moment().subtract(2, "days").format("YYYY-MM-DD") }
        });

        const adType = req.adType || "SP";
        const mainCampaignModel = AD_TYPE_COLLECTIONS?.[`${adType}Model`]?.campaignSchema || campaignSchema;

        const activeCampaigns = hasActiveCampaigns
            ? await mainCampaignModel.distinct("campaignId", { configId, profileId: Number(profileId), status: "ENABLED", reportDate: { $eq: currentDate } })
            : await mainCampaignModel.distinct("campaignId", { configId, profileId: Number(profileId), reportDate: { $gte: fromDate, $lte: toDate } });

        const pipeline = [

            { $match: matchListing },

            {
                $lookup: {
                    from: "businessproductsales",
                    let: { asin: "$asin" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$asin", "$$asin"] },
                                configId,
                                profileId: Number(profileId),
                                reportDate: { $gte: fromDate, $lte: toDate }
                            }
                        },
                        {
                            $group: {
                                _id: "$asin",
                                totalSales: { $sum: "$sales" },
                                totalOrders: { $sum: "$orders" }
                            }
                        }
                    ],
                    as: "sales"
                }
            },

            { $unwind: { path: "$sales", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: AD_TYPE_COLLECTIONS?.[adType]?.productAds || "product_ads",
                    let: { asin: "$asin" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$$asin", "$asins"] },
                                configId,
                                profileId: Number(profileId),
                                campaignId: { $in: activeCampaigns },
                                reportDate: { $gte: fromDate, $lte: toDate }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                adSales: { $sum: "$sales" },
                                clicks: { $sum: "$clicks" },
                                spend: { $sum: "$spend" },
                                adOrders: { $sum: "$orders" }
                            }
                        }
                    ],
                    as: "ads"
                }
            },

            { $unwind: "$ads" },

            {
                $addFields: {

                    revenue: { $ifNull: ["$sales.totalSales", 0] },
                    spend: { $ifNull: ["$ads.spend", 0] },
                    clicks: { $ifNull: ["$ads.clicks", 0] },
                    orders: { $ifNull: ["$sales.totalOrders", 0] },
                    acos: { $cond: [{ $gt: ["$ads.adSales", 0] }, { $multiply: [{ $divide: ["$ads.spend", "$ads.adSales"] }, 100] }, 0] },
                    roas: { $cond: [{ $gt: ["$ads.spend", 0] }, { $divide: ["$ads.adSales", "$ads.spend"] }, 0] },
                    cvr: { $cond: [{ $gt: ["$ads.clicks", 0] }, { $multiply: [{ $divide: ["$ads.adOrders", "$ads.clicks"] }, 100] }, 0] },
                    demand: { $add: [{ $ifNull: ["$ads.clicks", 0] }, { $ifNull: ["$sales.totalOrders", 0] }] },
                    profit: {
                        $subtract: [
                            { $ifNull: ["$sales.totalSales", 0] },
                            { $add: [{ $ifNull: ["$ads.spend", 0] }, { $multiply: [{ $ifNull: ["$sales.totalSales", 0] }, 0.30] }] }
                        ]
                    }
                }
            },

            {
                $addFields: {
                    highDemand: { $gte: ["$demand", 20] },
                    highProfit: { $gt: ["$profit", 0] }
                }
            },

            {
                $addFields: {
                    action: {
                        $switch: {
                            branches: [
                                { case: { $and: [{ $gt: ["$roas", 4] }, { $gt: ["$cvr", 10] }] }, then: "scale" },
                                { case: { $gt: ["$acos", 50] }, then: "stop" },
                                { case: { $and: [{ $lt: ["$cvr", 5] }, { $gt: ["$clicks", 25] }] }, then: "improve" },
                                { case: { $and: ["$highDemand", "$highProfit"] }, then: "scale" },
                                { case: { $and: [{ $not: ["$highDemand"] }, "$highProfit"] }, then: "improve" },
                                { case: { $and: ["$highDemand", { $not: ["$highProfit"] }] }, then: "optimize" },
                                { case: { $and: [{ $not: ["$highDemand"] }, { $not: ["$highProfit"] }] }, then: "stop" }
                            ],
                            default: "optimize"
                        }
                    }
                }
            },

            {
                $group: {
                    _id: "$action",
                    count: { $sum: 1 }
                }
            }

        ];

        const data = await productListingSchema.aggregate(pipeline);

        let matrix = {
            scale: 0,
            improve: 0,
            optimize: 0,
            stop: 0
        };

        data.forEach(d => { matrix[d._id] = d.count });

        return res.status(200).send({
            isSuccess: true,
            data: matrix
        });

    } catch (error) {
        write_logs({ message: `[getProductDecisionMatrix Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        return res.status(203).send({
            isSuccess: false,
            message: "An internal server error occurred"
        });

    }
};

exports.getDashboardInsights = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        let {
            profileId,
            fromDate,
            toDate,
            marketplaceId,
            productTypes,
            productName,
            page = 1,
            limit = 15,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        page = Number(page);
        limit = Number(limit);
        const skip = (page - 1) * limit;

        const currentDate = moment().format("YYYY-MM-DD");
        toDate = toDate || moment().format("YYYY-MM-DD");
        fromDate = fromDate || moment().subtract(7, "days").format("YYYY-MM-DD");

        const diffDays = Math.max(moment(toDate).diff(moment(fromDate), "days"), 1);

        const CLICK_THRESHOLD = 10 * diffDays;

        const matchListing = {
            configId,
            profileId: Number(profileId),
            ...(marketplaceId && { marketplaceId }),
            ...(productTypes && { productType: { $in: [productTypes] } }),
            ...(productName && {
                $or: [
                    { sku: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                    { asin: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } },
                    { itemName: { $regex: new RegExp(RegExp.escape(`${productName}`?.trim()), "i") } }
                ]
            }),
        };

        const adType = req.adType || "SP";
        const mainCampaignModel = AD_TYPE_COLLECTIONS?.[`${adType}Model`]?.campaignSchema || campaignSchema;

        const activeCampaigns = await mainCampaignModel.distinct("campaignId", { configId, profileId: Number(profileId), status: "ENABLED", reportDate: { $eq: currentDate } });

        const pipeline = [
            { $match: matchListing },
            {
                $lookup: {
                    from: "businessproductsales",
                    let: { asin: "$asin" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$asin", "$$asin"] },
                                configId,
                                profileId: Number(profileId),
                                reportDate: { $gte: fromDate, $lte: toDate }
                            }
                        },
                        {
                            $group: {
                                _id: "$asin",
                                revenue: { $sum: "$sales" },
                                orders: { $sum: "$orders" }
                            }
                        }
                    ],
                    as: "sales"
                }
            },
            { $unwind: { path: "$sales", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: AD_TYPE_COLLECTIONS?.[adType]?.productAds || "product_ads",
                    let: { asin: "$asin" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$$asin", "$asins"] },
                                configId,
                                profileId: Number(profileId),
                                campaignId: { $in: activeCampaigns },
                                reportDate: { $gte: fromDate, $lte: toDate }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                adSales: { $sum: "$sales" },
                                spend: { $sum: "$spend" },
                                clicks: { $sum: "$clicks" },
                                adOrders: { $sum: "$orders" }
                            }
                        }
                    ],
                    as: "ads"
                }
            },
            { $unwind: "$ads" },
            {
                $lookup: {
                    from: "inventories",
                    let: { asin: "$asin" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$asin", "$$asin"] } } },
                        {
                            $group: {
                                _id: "$asin",
                                currentStock: { $sum: "$currentStock" },
                                inboundStock: { $sum: "$inboundStock" },
                                reservedStock: { $sum: "$reservedStock" }
                            }
                        }
                    ],
                    as: "inv"
                }
            },
            { $unwind: { path: "$inv", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    spend: { $ifNull: ["$ads.spend", 0] },
                    clicks: { $ifNull: ["$ads.clicks", 0] },
                    acos: { $cond: [{ $gt: ["$ads.adSales", 0] }, { $multiply: [{ $divide: ["$ads.spend", "$ads.adSales"] }, 100] }, 0] },
                    roas: { $cond: [{ $gt: ["$ads.spend", 0] }, { $divide: ["$ads.adSales", "$ads.spend"] }, 0] },
                    cvr: { $cond: [{ $gt: ["$ads.clicks", 0] }, { $multiply: [{ $divide: ["$ads.adOrders", "$ads.clicks"] }, 100] }, 0] },
                    adSales: { $ifNull: ["$ads.adSales", 0] },
                    stockDays: {
                        $let: {
                            vars: {
                                totalStock: {
                                    $subtract: [
                                        { $add: [{ $ifNull: ["$inv.currentStock", 0] }, { $ifNull: ["$inv.inboundStock", 0] }] },
                                        { $ifNull: ["$inv.reservedStock", 0] }
                                    ]
                                },
                                spd: { $divide: [{ $ifNull: ["$sales.orders", 0] }, diffDays] }
                            },
                            in: { $cond: [{ $gt: ["$$spd", 0] }, { $divide: ["$$totalStock", "$$spd"] }, 30] }
                        }
                    }
                }
            },
            {
                $addFields: {
                    roasValue: { $round: ["$roas", 1] },
                    acosValue: { $round: ["$acos", 0] },
                    cvrValue: { $round: ["$cvr", 1] },
                    clicksValue: { $round: ["$clicks", 0] },
                    stockDaysValue: { $round: ["$stockDays", 0] }
                }
            },
            {
                $addFields: {
                    type: {
                        $switch: {
                            branches: [
                                { case: { $gt: ["$roas", 4] }, then: "scale" },
                                { case: { $gt: ["$acos", 50] }, then: "stop" },
                                { case: { $and: [{ $gt: ["$clicks", CLICK_THRESHOLD] }, { $lt: ["$cvr", 5] }] }, then: "fix" },
                                { case: { $lt: ["$stockDays", 5] }, then: "optimize" }
                            ],
                            default: null
                        }
                    }
                }
            },
            { $match: { type: { $ne: null } } },
            { $group: { _id: "$asin", doc: { $first: "$$ROOT" } } },
            { $replaceRoot: { newRoot: "$doc" } },
            {
                $project: {
                    _id: 0,
                    asin: 1,
                    type: 1,

                    message: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$type", "scale"] }, then: { $concat: ["Increase budget to scale sales for ", { $ifNull: ["$sku", ""] }] } },
                                { case: { $eq: ["$type", "stop"] }, then: { $concat: ["Reduce bids or pause ads for ", { $ifNull: ["$sku", ""] }] } },
                                { case: { $eq: ["$type", "fix"] }, then: { $concat: ["Improve listing quality for ", { $ifNull: ["$sku", ""] }] } },
                                { case: { $eq: ["$type", "optimize"] }, then: { $concat: ["Reduce ad spend to avoid stock-out for ", { $ifNull: ["$sku", ""] }] } }
                            ],
                            default: ""
                        }
                    },

                    smallMessage: {
                        $switch: {
                            branches: [
                                {
                                    case: { $eq: ["$type", "scale"] },
                                    then: { $concat: ["(ROAS ", { $toString: "$roasValue" }, ")"] }
                                },
                                {
                                    case: { $eq: ["$type", "stop"] },
                                    then: { $concat: ["(ACOS ", { $toString: "$acosValue" }, "%)"] }
                                },
                                {
                                    case: { $eq: ["$type", "fix"] },
                                    then: { $concat: ["(High clicks ", { $toString: "$clicksValue" }, ", Low CVR ", { $toString: "$cvrValue" }, "%)"] }
                                },
                                {
                                    case: { $eq: ["$type", "optimize"] },
                                    then: { $concat: ["(Only ", { $toString: "$stockDaysValue" }, " days stock left)"] }
                                }
                            ],
                            default: ""
                        }
                    }
                }
            }

        ];

        const insights = await productListingSchema.aggregate(pipeline);

        return res.status(200).send({
            isSuccess: true,
            data: insights,
        });

    } catch (err) {
        write_logs({ message: `[getDashboardInsights Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        return res.status(203).send({
            isSuccess: false,
            message: err.message
        });

    }
};

exports.getGlobalInventorySettings = async (req, res) => {
    try {

        const { profileId } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const filter = { profileId: Number(profileId), isActive: true };

        let data = await globalInventorySettingSchema.findOne(filter).lean();

        if (!data) {
            data = await globalInventorySettingSchema.create({
                profileId: Number(profileId),
                createdBy: req?.user?._id,
            });
        }

        return res.status(200).send({
            isSuccess: true,
            data,
        });

    } catch (e) {
        write_logs({ message: `[getGlobalInventorySettings Error] ${e?.message || e} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

exports.saveGlobalInventorySettings = async (req, res) => {
    try {

        const {
            profileId,
            bufferDays,
            transitDays,
            coverageDays,
            leadTimeDays,
            alertThreshold,
            isAlertActive,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const updateData = {
            updatedBy: req?.user?._id,
        };

        if (bufferDays !== undefined)
            updateData.bufferDays = bufferDays;

        if (transitDays !== undefined)
            updateData.transitDays = transitDays;

        if (coverageDays !== undefined)
            updateData.coverageDays = coverageDays;

        if (leadTimeDays !== undefined)
            updateData.leadTimeDays = leadTimeDays;

        if (alertThreshold !== undefined)
            updateData.alertThreshold = alertThreshold;

        if (isAlertActive !== undefined)
            updateData.isAlertActive = isAlertActive;

        const data = await globalInventorySettingSchema.findOneAndUpdate(
            { profileId: Number(profileId) },
            {
                $set: updateData,
                $setOnInsert: {
                    profileId: Number(profileId),
                    createdBy: req?.user?._id,
                },
            },
            {
                new: true,
                upsert: true,
            }
        ).lean();

        await logAudit("FBA_CONFIGURATION", `Global inventory settings updated successfully.`, { bufferDays, transitDays, coverageDays, alertThreshold, alertActive: isAlertActive }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: "Global inventory settings saved successfully",
            data,
        });

    } catch (e) {
        write_logs({
            message: `[saveGlobalInventorySettings Error] ${e.message || e}`,
            log_type: "error",
        });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

exports.getASINInventorySettings = async (req, res) => {
    try {

        const {
            profileId,
            asin,
            sku,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const filter = {
            profileId: Number(profileId),
            isActive: true,
            ...(asin && { asin: asin.toUpperCase() }),
            ...(sku && { sku }),
        };

        const data = await asinInventorySettingSchema.findOne(filter).lean();

        return res.status(200).send({
            isSuccess: true,
            data,
        });

    } catch (e) {
        write_logs({
            message: `[getASINInventorySettings Error] ${e.message || e}`,
            log_type: "error",
        });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

exports.saveASINInventorySettings = async (req, res) => {
    try {

        const {
            profileId,
            asin,
            sku,
            bufferDays,
            transitDays,
            coverageDays,
            leadTimeDays,
            alertThreshold,
            isAlertActive,
        } = req.body;

        if (!profileId || !asin || !sku) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id, ASIN, and SKU required!"
            });
        }

        const updateData = {
            updatedBy: req?.user?._id,
        };

        if (sku !== undefined)
            updateData.sku = sku;

        if (bufferDays !== undefined)
            updateData.bufferDays = bufferDays;

        if (transitDays !== undefined)
            updateData.transitDays = transitDays;

        if (coverageDays !== undefined)
            updateData.coverageDays = coverageDays;

        if (leadTimeDays !== undefined)
            updateData.leadTimeDays = leadTimeDays;

        if (alertThreshold !== undefined)
            updateData.alertThreshold = alertThreshold;

        if (isAlertActive !== undefined)
            updateData.isAlertActive = isAlertActive;

        const data = await asinInventorySettingSchema.findOneAndUpdate(
            {
                profileId: Number(profileId),
                asin: asin.toUpperCase(),
                sku: sku,
            },
            {
                $set: updateData,
                $setOnInsert: {
                    profileId: Number(profileId),
                    asin: asin.toUpperCase(),
                    createdBy: req?.user?._id,
                },
            },
            {
                new: true,
                upsert: true,
            }
        ).lean();

        const product = await productListingSchema?.findOne({ profileId: Number(profileId), asin })
        if (!product) return res.status(203).send({ isSuccess: false, message: "Product not found!" });

        await logAudit("FBA_CONFIGURATION", `ASIN ${asin} inventory settings updated successfully.`, { itemName: product?.itemName, asin, sku, bufferDays, transitDays, coverageDays, alertThreshold, alertActive: isAlertActive }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: "ASIN inventory settings saved successfully",
            data,
        });

    } catch (e) {
        write_logs({
            message: `[saveASINInventorySettings Error] ${e.message || e}`,
            log_type: "error",
        });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

exports.deleteASINInventorySettings = async (req, res) => {
    try {
        const { profileId, asin, sku } = req.body;

        if (!profileId || !asin) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id and ASIN required!"
            });
        }

        await asinInventorySettingSchema.deleteOne({
            profileId: Number(profileId),
            asin: asin.toUpperCase(),
            ...(sku && { sku })
        });

        return res.status(200).send({
            isSuccess: true,
            message: "Settings reset to global defaults successfully"
        });

    } catch (e) {
        write_logs({
            message: `[deleteASINInventorySettings Error] ${e.message || e}`,
            log_type: "error",
        });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

exports.inventoryForecastCommonPipeline = ({ configId, profileId, fromDate, toDate, search, status }) => {

    // =========================================================
    // DATE LOGIC
    // =========================================================

    const endDate = toDate || moment().format("YYYY-MM-DD");
    const startDate = fromDate || moment(endDate).subtract(30, "days").format("YYYY-MM-DD");

    const last7DaysDate = moment(endDate).subtract(7, "days").format("YYYY-MM-DD");
    const last14DaysDate = moment(endDate).subtract(14, "days").format("YYYY-MM-DD");
    const last30DaysDate = moment(endDate).subtract(30, "days").format("YYYY-MM-DD");

    // =========================================================
    // MATCH QUERY
    // =========================================================

    const matchQuery = { configId, profileId: Number(profileId), fulfillmentType: "FBA" };

    if (search) {
        matchQuery.$or = [
            { asin: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
            { sku: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
            { name: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
        ];
    }

    return [
        { $match: matchQuery },
        {
            $lookup: {
                from: "productlistings",
                let: { asin: "$asin", sku: "$sku", profileId: "$profileId", configId: "$configId" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$asin", "$$asin"] },
                                    { $eq: ["$sku", "$$sku"] },
                                    { $eq: ["$profileId", "$$profileId"] },
                                    { $eq: ["$configId", "$$configId"] },
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            itemName: 1,
                            imageURL: 1,
                            sellingPrice: 1,
                            productType: 1,
                        }
                    }

                ],
                as: "productData"
            }
        },
        { $unwind: { path: "$productData", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "asininventorysettings",
                let: { asin: "$asin", profileId: "$profileId", configId: "$configId" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$asin", "$$asin"] },
                                    { $eq: ["$profileId", "$$profileId"] },
                                ]
                            }
                        }
                    }

                ],
                as: "asinSetting"
            }
        },
        { $unwind: { path: "$asinSetting", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "globalinventorysettings",
                let: { profileId: "$profileId", configId: "$configId" },
                pipeline: [
                    { $match: { $expr: { $and: [{ $eq: ["$profileId", "$$profileId"] }] } } }
                ],
                as: "globalSetting"
            }
        },
        { $unwind: { path: "$globalSetting", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "businessproductsales",
                let: { asin: "$asin", profileId: "$profileId", configId: "$configId", currentStock: "$currentStock" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$asin", "$$asin"] },
                                    { $eq: ["$profileId", "$$profileId"] },
                                    { $eq: ["$configId", "$$configId"] },
                                ]
                            }
                        }
                    },
                    { $match: { reportDate: { $gte: last30DaysDate, $lte: endDate } } },
                    {
                        $group: {
                            _id: null,
                            last7DaysOrders: { $sum: { $cond: [{ $gte: ["$reportDate", last7DaysDate] }, "$orders", 0] } },
                            last14DaysOrders: { $sum: { $cond: [{ $gte: ["$reportDate", last14DaysDate] }, "$orders", 0] } },
                            last30DaysOrders: { $sum: { $cond: [{ $gte: ["$reportDate", last30DaysDate] }, "$orders", 0] } },
                        }
                    },
                    {
                        $addFields: {
                            avg7Days: { $divide: ["$last7DaysOrders", 7] },
                            avg14Days: { $divide: ["$last14DaysOrders", 14] },
                            avg30Days: { $divide: ["$last30DaysOrders", 30] },

                            avg7Days: { $cond: [{ $lte: ["$$currentStock", 0] }, 0, { $divide: ["$last7DaysOrders", 7] }] },
                            avg14Days: { $cond: [{ $lte: ["$$currentStock", 0] }, 0, { $divide: ["$last14DaysOrders", 14] }] },
                            avg30Days: { $cond: [{ $lte: ["$$currentStock", 0] }, 0, { $divide: ["$last30DaysOrders", 30] }] },
                        }
                    },
                    {
                        $addFields: {
                            weightedADS: {
                                $add: [
                                    { $multiply: ["$avg7Days", 0.5] },
                                    { $multiply: ["$avg14Days", 0.3] },
                                    { $multiply: ["$avg30Days", 0.2] }
                                ]
                            }
                        }
                    }
                ],
                as: "salesData"
            }
        },
        { $unwind: { path: "$salesData", preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                effectiveBufferDays: { $ifNull: ["$asinSetting.bufferDays", "$globalSetting.bufferDays", 7] },
                effectiveTransitDays: { $ifNull: ["$asinSetting.transitDays", "$globalSetting.transitDays", 14] },
                effectiveCoverageDays: { $ifNull: ["$asinSetting.coverageDays", "$globalSetting.coverageDays", 30] },
                effectiveLeadTimeDays: { $ifNull: ["$asinSetting.leadTimeDays", "$globalSetting.leadTimeDays", 0] },
                effectiveAlertThreshold: { $ifNull: ["$asinSetting.alertThreshold", "$globalSetting.alertThreshold", 51] },
                isAlertActive: { $ifNull: ["$asinSetting.isAlertActive", "$globalSetting.isAlertActive", true] },
                isCustomSetting: { $gt: [{ $size: { $objectToArray: { $ifNull: ["$asinSetting", {}] } } }, 0] },
            }
        },
        {
            $addFields: {
                salesPerDay: { $ifNull: ["$salesData.weightedADS", 0] },
                availableInventory: {
                    $subtract: [
                        { $add: [{ $ifNull: ["$currentStock", 0] }, { $ifNull: ["$inboundStock", 0] }] },
                        { $ifNull: ["$reservedStock", 0] }
                    ]
                },
            }
        },
        {
            $addFields: {
                doi: {
                    $cond: [
                        { $gt: ["$salesPerDay", 0] },
                        { $divide: ["$availableInventory", "$salesPerDay"] },
                        0
                    ]
                },
                reorderPoint: {
                    $multiply: ["$salesPerDay", { $add: ["$effectiveTransitDays", "$effectiveBufferDays"] }]
                },
            }
        },
        {
            $addFields: {
                recommendedShipmentQty: {
                    $max: [
                        {
                            $subtract: [{ $multiply: ["$salesPerDay", { $add: ["$effectiveTransitDays", "$effectiveBufferDays", "$effectiveCoverageDays"] }] }, "$availableInventory"]
                        },
                        0
                    ]
                }
            }
        },
        {
            $addFields: {
                inventoryForecastStatus: {
                    $switch: {
                        branches: [
                            {
                                case: { $lte: ["$salesPerDay", 0] },
                                then: "NO_SALES"
                            },
                            {
                                case: { $lt: ["$doi", "$effectiveTransitDays"] },
                                then: "URGENT"
                            },
                            {
                                case: { $lt: ["$doi", { $add: ["$effectiveTransitDays", "$effectiveBufferDays"] }] },
                                then: "PLAN_SHIPMENT"
                            },
                            {
                                case: { $gt: ["$doi", { $add: ["$effectiveTransitDays", "$effectiveBufferDays", "$effectiveCoverageDays"] }] },
                                then: "OVERSTOCK"
                            },
                        ],
                        default: "HEALTHY"
                    }
                },
                shouldTriggerAlert: {
                    $and: [
                        { $eq: ["$isAlertActive", true] },
                        { $gt: ["$salesPerDay", 0] },
                        { $ifNull: [{ $lt: ["$doi", "$effectiveAlertThreshold"] }, false] },
                    ]
                }
            }
        },
        ...(status ? [{ $match: { inventoryForecastStatus: status } }] : []),
        {
            $project: {

                asin: 1,
                sku: 1,

                productName: "$productData.itemName",

                imageURL: "$productData.imageURL",

                sellingPrice: "$productData.sellingPrice",

                currentStock: 1,
                inboundStock: 1,
                reservedStock: 1,

                availableInventory: 1,

                avg7DaysSales: { $round: ["$salesData.avg7Days", 2] },
                avg14DaysSales: { $round: ["$salesData.avg14Days", 2] },
                avg30DaysSales: { $round: ["$salesData.avg30Days", 2] },
                salesPerDay: { $round: ["$salesPerDay", 2] },
                doi: { $round: ["$doi", 2] },
                reorderPoint: { $round: ["$reorderPoint", 0] },
                recommendedShipmentQty: { $round: ["$recommendedShipmentQty", 0] },

                effectiveBufferDays: 1,
                effectiveTransitDays: 1,
                effectiveCoverageDays: 1,
                effectiveAlertThreshold: 1,
                isAlertActive: 1,
                isCustomSetting: 1,

                inventoryForecastStatus: 1,

                shouldTriggerAlert: 1,

                agingBucket: 1,
                deadInventoryStatus: 1,
                suggestion: 1,

                lastNotifiedAt: 1,
                createdAt: 1,
            }
        },
    ]

};

exports.getInventoryForecastGrid = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        const {
            profileId,
            fromDate,
            toDate,
            search,
            status,
            page = 1,
            limit = 20,
            sort = "doi",
            order = -1,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const allowedSortFields = ["asin", "sku", "productName", "currentStock", "inboundStock", "reservedStock", "availableInventory", "avg7DaysSales", "avg14DaysSales", "avg30DaysSales", "salesPerDay", "doi", "reorderPoint", "recommendedShipmentQty", "inventoryForecastStatus", "createdAt"];

        const sortField = allowedSortFields.includes(sort) ? sort : "doi";

        const sortOrder = (order === "ASC" || order === 1) ? 1 : -1;
        const sortStage = { [sortField]: sortOrder, createdAt: -1 };

        // =========================================================
        // PAGINATION
        // =========================================================

        const skip = (Number(page) - 1) * Number(limit);

        const commonPipeline = this.inventoryForecastCommonPipeline({ configId, profileId, fromDate, toDate, search, status });
        const pipeline = [
            ...commonPipeline,
            { $sort: sortStage },
            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: Number(limit) }],
                    totalCount: [{ $count: "count" }]
                }
            }

        ]

        const data = await inventorySchema.aggregate(pipeline);

        return res.status(200).send({
            isSuccess: true,
            data: data?.[0]?.data || [],
            totalCount: data?.[0]?.totalCount?.[0]?.count || 0,
        });

    } catch (e) {
        write_logs({ message: `[getInventoryForecastGrid Error] ${e?.message || e} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        console.log("getInventoryForecastGrid error =>", e);

        return res.status(203).send({
            isSuccess: false,
            message: e.message,
        });

    }
};

exports.getInventoryForecastCards = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        const {
            profileId,
            fromDate,
            toDate,
            search,
            status,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const commonPipeline = this.inventoryForecastCommonPipeline({ configId, profileId, fromDate, toDate, search, status });

        const pipeline = [
            ...commonPipeline,
            {
                $group: {
                    _id: null,
                    totalSKUs: { $sum: 1 },
                    noSalesCount: { $sum: { $cond: [{ $eq: ["$inventoryForecastStatus", "NO_SALES"] }, 1, 0] } },
                    urgentCount: { $sum: { $cond: [{ $eq: ["$inventoryForecastStatus", "URGENT"] }, 1, 0] } },
                    planCount: { $sum: { $cond: [{ $eq: ["$inventoryForecastStatus", "PLAN_SHIPMENT"] }, 1, 0] } },
                    healthyCount: { $sum: { $cond: [{ $eq: ["$inventoryForecastStatus", "HEALTHY"] }, 1, 0] } },
                    overstockCount: { $sum: { $cond: [{ $eq: ["$inventoryForecastStatus", "OVERSTOCK"] }, 1, 0] } },
                }
            },
            {
                $project: {
                    _id: 0,
                    totalSKUs: 1,
                    noSalesCount: 1,
                    urgentCount: 1,
                    planCount: 1,
                    healthyCount: 1,
                    overstockCount: 1,
                }
            }
        ];

        const data = await inventorySchema.aggregate(pipeline);

        return res.status(200).send({
            isSuccess: true,
            data: data?.[0] || {
                totalSKUs: 0,
                noSalesCount: 0,
                urgentCount: 0,
                planCount: 0,
                healthyCount: 0,
                overstockCount: 0,
            }
        });

    } catch (e) {
        write_logs({ message: `[getInventoryForecastCards Error] ${e?.message || e} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.log("getInventoryForecastCards error =>", e);
        return res.status(203).send({
            isSuccess: false,
            message: e.message,
        });

    }
};

exports.getInventoryForecastGraphs = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        const {
            profileId,
            fromDate,
            toDate,
            search,
            status,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const endDate = toDate || moment().format("YYYY-MM-DD");

        const startDate = fromDate || moment(endDate).subtract(30, "days").format("YYYY-MM-DD");
        const todayDate = moment().format("YYYY-MM-DD");

        let forecastDays = moment(endDate).diff(moment(startDate), "days");

        // fallback protection
        if (forecastDays <= 0) {
            forecastDays = 30;
        }

        const commonPipeline = this.inventoryForecastCommonPipeline({ configId, profileId, fromDate, toDate, search, status });

        const inventoryStatePipeline = [
            ...commonPipeline,
            {
                $group: {
                    _id: null,
                    totalAvailableInventory: { $sum: "$availableInventory" },
                    totalSalesPerDay: { $sum: "$salesPerDay" },

                    // Weighted average of settings across SKUs
                    avgTransitDays: { $avg: "$effectiveTransitDays" },
                    avgBufferDays: { $avg: "$effectiveBufferDays" },
                    avgCoverageDays: { $avg: "$effectiveCoverageDays" },

                    totalSKUs: { $sum: 1 },
                }
            },
            {
                $addFields: {
                    reorderPoint: {
                        $multiply: [
                            "$totalSalesPerDay",
                            { $add: ["$avgTransitDays", "$avgBufferDays"] }
                        ]
                    },
                    dangerPoint: {
                        $multiply: ["$totalSalesPerDay", "$avgTransitDays"]
                    },
                    forecastHorizonDays: {
                        $add: ["$avgTransitDays", "$avgBufferDays", "$avgCoverageDays"]
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalAvailableInventory: 1,
                    totalSalesPerDay: { $round: ["$totalSalesPerDay", 2] },
                    avgTransitDays: { $round: ["$avgTransitDays", 0] },
                    avgBufferDays: { $round: ["$avgBufferDays", 0] },
                    avgCoverageDays: { $round: ["$avgCoverageDays", 0] },
                    reorderPoint: { $round: ["$reorderPoint", 0] },
                    dangerPoint: { $round: ["$dangerPoint", 0] },
                    forecastHorizonDays: { $round: ["$forecastHorizonDays", 0] },
                    totalSKUs: 1,
                }
            }
        ];

        const matchedAsinsPipeline = [
            ...commonPipeline,
            {
                $group: {
                    _id: null,
                    asins: { $addToSet: "$asin" }
                }
            },
            {
                $project: { _id: 0, asins: 1 }
            }
        ];

        // Run inventory state + matched ASINs in parallel
        const [inventoryStateArr, matchedAsinsArr] = await Promise.all([
            inventorySchema.aggregate(inventoryStatePipeline),
            inventorySchema.aggregate(matchedAsinsPipeline),
        ]);

        const inventoryState = inventoryStateArr?.[0] || null;
        const matchedAsins = matchedAsinsArr?.[0]?.asins || [];

        const salesTrend = await businessProductSalesSchema.aggregate([
            {
                $match: {
                    configId,
                    profileId: Number(profileId),
                    asin: { $in: matchedAsins },
                    reportDate: { $gte: startDate, $lte: endDate },
                }
            },
            {
                $group: {
                    _id: "$reportDate",
                    totalOrders: { $sum: "$orders" },
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    date: "$_id",
                    orders: "$totalOrders",
                }
            }
        ]);
        ``
        let forecastCurve = [];

        if (inventoryState && inventoryState.totalSalesPerDay > 0) {

            const {
                totalAvailableInventory,
                totalSalesPerDay,
                reorderPoint,
                dangerPoint,
                forecastHorizonDays,
            } = inventoryState;

            const totalForecastDays = forecastDays + 10;

            for (let day = 0; day <= totalForecastDays; day++) {

                const projectedDate = moment(todayDate).add(day, "days").format("YYYY-MM-DD");
                const projectedStock = Math.max(totalAvailableInventory - (totalSalesPerDay * day), 0);

                let zone = "HEALTHY";
                if (totalSalesPerDay <= 0) zone = "NO_SALES";
                else if (projectedStock <= dangerPoint) zone = "URGENT";
                else if (projectedStock <= reorderPoint) zone = "PLAN_SHIPMENT";
                else if (day === 0 && projectedStock > (totalSalesPerDay * forecastHorizonDays)) zone = "OVERSTOCK";

                forecastCurve.push({
                    date: projectedDate,
                    day,
                    projectedStock: Math.round(projectedStock),
                    zone,
                });
            }
        }

        // =========================================================
        // RESPONSE
        // =========================================================

        return res.status(200).send({
            isSuccess: true,
            data: {

                // Graph 1 — Daily sales trend
                salesTrend: {
                    label: "Daily Units Sold",
                    startDate,
                    endDate,
                    data: salesTrend,  // [{ date, orders }]
                },

                inventoryForecast: {
                    label: "Projected Stock Level",
                    forecastStartDate: todayDate,
                    totalForecastDays: forecastDays,
                    currentState: inventoryState,
                    referenceLines: {
                        reorderPoint: inventoryState?.reorderPoint ?? 0,   // 🟡 Yellow
                        dangerPoint: inventoryState?.dangerPoint ?? 0,   // 🔴 Red
                    },
                    data: forecastCurve,  // [{ date, day, projectedStock, zone }]
                },

            }
        });

    } catch (e) {
        write_logs({ message: `[getInventoryForecastGraphs Error] ${e?.message || e} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.log("getInventoryForecastGraphs error =>", e);
        return res.status(203).send({
            isSuccess: false,
            message: e.message,
        });
    }

};

// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ AGING INVENTORY TRACKER — NEW ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Get per-ASIN/SKU aging threshold config ───────────────────────────────────
exports.getAgingConfig = async (req, res) => {
    const configId = req?.config?.configId;
    try {
        const { profileId, asin, sku } = req.body;
        if (!profileId) return res.status(203).send({ isSuccess: false, message: "Profile id required!" });

        const filter = {
            configId,
            profileId: Number(profileId),
            ...(asin && { asin }),
            ...(sku && { sku }),
        };

        const data = await inventoryAgingConfigSchema.find(filter).lean();
        return res.status(200).send({ isSuccess: true, data });
    } catch (e) {
        write_logs({
            message: `[getAgingConfig Error] ${e.message || e}`,
            log_type: "error",
        });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

// ── Save / Update per-ASIN/SKU aging threshold config ────────────────────────
exports.saveAgingConfig = async (req, res) => {
    const configId = req?.config?.configId;
    try {
        const { profileId, asin, sku, minOrders, lookbackDays, isEnabled } = req.body;
        if (!profileId || !sku) return res.status(203).send({ isSuccess: false, message: "profileId and sku are required!" });

        const product = await productListingSchema?.findOne({ profileId: Number(profileId), asin })
        if (!product) return res.status(203).send({ isSuccess: false, message: "Product not found!" });

        await logAudit("INVENTORY_SETTINGS", `Aging configuration for SKU ${sku} updated successfully.`, { itemName: product?.itemName, asin, sku, minOrders, lookbackDays, isEnabled }, req?.user?.id);

        await inventoryAgingConfigSchema.findOneAndUpdate(
            { configId, profileId: Number(profileId), sku },
            { $set: { asin, minOrders, lookbackDays, isEnabled, configId, profileId: Number(profileId) } },
            { upsert: true, new: true }
        ).lean();

        return res.status(200).send({ isSuccess: true, message: "Config saved successfully" });
    } catch (e) {
        write_logs({
            message: `[saveAgingConfig Error] ${e.message || e} [body] ${JSON.stringify(req.body)}`,
            log_type: "error",
        });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

// ── Aging summary card counts (bucket breakdown) ─────────────────────────────
exports.getAgingCards = async (req, res) => {
    const configId = req?.config?.configId;
    try {
        const basePipeline = buildInventoryBasePipeline(req);

        const pipeline = [
            ...basePipeline,
            {
                $group: {
                    _id: null,
                    bucket30: { $sum: { $cond: [{ $lte: ["$daysLeft", 30] }, 1, 0] } },
                    bucket60: { $sum: { $cond: [{ $and: [{ $gt: ["$daysLeft", 30] }, { $lte: ["$daysLeft", 60] }] }, 1, 0] } },
                    bucket90: { $sum: { $cond: [{ $and: [{ $gt: ["$daysLeft", 60] }, { $lte: ["$daysLeft", 90] }] }, 1, 0] } },
                    bucket180: { $sum: { $cond: [{ $gt: ["$daysLeft", 90] }, 1, 0] } },
                    deadCount: { $sum: { $cond: [{ $eq: ["$deadInventoryStatus", "DEAD"] }, 1, 0] } },
                }
            },
            { $project: { _id: 0 } }
        ];

        const result = await inventorySchema.aggregate(pipeline);
        const agingData = result[0] || {
            bucket30: 0, bucket60: 0, bucket90: 0, bucket180: 0,
            deadCount: 0
        };

        return res.status(200).send({ isSuccess: true, agingData });
    } catch (e) {
        write_logs({
            message: `[getAgingCards Error] ${e.message || e}`,
            log_type: "error",
        });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

// ── Aging-filtered inventory grid ─────────────────────────────────────────────
exports.getAgingInventoryList = async (req, res) => {
    try {
        let {
            pageNo = 1,
            perPage = 10,
            fieldName,
            sortType,
            agingBucket,   // "30" | "60" | "90" | "180+" | undefined
            deadOnly,      // true | false
        } = req.body;

        pageNo = Number(pageNo);
        perPage = Number(perPage);

        const basePipeline = buildInventoryBasePipeline(req);

        const pipeline = [
            ...basePipeline,
            // Filter by aging bucket if passed
            ...(agingBucket ? [{ $match: { agingBucket } }] : []),
            // Filter dead-only if passed
            ...(deadOnly ? [{ $match: { deadInventoryStatus: "DEAD" } }] : []),
            {
                $project: {
                    _id: 0,
                    sku: 1, asin: 1, fulfillmentType: 1, status: 1,
                    currentStock: 1, inboundStock: 1, reservedStock: 1, totalStock: 1,
                    salesPerDay: { $round: ["$salesPerDay", 2] },
                    daysLeft: 1,
                    title: "$productData.title",
                    image: "$productData.imageUrl",
                    agingBucket: 1,
                    deadInventoryStatus: 1,
                    suggestion: 1,
                }
            },
            ...(sortType
                ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }]
                : [{ $sort: { daysLeft: -1 } }]  // worst aging first
            ),
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (pageNo - 1) * perPage }, { $limit: perPage }]
                }
            }
        ];

        const result = await inventorySchema.aggregate(pipeline);
        const totalRecords = result[0]?.metadata[0]?.total || 0;

        return res.status(200).send({
            isSuccess: true,
            data: result[0]?.data || [],
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
        });
    } catch (e) {
        write_logs({
            message: `[getAgingInventoryList Error] ${e.message || e}`,
            log_type: "error",
        });
        return res.status(203).send({ isSuccess: false, message: e.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ CRON — Detect Dead Inventory, Write Suggestions, Fire Notifications
// ═══════════════════════════════════════════════════════════════════════════════

exports.cronDetectDeadInventory = async () => {
    cron_logs({ message: `cronDetectDeadInventory started at ${moment().tz("Asia/Kolkata").format("HH:mm")}`, log_type: "info" });

    try {
        let profiles = await getActivePlanProfiles();
        const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", true);
        profiles = profiles.filter((profile) => {
            return (
                allowedProfiles.some(item => item.profileId === Number(profile.profileId) && item.configId === String(profile.configId))
            );
        });
        const promises = profiles.map(profile => limit(async () => {
            if (global.updateTaskProgress) global.updateTaskProgress("Detect Dead Inventory");
            try {
                const configId = profile.configId;
                const profileId = profile.profileId;

                // 1. Load all aging configs for this profile into a map keyed by SKU
                const agingConfigs = await inventoryAgingConfigSchema.find({ configId, profileId }).lean();
                const configMap = {};
                agingConfigs.forEach(c => { configMap[c.sku] = c; });

                // 2. Load FBA-only inventory records (aging tracker = FBA Storage Fees Killer)
                const inventoryItems = await inventorySchema.find({ configId, profileId, fulfillmentType: "FBA" }).lean();
                if (!inventoryItems.length) return;

                const bulkOps = [];
                const deadItems = [];  // items that just became dead → for notification

                const today = moment().format("YYYY-MM-DD");

                for (const inv of inventoryItems) {
                    // Safety guard — only process FBA (cron query already filters, but be safe)
                    if (inv.fulfillmentType !== "FBA") continue;
                    // Skip out-of-stock items — nothing to suggest
                    if (!inv.currentStock || inv.currentStock <= 0) continue;

                    const cfg = configMap[inv.sku] || {};
                    const minOrders = cfg.minOrders ?? 10;
                    const lookbackDays = cfg.lookbackDays ?? 30;
                    const isEnabled = cfg.isEnabled === true;

                    if (!isEnabled) continue;

                    // 3. Compute avg daily orders over lookback window
                    const fromDate = moment().subtract(lookbackDays, "days").format("YYYY-MM-DD");

                    const salesAgg = await businessProductSalesSchema.aggregate([
                        {
                            $match: {
                                configId,
                                profileId,
                                asin: inv.asin,
                                reportDate: { $gte: fromDate, $lte: today }
                            }
                        },
                        { $group: { _id: null, totalOrders: { $sum: "$orders" } } }
                    ]);

                    const totalOrders = salesAgg[0]?.totalOrders || 0;
                    const avgDailyOrders = totalOrders / lookbackDays;

                    // 4. Classify dead or active based on TOTAL orders in the lookback period
                    const isDead = totalOrders < minOrders;
                    const deadInventoryStatus = isDead ? "DEAD" : "ACTIVE";

                    // 5. Compute daysLeft based on real-time avgDailyOrders
                    let daysLeft = 999;
                    if (avgDailyOrders > 0) {
                        // Use totalStock to be consistent with frontend daysLeft calculation
                        daysLeft = Math.round((inv.totalStock || inv.currentStock) / avgDailyOrders);
                    }

                    // 6. Compute agingBucket
                    let agingBucket = "180+";
                    if (daysLeft <= 30) agingBucket = "30";
                    else if (daysLeft <= 60) agingBucket = "60";
                    else if (daysLeft <= 90) agingBucket = "90";

                    // 7. Check notification eligibility (24h guard)
                    const wasAlreadyDead = inv.deadInventoryStatus === "DEAD";
                    const lastNotified = inv.lastNotifiedAt ? moment(inv.lastNotifiedAt) : null;
                    const shouldNotify = isDead && (!lastNotified || moment().diff(lastNotified, "hours") >= 24);

                    const updateObj = { deadInventoryStatus, agingBucket };
                    if (shouldNotify) updateObj.lastNotifiedAt = new Date();

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: inv._id },
                            update: { $set: updateObj }
                        }
                    });

                    if (shouldNotify) {
                        deadItems.push({
                            sku: inv.sku,
                            asin: inv.asin,
                            name: inv.name || inv.asin,
                            avgDailyOrders: avgDailyOrders.toFixed(2),
                            daysLeft: Math.round(daysLeft),
                            currentStock: inv.currentStock,
                            totalOrders: totalOrders,
                            minOrders: minOrders,
                            lookbackDays: lookbackDays,
                        });
                    }
                }

                // 8. Bulk-write inventory updates
                if (bulkOps.length) {
                    await parallelBulkWrite(inventorySchema, bulkOps);
                    cron_logs({ message: `cronDetectDeadInventory: Profile ${profileId} → ${bulkOps.length} records updated`, log_type: "info" });
                }

                // 9. Send notifications for newly-dead items
                if (deadItems.length) {
                    // System notification (in-app)
                    await adNotificationSchema.create({
                        configId,
                        profileId,
                        notificationTitle: `⚠️ Dead Inventory Alert — ${deadItems.length} SKU${deadItems.length > 1 ? "s" : ""} need action`,
                        notificationText: `${deadItems.map(d => d.sku).join(", ")} ${deadItems.length > 1 ? "have" : "has"} low/no sales. We suggest removing stock or applying a discount.`,
                        searchable: deadItems.map(d => d.asin).join(","),
                        seen: false,
                    });

                    // Push notification
                    await sendNotificationToUser(
                        profileId,
                        `⚠️ Dead Inventory Alert`,
                        `${deadItems.length} SKU${deadItems.length > 1 ? "s" : ""} need attention — apply discount or remove stock.`
                    );

                    // Email alert
                    const tableRows = deadItems.map(d => `
                        <tr>
                            <td style="padding:12px;border-bottom:1px solid #edf2f7;vertical-align:top">
                                <div style="font-weight:700;color:#1a202c;margin-bottom:4px;font-size:14px;line-height:1.4">${d.name}</div>
                                <div style="font-size:11px;color:#718096">ASIN: ${d.asin} &nbsp;|&nbsp; SKU: ${d.sku}</div>
                            </td>
                            <td style="padding:12px;border-bottom:1px solid #edf2f7;text-align:center;vertical-align:top;font-weight:600;color:#2d3748">${d.currentStock}</td>
                            <td style="padding:12px;border-bottom:1px solid #edf2f7;text-align:center;vertical-align:top;font-weight:600;color:#2d3748">
                                ${d.minOrders} <span style="font-size:11px;font-weight:normal;color:#718096">/ ${d.lookbackDays}d</span>
                            </td>
                            <td style="padding:12px;border-bottom:1px solid #edf2f7;text-align:center;vertical-align:top">
                                <span style="background:#fff5f5;color:#c53030;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px">
                                    ${d.totalOrders}
                                </span>
                            </td>
                        </tr>`).join("");

                    const html = `
                    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:650px;margin:20px auto;background:#f7fafc;padding:20px;border-radius:16px">
                        <div style="background:#e53e3e;padding:24px;border-radius:12px 12px 0 0;text-align:center">
                            <div style="font-size:32px;margin-bottom:8px">⚠️</div>
                            <h2 style="color:#fff;margin:0;font-size:22px;letter-spacing:-0.5px">Dead Inventory Alert</h2>
                            <p style="color:#fff5f5;margin:8px 0 0;font-size:14px;opacity:0.9">
                                ${deadItems.length} SKU${deadItems.length > 1 ? "s" : ""} fell below your configured sales threshold.
                            </p>
                        </div>
                        <div style="background:#fff;padding:0;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)">
                            <table style="width:100%;border-collapse:collapse;table-layout:fixed">
                                <thead>
                                    <tr style="background:#f8fafc">
                                        <th style="width:45%;padding:12px;text-align:left;color:#4a5568;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #edf2f7">Product</th>
                                        <th style="width:15%;padding:12px;text-align:center;color:#4a5568;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #edf2f7">Stock</th>
                                        <th style="width:20%;padding:12px;text-align:center;color:#4a5568;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #edf2f7">Target</th>
                                        <th style="width:20%;padding:12px;text-align:center;color:#4a5568;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #edf2f7">Sold</th>
                                    </tr>
                                </thead>
                                <tbody>${tableRows}</tbody>
                            </table>
                            <div style="padding:24px;background:#f8fafc;border-top:1px solid #edf2f7;text-align:center">
                                <p style="margin:0 0 16px;color:#4a5568;font-size:14px">
                                    We suggest either <strong>removing the stock</strong> or <strong>applying a discount</strong> to clear this inventory.
                                </p>
                                <a href="${process.env.FRONTEND_REDIRECT_URL}/inventory-management?search=${encodeURIComponent(deadItems.map(d => d.sku).join(","))}"
                                   style="display:inline-block;background:#3182ce;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;box-shadow:0 4px 6px rgba(49,130,206,0.2)">
                                   View in Advertise IQ →
                                </a>
                            </div>
                        </div>
                        <p style="text-align:center;font-size:12px;color:#a0aec0;margin-top:20px">
                            Sent by <strong>Advertise IQ</strong> — FBA Inventory Management
                        </p>
                    </div>`;
                    await sendEmailHelper(
                        profile?.user?.email || process.env.RECEIVER_EMAIL,
                        `⚠️ Dead Inventory Alert — ${deadItems.length} SKU${deadItems.length > 1 ? "s" : ""} need action`,
                        html
                    );

                    cron_logs({ message: `cronDetectDeadInventory: Profile ${profileId} → ${deadItems.length} dead items notified,`, log_type: "info" });
                }

            } catch (profileErr) {
                cron_logs({ message: `cronDetectDeadInventory: Profile ${profile.profileId} error → ${profileErr.message}`, log_type: "error" });
            }
        }));

        await Promise.all(promises);
        cron_logs({ message: "cronDetectDeadInventory completed", log_type: "info" });

    } catch (e) {
        cron_logs({ message: `cronDetectDeadInventory FAILED → ${e.message}`, log_type: "error" });
    }
};

exports.cronInventoryForecastAlerts = async () => {
    cron_logs({ message: `cronInventoryForecastAlerts started at ${moment().tz("Asia/Kolkata").format("HH:mm")}`, log_type: "info" });

    try {
        let profiles = await getActivePlanProfiles();
        const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", true);
        profiles = profiles.filter((profile) => {
            return (
                allowedProfiles.some(item => item.profileId === Number(profile.profileId) && item.configId === String(profile.configId))
            );
        });
        const promises = profiles.map(profile => limit(async () => {
            try {
                const configId = profile.configId;
                const profileId = profile.profileId;

                const commonPipeline = [
                    ...this.inventoryForecastCommonPipeline({ configId, profileId }),
                    { $match: { salesPerDay: { $gt: 0 }, shouldTriggerAlert: true } }
                ];
                const allAlertItems = await inventorySchema.aggregate(commonPipeline);

                const urgentItems = [];
                const planShipmentItems = [];
                const overstockItems = [];
                const bulkOps = [];

                for (const item of allAlertItems) {

                    if (!["URGENT", "PLAN_SHIPMENT", "OVERSTOCK"].includes(item.inventoryForecastStatus)) continue;

                    const lastNotified = item.lastNotifiedAt ? moment(item.lastNotifiedAt) : null;
                    const shouldNotify = !lastNotified || moment().diff(lastNotified, "hours") >= 24;

                    if (!shouldNotify) continue;

                    // Mark lastNotifiedAt so we don't spam tomorrow if the cron re-runs
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: item._id },
                            update: { $set: { lastNotifiedAt: new Date() } }
                        }
                    });

                    if (item.inventoryForecastStatus === "URGENT") urgentItems.push(item);
                    if (item.inventoryForecastStatus === "PLAN_SHIPMENT") planShipmentItems.push(item);
                    if (item.inventoryForecastStatus === "OVERSTOCK") overstockItems.push(item);
                }

                // =========================================================
                // 3. Persist lastNotifiedAt updates
                // =========================================================

                if (bulkOps.length) await parallelBulkWrite(inventorySchema, bulkOps);

                // =========================================================
                // 3b. Fulfillment Center (Warehouse) Planning Alerts
                // =========================================================
                const configuredWarehouses = await warehousePlanningSettingSchema.find({
                    profileId,
                    isActive: { $ne: false },
                }).lean();

                const warehouseAlertItems = [];
                const whBulkOps = [];

                if (configuredWarehouses.length > 0) {
                    const latestFcLedger = await fcInventoryLedgerSchema.findOne({
                        $or: [{ profileId }, { profileId: String(profileId) }],
                        reportDate: { $exists: true, $ne: null }
                    })
                        .sort({ reportDate: -1 })
                        .select("reportDate")
                        .lean();

                    const fcReportDate = latestFcLedger?.reportDate;
                    const fcQtyMap = new Map();
                    const whVelocityMap = new Map();

                    if (fcReportDate) {
                        const fcMatch = {
                            $or: [{ profileId }, { profileId: String(profileId) }],
                            reportDate: fcReportDate
                        };

                        const fcLedgerRows = await fcInventoryLedgerSchema.aggregate([
                            { $match: fcMatch },
                            {
                                $group: {
                                    _id: { fcCode: "$fcCode", sku: "$sku" },
                                    currentQty: { $sum: "$endingWarehouseBalance" },
                                    inTransit: { $sum: "$inTransitBetweenWarehouses" },
                                }
                            }
                        ]);

                        for (const row of fcLedgerRows) {
                            if (row._id?.fcCode && row._id?.sku) {
                                fcQtyMap.set(`${row._id.fcCode}_${row._id.sku}`, {
                                    currentQty: row.currentQty,
                                    inTransit: row.inTransit || 0
                                });
                            }
                        }

                        // Historical shipments per FC x SKU
                        const shipmentAgg = await fcInventoryLedgerSchema.aggregate([
                            { $match: { $or: [{ profileId }, { profileId: String(profileId) }] } },
                            {
                                $group: {
                                    _id: { fcCode: "$fcCode", sku: "$sku" },
                                    totalShipments: { $sum: { $abs: "$customerShipments" } },
                                    distinctDates: { $addToSet: "$reportDate" }
                                }
                            }
                        ]);

                        for (const row of shipmentAgg) {
                            if (row._id?.fcCode && row._id?.sku) {
                                const days = Math.max(1, row.distinctDates?.length || 1);
                                const ads = Math.round((row.totalShipments / days) * 100) / 100;
                                whVelocityMap.set(`${row._id.fcCode}_${row._id.sku}`, ads);
                            }
                        }
                    }

                    for (const wh of configuredWarehouses) {
                        const qtyKey = `${wh.warehouseId}_${wh.sku}`;
                        const stockInfo = fcQtyMap.get(qtyKey) || { currentQty: 0, inTransit: 0 };
                        const currentQty = stockInfo.currentQty;
                        const inTransit = stockInfo.inTransit;
                        const threshold = wh.alertThreshold !== null && wh.alertThreshold !== undefined ? Number(wh.alertThreshold) : null;
                        const ads = whVelocityMap.get(qtyKey) || 0;

                        const transit = Number(wh.transitDays || 14);
                        const buffer = Number(wh.bufferDays || 7);
                        const coverage = Number(wh.coverageDays || 30);
                        const totalAvailable = currentQty + inTransit;
                        const doi = ads > 0 ? (totalAvailable / ads) : (totalAvailable > 0 ? 999 : 0);
                        const rop = Math.round(ads * (transit + buffer));
                        const recommendedQty = Math.max(0, Math.round((ads * (transit + buffer + coverage)) - (currentQty + inTransit)));

                        let whStatus = "HEALTHY";
                        if (ads <= 0) {
                            whStatus = currentQty <= 0 ? "OUT_OF_STOCK" : "NO_SALES";
                        } else if (doi < transit) {
                            whStatus = "URGENT";
                        } else if (doi < (transit + buffer)) {
                            whStatus = "PLAN_SHIPMENT";
                        } else if (doi > (transit + buffer + coverage)) {
                            whStatus = "OVERSTOCK";
                        }

                        // Trigger alert if threshold is breached, stock is urgent/plan shipment, or out of stock
                        const isAlert = (threshold !== null && threshold > 0 && currentQty <= threshold) ||
                                        (threshold !== null && threshold === 0 && currentQty <= 0) ||
                                        (whStatus === "URGENT") ||
                                        (whStatus === "PLAN_SHIPMENT") ||
                                        (currentQty <= 0 && (wh.transitDays || wh.bufferDays));

                        if (isAlert) {
                            const lastNotified = wh.lastNotifiedAt ? moment(wh.lastNotifiedAt) : null;
                            const shouldNotify = !lastNotified || moment().diff(lastNotified, "hours") >= 24;

                            if (shouldNotify) {
                                warehouseAlertItems.push({
                                    asin: wh.asin,
                                    sku: wh.sku,
                                    warehouseId: wh.warehouseId,
                                    warehouseName: wh.warehouseName || wh.warehouseId,
                                    currentQty,
                                    inTransit,
                                    salesPerDay: ads,
                                    doi: doi === 999 ? "∞" : Math.round(doi * 10) / 10,
                                    reorderPoint: rop,
                                    recommendedShipmentQty: recommendedQty,
                                    inventoryForecastStatus: whStatus,
                                    alertThreshold: threshold,
                                    transitDays: wh.transitDays,
                                    bufferDays: wh.bufferDays,
                                    coverageDays: wh.coverageDays,
                                });

                                whBulkOps.push({
                                    updateOne: {
                                        filter: { _id: wh._id },
                                        update: { $set: { lastNotifiedAt: new Date() } }
                                    }
                                });
                            }
                        }
                    }

                    if (whBulkOps.length) {
                        await parallelBulkWrite(warehousePlanningSettingSchema, whBulkOps);
                    }
                }

                const totalMarketplaceAlerts = urgentItems.length + planShipmentItems.length + overstockItems.length;
                const totalAlerts = totalMarketplaceAlerts + warehouseAlertItems.length;
                if (!totalAlerts) return;

                // =========================================================
                // 5. Send in-app + push notifications (Marketplace + FC)
                // =========================================================

                if (warehouseAlertItems.length) {
                    await adNotificationSchema.create({
                        configId,
                        profileId,
                        notificationTitle: `🔴 FC Stock Alert — ${warehouseAlertItems.length} fulfillment center${warehouseAlertItems.length > 1 ? "s" : ""} below threshold`,
                        notificationText: warehouseAlertItems.map(d => `${d.sku} at ${d.warehouseId}: ${d.currentQty} units left (Alert Threshold: ${d.alertThreshold ?? 0})`).join(" · "),
                        searchable: warehouseAlertItems.map(d => d.asin).join(","),
                        seen: false,
                    });
                    await sendNotificationToUser(
                        profileId,
                        `🔴 Fulfillment Center Stock Alert`,
                        `${warehouseAlertItems.length} product${warehouseAlertItems.length > 1 ? "s are" : " is"} below fulfillment center threshold.`
                    );
                }

                if (urgentItems.length) {
                    await adNotificationSchema.create({
                        configId,
                        profileId,
                        notificationTitle: `🔴 Critical Stock Alert — ${urgentItems.length} SKU${urgentItems.length > 1 ? "s" : ""} at stockout risk`,
                        notificationText: `${urgentItems.map(d => d.sku).join(", ")} — DOI is below transit time. Ship immediately.`,
                        searchable: urgentItems.map(d => d.asin).join(","),
                        seen: false,
                    });
                    await sendNotificationToUser(
                        profileId,
                        `🔴 Critical Stock Alert`,
                        `${urgentItems.length} SKU${urgentItems.length > 1 ? "s" : ""} will stockout before your next shipment arrives.`
                    );
                }

                if (planShipmentItems.length) {
                    await adNotificationSchema.create({
                        configId,
                        profileId,
                        notificationTitle: `🟡 Shipment Reminder — ${planShipmentItems.length} SKU${planShipmentItems.length > 1 ? "s" : ""} need restocking`,
                        notificationText: `${planShipmentItems.map(d => d.sku).join(", ")} — Stock is running low. Prepare your shipment now.`,
                        searchable: planShipmentItems.map(d => d.asin).join(","),
                        seen: false,
                    });
                    await sendNotificationToUser(
                        profileId,
                        `🟡 Shipment Reminder`,
                        `${planShipmentItems.length} SKU${planShipmentItems.length > 1 ? "s" : ""} are approaching reorder point. Plan your shipment.`
                    );
                }

                if (overstockItems.length) {
                    await adNotificationSchema.create({
                        configId,
                        profileId,
                        notificationTitle: `🔵 Overstock Alert — ${overstockItems.length} SKU${overstockItems.length > 1 ? "s" : ""} risking high storage fees`,
                        notificationText: `${overstockItems.map(d => d.sku).join(", ")} — Inventory exceeds coverage target. Consider pausing shipments.`,
                        searchable: overstockItems.map(d => d.asin).join(","),
                        seen: false,
                    });
                    await sendNotificationToUser(
                        profileId,
                        `🔵 Overstock Alert`,
                        `${overstockItems.length} SKU${overstockItems.length > 1 ? "s" : ""} are overstocked and may incur excess storage fees.`
                    );
                }

                // =========================================================
                // 6. Send ONE combined email with Marketplace + FC sections
                //    Only send if at least one alert type has items
                // =========================================================

                const html = buildInventoryForecastAlertEmail({
                    urgentItems,
                    planShipmentItems,
                    overstockItems,
                    warehouseItems: warehouseAlertItems,
                    currency: profile?.countryCode
                });

                const subjectParts = [
                    warehouseAlertItems.length ? `🔴 ${warehouseAlertItems.length} FC Alert${warehouseAlertItems.length > 1 ? "s" : ""}` : "",
                    urgentItems.length ? `🔴 ${urgentItems.length} Critical` : "",
                    planShipmentItems.length ? `🟡 ${planShipmentItems.length} Plan Shipment` : "",
                    overstockItems.length ? `🔵 ${overstockItems.length} Overstock` : "",
                ].filter(Boolean).join(" · ");

                await sendEmailHelper(
                    profile?.user?.email || process.env.RECEIVER_EMAIL,
                    `📦 Inventory Alert — ${subjectParts} — ${moment().format("MMM D")}`,
                    html
                );

                cron_logs({
                    message: `cronInventoryForecastAlerts: Profile ${profileId} → FC:${warehouseAlertItems.length} Urgent:${urgentItems.length} Plan:${planShipmentItems.length} Overstock:${overstockItems.length}`,
                    log_type: "info"
                });

            } catch (profileErr) {
                cron_logs({
                    message: `cronInventoryForecastAlerts: Profile ${profile.profileId} error → ${profileErr.message}`,
                    log_type: "error"
                });
            }
        }));

        await Promise.all(promises);
        cron_logs({ message: "cronInventoryForecastAlerts completed", log_type: "info" });

    } catch (e) {
        cron_logs({ message: `cronInventoryForecastAlerts FAILED → ${e.message}`, log_type: "error" });
    }
};

/**
 * @route POST /api/seller/inventory/get-warehouse-planning
 * Fetches warehouse-wise planning configurations and current inventory for a product
 */
exports.getWarehousePlanning = async (req, res) => {
    try {
        const { profileId, asin, sku } = req.body;

        if (!profileId || (!asin && !sku)) {
            return res.status(200).json({
                isSuccess: false,
                message: "profileId and asin/sku are required.",
                data: [],
            });
        }

        const cleanProfileId = Number(profileId);
        const cleanAsin = asin ? String(asin).trim().toUpperCase() : "";
        const cleanSku = sku ? String(sku).trim() : "";

        // 1. Fetch saved warehouse planning configurations
        const configFilter = { profileId: cleanProfileId };
        if (cleanAsin && cleanSku) {
            configFilter.$or = [{ asin: cleanAsin }, { sku: cleanSku }];
        } else if (cleanAsin) {
            configFilter.asin = cleanAsin;
        } else {
            configFilter.sku = cleanSku;
        }

        const savedConfigs = await warehousePlanningSettingSchema.find(configFilter).lean();
        const configMap = new Map();
        for (const c of savedConfigs) {
            configMap.set(c.warehouseId, c);
        }

        // Fetch global & ASIN defaults for cascading fallback
        const globalSetting = await globalInventorySettingSchema.findOne({ profileId: cleanProfileId }).lean();
        const asinSetting = cleanAsin ? await asinInventorySettingSchema.findOne({ profileId: cleanProfileId, asin: cleanAsin }).lean() : null;

        const defaultTransitDays = asinSetting?.transitDays ?? globalSetting?.transitDays ?? 14;
        const defaultBufferDays = asinSetting?.bufferDays ?? globalSetting?.bufferDays ?? 7;
        const defaultCoverageDays = asinSetting?.coverageDays ?? globalSetting?.coverageDays ?? 30;
        const defaultAlertThreshold = asinSetting?.alertThreshold ?? globalSetting?.alertThreshold ?? 51;

        // 2. Query warehouse inventory from fcInventoryLedger for the latest sync date
        const productCondition = {};
        if (cleanSku && cleanAsin) {
            productCondition.$or = [{ sku: cleanSku }, { asin: cleanAsin }];
        } else if (cleanSku) {
            productCondition.sku = cleanSku;
        } else if (cleanAsin) {
            productCondition.asin = cleanAsin;
        }

        const profileCondition = {
            $or: [{ profileId: cleanProfileId }, { profileId: String(profileId) }]
        };

        // Find the latest reportDate specifically for this product
        let latestLedger = await fcInventoryLedgerSchema.findOne({
            ...profileCondition,
            ...productCondition,
            reportDate: { $exists: true, $ne: null }
        })
            .sort({ reportDate: -1 })
            .select("reportDate")
            .lean();

        // If not found specifically for this SKU/ASIN, fallback to the profile's latest sync date
        if (!latestLedger?.reportDate) {
            latestLedger = await fcInventoryLedgerSchema.findOne({
                ...profileCondition,
                reportDate: { $exists: true, $ne: null }
            })
                .sort({ reportDate: -1 })
                .select("reportDate")
                .lean();
        }

        const targetDate = latestLedger?.reportDate || null;

        const inventoryMap = new Map();
        const inTransitMap = new Map();

        // ONLY aggregate for the latest sync date (never sum across multiple dates)
        if (targetDate) {
            const ledgerMatch = {
                ...profileCondition,
                reportDate: targetDate,
                ...productCondition,
            };

            const ledgerRows = await fcInventoryLedgerSchema.aggregate([
                { $match: ledgerMatch },
                {
                    $group: {
                        _id: "$fcCode",
                        currentQty: { $sum: "$endingWarehouseBalance" },
                        inTransit: { $sum: "$inTransitBetweenWarehouses" },
                    }
                }
            ]);

            for (const row of ledgerRows) {
                inventoryMap.set(row._id, row.currentQty);
                inTransitMap.set(row._id, row.inTransit);
            }
        }

        // Calculate product-level marketplace ADS (weighted 7d/14d/30d) as baseline velocity
        const endDate = moment().format("YYYY-MM-DD");
        const last7DaysDate = moment(endDate).subtract(7, "days").format("YYYY-MM-DD");
        const last14DaysDate = moment(endDate).subtract(14, "days").format("YYYY-MM-DD");
        const last30DaysDate = moment(endDate).subtract(30, "days").format("YYYY-MM-DD");

        const salesProductFilter = [];
        if (cleanAsin) salesProductFilter.push({ asin: cleanAsin });
        if (cleanSku) salesProductFilter.push({ sku: cleanSku });

        const salesMatch = {
            ...profileCondition,
            reportDate: { $gte: last30DaysDate, $lte: endDate },
            ...(salesProductFilter.length > 1 ? { $or: salesProductFilter } : salesProductFilter[0] || {})
        };

        const salesAgg = await businessProductSalesSchema.aggregate([
            { $match: salesMatch },
            {
                $group: {
                    _id: null,
                    last7DaysOrders: { $sum: { $cond: [{ $gte: ["$reportDate", last7DaysDate] }, "$orders", 0] } },
                    last14DaysOrders: { $sum: { $cond: [{ $gte: ["$reportDate", last14DaysDate] }, "$orders", 0] } },
                    last30DaysOrders: { $sum: { $cond: [{ $gte: ["$reportDate", last30DaysDate] }, "$orders", 0] } },
                }
            },
            {
                $addFields: {
                    avg7Days: { $divide: ["$last7DaysOrders", 7] },
                    avg14Days: { $divide: ["$last14DaysOrders", 14] },
                    avg30Days: { $divide: ["$last30DaysOrders", 30] },
                }
            },
            {
                $addFields: {
                    weightedADS: {
                        $add: [
                            { $multiply: ["$avg7Days", 0.5] },
                            { $multiply: ["$avg14Days", 0.3] },
                            { $multiply: ["$avg30Days", 0.2] }
                        ]
                    }
                }
            }
        ]);

        const productMarketplaceAds = salesAgg?.[0]?.weightedADS ? Math.round(salesAgg[0].weightedADS * 100) / 100 : 0;

        // Calculate warehouse-specific daily sales velocity (ADS) from historical customer shipments
        const shipmentMatch = {
            ...profileCondition,
            ...productCondition,
        };

        const shipmentRows = await fcInventoryLedgerSchema.aggregate([
            { $match: shipmentMatch },
            {
                $group: {
                    _id: "$fcCode",
                    totalShipments: { $sum: { $abs: "$customerShipments" } },
                    distinctDates: { $addToSet: "$reportDate" }
                }
            }
        ]);

        const totalLedgerShipments = shipmentRows.reduce((acc, row) => acc + (row.totalShipments || 0), 0);
        const velocityMap = new Map();

        if (totalLedgerShipments > 0) {
            // Distribute product ADS based on historical customer shipment proportions across warehouses
            for (const s of shipmentRows) {
                if (productMarketplaceAds > 0) {
                    const ratio = s.totalShipments / totalLedgerShipments;
                    velocityMap.set(s._id, Math.round(productMarketplaceAds * ratio * 100) / 100);
                } else {
                    const days = Math.max(1, s.distinctDates?.length || 1);
                    const ads = Math.round((s.totalShipments / days) * 100) / 100;
                    velocityMap.set(s._id, ads);
                }
            }
        } else if (productMarketplaceAds > 0) {
            // When ledger customerShipments is 0 (or sync window has 0 ledger outbound records),
            // distribute product ADS proportionally across warehouses holding inventory (currentQty + inTransit)
            let totalStockHeld = 0;
            inventoryMap.forEach((qty, fc) => {
                const transit = inTransitMap.get(fc) || 0;
                totalStockHeld += (qty + transit);
            });

            if (totalStockHeld > 0) {
                inventoryMap.forEach((qty, fc) => {
                    const transit = inTransitMap.get(fc) || 0;
                    const stock = qty + transit;
                    if (stock > 0) {
                        const ratio = stock / totalStockHeld;
                        velocityMap.set(fc, Math.round(productMarketplaceAds * ratio * 100) / 100);
                    } else {
                        velocityMap.set(fc, 0);
                    }
                });
            } else if (inventoryMap.size > 0) {
                const splitAds = Math.round((productMarketplaceAds / inventoryMap.size) * 100) / 100;
                inventoryMap.forEach((_, fc) => velocityMap.set(fc, splitAds));
            }
        }

        // 3. Collect distinct FC codes
        const allFcCodes = new Set();
        Array.from(inventoryMap.keys()).forEach(fc => allFcCodes.add(fc));
        Array.from(velocityMap.keys()).forEach(fc => allFcCodes.add(fc));
        savedConfigs.forEach(c => allFcCodes.add(c.warehouseId));

        // If no SKU-specific FCs found yet, discover active FCs for this profile
        if (allFcCodes.size === 0) {
            const profileFcs = await fcInventoryLedgerSchema.distinct("fcCode", profileCondition);
            profileFcs.forEach(fc => allFcCodes.add(fc));
        }

        // Fallback to marketplace country master FCs if still empty
        if (allFcCodes.size === 0) {
            const profileDoc = await profilesSchema.findOne({ profileId: cleanProfileId }).lean();
            const countryCode = profileDoc?.countryCode || "IN";
            const defaultFcs = await fulfillmentCenterMasterSchema.find({
                $or: [{ country: countryCode }, { countryCode: countryCode }]
            }).limit(12).lean();
            defaultFcs.forEach(fc => allFcCodes.add(fc.fcCode));
        }

        // 4. Resolve metadata for FCs (names, cities, states)
        const fcMetadata = await fulfillmentCenterMasterSchema.find({
            fcCode: { $in: Array.from(allFcCodes) }
        }).lean();

        const metaMap = new Map();
        for (const m of fcMetadata) {
            metaMap.set(m.fcCode, m);
        }

        const missingFcCodes = Array.from(allFcCodes).filter(fc => !metaMap.has(fc));
        if (missingFcCodes.length > 0) {
            const extraMeta = await fulfillmentCenterSchema.find({
                fcCode: { $in: missingFcCodes }
            }).lean();
            for (const m of extraMeta) {
                metaMap.set(m.fcCode, m);
            }
        }

        // 5. Build response list with complete warehouse-wise calculations
        const result = Array.from(allFcCodes).map(fcCode => {
            const saved = configMap.get(fcCode);
            const meta = metaMap.get(fcCode);
            const currentQty = inventoryMap.get(fcCode) || 0;
            const inTransit = inTransitMap.get(fcCode) || 0;
            const ads = velocityMap.get(fcCode) || 0;

            const effectiveTransit = (saved?.transitDays !== undefined && saved?.transitDays !== null && saved?.transitDays !== "")
                ? Number(saved.transitDays) : defaultTransitDays;
            const effectiveBuffer = (saved?.bufferDays !== undefined && saved?.bufferDays !== null && saved?.bufferDays !== "")
                ? Number(saved.bufferDays) : defaultBufferDays;
            const effectiveCoverage = (saved?.coverageDays !== undefined && saved?.coverageDays !== null && saved?.coverageDays !== "")
                ? Number(saved.coverageDays) : defaultCoverageDays;
            const effectiveThreshold = (saved?.alertThreshold !== undefined && saved?.alertThreshold !== null && saved?.alertThreshold !== "")
                ? Number(saved.alertThreshold) : defaultAlertThreshold;

            const totalAvailable = currentQty + inTransit;
            const doi = ads > 0 ? Math.round((totalAvailable / ads) * 100) / 100 : (totalAvailable > 0 ? 999 : 0);
            const rop = Math.round(ads * (effectiveTransit + effectiveBuffer));
            const recommendedQty = Math.max(0, Math.round((ads * (effectiveTransit + effectiveBuffer + effectiveCoverage)) - (currentQty + inTransit)));

            let status = "HEALTHY";
            if (ads <= 0) {
                status = "NO_SALES";
            } else if (doi < effectiveTransit) {
                status = "URGENT";
            } else if (doi < (effectiveTransit + effectiveBuffer)) {
                status = "PLAN_SHIPMENT";
            } else if (doi > (effectiveTransit + effectiveBuffer + effectiveCoverage)) {
                status = "OVERSTOCK";
            }

            let warehouseName = fcCode;
            if (meta?.fcName && meta.fcName !== fcCode) {
                warehouseName = `${fcCode} - ${meta.fcName}`;
            } else if (meta?.city && meta?.state) {
                warehouseName = `${fcCode} - ${meta.city}, ${meta.state}`;
            } else if (meta?.city) {
                warehouseName = `${fcCode} - ${meta.city}`;
            }

            return {
                warehouseId: fcCode,
                warehouseName,
                city: meta?.city || "",
                state: meta?.state || "",
                region: meta?.region || "",
                currentQty,
                inTransit,
                inTransitBetweenWarehouses: inTransit,
                salesPerDay: ads,
                doi: doi === 999 ? "∞" : doi,
                doiNumber: doi,
                reorderPoint: rop,
                recommendedShipmentQty: recommendedQty,
                inventoryForecastStatus: status,
                effectiveTransitDays: effectiveTransit,
                effectiveBufferDays: effectiveBuffer,
                effectiveCoverageDays: effectiveCoverage,
                effectiveAlertThreshold: effectiveThreshold,
                lastSyncDate: targetDate,
                reportDate: targetDate,
                alertThreshold: (saved?.alertThreshold !== undefined && saved?.alertThreshold !== null) ? saved.alertThreshold : "",
                coverageDays: (saved?.coverageDays !== undefined && saved?.coverageDays !== null) ? saved.coverageDays : "",
                transitDays: (saved?.transitDays !== undefined && saved?.transitDays !== null) ? saved.transitDays : "",
                bufferDays: (saved?.bufferDays !== undefined && saved?.bufferDays !== null) ? saved.bufferDays : "",
                isAlertActive: saved?.isAlertActive !== undefined ? Boolean(saved.isAlertActive) : true,
            };
        });

        // Sort by currentQty desc, then salesPerDay desc
        result.sort((a, b) => b.currentQty - a.currentQty || b.salesPerDay - a.salesPerDay || a.warehouseId.localeCompare(b.warehouseId));

        const summary = {
            totalWarehouses: result.length,
            totalCurrentQty: result.reduce((sum, r) => sum + (r.currentQty || 0), 0),
            totalInTransit: result.reduce((sum, r) => sum + (r.inTransit || 0), 0),
            totalRecommendedQty: result.reduce((sum, r) => sum + (r.recommendedShipmentQty || 0), 0),
            urgentCount: result.filter(r => r.inventoryForecastStatus === "URGENT").length,
            planShipmentCount: result.filter(r => r.inventoryForecastStatus === "PLAN_SHIPMENT").length,
            healthyCount: result.filter(r => r.inventoryForecastStatus === "HEALTHY").length,
            overstockCount: result.filter(r => r.inventoryForecastStatus === "OVERSTOCK").length,
            noSalesCount: result.filter(r => r.inventoryForecastStatus === "NO_SALES").length,
        };

        return res.status(200).json({
            isSuccess: true,
            message: "Warehouse planning data fetched successfully.",
            data: result,
            totalWarehouses: result.length,
            summary,
            lastSyncDate: targetDate,
            reportDate: targetDate,
        });
    } catch (error) {
        console.error("getWarehousePlanning error:", error);
        return res.status(500).json({
            isSuccess: false,
            message: error.message || "Failed to fetch warehouse planning data.",
        });
    }
};

/**
 * @route POST /api/seller/inventory/save-warehouse-planning
 * Saves or updates warehouse-wise planning configurations for a product
 */
exports.saveWarehousePlanning = async (req, res) => {
    try {
        const { profileId, asin, sku, warehouses } = req.body;

        if (!profileId || !asin || !sku || !Array.isArray(warehouses)) {
            return res.status(200).json({
                isSuccess: false,
                message: "profileId, asin, sku, and warehouses array are required.",
            });
        }

        const cleanProfileId = Number(profileId);
        const cleanAsin = String(asin).trim().toUpperCase();
        const cleanSku = String(sku).trim();

        const toNullableInt = (val) => {
            if (val === "" || val === null || val === undefined) return null;
            const parsed = parseInt(val, 10);
            return isNaN(parsed) ? null : Math.max(0, parsed);
        };

        // Validate values
        for (const w of warehouses) {
            if (!w.warehouseId) {
                return res.status(200).json({ isSuccess: false, message: "Each warehouse entry must have a warehouseId." });
            }
            if (w.alertThreshold !== undefined && w.alertThreshold !== null && w.alertThreshold !== "" && (isNaN(Number(w.alertThreshold)) || Number(w.alertThreshold) < 0)) {
                return res.status(200).json({ isSuccess: false, message: `Alert Threshold for ${w.warehouseId} must be >= 0.` });
            }
            if (w.coverageDays !== undefined && w.coverageDays !== null && w.coverageDays !== "" && (isNaN(Number(w.coverageDays)) || Number(w.coverageDays) < 0)) {
                return res.status(200).json({ isSuccess: false, message: `Coverage Days for ${w.warehouseId} must be >= 0.` });
            }
            if (w.transitDays !== undefined && w.transitDays !== null && w.transitDays !== "" && (isNaN(Number(w.transitDays)) || Number(w.transitDays) < 0)) {
                return res.status(200).json({ isSuccess: false, message: `Transit Days for ${w.warehouseId} must be >= 0.` });
            }
            if (w.bufferDays !== undefined && w.bufferDays !== null && w.bufferDays !== "" && (isNaN(Number(w.bufferDays)) || Number(w.bufferDays) < 0)) {
                return res.status(200).json({ isSuccess: false, message: `Buffer Days for ${w.warehouseId} must be >= 0.` });
            }
        }

        // Bulk upsert configurations
        const bulkOps = warehouses.map(w => ({
            updateOne: {
                filter: {
                    profileId: cleanProfileId,
                    asin: cleanAsin,
                    sku: cleanSku,
                    warehouseId: String(w.warehouseId).trim().toUpperCase(),
                },
                update: {
                    $set: {
                        profileId: cleanProfileId,
                        asin: cleanAsin,
                        sku: cleanSku,
                        warehouseId: String(w.warehouseId).trim().toUpperCase(),
                        warehouseName: w.warehouseName || "",
                        alertThreshold: toNullableInt(w.alertThreshold),
                        coverageDays: toNullableInt(w.coverageDays),
                        transitDays: toNullableInt(w.transitDays),
                        bufferDays: toNullableInt(w.bufferDays),
                        isAlertActive: w.isAlertActive !== undefined ? Boolean(w.isAlertActive) : true,
                        updatedBy: req?.user?._id,
                    },
                    $setOnInsert: {
                        createdBy: req?.user?._id,
                        isActive: true,
                    }
                },
                upsert: true,
            }
        }));

        if (bulkOps.length > 0) {
            await warehousePlanningSettingSchema.bulkWrite(bulkOps);
        }

        return res.status(200).json({
            isSuccess: true,
            message: "Warehouse planning settings saved successfully.",
        });
    } catch (error) {
        console.error("saveWarehousePlanning error:", error);
        return res.status(500).json({
            isSuccess: false,
            message: error.message || "Failed to save warehouse planning settings.",
        });
    }
};
