
const moment = require("moment-timezone");
const { retryWithBackoff } = require("../helper/retryHelper");

const axios = require("axios");
const { Buffer } = require("buffer");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));

const fs = require("fs");
const path = require("path");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");
const csv = require("csv-parser");
const { streamValues } = require("stream-json/streamers/StreamValues");

const profileSchema = require("../models/profiles.model");
const orderSchema = require("../models/order.model");
const orderDetailsModel = require("../models/orderDetails.model");
const returnSchema = require("../models/return.model");
const productListingSchema = require("../models/productListing.model");
const adNotificationSchema = require("../models/adNotification.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const cronJobSchema = require("../models/cronJob.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const reportsSchema = require("../models/report.model");
const inventorySchema = require("../models/inventory.model");
const productAdsSchema = require("../models/productAds.model");
const sdProductAdsSchema = require("../models/sdProductAds.model");
const sbProductAdsSchema = require("../models/sbProductAds.model");
const postalCodeStateModel = require("../models/postalCodeState.model");
const crypto = require("crypto");

const {
    getLast2DaysRange,
    wait,
    getProfile,
    downloadReport,
    getSPAccessToken,
    buildFieldFilter,
    getActivePlanProfiles,
    getRuleDate,
    downloadFile,
    parallelBulkWrite,
    convertXMLToJSON,
    getLast7DaysRange,
    generateDateRange,
    safeJsonParse,
    getAllowedSyncProfiles,
    validateReportFile,
} = require("../helper/common");

const { sendNotificationToUser } = require("../helper/sendNotification");
const { ConditionRegistry, ConditionEvaluator, FlattenedFieldBuilder, ensureEnumIntegrity } = require("../helper/parseField");
const { generateListingWithGPT, buildListingBodyPayload, buildListingDynamicBodyPayload, analyzeExistingListingWithGPT, buildOptimizationPatchPayload } = require("../helper/chatgpt");

const { write_logs } = require("../../winston/orders/logger");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const amazonAxios = require("../helper/amazonAxios");
const { RETURN_REASON_LABELS, RETURN_TYPE_LABELS, RETURN_STATUS_LABELS, RETURN_SOURCE_LABELS } = require("../constants/returns");
const { logAudit } = require("../helpers/auditHelper");

exports.cronGenerateOrderReport = async (customStartDate = null, customEndDate = null) => {
    cron_logs({
        message: `India Time = ${moment()
            .tz("Asia/Kolkata")
            .format("HH:mm")} cronGenerateOrderReport`,
        log_type: "info",
    });
    try {
        let pastSyncObj = null;
        let startDateParam = null;
        let endDateParam = null;
        let cronjobid = null;
        let recurring = true;

        if (customStartDate && typeof customStartDate === "object") {
            pastSyncObj = customStartDate;
            startDateParam = pastSyncObj.startDate;
            endDateParam = pastSyncObj.endDate;
            cronjobid = pastSyncObj.cronjobid;
            recurring = pastSyncObj.recurring;
        } else {
            startDateParam = customStartDate;
            endDateParam = customEndDate;
        }

        const targetProfileId = pastSyncObj?.profileId || null;
        const targetConfigId = pastSyncObj?.configId || null;
        let getProfileId = await getActivePlanProfiles(targetProfileId, "sp", targetConfigId);

        const allowedProfiles = await getAllowedSyncProfiles("ORDERS_AND_FINANCE", "seller", recurring);
        getProfileId = getProfileId.filter((profile) =>
            allowedProfiles.some(item => item.profileId === Number(profile.profileId) && item.configId === String(profile.configId))
        );

        if (!getProfileId || getProfileId.length === 0) {
            if (cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "FAILED" },
                    { new: true }
                );
            }
            return cron_logs({
                message: `Cron Order Listing stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const reportromises = getProfileId.map((profile) => limit(async () => {
            if (global.updateTaskProgress) global.updateTaskProgress("Sync Order");
            const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);
            if (checkSPConfig) {
                const now = moment().tz(profile.timezone);
                const currentDate = now.format("YYYY-MM-DD");
                let getCronData;
                if (recurring) {
                    getCronData = await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Sync Order",
                            historyDate: currentDate
                        },
                        {
                            $set: {
                                status: "PENDING",
                            }
                        },
                        { upsert: true, new: true }
                    ).lean();
                }
                let startDate, endDate;
                if (startDateParam && endDateParam) {
                    startDate = startDateParam;
                    endDate = endDateParam;
                } else {
                    const range = getLast2DaysRange(profile?.timezone);
                    startDate = range.startDate;
                    endDate = range.endDate;
                }
                const reportSpResponse = await generateSPReport(
                    profile.configId,
                    profile.profileId,
                    startDate,
                    endDate,
                    checkSPConfig,
                    recurring,
                    "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL"
                );

                if (recurring && getCronData?._id && reportSpResponse != "ERROR") {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        getCronData._id,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                }
                else if (!recurring && cronjobid && reportSpResponse === "COMPLETED") {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true },
                    );
                }
            }
            else {
                return cron_logs({
                    message: `Account disconnected in report ${profile.configId}, Config: ${checkSPConfig}`,
                    log_type: "info",
                });
            }
        }));
        await Promise.all(reportromises);
        return cron_logs({
            message: "Order report generated successfully.",
            log_type: "info",
        });
    }
    catch (error) {
        return cron_logs({
            message: `Order report err: ${error}`,
            log_type: "error",
        });
    }
}

const generateSPReport = async (
    configId,
    profileId,
    startDate,
    endDate,
    checkSPConfig,
    recurring = true,
    reportTypeId = "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL"
) => {
    return new Promise(async (resolve, reject) => {

        const getAccount = await getProfile(configId, profileId);
        const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: getAccount.marketplaceStringId }).lean();
        const tz = getAccount?.timezone || "Asia/Kolkata";
        const dataStartTime = moment.tz(startDate, tz).startOf("day").toISOString();
        let dataEndTime = moment.tz(endDate, tz).endOf("day");
        const currentMoment = moment().tz(tz);
        if (dataEndTime.isAfter(currentMoment)) dataEndTime = currentMoment.clone().subtract(5, "minutes");

        const bodyData = {
            reportType: reportTypeId,
            marketplaceIds: [getAccount.marketplaceStringId],
            dataStartTime,
            dataEndTime: dataEndTime.toISOString()
        };
        let reportPOSTOptions = {
            method: "POST",
            url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
            headers: {
                "x-amz-access-token": `${checkSPConfig.spAccessToken}`,
                "Content-Type": "application/json",
            },
            data: bodyData,
            meta: { configId: configId, tokenKey: "spAccessToken", sp: true, profileId: profileId }
        };

        try {
            let getReportData = null;
            if (recurring) {
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                getReportData = await reportsSchema.findOne({
                    profileId,
                    configId,
                    reportTypeId: reportTypeId,
                    reportName: "Order Report",
                    status: "PENDING",
                    createdAt: { $gte: twentyFourHoursAgo },
                }).sort({ createdAt: -1 }).lean();
            } else {
                getReportData = await reportsSchema.findOne({
                    startDate: moment(startDate).tz(getAccount.timezone).format("YYYY-MM-DD"),
                    endDate: moment(endDate).tz(getAccount.timezone).format("YYYY-MM-DD"),
                    profileId,
                    configId,
                    reportTypeId: reportTypeId,
                    reportName: "Order Report"
                }).sort({ createdAt: -1 }).lean();
                if (recurring && getReportData && getReportData.status == "COMPLETED") {
                    return resolve("COMPLETED");
                }
                if (getReportData && !["IN_PROGRESS", "PROCESSING", "COMPLETED"].includes(getReportData?.status)) {
                    getReportData = null;
                }
            }
            if (!getReportData) {
                const response = await retryWithBackoff(() => amazonAxios(reportPOSTOptions));
                if (response.status == 202) {
                    const body = response.data;
                    const createReport = new reportsSchema({
                        adProduct: "Seller Report",
                        reportTypeId: reportTypeId,
                        startDate: moment(startDate).tz(getAccount.timezone).format("YYYY-MM-DD"),
                        endDate: moment(endDate).tz(getAccount.timezone).format("YYYY-MM-DD"),
                        reportId: body.reportId,
                        status: "PENDING",
                        profileId,
                        configId,
                        reportName: "Order Report",
                    });
                    await createReport.save();
                    getReportData = createReport;
                    await wait(60000);
                }
            }

            if (getReportData) {
                if (recurring && getReportData.status == "COMPLETED") {
                    resolve(getReportData.status);
                }
                else {
                    let reportIdGETOptions = {
                        method: "GET",
                        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${getReportData.reportId}`,
                        headers: {
                            "x-amz-access-token": `${checkSPConfig.spAccessToken}`,
                            "Content-Type": "application/json",
                        },
                        meta: { configId: configId, tokenKey: "spAccessToken", sp: true, profileId: profileId }
                    };
                    const response = await retryWithBackoff(() => amazonAxios(reportIdGETOptions));
                    if (response.status == 200) {
                        if (response.data?.processingStatus == "DONE") {
                            write_logs({
                                message: `Order report Status: ${response.data?.processingStatus}`,
                                log_type: "info",
                            });
                            reportIdGETOptions.url = `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${response.data?.reportDocumentId}`;
                            const documentResponse = await retryWithBackoff(() => amazonAxios(reportIdGETOptions));
                            write_logs({
                                message: `Order report Get Document: ${documentResponse.data}`,
                                log_type: "info",
                            });
                            if (documentResponse.status == 200) {
                                const reportId = getReportData.reportId;
                                console.log(`==================================================`);
                                console.log(`[REPORT TRACKING] Amazon Report ID : ${reportId}`);
                                console.log(`[REPORT TRACKING] Profile ID        : ${profileId}`);
                                console.log(`[REPORT TRACKING] Config ID         : ${configId}`);
                                console.log(`==================================================`);

                                const documentUrl = documentResponse.data?.url;
                                const uploadDir = path.join(__dirname, "../../uploads/orderBulkReports");
                                try {
                                    if (!fs.existsSync(uploadDir)) {
                                        fs.mkdirSync(uploadDir, { recursive: true });
                                    }
                                    const tsvFilePath = path.join(uploadDir, `${reportId}.tsv`);
                                    await downloadFile(documentUrl, tsvFilePath);
                                    console.log(`[REPORT FILE SAVED] Saved raw TSV report: ${tsvFilePath}`);
                                } catch (fileErr) {
                                    write_logs({ message: `[generateSPReport Error] ${fileErr?.message || fileErr}`, log_type: "error" });
                                    console.error(`[REPORT FILE ERROR] Could not save TSV file: ${fileErr.message}`);
                                }

                                const orderList = await downloadReport(documentUrl);

                                try {
                                    if (orderList && fs.existsSync(uploadDir)) {
                                        const jsonFilePath = path.join(uploadDir, `${reportId}.json`);
                                        fs.writeFileSync(jsonFilePath, JSON.stringify(orderList, null, 2), "utf8");
                                        console.log(`[REPORT FILE SAVED] Saved parsed JSON report: ${jsonFilePath}`);
                                    }
                                } catch (jsonErr) {
                                    console.error(`[REPORT FILE ERROR] Could not save JSON file: ${jsonErr.message}`);
                                }

                                write_logs({
                                    message: `Order report Order Count: ${orderList.length} | Report ID: ${reportId}`,
                                    log_type: "info",
                                });

                                if (orderList && orderList.length > 0) {
                                    const orderMap = new Map();
                                    const simpleOrderBulkOps = [];

                                    const getReportVal = (row, ...keys) => {
                                        if (!row || typeof row !== "object") return "";
                                        for (const key of keys) {
                                            if (row[key] !== undefined && row[key] !== null) return row[key];
                                        }
                                        const normalizedMap = new Map();
                                        for (const k of Object.keys(row)) {
                                            const cleanKey = k.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[-_ ]/g, "");
                                            normalizedMap.set(cleanKey, row[k]);
                                        }
                                        for (const key of keys) {
                                            if (!key) continue;
                                            const targetClean = key.trim().toLowerCase().replace(/[-_ ]/g, "");
                                            if (normalizedMap.has(targetClean)) {
                                                const val = normalizedMap.get(targetClean);
                                                if (val !== undefined && val !== null) return val;
                                            }
                                        }
                                        return "";
                                    };

                                    for (const row of orderList) {
                                        const orderId = String(getReportVal(row, "amazon-order-id", "amazon_order_id", "amazonOrderId", "order-id", "orderId")).trim();
                                        if (!orderId) continue;

                                        const rawPrice = getReportVal(row, "item-price", "item_price", "itemPrice", "Item Price");
                                        const rawQty = getReportVal(row, "quantity", "quantity-ordered", "quantity_ordered", "quantityOrdered");
                                        const rawTax = getReportVal(row, "item-tax", "item_tax", "itemTax");
                                        const rawShipPrice = getReportVal(row, "shipping-price", "shipping_price", "shippingPrice");
                                        const rawShipTax = getReportVal(row, "shipping-tax", "shipping_tax", "shippingTax");
                                        const rawPromoDisc = getReportVal(row, "item-promotion-discount", "item_promotion_discount", "itemPromotionDiscount");

                                        const itemPrice = isNaN(parseFloat(rawPrice)) ? 0 : parseFloat(rawPrice);
                                        const itemQty = isNaN(parseInt(rawQty, 10)) ? 0 : parseInt(rawQty, 10);
                                        const itemTax = isNaN(parseFloat(rawTax)) ? 0 : parseFloat(rawTax);
                                        const shippingPrice = isNaN(parseFloat(rawShipPrice)) ? 0 : parseFloat(rawShipPrice);
                                        const shippingTax = isNaN(parseFloat(rawShipTax)) ? 0 : parseFloat(rawShipTax);
                                        const promotionDiscount = isNaN(parseFloat(rawPromoDisc)) ? 0 : parseFloat(rawPromoDisc);

                                        const rawStatus = String(getReportVal(row, "order-status", "order_status", "orderStatus", "Order Status")).trim().toUpperCase();
                                        let normalizedStatus = rawStatus;
                                        if (!normalizedStatus) {
                                            const itemStatus = String(getReportVal(row, "item-status", "item_status", "itemStatus")).toLowerCase();
                                            if (itemStatus.includes("shipped")) normalizedStatus = "SHIPPED";
                                            else if (itemStatus.includes("cancel")) normalizedStatus = "CANCELLED";
                                            else normalizedStatus = "UNSHIPPED";
                                        }

                                        function normalizeFulfilledBy(channel) {
                                            if (!channel) return "MERCHANT";
                                            const c = String(channel).trim().toLowerCase();
                                            if (c.includes("amazon") || c.includes("afn") || c.includes("fba")) {
                                                return "AMAZON";
                                            }
                                            return "MERCHANT";
                                        }

                                        const rawFulfillmentChannel = getReportVal(row, "fulfillment-channel", "fulfillment_channel", "fulfillmentChannel");
                                        const fulfilledBy = normalizeFulfilledBy(rawFulfillmentChannel);

                                        const purchaseDateRaw = getReportVal(row, "purchase-date", "purchase_date", "purchaseDate");
                                        const updatedDateRaw = getReportVal(row, "last-updated-date", "last_updated_date", "lastUpdatedDate");
                                        const asin = String(getReportVal(row, "asin", "ASIN")).trim();
                                        const sku = String(getReportVal(row, "sku", "seller-sku", "seller_sku", "sellerSku")).trim();
                                        const productName = String(getReportVal(row, "product-name", "product_name", "productName", "title")).trim();

                                        if (!orderMap.has(orderId)) {
                                            orderMap.set(orderId, {
                                                configId,
                                                profileId: Number(profileId),
                                                marketplaceId: getAccount.marketplaceStringId,
                                                orderId,
                                                orderStatus: normalizedStatus,
                                                orderCreatedTime: purchaseDateRaw ? new Date(purchaseDateRaw) : new Date(),
                                                orderLastUpdatedTime: updatedDateRaw ? new Date(updatedDateRaw) : new Date(),
                                                salesChannel: {
                                                    channelName: getReportVal(row, "sales-channel", "sales_channel") || "Amazon",
                                                    marketplaceName: getReportVal(row, "sales-channel", "sales_channel") || "Amazon",
                                                },
                                                buyer: {
                                                    buyerName: getReportVal(row, "buyer-name", "buyer_name") || "",
                                                    buyerEmail: getReportVal(row, "buyer-email", "buyer_email") || "",
                                                },
                                                recipient: {
                                                    deliveryAddress: {
                                                        city: getReportVal(row, "ship-city", "ship_city") || "",
                                                        stateOrRegion: getReportVal(row, "ship-state", "ship_state") || "",
                                                        postalCode: getReportVal(row, "ship-postal-code", "ship_postal_code") || "",
                                                        countryCode: getReportVal(row, "ship-country", "ship_country") || "",
                                                    }
                                                },
                                                fulfillment: {
                                                    fulfillmentStatus: normalizedStatus,
                                                    fulfilledBy: fulfilledBy,
                                                    fulfillmentServiceLevel: getReportVal(row, "ship-service-level", "ship_service_level") || "",
                                                },
                                                currencyCode: getReportVal(row, "currency", "currency_code") || "INR",
                                                orderItems: [],
                                                totalQuantity: 0,
                                                totalAmount: 0,
                                            });
                                        }

                                        const orderObj = orderMap.get(orderId);

                                        orderObj.orderItems.push({
                                            orderItemId: getReportVal(row, "order-item-id", "order_item_id") || `${orderId}-${orderObj.orderItems.length + 1}`,
                                            quantityOrdered: itemQty,
                                            product: {
                                                asin,
                                                sellerSku: sku,
                                                title: productName,
                                                price: itemPrice,
                                            },
                                            proceeds: {
                                                breakdowns: [
                                                    ...(itemTax > 0 ? [{ subTotalAmount: itemTax, subTotalType: "Tax" }] : []),
                                                    ...(shippingPrice > 0 ? [{ subTotalAmount: shippingPrice, subTotalType: "Shipping" }] : []),
                                                    ...(shippingTax > 0 ? [{ subTotalAmount: shippingTax, subTotalType: "ShippingTax" }] : []),
                                                    ...(promotionDiscount > 0 ? [{ subTotalAmount: promotionDiscount, subTotalType: "PromotionDiscount" }] : []),
                                                ],
                                                proceedsTotal: itemPrice,
                                            }
                                        });

                                        orderObj.totalQuantity += itemQty;
                                        orderObj.totalAmount += itemPrice;

                                        simpleOrderBulkOps.push({
                                            updateOne: {
                                                filter: { configId, profileId: Number(profileId), amazonOrderId: orderId },
                                                update: {
                                                    $set: {
                                                        configId,
                                                        profileId: Number(profileId),
                                                        marketplaceId: getAccount.marketplaceStringId,
                                                        amazonOrderId: orderId,
                                                        purchaseDate: purchaseDateRaw ? new Date(purchaseDateRaw) : null,
                                                        orderStatus: normalizedStatus,
                                                        fulfillmentChannel: fulfilledBy,
                                                        productName,
                                                        asin,
                                                        sellerSKU: sku,
                                                        quantity: itemQty,
                                                        itemPrice,
                                                        deliveryDate: updatedDateRaw || ""
                                                    }
                                                },
                                                upsert: true
                                            }
                                        });
                                    }

                                    const detailBulkOps = [];
                                    for (const orderObj of orderMap.values()) {
                                        orderObj.proceeds = {
                                            breakdowns: orderObj.orderItems.flatMap(i => i.proceeds?.breakdowns || []),
                                            proceedsTotal: orderObj.totalAmount
                                        };

                                        detailBulkOps.push({
                                            updateOne: {
                                                filter: {
                                                    configId,
                                                    profileId: Number(profileId),
                                                    orderId: orderObj.orderId
                                                },
                                                update: { $set: orderObj },
                                                upsert: true
                                            }
                                        });
                                    }

                                    if (detailBulkOps.length > 0) {
                                        const detailCount = detailBulkOps.length;
                                        await parallelBulkWrite(orderDetailsModel, detailBulkOps);
                                        write_logs({
                                            message: `Upserted ${detailCount} orders into orderDetails from report for profile ${profileId}`,
                                            log_type: "info",
                                        });
                                    }

                                    if (simpleOrderBulkOps.length > 0) {
                                        await parallelBulkWrite(orderSchema, simpleOrderBulkOps);
                                    }

                                    const todayUpdatedOrderId = Array.from(orderMap.keys());
                                    const orderLists = await orderSchema.find({
                                        configId: configId,
                                        profileId: Number(profileId),
                                        marketplaceId: getAccount.marketplaceStringId,
                                        amazonOrderId: { $in: todayUpdatedOrderId }
                                    }).lean();
                                    orderLists.map(async (item) => {
                                        if (moment(item.createdAt).format("YYYY-MM-DD") == moment(new Date()).format("YYYY-MM-DD")) {
                                            const prod = await productListingSchema.findOne({ sku: item.sellerSKU }).lean();
                                            if (prod && prod.notifyMeOnOrder) {
                                                await adNotificationSchema?.create({
                                                    configId,
                                                    profileId: item.profileId,
                                                    notificationTitle: "New Order Received!",
                                                    notificationText: `A product <span data-link="/product-list?search=${Buffer.from(String(prod?.asin)).toString("base64")}" class="text-blue text-decoration-underline"><b>${prod?.itemName},</b></span> from your ad campaign has been purchased. Keep tracking performance and ensure inventory availability.`,
                                                    searchable: prod.sku
                                                })
                                                await sendNotificationToUser(profileId, "New Order Received!", `A product ${prod?.itemName}, from your ad campaign has been purchased. Keep tracking performance and ensure inventory availability.`)
                                            }
                                        }
                                    });
                                } else {
                                    console.log("No orders to process");
                                }

                                await reportsSchema.findByIdAndUpdate(
                                    { _id: getReportData._id },
                                    { status: "COMPLETED" },
                                    { new: true }
                                );
                                resolve("COMPLETED");
                            }
                            else {
                                write_logs({
                                    message: `Config ID: ${configId} ProfileID: ${profileId} SP report err: ${JSON.stringify(documentResponse.data)}`,
                                    log_type: "error",
                                });
                                resolve("ERROR");
                            }
                        }
                        else {
                            const pStatus = response.data?.processingStatus;
                            if (["CANCELLED", "FATAL", "CANCELLED_BY_SYSTEM"].includes(pStatus)) {
                                await reportsSchema.findByIdAndUpdate(
                                    { _id: getReportData._id },
                                    { status: "FAILED" }
                                );
                                write_logs({
                                    message: `Config ID: ${configId} ProfileID: ${profileId} SP report failed: ${JSON.stringify(response.data)}`,
                                    log_type: "error",
                                });
                                resolve("FAILED");
                            } else {
                                resolve(pStatus || "PENDING");
                            }
                        }
                    }
                    else {
                        write_logs({
                            message: `Config ID: ${configId} ProfileID: ${profileId} SP report err: ${JSON.stringify(response.data)}`,
                            log_type: "error",
                        });
                        resolve("ERROR");
                    }
                }
            }
            resolve("ERROR");
        }
        catch (error) {
            write_logs({
                message: `Config ID: ${configId} ProfileID: ${profileId} SP report err: ${error}`,
                log_type: "error",
            });
            resolve("ERROR");
        }
    });
}

