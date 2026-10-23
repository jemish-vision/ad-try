const jwt = require("jsonwebtoken");
const axios = require("axios");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const moment = require("moment-timezone");
const fs = require("fs");
const zlib = require("node:zlib");
const { parse } = require("csv-parse/sync");
const xml2js = require("xml2js");
const crypto = require("crypto");
const path = require("path");
const https = require("https");

const {
  setCacheWithLog,
  getCacheWithLog,
  clearAccessTokenCache,
  clearSPAccessTokenCache,
  clearProfileCache,
  clearActivePlanProfilesCache,
  clearOrgPagePermissionCache
} = require("../services/redis.service");

const safeJsonParse = (jsonString, fallback = undefined) => {
  try {
    return JSON.parse(jsonString, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    });
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
};

const userSchema = require("../models/user.model");
const configSchema = require("../models/config.model");
const asanaConfigSchema = require("../models/asanaConfig.model");
const sellerConfigSchema = require("../models/sellerConfig.model");
const cronJobSchedularSchema = require("../models/cronJobSchedular.model");
const permissionSchema = require("../models/superAdmin/permission.model");
const profileSchema = require("../models/profiles.model");
const ProfileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const googleconfigSchema = require("../models/googleconfig.model");
const campaignBidThresholdSchema = require("../models/campaignBidThreshold.model");
const camapignSettingSchema = require("../models/camapignSetting.model");
const loginHistorySchema = require("../models/superAdmin/loginHistory.model");
const pageSchema = require("../models/superAdmin/pages.model");
const organizationSchema = require("../models/organization.model");
const roleBasedPermissionSchema = require("../models/roleBasedPermission.model");
const synchronizeDetailsSchema = require("../models/synchronizeDetails.model");
const { ROLES } = require("../constants/roles");

const getAllowedSyncProfiles = async (groupId, type = "ads", recurring = true) => {
  const query = {
    groupId: groupId,
    type: type,
  };

  if (recurring) {
    query.requestStatus = "COMPLETED";
  }
  const syncRecords = await synchronizeDetailsSchema.find(query).lean();
  return syncRecords.map(record => ({
    profileId: Number(record.profileId),
    configId: String(record.configId)
  }))
};

const { write_logs } = require("../../winston/utility/logger");

const { getValidAccessToken } = require("../services/amazonAuth.service");

const getAccessToken = async (configId) => {
  if (!configId) return null;
  const accessToken = await getValidAccessToken({ kind: "ads", configId });
  const config = await configSchema.findById(configId).lean();
  if (!config) return null;

  return {
    ...config,
    adsAccessToken: accessToken,
    adsClientId: config.adsClientId || process.env.AMAZON_ADS_CLIENT_ID,
  };
};

const getSPAccessToken = async (configId, profileId) => {
  if (!configId || profileId === undefined || profileId === null) return null;
  const accessToken = await getValidAccessToken({ kind: "sp", configId, profileId });
  const sellerConfig = await sellerConfigSchema.findOne({ configId, profileId }).lean();
  if (!sellerConfig) return null;

  return {
    ...sellerConfig,
    spAccessToken: accessToken,
    spClientId: sellerConfig.spClientId || process.env.AMAZON_SP_CLIENT_ID || process.env.AMAZON_ADS_CLIENT_ID,
  };
};

const getASANAToken = async () => {
  return await asanaConfigSchema.findOne().lean();
};

const getProfile = async (configId, profileId) => {
  const cacheKey = `profile_${configId}_${profileId}`;
  const cached = await getCacheWithLog(cacheKey);
  if (cached) return safeJsonParse(cached);
  const checkAccount = await profileSchema.findOne({ configId: new ObjectId(configId), profileId }).lean();
  if (!checkAccount) {
    console.log("Please connect your account!");
    return null;
  }
  await setCacheWithLog(cacheKey, JSON.stringify(checkAccount));
  return checkAccount;
};

const getActivePlanProfiles = async (profileId, syncType, configId = null) => {
  profileId = profileId || "ALL";
  if (profileId !== "ALL" && !isNaN(profileId)) {
    profileId = Number(profileId);
  }
  const cacheKey = `activePlanProfiles_${profileId}_${syncType || "all"}_${configId || "all"}`;
  const cached = await getCacheWithLog(cacheKey);
  if (cached) return safeJsonParse(cached);

  let formattedConfigId = null;
  if (configId) {
    if (mongoose.Types.ObjectId.isValid(configId)) {
      formattedConfigId = new ObjectId(configId.toString());
    } else {
      formattedConfigId = configId;
    }
  }

  const matchFilter = {
    isActive: true,
    ...(profileId != "ALL" && { profileId }),
    ...(formattedConfigId && { configId: formattedConfigId }),
  };
  if (syncType === "ads") {
    matchFilter.isAdsSyncEnabled = true;
  } else if (syncType === "sp") {
    matchFilter.isSpSyncEnabled = true;
  }

  const pipeline = [
    {
      $match: matchFilter,
    },
    ...(syncType === "ads"
      ? [
          {
            $lookup: {
              from: "configs",
              localField: "configId",
              foreignField: "_id",
              as: "adsConfigDoc",
            },
          },
          { $unwind: "$adsConfigDoc" },
          { $match: { "adsConfigDoc.isActive": true } },
        ]
      : []),
    ...(syncType === "sp"
      ? [
          {
            $lookup: {
              from: "sellerconfigs",
              let: { configId: "$configId", profileId: "$profileId" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$configId", "$$configId"] },
                        { $eq: ["$profileId", "$$profileId"] },
                        { $eq: ["$isActive", true] },
                      ],
                    },
                  },
                },
              ],
              as: "spConfigDoc",
            },
          },
          { $unwind: "$spConfigDoc" },
        ]
      : []),
    {
      $lookup: {
        from: "profilebasedpermissions",
        localField: "profileId",
        foreignField: "profileId",
        as: "profileUsers",
      },
    },
    { $unwind: "$profileUsers" },
    {
      $lookup: {
        from: "users",
        localField: "profileUsers.userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $lookup: {
        from: "organizations",
        localField: "profileUsers.organizationId",
        foreignField: "_id",
        as: "organization",
      },
    },
    { $unwind: "$organization" },
    {
      $match: {
        "user.isActive": true,
        $or: [
          { "organization.endDate": null },
          { "organization.endDate": { $exists: false } },
          { "organization.endDate": { $gte: new Date() } },
        ],
      },
    },
    {
      $group: {
        _id: "$_id",
        profile: { $first: "$$ROOT" },
      },
    },
    {
      $replaceRoot: { newRoot: "$profile" },
    },
  ];

  const profiles = await profileSchema.aggregate(pipeline);
  await setCacheWithLog(cacheKey, JSON.stringify(profiles));
  return profiles;
};

