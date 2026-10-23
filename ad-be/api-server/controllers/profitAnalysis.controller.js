const { write_logs } = require("../../winston/utility/logger");
const Transactions = require("../models/transactions.model");
const ProductAds = require("../models/productAds.model");
const SbProductAds = require("../models/sbProductAds.model");
const SdProductAds = require("../models/sdProductAds.model");
const BusinessProductSales = require("../models/businessProductSales.model");
const OrderDetails = require("../models/orderDetails.model");
const Campaign = require("../models/campaign.model");
const ProductListing = require("../models/productListing.model");
const Returns = require("../models/return.model");
const Reimbursements = require("../models/reimbursement.model");
const mongoose = require("mongoose");
const moment = require("moment");
const { getProfile } = require("../helper/common");
const { getCacheWithLog, setCacheWithLog } = require("../services/redis.service");
const sellerConfigSchema = require("../models/sellerConfig.model");

const getSearchRegex = (search) => {
    if (!search) return null;
    let terms = [];
    if (Array.isArray(search)) {
        terms = search.map(t => typeof t === 'string' ? t.trim() : '').filter(Boolean);
    } else if (typeof search === 'string') {
        terms = search.split(',').map(t => t.trim()).filter(Boolean);
    }
    if (terms.length === 0) return null;
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(escapedTerms.join('|'), 'i');
};

