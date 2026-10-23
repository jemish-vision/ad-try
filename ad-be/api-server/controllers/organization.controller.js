const { cron_logs } = require("../../winston/cronAutomation/logger");
const organizationSchema = require("../models/organization.model");
const roleBasedPermissionSchema = require("../models/roleBasedPermission.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const roleSchema = require("../models/superAdmin/role.model");
const permissionSchema = require("../models/superAdmin/permission.model");
const userSchema = require("../models/user.model");
const userInvitationSchema = require("../models/userInvitation.model");
const synchronizeDetailsSchema = require("../models/synchronizeDetails.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const profileSchema = require("../models/profiles.model");
const coreGroupSchema = require("../models/coreGroup.model");
const reportDetailsSchema = require("../models/reportDetails.model");
const { ROLES } = require("../constants/roles");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { ensureDbConnected } = require("../../shared/connection");
const moment = require("moment-timezone");
const { getDatesBetween } = require("../helper/common");

const { cronListProductAdsFromAmazon, cronGenerateAdProductReport, cronListProductFromAmazon } = require("./productAds.controller");
const { cronListAdGroupsFromAmazon, cronGenerateAdGroupReport } = require("./adGroups.controller");
const { cronListCampaignsFromAmazon, cronGenerateCampaignReport } = require("./campaign.controller");
const { cronGeneratePlacementReport } = require("./placement.controller");
const { cronGenerateSearchTermReport } = require("./searchTerm.controller");
const { cronGenerateTargetingReport, cronListTargetingFromAmazon } = require("./targeting.controller");
const { cronListKeywordsFromAmazon, cronGenerateKeywordReport } = require("./keyword.controller");
const { cronBestPerformerGoogleReportGenerate, cronKeywordAnalysisReportGenerate } = require("./google.controller");
const { cronGenerateOrderReport, cronGenerateRefundReport, cronGenerateOrderListing, SyncProductListing } = require("./order.controller");
const { cronGenerateTransactionsReport } = require("./transactions.controller");
const { cronGenerateSalesReport, cronGenerateInvetoryReport, cronDetectDeadInventory } = require("./inventory.controller");
const { cronListCouponFromAmazon } = require("./coupon.controller");
const { cronSyncDealPerformance } = require("./deals.controller");
const { cronGenerateReimbursementReport, cronGenerateShipmentQueueReport } = require("./reconciliationReimbursement.controller");
const { cronBrandAnalytics } = require("./brandAnalytics.controller");
const { cronFetchAPlusContentFromAmazon } = require("./aplusContent.controller");
const { clearProfileCache, clearActivePlanProfilesCache } = require("../services/redis.service");
const CRON_JOBS = require("../../worker-service/cronJobs.enum");
const { write_logs } = require("../../winston/utility/logger");

const runReportCronByName = async (reportName, pastSyncObj) => {
  let attempt = 0;
  let maxRetries = Number(process.env.MAX_AUTO_CRON_LIMIT);
  let retryDelayMs = Number(process.env.RETRY_DELAT_MS);
  let historyDate = moment().format("YYYY-MM-DD");
  if (pastSyncObj && pastSyncObj.profileId) {
    const profile = await profileSchema.findOne({ profileId: Number(pastSyncObj.profileId), ...(pastSyncObj.configId && { configId: pastSyncObj.configId }) }).lean();
    if (profile && profile.timezone) {
      historyDate = moment().tz(profile.timezone).format("YYYY-MM-DD");
    }
  }

  let cronJobRecord = await cronJobHistorySchema.findOneAndUpdate(
    {
      configId: pastSyncObj.configId,
      profileId: pastSyncObj.profileId,
      cronName: reportName,
      historyDate: historyDate,
    },
    {
      $setOnInsert: {
        configId: pastSyncObj.configId,
        profileId: pastSyncObj.profileId,
        cronName: reportName,
        historyDate: historyDate,
        status: "PENDING",
      }
    },
    { new: true, upsert: true }
  ).lean();

  if (pastSyncObj) {
    pastSyncObj.cronjobid = cronJobRecord._id;
    pastSyncObj.recurring = false;
  }

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log("reportName: ", reportName)
      switch (reportName) {
        case CRON_JOBS.CAMPAIGN_LISTING:
          if (typeof cronListCampaignsFromAmazon === "function") await cronListCampaignsFromAmazon(pastSyncObj);
          break;
        case CRON_JOBS.CAMPAIGN_REPORT:
          if (typeof cronGenerateCampaignReport === "function") await cronGenerateCampaignReport(false, false, pastSyncObj);
          break;
        case CRON_JOBS.AD_GROUPS_LISTING:
          if (typeof cronListAdGroupsFromAmazon === "function") await cronListAdGroupsFromAmazon(pastSyncObj);
          break;
        case CRON_JOBS.AD_GROUP_REPORT:
          if (typeof cronGenerateAdGroupReport === "function") await cronGenerateAdGroupReport(false, false, pastSyncObj);
          break;
        case CRON_JOBS.TARGETING_LISTING:
          if (typeof cronListTargetingFromAmazon === "function") await cronListTargetingFromAmazon(pastSyncObj);
          break;
        case CRON_JOBS.TARGETING_REPORT:
          if (typeof cronGenerateTargetingReport === "function") await cronGenerateTargetingReport(false, false, pastSyncObj);
          break;
        case CRON_JOBS.SEARCH_TERM_REPORT:
          if (typeof cronGenerateSearchTermReport === "function") await cronGenerateSearchTermReport(false, false, pastSyncObj);
          break;
        case CRON_JOBS.PLACEMENT_REPORT:
          if (typeof cronGeneratePlacementReport === "function") await cronGeneratePlacementReport(false, false, pastSyncObj);
          break;
        case CRON_JOBS.KEYWORD_LISTING:
          if (typeof cronListKeywordsFromAmazon === "function") await cronListKeywordsFromAmazon(pastSyncObj);
          break;
        case CRON_JOBS.KEYWORD_REPORT:
          if (typeof cronGenerateKeywordReport === "function") await cronGenerateKeywordReport(false, pastSyncObj);
          break;
        case CRON_JOBS.PRODUCT_ADS_LISTING:
          if (typeof cronListProductAdsFromAmazon === "function") await cronListProductAdsFromAmazon(pastSyncObj);
          break;
        case CRON_JOBS.PRODUCT_ADS_REPORT:
          if (typeof cronGenerateAdProductReport === "function") await cronGenerateAdProductReport(false, false, pastSyncObj);
          break;
        case CRON_JOBS.PRODUCTS_LISTING:
          if (typeof SyncProductListing === "function") await SyncProductListing(pastSyncObj);
          break;
        case CRON_JOBS.PRODUCTS_META_LISTING:
          if (typeof cronListProductFromAmazon === "function") await cronListProductFromAmazon(pastSyncObj);
          break;
        case CRON_JOBS.ORDER_LISTING:
          if (typeof cronGenerateOrderListing === "function") await cronGenerateOrderListing(pastSyncObj);
          break;
        case CRON_JOBS.SYNC_ORDER:
          if (typeof cronGenerateOrderReport === "function") await cronGenerateOrderReport(pastSyncObj);
          break;
        case CRON_JOBS.TRANSACTION_REPORT:
          if (typeof cronGenerateTransactionsReport === "function") await cronGenerateTransactionsReport(pastSyncObj);
          break;
        case CRON_JOBS.REFUND_REPORT:
          if (typeof cronGenerateRefundReport === "function") await cronGenerateRefundReport(pastSyncObj);
          break;
        case CRON_JOBS.SALES_REPORT:
          if (typeof cronGenerateSalesReport === "function") await cronGenerateSalesReport(pastSyncObj);
          break;
        case CRON_JOBS.SYNC_INVENTORY:
          if (typeof cronGenerateInvetoryReport === "function") await cronGenerateInvetoryReport(pastSyncObj);
          break;
        case CRON_JOBS.SYNC_COUPONS:
          if (typeof cronListCouponFromAmazon === "function") await cronListCouponFromAmazon(pastSyncObj);
          break;
        case CRON_JOBS.SYNC_DEALS_DASHBOARD:
          if (typeof cronSyncDealPerformance === "function") await cronSyncDealPerformance(pastSyncObj);
          break;
        case CRON_JOBS.REIMBURSEMENT_REPORT:
          if (typeof cronGenerateReimbursementReport === "function") await cronGenerateReimbursementReport(pastSyncObj);
          break;
        case CRON_JOBS.SHIPMENT_QUEUE_REPORT:
          if (typeof cronGenerateShipmentQueueReport === "function") await cronGenerateShipmentQueueReport(pastSyncObj);
          break;
        case CRON_JOBS.BRAND_ANALYTICS_REPORT:
          if (typeof cronBrandAnalytics === "function") await cronBrandAnalytics(pastSyncObj);
          break;
        case CRON_JOBS.APLUS_CONTENT_SYNC:
          if (typeof cronFetchAPlusContentFromAmazon === "function") await cronFetchAPlusContentFromAmazon(pastSyncObj);
          break;
        default:
          await cronJobHistorySchema.findByIdAndUpdate(
            { _id: cronJobRecord._id },
            { status: "FAILED" },
            { new: true },
          );
          cron_logs({ message: `[runReportCronByName] No handler matched for report: ${reportName}`, log_type: "warn" });
          break;
      }

      const updatedRecord = await cronJobHistorySchema.findById(cronJobRecord._id).lean();

      if (updatedRecord && updatedRecord.status === "COMPLETED") {
        cron_logs({ message: `[runReportCronByName] ${reportName} completed successfully.`, log_type: "info" });
        break;
      }
      else if (updatedRecord.status === "FAILED") {
        cron_logs({ message: `[runReportCronByName] No handler matched for report: ${reportName}`, log_type: "warn" });
        break;
      }

      if (attempt < maxRetries) {
        cron_logs({
          message: `[runReportCronByName] ${reportName} status is not COMPLETED. Retrying in ${retryDelayMs / 1000} seconds...`,
          log_type: "info"
        });
        await new Promise((res) => setTimeout(res, retryDelayMs));
      } else {
        throw new Error(`${reportName} did not reach COMPLETED status within max retries.`);
      }

    } catch (err) {
      cron_logs({
        message: `Error in runReportCronByName (${reportName}), Attempt ${attempt}/${maxRetries}: ${err.message || err}`,
        log_type: "error"
      });

      if (attempt < maxRetries) {
        cron_logs({
          message: `Network/error issue in ${reportName}. Retrying restart after ${retryDelayMs / 1000} seconds...`,
          log_type: "info"
        });
        await new Promise((res) => setTimeout(res, retryDelayMs));
      } else {
        throw err;
      }
    }
  }
};

