const moment = require("moment");
const { retryWithBackoff } = require("../helper/retryHelper");
const { recommendation_logs } = require("../../winston/recommendation/logger");

const amazonAxios = require("../helper/amazonAxios");

const campaignsSchema = require("../models/campaign.model");
const sbCampaignsSchema = require("../models/sbCampaign.model");
const sdCampaignsSchema = require("../models/sdCampaign.model");

const placementSchema = require("../models/placement.model");
const sbPlacementSchema = require("../models/sbPlacement.model");

const targetingSchema = require("../models/targeting.model");
const sbTargetingSchema = require("../models/sbTargeting.model");
const sdTargetingSchema = require("../models/sdTargeting.model");

const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const recommandationCampaignByRuleSchema = require("../models/recommandationCampaignByRule.model");
const { isValidASIN } = require("../helper/common");

const SP_PLACEMENT_MAP = {
  "Top of Search": "PLACEMENT_TOP",
  "Rest of Search": "PLACEMENT_REST_OF_SEARCH",
  "Product pages": "PLACEMENT_PRODUCT_PAGE",
  "Product Page": "PLACEMENT_PRODUCT_PAGE",
};

const SB_PLACEMENT_MAP = {
  "Top of Search": "TOP_OF_SEARCH",
  "Rest of Search": "OTHER",
  "Product pages": "DETAIL_PAGE",
  "Product Page": "DETAIL_PAGE",
};

const recordCampaignHistorySafely = async (historyData) => {
  try {
    if (!historyData || !historyData.configId || !historyData.changeLevel) return;

    // Deduplicate identical history records created within the last 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 15 * 60 * 1000); // 15-minute deduplication window
    const filter = {
      configId: historyData.configId,
      profileId: historyData.profileId,
      changeLevel: historyData.changeLevel,
      changeType: historyData.changeType,
      newValue: historyData.newValue,
      createdAt: { $gte: thirtySecondsAgo },
    };
    if (historyData.targeting) {
      filter.targeting = historyData.targeting;
    }
    if (historyData.matchType) {
      filter.matchType = historyData.matchType;
    }

    const existing = await campaignChangeHistorySchema.findOne(filter).lean();
    if (!existing) {
      historyData.source = historyData.source || "RECOMMENDATION";
      await campaignChangeHistorySchema.create(historyData);
    }
  } catch (err) {
    console.error("Error in recordCampaignHistorySafely:", err?.message || err);
  }
};