exports.cronGenerateRefundReport = async (customStartDate = null, customEndDate = null) => {

    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronGenerateRefundReport`,
        log_type: "info",
    });

    try {
        let pastSyncObj = null;
        let startDateParam = null;
        let endDateParam = null;
        let cronjobid = null;
        let recurring = true;

        if (customStartDate && typeof customStartDate === "object") {
            pastSyncObj = customStartDate;
            cronjobid = pastSyncObj.cronjobid;
            startDateParam = pastSyncObj.startDate;
            endDateParam = pastSyncObj.endDate;
            recurring = pastSyncObj.recurring;
        } else {
            startDateParam = customStartDate;
            endDateParam = customEndDate;
        }

        const targetProfileId = pastSyncObj?.profileId;
        const targetConfigId = pastSyncObj?.configId;
        let profiles = await getActivePlanProfiles(targetProfileId, "sp", targetConfigId);

        const allowedProfiles = await getAllowedSyncProfiles("ORDERS_AND_FINANCE", "seller", recurring);
        profiles = profiles.filter((profile) =>
            allowedProfiles.some(item => item.profileId === Number(profile.profileId) && item.configId === String(profile.configId))
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
                message: `Cron Refund Report stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const promises = profiles.map((profile) =>
            limit(async () => {
                try {
                    if (global.updateTaskProgress) global.updateTaskProgress("Refund Report");
                    const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);

                    if (!checkSPConfig) {
                        return cron_logs({
                            message: `Account disconnected ${profile.configId}`,
                            log_type: "info",
                        });
                    }

                    const now = moment().tz(profile.timezone);
                    const currentDate = now.format("YYYY-MM-DD");
                    let getCronData;
                    if (recurring) {
                        getCronData = await cronJobHistorySchema.findOneAndUpdate(
                            {
                                configId: profile.configId,
                                profileId: profile.profileId,
                                cronName: "Refund Report",
                                historyDate: currentDate
                            },
                            { $set: { status: "PENDING" } },
                            { upsert: true, new: true }
                        ).lean();
                    }

                    let startDate, endDate;
                    if (startDateParam && endDateParam) {
                        startDate = startDateParam;
                        endDate = endDateParam;
                    } else {
                        const defaultDates = getRuleDate(profile.timezone, "LAST_60_DAYS");
                        startDate = defaultDates.fromDate;
                        endDate = defaultDates.toDate;
                    }

                    const reportSpResponse = await generateReturnsSPReport(
                        profile,
                        startDate,
                        endDate,
                        checkSPConfig,
                        recurring
                    );

                    cron_logs({
                        message: `Refund Report MFN SP Response: ${reportSpResponse}`,
                        log_type: "info",
                    })

                    const reportFBASpResponse = await generateFBAReturnsSPReport(
                        profile,
                        startDate,
                        endDate,
                        checkSPConfig,
                        recurring
                    );

                    cron_logs({
                        message: `Refund Report FBA SP Response: ${reportFBASpResponse}`,
                        log_type: "info",
                    })

                    if (recurring && getCronData?._id && reportSpResponse == "COMPLETED" && reportFBASpResponse == "COMPLETED") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    }
                    else if (!recurring && cronjobid && reportSpResponse == "COMPLETED" && reportFBASpResponse == "COMPLETED") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: "COMPLETED" },
                            { new: true },
                        );
                    }
                } catch (profileErr) {
                    cron_logs({
                        message: `Error syncing refund report for profile ${profile?.profileId} (config: ${profile?.configId}): ${profileErr.stack || profileErr.message}`,
                        log_type: "error",
                    });
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "Refund reports generated successfully.",
            log_type: "info",
        });

    } catch (error) {

        return cron_logs({
            message: `Refund report err: ${error}`,
            log_type: "error",
        });
    }
};

async function generateReturnsSPReport(profile, startDate, endDate, token, recurring = true) {
    let existing = null;

    if (recurring) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            reportTypeId: "MFN_RETURNS",
            status: "PENDING",
            createdAt: { $gte: twentyFourHoursAgo },
        }).sort({ createdAt: -1 }).lean();
    }
    else {
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            startDate: startDate,
            endDate: endDate,
            reportTypeId: "MFN_RETURNS"
        }).lean();
        if (existing && existing.status == "COMPLETED") return "COMPLETED";
        if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING"].includes(existing?.status)) {
            existing = null;
        }
    }


    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();

    // ✅ CREATE REPORT
    if (!existing) {
        const createResp = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
            headers: {
                "x-amz-access-token": token?.spAccessToken,
                "Content-Type": "application/json",
            },
            data: {
                reportType: "GET_XML_RETURNS_DATA_BY_RETURN_DATE",
                marketplaceIds: [profile.marketplaceStringId],
                dataStartTime: `${startDate}T00:00:00Z`,
                dataEndTime: `${endDate}T23:59:59Z`,
            },
            meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
        }));

        await reportsSchema.create({
            profileId: profile.profileId,
            configId: profile.configId,
            reportId: createResp?.data?.reportId,
            startDate: startDate,
            endDate: endDate,
            reportTypeId: "MFN_RETURNS",
            status: "PENDING"
        });

        return "PENDING";
    }

    // ✅ CHECK STATUS
    const statusRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${existing.reportId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
    }));

    if (statusRes?.data?.processingStatus !== "DONE") {
        if (statusRes?.data?.processingStatus !== "CANCELLED") return statusRes?.data?.processingStatus;
        return "PENDING";
    }

    // ✅ GET DOCUMENT
    const docRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${statusRes.data.reportDocumentId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
    }));

    const xmlPath = path.resolve(__dirname, "../../uploads/returns", `${existing.reportId}.xml`);
    const jsonPath = xmlPath.replace(".xml", ".json");
    console.log("docRes.data.url", docRes.data.url)
    await downloadFile(docRes.data.url, xmlPath);
    await convertXMLToJSON(xmlPath, jsonPath);

    const check = validateReportFile(jsonPath);
    if (!check.isValid) {
        cron_logs({
            message: `[Refund Report MFN] Skipping profile ${profile.profileId} because report JSON is invalid: ${check.reason}`,
            log_type: "warn"
        });
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        return "FAILED";
    }

    await processReturnsReportStream(returnSchema, jsonPath, { profileId: profile.profileId, configId: profile.configId, currencyCode: profile?.currencyCode });

    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "COMPLETED" } });

    return "COMPLETED";
}

const processReturnsReportStream = async (schema, filePath, { profileId, configId, currencyCode }) => {
    const BULK_SIZE = Number(process.env.BATCH || 500);

    return new Promise((resolve, reject) => {

        const pipeline = chain([
            fs.createReadStream(filePath),
            parser(),
            pick({ filter: /AmazonEnvelope\.Message\.return_details/ }),
            data => Array.isArray(data) ? data : [data],
            streamArray()
        ]);

        let bulkOps = [];

        pipeline.on("data", async ({ value }) => {
            pipeline.pause();

            const item = value?.item_details || {};
            const label = value?.label_details || {};
            const safet = value?.safet_claim_details || {};

            bulkOps.push({
                updateOne: {
                    filter: {
                        configId,
                        profileId,
                        returnSource: "MFN",
                        orderId: value?.order_id,
                        orderItemId: item?.order_item_id,
                    },
                    update: {
                        $set: {
                            configId,
                            profileId,
                            currencyCode,

                            returnSource: "MFN",
                            reportType: "GET_XML_RETURNS_DATA_BY_RETURN_DATE",

                            orderId: value?.order_id || null,
                            orderDate: value?.order_date ? new Date(value.order_date) : null,
                            returnRequestDate: value?.return_request_date ? new Date(value.return_request_date) : null,
                            returnRequestStatus: value?.return_request_status || null,
                            aToZClaim: String(value?.a_to_z_claim).toLowerCase() === "true",
                            isPrime: ["y", "true"].includes(String(value?.is_prime).toLowerCase()),
                            itemName: item?.item_name || null,
                            asin: item?.asin || null,
                            merchantSku: item?.merchant_sku || null,
                            returnReasonCode: item?.return_reason_code || null,
                            inPolicy: ["y", "true"].includes(String(item?.in_policy).toLowerCase()),
                            returnQuantity: Number(item?.return_quantity || 0),
                            resolution: item?.resolution || null,
                            invoiceNumber: item?.invoice_number || null,
                            category: item?.category || null,
                            refundAmount: Number(item?.refund_amount || 0),
                            orderItemId: item?.order_item_id || null,

                            trackingId: label?.tracking_id || null,
                            returnCarrier: label?.return_carrier || null,
                            labelCost: Number(label?.label_cost || 0),
                            labelType: label?.label_type || null,

                            labelToBePaidBy: value?.label_to_be_paid_by || null,
                            returnDeliveryDate: value?.return_delivery_date ? new Date(value.return_delivery_date) : null,
                            returnType: value?.return_type || null,
                            orderAmount: Number(value?.order_amount || 0),
                            orderQuantity: Number(value?.order_quantity || 0),

                            safetActionReason: safet?.safet_action_reason || null,
                            safetClaimId: safet?.safet_claim_id || null,
                            safetClaimState: safet?.safet_claim_state || null,
                            safetClaimCreationTime: safet?.safet_claim_creation_time ? new Date(safet?.safet_claim_creation_time) : null,
                            safetClaimReimbursementAmount: Number(safet?.safet_claim_reimbursement_amount || 0)
                        }
                    },
                    upsert: true
                }
            });

            if (bulkOps.length >= BULK_SIZE) {
                await parallelBulkWrite(schema, bulkOps.splice(0));
            }

            pipeline.resume();
        });

        pipeline.on("end", async () => {
            if (bulkOps.length) {
                await parallelBulkWrite(schema, bulkOps);
            }
            resolve();
        });

        pipeline.on("error", reject);
    });
};