exports.getUserOrganizations = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Organizations owned by the user (Admin of that organization)
    const ownedOrgs = await organizationSchema
      .find({ userId })
      .populate("planId")
      .sort({ createdAt: -1 })
      .lean();

    const orgMap = new Map();
    for (const org of ownedOrgs) {
      orgMap.set(org._id.toString(), {
        ...org,
        userRole: ROLES.ADMIN,
        isOwner: true,
        isFavorite: Boolean(org.isFavorite),
      });
    }

    // 2. Organizations shared via roleBasedPermission (User of that organization with assigned roleId)
    const rolePermissions = await roleBasedPermissionSchema
      .find({ userId })
      .populate({ path: "organizationId", populate: { path: "planId" } })
      .populate("roleId")
      .lean();

    for (const rbp of rolePermissions) {
      if (rbp.organizationId && !orgMap.has(rbp.organizationId._id.toString())) {
        orgMap.set(rbp.organizationId._id.toString(), {
          ...rbp.organizationId,
          userRole: rbp.roleId?.roleName || "USER",
          isOwner: false,
          isFavorite: Boolean(rbp.isFavorite || rbp.organizationId.isFavorite),
        });
      } else if (rbp.organizationId && orgMap.has(rbp.organizationId._id.toString())) {
        const existing = orgMap.get(rbp.organizationId._id.toString());
        if (rbp.isFavorite) existing.isFavorite = true;
      }
    }

    // 3. Organizations shared via profileBasedPermission
    const profilePermissions = await profileBasedPermissionSchema
      .find({ userId, hasAccess: true })
      .populate({ path: "organizationId", populate: { path: "planId" } })
      .lean();

    for (const pbp of profilePermissions) {
      if (pbp.organizationId && !orgMap.has(pbp.organizationId._id.toString())) {
        orgMap.set(pbp.organizationId._id.toString(), {
          ...pbp.organizationId,
          userRole: "USER",
          isOwner: false,
          isFavorite: Boolean(pbp.organizationId.isFavorite),
        });
      }
    }

    const organizationsArray = Array.from(orgMap.values()).sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const organizations = await Promise.all(organizationsArray.map(async (org) => {
      const rolePerms = await roleBasedPermissionSchema.find({ organizationId: org._id }, "userId").lean();
      const profilePerms = await profileBasedPermissionSchema.find({ organizationId: org._id, hasAccess: true }, "userId").lean();

      const uniqueUsers = new Set();
      if (org.userId) {
        uniqueUsers.add(org.userId.toString());
      }
      rolePerms.forEach(rp => rp.userId && uniqueUsers.add(rp.userId.toString()));
      profilePerms.forEach(pp => pp.userId && uniqueUsers.add(pp.userId.toString()));

      return {
        ...org,
        memberCount: uniqueUsers.size > 0 ? uniqueUsers.size : 1
      };
    }));

    const pendingInvitations = await userInvitationSchema
      .find({ email: req.user?.email, status: "PENDING" })
      .populate("organizationId", { organizationName: 1 })
      .populate("roleId", { roleName: 1 })
      .lean();

    const formattedInvitations = pendingInvitations.map((inv) => ({
      _id: inv._id,
      token: inv.token,
      organizationName: inv.organizationId?.organizationName || "Organization",
      roleName: inv.roleId?.roleName || "Member",
      invitedByEmail: inv.email,
      expiresAt: inv.expiresAt,
    }));

    return res.status(200).send({
      isSuccess: true,
      organizations,
      pendingInvitations: formattedInvitations,
      userEmail: req.user?.email || "",
      userName: req.user?.fullName || "",
      message: "Organizations fetched successfully.",
    });
  } catch (error) {
      write_logs({ message: `[getUserOrganizations Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while fetching organizations.",
      error: error.message,
    });
  }
};

exports.createOrganization = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationName } = req.body;

    if (!organizationName || !organizationName.trim()) {
      return res.status(400).send({
        isSuccess: false,
        message: "Organization name is required.",
      });
    }

    // Check if user already owns an organization (only one organization allowed if they don't own any yet)
    const existingCount = await organizationSchema.countDocuments({ userId });
    if (existingCount >= 1) {
      return res.status(400).send({
        isSuccess: false,
        message: "You already own an organization. Only one organization can be created per user.",
      });
    }

    const newOrg = await organizationSchema.create({
      organizationName: organizationName.trim(),
      userId,
      planId: null,
      startDate: null,
      endDate: null,
      isTrialActive: false,
    });

    await userSchema.findByIdAndUpdate(userId, { $set: { companyName: organizationName.trim() } });

    return res.status(200).send({
      isSuccess: true,
      organization: newOrg,
      message: "Organization created successfully.",
    });
  } catch (error) {
      write_logs({ message: `[createOrganization Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while creating organization.",
      error: error.message,
    });
  }
};

