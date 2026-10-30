
const moment = require("moment-timezone");
const { retryWithBackoff } = require("../helper/retryHelper");

const fs = require("fs");
const zlib = require("node:zlib");
const path = require("path");
const axios = require("axios");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");

const productAdsSchema = require("../models/productAds.model");
const profileSchema = require("../models/profiles.model");
const campaignsSchema = require("../models/campaign.model");
const adGroupsSchema = require("../models/adGroups.model");
const reportsSchema = require("../models/report.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const cronJobSchema = require("../models/cronJob.model");
const productSchema = require("../models/product.model");
const adNotificationSchema = require("../models/adNotification.model");

const sbProductSchema = require("../models/sbProduct.model");

const sdProductAdsSchema = require("../models/sdProductAds.model");
const sdProductSchema = require("../models/sdProduct.model");

const {
  getAccessToken,
  getProfile,
  buildFieldFilter,
  unzipReport,
  calcMetrics,
  parseStrictMetric,
  getActivePlanProfiles,
  parallelBulkWrite,
  downloadFile,
  getAllowedSyncProfiles
} = require("../helper/common");
const { stageReportFileInRedis } = require("../services/reportFileStager.service");
const { processStagedReportBatches } = require("../services/reportBatchWriter.service");

const { sendNotificationToUser } = require("../helper/sendNotification");

const { write_logs } = require("../../winston/productAds/logger");
const { product_write_logs } = require("../../winston/products/logger");
const { cron_logs } = require("../../winston/cronAutomation/logger");

const amazonAxios = require("../helper/amazonAxios");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");

exports.listProductAdsFromAmazon = async (req, res) => {
  try {
    const getProfileId = await profileSchema.find({ isActive: true }).lean();
    let reportDate = "";
    await Promise.all(
      getProfileId.map((i) => limit(async () => {
        const checkConfigAds = await getAccessToken(i.configId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {
          reportDate = moment().tz(i.timezone).format("YYYY-MM-DD");
          const spProductAds = await getSpProductAds(
            i.configId,
            i.profileId,
            checkConfigAds,
            i.currencyCode,
            i.timezone,
            reportDate
          );

          const productAds = spProductAds.concat(sbProductAds, sdProductAds);
          if (productAds.length > 0) {
            await Promise.all(
              productAds.map(async (item) => {
                const getProductAds = await productAdsSchema.findOne({
                  configId: item.configId,
                  profileId: item.profileId,
                  adId: item.adId,
                  reportDate,
                }).lean();
                if (!getProductAds) {
                  let createProductAds = new productAdsSchema(item);
                  await createProductAds.save();
                } else {
                  await productAdsSchema.findByIdAndUpdate(
                    { _id: getProductAds._id },
                    item,
                    { new: true }
                  );
                }
              })
            );
          }
        }
      }))
    );
    const filter = {
      reportDate,
    };
    const getProductAds = await productAdsSchema
      .find(filter)
      .sort({ type: -1, status: 1 });
    const totalRecords = await productAdsSchema.count(filter);
    return res.status(200).send({
      isSuccess: true,
      message: "ProductAds listing successfully.",
      data: getProductAds,
      totalRecords: totalRecords,
    });
  } catch (error) {
      write_logs({ message: `[listProductAdsFromAmazon Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

// List
exports.cronListProductAdsFromAmazon = async (pastSyncObj) => {
  // cron_logs({ message: `cronListProductAdsFromAmazon` });
  try {

    const { profileId, configId, cronjobid, recurring } = pastSyncObj ?? {};
    const dates = pastSyncObj?.dates ?? [];
    const cronName = "ProductAds Listing";

    const allowedProfiles = await getAllowedSyncProfiles("CAMPAIGNS", "ads", recurring);
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
        message: `Cron ProductAds Listing stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
        log_type: "warn"
      });
    }

    const listPromises = getProfileId.map((profile) => limit(async () => {
      if (global.updateTaskProgress) global.updateTaskProgress("ProductAdsListing");
      const checkConfigAds = await getAccessToken(profile.configId);
      if (
        checkConfigAds &&
        checkConfigAds.adsAccessToken
      ) {
        const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");
        if (dates.length == 0) {
          dates.push(currentDate);
        }

        await processSPProductAds({
          profile,
          checkConfigAds,
          dates,
          currentDate,
        });

        await processSDProductAds({
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
        }
        else {
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
          message: `Profile: ${profile.name}, ProductAds listed successfully.`,
          log_type: "info"
        });

      } else {
        return cron_logs({
          message: `Account disconnected in productAds listing for profile ${profile.name}`,
          log_type: "info"
        });
      }
    }))

    await Promise.all(listPromises);

    return cron_logs({
      message: "ProductAds listing successfully.",
      log_type: "info"
    });

  } catch (error) {
    return cron_logs({
      message: `ProductAds listing err: ${error}`,
      log_type: "error",
    });
  }
};

async function processSPProductAds({
  profile,
  checkConfigAds,
  dates,
  currentDate,
}) {
  const getPage = await fetchSPProductAdsPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  const campaignMap = {};
  try {
    const campaigns = await campaignsSchema.find(
      {
        configId: profile.configId,
        profileId: profile.profileId,
        reportDate: currentDate,
      },
      { campaignId: 1, name: 1 }
    ).lean();
    campaigns.forEach(c => { campaignMap[c.campaignId] = c.name; });
  } catch (err) {
    cron_logs({
      message: `Error pre-fetching campaigns for SP ProductAds in profile ${profile.name}: ${err.message}`,
      log_type: "warn"
    });
  }

  let nextToken = null;
  let page = 1;

  do {
    let productAds = [];
    let token = null;

    try {
      const response = await getPage(nextToken);
      productAds = response.productAds || [];
      token = response.nextToken;
    } catch (err) {
      cron_logs({
        message: `Error fetching SP ProductAds page ${page} for profile ${profile.name}: ${err.message}`,
        log_type: "error"
      });
      break;
    }

    nextToken = token;

    if (!productAds.length) continue;

    const bulkOps = [];

    productAds.map((item) => {
      dates.map((reportDate) => {
        bulkOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              adId: item.adId,
              reportDate,
            },
            update: {
              $set: {
                ...item,
                reportDate,
                campaignName: campaignMap[item.campaignId] || null,
              },
            },
            upsert: true,
          },
        });
      })
    })

    if (bulkOps.length) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page++}, Product Ads Count: ${bulkOps.length}`,
        log_type: "info"
      });
      await parallelBulkWrite(productAdsSchema, bulkOps);
    }

  } while (nextToken);
}

async function processSDProductAds({
  profile,
  checkConfigAds,
  dates,
  currentDate,
}) {
  const getPage = await fetchSDProductAdsPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  const campaignMap = {};
  try {
    const campaigns = await campaignsSchema.find(
      {
        configId: profile.configId,
        profileId: profile.profileId,
        reportDate: currentDate,
      },
      { campaignId: 1, name: 1 }
    ).lean();
    campaigns.forEach(c => { campaignMap[c.campaignId] = c.name; });
  } catch (err) {
    cron_logs({
      message: `Error pre-fetching campaigns for SD ProductAds in profile ${profile.name}: ${err.message}`,
      log_type: "warn"
    });
  }

  let page = 0;

  do {
    let productAds = [];

    try {
      const response = await getPage(page);
      productAds = response.productAds || [];
    } catch (err) {
      cron_logs({
        message: `Error fetching SD ProductAds page ${page + 1} for profile ${profile.name}: ${err.message}`,
        log_type: "error"
      });
      break;
    }

    if (!productAds.length) break;

    const bulkOps = [];

    productAds.map((item) => {
      dates.map((reportDate) => {
        bulkOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              adId: item.adId,
              reportDate,
            },
            update: {
              $set: {
                ...item,
                reportDate,
                campaignName: campaignMap[item.campaignId] || null,
              },
            },
            upsert: true,
          },
        });
      })
    })

    if (bulkOps.length) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${++page}, SD Product Ads Count: ${bulkOps.length}`,
        log_type: "info"
      });
      await parallelBulkWrite(sdProductAdsSchema, bulkOps);
    }

  } while (true);
}