const CampaignSPBudget = async (profile, checkConfigAds, rule, item, budget) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options = {
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
          {
            budget: { budget, budgetType: "DAILY" },
            campaignId: String(item.campaignId),
          },
        ],
      },
      meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [CampaignSPBudget] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [CampaignSPBudget] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule.configId,
          profileId: rule.profileId,
          userId: rule.userId,
          ruleSchema: "Campaign",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SP",
          campaignId: item?.campaignId
        },
        {
          $set: {
            name: item?.campaignName,
            oldValue: item?.budget,
            newValue: budget,
            changed: "Budget"
          }
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Camapign Budget",
        oldValue: item?.budget,
        newValue: budget,
        updatedFrom: "Campaign",
        userId: rule?.userId,
        type: "SP"
      })

      await campaignsSchema.findOneAndUpdate(
        {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId: item?.campaignId,
          reportDate: currentDate,
        },
        { $set: { budget } },
        { upsert: true, new: true }
      ).lean()

      return { isSuccess: true, message: "Campaign Budget Updated Successfully" }
    }
    else {
      return { isSuccess: false, message: "Failed to Update Campaign Budget" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [CampaignSPBudget] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
}

const CampaignSBBudget = async (profile, checkConfigAds, rule, item, budget) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options = {
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
        campaigns: [{ budget, campaignId: String(item.campaignId) }],
      },
      meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [CampaignSBBudget] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [CampaignSBBudget] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule.configId,
          profileId: rule.profileId,
          userId: rule.userId,
          ruleSchema: "Campaign",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SB",
          campaignId: item?.campaignId
        },
        {
          $set: {
            name: item?.campaignName,
            oldValue: item?.budget,
            newValue: budget,
            changed: "Budget"
          }
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Camapign Budget",
        oldValue: item?.budget,
        newValue: budget,
        updatedFrom: "Campaign",
        userId: rule?.userId,
        type: "SB"
      })

      await sbCampaignsSchema.findOneAndUpdate(
        {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId: item?.campaignId,
          reportDate: currentDate,
        },
        { $set: { budget } },
        { upsert: true, new: true }
      ).lean()

      return { isSuccess: true, message: "Campaign Budget Updated Successfully" }
    }
    else {
      return { isSuccess: false, message: "Failed to Update Campaign Budget" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [CampaignSBBudget] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
}

const CampaignSDBudget = async (profile, checkConfigAds, rule, item, budget) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options = {
      method: "PUT",
      url: `${profile.amazonUrl}/sd/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Prefer": "return=representation",
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      data: [{ budget, campaignId: String(item.campaignId) }],
      meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [CampaignSDBudget] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [CampaignSDBudget] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule.configId,
          profileId: rule.profileId,
          userId: rule.userId,
          ruleSchema: "Campaign",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SD",
          campaignId: item?.campaignId
        },
        {
          $set: {
            name: item?.campaignName,
            oldValue: item?.budget,
            newValue: budget,
            changed: "Budget"
          }
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Camapign Budget",
        oldValue: item?.budget,
        newValue: budget,
        updatedFrom: "Campaign",
        userId: rule?.userId,
        type: "SD"
      })

      await sdCampaignsSchema.findOneAndUpdate(
        {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId: item?.campaignId,
          reportDate: currentDate,
        },
        { $set: { budget } },
        { upsert: true, new: true }
      ).lean()

      return { isSuccess: true, message: "Campaign Budget Updated Successfully" }
    }
    else {
      return { isSuccess: false, message: "Failed to Update Campaign Budget" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [CampaignSDBudget] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
}

const CampaignSPStatus = async (profile, checkConfigAds, rule, item, status) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options = {
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
          {
            campaignId: String(item.campaignId),
            state: status,
          },
        ],
      },
      meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [CampaignSPStatus] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [CampaignSPStatus] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Campaign",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SP",
          campaignId: item?.campaignId
        },
        {
          $set: {
            name: item?.campaignName,
            oldValue: item?.campaignStatus,
            newValue: status,
            changed: "Status"
          }
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Camapign Status",
        oldValue: item?.campaignStatus,
        newValue: status,
        updatedFrom: "Campaign",
        userId: rule?.userId,
        type: "SP"
      })

      await campaignsSchema.findOneAndUpdate(
        {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId: item?.campaignId,
          reportDate: currentDate,
        },
        { $set: { status } },
        { upsert: true, new: true }
      ).lean()

      return { isSuccess: true, message: "Campaign Status Updated Successfully" }
    }
    else {
      return { isSuccess: false, message: "Failed to Update Campaign Status" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [CampaignSPStatus] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
}

const CampaignSBStatus = async (profile, checkConfigAds, rule, item, status) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options = {
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
        campaigns: [{ campaignId: String(item.campaignId), state: status }],
      },
      meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [CampaignSBStatus] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [CampaignSBStatus] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Campaign",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SB",
          campaignId: item?.campaignId
        },
        {
          $set: {
            name: item?.campaignName,
            oldValue: item?.campaignStatus,
            newValue: status,
            changed: "Status"
          }
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Camapign Status",
        oldValue: item?.campaignStatus,
        newValue: status,
        updatedFrom: "Campaign",
        userId: rule?.userId,
        type: "SB"
      })

      await sbCampaignsSchema.findOneAndUpdate(
        {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId: item?.campaignId,
          reportDate: currentDate,
        },
        { $set: { status } },
        { upsert: true, new: true }
      ).lean()

      return { isSuccess: true, message: "Campaign Status Updated Successfully" }
    }
    else {
      return { isSuccess: false, message: "Failed to Update Campaign Status" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [CampaignSBStatus] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
}

const CampaignSDStatus = async (profile, checkConfigAds, rule, item, status) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options = {
      method: "PUT",
      url: `${profile.amazonUrl}/sd/campaigns`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Prefer": "return=representation",
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      data: [{ campaignId: String(item.campaignId), state: `${status}`.toLowerCase() }],
      meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" }
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [CampaignSDStatus] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [CampaignSDStatus] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Campaign",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SD",
          campaignId: item?.campaignId
        },
        {
          $set: {
            name: item?.campaignName,
            oldValue: item?.campaignStatus,
            newValue: status,
            changed: "Status"
          }
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Camapign Status",
        oldValue: item?.campaignStatus,
        newValue: status,
        updatedFrom: "Campaign",
        userId: rule?.userId,
        type: "SD"
      })

      await sdCampaignsSchema.findOneAndUpdate(
        {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId: item?.campaignId,
          reportDate: currentDate,
        },
        { $set: { status } },
        { upsert: true, new: true }
      ).lean()

      return { isSuccess: true, message: "Campaign Status Updated Successfully" }
    }
    else {
      return { isSuccess: false, message: "Failed to Update Campaign Status" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [CampaignSDStatus] Message: ${error || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
}

const PlacementSPBid = async (profile, checkConfigAds, rule, item, newBid) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    const placementName = SP_PLACEMENT_MAP[item?.placement];
    if (!placementName) return { isSuccess: false, message: `Unknown placement: ${item?.placement}` };

    const options = {
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
          {
            campaignId: String(item.campaignId),
            dynamicBidding: {
              placementBidding: [
                { placement: placementName, percentage: newBid },
              ],
            },
          },
        ],
      },
      meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" },
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [PlacementSPBid] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [PlacementSPBid] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Placement",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SP",
          campaignId: item?.campaignId,
          placement: item?.placement,
        },
        {
          $set: {
            name: item?.campaignName,
            oldValue: item?.placementBid,
            newValue: newBid,
            changed: "PlacementBid",
          },
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: `Update ${item?.placement || "Placement"} Placement Bid`,
        oldValue: item?.placementBid,
        newValue: newBid,
        updatedFrom: "Placement",
        userId: rule?.userId,
        type: "SP",
      });

      await placementSchema.findOneAndUpdate(
        {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId: item?.campaignId,
          placement: item?.placement,
          reportDate: currentDate,
        },
        { $set: { placementModifier: newBid } },
        { upsert: true, new: true }
      ).lean();

      return { isSuccess: true, message: "Placement Bid Updated Successfully" };
    } else {
      return { isSuccess: false, message: "Failed to Update Placement Bid" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [PlacementSPBid] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
};

const PlacementSBBid = async (profile, checkConfigAds, rule, item, newBid) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    const placementName = SB_PLACEMENT_MAP[item?.placement];
    if (!placementName) return { isSuccess: false, message: `Unknown placement: ${item?.placement}` };

    const options = {
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
        campaigns: [
          {
            campaignId: String(item.campaignId),
            bidding: {
              bidOptimization: false,
              bidAdjustmentsByPlacement: [
                { placement: placementName, percentage: newBid },
              ],
            },
          },
        ],
      },
      meta: { configId: checkConfigAds?._id, tokenKey: "adsAccessToken" },
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [PlacementSBBid] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [PlacementSBBid] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Placement",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SB",
          campaignId: item?.campaignId,
          placement: item?.placement,
        },
        {
          $set: {
            name: item?.campaignName,
            oldValue: item?.placementBid,
            newValue: newBid,
            changed: "PlacementBid",
          },
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: `Update ${item?.placement || "Placement"} Placement Bid`,
        oldValue: item?.placementBid,
        newValue: newBid,
        updatedFrom: "Placement",
        userId: rule?.userId,
        type: "SB",
      });

      await sbPlacementSchema.findOneAndUpdate(
        {
          configId: profile?.configId,
          profileId: profile?.profileId,
          campaignId: item?.campaignId,
          placement: item?.placement,
          reportDate: currentDate,
        },
        { $set: { placementModifier: newBid } },
        { upsert: true, new: true }
      ).lean();

      return { isSuccess: true, message: "Placement Bid Updated Successfully" };
    } else {
      return { isSuccess: false, message: "Failed to Update Placement Bid" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [PlacementSBBid] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
};

const TargetingSPBid = async (profile, checkConfigAds, rule, item, newBid) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options;

    if (item?.targetId?.startsWith("T-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sp/targets`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/vnd.sptargetingClause.v3+json",
          "Accept": "application/vnd.sptargetingClause.v3+json",
        },
        data: { targetingClauses: [{ targetId: item.targetId.replace("T-", ""), bid: Number(newBid) }] },
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else if (item?.targetId?.startsWith("K-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sp/keywords`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/vnd.spKeyword.v3+json",
          "Accept": "application/vnd.spKeyword.v3+json",
        },
        data: { keywords: [{ keywordId: item.targetId.replace("K-", ""), bid: Number(newBid) }] },
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else {
      return { isSuccess: false, message: `Unknown targetId prefix: ${item?.targetId}` };
    }

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [TargetingSPBid] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [TargetingSPBid] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Targeting",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SP",
          campaignId: item?.campaignId,
          adGroupId: item?.adGroupId,
          targetId: item?.targetId,
        },
        {
          $set: {
            name: item?.campaignName,
            adGroupName: item?.adGroupName,
            targetName: item?.targeting,
            targetType: item?.matchType,
            oldValue: item?.targetingBid,
            newValue: Number(newBid),
            changed: "TargetingBid",
          },
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Targeting Bid",
        targeting: item?.targeting,
        matchType: item?.matchType || item?.targetType,
        targetId: item?.targetId ? String(item.targetId).replace(/^[TK]-/, '') : null,
        oldValue: item?.targetingBid,
        newValue: newBid,
        updatedFrom: "Targeting",
        userId: rule?.userId,
        type: "SP",
      });

      await targetingSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          targeting: item?.targeting,
          targetId: item?.targetId,
          reportDate: currentDate,
        },
        { $set: { keywordBid: newBid } },
        { upsert: true, new: true }
      ).lean();

      return { isSuccess: true, message: "Targeting Bid Updated Successfully" };
    } else {
      return { isSuccess: false, message: "Failed to Update Targeting Bid" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [TargetingSPBid] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
};

const TargetingSBBid = async (profile, checkConfigAds, rule, item, newBid) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options;

    if (item?.targetId?.startsWith("T-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sb/targets`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: { targets: [{ campaignId: item?.campaignId, adGroupId: item?.adGroupId, targetId: item?.targetId.replace("T-", ""), bid: Number(newBid) }] },
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else if (item?.targetId?.startsWith("K-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sb/keywords`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: [{ campaignId: item?.campaignId, adGroupId: item?.adGroupId, keywordId: item?.targetId.replace("K-", ""), bid: Number(newBid) }],
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else {
      return { isSuccess: false, message: `Unknown targetId prefix: ${item?.targetId}` };
    }

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [TargetingSBBid] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [TargetingSBBid] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Targeting",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SB",
          campaignId: item?.campaignId,
          adGroupId: item?.adGroupId,
          targetId: item?.targetId,
        },
        {
          $set: {
            name: item?.campaignName,
            adGroupName: item?.adGroupName,
            targetName: item?.targeting,
            targetType: item?.matchType,
            oldValue: item?.targetingBid,
            newValue: Number(newBid),
            changed: "TargetingBid",
          },
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Targeting Bid",
        targeting: item?.targeting,
        matchType: item?.matchType || item?.targetType,
        targetId: item?.targetId ? String(item.targetId).replace(/^[TK]-/, '') : null,
        oldValue: item?.targetingBid,
        newValue: newBid,
        updatedFrom: "Targeting",
        userId: rule?.userId,
        type: "SB",
      });

      await sbTargetingSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          targeting: item?.targeting,
          targetId: item?.targetId,
          reportDate: currentDate,
        },
        { $set: { keywordBid: newBid } },
        { upsert: true, new: true }
      ).lean();

      return { isSuccess: true, message: "Targeting Bid Updated Successfully" };
    } else {
      return { isSuccess: false, message: "Failed to Update Targeting Bid" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [TargetingSBBid] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
};

const TargetingSDBid = async (profile, checkConfigAds, rule, item, newBid) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options;

    if (item?.targetId?.startsWith("T-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sd/targets`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: [{ targetId: item.targetId.replace("T-", ""), bid: Number(newBid) }],
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else {
      return { isSuccess: false, message: `Unknown targetId prefix: ${item?.targetId}` };
    }

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [TargetingSDBid] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [TargetingSDBid] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Targeting",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SD",
          campaignId: item?.campaignId,
          adGroupId: item?.adGroupId,
          targetId: item?.targetId,
        },
        {
          $set: {
            name: item?.campaignName,
            adGroupName: item?.adGroupName,
            targetName: item?.targeting,
            targetType: item?.matchType,
            oldValue: item?.targetingBid,
            newValue: Number(newBid),
            changed: "TargetingBid",
          },
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Targeting Bid",
        targeting: item?.targeting,
        matchType: item?.matchType || item?.targetType,
        targetId: item?.targetId ? String(item.targetId).replace(/^[TK]-/, '') : null,
        oldValue: item?.targetingBid,
        newValue: newBid,
        updatedFrom: "Targeting",
        userId: rule?.userId,
        type: "SD",
      });

      await sdTargetingSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          targeting: item?.targeting,
          targetId: item?.targetId,
          reportDate: currentDate,
        },
        { $set: { keywordBid: newBid } },
        { upsert: true, new: true }
      ).lean();

      return { isSuccess: true, message: "Targeting Bid Updated Successfully" };
    } else {
      return { isSuccess: false, message: "Failed to Update Targeting Bid" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [TargetingSDBid] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
};

const TargetingSPStatus = async (profile, checkConfigAds, rule, item, status) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options;

    if (item?.targetId?.startsWith("T-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sp/targets`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/vnd.sptargetingClause.v3+json",
          "Accept": "application/vnd.sptargetingClause.v3+json",
        },
        data: { targetingClauses: [{ targetId: item.targetId.replace("T-", ""), state: `${status}`.toUpperCase() }] },
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else if (item?.targetId?.startsWith("K-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sp/keywords`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/vnd.spKeyword.v3+json",
          "Accept": "application/vnd.spKeyword.v3+json",
        },
        data: { keywords: [{ keywordId: item.targetId.replace("K-", ""), state: `${status}`.toUpperCase() }] },
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else {
      return { isSuccess: false, message: `Unknown targetId prefix: ${item?.targetId}` };
    }

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [TargetingSPStatus] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [TargetingSPStatus] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Targeting",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SP",
          campaignId: item?.campaignId,
          adGroupId: item?.adGroupId,
          targetId: item?.targetId,
        },
        {
          $set: {
            name: item?.campaignName,
            adGroupName: item?.adGroupName,
            targetName: item?.targeting,
            targetType: item?.matchType,
            oldValue: item?.status,
            newValue: status,
            changed: "TargetingStatus",
          },
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Targeting Status",
        targeting: item?.targeting,
        matchType: item?.matchType || item?.targetType,
        targetId: item?.targetId ? String(item.targetId).replace(/^[TK]-/, '') : null,
        oldValue: item?.status,
        newValue: status,
        updatedFrom: "Targeting",
        userId: rule?.userId,
        type: "SP",
      });

      await targetingSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          targeting: item?.targeting,
          targetId: item?.targetId,
          reportDate: currentDate,
        },
        { $set: { status } },
        { upsert: true, new: true }
      ).lean();

      return { isSuccess: true, message: "Targeting Status Updated Successfully" };
    } else {
      return { isSuccess: false, message: "Failed to Update Targeting Status" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [TargetingSPStatus] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
};

const TargetingSBStatus = async (profile, checkConfigAds, rule, item, status) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options;

    if (item?.targetId?.startsWith("T-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sb/targets`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: { targets: [{ campaignId: item?.campaignId, adGroupId: item?.adGroupId, targetId: item?.targetId.replace("T-", ""), state: `${status}`.toLowerCase() }] },
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else if (item?.targetId?.startsWith("K-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sb/keywords`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: [{ campaignId: item?.campaignId, adGroupId: item?.adGroupId, keywordId: item?.targetId.replace("K-", ""), state: `${status}`.toLowerCase() }],
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else {
      return { isSuccess: false, message: `Unknown targetId prefix: ${item?.targetId}` };
    }

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [TargetingSBStatus] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [TargetingSBStatus] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Targeting",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SB",
          campaignId: item?.campaignId,
          adGroupId: item?.adGroupId,
          targetId: item?.targetId,
        },
        {
          $set: {
            name: item?.campaignName,
            adGroupName: item?.adGroupName,
            targetName: item?.targeting,
            targetType: item?.matchType,
            oldValue: item?.status,
            newValue: status,
            changed: "TargetingStatus",
          },
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Targeting Status",
        targeting: item?.targeting,
        matchType: item?.matchType || item?.targetType,
        targetId: item?.targetId ? String(item.targetId).replace(/^[TK]-/, '') : null,
        oldValue: item?.status,
        newValue: status,
        updatedFrom: "Targeting",
        userId: rule?.userId,
        type: "SB",
      });

      await sbTargetingSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          targeting: item?.targeting,
          targetId: item?.targetId,
          reportDate: currentDate,
        },
        { $set: { status } },
        { upsert: true, new: true }
      ).lean();

      return { isSuccess: true, message: "Targeting Status Updated Successfully" };
    } else {
      return { isSuccess: false, message: "Failed to Update Targeting Status" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [TargetingSBStatus] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
};

const TargetingSDStatus = async (profile, checkConfigAds, rule, item, status) => {
  try {
    const now = moment().tz(profile.timezone);
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm");

    let options;

    if (item?.targetId?.startsWith("T-")) {
      options = {
        method: "PUT",
        url: `${profile.amazonUrl}/sd/targets`,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: [{ targetId: item.targetId.replace("T-", ""), state: `${status}`.toLowerCase() }],
        meta: { configId: rule.configId, tokenKey: "adsAccessToken" },
      };
    } else {
      return { isSuccess: false, message: `Unknown targetId prefix: ${item?.targetId}` };
    }

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [TargetingSDStatus] URL: ${options.url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(options.data)}`
    });

    const response = await retryWithBackoff(() => amazonAxios(options));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [TargetingSDStatus] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response.status == 207) {
      await recommandationCampaignByRuleSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          userId: rule?.userId,
          ruleSchema: "Targeting",
          ruleId: rule?._id,
          ruleDate: currentDate,
          ruleTime: currentTime,
          type: "SD",
          campaignId: item?.campaignId,
          adGroupId: item?.adGroupId,
          targetId: item?.targetId,
        },
        {
          $set: {
            name: item?.campaignName,
            adGroupName: item?.adGroupName,
            targetName: item?.targeting,
            targetType: item?.matchType,
            oldValue: item?.status,
            newValue: status,
            changed: "TargetingStatus",
          },
        },
        { upsert: true, new: true }
      ).lean();

      await recordCampaignHistorySafely({
        configId: profile?.configId,
        profileId: profile?.profileId,
        changeLevel: item?.campaignId,
        changeType: "Update Targeting Status",
        targeting: item?.targeting,
        matchType: item?.matchType || item?.targetType,
        targetId: item?.targetId ? String(item.targetId).replace(/^[TK]-/, '') : null,
        oldValue: item?.status,
        newValue: status,
        updatedFrom: "Targeting",
        userId: rule?.userId,
        type: "SD",
      });

      await sdTargetingSchema.findOneAndUpdate(
        {
          configId: rule?.configId,
          profileId: rule?.profileId,
          targeting: item?.targeting,
          targetId: item?.targetId,
          reportDate: currentDate,
        },
        { $set: { status } },
        { upsert: true, new: true }
      ).lean();

      return { isSuccess: true, message: "Targeting Status Updated Successfully" };
    } else {
      return { isSuccess: false, message: "Failed to Update Targeting Status" };
    }
  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [TargetingSDStatus] Message: ${error?.message || error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message || error };
  }
};

const SaveSearchTermRecord = async (rule, item, action, currentDate, currentTime, adType) => {
  const queryFilter = {
    configId: rule?.configId,
    profileId: rule?.profileId,
    userId: rule?.userId,
    ruleSchema: "SearchTerm",
    ruleId: rule?._id,
    ruleDate: currentDate,
    ruleTime: currentTime,
    type: adType,
    campaignId: item?.campaignId,
    adGroupId: item?.adGroupId,
    keywordId: item?.keywordId,
    searchTerm: item?.searchTerm,
  };
  const updatePayload = {
    $set: {
      name: item?.campaignName,
      adGroupName: item?.adGroupName,
      searchTerm: item?.searchTerm,
      targetType: action?.matchType,
      changed: action?.actionName, // "AddAsTargeting" || "AddAsNegativeTargeting"
    },
  };

  recommendation_logs({
    log_type: "info",
    message: `[DB Storage Request] Schema: recommandationCampaignByRuleSchema | Query: ${JSON.stringify(queryFilter)} | Update: ${JSON.stringify(updatePayload)}`
  });

  try {
    const result = await recommandationCampaignByRuleSchema.findOneAndUpdate(
      queryFilter,
      updatePayload,
      { upsert: true, new: true }
    ).lean();

    await recordCampaignHistorySafely({
      configId: rule?.configId,
      profileId: rule?.profileId,
      changeLevel: item?.campaignId,
      changeType: action?.actionName === "AddAsNegativeTargeting" ? "Add Negative Target" : "Add Target",
      targeting: item?.searchTerm,
      matchType: action?.matchType || "EXACT",
      oldValue: "—",
      newValue: action?.actionName === "AddAsNegativeTargeting" ? `Negative (${action?.matchType || "EXACT"})` : `Target (${action?.matchType || "EXACT"})`,
      updatedFrom: "Search Term",
      userId: rule?.userId,
      type: adType || "SP",
    });

    recommendation_logs({
      log_type: "info",
      message: `[DB Storage Response Success] Schema: recommandationCampaignByRuleSchema | RecordId: ${result?._id}`
    });
  } catch (dbErr) {
    recommendation_logs({
      log_type: "error",
      message: `[DB Storage Error] Schema: recommandationCampaignByRuleSchema | Error: ${dbErr?.message}`
    });
  }
};

const AddToSPTargeting = async (item, profile, checkConfigAds, matchTypes = ["EXACT"]) => {
  try {
    const isASIN = isValidASIN(item?.searchTerm);

    if (isASIN) {
      const url = `${profile.amazonUrl}/sp/targets`;
      const payload = {
        targetingClauses: [{
          campaignId: String(item.campaignId),
          adGroupId: String(item.adGroupId),
          expression: [{ type: "ASIN_SAME_AS", value: item.searchTerm }],
          expressionType: "MANUAL",
          bid: Number(item?.suggestedBid || 1),
          state: "ENABLED",
        }],
      };

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Request] [SP Product Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(payload)}`
      });

      const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: url,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/vnd.spTargetingClause.v3+json",
          "Accept": "application/vnd.spTargetingClause.v3+json",
        },
        data: payload,
      }));

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Response] [SP Product Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
      });

      if (response?.status === 207) return { isSuccess: true, message: "Product targeting added" };
      return { isSuccess: false, message: "Product targeting not added" };
    }

    // Keyword targeting
    const keywords = matchTypes.map(type => ({
      campaignId: String(item.campaignId),
      adGroupId: String(item.adGroupId),
      keywordText: item.searchTerm,
      matchType: type.toUpperCase(),
      bid: Number(item?.suggestedBid || 1),
      state: "ENABLED",
    }));

    const url = `${profile.amazonUrl}/sp/keywords`;
    const payload = { keywords };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [SP Keyword Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(payload)}`
    });

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: url,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.spKeyword.v3+json",
        "Accept": "application/vnd.spKeyword.v3+json",
      },
      data: payload,
    }));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [SP Keyword Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response?.status === 207) return { isSuccess: true, message: "Keyword targeting added" };
    return { isSuccess: false, message: "Keyword targeting not added" };

  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [AddToSPTargeting] Message: ${error?.message} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message };
  }
};

const AddToSBTargeting = async (item, profile, checkConfigAds, matchTypes = ["EXACT"]) => {
  try {
    const isASIN = isValidASIN(item?.searchTerm);

    if (isASIN) {
      const url = `${profile.amazonUrl}/sb/targets`;
      const payload = {
        targets: [{
          campaignId: String(item.campaignId),
          adGroupId: String(item.adGroupId),
          expression: [{ type: "asinSameAs", value: item.searchTerm }],
          expressionType: "manual",
        }],
      };

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Request] [SB Product Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(payload)}`
      });

      const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: url,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: payload,
      }));

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Response] [SB Product Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
      });

      if (response?.status === 207) return { isSuccess: true, message: "Product targeting added" };
      return { isSuccess: false, message: "Product targeting not added" };
    }

    // Keyword targeting
    const keywords = matchTypes.map(type => ({
      campaignId: String(item.campaignId),
      adGroupId: String(item.adGroupId),
      keywordText: item.searchTerm,
      matchType: type.toLowerCase(),
    }));

    const url = `${profile.amazonUrl}/sb/keywords`;

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [SB Keyword Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(keywords)}`
    });

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: url,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      data: keywords,
    }));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [SB Keyword Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response?.status === 207) return { isSuccess: true, message: "Keyword targeting added", responseData: response?.data };
    return { isSuccess: false, message: "Keyword targeting not added" };

  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [AddToSBTargeting] Message: ${error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message };
  }
};

const AddToSDTargeting = async (item, profile, checkConfigAds, matchTypes = ["EXACT"]) => {
  try {
    const isASIN = isValidASIN(item?.searchTerm);

    if (isASIN) {
      const url = `${profile.amazonUrl}/sd/targets`;
      const payload = [{
        campaignId: String(item.campaignId),
        adGroupId: String(item.adGroupId),
        expression: [{ type: "asinSameAs", value: item.searchTerm }],
        expressionType: "manual",
        state: "enabled",
      }];

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Request] [SD Product Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(payload)}`
      });

      const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: url,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: payload,
      }));

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Response] [SD Product Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
      });

      if (response?.status === 207) return { isSuccess: true, message: "Product targeting added" };
      return { isSuccess: false, message: "Product targeting not added" };
    }

    // Keyword targeting
    const keywords = matchTypes.map(type => ({
      campaignId: String(item.campaignId),
      adGroupId: String(item.adGroupId),
      keywordText: item.searchTerm,
      matchType: type.toLowerCase(),
      bid: Number(item?.suggestedBid || 1),
    }));

    const url = `${profile.amazonUrl}/sd/keywords`;

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [SD Keyword Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(keywords)}`
    });

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: url,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
      },
      data: keywords,
    }));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [SD Keyword Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    if (response?.status === 207) return { isSuccess: true, message: "Keyword targeting added" };
    return { isSuccess: false, message: "Keyword targeting not added" };

  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [AddToSDTargeting] Message: ${error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message };
  }
};

const AddToSPNegativeTargeting = async (item, profile, checkConfigAds, matchTypes = ["NEGATIVE_PHRASE"]) => {
  try {
    const isASIN = isValidASIN(item?.searchTerm);

    if (isASIN) {
      const url = `${profile.amazonUrl}/sp/negativeTargets`;
      const payload = {
        negativeTargetingClauses: [{
          campaignId: String(item.campaignId),
          adGroupId: String(item.adGroupId),
          expression: [{ type: "ASIN_SAME_AS", value: `${item.searchTerm}`.toUpperCase() }],
          state: "ENABLED",
        }],
      };

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Request] [SP Negative Product Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(payload)}`
      });

      const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: url,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/vnd.spNegativeTargetingClause.v3+json",
          "Accept": "application/vnd.spNegativeTargetingClause.v3+json",
        },
        data: payload,
      }));

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Response] [SP Negative Product Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
      });

      return { isSuccess: true, message: "Negative product added" };
    }

    // Negative keyword
    const url = `${profile.amazonUrl}/sp/negativeKeywords`;
    const payload = {
      negativeKeywords: matchTypes.map(type => ({
        campaignId: String(item.campaignId),
        adGroupId: String(item.adGroupId),
        keywordText: item.searchTerm,
        matchType: type.toUpperCase(),
        state: "ENABLED",
      })),
    };

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [SP Negative Keyword Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(payload)}`
    });

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: url,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.spNegativeKeyword.v3+json",
        "Accept": "application/vnd.spNegativeKeyword.v3+json",
      },
      data: payload,
    }));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [SP Negative Keyword Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    return { isSuccess: true, message: "Negative keyword added" };

  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [AddToSPNegativeTargeting] Message: ${error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message };
  }
};

const AddToSBNegativeTargeting = async (item, profile, checkConfigAds, matchTypes = ["NEGATIVE_PHRASE"]) => {
  try {
    const isASIN = isValidASIN(item?.searchTerm);

    if (isASIN) {
      const url = `${profile.amazonUrl}/sb/negativeTargets`;
      const payload = {
        negativeTargets: [{
          campaignId: String(item.campaignId),
          adGroupId: String(item.adGroupId),
          expression: [{ type: "asinSameAs", value: `${item.searchTerm}`.toUpperCase() }],
        }],
      };

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Request] [SB Negative Product Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(payload)}`
      });

      const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: url,
        headers: {
          "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.sbcreatenegativetargetsrequest.v3+json",
        },
        data: payload,
      }));

      recommendation_logs({
        log_type: "info",
        message: `[Amazon API Response] [SB Negative Product Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
      });

      return { isSuccess: true, message: "Negative product added" };
    }

    // Negative keyword
    const url = `${profile.amazonUrl}/sb/negativeKeywords`;
    const payload = matchTypes.map(type => ({
      campaignId: String(item.campaignId),
      adGroupId: String(item.adGroupId),
      keywordText: item.searchTerm,
      matchType: type.toUpperCase() === "NEGATIVE_EXACT" ? "negativeExact" : "negativePhrase",
    }));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Request] [SB Negative Keyword Target] URL: ${url} | ProfileId: ${profile?.profileId} | Payload: ${JSON.stringify(payload)}`
    });

    const response = await retryWithBackoff(() => amazonAxios({
      method: "POST",
      url: url,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
        "Amazon-Advertising-API-Scope": profile.profileId,
        "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/vnd.sbkeywordresponse.v3+json",
      },
      data: payload,
    }));

    recommendation_logs({
      log_type: "info",
      message: `[Amazon API Response] [SB Negative Keyword Target] Status: ${response?.status} | Data: ${JSON.stringify(response?.data)}`
    });

    return { isSuccess: true, message: "Negative keyword added" };

  } catch (error) {
    recommendation_logs({
      log_type: "error",
      message: `[Amazon API Error] [AddToSBNegativeTargeting] Message: ${error} | Response: ${JSON.stringify(error?.response?.data || {})}`
    });
    return { isSuccess: false, message: "An internal server error occurred", error: error?.message };
  }
};

module.exports = {
  CampaignSPBudget,
  CampaignSPStatus,
  CampaignSBBudget,
  CampaignSBStatus,
  CampaignSDBudget,
  CampaignSDStatus,

  PlacementSPBid,
  PlacementSBBid,

  TargetingSPBid,
  TargetingSBBid,
  TargetingSDBid,
  TargetingSPStatus,
  TargetingSBStatus,
  TargetingSDStatus,

  AddToSPTargeting,
  AddToSBTargeting,
  AddToSDTargeting,
  AddToSPNegativeTargeting,
  AddToSBNegativeTargeting,
  SaveSearchTermRecord,
};