async function generateFBAReturnsSPReport(profile, startDate, endDate, token, recurring) {
    let existing = null;
    if (recurring) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            reportTypeId: "FBA_RETURNS",
            status: "PENDING",
            createdAt: { $gte: twentyFourHoursAgo },
        }).sort({ createdAt: -1 }).lean();
    }
    else {
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            startDate: startDate,
            endDate: endDate,
            reportTypeId: "FBA_RETURNS"
        }).lean();
        if (existing && existing.status == "COMPLETED") return "COMPLETED";
        if (existing && !["PENDING", "IN_PROGRESS", "PROCESSING"].includes(existing?.status)) {
            existing = null;
        }
    }


    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();

    // ✅ CREATE REPORT
    if (!existing) {
        const createResp = await retryWithBackoff(() => amazonAxios({
            method: "POST",
            url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports`,
            headers: {
                "x-amz-access-token": token?.spAccessToken,
                "Content-Type": "application/json",
            },
            data: {
                reportType: "GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA",
                marketplaceIds: [profile.marketplaceStringId],
                dataStartTime: `${startDate}T00:00:00Z`,
                dataEndTime: `${endDate}T23:59:59Z`,
            },
            meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
        }));

        await reportsSchema.create({
            profileId: profile.profileId,
            configId: profile.configId,
            reportId: createResp?.data?.reportId,
            startDate: startDate,
            endDate: endDate,
            reportTypeId: "FBA_RETURNS",
            status: "PENDING"
        });

        return "PENDING";
    }

    // ✅ CHECK STATUS
    const statusRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/reports/${existing.reportId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
    }));

    if (statusRes?.data?.processingStatus !== "DONE") {
        if (statusRes?.data?.processingStatus !== "CANCELLED") return statusRes?.data?.processingStatus;
        return "PENDING";
    }

    // ✅ GET DOCUMENT
    const docRes = await retryWithBackoff(() => amazonAxios({
        method: "GET",
        url: `${marketPlaceConfig.endPoint}/reports/2021-06-30/documents/${statusRes.data.reportDocumentId}`,
        headers: {
            "x-amz-access-token": token?.spAccessToken,
            "Content-Type": "application/json",
        },
        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
    }));

    const zipPath = path.resolve(__dirname, "../../uploads/returns", `${existing.reportId}.txt`);

    await downloadFile(docRes.data.url, zipPath);

    if (!fs.existsSync(zipPath)) {
        cron_logs({
            message: `[Refund Report FBA] Skipping profile ${profile.profileId} because TSV file does not exist.`,
            log_type: "warn"
        });
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        return "FAILED";
    }
    const stats = fs.statSync(zipPath);
    if (stats.size === 0) {
        cron_logs({
            message: `[Refund Report FBA] Skipping profile ${profile.profileId} because TSV file is empty (0 bytes).`,
            log_type: "warn"
        });
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        return "FAILED";
    }
    let fd = null;
    let isHtmlError = false;
    try {
        fd = fs.openSync(zipPath, "r");
        const buffer = Buffer.alloc(100);
        const bytesRead = fs.readSync(fd, buffer, 0, 100, 0);
        fs.closeSync(fd);
        fd = null;
        const sample = buffer.toString("utf8", 0, bytesRead).trim();
        if (sample.startsWith("<")) {
            isHtmlError = true;
            cron_logs({
                message: `[Refund Report FBA] Skipping profile ${profile.profileId} because file content appears to be HTML/XML instead of TSV: ${sample.slice(0, 30)}`,
                log_type: "warn"
            });
        }
    } catch (err) {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch (_) {}
        }
        cron_logs({
            message: `[Refund Report FBA] Skipping profile ${profile.profileId} because of read failure: ${err.message}`,
            log_type: "warn"
        });
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        return "FAILED";
    }

    if (isHtmlError) {
        await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "FAILED" } });
        return "FAILED";
    }

    await processFBAReturnsReportStream(returnSchema, zipPath, { profileId: profile.profileId, configId: profile.configId, currencyCode: profile?.currencyCode });

    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "COMPLETED" } });

    return "COMPLETED";
}

const processFBAReturnsReportStream = async (schema, filePath, { profileId, configId, currencyCode }) => {
    const BULK_SIZE = Number(process.env.BATCH || 500);

    return new Promise((resolve, reject) => {

        const pipeline = chain([fs.createReadStream(filePath), csv({ separator: "\t" })]);

        let bulkOps = [];

        pipeline.on("data", async (value) => {
            pipeline.pause();

            const orderPipeline = [
                { $match: { configId, profileId, amazonOrderId: value?.['order-id'] } },
                { $limit: 1 },
                {
                    $lookup: {
                        from: "productlistings",
                        let: { asin: "$asin", sku: "$sellerSKU" },
                        pipeline: [
                            { $match: { $expr: { $or: [{ $eq: ["$asin", "$$asin"] }, { $eq: ["$sku", "$$sku"] }] } } },
                            { $limit: 1 },
                        ],
                        as: "productData"
                    }
                },
                { $unwind: { path: "$productData", preserveNullAndEmptyArrays: true } },
            ]

            const order = await orderSchema?.aggregate(orderPipeline)?.then(res => res?.[0] ?? {})?.catch(() => ({})) ?? {};
            const multipleQuantity = Math.round(Number(order?.itemPrice || 0) / Number(order?.productData?.sellingPrice || 0));

            bulkOps.push({
                updateOne: {
                    filter: {
                        configId,
                        profileId,
                        returnSource: "FBA",
                        orderId: value?.['order-id'],
                        licensePlateNumber: value?.['license-plate-number'],
                    },
                    update: {
                        $set: {
                            configId,
                            profileId,
                            currencyCode,

                            returnSource: "FBA",
                            reportType: "GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA",

                            orderId: value?.['order-id'] || null,
                            orderDate: order?.purchaseDate ? new Date(order?.purchaseDate) : null,
                            returnRequestDate: value?.['return-date'] ? new Date(value?.['return-date']) : null,
                            returnRequestStatus: "Approved",
                            itemName: value?.['product-name'] || null,
                            asin: value?.['asin'] || null,
                            merchantSku: value?.['sku'] || null,
                            fnsku: value?.['fnsku'] || null,
                            returnReasonCode: value?.["reason"] || null,
                            returnQuantity: Number(value?.['quantity'] || 0),
                            refundAmount: Number(order?.itemPrice / multipleQuantity || 0),

                            returnDeliveryDate: value?.['return-date'] ? new Date(value?.['return-date']) : null,
                            returnType: value?.["reason"] || null,
                            orderAmount: Number(order?.itemPrice / multipleQuantity || 0),
                            orderQuantity: Number(value?.['quantity'] || 0),

                            fulfillmentCenterId: value?.["fulfillment-center-id"],
                            detailedDisposition: value?.["detailed-disposition"],
                            customerComments: value?.["customer-comments"]
                        }
                    },
                    upsert: true
                }
            });

            if (bulkOps.length >= BULK_SIZE) {
                await parallelBulkWrite(schema, bulkOps.splice(0));
            }

            pipeline.resume();
        });

        pipeline.on("end", async () => {
            if (bulkOps.length) {
                await parallelBulkWrite(schema, bulkOps);
            }
            resolve();
        });

        pipeline.on("error", reject);
    });
};

exports.refundGraphData = async (req, res) => {
    try {
        let {
            profileId,

            search,

            returnSource = [],
            returnType = [],
            returnReasonCode = [],
            returnRequestStatus = [],
            isPrime,
            inPolicy,

            orderDateFrom,
            orderDateTo,
            returnRequestDateFrom,
            returnRequestDateTo,
            returnDeliveryDateFrom,
            returnDeliveryDateTo,
        } = req.body;
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
        if (!profileId || !profile) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required." });
        }

        let matchQuery = {
            profileId: Number(profileId),
            configId: profile.configId,
            returnReasonCode: { $ne: null },
        };

        // SEARCH
        if (search) {
            matchQuery.$or = [
                { itemName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { orderId: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { asin: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { merchantSku: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { returnType: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }
            ];
        }

        // DROPDOWN FILTERS
        if (returnType && returnType?.length > 0) matchQuery.returnType = { $in: returnType };
        if (returnReasonCode && returnReasonCode?.length > 0) matchQuery.returnReasonCode = { $in: returnReasonCode };
        if (returnRequestStatus && returnRequestStatus?.length > 0) matchQuery.returnRequestStatus = { $in: returnRequestStatus };
        if (returnSource && returnSource?.length > 0) matchQuery.returnSource = { $in: returnSource };

        // BOOLEAN FILTERS
        if (typeof isPrime === "boolean") matchQuery.isPrime = isPrime;
        if (typeof inPolicy === "boolean") matchQuery.inPolicy = inPolicy;

        // ORDER DATE FILTER
        if (orderDateFrom || orderDateTo) {
            matchQuery.orderDate = { ...(orderDateFrom && { $gte: new Date(orderDateFrom) }), ...(orderDateTo && { $lte: new Date(orderDateTo) }) };
        }

        // RETURN REQUEST DATE FILTER
        if (returnRequestDateFrom || returnRequestDateTo) {
            matchQuery.returnRequestDate = { ...(returnRequestDateFrom && { $gte: new Date(returnRequestDateFrom) }), ...(returnRequestDateTo && { $lte: new Date(returnRequestDateTo) }) };
        }

        // RETURN DELIVERY DATE FILTER
        if (returnDeliveryDateFrom || returnDeliveryDateTo) {
            matchQuery.returnDeliveryDate = { ...(returnDeliveryDateFrom && { $gte: new Date(returnDeliveryDateFrom) }), ...(returnDeliveryDateTo && { $lte: new Date(returnDeliveryDateTo) }) };
        }

        // =========================================================
        // TOP 10 RETURN REASONS
        // =========================================================

        const topReasonsPipeline = [
            { $match: matchQuery },
            {
                $lookup: {
                    from: "orders",
                    localField: "orderId",
                    foreignField: "amazonOrderId",
                    as: "orderData"
                }
            },
            { $addFields: { orderAmountTotalFromAmazon: { $sum: "$orderData.itemPrice" } } },
            {
                $addFields: {
                    orderAmountTotal: {
                        $cond: {
                            if: { $gt: ["$orderAmount", 0] },
                            then: "$orderAmount",
                            else: { $cond: { if: { $gt: ["$orderAmountTotalFromAmazon", 0] }, then: "$orderAmountTotalFromAmazon", else: 0 } }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$returnReasonCode",
                    returnCount: { $sum: 1 },
                    refundAmount: { $sum: "$refundAmount" },
                    totalOrderAmount: { $sum: "$orderAmountTotal" }
                }
            },
            {
                $project: {
                    _id: 0,
                    returnReason: "$_id",
                    returnCount: 1,
                    refundAmount: { $round: ["$refundAmount", 2] },
                    totalOrderAmount: { $round: ["$totalOrderAmount", 2] },
                }
            },
            { $sort: { returnCount: -1 } },
            // { $limit: 10 }
        ];

        let topReturnReasons = await returnSchema.aggregate(topReasonsPipeline);
        topReturnReasons = topReturnReasons.map((item) => ({ ...item, returnReason: RETURN_REASON_LABELS[item?.returnReason] || item?.returnReason }));

        // =========================================================
        // TOP 10 ASIN RETURNS
        // =========================================================

        const topASINsPipeline = [
            { $match: matchQuery },
            {
                $lookup: {
                    from: "orders",
                    localField: "orderId",
                    foreignField: "amazonOrderId",
                    as: "orderData"
                }
            },
            { $addFields: { orderAmountTotalFromAmazon: { $sum: "$orderData.itemPrice" } } },
            {
                $addFields: {
                    orderAmountTotal: {
                        $cond: {
                            if: { $gt: ["$orderAmount", 0] },
                            then: "$orderAmount",
                            else: { $cond: { if: { $gt: ["$orderAmountTotalFromAmazon", 0] }, then: "$orderAmountTotalFromAmazon", else: 0 } }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$asin",
                    productName: { $first: "$itemName" },
                    returnCount: { $sum: 1 },
                    refundAmount: { $sum: "$refundAmount" },
                    totalOrderAmount: { $sum: "$orderAmountTotal" }
                }
            },
            {
                $project: {
                    _id: 0,
                    asin: "$_id",
                    productName: 1,
                    returnCount: 1,
                    refundAmount: { $round: ["$refundAmount", 2] },
                    totalOrderAmount: { $round: ["$totalOrderAmount", 2] }
                }
            },
            { $sort: { returnCount: -1 } },
            // { $limit: 10 }
        ];

        const topAsinReturns = await returnSchema.aggregate(topASINsPipeline);

        return res.status(200).send({
            isSuccess: true,
            data: { topReturnReasons, topAsinReturns }
        });
    } catch (error) {
        write_logs({ message: `[refundGraphData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred"
        });
    }
};

exports.getRefundFilterDropdowns = async (req, res) => {
    try {
        const { profileId } = req.body;
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];

        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
        if (!profileId || !profile) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required." });
        }

        const matchQuery = {
            profileId: Number(profileId),
            configId: profile.configId,
            returnReasonCode: { $ne: null }
        };

        const returnReasonCodePipeline = [
            { $match: { ...matchQuery, returnReasonCode: { $nin: [null, ""] } } },
            { $group: { _id: "$returnReasonCode" } },
            { $project: { _id: 0, label: "$_id", value: "$_id" } },
            { $sort: { label: 1 } }
        ]

        const returnTypePipeline = [
            { $match: { ...matchQuery, returnType: { $nin: [null, ""] } } },
            { $group: { _id: "$returnType" } },
            { $project: { _id: 0, label: "$_id", value: "$_id" } },
            { $sort: { label: 1 } }
        ]

        const returnStatusPipeline = [
            { $match: { ...matchQuery, returnRequestStatus: { $nin: [null, ""] } } },
            { $group: { _id: "$returnRequestStatus" } },
            { $project: { _id: 0, label: "$_id", value: "$_id" } },
            { $sort: { label: 1 } }
        ]

        const returnSourcePipeline = [
            { $match: { ...matchQuery, returnSource: { $nin: [null, ""] } } },
            { $group: { _id: "$returnSource" } },
            { $project: { _id: 0, label: "$_id", value: "$_id" } },
            { $sort: { label: 1 } }
        ]

        let returnReasonCodes = await returnSchema.aggregate(returnReasonCodePipeline);
        let returnTypes = await returnSchema.aggregate(returnTypePipeline);
        let returnStatuses = await returnSchema.aggregate(returnStatusPipeline);
        let returnSources = await returnSchema.aggregate(returnSourcePipeline);

        returnReasonCodes = returnReasonCodes.map((item) => ({ ...item, label: RETURN_REASON_LABELS[item?.label] || item?.label }));
        returnTypes = returnTypes.map((item) => ({ ...item, label: RETURN_TYPE_LABELS[item?.label] || item?.label }));
        returnStatuses = returnStatuses.map((item) => ({ ...item, label: RETURN_STATUS_LABELS[item?.label] || item?.label }));
        returnSources = returnSources.map((item) => ({ ...item, label: RETURN_SOURCE_LABELS[item?.label] || item?.label }));

        return res.status(200).send({
            isSuccess: true,
            data: { returnReasonCodes, returnTypes, returnStatuses, returnSources }
        });

    } catch (error) {
        write_logs({ message: `[getRefundFilterDropdowns Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred"
        });
    }
};

exports.refundGridData = async (req, res) => {
    try {

        let {
            profileId,

            search,

            returnSource = [],
            returnType = [],
            returnReasonCode = [],
            returnRequestStatus = [],
            isPrime,
            inPolicy,

            orderDateFrom,
            orderDateTo,
            returnRequestDateFrom,
            returnRequestDateTo,
            returnDeliveryDateFrom,
            returnDeliveryDateTo,

            pageNo = 1,
            perPage = 10,
            fieldName = "returnRequestDate",
            sortType = -1
        } = req.body;
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];

        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
        if (!profileId || !profile) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required." });
        }

        let matchQuery = {
            configId: profile?.configId,
            profileId: Number(profileId),
            returnReasonCode: { $ne: null },
        };

        // SEARCH
        if (search) {
            matchQuery.$or = [
                { itemName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { orderId: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { asin: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { merchantSku: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { returnType: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }
            ];
        }

        // DROPDOWN FILTERS
        if (returnType && returnType?.length > 0) matchQuery.returnType = { $in: returnType };
        if (returnReasonCode && returnReasonCode?.length > 0) matchQuery.returnReasonCode = { $in: returnReasonCode };
        if (returnRequestStatus && returnRequestStatus?.length > 0) matchQuery.returnRequestStatus = { $in: returnRequestStatus };
        if (returnSource && returnSource?.length > 0) matchQuery.returnSource = { $in: returnSource };

        // BOOLEAN FILTERS
        if (typeof isPrime === "boolean") matchQuery.isPrime = isPrime;
        if (typeof inPolicy === "boolean") matchQuery.inPolicy = inPolicy;

        // ORDER DATE FILTER
        if (orderDateFrom || orderDateTo) {
            matchQuery.orderDate = { ...(orderDateFrom && { $gte: new Date(orderDateFrom) }), ...(orderDateTo && { $lte: new Date(orderDateTo) }) };
        }

        // RETURN REQUEST DATE FILTER
        if (returnRequestDateFrom || returnRequestDateTo) {
            matchQuery.returnRequestDate = { ...(returnRequestDateFrom && { $gte: new Date(returnRequestDateFrom) }), ...(returnRequestDateTo && { $lte: new Date(returnRequestDateTo) }) };
        }

        // RETURN DELIVERY DATE FILTER
        if (returnDeliveryDateFrom || returnDeliveryDateTo) {
            matchQuery.returnDeliveryDate = { ...(returnDeliveryDateFrom && { $gte: new Date(returnDeliveryDateFrom) }), ...(returnDeliveryDateTo && { $lte: new Date(returnDeliveryDateTo) }) };
        }

        // PAGINATION
        pageNo = Number(pageNo) || 1;
        perPage = Number(perPage) || 10;
        const skip = (pageNo - 1) * perPage;

        // SORTING
        const sortQuery = { [fieldName]: Number(sortType) };

        // AGGREGATION PIPELINE
        const pipeline = [
            { $match: matchQuery },
            {
                $lookup: {
                    from: "orders",
                    localField: "orderId",
                    foreignField: "amazonOrderId",
                    as: "orderData"
                }
            },
            { $addFields: { orderAmountFromAmazon: { $round: [{ $sum: "$orderData.itemPrice" }, 2] } } },
            {
                $lookup: {
                    from: "productlistings",
                    let: { sku: "$merchantSku", asin: "$asin" },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$sku", "$$sku"] }, { $eq: ["$asin", "$$asin"] }] } } },
                        { $project: { imageURL: 1 } }
                    ],
                    as: "productData"
                }
            },
            { $addFields: { productImage: { $arrayElemAt: ["$productData.imageURL", 0] } } },
            {
                $project: {
                    _id: 1,
                    productImage: 1,
                    productName: "$itemName",
                    asin: 1,
                    sku: "$merchantSku",

                    returnSource: 1,
                    returnReasonCode: 1,
                    returnType: 1,
                    returnRequestStatus: 1,

                    inPolicy: 1,
                    isPrime: 1,

                    orderId: 1,
                    orderDate: 1,

                    returnRequestDate: 1,
                    returnDeliveryDate: 1,

                    orderQuantity: "$returnQuantity",
                    orderAmount: {
                        $cond: {
                            if: { $gt: ["$orderAmount", 0] },
                            then: "$orderAmount",
                            else: { $cond: { if: { $gt: ["$orderAmountFromAmazon", 0] }, then: "$orderAmountFromAmazon", else: 0 } }
                        }
                    },

                    returnQuantity: 1,
                    refundAmount: { $round: ["$refundAmount", 2] },
                }
            },
            { $sort: sortQuery },
            { $facet: { totalCount: [{ $count: "count" }], data: [{ $skip: skip }, { $limit: perPage }] } }
        ];

        const result = await returnSchema.aggregate(pipeline);
        const data = result?.[0]?.data || [];
        const totalRecords = result?.[0]?.totalCount?.[0]?.count || 0;

        return res.status(200).send({
            isSuccess: true,
            data,
            perPage,
            totalRecords,
            currentPageNo: pageNo,
            totalPages: Math.ceil(totalRecords / perPage),
        });
    } catch (error) {
        write_logs({ message: `[refundGridData Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
            error: "An internal server error occurred"
        });
    }
};