async function fetchSPProductAdsPage({
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
      url: `${getAccount.amazonUrl}/sp/productAds/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.spProductAd.v3+json",
        "Content-Type": "application/vnd.spProductAd.v3+json",
      },
      data: bodyData,
      meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
    }));

    if (response.status !== 200) return { productAds: [], nextToken: null };

    const body = response.data;
    const productAds = (body.productAds || []).map(item => ({
      configId,
      profileId,
      adGroupId: item.adGroupId,
      campaignId: item.campaignId,
      adId: item.adId ? item.adId : null,
      sku: item.sku ? item.sku : null,
      currencyCode,
      status: item.state.toUpperCase(),
      asins: item.asin ? item.asin : null,
      timezone,
      type: "Sponsored Products",
    }));

    return {
      productAds,
      nextToken: body.nextToken || null,
    };
  };
}

async function fetchSDProductAdsPage({
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
}) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(pageIndex) {

    const response = await retryWithBackoff(() => amazonAxios({
      method: "GET",
      url: `${getAccount.amazonUrl}/sd/productAds?startIndex=${pageIndex * Number(process.env.BATCH)}&count=${Number(process.env.BATCH)}`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
    }));

    if (response.status !== 200) return { productAds: [] };

    const body = response.data;
    const productAds = (body || []).map(item => ({
      configId,
      profileId,
      adGroupId: item.adGroupId,
      campaignId: item.campaignId,
      adId: item.adId ? item.adId : null,
      sku: item.sku ? item.sku : null,
      currencyCode,
      status: item.state.toUpperCase(),
      asins: item.asin ? item.asin : null,
      timezone,
      type: "Sponsored Display",
    }));

    return { productAds };
  };
}

exports.manualListProductAdsFromAmazon = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "ProductAds Listing",
      isActive: false,
    }).lean();
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your productAds listing status is deactive.`,
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
    if (!(getCron.cronName == "ProductAds Listing")) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Enter correct cron id." });
    }
    const getProfileId = await getProfile(configId, profileId);
    let reportDate = "";
    await Promise.all(
      getProfileId.map(async (i) => {
        const checkConfigAds = await getAccessToken(i.configId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {
          reportDate = moment().tz(i.timezone).format("YYYY-MM-DD");
          const getCronData = await cronJobHistorySchema.findOne({
            configId: i.configId,
            profileId: i.profileId,
            cronName: "ProductAds Listing",
            status: "PENDING",
            historyDate: reportDate,
          }).lean();
          if (!getCronData) {
            const createCronHistory = new cronJobHistorySchema({
              configId: i.configId,
              profileId: i.profileId,
              cronName: "ProductAds Listing",
              status: "PENDING",
              historyDate: reportDate,
            });
            await createCronHistory.save();
          }

          let productAds = [];

          const spProductAds = await getSpProductAds(
            i.configId,
            i.profileId,
            checkConfigAds,
            i.currencyCode,
            i.timezone,
            reportDate
          );

          productAds = productAds.concat(spProductAds);

          if (productAds.length > 0) {
            await Promise.all(
              productAds.map(async (item) => {
                const getProductAds = await productAdsSchema.findOne({
                  configId: item.configId,
                  profileId: item.profileId,
                  adId: item.adId,
                  reportDate,
                }).lean();
                if (!getProductAds) {
                  let createProductAds = new productAdsSchema(item);
                  await createProductAds.save();
                } else {
                  await productAdsSchema.findByIdAndUpdate(
                    { _id: getProductAds._id },
                    item,
                    { new: true }
                  );
                }
              })
            );
          }
        } else {
          return write_logs({
            message: `Account disconnected in productAds listing ${i.configId
              }, Config: ${checkConfigAds}`,
            log_type: "info",
          });
        }
      })
    );
    const getUpdateCronData = await cronJobHistorySchema.findOne({
      configId: configId,
      profileId: profileId,
      cronName: "ProductAds Listing",
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
      message: "ProductAds listing successfully.",
    });
  } catch (error) {
      write_logs({ message: `[manualListProductAdsFromAmazon Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

async function getSpProductAds(
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
    };
    const spOptions = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/productAds/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.spProductAd.v3+json",
        "Content-Type": "application/vnd.spProductAd.v3+json",
      },
      meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
    };
    const productAds = [];
    let nextToken = "";
    function makeRequest() {
      if (nextToken) {
        bodyData.nextToken = nextToken;
      }
      spOptions.data = bodyData;
      retryWithBackoff(() => amazonAxios(spOptions)).then((response) => {
        if (response && response.status == 200) {
          const body = response.data;
          if (body.productAds.length > 0) {
            body.productAds.forEach((item) => {
              let obj = {
                configId,
                profileId,
                adGroupId: item.adGroupId,
                campaignId: item.campaignId,
                adId: item.adId ? item.adId : null,
                sku: item.sku ? item.sku : null,
                currencyCode,
                status: item.state.toUpperCase(),
                asins: item.asin ? item.asin : null,
                timezone,
                type: "Sponsored Products",
              };
              productAds.push(obj);
            });
            const totalResults = body.totalResults;
            nextToken = body.nextToken;
            if (productAds.length < totalResults && nextToken) {
              makeRequest();
            } else {
              resolve(productAds);
            }
          }
          else {
            resolve(productAds);
          }
        }
        else {
          cron_logs({
            message: `Config ID: ${configId}, Profile ID: ${profileId} SP productAds listing err: ${response.data}`,
            log_type: "error",
          });
          resolve(productAds);
        }
      }).catch((error) => {
        cron_logs({
          message: `Config ID: ${configId}, Profile ID: ${profileId} SP productAds listing err: ${error}`,
          log_type: "error",
        });
        resolve(productAds);
      })
    }
    makeRequest();
  });
}

exports.generateReport = async (req, res) => {
  try {
    const getProfileId = await profileSchema.find({ isActive: true }).lean();
    await Promise.all(
      getProfileId.map((i) => limit(async () => {
        const startDate = moment().tz(i.timezone).format("YYYY-MM-DD");
        const endDate = moment().tz(i.timezone).format("YYYY-MM-DD");
        const checkConfigAds = await getAccessToken(i.configId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {
          const reportSpResponse = await spGenerateReport(
            i.profileId,
            i.timezone,
            startDate,
            endDate,
            checkConfigAds,
            i.configId
          );
          console.log("SP", reportSpResponse);
        }
      }))
    );
    return res
      .status(200)
      .send({ message: "Report updated successfully..", isSuccess: true });
  } catch (error) {
      write_logs({ message: `[generateReport Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

// Generate Report
exports.cronGenerateAdProductReport = async (generateWeeklyReport = false, generateBiWeeklyReport = false, pastSyncObj = null) => {
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
      : "Product Ads Report";

    const allowedProfiles = await getAllowedSyncProfiles("CAMPAIGNS", "ads", recurring);
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
        message: `Cron Product Ads Report stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
        log_type: "warn"
      });
    }

    cron_logs({
      message: `[${cronName}] Cron started for ${getProfileId.length} profile(s). (Weekly: ${generateWeeklyReport}, BiWeekly: ${generateBiWeeklyReport}, Recurring: ${recurring})`,
      log_type: "info"
    });

    const reportPromises = getProfileId.map((profile) => limit(async () => {
      try {
        if (global.updateTaskProgress) global.updateTaskProgress(generateBiWeeklyReport ? "BiWeekly Report" : generateWeeklyReport ? "Weekly Report" : "Product Ads Report");
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
            profile.timezone,
            startDate,
            endDate,
            checkConfigAds,
            profile.configId,
            recurring
          );

          cron_logs({
            message: `[${cronName}: Sponsored Products] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSpResponse}`,
            log_type: "info"
          });

          const reportSdResponse = await sdGenerateReport(
            profile.profileId,
            profile.timezone,
            startDate,
            endDate,
            checkConfigAds,
            profile.configId,
            recurring
          );

          cron_logs({
            message: `[${cronName}: Sponsored Display] Profile: ${profile.name} (${profile.profileId}), Range: ${startDate} to ${endDate} - Status: ${reportSdResponse}`,
            log_type: "info"
          });

          // Update cron history based on report response
          if (reportSpResponse === "ERROR" || reportSdResponse === "ERROR") {
            if (recurring && getCronData?._id) {
              await cronJobHistorySchema.findByIdAndUpdate(
                getCronData._id,
                { status: "FAILED" },
                { new: true }
              );
            }
            return "ERROR";
          } else if (recurring) {
            if (getCronData?._id) {
              await cronJobHistorySchema.findByIdAndUpdate(
                getCronData._id,
                { status: "COMPLETED" },
                { new: true }
              );
            }
            return "COMPLETED";
          }

          if (!recurring && cronjobid && reportSpResponse == "COMPLETED" && reportSdResponse == "COMPLETED") {
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
            message: `[${cronName}] Account disconnected or missing adsAccessToken for profile: ${profile.name} (${profile.profileId})`,
            log_type: "warn"
          });
        }
      } catch (profileErr) {
        cron_logs({
          message: `[${cronName}] Error syncing product ads for profile ${profile.name} (${profile.profileId}): ${profileErr.stack || profileErr.message}`,
          log_type: "error"
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
      message: `[Product Ads Report] Error during cron execution: ${error.stack || error.message || error}`,
      log_type: "error"
    });
  }
};

exports.saveProductAdsData = async (req, res) => {
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
              profile.timezone,
              startDate,
              endDate,
              checkConfigAds,
              profile.configId
            );
            return res.status(200).json({ success: true, reportSpResponse: reportSpResponse, message: "Product Ads report generated successfully." })
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
      write_logs({ message: `[saveProductAdsData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({ status: false, message: error })
  }
}

exports.manualGenerateReport = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "ProductAds Report",
      isActive: false,
    }).lean();
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your productAds report status is deactive.`,
        log_type: "info",
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
    if (!(getCron.cronName == "ProductAds Report")) {
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
        cronName: "ProductAds Report",
        status: "PENDING",
        historyDate: startDate,
      }).lean();
      if (!getCronData) {
        const createCronHistory = new cronJobHistorySchema({
          configId: profile.configId,
          profileId: profile.profileId,
          cronName: "ProductAds Report",
          status: "PENDING",
          historyDate: startDate,
        });
        await createCronHistory.save();
      }
      let responseSPStatus = "PENDING";
      let responseSDStatus = "IN_PROGRESS";
      while (responseSPStatus != "COMPLETED" || responseSDStatus != "SUCCESS") {
        if (responseSPStatus != "COMPLETED" && responseSPStatus != "ERROR") {
          const reportSpResponse = await spGenerateReport(
            profile.profileId,
            profile.timezone,
            startDate,
            endDate,
            checkConfigAds,
            profile.configId
          );
          console.log("SP", reportSpResponse);
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
        cronName: "ProductAds Report",
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
        message: "ProductAds Report updated successfully..",
        isSuccess: true,
      });
    }
  } catch (error) {
      write_logs({ message: `[manualGenerateReport Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res
      .status(203)
      .send({ isSuccess: false, message: "An internal server error occurred", error });
  }
};

async function spGenerateReport(
  profileId,
  timezone,
  startDate,
  endDate,
  checkConfigAds,
  configId,
  recurring = false,
  forceRefresh = false
) {
  const getAccount = await getProfile(configId, profileId);

  let existing;
  if (!recurring && !forceRefresh) {
    existing = await reportsSchema.findOne({
      startDate,
      endDate,
      profileId,
      configId,
      reportTypeId: "spAdvertisedProduct",
      reportName: "PRODUCT_ADS",
    }).lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
    if (existing && existing.status == "STAGED") {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const lastActivity = new Date(existing.updatedAt || existing.createdAt);
      if (lastActivity < twoHoursAgo) {
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        existing = null;
      } else {
        processStagedReportBatches(["productAd"]).catch(() => {});
        return "STAGED";
      }
    }
  } else if (!forceRefresh) {
    // 1️⃣ Check recent pending report (created within last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    existing = await reportsSchema.findOne({
      profileId,
      configId,
      reportTypeId: "spAdvertisedProduct",
      reportName: "PRODUCT_ADS",
      status: "PENDING",
      createdAt: { $gte: twentyFourHoursAgo },
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
          startDate,
          endDate,
          configuration: {
            adProduct: "SPONSORED_PRODUCTS",
            groupBy: ["advertiser"],
            columns: [
              "campaignName",
              "campaignId",
              "adGroupName",
              "adGroupId",
              "adId",
              "impressions",
              purchasesCol,
              "clicks",
              "cost",
              "advertisedAsin",
              "costPerClick",
              "spend",
              salesCol,
              "date"
            ],
            reportTypeId: "spAdvertisedProduct",
            timeUnit: "DAILY",
            format: "GZIP_JSON",
          },
        },
        meta: { configId, tokenKey: "adsAccessToken" },
      }));
    } catch (err) {
      cron_logs({
        message: `[Product Ads Report SP] Report creation failed for profile ${profileId}: ${err?.response?.data?.message || err.message}`,
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
      reportName: "PRODUCT_ADS",
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
    meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
  }));

  if (statusResp.data.status !== "COMPLETED") {
    return statusResp.data.status;
  }

  // 3️⃣ Download file
  const zipPath = path.resolve(__dirname, "../../uploads/productAds/sp-report", `${existing.reportId}.gz.json`);
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  // 4️⃣ Stage report into Redis Streams for durable scheduled bulk writing
  const importRunId = `run_productad_${existing.reportId}_${Date.now()}`;
  try {
    await stageReportFileInRedis({
      importRunId,
      entity: "productAd",
      filePath: extractionPath,
      meta: {
        profileId,
        configId,
        accountType: getAccount?.type,
        reportId: existing.reportId,
        reportTypeId: "spProductAds",
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
    processStagedReportBatches(["productAd"]).catch((err) => {
      cron_logs({
        message: `[Product Ads Report SP] Background batch writer invocation error: ${err.message}`,
        log_type: "error",
      });
    });
  } catch (parseErr) {
    cron_logs({
      message: `[Product Ads Report SP] Staging failed for report ${existing.reportId}: ${parseErr.message}`,
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
        timezone,
        startDate,
        endDate,
        checkConfigAds,
        configId,
        recurring,
      );
    }
  }

  return "COMPLETED";
}

async function sdGenerateReport(
  profileId,
  timezone,
  startDate,
  endDate,
  checkConfigAds,
  configId,
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
      reportTypeId: "sdAdvertisedProduct",
      reportName: "PRODUCT_ADS",
    }).lean();

    if (existing && existing.status == "COMPLETED") return "COMPLETED";
  } else {
    // 1️⃣ Check recent pending report (created within last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    existing = await reportsSchema.findOne({
      profileId,
      configId,
      reportTypeId: "sdAdvertisedProduct",
      reportName: "PRODUCT_ADS",
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
          Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
        },
        data: {
          name: "",
          startDate,
          endDate,
          configuration: {
            adProduct: "SPONSORED_DISPLAY",
            groupBy: ["advertiser"],
            columns: [
              "campaignName",
              "campaignId",
              "adGroupName",
              "adGroupId",
              "adId",
              "impressions",
              "purchases",
              "clicks",
              "cost",
              "sales",
              "date"
            ],
            reportTypeId: "sdAdvertisedProduct",
            timeUnit: "DAILY",
            format: "GZIP_JSON",
          },
        },
        meta: { configId, tokenKey: "adsAccessToken" },
      }));
    } catch (err) {
      cron_logs({
        message: `[Product Ads Report SD] Report creation failed for profile ${profileId}: ${err?.response?.data?.message || err.message}`,
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
      reportName: "PRODUCT_ADS",
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
    meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
  }));

  if (statusResp.data.status !== "COMPLETED") {
    return statusResp.data.status;
  }

  // 3️⃣ Download file
  const zipPath = path.resolve(__dirname, "../../uploads/productAds/sd-report", `${existing.reportId}.gz.json`);
  const extractionPath = zipPath.replace(".gz.json", ".json");

  await downloadFile(statusResp.data.url, zipPath);
  await unzipReport(zipPath, extractionPath);

  // 4️⃣ Stream parse + write
  await processReportFileStream(sdProductAdsSchema, extractionPath, {
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

      return await sdGenerateReport(
        profileId,
        timezone,
        startDate,
        endDate,
        checkConfigAds,
        configId,
        recurring,
      );
    }
  }

  return "COMPLETED";
}

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

      const isSP = schema === productAdsSchema;
      const isVendor = accountType?.toLowerCase() === "vendor";
      const purchaseField = isSP ? (isVendor ? "purchases14d" : "purchases7d") : "purchases";
      const salesField = isSP ? (isVendor ? "sales14d" : "sales7d") : "sales";
      const context = `productAds report profile=${profileId} config=${configId} type=${accountType || 'unknown'} schema=${isSP ? 'SP' : 'SD'}`;

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
          // Preserve existing SD contracts
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
            adId: value.adId,
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
}

