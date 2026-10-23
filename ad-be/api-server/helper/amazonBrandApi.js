const amazonAxios = require("./amazonAxios");
const { retryWithBackoff } = require("./retryHelper");

/**
 * Helper to build standard auth meta
 */
const getAuthMeta = (profile, checkConfigAds) => ({
    configId: profile?.configId || checkConfigAds?._id?.toString(),
    profileId: profile?.profileId,
});

/**
 * GET /brands
 */
const fetchBrands = async (profile, checkConfigAds) => {
    const response = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${profile.amazonUrl}/brands`,
        meta: getAuthMeta(profile, checkConfigAds),
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            Accept: "application/vnd.brand.v3+json",
        },
    }));
    return response.data;
};

/**
 * POST /portfolios/list
 */
const fetchPortfolios = async (profile, checkConfigAds, body = {}) => {
    const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: `${profile.amazonUrl}/portfolios/list`,
        meta: getAuthMeta(profile, checkConfigAds),
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            Accept: "application/vnd.spPortfolio.v3+json",
            "Content-Type": "application/json",
        },
        data: body,
    }));
    return response.data;
};

/**
 * POST /brand/stores/v1/stores/list
 */
const fetchStores = async (profile, checkConfigAds, body = {}) => {
    const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: `${profile.amazonUrl}/brand/stores/v1/stores/list`,
        meta: getAuthMeta(profile, checkConfigAds),
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            "Content-Type": "application/brandStores.ListStores.v1+json",
        },
        data: body,
    }));
    return response.data;
};

/**
 * POST /brand/stores/v1/storePages/list
 */
const fetchStorePages = async (profile, checkConfigAds, body = {}) => {
    const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: `${profile.amazonUrl}/brand/stores/v1/storePages/list`,
        meta: getAuthMeta(profile, checkConfigAds),
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            "Content-Type": "application/brandStore.ListPages.v1+json",
        },
        data: body,
    }));
    return response.data;
};

/**
 * POST /sb/v4/ads/list — returns only first ad
 */
const fetchFirstSBAd = async (profile, checkConfigAds, body = {}) => {
    const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: `${profile.amazonUrl}/sb/v4/ads/list`,
        meta: getAuthMeta(profile, checkConfigAds),
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            "Content-Type": "application/json",
            Accept: "application/vnd.sbAdCreativeResource.v4+json",
        },
        data: body,
    }));

    const ads = response.data?.ads || response.data?.data || [];
    return ads.length > 0 ? ads[0] : null;
};

/**
 * GET /sd/creatives
 */
const fetchSDCreatives = async (profile, checkConfigAds, adGroupId) => {
    const response = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${profile.amazonUrl}/sd/creatives?adGroupIdFilter=${adGroupId}`,
        meta: getAuthMeta(profile, checkConfigAds),
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            "Content-Type": "application/json",
        },
    }));

    const creatives = response?.data || response?.data || [];
    return creatives?.length > 0 ? creatives?.[0] : null;
};

/**
 * POST /sd/creatives/preview
 */
const fetchSDCreativePreview = async (profile, checkConfigAds, body = {}) => {
    const response = await retryWithBackoff(() => amazonAxios({
        method: "POST",
        url: `${profile.amazonUrl}/sd/creatives/preview`,
        meta: getAuthMeta(profile, checkConfigAds),
        headers: {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            "Content-Type": "application/json",
        },
        data: body,
    }));
    return response?.data;
};

module.exports = {
    fetchBrands,
    fetchPortfolios,
    fetchStores,
    fetchStorePages,
    fetchFirstSBAd,
    fetchSDCreatives,
    fetchSDCreativePreview,
};