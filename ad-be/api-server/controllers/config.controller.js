const moment = require("moment-timezone");
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));

const tempStateConfigSchema = require("../models/tempStateConfig.model");
const userSchema = require("../models/user.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const cronJobSchema = require("../models/cronJob.model");
const cronJobSchedularSchema = require("../models/cronJobSchedular.model");
const configSchema = require("../models/config.model");
const sellerConfigSchema = require("../models/sellerConfig.model");
const configHistorySchema = require("../models/configHistory.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const profileSchema = require("../models/profiles.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const adNotificationSettingSchema = require("../models/adNotificationSetting.model");
const defaultTargetAcosSchema = require("../models/defaultTargetAcos.model");
const averageAOVSchema = require("../models/averageAOV.model");
const camapignSettingSchema = require("../models/camapignSetting.model");
const limitedCPCSchema = require("../models/limitedCPC.model");
const newProfileSyncSchema = require("../models/newProfileSync.model");
const amsSubscriptionSchema = require("../models/amsSubscription.model");
const auditLogSchema = require("../models/auditLog.model");
const organizationSchema = require("../models/organization.model");
const reportDetailsSchema = require("../models/reportDetails.model");
const synchronizeDetailsSchema = require("../models/synchronizeDetails.model");
const retentionSchema = require("../models/retention.model");
const coreGroupSchema = require("../models/coreGroup.model");
const CRON_JOBS = require("../../worker-service/cronJobs.enum");

const { cronListProductAdsFromAmazon, cronGenerateAdProductReport, cronListProductFromAmazon } = require("./productAds.controller");
const { cronListAdGroupsFromAmazon, cronGenerateAdGroupReport } = require("./adGroups.controller");
const { cronListCampaignsFromAmazon, cronGenerateCampaignReport } = require("./campaign.controller");
const { cronListKeywordsFromAmazon, cronGenerateKeywordReport } = require('./keyword.controller');
const { cronGeneratePlacementReport } = require("./placement.controller");
const { cronGenerateSearchTermReport } = require('./searchTerm.controller');
const { cronGenerateTargetingReport, cronListTargetingFromAmazon } = require("./targeting.controller");

const { RefreshToken } = require("../services/amazon.services");
const { clearAccessTokenCache, clearSPAccessTokenCache } = require("../services/redis.service");
const { seedAccessToken, invalidateAccessToken } = require("../services/amazonAuth.service");
const { write_logs } = require("../../winston/utility/logger");

const {
  spProfileConfig,
  getAccessToken,
  getRuleDate,
  getDatesBetween,
  generateUnique,
  clearProfileCache,
  clearActivePlanProfilesCache
} = require("../helper/common");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { getSqsByAmazonUrl } = require("../helper/amsArn");
const { subscribeAmsDataset, archiveAmsSubscription } = require("../services/amazonAms.service");
const { logAudit } = require("../helpers/auditHelper");

const { sendEmailHelper } = require("../helper/emailHelper");
const { buildDisconnectEmail } = require("../../emailTemplate/buildDisconnectEmail");
const { buildDisconnectReminderEmail } = require("../../emailTemplate/buildDisconnectReminderEmail");
const { cronDeleteExpiredAccountsData } = require("../services/accountDataCleanup.service");
const { ROLES } = require("../constants/roles");
const amazonAxios = require("../helper/amazonAxios");

exports.updateAccessToken = async () => {
  // Token lifecycles are now handled distributed and on-demand via amazonAuth.service
};

exports.listProfiles = async (req, res) => {
  const { _id: userId } = req.user;
  const orgId = req?.organizationId;
  const matchOrgId = orgId && orgId !== "null" && orgId !== "undefined" && mongoose.Types.ObjectId.isValid(orgId) ? new mongoose.Types.ObjectId(orgId) : null;

  const profileAccessPipeline = [
    { $match: { userId, ...(matchOrgId && { organizationId: matchOrgId }) } }
  ];
  const profiles = await profileBasedPermissionSchema.aggregate(profileAccessPipeline);
  const configIds = [...new Set(profiles?.map((profile) => profile?.configId))];

  try {
    const pipeline = [
      { $match: { userId, configId: { $in: configIds }, hasAccess: true, ...(matchOrgId && { organizationId: matchOrgId }) } },
      {
        $lookup: {
          from: "profiles",
          let: { profileId: "$profileId", configId: "$configId" },
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$profileId", "$$profileId"] }, { $eq: ["$configId", "$$configId"] }, { $eq: ["$isActive", true] }] } } }],
          as: "profile",
        },
      },
      { $unwind: "$profile" },
      { $match: { "profile.isActive": true } },
      {
        $lookup: {
          from: "configs",
          localField: "profile.configId",
          foreignField: "_id",
          as: "config",
        },
      },
      { $unwind: "$config" },
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
                  ],
                },
              },
            },
          ],
          as: "sellerConfigDoc",
        },
      },
      {
        $addFields: {
          sellerConfigDoc: { $arrayElemAt: ["$sellerConfigDoc", 0] },
        },
      },
      {
        $addFields: {
          isAdsActive: {
            $and: [
              { $eq: ["$config.isActive", true] },
              { $eq: [{ $ifNull: ["$profile.isAdsSyncEnabled", true] }, true] },
            ],
          },
          isSpActive: {
            $and: [
              { $eq: [{ $ifNull: ["$sellerConfigDoc.isActive", false] }, true] },
              { $eq: ["$profile.isSpSyncEnabled", true] },
            ],
          },
          isSpConfigured: {
            $cond: [{ $ifNull: ["$sellerConfigDoc", false] }, true, false]
          },
        },
      },
      {
        // Filter: If ads and seller both are disconnected, do not show in top profile.
        // If any one of them is active, show in the top profile!
        $match: {
          $or: [{ isAdsActive: true }, { isSpActive: true }],
          ...(matchOrgId && {
            $or: [
              { "config.organizationId": matchOrgId },
              { "config.organizationId": null },
              { "config.organizationId": { $exists: false } },
            ],
          }),
        },
      },
      { $sort: { "profile.name": 1 } },
      {
        $group: {
          _id: "$config._id",
          configId: { $first: "$config._id" },
          companyName: { $first: "$config.companyName" },
          config: { $first: { companyName: "$config.companyName" } },
          profiles: {
            $push: {
              _id: "$profile._id",
              profileId: "$profile.profileId",
              countryCode: "$profile.countryCode",
              currencyCode: "$profile.currencyCode",
              name: "$profile.name",
              type: "$profile.type",
              advertiserId: "$profile.advertiserId",
              isFavorite: "$profile.isFavorite",
              isAdsSyncEnabled: "$profile.isAdsSyncEnabled",
              isSpSyncEnabled: "$profile.isSpSyncEnabled",
              isAdsActive: "$isAdsActive",
              isSpActive: "$isSpActive",
              isSpConfigured: "$isSpConfigured",
              sellerDisconnectedAt: "$sellerConfigDoc.disconnectedAt",
              adsDisconnectedAt: "$config.disconnectedAt",
            },
          },
        },
      },
      { $sort: { companyName: 1 } },
      { $project: { _id: 1, configId: 1, "config.companyName": 1, profiles: 1 } },
    ];

    const getProfiles = await profileBasedPermissionSchema.aggregate(pipeline);

    return res.status(200).send({
      isSuccess: true,
      message: "Profiles list successfully.",
      data: getProfiles,
    });
  } catch (error) {
    write_logs({ message: `[listProfiles Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.addToFavoriteProfile = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const { configId, profileId } = req.body;

    if (!configId || !profileId) {
      return res.status(400).send({ isSuccess: false, message: "configId and profileId are required." });
    }

    const isOwner = req?.role?.roleName === ROLES.SUPER_ADMIN;
    if (!isOwner) {
      const hasAccess = await profileBasedPermissionSchema.findOne({ userId, configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId), hasAccess: true });
      if (!hasAccess) {
        return res.status(203).send({ isSuccess: false, message: "You do not have access to this profile." });
      }
    }

    // Find the profile and toggle isFavorite
    const profile = await profileSchema.findOne({ configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId), isActive: true });
    if (!profile) {
      return res.status(404).send({ isSuccess: false, message: "Profile not found." });
    }

    const updatedProfile = await profileSchema.findByIdAndUpdate(profile?._id, { $set: { isFavorite: !profile.isFavorite } }, { new: true });

    return res.status(200).send({
      isSuccess: true,
      message: `Profile ${updatedProfile.isFavorite ? "added to" : "removed from"} favorites successfully.`,
      data: {
        _id: updatedProfile._id,
        profileId: updatedProfile.profileId,
        configId: updatedProfile.configId,
        name: updatedProfile.name,
        isFavorite: updatedProfile.isFavorite,
      },
    });
  } catch (error) {
    write_logs({ message: `[addToFavoriteProfile Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong, please try again!",
      error: "An internal server error occurred",
    });
  }
};

