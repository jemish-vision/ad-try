const ruleConditionSnapshotSchema = require("../models/ruleConditionSnapshot.model");
const moment = require("moment-timezone");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const { sendEmailHelper } = require("../helper/emailHelper");

/* ---- Config & Auth Models ---- */
const configSchema = require("../models/config.model");
const sellerConfigSchema = require("../models/sellerConfig.model");
const profileSchema = require("../models/profiles.model");
const configHistorySchema = require("../models/configHistory.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const userSchema = require("../models/user.model");

/* ---- SP Ads Data (Tier 1) ---- */
const campaignSchema = require("../models/campaign.model");
const adGroupSchema = require("../models/adGroups.model");
const keywordSchema = require("../models/keyword.model");
const placementSchema = require("../models/placement.model");
const targetingSchema = require("../models/targeting.model");
const productAdSchema = require("../models/productAds.model");
const searchTermSchema = require("../models/searchTerm.model");

/* ---- SB Ads Data ---- */
const sbCampaignSchema = require("../models/sbCampaign.model");
const sbAdGroupSchema = require("../models/sbAdGroups.model");
const sbProductAdSchema = require("../models/sbProductAds.model");
const sbPlacementSchema = require("../models/sbPlacement.model");
const sbTargetingSchema = require("../models/sbTargeting.model");
const sbSearchTermSchema = require("../models/sbSearchTerm.model");
const sbProductSchema = require("../models/sbProduct.model");

/* ---- SD Ads Data ---- */
const sdCampaignSchema = require("../models/sdCampaign.model");
const sdAdGroupSchema = require("../models/sdAdGroups.model");
const sdProductAdSchema = require("../models/sdProductAds.model");
const sdPlacementSchema = require("../models/sdPlacement.model");
const sdTargetingSchema = require("../models/sdTargeting.model");
const sdSearchTermSchema = require("../models/sdSearchTerm.model");
const sdProductSchema = require("../models/sdProduct.model");

/* ---- Seller & Order Data (Tier 2) ---- */
const orderSchema = require("../models/order.model");
const orderDetailSchema = require("../models/orderDetails.model");
const inventorySchema = require("../models/inventory.model");
const returnSchema = require("../models/return.model");
const reimbursementSchema = require("../models/reimbursement.model");
const transactionSchema = require("../models/transactions.model");
const productListingSchema = require("../models/productListing.model");
const productSchema = require("../models/product.model");
const couponSchema = require("../models/coupons.model");
const dealPerformanceSchema = require("../models/dealPerformance.model");
const businessProductSalesSchema = require("../models/businessProductSales.model");

/* ---- Rules & Settings (Tier 3) ---- */
const budgetRuleSchema = require("../models/budgetRules.model");
const budgetRuleHistorySchema = require("../models/budgetRuleHistory.model");
const placementRuleSchema = require("../models/placementRules.model");
const placementRuleHistorySchema = require("../models/placementRuleHistory.model");
const searchTermRuleSchema = require("../models/searchTermRules.model");
const searchTermRuleHistorySchema = require("../models/searchTermRuleHistory.model");
const searchTermAppliedSchema = require("../models/searchTermApplied.model");
const searchTermBlockedSchema = require("../models/searchTermBlocked.model");
const searchTermDeletedSchema = require("../models/searchTermDeleted.model");
const targetingRuleSchema = require("../models/targetingRuleSchema.model");
const targetingRuleHistorySchema = require("../models/targetingRuleHistory.model");
const daypartingRuleSchema = require("../models/daypartingRule.model");
const daypartingRuleHistorySchema = require("../models/daypartingRuleHistory.model");
const recommendationRuleSchema = require("../models/recomandationRules.model");
const recommendationCampaignSchema = require("../models/recommandationCampaignByRule.model");
const recommendationStatusSchema = require("../models/recommandationStatus.model");
const recommendationSchema = require("../models/recommendation.model");
const defaultTargetAcosSchema = require("../models/defaultTargetAcos.model");
const campaignSettingSchema = require("../models/camapignSetting.model");
const campaignBidThresholdSchema = require("../models/campaignBidThreshold.model");

/* ---- History & Logs (Tier 4) ---- */
// const campaignHistorySchema = require("../models/campaignHistory.model");
const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const ruleRunHistorySchema = require("../models/ruleRunHistory.model");
const affectedCampaignSchema = require("../models/affectedCampaignByRule.model");
const reportSchema = require("../models/report.model");
const profitLossHistorySchema = require("../models/profitLossHistory.model");
const averageAOVSchema = require("../models/averageAOV.model");

/* ---- Other ---- */
const spProfileSettingSchema = require("../models/spProfileSetting.model");
const keywordsHourlyPerformanceSchema = require("../models/keywordsHourlyPerformanceSchema.model");
const amsSubscriptionSchema = require("../models/amsSubscription.model");
const filterSchema = require("../models/filter.model");
const { buildDataDeletedEmail } = require("../../emailTemplate/buildDataDeletedEmail");

exports.cronDeleteExpiredAccountsData = async () => {
  cron_logs({
    message: `India Time = ${moment().tz("Asia/Kolkata").format("HH:mm")} Cleanup Expired Inactive Accounts`,
    log_type: "info",
  });

  try {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    /* ====================================================================
       1. SURGICAL ADS CLEANUP (Type 1 — expired disconnected config records)
       ==================================================================== */
    const expiredConfigs = await configSchema.find({
      isActive: false,
      disconnectedAt: { $ne: null, $lte: cutoffDate },
    }).lean();

    if (expiredConfigs.length > 0) {
      cron_logs({
        message: `Found ${expiredConfigs.length} expired Ads configs to clean up`,
        log_type: "info",
      });

      for (const config of expiredConfigs) {
        const configId = config._id;

        try {
          const profiles = await profileSchema.find({ configId }).lean();
          const profileIds = profiles.map(p => p.profileId);

          cron_logs({
            message: `Cleaning up Ads data for configId=${configId}, profilesCount=${profileIds.length}`,
            log_type: "info",
          });

          const filter = { configId };
          let totalDeleted = 0;

          // Collections related solely to Ads (Tiers 1, 3, 4)
          const adsCollections = [
            // Tier 1: SP Ads Data
            { model: campaignSchema, name: "campaigns" },
            { model: adGroupSchema, name: "adgroups" },
            { model: keywordSchema, name: "keywords" },
            { model: placementSchema, name: "placements" },
            { model: targetingSchema, name: "targetings" },
            { model: productAdSchema, name: "productads" },
            { model: searchTermSchema, name: "searchterms" },
            // Tier 1: SB Ads Data
            { model: sbCampaignSchema, name: "sbcampaigns" },
            { model: sbAdGroupSchema, name: "sbadgroups" },
            { model: sbProductAdSchema, name: "sbproductads" },
            { model: sbPlacementSchema, name: "sbplacements" },
            { model: sbTargetingSchema, name: "sbtargetings" },
            { model: sbSearchTermSchema, name: "sbsearchterms" },
            { model: sbProductSchema, name: "sbproducts" },
            // Tier 1: SD Ads Data
            { model: sdCampaignSchema, name: "sdcampaigns" },
            { model: sdAdGroupSchema, name: "sdadgroups" },
            { model: sdProductAdSchema, name: "sdproductads" },
            { model: sdPlacementSchema, name: "sdplacements" },
            { model: sdTargetingSchema, name: "sdtargetings" },
            { model: sdSearchTermSchema, name: "sdsearchterms" },
            { model: sdProductSchema, name: "sdproducts" },
            // Tier 3: Rules & Settings
            { model: ruleConditionSnapshotSchema, name: "ruleconditionsnapshots" },
            { model: budgetRuleSchema, name: "budgetrules" },
            { model: budgetRuleHistorySchema, name: "budgetrulehistories" },
            { model: placementRuleSchema, name: "placementrules" },
            { model: placementRuleHistorySchema, name: "placementrulehistories" },
            { model: searchTermRuleSchema, name: "searchtermrules" },
            { model: searchTermRuleHistorySchema, name: "searchtermrulehistories" },
            { model: searchTermAppliedSchema, name: "searchtermapplieds" },
            { model: searchTermBlockedSchema, name: "searchtermblockeds" },
            { model: searchTermDeletedSchema, name: "searchtermdeleteds" },
            { model: targetingRuleSchema, name: "targetingrules" },
            { model: targetingRuleHistorySchema, name: "targetingrulehistories" },
            { model: daypartingRuleSchema, name: "daypartingrules" },
            { model: daypartingRuleHistorySchema, name: "daypartingrulehistories" },
            { model: recommendationRuleSchema, name: "recomandationrules" },
            { model: recommendationCampaignSchema, name: "recommandationcampaignbyrules" },
            { model: recommendationStatusSchema, name: "recommandationstatuses" },
            { model: recommendationSchema, name: "recommendations" },
            { model: defaultTargetAcosSchema, name: "defaulttargetacos" },
            { model: campaignSettingSchema, name: "campaignsettings" },
            { model: campaignBidThresholdSchema, name: "campaignbidthresholds" },
            // Tier 4: History & Logs
            // { model: campaignHistorySchema, name: "campaignhistories" },
            { model: campaignChangeHistorySchema, name: "campaignchangehistories" },
            { model: cronJobHistorySchema, name: "cronjobhistories" },
            { model: ruleRunHistorySchema, name: "rulerunhistories" },
            { model: affectedCampaignSchema, name: "affectedcampaignbyrules" },
            { model: reportSchema, name: "reports" },
            { model: profitLossHistorySchema, name: "profitlosshistories" },
            { model: averageAOVSchema, name: "averageaovs" },
            // Other settings
            { model: spProfileSettingSchema, name: "spprofilesettings" },
            { model: amsSubscriptionSchema, name: "amssubscriptions" },
            { model: filterSchema, name: "filters" },
            { model: keywordsHourlyPerformanceSchema, name: "keywordsHourlyPerformance" },
          ];

          // Delete Ads data
          for (const { model, name } of adsCollections) {
            try {
              const result = await model.deleteMany(filter);
              if (result.deletedCount > 0) {
                totalDeleted += result.deletedCount;
                cron_logs({
                  message: `  ✓ ${name}: ${result.deletedCount} deleted`,
                  log_type: "info",
                });
              }
            } catch (err) {
              cron_logs({
                message: `  ✗ ${name}: ${err.message}`,
                log_type: "error",
              });
            }
          }

          // Delete profiles
          const profileResult = await profileSchema.deleteMany({ configId });
          totalDeleted += profileResult.deletedCount;

          // Delete config history
          const historyResult = await configHistorySchema.deleteMany({ configId });
          totalDeleted += historyResult.deletedCount;

          // Delete the config itself
          await configSchema.deleteOne({ _id: configId });
          totalDeleted += 1;

          // Send confirmation email
          try {
            const userAccess = await profileBasedPermissionSchema.findOne({ configId: configId }).lean();
            if (userAccess) {
              const user = await userSchema.findById(userAccess.userId).lean();
              if (user?.email) {
                await sendEmailHelper(
                  user.email,
                  "Your AdvertiseIQ Advertising data has been permanently deleted",
                  buildDataDeletedEmail({ userName: user?.fullName || "there", type: "ads" })
                );
              }
              await profileBasedPermissionSchema.deleteMany({ configId: configId });
            }
          } catch (emailErr) {
            cron_logs({ message: `Ads Deletion email failed: ${emailErr.message}`, log_type: "error" });
          }

          cron_logs({
            message: `✅ Ads Cleanup COMPLETE for configId=${configId}. Total records deleted: ${totalDeleted}`,
            log_type: "info",
          });

        } catch (innerErr) {
          cron_logs({
            message: `Ads Cleanup FAILED for configId=${configId}: ${innerErr.message}`,
            log_type: "error",
          });
        }
      }
    }

    /* ====================================================================
       2. SURGICAL SP-API CLEANUP (Type 2 — expired disconnected sellerConfigs)
       ==================================================================== */
    const expiredSellerConfigs = await sellerConfigSchema.find({
      isActive: false,
      disconnectedAt: { $ne: null, $lte: cutoffDate },
    }).lean();

    if (expiredSellerConfigs.length > 0) {
      cron_logs({
        message: `Found ${expiredSellerConfigs.length} expired SP-API sellerConfigs to clean up`,
        log_type: "info",
      });

      for (const sellerConfig of expiredSellerConfigs) {
        const sellerConfigId = sellerConfig._id;
        const configId = sellerConfig?.configId;
        const profileId = sellerConfig?.profileId;

        try {
          cron_logs({
            message: `Cleaning up SP-API seller data for configId=${configId}, sellerConfigId=${sellerConfigId}, profileId=${profileId}`,
            log_type: "info",
          });

          // Delete from SP-API Seller tables using configId (Tier 2 Data)
          const filter = { configId, profileId };
          let totalDeleted = 0;

          const sellerCollections = [
            { model: orderSchema, name: "orders" },
            { model: orderDetailSchema, name: "orderdetails" },
            { model: inventorySchema, name: "inventories" },
            { model: returnSchema, name: "returns" },
            { model: reimbursementSchema, name: "reimbursements" },
            { model: transactionSchema, name: "transactions" },
            { model: productListingSchema, name: "productlistings" },
            { model: productSchema, name: "products" },
            { model: couponSchema, name: "coupons" },
            { model: dealPerformanceSchema, name: "dealperformances" },
            { model: businessProductSalesSchema, name: "businessproductsales" },
          ];

          // Delete Seller Data
          for (const { model, name } of sellerCollections) {
            try {
              const result = await model.deleteMany(filter);
              if (result.deletedCount > 0) {
                totalDeleted += result.deletedCount;
                cron_logs({
                  message: `  ✓ ${name}: ${result.deletedCount} deleted`,
                  log_type: "info",
                });
              }
            } catch (err) {
              cron_logs({
                message: `  ✗ ${name}: ${err.message}`,
                log_type: "error",
              });
            }
          }

          // Delete the sellerConfig itself
          await sellerConfigSchema.deleteOne({ _id: sellerConfigId });
          totalDeleted += 1;

          // Send confirmation email
          try {
            const userAccess = await profileBasedPermissionSchema.findOne({ configId: configId }).lean();
            if (userAccess) {
              const user = await userSchema.findById(userAccess.userId).lean();
              if (user?.email) {
                await sendEmailHelper(
                  user.email,
                  "Your AdvertiseIQ Seller SP-API data has been permanently deleted",
                  buildDataDeletedEmail({ userName: user?.fullName || "there", type: "sp" })
                );
              }
            }
          } catch (emailErr) {
            cron_logs({ message: `SP Deletion email failed: ${emailErr.message}`, log_type: "error" });
          }

          cron_logs({
            message: `✅ SP-API Cleanup COMPLETE for sellerConfigId=${sellerConfigId}. Total records deleted: ${totalDeleted}`,
            log_type: "info",
          });

        } catch (innerErr) {
          cron_logs({
            message: `SP-API Cleanup FAILED for sellerConfigId=${sellerConfigId}: ${innerErr.message}`,
            log_type: "error",
          });
        }
      }
    }

    /* ====================================================================
       3. REPORT FILES DISK CLEANUP (Files older than 15 days in uploads/)
       ==================================================================== */
    try {
      const { cronDeleteOldReportFiles } = require("./reportCleanup.service");
      await cronDeleteOldReportFiles(15);
    } catch (cleanupErr) {
      cron_logs({
        message: `Report files cleanup error: ${cleanupErr.message}`,
        log_type: "warn",
      });
    }

    cron_logs({
      message: "Account Data Cleanup cron completed successfully.",
      log_type: "info",
    });

  } catch (error) {
    cron_logs({
      message: `Account Data Cleanup Main Error: ${error.message}`,
      log_type: "error",
    });
  }
};
