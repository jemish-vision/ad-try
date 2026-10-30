const moment = require("moment-timezone");
const fs = require("fs");
const zlib = require("node:zlib");
const path = require("path");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const axios = require("axios");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");

const adGroupsSchema = require("../models/adGroups.model");
const sbAdGroupsSchema = require("../models/sbAdGroups.model");
const sdAdGroupsSchema = require("../models/sdAdGroups.model");
const profileSchema = require("../models/profiles.model");
const reportsSchema = require("../models/report.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const cronJobSchema = require("../models/cronJob.model");

const {
  getProfile,
  getAccessToken,
  unzipReport,
  calcMetrics,
  parseStrictMetric,
  downloadFile,
  parallelBulkWrite,
  getAllowedSyncProfiles,
  getAxiosErrorMessage
} = require("../helper/common");
const { stageReportFileInRedis } = require("../services/reportFileStager.service");
const { processStagedReportBatches } = require("../services/reportBatchWriter.service");
const { linkReportHistory } = require("../services/reportHistoryCompletion.service");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { write_logs } = require("../../winston/adGroups/logger");
const amazonAxios = require("../helper/amazonAxios");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { retryWithBackoff } = require("../helper/retryHelper");

exports.cronListAdGroupsFromAmazon = async (pastSyncObj) => {
  cron_logs({ message: `cronListAdGroupsFromAmazon`, log_type: "info" });
  try {

    const { profileId, configId, cronjobid, recurring } = pastSyncObj ?? {};
    const dates = pastSyncObj?.dates ?? [];
    const cronName = "AdGroups Listing";

    const allowedProfiles = await getAllowedSyncProfiles("CAMPAIGNS", "ads", recurring);
    const getProfileId = (await profileSchema.find({ isActive: true, ...(profileId && { profileId }), ...(configId && { configId }) }).lean())
      .filter((p) =>
        allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
      );
    const listPromises = getProfileId.map((profile) => limit(async () => {
      if (global.updateTaskProgress) global.updateTaskProgress("AdGroups Listing");
      try {
        const checkConfigAds = await getAccessToken(profile.configId);
        if (
          checkConfigAds &&
          checkConfigAds.adsAccessToken
        ) {
          const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");
          if (dates.length == 0) {
            dates.push(currentDate);
          }

          await processSPAdGroups({
            profile,
            checkConfigAds,
            dates
          });

          await processSBAdGroups({
            profile,
            checkConfigAds,
            dates
          });

          await processSDAdGroups({
            profile,
            checkConfigAds,
            dates
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
            message: `Profile: ${profile.name}, Adgroup listed successfully.`,
            log_type: "info",
          });

        } else {
          return cron_logs({
            message: `Account disconnected in adgroup listing for ${profile.name}`,
            log_type: "error",
          });
        }
      } catch (err) {
        cron_logs({
          message: `Profile: ${profile.name}, Adgroup listing failed: ${err.message || err}`,
          log_type: "error",
        });
        throw err; // rethrow to preserve existing behavior where Promise.all catches it
      }
    }))

    await Promise.all(listPromises);

    return cron_logs({
      message: "AdGroups listing successfully.",
      log_type: "info",
    });

  } catch (error) {
    return cron_logs({
      message: `Main try catch error: ${error}`,
      log_type: "error",
    });
  }
};

async function processSPAdGroups({
  profile,
  checkConfigAds,
  dates
}) {
  const getPage = await fetchSPAdGroupsPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let nextToken = null;
  let page = 1;

  do {
    const { adGroups, nextToken: token } = await getPage(nextToken);
    nextToken = token;

    if (!adGroups.length) continue;

    const bulkOps = [];
    adGroups.map((item) => {
      dates.map((reportDate) => {
        bulkOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              campaignId: item.campaignId,
              adGroupId: item.adGroupId,
              reportDate,
            },
            update: {
              $set: {
                ...item,
                reportDate,
              },
            },
            upsert: true,
          },
        });
      });
    })

    if (bulkOps.length) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page++}, AdGroup Count: ${bulkOps.length}`,
        log_type: "debug",
      });
      await parallelBulkWrite(adGroupsSchema, bulkOps);
    }

  } while (nextToken);
}

async function processSBAdGroups({
  profile,
  checkConfigAds,
  dates
}) {
  const getPage = await fetchSBAdGroupsPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let nextToken = null;
  let page = 1;

  do {
    const { adGroups, nextToken: token } = await getPage(nextToken);
    nextToken = token;

    if (!adGroups.length) continue;

    const bulkOps = [];
    adGroups.map((item) => {
      dates.map((reportDate) => {
        bulkOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              campaignId: item.campaignId,
              adGroupId: item.adGroupId,
              reportDate,
            },
            update: {
              $set: {
                ...item,
                reportDate,
              },
            },
            upsert: true,
          },
        });
      });
    })

    if (bulkOps.length) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page++}, SB-AdGroup Count: ${bulkOps.length}`,
      });
      await parallelBulkWrite(sbAdGroupsSchema, bulkOps);
    }

  } while (nextToken);
}

async function processSDAdGroups({
  profile,
  checkConfigAds,
  dates
}) {
  const getPage = await fetchSDAdGroupsPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let page = 0;

  do {
    const { adGroups } = await getPage(page);

    if (!adGroups.length) break;

    const bulkOps = [];
    adGroups.map((item) => {
      dates.map((reportDate) => {
        bulkOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              campaignId: item.campaignId,
              adGroupId: item.adGroupId,
              reportDate,
            },
            update: {
              $set: {
                ...item,
                reportDate,
              },
            },
            upsert: true,
          },
        });
      });
    })

    if (bulkOps.length) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${++page}, SD-AdGroup Count: ${bulkOps.length}`,
      });
      await parallelBulkWrite(sdAdGroupsSchema, bulkOps);
    }

  } while (true);
}

async function fetchSPAdGroupsPage({
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
}) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(nextToken) {
    const bodyData = {
      maxResults: Number(process.env.BATCH),
      ...(nextToken && { nextToken }),
    };

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/adGroups/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.spAdGroup.v3+json",
        "Content-Type": "application/vnd.spAdGroup.v3+json",
      },
      data: bodyData,
      meta: { configId, tokenKey: "adsAccessToken" },
    }));

    if (response.status !== 200) return { adGroups: [], nextToken: null };

    const body = response.data;
    const adGroups = (body.adGroups || []).map(item => ({
      configId,
      profileId,
      adGroupId: item.adGroupId,
      campaignId: item.campaignId,
      name: item.name,
      currencyCode,
      status: item.state.toUpperCase(),
      timezone,
      defaultBid: item.defaultBid,
      type: "Sponsored Products"
    }));

    return {
      adGroups,
      nextToken: body.nextToken || null,
    };
  };
}

async function fetchSBAdGroupsPage({
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
}) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(nextToken) {
    const bodyData = {
      maxResults: Number(process.env.BATCH),
      ...(nextToken && { nextToken }),
    };

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: `${getAccount.amazonUrl}/sb/v4/adGroups/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.sbadgroupresource.v4+json",
        "Content-Type": "application/vnd.sbadgroupresource.v4+json",
      },
      data: bodyData,
      meta: { configId, tokenKey: "adsAccessToken" },
    }));

    if (response.status !== 200) return { adGroups: [], nextToken: null };

    const body = response.data;
    const adGroups = (body.adGroups || []).map(item => ({
      configId,
      profileId,
      adGroupId: item.adGroupId,
      campaignId: item.campaignId,
      name: item.name,
      currencyCode,
      status: item.state.toUpperCase(),
      timezone,
      type: "Sponsored Brands"
    }));

    return {
      adGroups,
      nextToken: body.nextToken || null,
    };
  };
}

async function fetchSDAdGroupsPage({
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
}) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(page) {
    const response = await retryWithBackoff(() => amazonAxios({
      method: "GET",
      url: `${getAccount.amazonUrl}/sd/adGroups?startIndex=${page * process.env.BATCH}&count=${process.env.BATCH}`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      meta: { configId, tokenKey: "adsAccessToken" },
    }));

    if (response.status !== 200) return { adGroups: [] };

    const body = response.data;
    const adGroups = (body || []).map(item => ({
      configId,
      profileId,
      adGroupId: item.adGroupId,
      campaignId: item.campaignId,
      name: item.name,
      currencyCode,
      status: item.state.toUpperCase(),
      bidOptimization: item.bidOptimization,
      creativeType: item.creativeType,
      timezone,
      type: "Sponsored Display"
    }));

    return { adGroups };
  };
}