const getOrganizationUserPagePermission = async (organizationId, id) => {
  try {
    const cacheKey = `orgPagePerm_OrgID-${organizationId}_UserID-${id}`;
    const cached = await getCacheWithLog(cacheKey);
    if (cached) {
      return safeJsonParse(cached);
    }

    const user = await userSchema.findById(id).populate("roleId").lean();
    const roleName = user?.roleName || user?.roleId?.roleName;
    let transformedData = null;
    let _id = user?._id;

    if (roleName === ROLES.SUPER_ADMIN) {
      const pages = await pageSchema.aggregate([
        { $match: { isActive: true } },
        { $sort: { order: 1 } },
        {
          $lookup: {
            from: "pageactions",
            localField: "_id",
            foreignField: "pageId",
            as: "actions",
          },
        },
      ]);

      transformedData = {
        userId: id,
        _id: _id,
        pages: pages.map((page) => ({
          pageName: page.pageName,
          allocatedActions: (page.actions || []).map((action) => ({ actionType: action.actionType, status: true })),
        })),
      };
    } else {
      const orgOwnerPopulate = {
        path: "planId",
        populate: [
          { path: "pages.pageId", select: "pageName pageSlug displayName order isActive" },
          { path: "pages.allocatedActions.actionId", select: "actionType" },
        ],
      }

      const org = organizationId ? await organizationSchema.findById(organizationId).populate(orgOwnerPopulate).lean() : null;

      if (org?.userId && id && org.userId.toString() === id.toString()) {
        transformedData = {
          userId: id,
          _id: org?._id,
          pages: (org?.planId?.pages || [])
            .filter((page) => page?.pageId && page?.pageId?.isActive !== false)
            .sort((a, b) => (a.pageId.order || 0) - (b.pageId.order || 0))
            .map((page) => ({
              pageName: page.pageId.pageName,
              allocatedActions: (page.allocatedActions || []).filter((action) => action?.actionId).map((action) => ({ actionType: action.actionId.actionType, status: action.status })),
            })),
        };
      } else {
        const orgUser = organizationId && id ? await roleBasedPermissionSchema.findOne({ userId: id, organizationId }).lean() : null;

        if (orgUser && orgUser.roleId) {
          const getUserPermission = await permissionSchema
            .findOne({ roleId: orgUser.roleId })
            .populate("pages.pageId", { pageName: 1, pageSlug: 1, displayName: 1, order: 1 })
            .populate("pages.allocatedActions.actionId", { actionType: 1 })
            .lean();

          if (!getUserPermission) {
            return {
              message: "Permission not assign to this user!",
              isSuccess: false,
            };
          }

          const planAllowedMap = new Map();
          if (org?.planId?.pages) {
            for (const p of org.planId.pages) {
              if (p?.pageId && p?.pageId?.isActive !== false) {
                const pageName = p.pageId.pageName;
                const actions = new Set();
                if (Array.isArray(p.allocatedActions)) {
                  for (const act of p.allocatedActions) {
                    if (act?.status && act?.actionId?.actionType) {
                      actions.add(act.actionId.actionType);
                    }
                  }
                }
                planAllowedMap.set(pageName, actions);
              }
            }
          }

          transformedData = {
            userId: getUserPermission.userId || id,
            _id: getUserPermission._id,
            pages: (getUserPermission.pages || [])
              .filter((page) => page?.pageId && planAllowedMap.has(page.pageId.pageName))
              .sort((a, b) => (a.pageId.order || 0) - (b.pageId.order || 0))
              .map((page) => {
                const planActions = planAllowedMap.get(page.pageId.pageName);
                return {
                  pageName: page.pageId.pageName,
                  allocatedActions: (page.allocatedActions || [])
                    .filter((action) => action?.actionId && planActions.has(action.actionId.actionType))
                    .map((action) => ({ actionType: action.actionId.actionType, status: action.status })),
                };
              }),
          };
        } else {
          return {
            message: "You are not a member of organization",
            isSuccess: false,
          };
        }
      }
    }

    const finalResult = {
      isSuccess: true,
      data: transformedData
    };

    await setCacheWithLog(cacheKey, JSON.stringify(finalResult));
    return finalResult;
  } catch (error) {
    return {
      isSuccess: false,
      message: error.message || "An error occurred",
    };
  }
};

const checkPermission = async (userId, pageName, actionType, status, organizationId = null) => {
  try {
    const result = await getOrganizationUserPagePermission(organizationId, userId);

    if (!result.isSuccess) {
      return {
        isSuccess: false,
        message: result.message,
        hasPermission: false,
      };
    }

    const transformedData = result.data;
    if (!transformedData || !transformedData.pages) {
      return {
        isSuccess: false,
        message: "Permission not found for this user.",
        hasPermission: false,
      };
    }

    const matchingPage = transformedData.pages.find(
      (page) => page.pageName === pageName
    );
    if (!matchingPage) {
      return {
        isSuccess: false,
        message: `Permission not granted for the '${pageName}' page.`,
        hasPermission: false,
      };
    }
    const matchingAction = matchingPage.allocatedActions.find(
      (action) => action.actionType === actionType && action.status === status
    );
    if (!matchingAction) {
      return {
        isSuccess: false,
        message: `Permission not granted for the '${actionType}' action on the '${pageName}' page.`,
        hasPermission: false,
      };
    }
    return {
      isSuccess: true,
      message: "Permission granted.",
      hasPermission: true,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: "Something went wrong while checking permission.",
      error: "An internal server error occurred",
      hasPermission: false,
    };
  }
};

