const moment = require("moment");
const { retryWithBackoff } = require("../helper/retryHelper");

const pLimit = require("p-limit").default;
const profileLimit = pLimit(Number(process.env.PROCESS_LIMIT) || 3);
const productLimit = pLimit(5);

const productListingModel = require("../models/productListing.model");
const asinAPlusContentModel = require("../models/asinAPlusContent.model");
const aPlusBatchJobModel = require("../models/aPlusBatchJob.model");
const adNotificationSchema = require("../models/adNotification.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { getActivePlanProfiles, getSPAccessToken, parallelBulkWrite, getProfile, getAllowedSyncProfiles } = require("../helper/common");
const amazonAxios = require("../helper/amazonAxios");
const { generateAPlusModulesAI } = require("../helper/chatgpt");
const { write_logs } = require("../../winston/utility/logger");
const { buildAmazonAPlusPayload } = require("../helper/aplusContent.helper");
const { generateAndUploadModuleImages, getAllVariationAsins, addAsinsToAPlusContent, uploadImageToAmazon } = require("../helper/generateAPlusImages");
const { sendNotificationToUser } = require("../helper/sendNotification");
const { submitAPlusImageBatchJob, checkBatchJobStatus, saveBatchImageToDisk } = require("../helper/geminiBatch.helper");
const axios = require("axios");

exports.cronFetchAPlusContentFromAmazon = async (pastSyncData = null) => {

    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronFetchAPlusContentFromAmazon`,
        log_type: "info",
    });

    try {
        const { profileId, configId, cronjobid, recurring } = pastSyncData ?? {};

        let profiles = await getActivePlanProfiles(profileId, "sp", configId);
        const allowedProfiles = await getAllowedSyncProfiles("SELLER_CATALOG", "seller", recurring);
        profiles = profiles.filter(p =>
            allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
        );

        if (!profiles || profiles.length === 0) {
            if (cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "FAILED" },
                    { new: true }
                );
            }
            return cron_logs({
                message: `Cron A+ Content Sync stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const promises = profiles.map((profile) =>
            profileLimit(async () => {
                if (global.updateTaskProgress) global.updateTaskProgress("APlusContentSync");
                try {
                    const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);
                    if (!checkSPConfig) {
                        return cron_logs({ message: `Account disconnected ${profile.configId}`, log_type: "info" });
                    }

                    const currentDate = moment().tz(profile?.timezone).format("YYYY-MM-DD");

                    let getCronData;
                    if (recurring) {
                        getCronData = await cronJobHistorySchema.findOneAndUpdate(
                            {
                                configId: profile.configId,
                                profileId: profile.profileId,
                                cronName: "APlus Content Sync",
                                historyDate: currentDate,
                            },
                            { $set: { status: "PENDING" } },
                            { upsert: true, new: true }
                        ).lean();
                    }

                    const result = await fetchAPlusContentData(profile, currentDate, checkSPConfig);

                    if (recurring && getCronData?._id && result !== "ERROR") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    } else if (!recurring && cronjobid && result === "COMPLETED") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    }
                } catch (error) {
                    cron_logs({
                        message: `cronFetchAPlusContentFromAmazon profile error : ${error.message}`,
                        log_type: "error",
                    });
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "A+ Content Sync completed successfully.",
            log_type: "info",
        });

    } catch (error) {

        return cron_logs({
            message: `cronFetchAPlusContentFromAmazon error : ${error.message}`,
            log_type: "error",
        });
    }
};