exports.createProductAds = async (req, res) => {
  const { type, adtype } = req.body;
  try {
    if (type == "Sponsored Products") {
      await createSpProductAds(req, res);
    } else if (type == "Sponsored Brands" && adtype == "Product Collection") {
      await createSbProductCollection(req, res);
    } else if (type == "Sponsored Brands" && adtype == "Video") {
      await createSbVideo(req, res);
    } else if (type == "Sponsored Display") {
      await createSdProductAds(req, res);
    } else {
      return res.status(203).send({
        isSuccess: false,
        message: "Type and AdType required!",
      });
    }
  } catch (error) {
      write_logs({ message: `[createProductAds Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

async function createSpProductAds(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, campaign, state, asins, sku, adGroupId } = req.body;
    let campaignId = campaign;
    const getProductAd = await productAdsSchema.findOne({
      campaignId,
      profileId,
      configId,
      adGroupId,
      asins: asins ? asins : null,
    }).lean();
    if (getProductAd) {
      return res.status(203).send({
        message: "ProductAd with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      productAds: [
        {
          state,
          campaignId,
          adGroupId,
        },
      ],
    };
    if (asins) {
      bodyData.productAds[0].asin = asins;
    }
    if (sku) {
      bodyData.productAds[0].sku = sku;
    }
    //NOTE: NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const checkConfigAds = await getAccessToken(configId);
    const profile = await getProfile(configId, profileId);
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sp/productAds`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.spProductAd.v3+json",
    //     "Content-Type": "application/vnd.spProductAd.v3+json",
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
    //     if (responseBody.productAds.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "ProductAds with the specified name already exists.",
    //         error: responseBody.productAds.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       configId,
    //       type,
    //       currencyCode: profile.currencyCode,
    //       adGroupId: responseBody.productAds.success[0].productAd.adGroupId,
    //       campaignId: responseBody.productAds.success[0].productAd.campaignId,
    //       adId: responseBody.productAds.success[0].adId,
    //       status: responseBody.productAds.success[0].productAd.state,
    //       reportDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
    //       sku: sku ? responseBody.productAds.success[0].productAd.sku : null,
    //       asins: asins
    //         ? responseBody.productAds.success[0].productAd.asins
    //         : null,
    //       timezone: profile.timezone,
    //     };
    //     const createProductAds = new productAdsSchema(create);
    //     await createProductAds.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored products productAds created successfully.",
    //       createProductAds,
    //     });
    //   }
    // });
    const create = {
      profileId,
      configId,
      currencyCode: profile.currencyCode,
      campaignId,
      adGroupId,
      adId: Math.floor(100000 + Math.random() * 900000),
      sku: sku ? sku : null,
      asins: asins ? asins : null,
      reportDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
      status: state.toUpperCase(),
      timezone: profile.timezone,
      type: "Sponsored Products",
    };
    const createProductAds = new productAdsSchema(create);
    await createProductAds.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored products productAds created successfully.",
      createProductAds,
    });
  } catch (error) {
      write_logs({ message: `[createSpProductAds Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

async function createSdProductAds(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, campaign, state, sku, adGroupId } = req.body;
    let campaignId = campaign;
    const getProductAd = await productAdsSchema.findOne({
      campaignId,
      profileId,
      configId,
      adGroupId,
      sku,
    }).lean();
    if (getProductAd) {
      return res.status(203).send({
        message: "ProductAd with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = [
      {
        state: state.toLowerCase(),
        campaignId,
        adGroupId,
        sku,
      },
    ];
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const checkConfigAds = await getAccessToken(configId);
    const profile = await getProfile(configId, profileId);
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sd/productAds`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
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
    //     if (responseBody.productAds.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "ProductAds with the specified name already exists.",
    //         error: responseBody.productAds.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       configId,
    //       type,
    //       currencyCode: profile.currencyCode,
    //       campaignId,
    //       adGroupId,
    //       adId: responseBody[0].adId,
    //       status: state.toUpperCase(),
    //       reportDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
    //       sku,
    //       timezone: profile.timezone,
    //     };
    //     const createProductAds = new productAdsSchema(create);
    //     await createProductAds.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored display productAds created successfully.",
    //       createProductAds,
    //     });
    //   }
    // });
    const create = {
      profileId,
      configId,
      currencyCode: profile.currencyCode,
      campaignId,
      adGroupId,
      adId: Math.floor(100000 + Math.random() * 900000),
      sku,
      reportDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
      status: state.toUpperCase(),
      timezone: profile.timezone,
      type: "Sponsored Display",
    };
    const createProductAds = new productAdsSchema(create);
    await createProductAds.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored display productAds created successfully.",
      createProductAds,
    });
  } catch (error) {
      write_logs({ message: `[createSdProductAds Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

async function createSbProductCollection(req, res) {
  try {
    const configId = req?.config?.configId;
    let {
      profileId,
      pageType,
      url,
      name,
      asins,
      brandName,
      customImageAssetId,
      brandLogoAssetID,
      headline,
      state,
      adGroupId,
    } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getAdGroup = await adGroupsSchema.findOne({ adGroupId }).lean();
    if (!getAdGroup) {
      return res.status(203).send({
        message: "Adgroup not found!",
        isSuccess: false,
      });
    }
    const getProductAd = await productAdsSchema.findOne({
      adGroupId,
      configId,
      profileId,
      name: nameRegex,
    }).lean();
    if (getProductAd) {
      return res.status(203).send({
        message: "ProductAd with the specified adgroup or name already exists!",
        isSuccess: false,
      });
    }
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const checkConfigAds = await getAccessToken(configId);
    const profile = await getProfile(configId, profileId);
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sb/v4/ads/productCollection`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     "Content-Type": "application/vnd.sbadresource.v4+json",
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
    //     if (responseBody.ads.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "ProductAds with the specified name already exists.",
    //         error: responseBody.ads.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       configId,
    //       currencyCode: profile.currencyCode,
    //       campaignId: responseBody.ads.success[0].ad.campaignId,
    //       adGroupId: responseBody.ads.success[0].ad.adGroupId,
    //       adId: responseBody.ads.success[0].adId,
    //       pageType: responseBody.ads.success[0].ad.landingPage.pageType,
    //       url: responseBody.ads.success[0].ad.landingPage.url,
    //       name: responseBody.ads.success[0].ad.name,
    //       brandName: responseBody.ads.success[0].ad.creative.brandName,
    //       headline: responseBody.ads.success[0].ad.creative.headline,
    //       adType: responseBody.ads.success[0].ad.creative.type,
    //       type,
    //       customImageAssetId:
    //         responseBody.ads.success[0].ad.creative.customImageAssetId,
    //       brandLogoAssetID:
    //         responseBody.ads.success[0].ad.creative.brandLogoAssetID,
    //       asins: responseBody.ads.success[0].ad.landingPage.asins,
    //       reportDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
    //       status: responseBody.ads.success[0].ad.state,
    //       timezone: profile.timezone,
    //     };
    //     const createProductAds = new productAdsSchema(create);
    //     await createProductAds.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored display productAds created successfully.",
    //       createProductAds,
    //     });
    //   }
    // });
    const create = {
      profileId,
      configId,
      currencyCode: profile.currencyCode,
      campaignId: getAdGroup.campaignId,
      adGroupId,
      adId: Math.floor(100000 + Math.random() * 900000),
      pageType,
      url,
      name,
      brandName,
      headline,
      adType: "PRODUCT_COLLECTION",
      type: "Sponsored Brands",
      customImageAssetId,
      brandLogoAssetID,
      asins,
      reportDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
      status: state.toUpperCase(),
      timezone: profile.timezone,
    };
    const createProductAds = new productAdsSchema(create);
    await createProductAds.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored display productAds created successfully.",
      createProductAds,
    });
  } catch (error) {
      write_logs({ message: `[createSbProductCollection Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

async function createSbVideo(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, name, asins, state, adGroupId, videoAssetIds } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getAdGroup = await adGroupsSchema.findOne({ adGroupId }).lean();
    if (!getAdGroup) {
      return res.status(203).send({
        message: "Adgroup not found!",
        isSuccess: false,
      });
    }
    const getProductAd = await productAdsSchema.findOne({
      adGroupId,
      profileId,
      configId,
      name: nameRegex,
    }).lean();
    if (getProductAd) {
      return res.status(203).send({
        message: "ProductAd with the specified adgroup or name already exists!",
        isSuccess: false,
      });
    }
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const checkConfigAds = await getAccessToken(configId);
    const profile = await getProfile(configId, profileId);
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sb/v4/ads/video`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     "Content-Type": "application/vnd.sbadresource.v4+json",
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
    //     if (responseBody.ads.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "ProductAds with the specified name already exists.",
    //         error: responseBody.ads.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       configId,
    //       currencyCode: profile.currencyCode,
    //       campaignId: responseBody.ads.success[0].ad.campaignId,
    //       adGroupId: responseBody.ads.success[0].ad.adGroupId,
    //       adId: responseBody.ads.success[0].adId,
    //       url: responseBody.ads.success[0].ad.landingPage.url,
    //       name: responseBody.ads.success[0].ad.name,
    //       adType: "VIDEO",
    //       type,
    //       videoAssetIds: responseBody.ads.success[0].ad.creative.videoAssetIds,
    //       asins: responseBody.ads.success[0].ad.landingPage.asins,
    //       reportDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
    //       status: responseBody.ads.success[0].ad.state,
    //       timezone: profile.timezone,
    //     };
    //     const createProductAds = new productAdsSchema(create);
    //     await createProductAds.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored display productAds created successfully.",
    //       createProductAds,
    //     });
    //   }
    // });
    const create = {
      profileId,
      configId,
      currencyCode: profile.currencyCode,
      campaignId: getAdGroup.campaignId,
      adGroupId,
      adId: Math.floor(100000 + Math.random() * 900000),
      name,
      adType: "VIDEO",
      type: "Sponsored Brands",
      asins,
      videoAssetIds,
      reportDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
      status: state.toUpperCase(),
      timezone: profile.timezone,
    };
    const createProductAds = new productAdsSchema(create);
    await createProductAds.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored display productAds created successfully.",
      createProductAds,
    });
  } catch (error) {
      write_logs({ message: `[createSbVideo Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

exports.updateProductAds = async (req, res) => {
  const { type, adtype } = req.body;
  try {
    if (type == "Sponsored Products") {
      await updateSpProductAds(req, res);
    } else if (type == "Sponsored Brands" && adtype == "Product Collection") {
      await updateSbProductCollection(req, res);
    } else if (type == "Sponsored Brands" && adtype == "Video") {
      await updateSBvideo(req, res);
    } else if (type == "Sponsored Display") {
      await updateSdProductAds(req, res);
    } else {
      return res.status(203).send({
        isSuccess: false,
        message: "Type and ad type required.",
      });
    }
  } catch (error) {
      write_logs({ message: `[updateProductAds Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

async function updateSpProductAds(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, state } = req.body;
    const bodyData = {
      productAds: [
        {
          state,
          adId: req.params.id,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(configId);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sp/productAds`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.spProductAd.v3+json",
    //     "Content-Type": "application/vnd.spProductAd.v3+json",
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
    //     if (responseBody.productAds.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "ProductAds with the specified name already exists.",
    //         error: responseBody.productAds.error,
    //       });
    //     }
    // const latestData = await productAdsSchema
    //   .findOne({ adId: req.params.id })
    //   .sort({ reportDate: -1 });
    //     await productAdsSchema
    //       .findOneAndUpdate(
    //         { adId: req.params.id, reportDate: latestData.reportDate },
    //         { status: state },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((productAds) => {
    //         return res.status(200).send({
    //           data: productAds,
    //           message: `ProductAds data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
        write_logs({ message: `[updateSpProductAds Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    //         return res.status(203).send({
    //           error: "An internal server error occurred",
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      status: state,
    };
    const latestData = await productAdsSchema
      .findOne({ configId, adId: req.params.id })
      .sort({ reportDate: -1 });
    await productAdsSchema
      .findOneAndUpdate(
        {
          adId: req.params.id,
          reportDate: latestData.reportDate,
          configId,
        },
        updateData,
        { new: true }
      )
      .then((productAd) => {
        if (!productAd) {
          return res.status(203).send({
            message: `ProductAd not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: productAd,
          message: `ProductAd data updated successfully.`,
          isSuccess: true,
        });
      })
      .catch((error) => {
          write_logs({ message: `[updateSpProductAds Promise Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[updateSpProductAds Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

async function updateSbProductCollection(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, name, state, adGroupId } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getProductAd = await productAdsSchema.findOne({
      adId: { $ne: req.params.id },
      adGroupId,
      profileId,
      configId,
      name: nameRegex,
    }).lean();
    if (getProductAd) {
      return res.status(203).send({
        message: "ProductAd with the specified adgroup or name already exists!",
        isSuccess: false,
      });
    }
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(configId);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sb/v4/ads`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.sbadresource.v4+json",
    //     "Content-Type": "application/vnd.sbadresource.v4+json",
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
    //     if (responseBody.ads.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "ProductAds with the specified name already exists.",
    //         error: responseBody.ads.error,
    //       });
    //     }
    // const latestData = await productAdsSchema
    //   .findOne({ adId: req.params.id })
    //   .sort({ reportDate: -1 });
    //     await productAdsSchema
    //       .findOneAndUpdate(
    //         { adId: req.params.id, reportDate: latestData.reportDate },
    //         { status: state.toUpperCase(), name },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((productAds) => {
    //         return res.status(200).send({
    //           data: productAds,
    //           message: `ProductAds data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
        write_logs({ message: `[updateSbProductCollection Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    //         return res.status(203).send({
    //           error: "An internal server error occurred",
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      status: state.toUpperCase(),
      name,
    };
    const latestData = await productAdsSchema
      .findOne({ configId, adId: req.params.id })
      .sort({ reportDate: -1 });
    await productAdsSchema
      .findOneAndUpdate(
        { adId: req.params.id, reportDate: latestData.reportDate, configId },
        updateData,
        { new: true }
      )
      .then((productAd) => {
        if (!productAd) {
          return res.status(203).send({
            message: `productAd not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: productAd,
          message: `ProductAd data updated successfully.`,
          isSuccess: true,
        });
      })
      .catch((error) => {
          write_logs({ message: `[updateSbProductCollection Promise Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[updateSbProductCollection Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

async function updateSBvideo(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, name, state, adGroupId } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getProductAd = await productAdsSchema.findOne({
      adId: { $ne: req.params.id },
      adGroupId,
      configId,
      profileId,
      name: nameRegex,
    }).lean();
    if (getProductAd) {
      return res.status(203).send({
        message: "ProductAd with the specified adgroup or name already exists!",
        isSuccess: false,
      });
    }
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(configId);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sb/v4/ads`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.sbadresource.v4+json",
    //     "Content-Type": "application/vnd.sbadresource.v4+json",
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
    //     if (responseBody.ads.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "ProductAds with the specified name already exists.",
    //         error: responseBody.ads.error,
    //       });
    //     }
    // const latestData = await productAdsSchema
    //   .findOne({ adId: req.params.id })
    //   .sort({ reportDate: -1 });
    //     await productAdsSchema
    //       .findOneAndUpdate(
    //         { adId: req.params.id , reportDate: latestData.reportDate},
    //         {
    //           status: state.toUpperCase(),
    //           name,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((productAds) => {
    //         return res.status(200).send({
    //           data: productAds,
    //           message: `ProductAds data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
        write_logs({ message: `[updateSBvideo Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    //         return res.status(203).send({
    //           error: "An internal server error occurred",
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      status: state.toUpperCase(),
      name,
    };
    const latestData = await productAdsSchema
      .findOne({ adId: req.params.id, configId })
      .sort({ reportDate: -1 });
    await productAdsSchema
      .findOneAndUpdate(
        { adId: req.params.id, reportDate: latestData.reportDate, configId },
        updateData,
        { new: true }
      )
      .then((productAd) => {
        if (!productAd) {
          return res.status(203).send({
            message: `productAd not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: productAd,
          message: `ProductAd data updated successfully.`,
          isSuccess: true,
        });
      })
      .catch((error) => {
          write_logs({ message: `[updateSBvideo Promise Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[updateSBvideo Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

async function updateSdProductAds(req, res) {
  try {
    const configId = req?.config?.configId;
    let { profileId, state } = req.body;
    const bodyData = {
      productAds: [
        {
          state: state.toLowerCase(),
          adId: req.params.id,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(configId);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sd/productAds`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
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
    //     if (responseBody.productAds.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "ProductAds with the specified name already exists.",
    //         error: responseBody.productAds.error,
    //       });
    //     }
    // const latestData = await keywordSchema
    // .findOne({ keywordId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await productAdsSchema
    //       .findOneAndUpdate(
    //         { adId: req.params.id, reportDate: latestData.reportDate },
    //         { status: state.toUpperCase() },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((productAds) => {
    //         return res.status(200).send({
    //           data: productAds,
    //           message: `ProductAds data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
        write_logs({ message: `[updateSdProductAds Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    //         return res.status(203).send({
    //           error: "An internal server error occurred",
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      status: state.toUpperCase(),
    };
    const latestData = await productAdsSchema
      .findOne({ configId, adId: req.params.id })
      .sort({ reportDate: -1 });
    await productAdsSchema
      .findOneAndUpdate(
        { adId: req.params.id, reportDate: latestData.reportDate, configId },
        updateData,
        { new: true }
      )
      .then((productAd) => {
        if (!productAd) {
          return res.status(203).send({
            message: `ProductAd not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: productAd,
          message: `ProductAd data updated successfully.`,
          isSuccess: true,
        });
      })
      .catch((error) => {
          write_logs({ message: `[updateSdProductAds Promise Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[updateSdProductAds Error] ${error?.message || error} [body] ${JSON.stringify(error?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

exports.listProductAds = async (req, res) => {
  const configId = req?.config?.configId;
  const adType = req.adType;
  const { adTypeProductAdsSchema } = req.models;

  try {
    let {
      fromDate,
      toDate,
      profileId,
      pageNo = 1,
      perPage = 10,
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
      return res.status(203).send({ isSuccess: false, message: "Profile id required!" });
    }

    const profile = await getProfile(configId, profileId);
    const reportDate = {
      $gte: fromDate || moment().tz(profile.timezone).format("YYYY-MM-DD"),
      $lte: toDate || moment().tz(profile.timezone).format("YYYY-MM-DD"),
    };

    const campaignReportDate = { $eq: moment().tz(profile.timezone).format("YYYY-MM-DD") };

    const filter = {
      configId,
      profileId: Number(profileId),
      reportDate,
      ...(type && { type }),
      ...(status && { status }),
      // ...(searchName && {
      //   $or: [
      //     { asins: new RegExp(RegExp.escape(searchName), "i") },
      //     { sku: new RegExp(RegExp.escape(searchName), "i") },
      //   ]
      // }),
    };

    // Additional field filtering
    let extraMatchStage = null;
    if (fieldName && fieldOperator && fieldValue !== undefined) {
      const fieldFilter = buildFieldFilter(fieldName, fieldOperator, fieldValue);
      if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
        const extraFieldFilter = buildFieldFilter(fieldName, extraFieldOperator, extraFieldValue);
        extraMatchStage = { [`$${conditions.toLowerCase()}`]: [fieldFilter, extraFieldFilter] };
      } else {
        extraMatchStage = fieldFilter;
      }
    }

    const pipeline = [
      { $match: filter },
      { $sort: { reportDate: -1, createdAt: -1 } },
      {
        $group: {
          _id: { sku: "$sku", asin: "$asins", campaignId: "$campaignId", adGroupId: "$adGroupId" },
          latestStatus: { $first: "$status" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          orders: { $sum: "$orders" },
          cpc: { $avg: "$cpc" },
          latestCreatedAt: { $max: "$createdAt" },
          campaignName: { $first: "$campaignName" },
          campaignStatus: { $first: "$status" }
        }
      },
      ...(extraMatchStage ? [{ $match: extraMatchStage }] : []),
      {
        $addFields: {
          ctr: { $cond: [{ $gt: ["$impressions", 0] }, { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] }, 0] },
          conversionRate: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] }, 0] },
          acos: { $cond: [{ $gt: ["$sales", 0] }, { $round: [{ $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 2] }, 0] },
          roas: { $cond: [{ $gt: ["$spend", 0] }, { $round: [{ $divide: ["$sales", "$spend"] }, 2] }, 0] }
        }
      },
      { $unwind: { path: "$campaignData", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: AD_TYPE_COLLECTIONS?.[adType]?.["campaign"],
          let: { campaignId: "$_id.campaignId" },
          pipeline: [
            { $match: { reportDate: campaignReportDate, $expr: { $eq: ["$campaignId", "$$campaignId"] } } },
            { $limit: 1 },
            { $project: { status: 1 } }
          ],
          as: "campaignData"
        }
      },
      { $unwind: { path: "$campaignData", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { sku: "$_id.sku", asin: "$_id.asin" },
          latestStatus: { $first: "$latestStatus" },
          latestCreatedAt: { $first: "$latestCreatedAt" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          orders: { $sum: "$orders" },
          cpc: { $avg: "$cpc" },
          campaigns: {
            $push: {
              campaignId: "$_id.campaignId",
              adGroupId: "$_id.adGroupId",
              name: "$campaignName",
              status: { $ifNull: ["$campaignData.status", "$campaignStatus"] },
              impressions: "$impressions",
              clicks: "$clicks",
              orders: "$orders",
              spend: "$spend",
              sales: "$sales",
              cpc: "$cpc",
              ctr: "$ctr",
              conversionRate: "$conversionRate",
              acos: "$acos",
              roas: "$roas"
            }
          }
        }
      },
      {
        $addFields: {
          totalCpc: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $divide: ["$spend", "$clicks"] }, 2] }, 0] },
          totalCtr: { $cond: [{ $gt: ["$impressions", 0] }, { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] }, 0] },
          totalConversionRate: { $cond: [{ $gt: ["$clicks", 0] }, { $round: [{ $multiply: [{ $divide: ["$orders", "$clicks"] }, 100] }, 2] }, 0] },
          totalAcos: { $cond: [{ $gt: ["$sales", 0] }, { $round: [{ $multiply: [{ $divide: ["$spend", "$sales"] }, 100] }, 2] }, 0] },
          totalRoas: { $cond: [{ $gt: ["$spend", 0] }, { $round: [{ $divide: ["$sales", "$spend"] }, 2] }, 0] }
        }
      },
      {
        $lookup: {
          from: "productlistings",
          let: { asin: "$_id.asin", sku: "$_id.sku" },
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
            { "_id.sku": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
            { "_id.asin": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
            { "productData.title": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } }
          ]
        }
      }] : []),
      {
        $project: {
          _id: 0,
          sku: "$_id.sku",
          asins: "$_id.asin",
          status: "$latestStatus",
          clicks: 1,
          orders: 1,
          impressions: 1,
          sales: { $round: ["$sales", 2] },
          spend: { $round: ["$spend", 2] },
          campaigns: 1,
          productData: 1,
          cpc: "$totalCpc",
          ctr: "$totalCtr",
          conversionRate: "$totalConversionRate",
          acos: "$totalAcos",
          roas: "$totalRoas",
          createdAt: "$latestCreatedAt"
        }
      },
      ...(sortType ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }] : [{ $sort: { createdAt: -1 } }]),
      {
        $facet: {
          metadata: [
            { $count: "total" }
          ],
          data: [
            { $skip: (pageNo - 1) * perPage },
            { $limit: perPage }
          ]
        }
      }
    ];

    const productAdsResult = await adTypeProductAdsSchema.aggregate(pipeline);

    const totalRecords = productAdsResult[0].metadata[0]?.total || 0;
    const getProductAds = productAdsResult[0].data;

    return res.status(200).send({
      isSuccess: true,
      getProductAds: getProductAds,
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
    });
  } catch (error) {
      write_logs({ message: `[listProductAds Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
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
    const { profileId, type } = req.body;
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required!",
        isSuccess: false,
      });
    }
    if (!type) {
      return res.status(203).send({
        message: "Type is required!",
        isSuccess: false,
      });
    }
    const adGroups = await adGroupsSchema.aggregate([
      {
        $match: {
          profileId,
          configId: new ObjectId(configId),
          type,
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
          _id: {
            adGroupId: "$adGroupId",
          },
          adGroup: {
            $first: "$$ROOT",
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: "$adGroup",
        },
      },
      {
        $project: {
          name: 1,
          adGroupId: 1,
          type: 1,
          _id: 0,
        },
      },
    ]);
    if (adGroups.length === 0) {
      return res.status(203).send({
        message: "AdGroups not found!",
        isSuccess: false,
      });
    }
    return res.status(200).send({
      data: adGroups,
      totalRecords: adGroups.length,
      message: "AdGroups list successfully.",
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[listAdGroupName Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.listProductFromAmazon = async (req, res) => {
  try {
    const getProfileId = await profileSchema.find({
      profileId: req.body.profileId,
    }).lean();
    let reportDate = "";
    await Promise.all(
      getProfileId.map((i) => limit(async () => {
        const checkConfigAds = await getAccessToken(i.configId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {
          reportDate = moment().tz(i.timezone).format("YYYY-MM-DD");
          const spProductAds = await getSpProducts(
            i.configId,
            i.profileId,
            checkConfigAds,
            i.currencyCode,
            i.timezone,
            reportDate
          );
          if (spProductAds.length > 0) {
            await Promise.all(
              spProductAds.map(async (item) => {
                const getProduct = await productSchema.findOne({
                  configId: item.configId,
                  profileId: item.profileId,
                  asin: item.asin,
                  sku: item.sku,
                  reportDate,
                }).lean();
                if (!getProduct) {
                  let product = new productSchema(item);
                  await product.save();
                } else {
                  await productSchema.findByIdAndUpdate(
                    { _id: getProduct._id },
                    item,
                    { new: true }
                  );
                }
              })
            );
          }
        }
      }))
    );
    const filter = {
      reportDate,
    };
    const getProduct = await productSchema
      .find(filter)
      .sort({ type: -1, status: 1 });
    const totalRecords = await productSchema.count(filter);
    return res.status(200).send({
      isSuccess: true,
      message: "Product listing successfully.",
      data: getProduct,
      totalRecords: totalRecords,
    });
  } catch (error) {
      write_logs({ message: `[listProductFromAmazon Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.cronListProductFromAmazon = async (pastSyncObj) => {
  // cron_logs({ message: `cronListProductFromAmazon` });
  try {

    const { profileId, configId, cronjobid, recurring } = pastSyncObj ?? {};
    const dates = pastSyncObj?.dates ?? [];
    const cronName = "Products Meta Listing";

    const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", recurring);
    const getProfileId = (await profileSchema.find({ isActive: true, isSpSyncEnabled: true, ...(profileId && { profileId }), ...(configId && { configId }) }).lean())
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
        message: `Cron Products Meta Listing stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
        log_type: "warn"
      });
    }

    const listPromises = getProfileId.map((profile) => limit(async () => {
      if (global.updateTaskProgress) global.updateTaskProgress("Products Meta Listing");
      const checkConfigAds = await getAccessToken(profile.configId);
      if (
        checkConfigAds &&
        checkConfigAds.adsAccessToken
      ) {
        const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");
        if (dates.length == 0) {
          dates.push(currentDate);
        }

        await processSPProductPage({
          profile,
          checkConfigAds,
          dates
        });

        await processSBProductPage({
          profile,
          checkConfigAds,
          dates
        });

        await processSDProductPage({
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
          message: `Profile: ${profile.name}, Products Meta listed successfully.`,
        });

      } else {
        return cron_logs({
          message: `Account disconnected in Products Meta Listing for profile ${profile.name}`,
        });
      }
    }))

    await Promise.all(listPromises);

    return cron_logs({
      message: "Products Meta Listing successfully.",
    });

  } catch (error) {
    return cron_logs({
      message: `Products Meta Listing err: ${error}`,
      log_type: "error",
    });
  }
};

exports.manualListProductsFromAmazon = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Products Meta Listing",
      isActive: false,
    }).lean();
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your Products Meta Listing status is deactive.`,
        log_type: "info",
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
    if (!(getCron.cronName == "Products Meta Listing")) {
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
            cronName: "Products Meta Listing",
            status: "PENDING",
            historyDate: reportDate,
          }).lean();
          if (!getCronData) {
            const createCronHistory = new cronJobHistorySchema({
              configId: i.configId,
              profileId: i.profileId,
              cronName: "Products Meta Listing",
              status: "PENDING",
              historyDate: reportDate,
            });
            await createCronHistory.save();
          }

          let spProductAds = [];
          spProductAds = await getSpProducts(
            i.configId,
            i.profileId,
            checkConfigAds,
            i.currencyCode,
            i.timezone,
            reportDate
          );
          if (spProductAds.length > 0) {
            await Promise.all(
              spProductAds.map(async (item) => {
                const getProduct = await productSchema.findOne({
                  configId: item.configId,
                  profileId: item.profileId,
                  asin: item.asin,
                  sku: item.sku,
                  reportDate,
                }).lean();
                if (!getProduct) {
                  let product = new productSchema(item);
                  await product.save();
                } else {
                  await productSchema.findByIdAndUpdate(
                    { _id: getProduct._id },
                    item,
                    { new: true }
                  );
                }
              })
            );
          }
        } else {
          return product_write_logs({
            message: `Account disconnected in Products Meta Listing ${i.configId
              }, Config: ${checkConfigAds}`,
            log_type: "info",
          });
        }
      })
    );

    const getUpdateCronData = await cronJobHistorySchema.findOne({
      configId: configId,
      profileId: profileId,
      cronName: "Products Meta Listing",
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
      message: "Product listing successfully.",
    });
  } catch (error) {
      write_logs({ message: `[manualListProductsFromAmazon Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

async function processSPProductPage({
  profile,
  checkConfigAds,
  dates
}) {
  const getPage = await fetchSPProductPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let page = 0;

  do {
    const { ProductMetadataList, pageIndex } = await getPage(page);
    page = pageIndex;

    if (!ProductMetadataList.length) break;

    const bulkOps = [];

    ProductMetadataList.map((item) => {
      dates.map((reportDate) => {
        bulkOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              asin: item.asin,
              sku: item.sku,
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
      })
    })

    if (bulkOps.length) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page}, SP Product Listing Count: ${bulkOps.length}`,
      });
      await parallelBulkWrite(productSchema, bulkOps);
    }

  } while (true);
}

async function fetchSPProductPage({
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
}) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(pageIndex = 0) {
    const bodyData = {
      checkItemDetails: "true",
      adType: "SP",
      pageIndex,
      checkEligibility: "true",
      pageSize: 200,
    };

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: `${getAccount.amazonUrl}/product/metadata`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      data: bodyData,
      meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
    }));

    if (response.status !== 200) return { ProductMetadataList: [], pageIndex };

    const body = response.data;
    const ProductMetadataList = (body.ProductMetadataList || []).map(item => ({
      configId,
      profileId,
      currencyCode,
      asin: item.asin ? item.asin : null,
      availability: item.availability ? item.availability : null,
      brand: item.brand ? item.brand : null,
      eligibilityStatus: item.eligibilityStatus ? item.eligibilityStatus : null,
      imageUrl: item.imageUrl ? item.imageUrl : null,
      amount: item.priceToPay ? item.priceToPay.amount : null,
      sku: item.sku ? item.sku : null,
      title: item.title ? item.title : null,
      timezone,
      type: "Sponsored Products",
    }));

    return {
      ProductMetadataList,
      pageIndex: pageIndex + 1,
    };
  };
}

async function processSBProductPage({
  profile,
  checkConfigAds,
  dates
}) {
  const getPage = await fetchSBProductPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let page = 0;

  do {
    const { ProductMetadataList, pageIndex } = await getPage(page);
    page = pageIndex;

    if (!ProductMetadataList.length) break;

    const bulkOps = [];

    ProductMetadataList.map((item) => {
      dates.map((reportDate) => {
        bulkOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              asin: item.asin,
              sku: item.sku,
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
      })
    })

    if (bulkOps.length) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page}, SB Product Listing Count: ${bulkOps.length}`,
      });
      await parallelBulkWrite(sbProductSchema, bulkOps);
    }

  } while (true);
}

async function fetchSBProductPage({
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
}) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(pageIndex = 0) {
    const bodyData = {
      checkItemDetails: "true",
      adType: "SB",
      pageIndex,
      checkEligibility: "true",
      pageSize: 200,
    };

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: `${getAccount.amazonUrl}/product/metadata`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      data: bodyData,
      meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
    }));

    if (response.status !== 200) return { ProductMetadataList: [], pageIndex };

    const body = response.data;
    const ProductMetadataList = (body.ProductMetadataList || []).map(item => ({
      configId,
      profileId,
      currencyCode,
      asin: item.asin ? item.asin : null,
      availability: item.availability ? item.availability : null,
      brand: item.brand ? item.brand : null,
      eligibilityStatus: item.eligibilityStatus ? item.eligibilityStatus : null,
      imageUrl: item.imageUrl ? item.imageUrl : null,
      amount: item.priceToPay ? item.priceToPay.amount : null,
      sku: item.sku ? item.sku : null,
      title: item.title ? item.title : null,
      timezone,
      type: "Sponsored Brands",
    }));

    return {
      ProductMetadataList,
      pageIndex: pageIndex + 1,
    };
  };
}

async function processSDProductPage({
  profile,
  checkConfigAds,
  dates
}) {
  const getPage = await fetchSDProductPage({
    configId: profile.configId,
    profileId: profile.profileId,
    checkConfigAds,
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
  });

  let page = 0;

  do {
    const { ProductMetadataList, pageIndex } = await getPage(page);
    page = pageIndex;

    if (!ProductMetadataList.length) break;

    const bulkOps = [];

    ProductMetadataList.map((item) => {
      dates.map((reportDate) => {
        bulkOps.push({
          updateOne: {
            filter: {
              configId: item.configId,
              profileId: item.profileId,
              asin: item.asin,
              sku: item.sku,
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
      })
    })

    if (bulkOps.length) {
      cron_logs({
        message: `Profile: ${profile.name}, Page: ${page}, SD Product Listing Count: ${bulkOps.length}`,
      });
      await parallelBulkWrite(sdProductSchema, bulkOps);
    }

  } while (true);
}

async function fetchSDProductPage({
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
}) {
  const getAccount = await getProfile(configId, profileId);

  return async function getPage(pageIndex = 0) {
    const bodyData = {
      checkItemDetails: "true",
      adType: "SD",
      pageIndex,
      checkEligibility: "true",
      pageSize: 200,
    };

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: `${getAccount.amazonUrl}/product/metadata`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      data: bodyData,
      meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
    }));

    if (response.status !== 200) return { ProductMetadataList: [], pageIndex };

    const body = response.data;
    const ProductMetadataList = (body.ProductMetadataList || []).map(item => ({
      configId,
      profileId,
      currencyCode,
      asin: item.asin ? item.asin : null,
      availability: item.availability ? item.availability : null,
      brand: item.brand ? item.brand : null,
      eligibilityStatus: item.eligibilityStatus ? item.eligibilityStatus : null,
      imageUrl: item.imageUrl ? item.imageUrl : null,
      amount: item.priceToPay ? item.priceToPay.amount : null,
      sku: item.sku ? item.sku : null,
      title: item.title ? item.title : null,
      timezone,
      type: "Sponsored Display",
    }));

    return {
      ProductMetadataList,
      pageIndex: pageIndex + 1,
    };
  };
}

async function getSpProducts(
  configId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
  reportDate
) {
  return new Promise(async (resolve, reject) => {
    const getAccount = await getProfile(configId, profileId);
    const spOptions = {
      method: "POST",
      url: `${getAccount.amazonUrl}/product/metadata`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      meta: { configId: configId, tokenKey: "adsAccessToken", profileId: profileId }
    };
    const products = [];
    function makeRequest(pageIndex) {
      spOptions.data = {
        checkItemDetails: "true",
        adType: "SP",
        pageIndex,
        checkEligibility: "true",
        pageSize: 300,
      };
      retryWithBackoff(() => amazonAxios(spOptions)).then((response) => {
        if (response.status == 200) {
          const body = response.data;
          if (body.ProductMetadataList.length > 0) {
            body.ProductMetadataList.forEach((item) => {
              let obj = {
                configId,
                profileId,
                currencyCode,
                asin: item.asin ? item.asin : null,
                availability: item.availability ? item.availability : null,
                brand: item.brand ? item.brand : null,
                eligibilityStatus: item.eligibilityStatus
                  ? item.eligibilityStatus
                  : null,
                imageUrl: item.imageUrl ? item.imageUrl : null,
                amount: item.priceToPay ? item.priceToPay.amount : null,
                sku: item.sku ? item.sku : null,
                title: item.title ? item.title : null,
                timezone,
                type: "Sponsored Products",
              };
              products.push(obj);
            });
            makeRequest(pageIndex + 1);
          } else {
            resolve(products);
          }
        }
        else {
          cron_logs({
            message: `Config ID: ${configId}, Profile ID: ${profileId} SP product listing err: ${response.data}`,
            log_type: "error",
          });
          resolve(products);
        }
      }).catch((error) => {
        cron_logs({
          message: `Config ID: ${configId}, Profile ID: ${profileId} SP product listing err: ${error}`,
          log_type: "error",
        });
        resolve(products);
      })
    }
    makeRequest(0);
  });
}

exports.listProductFromDB = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    let { profileId, pageNo, perPage, search, type, availability } = req.body;
    pageNo = pageNo ? pageNo : 1;
    perPage = perPage ? perPage : 10;
    let filter = { configId: new ObjectId(configId), profileId };
    if (type) {
      filter.type = type;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
        { asin: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
        { sku: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
      ];
    }
    if (availability) {
      filter.availability = availability;
    }
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required!",
        isSuccess: false,
      });
    }
    const products = await productSchema.aggregate([
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
            asin: "$asin",
            sku: "$sku",
          },
          product: {
            $first: "$$ROOT",
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: "$product",
        },
      },
      {
        $project: {
          title: 1,
          amount: 1,
          asin: 1,
          sku: 1,
          type: 1,
          _id: 1,
          imageUrl: 1,
          eligibilityStatus: 1,
          brand: 1,
          currencyCode: 1,
          availability: 1,
        },
      },
      {
        $facet: {
          paginatedResults: [
            { $skip: perPage * pageNo - perPage },
            { $limit: perPage },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);
    if (products.length === 0) {
      return res.status(203).send({
        message: `Products not found!`,
        isSuccess: false,
      });
    }
    const totalRecords =
      products[0].totalCount.length > 0 ? products[0].totalCount[0].count : 0;
    return res.status(200).send({
      currentPageNo: pageNo,
      totalPages: Math.ceil(totalRecords / perPage),
      totalRecords,
      data: products[0].paginatedResults,
      message: `Products list successfully.`,
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[listProductFromDB Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.topPerformanceProductAds = async (req, res) => {
  const configId = req?.config?.configId;
  try {
    let { fromDate, toDate, profileId } = req.body;
    let filter = {
      configId,
      profileId: Number(profileId),
    };
    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }
    const profile = await getProfile(configId, profileId);
    if (fromDate && toDate) {
      filter.reportDate = { $gte: fromDate, $lte: toDate };
    } else {
      fromDate = moment().tz(profile.timezone).format("YYYY-MM-DD");
      toDate = moment().tz(profile.timezone).format("YYYY-MM-DD");
      filter.reportDate = { $gte: fromDate, $lte: toDate };
    }
    const getProductsAds = [
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
            type: "$type",
            campaignId: "$campaignId",
            adGroupId: "$adGroupId",
            adId: "$adId",
          },
          productAds: {
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
          cpc: {
            $sum: "$cpc",
          },
          clicks: {
            $sum: "$clicks",
          },
        },
      },
      {
        $lookup: {
          from: "ad_groups",
          localField: "_id.adGroupId",
          foreignField: "adGroupId",
          as: "adGroup",
        },
      },
      {
        $lookup: {
          from: "campaigns",
          localField: "_id.campaignId",
          foreignField: "campaignId",
          as: "campaign",
        },
      },
      {
        $addFields: {
          adGroupName: {
            $arrayElemAt: [
              {
                $slice: ["$adGroup.name", -1],
              },
              0,
            ],
          },
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
          keywordId: "$_id.keywordId",
          type: "$_id.type",
          asin: { $arrayElemAt: ["$productAds.asins", 0] },
          status: "$productAds.status",
          campaignId: "$_id.campaignId",
          campaignName: 1,
          adGroupName: 1,
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
      { $limit: 5 },
    ];
    const productAdsResult = await productAdsSchema.aggregate(getProductsAds);
    return res.status(200).send({
      data: productAdsResult,
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[topPerformanceProductAds Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

RegExp.escape = function (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};


exports.bulkUpdateProductAds = async (req, res) => {
  try {
    const docs = await productAdsSchema.find({ asins: { $type: "array" } }).lean().limit(5);

    const operations = docs.map(doc => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { asin: (doc.asins || []).join(",") || null } }
      }
    }));

    const batchSize = 1000;

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      await productAdsSchema.bulkWrite(batch);
      console.log(`Updated batch ${i / batchSize + 1}`);
    }

    console.log("Done!");

    return res.status(200).send({
      isSuccess: true,
    });
  }
  catch (error) {
      write_logs({ message: `[bulkUpdateProductAds Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }

}

exports.cronProductUnavailabilityCheck = async () => {
  cron_logs({
    message: `India Time = ${moment()
      .tz("Asia/Kolkata")
      .format("HH:mm")} cronProductUnavailabilityCheck`,
    log_type: "info",
  });

  try {

    const getProfileId = await getActivePlanProfiles();
    const listPromises = getProfileId.map((profile) => limit(async () => {

      const reportDate = moment.tz(profile.timezone).format("YYYY-MM-DD");
      const pipeline = [
        {
          $match: {
            configId: profile.configId,
            profileId: profile.profileId,
            reportDate,
            availability: "OUT_OF_STOCK"
          }
        },
        {
          $lookup: {
            from: "product_ads",
            let: {
              asin: "$asin",
              rDate: reportDate
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$asins", "$$asin"] },
                      {
                        $eq: ["$reportDate", "$$rDate"]
                      }
                    ]
                  }
                }
              }
            ],
            as: "product_ad"
          },
        },
        {
          $match: {
            $expr: {
              $gt: [{ $size: "$product_ad" }, 0]
            }
          }
        },
        {
          $unwind: {
            path: "$product_ad",
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $lookup: {
            from: "campaigns",
            let: {
              cId: "$product_ad.campaignId",
              profId: "$profileId",
              cfgId: "$configId",
              rDate: reportDate
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $eq: ["$campaignId", "$$cId"]
                      },
                      {
                        $eq: ["$profileId", "$$profId"]
                      },
                      {
                        $eq: ["$configId", "$$cfgId"]
                      },
                      {
                        $eq: ["$reportDate", "$$rDate"]
                      }
                    ]
                  }
                }
              },
              {
                $project: {
                  _id: 0,
                  campaignId: 1,
                  status: 1,
                  name: 1
                }
              }
            ],
            as: "campaign"
          }
        },
        {
          $unwind: {
            path: "$campaign",
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $match: {
            "campaign.status": { $nin: ["PAUSED", "ARCHIVED"] }
          }
        },
        {
          $project: {
            _id: 0,
            configId: 1,
            profileId: 1,
            sku: 1,
            asin: 1,
            availability: 1,
            title: 1,
            campaignId: "$product_ad.campaignId",
            campaignName: "$product_ad.campaignName"
          }
        }
      ]

      const outOfStockProducts = await productSchema.aggregate(pipeline);

      if (outOfStockProducts.length > 0) {

        const notifyObjs = outOfStockProducts.map(p => ({
          profileId: p.profileId,
          configId: p.configId,
          notificationTitle: `Product is Out of Stock`,
          notificationText: `<b>Camapign:</b> ${p.campaignName} <br> <b>ASIN:</b> ${p.asin} <br>Fix stock to resume automation..`
        }));

        await adNotificationSchema.insertMany(notifyObjs);

        await Promise.all(
          outOfStockProducts?.map(async (p) => {
            const notificationTitle = `Product is Out of Stock`;
            const notificationMessage = `Camapign ${p.campaignName}, Asin: ${p.asin}, Fix stock to resume automation.`;
            await sendNotificationToUser(profile?.profileId, notificationTitle, notificationMessage)
          })
        )
      }

      const createCronHistory = new cronJobHistorySchema({
        configId: profile.configId,
        profileId: profile.profileId,
        cronName: "Product Unavailability Check",
        status: "COMPLETED",
        historyDate: moment().tz(profile.timezone).format("YYYY-MM-DD"),
      });
      await createCronHistory.save();

    }))

    await Promise.all(listPromises);
    cron_logs({
      message: "Notify product unavailability successfully.",
      log_type: "info",
    });

  } catch (error) {
    cron_logs({
      message: `Notify product unavailability err: ${error}`,
      log_type: "error",
    });
  }
}

exports.processReportFileStream = processReportFileStream;
exports.spGenerateReport = spGenerateReport;