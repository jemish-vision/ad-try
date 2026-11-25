const userSchema = require("../models/user.model");
const organizationSchema = require("../models/organization.model");
require("../models/packages.model");
const profileSchema = require("../models/profiles.model");
const { writeAuditEvent } = require("../helpers/auditHelper");
const { sendEmailHelper } = require("./emailHelper");
const { buildNewSellerConnectionEmail } = require("../../emailTemplate/buildNewSellerConnectionEmail");
const {
  buildNewProfileConnectionEmail,
  buildDataSyncRequestEmail,
} = require("../../emailTemplate/buildProfileAndSyncNotificationEmail");
const { write_logs } = require("../../winston/ams/logger");

async function fetchUserAndOrganization(userId, organizationId) {
  let user = null;
  if (userId) {
    user = await userSchema
      .findById(userId)
      .select("fullName email companyName phoneNumber organizationId")
      .lean();
  }

  let organization = null;
  const orgId = organizationId || user?.organizationId;
  if (orgId) {
    organization = await organizationSchema
      .findById(orgId)
      .populate("planId")
      .lean();
  }

  return { user, organization, orgId };
}

function getDevNotificationRecipient() {
  return process.env.RECEIVER_EMAIL || process.env.ADMIN_EMAIL;
}

/**
 * Dispatches an email notification when a new Amazon seller account connects.
 *
 * @param {Object} params
 * @param {string} params.sellerId - Amazon Merchant ID / Selling Partner ID
 * @param {string|mongoose.Types.ObjectId} [params.userId] - User ID who authorized
 * @param {string|mongoose.Types.ObjectId} [params.organizationId] - Organization ID
 * @param {string} [params.source] - "Amazon Selling Partner Appstore" | "In-App Seller Connect (Settings)"
 * @param {Array} [params.profiles] - Linked profile objects (optional)
 * @param {Object} [params.req] - Express request object for IP and User-Agent
 */
async function notifyNewSellerConnection({
  sellerId,
  userId,
  organizationId,
  source = "Amazon Selling Partner Appstore",
  profiles = [],
  req,
}) {
  try {
    if (!sellerId) {
      write_logs({
        message: "[notifyNewSellerConnection] Skipped: No sellerId provided",
        log_type: "info",
      });
      return;
    }

    // 1 & 2. Fetch user and organization details
    const { user, organization, orgId } = await fetchUserAndOrganization(userId, organizationId);

    // 3. Find linked advertising profiles (if not explicitly passed)
    let linkedProfiles = Array.isArray(profiles) && profiles.length > 0 ? profiles : [];
    if (linkedProfiles.length === 0 && sellerId) {
      linkedProfiles = await profileSchema
        .find({
          isActive: true,
          $or: [
            { advertiserId: sellerId },
            { advertiserId: String(sellerId).trim() },
          ],
        })
        .select("name profileId countryCode currencyCode type")
        .lean();
    }

    // 4. Generate email HTML
    const emailHtml = buildNewSellerConnectionEmail({
      sellerId,
      user,
      organization,
      source,
      profiles: linkedProfiles,
      connectedAt: new Date(),
      ipAddress: req?.ip,
      userAgent: req?.headers ? req.headers["user-agent"] : null,
    });

    const orgOrUserName = user?.fullName || organization?.organizationName || "AdvertiseIQ";
    const subject = `New Amazon Seller Connected - ${sellerId} (${orgOrUserName})`;

    // 5. Send notification email using standard sendEmailHelper
    const result = await sendEmailHelper(
      process.env.RECEIVER_EMAIL,
      subject,
      emailHtml
    );

    // 6. Record audit log
    try {
      await writeAuditEvent({
        req, actorType: "system", source: "system",
        outcome: result?.delivered === true ? "SUCCESS" : "FAILED",
        organizationId: orgId || null,
        event: "SELLER_CONNECTION_NOTIFICATION_SENT",
        message: result?.delivered === true ? "Seller connection notification delivered" : "Seller connection notification delivery failed",
        ipAddress: req?.ip,
        userAgent: req?.headers ? req.headers["user-agent"] : null,
        metadata: {
          sellerId,
          deliveryStatus: result?.status,
          delivered: result?.delivered,
          source,
        },
      });
    } catch (auditErr) {
      write_logs({
        message: `[notifyNewSellerConnection Audit Error] ${auditErr?.message || auditErr}`,
        log_type: "error",
      });
    }

    write_logs({
      message: `[notifyNewSellerConnection] Notification email sent for sellerId "${sellerId}" with status "${result?.status}"`,
      log_type: "info",
    });

    return result;
  } catch (error) {
    await writeAuditEvent({ actorType: "system", source: "system", organizationId,
      event: "SELLER_CONNECTION_NOTIFICATION_SENT", message: "Seller connection notification failed",
      outcome: "FAILURE", metadata: { sellerId, reason: "NOTIFICATION_EXECUTION_FAILED" } });
    write_logs({
      message: `[notifyNewSellerConnection Error] ${error?.message || error}`,
      log_type: "error",
    });
  }
}

