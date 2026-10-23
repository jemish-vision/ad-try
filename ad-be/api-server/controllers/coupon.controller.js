const moment = require("moment");
const { retryWithBackoff } = require("../helper/retryHelper");

const fs = require("fs");
const path = require("path");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");

const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));

const couponSchema = require("../models/coupons.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const reportsSchema = require("../models/report.model");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { getActivePlanProfiles, getSPAccessToken, parallelBulkWrite, getRuleDate, downloadFile, unzipReport, getAllowedSyncProfiles } = require("../helper/common");
const amazonAxios = require("../helper/amazonAxios");
const { write_logs } = require("../../winston/utility/logger");

const mapCouponStatus = (coupon) => {
    const now = new Date();

    const start = coupon.startDateTime ? new Date(coupon.startDateTime) : null;
    const end = coupon.endDateTime ? new Date(coupon.endDateTime) : null;

    if (!start || !end) return "UPCOMING";
    if (coupon.isCancelled) return "CANCELLED";
    if (now < start) return "UPCOMING";
    if (now > end) return "EXPIRED";

    const diffHours = (end - now) / (1000 * 60 * 60);
    if (diffHours <= 24) return "EXPIRING_SOON";

    return "RUNNING";
};

const calculateCouponPerformance = (coupon) => {
    const revenue = coupon.sales || 0;
    const couponCost = coupon.budgetSpent || 0;

    const profit = revenue - couponCost;
    const roi = couponCost > 0 ? revenue / couponCost : 0;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    let performanceTag = "NO_DATA";

    if (revenue === 0 && couponCost === 0) performanceTag = "NO_DATA";
    else if (profit > 0 && roi >= 2) performanceTag = "PROFITABLE";
    else if (profit < 0) performanceTag = "LOSS_MAKING";
    else if (roi >= 1 && roi < 2) performanceTag = "BREAKEVEN";
    else performanceTag = "OPTIMIZATION_NEEDED";

    return { performanceTag, performanceMetrics: { revenue, couponCost, profit, roi, margin } };
};

exports.cronListCouponFromAmazon = async (customStartDate = null, customEndDate = null) => {
    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronListCouponFromAmazon`,
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
                    { status: "FAILED" },
                    { new: true }
                );
            }
            return cron_logs({
                message: `Cron Coupon Listing stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const promises = profiles.map((profile) =>
            limit(async () => {
                const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);

                if (!checkSPConfig) {
                    return cron_logs({
                        message: `Account disconnected ${profile.configId}`,
                        log_type: "info",
                    });
                }

                const now = moment().tz(profile.timezone);
                const currentDate = now.format("YYYY-MM-DD");

                let getCronData;
                if (recurring) {
                    getCronData = await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Coupon Listing",
                            historyDate: currentDate
                        },
                        { $set: { status: "PENDING" } },
                        { upsert: true, new: true }
                    ).lean();
                }

                let startDate, endDate;
                if (startDateParam && endDateParam) {
                    startDate = startDateParam;
                    endDate = endDateParam;
                } else {
                    const defaultDates = getRuleDate(profile.timezone, "THIS_MONTH");
                    startDate = defaultDates.fromDate;
                    endDate = defaultDates.toDate;
                }
                const reportSpResponse = await generateSPReport(
                    profile,
                    startDate,
                    endDate,
                    checkSPConfig,
                    recurring
                );
                if (recurring && getCronData?._id && reportSpResponse !== "ERROR") {

                    await cronJobHistorySchema.findByIdAndUpdate(
                        getCronData._id,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                }

                else if (!recurring && cronjobid && reportSpResponse == "COMPLETED") {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true },
                    );
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "Coupon reports generated successfully.",
            log_type: "info",
        });
    }
    catch (error) {
        return cron_logs({
            message: `Coupon reports err: ${error}`,
            log_type: "error",
        });
    }
};

async function generateSPReport(profile, startDate, endDate, token, recurring = true) {
    let existing = null;
    if (recurring) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            reportTypeId: "COUPON",
            status: "PENDING",
            createdAt: { $gte: twentyFourHoursAgo },
        }).sort({ createdAt: -1 }).lean();
    }
    else {
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            startDate: startDate,
            endDate: endDate,
            reportTypeId: "COUPON"
        }).lean();
        if (existing && existing.status == "COMPLETED") return "COMPLETED";
        if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING"].includes(existing?.status)) {
            existing = null;
        }
    }

    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();

    // ✅ CREATE REPORT
    if (!existing) {
        const createResp = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
            headers: {
                "x-amz-access-token": token?.spAccessToken,
                "Content-Type": "application/json",
            },
            data: {
                reportType: "GET_COUPON_PERFORMANCE_REPORT",
                marketplaceIds: [profile.marketplaceStringId],
                dataStartTime: `${startDate}T00:00:00Z`,
                dataEndTime: `${endDate}T23:59:59Z`,
                reportOptions: { campaignStartDateFrom: `${startDate}T00:00:00Z`, campaignStartDateTo: `${endDate}T23:59:59Z` }
            },
            meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
        }));

        await reportsSchema.create({
            profileId: profile.profileId,
            configId: profile.configId,
            reportId: createResp?.data?.reportId,
            startDate: startDate,
            endDate: endDate,
            reportTypeId: "COUPON",
            status: "PENDING"
        });

        return "PENDING";
    }

    // ✅ CHECK STATUS
    const statusRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${existing.reportId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
    }));

    if (statusRes?.data?.processingStatus !== "DONE") {
        return "PENDING";
    }

    // ✅ GET DOCUMENT
    const docRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${statusRes.data.reportDocumentId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
    }));

    const zipPath = path.resolve(__dirname, "../../uploads/coupons", `${existing.reportId}.gz`);
    const extractionPath = zipPath.replace(".gz", ".json");

    await downloadFile(docRes.data.url, zipPath);
    await unzipReport(zipPath, extractionPath);

    await processCouponReportStream(couponSchema, extractionPath, { profileId: profile.profileId, configId: profile.configId });

    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "COMPLETED" } });

    return "COMPLETED";
}

