const { write_logs } = require("../../winston/utility/logger");
const { retryWithBackoff } = require("../helper/retryHelper");

const amazonAxios = require("../helper/amazonAxios");

exports.subscribeAmsDataset = async ({ profile, checkConfigAds, dataset, sqsArn, clientRequestToken }) => {
    try {
        const apiOptions = {
            method: "POST",
            url: `${profile.amazonUrl}/streams/subscriptions`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.MarketingStreamSubscriptions.StreamSubscriptionResource.v1.0+json",
                "Accept": "application/vnd.MarketingStreamSubscriptions.StreamSubscriptionResource.v1.0+json",
            },
            data: { clientRequestToken, dataSetId: dataset, destinationArn: sqsArn },
            meta: { configId: profile?.configId, tokenKey: "adsAccessToken" },
        };

        const res = await retryWithBackoff(() => amazonAxios(apiOptions));

        if (res.status !== 200) {
            throw new Error(`AMS subscribe failed (${res.status}) : ${JSON.stringify(res.data)}`);
        }

        if (!res?.data?.subscriptionId) {
            throw new Error("SubscriptionId missing in AMS response");
        }

        write_logs({
            message: `AMS dataset subscribed successfully. ProfileID: ${profile?.profileId}, DataSet: ${dataset}. ${JSON.stringify(res?.data)}`,
            log_type: "info",
        });

        return {
            success: true,
            subscriptionId: res.data.subscriptionId,
        };
    } catch (error) {
        write_logs({
            message: `AMS SUBSCRIBE ERROR: ${error?.response?.data?.message || error.message}`,
            log_type: "error",
        });
        return {
            success: false,
            error: error?.response?.data || error.message,
        };
    }
};

exports.archiveAmsSubscription = async ({ subscriptionId, profile, checkConfigAds }) => {
    try {
        const apiOptions = {
            method: "PUT",
            url: `${profile.amazonUrl}/streams/subscriptions/${subscriptionId}`,
            headers: {
                "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
                "Amazon-Advertising-API-Scope": profile.profileId,
                "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
                "Content-Type": "application/vnd.MarketingStreamSubscriptions.StreamSubscriptionResource.v1.0+json",
                "Accept": "application/vnd.MarketingStreamSubscriptions.StreamSubscriptionResource.v1.0+json",
            },
            data: { status: "ARCHIVED" },
            meta: { configId: profile?.configId, tokenKey: "adsAccessToken" },
        };

        const res = await retryWithBackoff(() => amazonAxios(apiOptions));

        if (res.status !== 200) {
            throw new Error(`AMS archive failed (${res.status}): ${JSON.stringify(res.data)}`);
        }

        write_logs({
            message: `AMS SUBSCRIPTION ARCHIVED | ProfileId=${profile.profileId} | SubscriptionId=${subscriptionId}`,
            log_type: "info",
        });

        return {
            success: true,
        };
    } catch (error) {
        // If 404 (subscription not found / already deleted on Amazon), treat as success so local DB state syncs cleanly
        if (error?.response?.status === 404) {
            write_logs({
                message: `AMS ARCHIVE 404 (Already archived or not found on Amazon) | ProfileId=${profile.profileId} | SubscriptionId=${subscriptionId}`,
                log_type: "info",
            });
            return {
                success: true,
            };
        }

        const errorDetails = error?.response?.data?.message || (typeof error?.response?.data === "object" ? JSON.stringify(error?.response?.data) : error?.response?.data) || error.message;

        write_logs({
            message: `AMS ARCHIVE ERROR | SubscriptionId=${subscriptionId} | ${errorDetails}`,
            log_type: "error",
        });

        return {
            success: false,
            error: errorDetails,
        };
    }
};