async function getSPAdGroups(
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
  reportDate
) {
  return new Promise(async (resolve, reject) => {
    const getAccount = await getProfile(configId, profileId);
    let bodyData = {
      maxResults: 1000,
      includeExtendedDataFields: true,
    };
    const spOptions = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/adGroups/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.spAdGroup.v3+json",
        "Content-Type": "application/vnd.spAdGroup.v3+json",
      },
      meta: { configId: configId, tokenKey: "adsAccessToken" }
    };
    const adGroups = [];
    let nextToken = "";
    function makeRequest() {
      if (nextToken) {
        bodyData.nextToken = nextToken;
      }
      spOptions.data = bodyData;
      retryWithBackoff(() => amazonAxios(spOptions)).then((response) => {
        if (response.status === 200) {
          const body = response.data;
          if (body.adGroups.length > 0) {
            body.adGroups.forEach((item) => {
              let obj = {
                configId,
                profileId,
                adGroupId: item.adGroupId,
                campaignId: item.campaignId,
                name: item.name,
                currencyCode,
                status: item.state.toUpperCase(),
                timezone,
                defaultBid: item.defaultBid,
                type: "Sponsored Products"
              };
              adGroups.push(obj);
            });
            const totalResults = body.totalResults;
            nextToken = body.nextToken;
            if (adGroups.length < totalResults && nextToken) {
              makeRequest();
            } else {
              resolve(adGroups);
            }
          }
          else {
            resolve(adGroups);
          }
        }
        else {
          cron_logs({
            message: `Config ID: ${configId}, Profile ID: ${profileId} SP Adgroup listing err: ${response.data}`,
            log_type: "error",
          });
          resolve(adGroups);
        }
      }).catch((error) => {
        cron_logs({
          message: `Config ID: ${configId}, Profile ID: ${profileId} SP Adgroup listing err: ${error}`,
          log_type: "error",
        });
        resolve(adGroups);
      })
    }
    makeRequest();
  });
}

exports.cronGenerateAdGroupReport = async (generateWeeklyReport = false, generateBiWeeklyReport = false, pastSyncObj = null) => {
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
      : "AdGroups Report";

    const allowedProfiles = await getAllowedSyncProfiles("CAMPAIGNS", "ads", recurring);
    const getProfileId = (await profileSchema.find({ isActive: true, ...(profileId && { profileId }), ...(configId && { configId }) }).lean())
      .filter((p) =>
        allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
      );
    cron_logs({
      message: `[${cronName}] Cron started for ${getProfileId.length} profile(s). (Weekly: ${generateWeeklyReport}, BiWeekly: ${generateBiWeeklyReport}, Recurring: ${recurring})`,
      log_type: "info"
    });

    const reportpromises = getProfileId.map((profile) => limit(async () => {
      if (global.updateTaskProgress) global.updateTaskProgress(generateBiWeeklyReport ? "BiWeekly Report" : generateWeeklyReport ? "Weekly Report" : "AdGroup Report");
      try {
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
            profile.configId,
            startDate,
            endDate,
            checkConfigAds,
            profile.timezone,
            recurring
          );

          cron_logs({
            message: `[${cronName}: Sponsored Products] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSpResponse}`,
            log_type: "info"
          });

          const reportSbResponse = await sbGenerateReport(
            profile.profileId,
            profile.configId,
            startDate,
            endDate,
            checkConfigAds,
            profile.timezone,
            recurring
          );

          cron_logs({
            message: `[${cronName}: Sponsored Brands] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSbResponse}`,
            log_type: "info"
          });

          const reportSdResponse = await sdGenerateReport(
            profile.profileId,
            profile.configId,
            startDate,
            endDate,
            checkConfigAds,
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
            reportName: "AD_GROUPS", startDate, endDate,
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
          } else if ([reportSpResponse, reportSbResponse, reportSdResponse].every(status => status === "COMPLETED") && recurring) {
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

          return reportSpResponse;
        } else {
          return cron_logs({
            message: `[${cronName}] Profile ${profile.name} (${profile.profileId}): Account credentials invalid or disconnected.`,
            log_type: "info"
          });
        }
      } catch (err) {
        cron_logs({
          message: `[${cronName}] Error syncing ad groups for profile ${profile.name} (${profile.profileId}): ${err.stack || err.message}`,
          log_type: "error",
        });
        return "ERROR";
      }
    }))
    await Promise.all(reportpromises);

    return cron_logs({
      message: `[${cronName}] Cron finished successfully for ${getProfileId.length} profile(s).`,
      log_type: "info"
    });

  } catch (error) {
    return cron_logs({
      message: `[AdGroups Report] Error during cron execution: ${error.stack || error.message || error}`,
      log_type: "error",
    });
  }
};

async function spGenerateReport(
  profileId,
  configId,
  startDate,
  endDate,
  checkConfigAds,
  timezone,
  recurring = false,
  forceRefresh = false
) {
  try {
    const getAccount = await getProfile(configId, profileId);

    let existing;
    if (!recurring && !forceRefresh) {
      existing = await reportsSchema
        .findOne({
          startDate,
          endDate,
          profileId,
          configId,
          reportTypeId: "spCampaigns",
          reportName: "AD_GROUPS",
        })
        .lean();

      if (existing && existing.status == "COMPLETED") return "COMPLETED";
      if (existing && existing.status == "STAGED") {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const lastActivity = new Date(existing.updatedAt || existing.createdAt);
        if (lastActivity < twoHoursAgo) {
          await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
          existing = null;
        } else {
          processStagedReportBatches(["adGroup"]).catch(() => {});
          return "STAGED";
        }
      }
    } else if (!forceRefresh) {
      // 1️⃣ Check pending report
      existing = await reportsSchema
        .findOne({
          startDate,
          endDate,
          profileId,
          configId,
          reportTypeId: "spCampaigns",
          reportName: "AD_GROUPS",
          status: "PENDING",
        })
        .lean();
    }

    if (!existing) {
      const createResp = await retryWithBackoff(() => amazonAxios({
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
          startDate,
          endDate,
          configuration: {
            adProduct: "SPONSORED_PRODUCTS",
            groupBy: ["campaign", "adGroup"],
            columns: [
              "campaignId",
              "adGroupId",
              "adGroupName",
              "adStatus",
              "impressions",
              "clicks",
              "cost",
              "purchases1d",
              "purchases7d",
              "purchases14d",
              "purchases30d",
              "date",
              "sales1d",
              "sales7d",
              "sales14d",
            ],
            reportTypeId: "spCampaigns",
            timeUnit: "DAILY",
            format: "GZIP_JSON",
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
        reportName: "AD_GROUPS",
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
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
      meta: { configId: configId, tokenKey: "adsAccessToken" }
    }));

    if (statusResp.data.status !== "COMPLETED") {
      return statusResp.data.status;
    }

    // 3️⃣ Download file
    const zipPath = path.resolve(__dirname, "../../uploads/ad-groups/sp-report", `${existing.reportId}.gz.json`);
    const extractionPath = zipPath.replace(".gz.json", ".json");

    await downloadFile(statusResp.data.url, zipPath);
    await unzipReport(zipPath, extractionPath);

    // 4️⃣ Stage report into Redis Streams for durable scheduled bulk writing
    const importRunId = `run_adgroup_${existing.reportId}_${Date.now()}`;
    try {
      await stageReportFileInRedis({
        importRunId,
        entity: "adGroup",
        filePath: extractionPath,
        meta: {
          profileId,
          configId,
          accountType: getAccount?.type,
          reportId: existing.reportId,
          reportTypeId: "spAdGroups",
          startDate,
          endDate,
          reportCreatedAt: existing.createdAt || statusResp.data?.createdAt || new Date().toISOString(),
        },
      });

      await reportsSchema.updateOne(
        { _id: existing._id },
        { $set: { status: "STAGED", importRunId } }
      );

      // Trigger an immediate processing pass of staged batches
      processStagedReportBatches(["adGroup"]).catch((err) => {
        cron_logs({
          message: `[Ad Group Report SP] Background batch writer invocation error: ${err.message}`,
          log_type: "error",
        });
      });
    } catch (parseErr) {
      cron_logs({
        message: `[Ad Group Report SP] Staging failed for report ${existing.reportId}: ${parseErr.message}`,
        log_type: "error",
      });
      await reportsSchema.updateOne(
        { _id: existing._id },
        { $set: { status: "FAILED" } }
      );
      throw parseErr;
    }

    // ♻️ RECURRING POLL — SAFE RECURSION
    if (recurring) {

      const currentHour = moment().tz(timezone).hour();
      if (currentHour !== 23) {

        // let event loop breathe before next poll
        await new Promise(r => setTimeout(r, 30000));

        return await spGenerateReport(
          profileId,
          configId,
          startDate,
          endDate,
          checkConfigAds,
          timezone,
          recurring
        );
      }
    }

    return "COMPLETED";
  } catch (err) {
    cron_logs({
      message: `[AdGroups Report SP] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(err)}`,
      log_type: "warn",
    });
    return "ERROR";
  }
};

async function sbGenerateReport(
  profileId,
  configId,
  startDate,
  endDate,
  checkConfigAds,
  timezone,
  recurring = false
) {

  const getAccount = await getProfile(configId, profileId);

  let existing;
  if (!recurring) {
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "sbAdGroup",
        reportName: "AD_GROUPS",
      })
      .lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && existing.status == "STAGED") {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const lastActivity = new Date(existing.updatedAt || existing.createdAt);
      if (lastActivity < twoHoursAgo) {
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        existing = null;
      } else {
        processStagedReportBatches(["sbAdGroup"]).catch(() => {});
        return "STAGED";
      }
    }
  } else {
    // 1️⃣ Check pending report
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "sbAdGroup",
        reportName: "AD_GROUPS",
        status: "PENDING",
      })
      .lean();
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
          startDate,
          endDate,
          configuration: {
            adProduct: "SPONSORED_BRANDS",
            groupBy: ["adGroup"],
            columns: [
              "campaignId",
              "adGroupId",
              "adGroupName",
              "adStatus",
              "impressions",
              "clicks",
              "cost",
              "sales",
              "purchases",
              "date",
            ],
            reportTypeId: "sbAdGroup",
            timeUnit: "DAILY",
            format: "GZIP_JSON",
          },
        },
        meta: { configId, tokenKey: "adsAccessToken" },
      }));
    } catch (err) {
      cron_logs({
        message: `[AdGroups Report SB] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(err)}`,
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
      reportName: "AD_GROUPS",
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
      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    },
    meta: { configId: configId, tokenKey: "adsAccessToken" }
  }));

  if (statusResp.data.status !== "COMPLETED") {
    return statusResp.data.status;
  }

  // 3️⃣ Download file
  const zipPath = path.resolve(__dirname, "../../uploads/ad-groups/sb-report", `${existing.reportId}.gz.json`);
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  // 4️⃣ Stream parse + write
  await processReportFileStream(sbAdGroupsSchema, extractionPath, {
    profileId,
    configId
  });

  await reportsSchema.updateOne(
    { _id: existing._id },
    { $set: { status: "COMPLETED" } }
  );

  // ♻️ RECURRING POLL — SAFE RECURSION
  if (recurring) {

    const currentHour = moment().tz(timezone).hour();
    if (currentHour !== 23) {

      // let event loop breathe before next poll
      await new Promise(r => setTimeout(r, 30000));

      return await sbGenerateReport(
        profileId,
        configId,
        startDate,
        endDate,
        checkConfigAds,
        timezone,
        recurring
      );
    }
  }

  return "COMPLETED";
};

