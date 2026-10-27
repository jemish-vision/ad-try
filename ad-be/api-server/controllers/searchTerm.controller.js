const { getConditionRows, captureManualSelection, prepareSnapshotBulkUpdates } = require("../helpers/ruleConditionSnapshotHelper");
const { validateCampaignAssignment } = require("../helper/ruleCampaignAssignment");

const { sanitizeQueryObject } = require("../helper/sanitizeQuery");
const moment = require("moment-timezone");
const { default: mongoose } = require("mongoose");
const { retryWithBackoff } = require("../helper/retryHelper");
const crypto = require("crypto");

const fs = require("fs");
const zlib = require("node:zlib");
const path = require("path");
const axios = require("axios");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));
const ExcelJS = require("exceljs");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");

const campaignSchema = require("../models/campaign.model");
const adGroupSchema = require("../models/adGroups.model");
const profileSchema = require("../models/profiles.model");
const targetingSchema = require("../models/targeting.model");
const searchTermSchema = require("../models/searchTerm.model");
const searchTermAppliedSchema = require("../models/searchTermApplied.model");
const searchTermBlockSchema = require("../models/searchTermBlocked.model");
const searchTermDeletedSchema = require("../models/searchTermDeleted.model");
const camapignSettingSchema = require("../models/camapignSetting.model");

const reportsSchema = require("../models/report.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const searchTermRuleSchema = require("../models/searchTermRules.model");
const searchTermRuleHistorySchema = require("../models/searchTermRuleHistory.model");
const affectedCampaignByRuleSchema = require("../models/affectedCampaignByRule.model");
const { recordRuleExecutionChange, enrichWithCampaignMetrics } = require("../helpers/ruleImpactMetricsHelper");
const newProfileSyncSchema = require("../models/newProfileSync.model");

const sbSearchTermSchema = require("../models/sbSearchTerm.model");
const sdSearchTermSchema = require("../models/sdSearchTerm.model");

const sbCampaignSchema = require("../models/sbCampaign.model");
const sdCampaignSchema = require("../models/sdCampaign.model");
const { write_logs } = require("../../winston/searchTerm/logger");

const {
    getProfile,
    getAccessToken,
    unzipReport,
    calcMetrics,
    getSPAccessToken,
    buildFieldFilter,
    safeJSON,
    getActivePlanProfiles,
    getRuleDate,
    getNextTime,
    isValidASIN,
    downloadFile,
    parallelBulkWrite,
    removeCampaignIdFromQuery,
    getAxiosErrorMessage,
    safeJsonParse,
    getAllowedSyncProfiles,
} = require("../helper/common");

const { cron_logs } = require("../../winston/cronAutomation/logger");

const amazonAxios = require("../helper/amazonAxios");
const { isDuplicateSearchTermRule, checkDuplicateSearchTermRule } = require("../helper/ruleChecker");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { getSuggestedBid } = require("../helper/recommendation");
const { logAudit } = require("../helpers/auditHelper");
const { stageReportFileInRedis } = require("../services/reportFileStager.service");
const { processStagedReportBatches } = require("../services/reportBatchWriter.service");
const { getRunManifest } = require("../services/reportStaging.service");
const { linkReportHistory } = require("../services/reportHistoryCompletion.service");

exports.cronGenerateSearchTermReport = async (generateWeeklyReport = false, generateBiWeeklyReport = false, pastSyncObj = null) => {
    try {
        if (typeof generateBiWeeklyReport === "object" && generateBiWeeklyReport !== null) {
            pastSyncObj = generateBiWeeklyReport;
            generateBiWeeklyReport = false;
        }

        const { profileId, configId, cronjobid, recurring = true } = pastSyncObj ?? {};
        const cronName = generateBiWeeklyReport
            ? "BiWeekly Report"
            : generateWeeklyReport || pastSyncObj != null
            ? "Weekly Report"
            : "Search Term Report";

        const allowedProfiles = await getAllowedSyncProfiles("TARGETING", "ads", recurring);
        const getProfileId = (await profileSchema.find({ isActive: true, isAdsSyncEnabled: true, ...(profileId && { profileId }), ...(configId && { configId }) }).lean())
            .filter((p) =>
                allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
            );

        if (!getProfileId || getProfileId.length === 0) {
            if (cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "FAILED" },
                    { new: true }
                );
            }
            return cron_logs({
                message: `Cron Search Term Report stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
                log_type: "warn"
            });
        }

        cron_logs({
            message: `[${cronName}] Cron started for ${getProfileId.length} profile(s). (Weekly: ${generateWeeklyReport}, BiWeekly: ${generateBiWeeklyReport}, Recurring: ${recurring})`,
            log_type: "info"
        });

        const reportPromises = getProfileId.map((profile) => limit(async () => {
            if (global.updateTaskProgress) global.updateTaskProgress(generateBiWeeklyReport ? "BiWeekly Report" : generateWeeklyReport ? "Weekly Report" : "Search Term Report");
            const checkConfigAds = await getAccessToken(profile.configId);
            if (
                checkConfigAds &&
                checkConfigAds.adsAccessToken
            ) {
                const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");
                let startDate = currentDate;
                let endDate = currentDate;

                if (generateBiWeeklyReport) {
                    startDate = moment(currentDate).subtract(14, "days").format("YYYY-MM-DD");
                    endDate = moment(currentDate).subtract(1, "days").format("YYYY-MM-DD");
                } else if (generateWeeklyReport) {
                    startDate = moment(currentDate).subtract(9, "days").format("YYYY-MM-DD");
                    endDate = moment(currentDate).subtract(1, "days").format("YYYY-MM-DD");
                }

                if (pastSyncObj) {
                    if (pastSyncObj.startDate) startDate = pastSyncObj.startDate;
                    if (pastSyncObj.endDate) endDate = pastSyncObj.endDate;
                }

                let getCronData;
                if (recurring) {
                    getCronData = await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: cronName,
                            historyDate: currentDate,
                        },
                        {
                            $set: {
                                status: "PENDING",
                            }
                        },
                        { new: true, upsert: true }
                    ).lean();
                }
                const reportSpResponse = await spGenerateReport(
                    profile.profileId,
                    startDate,
                    endDate,
                    checkConfigAds,
                    profile.configId,
                    profile.timezone,
                    profile.currencyCode,
                    recurring
                );

                cron_logs({
                    message: `[Search Term Report: Sponsored Products] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSpResponse}`,
                    log_type: "info"
                });

                const reportSbResponse = await sbGenerateReport(
                    profile.profileId,
                    startDate,
                    endDate,
                    checkConfigAds,
                    profile.configId,
                    profile.timezone,
                    recurring
                );

                cron_logs({
                    message: `[Search Term Report: Sponsored Brands] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSbResponse}`,
                    log_type: "info"
                });

                await linkReportHistory({
                    historyId: getCronData?._id || cronjobid,
                    configId: profile.configId, profileId: profile.profileId,
                    reportName: "SEARCHTERM", startDate, endDate,
                });

                // Update cron history based on report response
                if (reportSpResponse === "ERROR" || reportSbResponse === "ERROR") {
                    if (recurring && getCronData?._id) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "FAILED" },
                            { new: true }
                        );
                    } else if (cronjobid) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: "FAILED" },
                            { new: true }
                        );
                    }
                    return "ERROR";
                } else if (reportSpResponse === "COMPLETED" && reportSbResponse === "COMPLETED") {
                    if (recurring && getCronData?._id) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    } else if (cronjobid) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    }
                    if (pastSyncObj) {
                        await newProfileSyncSchema.findOneAndUpdate(
                            {
                                profileId: pastSyncObj.profileId,
                                configId: pastSyncObj.configId
                            },
                            {
                                $set: { sync: "C" }
                            },
                            { new: true, upsert: true }
                        ).lean();
                    }
                    return "COMPLETED";
                }
                return reportSpResponse;

            } else {
                return cron_logs({
                    message: `[Search Term Report] Profile ${profile.name} (${profile.profileId}): Account credentials invalid or disconnected.`,
                    log_type: "info"
                });
            }
        }))

        await Promise.all(reportPromises);

        return cron_logs({
            message: `[Search Term Report] Cron finished successfully for ${getProfileId.length} profile(s).`,
            log_type: "info"
        });

    } catch (error) {
        return cron_logs({
            message: `[Search Term Report] Error during cron execution: ${error.stack || error.message || error}`,
            log_type: "error"
        });
    }
};

async function spGenerateReport(
    profileId,
    startDate,
    endDate,
    checkConfigAds,
    configId,
    timezone,
    currencyCode,
    recurring = false
) {
    try {
        const getAccount = await getProfile(configId, profileId);

        let existing;
        if (!recurring) {
            existing = await reportsSchema.findOne({
                startDate,
                endDate,
                profileId,
                configId,
                reportTypeId: "spSearchTerm",
                reportName: "SEARCHTERM",
            }).lean();

            if (existing && existing.status == "COMPLETED") return "COMPLETED";
        } else {
            // 1️⃣ Check recent pending report (created within last 24 hours)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            existing = await reportsSchema.findOne({
                profileId,
                configId,
                reportTypeId: "spSearchTerm",
                reportName: "SEARCHTERM",
                $or: [
                    { status: "PENDING", createdAt: { $gte: twentyFourHoursAgo } },
                    { status: "STAGED" },
                ],
            }).sort({ createdAt: -1 }).lean();
        }

        if (!existing) {
            let createResp;
            try {
                const isVendor = getAccount?.type?.toLowerCase() === "vendor";
                const purchasesCol = isVendor ? "purchases14d" : "purchases7d";
                const salesCol = isVendor ? "sales14d" : "sales7d";
                createResp = await retryWithBackoff(() => amazonAxios({
                    method: "POST",
                    url: `${getAccount.amazonUrl}/reporting/reports`,
                    headers: {
                        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                        "Amazon-Advertising-API-Scope": profileId,
                        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                        "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
                    },
                    data: {
                        name: "",
                        startDate: startDate,
                        endDate: endDate,
                        configuration: {
                            adProduct: "SPONSORED_PRODUCTS",
                            groupBy: ["searchTerm"],
                            columns: [
                                "impressions",
                                "clicks",
                                "cost",
                                "campaignId",
                                "adGroupId",
                                "date",
                                "targeting",
                                "searchTerm",
                                "keywordType",
                                "keywordId",
                                "costPerClick",
                                "clickThroughRate",
                                "sales1d",
                                salesCol,
                                "campaignName",
                                "campaignStatus",
                                "adGroupName",
                                "keywordBid",
                                purchasesCol,
                                "purchases1d"
                            ],
                            reportTypeId: "spSearchTerm",
                            timeUnit: "DAILY",
                            format: "GZIP_JSON",
                        },
                    },
                    meta: { configId, tokenKey: "adsAccessToken" },
                }));
            } catch (createErr) {
                cron_logs({
                    message: `[SearchTerm Report SP] Report creation failed for profile ${profileId}: ${createErr.message || createErr}`,
                    log_type: "warn"
                });
                return "ERROR";
            }

            await reportsSchema.create({
                profileId,
                configId,
                reportId: createResp?.data?.reportId,
                startDate: createResp?.data?.startDate,
                endDate: createResp?.data?.endDate,
                status: createResp?.data?.status,
                adProduct: createResp?.data?.configuration?.adProduct,
                reportTypeId: createResp?.data?.configuration?.reportTypeId,
                reportName: "SEARCHTERM",
            });

            return createResp.data.status;
        }

        if (existing.status === "STAGED" && existing.importRunId && await getRunManifest(existing.importRunId)) {
            return "STAGED";
        }

        // 2️⃣ Poll status
        const statusResp = await retryWithBackoff(() => amazonAxios({
            method: "GET",
            url: `${getAccount.amazonUrl}/reporting/reports/${existing.reportId}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
            },
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (statusResp.data.status !== "COMPLETED") {
            return statusResp.data.status;
        }

        // 3️⃣ Download file
        const zipPath = path.resolve(__dirname, "../../uploads/search-term/sp-report", `${existing.reportId}.gz.json`);
        const extractionPath = zipPath.replace(".gz.json", ".json");

        await downloadFile(statusResp.data.url, zipPath);
        await unzipReport(zipPath, extractionPath);

        // The writer marks this report COMPLETED only after MongoDB verification.
        await stageSearchTermReport({
            entity: "searchTerm", existing, extractionPath, profileId, configId,
            accountType: getAccount?.type, startDate, endDate,
        });
        return "STAGED";

    } catch (err) {
        cron_logs({
            message: `[SearchTerm Report SP] Processing failed for profile ${profileId}: ${err.message || err}`,
            log_type: "warn"
        });
        return "ERROR";
    }
};

