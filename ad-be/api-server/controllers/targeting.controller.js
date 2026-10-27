const { getConditionRows, captureManualSelection, prepareSnapshotBulkUpdates, updateSnapshotHistory } = require("../helpers/ruleConditionSnapshotHelper");
const { validateCampaignAssignment } = require("../helper/ruleCampaignAssignment");
const { sanitizeQueryObject } = require("../helper/sanitizeQuery");
const { getTargetingRuleDate } = require("../helper/targetingRuleDate");
const moment = require("moment-timezone");
const { retryWithBackoff } = require("../helper/retryHelper");
const crypto = require("crypto");

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const axios = require("axios");
const path = require("path");
const zlib = require("node:zlib");
const ExcelJS = require("exceljs");
const pLimit = require("p-limit").default;
const profileLimit = pLimit(Number(process.env.PROCESS_LIMIT) || 3);
const ruleLimit = pLimit(5);

const profileSchema = require("../models/profiles.model");
const reportsSchema = require("../models/report.model");
const cronJobSchema = require("../models/cronJob.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const campaignSchema = require("../models/campaign.model");
const adGroupsSchema = require("../models/adGroups.model");
const targetingSchema = require("../models/targeting.model");
const filterSchema = require("../models/filter.model");
const targetingRuleSchema = require("../models/targetingRuleSchema.model");
const targetingRuleHistorySchema = require("../models/targetingRuleHistory.model");
const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const affectedCampaignByRuleSchema = require("../models/affectedCampaignByRule.model");
const campaignSettingSchema = require("../models/camapignSetting.model");
const campaignProductEligibleStatusByRuleSchema = require("../models/campaignProductEligibleStatusByRule.model");
const ruleRunHistorySchema = require("../models/ruleRunHistory.model");
const ruleBlockedTimeSchema = require("../models/ruleBlockedTime.model");
const ruleActionExecutionSchema = require("../models/ruleActionExecution.model");

const sbCampaignSchema = require("../models/sbCampaign.model");
const sbAdGroupsSchema = require("../models/sbAdGroups.model");
const sbTargetingSchema = require("../models/sbTargeting.model");

const sdCampaignSchema = require("../models/sdCampaign.model");
const sdAdGroupsSchema = require("../models/sdAdGroups.model");
const sdTargetingSchema = require("../models/sdTargeting.model");
const targetingHistorySchema = require("../models/targetingHistory.model");
const { recordRuleExecutionChange, enrichWithCampaignMetrics } = require("../helpers/ruleImpactMetricsHelper");
const { write_logs } = require("../../winston/targeting/logger");

const {
    getProfile,
    buildFieldFilter,
    getTartetingtype,
    getNextTime,
    getRuleDate,
    getAccessToken,
    getBidThreshold,
    unzipReport,
    removeCampaignIdFromQuery,
    getActivePlanProfiles,
    parallelBulkWrite,
    downloadFile,
    safeJSON,
    getRuleSettings,
    getMarketplaceMinBid,
    safeJsonParse,
    getAllowedSyncProfiles,
    getAxiosErrorMessage,
    getActiveSlot,
} = require("../helper/common");

const { checkCampaignProductAvailability } = require("../helper/checkEligibility");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { isDuplicateTargetingRule, checkDuplicateTargetingRule } = require("../helper/ruleChecker");

const amazonAxios = require("../helper/amazonAxios");
const { processBatchUpdates } = require("../services/amazonBatchService");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { resolveTargeting } = require("../helper/findTargeting");
const { logAudit } = require("../helpers/auditHelper");
const adNotificationSchema = require("../models/adNotification.model");
const { sendNotificationToUser } = require("../helper/sendNotification");
const { stageReportFileInRedis } = require("../services/reportFileStager.service");
const { processStagedReportBatches } = require("../services/reportBatchWriter.service");
const { linkReportHistory } = require("../services/reportHistoryCompletion.service");

const sendMinBidClampedNotification = async ({
    profile,
    rule,
    targeting,
    calculatedBid,
    clampedBid,
    marketMin,
    adType = "SP",
}) => {
    try {
        const currencyCode = profile?.currencyCode || "USD";
        const targetName = targeting?.targeting || targeting?.keywordText || targeting?.targetId || "Target";
        const campaignName = targeting?.campaignName || "Campaign";
        const ruleName = rule?.ruleName || "Targeting Rule";

        const title = "Targeting Bid Below Minimum Limit";
        const text = `Rule "${ruleName}" attempted to set bid to ${currencyCode} ${Number(calculatedBid).toFixed(2)} for targeting "${targetName}" in campaign "${campaignName}", which is below the marketplace minimum allowed bid of ${currencyCode} ${Number(marketMin).toFixed(2)}. The bid was automatically adjusted to ${currencyCode} ${Number(clampedBid).toFixed(2)}.`;

        await adNotificationSchema.create({
            configId: rule.configId,
            profileId: profile.profileId || rule.profileId,
            notificationTitle: title,
            notificationText: text,
            searchable: "TargetingRule",
            seen: false,
        });

        await sendNotificationToUser(profile.profileId || rule.profileId, title, text);

        cron_logs({
            message: `sendMinBidClampedNotification -> Notification sent: Rule "${ruleName}", Target "${targetName}", Attempted: ${calculatedBid}, Clamped: ${clampedBid}`,
            log_type: "info",
        });
    } catch (err) {
        cron_logs({
            message: `sendMinBidClampedNotification -> Error: ${err?.message || err}`,
            log_type: "error",
        });
    }
};

exports.cronGenerateTargetingReport = async (generateWeeklyReport = false, generateBiWeeklyReport = false, pastSyncObj = null) => {
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
                : "Targeting Report";

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
                message: `Cron Targeting Report stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
                log_type: "warn"
            });
        }

        cron_logs({
            message: `[${cronName}] Cron started for ${getProfileId.length} profile(s). (Weekly: ${generateWeeklyReport}, BiWeekly: ${generateBiWeeklyReport}, Recurring: ${recurring})`,
            log_type: "info"
        });

        const reportPromises = getProfileId.map((profile) => profileLimit(async () => {
            if (global.updateTaskProgress) global.updateTaskProgress(generateBiWeeklyReport ? "BiWeekly Report" : generateWeeklyReport ? "Weekly Report" : "TargetingReport");
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
                    recurring
                );

                cron_logs({
                    message: `[${cronName}: Sponsored Products] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSpResponse}`,
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
                    message: `[${cronName}: Sponsored Brands] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSbResponse}`,
                    log_type: "info"
                });

                const reportSdResponse = await sdGenerateReport(
                    profile.profileId,
                    startDate,
                    endDate,
                    checkConfigAds,
                    profile.configId,
                    profile.timezone,
                    recurring
                );

                cron_logs({
                    message: `[${cronName}: Sponsored Display] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSdResponse}`,
                    log_type: "info"
                });

                await linkReportHistory({
                    historyId: getCronData?._id || cronjobid,
                    configId: profile.configId, profileId: profile.profileId,
                    reportName: "Targeting Report", startDate, endDate,
                });

                // Update cron history based on report response
                if ([reportSpResponse, reportSbResponse, reportSdResponse].includes("ERROR") && recurring) {
                    if (getCronData?._id) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "FAILED" },
                            { new: true },
                        );
                    }
                    return "ERROR";
                } else if (recurring && [reportSpResponse, reportSbResponse, reportSdResponse].every(status => status === "COMPLETED")) {
                    if (getCronData?._id) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "COMPLETED" },
                            { new: true },
                        );
                    }
                    return "COMPLETED";
                }

                if (!recurring && cronjobid && reportSpResponse == "COMPLETED" && reportSbResponse == "COMPLETED" && reportSdResponse == "COMPLETED") {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true },
                    );
                    return "COMPLETED";
                }

                return [reportSpResponse, reportSbResponse, reportSdResponse].includes("ERROR")
                    ? "ERROR"
                    : [reportSpResponse, reportSbResponse, reportSdResponse].includes("STAGED")
                        ? "STAGED"
                        : reportSpResponse;
            } else {
                return cron_logs({
                    message: `[${cronName}] Profile ${profile.name} (${profile.profileId}): Account credentials invalid or disconnected.`,
                    log_type: "info"
                });
            }
        }));

        await Promise.all(reportPromises);

        return cron_logs({
            message: `[${cronName}] Cron finished successfully for ${getProfileId.length} profile(s).`,
            log_type: "info"
        });

    } catch (error) {
        return cron_logs({
            message: `[Targeting Report] Error during cron execution: ${error.stack || error.message || error}`,
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
                reportTypeId: "spTargeting",
                reportName: "Targeting Report",
            }).lean();

            if (existing && existing.status == "COMPLETED") return "COMPLETED";
            if (existing && existing.status == "STAGED") return "STAGED";
        } else {
            // 1️⃣ Check recent pending report (created within last 24 hours)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            existing = await reportsSchema.findOne({
                profileId,
                configId,
                reportTypeId: "spTargeting",
                reportName: "Targeting Report",
                status: "PENDING",
                createdAt: { $gte: twentyFourHoursAgo },
            }).sort({ createdAt: -1 }).lean();
        }

        if (!existing) {
            const isVendor = getAccount?.type?.toLowerCase() === "vendor";
            const purchasesCol = isVendor ? "purchases14d" : "purchases7d";
            const salesCol = isVendor ? "sales14d" : "sales7d";
            const createResp = await retryWithBackoff(() => amazonAxios({
                method: "POST",
                url: `${getAccount.amazonUrl}/reporting/reports`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profileId,
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
                },
                data: {
                    name: "",
                    startDate,
                    endDate,
                    configuration: {
                        adProduct: "SPONSORED_PRODUCTS",
                        groupBy: ["targeting"],
                        columns: [
                            "date",
                            "campaignName",
                            "campaignId",
                            "adGroupName",
                            "adGroupId",
                            "campaignStatus",
                            "targeting",
                            "keywordType",
                            "adKeywordStatus",
                            "matchType",
                            "impressions",
                            "clicks",
                            "cost",
                            purchasesCol,
                            salesCol,
                            "sales1d",
                            "campaignBudgetType",
                            "campaignBudgetAmount",
                            "keywordBid",
                            "topOfSearchImpressionShare",
                            "retailer"
                        ],
                        reportTypeId: "spTargeting",
                        timeUnit: "DAILY",
                        format: "GZIP_JSON"
                    },
                },
                meta: { configId, tokenKey: "adsAccessToken" },
            }));

            await reportsSchema.create({
                profileId,
                configId,
                reportId: createResp?.data?.reportId,
                startDate: createResp?.data?.startDate,
                endDate: createResp?.data?.endDate,
                status: createResp?.data?.status,
                adProduct: createResp?.data?.configuration?.adProduct,
                reportTypeId: createResp?.data?.configuration?.reportTypeId,
                reportName: "Targeting Report",
            });

            return createResp.data.status;
        }

        // 2️⃣ Poll status
        const statusResp = await retryWithBackoff(() => amazonAxios({
            method: "GET",
            url: `${getAccount.amazonUrl}/reporting/reports/${existing.reportId}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            },
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (statusResp.data.status !== "COMPLETED") {
            return statusResp.data.status;
        }

        // 3️⃣ Download file
        const zipPath = path.resolve(__dirname, "../../uploads/targeting/sp-report", `${existing.reportId}.gz.json`);
        const extractionPath = zipPath.replace(".gz.json", ".json");

        await downloadFile(statusResp.data.url, zipPath);
        await unzipReport(zipPath, extractionPath);

        await stageTargetingReport({
            entity: "targeting",
            report: existing,
            filePath: extractionPath,
            profileId,
            configId,
            accountType: getAccount?.type,
            reportTypeId: "spTargeting",
            startDate,
            endDate,
            reportCreatedAt: statusResp.data?.createdAt || existing.createdAt,
        });

        // ♻️ RECURRING POLL — SAFE RECURSION
        if (recurring) {

            const currentHour = moment().tz(timezone).hour();
            if (currentHour !== 23) {

                // let event loop breathe before next poll
                await new Promise(r => setTimeout(r, 30000));

                return await spGenerateReport(
                    profileId,
                    startDate,
                    endDate,
                    checkConfigAds,
                    configId,
                    timezone,
                    recurring
                );
            }
        }

        return "STAGED";
    } catch (err) {
        cron_logs({
            message: `[Targeting Report SP] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(err)}`,
            log_type: "warn",
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
    recurring = false
) {

    const getAccount = await getProfile(configId, profileId);

    let existing;
    if (!recurring) {
        existing = await reportsSchema.findOne({
            startDate,
            endDate,
            profileId,
            configId,
            reportTypeId: "sbTargeting",
            reportName: "Targeting Report",
        }).lean();

        if (existing && existing.status == "COMPLETED") return "COMPLETED";
        if (existing && existing.status == "STAGED") return "STAGED";
    } else {
        // 1️⃣ Check recent pending report (created within last 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        existing = await reportsSchema.findOne({
            profileId,
            configId,
            reportTypeId: "sbTargeting",
            reportName: "Targeting Report",
            status: "PENDING",
            createdAt: { $gte: twentyFourHoursAgo },
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
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
                },
                data: {
                    name: "",
                    startDate,
                    endDate,
                    configuration: {
                        adProduct: "SPONSORED_BRANDS",
                        groupBy: ["targeting"],
                        columns: [
                            "date",
                            "campaignName",
                            "campaignId",
                            "adGroupName",
                            "adGroupId",
                            "campaignStatus",
                            "targetingText",
                            "targetingId",
                            "keywordType",
                            "adKeywordStatus",
                            "matchType",
                            "impressions",
                            "clicks",
                            "cost",
                            "sales",
                            "purchases",
                            "campaignBudgetType",
                            "campaignBudgetAmount",
                            "keywordBid",
                            "topOfSearchImpressionShare",
                        ],
                        reportTypeId: "sbTargeting",
                        timeUnit: "DAILY",
                        format: "GZIP_JSON"
                    },
                },
                meta: { configId, tokenKey: "adsAccessToken" },
            }));
        } catch (err) {
            cron_logs({
                message: `[Targeting Report SB] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(err)}`,
                log_type: "warn",
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
            reportName: "Targeting Report",
        });

        return createResp.data.status;
    }

    // 2️⃣ Poll status
    const statusResp = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${getAccount.amazonUrl}/reporting/reports/${existing.reportId}`,
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        },
        meta: { configId: configId, tokenKey: "adsAccessToken" }
    }));

    if (statusResp.data.status !== "COMPLETED") {
        return statusResp.data.status;
    }

    // 3️⃣ Download file
    const zipPath = path.resolve(__dirname, "../../uploads/targeting/sb-report", `${existing.reportId}.gz.json`);
    const extractionPath = zipPath.replace(".gz.json", ".json");

    await downloadFile(statusResp.data.url, zipPath);
    await unzipReport(zipPath, extractionPath);

    await stageTargetingReport({
        entity: "sbTargeting",
        report: existing,
        filePath: extractionPath,
        profileId,
        configId,
        accountType: getAccount?.type,
        reportTypeId: "sbTargeting",
        startDate,
        endDate,
        reportCreatedAt: statusResp.data?.createdAt || existing.createdAt,
    });

    // ♻️ RECURRING POLL — SAFE RECURSION
    if (recurring) {

        const currentHour = moment().tz(timezone).hour();
        if (currentHour !== 23) {

            // let event loop breathe before next poll
            await new Promise(r => setTimeout(r, 30000));

            return await sbGenerateReport(
                profileId,
                startDate,
                endDate,
                checkConfigAds,
                configId,
                timezone,
                recurring
            );
        }
    }

    return "STAGED";
};

async function sdGenerateReport(
    profileId,
    startDate,
    endDate,
    checkConfigAds,
    configId,
    timezone,
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
                reportTypeId: "sdTargeting",
                reportName: "Targeting Report",
            }).lean();

            if (existing && existing.status == "COMPLETED") return "COMPLETED";
            if (existing && existing.status == "STAGED") return "STAGED";
        } else {
            // 1️⃣ Check recent pending report (created within last 24 hours)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            existing = await reportsSchema.findOne({
                profileId,
                configId,
                reportTypeId: "sdTargeting",
                reportName: "Targeting Report",
                status: "PENDING",
                createdAt: { $gte: twentyFourHoursAgo },
            }).sort({ createdAt: -1 }).lean();
        }

        if (!existing) {
            const createResp = await retryWithBackoff(() => amazonAxios({
                method: "POST",
                url: `${getAccount.amazonUrl}/reporting/reports`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profileId,
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
                },
                data: {
                    name: "",
                    startDate,
                    endDate,
                    configuration: {
                        adProduct: "SPONSORED_DISPLAY",
                        groupBy: ["targeting"],
                        columns: [
                            "date",
                            "campaignName",
                            "campaignId",
                            "adGroupName",
                            "adGroupId",
                            "targetingText",
                            "targetingId",
                            "adKeywordStatus",
                            "impressions",
                            "clicks",
                            "cost",
                            "sales",
                            "purchases",
                        ],
                        reportTypeId: "sdTargeting",
                        timeUnit: "DAILY",
                        format: "GZIP_JSON"
                    },
                },
                meta: { configId, tokenKey: "adsAccessToken" },
            }));

            await reportsSchema.create({
                profileId,
                configId,
                reportId: createResp?.data?.reportId,
                startDate: createResp?.data?.startDate,
                endDate: createResp?.data?.endDate,
                status: createResp?.data?.status,
                adProduct: createResp?.data?.configuration?.adProduct,
                reportTypeId: createResp?.data?.configuration?.reportTypeId,
                reportName: "Targeting Report",
            });

            return createResp.data.status;
        }

        // 2️⃣ Poll status
        const statusResp = await retryWithBackoff(() => amazonAxios({
            method: "GET",
            url: `${getAccount.amazonUrl}/reporting/reports/${existing.reportId}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
            },
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (statusResp.data.status !== "COMPLETED") {
            return statusResp.data.status;
        }

        // 3️⃣ Download file
        const zipPath = path.resolve(__dirname, "../../uploads/targeting/sd-report", `${existing.reportId}.gz.json`);
        const extractionPath = zipPath.replace(".gz.json", ".json");

        await downloadFile(statusResp.data.url, zipPath);
        await unzipReport(zipPath, extractionPath);

        await stageTargetingReport({
            entity: "sdTargeting",
            report: existing,
            filePath: extractionPath,
            profileId,
            configId,
            accountType: getAccount?.type,
            reportTypeId: "sdTargeting",
            startDate,
            endDate,
            reportCreatedAt: statusResp.data?.createdAt || existing.createdAt,
        });

        // ♻️ RECURRING POLL — SAFE RECURSION
        if (recurring) {

            const currentHour = moment().tz(timezone).hour();
            if (currentHour !== 23) {

                // let event loop breathe before next poll
                await new Promise(r => setTimeout(r, 30000));

                return await sdGenerateReport(
                    profileId,
                    startDate,
                    endDate,
                    checkConfigAds,
                    configId,
                    timezone,
                    recurring
                );
            }
        }

        return "STAGED";
    } catch (err) {
        cron_logs({
            message: `[Targeting Report SD] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(err)}`,
            log_type: "warn",
        });
        return "ERROR";
    }
};

const stageTargetingReport = async ({
    entity, report, filePath, profileId, configId, accountType,
    reportTypeId, startDate, endDate, reportCreatedAt,
}) => {
    const importRunId = `run_${entity}_${report.reportId}_${Date.now()}`;
    try {
        await stageReportFileInRedis({
            importRunId,
            entity,
            filePath,
            meta: {
                profileId,
                configId,
                accountType,
                reportId: report.reportId,
                reportTypeId,
                startDate,
                endDate,
                reportCreatedAt: reportCreatedAt || new Date().toISOString(),
            },
        });

        await reportsSchema.updateOne(
            { _id: report._id },
            { $set: { status: "STAGED", importRunId } },
        );

        processStagedReportBatches([entity]).catch((err) => {
            cron_logs({
                message: `[Targeting Report ${entity}] Background writer failed for ${report.reportId}: ${err.message}`,
                log_type: "error",
            });
        });
    } catch (err) {
        await reportsSchema.updateOne(
            { _id: report._id },
            { $set: { status: "FAILED" } },
        );
        throw err;
    }
};

