const userSchema = require("../models/user.model");
const organizationSchema = require("../models/organization.model");
require("../models/packages.model");
const profileSchema = require("../models/profiles.model");
const auditLogSchema = require("../models/auditLog.model");
const { sendEmailHelper } = require("./emailHelper");
const { buildNewSellerConnectionEmail } = require("../../emailTemplate/buildNewSellerConnectionEmail");
const { write_logs } = require("../../winston/ams/logger");

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

    // 1. Fetch user details
    let user = null;
    if (userId) {
      user = await userSchema
        .findById(userId)
        .select("fullName email companyName phoneNumber organizationId")
        .lean();
    }

    // 2. Fetch organization details
    let organization = null;
    const orgId = organizationId || user?.organizationId;
    if (orgId) {
      organization = await organizationSchema
        .findById(orgId)
        .populate("planId")
        .lean();
    }

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
      await auditLogSchema.create({
        userId: userId || null,
        organizationId: orgId || null,
        event: "SELLER_CONNECTION_NOTIFICATION_SENT",
        message: `Notification email dispatched for new Amazon seller connection: ${sellerId}`,
        ipAddress: req?.ip,
        userAgent: req?.headers ? req.headers["user-agent"] : null,
        metadata: {
          sellerId,
          deliveryStatus: result?.status,
          delivered: result?.delivered,
          recipient: process.env.RECEIVER_EMAIL,
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
    write_logs({
      message: `[notifyNewSellerConnection Error] ${error?.message || error}`,
      log_type: "error",
    });
  }
}

module.exports = { notifyNewSellerConnection };