async function usProfiles(checkConfigAds, configId) {
  return new Promise((resolve, reject) => {
    const profiles = [];
    let profileOptions = {
      method: "GET",
      url: `${process.env.ROOT_LINK}/v2/profiles`,
      headers: {
        "Amazon-Advertising-API-ClientId": `${checkConfigAds.adsClientId}`,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
      meta: { configId: configId, tokenKey: "adsAccessToken" }
    };

    amazonAxios(profileOptions).then((response) => {
      if (response.status == 200) {
        const body = response.data;
        if (body.code !== "UNAUTHORIZED") {
          body.map(async (item) => {
            let profile = {
              configId,
              profileId: item.profileId,
              countryCode: item.countryCode,
              currencyCode: item.currencyCode,
              timezone: item.timezone,
              marketplaceStringId: item?.accountInfo?.marketplaceStringId,
              advertiserId: item?.accountInfo?.id,
              type: item.accountInfo.type,
              name: item?.accountInfo?.name,
              amazonUrl: process.env.ROOT_LINK,
            };
            profiles.push(profile);
          });
          resolve(profiles);
        }
      }
      else {
        resolve(profiles);
      }
    }).catch((error) => {
      write_logs({ message: `[usProfiles Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      resolve(profiles);
    })
  });
}

async function euProfiles(checkConfigAds, configId) {
  return new Promise((resolve, reject) => {
    const profiles = [];
    let profileOptions = {
      method: "GET",
      url: `${process.env.EU_ROOT_LINK}/v2/profiles`,
      headers: {
        "Amazon-Advertising-API-ClientId": `${checkConfigAds.adsClientId}`,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
      meta: { configId: configId, tokenKey: "adsAccessToken" }
    };

    amazonAxios(profileOptions).then((response) => {
      if (response.status == 200) {
        const body = response.data;
        if (body.code !== "UNAUTHORIZED") {
          body.map(async (item) => {
            let profile = {
              configId,
              profileId: item.profileId,
              countryCode: item.countryCode,
              currencyCode: item.currencyCode,
              timezone: item.timezone,
              marketplaceStringId: item.accountInfo.marketplaceStringId,
              advertiserId: item?.accountInfo?.id,
              type: item.accountInfo.type,
              name: item.accountInfo.name,
              amazonUrl: process.env.EU_ROOT_LINK,
            };
            profiles.push(profile);
          });
          resolve(profiles);
        }
      }
      else {
        resolve(profiles);
      }
    }).catch((error) => {
      write_logs({ message: `[euProfiles Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      resolve(profiles);
    })
  });
}

async function feProfiles(checkConfigAds, configId) {
  return new Promise((resolve, reject) => {
    const profiles = [];
    let profileOptions = {
      method: "GET",
      url: `${process.env.FE_ROOT_LINK}/v2/profiles`,
      headers: {
        "Amazon-Advertising-API-ClientId": `${checkConfigAds.adsClientId}`,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
      meta: { configId: configId, tokenKey: "adsAccessToken" }
    };

    amazonAxios(profileOptions).then((response) => {
      if (response.status == 200) {
        const body = response.data;
        if (body.code !== "UNAUTHORIZED") {
          body.map(async (item) => {
            let profile = {
              configId,
              profileId: item.profileId,
              countryCode: item.countryCode,
              currencyCode: item.currencyCode,
              timezone: item.timezone,
              marketplaceStringId: item.accountInfo.marketplaceStringId,
              advertiserId: item?.accountInfo?.id,
              type: item.accountInfo.type,
              name: item.accountInfo.name,
              amazonUrl: process.env.FE_ROOT_LINK,
            };
            profiles.push(profile);
          });
          resolve(profiles);
        }
      }
      else {
        resolve(profiles);
      }
    }).catch((error) => {
      write_logs({ message: `[feProfiles Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      resolve(profiles);
    })
  });
}

exports.checkConnectAccount = async (req, res) => {
  const userId = req.user._id;
  if (!userId) {
    return res.status(203).send({ message: "User ID required.", isSuccess: false });
  }
  try {
    return res.status(200).send({ connect: true, isSuccess: true, message: "Account connected" });
  } catch (error) {
    write_logs({ message: `[checkConnectAccount Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.addMarketPlaceConfig = async (req, res) => {

  const configs = await spProfileConfig();
  for (const configId of configs) {

    const configs = [
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-na.amazon.com",
        marketPlaceId: "A2EUQ1WTGCTBG2",
        countryCode: "CA",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-na.amazon.com",
        marketPlaceId: "ATVPDKIKX0DER",
        countryCode: "US",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-na.amazon.com",
        marketPlaceId: "A1AM78C64UM0Y8",
        countryCode: "MX",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-na.amazon.com",
        marketPlaceId: "A2Q3Y263D00KWC",
        countryCode: "BR",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A1RKKUPIHCS9HS",
        countryCode: "ES",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A1F83G8C2ARO7P",
        countryCode: "UK",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A13V1IB3VIYZZH",
        countryCode: "FR",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "AMEN7PMS3EDWL",
        countryCode: "BE",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A1805IZSGTT6HS",
        countryCode: "NL",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A1PA6795UKMFR9",
        countryCode: "DE",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "APJ6JRA9NG5V4",
        countryCode: "IT",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A2NODRKZP88ZB9",
        countryCode: "SE",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "AE08WJ6YKNBMC",
        countryCode: "ZA",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A1C3SOZRARQ6R3",
        countryCode: "PL",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "ARBP9OOSHTCHU",
        countryCode: "EG",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A33AVAJ2PDY3EV",
        countryCode: "TR",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A17E79C6D8DWNP",
        countryCode: "SA",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A2VIGQ35RCS4UG",
        countryCode: "AE",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-eu.amazon.com",
        marketPlaceId: "A21TJRUUN4KGV",
        countryCode: "IN",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-fe.amazon.com",
        marketPlaceId: "A19VAU5U5O7RUS",
        countryCode: "SG",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-fe.amazon.com",
        marketPlaceId: "A39IBJ37TRP1C6",
        countryCode: "AU",
      },
      {
        configId: configId,
        endPoint: "https://sellingpartnerapi-fe.amazon.com",
        marketPlaceId: "A1VC38T7YXB528",
        countryCode: "JP",
      },
    ];

    const result = await marketPlaceConfigSchema.insertMany(configs);

    console.log("Inserted Docs:", result);
  }

}

exports.getAllMarketplaces = async (req, res) => {
  const result = await marketPlaceConfigSchema.find().lean();

  return res.status(200).json({
    isSuccess: true,
    data: result,
  });
}

exports.amazonRedirect = async (req, res) => {
  try {
    const { companyName, reconnect = false, type = "ADS", configId } = req.body;
    const clientId = req.body.clientId || process.env.AMAZON_ADS_CLIENT_ID;
    const clientSecret = req.body.clientSecret || process.env.AMAZON_ADS_CLIENT_SECRET;
    const { _id: userId } = req?.user || {};
    const organizationId = req?.organizationId || req?.user?.organizationId || null;

    if (!userId) return res.status(400).json({ isSuccess: false, message: "UserId is required" });
    if (!clientId) return res.status(400).json({ isSuccess: false, message: "ClientId is required (check environment variables)" });
    if (!clientSecret) return res.status(400).json({ isSuccess: false, message: "Client Secret is required (check environment variables)" });

    // Check plan connection limits if it's a new connection
    if (!reconnect && organizationId) {
      const org = await organizationSchema.findById(organizationId).populate("planId").lean();
      const amazonConnectLimit = org?.planId?.amazonConnectLimit || 0;

      const configCount = await configSchema.countDocuments({ organizationId });

      if (configCount >= amazonConnectLimit) {
        return res.status(203).json({
          isSuccess: false,
          message: "Your Plan based Connection Limit is Over. Now Upgrade a Plan to Connect a More Config"
        });
      }
    }

    /* -------------------------- Generate Secure State ---------------------- */
    const state = crypto.randomBytes(32).toString("hex");

    /* ---------------------------- Store Temp State ------------------------- */
    await tempStateConfigSchema.create({
      organizationId,
      userId,
      companyName,
      configId: configId || null,
      clientId,
      clientSeceret: clientSecret,
      state,
      type,
      isNew: !reconnect,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 Min TTL
    });

    /* ---------------------------- Generate URL ----------------------------- */
    const redirectUrl = `${process.env.BASE_URL}/api/config/amazonCallback`;
    const authUrl = `${process.env.AUTH_GRANT_URL}?response_type=code&client_id=${clientId}&scope=${process.env.SCOPE}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${state}&prompt=consent`;

    return res.status(200).json({
      isSuccess: true,
      data: { authUrl },
    });
  } catch (error) {
    write_logs({ message: `[amazonRedirect Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
    });
  }
}

/**
 * Generate & assign Config ID and Profile ID to Seller Account (sellerConfig) after Ads Account is connected.
 * - Assigns config._id to sellerConfig.configId
 * - Retrieves Seller ID using Profile ID (matching advertiserId / accountInfo.id with sellerId)
 * - Updates sellerConfig with profileId and configId
 */
async function linkSellerConfigWithAdsConfig(config, userId, organizationId) {
  try {
    if (!config || !config._id) return;
    const configId = config._id;
    const orgId = organizationId || config.organizationId;

    const ownerConditions = [];
    if (orgId) ownerConditions.push({ organizationId: orgId });
    if (userId) ownerConditions.push({ userId });
    ownerConditions.push({ organizationId: null });

    const queryFilter = {
      isActive: true,
      $or: ownerConditions,
      $and: [
        {
          $or: [
            { configId: null },
            { profileId: null },
            { configId: configId }
          ]
        }
      ]
    };

    let unlinkedSellerConfigs = await sellerConfigSchema.find(queryFilter);
    if (!unlinkedSellerConfigs || unlinkedSellerConfigs.length === 0) {
      write_logs({ message: `[linkSellerConfigWithAdsConfig] No eligible sellerConfig records found for queryFilter: ${queryFilter}`, log_type: "info" });
      return;
    }

    let fetchedProfiles = [];
    try {
      const checkConfigAds = await getAccessToken(configId);
      if (checkConfigAds?.adsAccessToken) {
        const [us, eu, fe] = await Promise.all([
          usProfiles(checkConfigAds, configId),
          euProfiles(checkConfigAds, configId),
          feProfiles(checkConfigAds, configId),
        ]);
        fetchedProfiles = [...us, ...eu, ...fe].filter((p) => p?.profileId);
      }
    } catch (profileErr) {
      write_logs({ message: `[linkSellerConfigWithAdsConfig] Error fetching Ads profiles: ${profileErr?.message || profileErr}`, log_type: "error" });
    }

    const dbProfiles = await profileSchema.find({ configId }).lean();
    const allProfiles = [...fetchedProfiles];
    for (const dbP of dbProfiles) {
      if (!allProfiles.some((p) => String(p.profileId) === String(dbP.profileId))) {
        allProfiles.push({
          profileId: dbP.profileId,
          advertiserId: dbP.advertiserId,
          type: dbP.type,
          accountInfo: { id: dbP.advertiserId, type: dbP.type }
        });
      }
    }

    for (const sellerConfig of unlinkedSellerConfigs) {
      let isModified = false;

      // 1. Always assign configId to the unlinked sellerConfig
      if (!sellerConfig.configId || String(sellerConfig.configId) !== String(configId)) {
        sellerConfig.configId = configId;
        isModified = true;
      }

      if (orgId && (!sellerConfig.organizationId || String(sellerConfig.organizationId) !== String(orgId))) {
        sellerConfig.organizationId = orgId;
        isModified = true;
      }

      if (userId && !sellerConfig.userId) {
        sellerConfig.userId = userId;
        isModified = true;
      }

      // 2. Try to find matching profile
      let matchingProfile = null;

      if (sellerConfig.sellerId) {
        matchingProfile = allProfiles.find((p) => {
          const profSellerId = p?.advertiserId || p?.accountInfo?.id;
          return profSellerId && String(profSellerId).trim() === String(sellerConfig.sellerId).trim();
        });
      }

      // Fallback: If no exact sellerId match found, pick first seller type profile or first available profile
      if (!matchingProfile && allProfiles.length > 0) {
        matchingProfile = allProfiles.find((p) => p?.type === "seller" || p?.accountInfo?.type === "seller") || allProfiles[0];
      }

      if (matchingProfile) {
        if (!sellerConfig.profileId || String(sellerConfig.profileId) !== String(matchingProfile.profileId)) {
          sellerConfig.profileId = Number(matchingProfile.profileId);
          isModified = true;
        }

        const retrievedSellerId = matchingProfile.advertiserId || matchingProfile.accountInfo?.id;
        if (!sellerConfig.sellerId && retrievedSellerId) {
          sellerConfig.sellerId = retrievedSellerId;
          isModified = true;
        }
      }

      if (isModified) {
        await sellerConfig.save();
        write_logs({ message: `[linkSellerConfigWithAdsConfig] Updated sellerConfig ${sellerConfig._id} with configId=${sellerConfig.configId}, profileId=${sellerConfig.profileId}, sellerId=${sellerConfig.sellerId}`, log_type: "info" });

        /* Duplicate Seller Config handling: mark duplicate active sellerConfigs as isActive = false */
        if (sellerConfig.userId && sellerConfig.organizationId && sellerConfig.sellerId && sellerConfig.configId && sellerConfig.profileId) {
          await sellerConfigSchema.updateMany(
            {
              _id: { $ne: sellerConfig._id },
              userId: sellerConfig.userId,
              organizationId: sellerConfig.organizationId,
              sellerId: sellerConfig.sellerId,
              configId: sellerConfig.configId,
              profileId: sellerConfig.profileId,
              isActive: true,
            },
            { $set: { isActive: false, disconnectedAt: new Date() } }
          );
        }
      }
    }
  } catch (err) {
    write_logs({ message: `[linkSellerConfigWithAdsConfig Error] ${err?.message || err}`, log_type: "error" });
  }
}

exports.initiateAmazonSellerAuth = async (req, res) => {
  try {
    const { amazon_callback_uri, amazon_state, selling_partner_id, version } = req.body;
    const { _id: userId } = req?.user || {};
    const organizationId = req?.organizationId || req?.user?.organizationId || null;

    if (!userId) {
      return res.status(400).json({ isSuccess: false, message: "UserId is required" });
    }

    if (!amazon_callback_uri) {
      return res.status(400).json({ isSuccess: false, message: "amazon_callback_uri is required" });
    }



    /* -------------------------- Generate Secure State ---------------------- */
    const state = crypto.randomBytes(32).toString("hex");
    const clientId = process.env.AMAZON_SP_CLIENT_ID;
    const clientSecret = process.env.AMAZON_SP_CLIENT_SECRET;
    /* ---------------------------- Store Temp State ------------------------- */
    await tempStateConfigSchema.create({
      organizationId,
      userId,
      sellerId: selling_partner_id || null,
      clientId,
      clientSeceret: clientSecret,
      state,
      type: "SP",
      isNew: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 Min TTL
    });

    /* ---------------------------- Build Redirect URL ----------------------- */
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const redirectUri = host && host.includes("ngrok")
      ? `https://${host}/api/config/amazonCallback`
      : (process.env.AMAZON_SP_REDIRECT_URI || `${process.env.BASE_URL || `${protocol}://${host}`}/api/config/amazonCallback`);

    const ver = version || "beta";

    const authUrl = `${amazon_callback_uri}?redirect_uri=${encodeURIComponent(redirectUri)}&amazon_state=${encodeURIComponent(amazon_state || "")}&state=${encodeURIComponent(state)}&version=${encodeURIComponent(ver)}`;

    return res.status(200).json({
      isSuccess: true,
      data: { authUrl },
    });
  } catch (error) {
    console.error("initiateAmazonSellerAuth error:", error);
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
    });
  }
};

exports.amazonCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_REDIRECT_URL || "http://localhost:3000";
  try {
    const { code: rawCode, spapi_oauth_code, selling_partner_id, state, error: amazonError, error_description } = req.query;
    const code = spapi_oauth_code || rawCode;
    /* ------------------- Handle Amazon Auth Denials / Errors ---------------- */
    if (amazonError) {
      const errorMsg = error_description || amazonError || "Amazon authorization was denied or failed";
      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent(errorMsg)}`);
    }

    /* ---------------------------- Validate Input --------------------------- */
    if (!code) {
      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Authorization code not received from Amazon")}`);
    }

    if (!state || typeof state !== "string") {
      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("State parameter missing or invalid")}`);
    }

    /* -------------------------- Validate OAuth State ----------------------- */
    const authState = await tempStateConfigSchema.findOne({ state });
    if (!authState) {
      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Invalid or expired state session")}`);
    }

    if (authState.isUsed) {
      await auditLogSchema.create({
        userId: authState.userId,
        event: "CSRF_ATTEMPT_INVALID",
        message: "Amazon OAuth state already used",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { state, status: "FAILED" }
      });

      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("State already used. Please initiate a new connection.")}`);
    }

    if (new Date() > authState.expiresAt) {
      await auditLogSchema.create({
        userId: authState.userId,
        event: "CSRF_ATTEMPT_EXPIRE",
        message: "Amazon OAuth state expired",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { state, expiresAt: authState.expiresAt, status: "FAILED" }
      });

      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Authorization session expired. Please try again.")}`);
    }

    /* ------------------- Check state type (SP vs ADS) ---------------------- */
    const isSPAuth = authState.type === "SP" || Boolean(spapi_oauth_code) || Boolean(selling_partner_id);
    if (isSPAuth) {
      const finalSellerId = selling_partner_id || authState.sellerId;
      if (!finalSellerId) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Amazon Seller ID (Merchant ID) not received")}`);
      }

      /* Validate selling_partner_id match if both provided */
      if (authState.sellerId && selling_partner_id && authState.sellerId !== selling_partner_id) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Selling Partner ID mismatch")}`);
      }

      /* Mark State Used */
      authState.isUsed = true;
      await authState.save();

      const { organizationId, userId } = authState;
      const clientId = process.env.AMAZON_SP_CLIENT_ID || authState.clientId;
      const clientSecret = process.env.AMAZON_SP_CLIENT_SECRET || authState.clientSeceret;

      /* Exchange Token with Amazon LWA */
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const redirectUri = host && host.includes("ngrok")
        ? `https://${host}/api/config/amazonCallback`
        : (process.env.AMAZON_SP_REDIRECT_URI || `${process.env.BASE_URL || `${protocol}://${host}`}/api/config/amazonCallback`);


      let tokenResponse;
      try {
        tokenResponse = await axios.post(
          process.env.AUTH_LINK || "https://api.amazon.com/auth/o2/token",
          new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout: 10000,
          }
        );
      } catch (err) {
        console.error("SP Token Exchange Error:", err.response?.data || err.message);
        const errMsg = err.response?.data?.error_description || err.response?.data?.message || err.message || "Failed to exchange SP token with Amazon";
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent(errMsg)}`);
      }

      const { access_token, refresh_token, expires_in } = tokenResponse?.data || {};
      if (!access_token || !refresh_token) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Invalid token response received from Amazon")}`);
      }

      const tokenExpiresAt = new Date(Date.now() + (expires_in - 300) * 1000);

      /* Save / Update sellerConfig */
      const ownerFilter = [];
      if (organizationId) ownerFilter.push({ organizationId });
      if (userId) ownerFilter.push({ userId });
      ownerFilter.push({ organizationId: null });

      let sellerConfig = await sellerConfigSchema.findOne({
        sellerId: finalSellerId,
        $or: ownerFilter
      });
      if (!sellerConfig && userId) {
        sellerConfig = await sellerConfigSchema.findOne({ userId, sellerId: { $in: [null, "", finalSellerId] } });
      }

      if (sellerConfig) {
        sellerConfig.spClientId = clientId;
        sellerConfig.spClientSecret = clientSecret;
        sellerConfig.spAccessToken = access_token;
        sellerConfig.spRefreshToken = refresh_token;
        sellerConfig.sellerId = finalSellerId;
        sellerConfig.tokenExpire = expires_in;
        sellerConfig.spTokenExpiresAt = tokenExpiresAt;
        sellerConfig.isActive = true;
        sellerConfig.disconnectedAt = null;
        if (userId) sellerConfig.userId = userId;
        if (organizationId) sellerConfig.organizationId = organizationId;

        await sellerConfig.save();
      } else {
        sellerConfig = await sellerConfigSchema.create({
          userId: userId || null,
          organizationId: organizationId || null,
          configId: null,
          profileId: null,
          sellerId: finalSellerId,
          spClientId: clientId,
          spClientSecret: clientSecret,
          spAccessToken: access_token,
          spRefreshToken: refresh_token,
          tokenExpire: expires_in,
          spTokenExpiresAt: tokenExpiresAt,
          isActive: true,
        });
      }

      await auditLogSchema.create({
        userId: userId || null,
        event: "SELLER_CONFIG_CONNECT",
        message: `Amazon Seller account connected for seller "${finalSellerId}"`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { sellerId: finalSellerId, status: "SUCCESS" }
      });

      /* Cleanup */
      await tempStateConfigSchema.deleteOne({ _id: authState._id });

      /* Redirect to portal (/select-organization) */
      return res.redirect(`${frontendUrl}/select-organization?status=success&flow=amazon_appstore_seller&sellerId=${encodeURIComponent(finalSellerId)}`);
    }

    /* ---------------------------- ADS OAuth Flow --------------------------- */
    /* Mark State Used */
    authState.isUsed = true;
    await authState.save();

    /* Extract Data */
    const { organizationId, userId, companyName, configId: stateConfigId, clientId, clientSeceret, isNew } = authState;

    /* Validate User */
    const user = await userSchema.findById(userId).lean();
    if (!user) {
      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("User not found")}`);
    }

    /* Exchange Token */
    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        process.env.AUTH_LINK,
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSeceret,
          redirect_uri: `${process.env.BASE_URL}/api/config/amazonCallback`,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 10000,
        }
      );
    } catch (err) {
      write_logs({ message: `[amazonCallback Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      const errMsg = err.response?.data?.error_description || err.response?.data?.message || err.message || "Failed to exchange token with Amazon";
      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent(errMsg)}`);
    }

    /* Validate Token */
    const { access_token, refresh_token, expires_in } = tokenResponse?.data || {};
    if (!access_token || !refresh_token) {
      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Invalid token response received from Amazon")}`);
    }

    /* Save / Update Config */
    let config;
    const tokenExpiresAt = new Date(Date.now() + (expires_in - 300) * 1000);

    if (!isNew) {
      if (stateConfigId) {
        config = await configSchema.findById(stateConfigId);
      } else if (organizationId && companyName) {
        config = await configSchema.findOne({ organizationId, companyName });
      } else if (organizationId) {
        config = await configSchema.findOne({ organizationId, companyName, adsClientId: clientId });
      } else {
        config = await configSchema.findOne({ companyName, adsClientId: clientId, organizationId: null });
      }

      if (!config) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Config record to reconnect was not found")}`);
      }

      config.adsAccessToken = access_token;
      config.adsRefressToken = refresh_token;
      config.adsTokenUpdatedAt = new Date();
      config.tokenExpire = expires_in;
      config.adsTokenExpiresAt = tokenExpiresAt;
      config.isActive = true;
      config.disconnectedAt = null;
      if (organizationId) config.organizationId = organizationId;
      await config.save();
      await seedAccessToken({ kind: "ads", configId: config._id, accessToken: access_token, expiresIn: expires_in });
      await clearAccessTokenCache(config._id).catch((err) => { write_logs({ message: "[amazonCallback Silent Error] " + (err?.message || err), log_type: "error" }); });

      await auditLogSchema.create({
        userId,
        configId: config._id,
        event: "CONFIG_RECONNECT",
        message: `Amazon Ads config reconnected for ${companyName || config.companyName}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { companyName: companyName || config.companyName, status: "SUCCESS" }
      });

      await configHistorySchema.create({
        configId: config?._id,
        event: "RECONNECT",
      });

    } else {
      config = await configSchema.create({
        companyName,
        adsClientId: clientId,
        adsClientSeceret: clientSeceret,
        adsAccessToken: access_token,
        adsRefressToken: refresh_token,
        adsTokenUpdatedAt: new Date(),
        tokenExpire: expires_in,
        adsTokenExpiresAt: tokenExpiresAt,
        isActive: true,
        organizationId: organizationId || req?.user?.organizationId || null,
      });
      await seedAccessToken({ kind: "ads", configId: config._id, accessToken: access_token, expiresIn: expires_in });
      await clearAccessTokenCache(config._id).catch((err) => { write_logs({ message: "[amazonCallback Silent Error] " + (err?.message || err), log_type: "error" }); });

      await auditLogSchema.create({
        userId,
        configId: config._id,
        event: "CONFIG_CONNECT",
        message: `Amazon Ads config connected for ${companyName}`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { companyName, status: "SUCCESS" }
      });

      await configHistorySchema.create({
        configId: config._id,
        event: "CONNECT",
      });

    }

    /* Link Seller Account with Ads Config ID and Profile ID */
    await linkSellerConfigWithAdsConfig(config, userId, organizationId);

    /* Cleanup */
    await tempStateConfigSchema.deleteOne({ _id: authState._id });

    /* Redirect */
    return res.redirect(`${frontendUrl}/settings?status=success&configId=${config?._id}`);

  } catch (error) {
    write_logs({ message: `[amazonCallback Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent(error?.message || "Internal server error")}`);
  }
};

exports.syncLast30Days = async (req, res) => {
  try {
    const { configId } = req.body;

    /* -------------------- 1. Validate Input -------------------- */
    if (!configId) {
      return res.status(203).json({
        isSuccess: false,
        message: "configId is required in request body",
      });
    }

    /* -------------------- 2. Check Config Exists & Tenant Access -------------------- */
    const isOwner = req?.role?.roleName === ROLES.SUPER_ADMIN;
    if (!isOwner) {
      const userAccess = await profileBasedPermissionSchema.findOne({
        userId: req?.user?._id,
        configId: new mongoose.Types.ObjectId(configId),
        hasAccess: true,
      }).lean();
      if (!userAccess) {
        return res.status(203).json({
          isSuccess: false,
          message: "Access forbidden: You do not have permission to access this config",
        });
      }
    }

    const config = await configSchema.findById(configId).lean();
    if (!config) {
      return res.status(203).json({
        isSuccess: false,
        message: "Config not found",
      });
    }

    /* -------------------- 3. Fetch Profiles for Config -------------------- */
    const profiles = await profileSchema.find({ configId }).lean();
    if (!profiles.length) {
      return res.status(203).json({
        isSuccess: false,
        message: "No profiles found for this config",
      });
    }

    /* -------------------- 4. Log Profiles (Sync Logic Placeholder) -------------------- */
    console.log(`Syncing last 30 days for configId: ${configId}`);
    await Promise.all(
      profiles.map(async (p) => {
        console.log(`Profile ID: ${p._id}, Name: ${p.name || "N/A"}`);
        const { fromDate, toDate } = getRuleDate(p.timezone, "LAST_30_DAYS");

        await profileSchema.updateOne(
          { configId, profileId: p.profileId },
          { $set: { isActive: true } }
        );
        clearProfileCache(configId?.toString(), p.profileId);
        clearActivePlanProfilesCache(p.profileId);

        await newProfileSyncSchema.findOneAndUpdate(
          { configId, profileId: p.profileId },
          { $set: { sync: "N", startDate: fromDate, endDate: toDate } },
          { new: true, upsert: true }
        ).lean()
      })
    )

    return res.status(200).json({
      isSuccess: true,
      message: `Sync process initiated for ${profiles.length} profiles`,
    });

  } catch (error) {
    write_logs({ message: `[syncLast30Days Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("syncLast30Days error:", error);
    return res.status(203).json({
      isSuccess: false,
      message: "Internal server error",
      error: "An internal server error occurred",
    });
  }
};

exports.amazonSPRedirect = async (req, res) => {
  try {
    const { profileId, sellerId, sellerConfigId, reconnect = false } = req.body;
    const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
    const clientId = req.body.clientId || process.env.AMAZON_SP_CLIENT_ID || process.env.AMAZON_ADS_CLIENT_ID;
    const clientSecret = req.body.clientSecret || process.env.AMAZON_SP_CLIENT_SECRET || process.env.AMAZON_ADS_CLIENT_SECRET;

    /* ---------------------------- VALIDATION ---------------------------- */
    if (!profileId) return res.status(400).json({ isSuccess: false, message: "ProfileId is required" });
    if (!clientId) return res.status(400).json({ isSuccess: false, message: "ClientId is required (check environment variables)" });
    if (!clientSecret) return res.status(400).json({ isSuccess: false, message: "Client Secret is required (check environment variables)" });

    /* -------------------------- GENERATE STATE -------------------------- */
    const state = crypto.randomBytes(32).toString("hex");

    /* -------------------------- SAVE TEMP STATE ------------------------- */
    await tempStateConfigSchema.create({
      configId: configId || null,
      profileId,
      sellerId: sellerId || null,
      sellerConfigId: sellerConfigId || null,
      clientId,
      clientSeceret: clientSecret,
      state,
      type: "SP",
      isNew: !reconnect,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    /* --------------------------- CREATE URL ----------------------------- */
    const appId = process.env.AMAZON_SP_APP_ID || "amzn1.sp.solution.e2c36b6c-ede9-4c77-84a9-57bd09efdbc8";
    const isDev = process.env.NODE_ENV === "dev" || !process.env.NODE_ENV;
    const authUrl = `https://sellercentral.amazon.com/apps/authorize/consent?application_id=${appId}&state=${state}${isDev ? "&version=beta" : ""}`;

    return res.status(200).json({
      isSuccess: true,
      data: { authUrl },
    });
  } catch (error) {
    write_logs({ message: `[amazonSPRedirect Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
    });
  }
}

exports.amazonSPCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_REDIRECT_URL || "http://localhost:3000";
  try {
    const { code: rawCode, spapi_oauth_code, selling_partner_id, state, error: amazonError, error_description } = req.query;
    const code = rawCode || spapi_oauth_code;

    /* ------------------- Handle Amazon Auth Denials / Errors ---------------- */
    if (amazonError) {
      const errorMsg = error_description || amazonError || "Amazon SP authorization was denied or failed";
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent(errorMsg)}`);
    }

    /* ---------------------------- VALIDATION ---------------------------- */
    if (!code) {
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Authorization code not received from Amazon")}`);
    }

    if (!state || typeof state !== "string") {
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("State parameter missing or invalid")}`);
    }

    /* ---------------------------- CHECK STATE --------------------------- */
    const authState = await tempStateConfigSchema.findOne({ state });
    if (!authState) {
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Invalid or expired state session")}`);
    }

    if (authState.isUsed) {
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("State already used. Please initiate a new connection.")}`);
    }

    if (new Date() > authState.expiresAt) {
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Authorization session expired. Please try again.")}`);
    }

    /* --------------------------- MARK USED ------------------------------ */
    authState.isUsed = true;
    await authState.save();

    /* ---------------------------- EXTRACT DATA -------------------------- */
    const { profileId, configId: stateConfigId, sellerId: stateSellerId, sellerConfigId, clientId, clientSeceret, isNew } = authState;

    const finalSellerId = stateSellerId || selling_partner_id;
    if (!finalSellerId) {
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Amazon Seller ID (Merchant ID) not received")}`);
    }

    /* -------------------------- EXCHANGE TOKEN -------------------------- */
    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        process.env.AUTH_LINK,
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSeceret,
          redirect_uri: `${process.env.BASE_URL}/api/config/amazonSPCallback`,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 10000,
        }
      );
    } catch (err) {
      write_logs({ message: `[amazonSPCallback Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      const errMsg = err.response?.data?.error_description || err.response?.data?.message || err.message || "Failed to exchange SP token with Amazon";
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent(errMsg)}`);
    }

    /* ---------------------------- TOKEN DATA ---------------------------- */
    const { access_token, refresh_token, expires_in } = tokenResponse?.data || {};
    if (!access_token || !refresh_token) {
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Invalid token response received from Amazon")}`);
    }

    /* ------------------------- SAVE / UPDATE ---------------------------- */
    let config;

    if (sellerConfigId) {
      config = await sellerConfigSchema.findById(sellerConfigId);

      if (!config) {
        return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Seller config not found")}`);
      }

      config.spAccessToken = access_token;
      config.spRefreshToken = refresh_token;
      config.sellerId = finalSellerId;
      config.tokenExpire = expires_in;
      config.spTokenExpiresAt = new Date(Date.now() + (expires_in - 300) * 1000);
      config.isActive = true;
      config.disconnectedAt = null;

      await config.save();
      if (config.configId && config.profileId) {
        await seedAccessToken({ kind: "sp", configId: config.configId.toString(), profileId: config.profileId, accessToken: access_token, expiresIn: expires_in });
      }
      await clearSPAccessTokenCache(config.configId, config.profileId).catch((err) => { write_logs({ message: "[amazonSPCallback Silent Error] " + (err?.message || err), log_type: "error" }); });

      await profileSchema.updateOne(
        { profileId: Number(config.profileId), configId: config.configId },
        { $set: { isSpSyncEnabled: true } }
      );
    } else {
      const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(stateConfigId && { configId: stateConfigId }) }).lean();
      if (!profile) {
        return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Profile not found")}`);
      }

      config = await sellerConfigSchema.create({
        configId: profile?.configId,
        profileId,
        sellerId: finalSellerId,
        spClientId: clientId,
        spClientSecret: clientSeceret,
        spAccessToken: access_token,
        spRefreshToken: refresh_token,
        tokenExpire: expires_in,
        spTokenExpiresAt: new Date(Date.now() + (expires_in - 300) * 1000),
        isActive: true,
      });
      if (config.configId && config.profileId) {
        await seedAccessToken({ kind: "sp", configId: config.configId.toString(), profileId: config.profileId, accessToken: access_token, expiresIn: expires_in });
      }
      await clearSPAccessTokenCache(config.configId, config.profileId).catch((err) => { write_logs({ message: "[amazonSPCallback Silent Error] " + (err?.message || err), log_type: "error" }); });

      await profileSchema.updateOne(
        { profileId: Number(profileId), configId: profile?.configId },
        { $set: { isSpSyncEnabled: true } }
      );
    }

    /* ----------------------------- CLEANUP ------------------------------ */
    await tempStateConfigSchema.deleteOne({ _id: authState._id });

    /* ----------------------------- REDIRECT ----------------------------- */
    // Only the profile/seller just connected via this OAuth flow should trigger
    // the sync setup modal — the frontend matches autoOpenSync against sellerId/profileId/configId.
    return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=success&autoOpenSync=${encodeURIComponent(finalSellerId)}`);

  } catch (error) {
    write_logs({ message: `[amazonSPCallback Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent(error?.message || "Internal server error")}`);
  }
}

exports.amazonSPRefreshToken = async (req, res) => {
  const { _id: userId } = req?.user ?? {};
  try {
    const {
      sellerConfigId,
      refreshToken,
      profileId,
      sellerId,
    } = req.body;
    const clientId = req.body.clientId || process.env.AMAZON_SP_CLIENT_ID || process.env.AMAZON_ADS_CLIENT_ID;
    const clientSecret = req.body.clientSecret || process.env.AMAZON_SP_CLIENT_SECRET || process.env.AMAZON_ADS_CLIENT_SECRET;
    const configId = req.body.configId || req?.config?.configId;

    /* -------------------- 1. Validate Input -------------------- */
    if (!refreshToken || !profileId) {
      return res.status(400).json({
        isSuccess: false,
        message: "refreshToken and profileId are required",
      });
    }

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        isSuccess: false,
        message: "SP Client ID and Client Secret are required (check environment variables)",
      });
    }

    /* -------------------- 2. Find Seller Config -------------------- */
    let sellerConfig = null;

    if (sellerConfigId) {
      sellerConfig = await sellerConfigSchema.findById(sellerConfigId);
    }

    if (!sellerConfig && configId) {
      sellerConfig = await sellerConfigSchema.findOne({ profileId: Number(profileId), configId });
    }

    if (!sellerConfig) {
      sellerConfig = await sellerConfigSchema.findOne({ profileId: Number(profileId) });
    }

    /* -------------------- 3. Request Amazon Token -------------------- */
    let spResponse;
    try {
      spResponse = await axios.post(
        process.env.AUTH_LINK,
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000,
        }
      );
    } catch (err) {
      write_logs({ message: `[amazonSPRefreshToken Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      await auditLogSchema.create({
        userId,
        sellerConfigId: sellerConfig?._id,
        event: sellerConfig ? "SELLER_CONFIG_RECONNECT" : "SELLER_CONFIG_CONNECT",
        message: `Failed to refresh Amazon Seller token for seller "${sellerId}"`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { sellerId, profileId, status: "FAILED", error: err.response?.data || err.message },
      });

      return res.status(400).json({
        isSuccess: false,
        message: "Failed to refresh access token from Amazon",
        error: err.response?.data || err.message,
      });
    }

    const { access_token, expires_in } = spResponse?.data || {};

    if (!access_token) {
      await auditLogSchema.create({
        userId,
        sellerConfigId: sellerConfig?._id,
        event: sellerConfig ? "SELLER_CONFIG_RECONNECT" : "SELLER_CONFIG_CONNECT",
        message: `Invalid token response received from Amazon for seller "${sellerId}"`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { sellerId, profileId, status: "FAILED" },
      });

      return res.status(500).json({
        isSuccess: false,
        message: "Invalid response received from Amazon",
      });
    }

    /* -------------------- 4. Create OR Update Seller Config -------------------- */
    let profile = null;
    if (configId) {
      profile = await profileSchema.findOne({ profileId: Number(profileId), configId }).lean();
    }
    if (!profile) {
      profile = await profileSchema.findOne({ profileId: Number(profileId) }).lean();
    }

    // ✅ CREATE
    if (!sellerConfig) {
      sellerConfig = await sellerConfigSchema.create({
        configId: profile?.configId,
        profileId: Number(profileId),
        sellerId,
        spClientId: clientId,
        spClientSecret: clientSecret,
        spRefreshToken: refreshToken,
        spAccessToken: access_token,
        tokenExpire: expires_in,
        spTokenExpiresAt: new Date(Date.now() + (expires_in - 300) * 1000),
        isActive: true,
      });

      if (sellerConfig.configId && sellerConfig.profileId) {
        await seedAccessToken({ kind: "sp", configId: sellerConfig.configId.toString(), profileId: sellerConfig.profileId, accessToken: access_token, expiresIn: expires_in });
      }

      await profileSchema.updateOne(
        { profileId: Number(profileId), ...(profile?.configId && { configId: profile.configId }) },
        { $set: { isSpSyncEnabled: true } }
      );
      await clearSPAccessTokenCache(sellerConfig.configId, sellerConfig.profileId).catch((err) => { write_logs({ message: "[amazonSPRefreshToken Silent Error] " + (err?.message || err), log_type: "error" }); });

      await auditLogSchema.create({
        userId,
        sellerConfigId: sellerConfig._id,
        event: "SELLER_CONFIG_CONNECT",
        message: `Amazon Seller config connected for seller "${sellerId}" (${profile?.name || "Unknown Profile"})`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { sellerId, profileId, profileName: profile?.name || null, status: "SUCCESS", authType: "REFRESH_TOKEN" },
      });
    }
    // ✅ UPDATE
    else {
      sellerConfig.spClientId = clientId;
      sellerConfig.spClientSecret = clientSecret;
      sellerConfig.spRefreshToken = refreshToken;
      sellerConfig.spAccessToken = access_token;
      sellerConfig.sellerId = sellerId;
      sellerConfig.tokenExpire = expires_in;
      sellerConfig.spTokenExpiresAt = new Date(Date.now() + (expires_in - 300) * 1000);
      sellerConfig.isActive = true;
      sellerConfig.disconnectedAt = null;

      await sellerConfig.save();
      if (sellerConfig.configId && sellerConfig.profileId) {
        await seedAccessToken({ kind: "sp", configId: sellerConfig.configId.toString(), profileId: sellerConfig.profileId, accessToken: access_token, expiresIn: expires_in });
      }
      await clearSPAccessTokenCache(sellerConfig.configId, sellerConfig.profileId).catch((err) => { write_logs({ message: "[amazonSPRefreshToken Silent Error] " + (err?.message || err), log_type: "error" }); });

      await profileSchema.updateOne(
        { profileId: Number(profileId), ...(profile?.configId && { configId: profile.configId }) },
        { $set: { isSpSyncEnabled: true } }
      );

      await auditLogSchema.create({
        userId,
        sellerConfigId: sellerConfig._id,
        event: "SELLER_CONFIG_RECONNECT",
        message: `Amazon Seller config reconnected for seller "${sellerId}" (${profile?.name || "Unknown Profile"})`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { sellerId, profileId, profileName: profile?.name || null, status: "SUCCESS", authType: "REFRESH_TOKEN" },
      });
    }

    /* -------------------- 5. Success Response -------------------- */
    return res.status(200).json({
      isSuccess: true,
      message: sellerConfigId ? "Access token refreshed successfully" : "Seller config created and access token generated",
      data: {
        sellerConfigId: sellerConfig._id,
        expiresIn: expires_in,
      },
    });

  } catch (error) {
    write_logs({ message: `[amazonSPRefreshToken Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
      error: "An internal server error occurred",
    });
  }
};

exports.amazonDisconnect = async (req, res) => {
  try {
    const { configId } = req.body;
    const { _id: userId } = req?.user ?? {};

    /* -------------------- Validation -------------------- */
    if (!configId) {
      return res.status(400).json({
        isSuccess: false,
        message: "configId is required",
      });
    }

    /* -------------------- Find Config & Check Tenant Access -------------------- */
    const isOwner = req?.role?.roleName === ROLES.SUPER_ADMIN;
    if (!isOwner) {
      const hasAccess = await profileBasedPermissionSchema.findOne({
        userId,
        configId: new mongoose.Types.ObjectId(configId),
        hasAccess: true,
      }).lean();
      if (!hasAccess) {
        return res.status(203).json({
          isSuccess: false,
          message: "Access forbidden: You do not have permission to disconnect this config",
        });
      }
    }

    const config = await configSchema.findById(configId);
    if (!config) {
      return res.status(404).json({
        isSuccess: false,
        message: "Config not found",
      });
    }

    /* -------------------- Already Disconnected -------------------- */
    if (!config.isActive) {
      await auditLogSchema.create({
        userId,
        configId: config?._id,
        event: "CONFIG_DISCONNECT",
        message: "Attempted to disconnect already inactive config",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { companyName: config.companyName, status: "ALREADY_DISCONNECTED" },
      });

      return res.status(200).json({
        isSuccess: true,
        message: "Amazon Ads connection is already disconnected",
      });
    }

    /* -------------------- Update Config -------------------- */
    config.isActive = false;
    config.disconnectedAt = new Date();
    await config.save();

    await auditLogSchema.create({
      userId,
      configId: config?._id,
      event: "CONFIG_DISCONNECT",
      message: `Amazon Ads config disconnected for company "${config?.companyName}"`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { companyName: config?.companyName, status: "SUCCESS" },
    });

    /* -------------------- History -------------------- */
    await configHistorySchema.create({
      configId,
      event: "DISCONNECT_ADS",
    });

    /* -------------------- Send Disconnect Email -------------------- */
    try {
      let targetUser = req.user;
      if (!targetUser) {
        const userAccess = await profileBasedPermissionSchema.findOne({ configId }).lean();
        if (userAccess) {
          targetUser = await userSchema.findById(userAccess.userId).lean();
        }
      }

      const profiles = await profileSchema.find({ configId }).lean();
      const purgeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (targetUser?.email) {
        await sendEmailHelper(
          targetUser.email,
          "⚠️ Your AdvertiseIQ Ads Account Data Will Be Deleted",
          buildDisconnectEmail({
            userName: targetUser.fullName,
            profileNames: profiles.map(p => p.name).join(", "),
            purgeDate: purgeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
            signInUrl: process?.env?.BASE_URL,
            type: "ads",
          })
        );
      }
    } catch (emailErr) {
      cron_logs({ message: `Ads Disconnect email failed: ${emailErr.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    }

    /* -------------------- Response -------------------- */
    return res.status(200).json({
      isSuccess: true,
      message: "Amazon Ads integration disconnected successfully. Ads data will be deleted after 30 days.",
    });

  } catch (error) {
    write_logs({ message: `[amazonDisconnect Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
    });
  }
};

exports.amazonSPDisconnect = async (req, res) => {
  try {
    const { sellerConfigId } = req.body;
    const { _id: userId } = req?.user ?? {};

    /* -------------------- Validation -------------------- */
    if (!sellerConfigId) {
      return res.status(400).json({
        isSuccess: false,
        message: "sellerConfigId is required",
      });
    }

    /* -------------------- Find Config & Check Tenant Access -------------------- */
    const config = await sellerConfigSchema.findById(sellerConfigId);
    if (!config) {
      return res.status(404).json({
        isSuccess: false,
        message: "Config not found",
      });
    }

    const isOwner = req?.role?.roleName === ROLES.SUPER_ADMIN;
    if (!isOwner) {
      const hasAccess = await profileBasedPermissionSchema.findOne({
        userId,
        profileId: Number(config?.profileId),
        hasAccess: true,
      }).lean();
      if (!hasAccess) {
        return res.status(203).json({
          isSuccess: false,
          message: "Access forbidden: You do not have permission to disconnect this seller config",
        });
      }
    }

    const profile = await profileSchema.findOne({ profileId: config?.profileId }).lean();

    /* -------------------- Already Disconnected -------------------- */
    if (!config.isActive) {
      await auditLogSchema.create({
        userId,
        sellerConfigId: config._id,
        event: "SELLER_CONFIG_DISCONNECT",
        message: "Attempted to disconnect already inactive seller config",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { sellerId: config.sellerId, profileId: config.profileId, status: "ALREADY_DISCONNECTED" },
      });

      return res.status(200).json({
        isSuccess: true,
        message: "Amazon SP connection is already disconnected",
      });
    }

    /* -------------------- Update Config -------------------- */
    config.isActive = false;
    config.disconnectedAt = new Date();
    await config.save();

    await profileSchema.updateOne(
      { configId: config.configId, profileId: config.profileId },
      { $set: { isSpSyncEnabled: false } }
    );

    if (config.configId && config.profileId) {
      await clearSPAccessTokenCache(config.configId.toString(), config.profileId).catch(() => {});
      await clearProfileCache(config.configId.toString(), config.profileId).catch(() => {});
      await clearActivePlanProfilesCache(config.profileId).catch(() => {});
    }

    await auditLogSchema.create({
      userId,
      sellerConfigId: config._id,
      event: "SELLER_CONFIG_DISCONNECT",
      message: `Amazon Seller config disconnected for seller "${config.sellerId}" (${profile?.name || "Unknown Profile"})`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { sellerId: config.sellerId, profileId: config.profileId, status: "SUCCESS" },
    });

    /* -------------------- History -------------------- */
    await configHistorySchema.create({
      configId: config.configId,
      event: "DISCONNECT_SP",
    });

    /* -------------------- Send Disconnect Email -------------------- */
    try {
      let targetUser = req.user;
      if (!targetUser) {
        const userAccess = await profileBasedPermissionSchema.findOne({ configId: config.configId }).lean();
        if (userAccess) {
          targetUser = await userSchema.findById(userAccess.userId).lean();
        }
      }

      const profiles = await profileSchema.find({ configId: config.configId }).lean();
      const purgeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (targetUser?.email) {
        await sendEmailHelper(
          targetUser?.email,
          "⚠️ Your AdvertiseIQ Seller SP-API Data Will Be Deleted",
          buildDisconnectEmail({
            userName: targetUser.fullName,
            profileNames: profiles.map(p => p.name).join(", "),
            purgeDate: purgeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
            signInUrl: process?.env?.BASE_URL,
            type: "sp",
          })
        );
      }
    } catch (emailErr) {
      cron_logs({ message: `SP Disconnect email failed: ${emailErr.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    }

    /* -------------------- Response -------------------- */
    return res.status(200).json({
      isSuccess: true,
      message: "Amazon SP account disconnected successfully. Seller data will be deleted after 30 days.",
    });

  } catch (error) {
    write_logs({ message: `[amazonSPDisconnect Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
    });
  }
};

exports.saveDefaultSettingForNewConfig = async (configId, userId) => {

  // configId = new ObjectId("694120f451f2bf9640c4b27f")
  const checkConfigAds = await getAccessToken(configId);
  if (!checkConfigAds?.adsAccessToken) return

  // Fetch profiles from all regions in parallel
  const [us, eu, fe] = await Promise.all([
    usProfiles(checkConfigAds, configId),
    euProfiles(checkConfigAds, configId),
    feProfiles(checkConfigAds, configId),
  ]);

  const profiles = [...us, ...eu, ...fe].filter((p) => p?.profileId != 2371257842854194);

  if (profiles.length > 0) {

    const existingProfiles = await profileSchema.find().lean();
    const existingProfileIds = new Set(existingProfiles.map((x) => x.profileId));
    // const newProfiles = profiles.filter((p) => !existingProfileIds.has(p.profileId));
    const newProfiles = profiles;

    //New Profiles
    const profileBulkOps = newProfiles.map((p) => ({
      updateOne: {
        filter: { configId, profileId: p.profileId },
        update: {
          $set: {
            countryCode: p?.countryCode,
            currencyCode: p?.currencyCode,
            timezone: p?.timezone,
            marketplaceStringId: p?.marketplaceStringId,
            advertiserId: p?.advertiserId,
            type: p?.type,
            name: p?.name,
            amazonUrl: p?.amazonUrl,
          },
          $setOnInsert: {
            isActive: false,
          },
        },
        upsert: true,
      },
    }));

    newProfiles?.forEach(async (profile) => {
      clearProfileCache(profile?.configId?.toString(), profile?.profileId)
      clearActivePlanProfilesCache(profile?.profileId)
    })

    await profileSchema.bulkWrite(profileBulkOps);


    if (newProfiles.length > 0) {

      const allCrons = await cronJobSchema.find().lean();
      newProfiles.map(async (p) => {

        // Give User Access to Profile
        try {
          const configDoc = await configSchema.findById(configId).lean();
          const orgId = configDoc?.organizationId;
          const userAccess = new profileBasedPermissionSchema({ userId, organizationId: orgId, profileId: Number(p?.profileId), configId: configId, hasAccess: true });
          await userAccess.save();
        } catch (err) {
          write_logs({ message: `[saveDefaultSettingForNewConfig Error] ${err?.message || err}`, log_type: "error" });
        }

        const { fromDate, toDate } = await getRuleDate(p.timezone, "LAST_30_DAYS");
        //Cron Job Scheduler
        allCrons.map(async (cron) => {
          await cronJobSchedularSchema.findOneAndUpdate(
            {
              configId,
              profileId: p.profileId,
              cronId: cron._id
            },
            {
              $set: {
                cronName: cron.cronName,
                timezone: p.timezone,
              }
            },
            { new: true, upsert: true }
          ).lean()
        })


        // await newProfileSyncSchema.findOneAndUpdate(
        //   {
        //     configId,
        //     profileId: p.profileId
        //   },
        //   {
        //     $set: {
        //       sync: "N",
        //       startDate: fromDate,
        //       endDate: toDate
        //     }
        //   },
        //   { new: true, upsert: true }
        // ).lean()

        //adNotificationSetting
        await adNotificationSettingSchema.findOneAndUpdate(
          {
            configId,
            profileId: p.profileId
          },
          {
            $set: {
              highACOS: 90,
              lowACOS: 20
            }
          },
          { new: true, upsert: true }
        ).lean()

        // Dynamic Target ACOS
        const dynamicACOS = [
          {
            from: 0,
            to: 4.99,
            Acos: 25
          },
          {
            from: 5,
            to: 9.99,
            Acos: 25
          },
          {
            from: 10,
            to: 14.99,
            Acos: 25
          },
          {
            from: 15,
            to: 19.99,
            Acos: 25
          },
          {
            from: 20,
            to: 24.99,
            Acos: 25
          },
          {
            from: 25,
            to: 29.99,
            Acos: 25
          },
          {
            from: 30,
            to: 34.99,
            Acos: 25
          },
          {
            from: 35,
            to: 100,
            Acos: 25
          }
        ]
        await defaultTargetAcosSchema.findOneAndUpdate(
          {
            configId,
            profileId: p.profileId,
            type: "All other"
          },
          {
            $set: {
              PPtargetAcos: 30,
              ROStargetAcos: 30,
              TOStargetAcos: 30,
              dynamicPPTarget: false,
              dynamicROSTarget: false,
              dynamicTOSTarget: false,
              dynamicPPtargetAcos: dynamicACOS,
              dynamicROStargetAcos: dynamicACOS,
              dynamicTOStargetAcos: dynamicACOS
            }
          },
          { new: true, upsert: true }
        ).lean();

        await averageAOVSchema.findOneAndUpdate(
          {
            configId,
            profileId: p.profileId,
            campaignName: "All"
          },
          {
            $set: {
              value: 39.99,
              COGS: 10
            }
          },
          { new: true, upsert: true }
        ).lean()

        await camapignSettingSchema.findOneAndUpdate(
          {
            configId,
            profileId: p.profileId
          },
          {
            $set: {
              minTargetCPC: 0.1,
              maxTargetCPC: 5,
              limitValue: 100,
              TOStargetAcos: 25,
              PPtargetAcos: 30,
              ROStargetAcos: 28,
              TOSPercentage: 60,
              excludeAdjustedCampaign: false,
              defaultOrder: 10,
              defaultBid: 1,
              targetAcos: 30
            }
          },
          { new: true, upsert: true }
        ).lean()

        const limitedCPCConditions = [
          {
            fieldName: "0% ACOS",
            from: 0,
            to: 0,
            increaseBid: 10,
            decreaseBid: 10
          },
          {
            fieldName: "<30% ACOS",
            from: 0,
            to: 30,
            increaseBid: 10,
            decreaseBid: 5
          },
          {
            fieldName: "30% - 40% ACOS",
            from: 30,
            to: 40,
            increaseBid: 5,
            decreaseBid: 5
          },
          {
            fieldName: "40% - 50% ACOS",
            from: 40,
            to: 50,
            increaseBid: 5,
            decreaseBid: 10
          },
          {
            fieldName: "50% - 60% ACOS",
            from: 50,
            to: 60,
            increaseBid: 5,
            decreaseBid: 15
          },
          {
            fieldName: "60% - 70% ACOS",
            from: 60,
            to: 70,
            increaseBid: 5,
            decreaseBid: 20
          },
          {
            fieldName: "70% - 80% ACOS",
            from: 70,
            to: 80,
            increaseBid: 5,
            decreaseBid: 25
          },
          {
            fieldName: "80% - 90% ACOS",
            from: 80,
            to: 90,
            increaseBid: 5,
            decreaseBid: 30
          },
          {
            fieldName: ">90% ACOS",
            from: 90,
            to: 100000,
            increaseBid: 5,
            decreaseBid: 30
          },
        ];
        await limitedCPCSchema.findOneAndUpdate(
          {
            configId,
            profileId: p.profileId
          },
          {
            $set: {
              conditions: limitedCPCConditions
            }
          },
          { new: true, upsert: true }
        ).lean()

      })

    }
  }
}

exports.getRuleSettings = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId } = req?.body;

    if (!configId || !profileId) {
      return res.status(400).send({
        isSuccess: false,
        message: "configId and profileId are required",
      });
    }

    const data = await camapignSettingSchema.findOne(
      { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) },
      { budgetRuleSetting: 1, placementRuleSetting: 1, targetingRuleSetting: 1, searchTermRuleSetting: 1, _id: 0 }
    ).lean();

    return res.status(200).send({
      isSuccess: true,
      data: data || {
        budgetRuleSetting: { minBudget: 0, maxBudget: 0 },
        placementRuleSetting: { minBid: 0, maxBid: 0 },
        targetingRuleSetting: { minBid: 0, maxBid: 0 },
        searchTermRuleSetting: { campaignPrefix: "" },
      },
    });
  } catch (error) {
    write_logs({ message: `[getRuleSettings Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Error fetching rule settings:", error);
    return res.status(500).send({
      isSuccess: false,
      message: "Failed to fetch rule settings",
      error: "An internal server error occurred",
    });
  }
};

exports.saveRuleSettings = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, budgetRuleSetting, placementRuleSetting, targetingRuleSetting, searchTermRuleSetting } = req.body;

    if (!configId || !profileId) {
      return res.status(400).send({
        isSuccess: false,
        message: "configId and profileId are required",
      });
    }

    const updatePayload = {
      ...(budgetRuleSetting && { budgetRuleSetting }),
      ...(placementRuleSetting && { placementRuleSetting }),
      ...(targetingRuleSetting && { targetingRuleSetting }),
      ...(searchTermRuleSetting && { searchTermRuleSetting }),
    };

    await camapignSettingSchema.findOneAndUpdate(
      { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) },
      { $set: updatePayload },
      { upsert: true, new: true }
    ).lean();

    await logAudit("RULES_SETTINGS", `Rules settings updated successfully`, { budgetRuleSetting, placementRuleSetting, targetingRuleSetting, searchTermRuleSetting }, req?.user?.id);

    return res.status(200).send({
      isSuccess: true,
      message: "Rule settings saved successfully",
    });
  } catch (error) {
    write_logs({ message: `[saveRuleSettings Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Error saving rule settings:", error);
    return res.status(500).send({
      isSuccess: false,
      message: "Failed to save rule settings",
      error: "An internal server error occurred",
    });
  }
};

exports.saveDefaultBid = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { profileId, defaultBid } = req.body;

    if (!configId || !profileId) {
      return res.status(400).send({
        isSuccess: false,
        message: "configId and profileId are required"
      });
    }

    const result = await camapignSettingSchema.findOneAndUpdate(
      { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) },
      { $set: { defaultBid } },
      { new: true, upsert: true }
    ).lean();

    return res.status(200).send({
      isSuccess: true,
      message: "Default bid saved successfully",
    });

  } catch (error) {
    write_logs({ message: `[saveDefaultBid Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Error saving default bid:", error);
    return res.status(500).send({
      isSuccess: false,
      message: "Failed to save default bid",
      error: "An internal server error occurred"
    });
  }
};

exports.SyncPastData = async () => {
  cron_logs({
    message: `India Time = ${moment()
      .tz("Asia/Kolkata")
      .format("HH:mm")} SyncPastData`,
    log_type: "info",
  });
  try {
    const newProfile = await newProfileSyncSchema.find({ sync: { $in: ["N", "P"] } }).lean();
    cron_logs({
      message: `SyncPastData: Total ${newProfile.length} new profile found.`,
      log_type: "info",
    });

    // await this.updateAccessToken();
    await Promise.all(
      newProfile.map((p) => limit(async () => {
        if (global.updateTaskProgress) global.updateTaskProgress("Sync Past Data");
        await profileSchema.updateOne(
          { profileId: p.profileId, configId: p.configId },
          { $set: { isActive: true } }
        );
        clearProfileCache(p.configId?.toString(), p.profileId);
        clearActivePlanProfilesCache(p.profileId);

        const profile = await profileSchema.findOne({ profileId: p.profileId, configId: p.configId, isActive: true }).lean();
        if (profile) {

          cron_logs({
            message: `SyncPastData: Sync started for profile ${p.profileId}`,
            log_type: "info",
          });
          const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");
          const pastSyncObj = {
            configId: p.configId,
            profileId: p.profileId,
            startDate: p.startDate,
            endDate: p.endDate,
            dates: getDatesBetween(p.startDate, p.endDate)
          }

          let getCronData = await cronJobHistorySchema.findOneAndUpdate(
            {
              configId: p.configId,
              profileId: p.profileId,
              cronName: "Sync Past Data",
              historyDate: currentDate,
            },
            {
              $set: {
                status: "PENDING",
              }
            },
            { new: true, upsert: true }
          ).lean();

          if (p.sync == "N") {
            await cronListCampaignsFromAmazon(pastSyncObj);
            await cronListAdGroupsFromAmazon(pastSyncObj);
            await cronListTargetingFromAmazon(pastSyncObj);
            await cronListProductAdsFromAmazon(pastSyncObj);
            await cronListProductFromAmazon(pastSyncObj);

            cron_logs({
              message: `SyncPastData: Listing completed for profile ${p.profileId}`,
              log_type: "info",
            });

            await newProfileSyncSchema.findOneAndUpdate(
              {
                profileId: pastSyncObj.profileId,
                configId: pastSyncObj.configId
              },
              {
                $set: { sync: "P" }
              },
              { new: true, upsert: true }
            ).lean();

          }

          await cronGenerateCampaignReport(false, false, pastSyncObj);
          await cronGenerateAdGroupReport(false, false, pastSyncObj);
          await cronGenerateTargetingReport(false, false, pastSyncObj);
          await cronGenerateAdProductReport(false, false, pastSyncObj);
          await cronGeneratePlacementReport(false, false, pastSyncObj);
          await cronGenerateSearchTermReport(false, false, pastSyncObj);

          if (getCronData?._id) {
            await cronJobHistorySchema.findByIdAndUpdate(
              getCronData._id,
              { status: "COMPLETED" },
              { new: true, upsert: true }
            );
          }

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

          cron_logs({
            message: `SyncPastData: Step ${p.sync} completed for profile ${p.profileId}`,
            log_type: "info",
          });

        }
        else {
          await newProfileSyncSchema.findByIdAndUpdate(
            { _id: p._id },
            { sync: "C" },
            { new: true, upsert: true }
          );
        }

      }))
    );

    return cron_logs({
      message: `Sync Pass Data runs successfully`,
      log_type: "info",
    });

  } catch (error) {
    return cron_logs({
      message: `SyncPastData - Error: ${error}`,
      log_type: "error",
    });
  }
}

exports.manageSubscribeAMS = async (req, res) => {
  try {
    const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
    const { profileId, datasets } = req.body;

    const existingSubs = await amsSubscriptionSchema.find({ ...(configId && { configId }), profileId }).lean();
    const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
    const checkConfigAds = await getAccessToken(configId);

    const existingMap = new Map(existingSubs.map((s) => [s.dataset, s]));

    const bulkOps = [];

    const result = { subscribed: [], archived: [], failed: [] };

    // ---------------- SUBSCRIBE ----------------
    for (const dataset of datasets) {
      const existing = existingMap.get(dataset);
      if (existing && existing.status === "ACTIVE") continue;

      try {
        const sqsArn = getSqsByAmazonUrl(profile?.amazonUrl, "sqsArn");
        const region = getSqsByAmazonUrl(profile?.amazonUrl, "region");
        const clientRequestToken = generateUnique();

        const amazonRes = await subscribeAmsDataset({ profile, checkConfigAds, clientRequestToken, dataset, sqsArn });

        if (!amazonRes.success) {
          const errorMsg = typeof amazonRes.error === "object" ? (amazonRes.error?.message || JSON.stringify(amazonRes.error)) : String(amazonRes.error || "Subscribe failed");
          throw new Error(errorMsg);
        }

        bulkOps.push({
          updateOne: {
            filter: { configId, profileId, dataset, status: "ACTIVE", },
            update: {
              $set: {
                region,
                sqsArn,
                subscriptionId: amazonRes.subscriptionId,
                clientRequestToken,
              },
            },
            upsert: true,
          },
        });

        result.subscribed.push(dataset);
      } catch (err) {
        const errMsg = typeof err?.message === "object" ? (err.message?.message || JSON.stringify(err.message)) : (err?.message || String(err));
        write_logs({ message: `[manageSubscribeAMS Error] ${errMsg} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        result.failed.push({
          dataset,
          action: "SUBSCRIBE",
          reason: errMsg,
        });
      }
    }

    // ---------------- ARCHIVE ----------------
    for (const sub of existingSubs) {
      if (!datasets.includes(sub.dataset) && sub.status === "ACTIVE") {
        try {
          if (!sub?.subscriptionId) {
            bulkOps.push({
              updateOne: {
                filter: { _id: sub._id },
                update: { $set: { status: "ARCHIVED" } },
              },
            });
            result.archived.push(sub.dataset);
            continue;
          }

          const amazonRes = await archiveAmsSubscription({ subscriptionId: sub?.subscriptionId, profile, checkConfigAds });

          if (!amazonRes.success) {
            const errorMsg = typeof amazonRes.error === "object" ? (amazonRes.error?.message || JSON.stringify(amazonRes.error)) : String(amazonRes.error || "Archive failed");
            throw new Error(errorMsg);
          }

          bulkOps.push({
            updateOne: {
              filter: { _id: sub._id },
              update: { $set: { status: "ARCHIVED" } },
            },
          });

          result.archived.push(sub.dataset);
        } catch (err) {
          const errMsg = typeof err?.message === "object" ? (err.message?.message || JSON.stringify(err.message)) : (err?.message || String(err));
          write_logs({ message: `[manageSubscribeAMS Error] ${errMsg} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
          result.failed.push({
            dataset: sub.dataset,
            action: "ARCHIVE",
            reason: errMsg,
          });
        }
      }
    }

    if (bulkOps.length) {
      await amsSubscriptionSchema.bulkWrite(bulkOps);
    }

    // ---------------- RESPONSE LOGIC ----------------
    if (result.failed.length > 0 && (result.subscribed.length || result.archived.length)) {
      await logAudit("SELLER_CONFIG_SUBSCRIPTIONS", "Some subscriptions failed", { datasets, ...result }, req?.user?.id);
      return res.status(203).json({
        isSuccess: false,
        partialSuccess: true,
        message: "Some subscriptions failed",
        result,
      });
    }

    if (result.failed.length > 0) {
      await logAudit("SELLER_CONFIG_SUBSCRIPTIONS", "All subscription actions failed", { datasets, ...result }, req?.user?.id);
      return res.status(203).json({
        isSuccess: false,
        message: "All subscription actions failed",
        result,
      });
    }

    await logAudit("SELLER_CONFIG_SUBSCRIPTIONS", `${result.subscribed.length} datasets subscribed and ${result.archived.length} datasets archived successfully.`, { datasets }, req?.user?.id);

    return res.status(200).json({
      isSuccess: true,
      message: "Subscription updated successfully",
      result,
    });
  } catch (error) {
    write_logs({ message: `[manageSubscribeAMS Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Failed to manage subscription",
    });
  }
};

exports.cronDisconnectReminder = async () => {
  cron_logs({
    message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} Disconnect Reminder`,
    log_type: "info",
  });

  try {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const disconnectedConfigs = await configSchema.find({
      isActive: false,
      disconnectedAt: { $ne: null, $gt: cutoffDate },
    }).lean();

    if (!disconnectedConfigs.length) {
      return cron_logs({ message: "No disconnected accounts in retention window", log_type: "info" });
    }

    for (const config of disconnectedConfigs) {
      try {
        const userAccess = await profileBasedPermissionSchema.findOne({ configId: config._id }).lean();
        if (!userAccess) continue;

        const user = await userSchema.findById(userAccess.userId).lean();
        if (!user?.email) continue;

        // Calculate days remaining until purge
        const purgeDate = new Date(config.disconnectedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((purgeDate - Date.now()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0) continue; // Will be handled by purge cron

        // Find profile names
        const profiles = await profileSchema.find({ configId: config._id }).lean();
        const profileNames = profiles.map(p => p.name).filter(Boolean).join(", ");

        await sendEmailHelper(
          user.email,
          `⚠️ Your Ads data will be deleted in ${daysLeft} days — AdvertiseIQ`,
          buildDisconnectReminderEmail({
            userName: user.fullName,
            profileNames: profileNames || "Your linked Ads profiles",
            daysLeft,
            purgeDate: purgeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
            signInUrl: process?.env?.BASE_URL,
            type: "ads",
          })
        );

        cron_logs({
          message: `Ads reminder sent to ${user.email} — ${daysLeft} days left for configId=${config._id}`,
          log_type: "info",
        });

      } catch (innerErr) {
        cron_logs({
          message: `Ads reminder failed for configId=${config._id}: ${innerErr.message}`,
          log_type: "error",
        });
      }
    }

    /* -------------------- 2. SP DISCONNECT REMINDERS -------------------- */
    const disconnectedSellerConfigs = await sellerConfigSchema.find({
      isActive: false,
      disconnectedAt: { $ne: null, $gt: cutoffDate },
    }).lean();

    for (const sellerConfig of disconnectedSellerConfigs) {
      try {
        const userAccess = await profileBasedPermissionSchema.findOne({ configId: sellerConfig.configId, profileId: sellerConfig.profileId }).lean();
        if (!userAccess) continue;

        const user = await userSchema.findById(userAccess.userId).lean();
        if (!user?.email) continue;

        const purgeDate = new Date(sellerConfig.disconnectedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((purgeDate - Date.now()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0) continue;

        const profiles = await profileSchema.find({ configId: sellerConfig?.configId, profileId: sellerConfig.profileId }).lean();
        const profileNames = profiles.map(p => p.name).filter(Boolean).join(", ");

        await sendEmailHelper(
          user.email,
          `⚠️ Your SP-API seller data will be deleted in ${daysLeft} days — AdvertiseIQ`,
          buildDisconnectReminderEmail({
            userName: user.fullName,
            profileNames: profileNames || "Your linked Seller profiles",
            daysLeft,
            purgeDate: purgeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
            signInUrl: process?.env?.BASE_URL,
            type: "sp",
          })
        );

        cron_logs({
          message: `SP reminder sent to ${user.email} — ${daysLeft} days left for sellerConfigId=${sellerConfig._id}`,
          log_type: "info",
        });

      } catch (innerErr) {
        cron_logs({
          message: `SP reminder failed for sellerConfigId=${sellerConfig._id}: ${innerErr.message}`,
          log_type: "error",
        });
      }
    }

    cron_logs({ message: "Disconnect Reminder check completed", log_type: "info" });

  } catch (error) {
    cron_logs({ message: `Disconnect Reminder Main Error: ${error.message}`, log_type: "error" });
  }
};

exports.getAmazonProfiles = async (req, res) => {
  try {
    const { configId } = req.query;
    if (!configId) return res.status(400).json({ isSuccess: false, message: 'configId is required' });

    const checkConfigAds = await getAccessToken(configId);
    if (!checkConfigAds?.adsAccessToken) {
      return res.status(400).json({ isSuccess: false, message: 'Invalid Amazon Config' });
    }

    const [us, eu, fe] = await Promise.all([
      usProfiles(checkConfigAds, configId),
      euProfiles(checkConfigAds, configId),
      feProfiles(checkConfigAds, configId),
    ]);

    const fetchedProfiles = [...us, ...eu, ...fe].filter((p) => p?.profileId != 2371257842854194);

    const existingProfiles = await profileSchema.find({ configId }).lean();
    const existingProfileIds = new Set(existingProfiles.map((x) => x.profileId.toString()));

    const configDoc = await configSchema.findById(configId).lean();
    const activeSellerConfigs = await sellerConfigSchema.find({
      isActive: true,
      $or: [
        ...(configDoc?.organizationId ? [{ organizationId: configDoc.organizationId }] : []),
        { configId }
      ]
    }).lean();
    const activeSellerIds = activeSellerConfigs.map(s => s.sellerId).filter(Boolean);

    const profilesWithStatus = [];
    for (const p of fetchedProfiles) {
      const pAdvId = p.advertiserId || p.accountInfo?.id;
      const isSellerMatch = Boolean(pAdvId && activeSellerIds.some(sId => String(sId).trim().toLowerCase() === String(pAdvId).trim().toLowerCase()));

      profilesWithStatus.push({
        ...p,
        isStored: existingProfileIds.has(p.profileId.toString()),
        isSellerMatch
      });
    }

    return res.status(200).json({
      isSuccess: true,
      data: profilesWithStatus
    });
  } catch (error) {
    write_logs({ message: `[getAmazonProfiles Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({ isSuccess: false, message: 'Internal server error', errorMessage: error?.message });
  }
};

exports.saveAmazonProfiles = async (req, res) => {
  try {
    const { configId, selectedProfiles } = req.body;
    const userId = req.user._id;

    if (!configId || !selectedProfiles || !Array.isArray(selectedProfiles)) {
      return res.status(400).json({ isSuccess: false, message: 'configId and selectedProfiles array are required' });
    }

    const configDoc = await configSchema.findById(configId).lean();
    if (!configDoc) return res.status(404).json({ isSuccess: false, message: 'Config not found' });

    const orgId = configDoc.organizationId;
    const org = await organizationSchema.findById(orgId).populate('planId').lean();
    const profileLimit = org?.planId?.profileLimit || 0;

    const orgConfigs = await configSchema.find({ organizationId: orgId, isActive: { $ne: false } }).select('_id').lean();
    const orgConfigIds = orgConfigs.map(c => c._id);
    const existingActiveProfileIds = await profileSchema.distinct('profileId', {
      configId: { $in: orgConfigIds },
      isActive: true
    });
    const existingActiveSet = new Set(existingActiveProfileIds.map(id => String(id)));

    const incomingProfileIds = selectedProfiles.map(p => String(p.profileId));
    const newProfilesCount = incomingProfileIds.filter(id => !existingActiveSet.has(id)).length;

    if (existingActiveSet.size + newProfilesCount > profileLimit) {
      return res.status(400).json({ isSuccess: false, message: 'Profile limit exceeded. Please upgrade your plan.' });
    }

    const activeSellerConfigs = await sellerConfigSchema.find({
      isActive: true,
      $or: [
        ...(orgId ? [{ organizationId: orgId }] : []),
        { userId: userId },
        { configId: configId }
      ]
    }).lean();
    const activeSellerIds = activeSellerConfigs.map(s => s.sellerId).filter(Boolean);

    const profileBulkOps = selectedProfiles.map((p) => {
      const pAdvId = p?.advertiserId || p?.accountInfo?.id;
      const hasSellerIdMatch = Boolean(
        p?.isSellerMatch ||
        (pAdvId && activeSellerIds.some(sId => String(sId).trim() === String(pAdvId).trim()))
      );

      return {
        updateOne: {
          filter: { configId, profileId: p.profileId },
          update: {
            $set: {
              countryCode: p?.countryCode,
              currencyCode: p?.currencyCode,
              timezone: p?.timezone,
              marketplaceStringId: p?.marketplaceStringId,
              advertiserId: p?.advertiserId,
              type: p?.type,
              name: p?.name,
              amazonUrl: p?.amazonUrl,
              isActive: true,
              isAdsSyncEnabled: false,
              isSpSyncEnabled: hasSellerIdMatch ? true : false,
            },
          },
          upsert: true,
        },
      };
    });

    selectedProfiles.forEach(async (profile) => {
      clearProfileCache(profile?.configId?.toString(), profile?.profileId);
      clearActivePlanProfilesCache(profile?.profileId);
    });

    if (profileBulkOps.length > 0) {
      await profileSchema.bulkWrite(profileBulkOps);
    }

    const allCrons = await cronJobSchema.find().lean();
    for (const p of selectedProfiles) {
      try {
        const userAccess = new profileBasedPermissionSchema({ userId, organizationId: orgId, profileId: Number(p?.profileId), configId: configId, hasAccess: true });
        await userAccess.save();
      } catch (err) {
        write_logs({ message: `[saveAmazonProfiles Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      }

      allCrons.forEach(async (cron) => {
        await cronJobSchedularSchema.findOneAndUpdate(
          { configId, profileId: p.profileId, cronId: cron._id },
          { $set: { cronName: cron.cronName, timezone: p.timezone } },
          { new: true, upsert: true }
        ).lean();
      });
    }

    if (configDoc && Array.isArray(selectedProfiles) && selectedProfiles.length > 0) {
      const ownerConds = [];
      if (orgId) ownerConds.push({ organizationId: orgId });
      if (userId) ownerConds.push({ userId });

      const targetSellerConfigs = await sellerConfigSchema.find({
        isActive: true,
        $or: ownerConds,
        $or: [
          { profileId: null },
          { configId: null },
          { configId: configId }
        ]
      });

      for (const sCfg of targetSellerConfigs) {
        const matchingSelected = selectedProfiles.find((p) => {
          const pAdvId = p?.advertiserId || p?.accountInfo?.id;
          return sCfg.sellerId && pAdvId && String(pAdvId).trim() === String(sCfg.sellerId).trim();
        }) || selectedProfiles[0];

        if (matchingSelected) {
          sCfg.configId = configId;
          sCfg.profileId = Number(matchingSelected.profileId);
          if (!sCfg.sellerId && (matchingSelected.advertiserId || matchingSelected.accountInfo?.id)) {
            sCfg.sellerId = matchingSelected.advertiserId || matchingSelected.accountInfo?.id;
          }
          await sCfg.save();
        }
      }

      await linkSellerConfigWithAdsConfig(configDoc, userId, orgId);
    }

    return res.status(200).json({ isSuccess: true, message: 'Profiles saved successfully' });
  } catch (error) {
    write_logs({ message: `[saveAmazonProfiles Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({ isSuccess: false, message: 'Internal server error', errorMessage: error?.message });
  }
};

exports.getReportDetails = async (req, res) => {
  try {
    const list = await reportDetailsSchema.find({}).sort({ createdAt: -1 });
    return res.status(200).send({
      isSuccess: true,
      message: "Report details fetched successfully",
      data: list,
    });
  } catch (error) {
    write_logs({ message: `[getReportDetails Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: error.message || "Failed to fetch report details",
    });
  }
};

exports.getCoreGroups = async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { isActive: true, ...(type && { type }) };
    const list = await coreGroupSchema.find(filter).sort({ displayOrder: 1, createdAt: 1 });
    return res.status(200).send({
      isSuccess: true,
      message: "Core groups fetched successfully",
      data: list,
    });
  } catch (error) {
    write_logs({ message: `[getCoreGroups Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: error.message || "Failed to fetch core groups",
    });
  }
};

exports.saveSynchronizationDetails = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { configId, profileId, items, type } = req.body;
    const syncType = type === "seller" ? "seller" : "ads";

    if (!configId || !profileId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).send({
        isSuccess: false,
        message: "Missing configId, profileId, or group items",
      });
    }

    // Check if synchronization is currently IN_PROGRESS
    const activeSync = await synchronizeDetailsSchema.findOne({
      profileId: Number(profileId),
      configId,
      type: syncType,
      requestStatus: "IN_PROGRESS"
    }).lean();

    if (activeSync) {
      return res.status(400).send({
        isSuccess: false,
        message: "Synchronization is currently in progress. You cannot modify sync settings until sync completes.",
      });
    }

    const recordsToInsert = items.map((item) => ({
      userId,
      configId,
      profileId: Number(profileId),
      groupId: item.groupId || item.id,
      selectedSyncDays: Number(item.selectedSyncDays || item.days),
      type: syncType,
      requestStatus: "PENDING",
      syncRequestTime: new Date(),
    }));

    await synchronizeDetailsSchema.deleteMany({ configId, profileId: Number(profileId), type: syncType });
    const inserted = await synchronizeDetailsSchema.insertMany(recordsToInsert);

    return res.status(200).send({
      isSuccess: true,
      message: "Group synchronization settings saved successfully",
      data: inserted,
    });
  } catch (error) {
    write_logs({ message: `[saveSynchronizationDetails Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: error.message || "Failed to save synchronization settings",
    });
  }
};

exports.getSyncRequests = async (req, res) => {
  try {
    let list;
    try {
      list = await synchronizeDetailsSchema.find({})
        .populate("userId", "fullName email")
        .populate("configId", "companyName adsClientId")
        .sort({ createdAt: -1 })
        .lean();
    } catch (err) {
      write_logs({ message: `[getSyncRequests Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      list = await synchronizeDetailsSchema.find({}).sort({ createdAt: -1 }).lean();
    }

    return res.status(200).send({
      isSuccess: true,
      message: "Synchronization requests fetched successfully",
      data: list,
    });
  } catch (error) {
    write_logs({ message: `[getSyncRequests Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: error.message || "Failed to fetch sync requests",
    });
  }
};

exports.executeSync = async (req, res) => {
  try {
    const { syncIds, configId, profileId, type } = req.body;

    if (Array.isArray(syncIds) && syncIds.length > 0) {
      await synchronizeDetailsSchema.updateMany(
        { _id: { $in: syncIds } },
        { $set: { requestStatus: "COMPLETED", updatedAt: new Date() } }
      );
      const syncRecords = await synchronizeDetailsSchema.find({ _id: { $in: syncIds } }).lean();
      for (const rec of syncRecords) {
        if (rec.profileId) {
          const recType = rec.type || "ads";
          const updateObj = { isActive: true };
          if (recType === "seller") {
            updateObj.isSpSyncEnabled = true;
          } else {
            updateObj.isAdsSyncEnabled = true;
          }
          await profileSchema.updateOne(
            { profileId: rec.profileId, ...(rec.configId && { configId: rec.configId }) },
            { $set: updateObj }
          );
          clearProfileCache(rec.configId?.toString(), rec.profileId);
          clearActivePlanProfilesCache(rec.profileId);
        }
      }
    } else if (configId && profileId) {
      const syncType = type === "seller" ? "seller" : "ads";
      await synchronizeDetailsSchema.updateMany(
        { configId, profileId, ...(type && { type }) },
        { $set: { requestStatus: "COMPLETED", updatedAt: new Date() } }
      );
      const updateObj = { isActive: true };
      if (syncType === "seller") {
        updateObj.isSpSyncEnabled = true;
      } else {
        updateObj.isAdsSyncEnabled = true;
      }
      await profileSchema.updateOne(
        { configId, profileId: Number(profileId) },
        { $set: updateObj }
      );
      clearProfileCache(configId?.toString(), Number(profileId));
      clearActivePlanProfilesCache(Number(profileId));
    }

    return res.status(200).send({
      isSuccess: true,
      message: "Synchronization executed successfully",
    });
  } catch (error) {
    write_logs({ message: `[executeSync Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: error.message || "Failed to execute sync",
    });
  }
};

exports.updateProfileSyncSettings = async (req, res) => {
  try {
    const { profileId, configId, isAdsSyncEnabled, isSpSyncEnabled } = req.body;

    if (!profileId) {
      return res.status(400).send({
        isSuccess: false,
        message: "Missing profileId",
      });
    }

    // Check if synchronization is currently IN_PROGRESS
    const activeSync = await synchronizeDetailsSchema.findOne({
      profileId: Number(profileId),
      ...(configId && { configId }),
      requestStatus: "IN_PROGRESS"
    }).lean();

    if (activeSync) {
      return res.status(400).send({
        isSuccess: false,
        message: "Synchronization is currently in progress. You cannot modify sync settings until sync completes.",
      });
    }

    const updateFields = {};
    if (typeof isAdsSyncEnabled === "boolean") {
      updateFields.isAdsSyncEnabled = isAdsSyncEnabled;
    }
    if (typeof isSpSyncEnabled === "boolean") {
      updateFields.isSpSyncEnabled = isSpSyncEnabled;
    }

    await profileSchema.updateOne(
      { profileId: Number(profileId), ...(configId && { configId }) },
      { $set: updateFields }
    );

    if (configId) {
      clearProfileCache(configId.toString(), Number(profileId));
    }
    clearActivePlanProfilesCache(Number(profileId));

    return res.status(200).send({
      isSuccess: true,
      message: "Profile synchronization settings updated successfully",
    });
  } catch (error) {
    write_logs({ message: `[updateProfileSyncSettings Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: error.message || "Failed to update profile sync settings",
    });
  }
};

exports.getRetentionDays = async (req, res) => {
  try {
    const list = await retentionSchema.find({ isActive: true }).sort({ days: 1 });
    return res.status(200).send({
      isSuccess: true,
      message: "Retention days fetched successfully",
      data: list,
    });
  } catch (error) {
    write_logs({ message: `[getRetentionDays Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: error.message || "Failed to fetch retention days",
    });
  }
};

exports.getProfileSyncDetails = async (req, res) => {
  try {
    const { configId } = req.query;
    if (!configId) {
      return res.status(400).send({
        isSuccess: false,
        message: "Missing configId",
      });
    }

    const [records, profiles] = await Promise.all([
      synchronizeDetailsSchema.find({ configId }).lean(),
      profileSchema.find({ configId }, { profileId: 1, isAdsSyncEnabled: 1, isSpSyncEnabled: 1 }).lean(),
    ]);

    const profileMap = {};
    (profiles || []).forEach((p) => {
      if (p.profileId) {
        profileMap[String(p.profileId)] = p.isAdsSyncEnabled !== undefined ? p.isAdsSyncEnabled : true;
      }
    });

    const updatedRecords = (records || []).map((r) => ({
      ...r,
      isAdsSyncEnabled: profileMap[String(r.profileId)] !== undefined ? profileMap[String(r.profileId)] : true,
    }));

    return res.status(200).send({
      isSuccess: true,
      message: "Profile sync details fetched successfully",
      data: updatedRecords || [],
      profiles: profiles || [],
    });
  } catch (error) {
    write_logs({ message: `[getProfileSyncDetails Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: error.message || "Failed to fetch profile sync details",
    });
  }
};

/**
 * Link an existing connected Ads account (configId) with the current Seller account (sellerConfig)
 */
exports.linkExistingSellerConfig = async (req, res) => {
  try {
    const { configId, profileId: reqProfileId } = req.body;
    const userId = req.user._id;
    const organizationId = req.organizationId || req.user.organizationId;

    if (!configId) {
      return res.status(400).json({ isSuccess: false, message: "configId is required" });
    }

    const configDoc = await configSchema.findById(configId).lean();
    if (!configDoc) {
      return res.status(404).json({ isSuccess: false, message: "Ads config not found" });
    }

    const dbProfiles = await profileSchema.find({ configId }).lean();
    let apiProfiles = [];
    try {
      const checkConfigAds = await getAccessToken(configId);
      if (checkConfigAds?.adsAccessToken) {
        const [us, eu, fe] = await Promise.all([
          usProfiles(checkConfigAds, configId),
          euProfiles(checkConfigAds, configId),
          feProfiles(checkConfigAds, configId),
        ]);
        apiProfiles = [...us, ...eu, ...fe].filter((p) => p?.profileId);
      }
    } catch (err) {
      console.error("[linkExistingSellerConfig] Error fetching profiles:", err);
    }

    const allProfiles = [...apiProfiles];
    for (const dbP of dbProfiles) {
      if (!allProfiles.some((p) => String(p.profileId) === String(dbP.profileId))) {
        allProfiles.push({
          profileId: dbP.profileId,
          advertiserId: dbP.advertiserId,
          type: dbP.type,
          accountInfo: { id: dbP.advertiserId, type: dbP.type }
        });
      }
    }

    const ownerConditions = [];
    if (organizationId) ownerConditions.push({ organizationId });
    if (userId) ownerConditions.push({ userId });
    ownerConditions.push({ organizationId: null });

    const queryFilter = {
      isActive: true,
      $or: ownerConditions,
      $and: [
        {
          $or: [
            { configId: null },
            { profileId: null },
            { configId: configId }
          ]
        }
      ]
    };

    let sellerConfigs = await sellerConfigSchema.find(queryFilter);
    if (!sellerConfigs || sellerConfigs.length === 0) {
      let targetProfile = allProfiles.find(p => reqProfileId && String(p.profileId) === String(reqProfileId)) || allProfiles.find(p => p.type === "seller" || p?.accountInfo?.type === "seller") || allProfiles[0];
      const newSellerConfig = await sellerConfigSchema.create({
        userId,
        organizationId,
        configId,
        profileId: targetProfile ? Number(targetProfile.profileId) : (reqProfileId ? Number(reqProfileId) : null),
        sellerId: targetProfile?.advertiserId || targetProfile?.accountInfo?.id || null,
        isActive: true,
      });

      return res.status(200).json({
        isSuccess: true,
        message: "Seller account linked with existing Ads account successfully",
        data: newSellerConfig,
      });
    }

    for (const sellerConfig of sellerConfigs) {
      let matchingProfile = null;
      if (reqProfileId) {
        matchingProfile = allProfiles.find(p => String(p.profileId) === String(reqProfileId));
      }

      if (!matchingProfile && sellerConfig.sellerId) {
        matchingProfile = allProfiles.find((p) => {
          const profSellerId = p?.advertiserId || p?.accountInfo?.id;
          return profSellerId && String(profSellerId).trim() === String(sellerConfig.sellerId).trim();
        });
      }

      if (!matchingProfile && !sellerConfig.sellerId && allProfiles.length > 0) {
        matchingProfile = allProfiles.find((p) => p?.type === "seller" || p?.accountInfo?.type === "seller") || allProfiles[0];
      }

      if (matchingProfile || reqProfileId) {
        sellerConfig.configId = configId;
        if (organizationId) sellerConfig.organizationId = organizationId;

        if (matchingProfile) {
          sellerConfig.profileId = Number(matchingProfile.profileId);
          const retrievedSellerId = matchingProfile.advertiserId || matchingProfile.accountInfo?.id;
          if (retrievedSellerId) {
            sellerConfig.sellerId = retrievedSellerId;
          }
        } else if (reqProfileId) {
          sellerConfig.profileId = Number(reqProfileId);
        }

        sellerConfig.isActive = true;
        await sellerConfig.save();
      }
    }

    await auditLogSchema.create({
      userId,
      configId,
      event: "SELLER_CONFIG_LINK_EXISTING",
      message: `Seller account linked to existing Ads config "${configDoc.companyName}"`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { configId, companyName: configDoc.companyName, status: "SUCCESS" }
    });

    return res.status(200).json({
      isSuccess: true,
      message: "Seller account linked with existing Ads account successfully",
    });
  } catch (error) {
    write_logs({ message: `[linkExistingSellerConfig Error] ${error?.message || error}`, log_type: "error" });
    return res.status(500).json({ isSuccess: false, message: "Internal server error", errorMessage: error?.message });
  }
};

exports.confirmDeactivateProfile = async (req, res) => {
  try {
    const { profileId, configId, type = "all" } = req.body;
    const { _id: userId } = req?.user ?? {};

    if (!profileId) {
      return res.status(400).json({
        isSuccess: false,
        message: "profileId is required",
      });
    }

    const numProfileId = Number(profileId);
    const profile = await profileSchema.findOne({
      profileId: numProfileId,
      ...(configId && { configId }),
    });

    if (!profile) {
      return res.status(404).json({
        isSuccess: false,
        message: "Profile not found",
      });
    }

    const now = new Date();

    if (type === "sp" || type === "all") {
      await sellerConfigSchema.updateOne(
        { profileId: numProfileId, ...(configId && { configId }) },
        { $set: { isActive: false, disconnectedAt: now } }
      );
      profile.isSpSyncEnabled = false;
      if (profile.configId) {
        await clearSPAccessTokenCache(profile.configId.toString(), numProfileId).catch(() => {});
      }
    }

    if (type === "ads" || type === "all") {
      profile.isAdsSyncEnabled = false;
      const otherActiveAds = await profileSchema.countDocuments({
        configId: profile.configId,
        profileId: { $ne: numProfileId },
        isActive: true,
        isAdsSyncEnabled: true,
      });
      if (otherActiveAds === 0 && profile.configId) {
        await configSchema.updateOne(
          { _id: profile.configId },
          { $set: { isActive: false, disconnectedAt: now } }
        );
        await clearAccessTokenCache(profile.configId.toString()).catch(() => {});
      }
    }

    if (type === "all" || (!profile.isAdsSyncEnabled && !profile.isSpSyncEnabled)) {
      profile.isActive = false;
    }

    await profile.save();

    if (profile.configId) {
      await clearProfileCache(profile.configId.toString(), numProfileId).catch(() => {});
    }
    await clearActivePlanProfilesCache(numProfileId).catch(() => {});

    await auditLogSchema.create({
      userId,
      configId: profile.configId,
      event: "CONFIRM_DEACTIVATE_PROFILE",
      message: `Profile ${profile.name} (${numProfileId}) permanently deactivated/closed by user`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { profileId: numProfileId, type, deactivatedAt: now },
    }).catch(() => {});

    return res.status(200).json({
      isSuccess: true,
      message: "Profile deactivated successfully",
      data: profile,
    });
  } catch (error) {
    write_logs({ message: `[confirmDeactivateProfile Error] ${error?.message || error}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Failed to deactivate profile",
    });
  }
};