async function sdGenerateReport(
  profileId,
  configId,
  startDate,
  endDate,
  checkConfigAds,
  timezone,
  recurring = false
) {

  const getAccount = await getProfile(configId, profileId);

  let existing;
  if (!recurring) {
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "sdAdGroup",
        reportName: "AD_GROUPS",
      })
      .lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && ["STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"].includes(existing.status)) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const lastActivity = new Date(existing.updatedAt || existing.createdAt);
      if (lastActivity < twoHoursAgo) {
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        existing = null;
      } else {
        processStagedReportBatches(["sdAdGroup"]).catch(() => {});
        return existing.status;
      }
    }
  } else {
    // Include staged reports so recurring polls do not request the same report again.
    existing = await reportsSchema
      .findOne({
        startDate,
        endDate,
        profileId,
        configId,
        reportTypeId: "sdAdGroup",
        reportName: "AD_GROUPS",
      })
      .lean();
    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && ["STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"].includes(existing.status)) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const lastActivity = new Date(existing.updatedAt || existing.createdAt);
      if (lastActivity < twoHoursAgo) {
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        existing = null;
      } else {
        processStagedReportBatches(["sdAdGroup"]).catch(() => {});
        return existing.status;
      }
    }
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
          startDate,
          endDate,
          configuration: {
            adProduct: "SPONSORED_DISPLAY",
            groupBy: ["adGroup"],
            columns: [
              "campaignId",
              "adGroupId",
              "adGroupName",
              "impressions",
              "clicks",
              "cost",
              "sales",
              "purchases",
              "date",
            ],
            reportTypeId: "sdAdGroup",
            timeUnit: "DAILY",
            format: "GZIP_JSON",
          },
        },
        meta: { configId, tokenKey: "adsAccessToken" },
      }));
    } catch (err) {
      cron_logs({
        message: `[AdGroups Report SD] Report creation failed for profile ${profileId}: ${getAxiosErrorMessage(err)}`,
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
      reportName: "AD_GROUPS",
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
      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    },
    meta: { configId: configId, tokenKey: "adsAccessToken" }
  }));

  if (statusResp.data.status !== "COMPLETED") {
    return statusResp.data.status;
  }

  // 3️⃣ Download file
  const zipPath = path.resolve(__dirname, "../../uploads/ad-groups/sd-report", `${existing.reportId}.gz.json`);
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  // Stage the full report; only the verified writer marks it COMPLETED.
  const importRunId = `run_sdAdGroup_${existing.reportId}_${Date.now()}`;
  try {
    await stageReportFileInRedis({
      importRunId,
      entity: "sdAdGroup",
      filePath: extractionPath,
      meta: {
        profileId,
        configId,
        accountType: getAccount?.type,
        reportId: existing.reportId,
        reportTypeId: "sdAdGroup",
        startDate,
        endDate,
        reportCreatedAt: existing.createdAt || statusResp.data?.createdAt || new Date().toISOString(),
      },
    });
    await reportsSchema.updateOne(
      { _id: existing._id },
      { $set: { status: "STAGED", importRunId } }
    );
    processStagedReportBatches(["sdAdGroup"]).catch((err) => {
      cron_logs({ message: `[AdGroups Report SD] Batch writer failed for report ${existing.reportId}: ${err.message}`, log_type: "error" });
    });
  } catch (stageErr) {
    cron_logs({ message: `[AdGroups Report SD] Staging failed for report ${existing.reportId}: ${stageErr.message}`, log_type: "error" });
    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
    throw stageErr;
  }

  // ♻️ RECURRING POLL — SAFE RECURSION
  if (recurring) {

    const currentHour = moment().tz(timezone).hour();
    if (currentHour !== 23) {

      // let event loop breathe before next poll
      await new Promise(r => setTimeout(r, 30000));

      return await sdGenerateReport(
        profileId,
        configId,
        startDate,
        endDate,
        checkConfigAds,
        timezone,
        recurring
      );
    }
  }

  return "STAGED";
};

const processReportFileStream = async (
  schema,
  filePath,
  {
    profileId,
    configId,
    accountType
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

      const isSP = schema === adGroupsSchema;
      const isVendor = accountType?.toLowerCase() === "vendor";
      const purchaseField = isSP ? (isVendor ? "purchases14d" : "purchases7d") : "purchases";
      const salesField = isSP ? (isVendor ? "sales14d" : "sales7d") : "sales";
      const context = `adGroup report profile=${profileId} config=${configId} type=${accountType || 'unknown'} schema=${isSP ? 'SP' : 'SB/SD'}`;

      let orders = 0;
      let sales = 0;
      let impressions = 0;
      let clicks = 0;
      let spend = 0;

      try {
        impressions = parseStrictMetric(value.impressions, "impressions", context);
        clicks = parseStrictMetric(value.clicks, "clicks", context);
        spend = parseStrictMetric(value.spend ?? value.cost, "spend", context);
        if (isSP) {
          orders = parseStrictMetric(value[purchaseField], purchaseField, context);
          sales = parseStrictMetric(value[salesField], salesField, context);
        } else {
          // Preserve existing SB/SD contracts
          orders = parseStrictMetric(value.purchases ?? value.purchases7d ?? 0, "purchases", context);
          sales = parseStrictMetric(value.sales ?? value.sales7d ?? 0, "sales", context);
        }
      } catch (err) {
        pipeline.destroy(err);
        return reject(err);
      }

      const baseData = {
        impressions,
        clicks,
        spend,
        sales,
        orders,
      };

      const metrics = calcMetrics(baseData);

      bulkOps.push({
        updateOne: {
          filter: {
            profileId,
            configId,
            campaignId: value.campaignId,
            adGroupId: value.adGroupId,
            reportDate: value.date,
          },
          update: {
            $set: {
              impressions,
              clicks,
              sales,
              spend,
              orders,

              ...metrics
            }
          },
          upsert: true
        },
      });

      if (bulkOps.length >= BULK_SIZE) {
        pipeline.pause();
        try {
          await parallelBulkWrite(schema, bulkOps.splice(0));
          pipeline.resume();
        } catch (bulkErr) {
          pipeline.destroy(bulkErr);
          return reject(bulkErr);
        }
      } else {
        pipeline.resume();
      }
    });

    pipeline.on("end", async () => {
      try {
        if (bulkOps && bulkOps.length > 0) {
          await parallelBulkWrite(schema, bulkOps);
        }
        pipeline.removeAllListeners();
        pipeline.destroy();
        bulkOps = null;
        resolve();
      } catch (endErr) {
        pipeline.removeAllListeners();
        pipeline.destroy();
        bulkOps = null;
        reject(endErr);
      }
    });

    pipeline.on("error", err => {
      pipeline.removeAllListeners();
      pipeline.destroy();
      bulkOps = null;
      reject(err);
    });
  });
};

