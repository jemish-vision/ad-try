/**
 * Read-only Competitor Comparison (same ASIN — our offer vs other sellers / Buy Box).
 *
 * GET /api/products/:asin/compare?profileId=<id>[&refresh=true]
 *
 * Calls SP-API getCatalogItem + getItemOffers, normalizes the result into
 * "our offer" vs competitor offers. No writes to Amazon, no rules, no queues.
 */
const mongoose = require("mongoose");

const productListingModel = require("../models/productListing.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const { getSPAccessToken, getProfile } = require("../helper/common");
const { getCacheWithLog, setCacheWithLog } = require("../services/redis.service");
const amazonAxios = require("../helper/amazonAxios");
const { retryWithBackoff } = require("../helper/retryHelper");
const { write_logs } = require("../../winston/utility/logger");
const { buildComparison, normalizeFees } = require("../helpers/competitorComparison.helper");

// getItemOffers is limited to 0.5 req/s — cache briefly so re-opening the page doesn't burn quota.
const CACHE_TTL_SECONDS = 180;
const ASIN_REGEX = /^[A-Z0-9]{10}$/;

const safeParse = (s) => {
    try {
        return typeof s === "string" ? JSON.parse(s) : s;
    } catch {
        return null;
    }
};

const amazonErrorMessage = (err) => {
    const errors = err?.response?.data?.errors || err?.response?.data?.payload?.errors;
    if (Array.isArray(errors) && errors.length) return errors.map((e) => e.message || e.code).join("; ");
    return err?.message || "Amazon request failed";
};

exports.getProductComparison = async (req, res) => {
    const asin = String(req.params.asin || "").trim().toUpperCase();
    const configId = req?.config?.configId || req.query.configId || req.headers?.["x-config-id"];
    const profileId = Number(req.query.profileId);
    const refresh = String(req.query.refresh || "") === "true";

    try {
        if (!ASIN_REGEX.test(asin)) return res.status(200).send({ isSuccess: false, message: "A valid 10-character ASIN is required" });
        if (!configId || !profileId) return res.status(200).send({ isSuccess: false, message: "configId and profileId are required" });

        const profile = await getProfile(configId, profileId);
        if (!profile) return res.status(200).send({ isSuccess: false, message: "Profile not found or inactive" });

        const spConfig = await getSPAccessToken(profile.configId, profile.profileId);
        if (!spConfig?.spAccessToken) return res.status(200).send({ isSuccess: false, message: "Seller Central account is not connected" });

        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
        if (!marketplaceConfig?.endPoint) return res.status(200).send({ isSuccess: false, message: "Marketplace configuration not found" });

        const { endPoint, marketPlaceId } = marketplaceConfig;
        const cacheKey = `competitorCompare_${configId}_${profileId}_${marketPlaceId}_${asin}`;

        if (!refresh) {
            const cached = safeParse(await getCacheWithLog(cacheKey));
            if (cached) return res.status(200).send({ isSuccess: true, message: "Comparison fetched successfully", data: { ...cached, cached: true } });
        }

        const meta = { configId, tokenKey: "spAccessToken", sp: true, profileId };
        const headers = { "x-amz-access-token": spConfig.spAccessToken };

        const offersReq = retryWithBackoff(() =>
            amazonAxios({
                method: "get",
                url: `${endPoint}/products/pricing/v0/items/${asin}/offers?MarketplaceId=${marketPlaceId}&ItemCondition=New&CustomerType=Consumer`,
                headers,
                meta,
            })
        );
        const catalogReq = retryWithBackoff(() =>
            amazonAxios({
                method: "get",
                url: `${endPoint}/catalog/2022-04-01/items/${asin}?marketplaceIds=${marketPlaceId}&includedData=summaries,images,salesRanks,attributes,relationships`,
                headers,
                meta,
            })
        );
        const listingReq = productListingModel
            .findOne(
                {
                    configId: mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(String(configId)) : configId,
                    profileId,
                    asin,
                },
                { sku: 1, itemName: 1, imageURL: 1, sellingPrice: 1, basePrice: 1, currency: 1, status: 1 }
            )
            .lean();

        const [offersRes, catalogRes, listingRes] = await Promise.allSettled([offersReq, catalogReq, listingReq]);

        if (offersRes.status === "rejected") {
            const msg = amazonErrorMessage(offersRes.reason);
            write_logs({ message: `[getProductComparison] getItemOffers failed asin=${asin} profile=${profileId}: ${msg}`, log_type: "error" });
            return res.status(200).send({ isSuccess: false, message: `Unable to fetch offers from Amazon: ${msg}` });
        }

        const offersPayload = offersRes.value?.data?.payload;
        if (!offersPayload || offersPayload.status === "ClientError" || offersPayload.status === "NoBuyableOffers") {
            // NoBuyableOffers still carries a Summary; only hard-fail when there's nothing usable.
            if (!offersPayload?.Summary) {
                return res.status(200).send({ isSuccess: false, message: offersPayload?.Error?.message || "No offers found for this ASIN" });
            }
        }

        let catalogItem = null;
        if (catalogRes.status === "fulfilled") catalogItem = catalogRes.value?.data || null;
        else write_logs({ message: `[getProductComparison] getCatalogItem failed asin=${asin}: ${amazonErrorMessage(catalogRes.reason)}`, log_type: "warn" });

        const ourListing = listingRes.status === "fulfilled" ? listingRes.value : null;

        const data = buildComparison({
            offersPayload,
            catalogItem,
            ourSellerId: spConfig.sellerId,
            marketplaceId: marketPlaceId,
            ourListing,
        });

        // Fill product display fields from our own listing if catalog lookup failed.
        if (!data.product && ourListing) {
            data.product = { asin, title: ourListing.itemName || null, brand: null, image: ourListing.imageURL || null, bulletPoints: [], category: null, salesRank: null };
        }
        data.ourSku = ourListing?.sku || null;
        data.fetchedAt = new Date().toISOString();

        await setCacheWithLog(cacheKey, JSON.stringify(data), CACHE_TTL_SECONDS);

        return res.status(200).send({ isSuccess: true, message: "Comparison fetched successfully", data: { ...data, cached: false } });
    } catch (error) {
        write_logs({ message: `[getProductComparison Error] asin=${asin} ${error?.message || error}`, log_type: "error" });
        return res.status(500).send({ isSuccess: false, message: "Something went wrong", error: "An internal server error occurred" });
    }
};

/**
 * POST /api/products/fees-estimate
 * body: { profileId, items: [{ asin, price, shipping?, isFba }] }   (max 4 items)
 *
 * Read-only Product Fees API (getMyFeesEstimateForASIN) — referral, FBA and closing fees
 * for any ASIN at a given price. Each estimate is cached for 12h.
 */
const FEES_CACHE_TTL_SECONDS = 12 * 60 * 60;
const MAX_FEE_ITEMS = 4;

exports.getFeesEstimate = async (req, res) => {
    const configId = req?.config?.configId || req.body?.configId || req.headers?.["x-config-id"];
    const profileId = Number(req.body?.profileId);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_FEE_ITEMS) : [];

    try {
        if (!configId || !profileId) return res.status(200).send({ isSuccess: false, message: "configId and profileId are required" });
        if (!items.length) return res.status(200).send({ isSuccess: true, data: [] });

        const profile = await getProfile(configId, profileId);
        if (!profile) return res.status(200).send({ isSuccess: false, message: "Profile not found or inactive" });

        const spConfig = await getSPAccessToken(profile.configId, profile.profileId);
        if (!spConfig?.spAccessToken) return res.status(200).send({ isSuccess: false, message: "Seller Central account is not connected" });

        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
        if (!marketplaceConfig?.endPoint) return res.status(200).send({ isSuccess: false, message: "Marketplace configuration not found" });

        const { endPoint, marketPlaceId } = marketplaceConfig;
        const currency = req.body?.currency || profile.currencyCode || "USD";
        const results = [];

        // Sequential on purpose: fees API is rate limited (1 req/s)
        for (const item of items) {
            const asin = String(item?.asin || "").trim().toUpperCase();
            const price = Number(item?.price);
            const shipping = Number(item?.shipping) || 0;
            const isFba = Boolean(item?.isFba);
            if (!ASIN_REGEX.test(asin) || !(price > 0)) {
                results.push({ asin, price: item?.price, isFba, fees: null });
                continue;
            }

            const cacheKey = `feesEstimate_${marketPlaceId}_${asin}_${price.toFixed(2)}_${shipping.toFixed(2)}_${isFba ? "fba" : "fbm"}`;
            const cached = safeParse(await getCacheWithLog(cacheKey));
            if (cached) {
                results.push({ asin, price, isFba, fees: cached });
                continue;
            }

            try {
                const resp = await retryWithBackoff(() =>
                    amazonAxios({
                        method: "post",
                        url: `${endPoint}/products/fees/v0/items/${asin}/feesEstimate`,
                        headers: { "x-amz-access-token": spConfig.spAccessToken, "Content-Type": "application/json" },
                        data: {
                            FeesEstimateRequest: {
                                MarketplaceId: marketPlaceId,
                                IsAmazonFulfilled: isFba,
                                Identifier: `${asin}-${isFba ? "fba" : "fbm"}-${Date.now()}`,
                                PriceToEstimateFees: {
                                    ListingPrice: { CurrencyCode: currency, Amount: price },
                                    Shipping: { CurrencyCode: currency, Amount: shipping },
                                },
                            },
                        },
                        meta: { configId, tokenKey: "spAccessToken", sp: true, profileId },
                    })
                );
                const fees = normalizeFees(resp?.data?.payload?.FeesEstimateResult);
                if (fees) await setCacheWithLog(cacheKey, JSON.stringify(fees), FEES_CACHE_TTL_SECONDS);
                results.push({ asin, price, isFba, fees });
            } catch (err) {
                write_logs({ message: `[getFeesEstimate] asin=${asin} price=${price}: ${amazonErrorMessage(err)}`, log_type: "warn" });
                results.push({ asin, price, isFba, fees: null, error: amazonErrorMessage(err) });
            }
        }

        return res.status(200).send({ isSuccess: true, data: results });
    } catch (error) {
        write_logs({ message: `[getFeesEstimate Error] ${error?.message || error}`, log_type: "error" });
        return res.status(500).send({ isSuccess: false, message: "Something went wrong", error: "An internal server error occurred" });
    }
};
