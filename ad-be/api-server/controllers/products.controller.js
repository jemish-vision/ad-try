const mongoose = require("mongoose");
const moment = require("moment");
const { retryWithBackoff } = require("../helper/retryHelper");

const pLimit = require("p-limit").default;
const profileLimit = pLimit(Number(process.env.PROCESS_LIMIT) || 3);

const productListingModel = require("../models/productListing.model");
const competitorModel = require("../models/competitor.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { getActivePlanProfiles, getSPAccessToken, parallelBulkWrite, getProfile, getAllowedSyncProfiles } = require("../helper/common");
const amazonAxios = require("../helper/amazonAxios");
const { product_write_logs } = require("../../winston/products/logger");

exports.cronFetchCompetitorsFromAmazon = async (customStartDate = null) => {

    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronFetchCompetitorsFromAmazon`,
        log_type: "info",
    });

    try {
        let pastSyncObj = null;
        let cronjobid = null;
        let recurring = true;

        if (customStartDate && typeof customStartDate === "object") {
            pastSyncObj = customStartDate;
            cronjobid = pastSyncObj.cronjobid;
            recurring = pastSyncObj.recurring;
        }

        const targetProfileId = pastSyncObj?.profileId;
        const targetConfigId = pastSyncObj?.configId;
        let profiles = await getActivePlanProfiles(targetProfileId, "sp", targetConfigId);
        const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", recurring);
        profiles = profiles.filter(p =>
            allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
        );

        if (targetProfileId) {
            profiles = profiles.filter((p) => String(p.profileId) === String(targetProfileId));
        }
        if (targetConfigId) {
            profiles = profiles.filter((p) => String(p.configId) === String(targetConfigId));
        }

        const promises = profiles.map((profile) =>
            profileLimit(async () => {
                try {
                    const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);

                    if (!checkSPConfig) {
                        return cron_logs({
                            message: `Account disconnected ${profile.configId}`,
                            log_type: "info",
                        });
                    }

                    const currentDate = moment().tz(profile?.timezone).format("YYYY-MM-DD");

                    let getCronData;
                    if (recurring) {
                        getCronData = await cronJobHistorySchema.findOneAndUpdate(
                            {
                                configId: profile.configId,
                                profileId: profile.profileId,
                                cronName: "Competitor Analysis",
                                historyDate: currentDate,
                            },
                            { $set: { status: "PENDING" } },
                            { upsert: true, new: true }
                        ).lean();
                    }

                    const result = await fetchCompetitorsProductData(profile, currentDate, checkSPConfig);

                    if (recurring && getCronData?._id && result !== "ERROR") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    } else if (!recurring && cronjobid && result !== "ERROR") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    }
                } catch (profileErr) {
                    cron_logs({
                        message: `Error fetching competitors for profile ${profile.profileId} (config: ${profile.configId}): ${profileErr.stack || profileErr.message}`,
                        log_type: "error",
                    });
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "Competitor analysis reports generated successfully.",
            log_type: "info",
        });

    } catch (error) {

        return cron_logs({
            message: `Competitor analysis report err: ${error}`,
            log_type: "error",
        });
    }
};

const attr = (attributes, key) => attributes?.[key]?.[0]?.value ?? null;

const buildKeywords = (attributes, summary) => {
    const brandName = summary?.brand?.toLowerCase()?.trim() || "";
    const titleRaw = summary?.itemName || attr(attributes, "item_name") || "";
    const cleanedTitle = titleRaw.toLowerCase().replace(new RegExp(brandName, "gi"), "").replace(/[|%]/g, "").trim();
    return cleanedTitle;
};

const normalizeItem = (item) => {
    const a = item.attributes ?? {};
    const summary = item.summaries?.[0] ?? {};
    const salesRank = item.salesRanks?.[0];

    return {
        asin: item.asin,
        imageUrl: item.images?.[0]?.images?.[0]?.link ?? "",
        name: summary.itemName ?? attr(a, "item_name") ?? "Unknown",
        brand: summary.brand ?? attr(a, "brand") ?? "Unknown",
        form: attr(a, "item_form"),
        size: summary.size ?? attr(a, "size"),
        unitValue: a?.unit_count?.[0]?.value ?? null,
        unitType: a?.unit_count?.[0]?.type?.value ?? null,
        weight: a?.item_weight?.[0]?.value ?? null,
        weightUnit: a?.item_weight?.[0]?.unit ?? null,
        dietType: attr(a, "diet_type"),
        isVegetarian: a?.fssai_veg_non_veg_status?.[0]?.value === "vegetarian",
        allergens: a?.allergen_information?.map((x) => x.value) ?? [],
        ingredients: attr(a, "ingredients"),
        salesRankCategory: salesRank?.classificationRanks?.[0]?.rank ?? null,
        salesRankCategoryName: salesRank?.classificationRanks?.[0]?.title ?? null,
        salesRankOverall: salesRank?.displayGroupRanks?.[0]?.rank ?? null,
        price: null,
    };
};

const fetchPricing = async (asins, marketplaceConfig, spAccessToken, configId, profileId) => {
    const priceMap = {};
    if (!asins.length) return priceMap;
    const url = `${marketplaceConfig.endPoint}/products/pricing/v0/competitivePrice?Asins=${asins?.join(",")}&ItemType=Asin&MarketplaceId=${marketplaceConfig.marketPlaceId}`;

    try {
        let config = { method: 'get', url, headers: { 'x-amz-access-token': spAccessToken }, meta: { configId, tokenKey: "spAccessToken", sp: true, profileId, isBackgroundWorker: true } };
        const res = await retryWithBackoff(() => amazonAxios(config));

        if (res.status === 200 && res.data?.payload) {
            res.data.payload.forEach((item) => {
                if (item.status !== "Success") return;

                const prices = item.Product?.CompetitivePricing?.CompetitivePrices ?? [];
                const listed = prices.find((p) => p.CompetitivePriceId === "1");

                if (listed) {
                    priceMap[item.ASIN] = { amount: listed.Price?.LandedPrice?.Amount ?? listed.Price?.ListingPrice?.Amount ?? null, currency: listed.Price?.LandedPrice?.CurrencyCode ?? "INR" };
                }
            });
        }
    } catch (err) {
        cron_logs({ message: `Pricing fetch failed [${asins.join(",")}]: ${err.message}`, log_type: "error" });
    }
    return priceMap;
};

const fetchMyProductData = async (asin, marketplaceConfig, token, configId, profileId) => {
    try {
        const { marketPlaceId: mktId, endPoint: baseEP } = marketplaceConfig;
        const url = `${baseEP}/catalog/2022-04-01/items/${asin}?marketplaceIds=${mktId}&includedData=summaries,attributes`;
        const headers = { "x-amz-access-token": token };
        let config = { method: 'get', url, headers, meta: { configId, tokenKey: "spAccessToken", sp: true, profileId, isBackgroundWorker: true } };

        const res = await retryWithBackoff(() => amazonAxios(config));
        if (res?.status !== 200) return null;

        const myAttrs = res.data.attributes ?? {};
        const mySummary = res.data.summaries?.[0] ?? {};
        const keywords = buildKeywords(myAttrs, mySummary);

        return { myAttrs, mySummary, keywords };
    } catch (err) {
        const is404 = err.response?.status === 404 || err.message?.includes("404");
        cron_logs({
            message: `fetchMyProductData ${is404 ? "ASIN not found in Amazon Catalog (404)" : "error"} for ASIN ${asin}: ${err.message}`,
            log_type: is404 ? "warn" : "error"
        });
        return null;
    }
};

const searchAmazonForCompetitors = async (asin, keywords, marketplaceConfig, token, configId, profileId, currentDate) => {
    try {
        const { marketPlaceId: mktId, endPoint: baseEP } = marketplaceConfig;
        const headers = { "x-amz-access-token": token };

        let nextToken = null;
        let pageCount = 0;

        do {
            pageCount++;
            let searchUrl = `${baseEP}/catalog/2022-04-01/items?marketplaceIds=${mktId}&includedData=summaries,attributes,salesRanks,images&keywords=${encodeURIComponent(keywords)}&pageSize=20`;
            if (nextToken) {
                searchUrl += `&pageToken=${encodeURIComponent(nextToken)}`;
            }

            let searchConfig = { method: 'get', url: searchUrl, headers, meta: { configId, tokenKey: "spAccessToken", sp: true, profileId, isBackgroundWorker: true } };
            const searchRes = await retryWithBackoff(() => amazonAxios(searchConfig));

            if (searchRes?.status !== 200) break;

            const rawItems = searchRes.data.items ?? [];
            nextToken = searchRes.data.pagination?.nextToken ?? null;

            let competitors = rawItems.map(normalizeItem).filter((item) => item.asin !== asin);

            // Fetch + merge pricing inline
            if (competitors.length > 0) {
                const priceMap = await fetchPricing(competitors.map((c) => c.asin), marketplaceConfig, token, configId, profileId);

                // UPSERT competitors in DB
                const bulkOps = [];
                const configIdObj = mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId;
                const profileIdNum = Number(profileId);

                for (const c of competitors) {
                    bulkOps.push({
                        updateOne: {
                            filter: { configId: configIdObj, profileId: profileIdNum, myAsin: asin, asin: c?.asin },
                            update: {
                                $set: {
                                    brand: c?.brand,
                                    classification: c?.salesRankCategoryName || c?.salesRankCategory,
                                    classificationRanks: c?.salesRankCategory || c?.salesRankOverall,
                                    price: priceMap?.[c?.asin]?.amount || 0,
                                    itemForm: c?.form,
                                    lastUpdatedAt: currentDate
                                }
                            },
                            upsert: true
                        }
                    });
                }

                if (bulkOps.length) {
                    cron_logs({ message: `Upserted ${bulkOps?.length} competitors for ASIN ${asin} (Page ${pageCount})`, log_type: "info" });
                    await parallelBulkWrite(competitorModel, bulkOps);
                };
            }

            if (nextToken) await new Promise((resolve) => setTimeout(resolve, 100));
        } while (nextToken);

        // Clean up any stale competitors for this specific ASIN
        const configIdObj = mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId;
        const profileIdNum = Number(profileId);
        await competitorModel.deleteMany({
            configId: configIdObj,
            profileId: profileIdNum,
            myAsin: asin,
            lastUpdatedAt: { $ne: currentDate }
        });

    } catch (err) {
        cron_logs({ message: `searchAmazonForCompetitors error for ASIN ${asin}: ${err.message}`, log_type: "error" });
    }
};

const fetchCompetitorsProductData = async (profile, currentDate, checkSPConfig) => {
    try {
        const { configId, profileId } = profile;
        const token = checkSPConfig?.spAccessToken;

        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId, }).lean();
        if (!marketplaceConfig) return "ERROR";

        const targetConfigId = mongoose.Types.ObjectId.isValid(configId) ? new mongoose.Types.ObjectId(configId) : configId;
        const targetProfileId = Number(profileId);

        // Fetch all product listings for this profile
        const productPipelines = [
            {
                $match: {
                    configId: { $in: [String(configId), targetConfigId] },
                    profileId: { $in: [Number(profileId), String(profileId)] }
                }
            },
            { $group: { _id: { configId: "$configId", profileId: "$profileId", asin: "$asin" } } },
            { $project: { _id: 0, configId: "$_id.configId", profileId: "$_id.profileId", asin: "$_id.asin" } }
        ];
        const products = await productListingModel.aggregate(productPipelines);

        // Loop over products serially to avoid strict Amazon API rate limits
        const productLimit = pLimit(1);
        await Promise.all(
            products.map((p) =>
                productLimit(async () => {
                    try {

                        // Delay to respect Amazon Catalog API limits
                        await new Promise((resolve) => setTimeout(resolve, 1000));

                        const asin = p?.asin;
                        if (!asin) return;

                        // Step 1: Fetch My Product Data
                        const myProductData = await fetchMyProductData(asin, marketplaceConfig, token, configId, profileId);
                        if (!myProductData || !myProductData?.keywords) return;

                        // Step 2: Search Amazon for Competitors + Pagination + UPSERT
                        await searchAmazonForCompetitors(
                            asin,
                            myProductData.keywords,
                            marketplaceConfig,
                            token,
                            configId,
                            profileId,
                            currentDate
                        );

                    } catch (err) {
                        cron_logs({
                            message: `Competitor fetch loop error for ASIN ${p?.asin}: ${err.message}`,
                            log_type: "error",
                        });
                    }
                })
            )
        );

        return "SUCCESS";

    } catch (error) {
        cron_logs({
            message: `fetchCompetitorsProductData err: ${error}`,
            log_type: "error",
        });
        return "ERROR";
    }
};

exports.getCompetitorBrands = async (req, res) => {
    try {
        const configId = req?.config?.configId || req.body.configId;
        const profileId = req.body.profileId;
        const { asin } = req.body;

        if (!configId || !profileId) return res.status(200).send({ isSuccess: false, message: "configId and profileId are required" });
        if (!asin) return res.status(200).send({ isSuccess: false, message: "ASIN is required" });

        const profile = await getProfile(configId, Number(profileId));
        if (!profile) return res.status(200).send({ isSuccess: false, message: "Profile not found or inactive" });

        const checkSPConfig = await getSPAccessToken(profile?.configId, profile?.profileId);
        if (!checkSPConfig) return cron_logs({ message: `Account disconnected ${profile?.configId} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });

        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId, }).lean();
        const myProductData = await fetchMyProductData(asin, marketplaceConfig, checkSPConfig?.spAccessToken, configId, Number(profileId));

        const itemForm = myProductData?.myAttrs?.item_form?.[0]?.value ?? null;

        const matchQuery = {
            configId,
            profileId: Number(profileId),
            ...(asin ? { myAsin: asin } : {}),
            brand: { $nin: [null, ""] },
            price: { $nin: [null, 0] },
            ...(itemForm ? { itemForm } : {})
        };

        const brandPipelines = [
            { $match: matchQuery },
            { $group: { _id: "$brand", count: { $sum: 1 } } },
            { $project: { _id: 0, brand: "$_id", count: 1 } },
            { $sort: { count: -1 } }
        ]
        const brands = await competitorModel.aggregate(brandPipelines);

        return res.status(200).send({
            isSuccess: true,
            message: "Brands fetched successfully",
            data: brands,
        });

    } catch (error) {
        write_logs({ message: `[getCompetitorBrands Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};

exports.getCompetitorsData = async (req, res) => {
    try {
        const configId = req?.config?.configId || req.body.configId;
        const profileId = req.body.profileId;
        const { asin, minPrice, maxPrice, brands, fieldName = "price", sortOrder = 1, page = 1, limit = 10 } = req.body;

        if (!configId || !profileId) return res.status(200).send({ isSuccess: false, message: "configId and profileId are required" });
        if (!asin) return res.status(200).send({ isSuccess: false, message: "ASIN is required" });

        const profile = await getProfile(configId, Number(profileId));
        if (!profile) return res.status(200).send({ isSuccess: false, message: "Profile not found or inactive" });

        const checkSPConfig = await getSPAccessToken(profile?.configId, profile?.profileId);
        if (!checkSPConfig) return cron_logs({ message: `Account disconnected ${profile?.configId} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });

        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId, }).lean();
        const myProductData = await fetchMyProductData(asin, marketplaceConfig, checkSPConfig?.spAccessToken, configId, Number(profileId));

        const itemForm = myProductData?.myAttrs?.item_form?.[0]?.value ?? null;

        const matchQuery = {
            configId,
            profileId: Number(profileId),
            ...(asin ? { myAsin: asin } : {}),
            price: {
                ...(minPrice !== undefined && minPrice !== null && minPrice !== "" ? { $gte: Number(minPrice) } : {}),
                ...(maxPrice !== undefined && maxPrice !== null && maxPrice !== "" ? { $lte: Number(maxPrice) } : {}),
                $nin: [null, 0],
            },
            ...(brands && Array.isArray(brands) && brands?.length > 0 ? { brand: { $in: brands } } : {}),
            ...(itemForm ? { itemForm } : {})
        };

        const pipeline = [
            { $match: matchQuery },
            {
                $addFields: {
                    classificationRankSort: {
                        $cond: [{ $or: [{ $eq: ["$classificationRanks", null] }, { $eq: ["$classificationRanks", ""] }] }, Number.MAX_SAFE_INTEGER, "$classificationRanks"]
                    }
                }
            },
            {
                $facet: {
                    lists: [
                        { $sort: { [fieldName]: sortOrder, classificationRanks: 1 } },
                        { $skip: (Number(page) - 1) * Number(limit) },
                        { $limit: Number(limit) }
                    ],
                    totalCount: [{ $count: "count" }]
                }
            },
            { $project: { lists: 1, totalRecords: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] } } }
        ];

        const result = await competitorModel.aggregate(pipeline);

        const data = result?.[0] || { lists: [], totalRecords: 0 };
        let lists = data?.lists || [];

        // Fetch latest Amazon data
        if (lists.length > 0) {
            const asins = lists.map(x => x?.asin);

            const amazonConfig = {
                method: "get",
                url: `${marketplaceConfig?.endPoint}/catalog/2022-04-01/items?marketplaceIds=${marketplaceConfig.marketPlaceId}&identifiers=${asins.join(",")}&identifiersType=ASIN&includedData=summaries,attributes,salesRanks,images`,
                headers: { "x-amz-access-token": checkSPConfig?.spAccessToken },
                meta: { configId, tokenKey: "spAccessToken", sp: true, profileId }
            };

            const amazonRes = await retryWithBackoff(() => amazonAxios(amazonConfig));
            if (amazonRes?.status === 200) {
                const amazonItems = amazonRes?.data?.items || [];
                const normalized = amazonItems?.map(normalizeItem);

                const priceMap = await fetchPricing(asins, marketplaceConfig, checkSPConfig?.spAccessToken, configId, Number(profileId));
                const amazonMap = {};

                normalized.forEach(item => { amazonMap[item.asin] = { ...item, price: priceMap?.[item.asin] || null } });

                lists = lists.map(item => ({ ...item, amazonData: amazonMap[item?.asin] || null }));
            }
        }

        return res.status(200).send({
            isSuccess: true,
            message: "Competitors fetched successfully",
            data: {
                lists,
                totalRecords: data.totalRecords,
                currentPage: Number(page),
                totalPages: Math.ceil(data.totalRecords / Number(limit))
            }
        });

    } catch (error) {
        write_logs({ message: `[getCompetitorsData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};