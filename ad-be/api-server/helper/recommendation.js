const moment = require("moment");
const { retryWithBackoff } = require("./retryHelper");


const amazonAxios = require("./amazonAxios");

const campaignsSchema = require("../models/campaign.model");
const sbCampaignsSchema = require("../models/sbCampaign.model");
const sdCampaignsSchema = require("../models/sdCampaign.model");

const targetingSchema = require("../models/targeting.model");
const sbTargetingSchema = require("../models/sbTargeting.model");
const sdTargetingSchema = require("../models/sdTargeting.model");

const { isValidASIN } = require("./common");

const addToSPTargeting = async (
    item,
    profile,
    checkConfigAds,
    matchTypes = ["EXACT"]
) => {
    try {
        const isASIN = isValidASIN(item.searchTerm || item.asin);

        // =========================
        // 🟢 PRODUCT TARGETING
        // =========================
        if (isASIN) {
            const body = {
                targetingClauses: [
                    {
                        campaignId: String(item.campaignId),
                        adGroupId: String(item.adGroupId),
                        expression: [{ type: "ASIN_SAME_AS", value: item.searchTerm || item.asin }],
                        expressionType: "MANUAL",
                        bid: Number(item?.suggestedBid || 1),
                        state: "ENABLED"
                    }
                ]
            };

            const response = await retryWithBackoff(() => amazonAxios({
                method: "POST",
                url: `${profile.amazonUrl}/sp/targets`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Content-Type": "application/vnd.spTargetingClause.v3+json",
                    "Accept": "application/vnd.spTargetingClause.v3+json"
                },
                data: body
            }));

            if (response?.status === 207) {
                return { isSuccess: true, message: "Product targeting added" };
            }

            return { isSuccess: false, message: "Product targeting not added" };
        }

        // =========================
        // 🔵 KEYWORD TARGETING
        // =========================
        const keywords = matchTypes.map(type => ({
            campaignId: String(item.campaignId),
            adGroupId: String(item.adGroupId),
            keywordText: item.searchTerm,
            matchType: type.toUpperCase(),
            bid: Number(item?.suggestedBid || 1),
            state: "ENABLED"
        }));

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${profile.amazonUrl}/sp/keywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spKeyword.v3+json",
                "Accept": "application/vnd.spKeyword.v3+json"
            },
            data: { keywords }
        }));

        if (response?.status === 207) {
            return { isSuccess: true, message: "Keyword targeting added" };
        }

        return { isSuccess: false, message: "Keyword targeting not added" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
};

const addToSBTargeting = async (
    item,
    profile,
    checkConfigAds,
    matchTypes = ["EXACT"]
) => {
    try {
        const isASIN = isValidASIN(item.searchTerm || item.asin);

        // =========================
        // 🟢 PRODUCT TARGETING
        // =========================
        if (isASIN) {
            const body = {
                targets: [
                    {
                        campaignId: String(item.campaignId),
                        adGroupId: String(item.adGroupId),
                        expression: [{ type: "asinSameAs", value: item.searchTerm || item.asin }],
                        expressionType: "manual",
                        // bid: Number(item?.suggestedBid || 1),
                    }
                ]
            };

            const response = await retryWithBackoff(() => amazonAxios({
                method: "POST",
                url: `${profile.amazonUrl}/sb/targets`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Content-Type": "application/json",
                },
                data: body
            }));

            if (response?.status === 207) {
                return { isSuccess: true, message: "Product targeting added" };
            }

            return { isSuccess: false, message: "Product targeting not added" };
        }

        // =========================
        // 🔵 KEYWORD TARGETING
        // =========================
        const keywords = matchTypes.map(type => ({
            campaignId: String(item.campaignId),
            adGroupId: String(item.adGroupId),
            keywordText: item.searchTerm,
            matchType: type.toLowerCase(),
            // bid: Number(item?.suggestedBid || 1),
        }));

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${profile.amazonUrl}/sb/keywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: keywords
        }));

        if (response?.status === 207) {
            return { isSuccess: true, message: "Keyword targeting added" };
        }

        return { isSuccess: false, message: "Keyword targeting not added" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
};