exports.selectOrganization = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).send({
        isSuccess: false,
        message: "Organization ID is required.",
      });
    }

    const org = await organizationSchema
      .findOne({ _id: organizationId })
      .populate("planId")
      .lean();

    if (!org) {
      return res.status(404).send({
        isSuccess: false,
        message: "Organization not found.",
      });
    }

    let userRoleName = null;
    let roleObj = null;

    if (org.userId && org.userId.toString() === userId.toString()) {
      userRoleName = ROLES.ADMIN;
      roleObj = await roleSchema.findOne({ roleName: ROLES.ADMIN }).lean();
    } else {
      const rbp = await roleBasedPermissionSchema
        .findOne({ userId, organizationId })
        .populate("roleId")
        .lean();
      if (rbp && rbp.roleId) {
        userRoleName = rbp.roleId.roleName || "USER";
        roleObj = rbp.roleId;
      } else {
        const pbp = await profileBasedPermissionSchema
          .findOne({ userId, organizationId, hasAccess: true })
          .lean();
        if (pbp) {
          userRoleName = "USER";
          roleObj = await roleSchema.findOne({ roleName: "USER" }).lean();
        }
      }
    }

    if (!userRoleName) {
      return res.status(403).send({
        isSuccess: false,
        message: "Access denied: You do not have permissions in this organization.",
      });
    }

    const authToken = jwt.sign(
      {
        user_id: req.user._id,
        email: req.user?.email,
        roleId: roleObj?._id || req.user.roleId,
        roleName: userRoleName,
        organizationId: org._id,
      },
      process.env.CUSTOMER_TOKEN_KEY,
      { expiresIn: process.env.TOKEN_EXPIRE_TIME }
    );

    const isFutureEndDate = org.endDate && new Date(org.endDate) > new Date();

    if (isFutureEndDate) {
      if (!org.isTrialActive && !org.planId) {
        org.isTrialActive = true;
        org.hasUsedTrial = false;
        await organizationSchema.updateOne({ _id: org._id }, { $set: { isTrialActive: true, hasUsedTrial: false } });
      }
    } else if (org.isTrialActive && org.endDate && new Date() > new Date(org.endDate)) {
      org.isTrialActive = false;
      org.hasUsedTrial = true;
      await organizationSchema.updateOne({ _id: org._id }, { $set: { isTrialActive: false, hasUsedTrial: true } });
    }

    try {
      const sellerConfigSchema = require("../models/sellerConfig.model");
      await sellerConfigSchema.updateMany(
        { userId, $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
        { $set: { organizationId: org._id } }
      );
    } catch (err) {
      console.error("[selectOrganization] Error linking sellerConfig organizationId:", err);
    }

    const requiresPlan = !org.planId && !org.isTrialActive && !isFutureEndDate;

    return res.status(200).send({
      isSuccess: true,
      authToken,
      role: userRoleName,
      organization: org,
      requiresPlan,
      message: "Organization selected successfully.",
    });
  } catch (error) {
      write_logs({ message: `[selectOrganization Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while selecting organization.",
      error: error.message,
    });
  }
};

exports.toggleFavoriteOrganization = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId, isFavorite } = req.body;

    if (!organizationId) {
      return res.status(400).send({
        isSuccess: false,
        message: "Organization ID is required.",
      });
    }

    await organizationSchema.findOneAndUpdate(
      { _id: organizationId, userId },
      { $set: { isFavorite: Boolean(isFavorite) } }
    );

    await roleBasedPermissionSchema.findOneAndUpdate(
      { organizationId, userId },
      { $set: { isFavorite: Boolean(isFavorite) } }
    );

    return res.status(200).send({
      isSuccess: true,
      message: "Favorite status updated successfully.",
    });
  } catch (error) {
      write_logs({ message: `[toggleFavoriteOrganization Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while updating favorite status.",
      error: error.message,
    });
  }
};