const getGoogleConfig = async (profileId) => {
  const userList = await ProfileBasedPermissionSchema.find({ profileId: Number(profileId), hasAccess: true }, { userId: 1 }).lean();
  const users = userList.map(item => item?.userId)

  const checkConfig = await googleconfigSchema.find({ userId: { $in: users } }).lean();
  if (!checkConfig?.length) {
    return console.log("Please required access token!");
  }

  return checkConfig;
};

const spProfileConfig = async () => {
  const users = await profileSchema.distinct("configId");
  return users;
};

// Helper function to build field filters
function buildFieldFilter(fieldName, operator, value) {
  const operatorMap = {
    "GREATER_THAN": "$gt",
    "GREATER_THAN_OR_EQUAL_TO": "$gte",
    "LESS_THAN": "$lt",
    "LESS_THAN_OR_EQUAL_TO": "$lte",
    "EQUAL_TO": "$eq"
  };

  const mongoOperator = operatorMap[operator] ?? Object.values(operatorMap).includes(operator) ? operator : null;
  if (!mongoOperator) return {};

  return {
    [fieldName]: { [mongoOperator]: value }
  };
};

const getTartetingtype = (keywordType, targeting) => {
  let type = "Automatic campaign";
  if (keywordType == "TARGETING_EXPRESSION_PREDEFINED") {
    type = `Automatic - ${targeting.toLowerCase()}`;
  }
  else if (keywordType == "EXACT") {
    type = `Keyword - ${keywordType.toLowerCase()}`;
  }
  else if (keywordType == "TARGETING_EXPRESSION") {
    if (targeting.includes('group=')) {
      type = `Keyword - group`;
    }
    else if (targeting.includes('expanded=')) {
      type = `Product target - Expanded`;
    }
    else {
      type = `Product target - exact`;
    }
  }
  return type;
}

// Format in local time
const formatUTC = (date) => {
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getUTCDate()).padStart(2, "0") +
    "T" +
    String(date.getUTCHours()).padStart(2, "0") +
    ":" +
    String(date.getUTCMinutes()).padStart(2, "0") +
    ":" +
    String(date.getUTCSeconds()).padStart(2, "0") +
    "Z"
  );
}

const getMonthRange = (year, month) => {
  let firstDate = new Date(year, month, 1, 0, 0, 0);
  let now = new Date();
  let lastDate = new Date(now.getTime() - (2 * 60 * 1000)) //2 min before current date

  return {
    startDate: formatUTC(firstDate),
    endDate: formatUTC(lastDate),
  };
}

const getLast2DaysRange = (timezone = "Asia/Kolkata") => {
  const now = moment().tz(timezone);
  const endDate = now.clone().subtract(2, "minutes");
  const startDate = endDate.clone().subtract(2, "days");

  return {
    startDate: startDate.format("YYYY-MM-DD"),
    endDate: endDate.format("YYYY-MM-DD")
  };
};

const getLast7DaysRange = (timezone = "Asia/Kolkata") => {
  const now = moment().tz(timezone);
  const endDate = now.clone().subtract(2, "minutes");
  const startDate = endDate.clone().subtract(7, "days");

  return {
    startAt: startDate.toISOString(),
    startDate: startDate.format("YYYY-MM-DD"),
    endDate: endDate.format("YYYY-MM-DD")
  };
};

const wait = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getNextTime(times, afterTime) {
  times.sort(); // Ensure the times are sorted in ascending order
  let index = times.findIndex((time) => time > afterTime);
  const nextTime = index !== -1 ? times[index] : "-";
  index = index == -1 ? times.length : index;
  return { index, nextTime };
}

const getRuleDate = (timezone, dateFilter, yearToDate) => {

  let fromDate = moment().tz(timezone).format("YYYY-MM-DD");
  let toDate = moment().tz(timezone).format("YYYY-MM-DD");

  switch (dateFilter) {
    case "YESTERDAY":
      fromDate = moment().tz(timezone).subtract(1, "day").format('YYYY-MM-DD');
      toDate = moment().tz(timezone).format('YYYY-MM-DD');
      break;

    case "LAST_7_DAYS":
      fromDate = moment().tz(timezone).subtract(7, "day").format('YYYY-MM-DD');
      toDate = moment().tz(timezone).format('YYYY-MM-DD');
      break;

    case "LAST_7_DAYS_1":
      fromDate = moment().tz(timezone).subtract(8, "day").format('YYYY-MM-DD');
      toDate = moment().tz(timezone).subtract(1, "day").format('YYYY-MM-DD');
      break;

    case "THIS_WEEK":
      fromDate = moment().tz(timezone).startOf('week').add(1, 'day').format('YYYY-MM-DD');
      toDate = moment().tz(timezone).endOf('week').add(1, 'day').format('YYYY-MM-DD');
      break;

    case "LAST_WEEK":
      fromDate = moment().tz(timezone).startOf('week').add(1, 'day').subtract(7, 'days').format('YYYY-MM-DD');
      toDate = moment().tz(timezone).endOf('week').add(1, 'day').subtract(7, 'days').format('YYYY-MM-DD');
      break;

    case "LAST_30_DAYS":
      fromDate = moment().tz(timezone).subtract(30, "days").startOf("day").format("YYYY-MM-DD");
      toDate = moment().tz(timezone).endOf("day").format("YYYY-MM-DD");
      break;

    case "THIS_MONTH":
      fromDate = moment().tz(timezone).startOf("month").format("YYYY-MM-DD");
      toDate = moment().tz(timezone).endOf("month").format("YYYY-MM-DD");
      break;

    case "LAST_MONTH":
      fromDate = moment().tz(timezone).subtract(1, "month").startOf("month").format("YYYY-MM-DD");
      toDate = moment().tz(timezone).subtract(1, "month").endOf("month").format("YYYY-MM-DD");
      break;

    case "LAST_60_DAYS":
      fromDate = moment().tz(timezone).subtract(60, "days").format("YYYY-MM-DD");
      toDate = moment().tz(timezone).format("YYYY-MM-DD");
      break;


    case "LAST_65_DAYS":
      fromDate = moment().tz(timezone).subtract(65, "days").startOf("day").format("YYYY-MM-DD");
      toDate = moment().tz(timezone).endOf("day").format("YYYY-MM-DD");
      break;

    case "YEAR_TO_DATE":
      fromDate = moment().tz(timezone).startOf("year").format("YYYY-MM-DD");
      toDate = yearToDate;
      break;

    default:
      break;

  }

  return { fromDate, toDate }
}

