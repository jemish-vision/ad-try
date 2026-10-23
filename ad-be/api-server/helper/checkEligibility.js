

const productAdsSchema = require("../models/productAds.model");
const sbProductAdsSchema = require("../models/sbProductAds.model");
const sdProductAdsSchema = require("../models/sdProductAds.model");

const camapignSettingSchema = require("../models/camapignSetting.model");
const AD_TYPE_COLLECTIONS = require("./adTypeCollections");

const checkProductAvailability = async (configId, profileId, campaignIds, reportDate) => {
  let eligibleRatio = 100;
  const pipeline = [
    {
      $match: {
        campaignId: {
          $in: campaignIds
        },
        reportDate: reportDate
      }
    },
    {
      $project: {
        configId: 1,
        profileId: 1,
        reportDate: 1,
        campaignId: 1,
        asins: 1,
        sku: 1,
        status: 1
      }
    },
    {
      $lookup: {
        from: "products",
        let: {
          asin: "$asins",
          rDate: reportDate
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$asin", "$$asin"]
                  },
                  {
                    $eq: ["$reportDate", "$$rDate"]
                  }
                ]
              }
            }
          },
          {
            $project: {
              availability: 1
            }
          }
        ],
        as: "product"
      }
    },
    {
      $unwind: {
        path: "$product",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $group: {
        _id: null,
        totalProducts: {
          $sum: 1
        },
        totalInStockProducts: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$product.availability",
                  "IN_STOCK"
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalProducts: 1,
        totalInStockProducts: 1
      }
    }
  ];
  const products = await productAdsSchema.aggregate(pipeline).allowDiskUse(true);

  if (products && products.length > 0) {
    eligibleRatio = (products[0].totalProducts > 0) ? ((products[0].totalInStockProducts / products[0].totalProducts) * 100) : 0;
  }

  const setting = await camapignSettingSchema.findOne({
    configId,
    profileId
  }).lean();

  const eligibilityThreshold = setting.productEligibilityThreshold || 80;
  return eligibleRatio > eligibilityThreshold;
}

const checkCampaignProductAvailability = async (
  configId,
  profileId,
  campaignIds,
  reportDate,
  type = "SP"
) => {
  const cfgId = configId ? (configId instanceof require("mongoose").Types.ObjectId ? configId : new (require("mongoose").Types.ObjectId)(configId)) : null;
  const pId = profileId !== undefined && profileId !== null ? Number(profileId) : null;

  const pipeline = [
    {
      $match: {
        ...(cfgId ? { configId: cfgId } : {}),
        ...(pId !== null ? { profileId: pId } : {}),
        campaignId: { $in: campaignIds },
        reportDate: reportDate
      }
    },
    {
      $project: {
        campaignId: 1,
        asins: 1,
        reportDate: 1
      }
    },
    {
      $lookup: {
        from: AD_TYPE_COLLECTIONS?.[type]?.["product"] || "products",
        let: { asin: "$asins", rDate: reportDate, cId: cfgId, profId: pId },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  ...(cfgId ? [{ $eq: ["$configId", "$$cId"] }] : []),
                  ...(pId !== null ? [{ $eq: ["$profileId", "$$profId"] }] : []),
                  { $eq: ["$asin", "$$asin"] },
                  { $eq: ["$reportDate", "$$rDate"] }
                ]
              }
            }
          },
          { $project: { availability: 1 } }
        ],
        as: "product"
      }
    },
    {
      $unwind: {
        path: "$product",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $group: {
        _id: "$campaignId",
        totalProducts: { $sum: 1 },
        totalInStockProducts: {
          $sum: {
            $cond: [
              { $eq: ["$product.availability", "IN_STOCK"] },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        campaignId: "$_id",
        totalProducts: 1,
        totalInStockProducts: 1
      }
    }
  ];

  const model = type === "SB" ? sbProductAdsSchema : type === "SD" ? sdProductAdsSchema : productAdsSchema

  const results = await model.aggregate(pipeline).allowDiskUse(true);

  const setting = await camapignSettingSchema.findOne({ configId, profileId }).lean();

  const threshold = setting?.productEligibilityThreshold ?? 80;

  // 🔥 Build final campaign report
  const campaignReport = results.map((c) => {
    const ratio = c.totalProducts > 0 ? (c.totalInStockProducts / c.totalProducts) * 100 : 0;
    return {
      campaignId: c.campaignId,
      totalProducts: c.totalProducts,
      totalInStockProducts: c.totalInStockProducts,
      availabilityRatio: Number(ratio.toFixed(2)),
      threshold,
      isEligible: ratio >= threshold,
    };
  });

  // 🔥 Only low stock campaigns (for quick UI)
  const lowStockCampaigns = campaignReport.filter((c) => !c.isEligible);

  return {
    isRuleEligible: !lowStockCampaigns?.length,
    threshold,
    totalCampaigns: campaignReport.length,
    lowStockCount: lowStockCampaigns.length,
    campaigns: campaignReport,
    lowStockCampaigns
  };
};

module.exports = {
  checkProductAvailability,
  checkCampaignProductAvailability,
};