const addToSDTargeting = async (
    item,
    profile,
    checkConfigAds,
    matchTypes = ["EXACT"]
) => {
    try {
        const isASIN = isValidASIN(item.searchTerm || item.asin);

        // =========================
        // 🟢 PRODUCT TARGETING
        // =========================
        if (isASIN) {
            const body = [
                {
                    campaignId: String(item.campaignId),
                    adGroupId: String(item.adGroupId),
                    expression: [{ type: "asinSameAs", value: item.searchTerm || item.asin }],
                    expressionType: "manual",
                    // bid: Number(item?.suggestedBid || 1),
                    state: "enabled"
                }
            ];

            const response = await retryWithBackoff(() => amazonAxios({
                method: "POST",
                url: `${profile.amazonUrl}/sd/targets`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Content-Type": "application/json",
                },
                data: body
            }));

            if (response?.status === 207) {
                return { isSuccess: true, message: "Product targeting added" };
            }

            return { isSuccess: false, message: "Product targeting not added" };
        }

        // =========================
        // 🔵 KEYWORD TARGETING
        // =========================
        const keywords = matchTypes.map(type => ({
            campaignId: String(item.campaignId),
            adGroupId: String(item.adGroupId),
            keywordText: item.searchTerm,
            matchType: type.toLowerCase(),
            bid: Number(item?.suggestedBid || 1),
        }));

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${profile.amazonUrl}/sd/keywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: keywords
        }));

        if (response?.status === 207) {
            return { isSuccess: true, message: "Keyword targeting added" };
        }

        return { isSuccess: false, message: "Keyword targeting not added" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
};

const AddToTargeting = async (
    campaignType,
    item,
    profile,
    checkConfigAds,
    matchTypes = ["EXACT"]
) => {
    switch (campaignType) {
        case "SP":
            return await addToSPTargeting(item, profile, checkConfigAds, matchTypes);
        case "SB":
            return await addToSBTargeting(item, profile, checkConfigAds, matchTypes);
        case "SD":
            return await addToSDTargeting(item, profile, checkConfigAds, matchTypes);
        default:
            return { isSuccess: false, message: "Invalid campaign type" };
    }
};

const updateSPTargetingBid = async (item, profile, checkConfigAds, percentage) => {
    try {
        let newBid = item.keywordBid;

        newBid = newBid + (newBid * percentage / 100);

        if (newBid < 1) newBid = 1;

        const isTarget = item.targetId?.startsWith("T-");

        const payload = isTarget
            ? { targetingClauses: [{ targetId: item.targetId.replace("T-", ""), bid: Number(newBid) }] }
            : { keywords: [{ keywordId: item.targetId.replace("K-", ""), bid: Number(newBid) }] };

        const url = isTarget ? "/sp/targets" : "/sp/keywords";

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}${url}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": isTarget ? "application/vnd.sptargetingClause.v3+json" : "application/vnd.spKeyword.v3+json",
                "Accept": isTarget ? "application/vnd.sptargetingClause.v3+json" : "application/vnd.spKeyword.v3+json",
            },
            data: payload
        }));

        if (response?.status === 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await targetingSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    targeting: item?.targeting,
                    targetId: item?.targetId,
                    reportDate: currentDate
                },
                { $set: { keywordBid: Number(newBid) } },
                { new: true, upsert: true }
            ).lean()
        }

        return { isSuccess: true, message: "Bid updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const updateSBTargetingBid = async (item, profile, checkConfigAds, percentage) => {
    try {
        let newBid = item.keywordBid;

        newBid = newBid + (newBid * percentage / 100);

        if (newBid < 1) newBid = 1;

        const isTarget = item.targetId?.startsWith("T-");

        const payload = isTarget ? { targets: [{ targetId: item.targetId.replace("T-", ""), bid: Number(newBid) }] } : [{ keywordId: item.targetId.replace("K-", ""), bid: Number(newBid) }];

        const url = isTarget ? "/sb/targets" : "/sb/keywords";

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}${url}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: payload
        }));

        if (response?.status === 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await sbTargetingSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    targeting: item?.targeting,
                    targetId: item?.targetId,
                    reportDate: currentDate
                },
                { $set: { keywordBid: Number(newBid) } },
                { new: true, upsert: true }
            ).lean()
        }

        return { isSuccess: true, message: "Bid updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const updateSDTargetingBid = async (item, profile, checkConfigAds, percentage) => {
    try {
        let newBid = item.keywordBid;

        newBid = newBid + (newBid * percentage / 100);

        if (newBid < 1) newBid = 1;

        const isTarget = item.targetId?.startsWith("T-");

        const payload = isTarget ? [{ targetId: item.targetId.replace("T-", ""), bid: Number(newBid) }] : [{ keywordId: item.targetId.replace("K-", ""), bid: Number(newBid) }];

        const url = isTarget ? "/sd/targets" : "/sd/keywords";

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}${url}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: payload
        }));

        if (response?.status === 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await sdTargetingSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    targeting: item?.targeting,
                    targetId: item?.targetId,
                    reportDate: currentDate
                },
                { $set: { keywordBid: Number(newBid) } },
                { new: true, upsert: true }
            ).lean()
        }

        return { isSuccess: true, message: "Bid updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const UpdateTargetingBid = async (adType, item, profile, checkConfigAds, percentage) => {
    switch (adType) {
        case "SP":
            return await updateSPTargetingBid(item, profile, checkConfigAds, percentage);
        case "SB":
            return await updateSBTargetingBid(item, profile, checkConfigAds, percentage);
        case "SD":
            return await updateSDTargetingBid(item, profile, checkConfigAds, percentage);
        default:
            return { isSuccess: false, message: "Invalid ad type" };
    }
};

