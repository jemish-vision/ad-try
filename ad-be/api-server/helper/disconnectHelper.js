const mongoose = require("mongoose");
const configSchema = require("../models/config.model");
const sellerConfigSchema = require("../models/sellerConfig.model");
const profileSchema = require("../models/profiles.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const userSchema = require("../models/user.model");
const auditLogSchema = require("../models/auditLog.model");
const configHistorySchema = require("../models/configHistory.model");
const { sendEmailHelper } = require("./emailHelper");
const { buildDisconnectEmail } = require("../../emailTemplate/buildDisconnectEmail");
const {
  clearAccessTokenCache,
  clearSPAccessTokenCache,
  clearProfileCache,
  clearActivePlanProfilesCache,
} = require("../services/redis.service");
const { write_logs } = require("../../winston/utility/logger");
const { cron_logs } = require("../../winston/cronAutomation/logger");

/**
 * Automatically handle disconnection of a Seller Central (SP-API) account.
 * Sets isActive to false, marks disconnectedAt, disables SP sync on profile,
 * clears Redis caches, writes audit & history logs, and notifies user via email.
 */
const handleAutoDisconnectSP = async ({ configId, profileId, sellerConfigId, reason = "Amazon LWA token revoked or invalid grant" }) => {
  try {
    let sellerConfig = null;
    if (sellerConfigId) {
      sellerConfig = await sellerConfigSchema.findById(sellerConfigId);
    } else if (configId && profileId) {
      sellerConfig = await sellerConfigSchema.findOne({ configId, profileId });
    }

    if (!sellerConfig) {
      write_logs({ message: `[handleAutoDisconnectSP] sellerConfig not found for id=${sellerConfigId}, configId=${configId}, profileId=${profileId}`, log_type: "warn" });
      return false;
    }

    if (!sellerConfig.isActive && sellerConfig.disconnectedAt) {
      // Already marked as disconnected
      return true;
    }

    const now = new Date();
    sellerConfig.isActive = false;
    sellerConfig.disconnectedAt = now;
    await sellerConfig.save();

    // Disable SP sync on profile
    await profileSchema.updateOne(
      { configId: sellerConfig.configId, profileId: sellerConfig.profileId },
      { $set: { isSpSyncEnabled: false } }
    );

    // Clear caches
    await clearSPAccessTokenCache(sellerConfig.configId?.toString(), sellerConfig.profileId);
    await clearProfileCache(sellerConfig.configId?.toString(), sellerConfig.profileId);
    await clearActivePlanProfilesCache(sellerConfig.profileId);

    // Write audit log
    await auditLogSchema.create({
      userId: sellerConfig.userId || null,
      sellerConfigId: sellerConfig._id,
      configId: sellerConfig.configId,
      event: "SELLER_CONFIG_DISCONNECT",
      message: `Amazon Seller config automatically disconnected. Reason: ${reason}`,
      metadata: {
        sellerId: sellerConfig.sellerId,
        profileId: sellerConfig.profileId,
        reason,
        disconnectedAt: now,
        autoDisconnect: true,
      },
    }).catch((err) => write_logs({ message: `[AuditLog Error] ${err.message}`, log_type: "error" }));

    // Write config history
    await configHistorySchema.create({
      configId: sellerConfig.configId,
      event: "AUTO_DISCONNECT_SP",
    }).catch(() => {});

    // Send email notification to user
    try {
      let targetUser = null;
      if (sellerConfig.userId) {
        targetUser = await userSchema.findById(sellerConfig.userId).lean();
      }
      if (!targetUser && sellerConfig.configId) {
        const userAccess = await profileBasedPermissionSchema.findOne({ configId: sellerConfig.configId }).lean();
        if (userAccess) {
          targetUser = await userSchema.findById(userAccess.userId).lean();
        }
      }

      const profile = await profileSchema.findOne({ configId: sellerConfig.configId, profileId: sellerConfig.profileId }).lean();
      const purgeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (targetUser?.email) {
        await sendEmailHelper(
          targetUser.email,
          "⚠️ Your AdvertiseIQ Seller Central Connection Was Disconnected",
          buildDisconnectEmail({
            userName: targetUser.fullName,
            profileNames: profile?.name || `Seller Profile ${sellerConfig.profileId}`,
            purgeDate: purgeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
            signInUrl: process.env.BASE_URL,
            type: "sp",
          })
        );
      }
    } catch (emailErr) {
      cron_logs({ message: `[handleAutoDisconnectSP] Email notification failed: ${emailErr.message}`, log_type: "error" });
    }

    cron_logs({
      message: `[handleAutoDisconnectSP] Successfully auto-disconnected sellerConfig ${sellerConfig._id} (profileId: ${sellerConfig.profileId})`,
      log_type: "info",
    });

    return true;
  } catch (err) {
    write_logs({ message: `[handleAutoDisconnectSP Error] ${err?.message || err}`, log_type: "error" });
    return false;
  }
};

/**
 * Automatically handle disconnection of an Amazon Advertising (Ads) account.
 */
const handleAutoDisconnectAds = async ({ configId, reason = "Amazon LWA token revoked or invalid grant" }) => {
  try {
    const config = await configSchema.findById(configId);
    if (!config) {
      write_logs({ message: `[handleAutoDisconnectAds] config not found for id=${configId}`, log_type: "warn" });
      return false;
    }

    if (!config.isActive && config.disconnectedAt) {
      return true;
    }

    const now = new Date();
    config.isActive = false;
    config.disconnectedAt = now;
    await config.save();

    // Disable Ads sync on all profiles linked to this config
    await profileSchema.updateMany(
      { configId: config._id },
      { $set: { isAdsSyncEnabled: false } }
    );

    // Clear caches
    await clearAccessTokenCache(config._id.toString());
    await clearActivePlanProfilesCache("ALL");

    // Write audit log
    await auditLogSchema.create({
      configId: config._id,
      event: "CONFIG_DISCONNECT",
      message: `Amazon Ads config automatically disconnected. Reason: ${reason}`,
      metadata: {
        companyName: config.companyName,
        reason,
        disconnectedAt: now,
        autoDisconnect: true,
      },
    }).catch((err) => write_logs({ message: `[AuditLog Error] ${err.message}`, log_type: "error" }));

    // Write config history
    await configHistorySchema.create({
      configId: config._id,
      event: "AUTO_DISCONNECT_ADS",
    }).catch(() => {});

    // Send email notification
    try {
      let targetUser = null;
      const userAccess = await profileBasedPermissionSchema.findOne({ configId: config._id }).lean();
      if (userAccess) {
        targetUser = await userSchema.findById(userAccess.userId).lean();
      }

      const profiles = await profileSchema.find({ configId: config._id }).lean();
      const purgeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (targetUser?.email) {
        await sendEmailHelper(
          targetUser.email,
          "⚠️ Your AdvertiseIQ Amazon Ads Connection Was Disconnected",
          buildDisconnectEmail({
            userName: targetUser.fullName,
            profileNames: profiles.map((p) => p.name).join(", "),
            purgeDate: purgeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
            signInUrl: process.env.BASE_URL,
            type: "ads",
          })
        );
      }
    } catch (emailErr) {
      cron_logs({ message: `[handleAutoDisconnectAds] Email notification failed: ${emailErr.message}`, log_type: "error" });
    }

    cron_logs({
      message: `[handleAutoDisconnectAds] Successfully auto-disconnected ads config ${config._id} (${config.companyName})`,
      log_type: "info",
    });

    return true;
  } catch (err) {
    write_logs({ message: `[handleAutoDisconnectAds Error] ${err?.message || err}`, log_type: "error" });
    return false;
  }
};

module.exports = {
  handleAutoDisconnectSP,
  handleAutoDisconnectAds,
};
