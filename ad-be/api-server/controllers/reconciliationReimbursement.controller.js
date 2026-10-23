const moment = require("moment");
const { retryWithBackoff } = require("../helper/retryHelper");

const fs = require("fs");
const path = require("path");
const { chain } = require("stream-chain");
const csv = require("csv-parser");

const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT) || 5);

const reimbursementSchema = require("../models/reimbursement.model");
const inboundPlanSchema = require("../models/inboundPlan.model");
const shipmentQueueSchema = require("../models/shipmentQueue.model");
const shipmentQueueItemSchema = require("../models/shipmentQueueItem.model");
const spProfileSettingSchema = require("../models/spProfileSetting.model");
const adNotificationSchema = require("../models/adNotification.model");

const cronJobHistorySchema = require("../models/cronJobHistory.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const reportsSchema = require("../models/report.model");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { getActivePlanProfiles, getSPAccessToken, parallelBulkWrite, getRuleDate, downloadFile, unzipReport, getAllowedSyncProfiles, wait } = require("../helper/common");
const amazonAxios = require("../helper/amazonAxios");
const { sendNotificationToUser } = require("../helper/sendNotification");
const { logAudit } = require("../helpers/auditHelper");
const { write_logs } = require("../../winston/utility/logger");

function mapReimbursementType(reason) {

    if (!reason) {
        return "UNKNOWN";
    }

    const value = reason.toUpperCase();

    if (value.includes("CUSTOMER")) {
        return "CUSTOMER_RETURN";
    }

    if (value.includes("DAMAGED")) {
        return "WAREHOUSE_DAMAGE";
    }

    if (value.includes("INBOUND")) {
        return "LOST_INBOUND";
    }

    if (value.includes("OUTBOUND")) {
        return "LOST_OUTBOUND";
    }

    return "UNKNOWN";
}

exports.cronGenerateReimbursementReport = async (customStartDate = null, customEndDate = null) => {

    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronGenerateReimbursementReport`,
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
        profiles = profiles.filter(p =>
            allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
        );

        if (targetProfileId) {
            profiles = profiles.filter(p => String(p.profileId) === String(targetProfileId) && String(p.configId) === String(targetConfigId));
        }

        if (!profiles || profiles.length === 0) {
            if (cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "FAILED" },
                    { new: true }
                );
            }
            return cron_logs({
                message: `Cron Reimbursement Report stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const promises = profiles.map((profile) =>
            limit(async () => {
                if (global.updateTaskProgress) global.updateTaskProgress("Reimbursement Report");
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
                            cronName: "Reimbursement Report",
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
                    const defaultDates = getRuleDate(profile.timezone, "THIS_MONTH");
                    startDate = defaultDates.fromDate;
                    endDate = defaultDates.toDate;
                }

                const reportSpResponse = await generateReimbursementSPReport(
                    profile,
                    startDate,
                    endDate,
                    checkSPConfig,
                    recurring
                );

                if (recurring && getCronData?._id && reportSpResponse !== "ERROR") {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        getCronData._id,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                } else if (!recurring && cronjobid && reportSpResponse === "COMPLETED") {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "Reimbursement reports generated successfully.",
            log_type: "info",
        });

    } catch (error) {

        return cron_logs({
            message: `Reimbursement report err: ${error}`,
            log_type: "error",
        });
    }
};

async function generateReimbursementSPReport(profile, startDate, endDate, token, recurring = true) {
    let existing = null;
    if (recurring) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        existing = await reportsSchema.findOne({
            profileId: profile.profileId,
            configId: profile.configId,
            reportTypeId: "REIMBURSEMENT",
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
            reportTypeId: "REIMBURSEMENT"
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
                reportType: "GET_FBA_REIMBURSEMENTS_DATA",
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
            reportTypeId: "REIMBURSEMENT",
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

    const zipPath = path.resolve(__dirname, "../../uploads/reimbursements", `${existing.reportId}.txt`);

    await downloadFile(docRes.data.url, zipPath);

    await processReimbursementReportStream(reimbursementSchema, zipPath, { profileId: profile.profileId, configId: profile.configId });

    await reportsSchema.updateOne({ _id: existing._id }, { $set: { status: "COMPLETED" } });

    return "COMPLETED";
}

const processReimbursementReportStream = async (schema, filePath, { profileId, configId }) => {
    const BULK_SIZE = Number(process.env.BATCH || 500);

    return new Promise((resolve, reject) => {

        const pipeline = chain([fs.createReadStream(filePath), csv({ separator: "\t" })]);

        let bulkOps = [];

        pipeline.on("data", async (row) => {
            pipeline.pause();

            const reimbursementType = mapReimbursementType(row["reason"]);

            bulkOps.push({
                updateOne: {
                    filter: {
                        configId,
                        profileId,
                        reimbursementId: row["reimbursement-id"]
                    },
                    update: {
                        $set: {
                            configId,
                            profileId,

                            reimbursementId: row["reimbursement-id"],
                            caseId: row["case-id"] || null,
                            amazonOrderId: row["amazon-order-id"] || null,
                            approvalDate: row["approval-date"] ? new Date(row["approval-date"]) : null,
                            reason: row["reason"],
                            sku: row["sku"],
                            fnsku: row["fnsku"],
                            asin: row["asin"],
                            productName: row["product-name"],
                            condition: row["condition"],
                            currencyUnit: row["currency-unit"],
                            amountPerUnit: Number(row["amount-per-unit"] || 0),
                            amountTotal: Number(row["amount-total"] || 0),
                            quantityReimbursedCash: Number(row["quantity-reimbursed-cash"] || 0),
                            quantityReimbursedInventory: Number(row["quantity-reimbursed-inventory"] || 0),
                            quantityReimbursedTotal: Number(row["quantity-reimbursed-total"] || 0),
                            originalReimbursementId: row["original-reimbursement-id"] || null,
                            originalReimbursementType: row["original-reimbursement-type"] || null,
                            reimbursementType,
                            reimbursementStatus: Number(row["quantity-reimbursed-total"] || 0) > 0 ? "REIMBURSED" : "PENDING"
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

exports.cronGenerateShipmentQueueReport = async (customStartDate = null) => {

    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronGenerateShipmentQueueReport`,
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
        const allowedProfiles = await getAllowedSyncProfiles("ORDERS_AND_FINANCE", "seller", recurring);
        profiles = profiles.filter(p =>
            allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
        );

        if (targetProfileId) {
            profiles = profiles.filter((p) => String(p.profileId) === String(targetProfileId));
        }
        if (targetConfigId) {
            profiles = profiles.filter((p) => String(p.configId) === String(targetConfigId));
        }

        if (!profiles || profiles.length === 0) {
            if (cronjobid) {
                await cronJobHistorySchema.findByIdAndUpdate(
                    cronjobid,
                    { status: "FAILED" },
                    { new: true }
                );
            }
            return cron_logs({
                message: `Cron Shipment Queue Report stopped: No active profiles found with matching permissions for configId: ${targetConfigId || 'any'}, profileId: ${targetProfileId || 'any'}.`,
                log_type: "warn"
            });
        }

        const promises = profiles.map((profile) =>
            limit(async () => {
                if (global.updateTaskProgress) global.updateTaskProgress("Shipment Queue Report");
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
                            cronName: "Shipment Queue",
                            historyDate: currentDate
                        },
                        { $set: { status: "PENDING" } },
                        { upsert: true, new: true }
                    ).lean();
                }

                await generateShipmentQueueReport(profile, checkSPConfig);
                await generateShipmentInboundReport(profile, checkSPConfig);

                if (recurring && getCronData?._id) {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        getCronData._id,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                } else if (!recurring && cronjobid) {
                    await cronJobHistorySchema.findByIdAndUpdate(
                        cronjobid,
                        { status: "COMPLETED" },
                        { new: true }
                    );
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "Shipment queue synced successfully.",
            log_type: "info",
        });

    } catch (error) {
        return cron_logs({
            message: `Shipment queue err: ${error}`,
            log_type: "error",
        });
    }
};

async function generateShipmentQueueReport(profile, token) {

    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();

    // =========================================================
    // GET SHIPMENTS
    // =========================================================

    let shipments = [];
    let nextToken = null;
    do {

        const response = await retryWithBackoff(() => amazonAxios({
            method: "GET",
            url: `${marketPlaceConfig.endPoint}/fba/inbound/v0/shipments`,
            headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json" },
            params: nextToken
                ? { MarketplaceId: profile.marketplaceStringId, NextToken: nextToken }
                : {
                    MarketplaceId: profile.marketplaceStringId,
                    QueryType: "DATE_RANGE",
                    LastUpdatedAfter: moment().subtract(90, "days").toISOString(),
                    LastUpdatedBefore: moment().toISOString(),
                    ShipmentStatusList: "WORKING,READY_TO_SHIP,SHIPPED,RECEIVING,CANCELLED,DELETED,CLOSED,ERROR,IN_TRANSIT,DELIVERED,CHECKED_IN"
                },
            meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
        }));

        shipments.push(...(response?.data?.payload?.ShipmentData || []));
        nextToken = response?.data?.nextToken;
    } while (nextToken);

    // =========================================================
    // STORE SHIPMENTS
    // =========================================================

    const shipmentBulkOps = [];
    for (const shipment of shipments) {

        let shipmentCreatedAt = new Date();

        const shipmentName = shipment?.ShipmentName || "";
        const match = shipmentName.match(/\((\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2})\)/);
        if (match) {
            const [, day, month, year, hour, minute] = match;
            shipmentCreatedAt = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
        }

        shipmentBulkOps.push({
            updateOne: {
                filter: {
                    configId: profile.configId,
                    profileId: profile.profileId,
                    shipmentId: shipment.ShipmentId
                },
                update: {
                    $set: {
                        configId: profile.configId,
                        profileId: profile.profileId,

                        shipmentId: shipment?.ShipmentId,
                        shipmentName: shipment?.ShipmentName,
                        shipmentCreatedAt,
                        shipmentStatus: shipment?.ShipmentStatus,
                        destinationFulfillmentCenterId: shipment?.DestinationFulfillmentCenterId,
                        labelPrepType: shipment?.LabelPrepType,
                        boxContentsSource: shipment?.BoxContentsSource,
                        shipFromAddress: {
                            name: shipment?.ShipFromAddress?.Name,
                            addressLine1: shipment?.ShipFromAddress?.AddressLine1,
                            addressLine2: shipment?.ShipFromAddress?.AddressLine2,
                            city: shipment?.ShipFromAddress?.City,
                            stateOrProvinceCode: shipment?.ShipFromAddress?.StateOrProvinceCode,
                            countryCode: shipment?.ShipFromAddress?.CountryCode,
                            postalCode: shipment?.ShipFromAddress?.PostalCode
                        }
                    }
                },
                upsert: true
            }
        });
    }

    await parallelBulkWrite(shipmentQueueSchema, shipmentBulkOps);

    // =========================================================
    // GET & STORE SHIPMENT ITEMS
    // =========================================================

    for (const shipment of shipments) {
        try {
            // If shipment is terminal (CLOSED, CANCELLED, DELETED) and items are already in DB, skip redundant API calls
            if (["CLOSED", "CANCELLED", "DELETED"].includes(shipment?.ShipmentStatus)) {
                const alreadySaved = await shipmentQueueItemSchema.exists({
                    configId: profile.configId,
                    profileId: profile.profileId,
                    shipmentId: shipment?.ShipmentId
                });
                if (alreadySaved) {
                    continue;
                }
            }

            await wait(300);
            let items = [];
            let nextItemToken = null;
            do {
                const itemResponse = await retryWithBackoff(() => amazonAxios({
                    method: "GET",
                    url: `${marketPlaceConfig.endPoint}/fba/inbound/v0/shipments/${shipment.ShipmentId}/items`,
                    headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json" },
                    params: nextItemToken ? { MarketplaceId: profile.marketplaceStringId, NextToken: nextItemToken } : { MarketplaceId: profile.marketplaceStringId },
                    meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
                }));

                items.push(...(itemResponse?.data?.payload?.ItemData || []));
                nextItemToken = itemResponse?.data?.nextToken;
                if (nextItemToken) await wait(300);
            } while (nextItemToken);

            const itemBulkOps = [];
            for (const item of items) {
                itemBulkOps.push({
                    updateOne: {
                        filter: {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            shipmentId: item?.ShipmentId,
                            sellerSKU: item?.SellerSKU
                        },
                        update: {
                            $set: {
                                configId: profile.configId,
                                profileId: profile.profileId,

                                shipmentId: item?.ShipmentId,
                                sellerSKU: item?.SellerSKU,
                                fulfillmentNetworkSKU: item?.FulfillmentNetworkSKU,
                                quantityShipped: item?.QuantityShipped || 0,
                                quantityReceived: item?.QuantityReceived || 0,
                                quantityInCase: item?.QuantityInCase || 0,
                                prepDetailsList: item?.PrepDetailsList?.map((prep) => ({ prepInstruction: prep?.PrepInstruction, prepOwner: prep?.PrepOwner })) || []
                            }
                        },
                        upsert: true
                    }
                });
            }

            if (itemBulkOps.length) {
                await parallelBulkWrite(shipmentQueueItemSchema, itemBulkOps);
            }
        } catch (itemErr) {
            cron_logs({
                message: `[Shipment Queue] Skipped items for shipment ${shipment?.ShipmentId || 'unknown'}: ${itemErr.message}`,
                log_type: "warn"
            });
        }
    }

    return true;
}

async function generateShipmentInboundReport(profile, token) {

    const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId }).lean();

    const BASE_URL = marketPlaceConfig.endPoint;
    const headers = {
        "x-amz-access-token": token?.spAccessToken,
        "Content-Type": "application/json"
    };

    // =========================================================
    // STEP 1: GET ALL INBOUND PLANS (paginated)
    // =========================================================

    let allPlans = [];
    let nextToken = null;

    do {
        const response = await retryWithBackoff(() => amazonAxios({
            method: "GET",
            url: `${BASE_URL}/inbound/fba/2024-03-20/inboundPlans`,
            headers,
            params: nextToken ? { paginationToken: nextToken } : { pageSize: 30 },
            meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
        }));

        allPlans.push(...(response?.data?.inboundPlans || []));
        nextToken = response?.data?.pagination?.nextToken;

    } while (nextToken);

    // =========================================================
    // STEP 2: FOR EACH PLAN → GET PLAN DETAIL → GET SHIPMENTS
    // =========================================================

    const inboundPlanBulkOps = [];

    for (const plan of allPlans) {
        try {
            await wait(300);
            const planDetailRes = await retryWithBackoff(() => amazonAxios({
                method: "GET",
                url: `${BASE_URL}/inbound/fba/2024-03-20/inboundPlans/${plan.inboundPlanId}`,
                headers,
                meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
            }));

            const planDetail = planDetailRes?.data;
            const shipmentRefs = planDetail?.shipments || [];
            const placementOptions = planDetail?.placementOptions || [];

            // =========================================================
            // STEP 3: FOR EACH sh*** → GET SHIPMENT DETAIL → PUSH TO BULK
            // =========================================================

            for (const shipmentRef of shipmentRefs) {
                try {
                    await wait(300);
                    const shipmentDetailRes = await retryWithBackoff(() => amazonAxios({
                        method: "GET",
                        url: `${BASE_URL}/inbound/fba/2024-03-20/inboundPlans/${plan.inboundPlanId}/shipments/${shipmentRef.shipmentId}`,
                        headers,
                        meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId }
                    }));

                    const s = shipmentDetailRes?.data;

                    inboundPlanBulkOps.push({
                        updateOne: {
                            filter: {
                                configId: profile.configId,
                                profileId: profile.profileId,
                                inboundPlanId: plan.inboundPlanId,
                                v2ShipmentId: s?.shipmentId
                            },
                            update: {
                                $set: {
                                    configId: profile.configId,
                                    profileId: profile.profileId,

                                    inboundPlanId: plan.inboundPlanId,
                                    v2ShipmentId: s?.shipmentId,
                                    shipmentConfirmationId: s?.shipmentConfirmationId,
                                    amazonReferenceId: s?.amazonReferenceId,

                                    planName: plan.name,
                                    shipmentName: s?.name,

                                    planStatus: plan.status,
                                    shipmentStatus: s?.status,

                                    marketplaceIds: plan.marketplaceIds,

                                    planCreatedAt: plan.createdAt,
                                    planUpdatedAt: plan.lastUpdatedAt,

                                    sourceAddress: {
                                        name: s?.source?.address?.name,
                                        companyName: s?.source?.address?.companyName,
                                        addressLine1: s?.source?.address?.addressLine1,
                                        addressLine2: s?.source?.address?.addressLine2,
                                        city: s?.source?.address?.city,
                                        stateOrProvinceCode: s?.source?.address?.stateOrProvinceCode,
                                        countryCode: s?.source?.address?.countryCode,
                                        postalCode: s?.source?.address?.postalCode,
                                        phoneNumber: s?.source?.address?.phoneNumber,
                                        email: s?.source?.address?.email
                                    },

                                    destinationAddress: {
                                        name: s?.destination?.address?.name,
                                        addressLine1: s?.destination?.address?.addressLine1,
                                        addressLine2: s?.destination?.address?.addressLine2,
                                        city: s?.destination?.address?.city,
                                        stateOrProvinceCode: s?.destination?.address?.stateOrProvinceCode,
                                        countryCode: s?.destination?.address?.countryCode,
                                        postalCode: s?.destination?.address?.postalCode,
                                        warehouseId: s?.destination?.warehouseId
                                    },

                                    placementOptionIds: placementOptions.map(p => p.placementOptionId),
                                    selectedTransportationOptionId: s?.selectedTransportationOptionId
                                }
                            },
                            upsert: true
                        }
                    });
                } catch (shipErr) {
                    cron_logs({
                        message: `[Inbound Plan] Skipped shipment ${shipmentRef?.shipmentId} in plan ${plan.inboundPlanId}: ${shipErr.message}`,
                        log_type: "warn"
                    });
                }
            }
        } catch (planErr) {
            cron_logs({
                message: `[Inbound Plan] Skipped plan ${plan?.inboundPlanId}: ${planErr.message}`,
                log_type: "warn"
            });
        }
    }

    // =========================================================
    // STEP 4: FLUSH ALL AT ONCE
    // =========================================================

    if (inboundPlanBulkOps.length) {
        await parallelBulkWrite(inboundPlanSchema, inboundPlanBulkOps);
    }

    return true;
}

exports.getAllShippingQueue = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        let {
            profileId,
            pageNo = 1,
            perPage = 10,
            search,
            status,
            fromDate,
            toDate,
            sortType,
            fieldName
        } = req.body;

        pageNo = Number(pageNo);
        perPage = Number(perPage);

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const filter = {
            configId,
            profileId: Number(profileId),
            ...(status && status.length && { shipmentStatus: { $in: status } }),
            ...(fromDate && toDate && { shipmentCreatedAt: { $gte: new Date(fromDate), $lte: new Date(toDate) } })
        };

        const pipeline = [
            { $match: filter },
            ...(search ? [
                {
                    $match: {
                        $or: [
                            { shipmentId: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                            { shipmentName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                            { destinationFulfillmentCenterId: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }
                        ]
                    }
                }
            ] : []),
            {
                $lookup: {
                    from: "shipmentqueueitems",
                    let: { shipmentId: "$shipmentId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$shipmentId", "$$shipmentId"] }, { $eq: ["$configId", "$$configId"] }, { $eq: ["$profileId", "$$profileId"] }] } } }
                    ],
                    as: "items"
                }
            },
            {
                $addFields: {
                    totalShippedUnits: { $sum: "$items.quantityShipped" },
                    totalReceivedUnits: { $sum: "$items.quantityReceived" },
                    totalSkus: { $size: "$items" }
                }
            },
            {
                $project: {
                    _id: 0,
                    shipmentId: 1,
                    shipmentName: 1,
                    shipmentStatus: 1,
                    destinationFulfillmentCenterId: 1,
                    labelPrepType: 1,
                    boxContentsSource: 1,
                    shipFromAddress: 1,
                    totalShippedUnits: 1,
                    totalReceivedUnits: 1,
                    totalSkus: 1,
                    shipmentCreatedAt: 1,
                    createdAt: 1,
                    updatedAt: 1
                }
            },
            ...(sortType && fieldName
                ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }]
                : [{ $sort: { shipmentCreatedAt: -1 } }]
            ),
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (pageNo - 1) * perPage }, { $limit: perPage }]
                }
            }
        ];

        const result = await shipmentQueueSchema.aggregate(pipeline);

        const totalRecords = result?.[0]?.metadata?.[0]?.total || 0;
        const data = result?.[0]?.data || [];

        return res.status(200).send({
            isSuccess: true,
            data,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage)
        });

    } catch (error) {
        write_logs({ message: `[getAllShippingQueue Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};

exports.getShippingQueueDetails = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        const { shippingId } = req?.params;
        const { profileId } = req?.body;

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const shipment = await shipmentQueueSchema.aggregate([
            {
                $match: {
                    configId,
                    profileId: Number(profileId),
                    shipmentId: shippingId
                }
            },
            {
                $lookup: {
                    from: "shipmentqueueitems",
                    let: { shipmentId: "$shipmentId", profileId: "$profileId", configId: "$configId" },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$shipmentId", "$$shipmentId"] }, { $eq: ["$configId", "$$configId"] }, { $eq: ["$profileId", "$$profileId"] }] } } },
                        {
                            $lookup: {
                                from: "productlistings",
                                let: { sku: "$sellerSKU", profileId: "$$profileId", configId: "$$configId" },
                                pipeline: [
                                    { $match: { $expr: { $and: [{ $eq: ["$sku", "$$sku"] }, { $eq: ["$profileId", "$$profileId"] }, { $eq: ["$configId", "$$configId"] }] } } },
                                    { $sort: { updatedAt: -1 } },
                                    { $limit: 1 },
                                    { $project: { _id: 0, sku: 1, asin: 1, itemName: 1, imageURL: 1 } }
                                ],
                                as: "productData"
                            }
                        },
                        { $unwind: { path: "$productData", preserveNullAndEmptyArrays: true } },
                        { $addFields: { product: "$productData" } },
                        { $project: { productData: 0 } }
                    ],
                    as: "items"
                }
            },
            {
                $project: {
                    _id: 0,
                    shipmentId: 1,
                    shipmentName: 1,
                    shipmentStatus: 1,
                    destinationFulfillmentCenterId: 1,
                    labelPrepType: 1,
                    boxContentsSource: 1,
                    shipFromAddress: 1,
                    items: 1,
                    shipmentCreatedAt: 1,
                    createdAt: 1,
                    updatedAt: 1
                }
            }
        ]);

        return res.status(200).send({
            isSuccess: true,
            data: shipment?.[0] || {}
        });

    } catch (error) {
        write_logs({ message: `[getShippingQueueDetails Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};

exports.getReimbursement = async (req, res) => {

    const configId = req?.config?.configId;

    try {

        let {
            profileId,
            pageNo = 1,
            perPage = 10,
            search,
            status,
            reimbursementType,
            fromDate,
            toDate,
            sortType,
            fieldName
        } = req.body;

        pageNo = Number(pageNo);
        perPage = Number(perPage);

        if (!profileId) {
            return res.status(203).send({
                isSuccess: false,
                message: "Profile id required!"
            });
        }

        const filter = {
            configId,
            profileId: Number(profileId),
            ...(status && status?.length && { reason: { $in: status } }),
            ...(reimbursementType && { reimbursementType }),
            ...(fromDate && toDate && { approvalDate: { $gte: new Date(fromDate), $lte: new Date(toDate) } })
        };

        const pipeline = [
            { $match: filter },
            ...(search ? [
                {
                    $match: {
                        $or: [
                            { reimbursementId: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                            { amazonOrderId: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                            { sku: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                            { asin: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                            { productName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                            { reason: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }
                        ]
                    }
                }
            ] : []),
            {
                $lookup: {
                    from: "productlistings",
                    let: { sku: "$sku", asin: "$asin" },
                    pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$sku", "$$sku"] }, { $eq: ["$asin", "$$asin"] }] } } }],
                    as: "productData"
                }
            },
            { $unwind: { path: "$productData", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    reimbursementId: 1,
                    caseId: 1,
                    amazonOrderId: 1,
                    approvalDate: 1,
                    reason: 1,
                    sku: 1,
                    fnsku: 1,
                    asin: 1,
                    productName: 1,
                    condition: 1,
                    currencyUnit: 1,
                    amountPerUnit: 1,
                    amountTotal: 1,
                    quantityReimbursedCash: 1,
                    quantityReimbursedInventory: 1,
                    quantityReimbursedTotal: 1,
                    originalReimbursementId: 1,
                    originalReimbursementType: 1,
                    reimbursementType: 1,
                    reimbursementStatus: 1,
                    productData: {
                        asin: "$productData.asin",
                        sku: "$productData.sku",
                        itemName: "$productData.itemName",
                        imageURL: "$productData.imageURL"
                    },
                    createdAt: 1
                }
            },
            ...(sortType && fieldName
                ? [{ $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } }]
                : [{ $sort: { approvalDate: -1 } }]
            ),
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: (pageNo - 1) * perPage }, { $limit: perPage }]
                }
            }
        ];

        const result = await reimbursementSchema.aggregate(pipeline);

        const totalRecords = result?.[0]?.metadata?.[0]?.total || 0;
        const data = result?.[0]?.data || [];

        const reasonList = await reimbursementSchema.distinct("reason", { configId, profileId: Number(profileId) });

        return res.status(200).send({
            isSuccess: true,
            data,
            reasonList,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage)
        });

    } catch (error) {
        write_logs({ message: `[getReimbursement Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

        return res.status(203).send({
            isSuccess: false,
            message: "Something went wrong",
            error: "An internal server error occurred"
        });
    }
};

exports.getProfileSetting = async (req, res) => {
    try {
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const { profileId } = req?.body;
        if (!profileId) {
            return res.status(400).json({ isSuccess: false, message: "profileId is required" });
        }

        const setting = await spProfileSettingSchema.findOne({ profileId, ...(configId && { configId }) }).lean();

        return res.status(200).json({
            isSuccess: true,
            message: "Profile setting retrieved successfully",
            data: setting || null
        });
    } catch (error) {
        write_logs({ message: `[getProfileSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
};

exports.updateProfileSetting = async (req, res) => {
    try {
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const { profileId, isReconsilationNotification } = req.body;

        if (!profileId) {
            return res.status(400).json({ isSuccess: false, message: "profileId is required" });
        }

        await logAudit("REIMBURSEMENT_SETTINGS", `Reimbursement notification setting updated successfully.`, { ReconsilationNotification: isReconsilationNotification }, req?.user?.id);

        const setting = await spProfileSettingSchema.findOneAndUpdate(
            { profileId, ...(configId && { configId }) },
            {
                ...(configId && { configId }),
                ...(isReconsilationNotification !== undefined && { isReconsilationNotification })
            },
            { new: true, upsert: true }
        ).lean();

        return res.status(200).json({
            isSuccess: true,
            message: "Profile setting updated successfully",
            data: setting
        });
    } catch (error) {
        write_logs({ message: `[updateProfileSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({ isSuccess: false, message: "An internal server error occurred" });
    }
};

exports.cronReminderForReimbursement = async () => {

    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronReminderForReimbursement`,
        log_type: "info",
    });

    try {

        const profiles = await getActivePlanProfiles("ALL", "sp");

        const promises = profiles.map((profile) =>
            limit(async () => {

                try {
                    const setting = await spProfileSettingSchema.findOne({ configId: profile?.configId, profileId: profile?.profileId }).lean();
                    if (setting && !setting?.isReconsilationNotification) return;

                    const now = moment().tz(profile.timezone);
                    const currentDate = now.format("YYYY-MM-DD");

                    const getCronData = await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Reminder For Reimbursement",
                            historyDate: currentDate
                        },
                        { $set: { status: "PENDING" } },
                        { upsert: true, new: true }
                    ).lean();

                    // Last 60 Days Filter
                    const last60Days = moment().subtract(60, "days").startOf("day").toDate();

                    // Get Shipment Queue
                    const shipments = await shipmentQueueSchema.find({
                        configId: profile.configId,
                        profileId: profile.profileId,
                        shipmentStatus: "CLOSED",
                        shipmentCreatedAt: { $gte: last60Days }
                    }).lean();

                    const shipmentIds = shipments.map(s => s?.shipmentId);
                    if (!shipmentIds.length) return;

                    // Get Shipment Items
                    const shipmentItems = await shipmentQueueItemSchema.find({
                        configId: profile.configId,
                        profileId: profile.profileId,
                        shipmentId: { $in: shipmentIds }
                    }).lean();

                    for (const item of shipmentItems) {

                        const shippedQty = Number(item.quantityShipped || 0);
                        const receivedQty = Number(item.quantityReceived || 0);

                        // Skip if no mismatch
                        if (shippedQty <= receivedQty) continue;
                        const missingQty = shippedQty - receivedQty;

                        // Check reimbursement already exists
                        const alreadyClaimed = await reimbursementSchema.findOne({
                            configId: profile?.configId,
                            profileId: profile?.profileId,
                            $and: [
                                { sku: item?.sellerSKU },
                                { fnsku: item?.fulfillmentNetworkSKU },
                                { amazonOrderId: { $eq: null } },
                                { approvalDate: { $gte: last60Days } },
                                { quantityReimbursedInventory: { $eq: missingQty } }
                            ]
                        }).lean();

                        if (alreadyClaimed) continue;

                        const notificationMessage = `
                            <div style="line-height:1.5; font-size:13px;">
                                <div style="margin-bottom:8px;">
                                    Shipment discrepancy detected in your FBA shipment.
                                </div>

                                <b>Shipment ID:</b>
                                <span 
                                    data-link="/reconciliation-reimbursement?search=${Buffer.from(String(item?.shipmentId)).toString("base64")}"
                                    class="text-blue text-decoration-underline fw-bold"
                                >
                                    ${item.shipmentId}
                                </span>
                                <br/>
                                <b>SKU:</b> ${item.sellerSKU}<br/>
                                <b>FNSKU:</b> ${item.fulfillmentNetworkSKU || "-"}<br/>
                                <b>Missing Qty:</b> ${missingQty}<br/>

                                <div style="margin-top:8px;">
                                    Please review and claim before expiry.
                                </div>
                            </div>
                        `;

                        // Create Notification
                        await adNotificationSchema.create({
                            configId: profile.configId,
                            profileId: profile.profileId,
                            notificationTitle: "Reimbursement Reminder",
                            notificationText: notificationMessage,
                            searchable: item.sellerSKU
                        });

                        // Push Notification
                        await sendNotificationToUser(
                            profile.profileId,
                            "Reimbursement Reminder",
                            `Shipment discrepancy detected for SKU ${item.sellerSKU}. Missing Qty: ${missingQty}. Claim reimbursement before expiry.`
                        );

                        cron_logs({
                            message: `Reminder sent for SKU ${item.sellerSKU} ` + `ConfigId ${profile.configId}`,
                            log_type: "info",
                        });
                    }

                    if (getCronData?._id) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    }

                }
                catch (err) {
                    cron_logs({
                        message: `cronReminderForReimbursement profile error ${profile.profileId} ${err}`,
                        log_type: "error",
                    });
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "Reminder for reimbursement sent successfully.",
            log_type: "info",
        });

    } catch (error) {
        return cron_logs({
            message: `Reminder for reimbursement err: ${error}`,
            log_type: "error",
        });
    }
};