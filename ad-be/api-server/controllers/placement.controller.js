const { getConditionRows, captureManualSelection, prepareSnapshotBulkUpdates, updateSnapshotHistory } = require("../helpers/ruleConditionSnapshotHelper");
const { validateCampaignAssignment } = require("../helper/ruleCampaignAssignment");

const { sanitizeQueryObject } = require("../helper/sanitizeQuery");
const moment = require("moment-timezone");
const { retryWithBackoff } = require("../helper/retryHelper");
const crypto = require("crypto");

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const fs = require("fs");
const zlib = require("node:zlib");
const path = require("path");
const axios = require("axios");
const ExcelJS = require("exceljs");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");

const cronJobSchema = require("../models/cronJob.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const placementRulesSchema = require("../models/placementRules.model");
const profileSchema = require("../models/profiles.model");
const placementSchema = require("../models/placement.model");
// const campaignSchema = require("../models/campaign.model");
const { logAudit } = require("../helpers/auditHelper");
const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const reportsSchema = require("../models/report.model");
const placementRuleHistorySchema = require("../models/placementRuleHistory.model");
const affectedCampaignByRuleSchema = require("../models/affectedCampaignByRule.model");
const { recordRuleExecutionChange, enrichWithCampaignMetrics } = require("../helpers/ruleImpactMetricsHelper");
const campaignProductEligibleStatusByRuleSchema = require("../models/campaignProductEligibleStatusByRule.model");
const ruleRunHistorySchema = require("../models/ruleRunHistory.model");
const ruleBlockedTimeSchema = require("../models/ruleBlockedTime.model");

const campaignSchema = require("../models/campaign.model");
const sbCampaignSchema = require("../models/sbCampaign.model");
const sdCampaignSchema = require("../models/sdCampaign.model");

const sbPlacementSchema = require("../models/sbPlacement.model");
const sdPlacementSchema = require("../models/sdPlacement.model");
const { write_logs } = require("../../winston/placement/logger");

const {
  getAccessToken,
  getProfile,
  getRuleDate,
  unzipReport,
  calcMetrics,
  removeCampaignIdFromQuery,
  safeJSON,
  getActivePlanProfiles,
  downloadFile,
  parallelBulkWrite,
  buildFieldFilter,
  getRuleSettings,
  safeJsonParse,
  getAllowedSyncProfiles,
  validateReportFile,
  getAxiosErrorMessage,
} = require("../helper/common");

const { checkCampaignProductAvailability } = require("../helper/checkEligibility");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { isDuplicatePlacementRule, checkDuplicatePlacementRule } = require("../helper/ruleChecker");

const amazonAxios = require("../helper/amazonAxios");
const { processBatchUpdates } = require("../services/amazonBatchService");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { stageReportFileInRedis } = require("../services/reportFileStager.service");
const { processStagedReportBatches } = require("../services/reportBatchWriter.service");
const { getRunManifest } = require("../services/reportStaging.service");
const { linkReportHistory } = require("../services/reportHistoryCompletion.service");

exports.cronGeneratePlacementReport = async (generateWeeklyReport = false, generateBiWeeklyReport = false, pastSyncObj = null) => {
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
      : "Placement Report";

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
        message: `Cron Placement Report stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
        log_type: "warn"
      });
    }

    cron_logs({
      message: `[${cronName}] Cron started for ${getProfileId.length} profile(s). (Weekly: ${generateWeeklyReport}, BiWeekly: ${generateBiWeeklyReport}, Recurring: ${recurring})`,
      log_type: "info"
    });

    const reportPromises = getProfileId.map((profile) => limit(async () => {
      if (global.updateTaskProgress) global.updateTaskProgress(generateBiWeeklyReport ? "BiWeekly Report" : generateWeeklyReport ? "Weekly Report" : "Placement Report");
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

        await linkReportHistory({
          historyId: getCronData?._id || cronjobid,
          configId: profile.configId, profileId: profile.profileId,
          reportName: "PLACEMENTS", startDate, endDate,
        });

        // Update cron history based on report response
        if (reportSpResponse === "ERROR" || reportSbResponse === "ERROR") {
          if (recurring && getCronData?._id) {
            await cronJobHistorySchema.findByIdAndUpdate(
              getCronData._id,
              { status: "FAILED" },
              { new: true }
            );
          }
          return "ERROR";
        } else if (recurring && reportSpResponse === "COMPLETED" && reportSbResponse === "COMPLETED") {
          if (getCronData?._id) {
            await cronJobHistorySchema.findByIdAndUpdate(
              getCronData._id,
              { status: "COMPLETED" },
              { new: true }
            );
          }
          return "COMPLETED";
        }

        if (!recurring && cronjobid && reportSpResponse == "COMPLETED" && reportSbResponse == "COMPLETED") {
          await cronJobHistorySchema.findByIdAndUpdate(
            cronjobid,
            { status: "COMPLETED" },
            { new: true },
          );
          return "COMPLETED";
        }

        return reportSpResponse;

      } else {
        return cron_logs({
          message: `[${cronName}] Profile ${profile.name} (${profile.profileId}): Account credentials invalid or disconnected.`,
          log_type: "info"
        });
      }
    }))

    await Promise.all(reportPromises);

    return cron_logs({
      message: `[${cronName}] Cron finished successfully for ${getProfileId.length} profile(s).`,
      log_type: "info"
    });

  } catch (error) {
    return cron_logs({
      message: `[Placement Report] Error during cron execution: ${error.stack || error.message || error}`,
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
  const getAccount = await getProfile(configId, profileId);

  let existing;
  if (!recurring) {
    existing = await reportsSchema.findOne({
      startDate,
      endDate,
      profileId,
      configId,
      reportTypeId: "spCampaigns",
      reportName: "PLACEMENTS",
    }).lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
  } else {
    // 1️⃣ Check recent pending report (created within last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    existing = await reportsSchema.findOne({
      profileId,
      configId,
      reportTypeId: "spCampaigns",
      reportName: "PLACEMENTS",
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
      const unitsCol = isVendor ? "unitsSoldClicks14d" : "unitsSoldClicks7d";
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
            groupBy: ["campaign", "campaignPlacement"],
            columns: [
              "campaignId",
              "campaignName",
              "campaignStatus",
              "campaignBudgetAmount",
              "campaignBudgetType",
              "impressions",
              "clicks",
              "cost",
              purchasesCol,
              unitsCol,
              salesCol,
              "campaignBiddingStrategy",
              "costPerClick",
              "clickThroughRate",
              "spend",
              "placementClassification",
              "date"
            ],
            reportTypeId: "spCampaigns",
            timeUnit: "DAILY",
            format: "GZIP_JSON",
          },
        },
        meta: { configId, tokenKey: "adsAccessToken" },
      }));
    } catch (createErr) {
      cron_logs({
        message: `[Placement Report SP] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(createErr)}`,
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
      reportName: "PLACEMENTS",
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
  const zipPath = path.resolve(__dirname, "../../uploads/placements/sp-report", `${existing.reportId}.gz.json`);
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  const check = validateReportFile(extractionPath);
  if (!check.isValid) {
    cron_logs({
      message: `[Placement Report SP] Skipping profile ${profileId} because report JSON is invalid: ${check.reason}`,
      log_type: "warn"
    });
    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
    return "FAILED";
  }

  await stagePlacementReport({
    entity: "placement", existing, extractionPath, profileId, configId,
    accountType: getAccount?.type, startDate, endDate,
  });
  return "STAGED";

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
  const getAccount = await getProfile(configId, profileId);

  let existing;
  if (!recurring) {
    existing = await reportsSchema.findOne({
      startDate,
      endDate,
      profileId,
      configId,
      reportTypeId: "sbCampaignPlacement",
      reportName: "PLACEMENTS",
    }).lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
  } else {
    // 1️⃣ Check recent pending report (created within last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    existing = await reportsSchema.findOne({
      profileId,
      configId,
      reportTypeId: "sbCampaignPlacement",
      reportName: "PLACEMENTS",
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
            groupBy: ["campaignPlacement"],
            columns: [
              "campaignId",
              "campaignName",
              "campaignStatus",
              "campaignBudgetAmount",
              "campaignBudgetType",
              "impressions",
              "clicks",
              "cost",
              "purchases",
              "unitsSoldClicks",
              "sales",
              // "campaignBiddingStrategy",
              "placementClassification",
              "date"
            ],
            reportTypeId: "sbCampaignPlacement",
            timeUnit: "DAILY",
            format: "GZIP_JSON",
          },
        },
        meta: { configId, tokenKey: "adsAccessToken" },
      }));
    } catch (createErr) {
      cron_logs({
        message: `[Placement Report SB] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(createErr)}`,
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
      reportName: "PLACEMENTS",
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
  const zipPath = path.resolve(__dirname, "../../uploads/placements/sb-report", `${existing.reportId}.gz.json`);
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  const check = validateReportFile(extractionPath);
  if (!check.isValid) {
    cron_logs({
      message: `[Placement Report SB] Skipping profile ${profileId} because report JSON is invalid: ${check.reason}`,
      log_type: "warn"
    });
    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
    return "FAILED";
  }

  await stagePlacementReport({
    entity: "sbPlacement", existing, extractionPath, profileId, configId,
    accountType: getAccount?.type, startDate, endDate,
  });
  return "STAGED";

};

const stagePlacementReport = async ({
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
        message: `[Placement Report ${entity}] Background batch writer failed: ${err.message}`,
        log_type: "error",
      });
    });
  } catch (err) {
    cron_logs({
      message: `[Placement Report ${entity}] Staging failed for ${existing.reportId}: ${err.message}`,
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

      let placementName = "";
      if (
        value.placementClassification == "Other on-Amazon" ||
        value.placementClassification == "Other Placements"
      ) {
        placementName = "Rest of Search";
      } else if (
        value.placementClassification == "Detail Page on-Amazon"
      ) {
        placementName = "Product pages";
      } else if (
        value.placementClassification == "Top of Search on-Amazon" ||
        value.placementClassification == "Top of Search"
      ) {
        placementName = "Top of Search";
      }

      let campaignBiddingStrategy = "";
      if (value.campaignBiddingStrategy === "legacy" || value.campaignBiddingStrategy === "LEGACY_FOR_SALES") {
        campaignBiddingStrategy = "Dynamic bids - down only";
      } else if (value.campaignBiddingStrategy === "optimizeForSales" || value.campaignBiddingStrategy === "AUTO_FOR_SALES") {
        campaignBiddingStrategy = "Dynamic bids - up and down";
      } else if (value.campaignBiddingStrategy === "manual" || value.campaignBiddingStrategy === "MANUAL") {
        campaignBiddingStrategy = "Fixed bid";
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
            placement: placementName,
            reportDate: value.date,
          },
          update: {
            $set: {
              impressions: value.impressions,
              clicks: value.clicks,
              sales: value.sales7d || value.sales || 0,
              spend: value.spend || value.cost || 0,
              orders: value.purchases7d || value.purchases || 0,

              units: value.unitsSoldClicks7d || value.unitsSoldClicks || 0,
              biddingStartegy: campaignBiddingStrategy,

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

exports.manualGenerateReport = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Placement Report",
      isActive: false,
    }).lean();
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your Placement report status is deactive.`,
        isSuccess: false,
      });
    }
    if (!profileId || !cronId) {
      return res.status(203).send({
        isSuccess: false,
        message: "Profile id and cron id required!",
      });
    }
    const getCron = await cronJobSchema.findById(cronId).lean();
    if (!getCron) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Cron id not found!" });
    }
    if (!(getCron.cronName == "Placement Report")) {
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
        cronName: "Placement Report",
        status: "PENDING",
        historyDate: startDate,
      }).lean();
      if (!getCronData) {
        const createCronHistory = new cronJobHistorySchema({
          configId: profile.configId,
          profileId: profile.profileId,
          cronName: "Placement Report",
          status: "PENDING",
          historyDate: startDate,
        });
        await createCronHistory.save();
      }
      let responseSPStatus = "PENDING";
      let responseSBStatus = "IN_PROGRESS";
      while (responseSPStatus != "COMPLETED" || responseSBStatus != "SUCCESS") {
        if (responseSPStatus != "COMPLETED" && responseSPStatus != "ERROR") {
          const reportSpResponse = await spGenerateReport(
            profile.profileId,
            startDate,
            endDate,
            checkConfigAds,
            profile.configId,
            profile.timezone,
            profile.currencyCode
          );
          console.log("SP", reportSpResponse);
          responseSPStatus = reportSpResponse;
        }
        if (responseSBStatus != "SUCCESS" && responseSBStatus != "ERROR") {
          const reportSbResponse = await sbGenerateReport(
            profile.profileId,
            startDate,
            endDate,
            checkConfigAds,
            profile.configId,
            profile.timezone,
            profile.currencyCode
          );
          console.log("SB", reportSbResponse);
          responseSBStatus = reportSbResponse;
        }
        if (responseSPStatus != "COMPLETED" || responseSBStatus != "SUCCESS") {
          if (responseSPStatus != "ERROR" || responseSBStatus != "ERROR") {
            await new Promise((resolve) => setTimeout(resolve, 60000));
          }
        }
      }
      const getUpdateCronData = await cronJobHistorySchema.findOne({
        configId: configId,
        profileId: profileId,
        cronName: "Placement Report",
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
        message: "Placements Report updated successfully..",
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

const createHistory = async (campaignIds, placement, newValue, configId, profileId, userId, type) => {
  const findCampaings = await placementSchema?.find({
    campaignId: { $in: campaignIds },
    reportDate: moment().format("YYYY-MM-DD"),
    placement,
  })

  await Promise.all(
    findCampaings?.map(async (camp) => {
      if (camp?.placementModifier === newValue) return;

      const existingChange = await campaignChangeHistorySchema?.findOne({
        configId,
        profileId,
        changeLevel: camp?.campaignId,
        changeType: `Update ${placement} Placement Bid`,
        newValue,
        createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
      }).lean();

      if (!existingChange) {
        await campaignChangeHistorySchema?.create({
          configId,
          profileId,
          changeLevel: camp?.campaignId,
          changeType: `Update ${placement} Placement Bid`,
          oldValue: camp?.placementModifier,
          newValue,
          updatedFrom: "Placement",
          source: "MANUAL",
          userId,
          type: type || "SP"
        });
      }
    })
  )
}

exports.updatePlacementBid = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const userId = req?.user?._id || req?.user?.id;
    const { profileId, campaignIds, topOfSearchBid, restOfSearchBid, productPageBid } = req.body;

    const profile = await getProfile(configId, profileId);
    if (!profile) {
      return res.status(203).send({ isSuccess: false, message: "Profile not found." });
    }

    const checkConfigAds = await getAccessToken(configId);
    if (!checkConfigAds || !checkConfigAds.adsAccessToken) {
      return res.status(203).send({
        message: "Account disconnected in placement update.",
        isSuccess: false,
      });
    }

    const bodyData = {
      campaigns: campaignIds.map(id => ({ campaignId: String(id) }))
    };

    bodyData.campaigns.forEach(cp => {
      const dynamicBidding = {};
      let placementBidding = [];
      if (topOfSearchBid !== undefined && topOfSearchBid !== null && topOfSearchBid !== "") {
        placementBidding.push({
          percentage: parseFloat(topOfSearchBid),
          placement: "PLACEMENT_TOP",
        });
      }
      if (restOfSearchBid !== undefined && restOfSearchBid !== null && restOfSearchBid !== "") {
        placementBidding.push({
          percentage: parseFloat(restOfSearchBid),
          placement: "PLACEMENT_REST_OF_SEARCH",
        });
      }
      if (productPageBid !== undefined && productPageBid !== null && productPageBid !== "") {
        placementBidding.push({
          percentage: parseFloat(productPageBid),
          placement: "PLACEMENT_PRODUCT_PAGE",
        });
      }
      dynamicBidding.placementBidding = placementBidding;
      cp.dynamicBidding = dynamicBidding;
    });

    const campaignPUTOptions = {
      method: "PUT",
      maxBodyLength: Infinity,
      url: `${profile.amazonUrl}/sp/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": String(profileId),
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Accept": "application/vnd.spCampaign.v3+json",
        "Content-Type": "application/vnd.spCampaign.v3+json",
      },
      data: JSON.stringify(bodyData),
    };

    let response;
    try {
      response = await axios(campaignPUTOptions);
    } catch (err) {
      const amazonErrorMsg = err.response?.data?.message || err.response?.data?.details || err.message;
      write_logs({
        message: `[updatePlacementBid Amazon Error] Config:${configId} Profile:${profileId} Error: ${amazonErrorMsg} [body] ${JSON.stringify(req?.body)}`,
        log_type: "error",
      });
      return res.status(203).send({
        isSuccess: false,
        message: amazonErrorMsg ? `Amazon Error: ${amazonErrorMsg}` : "Failed to update placement bids on Amazon",
        error: err.response?.data || err.message,
      });
    }

    if (response?.status === 207 || (response?.status >= 200 && response?.status < 300)) {
      if (topOfSearchBid !== undefined && topOfSearchBid !== null && topOfSearchBid !== "") {
        await createHistory(campaignIds, "Top of Search", topOfSearchBid, configId, profileId, userId);
        await placementSchema.updateMany(
          {
            campaignId: { $in: campaignIds },
            placement: "Top of Search"
          },
          {
            $set: { placementModifier: topOfSearchBid }
          }
        );
      }
      if (productPageBid !== undefined && productPageBid !== null && productPageBid !== "") {
        await createHistory(campaignIds, "Product pages", productPageBid, configId, profileId, userId);
        await placementSchema.updateMany(
          {
            campaignId: { $in: campaignIds },
            placement: "Product pages"
          },
          {
            $set: { placementModifier: productPageBid }
          }
        );
      }
      if (restOfSearchBid !== undefined && restOfSearchBid !== null && restOfSearchBid !== "") {
        await createHistory(campaignIds, "Rest of Search", restOfSearchBid, configId, profileId, userId);
        await placementSchema.updateMany(
          {
            campaignId: { $in: campaignIds },
            placement: "Rest of Search"
          },
          {
            $set: { placementModifier: restOfSearchBid }
          }
        );
      }
    }

    return res.status(200).send({
      message: "Placements Bid updated successfully..",
      isSuccess: true,
    });

  } catch (error) {
    write_logs({ message: `[updatePlacementBid Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: error?.message || "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.updatePlacementBidInDB = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, placements } = req.body;

    if (!profileId || !placements || !Array.isArray(placements) || placements.length === 0) {
      return res.status(203).send({
        isSuccess: false,
        message: "profileId and placements array are required!",
      });
    }

    // For each placement entry, update relevant placement documents in DB.
    // Use Promise.all to run updates in parallel.
    const updatePromises = placements.map((p) => {
      const campaignId = p.campaignId;
      // Build robust query to match numeric or string stored campaignId and filter by profile/user
      const campaignQuery = {
        $and: [
          { $or: [{ campaignId }, { campaignId: String(campaignId) }] },
          { profileId },
          { configId },
        ],
      };

      const singlePlacementPromises = [];

      if (p.topOfSearchBid !== undefined && p.topOfSearchBid !== null) {
        singlePlacementPromises.push(
          placementSchema.updateMany(
            { ...campaignQuery, placement: "Top of Search" },
            { $set: { placementModifier: p.topOfSearchBid } }
          )
        );
      }

      if (p.restOfSearchBid !== undefined && p.restOfSearchBid !== null) {
        singlePlacementPromises.push(
          placementSchema.updateMany(
            { ...campaignQuery, placement: "Rest of Search" },
            { $set: { placementModifier: p.restOfSearchBid } }
          )
        );
      }

      if (p.productPageBid !== undefined && p.productPageBid !== null) {
        singlePlacementPromises.push(
          placementSchema.updateMany(
            { ...campaignQuery, placement: "Product pages" },
            { $set: { placementModifier: p.productPageBid } }
          )
        );
      }

      // If no bids present for this entry, resolve immediately
      if (singlePlacementPromises.length === 0) return Promise.resolve(null);

      return Promise.all(singlePlacementPromises);
    });

    await Promise.all(updatePromises);

    return res.status(200).send({
      message: "Placements Bid updated successfully..",
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[updatePlacementBidInDB Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.updatePlacementBidApplyInAmazon = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const userId = req.user._id;
    const { profileId, placements } = req.body;

    if (!profileId || !placements || !Array.isArray(placements) || placements.length === 0) {
      return res.status(203).send({
        isSuccess: false,
        message: "profileId and placements array are required!",
      });
    }

    // find profile and auth
    const profile = await getProfile(configId, profileId);
    if (!profile) {
      return res.status(203).send({ isSuccess: false, message: "Profile not found." });
    }

    const checkConfigAds = await getAccessToken(configId);
    if (!checkConfigAds || !checkConfigAds.adsAccessToken) {
      return res.status(203).send({
        message: "Account disconnected in placement apply.",
        isSuccess: false,
      });
    }

    // build campaigns payload for Amazon API
    const campaigns = placements.map((p) => {
      const cp = { campaignId: String(p.campaignId) };
      const placementBidding = [];

      if (p.topOfSearchBid !== undefined && p.topOfSearchBid !== null) {
        placementBidding.push({
          percentage: parseFloat(p.topOfSearchBid),
          placement: "PLACEMENT_TOP",
        });
      }
      if (p.restOfSearchBid !== undefined && p.restOfSearchBid !== null) {
        placementBidding.push({
          percentage: parseFloat(p.restOfSearchBid),
          placement: "PLACEMENT_REST_OF_SEARCH",
        });
      }
      if (p.productPageBid !== undefined && p.productPageBid !== null) {
        placementBidding.push({
          percentage: parseFloat(p.productPageBid),
          placement: "PLACEMENT_PRODUCT_PAGE",
        });
      }

      if (placementBidding.length > 0) {
        cp.dynamicBidding = {
          placementBidding,
        };
      }

      return cp;
    }).filter(cp => cp.dynamicBidding && cp.dynamicBidding.placementBidding.length > 0);

    if (campaigns.length === 0) {
      return res.status(203).send({
        isSuccess: false,
        message: "No placement bids to apply to Amazon.",
      });
    }

    const campaignPUTOptions = {
      method: "PUT",
      maxBodyLength: Infinity,
      url: `${profile.amazonUrl}/sp/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.spCampaign.v3+json",
        "Content-Type": "application/vnd.spCampaign.v3+json",
      },
      data: { campaigns },
    };

    // call Amazon API
    let amazonResponse;
    try {
      amazonResponse = await axios(campaignPUTOptions);
    } catch (err) {
      write_logs({
        message: `ApplyInAmazon err Config ID:${configId} ProfileID:${profileId} Error: ${err}`,
        log_type: "error",
      });
      return res.status(203).send({
        isSuccess: false,
        message: "Failed to apply placement bids to Amazon.",
        error: err.response?.data || err.message,
      });
    }

    if (!(amazonResponse.status >= 200 && amazonResponse.status < 300)) {
      return res.status(203).send({
        isSuccess: false,
        message: "Amazon responded with an error while applying bids.",
        error: amazonResponse.data,
      });
    }

    // update DB placements — run parallel updates
    const updatePromises = placements.map(async (p) => {
      const campaignId = p.campaignId;
      const campaignQuery = {
        $and: [
          { $or: [{ campaignId }, { campaignId: String(campaignId) }] },
          { profileId },
          { configId },
        ],
      };

      const singlePlacementPromises = [];

      if (p.topOfSearchBid !== undefined && p.topOfSearchBid !== null) {
        await createHistory([campaignId], "Top of Search", p?.topOfSearchBid, configId, profileId, userId)
        singlePlacementPromises.push(
          placementSchema.updateMany(
            { ...campaignQuery, placement: "Top of Search" },
            { $set: { placementModifier: p.topOfSearchBid } }
          )
        );
      }
      if (p.restOfSearchBid !== undefined && p.restOfSearchBid !== null) {
        await createHistory([campaignId], "Rest of Search", p?.restOfSearchBid, configId, profileId, userId)
        singlePlacementPromises.push(
          placementSchema.updateMany(
            { ...campaignQuery, placement: "Rest of Search" },
            { $set: { placementModifier: p.restOfSearchBid } }
          )
        );
      }
      if (p.productPageBid !== undefined && p.productPageBid !== null) {
        await createHistory([campaignId], "Product pages", p?.productPageBid, configId, profileId, userId)
        singlePlacementPromises.push(
          placementSchema.updateMany(
            { ...campaignQuery, placement: "Product pages" },
            { $set: { placementModifier: p.productPageBid } }
          )
        );
      }

      if (singlePlacementPromises.length === 0) return Promise.resolve(null);
      return Promise.all(singlePlacementPromises);
    });

    await Promise.all(updatePromises);

    return res.status(200).send({
      message: "Placements bids applied in Amazon and updated in DB successfully.",
      isSuccess: true,
      amazonResponse: amazonResponse.data,
    });
  } catch (error) {
      write_logs({ message: `[updatePlacementBidApplyInAmazon Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.createRule = async (req, res) => {
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
    campaignIds,
    isHourlyBid,
    hourlyConfig,
  } = req.body;
  try {
    const assignment = validateCampaignAssignment(req.body.campaignIds);
    if (assignment.error) return res.status(400).send({ isSuccess: false, message: assignment.error });

    const getAccount = await getProfile(configId, profileId);
    if (!getAccount) {
      return res.status(203).send({ message: "Please select valid account!", isSuccess: false });
    }

    // const duplicationRule = await isDuplicatePlacementRule(configId, userId, profileId, conditions);
    // if (duplicationRule) {
    //   return res.status(203).send({
    //     isSuccess: false,
    //     message: "A rule with the same conditions already exists. Please modify the conditions to create a new rule.",
    //   });
    // }

    const createRule = await placementRulesSchema({
      configId,
      userId,
      profileId,
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
      isDaysSinceCreation,
      isHourlyBid,
      hourlyConfig,
      query,
      reportDate,
      toDate,
      campaignIds: assignment.campaignIds,
      countryCode: getAccount.countryCode,
      timezone: getAccount.timezone,
    });
    createRule
      .save()
      .then(async (rule) => {
        await logAudit("PLACEMENT_RULE_CREATION", `Created placement rule: ${rule.ruleName}`, {
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
        }, req?.user?.id);
        return res.status(200).send({
          isSuccess: true,
          message: "Placement Rule created successfully.",
          data: rule,
        });
      })
      .catch((error) => {
          write_logs({ message: `[createRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          message: "Something went wrong, please try again!",
          isSuccess: false,
          error: "An internal server error occurred",
        });
      });
  } catch (error) {
      write_logs({ message: `[createRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.updateRule = async (req, res) => {
  const ruleId = req.params.ruleId;
  const configId = req?.config?.configId;
  const userId = req.user._id;
  const { profileId, conditions } = req.body;

  try {
    // const duplicationRule = await isDuplicatePlacementRule(configId, userId, profileId, conditions, ruleId);
    // if (duplicationRule) {
    //   return res.status(203).send({
    //     isSuccess: false,
    //     message: "A rule with the same conditions already exists. Please modify the conditions to update the rule.",
    //   });
    // }

    const updateData = { ...req.body };
    delete updateData.userId;
    delete updateData.configId;
    delete updateData.profileId;
    delete updateData._id;
    delete updateData.isActive;

    await placementRulesSchema
      .findOneAndUpdate({ _id: ruleId, ...(configId && { configId }) }, updateData, { new: true })
      .then(async (rule) => {
        if (!rule) {
          return res
            .status(203)
            .send({ message: "Rule not found!", isSuccess: false });
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

        await logAudit("PLACEMENT_RULE_UPDATE", `Updated placement rule: ${rule.ruleName}`, {
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
          campaigns,
        }, req?.user?.id);
        return res.status(200).send({
          message: "Rule updated successfully.",
          isSuccess: true,
        });
      })
      .catch((error) => {
          write_logs({ message: `[updateRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[updateRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.changeStatus = async (req, res) => {
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
    const result = await placementRulesSchema.updateMany(
      { _id: { $in: ids }, ...(configId && { configId }) },
      { $set: { isActive: isActive } }
    );

    const updatedRules = await placementRulesSchema.find({ _id: { $in: ids }, ...(configId && { configId }) }, "ruleName");
    const ruleNames = updatedRules.map(r => r.ruleName).join(", ");

    await logAudit("PLACEMENT_RULE_STATUS_CHANGE", `Placement rules ${ruleNames} ${isActive ? "enabled" : "disabled"}`, {
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
      write_logs({ message: `[changeStatus Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const ruleId = req.params.ruleId;
    await placementRulesSchema
      .findOneAndDelete({ _id: ruleId, ...(configId && { configId }) })
      .then(async (rule) => {
        if (!rule) {
          return res
            .status(203)
            .send({ message: "Rule not found!", isSuccess: false });
        }
        await logAudit("PLACEMENT_RULE_DELETION", `Deleted placement rule: ${rule?.ruleName}`, {
          ruleName: rule?.ruleName,
        }, req?.user?.id);
        return res
          .status(200)
          .send({ message: "Rule deleted successfully.", isSuccess: true });
      })
      .catch((error) => {
          write_logs({ message: `[deleteRule Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[deleteRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getPlacementRules = async (req, res) => {
  const configId = req?.config?.configId;
  const userId = req.user._id;
  const profileId = req.body.profileId;
  const pageNo = req.body.pageNo ? req.body.pageNo : 1;
  const perPage = req.body.perPage ? req.body.perPage : 10;
  try {

    const pipeline = [
      {
        $match: {
          configId,
          profileId,
          // userId
        }
      },
      {
        $lookup: {
          from: "placementrulehistories",
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
          },
          ruleDate: {
            $arrayElemAt: [
              {
                $slice: [
                  {
                    $reverseArray:
                      "$histories.ruleDate"
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
          allRulesSchedule: [{ $project: { _id: 1, ruleName: 1, days: 1, times: 1, campaignIds: 1, isActive: 1, actionType: 1, conditions: 1, isHourlyChanges: 1, hourlyConfig: 1 } }],
        }
      }
    ];

    const result = await placementRulesSchema.aggregate(pipeline)
    const getRules = result[0].data;
    const totalRecords = result[0].totalCount[0]?.count || 0;
    const allRulesSchedule = result[0].allRulesSchedule || [];
    const adminBlockedSchedule = await ruleBlockedTimeSchema.find().lean();

    return res.status(200).send({
      isSuccess: true,
      message: "Placement Rules listing successfully",
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      data: getRules,
      allRulesSchedule,
      adminBlockedSchedule,
    });
  } catch (error) {
      write_logs({ message: `[getPlacementRules Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getRule = async (req, res) => {
  const configId = req?.config?.configId;
  const _id = req.params.ruleId;
  try {
    const getRule = await placementRulesSchema.findOne({ _id, ...(configId && { configId }) }).lean();
    return res.status(200).send({
      message: "Get Rule successfully",
      data: getRule,
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[getRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};


exports.placamentPipeline = (query, lastDate, adType = "SP") => {
  const commonPipeline = [
    { $match: query },
    {
      $group: {
        _id: {
          campaignId: "$campaignId",
          placement: "$placement",
          profileId: "$profileId",
        },
        impressions: { $sum: "$impressions" },
        clicks: { $sum: "$clicks" },
        orders: { $sum: "$orders" },
        spend: { $sum: "$spend" },
        sales: { $sum: "$sales" },
        placementModifier: { $last: "$placementModifier" },
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
      $project: {
        campaignId: "$_id.campaignId",
        placement: "$_id.placement",
        impressions: 1,
        clicks: 1,
        orders: 1,
        spend: 1,
        sales: 1,
        placementModifier: 1,
        campaignName: "$campaign.name",
        campaignStatus: "$campaign.status",
        budget: "$campaign.budget",
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
        },
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
        ctr: {
          $cond: [
            { $gt: ["$impressions", 0] },
            { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] },
            0
          ]
        },
        cpc: {
          $cond: [
            { $gt: ["$clicks", 0] },
            { $round: [{ $divide: ["$spend", "$clicks"] }, 2] },
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

const createBidHistory = async (campaignId, placement, newValue, configId, profileId, title, userId, type, explicitSource) => {

  const getPlacementSchema = type === "SB" ? sbPlacementSchema : placementSchema;
  const profile = await getProfile(configId, profileId);
  const timezone = profile.timezone;
  const reportDate = moment(new Date()).tz(timezone).format("YYYY-MM-DD");

  const findPlacement = await getPlacementSchema?.findOne({
    campaignId,
    profileId,
    placement,
    reportDate
  })

  if (findPlacement) {
    if (findPlacement?.placementModifier === newValue) return
    const computedSource = explicitSource || (/dayparting/i.test(title) ? "DAYPARTING" : "RULE");
    await campaignChangeHistorySchema?.create({
      configId,
      profileId,
      changeLevel: findPlacement?.campaignId,
      changeType: title,
      oldValue: findPlacement?.placementModifier,
      newValue,
      updatedFrom: "Placement",
      source: computedSource,
      userId,
      type: type || "SP"
    })
  }
}

exports.executePlacementRulesForProfile = async (profile, scheduledFor = new Date()) => {
  const isQueue = process.env.AUTOMATION_EXECUTION_MODE === "queue";
  const now = moment(scheduledFor).tz(profile.timezone);
  const currentDate = now.format("YYYY-MM-DD");
  const currentTime = now.format("HH:mm");
  const currentDay = now.format("dddd");

  /** ---------------- Active Rules ---------------- */
  const rules = await placementRulesSchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    isActive: true,
    $or: [
      { times: { $ne: [] } },
      { isHourlyBid: true }
    ],
    ...(!isQueue && { isRunning: false })
  }).lean();

  const todayHistory = await ruleRunHistorySchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    ruleDate: currentDate,
    ruleSchema: "PlacementRule",
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
      const activeSlot = (rule.hourlyConfig?.slots || []).find(s => {
        const startHour = parseInt(s.startTime?.split(":")[0], 10);
        const endHour = parseInt(s.endTime?.split(":")[0], 10);
        if (endHour === 0) return nowHour >= startHour && nowHour < 24;
        return nowHour >= startHour && nowHour < endHour;
      });

      if (activeSlot && activeSlot.enabled) {
        const historyKey = `${rule._id.toString()}_${activeSlot.startTime}`;
        const alreadyExecuted = executedMap.has(historyKey);

        if (!alreadyExecuted) {
          const hourlyRule = { ...rule };
          if (activeSlot.actions && activeSlot.actions.length > 0) {
            hourlyRule.actionType = activeSlot.actions;
          }

          finalRulesToRun.push({
            rule: hourlyRule,
            scheduledTime: activeSlot.startTime
          });

          if (!isQueue) {
            await placementRulesSchema.findByIdAndUpdate(
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

        const lastRun = await placementRuleHistorySchema.findOne({ configId: rule?.configId, profileId: rule?.profileId, ruleId: rule?._id }).lean().sort({ ruleDate: -1 });
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
            await placementRulesSchema.findByIdAndUpdate(
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
    message: `executePlacementRulesForProfile, Total Active Rules: ${finalRulesToRun.length} for profile ${profile.name}`,
    log_type: "info",
  });

  if (finalRulesToRun.length > 0) {
    try {
      if (global.updateTaskProgress) global.updateTaskProgress("PlacementRuleSchedules");
      const checkConfigAds = await getAccessToken(profile?.configId);
      if (!checkConfigAds?.adsAccessToken) return { success: false, reason: "ACCOUNT_DISCONNECTED" };

      const spStatus = await runSponsoredProductRule(finalRulesToRun, checkConfigAds, profile, currentDate, currentTime);
      const sbStatus = await runSponsoredBrandRule(finalRulesToRun, checkConfigAds, profile, currentDate, currentTime);

      if (!spStatus || !sbStatus) {
        throw new Error("Something went wrong during placement rule execution");
      }

      cron_logs({
        message: `ProfileId: ${profile.name}, Placement rule run successfully`,
        log_type: "info",
      });
    } catch (err) {
      cron_logs({
        message: `ProfileId: ${profile.name}, Placement rule error: ${err.message}`,
        log_type: "error",
      });
      throw err;
    } finally {
      if (!isQueue) {
        const ruleIds = finalRulesToRun.map(f => f.rule._id);
        await placementRulesSchema.updateMany(
          { _id: { $in: ruleIds } },
          { $set: { isRunning: false } }
        );
      }
    }
  }

  return {
    success: true,
    totalRulesEvaluated: rules.length,
    finalRulesToRunCount: finalRulesToRun.length,
  };
};

exports.CronPlacementRule = async (req, res) => {
  cron_logs({
    message: `CronPlacementRule`,
    log_type: "info",
  });
  try {
    /** ---------------- Profiles ---------------- */
    const profiles = await getActivePlanProfiles();
    if (!profiles?.length) return;

    await Promise.all(
      profiles.map((profile) =>
        limit(async () => {
          try {
            await exports.executePlacementRulesForProfile(profile);
          } catch (err) {
            cron_logs({
              message: `ProfileId: ${profile.name}, Placement rule error: ${err.message}`,
              log_type: "error",
            });
          }
        })
      )
    );

    cron_logs({
      message: `Placement rule run successfully`,
      log_type: "info",
    });

  } catch (error) {
    cron_logs({
      message: `CronPlacementRule Error: ${error.message}`,
      log_type: "error",
    });
  }
}

const runSponsoredProductRule = async (finalRulesToRun, checkConfigAds, profile, currentDate, currentTime, data, isManual = false) => {
  /** ---------------- Campaign Map ---------------- */
  const campaignMap = {};

  /** ---------------- Rules Loop ---------------- */
  await Promise.all(
    finalRulesToRun?.map(async (finalRule) => {

      const rule = finalRule.rule;
      if (finalRule?.scheduledTime) currentTime = finalRule?.scheduledTime

      if (rule.ruleType === "T" && !moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]")) return;

      let placementList = []
      if (Array.isArray(data)) {
        // if (!data?.length) return true
        placementList = data
      } else {
        placementList = await getTypeBasedRuleData(rule, "SP", placementSchema, true)
      }

      cron_logs({
        message: `runSponsoredProductRule -> Condition Matched Placeemnt Count: ${placementList.length} for Rule: ${rule.ruleName}`,
        log_type: "info",
      });

      const campaignIds = placementList.map(cp => cp.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
      const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate);

      const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
      const eligiblePlacement = placementList.filter(c => !lowStockIds.has(c.campaignId));

      cron_logs({
        message: `runSponsoredProductRule -> Eligible Placeemnt Count: ${eligiblePlacement.length} for Rule: ${rule.ruleName}`,
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

      await placementRuleHistorySchema.findOneAndUpdate(
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
          },
        },
        { upsert: true, new: true }
      ).lean();

      if (eligiblePlacement.length > 0) {
        const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "placementRuleSetting");

        const affectedCampaigns = await affectedCampaignByRuleSchema.find({
          configId: rule.configId,
          profileId: rule.profileId,
          userId: rule.userId,
          ruleSchema: "PlacementRule",
          ruleId: rule._id,
          ruleDate: currentDate,
          type: "SP"
        }).lean();

        const affectedSet = new Set(affectedCampaigns.map(a => `${a.campaignId}_${a.placement}`));

        await Promise.all(
          eligiblePlacement.map(async (pm) => {
            cron_logs({
              message: `Rule ID: ${rule?._id}, Rule Name: ${rule?.ruleName}, SP-Placement: ${JSON.stringify(pm)}`,
              log_type: "info",
            });

            const action = rule.actionType.find(act => act.placement === pm.placement);
            if (action) {
              let placementName = "";
              if (action.placement == "Top of Search") {
                placementName = "PLACEMENT_TOP";
              }
              else if (action.placement == "Rest of Search") {
                placementName = "PLACEMENT_REST_OF_SEARCH";
              }
              else if (action.placement == "Product pages") {
                placementName = "PLACEMENT_PRODUCT_PAGE";
              }

              const affectedKey = `${pm.campaignId}_${pm.placement}`;
              if (!rule.allowMultiTimeChanges && affectedSet.has(affectedKey)) {
                return null;
              }

              let newBid = pm.placementModifier ?? 0;
              let actionValue = action.actionValue;

              if (action.actionValueType === "Percentage") {
                actionValue = ((pm.placementModifier ?? 0) * actionValue) / 100;
              }

              if (action.actionName === "Increase Bid") newBid += actionValue;
              if (action.actionName === "Decrease Bid") newBid -= actionValue;
              if (action.actionName === "Set Bid") newBid = actionValue;

              if (bidThreshold?.maxBid && newBid > bidThreshold?.maxBid) newBid = bidThreshold?.maxBid;
              if (bidThreshold?.minBid && newBid < bidThreshold?.minBid) newBid = bidThreshold?.minBid;

              newBid = parseInt(newBid, 10);

              if (newBid >= 0) {
                if (!campaignMap[pm.campaignId]) {
                  campaignMap[pm.campaignId] = {
                    campaignId: String(pm.campaignId),
                    placements: [],
                    history: [],
                  };
                }

                const alreadyExists = campaignMap[pm.campaignId].placements.some(p => p.placement === placementName);
                if (alreadyExists) return null;

                campaignMap[pm.campaignId].placements.push({
                  placement: placementName,
                  percentage: newBid,
                });

                campaignMap[pm.campaignId].history.push({
                  conditionSnapshot: pm.conditionSnapshot,
                  campaignId: pm.campaignId,
                  placement: pm.placement,
                  oldBid: pm.placementModifier,
                  newBid,
                  campaignName: pm.campaignName,
                  rule,
                  currentTime
                });

              }
            }
            return true;
          })
        );

      }

      await placementRulesSchema.findByIdAndUpdate(
        { _id: rule._id },
        { isRunning: false },
        { new: true, upsert: true }
      );

      if (!isManual) {
        await ruleRunHistorySchema.findOneAndUpdate(
        {
          configId: profile.configId,
          profileId: profile.profileId,
          ruleId: rule._id,
          ruleSchema: "PlacementRule",
          ruleDate: currentDate,
          ruleTime: finalRule.scheduledTime
        },
        {
          $set: { isRun: true }
        },
        { new: true, upsert: true }
      ).lean();
      }

    })
  )

  /** ---------------- Amazon Payload ---------------- */
  const campaignsPayload = Object.values(campaignMap).map((c) => ({
    campaignId: c.campaignId,
    dynamicBidding: { placementBidding: c.placements },
  }));

  if (!campaignsPayload.length) {
    cron_logs({
      message: `runSponsoredProductRule -> Profile: ${profile?.name}, No Data updated`,
      log_type: "error",
    });
    return true;
  }

  /** ---------------- Amazon API (BATCHED) ---------------- */
  const { successfulItems } = await processBatchUpdates({
    updates: campaignsPayload,
    entityType: "SP_CAMPAIGNS",
    profile,
    checkConfigAds,
    configId: profile.configId,
  });

  const successCampaignIds = new Set(successfulItems.map(c => String(c.campaignId)));
  if (successCampaignIds.size === 0) {
    return false;
  }

  /** ---------------- Post Success Updates ---------------- */
  const bulkPlacementOps = [];
  await Promise.all(
    Object.values(campaignMap)
      .filter((c) => successCampaignIds.has(String(c.campaignId)))
      .flatMap((c) =>
        c.history.map(async (h) => {
          await recordRuleExecutionChange({
            conditionSnapshot: h.conditionSnapshot,
            configId: h?.rule?.configId,
            profileId: h?.rule?.profileId,
            userId: h?.rule?.userId,
            ruleSchema: "PlacementRule",
            ruleId: h?.rule?._id,
            ruleDate: currentDate,
            ruleTime: h?.currentTime ?? currentTime,
            type: "SP",
            campaignId: h.campaignId,
            placement: h.placement,
            name: h?.campaignName,
            oldValue: h?.oldBid,
            newValue: h?.newBid,
            changed: "bidAdjustment",
            metrics: {
              impressions: h?.impressions || 0,
              clicks: h?.clicks || 0,
              spend: h?.spend || 0,
              sales: h?.sales || 0,
              orders: h?.orders || 0,
              acos: h?.acos || 0,
              roas: h?.roas || 0,
              cpc: h?.cpc || 0,
              ctr: h?.ctr || 0,
            },
            notes: "Placement rule SP execution",
          });

          const isDayparting = Boolean(h?.rule?.isHourlyBid || h?.rule?.hourlyConfig?.slots?.length);
          const title = isDayparting
            ? `Dayparting Rule Run (${h?.rule?.ruleName || "Placement"}): Placement Bid Update`
            : `Cron Rule Run (${h?.rule?.ruleName || "Placement"}): Placement Bid Update`;

          await createBidHistory(
            h.campaignId,
            h.placement,
            h.newBid,
            profile.configId,
            profile.profileId,
            title,
            h?.rule?.userId,
            "SP",
            isDayparting ? "DAYPARTING" : "RULE"
          );

          bulkPlacementOps.push({
            updateOne: {
              filter: {
                configId: profile.configId,
                profileId: profile.profileId,
                campaignId: h.campaignId,
                placement: h.placement,
                reportDate: currentDate,
              },
              update: { $set: { placementModifier: h.newBid } },
              upsert: true
            }
          });
        })
      )
  );

  if (bulkPlacementOps.length > 0) {
    await placementSchema.bulkWrite(bulkPlacementOps);
  }

  return true;

}

const runSponsoredBrandRule = async (finalRulesToRun, checkConfigAds, profile, currentDate, currentTime, data, isManual = false) => {
  /** ---------------- Campaign Map ---------------- */
  const campaignMap = {};

  /** ---------------- Rules Loop ---------------- */
  await Promise.all(
    finalRulesToRun?.map(async (finalRule) => {
      const rule = finalRule.rule;
      if (finalRule?.scheduledTime) currentTime = finalRule?.scheduledTime

      if (rule.ruleType === "T" && !moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]")) return;

      let placementList = []
      if (Array.isArray(data)) {
        if (!data?.length) return true
        placementList = data
      } else {
        placementList = await getTypeBasedRuleData(rule, "SB", sbPlacementSchema, true)
      }

      await updateSnapshotHistory(rule, placementRuleHistorySchema, currentDate, currentTime);

      const campaignIds = placementList.map(cp => cp.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
      const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate, "SB");

      const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));
      const eligiblePlacement = placementList.filter(c => !lowStockIds.has(c.campaignId));

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

      if (eligiblePlacement.length > 0) {
        const bidThreshold = await getRuleSettings(rule?.configId, rule?.profileId, "placementRuleSetting");

        const affectedCampaigns = await affectedCampaignByRuleSchema.find({
          configId: rule.configId,
          profileId: rule.profileId,
          userId: rule.userId,
          ruleSchema: "PlacementRule",
          ruleId: rule._id,
          ruleDate: currentDate,
          type: "SB"
        }).lean();

        const affectedSet = new Set(affectedCampaigns.map(a => `${a.campaignId}_${a.placement}`));

        await Promise.all(
          eligiblePlacement.map(async (pm) => {
            cron_logs({
              message: `Rule ID: ${rule?._id}, Rule Name: ${rule?.ruleName}, SB-Placement: ${JSON.stringify(pm)}`,
              log_type: "info",
            });

            const action = rule.actionType.find(act => act.placement === pm.placement);
            if (action) {
              let placementName = "";
              if (action.placement == "Top of Search") {
                placementName = "TOP_OF_SEARCH";
              }
              else if (action.placement == "Rest of Search") {
                placementName = "OTHER";
              }
              else if (action.placement == "Product pages") {
                placementName = "DETAIL_PAGE";
              }

              const affectedKey = `${pm.campaignId}_${pm.placement}`;
              if (!rule.allowMultiTimeChanges && affectedSet.has(affectedKey)) {
                return null;
              }

              let newBid = pm.placementModifier ?? 0;
              let actionValue = action.actionValue;

              if (action.actionValueType === "Percentage") {
                actionValue = ((pm.placementModifier ?? 0) * actionValue) / 100;
              }

              if (action.actionName === "Increase Bid") newBid += actionValue;
              if (action.actionName === "Decrease Bid") newBid -= actionValue;
              if (action.actionName === "Set Bid") newBid = actionValue;

              if (bidThreshold?.maxBid && newBid > bidThreshold?.maxBid) newBid = bidThreshold?.maxBid;
              if (bidThreshold?.minBid && newBid < bidThreshold?.minBid) newBid = bidThreshold?.minBid;

              newBid = parseInt(newBid, 10);

              if (newBid >= 0) {
                if (!campaignMap[pm.campaignId]) {
                  campaignMap[pm.campaignId] = {
                    campaignId: String(pm.campaignId),
                    placements: [],
                    history: [],
                  };
                }

                const alreadyExists = campaignMap[pm.campaignId].placements.some(p => p.placement === placementName);
                if (alreadyExists) return null;

                campaignMap[pm.campaignId].placements.push({
                  placement: placementName,
                  percentage: newBid,
                });

                campaignMap[pm.campaignId].history.push({
                  conditionSnapshot: pm.conditionSnapshot,
                  campaignId: pm.campaignId,
                  placement: pm.placement,
                  oldBid: pm.placementModifier,
                  newBid,
                  campaignName: pm.campaignName,
                  rule,
                  currentTime
                });
              }
            }
            return true;
          })
        );

      }

      await placementRulesSchema.findByIdAndUpdate(
        { _id: rule._id },
        { isRunning: false },
        { new: true, upsert: true }
      );

      if (!isManual) {
        await ruleRunHistorySchema.findOneAndUpdate(
        {
          configId: profile.configId,
          profileId: profile.profileId,
          ruleId: rule._id,
          ruleSchema: "PlacementRule",
          ruleDate: currentDate,
          ruleTime: finalRule.scheduledTime
        },
        {
          $set: { isRun: true }
        },
        { new: true, upsert: true }
      ).lean();
      }

    })
  )

  /** ---------------- Amazon Payload ---------------- */
  const campaignsPayload = Object.values(campaignMap).map((c) => ({
    campaignId: c.campaignId,
    bidding: { bidOptimization: false, bidAdjustmentsByPlacement: c.placements },
  }));

  if (!campaignsPayload.length) {
    cron_logs({
      message: `runSponsoredBrandRule -> Profile: ${profile?.name}, No Data updated`,
      log_type: "error",
    });
    return true;
  }

  /** ---------------- Amazon API (BATCHED) ---------------- */
  const { successfulItems } = await processBatchUpdates({
    updates: campaignsPayload,
    entityType: "SB_CAMPAIGNS",
    profile,
    checkConfigAds,
    configId: profile.configId,
  });

  const successCampaignIds = new Set(successfulItems.map(c => String(c.campaignId)));
  if (successCampaignIds.size === 0) {
    return false;
  }

  /** ---------------- Post Success Updates ---------------- */
  await Promise.all(
    Object.values(campaignMap)
      .filter((c) => successCampaignIds.has(String(c.campaignId)))
      .flatMap((c) =>
      c.history.map(async (h) => {
        await recordRuleExecutionChange({
          conditionSnapshot: h.conditionSnapshot,
          configId: h?.rule?.configId,
          profileId: h?.rule?.profileId,
          userId: h?.rule?.userId,
          ruleSchema: "PlacementRule",
          ruleId: h?.rule?._id,
          ruleDate: currentDate,
          ruleTime: h?.currentTime ?? currentTime,
          type: "SB",
          campaignId: h.campaignId,
          placement: h.placement,
          name: h?.campaignName,
          oldValue: h?.oldBid,
          newValue: h?.newBid,
          changed: "bidAdjustment",
          metrics: {
            impressions: h?.impressions || 0,
            clicks: h?.clicks || 0,
            spend: h?.spend || 0,
            sales: h?.sales || 0,
            orders: h?.orders || 0,
            acos: h?.acos || 0,
            roas: h?.roas || 0,
            cpc: h?.cpc || 0,
            ctr: h?.ctr || 0,
          },
          notes: "Placement rule SB execution",
        });

        const isDayparting = Boolean(h?.rule?.isHourlyBid || h?.rule?.hourlyConfig?.slots?.length);
        const title = isDayparting
          ? `Dayparting Rule Run (${h?.rule?.ruleName || "Placement"}): Placement Bid Update`
          : `Cron Rule Run (${h?.rule?.ruleName || "Placement"}): Placement Bid Update`;

        await createBidHistory(
          h.campaignId,
          h.placement,
          h.newBid,
          profile.configId,
          profile.profileId,
          title,
          h?.rule?.userId,
          "SB",
          isDayparting ? "DAYPARTING" : "RULE"
        );

        const result = await sbPlacementSchema.findOneAndUpdate(
          {
            configId: profile.configId,
            profileId: profile.profileId,
            campaignId: h.campaignId,
            placement: h.placement,
            reportDate: currentDate,
          },
          { $set: { placementModifier: h.newBid } },
          { new: true, upsert: true }
        ).lean();

        cron_logs({
          message: `runSponsoredBrandRule -> Placement Updated: ${JSON.stringify(result)}`,
          log_type: "info",
        });

      })
    )
  );

  return true;

}

const getTypeBasedRuleData = async (rule, type, model, capture = false) => {
  const hasExplicitCampaigns = (rule.campaignIds?.SP?.length > 0) || (rule.campaignIds?.SB?.length > 0) || (Array.isArray(rule.campaignIds) && rule.campaignIds.length > 0);

  if (!hasExplicitCampaigns) {
    return [];
  }

  if (hasExplicitCampaigns && (!rule.campaignIds?.[type] || rule.campaignIds[type].length === 0)) {
    return [];
  }

  const campaignModel = type === "SB" ? sbCampaignSchema : campaignSchema;
  const activeCampaigns = await campaignModel.aggregate([
    {
      $match: {
        profileId: Number(rule.profileId),
        ...(rule.configId ? { configId: new ObjectId(rule.configId) } : {})
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
    campaignId: { $in: targetCampaignIds },
    placement: { $in: ["Top of Search", "Rest of Search", "Product pages"] },
  };

  let { fromDate, toDate } = getRuleDate(rule.timezone, rule.reportDate, rule.toDate);
  if (rule.reportDate !== "LIFETIME") {
    query.reportDate = { $gte: fromDate, $lte: toDate };
  } else {
    toDate = currentDate;
  }

  const pipeline = await this.placamentPipeline(query, toDate, type);

  const conditionStages = [];

  if (rule.query && rule?.query?.[type]) {
    let parsedQuery = sanitizeQueryObject(safeJsonParse(rule?.query?.[type]));
    conditionStages.push({ $match: parsedQuery });
  }

  if (rule.isDaysSinceCreation) {
    conditionStages.push({ $match: { daysSinceCreation: { $gte: Number(rule.daysSinceCreation || 0) } } });
  }

  const placementList = await getConditionRows({ rule, ruleType: "placement", adType: type, model, pipeline, conditionStages, capture, ruleModel: placementRulesSchema });

  const campaignIds = placementList.map(c => c.campaignId).filter((id, index, arr) => arr.indexOf(id) === index);
  const { lowStockCampaigns } = await checkCampaignProductAvailability(rule.configId, rule.profileId, campaignIds, currentDate, type);
  const lowStockIds = new Set(lowStockCampaigns.map(c => c.campaignId));

  return placementList.map(c => ({ ...c, isEligible: !lowStockIds.has(c.campaignId) }));
}

exports.ruleEffectedPlacement = async (req, res) => {
  const ruleId = req.params.ruleId;
  try {
    const rule = await placementRulesSchema.findById(ruleId).lean();
    if (!rule) {
      return res.status(203).send({
        message: "Rule not found!",
        isSuccess: false,
      });
    }

    const SP = await getTypeBasedRuleData(rule, "SP", placementSchema)
    const SB = await getTypeBasedRuleData(rule, "SB", sbPlacementSchema)
    const SD = await getTypeBasedRuleData(rule, "SD", sdPlacementSchema)

    return res.status(200).send({
      isSuccess: true,
      message: "Placement rule data fetched successfully.",
      data: { SP, SB, SD },
    });

  } catch (error) {
      write_logs({ message: `[ruleEffectedPlacement Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

exports.manualRunPlacementRule = async (req, res) => {
  const ruleId = req.params.ruleId;
  const userId = req.user._id;

  let { data: placementList } = req.body;

  try {

    const rule = await placementRulesSchema.findOne({ _id: ruleId, userId }).lean();
    if (!rule) {
      return res.status(203).send({
        message: "Rule not found!",
        isSuccess: false,
      });
    }

    const hasAssignedCampaigns = (rule.campaignIds?.SP?.length > 0) || (rule.campaignIds?.SB?.length > 0) || (Array.isArray(rule.campaignIds) && rule.campaignIds.length > 0);
    if (!hasAssignedCampaigns) {
      return res.status(203).send({
        message: "Rule assign campaigns not found",
        isSuccess: false,
      });
    }






    if (!(placementList?.SP?.length || placementList?.SB?.length || placementList?.SD?.length)) {
      return res.status(203).send({
        message: "Placement data not found!",
        isSuccess: false,
      });
    }

    const now = moment().tz(rule.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm:ss");

    if (
      rule.ruleType === "T" &&
      !moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]")
    ) {
      return res.status(203).send({
        isSuccess: false,
        message: "This rule is Time based. It cannot be run at this time.",
      });
    }

    const profile = await getProfile(rule.configId, rule.profileId);
    const checkConfigAds = await getAccessToken(rule.configId);
    if (!profile || !checkConfigAds?.adsAccessToken) return res.status(203).send({ isSuccess: false, message: "Account is not connected." });

    let executionRule = rule;
    let scheduledTime = currentTime;

    if (rule.isHourlyBid) {
      const nowHour = now.hour();
      const activeSlot = (rule.hourlyConfig?.slots || []).find(s => {
        const startHour = parseInt(s.startTime?.split(":")[0], 10);
        const endHour = parseInt(s.endTime?.split(":")[0], 10);
        if (endHour === 0) return nowHour >= startHour && nowHour < 24;
        return nowHour >= startHour && nowHour < endHour;
      });

      if (activeSlot && activeSlot.enabled) {
        // Retain activeSlot configuration without overriding scheduledTime with slot startTime
        // This preserves distinct manual run history and avoids merging into scheduled cron records.
        executionRule = { ...rule };
        if (activeSlot.actions && activeSlot.actions.length > 0) {
          executionRule.actionType = activeSlot.actions;
        }
      }
    }

    placementList = await captureManualSelection(rule, "placement", placementList, type => type === "SD" ? Promise.resolve([]) : getTypeBasedRuleData(rule, type, { SP: placementSchema, SB: sbPlacementSchema }[type], true));

    const spStatus = await runSponsoredProductRule([{ rule: executionRule, scheduledTime }], checkConfigAds, profile, currentDate, scheduledTime, placementList?.SP, true);
    const sbStatus = await runSponsoredBrandRule([{ rule: executionRule, scheduledTime }], checkConfigAds, profile, currentDate, scheduledTime, placementList?.SB, true);

    if (!spStatus || !sbStatus) {
      return res.status(203).send({
        message: "Something went wrong, please try again!",
        isSuccess: false,
      });
    }

    return res.status(200).send({
      isSuccess: true,
      message: "Placement Rule executed successfully",
    });

  } catch (error) {
      write_logs({ message: `[manualRunPlacementRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong",
      error: "An internal server error occurred",
    });
  }
};

exports.ruleHistory = async (req, res) => {
  const configId = req?.config?.configId;
  const userId = req.user._id;
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
          from: "placementrules",
          localField: "ruleId",
          foreignField: "_id",
          as: "placementRule"
        }
      },
      {
        $unwind: {
          path: "$placementRule",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          $or: [
            { "placementRule.userId": userId },
            { "placementRule": { $exists: false } },
            { "placementRule": null }
          ]
        }
      },
      {
        $addFields: {
          reportDate: "$placementRule.reportDate",
          toDate: "$placementRule.toDate",
          timezone: "$placementRule.timezone",
          conditions: "$placementRule.conditions",
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
                      { $eq: ["$ruleSchema", "PlacementRule"] },
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
                          { $eq: ["$ruleSchema", "PlacementRule"] },
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
                          { $eq: ["$ruleSchema", "PlacementRule"] },
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
                      placement: 1,
                      name: 1,
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
                  },
                ],
                as: "affectedPlacements"
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

    const result = await placementRuleHistorySchema.aggregate(pipeline);
    const getRules = await enrichWithCampaignMetrics(result[0].data, profileId, "PlacementRule");
    const totalRecords = result[0].totalCount[0]?.count || 0;
    return res.status(200).send({
      isSuccess: true,
      message: "Placement Rules History listing successfully",
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

exports.ruleReverted = async (req, res) => {
  const { data: revertList, ruleId } = req.body;

  if (!Array.isArray(revertList) || !revertList.length || !ruleId) {
    return res.status(203).send({
      message: "No records to revert!",
      isSuccess: false,
    });
  }

  const rule = await placementRulesSchema.findOne({ _id: ruleId }).lean();
  if (!rule) return { _id: item._id, success: false, reason: "Rule not found" };

  const checkConfigAds = await getAccessToken(rule.configId);
  if (!checkConfigAds?.adsAccessToken) return { _id: item._id, success: false, reason: "Access token unavailable" };

  const profile = await getProfile(rule?.configId, rule?.profileId);
  if (!profile) return { _id: item._id, success: false, reason: "Profile not found" };

  try {
    const CHUNK_SIZE = 50;
    const succeeded = [];
    const failed = [];

    for (let i = 0; i < revertList.length; i += CHUNK_SIZE) {
      const chunk = revertList.slice(i, i + CHUNK_SIZE);

      const SPList = chunk.filter(it => it?.type === "SP");
      const SBList = chunk.filter(it => it?.type === "SB");

      const [spResult, sbResult] = await Promise.all([
        revertedSPRuleEffect(SPList, rule, checkConfigAds, profile),
        revertedSBRuleEffect(SBList, rule, checkConfigAds, profile),
      ]);

      succeeded.push(
        ...(spResult?.succeeded ?? []),
        ...(sbResult?.succeeded ?? [])
      );
      failed.push(
        ...(spResult?.failed ?? []),
        ...(sbResult?.failed ?? [])
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
    const campaignMap = {};

    SPList.forEach(item => {
      let placementName = "";
      if (item.placement === "Top of Search") placementName = "PLACEMENT_TOP";
      else if (item.placement === "Rest of Search") placementName = "PLACEMENT_REST_OF_SEARCH";
      else if (item.placement === "Product pages") placementName = "PLACEMENT_PRODUCT_PAGE";

      if (!placementName) {
        failed.push({ _id: item._id, reason: `Unknown placement: ${item.placement}` });
        return;
      }

      if (!campaignMap[item.campaignId]) {
        campaignMap[item.campaignId] = {
          campaignId: String(item.campaignId),
          placementsMap: new Map(),
          history: [],
        };
      }

      // Keep earliest baseline oldValue for each placement
      if (!campaignMap[item.campaignId].placementsMap.has(placementName)) {
        campaignMap[item.campaignId].placementsMap.set(placementName, {
          placement: placementName,
          percentage: parseInt(item.oldValue, 10),
          createdAt: item.createdAt || 0,
        });
      } else {
        const existing = campaignMap[item.campaignId].placementsMap.get(placementName);
        if (new Date(item.createdAt || 0) < new Date(existing.createdAt || 0)) {
          campaignMap[item.campaignId].placementsMap.set(placementName, {
            placement: placementName,
            percentage: parseInt(item.oldValue, 10),
            createdAt: item.createdAt || 0,
          });
        }
      }

      campaignMap[item.campaignId].history.push(item);
    });

    const campaignsPayload = Object.values(campaignMap).map(c => ({
      campaignId: c.campaignId,
      dynamicBidding: {
        placementBidding: Array.from(c.placementsMap.values()).map(p => ({
          placement: p.placement,
          percentage: p.percentage,
        })),
      },
    }));

    if (!campaignsPayload.length) return { succeeded, failed };

    const options = {
      method: "PUT",
      url: `${profile.amazonUrl}/sp/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Accept": "application/vnd.spCampaign.v3+json",
        "Content-Type": "application/vnd.spCampaign.v3+json",
      },
      data: { campaigns: campaignsPayload },
      meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
    };

    const response = await retryWithBackoff(() => amazonAxios(options));

    write_logs({
      message: `revertedSPPlacementRuleEffect -> Response: ${JSON.stringify(response.data)}`,
      log_type: "info",
    });

    if (response.status === 207) {
      const successIds = new Set((response.data?.campaigns?.success || []).map(c => String(c.campaignId)));
      const errorMap = Object.fromEntries((response.data?.campaigns?.error || []).map(c => [String(c.campaignId), c.description]));

      SPList.forEach(item => {
        if (successIds.has(String(item.campaignId))) {
          succeeded.push(item);
        } else {
          failed.push({ _id: item._id, reason: errorMap[String(item.campaignId)] || "Amazon rejected this campaign" });
        }
      });

      await Promise.all(
        succeeded.map(async (item) => {
          const newValue = parseFloat(item?.oldValue);

          await affectedCampaignByRuleSchema.findByIdAndUpdate(
            item._id,
            {
              $set: {
                isReverted: true,
                isActive: false,
                closedAt: new Date(),
              },
              $push: {
                metricsHistory: {
                  timestamp: new Date(),
                  date: currentDate,
                  time: moment().tz(profile.timezone).format("hh:mm A"),
                  impressions: item.impressions || 0,
                  clicks: item.clicks || 0,
                  spend: item.spend || 0,
                  sales: item.sales || 0,
                  orders: item.orders || 0,
                  acos: item.acos || 0,
                  roas: item.roas || 0,
                  cpc: item.cpc || 0,
                  ctr: item.ctr || 0,
                  settingValue: String(newValue ?? ""),
                  eventType: "FINAL_SNAPSHOT",
                  notes: "Rule changes reverted to baseline",
                }
              }
            },
          );

          await createBidHistory(
            item.campaignId,
            item.placement,
            newValue,
            rule.configId,
            rule.profileId,
            "Revert: Placement Bid Update",
            rule.userId,
            "SP"
          );

          await placementSchema.findOneAndUpdate(
            {
              configId: rule.configId,
              profileId: rule.profileId,
              campaignId: item.campaignId,
              placement: item.placement,
              reportDate: currentDate,
            },
            { $set: { placementModifier: parseInt(newValue, 10) } },
          ).lean();
        })
      );

    } else {
      SPList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
    }
  } catch (err) {
    write_logs({
      message: `revertedSPPlacementRuleEffect -> Error: ${err.message}`,
      log_type: "error",
    });
    SPList.forEach(item => failed.push({ _id: item._id, reason: err.message }));
  }

  return { succeeded, failed };
}

const revertedSBRuleEffect = async (SBList, rule, checkConfigAds, profile) => {
  const now = moment().tz(profile.timezone);
  const currentDate = now.format("YYYY-MM-DD");

  const succeeded = [];
  const failed = [];

  if (!SBList?.length) return { succeeded, failed };

  try {
    const campaignMap = {};

    SBList.forEach(item => {
      let placementName = "";
      if (item.placement === "Top of Search") placementName = "TOP_OF_SEARCH";
      else if (item.placement === "Rest of Search") placementName = "OTHER";
      else if (item.placement === "Product pages") placementName = "DETAIL_PAGE";

      if (!placementName) {
        failed.push({ _id: item._id, reason: `Unknown placement: ${item.placement}` });
        return;
      }

      if (!campaignMap[item.campaignId]) {
        campaignMap[item.campaignId] = {
          campaignId: String(item.campaignId),
          placementsMap: new Map(),
          history: [],
        };
      }

      if (!campaignMap[item.campaignId].placementsMap.has(placementName)) {
        campaignMap[item.campaignId].placementsMap.set(placementName, {
          placement: placementName,
          percentage: parseInt(item.oldValue, 10),
          createdAt: item.createdAt || 0,
        });
      } else {
        const existing = campaignMap[item.campaignId].placementsMap.get(placementName);
        if (new Date(item.createdAt || 0) < new Date(existing.createdAt || 0)) {
          campaignMap[item.campaignId].placementsMap.set(placementName, {
            placement: placementName,
            percentage: parseInt(item.oldValue, 10),
            createdAt: item.createdAt || 0,
          });
        }
      }

      campaignMap[item.campaignId].history.push(item);
    });

    const campaignsPayload = Object.values(campaignMap).map(c => ({
      campaignId: c.campaignId,
      bidding: {
        bidOptimization: false,
        bidAdjustmentsByPlacement: Array.from(c.placementsMap.values()).map(p => ({
          placement: p.placement,
          percentage: p.percentage,
        })),
      },
    }));

    if (!campaignsPayload.length) return { succeeded, failed };

    const options = {
      method: "PUT",
      url: `${profile.amazonUrl}/sb/v4/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Accept": "application/vnd.sbcampaignresource.v4+json",
        "Content-Type": "application/vnd.sbcampaignresource.v4+json",
      },
      data: { campaigns: campaignsPayload },
      meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
    };

    const response = await retryWithBackoff(() => amazonAxios(options));

    write_logs({
      message: `revertedSBPlacementRuleEffect -> Response: ${JSON.stringify(response.data)}`,
      log_type: "info",
    });

    if (response.status === 207) {
      const successIds = new Set((response.data?.campaigns?.success || []).map(c => String(c.campaignId)));
      const errorMap = Object.fromEntries((response.data?.campaigns?.error || []).map(c => [String(c.campaignId), c.description]));

      SBList.forEach(item => {
        if (successIds.has(String(item.campaignId))) {
          succeeded.push(item);
        } else {
          failed.push({ _id: item._id, reason: errorMap[String(item.campaignId)] || "Amazon rejected this campaign" });
        }
      });

      await Promise.all(
        succeeded.map(async (item) => {
          const newValue = parseFloat(item?.oldValue);

          await affectedCampaignByRuleSchema.findByIdAndUpdate(
            item._id,
            {
              $set: {
                isReverted: true,
                isActive: false,
                closedAt: new Date(),
              },
              $push: {
                metricsHistory: {
                  timestamp: new Date(),
                  date: currentDate,
                  time: moment().tz(profile.timezone).format("hh:mm A"),
                  impressions: item.impressions || 0,
                  clicks: item.clicks || 0,
                  spend: item.spend || 0,
                  sales: item.sales || 0,
                  orders: item.orders || 0,
                  acos: item.acos || 0,
                  roas: item.roas || 0,
                  cpc: item.cpc || 0,
                  ctr: item.ctr || 0,
                  settingValue: String(newValue ?? ""),
                  eventType: "FINAL_SNAPSHOT",
                  notes: "Rule changes reverted to baseline",
                }
              }
            },
          );

          await createBidHistory(
            item.campaignId,
            item.placement,
            newValue,
            rule.configId,
            rule.profileId,
            "Revert: Placement Bid Update",
            rule.userId,
            "SB"
          );

          await sbPlacementSchema.findOneAndUpdate(
            {
              configId: rule.configId,
              profileId: rule.profileId,
              campaignId: item.campaignId,
              placement: item.placement,
              reportDate: currentDate,
            },
            { $set: { placementModifier: parseInt(newValue, 10) } },
          ).lean();
        })
      );

    } else {
      SBList.forEach(item => failed.push({ _id: item._id, reason: "Amazon API did not return 207" }));
    }
  } catch (err) {
    write_logs({
      message: `revertedSBPlacementRuleEffect -> Error: ${err.message}`,
      log_type: "error",
    });
    SBList.forEach(item => failed.push({ _id: item._id, reason: err.message }));
  }

  return { succeeded, failed };
}

exports.exportBidPlacementRule = async (req, res) => {
  try {
    const { configId } = req?.config;
    const { profileId, exportIds } = req.body;

    const query = { configId, profileId };

    // ✅ Apply ruleIds filter if provided
    if (Array.isArray(exportIds) && exportIds?.length) {
      query._id = { $in: exportIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) };
    }

    const rules = await placementRulesSchema.find(query).lean();

    const workbook = new ExcelJS.Workbook();

    const metaSheet = workbook.addWorksheet("_META");
    const secretPayload = `PLACEMENT_RULE`;
    const signature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(secretPayload).digest("hex");
    metaSheet.getCell("A1").value = signature;
    metaSheet.state = "hidden";

    const sheet = workbook.addWorksheet("PlacementRules");

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
      `attachment; filename=BidPlacementRules_${profileId}.xlsx`
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition"
    );

    await workbook.xlsx.write(res);
    return res.end();

  } catch (error) {
      write_logs({ message: `[exportBidPlacementRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error(error);
    return res.status(500).send({
      isSuccess: false,
      message: "Export failed",
      error: "An internal server error occurred",
    });
  }
};

exports.importBidPlacementRule = async (req, res) => {
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
    const expectedPayload = `PLACEMENT_RULE`;

    const storedSignature = metaSheet.getCell("A1").value;
    const expectedSignature = crypto.createHmac("sha256", process?.env?.ENCRYPTION_KEY).update(expectedPayload).digest("hex");

    if (storedSignature !== expectedSignature) {
      return res.status(203).send({
        isSuccess: false,
        message: "Invalid file. Please upload a valid Placement Rule export file."
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
    const existingRules = await placementRulesSchema.find({ configId, profileId, userId }, { _id: 1, conditions: 1 }).lean();

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
        const matchedRule = checkDuplicatePlacementRule(existingRules, conditions);
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
          write_logs({ message: `[importBidPlacementRule Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        errors.push({
          row: rowNumber,
          message: err.message,
        });
      }
    });

    if (bulkOps.length) {
      await prepareSnapshotBulkUpdates(placementRulesSchema, bulkOps);
      await placementRulesSchema.bulkWrite(bulkOps);
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
      write_logs({ message: `[importBidPlacementRule Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      isSuccess: false,
      message: "Import failed",
      error: "An internal server error occurred",
    });
  }
};


exports.getAllPlacements = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { adTypePlacementSchema } = req.models;

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
      filteredPlacements,
      query: Query
    } = req.body;

    const customFilter = sanitizeQueryObject(safeJSON(Query)) ?? {};
    const { campaignId, ...extraFilter } = typeof customFilter === "object" ? customFilter : {}

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required." });
    }

    const profile = await getProfile(configId, profileId);
    const timezone = profile.timezone;
    const reportDate = {
      $gte: fromDate,
      ...(toDate && { $lte: toDate }),
    };

    let searchCampaignIds = null;
    if (searchName) {
      const { adTypeCampaignSchema } = req.models;
      if (adTypeCampaignSchema) {
        const matchedCamps = await adTypeCampaignSchema.find({
          configId,
          profileId: Number(profileId),
          name: { $regex: new RegExp(RegExp.escape(`${searchName}`.trim()), "i") }
        }).select("campaignId").lean();
        searchCampaignIds = matchedCamps.map(c => c.campaignId);
      }
    }

    const hasActiveCampaigns = await campaignSchema.exists({
      configId,
      profileId: Number(profileId),
      status: "ENABLED",
      reportDate: { $gte: moment().subtract(2, "days").format("YYYY-MM-DD") }
    });

    const commonPipeline = [
      {
        $match: {
          configId,
          profileId,
          reportDate,
          ...(campaignId && { campaignId }),
          ...(filteredPlacements.length > 0 && { $or: filteredPlacements }),
          ...(searchName && {
            $or: [
              { campaignName: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
              ...(searchCampaignIds?.length ? [{ campaignId: { $in: searchCampaignIds } }] : [])
            ]
          }),
        }
      },
      {
        $sort: { reportDate: -1 }
      },
      {
        $group: {
          _id: {
            campaignId: "$campaignId",
            placement: "$placement",
            profileId: "$profileId",
          },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          orders: { $sum: "$orders" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          reportDate: { $first: "$reportDate" },
          campaignName: { $first: "$campaignName" },
          campaignStatus: { $first: "$campaignStatus" },
          biddingStartegy: { $first: "$biddingStartegy" },
          placementModifier: { $first: "$placementModifier" }
        }
      },
      {
        $match: {
          ...(!filteredPlacements.length && (
            hasActiveCampaigns
              ? { campaignStatus: "ENABLED" }
              : {
                $or: [
                  { campaignStatus: "ENABLED" },
                  { spend: { $gt: 0 } },
                  { clicks: { $gt: 0 } }
                ]
              }
          )),
          reportDate: { $lte: toDate }
        }
      },
      {
        $project: {
          campaignId: "$_id.campaignId",
          campaignName: 1,
          placement: "$_id.placement",
          biddingStartegy: 1,
          placementModifier: 1,
          profileId: "$_id.profileId",
          impressions: 1,
          clicks: 1,
          orders: 1,
          spend: 1,
          sales: 1,
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
        }
      },
      ...(extraFilter && Object.keys(extraFilter).length ? [{ $match: extraFilter }] : [])
    ];

    // Add field filtering to the pipeline
    if (fieldName && fieldOperator && fieldValue !== undefined) {
      const fieldFilter = buildFieldFilter(fieldName, fieldOperator, fieldValue);

      if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
        const extraFieldFilter = buildFieldFilter(fieldName, extraFieldOperator, extraFieldValue);

        // Create proper MongoDB logical operator
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

    // Add sorting
    const sortStage = {};
    if (sortType === "ASC") {
      sortStage[fieldName] = 1;
    } else if (sortType === "DESC") {
      sortStage[fieldName] = -1;
    } else {
      sortStage.campaignId = -1;
    }
    // Main pipeline with facet
    const pipeline = [
      ...commonPipeline,
      {
        $facet: {
          data: [
            { $sort: sortStage },                    // e.g. { spend: -1 }
            { $skip: (pageNo - 1) * perPage },
            { $limit: perPage }
          ],
          totalRecords: [
            { $count: "count" }
          ]
        }
      }
    ];

    const result = await adTypePlacementSchema.aggregate(pipeline).allowDiskUse(true);
    const placementResult = result[0]?.data || [];
    const totalRecords = result[0].totalRecords[0]?.count || 0;

    const missingCampaignIds = [
      ...new Set(
        placementResult
          .filter(p => !p.campaignName || p.placementModifier == null || !p.biddingStartegy)
          .map(p => p.campaignId)
          .filter(Boolean)
      )
    ];

    if (missingCampaignIds.length > 0) {
      const { adTypeCampaignSchema } = req.models;
      if (adTypeCampaignSchema) {
        const campaigns = await adTypeCampaignSchema.find({
          configId,
          profileId: Number(profileId),
          campaignId: { $in: missingCampaignIds }
        }).select("campaignId name status dynamicBidding").sort({ reportDate: -1 }).lean();

        const campaignMap = new Map();
        for (const camp of campaigns) {
          if (!campaignMap.has(camp.campaignId)) {
            campaignMap.set(camp.campaignId, camp);
          }
        }

        const placementKeyMap = {
          "Top of Search": "PLACEMENT_TOP",
          "Product pages": "PLACEMENT_PRODUCT_PAGE",
          "Rest of Search": "PLACEMENT_REST_OF_SEARCH",
          "Audience Segment": "AUDIENCE_SEGMENT",
          "Business Placement": "SITE_AMAZON_BUSINESS",
        };

        for (const item of placementResult) {
          const camp = campaignMap.get(item.campaignId);
          if (camp) {
            if (!item.campaignName && camp.name) {
              item.campaignName = camp.name;
            }
            if (!item.campaignStatus && camp.status) {
              item.campaignStatus = camp.status;
            }
            if (!item.biddingStartegy && camp.dynamicBidding?.strategy) {
              const strat = camp.dynamicBidding.strategy;
              item.biddingStartegy = ["legacy", "LEGACY_FOR_SALES"].includes(strat)
                ? "Dynamic bids - down only"
                : ["optimizeForSales", "AUTO_FOR_SALES"].includes(strat)
                  ? "Dynamic bids - up and down"
                  : "Fixed bid";
            }
            if (item.placementModifier == null) {
              let percentage = 0;
              const mappedKey = placementKeyMap[item.placement];
              if (mappedKey) {
                const pb = camp.dynamicBidding?.placementBidding?.find(p => p.placement === mappedKey);
                if (pb && pb.percentage != null) {
                  percentage = pb.percentage;
                } else {
                  const sc = camp.dynamicBidding?.shopperCohortBidding?.find(p => p.shopperCohortType === mappedKey);
                  if (sc && sc.percentage != null) {
                    percentage = sc.percentage;
                  }
                }
              }
              item.placementModifier = percentage;
            }
          } else if (item.placementModifier == null) {
            item.placementModifier = 0;
          }
        }
      }
    }

    for (const item of placementResult) {
      if (item.placementModifier == null) {
        item.placementModifier = 0;
      }
    }

    return res.status(200).send({
      isSuccess: true,
      getPlacement: placementResult,
      currentPageNo: pageNo,
      totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
    });

  } catch (error) {
      write_logs({ message: `[getAllPlacements Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
}

exports.checkRuleBlockCampaign = async (req, res) => {
  const configId = req?.config?.configId;

  const { profileId, ruleId, ruleDate } = req.body;

  try {
    if (!profileId || !ruleId || !ruleDate) {
      return res.status(203).send({
        isSuccess: false,
        message: "profileId, ruleId and ruleDate are required",
      });
    }

    const pipeline = [
      {
        $match: {
          configId,
          profileId,
          ruleId: new mongoose.Types.ObjectId(ruleId),
          ruleDate,
        },
      },
      {
        $lookup: {
          from: "campaigns",
          let: {
            cid: "$campaignId",
            rDate: "$ruleDate",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$campaignId", "$$cid"] },
                    { $eq: ["$reportDate", "$$rDate"] },
                  ],
                },
              },
            },
            {
              $project: {
                name: 1,
              },
            },
          ],
          as: "campaign",
        },
      },
      {
        $unwind: {
          path: "$campaign",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          campaignId: 1,
          campaignName: { $ifNull: ["$campaign.name", "Unknown Campaign"] },
          totalProduct: 1,
          inStockProduct: 1,
          availabilityRatio: 1,
          ruleDate: 1,
        },
      },
    ];

    // 🔥 Fetch rule campaign data
    const campaignData = await campaignProductEligibleStatusByRuleSchema.aggregate(pipeline);

    if (!campaignData.length) {
      return res.status(200).send({
        isSuccess: true,
        message: "No campaign data found for this rule",
        data: [],
      });
    }

    return res.status(200).send({
      isSuccess: true,
      message: "Campaign eligibility checked successfully",
      data: campaignData,
    });
  } catch (error) {
      write_logs({ message: `[checkRuleBlockCampaign Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};
