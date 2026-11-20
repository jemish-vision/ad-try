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
const { writeAuditEvent } = require("../helpers/auditHelper");
const organizationSchema = require("../models/organization.model");
const reportDetailsSchema = require("../models/reportDetails.model");
const synchronizeDetailsSchema = require("../models/synchronizeDetails.model");
const retentionSchema = require("../models/retention.model");
const coreGroupSchema = require("../models/coreGroup.model");
const CRON_JOBS = require("../../worker-service/cronJobs.enum");
const { historicalReportFilter } = require("../helper/historicalSyncReports");

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
const { notifyNewSellerConnection } = require("../helper/sellerNotification.helper");
const { cronDeleteExpiredAccountsData } = require("../services/accountDataCleanup.service");
const { ROLES } = require("../constants/roles");
const amazonAxios = require("../helper/amazonAxios");
const { sellerOwnerScope, sameSeller } = require("../helper/sellerConnectionScope");

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
          $and: [
            { $or: [{ isAdsActive: true }, { isSpActive: true }] },
            ...(matchOrgId ? [{
              $or: [
                { "config.organizationId": matchOrgId },
                { "config.organizationId": null },
                { "config.organizationId": { $exists: false } },
              ]
            }] : []),
          ],
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

    const mockConfigId = new mongoose.Types.ObjectId("000000000000000000000001");
    const demoAccountDoc = {
      _id: mockConfigId,
      configId: mockConfigId,
      config: { companyName: "ApexGear Demo Account (Mock)" },
      isDemoAccount: true,
      profiles: [
        {
          _id: new mongoose.Types.ObjectId("000000000000000000000002"),
          profileId: 99999901,
          countryCode: "US",
          currencyCode: "USD",
          name: "ApexGear US Store (Mock)",
          type: "seller",
          advertiserId: "MOCK-ADV-01",
          isFavorite: !getProfiles?.length,
          isAdsSyncEnabled: true,
          isSpSyncEnabled: true,
          isAdsActive: true,
          isSpActive: true,
          isSpConfigured: true,
          isDemoProfile: true,
        },
      ],
    };

    // Only include Demo Account when user is in Mock Mode
    if (req.user?.isMockUser) {
      return res.status(200).send({
        isSuccess: true,
        message: "Profiles list successfully.",
        data: [demoAccountDoc, ...(getProfiles || [])],
      });
    }

    // Normal mode: return only the user's real connected profiles
    return res.status(200).send({
      isSuccess: true,
      message: "Profiles list successfully.",
      data: getProfiles || [],
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

async function fetchRegionalAdsProfiles(ads, configId, endpoint, region, strict = false) {
  try {
    const { data } = await amazonAxios({
      method: "GET",
      url: `${endpoint}/v2/profiles`,
      headers: {
        "Amazon-Advertising-API-ClientId": ads.adsClientId,
        Authorization: `Bearer ${ads.adsAccessToken}`,
      },
      meta: { configId, tokenKey: "adsAccessToken" },
    });
    if (!Array.isArray(data)) throw new Error("Unexpected Amazon Ads profiles response");
    return data.filter(item => item?.profileId && item.accountInfo).map(item => ({
      configId,
      profileId: item.profileId,
      countryCode: item.countryCode,
      currencyCode: item.currencyCode,
      timezone: item.timezone,
      marketplaceStringId: item.accountInfo.marketplaceStringId,
      advertiserId: item.accountInfo.id,
      type: item.accountInfo.type,
      name: item.accountInfo.name,
      amazonUrl: endpoint,
    }));
  } catch (error) {
    write_logs({ message: `[Ads profiles] region=${region} status=${error.response?.status || "unavailable"}`, log_type: "warning" });
    if (strict) throw error;
    return [];
  }
}

const usProfiles = (ads, configId, strict) =>
  fetchRegionalAdsProfiles(ads, configId, process.env.ROOT_LINK, "US", strict);
const euProfiles = (ads, configId, strict) =>
  fetchRegionalAdsProfiles(ads, configId, process.env.EU_ROOT_LINK, "EU", strict);
const feProfiles = (ads, configId, strict) =>
  fetchRegionalAdsProfiles(ads, configId, process.env.FE_ROOT_LINK, "FE", strict);

async function fetchOnboardingAdsProfiles(configId) {
  const ads = await getAccessToken(configId);
  if (!ads?.adsAccessToken) throw new Error("Reconnect Amazon Ads to load its profiles");
  const regions = await Promise.allSettled(
    [usProfiles, euProfiles, feProfiles].map(fetch => fetch(ads, configId, true))
  );
  const available = regions.filter(result => result.status === "fulfilled");
  if (!available.length) throw new Error("Amazon Ads did not return profiles from any region. Try again or reconnect Amazon Ads.");
  return available.flatMap(result => result.value).filter(profile => String(profile.profileId) !== "2371257842854194");
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
    if (reconnect && configId) {
      const existing = await configSchema.findById(configId).lean();
      if (!existing || !canManageAdsConfig(req, existing)) {
        return res.status(403).json({ isSuccess: false, message: "You cannot reconnect this Ads account" });
      }
    }

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
    const redirectUrl = `${process.env.BASE_URL.replace(/\/+$/, "")}/api/config/amazonCallback`;
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
async function linkSellerConfigWithAdsConfig(config, userId, organizationId, profiles) {
  const configId = config?._id;
  const orgId = organizationId || config?.organizationId;
  const owner = sellerOwnerScope(orgId, userId);
  if (!configId || !owner || !profiles?.length) return 0;

  let linked = 0;
  for (const profile of profiles) {
    const sellerId = profile.advertiserId || profile.accountInfo?.id;
    const profileId = Number(profile.profileId);
    if (!sellerId || !profileId || (profile.type || profile.accountInfo?.type) !== "seller") continue;
    const connection = await sellerConfigSchema.findOneAndUpdate({
      $and: [
        owner,
        { $or: [{ configId: null }, { configId }] },
        { $or: [{ profileId: null }, { profileId }] },
      ],
      sellerId: String(sellerId).trim(),
      isActive: true,
      spRefreshToken: { $type: "string", $ne: "" },
    }, {
      $set: { configId, profileId, organizationId: orgId || null },
    }, { sort: { updatedAt: -1 } });
    if (connection) linked++;
  }
  return linked;
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
      await writeAuditEvent({ req,
        userId: authState.userId,
        event: "CSRF_ATTEMPT_INVALID", outcome: "FAILURE",
        message: "Amazon OAuth state already used",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { status: "FAILED" }
      });

      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("State already used. Please initiate a new connection.")}`);
    }

    if (new Date() > authState.expiresAt) {
      await writeAuditEvent({ req,
        userId: authState.userId,
        event: "CSRF_ATTEMPT_EXPIRE", outcome: "FAILURE",
        message: "Amazon OAuth state expired",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { expiresAt: authState.expiresAt, status: "FAILED" }
      });

      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Authorization session expired. Please try again.")}`);
    }

    /* ------------------- Check state type (SP vs ADS) ---------------------- */
    if (authState.type === "SP") {
      if (authState.profileId) {
        return completeProfileSellerOAuth(req, res, "amazonCallback");
      }
      const finalSellerId = selling_partner_id || authState.sellerId;
      if (!finalSellerId) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Amazon Seller ID (Merchant ID) not received")}`);
      }

      /* Validate selling_partner_id match if both provided */
      if (authState.sellerId && selling_partner_id && authState.sellerId !== selling_partner_id) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Selling Partner ID mismatch")}`);
      }

      const claimed = await tempStateConfigSchema.updateOne(
        { _id: authState._id, isUsed: { $ne: true }, expiresAt: { $gt: new Date() } },
        { $set: { isUsed: true } }
      );
      if (!claimed.modifiedCount) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Authorization session expired or was already used. Start a new connection.")}`);
      }

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
      const owner = sellerOwnerScope(organizationId, userId);
      if (!owner) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=Seller%20account%20owner%20not%20found`);
      }
      const sellerConfigQuery = { ...owner, sellerId: finalSellerId };
      let sellerConfig = await sellerConfigSchema.findOne(sellerConfigQuery).sort({ updatedAt: -1 });

      const isBrandNewSeller = !sellerConfig || !sellerConfig.newConnectionEmailSentAt;

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
        sellerConfig.deletionReminder15SentAt = null;
        sellerConfig.deletionReminder1SentAt = null;
        sellerConfig.isDataDeletionStopped = false;
        sellerConfig.deletionReminder15SentAt = null;
        sellerConfig.deletionReminder1SentAt = null;
        sellerConfig.isDataDeletionStopped = false;
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

      if (isBrandNewSeller) {
        await notifyNewSellerConnection({
          sellerId: finalSellerId,
          userId: userId || authState.userId,
          organizationId: organizationId || authState.organizationId,
          source: "Amazon Selling Partner Appstore",
          req,
        });
        sellerConfig.newConnectionEmailSentAt = new Date();
        await sellerConfig.save();
      }

      await writeAuditEvent({ req,
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
    const claimed = await tempStateConfigSchema.updateOne(
      { _id: authState._id, isUsed: { $ne: true }, expiresAt: { $gt: new Date() } },
      { $set: { isUsed: true } }
    );
    if (!claimed.modifiedCount) {
      return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Authorization session expired or was already used. Start a new connection.")}`);
    }

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
          redirect_uri: `${process.env.BASE_URL.replace(/\/+$/, "")}/api/config/amazonCallback`,
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

      if (!config || String(config.organizationId || "") !== String(organizationId || "")) {
        return res.redirect(`${frontendUrl}/settings?status=error&message=${encodeURIComponent("Config record to reconnect was not found")}`);
      }

      config.adsAccessToken = access_token;
      config.adsRefressToken = refresh_token;
      config.adsTokenUpdatedAt = new Date();
      config.tokenExpire = expires_in;
      config.adsTokenExpiresAt = tokenExpiresAt;
      config.isActive = true;
      config.disconnectedAt = null;
      config.deletionReminder15SentAt = null;
      config.deletionReminder1SentAt = null;
      config.isDataDeletionStopped = false;
      if (organizationId) config.organizationId = organizationId;
      await config.save();
      await seedAccessToken({ kind: "ads", configId: config._id, accessToken: access_token, expiresIn: expires_in });
      await clearAccessTokenCache(config._id).catch((err) => { write_logs({ message: "[amazonCallback Silent Error] " + (err?.message || err), log_type: "error" }); });

      await writeAuditEvent({ req,
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

      await writeAuditEvent({ req,
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

const sellerCentralDomains = {
  US: "sellercentral.amazon.com",
  CA: "sellercentral.amazon.ca",
  MX: "sellercentral.amazon.com.mx",
  BR: "sellercentral.amazon.com.br",
  IE: "sellercentral.amazon.ie",
  UK: "sellercentral-europe.amazon.com",
  GB: "sellercentral-europe.amazon.com",
  FR: "sellercentral-europe.amazon.com",
  DE: "sellercentral-europe.amazon.com",
  IT: "sellercentral-europe.amazon.com",
  ES: "sellercentral-europe.amazon.com",
  BE: "sellercentral.amazon.com.be",
  NL: "sellercentral.amazon.nl",
  SE: "sellercentral.amazon.se",
  ZA: "sellercentral.amazon.co.za",
  PL: "sellercentral.amazon.pl",
  EG: "sellercentral.amazon.eg",
  TR: "sellercentral.amazon.com.tr",
  SA: "sellercentral.amazon.sa",
  AE: "sellercentral.amazon.ae",
  IN: "sellercentral.amazon.in",
  SG: "sellercentral.amazon.sg",
  AU: "sellercentral.amazon.com.au",
  JP: "sellercentral.amazon.co.jp",
};

exports.amazonSPRedirect = async (req, res) => {
  try {
    const { profileId } = req.body;
    const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
    const userId = req.user?._id;
    const clientId = process.env.AMAZON_SP_CLIENT_ID;
    const clientSecret = process.env.AMAZON_SP_CLIENT_SECRET;
    const appId = process.env.AMAZON_SP_APP_ID;

    /* ---------------------------- VALIDATION ---------------------------- */
    if (!mongoose.isValidObjectId(configId) || !Number.isSafeInteger(Number(profileId)) || Number(profileId) <= 0) {
      return res.status(400).json({ isSuccess: false, message: "Save an Ads profile before connecting Seller Central" });
    }
    if (!clientId || !clientSecret || !appId) {
      return res.status(503).json({ isSuccess: false, message: "Seller Central OAuth is not configured" });
    }
    const adsConfig = await configSchema.findById(configId).lean();
    if (!adsConfig || adsConfig.isActive === false || !canManageAdsConfig(req, adsConfig)) {
      return res.status(403).json({ isSuccess: false, message: "You cannot connect Seller Central for this Ads account" });
    }
    const profile = await profileSchema.findOne({ configId, profileId: Number(profileId), isActive: { $ne: false } }).lean();
    if (profile?.type === "vendor") {
      return res.status(400).json({ isSuccess: false, message: "This is an Amazon Vendor Ads profile. Seller Central Connect requires an Amazon Seller Ads profile." });
    }
    if (!profile?.advertiserId || profile.type !== "seller") {
      return res.status(400).json({ isSuccess: false, message: "Select a saved Amazon Seller Ads profile" });
    }
    if (req.role?.roleName !== ROLES.SUPER_ADMIN && !await profileBasedPermissionSchema.exists({
      userId, configId, profileId: Number(profileId), hasAccess: true,
    })) {
      return res.status(403).json({ isSuccess: false, message: "You cannot connect Seller Central for this Ads profile" });
    }

    /* -------------------------- GENERATE STATE -------------------------- */
    const state = crypto.randomBytes(32).toString("hex");

    /* -------------------------- SAVE TEMP STATE ------------------------- */
    await tempStateConfigSchema.create({
      configId: configId || null,
      profileId: Number(profileId),
      userId,
      organizationId: adsConfig.organizationId || null,
      sellerId: String(profile.advertiserId).trim(),
      clientId,
      clientSeceret: clientSecret,
      state,
      type: "SP",
      isNew: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    /* --------------------------- CREATE URL ----------------------------- */
    const isDev = process.env.NODE_ENV === "dev" || !process.env.NODE_ENV;
    const domain = sellerCentralDomains[String(profile.countryCode || "").toUpperCase()] || sellerCentralDomains.US;
    const consentUrl = new URL(`https://${domain}/apps/authorize/consent`);
    consentUrl.searchParams.set("application_id", appId);
    consentUrl.searchParams.set("state", state);
    consentUrl.searchParams.set("redirect_uri", `${process.env.BASE_URL.replace(/\/+$/, "")}/api/config/amazonCallback`);
    if (isDev) consentUrl.searchParams.set("version", "beta");

    return res.status(200).json({
      isSuccess: true,
      data: { authUrl: consentUrl.href },
    });
  } catch (error) {
    write_logs({ message: `[amazonSPRedirect Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error",
    });
  }
}

async function resumeApprovedSellerSync(configId, profileId) {
  if (!configId || !profileId) return;
  const scope = { configId, profileId: Number(profileId) };
  if (await synchronizeDetailsSchema.exists({ ...scope, type: "seller", requestStatus: "COMPLETED" })) {
    await profileSchema.updateOne(scope, { $set: { isSpSyncEnabled: true } });
    await Promise.all([clearProfileCache(String(configId), scope.profileId), clearActivePlanProfilesCache(scope.profileId)]);
  }
}

exports.amazonSPCallback = (req, res) => completeProfileSellerOAuth(req, res, "amazonSPCallback");

async function completeProfileSellerOAuth(req, res, callbackPath) {
  const frontendUrl = process.env.FRONTEND_REDIRECT_URL || "http://localhost:3000";
  let auditScope = null;
  const recordFailure = async reason => {
    if (auditScope) await writeAuditEvent({ req, ...auditScope, event: "SELLER_CONFIG_CONNECT_FAILED",
      message: "Seller profile authorization failed", outcome: "FAILED", metadata: { reason } });
  };
  try {
    const { code: rawCode, spapi_oauth_code, selling_partner_id, state, error: amazonError, error_description } = req.query;
    const code = spapi_oauth_code || rawCode;

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
    if (!authState || authState.type !== "SP" || !authState.userId || !authState.configId || !authState.profileId) {
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Invalid or expired state session")}`);
    }

    auditScope = { userId: authState.userId, organizationId: authState.organizationId,
      configId: authState.configId, profileId: authState.profileId };
    if (authState.isUsed) {
      await recordFailure("STATE_ALREADY_USED");
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("State already used. Please initiate a new connection.")}`);
    }

    if (new Date() > authState.expiresAt) {
      await recordFailure("STATE_EXPIRED");
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Authorization session expired. Please try again.")}`);
    }

    /* ---------------------------- EXTRACT DATA -------------------------- */
    const { profileId, configId: stateConfigId, sellerId: stateSellerId, clientId, clientSeceret, userId, organizationId } = authState;

    const finalSellerId = selling_partner_id;
    const owner = sellerOwnerScope(organizationId, userId);
    const profile = await profileSchema.findOne({ configId: stateConfigId, profileId, isActive: { $ne: false } }).lean();
    const adsConfig = await configSchema.findById(stateConfigId).lean();
    if (!owner || !adsConfig || adsConfig.isActive === false ||
        String(adsConfig.organizationId || "") !== String(organizationId || "") ||
        !sameSeller(profile?.advertiserId, finalSellerId) || !sameSeller(stateSellerId, finalSellerId)) {
      await recordFailure("SELLER_PROFILE_MISMATCH");
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Authorize the Seller Central account that owns this Ads profile.")}`);
    }

    const claimed = await tempStateConfigSchema.updateOne(
      { _id: authState._id, isUsed: { $ne: true }, expiresAt: { $gt: new Date() } },
      { $set: { isUsed: true } }
    );
    if (!claimed.modifiedCount) {
      await recordFailure("STATE_CLAIM_FAILED");
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Authorization session expired or was already used. Start a new connection.")}`);
    }

    /* -------------------------- EXCHANGE TOKEN -------------------------- */
    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        process.env.AUTH_LINK || "https://api.amazon.com/auth/o2/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSeceret,
          redirect_uri: `${process.env.BASE_URL.replace(/\/+$/, "")}/api/config/${callbackPath}`,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 10000,
        }
      );
    } catch (err) {
      await recordFailure("TOKEN_EXCHANGE_FAILED");
      write_logs({ message: `[amazonSPCallback Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      const errMsg = err.response?.data?.error_description || err.response?.data?.message || err.message || "Failed to exchange SP token with Amazon";
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent(errMsg)}`);
    }

    /* ---------------------------- TOKEN DATA ---------------------------- */
    const { access_token, refresh_token, expires_in } = tokenResponse?.data || {};
    if (!access_token || !refresh_token) {
      await recordFailure("TOKEN_RESPONSE_INVALID");
      return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent("Invalid token response received from Amazon")}`);
    }

    const scope = { configId: stateConfigId, profileId, sellerId: finalSellerId };
    let config = await sellerConfigSchema.findOne({ ...scope, ...owner }).sort({ updatedAt: -1 });
    const isReconnect = Boolean(config);
    const credentials = {
      organizationId,
      spClientId: clientId,
      spClientSecret: clientSeceret,
      spAccessToken: access_token,
      spRefreshToken: refresh_token,
      tokenExpire: expires_in,
      spTokenExpiresAt: new Date(Date.now() + (expires_in - 300) * 1000),
      isActive: true,
      disconnectedAt: null,
      deletionReminder15SentAt: null,
      deletionReminder1SentAt: null,
      isDataDeletionStopped: false,
    };
    if (config) {
      Object.assign(config, credentials);
      await config.save();
    } else {
      config = await sellerConfigSchema.create({ ...scope, ...credentials, userId });
    }

    // Connection is saved. Cache, sync and notification failures should not report OAuth failure.
    const effects = await Promise.allSettled([
      (async () => {
        await clearSPAccessTokenCache(String(stateConfigId), profileId);
        await seedAccessToken({ kind: "sp", configId: String(stateConfigId), profileId, accessToken: access_token, expiresIn: expires_in });
      })(),
      resumeApprovedSellerSync(stateConfigId, profileId),
      (async () => {
        if (!config.newConnectionEmailSentAt) {
          const notification = await notifyNewSellerConnection({
            sellerId: finalSellerId, userId, organizationId,
            source: "In-App Seller Connect (Settings)", profiles: [profile], req,
          });
          if (notification?.delivered !== true) throw new Error("Seller notification delivery failed");
          config.newConnectionEmailSentAt = new Date();
          await config.save();
        }
      })(),
    ]);
    if (effects.some(result => result.status === "rejected")) {
      write_logs({ message: "[amazonSPCallback] Seller connected with incomplete post-connect work", log_type: "warning" });
    }

    await writeAuditEvent({ req, ...auditScope, sellerConfigId: config._id,
      event: isReconnect ? "SELLER_CONFIG_RECONNECT" : "SELLER_CONFIG_CONNECT",
      message: isReconnect ? "Seller profile connection renewed" : "Seller profile connected",
      outcome: "SUCCESS", metadata: { postConnectFailures: effects.filter(result => result.status === "rejected").length } });

    /* ----------------------------- CLEANUP ------------------------------ */
    await tempStateConfigSchema.deleteOne({ _id: authState._id }).catch(error => {
      write_logs({ message: `[amazonSPCallback] State cleanup failed: ${error.message}`, log_type: "warning" });
    });

    /* ----------------------------- REDIRECT ----------------------------- */
    // Only the profile/seller just connected via this OAuth flow should trigger
    // the sync setup modal for this exact Seller configuration.
    return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=success&autoOpenSync=${encodeURIComponent(config._id)}`);

  } catch (error) {
    await recordFailure("CONNECTION_SAVE_FAILED");
    write_logs({ message: `[amazonSPCallback Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.redirect(`${frontendUrl}/settings?tab=seller-config&status=error&message=${encodeURIComponent(error?.message || "Internal server error")}`);
  }
}

exports.amazonSPRefreshToken = async (req, res) => {
  try {
    const { sellerConfigId } = req.body;
    const configId = req.body.configId || req.config?.configId;
    const profileId = Number(req.body.profileId);
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(configId) || !Number.isSafeInteger(profileId) || profileId <= 0 ||
        (sellerConfigId && !mongoose.isValidObjectId(sellerConfigId))) {
      return res.status(400).json({ isSuccess: false, message: "Select an Ads configuration and profile to refresh Seller Central" });
    }

    const adsConfig = await configSchema.findById(configId).lean();
    if (!adsConfig || adsConfig.isActive === false || !canManageAdsConfig(req, adsConfig) ||
        (req.role?.roleName !== ROLES.SUPER_ADMIN && !await profileBasedPermissionSchema.exists({
          userId, configId, profileId, organizationId: adsConfig.organizationId || null, hasAccess: true,
        }))) {
      return res.status(403).json({ isSuccess: false, message: "You cannot refresh Seller Central for this Ads profile" });
    }

    const profile = await profileSchema.findOne({ configId, profileId, type: "seller", isActive: { $ne: false } }).lean();
    if (!profile?.advertiserId) {
      return res.status(404).json({ isSuccess: false, message: "Amazon Seller Ads profile not found" });
    }

    const scope = {
      ...sellerOwnerScope(adsConfig.organizationId, userId),
      configId,
      profileId,
      sellerId: String(profile.advertiserId).trim(),
      isActive: true,
    };
    if (sellerConfigId) scope._id = sellerConfigId;

    const sellerConfig = await sellerConfigSchema.findOne(scope).sort({ updatedAt: -1 });
    if (!sellerConfig?.spRefreshToken || !sellerConfig.spClientId || !sellerConfig.spClientSecret) {
      return res.status(404).json({ isSuccess: false, message: "Connect Seller Central for this Ads profile before refreshing its token" });
    }

    let token;
    try {
      const response = await axios.post(
        process.env.AUTH_LINK || "https://api.amazon.com/auth/o2/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: sellerConfig.spClientId,
          client_secret: sellerConfig.spClientSecret,
          refresh_token: sellerConfig.spRefreshToken,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
      );
      token = response.data;
    } catch (error) {
      await writeAuditEvent({ req, event: "SELLER_CREDENTIAL_REFRESH", message: "Seller credential refresh rejected",
        configId, profileId, sellerConfigId: sellerConfig._id, organizationId: adsConfig.organizationId,
        outcome: "FAILED", metadata: { reason: "AMAZON_REFRESH_REJECTED", providerStatus: error.response?.status || null } });
      write_logs({ message: `[amazonSPRefreshToken] Amazon rejected token refresh (HTTP ${error.response?.status || "unavailable"})`, log_type: "warning" });
      return res.status(400).json({ isSuccess: false, message: "Could not refresh the Seller token. Reconnect Seller Central and try again." });
    }

    const expiresIn = Number(token?.expires_in);
    if (!token?.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      await writeAuditEvent({ req, event: "SELLER_CREDENTIAL_REFRESH", message: "Seller credential refresh failed",
        configId, profileId, sellerConfigId: sellerConfig._id, organizationId: adsConfig.organizationId,
        outcome: "FAILURE", metadata: { reason: "TOKEN_RESPONSE_INVALID" } });
      return res.status(502).json({ isSuccess: false, message: "Invalid token response from Amazon" });
    }

    const updated = await sellerConfigSchema.updateOne(
      { ...scope, _id: sellerConfig._id, updatedAt: sellerConfig.updatedAt },
      { $set: {
        spAccessToken: token.access_token,
        tokenExpire: expiresIn,
        spTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      } }
    );
    if (!updated.matchedCount) {
      await writeAuditEvent({ req, event: "SELLER_CREDENTIAL_REFRESH", message: "Seller credential refresh conflicted with a connection change",
        configId, profileId, sellerConfigId: sellerConfig._id, organizationId: adsConfig.organizationId,
        outcome: "DENIED", metadata: { reason: "CONNECTION_CHANGED" } });
      return res.status(409).json({ isSuccess: false, message: "This Seller connection changed. Refresh the page and try again." });
    }

    await writeAuditEvent({ req, event: "SELLER_CREDENTIAL_REFRESH", message: "Seller credentials refreshed",
      configId, profileId, sellerConfigId: sellerConfig._id, organizationId: adsConfig.organizationId,
      metadata: { expiresIn } });
    await seedAccessToken({ kind: "sp", configId: String(configId), profileId, accessToken: token.access_token, expiresIn });
    return res.status(200).json({
      isSuccess: true,
      message: "Access token refreshed successfully",
      data: { sellerConfigId: sellerConfig._id, expiresIn },
    });
  } catch (error) {
    write_logs({ message: `[amazonSPRefreshToken] ${error?.name || "Error"}`, log_type: "error" });
    return res.status(500).json({ isSuccess: false, message: "Internal server error" });
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
      await writeAuditEvent({ req,
        userId,
        configId: config?._id,
        event: "CONFIG_DISCONNECT",
        message: "Attempted to disconnect already inactive config",
        outcome: "DENIED",
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
    config.deletionReminder15SentAt = null;
    config.deletionReminder1SentAt = null;
    config.isDataDeletionStopped = false;
    await config.save();

    await writeAuditEvent({ req,
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
      await writeAuditEvent({ req,
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
    config.deletionReminder15SentAt = null;
    config.deletionReminder1SentAt = null;
    config.isDataDeletionStopped = false;
    await config.save();

    await profileSchema.updateOne(
      { configId: config.configId, profileId: config.profileId },
      { $set: { isSpSyncEnabled: false } }
    );

    if (config.configId && config.profileId) {
      await clearSPAccessTokenCache(config.configId.toString(), config.profileId).catch(() => { });
      await clearProfileCache(config.configId.toString(), config.profileId).catch(() => { });
      await clearActivePlanProfilesCache(config.profileId).catch(() => { });
    }

    await writeAuditEvent({ req,
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

          let getCronData = null;
          try {
            getCronData = new cronJobHistorySchema({
              configId: p.configId,
              profileId: p.profileId,
              cronName: "Sync Past Data",
              historyDate: currentDate,
              status: "PENDING",
              details: {
                startedAt: new Date().toISOString(),
                startDate: p.startDate,
                endDate: p.endDate,
              },
            });
            await getCronData.save();
          } catch (_e) { }

          try {
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
                {
                  status: "COMPLETED",
                  $set: { "details.completedAt": new Date().toISOString() },
                },
                { new: true }
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
          } catch (profileErr) {
            cron_logs({
              message: `SyncPastData: Error for profile ${p.profileId}: ${profileErr.message}`,
              log_type: "error",
            });
            if (getCronData?._id) {
              await cronJobHistorySchema.findByIdAndUpdate(
                getCronData._id,
                {
                  status: "FAILED",
                  error: profileErr.message,
                  $set: { "details.failedAt": new Date().toISOString() },
                },
                { new: true }
              );
            }
          }

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

exports.cronDisconnectReminder = async (req, res) => {
  cron_logs({
    message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} Disconnect Reminder`,
    log_type: "info",
  });
  const currentDate = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");
  let cronDoc;
  try {
    cronDoc = new cronJobHistorySchema({
      cronName: "Disconnect Reminder",
      historyDate: currentDate,
      configId: null,
      profileId: null,
      status: "PENDING",
      details: { startedAt: new Date().toISOString() },
    });
    await cronDoc.save();
  } catch (_e) {
    // schema insert fallback
  }

  try {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    /* ====================================================================
       1. ADS DISCONNECT REMINDERS (15 Days & 1 Day Prior)
       ==================================================================== */
    const disconnectedConfigs = await configSchema.find({
      isActive: false,
      disconnectedAt: { $ne: null, $gt: cutoffDate },
      isDataDeletionStopped: { $ne: true },
    }).lean();

    let adsRemindersSent = 0;
    for (const config of disconnectedConfigs) {
      try {
        // Skip if data deletion was stopped at organization level
        if (config.organizationId) {
          const org = await organizationSchema.findById(config.organizationId).lean();
          if (org?.isDataDeletionStopped) {
            cron_logs({
              message: `Ads reminder skipped for configId=${config._id}: Deletion stopped at organization level.`,
              log_type: "info",
            });
            continue;
          }
        }

        const userAccess = await profileBasedPermissionSchema.findOne({ configId: config._id }).lean();
        if (!userAccess) continue;

        const user = await userSchema.findById(userAccess.userId).lean();
        if (!user?.email) continue;

        // Calculate days remaining until purge
        const purgeDate = new Date(config.disconnectedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((purgeDate - Date.now()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0) continue; // Handled by purge cron

        // Determine if 15-day or 1-day reminder should be sent
        const shouldSend15 = (daysLeft <= 15 && daysLeft > 1 && !config.deletionReminder15SentAt);
        const shouldSend1 = (daysLeft <= 1 && daysLeft > 0 && !config.deletionReminder1SentAt);

        if (!shouldSend15 && !shouldSend1) continue;

        // Find profile names
        const profiles = await profileSchema.find({ configId: config._id }).lean();
        const profileNames = profiles.map(p => p.name).filter(Boolean).join(", ");
        const formattedPurgeDate = purgeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
        const baseUrl = process?.env?.BASE_URL || "";
        const supportEmail = process?.env?.SUPPORT_EMAIL || "support@advertiseiq.com";

        let subject;
        let updateField = {};

        if (shouldSend1) {
          subject = `🚨 Final Warning: Your AdvertiseIQ Ads data will be permanently deleted tomorrow (1 day left)`;
          updateField = { deletionReminder1SentAt: new Date() };
        } else {
          subject = `⚠️ Important: Your AdvertiseIQ Ads data will be permanently deleted in ${daysLeft} days`;
          updateField = { deletionReminder15SentAt: new Date() };
        }

        await sendEmailHelper(
          user.email,
          subject,
          buildDisconnectReminderEmail({
            userName: user.fullName,
            profileNames: profileNames || "Your linked Ads profiles",
            daysLeft,
            purgeDate: formattedPurgeDate,
            signInUrl: baseUrl,
            supportEmail,
            type: "ads",
          })
        );

        await configSchema.updateOne({ _id: config._id }, { $set: updateField });
        adsRemindersSent++;

        cron_logs({
          message: `Ads reminder (${shouldSend1 ? "1-day final" : "15-day"}) sent to ${user.email} — ${daysLeft} days left for configId=${config._id}`,
          log_type: "info",
        });

      } catch (innerErr) {
        cron_logs({
          message: `Ads reminder failed for configId=${config._id}: ${innerErr.message}`,
          log_type: "error",
        });
      }
    }

    /* ====================================================================
       2. SP DISCONNECT REMINDERS (15 Days & 1 Day Prior)
       ==================================================================== */
    const disconnectedSellerConfigs = await sellerConfigSchema.find({
      isActive: false,
      disconnectedAt: { $ne: null, $gt: cutoffDate },
      isDataDeletionStopped: { $ne: true },
    }).lean();

    let spRemindersSent = 0;
    for (const sellerConfig of disconnectedSellerConfigs) {
      try {
        if (sellerConfig.organizationId) {
          const org = await organizationSchema.findById(sellerConfig.organizationId).lean();
          if (org?.isDataDeletionStopped) {
            cron_logs({
              message: `SP reminder skipped for sellerConfigId=${sellerConfig._id}: Deletion stopped at organization level.`,
              log_type: "info",
            });
            continue;
          }
        }

        if (sellerConfig.configId) {
          const parentConfig = await configSchema.findById(sellerConfig.configId).lean();
          if (parentConfig?.isDataDeletionStopped) {
            cron_logs({
              message: `SP reminder skipped for sellerConfigId=${sellerConfig._id}: Deletion stopped on parent Ads config.`,
              log_type: "info",
            });
            continue;
          }
        }

        const userAccess = await profileBasedPermissionSchema.findOne({
          configId: sellerConfig.configId,
          profileId: sellerConfig.profileId
        }).lean() || await profileBasedPermissionSchema.findOne({ configId: sellerConfig.configId }).lean();
        if (!userAccess) continue;

        const user = await userSchema.findById(userAccess.userId).lean();
        if (!user?.email) continue;

        const purgeDate = new Date(sellerConfig.disconnectedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((purgeDate - Date.now()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0) continue;

        const shouldSend15 = (daysLeft <= 15 && daysLeft > 1 && !sellerConfig.deletionReminder15SentAt);
        const shouldSend1 = (daysLeft <= 1 && daysLeft > 0 && !sellerConfig.deletionReminder1SentAt);

        if (!shouldSend15 && !shouldSend1) continue;

        const profiles = await profileSchema.find({ configId: sellerConfig?.configId, profileId: sellerConfig.profileId }).lean();
        const profileNames = profiles.map(p => p.name).filter(Boolean).join(", ");
        const formattedPurgeDate = purgeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
        const baseUrl = process?.env?.BASE_URL || "";
        const supportEmail = process?.env?.SUPPORT_EMAIL || "support@advertiseiq.com";

        let subject;
        let updateField = {};

        if (shouldSend1) {
          subject = `🚨 Final Warning: Your AdvertiseIQ SP-API seller data will be permanently deleted tomorrow (1 day left)`;
          updateField = { deletionReminder1SentAt: new Date() };
        } else {
          subject = `⚠️ Important: Your AdvertiseIQ SP-API seller data will be permanently deleted in ${daysLeft} days`;
          updateField = { deletionReminder15SentAt: new Date() };
        }

        await sendEmailHelper(
          user.email,
          subject,
          buildDisconnectReminderEmail({
            userName: user.fullName,
            profileNames: profileNames || "Your linked Seller profiles",
            daysLeft,
            purgeDate: formattedPurgeDate,
            signInUrl: baseUrl,
            supportEmail,
            type: "sp",
          })
        );

        await sellerConfigSchema.updateOne({ _id: sellerConfig._id }, { $set: updateField });
        spRemindersSent++;

        cron_logs({
          message: `SP reminder (${shouldSend1 ? "1-day final" : "15-day"}) sent to ${user.email} — ${daysLeft} days left for sellerConfigId=${sellerConfig._id}`,
          log_type: "info",
        });

      } catch (innerErr) {
        cron_logs({
          message: `SP reminder failed for sellerConfigId=${sellerConfig._id}: ${innerErr.message}`,
          log_type: "error",
        });
      }
    }

    cron_logs({
      message: `Disconnect Reminder check completed. Sent ${adsRemindersSent} Ads reminders and ${spRemindersSent} SP reminders.`,
      log_type: "info"
    });

    if (cronDoc?._id) {
      await cronJobHistorySchema.findByIdAndUpdate(cronDoc._id, {
        status: "COMPLETED",
        recordsCount: adsRemindersSent + spRemindersSent,
        $set: {
          "details.completedAt": new Date().toISOString(),
          "details.adsRemindersSent": adsRemindersSent,
          "details.spRemindersSent": spRemindersSent,
        },
      });
    }

    if (res && typeof res.status === "function") {
      return res.status(200).json({
        isSuccess: true,
        message: "Disconnect reminders checked and processed successfully.",
        adsRemindersSent,
        spRemindersSent,
      });
    }

  } catch (error) {
    cron_logs({ message: `Disconnect Reminder Main Error: ${error.message}`, log_type: "error" });
    if (cronDoc?._id) {
      await cronJobHistorySchema.findByIdAndUpdate(cronDoc._id, {
        status: "FAILED",
        error: error.message,
        $set: {
          "details.failedAt": new Date().toISOString(),
        },
      });
    }

    if (res && typeof res.status === "function") {
      return res.status(500).json({
        isSuccess: false,
        message: "Failed to process disconnect reminders",
        error: error.message,
      });
    }
  }
};

function canManageAdsConfig(req, config) {
  const organizationId = req.organizationId || req.user?.organizationId;
  if (organizationId) return String(config.organizationId) === String(organizationId);
  return req.role?.roleName === ROLES.SUPER_ADMIN;
}

exports.getAmazonProfiles = async (req, res) => {
  try {
    const { configId } = req.query;
    if (!configId) return res.status(400).json({ isSuccess: false, message: 'configId is required' });

    const configDoc = await configSchema.findById(configId).lean();
    if (!configDoc || !canManageAdsConfig(req, configDoc)) {
      return res.status(403).json({ isSuccess: false, message: 'Ads account is outside your organization' });
    }
    const fetchedProfiles = await fetchOnboardingAdsProfiles(configId);

    const existingProfiles = await profileSchema.find({ configId }).lean();
    const existingProfileIds = new Set(existingProfiles.map((x) => x.profileId.toString()));

    const activeSellerConfigs = await sellerConfigSchema.find({
      ...sellerOwnerScope(configDoc.organizationId, req.user._id),
      isActive: true,
      spRefreshToken: { $type: "string", $ne: "" },
      $and: [{ $or: [{ configId: null }, { configId }] }],
    }).select("sellerId configId profileId").lean();

    const profilesWithStatus = [];
    for (const p of fetchedProfiles) {
      const pAdvId = p.advertiserId || p.accountInfo?.id;
      const isSellerMatch = activeSellerConfigs.some(seller => sameSeller(pAdvId, seller.sellerId) &&
        (!seller.profileId || Number(seller.profileId) === Number(p.profileId)));

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
    return res.status(500).json({ isSuccess: false, message: 'Could not load Amazon Ads profiles', errorMessage: error?.message });
  }
};

exports.saveAmazonProfiles = async (req, res) => {
  try {
    const { configId, selectedProfiles: requestedProfiles } = req.body;
    const userId = req.user._id;

    if (!configId || !Array.isArray(requestedProfiles) || !requestedProfiles.length) {
      return res.status(400).json({ isSuccess: false, message: 'configId and selectedProfiles array are required' });
    }

    const configDoc = await configSchema.findById(configId).lean();
    if (!configDoc) return res.status(404).json({ isSuccess: false, message: 'Config not found' });
    if (!canManageAdsConfig(req, configDoc)) return res.status(403).json({ isSuccess: false, message: 'Ads account is outside your organization' });

    const requestedIds = new Set(requestedProfiles.map(profile => String(profile?.profileId)));
    const verifiedProfiles = await fetchOnboardingAdsProfiles(configId);
    const selectedProfiles = [...new Map(verifiedProfiles
      .filter(profile => requestedIds.has(String(profile.profileId)))
      .map(profile => [String(profile.profileId), profile])).values()];
    if (selectedProfiles.length !== requestedIds.size) {
      return res.status(400).json({ isSuccess: false, message: "One or more profiles could not be verified for this Ads account. Reload the profile list and try again." });
    }

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

    const profileBulkOps = selectedProfiles.map((p) => {
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
            },
            $setOnInsert: { isAdsSyncEnabled: false, isSpSyncEnabled: false },
          },
          upsert: true,
        },
      };
    });

    await profileSchema.bulkWrite(profileBulkOps);
    await profileBasedPermissionSchema.bulkWrite(selectedProfiles.map(profile => ({
      updateOne: {
        filter: { userId, organizationId: orgId, profileId: Number(profile.profileId), configId },
        update: { $set: { hasAccess: true } },
        upsert: true,
      },
    })));
    const allCrons = await cronJobSchema.find().lean();
    const cronOps = selectedProfiles.flatMap(profile => allCrons.map(cron => ({
      updateOne: {
        filter: { configId, profileId: profile.profileId, cronId: cron._id },
        update: { $set: { cronName: cron.cronName, timezone: profile.timezone } },
        upsert: true,
      },
    })));
    if (cronOps.length) await cronJobSchedularSchema.bulkWrite(cronOps);
    for (const p of selectedProfiles) {
      await Promise.allSettled([
        clearProfileCache(String(configId), p.profileId),
        clearActivePlanProfilesCache(p.profileId),
      ]);
    }

    await linkSellerConfigWithAdsConfig(configDoc, userId, orgId, selectedProfiles);

    await writeAuditEvent({ req, event: "ADS_PROFILES_SAVED", message: "Ads profile selection saved",
      configId, organizationId: orgId, resourceType: "ADS_CONFIGURATION", resourceId: configId,
      metadata: { profileIds: selectedProfiles.map(profile => profile.profileId), selectedCount: selectedProfiles.length } });

    return res.status(200).json({ isSuccess: true, message: 'Profiles saved successfully' });
  } catch (error) {
    write_logs({ message: `[saveAmazonProfiles Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({ isSuccess: false, message: 'Internal server error', errorMessage: error?.message });
  }
};

exports.getReportDetails = async (req, res) => {
  try {
    const list = await reportDetailsSchema.find(historicalReportFilter).sort({ createdAt: -1 });
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
    const numericProfileId = Number(profileId);

    if (!mongoose.isValidObjectId(configId) || !Number.isSafeInteger(numericProfileId) || numericProfileId <= 0 ||
        !Array.isArray(items) || items.length === 0) {
      return res.status(400).send({
        isSuccess: false,
        message: "Missing configId, profileId, or group items",
      });
    }

    const config = await configSchema.findById(configId).lean();
    if (!config || !canManageAdsConfig(req, config)) {
      return res.status(403).send({ isSuccess: false, message: "You cannot change synchronization settings for this Ads account." });
    }

    const scope = { configId, profileId: numericProfileId, type: syncType };
    if (syncType === "seller") {
      const profile = await profileSchema.findOne({ configId, profileId: numericProfileId, type: "seller", isActive: { $ne: false } }).lean();
      const connected = profile?.advertiserId && await sellerConfigSchema.exists({
        ...sellerOwnerScope(config.organizationId, userId),
        configId, profileId: numericProfileId, sellerId: String(profile.advertiserId).trim(),
        isActive: true, spRefreshToken: { $type: "string", $ne: "" },
      });
      if (!connected) {
        return res.status(409).send({ isSuccess: false, message: "Connect Seller Central for this profile before saving its synchronization settings." });
      }
    }

    const existing = await synchronizeDetailsSchema.find(scope).sort({ updatedAt: -1 }).lean();
    if (existing.some(record => record.requestStatus === "IN_PROGRESS")) {
      return res.status(400).send({
        isSuccess: false,
        message: "Synchronization is currently in progress. You cannot modify sync settings until sync completes.",
      });
    }

    const selectedGroups = new Map();
    for (const item of items) {
      const groupId = item?.groupId || item?.id;
      const days = Number(item?.selectedSyncDays ?? item?.days);
      if (typeof groupId !== "string" || !groupId.trim() || !Number.isSafeInteger(days) || days <= 0) {
        return res.status(400).send({ isSuccess: false, message: "Select valid groups and historical sync days." });
      }
      selectedGroups.set(groupId.trim(), days);
    }
    const groups = await coreGroupSchema.find({ id: { $in: [...selectedGroups.keys()] }, type: syncType, isActive: true }).lean();
    if (groups.length !== selectedGroups.size || groups.some(group => selectedGroups.get(group.id) > (group.maxDays || 90))) {
      return res.status(400).send({ isSuccess: false, message: "Select sync groups and days allowed for this account type." });
    }

    const selectedRecordIds = new Set();
    for (const [groupId, selectedSyncDays] of selectedGroups) {
      const previous = existing.find(record => record.groupId === groupId);
      if (previous?.selectedSyncDays === selectedSyncDays) {
        selectedRecordIds.add(String(previous._id));
        continue;
      }
      const record = await synchronizeDetailsSchema.findOneAndUpdate(
        previous ? { ...scope, _id: previous._id, requestStatus: { $ne: "IN_PROGRESS" } } :
          { ...scope, groupId },
        { [previous ? "$set" : "$setOnInsert"]: { userId, selectedSyncDays, requestStatus: "PENDING", syncRequestTime: new Date() } },
        { upsert: !previous, new: true }
      ).lean();
      if (!record || record.selectedSyncDays !== selectedSyncDays) {
        return res.status(409).send({ isSuccess: false, message: "Synchronization settings changed while you were editing. Reopen the dialog and try again." });
      }
      selectedRecordIds.add(String(record._id));
    }

    const removedIds = existing.filter(record => !selectedRecordIds.has(String(record._id))).map(record => record._id);
    if (removedIds.length) {
      const removed = await synchronizeDetailsSchema.deleteMany({
        ...scope, _id: { $in: removedIds }, requestStatus: { $ne: "IN_PROGRESS" },
      });
      if (removed.deletedCount !== removedIds.length) {
        return res.status(409).send({ isSuccess: false, message: "Synchronization settings changed while you were editing. Reopen the dialog and try again." });
      }
    }

    const saved = await synchronizeDetailsSchema.find(scope).lean();
    if (saved.length !== selectedGroups.size || saved.some(record => selectedGroups.get(record.groupId) !== record.selectedSyncDays)) {
      return res.status(409).send({ isSuccess: false, message: "Synchronization settings changed while you were editing. Reopen the dialog and try again." });
    }

    await writeAuditEvent({ req, event: "PROFILE_SYNC_SETTINGS_SUBMIT", message: "Profile sync selections saved",
      configId, profileId: numericProfileId, organizationId: config.organizationId,
      previousValue: existing.map(record => ({ groupId: record.groupId, selectedSyncDays: record.selectedSyncDays, requestStatus: record.requestStatus })),
      newValue: saved.map(record => ({ groupId: record.groupId, selectedSyncDays: record.selectedSyncDays, requestStatus: record.requestStatus })),
      metadata: { type: syncType, awaitingApproval: saved.some(record => record.requestStatus === "PENDING") } });

    return res.status(200).send({
      isSuccess: true,
      message: saved.some(record => record.requestStatus === "PENDING")
        ? "Sync selections saved. Pending Super Admin approval."
        : "Group synchronization settings saved successfully",
      data: saved,
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

exports.updateProfileSyncSettings = async (req, res) => {
  try {
    const { profileId, configId, isAdsSyncEnabled, isSpSyncEnabled } = req.body;

    if (!configId || !mongoose.Types.ObjectId.isValid(configId) || !Number.isSafeInteger(Number(profileId)) || Number(profileId) <= 0) {
      return res.status(400).send({
        isSuccess: false,
        message: "Valid configId and profileId are required",
      });
    }

    const scope = { configId, profileId: Number(profileId) };
    const userId = req.user?._id;
    if (req.role?.roleName !== ROLES.SUPER_ADMIN) {
      const hasProfileAccess = userId && await profileBasedPermissionSchema.exists({ ...scope, userId, hasAccess: true });
      const ownsSellerConnection = !hasProfileAccess && userId && typeof isAdsSyncEnabled !== "boolean" &&
        await sellerConfigSchema.exists({ ...scope, userId, isActive: true });
      if (!hasProfileAccess && !ownsSellerConnection) {
        return res.status(403).send({ isSuccess: false, message: "You do not have permission to change sync settings for this profile." });
      }
    }

    const enablingTypes = [];
    if (isAdsSyncEnabled === true) enablingTypes.push("ads");
    if (isSpSyncEnabled === true) enablingTypes.push("seller");
    if (enablingTypes.length) {
      const approved = await synchronizeDetailsSchema.distinct("type", {
        ...scope, type: { $in: enablingTypes }, requestStatus: "COMPLETED"
      });
      if (!enablingTypes.every(type => approved.includes(type))) {
        return res.status(403).send({ isSuccess: false, message: "Super Admin must approve and complete the requested import before daily sync can be enabled." });
      }
    }

    // Check if synchronization is currently IN_PROGRESS
    const activeSync = await synchronizeDetailsSchema.findOne({
      ...scope,
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

    const syncUpdate = await profileSchema.updateOne(
      scope,
      { $set: updateFields }
    );
    if (syncUpdate.matchedCount !== 0 && Object.keys(updateFields).length) {
      await writeAuditEvent({ req, event: "PROFILE_SYNC_SETTINGS_TOGGLE", message: "Profile daily sync settings updated",
        ...scope, newValue: updateFields });
    }

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
    if (!configId) {
      return res.status(400).json({ isSuccess: false, message: "configId is required" });
    }

    const configDoc = await configSchema.findById(configId).lean();
    if (!configDoc) {
      return res.status(404).json({ isSuccess: false, message: "Ads config not found" });
    }

    if (!canManageAdsConfig(req, configDoc)) {
      return res.status(403).json({ isSuccess: false, message: "Ads account is outside your organization" });
    }

    const sellerId = typeof req.body.sellerId === "string" ? req.body.sellerId.trim() : "";
    const profileId = Number(reqProfileId);
    if (!sellerId || !profileId) {
      return res.status(400).json({ isSuccess: false, message: "Seller ID and profile are required" });
    }

    const profiles = await fetchOnboardingAdsProfiles(configId);
    const matching = profiles.find(profile => Number(profile.profileId) === profileId &&
      sameSeller(profile.advertiserId || profile.accountInfo?.id, sellerId));
    const savedProfile = matching && await profileSchema.exists({ configId, profileId, isActive: true });
    if (!savedProfile || !(await linkSellerConfigWithAdsConfig(configDoc, userId, configDoc.organizationId, [matching]))) {
      return res.status(409).json({ isSuccess: false, message: "No authorized Seller connection matches this Ads profile" });
    }

    await writeAuditEvent({ req,
      userId,
      configId,
      event: "SELLER_CONFIG_LINK_EXISTING",
      message: `Seller account linked to existing Ads config "${configDoc.companyName}"`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      profileId, organizationId: configDoc.organizationId,
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
        await clearSPAccessTokenCache(profile.configId.toString(), numProfileId).catch(() => { });
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
        await clearAccessTokenCache(profile.configId.toString()).catch(() => { });
      }
    }

    if (type === "all" || (!profile.isAdsSyncEnabled && !profile.isSpSyncEnabled)) {
      profile.isActive = false;
    }

    await profile.save();

    if (profile.configId) {
      await clearProfileCache(profile.configId.toString(), numProfileId).catch(() => { });
    }
    await clearActivePlanProfilesCache(numProfileId).catch(() => { });

    await writeAuditEvent({ req,
      userId,
      configId: profile.configId,
      event: "CONFIRM_DEACTIVATE_PROFILE",
      message: `Profile ${profile.name} (${numProfileId}) permanently deactivated/closed by user`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { profileId: numProfileId, type, deactivatedAt: now },
    }).catch(() => { });

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
