const moment = require("moment");
const { retryWithBackoff } = require("../helper/retryHelper");

const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));

const transactionsModel = require("../models/transactions.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { getActivePlanProfiles, getSPAccessToken, parallelBulkWrite, generateDateRange, getAllowedSyncProfiles } = require("../helper/common");
const amazonAxios = require("../helper/amazonAxios");

exports.cronGenerateTransactionsReport = async (customStartDate = null, customEndDate = null) => {

    cron_logs({
        message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} cronGenerateTransactionsReport`,
        log_type: "info",
    });

    try {
        let pastSyncObj = null;
        let startDateParam = null;
        let endDateParam = null;
        let recurring = true;
        let cronjobid = null;

        if (customStartDate && typeof customStartDate === "object") {
            pastSyncObj = customStartDate;
            startDateParam = pastSyncObj.startDate;
            endDateParam = pastSyncObj.endDate;
            recurring = pastSyncObj.recurring;
            cronjobid = pastSyncObj.cronjobid;
        } else {
            startDateParam = customStartDate;
            endDateParam = customEndDate;
        }

        const targetProfileId = pastSyncObj?.profileId || null;
        const targetConfigId = pastSyncObj?.configId || null;
        let profiles = await getActivePlanProfiles(targetProfileId, "sp", targetConfigId);

        const allowedProfiles = await getAllowedSyncProfiles("ORDERS_AND_FINANCE", "seller", recurring);
        profiles = profiles.filter(p =>
            allowedProfiles.some(item => item.profileId === Number(p.profileId) && item.configId === String(p.configId))
        );

        if (targetProfileId) {
            profiles = profiles.filter(p => String(p.profileId) === String(targetProfileId));
        }
        if (targetConfigId) {
            profiles = profiles.filter(p => String(p.configId) === String(targetConfigId));
        }

        const promises = profiles.map((profile) =>
            limit(async () => {
                const checkSPConfig = await getSPAccessToken(profile.configId, profile.profileId);

                if (!checkSPConfig) {
                    return cron_logs({
                        message: `Account disconnected ${profile.configId}`,
                        log_type: "info",
                    });
                }

                const startDate = startDateParam || moment().tz(profile.timezone).subtract(60, "days").format("YYYY-MM-DD");
                const endDate = endDateParam || moment().tz(profile.timezone).subtract(1, "days").format("YYYY-MM-DD");

                const dateRange = generateDateRange(startDate, endDate, profile?.timezone);

                for (const currentDate of dateRange) {
                    let getCronData;
                    if (recurring) {
                        getCronData = await cronJobHistorySchema.findOneAndUpdate(
                            {
                                configId: profile.configId,
                                profileId: profile.profileId,
                                cronName: "Transactions Report",
                                historyDate: currentDate,
                            },
                            { $set: { status: "PENDING" } },
                            { upsert: true, new: true }
                        ).lean();
                    }

                    const result = await fetchAndSaveFinancialEvents(profile, currentDate, checkSPConfig);

                    if (recurring && getCronData?._id && result !== "ERROR") {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            getCronData._id,
                            { status: "COMPLETED" },
                            { new: true }
                        );
                    }
                    else if (!recurring && cronjobid) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                            cronjobid,
                            { status: result !== "ERROR" ? "COMPLETED" : "FAILED" },
                            { new: true },
                        );
                    }

                    cron_logs({
                        message: `Date ${currentDate} → ${result} for configId: ${profile.configId}`,
                        log_type: "info",
                    });
                }
            })
        );

        await Promise.all(promises);

        return cron_logs({
            message: "Transaction reports generated successfully.",
            log_type: "info",
        });

    } catch (error) {

        return cron_logs({
            message: `Transaction report err: ${error}`,
            log_type: "error",
        });
    }
};

// ── Core fetcher with pagination support ──────────────────────
async function fetchAndSaveFinancialEvents(profile, currentDate, token) {
    try {
        const marketPlaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile?.marketplaceStringId, }).lean();

        let nextToken = null;
        let totalSaved = 0;

        const postedAfter = moment.tz(currentDate, "YYYY-MM-DD", profile?.timezone).startOf("day").utc().format("YYYY-MM-DDTHH:mm:ss[Z]");
        const postedBefore = moment.tz(currentDate, "YYYY-MM-DD", profile?.timezone).endOf("day").utc().format("YYYY-MM-DDTHH:mm:ss[Z]");

        do {
            // Build URL — use nextToken if paginating
            const url = nextToken
                ? `${marketPlaceConfig.endPoint}/finances/v0/financialEvents?NextToken=${encodeURIComponent(nextToken)}`
                : `${marketPlaceConfig.endPoint}/finances/v0/financialEvents?PostedAfter=${encodeURIComponent(postedAfter)}&PostedBefore=${encodeURIComponent(postedBefore)}`;

            const response = await retryWithBackoff(() => amazonAxios({
                method: "GET",
                url,
                headers: { "x-amz-access-token": token?.spAccessToken, "Content-Type": "application/json", },
                meta: { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile?.profileId },
            }));

            const financialEvents = response?.data?.payload?.FinancialEvents;

            if (!financialEvents) break;

            // Map & save all event types
            const bulkOps = buildBulkOps(financialEvents, profile, currentDate);

            if (bulkOps.length > 0) {
                cron_logs({
                    message: `Transactions saved: ${bulkOps.length} for configId: ${profile.configId}`,
                    log_type: "info",
                });
                totalSaved += bulkOps.length;
                await parallelBulkWrite(transactionsModel, bulkOps);
            }

            // Check for next page
            nextToken = response?.data?.payload?.NextToken || null;

        } while (nextToken);

        cron_logs({
            message: `Transactions total: ${totalSaved} for configId: ${profile.configId}`,
            log_type: "info",
        });

        return "COMPLETED";
    } catch (error) {
        const errDetails = error?.response?.data ? JSON.stringify(error.response.data) : "";
        cron_logs({
            message: `fetchAndSaveFinancialEvents error: ${error}. Details: ${errDetails}`,
            log_type: "error",
        });
        return "ERROR";
    }
}

// ── Build bulkOps for all event types ────────────────────────
function buildBulkOps(financialEvents, profile, currentDate) {
    const bulkOps = [];
    const { configId, profileId } = profile;

    const {
        ShipmentEventList = [],
        RefundEventList = [],
        ServiceFeeEventList = [],
        ProductAdsPaymentEventList = [],
        AdjustmentEventList = [],
        SAFETReimbursementEventList = [],
        ...remainingFinancialEvents
    } = financialEvents;

    const skippedEventTypes = Object.entries(remainingFinancialEvents).filter(([_, value]) => Array.isArray(value) && value.length > 0).map(([key]) => key);
    if (skippedEventTypes.length > 0) {
        cron_logs({
            message: `\n\nSkipped Financial Event Types: ${skippedEventTypes.join(", ")} for configId: ${configId}\n`,
            log_type: "warning",
        });
    }

    // ── 1. Shipment Events ──────────────────────────────────────
    for (const event of ShipmentEventList) {
        for (const item of event.ShipmentItemList || []) {
            const mapped = mapShipmentItem(event, item, configId, profileId, "Order Payment");

            bulkOps.push({
                updateOne: {
                    filter: {
                        configId,
                        profileId,
                        amazonOrderId: event.AmazonOrderId,
                        orderItemId: item.OrderItemId,
                        transactionType: "Order Payment",
                        reportDate: currentDate,
                    },
                    update: { $set: { ...mapped, reportDate: currentDate } },
                    upsert: true,
                },
            });
        }
    }

    // ── 2. Refund Events ────────────────────────────────────────
    for (const event of RefundEventList) {
        for (const item of event.ShipmentItemAdjustmentList || []) {

            const normalizedItem = {
                SellerSKU: item.SellerSKU,
                OrderItemId: item.OrderAdjustmentItemId,
                QuantityShipped: item.QuantityShipped,
                ItemChargeList: item.ItemChargeAdjustmentList || [],
                ItemFeeList: item.ItemFeeAdjustmentList || [],
                PromotionList: item.PromotionAdjustmentList || [],
                ItemTaxWithheldList: item.ItemTaxWithheldList || [],
            };

            const mapped = mapShipmentItem(event, normalizedItem, configId, profileId, "Refund");

            bulkOps.push({
                updateOne: {
                    filter: {
                        configId,
                        profileId,
                        amazonOrderId: event.AmazonOrderId,
                        orderItemId: normalizedItem.OrderItemId,
                        transactionType: "Refund",
                        reportDate: currentDate,
                    },
                    update: { $set: { ...mapped, reportDate: currentDate } },
                    upsert: true,
                },
            });
        }
    }

    // ── 3. Service Fee Events ───────────────────────────────────
    for (const event of ServiceFeeEventList) {

        const feeMap = {};
        let total = 0;

        for (const fee of event.FeeList || []) {
            feeMap[fee.FeeType] = fee.FeeAmount.CurrencyAmount;
            total += fee.FeeAmount.CurrencyAmount;
        }

        const transactionType = event.FeeReason ? mapReturnFeeTransactionType(event.FeeReason) : mapFeeTypeTransactionType(Object.keys(feeMap));

        bulkOps.push({
            updateOne: {
                filter: {
                    configId,
                    profileId,
                    amazonOrderId: event.AmazonOrderId,
                    transactionType,
                    reportDate: currentDate,
                },
                update: {
                    $set: {
                        configId,
                        profileId,
                        amazonOrderId: event.AmazonOrderId,
                        transactionType,
                        feeReason: event.FeeReason || null,
                        postedDate: null,
                        reportDate: currentDate,

                        mfnPostageFee: feeMap["MFNPostageFee"] || 0,
                        fbaPerUnitFulfillmentFee: feeMap["FBAPerUnitFulfillmentFee"] || 0,
                        fbaWeightBasedFee: feeMap["FBAWeightBasedFee"] || 0,
                        technologyFee: feeMap["TechnologyFee"] || 0,
                        commission: feeMap["Commission"] || 0,

                        totalAmazonFees: total,
                        total,
                        currencyCode: event.FeeList?.[0]?.FeeAmount?.CurrencyCode || "INR",
                    },
                },
                upsert: true,
            },
        });
    }

    // ── 4. Ads Payment Events ───────────────────────────────────
    for (const event of ProductAdsPaymentEventList) {
        bulkOps.push({
            updateOne: {
                filter: {
                    configId,
                    profileId,
                    adInvoiceId: event.invoiceId,
                    transactionType: "Cost of Advertising",
                    reportDate: currentDate,
                },
                update: {
                    $set: {
                        configId,
                        profileId,
                        transactionType: "Cost of Advertising",
                        postedDate: new Date(event.postedDate),
                        reportDate: currentDate,
                        adInvoiceId: event.invoiceId,
                        adSpendBase: event.baseValue.CurrencyAmount,
                        adSpendTax: event.taxValue.CurrencyAmount,
                        adSpendTotal: event.transactionValue.CurrencyAmount,
                        totalAmazonFees: event.transactionValue.CurrencyAmount,
                        total: event.transactionValue.CurrencyAmount,
                        currencyCode: event.transactionValue.CurrencyCode,
                    },
                },
                upsert: true,
            },
        });
    }

    // ── 5. Adjustment Events ────────────────────────────────────
    for (const event of AdjustmentEventList) {

        const transactionType = mapAdjustmentTransactionType(event.AdjustmentType);

        bulkOps.push({
            updateOne: {
                filter: {
                    configId,
                    profileId,
                    transactionType,
                    adjustmentType: event.AdjustmentType,
                    postedDate: new Date(event.PostedDate),
                    reportDate: currentDate,
                },
                update: {
                    $set: {
                        configId,
                        profileId,
                        transactionType,
                        adjustmentType: event.AdjustmentType,
                        postedDate: new Date(event.PostedDate),
                        reportDate: currentDate,
                        adjustmentAmount: event.AdjustmentAmount.CurrencyAmount,
                        totalAmazonFees: event.AdjustmentAmount.CurrencyAmount,
                        total: event.AdjustmentAmount.CurrencyAmount,
                        currencyCode: event.AdjustmentAmount.CurrencyCode || "INR",
                    },
                },
                upsert: true,
            },
        });
    }

    // ── 6. SAFET Reimbursement Events ──────────────────────────
    for (const event of SAFETReimbursementEventList) {

        let reimbursedTotal = 0;
        const itemDetails = [];

        for (const item of event.SAFETReimbursementItemList || []) {
            for (const charge of item.itemChargeList || []) {
                reimbursedTotal += charge.ChargeAmount.CurrencyAmount;
            }
            itemDetails.push({ productDescription: item.productDescription || null, quantity: Number(item.quantity) || 0 });
        }

        bulkOps.push({
            updateOne: {
                filter: {
                    configId,
                    profileId,
                    safetClaimId: event.SAFETClaimId,
                    transactionType: "SAFET Reimbursement",
                    reportDate: currentDate,
                },
                update: {
                    $set: {
                        configId,
                        profileId,
                        transactionType: "SAFET Reimbursement",
                        reportDate: currentDate,
                        postedDate: new Date(event.PostedDate),
                        safetClaimId: event.SAFETClaimId,
                        reasonCode: event.ReasonCode || null,
                        reimbursedAmount: event.ReimbursedAmount.CurrencyAmount,
                        currencyCode: event.ReimbursedAmount.CurrencyCode || "INR",
                        safetItems: itemDetails,

                        other: reimbursedTotal,
                        total: reimbursedTotal,
                    },
                },
                upsert: true,
            },
        });
    }

    return bulkOps;
}

// ── FeeReason → transactionType (return/refund scenarios) ─────
function mapReturnFeeTransactionType(feeReason) {
    const map = {
        "RefusedDelivery": "Return - Refused Delivery",
        "ShippingAddressUndeliverable": "Return - Undeliverable Address",
        "CustomerReturn": "Return - Customer Return",
        "FBACustomerReturn": "Return - FBA Customer Return",
        "LostInbound": "Return - Lost Inbound",
        "LostOutbound": "Return - Lost Outbound",
        "DamagedInbound": "Return - Damaged Inbound",
        "DamagedOutbound": "Return - Damaged Outbound",
    };
    return map[feeReason] || `Return - ${feeReason}`;
}

// ── FeeType → transactionType (no FeeReason scenario) ────────
function mapFeeTypeTransactionType(feeTypes) {
    if (feeTypes.includes("MFNPostageFee")) return "Amazon Easy Ship Charges";
    if (feeTypes.includes("StorageFee")) return "Storage Fee";
    if (feeTypes.includes("LabelingFee")) return "Labeling Fee";
    return "Service Fees";
}

// ── AdjustmentType → transactionType ─────────────────────────
function mapAdjustmentTransactionType(adjustmentType) {
    const map = {
        "PostageRefund": "Postage Refund",
        "BalanceAdjustment": "Balance Adjustment",
        "MissingFromInbound": "Missing From Inbound",
        "ReserveCredit": "Reserve Credit",
        "ReserveDebit": "Reserve Debit",
        "FBAInventoryReimbursement": "FBA Inventory Reimbursement",
    };
    return map[adjustmentType] || `Adjustment - ${adjustmentType}`;
}

function mapShipmentItem(event, item, configId, profileId, transactionType) {
    const charges = {};
    for (const c of item.ItemChargeList || []) {
        charges[c.ChargeType] = c.ChargeAmount.CurrencyAmount;
    }

    const fees = {};
    for (const f of item.ItemFeeList || []) {
        fees[f.FeeType] = f.FeeAmount.CurrencyAmount;
    }

    const totalPromotionalRebates = (item.PromotionList || []).reduce((sum, p) => sum + (p.PromotionAmount?.CurrencyAmount || 0), 0);

    // Pair promotions (0+1, 2+3, 4+5)
    const promotions = item.PromotionList || [];
    let shippingPromotion = 0;
    let shippingTaxPromotion = 0;
    for (let i = 0; i < promotions.length; i += 2) {
        const a = promotions[i]?.PromotionAmount?.CurrencyAmount || 0;
        const b = promotions[i + 1]?.PromotionAmount?.CurrencyAmount || 0;
        const fee = Math.abs(a) >= Math.abs(b) ? a : b;
        const tax = Math.abs(a) >= Math.abs(b) ? b : a;
        shippingPromotion += fee;
        shippingTaxPromotion += tax;
    }

    let itemTDS = 0;
    for (const t of item.ItemTaxWithheldList || []) {
        for (const tw of t.TaxesWithheld || []) {
            if (tw.ChargeType === "ItemTDS") {
                itemTDS += tw.ChargeAmount.CurrencyAmount;
            }
        }
    }

    const principal = charges["Principal"] || 0;
    const tax = charges["Tax"] || 0;
    const shippingCharge = charges["ShippingCharge"] || 0;
    const shippingTax = charges["ShippingTax"] || 0;
    const giftWrap = charges["GiftWrap"] || 0;
    const giftWrapTax = charges["GiftWrapTax"] || 0;
    const tcsIGST = charges["TCS-IGST"] || 0;

    const totalProductCharges = principal + tax + shippingCharge + shippingTax + giftWrap + giftWrapTax;

    const fbaPerUnitFulfillmentFee = fees["FBAPerUnitFulfillmentFee"] || 0;
    const fbaWeightBasedFee = fees["FBAWeightBasedFee"] || 0;
    const commission = fees["Commission"] || 0;
    const fixedClosingFee = fees["FixedClosingFee"] || 0;
    const variableClosingFee = fees["VariableClosingFee"] || 0;
    const technologyFee = fees["TechnologyFee"] || 0;
    const shippingChargeback = fees["ShippingChargeback"] || 0;
    const giftwrapChargeback = fees["GiftwrapChargeback"] || 0;

    const totalAmazonFees = fbaPerUnitFulfillmentFee + fbaWeightBasedFee + commission + fixedClosingFee + variableClosingFee + technologyFee + shippingChargeback + giftwrapChargeback;

    const extraOthers = tcsIGST + itemTDS;
    const total = totalProductCharges + totalPromotionalRebates + totalAmazonFees + extraOthers;
    const other = parseFloat((total - (principal + totalAmazonFees + shippingPromotion)).toFixed(2));

    return {
        configId,
        profileId,

        // Root level from event
        amazonOrderId: event.AmazonOrderId,
        sellerOrderId: event.SellerOrderId || null,
        marketplaceName: event.MarketplaceName || null,
        postedDate: event.PostedDate ? new Date(event.PostedDate) : null,
        transactionType: transactionType || "Order Payment",

        // Item level
        sellerSKU: item.SellerSKU || null,
        orderItemId: item.OrderItemId || null,
        quantityShipped: item.QuantityShipped || 0,

        // Charges
        principal, tax, shippingCharge, shippingTax,
        giftWrap, giftWrapTax, tcsIGST,
        totalProductCharges,

        // Promotions
        totalPromotionalRebates,

        shippingPromotion, shippingTaxPromotion,

        // Fees
        fbaPerUnitFulfillmentFee, fbaWeightBasedFee,
        commission, fixedClosingFee, variableClosingFee,
        technologyFee, shippingChargeback, giftwrapChargeback,
        totalAmazonFees,

        // Tax
        itemTDS,

        // Totals
        other,
        total,
        currencyCode: item?.ItemChargeList?.[0]?.ChargeAmount?.CurrencyCode || "INR",
    };
}