const safeJSON = (val) => {
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

const getCronNextSchedule = (cron, timezone) => {

  const now = moment().tz("UTC");
  const format = "YYYY-MM-DD hh:mm:ss A"

  if (cron.frequency == "Daily") {
    for (let i = 0; i < cron.times.length; i++) {
      const time = cron.times[i];

      const scheduleDateTime = moment(
        now.format("YYYY-MM-DD") + " " + time,
        format
      );

      if (scheduleDateTime.isAfter(now)) {
        return scheduleDateTime;
      }
    }

    const tomorrow = now.clone().add(1, "day");

    const scheduleDateTime = moment(
      tomorrow.format("YYYY-MM-DD") + " " + cron.times[0],
      format
    );

    return scheduleDateTime;
  }
  else if (cron.frequency == "Weekly") {
    const dayMap = {
      "Sunday": 0,
      "Monday": 1,
      "Tuesday": 2,
      "Wednesday": 3,
      "Thursday": 4,
      "Friday": 5,
      "Saturday": 6
    };
    const weekdayNumbers = cron.days.map(d => dayMap[d]);

    weekdayNumbers.sort((a, b) => a - b);

    const sortedTimes = cron.times.sort((a, b) =>
      moment(a, "hh:mm A") - moment(b, "hh:mm A")
    );

    let candidates = [];
    for (let i = 0; i < weekdayNumbers.length; i++) {
      const weekday = weekdayNumbers[i];

      let baseDate = moment().weekday(weekday);

      if (baseDate.isBefore(now, "day")) {
        baseDate = baseDate.add(1, "week");
      }

      for (let j = 0; j < sortedTimes.length; j++) {
        const time = sortedTimes[j];

        const dateTime = moment(
          baseDate.format("YYYY-MM-DD") + " " + time,
          format
        );

        if (dateTime.isAfter(now)) {
          candidates.push(dateTime);
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a - b);
      return candidates[0];
    }

    const nextWeekDate = now.clone().add(1, "week").weekday(weekdayNumbers[0]);

    const scheduleDateTime = moment(
      nextWeekDate.format("YYYY-MM-DD") + " " + sortedTimes[0],
      format
    );

    return scheduleDateTime;
  }
  else if (cron.frequency == "Monthly") {
    for (let i = 0; i < cron.dates.length; i++) {
      const date = cron.dates[i];

      let scheduleDate = moment({
        year: now.year(),
        month: now.month(),
        date: date
      });

      if (scheduleDate.isBefore(now, "day")) continue;

      for (let j = 0; j < cron.times.length; j++) {
        let time = cron.times[j];

        let scheduleDateTime = moment(
          scheduleDate.format("YYYY-MM-DD") + " " + time,
          format
        );

        if (scheduleDateTime.isAfter(now)) {
          return scheduleDateTime;
        }
      }
    }

    const firstDateNextMonth = moment({
      year: now.month() == 11 ? now.year() + 1 : now.year(),
      month: now.month() + 1,
      date: cron.dates[0]
    });

    const scheduleDateTime = moment(
      firstDateNextMonth.format("YYYY-MM-DD") + " " + cron.times[0],
      format
    );

    return scheduleDateTime;

  }
  else if (cron.frequency == "Every_X_Seconds") {
    const currentSec = now.seconds();

    let startInterval = 0;
    while (startInterval <= currentSec) {
      startInterval += cron.interval;
    }

    const scheduleDateTime = now.clone().seconds(startInterval).milliseconds(0);
    return scheduleDateTime;
  }
  else if (cron.frequency == "Every_X_Minutes") {
    const currentMin = now.minute();

    let nextMin = 0;
    while (nextMin <= currentMin) {
      nextMin += cron.interval;
    }

    const scheduleDateTime = now.clone().minute(nextMin).second(0).millisecond(0);
    return scheduleDateTime;
  }
  else if (cron.frequency == "Every_X_Hours") {
    const currentHour = now.hour();

    let nextHour = 0;

    while (nextHour <= currentHour) {
      nextHour += cron.interval;
    }

    const scheduleDateTime = now.clone()
      .hour(nextHour)
      .minute(0)
      .second(0)
      .millisecond(0);

    return scheduleDateTime;
  }
  else if (cron.frequency == "Every_Hour_At_Minute") {

    const hr = cron.hours[0];

    for (let h = 0; h < 24; h += hr) {
      let candidate = now.clone()
        .hour(h)
        .minute(cron.minutes)
        .second(0)
        .millisecond(0);

      if (candidate.isAfter(now)) {
        return candidate;
      }
    }

    let tomorrowCandidate = now.clone()
      .add(1, "day")
      .hour(0)
      .minute(cron.minutes)
      .second(0)
      .millisecond(0);

    return tomorrowCandidate;
  }
  else if (cron.frequency == "X_Hours_at_X_Minute") {
    cron.hours.sort((a, b) => a - b);

    for (let i = 0; i < cron.hours.length; i++) {
      const h = cron.hours[i];

      let scheduleDateTime = now.clone()
        .hour(h)
        .minute(cron.minutes)
        .second(0)
        .millisecond(0);

      if (scheduleDateTime.isAfter(now)) {
        return scheduleDateTime;
      }
    }

    const tomorrow = now.clone().add(1, "day");

    const nextSchedule = moment(tomorrow.format("YYYY-MM-DD") + ` ${cron.hours[0]}:${cron.minutes}`, format)
      .second(0)
      .millisecond(0);

    return nextSchedule;
  }
}

const { Transform, PassThrough } = require("stream");
const { parse: csvParseStream } = require("csv-parse");
const { chain } = require("stream-chain");
const { parser: streamJsonParser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");
const { streamValues } = require("stream-json/streamers/StreamValues");

class AutoDecompressTransform extends Transform {
  constructor(options) {
    super(options);
    this.initialized = false;
    this.decompressor = null;
  }

  _transform(chunk, encoding, callback) {
    if (!this.initialized) {
      this.initialized = true;
      if (chunk.length >= 2 && chunk[0] === 0x1f && chunk[1] === 0x8b) {
        this.decompressor = zlib.createGunzip();
      } else if (chunk.length >= 2 && chunk[0] === 0x78 && (chunk[1] === 0x01 || chunk[1] === 0x9c || chunk[1] === 0xda)) {
        this.decompressor = zlib.createInflate();
      }

      if (this.decompressor) {
        this.decompressor.on("data", (data) => this.push(data));
        this.decompressor.on("error", (err) => this.emit("error", err));
      }
    }

    if (this.decompressor) {
      this.decompressor.write(chunk, encoding, callback);
    } else {
      this.push(chunk);
      callback();
    }
  }

  _flush(callback) {
    if (this.decompressor) {
      this.decompressor.end(callback);
    } else {
      callback();
    }
  }
}

async function downloadReport(url, compressionAlgorithm = null, onRow = null) {
  try {
    const response = await axios.get(url, { responseType: "stream" });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to download report: ${response.status}`);
    }

    const decompressedStream = response.data.pipe(new AutoDecompressTransform());

    return new Promise((resolve, reject) => {
      let accumulated = "";

      const onData = async (chunk) => {
        accumulated += chunk.toString("utf8");
        const trimmed = accumulated.trim();
        if (trimmed.length > 0) {
          decompressedStream.removeListener("data", onData);
          decompressedStream.removeListener("error", onError);
          decompressedStream.removeListener("end", onEnd);

          const format = detectFormat(trimmed);

          const combinedStream = new PassThrough();
          combinedStream.write(accumulated);
          decompressedStream.pipe(combinedStream);
          decompressedStream.resume();

          try {
            let parsed;
            if (format === "json") {
              const isArray = trimmed.startsWith("[");
              parsed = await streamJson(combinedStream, isArray, onRow);
            } else if (format === "tsv" || format === "csv") {
              parsed = await streamCsv(combinedStream, format === "tsv", onRow);
            } else if (format === "xml") {
              parsed = await streamXml(combinedStream);
            } else {
              parsed = await streamText(combinedStream);
            }
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        }
      };

      const onError = (err) => {
        reject(err);
      };

      const onEnd = async () => {
        const trimmed = accumulated.trim();
        const format = detectFormat(trimmed);
        try {
          let parsed;
          if (format === "json") {
            parsed = toJSON(accumulated);
          } else if (format === "tsv" || format === "csv") {
            parsed = csvToJson(accumulated);
          } else if (format === "xml") {
            parsed = await xmlToJson(accumulated);
          } else {
            parsed = accumulated;
          }
          if (onRow && Array.isArray(parsed)) {
            parsed.forEach(row => onRow(row));
            resolve(null);
          } else {
            resolve(parsed);
          }
        } catch (err) {
          reject(err);
        }
      };

      decompressedStream.on("data", onData);
      decompressedStream.on("error", onError);
      decompressedStream.on("end", onEnd);
    });
  } catch (err) {
    throw new Error(`Error processing report: ${err.message}`);
  }
}

const streamJson = (decompressedStream, isArray, onRow = null) => {
  return new Promise((resolve, reject) => {
    const results = [];
    let parsedObject = null;

    const pipeline = chain([
      decompressedStream,
      streamJsonParser(),
      isArray ? streamArray() : streamValues()
    ]);

    pipeline.on("data", (data) => {
      if (onRow) {
        onRow(data.value);
      } else {
        if (isArray) {
          results.push(data.value);
        } else {
          parsedObject = data.value;
        }
      }
    });

    pipeline.on("end", () => {
      resolve(onRow ? null : (isArray ? results : parsedObject));
    });

    pipeline.on("error", reject);
  });
};

const streamCsv = (decompressedStream, isTsv, onRow = null) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const parser = csvParseStream({
      delimiter: isTsv ? "\t" : ",",
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      escape: '\\',
    });

    decompressedStream
      .pipe(parser)
      .on("data", (data) => {
        if (onRow) {
          onRow(data);
        } else {
          results.push(data);
        }
      })
      .on("end", () => {
        resolve(onRow ? null : results);
      })
      .on("error", reject);
  });
};

const streamXml = (decompressedStream) => {
  return new Promise((resolve, reject) => {
    let xmlData = "";
    decompressedStream.on("data", (chunk) => {
      xmlData += chunk;
    });
    decompressedStream.on("end", async () => {
      try {
        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(xmlData);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    decompressedStream.on("error", reject);
  });
};

const streamText = (decompressedStream) => {
  return new Promise((resolve, reject) => {
    let data = "";
    decompressedStream.on("data", (chunk) => {
      data += chunk;
    });
    decompressedStream.on("end", () => {
      resolve(data);
    });
    decompressedStream.on("error", reject);
  });
};


function tryDecompress(buffer) {
  try {
    // Try gunzip first
    return zlib.gunzipSync(buffer).toString("utf8");
  } catch (e1) {
    try {
      // Try inflate if gzip header is missing
      return zlib.inflateSync(buffer).toString("utf8");
    } catch (e2) {
      // Fallback: assume buffer was not compressed
      return buffer.toString("utf8");
    }
  }
}

async function convertReportString(str) {
  const type = detectFormat(str);

  switch (type) {
    case "json":
      return toJSON(str);

    case "xml":
      return await xmlToJson(str);

    case "tsv":
    case "csv":
      return csvToJson(str);

    default:
      return str; // raw text
  }
}

function detectFormat(str) {
  if (str.trim().startsWith("{") || str.trim().startsWith("[")) return "json";
  if (str.trim().startsWith("<?xml")) return "xml";
  if (str.includes("\t")) return "tsv";
  if (str.includes(",")) return "csv";
  return "text";
}

function toJSON(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

async function xmlToJson(str) {
  const parser = new xml2js.Parser({ explicitArray: false });
  return await parser.parseStringPromise(str);
}

function csvToJson(str) {
  return parse(str, {
    delimiter: str.includes("\t") ? "\t" : ",",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    escape: '\\',
  });
}

const getActiveSlot = (slots, nowHour) => {
  // Handle simple 24-hour number array (Dayparting Strategy)
  if (Array.isArray(slots) && typeof slots[nowHour] === 'number') {
    return {
      multiplier: slots[nowHour],
      slotIndex: nowHour,
      startTime: String(nowHour).padStart(2, '0') + ':00',
      endTime: String(nowHour === 23 ? 0 : nowHour + 1).padStart(2, '0') + ':00'
    };
  }

  // Handle legacy complex slot objects
  return slots.find(slot => {
    if (!slot.enabled) return false;

    const start = Number(slot.startTime.split(":")[0]);
    const end = Number(slot.endTime.split(":")[0]);

    return nowHour >= start && nowHour < end;
  });
};

const getBidThreshold = async (configId, profileId, campaignId) => {
  let bidThreshold = await campaignBidThresholdSchema.findOne({
    configId,
    profileId,
    campaignId
  }).lean();
  if (!bidThreshold) {
    bidThreshold = {
      configId,
      profileId,
      campaignId,
      maxBid: 50,
      minBid: 1,
      targetACOS: 30,
    }
  }
  return bidThreshold;
}

const getDatesBetween = (startDate, endDate) => {
  const dates = [];
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]); // YYYY-MM-DD
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

const parallelBulkWrite = async (model, ops, BULK_BATCH = Number(process.env.BATCH) || 1000) => {
  if (!ops || ops.length === 0) return { insertedCount: 0, modifiedCount: 0, upsertedCount: 0 };

  const chunks = [];
  while (ops.length) {
    chunks.push(ops.splice(0, BULK_BATCH));
  }

  const CONCURRENCY = 5;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const chunkGroup = chunks.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunkGroup.map(async (chunk) => {
        try {
          return await model.bulkWrite(chunk, { ordered: false });
        } catch (err) {
          const modelName = model?.modelName || model?.collection?.collectionName || 'UnknownModel';

          // Extract specific write errors from MongoBulkWriteError
          const writeErrors = err.writeErrors || [];
          const nonDuplicateErrors = writeErrors.filter(e => e.code !== 11000);

          if (nonDuplicateErrors.length > 0 || (writeErrors.length === 0 && err.code !== 11000)) {
            // Detailed diagnostic logging for non-duplicate errors (e.g. code 121 validation, type mismatch, disk/network)
            const errorDetails = nonDuplicateErrors.slice(0, 5).map(e => ({
              code: e.code,
              message: e.errmsg || e.message,
              opFilter: e.op?.filter || e.op?.q || (e.op?.insertOne ? e.op.document?._id : undefined)
            }));

            write_logs({
              message: `[BulkWrite Error] ${modelName} failed with ${nonDuplicateErrors.length} write errors. Sample errors: ${JSON.stringify(errorDetails)}. Underlying: ${err.message}`,
              log_type: "error"
            });

            // STRICT: Propagate failure so report importer knows writes failed!
            throw err;
          }

          // If every write error is strictly a duplicate key (11000), log warning and continue
          if (writeErrors.length > 0 && nonDuplicateErrors.length === 0) {
            write_logs({
              message: `[BulkWrite DuplicateKey Notice] ${modelName} encountered ${writeErrors.length} duplicate keys (E11000) during unordered bulk write. Skipping duplicates.`,
              log_type: "warn"
            });
            return err.result;
          }

          // Any other error (network down, pool exhausted, authentication, validation) must throw!
          write_logs({
            message: `[BulkWrite Critical Failure] ${modelName} failed: ${err.message}`,
            log_type: "error"
          });
          throw err;
        }
      })
    );
  }
};


const parseStrictMetric = (rawValue, fieldName, context = "") => {
  if (rawValue === undefined || rawValue === null) {
    throw new Error(`[Validation Failure] Missing required metric '${fieldName}' in ${context}`);
  }

  if (typeof rawValue === 'boolean' || typeof rawValue === 'object') {
    throw new Error(`[Validation Failure] Disallowed type '${typeof rawValue}' for metric '${fieldName}' in ${context}`);
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed === '') {
      throw new Error(`[Validation Failure] Blank string for metric '${fieldName}' in ${context}`);
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      throw new Error(`[Validation Failure] Non-numeric string '${rawValue}' for '${fieldName}' in ${context}`);
    }
    return num;
  }

  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue)) {
      throw new Error(`[Validation Failure] Non-finite number '${rawValue}' for '${fieldName}' in ${context}`);
    }
    return rawValue;
  }

  throw new Error(`[Validation Failure] Unsupported type for metric '${fieldName}' in ${context}`);
};

const calcMetrics = ({ impressions = 0, clicks = 0, spend = 0, sales = 0, orders = 0 }) => {
  const safe = (n) => (Number(n) || 0);

  impressions = safe(impressions);
  clicks = safe(clicks);
  spend = safe(spend);
  sales = safe(sales);
  orders = safe(orders);

  return {
    acos: sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0,
    roas: spend > 0 ? Number((sales / spend).toFixed(2)) : 0,
    cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
    cvr: clicks > 0 ? Number(((orders / clicks) * 100).toFixed(2)) : 0,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
  };
}

const downloadFile = async (url, outputPath) => {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(outputPath, () => { });
        return reject(
          new Error(`Download failed. Status: ${response.statusCode}`)
        );
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close(resolve);
      });

      file.on("error", (err) => {
        file.close();
        fs.unlink(outputPath, () => { });
        reject(err);
      });

      response.on("error", (err) => {
        file.close();
        fs.unlink(outputPath, () => { });
        reject(err);
      });
    }).on("error", (err) => {
      file.close();
      fs.unlink(outputPath, () => { });
      reject(err);
    });
  });
};

const unzipReport = (zipFilePath, extractionPath) => {
  return new Promise((resolve, reject) => {
    let fileHeader = Buffer.alloc(2);
    try {
      if (fs.existsSync(zipFilePath)) {
        const fd = fs.openSync(zipFilePath, "r");
        fs.readSync(fd, fileHeader, 0, 2, 0);
        fs.closeSync(fd);
      }
    } catch (_) { }

    const isGzip = fileHeader[0] === 0x1f && fileHeader[1] === 0x8b;

    if (!isGzip) {
      try {
        fs.copyFileSync(zipFilePath, extractionPath);
        return resolve();
      } catch (err) {
        return reject(err);
      }
    }

    const gunzip = zlib.createGunzip();
    gunzip.on("error", (err) => {
      try {
        fs.copyFileSync(zipFilePath, extractionPath);
        resolve();
      } catch (_) {
        reject(err);
      }
    });

    fs.createReadStream(zipFilePath)
      .pipe(gunzip)
      .pipe(fs.createWriteStream(extractionPath))
      .on("finish", resolve)
      .on("error", (err) => {
        try {
          fs.copyFileSync(zipFilePath, extractionPath);
          resolve();
        } catch (_) {
          reject(err);
        }
      });
  });
};

const getAxiosErrorMessage = (err) => {
  if (!err) return "";
  if (err.response?.data) {
    const data = err.response.data;
    if (typeof data === "string") return data;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      return data.errors.map(e => `${e.code || ""}: ${e.message || ""}`).join(" | ");
    }
    if (data.message) return data.message;
    if (data.details) return data.details;
    if (data.error_description) return data.error_description;
    return JSON.stringify(data);
  }
  return err.message || String(err);
};

const validateReportFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return { isValid: false, reason: "File does not exist" };
  }
  try {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return { isValid: false, reason: "File is empty (0 bytes)" };
    }

    let fd = null;
    try {
      fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(100);
      const bytesRead = fs.readSync(fd, buffer, 0, 100, 0);
      fs.closeSync(fd);
      fd = null;

      const sample = buffer.toString("utf8", 0, bytesRead).trim();
      if (!sample.startsWith("[") && !sample.startsWith("{")) {
        return { isValid: false, reason: `File is not a valid JSON. Content starts with: ${sample.slice(0, 30)}` };
      }
    } catch (err) {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch (_) {}
      }
      return { isValid: false, reason: `Failed to read file: ${err.message}` };
    }
  } catch (err) {
    return { isValid: false, reason: `Failed to get stat: ${err.message}` };
  }

  return { isValid: true };
};

const convertXMLToJSON = (xmlFilePath, jsonFilePath) => {
  return new Promise((resolve, reject) => {
    let xmlData = "";
    fs.createReadStream(xmlFilePath, { encoding: "utf8" })
      .on("data", (chunk) => { xmlData += chunk })
      .on("end", async () => {
        try {
          const parser = new xml2js.Parser({ explicitArray: false });
          const jsonData = await parser.parseStringPromise(xmlData);
          fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), (err) => {
            if (err) return reject(err);
            resolve(jsonData);
          });
        } catch (error) {
          reject(error);
        }
      })
      .on("error", reject);
  });
};

const removeCampaignIdFromQuery = (query) => {
  try {
    const parsed = JSON.parse(query);
    if (parsed && typeof parsed === "object") delete parsed?.campaignId;
    return JSON.stringify(parsed);
  } catch (error) {
    return query;
  }
};

const generateUnique = (num = 25) => {
  return crypto.randomBytes(19).toString("base64url").slice(0, num);
}

const generatePassword = (length = 16) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_[]{}<>?";

  const randomBytes = crypto.randomBytes(length);
  let password = "";

  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }

  return password;
}

const generateAuthToken = async (userId, ip_address, location, timeZone) => {
  const user = await userSchema.findOne({ _id: userId }).lean();

  const authToken = jwt.sign(
    { user_id: user._id, email: user?.email, roleId: user.roleId },
    process.env.CUSTOMER_TOKEN_KEY,
    { expiresIn: process.env.TOKEN_EXPIRE_TIME }
  );

  const loginHistory = new loginHistorySchema({
    userId: userId,
    ipAddress: ip_address ? ip_address : "",
    location: location ? location : "",
    timezone: timeZone,
  });
  await loginHistory.save();

  return { authToken };
}

const isValidASIN = (str) => typeof str === "string" && `${str}`.trim().length === 10 && /^b/i.test(str)

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const autoAssignCampaignToAllRuleTypes = async ({
  models, // [BudgetRule, TargetingRule, PlacementRule]
  configId,
  profileId,
  campaignId,
  adType // SP | SB | SD
}) => {
  try {
    if (!models?.length || !campaignId || !adType) return;

    for (const Model of models) {
      // 1. Fetch active rules
      const rules = await Model.find({ configId, profileId, isActive: true }).lean();
      if (!rules.length) continue;

      const bulkOps = [];
      for (const rule of rules) {
        const existingIds = rule.campaignIds?.[adType] || [];

        // Skip duplicate
        if (existingIds.includes(campaignId)) continue;

        const updatedCampaignIds = [...existingIds, campaignId];

        // 2. Parse Query
        let parsedQuery = {};
        try {
          parsedQuery = rule.query?.[adType] ? JSON.parse(rule.query[adType]) : {};
        } catch (e) {
          parsedQuery = {};
        }

        if (!parsedQuery || typeof parsedQuery !== "object") parsedQuery = {};

        // 3. Only update campaignId filter
        parsedQuery.campaignId = { $in: updatedCampaignIds };

        bulkOps.push({
          updateOne: {
            filter: { _id: rule._id },
            update: { $addToSet: { [`campaignIds.${adType}`]: campaignId }, $set: { [`query.${adType}`]: JSON.stringify(parsedQuery) } }
          }
        });
      }

      // 4. Execute bulk
      if (bulkOps.length) await parallelBulkWrite(Model, bulkOps);
    }

  } catch (error) {
    write_logs({
      message: `Universal Rule Assign Error: ${error}`,
      log_type: "error",
    });
  }
};

const getRuleSettings = async (configId, profileId, key) => {
  const data = await camapignSettingSchema.findOne(
    { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) },
    { budgetRuleSetting: 1, placementRuleSetting: 1, targetingRuleSetting: 1, _id: 0 }
  ).lean();

  const result = data || {
    budgetRuleSetting: { minBudget: 0, maxBudget: 50 },
    placementRuleSetting: { minBid: 0, maxBid: 1 },
    targetingRuleSetting: { minBid: 0, maxBid: 1 },
  }

  return result?.[key];
}

const MARKETPLACE_MIN_BIDS = {
  INR: 1.00,
  USD: 0.02,
  CAD: 0.02,
  GBP: 0.02,
  EUR: 0.02,
  JPY: 2.00,
  AUD: 0.10,
  MXN: 0.10,
  BRL: 0.07,
  AED: 0.24,
  SAR: 0.24,
  SGD: 0.02,
  TRY: 0.50,
  SEK: 0.20,
  PLN: 0.10,
  EGP: 0.24,
};

const COUNTRY_MIN_BIDS = {
  IN: 1.00,
  US: 0.02,
  CA: 0.02,
  UK: 0.02,
  GB: 0.02,
  DE: 0.02,
  FR: 0.02,
  IT: 0.02,
  ES: 0.02,
  NL: 0.02,
  JP: 2.00,
  AU: 0.10,
  MX: 0.10,
  BR: 0.07,
  AE: 0.24,
  SA: 0.24,
  SG: 0.02,
  TR: 0.50,
  SE: 0.20,
  PL: 0.10,
  EG: 0.24,
};

const getMarketplaceMinBid = (currencyCode, countryCode) => {
  if (currencyCode && typeof currencyCode === "string") {
    const upperCurr = currencyCode.trim().toUpperCase();
    if (MARKETPLACE_MIN_BIDS[upperCurr] !== undefined) {
      return MARKETPLACE_MIN_BIDS[upperCurr];
    }
  }
  if (countryCode && typeof countryCode === "string") {
    const upperCountry = countryCode.trim().toUpperCase();
    if (COUNTRY_MIN_BIDS[upperCountry] !== undefined) {
      return COUNTRY_MIN_BIDS[upperCountry];
    }
  }
  return 0.02;
};

const applyMinMax = (value, min, max) => {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
};

const generateDateRange = (startDate, endDate, timezone) => {
  const dates = [];
  const start = moment.tz(startDate, "YYYY-MM-DD", timezone);
  const end = moment.tz(endDate, "YYYY-MM-DD", timezone);

  while (start.isSameOrBefore(end, "day")) {
    dates.push(start.format("YYYY-MM-DD"));
    start.add(1, "day");
  }

  return dates;
}

const encryptData = (text) => {
  if (!text) return text;
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "12345678901234567890123456789012";
  const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
  const IV_LENGTH = 16;
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

const decryptData = (text) => {
  if (!text) return text;
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "12345678901234567890123456789012";
  const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
  let textParts = text.split(":");
  if (textParts.length !== 2) return text;
  let iv = Buffer.from(textParts.shift(), "hex");
  let encryptedText = Buffer.from(textParts.join(":"), "hex");
  let decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

module.exports = {
  encryptData,
  decryptData,
  clearAccessTokenCache,
  clearSPAccessTokenCache,
  clearProfileCache,
  clearActivePlanProfilesCache,
  getAccessToken,
  getSPAccessToken,
  getASANAToken,
  getProfile,
  getActivePlanProfiles,
  getGoogleConfig,
  spProfileConfig,
  buildFieldFilter,
  getTartetingtype,
  getMonthRange,
  getLast2DaysRange,
  getLast7DaysRange,
  wait,
  getNextTime,
  getRuleDate,
  safeJSON,
  safeJsonParse,
  getCronNextSchedule,
  downloadReport,
  getActiveSlot,
  getBidThreshold,
  getDatesBetween,
  parallelBulkWrite,
  calcMetrics,
  parseStrictMetric,
  downloadFile,
  unzipReport,
  validateReportFile,
  convertXMLToJSON,
  removeCampaignIdFromQuery,
  generateUnique,
  generatePassword,
  generateAuthToken,
  isValidASIN,
  generateOtp,
  autoAssignCampaignToAllRuleTypes,
  getRuleSettings,
  getMarketplaceMinBid,
  applyMinMax,
  generateDateRange,
  getOrganizationUserPagePermission,
  checkPermission,
  clearOrgPagePermissionCache,
  getAllowedSyncProfiles,
  getAxiosErrorMessage,
};