exports.getTargeting = async (req, res) => {
    const configId = req?.config?.configId;
    const { adTypeTargetingSchema } = req.models;
    const adType = req.adType;

    try {
        let {
            fromDate,
            toDate,
            profileId,
            campaignId,
            adGroupId,
            pageNo = 1,
            perPage = 10,
            gridFilter,
            searchName,
            fieldName,
            fieldOperator,
            fieldValue,
            conditions,
            extraFieldOperator,
            extraFieldValue,
            sortType,
            filteredTargetingIds = [],
            query: Query,
            isExactSearchMatch = false,
        } = req.body;

        if (!profileId) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const profile = await getProfile(configId, profileId);
        const resolvedConfigId = profile?.configId ? new ObjectId(profile.configId) : (configId && ObjectId.isValid(configId) ? new ObjectId(configId) : configId);
        const numericProfileId = Number(profileId) || profileId;
        const timezone = profile?.timezone;

        const reportDate = {
            $gte: fromDate || moment().tz(timezone).format("YYYY-MM-DD"),
            $lte: toDate || moment().tz(timezone).format("YYYY-MM-DD"),
        };

        const targetModel = adTypeTargetingSchema || targetingSchema;
        const lastTargetDoc = await targetModel.findOne({ configId: resolvedConfigId, profileId: numericProfileId }, { reportDate: 1 }).sort({ reportDate: -1 }).lean().exec();
        const lastTargetDateVal = lastTargetDoc?.reportDate ?? reportDate.$lte;
        const lastDate = lastTargetDateVal > (toDate || reportDate.$lte) ? (toDate || reportDate.$lte) : lastTargetDateVal;

        let campaignIdFilter = null;
        if (campaignId) {
            if (Array.isArray(campaignId) && campaignId.length > 0) {
                campaignIdFilter = campaignId.length === 1 ? (Number(campaignId[0]) || campaignId[0]) : { $in: campaignId.map(id => Number(id) || id) };
            } else if (!Array.isArray(campaignId) && campaignId !== "" && campaignId !== null && campaignId !== undefined) {
                campaignIdFilter = Number(campaignId) || campaignId;
            }
        }

        let adGroupIdFilter = null;
        if (adGroupId) {
            if (Array.isArray(adGroupId) && adGroupId.length > 0) {
                adGroupIdFilter = adGroupId.length === 1 ? (Number(adGroupId[0]) || adGroupId[0]) : { $in: adGroupId.map(id => Number(id) || id) };
            } else if (!Array.isArray(adGroupId) && adGroupId !== "" && adGroupId !== null && adGroupId !== undefined) {
                adGroupIdFilter = Number(adGroupId) || adGroupId;
            }
        }

        let query = {
            configId: resolvedConfigId,
            profileId: numericProfileId,
            reportDate,
            ...(campaignIdFilter && { campaignId: campaignIdFilter }),
            ...(adGroupIdFilter && { adGroupId: adGroupIdFilter }),
            ...(filteredTargetingIds?.length > 0 && { targetId: { $in: filteredTargetingIds } }),
            ...(searchName && (isExactSearchMatch ? { targeting: searchName } : { targeting: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } })),
        };

        if (gridFilter) {
            const filter = await filterSchema.findOne({ _id: new ObjectId(gridFilter) }).lean();
            if (filter?.filter) {
                let parsed = sanitizeQueryObject(safeJsonParse(filter.filter));
                Object.assign(query, parsed);
            }
        }

        const joinedFields = ["campaignName", "campaignStatus", "adGroupName", "adGroupStatus", "budget", "daysSinceCreation", "bidThreshold"];
        const queryStr = Query ? (typeof Query === "string" ? Query : JSON.stringify(Query)) : "";
        const isJoinedFilter = (fieldName && joinedFields.includes(fieldName)) || (queryStr && joinedFields.some(f => queryStr.includes(f)));
        const isJoinedSort = (fieldName && joinedFields.includes(fieldName));
        const needsEarlyLookup = Boolean(isJoinedFilter || isJoinedSort);

        const page = Math.max(1, Number(pageNo) || 1);
        const limitCount = Math.max(1, Number(perPage) || 10);
        const skipCount = (page - 1) * limitCount;

        const sortStage = {};
        if (sortType === "ASC") {
            sortStage[fieldName] = 1;
        } else if (sortType === "DESC") {
            sortStage[fieldName] = -1;
        } else {
            sortStage.targetId = -1;
        }

        const lookupStages = [
            {
                $lookup: {
                    from: AD_TYPE_COLLECTIONS?.[adType]?.["campaign"],
                    let: {
                        cId: "$_id.campaignId",
                        pId: "$_id.profileId",
                        end: lastDate
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$campaignId", "$$cId"] },
                                        { $eq: ["$profileId", "$$pId"] },
                                        { $eq: ["$reportDate", "$$end"] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 },
                        {
                            $project: {
                                _id: 0,
                                campaignId: 1,
                                name: 1,
                                status: 1,
                                budget: 1,
                                startDate: 1
                            }
                        }
                    ],
                    as: "campaign"
                }
            },
            {
                $unwind: { path: "$campaign", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup: {
                    from: AD_TYPE_COLLECTIONS?.[adType]?.["adGroup"],
                    let: {
                        agId: "$_id.adGroupId",
                        pId: "$_id.profileId",
                        end: lastDate
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$adGroupId", "$$agId"] },
                                        { $eq: ["$profileId", "$$pId"] },
                                        { $eq: ["$reportDate", "$$end"] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 },
                        { $project: { _id: 0, adGroupId: 1, name: 1, status: 1 } }
                    ],
                    as: "adGroup"
                }
            },
            {
                $unwind: { path: "$adGroup", preserveNullAndEmptyArrays: true }
            },
            {
                $lookup: {
                    from: "campaignbidthresholds",
                    let: {
                        cId: "$campaign.campaignId"
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: ["$campaignId", "$$cId"]
                                        }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 },
                        {
                            $project: {
                                _id: 0,
                                minBid: 1,
                                maxBid: 1
                            }
                        }
                    ],
                    as: "bidThreshold"
                }
            },
            {
                $unwind: {
                    path: "$bidThreshold",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    targetId: 1,
                    targeting: 1,
                    profileId: 1,
                    impressions: 1,
                    clicks: 1,
                    orders: 1,
                    keywordBid: 1,
                    status: 1,
                    keywordType: 1,
                    matchType: 1,
                    spend: 1,
                    sales: 1,
                    topOfSearchImpressionShare: 1,
                    campaignId: 1,
                    campaignName: "$campaign.name",
                    campaignStatus: "$campaign.status",
                    adGroupId: 1,
                    adGroupName: "$adGroup.name",
                    adGroupStatus: "$adGroup.status",
                    budget: "$campaign.budget",
                    bidThreshold: 1,
                    acos: 1,
                    roas: 1,
                    cpc: 1,
                    ctr: 1,
                    cvr: 1,
                    conversionRate: 1,
                    daysSinceCreation: {
                        $cond: [
                            { $and: [{ $ne: ["$campaign.startDate", null] }, { $ne: ["$campaign.startDate", ""] }] },
                            {
                                $floor: {
                                    $divide: [
                                        { $subtract: [{ $toDate: lastDate }, { $toDate: "$campaign.startDate" }] },
                                        86400000
                                    ]
                                }
                            },
                            0
                        ]
                    }
                }
            }
        ];

        const matchFilterStages = [];
        if (Query) {
            matchFilterStages.push({
                $match: sanitizeQueryObject(safeJsonParse(Query))
            });
        }

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
                matchFilterStages.push({ $match: logicalOperator });
            } else {
                matchFilterStages.push({ $match: fieldFilter });
            }
        }

        const baseGroupPipeline = [
            { $match: query },
            { $sort: { reportDate: 1 } },
            {
                $group: {
                    _id: {
                        campaignId: "$campaignId",
                        adGroupId: "$adGroupId",
                        targetId: "$targetId",
                        profileId: "$profileId",
                    },
                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    orders: { $sum: "$orders" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                    topOfSearchImpressionShare: {
                        $avg: {
                            $toDouble: { $ifNull: ["$topOfSearchImpressionShare", "0"] }
                        }
                    },
                    targeting: { $first: "$targeting" },
                    keywordBid: { $last: "$keywordBid" },
                    reportDate: { $last: "$reportDate" },
                    status: { $last: "$status" },
                    keywordType: { $last: "$keywordType" },
                    matchType: { $last: "$matchType" },
                    campaignId: { $last: "$campaignId" },
                    adGroupId: { $last: "$adGroupId" }
                }
            },
            {
                $addFields: {
                    targetId: "$_id.targetId",
                    profileId: "$_id.profileId",
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
                    },
                    cvr: {
                        $cond: [
                            { $gt: ["$clicks", 0] },
                            { $round: [{ $divide: ["$orders", "$clicks"] }, 100] },
                            0
                        ]
                    },
                    conversionRate: {
                        $cond: [
                            { $gt: ["$clicks", 0] },
                            { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] },
                            0
                        ]
                    },
                }
            }
        ];

        let pipeline = [];
        if (!needsEarlyLookup) {
            // Fast path: Filter on metrics/status first, paginate, then join lookups on 10 items
            pipeline = [
                ...baseGroupPipeline,
                ...matchFilterStages,
                {
                    $facet: {
                        totalRow: [
                            {
                                $group: {
                                    _id: null,
                                    totalKeywordBid: { $sum: "$keywordBid" },
                                    totalImpressions: { $sum: "$impressions" },
                                    avgTopOfSearchImpressionShare: { $avg: "$topOfSearchImpressionShare" },
                                    totalClicks: { $sum: "$clicks" },
                                    totalSpend: { $sum: "$spend" },
                                    totalOrders: { $sum: "$orders" },
                                    totalSales: { $sum: "$sales" },
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    action: "Total",
                                    name: "Total",
                                    keywordBid: { $round: ["$totalKeywordBid", 2] },
                                    impressions: { $round: ["$totalImpressions", 2] },
                                    topOfSearchImpressionShare: { $round: ["$avgTopOfSearchImpressionShare", 2] },
                                    clicks: { $round: ["$totalClicks", 2] },
                                    spend: { $round: ["$totalSpend", 2] },
                                    orders: { $round: ["$totalOrders", 2] },
                                    sales: { $round: ["$totalSales", 2] },
                                    conversionRate: {
                                        $cond: [
                                            { $gt: ["$totalClicks", 0] },
                                            {
                                                $round: [
                                                    { $multiply: [{ $divide: ["$totalOrders", "$totalClicks"] }, 100] },
                                                    2
                                                ]
                                            },
                                            0
                                        ]
                                    },
                                    cvr: {
                                        $cond: [
                                            { $gt: ["$totalClicks", 0] },
                                            {
                                                $round: [
                                                    { $multiply: [{ $divide: ["$totalOrders", "$totalClicks"] }, 100] },
                                                    2
                                                ]
                                            },
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
                                            {
                                                $round: [
                                                    { $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] },
                                                    2
                                                ]
                                            },
                                            0
                                        ]
                                    },
                                    acos: {
                                        $cond: [
                                            { $gt: ["$totalSales", 0] },
                                            {
                                                $round: [
                                                    { $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] },
                                                    2
                                                ]
                                            },
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
                                    isTotalRow: true
                                }
                            }
                        ],
                        totalCount: [{ $count: "count" }],
                        data: [
                            { $sort: sortStage },
                            { $skip: skipCount },
                            { $limit: limitCount },
                            ...lookupStages,
                        ],
                    }
                }
            ];
        } else {
            // Early lookup path: When sorting or filtering on campaignName, adGroupName, etc.
            pipeline = [
                ...baseGroupPipeline,
                ...lookupStages,
                ...matchFilterStages,
                {
                    $facet: {
                        totalRow: [
                            {
                                $group: {
                                    _id: null,
                                    totalKeywordBid: { $sum: "$keywordBid" },
                                    totalImpressions: { $sum: "$impressions" },
                                    avgTopOfSearchImpressionShare: { $avg: "$topOfSearchImpressionShare" },
                                    totalClicks: { $sum: "$clicks" },
                                    totalSpend: { $sum: "$spend" },
                                    totalOrders: { $sum: "$orders" },
                                    totalSales: { $sum: "$sales" },
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    action: "Total",
                                    name: "Total",
                                    keywordBid: { $round: ["$totalKeywordBid", 2] },
                                    impressions: { $round: ["$totalImpressions", 2] },
                                    topOfSearchImpressionShare: { $round: ["$avgTopOfSearchImpressionShare", 2] },
                                    clicks: { $round: ["$totalClicks", 2] },
                                    spend: { $round: ["$totalSpend", 2] },
                                    orders: { $round: ["$totalOrders", 2] },
                                    sales: { $round: ["$totalSales", 2] },
                                    conversionRate: {
                                        $cond: [
                                            { $gt: ["$totalClicks", 0] },
                                            {
                                                $round: [
                                                    { $multiply: [{ $divide: ["$totalOrders", "$totalClicks"] }, 100] },
                                                    2
                                                ]
                                            },
                                            0
                                        ]
                                    },
                                    cvr: {
                                        $cond: [
                                            { $gt: ["$totalClicks", 0] },
                                            {
                                                $round: [
                                                    { $multiply: [{ $divide: ["$totalOrders", "$totalClicks"] }, 100] },
                                                    2
                                                ]
                                            },
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
                                            {
                                                $round: [
                                                    { $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] },
                                                    2
                                                ]
                                            },
                                            0
                                        ]
                                    },
                                    acos: {
                                        $cond: [
                                            { $gt: ["$totalSales", 0] },
                                            {
                                                $round: [
                                                    { $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] },
                                                    2
                                                ]
                                            },
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
                                    isTotalRow: true
                                }
                            }
                        ],
                        totalCount: [{ $count: "count" }],
                        data: [
                            { $sort: sortStage },
                            { $skip: skipCount },
                            { $limit: limitCount },
                        ],
                    }
                }
            ];
        }

        const result = await targetModel.aggregate(pipeline).allowDiskUse(true);
        const facetResult = result[0] || {};
        const targetingResult = facetResult.data || [];
        const totalRecords = facetResult.totalCount?.[0]?.count || 0;
        const totalRow = facetResult.totalRow?.[0] || {};

        return res.status(200).send({
            isSuccess: true,
            getTargeting: targetingResult,
            totalRow: totalRow ?? {},
            currentPageNo: page,
            totalRecords: totalRecords,
            totalPages: Math.ceil(totalRecords / limitCount),
        });

    } catch (error) {
        write_logs({ message: `[getTargeting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.targetingPipeline = (query, lastDate, adType = "SP") => {
    const commonPipeline = [
        { $match: query },
        { $sort: { reportDate: 1 } },
        {
            $group: {
                _id: {
                    campaignId: "$campaignId",
                    adGroupId: "$adGroupId",
                    targetId: "$targetId",
                    profileId: "$profileId",
                },
                impressions: { $sum: "$impressions" },
                clicks: { $sum: "$clicks" },
                orders: { $sum: "$orders" },
                spend: { $sum: "$spend" },
                sales: { $sum: "$sales" },
                topOfSearchImpressionShare: {
                    $avg: {
                        $toDouble: { $ifNull: ["$topOfSearchImpressionShare", "0"] }
                    }
                },
                targeting: { $first: "$targeting" },
                keywordBid: { $last: "$keywordBid" },
                reportDate: { $last: "$reportDate" },
                status: { $last: "$status" },
                keywordType: { $last: "$keywordType" },
                matchType: { $last: "$matchType" },
                campaignId: { $last: "$campaignId" },
                adGroupId: { $last: "$adGroupId" }
            }
        },
        {
            $lookup: {
                from: AD_TYPE_COLLECTIONS?.[adType]?.["campaign"],
                let: {
                    cId: "$_id.campaignId",
                    pId: "$_id.profileId",
                    end: lastDate
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$campaignId", "$$cId"] },
                                    { $eq: ["$profileId", "$$pId"] },
                                    { $eq: ["$reportDate", "$$end"] }
                                ]
                            }
                        }
                    },
                    { $limit: 1 },
                    {
                        $project: {
                            _id: 0,
                            campaignId: 1,
                            name: 1,
                            status: 1,
                            budget: 1,
                            startDate: 1
                        }
                    }
                ],
                as: "campaign"
            }
        },
        {
            $unwind: { path: "$campaign", preserveNullAndEmptyArrays: true }
        },
        {
            $lookup: {
                from: AD_TYPE_COLLECTIONS?.[adType]?.["adGroup"],
                let: {
                    agId: "$_id.adGroupId",
                    pId: "$_id.profileId",
                    end: lastDate
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$adGroupId", "$$agId"] },
                                    { $eq: ["$profileId", "$$pId"] },
                                    { $eq: ["$reportDate", "$$end"] }
                                ]
                            }
                        }
                    },
                    { $limit: 1 },
                    { $project: { _id: 0, adGroupId: 1, name: 1, status: 1 } }
                ],
                as: "adGroup"
            }
        },
        {
            $unwind: { path: "$adGroup", preserveNullAndEmptyArrays: true }
        },
        {
            $lookup: {
                from: "campaignbidthresholds",
                let: {
                    cId: "$campaign.campaignId"
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    {
                                        $eq: ["$campaignId", "$$cId"]
                                    }
                                ]
                            }
                        }
                    },
                    { $limit: 1 },
                    {
                        $project: {
                            _id: 0,
                            minBid: 1,
                            maxBid: 1
                        }
                    }
                ],
                as: "bidThreshold"
            }
        },
        {
            $unwind: {
                path: "$bidThreshold",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                targetId: "$_id.targetId",
                targeting: 1,
                profileId: "$_id.profileId",
                impressions: 1,
                clicks: 1,
                orders: 1,
                keywordBid: 1,
                status: 1,
                keywordType: 1,
                matchType: 1,
                spend: 1,
                sales: 1,
                topOfSearchImpressionShare: 1,
                campaignId: 1,
                campaignName: "$campaign.name",
                campaignStatus: "$campaign.status",
                adGroupId: 1,
                adGroupName: "$adGroup.name",
                adGroupStatus: "$adGroup.status",
                budget: "$campaign.budget",
                bidThreshold: 1,
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
                },
                cvr: {
                    $cond: [
                        { $gt: ["$clicks", 0] },
                        { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] },
                        0
                    ]
                },
                conversionRate: {
                    $cond: [
                        { $gt: ["$clicks", 0] },
                        { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] },
                        0
                    ]
                },
                daysSinceCreation: {
                    $cond: [
                        { $and: [{ $ne: ["$campaign.startDate", null] }, { $ne: ["$campaign.startDate", ""] }] },
                        {
                            $floor: {
                                $divide: [
                                    { $subtract: [{ $toDate: lastDate }, { $toDate: "$campaign.startDate" }] },
                                    86400000
                                ]
                            }
                        },
                        0
                    ]
                }
            }
        },
        {
            $match: {
                campaignStatus: { $nin: ["ARCHIVED", "archived"] }
            }
        }
    ];

    return commonPipeline;
}

exports.manualGenerateReport = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const userId = req.user._id;
        const { profileId, cronId } = req.body;
        const getCronStatus = await cronJobSchema.findOne({
            cronName: "Targeting Report",
            isActive: false,
        }).lean();
        if (getCronStatus) {
            return res.status(203).send({
                message: `Your Targeting report status is deactive.`,
                isSuccess: false,
            });
        }
        if (!profileId || !cronId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id and cron id required!",
            });
        }
        const getCron = await cronJobSchema.findOne({ _id: cronId, userId }).lean();
        if (!getCron) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Cron id not found!" });
        }
        if (!(getCron.cronName == "Targeting Report")) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Enter correct cron id." });
        }

        const profile = await getProfile(configId, profileId);
        const startDate = moment().tz(profile.timezone).format("YYYY-MM-DD");
        const endDate = moment().tz(profile.timezone).format("YYYY-MM-DD");
        const checkConfigAds = await getAccessToken(profile.configId);

        if (checkConfigAds && checkConfigAds.adsAccessToken) {
            const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "Targeting Report",
                status: "PENDING",
                historyDate: startDate,
            }).lean();
            if (!getCronData) {
                const createCronHistory = new cronJobHistorySchema({
                    configId: profile.configId,
                    profileId: profile.profileId,
                    cronName: "Targeting Report",
                    status: "PENDING",
                    historyDate: startDate,
                });
                await createCronHistory.save();
            }
            let responseSPStatus = "PENDING";
            while (responseSPStatus != "COMPLETED") {
                if (responseSPStatus != "COMPLETED") {
                    const reportSpResponse = await spGenerateReport(
                        profile.profileId,
                        startDate,
                        endDate,
                        checkConfigAds,
                        profile.configId,
                        profile.timezone,
                        profile.currencyCode
                    );
                    responseSPStatus = reportSpResponse;
                }
                if (responseSPStatus != "COMPLETED") {
                    if (responseSPStatus != "ERROR") {
                        await new Promise((resolve) => setTimeout(resolve, 60000));
                    }
                }
            }
            const getUpdateCronData = await cronJobHistorySchema.findOne({
                configId: configId,
                profileId: profileId,
                cronName: "Targeting Report",
                status: "PENDING",
                historyDate: startDate,
            }).lean();
            if (getUpdateCronData) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    { _id: getUpdateCronData._id },
                    {
                        status: "COMPLETED",
                    },
                    { new: true }
                );
            }
            return res.status(200).send({
                message: "Targeting Report updated successfully..",
                isSuccess: true,
            });
        } else {
            return res.status(203).send({
                message: `Account disconnected in placement report.`,
                isSuccess: false,
            });
        }
    } catch (error) {
        write_logs({ message: `[manualGenerateReport Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};

exports.ruleHistory = async (req, res) => {
    const configId = req?.config?.configId;
    const userId = req.user._id;
    let { profileId, pageNo, perPage, search, fromDate, toDate, affectedFilter } = req.body;
    try {
        if (!profileId) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required!" });
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
                    from: "targetingrules",
                    localField: "ruleId",
                    foreignField: "_id",
                    as: "targetingrules"
                }
            },
            {
                $unwind: {
                    path: "$targetingrules",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $match: {
                    $or: [
                        { "targetingrules.userId": userId },
                        { "targetingrules": { $exists: false } },
                        { "targetingrules": null }
                    ]
                }
            },
            {
                $addFields: {
                    reportDate: "$targetingrules.reportDate",
                    toDate: "$targetingrules.toDate",
                    timezone: "$targetingrules.timezone",
                    conditions: "$targetingrules.conditions",
                }
            },
            {
                $project: {
                    affectedCampaigns: 0,
                    targetingrules: 0
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
                                            { $eq: ["$ruleSchema", "TargetingRule"] },
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
                                                { $eq: ["$ruleSchema", "TargetingRule"] },
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
                                                { $eq: ["$ruleSchema", "TargetingRule"] },
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
                                        adGroupId: 1,
                                        adGroupName: 1,
                                        targetId: 1,
                                        name: 1,
                                        targetName: 1,
                                        targetType: 1,
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
                            as: "affectedTargets"
                        }
                    },
                    {
                        $lookup: {
                            from: "campaignproducteligiblestatusbyrules",
                            let: { ruleId: "$ruleId", ruleDate: "$ruleDate", profileId: "$profileId", configId: "$configId" },
                            pipeline: [
                                {
                                    $match: { $expr: { $and: [{ $eq: ["$ruleId", "$$ruleId"] }, { $eq: ["$ruleDate", "$$ruleDate"] }, { $eq: ["$profileId", "$$profileId"] }, { $eq: ["$configId", "$$configId"] }] } },
                                },
                                { $count: "count" },
                            ],
                            as: "lowProductStats",
                        },
                    }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        });

        const result = await targetingRuleHistorySchema.aggregate(pipeline);
        const getRules = await enrichWithCampaignMetrics(result[0].data, profileId, "TargetingRule");
        const totalRecords = result[0].totalCount[0]?.count || 0;

        return res.status(200).send({
            isSuccess: true,
            message: "Targeting Rules History listing successfully",
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

exports.adjustBid = async (req, res) => {
    try {

        const configId = req?.config?.configId;
        const userId = req.user._id;
        const { profileId, targetIds, bid, actionType } = req.body;

        const getAccount = await getProfile(configId, profileId);
        const checkConfigAds = await getAccessToken(configId);

        const targetList = targetIds.filter(id => id.startsWith("T-"));
        const keywordList = targetIds.filter(id => id.startsWith("K-"));

        const newUpdatedBid = (oldValue, value, type) => {
            if (type === "INCREASE_NUMBER") {
                return oldValue + value;
            } else if (type === "INCREASE_PERCENTAGE") {
                return oldValue + ((oldValue * value) / 100);
            } else if (type === "SET_BID") {
                return value;
            } else if (type === "DECREASE_NUMBER") {
                return oldValue - value;
            } else if (type === "DECREASE_PERCENTAGE") {
                return oldValue - ((oldValue * value) / 100);
            }
            return oldValue;
        }

        const marketMin = getMarketplaceMinBid(getAccount?.currencyCode, getAccount?.countryCode);

        if (actionType === "SET_BID" && parseFloat(bid) < marketMin) {
            return res.status(203).send({
                isSuccess: false,
                message: `Targeting bid must be at least ${marketMin.toFixed(2)}.`,
            });
        }

        let hadMinClamping = false;

        const bulkTargetOps = [];
        if (targetList.length > 0) {
            const targetsToBatch = [];
            for (const targetId of targetList) {
                const targeting = await targetingSchema.findOne({ targetId }).lean();
                if (!targeting) continue;

                const bidThreshold = await getBidThreshold(configId, profileId, targeting.campaignId);
                let newValue = parseFloat(newUpdatedBid(parseFloat(targeting?.keywordBid), parseFloat(bid), actionType)) ?? 0;

                const minAllowed = Math.max(marketMin, (bidThreshold?.minBid && Number(bidThreshold.minBid) > 0) ? Number(bidThreshold.minBid) : marketMin);
                let action = 'Targeting bid updated from bulk action';
                if (bidThreshold && bidThreshold.maxBid && newValue > Number(bidThreshold.maxBid)) {
                    newValue = Number(bidThreshold.maxBid);
                    action = 'Targeting bid capped to maximum allowed bid via bulk action';
                }
                if (newValue < minAllowed) {
                    newValue = minAllowed;
                    hadMinClamping = true;
                    action = `Targeting bid raised to minimum allowed bid (${minAllowed.toFixed(2)}) via bulk action`;
                }
                newValue = parseFloat(Number(newValue).toFixed(2));

                targetsToBatch.push({
                    targetId: targetId.replace("T-", ""),
                    bid: Number(newValue),
                    rawTargetId: targetId,
                    action,
                    newValue
                });
            }

            if (targetsToBatch.length > 0) {
                const { successfulItems } = await processBatchUpdates({
                    updates: targetsToBatch,
                    entityType: "SP_TARGETS",
                    profile: getAccount,
                    checkConfigAds,
                    configId
                });

                for (const item of successfulItems) {
                    await createBidHistory(item.rawTargetId, item.newValue, configId, profileId, item.action, userId);
                    bulkTargetOps.push({
                        updateMany: {
                            filter: { targetId: item.rawTargetId },
                            update: { $set: { keywordBid: item.newValue } }
                        }
                    });
                }
            }
        }

        if (keywordList.length > 0) {
            const keywordsToBatch = [];
            for (const keywordId of keywordList) {
                const targeting = await targetingSchema.findOne({ targetId: keywordId }).lean();
                if (!targeting) continue;

                const bidThreshold = await getBidThreshold(configId, profileId, targeting.campaignId);
                let newValue = parseFloat(newUpdatedBid(parseFloat(targeting?.keywordBid), parseFloat(bid), actionType)) ?? 0;

                const minAllowed = Math.max(marketMin, (bidThreshold?.minBid && Number(bidThreshold.minBid) > 0) ? Number(bidThreshold.minBid) : marketMin);
                let action = 'Targeting bid updated from bulk action';
                if (bidThreshold && bidThreshold.maxBid && newValue > Number(bidThreshold.maxBid)) {
                    newValue = Number(bidThreshold.maxBid);
                    action = 'Targeting bid capped to maximum allowed bid via bulk action';
                }
                if (newValue < minAllowed) {
                    newValue = minAllowed;
                    hadMinClamping = true;
                    action = `Targeting bid raised to minimum allowed bid (${minAllowed.toFixed(2)}) via bulk action`;
                }
                newValue = parseFloat(Number(newValue).toFixed(2));

                keywordsToBatch.push({
                    keywordId: keywordId.replace("K-", ""),
                    bid: Number(newValue),
                    rawKeywordId: keywordId,
                    action,
                    newValue
                });
            }

            if (keywordsToBatch.length > 0) {
                const { successfulItems } = await processBatchUpdates({
                    updates: keywordsToBatch,
                    entityType: "SP_KEYWORDS",
                    profile: getAccount,
                    checkConfigAds,
                    configId
                });

                for (const item of successfulItems) {
                    await createBidHistory(item.rawKeywordId, item.newValue, configId, profileId, item.action, userId);
                    bulkTargetOps.push({
                        updateMany: {
                            filter: { targetId: item.rawKeywordId },
                            update: { $set: { keywordBid: item.newValue } }
                        }
                    });
                }
            }
        }

        if (bulkTargetOps.length > 0) {
            await targetingSchema.bulkWrite(bulkTargetOps);
        }


        const message = hadMinClamping
            ? `Bid adjusted successfully (bids falling below ${marketMin.toFixed(2)} were enforced to the minimum value).`
            : "Bid adjusted successfully.";

        return res.status(200).send({
            isSuccess: true,
            message: message,
        });
    } catch (error) {
        write_logs({ message: `[adjustBid Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}

const createBidHistory = async (targetingId, newValue, configId, profileId, title, userId, type, explicitSource) => {
    try {
        const getTargetingSchema = type === "SB" ? sbTargetingSchema : type === "SD" ? sdTargetingSchema : targetingSchema;
        const cleanTargetId = String(targetingId).replace(/^[TK]-/, "");
        const possibleIds = [targetingId, cleanTargetId, `T-${cleanTargetId}`, `K-${cleanTargetId}`];
        if (!isNaN(Number(cleanTargetId))) {
            possibleIds.push(Number(cleanTargetId));
        }

        const numericProfileId = Number(profileId);
        const queryProfileId = !isNaN(numericProfileId) ? numericProfileId : profileId;

        // In targeting table, sorting using reportDate desc and createdAt / createdDate desc, getting first record
        const targeting = await getTargetingSchema
            .findOne({
                targetId: { $in: possibleIds },
                ...(configId ? { configId } : {}),
                ...(queryProfileId ? { profileId: queryProfileId } : {}),
            })
            .sort({ reportDate: -1, createdAt: -1, createdDate: -1 })
            .lean();

        if (!targeting) {
            return;
        }

        const newBidVal = Number(newValue);
        if (isNaN(newBidVal)) return;

        let oldBidVal = targeting?.keywordBid !== undefined && targeting?.keywordBid !== null
            ? Number(targeting.keywordBid)
            : (targeting?.bid !== undefined && targeting?.bid !== null ? Number(targeting.bid) : null);

        // 1. If target's current active bid in targeting table already equals newBidVal, no change to record
        if (oldBidVal !== null && !isNaN(oldBidVal) && oldBidVal === newBidVal) return;

        const isDayparting = explicitSource === "DAYPARTING" || /dayparting/i.test(title);
        const isRule = explicitSource === "RULE" || /rule|cron/i.test(title);

        // Deduplication time window:
        // Dayparting rules operate on hourly slots -> check within current hour slot or last 60 minutes
        // General rules -> check last 15 minutes
        // Manual/Other -> check last 60 seconds (increased from 30s)
        const now = new Date();
        const startOfCurrentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
        const dedupeSince = isDayparting
            ? new Date(Math.min(now.getTime() - 60 * 60 * 1000, startOfCurrentHour.getTime()))
            : isRule
                ? new Date(now.getTime() - 15 * 60 * 1000)
                : new Date(now.getTime() - 60 * 1000);

        const targetIdQueries = [
            { targetId: cleanTargetId },
            { targetId: String(cleanTargetId) },
            { targetId: targetingId },
            { targetId: `T-${cleanTargetId}` },
            { targetId: `K-${cleanTargetId}` },
        ];
        if (!isNaN(Number(cleanTargetId))) {
            targetIdQueries.push({ targetId: Number(cleanTargetId) });
        }
        if (targeting?.campaignId && (targeting?.targeting || targeting?.keywordText)) {
            targetIdQueries.push({
                changeLevel: targeting.campaignId,
                targeting: targeting?.targeting || targeting?.keywordText,
            });
        }

        // 2. Check the latest history record for this target in campaignChangeHistory
        const latestCampaignHistory = await campaignChangeHistorySchema?.findOne({
            configId,
            profileId: queryProfileId,
            $or: targetIdQueries,
        }).sort({ createdAt: -1, _id: -1 }).lean();

        if (latestCampaignHistory) {
            const latestNewVal = Number(latestCampaignHistory.newValue);
            // If the latest history record already set the bid to newBidVal, skip to avoid duplicate
            if (!isNaN(latestNewVal) && latestNewVal === newBidVal) {
                return;
            }
            // Use latest recorded newValue as oldBidVal if available for continuity
            if (!isNaN(latestNewVal)) {
                oldBidVal = latestNewVal;
                if (oldBidVal === newBidVal) return;
            }
        }

        // 3. Also check targetingHistorySchema for latest recorded bid
        const latestTargetingHistory = await targetingHistorySchema.findOne({
            configId,
            profileId: queryProfileId,
            targetId: cleanTargetId,
        }).sort({ createdAt: -1, _id: -1 }).lean();

        if (latestTargetingHistory) {
            const latestTargetingBid = Number(latestTargetingHistory.bid);
            if (!isNaN(latestTargetingBid) && latestTargetingBid === newBidVal) {
                return;
            }
        }

        // 4. Check for existing record within the dedupe window (current hour slot for dayparting)
        const existingCampaignChange = await campaignChangeHistorySchema?.findOne({
            configId,
            profileId: queryProfileId,
            $or: targetIdQueries,
            createdAt: { $gte: dedupeSince },
        }).sort({ createdAt: -1 }).lean();

        if (existingCampaignChange) {
            const existingVal = Number(existingCampaignChange.newValue);
            if (!isNaN(existingVal) && existingVal === newBidVal) {
                return;
            }
        }

        // Get ACOS of first record of that filter
        let currentAcos = 0;
        if (targeting?.acos !== undefined && targeting?.acos !== null && !isNaN(Number(targeting.acos))) {
            currentAcos = Number(targeting.acos);
        } else if (Number(targeting?.sales) > 0 && Number(targeting?.spend) > 0) {
            currentAcos = Number(((Number(targeting.spend) / Number(targeting.sales)) * 100).toFixed(2));
        }

        // 5. Immediately record in targetingHistory table
        try {
            const existingRecent = await targetingHistorySchema.findOne({
                configId,
                profileId: queryProfileId,
                targetId: cleanTargetId,
                bid: newBidVal,
                createdAt: { $gte: dedupeSince },
            });

            if (!existingRecent) {
                await targetingHistorySchema.create({
                    configId,
                    profileId: queryProfileId,
                    targetId: cleanTargetId,
                    campaignId: String(targeting?.campaignId || ""),
                    adGroupId: String(targeting?.adGroupId || ""),
                    adProduct: type === "SB" ? "SPONSORED_BRANDS" : type === "SD" ? "SPONSORED_DISPLAY" : "SPONSORED_PRODUCTS",
                    targetType: targeting?.targetType || "",
                    matchType: targeting?.matchType || "",
                    targeting: targeting?.targeting || targeting?.keywordText || "",
                    state: targeting?.state || targeting?.status || "ENABLED",
                    bid: newBidVal,
                    oldBid: oldBidVal,
                    currencyCode: targeting?.currencyCode || "",
                    last_updated_date_time: new Date().toISOString(),
                    source: "AdvertiseIQ Portal",
                    userId,
                });
            }
        } catch (historyErr) {
            console.error("Error creating targetingHistory entry in createBidHistory:", historyErr?.message || historyErr);
        }

        // 6. Also record in campaignChangeHistorySchema
        const computedSource = explicitSource || (
            isDayparting
                ? "DAYPARTING"
                : isRule
                    ? "RULE"
                    : "MANUAL"
        );

        await campaignChangeHistorySchema?.create({
            configId,
            profileId: queryProfileId,
            changeLevel: targeting?.campaignId,
            changeType: title,
            targeting: targeting?.targeting || targeting?.keywordText,
            matchType: targeting?.matchType || targeting?.targetType || null,
            targetId: cleanTargetId || null,
            oldValue: oldBidVal !== null && oldBidVal !== undefined ? String(oldBidVal) : null,
            newValue: String(newBidVal),
            updatedFrom: "Targeting",
            source: computedSource,
            userId,
            type: type || "SP",
        });
    } catch (e) {
        console.error("Error in createBidHistory:", e?.message || e);
    }
};

const createStatusHistory = async (targetingId, newValue, configId, profileId, title, userId, type, explicitSource) => {
    const getTargetingSchema = type === "SB" ? sbTargetingSchema : type === "SD" ? sdTargetingSchema : targetingSchema;

    const profile = await getProfile(configId, profileId);
    const timezone = profile.timezone;
    const reportDate = moment(new Date()).tz(timezone).format("YYYY-MM-DD");

    const findTargeting = await getTargetingSchema?.find({
        targetId: targetingId,
        reportDate
    })

    await Promise.all(
        findTargeting?.map(async (targeting) => {
            if (targeting?.status === newValue) return;

            const existingStatusChange = await campaignChangeHistorySchema?.findOne({
                configId,
                profileId,
                changeLevel: targeting?.campaignId,
                changeType: title,
                newValue,
                ...(targeting?.matchType ? { matchType: targeting.matchType } : {}),
                createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
            }).lean();

            if (!existingStatusChange) {
                const computedSource = explicitSource || (
                    /dayparting/i.test(title)
                        ? "DAYPARTING"
                        : /rule|cron/i.test(title)
                            ? "RULE"
                            : "MANUAL"
                );

                await campaignChangeHistorySchema?.create({
                    configId,
                    profileId,
                    changeLevel: targeting?.campaignId,
                    changeType: title,
                    targeting: targeting?.targeting,
                    matchType: targeting?.matchType || targeting?.targetType || null,
                    targetId: cleanTargetId || targetingId || null,
                    oldValue: targeting?.status,
                    newValue,
                    updatedFrom: "Targeting",
                    source: computedSource,
                    userId,
                    type: type || "SP"
                });
            }
        })
    )
}

const createCampaignHistory = async (campaignId, changeType, oldValue, newValue, configId, profileId, userId, type, explicitSource) => {
    if (oldValue == newValue) return;

    const existingCampaignChange = await campaignChangeHistorySchema?.findOne({
        configId,
        profileId,
        changeLevel: campaignId,
        changeType,
        newValue,
        createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
    }).lean();

    if (!existingCampaignChange) {
        const computedSource = explicitSource || (
            /dayparting/i.test(changeType)
                ? "DAYPARTING"
                : /rule|cron/i.test(changeType)
                    ? "RULE"
                    : "MANUAL"
        );

        await campaignChangeHistorySchema?.create({
            configId,
            profileId,
            changeLevel: campaignId,
            changeType: changeType,
            oldValue,
            newValue,
            updatedFrom: "Campaign",
            source: computedSource,
            userId,
            type: type || "SP"
        });
    }
}

const createAdGroupHistory = async (campaignId, adGroupId, changeType, oldValue, newValue, configId, profileId, userId, type, explicitSource) => {
    if (oldValue == newValue) return;

    const existingAdGroupChange = await campaignChangeHistorySchema?.findOne({
        configId,
        profileId,
        changeLevel: campaignId,
        adGroupId,
        changeType,
        newValue,
        createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
    }).lean();

    if (!existingAdGroupChange) {
        const computedSource = explicitSource || (
            /dayparting/i.test(changeType)
                ? "DAYPARTING"
                : /rule|cron/i.test(changeType)
                    ? "RULE"
                    : "MANUAL"
        );

        await campaignChangeHistorySchema?.create({
            configId,
            profileId,
            changeLevel: campaignId,
            adGroupId,
            changeType: changeType,
            oldValue,
            newValue,
            updatedFrom: "AdGroup",
            source: computedSource,
            userId,
            type: type || "SP"
        });
    }
}

exports.changeStatus = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const userId = req.user._id;
        const { profileId, targetIds, status } = req.body;

        // 1. Input Validation
        if (!profileId || !status || !Array.isArray(targetIds) || targetIds.length === 0) {
            return res.status(203).send({
                isSuccess: false,
                message: "Invalid input parameters. profileId, status, and targetIds are required.",
            });
        }

        // 2. Fetch Credentials and Profile Configuration
        const getAccount = await getProfile(configId, profileId);
        const checkConfigAds = await getAccessToken(configId);

        if (!getAccount?.amazonUrl || !checkConfigAds?.adsClientId || !checkConfigAds.adsAccessToken) {
            return res.status(203).send({
                isSuccess: false,
                message: "Amazon API credentials or configuration not found.",
            });
        }

        const targetList = targetIds.filter(id => id.startsWith("T-"));
        const keywordList = targetIds.filter(id => id.startsWith("K-"));

        // 3. Batch DB Lookup to check existing items (Optimized from N+1 query loop)
        const existingItems = await targetingSchema.find({ targetId: { $in: targetIds } }).select("targetId").lean();
        const existingItemIds = new Set(existingItems.map(item => item.targetId));

        let targetSuccessIds = [];
        let keywordSuccessIds = [];

        // 4. Update Target clauses
        if (targetList.length > 0) {
            const targetsToBatch = targetList
                .filter(targetId => existingItemIds.has(targetId))
                .map(targetId => ({
                    targetId: targetId.replace("T-", ""),
                    state: status
                }));

            if (targetsToBatch.length > 0) {
                const { successfulItems } = await processBatchUpdates({
                    updates: targetsToBatch,
                    entityType: "SP_TARGETS",
                    profile: getAccount,
                    checkConfigAds,
                    configId
                });
                targetSuccessIds = successfulItems.map(item => "T-" + item.targetId);
            }
        }

        // 5. Update Keywords
        if (keywordList.length > 0) {
            const keywordsToBatch = keywordList
                .filter(keywordId => existingItemIds.has(keywordId))
                .map(keywordId => ({
                    keywordId: keywordId.replace("K-", ""),
                    state: status
                }));

            if (keywordsToBatch.length > 0) {
                const { successfulItems } = await processBatchUpdates({
                    updates: keywordsToBatch,
                    entityType: "SP_KEYWORDS",
                    profile: getAccount,
                    checkConfigAds,
                    configId
                });
                keywordSuccessIds = successfulItems.map(item => "K-" + item.keywordId);
            }
        }

        // 6. DB Updates & History creation for only successful items
        const allSuccessIds = [...targetSuccessIds, ...keywordSuccessIds];
        if (allSuccessIds.length > 0) {
            await Promise.all(
                allSuccessIds.map(async (id) => {
                    await createStatusHistory(id, status, configId, profileId, `Update Targeting Status`, userId);
                    await targetingSchema.updateMany({ targetId: id }, { $set: { status: status } });
                })
            );
        }

        // 7. Structure response indicating execution details
        const totalRequested = targetList.length + keywordList.length;
        if (allSuccessIds.length === 0) {
            return res.status(203).send({
                isSuccess: false,
                message: "Failed to update status on Amazon. Check API/credentials or item status.",
            });
        }

        if (allSuccessIds.length < totalRequested) {
            return res.status(200).send({
                isSuccess: true,
                message: `Partially updated status. Successfully updated ${allSuccessIds.length} of ${totalRequested} items.`,
            });
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Status Changed Successfully.",
        });
    } catch (error) {
        write_logs({ message: `[changeStatus Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}


exports.cronListTargetingFromAmazon = async (pastSyncObj) => {
    // cron_logs({ message: `cronListTargetingFromAmazon` });
    try {

        const { profileId, configId, cronjobid, recurring } = pastSyncObj ?? {};
        const dates = pastSyncObj?.dates ?? [];
        const cronName = "Targeting Listing";

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
                message: `Cron Targeting Listing stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const listPromises = getProfileId.map((profile) => profileLimit(async () => {
            if (global.updateTaskProgress) global.updateTaskProgress("TargetingListing");
            const checkConfigAds = await getAccessToken(profile.configId);
            if (
                checkConfigAds &&
                checkConfigAds.adsAccessToken
            ) {
                const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");
                if (dates.length == 0) {
                    dates.push(currentDate);
                }

                await processSPTargetings({
                    profile,
                    checkConfigAds,
                    dates,
                    currentDate,
                });

                await processSBTargetings({
                    profile,
                    checkConfigAds,
                    dates,
                    currentDate,
                });

                await processSDTargetings({
                    profile,
                    checkConfigAds,
                    dates,
                    currentDate,
                });

                if (cronjobid) {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true },
                    );
                } else {
                    await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: cronName,
                            historyDate: currentDate,
                        },
                        {
                            $set: {
                                status: "COMPLETED",
                            }
                        },
                        { new: true, upsert: true }
                    ).lean();
                }

                cron_logs({
                    message: `Profile: ${profile.name}, Targeting listed successfully.`,
                    log_type: "info"
                });

            } else {
                return cron_logs({
                    message: `Account disconnected in Targeting listing for ${profile.name}`,
                });
            }
        }));
        await Promise.all(listPromises);

        return cron_logs({
            message: "Targeting listing successfully.",
            log_type: "info"
        });

    } catch (error) {
        return cron_logs({
            message: `"Targeting Report" err: ${error}`,
            log_type: "error",
        });
    }
}

async function processSPTargetings({
    profile,
    checkConfigAds,
    dates,
    currentDate,
}) {
    const getKeywordPage = await fetchSPKeywordsPage({
        configId: profile.configId,
        profileId: profile.profileId,
        checkConfigAds,
    });

    let nextKeywordToken = null;
    let page = 1;

    do {
        const { keywords, nextToken: token } = await getKeywordPage(nextKeywordToken);
        nextKeywordToken = token;

        if (!keywords.length) continue;

        const targetingBulkOps = [];
        const campaignMaxBidMap = {};

        keywords.map((item) => {
            dates.map((reportDate) => {
                targetingBulkOps.push({
                    updateOne: {
                        filter: {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            campaignId: item.campaignId,
                            adGroupId: item.adGroupId,
                            targetId: item.targetId,
                            reportDate,
                        },
                        update: {
                            $set: {
                                ...item,
                                reportDate,
                            },
                        },
                        upsert: true, new: true
                    },
                });

                const bid = item.keywordBid ?? 0;
                if (!campaignMaxBidMap[item.campaignId] || campaignMaxBidMap[item.campaignId] < bid) {
                    campaignMaxBidMap[item.campaignId] = bid;
                }
            });
        })

        if (targetingBulkOps.length) {
            cron_logs({
                message: `Profile: ${profile.name}, Page: ${page++}, Keyword Count: ${targetingBulkOps.length}`,
                log_type: "info"
            });
            await parallelBulkWrite(targetingSchema, targetingBulkOps);
        }

        // ✅ Campaign bulk update (MAX keywordBid)
        const campaignBulkOps = Object.entries(campaignMaxBidMap).map(
            ([campaignId, maxBid]) => ({
                updateOne: {
                    filter: {
                        configId: profile.configId,
                        profileId: profile.profileId,
                        campaignId,
                        reportDate: currentDate,
                    },
                    update: {
                        $max: { keywordBid: maxBid },
                    },
                },
            })
        );

        if (campaignBulkOps.length) {
            await parallelBulkWrite(campaignSchema, campaignBulkOps);
        }

    } while (nextKeywordToken);

    const getTargetsPage = await fetchSPTargetsPage({
        configId: profile.configId,
        profileId: profile.profileId,
        checkConfigAds,
    });

    let nextTargetsToken = null;
    page = 1;

    do {
        const { targetingClauses, nextToken: token } = await getTargetsPage(nextTargetsToken);
        nextTargetsToken = token;

        if (!targetingClauses.length) continue;

        // Reconcile and heal any existing R- records for these targets
        await reconcileTargetingRRecordsForClauses({
            configId: profile.configId,
            profileId: profile.profileId,
            targetingClauses,
        });

        const targetingBulkOps = [];
        const campaignMaxBidMap = {};

        targetingClauses.map((item) => {
            dates.map((reportDate) => {
                targetingBulkOps.push({
                    updateOne: {
                        filter: {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            campaignId: item.campaignId,
                            adGroupId: item.adGroupId,
                            targetId: item.targetId,
                            reportDate,
                        },
                        update: {
                            $set: {
                                ...item,
                                reportDate,
                            },
                        },
                        upsert: true, new: true
                    },
                });

                const bid = item.keywordBid ?? 0;
                if (!campaignMaxBidMap[item.campaignId] || campaignMaxBidMap[item.campaignId] < bid) {
                    campaignMaxBidMap[item.campaignId] = bid;
                }
            });
        })

        if (targetingBulkOps.length) {
            cron_logs({
                message: `Profile: ${profile.name}, Page: ${page++}, Target Count: ${targetingBulkOps.length}`,
                log_type: "info"
            });
            await parallelBulkWrite(targetingSchema, targetingBulkOps);
        }

        // ✅ Campaign bulk update (MAX keywordBid)
        const campaignBulkOps = Object.entries(campaignMaxBidMap).map(
            ([campaignId, maxBid]) => ({
                updateOne: {
                    filter: {
                        configId: profile.configId,
                        profileId: profile.profileId,
                        campaignId,
                        reportDate: currentDate,
                    },
                    update: {
                        $max: { keywordBid: maxBid },
                    },
                },
            })
        );

        if (campaignBulkOps.length) {
            await parallelBulkWrite(campaignSchema, campaignBulkOps);
        }

    } while (nextTargetsToken);
}

async function processSBTargetings({
    profile,
    checkConfigAds,
    dates,
    currentDate,
}) {
    const getKeywordPage = await fetchSBKeywordsPage({
        configId: profile.configId,
        profileId: profile.profileId,
        checkConfigAds,
    });

    let page = 0;

    do {
        const { keywords, pageIndex } = await getKeywordPage(page);
        page = pageIndex;

        if (!keywords.length) break;

        const targetingBulkOps = [];
        const campaignMaxBidMap = {};

        keywords.map((item) => {
            dates.map((reportDate) => {
                targetingBulkOps.push({
                    updateOne: {
                        filter: {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            campaignId: item.campaignId,
                            adGroupId: item.adGroupId,
                            targetId: item.targetId,
                            reportDate,
                        },
                        update: {
                            $set: {
                                ...item,
                                reportDate,
                            },
                        },
                        upsert: true, new: true
                    },
                });

                const bid = item.keywordBid ?? 0;
                if (!campaignMaxBidMap[item.campaignId] || campaignMaxBidMap[item.campaignId] < bid) {
                    campaignMaxBidMap[item.campaignId] = bid;
                }
            });
        })

        if (targetingBulkOps.length) {
            cron_logs({
                message: `Profile: ${profile.name}, Page: ${page}, SB-Keyword Count: ${targetingBulkOps.length}`,
                log_type: "info"
            });
            await parallelBulkWrite(sbTargetingSchema, targetingBulkOps);
        }

        // ✅ Campaign bulk update (MAX keywordBid)
        const campaignBulkOps = Object.entries(campaignMaxBidMap).map(
            ([campaignId, maxBid]) => ({
                updateOne: {
                    filter: {
                        configId: profile.configId,
                        profileId: profile.profileId,
                        campaignId,
                        reportDate: currentDate,
                    },
                    update: {
                        $max: { keywordBid: maxBid },
                    },
                },
            })
        );

        if (campaignBulkOps.length) {
            await parallelBulkWrite(sbCampaignSchema, campaignBulkOps);
        }

    } while (true);

    const getTargetsPage = await fetchSBTargetsPage({
        configId: profile.configId,
        profileId: profile.profileId,
        checkConfigAds,
    });

    let nextTargetsToken = null;
    page = 1;

    do {
        const { targetingClauses, nextToken: token } = await getTargetsPage(nextTargetsToken);
        nextTargetsToken = token;

        if (!targetingClauses.length) continue;

        const targetingBulkOps = [];
        const campaignMaxBidMap = {};

        targetingClauses.map((item) => {
            dates.map((reportDate) => {
                targetingBulkOps.push({
                    updateOne: {
                        filter: {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            campaignId: item.campaignId,
                            adGroupId: item.adGroupId,
                            targetId: item.targetId,
                            reportDate,
                        },
                        update: {
                            $set: {
                                ...item,
                                reportDate,
                            },
                        },
                        upsert: true, new: true
                    },
                });

                const bid = item.keywordBid ?? 0;
                if (!campaignMaxBidMap[item.campaignId] || campaignMaxBidMap[item.campaignId] < bid) {
                    campaignMaxBidMap[item.campaignId] = bid;
                }
            });
        })

        if (targetingBulkOps.length) {
            cron_logs({
                message: `Profile: ${profile.name}, Page: ${page++}, SB-Target Count: ${targetingBulkOps.length}`,
                log_type: "info"
            });
            await parallelBulkWrite(sbTargetingSchema, targetingBulkOps);
        }

        // ✅ Campaign bulk update (MAX keywordBid)
        const campaignBulkOps = Object.entries(campaignMaxBidMap).map(
            ([campaignId, maxBid]) => ({
                updateOne: {
                    filter: {
                        configId: profile.configId,
                        profileId: profile.profileId,
                        campaignId,
                        reportDate: currentDate,
                    },
                    update: {
                        $max: { keywordBid: maxBid },
                    },
                },
            })
        );

        if (campaignBulkOps.length) {
            await parallelBulkWrite(sbCampaignSchema, campaignBulkOps);
        }

    } while (nextTargetsToken);
}

async function processSDTargetings({
    profile,
    checkConfigAds,
    dates,
    currentDate,
}) {
    const getTargetsPage = await fetchSDTargetsPage({
        configId: profile.configId,
        profileId: profile.profileId,
        checkConfigAds,
    });

    let page = 0;

    do {
        const { targetingClauses } = await getTargetsPage(page);

        if (!targetingClauses.length) break;

        const targetingBulkOps = [];
        const campaignMaxBidMap = {};

        targetingClauses.map((item) => {
            dates.map((reportDate) => {
                targetingBulkOps.push({
                    updateOne: {
                        filter: {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            campaignId: item.campaignId,
                            adGroupId: item.adGroupId,
                            targetId: item.targetId,
                            reportDate,
                        },
                        update: {
                            $set: {
                                ...item,
                                reportDate,
                            },
                        },
                        upsert: true, new: true
                    },
                });

                const bid = item.keywordBid ?? 0;
                if (!campaignMaxBidMap[item.campaignId] || campaignMaxBidMap[item.campaignId] < bid) {
                    campaignMaxBidMap[item.campaignId] = bid;
                }
            });
        })

        if (targetingBulkOps.length) {
            cron_logs({
                message: `Profile: ${profile.name}, Page: ${++page}, SD-Target Count: ${targetingBulkOps.length}`,
                log_type: "info"
            });
            await parallelBulkWrite(sdTargetingSchema, targetingBulkOps);
        }

        // ✅ Campaign bulk update (MAX keywordBid)
        const campaignBulkOps = Object.entries(campaignMaxBidMap).map(
            ([campaignId, maxBid]) => ({
                updateOne: {
                    filter: {
                        configId: profile.configId,
                        profileId: profile.profileId,
                        campaignId,
                        reportDate: currentDate,
                    },
                    update: {
                        $max: { keywordBid: maxBid },
                    },
                },
            })
        );

        if (campaignBulkOps.length) {
            await parallelBulkWrite(sdCampaignSchema, campaignBulkOps);
        }

    } while (true);
}

async function fetchSPKeywordsPage({
    configId,
    profileId,
    checkConfigAds,
}) {
    const getAccount = await getProfile(configId, profileId);

    return async function getPage(nextToken) {
        const bodyData = {
            maxResults: Number(process.env.BATCH),
            ...(nextToken && { nextToken }),
        };

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/keywords/list`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                Accept: "application/vnd.spKeyword.v3+json",
                "Content-Type": "application/vnd.spKeyword.v3+json",
            },
            data: bodyData,
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (response.status !== 200) return { keywords: [], nextToken: null };

        const body = response.data;
        const keywords = (body.keywords || []).map(item => ({
            configId,
            profileId,
            type: "Sponsored Products",
            targetId: `K-${item.keywordId}`,
            targeting: item.keywordText,
            campaignId: item.campaignId,
            adGroupId: item.adGroupId,
            status: `${item.state}`?.toUpperCase(),
            keywordBid: item.bid,
            matchType: `Keyword - ${item.matchType.toLowerCase()}`,
            keywordType: item.matchType,
            timezone: getAccount.timezone
        }));

        return {
            keywords,
            nextToken: body.nextToken || null,
        };
    };
}

async function fetchSPTargetsPage({
    configId,
    profileId,
    checkConfigAds,
}) {
    const getAccount = await getProfile(configId, profileId);

    return async function getPage(nextToken) {
        const bodyData = {
            maxResults: Number(process.env.BATCH),
            ...(nextToken && { nextToken }),
        };

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/targets/list`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                Accept: "application/vnd.sptargetingClause.v3+json",
                "Content-Type": "application/vnd.sptargetingClause.v3+json",
            },
            data: bodyData,
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (response.status !== 200) return { targetingClauses: [], nextToken: null };

        const body = response.data;
        const targetingClauses = (body.targetingClauses || []).map(item => {

            const expressionType = item.expression[0].type;
            let targeting = "";
            let matchType = "";
            let keywordType = "";
            if (item.expressionType == "AUTO") {
                keywordType = "TARGETING_EXPRESSION_PREDEFINED";
                if (expressionType == "QUERY_HIGH_REL_MATCHES") {
                    targeting = "close-match";
                }
                else if (expressionType == "QUERY_BROAD_REL_MATCHES") {
                    targeting = "loose-match";
                }
                else if (expressionType == "ASIN_SUBSTITUTE_RELATED") {
                    targeting = "substitutes";
                }
                else if (expressionType == "ASIN_ACCESSORY_RELATED") {
                    targeting = "complements";
                }
                matchType = `Automatic - ${targeting}`;
            }
            else if (item.expressionType == "MANUAL") {

                keywordType = "TARGETING_EXPRESSION";
                if (expressionType == "ASIN_SAME_AS") {
                    targeting = `asin="${item.resolvedExpression[0].value}"`;
                    matchType = `Product target - Exact`;
                }
                else if (expressionType == "KEYWORD_GROUP_SAME_AS") {
                    targeting = `keyword-group="${item.resolvedExpression[0].value}"`;
                    matchType = `Keyword - group`;
                }
                else if (expressionType == "ASIN_EXPANDED_FROM") {
                    targeting = `asin-expanded="${item.resolvedExpression[0].value}"`;
                    matchType = `Product target - Expanded`;
                }
                else if (expressionType == "ASIN_CATEGORY_SAME_AS") {
                    targeting = `Category: ${item.resolvedExpression[0].value}`;
                    if (item.resolvedExpression.length > 1) {
                        if (item.resolvedExpression[1].type == "ASIN_PRICE_GREATER_THAN") {
                            targeting += `, Price: > ${item.resolvedExpression[1].value}`;
                        } else if (item.resolvedExpression[1].type == "ASIN_PRICE_LESS_THAN") {
                            targeting += `, Price: < ${item.resolvedExpression[1].value}`;
                        } else {
                            targeting += `, Price: ${item.resolvedExpression[1].value}`;
                        }
                    }
                    matchType = `Product target - Category`;
                }
            }

            return {
                configId: configId,
                profileId: profileId,
                type: "Sponsored Products",
                targetId: `T-${item.targetId}`,
                targeting: targeting,
                campaignId: item.campaignId,
                adGroupId: item.adGroupId,
                status: `${item.state}`?.toUpperCase(),
                keywordBid: item.bid ?? 0,
                matchType: matchType,
                keywordType: keywordType,
                timezone: getAccount.timezone
            }
        });

        return {
            targetingClauses,
            nextToken: body.nextToken || null,
        };
    };
}

async function fetchSBKeywordsPage({
    configId,
    profileId,
    checkConfigAds,
}) {
    const getAccount = await getProfile(configId, profileId);

    return async function getPage(pageIndex) {

        const response = await retryWithBackoff(() => amazonAxios({
            method: "GET",
            url: `${getAccount.amazonUrl}/sb/keywords?startIndex=${pageIndex * Number(process.env.BATCH)}&count=${Number(process.env.BATCH)}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Accept": "application/vnd.sbkeyword.v3.2+json"
            },
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (response.status !== 200) return { keywords: [], pageIndex };

        const body = { keywords: response?.data };
        const keywords = (body.keywords || []).map(item => ({
            configId,
            profileId,
            type: "Sponsored Brands",
            targetId: `K-${item.keywordId}`,
            targeting: item.keywordText,
            campaignId: item.campaignId,
            adGroupId: item.adGroupId,
            status: `${item.state}`?.toUpperCase(),
            keywordBid: item.bid,
            matchType: `Keyword - ${item.matchType.toLowerCase()}`,
            keywordType: `${item.matchType}`.toUpperCase(),
            timezone: getAccount.timezone
        }));

        return {
            keywords,
            pageIndex: pageIndex + 1,
        };
    };
}

async function fetchSBTargetsPage({
    configId,
    profileId,
    checkConfigAds,
}) {
    const getAccount = await getProfile(configId, profileId);

    return async function getPage(nextToken) {
        const bodyData = {
            maxResults: Number(process.env.BATCH),
            ...(nextToken && { nextToken }),
        };

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${getAccount.amazonUrl}/sb/targets/list`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: bodyData,
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (response.status !== 200) return { targetingClauses: [], nextToken: null };

        const body = response.data;
        const targetingClauses = (body.targets || []).map(item => {
            const { targeting, matchType, keywordType } = resolveTargeting(item);
            return {
                configId: configId,
                profileId: profileId,
                type: "Sponsored Brands",
                targetId: `T-${item.targetId}`,
                targeting: targeting,
                campaignId: item.campaignId,
                adGroupId: item.adGroupId,
                status: `${item.state}`?.toUpperCase(),
                keywordBid: item.bid ?? 0,
                matchType: matchType,
                keywordType: keywordType,
                timezone: getAccount.timezone
            }
        });

        return {
            targetingClauses,
            nextToken: body.nextToken || null,
        };
    };
}

async function fetchSDTargetsPage({
    configId,
    profileId,
    checkConfigAds,
}) {
    const getAccount = await getProfile(configId, profileId);

    return async function getPage(pageIndex) {

        const response = await retryWithBackoff(() => amazonAxios({
            method: "GET",
            url: `${getAccount.amazonUrl}/sd/targets?startIndex=${pageIndex * Number(process.env.BATCH)}&count=${Number(process.env.BATCH)}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        }));

        if (response.status !== 200) return { targetingClauses: [], nextToken: null };

        const body = response.data;
        const targetingClauses = (body || []).map(item => {
            const { targeting, matchType, keywordType } = resolveTargeting(item);
            return {
                configId: configId,
                profileId: profileId,
                type: "Sponsored Display",
                targetId: `T-${item.targetId}`,
                targeting: targeting,
                campaignId: item.campaignId,
                adGroupId: item.adGroupId,
                status: `${item.state}`?.toUpperCase(),
                keywordBid: item.bid ?? 0,
                matchType: matchType,
                keywordType: keywordType,
                timezone: getAccount.timezone
            }
        });

        return { targetingClauses };
    };
}

async function getSPkeywords(
    configId,
    profileId,
    checkConfigAds
) {
    return new Promise(async (resolve, reject) => {
        const getAccount = await getProfile(configId, profileId);
        let bodyData = {
            maxResults: 1000,
            includeExtendedDataFields: true,
        };
        const spOptions = {
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/keywords/list`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                Accept: "application/vnd.spKeyword.v3+json",
                "Content-Type": "application/vnd.spKeyword.v3+json",
            },
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        };
        const keywords = [];
        let nextToken = "";
        function makeRequest() {
            if (nextToken) {
                bodyData.nextToken = nextToken;
            }
            spOptions.data = bodyData;

            retryWithBackoff(() => amazonAxios(spOptions)).then((response) => {
                const body = response.data;
                if (body.keywords && body.keywords.length > 0) {
                    body.keywords.forEach((keyword) => {
                        let obj = {
                            configId: configId,
                            profileId: profileId,
                            type: "Sponsored Products",
                            targetId: `K-${keyword.keywordId}`,
                            targeting: keyword.keywordText,
                            campaignId: keyword.campaignId,
                            adGroupId: keyword.adGroupId,
                            status: keyword.state,
                            keywordBid: keyword.bid,
                            matchType: `Keyword - ${keyword.matchType.toLowerCase()}`,
                            keywordType: keyword.matchType,
                            timezone: getAccount.timezone
                        };
                        keywords.push(obj);
                    });

                    const totalResults = body.totalResults;
                    nextToken = body.nextToken;
                    if (keywords.length < totalResults && nextToken) {
                        makeRequest();
                    } else {
                        resolve(keywords);
                    }
                } else {
                    resolve(keywords);
                }
            }).catch((error) => {
                cron_logs({
                    message: `Config ID: ${configId}, Profile ID: ${profileId} SP Keywords listing err: ${error}`,
                    log_type: "error",
                });
                resolve(keywords);
            })
        }
        makeRequest();
    });
}


async function getSPtargets(
    configId,
    profileId,
    checkConfigAds
) {
    return new Promise(async (resolve, reject) => {
        const getAccount = await getProfile(configId, profileId);
        let bodyData = {
            maxResults: 1000,
            includeExtendedDataFields: true,
        };
        const spOptions = {
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/targets/list`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                Accept: "application/vnd.sptargetingClause.v3+json",
                "Content-Type": "application/vnd.sptargetingClause.v3+json",
            },
            meta: { configId: configId, tokenKey: "adsAccessToken" }
        };
        const targets = [];
        let nextToken = "";
        function makeRequest() {
            if (nextToken) {
                bodyData.nextToken = nextToken;
            }
            spOptions.data = bodyData;
            retryWithBackoff(() => amazonAxios(spOptions)).then((response) => {
                const body = response.data;
                if (response.status === 200) {
                    if (body.targetingClauses && body.targetingClauses.length > 0) {
                        body.targetingClauses.forEach((target) => {
                            const expressionType = target.expression[0].type;
                            let targeting = "";
                            let matchType = "";
                            let keywordType = "";
                            if (target.expressionType == "AUTO") {
                                keywordType = "TARGETING_EXPRESSION_PREDEFINED";
                                if (expressionType == "QUERY_HIGH_REL_MATCHES") {
                                    targeting = "close-match";
                                }
                                else if (expressionType == "QUERY_BROAD_REL_MATCHES") {
                                    targeting = "loose-match";
                                }
                                else if (expressionType == "ASIN_SUBSTITUTE_RELATED") {
                                    targeting = "substitutes";
                                }
                                else if (expressionType == "ASIN_ACCESSORY_RELATED") {
                                    targeting = "complements";
                                }
                                matchType = `Automatic - ${targeting}`;
                            }
                            else if (target.expressionType == "MANUAL") {

                                keywordType = "TARGETING_EXPRESSION";
                                if (expressionType == "ASIN_SAME_AS") {
                                    targeting = `asin="${target.resolvedExpression[0].value}"`;
                                    matchType = `Product target - Exact`;
                                }
                                else if (expressionType == "KEYWORD_GROUP_SAME_AS") {
                                    targeting = `keyword-group="${target.resolvedExpression[0].value}"`;
                                    matchType = `Keyword - group`;
                                }
                                else if (expressionType == "ASIN_EXPANDED_FROM") {
                                    targeting = `asin-expanded="${target.resolvedExpression[0].value}"`;
                                    matchType = `Product target - Expanded`;
                                }
                                else if (expressionType == "ASIN_CATEGORY_SAME_AS") {
                                    targeting = `Category: ${target.resolvedExpression[0].value}`;
                                    if (target.resolvedExpression.length > 1) {
                                        if (target.resolvedExpression[1].type == "ASIN_PRICE_GREATER_THAN") {
                                            targeting += `, Price: > ${target.resolvedExpression[1].value}`;
                                        } else if (target.resolvedExpression[1].type == "ASIN_PRICE_LESS_THAN") {
                                            targeting += `, Price: < ${target.resolvedExpression[1].value}`;
                                        } else {
                                            targeting += `, Price: ${target.resolvedExpression[1].value}`;
                                        }
                                    }
                                    matchType = `Product target - Category`;
                                }
                            }

                            let obj = {
                                configId: configId,
                                profileId: profileId,
                                type: "Sponsored Products",
                                targetId: `T-${target.targetId}`,
                                targeting: targeting,
                                campaignId: target.campaignId,
                                adGroupId: target.adGroupId,
                                status: target.state,
                                keywordBid: target.bid ?? 0,
                                matchType: matchType,
                                keywordType: keywordType,
                                timezone: getAccount.timezone
                            };
                            targets.push(obj);
                        });

                        const totalResults = body.totalResults;
                        nextToken = body.nextToken;
                        if (targets.length < totalResults && nextToken) {
                            makeRequest();
                        } else {
                            resolve(targets);
                        }
                    } else {
                        resolve(targets);
                    }
                }
                else {
                    cron_logs({
                        message: `Config ID: ${configId}, Profile ID: ${profileId} SP Targets listing err: ${body}`,
                        log_type: "error",
                    });
                    resolve(targets);
                }
            }).catch((error) => {
                cron_logs({
                    message: `Config ID: ${configId}, Profile ID: ${profileId} SP Tragets listing err: ${error}`,
                    log_type: "error",
                });
                resolve(targets);
            })
        }
        makeRequest();
    });
}


exports.getTargetingRule = async (req, res) => {
    const configId = req?.config?.configId;
    const userId = req.user._id;
    const profileId = req.body.profileId;
    const pageNo = req.body.pageNo ? req.body.pageNo : 1;
    const perPage = req.body.perPage ? req.body.perPage : 10;
    try {
        const pipeline = [
            {
                $match: {
                    configId: configId,
                    profileId: profileId,
                    // userId
                }
            },
            {
                $lookup: {
                    from: "targetingrulehistories",
                    localField: "_id",
                    foreignField: "ruleId",
                    as: "histories"
                }
            },
            {
                $addFields: {
                    lastRunDate: {
                        $arrayElemAt: [
                            {
                                $slice: [
                                    {
                                        $reverseArray:
                                            "$histories.updatedAt"
                                    },
                                    1
                                ]
                            },
                            0
                        ]
                    }
                }
            },
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
            {
                $unwind: {
                    path: "$user",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    createdBy: "$user.email",
                    userName: "$user.fullName"
                }
            },
            {
                $project: {
                    user: 0,
                    histories: 0 // optional, remove full history list
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: perPage * (pageNo - 1) },
                        { $limit: perPage }
                    ],
                    totalCount: [
                        { $count: "count" }
                    ],
                    allRulesSchedule: [{ $project: { _id: 1, ruleName: 1, days: 1, times: 1, campaignIds: 1, isActive: 1, actionType: 1, conditions: 1, isHourlyChanges: 1, hourlyConfig: 1, type: 1 } }],
                }
            }
        ];
        const result = await targetingRuleSchema.aggregate(pipeline);
        const getFilter = result[0].data;
        const totalRecords = result[0].totalCount[0]?.count || 0;
        const allRulesSchedule = result[0].allRulesSchedule || [];
        const adminBlockedSchedule = await ruleBlockedTimeSchema.find().lean();

        return res.status(200).send({
            isSuccess: true,
            message: "Targeting rule listing successfully.",
            currentPageNo: pageNo,
            totalRecords: totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
            data: getFilter,
            allRulesSchedule,
            adminBlockedSchedule,
        });
    } catch (error) {
        write_logs({ message: `[getTargetingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};


exports.createTargetingRule = async (req, res) => {
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
        allowMultiTimeChanges,
        daysSinceCreation,
        isDaysSinceCreation,
        isHourlyBid,
        hourlyConfig,
        campaignIds,
        targetingIds,
    } = req.body;
    try {
        const assignment = validateCampaignAssignment(req.body.campaignIds);
        if (assignment.error) return res.status(400).send({ isSuccess: false, message: assignment.error });

        const getAccount = await getProfile(configId, profileId);
        if (!getAccount) {
            return res
                .status(203)
                .send({ message: "Please select valid account!", isSuccess: false });
        }

        // const duplicationRule = await isDuplicateTargetingRule(configId, userId, profileId, conditions);
        // if (duplicationRule) {
        //     return res.status(203).send({
        //         isSuccess: false,
        //         message: "A rule with the same conditions already exists. Please modify the conditions to create a new rule.",
        //     });
        // }

        const createCronFilter = await targetingRuleSchema({
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
            daysSinceCreation,
            isDaysSinceCreation,
            times,
            query,
            countryCode: getAccount.countryCode,
            timezone: getAccount.timezone,
            userId,
            isHourlyBid: isHourlyBid || false,
            targetingIds: targetingIds || { SP: [], SB: [], SD: [] },
            campaignIds: assignment.campaignIds,
            hourlyConfig: isHourlyBid ? hourlyConfig : undefined,
        });
        createCronFilter
            .save()
            .then(async (rule) => {
                await logAudit("TARGETING_RULE_CREATION", `Created targeting rule: ${rule.ruleName}`, {
                    ruleName,
                    conditions,
                    actionType,
                    days,
                    times,
                    ruleType,
                    startDate,
                    endDate,
                    allowMultiTimeChanges,
                    daysSinceCreation,
                    reportDate,
                    toDate,
                    isHourlyBid,
                    hourlyConfig,
                }, req?.user?.id);
                return res.status(200).send({
                    isSuccess: true,
                    message: "Targeting rule created successfully.",
                    data: rule,
                });
            })
            .catch((error) => {
                write_logs({ message: `[createTargetingRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                return res.status(203).send({
                    message: "Something went wrong, please try again!",
                    isSuccess: false,
                    error: "An internal server error occurred",
                });
            });
    } catch (error) {
        write_logs({ message: `[createTargetingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.updateTargetingRule = async (req, res) => {
    const ruleId = req.params.ruleId;
    const configId = req?.config?.configId;
    const userId = req.user._id;
    const { profileId, conditions } = req.body;

    try {
        const { times, days } = req.body;
        // const duplicationRule = await isDuplicateTargetingRule(configId, userId, profileId, conditions, ruleId);
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

        await targetingRuleSchema
            .findOneAndUpdate({ _id: ruleId, ...(configId && { configId }) }, updateData, { new: true })
            .then(async (rule) => {
                if (!rule) {
                    return res
                        .status(203)
                        .send({ message: "Targeting rule not found!", isSuccess: false });
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

                await logAudit("TARGETING_RULE_UPDATE", `Updated targeting rule: ${rule.ruleName}`, {
                    ruleName: rule?.ruleName,
                    conditions: rule?.conditions,
                    actionType: rule?.actionType,
                    days: rule?.days,
                    times: rule?.times,
                    ruleType: rule?.ruleType,
                    startDate: rule?.startDate,
                    endDate: rule?.endDate,
                    allowMultiTimeChanges: rule?.allowMultiTimeChanges,
                    daysSinceCreation: rule?.daysSinceCreation,
                    reportDate: rule?.reportDate,
                    toDate: rule?.toDate,
                    isHourlyBid: rule?.isHourlyBid,
                    hourlyConfig: rule?.hourlyConfig,
                    campaigns,
                }, req?.user?.id);
                return res.status(200).send({
                    message: "Targeting rule updated successfully.",
                    isSuccess: true,
                });
            })
            .catch((error) => {
                write_logs({ message: `[updateTargetingRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                return res.status(203).send({
                    error: "An internal server error occurred",
                    message: "Something went wrong, please try again!",
                    isSuccess: false,
                });
            });
    } catch (error) {
        write_logs({ message: `[updateTargetingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};

exports.getTargetingRuleById = async (req, res) => {
    const configId = req?.config?.configId;
    const _id = req.params.ruleId;
    try {
        const getRule = await targetingRuleSchema.findOne({ _id, ...(configId && { configId }) }).lean();
        return res.status(200).send({
            message: "Get Targeting rule successfully",
            data: getRule,
            isSuccess: true,
        });
    } catch (error) {
        write_logs({ message: `[getTargetingRuleById Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};

exports.changeTargetingRuleStatus = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { isActive, ids } = req.body;

        // Validation
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).send({
                message: "ids array is required",
                isSuccess: false,
            });
        }

        // Bulk update
        const result = await targetingRuleSchema.updateMany(
            { _id: { $in: ids }, ...(configId && { configId }) },
            { $set: { isActive: isActive } }
        );

        const updatedRules = await targetingRuleSchema.find({ _id: { $in: ids }, ...(configId && { configId }) }, "ruleName");
        const ruleNames = updatedRules.map(r => r.ruleName).join(", ");

        await logAudit("TARGETING_RULE_STATUS_CHANGE", `Targeting rules ${ruleNames} ${isActive ? "enabled" : "disabled"}`, {
            ruleNames
        }, req?.user?.id);
        if (result.matchedCount === 0) {
            return res.status(203).send({
                message: "No rules found!",
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
        write_logs({ message: `[changeTargetingRuleStatus Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.deleteTargetingRule = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const ruleId = req.params.ruleId;
        await targetingRuleSchema
            .findOneAndDelete({ _id: ruleId, ...(configId && { configId }) })
            .then(async (rule) => {
                if (!rule) {
                    return res
                        .status(203)
                        .send({ message: "Targeting rule not found!", isSuccess: false });
                }
                await logAudit("TARGETING_RULE_DELETION", `Deleted targeting rule: ${rule.ruleName}`, {
                    ruleName: rule?.ruleName,
                }, req?.user?.id);
                return res
                    .status(200)
                    .send({ message: "Targeting rule deleted successfully.", isSuccess: true });
            })
            .catch((error) => {
                write_logs({ message: `[deleteTargetingRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                return res.status(203).send({
                    error: "An internal server error occurred",
                    message: "Something went wrong, please try again!",
                    isSuccess: false,
                });
            });
    } catch (error) {
        write_logs({ message: `[deleteTargetingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

const checkIfTargetingLastOrNot = async (targeting, status, currentDate, configId, profile, checkConfigAds, type) => {
    const result = { cascaded: false, actions: [] };

    const normalizedStatus = `${status}`.toUpperCase();
    const isPause = normalizedStatus === "PAUSED";
    const isEnable = normalizedStatus === "ENABLED";

    if (!isPause && !isEnable) return result;

    const reportDate = currentDate;

    if (isPause) {
        const activeKeywordsInAdGroup = await targetingSchema.countDocuments({
            configId,
            profileId: profile?.profileId,
            adGroupId: targeting?.adGroupId,
            reportDate,
            status: { $in: ["ENABLED"] },
            targetId: { $ne: targeting?.targetId },
        });

        if (activeKeywordsInAdGroup > 0) return result;

        result.cascaded = true;
        cron_logs({ message: `[CascadePause] targetId=${targeting?.targetId} is the LAST active keyword in adGroupId=${targeting.adGroupId}. Cascading pause... [body] ${JSON.stringify(req?.body)}`, log_type: "info" });

        // ── 1. Pause the Ad Group ─────────────────────────────────────────────────
        try {
            const adGroupOptions = {
                method: "PUT",
                url: `${profile.amazonUrl}/sp/adGroups`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Prefer": "return=representation",
                    "Accept": "application/vnd.spAdGroup.v3+json",
                    "Content-Type": "application/vnd.spAdGroup.v3+json",
                },
                data: {
                    adGroups: [{ adGroupId: String(targeting.adGroupId), state: "PAUSED" }]
                },
                meta: { configId: configId, tokenKey: "adsAccessToken" }
            };

            const response = await retryWithBackoff(() => amazonAxios(adGroupOptions));
            if (response?.status === 207) {
                await adGroupsSchema.findOneAndUpdate(
                    { configId, profileId: profile?.profileId, adGroupId: targeting.adGroupId, reportDate },
                    { $set: { status: "PAUSED" } }
                ).lean();
            }

            result.actions.push(`AdGroup ${targeting.adGroupId} paused`);
            cron_logs({ message: `[CascadePause] AdGroup ${targeting.adGroupId} paused successfully. [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
        } catch (err) {
            cron_logs({ message: `[CascadePause] Failed to pause AdGroup ${targeting?.adGroupId}: ${err?.message} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
        }

        // ── 2. Check remaining active ad groups in campaign ───────────────
        const activeAdGroupsInCampaign = await adGroupsSchema.countDocuments({
            configId,
            profileId: profile?.profileId,
            campaignId: targeting.campaignId,
            reportDate,
            status: { $in: ["ENABLED"] },
            adGroupId: { $ne: targeting.adGroupId },
        });

        if (activeAdGroupsInCampaign > 0) {
            cron_logs({ message: `[CascadePause] Campaign ${targeting.campaignId} still has ${activeAdGroupsInCampaign} active ad group(s). Skipping campaign pause. [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
            return result;
        }

        // ── 3. Pause the Campaign ─────────────────────────────────────────────────
        try {
            const campaignOptions = {
                method: "PUT",
                url: `${profile.amazonUrl}/sp/campaigns`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Prefer": "return=representation",
                    "Accept": "application/vnd.spCampaign.v3+json",
                    "Content-Type": "application/vnd.spCampaign.v3+json",
                },
                data: {
                    campaigns: [{ campaignId: String(targeting.campaignId), state: "PAUSED" }]
                },
                meta: { configId: configId, tokenKey: "adsAccessToken" }
            };

            const response = await retryWithBackoff(() => amazonAxios(campaignOptions));
            if (response?.status === 207) {
                await campaignSchema.findOneAndUpdate(
                    { configId, profileId: profile?.profileId, campaignId: targeting?.campaignId, reportDate },
                    { $set: { status: "PAUSED" } }
                ).lean();
            }

            result.actions.push(`Campaign ${targeting.campaignId} paused`);
            cron_logs({ message: `[CascadePause] Campaign ${targeting.campaignId} paused successfully. [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
        } catch (err) {
            cron_logs({ message: `[CascadePause] Failed to pause Campaign ${targeting?.campaignId}: ${err?.message} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
        }
    }

    if (isEnable) {

        const adGroup = await adGroupsSchema.findOne(
            { configId, profileId: profile?.profileId, adGroupId: targeting.adGroupId, reportDate },
            { status: 1 }
        ).lean();

        const adGroupIsPaused = `${adGroup?.status}`.toUpperCase() === "PAUSED";

        if (!adGroupIsPaused) {
            cron_logs({ message: `[CascadeEnable] AdGroup ${targeting.adGroupId} is already ENABLED. No cascade needed. [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
            return result;
        }

        result.cascaded = true;
        cron_logs({ message: `[CascadeEnable] targetId=${targeting?.targetId} re-enabled. AdGroup ${targeting.adGroupId} was PAUSED — cascading enable... [body] ${JSON.stringify(req?.body)}`, log_type: "info" });

        // ── 2. Enable the Ad Group ────────────────────────────────────────
        try {
            const adGroupOptions = {
                method: "PUT",
                url: `${profile.amazonUrl}/sp/adGroups`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Prefer": "return=representation",
                    "Accept": "application/vnd.spAdGroup.v3+json",
                    "Content-Type": "application/vnd.spAdGroup.v3+json",
                },
                data: { adGroups: [{ adGroupId: String(targeting.adGroupId), state: "ENABLED" }] },
                meta: { configId, tokenKey: "adsAccessToken" }
            };

            const response = await retryWithBackoff(() => amazonAxios(adGroupOptions));
            if (response?.status === 207) {
                await adGroupsSchema.findOneAndUpdate(
                    { configId, profileId: profile?.profileId, adGroupId: targeting.adGroupId, reportDate },
                    { $set: { status: "ENABLED" } }
                ).lean();
            }

            result.actions.push(`AdGroup ${targeting.adGroupId} enabled`);
            cron_logs({ message: `[CascadeEnable] AdGroup ${targeting.adGroupId} enabled successfully. [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
        } catch (err) {
            cron_logs({ message: `[CascadeEnable] Failed to enable AdGroup ${targeting?.adGroupId}: ${err?.message} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
        }

        // ── 3. Check if Campaign is currently PAUSED ──────────────────────
        const campaign = await campaignSchema.findOne(
            { configId, profileId: profile?.profileId, campaignId: targeting.campaignId, reportDate },
            { status: 1 }
        ).lean();

        const campaignIsPaused = `${campaign?.status}`.toUpperCase() === "PAUSED";

        if (!campaignIsPaused) {
            cron_logs({ message: `[CascadeEnable] Campaign ${targeting.campaignId} is already ENABLED. No further cascade needed. [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
            return result;
        }

        // ── 4. Enable the Campaign ────────────────────────────────────────
        try {
            const campaignOptions = {
                method: "PUT",
                url: `${profile.amazonUrl}/sp/campaigns`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Prefer": "return=representation",
                    "Accept": "application/vnd.spCampaign.v3+json",
                    "Content-Type": "application/vnd.spCampaign.v3+json",
                },
                data: { campaigns: [{ campaignId: String(targeting.campaignId), state: "ENABLED" }] },
                meta: { configId, tokenKey: "adsAccessToken" }
            };

            const response = await retryWithBackoff(() => amazonAxios(campaignOptions));
            if (response?.status === 207) {
                await campaignSchema.findOneAndUpdate(
                    { configId, profileId: profile?.profileId, campaignId: targeting?.campaignId, reportDate },
                    { $set: { status: "ENABLED" } }
                ).lean();
            }

            result.actions.push(`Campaign ${targeting.campaignId} enabled`);
            cron_logs({ message: `[CascadeEnable] Campaign ${targeting.campaignId} enabled successfully. [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
        } catch (err) {
            cron_logs({ message: `[CascadeEnable] Failed to enable Campaign ${targeting?.campaignId}: ${err?.message} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
        }
    }

    return result;
};

const checkIfAdGroupLastOrNot = async (targeting, status, currentDate, configId, profile, checkConfigAds, type) => {
    const result = { cascaded: false, actions: [] };

    const normalizedStatus = `${status}`.toUpperCase();
    const isPause = normalizedStatus === "PAUSED";
    const isEnable = normalizedStatus === "ENABLED";

    if (!isPause && !isEnable) return result;

    const reportDate = currentDate;

    if (isPause) {

        const activeAdGroupsInCampaign = await adGroupsSchema.countDocuments({
            configId,
            profileId: profile?.profileId,
            campaignId: targeting?.campaignId,
            reportDate,
            status: { $in: ["ENABLED"] },
            adGroupId: { $ne: targeting?.adGroupId },
        });

        if (activeAdGroupsInCampaign > 0) return result;

        result.cascaded = true;

        cron_logs({
            message: `[CascadePause] AdGroup ${targeting?.adGroupId} is LAST active in Campaign ${targeting?.campaignId}. Cascading pause...`,
            log_type: "info"
        });

        // ── Pause Campaign ─────────────────────────
        try {
            const campaignOptions = {
                method: "PUT",
                url: `${profile.amazonUrl}/sp/campaigns`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Prefer": "return=representation",
                    "Accept": "application/vnd.spCampaign.v3+json",
                    "Content-Type": "application/vnd.spCampaign.v3+json",
                },
                data: {
                    campaigns: [
                        { campaignId: String(targeting?.campaignId), state: "PAUSED" }
                    ]
                },
                meta: { configId, tokenKey: "adsAccessToken" }
            };

            const response = await retryWithBackoff(() => amazonAxios(campaignOptions));

            if (response?.status === 207) {
                await campaignSchema.findOneAndUpdate(
                    {
                        configId,
                        profileId: profile?.profileId,
                        campaignId: targeting?.campaignId,
                        reportDate
                    },
                    { $set: { status: "PAUSED" } }
                ).lean();
            }

            result.actions.push(`Campaign ${targeting?.campaignId} paused`);

            cron_logs({
                message: `[CascadePause] Campaign ${targeting?.campaignId} paused successfully.`,
                log_type: "info"
            });

        } catch (err) {
            cron_logs({
                message: `[CascadePause] Failed to pause Campaign ${targeting?.campaignId}: ${err?.message}`,
                log_type: "info"
            });
        }
    }

    if (isEnable) {

        const campaign = await campaignSchema.findOne(
            {
                configId,
                profileId: profile?.profileId,
                campaignId: targeting?.campaignId,
                reportDate
            },
            { status: 1 }
        ).lean();

        const campaignIsPaused = `${campaign?.status}`.toUpperCase() === "PAUSED";

        if (!campaignIsPaused) {
            cron_logs({
                message: `[CascadeEnable] Campaign ${targeting?.campaignId} already ENABLED. No cascade needed.`,
                log_type: "info"
            });
            return result;
        }

        result.cascaded = true;

        cron_logs({
            message: `[CascadeEnable] AdGroup ${targeting?.adGroupId} enabled while Campaign ${targeting?.campaignId} is PAUSED — cascading enable...`,
            log_type: "info"
        });

        try {
            const campaignOptions = {
                method: "PUT",
                url: `${profile.amazonUrl}/sp/campaigns`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Prefer": "return=representation",
                    "Accept": "application/vnd.spCampaign.v3+json",
                    "Content-Type": "application/vnd.spCampaign.v3+json",
                },
                data: {
                    campaigns: [
                        { campaignId: String(targeting?.campaignId), state: "ENABLED" }
                    ]
                },
                meta: { configId, tokenKey: "adsAccessToken" }
            };

            const response = await retryWithBackoff(() => amazonAxios(campaignOptions));

            if (response?.status === 207) {
                await campaignSchema.findOneAndUpdate(
                    {
                        configId,
                        profileId: profile?.profileId,
                        campaignId: targeting?.campaignId,
                        reportDate
                    },
                    { $set: { status: "ENABLED" } }
                ).lean();
            }

            result.actions.push(`Campaign ${targeting?.campaignId} enabled`);

            cron_logs({
                message: `[CascadeEnable] Campaign ${targeting?.campaignId} enabled successfully.`,
                log_type: "info"
            });

        } catch (err) {
            cron_logs({
                message: `[CascadeEnable] Failed to enable Campaign ${targeting?.campaignId}: ${err?.message}`,
                log_type: "info"
            });
        }
    }

    return result;
};

const getTypeBasedRuleData = async (rule, type, model, capture = false) => {
    const hasExplicitCampaigns = (rule.campaignIds?.SP?.length > 0) || (rule.campaignIds?.SB?.length > 0) || (rule.campaignIds?.SD?.length > 0) || (Array.isArray(rule.campaignIds) && rule.campaignIds.length > 0);

    if (!hasExplicitCampaigns) {
        return [];
    }

    if (hasExplicitCampaigns && (!rule.campaignIds?.[type] || rule.campaignIds[type].length === 0)) {
        return [];
    }

    const campaignModel = type === "SB" ? sbCampaignSchema : (type === "SD" ? sdCampaignSchema : campaignSchema);
    const activeCampaigns = await campaignModel.aggregate([
        {
            $match: {
                profileId: Number(rule.profileId),
                ...(rule.configId ? { configId: new ObjectId(rule.configId) } : {}),
                campaignId: { $in: rule.campaignIds[type].map(Number) }
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

    const now = moment().tz(rule.timezone);
    const currentDate = now.format("YYYY-MM-DD");

    let query = {
        configId: rule.configId,
        profileId: rule.profileId,
        campaignId: { $in: targetCampaignIds }
    };

    let { fromDate, toDate } = getTargetingRuleDate(now, rule.reportDate, getRuleDate(rule.timezone, rule.reportDate, rule.toDate));
    if (rule?.reportDate !== "LIFETIME") {
        query.reportDate = { $gte: fromDate, $lte: toDate }
    }
    else {
        toDate = currentDate;
    }

    const pipeline = await this.targetingPipeline(query, toDate, type);


    const conditionStages = [];

    if (rule.query && rule?.query?.[type]) {
        let parsedQuery = sanitizeQueryObject(safeJsonParse(rule?.query?.[type]));
        conditionStages.push({ $match: parsedQuery });
    }

    if (rule.isDaysSinceCreation) {
        conditionStages.push({ $match: { daysSinceCreation: { $gte: Number(rule.daysSinceCreation || 0) } } });
    }

    const isKeywordTargeting = rule.isHourlyBid
        ? (rule.hourlyConfig?.targetingType === "KEYWORDS")
        : (rule.type === "KEYWORDS" || rule.targetingIds?.[type]?.length > 0);
    const targetIds = (rule.hourlyConfig?.targetingType === "KEYWORDS" ? rule.hourlyConfig?.targetingIds?.[type] : null) || rule.targetingIds?.[type] || [];
    if (isKeywordTargeting && targetIds.length > 0) {
        pipeline.push({
            $match: {
                $or: [
                    { targetId: { $in: targetIds.map(String) } },
                    { targetId: { $in: targetIds.map(Number).filter(n => !isNaN(n)) } },
                    { keywordId: { $in: targetIds.map(String) } },
                    { keywordId: { $in: targetIds.map(Number).filter(n => !isNaN(n)) } },
                ]
            }
        });
    }

    pipeline.push({
        $match: {
            status: { $in: ["ENABLED", "enabled"] }
        }
    });

    const targetingList = await getConditionRows({ rule, ruleType: "targeting", adType: type, model, pipeline, conditionStages, capture, useSavedConditions: false, ruleModel: targetingRuleSchema });

    const campaignIds = targetingList.map(c => c.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
    const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate, type);
    const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));

    return targetingList.map(c => ({ ...c, isEligible: !lowStockIds.has(c.campaignId) }));
}

exports.ruleEffectedTargeting = async (req, res) => {
    const ruleId = req.params.ruleId;
    try {
        const rule = await targetingRuleSchema.findById(ruleId).lean();
        if (!rule) {
            return res.status(203).send({
                message: "Rule not found!",
                isSuccess: false,
            });
        }

        const [SP, SB, SD] = await Promise.all([
            getTypeBasedRuleData({ ...rule }, "SP", targetingSchema),
            getTypeBasedRuleData({ ...rule }, "SB", sbTargetingSchema),
            getTypeBasedRuleData({ ...rule }, "SD", sdTargetingSchema),
        ]);

        return res.status(200).send({
            isSuccess: true,
            message: "Targeting rule data fetched successfully.",
            data: { SP, SB, SD },
        });

    } catch (error) {
        write_logs({ message: `[ruleEffectedTargeting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}

exports.manualRunTargetingRule = async (req, res) => {
    const ruleId = req.params.ruleId;

    let { data: targetingList } = req.body;

    try {

        const rule = await targetingRuleSchema.findById(ruleId).lean();
        if (!rule) {
            return res.status(203).send({
                message: "Rule not found!",
                isSuccess: false,
            });
        }

        const hasAssignedCampaigns = (rule.campaignIds?.SP?.length > 0) || (rule.campaignIds?.SB?.length > 0) || (rule.campaignIds?.SD?.length > 0) || (Array.isArray(rule.campaignIds) && rule.campaignIds.length > 0);
        if (!hasAssignedCampaigns) {
            return res.status(203).send({
                message: "Rule assign campaigns not found",
                isSuccess: false,
            });
        }

        if (!(targetingList?.SP?.length || targetingList?.SB?.length || targetingList?.SD?.length)) {
            return res.status(203).send({
                message: "Targeting data not found!",
                isSuccess: false,
            });
        }

        const profile = await getProfile(rule?.configId, rule?.profileId);
        const configId = rule.configId;
        const checkConfigAds = await getAccessToken(configId);
        if (
            checkConfigAds &&
            checkConfigAds.adsAccessToken
        ) {
            const now = moment().tz(rule.timezone);
            const currentDate = now.format("YYYY-MM-DD");
            let currentTime = now.format("HH:mm:ss");

            if (rule.isHourlyBid) {
                const nowHour = now.hour();
                const activeSlot = getActiveSlot(rule.hourlyConfig?.slots || [], nowHour);
                if (activeSlot && activeSlot.enabled) {
                    // Retain activeSlot configuration without overriding currentTime with slot startTime
                    const isTargetState = ["Enabled", "Paused"].includes(rule.actionType?.actionName);
                    const isCampaignState = ["CampaignEnabled", "CampaignPaused"].includes(rule.actionType?.actionName);
                    const isAdGroupState = ["AdGroupEnabled", "AdGroupPaused"].includes(rule.actionType?.actionName);

                    if (isTargetState || isCampaignState || isAdGroupState) {
                        const isSlotEnabled = activeSlot.state === "ENABLED" || (activeSlot.state === undefined && activeSlot.enabled !== false);
                        if (isTargetState) {
                            rule.actionType = { ...rule.actionType, actionName: isSlotEnabled ? "Enabled" : "Paused", actionValue: "", actionValueType: "" };
                        } else if (isCampaignState) {
                            rule.actionType = { ...rule.actionType, actionName: isSlotEnabled ? "CampaignEnabled" : "CampaignPaused", actionValue: "", actionValueType: "" };
                        } else if (isAdGroupState) {
                            rule.actionType = { ...rule.actionType, actionName: isSlotEnabled ? "AdGroupEnabled" : "AdGroupPaused", actionValue: "", actionValueType: "" };
                        }
                    } else if (rule.actionType?.actionValueType === "Number") {
                        const numVal = Number(activeSlot.value !== undefined && activeSlot.value !== null && activeSlot.value !== "" ? activeSlot.value : activeSlot.bidPercentage);
                        rule.actionType = { ...rule.actionType, actionValue: !isNaN(numVal) ? numVal : 0, actionValueType: "Number" };
                    } else {
                        const numVal = Number(activeSlot.bidPercentage !== undefined && activeSlot.bidPercentage !== null && activeSlot.bidPercentage !== "" ? activeSlot.bidPercentage : activeSlot.value);
                        rule.actionType = { ...rule.actionType, actionValue: !isNaN(numVal) ? numVal : 0, actionValueType: "Percentage" };
                    }
                }
            }

            if (rule.ruleType != "T" || (rule.ruleType == "T" && moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]"))) {

                targetingList = await captureManualSelection(rule, "targeting", targetingList, type => getTypeBasedRuleData(rule, type, { SP: targetingSchema, SB: sbTargetingSchema, SD: sdTargetingSchema }[type], true));

                const spStatus = await runSponsoredProductRule(rule, checkConfigAds, profile, currentDate, currentTime, targetingList?.SP, true);
                const sbStatus = await runSponsoredBrandRule(rule, checkConfigAds, profile, currentDate, currentTime, targetingList?.SB, true);
                const sdStatus = await runSponsoredDisplayRule(rule, checkConfigAds, profile, currentDate, currentTime, targetingList?.SD, true);

                if (!spStatus || !sbStatus || !sdStatus) {
                    return res.status(203).send({
                        message: "Something went wrong, please try again!",
                        isSuccess: false,
                    });
                }

                return res.status(200).send({
                    isSuccess: true,
                    message: "Targeting rule run successfully",
                });

            }
            else {
                return res.status(203).send({
                    message: "This rule is Time based. So it is not the current time to run this rule.",
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
        write_logs({ message: `[manualRunTargetingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
}

const runSponsoredProductRule = async (rule, checkConfigAds, profile, currentDate, currentTime, data, isManual = false) => {
    let targetingList = []
    if (Array.isArray(data)) {
        // if (!data?.length) return true
        targetingList = data
    } else {
        targetingList = await getTypeBasedRuleData(rule, "SP", targetingSchema, true)
    }

    cron_logs({
        message: `runSponsoredProductRule -> Condition Matched Targeting Count: ${targetingList.length} for Rule: ${rule.ruleName}`,
        log_type: "info",
    });

    const campaignIds = targetingList.map(t => t.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
    const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate);

    const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
    const eligibleTargeting = targetingList.filter(c => !lowStockIds.has(c.campaignId) && ["ENABLED", "enabled"].includes(c.status));

    cron_logs({
        message: `runSponsoredProductRule -> Eligible Targeting Count: ${eligibleTargeting.length} for Rule: ${rule.ruleName}`,
        log_type: "info",
    });

    let remark = isManual ? "Manual Run" : "-";
    if (lowStockCampaigns.length > 0) {
        const lowProduct = lowStockCampaigns?.map(item => ({
            updateOne: {
                filter: {
                    configId: rule.configId,
                    profileId: rule.profileId,
                    ruleId: rule?._id,
                    ruleDate: currentDate,
                    campaignId: item.campaignId
                },
                update: {
                    $set: {
                        type: "SP",
                        totalProduct: item?.totalProducts,
                        inStockProduct: item?.totalInStockProducts,
                        availabilityRatio: item?.availabilityRatio
                    }
                },
                upsert: true
            }
        }))

        await campaignProductEligibleStatusByRuleSchema.bulkWrite(lowProduct);
        remark = "Rule Blocked - Low Product Eligibility";
    }

    await targetingRuleHistorySchema.findOneAndUpdate(
        {
            configId: rule.configId,
            profileId: rule.profileId,
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
                remark: remark
            }
        },
        { upsert: true, new: true }
    ).lean();

    if (eligibleTargeting.length > 0) {
        const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "targetingRuleSetting");

        const stagedSPTargets = [];
        const stagedSPKeywords = [];
        const stagedSPCampaigns = [];
        const stagedSPAdGroups = [];

        for (const targeting of eligibleTargeting) {
            cron_logs({
                message: `Rule ID: ${rule?._id}, Rule Name: ${rule?.ruleName}, SP-Targeting: ${JSON.stringify(targeting)}`,
                log_type: "info",
            });

            const existingActive = await affectedCampaignByRuleSchema.findOne({
                configId: rule.configId,
                profileId: rule.profileId,
                userId: rule.userId,
                ruleSchema: "TargetingRule",
                ruleId: rule._id,
                type: "SP",
                campaignId: targeting.campaignId,
                targetId: targeting.targetId,
                isActive: true
            }).lean();

            if (!existingActive || rule.allowMultiTimeChanges || 1 == 1) {
                const actionType = rule.actionType;
                const isCampaign = ["CampaignEnabled", "CampaignPaused"].includes(actionType.actionName);
                const isAdGroup = ["AdGroupEnabled", "AdGroupPaused"].includes(actionType.actionName);

                const oldStatus = isCampaign ? (existingActive ? existingActive.oldValue : targeting?.campaignStatus) : isAdGroup ? (existingActive ? existingActive.oldValue : targeting?.adGroupStatus) : (existingActive ? existingActive.oldValue : targeting.status);
                let status = isCampaign ? targeting?.campaignStatus : isAdGroup ? targeting?.adGroupStatus : targeting.status;
                let keywordBid = targeting.keywordBid;
                const isDayparting = Boolean(rule.isHourlyBid || rule.hourlyConfig?.slots?.length);
                const runPrefix = isDayparting
                    ? (isManual ? `Manual Dayparting Run (${rule.ruleName})` : `Dayparting Rule Run (${rule.ruleName})`)
                    : (isManual ? `Manual Run (${rule.ruleName})` : `Rule Run (${rule.ruleName})`);
                let keywordBidUpdatedFrom = `${runPrefix}: Targeting bid adjusted`;
                let changed;

                if (["Enabled", "Paused"].includes(actionType.actionName)) {
                    status = actionType.actionName.toUpperCase();
                    if (status) {
                        if (existingActive && String(existingActive.newValue) === String(status) && String(targeting.status).toUpperCase() === String(status)) {
                            await recordRuleExecutionChange({
                                conditionSnapshot: targeting.conditionSnapshot,
                                configId: rule.configId,
                                profileId: rule.profileId,
                                userId: rule.userId,
                                ruleSchema: "TargetingRule",
                                ruleId: rule._id,
                                ruleDate: currentDate,
                                ruleTime: currentTime,
                                type: "SP",
                                campaignId: targeting.campaignId,
                                adGroupId: targeting?.adGroupId,
                                targetId: targeting.targetId,
                                name: targeting.campaignName,
                                adGroupName: targeting?.adGroupName,
                                targetName: targeting?.targeting,
                                targetType: targeting?.matchType,
                                oldValue: oldStatus,
                                newValue: status,
                                changed: "state",
                                metrics: {
                                    impressions: targeting?.impressions,
                                    clicks: targeting?.clicks,
                                    spend: targeting?.spend,
                                    sales: targeting?.sales,
                                    orders: targeting?.orders,
                                    acos: targeting?.acos,
                                    roas: targeting?.roas,
                                    cpc: targeting?.cpc,
                                    ctr: targeting?.ctr,
                                },
                                notes: `Periodic metric sync snapshot: ${rule.ruleName}`,
                            });
                            continue;
                        }
                        changed = "state";
                    }
                }

                if (["Increase", "Decrease", "SetBid"].includes(actionType.actionName)) {
                    let actionValue = actionType.actionValue;
                    const baseline = existingActive ? (parseFloat(existingActive.oldValue) || parseFloat(targeting.keywordBid)) : parseFloat(targeting.keywordBid);
                    let calculatedBid = baseline;

                    if (actionType.actionValueType == "Percentage") {
                        const delta = (baseline * parseFloat(actionValue)) / 100;
                        calculatedBid = actionType.actionName === "Increase" ? baseline + delta : baseline - delta;
                    } else if (actionType.actionName === "Increase") {
                        calculatedBid = baseline + parseFloat(actionValue);
                    } else if (actionType.actionName === "Decrease") {
                        calculatedBid = baseline - parseFloat(actionValue);
                    } else if (actionType.actionName == "SetBid") {
                        calculatedBid = parseFloat(actionValue);
                    }

                    calculatedBid = parseFloat(calculatedBid.toFixed(2));

                    if (bidThreshold?.maxBid && calculatedBid > bidThreshold?.maxBid) {
                        calculatedBid = bidThreshold?.maxBid;
                    }

                    if (bidThreshold?.minBid && calculatedBid < bidThreshold?.minBid) {
                        calculatedBid = bidThreshold?.minBid;
                    }

                    const marketMin = getMarketplaceMinBid(profile?.currencyCode, profile?.countryCode);
                    const maxCap = (targeting?.bidThreshold?.maxBid && Number(targeting.bidThreshold.maxBid) > 0) ? Number(targeting.bidThreshold.maxBid) : 50;
                    const minCap = Math.max(marketMin, (targeting?.bidThreshold?.minBid && Number(targeting.bidThreshold.minBid) > 0) ? Number(targeting.bidThreshold.minBid) : marketMin);
                    const originalAttemptedBid = calculatedBid;
                    if (calculatedBid > maxCap) calculatedBid = maxCap;
                    if (calculatedBid < minCap) {
                        calculatedBid = minCap;
                        await sendMinBidClampedNotification({
                            profile,
                            rule,
                            targeting,
                            calculatedBid: originalAttemptedBid,
                            clampedBid: calculatedBid,
                            marketMin,
                            adType: "SP",
                        });
                    }

                    if (existingActive && Number(existingActive.newValue) === calculatedBid && (Number(targeting.keywordBid) === calculatedBid || isDayparting)) {
                        await recordRuleExecutionChange({
                            conditionSnapshot: targeting.conditionSnapshot,
                            configId: rule.configId,
                            profileId: rule.profileId,
                            userId: rule.userId,
                            ruleSchema: "TargetingRule",
                            ruleId: rule._id,
                            ruleDate: currentDate,
                            ruleTime: currentTime,
                            type: "SP",
                            campaignId: targeting.campaignId,
                            adGroupId: targeting?.adGroupId,
                            targetId: targeting.targetId,
                            name: targeting.campaignName,
                            adGroupName: targeting?.adGroupName,
                            targetName: targeting?.targeting,
                            targetType: targeting?.matchType,
                            oldValue: parseFloat(targeting.keywordBid),
                            newValue: calculatedBid,
                            changed: "bid",
                            metrics: {
                                impressions: targeting?.impressions,
                                clicks: targeting?.clicks,
                                spend: targeting?.spend,
                                sales: targeting?.sales,
                                orders: targeting?.orders,
                                acos: targeting?.acos,
                                roas: targeting?.roas,
                                cpc: targeting?.cpc,
                                ctr: targeting?.ctr,
                            },
                            notes: `Periodic metric sync snapshot: ${rule.ruleName}`,
                        });
                        continue;
                    }

                    keywordBid = calculatedBid;
                    changed = "bid";
                }

                if (isCampaign) {
                    status = `${actionType.actionName}`.replace("Campaign", "").toUpperCase();
                    changed = "campaignState";
                }

                if (isAdGroup) {
                    status = `${actionType.actionName}`.replace("AdGroup", "").toUpperCase();
                    changed = "adGroupState";
                }

                const context = {
                    targeting, existingActive, oldValue: existingActive ? (["Enabled", "Paused", "CampaignEnabled", "CampaignPaused", "AdGroupEnabled", "AdGroupPaused"].includes(actionType.actionName) ? existingActive.oldValue : parseFloat(existingActive.oldValue)) : (["Enabled", "Paused", "CampaignEnabled", "CampaignPaused", "AdGroupEnabled", "AdGroupPaused"].includes(actionType.actionName) ? oldStatus : targeting.keywordBid),
                    newValue: ["Enabled", "Paused", "CampaignEnabled", "CampaignPaused", "AdGroupEnabled", "AdGroupPaused"].includes(actionType.actionName) ? status : Number(keywordBid),
                    changed, status, keywordBid, isCampaign, isAdGroup, actionType, oldStatus, keywordBidUpdatedFrom,
                    isDayparting, runPrefix
                };

                if (targeting?.targetId?.startsWith("T-")) {
                    stagedSPTargets.push({
                        targetId: targeting.targetId.replace("T-", ""),
                        ...(changed === "bid" ? { bid: Number(keywordBid) } : { state: status }),
                        context
                    });
                } else if (targeting?.targetId?.startsWith("K-")) {
                    stagedSPKeywords.push({
                        keywordId: targeting.targetId.replace("K-", ""),
                        ...(changed === "bid" ? { bid: Number(keywordBid) } : { state: status }),
                        context
                    });
                } else if (isCampaign) {
                    stagedSPCampaigns.push({
                        campaignId: String(targeting.campaignId),
                        state: status,
                        context
                    });
                } else if (isAdGroup) {
                    stagedSPAdGroups.push({
                        adGroupId: String(targeting.adGroupId),
                        state: status,
                        context
                    });
                }
            }
        }

        const bulkTargetingOps = [];
        const bulkCampaignOps = [];
        const bulkAdGroupOps = [];

        const handleSuccessItem = async (item) => {
            const ctx = item.context;
            if (!ctx) return;
            const { targeting, oldValue, newValue, changed, status, keywordBid, isCampaign, isAdGroup, actionType, keywordBidUpdatedFrom, isDayparting, runPrefix } = ctx;

            await recordRuleExecutionChange({
                conditionSnapshot: targeting.conditionSnapshot,
                configId: rule.configId,
                profileId: rule.profileId,
                userId: rule.userId,
                ruleSchema: "TargetingRule",
                ruleId: rule._id,
                ruleDate: currentDate,
                ruleTime: currentTime,
                type: "SP",
                campaignId: targeting.campaignId,
                adGroupId: targeting?.adGroupId,
                targetId: targeting.targetId,
                name: targeting.campaignName,
                adGroupName: targeting?.adGroupName,
                targetName: targeting?.targeting,
                targetType: targeting?.matchType,
                oldValue,
                newValue,
                changed,
                metrics: {
                    impressions: targeting?.impressions,
                    clicks: targeting?.clicks,
                    spend: targeting?.spend,
                    sales: targeting?.sales,
                    orders: targeting?.orders,
                    acos: targeting?.acos,
                    roas: targeting?.roas,
                    cpc: targeting?.cpc,
                    ctr: targeting?.ctr,
                },
                notes: `SP Targeting rule executed: ${rule.ruleName}`,
            });

            if (actionType.actionName === "Enabled" || actionType.actionName === "Paused") {
                await checkIfTargetingLastOrNot(targeting, status, currentDate, rule?.configId, profile, checkConfigAds, "SP");
                await createStatusHistory(
                    targeting?.targetId,
                    status,
                    rule.configId,
                    profile?.profileId,
                    `${runPrefix || (isManual ? `Manual Run (${rule.ruleName})` : `Rule Run (${rule.ruleName})`)}: Update Targeting Status`,
                    rule.userId,
                    "SP",
                    isDayparting ? "DAYPARTING" : "RULE"
                );
                bulkTargetingOps.push({
                    updateMany: {
                        filter: { targetId: targeting?.targetId },
                        update: { $set: { status: status } }
                    }
                });
            }
            if (actionType.actionName === "Increase" || actionType.actionName === "Decrease" || actionType.actionName == "SetBid") {
                await createBidHistory(
                    targeting?.targetId,
                    keywordBid,
                    rule.configId,
                    profile?.profileId,
                    keywordBidUpdatedFrom,
                    rule.userId,
                    "SP",
                    isDayparting ? "DAYPARTING" : "RULE"
                );
                const rawTId = String(targeting?.targetId || "").replace(/^[TK]-/, "");
                const allTIds = [targeting?.targetId, rawTId, `T-${rawTId}`, `K-${rawTId}`];
                if (!isNaN(Number(rawTId))) allTIds.push(Number(rawTId));
                bulkTargetingOps.push({
                    updateMany: {
                        filter: { targetId: { $in: Array.from(new Set(allTIds)) } },
                        update: { $set: { keywordBid: Number(keywordBid) } }
                    }
                });
            }
            if (isCampaign) {
                await createCampaignHistory(
                    targeting.campaignId,
                    isDayparting ? `${runPrefix}: Update Campaign Status` : "Update Campaign Status",
                    oldValue,
                    newValue,
                    rule.configId,
                    rule.profileId,
                    rule.userId,
                    "SP",
                    isDayparting ? "DAYPARTING" : "RULE"
                );
                bulkCampaignOps.push({
                    updateOne: {
                        filter: {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            campaignId: targeting.campaignId,
                            reportDate: currentDate
                        },
                        update: { $set: { status: status } },
                        upsert: true
                    }
                });
            }
            if (isAdGroup) {
                await checkIfAdGroupLastOrNot(targeting, status, currentDate, rule?.configId, profile, checkConfigAds, "SP");
                await createAdGroupHistory(
                    targeting.campaignId,
                    targeting.adGroupId,
                    isDayparting ? `${runPrefix}: Update AdGroup Status` : "Update AdGroup Status",
                    oldValue,
                    newValue,
                    rule.configId,
                    rule.profileId,
                    rule.userId,
                    "SP",
                    isDayparting ? "DAYPARTING" : "RULE"
                );
                bulkAdGroupOps.push({
                    updateOne: {
                        filter: {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            campaignId: targeting.campaignId,
                            adGroupId: targeting.adGroupId,
                            reportDate: currentDate
                        },
                        update: { $set: { status: status } },
                        upsert: true
                    }
                });
            } else if (!isCampaign) {
                bulkTargetingOps.push({
                    updateOne: {
                        filter: {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            targeting: targeting.targeting,
                            targetId: targeting.targetId,
                            reportDate: currentDate
                        },
                        update: { $set: { status: status, keywordBid: keywordBid } },
                        upsert: true
                    }
                });
            }
        };

        if (stagedSPTargets.length > 0) {
            const { successfulItems } = await processBatchUpdates({
                updates: stagedSPTargets,
                entityType: "SP_TARGETS",
                profile,
                checkConfigAds,
                configId: rule.configId
            });
            for (const item of successfulItems) {
                await handleSuccessItem(item);
            }
        }
        if (stagedSPKeywords.length > 0) {
            const { successfulItems } = await processBatchUpdates({
                updates: stagedSPKeywords,
                entityType: "SP_KEYWORDS",
                profile,
                checkConfigAds,
                configId: rule.configId
            });
            for (const item of successfulItems) {
                await handleSuccessItem(item);
            }
        }
        if (stagedSPCampaigns.length > 0) {
            const { successfulItems } = await processBatchUpdates({
                updates: stagedSPCampaigns,
                entityType: "SP_CAMPAIGNS",
                profile,
                checkConfigAds,
                configId: rule.configId
            });
            for (const item of successfulItems) {
                await handleSuccessItem(item);
            }
        }
        if (stagedSPAdGroups.length > 0) {
            const { successfulItems } = await processBatchUpdates({
                updates: stagedSPAdGroups,
                entityType: "SP_ADGROUPS",
                profile,
                checkConfigAds,
                configId: rule.configId
            });
            for (const item of successfulItems) {
                await handleSuccessItem(item);
            }
        }

        if (bulkTargetingOps.length > 0) {
            await targetingSchema.bulkWrite(bulkTargetingOps);
        }
        if (bulkCampaignOps.length > 0) {
            await campaignSchema.bulkWrite(bulkCampaignOps);
        }
        if (bulkAdGroupOps.length > 0) {
            await adGroupsSchema.bulkWrite(bulkAdGroupOps);
        }


    }

    return true;

}

const runSponsoredBrandRule = async (rule, checkConfigAds, profile, currentDate, currentTime, data, isManual = false) => {
    let targetingList = []
    if (Array.isArray(data)) {
        if (!data?.length) return true
        targetingList = data
    } else {
        targetingList = await getTypeBasedRuleData(rule, "SB", sbTargetingSchema, true)
    }

    await updateSnapshotHistory(rule, targetingRuleHistorySchema, currentDate, currentTime);

    const campaignIds = targetingList.map(t => t.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
    const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate, "SB");

    const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
    const eligibleTargeting = targetingList.filter(c => !lowStockIds.has(c.campaignId) && ["ENABLED", "enabled"].includes(c.status));

    if (lowStockCampaigns.length > 0) {
        const lowProduct = lowStockCampaigns?.map(item => ({
            updateOne: {
                filter: {
                    configId: rule.configId,
                    profileId: rule.profileId,
                    ruleId: rule?._id,
                    ruleDate: currentDate,
                    campaignId: item.campaignId
                },
                update: {
                    $set: {
                        type: "SB",
                        totalProduct: item?.totalProducts,
                        inStockProduct: item?.totalInStockProducts,
                        availabilityRatio: item?.availabilityRatio
                    }
                },
                upsert: true
            }
        }))

        await campaignProductEligibleStatusByRuleSchema.bulkWrite(lowProduct);
    }

    if (eligibleTargeting.length > 0) {
        const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "targetingRuleSetting");

        const runSchedule = await Promise.all(
            eligibleTargeting.map(async (targeting) => {
                cron_logs({
                    message: `Rule ID: ${rule?._id}, Rule Name: ${rule?.ruleName}, SB-Targeting: ${JSON.stringify(targeting)}`,
                    log_type: "info",
                });

                const affectedCampaign = await affectedCampaignByRuleSchema.findOne({
                    configId: rule.configId,
                    profileId: rule.profileId,
                    userId: rule.userId,
                    ruleSchema: "TargetingRule",
                    ruleId: rule._id,
                    ruleDate: currentDate,
                    type: "SB",
                    campaignId: targeting.campaignId,
                    targetId: targeting.targetId
                }).lean();

                if (!affectedCampaign || rule.allowMultiTimeChanges || 1 == 1) {

                    const actionType = rule.actionType;
                    const isCampaign = ["CampaignEnabled", "CampaignPaused"].includes(actionType.actionName);
                    const isAdGroup = ["AdGroupEnabled", "AdGroupPaused"].includes(actionType.actionName);

                    const oldStatus = isCampaign ? targeting?.campaignStatus : isAdGroup ? targeting?.adGroupStatus : targeting.status;
                    let status = isCampaign ? targeting?.campaignStatus : isAdGroup ? targeting?.adGroupStatus : targeting.status;
                    let keywordBid = targeting.keywordBid;
                    const isDayparting = Boolean(rule.isHourlyBid || rule.hourlyConfig?.slots?.length);
                    const runPrefix = isDayparting
                        ? (isManual ? `Manual Dayparting Run (${rule.ruleName})` : `Dayparting Rule Run (${rule.ruleName})`)
                        : (isManual ? `Manual Run (${rule.ruleName})` : `Rule Run (${rule.ruleName})`);
                    let keywordBidUpdatedFrom = `${runPrefix}: Targeting bid adjusted`;
                    let changed;

                    if (true) {
                        let options;
                        if (targeting?.targetId?.startsWith("T-")) {
                            options = {
                                method: "PUT",
                                url: `${profile.amazonUrl}/sb/targets`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                },
                                meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                            };
                        }
                        else if (targeting?.targetId?.startsWith("K-")) {
                            options = {
                                method: "PUT",
                                url: `${profile.amazonUrl}/sb/keywords`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                },
                                meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                            };
                        }

                        if (["Enabled", "Paused"].includes(actionType.actionName)) {
                            status = actionType.actionName.toUpperCase();
                            if (status) {
                                if (targeting?.targetId?.startsWith("T-")) {
                                    options.data = {
                                        targets: [
                                            {
                                                targetId: parseInt(targeting.targetId.replace("T-", "")),
                                                adGroupId: targeting?.adGroupId,
                                                campaignId: targeting?.campaignId,
                                                state: `${status}`.toLowerCase(),
                                            },
                                        ]
                                    };
                                }
                                else if (targeting?.targetId?.startsWith("K-")) {
                                    options.data = [
                                        {
                                            keywordId: parseInt(targeting.targetId.replace("K-", "")),
                                            adGroupId: targeting?.adGroupId,
                                            campaignId: targeting?.campaignId,
                                            state: `${status}`.toLowerCase(),
                                        },
                                    ];
                                }
                                changed = "state";
                            }
                        }
                        if (["Increase", "Decrease", "SetBid"].includes(actionType.actionName)) {
                            let actionValue = actionType.actionValue;
                            if (actionType.actionValueType == "Percentage") {
                                actionValue = (targeting.keywordBid * actionValue) / 100;
                            }
                            if (actionType.actionName === "Increase") {
                                actionValue =
                                    parseFloat(targeting.keywordBid) + parseFloat(actionValue);
                            }
                            if (actionType.actionName === "Decrease") {
                                actionValue =
                                    parseFloat(targeting.keywordBid) - parseFloat(actionValue);
                            }
                            if (actionType.actionName == "SetBid") {
                                actionValue = parseFloat(actionValue);
                            }

                            if (bidThreshold?.maxBid && actionValue > bidThreshold?.maxBid) {
                                actionValue = bidThreshold?.maxBid;
                            }

                            if (bidThreshold?.minBid && actionValue < bidThreshold?.minBid) {
                                actionValue = bidThreshold?.minBid;
                            }

                            if (actionValue) {
                                keywordBid = actionValue;

                                const marketMin = getMarketplaceMinBid(profile?.currencyCode, profile?.countryCode);
                                const maxCap = (targeting?.bidThreshold?.maxBid && Number(targeting.bidThreshold.maxBid) > 0) ? Number(targeting.bidThreshold.maxBid) : 50;
                                const minCap = Math.max(marketMin, (targeting?.bidThreshold?.minBid && Number(targeting.bidThreshold.minBid) > 0) ? Number(targeting.bidThreshold.minBid) : marketMin);
                                const originalAttemptedBid = keywordBid;
                                if (keywordBid > maxCap) {
                                    keywordBid = maxCap;
                                    keywordBidUpdatedFrom = `${runPrefix}: Targeting bid adjusted and capped at maximum bid`;
                                }

                                if (keywordBid < minCap) {
                                    keywordBid = minCap;
                                    keywordBidUpdatedFrom = `${runPrefix}: Targeting bid adjusted and raised to minimum bid`;
                                    await sendMinBidClampedNotification({
                                        profile,
                                        rule,
                                        targeting,
                                        calculatedBid: originalAttemptedBid,
                                        clampedBid: keywordBid,
                                        marketMin,
                                        adType: "SB",
                                    });
                                }

                                if (targeting?.targetId?.startsWith("T-")) {
                                    options.data = {
                                        targets: [
                                            {
                                                targetId: parseInt(targeting.targetId.replace("T-", "")),
                                                adGroupId: targeting?.adGroupId,
                                                campaignId: targeting?.campaignId,
                                                bid: Number(keywordBid),
                                            },
                                        ]
                                    };
                                }
                                else if (targeting?.targetId?.startsWith("K-")) {
                                    options.data = [
                                        {
                                            keywordId: parseInt(targeting.targetId.replace("K-", "")),
                                            adGroupId: targeting?.adGroupId,
                                            campaignId: targeting?.campaignId,
                                            bid: Number(keywordBid),
                                        },
                                    ];
                                }
                                changed = "bid"
                            }
                        }

                        if (isCampaign) {
                            status = `${actionType.actionName}`.replace("Campaign", "").toUpperCase();
                            options = {
                                method: "PUT",
                                url: `${profile.amazonUrl}/sb/v4/campaigns`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Prefer": "return=representation",
                                    "Accept": "application/vnd.sbcampaignresource.v4+json",
                                    "Content-Type": "application/vnd.sbcampaignresource.v4+json",
                                },
                                data: { campaigns: [{ campaignId: String(targeting.campaignId), state: status }] },
                                meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                            };
                            changed = "campaignState";
                        }
                        if (isAdGroup) {
                            status = `${actionType.actionName}`.replace("AdGroup", "").toUpperCase();
                            options = {
                                method: "PUT",
                                url: `${profile.amazonUrl}/sb/v4/adGroups`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Prefer": "return=representation",
                                    "Accept": "application/vnd.sbadgroupresource.v4+json",
                                    "Content-Type": "application/vnd.sbadgroupresource.v4+json",
                                },
                                data: { adGroups: [{ adGroupId: String(targeting.adGroupId), state: status }] },
                                meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                            };
                            changed = "adGroupState";
                        }

                        if (options?.data) {
                            try {
                                const response = await retryWithBackoff(() => amazonAxios(options));

                                cron_logs({
                                    message: `runSponsoredBrandRule -> Targeting Response: ${JSON.stringify(response.data)}`,
                                    log_type: "info",
                                });

                                if (response.status == 207) {

                                    const isStatusChange = ["Enabled", "Paused", "CampaignEnabled", "CampaignPaused", "AdGroupEnabled", "AdGroupPaused"].includes(actionType.actionName);
                                    const oldValue = isStatusChange ? oldStatus : targeting.keywordBid;
                                    const newValue = isStatusChange ? status : Number(keywordBid);

                                    await recordRuleExecutionChange({
                                        conditionSnapshot: targeting.conditionSnapshot,
                                        configId: rule.configId,
                                        profileId: rule.profileId,
                                        userId: rule.userId,
                                        ruleSchema: "TargetingRule",
                                        ruleId: rule._id,
                                        ruleDate: currentDate,
                                        ruleTime: currentTime,
                                        type: "SB",
                                        campaignId: targeting.campaignId,
                                        adGroupId: targeting?.adGroupId,
                                        targetId: targeting.targetId,
                                        name: targeting.campaignName,
                                        adGroupName: targeting?.adGroupName,
                                        targetName: targeting?.targeting,
                                        targetType: targeting?.matchType,
                                        oldValue: oldValue,
                                        newValue: newValue,
                                        changed,
                                        metrics: {
                                            impressions: targeting?.impressions,
                                            clicks: targeting?.clicks,
                                            spend: targeting?.spend,
                                            sales: targeting?.sales,
                                            orders: targeting?.orders,
                                            acos: targeting?.acos,
                                            roas: targeting?.roas,
                                            cpc: targeting?.cpc,
                                            ctr: targeting?.ctr,
                                        },
                                        notes: `SB Targeting rule executed: ${rule.ruleName}`,
                                    });

                                    if (actionType.actionName === "Enabled" || actionType.actionName === "Paused") {
                                        await createStatusHistory(
                                            targeting?.targetId,
                                            status,
                                            rule.configId,
                                            profile?.profileId,
                                            `${runPrefix}: Update Targeting Status`,
                                            rule.userId,
                                            "SB",
                                            isDayparting ? "DAYPARTING" : "RULE"
                                        );
                                        await sbTargetingSchema.updateMany(
                                            { targetId: targeting?.targetId },
                                            { $set: { status: status } }
                                        );
                                    }
                                    if (actionType.actionName === "Increase" || actionType.actionName === "Decrease" || actionType.actionName == "SetBid") {
                                        await createBidHistory(
                                            targeting?.targetId,
                                            keywordBid,
                                            rule.configId,
                                            profile?.profileId,
                                            keywordBidUpdatedFrom,
                                            rule.userId,
                                            "SB",
                                            isDayparting ? "DAYPARTING" : "RULE"
                                        );
                                        await sbTargetingSchema.updateMany(
                                            { targetId: targeting?.targetId },
                                            { $set: { keywordBid: Number(keywordBid) } }
                                        );
                                    }
                                    if (isCampaign) {
                                        await createCampaignHistory(
                                            targeting.campaignId,
                                            isDayparting ? `${runPrefix}: Update Campaign Status` : "Update Campaign Status",
                                            oldValue,
                                            newValue,
                                            rule.configId,
                                            rule.profileId,
                                            rule.userId,
                                            "SB",
                                            isDayparting ? "DAYPARTING" : "RULE"
                                        );
                                    }
                                    if (isAdGroup) {
                                        await createAdGroupHistory(
                                            targeting.campaignId,
                                            targeting.adGroupId,
                                            isDayparting ? `${runPrefix}: Update AdGroup Status` : "Update AdGroup Status",
                                            oldValue,
                                            newValue,
                                            rule.configId,
                                            rule.profileId,
                                            rule.userId,
                                            "SB",
                                            isDayparting ? "DAYPARTING" : "RULE"
                                        );
                                    }

                                    let result;
                                    if (isCampaign) {
                                        result = await sbCampaignSchema.findOneAndUpdate(
                                            {
                                                configId: rule.configId,
                                                profileId: rule.profileId,
                                                campaignId: targeting.campaignId,
                                                reportDate: currentDate
                                            },
                                            { $set: { status: status } },
                                            { new: true, upsert: true }
                                        ).lean();
                                    } else if (isAdGroup) {
                                        result = await sbAdGroupsSchema.findOneAndUpdate(
                                            {
                                                configId: rule.configId,
                                                profileId: rule.profileId,
                                                campaignId: targeting.campaignId,
                                                adGroupId: targeting.adGroupId,
                                                reportDate: currentDate
                                            },
                                            { $set: { status: status } },
                                            { new: true, upsert: true }
                                        ).lean();
                                    } else {
                                        result = await sbTargetingSchema.findOneAndUpdate(
                                            {
                                                configId: rule.configId,
                                                profileId: rule.profileId,
                                                targeting: targeting.targeting,
                                                targetId: targeting.targetId,
                                                reportDate: currentDate
                                            },
                                            { $set: { status: status, keywordBid: keywordBid } },
                                            { new: true, upsert: true }
                                        ).lean();
                                    }

                                    cron_logs({
                                        message: `runSponsoredBrandRule -> Targeting Updated: ${JSON.stringify(result)}`,
                                        log_type: "info",
                                    });

                                }
                                else {
                                    return false;
                                }
                            } catch (error) {
                                cron_logs({
                                    message: `runSponsoredBrandRule -> Error: ${error.message}`,
                                    log_type: "error",
                                });
                                return false;
                            }
                        }
                    }
                }
                return true;
            })
        );

        await Promise.all(runSchedule);

    }

    return true;

}

const runSponsoredDisplayRule = async (rule, checkConfigAds, profile, currentDate, currentTime, data, isManual = false) => {
    let targetingList = []
    if (Array.isArray(data)) {
        if (!data?.length) return true
        targetingList = data
    } else {
        targetingList = await getTypeBasedRuleData(rule, "SD", sdTargetingSchema, true)
    }

    await updateSnapshotHistory(rule, targetingRuleHistorySchema, currentDate, currentTime);

    const campaignIds = targetingList.map(t => t.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
    const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate, "SD");

    const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
    const eligibleTargeting = targetingList.filter(c => !lowStockIds.has(c.campaignId) && ["ENABLED", "enabled"].includes(c.status));

    if (lowStockCampaigns.length > 0) {
        const lowProduct = lowStockCampaigns?.map(item => ({
            updateOne: {
                filter: {
                    configId: rule.configId,
                    profileId: rule.profileId,
                    ruleId: rule?._id,
                    ruleDate: currentDate,
                    campaignId: item.campaignId
                },
                update: {
                    $set: {
                        type: "SD",
                        totalProduct: item?.totalProducts,
                        inStockProduct: item?.totalInStockProducts,
                        availabilityRatio: item?.availabilityRatio
                    }
                },
                upsert: true
            }
        }))

        await campaignProductEligibleStatusByRuleSchema.bulkWrite(lowProduct);
    }

    if (eligibleTargeting.length > 0) {
        const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "targetingRuleSetting");

        const runSchedule = await Promise.all(
            eligibleTargeting.map(async (targeting) => {
                cron_logs({
                    message: `Rule ID: ${rule?._id}, Rule Name: ${rule?.ruleName}, SD-Targeting: ${JSON.stringify(targeting)}`,
                    log_type: "info",
                });

                const affectedCampaign = await affectedCampaignByRuleSchema.findOne({
                    configId: rule.configId,
                    profileId: rule.profileId,
                    userId: rule.userId,
                    ruleSchema: "TargetingRule",
                    ruleId: rule._id,
                    ruleDate: currentDate,
                    type: "SD",
                    campaignId: targeting.campaignId,
                    targetId: targeting.targetId
                }).lean();

                if (!affectedCampaign || rule.allowMultiTimeChanges || 1 == 1) {

                    const actionType = rule.actionType;
                    const isCampaign = ["CampaignEnabled", "CampaignPaused"].includes(actionType.actionName);
                    const isAdGroup = ["AdGroupEnabled", "AdGroupPaused"].includes(actionType.actionName);

                    const oldStatus = isCampaign ? targeting?.campaignStatus : isAdGroup ? targeting?.adGroupStatus : targeting.status;
                    let status = isCampaign ? targeting?.campaignStatus : isAdGroup ? targeting?.adGroupStatus : targeting.status;
                    let keywordBid = targeting.keywordBid;
                    const isDayparting = Boolean(rule.isHourlyBid || rule.hourlyConfig?.slots?.length);
                    const runPrefix = isDayparting
                        ? (isManual ? `Manual Dayparting Run (${rule.ruleName})` : `Dayparting Rule Run (${rule.ruleName})`)
                        : (isManual ? `Manual Run (${rule.ruleName})` : `Rule Run (${rule.ruleName})`);
                    let keywordBidUpdatedFrom = `${runPrefix}: Targeting bid adjusted`;
                    let changed;

                    if (true) {
                        let options;
                        if (targeting?.targetId?.startsWith("T-")) {
                            options = {
                                method: "PUT",
                                url: `${profile.amazonUrl}/sd/targets`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                },
                                meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                            };
                        }

                        if (["Enabled", "Paused"].includes(actionType.actionName)) {
                            status = actionType.actionName.toUpperCase();
                            if (status) {
                                if (targeting?.targetId?.startsWith("T-")) {
                                    options.data = [
                                        {
                                            targetId: parseInt(targeting.targetId.replace("T-", "")),
                                            state: `${status}`.toLowerCase(),
                                        },
                                    ];
                                }
                            }
                            changed = "state";
                        }
                        if (["Increase", "Decrease", "SetBid"].includes(actionType.actionName)) {
                            let actionValue = actionType.actionValue;
                            if (actionType.actionValueType == "Percentage") {
                                actionValue = (targeting.keywordBid * actionValue) / 100;
                            }
                            if (actionType.actionName === "Increase") {
                                actionValue =
                                    parseFloat(targeting.keywordBid) + parseFloat(actionValue);
                            }
                            if (actionType.actionName === "Decrease") {
                                actionValue =
                                    parseFloat(targeting.keywordBid) - parseFloat(actionValue);
                            }
                            if (actionType.actionName == "SetBid") {
                                actionValue = parseFloat(actionValue);
                            }

                            if (bidThreshold?.maxBid && actionValue > bidThreshold?.maxBid) {
                                actionValue = bidThreshold?.maxBid;
                            }

                            if (bidThreshold?.minBid && actionValue < bidThreshold?.minBid) {
                                actionValue = bidThreshold?.minBid;
                            }

                            if (actionValue) {
                                keywordBid = actionValue;

                                const marketMin = getMarketplaceMinBid(profile?.currencyCode, profile?.countryCode);
                                const maxCap = (targeting?.bidThreshold?.maxBid && Number(targeting.bidThreshold.maxBid) > 0) ? Number(targeting.bidThreshold.maxBid) : 50;
                                const minCap = Math.max(marketMin, (targeting?.bidThreshold?.minBid && Number(targeting.bidThreshold.minBid) > 0) ? Number(targeting.bidThreshold.minBid) : marketMin);
                                const originalAttemptedBid = keywordBid;
                                if (keywordBid > maxCap) {
                                    keywordBid = maxCap;
                                    keywordBidUpdatedFrom = `${runPrefix}: Targeting bid adjusted and capped at maximum bid`;
                                }

                                if (keywordBid < minCap) {
                                    keywordBid = minCap;
                                    keywordBidUpdatedFrom = `${runPrefix}: Targeting bid adjusted and raised to minimum bid`;
                                    await sendMinBidClampedNotification({
                                        profile,
                                        rule,
                                        targeting,
                                        calculatedBid: originalAttemptedBid,
                                        clampedBid: keywordBid,
                                        marketMin,
                                        adType: "SD",
                                    });
                                }

                                if (targeting?.targetId?.startsWith("T-")) {
                                    options.data = [
                                        {
                                            targetId: parseInt(targeting.targetId.replace("T-", "")),
                                            bid: Number(keywordBid),
                                        },
                                    ];
                                }
                                changed = "bid"
                            }
                        }

                        if (isCampaign) {
                            status = `${actionType.actionName}`.replace("Campaign", "").toUpperCase();
                            options = {
                                method: "PUT",
                                url: `${profile.amazonUrl}/sd/campaigns`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                },
                                data: [{ campaignId: parseInt(targeting.campaignId), state: status.toLowerCase() }],
                                meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                            };
                            changed = "campaignState";
                        }

                        if (isAdGroup) {
                            status = `${actionType.actionName}`.replace("AdGroup", "").toUpperCase();
                            options = {
                                method: "PUT",
                                url: `${profile.amazonUrl}/sd/adGroups`,
                                headers: {
                                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                                    "Amazon-Advertising-API-Scope": profile.profileId,
                                    "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Content-Type": "application/json",
                                },
                                data: [{ adGroupId: parseInt(targeting.adGroupId), state: status.toLowerCase() }],
                                meta: { configId: rule.configId, tokenKey: "adsAccessToken" }
                            };
                            changed = "adGroupState";
                        }

                        if (options?.data) {
                            try {
                                const response = await retryWithBackoff(() => amazonAxios(options));

                                cron_logs({
                                    message: `runSponsoredDisplayRule -> Targeting Response: ${JSON.stringify(response.data)}`,
                                    log_type: "info",
                                });

                                if (response.status == 207) {

                                    const isStatusChange = ["Enabled", "Paused", "CampaignEnabled", "CampaignPaused", "AdGroupEnabled", "AdGroupPaused"].includes(actionType.actionName);
                                    const oldValue = isStatusChange ? oldStatus : targeting.keywordBid;
                                    const newValue = isStatusChange ? status : Number(keywordBid);

                                    await recordRuleExecutionChange({
                                        conditionSnapshot: targeting.conditionSnapshot,
                                        configId: rule.configId,
                                        profileId: rule.profileId,
                                        userId: rule.userId,
                                        ruleSchema: "TargetingRule",
                                        ruleId: rule._id,
                                        ruleDate: currentDate,
                                        ruleTime: currentTime,
                                        type: "SD",
                                        campaignId: targeting.campaignId,
                                        adGroupId: targeting?.adGroupId,
                                        targetId: targeting.targetId,
                                        name: targeting.campaignName,
                                        adGroupName: targeting?.adGroupName,
                                        targetName: targeting?.targeting,
                                        targetType: targeting?.matchType,
                                        oldValue: oldValue,
                                        newValue: newValue,
                                        changed,
                                        metrics: {
                                            impressions: targeting?.impressions,
                                            clicks: targeting?.clicks,
                                            spend: targeting?.spend,
                                            sales: targeting?.sales,
                                            orders: targeting?.orders,
                                            acos: targeting?.acos,
                                            roas: targeting?.roas,
                                            cpc: targeting?.cpc,
                                            ctr: targeting?.ctr,
                                        },
                                        notes: `SD Targeting rule executed: ${rule.ruleName}`,
                                    });

                                    if (actionType.actionName === "Enabled" || actionType.actionName === "Paused") {
                                        await createStatusHistory(
                                            targeting?.targetId,
                                            status,
                                            rule.configId,
                                            profile?.profileId,
                                            `${runPrefix}: Update Targeting Status`,
                                            rule.userId,
                                            "SD",
                                            isDayparting ? "DAYPARTING" : "RULE"
                                        );
                                        await sdTargetingSchema.updateMany(
                                            { targetId: targeting?.targetId },
                                            { $set: { status: status } }
                                        );
                                    }
                                    if (actionType.actionName === "Increase" || actionType.actionName === "Decrease" || actionType.actionName === "SetBid") {
                                        await createBidHistory(
                                            targeting?.targetId,
                                            keywordBid,
                                            rule.configId,
                                            profile?.profileId,
                                            keywordBidUpdatedFrom,
                                            rule.userId,
                                            "SD",
                                            isDayparting ? "DAYPARTING" : "RULE"
                                        );
                                        await sdTargetingSchema.updateMany(
                                            { targetId: targeting?.targetId },
                                            { $set: { keywordBid: Number(keywordBid) } }
                                        );
                                    }
                                    if (isCampaign) {
                                        await createCampaignHistory(
                                            targeting.campaignId,
                                            isDayparting ? `${runPrefix}: Update Campaign Status` : "Update Campaign Status",
                                            oldValue,
                                            newValue,
                                            rule.configId,
                                            rule.profileId,
                                            rule.userId,
                                            "SD",
                                            isDayparting ? "DAYPARTING" : "RULE"
                                        );
                                    }
                                    if (isAdGroup) {
                                        await createAdGroupHistory(
                                            targeting.campaignId,
                                            targeting.adGroupId,
                                            isDayparting ? `${runPrefix}: Update AdGroup Status` : "Update AdGroup Status",
                                            oldValue,
                                            newValue,
                                            rule.configId,
                                            rule.profileId,
                                            rule.userId,
                                            "SD",
                                            isDayparting ? "DAYPARTING" : "RULE"
                                        );
                                    }

                                    let result;
                                    if (isCampaign) {
                                        result = await sdCampaignSchema.findOneAndUpdate(
                                            {
                                                configId: rule.configId,
                                                profileId: rule.profileId,
                                                campaignId: targeting.campaignId,
                                                reportDate: currentDate
                                            },
                                            { $set: { status: status } },
                                            { new: true, upsert: true }
                                        ).lean();
                                    } else if (isAdGroup) {
                                        result = await sdAdGroupsSchema.findOneAndUpdate(
                                            {
                                                configId: rule.configId,
                                                profileId: rule.profileId,
                                                campaignId: targeting.campaignId,
                                                adGroupId: targeting.adGroupId,
                                                reportDate: currentDate
                                            },
                                            { $set: { status: status } },
                                            { new: true, upsert: true }
                                        ).lean();
                                    } else {
                                        result = await sdTargetingSchema.findOneAndUpdate(
                                            {
                                                configId: rule.configId,
                                                profileId: rule.profileId,
                                                targetId: targeting.targetId,
                                                reportDate: currentDate
                                            },
                                            { $set: { status: status, keywordBid: keywordBid } },
                                            { new: true, upsert: true }
                                        ).lean();
                                    }

                                    cron_logs({
                                        message: `runSponsoredDisplayRule -> Targeting Updated: ${JSON.stringify(result)}`,
                                        log_type: "info",
                                    });

                                }
                                else {
                                    return false;
                                }
                            } catch (error) {
                                cron_logs({
                                    message: `runSponsoredDisplayRule -> Error: ${error.message}`,
                                    log_type: "error",
                                });
                                return false;
                            }
                        }
                    }
                }
                return true;
            })
        );

        await Promise.all(runSchedule);

    }

    return true;

}

exports.executeTargetingRulesForProfile = async (profile, scheduledFor = new Date()) => {
    if (global.updateTaskProgress) global.updateTaskProgress("TargetingRuleSchedules");
    const isQueue = process.env.AUTOMATION_EXECUTION_MODE === "queue";
    const now = moment(scheduledFor).tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");
    const currentDay = now.format("dddd");

    const rules = await targetingRuleSchema.find({
        configId: profile.configId,
        profileId: profile.profileId,
        $or: [
            { times: { $exists: true, $ne: [] } },
            { isHourlyBid: true }
        ],
        isActive: true,
        ...(!isQueue && { isRunning: false })
    }).lean();

    const todayHistory = await ruleRunHistorySchema.find({
        configId: profile.configId,
        profileId: profile.profileId,
        ruleDate: currentDate,
        ruleSchema: "TargetingRule",
        isRun: true
    }).lean();

    const executedMap = new Map();
    todayHistory.forEach(h => {
        executedMap.set(
            `${h.ruleId.toString()}_${h.ruleTime}`,
            true
        );
    });

    const finalRulesToRun = [];
    for (const rule of rules) {
        if (rule.ruleType === "T" && !moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]")) {
            continue;
        }

        if (rule.isHourlyBid) {
            const frequency = rule.hourlyConfig?.frequency || "DAILY";
            const isWeekend = ["Saturday", "Sunday"].includes(currentDay);
            if (frequency === "WEEKDAY" && isWeekend) continue;
            if (frequency === "WEEKEND" && !isWeekend) continue;
            if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) continue;

            const nowHour = now.hour();
            const activeSlot = getActiveSlot(rule.hourlyConfig?.slots || [], nowHour);

            if (activeSlot && activeSlot.enabled) {
                const historyKey = `${rule._id.toString()}_${activeSlot.startTime}`;
                const alreadyExecuted = executedMap.has(historyKey);

                if (!alreadyExecuted) {
                    const hourlyRule = { ...rule };
                    const isTargetState = ["Enabled", "Paused"].includes(rule.actionType?.actionName);
                    const isCampaignState = ["CampaignEnabled", "CampaignPaused"].includes(rule.actionType?.actionName);
                    const isAdGroupState = ["AdGroupEnabled", "AdGroupPaused"].includes(rule.actionType?.actionName);

                    if (isTargetState || isCampaignState || isAdGroupState) {
                        const isSlotEnabled = activeSlot.state === "ENABLED" || (activeSlot.state === undefined && activeSlot.enabled !== false);
                        if (isTargetState) {
                            hourlyRule.actionType = { ...rule.actionType, actionName: isSlotEnabled ? "Enabled" : "Paused", actionValue: "", actionValueType: "" };
                        } else if (isCampaignState) {
                            hourlyRule.actionType = { ...rule.actionType, actionName: isSlotEnabled ? "CampaignEnabled" : "CampaignPaused", actionValue: "", actionValueType: "" };
                        } else if (isAdGroupState) {
                            hourlyRule.actionType = { ...rule.actionType, actionName: isSlotEnabled ? "AdGroupEnabled" : "AdGroupPaused", actionValue: "", actionValueType: "" };
                        }
                    } else if (rule.actionType?.actionValueType === "Number") {
                        const numVal = Number(activeSlot.value !== undefined && activeSlot.value !== null && activeSlot.value !== "" ? activeSlot.value : activeSlot.bidPercentage);
                        hourlyRule.actionType = { ...rule.actionType, actionValue: !isNaN(numVal) ? numVal : 0, actionValueType: "Number" };
                    } else {
                        const numVal = Number(activeSlot.bidPercentage !== undefined && activeSlot.bidPercentage !== null && activeSlot.bidPercentage !== "" ? activeSlot.bidPercentage : activeSlot.value);
                        hourlyRule.actionType = { ...rule.actionType, actionValue: !isNaN(numVal) ? numVal : 0, actionValueType: "Percentage" };
                    }

                    finalRulesToRun.push({
                        rule: hourlyRule,
                        scheduledTime: activeSlot.startTime
                    });

                    if (!isQueue) {
                        await targetingRuleSchema.findByIdAndUpdate(
                            { _id: rule._id },
                            { isRunning: true, lastStartedAt: new Date() },
                            { new: true, upsert: true }
                        );
                    }
                }
            }
        } else {
            if (!rule.days.includes(currentDay)) {
                const isLast7Days = rule?.days?.includes("Every 7 Days") ? 7 : 0;
                const isLast10Days = rule?.days?.includes("Every 10 Days") ? 10 : 0;
                const isLast15Days = rule?.days?.includes("Every 15 Days") ? 15 : 0;
                const isLast30Days = rule?.days?.includes("Every 30 Days") ? 30 : 0;

                if (!isLast7Days && !isLast10Days && !isLast15Days && !isLast30Days) continue;

                const lastRun = await targetingRuleHistorySchema.findOne({ configId: rule?.configId, profileId: rule?.profileId, ruleId: rule?._id }).lean().sort({ ruleDate: -1 });
                const diffDays = moment(currentDate).diff(moment(lastRun?.ruleDate), "days");

                if (lastRun && !((isLast7Days && diffDays >= isLast7Days) || (isLast10Days && diffDays >= isLast10Days) || (isLast15Days && diffDays >= isLast15Days) || (isLast30Days && diffDays >= isLast30Days))) continue;
            }

            for (const time of (rule.times || [])) {
                const ruleDateTime = moment.tz(
                    `${currentDate} ${time}`,
                    "YYYY-MM-DD HH:mm",
                    rule.timezone
                );

                const isPastOrNow = ruleDateTime.isSameOrBefore(now);
                const historyKey = `${rule._id.toString()}_${time}`;
                const alreadyExecuted = executedMap.has(historyKey);

                if (isPastOrNow && !alreadyExecuted) {
                    finalRulesToRun.push({
                        rule,
                        scheduledTime: time
                    });

                    if (!isQueue) {
                        await targetingRuleSchema.findByIdAndUpdate(
                            { _id: rule._id },
                            { isRunning: true, lastStartedAt: new Date() },
                            { new: true, upsert: true }
                        );
                    }
                }
            }
        }
    }

    cron_logs({
        message: `executeTargetingRulesForProfile, Total Active Rules: ${finalRulesToRun.length} for profile ${profile.name}`,
        log_type: "info",
    });

    let executedCount = 0;
    if (finalRulesToRun.length > 0) {
        await Promise.all(
            finalRulesToRun.map((finalRule) =>
                ruleLimit(async () => {
                    try {
                        if (global.updateTaskProgress) global.updateTaskProgress("TargetingRuleSchedules");
                        const rule = finalRule.rule;
                        if (rule.ruleType != "T" || (rule.ruleType == "T" && moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]"))) {

                            const configId = rule.configId;
                            const checkConfigAds = await getAccessToken(configId);
                            if (
                                checkConfigAds &&
                                checkConfigAds.adsAccessToken
                            ) {

                                const spStatus = await runSponsoredProductRule(rule, checkConfigAds, profile, currentDate, finalRule?.scheduledTime);
                                const sbStatus = await runSponsoredBrandRule(rule, checkConfigAds, profile, currentDate, finalRule?.scheduledTime);
                                const sdStatus = await runSponsoredDisplayRule(rule, checkConfigAds, profile, currentDate, finalRule?.scheduledTime);

                                if (!spStatus || !sbStatus || !sdStatus) {
                                    throw new Error(`ProfileId: ${profile.name} -> rule: ${rule.ruleName}, Something went wrong while running this rule`);
                                }

                                await ruleRunHistorySchema.findOneAndUpdate(
                                    {
                                        configId: profile.configId,
                                        profileId: profile.profileId,
                                        ruleId: rule._id,
                                        ruleSchema: "TargetingRule",
                                        ruleDate: currentDate,
                                        ruleTime: finalRule.scheduledTime
                                    },
                                    {
                                        $set: { isRun: true }
                                    },
                                    { new: true, upsert: true }
                                ).lean();

                                executedCount++;

                                cron_logs({
                                    message: `ProfileId: ${profile.name} -> rule: ${rule.ruleName}, rule run successfully`,
                                    log_type: "info",
                                });

                            }
                            else {
                                cron_logs({
                                    message: `Account disconnected for Profile: ${profile.name}`,
                                    log_type: "info",
                                });
                            }

                        }
                        return;
                    } catch (err) {
                        cron_logs({
                            message: `Error in TargetingRule: ${err.message}`,
                            log_type: "error",
                        });
                        throw err;
                    } finally {
                        if (!isQueue) {
                            await targetingRuleSchema.findByIdAndUpdate(
                                { _id: finalRule.rule._id },
                                { isRunning: false },
                                { new: true, upsert: true }
                            );
                        }
                    }
                })
            )
        );
    }

    await cronJobHistorySchema.findOneAndUpdate(
        {
            configId: profile.configId,
            profileId: profile.profileId,
            cronName: "Targeting Rule Schedules",
            historyDate: currentDate,
        },
        {
            $set: { status: "COMPLETED", }
        },
        { new: true, upsert: true }
    ).lean();

    return {
        success: true,
        totalRulesEvaluated: rules.length,
        finalRulesToRunCount: finalRulesToRun.length,
        executedCount,
    };
};

exports.CronTargetingRule = async (req, res) => {
    cron_logs({
        message: `CronTargetingRule`,
        log_type: "info",
    });
    try {
        const profiles = await getActivePlanProfiles();
        if (!profiles?.length) return;

        await Promise.all(
            profiles.map((profile) =>
                profileLimit(async () => {
                    try {
                        await exports.executeTargetingRulesForProfile(profile);
                    } catch (err) {
                        cron_logs({
                            message: `Error executing targeting rules for profile ${profile.name}: ${err.message}`,
                            log_type: "error",
                        });
                    }
                })
            )
        );

        return cron_logs({
            message: `Targeting rule run successfully`,
            log_type: "info",
        });

    } catch (error) {
        return cron_logs({
            message: `Something went wrong, please try again! Error: ${error}`,
            log_type: "error",
        });
    }
}

// ── Revert Helper Utilities ────────────────────────────────────────────────
const sanitizeRevertBid = (rawBid, profile) => {
    let parsed = parseFloat(rawBid);
    const marketMin = getMarketplaceMinBid(profile?.currencyCode, profile?.countryCode) || 1.0;
    if (isNaN(parsed) || parsed <= 0) {
        parsed = marketMin;
    }
    const rounded = parseFloat(parsed.toFixed(2));
    return Math.max(marketMin, rounded);
};

const extractAmazonErrorMessage = (errItem) => {
    if (!errItem) return "";
    if (typeof errItem === "string") return errItem;
    if (errItem.description) return errItem.description;
    if (errItem.message) return errItem.message;
    if (errItem.code && errItem.code !== "ERROR") return errItem.code;
    if (Array.isArray(errItem.errors) && errItem.errors.length > 0) {
        const msgs = errItem.errors.map(e => {
            const val = e?.errorValue;
            if (val && typeof val === "object") {
                for (const k of Object.keys(val)) {
                    if (val[k]?.message) return val[k].message;
                    if (val[k]?.reason) return val[k].reason;
                }
            }
            return e?.message || e?.reason || e?.errorType || JSON.stringify(e);
        });
        return msgs.join("; ");
    }
    return JSON.stringify(errItem);
};

exports.ruleReverted = async (req, res) => {
    const { data: revertList, ruleId } = req.body;

    if (!Array.isArray(revertList) || !revertList.length || !ruleId) {
        return res.status(203).send({
            message: "No records to revert!",
            isSuccess: false,
        });
    }

    const rule = await targetingRuleSchema.findOne({ _id: ruleId }).lean();
    if (!rule) return res.status(203).send({ isSuccess: false, message: "Rule not found" });

    const checkConfigAds = await getAccessToken(rule?.configId);
    if (!checkConfigAds?.adsAccessToken) return res.status(203).send({ isSuccess: false, message: "Access token unavailable" });

    const profile = await getProfile(rule?.configId, rule?.profileId);
    if (!profile) return res.status(203).send({ isSuccess: false, message: "Profile not found" });

    try {
        const CHUNK_SIZE = 50;
        const succeeded = [];
        const failed = [];

        // Process in chunks of 50 records to prevent Amazon API rate-limiting and 504 timeouts
        for (let i = 0; i < revertList.length; i += CHUNK_SIZE) {
            const chunk = revertList.slice(i, i + CHUNK_SIZE);

            const SPList = chunk.filter(it => it?.type === "SP");
            const SBList = chunk.filter(it => it?.type === "SB");
            const SDList = chunk.filter(it => it?.type === "SD");

            const [spResult, sbResult, sdResult] = await Promise.all([
                revertedSPRuleEffect(SPList, rule, checkConfigAds, profile),
                revertedSBRuleEffect(SBList, rule, checkConfigAds, profile),
                revertedSDRuleEffect(SDList, rule, checkConfigAds, profile),
            ]);

            succeeded.push(
                ...(spResult?.succeeded ?? []),
                ...(sbResult?.succeeded ?? []),
                ...(sdResult?.succeeded ?? [])
            );
            failed.push(
                ...(spResult?.failed ?? []),
                ...(sbResult?.failed ?? []),
                ...(sdResult?.failed ?? [])
            );
        }

        return res.status(200).send({
            isSuccess: true,
            message: `${succeeded.length} record(s) reverted successfully${failed.length ? `, ${failed.length} failed` : ""}.`,
            reverted: succeeded.map(r => r._id),
            failed: failed.map(r => ({ _id: r._id, reason: r.reason })),
        });

    } catch (error) {
        write_logs({ message: `[ruleReverted Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            error: "An internal server error occurred",
            message: "Something went wrong, please try again!",
            isSuccess: false,
        });
    }
};

const revertedSPRuleEffect = async (SPList, rule, checkConfigAds, profile) => {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");

    const succeeded = [];
    const failed = [];

    if (!SPList?.length) return { succeeded, failed };

    try {
        const targetList = SPList.filter(item => String(item.targetId).startsWith("T-") && !["campaignState", "adGroupState"].includes(item.changed));
        const keywordList = SPList.filter(item => String(item.targetId).startsWith("K-") && !["campaignState", "adGroupState"].includes(item.changed));
        const campaignStateList = SPList.filter(item => item.changed === "campaignState");
        const adGroupStateList = SPList.filter(item => item.changed === "adGroupState");

        // ── Build API payloads ───────────────────────────────────────────────
        const buildTargetPayload = (item) => ({
            targetId: String(item.targetId).replace("T-", ""),
            ...(item.changed === "bid"
                ? { bid: sanitizeRevertBid(item.oldValue, profile) }
                : { state: String(item.oldValue) })
        });

        const buildKeywordPayload = (item) => ({
            keywordId: String(item.targetId).replace("K-", ""),
            ...(item.changed === "bid"
                ? { bid: sanitizeRevertBid(item.oldValue, profile) }
                : { state: String(item.oldValue) })
        });

        const targetingOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sp/targets`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.sptargetingClause.v3+json",
                "Accept": "application/vnd.sptargetingClause.v3+json",
            },
            data: { targetingClauses: targetList.map(buildTargetPayload) },
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        const keywordOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sp/keywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spKeyword.v3+json",
                "Accept": "application/vnd.spKeyword.v3+json",
            },
            data: { keywords: keywordList.map(buildKeywordPayload) },
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        const campaignStateOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sp/campaigns`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Prefer": "return=representation",
                "Accept": "application/vnd.spCampaign.v3+json",
                "Content-Type": "application/vnd.spCampaign.v3+json",
            },
            data: { campaigns: campaignStateList.map(item => ({ campaignId: String(item.campaignId), state: String(item.oldValue) })) },
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        const adGroupStateOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sp/adGroups`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Prefer": "return=representation",
                "Accept": "application/vnd.spAdGroup.v3+json",
                "Content-Type": "application/vnd.spAdGroup.v3+json",
            },
            data: { adGroups: adGroupStateList.map(item => ({ adGroupId: String(item.adGroupId), state: String(item.oldValue) })) },
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        // ── Fire requests in parallel ────────────────────────────────────────
        const [targetResponse, keywordResponse, campaignStateResponse, adGroupStateResponse] = await Promise.all([
            targetList?.length ? retryWithBackoff(() => amazonAxios(targetingOption)) : null,
            keywordList?.length ? retryWithBackoff(() => amazonAxios(keywordOption)) : null,
            campaignStateList?.length ? retryWithBackoff(() => amazonAxios(campaignStateOption)) : null,
            adGroupStateList?.length ? retryWithBackoff(() => amazonAxios(adGroupStateOption)) : null,
        ]);

        write_logs({
            message: `revertedSPTargetingRuleEffect -> Target Response: ${JSON.stringify(targetResponse?.data)}, Keyword Response: ${JSON.stringify(keywordResponse?.data)}, Campaign State Response: ${JSON.stringify(campaignStateResponse?.data)}, AdGroup State Response: ${JSON.stringify(adGroupStateResponse?.data)}`,
            log_type: "info",
        });

        // ── Process target results ───────────────────────────────────────────
        if (targetResponse?.status === 207) {
            const successIds = new Set((targetResponse.data?.targetingClauses?.success || []).map(c => String(c.targetId)));
            const errorEntries = targetResponse.data?.targetingClauses?.error || [];
            const errorByIndex = new Map();
            const errorById = new Map();
            errorEntries.forEach(err => {
                const reason = extractAmazonErrorMessage(err);
                if (err.index !== undefined) errorByIndex.set(err.index, reason);
                if (err.targetId) errorById.set(String(err.targetId), reason);
            });

            targetList.forEach((item, idx) => {
                const rawId = String(item.targetId).replace("T-", "");
                if (successIds.has(rawId) || successIds.has(String(item.targetId))) {
                    succeeded.push(item);
                } else {
                    const reason = errorByIndex.get(idx) || errorById.get(rawId) || errorById.get(String(item.targetId)) || "Amazon rejected this target";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (targetResponse) {
            targetList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
        }

        // ── Process keyword results ──────────────────────────────────────────
        if (keywordResponse?.status === 207) {
            const successIds = new Set((keywordResponse.data?.keywords?.success || []).map(c => String(c.keywordId)));
            const errorEntries = keywordResponse.data?.keywords?.error || [];
            const errorByIndex = new Map();
            const errorById = new Map();
            errorEntries.forEach(err => {
                const reason = extractAmazonErrorMessage(err);
                if (err.index !== undefined) errorByIndex.set(err.index, reason);
                if (err.keywordId) errorById.set(String(err.keywordId), reason);
            });

            keywordList.forEach((item, idx) => {
                const rawId = String(item.targetId).replace("K-", "");
                if (successIds.has(rawId) || successIds.has(String(item.targetId))) {
                    succeeded.push(item);
                } else {
                    const reason = errorByIndex.get(idx) || errorById.get(rawId) || errorById.get(String(item.targetId)) || "Amazon rejected this keyword";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (keywordResponse) {
            keywordList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
        }

        // ── Process campaign state results ───────────────────────────────────
        if (campaignStateResponse?.status === 207) {
            const successIds = new Set((campaignStateResponse.data?.campaigns?.success || []).map(c => String(c.campaignId)));
            const errorEntries = campaignStateResponse.data?.campaigns?.error || [];
            const errorByIndex = new Map();
            const errorById = new Map();
            errorEntries.forEach(err => {
                const reason = extractAmazonErrorMessage(err);
                if (err.index !== undefined) errorByIndex.set(err.index, reason);
                if (err.campaignId) errorById.set(String(err.campaignId), reason);
            });

            campaignStateList.forEach((item, idx) => {
                const cid = String(item.campaignId);
                if (successIds.has(cid)) {
                    succeeded.push(item);
                } else {
                    const reason = errorByIndex.get(idx) || errorById.get(cid) || "Amazon rejected this campaign state revert";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (campaignStateResponse) {
            campaignStateList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
        }

        // ── Process adGroup state results ────────────────────────────────────
        if (adGroupStateResponse?.status === 207) {
            const successIds = new Set((adGroupStateResponse.data?.adGroups?.success || []).map(c => String(c.adGroupId)));
            const errorEntries = adGroupStateResponse.data?.adGroups?.error || [];
            const errorByIndex = new Map();
            const errorById = new Map();
            errorEntries.forEach(err => {
                const reason = extractAmazonErrorMessage(err);
                if (err.index !== undefined) errorByIndex.set(err.index, reason);
                if (err.adGroupId) errorById.set(String(err.adGroupId), reason);
            });

            adGroupStateList.forEach((item, idx) => {
                const agId = String(item.adGroupId);
                if (successIds.has(agId)) {
                    succeeded.push(item);
                } else {
                    const reason = errorByIndex.get(idx) || errorById.get(agId) || "Amazon rejected this adGroup state revert";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (adGroupStateResponse) {
            adGroupStateList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
        }

        // ── Post-success DB updates ──────────────────────────────────────────
        await Promise.all(
            succeeded.map(async (item) => {
                const oldValue = item.oldValue;
                const isBid = item.changed === "bid";
                const isCampaignState = item.changed === "campaignState";
                const isAdGroupState = item.changed === "adGroupState";

                await affectedCampaignByRuleSchema.findByIdAndUpdate(
                    item._id,
                    { $set: { isReverted: true } },
                );

                if (isBid) {
                    const bidToSave = sanitizeRevertBid(oldValue, profile);
                    await createBidHistory(
                        item.targetId,
                        bidToSave,
                        rule.configId,
                        rule.profileId,
                        "Revert: Targeting bid adjusted",
                        rule.userId,
                        "SP"
                    );
                    await targetingSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            targetId: item.targetId,
                            targeting: item.targetName,
                            reportDate: currentDate,
                        },
                        { $set: { keywordBid: bidToSave } },
                    ).lean();
                } else if (isCampaignState) {
                    await createCampaignHistory(
                        item.campaignId,
                        "Revert: Campaign state adjusted",
                        item.newValue,
                        oldValue,
                        rule.configId,
                        rule.profileId,
                        rule.userId,
                        "SP"
                    );
                    await campaignSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            campaignId: item.campaignId,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                } else if (isAdGroupState) {
                    await checkIfAdGroupLastOrNot(item, oldValue, currentDate, rule?.configId, profile, checkConfigAds, "SP");
                    await createAdGroupHistory(
                        item.campaignId,
                        item.adGroupId,
                        "Revert: AdGroup state adjusted",
                        item.newValue,
                        oldValue,
                        rule.configId,
                        rule.profileId,
                        rule.userId,
                        "SP"
                    );
                    await adGroupsSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            campaignId: item.campaignId,
                            adGroupId: item.adGroupId,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                } else {
                    await checkIfTargetingLastOrNot(item, oldValue, currentDate, rule?.configId, profile, checkConfigAds, "SP");
                    await createStatusHistory(
                        item.targetId,
                        String(oldValue),
                        rule.configId,
                        rule.profileId,
                        "Revert: Targeting state adjusted",
                        rule.userId,
                        "SP"
                    );
                    await targetingSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            targetId: item.targetId,
                            targeting: item.targetName,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                }
            })
        );

    } catch (err) {
        write_logs({
            message: `revertedSPTargetingRuleEffect -> Error: ${err.message}`,
            log_type: "error",
        });
        SPList.forEach(item => failed.push({ _id: item._id, reason: err.message }));
    }

    return { succeeded, failed };
};

const revertedSBRuleEffect = async (SBList, rule, checkConfigAds, profile) => {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");

    const succeeded = [];
    const failed = [];

    if (!SBList?.length) return { succeeded, failed };

    try {
        const targetList = SBList.filter(item => String(item.targetId).startsWith("T-") && !["campaignState", "adGroupState"].includes(item.changed));
        const keywordList = SBList.filter(item => String(item.targetId).startsWith("K-") && !["campaignState", "adGroupState"].includes(item.changed));
        const campaignStateList = SBList.filter(item => item.changed === "campaignState");
        const adGroupStateList = SBList.filter(item => item.changed === "adGroupState");

        // ── Build API payloads ───────────────────────────────────────────────
        const buildTargetPayload = (item) => ({
            targetId: String(item.targetId).replace("T-", ""),
            adGroupId: item.adGroupId,
            campaignId: item.campaignId,
            ...(item.changed === "bid"
                ? { bid: sanitizeRevertBid(item.oldValue, profile) }
                : { state: String(item.oldValue).toLowerCase() })
        });

        const buildKeywordPayload = (item) => ({
            keywordId: String(item.targetId).replace("K-", ""),
            adGroupId: item.adGroupId,
            campaignId: item.campaignId,
            ...(item.changed === "bid"
                ? { bid: sanitizeRevertBid(item.oldValue, profile) }
                : { state: String(item.oldValue).toLowerCase() })
        });

        const targetingOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sb/targets`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: { targets: targetList.map(buildTargetPayload) },
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        const keywordOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sb/keywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: keywordList.map(buildKeywordPayload),
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        const campaignStateOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sb/v4/campaigns`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Prefer": "return=representation",
                "Accept": "application/vnd.sbcampaignresource.v4+json",
                "Content-Type": "application/vnd.sbcampaignresource.v4+json",
            },
            data: {
                campaigns: campaignStateList.map(item => ({
                    campaignId: String(item.campaignId),
                    state: String(item.oldValue).toUpperCase()
                }))
            },
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        const adGroupStateOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sb/v4/adGroups`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Prefer": "return=representation",
                "Accept": "application/vnd.sbadgroupresource.v4+json",
                "Content-Type": "application/vnd.sbadgroupresource.v4+json",
            },
            data: {
                adGroups: adGroupStateList.map(item => ({
                    adGroupId: String(item.adGroupId),
                    state: String(item.oldValue).toUpperCase()
                }))
            },
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        // ── Fire requests in parallel ────────────────────────────────────────
        const [targetResponse, keywordResponse, campaignStateResponse, adGroupStateResponse] = await Promise.all([
            targetList?.length ? retryWithBackoff(() => amazonAxios(targetingOption)) : null,
            keywordList?.length ? retryWithBackoff(() => amazonAxios(keywordOption)) : null,
            campaignStateList?.length ? retryWithBackoff(() => amazonAxios(campaignStateOption)) : null,
            adGroupStateList?.length ? retryWithBackoff(() => amazonAxios(adGroupStateOption)) : null,
        ]);

        write_logs({
            message: `revertedSBTargetingRuleEffect -> Target Response: ${JSON.stringify(targetResponse?.data)}, Keyword Response: ${JSON.stringify(keywordResponse?.data)}, Campaign State Response: ${JSON.stringify(campaignStateResponse?.data)}, AdGroup State Response: ${JSON.stringify(adGroupStateResponse?.data)}`,
            log_type: "info",
        });

        // ── Process target results ───────────────────────────────────────────
        if ([200, 207].includes(targetResponse?.status)) {
            const successIds = new Set((targetResponse.data?.targets?.success || []).map(c => String(c.targetId)));
            const errorEntries = targetResponse.data?.targets?.error || [];
            const errorByIndex = new Map();
            const errorById = new Map();
            errorEntries.forEach(err => {
                const reason = extractAmazonErrorMessage(err);
                if (err.index !== undefined) errorByIndex.set(err.index, reason);
                if (err.targetId) errorById.set(String(err.targetId), reason);
            });

            targetList.forEach((item, idx) => {
                const rawId = String(item.targetId).replace("T-", "");
                if (successIds.has(rawId) || successIds.has(String(item.targetId))) {
                    succeeded.push(item);
                } else {
                    const reason = errorByIndex.get(idx) || errorById.get(rawId) || "Amazon rejected this target";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (targetResponse) {
            targetList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 200/207" }));
        }

        // ── Process keyword results ──────────────────────────────────────────
        if ([200, 207].includes(keywordResponse?.status)) {
            const responseArray = Array.isArray(keywordResponse?.data) ? keywordResponse.data : [];

            keywordList.forEach((item, index) => {
                const result = responseArray[index];
                if (result?.code === "SUCCESS") {
                    succeeded.push(item);
                } else {
                    const reason = result?.description || result?.message || result?.code || "Amazon rejected this keyword";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (keywordResponse) {
            keywordList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 200/207" }));
        }

        // ── Process campaign state results ───────────────────────────────────
        if ([200, 207].includes(campaignStateResponse?.status)) {
            const successIds = new Set((campaignStateResponse.data?.campaigns?.success || []).map(c => String(c.campaignId)));
            const errorEntries = campaignStateResponse.data?.campaigns?.error || [];
            const errorByIndex = new Map();
            const errorById = new Map();
            errorEntries.forEach(err => {
                const reason = extractAmazonErrorMessage(err);
                if (err.index !== undefined) errorByIndex.set(err.index, reason);
                if (err.campaignId) errorById.set(String(err.campaignId), reason);
            });

            campaignStateList.forEach((item, idx) => {
                const cid = String(item.campaignId);
                if (successIds.has(cid)) {
                    succeeded.push(item);
                } else {
                    const reason = errorByIndex.get(idx) || errorById.get(cid) || "Amazon rejected this campaign state revert";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (campaignStateResponse) {
            campaignStateList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 200/207" }));
        }

        // ── Process adGroup state results ────────────────────────────────────
        if ([200, 207].includes(adGroupStateResponse?.status)) {
            const successIds = new Set((adGroupStateResponse.data?.adGroups?.success || []).map(c => String(c.adGroupId)));
            const errorEntries = adGroupStateResponse.data?.adGroups?.error || [];
            const errorByIndex = new Map();
            const errorById = new Map();
            errorEntries.forEach(err => {
                const reason = extractAmazonErrorMessage(err);
                if (err.index !== undefined) errorByIndex.set(err.index, reason);
                if (err.adGroupId) errorById.set(String(err.adGroupId), reason);
            });

            adGroupStateList.forEach((item, idx) => {
                const agId = String(item.adGroupId);
                if (successIds.has(agId)) {
                    succeeded.push(item);
                } else {
                    const reason = errorByIndex.get(idx) || errorById.get(agId) || "Amazon rejected this adGroup state revert";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (adGroupStateResponse) {
            adGroupStateList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 200/207" }));
        }

        // ── Post-success DB updates ──────────────────────────────────────────
        await Promise.all(
            succeeded.map(async (item) => {
                const oldValue = item.oldValue;
                const isBid = item.changed === "bid";
                const isCampaignState = item.changed === "campaignState";
                const isAdGroupState = item.changed === "adGroupState";

                await affectedCampaignByRuleSchema.findByIdAndUpdate(
                    item._id,
                    { $set: { isReverted: true } },
                );

                if (isBid) {
                    const bidToSave = sanitizeRevertBid(oldValue, profile);
                    await createBidHistory(
                        item.targetId,
                        bidToSave,
                        rule.configId,
                        rule.profileId,
                        "Revert: Targeting bid adjusted",
                        rule.userId,
                        "SB"
                    );
                    await sbTargetingSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            targetId: item.targetId,
                            targeting: item.targetName,
                            reportDate: currentDate,
                        },
                        { $set: { keywordBid: bidToSave } },
                    ).lean();
                } else if (isCampaignState) {
                    await createCampaignHistory(
                        item.campaignId,
                        "Revert: Campaign state adjusted",
                        item.newValue,
                        oldValue,
                        rule.configId,
                        rule.profileId,
                        rule.userId,
                        "SB"
                    );
                    await sbCampaignSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            campaignId: item.campaignId,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                } else if (isAdGroupState) {
                    await createAdGroupHistory(
                        item.campaignId,
                        item.adGroupId,
                        "Revert: AdGroup state adjusted",
                        item.newValue,
                        oldValue,
                        rule.configId,
                        rule.profileId,
                        rule.userId,
                        "SB"
                    );
                    await sbAdGroupsSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            campaignId: item.campaignId,
                            adGroupId: item.adGroupId,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                } else {
                    await createStatusHistory(
                        item.targetId,
                        String(oldValue),
                        rule.configId,
                        rule.profileId,
                        "Revert: Targeting state adjusted",
                        rule.userId,
                        "SB"
                    );
                    await sbTargetingSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            targetId: item.targetId,
                            targeting: item.targetName,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                }
            })
        );

    } catch (err) {
        write_logs({
            message: `revertedSBTargetingRuleEffect -> Error: ${err.message}`,
            log_type: "error",
        });
        SBList.forEach(item => failed.push({ _id: item._id, reason: err.message }));
    }

    return { succeeded, failed };
};

const revertedSDRuleEffect = async (SDList, rule, checkConfigAds, profile) => {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");

    const succeeded = [];
    const failed = [];

    if (!SDList?.length) return { succeeded, failed };

    try {
        const targetList = SDList.filter(item => String(item.targetId).startsWith("T-") && !["campaignState", "adGroupState"].includes(item.changed));
        const campaignStateList = SDList.filter(item => item.changed === "campaignState");
        const adGroupStateList = SDList.filter(item => item.changed === "adGroupState");

        // ── Build API payloads ───────────────────────────────────────────────
        const buildTargetPayload = (item) => ({
            targetId: String(item.targetId).replace("T-", ""),
            ...(item.changed === "bid"
                ? { bid: sanitizeRevertBid(item.oldValue, profile) }
                : { state: String(item.oldValue).toLowerCase() })
        });

        const targetingOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sd/targets`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: targetList.map(buildTargetPayload),
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        const campaignStateOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sd/campaigns`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: campaignStateList.map(item => ({
                campaignId: parseInt(item.campaignId),
                state: String(item.oldValue).toLowerCase()
            })),
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        const adGroupStateOption = {
            method: "PUT",
            url: `${profile.amazonUrl}/sd/adGroups`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: adGroupStateList.map(item => ({
                adGroupId: parseInt(item.adGroupId),
                state: String(item.oldValue).toLowerCase()
            })),
            meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
        };

        // ── Fire requests in parallel ────────────────────────────────────────
        const [targetResponse, campaignStateResponse, adGroupStateResponse] = await Promise.all([
            targetList?.length ? retryWithBackoff(() => amazonAxios(targetingOption)) : null,
            campaignStateList?.length ? retryWithBackoff(() => amazonAxios(campaignStateOption)) : null,
            adGroupStateList?.length ? retryWithBackoff(() => amazonAxios(adGroupStateOption)) : null,
        ]);

        write_logs({
            message: `revertedSDTargetingRuleEffect -> Target Response: ${JSON.stringify(targetResponse?.data)}, Campaign State Response: ${JSON.stringify(campaignStateResponse?.data)}, AdGroup State Response: ${JSON.stringify(adGroupStateResponse?.data)}`,
            log_type: "info",
        });

        // ── Process target results ───────────────────────────────────────────
        if ([200, 207].includes(targetResponse?.status)) {
            const responseArray = Array.isArray(targetResponse.data) ? targetResponse.data : [];

            targetList.forEach((item, index) => {
                const result = responseArray[index];
                if (result?.code === "SUCCESS") {
                    succeeded.push(item);
                } else {
                    const reason = result?.description || result?.message || result?.code || "Amazon rejected this target";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (targetResponse) {
            targetList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 200/207" }));
        }

        // ── Process campaign state results ───────────────────────────────────
        if ([200, 207].includes(campaignStateResponse?.status)) {
            const responseArray = Array.isArray(campaignStateResponse.data) ? campaignStateResponse.data : [];

            campaignStateList.forEach((item, index) => {
                const result = responseArray[index];
                if (result?.code === "SUCCESS") {
                    succeeded.push(item);
                } else {
                    const reason = result?.description || result?.message || result?.code || "Amazon rejected this campaign state revert";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (campaignStateResponse) {
            campaignStateList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 200/207" }));
        }

        // ── Process adGroup state results ────────────────────────────────────
        if ([200, 207].includes(adGroupStateResponse?.status)) {
            const responseArray = Array.isArray(adGroupStateResponse.data) ? adGroupStateResponse.data : [];

            adGroupStateList.forEach((item, index) => {
                const result = responseArray[index];
                if (result?.code === "SUCCESS") {
                    succeeded.push(item);
                } else {
                    const reason = result?.description || result?.message || result?.code || "Amazon rejected this adGroup state revert";
                    failed.push({ _id: item._id, reason });
                }
            });
        } else if (adGroupStateResponse) {
            adGroupStateList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 200/207" }));
        }

        // ── Post-success DB updates ──────────────────────────────────────────
        await Promise.all(
            succeeded.map(async (item) => {
                const oldValue = item.oldValue;
                const isBid = item.changed === "bid";
                const isCampaignState = item.changed === "campaignState";
                const isAdGroupState = item.changed === "adGroupState";

                await affectedCampaignByRuleSchema.findByIdAndUpdate(
                    item._id,
                    { $set: { isReverted: true } },
                );

                if (isBid) {
                    const bidToSave = sanitizeRevertBid(oldValue, profile);
                    await createBidHistory(
                        item.targetId,
                        bidToSave,
                        rule.configId,
                        rule.profileId,
                        "Revert: Targeting bid adjusted",
                        rule.userId,
                        "SD"
                    );
                    await sdTargetingSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            targetId: item.targetId,
                            reportDate: currentDate,
                        },
                        { $set: { keywordBid: bidToSave } },
                    ).lean();
                } else if (isCampaignState) {
                    await createCampaignHistory(
                        item.campaignId,
                        "Revert: Campaign state adjusted",
                        item.newValue,
                        oldValue,
                        rule.configId,
                        rule.profileId,
                        rule.userId,
                        "SD"
                    );
                    await sdCampaignSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            campaignId: item.campaignId,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                } else if (isAdGroupState) {
                    await createAdGroupHistory(
                        item.campaignId,
                        item.adGroupId,
                        "Revert: AdGroup state adjusted",
                        item.newValue,
                        oldValue,
                        rule.configId,
                        rule.profileId,
                        rule.userId,
                        "SD"
                    );
                    await sdAdGroupsSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            campaignId: item.campaignId,
                            adGroupId: item.adGroupId,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                } else {
                    await createStatusHistory(
                        item.targetId,
                        String(oldValue),
                        rule.configId,
                        rule.profileId,
                        "Revert: Targeting state adjusted",
                        rule.userId,
                        "SD"
                    );
                    await sdTargetingSchema.findOneAndUpdate(
                        {
                            configId: rule.configId,
                            profileId: rule.profileId,
                            targetId: item.targetId,
                            reportDate: currentDate,
                        },
                        { $set: { status: String(oldValue) } },
                    ).lean();
                }
            })
        );

    } catch (err) {
        write_logs({
            message: `revertedSDTargetingRuleEffect -> Error: ${err.message}`,
            log_type: "error",
        });
        SDList.forEach(item => failed.push({ _id: item._id, reason: err.message }));
    }

    return { succeeded, failed };
};

exports.getFilteredTargetingIds = async function (req, targetingPipeline) {
    const configId = req?.config?.configId;
    const { adTypeTargetingSchema } = req.models;
    const adType = req.adType;

    try {
        let {
            fromDate,
            toDate,
            profileId,
            campaignId,
            adGroupId,
            gridFilter,
            searchName,
            fieldName,
            fieldOperator,
            fieldValue,
            conditions,
            extraFieldOperator,
            extraFieldValue,
            filteredTargetingIds,
            query: Query,
            isExactSearchMatch = false,
        } = req.body;

        if (!profileId) {
            return { success: false, message: "Profile id required." };
        }

        const profile = await getProfile(configId, profileId);
        const resolvedConfigId = profile?.configId ? new ObjectId(profile.configId) : (configId && ObjectId.isValid(configId) ? new ObjectId(configId) : configId);
        const numericProfileId = Number(profileId) || profileId;
        const timezone = profile?.timezone;

        const reportDate = {
            $gte: fromDate || moment().tz(timezone).format("YYYY-MM-DD"),
            $lte: toDate || moment().tz(timezone).format("YYYY-MM-DD"),
        };

        const lastTargetDoc = await (adTypeTargetingSchema || targetingSchema).findOne(
            { configId: resolvedConfigId, profileId: numericProfileId },
            { reportDate: 1 }
        ).sort({ reportDate: -1 }).lean().exec();

        const lastTargetDateVal = lastTargetDoc?.reportDate ?? reportDate.$lte;
        const lastDate = lastTargetDateVal > (toDate || reportDate.$lte) ? (toDate || reportDate.$lte) : lastTargetDateVal;

        let campaignIdFilter = null;
        if (campaignId) {
            if (Array.isArray(campaignId) && campaignId.length > 0) {
                campaignIdFilter = campaignId.length === 1 ? (Number(campaignId[0]) || campaignId[0]) : { $in: campaignId.map(id => Number(id) || id) };
            } else if (!Array.isArray(campaignId) && campaignId !== "" && campaignId !== null && campaignId !== undefined) {
                campaignIdFilter = Number(campaignId) || campaignId;
            }
        }

        let adGroupIdFilter = null;
        if (adGroupId) {
            if (Array.isArray(adGroupId) && adGroupId.length > 0) {
                adGroupIdFilter = adGroupId.length === 1 ? (Number(adGroupId[0]) || adGroupId[0]) : { $in: adGroupId.map(id => Number(id) || id) };
            } else if (!Array.isArray(adGroupId) && adGroupId !== "" && adGroupId !== null && adGroupId !== undefined) {
                adGroupIdFilter = Number(adGroupId) || adGroupId;
            }
        }

        let query = {
            configId: resolvedConfigId,
            profileId: numericProfileId,
            reportDate,
            ...(campaignIdFilter && { campaignId: campaignIdFilter }),
            ...(adGroupIdFilter && { adGroupId: adGroupIdFilter }),
            ...(filteredTargetingIds?.length > 0 && { targetId: { $in: filteredTargetingIds } }),
            ...(searchName && (isExactSearchMatch
                ? { targeting: searchName }
                : { targeting: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } }
            )),
        };

        if (gridFilter) {
            const filter = await filterSchema.findOne({ _id: new ObjectId(gridFilter) }).lean();
            if (filter?.filter) {
                let parsed = sanitizeQueryObject(safeJsonParse(filter.filter));
                Object.assign(query, parsed);
            }
        }

        let pipeline = targetingPipeline(query, lastDate, adType);

        if (Query && Query !== "{}") {
            pipeline.push({ $match: sanitizeQueryObject(safeJsonParse(Query)) });
        }

        // Add field filtering
        if (fieldName && fieldOperator && fieldValue !== undefined) {
            const fieldFilter = buildFieldFilter(fieldName, fieldOperator, fieldValue);

            if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
                const extraFieldFilter = buildFieldFilter(fieldName, extraFieldOperator, extraFieldValue);
                const logicalOperator = {
                    [`$${conditions.toLowerCase()}`]: [fieldFilter, extraFieldFilter]
                };
                pipeline.push({ $match: logicalOperator });
            } else {
                pipeline.push({ $match: fieldFilter });
            }
        }

        // Final projection - ONLY return targetId
        pipeline.push({ $project: { targetId: 1, _id: 0 } });

        const result = await adTypeTargetingSchema.aggregate(pipeline).allowDiskUse(true);
        const targetingIds = result.map(item => item.targetId);

        return { success: true, targetingIds: targetingIds, totalTargetings: targetingIds.length };
    } catch (error) {
        write_logs({ message: `[getFilteredTargetingIds Error] ${error?.message || error}`, log_type: "error" });
        return { success: false, error: "An internal server error occurred" };
    }
}

exports.getTargetingChartData = async (req, res) => {
    const configId = req?.config?.configId;
    const { adTypeTargetingSchema } = req.models;
    const adType = req.adType;

    try {
        let {
            fromDate,
            toDate,
            profileId,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required." });
        }

        // STEP 1: Get filtered targeting IDs
        const filterResult = await this.getFilteredTargetingIds(req, this.targetingPipeline);

        if (!filterResult.success) {
            return res.status(203).send({
                isSuccess: false,
                message: filterResult.message || "Failed to filter targetings",
                error: filterResult.error
            });
        }

        const targetingIds = filterResult.targetingIds;

        if (targetingIds.length === 0) {
            return res.status(200).send({
                isSuccess: true,
                data: [],
                message: "No targetings found matching the filters"
            });
        }

        // STEP 2: Get chart data using targeting IDs
        const profile = await getProfile(configId, profileId);
        const resolvedConfigId = profile?.configId ? new ObjectId(profile.configId) : (configId && ObjectId.isValid(configId) ? new ObjectId(configId) : configId);
        const numericProfileId = Number(profileId) || profileId;
        const timezone = profile?.timezone;
        const fromDateValue = fromDate || moment().tz(timezone).format("YYYY-MM-DD");
        const toDateValue = toDate || moment().tz(timezone).format("YYYY-MM-DD");

        // Simple pipeline - just match targeting IDs and group by date
        const chartPipeline = [
            {
                $match: {
                    configId: resolvedConfigId,
                    profileId: numericProfileId,
                    targetId: { $in: targetingIds },
                    reportDate: { $gte: fromDateValue, $lte: toDateValue }
                }
            },
            {
                $group: {
                    _id: { reportDate: "$reportDate" },
                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    orders: { $sum: "$orders" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },
                }
            },
            {
                $project: {
                    _id: 0,
                    reportDate: "$_id.reportDate",
                    impressions: 1,
                    clicks: 1,
                    orders: 1,
                    spend: { $round: ["$spend", 2] },
                    sales: { $round: ["$sales", 2] },
                    cpc: { $round: [{ $cond: { if: { $gt: ["$clicks", 0] }, then: { $divide: ["$spend", "$clicks"] }, else: 0 } }, 2] },
                    acos: { $round: [{ $cond: { if: { $gt: ["$sales", 0] }, then: { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, else: 0 } }, 2] },
                    roas: { $round: [{ $cond: { if: { $gt: ["$spend", 0] }, then: { $divide: ["$sales", "$spend"] }, else: 0 } }, 2] },
                    ctr: { $round: [{ $cond: { if: { $gt: ["$impressions", 0] }, then: { $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, else: 0 } }, 2] },
                    conversionRate: { $round: [{ $cond: { if: { $gt: ["$clicks", 0] }, then: { $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, else: 0 } }, 2] }
                }
            },
            { $sort: { reportDate: 1 } },
        ];

        const result = await adTypeTargetingSchema.aggregate(chartPipeline).allowDiskUse(true);

        return res.status(200).send({
            isSuccess: true,
            data: result,
            filteredTargetingIds: targetingIds,
            totalFilteredTargetings: targetingIds.length
        });

    } catch (error) {
        write_logs({ message: `[getTargetingChartData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};


exports.exportTargetingRule = async (req, res) => {
    try {
        const { configId } = req?.config;
        const { profileId, exportIds } = req.body;

        const query = { configId, profileId };

        // ✅ Apply ruleIds filter if provided
        if (Array.isArray(exportIds) && exportIds?.length) {
            query._id = { $in: exportIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) };
        }

        const rules = await targetingRuleSchema.find(query).lean();

        const workbook = new ExcelJS.Workbook();

        const metaSheet = workbook.addWorksheet("_META");
        const secretPayload = `TARGETING_RULE`;
        const signature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(secretPayload).digest("hex");
        metaSheet.getCell("A1").value = signature;
        metaSheet.state = "hidden";

        const sheet = workbook.addWorksheet("TargetingRules");

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

            { header: "Bid Threshold", key: "bidThreshold", width: 40 },

            { header: "Report Date", key: "reportDate", width: 15 },
            { header: "To Date", key: "toDate", width: 15 },

            { header: "Days", key: "days", width: 25 },
            { header: "Times", key: "times", width: 25 },

            { header: "Rule Type", key: "ruleType", width: 20 },
            { header: "Start Date", key: "startDate", width: 20 },
            { header: "End Date", key: "endDate", width: 20 },

            { header: "Allow Multi Time Changes", key: "allowMultiTimeChanges", width: 25 },

            { header: "Days Since Creation", key: "daysSinceCreation", width: 15 },
            { header: "Is Days Since Creation", key: "isDaysSinceCreation", width: 15 },

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
                bidThreshold: JSON.stringify(rule?.bidThreshold ?? {}),
                days: JSON.stringify(rule.days ?? []),
                times: JSON.stringify(rule.times ?? []),

                reportDate: rule.reportDate ?? "",
                toDate: rule.toDate ?? "",

                ruleType: rule.ruleType ?? "",
                startDate: rule.startDate ?? "",
                endDate: rule.endDate ?? "",

                allowMultiTimeChanges: rule.allowMultiTimeChanges ?? false,

                daysSinceCreation: rule?.daysSinceCreation ?? 0,
                isDaysSinceCreation: rule?.isDaysSinceCreation ?? false,

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
            `attachment; filename=TargetingRules_${profileId}.xlsx`
        );
        res.setHeader(
            "Access-Control-Expose-Headers",
            "Content-Disposition"
        );

        await workbook.xlsx.write(res);
        return res.end();

    } catch (error) {
        write_logs({ message: `[exportTargetingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.error(error);
        return res.status(500).send({
            isSuccess: false,
            message: "Export failed",
            error: "An internal server error occurred",
        });
    }
};

exports.importTargetingRule = async (req, res) => {
    try {
        const { _id: userId } = req.user;
        const { configId } = req?.config;
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
        const expectedPayload = `TARGETING_RULE`;

        const storedSignature = metaSheet.getCell("A1").value;
        const expectedSignature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(expectedPayload).digest("hex");

        if (storedSignature !== expectedSignature) {
            return res.status(203).send({
                isSuccess: false,
                message: "Invalid file. Please upload a valid Targeting Rule export file."
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
        const existingRules = await targetingRuleSchema.find({ configId, profileId, userId }, { _id: 1, conditions: 1 }).lean();

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
                const matchedRule = checkDuplicateTargetingRule(existingRules, conditions);
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
                    bidThreshold: safeJsonParse(row.getCell("G").value || "{}"),

                    reportDate: row.getCell("H").value,
                    toDate: row.getCell("I").value,

                    days: safeJsonParse(row.getCell("J").value || "[]"),
                    times: safeJsonParse(row.getCell("K").value || "[]"),

                    ruleType: row.getCell("L").value,
                    startDate: row.getCell("M").value,
                    endDate: row.getCell("N").value,

                    allowMultiTimeChanges: row.getCell("O").value === true,

                    isDaysSinceCreation: row.getCell("P").value === true,
                    daysSinceCreation: row.getCell("Q").value,

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
                write_logs({ message: `[importTargetingRule Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                errors.push({
                    row: rowNumber,
                    message: err.message,
                });
            }
        });

        if (bulkOps.length) {
            await prepareSnapshotBulkUpdates(targetingRuleSchema, bulkOps);
            await targetingRuleSchema.bulkWrite(bulkOps);
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
        write_logs({ message: `[importTargetingRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Import failed",
            error: "An internal server error occurred",
        });
    }
};

exports.addTarget = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const {
            updateTargets,
            profileId
        } = req.body;

        if (!profileId) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const getAccount = await getProfile(configId, profileId);
        const checkConfigAds = await getAccessToken(configId);

        const updateConfig = {
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/targets`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spTargetingClause.v3+json",
                Accept: "application/vnd.spTargetingClause.v3+json"
            },
            data: { targetingClauses: updateTargets }
        };
        const response = await axios(updateConfig);

        if (response.status !== 200) {
            return res.status(203).send({
                message: "Something went wrong, please try again!",
                isSuccess: false,
            });
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Target added successfully!"
        });
    } catch (error) {
        write_logs({ message: `[addTarget Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }

}

exports.getLifeTimeTargetingMatrix = async (req, res) => {
    const configId = req?.config?.configId;
    const { adTypeCampaignSchema, adTypeTargetingSchema, adTypeProductAdsSchema } = req.models;

    try {
        let {
            fromDate,
            toDate,
            profileId,
            pageNo = 1,
            perPage = 10,
            searchName,
            fieldName,
            sortType,
            customStatus,
            query: Query,
        } = req.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required.",
            });
        }

        const { status, campaignStatus, keywordType, campaignId, adGroupId, ...metrix } = sanitizeQueryObject(safeJSON(Query)) ?? {};

        const hasCampaignStatusFilter = campaignStatus && (typeof campaignStatus !== "object" || Object.keys(campaignStatus).length > 0);
        const hasStatusFilter = status && (typeof status !== "object" || Object.keys(status).length > 0);

        /* ---------- PROFILE ---------- */
        const profile = await getProfile(configId, profileId);
        const resolvedConfigId = profile?.configId ? new ObjectId(profile.configId) : (configId && ObjectId.isValid(configId) ? new ObjectId(configId) : configId);
        const numericProfileId = Number(profileId) || profileId;
        const timezone = profile?.timezone || "UTC";
        const lastTargetDoc = await adTypeTargetingSchema.findOne({ configId: resolvedConfigId, profileId: numericProfileId }, { reportDate: 1 }).sort({ reportDate: -1 }).lean();
        const lastDate = lastTargetDoc?.reportDate ?? moment().tz(timezone).format("YYYY-MM-DD");
        const lastCampaignDoc = await adTypeCampaignSchema.findOne({ configId: resolvedConfigId, profileId: numericProfileId }, { reportDate: 1 }).sort({ reportDate: -1 }).lean();
        const latestCampaignDate = lastCampaignDoc?.reportDate ?? lastDate;

        /* ---------- SORT ---------- */
        const sortStage = {};
        if (sortType === "ASC") sortStage[fieldName] = 1;
        else if (sortType === "DESC") sortStage[fieldName] = -1;
        else sortStage.campaignCount = -1;

        /* ---------- SETTINGS ---------- */
        const campaignSetting = await campaignSettingSchema.findOne(
            { configId: resolvedConfigId, profileId: numericProfileId },
            { targetAcos: 1 }
        ).lean();
        const targetAcos = campaignSetting?.targetAcos ?? 30;

        /* ---------- AVG SPEND ---------- */
        const avgSpendResult = await adTypeTargetingSchema.aggregate([
            { $match: { configId: resolvedConfigId, profileId: numericProfileId } },
            { $group: { _id: null, avgSpend: { $avg: "$spend" } } },
        ]);
        const avgSpend = avgSpendResult?.[0]?.avgSpend ?? 0;

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

        const activeCampaignIds = await adTypeCampaignSchema.distinct("campaignId", {
            reportDate: latestCampaignDate,
            configId: resolvedConfigId,
            profileId: numericProfileId,
            ...(campaignIdFilter && { campaignId: campaignIdFilter }),
            ...(campaignStatus && { status: campaignStatus }),
        });

        const activeTargetingIds = await adTypeTargetingSchema.distinct("targetId", {
            reportDate: lastDate,
            configId: resolvedConfigId,
            profileId: numericProfileId,
            ...(status && { status }),
        });

        /* ======================================================
           STEP 1: TARGETING AGGREGATION (NO PRODUCT LOOKUP)
        ====================================================== */
        const targetingPipeline = [
            {
                $match: {
                    configId: resolvedConfigId,
                    profileId: numericProfileId,
                    reportDate: {
                        $gte: fromDate || moment().tz(timezone).format("YYYY-MM-DD"),
                        $lte: toDate || moment().tz(timezone).format("YYYY-MM-DD"),
                    },
                    ...(hasStatusFilter && { targetId: { $in: activeTargetingIds } }),
                    ...(keywordType && { keywordType }),
                    ...(adGroupIdFilter && { adGroupId: adGroupIdFilter }),
                    ...(hasCampaignStatusFilter && { campaignId: { $in: activeCampaignIds } }),
                    ...((!hasCampaignStatusFilter && campaignIdFilter) && { campaignId: campaignIdFilter }),
                    ...((!hasStatusFilter && status) && { status }),
                    ...(searchName && { targeting: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } }),
                }
            },
            {
                $group: {
                    _id: {
                        targeting: "$targeting",
                        matchType: "$matchType",
                        profileId: "$profileId",
                    },

                    impressions: { $sum: "$impressions" },
                    clicks: { $sum: "$clicks" },
                    orders: { $sum: "$orders" },
                    spend: { $sum: "$spend" },
                    sales: { $sum: "$sales" },

                    campaignIds: { $addToSet: "$campaignId" },
                },
            },
            {
                $match: {
                    $or: [
                        { impressions: { $gt: 0 } },
                        { clicks: { $gt: 0 } },
                        { spend: { $gt: 0 } },
                        { sales: { $gt: 0 } }
                    ]
                }
            },
            {
                $project: {
                    profileId: "$_id.profileId",
                    targeting: "$_id.targeting",
                    matchType: "$_id.matchType",
                    impressions: 1,
                    clicks: 1,
                    spend: 1,
                    sales: 1,
                    orders: 1,
                    campaignIds: 1,
                    campaignCount: { $size: "$campaignIds" },
                    acos: { $cond: [{ $gt: ["$sales", 0] }, { $round: [{ $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 2] }, 0] },
                    roas: { $cond: [{ $gt: ["$spend", 0] }, { $round: [{ $divide: ["$sales", "$spend"] }, 2] }, 0] },
                    customStatus: {
                        $switch: {
                            branches: [
                                // 🟢 WINNER
                                {
                                    case: {
                                        $and: [
                                            { $gte: ["$sales", 5] },
                                            { $lte: [{ $cond: [{ $gt: ["$sales", 0] }, { $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 0] }, targetAcos] }
                                        ]
                                    },
                                    then: "WINNER"
                                },
                                // 🔴 POOR
                                {
                                    case: { $and: [{ $eq: ["$sales", 0] }, { $gt: ["$spend", avgSpend] }] },
                                    then: "POOR"
                                }
                            ],
                            default: "NEUTRAL"
                        }
                    }
                }
            },
            ...(customStatus ? [{ $match: { customStatus } }] : []),
            ...(metrix ? [{ $match: { ...metrix } }] : []),
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
            },
            {
                $project: {
                    data: 1,
                    totalRecords: { $ifNull: [{ $arrayElemAt: ["$totalRecords.count", 0] }, 0] }
                }
            }
        ];

        const result = await adTypeTargetingSchema.aggregate(targetingPipeline).allowDiskUse(true);
        const targetingResult = result[0]?.data || [];
        const totalRecords = result[0]?.totalRecords || 0;
        const totalRow = result[0]?.totalRow || {};

        const productCounts = await adTypeProductAdsSchema.aggregate([
            { $match: { configId, profileId: Number(profileId), reportDate: lastDate } },
            { $group: { _id: "$campaignId", adIds: { $addToSet: "$adId" } } },
            { $project: { campaignId: "$_id", count: { $size: "$adIds" } } },
        ]);

        const productCountMap = productCounts?.reduce((acc, curr) => ({ ...acc, [curr?.campaignId]: curr?.count }), {});
        const finalResult = targetingResult.map((row) => ({ ...row, productCount: row?.campaignIds?.reduce((sum, cid) => sum + (productCountMap[cid] || 0), 0) || 0 }));

        return res.status(200).send({
            isSuccess: true,
            getTargeting: finalResult,
            totalRow: totalRow ?? {},
            currentPageNo: pageNo,
            totalRecords: totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
        });

    } catch (error) {
        write_logs({ message: `[getLifeTimeTargetingMatrix Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.getTargetingKeywordDetails = async (req, res) => {
    const configId = req?.config?.configId;
    const { adTypeCampaignSchema, adTypeProductAdsSchema, adTypeProductSchema } = req.models;

    try {
        const { profileId, targeting, matchType, campaignIds = [] } = req.body;

        if (!profileId || !targeting || !matchType) {
            return res.status(400).json({
                isSuccess: false,
                message: "profileId, targeting and matchType are required",
            });
        }

        /* ---------- PROFILE ---------- */
        const profile = await getProfile(configId, profileId);
        const resolvedConfigId = profile?.configId ? new ObjectId(profile.configId) : (configId && ObjectId.isValid(configId) ? new ObjectId(configId) : configId);
        const numericProfileId = Number(profileId) || profileId;
        const timezone = profile?.timezone || "UTC";
        const lastDate = moment().tz(timezone).format("YYYY-MM-DD");

        /* ─────────────────────────────
         * STEP 1: Get campaignIds
         * ───────────────────────────── */

        if (!campaignIds.length) {
            return res.status(200).json({
                isSuccess: true,
                data: [],
            });
        }

        /* ─────────────────────────────
         * STEP 2: Campaign details
         * ───────────────────────────── */
        const campaigns = await adTypeCampaignSchema
            .find(
                { configId: resolvedConfigId, profileId: numericProfileId, campaignId: { $in: campaignIds.map(Number) } },
                { _id: 0, campaignId: 1, name: 1 }
            )
            .lean();

        const campaignMap = {};
        campaigns.forEach(c => {
            campaignMap[c.campaignId] = c.name;
        });

        /* ─────────────────────────────
         * STEP 3: Get unique products per campaign
         * (NO lookup here)
         * ───────────────────────────── */
        const productCampaignMap = await adTypeProductAdsSchema.aggregate([
            {
                $match: {
                    configId: resolvedConfigId,
                    profileId: numericProfileId,
                    campaignId: { $in: campaignIds.map(Number) },
                },
            },
            {
                $group: {
                    _id: {
                        campaignId: "$campaignId",
                        adId: "$adId",
                        sku: "$sku",
                    },
                    asin: { $first: "$asins" },
                },
            },
            {
                $group: {
                    _id: "$_id.campaignId",
                    products: {
                        $push: {
                            adId: "$_id.adId",
                            sku: "$_id.sku",
                            asin: "$asin",
                        },
                    },
                },
            },
        ]);

        /* ─────────────────────────────
         * STEP 4: Fetch latest product info ONCE per SKU
         * ───────────────────────────── */
        const allSkus = [
            ...new Set(
                productCampaignMap.flatMap(c =>
                    c.products.map(p => p.sku).filter(Boolean)
                )
            ),
        ];

        const latestProducts = await adTypeProductSchema.aggregate([
            { $match: { sku: { $in: allSkus } } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: "$sku",
                    title: { $first: "$title" },
                    imageUrl: { $first: "$imageUrl" },
                },
            },
        ]);

        const productMap = {};
        latestProducts.forEach(p => {
            productMap[p._id] = {
                name: p.title,
                image: p.imageUrl,
            };
        });

        /* ─────────────────────────────
         * STEP 5: Merge final response
         * ───────────────────────────── */
        const result = productCampaignMap
            .map(c => ({
                campaignId: c._id,
                campaignName: campaignMap[c._id] || "",
                products: c.products.map(p => ({
                    ...p,
                    name: productMap[p.sku]?.name || "",
                    image: productMap[p.sku]?.image || "",
                })),
                productCount: c.products.length,
            }))
            .sort((a, b) => b.productCount - a.productCount);

        return res.status(200).json({
            isSuccess: true,
            data: result,
        });

    } catch (error) {
        write_logs({ message: `[getTargetingKeywordDetails Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.error("Targeting Keyword Details Error:", error);
        return res.status(500).json({
            isSuccess: false,
            message: "Failed to load targeting details",
            error: "An internal server error occurred",
        });
    }
};

exports.getTargetingByCampaigns = async (req, res) => {
    try {
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const { profileId, campaigns } = req.body;
        if (!profileId || !campaigns) {
            return res.status(203).send({ isSuccess: false, message: "profileId and campaigns are required" });
        }

        const spIds = campaigns.SP || [];
        const sbIds = campaigns.SB || [];
        const sdIds = campaigns.SD || [];

        const aggregatePipeline = async (campaignIds, adType) => {
            if (!campaignIds || campaignIds.length === 0) return [];
            const schemaMap = {
                SP: targetingSchema,
                SB: sbTargetingSchema,
                SD: sdTargetingSchema
            };
            const Schema = schemaMap[adType];

            const latestDoc = await Schema.findOne({ profileId: Number(profileId), campaignId: { $in: campaignIds }, ...(configId && { configId }) }, { reportDate: 1 }).sort({ reportDate: -1 }).lean();

            if (!latestDoc || !latestDoc.reportDate) return [];

            return Schema.aggregate([
                { $match: { profileId: Number(profileId), campaignId: { $in: campaignIds }, reportDate: latestDoc.reportDate, ...(configId && { configId }) } },
                { $project: { keywordId: 1, targetId: 1, keywordText: 1, targetingText: 1, targeting: 1, resolvedText: 1, matchType: 1, state: 1, _id: 1, campaignId: 1 } }
            ]);
        };

        const [spTargets, sbTargets, sdTargets] = await Promise.all([
            aggregatePipeline(spIds, "SP"),
            aggregatePipeline(sbIds, "SB"),
            aggregatePipeline(sdIds, "SD")
        ]);

        const allTargets = [
            ...spTargets.map(t => ({ ...t, adType: "SP" })),
            ...sbTargets.map(t => ({ ...t, adType: "SB" })),
            ...sdTargets.map(t => ({ ...t, adType: "SD" }))
        ];

        return res.status(200).send({
            isSuccess: true,
            data: allTargets
        });

    } catch (error) {
        write_logs({ message: `[aggregatePipeline Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Failed to fetch targetings by campaigns",
            error: error.message
        });
    }
};

exports.createKeywords = async (req, res) => {
    try {
        let configId = req?.config?.configId || req.body?.configId;
        const { profileId, campaignId, adGroupId, keywords } = req.body;

        if (!profileId || !campaignId || !adGroupId || !Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).send({
                isSuccess: false,
                message: "Missing required parameters (profileId, campaignId, adGroupId, keywords)."
            });
        }

        if (!configId) {
            const profileDoc = await profileSchema.findOne({ profileId: Number(profileId) }).lean();
            if (profileDoc) {
                configId = profileDoc.configId;
            }
        }

        const getAccount = await getProfile(configId, profileId);
        const checkConfigAds = await getAccessToken(configId);

        if (!getAccount || !checkConfigAds) {
            return res.status(400).send({
                isSuccess: false,
                message: "Unable to retrieve Amazon Advertising account configuration."
            });
        }

        const marketMin = getMarketplaceMinBid(getAccount?.currencyCode, getAccount?.countryCode);
        const invalidBid = keywords.find(k => k.bid !== undefined && k.bid !== null && parseFloat(k.bid) < marketMin);
        if (invalidBid) {
            return res.status(203).send({
                isSuccess: false,
                message: `Keyword bids must be at least ${marketMin.toFixed(2)}.`,
            });
        }

        const formattedKeywords = keywords.map((k) => ({
            campaignId: String(campaignId),
            adGroupId: String(adGroupId),
            keywordText: String(k.keywordText || k.keyword || "").trim(),
            matchType: String(k.matchType || "EXACT").toUpperCase(),
            bid: Math.max(marketMin, parseFloat(k.bid) || marketMin),
            state: k.state || "ENABLED"
        })).filter(k => k.keywordText.length > 0);

        if (formattedKeywords.length === 0) {
            return res.status(400).send({
                isSuccess: false,
                message: "No valid keywords provided."
            });
        }

        const apiOptions = {
            method: "POST",
            url: `${getAccount.amazonUrl}/sp/keywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": String(profileId),
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spKeyword.v3+json",
                "Accept": "application/vnd.spKeyword.v3+json"
            },
            data: {
                keywords: formattedKeywords
            }
        };

        const response = await axios(apiOptions);
        const resData = response.data;

        const successKeywords = resData?.keywords?.success || [];
        const errorKeywords = resData?.keywords?.error || [];

        const timezone = getAccount.timezone || "UTC";
        const todayDate = moment().tz(timezone).format("YYYY-MM-DD");

        if (successKeywords.length > 0) {
            const bulkOps = successKeywords.map((item) => {
                const kwId = item.keywordId || item.id;
                const matchTypeUpper = (item.matchType || formattedKeywords[item.index]?.matchType || "EXACT").toUpperCase();
                const kwText = item.keywordText || formattedKeywords[item.index]?.keywordText || "";
                const bidVal = item.bid !== undefined ? item.bid : (formattedKeywords[item.index]?.bid || 0);

                return {
                    updateOne: {
                        filter: {
                            profileId: Number(profileId),
                            campaignId: Number(campaignId),
                            adGroupId: Number(adGroupId),
                            targetId: `K-${kwId}`,
                            reportDate: todayDate
                        },
                        update: {
                            $set: {
                                configId,
                                profileId: Number(profileId),
                                campaignId: Number(campaignId),
                                adGroupId: Number(adGroupId),
                                targetId: `K-${kwId}`,
                                targeting: kwText,
                                matchType: matchTypeUpper,
                                keywordType: `KEYWORD - ${matchTypeUpper}`,
                                type: "KEYWORD",
                                keywordBid: bidVal,
                                status: item.state || "ENABLED",
                                reportDate: todayDate
                            },
                            $setOnInsert: {
                                impressions: 0,
                                clicks: 0,
                                cost: 0,
                                purchases1d: 0,
                                sales1d: 0
                            }
                        },
                        upsert: true
                    }
                };
            });

            await targetingSchema.bulkWrite(bulkOps);
        }

        write_logs({
            message: `[createKeywords] Added ${successKeywords.length} keywords for campaignId ${campaignId}, adGroupId ${adGroupId}`,
            log_type: "info"
        });

        if (errorKeywords.length > 0 && successKeywords.length === 0) {
            const firstErr = errorKeywords[0]?.errors?.[0]?.errorValue?.message || errorKeywords[0]?.errors?.[0]?.message || "Failed to create keywords on Amazon Ads";
            return res.status(203).send({
                isSuccess: false,
                message: firstErr,
                data: resData
            });
        }

        return res.status(200).send({
            isSuccess: true,
            message: `${successKeywords.length} keyword(s) added successfully!`,
            data: resData
        });

    } catch (error) {
        write_logs({ message: `[createKeywords Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).send({
            isSuccess: false,
            message: error?.response?.data?.message || error?.message || "Something went wrong creating keywords.",
            error: error.message
        });
    }
};

exports.getTargetingHistory = async (req, res) => {
    try {
        const {
            profileId,
            campaignId,
            targetId,
            adType = "SP",
            fromDate,
            toDate,
            acosLookbackMode = "7",
            acosLookbackDays = 7,
            customAcosFromDate,
            customAcosToDate,
        } = req.body;

        if (!targetId && !campaignId) {
            return res.status(400).send({
                isSuccess: false,
                message: "targetId or campaignId is required",
            });
        }

        const configId = req.body.configId || req.query?.configId || req?.config?.configId || req?.headers?.["x-config-id"] || req?.headers?.["configid"];
        const resolvedConfigId = configId && mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(String(configId)) : null;

        const numProfileId = profileId ? Number(profileId) : null;
        const numCampaignId = campaignId ? Number(campaignId) : null;
        const strCampaignId = campaignId ? String(campaignId) : null;

        const cleanTargetId = targetId ? String(targetId).replace(/^[TK]-/, "").trim() : "";
        const possibleTargetIds = targetId
            ? Array.from(new Set([
                String(targetId),
                cleanTargetId,
                `T-${cleanTargetId}`,
                `K-${cleanTargetId}`,
            ].filter(Boolean)))
            : [];
        const numTargetId = !isNaN(Number(cleanTargetId)) && cleanTargetId !== "" ? Number(cleanTargetId) : null;

        // Determine targeting model based on adType
        let targetModel = targetingSchema;
        if (adType === "SB") targetModel = sbTargetingSchema;
        if (adType === "SD") targetModel = sdTargetingSchema;

        // 1. Get current/latest targeting record
        let currentAcos = 0;
        let targetName = "";
        let targetMatchType = "";
        let targetCampaignName = "";
        try {
            const targetQuery = {
                ...(possibleTargetIds.length > 0 ? { targetId: { $in: possibleTargetIds } } : {}),
                ...(campaignId ? { campaignId: { $in: [numCampaignId, strCampaignId].filter(Boolean) } } : {}),
                ...(numProfileId ? { profileId: numProfileId } : {}),
            };
            const tRecord = await targetModel
                .findOne(targetQuery)
                .sort({ reportDate: -1, createdAt: -1 })
                .lean();

            if (tRecord) {
                targetName = tRecord.targeting || tRecord.keywordText || "";
                targetMatchType = tRecord.matchType || "";
                targetCampaignName = tRecord.campaignName || "";
                if (tRecord.acos !== undefined && tRecord.acos !== null && !isNaN(Number(tRecord.acos))) {
                    currentAcos = Number(tRecord.acos) || 0;
                } else if (Number(tRecord.sales) > 0 && Number(tRecord.spend) > 0) {
                    currentAcos = Number(((Number(tRecord.spend) / Number(tRecord.sales)) * 100).toFixed(2));
                }
            }
        } catch (e) {
            // ignore
        }

        // 2. Build indexed filters for parallel queries
        const historyFilter = {
            targetId: { $in: possibleTargetIds },
            ...(campaignId ? { campaignId: { $in: [strCampaignId, numCampaignId].filter(Boolean) } } : {}),
            ...(numProfileId ? { profileId: numProfileId } : {}),
        };

        const changeHistoryFilter = {
            ...(resolvedConfigId ? { configId: resolvedConfigId } : {}),
            ...(numProfileId ? { profileId: numProfileId } : {}),
            ...(numCampaignId ? { changeLevel: numCampaignId } : {}),
        };
        const orConditions = [];
        if (possibleTargetIds.length > 0) {
            orConditions.push({ targetId: { $in: possibleTargetIds } });
            if (numTargetId) {
                orConditions.push({ changeLevel: numTargetId });
            }
        }
        if (targetName) {
            orConditions.push({ targeting: targetName });
        }
        if (orConditions.length > 0) {
            changeHistoryFilter.$or = orConditions;
        }

        const ruleActionFilter = {
            amazonEntityId: { $in: possibleTargetIds.map(String) },
            ...(numProfileId ? { profileId: numProfileId } : {}),
            ...(resolvedConfigId ? { configId: resolvedConfigId } : {}),
        };

        const targetDailyFilter = {
            ...(possibleTargetIds.length > 0 || targetName ? {
                $or: [
                    ...(possibleTargetIds.length > 0 ? [{ targetId: { $in: possibleTargetIds } }] : []),
                    ...(targetName ? [{ targeting: targetName }] : []),
                ],
            } : {}),
            ...(campaignId ? { campaignId: { $in: [numCampaignId, strCampaignId].filter(Boolean) } } : {}),
            ...(numProfileId ? { profileId: { $in: [numProfileId, String(numProfileId)].filter(Boolean) } } : {}),
            ...(resolvedConfigId ? { configId: resolvedConfigId } : {}),
        };

        // 3. Execute all independent database queries concurrently via Promise.all
        const [profile, historyDocs, manualChanges, ruleActions, dailyStats] = await Promise.all([
            getProfile(configId, profileId).catch(() => null),
            targetingHistorySchema.find(historyFilter).sort({ last_updated_date_time: -1 }).lean().catch(() => []),
            campaignChangeHistorySchema.find(changeHistoryFilter).sort({ createdAt: -1 }).lean().catch(() => []),
            ruleActionExecutionSchema.find(ruleActionFilter).sort({ appliedAt: -1, createdAt: -1 }).lean().catch(() => []),
            targetModel.find(targetDailyFilter, { reportDate: 1, spend: 1, sales: 1 }).lean().catch(() => []),
        ]);

        const historyList = [];

        // Add entries from targetingHistory
        for (const doc of (historyDocs || [])) {
            const date = doc.last_updated_date_time || doc.creation_date_time || doc.createdAt;
            const itemAcos = doc.acos !== undefined && doc.acos !== null && !isNaN(Number(doc.acos)) && Number(doc.acos) > 0 ? Number(doc.acos) : currentAcos;
            const itemOldAcos = doc.oldAcos !== undefined && doc.oldAcos !== null && !isNaN(Number(doc.oldAcos)) ? Number(doc.oldAcos) : itemAcos;

            const bidVal = doc.bid !== undefined && doc.bid !== null ? Number(doc.bid) : 0;
            const oldBidVal = doc.oldBid !== undefined && doc.oldBid !== null && Number(doc.oldBid) !== bidVal ? Number(doc.oldBid) : null;

            let cSource = "Amazon";
            const srcLower = String(doc.source || "").toLowerCase();
            if (srcLower.includes("dayparting")) cSource = "Dayparting";
            else if (srcLower.includes("rule")) cSource = "Rule";
            else if (srcLower.includes("manual") || srcLower.includes("portal")) cSource = "Manual";

            let act = "Bid Updated";
            if (doc.state && (doc.state === "PAUSED" || doc.state === "ARCHIVED")) {
                act = `Status: ${doc.state.charAt(0) + doc.state.slice(1).toLowerCase()}`;
            } else if (oldBidVal !== null && oldBidVal !== undefined) {
                act = bidVal > oldBidVal ? "Bid Increased" : bidVal < oldBidVal ? "Bid Decreased" : "Bid Updated";
            }

            historyList.push({
                _id: doc._id,
                lastChangeDate: date,
                targeting: doc.targeting || targetName,
                matchType: doc.match_type || doc.matchType || targetMatchType,
                targetId: doc.targetId || doc.target_id || cleanTargetId,
                action: act,
                previousValue: oldBidVal !== null && oldBidVal !== undefined ? oldBidVal : "—",
                updatedValue: bidVal !== null && bidVal !== undefined ? bidVal : doc.state || "—",
                bidAmount: bidVal,
                oldBid: oldBidVal,
                changeSource: cSource,
                source: doc.source || "Amazon Marketing Stream",
                acos: itemAcos,
                oldAcos: itemOldAcos,
                state: doc.state,
                currencyCode: doc.currency_code || doc.currencyCode || "",
            });
        }

        // Add entries from campaignChangeHistory
        for (const mc of (manualChanges || [])) {
            const oldValNum = Number(String(mc.oldValue).replace(/[^0-9.-]/g, ""));
            const newValNum = Number(String(mc.newValue).replace(/[^0-9.-]/g, ""));
            const isOldNum = !isNaN(oldValNum) && mc.oldValue !== "" && mc.oldValue !== null;
            const isNewNum = !isNaN(newValNum) && mc.newValue !== "" && mc.newValue !== null;

            let cSource = "Manual";
            const rawSource = String(mc.source || mc.updatedFrom || mc.changeType || "").toLowerCase();
            if (rawSource.includes("dayparting")) cSource = "Dayparting";
            else if (rawSource.includes("rule")) cSource = "Rule";

            let act = mc.changeType || "Bid Updated";
            if (/pause/i.test(String(mc.newValue)) || /status.*pause/i.test(String(mc.changeType))) {
                act = "Status: Paused";
            } else if (/enable/i.test(String(mc.newValue)) || /status.*enable/i.test(String(mc.changeType))) {
                act = "Status: Enabled";
            } else if (isOldNum && isNewNum) {
                act = newValNum > oldValNum ? "Bid Increased" : newValNum < oldValNum ? "Bid Decreased" : "Bid Updated";
            }

            historyList.push({
                _id: mc._id,
                lastChangeDate: mc.createdAt,
                targeting: mc.targeting || targetName,
                matchType: mc.matchType || targetMatchType,
                targetId: mc.targetId || mc.changeLevel || cleanTargetId,
                action: act,
                previousValue: isOldNum ? oldValNum : (mc.oldValue || "—"),
                updatedValue: isNewNum ? newValNum : (mc.newValue || "—"),
                oldBid: isOldNum ? oldValNum : null,
                bidAmount: isNewNum ? newValNum : 0,
                changeSource: cSource,
                source: mc.changeType || mc.updatedFrom || mc.source || "Manual (Platform)",
                acos: currentAcos,
                oldAcos: currentAcos,
            });
        }

        // Add entries from ruleActions
        for (const ra of (ruleActions || [])) {
            const cSource = ra.ruleFamily === "dayparting-rules" ? "Dayparting" : "Rule";
            const oldNum = Number(ra.previousValue);
            const newNum = Number(ra.desiredValue);
            const isOldNum = !isNaN(oldNum) && ra.previousValue !== null;
            const isNewNum = !isNaN(newNum) && ra.desiredValue !== null;

            let act = "Bid Updated";
            if (ra.actionType === "STATUS_PAUSE") act = "Status: Paused";
            else if (ra.actionType === "STATUS_ENABLE") act = "Status: Enabled";
            else if (isOldNum && isNewNum) {
                act = newNum > oldNum ? "Bid Increased" : newNum < oldNum ? "Bid Decreased" : "Bid Updated";
            }

            historyList.push({
                _id: ra._id,
                lastChangeDate: ra.appliedAt || ra.startedAt || ra.createdAt,
                targeting: targetName,
                matchType: targetMatchType,
                targetId: ra.amazonEntityId || cleanTargetId,
                action: act,
                previousValue: isOldNum ? oldNum : (ra.previousValue || "—"),
                updatedValue: isNewNum ? newNum : (ra.desiredValue || "—"),
                oldBid: isOldNum ? oldNum : null,
                bidAmount: isNewNum ? newNum : 0,
                changeSource: cSource,
                source: ra.ruleFamily === "dayparting-rules" ? "Dayparting Strategy" : "Targeting Rule Execution",
                acos: currentAcos,
                oldAcos: currentAcos,
                state: ra.state,
            });
        }

        // Sort chronologically ascending to compute transitions and calculate metrics
        historyList.sort(
            (a, b) => new Date(a.lastChangeDate).getTime() - new Date(b.lastChangeDate).getTime()
        );

        const timezone = profile?.timezone || "UTC";
        const todayStr = moment().tz(timezone).format("YYYY-MM-DD");
        const globalFromDate = fromDate ? moment(fromDate).format("YYYY-MM-DD") : todayStr;
        const globalToDate = toDate ? moment(toDate).format("YYYY-MM-DD") : todayStr;

        // Filter consecutive redundant identical bids and reconcile transitions
        const filteredTransitions = [];
        let lastBid = null;

        for (let i = 0; i < historyList.length; i++) {
            const item = historyList[i];
            const currentBid = typeof item.bidAmount === "number" ? item.bidAmount : null;

            if (currentBid !== null && currentBid > 0) {
                if (lastBid !== null && currentBid === lastBid && item.changeSource === "Amazon") {
                    // Skip redundant Amazon Stream heartbeat snapshots with exact same bid
                    continue;
                }
                if (item.oldBid === null || item.previousValue === "—") {
                    item.oldBid = lastBid;
                    if (lastBid !== null) item.previousValue = lastBid;
                }
                if (item.oldBid !== null && item.action === "Bid Updated") {
                    item.action = currentBid > item.oldBid ? "Bid Increased" : currentBid < item.oldBid ? "Bid Decreased" : "Bid Updated";
                }
                lastBid = currentBid;
            }

            filteredTransitions.push(item);
        }

        const finalItems = filteredTransitions.length > 0 ? filteredTransitions : historyList;

        const lookbackNum = Number(acosLookbackDays) > 0 ? Number(acosLookbackDays) : 7;
        const isCustomRange = acosLookbackMode === "custom_range" && customAcosFromDate && customAcosToDate;

        // Calculate date-wise ACOS: spend / sales * 100 for each interval
        for (let i = 0; i < finalItems.length; i++) {
            const item = finalItems[i];
            let startDate = null;
            let endDate = null;

            if (isCustomRange) {
                startDate = moment(customAcosFromDate).format("YYYY-MM-DD");
                endDate = moment(customAcosToDate).format("YYYY-MM-DD");
            } else {
                const changeDateStr = item.lastChangeDate
                    ? moment(item.lastChangeDate).format("YYYY-MM-DD")
                    : todayStr;
                endDate = changeDateStr;
                startDate = moment(changeDateStr).subtract(lookbackNum, "days").format("YYYY-MM-DD");
            }

            if (moment(startDate).isAfter(moment(endDate))) {
                const temp = startDate;
                startDate = endDate;
                endDate = temp;
            }

            let totalSpend = 0;
            let totalSales = 0;

            if (dailyStats && dailyStats.length > 0) {
                for (const stat of dailyStats) {
                    if (stat.reportDate && stat.reportDate >= startDate && stat.reportDate <= endDate) {
                        totalSpend += Number(stat.spend) || 0;
                        totalSales += Number(stat.sales) || 0;
                    }
                }
            }

            const calculatedAcos = totalSales > 0 ? Number(((totalSpend / totalSales) * 100).toFixed(2)) : 0;
            item.oldAcos = calculatedAcos;
            item.acos = calculatedAcos;
            item.spend = Number(totalSpend.toFixed(2));
            item.sales = Number(totalSales.toFixed(2));
            item.acosDateRange = { startDate, endDate };
            item.dateRange = { startDate, endDate };
        }

        // Sort newest to oldest for presentation
        finalItems.sort(
            (a, b) => new Date(b.lastChangeDate).getTime() - new Date(a.lastChangeDate).getTime()
        );

        // Deduplicate identical timestamps / bids, prioritizing Manual/Rule/Dayparting over Amazon stream
        const uniqueHistory = [];
        const seen = new Set();
        for (const item of finalItems) {
            const dateKey = moment(item.lastChangeDate).isValid()
                ? moment(item.lastChangeDate).format("YYYY-MM-DD HH:mm")
                : String(item.lastChangeDate);
            const key = `${dateKey}_${item.updatedValue}_${item.action}`;
            if (!seen.has(key)) {
                seen.add(key);
                if (item.oldBid !== null && item.oldBid !== undefined && Number(item.oldBid) === Number(item.bidAmount)) {
                    item.oldBid = null;
                }
                uniqueHistory.push(item);
            }
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Targeting history fetched successfully",
            data: uniqueHistory,
            targetInfo: {
                targeting: targetName,
                matchType: targetMatchType,
                campaignName: targetCampaignName,
                targetId: cleanTargetId,
            },
        });
    } catch (error) {
        write_logs({
            message: `[getTargetingHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).send({
            isSuccess: false,
            message: "Failed to fetch targeting history",
            error: error?.message || "Internal server error",
        });
    }
};

/**
 * Reconciles and heals synthetic R- targeting records with their genuine Amazon T- IDs.
 * Uses batch index queries and MongoDB bulkWrite to handle large datasets efficiently.
 */
async function reconcileTargetingRRecordsForClauses({ configId, profileId, targetingClauses }) {
    if (!targetingClauses || !targetingClauses.length) return;

    try {
        const campaignIds = [...new Set(targetingClauses.map(c => c.campaignId))];
        const rDocs = await targetingSchema.find({
            configId,
            profileId,
            campaignId: { $in: campaignIds },
            targetId: { $regex: /^R-/ },
        }).lean();

        if (!rDocs.length) return;

        const clauseMap = new Map();
        for (const c of targetingClauses) {
            clauseMap.set(`${c.campaignId}:${c.adGroupId}:${c.targeting}`, c);
        }

        const candidateTargetIds = [...new Set(targetingClauses.map(c => c.targetId))];
        const rDates = [...new Set(rDocs.map(r => r.reportDate))];

        // Batch fetch all candidate T- documents in a single indexed query
        const existingTDocs = await targetingSchema.find({
            configId,
            profileId,
            campaignId: { $in: campaignIds },
            targetId: { $in: candidateTargetIds },
            reportDate: { $in: rDates },
        }).lean();

        const tDocMap = new Map();
        for (const t of existingTDocs) {
            tDocMap.set(`${t.campaignId}:${t.adGroupId}:${t.targetId}:${t.reportDate}`, t);
        }

        const bulkOps = [];
        const deleteIds = [];
        let healedCount = 0;
        let mergedCount = 0;

        for (const rDoc of rDocs) {
            const clause = clauseMap.get(`${rDoc.campaignId}:${rDoc.adGroupId}:${rDoc.targeting}`);
            if (!clause || !clause.targetId) continue;

            const realTargetId = clause.targetId;
            const tKey = `${rDoc.campaignId}:${rDoc.adGroupId}:${realTargetId}:${rDoc.reportDate}`;
            const existingTDoc = tDocMap.get(tKey);

            if (existingTDoc) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: existingTDoc._id },
                        update: {
                            $set: {
                                impressions: Math.max(existingTDoc.impressions || 0, rDoc.impressions || 0),
                                clicks: Math.max(existingTDoc.clicks || 0, rDoc.clicks || 0),
                                spend: Math.max(existingTDoc.spend || 0, rDoc.spend || 0),
                                sales: Math.max(existingTDoc.sales || 0, rDoc.sales || 0),
                                orders: Math.max(existingTDoc.orders || 0, rDoc.orders || 0),
                                acos: rDoc.acos || existingTDoc.acos || 0,
                                roas: rDoc.roas || existingTDoc.roas || 0,
                                cpc: rDoc.cpc || existingTDoc.cpc || 0,
                                ctr: rDoc.ctr || existingTDoc.ctr || 0,
                                cvr: rDoc.cvr || existingTDoc.cvr || 0,
                                conversionRate: rDoc.conversionRate || existingTDoc.conversionRate || 0,
                                topOfSearchImpressionShare: rDoc.topOfSearchImpressionShare || existingTDoc.topOfSearchImpressionShare,
                                status: clause.status || existingTDoc.status || rDoc.status,
                                keywordBid: clause.keywordBid ?? existingTDoc.keywordBid ?? rDoc.keywordBid,
                                matchType: clause.matchType || existingTDoc.matchType,
                                keywordType: clause.keywordType || existingTDoc.keywordType,
                            }
                        }
                    }
                });
                deleteIds.push(rDoc._id);
                mergedCount++;
            } else {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: rDoc._id },
                        update: {
                            $set: {
                                targetId: realTargetId,
                                status: clause.status || rDoc.status,
                                keywordBid: clause.keywordBid ?? rDoc.keywordBid,
                                matchType: clause.matchType || rDoc.matchType,
                                keywordType: clause.keywordType || rDoc.keywordType,
                            }
                        }
                    }
                });
                healedCount++;
            }
        }

        if (bulkOps.length) {
            await targetingSchema.bulkWrite(bulkOps, { ordered: false });
        }
        if (deleteIds.length) {
            await targetingSchema.deleteMany({ _id: { $in: deleteIds } });
        }

        if (healedCount > 0 || mergedCount > 0) {
            cron_logs({
                message: `[reconcileTargetingRRecords] Reconciled ${healedCount} R- docs to real T- IDs, merged and removed ${mergedCount} duplicate R- docs via bulk operations.`,
                log_type: "info"
            });
        }
    } catch (err) {
        cron_logs({
            message: `[reconcileTargetingRRecords] Warning: ${err.message}`,
            log_type: "warn"
        });
    }
}

/**
 * Reconciles all synthetic R- records for a given profile against known T- targets in MongoDB.
 * Optimized with campaign/adGroup batching and bulkWrite.
 */
exports.reconcileAllProfileTargetingRRecords = async ({ configId, profileId }) => {
    try {
        const resolvedConfig = configId && mongoose.Types.ObjectId.isValid(configId)
            ? new mongoose.Types.ObjectId(String(configId))
            : configId;
        const numProfileId = Number(profileId) || profileId;

        const rDocs = await targetingSchema.find({
            ...(resolvedConfig && { configId: resolvedConfig }),
            profileId: numProfileId,
            targetId: { $regex: /^R-/ },
        }).lean();

        if (!rDocs.length) return { success: true, healedCount: 0, mergedCount: 0 };

        const campaignIds = [...new Set(rDocs.map(r => r.campaignId))];
        const adGroupIds = [...new Set(rDocs.map(r => r.adGroupId))];
        const rDates = [...new Set(rDocs.map(r => r.reportDate))];

        // Preload genuine T- targets specifically for the affected campaigns and ad groups
        const tDocs = await targetingSchema.find({
            ...(resolvedConfig && { configId: resolvedConfig }),
            profileId: numProfileId,
            campaignId: { $in: campaignIds },
            adGroupId: { $in: adGroupIds },
            targetId: { $regex: /^T-/ },
        }).select("campaignId adGroupId targeting targetId status keywordBid matchType keywordType").lean();

        const targetMap = new Map();
        for (const t of tDocs) {
            if (t.campaignId && t.adGroupId && t.targeting && t.targetId) {
                const key = `${t.campaignId}:${t.adGroupId}:${t.targeting}`;
                if (!targetMap.has(key)) {
                    targetMap.set(key, t);
                }
            }
        }

        const candidateTargetIds = [...new Set([...targetMap.values()].map(t => t.targetId))];

        const existingTDocs = await targetingSchema.find({
            ...(resolvedConfig && { configId: resolvedConfig }),
            profileId: numProfileId,
            campaignId: { $in: campaignIds },
            targetId: { $in: candidateTargetIds },
            reportDate: { $in: rDates },
        }).lean();

        const tDocMap = new Map();
        for (const t of existingTDocs) {
            tDocMap.set(`${t.campaignId}:${t.adGroupId}:${t.targetId}:${t.reportDate}`, t);
        }

        const bulkOps = [];
        const deleteIds = [];
        let healedCount = 0;
        let mergedCount = 0;

        for (const rDoc of rDocs) {
            const key = `${rDoc.campaignId}:${rDoc.adGroupId}:${rDoc.targeting}`;
            const genuineTarget = targetMap.get(key);
            if (!genuineTarget || !genuineTarget.targetId) continue;

            const realTargetId = genuineTarget.targetId;
            const tKey = `${rDoc.campaignId}:${rDoc.adGroupId}:${realTargetId}:${rDoc.reportDate}`;
            const existingTDoc = tDocMap.get(tKey);

            if (existingTDoc) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: existingTDoc._id },
                        update: {
                            $set: {
                                impressions: Math.max(existingTDoc.impressions || 0, rDoc.impressions || 0),
                                clicks: Math.max(existingTDoc.clicks || 0, rDoc.clicks || 0),
                                spend: Math.max(existingTDoc.spend || 0, rDoc.spend || 0),
                                sales: Math.max(existingTDoc.sales || 0, rDoc.sales || 0),
                                orders: Math.max(existingTDoc.orders || 0, rDoc.orders || 0),
                                acos: rDoc.acos || existingTDoc.acos || 0,
                                roas: rDoc.roas || existingTDoc.roas || 0,
                                cpc: rDoc.cpc || existingTDoc.cpc || 0,
                                ctr: rDoc.ctr || existingTDoc.ctr || 0,
                                cvr: rDoc.cvr || existingTDoc.cvr || 0,
                                conversionRate: rDoc.conversionRate || existingTDoc.conversionRate || 0,
                                topOfSearchImpressionShare: rDoc.topOfSearchImpressionShare || existingTDoc.topOfSearchImpressionShare,
                                status: genuineTarget.status || existingTDoc.status || rDoc.status,
                                keywordBid: genuineTarget.keywordBid ?? existingTDoc.keywordBid ?? rDoc.keywordBid,
                                matchType: genuineTarget.matchType || existingTDoc.matchType,
                                keywordType: genuineTarget.keywordType || existingTDoc.keywordType,
                            }
                        }
                    }
                });
                deleteIds.push(rDoc._id);
                mergedCount++;
            } else {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: rDoc._id },
                        update: {
                            $set: {
                                targetId: realTargetId,
                                status: genuineTarget.status || rDoc.status,
                                keywordBid: genuineTarget.keywordBid ?? rDoc.keywordBid,
                                matchType: genuineTarget.matchType || rDoc.matchType,
                                keywordType: genuineTarget.keywordType || rDoc.keywordType,
                            }
                        }
                    }
                });
                healedCount++;
            }
        }

        if (bulkOps.length) {
            await targetingSchema.bulkWrite(bulkOps, { ordered: false });
        }
        if (deleteIds.length) {
            await targetingSchema.deleteMany({ _id: { $in: deleteIds } });
        }

        cron_logs({
            message: `[reconcileAllProfileTargetingRRecords] Profile ${numProfileId}: Reconciled ${healedCount} R- docs, merged ${mergedCount} duplicate R- docs via bulk operations.`,
            log_type: "info"
        });

        return { success: true, healedCount, mergedCount };
    } catch (err) {
        cron_logs({
            message: `[reconcileAllProfileTargetingRRecords] Error: ${err.message}`,
            log_type: "error"
        });
        return { success: false, error: err.message };
    }
};