const fetchAPlusContentData = async (profile, currentDate, checkSPConfig) => {
    try {
        const { configId, profileId } = profile;
        const token = checkSPConfig?.spAccessToken;

        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
        if (!marketplaceConfig) return "ERROR";

        const marketplaceId = marketplaceConfig.marketPlaceId;
        const endPoint = marketplaceConfig.endPoint;

        // ---------------------------------------------------------------------
        // STEP 1 : FETCH ALL CONTENT DOCUMENTS
        // ---------------------------------------------------------------------
        const allContentMap = {};
        let nextPageToken = null;
        do {

            const config = {
                method: "get",
                url: `${endPoint}/aplus/2020-11-01/contentDocuments?marketplaceId=${marketplaceId}${nextPageToken ? `&pageToken=${encodeURIComponent(nextPageToken)}` : ""}`,
                headers: { "x-amz-access-token": token },
                meta: { configId, tokenKey: "spAccessToken", sp: true, profileId },
            };

            const response = await retryWithBackoff(() => amazonAxios(config));
            if (response?.status !== 200) break;

            const records = response?.data?.contentMetadataRecords || [];
            for (const item of records) {
                const refKey = item?.contentReferenceKey;
                if (!refKey) continue;
                allContentMap[refKey] = { contentReferenceKey: refKey, contentMetadata: item?.contentMetadata || {} };
            }

            nextPageToken = response?.data?.nextPageToken || null;
            if (nextPageToken) await new Promise((resolve) => setTimeout(resolve, 200));
        } while (nextPageToken);

        cron_logs({
            message: `Fetched ${Object.keys(allContentMap)?.length} A+ content documents`,
            log_type: "info",
        });

        // ---------------------------------------------------------------------
        // STEP 2 : FETCH ALL PRODUCT ASINS
        // ---------------------------------------------------------------------
        const products = await productListingModel.aggregate([
            { $match: { configId, profileId } },
            { $group: { _id: { asin: "$asin" } } },
            { $project: { _id: 0, asin: "$_id.asin" } },
        ]);

        // ---------------------------------------------------------------------
        // STEP 3 : FETCH PUBLISH RECORDS ASIN WISE
        // ---------------------------------------------------------------------
        await Promise.all(
            products.map((product) =>
                productLimit(async () => {
                    if (global.updateTaskProgress) global.updateTaskProgress("APlusContentSync");
                    try {

                        const asin = product?.asin;
                        if (!asin) return;

                        await new Promise((resolve) => setTimeout(resolve, 200));

                        let nextPublishToken = null;
                        const bulkOps = [];
                        do {

                            const publishConfig = {
                                method: "get",
                                url: `${endPoint}/aplus/2020-11-01/contentPublishRecords?marketplaceId=${marketplaceId}&asin=${asin}${nextPublishToken ? `&pageToken=${encodeURIComponent(nextPublishToken)}` : ""}`,
                                headers: { "x-amz-access-token": token },
                                meta: { configId, tokenKey: "spAccessToken", sp: true, profileId },
                            };

                            const publishRes = await retryWithBackoff(() => amazonAxios(publishConfig));
                            if (publishRes?.status !== 200) break;

                            const publishRecords = publishRes?.data?.publishRecordList || [];

                            for (const publishItem of publishRecords) {
                                const refKey = publishItem?.contentReferenceKey;
                                const metaData = allContentMap?.[refKey]?.contentMetadata || {};

                                bulkOps.push({
                                    updateOne: {
                                        filter: {
                                            configId,
                                            profileId,
                                            asin,
                                            contentReferenceKey: refKey,
                                            locale: publishItem?.locale || "en_IN",
                                        },
                                        update: {
                                            $set: {
                                                configId,
                                                profileId,

                                                marketplaceId: publishItem?.marketplaceId || marketplaceId,
                                                asin: publishItem?.asin || asin,

                                                locale: publishItem?.locale || "en_IN",
                                                contentType: publishItem?.contentType || "EBC",
                                                contentSubType: publishItem?.contentSubType || "",
                                                contentReferenceKey: refKey,

                                                contentName: metaData?.name || null,
                                                contentStatus: metaData?.status || null,

                                                badgeSet: metaData?.badgeSet || [],
                                                updateTime: metaData?.updateTime || null,

                                                rawData: { publishRecord: publishItem, metadata: metaData },
                                                lastUpdatedAt: currentDate,
                                            },
                                        },
                                        upsert: true,
                                    },
                                });
                            }

                            nextPublishToken = publishRes?.data?.nextPageToken || null;
                        } while (nextPublishToken);

                        if (bulkOps.length) {
                            cron_logs({
                                message: `Stored ${bulkOps.length} A+ records for ASIN ${asin}`,
                                log_type: "info",
                            });
                            await parallelBulkWrite(asinAPlusContentModel, bulkOps);
                        }

                    } catch (error) {
                        cron_logs({
                            message: `A+ content fetch error for ASIN ${product?.asin} : ${error.message}`,
                            log_type: "error",
                        });
                    }
                })
            )
        );

        // ---------------------------------------------------------------------
        // STEP 4 : DELETE OLD RECORDS
        // ---------------------------------------------------------------------
        await asinAPlusContentModel.deleteMany({ configId, profileId, lastUpdatedAt: { $ne: currentDate } });

        return "SUCCESS";

    } catch (error) {
        cron_logs({
            message: `fetchAPlusContentData error : ${error.message}`,
            log_type: "error",
        });
        return "ERROR";
    }
};