exports.getProfitAnalysisSummary = async (req, res, next) => {
    try {
        const { profileId, fromDate, toDate, search, categories } = req.body;
        const configId = req?.config?.configId;

        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile ID is required" });
        }

        const cacheKey = `profitAnalysis_summary_${configId}_${profileId}_${JSON.stringify(req.body)}`;
        const cachedData = await getCacheWithLog(cacheKey);
        if (cachedData) {
            return res.status(200).json(JSON.parse(cachedData));
        }

        const profile = await getProfile(configId, Number(profileId));

        const sellerConfig = await sellerConfigSchema.findOne({
            configId: new mongoose.Types.ObjectId(configId),
            profileId: Number(profileId),
            disconnectedAt: null
        }).lean();
        const hasSpTokens = !!(sellerConfig && sellerConfig.spRefreshToken);

        // --- Fetch all listings to map basePrice ---
        const allListings = await ProductListing.find(
            { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) },
            { sku: 1, basePrice: 1 }
        ).lean();
        const basePriceMap = allListings.reduce((acc, curr) => {
            if (curr.sku) acc[curr.sku] = curr.basePrice || 0;
            return acc;
        }, {});
        let skus = null;
        let asins = null;
        if (categories && categories.length > 0) {
            const listings = await ProductListing.find({
                configId: new mongoose.Types.ObjectId(configId),
                profileId: Number(profileId),
                productType: { $in: categories }
            }, { sku: 1, asin: 1 }).lean();

            skus = listings.map(l => l.sku).filter(Boolean);
            asins = listings.map(l => l.asin).filter(Boolean);

            if (skus.length === 0 && asins.length === 0) {
                // If categories are selected but no products found, return empty data
                
        const responseData = {
                    isSuccess: true,
                    data: {
                        summary: {
                            salesSummary: { totalSales: 0, units: 0, breakdown: [] },
                            profitSummary: { profit: 0, margin: 0, roas: 0 },
                            adSpend: { spend: 0, tacos: 0 },
                            hasSpTokens
                        },
                        monthlyData: [],
                        chartData: []
                    }
                };
        if (typeof cacheKey !== 'undefined') {
            await setCacheWithLog(cacheKey, JSON.stringify(responseData));
        }
        return res.status(200).json(responseData);
            }
        }

        // --- 1. Order Match Filter ---
        let orderMatch = {
            configId: new mongoose.Types.ObjectId(configId),
            profileId: Number(profileId)
        };

        if (fromDate && toDate) {
            orderMatch.orderCreatedTime = {
                $gte: moment.tz(fromDate, profile?.timezone).startOf("day").toDate(),
                $lte: moment.tz(toDate, profile?.timezone).endOf("day").toDate()
            };
        }

        // If categories are selected, we must match those SKUs or ASINs inside the orderItems
        if ((skus && skus.length > 0) || (asins && asins.length > 0)) {
            let catOr = [];
            if (skus && skus.length > 0) catOr.push({ "orderItems.product.sellerSku": { $in: skus } });
            if (asins && asins.length > 0) catOr.push({ "orderItems.product.asin": { $in: asins } });
            orderMatch.$or = catOr;
        }

        // --- 2. Build Base Order Pipeline ---
        let basePipeline = [{ $match: orderMatch }];

        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                basePipeline.push({
                    $match: {
                        $or: [
                            { orderId: searchRegex },
                            { "buyer.buyerEmail": searchRegex },
                            { "orderItems.product.asin": searchRegex },
                            { "orderItems.product.sellerSku": searchRegex },
                            { "orderItems.product.title": searchRegex },
                            { "orderItems.orderItemId": searchRegex }
                        ]
                    }
                });
            }
        }

        // --- 3. Lookups for Refunds, Reimbursements, and Fees ---
        basePipeline.push(
            // Refunds
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                transactionType: "Refund",
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 0, totalProductCharges: 1 } }
                    ],
                    as: "refundData"
                }
            },
            // Reimbursements
            {
                $lookup: {
                    from: "reimbursements",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 0, amountTotal: 1, quantityReimbursedTotal: 1 } }
                    ],
                    as: "reimbData"
                }
            },
            // Order Fees (Transactions)
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 0, transactionType: 1, totalAmazonFees: 1,
                                itemTDS: 1, mfnPostageFee: 1, tcsIGST: 1
                            }
                        }
                    ],
                    as: "feeData"
                }
            }
        );

        // --- 4. Grouping logic (Shared by Summary and Monthly) ---
        const getGroupMetrics = () => ({
            totalAmount: { $sum: "$totalAmount" },
            totalQuantity: { $sum: "$totalQuantity" },

            cancelledAmount: {
                $sum: { $cond: [{ $in: ["$orderStatus", ["Canceled", "Cancelled", "CANCELED", "CANCELLED"]] }, "$totalAmount", 0] }
            },
            cancelledQuantity: {
                $sum: { $cond: [{ $in: ["$orderStatus", ["Canceled", "Cancelled", "CANCELED", "CANCELLED"]] }, "$totalQuantity", 0] }
            },

            refundedAmount: {
                $sum: { $reduce: { input: "$refundData", initialValue: 0, in: { $add: ["$$value", "$$this.totalProductCharges"] } } }
            },
            refundedQuantity: {
                $sum: { $cond: [{ $gt: [{ $size: "$refundData" }, 0] }, "$totalQuantity", 0] } // Approximate refund qty
            },

            claimedAmount: {
                $sum: { $reduce: { input: "$reimbData", initialValue: 0, in: { $add: ["$$value", "$$this.amountTotal"] } } }
            },
            claimedQuantity: {
                $sum: { $reduce: { input: "$reimbData", initialValue: 0, in: { $add: ["$$value", "$$this.quantityReimbursedTotal"] } } }
            },

            amazonFees: {
                $sum: {
                    $reduce: {
                        input: "$feeData",
                        initialValue: 0,
                        in: {
                            $add: [
                                "$$value",
                                { $cond: [{ $in: ["$$this.transactionType", ["Order Payment", "Refund"]] }, { $ifNull: ["$$this.totalAmazonFees", 0] }, 0] }
                            ]
                        }
                    }
                }
            },
            shippingFees: {
                $sum: {
                    $reduce: {
                        input: "$feeData",
                        initialValue: 0,
                        in: {
                            $add: [
                                "$$value",
                                { $cond: [{ $eq: ["$$this.transactionType", "Amazon Easy Ship Charges"] }, { $ifNull: ["$$this.totalAmazonFees", 0] }, 0] }
                            ]
                        }
                    }
                }
            },
            otherCost: {
                $sum: {
                    $reduce: {
                        input: "$feeData", initialValue: 0,
                        in: { $add: ["$$value", { $ifNull: ["$$this.itemTDS", 0] }, { $ifNull: ["$$this.mfnPostageFee", 0] }, { $ifNull: ["$$this.tcsIGST", 0] }] }
                    }
                }
            }
        });

        // --- 5. Execute Summary Aggregation ---
        const summaryPipeline = [...basePipeline, { $group: { _id: null, ...getGroupMetrics() } }];
        const ordersAgg = await OrderDetails.aggregate(summaryPipeline);
        const sData = ordersAgg[0] || {
            totalAmount: 0, totalQuantity: 0, cancelledAmount: 0, cancelledQuantity: 0,
            refundedAmount: 0, refundedQuantity: 0, claimedAmount: 0, claimedQuantity: 0,
            amazonFees: 0, shippingFees: 0, otherCost: 0
        };

        // Standardize positive values for Dashboard
        sData.refundedAmount = Math.abs(sData.refundedAmount || 0);
        sData.amazonFees = Math.abs(sData.amazonFees || 0);
        sData.shippingFees = Math.abs(sData.shippingFees || 0);
        sData.otherCost = Math.abs(sData.otherCost || 0);

        // --- 6. Execute Monthly Aggregation ---
        const monthlyPipeline = [
            ...basePipeline,
            {
                $group: {
                    _id: { year: { $year: "$orderCreatedTime" }, month: { $month: "$orderCreatedTime" } },
                    ...getGroupMetrics()
                }
            }
        ];
        const monthlyAgg = await OrderDetails.aggregate(monthlyPipeline);
        // --- 7. Ad Spend Aggregation (Not tied to Orders) ---
        let reportDateMatch = { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) };
        if (fromDate && toDate) { reportDateMatch.reportDate = { $gte: fromDate, $lte: toDate }; }

        if ((skus && skus.length > 0) || (asins && asins.length > 0)) {
            let adCatOr = [];
            if (skus && skus.length > 0) adCatOr.push({ sku: { $in: skus } });
            if (asins && asins.length > 0) adCatOr.push({ asins: { $in: asins } });
            reportDateMatch.$or = adCatOr;
        }

        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                // If reportDateMatch already has $or (e.g. from future extensions), we use $and
                if (reportDateMatch.$or) {
                    reportDateMatch.$and = [
                        { $or: reportDateMatch.$or },
                        { $or: [{ name: searchRegex }, { sku: searchRegex }, { asins: searchRegex }] }
                    ];
                    delete reportDateMatch.$or;
                } else {
                    reportDateMatch.$or = [
                        { name: searchRegex },
                        { sku: searchRegex },
                        { asins: searchRegex }
                    ];
                }
            }
        }

        const adAgg = await ProductAds.aggregate([
            { $match: reportDateMatch },
            { $group: { _id: null, spend: { $sum: "$spend" }, sales: { $sum: "$sales" } } }
        ]);
        const adData = adAgg[0] || { spend: 0, sales: 0 };
        const adMonthlyAgg = await ProductAds.aggregate([
            { $match: reportDateMatch },
            { $group: { _id: { $substr: ["$reportDate", 0, 7] }, spend: { $sum: "$spend" } } }
        ]);
        const adMonthMap = adMonthlyAgg.reduce((acc, curr) => { acc[curr._id] = curr.spend; return acc; }, {});
        // --- 7.5 Calculate Product Cost ---
        let productCostPipeline = [{ $match: orderMatch }];
        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                productCostPipeline.push({
                    $match: {
                        $or: [
                            { orderId: searchRegex },
                            { "buyer.buyerEmail": searchRegex },
                            { "orderItems.product.asin": searchRegex },
                            { "orderItems.product.sellerSku": searchRegex },
                            { "orderItems.product.title": searchRegex },
                            { "orderItems.orderItemId": searchRegex }
                        ]
                    }
                });
            }
        }
        
        productCostPipeline.push(
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                transactionType: "Refund",
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 1 } }
                    ],
                    as: "orderRefundData"
                }
            },
            {
                $addFields: {
                    orderHasRefund: { $gt: [{ $size: "$orderRefundData" }, 0] }
                }
            },
            { $unwind: "$orderItems" },
            {
                $addFields: {
                    itemRefundQty: {
                        $cond: ["$orderHasRefund", "$orderItems.quantityOrdered", 0]
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$orderCreatedTime" },
                        month: { $month: "$orderCreatedTime" },
                        sku: "$orderItems.product.sellerSku"
                    },
                    grossQty: { $sum: "$orderItems.quantityOrdered" },
                    refundQty: { $sum: "$itemRefundQty" }
                }
            }
        );

        const productCostAgg = await OrderDetails.aggregate(productCostPipeline);

        let overallTotalCost = 0;
        let monthlyCosts = {};
        productCostAgg.forEach(m => {
            const netQty = m.grossQty - m.refundQty;
            const cost = (netQty > 0 ? netQty : 0) * (basePriceMap[m._id.sku] || 0);
            overallTotalCost += cost;
            const mKey = `${m._id.year}-${String(m._id.month).padStart(2, '0')}`;
            monthlyCosts[mKey] = (monthlyCosts[mKey] || 0) + cost;
        });

        // --- 8. Construct Final Summary Object ---
        const netSales = sData.totalAmount - sData.refundedAmount + (sData.claimedAmount || 0);
        const netQty = sData.totalQuantity - sData.refundedQuantity + (sData.claimedQuantity || 0);
        const totalProductCost = overallTotalCost;
        const totalProfit = netSales - totalProductCost - sData.amazonFees - sData.shippingFees - sData.otherCost - adData.spend;

        const summary = {
            salesSummary: {
                totalSales: netSales,
                units: netQty,
                breakdown: [
                    { label: 'Gross', qty: sData.totalQuantity, sales: sData.totalAmount },
                    { label: 'Cancelled', qty: sData.cancelledQuantity, sales: sData.cancelledAmount },
                    { label: 'Returned', qty: sData.refundedQuantity, sales: sData.refundedAmount },
                    { label: 'Claimed', qty: sData.claimedQuantity || 0, sales: sData.claimedAmount || 0 },
                ]
            },
            profitSummary: {
                profit: totalProfit,
                margin: netSales > 0 ? (totalProfit / netSales) * 100 : 0,
                roas: adData.spend > 0 ? netSales / adData.spend : 0,
                productCost: totalProductCost
            },
            adSpend: { spend: adData.spend, tacos: netSales ? (adData.spend / netSales) * 100 : 0 },
            hasSpTokens
        };

        // --- 9. Construct Monthly Data ---
        const sortedMonths = monthlyAgg.map(m => {
            const yearStr = m._id.year;
            const monthStr = String(m._id.month).padStart(2, '0');
            return `${yearStr}-${monthStr}`;
        }).sort();

        const monthlyData = monthlyAgg.sort((a, b) => {
            if (a._id.year !== b._id.year) return a._id.year - b._id.year;
            return a._id.month - b._id.month;
        }).map(m => {
            const year = m._id.year;
            const month = m._id.month;
            const dateStr = `${year}-${String(month).padStart(2, '0')}`;

            const rSales = Math.abs(m.refundedAmount || 0);
            const aFees = Math.abs(m.amazonFees || 0);
            const sFees = Math.abs(m.shippingFees || 0);
            const oCost = Math.abs(m.otherCost || 0);
            const aSpend = adMonthMap[dateStr] || 0;
            const cSales = m.claimedAmount || 0;
            const cQty = m.claimedQuantity || 0;

            const mNet = m.totalAmount - rSales + cSales;
            const mNetQ = m.totalQuantity - (m.refundedQuantity || 0) + cQty;
            const mCost = monthlyCosts[dateStr] || 0;
            const mProfit = mNet - mCost - aFees - sFees - oCost - aSpend;

            return {
                date: dateStr,
                totalAmount: m.totalAmount,
                totalQuantity: m.totalQuantity,
                cancelledAmount: m.cancelledAmount,
                cancelledQuantity: m.cancelledQuantity,
                refundedAmount: rSales,
                refundedQuantity: m.refundedQuantity || 0,
                claimedAmount: cSales,
                claimedQuantity: cQty,
                amazonFees: aFees,
                shippingFees: sFees,
                otherCost: oCost,
                adSpend: aSpend,
                netSales: mNet,
                netQuantity: mNetQ,
                productCost: mCost,
                profit: mProfit,
                margin: mNet > 0 ? (mProfit / mNet) * 100 : 0,
                month: `${moment().month(month - 1).format('MMM')}/${year.toString().slice(2)}`,
                grossQty: m.totalQuantity,
                cancelledQty: m.cancelledQuantity,
                returnedQty: m.refundedQuantity || 0,
                claimedQty: cQty,
                totalQty: mNetQ,
                grossSales: m.totalAmount,
                cancelledSales: m.cancelledAmount,
                returnedSales: rSales,
                claimedSales: cSales,
                totalSales: mNet,
                amazonFees: aFees,
                shippingFees: sFees,
                adSpend: aSpend,
                otherCost: oCost,
                totalProfit: mProfit,
                grossASP: m.totalQuantity ? (m.totalAmount / m.totalQuantity) : 0,
                netASP: mNetQ ? (mNet / mNetQ) : 0,
                returnPercent: m.totalQuantity ? ((m.refundedQuantity || 0) / m.totalQuantity) * 100 : 0,
                tacos: mNet ? (aSpend / mNet) * 100 : 0,
                profitMargin: mNet ? (mProfit / mNet) * 100 : 0
            };
        });

        
        const responseData = {
            isSuccess: true,
            data: {
                summary,
                monthlyData,
                chartData: monthlyData
            }
        };
        if (typeof cacheKey !== 'undefined') {
            await setCacheWithLog(cacheKey, JSON.stringify(responseData));
        }
        return res.status(200).json(responseData);

    } catch (error) {
        write_logs({ message: `[getProfitAnalysisSummary Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        next(error);
    }
};

exports.getProfitAnalysisMonthly = async (req, res, next) => {
    try {
        const { profileId, fromDate, toDate, search, categories } = req.body;
        const configId = req?.config?.configId;

        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile ID is required" });
        }

        const cacheKey = `profitAnalysis_monthly_${configId}_${profileId}_${JSON.stringify(req.body)}`;
        const cachedData = await getCacheWithLog(cacheKey);
        if (cachedData) {
            return res.status(200).json(JSON.parse(cachedData));
        }

        const profile = await getProfile(configId, Number(profileId));

        // --- Fetch all listings to map basePrice ---
        const allListings = await ProductListing.find(
            { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) },
            { sku: 1, basePrice: 1 }
        ).lean();
        const basePriceMap = allListings.reduce((acc, curr) => {
            if (curr.sku) acc[curr.sku] = curr.basePrice || 0;
            return acc;
        }, {});
        let skus = null;
        let asins = null;
        if (categories && categories.length > 0) {
            const listings = await ProductListing.find({
                configId: new mongoose.Types.ObjectId(configId),
                profileId: Number(profileId),
                productType: { $in: categories }
            }, { sku: 1, asin: 1 }).lean();

            skus = listings.map(l => l.sku).filter(Boolean);
            asins = listings.map(l => l.asin).filter(Boolean);

            if (skus.length === 0 && asins.length === 0) {
                // If categories are selected but no products found, return empty data
                
        const responseData = {
                    isSuccess: true,
                    data: {
                        summary: {
                            salesSummary: { totalSales: 0, units: 0, breakdown: [] },
                            profitSummary: { profit: 0, margin: 0, roas: 0 },
                            adSpend: { spend: 0, tacos: 0 }
                        },
                        monthlyData: [],
                        chartData: []
                    }
                };
        if (typeof cacheKey !== 'undefined') {
            await setCacheWithLog(cacheKey, JSON.stringify(responseData));
        }
        return res.status(200).json(responseData);
            }
        }

        // --- 1. Order Match Filter ---
        let orderMatch = {
            configId: new mongoose.Types.ObjectId(configId),
            profileId: Number(profileId)
        };

        if (fromDate && toDate) {
            orderMatch.orderCreatedTime = {
                $gte: moment.tz(fromDate, profile?.timezone).startOf("day").toDate(),
                $lte: moment.tz(toDate, profile?.timezone).endOf("day").toDate()
            };
        }

        // If categories are selected, we must match those SKUs or ASINs inside the orderItems
        if ((skus && skus.length > 0) || (asins && asins.length > 0)) {
            let catOr = [];
            if (skus && skus.length > 0) catOr.push({ "orderItems.product.sellerSku": { $in: skus } });
            if (asins && asins.length > 0) catOr.push({ "orderItems.product.asin": { $in: asins } });
            orderMatch.$or = catOr;
        }

        // --- 2. Build Base Order Pipeline ---
        let basePipeline = [{ $match: orderMatch }];

        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                basePipeline.push({
                    $match: {
                        $or: [
                            { orderId: searchRegex },
                            { "buyer.buyerEmail": searchRegex },
                            { "orderItems.product.asin": searchRegex },
                            { "orderItems.product.sellerSku": searchRegex },
                            { "orderItems.product.title": searchRegex },
                            { "orderItems.orderItemId": searchRegex }
                        ]
                    }
                });
            }
        }

        // --- 3. Lookups for Refunds, Reimbursements, and Fees ---
        basePipeline.push(
            // Refunds
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                transactionType: "Refund",
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 0, totalProductCharges: 1 } }
                    ],
                    as: "refundData"
                }
            },
            // Reimbursements
            {
                $lookup: {
                    from: "reimbursements",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 0, amountTotal: 1, quantityReimbursedTotal: 1 } }
                    ],
                    as: "reimbData"
                }
            },
            // Order Fees (Transactions)
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 0, transactionType: 1, totalAmazonFees: 1,
                                itemTDS: 1, mfnPostageFee: 1, tcsIGST: 1
                            }
                        }
                    ],
                    as: "feeData"
                }
            }
        );

        // --- 4. Grouping logic (Shared by Summary and Monthly) ---
        const getGroupMetrics = () => ({
            totalAmount: { $sum: "$totalAmount" },
            totalQuantity: { $sum: "$totalQuantity" },

            cancelledAmount: {
                $sum: { $cond: [{ $in: ["$orderStatus", ["Canceled", "Cancelled", "CANCELED", "CANCELLED"]] }, "$totalAmount", 0] }
            },
            cancelledQuantity: {
                $sum: { $cond: [{ $in: ["$orderStatus", ["Canceled", "Cancelled", "CANCELED", "CANCELLED"]] }, "$totalQuantity", 0] }
            },

            refundedAmount: {
                $sum: { $reduce: { input: "$refundData", initialValue: 0, in: { $add: ["$$value", "$$this.totalProductCharges"] } } }
            },
            refundedQuantity: {
                $sum: { $cond: [{ $gt: [{ $size: "$refundData" }, 0] }, "$totalQuantity", 0] } // Approximate refund qty
            },

            claimedAmount: {
                $sum: { $reduce: { input: "$reimbData", initialValue: 0, in: { $add: ["$$value", "$$this.amountTotal"] } } }
            },
            claimedQuantity: {
                $sum: { $reduce: { input: "$reimbData", initialValue: 0, in: { $add: ["$$value", "$$this.quantityReimbursedTotal"] } } }
            },

            amazonFees: {
                $sum: {
                    $reduce: {
                        input: "$feeData",
                        initialValue: 0,
                        in: {
                            $add: [
                                "$$value",
                                { $cond: [{ $in: ["$$this.transactionType", ["Order Payment", "Refund"]] }, { $ifNull: ["$$this.totalAmazonFees", 0] }, 0] }
                            ]
                        }
                    }
                }
            },
            shippingFees: {
                $sum: {
                    $reduce: {
                        input: "$feeData",
                        initialValue: 0,
                        in: {
                            $add: [
                                "$$value",
                                { $cond: [{ $eq: ["$$this.transactionType", "Amazon Easy Ship Charges"] }, { $ifNull: ["$$this.totalAmazonFees", 0] }, 0] }
                            ]
                        }
                    }
                }
            },
            otherCost: {
                $sum: {
                    $reduce: {
                        input: "$feeData", initialValue: 0,
                        in: { $add: ["$$value", { $ifNull: ["$$this.itemTDS", 0] }, { $ifNull: ["$$this.mfnPostageFee", 0] }, { $ifNull: ["$$this.tcsIGST", 0] }] }
                    }
                }
            }
        });

        // --- 5. Execute Summary Aggregation ---
        const summaryPipeline = [...basePipeline, { $group: { _id: null, ...getGroupMetrics() } }];
        const ordersAgg = await OrderDetails.aggregate(summaryPipeline);
        const sData = ordersAgg[0] || {
            totalAmount: 0, totalQuantity: 0, cancelledAmount: 0, cancelledQuantity: 0,
            refundedAmount: 0, refundedQuantity: 0, claimedAmount: 0, claimedQuantity: 0,
            amazonFees: 0, shippingFees: 0, otherCost: 0
        };

        // Standardize positive values for Dashboard
        sData.refundedAmount = Math.abs(sData.refundedAmount || 0);
        sData.amazonFees = Math.abs(sData.amazonFees || 0);
        sData.shippingFees = Math.abs(sData.shippingFees || 0);
        sData.otherCost = Math.abs(sData.otherCost || 0);

        // --- 6. Execute Monthly Aggregation ---
        const monthlyPipeline = [
            ...basePipeline,
            {
                $group: {
                    _id: {
                        year: { $year: { date: "$orderCreatedTime", timezone: profile?.timezone || "UTC" } },
                        month: { $month: { date: "$orderCreatedTime", timezone: profile?.timezone || "UTC" } }
                    },
                    ...getGroupMetrics()
                }
            }
        ];
        const monthlyAgg = await OrderDetails.aggregate(monthlyPipeline);
        // --- 7. Ad Spend Aggregation (Not tied to Orders) ---
        let reportDateMatch = { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) };
        if (fromDate && toDate) { reportDateMatch.reportDate = { $gte: fromDate, $lte: toDate }; }

        if ((skus && skus.length > 0) || (asins && asins.length > 0)) {
            let adCatOr = [];
            if (skus && skus.length > 0) adCatOr.push({ sku: { $in: skus } });
            if (asins && asins.length > 0) adCatOr.push({ asins: { $in: asins } });
            reportDateMatch.$or = adCatOr;
        }

        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                // If reportDateMatch already has $or (e.g. from future extensions), we use $and
                if (reportDateMatch.$or) {
                    reportDateMatch.$and = [
                        { $or: reportDateMatch.$or },
                        { $or: [{ name: searchRegex }, { sku: searchRegex }, { asins: searchRegex }] }
                    ];
                    delete reportDateMatch.$or;
                } else {
                    reportDateMatch.$or = [
                        { name: searchRegex },
                        { sku: searchRegex },
                        { asins: searchRegex }
                    ];
                }
            }
        }

        const adAgg = await ProductAds.aggregate([
            { $match: reportDateMatch },
            { $group: { _id: null, spend: { $sum: "$spend" }, sales: { $sum: "$sales" } } }
        ]);
        const adData = adAgg[0] || { spend: 0, sales: 0 };
        const adMonthlyAgg = await ProductAds.aggregate([
            { $match: reportDateMatch },
            { $group: { _id: { $substr: ["$reportDate", 0, 7] }, spend: { $sum: "$spend" } } }
        ]);
        const adMonthMap = adMonthlyAgg.reduce((acc, curr) => { acc[curr._id] = curr.spend; return acc; }, {});
        // --- 7.5 Calculate Product Cost ---
        let productCostPipeline = [{ $match: orderMatch }];
        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                productCostPipeline.push({
                    $match: {
                        $or: [
                            { orderId: searchRegex },
                            { "buyer.buyerEmail": searchRegex },
                            { "orderItems.product.asin": searchRegex },
                            { "orderItems.product.sellerSku": searchRegex },
                            { "orderItems.product.title": searchRegex },
                            { "orderItems.orderItemId": searchRegex }
                        ]
                    }
                });
            }
        }

        productCostPipeline.push(
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                transactionType: "Refund",
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 1 } }
                    ],
                    as: "orderRefundData"
                }
            },
            {
                $addFields: {
                    orderHasRefund: { $gt: [{ $size: "$orderRefundData" }, 0] }
                }
            },
            { $unwind: "$orderItems" },
            {
                $addFields: {
                    itemRefundQty: {
                        $cond: ["$orderHasRefund", "$orderItems.quantityOrdered", 0]
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: { date: "$orderCreatedTime", timezone: profile?.timezone || "UTC" } },
                        month: { $month: { date: "$orderCreatedTime", timezone: profile?.timezone || "UTC" } },
                        sku: "$orderItems.product.sellerSku"
                    },
                    grossQty: { $sum: "$orderItems.quantityOrdered" },
                    refundQty: { $sum: "$itemRefundQty" }
                }
            }
        );

        const productCostAgg = await OrderDetails.aggregate(productCostPipeline);

        let overallTotalCost = 0;
        let monthlyCosts = {};
        productCostAgg.forEach(m => {
            const netQty = m.grossQty - m.refundQty;
            const cost = (netQty > 0 ? netQty : 0) * (basePriceMap[m._id.sku] || 0);
            overallTotalCost += cost;
            const mKey = `${m._id.year}-${String(m._id.month).padStart(2, '0')}`;
            monthlyCosts[mKey] = (monthlyCosts[mKey] || 0) + cost;
        });

        // --- 8. Construct Final Summary Object ---
        const netSales = sData.totalAmount - sData.refundedAmount + (sData.claimedAmount || 0);
        const netQty = sData.totalQuantity - sData.refundedQuantity + (sData.claimedQuantity || 0);
        const totalProductCost = overallTotalCost;
        const totalProfit = netSales - totalProductCost - sData.amazonFees - sData.shippingFees - sData.otherCost - adData.spend;

        const summary = {
            salesSummary: {
                totalSales: netSales,
                units: netQty,
                breakdown: [
                    { label: 'Gross', qty: sData.totalQuantity, sales: sData.totalAmount },
                    { label: 'Cancelled', qty: sData.cancelledQuantity, sales: sData.cancelledAmount },
                    { label: 'Returned', qty: sData.refundedQuantity, sales: sData.refundedAmount },
                    { label: 'Claimed', qty: sData.claimedQuantity || 0, sales: sData.claimedAmount || 0 },
                ]
            },
            profitSummary: {
                profit: totalProfit,
                margin: netSales > 0 ? (totalProfit / netSales) * 100 : 0,
                roas: adData.spend > 0 ? netSales / adData.spend : 0,
                productCost: totalProductCost
            },
            adSpend: { spend: adData.spend, tacos: netSales ? (adData.spend / netSales) * 100 : 0 }
        };

        // --- 9. Construct Monthly Data ---
        const sortedMonths = monthlyAgg.map(m => {
            const yearStr = m._id.year;
            const monthStr = String(m._id.month).padStart(2, '0');
            return `${yearStr}-${monthStr}`;
        }).sort();

        const monthlyData = monthlyAgg.sort((a, b) => {
            if (a._id.year !== b._id.year) return a._id.year - b._id.year;
            return a._id.month - b._id.month;
        }).map(m => {
            const year = m._id.year;
            const month = m._id.month;
            const dateStr = `${year}-${String(month).padStart(2, '0')}`;

            const rSales = Math.abs(m.refundedAmount || 0);
            const aFees = Math.abs(m.amazonFees || 0);
            const sFees = Math.abs(m.shippingFees || 0);
            const oCost = Math.abs(m.otherCost || 0);
            const aSpend = adMonthMap[dateStr] || 0;
            const cSales = m.claimedAmount || 0;
            const cQty = m.claimedQuantity || 0;

            const mNet = m.totalAmount - rSales + cSales;
            const mNetQ = m.totalQuantity - (m.refundedQuantity || 0) + cQty;
            const mCost = monthlyCosts[dateStr] || 0;
            const mProfit = mNet - mCost - aFees - sFees - oCost - aSpend;

            return {
                date: dateStr,
                totalAmount: m.totalAmount,
                totalQuantity: m.totalQuantity,
                cancelledAmount: m.cancelledAmount,
                cancelledQuantity: m.cancelledQuantity,
                refundedAmount: rSales,
                refundedQuantity: m.refundedQuantity || 0,
                claimedAmount: cSales,
                claimedQuantity: cQty,
                amazonFees: aFees,
                shippingFees: sFees,
                otherCost: oCost,
                adSpend: aSpend,
                netSales: mNet,
                netQuantity: mNetQ,
                productCost: mCost,
                profit: mProfit,
                margin: mNet > 0 ? (mProfit / mNet) * 100 : 0,
                month: `${moment().month(month - 1).format('MMM')}/${year.toString().slice(2)}`,
                grossQty: m.totalQuantity,
                cancelledQty: m.cancelledQuantity,
                returnedQty: m.refundedQuantity || 0,
                claimedQty: cQty,
                totalQty: mNetQ,
                grossSales: m.totalAmount,
                cancelledSales: m.cancelledAmount,
                returnedSales: rSales,
                claimedSales: cSales,
                totalSales: mNet,
                amazonFees: aFees,
                shippingFees: sFees,
                adSpend: aSpend,
                otherCost: oCost,
                totalProfit: mProfit,
                grossASP: m.totalQuantity ? (m.totalAmount / m.totalQuantity) : 0,
                netASP: mNetQ ? (mNet / mNetQ) : 0,
                returnPercent: m.totalQuantity ? ((m.refundedQuantity || 0) / m.totalQuantity) * 100 : 0,
                tacos: mNet ? (aSpend / mNet) * 100 : 0,
                profitMargin: mNet ? (mProfit / mNet) * 100 : 0
            };
        });

        
        const responseData = {
            isSuccess: true,
            data: {
                summary,
                monthlyData,
                chartData: monthlyData
            }
        };
        if (typeof cacheKey !== 'undefined') {
            await setCacheWithLog(cacheKey, JSON.stringify(responseData));
        }
        return res.status(200).json(responseData);

    } catch (error) {
        write_logs({ message: `[getProfitAnalysisMonthly Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        next(error);
    }
};

exports.getProfitAnalysisProducts = async (req, res, next) => {
    try {
        const { profileId, fromDate, toDate, search, categories, sortBy, sortDir } = req.body;
        const pageNo = Number(req.body.pageNo) || 1;
        const perPage = Number(req.body.perPage) || 25;
        const configId = req?.config?.configId;

        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile ID is required" });
        }

        const cacheKey = `profitAnalysis_products_${configId}_${profileId}_${JSON.stringify(req.body)}`;
        const cachedData = await getCacheWithLog(cacheKey);
        if (cachedData) {
            return res.status(200).json(JSON.parse(cachedData));
        }

        const profile = await getProfile(configId, Number(profileId));

        // --- 1. Fetch SKUs & ASINs from ProductListings ---
        let listingMatch = {
            configId: new mongoose.Types.ObjectId(configId),
            profileId: Number(profileId)
        };

        if (categories && categories.length > 0) {
            listingMatch.productType = { $in: categories };
        }

        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                listingMatch.$or = [
                    { sku: searchRegex },
                    { asin: searchRegex },
                    { itemName: searchRegex }
                ];
            }
        }

        const listings = await ProductListing.find(listingMatch, { sku: 1, asin: 1, itemName: 1, basePrice: 1, imageURL: 1 }).lean();

        let skus = listings.map(l => l.sku).filter(Boolean);
        let asins = listings.map(l => l.asin).filter(Boolean);

        if (skus.length === 0 && asins.length === 0) {
            
        const responseData = { isSuccess: true, data: [], totalRecords: 0 };
        if (typeof cacheKey !== 'undefined') {
            await setCacheWithLog(cacheKey, JSON.stringify(responseData));
        }
        return res.status(200).json(responseData);
        }

        // --- 2. OrderMatch Filter ---
        let orderMatch = {
            configId: new mongoose.Types.ObjectId(configId),
            profileId: Number(profileId)
        };

        if (fromDate && toDate) {
            orderMatch.orderCreatedTime = {
                $gte: moment.tz(fromDate, profile?.timezone).startOf("day").toDate(),
                $lte: moment.tz(toDate, profile?.timezone).endOf("day").toDate()
            };
        }

        // Apply category filter logic to OrderDetails
        if ((categories && categories.length > 0) && ((skus && skus.length > 0) || (asins && asins.length > 0))) {
            let catOr = [];
            if (skus && skus.length > 0) catOr.push({ "orderItems.product.sellerSku": { $in: skus } });
            if (asins && asins.length > 0) catOr.push({ "orderItems.product.asin": { $in: asins } });
            orderMatch.$or = catOr;
        }

        // --- 3. Base Pipeline ---
        let basePipeline = [
            { $match: orderMatch },
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] },
                                        { $eq: ["$transactionType", "Amazon Easy Ship Charges"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 0, totalAmazonFees: 1 } }
                    ],
                    as: "orderFeeData"
                }
            },
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] },
                                        { $eq: ["$transactionType", "Refund"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 0, totalProductCharges: 1 } }
                    ],
                    as: "orderRefundData"
                }
            },
            {
                $addFields: {
                    orderTotalQty: { $sum: "$orderItems.quantityOrdered" },
                    orderTotalShippingFee: {
                        $reduce: { input: "$orderFeeData", initialValue: 0, in: { $add: ["$$value", { $ifNull: ["$$this.totalAmazonFees", 0] }] } }
                    },
                    orderTotalRefundAmount: {
                        $reduce: { input: "$orderRefundData", initialValue: 0, in: { $add: ["$$value", { $ifNull: ["$$this.totalProductCharges", 0] }] } }
                    },
                    orderHasRefund: { $gt: [{ $size: "$orderRefundData" }, 0] }
                }
            },
            { $unwind: "$orderItems" },
            {
                $addFields: {
                    itemShippingFee: {
                        $cond: [
                            { $gt: ["$orderTotalQty", 0] },
                            { $multiply: [{ $divide: ["$orderTotalShippingFee", "$orderTotalQty"] }, "$orderItems.quantityOrdered"] },
                            0
                        ]
                    },
                    itemRefundAmount: {
                        $cond: [
                            { $gt: ["$orderTotalQty", 0] },
                            { $multiply: [{ $divide: ["$orderTotalRefundAmount", "$orderTotalQty"] }, "$orderItems.quantityOrdered"] },
                            0
                        ]
                    },
                    itemRefundQty: {
                        $cond: [
                            "$orderHasRefund",
                            "$orderItems.quantityOrdered",
                            0
                        ]
                    }
                }
            }
        ];

        // If search is applied, apply Regex to orderItems (similar to summary)
        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                // Check if orderMatch already had $or (from categories)
                if (orderMatch.$or) {
                    // If so, we need an $and. But since we are pushing to pipeline, we can just push a new $match!
                    basePipeline.push({
                        $match: {
                            $or: [
                                { orderId: searchRegex },
                                { "buyer.buyerEmail": searchRegex },
                                { "orderItems.product.asin": searchRegex },
                                { "orderItems.product.sellerSku": searchRegex },
                                { "orderItems.product.title": searchRegex },
                                { "orderItems.orderItemId": searchRegex }
                            ]
                        }
                    });
                } else {
                    basePipeline.push({
                        $match: {
                            $or: [
                                { orderId: searchRegex },
                                { "buyer.buyerEmail": searchRegex },
                                { "orderItems.product.asin": searchRegex },
                                { "orderItems.product.sellerSku": searchRegex },
                                { "orderItems.product.title": searchRegex },
                                { "orderItems.orderItemId": searchRegex }
                            ]
                        }
                    });
                }
            }
        }

        // Further restrict unwound items to only the matched category skus/asins
        if ((categories && categories.length > 0) && ((skus && skus.length > 0) || (asins && asins.length > 0))) {
            let catOr = [];
            if (skus && skus.length > 0) catOr.push({ "orderItems.product.sellerSku": { $in: skus } });
            if (asins && asins.length > 0) catOr.push({ "orderItems.product.asin": { $in: asins } });
            basePipeline.push({ $match: { $or: catOr } });
        }

        // Add the $lookup pipeline
        basePipeline.push(
            {
                $project: {
                    orderId: 1,
                    configId: 1,
                    profileId: 1,
                    orderStatus: 1,
                    sku: "$orderItems.product.sellerSku",
                    price: "$orderItems.product.price",
                    qty: "$orderItems.quantityOrdered",
                    itemShippingFee: 1,
                    itemRefundAmount: 1,
                    itemRefundQty: 1
                }
            },
            // Lookup Transactions (mapped by orderId AND sku!)
            {
                $lookup: {
                    from: "transactions",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId", sku: "$sku" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] },
                                        { $eq: ["$sellerSKU", "$$sku"] }
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 0, transactionType: 1, totalAmazonFees: 1,
                                commission: 1, fbaPerUnitFulfillmentFee: 1, fbaWeightBasedFee: 1,
                                fixedClosingFee: 1, variableClosingFee: 1, technologyFee: 1,
                                itemTDS: 1, mfnPostageFee: 1, tcsIGST: 1
                            }
                        }
                    ],
                    as: "feeData"
                }
            },
            // Lookup Reimbursements (mapped by orderId AND sku)
            {
                $lookup: {
                    from: "reimbursements",
                    let: { orderId: "$orderId", configId: "$configId", profileId: "$profileId", sku: "$sku" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$amazonOrderId", "$$orderId"] },
                                        { $eq: ["$configId", "$$configId"] },
                                        { $eq: ["$profileId", "$$profileId"] },
                                        { $eq: ["$sku", "$$sku"] }
                                    ]
                                }
                            }
                        },
                        { $project: { _id: 0, amountTotal: 1, quantityReimbursedTotal: 1 } }
                    ],
                    as: "reimbData"
                }
            },
            // Group By SKU
            {
                $group: {
                    _id: "$sku",
                    orderIds: { $addToSet: "$orderId" },
                    totalAmount: { $sum: { $multiply: ["$price", "$qty"] } },
                    totalQuantity: { $sum: "$qty" },

                    cancelledAmount: {
                        $sum: {
                            $cond: [
                                { $in: ["$orderStatus", ["Canceled", "Cancelled", "CANCELED", "CANCELLED"]] },
                                { $multiply: ["$price", "$qty"] },
                                0
                            ]
                        }
                    },
                    cancelledQuantity: {
                        $sum: {
                            $cond: [
                                { $in: ["$orderStatus", ["Canceled", "Cancelled", "CANCELED", "CANCELLED"]] },
                                "$qty",
                                0
                            ]
                        }
                    },

                    refundedAmount: {
                        $sum: "$itemRefundAmount"
                    },
                    refundedQuantity: {
                        $sum: "$itemRefundQty"
                    },

                    claimedAmount: {
                        $sum: {
                            $reduce: { input: "$reimbData", initialValue: 0, in: { $add: ["$$value", "$$this.amountTotal"] } }
                        }
                    },
                    claimedQuantity: {
                        $sum: {
                            $reduce: { input: "$reimbData", initialValue: 0, in: { $add: ["$$value", "$$this.quantityReimbursedTotal"] } }
                        }
                    },

                    commission: {
                        $sum: {
                            $reduce: {
                                input: "$feeData", initialValue: 0,
                                in: { $add: ["$$value", { $abs: { $ifNull: ["$$this.commission", 0] } }] }
                            }
                        }
                    },
                    fbaPickPack: {
                        $sum: {
                            $reduce: {
                                input: "$feeData", initialValue: 0,
                                in: { $add: ["$$value", { $abs: { $ifNull: ["$$this.fbaPerUnitFulfillmentFee", 0] } }] }
                            }
                        }
                    },
                    fbaWeight: {
                        $sum: {
                            $reduce: {
                                input: "$feeData", initialValue: 0,
                                in: { $add: ["$$value", { $abs: { $ifNull: ["$$this.fbaWeightBasedFee", 0] } }] }
                            }
                        }
                    },
                    closingFees: {
                        $sum: {
                            $reduce: {
                                input: "$feeData", initialValue: 0,
                                in: { $add: ["$$value", { $abs: { $ifNull: ["$$this.fixedClosingFee", 0] } }, { $abs: { $ifNull: ["$$this.variableClosingFee", 0] } }] }
                            }
                        }
                    },
                    easyShipFees: {
                        $sum: {
                            $reduce: {
                                input: "$feeData", initialValue: 0,
                                in: { $add: ["$$value", { $abs: { $ifNull: ["$$this.mfnPostageFee", 0] } }] }
                            }
                        }
                    },
                    techFees: {
                        $sum: {
                            $reduce: {
                                input: "$feeData", initialValue: 0,
                                in: { $add: ["$$value", { $abs: { $ifNull: ["$$this.technologyFee", 0] } }] }
                            }
                        }
                    },
                    amazonFees: {
                        $sum: {
                            $reduce: {
                                input: "$feeData",
                                initialValue: 0,
                                in: {
                                    $add: [
                                        "$$value",
                                        { $cond: [{ $in: ["$$this.transactionType", ["Order Payment", "Refund"]] }, { $abs: { $ifNull: ["$$this.totalAmazonFees", 0] } }, 0] }
                                    ]
                                }
                            }
                        }
                    },
                    shippingFees: {
                        $sum: "$itemShippingFee"
                    },
                    otherCost: {
                        $sum: {
                            $reduce: {
                                input: "$feeData", initialValue: 0,
                                in: {
                                    $add: [
                                        "$$value",
                                        { $ifNull: ["$$this.itemTDS", 0] },
                                        { $cond: [{ $ne: ["$$this.transactionType", "Amazon Easy Ship Charges"] }, { $ifNull: ["$$this.mfnPostageFee", 0] }, 0] },
                                        { $ifNull: ["$$this.tcsIGST", 0] }
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        );

        const ordersAgg = await OrderDetails.aggregate(basePipeline);
        const orderMap = ordersAgg.reduce((acc, curr) => { acc[curr._id] = curr; return acc; }, {});

        // --- 4. Product Ads (SP, SB, SD) ---
        let reportDateMatch = { configId: new mongoose.Types.ObjectId(configId), profileId: Number(profileId) };
        if (fromDate && toDate) {
            reportDateMatch.reportDate = {
                $gte: moment(fromDate).format("YYYY-MM-DD"),
                $lte: moment(toDate).format("YYYY-MM-DD")
            };
        }

        if ((skus && skus.length > 0) || (asins && asins.length > 0)) {
            let adCatOr = [];
            if (skus && skus.length > 0) adCatOr.push({ sku: { $in: skus } });
            if (asins && asins.length > 0) adCatOr.push({ asins: { $in: asins } });
            reportDateMatch.$or = adCatOr;
        }

        if (search) {
            const searchRegex = getSearchRegex(search);
            if (searchRegex) {
                if (reportDateMatch.$or) {
                    reportDateMatch.$and = [
                        { $or: reportDateMatch.$or },
                        { $or: [{ name: searchRegex }, { sku: searchRegex }, { asins: searchRegex }] }
                    ];
                    delete reportDateMatch.$or;
                } else {
                    reportDateMatch.$or = [
                        { name: searchRegex },
                        { sku: searchRegex },
                        { asins: searchRegex }
                    ];
                }
            }
        }

        const [spAdAgg, sdAdAgg, sbAdAgg] = await Promise.all([
            ProductAds.aggregate([{ $match: reportDateMatch }, { $group: { _id: "$sku", spend: { $sum: "$spend" }, sales: { $sum: "$sales" } } }]),
            SdProductAds.aggregate([{ $match: reportDateMatch }, { $group: { _id: "$sku", spend: { $sum: "$spend" }, sales: { $sum: "$sales" } } }]),
            SbProductAds.aggregate([{ $match: reportDateMatch }, { $group: { _id: "$sku", spend: { $sum: "$spend" }, sales: { $sum: "$sales" } } }])
        ]);

        const spMap = spAdAgg.reduce((acc, curr) => { if (curr._id) acc[curr._id] = curr.spend; return acc; }, {});
        const sdMap = sdAdAgg.reduce((acc, curr) => { if (curr._id) acc[curr._id] = curr.spend; return acc; }, {});
        const sbMap = sbAdAgg.reduce((acc, curr) => { if (curr._id) acc[curr._id] = curr.spend; return acc; }, {});

        // --- 5. Merge and Transform ---
        let finalResult = listings.map(listing => {
            const sku = listing.sku;
            const ord = orderMap[sku] || {
                totalAmount: 0, totalQuantity: 0, cancelledAmount: 0, cancelledQuantity: 0,
                refundedAmount: 0, refundedQuantity: 0, claimedAmount: 0, claimedQuantity: 0,
                commission: 0, fbaPickPack: 0, fbaWeight: 0, closingFees: 0, easyShipFees: 0, techFees: 0,
                amazonFees: 0, shippingFees: 0, otherCost: 0, orderIds: []
            };

            const spSpend = spMap[sku] || 0;
            const sdSpend = sdMap[sku] || 0;
            const sbSpend = sbMap[sku] || 0;
            const totalAdSpend = spSpend + sdSpend + sbSpend;

            const rSales = Math.abs(ord.refundedAmount || 0);
            const comm = Math.abs(ord.commission || 0);
            const fbaPP = Math.abs(ord.fbaPickPack || 0);
            const fbaWt = Math.abs(ord.fbaWeight || 0);
            const closing = Math.abs(ord.closingFees || 0);
            const easyShip = Math.abs(ord.easyShipFees || 0);
            const tech = Math.abs(ord.techFees || 0);
            const aFees = (comm + fbaPP + fbaWt + closing + easyShip + tech) || Math.abs(ord.amazonFees || 0);

            const sFees = Math.abs(ord.shippingFees || 0);
            const oCost = Math.abs(ord.otherCost || 0);
            const cSales = ord.claimedAmount || 0;
            const cQty = ord.claimedQuantity || 0;

            const netSales = ord.totalAmount - rSales + cSales;
            const grossQty = ord.totalQuantity || 0;
            const returnQty = ord.refundedQuantity || 0;
            const netQty = Math.max(0, grossQty - returnQty + cQty);
            const orderCount = Array.isArray(ord.orderIds) && ord.orderIds.length > 0 ? ord.orderIds.length : (grossQty > 0 ? 1 : 0);

            const unitBasePrice = listing.basePrice || 0;
            const productCost = netQty > 0 ? unitBasePrice * netQty : 0;

            const grossProfit = netSales - productCost - aFees - sFees;
            const totalProfit = grossProfit - oCost - totalAdSpend;
            const netMarginPct = netSales > 0 ? (totalProfit / netSales) * 100 : 0;

            const profitPerUnit = netQty > 0 ? (totalProfit / netQty) : 0;
            const profitPerOrder = orderCount > 0 ? (totalProfit / orderCount) : 0;

            // Break-Even Metrics
            const unitPrice = grossQty > 0 ? (ord.totalAmount / grossQty) : (listing.sellingPrice || 0);
            const unitFees = grossQty > 0 ? (aFees / grossQty) : 0;
            const breakEvenAcos = unitPrice > 0 ? Math.max(0, ((unitPrice - unitFees - unitBasePrice) / unitPrice) * 100) : 0;
            const breakEvenRoas = breakEvenAcos > 0 ? parseFloat((100 / breakEvenAcos).toFixed(2)) : 0;

            // Status Badge
            let statusTag = "🟢 Profitable";
            if (totalProfit < 0) {
                if (grossProfit > 0 && totalAdSpend > grossProfit) statusTag = "🔴 Ad Loss";
                else if (grossQty > 0 && (returnQty / grossQty) > 0.15) statusTag = "⚠️ High Return";
                else if (ord.totalAmount > 0 && aFees > (ord.totalAmount * 0.45)) statusTag = "📦 Fee Heavy";
                else statusTag = "🔴 Loss-Making";
            } else if (grossProfit > 0 && netSales > 0 && (totalAdSpend / netSales) * 100 > breakEvenAcos) {
                statusTag = "🟠 Ad Bleeding";
            }

            return {
                productDetails: {
                    name: listing.itemName,
                    sku: listing.sku,
                    asin: listing.asin,
                    image: listing.imageUrl || listing.imageURL || ""
                },
                // Quantities
                grossQty,
                returnQty,
                returnPercent: grossQty > 0 ? (returnQty / grossQty) * 100 : 0,
                netQty,
                orderCount,

                // Sales
                grossSales: ord.totalAmount,
                returnSales: rSales,
                netSales,
                unitBasePrice,
                productCost,

                // Granular Fees
                commission: comm,
                fbaPickPack: fbaPP,
                fbaWeight: fbaWt,
                closingFees: closing,
                easyShipFees: easyShip,
                techFees: tech,
                amazonFees: aFees,
                shippingFees: sFees,
                feePercent: netSales > 0 ? (aFees / netSales) * 100 : 0,

                // Ad Spend Breakdown
                spAdSpend: spSpend,
                sbAdSpend: sbSpend,
                sdAdSpend: sdSpend,
                adSpend: totalAdSpend,
                tacos: netSales > 0 ? (totalAdSpend / netSales) * 100 : 0,

                // Bottomline & Unit Economics
                otherCost: oCost,
                grossProfit,
                profit: totalProfit,
                profitPercent: netMarginPct,
                profitPerUnit,
                profitPerOrder,
                breakEvenAcos,
                breakEvenRoas,
                statusTag,

                // Extra fields
                cancelledSales: ord.cancelledAmount,
                cancelledQty: ord.cancelledQuantity,
                claimedSales: cSales,
                claimedQty: cQty
            };
        });

        // Filter out products with strictly zero activity if no specific search/category was applied
        if (!search && (!categories || categories.length === 0)) {
            finalResult = finalResult.filter(item =>
                item.grossQty > 0 ||
                item.adSpend > 0 ||
                item.returnQty > 0 ||
                item.netQty > 0
            );
        }

        const totalRecords = finalResult.length;

        // Sort
        if (sortBy) {
            finalResult.sort((a, b) => {
                let valA, valB;
                if (sortBy === 'productDetails') {
                    valA = a.productDetails?.name || "";
                    valB = b.productDetails?.name || "";
                } else {
                    valA = a[sortBy] || 0;
                    valB = b[sortBy] || 0;
                }

                if (typeof valA === 'string' && typeof valB === 'string') {
                    return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
                return sortDir === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
            });
        } else {
            // Default sort by netSales desc
            finalResult.sort((a, b) => b.netSales - a.netSales);
        }

        // Paginate
        const skip = (pageNo - 1) * perPage;
        const paginatedResult = finalResult.slice(skip, skip + perPage);

        
        const responseData = {
            isSuccess: true,
            data: paginatedResult,
            totalRecords
        };
        if (typeof cacheKey !== 'undefined') {
            await setCacheWithLog(cacheKey, JSON.stringify(responseData));
        }
        return res.status(200).json(responseData);

    } catch (error) {
        write_logs({ message: `[getProfitAnalysisProducts Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        next(error);
    }
};