const processCouponReportStream = async (schema, filePath, { profileId, configId }) => {
    const BULK_SIZE = Number(process.env.BATCH || 500);

    return new Promise((resolve, reject) => {

        const pipeline = chain([fs.createReadStream(filePath), parser(), pick({ filter: "coupons" }), streamArray()]);

        let bulkOps = [];

        pipeline.on("data", async ({ value }) => {
            pipeline.pause();

            const { performanceTag, performanceMetrics } = calculateCouponPerformance(value);

            bulkOps.push({
                updateOne: {
                    filter: {
                        configId,
                        profileId,
                        couponId: value.couponId
                    },
                    update: {
                        $set: {
                            configId,
                            profileId,

                            couponId: value?.couponId,
                            merchantId: value?.merchantId,
                            marketplaceId: value?.marketplaceId,

                            name: value?.name,
                            websiteMessage: value?.websiteMessage,

                            currencyCode: value?.currencyCode,

                            discountType: value?.discountType,
                            discountAmount: value?.discountAmount,

                            startDateTime: value?.startDateTime ? new Date(value?.startDateTime) : null,
                            endDateTime: value?.endDateTime ? new Date(value?.endDateTime) : null,

                            budget: value?.budget,
                            budgetSpent: value?.budgetSpent,
                            budgetRemaining: value?.budgetRemaining,

                            clips: value?.clips,
                            redemptions: value?.redemptions,
                            sales: value?.sales,

                            asins: value?.asins?.map(a => a.asin) || [],

                            status: mapCouponStatus(value),

                            performanceTag,
                            performanceMetrics,
                        }
                    },
                    upsert: true
                }
            });

            if (bulkOps.length >= BULK_SIZE) {
                await parallelBulkWrite(schema, bulkOps.splice(0));
            }

            pipeline.resume();
        });

        pipeline.on("end", async () => {
            if (bulkOps.length) {
                await parallelBulkWrite(schema, bulkOps);
            }
            resolve();
        });

        pipeline.on("error", reject);
    });
};

exports.listCouponsGrid = async (req, res) => {
    const configId = req?.config?.configId;

    try {
        let {
            profileId,
            pageNo = 1,
            perPage = 10,
            searchName,
            status,
            performanceTag,
            fromDate,
            toDate,
            sortType,
            fieldName
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const filter = {
            configId,
            profileId: Number(profileId),

            ...(status && { status }),
            ...(performanceTag && { performanceTag }),

            ...(fromDate && toDate && {
                startDateTime: {
                    $gte: new Date(fromDate),
                    $lte: new Date(toDate)
                }
            })
        };

        const pipeline = [
            { $match: filter },

            ...(searchName ? [{
                $match: {
                    $or: [
                        { name: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                        { asins: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } }
                    ]
                }
            }] : []),

            {
                $lookup: {
                    from: "productlistings",
                    let: { asinList: "$asins" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ["$asin", "$$asinList"]
                                }
                            }
                        },
                        {
                            $project: {
                                asin: 1,
                                itemName: 1,
                                imageURL: 1,
                                sku: 1
                            }
                        }
                    ],
                    as: "productData"
                }
            },

            ...(searchName ? [{
                $match: {
                    $or: [
                        { name: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                        { asins: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                        { "productData.itemName": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } }
                    ]
                }
            }] : []),

            {
                $project: {
                    _id: 0,
                    couponId: 1,
                    name: 1,
                    websiteMessage: 1,

                    status: 1,
                    performanceTag: 1,

                    discountType: 1,
                    discountAmount: 1,

                    startDateTime: 1,
                    endDateTime: 1,

                    budget: 1,
                    budgetSpent: { $round: ["$budgetSpent", 2] },
                    budgetRemaining: { $round: ["$budgetRemaining", 2] },

                    clips: 1,
                    redemptions: 1,
                    sales: { $round: ["$sales", 2] },

                    performanceMetrics: 1,

                    asins: 1,
                    productData: 1,

                    createdAt: 1
                }
            },

            ...(sortType && fieldName
                ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }]
                : [{ $sort: { startDateTime: -1 } }]),

            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [
                        { $skip: (pageNo - 1) * perPage },
                        { $limit: perPage }
                    ]
                }
            }
        ];

        const result = await couponSchema.aggregate(pipeline);

        const totalRecords = result[0]?.metadata[0]?.total || 0;
        const data = result[0]?.data || [];

        return res.status(200).send({
            isSuccess: true,
            data,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage)
        });

    } catch (error) {
        write_logs({ message: `[listCouponsGrid Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};