function buildContentModulesFromImages(generatedImages) {
    return generatedImages.map((img) => {
        if (img.size === "970x300") {
            return {
                contentModuleType: "STANDARD_IMAGE_TEXT_OVERLAY",
                standardImageTextOverlay: {
                    overlayColorType: "DARK",
                    block: {
                        image: {
                            uploadDestinationId: img.uploadDestinationId,
                            imageCropSpecification: {
                                size: { width: { value: 970, units: "pixels" }, height: { value: 300, units: "pixels" } },
                                offset: { x: { value: 0, units: "pixels" }, y: { value: 0, units: "pixels" } }
                            },
                            altText: img.title || "Product Banner"
                        }
                    }
                }
            };
        } else {
            // "970x600"
            return {
                contentModuleType: "STANDARD_HEADER_IMAGE_TEXT",
                standardHeaderImageText: {
                    block: {
                        image: {
                            uploadDestinationId: img.uploadDestinationId,
                            imageCropSpecification: {
                                size: { width: { value: 970, units: "pixels" }, height: { value: 600, units: "pixels" } },
                                offset: { x: { value: 0, units: "pixels" }, y: { value: 0, units: "pixels" } }
                            },
                            altText: img.title || "Product Banner"
                        }
                    }
                }
            };
        }
    });
}