exports.createAdGroup = async (req, res) => {
  const type = req.body.type;
  try {
    if (type == "Sponsored Products") {
      await createSPAdGroup(req, res);
    } else if (type == "Sponsored Brands") {
      await createSBAdGroup(req, res);
    } else if (type == "Sponsored Display") {
      await createSDAdGroup(req, res);
    } else {
      return res.status(203).send({
        isSuccess: false,
        message: "Type is required!",
      });
    }
  } catch (error) {
    write_logs({ message: `[createAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(req.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

async function createSPAdGroup(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, campaignId, defaultBid, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getCampaign = await adGroupsSchema.findOne({
      campaignId,
      profileId,
      configId,
      name: nameRegex,
    }).lean();
    if (getCampaign) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      adGroups: [
        {
          name,
          state,
          defaultBid,
          campaignId,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const checkConfigAds = await getAccessToken(configId);
    const getProfile = await profileSchema.findOne({ configId, profileId }).lean();
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sp/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.spAdGroup.v3+json",
    //     "Content-Type": "application/vnd.spAdGroup.v3+json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: "An internal server error occurred", error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       configId,
    //       type,
    //       currencyCode: getProfile.currencyCode,
    //       adGroupId: responseBody.adGroup.success[0].adGroupId,
    //       campaignId: responseBody.adGroup.success[0].adGroup.campaignId,
    //       name: responseBody.adGroup.success[0].adGroup.name,
    //       status: responseBody.adGroup.success[0].adGroup.state,
    //       reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
    //       defaultBid: responseBody.adGroup.success[0].adGroup.defaultBid,
    //       timezone: getProfile.timezone,
    //     };
    //     const createAdGroup = new adGroupsSchema(create);
    //     await createAdGroup.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored products adgroup created successfully.",
    //       createAdGroup,
    //     });
    //   }
    // });
    const create = {
      profileId,
      configId,
      currencyCode: getProfile.currencyCode,
      campaignId,
      adGroupId: Math.floor(100000 + Math.random() * 900000),
      name,
      defaultBid,
      type: "Sponsored Products",
      reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
      status: state,
      timezone: getProfile.timezone,
    };
    const createAdGroup = new adGroupsSchema(create);
    await createAdGroup.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored products adgroup created successfully.",
      createAdGroup,
    });
  } catch (error) {
    write_logs({ message: `[createSPAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(req.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

async function createSBAdGroup(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, campaignId, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getCampaign = await adGroupsSchema.findOne({
      campaignId,
      configId,
      profileId,
      name: nameRegex,
    }).lean();
    if (getCampaign) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      adGroups: [
        {
          name,
          state,
          campaignId,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const getProfile = await profileSchema.findOne({ configId, profileId }).lean();
    const checkConfigAds = await getAccessToken(configId);
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sb/v4/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.sbadgroupresource.v4+json",
    //     "Content-Type": "application/vnd.sbadgroupresource.v4+json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: "An internal server error occurred", error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       configId,
    //       type,
    //       currencyCode: getProfile.currencyCode,
    //       adGroupId: responseBody.adGroup.success[0].adGroupId,
    //       campaignId: responseBody.adGroup.success[0].adGroup.campaignId,
    //       name: responseBody.adGroup.success[0].adGroup.name,
    //       status: responseBody.adGroup.success[0].adGroup.state,
    //       reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
    //       defaultBid: "",
    //       timezone: getProfile.timezone,
    //     };
    //     const createAdGroup = new adGroupsSchema(create);
    //     await createAdGroup.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored brands adgroup created successfully.",
    //       createAdGroup,
    //     });
    //   }
    // });
    const create = {
      profileId,
      configId,
      currencyCode: getProfile.currencyCode,
      campaignId,
      adGroupId: Math.floor(100000 + Math.random() * 900000),
      name,
      defaultBid: "",
      type: "Sponsored Brands",
      reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
      status: state,
      timezone: getProfile.timezone,
    };
    const createAdGroup = new adGroupsSchema(create);
    await createAdGroup.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored brands adgroup created successfully.",
      createAdGroup,
    });
  } catch (error) {
    write_logs({ message: `[createSBAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

async function createSDAdGroup(req, res) {
  try {
    const configId = req?.config?.configId;
    let {
      profileId,
      campaignId,
      defaultBid,
      state,
      name,
      bidOptimization,
      creativeType,
    } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getCampaign = await adGroupsSchema.findOne({
      campaignId,
      configId,
      profileId,
      name: nameRegex,
    }).lean();
    if (getCampaign) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = [
      {
        name,
        state: state.toLowerCase(),
        defaultBid,
        campaignId,
        bidOptimization,
        creativeType,
      },
    ];
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const getProfile = await profileSchema.findOne({ configId, profileId }).lean();
    const checkConfigAds = await getAccessToken(configId);
    const costType = bidOptimization == "reach" ? "vcpm" : "cpc";
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sd/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Accept: "application/json",
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: "An internal server error occurred", error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    //     const costType = bidOptimization == "reach" ? "vcpm" : "cpc";
    //     const create = {
    //       profileId,
    //       configId,
    //       type,
    //       currencyCode: getProfile.currencyCode,
    //       adGroupId: responseBody[0].adGroupId,
    //       campaignId,
    //       name,
    //       status: state.toUpperCase(),
    //       reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
    //       defaultBid,
    //       costType: costType ? costType : "cpc",
    //       bidOptimization: bidOptimization ? bidOptimization : "clicks",
    //       creativeType: creativeType ? creativeType : null,
    //       timezone: getProfile.timezone,
    //     };
    //     const createAdGroup = new adGroupsSchema(create);
    //     await createAdGroup.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored display adgroup created successfully.",
    //       createAdGroup,
    //     });
    //   }
    // });
    const create = {
      profileId,
      configId,
      currencyCode: getProfile.currencyCode,
      campaignId,
      adGroupId: Math.floor(100000 + Math.random() * 900000),
      name,
      defaultBid,
      type: "Sponsored Display",
      status: state,
      costType: costType ? costType : "cpc",
      bidOptimization: bidOptimization ? bidOptimization : "clicks",
      creativeType: creativeType ? creativeType : null,
      timezone: getProfile.timezone,
    };
    const createAdGroup = new adGroupsSchema(create);
    await createAdGroup.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored display adgroup created successfully.",
      createAdGroup,
    });
  } catch (error) {
    write_logs({ message: `[createSDAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.updateAdGroup = async (req, res) => {
  const type = req.body.type;
  try {
    if (type == "Sponsored Products") {
      await updateSPAdGroup(req, res);
    } else if (type == "Sponsored Brands") {
      await updateSBAdGroup(req, res);
    } else if (type == "Sponsored Display") {
      await updateSDAdGroup(req, res);
    } else {
      return res.status(203).send({
        isSuccess: false,
        message: "Type is required!",
      });
    }
  } catch (error) {
    write_logs({ message: `[updateAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res
      .status(203)
      .send({ isSuccess: false, message: "An internal server error occurred", error });
  }
};

async function updateSPAdGroup(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, campaignId, defaultBid, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getAdGroup = await adGroupsSchema.findOne({
      adGroupId: { $ne: req.params.id },
      name: nameRegex,
      configId,
      profileId,
      campaignId,
    }).lean();
    if (getAdGroup) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      adGroups: [
        {
          name,
          state,
          adGroupId: req.params.id,
          defaultBid,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(configId);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sp/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.spAdGroup.v3+json",
    //     "Content-Type": "application/vnd.spAdGroup.v3+json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: "An internal server error occurred", error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    // const latestData = await adGroupsSchema
    // .findOne({ adGroupId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await adGroupsSchema
    //       .findOneAndUpdate(
    //         { adGroupId: req.params.id, reportDate: latestData.reportDate },
    //         {
    //           name,
    //           status: state,
    //           defaultBid,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((adGroup) => {
    //         return res.status(200).send({
    //           data: adGroup,
    //           message: `AdGroups data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
    //         return res.status(203).send({
    //           error: "An internal server error occurred",
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      name,
      status: state,
      defaultBid,
    };
    const latestData = await adGroupsSchema
      .findOne({ configId, adGroupId: req.params.id })
      .sort({ reportDate: -1 });
    await adGroupsSchema
      .findOneAndUpdate(
        {
          configId,
          adGroupId: req.params.id,
          reportDate: latestData.reportDate,
        },
        updateData,
        {
          new: true,
        }
      )
      .then((adGroup) => {
        if (!adGroup) {
          return res.status(203).send({
            message: `Adgroup not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: adGroup,
          message: `Adgroup data updated successfully.`,
          isSuccess: true,
        });
      })
      .catch((error) => {
        write_logs({ message: `[updateSPAdGroup Promise Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    write_logs({ message: `[updateSPAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

async function updateSBAdGroup(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, campaignId, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getAdGroup = await adGroupsSchema.findOne({
      adGroupId: { $ne: req.params.id },
      name: nameRegex,
      configId,
      profileId,
      campaignId,
    }).lean();
    if (getAdGroup) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      adGroups: [
        {
          name,
          state,
          adGroupId: req.params.id,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(configId);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sb/v4/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.sbadgroupresource.v4+json",
    //     "Content-Type": "application/vnd.sbadgroupresource.v4+json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: "An internal server error occurred", error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    // const latestData = await adGroupsSchema
    // .findOne({ adGroupId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await adGroupsSchema
    //       .findOneAndUpdate(
    //         { adGroupId: req.params.id, reportDate: latestData.reportDate },
    //         {
    //           name,
    //           status: state,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((adGroup) => {
    //         return res.status(200).send({
    //           data: adGroup,
    //           message: `AdGroups data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
    //         return res.status(203).send({
    //           error: "An internal server error occurred",
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      name,
      status: state,
    };
    const latestData = await adGroupsSchema
      .findOne({ configId, adGroupId: req.params.id })
      .sort({ reportDate: -1 });
    await adGroupsSchema
      .findOneAndUpdate(
        {
          configId,
          adGroupId: req.params.id,
          reportDate: latestData.reportDate,
        },
        updateData,
        { new: true }
      )
      .then((adGroup) => {
        if (!adGroup) {
          return res.status(203).send({
            message: `Adgroup not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: adGroup,
          message: `Adgroup data updated successfully.`,
          isSuccess: true,
        });
      })
      .catch((error) => {
        write_logs({ message: `[updateSBAdGroup Promise Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    write_logs({ message: `[updateSBAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

async function updateSDAdGroup(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, campaignId, defaultBid, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getAdGroup = await adGroupsSchema.findOne({
      adGroupId: { $ne: req.params.id },
      name: nameRegex,
      configId,
      profileId,
      campaignId,
    }).lean();
    if (getAdGroup) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = [
      {
        name,
        state: state.toLowerCase(),
        adGroupId: req.params.id,
        defaultBid,
      },
    ];
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(configId);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sd/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Accept: "application/json",
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: "An internal server error occurred", error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    // const latestData = await adGroupsSchema
    // .findOne({ adGroupId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await adGroupsSchema
    //       .findOneAndUpdate(
    //         { adGroupId: req.params.id, reportDate: latestData.reportDate },
    //         {
    //           name,
    //           status: state.toUpperCase(),
    //           defaultBid,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((adGroup) => {
    //         return res.status(200).send({
    //           data: adGroup,
    //           message: `AdGroups data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
    //         return res.status(203).send({
    //           error: "An internal server error occurred",
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      name,
      status: state,
      defaultBid,
    };
    const latestData = await adGroupsSchema
      .findOne({ configId, adGroupId: req.params.id })
      .sort({ reportDate: -1 });
    await adGroupsSchema
      .findOneAndUpdate(
        {
          configId,
          adGroupId: req.params.id,
          reportDate: latestData.reportDate,
        },
        updateData,
        { new: true }
      )
      .then((adGroup) => {
        if (!adGroup) {
          return res.status(203).send({
            message: `Adgroup not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: adGroup,
          message: `Adgroup data updated successfully.`,
          isSuccess: true,
        });
      })
      .catch((error) => {
        write_logs({ message: `[updateSDAdGroup Promise Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
        return res.status(203).send({
          message: "Something went wrong, please try again!",
          isSuccess: false,
          error: "An internal server error occurred",
        });
      });
  } catch (error) {
    write_logs({ message: `[updateSDAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.listAdGroups = async (req, res) => {
  const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
  const adType = req.adType;
  const { adTypeAdGroupSchema } = req.models;

  try {
    let {
      fromDate,
      toDate,
      profileId,
      pageNo,
      perPage,
      type,
      status,
      searchName,
      fieldName,
      fieldOperator,
      fieldValue,
      conditions,
      extraFieldOperator,
      extraFieldValue,
      sortType,
    } = req.body;
    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }
    pageNo = pageNo ? pageNo : 1;
    perPage = perPage ? perPage : 10;
    const getProfile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
    let filter = {
      configId,
      profileId: Number(profileId),
    };
    if (type) {
      filter.type = type;
    }
    if (status) {
      filter.status = status;
    }
    if (fromDate && toDate) {
      filter.reportDate = { $gte: fromDate, $lte: toDate };
    } else {
      fromDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
      toDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
      filter.reportDate = { $gte: fromDate, $lte: toDate };
    }
    if (searchName) {
      filter.name = { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") };
    }
    const getAdGroups = [
      {
        $match: filter,
      },
      {
        $sort: {
          reportDate: -1,
        },
      },
      {
        $group: {
          _id: {
            campaignId: "$campaignId",
            adGroupId: "$adGroupId",
          },
          adGroup: {
            $first: "$$ROOT",
          },
          spend: {
            $sum: "$spend",
          },
          sales: {
            $sum: "$sales",
          },
          impressions: {
            $sum: "$impressions",
          },
          clicks: {
            $sum: "$clicks",
          },
          orders: {
            $sum: "$orders",
          },
        },
      },
      {
        $lookup: {
          from: AD_TYPE_COLLECTIONS?.[adType]?.["campaign"],
          localField: "adGroup.campaignId",
          foreignField: "campaignId",
          as: "campaign",
        },
      },
      {
        $addFields: {
          campaignName: {
            $arrayElemAt: [
              {
                $slice: ["$campaign.name", -1],
              },
              0,
            ],
          },
        },
      },
      {
        $project: {
          _id: 0,
          adGroupId: "$_id.adGroupId",
          type: "$adGroup.type",
          campaignId: "$adGroup.campaignId",
          campaignName: 1,
          name: "$adGroup.name",
          createdAt: "$adGroup.createdAt",
          updatedAt: "$adGroup.updatedAt",
          defaultBid: "$adGroup.defaultBid",
          status: "$adGroup.status",
          bidOptimization: "$adGroup.bidOptimization",
          creativeType: "$adGroup.creativeType",
          costType: "$adGroup.costType",
          clicks: 1,
          cpc: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$clicks", 0] },
                  then: { $divide: ["$spend", "$clicks"] },
                  else: 0,
                },
              },
              2,
            ],
          },
          impressions: 1,
          sales: { $round: ["$sales", 2] },
          spend: { $round: ["$spend", 2] },
          orders: 1,
          acos: {
            $round: [
              {
                $cond: {
                  if: {
                    $gt: ["$sales", 0],
                  },
                  then: {
                    $multiply: [
                      {
                        $divide: ["$spend", "$sales"],
                      },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          roas: {
            $round: [
              {
                $cond: {
                  if: {
                    $gt: ["$spend", 0],
                  },
                  then: {
                    $divide: ["$sales", "$spend"],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
        },
      },
      {
        $sort: { acos: -1, updatedAt: -1 },
      },
    ];
    if (sortType === "ASC") {
      getAdGroups.push({ $sort: { [fieldName]: 1 } });
    } else if (sortType === "DESC") {
      getAdGroups.push({ $sort: { [fieldName]: -1 } });
    }
    const adGroupsResult = await adTypeAdGroupSchema.aggregate(getAdGroups);
    let getAdGroupsData = adGroupsResult;

    if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
      getAdGroupsData = getAdGroupsData.filter((item) => {
        let fieldConditionMet = false;
        let extraFieldConditionMet = false;

        switch (fieldOperator) {
          case "$gt":
            fieldConditionMet = item[fieldName] > fieldValue;
            break;
          case "$gte":
            fieldConditionMet = item[fieldName] >= fieldValue;
            break;
          case "$lt":
            fieldConditionMet = item[fieldName] < fieldValue;
            break;
          case "$lte":
            fieldConditionMet = item[fieldName] <= fieldValue;
            break;
          case "$eq":
            fieldConditionMet = item[fieldName] === fieldValue;
            break;
          default:
            fieldConditionMet = true;
            break;
        }

        switch (extraFieldOperator) {
          case "$gt":
            extraFieldConditionMet = item[fieldName] > extraFieldValue;
            break;
          case "$gte":
            extraFieldConditionMet = item[fieldName] >= extraFieldValue;
            break;
          case "$lt":
            extraFieldConditionMet = item[fieldName] < extraFieldValue;
            break;
          case "$lte":
            extraFieldConditionMet = item[fieldName] <= extraFieldValue;
            break;
          case "$eq":
            extraFieldConditionMet = item[fieldName] === extraFieldValue;
            break;
          default:
            extraFieldConditionMet = true;
            break;
        }

        if (conditions === "AND") {
          return fieldConditionMet && extraFieldConditionMet;
        } else if (conditions === "OR") {
          return fieldConditionMet || extraFieldConditionMet;
        } else {
          return true;
        }
      });
    } else if (fieldOperator !== undefined && fieldValue !== undefined) {
      // Handle single condition
      getAdGroupsData = getAdGroupsData.filter((item) => {
        let fieldConditionMet = false;

        switch (fieldOperator) {
          case "$gt":
            fieldConditionMet = item[fieldName] > fieldValue;
            break;
          case "$gte":
            fieldConditionMet = item[fieldName] >= fieldValue;
            break;
          case "$lt":
            fieldConditionMet = item[fieldName] < fieldValue;
            break;
          case "$lte":
            fieldConditionMet = item[fieldName] <= fieldValue;
            break;
          case "$eq":
            fieldConditionMet = item[fieldName] === fieldValue;
            break;
          default:
            fieldConditionMet = true;
            break;
        }

        return fieldConditionMet;
      });
    }
    const totalRecords = getAdGroupsData.length;
    const startIndex = (pageNo - 1) * perPage;
    const endIndex = pageNo * perPage;
    const paginatedData = getAdGroupsData.slice(startIndex, endIndex);
    return res.status(200).send({
      isSuccess: true,
      getAdGroups: paginatedData,
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
    });
  } catch (error) {
    write_logs({ message: `[listAdGroups Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.listAdGroupNameBySortingAcos = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, type } = req.body;
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required!",
        isSuccess: false,
      });
    }
    if (!type) {
      return res
        .status(203)
        .send({ message: "Type is required!", isSuccess: false });
    }
    const adGroups = await adGroupsSchema.aggregate([
      {
        $match: {
          profileId,
          configId: new ObjectId(configId),
          type,
          status: {
            $in: ["ENABLED", "PAUSED", "ARCHIVED"],
          },
        },
      },
      {
        $group: {
          _id: "$name",
          name: { $first: "$name" },
          adGroupId: { $first: "$adGroupId" },
          type: { $first: "$type" },
          acos: { $first: "$acos" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          impressions: { $sum: "$impressions" },
          cpc: { $sum: "$cpc" },
          clicks: { $sum: "$clicks" },
        },
      },
      {
        $project: {
          name: 1,
          adGroupId: 1,
          type: 1,
          acos: 1,
          _id: 0,
          clicks: 1,
          cpc: { $round: ["$cpc", 2] },
          impressions: 1,
          sales: { $round: ["$sales", 2] },
          spend: { $round: ["$spend", 2] },
          acos: {
            $round: [
              {
                $cond: {
                  if: {
                    $gt: ["$sales", 0],
                  },
                  then: {
                    $multiply: [
                      {
                        $divide: ["$spend", "$sales"],
                      },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          roas: {
            $round: [
              {
                $cond: {
                  if: {
                    $gt: ["$spend", 0],
                  },
                  then: {
                    $divide: ["$sales", "$spend"],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
        },
      },
      {
        $sort: { acos: -1 },
      },
    ]);
    if (adGroups.length === 0) {
      return res.status(203).send({
        message: `AdGroup not found!`,
        isSuccess: false,
      });
    }
    return res.status(200).send({
      data: adGroups,
      totalRecords: adGroups.length,
      message: `AdGroup list successfully.`,
      isSuccess: true,
    });
  } catch (error) {
    write_logs({ message: `[listAdGroupNameBySortingAcos Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.listAdGroupName = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, campaignId } = req.body;
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required!",
        isSuccess: false,
      });
    }
    if (!campaignId) {
      return res
        .status(203)
        .send({ message: "CampaignId is required!", isSuccess: false });
    }
    const adGroups = await adGroupsSchema.aggregate([
      {
        $match: {
          profileId,
          configId: new ObjectId(configId),
          campaignId,
          status: {
            $in: ["ENABLED", "PAUSED"],
          },
        },
      },
      {
        $sort: {
          reportDate: -1,
        },
      },
      {
        $group: {
          _id: "$name",
          name: { $first: "$name" },
          campaignId: { $first: "$campaignId" },
          adGroupId: { $first: "$adGroupId" },
          type: { $first: "$type" },
        },
      },
      {
        $project: {
          name: 1,
          campaignId: 1,
          adGroupId: 1,
          type: 1,
          acos: 1,
          _id: 0,
        },
      },
    ]);
    if (adGroups.length === 0) {
      return res.status(203).send({
        message: `AdGroup not found!`,
        isSuccess: false,
      });
    }
    return res.status(200).send({
      data: adGroups,
      totalRecords: adGroups.length,
      message: `AdGroup list successfully.`,
      isSuccess: true,
    });
  } catch (error) {
    write_logs({ message: `[listAdGroupName Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

RegExp.escape = function (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

exports.manualListAdGroupsFromAmazon = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "AdGroups Listing",
      isActive: false,
    }).lean();
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your adGroup listing status is deactive.`,
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
    if (!(getCron.cronName == "AdGroups Listing")) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Enter correct cron id." });
    }
    const getProfileId = await profileSchema.find({
      profileId,
      configId,
      isActive: true,
    }).lean();
    let reportDate = "";
    await Promise.all(
      getProfileId.map(async (i) => {
        const checkConfigAds = await getAccessToken(i.configId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {
          reportDate = moment().tz(i.timezone).format("YYYY-MM-DD");
          const getCronData = await cronJobHistorySchema.findOne({
            configId: i.configId,
            profileId: i.profileId,
            cronName: "AdGroups Listing",
            status: "PENDING",
            historyDate: reportDate,
          }).lean();
          if (!getCronData) {
            const createCronHistory = new cronJobHistorySchema({
              configId: i.configId,
              profileId: i.profileId,
              cronName: "AdGroups Listing",
              status: "PENDING",
              historyDate: reportDate,
            });
            await createCronHistory.save();
          }

          let adGroups = [];

          const spAdGroups = await getSPAdGroups(
            i.configId,
            i.profileId,
            checkConfigAds,
            i.currencyCode,
            i.timezone,
            reportDate
          );

          adGroups = adGroups.concat(spAdGroups);

          if (adGroups.length > 0) {
            await Promise.all(
              adGroups.map(async (item) => {
                const getAdGroups = await adGroupsSchema.findOne({
                  configId: item.configId,
                  profileId: item.profileId,
                  campaignId: item.campaignId,
                  adGroupId: item.adGroupId,
                  reportDate,
                }).lean();
                if (!getAdGroups) {
                  let createAdGroups = new adGroupsSchema(item);
                  await createAdGroups.save();
                } else {
                  await adGroupsSchema.findByIdAndUpdate(
                    { _id: getAdGroups._id },
                    item,
                    { new: true }
                  );
                }
              })
            );
          }
        } else {
          return res.status(203).send({
            isSuccess: false,
            message: `Account disconnected in adgroup listing.`,
          });
        }
      })
    );
    const getUpdateCronData = await cronJobHistorySchema.findOne({
      configId: configId,
      profileId: profileId,
      cronName: "AdGroups Listing",
      status: "PENDING",
      historyDate: reportDate,
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
      isSuccess: true,
      message: "AdGroups listing successfully.",
    });
  } catch (error) {
    write_logs({ message: `[manualListAdGroupsFromAmazon Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.manualGenerateReport = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "AdGroup Report",
      isActive: false,
    }).lean();
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your adGroup report status is deactive.`,
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
    if (!(getCron.cronName == "AdGroup Report")) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Enter correct cron id." });
    }
    const getProfile = await profileSchema.findOne({
      profileId,
      configId,
      isActive: true,
    }).lean();
    const startDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
    const endDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
    const checkConfigAds = await getAccessToken(getProfile.configId);
    if (checkConfigAds && checkConfigAds.adsAccessToken) {
      const getCronData = await cronJobHistorySchema.findOne({
        configId: getProfile.configId,
        profileId: getProfile.profileId,
        cronName: "AdGroup Report",
        status: "PENDING",
        historyDate: startDate,
      }).lean();
      if (!getCronData) {
        const createCronHistory = new cronJobHistorySchema({
          configId: getProfile.configId,
          profileId: getProfile.profileId,
          cronName: "AdGroup Report",
          status: "PENDING",
          historyDate: startDate,
        });
        await createCronHistory.save();
      }
      let responseSPStatus = "PENDING";
      while (
        responseSPStatus != "COMPLETED"
      ) {
        if (responseSPStatus != "COMPLETED" && responseSPStatus != "ERROR") {
          const reportSpResponse = await spGenerateReport(
            getProfile.profileId,
            getProfile.configId,
            startDate,
            endDate,
            checkConfigAds,
            getProfile.timezone,
          );
          console.log("SP", reportSpResponse);
          responseSPStatus = reportSpResponse;
        }
        if (
          responseSPStatus != "COMPLETED"
        ) {
          if (
            responseSPStatus != "ERROR"
          ) {
            await new Promise((resolve) => setTimeout(resolve, 60000));
          }
        }
      }
      const getUpdateCronData = await cronJobHistorySchema.findOne({
        configId: configId,
        profileId: profileId,
        cronName: "AdGroup Report",
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
        message: "Ad Group Report updated successfully..",
        isSuccess: true,
      });
    } else {
      return res.status(203).send({
        message: `Account disconnected in adgroup report.`,
        isSuccess: false,
      });
    }
  } catch (error) {
    write_logs({ message: `[manualGenerateReport Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getAdGroupsByCampaign = async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
    const { adTypeAdGroupSchema, adTypeTargetingSchema, adTypeProductAdsSchema } = req.models || {};
    const targetAdGroupSchema = adTypeAdGroupSchema || adGroupsSchema;
    const targetTargetingSchema = adTypeTargetingSchema;
    const targetProductAdsSchema = adTypeProductAdsSchema;

    let {
      pageNo = 1,
      perPage = 10,
      fromDate,
      toDate,
      profileId,
      status,
      searchName,
      fieldName = "totalSpend",
      sortType = "DESC",
    } = req.body;

    if (!profileId) {
      return res.status(203).send({ message: "Profile id required!", isSuccess: false });
    }

    const parsedConfigId = configId && mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId;

    let matchFilter = {
      campaignId: !isNaN(campaignId) ? campaignId : req.params.id,
      profileId: Number(profileId),
      ...(parsedConfigId && { configId: parsedConfigId }),
    };

    if (fromDate && toDate) {
      matchFilter.reportDate = { $gte: fromDate, $lte: toDate };
    }
    if (status) {
      matchFilter.status = status;
    }

    const sortDir = String(sortType).toUpperCase() === "ASC" ? 1 : -1;
    const skip = (Number(pageNo) - 1) * Number(perPage);

    const aggregatePipeline = [
      { $match: matchFilter },
      { $sort: { reportDate: -1 } },
      {
        $group: {
          _id: "$adGroupId",
          adGroupId: { $first: "$adGroupId" },
          campaignId: { $first: "$campaignId" },
          name: { $first: "$name" },
          status: { $first: "$status" },
          defaultBid: { $first: { $ifNull: ["$defaultBid", 0] } },
          totalSpend: { $sum: "$spend" },
          totalSales: { $sum: "$sales" },
          totalImpressions: { $sum: "$impressions" },
          totalClicks: { $sum: "$clicks" },
          totalOrders: { $sum: "$orders" },
          totalCpc: { $sum: "$cpc" },
        },
      },
      {
        $project: {
          _id: 0,
          adGroupId: 1,
          campaignId: 1,
          name: 1,
          status: 1,
          defaultBid: { $round: ["$defaultBid", 2] },
          totalSpend: { $round: ["$totalSpend", 2] },
          totalSales: { $round: ["$totalSales", 2] },
          totalImpressions: 1,
          totalClicks: 1,
          totalOrders: 1,
          totalCpc: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalClicks", 0] },
                  { $divide: ["$totalSpend", "$totalClicks"] },
                  0,
                ],
              },
              2,
            ],
          },
          totalCtr: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalImpressions", 0] },
                  { $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] },
                  0,
                ],
              },
              2,
            ],
          },
          totalCvr: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalClicks", 0] },
                  { $multiply: [{ $divide: ["$totalOrders", "$totalClicks"] }, 100] },
                  0,
                ],
              },
              2,
            ],
          },
          totalAcos: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalSales", 0] },
                  { $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] },
                  0,
                ],
              },
              2,
            ],
          },
          totalRoas: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalSpend", 0] },
                  { $divide: ["$totalSales", "$totalSpend"] },
                  0,
                ],
              },
              2,
            ],
          },
        },
      },
    ];

    if (searchName && searchName.trim()) {
      aggregatePipeline.push({
        $match: {
          name: { $regex: new RegExp(searchName.trim(), "i") },
        },
      });
    }

    const groupedAdGroups = await targetAdGroupSchema.aggregate(aggregatePipeline);
    const totalRecords = groupedAdGroups.length;

    const totalRow = groupedAdGroups.reduce(
      (acc, item) => {
        acc.totalSpend += item.totalSpend || 0;
        acc.totalSales += item.totalSales || 0;
        acc.totalImpressions += item.totalImpressions || 0;
        acc.totalClicks += item.totalClicks || 0;
        acc.totalOrders += item.totalOrders || 0;
        return acc;
      },
      {
        totalSpend: 0,
        totalSales: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalOrders: 0,
      }
    );

    totalRow.totalSpend = Math.round(totalRow.totalSpend * 100) / 100;
    totalRow.totalSales = Math.round(totalRow.totalSales * 100) / 100;
    totalRow.totalCpc = totalRow.totalClicks > 0 ? Math.round((totalRow.totalSpend / totalRow.totalClicks) * 100) / 100 : 0;
    totalRow.totalCtr = totalRow.totalImpressions > 0 ? Math.round(((totalRow.totalClicks / totalRow.totalImpressions) * 100) * 100) / 100 : 0;
    totalRow.totalCvr = totalRow.totalClicks > 0 ? Math.round(((totalRow.totalOrders / totalRow.totalClicks) * 100) * 100) / 100 : 0;
    totalRow.totalAcos = totalRow.totalSales > 0 ? Math.round(((totalRow.totalSpend / totalRow.totalSales) * 100) * 100) / 100 : 0;
    totalRow.totalRoas = totalRow.totalSpend > 0 ? Math.round((totalRow.totalSales / totalRow.totalSpend) * 100) / 100 : 0;
    totalRow.name = "Total";
    totalRow.isTotalRow = true;

    const sortKey = fieldName || "totalSpend";
    groupedAdGroups.sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === "string") {
        return sortDir === 1 ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 1 ? aVal - bVal : bVal - aVal;
    });

    const paginatedAdGroups = groupedAdGroups.slice(skip, skip + Number(perPage));
    const adGroupIds = paginatedAdGroups.map((ag) => ag.adGroupId);

    let targetsCountMap = {};
    let productsCountMap = {};

    if (adGroupIds.length > 0) {
      if (targetTargetingSchema) {
        try {
          const targetCounts = await targetTargetingSchema.aggregate([
            {
              $match: {
                campaignId: !isNaN(campaignId) ? campaignId : req.params.id,
                adGroupId: { $in: adGroupIds },
                profileId: Number(profileId),
                ...(parsedConfigId && { configId: parsedConfigId }),
              },
            },
            {
              $group: {
                _id: { adGroupId: "$adGroupId", targetId: { $ifNull: ["$targetId", "$keywordId"] } },
              },
            },
            {
              $group: {
                _id: "$_id.adGroupId",
                count: { $sum: 1 },
              },
            },
          ]);
          targetCounts.forEach((tc) => {
            targetsCountMap[tc._id] = tc.count;
          });
        } catch (e) {}
      }

      if (targetProductAdsSchema) {
        try {
          const productCounts = await targetProductAdsSchema.aggregate([
            {
              $match: {
                campaignId: !isNaN(campaignId) ? campaignId : req.params.id,
                adGroupId: { $in: adGroupIds },
                profileId: Number(profileId),
                ...(parsedConfigId && { configId: parsedConfigId }),
              },
            },
            {
              $group: {
                _id: {
                  adGroupId: "$adGroupId",
                  adKey: { $ifNull: ["$adId", { $concat: [{ $ifNull: ["$sku", ""] }, "_", { $ifNull: ["$asins", ""] }] }] },
                },
              },
            },
            {
              $group: {
                _id: "$_id.adGroupId",
                count: { $sum: 1 },
              },
            },
          ]);
          productCounts.forEach((pc) => {
            productsCountMap[pc._id] = pc.count;
          });
        } catch (e) {}
      }
    }

    const enrichedAdGroups = paginatedAdGroups.map((ag) => ({
      ...ag,
      totalTargets: targetsCountMap[ag.adGroupId] || 0,
      totalProducts: productsCountMap[ag.adGroupId] || 0,
    }));

    return res.status(200).send({
      isSuccess: true,
      getAdGroupsData: enrichedAdGroups,
      totalAdGroupData: totalRecords,
      totalRow,
      currentPageNo: Number(pageNo),
      perPage: Number(perPage),
      totalPages: Math.ceil(totalRecords / Number(perPage)),
    });
  } catch (error) {
    write_logs({
      message: `[getAdGroupsByCampaign Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
      log_type: "error",
    });
    return res.status(500).send({
      isSuccess: false,
      message: error?.message || "Something went wrong",
    });
  }
};

exports.getProductAdsByAdGroup = async (req, res) => {
  try {
    const adGroupId = Number(req.params.id);
    const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
    const { adTypeProductAdsSchema } = req.models || {};
    const productAdsModel = adTypeProductAdsSchema || require("../models/productAds.model");

    let {
      pageNo = 1,
      perPage = 10,
      fromDate,
      toDate,
      profileId,
      status,
      searchName,
      fieldName = "totalSpend",
      sortType = "DESC",
      campaignId,
    } = req.body;

    if (!profileId) {
      return res.status(203).send({ message: "Profile id required!", isSuccess: false });
    }

    const parsedConfigId = configId && mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId;

    let matchFilter = {
      adGroupId: !isNaN(adGroupId) ? adGroupId : req.params.id,
      profileId: Number(profileId),
      ...(parsedConfigId && { configId: parsedConfigId }),
      ...(campaignId && { campaignId: Number(campaignId) || campaignId }),
    };

    if (fromDate && toDate) {
      matchFilter.reportDate = { $gte: fromDate, $lte: toDate };
    }
    if (status) {
      matchFilter.status = status;
    }

    const sortDir = String(sortType).toUpperCase() === "ASC" ? 1 : -1;
    const skip = (Number(pageNo) - 1) * Number(perPage);

    const aggregatePipeline = [
      { $match: matchFilter },
      { $sort: { reportDate: -1 } },
      {
        $group: {
          _id: {
            adId: "$adId",
            asin: "$asins",
            sku: "$sku",
          },
          adId: { $first: "$adId" },
          asin: { $first: "$asins" },
          sku: { $first: "$sku" },
          status: { $first: "$status" },
          campaignId: { $first: "$campaignId" },
          adGroupId: { $first: "$adGroupId" },
          name: { $first: "$name" },
          totalSpend: { $sum: "$spend" },
          totalSales: { $sum: "$sales" },
          totalImpressions: { $sum: "$impressions" },
          totalClicks: { $sum: "$clicks" },
          totalOrders: { $sum: "$orders" },
          totalCpc: { $sum: "$cpc" },
        },
      },
      {
        $lookup: {
          from: "products",
          let: { asin: "$asin", sku: "$sku" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $ne: ["$$asin", null] }, { $eq: ["$asin", "$$asin"] }] },
                    { $and: [{ $ne: ["$$sku", null] }, { $eq: ["$sku", "$$sku"] }] },
                  ],
                },
                profileId: Number(profileId),
                ...(parsedConfigId && { configId: parsedConfigId }),
              },
            },
            { $sort: { reportDate: -1 } },
            { $limit: 1 },
            {
              $project: {
                title: 1,
                imageUrl: 1,
                amount: 1,
                mainImage: 1,
              },
            },
          ],
          as: "productDetails",
        },
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "productlistings",
          let: { asin: "$asin", sku: "$sku" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $ne: ["$$asin", null] }, { $eq: ["$asin", "$$asin"] }] },
                    { $and: [{ $ne: ["$$sku", null] }, { $eq: ["$sku", "$$sku"] }] },
                  ],
                },
                profileId: Number(profileId),
                ...(parsedConfigId && { configId: parsedConfigId }),
              },
            },
            { $sort: { reportDate: -1 } },
            { $limit: 1 },
            {
              $project: {
                itemName: 1,
                imageURL: 1,
                price: 1,
              },
            },
          ],
          as: "listingDetails",
        },
      },
      {
        $unwind: {
          path: "$listingDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          adId: 1,
          asin: 1,
          sku: 1,
          status: 1,
          campaignId: 1,
          adGroupId: 1,
          productName: {
            $ifNull: [
              "$productDetails.title",
              {
                $ifNull: [
                  "$listingDetails.itemName",
                  { $ifNull: ["$name", "$asin"] },
                ],
              },
            ],
          },
          imageUrl: {
            $ifNull: [
              "$productDetails.imageUrl",
              {
                $ifNull: [
                  "$productDetails.mainImage.link",
                  { $ifNull: ["$listingDetails.imageURL", null] },
                ],
              },
            ],
          },
          price: {
            $ifNull: [
              "$productDetails.amount",
              { $ifNull: ["$listingDetails.price", 0] },
            ],
          },
          totalSpend: { $round: ["$totalSpend", 2] },
          totalSales: { $round: ["$totalSales", 2] },
          totalImpressions: 1,
          totalClicks: 1,
          totalOrders: 1,
          totalCpc: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalClicks", 0] },
                  { $divide: ["$totalSpend", "$totalClicks"] },
                  0,
                ],
              },
              2,
            ],
          },
          totalCtr: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalImpressions", 0] },
                  { $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] },
                  0,
                ],
              },
              2,
            ],
          },
          totalCvr: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalClicks", 0] },
                  { $multiply: [{ $divide: ["$totalOrders", "$totalClicks"] }, 100] },
                  0,
                ],
              },
              2,
            ],
          },
          totalAcos: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalSales", 0] },
                  { $multiply: [{ $divide: ["$totalSpend", "$totalSales"] }, 100] },
                  0,
                ],
              },
              2,
            ],
          },
          totalRoas: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalSpend", 0] },
                  { $divide: ["$totalSales", "$totalSpend"] },
                  0,
                ],
              },
              2,
            ],
          },
        },
      },
    ];

    if (searchName && searchName.trim()) {
      const s = searchName.trim();
      aggregatePipeline.push({
        $match: {
          $or: [
            { productName: { $regex: new RegExp(s, "i") } },
            { sku: { $regex: new RegExp(s, "i") } },
            { asin: { $regex: new RegExp(s, "i") } },
          ],
        },
      });
    }

    const groupedProducts = await productAdsModel.aggregate(aggregatePipeline);
    const totalRecords = groupedProducts.length;

    const totalRow = groupedProducts.reduce(
      (acc, item) => {
        acc.totalSpend += item.totalSpend || 0;
        acc.totalSales += item.totalSales || 0;
        acc.totalImpressions += item.totalImpressions || 0;
        acc.totalClicks += item.totalClicks || 0;
        acc.totalOrders += item.totalOrders || 0;
        return acc;
      },
      {
        totalSpend: 0,
        totalSales: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalOrders: 0,
      }
    );

    totalRow.totalSpend = Math.round(totalRow.totalSpend * 100) / 100;
    totalRow.totalSales = Math.round(totalRow.totalSales * 100) / 100;
    totalRow.totalCpc = totalRow.totalClicks > 0 ? Math.round((totalRow.totalSpend / totalRow.totalClicks) * 100) / 100 : 0;
    totalRow.totalCtr = totalRow.totalImpressions > 0 ? Math.round(((totalRow.totalClicks / totalRow.totalImpressions) * 100) * 100) / 100 : 0;
    totalRow.totalCvr = totalRow.totalClicks > 0 ? Math.round(((totalRow.totalOrders / totalRow.totalClicks) * 100) * 100) / 100 : 0;
    totalRow.totalAcos = totalRow.totalSales > 0 ? Math.round(((totalRow.totalSpend / totalRow.totalSales) * 100) * 100) / 100 : 0;
    totalRow.totalRoas = totalRow.totalSpend > 0 ? Math.round((totalRow.totalSales / totalRow.totalSpend) * 100) / 100 : 0;
    totalRow.productName = "Total";
    totalRow.isTotalRow = true;

    const sortKey = fieldName || "totalSpend";
    groupedProducts.sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === "string") {
        return sortDir === 1 ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 1 ? aVal - bVal : bVal - aVal;
    });

    const paginatedProducts = groupedProducts.slice(skip, skip + Number(perPage));

    return res.status(200).send({
      isSuccess: true,
      getProductAdsData: paginatedProducts,
      totalProductAdsData: totalRecords,
      totalRow,
      currentPageNo: Number(pageNo),
      perPage: Number(perPage),
      totalPages: Math.ceil(totalRecords / Number(perPage)),
    });
  } catch (error) {
    write_logs({
      message: `[getProductAdsByAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
      log_type: "error",
    });
    return res.status(500).send({
      isSuccess: false,
      message: error?.message || "Something went wrong",
    });
  }
};

exports.processReportFileStream = processReportFileStream;
exports.spGenerateReport = spGenerateReport;