async function sbGenerateReport(
    profileId,
    startDate,
    endDate,
    checkConfigAds,
    configId,
    timezone,
    currencyCode,
    recurring = false
) {
    try {
        const getAccount = await getProfile(configId, profileId);

        let existing;
        if (!recurring) {
            existing = await reportsSchema.findOne({
                startDate,
                endDate,
                profileId,
                configId,
                reportTypeId: "sbSearchTerm",
                reportName: "SEARCHTERM",
            }).lean();

            if (existing && existing.status == "COMPLETED") return "COMPLETED";
        } else {
            // 1️⃣ Check recent pending report (created within last 24 hours)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            existing = await reportsSchema.findOne({
                profileId,
                configId,
                reportTypeId: "sbSearchTerm",
                reportName: "SEARCHTERM",
                $or: [
                    { status: "PENDING", createdAt: { $gte: twentyFourHoursAgo } },
                    { status: "STAGED" },
                ],
            }).sort({ createdAt: -1 }).lean();
        }

        if (!existing) {
            let createResp;
            try {
                createResp = await retryWithBackoff(() => amazonAxios({
                    method: "POST",
                    url: `${getAccount.amazonUrl}/reporting/reports`,
                    headers: {
                        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                        "Amazon-Advertising-API-Scope": profileId,
                        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                        "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
                    },
                    data: {
                        name: "",
                        startDate: startDate,
                        endDate: endDate,
                        configuration: {
                            adProduct: "SPONSORED_BRANDS",
                            groupBy: ["searchTerm"],
                            columns: [
                                "impressions",
                                "clicks",
                                "cost",
                                "campaignId",
                                "adGroupId",
                                "date",
                                // "targeting",
                                "keywordText",
                                "searchTerm",
                                "keywordType",
                                "keywordId",
                                "sales",
                                "campaignName",
                                "campaignStatus",
                                "adGroupName",
                                // "keywordBid",
                                "purchases"
                            ],
                            reportTypeId: "sbSearchTerm",
                            timeUnit: "DAILY",
                            format: "GZIP_JSON",
                        },
                    },
                    meta: { configId, tokenKey: "adsAccessToken" },
                }));
            } catch (createErr) {
                cron_logs({
                    message: `[SearchTerm Report SB] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(createErr)}`,
                    log_type: "warn"
                });
                return "ERROR";
            }

            await reportsSchema.create({
                profileId,
                configId,
                reportId: createResp?.data?.reportId,
                startDate: createResp?.data?.startDate,
                endDate: createResp?.data?.endDate,
                status: createResp?.data?.status,
                adProduct: createResp?.data?.configuration?.adProduct,
                reportTypeId: createResp?.data?.configuration?.reportTypeId,
                reportName: "SEARCHTERM",
            });

            return createResp.data.status;
        }

        if (existing.status === "STAGED" && existing.importRunId && await getRunManifest(existing.importRunId)) {
            return "STAGED";
        }

        // 2️⃣ Poll status
        const statusResp = await retryWithBackoff(() => amazonAxios({
            method: "GET",
            url: `${getAccount.amazonUrl}/reporting/reports/${existing.reportId}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
            },
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (statusResp.data.status !== "COMPLETED") {
            return statusResp.data.status;
        }

        // 3️⃣ Download file
        const zipPath = path.resolve(__dirname, "../../uploads/search-term/sb-report", `${existing.reportId}.gz.json`);
        const extractionPath = zipPath.replace(".gz.json", ".json");

        await downloadFile(statusResp.data.url, zipPath);
        await unzipReport(zipPath, extractionPath);

        await stageSearchTermReport({
            entity: "sbSearchTerm", existing, extractionPath, profileId, configId,
            accountType: getAccount?.type, startDate, endDate,
        });
        return "STAGED";

    } catch (err) {
        cron_logs({
            message: `[SearchTerm Report SB] Processing failed for profile ${profileId}: ${err.message || err}`,
            log_type: "warn"
        });
        return "ERROR";
    }
};

const stageSearchTermReport = async ({
    entity, existing, extractionPath, profileId, configId, accountType, startDate, endDate,
}) => {
    const importRunId = `run_${entity}_${existing.reportId}_${Date.now()}`;
    try {
        await stageReportFileInRedis({
            importRunId,
            entity,
            filePath: extractionPath,
            meta: {
                profileId,
                configId,
                accountType,
                reportId: existing.reportId,
                reportTypeId: existing.reportTypeId,
                startDate,
                endDate,
                reportCreatedAt: existing.createdAt,
            },
        });
        await reportsSchema.updateOne(
            { _id: existing._id },
            { $set: { status: "STAGED", importRunId } },
        );
        processStagedReportBatches([entity]).catch((err) => {
            cron_logs({
                message: `[SearchTerm Report ${entity}] Background batch writer failed: ${err.message}`,
                log_type: "error",
            });
        });
    } catch (err) {
        cron_logs({
            message: `[SearchTerm Report ${entity}] Staging failed for ${existing.reportId}: ${err.message}`,
            log_type: "error",
        });
        await reportsSchema.updateOne(
            { _id: existing._id },
            { $set: { status: "FAILED" } },
        );
        throw err;
    }
};

const processReportFileStream = async (
    schema,
    filePath,
    {
        profileId,
        configId,
    }
) => {
    BULK_SIZE = Number(process.env.BATCH);
    return new Promise((resolve, reject) => {

        const pipeline = chain([
            fs.createReadStream(filePath),
            parser(),
            streamArray(),
        ]);

        let bulkOps = [];

        pipeline.on("data", async ({ value }) => {

            pipeline.pause();

            let targetIdPrefix = "K";
            if (["TARGETING_EXPRESSION_PREDEFINED", "TARGETING_EXPRESSION"].includes(value.keywordType)) {
                targetIdPrefix = "T";
            }

            const baseData = {
                impressions: value.impressions,
                clicks: value.clicks,
                spend: value.spend || value.cost || 0,
                sales: value.sales7d || value.sales || 0,
                orders: value.purchases7d || value.purchases || 0,
            };

            const metrics = calcMetrics(baseData);

            bulkOps.push({
                updateOne: {
                    filter: {
                        profileId,
                        configId,
                        campaignId: value.campaignId,
                        adGroupId: value.adGroupId,
                        keywordId: value.keywordId,
                        searchTerm: value.searchTerm,
                        keywordType: value.keywordType,
                        reportDate: value.date,
                    },
                    update: {
                        $set: {
                            campaignName: value.campaignName,
                            adGroupName: value.adGroupName,
                            prefix: targetIdPrefix,
                            keywordType: value.keywordType,
                            targeting: value.targeting || value.keywordText,
                            status: value.campaignStatus.toUpperCase(),

                            impressions: value.impressions,
                            clicks: value.clicks,
                            sales: value.sales7d || value.sales || 0,
                            spend: value.spend || value.cost || 0,
                            orders: value.purchases7d || value.purchases || 0,

                            ...metrics
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
};

exports.saveSearchTermData = async (req, res) => {
    try {
        const { date } = req.body;

        const getProfileId = await profileSchema.find({ isActive: true }).lean();
        const workerPromises = await Promise.all(
            getProfileId.map((profile) => limit(async () => {
                const checkConfigAds = await getAccessToken(profile.configId);
                if (
                    checkConfigAds &&
                    checkConfigAds.adsAccessToken
                ) {
                    return new Promise(async (resolve, reject) => {
                        const startDate = date;
                        const endDate = date;
                        const reportSpResponse = await spGenerateReport(
                            profile.profileId,
                            startDate,
                            endDate,
                            checkConfigAds,
                            profile.configId,
                            profile.timezone
                        );
                        return res.status(200).json({ success: true, reportSpResponse: reportSpResponse, message: "SearchTerm report generated successfully." })
                    });
                } else {
                    return res.status(200).json({
                        success: false, message: `Account disconnected in report ${profile.configId
                            }, Config: ${checkConfigAds}`,
                    })
                }
            }))
        );
        await Promise.all(workerPromises);
    } catch (error) {
        write_logs({ message: `[saveSearchTermData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({ status: false, message: error?.message })
    }
};

// exports.getSearchTermDetailsData = async (req, res) => {
//     try {
//         const id = Number(req.params.id);
//         const configId = req?.config?.configId;
//         let { searchTermPageNo, searchTermPerPage, fromDate, toDate, profileId, status } = req.body;
//         searchTermPageNo = searchTermPageNo ? searchTermPageNo : 1;
//         searchTermPerPage = searchTermPerPage ? searchTermPerPage : 10;
//         let filter = {
//             campaignId: id,
//             profileId: Number(profileId),
//             configId: new ObjectId(configId),
//         };
//         if (fromDate && toDate) {
//             filter.reportDate = { $gte: fromDate, $lte: toDate };
//         }
//         if (status) {
//             filter.status = status;
//         }
//         if (!profileId) {
//             return res
//                 .status(203)
//                 .send({ message: "Profile id required!", isSuccess: false });
//         }
//         const searchTermPipeline = [
//             {
//                 $match: filter
//             },
//             {
//                 $sort: { reportDate: -1 }
//             },
//             {
//                 $group: {
//                     _id: "$campaignId",
//                     searcTerm: {
//                         $first: "$$ROOT",
//                     }
//                 },
//             },
//             {
//                 $project: {
//                     _id: 0,
//                     searcTerm: "$searcTerm",
//                     campaignName: "$searcTerm.campaignName",
//                     campaignId: "$searcTerm.campaignId",
//                     status: "$searcTerm.status",
//                     searchTerm: "$searcTerm.searchTerm",
//                 },
//             },
//             {
//                 $lookup: {
//                     from: "product_ads",
//                     let: { campaignId: "$campaignId" },
//                     pipeline: [
//                         {
//                             $match: {
//                                 $expr: { $eq: ["$campaignId", "$$campaignId"] }, // match joined docs
//                                 profileId: profileId,
//                                 configId: configId,
//                                 reportDate: { $gte: fromDate, $lte: toDate }
//                             }
//                         },
//                         {
//                             $match: {
//                                 asins: { $exists: true, $ne: null, $not: { $size: 0 } }
//                             }
//                         },
//                         {

//                             $unwind: {
//                                 path: "$asins",
//                                 preserveNullAndEmptyArrays: false
//                             }
//                         },
//                         {
//                             $group: {
//                                 _id: "$asins",
//                                 productAds: {
//                                     $first: "$$ROOT",
//                                 },
//                                 totalSpend: { $sum: "$spend" },
//                                 totalSales: { $sum: "$sales" },
//                                 totalImpressions: { $sum: "$impressions" },
//                                 totalOrders: { $sum: "$orders" },
//                                 totalCpc: { $sum: "$cpc" },
//                                 totalClicks: { $sum: "$clicks" },
//                             }
//                         },
//                         {
//                             $project: {
//                                 _id: 0,
//                                 status: "$productAds.status",
//                                 asins: "$productAds.asins",
//                                 sku: "$productAds.sku",
//                                 totalSpend: { $round: ["$totalSpend", 2] },
//                                 totalSales: { $round: ["$totalSales", 2] },
//                                 totalImpressions: { $round: ["$totalImpressions", 2] },
//                                 totalOrders: { $round: ["$totalOrders", 2] },
//                                 totalCpc: { $round: ["$totalCpc", 2] },
//                                 totalClicks: { $round: ["$totalClicks", 2] },
//                                 totalCtr: {
//                                     $round: [
//                                         {
//                                             $cond: {
//                                                 if: { $gt: ["$totalImpressions", 0] },
//                                                 then: {
//                                                     $multiply: [
//                                                         { $divide: ["$totalClicks", "$totalImpressions"] },
//                                                         100,
//                                                     ],
//                                                 },
//                                                 else: 0,
//                                             },
//                                         },
//                                         2,
//                                     ],
//                                 },
//                                 totalCvr: {
//                                     $round: [
//                                         {
//                                             $cond: {
//                                                 if: { $gt: ["$totalClicks", 0] },
//                                                 then: {
//                                                     $multiply: [
//                                                         { $divide: ["$totalOrders", "$totalClicks"] },
//                                                         100,
//                                                     ],
//                                                 },
//                                                 else: 0,
//                                             },
//                                         },
//                                         2,
//                                     ],
//                                 },
//                                 totalAcos: {
//                                     $round: [
//                                         {
//                                             $cond: {
//                                                 if: { $gt: ["$totalSales", 0] },
//                                                 then: {
//                                                     $multiply: [
//                                                         { $divide: ["$totalSpend", "$totalSales"] },
//                                                         100,
//                                                     ],
//                                                 },
//                                                 else: 0,
//                                             },
//                                         },
//                                         2,
//                                     ],
//                                 },
//                                 totalRoas: {
//                                     $round: [
//                                         {
//                                             $cond: {
//                                                 if: { $gt: ["$totalSpend", 0] },
//                                                 then: { $divide: ["$totalSales", "$totalSpend"] },
//                                                 else: 0,
//                                             },
//                                         },
//                                         2,
//                                     ],
//                                 },
//                             },
//                         },
//                         {
//                             $lookup: {
//                                 from: "products", // collection with asin, sku
//                                 localField: "asins",
//                                 foreignField: "asin",
//                                 as: "product_details",
//                                 pipeline: [
//                                     {
//                                         $match: {
//                                             profileId: profileId,
//                                             configId: configId,
//                                             reportDate: { $gte: fromDate, $lte: toDate }
//                                         }
//                                     },
//                                     {
//                                         $group: {
//                                             _id: "$asin",
//                                             product: {
//                                                 $first: "$$ROOT",
//                                             },
//                                         }
//                                     },
//                                     {
//                                         $project: {
//                                             imageUrl: "$product.imageUrl",
//                                             amount: "$product.amount",
//                                             productName: "$product.title",
//                                         }
//                                     },
//                                 ]
//                             }
//                         },
//                         {
//                             $match: {
//                                 product_details: { $exists: true, $ne: null, $not: { $size: 0 } }
//                             }
//                         },
//                         {
//                             $unwind: {
//                                 path: "$product_details",
//                                 preserveNullAndEmptyArrays: false
//                             }
//                         }
//                     ],
//                     as: "productAds"
//                 }
//             },
//             // Step 5: Unwind productAds to process each ad
//             {
//                 $match: {
//                     productAds: { $exists: true, $ne: null, $not: { $size: 0 } }
//                 }
//             },
//             {
//                 $unwind: {
//                     path: "$productAds",
//                     preserveNullAndEmptyArrays: true // Preserve if no productAds match
//                 }
//             },
//             {
//                 $project: {
//                     _id: "$searcTerm._id",
//                     adGroupId: "$searcTerm.adGroupId",
//                     campaignId: "$searcTerm.campaignId",
//                     campaignName: 1,
//                     sku: "$productAds.sku",
//                     asin: "$productAds.asins",
//                     searchTerm: 1,
//                     status: 1,
//                     totalSpend: "$productAds.totalSpend",
//                     totalSales: "$productAds.totalSales",
//                     totalImpressions: "$productAds.totalImpressions",
//                     totalCpc: "$productAds.totalCpc",
//                     totalOrders: "$productAds.totalOrders",
//                     totalClicks: "$productAds.totalClicks",
//                     totalCvr: "$productAds.totalCvr",
//                     totalCtr: "$productAds.totalCtr",
//                     totalAcos: "$productAds.totalAcos",
//                     totalRoas: "$productAds.totalRoas",
//                     status: "$searcTerm.status",
//                     imageUrl: { $ifNull: ["$productAds.product_details.imageUrl", null] },
//                     amount: { $ifNull: ["$productAds.product_details.amount", 0] },
//                     productName: { $ifNull: ["$productAds.product_details.productName", null] }
//                 }
//             },
//             {
//                 $facet: {
//                     paginatedResults: [
//                         { $skip: searchTermPerPage * searchTermPageNo - searchTermPerPage },
//                         { $limit: searchTermPerPage },
//                     ],
//                     totalCount: [{ $count: "count" }],
//                 },
//             },
//         ]
//         const searchTermResult = await searchTermSchema.aggregate(searchTermPipeline);
//         const getSearchTermData = searchTermResult[0].paginatedResults;

//         const totalSearchTermData =
//             searchTermResult[0].totalCount.length > 0
//                 ? searchTermResult[0].totalCount[0].count
//                 : 0;
//         return res.status(200).send({
//             getSearchTermData,
//             totalSearchTermData,
//             searchTermCurrentPageNo: searchTermPageNo,
//             searchTermTotalPages: Math.ceil(totalSearchTermData / searchTermPerPage),
//             message: "Get search term details data successfully.",
//             isSuccess: true,
//         });
//     } catch (error) {
// write_logs({ message: `[getSearchTermDetailsData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
///         return res.status(203).send({
//             message: "Something went wrong, please try again!",
//             isSuccess: false,
//             error: "An internal server error occurred",
//         });
//     }
// };

exports.getSearchTermDetailsData = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const { adTypeSearchTermSchema } = req.models || { adTypeSearchTermSchema: searchTermSchema };
        const targetSchema = adTypeSearchTermSchema || searchTermSchema;

        let { searchTermPageNo, searchTermPerPage, fromDate, toDate, profileId, status, fieldName, sortType } = req.body;

        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();

        searchTermPageNo = searchTermPageNo ? searchTermPageNo : 1;
        searchTermPerPage = searchTermPerPage ? searchTermPerPage : 10;
        const skip = (searchTermPageNo - 1) * searchTermPerPage;

        let sortingField = fieldName ? fieldName : "productName";
        let sortingOrder = sortType && sortType.toUpperCase() === "DESC" ? -1 : 1;

        let filter = {
            campaignId: !isNaN(id) ? id : req.params.id,
            profileId: Number(profileId),
            ...(configId && mongoose.Types.ObjectId.isValid(configId) && { configId: new mongoose.Types.ObjectId(configId) }),
        };
        if (fromDate && toDate) {
            filter.reportDate = { $gte: fromDate, $lte: toDate };
        }
        if (status) {
            filter.status = status;
        }
        if (!profileId) {
            return res
                .status(203)
                .send({ message: "Profile id required!", isSuccess: false });
        }

        const getSearchTermData = await targetSchema.aggregate([
            { $match: filter },

            {
                $group: {
                    _id: {
                        adGroupId: "$adGroupId",
                        campaignId: "$campaignId",
                        searchTerm: "$searchTerm"
                    },
                    title: { $first: "$title" },
                    status: { $first: "$status" },

                    totalSpend: { $sum: "$spend" },
                    totalSales: { $sum: "$sales" },
                    totalImpressions: { $sum: "$impressions" },
                    totalOrders: { $sum: "$orders" },
                    totalClicks: { $sum: "$clicks" },
                    totalCpc: { $sum: "$cpc" },
                }
            },

            {
                $project: {
                    adGroupId: "$_id.adGroupId",
                    campaignId: "$_id.campaignId",
                    searchTerm: "$_id.searchTerm",

                    title: 1,
                    status: 1,

                    totalSpend: 1,
                    totalSales: 1,
                    totalImpressions: 1,
                    totalOrders: 1,
                    totalClicks: 1,
                    totalCpc: 1,

                    totalCtr: {
                        $cond: [
                            { $gt: ["$totalImpressions", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] }, 2] },
                            0
                        ]
                    },

                    totalCvr: {
                        $cond: [
                            { $gt: ["$totalClicks", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$totalOrders", "$totalClicks"] }, 100] }, 2] },
                            0
                        ]
                    },

                    totalAcos: {
                        $cond: [
                            { $gt: ["$totalSales", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] }, 2] },
                            0
                        ]
                    },

                    totalRoas: {
                        $cond: [
                            { $gt: ["$totalSpend", 0] },
                            { $round: [{ $divide: ["$totalSales", "$totalSpend"] }, 2] },
                            0
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "searchTerm",
                    foreignField: "asin",
                    as: "productDetails"
                }
            },
            {
                $unwind: {
                    path: "$productDetails",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    searchTerm: 1,
                    title: 1,
                    status: 1,
                    totalSpend: 1,
                    totalSales: 1,
                    totalImpressions: 1,
                    totalOrders: 1,
                    totalClicks: 1,
                    totalCpc: 1,
                    totalCtr: 1,
                    totalCvr: 1,
                    totalAcos: 1,
                    totalRoas: 1,
                    productName: { $ifNull: ["$productDetails.title", "$searchTerm"] },
                    imageUrl: "$productDetails.mainImage.link"
                }
            },
            {
                $sort: { [sortingField]: sortingOrder }
            },
            {
                $skip: skip
            },
            {
                $limit: searchTermPerPage
            }
        ]);

        const totalQuery = await targetSchema.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalSpend: { $sum: "$spend" },
                    totalSales: { $sum: "$sales" },
                    totalImpressions: { $sum: "$impressions" },
                    totalClicks: { $sum: "$clicks" },
                    totalOrders: { $sum: "$orders" },
                    totalCpc: { $sum: "$cpc" },
                }
            },
            {
                $project: {
                    _id: 0,
                    productName: "Total",
                    totalSpend: "$totalSpend",
                    totalSales: "$totalSales",
                    totalImpressions: "$totalImpressions",
                    totalClicks: "$totalClicks",
                    totalOrders: "$totalOrders",
                    totalCpc: "$totalCpc",
                    totalCtr: {
                        $cond: [
                            { $gt: ["$totalImpressions", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] }, 2] },
                            0
                        ]
                    },
                    totalCvr: {
                        $cond: [
                            { $gt: ["$totalClicks", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$totalOrders", "$totalClicks"] }, 100] }, 2] },
                            0
                        ]
                    },
                    totalAcos: {
                        $cond: [
                            { $gt: ["$totalSales", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] }, 2] },
                            0
                        ]
                    },
                    totalRoas: {
                        $cond: [
                            { $gt: ["$totalSpend", 0] },
                            { $round: [{ $divide: ["$totalSales", "$totalSpend"] }, 2] },
                            0
                        ]
                    }
                }
            }
        ]);

        const totalRow = totalQuery[0] || {};
        const totalCount = await targetSchema.distinct("searchTerm", filter).then(r => r.length);

        return res.status(200).send({
            isSuccess: true,
            totalRow,
            getSearchTermData,
            totalSearchTermData: totalCount,
            searchTermCurrentPageNo: searchTermPageNo,
            searchTermCurrentPerPage: searchTermPerPage
        });

    } catch (error) {
        write_logs({ message: `[getSearchTermDetailsData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res
            .status(500)
            .send({ message: "Something went wrong", isSuccess: false, error: error.message });
    }
};


exports.getAllSearchTerms = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { adTypeSearchTermSchema, adTypeTargetingSchema } = req.models;
        const adType = req.adType;

        let { fromDate,
            toDate,
            profileId,
            pageNo = 1,
            perPage = 10,
            searchName,
            fieldName,
            fieldOperator,
            fieldValue,
            conditions,
            extraFieldOperator,
            extraFieldValue,
            sortType,
            filteredSearchTerms,
            query: Query
        } = req.body;
        const customFilter = sanitizeQueryObject(safeJSON(Query)) ?? {};
        const { campaignId, adGroupId, ...extraFilter } = typeof customFilter === "object" ? customFilter : {};

        if (!profileId) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const typedConfigId = (configId && mongoose.Types.ObjectId.isValid(configId)) ? new mongoose.Types.ObjectId(configId) : configId;
        const numericProfileId = Number(profileId);
        const profile = await getProfile(configId, profileId);
        const timezone = profile.timezone;
        const lastSearchTermDoc = await adTypeSearchTermSchema.findOne({ configId: typedConfigId, profileId: numericProfileId }, { reportDate: 1 }).sort({ reportDate: -1 }).lean();
        const lastDate = lastSearchTermDoc?.reportDate ?? (toDate || moment().tz(timezone).format("YYYY-MM-DD"));
        const reportDate = {
            $gte: fromDate || moment().tz(timezone).format("YYYY-MM-DD"),
            $lte: toDate || moment().tz(timezone).format("YYYY-MM-DD"),
        };

        // Pre-fetch campaign details for this profile on lastDate (typically 80-130 docs, takes ~5ms)
        const adTypeCampaignCollection = AD_TYPE_COLLECTIONS?.[adType]?.["campaign"] || "campaigns";
        const campaignDocs = await mongoose.connection.collection(adTypeCampaignCollection).find(
            { configId: typedConfigId, profileId: numericProfileId, reportDate: lastDate },
            { projection: { campaignId: 1, name: 1, status: 1 } }
        ).toArray();

        const campaignMap = new Map();
        for (const c of campaignDocs) {
            campaignMap.set(c.campaignId, c);
        }

        // Check if campaignStatus filter is requested (from body or query object)
        let requestedCampaignStatus = req.body.campaignStatus;
        if (!requestedCampaignStatus && extraFilter.campaignStatus) {
            if (typeof extraFilter.campaignStatus === "object" && extraFilter.campaignStatus.$eq) {
                requestedCampaignStatus = extraFilter.campaignStatus.$eq;
            } else if (typeof extraFilter.campaignStatus === "string") {
                requestedCampaignStatus = extraFilter.campaignStatus;
            }
        }
        delete extraFilter.campaignStatus;

        // Check if campaignName filter is in extraFilter
        let nameMatchingCampaignIds = null;
        if (extraFilter.campaignName) {
            const pattern = extraFilter.campaignName.$regex ? new RegExp(extraFilter.campaignName.$regex, extraFilter.campaignName.$options || "i") : null;
            const exactVal = typeof extraFilter.campaignName === "string" ? extraFilter.campaignName : extraFilter.campaignName.$eq;
            nameMatchingCampaignIds = campaignDocs
                .filter(c => pattern ? pattern.test(c.name) : exactVal ? c.name === exactVal : true)
                .map(c => c.campaignId);
            delete extraFilter.campaignName;
        }

        let allowedCampaignIds = campaignDocs
            .filter(c => !requestedCampaignStatus || String(c.status).toUpperCase() === String(requestedCampaignStatus).toUpperCase())
            .map(c => c.campaignId);

        if (nameMatchingCampaignIds !== null) {
            allowedCampaignIds = allowedCampaignIds.filter(id => nameMatchingCampaignIds.includes(id));
        }

        let campaignIdFilter = null;
        if (campaignId) {
            if (typeof campaignId === "object" && campaignId.$in && Array.isArray(campaignId.$in)) {
                campaignIdFilter = campaignId.$in.map(Number);
            } else if (Array.isArray(campaignId)) {
                campaignIdFilter = campaignId.map(Number);
            } else if (!isNaN(Number(campaignId))) {
                campaignIdFilter = [Number(campaignId)];
            }
        }

        if (campaignIdFilter && campaignIdFilter.length > 0) {
            allowedCampaignIds = allowedCampaignIds.filter(id => campaignIdFilter.includes(Number(id)));
        }

        // If a status or campaign filter was requested and no campaigns matched, return empty immediately
        if ((requestedCampaignStatus || campaignIdFilter || nameMatchingCampaignIds !== null) && allowedCampaignIds.length === 0) {
            return res.status(200).send({
                isSuccess: true,
                totalSearchTerm: 0,
                getSearchTerm: [],
                totalRow: { impressions: 0, clicks: 0, orders: 0, spend: 0, sales: 0, acos: 0, roas: 0, cpc: 0, ctr: 0, isTotalRow: true },
                pageNo: Number(pageNo),
                perPage: Number(perPage)
            });
        }

        let adGroupIdFilter = null;
        if (adGroupId) {
            if (typeof adGroupId === "object" && adGroupId.$in && Array.isArray(adGroupId.$in)) {
                adGroupIdFilter = { $in: adGroupId.$in.map(Number) };
            } else if (Array.isArray(adGroupId)) {
                adGroupIdFilter = { $in: adGroupId.map(Number) };
            } else if (!isNaN(Number(adGroupId))) {
                adGroupIdFilter = Number(adGroupId);
            }
        }

        const normalize = (s) => (s || "").trim().toLowerCase();

        // Optimized pipeline: uses index on { configId, profileId, campaignId, reportDate } without expensive $lookup
        const commonPipeline = [
            {
                $match: {
                    configId: typedConfigId,
                    profileId: numericProfileId,
                    reportDate,
                    ...(allowedCampaignIds.length > 0 && (requestedCampaignStatus || campaignIdFilter || nameMatchingCampaignIds !== null) ? { campaignId: { $in: allowedCampaignIds } } : {}),
                    ...(adGroupIdFilter && { adGroupId: adGroupIdFilter }),
                    ...(filteredSearchTerms && filteredSearchTerms.length > 0 && { $or: filteredSearchTerms }),
                    ...(searchName && { searchTerm: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } }),
                }
            },
            {
                $group: {
                    _id: {
                        campaignId: "$campaignId",
                        adGroupId: "$adGroupId",
                        keywordId: "$keywordId",
                        searchTerm: "$searchTerm",
                        profileId: "$profileId",
                    },
                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    orders: { $sum: "$orders" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                    adGroupName: { $first: "$adGroupName" },
                    targeting: { $first: "$targeting" },
                    reportDate: { $max: "$reportDate" },
                    status: { $first: "$status" },
                    keywordType: { $first: "$keywordType" }
                }
            },
            {
                $project: {
                    _id: 0,
                    guid: {
                        $concat: [
                            { $toString: "$_id.campaignId" },
                            "_",
                            { $toString: "$_id.adGroupId" },
                            "_",
                            { $ifNull: [{ $toString: "$_id.keywordId" }, ""] },
                            "_",
                            "$_id.searchTerm"
                        ]
                    },
                    campaignId: "$_id.campaignId",
                    adGroupId: "$_id.adGroupId",
                    keywordId: "$_id.keywordId",
                    searchTerm: "$_id.searchTerm",
                    profileId: "$_id.profileId",
                    impressions: 1,
                    clicks: 1,
                    orders: 1,
                    spend: 1,
                    sales: 1,
                    adGroupName: 1,
                    targeting: 1,
                    reportDate: 1,
                    status: 1,
                    keywordType: 1,
                    acos: {
                        $cond: [
                            { $gt: ["$sales", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 2] },
                            0
                        ]
                    },
                    roas: {
                        $cond: [
                            { $gt: ["$spend", 0] },
                            { $round: [{ $divide: ["$sales", "$spend"] }, 2] },
                            0
                        ]
                    },
                    cpc: {
                        $cond: [
                            { $gt: ["$clicks", 0] },
                            { $round: [{ $divide: ["$spend", "$clicks"] }, 2] },
                            0
                        ]
                    },
                    ctr: {
                        $cond: [
                            { $gt: ["$impressions", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] },
                            0
                        ]
                    }
                }
            }
        ];

        // Apply dynamic query filters (from AddSearchTermQuery)
        if (Object.keys(extraFilter).length > 0) {
            commonPipeline.push({ $match: extraFilter });
        }

        // Apply field filtering
        if (fieldName && fieldOperator && fieldValue !== undefined) {
            const fieldFilter = buildFieldFilter(fieldName, fieldOperator, fieldValue);

            if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
                const extraFieldFilter = buildFieldFilter(fieldName, extraFieldOperator, extraFieldValue);

                const logicalOperator = {
                    [`$${conditions.toLowerCase()}`]: [
                        fieldFilter,
                        extraFieldFilter
                    ]
                };

                commonPipeline.push({ $match: logicalOperator });
            } else {
                commonPipeline.push({ $match: fieldFilter });
            }
        }

        // Sort configuration
        let sortStage = {};
        if (sortType === "ASC") {
            sortStage[fieldName || "spend"] = 1;
        } else if (sortType === "DESC") {
            sortStage[fieldName || "spend"] = -1;
        } else {
            sortStage = { spend: -1 };
        }

        const aggQuery = adTypeSearchTermSchema.aggregate([
            ...commonPipeline,
            {
                $facet: {
                    data: [
                        { $sort: sortStage },
                        { $skip: (pageNo - 1) * perPage },
                        { $limit: perPage }
                    ],
                    totalCount: [
                        { $count: "total" }
                    ],
                    totalRow: [
                        {
                            $group: {
                                _id: null,
                                totalImpressions: { $sum: "$impressions" },
                                totalClicks: { $sum: "$clicks" },
                                totalOrders: { $sum: "$orders" },
                                totalSpend: { $sum: "$spend" },
                                totalSales: { $sum: "$sales" }
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                impressions: "$totalImpressions",
                                clicks: "$totalClicks",
                                orders: "$totalOrders",
                                spend: "$totalSpend",
                                sales: "$totalSales",
                                acos: {
                                    $cond: [
                                        { $gt: ["$totalSales", 0] },
                                        { $round: [{ $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] }, 2] },
                                        0
                                    ]
                                },
                                roas: {
                                    $cond: [
                                        { $gt: ["$totalSpend", 0] },
                                        { $round: [{ $divide: ["$totalSales", "$totalSpend"] }, 2] },
                                        0
                                    ]
                                },
                                cpc: {
                                    $cond: [
                                        { $gt: ["$totalClicks", 0] },
                                        { $round: [{ $divide: ["$totalSpend", "$totalClicks"] }, 2] },
                                        0
                                    ]
                                },
                                ctr: {
                                    $cond: [
                                        { $gt: ["$totalImpressions", 0] },
                                        { $round: [{ $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] }, 2] },
                                        0
                                    ]
                                }
                            }
                        }
                    ]
                }
            }
        ]).allowDiskUse(true);

        // Let MongoDB choose an available index; named indexes may differ by database/ad type.
        const [facetResult] = await aggQuery;

        const searchTermResult = facetResult?.data || [];
        const totalRecords = facetResult?.totalCount?.[0]?.total || 0;
        const totalRow = facetResult?.totalRow?.[0] || {
            impressions: 0,
            clicks: 0,
            orders: 0,
            spend: 0,
            sales: 0,
            acos: 0,
            roas: 0,
            cpc: 0,
            ctr: 0
        };

        // Attach campaignName & campaignStatus from in-memory map
        for (const item of searchTermResult) {
            const c = campaignMap.get(item.campaignId);
            item.campaignName = c?.name || "";
            item.campaignStatus = c?.status || "";
        }

        // Fast targeting enrichment: query only for search terms on the current page
        const pageSearchTerms = [...new Set(searchTermResult.map(item => item.searchTerm).filter(Boolean))];
        const uniqueCampaignIds = [...new Set(searchTermResult.map(item => item.campaignId).filter(Boolean))];
        const uniqueAdGroupIds = [...new Set(searchTermResult.map(item => item.adGroupId).filter(Boolean))];

        let targetingData = [];
        if (pageSearchTerms.length > 0 && uniqueCampaignIds.length > 0) {
            targetingData = await adTypeTargetingSchema.find({
                configId: typedConfigId,
                profileId: numericProfileId,
                reportDate: lastDate,
                targeting: { $in: pageSearchTerms }
            }, {
                campaignId: 1,
                adGroupId: 1,
                targeting: 1,
                keywordType: 1
            }).lean();

            if (targetingData.length === 0) {
                targetingData = await adTypeTargetingSchema.find({
                    configId: typedConfigId,
                    profileId: numericProfileId,
                    campaignId: { $in: uniqueCampaignIds },
                    adGroupId: { $in: uniqueAdGroupIds },
                    targeting: { $in: pageSearchTerms }
                }, {
                    campaignId: 1,
                    adGroupId: 1,
                    targeting: 1,
                    keywordType: 1
                }).limit(uniqueCampaignIds.length * 50).lean();
            }
        }

        // Create a fast lookup map: key = `${campaignId}_${adGroupId}_${targeting}`
        const targetingMap = new Map();
        targetingData.forEach(item => {
            const key = `${item.campaignId}_${item.adGroupId}_${normalize(item.targeting)}`;
            targetingMap.set(key, true);
        });

        // Enrich search terms with existTargeting flag
        const enrichedSearchTerms = searchTermResult.map(item => {
            const key = `${item.campaignId}_${item.adGroupId}_${normalize(item.searchTerm)}`;
            const isTargeting = targetingMap.has(key);
            return {
                ...item,
                existTargeting: isTargeting
            };
        });

        return res.status(200).send({
            isSuccess: true,
            totalSearchTerm: totalRecords,
            getSearchTerm: enrichedSearchTerms,
            totalRow: { ...totalRow, isTotalRow: true },
            pageNo: Number(pageNo),
            perPage: Number(perPage)
        });

    } catch (error) {
        write_logs({ message: `[getAllSearchTerms Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res
            .status(500)
            .send({ isSuccess: false, message: error?.message || "Something went wrong" });
    }
};

exports.getSearchTermsProductView = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const typedConfigId = (configId && mongoose.Types.ObjectId.isValid(configId)) ? new mongoose.Types.ObjectId(configId) : configId;
        const { adTypeSearchTermSchema, adTypeTargetingSchema } = req.models;
        const adType = (req.adType || "SP").toUpperCase();

        let {
            fromDate,
            toDate,
            profileId,
            pageNo = 1,
            perPage = 10,
            searchName,
            fieldName,
            fieldOperator,
            fieldValue,
            conditions,
            extraFieldOperator,
            extraFieldValue,
            sortType,
            filteredSearchTerms,
            query: Query
        } = req.body;

        const customFilter = sanitizeQueryObject(safeJSON(Query)) ?? {};
        const { campaignId, adGroupId, ...extraFilter } = typeof customFilter === "object" ? customFilter : {};

        if (!profileId) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const numericProfileId = Number(profileId);
        const profile = await getProfile(configId, profileId);
        const timezone = profile.timezone;
        const lastSearchTermDoc = await adTypeSearchTermSchema.findOne({ configId: typedConfigId, profileId: numericProfileId }, { reportDate: 1 }).sort({ reportDate: -1 }).lean();
        const lastDate = lastSearchTermDoc?.reportDate ?? (toDate || moment().tz(timezone).format("YYYY-MM-DD"));
        const endDate = toDate || moment().tz(timezone).format("YYYY-MM-DD");
        const reportDate = {
            $gte: fromDate || moment().tz(timezone).format("YYYY-MM-DD"),
            $lte: endDate,
        };

        let campaignIdFilter = null;
        if (campaignId) {
            if (typeof campaignId === "object" && campaignId.$in && Array.isArray(campaignId.$in)) {
                campaignIdFilter = { $in: campaignId.$in.map(Number) };
            } else if (Array.isArray(campaignId)) {
                campaignIdFilter = { $in: campaignId.map(Number) };
            } else if (!isNaN(Number(campaignId))) {
                campaignIdFilter = Number(campaignId);
            }
        }

        let adGroupIdFilter = null;
        if (adGroupId) {
            if (typeof adGroupId === "object" && adGroupId.$in && Array.isArray(adGroupId.$in)) {
                adGroupIdFilter = { $in: adGroupId.$in.map(Number) };
            } else if (Array.isArray(adGroupId)) {
                adGroupIdFilter = { $in: adGroupId.map(Number) };
            } else if (!isNaN(Number(adGroupId))) {
                adGroupIdFilter = Number(adGroupId);
            }
        }

        const normalize = (s) => (s || "").trim().toLowerCase();

        // ──────────────────────────────────────────────────
        // STEP 1: Base search term aggregation (same as getAllSearchTerms)
        // ──────────────────────────────────────────────────
        const commonPipeline = [
            {
                $match: {
                    configId: typedConfigId,
                    profileId: numericProfileId,
                    reportDate,
                    ...(campaignIdFilter && { campaignId: campaignIdFilter }),
                    ...(adGroupIdFilter && { adGroupId: adGroupIdFilter }),
                    ...(filteredSearchTerms?.length > 0 && { $or: filteredSearchTerms }),
                }
            },
            {
                $group: {
                    _id: {
                        campaignId: "$campaignId",
                        adGroupId: "$adGroupId",
                        keywordId: "$keywordId",
                        searchTerm: "$searchTerm",
                        profileId: "$profileId",
                    },
                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    orders: { $sum: "$orders" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                    adGroupName: { $first: "$adGroupName" },
                    targeting: { $first: "$targeting" },
                    reportDate: { $max: "$reportDate" },
                    status: { $first: "$status" },
                    keywordType: { $first: "$keywordType" }
                }
            },

            // ──────────────────────────────────────────────────
            // STEP 1.5: Group by AdGroup to reduce lookups by 100x
            // ──────────────────────────────────────────────────
            {
                $group: {
                    _id: {
                        campaignId: "$_id.campaignId",
                        adGroupId: "$_id.adGroupId",
                        profileId: "$_id.profileId"
                    },
                    searchTerms: {
                        $push: {
                            keywordId: "$_id.keywordId",
                            searchTerm: "$_id.searchTerm",
                            impressions: "$impressions",
                            clicks: "$clicks",
                            orders: "$orders",
                            spend: "$spend",
                            sales: "$sales",
                            adGroupName: "$adGroupName",
                            targeting: "$targeting",
                            reportDate: "$reportDate",
                            status: "$status",
                            keywordType: "$keywordType"
                        }
                    }
                }
            },
            // ──────────────────────────────────────────────────
            // STEP 2: Lookup campaign info (Once per AdGroup)
            // ──────────────────────────────────────────────────
            {
                $lookup: {
                    from: AD_TYPE_COLLECTIONS?.[adType]?.["campaign"],
                    localField: "_id.campaignId",
                    foreignField: "campaignId",
                    pipeline: [
                        { $match: { configId: typedConfigId, profileId: numericProfileId, reportDate: lastDate } },
                        { $project: { _id: 0, campaignId: 1, name: 1, status: 1 } }
                    ],
                    as: "campaign"
                }
            },
            { $unwind: { path: "$campaign", preserveNullAndEmptyArrays: true } },

            // ──────────────────────────────────────────────────
            // STEP 3: Lookup product_ads → get distinct ASINs (Once per AdGroup)
            // ──────────────────────────────────────────────────
            {
                $lookup: {
                    from: AD_TYPE_COLLECTIONS?.[adType]?.["productAds"],
                    localField: "_id.adGroupId",
                    foreignField: "adGroupId",
                    let: { cId: "$_id.campaignId" },
                    pipeline: [
                        {
                            $match: {
                                configId: typedConfigId,
                                profileId: numericProfileId,
                                reportDate: endDate,
                                $expr: { $eq: ["$campaignId", "$$cId"] }
                            }
                        },
                        {
                            $group: {
                                _id: { $ifNull: ["$asin", "$asins"] },
                                sku: { $first: "$sku" }
                            }
                        },
                        { $project: { _id: 0, asins: "$_id", sku: 1 } }
                    ],
                    as: "productAds"
                }
            },
            // One row per ASIN
            { $unwind: { path: "$productAds", preserveNullAndEmptyArrays: false } },
            // ──────────────────────────────────────────────────
            // STEP 4: Unwind search terms back to original granularity
            // ──────────────────────────────────────────────────
            { $unwind: { path: "$searchTerms", preserveNullAndEmptyArrays: false } },
            
            // ──────────────────────────────────────────────────
            // STEP 4.5: Project search term row with ASIN + metrics
            // ──────────────────────────────────────────────────
            {
                $project: {
                    asin: "$productAds.asins",
                    sku: "$productAds.sku",
                    campaignId: "$campaign.campaignId",
                    campaignName: "$campaign.name",
                    campaignStatus: "$campaign.status",
                    adGroupId: "$_id.adGroupId",
                    adGroupName: { $ifNull: ["$searchTerms.adGroupName", "$campaign.name"] },
                    searchTerm: "$searchTerms.searchTerm",
                    keywordId: "$searchTerms.keywordId",
                    targeting: "$searchTerms.targeting",
                    profileId: "$_id.profileId",
                    impressions: "$searchTerms.impressions",
                    clicks: "$searchTerms.clicks",
                    orders: "$searchTerms.orders",
                    spend: "$searchTerms.spend",
                    sales: "$searchTerms.sales",
                    keywordType: "$searchTerms.keywordType",
                    acos: {
                        $cond: [
                            { $gt: ["$searchTerms.sales", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$searchTerms.spend", "$searchTerms.sales"] }, 100] }, 2] },
                            0
                        ]
                    },
                    roas: {
                        $cond: [
                            { $gt: ["$searchTerms.spend", 0] },
                            { $round: [{ $divide: ["$searchTerms.sales", "$searchTerms.spend"] }, 2] },
                            0
                        ]
                    },
                    cpc: {
                        $cond: [
                            { $gt: ["$searchTerms.clicks", 0] },
                            { $round: [{ $divide: ["$searchTerms.spend", "$searchTerms.clicks"] }, 2] },
                            0
                        ]
                    },
                    ctr: {
                        $cond: [
                            { $gt: ["$searchTerms.impressions", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$searchTerms.clicks", "$searchTerms.impressions"] }, 100] }, 2] },
                            0
                        ]
                    }
                }
            }
        ];

        if (extraFilter && Object.keys(extraFilter).length) {
            commonPipeline.push({ $match: extraFilter });
        }

        // Apply field filtering (same logic as getAllSearchTerms)
        if (fieldName && fieldOperator && fieldValue !== undefined) {
            const fieldFilter = buildFieldFilter(fieldName, fieldOperator, fieldValue);

            if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
                const extraFieldFilter = buildFieldFilter(fieldName, extraFieldOperator, extraFieldValue);
                commonPipeline.push({
                    $match: {
                        [`$${conditions.toLowerCase()}`]: [fieldFilter, extraFieldFilter]
                    }
                });
            } else {
                commonPipeline.push({ $match: fieldFilter });
            }
        }

        // ──────────────────────────────────────────────────
        // STEP 5: Group search terms → Campaign level
        // ──────────────────────────────────────────────────
        commonPipeline.push(
            {
                $group: {
                    _id: { asin: "$asin", campaignId: "$campaignId" },
                    sku: { $first: "$sku" },
                    campaignName: { $first: "$campaignName" },
                    campaignStatus: { $first: "$campaignStatus" },
                    totalImpressions: { $sum: "$impressions" },
                    totalClicks: { $sum: "$clicks" },
                    totalOrders: { $sum: "$orders" },
                    totalSpend: { $sum: "$spend" },
                    totalSales: { $sum: "$sales" },
                    searchTerms: {
                        $push: {
                            searchTerm: "$searchTerm",
                            targeting: "$targeting",
                            keywordId: "$keywordId",
                            adGroupId: "$adGroupId",
                            adGroupName: "$adGroupName",
                            keywordType: "$keywordType",
                            impressions: "$impressions",
                            clicks: "$clicks",
                            orders: "$orders",
                            spend: "$spend",
                            sales: "$sales",
                            acos: "$acos",
                            roas: "$roas",
                            cpc: "$cpc",
                            ctr: "$ctr",
                            profileId: "$profileId"
                        }
                    }
                }
            },
            // Campaign-level metrics
            {
                $addFields: {
                    acos: {
                        $cond: [{ $gt: ["$totalSales", 0] },
                        { $round: [{ $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] }, 2] }, 0]
                    },
                    roas: {
                        $cond: [{ $gt: ["$totalSpend", 0] },
                        { $round: [{ $divide: ["$totalSales", "$totalSpend"] }, 2] }, 0]
                    },
                    cpc: {
                        $cond: [{ $gt: ["$totalClicks", 0] },
                        { $round: [{ $divide: ["$totalSpend", "$totalClicks"] }, 2] }, 0]
                    },
                    ctr: {
                        $cond: [{ $gt: ["$totalImpressions", 0] },
                        { $round: [{ $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] }, 2] }, 0]
                    },
                }
            },

            // ──────────────────────────────────────────────────
            // STEP 6: Group campaigns → Product (ASIN) level
            // ──────────────────────────────────────────────────
            {
                $group: {
                    _id: "$_id.asin",
                    sku: { $first: "$sku" },
                    totalImpressions: { $sum: "$totalImpressions" },
                    totalClicks: { $sum: "$totalClicks" },
                    totalOrders: { $sum: "$totalOrders" },
                    totalSpend: { $sum: "$totalSpend" },
                    totalSales: { $sum: "$totalSales" },
                    campaigns: {
                        $push: {
                            campaignId: "$_id.campaignId",
                            campaignName: "$campaignName",
                            campaignStatus: "$campaignStatus",
                            totalImpressions: "$totalImpressions",
                            totalClicks: "$totalClicks",
                            totalOrders: "$totalOrders",
                            totalSpend: { $round: ["$totalSpend", 2] },
                            totalSales: { $round: ["$totalSales", 2] },
                            acos: "$acos",
                            roas: "$roas",
                            cpc: "$cpc",
                            ctr: "$ctr",
                            searchTerms: "$searchTerms"
                        }
                    }
                }
            },
            // Product-level metrics
            {
                $addFields: {
                    acos: {
                        $cond: [{ $gt: ["$totalSales", 0] },
                        { $round: [{ $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] }, 2] }, 0]
                    },
                    roas: {
                        $cond: [{ $gt: ["$totalSpend", 0] },
                        { $round: [{ $divide: ["$totalSales", "$totalSpend"] }, 2] }, 0]
                    },
                    cpc: {
                        $cond: [{ $gt: ["$totalClicks", 0] },
                        { $round: [{ $divide: ["$totalSpend", "$totalClicks"] }, 2] }, 0]
                    },
                    ctr: {
                        $cond: [{ $gt: ["$totalImpressions", 0] },
                        { $round: [{ $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] }, 2] }, 0]
                    },
                }
            },

            // ──────────────────────────────────────────────────
            // STEP 7: Lookup product details from productlistings
            // ──────────────────────────────────────────────────
            {
                $lookup: {
                    from: "productlistings",
                    let: { asinVal: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                profileId: numericProfileId,
                                $expr: { $eq: ["$asin", "$$asinVal"] }
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                itemName: 1,
                                imageURL: 1,
                                sellingPrice: 1,
                                asin: 1,
                                sku: 1
                            }
                        },
                        { $limit: 1 }
                    ],
                    as: "productInfo"
                }
            },
            { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },

            // ──────────────────────────────────────────────────
            // STEP 8: Final projection
            // ──────────────────────────────────────────────────
            {
                $project: {
                    _id: 0,
                    asin: "$_id",
                    sku: { $ifNull: ["$productInfo.sku", "$sku"] },
                    productName: { $ifNull: ["$productInfo.itemName", ""] },
                    imageUrl: { $ifNull: ["$productInfo.imageURL", ""] },
                    totalImpressions: 1,
                    totalClicks: 1,
                    totalOrders: 1,
                    totalSpend: { $round: ["$totalSpend", 2] },
                    totalSales: { $round: ["$totalSales", 2] },
                    acos: 1,
                    roas: 1,
                    cpc: 1,
                    ctr: 1,
                    campaigns: 1
                }
            }
        );

        if (searchName) {
            const words = searchName.trim().split(/[\s\-|&\(\),\/\\—\–\+]+/).filter(Boolean);
            if (words.length > 0) {
                const andConditions = words.map(word => {
                    const escapedWord = RegExp.escape(word);
                    const regex = new RegExp(escapedWord, "i");
                    return {
                        $or: [
                            { productName: { $regex: regex } },
                            { asin: { $regex: regex } },
                            { sku: { $regex: regex } },
                            { "campaigns.searchTerms.searchTerm": { $regex: regex } }
                        ]
                    };
                });
                commonPipeline.push({ $match: { $and: andConditions } });
            }
        }

        // ──────────────────────────────────────────────────
        // STEP 9: Sort + Paginate at product level
        // ──────────────────────────────────────────────────
        let sortField = fieldName || "totalSpend";
        if (["impressions", "clicks", "spend", "orders", "sales"].includes(sortField)) {
            sortField = "total" + sortField.charAt(0).toUpperCase() + sortField.slice(1);
        }

        const sortStage = {};
        if (sortType === "ASC") {
            sortStage[sortField] = 1;
        } else if (sortType === "DESC") {
            sortStage[sortField] = -1;
        } else {
            sortStage.totalSpend = -1;
        }

        const pipeline = [
            ...commonPipeline,
            {
                $facet: {
                    data: [
                        { $sort: sortStage },
                        { $skip: (pageNo - 1) * perPage },
                        { $limit: perPage }
                    ],
                    totalRecords: [
                        { $count: "count" }
                    ]
                }
            }
        ];

        const result = await adTypeSearchTermSchema.aggregate(pipeline).allowDiskUse(true);
        const products = result[0]?.data || [];
        const totalRecords = result[0]?.totalRecords[0]?.count || 0;

        // ──────────────────────────────────────────────────
        // STEP 10: existTargeting enrichment (same pattern as getAllSearchTerms)
        // ──────────────────────────────────────────────────
        const allSearchTermRows = [];
        products.forEach(product => {
            (product.campaigns || []).forEach(camp => {
                (camp.searchTerms || []).forEach(st => {
                    allSearchTermRows.push({
                        searchTerm: st.searchTerm,
                        campaignId: camp.campaignId,
                        adGroupId: st.adGroupId
                    });
                });
            });
        });

        const uniqueTerms = [...new Set(allSearchTermRows.map(r => normalize(r.searchTerm)))];
        const uniqueCampaignIds = [...new Set(allSearchTermRows.map(r => r.campaignId))];
        const uniqueAdGroupIds = [...new Set(allSearchTermRows.map(r => r.adGroupId))];

        let targetingMap = new Map();
        if (uniqueTerms.length) {

            const extractAsin = (val) => {
                if (!val) return null;
                const match = val.match(/([A-Z0-9]{10})/i);
                return match ? match[1].toLowerCase() : null;
            };

            const targetingList = await adTypeTargetingSchema
                .find({
                    configId: typedConfigId,
                    profileId: numericProfileId,
                    reportDate: lastDate,
                    campaignId: { $in: uniqueCampaignIds },
                    adGroupId: { $in: uniqueAdGroupIds },
                    targeting: { $in: uniqueTerms }
                })
                .select("targeting matchType status keywordType campaignId adGroupId")
                .lean();

            const targetingProductList = await adTypeTargetingSchema
                .find({
                    configId: typedConfigId,
                    profileId: numericProfileId,
                    reportDate: lastDate,
                    campaignId: { $in: uniqueCampaignIds },
                    adGroupId: { $in: uniqueAdGroupIds },
                    keywordType: "TARGETING_EXPRESSION"
                })
                .select("targeting matchType status keywordType campaignId adGroupId")
                .lean();

            targetingList.forEach(t => {
                const key = `${normalize(t.targeting)}_${t.campaignId}_${t.adGroupId}`;
                if (!targetingMap.has(key)) targetingMap.set(key, []);
                targetingMap.get(key).push(t);
            });

            targetingProductList.forEach(t => {
                const key = `${extractAsin(t.targeting)}_${t.campaignId}_${t.adGroupId}`;
                if (!targetingMap.has(key)) targetingMap.set(key, []);
                targetingMap.get(key).push(t);
            });
        }

        // Map existTargeting back into nested structure
        products.forEach(product => {
            (product.campaigns || []).forEach(camp => {
                (camp.searchTerms || []).forEach(st => {
                    const key = `${normalize(st.searchTerm)}_${camp.campaignId}_${st.adGroupId}`;
                    const existList = targetingMap.get(key) || [];
                    st.existTargeting = { isExist: existList.length > 0, list: existList };
                });
            });
        });

        return res.status(200).send({
            isSuccess: true,
            products,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
        });

    } catch (error) {
        write_logs({ message: `[getSearchTermsProductView Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.addToNegative = async (req, res) => {
    try {
        const configId = req?.config?.configId;

        let {
            negativeKeywordList, // [{ "campaignId": 123, "adGroupId": 456, "keywordText": "test", "matchType": "NEGATIVE_EXACT", "state": "ENABLED" }]
            profileId,
        } = req.body;

        if (!profileId) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const profile = await getProfile(configId, profileId);

        const checkConfigAds = await getAccessToken(configId);
        const config = {
            method: "POST",
            url: `${profile.amazonUrl}/sp/negativeKeywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile?.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spNegativeKeyword.v3+json",
                "Accept": "application/vnd.spNegativeKeyword.v3+json"
            },
            data: {
                negativeKeywords: negativeKeywordList
            }
        };

        let keywordResult = { success: 0, duplicate: 0, failed: 0 }

        const response = await axios(config);
        if (response.status !== 207) {
            return res.status(203).send({
                message: "Something went wrong, please try again!",
                isSuccess: false,
            });
        }

        keywordResult = parseAmazonKeywordResponse(response?.data?.negativeKeywords);

        const uniqueCampaignIds = [...new Set(negativeKeywordList.map((k) => k.campaignId).filter(Boolean))];
        const uniqueAdGroupIds = [...new Set(negativeKeywordList.map((k) => k.adGroupId).filter(Boolean))];
        const currentDate = moment().format("YYYY-MM-DD");

        const [campaigns, adGroups] = await Promise.all([
            campaignSchema.find(
                { configId, profileId: Number(profileId), campaignId: { $in: uniqueCampaignIds }, reportDate: currentDate },
                { campaignId: 1, name: 1, _id: 0 }
            ),
            adGroupSchema.find(
                { configId, profileId: Number(profileId), adGroupId: { $in: uniqueAdGroupIds }, reportDate: currentDate },
                { adGroupId: 1, name: 1, _id: 0 }
            ),
        ]);

        const campaignMap = Object.fromEntries(campaigns.map((c) => [c.campaignId, c.name]));
        const adGroupMap = Object.fromEntries(adGroups.map((a) => [a.adGroupId, a.name]));

        const keywordsWithNames = negativeKeywordList.map((item) => ({ ...item, campaignName: campaignMap[item?.campaignId] || null, adGroupName: adGroupMap[item?.adGroupId] || null }));

        await logAudit("SEARCH_TERM_ADD_AS_NEGATIVE_KEYWORD", `Search term added as negative keyword successfully.`, { negativeKeywords: keywordsWithNames, result: keywordResult }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: buildRuleRunMessage({ keywordResult, type: "Negative" }),
            summary: {
                negativeKeywords: {
                    added: keywordResult.success,
                    duplicate: keywordResult.duplicate,
                    failed: keywordResult.failed
                },
            }
        });

    } catch (error) {
        write_logs({ message: `[addToNegative Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.addToNegativeProduct = async (req, res) => {
    try {
        const configId = req?.config?.configId;

        let {
            negativeTargetingList, // [{ "campaignId": 123, "adGroupId": 456, expression: [{ type: "ASIN_SAME_AS", value: "B00HCBN674" }], "state": "ENABLED" }]
            profileId,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required." });
        }

        const profile = await getProfile(configId, profileId);
        const checkConfigAds = await getAccessToken(configId);
        const config = {
            method: "POST",
            url: `${profile.amazonUrl}/sp/negativeTargets`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile?.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spNegativeTargetingClause.v3+json",
                "Accept": "application/vnd.spNegativeTargetingClause.v3+json"
            },
            data: {
                negativeTargetingClauses: negativeTargetingList
            }
        };

        let productResult = { success: 0, duplicate: 0, failed: 0 }

        const response = await axios(config);
        if (response.status !== 207) {
            return res.status(203).send({
                message: "Something went wrong, please try again!",
                isSuccess: false,
            });
        }

        productResult = parseAmazonKeywordResponse(response?.data?.negativeTargetingClauses);

        const uniqueCampaignIds = [...new Set(negativeTargetingList.map((k) => k.campaignId).filter(Boolean))];
        const uniqueAdGroupIds = [...new Set(negativeTargetingList.map((k) => k.adGroupId).filter(Boolean))];
        const currentDate = moment().format("YYYY-MM-DD");

        const [campaigns, adGroups] = await Promise.all([
            campaignSchema.find(
                { configId, profileId: Number(profileId), campaignId: { $in: uniqueCampaignIds }, reportDate: currentDate },
                { campaignId: 1, name: 1, _id: 0 }
            ),
            adGroupSchema.find(
                { configId, profileId: Number(profileId), adGroupId: { $in: uniqueAdGroupIds }, reportDate: currentDate },
                { adGroupId: 1, name: 1, _id: 0 }
            ),
        ]);

        const campaignMap = Object.fromEntries(campaigns.map((c) => [c.campaignId, c.name]));
        const adGroupMap = Object.fromEntries(adGroups.map((a) => [a.adGroupId, a.name]));

        const keywordsWithNames = negativeTargetingList.map((item) => ({ ...item, campaignName: campaignMap[item?.campaignId] || null, adGroupName: adGroupMap[item?.adGroupId] || null }));

        await logAudit("SEARCH_TERM_ADD_AS_NEGATIVE_KEYWORD", `Search term added as negative product successfully.`, { negativeProducts: keywordsWithNames, result: productResult }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: buildRuleRunMessage({ productResult, type: "Negative" }),
            summary: {
                negativeProducts: {
                    added: productResult.success,
                    duplicate: productResult.duplicate,
                    failed: productResult.failed
                }
            }
        });

    } catch (error) {
        write_logs({ message: `[addToNegativeProduct Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.addNegativeToCampaign = async (req, res) => {
    try {
        const configId = req?.config?.configId;

        let {
            negativeKeywordList, // [{ "campaignId": 123, "adGroupId": 456, "keywordText": "test", "matchType": "NEGATIVE_EXACT", "state": "ENABLED" }]
            profileId,
        } = req.body;

        if (!profileId) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const profile = await getProfile(configId, profileId);

        const checkConfigAds = await getAccessToken(configId);
        const config = {
            method: "POST",
            url: `${profile.amazonUrl}/sp/campaignNegativeKeywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile?.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spCampaignNegativeKeyword.v3+json",
                "Accept": "application/vnd.spCampaignNegativeKeyword.v3+json"
            },
            data: { campaignNegativeKeywords: negativeKeywordList }
        };

        let keywordResult = { success: 0, duplicate: 0, failed: 0 }

        const response = await axios(config);
        if (response.status !== 207) {
            return res.status(203).send({
                message: "Something went wrong, please try again!",
                isSuccess: false,
            });
        }

        keywordResult = parseAmazonKeywordResponse(response?.data?.campaignNegativeKeywords);

        const uniqueCampaignIds = [...new Set(negativeKeywordList.map((k) => k.campaignId).filter(Boolean))];
        const uniqueAdGroupIds = [...new Set(negativeKeywordList.map((k) => k.adGroupId).filter(Boolean))];
        const currentDate = moment().format("YYYY-MM-DD");

        const [campaigns, adGroups] = await Promise.all([
            campaignSchema.find(
                { configId, profileId: Number(profileId), campaignId: { $in: uniqueCampaignIds }, reportDate: currentDate },
                { campaignId: 1, name: 1, _id: 0 }
            ),
            adGroupSchema.find(
                { configId, profileId: Number(profileId), adGroupId: { $in: uniqueAdGroupIds }, reportDate: currentDate },
                { adGroupId: 1, name: 1, _id: 0 }
            ),
        ]);

        const campaignMap = Object.fromEntries(campaigns.map((c) => [c.campaignId, c.name]));
        const adGroupMap = Object.fromEntries(adGroups.map((a) => [a.adGroupId, a.name]));

        const keywordsWithNames = negativeKeywordList.map((item) => ({ ...item, campaignName: campaignMap[item?.campaignId] || null, adGroupName: adGroupMap[item?.adGroupId] || null }));

        await logAudit("SEARCH_TERM_ADD_AS_NEGATIVE_KEYWORD", `Search term added as campaign negative keyword successfully.`, { negativeKeywords: keywordsWithNames, result: keywordResult }, req?.user?.id);

        return res.status(200).send({
            isSuccess: true,
            message: buildRuleRunMessage({ keywordResult, type: "Negative" }),
            summary: {
                negativeKeywords: {
                    added: keywordResult.success,
                    duplicate: keywordResult.duplicate,
                    failed: keywordResult.failed
                },
            }
        });

    } catch (error) {
        write_logs({ message: `[addNegativeToCampaign Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.ruleHistory = async (req, res) => {
    const configId = req?.config?.configId;
    // const userId = req.user._id;
    let { profileId, pageNo, perPage, search, fromDate, toDate, affectedFilter } = req.body;
    try {
        if (!profileId) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required!" });
        }
        pageNo = Number(pageNo) || 1;
        perPage = Number(perPage) || 10;

        const query = {
            configId: configId,
            profileId: Number(profileId),
            ruleDate: { $gte: fromDate, $lte: toDate },
            ...(search && { ruleName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }),
        }
        const pipeline = [
            { $match: query },
            { $sort: { updatedAt: -1 } },
            {
                $lookup: {
                    from: "searchtermrules",
                    localField: "ruleId",
                    foreignField: "_id",
                    as: "searchTermRule"
                }
            },
            {
                $unwind: {
                    path: "$searchTermRule",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    reportDate: "$searchTermRule.reportDate",
                    toDate: "$searchTermRule.toDate",
                    timezone: "$searchTermRule.timezone",
                    conditions: "$searchTermRule.conditions",
                }
            },
            {
                $project: {
                    affectedCampaigns: 0,
                }
            },
        ];

        if (affectedFilter && affectedFilter !== "ALL") {
            const isAffected = String(affectedFilter).toUpperCase() === "AFFECTED";
            pipeline.push(
                {
                    $lookup: {
                        from: "affectedcampaignbyrules",
                        let: {
                            ruleId: "$ruleId",
                            ruleDate: "$ruleDate",
                            ruleTime: "$ruleTime",
                            profileId: "$profileId",
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$profileId", "$$profileId"] },
                                            { $eq: ["$ruleSchema", "SearchTermRule"] },
                                            { $eq: ["$ruleId", "$$ruleId"] },
                                            { $eq: ["$ruleDate", "$$ruleDate"] },
                                            { $eq: ["$ruleTime", "$$ruleTime"] }
                                        ]
                                    }
                                }
                            },
                            { $limit: 1 },
                            { $project: { _id: 1 } }
                        ],
                        as: "_affectedCheck"
                    }
                },
                {
                    $match: isAffected
                        ? { "_affectedCheck.0": { $exists: true } }
                        : { "_affectedCheck.0": { $exists: false } }
                },
                {
                    $project: { _affectedCheck: 0 }
                }
            );
        }

        pipeline.push({
            $facet: {
                    data: [
                        { $skip: perPage * (pageNo - 1) },
                        { $limit: perPage },
                        {
                            $lookup: {
                                from: "affectedcampaignbyrules",
                                let: {
                                    ruleId: "$ruleId",
                                    ruleDate: "$ruleDate",
                                    ruleTime: "$ruleTime",
                                    profileId: "$profileId",
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$profileId", "$$profileId"] },
                                                    { $eq: ["$ruleSchema", "SearchTermRule"] },
                                                    { $eq: ["$ruleId", "$$ruleId"] },
                                                    { $eq: ["$ruleDate", "$$ruleDate"] },
                                                    { $eq: ["$ruleTime", "$$ruleTime"] }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $group: {
                                            _id: "$campaignId",
                                            campaignId: { $first: "$campaignId" },
                                            name: { $first: "$name" },
                                            type: { $first: "$type" },
                                            ruleDate: { $first: "$ruleDate" },
                                            ruleTime: { $first: "$ruleTime" },
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 0,
                                            campaignId: 1,
                                            name: 1,
                                            ruleDate: 1,
                                            ruleTime: 1,
                                            type: 1,
                                        }
                                    }
                                ],
                                as: "affectedCampaigns"
                            }
                        },
                        {
                            $lookup: {
                                from: "affectedcampaignbyrules",
                                let: {
                                    ruleId: "$ruleId",
                                    ruleDate: "$ruleDate",
                                    ruleTime: "$ruleTime",
                                    profileId: "$profileId",
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$profileId", "$$profileId"] },
                                                    { $eq: ["$ruleSchema", "SearchTermRule"] },
                                                    { $eq: ["$ruleId", "$$ruleId"] },
                                                    { $eq: ["$ruleDate", "$$ruleDate"] },
                                                    { $eq: ["$ruleTime", "$$ruleTime"] }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            campaignId: 1,
                                            name: 1,
                                            adGroupId: 1,
                                            adGroupName: 1,
                                            keywordId: 1,
                                            searchTerm: 1,
                                            oldValue: 1,
                                            newValue: 1,
                                            ruleDate: 1,
                                            ruleTime: 1,
                                            type: 1,
                                            changed: 1,
                                            isReverted: 1,
                                            isActive: 1,
                                            closedAt: 1,
                                            impressions: 1,
                                            clicks: 1,
                                            spend: 1,
                                            sales: 1,
                                            orders: 1,
                                            acos: 1,
                                            roas: 1,
                                            cpc: 1,
                                            ctr: 1,
                                        }
                                    }
                                ],
                                as: "affectedSearchTerms"
                            }
                        }
                    ],
                    totalCount: [
                        { $count: "count" }
                    ]
                }
            });

        const result = await searchTermRuleHistorySchema.aggregate(pipeline);
        const getRules = await enrichWithCampaignMetrics(result[0].data, profileId, "SearchTermRule");
        const totalRecords = result[0].totalCount[0]?.count || 0;
        return res.status(200).send({
            isSuccess: true,
            message: "Search Term Rule History listing successfully",
            currentPageNo: pageNo,
            totalRecords: totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
            data: getRules,
        });
    } catch (error) {
        write_logs({ message: `[ruleHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};

exports.searchTermPipeline = (query, lastDate, type, actionName, valueType) => {
    const commonPipeline = [
        { $match: query },
        { $sort: { reportDate: -1 } },
        {
            $group: {
                _id: {
                    campaignId: "$campaignId",
                    adGroupId: "$adGroupId",
                    keywordId: "$keywordId",
                    searchTerm: "$searchTerm",
                    profileId: "$profileId",
                },
                impressions: { $sum: "$impressions" },
                clicks: { $sum: "$clicks" },
                orders: { $sum: "$orders" },
                spend: { $sum: "$spend" },
                sales: { $sum: "$sales" },
                targeting: { $first: "$targeting" },
                reportDate: { $first: "$reportDate" },
                status: { $first: "$status" },
                keywordType: { $first: "$keywordType" }
            }
        },
        {
            $lookup: {
                from: AD_TYPE_COLLECTIONS?.[type]?.["campaign"],
                let: { cId: "$_id.campaignId", pId: "$_id.profileId", end: lastDate },
                pipeline: [
                    { $match: { $expr: { $and: [{ $eq: ["$campaignId", "$$cId"] }, { $eq: ["$profileId", "$$pId"] }, { $eq: ["$reportDate", "$$end"] }] } } },
                    { $limit: 1 },
                    { $project: { _id: 0, campaignId: 1, name: 1, targetingType: 1, status: 1 } }
                ],
                as: "campaign"
            }
        },
        { $unwind: { path: "$campaign", preserveNullAndEmptyArrays: true } },
        { $match: { "campaign.status": "ENABLED" } },
        {
            $lookup: {
                from: AD_TYPE_COLLECTIONS?.[type]?.["adGroup"],
                let: { aId: "$_id.adGroupId", pId: "$_id.profileId", end: lastDate },
                pipeline: [
                    { $match: { $expr: { $and: [{ $eq: ["$adGroupId", "$$aId"] }, { $eq: ["$profileId", "$$pId"] }, { $eq: ["$reportDate", "$$end"] }] } } },
                    { $limit: 1 },
                    { $project: { _id: 0, adGroupId: 1, name: 1 } }
                ],
                as: "adGroup"
            }
        },
        { $unwind: { path: "$adGroup", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "searchtermapplieds",
                let: {
                    campaignId: "$_id.campaignId",
                    adGroupId: "$_id.adGroupId",
                    keywordId: "$_id.keywordId",
                    searchTerm: "$_id.searchTerm",
                    profileId: "$_id.profileId"
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$type", actionName] },
                                    { $eq: ["$campaignId", "$$campaignId"] },
                                    { $eq: ["$adGroupId", "$$adGroupId"] },
                                    { $eq: ["$keywordId", "$$keywordId"] },
                                    { $eq: ["$searchTerm", "$$searchTerm"] },
                                    { $eq: ["$profileId", "$$profileId"] },
                                ]
                            }
                        }
                    },
                    { $limit: 1 }
                ],
                as: "alreadyApplied"
            }
        },
        { $match: { alreadyApplied: { $eq: [] } } },
        {
            $lookup: {
                from: "product_ads",
                let: { campaignId: "$_id.campaignId", profileId: "$_id.profileId" },
                pipeline: [
                    { $match: { $expr: { $and: [{ $eq: ["$campaignId", "$$campaignId"] }, { $eq: ["$profileId", "$$profileId"] }] } } },
                    { $match: { status: "ENABLED" } },
                    { $group: { _id: null, asins: { $addToSet: "$asins" } } }
                ],
                as: "campaignProducts"
            }
        },
        {
            $lookup: {
                from: "productlistings",
                let: { asinList: { $ifNull: [{ $arrayElemAt: ["$campaignProducts.asins", 0] }, []] }, profileId: "$_id.profileId" },
                pipeline: [
                    { $match: { $expr: { $and: [{ $in: ["$asin", "$$asinList"] }, { $eq: ["$profileId", "$$profileId"] }] } } },
                    { $project: { _id: 0, asin: 1, itemName: 1 } }
                ],
                as: "products"
            }
        },
        {
            $lookup: {
                from: "targetings",
                let: {
                    campaignId: "$_id.campaignId",
                    adGroupId: "$_id.adGroupId",
                    profileId: "$_id.profileId",
                    searchTerm: "$_id.searchTerm",
                    targeting: "$targeting",
                    keywordType: "$keywordType"
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$campaignId", "$$campaignId"] },
                                    { $eq: ["$adGroupId", "$$adGroupId"] },
                                    { $eq: ["$profileId", "$$profileId"] },
                                    { $cond: { if: { $eq: ["$$keywordType", "TARGETING_EXPRESSION"] }, then: { $eq: ["$targeting", "$$targeting"] }, else: { $eq: ["$targeting", "$$searchTerm"] } } },
                                    { $eq: ["$status", "ENABLED"] },
                                    { $eq: ["$reportDate", lastDate] },
                                    { $cond: { if: { $eq: ["$$keywordType", "TARGETING_EXPRESSION"] }, then: {}, else: { ...(valueType && { $eq: ["$keywordType", valueType] }) } } },
                                ]
                            }
                        }
                    },
                    { $limit: 1 }
                ],
                as: "existingTarget"
            }
        },
        // Search Term Rule: Create Campaign Based Only on Exact or Phrase Match Types.
        ...(actionName === "CREATE_CAMPAIGN" ? [{ $match: { existingTarget: { $eq: [] }, ...(valueType && { keywordType: { $nin: ["BROAD"] } }) } }] : []),
        {
            $project: {
                campaignId: "$campaign.campaignId",
                campaignName: "$campaign.name",
                campaignTargetingType: "$campaign.targetingType",
                products: { $map: { input: "$products", as: "p", in: "$$p.itemName" } },
                adGroupId: "$adGroup.adGroupId",
                adGroupname: "$adGroup.name",
                searchTerm: "$_id.searchTerm",
                keywordId: "$_id.keywordId",
                targeting: 1,
                profileId: "$_id.profileId",
                impressions: 1,
                clicks: 1,
                orders: 1,
                spend: 1,
                sales: 1,
                keywordType: 1,
                acos: { $cond: [{ $gt: ["$sales", 0] }, { $round: [{ $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 2] }, 0] },
                roas: { $cond: [{ $gt: ["$spend", 0] }, { $round: [{ $divide: ["$sales", "$spend"] }, 2] }, 0] },
                cpc: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $divide: ["$spend", "$clicks"] }, 2] }, 0] },
                ctr: { $cond: [{ $gt: ["$impressions", 0] }, { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] }, 0] },
            }
        },
        { $addFields: { guid: { $concat: [{ $dateToString: { date: "$$NOW", format: "%H%M%m%Y%H%M" } }, "_", { $toString: { $rand: {} } }] } } },
    ];

    return commonPipeline;
}


exports.getSearchTermRule = async (req, res) => {
    const configId = req?.config?.configId;
    const profileId = req.body.profileId;
    const pageNo = req.body.pageNo ? req.body.pageNo : 1;
    const perPage = req.body.perPage ? req.body.perPage : 10;
    try {
        const pipeline = [
            { $match: { configId: configId, profileId: profileId } },
            {
                $lookup: {
                    from: "searchtermrulehistories",
                    localField: "_id",
                    foreignField: "ruleId",
                    as: "histories"
                }
            },
            { $addFields: { lastRunDate: { $arrayElemAt: [{ $slice: [{ $reverseArray: "$histories.updatedAt" }, 1] }, 0] } } },
            {
                $addFields: {
                    lastRun: {
                        $dateToString: {
                            date: "$lastRunDate",
                            timezone: "$timezone",
                            format: "%Y-%m-%d %H:%M:%S"
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
            { $addFields: { createdBy: "$user.email", userName: "$user.fullName" } },
            { $project: { user: 0, histories: 0 } },
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: perPage * (pageNo - 1) },
                        { $limit: perPage }
                    ],
                    totalCount: [
                        { $count: "count" }
                    ]
                }
            }
        ];
        const result = await searchTermRuleSchema.aggregate(pipeline);
        const getFilter = result[0].data;
        const totalRecords = result[0].totalCount[0]?.count || 0;
        return res.status(200).send({
            isSuccess: true,
            message: "Search Term Rule listing successfully.",
            currentPageNo: pageNo,
            totalRecords: totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
            data: getFilter,
        });
    } catch (error) {
        write_logs({ message: `[getSearchTermRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};

exports.getSearchTermRuleById = async (req, res) => {
    const configId = req?.config?.configId;
    const _id = req.params.ruleId;
    try {
        const getRule = await searchTermRuleSchema.findOne({ _id, ...(configId && { configId }) }).lean();
        return res.status(200).send({
            message: "Get Search Term Rule successfully",
            data: getRule,
            isSuccess: true,
        });
    } catch (error) {
        write_logs({ message: `[getSearchTermRuleById Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};

exports.createSearchTermRule = async (req, res) => {
    const configId = req?.config?.configId;
    const userId = req.user._id;
    const {
        profileId,
        ruleName,
        conditions,
        actionType,
        times,
        query,
        days,
        reportDate,
        toDate,
        ruleType,
        startDate,
        endDate,
        allowMultiTimeChanges
    } = req.body;
    try {
        const assignment = validateCampaignAssignment(req.body.campaignIds);
        if (assignment.error) return res.status(400).send({ isSuccess: false, message: assignment.error });

        const getAccount = await getProfile(configId, profileId);
        if (!getAccount) {
            return res.status(203).send({ message: "Please select valid account!", isSuccess: false });
        }

        // const duplicationRule = await isDuplicateSearchTermRule(configId, userId, profileId, conditions);
        // if (duplicationRule) {
        //     return res.status(203).send({
        //         isSuccess: false,
        //         message: "A rule with the same conditions already exists. Please modify the conditions to create a new rule.",
        //     });
        // }

        const createCronFilter = await searchTermRuleSchema({
            configId,
            profileId,
            ruleName,
            conditions,
            actionType,
            days,
            reportDate,
            toDate,
            ruleType,
            startDate,
            endDate,
            allowMultiTimeChanges,
            times,
            query,
            countryCode: getAccount.countryCode,
            timezone: getAccount.timezone,
            userId,
            campaignIds: assignment.campaignIds
        });
        createCronFilter
            .save()
            .then(async (rule) => {
                await logAudit("SEARCH_TERM_RULE_CREATION", `Created search term rule: ${rule.ruleName}`, {
                    ruleName,
                    conditions,
                    actionType,
                    days,
                    times,
                    ruleType,
                    startDate,
                    endDate,
                    allowMultiTimeChanges,
                    reportDate,
                    toDate,
                }, req?.user?.id);
                return res.status(200).send({
                    isSuccess: true,
                    message: "Search Term rule created successfully.",
                    data: rule,
                });
            })
            .catch((error) => {
                write_logs({ message: `[createSearchTermRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                return res.status(203).send({
                    message: "Something went wrong, please try again!",
                    isSuccess: false,
                    error: "An internal server error occurred",
                });
            });
    } catch (error) {
        write_logs({ message: `[createSearchTermRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.updateSearchTermRule = async (req, res) => {
    const ruleId = req.params.ruleId;
    const configId = req?.config?.configId;
    const userId = req.user._id;
    const { profileId, conditions } = req.body;

    try {
        const { times, days } = req.body;
        // const duplicationRule = await isDuplicateSearchTermRule(configId, userId, profileId, conditions, ruleId);
        // if (duplicationRule) {
        //     return res.status(203).send({
        //         isSuccess: false,
        //         message: "A rule with the same conditions already exists. Please modify the conditions to update the rule.",
        //     });
        // }

        const updateData = { ...req.body };
        delete updateData.userId;
        delete updateData.configId;
        delete updateData.profileId;
        delete updateData._id;
        delete updateData.isActive;

        await searchTermRuleSchema
            .findOneAndUpdate({ _id: ruleId, ...(configId && { configId }) }, updateData, { new: true })
            .then(async (rule) => {
                if (!rule) {
                    return res
                        .status(203)
                        .send({ message: "Search Term rule not found!", isSuccess: false });
                }

                const spCampaigns = await campaignSchema.aggregate([
                    { $match: { campaignId: { $in: rule?.campaignIds?.SP || [] } } },
                    { $sort: { reportDate: -1 } },
                    { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
                ]);

                const sbCampaigns = await sbCampaignSchema.aggregate([
                    { $match: { campaignId: { $in: rule?.campaignIds?.SB || [] } } },
                    { $sort: { reportDate: -1 } },
                    { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
                ]);

                const sdCampaigns = await sdCampaignSchema.aggregate([
                    { $match: { campaignId: { $in: rule?.campaignIds?.SD || [] } } },
                    { $sort: { reportDate: -1 } },
                    { $group: { _id: "$campaignId", campaignName: { $first: "$name" } } }
                ]);

                const campaigns = {
                    SponsoredProduct: spCampaigns.map(c => c.campaignName),
                    SponsoredBrand: sbCampaigns.map(c => c.campaignName),
                    SponsoredDisplay: sdCampaigns.map(c => c.campaignName),
                };

                await logAudit("SEARCH_TERM_RULE_UPDATE", `Updated search term rule: ${rule.ruleName}`, {
                    ruleName: rule?.ruleName,
                    conditions: rule?.conditions,
                    actionType: rule?.actionType,
                    days: rule?.days,
                    times: rule?.times,
                    ruleType: rule?.ruleType,
                    startDate: rule?.startDate,
                    endDate: rule?.endDate,
                    allowMultiTimeChanges: rule?.allowMultiTimeChanges,
                    reportDate: rule?.reportDate,
                    toDate: rule?.toDate,
                    campaigns,
                }, req?.user?.id);
                return res.status(200).send({
                    message: "Search Term rule updated successfully.",
                    isSuccess: true,
                });
            })
            .catch((error) => {
                write_logs({ message: `[updateSearchTermRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                return res.status(203).send({
                    error: "An internal server error occurred",
                    message: "Something went wrong, please try again!",
                    isSuccess: false,
                });
            });
    } catch (error) {
        write_logs({ message: `[updateSearchTermRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};

exports.changeSearchTermRuleStatus = async (req, res) => {
    try {
        const { isActive, ids } = req.body;

        // Validation
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).send({
                message: "ids array is required",
                isSuccess: false,
            });
        }

        const configId = req?.config?.configId;
        // Bulk update
        const result = await searchTermRuleSchema.updateMany(
            { _id: { $in: ids }, ...(configId && { configId }) },
            { $set: { isActive: isActive } }
        );

        const updatedRules = await searchTermRuleSchema.find({ _id: { $in: ids }, ...(configId && { configId }) }, "ruleName");
        const ruleNames = updatedRules.map(r => r.ruleName).join(", ");

        await logAudit("SEARCH_TERM_RULE_STATUS_CHANGE", `Search term rules ${ruleNames} ${isActive ? "enabled" : "disabled"}`, {
            ruleNames
        }, req?.user?.id);
        if (result.matchedCount === 0) {
            return res.status(203).send({
                message: "No Search Term rules found!",
                isSuccess: false,
            });
        }

        return res.status(200).send({
            message: "Status updated successfully.",
            isSuccess: true,
            updatedCount: result.modifiedCount,
            ruleNames,
        });

    } catch (error) {
        write_logs({ message: `[changeSearchTermRuleStatus Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.deleteSearchTermRule = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const ruleId = req.params.ruleId;
        await searchTermRuleSchema
            .findOneAndDelete({ _id: ruleId, ...(configId && { configId }) })
            .then(async (rule) => {
                if (!rule) {
                    return res.status(203).send({ message: "Search Term rule not found!", isSuccess: false });
                }
                await logAudit("SEARCH_TERM_RULE_DELETION", `Deleted search term rule: ${rule.ruleName}`, {
                    ruleName: rule?.ruleName,
                }, req?.user?.id);
                return res.status(200).send({ message: "Search Term rule deleted successfully.", isSuccess: true });
            })
            .catch((error) => {
                write_logs({ message: `[deleteSearchTermRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                return res.status(203).send({
                    error: "An internal server error occurred",
                    message: "Something went wrong, please try again!",
                    isSuccess: false,
                });
            });
    } catch (error) {
        write_logs({ message: `[deleteSearchTermRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

const getTypeBasedRuleData = async (rule, type, model, capture = false) => {
    const hasExplicitCampaigns = (rule.campaignIds?.SP?.length > 0) || (rule.campaignIds?.SB?.length > 0) || (rule.campaignIds?.SD?.length > 0);

    if (hasExplicitCampaigns && (!rule.campaignIds?.[type] || rule.campaignIds[type].length === 0)) {
        return [];
    }

    const campaignModel = type === "SB" ? sbCampaignSchema : (type === "SD" ? sdCampaignSchema : campaignSchema);
    const activeCampaigns = await campaignModel.aggregate([
        {
            $match: {
                profileId: Number(rule.profileId),
                ...(rule.configId ? { configId: new mongoose.Types.ObjectId(rule.configId) } : {})
            }
        },
        { $sort: { reportDate: -1 } },
        {
            $group: {
                _id: "$campaignId",
                status: { $first: "$status" }
            }
        },
        {
            $match: {
                status: { $in: ["ENABLED", "PAUSED", "enabled", "paused"] }
            }
        }
    ]);
    const activeCampaignIds = activeCampaigns.map(c => Number(c._id));
    if (!activeCampaignIds.length) return [];

    let targetCampaignIds = activeCampaignIds;
    if (rule.campaignIds?.[type]?.length) {
        const assignedIds = rule.campaignIds[type].map(Number);
        targetCampaignIds = assignedIds.filter(id => activeCampaignIds.includes(id));
        if (!targetCampaignIds.length) return [];
    }

    let query = {
        configId: rule.configId,
        profileId: rule.profileId,
        campaignId: { $in: targetCampaignIds }
    };

    let { fromDate, toDate } = getRuleDate(rule.timezone, rule.reportDate, rule.toDate);
    if (rule.reportDate != "LIFETIME") {
        query.reportDate = { $gte: fromDate, $lte: toDate, }
    }
    else {
        toDate = moment().tz(rule.timezone).format("YYYY-MM-DD");
    }

    let pipeline = this.searchTermPipeline(query, toDate, type, rule?.actionType?.actionName, rule?.actionType?.actionValueType);

    const conditionStages = [];

  if (rule.query && rule?.query?.[type]) {
        let parsedQuery = sanitizeQueryObject(safeJsonParse(rule?.query?.[type]));
        conditionStages.push({ $match: parsedQuery });
    }

    if (rule?.actionType?.actionName === "TARGETING" && ["SP"].includes(type)) {
        pipeline.push({ $match: { campaignTargetingType: "MANUAL" } });
    }

    const searchTermList = await getConditionRows({ rule, ruleType: "searchTerm", adType: type, model, pipeline, conditionStages, capture, ruleModel: searchTermRuleSchema });
    searchTermList.forEach(st => { st.addToNegative = false })

    return searchTermList
}

exports.ruleEffectedSearchTerm = async (req, res) => {
    const ruleId = req.params.ruleId;
    try {
        const rule = await searchTermRuleSchema.findById(ruleId).lean();
        if (!rule) {
            return res.status(203).send({
                message: "Rule not found!",
                isSuccess: false,
            });
        }

        const SP = await getTypeBasedRuleData(rule, "SP", searchTermSchema)
        const SB = await getTypeBasedRuleData(rule, "SB", sbSearchTermSchema)
        const SD = await getTypeBasedRuleData(rule, "SD", sdSearchTermSchema)

        return res.status(200).send({
            isSuccess: true,
            message: "Search Term rule data fetched successfully.",
            data: { SP, SB, SD },
        });

    } catch (error) {
        write_logs({ message: `[ruleEffectedSearchTerm Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}

const parseAmazonKeywordResponse = (amazonResponse = {}) => {
    let success = 0;
    let duplicate = 0;
    let failed = 0;

    const successList = amazonResponse?.success || amazonResponse?.createTargetSuccessResults || [];
    const errorList = amazonResponse?.error || amazonResponse?.createTargetErrorResults || [];

    success = successList.length;

    errorList.forEach((err) => {
        const isDuplicate = err?.errors?.some(e => e?.errorType === "duplicateValueError" || e?.errorValue?.duplicateValueError?.reason === "DUPLICATE_VALUE");
        if (isDuplicate) duplicate++;
        else failed++;
    });

    return {
        success,
        duplicate,
        failed,
        total: success + duplicate + failed
    };
};

const parseAmazonSBKeywordResponse = (amazonResponse = []) => {
    let success = 0;
    let duplicate = 0;
    let failed = 0;

    amazonResponse.forEach((item) => {
        const code = item?.code;
        if (code === "SUCCESS") success++;
        else if (code === "DUPLICATE") duplicate++;
        else failed++;
    });

    return {
        success,
        duplicate,
        failed,
        total: success + duplicate + failed
    };
};

const buildRuleRunMessage = ({ keywordResult, productResult, type }) => {
    const parts = [];

    if (keywordResult?.success > 0)
        parts.push(`${type} Keywords added: ${keywordResult?.success}`);
    if (keywordResult?.duplicate > 0)
        parts.push(`${type} Keywords already exist: ${keywordResult?.duplicate}`);
    if (keywordResult?.failed > 0)
        parts.push(`${type} Keywords failed: ${keywordResult?.failed}`);

    if (productResult?.success > 0)
        parts.push(`${type} Products added: ${productResult?.success}`);
    if (productResult?.duplicate > 0)
        parts.push(`${type} Products already exist: ${productResult?.duplicate}`);
    if (productResult?.failed > 0)
        parts.push(`${type} Products failed: ${productResult?.failed}`);

    return parts.length ? `Search Term rule run completed. ${parts.join(", ")}.` : "Search Term rule run completed. No changes were applied.";
};

exports.manualRunSearchTermRule = async (req, res) => {
    try {

        const { ruleId, level } = req.body;
        let searchTermList = req.body.data;
        const rule = await searchTermRuleSchema.findById(ruleId).lean();
        if (!rule) {
            return res.status(203).send({
                message: "Rule not found!",
                isSuccess: false,
            });
        }

        if (!rule?.isActive) {
            return res.status(203).send({
                message: "Rule is not Active.",
                isSuccess: false,
            });
        }

        const campaignIds = [...(rule?.campaignIds?.SP ?? []), ...(rule?.campaignIds?.SB ?? []), ...(rule?.campaignIds?.SD ?? [])];
        if (campaignIds.length == 0) {
            return res.status(203).send({
                message: "Rule assign campaigns not found",
                isSuccess: false,
            });
        }

        const profile = await getProfile(rule?.configId, rule?.profileId);
        const configId = rule.configId;
        const checkConfigAds = await getAccessToken(configId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {

            const now = moment().tz(rule.timezone);
            const currentDate = now.format("YYYY-MM-DD");
            const currentTime = now.format("HH:mm");

            searchTermList = await captureManualSelection(rule, "searchTerm", searchTermList, type => getTypeBasedRuleData(rule, type, { SP: searchTermSchema, SB: sbSearchTermSchema, SD: sdSearchTermSchema }[type], true));

            await searchTermRuleHistorySchema.findOneAndUpdate(
                {
                    configId: profile.configId,
                    profileId: profile.profileId,
                    ruleDate: currentDate,
                    ruleId: rule._id,
                    lastRun: currentTime,
                    ruleTime: currentTime,
                },
                {
                    $set: {
                        conditionSnapshot: rule.conditionSnapshot,
                        ruleName: rule.ruleName,
                        status: "COMPLETED",
                    }
                },
                { upsert: true, new: true }
            ).lean();

            if (searchTermList?.SP?.length || searchTermList?.SB?.length || searchTermList?.SD?.length) {

                if (rule?.actionType?.actionName === "TARGETING") {
                    const SPProduct = await addSPTargeting(rule, profile, checkConfigAds, searchTermList?.SP, currentDate, currentTime)
                    const SBProduct = await addSBTargeting(rule, profile, checkConfigAds, searchTermList?.SB, currentDate, currentTime)

                    if (SPProduct?.isSuccess && SBProduct?.isSuccess) {

                        const { targetingKeywords: spKeyword, targetingProducts: spTargets } = SPProduct?.summary
                        const { targetingKeywords: sbKeyword, targetingProducts: sbTargets } = SBProduct?.summary

                        if (!(spKeyword?.failed > 0 || spTargets?.failed > 0)) {
                            const blockOps = searchTermList?.SP?.map(doc => ({
                                updateOne: {
                                    filter: {
                                        type: rule?.actionType?.actionName,
                                        configId: profile?.configId,
                                        profileId: doc?.profileId,
                                        campaignId: doc?.campaignId,
                                        adGroupId: doc?.adGroupId,
                                        keywordId: doc?.keywordId,
                                        searchTerm: doc?.searchTerm
                                    },
                                    update: { $set: { reportDate: currentDate } },
                                    upsert: true
                                }
                            }))
                            await searchTermAppliedSchema.bulkWrite(blockOps || []);
                        }

                        if (!(sbKeyword?.failed > 0 || sbTargets?.failed > 0)) {
                            const blockOps = searchTermList?.SB?.map(doc => ({
                                updateOne: {
                                    filter: {
                                        type: rule?.actionType?.actionName,
                                        configId: profile?.configId,
                                        profileId: doc?.profileId,
                                        campaignId: doc?.campaignId,
                                        adGroupId: doc?.adGroupId,
                                        keywordId: doc?.keywordId,
                                        searchTerm: doc?.searchTerm
                                    },
                                    update: { $set: { reportDate: currentDate } },
                                    upsert: true
                                }
                            }))
                            await searchTermAppliedSchema.bulkWrite(blockOps || []);
                        }

                        return res.status(200).send({
                            isSuccess: true,
                            message: "Search Term (Targeting) rule run completed.",
                            summary: {
                                targetingKeywords: {
                                    added: spKeyword?.added + sbKeyword?.added,
                                    duplicate: spKeyword?.duplicate + sbKeyword?.duplicate,
                                    failed: spKeyword?.failed + sbKeyword?.failed
                                },
                                targetingProducts: {
                                    added: spTargets?.added + sbTargets?.added,
                                    duplicate: spTargets?.duplicate + sbTargets?.duplicate,
                                    failed: spTargets?.failed + sbTargets?.failed
                                }
                            }
                        });
                    } else {
                        return res.status(203).send({
                            message: "Something went wrong, please try again!",
                            isSuccess: false,
                        });
                    }
                }

                if (rule?.actionType?.actionName === "NEGATIVE_TARGETING") {
                    const SPProduct = await addSPNegativeTargeting(rule, profile, checkConfigAds, searchTermList?.SP, currentDate, currentTime, level)
                    const SBProduct = await addSBNegativeTargeting(rule, profile, checkConfigAds, searchTermList?.SB, currentDate, currentTime, level)

                    if (SPProduct?.isSuccess && SBProduct?.isSuccess) {

                        const { negativeKeywords: spKeyword, negativeProducts: spTargets } = SPProduct?.summary
                        const { negativeKeywords: sbKeyword, negativeProducts: sbTargets } = SBProduct?.summary

                        if (!(spKeyword?.failed > 0 || spTargets?.failed > 0)) {
                            const blockOps = searchTermList?.SP?.map(doc => ({
                                updateOne: {
                                    filter: {
                                        type: rule?.actionType?.actionName,
                                        configId: profile?.configId,
                                        profileId: doc?.profileId,
                                        campaignId: doc?.campaignId,
                                        adGroupId: doc?.adGroupId,
                                        keywordId: doc?.keywordId,
                                        searchTerm: doc?.searchTerm
                                    },
                                    update: { $set: { reportDate: currentDate } },
                                    upsert: true
                                }
                            }))
                            await searchTermAppliedSchema.bulkWrite(blockOps || []);
                        }

                        if (!(sbKeyword?.failed > 0 || sbTargets?.failed > 0)) {
                            const blockOps = searchTermList?.SB?.map(doc => ({
                                updateOne: {
                                    filter: {
                                        type: rule?.actionType?.actionName,
                                        configId: profile?.configId,
                                        profileId: doc?.profileId,
                                        campaignId: doc?.campaignId,
                                        adGroupId: doc?.adGroupId,
                                        keywordId: doc?.keywordId,
                                        searchTerm: doc?.searchTerm
                                    },
                                    update: { $set: { reportDate: currentDate } },
                                    upsert: true
                                }
                            }))
                            await searchTermAppliedSchema.bulkWrite(blockOps || []);
                        }

                        return res.status(200).send({
                            isSuccess: true,
                            message: "Search Term (Negative Targeting) rule run completed.",
                            summary: {
                                negativeKeywords: {
                                    added: spKeyword?.added + sbKeyword?.added,
                                    duplicate: spKeyword?.duplicate + sbKeyword?.duplicate,
                                    failed: spKeyword?.failed + sbKeyword?.failed
                                },
                                negativeProducts: {
                                    added: spTargets?.added + sbTargets?.added,
                                    duplicate: spTargets?.duplicate + sbTargets?.duplicate,
                                    failed: spTargets?.failed + sbTargets?.failed
                                }
                            }
                        });
                    } else {
                        return res.status(203).send({
                            message: "Something went wrong, please try again!",
                            isSuccess: false,
                        });
                    }
                }

                if (rule?.actionType?.actionName === "CREATE_CAMPAIGN") {
                    const SPProduct = await createSPCampaign(rule, profile, checkConfigAds, searchTermList?.SP, currentDate, currentTime)

                    if (SPProduct?.isSuccess) {
                        const { targetingKeywords: spKeyword, targetingProducts: spTargets } = SPProduct?.summary

                        if (!(spKeyword?.failed > 0 || spTargets?.failed > 0)) {
                            const blockOps = searchTermList?.SP?.map(doc => ({
                                updateOne: {
                                    filter: {
                                        type: rule?.actionType?.actionName,
                                        configId: profile?.configId,
                                        profileId: doc?.profileId,
                                        campaignId: doc?.campaignId,
                                        adGroupId: doc?.adGroupId,
                                        keywordId: doc?.keywordId,
                                        searchTerm: doc?.searchTerm
                                    },
                                    update: { $set: { reportDate: currentDate } },
                                    upsert: true
                                }
                            }))
                            await searchTermAppliedSchema.bulkWrite(blockOps || []);
                        }

                        return res.status(200).send({
                            isSuccess: true,
                            message: "Search Term (Create Campaign) rule run completed.",
                            summary: {
                                campaignTargetingKeywords: {
                                    added: spKeyword?.added,
                                    duplicate: spKeyword?.duplicate,
                                    failed: spKeyword?.failed
                                },
                                campaignTargetingProducts: {
                                    added: spTargets?.added,
                                    duplicate: spTargets?.duplicate,
                                    failed: spTargets?.failed
                                },
                            }
                        });
                    } else {
                        return res.status(203).send({
                            message: "Something went wrong, please try again!",
                            isSuccess: false,
                        });
                    }
                }

                return res.status(203).send({
                    message: "Search Term action is not valid!",
                    isSuccess: false,
                });
            } else {
                return res.status(203).send({
                    message: "We don’t have any data available for this search term.!",
                    isSuccess: false,
                });
            }
        }
        else {
            return res.status(203).send({
                message: "Account is not connected.",
                isSuccess: false,
            });
        }
    } catch (error) {
        write_logs({ message: `[manualRunSearchTermRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}

exports.exportSearchTermRule = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, exportIds } = req.body;

        const query = { profileId, ...(configId && { configId }) };

        // ✅ Apply ruleIds filter if provided
        if (Array.isArray(exportIds) && exportIds?.length) {
            query._id = { $in: exportIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) };
        }

        const rules = await searchTermRuleSchema.find(query).lean();

        const workbook = new ExcelJS.Workbook();

        const metaSheet = workbook.addWorksheet("_META");
        const secretPayload = `SEARCHTERM_RULE`;
        const signature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(secretPayload).digest("hex");
        metaSheet.getCell("A1").value = signature;
        metaSheet.state = "hidden";

        const sheet = workbook.addWorksheet("SearchTermRules");

        sheet.columns = [
            // { header: "Profile ID", key: "profileId", width: 18 },
            // { header: "Config ID", key: "configId", width: 18 },
            // { header: "User ID", key: "userId", width: 18 },

            { header: "Rule Name", key: "ruleName", width: 25 },
            { header: "Is Active", key: "isActive", width: 12 },

            { header: "Query", key: "query", width: 50 },
            { header: "Campaign IDs", key: "campaignIds", width: 30 },

            { header: "Conditions", key: "conditions", width: 40 },
            { header: "Actions", key: "actionType", width: 40 },

            { header: "Report Date", key: "reportDate", width: 15 },
            { header: "To Date", key: "toDate", width: 15 },

            { header: "Rule Type", key: "ruleType", width: 20 },

            // { header: "Country Code", key: "countryCode", width: 15 },
            // { header: "Timezone", key: "timezone", width: 20 },
        ];

        // ✅ Normalize → Rows
        rules.forEach(rule => {
            sheet.addRow({
                // profileId: `${rule.profileId}`,
                // configId: rule.configId,
                // userId: rule.userId,

                ruleName: rule.ruleName,
                isActive: rule.isActive,

                query: JSON.stringify({
                    SP: removeCampaignIdFromQuery(rule?.query?.SP) || "",
                    SB: removeCampaignIdFromQuery(rule?.query?.SB) || "",
                    SD: removeCampaignIdFromQuery(rule?.query?.SD) || ""
                }),

                // 🔑 Arrays / Objects → JSON STRING
                campaignIds: JSON.stringify({ SP: [], SB: [], SD: [] }),
                conditions: JSON.stringify(rule.conditions ?? []),
                actionType: JSON.stringify(rule.actionType ?? []),

                reportDate: rule.reportDate ?? "",
                toDate: rule.toDate ?? "",

                ruleType: rule.ruleType ?? "",

                // countryCode: rule.countryCode ?? "",
                // timezone: rule.timezone ?? "",
            });
        });

        // ✅ Styling
        sheet.eachRow((row) => { row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" } }) });
        const headerRow = sheet.getRow(1);
        headerRow.eachCell((cell) => { cell.font = { bold: true } });
        headerRow.height = 25;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=SearchTermRules_${profileId}.xlsx`
        );
        res.setHeader(
            "Access-Control-Expose-Headers",
            "Content-Disposition"
        );

        await workbook.xlsx.write(res);
        return res.end();

    } catch (error) {
        write_logs({ message: `[exportSearchTermRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.error(error);
        return res.status(500).send({
            isSuccess: false,
            message: "Export failed",
            error: "An internal server error occurred",
        });
    }
};

exports.importSearchTermRule = async (req, res) => {
    try {
        const { _id: userId } = req.user;
        const configId = req?.config?.configId;
        const { profileId, duplicateAction } = req.body;
        const isReplace = duplicateAction === "replace";

        if (!req.file) {
            return res.status(203).send({
                isSuccess: false,
                message: "Excel file is required",
            });
        }

        const profile = await getProfile(configId, profileId);
        if (!profile) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile not found",
            });
        }

        const workbook = new ExcelJS.Workbook();
        const filePath = path.join(__dirname, "../../public/excelImportFiles", req?.file?.filename);

        await workbook.xlsx.readFile(filePath);

        const metaSheet = workbook.getWorksheet("_META");
        const expectedPayload = `SEARCHTERM_RULE`;

        const storedSignature = metaSheet.getCell("A1").value;
        const expectedSignature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(expectedPayload).digest("hex");

        if (storedSignature !== expectedSignature) {
            return res.status(203).send({
                isSuccess: false,
                message: "Invalid file. Please upload a valid Search Term Rule export file."
            });
        }

        const sheet = workbook.getWorksheet(2);
        if (!sheet) {
            return res.status(203).send({
                isSuccess: false,
                message: "Invalid Excel file",
            });
        }

        /** -----------------------------
         * 1️⃣ Collect rule names (skip header)
         * ----------------------------- */
        const ruleNames = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const name = row.getCell("A").value;
            if (name) ruleNames.push(name);
        });

        /** -----------------------------
         * 2️⃣ Fetch existing rules if SKIP
         * ----------------------------- */
        const existingRules = await searchTermRuleSchema.find({ configId, profileId, userId }, { _id: 1, conditions: 1 }).lean();

        /** -----------------------------
         * 3️⃣ Build bulk ops
         * ----------------------------- */
        const bulkOps = [];
        const errors = [];
        let skippedCount = 0;

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header

            try {
                const ruleName = row.getCell("A").value;
                const conditions = safeJsonParse(row.getCell("E").value || "[]");

                if (!ruleName || !conditions.length) {
                    skippedCount++;
                    return;
                }

                // Skip duplicate
                const matchedRule = checkDuplicateSearchTermRule(existingRules, conditions);
                if (!isReplace && matchedRule) {
                    skippedCount++;
                    return;
                }

                const data = {
                    profileId,
                    configId,
                    userId,

                    ruleName,
                    isActive: row.getCell("B").value === true,

                    query: safeJsonParse(row.getCell("C").value || "{ SP: '', SB: '', SD: '' }"),
                    campaignIds: safeJsonParse(row.getCell("D").value || "{ SP: [], SB: [], SD: [] }"),

                    conditions,
                    actionType: safeJsonParse(row.getCell("F").value || "[]"),

                    reportDate: row.getCell("G").value,
                    toDate: row.getCell("H").value,

                    ruleType: row.getCell("I").value,

                    countryCode: profile?.currencyCode,
                    timezone: profile?.timezone,
                };

                // 🔁 Replace existing rule
                if (matchedRule && isReplace) {
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: matchedRule?._id },
                            update: { $set: data },
                        },
                    });
                }
                // ➕ Insert new rule
                else if (!matchedRule) {
                    bulkOps.push({
                        insertOne: {
                            document: data,
                        },
                    });
                }
            } catch (err) {
                write_logs({ message: `[importSearchTermRule Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                errors.push({
                    row: rowNumber,
                    message: err.message,
                });
            }
        });

        if (bulkOps.length) {
            await prepareSnapshotBulkUpdates(searchTermRuleSchema, bulkOps);
      await searchTermRuleSchema.bulkWrite(bulkOps);
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Import completed",
            successCount: bulkOps.length,
            skippedCount,
            errorCount: errors.length,
            errors,
        });

    } catch (error) {
        write_logs({ message: `[importSearchTermRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Import failed",
            error: "An internal server error occurred",
        });
    }
};

exports.suggestedTargetingBid = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, items = [] } = req.body;
        // {
        //     campaignId,
        //     adGroupId,
        //     searchTerm
        // }

        if (!items.length) {
            return res.status(400).json({
                isSuccess: false,
                message: "No items provided"
            });
        }

        const profile = await getProfile(configId, profileId);
        const checkConfigAds = await getAccessToken(configId);

        if (!checkConfigAds?.adsAccessToken) {
            return res.status(203).send({
                message: "Account is not connected.",
                isSuccess: false,
            });
        }

        const results = [];

        for (const item of items) {
            const response = await getSuggestedBid(item, profile, checkConfigAds);
            results.push({
                campaignId: item.campaignId,
                adGroupId: item.adGroupId,
                searchTerm: item.searchTerm,
                ...response
            });
        }

        const campaignSetting = await camapignSettingSchema.findOne({ configId, profileId }).lean();

        return res.status(200).send({
            isSuccess: true,
            message: "Suggested bid fetched successfully.",
            results,
            defaultBid: campaignSetting?.defaultBid
        });

    } catch (error) {
        write_logs({ message: `[suggestedTargetingBid Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.removeSearchTerm = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, type, items = [] } = req.body;
        const { adTypeSearchTermSchema } = req.models;

        /**
         * items = [
         *  {
         *    campaignId,
         *    adGroupId,
         *    searchTerm
         *  }
         * ]
         */

        if (!items.length) {
            return res.status(400).json({
                isSuccess: false,
                message: "No items provided"
            });
        }

        if (!["REMOVE_FROM_LIST", "NEVER_RECOMMANDED"].includes(type)) {
            return res.status(400).json({
                isSuccess: false,
                message: "Invalid type"
            });
        }

        const filters = items.map(item => ({
            configId,
            profileId,
            campaignId: item.campaignId,
            adGroupId: item.adGroupId,
            searchTerm: item.searchTerm
        }));

        const existingDocs = await adTypeSearchTermSchema.find({ $or: filters }).lean();

        if (!existingDocs.length) {
            return res.status(200).json({
                isSuccess: true,
                message: "No matching search terms found",
                summary: {
                    backedUp: 0,
                    removed: 0,
                    blocked: 0
                }
            });
        }

        const backupOps = existingDocs.map(doc => ({
            insertOne: {
                document: {
                    configId: doc.configId,
                    profileId: doc.profileId,
                    data: doc,
                    deletedType: type,
                    deletedAt: new Date()
                }
            }
        }));

        const deleteOps = existingDocs.map(doc => ({ deleteOne: { filter: { _id: doc._id } } }));

        const blockOps = type === "NEVER_RECOMMANDED"
            ? existingDocs.map(doc => ({
                updateOne: {
                    filter: {
                        configId: doc.configId,
                        profileId: doc.profileId,
                        campaignId: doc.campaignId,
                        adGroupId: doc.adGroupId,
                        searchTerm: doc.searchTerm
                    },
                    update: {
                        $set: {
                            configId: doc.configId,
                            profileId: doc.profileId,
                            campaignId: doc.campaignId,
                            adGroupId: doc.adGroupId,
                            searchTerm: doc.searchTerm,
                            reason: "NEVER_RECOMMANDED"
                        }
                    },
                    upsert: true
                }
            }))
            : [];

        if (backupOps.length) {
            await searchTermDeletedSchema.bulkWrite(backupOps);
        }

        if (deleteOps.length) {
            await adTypeSearchTermSchema.bulkWrite(deleteOps);
        }

        if (blockOps.length) {
            await searchTermBlockSchema.bulkWrite(blockOps);
        }

        await Promise.all(
            items.map(async item => {
                const campaign = await campaignSchema.findOne({ campaignId: item?.campaignId });
                const adGroup = await adGroupSchema.findOne({ adGroupId: item?.adGroupId });

                await logAudit("SEARCH_TERM_REMOVED", `Search term removed successfully.`, {
                    type: type === "NEVER_RECOMMANDED" ? "Never Recommanded" : "Remove from List",
                    campaignName: campaign?.name,
                    adGroupName: adGroup?.name,
                    ...item,
                }, req?.user?.id)
            })
        )

        return res.status(200).json({
            isSuccess: true,
            message: type === "NEVER_RECOMMANDED" ? "Search terms removed and blocked successfully." : "Search terms removed successfully.",
            summary: {
                removed: deleteOps.length,
                blocked: blockOps.length
            }
        });

    } catch (error) {
        write_logs({ message: `[removeSearchTerm Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).json({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred"
        });
    }
};

const addSPTargeting = async (rule, profile, checkConfigAds, searchTermList, currentDate, currentTime) => {
    let targetingKeyword = {
        method: "POST",
        url: `${profile.amazonUrl}/sp/keywords`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.spKeyword.v3+json",
            "Accept": "application/vnd.spKeyword.v3+json"
        },
    }
    let targetingProduct = {
        method: "POST",
        url: `${profile.amazonUrl}/sp/targets`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.spTargetingClause.v3+json",
            "Accept": "application/vnd.spTargetingClause.v3+json"
        },
    }

    let targetingKeywords = []
    let targetingProducts = []

    let targetingKeywordsUpdate = []
    let targetingProductsUpdate = []

    const runSchedule = await Promise.all(
        searchTermList.map(async (searchTerm) => {
            if (isValidASIN(searchTerm?.searchTerm)) {
                targetingProducts?.push({
                    campaignId: String(searchTerm.campaignId),
                    adGroupId: String(searchTerm.adGroupId),
                    expression: [{ type: rule?.actionType?.actionValueType === "EXACT" ? "ASIN_SAME_AS" : "ASIN_EXPANDED_FROM", value: `${searchTerm.searchTerm}`?.toUpperCase() }],
                    expressionType: "MANUAL",
                    bid: searchTerm?.bid ?? searchTerm?.cpc ?? 1.5,
                    state: "ENABLED"
                })
                targetingProductsUpdate?.push({
                    campaignId: searchTerm.campaignId,
                    adGroupId: searchTerm.adGroupId,
                    keywordId: searchTerm.keywordId,
                    searchTerm: searchTerm.searchTerm,
                    name: searchTerm?.campaignName,
                    adGroupName: searchTerm.adGroupname,
                    campaignName: searchTerm?.campaignName,
                    newlyAppliedCampaignName: searchTerm?.newlyAppliedCampaignName,
                })
            } else {
                targetingKeywords?.push({
                    campaignId: String(searchTerm.campaignId),
                    adGroupId: String(searchTerm.adGroupId),
                    keywordText: searchTerm.searchTerm,
                    matchType: rule?.actionType?.actionValueType === "EXACT" ? "EXACT" : "PHRASE",
                    bid: searchTerm?.bid ?? searchTerm?.cpc ?? 1.5,
                    state: "ENABLED"
                })
                targetingKeywordsUpdate?.push({
                    campaignId: searchTerm.campaignId,
                    adGroupId: searchTerm.adGroupId,
                    keywordId: searchTerm.keywordId,
                    searchTerm: searchTerm.searchTerm,
                    name: searchTerm?.campaignName,
                    adGroupName: searchTerm.adGroupname,
                    campaignName: searchTerm?.campaignName,
                    newlyAppliedCampaignName: searchTerm?.newlyAppliedCampaignName,
                })
            }
        })
    );

    await Promise.all(runSchedule);

    let keywordResult = { success: 0, duplicate: 0, failed: 0 }
    let productResult = { success: 0, duplicate: 0, failed: 0 }

    if (targetingProducts?.length) {
        try {
            const response = await retryWithBackoff(() => amazonAxios({ ...targetingProduct, data: { targetingClauses: targetingProducts } }));
            if (response.status == 207) {
                productResult = parseAmazonKeywordResponse(response?.data?.targetingClauses);

                cron_logs({
                    message: `[Targeting Product Amazon Result] Rule ID: ${rule._id}, Profile ID: ${profile.profileId} = ${JSON.stringify(response?.data)}`,
                    log_type: "info",
                })

                await Promise.all(
                    targetingProductsUpdate?.map(async (product) => (
                        await recordRuleExecutionChange({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            userId: rule.userId,
                            ruleSchema: "SearchTermRule",
                            type: "SP",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            campaignId: product.campaignId,
                            adGroupId: product.adGroupId,
                            keywordId: product.keywordId,
                            searchTerm: product.searchTerm,
                            name: product?.name,
                            oldValue: product?.newlyAppliedCampaignName ? product?.campaignName : product.searchTerm,
                            newValue: product?.newlyAppliedCampaignName ? product?.newlyAppliedCampaignName : product.searchTerm,
                            adGroupName: product?.adGroupName,
                            changed: "searchTermAction",
                            metrics: {
                                impressions: product?.impressions || 0,
                                clicks: product?.clicks || 0,
                                spend: product?.spend || 0,
                                sales: product?.sales || 0,
                                orders: product?.orders || 0,
                                acos: product?.acos || 0,
                                roas: product?.roas || 0,
                                cpc: product?.cpc || 0,
                                ctr: product?.ctr || 0,
                            },
                            notes: "Search term product targeting applied",
                        })
                    ))
                )
            }
            else {
                cron_logs({
                    message: `Something went wrong, please try again!`,
                    log_type: "error",
                })
                return false
            }
        } catch (error) {
            cron_logs({
                message: `Something went wrong: ${error || error?.message}`,
                log_type: "error",
            })
            return false
        }
    }

    if (targetingKeywords?.length) {
        try {
            const response = await retryWithBackoff(() => amazonAxios({ ...targetingKeyword, data: { keywords: targetingKeywords } }));
            if (response.status == 207) {
                keywordResult = parseAmazonKeywordResponse(response?.data?.keywords);

                cron_logs({
                    message: `[Negative Keyword Amazon Result] Rule ID: ${rule._id}, Profile ID: ${profile.profileId} = ${JSON.stringify(response?.data)}`,
                    log_type: "info",
                })

                await Promise.all(
                    targetingKeywordsUpdate?.map(async (product) => (
                        await recordRuleExecutionChange({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            userId: rule.userId,
                            ruleSchema: "SearchTermRule",
                            type: "SP",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            campaignId: product.campaignId,
                            adGroupId: product.adGroupId,
                            keywordId: product.keywordId,
                            searchTerm: product.searchTerm,
                            name: product?.name,
                            oldValue: product?.newlyAppliedCampaignName ? product?.campaignName : product.searchTerm,
                            newValue: product?.newlyAppliedCampaignName ? product?.newlyAppliedCampaignName : product.searchTerm,
                            adGroupName: product?.adGroupName,
                            changed: "searchTermAction",
                            metrics: {
                                impressions: product?.impressions || 0,
                                clicks: product?.clicks || 0,
                                spend: product?.spend || 0,
                                sales: product?.sales || 0,
                                orders: product?.orders || 0,
                                acos: product?.acos || 0,
                                roas: product?.roas || 0,
                                cpc: product?.cpc || 0,
                                ctr: product?.ctr || 0,
                            },
                            notes: "Search term keyword targeting applied",
                        })
                    ))
                )
            }
            else {
                cron_logs({
                    message: `Something went wrong, please try again!`,
                    log_type: "error",
                })
                return false
            }
        } catch (error) {
            cron_logs({
                message: `Something went wrong: ${error || error?.message}`,
                log_type: "error",
            })
            return false
        }
    }

    return {
        isSuccess: true,
        summary: {
            targetingKeywords: {
                added: keywordResult.success,
                duplicate: keywordResult.duplicate,
                failed: keywordResult.failed
            },
            targetingProducts: {
                added: productResult.success,
                duplicate: productResult.duplicate,
                failed: productResult.failed
            }
        }
    }
}

const addSPNegativeTargeting = async (rule, profile, checkConfigAds, searchTermList, currentDate, currentTime, level) => {
    let campaignNegativeKeywords = {
        method: "POST",
        url: `${profile.amazonUrl}/sp/campaignNegativeKeywords`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.spCampaignNegativeKeyword.v3+json",
            "Accept": "application/vnd.spCampaignNegativeKeyword.v3+json"
        },
    }
    let campaignNegativeTargets = {
        method: "POST",
        url: `${profile.amazonUrl}/sp/campaignNegativeTargets`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.spCampaignNegativeTargetingClause.v3+json",
            "Accept": "application/vnd.spCampaignNegativeTargetingClause.v3+json"
        },
    }
    let negativeKeyword = {
        method: "POST",
        url: `${profile.amazonUrl}/sp/negativeKeywords`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.spNegativeKeyword.v3+json",
            "Accept": "application/vnd.spNegativeKeyword.v3+json"
        },
    }
    let negativeProduct = {
        method: "POST",
        url: `${profile.amazonUrl}/sp/negativeTargets`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/vnd.spNegativeTargetingClause.v3+json",
            "Accept": "application/vnd.spNegativeTargetingClause.v3+json"
        },
    }

    let negativeKeywords = []
    let negativeTargetingClauses = []

    let negativeKeywordsUpdate = []
    let negativeTargetingClausesUpdate = []

    const runSchedule = await Promise.all(
        searchTermList.map(async (searchTerm) => {
            if (isValidASIN(searchTerm?.searchTerm)) {
                if (level == "Campaign") {
                    negativeTargetingClauses?.push({
                        campaignId: String(searchTerm.campaignId),
                        expression: [{ type: rule?.actionType?.actionValueType === "EXACT" ? "ASIN_SAME_AS" : "ASIN_EXPANDED_FROM", value: `${searchTerm.searchTerm}`?.toUpperCase() }],
                        state: "ENABLED"
                    })
                    negativeTargetingClausesUpdate?.push({
                        campaignId: searchTerm.campaignId,
                        keywordId: searchTerm.keywordId,
                        searchTerm: searchTerm.searchTerm,
                        name: searchTerm?.campaignName,
                        adGroupName: searchTerm.adGroupname,
                    })
                }
                else {
                    negativeTargetingClauses?.push({
                        campaignId: String(searchTerm.campaignId),
                        adGroupId: String(searchTerm.adGroupId),
                        expression: [{ type: rule?.actionType?.actionValueType === "EXACT" ? "ASIN_SAME_AS" : "ASIN_EXPANDED_FROM", value: `${searchTerm.searchTerm}`?.toUpperCase() }],
                        state: "ENABLED"
                    })
                    negativeTargetingClausesUpdate?.push({
                        campaignId: searchTerm.campaignId,
                        adGroupId: searchTerm.adGroupId,
                        keywordId: searchTerm.keywordId,
                        searchTerm: searchTerm.searchTerm,
                        name: searchTerm?.campaignName,
                        adGroupName: searchTerm.adGroupname,
                    })
                }
            } else {
                if (level == "Campaign") {
                    negativeKeywords?.push({
                        campaignId: String(searchTerm.campaignId),
                        keywordText: searchTerm.searchTerm,
                        matchType: rule?.actionType?.actionValueType === "EXACT" ? "NEGATIVE_EXACT" : "NEGATIVE_PHRASE",
                        state: "ENABLED"
                    })
                    negativeKeywordsUpdate?.push({
                        campaignId: searchTerm.campaignId,
                        keywordId: searchTerm.keywordId,
                        searchTerm: searchTerm.searchTerm,
                        name: searchTerm?.campaignName,
                        adGroupName: searchTerm.adGroupname,
                    })
                }
                else {
                    negativeKeywords?.push({
                        campaignId: String(searchTerm.campaignId),
                        adGroupId: String(searchTerm.adGroupId),
                        keywordText: searchTerm.searchTerm,
                        matchType: rule?.actionType?.actionValueType === "EXACT" ? "NEGATIVE_EXACT" : "NEGATIVE_PHRASE",
                        state: "ENABLED"
                    })
                    negativeKeywordsUpdate?.push({
                        campaignId: searchTerm.campaignId,
                        adGroupId: searchTerm.adGroupId,
                        keywordId: searchTerm.keywordId,
                        searchTerm: searchTerm.searchTerm,
                        name: searchTerm?.campaignName,
                        adGroupName: searchTerm.adGroupname,
                    })
                }
            }
        })
    );

    await Promise.all(runSchedule);

    let keywordResult = { success: 0, duplicate: 0, failed: 0 }
    let productResult = { success: 0, duplicate: 0, failed: 0 }

    if (negativeTargetingClauses?.length) {
        try {
            let request = { ...negativeProduct, data: { negativeTargetingClauses } };
            if (level == "Campaign") {
                request = { ...campaignNegativeTargets, data: { campaignNegativeTargetingClauses: negativeTargetingClauses } };
            }
            const response = await retryWithBackoff(() => amazonAxios(request));
            if (response.status == 207) {
                if (level == "Campaign") {
                    productResult = parseAmazonKeywordResponse(response?.data?.campaignNegativeTargetingClauses);
                }
                else {
                    productResult = parseAmazonKeywordResponse(response?.data?.negativeTargetingClauses);
                }
                cron_logs({
                    message: `[Negative Product Amazon Result] Rule ID: ${rule._id}, Profile ID: ${profile.profileId} = ${JSON.stringify(response?.data)}`,
                    log_type: "info",
                })

                await Promise.all(
                    negativeTargetingClausesUpdate?.map(async (product) => (
                        await recordRuleExecutionChange({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            userId: rule.userId,
                            ruleSchema: "SearchTermRule",
                            type: "SP",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            campaignId: product.campaignId,
                            adGroupId: level == "Campaign" ? null : product.adGroupId,
                            adGroupName: level == "Campaign" ? null : product.adGroupName,
                            keywordId: product.keywordId,
                            searchTerm: product.searchTerm,
                            name: product?.name,
                            oldValue: product.searchTerm,
                            newValue: product.searchTerm,
                            changed: "negativeTargeting",
                            metrics: {
                                impressions: product?.impressions || 0,
                                clicks: product?.clicks || 0,
                                spend: product?.spend || 0,
                                sales: product?.sales || 0,
                                orders: product?.orders || 0,
                                acos: product?.acos || 0,
                                roas: product?.roas || 0,
                                cpc: product?.cpc || 0,
                                ctr: product?.ctr || 0,
                            },
                            notes: "Negative product targeting applied",
                        })
                    ))
                )
            }
            else {
                cron_logs({
                    message: `Something went wrong, please try again!`,
                    log_type: "error",
                })
                return false
            }
        } catch (error) {
            cron_logs({
                message: `Something went wrong: ${error || error?.message}`,
                log_type: "error",
            })
            return false
        }
    }

    if (negativeKeywords?.length) {
        try {
            let request = { ...negativeKeyword, data: { negativeKeywords } };
            if (level == "Campaign") {
                request = { ...campaignNegativeKeywords, data: { campaignNegativeKeywords: negativeKeywords } };
            }
            const response = await retryWithBackoff(() => amazonAxios(request));
            if (response.status == 207) {
                if (level == "Campaign") {
                    keywordResult = parseAmazonKeywordResponse(response?.data?.campaignNegativeKeywords);
                }
                else {
                    keywordResult = parseAmazonKeywordResponse(response?.data?.negativeKeywords);
                }

                cron_logs({
                    message: `[Negative Keyword Amazon Result] Rule ID: ${rule._id}, Profile ID: ${profile.profileId} = ${JSON.stringify(response?.data)}`,
                    log_type: "info",
                })

                await Promise.all(
                    negativeKeywordsUpdate?.map(async (product) => (
                        await recordRuleExecutionChange({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            userId: rule.userId,
                            ruleSchema: "SearchTermRule",
                            type: "SP",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            campaignId: product.campaignId,
                            adGroupId: level == "Campaign" ? null : product.adGroupId,
                            adGroupName: level == "Campaign" ? null : product.adGroupName,
                            keywordId: product.keywordId,
                            searchTerm: product.searchTerm,
                            name: product?.name,
                            oldValue: product.searchTerm,
                            newValue: product.searchTerm,
                            changed: "negativeKeyword",
                            metrics: {
                                impressions: product?.impressions || 0,
                                clicks: product?.clicks || 0,
                                spend: product?.spend || 0,
                                sales: product?.sales || 0,
                                orders: product?.orders || 0,
                                acos: product?.acos || 0,
                                roas: product?.roas || 0,
                                cpc: product?.cpc || 0,
                                ctr: product?.ctr || 0,
                            },
                            notes: "Negative keyword applied",
                        })
                    ))
                )
            }
            else {
                cron_logs({
                    message: `Something went wrong, please try again!`,
                    log_type: "error",
                })
                return false
            }
        } catch (error) {
            cron_logs({
                message: `Something went wrong, please try again!`,
                log_type: "error",
            })
            return false
        }
    }

    return {
        isSuccess: true,
        summary: {
            negativeKeywords: {
                added: keywordResult.success,
                duplicate: keywordResult.duplicate,
                failed: keywordResult.failed
            },
            negativeProducts: {
                added: productResult.success,
                duplicate: productResult.duplicate,
                failed: productResult.failed
            }
        }
    };
}

const addSBTargeting = async (rule, profile, checkConfigAds, searchTermList, currentDate, currentTime) => {
    let targetingKeyword = {
        method: "POST",
        url: `${profile.amazonUrl}/sb/keywords`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.sbkeywordresponse.v3+json"
        },
    }
    let targetingProduct = {
        method: "POST",
        url: `${profile.amazonUrl}/sb/targets`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.sbcreatetargetsresponse.v3+json"
        },
    }

    let targetingKeywords = []
    let targetingProducts = []

    let targetingKeywordsUpdate = []
    let targetingProductsUpdate = []

    const runSchedule = await Promise.all(
        searchTermList.map(async (searchTerm) => {
            if (isValidASIN(searchTerm?.searchTerm)) {
                targetingProducts?.push({
                    campaignId: String(searchTerm.campaignId),
                    adGroupId: String(searchTerm.adGroupId),
                    expression: [{ type: rule?.actionType?.actionValueType === "EXACT" ? "asinSameAs" : "asinBrandSameAs", value: `${searchTerm.searchTerm}`?.toUpperCase() }],
                    expressionType: "MANUAL",
                    bid: searchTerm?.bid ?? searchTerm?.cpc ?? 1.5
                })
                targetingProductsUpdate?.push({
                    campaignId: searchTerm.campaignId,
                    adGroupId: searchTerm.adGroupId,
                    keywordId: searchTerm.keywordId,
                    searchTerm: searchTerm.searchTerm,
                    name: searchTerm?.campaignName,
                    adGroupName: searchTerm.adGroupname,
                })
            } else {
                targetingKeywords?.push({
                    campaignId: String(searchTerm.campaignId),
                    adGroupId: String(searchTerm.adGroupId),
                    keywordText: searchTerm.searchTerm,
                    matchType: rule?.actionType?.actionValueType === "EXACT" ? "exact" : "phrase",
                    bid: searchTerm?.bid ?? searchTerm?.cpc ?? 1.5
                })
                targetingKeywordsUpdate?.push({
                    campaignId: searchTerm.campaignId,
                    adGroupId: searchTerm.adGroupId,
                    keywordId: searchTerm.keywordId,
                    searchTerm: searchTerm.searchTerm,
                    name: searchTerm?.campaignName,
                    adGroupName: searchTerm.adGroupname,
                })
            }
        })
    );

    await Promise.all(runSchedule);

    let keywordResult = { success: 0, duplicate: 0, failed: 0 }
    let productResult = { success: 0, duplicate: 0, failed: 0 }

    if (targetingProducts?.length) {
        try {
            const response = await retryWithBackoff(() => amazonAxios({ ...targetingProduct, data: { targets: targetingProducts } }));
            if (response.status == 207) {
                productResult = parseAmazonKeywordResponse(response?.data);

                cron_logs({
                    message: `[Targeting Product Amazon Result] Rule ID: ${rule._id}, Profile ID: ${profile.profileId} = ${JSON.stringify(response?.data)}`,
                    log_type: "info",
                })

                await Promise.all(
                    targetingProductsUpdate?.map(async (product) => (
                        await recordRuleExecutionChange({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            userId: rule.userId,
                            ruleSchema: "SearchTermRule",
                            type: "SB",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            campaignId: product.campaignId,
                            adGroupId: product.adGroupId,
                            keywordId: product.keywordId,
                            searchTerm: product.searchTerm,
                            name: product?.name,
                            oldValue: product.searchTerm,
                            newValue: product.searchTerm,
                            adGroupName: product.adGroupName,
                            changed: "searchTermAction",
                            notes: "SB product targeting applied",
                        })
                    ))
                )
            }
            else {
                cron_logs({
                    message: `Something went wrong, please try again!`,
                    log_type: "error",
                })
                return false
            }
        } catch (error) {
            cron_logs({
                message: `Something went wrong, please try again!`,
                log_type: "error",
            })
            return false
        }
    }

    if (targetingKeywords?.length) {
        try {
            const response = await retryWithBackoff(() => amazonAxios({ ...targetingKeyword, data: targetingKeywords }));
            if (response.status == 207) {
                keywordResult = parseAmazonSBKeywordResponse(response?.data);

                cron_logs({
                    message: `[Negative Keyword Amazon Result] Rule ID: ${rule._id}, Profile ID: ${profile.profileId} = ${JSON.stringify(response?.data)}`,
                    log_type: "info",
                })

                await Promise.all(
                    targetingKeywordsUpdate?.map(async (product) => (
                        await recordRuleExecutionChange({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            userId: rule.userId,
                            ruleSchema: "SearchTermRule",
                            type: "SB",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            campaignId: product.campaignId,
                            adGroupId: product.adGroupId,
                            keywordId: product.keywordId,
                            searchTerm: product.searchTerm,
                            name: product?.name,
                            oldValue: product.searchTerm,
                            newValue: product.searchTerm,
                            adGroupName: product.adGroupName,
                            changed: "searchTermAction",
                            notes: "SB keyword targeting applied",
                        })
                    ))
                )
            }
            else {
                cron_logs({
                    message: `Something went wrong, please try again!`,
                    log_type: "error",
                })
                return false
            }
        } catch (error) {
            cron_logs({
                message: `Something went wrong, please try again!`,
                log_type: "error",
            })
            return false
        }
    }

    return {
        isSuccess: true,
        summary: {
            targetingKeywords: {
                added: keywordResult.success,
                duplicate: keywordResult.duplicate,
                failed: keywordResult.failed
            },
            targetingProducts: {
                added: productResult.success,
                duplicate: productResult.duplicate,
                failed: productResult.failed
            }
        }
    }
}

const addSBNegativeTargeting = async (rule, profile, checkConfigAds, searchTermList, currentDate, currentTime, level) => {
    let negativeKeyword = {
        method: "POST",
        url: `${profile.amazonUrl}/sb/negativeKeywords`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.sbkeywordresponse.v3+json"
        },
    }
    let negativeProduct = {
        method: "POST",
        url: `${profile.amazonUrl}/sb/negativeTargets`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile?.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/vnd.sbcreatenegativetargetsrequest.v3+json"
        },
    }

    let negativeKeywords = []
    let negativeTargetingClauses = []

    let negativeKeywordsUpdate = []
    let negativeTargetingClausesUpdate = []

    const runSchedule = await Promise.all(
        searchTermList.map(async (searchTerm) => {
            if (isValidASIN(searchTerm?.searchTerm)) {
                negativeTargetingClauses?.push({
                    campaignId: String(searchTerm.campaignId),
                    adGroupId: String(searchTerm.adGroupId),
                    expression: [{ type: rule?.actionType?.actionValueType === "EXACT" ? "asinSameAs" : "asinBrandSameAs", value: `${searchTerm.searchTerm}`?.toUpperCase() }],
                })
                negativeTargetingClausesUpdate?.push({
                    campaignId: searchTerm.campaignId,
                    adGroupId: searchTerm.adGroupId,
                    keywordId: searchTerm.keywordId,
                    searchTerm: searchTerm.searchTerm,
                    name: searchTerm?.campaignName,
                    adGroupName: searchTerm.adGroupname,
                })
            } else {
                negativeKeywords?.push({
                    campaignId: String(searchTerm.campaignId),
                    adGroupId: String(searchTerm.adGroupId),
                    keywordText: searchTerm.searchTerm,
                    matchType: rule?.actionType?.actionValueType === "EXACT" ? "negativeExact" : "negativePhrase",
                })
                negativeKeywordsUpdate?.push({
                    campaignId: searchTerm.campaignId,
                    adGroupId: searchTerm.adGroupId,
                    keywordId: searchTerm.keywordId,
                    searchTerm: searchTerm.searchTerm,
                    name: searchTerm?.campaignName,
                    adGroupName: searchTerm.adGroupname,
                })
            }
        })
    );

    await Promise.all(runSchedule);

    let keywordResult = { success: 0, duplicate: 0, failed: 0 }
    let productResult = { success: 0, duplicate: 0, failed: 0 }

    if (negativeTargetingClauses?.length) {
        try {
            let request = { ...negativeProduct, data: { negativeTargets: negativeTargetingClauses } };
            const response = await retryWithBackoff(() => amazonAxios(request));
            if (response.status == 207) {
                productResult = parseAmazonKeywordResponse(response?.data);

                cron_logs({
                    message: `[Negative Product Amazon Result] Rule ID: ${rule._id}, Profile ID: ${profile.profileId} = ${JSON.stringify(response?.data)}`,
                    log_type: "info",
                })

                await Promise.all(
                    negativeTargetingClausesUpdate?.map(async (product) => (
                        await recordRuleExecutionChange({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            userId: rule.userId,
                            ruleSchema: "SearchTermRule",
                            type: "SB",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            campaignId: product.campaignId,
                            adGroupId: product.adGroupId,
                            adGroupName: product.adGroupName,
                            keywordId: product.keywordId,
                            searchTerm: product.searchTerm,
                            name: product?.name,
                            oldValue: product.searchTerm,
                            newValue: product.searchTerm,
                            changed: "negativeTargeting",
                            notes: "SB negative product targeting applied",
                        })
                    ))
                )
            }
            else {
                cron_logs({
                    message: `Something went wrong, please try again!`,
                    log_type: "error",
                })
                return false
            }
        } catch (error) {
            cron_logs({
                message: `Something went wrong, please try again!`,
                log_type: "error",
            })
            return false
        }
    }

    if (negativeKeywords?.length) {
        try {
            let request = { ...negativeKeyword, data: negativeKeywords };
            const response = await retryWithBackoff(() => amazonAxios(request));
            if (response.status == 207) {
                keywordResult = parseAmazonSBKeywordResponse(response?.data);

                cron_logs({
                    message: `[Negative Keyword Amazon Result] Rule ID: ${rule._id}, Profile ID: ${profile.profileId} = ${JSON.stringify(response?.data)}`,
                    log_type: "info",
                })

                await Promise.all(
                    negativeKeywordsUpdate?.map(async (product) => (
                        await recordRuleExecutionChange({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            userId: rule.userId,
                            ruleSchema: "SearchTermRule",
                            type: "SB",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            campaignId: product.campaignId,
                            adGroupId: product.adGroupId,
                            adGroupName: product.adGroupName,
                            keywordId: product.keywordId,
                            searchTerm: product.searchTerm,
                            name: product?.name,
                            oldValue: product.searchTerm,
                            newValue: product.searchTerm,
                            changed: "negativeKeyword",
                            notes: "SB negative keyword applied",
                        })
                    ))
                )
            }
            else {
                cron_logs({
                    message: `Something went wrong, please try again!`,
                    log_type: "error",
                })
                return false
            }
        } catch (error) {
            cron_logs({
                message: `Something went wrong, please try again!`,
                log_type: "error",
            })
            return false
        }
    }

    return {
        isSuccess: true,
        summary: {
            negativeKeywords: {
                added: keywordResult.success,
                duplicate: keywordResult.duplicate,
                failed: keywordResult.failed
            },
            negativeProducts: {
                added: productResult.success,
                duplicate: productResult.duplicate,
                failed: productResult.failed
            }
        }
    };
}

const createSPCampaign = async (rule, profile, checkConfigAds, searchTermList, currentDate, currentTime) => {
    const results = [];
    const setting = await camapignSettingSchema.findOne({ configId: profile?.configId, profileId: Number(profile?.profileId) }).lean();
    const prefix = setting?.searchTermRuleSetting?.campaignPrefix?.trim() ? `${setting.searchTermRuleSetting.campaignPrefix.trim()} - ` : "";

    for (const item of searchTermList) {
        try {
            const oldCampaign = await getCampaignById({ profileId: profile?.profileId, getAccount: profile, checkConfigAds, campaignId: item?.campaignId });
            const oldProducts = await getProductAdsByAdGroupId({ profileId: profile?.profileId, getAccount: profile, checkConfigAds, adGroupId: item?.adGroupId });

            const matchCode = rule?.actionType?.actionValueType === "PHRASE" ? "Ph" : "Ex";
            const campaignName = item?.newlyAppliedCampaignName || `${prefix}SP - ${matchCode} - Spirulina | ${item?.searchTerm}`;

            const campaignResponse = await createCampaign({
                profileId: profile?.profileId,
                checkConfigAds,
                getAccount: profile,
                campaignData: {
                    name: campaignName,
                    budget: oldCampaign?.data?.budget,
                    startDate: currentDate,
                    targetingType: "MANUAL",
                    bidStrategy: oldCampaign?.data?.dynamicBidding?.strategy,
                    placements: oldCampaign?.data?.dynamicBidding?.placementBidding,
                    siteType: oldCampaign?.data?.siteRestrictions?.[0]
                }
            });
            if (!campaignResponse?.isSuccess || !campaignResponse?.campaignId) {
                results.push({ searchTerm: item.searchTerm, isSuccess: false, error: campaignResponse?.message || "Failed to create campaign.", isDuplicate: campaignResponse?.isDuplicate || false });
                continue;
            }

            const adGroupResponse = await createAdGroup({
                profileId: profile?.profileId,
                checkConfigAds,
                getAccount: profile,
                campaignId: campaignResponse?.campaignId,
                adGroupName: campaignName,
                defaultBid: item?.cpc || 1
            });
            if (!adGroupResponse?.isSuccess) {
                results.push({ searchTerm: item.searchTerm, isSuccess: false, error: adGroupResponse?.message || "Failed to create ad group.", isDuplicate: adGroupResponse?.isDuplicate || false });
                continue;
            }

            const productAdsResponse = await createProductAds({ profileId: profile.profileId, getAccount: profile, checkConfigAds, campaignId: campaignResponse.campaignId, adGroupId: adGroupResponse.adGroupId, products: oldProducts?.data || [] });
            if (!productAdsResponse?.isSuccess) {
                results.push({ searchTerm: item.searchTerm, isSuccess: false, error: productAdsResponse?.message || "Failed to create product ads.", isDuplicate: productAdsResponse?.isDuplicate || false });
                continue;
            }

            await addSPTargeting(rule, profile, checkConfigAds, [{ ...item, campaignId: campaignResponse?.campaignId, adGroupId: adGroupResponse?.adGroupId }], currentDate, currentTime);

            results.push({ searchTerm: item.searchTerm, campaignId: campaignResponse?.campaignId, adGroupId: adGroupResponse?.adGroupId, isSuccess: true, isDuplicate: false });
        } catch (error) {
            write_logs({ message: `[createSPCampaign Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
            results.push({ searchTerm: item.searchTerm, isSuccess: false, error: "An internal server error occurred", isDuplicate: false });
        }
    }

    return {
        isSuccess: true,
        summary: {
            targetingKeywords: {
                added: results?.filter((res) => res?.isSuccess && !res?.isDuplicate && !isValidASIN(res?.searchTerm))?.length || 0,
                duplicate: results?.filter((res) => res?.isDuplicate && !isValidASIN(res?.searchTerm))?.length || 0,
                failed: results?.filter((res) => !res?.isSuccess && !res?.isDuplicate && !isValidASIN(res?.searchTerm))?.length || 0
            },
            targetingProducts: {
                added: results?.filter((res) => res?.isSuccess && !res?.isDuplicate && isValidASIN(res?.searchTerm))?.length || 0,
                duplicate: results?.filter((res) => res?.isDuplicate && isValidASIN(res?.searchTerm))?.length || 0,
                failed: results?.filter((res) => !res?.isSuccess && !res?.isDuplicate && isValidASIN(res?.searchTerm))?.length || 0
            },
        }
    };
}

const getCampaignById = async ({ profileId, getAccount, checkConfigAds, campaignId }) => {
    try {
        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/campaigns/list`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                Accept: "application/vnd.spCampaign.v3+json",
                "Content-Type": "application/vnd.spCampaign.v3+json"
            },
            data: { maxResults: Number(process.env.BATCH), campaignIdFilter: { include: [String(campaignId)] } },
            meta: { configId: getAccount?.configId, tokenKey: "adsAccessToken" },
        }));

        return { statusCode: 200, isSuccess: true, data: response?.data?.campaigns?.[0] };
    } catch (error) {
        write_logs({ message: `[getCampaignById Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return { statusCode: 500, isSuccess: false, message: error?.response?.data || error.message };
    }
};

const getProductAdsByAdGroupId = async ({ profileId, getAccount, checkConfigAds, adGroupId }) => {
    try {
        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/productAds/list`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spProductAd.v3+json",
                Accept: "application/vnd.spProductAd.v3+json"
            },
            data: { adGroupIdFilter: { include: [String(adGroupId)] }, maxResults: 100 }
        }));

        return { statusCode: 200, isSuccess: true, data: response?.data?.productAds || [] };
    } catch (error) {
        write_logs({ message: `[getProductAdsByAdGroupId Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return { statusCode: 500, isSuccess: false, message: error?.response?.data || error.message };
    }
};

const checkFirstError = (data) => {
    const errorValue = data?.error?.[0]?.errors?.[0]?.errorValue;
    const dynamicKey = errorValue ? Object.keys(errorValue)?.[0] : null;
    const errorMessage = dynamicKey ? errorValue[dynamicKey]?.message : null;
    return errorMessage
}

const createCampaign = async ({ profileId, getAccount, checkConfigAds, campaignData }) => {
    try {
        const body = {
            campaigns: [
                {
                    name: campaignData?.name,
                    targetingType: campaignData?.targetingType || "MANUAL",
                    state: campaignData?.state || "ENABLED",
                    budget: { budget: parseFloat(campaignData?.budget?.budget || 50), budgetType: "DAILY" },
                    startDate: campaignData?.startDate,
                    ...(campaignData?.endDate && { endDate: campaignData?.endDate }),
                    dynamicBidding: {
                        strategy: campaignData?.bidStrategy || "LEGACY_FOR_SALES",
                        placementBidding: campaignData?.placements || []
                    },
                    ...(campaignData?.siteType && campaignData?.siteType !== "AMAZON_HAUL" && { siteRestrictions: [campaignData.siteType] }),
                    offAmazonSettings: { offAmazonBudgetControlStrategy: "MAXIMIZE_REACH" }
                }
            ]
        };

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/campaigns`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spCampaign.v3+json",
                Accept: "application/vnd.spCampaign.v3+json"
            },
            data: body,
        }));

        const errorMessage = checkFirstError(response?.data?.campaigns);
        if (errorMessage) return { statusCode: 203, isSuccess: false, message: errorMessage, isDuplicate: errorMessage.toLowerCase().includes("already exists") };

        return { statusCode: 200, isSuccess: true, message: "Campaign created successfully.", campaignId: response?.data?.campaigns?.success?.[0]?.campaignId };
    } catch (error) {
        write_logs({ message: `[createCampaign Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return { statusCode: 500, isSuccess: false, message: error?.response?.data || error.message };
    }
};

const createAdGroup = async ({ profileId, getAccount, checkConfigAds, campaignId, adGroupName, defaultBid = 1 }) => {
    try {
        const body = { adGroups: [{ campaignId, name: adGroupName, defaultBid: parseFloat(defaultBid || 1), state: "ENABLED" }] };

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/adGroups`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spAdGroup.v3+json",
                Accept: "application/vnd.spAdGroup.v3+json"
            },
            data: body,
        }));

        const errorMessage = checkFirstError(response?.data?.adGroups);
        if (errorMessage) return { statusCode: 203, isSuccess: false, message: errorMessage };

        return { statusCode: 200, isSuccess: true, message: "AdGroup created successfully.", adGroupId: response?.data?.adGroups?.success?.[0]?.adGroupId };
    } catch (error) {
        write_logs({ message: `[createAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return { statusCode: 500, isSuccess: false, message: error?.response?.data || error.message };
    }
};

const createProductAds = async ({ profileId, getAccount, checkConfigAds, campaignId, adGroupId, products = [] }) => {
    try {
        const body = { productAds: products?.map((product) => ({ campaignId, adGroupId, asin: product?.asin, sku: product?.sku, state: "ENABLED" })) };

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/productAds`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spProductAd.v3+json",
                Accept: "application/vnd.spProductAd.v3+json"
            },
            data: body
        }));

        const errorMessage = checkFirstError(response?.data?.productAds);
        if (errorMessage) return { statusCode: 203, isSuccess: false, message: errorMessage };

        return { statusCode: 200, isSuccess: true, message: "Product ads created successfully.", productAds: response?.data?.productAds?.success || [] };
    } catch (error) {
        write_logs({ message: `[createProductAds Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return { statusCode: 500, isSuccess: false, message: error?.response?.data || error.message };
    }
};

exports.getKeywordAnalysisData = async (req, res) => {
    try {
        const configId = req?.config?.configId;

        let {
            searchTermPageNo,
            searchTermPerPage,
            campaignStatus = [],
            fromDate,
            toDate,
            targeting,
            profileId,
            fieldName,
            sortType,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required!" });
        }

        const profile = await getProfile(configId, profileId);
        if (!profile) {
            return res.status(203).send({ isSuccess: false, message: "Profile not found!" });
        }

        if (!fromDate || !toDate) {
            ({ fromDate, toDate } = getRuleDate(profile.timezone, "LAST_60_DAYS"));
        }

        if (!Array.isArray(campaignStatus)) campaignStatus = [];

        searchTermPageNo = searchTermPageNo || 1;
        searchTermPerPage = searchTermPerPage || 10;

        const skip = (searchTermPageNo - 1) * searchTermPerPage;

        const sortingField = fieldName || "targeting";
        const sortingOrder = sortType?.toUpperCase() === "DESC" ? -1 : 1;

        const lastSearchTermDoc = await targetingSchema.findOne({ configId, profileId: Number(profileId) }, { reportDate: 1 }).sort({ reportDate: -1 }).lean();
        const lastDate = lastSearchTermDoc?.reportDate ?? (toDate || moment().tz(profile.timezone).format("YYYY-MM-DD"));

        const basePipeline = [
            {
                $match: {
                    configId,
                    profileId: Number(profileId),
                    reportDate: { $gte: fromDate, $lte: toDate },
                    keywordType: { $nin: ["TARGETING_EXPRESSION_PREDEFINED", "TARGETING_EXPRESSION"] },
                    ...(targeting && { targeting: { $regex: new RegExp(RegExp.escape(`${targeting}`?.trim()), "i") } })
                },
            },
            { $match: { $or: [{ reportDate: { $ne: lastDate } }, { reportDate: lastDate, status: "ENABLED" }] } },
            {
                $group: {
                    _id: "$targetId",
                    campaignId: { $first: "$campaignId" },
                    adGroupId: { $first: "$adGroupId" },
                    targeting: { $first: "$targeting" },
                    keywordType: { $first: "$keywordType" },
                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                    orders: { $sum: "$orders" },
                    targeting: { $last: "$targeting" },
                    keywordType: { $last: "$keywordType" },
                    isTargetEnabledToday: { $max: { $cond: [{ $and: [{ $eq: ["$reportDate", lastDate] }, { $eq: ["$status", "ENABLED"] }] }, 1, 0] } }
                }
            },
            {
                $lookup: {
                    from: "campaigns",
                    let: { cId: "$campaignId", campaignStatuses: campaignStatus },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$campaignId", "$$cId"] }, { $eq: ["$reportDate", lastDate] }, ...(campaignStatus?.length ? [{ $in: ["$status", "$$campaignStatuses"] }] : [])] } } },
                        { $project: { _id: 0, campaignId: 1, campaignName: "$name", status: "$status" } }
                    ],
                    as: "activeCampaign"
                }
            },
            {
                $match: {
                    ...(campaignStatus.includes("ENABLED") && { activeCampaign: { $ne: [] } }),
                    ...(campaignStatus.includes("ENABLED") && { isTargetEnabledToday: 1 })
                }
            },
            { $addFields: { activeCampaign: { $arrayElemAt: ["$activeCampaign", 0] }, targetId: "$_id" } },
            {
                $addFields: {
                    campaignSpend: { $round: ["$spend", 2] },
                    campaignSales: { $round: ["$sales", 2] },
                    campaignCpc: { $round: [{ $cond: [{ $gt: ["$clicks", 0] }, { $divide: ["$spend", "$clicks"] }, 0] }, 2] },
                    campaignCtr: { $round: [{ $cond: [{ $gt: ["$impressions", 0] }, { $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 0] }, 2] },
                    campaignCvr: { $round: [{ $cond: [{ $gt: ["$clicks", 0] }, { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 0] }, 2] },
                    campaignAcos: { $round: [{ $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] }, 2] },
                    campaignRoas: { $round: [{ $cond: [{ $gt: ["$spend", 0] }, { $divide: ["$sales", "$spend"] }, 0] }, 2] }
                }
            },
            {
                $group: {
                    _id: {
                        targeting: "$targeting",
                        keywordType: "$keywordType"
                    },
                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                    orders: { $sum: "$orders" },
                    count: { $sum: 1 },
                    campaigns: {
                        $push: {
                            targetId: "$targetId",
                            campaignId: "$activeCampaign.campaignId",
                            campaignName: "$activeCampaign.campaignName",
                            campaignStatus: "$activeCampaign.status",
                            keywordType: "$keywordType",
                            matchType: "$matchType",
                            impressions: "$impressions",
                            clicks: "$clicks",
                            spend: "$campaignSpend",
                            sales: "$campaignSales",
                            orders: "$orders",
                            cpc: "$campaignCpc",
                            ctr: "$campaignCtr",
                            cvr: "$campaignCvr",
                            acos: "$campaignAcos",
                            roas: "$campaignRoas"
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    targeting: "$_id.targeting",
                    keywordType: "$_id.keywordType",
                    impressions: 1,
                    clicks: 1,
                    spend: { $round: ["$spend", 2] },
                    sales: 1,
                    orders: 1,
                    count: 1,
                    campaigns: 1
                }
            },
            {
                $group: {
                    _id: "$targeting",
                    keywordTypeCounts: {
                        $push: {
                            k: "$keywordType",
                            v: "$count"
                        }
                    },
                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                    orders: { $sum: "$orders" },
                    campaigns: { $push: "$campaigns" }
                }
            },
            {
                $addFields: {
                    keywordTypeCounts: { $arrayToObject: "$keywordTypeCounts" },
                    campaigns: {
                        $reduce: {
                            input: "$campaigns",
                            initialValue: [],
                            in: { $concatArrays: ["$$value", "$$this"] }
                        }
                    }
                }
            },
            {
                $replaceRoot: {
                    newRoot: {
                        $mergeObjects: [
                            { targeting: "$_id" },
                            "$keywordTypeCounts",
                            { impressions: "$impressions" },
                            { clicks: "$clicks" },
                            { spend: { $round: ["$spend", 2] } },
                            { sales: "$sales" },
                            { orders: "$orders" },
                            { campaigns: "$campaigns" }
                        ]
                    }
                }
            },
            {
                $addFields: {
                    cpc: { $round: [{ $cond: [{ $gt: ["$clicks", 0] }, { $divide: ["$spend", "$clicks"] }, 0] }, 2] },
                    ctr: { $round: [{ $cond: [{ $gt: ["$impressions", 0] }, { $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 0] }, 2] },
                    cvr: { $round: [{ $cond: [{ $gt: ["$clicks", 0] }, { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 0] }, 2] },
                    acos: { $round: [{ $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] }, 2] },
                    roas: { $round: [{ $cond: [{ $gt: ["$spend", 0] }, { $divide: ["$sales", "$spend"] }, 0] }, 2] }
                }
            },
            { $match: { $expr: { $gt: [{ $size: "$campaigns" }, 1] } } },
            {
                $facet: {
                    data: [
                        { $sort: { [sortingField]: sortingOrder } },
                        { $skip: skip },
                        { $limit: searchTermPerPage }
                    ],
                    totalCount: [{ $count: "count" }]
                }
            }
        ];

        const result = await targetingSchema.aggregate(basePipeline);

        const getKeywordAnalysisData = result?.[0]?.data || [];
        const totalCount = result?.[0]?.totalCount?.[0]?.count || 0;

        return res.status(200).send({
            isSuccess: true,
            getKeywordAnalysisData,
            totalKeywordAnalysisData: totalCount,
            searchTermCurrentPageNo: searchTermPageNo,
            searchTermTotalPages: Math.ceil(totalCount / searchTermPerPage),
            message: "Get keyword analysis data successfully."
        });
    } catch (error) {
        write_logs({ message: `[getKeywordAnalysisData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred"
        });
    }
};