exports.createAIAPlusContent = async (req, res) => {
    try {
        const { asin, prompt = "", generateImageOption = false, type = "basic", useBatch = true } = req.body;

        const configId = req?.config?.configId;
        const profileId = Number(req?.body?.profileId);

        if (!asin) return res.status(203).json({ isSuccess: false, message: "ASIN is required" });

        const profile = await getProfile(configId, profileId);
        if (!profile) return res.status(203).json({ isSuccess: false, message: "Profile not found" });

        // ACCESS TOKEN
        const checkSPConfig = await getSPAccessToken(configId, profileId);
        if (!checkSPConfig) return res.status(203).json({ isSuccess: false, message: "SP API not connected" });
        const token = checkSPConfig?.spAccessToken;

        // MARKETPLACE CONFIG
        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();
        if (!marketplaceConfig) return res.status(203).json({ isSuccess: false, message: "Marketplace config not found" });
        const { endPoint, marketPlaceId } = marketplaceConfig;

        // FETCH PRODUCT DATA
        const productConfig = {
            method: "get",
            url: `${endPoint}/catalog/2022-04-01/items/${asin}?marketplaceIds=${marketPlaceId}&includedData=attributes,summaries,images`,
            headers: { "x-amz-access-token": token },
            meta: { configId, tokenKey: "spAccessToken", sp: true, profileId }
        };
        const productRes = await retryWithBackoff(() => amazonAxios(productConfig));
        if (productRes?.status !== 200) return res.status(203).json({ isSuccess: false, message: "Unable to fetch product data" });

        const product = productRes?.data;
        const summary = product?.summaries?.[0] || {};
        const attributes = product?.attributes || {};
        const images = product?.images?.[0]?.images || [];
        const bullets = attributes?.bullet_point?.map((x) => x?.value) || [];
        const description = attributes?.product_description?.[0]?.value || "";

        const productData = { title: summary?.itemName || "", brand: summary?.brand || "", description, bullets, images };

        // GEMINI AI — generate image prompts (5 for basic, 7 for premium)
        const aiResult = await generateAPlusModulesAI({ asin, prompt, productData, type });
        const imageModules = aiResult?._imageModules || [];

        // If useBatch is requested, submit via Batch API (50% discount) and process in background
        const isGenerateImage = generateImageOption === true || generateImageOption === "true";
        if (useBatch && isGenerateImage && imageModules.length > 0) {
            let productRef = null;
            const mains = images.filter((i) => i?.variant === "MAIN" && i?.link);
            const pool = mains.length ? mains : images.filter((i) => i?.link);
            if (pool.length > 0) {
                const best = pool.reduce(
                    (a, b) => ((Number(b.width) * Number(b.height) || 0) > (Number(a.width) * Number(a.height) || 0) ? b : a),
                    pool[0]
                );
                try {
                    const imgRes = await axios.get(best.link, { responseType: "arraybuffer" });
                    productRef = {
                        mimeType: imgRes.headers["content-type"] || "image/jpeg",
                        data: Buffer.from(imgRes.data).toString("base64"),
                    };
                } catch (err) {
                    write_logs({ message: `Could not fetch product image for batch: ${err.message}`, log_type: "warn" });
                }
            }

            try {
                const batchSubmission = await submitAPlusImageBatchJob({
                    imageModules,
                    productRef,
                    type,
                });

                const batchJobDoc = await aPlusBatchJobModel.create({
                    configId,
                    profileId,
                    marketplaceId: marketPlaceId,
                    asin,
                    type,
                    batchJobName: batchSubmission.batchJobName,
                    status: "PENDING",
                    imageModules,
                    productData: { title: productData.title, brand: productData.brand },
                });

                return res.status(200).json({
                    isSuccess: true,
                    isBatch: true,
                    message: `A+ ${type} content image generation started in the background at 50% discount rate. You will receive a notification once generated and published to Amazon.`,
                    data: {
                        jobId: batchJobDoc._id,
                        batchJobName: batchSubmission.batchJobName,
                        asin,
                        type,
                        count: imageModules.length,
                    },
                });
            } catch (batchErr) {
                const apiErrMsg = batchErr?.response?.data?.error?.message || batchErr.message || "";
                write_logs({ message: `Batch submission failed: ${apiErrMsg}`, log_type: "warn" });

                if (apiErrMsg.includes("spending cap") || apiErrMsg.includes("quota") || batchErr?.response?.status === 429) {
                    return res.status(203).json({
                        isSuccess: false,
                        message: `Google AI Studio spending cap exceeded: ${apiErrMsg || "Please check your project spend cap at https://ai.studio/spend"}`,
                    });
                }
            }
        }

        // DIRECT GENERATION FALLBACK
        const generatedImages = await generateAndUploadModuleImages({
            aiResult,
            productData,
            token,
            endPoint,
            marketPlaceId,
            configId,
            profileId,
            generateImageOption,
            type,
        });

        // CREATE PAYLOAD WITH ZERO CONTENT (PURE IMAGES)
        const payload = {
            contentDocument: {
                name: `AI A+ ${asin} (en-IN)`,
                contentType: "EBC",
                locale: "en-IN",
                contentModuleList: buildContentModulesFromImages(generatedImages)
            }
        };

        // AMAZON CREATE API
        const createConfig = {
            method: "post",
            url: `${endPoint}/aplus/2020-11-01/contentDocuments?marketplaceId=${marketPlaceId}`,
            headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
            data: payload,
            meta: { configId, tokenKey: "spAccessToken", sp: true, profileId }
        };

        const createRes = await retryWithBackoff(() => amazonAxios(createConfig));
        const contentReferenceKey = createRes?.data?.contentReferenceKey

        const asinSet = await getAllVariationAsins({ asin, token, endPoint, marketplaceId: marketPlaceId });
        await addAsinsToAPlusContent({ contentReferenceKey, asinSet, token, endPoint, marketplaceId: marketPlaceId });

        // STORE IN DB
        const allAsinDocs = asinSet.map((singleAsin) => ({
            updateOne: {
                filter: {
                    configId,
                    profileId,
                    asin: singleAsin,
                    contentReferenceKey,
                    locale: "en_IN",
                    marketplaceId: marketPlaceId,
                },
                update: {
                    $set: {
                        configId,
                        profileId,
                        marketplaceId: marketPlaceId,
                        asin: singleAsin,
                        locale: "en_IN",
                        contentType: payload?.contentDocument?.contentType || "EBC",
                        contentSubType: payload?.contentDocument?.contentSubType || "",
                        contentReferenceKey,
                        contentName: payload?.contentDocument?.name || "",
                        contentStatus: createRes?.data?.status || "DRAFT",
                        badgeSet: createRes?.data?.badgeSet || [],
                        updateTime: createRes?.data?.updateTime || new Date(),
                    }
                },
                upsert: true
            }
        }));
        await asinAPlusContentModel.bulkWrite(allAsinDocs);

        return res.status(200).json({
            isSuccess: true,
            message: `A+ ${type} content and images generated successfully`,
            data: {
                type,
                count: generatedImages.length,
                contentReferenceKey,
                product: { title: productData.title, brand: productData.brand },
                images: generatedImages.map(img => ({
                    title: img.title,
                    size: img.size,
                    uploadDestinationId: img.uploadDestinationId,
                }))
            },
        });

    } catch (error) {
        const detailedError =
            error?.response?.data?.errors?.[0]?.message ||
            error?.response?.data?.errors?.[0]?.description ||
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error?.message ||
            "";

        write_logs({
            message: `createAIAPlusContent Error [${error?.response?.status || 500}]: ${detailedError} | Full: ${JSON.stringify(error?.response?.data || error?.message)}`,
            log_type: "error",
        });

        let errorMessage = "AI analysis failed. Please try again later.";

        if (error?.response?.status === 403 || error?.message?.includes("403")) {
            errorMessage = `Access Denied (403): ${detailedError || "Your Amazon Seller account does not have permission for this action (e.g. Brand Registry is required for A+ content, or SP-API token expired)."}`;
        } else if (detailedError.includes("spending cap") || detailedError.includes("quota") || error?.response?.status === 429) {
            errorMessage = `AI limit reached: ${detailedError || "Please check your project spend cap at https://ai.studio/spend"}`;
        } else if (error?.message?.includes("503") || error?.message?.includes("high demand")) {
            errorMessage = "Our AI servers are currently experiencing high demand. Please try again in a few minutes.";
        } else if (detailedError) {
            errorMessage = detailedError;
        }

        return res.status(203).json({ isSuccess: false, message: errorMessage });
    }
};