async function notifyNewProfileConnection({
  userId,
  organizationId,
  config,
  profiles = [],
  req,
}) {
  try {
    if (!Array.isArray(profiles) || profiles.length === 0) return;

    const recipient = getDevNotificationRecipient();
    if (!recipient) {
      write_logs({
        message: "[notifyNewProfileConnection] Skipped: RECEIVER_EMAIL / ADMIN_EMAIL not configured",
        log_type: "info",
      });
      return;
    }

    const { user, organization } = await fetchUserAndOrganization(userId, organizationId || config?.organizationId);
    const emailHtml = buildNewProfileConnectionEmail({
      user,
      organization,
      config,
      profiles,
      connectedAt: new Date(),
      ipAddress: req?.ip,
    });

    const orgOrUserName = organization?.organizationName || user?.fullName || config?.companyName || "AdvertiseIQ";
    const profileLabel = profiles.length === 1
      ? `${profiles[0].name || profiles[0].profileId}`
      : `${profiles.length} Profiles`;
    const subject = `New Profile Connected - ${profileLabel} (${orgOrUserName})`;

    const result = await sendEmailHelper(recipient, subject, emailHtml);
    write_logs({
      message: `[notifyNewProfileConnection] Notification email sent for ${profiles.length} profile(s) with status "${result?.status}"`,
      log_type: "info",
    });
    return result;
  } catch (error) {
    write_logs({
      message: `[notifyNewProfileConnection Error] ${error?.message || error}`,
      log_type: "error",
    });
  }
}

async function notifyDataSyncRequest({
  userId,
  organizationId,
  config,
  profileId,
  type = "ads",
  requestedRecords = [],
  groups = [],
  req,
}) {
  try {
    if (!Array.isArray(requestedRecords) || requestedRecords.length === 0) return;

    const recipient = getDevNotificationRecipient();
    if (!recipient) {
      write_logs({
        message: "[notifyDataSyncRequest] Skipped: RECEIVER_EMAIL / ADMIN_EMAIL not configured",
        log_type: "info",
      });
      return;
    }

    const [{ user, organization }, profile] = await Promise.all([
      fetchUserAndOrganization(userId, organizationId || config?.organizationId),
      config?._id && profileId
        ? profileSchema.findOne({ configId: config._id, profileId: Number(profileId) }).select("name profileId countryCode currencyCode type").lean()
        : null,
    ]);

    const emailHtml = buildDataSyncRequestEmail({
      user,
      organization,
      config,
      profile,
      profileId,
      type,
      requestedRecords,
      groups,
      requestedAt: new Date(),
      ipAddress: req?.ip,
    });

    const orgOrUserName = organization?.organizationName || user?.fullName || config?.companyName || "AdvertiseIQ";
    const profileLabel = profile?.name || `Profile ${profileId}`;
    const typeLabel = type === "seller" ? "Seller" : "Ads";
    const subject = `Data Sync Requested (${typeLabel}) - ${profileLabel} (${orgOrUserName})`;

    const result = await sendEmailHelper(recipient, subject, emailHtml);
    write_logs({
      message: `[notifyDataSyncRequest] Notification email sent for profileId=${profileId} (${type}) with status "${result?.status}"`,
      log_type: "info",
    });
    return result;
  } catch (error) {
    write_logs({
      message: `[notifyDataSyncRequest Error] ${error?.message || error}`,
      log_type: "error",
    });
  }
}

module.exports = {
  notifyNewSellerConnection,
  notifyNewProfileConnection,
  notifyDataSyncRequest,
};