exports.SyncProductListing = async (pastSyncObj) => {
    cron_logs({
        message: `India Time = ${moment()
            .tz("Asia/Kolkata")
            .format("HH:mm")} SyncProductListing`,
        log_type: "info",
    });
    try {
        let recurring = true;
        let profileId = null;
        let configId = null;
        let cronjobid = null;
        let targetConfigId = null;

        if (pastSyncObj && typeof pastSyncObj === "object") {
            recurring = pastSyncObj.recurring;
            profileId = pastSyncObj.profileId;
            configId = pastSyncObj.configId;
            cronjobid = pastSyncObj.cronjobid;
            targetConfigId = pastSyncObj.configId;
        }

        const getCronStatus = await cronJobSchema.findOne({
            cronName: "Products Listing",
            isActive: false,
        }).lean();
        if (getCronStatus) {
            return cron_logs({
                message: `Your Products Listing status is deactive.`,
                log_type: "info",
            });
        }

        const allowedProfiles = await getAllowedSyncProfiles("PRODUCT_ADS", "seller", recurring);
        const getProfileId = (await profileSchema.find({ isActive: true, isSpSyncEnabled: true, ...(profileId && { profileId }), ...(configId && { configId }) }).lean())
            .filter((profile) =>
                allowedProfiles.some(item => item.profileId === Number(profile.profileId) && item.configId === String(profile.configId))
            );

        if (!getProfileId || getProfileId.length === 0) {
            if (cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "FAILED" },
                    { new: true }
                );
            }
            return cron_logs({
                message: `Cron Products Listing stopped: No active profiles found with matching permissions for configId: ${configId || 'any'}, profileId: ${profileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const listPromises = getProfileId.map((profile) => limit(async () => {
            if (global.updateTaskProgress) global.updateTaskProgress("Products Listing");
            const checkConfigSP = await getSPAccessToken(profile.configId, profile.profileId);
            if (
                checkConfigSP &&
                checkConfigSP.spAccessToken
            ) {

                const currentDate = moment
                    .tz(profile.timezone)
                    .format("YYYY-MM-DD");

                const mp = await marketPlaceConfigSchema.findOne({ countryCode: profile.countryCode }).lean();
                if (mp) {

                    let nextToken = '';
                    let count = 0;
                    do {
                        count++;

                        let url = `${mp.endPoint}/listings/2021-08-01/items/${checkConfigSP.sellerId}?marketplaceIds=${mp.marketPlaceId}&includedData=summaries,offers,issues,attributes`;
                        if (nextToken) {
                            url += `&pageToken=${encodeURIComponent(nextToken)}`;
                        }

                        let config = {
                            method: 'GET',
                            url: url,
                            headers: {
                                'x-amz-access-token': checkConfigSP.spAccessToken
                            },
                            meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
                        };

                        const response = await retryWithBackoff(() => amazonAxios(config));
                        const productList = response?.data?.items;
                        nextToken = response?.data?.pagination.nextToken || null;

                        const bulkOps = await Promise.all(
                            productList
                                .filter(prod => prod?.summaries?.[0]?.itemName)
                                .map(async (prod) => {

                                    if (prod.summaries?.[0].asin == "B0FYP144X5") {
                                        cron_logs({
                                            message: `B0FYP144X5 Found: ${prod}`,
                                            log_type: "info",
                                        })
                                    }

                                    const updateDoc = {
                                        configId: profile.configId,
                                        profileId: profile.profileId,
                                        marketplaceId: mp?.marketPlaceConfigId?.marketPlaceId ?? mp?.marketPlaceId,
                                        asin: prod.summaries?.[0].asin,
                                        sku: prod.sku,
                                        itemName: prod.summaries?.[0].itemName,
                                        productType: prod.summaries?.[0].productType,
                                        imageURL: prod.summaries?.[0].mainImage?.link,
                                        status: prod.summaries?.[0].status,
                                        productCreatedDate: prod.summaries?.[0].createdDate,
                                        productUpdatedDate: prod.summaries?.[0].lastUpdatedDate,
                                        fbmQuantity: prod.attributes.fulfillment_availability?.[0]?.quantity,
                                        currency: prod?.attributes?.purchasable_offer?.[0]?.currency,
                                        sellingPrice: prod?.attributes?.purchasable_offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax,
                                        maximumRetailPrice: prod?.attributes?.purchasable_offer?.[0]?.maximum_retail_price?.[0]?.schedule?.[0]?.value_with_tax,
                                    };

                                    return {
                                        updateOne: {
                                            filter: {
                                                configId: profile.configId,
                                                profileId: profile.profileId,
                                                asin: prod.summaries?.[0].asin,
                                                sku: prod.sku
                                            },
                                            update: { $set: updateDoc },
                                            upsert: true
                                        }
                                    };
                                })
                        );

                        if (bulkOps.length > 0) {
                            const result = await productListingSchema.bulkWrite(bulkOps);
                            cron_logs({
                                message: `Products Listing: Page ${count}, Upserted ${result.upsertedCount + result.modifiedCount} records`,
                                log_type: "info",
                            })
                        }
                        else {
                            cron_logs({
                                message: `Products Listing: Page ${count}, No products to process`,
                                log_type: "info",
                            })
                        }
                        await wait(5000);

                    } while (nextToken != "" && nextToken != null);

                    if (cronjobid) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    } else {
                        const createCronHistory = new cronJobHistorySchema({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Products Listing",
                            status: "COMPLETED",
                            historyDate: currentDate,
                        });
                        await createCronHistory.save();
                    }
                }

            }
        }));
        await Promise.all(listPromises);
        return cron_logs({
            message: "Product listed successfully.",
            log_type: "info",
        });

    } catch (error) {
        const errorData = error?.response?.data ? JSON.stringify(error.response.data) : "";
        return cron_logs({
            message: `Something went wrong. Error: ${error}. Details: ${errorData}`,
            log_type: "error",
        });
    }
}

exports.createProduct = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId } = req?.body
        const BASE_URL = `${process?.env?.BASE_URL}/public/productImages/`;

        // Extract and parse fields (arrays/objects will be stringified)
        const parsedData = {
            sku: req.body.sku,
            productType: req.body.productType,
            brand: req.body.brand,
            manufacturer: req.body.manufacturer,
            partNumber: req.body.partNumber,
            modelNumber: req.body.modelNumber,

            // Parse array fields
            bulletPoints: req.body.bulletPoints ? safeJsonParse(req.body.bulletPoints) : [],
            genericKeywords: req.body.genericKeywords ? safeJsonParse(req.body.genericKeywords) : [],
            colors: req.body.colors ? safeJsonParse(req.body.colors) : [],
            material: req.body.material ? safeJsonParse(req.body.material) : [],
            ingredients: req.body.ingredients ? safeJsonParse(req.body.ingredients) : [],
            countryOfOrigin: req.body.countryOfOrigin,

            // Keywords
            titleKeywords: req.body.titleKeywords ? safeJsonParse(req.body.titleKeywords) : [],
            bulletKeywords: req.body.bulletKeywords ? safeJsonParse(req.body.bulletKeywords) : [],
            backendKeywords: req.body.backendKeywords ? safeJsonParse(req.body.backendKeywords) : [],
            forbiddenKeywords: req.body.forbiddenKeywords ? safeJsonParse(req.body.forbiddenKeywords) : [],

            // Images
            // ✅ Full image paths
            mainProductImage: req.files?.mainProductImage?.[0]
                ? `${BASE_URL}${Date.now()}_${req.files.mainProductImage[0].filename}`
                : null,

            additionalImages: req.files?.additionalImages
                ? req.files.additionalImages.map(f => `${BASE_URL}${Date.now()}_${f.filename}`)
                : [],

            // Offer Details
            listPrices: req.body.listPrices ? safeJsonParse(req.body.listPrices) : [],
            listCurrencies: req.body.listCurrencies ? safeJsonParse(req.body.listCurrencies) : [],
            size: req.body.size ? safeJsonParse(req.body.size) : [],
            quantities: req.body.quantities ? safeJsonParse(req.body.quantities) : [],
            conditionType: req.body.conditionType,
            fulfillment: req.body.fulfillment,

            // Dimensions
            heightBaseToTop: req.body.heightBaseToTop ? safeJsonParse(req.body.heightBaseToTop) : [],
            longerHorizontalEdge: req.body.longerHorizontalEdge ? safeJsonParse(req.body.longerHorizontalEdge) : [],
            shorterHorizontalEdge: req.body.shorterHorizontalEdge ? safeJsonParse(req.body.shorterHorizontalEdge) : [],
            packageHeight: req.body.packageHeight ? safeJsonParse(req.body.packageHeight) : [],
            packageLength: req.body.packageLength ? safeJsonParse(req.body.packageLength) : [],
            packageWidth: req.body.packageWidth ? safeJsonParse(req.body.packageWidth) : [],
        };

        const allImageUrlsForGPT = []
            .concat(parsedData.mainProductImage ? [parsedData.mainProductImage] : [])
            .concat(parsedData.additionalImages?.length ? parsedData.additionalImages : []);

        const generated = await generateListingWithGPT({
            imageUrls: allImageUrlsForGPT, locale: "en-IN", ...parsedData,
        });

        const getAccount = await getProfile(configId, profileId);
        const checkConfigSP = await getSPAccessToken(configId, profileId);

        const marketPlace = await marketPlaceConfigSchema.findOne({ countryCode: getAccount.countryCode }).lean();

        const marketplaceId = getAccount?.marketplaceStringId;
        const listingBodyPayload = buildListingBodyPayload({
            payload: parsedData,
            generated: generated?.parsedContent ?? {},
            mainImage: parsedData?.mainProductImage,
            otherImages: parsedData?.additionalImages,
            marketplaceId
        });

        try {
            const url = `${marketPlace?.marketPlaceConfigId?.endPoint}/listings/2021-08-01/items/${checkConfigSP?.sellerId}/${parsedData?.sku}?includedData=issues&marketplaceIds=${marketplaceId}`
            const response = await amazonAxios({
                method: "PUT",
                url,
                data: listingBodyPayload,
                meta: { configId: checkConfigSP?.configId, profileId: profile?.profileId, sp: true }
            });

            if (response.status === 200) {
                return res.status(response.status).json({
                    isSuccess: true,
                    message: "Listing created successfully",
                    data: response.data
                });
            } else {
                return res.status(response.status).json({
                    isSuccess: false,
                    message: "Amazon API returned an error",
                    data: response.data
                });
            }
        } catch (error) {
            write_logs({ message: `[createProduct Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
            return res.status(203).json({
                isSuccess: false,
                message: "Internal Server Error!",
                error: error.response?.data || error.message
            });
        }
    } catch (error) {
        write_logs({ message: `[createProduct Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).json({
            message: "Failed to create product",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.fileUpload = async (req, res) => {
    try {
        const BASE_URL = `${process?.env?.BASE_URL}/public/productImages/`;
        const image = req.files?.image?.[0] ? `${BASE_URL}${req.files.image[0].filename}` : null

        return res.status(200).json({
            isSuccess: true,
            message: "File Uploaded Successfully.",
            data: { image }
        });
    } catch (error) {
        write_logs({ message: `[fileUpload Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).json({
            message: "Failed to File Uploaded",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.generateProduct = async (req, res) => {
    write_logs({
        message: `call generateProduct, Request Body: ${req?.body}`,
        log_type: "info",
    })
    try {
        const body = req.body;
        const generated = await generateListingWithGPT({ ...body });

        write_logs({
            message: `GenerateProduct: Get GPT Response: ${JSON.stringify(generated)}`,
            log_type: "info",
        })

        return res.status(200).json({
            isSuccess: true,
            message: "Listing generated successfully",
            data: { finalData: body, generated }
        });
    } catch (error) {

        write_logs({
            message: `GenerateProduct: Error: ${error}`,
            log_type: "error",
        })

        return res.status(203).json({
            message: "Failed to create product",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.AddProduct = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, finalData: payload, generated, marketplace_id, language_tag } = req?.body
        const sku = payload?.sku?.[0]?.value

        write_logs({
            message: `AddProduct: Request: ${req?.body}`,
            log_type: "info",
        })

        const getAccount = await getProfile(configId, profileId);
        const checkConfigSP = await getSPAccessToken(configId, profileId);

        const marketPlace = await marketPlaceConfigSchema.findOne({ countryCode: getAccount.countryCode }).lean();
        const marketplaceId = marketPlace?.marketPlaceId

        const listingBodyPayload = buildListingDynamicBodyPayload({ sku, payload, generated: generated?.parsedContent ?? {}, marketplace_id, language_tag });

        write_logs({
            message: `AddProduct: Listing Payload: ${listingBodyPayload}`,
            log_type: "info",
        })

        try {
            const url = `${marketPlace?.endPoint}/listings/2021-08-01/items/${checkConfigSP?.sellerId}/${sku}?includedData=issues&marketplaceIds=${marketplaceId}`
            write_logs({
                message: `AddProduct: URL: ${url}: ${listingBodyPayload}`,
                log_type: "info",
            })
            const response = await amazonAxios({
                method: "PUT",
                url,
                data: listingBodyPayload,
                meta: { configId: checkConfigSP?.configId, profileId: profile?.profileId, sp: true }
            });

            write_logs({
                message: `AddProduct: Response: ${response}`,
                log_type: "info",
            })
            if (response.status === 200) {
                await logAudit("PRODUCT_CREATION", `Product ${sku} created successfully.`, { itemName: payload?.itemName?.[0]?.value, sku: sku, marketplace_id: marketplaceId }, req?.user?.id);
                return res.status(response.status).json({
                    isSuccess: true,
                    message: "Listing created successfully",
                    data: response.data
                });
            } else {
                return res.status(response.status).json({
                    isSuccess: false,
                    message: "Amazon API returned an error",
                    data: response.data
                });
            }
        } catch (error) {
            const response = {
                isSuccess: false,
                message: "Internal Server Error!",
                error: error.response?.data || error.message
            }
            write_logs({
                message: `AddProduct: Response: ${response}`,
                log_type: "info",
            })
            return res.status(203).json(response);
        }
    } catch (error) {
        const response = {
            message: "Failed to create product",
            isSuccess: false,
            error: "An internal server error occurred",
        }
        write_logs({
            message: `AddProduct: Response: ${response}`,
            log_type: "info",
        })
        return res.status(203).json(response);
    }
};

exports.updateProductPrice = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, sku, basePrice, sellingPrice, maximumRetailPrice } = req?.body

        const findProduct = await productListingSchema.findOne({ configId, profileId, sku }).lean()
        if (!findProduct) {
            return res.status(203).json({ isSuccess: false, message: "Product not found", });
        }

        write_logs({
            message: `updateProductPrice: Request: ${JSON.stringify(req?.body)}`,
            log_type: "info",
        })

        if (basePrice === undefined && sellingPrice === undefined && maximumRetailPrice === undefined) {
            return res.status(203).json({
                isSuccess: false,
                message: "Nothing to update"
            });
        }

        const shouldUpdateAmazon = sellingPrice !== undefined || maximumRetailPrice !== undefined;
        if (!shouldUpdateAmazon) {
            await productListingSchema.findOneAndUpdate(
                { configId, profileId, sku },
                { ...(basePrice !== undefined && { basePrice: Number(basePrice) }) }
            ).lean();

            await logAudit("PRODUCT_PRICE_UPDATE", `Product ${sku} base price updated successfully.`, { itemName: findProduct?.itemName, sku, basePrice: Number(basePrice) }, req?.user?.id);

            return res.status(200).json({
                isSuccess: true,
                message: "Base price updated successfully."
            });
        }


        const getAccount = await getProfile(configId, profileId);
        const checkConfigSP = await getSPAccessToken(configId, profileId);

        const marketPlace = await marketPlaceConfigSchema.findOne({ countryCode: getAccount.countryCode }).lean();
        const marketplaceId = marketPlace?.marketPlaceId

        const listingBodyPayload = {
            productType: findProduct?.productType,
            patches: [
                {
                    op: "replace",
                    path: "/attributes/purchasable_offer",
                    value: [
                        {
                            currency: findProduct?.currency || "INR",
                            ...(sellingPrice !== undefined && { our_price: [{ schedule: [{ value_with_tax: Number(sellingPrice) }] }] }),
                            ...(maximumRetailPrice !== undefined && { maximum_retail_price: [{ schedule: [{ value_with_tax: Number(maximumRetailPrice) }] }] }),
                        }
                    ]
                }
            ]
        };

        write_logs({
            message: `updateProductPrice: Listing Payload: ${JSON.stringify(listingBodyPayload)}`,
            log_type: "info",
        })

        try {
            const url = `${marketPlace?.endPoint}/listings/2021-08-01/items/${checkConfigSP?.sellerId}/${sku}?includedData=issues&marketplaceIds=${marketplaceId}`
            write_logs({
                message: `updateProductPrice: URL: ${url}: ${JSON.stringify(listingBodyPayload)}`,
                log_type: "info",
            })

            const response = await retryWithBackoff(() => amazonAxios({
                method: "PATCH",
                url,
                headers: { "x-amz-access-token": `${checkConfigSP?.spAccessToken}`, 'Content-Type': 'application/json' },
                data: listingBodyPayload,
                meta: { configId: configId, tokenKey: "spAccessToken", sp: true, profileId: profileId }
            }));

            write_logs({
                message: `updateProductPrice: Response: ${response}`,
                log_type: "info",
            })
            if (response.status === 200) {

                await productListingSchema.findOneAndUpdate(
                    { configId, profileId, sku },
                    {
                        ...(basePrice !== undefined && { basePrice: Number(basePrice) }),
                        ...(sellingPrice !== undefined && { sellingPrice: Number(sellingPrice) }),
                        ...(maximumRetailPrice !== undefined && { maximumRetailPrice: Number(maximumRetailPrice) })
                    }
                ).lean()

                await logAudit("PRODUCT_PRICE_UPDATE", `Product ${sku} price updated successfully.`, { itemName: findProduct?.itemName, sku, basePrice: Number(basePrice), sellingPrice: Number(sellingPrice), maximumRetailPrice: Number(maximumRetailPrice) }, req?.user?.id);

                return res.status(response.status).json({
                    isSuccess: true,
                    message: "Listing updated successfully",
                    data: response.data
                });
            } else {
                return res.status(response.status).json({
                    isSuccess: false,
                    message: "Amazon API returned an error",
                    data: response.data
                });
            }
        } catch (error) {
            const response = {
                isSuccess: false,
                message: "Internal Server Error!",
                error: error.response?.data || error.message
            }
            write_logs({
                message: `updateProductPrice: Response: ${JSON.stringify(response)}`,
                log_type: "info",
            })
            return res.status(203).json(response);
        }
    } catch (error) {
        const response = {
            message: "Failed to update product",
            isSuccess: false,
            error: "An internal server error occurred",
        }
        write_logs({
            message: `updateProductPrice: Response: ${JSON.stringify(response)}`,
            log_type: "info",
        })
        return res.status(203).json(response);
    }
}

exports.bulkUpdateProductPrice = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, items } = req?.body;

        if (!profileId) {
            return res.status(200).json({
                isSuccess: false,
                message: "profileId is required",
            });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(200).json({
                isSuccess: false,
                message: "No items provided for bulk update",
            });
        }

        write_logs({
            message: `bulkUpdateProductPrice: Request items count: ${items.length} for profileId: ${profileId}`,
            log_type: "info",
        });

        const hasAmazonUpdates = items.some(
            (item) => item.sellingPrice !== undefined || item.maximumRetailPrice !== undefined
        );

        let checkConfigSP = null;
        let marketPlace = null;
        let marketplaceId = null;

        if (hasAmazonUpdates) {
            try {
                const getAccount = await getProfile(configId, profileId);
                checkConfigSP = await getSPAccessToken(configId, profileId);
                marketPlace = await marketPlaceConfigSchema.findOne({ countryCode: getAccount?.countryCode }).lean();
                marketplaceId = marketPlace?.marketPlaceId;
            } catch (err) {
                write_logs({
                    message: `bulkUpdateProductPrice: Error fetching SP token/marketplace: ${err.message}`,
                    log_type: "error",
                });
            }
        }

        const successList = [];
        const failedProducts = [];

        for (const item of items) {
            const rawAsin = (item.asin || item.ASIN || "").toString().trim();
            const rawSku = (item.sku || item.SKU || item.productSku || item["Product SKU"] || "").toString().trim();
            
            const rawBasePrice = item.basePrice !== undefined && item.basePrice !== null && item.basePrice !== "" ? item.basePrice : undefined;
            const rawSellingPrice = item.sellingPrice !== undefined && item.sellingPrice !== null && item.sellingPrice !== "" ? item.sellingPrice : undefined;
            const rawMrp = item.maximumRetailPrice !== undefined && item.maximumRetailPrice !== null && item.maximumRetailPrice !== "" ? item.maximumRetailPrice : undefined;

            const basePrice = rawBasePrice !== undefined ? Number(rawBasePrice) : undefined;
            const sellingPrice = rawSellingPrice !== undefined ? Number(rawSellingPrice) : undefined;
            const maximumRetailPrice = rawMrp !== undefined ? Number(rawMrp) : undefined;

            const failedEntry = {
                asin: rawAsin,
                sku: rawSku,
                basePrice: rawBasePrice,
                sellingPrice: rawSellingPrice,
                maximumRetailPrice: rawMrp,
                reason: ""
            };

            if (!rawSku) {
                failedEntry.reason = "Missing mandatory Product SKU";
                failedProducts.push(failedEntry);
                continue;
            }

            if (basePrice === undefined && sellingPrice === undefined && maximumRetailPrice === undefined) {
                failedEntry.reason = "At least one price field (Base Price, Selling Price, or MRP) must be provided";
                failedProducts.push(failedEntry);
                continue;
            }

            if (
                (basePrice !== undefined && (isNaN(basePrice) || basePrice < 0)) ||
                (sellingPrice !== undefined && (isNaN(sellingPrice) || sellingPrice < 0)) ||
                (maximumRetailPrice !== undefined && (isNaN(maximumRetailPrice) || maximumRetailPrice < 0))
            ) {
                failedEntry.reason = "Invalid numeric price value (must be non-negative numbers)";
                failedProducts.push(failedEntry);
                continue;
            }

            // Find product in DB by SKU
            const findProduct = await productListingSchema.findOne({
                configId,
                profileId,
                sku: rawSku
            }).lean();

            if (!findProduct) {
                failedEntry.reason = `Product not found for SKU '${rawSku}' in current profile`;
                failedProducts.push(failedEntry);
                continue;
            }

            const shouldUpdateAmazon = sellingPrice !== undefined || maximumRetailPrice !== undefined;

            if (!shouldUpdateAmazon) {
                try {
                    await productListingSchema.findOneAndUpdate(
                        { configId, profileId, _id: findProduct._id },
                        { ...(basePrice !== undefined && { basePrice }) }
                    ).lean();

                    await logAudit("PRODUCT_PRICE_UPDATE", `Product ${rawSku} base price updated in bulk.`, { itemName: findProduct?.itemName, sku: rawSku, basePrice }, req?.user?.id);

                    successList.push({ sku: rawSku });
                } catch (dbErr) {
                    failedEntry.reason = `DB update failed: ${dbErr.message}`;
                    failedProducts.push(failedEntry);
                }
                continue;
            }

            // Update Amazon SP-API for Selling Price / MRP
            if (!checkConfigSP?.spAccessToken || !marketPlace?.endPoint || !marketplaceId) {
                failedEntry.reason = "Amazon SP-API credentials or marketplace not available for price update";
                failedProducts.push(failedEntry);
                continue;
            }

            const listingBodyPayload = {
                productType: findProduct?.productType,
                patches: [
                    {
                        op: "replace",
                        path: "/attributes/purchasable_offer",
                        value: [
                            {
                                currency: findProduct?.currency || "INR",
                                ...(sellingPrice !== undefined && { our_price: [{ schedule: [{ value_with_tax: Number(sellingPrice) }] }] }),
                                ...(maximumRetailPrice !== undefined && { maximum_retail_price: [{ schedule: [{ value_with_tax: Number(maximumRetailPrice) }] }] }),
                            }
                        ]
                    }
                ]
            };

            try {
                const url = `${marketPlace?.endPoint}/listings/2021-08-01/items/${checkConfigSP?.sellerId}/${rawSku}?includedData=issues&marketplaceIds=${marketplaceId}`;

                const response = await retryWithBackoff(() => amazonAxios({
                    method: "PATCH",
                    url,
                    headers: { "x-amz-access-token": `${checkConfigSP?.spAccessToken}`, 'Content-Type': 'application/json' },
                    data: listingBodyPayload,
                    meta: { configId: configId, tokenKey: "spAccessToken", sp: true, profileId: profileId }
                }));

                if (response.status === 200) {
                    await productListingSchema.findOneAndUpdate(
                        { configId, profileId, _id: findProduct._id },
                        {
                            ...(basePrice !== undefined && { basePrice }),
                            ...(sellingPrice !== undefined && { sellingPrice }),
                            ...(maximumRetailPrice !== undefined && { maximumRetailPrice })
                        }
                    ).lean();

                    await logAudit("PRODUCT_PRICE_UPDATE", `Product ${rawSku} price updated in bulk.`, {
                        itemName: findProduct?.itemName,
                        sku: rawSku,
                        basePrice,
                        sellingPrice,
                        maximumRetailPrice
                    }, req?.user?.id);

                    successList.push({ sku: rawSku });
                } else {
                    const errorMsg = response.data?.issues?.[0]?.message || response.data?.message || "Amazon SP-API rejected price update";
                    failedEntry.reason = errorMsg;
                    failedProducts.push(failedEntry);
                }
            } catch (spError) {
                const spErrorMsg = spError.response?.data?.issues?.[0]?.message || spError.response?.data?.message || spError.message || "Failed to update price on Amazon";
                failedEntry.reason = `Amazon Error: ${spErrorMsg}`;
                failedProducts.push(failedEntry);
            }
        }

        return res.status(200).json({
            isSuccess: true,
            message: `Bulk price update completed. ${successList.length} succeeded, ${failedProducts.length} failed.`,
            summary: {
                total: items.length,
                successCount: successList.length,
                failedCount: failedProducts.length
            },
            failedProducts
        });
    } catch (error) {
        write_logs({
            message: `bulkUpdateProductPrice: Error: ${error.message}`,
            log_type: "error",
        });
        return res.status(203).json({
            isSuccess: false,
            message: "Failed to perform bulk price update",
            error: error.message
        });
    }
};

exports.toggleProductFavorite = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, sku, isFavorite } = req.body;

        if (!profileId || !sku) {
            return res.status(200).json({ isSuccess: false, message: "Profile ID and SKU are required" });
        }

        const updatedProduct = await productListingSchema.findOneAndUpdate(
            { configId, profileId, sku },
            { isFavorite: !!isFavorite },
            { new: true }
        ).lean();

        if (!updatedProduct) {
            return res.status(200).json({ isSuccess: false, message: "Product not found" });
        }

        return res.status(200).json({
            isSuccess: true,
            message: `Product ${isFavorite ? 'added to' : 'removed from'} favorites`,
            isFavorite: updatedProduct.isFavorite
        });

    } catch (error) {
        write_logs({ message: `[toggleProductFavorite Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
}

exports.getSPProduct = async (req, res) => {
    const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
    try {
        let {
            profileId,
            pageNo = 1,
            perPage = 10,
            searchName,
            status,
            notifyMeOnOrder,
            fieldName,
            fieldOperator,
            fieldValue,
            conditions,
            extraFieldOperator,
            extraFieldValue,
            sortColumn,
            sortOrder,
            isFavorite,
            minPrice,
            maxPrice,
            startDate,
            endDate,
            advancedSort,
        } = req.body;

        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();

        if (!profileId || !profile) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const andConditions = [
            { configId },
            { profileId }
        ];

        if (searchName && String(searchName).trim()) {
            const raw = String(searchName).trim();
            const escapeReg = (s) => s.replace(/[+?^${}()|[\]\\]/g, "\\$&");
            
            // Flexible pattern:
            // - Treats * and x/X interchangeably for dimensions (e.g. 8*5 <=> 8x5)
            // - Treats common typo variations like pouch / pounch / pourch flexibly
            // - Treats hyphens, underscores and spaces flexibly
            const flex = escapeReg(raw)
                .replace(/[*xX]/g, "[*xX]")
                .replace(/pou[rn]?ch/gi, "pou[unr]?ch")
                .replace(/[-_]/g, "[-_ ]*")
                .replace(/\s+/g, "\\s*");

            const mainRegex = new RegExp(flex, "i");
            const searchOr = [
                { itemName: { $regex: mainRegex } },
                { sku: { $regex: mainRegex } },
                { asin: { $regex: mainRegex } },
            ];

            const tokens = raw.split(/[\s,]+/).filter(t => t.length > 1 && t !== "-");
            if (tokens.length > 1) {
                const tokenAnd = tokens.map(t => {
                    const pat = escapeReg(t).replace(/[*xX]/g, "[*xX]").replace(/pou[rn]?ch/gi, "pou[unr]?ch");
                    const tr = new RegExp(pat, "i");
                    return {
                        $or: [
                            { itemName: { $regex: tr } },
                            { sku: { $regex: tr } },
                            { asin: { $regex: tr } },
                        ]
                    };
                });
                andConditions.push({
                    $or: [
                        { $or: searchOr },
                        { $and: tokenAnd }
                    ]
                });
            } else {
                andConditions.push({ $or: searchOr });
            }
        }

        if (status) {
            andConditions.push({ reviewRequestEnable: status === "true" });
        }

        if (notifyMeOnOrder) {
            if (notifyMeOnOrder === "true") {
                andConditions.push({ notifyMeOnOrder: true });
            } else if (notifyMeOnOrder === "false") {
                andConditions.push({
                    $or: [
                        { notifyMeOnOrder: false },
                        { notifyMeOnOrder: { $exists: false } }
                    ]
                });
            }
        }
        if (isFavorite === "true" || isFavorite === true) {
            andConditions.push({ isFavorite: true });
        }

        // Price Range Filter
        if (minPrice || maxPrice) {
            const priceFilter = {};
            if (minPrice) priceFilter.$gte = Number(minPrice);
            if (maxPrice) priceFilter.$lte = Number(maxPrice);
            andConditions.push({ sellingPrice: priceFilter });
        }

        // Date Range Filter
        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate) dateFilter.$gte = moment(startDate).startOf('day').toDate();
            if (endDate) dateFilter.$lte = moment(endDate).endOf('day').toDate();
            andConditions.push({ productCreatedDate: dateFilter });
        }

        let query = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

        // Shared enrichment stages (lookups + computed fields + final project)
        const enrichmentStages = [
            {
                $lookup: {
                    from: "orders",
                    localField: "sku",
                    foreignField: "sellerSKU",
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $in: ["$orderStatus", ["Shipped", "SHIPPED"]] },
                                        {
                                            $lte: [
                                                { $add: ["$deliveryDate", { $multiply: ["$reviewRequestDelay", 1000 * 60 * 60 * 24] }] },
                                                moment().tz(profile?.timezone)
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 1 } }
                    ],
                    as: "orderData",
                },
            },
            {
                $addFields: {
                    performanceMail: {
                        $cond: {
                            if: { $eq: ["$reviewRequestEnable", true] },
                            then: { $size: "$orderData" },
                            else: 0
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "orders",
                    localField: "sku",
                    foreignField: "sellerSKU",
                    pipeline: [
                        { $match: { orderStatus: { $in: ["Shipped", "SHIPPED", "Delivered", "DELIVERED", "Unshipped", "UNSHIPPED"] } } },
                        { $count: "count" }
                    ],
                    as: "allTimeOrders",
                }
            },
            {
                $addFields: {
                    totalOrders: { $ifNull: [{ $arrayElemAt: ["$allTimeOrders.count", 0] }, 0] }
                }
            },
            {
                $lookup: {
                    from: "asinapluscontents",
                    let: { asin: "$asin", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$asin", "$$asin"] }, { $eq: ["$configId", "$$configId"] }, { $eq: ["$profileId", "$$profileId"] }, { $eq: ["$contentType", "EBC"] }, { $eq: ["$locale", "en_IN"] }] } } },
                        { $sort: { updateTime: -1 } },
                        { $project: { _id: 0, contentReferenceKey: 1, contentStatus: 1, contentName: 1, updateTime: 1 } }
                    ],
                    as: "aPlusContentData"
                }
            },
            {
                $addFields: {
                    hasAPlusContent: { $gt: [{ $size: "$aPlusContentData" }, 0] },
                    aPlusContentStatus: { $ifNull: [{ $arrayElemAt: ["$aPlusContentData.contentStatus", 0] }, null] },
                    contentReferenceKey: { $ifNull: [{ $arrayElemAt: ["$aPlusContentData.contentReferenceKey", 0] }, null] }
                }
            },
            {
                $project: {
                    marketplaceId: 1,
                    asin: 1,
                    sku: 1,
                    itemName: 1,
                    basePrice: 1,
                    sellingPrice: 1,
                    maximumRetailPrice: 1,
                    imageURL: 1,
                    reviewRequestDelay: 1,
                    reviewRequestEnable: { $ifNull: ["$reviewRequestEnable", false] },
                    productType: 1,
                    classificationRank: 1,
                    displayGroupRanks: 1,
                    notifyMeOnOrder: 1,
                    performanceMail: 1,
                    isFavorite: { $ifNull: ["$isFavorite", false] },
                    totalOrders: 1,
                    discountAmount: 1,
                    fbmQuantity: 1,
                    createdAt: 1,
                    productCreatedDate: 1,
                    hasAPlusContent: 1,
                    aPlusContentStatus: 1,
                    contentReferenceKey: 1,
                    aPlusContentData: 1,
                }
            }
        ];

        // Add field filtering
        let fieldFilterStage = null;
        if (fieldName && fieldOperator && fieldValue !== undefined) {
            const fieldFilter = buildFieldFilter(fieldName, fieldOperator, fieldValue);

            if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
                const extraFieldFilter = buildFieldFilter(fieldName, extraFieldOperator, extraFieldValue);

                fieldFilterStage = {
                    [`$${conditions.toLowerCase()}`]: [
                        fieldFilter,
                        extraFieldFilter
                    ]
                };
            } else {
                fieldFilterStage = fieldFilter;
            }
        }

        // Add sorting
        let sortStage = {};
        const direction = (sortOrder || "").toUpperCase() === "ASC" ? 1 : -1;

        if (advancedSort) {
            switch (advancedSort) {
                case 'bestSellers':
                    sortStage = { totalOrders: -1 };
                    break;
                case 'newestArrivals':
                    sortStage = { productCreatedDate: -1 };
                    break;
                case 'highestDiscount':
                    sortStage = { discountAmount: -1 };
                    break;
                case 'stockLowToHigh':
                    sortStage = { fbmQuantity: 1 };
                    break;
                case 'stockHighToLow':
                    sortStage = { fbmQuantity: -1 };
                    break;
                default:
                    if (sortColumn) sortStage[sortColumn] = direction;
                    else sortStage.productCreatedDate = -1;
            }
        } else if (sortColumn) {
            sortStage[sortColumn] = direction;
        } else {
            sortStage.productCreatedDate = -1;
        }

        const pageNumber = Math.max(1, Number(pageNo) || 1);
        const pageSize = Math.max(1, Number(perPage) || 10);

        // Check if filtering or sorting depends on lookup-generated fields
        const lookupDependentFields = new Set([
            "totalOrders",
            "performanceMail",
            "hasAPlusContent",
            "aPlusContentStatus",
            "contentReferenceKey",
            "aPlusContentData"
        ]);

        const sortField = Object.keys(sortStage)[0];
        const isSortDependent = lookupDependentFields.has(sortField);
        const isFilterDependent = Boolean(fieldName && lookupDependentFields.has(fieldName));
        const requiresEarlyLookup = isSortDependent || isFilterDependent;

        let productResult = [];
        let totalRecords = 0;

        if (requiresEarlyLookup) {
            // Fallback for sorting/filtering by totalOrders / performanceMail:
            // Lookups must happen before sort & paginate
            const fullPipeline = [
                { $match: query },
                {
                    $addFields: {
                        discountAmount: { $subtract: [{ $ifNull: ["$maximumRetailPrice", 0] }, { $ifNull: ["$sellingPrice", 0] }] }
                    }
                },
                ...enrichmentStages,
                ...(fieldFilterStage ? [{ $match: fieldFilterStage }] : []),
                {
                    $facet: {
                        metadata: [{ $count: "total" }],
                        data: [
                            { $sort: sortStage },
                            { $skip: (pageNumber - 1) * pageSize },
                            { $limit: pageSize }
                        ]
                    }
                },
                {
                    $project: {
                        data: 1,
                        totalRecords: { $arrayElemAt: ["$metadata.total", 0] }
                    }
                }
            ];

            const result = await productListingSchema.aggregate(fullPipeline).allowDiskUse(true);
            productResult = result[0]?.data || [];
            totalRecords = result[0]?.totalRecords || 0;
        } else {
            // Highly optimized fast path (default):
            // 1. Calculate count directly using index / lightweight aggregate
            let countPromise;
            if (fieldFilterStage) {
                countPromise = productListingSchema.aggregate([
                    { $match: query },
                    {
                        $addFields: {
                            discountAmount: { $subtract: [{ $ifNull: ["$maximumRetailPrice", 0] }, { $ifNull: ["$sellingPrice", 0] }] }
                        }
                    },
                    { $match: fieldFilterStage },
                    { $count: "total" }
                ]).then(res => res[0]?.total || 0);
            } else {
                countPromise = productListingSchema.countDocuments(query);
            }

            totalRecords = await countPromise;

            // 2. Only if records exist, fetch page items and apply lookups ONLY to those page items
            if (totalRecords > 0) {
                const fastPipeline = [
                    { $match: query },
                    {
                        $addFields: {
                            discountAmount: { $subtract: [{ $ifNull: ["$maximumRetailPrice", 0] }, { $ifNull: ["$sellingPrice", 0] }] }
                        }
                    },
                    ...(fieldFilterStage ? [{ $match: fieldFilterStage }] : []),
                    { $sort: sortStage },
                    { $skip: (pageNumber - 1) * pageSize },
                    { $limit: pageSize },
                    ...enrichmentStages
                ];

                productResult = await productListingSchema.aggregate(fastPipeline).allowDiskUse(true);
            }
        }

        return res.status(200).send({
            isSuccess: true,
            products: productResult,
            currentPageNo: pageNo,
            totalRecords: totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
        });

    } catch (error) {
        write_logs({ message: `[getSPProduct Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.changeProductSetting = async (req, res) => {
    try {
        const productId = req.params.productId;
        const { reviewRequestEnable, reviewRequestDelay, notifyMeOnOrder, notifyOnLowStock } = req.body;
        await productListingSchema
            .findByIdAndUpdate(productId, { reviewRequestEnable, reviewRequestDelay, notifyMeOnOrder, notifyOnLowStock }, { new: true })
            .then(async (rule) => {
                if (!rule) {
                    return res
                        .status(203)
                        .send({ message: "Product not found!", isSuccess: false });
                }

                await logAudit("PRODUCT_NOTIFICATION_THRESHOLD", `Product ${rule.sku} notification threshold updated successfully.`, { itemName: rule.itemName, sku: rule.sku, notifyMeOnOrder: rule.notifyMeOnOrder, notifyOnLowStock: rule.notifyOnLowStock, reviewRequestDelay: rule.reviewRequestDelay, reviewRequestEnable: rule.reviewRequestEnable }, req?.user?.id);

                return res.status(200).send({
                    message: "Setting updated successfully.",
                    isSuccess: true,
                });
            })
            .catch((error) => {
                write_logs({ message: `[changeProductSetting Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                return res.status(203).send({
                    error: "An internal server error occurred",
                    message: "Something went wrong, please try again!",
                    isSuccess: false,
                });
            });
    } catch (error) {
        write_logs({ message: `[changeProductSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
};

exports.cronRequestReview = async () => {
    cron_logs({
        message: `India Time = ${moment()
            .tz("Asia/Kolkata")
            .format("HH:mm")} cronRequestReview`,
        log_type: "info",
    });
    try {
        const getCronStatus = await cronJobSchema.findOne({
            cronName: "Review Request",
            isActive: false,
        }).lean();
        if (getCronStatus) {
            return cron_logs({
                message: `Your Review Request status is deactive.`,
                log_type: "info",
            });
        }
        const getProfileId = await getActivePlanProfiles();
        getProfileId.map((profile) => limit(async () => {

            const start = moment().tz(profile.timezone).startOf("day").toDate();
            const end = moment().tz(profile.timezone).add(1, "day").startOf("day").toDate();

            const checkConfigSP = await getSPAccessToken(profile.configId, profile.profileId);
            if (
                checkConfigSP &&
                checkConfigSP.spAccessToken
            ) {

                const currentDate = moment
                    .tz(profile.timezone)
                    .format("YYYY-MM-DD");

                const pipeline = [
                    {
                        $lookup: {
                            from: "profiles",
                            localField: "profileId",
                            foreignField: "profileId",
                            as: "profiles"
                        }
                    },
                    { $unwind: { path: "$profiles", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "spproducts",
                            localField: "sellerSKU",
                            foreignField: "sku",
                            as: "spProduct"
                        }
                    },
                    { $unwind: "$spProduct" },
                    {
                        $match: {
                            "spProduct.reviewRequestEnable": true,
                            orderStatus: { $in: ["Shipped", "SHIPPED"] },
                            deliveryDate: { $ne: null }
                        }
                    },
                    {
                        $addFields: {
                            targetDate: {
                                $add: [
                                    "$deliveryDate",
                                    { $multiply: ["$spProduct.reviewRequestDelay", 24 * 60 * 60 * 1000] }
                                ]
                            }
                        }
                    },
                    {
                        $match: {
                            targetDate: {
                                $gte: start,
                                $lt: end
                            },
                            profileId: profile.profileId
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            configId: 1,
                            marketplaceId: 1,
                            amazonOrderId: 1,
                            profileId: 1,
                            "profiles.timezone": 1
                        }
                    }
                ];

                let orderList = await orderSchema.aggregate(pipeline);
                orderList.map(async (order) => {

                    const marketPlaceSetting = await marketPlaceConfigSchema.findOne({ marketPlaceId: order.marketplaceId }).lean();


                    let config = {
                        method: 'GET',
                        url: `${marketPlaceSetting.endPoint}/solicitations/v1/orders/${order.amazonOrderId}?marketplaceIds=${order.marketplaceId}`,
                        headers: {
                            'x-amz-access-token': checkConfigSP.spAccessToken
                        },
                        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
                    };

                    const response = await retryWithBackoff(() => amazonAxios(config));
                    if (response.status === 200) {

                        const solicitationAction = response?.data?._links?.actions?.find(
                            (action) => action?.name === "productReviewAndSellerFeedback"
                        );
                        if (solicitationAction) {
                            config = {
                                method: 'POST',
                                url: `${marketPlaceSetting.endPoint}${solicitationAction?.href}`,
                                headers: {
                                    'x-amz-access-token': checkConfigSP.spAccessToken
                                },
                                meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
                            };
                            const reviewResponse = await retryWithBackoff(() => amazonAxios(config));
                            if (reviewResponse?.data?.errors) {
                                await orderSchema.updateOne(
                                    {
                                        profileId: order.profileId,
                                        amazonOrderId: order.amazonOrderId,
                                    },
                                    {
                                        $set: {
                                            reviewStatus: "Error",
                                            reviewCancelReason: reviewResponse?.data?.errors[0]?.message,
                                            reviewRequestedDate: moment().tz(order.profiles.timezone).format("YYYY-MM-DDTHH:mm:ss")
                                        },
                                    },
                                    { upsert: true }
                                );
                            } else {
                                await orderSchema.updateOne(
                                    {
                                        profileId: order.profileId,
                                        amazonOrderId: order.amazonOrderId,
                                    },
                                    {
                                        $set: {
                                            reviewStatus: "Requested",
                                            reviewCancelReason: "",
                                            reviewRequestedDate: moment().tz(order.profiles.timezone).format("YYYY-MM-DDTHH:mm:ss")
                                        },
                                    },
                                    { upsert: true }
                                );
                            }
                        }

                    }

                });

                const createCronHistory = new cronJobHistorySchema({
                    configId: profile.configId,
                    profileId: profile.profileId,
                    cronName: "Review Request",
                    status: "COMPLETED",
                    historyDate: currentDate,
                });
                await createCronHistory.save();
            }
        }));
    } catch (error) {
        return cron_logs({
            message: `Something went wrong. Error: ${error}`,
            log_type: "error",
        });
    }
}

exports.getProductTypes = async (req, res) => {
    try {

        let { profileId } = req.body;
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();

        if (!profileId || !profile) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const checkConfigSP = await getSPAccessToken(profile.configId, profileId);
        if (checkConfigSP && checkConfigSP.spAccessToken) {

            // Get unique product types currently in the profile's inventory
            const servingCategories = await productListingSchema.distinct("productType", { profileId: Number(profileId) });

            const marketplaceConfig = await marketPlaceConfigSchema.findOne({ countryCode: profile.countryCode }).lean();

            let url = `${marketplaceConfig?.endPoint}/definitions/2020-09-01/productTypes?marketplaceIds=${marketplaceConfig?.marketPlaceId}`;
            let config = {
                method: 'get',
                url: url,
                headers: { 'x-amz-access-token': checkConfigSP.spAccessToken },
                meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: Number(profileId) }
            };

            const response = await retryWithBackoff(() => amazonAxios(config));
            if (response && response.status == 200) {
                let types = response.data.productTypes;

                // Filter Amazon product types to only show those that exist in the profile's inventory
                // if (servingCategories && servingCategories.length > 0) {
                //     types = types.filter(t => servingCategories.includes(t.name));
                // } else {
                //     types = []; // No products found for this profile
                // }

                return res.status(200).send({
                    isSuccess: true,
                    marketplace_id: marketplaceConfig?.marketPlaceId,
                    productType: types,
                });
            }
        }

        return res.status(200).send({
            isSuccess: false,
            message: "Account Disconnected! Please contact administrator.",
        });

    } catch (error) {
        write_logs({ message: `[getProductTypes Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        
        if (error.isRateLimit) {
            return res.status(429).json({ isSuccess: false, message: error.message });
        }
        
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.getProductDefinition = async (req, res) => {
    try {

        let { profileId, productType } = req.body;
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();

        if (!profileId || !profile) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const checkConfigSP = await getSPAccessToken(profile.configId, profileId);
        if (checkConfigSP && checkConfigSP.spAccessToken) {

            const marketplaceConfig = await marketPlaceConfigSchema.findOne({ countryCode: profile.countryCode }).lean();

            let url = `${marketplaceConfig?.endPoint}/definitions/2020-09-01/productTypes/${productType}?marketplaceIds=${marketplaceConfig?.marketPlaceId}`;
            let config = {
                method: 'get',
                url: url,
                headers: {
                    'x-amz-access-token': checkConfigSP.spAccessToken
                }
            };

            const response = await amazonAxios({
                ...config,
                meta: { configId: profile.configId, profileId, sp: true }
            });
            if (response && response.status == 200) {

                config = {
                    method: 'get',
                    url: response.data?.schema?.link?.resource
                };

                const schemaResponse = await axios.request(config);
                if (schemaResponse && schemaResponse.status == 200) {
                    return res.status(200).send({
                        isSuccess: true,
                        schema: {
                            ...schemaResponse.data,
                            schemaUrl: response.data?.schema?.link?.resource
                        },
                        propertyGroup: response.data?.propertyGroups
                    });
                }

            }
        }

        return res.status(200).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
        });

    } catch (error) {
        write_logs({ message: `[getProductDefinition Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.checkASIN = async (req, res) => {
    try {

        let { profileId, asin } = req.body;
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();

        if (!profileId || !profile) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const checkConfigSP = await getSPAccessToken(profile.configId, profileId);
        if (checkConfigSP && checkConfigSP.spAccessToken) {

            const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
            let url = `${marketplaceConfig?.endPoint}/catalog/2020-12-01/items/${asin}?marketplaceIds=${marketplaceConfig?.marketPlaceId}&includedData=attributes,summaries,productTypes`;
            let config = {
                method: 'get',
                url: url,
                headers: {
                    'x-amz-access-token': checkConfigSP.spAccessToken
                }
            };

            const response = await amazonAxios({
                ...config,
                meta: { configId: profile.configId, profileId, sp: true }
            });
            if (response && response.status == 200) {
                return res.status(200).send({
                    isSuccess: true,
                    message: "Product get Successfully!",
                    data: {
                        asin: response?.data?.asin,
                        attributes: response?.data?.attributes,
                        productTypes: response?.data?.productTypes,
                        summaries: response?.data?.summaries,
                        languageTag: Object.values(response?.data?.attributes ?? {}).flat().find(item => item?.language_tag)?.language_tag ?? null,
                    },
                });
            }
        }

        return res.status(200).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
        });

    } catch (error) {
        write_logs({ message: `[checkASIN Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.checkASINFromDB = async (req, res) => {
    try {
        const { asins, profileId, search } = req.body;

        if (!profileId) {
            return res.status(203).send({ isSuccess: false, message: "Profile id required." });
        }

        const targetProfileId = !isNaN(Number(profileId)) ? Number(profileId) : profileId;

        // Build base query
        let query = {
            $or: [
                { profileId: targetProfileId },
                { profileId: String(profileId) }
            ]
        };

        // CASE 1: ASIN / SKU list search
        if (asins) {
            const asinList = (Array.isArray(asins) ? asins : [asins])
                .map(a => String(a).trim())
                .filter(Boolean);

            if (asinList.length > 0) {
                const regexList = asinList.map(a => new RegExp(`^${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i"));
                query.$and = [
                    {
                        $or: [
                            { asin: { $in: regexList } },
                            { sku: { $in: regexList } }
                        ]
                    }
                ];
            }
        }

        // CASE 2: Search text (sku OR itemName OR asin)
        if (search && String(search).trim().length > 0) {
            const cleanSearch = String(search).trim();
            const searchRegex = new RegExp(cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
            const searchCondition = {
                $or: [
                    { sku: searchRegex },
                    { itemName: searchRegex },
                    { asin: searchRegex }
                ]
            };

            if (query.$and) {
                query.$and.push(searchCondition);
            } else {
                query.$and = [searchCondition];
            }
        }

        // If both are empty → return validation error
        if ((!asins || (Array.isArray(asins) && asins.length === 0)) && !search) {
            return res.status(203).json({
                isSuccess: false,
                message: "Provide ASIN list or search text."
            });
        }

        // Fetch products
        const products = await productListingSchema.find(
            query,
            {
                _id: 1,
                asin: 1,
                sku: 1,
                itemName: 1,
                imageURL: 1,
                productType: 1,
                profileId: 1,
                marketplaceId: 1,
                configId: 1,
                sellingPrice: 1,
                basePrice: 1,
                createdAt: 1
            }
        ).lean();

        // Format price for frontend compatibility
        const formattedProducts = products.map(p => ({
            ...p,
            price: p.sellingPrice || p.basePrice || 0
        }));

        return res.status(200).json({
            isSuccess: true,
            total: formattedProducts.length,
            data: formattedProducts
        });
    } catch (error) {
        write_logs({ message: `[checkASINFromDB Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.error("Error fetching ASINs:", error);
        return res.status(500).json({
            isSuccess: false,
            message: "Server error",
            error: "An internal server error occurred"
        });
    }
};

exports.productSearchOnAmazon = async (req, res) => {
    try {

        let { profileId, keyword, brand } = req.body;
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();

        if (!profileId || !profile) {
            return res
                .status(203)
                .send({ isSuccess: false, message: "Profile id required." });
        }

        const checkConfigSP = await getSPAccessToken(profile.configId, profileId);
        if (checkConfigSP && checkConfigSP.spAccessToken) {


            const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
            let url = `${marketplaceConfig?.endPoint}/catalog/2020-12-01/items?keywords=${encodeURIComponent(keyword)}&marketplaceIds=${marketplaceConfig?.marketPlaceId}&includedData=images,summaries${brand ? `&brandNames=${encodeURIComponent(brand)}` : ""}`;
            let config = {
                method: 'get',
                url: url,
                headers: {
                    'x-amz-access-token': checkConfigSP.spAccessToken
                }
            };

            const response = await amazonAxios({
                ...config,
                meta: { configId: profile.configId, profileId, sp: true }
            });
            if (response && response.status == 200) {
                return res.status(200).send({
                    isSuccess: true,
                    message: "Product get Successfully!",
                    data: {
                        items: response?.data?.items
                    },
                });
            }
        }

        return res.status(200).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
        });

    } catch (error) {
        write_logs({ message: `[productSearchOnAmazon Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.parseFields = async (req, res) => {
    try {

        let { selectedKeys, schemaUrl } = req.body;

        const config = {
            method: 'get',
            url: schemaUrl
        };

        const schemaResponse = await axios.request(config);

        if (schemaResponse && schemaResponse.status == 200) {
            const schema = schemaResponse?.data

            const conditionRegistry = new ConditionRegistry();
            const evaluator = new ConditionEvaluator(schema, schema?.allOf || [], conditionRegistry, selectedKeys);
            const evaluatedConditions = evaluator.evaluateAllConditions(selectedKeys);

            const fieldBuilder = new FlattenedFieldBuilder(
                schema,
                evaluatedConditions,
                conditionRegistry,
                selectedKeys
            );

            const fields = fieldBuilder.buildAllFields(selectedKeys);
            // const validatedFields = ensureEnumIntegrity(fields);

            return res.status(200).send({
                isSuccess: true,
                message: "Product Fields Get Successfully!",
                fields,
            });
        }

        return res.status(200).send({
            isSuccess: false,
            message: "Something went wrong, please try again!",
        });

    } catch (error) {
        write_logs({ message: `[parseFields Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
            message: "Something went wrong, please try again!",
            isSuccess: false,
            error: "An internal server error occurred",
        });
    }
}

exports.cronBestSellerRank = async () => {
    cron_logs({
        message: `India Time = ${moment()
            .tz("Asia/Kolkata")
            .format("HH:mm")} cronBestSellerRank`,
        log_type: "info",
    });
    try {

        const getProfileId = await profileSchema.find({ isActive: true, profileId: 1451708219889308 }).lean();
        const listPromises = getProfileId.map((profile) => limit(async () => {
            const currentDate = moment.tz(profile.timezone).format("YYYY-MM-DD");

            const marketPlaceSettings = await marketPlaceConfigSchema.findOne({
                countryCode: profile.countryCode
            }).lean();

            const products = await productListingSchema.find({
                configId: profile.configId,
                profileId: profile.profileId
            }).lean()

            const BATCH_SIZE = 5;
            const total = products.length;
            let count = 0;

            for (let i = 0; i < total; i += BATCH_SIZE) {

                const batch = products.slice(i, i + BATCH_SIZE);
                const checkConfigSP = await getSPAccessToken(profile.configId, profile.profileId);

                for (let j = 0; j < batch.length; j++) {

                    const p = batch[j];
                    const url = `${marketPlaceSettings.endPoint}/catalog/2022-04-01/items/${p.asin}?marketplaceIds=${marketPlaceSettings.marketPlaceId}&includedData=salesRanks`;

                    const config = {
                        method: 'GET',
                        url,
                        timeout: 20000,
                        headers: {
                            'x-amz-access-token': checkConfigSP.spAccessToken,
                            'Content-Type': 'application/json'
                        },
                        meta: {
                            configId: profile.configId,
                            tokenKey: "spAccessToken",
                            sp: true,
                            profileId: profile?.profileId,
                        }
                    };

                    count++;
                    let response;
                    try {
                        response = await retryWithBackoff(() => amazonAxios(config));
                    } catch (error) {
                        cron_logs({
                            message: `CronBestSellerRank, Asin: ${p.asin}, Error: ${error}`,
                            log_type: "info",
                        });
                        continue;
                    }
                    if (response?.status === 200) {

                        cron_logs({
                            message: `Fetched from index ${count}/${total}, Asin: ${p.asin}`,
                            log_type: "info",
                        });

                        const sellerRank = response.data.salesRanks;
                        if (sellerRank?.length) {
                            await productListingSchema.findByIdAndUpdate(
                                p._id,
                                {
                                    $set: {
                                        classificationRank: sellerRank[0]?.classificationRanks?.[0]?.rank || 0,
                                        displayGroupRanks: sellerRank[0]?.displayGroupRanks?.[0]?.rank || 0
                                    }
                                }
                            );
                        }
                    }
                }

            }

            const createCronHistory = new cronJobHistorySchema({
                configId: profile.configId,
                profileId: profile.profileId,
                cronName: "Best Seller Rank",
                status: "COMPLETED",
                historyDate: currentDate,
            });
            await createCronHistory.save();
        }));
        await Promise.all(listPromises);

        return cron_logs({
            message: "Product rank fetched successfully.",
            log_type: "info",
        });

    } catch (error) {
        return cron_logs({
            message: `Something went wrong. Error: ${error}`,
            log_type: "error",
        })
    }
}

exports.monitorInventory = async () => {
    cron_logs({
        message: `India Time = ${moment()
            .tz("Asia/Kolkata")
            .format("HH:mm")} monitorInventory`,
        log_type: "info",
    });
    try {

        const getCronStatus = await cronJobSchema.findOne({
            cronName: "Monitor Inventory",
            isActive: false,
        }).lean();
        if (getCronStatus) {
            return cron_logs({
                message: `Your Monitor Inventory status is deactive.`,
                log_type: "info",
            });
        }

        const getProfileId = await profileSchema.find({ isActive: true, profileId: 1451708219889308 }).lean();
        const listPromises = getProfileId.map((profile) => limit(async () => {

            const checkConfigSP = await getSPAccessToken(profile.configId, profile.profileId);
            if (
                checkConfigSP &&
                checkConfigSP.spAccessToken
            ) {

                const currentDate = moment
                    .tz(profile.timezone)
                    .format("YYYY-MM-DD");

                const lowStockProducts = await productListingSchema
                    .find({
                        configId: profile.configId,
                        profileId: profile.profileId,
                        fbmQuantity: { $lte: 20, $gt: 0 }
                    });

                if (lowStockProducts.length > 0) {
                    const prodObj = lowStockProducts.map(p => ({
                        profileId: profile.profileId,
                        configId: profile.configId,
                        notificationTitle: `Low Inventory Alert`,
                        notificationText: `Product stock is below 20 units. <br><b>ASIN:</b> <span data-link="/product-list?search=${Buffer.from(String(p.asin)).toString("base64")}" class="text-blue text-decoration-underline"><b>${p.asin},</b></span> <br><b>Current Stock:</b> ${p.fbmQuantity} <br>Please refill inventory to avoid ad stoppage.`,
                        searchable: p.name
                    }));

                    await adNotificationSchema.insertMany(prodObj);

                    await Promise.all(
                        lowStockProducts?.map(async (p) => {
                            const notificationTitle = `Low Inventory Alert`;
                            const notificationMessage = `Product stock is below 20 units. <br>ASIN: ${p.asin} <br>Current Stock: ${p.fbmQuantity} <br>Please refill inventory to avoid ad stoppage.`;
                            await sendNotificationToUser(profile?.profileId, notificationTitle, notificationMessage)
                        })
                    )
                }

                await cronJobHistorySchema.findOneAndUpdate(
                    {
                        configId: profile.configId,
                        profileId: profile.profileId,
                        cronName: "Monitor Inventory",
                        historyDate: currentDate,
                    },
                    { $set: { status: "COMPLETED" } },
                    { new: true, upsert: true }
                ).lean();

            }
        }));
        await Promise.all(listPromises);
        return cron_logs({
            message: "Product Inventory Checked successfully.",
            log_type: "info",
        });

    } catch (error) {
        return cron_logs({
            message: `Something went wrong. Error: ${error}`,
            log_type: "error",
        })
    }
}

exports.getOrderMatrix = async (fronDate, toDate, profileId, timezone) => {
    try {
        const pipeline = [
            {
                $match: {
                    profileId: profileId
                }
            },
            {
                $addFields: {
                    formattedDate: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$purchaseDate",
                            timezone: timezone
                        }
                    }
                }
            },
            {
                $match: {
                    formattedDate: { $gte: fronDate, $lte: toDate },
                    orderStatus: { $nin: ["Cancelled", "CANCELLED"] }
                }
            },
            {
                $group: {
                    _id: "$formattedDate",
                    totalSales: { $sum: "$itemPrice" },
                    orderCount: { $sum: 1 }
                }
            }
        ];

        const orders = await orderSchema.aggregate(pipeline);
        return orders;


    } catch (error) {
        write_logs({ message: `[getOrderMatrix Error] ${error?.message || error}`, log_type: "error" });
        return [];
    }
}

// ═══════════════════════════════════════════════════════════
// AI LISTING ANALYSIS — Step 1
// ═══════════════════════════════════════════════════════════
exports.analyzeListingWithAI = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, sku, forceRefresh, analyzeContent = true, analyzeImage = false } = req.body;

        if (!profileId || !sku) {
            return res.status(200).json({ isSuccess: false, message: "profileId and sku are required" });
        }

        if (analyzeContent === false && analyzeImage === false) {
            return res.status(200).json({ isSuccess: false, message: "Please select at least one option to analyze (Content or Image)." });
        }

        const product = await productListingSchema.findOne({ configId, profileId, sku }).lean();
        if (!product) {
            return res.status(200).json({ isSuccess: false, message: "Product not found" });
        }

        // MD5 includes live attr timestamp — if attrs refresh, AI re-analyzes with new content
        // Also includes selected toggles to invalidate cache if user switches options
        const checksum = crypto
            .createHash('md5')
            .update(`${product.itemName}|${product.sellingPrice}|${product.maximumRetailPrice}|${product.liveAttributesFetchedAt || ''}|${analyzeContent}|${analyzeImage}`)
            .digest('hex');


        const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
        const LIVE_ATTR_TTL_MS = 24 * 60 * 60 * 1000;     // 24 hours

        const aiCacheAge = product.aiLastAnalyzedAt
            ? Date.now() - new Date(product.aiLastAnalyzedAt).getTime()
            : Infinity;

        // Find all other SKUs sharing this ASIN to prevent detail page control conflicts
        let relatedSkus = [];
        if (product.asin) {
            const relatedListings = await productListingSchema.find({ configId, profileId, asin: product.asin }, 'sku itemName status').lean();
            relatedSkus = relatedListings.filter(l => l.sku !== sku).map(l => ({ sku: l.sku, itemName: l.itemName }));
        }

        // Return cached AI result if listing hasn't changed, cache is fresh, and refresh is not forced
        if (!forceRefresh && product.aiCachedResult && product.aiAnalyzedChecksum === checksum && aiCacheAge < AI_CACHE_TTL_MS) {
            return res.status(200).json({
                isSuccess: true,
                fromCache: true,
                data: { ...product.aiCachedResult, relatedSkus },
            });
        }

        // ── Fetch live listing attributes from Amazon SP-API ───
        // (cached for 24h — refreshed only when stale)
        let liveAttrs = product.liveAttributes;
        const liveAttrAge = product.liveAttributesFetchedAt
            ? Date.now() - new Date(product.liveAttributesFetchedAt).getTime()
            : Infinity;

        if (forceRefresh || !liveAttrs || !liveAttrs.bullet_point || liveAttrAge > LIVE_ATTR_TTL_MS) {
            try {
                const getAccount = await getProfile(configId, profileId);
                const checkConfigSP = await getSPAccessToken(configId, profileId);
                const marketPlace = await marketPlaceConfigSchema.findOne({ countryCode: getAccount.countryCode }).lean();
                const marketplaceId = getAccount?.marketplaceStringId;
                const endpoint = marketPlace?.endPoint;

                const spCatalogUrl = `${endpoint}/catalog/2022-04-01/items/${product.asin}?includedData=attributes&marketplaceIds=${marketplaceId}`;
                const spListingsUrl = `${endpoint}/listings/2021-08-01/items/${checkConfigSP?.sellerId}/${encodeURIComponent(sku)}?includedData=attributes&marketplaceIds=${marketplaceId}`;

                // Fetch both in parallel
                const [spCatalogRes, spListingsRes] = await Promise.allSettled([
                    retryWithBackoff(() => amazonAxios({
                        method: "GET",
                        url: spCatalogUrl,
                        headers: { "x-amz-access-token": checkConfigSP?.spAccessToken },
                        meta: { configId, tokenKey: "spAccessToken", sp: true, profileId }
                    })),
                    retryWithBackoff(() => amazonAxios({
                        method: "GET",
                        url: spListingsUrl,
                        headers: { "x-amz-access-token": checkConfigSP?.spAccessToken },
                        meta: { configId, tokenKey: "spAccessToken", sp: true, profileId }
                    }))
                ]);

                if (spCatalogRes.status === 'fulfilled' && spCatalogRes.value?.data?.attributes) {
                    liveAttrs = spCatalogRes.value.data.attributes;

                    // Safely merge hidden backend keywords from the Listings API if available
                    if (spListingsRes.status === 'fulfilled' && spListingsRes.value?.data?.attributes?.generic_keyword) {
                        liveAttrs.generic_keyword = spListingsRes.value.data.attributes.generic_keyword;
                    }

                    // Persist in DB with 24h TTL
                    await productListingSchema.findByIdAndUpdate(product._id, {
                        liveAttributes: liveAttrs,
                        liveAttributesFetchedAt: new Date(),
                    });
                    write_logs({ message: `analyzeListingWithAI: Fetched live attributes for SKU ${sku} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
                } else {
                    write_logs({ message: `analyzeListingWithAI: Catalog API returned no attributes for SKU ${sku} [body] ${JSON.stringify(req?.body)}`, log_type: "warn" });
                }
            } catch (spErr) {
                write_logs({ message: `analyzeListingWithAI: Could not fetch live attributes for SKU ${sku}: ${spErr.message} [body] ${JSON.stringify(req?.body)}`, log_type: "warn" });
            }
        }

        // ── Extract structured fields from live attributes ─────
        // These are the ACTUAL current bullets/description/keywords on Amazon
        const extractAttrValue = (attr, key) => {
            const arr = attr?.[key];
            if (!Array.isArray(arr) || !arr.length) return null;
            return arr.map(i => i?.value).filter(Boolean);
        };

        const currentBullets = extractAttrValue(liveAttrs, 'bullet_point') || [];
        // Try product_description first, fall back to short_product_description
        const currentDescription =
            extractAttrValue(liveAttrs, 'product_description')?.[0] ||
            extractAttrValue(liveAttrs, 'short_product_description')?.[0] || '';
        const currentKeywords = extractAttrValue(liveAttrs, 'generic_keyword')?.[0] || '';
        const currentTitle = extractAttrValue(liveAttrs, 'item_name')?.[0] || product.itemName;
        const currentBrand = extractAttrValue(liveAttrs, 'brand')?.[0] || '';

        // ── Enrich with inventory data ─────────────────────────
        const inventory = await inventorySchema.findOne({ profileId, sku, ...(configId && { configId }) }).lean();

        // ── Fetch competitor prices for data-driven price analysis ──
        let competitorPrices = [];
        let categoryName = '';
        try {
            const getAccount = await getProfile(configId, profileId);
            const checkConfigSP = await getSPAccessToken(configId, profileId);
            const marketPlace = await marketPlaceConfigSchema.findOne({ countryCode: getAccount.countryCode }).lean();
            const marketplaceId = getAccount?.marketplaceStringId;
            const endpoint = marketPlace?.endPoint;
            const spToken = checkConfigSP?.spAccessToken;

            // Get category name from product
            categoryName = product.classificationName || '';

            // Build search keywords from title (reuse existing helper)
            const titleKeywords = extractTitleKeywords(currentTitle.toLowerCase().replace(currentBrand.toLowerCase(), ''));
            const searchKw = titleKeywords.slice(0, 5).join(','); // top 5 keywords

            if (searchKw && spToken) {
                const searchUrl = `${endpoint}/catalog/2022-04-01/items?marketplaceIds=${marketplaceId}&includedData=summaries,attributes&keywords=${encodeURIComponent(searchKw)}&pageSize=10`;
                const searchRes = await retryWithBackoff(() => amazonAxios({
                    method: 'GET', url: searchUrl,
                    headers: { 'x-amz-access-token': spToken },
                    meta: { configId, tokenKey: 'spAccessToken', sp: true, profileId }
                }));

                if (searchRes?.status === 200 && searchRes.data?.items?.length) {
                    // Filter out own ASIN, normalize, take top 5
                    const competitorAsins = searchRes.data.items
                        .filter(i => i.asin !== product.asin)
                        .slice(0, 5)
                        .map(i => i.asin);

                    if (competitorAsins.length > 0) {
                        const priceMap = await fetchPricing(competitorAsins, marketPlace, spToken, configId);
                        competitorPrices = competitorAsins
                            .filter(a => priceMap[a]?.amount)
                            .map(a => ({
                                asin: a,
                                price: priceMap[a].amount,
                                currency: priceMap[a].currency
                            }));
                    }
                }
            }
        } catch (compErr) {
            write_logs({ message: `analyzeListingWithAI: Competitor fetch skipped: ${compErr.message} [body] ${JSON.stringify(req?.body)}`, log_type: 'warn' });
        }

        const productData = {
            // Core identity
            itemName: currentTitle,
            productType: product.productType,
            imageURL: product.imageURL,
            // Live content from Amazon (what AI will actually analyze and improve)
            currentBullets,
            currentDescription,
            currentKeywords,
            currentBrand,
            // Performance signals
            sellingPrice: product.sellingPrice,
            maximumRetailPrice: product.maximumRetailPrice,
            classificationRank: product.classificationRank,
            totalOrders: product.totalOrders || 0,
            salesPerDay: inventory?.salesPerDay || 0,
            daysLeft: inventory?.daysLeft || null,
            stockStatus: inventory?.status || null,
            fulfillmentType: inventory?.fulfillmentType || null,
            // Competitor data for accurate pricing
            competitorPrices,
            categoryName,
        };

        // ── Call AI (Gemini text + GPT-4o-mini image) ──────────
        const aiResult = await analyzeExistingListingWithGPT(productData, { analyzeContent, analyzeImage });

        // ── Inject real "current" values from live attributes ──
        // Gemini only generates the "optimized" fields — we fill
        // current from the source-of-truth (Amazon Catalog API data)
        if (aiResult.titleAnalysis) aiResult.titleAnalysis.current = currentTitle;
        if (aiResult.bulletAnalysis) aiResult.bulletAnalysis.current = currentBullets;
        if (aiResult.descriptionAnalysis) aiResult.descriptionAnalysis.current = currentDescription;
        if (aiResult.backendKeywordsAnalysis) aiResult.backendKeywordsAnalysis.current = currentKeywords;

        // ── Hard-enforce Amazon's 249-char backend keyword limit ──
        // Safety net in case Gemini exceeds the limit despite the prompt instruction
        if (aiResult.backendKeywordsAnalysis?.optimized) {
            let kw = aiResult.backendKeywordsAnalysis.optimized.trim();
            if (kw.length > 249) {
                // Trim at last space boundary within 249 chars (never cut a word in half)
                kw = kw.substring(0, 249).replace(/\s+\S*$/, '').trim();
                aiResult.backendKeywordsAnalysis.optimized = kw;
            }
        }


        // ── Persist AI result + checksum ───────────────────────
        await productListingSchema.findByIdAndUpdate(product._id, {
            aiOptimizationScore: aiResult.score,
            aiLastAnalyzedAt: new Date(),
            aiOptimizationStatus: 'analyzed',
            aiCachedResult: aiResult,
            aiAnalyzedChecksum: checksum,
        });

        write_logs({ message: `analyzeListingWithAI: SKU ${sku} scored ${aiResult.score} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });

        return res.status(200).json({ isSuccess: true, fromCache: false, data: { ...aiResult, relatedSkus } });


    } catch (error) {
        write_logs({ message: `analyzeListingWithAI: Error: ${error.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        let errorMessage = "AI analysis failed. Please try again later.";

        // Handle Gemini High Demand / Quota errors cleanly
        if (error.message?.includes("503") || error.message?.includes("high demand")) {
            errorMessage = "Our AI servers are currently experiencing high demand. Please try optimizing this listing again in a few minutes.";
        } else if (error.message?.includes("429") || error.message?.includes("quota")) {
            errorMessage = "AI rate limit exceeded. Please try again in a few moments.";
        } else if (error.message) {
            errorMessage = error.message; // fallback to original error
        }

        return res.status(203).json({ isSuccess: false, message: errorMessage });
    }
};

// ═══════════════════════════════════════════════════════════
// AI LISTING APPLY — Step 3 (Amazon PATCH)
// ═══════════════════════════════════════════════════════════
exports.applyListingOptimization = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, sku, title, bulletPoints, description, backendKeywords, applyToAllSkus } = req.body;

        if (!profileId || !sku) {
            return res.status(200).json({ isSuccess: false, message: "profileId and sku are required" });
        }

        const product = await productListingSchema.findOne({ configId, profileId, sku }).lean();
        if (!product) {
            return res.status(200).json({ isSuccess: false, message: "Product not found" });
        }

        const getAccount = await getProfile(configId, profileId);
        const checkConfigSP = await getSPAccessToken(configId, profileId);
        const marketPlace = await marketPlaceConfigSchema.findOne({ countryCode: getAccount.countryCode }).lean();
        const marketplaceId = getAccount?.marketplaceStringId;
        const endpoint = marketPlace?.endPoint;

        // Map country code to correct language tag to prevent silent rejection by Amazon Catalog
        const localeMap = {
            "US": "en_US", "IN": "en_IN", "GB": "en_GB", "UK": "en_GB",
            "CA": "en_CA", "AU": "en_AU", "DE": "de_DE", "FR": "fr_FR",
            "IT": "it_IT", "ES": "es_ES", "JP": "ja_JP", "MX": "es_MX",
            "BR": "pt_BR", "AE": "ar_AE", "SA": "ar_SA", "SG": "en_SG"
        };
        const languageTag = localeMap[getAccount.countryCode?.toUpperCase()] || "en_US";

        const patchBody = buildOptimizationPatchPayload({
            productType: product.productType,
            title,
            bulletPoints,
            description,
            backendKeywords,
            marketplaceId,
            languageTag
        });

        if (!patchBody.patches.length) {
            return res.status(200).json({ isSuccess: false, message: "Nothing to apply — no fields selected" });
        }

        // Determine target SKUs
        let targetProducts = [product];
        if (applyToAllSkus && product.asin) {
            const relatedListings = await productListingSchema.find({ configId, profileId, asin: product.asin }).lean();
            if (relatedListings.length > 0) {
                targetProducts = relatedListings;
            }
        }

        write_logs({ message: `applyListingOptimization: Applying ${patchBody.patches.length} patches to ${targetProducts.length} SKUs for ASIN ${product.asin} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });

        const results = [];
        let successCount = 0;

        for (const targetProduct of targetProducts) {
            const url = `${endpoint}/listings/2021-08-01/items/${checkConfigSP?.sellerId}/${targetProduct.sku}?includedData=issues&marketplaceIds=${marketplaceId}`;

            try {
                const response = await amazonAxios({
                    method: "PATCH",
                    url,
                    data: patchBody,
                    meta: { configId: checkConfigSP?.configId, profileId: product?.profileId, sp: true }
                });

                if (response.status === 200) {
                    const dbUpdate = { aiOptimizationStatus: 'applied', liveAttributesFetchedAt: null };
                    if (title) dbUpdate.itemName = title;
                    await productListingSchema.findByIdAndUpdate(targetProduct._id, dbUpdate);

                    successCount++;
                    results.push({ sku: targetProduct.sku, status: 'ACCEPTED', data: response.data });
                } else {
                    results.push({ sku: targetProduct.sku, status: 'FAILED', error: "API returned non-200" });
                }
            } catch (err) {
                write_logs({ message: `[applyListingOptimization Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                results.push({ sku: targetProduct.sku, status: 'ERROR', error: err.message });
            }
        }

        if (successCount > 0) {
            const msg = applyToAllSkus ? `Listing updated on Amazon successfully for ${successCount} SKUs!` : "Listing updated on Amazon successfully!";
            return res.status(200).json({ isSuccess: true, message: msg, results });
        } else {
            return res.status(200).json({ isSuccess: false, message: "Amazon API returned an error for all targeted SKUs", results });
        }

    } catch (error) {
        write_logs({ message: `applyListingOptimization: Error: ${error.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).json({ isSuccess: false, message: "An internal server error occurred" || "Failed to apply optimization" });
    }
};

const STOP_WORDS = new Set([
    // generic english
    "a", "an", "the", "and", "or", "for", "of", "in", "with", "by",
    "to", "from", "at", "on", "is", "are", "be", "as", "its", "it",
    "this", "that", "also", "our", "your", "my", "per", "each",
    // amazon listing noise
    "pack", "packs", "combo", "bundle", "set", "value", "buy",
    "free", "new", "best", "top", "premium", "pure", "natural",
    "organic", "certified", "original", "genuine",
    // units that pollute search
    "g", "gm", "gms", "kg", "ml", "l", "mg",
    "100", "200", "250", "500", "1000",
    // symbols / special chars
    "|", "-", "&", "+", "/", "%",
]);

const buildKeywords = (attributes, summary) => {
    const brandName = summary?.brand?.toLowerCase()?.trim() || "";

    const titleRaw = summary?.itemName || attr(attributes, "item_name") || "";
    const cleanedTitle = titleRaw.toLowerCase().replace(new RegExp(brandName, "gi"), "").trim();

    const splitParts = cleanedTitle.split(/\s[|-]\s/).map(part => part.trim()).filter(Boolean);
    const keywords = splitParts.slice(0, 2);

    return keywords.join(",");
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
        price: null, // merged after pricing call
    };
};

const filterByAttributes = (competitors, myProduct) => {
    const myForm = myProduct.form?.toLowerCase();
    const myUnit = myProduct.unitValue;
    const myUnitType = myProduct.unitType?.toLowerCase();
    const myBrand = myProduct.brand?.toLowerCase();

    return competitors.filter((item) => {
        // Filter out own brand
        if (myBrand && item.brand) {
            if (item.brand.toLowerCase() === myBrand) return false;
        }

        // if (myForm && item.form) {
        //     if (item.form.toLowerCase() !== myForm) return false;
        // }
        // if (myUnitType && item.unitType) {
        //     if (item.unitType.toLowerCase() !== myUnitType) return false;
        // }
        // if (myUnit && item.unitValue) {
        //     const lower = myUnit * 0.5;
        //     const upper = myUnit * 1.5;
        //     if (item.unitValue < lower || item.unitValue > upper) return false;
        // }
        return true;
    });
};

const fetchPricing = async (asins, marketplaceConfig, spAccessToken, configId, profileId) => {
    const priceMap = {};
    if (!asins.length) return priceMap;
    const url = `${marketplaceConfig.endPoint}/products/pricing/v0/competitivePrice?Asins=${asins?.join(",")}&ItemType=Asin&MarketplaceId=${marketplaceConfig.marketPlaceId}`;

    try {
        let config = { method: 'get', url, headers: { 'x-amz-access-token': spAccessToken }, meta: { configId, tokenKey: "spAccessToken", sp: true, profileId } };
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
        write_logs({ message: `[fetchPricing Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        console.error(`Pricing fetch failed [${asins.join(",")}]:`, err.message);
    }

    return priceMap;
};

const extractTitleKeywords = (title = "") => title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
const attr = (attributes, key) => attributes?.[key]?.[0]?.value ?? null;

exports.getListofCompetitorsProduct = async (req, res) => {
    try {
        const {
            profileId,
            asin,
            cursor = null,
            brandFilter = null,
        } = req.body;

        // ── Validate ──────────────────────────────────────────
        if (!profileId || !asin) {
            return res.status(400).send({
                isSuccess: false,
                message: "profileId and asin are required.",
            });
        }

        // ── Auth ──────────────────────────────────────────────
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();
        if (!profile) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile not found.",
            });
        }

        const checkConfigSP = await getSPAccessToken(profile.configId, profileId);
        if (!checkConfigSP?.spAccessToken) {
            return res.status(203).send({
                isSuccess: false,
                message: "Could not get SP access token.",
            });
        }

        const marketplaceConfig = await marketPlaceConfigSchema.findOne({
            marketPlaceId: profile.marketplaceStringId,
        }).lean();

        const token = checkConfigSP.spAccessToken;
        const headers = { "x-amz-access-token": token };
        const mktId = marketplaceConfig.marketPlaceId;
        const baseEP = marketplaceConfig.endPoint;

        // ── Step 1: Fetch MY product → extract filter attrs + keywords ──
        const url = `${baseEP}/catalog/2022-04-01/items/${asin}?marketplaceIds=${mktId}&includedData=summaries,attributes`
        let config = { method: 'get', url, headers, meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId } };
        const myProductRes = await retryWithBackoff(() => amazonAxios(config));

        if (myProductRes?.status !== 200) {
            return res.status(203).send({
                isSuccess: false,
                message: "Failed to fetch your product from Amazon.",
            });
        }

        const myAttrs = myProductRes.data.attributes ?? {};
        const mySummary = myProductRes.data.summaries?.[0] ?? {};
        const myProduct = {
            form: attr(myAttrs, "item_form"),
            unitValue: myAttrs?.unit_count?.[0]?.value ?? null,
            unitType: myAttrs?.unit_count?.[0]?.type?.value ?? null,
            brand: (attr(myAttrs, "brand") ?? mySummary?.brand)?.toLowerCase(),
        };
        const keywords = buildKeywords(myAttrs, mySummary);

        // ── Step 2: Search Amazon for competitors ─────────────
        let searchUrl = `${baseEP}/catalog/2022-04-01/items?marketplaceIds=${mktId}&includedData=summaries,attributes,salesRanks,images&keywords=${encodeURIComponent(keywords)}&pageSize=20`;

        if (brandFilter) searchUrl += `&brandNames=${encodeURIComponent(brandFilter)}`;
        if (cursor) searchUrl += `&pageToken=${encodeURIComponent(cursor)}`;

        let searchConfig = { method: 'get', url: searchUrl, headers, meta: { configId: profile?.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId } };
        const searchRes = await retryWithBackoff(() => amazonAxios(searchConfig));

        if (searchRes?.status !== 200) {
            return res.status(203).send({
                isSuccess: false,
                message: "Failed to search Amazon catalog.",
            });
        }

        const rawItems = searchRes.data.items ?? [];
        const nextCursor = searchRes.data.pagination?.nextToken ?? null;
        const totalResults = searchRes.data.numberOfResults ?? 0;
        const refinementBrands = searchRes.data.refinements?.brands ?? [];

        // ── Step 3: Normalize + remove own ASIN ──────────────
        let competitors = rawItems.map(normalizeItem).filter((item) => item.asin !== asin);

        // ── Step 4: Filter by matching product attributes ─────
        competitors = filterByAttributes(competitors, myProduct);

        // ── Step 5: Fetch + merge pricing inline ──────────────
        if (competitors.length > 0) {
            const priceMap = await fetchPricing(competitors.map((c) => c.asin), marketplaceConfig, token, profile?.configId, profile?.profileId);
            competitors = competitors.map((c) => ({ ...c, price: priceMap[c.asin] ?? null }));
        }

        // ── Step 6: Build brand list ──────────────────────────
        const ownBrand = myProduct?.brand;
        const brands = refinementBrands.filter(brand => brand?.brandName?.toLowerCase() !== ownBrand?.toLowerCase());

        // ── Respond ───────────────────────────────────────────
        return res.status(200).send({
            isSuccess: true,
            message: "Get list of competitors product successfully",
            data: {
                brands,
                lists: competitors,
                nextCursor,
                totalResults,
            },
        });

    } catch (error) {
        write_logs({ message: `[getListofCompetitorsProduct Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).send({
            isSuccess: false,
            message: "Something went wrong, please try again.",
            error: "An internal server error occurred",
        });
    }
};

exports.cronGenerateOrderListing = async (customStartDate = null, customEndDate = null, customProfileId = null) => {
    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronGenerateOrderListing (Bulk Report Mode)`,
        log_type: "info",
    });
    try {
        let pastSyncObj = null;
        let startDateParam = null;
        let endDateParam = null;
        let profileIdParam = null;
        let cronjobid = null;
        let recurring = true;

        if (customStartDate && typeof customStartDate === "object") {
            pastSyncObj = customStartDate;
            startDateParam = pastSyncObj.startDate;
            endDateParam = pastSyncObj.endDate;
            profileIdParam = pastSyncObj.profileId;
            cronjobid = pastSyncObj.cronjobid;
            recurring = pastSyncObj.recurring;
        } else {
            startDateParam = customStartDate;
            endDateParam = customEndDate;
            profileIdParam = customProfileId;
            if (customStartDate) recurring = false;
        }

        const targetProfileId = profileIdParam || pastSyncObj?.profileId || null;
        const targetConfigId = pastSyncObj?.configId || null;
        let profiles = await getActivePlanProfiles(targetProfileId ? Number(targetProfileId) : null, "sp", targetConfigId);

        const allowedProfiles = await getAllowedSyncProfiles("ORDERS_AND_FINANCE", "seller", recurring);
        profiles = profiles.filter((profile) =>
            allowedProfiles.some(item => item.profileId === Number(profile.profileId) && item.configId === String(profile.configId))
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
                message: `Cron Order Listing stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const promises = profiles.map((profile) =>
            limit(async () => {
                try {
                    if (global.updateTaskProgress) global.updateTaskProgress("OrderListing");
                    const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);
                    if (!checkSPConfig) {
                        return cron_logs({
                            message: `Account disconnected in order listing ${profile.configId}`,
                            log_type: "info",
                        });
                    }
                    const startDate = startDateParam || moment().tz(profile.timezone).subtract(7, "days").format("YYYY-MM-DD");
                    const endDate = endDateParam || moment().tz(profile.timezone).subtract(0, "days").format("YYYY-MM-DD");

                    const reportSpResponse = await generateSPReport(
                        profile.configId,
                        profile.profileId,
                        startDate,
                        endDate,
                        checkSPConfig,
                        recurring,
                        "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL"
                    );

                    if (recurring && reportSpResponse != "ERROR") {
                        const now = moment().tz(profile.timezone);
                        const currentDate = now.format("YYYY-MM-DD");
                        await cronJobHistorySchema.findOneAndUpdate(
                            {
                                configId: profile.configId,
                                profileId: profile.profileId,
                                cronName: "Order Listing",
                                historyDate: currentDate,
                            },
                            { $set: { status: "COMPLETED" } },
                            { upsert: true, new: true }
                        );
                    } else if (!recurring && cronjobid && reportSpResponse === "COMPLETED") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    } else if (!recurring && cronjobid && reportSpResponse === "ERROR") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: "FAILED" },
                            { new: true }
                        );
                    }

                    cron_logs({
                        message: `Bulk Order Report Response: ${reportSpResponse} for configId: ${profile.configId}, profileId: ${profile.profileId}`,
                        log_type: "info",
                    });
                } catch (profileErr) {
                    cron_logs({
                        message: `Error syncing order listing for profile ${profile.profileId} (config: ${profile.configId}): ${profileErr.stack || profileErr.message}`,
                        log_type: "error",
                    });
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "Order listing generated successfully via Bulk Report.",
            log_type: "info",
        });
    } catch (error) {
        return cron_logs({
            message: `Order listing err: ${error}`,
            log_type: "error",
        });
    }
};

const fetchOrderListing = async (profile, createdAfter, createdBefore, checkSPConfig) => {
    try {
        const { configId, profileId, marketplaceStringId } = profile;
        const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: marketplaceStringId }).lean();
        if (!marketplaceConfig) return "ERROR";

        const token = checkSPConfig?.spAccessToken;

        let nextToken = null;
        let hasMore = true;

        while (hasMore) {
            if (global.updateTaskProgress) global.updateTaskProgress("OrderListing");
            try {
                let url = "";
                url = `${marketplaceConfig.endPoint}/orders/2026-01-01/orders?includedData=BUYER,RECIPIENT,PROCEEDS,EXPENSE,PROMOTION,CANCELLATION,FULFILLMENT,PACKAGES,TAX,PAYMENT&createdAfter=${createdAfter}&createdBefore=${createdBefore}${nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : ""}`;

                const config = {
                    method: "get",
                    url,
                    headers: { "x-amz-access-token": token },
                    meta: { configId, tokenKey: "spAccessToken", sp: true, profileId }
                };


                const response = await retryWithBackoff(() => amazonAxios(config));
                if (response?.status !== 200) return "ERROR";

                const orders = response?.data?.orders || [];
                if (orders?.length > 0) {

                    const bulkOps = [];
                    for (const order of orders) {
                        const orderItems = order?.orderItems || [];
                        const totalQuantity = orderItems.reduce((sum, item) => sum + Number(item?.quantityOrdered || 0), 0);
                        const totalAmount = Number(order?.proceeds?.grandTotal?.amount || 0);
                        const currencyCode = order?.proceeds?.grandTotal?.currencyCode || orderItems?.[0]?.product?.price?.unitPrice?.currencyCode || "INR";

                        bulkOps.push({
                            updateOne: {
                                filter: {
                                    configId,
                                    profileId,
                                    orderId: order?.orderId
                                },
                                update: {
                                    $set: {
                                        configId,
                                        profileId,
                                        marketplaceId: order?.salesChannel?.marketplaceId,

                                        orderId: order?.orderId,
                                        orderStatus: order?.fulfillment?.fulfillmentStatus,
                                        orderCreatedTime: order?.createdTime,
                                        orderLastUpdatedTime: order?.lastUpdatedTime,

                                        salesChannel: {
                                            channelName: order?.salesChannel?.channelName,
                                            marketplaceName: order?.salesChannel?.marketplaceName
                                        },

                                        buyer: {
                                            buyerName: order?.buyer?.buyerName || "",
                                            buyerEmail: order?.buyer?.buyerEmail || ""
                                        },

                                        recipient: order?.recipient,

                                        fulfillment: {
                                            fulfillmentStatus: order?.fulfillment?.fulfillmentStatus,
                                            fulfilledBy: order?.fulfillment?.fulfilledBy,
                                            fulfillmentServiceLevel: order?.fulfillment?.fulfillmentServiceLevel
                                        },

                                        orderItems: orderItems.map((item) => ({
                                            orderItemId: item?.orderItemId,
                                            quantityOrdered: Number(item?.quantityOrdered || 0),
                                            product: {
                                                asin: item?.product?.asin,
                                                title: item?.product?.title,
                                                sellerSku: item?.product?.sellerSku,
                                                condition: item?.product?.condition?.conditionType,
                                                price: Number(item?.product?.price?.unitPrice?.amount || 0),
                                            },
                                            proceeds: {
                                                breakdowns: (item?.proceeds?.breakdowns || [])?.map((breakdown) => ({
                                                    subTotalAmount: Number(breakdown?.subtotal?.amount || 0),
                                                    subTotalType: breakdown?.type
                                                })),
                                                proceedsTotal: item?.proceeds?.proceedsTotal?.amount,
                                            },
                                        })),

                                        proceeds: {
                                            breakdowns: orderItems?.flatMap((item) => item?.proceeds?.breakdowns?.map((breakdown) => ({
                                                subTotalAmount: Number(breakdown?.subtotal?.amount || 0),
                                                subTotalType: breakdown?.type
                                            }))) || [],
                                            proceedsTotal: totalAmount
                                        },

                                        paymentMethod: order?.payment?.paymentExecutions?.[0]?.paymentMethod || "",

                                        totalQuantity,
                                        totalAmount,
                                        currencyCode
                                    }
                                },
                                upsert: true
                            }
                        });
                    }

                    if (bulkOps.length > 0) {
                        cron_logs({
                            message: `Inserted/Updated ${bulkOps.length} orders for profile ${profileId}`,
                            log_type: "info",
                        });
                        await parallelBulkWrite(orderDetailsModel, bulkOps);
                    }
                }

                nextToken = response?.data?.pagination?.nextToken ? `${response?.data?.pagination?.nextToken}`?.replace("=", "") : null;
                hasMore = !!nextToken;

                if (nextToken) await new Promise((resolve) => setTimeout(resolve, 5000));
            } catch (error) {
                const errDetails = error?.response?.data ? JSON.stringify(error.response.data) : "";
                cron_logs({
                    message: `fetchOrderListing inner err: ${error.message}. Details: ${errDetails}`,
                    log_type: "error",
                });
                return "ERROR";
            }
        }

        return "SUCCESS";
    } catch (error) {
        const errDetails = error?.response?.data ? JSON.stringify(error.response.data) : "";
        cron_logs({
            message: `fetchOrderListing err: ${error}. Details: ${errDetails}`,
            log_type: "error",
        });
        return "ERROR";
    }
}

const expandStatusFilter = (orderStatus) => {
    if (!orderStatus || !Array.isArray(orderStatus) || orderStatus.length === 0 || orderStatus.includes("All")) {
        return null;
    }

    const literalStrings = [];
    const regexPatterns = [];

    for (const status of orderStatus) {
        if (!status) continue;
        const sUpper = String(status).toUpperCase().trim();

        if (sUpper === "SHIPPED") {
            literalStrings.push(
                "SHIPPED", "Shipped", "shipped",
                "FULFILLED", "Fulfilled", "fulfilled",
                "SHIPPING", "Shipping", "shipping"
            );
            regexPatterns.push(/^SHIPPED\s*-/i, /^Shipped\s*-/i);
        } else if (sUpper === "PENDING") {
            literalStrings.push("PENDING", "Pending", "pending");
            regexPatterns.push(/^PENDING\s*-/i, /^Pending\s*-/i);
        } else if (sUpper === "UNSHIPPED") {
            literalStrings.push(
                "UNSHIPPED", "Unshipped", "unshipped",
                "UNFULFILLED", "Unfulfilled", "unfulfilled"
            );
        } else if (sUpper === "CANCELLED" || sUpper === "CANCELED") {
            literalStrings.push(
                "CANCELLED", "Cancelled", "cancelled",
                "CANCELED", "Canceled", "canceled"
            );
        } else if (sUpper === "PARTIALLY_SHIPPED") {
            literalStrings.push(
                "PARTIALLY_SHIPPED", "Partially_Shipped", "Partially Shipped", "partially_shipped"
            );
        } else if (sUpper === "UNFULFILLABLE") {
            literalStrings.push(
                "UNFULFILLABLE", "Unfulfillable", "unfulfillable"
            );
        } else if (sUpper === "PENDING_AVAILABILITY") {
            literalStrings.push(
                "PENDING_AVAILABILITY", "Pending_Availability", "Pending Availability", "pending_availability"
            );
        } else {
            literalStrings.push(
                sUpper,
                String(status).charAt(0).toUpperCase() + String(status).slice(1).toLowerCase(),
                String(status).toLowerCase(),
                String(status)
            );
        }
    }

    const matchConditions = [];
    if (literalStrings.length > 0) {
        matchConditions.push({ orderStatus: { $in: Array.from(new Set(literalStrings)) } });
    }
    for (const rx of regexPatterns) {
        matchConditions.push({ orderStatus: { $regex: rx } });
    }

    if (matchConditions.length === 1) return matchConditions[0];
    if (matchConditions.length > 1) return { $or: matchConditions };

    return null;
};

const expandFulfillmentFilter = (fulfilledByInput) => {
    if (!fulfilledByInput) return null;

    const list = Array.isArray(fulfilledByInput) ? fulfilledByInput : [fulfilledByInput];
    if (list.length === 0 || list.some(item => ["all", "ALL", "All"].includes(String(item).trim()))) {
        return null;
    }

    const matchedValues = [];

    for (const item of list) {
        if (!item) continue;
        const valUpper = String(item).toUpperCase().trim();

        if (valUpper === "AMAZON" || valUpper === "AFN" || valUpper === "FBA") {
            matchedValues.push("AMAZON", "AFN", "FBA", "Amazon", "amazon", "afn", "fba");
        } else if (valUpper === "MERCHANT" || valUpper === "MFN") {
            matchedValues.push("MERCHANT", "MFN", "Merchant", "merchant", "mfn");
        } else {
            matchedValues.push(
                valUpper,
                String(item).charAt(0).toUpperCase() + String(item).slice(1).toLowerCase(),
                String(item).toLowerCase()
            );
        }
    }

    if (matchedValues.length === 0) return null;

    const uniqueSet = Array.from(new Set(matchedValues));

    return {
        $or: [
            { "fulfillment.fulfilledBy": { $in: uniqueSet } },
            { fulfillmentChannel: { $in: uniqueSet } }
        ]
    };
};

exports.getAllOrders = async (req, res) => {
    const configId = req?.config?.configId;

    try {
        let {
            profileId,
            pageNo = 1,
            perPage = 10,
            search,
            orderStatus = [],
            fulfilledBy = [],
            fromDate,
            toDate,
            sortType,
            fieldName
        } = req.body;

        pageNo = Number(pageNo);
        perPage = Number(perPage);

        if (!profileId) {
            return res.status(200).send({ isSuccess: false, message: "Profile id required!" });
        }

        const profile = await getProfile(configId, Number(profileId));
        if (!profile) {
            return res.status(200).send({ isSuccess: false, message: "Profile not found or not active!" });
        }

        const statusQuery = expandStatusFilter(orderStatus);
        const fulfillmentQuery = expandFulfillmentFilter(fulfilledBy);

        const filterConditions = [
            { configId, profileId: Number(profileId) },
            ...(fromDate && toDate ? [{
                orderCreatedTime: {
                    $gte: moment.tz(fromDate, profile?.timezone).startOf("day").toDate(),
                    $lte: moment.tz(toDate, profile?.timezone).endOf("day").toDate()
                }
            }] : []),
            ...(statusQuery ? [statusQuery] : []),
            ...(fulfillmentQuery ? [fulfillmentQuery] : [])
        ];

        const filter = filterConditions.length > 1 ? { $and: filterConditions } : filterConditions[0];

        const pipeline = [
            { $match: filter },
            ...(search ? [
                {
                    $match: {
                        $or: [
                            { orderId: { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "buyer.buyerEmail": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.asin": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.sellerSku": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.title": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.orderItemId": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } }
                        ]
                    }
                }
            ] : []),
            {
                $lookup: {
                    from: "productlistings",
                    let: { orderItems: "$orderItems", profileId: "$profileId", configId: "$configId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$profileId", "$$profileId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $in: ["$asin", { $map: { input: "$$orderItems", as: "item", in: "$$item.product.asin" } }] },
                                        { $in: ["$sku", { $map: { input: "$$orderItems", as: "item", in: "$$item.product.sellerSku" } }] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 0, asin: 1, sku: 1, itemName: 1, imageURL: 1, sellingPrice: 1, productType: 1 } }
                    ],
                    as: "productListingData"
                }
            },
            {
                $addFields: {
                    orderItems: {
                        $map: {
                            input: "$orderItems",
                            as: "item",
                            in: {
                                $mergeObjects: [
                                    "$$item",
                                    {
                                        productData: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$productListingData",
                                                        as: "product",
                                                        cond: { $and: [{ $eq: ["$$product.asin", "$$item.product.asin"] }, { $eq: ["$$product.sku", "$$item.product.sellerSku"] }] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            { $project: { productListingData: 0 } },
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$amazonOrderId", "$$orderId"] }, { $eq: ["$configId", "$$configId"] }, { $eq: ["$profileId", "$$profileId"] }, { $eq: ["$transactionType", "Refund"] }] } } },
                        { $project: { _id: 0, amazonOrderId: 1, currencyCode: 1, totalProductCharges: 1 } },
                        { $limit: 1 }
                    ],
                    as: "refundData"
                }
            },
            { $addFields: { isRefunded: { $gt: [{ $size: "$refundData" }, 0] }, refundData: { $arrayElemAt: ["$refundData", 0] } } },
            {
                $project: {
                    _id: 0,

                    orderId: 1,
                    orderStatus: 1,

                    orderCreatedTime: 1,
                    orderLastUpdatedTime: 1,

                    paymentMethod: 1,

                    totalQuantity: 1,
                    totalAmount: 1,
                    currencyCode: 1,

                    salesChannel: 1,
                    buyer: 1,
                    recipient: 1,
                    fulfillment: 1,

                    orderItems: 1,
                    proceeds: 1,

                    isRefunded: 1,
                    refundData: 1,

                    createdAt: 1,
                    updatedAt: 1
                }
            },
            ...(sortType && fieldName
                ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }]
                : [{ $sort: { orderCreatedTime: -1 } }]
            ),
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (pageNo - 1) * perPage }, { $limit: perPage }]
                }
            }
        ];

        const result = await orderDetailsModel.aggregate(pipeline);

        const totalRecords = result?.[0]?.metadata?.[0]?.total || 0;
        const data = result?.[0]?.data || [];

        const orderStatusList = await orderDetailsModel.distinct("orderStatus", { configId, profileId: Number(profileId) });

        return res.status(200).send({
            isSuccess: true,
            data,
            orderStatusList,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage)
        });

    } catch (error) {
        write_logs({ message: `[getAllOrders Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};

exports.getOrderReport = async (req, res) => {
    const configId = req?.config?.configId;

    try {
        let {
            profileId,
            pageNo = 1,
            perPage = 10,
            search,
            orderStatus = [],
            fulfilledBy = [],
            fromDate,
            toDate,
            sortType,
            fieldName
        } = req.body;

        pageNo = Number(pageNo);
        perPage = Number(perPage);

        if (!profileId) {
            return res.status(200).send({ isSuccess: false, message: "Profile id required!" });
        }

        const profile = await getProfile(configId, Number(profileId));
        if (!profile) {
            return res.status(200).send({ isSuccess: false, message: "Profile not found or not active!" });
        }

        const statusQuery = expandStatusFilter(orderStatus);
        const fulfillmentQuery = expandFulfillmentFilter(fulfilledBy);

        const filterConditions = [
            { configId, profileId: Number(profileId) },
            ...(fromDate && toDate ? [{
                orderCreatedTime: {
                    $gte: moment.tz(fromDate, profile?.timezone).startOf("day").toDate(),
                    $lte: moment.tz(toDate, profile?.timezone).endOf("day").toDate()
                }
            }] : []),
            ...(statusQuery ? [statusQuery] : []),
            ...(fulfillmentQuery ? [fulfillmentQuery] : [])
        ];

        const filter = filterConditions.length > 1 ? { $and: filterConditions } : filterConditions[0];

        const pipeline = [
            { $match: filter },
            { $unwind: "$orderItems" },
            ...(search ? [
                {
                    $match: {
                        $or: [
                            { "orderId": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.asin": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.sellerSku": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.title": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } }
                        ]
                    }
                }
            ] : []),
            {
                $group: {
                    _id: "$orderItems.product.sellerSku",
                    asin: { $first: "$orderItems.product.asin" },
                    title: { $first: "$orderItems.product.title" },
                    totalQty: { $sum: "$orderItems.quantityOrdered" },
                    ordersCount: { $addToSet: "$orderId" },
                    ordersList: {
                        $push: {
                            orderId: "$orderId",
                            orderCreatedTime: "$orderCreatedTime",
                            orderStatus: "$orderStatus",
                            quantityOrdered: "$orderItems.quantityOrdered",
                            price: "$orderItems.product.price",
                            buyerName: "$buyer.buyerName",
                            totalAmount: "$totalAmount",
                            currencyCode: "$currencyCode"
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    sku: "$_id",
                    asin: 1,
                    title: 1,
                    totalQty: 1,
                    ordersCount: { $size: "$ordersCount" },
                    ordersList: 1
                }
            },
            ...(sortType && fieldName
                ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }]
                : [{ $sort: { totalQty: -1 } }]
            ),
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (pageNo - 1) * perPage }, { $limit: perPage }]
                }
            }
        ];

        const result = await orderDetailsModel.aggregate(pipeline);
        const totalRecords = result?.[0]?.metadata?.[0]?.total || 0;
        const products = result?.[0]?.data || [];

        // Collect all unique SKUs in the returned products
        const skusArray = products.map(p => p.sku).filter(Boolean);

        // Fetch basePrice, sellingPrice, and imageURL from productlistings for these SKUs
        const listings = await productListingSchema.find({
            configId,
            profileId: Number(profileId),
            sku: { $in: skusArray }
        }).select("sku basePrice sellingPrice imageURL");

        const listingsMap = {};
        listings.forEach(listing => {
            listingsMap[listing.sku] = {
                basePrice: listing.basePrice || 0,
                sellingPrice: listing.sellingPrice || 0,
                imageURL: listing.imageURL || null
            };
        });

        // Fetch ad spent and ad orders for the products from SP, SD, and SB product ads
        const adSpendMap = {};
        const adOrdersMap = {};
        skusArray.forEach(sku => {
            adSpendMap[sku] = 0;
            adOrdersMap[sku] = 0;
        });

        if (skusArray.length > 0) {
            const matchQuery = {
                configId,
                profileId: Number(profileId),
                sku: { $in: skusArray },
                ...(fromDate && toDate && { reportDate: { $gte: fromDate, $lte: toDate } })
            };

            const [spSpend, sdSpend, sbSpend] = await Promise.all([
                productAdsSchema.aggregate([
                    { $match: matchQuery },
                    { $group: { _id: "$sku", totalSpend: { $sum: "$spend" }, totalOrders: { $sum: "$orders" } } }
                ]),
                sdProductAdsSchema.aggregate([
                    { $match: matchQuery },
                    { $group: { _id: "$sku", totalSpend: { $sum: "$spend" }, totalOrders: { $sum: "$orders" } } }
                ]),
                sbProductAdsSchema.aggregate([
                    { $match: matchQuery },
                    { $group: { _id: "$sku", totalSpend: { $sum: "$spend" }, totalOrders: { $sum: "$orders" } } }
                ])
            ]);

            spSpend.forEach(item => {
                if (item._id) {
                    adSpendMap[item._id] = (adSpendMap[item._id] || 0) + (item.totalSpend || 0);
                    adOrdersMap[item._id] = (adOrdersMap[item._id] || 0) + (item.totalOrders || 0);
                }
            });
            sdSpend.forEach(item => {
                if (item._id) {
                    adSpendMap[item._id] = (adSpendMap[item._id] || 0) + (item.totalSpend || 0);
                    adOrdersMap[item._id] = (adOrdersMap[item._id] || 0) + (item.totalOrders || 0);
                }
            });
            sbSpend.forEach(item => {
                if (item._id) {
                    adSpendMap[item._id] = (adSpendMap[item._id] || 0) + (item.totalSpend || 0);
                    adOrdersMap[item._id] = (adOrdersMap[item._id] || 0) + (item.totalOrders || 0);
                }
            });
        }

        // Enrich the products list
        const enrichedProducts = products.map(product => {
            const sku = product.sku;
            const listingInfo = listingsMap[sku] || { basePrice: 0, sellingPrice: 0, imageURL: null };

            const basePrice = listingInfo.basePrice;
            const sellingPrice = listingInfo.sellingPrice;

            const productCost = product.totalQty * basePrice;
            const totalSalesValue = product.totalQty * sellingPrice;
            const adSpent = adSpendMap[sku] || 0;
            const adOrders = adOrdersMap[sku] || 0;

            return {
                ...product,
                basePrice,
                productCost,
                sellingPrice,
                totalSalesValue,
                adSpent,
                adOrders,
                imageURL: listingInfo.imageURL || null
            };
        });

        const orderStatusList = await orderDetailsModel.distinct("orderStatus", { configId, profileId: Number(profileId) });

        const searchMatch = search ? {
            $or: [
                { orderId: { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                { "buyer.buyerEmail": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                { "orderItems.product.asin": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                { "orderItems.product.sellerSku": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                { "orderItems.product.title": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } }
            ]
        } : {};

        const ordersCountPipeline = [
            { $match: filter },
            ...(search ? [{ $match: searchMatch }] : []),
            { $count: "count" }
        ];
        const ordersCountResult = await orderDetailsModel.aggregate(ordersCountPipeline);
        const totalOrders = ordersCountResult?.[0]?.count || 0;

        // Calculate globalCost and globalSales across all pages matching the active filter
        const summaryPipeline = [
            { $match: filter },
            { $unwind: "$orderItems" },
            ...(search ? [
                {
                    $match: {
                        $or: [
                            { "orderId": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.asin": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.sellerSku": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } },
                            { "orderItems.product.title": { $regex: new RegExp(RegExp.escape(search?.trim()), "i") } }
                        ]
                    }
                }
            ] : []),
            {
                $group: {
                    _id: "$orderItems.product.sellerSku",
                    totalQty: { $sum: "$orderItems.quantityOrdered" }
                }
            }
        ];
        const allGroupedSKUs = await orderDetailsModel.aggregate(summaryPipeline);
        const allSkusArray = allGroupedSKUs.map(g => g._id).filter(Boolean);

        const allListings = await productListingSchema.find({
            configId,
            profileId: Number(profileId),
            sku: { $in: allSkusArray }
        }).select("sku basePrice sellingPrice");

        const allListingsMap = {};
        allListings.forEach(listing => {
            allListingsMap[listing.sku] = {
                basePrice: listing.basePrice || 0,
                sellingPrice: listing.sellingPrice || 0
            };
        });

        let globalCost = 0;
        let globalSales = 0;
        allGroupedSKUs.forEach(g => {
            const pricing = allListingsMap[g._id] || { basePrice: 0, sellingPrice: 0 };
            globalCost += g.totalQty * pricing.basePrice;
            globalSales += g.totalQty * pricing.sellingPrice;
        });

        let globalAdSpent = 0;
        let globalAdOrders = 0;
        if (allSkusArray.length > 0) {
            const globalMatchQuery = {
                configId,
                profileId: Number(profileId),
                sku: { $in: allSkusArray },
                ...(fromDate && toDate && { reportDate: { $gte: fromDate, $lte: toDate } })
            };

            const [spGlobalSpend, sdGlobalSpend, sbGlobalSpend] = await Promise.all([
                productAdsSchema.aggregate([
                    { $match: globalMatchQuery },
                    { $group: { _id: null, totalSpend: { $sum: "$spend" }, totalOrders: { $sum: "$orders" } } }
                ]),
                sdProductAdsSchema.aggregate([
                    { $match: globalMatchQuery },
                    { $group: { _id: null, totalSpend: { $sum: "$spend" }, totalOrders: { $sum: "$orders" } } }
                ]),
                sbProductAdsSchema.aggregate([
                    { $match: globalMatchQuery },
                    { $group: { _id: null, totalSpend: { $sum: "$spend" }, totalOrders: { $sum: "$orders" } } }
                ])
            ]);

            const spSpendTotal = spGlobalSpend[0]?.totalSpend || 0;
            const sdSpendTotal = sdGlobalSpend[0]?.totalSpend || 0;
            const sbSpendTotal = sbGlobalSpend[0]?.totalSpend || 0;
            globalAdSpent = spSpendTotal + sdSpendTotal + sbSpendTotal;

            const spOrdersTotal = spGlobalSpend[0]?.totalOrders || 0;
            const sdOrdersTotal = sdGlobalSpend[0]?.totalOrders || 0;
            const sbOrdersTotal = sbGlobalSpend[0]?.totalOrders || 0;
            globalAdOrders = spOrdersTotal + sdOrdersTotal + sbOrdersTotal;
        }

        return res.status(200).send({
            isSuccess: true,
            data: enrichedProducts,
            orderStatusList,
            currentPageNo: pageNo,
            totalRecords,
            totalOrders,
            globalCost,
            globalSales,
            globalAdSpent,
            globalAdOrders,
            totalPages: Math.ceil(totalRecords / perPage)
        });

    } catch (error) {
        write_logs({ message: `[getOrderReport Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};

exports.getStateWiseOrderCount = async (req, res) => {
    const configId = req?.config?.configId;

    try {
        let {
            profileId,
            fromDate,
            toDate,
            state,
            district
        } = req.body;

        if (!profileId) {
            return res.status(200).send({ isSuccess: false, message: "Profile id required!" });
        }

        const profile = await getProfile(configId, Number(profileId));
        if (!profile) {
            return res.status(200).send({ isSuccess: false, message: "Profile not found or not active!" });
        }

        const filter = {
            configId,
            profileId: Number(profileId),
            "recipient.deliveryAddress": { $exists: true },
            ...(fromDate && toDate && {
                orderCreatedTime: {
                    $gte: moment.tz(fromDate, profile?.timezone).startOf("day").toDate(),
                    $lte: moment.tz(toDate, profile?.timezone).endOf("day").toDate()
                }
            })
        };

        const orders = await orderDetailsModel.find(filter).select("recipient.deliveryAddress.postalCode recipient.deliveryAddress.stateOrRegion recipient.deliveryAddress.city recipient.deliveryAddress.districtOrCounty");
        const pincodes = [...new Set(orders.map(o => o.recipient?.deliveryAddress?.postalCode?.trim()).filter(Boolean))];

        const cacheMap = {};
        if (pincodes.length > 0) {
            const cachedMappings = await postalCodeStateModel.find({ pincode: { $in: pincodes } });
            cachedMappings.forEach(item => {
                if (item.pincode && item.state && item.district) {
                    cacheMap[item.pincode] = { state: item.state, city: item.city || "", district: item.district };
                }
            });

            const missingPincodes = pincodes.filter(p => !cacheMap[p]);
            if (missingPincodes.length > 0) {
                const requestLimit = pLimit(5);
                await Promise.all(missingPincodes.map(pincode => requestLimit(async () => {
                    try {
                        const res = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`, { timeout: 5000 });
                        if (res.status === 200 && Array.isArray(res.data) && res.data[0]?.Status === "Success") {
                            const postOffices = res.data[0].PostOffice;
                            if (Array.isArray(postOffices) && postOffices.length > 0 && postOffices[0].State) {
                                const state = postOffices[0].State;
                                const district = postOffices[0].District || "";
                                const city = postOffices[0].Division || postOffices[0].Block || district || "";
                                await postalCodeStateModel.updateOne(
                                    { pincode },
                                    { $set: { pincode, state, city, district } },
                                    { upsert: true }
                                );
                                cacheMap[pincode] = { state, city, district };
                                return;
                            }
                        }

                        const sampleOrder = orders.find(o => o.recipient?.deliveryAddress?.postalCode?.trim() === pincode);
                        const fallbackState = sampleOrder?.recipient?.deliveryAddress?.stateOrRegion || "Unknown";
                        const fallbackCity = sampleOrder?.recipient?.deliveryAddress?.city || "";
                        const fallbackDistrict = sampleOrder?.recipient?.deliveryAddress?.districtOrCounty || "";
                        await postalCodeStateModel.updateOne(
                            { pincode },
                            { $set: { pincode, state: fallbackState, city: fallbackCity, district: fallbackDistrict } },
                            { upsert: true }
                        );
                        cacheMap[pincode] = { state: fallbackState, city: fallbackCity, district: fallbackDistrict };
                    } catch (error) {
                        write_logs({ message: `[getStateWiseOrderCount Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
                        console.error(`Error resolving state for pincode ${pincode}:`, error.message);
                    }
                })));
            }
        }

        const locationCounts = {};
        orders.forEach(order => {
            const pincode = order.recipient?.deliveryAddress?.postalCode?.trim();
            const cached = cacheMap[pincode];
            let resolvedState = cached?.state || order.recipient?.deliveryAddress?.stateOrRegion || "Unknown";
            let resolvedDistrict = cached?.district || order.recipient?.deliveryAddress?.districtOrCounty || "Unknown";

            let resolvedCity = cached?.city || order.recipient?.deliveryAddress?.city || "Unknown";

            let normalizedState = resolvedState.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            let normalizedDistrict = resolvedDistrict.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            let normalizedCity = resolvedCity.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

            if (state && state.trim() && normalizedState.toLowerCase() !== state.trim().toLowerCase()) {
                return;
            }
            if (district && district.trim() && normalizedDistrict.toLowerCase() !== district.trim().toLowerCase()) {
                return;
            }

            const key = `${normalizedCity}|${normalizedDistrict}|${normalizedState}`;
            if (!locationCounts[key]) {
                locationCounts[key] = {
                    state: normalizedState,
                    district: normalizedDistrict,
                    city: normalizedCity,
                    order: 0
                };
            }
            locationCounts[key].order += 1;
        });

        const data = Object.values(locationCounts).sort((a, b) => b.order - a.order);

        return res.status(200).send({
            isSuccess: true,
            data
        });

    } catch (error) {
        write_logs({ message: `[getStateWiseOrderCount Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};