exports.editAIAPlusContent = async (req, res) => {
    try {
        const { asin, prompt = "", contentReferenceKey, generateImageOption = false, type = "basic" } = req.body;

        const configId = req?.config?.configId;
        const profileId = Number(req?.body?.profileId);

        if (!asin) return res.status(203).json({ isSuccess: false, message: "ASIN is required" });
        if (!contentReferenceKey) return res.status(203).json({ isSuccess: false, message: "ContentReferenceKey is required" });

        const profile = await getProfile(configId, profileId);
        if (!profile) return res.status(203).json({ isSuccess: false, message: "Profile not found" });

        // ACCESS TOKEN
        const checkSPConfig = await getSPAccessToken(configId, profileId);
        if (!checkSPConfig) return res.status(203).json({ isSuccess: false, message: "SP API not connected" });
        const token = checkSPConfig?.spAccessToken;

        // MARKETPLACE CONFIG
        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();
        if (!marketplaceConfig) return res.status(203).json({ isSuccess: false, message: "Marketplace config not found" });
        const { endPoint, marketPlaceId } = marketplaceConfig;

        // FETCH PRODUCT DATA
        const productConfig = {
            method: "get",
            url: `${endPoint}/catalog/2022-04-01/items/${asin}?marketplaceIds=${marketPlaceId}&includedData=attributes,summaries,images`,
            headers: { "x-amz-access-token": token },
            meta: { configId, tokenKey: "spAccessToken", sp: true, profileId }
        };
        const productRes = await retryWithBackoff(() => amazonAxios(productConfig));
        if (productRes?.status !== 200) return res.status(203).json({ isSuccess: false, message: "Unable to fetch product data" });

        const product = productRes?.data;
        const summary = product?.summaries?.[0] || {};
        const attributes = product?.attributes || {};
        const images = product?.images?.[0]?.images || [];
        const bullets = attributes?.bullet_point?.map((x) => x?.value) || [];
        const description = attributes?.product_description?.[0]?.value || "";

        const productData = { title: summary?.itemName || "", brand: summary?.brand || "", description, bullets, images }

        // GEMINI AI — generate image prompts (5 for basic, 7 for premium)
        const aiResult = await generateAPlusModulesAI({ asin, prompt, productData, type });

        // GENERATE IMAGES
        const generatedImages = await generateAndUploadModuleImages({
            aiResult,
            productData,
            token,
            endPoint,
            marketPlaceId,
            configId,
            profileId,
            generateImageOption,
            type
        });

        // CREATE PAYLOAD WITH ZERO CONTENT (PURE IMAGES)
        const payload = {
            contentDocument: {
                name: `AI A+ ${asin} (en-IN)`,
                contentType: "EBC",
                locale: "en-IN",
                contentModuleList: buildContentModulesFromImages(generatedImages)
            }
        };

        // AMAZON UPDATE API
        const updateConfig = {
            method: "post",
            url: `${endPoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}?marketplaceId=${marketPlaceId}`,
            headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
            data: payload,
            meta: { configId, tokenKey: "spAccessToken", sp: true, profileId }
        };

        const updateRes = await retryWithBackoff(() => amazonAxios(updateConfig));

        const asinSet = await getAllVariationAsins({ asin, token, endPoint, marketplaceId: marketPlaceId });
        await addAsinsToAPlusContent({ contentReferenceKey, asinSet, token, endPoint, marketplaceId: marketPlaceId });

        // STORE IN DB
        const allAsinDocs = asinSet.map((singleAsin) => ({
            updateOne: {
                filter: {
                    configId,
                    profileId,
                    asin: singleAsin,
                    contentReferenceKey,
                    locale: "en_IN",
                    marketplaceId: marketPlaceId,
                },
                update: {
                    $set: {
                        configId,
                        profileId,
                        marketplaceId: marketPlaceId,
                        asin: singleAsin,
                        locale: "en_IN",
                        contentReferenceKey,
                        contentName: payload?.contentDocument?.name || "",
                        contentStatus: updateRes?.data?.status || "DRAFT",
                        updateTime: updateRes?.data?.updateTime || new Date(),
                    }
                },
                upsert: true
            }
        }));
        await asinAPlusContentModel.bulkWrite(allAsinDocs);

        return res.status(200).json({
            isSuccess: true,
            message: `A+ ${type} content and images updated successfully`,
            data: {
                type,
                count: generatedImages.length,
                contentReferenceKey,
                product: { title: productData.title, brand: productData.brand },
                images: generatedImages.map(img => ({
                    title: img.title,
                    size: img.size,
                    uploadDestinationId: img.uploadDestinationId,
                }))
            },
        });

    } catch (error) {
        write_logs({ message: `editAIAPlusContent: Error: ${error.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        let errorMessage = "AI analysis failed. Please try again later.";

        // Handle Gemini High Demand / Quota errors cleanly
        if (error.message?.includes("503") || error.message?.includes("high demand")) {
            errorMessage = "Our AI servers are currently experiencing high demand. Please try optimizing this listing again in a few minutes.";
        } else if (error.message?.includes("429") || error.message?.includes("quota")) {
            errorMessage = "AI rate limit exceeded. Please try again in a few moments.";
        } else if (error.message) {
            errorMessage = error.message;
        }

        return res.status(203).json({ isSuccess: false, message: errorMessage });
    }
};

exports.getAPlusContentByReferenceKey = async (req, res) => {
    try {
        const { contentReferenceKey, profileId } = req.body;
        const configId = req?.config?.configId;

        if (!contentReferenceKey) return res.status(203).json({ isSuccess: false, message: "contentReferenceKey is required" });

        // PROFILE
        const profile = await getProfile(configId, Number(profileId));
        if (!profile) return res.status(203).json({ isSuccess: false, message: "Profile not found" });

        // SP API TOKEN
        const checkSPConfig = await getSPAccessToken(configId, Number(profileId));
        if (!checkSPConfig) return res.status(203).json({ isSuccess: false, message: "SP API not connected" });
        const token = checkSPConfig?.spAccessToken;

        // MARKETPLACE CONFIG
        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();
        if (!marketplaceConfig) return res.status(203).json({ isSuccess: false, message: "Marketplace config not found" });

        const { endPoint, marketPlaceId } = marketplaceConfig;

        // AMAZON API
        const config = {
            method: "get",
            url: `${endPoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}`,
            params: { marketplaceId: marketPlaceId, includedDataSet: ["CONTENTS", "METADATA"].join(",") },
            headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
            meta: { configId, tokenKey: "spAccessToken", sp: true, profileId: Number(profileId) }
        };

        const response = await retryWithBackoff(() => amazonAxios(config));

        return res.status(200).json({
            isSuccess: true,
            message: "A+ Content fetched successfully",
            data: response?.data
        });
    } catch (error) {
        write_logs({ message: `getAPlusContentByReferenceKey: ${error.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).json({
            isSuccess: false,
            message: error?.response?.data?.errors?.[0]?.message || error?.message || "Failed to fetch A+ Content"
        });
    }
};

exports.submitAPlusContentForApproval = async (req, res) => {
    try {
        const { profileId, contentReferenceKey } = req.body;
        const configId = req?.config?.configId;

        if (!contentReferenceKey) return res.status(203).json({ isSuccess: false, message: "contentReferenceKey is required" });

        // PROFILE
        const profile = await getProfile(configId, Number(profileId));
        if (!profile) return res.status(203).json({ isSuccess: false, message: "Profile not found" });

        // SP API TOKEN
        const checkSPConfig = await getSPAccessToken(configId, Number(profileId));
        if (!checkSPConfig) return res.status(203).json({ isSuccess: false, message: "SP API not connected" });
        const token = checkSPConfig?.spAccessToken;

        // MARKETPLACE CONFIG
        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();
        if (!marketplaceConfig) return res.status(203).json({ isSuccess: false, message: "Marketplace config not found" });

        const { endPoint, marketPlaceId } = marketplaceConfig;

        // AMAZON APPROVAL API
        const config = {
            method: "post",
            url: `${endPoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}/approvalSubmissions`,
            params: { marketplaceId: marketPlaceId },
            headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
            data: {},
            meta: { configId, tokenKey: "spAccessToken", sp: true, profileId: Number(profileId) }
        };

        const response = await retryWithBackoff(() => amazonAxios(config));

        await asinAPlusContentModel.updateMany(
            { configId, profileId: Number(profileId), marketplaceId: marketPlaceId, contentReferenceKey },
            { $set: { contentStatus: "APPROVED", updateTime: new Date() } }
        );

        return res.status(200).json({
            isSuccess: true,
            message: "A+ Content submitted for approval successfully",
            data: response?.data
        });
    } catch (error) {
        write_logs({ message: `submitAPlusContentForApproval: ${error.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).json({
            isSuccess: false,
            message: error?.response?.data?.errors?.[0]?.message || error?.message || "Failed to submit A+ Content for approval"
        });
    }
};

/**
 * Background Cron Job to poll and complete pending Gemini A+ Batch Image jobs
 */
exports.cronProcessPendingAPlusBatchJobs = async () => {
    try {
        const pendingJobs = await aPlusBatchJobModel.find({
            status: { $in: ["PENDING", "PROCESSING"] },
        }).sort({ createdAt: 1 }).limit(10);

        if (!pendingJobs.length) return;

        cron_logs({
            message: `cronProcessPendingAPlusBatchJobs: Found ${pendingJobs.length} pending batch jobs to check`,
            log_type: "info",
        });

        for (const job of pendingJobs) {
            try {
                const { configId, profileId, marketplaceId, asin, type, batchJobName, imageModules, productData } = job;

                // 1. Check Batch Status with Google
                const statusRes = await checkBatchJobStatus(batchJobName);

                if (statusRes.isFailed) {
                    job.status = "FAILED";
                    job.error = statusRes.error || "Batch generation failed at Google";
                    await job.save();
                    cron_logs({ message: `A+ Batch Job ${job._id} failed: ${job.error}`, log_type: "error" });
                    continue;
                }

                if (!statusRes.isCompleted) {
                    if (job.status !== "PROCESSING") {
                        job.status = "PROCESSING";
                        await job.save();
                    }
                    continue;
                }

                // 2. Job completed by Google! Process images and upload
                const responses = statusRes.responses || [];
                const checkSPConfig = await getSPAccessToken(configId, profileId);
                const token = checkSPConfig?.spAccessToken;

                const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: marketplaceId }).lean();
                const endPoint = marketplaceConfig?.endPoint;

                const generatedImages = [];
                for (let i = 0; i < imageModules.length; i++) {
                    const mod = imageModules[i];
                    const rawResponse = responses[i];
                    const candParts = rawResponse?.response?.candidates?.[0]?.content?.parts || rawResponse?.candidates?.[0]?.content?.parts || [];
                    const img = candParts.find((p) => p?.inlineData?.data);

                    let localPath = null;
                    if (img?.inlineData?.data) {
                        try {
                            localPath = await saveBatchImageToDisk({
                                base64Data: img.inlineData.data,
                                size: mod.size,
                                imageKey: `aplus-${type}-${i + 1}`,
                                title: mod.title,
                            });
                        } catch (imgErr) {
                            write_logs({ message: `Failed to save batch image ${mod.title}: ${imgErr.message}`, log_type: "error" });
                        }
                    }

                    let uploadDestinationId = null;
                    if (localPath && token && endPoint && marketplaceId) {
                        try {
                            uploadDestinationId = await uploadImageToAmazon({
                                localPath,
                                token,
                                endPoint,
                                marketPlaceId: marketplaceId,
                            });
                        } catch (uploadErr) {
                            write_logs({ message: `Amazon upload failed for batch image ${mod.title}: ${uploadErr.message}`, log_type: "error" });
                        }
                    }

                    generatedImages.push({
                        title: mod.title,
                        prompt: mod.prompt,
                        size: mod.size,
                        localPath,
                        uploadDestinationId,
                    });
                }

                // 3. Build and Publish Amazon A+ Document
                const payload = {
                    contentDocument: {
                        name: `AI A+ ${asin} (en-IN)`,
                        contentType: "EBC",
                        locale: "en-IN",
                        contentModuleList: buildContentModulesFromImages(generatedImages),
                    },
                };

                let contentReferenceKey = job.contentReferenceKey;
                let amazonRes;

                if (contentReferenceKey) {
                    const updateConfig = {
                        method: "post",
                        url: `${endPoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}?marketplaceId=${marketplaceId}`,
                        headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
                        data: payload,
                        meta: { configId, tokenKey: "spAccessToken", sp: true, profileId },
                    };
                    amazonRes = await retryWithBackoff(() => amazonAxios(updateConfig));
                } else {
                    const createConfig = {
                        method: "post",
                        url: `${endPoint}/aplus/2020-11-01/contentDocuments?marketplaceId=${marketplaceId}`,
                        headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
                        data: payload,
                        meta: { configId, tokenKey: "spAccessToken", sp: true, profileId },
                    };
                    amazonRes = await retryWithBackoff(() => amazonAxios(createConfig));
                    contentReferenceKey = amazonRes?.data?.contentReferenceKey;
                }

                const asinSet = await getAllVariationAsins({ asin, token, endPoint, marketplaceId });
                await addAsinsToAPlusContent({ contentReferenceKey, asinSet, token, endPoint, marketplaceId });

                // 4. Update Database
                const allAsinDocs = asinSet.map((singleAsin) => ({
                    updateOne: {
                        filter: {
                            configId,
                            profileId,
                            asin: singleAsin,
                            contentReferenceKey,
                            locale: "en_IN",
                            marketplaceId,
                        },
                        update: {
                            $set: {
                                configId,
                                profileId,
                                marketplaceId,
                                asin: singleAsin,
                                locale: "en_IN",
                                contentType: "EBC",
                                contentReferenceKey,
                                contentName: payload.contentDocument.name,
                                contentStatus: amazonRes?.data?.status || "DRAFT",
                                badgeSet: amazonRes?.data?.badgeSet || [],
                                updateTime: new Date(),
                            },
                        },
                        upsert: true,
                    },
                }));
                await asinAPlusContentModel.bulkWrite(allAsinDocs);

                // Update Batch Job
                job.status = "COMPLETED";
                job.generatedImages = generatedImages;
                job.contentReferenceKey = contentReferenceKey;
                await job.save();

                // 5. 🔔 Send In-App & Push Notification to User
                const notifTitle = "A+ Content Generated & Ready!";
                const notifText = `Your A+ ${type.toUpperCase()} content for ASIN ${asin} (${productData?.title?.slice(0, 35) || ""}...) has been successfully generated via Google Batch and published to Amazon.`;

                await adNotificationSchema.create({
                    configId,
                    profileId,
                    notificationTitle: notifTitle,
                    notificationText: notifText,
                    searchable: asin,
                    seen: false,
                });

                if (typeof sendNotificationToUser === "function") {
                    await sendNotificationToUser(profileId, notifTitle, notifText);
                }

                cron_logs({
                    message: `A+ Batch Job ${job._id} successfully completed and published to Amazon for ASIN ${asin}`,
                    log_type: "info",
                });
            } catch (jobErr) {
                cron_logs({
                    message: `Error processing A+ batch job ${job._id}: ${jobErr.message}`,
                    log_type: "error",
                });
            }
        }
    } catch (err) {
        cron_logs({
            message: `cronProcessPendingAPlusBatchJobs error: ${err.message}`,
            log_type: "error",
        });
    }
};