const updateSPTargetingStatus = async (item, profile, checkConfigAds, status) => {
    try {
        const isTarget = item.targetId?.startsWith("T-");

        const payload = isTarget
            ? { targetingClauses: [{ targetId: item.targetId.replace("T-", ""), state: status }] }
            : { keywords: [{ keywordId: item.targetId.replace("K-", ""), state: status }] };

        const url = isTarget ? "/sp/targets" : "/sp/keywords";

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}${url}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": isTarget ? "application/vnd.sptargetingClause.v3+json" : "application/vnd.spKeyword.v3+json",
                "Accept": isTarget ? "application/vnd.sptargetingClause.v3+json" : "application/vnd.spKeyword.v3+json",
            },
            data: payload
        }));

        if (response?.status === 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await targetingSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    targeting: item?.targeting,
                    targetId: item?.targetId,
                    reportDate: currentDate
                },
                { $set: { status: status } },
                { new: true, upsert: true }
            ).lean()
        }

        return { isSuccess: true, message: "Status updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const updateSBTargetingStatus = async (item, profile, checkConfigAds, status) => {
    try {
        const isTarget = item.targetId?.startsWith("T-");

        const payload = isTarget
            ? { targets: [{ targetId: item.targetId.replace("T-", ""), state: `${status}`.toLowerCase() }] }
            : [{ keywordId: item.targetId.replace("K-", ""), state: `${status}`.toLowerCase() }];

        const url = isTarget ? "/sb/targets" : "/sb/keywords";

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}${url}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: payload
        }));

        if (response?.status === 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await sbTargetingSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    targeting: item?.targeting,
                    targetId: item?.targetId,
                    reportDate: currentDate
                },
                { $set: { status: `${status}`.toUpperCase() } },
                { new: true, upsert: true }
            ).lean()
        }

        return { isSuccess: true, message: "Status updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const updateSDTargetingStatus = async (item, profile, checkConfigAds, status) => {
    try {
        const isTarget = item.targetId?.startsWith("T-");

        const payload = isTarget
            ? [{ targetId: item.targetId.replace("T-", ""), state: `${status}`.toLowerCase() }]
            : [{ keywordId: item.targetId.replace("K-", ""), state: `${status}`.toLowerCase() }];

        const url = isTarget ? "/sd/targets" : "/sd/keywords";

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}${url}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
            },
            data: payload
        }));

        if (response?.status === 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await sdTargetingSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    targeting: item?.targeting,
                    targetId: item?.targetId,
                    reportDate: currentDate
                },
                { $set: { status: `${status}`.toUpperCase() } },
                { new: true, upsert: true }
            ).lean()
        }

        return { isSuccess: true, message: "Status updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const UpdateTargetingStatus = async (adType, item, profile, checkConfigAds, status) => {
    switch (adType) {
        case "SP":
            return await updateSPTargetingStatus(item, profile, checkConfigAds, status);
        case "SB":
            return await updateSBTargetingStatus(item, profile, checkConfigAds, status);
        case "SD":
            return await updateSDTargetingStatus(item, profile, checkConfigAds, status);
        default:
            return { isSuccess: false, message: "Invalid ad type" };
    }
};