exports.getAllOrganizationsForSuperAdmin = async (req, res) => {
  try {
    const organizations = await organizationSchema
      .find({})
      .populate("userId", "fullName email companyName phoneNumber")
      .populate("planId", "name trialDays price")
      .populate({ path: "subscriptionId", populate: { path: "packageId" } })
      .sort({ createdAt: -1 })
      .lean();

    // Fetch all role and profile permissions, pending sync records, and lookups
    const [rolePermissions, profilePermissions, pendingSyncRecords, allProfiles, allCoreGroups] = await Promise.all([
      roleBasedPermissionSchema
        .find({})
        .populate("userId", "fullName email companyName phoneNumber")
        .populate("roleId", "roleName")
        .lean(),
      profileBasedPermissionSchema
        .find({ hasAccess: true })
        .populate("userId", "fullName email companyName phoneNumber")
        .lean(),
      synchronizeDetailsSchema.find({ requestStatus: { $in: ["PENDING", "FAILED"] } }).lean(),
      profileSchema.find({ isActive: true }).select("profileId name countryCode configId").lean(),
      coreGroupSchema.find({ isActive: true }).select("id title").lean(),
    ]);

    const profileMap = new Map();
    for (const p of allProfiles) {
      if (p.profileId) profileMap.set(Number(p.profileId), p);
    }

    const groupTitleMap = new Map();
    for (const g of allCoreGroups) {
      if (g.id) groupTitleMap.set(g.id, g.title);
    }

    const rolePermsByOrg = new Map();
    for (const rbp of rolePermissions) {
      if (!rbp.organizationId || !rbp.userId?._id) continue;
      const orgIdStr = rbp.organizationId.toString();
      if (!rolePermsByOrg.has(orgIdStr)) rolePermsByOrg.set(orgIdStr, []);
      rolePermsByOrg.get(orgIdStr).push({
        _id: rbp.userId._id,
        fullName: rbp.userId.fullName || "",
        email: rbp.userId.email || "",
        companyName: rbp.userId.companyName || "",
        phoneNumber: rbp.userId.phoneNumber || "",
        roleName: rbp.roleId?.roleName || "USER",
        isOwner: false,
      });
    }

    const profilePermsByOrg = new Map();
    for (const pbp of profilePermissions) {
      if (!pbp.organizationId || !pbp.userId?._id) continue;
      const orgIdStr = pbp.organizationId.toString();
      if (!profilePermsByOrg.has(orgIdStr)) profilePermsByOrg.set(orgIdStr, []);
      profilePermsByOrg.get(orgIdStr).push({
        _id: pbp.userId._id,
        fullName: pbp.userId.fullName || "",
        email: pbp.userId.email || "",
        companyName: pbp.userId.companyName || "",
        phoneNumber: pbp.userId.phoneNumber || "",
        roleName: "USER",
        isOwner: false,
      });
    }

    const formattedOrgs = organizations.map((org) => {
      const orgIdStr = org._id.toString();
      const userMap = new Map();

      if (org.userId && org.userId._id) {
        userMap.set(org.userId._id.toString(), {
          _id: org.userId._id,
          fullName: org.userId.fullName || "",
          email: org.userId.email || "",
          companyName: org.userId.companyName || "",
          phoneNumber: org.userId.phoneNumber || "",
          roleName: ROLES.ADMIN,
          isOwner: true,
        });
      }

      const rUsers = rolePermsByOrg.get(orgIdStr) || [];
      for (const ru of rUsers) {
        if (!userMap.has(ru._id.toString())) {
          userMap.set(ru._id.toString(), ru);
        }
      }

      const pUsers = profilePermsByOrg.get(orgIdStr) || [];
      for (const pu of pUsers) {
        if (!userMap.has(pu._id.toString())) {
          userMap.set(pu._id.toString(), pu);
        }
      }

      const orgUsersList = Array.from(userMap.values());
      const orgUserIdsSet = new Set(orgUsersList.map((u) => u._id.toString()));

      // Filter pending sync records for users belonging to this organization
      const orgPendingRecords = pendingSyncRecords.filter(
        (r) => r.userId && orgUserIdsSet.has(r.userId.toString())
      );

      // Group profile-wise (NOT group-wise)
      const profilesMap = new Map();
      for (const rec of orgPendingRecords) {
        const pId = Number(rec.profileId);
        if (!profilesMap.has(pId)) {
          const profileInfo = profileMap.get(pId);
          profilesMap.set(pId, {
            profileId: pId,
            profileName: profileInfo?.name || `Profile #${pId}`,
            countryCode: profileInfo?.countryCode || "",
            configId: rec.configId,
            selectedGroups: [],
            syncIds: [],
            hasFailed: false, // Flag to indicate if this profile has failed syncs
          });
        }
        const profileObj = profilesMap.get(pId);

        if (rec.requestStatus === "FAILED") {
          profileObj.hasFailed = true;
        }

        profileObj.selectedGroups.push({
          groupId: rec.groupId,
          groupTitle: groupTitleMap.get(rec.groupId) || rec.groupId,
          selectedSyncDays: rec.selectedSyncDays,
          syncId: rec._id,
        });
        profileObj.syncIds.push(rec._id);
      }

      const pendingSyncProfiles = Array.from(profilesMap.values()).map((p) => ({
        ...p,
        selectedGroupsCount: p.selectedGroups.length,
      }));

      return {
        ...org,
        ownerName: org.userId?.fullName || "",
        ownerEmail: org.userId?.email || "",
        ownerCompany: org.userId?.companyName || "",
        ownerPhone: org.userId?.phoneNumber || "",
        packageName: org.planId?.name || "No Plan",
        subscriptionId: org.subscriptionId || null,
        usersList: orgUsersList,
        hasPendingSync: pendingSyncProfiles.length > 0,
        pendingSyncProfiles,
      };
    });

    return res.status(200).send({
      isSuccess: true,
      data: formattedOrgs,
      message: "All organizations fetched successfully.",
    });
  } catch (error) {
      write_logs({ message: `[getAllOrganizationsForSuperAdmin Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while fetching all organizations.",
      error: error.message,
    });
  }
};

exports.executeProfileSyncCron = async (req, res) => {
  try {
    const { syncIds } = req.body;
    if (!syncIds || !Array.isArray(syncIds) || syncIds.length === 0) {
      return res.status(400).send({
        isSuccess: false,
        message: "No sync IDs provided",
      });
    }

    const syncRecords = await synchronizeDetailsSchema
      .find({ _id: { $in: syncIds } })
      .lean();

    if (!syncRecords || syncRecords.length === 0) {
      return res.status(404).send({
        isSuccess: false,
        message: "No matching sync records found",
      });
    }

    // Set requestStatus to IN_PROGRESS
    await synchronizeDetailsSchema.updateMany(
      { _id: { $in: syncIds } },
      { $set: { requestStatus: "IN_PROGRESS", updatedAt: new Date() } }
    );

    // Trigger report crons in background based on profileId, selectedSyncDays, and mapped reports for each group
    (async () => {
      cron_logs({ message: `[ExecuteProfileSyncCron] Sync started for ${syncRecords.length} record(s) [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
      for (const rec of syncRecords) {
        try {
          if (rec.profileId) {
            await profileSchema.updateOne(
              { profileId: rec.profileId, ...(rec.configId && { configId: rec.configId }) },
              { $set: { isActive: true } }
            );
            clearProfileCache(rec.configId?.toString(), rec.profileId);
            clearActivePlanProfilesCache(rec.profileId);
          }
          const days = Number(rec.selectedSyncDays);
          const startDate = moment().subtract(days, "days").format("YYYY-MM-DD");
          const endDate = moment().format("YYYY-MM-DD");
          const dates = getDatesBetween(startDate, endDate);

          const pastSyncObj = {
            configId: rec.configId,
            profileId: rec.profileId,
            startDate,
            endDate,
            dates,
          };

          cron_logs({ message: `[ExecuteProfileSyncCron] Processing Group: ${rec.groupId}, Profile: ${rec.profileId}, Days: ${days} (${startDate} to ${endDate}) [body] ${JSON.stringify(req?.body)}`, log_type: "info" });

          const groupReports = await reportDetailsSchema
            .find({ groupId: rec.groupId })
            .lean();

          if (groupReports && groupReports.length > 0) {
            for (const r of groupReports) {
              cron_logs({ message: `[ExecuteProfileSyncCron] Running report: ${r.name} for Profile: ${rec.profileId} [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
              await runReportCronByName(r.name, pastSyncObj);
            }
          }

          const recType = rec.type || "ads";
          const updateObj = { isActive: true };
          if (recType === "seller") {
            updateObj.isSpSyncEnabled = true;
          } else {
            updateObj.isAdsSyncEnabled = true;
          }
          await profileSchema.updateOne(
            { profileId: Number(rec.profileId), ...(rec.configId && { configId: rec.configId }) },
            { $set: updateObj }
          );
          clearProfileCache(rec.configId?.toString(), Number(rec.profileId));
          clearActivePlanProfilesCache(Number(rec.profileId));

          await synchronizeDetailsSchema.findByIdAndUpdate(rec._id, {
            $set: { requestStatus: "COMPLETED", updatedAt: new Date() }
          });
        } catch (recErr) {
          cron_logs({ message: `[ExecuteProfileSyncCron] Error for record ${rec._id}: ${recErr.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
          await synchronizeDetailsSchema.findByIdAndUpdate(rec._id, {
            $set: { requestStatus: "FAILED", updatedAt: new Date() }
          });
        }
      }
      cron_logs({ message: `[ExecuteProfileSyncCron] Sync batch completed for ${syncRecords.length} record(s) [body] ${JSON.stringify(req?.body)}`, log_type: "info" });
    })().catch((err) => {
      cron_logs({ message: `[ExecuteProfileSyncCron] Background sync execution error: ${err.message} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    });

    return res.status(200).send({
      isSuccess: true,
      message: "Sync cron started successfully for selected profile & groups!",
    });
  } catch (error) {
      write_logs({ message: `[executeProfileSyncCron Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while executing sync cron.",
      error: error.message,
    });
  }
};

exports.updateOrganizationBySuperAdmin = async (req, res) => {
  try {
    const { organizationId, planId, startDate, endDate, isTrialActive, organizationName, subscriptionId } = req.body;
    if (!organizationId) {
      return res.status(400).send({
        isSuccess: false,
        message: "Organization ID is required.",
      });
    }

    // If a future endDate is provided, reset trial status so the org regains access
    const isFutureEndDate = endDate && new Date(endDate) > new Date();

    const updateFields = {
      ...(planId !== undefined && { planId: planId ? planId : null, ...(planId && { hasUsedTrial: true }) }),
      ...(subscriptionId !== undefined && { subscriptionId: subscriptionId ? subscriptionId : null }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(isTrialActive !== undefined && { isTrialActive: Boolean(isTrialActive), ...(!Boolean(isTrialActive) && { hasUsedTrial: true }) }),
      // When Super Admin sets a future endDate, restore trial access by resetting flags
      ...(isFutureEndDate && { isTrialActive: true, hasUsedTrial: false }),
      ...(organizationName && { organizationName }),
    };

    const updatedOrg = await organizationSchema
      .findByIdAndUpdate(organizationId, { $set: updateFields }, { new: true })
      .populate("userId", "fullName email companyName phoneNumber")
      .populate("planId", "name trialDays price")
      .populate({ path: "subscriptionId", populate: { path: "packageId" } })
      .lean();

    if (!updatedOrg) {
      return res.status(404).send({
        isSuccess: false,
        message: "Organization not found.",
      });
    }

    if (organizationName && updatedOrg.userId) {
      await userSchema.updateOne({ _id: updatedOrg.userId._id }, { $set: { companyName: organizationName } });
    }

    return res.status(200).send({
      isSuccess: true,
      data: updatedOrg,
      message: "Organization updated successfully.",
    });
  } catch (error) {
      write_logs({ message: `[updateOrganizationBySuperAdmin Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while updating organization.",
      error: error.message,
    });
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const userId = req.user._id;
    const { organizationId, organizationName } = req.body;

    if (!organizationId || !organizationName || !organizationName.trim()) {
      return res.status(203).send({
        isSuccess: false,
        message: "Organization ID and Name are required.",
      });
    }

    const org = await organizationSchema.findOne({ _id: organizationId, userId: userId });
    if (!org) {
      return res.status(203).send({
        isSuccess: false,
        message: "You are not authorized to edit this organization.",
      });
    }

    await organizationSchema.updateOne({ _id: organizationId }, { $set: { organizationName: organizationName.trim() } });
    await userSchema.updateOne({ _id: userId }, { $set: { companyName: organizationName.trim() } });

    return res.status(200).send({
      isSuccess: true,
      message: "Organization updated successfully.",
    });
  } catch (error) {
      write_logs({ message: `[updateOrganization Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      isSuccess: false,
      message: "Something went wrong while updating organization.",
      error: error.message,
    });
  }
};

/**
 * Resets synchronizeDetails records that are stuck in IN_PROGRESS status.
 * This can happen if the server crashed or restarted mid-sync.
 *
 * Any record with requestStatus = "IN_PROGRESS" and updatedAt older than
 * STUCK_SYNC_THRESHOLD_HOURS (default 6 hours) is reset to "FAILED".
 *
 * Call this:
 *   - On worker startup (to clear leftovers from the previous process)
 *   - On a periodic cron (e.g. every hour) to catch hangs in long-running processes
 */
exports.resetStuckSyncRecords = async () => {
  try {
    const thresholdHours = Number(process.env.STUCK_SYNC_THRESHOLD_HOURS) || 6;
    const cutoffTime = moment().subtract(thresholdHours, "hours").toDate();

    const result = await synchronizeDetailsSchema.updateMany(
      {
        requestStatus: "IN_PROGRESS",
        updatedAt: { $lt: cutoffTime },
      },
      {
        $set: {
          requestStatus: "FAILED",
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      cron_logs({
        message: `[resetStuckSyncRecords] Reset ${result.modifiedCount} stuck IN_PROGRESS record(s) to FAILED (threshold: ${thresholdHours}h).`,
        log_type: "warn",
      });
    } else {
      cron_logs({
        message: `[resetStuckSyncRecords] No stuck IN_PROGRESS records found.`,
        log_type: "info",
      });
    }
  } catch (err) {
    cron_logs({
      message: `[resetStuckSyncRecords] Error resetting stuck sync records: ${err.message}`,
      log_type: "error",
    });
  }
};
