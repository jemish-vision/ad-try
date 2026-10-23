const cronJobSchema = require("../models/cronJob.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const { getProfile, checkPermission, getCronNextSchedule } = require("../helper/common");
const moment = require("moment-timezone");
const profileSchema = require("../models/profiles.model");
const { write_logs } = require("../../winston/masterCron/logger");
const cronJobSchedularSchema = require("../models/cronJobSchedular.model");
const { generateCronExpression } = require("../helper/chatgpt");

const mongoose = require("mongoose");
const { cronBestPerformerGoogleReportGenerate, cronKeywordAnalysisReportGenerate } = require("./google.controller");
const { logAudit } = require("../helpers/auditHelper");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const { ObjectId } = mongoose.Types;
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));

exports.createCronJob = async (req, res) => {
  const configId = req?.config?.configId;
  const {
    profileId,
    cronName,
    cronDescription,
    frequency,
    dates,
    days,
    times,
    interval,
    hours,
    minutes,
  } = req.body;
  try {
    const getAccount = await getProfile(configId, profileId);
    if (!getAccount) {
      return res
        .status(203)
        .send({ message: "Please select valid account", isSuccess: false });
    }

    const gptResponse = await generateCronExpression(frequency, dates, days, times, interval, hours, minutes)
    if (!gptResponse.isValid) {
      return res
        .status(203)
        .send({
          message: gptResponse.message || "We can't create a cron expression for this setting. Please change your settings and try again.",
          isSuccess: false
        });
    }

    let createCron = new cronJobSchema({
      cronName,
      cronDescription,
      frequency,
      dates,
      days,
      times,
      interval,
      hours,
      minutes,
      cronExpression: gptResponse.cronExpression
    });
    const result = await createCron.save();

    let createCronScheduler = new cronJobSchedularSchema({
      configId,
      profileId,
      cronId: new ObjectId(result.id),
      cronName,
      timezone: getAccount.timezone
    });
    await createCronScheduler.save();

    return res.status(200).send({
      isSuccess: true,
      message: "Record created successfully",
    });

  } catch (error) {
      write_logs({ message: `[createCronJob Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};


exports.updateCronJob = async (req, res) => {
  const configId = req?.config?.configId;
  const {
    profileId,
    id,
    cronName,
    cronDescription,
    frequency,
    dates,
    days,
    times,
    interval,
    hours,
    minutes,
  } = req.body;
  try {
    const getAccount = await getProfile(configId, profileId);
    if (!getAccount) {
      return res
        .status(203)
        .send({ message: "Please select valid account", isSuccess: false });
    }

    const gptResponse = await generateCronExpression(frequency, dates, days, times, interval, hours, minutes)
    if (!gptResponse.isValid) {
      return res
        .status(203)
        .send({
          message: gptResponse.message || "We can't create a cron expression for this setting. Please change your settings and try again.",
          isSuccess: false
        });
    }

    await cronJobSchema.updateOne(
      {
        _id: id
      },
      {
        $set: {
          cronName,
          cronDescription,
          frequency,
          dates,
          days,
          times,
          interval,
          hours,
          minutes,
          cronExpression: gptResponse.cronExpression
        },
      },
      { upsert: true }
    );

    return res.status(200).send({
      isSuccess: true,
      message: "Record updated successfully",
    });

  } catch (error) {
      write_logs({ message: `[updateCronJob Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getAllCronJob = async (req, res) => {
  const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];

  const pageNo = req.body.pageNo ? req.body.pageNo : 1;
  const perPage = req.body.perPage ? req.body.perPage : 10;
  const { search, isActive, type, profileId } = req.body;
  try {
    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }
    let filter = {};
    if (search) {
      filter.cronName = { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") };
    }
    if (isActive) {
      filter.isActive = isActive;
    }
    if (type) {
      filter.cronName = { $regex: new RegExp(RegExp.escape(`${type}`?.trim()), "i") };
    }
    const getCrons = await cronJobSchema.find(filter).lean();
    const getProfile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
    let nextDateList = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
    nextDateList = nextDateList + " 11:00 PM";
    let nextDateReport = moment()
      .tz(getProfile.timezone)
      .add(1, "days")
      .format("YYYY-MM-DD");
    nextDateReport = nextDateReport + " 12:15 AM";
    await Promise.all(
      getCrons.map(async (cron) => {
        if (cron.cronName == "Campaign Listing") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "Campaign Listing",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");

          cron["nextRun"] = nextDateList;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateList;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "Campaign Report") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "Campaign Report",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");

          cron["nextRun"] = nextDateReport;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateReport;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "AdGroups Listing") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "AdGroups Listing",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");
          cron["nextRun"] = nextDateList;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateList;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "AdGroup Report") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "AdGroup Report",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");
          cron["nextRun"] = nextDateReport;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateReport;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "Keywords Listing") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "Keywords Listing",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");
          cron["nextRun"] = nextDateList;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateList;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "Keyword Report") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "Keyword Report",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");
          cron["nextRun"] = nextDateReport;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateReport;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "ProductAds Listing") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "ProductAds Listing",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");

          cron["nextRun"] = nextDateList;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateList;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "ProductAds Report") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "ProductAds Report",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");
          cron["nextRun"] = nextDateReport;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateReport;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "Placement Report") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "Placement Report",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");
          cron["nextRun"] = nextDateReport;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateReport;
          } else {
            cron["nextRun"] = "";
          }
        }
        if (cron.cronName == "Products Meta Listing") {
          const getCronData = await cronJobHistorySchema
            .findOne({
              configId: configId,
              profileId,
              cronName: "Products Meta Listing",
            })
            .sort({ updatedAt: -1 });
          cron["lastRun"] =
            getCronData == null
              ? ""
              : moment
                .tz(getCronData.createdAt, getProfile.timezone)
                .format("YYYY-MM-DD hh:mm A");
          cron["nextRun"] = nextDateList;
          cron["status"] = getCronData == null ? "" : getCronData.status;
          if (cron.isActive) {
            cron["nextRun"] = nextDateList;
          } else {
            cron["nextRun"] = "";
          }
        }
      })
    );
    const totalRecords = await cronJobSchema.count(filter);
    return res.status(200).send({
      isSuccess: true,
      message: "Cron Job listing successfully",
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      data: getCrons,
    });
  } catch (error) {
      write_logs({ message: `[getAllCronJob Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getAllCronJobByProfile = async (req, res) => {
  const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
  const userId = req.user._id;

  let { search, isActive, type, profileId, pageNo, perPage } = req.body;
  pageNo = pageNo ? pageNo : 1;
  perPage = perPage ? perPage : 10;
  try {
    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }
    let filter = {
      profileId: Number(profileId),
      configId,
    };
    if (search) {
      filter.cronName = { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") };
    }
    if (isActive) {
      filter.isActive = isActive;
    }
    if (type) {
      filter.cronName = { $regex: new RegExp(RegExp.escape(`${type}`?.trim()), "i") };
    }

    const pipeline = [
      {
        $match: filter
      },
      {
        $lookup: {
          from: "cronjobs",
          localField: "cronId",
          foreignField: "_id",
          as: "cron"
        }
      },
      {
        $unwind: {
          path: "$cron",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          "cron.isActive": true
        }
      },
      {
        $project: {
          configId: 1,
          cronId: 1,
          cronName: "$cron.cronName",
          cronDescription: "$cron.cronDescription",
          frequency: "$cron.frequency",
          dates: "$cron.dates",
          days: "$cron.days",
          times: "$cron.times",
          interval: "$cron.interval",
          hours: "$cron.hours",
          minutes: "$cron.minutes",
          profileId: 1,
          isActive: 1,
          timezone: 1,
          lastRun: 1,
          nextRun: 1
        }
      }
    ];
    const getCrons = await cronJobSchedularSchema.aggregate(pipeline);
    const getProfile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();

    const filteredCrons = await Promise.all(
      getCrons.map(async (cron) => {

        const getCronData = await cronJobHistorySchema
          .findOne({
            configId: configId,
            profileId,
            cronName: cron.cronName,
          })
          .sort({ updatedAt: -1 });

        cron["lastRun"] =
          getCronData == null
            ? ""
            : moment
              .utc(getCronData.updatedAt)
              .tz(getProfile.timezone)
              .format("YYYY-MM-DD hh:mm:ss A");

        const nextDate = getCronNextSchedule(cron, getProfile.timezone);
        cron["nextRun"] = cron.isActive ? moment.utc(nextDate).tz(getProfile.timezone).format("YYYY-MM-DD hh:mm:ss A") : "";
        cron["status"] = getCronData == null ? "" : getCronData.status;

        return cron;
      })
    );
    const filteredCronsWithoutNull = filteredCrons
      .filter((cron) => cron !== null)
      .sort((a, b) => a.cronName.localeCompare(b.cronName));

    const totalRecords = filteredCronsWithoutNull
      ? filteredCronsWithoutNull.length
      : 0;

    const startIndex = (pageNo - 1) * perPage;
    const endIndex = pageNo * perPage;
    const paginatedCrons = filteredCronsWithoutNull.slice(startIndex, endIndex);

    return res.status(200).send({
      isSuccess: true,
      message: "Cron Job listing successfully",
      currentPageNo: pageNo,
      totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      data: paginatedCrons,
    });
  } catch (error) {
      write_logs({ message: `[getAllCronJobByProfile Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getAllCronJobHistory = async (req, res) => {
  const configId = req?.config?.configId;
  const organizationId = req?.organizationId;
  const userId = req.user._id;

  permissionResult = await checkPermission(
    userId,
    SYSTEM_PAGES.CRON_JOB_HISTORY,
    PAGE_ACTIONS.VIEW_ONLY,
    true,
    organizationId
  );
  if (!permissionResult.hasPermission) {
    return res.status(203).send({
      isSuccess: false,
      message: permissionResult.message,
    });
  }
  let { profileId, pageNo, perPage, search, fromDate, toDate, type } = req.body;
  try {
    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }
    pageNo = pageNo ? pageNo : 1;
    perPage = perPage ? perPage : 10;
    const filter = {
      configId,
      profileId: Number(profileId),
    };
    if (search) {
      filter.cronName = { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") };
    }
    if (fromDate && toDate) {
      filter.historyDate = { $gte: fromDate, $lte: toDate };
    }
    if (type) {
      filter.cronName = { $regex: new RegExp(RegExp.escape(`${type}`?.trim()), "i") };
    }
    const getCronHistory = await cronJobHistorySchema
      .find(filter)
      .skip(perPage * pageNo - perPage)
      .limit(perPage)
      .sort({ updatedAt: -1 })
      .lean();
    const totalRecords = await cronJobHistorySchema.count(filter);
    return res.status(200).send({
      isSuccess: true,
      message: "Cron Job history listing successfully",
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      data: getCronHistory,
    });
  } catch (error) {
      write_logs({ message: `[getAllCronJobHistory Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.changeStatus = async (req, res) => {
  const { cronId, isActive } = req.body;
  await cronJobSchema
    .findByIdAndUpdate(cronId, { isActive }, { new: true })
    .then((status) => {
      if (!status) {
        return res.status(203).send({
          message: "Invalid id!",
          isSuccess: false,
        });
      }
      return res.status(200).send({
        message: "Status updated successfully.",
        isSuccess: true,
      });
    })
    .catch((error) => {
        write_logs({ message: `[changeStatus Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      return res.status(203).send({
        error: "An internal server error occurred",
        message: "Something went wrong, please try again!",
        isSuccess: false,
      });
    });
};

exports.changeStatusByProfile = async (req, res) => {
  const configId = req?.config?.configId;
  const { cronId, isActive, profileId } = req.body;
  await cronJobSchedularSchema
    .findOneAndUpdate(
      { cronId, profileId, configId },
      {
        isActive,
      },
      {
        new: true,
      }
    )
    .then(async (status) => {
      if (!status) {
        return res.status(203).send({
          message: "Invalid id!",
          isSuccess: false,
        });
      }

      await logAudit("CRON_JOB_SETTINGS", `Cron job ${status?.cronName} ${isActive ? "enabled" : "disabled"} successfully.`, { cronName: status?.cronName }, req?.user?.id);
      return res.status(200).send({
        message: "Status updated successfully.",
        isSuccess: true,
      });
    })
    .catch((error) => {
        write_logs({ message: `[changeStatusByProfile Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      return res.status(203).send({
        error: "An internal server error occurred",
        message: "Something went wrong, please try again!",
        isSuccess: false,
      });
    });
};

exports.cronMaster = async (req, res) => {
  try {
    const getCrons = await cronJobSchema.find().lean();
    const getProfileId = await profileSchema.find({ isActive: true }).lean();
    await Promise.all(
      getProfileId.map((profile) => limit(async () => {
        await Promise.all(
          getCrons.map(async (cron) => {
            const beforeDate = moment
              .tz(profile.timezone)
              .subtract(1, "days")
              .format("YYYY-MM-DD");
            const currentDate = moment
              .tz(profile.timezone)
              .format("YYYY-MM-DD");
            if (cron.cronName == "Campaign Listing") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "Campaign Listing",
                historyDate: beforeDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Campaign Listing cron not run for date: ${beforeDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Campaign Listing cron run successfully for date: ${beforeDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "Campaign Report") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "Campaign Report",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Campaign Report cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Campaign Report cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "AdGroups Listing") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "AdGroups Listing",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} AdGroups Listing cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} AdGroups Listing cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "AdGroup Report") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "AdGroup Report",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} AdGroups Report cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} AdGroups Report cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "Keywords Listing") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "Keywords Listing",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Keywords Listing cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Keywords Listing cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "Keyword Report") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "Keyword Report",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Keyword Report cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Keywords Report cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "ProductAds Listing") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "ProductAds Listing",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} ProductAds Listing cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} ProductAds Listing cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "ProductAds Report") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "ProductAds Report",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} ProductAds Report cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} ProductAds Report cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "Placement Report") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "Placement Report",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Placement Report cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Placement Report cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
            if (cron.cronName == "Products Meta Listing") {
              const getCronData = await cronJobHistorySchema.findOne({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "Products Meta Listing",
                historyDate: currentDate,
              }).lean();
              if (!getCronData) {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Products Meta Listing cron not run for date: ${currentDate}`,
                  log_type: "info",
                });
              } else {
                write_logs({
                  message: `${profile.configId} ${profile.profileId} Products Meta Listing cron run successfully for date: ${currentDate}`,
                  log_type: "info",
                });
              }
            }
          })
        );
      }))
    );
  } catch (error) {
      write_logs({ message: `[cronMaster Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getAllCronJobWithoutPagination = async (req, res) => {
  try {
    const data = await cronJobSchema.find().lean();
    const totalRecords = await cronJobSchema.count();
    return res.status(200).send({
      isSuccess: true,
      message: "Cron Job listing successfully",
      totalRecords,
      data,
    });
  } catch (error) {
      write_logs({ message: `[getAllCronJobWithoutPagination Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.manuallyRunCronJob = async (req, res) => {
  try {

    const { cronName, profileId } = req.body

    if (!profileId) {
      return res.status(203).send({ isSuccess: false, message: "Profile id required!" });
    }

    if (cronName === "Best Performer Report") {
      await cronBestPerformerGoogleReportGenerate(req);
    }
    if (cronName === "Keyword Analysis Report") {
      await cronKeywordAnalysisReportGenerate(req);
    }

    return res.status(200).send({
      isSuccess: true,
      message: "Cron job executed successfully",
    });
  } catch (error) {
      write_logs({ message: `[manuallyRunCronJob Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getAllMarsterCronJob = async (req, res) => {
  try {
    let { search, pageNo, perPage } = req.body;
    pageNo = pageNo ? pageNo : 1;
    perPage = perPage ? perPage : 10;

    let filter = {
      isActive: true
    }

    if (search) {
      filter.cronName = { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") };
    }

    cronList = await cronJobSchema
      .find(filter)
      .sort({ cronName: 1 })
      .lean();


    const startIndex = (pageNo - 1) * perPage;
    const endIndex = pageNo * perPage;

    const paginatedCrons = cronList.slice(startIndex, endIndex);

    return res.status(200).send({
      isSuccess: true,
      message: "Cron Job listing successfully",
      currentPageNo: pageNo,
      totalRecords: cronList.length,
      totalPages: Math.ceil(cronList.length / perPage),
      data: paginatedCrons,
    });
  }
  catch (error) {
      write_logs({ message: `[getAllMarsterCronJob Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}


exports.createMasterCronJob = async (req, res) => {

  try {
    const {
      cronName,
      cronDescription,
      frequency,
      dates,
      days,
      times,
      interval,
      hours,
      minutes,
    } = req.body;
    const gptResponse = await generateCronExpression(frequency, dates, days, times, interval, hours, minutes)
    if (!gptResponse.isValid) {
      return res
        .status(203)
        .send({
          message: gptResponse.message || "We can't create a cron expression for this setting. Please change your settings and try again.",
          isSuccess: false
        });
    }

    let createCron = new cronJobSchema({
      cronName,
      cronDescription,
      frequency,
      dates,
      days,
      times,
      interval,
      hours,
      minutes,
      cronExpression: gptResponse.cronExpression
    });
    const result = await createCron.save();
    const profiles = await profileSchema.find({ isActive: true }).lean();

    profiles.forEach(async (profile) => {
      let createCronScheduler = new cronJobSchedularSchema({
        configId: profile.configId,
        profileId: profile.profileId,
        cronId: new ObjectId(result.id),
        cronName,
        timezone: profile.timezone
      });
      await createCronScheduler.save();
    });

    return res.status(200).send({
      isSuccess: true,
      message: "Record created successfully",
    });

  } catch (error) {
      write_logs({ message: `[createMasterCronJob Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};


exports.updateMasterCronJob = async (req, res) => {

  try {
    const {
      id,
      cronName,
      cronDescription,
      frequency,
      dates,
      days,
      times,
      interval,
      hours,
      minutes,
    } = req.body;

    const gptResponse = await generateCronExpression(frequency, dates, days, times, interval, hours, minutes)
    if (!gptResponse.isValid) {
      return res
        .status(203)
        .send({
          message: gptResponse.message || "We can't create a cron expression for this setting. Please change your settings and try again.",
          isSuccess: false
        });
    }

    await cronJobSchema.updateOne(
      {
        _id: new ObjectId(id)
      },
      {
        $set: {
          cronName,
          cronDescription,
          frequency,
          dates,
          days,
          times,
          interval,
          hours,
          minutes,
          cronExpression: gptResponse.cronExpression
        },
      },
      { upsert: true }
    );

    return res.status(200).send({
      isSuccess: true,
      message: "Record updated successfully",
    });

  } catch (error) {
      write_logs({ message: `[updateMasterCronJob Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};