const addToSPNegativeTargeting = async (
    item,
    profile,
    checkConfigAds,
    matchTypes = ["NEGATIVE_PHRASE"]
) => {
    try {
        const value = item.word || item.searchTerm || item.asin;
        const isASIN = isValidASIN(value);

        // =========================
        // 🔴 NEGATIVE PRODUCT
        // =========================
        if (isASIN) {
            const body = {
                negativeTargetingClauses: [
                    {
                        campaignId: String(item.campaignId),
                        adGroupId: String(item.adGroupId),
                        expression: [{ type: "ASIN_SAME_AS", value: `${value}`?.toUpperCase() }],
                        state: "ENABLED"
                    }
                ]
            };

            await retryWithBackoff(() => amazonAxios({
                method: "POST",
                url: `${profile.amazonUrl}/sp/negativeTargets`,
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Content-Type": "application/vnd.spNegativeTargetingClause.v3+json",
                    "Accept": "application/vnd.spNegativeTargetingClause.v3+json"
                },
                data: body
            }));

            return { isSuccess: true, message: "Negative product added" };
        }

        // =========================
        // 🟡 NEGATIVE KEYWORD
        // =========================
        const body = {
            negativeKeywords: matchTypes.map(type => ({
                campaignId: String(item.campaignId),
                adGroupId: String(item.adGroupId),
                keywordText: item.searchTerm,
                matchType: type.toUpperCase(),
                state: "ENABLED"
            }))
        };


        await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${profile.amazonUrl}/sp/negativeKeywords`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spNegativeKeyword.v3+json",
                "Accept": "application/vnd.spNegativeKeyword.v3+json"
            },
            data: body
        }));

        return { isSuccess: true, message: "Negative keyword added" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const addToSBNegativeTargeting = async (
    item,
    profile,
    checkConfigAds,
    matchTypes = ["NEGATIVE_PHRASE"]
) => {
    try {
        const value = item.word || item.searchTerm || item.asin;
        const isASIN = isValidASIN(value);

        // =========================
        // 🔴 NEGATIVE PRODUCT
        // =========================
        if (isASIN) {
            const body = {
                negativeTargets: [
                    {
                        campaignId: String(item.campaignId),
                        adGroupId: String(item.adGroupId),
                        expression: [{ type: "asinSameAs", value: `${value}`?.toUpperCase() }],
                    }
                ]
            };

            await retryWithBackoff(() => amazonAxios({
                method: "POST",
                url: `${profile.amazonUrl}/sb/negativeTargets`,
                meta: { configId: profile?.configId || checkConfigAds?._id?.toString(), profileId: profile?.profileId },
                headers: {
                    "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                    "Amazon-Advertising-API-Scope": profile.profileId,
                    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                    "Content-Type": "application/json",
                    "Accept": "application/vnd.sbcreatenegativetargetsrequest.v3+json"
                },
                data: body
            }));

            return { isSuccess: true, message: "Negative product added" };
        }

        // =========================
        // 🟡 NEGATIVE KEYWORD
        // =========================
        const body = matchTypes.map(type => ({
            campaignId: String(item.campaignId),
            adGroupId: String(item.adGroupId),
            keywordText: item.searchTerm,
            matchType: type.toUpperCase() === "NEGATIVE_EXACT" ? "negativeExact" : "negativePhrase",
        }));

        await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${profile.amazonUrl}/sb/negativeKeywords`,
            meta: { configId: profile?.configId || checkConfigAds?._id?.toString(), profileId: profile?.profileId },
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/json",
                "Accept": "application/vnd.sbkeywordresponse.v3+json"
            },
            data: body
        }));

        return { isSuccess: true, message: "Negative keyword added" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const AddToNegativeTargeting = async (campaignType, item, profile, checkConfigAds, matchTypes = ["PHRASE"]) => {
    switch (campaignType) {
        case "SP":
            return await addToSPNegativeTargeting(item, profile, checkConfigAds, matchTypes);
        case "SB":
            return await addToSBNegativeTargeting(item, profile, checkConfigAds, matchTypes);
        default:
            return { isSuccess: false, message: "Invalid ad type" };
    }
};

const getSuggestedBid = async (item, profile, checkConfigAds) => {
    try {
        const body = {
            adGroupId: Number(item.adGroupId),
            campaignId: Number(item.campaignId),
            includeAnalysis: true,
            recommendationType: "BIDS_FOR_EXISTING_AD_GROUP",
            targetingExpressions: [
                {
                    type: "KEYWORD_EXACT_MATCH",
                    value: item.searchTerm
                },
                {
                    type: "KEYWORD_PHRASE_MATCH",
                    value: item.searchTerm
                },
                {
                    type: "KEYWORD_BROAD_MATCH",
                    value: item.searchTerm
                }
            ]
        };

        const response = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${profile.amazonUrl}/sp/targets/bid/recommendations`,
            meta: { configId: profile?.configId || checkConfigAds?._id?.toString(), profileId: profile?.profileId },
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.spthemebasedbidrecommendation.v3+json",
                "Accept": "application/vnd.spthemebasedbidrecommendation.v3+json"
            },
            data: body
        }));

        let recommendations = response?.data?.bidRecommendations?.[0]?.bidRecommendationsForTargetingExpressions || [];

        recommendations = recommendations?.map((r) => ({
            targetingType: `${r?.targetingExpression?.type}`?.split("_")?.[1],
            bidValues: r?.bidValues,
        }))

        return {
            recommendations
        };

    } catch (error) {
        return {
            recommendations: [],
            message: error?.response?.data || error.message
        };
    }
};

const updateSPCampaignBudget = async (item, profile, checkConfigAds, percentage) => {
    try {
        let newBudget = item.budget;

        newBudget = newBudget + (newBudget * percentage / 100);

        if (newBudget < 1) newBudget = 1;

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}/sp/campaigns`,
            meta: { configId: profile?.configId || checkConfigAds?._id?.toString(), profileId: profile?.profileId },
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Prefer": "return=representation",
                "Accept": "application/vnd.spCampaign.v3+json",
                "Content-Type": "application/vnd.spCampaign.v3+json",
            },
            data: { campaigns: [{ campaignId: String(item.campaignId), budget: { budget: Number(newBudget), budgetType: "DAILY" } }] }
        }));

        if (response.status == 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await campaignsSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    campaignId: item.campaignId,
                    reportDate: currentDate,
                },
                { $set: { budget: Number(newBudget) }, },
                { upsert: true, new: true }
            ).lean()
        }

        return { isSuccess: true, message: "Campaign budget updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const updateSBCampaignBudget = async (item, profile, checkConfigAds, percentage) => {
    try {
        let newBudget = item.budget;

        newBudget = newBudget + (newBudget * percentage / 100);

        if (newBudget < 1) newBudget = 1;

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}/sb/v4/campaigns`,
            meta: { configId: profile?.configId || checkConfigAds?._id?.toString(), profileId: profile?.profileId },
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Prefer": "return=representation",
                "Accept": "application/vnd.sbcampaignresource.v4+json",
                "Content-Type": "application/vnd.sbcampaignresource.v4+json",
            },
            data: { campaigns: [{ campaignId: String(item.campaignId), budget: Number(newBudget) }] }
        }));

        if (response.status == 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await sbCampaignsSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    campaignId: item.campaignId,
                    reportDate: currentDate,
                },
                { $set: { budget: Number(newBudget) }, },
                { upsert: true, new: true }
            ).lean()
        }

        return { isSuccess: true, message: "Campaign budget updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const updateSDCampaignBudget = async (item, profile, checkConfigAds, percentage) => {
    try {
        let newBudget = item.budget;

        newBudget = newBudget + (newBudget * percentage / 100);

        if (newBudget < 1) newBudget = 1;

        const response = await retryWithBackoff(() => amazonAxios({
            method: "PUT",
            url: `${profile.amazonUrl}/sd/campaigns`,
            meta: { configId: profile?.configId || checkConfigAds?._id?.toString(), profileId: profile?.profileId },
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                "Prefer": "return=representation",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            data: [{ campaignId: String(item.campaignId), budget: Number(newBudget) }]
        }));

        if (response.status == 207) {
            const now = moment().tz(profile.timezone);
            const currentDate = now.format("YYYY-MM-DD");

            await sdCampaignsSchema.findOneAndUpdate(
                {
                    configId: profile?.configId,
                    profileId: profile?.profileId,
                    campaignId: item.campaignId,
                    reportDate: currentDate,
                },
                { $set: { budget: Number(newBudget) }, },
                { upsert: true, new: true }
            ).lean()
        }

        return { isSuccess: true, message: "Campaign budget updated" };

    } catch (error) {
        return { isSuccess: false, message: "An internal server error occurred" };
    }
}

const UpdateCampaignBudget = async (adType, item, profile, checkConfigAds, percentage) => {
    switch (adType) {
        case "SP":
            return await updateSPCampaignBudget(item, profile, checkConfigAds, percentage);
        case "SB":
            return await updateSBCampaignBudget(item, profile, checkConfigAds, percentage);
        case "SD":
            return await updateSDCampaignBudget(item, profile, checkConfigAds, percentage);
        default:
            return { isSuccess: false, message: "Invalid ad type" };
    }
};

module.exports = {
    AddToTargeting,
    UpdateTargetingBid,
    UpdateTargetingStatus,
    AddToNegativeTargeting,
    getSuggestedBid,
    UpdateCampaignBudget,
};
