const bcrypt = require("bcrypt");
const moment = require("moment-timezone");
const { verify } = require("otplib");
const jwt = require("jsonwebtoken");

const configSchema = require("../models/config.model");
const profileSchema = require("../models/profiles.model");
const userSchema = require("../models/user.model");
const packageSchema = require("../models/packages.model");
const filterSchema = require("../models/filter.model");
const pageFilterSchema = require("../models/pageFilter.model");
const pageSchema = require("../models/superAdmin/pages.model");
const themeSchema = require("../models/theme.model");
const campaignsSchema = require("../models/campaign.model");
const adNotificationSchema = require("../models/adNotification.model");
const googleconfigSchema = require("../models/googleconfig.model");
const newProfileSyncSchema = require("../models/newProfileSync.model");
const auditLogSchema = require("../models/auditLog.model");
const organizationSchema = require("../models/organization.model");
const roleBasedPermissionSchema = require("../models/roleBasedPermission.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const userInvitationSchema = require("../models/userInvitation.model");
const otpSchema = require("../models/otp.model");

const supportQASchema = require("../models/supportQA.model");
const supportTicketSchema = require("../models/supportTicket.model");
const supportTicketMessageSchema = require("../models/supportTicketMessage.model");

const { generateAuthToken, safeJsonParse, decryptData, generateOtp } = require("../helper/common");
const { sendEmailHelper } = require("../helper/emailHelper");
const { buildSupportTicketEmail } = require("../../emailTemplate/buildSupportTicketEmail");
const { buildOtpVerificationEmail } = require("../../emailTemplate/buildOtpVerificationEmail");
const { createAsanaTicket, addAsanaComment } = require("../services/asana.service");
const { write_logs } = require("../../winston/utility/logger");
const { getMostMatchedFAQ, getMeaningfulWord } = require("../helper/chatbot");
const { createChatService, isAnalyticsQuestion, isGeneralOrConversationalQuestion } = require("../services/chatbotReporting.chat");
const defaultReportingChatService = createChatService();
const { recordUnansweredQuestion } = require("../services/unansweredQuestion.capture");
const AD_TYPE_COLLECTIONS = require("../helper/adTypeCollections");
const { ROLES } = require("../constants/roles");
const { default: mongoose } = require("mongoose");

exports.login = async (req, res) => {
  try {
    const { email, password, ip_address, location, timeZone } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(203).json({ message: "Valid email and password required!", isSuccess: false });
    }
    const findEmail = await userSchema.findOne({ email: email.trim() }).select("+password +twoFactorSecret").lean().populate("roleId", { roleName: 1 });
    if (!findEmail) {
      return res
        .status(203)
        .json({ message: "Email not found!", isSuccess: false });
    }
    if (!findEmail.isActive) {
      return res.status(203).json({
        message: "Your status is deactivated by the super admin.",
        isSuccess: false,
      });
    }

    if (!findEmail.isVerify) {
      return res.status(203).send({
        message: "Please verify your email before login",
        isSuccess: false,
        showOtpModal: true,
      });
    }

    const isMatch = await bcrypt.compare(password, findEmail.password);
    if (isMatch) {
      if (findEmail.twoFactorEnabled) {
        const tempToken = jwt.sign(
          { userId: findEmail._id, ip_address, location, timeZone, temp2fa: true },
          process.env.JWT_SECRET || "my_super_secret",
          { expiresIn: "5m" }
        );
        return res.status(200).json({
          isSuccess: true,
          message: "Two-factor authentication required.",
          requires2fa: true,
          tempToken
        });
      }

      const { authToken } = await generateAuthToken(findEmail._id, ip_address, location, timeZone);

      await auditLogSchema.create({
        userId: findEmail._id,
        event: "USER_LOGIN",
        message: "User logged in successfully",
        ipAddress: ip_address || req?.ip,
        userAgent: req?.headers["user-agent"],
        metadata: { email, location, timeZone, status: "SUCCESS", loginType: "NORMAL" },
      });

      const googleConnected = await googleconfigSchema.findOne({ userId: findEmail._id }).lean();

      return res.status(200).json({
        isSuccess: true,
        message: "Login successfully.",
        authToken,
        userId: findEmail._id,
        role: findEmail.roleId.roleName,
        isGoogleConnected: googleConnected ? true : false,
        email: findEmail.email,
        fullName: findEmail.fullName
      });
    } else {
      await auditLogSchema.create({
        userId: findEmail._id,
        event: "USER_LOGIN",
        message: "Login failed - Invalid password!",
        ipAddress: ip_address || req?.ip,
        userAgent: req?.headers["user-agent"],
        metadata: { email, location, timeZone, status: "FAILED", reason: "INVALID_PASSWORD" },
      });

      return res
        .status(203)
        .json({ message: "Invalid password!", isSuccess: false });
    }
  } catch (error) {
    write_logs({
      message: `[login Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(203).json({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.verify2faLogin = async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ message: "Token and code are required", isSuccess: false });
    }

    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || "my_super_secret");
    if (!decoded.temp2fa) {
      return res.status(400).json({ message: "Invalid token", isSuccess: false });
    }

    const findEmail = await userSchema.findById(decoded.userId).select("+twoFactorSecret").lean().populate("roleId", { roleName: 1 });
    if (!findEmail || !findEmail.twoFactorEnabled) {
      return res.status(400).json({ message: "2FA is not enabled for this user", isSuccess: false });
    }

    const decryptedSecret = decryptData(findEmail.twoFactorSecret);
    const isValid = await verify({ token: code, secret: decryptedSecret });

    if (!isValid?.valid) {
      return res.status(203).json({ message: "Invalid verification code", isSuccess: false });
    }

    const { ip_address, location, timeZone } = decoded;
    const { authToken } = await generateAuthToken(findEmail._id, ip_address, location, timeZone);

    await userSchema.findByIdAndUpdate(findEmail._id, { twoFactorLastUsed: new Date() });

    await auditLogSchema.create({
      userId: findEmail._id,
      event: "USER_LOGIN",
      message: "User logged in successfully (2FA)",
      ipAddress: ip_address || req?.ip,
      userAgent: req?.headers["user-agent"],
      metadata: { email: findEmail.email, location, timeZone, status: "SUCCESS", loginType: "2FA" },
    });

    const googleConnected = await googleconfigSchema.findOne({ userId: findEmail._id }).lean();

    return res.status(200).json({
      isSuccess: true,
      message: "Login successfully.",
      authToken,
      userId: findEmail._id,
      role: findEmail.roleId.roleName,
      isGoogleConnected: !!googleConnected,
      email: findEmail.email,
      fullName: findEmail.fullName
    });

  } catch (error) {
    write_logs({
      message: `[verify2faLogin Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(203).json({
      error: "Invalid or expired token",
      message: "Session expired or invalid, please login again",
      isSuccess: false,
    });
  }
};

exports.siteTourCompleted = async (req, res) => {
  try {
    const userId = req.user._id;
    await userSchema.findByIdAndUpdate(userId, { isTourCompleted: true }, { new: true });

    return res.status(200).json({
      isSuccess: true,
      message: "Tour completed successfully",
    });
  } catch (error) {
      write_logs({ message: `[siteTourCompleted Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Something went wrong",
      error: "An internal server error occurred",
    });
  }
};

exports.getProfile = async (req, res) => {
  const userId = req.user._id;
  try {
    await userSchema
      .findById(userId)
      .then(async (user) => {
        if (!user) {
          return res.status(203).send({ message: "User not found!", isSuccess: false });
        }

        // Reconstruct the profile object to maintain the exact same response schema for the frontend
        const profileObj = user.toObject();

        const orgId = req.organizationId || user.organizationId;
        let organization = await organizationSchema.findOne(
          orgId ? { _id: orgId } : { $or: [{ userId }, { _id: user.organizationId }] }
        )
          .populate("planId")
          .populate("upcomingPlanId")
          .populate({ path: "subscriptionId", populate: { path: "packageId", model: "packages" } })
          .lean();

        // If upcoming plan is scheduled and current period has completed, transition to upcoming plan
        if (organization?.upcomingPlanId && organization?.endDate && new Date() >= new Date(organization.endDate)) {
          const nextStartDate = organization.endDate;
          const nextEndDate = new Date(new Date(organization.endDate).setMonth(new Date(organization.endDate).getMonth() + 1));
          const newPlanId = organization.upcomingPlanId._id || organization.upcomingPlanId;
          const newSubId = organization.upcomingSubscriptionId || organization.subscriptionId;

          await organizationSchema.updateOne(
            { _id: organization._id },
            {
              $set: {
                planId: newPlanId,
                subscriptionId: newSubId,
                startDate: nextStartDate,
                endDate: nextEndDate,
                isTrialActive: false,
                hasUsedTrial: true,
                upcomingPlanId: null,
                upcomingSubscriptionId: null,
                upcomingStartDate: null,
                isUpcomingPlanPaid: false,
              }
            }
          );

          organization.planId = organization.upcomingPlanId;
          organization.startDate = nextStartDate;
          organization.endDate = nextEndDate;
          organization.isTrialActive = false;
          organization.hasUsedTrial = true;
          organization.upcomingPlanId = null;
          organization.upcomingSubscriptionId = null;
          organization.upcomingStartDate = null;
          organization.isUpcomingPlanPaid = false;
        }

        // If endDate is in the future, ensure trial/access is recognized as active
        if (organization?.endDate && new Date(organization.endDate) > new Date()) {
          if (!organization.isTrialActive && !organization.planId) {
            organization.isTrialActive = true;
            organization.hasUsedTrial = false;
            await organizationSchema.updateOne({ _id: organization._id }, { $set: { isTrialActive: true, hasUsedTrial: false } });
          }
        } else if (organization?.isTrialActive && organization?.endDate && new Date() > new Date(organization.endDate)) {
          organization.isTrialActive = false;
          organization.hasUsedTrial = true;
          await organizationSchema.updateOne({ _id: organization._id }, { $set: { isTrialActive: false, hasUsedTrial: true } });
        }
        profileObj.organization = organization || null;

        const subscription = organization?.subscriptionId || null;

        const subStatus = subscription?.subscriptionStatus;
        const isExpired = subscription?.nextBillingDate ? new Date() > new Date(subscription.nextBillingDate) : false;
        const isCanceledOrExpired = subStatus === "canceled" || subStatus === "cancelled" || subStatus === "expired" || isExpired;

        profileObj.packageEndDate = organization?.endDate || subscription?.nextBillingDate || null;
        profileObj.packageId = organization?.planId?._id;
        profileObj.packageStartDate = organization?.startDate || subscription?.paymentDate || null;
        profileObj.subscriptionId = isCanceledOrExpired ? null : (subscription?.stripeSubscriptionId || null);

        profileObj.upcomingPlanId = organization?.upcomingPlanId?._id || organization?.upcomingPlanId || null;
        profileObj.upcomingPlan = organization?.upcomingPlanId || null;
        profileObj.upcomingStartDate = organization?.upcomingStartDate || null;
        profileObj.isUpcomingPlanPaid = Boolean(organization?.isUpcomingPlanPaid);

        // If the org has a future endDate, it still has valid access — override hasUsedTrial
        const hasFutureEndDate = profileObj.packageEndDate && new Date(profileObj.packageEndDate) > new Date();
        const hasUsedTrial = hasFutureEndDate ? false : Boolean(organization?.hasUsedTrial || organization?.isTrialActive || organization?.planId);

        profileObj.amazonConnectLimit = organization?.planId?.amazonConnectLimit || 0;
        profileObj.numberOfInvites = organization?.planId?.numberOfInvites || 0;
        profileObj.profileLimit = organization?.planId?.profileLimit || 0;

        if (organization?._id) {
          profileObj.totalOrgConfigs = await configSchema.countDocuments({ organizationId: organization._id });
          profileObj.totalOrgUsers = await roleBasedPermissionSchema.countDocuments({ organizationId: organization._id });
          profileObj.totalPendingInvites = await userInvitationSchema.countDocuments({ organizationId: organization._id, status: "PENDING", expiresAt: { $gt: new Date() } });

          // Calculate total stored profiles for this organization
          const orgConfigs = await configSchema.find({ organizationId: organization._id, isActive: { $ne: false } }).select("_id").lean();
          const orgConfigIds = orgConfigs.map(c => c._id);
          const distinctActiveProfileIds = await profileSchema.distinct('profileId', { configId: { $in: orgConfigIds }, isActive: true });
          profileObj.totalOrgProfiles = distinctActiveProfileIds.length;
        } else {
          profileObj.totalOrgConfigs = 0;
          profileObj.totalOrgUsers = 0;
          profileObj.totalPendingInvites = 0;
          profileObj.totalOrgProfiles = 0;
        }

        return res.status(200).send({
          profile: profileObj,
          organization: organization || null,
          isSuccess: true,
          message: "Get user data successfully.",
          hasUsedTrial
        });
      })

      .catch((error) => {
          write_logs({ message: `[getProfile Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[getProfile Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getFilter = async (req, res) => {
  const userId = req.user._id;
  const pageName = req.body.pageName;
  try {

    const filters = await filterSchema.aggregate([
      {
        $match: {
          $or: [
            { isDefault: true },
            { userId: userId }
          ],
          isActive: true
        }
      },
      {
        $lookup: {
          from: "pages",
          localField: "pageId",
          foreignField: "_id",
          as: "pageId"
        }
      },
      { $unwind: "$pageId" },
      {
        $match: {
          "pageId.pageName": pageName
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    if (pageName === "Budget Rules") {
      const hasOOB = filters.some(f => f.value === "OutOfBudget" || f.value === "Out of Budget");
      if (!hasOOB) {
        filters.push({
          name: "Out of Budget",
          value: "OutOfBudget",
          label: "Out of Budget",
          isDefault: true,
          isActive: true,
          isSPFilter: true,
          isSBFilter: true,
          isSDFilter: true
        });
      }
    }

    return res.status(200).send({
      filters,
      isSuccess: true,
      message: "Get filters data successfully.",
    });
  } catch (error) {
      write_logs({ message: `[getFilter Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

exports.saveFilter = async (req, res) => {
  const userId = req.user._id;
  try {

    const pageName = req.body.pageName;
    const query = req.body.query;
    const filterName = req.body.filterName;
    const page = await pageSchema.findOne({ pageName: pageName }).lean();
    let filter = {
      pageId: page._id,
      userId,
      name: filterName,
      value: filterName.replace(/\s+/g, ""),
      query: query,
      isDefault: false,
      isActive: true
    }

    const createFilter = new filterSchema(filter);
    await createFilter.save();

    return res.status(200).send({
      isSuccess: true,
      message: "Filter save successfully.",
    });

  } catch (error) {
      write_logs({ message: `[saveFilter Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }

}

exports.savePageFilter = async (req, res) => {
  const userId = req.user._id;
  try {
    const { profileId, pageName, filter } = req.body;

    await pageFilterSchema.findOneAndUpdate(
      { userId, profileId, pageName },
      { userId, profileId, pageName, filter },
      { upsert: true, new: true }
    );

    return res.status(200).send({
      isSuccess: true,
      message: "Page filter saved successfully.",
    });
  } catch (error) {
      write_logs({ message: `[savePageFilter Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong while saving page filter!",
      isSuccess: false,
    });
  }
};

exports.getPageFilter = async (req, res) => {
  const userId = req.user._id;
  try {
    const { profileId, pageName } = req.body;

    const pageFilter = await pageFilterSchema.findOne({ userId, profileId, pageName }).lean();

    return res.status(200).send({
      isSuccess: true,
      data: pageFilter || { filter: "[]" }
    });
  } catch (error) {
      write_logs({ message: `[getPageFilter Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong while getting page filter!",
      isSuccess: false,
    });
  }
};

exports.deleteFilter = async (req, res) => {
  const userId = req.user._id;
  try {
    const { filterId } = req.body;

    if (!filterId) {
      return res.status(400).send({
        message: "Filter ID is required!",
        isSuccess: false,
      });
    }

    // Find and delete the filter, ensuring it belongs to the user
    const deletedFilter = await filterSchema.findOneAndDelete({
      _id: filterId,
      userId: userId,
    }).lean();

    if (!deletedFilter) {
      return res.status(404).send({
        message: "Filter not found or you don't have permission to delete it!",
        isSuccess: false,
      });
    }

    return res.status(200).send({
      isSuccess: true,
      message: "Filter deleted successfully.",
    });

  } catch (error) {
      write_logs({ message: `[deleteFilter Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

exports.getCampaignAndAdGroupAutoSearch = async (req, res) => {
  const configId = req?.config?.configId;
  const adType = req.adType;
  const { adTypeCampaignSchema } = req.models;

  try {
    let { profileId, searchName } = req.body;

    const currentDate = moment().format("YYYY-MM-DD");
    const isSearchActive = !!searchName && searchName.trim() !== "";

    const pipeline = [
      {
        $match: {
          configId,
          profileId: Number(profileId),
          reportDate: currentDate,
          ...(!isSearchActive ? { status: "ENABLED" } : {})
        }
      },
      {
        $sort: { campaignId: 1, reportDate: -1 }
      },
      {
        $group: {
          _id: "$campaignId",
          campaignId: { $first: "$campaignId" },
          campaign: { $first: "$name" },
          profileId: { $first: "$profileId" }
        }
      },
      {
        $lookup: {
          from: AD_TYPE_COLLECTIONS?.[adType]?.["adGroup"],
          let: {
            cId: "$campaignId",
            pId: "$profileId"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$campaignId", "$$cId"] },
                    { $eq: ["$profileId", "$$pId"] },
                    { $eq: ["$reportDate", currentDate] }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 0,
                adGroupId: 1,
                adGroup: "$name"
              }
            }
          ],
          as: "adGroups"
        }
      },
      {
        $project: {
          data: {
            $map: {
              input: "$adGroups",
              as: "ag",
              in: {
                _id: {
                  campaignId: "$campaignId",
                  adGroupId: "$$ag.adGroupId"
                },
                campaign: "$campaign",
                adGroup: "$$ag.adGroup",
                campaignId: "$campaignId",
                adGroupId: "$$ag.adGroupId"
              }
            }
          }
        }
      },
      { $unwind: "$data" },
      { $replaceRoot: { newRoot: "$data" } },
      ...(isSearchActive
        ? [
          {
            $match: {
              $or: [
                {
                  campaign: {
                    $regex: new RegExp(
                      RegExp.escape(`${searchName}`?.trim()),
                      "i"
                    )
                  }
                },
                {
                  adGroup: {
                    $regex: new RegExp(
                      RegExp.escape(`${searchName}`?.trim()),
                      "i"
                    )
                  }
                }
              ]
            }
          }
        ]
        : []),

      // ✅ PAGINATION
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: 0 }, { $limit: 50 }]
        }
      }
    ];

    const result = await adTypeCampaignSchema.aggregate(pipeline);
    const campaignResult = result[0]?.data || [];

    return res.status(200).send({
      isSuccess: true,
      result: campaignResult
    });

  } catch (error) {
      write_logs({ message: `[getCampaignAndAdGroupAutoSearch Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Error:", error);
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong"
    });
  }
};

exports.getCampaignAndAdGroup = async (req, res) => {
  const configId = req?.config?.configId;
  const adType = req.adType;
  const { adTypeCampaignSchema } = req.models;

  try {
    const { profileId, searchName } = req.body;
    const currentDate = moment().format("YYYY-MM-DD");

    const isSearchActive = !!searchName && searchName.trim() !== "";

    const pipeline = [
      // 👉 SP Campaigns (base)
      {
        $match: {
          configId,
          profileId: Number(profileId),
        }
      },
      { $addFields: { campaignType: "SP" } },
      // 👉 SB Campaigns
      {
        $unionWith: {
          coll: AD_TYPE_COLLECTIONS?.["SB"]?.["campaign"],
          pipeline: [
            { $match: { configId, profileId: Number(profileId) } },
            { $addFields: { campaignType: "SB" } },
          ]
        }
      },
      // 👉 SD Campaigns
      {
        $unionWith: {
          coll: AD_TYPE_COLLECTIONS?.["SD"]?.["campaign"],
          pipeline: [
            { $match: { configId, profileId: Number(profileId) } },
            { $addFields: { campaignType: "SD" } },
          ]
        }
      },
      {
        $sort: { reportDate: -1 }
      },
      {
        $group: {
          _id: {
            campaignId: "$campaignId",
            campaignType: "$campaignType"
          },
          latest: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$latest" }
      },
      {
        $match: {
          reportDate: currentDate,
          ...(!isSearchActive ? { status: "ENABLED" } : {}),
        }
      },
      {
        $lookup: {
          from: AD_TYPE_COLLECTIONS?.["SP"]?.["adGroup"],
          let: {
            cId: "$campaignId",
            pId: "$profileId"
          },
          pipeline: [
            // 👉 SP AdGroups
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$campaignId", "$$cId"] },
                    { $eq: ["$profileId", "$$pId"] },
                    { $eq: ["$reportDate", currentDate] }
                  ]
                }
              }
            },
            // 👉 SB AdGroups
            {
              $unionWith: {
                coll: AD_TYPE_COLLECTIONS?.["SB"]?.["adGroup"],
                pipeline: [
                  { $match: { $expr: { $and: [{ $eq: ["$campaignId", "$$cId"] }, { $eq: ["$profileId", "$$pId"] }, { $eq: ["$reportDate", currentDate] }] } } }
                ]
              }
            },
            // 👉 SD AdGroups
            {
              $unionWith: {
                coll: AD_TYPE_COLLECTIONS?.["SD"]?.["adGroup"],
                pipeline: [
                  { $match: { $expr: { $and: [{ $eq: ["$campaignId", "$$cId"] }, { $eq: ["$profileId", "$$pId"] }, { $eq: ["$reportDate", currentDate] }] } } }
                ]
              }
            },
            {
              $project: {
                _id: 0,
                adGroupId: 1,
                name: 1
              }
            }
          ],
          as: "adGroups"
        }
      },
      ...(isSearchActive
        ? [
          {
            $match: {
              $or: [
                {
                  name: {
                    $regex: new RegExp(
                      RegExp.escape(`${searchName}`?.trim()),
                      "i"
                    )
                  }
                },
                {
                  "adGroups.name": {
                    $regex: new RegExp(
                      RegExp.escape(`${searchName}`?.trim()),
                      "i"
                    )
                  }
                }
              ]
            }
          }
        ]
        : []),
      {
        $project: {
          _id: 0,
          campaignId: 1,
          campaignType: 1,
          campaignName: "$name",
          adGroups: {
            $map: {
              input: "$adGroups",
              as: "ag",
              in: {
                adGroupId: "$$ag.adGroupId",
                adGroupName: "$$ag.name"
              }
            }
          }
        }
      }
    ];

    const result = await campaignsSchema.aggregate(pipeline);

    return res.status(200).send({
      isSuccess: true,
      result
    });

  } catch (error) {
      write_logs({ message: `[getCampaignAndAdGroup Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("getCampaignAndAdGroup Error:", error);
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong"
    });
  }
};

exports.getAllUsers = async (req, res) => {
  const userId = req.user._id;
  try {
    let {
      pageNo = 1,
      perPage = 10,
      searchName = "",
      fieldName = "createdAt",
      sortType = "DESC",
    } = req.body;

    pageNo = Number(pageNo);
    perPage = Number(perPage);


    const role = await userSchema.aggregate([
      { $match: { _id: userId } },
      {
        $lookup: {
          from: "roles",
          localField: "roleId",
          foreignField: "_id",
          as: "roles",
        },
      },
      { $unwind: { path: "$roles", preserveNullAndEmptyArrays: true } },
      { $project: { roleName: "$roles.roleName" } }
    ]);

    const orgId = req.organizationId;
    let query = {
      $or: [{ isActive: true }]
    };

    if (orgId && role[0]?.roleName !== ROLES.SUPER_ADMIN) {
      const orgDoc = await organizationSchema.findById(orgId).lean();
      const ownerId = orgDoc?.userId ? orgDoc.userId.toString() : null;

      const roleUserIds = await roleBasedPermissionSchema.find({ organizationId: orgId }).distinct("userId");
      const profileUserIds = await profileBasedPermissionSchema.find({ organizationId: orgId, hasAccess: true }).distinct("userId");
      const orgUserIds = await userSchema.find({ organizationId: orgId, isActive: true }).distinct("_id");

      let allIds = [...new Set([...roleUserIds, ...profileUserIds, ...orgUserIds].map(id => id?.toString()))].filter(Boolean);
      if (ownerId) {
        allIds = allIds.filter(id => id !== ownerId);
      }

      const myRolePerm = await roleBasedPermissionSchema.findOne({ userId, organizationId: orgId }).populate("roleId").lean();
      const isMyRoleAdmin = myRolePerm?.roleId?.roleName === ROLES.ADMIN;
      const isOwner = userId.toString() === ownerId;

      req.isOrgUserRestricted = !isMyRoleAdmin && !isOwner;

      if (req.isOrgUserRestricted) {
        const myProfPerms = await profileBasedPermissionSchema.find({ userId, organizationId: orgId, hasAccess: true }).lean();
        const myProfileIds = new Set(myProfPerms.map(p => p.profileId?.toString()));
        req.myProfileIdsSet = myProfileIds;

        const allOrgProfPerms = await profileBasedPermissionSchema.find({ organizationId: orgId, hasAccess: true }).lean();
        const allowedUserIds = new Set([userId.toString()]);
        for (const p of allOrgProfPerms) {
          if (myProfileIds.has(p.profileId?.toString())) {
            allowedUserIds.add(p.userId?.toString());
          }
        }
        allIds = allIds.filter(id => allowedUserIds.has(id));
      }

      query = { _id: { $in: allIds.map(id => new mongoose.Types.ObjectId(id)) }, isActive: true };
    }

    const pipeline = [
      {
        $match: query
      },
      {
        $lookup: {
          from: "countries",
          localField: "country",
          foreignField: "_id",
          as: "country",
        },
      },
      { $unwind: { path: "$country", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "roles",
          localField: "roleId",
          foreignField: "_id",
          as: "roles",
        },
      },
      { $unwind: { path: "$roles", preserveNullAndEmptyArrays: true } },
      { $match: { "roles.roleName": { $ne: ROLES.SUPER_ADMIN } } },
      ...(searchName?.trim() !== "" ? [
        {
          $match: {
            $or: [
              { fullName: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
              { email: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
              { companyName: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
              { phoneNumber: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
              { companyPhoneNumber: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
              { companyWebsite: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
              { "country.countryName": { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
            ]
          }
        }
      ] : []),
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { [fieldName]: sortType === "ASC" ? 1 : -1 } },
            { $skip: (pageNo - 1) * perPage },
            { $limit: perPage },
            {
              $lookup: {
                from: "profilebasedpermissions",
                let: { userId: "$_id" },
                pipeline: [
                  { $match: { $expr: { $and: [{ $eq: ["$userId", "$$userId"] }, { $eq: ["$hasAccess", true] }] } } },
                  { $group: { _id: null, profileAccess: { $addToSet: { profileId: "$profileId", configId: "$configId" } } } },
                  { $project: { _id: 0, profileAccess: 1 } }
                ],
                as: "profileAccess"
              }
            },
            { $addFields: { profileAccess: { $ifNull: [{ $arrayElemAt: ["$profileAccess.profileAccess", 0] }, []] } } },
            {
              $project: {
                password: 0,
                stringPassword: 0,
                resetPasswordToken: 0,
                resetPasswordExpires: 0,
              }
            }
          ],
        },
      }
    ];

    const result = await userSchema.aggregate(pipeline);

    const totalRecords = result[0]?.metadata[0]?.total || 0;
    const rawData = result[0]?.data || [];

    // --- Batch fetch enrichment data for paginated users (O(1) queries instead of O(N*M)) ---
    const userIds = rawData.map(u => u._id).filter(Boolean);
    const userIdStrs = userIds.map(id => id.toString());

    // 1. Batch fetch RoleBasedPermissions if orgId is present
    let rbpByUserId = new Map();
    if (orgId && userIds.length > 0) {
      const rbpList = await roleBasedPermissionSchema.find({ userId: { $in: userIds }, organizationId: orgId }).populate("roleId", { roleName: 1 }).lean();
      for (const rbp of rbpList) {
        if (rbp.userId) rbpByUserId.set(rbp.userId.toString(), rbp);
      }
    }

    // 2. Batch fetch profileAccess config & profile details across all paginated users
    const allPAConfigIds = [...new Set(rawData.flatMap(u => (u.profileAccess || []).map(p => p.configId?.toString())).filter(Boolean))];
    const allPAProfileIds = [...new Set(rawData.flatMap(u => (u.profileAccess || []).map(p => p.profileId?.toString())).filter(Boolean))];
    let paConfigSet = new Set();
    let paProfileMap = new Map();
    if (allPAConfigIds.length > 0) {
      const [paConfigs, paProfiles] = await Promise.all([
        configSchema.find({ _id: { $in: allPAConfigIds }, ...(orgId ? { organizationId: orgId } : {}) }, { _id: 1 }).lean(),
        profileSchema.find({ configId: { $in: allPAConfigIds }, profileId: { $in: allPAProfileIds } }, { configId: 1, profileId: 1, countryCode: 1, name: 1 }).lean()
      ]);
      paConfigSet = new Set(paConfigs.map(c => c._id.toString()));
      for (const p of paProfiles) {
        paProfileMap.set(`${p.configId?.toString()}_${p.profileId}`, p);
      }
    }

    // 3. Batch fetch organization data for SUPER_ADMIN
    let ownedOrgsByUser = new Map();
    let rolePermsByUser = new Map();
    let profPermsByUser = new Map();
    let configsByOrgId = new Map();
    let configsByUserNullOrg = new Map();
    let profilesByConfigId = new Map();

    if (role[0]?.roleName === ROLES.SUPER_ADMIN && userIds.length > 0) {
      const [allOwnedOrgs, allRolePerms, allProfPerms] = await Promise.all([
        organizationSchema.find({ userId: { $in: userIds } }).lean(),
        roleBasedPermissionSchema.find({ userId: { $in: userIds } }).populate("organizationId").populate("roleId").lean(),
        profileBasedPermissionSchema.find({ userId: { $in: userIds }, hasAccess: true }).populate("organizationId").lean()
      ]);

      for (const org of allOwnedOrgs) {
        const uid = org.userId?.toString();
        if (!uid) continue;
        if (!ownedOrgsByUser.has(uid)) ownedOrgsByUser.set(uid, []);
        ownedOrgsByUser.get(uid).push(org);
      }
      for (const rbp of allRolePerms) {
        const uid = rbp.userId?.toString();
        if (!uid) continue;
        if (!rolePermsByUser.has(uid)) rolePermsByUser.set(uid, []);
        rolePermsByUser.get(uid).push(rbp);
      }
      for (const pbp of allProfPerms) {
        const uid = pbp.userId?.toString();
        if (!uid) continue;
        if (!profPermsByUser.has(uid)) profPermsByUser.set(uid, []);
        profPermsByUser.get(uid).push(pbp);
      }

      const allOrgIds = [...new Set([
        ...allOwnedOrgs.map(o => o._id?.toString()),
        ...allRolePerms.map(r => r.organizationId?._id?.toString()),
        ...allProfPerms.map(p => p.organizationId?._id?.toString())
      ].filter(Boolean))];

      const allConfigs = await configSchema.find({
        $or: [
          { organizationId: { $in: allOrgIds } },
          { userId: { $in: userIds }, organizationId: null }
        ]
      }, { companyName: 1, _id: 1, organizationId: 1, userId: 1 }).lean();

      const allConfigIds = allConfigs.map(c => c._id);
      const allProfiles = await profileSchema.find({
        configId: { $in: allConfigIds },
        isActive: true
      }, { countryCode: 1, name: 1, profileId: 1, configId: 1 }).lean();

      for (const c of allConfigs) {
        if (c.organizationId) {
          const oid = c.organizationId.toString();
          if (!configsByOrgId.has(oid)) configsByOrgId.set(oid, []);
          configsByOrgId.get(oid).push(c);
        } else if (c.userId) {
          const uid = c.userId.toString();
          if (!configsByUserNullOrg.has(uid)) configsByUserNullOrg.set(uid, []);
          configsByUserNullOrg.get(uid).push(c);
        }
      }

      for (const p of allProfiles) {
        const cid = p.configId?.toString();
        if (!cid) continue;
        if (!profilesByConfigId.has(cid)) profilesByConfigId.set(cid, []);
        profilesByConfigId.get(cid).push(p);
      }
    }

    const enrichedData = [];
    for (const u of rawData) {
      const uidStr = u._id?.toString();
      if (orgId) {
        const rbp = rbpByUserId.get(uidStr);
        if (rbp && rbp.roleId) {
          u.roles = { roleName: rbp.roleId.roleName };
          u.roleId = rbp.roleId._id;
        }
      }

      if (u.profileAccess && u.profileAccess.length > 0) {
        const enrichedPA = [];
        for (const item of u.profileAccess) {
          if (!item.configId || !item.profileId) continue;
          if (orgId && !paConfigSet.has(item.configId.toString())) continue;

          if (req.isOrgUserRestricted && uidStr !== userId.toString()) {
            if (!req.myProfileIdsSet || !req.myProfileIdsSet.has(item.profileId.toString())) {
              continue;
            }
          }

          const prof = paProfileMap.get(`${item.configId.toString()}_${item.profileId}`);
          enrichedPA.push({
            configId: item.configId,
            profileId: item.profileId,
            countryCode: prof?.countryCode || "",
            name: prof?.name || `Profile ${item.profileId}`,
          });
        }
        u.profileAccess = enrichedPA;
      }

      if (role[0]?.roleName === ROLES.SUPER_ADMIN) {
        const ownedOrgs = ownedOrgsByUser.get(uidStr) || [];
        const rolePerms = rolePermsByUser.get(uidStr) || [];
        const profPerms = profPermsByUser.get(uidStr) || [];

        const orgMap = new Map();
        for (const org of ownedOrgs) {
          if (!org._id) continue;
          const orgIdStr = org._id.toString();
          const configs = [
            ...(configsByOrgId.get(orgIdStr) || []),
            ...(configsByUserNullOrg.get(uidStr) || [])
          ];
          const profiles = configs.flatMap(c => profilesByConfigId.get(c._id.toString()) || []);

          orgMap.set(orgIdStr, {
            _id: org._id,
            organizationName: org.organizationName,
            roleName: ROLES.ADMIN,
            roleId: null,
            isOwner: true,
            companyAccessList: configs.map(c => ({ _id: c._id, companyName: c.companyName || "Config" })),
            profileAccessList: profiles.map(p => ({ _id: p._id, profileId: p.profileId, countryCode: p.countryCode || "", name: p.name || `Profile ${p.profileId}`, configId: p.configId })),
          });
        }

        for (const rbp of rolePerms) {
          if (!rbp.organizationId || !rbp.organizationId._id) continue;
          const orgIdStr = rbp.organizationId._id.toString();
          if (!orgMap.has(orgIdStr)) {
            const configs = configsByOrgId.get(orgIdStr) || [];
            const profiles = configs.flatMap(c => profilesByConfigId.get(c._id.toString()) || []);
            orgMap.set(orgIdStr, {
              _id: rbp.organizationId._id,
              organizationName: rbp.organizationId.organizationName,
              roleName: rbp.roleId?.roleName || "USER",
              roleId: rbp.roleId?._id || null,
              isOwner: false,
              companyAccessList: configs.map(c => ({ _id: c._id, companyName: c.companyName || "Config" })),
              profileAccessList: profiles.map(p => ({ _id: p._id, profileId: p.profileId, countryCode: p.countryCode || "", name: p.name || `Profile ${p.profileId}`, configId: p.configId })),
            });
          } else {
            const existing = orgMap.get(orgIdStr);
            if (rbp.roleId?.roleName) {
              existing.roleName = rbp.roleId.roleName;
              existing.roleId = rbp.roleId._id;
            }
          }
        }

        for (const pbp of profPerms) {
          if (!pbp.organizationId || !pbp.organizationId._id) continue;
          const orgIdStr = pbp.organizationId._id.toString();
          if (!orgMap.has(orgIdStr)) {
            const configs = configsByOrgId.get(orgIdStr) || [];
            const profiles = configs.flatMap(c => profilesByConfigId.get(c._id.toString()) || []);
            orgMap.set(orgIdStr, {
              _id: pbp.organizationId._id,
              organizationName: pbp.organizationId.organizationName,
              roleName: "USER",
              roleId: null,
              isOwner: false,
              companyAccessList: configs.map(c => ({ _id: c._id, companyName: c.companyName || "Config" })),
              profileAccessList: profiles.map(p => ({ _id: p._id, profileId: p.profileId, countryCode: p.countryCode || "", name: p.name || `Profile ${p.profileId}`, configId: p.configId })),
            });
          }
        }

        u.organizations = Array.from(orgMap.values());

        for (const org of u.organizations) {
          if (!org.isOwner && org.roleName !== ROLES.ADMIN && org.roleName !== ROLES.SUPER_ADMIN) {
            const userProfPerms = profPermsByUser.get(uidStr) || [];
            const orgProfPerms = userProfPerms.filter(p => p.organizationId?._id?.toString() === org._id.toString());
            const allowedConfigIds = new Set(orgProfPerms.map(p => p.configId?.toString()));
            const allowedProfileIds = new Set(orgProfPerms.map(p => p.profileId?.toString()));

            org.companyAccessList = org.companyAccessList.filter(c => allowedConfigIds.has(c._id.toString()));
            org.profileAccessList = org.profileAccessList.filter(p => allowedConfigIds.has(p.configId?.toString()) && allowedProfileIds.has(p.profileId?.toString()));
          }
        }

        u.organizationsCount = u.organizations.length;
      }

      enrichedData.push(u);
    }

    return res.status(200).send({
      message: "Users fetched successfully.",
      isSuccess: true,
      totalRecords,
      currentPageNo: pageNo,
      totalPages: Math.ceil(totalRecords / perPage),
      data: enrichedData,
    });
  } catch (error) {
      write_logs({ message: `[getAllUsers Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getAllConfigs = async (req, res) => {
  try {
    const userId = req.user._id;
    const isOwner = req.role.roleName === ROLES.SUPER_ADMIN ? true : false;
    const orgId = req?.organizationId;
    const matchOrgId = orgId && orgId !== "null" && orgId !== "undefined" && mongoose.Types.ObjectId.isValid(orgId) ? new mongoose.Types.ObjectId(orgId) : null;

    if (isOwner) {
      const pipeline = [
        ...(matchOrgId ? [{ $match: { $or: [{ organizationId: matchOrgId }, { organizationId: null }, { organizationId: { $exists: false } }] } }] : []),
        {
          $lookup: {
            from: "profiles",
            let: { cfgId: "$_id" },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ["$configId", "$$cfgId"] }] } } },
              { $project: { _id: 1, profileId: 1, countryCode: 1, name: 1, type: 1 } }
            ],
            as: "profiles"
          }
        },
        { $project: { adsAccessToken: 0, adsRefressToken: 0, adsClientSeceret: 0 } },
        { $sort: { createdAt: -1 } }
      ];

      const data = await configSchema.aggregate(pipeline);

      return res.status(200).send({
        message: "Config fetched successfully.",
        isSuccess: true,
        data,
      });

    } else {

      const pipeline = [
        {
          $match: {
            userId,
            hasAccess: true,
            ...(matchOrgId && { organizationId: matchOrgId })
          }
        },
        {
          $lookup: {
            from: "configs",
            let: { cfgId: "$configId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$_id", "$$cfgId"] },
                      ...(matchOrgId ? [{ $or: [{ $eq: ["$organizationId", matchOrgId] }, { $eq: ["$organizationId", null] }, { $not: ["$organizationId"] }] }] : [])
                    ]
                  }
                }
              }
            ],
            as: "access"
          }
        },
        {
          $unwind: {
            path: "$access",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: "profiles",
            let: { cfgId: "$configId", pId: "$profileId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$configId", "$$cfgId"] },
                      { $eq: ["$profileId", "$$pId"] },
                      // { $eq: ["$isActive", true] }
                    ]
                  }
                }
              },
              {
                $project: {
                  _id: 1,
                  profileId: 1,
                  countryCode: 1,
                  name: 1,
                  type: 1
                }
              }
            ],
            as: "profileDoc"
          }
        },
        {
          $unwind: {
            path: "$profileDoc",
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $group: {
            _id: "$access._id",
            companyName: { $first: "$access.companyName" },
            adsClientId: { $first: "$access.adsClientId" },
            isActive: { $first: "$access.isActive" },
            createdAt: { $first: "$access.createdAt" },
            updatedAt: { $first: "$access.updatedAt" },
            userId: { $first: "$access.userId" },
            profiles: { $push: "$profileDoc" }

          }
        }

      ];

      const dataFromPermissions = await profileBasedPermissionSchema.aggregate(pipeline);

      const myConfigsPipeline = [
        { $match: { organizationId: matchOrgId } },
        {
          $lookup: {
            from: "profiles",
            let: { cfgId: "$_id" },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ["$configId", "$$cfgId"] }] } } },
              { $project: { _id: 1, profileId: 1, countryCode: 1, name: 1, type: 1 } }
            ],
            as: "profiles"
          }
        },
        { $project: { adsAccessToken: 0, adsRefressToken: 0, adsClientSeceret: 0 } }
      ];

      const myConfigsData = await configSchema.aggregate(myConfigsPipeline);
      const mergedMap = new Map();
      for (const cfg of myConfigsData) mergedMap.set(cfg._id.toString(), cfg);
      for (const cfg of dataFromPermissions) {
        if (!mergedMap.has(cfg._id.toString())) mergedMap.set(cfg._id.toString(), cfg);
      }
      const data = Array.from(mergedMap.values());
      data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      return res.status(200).send({
        message: "Config fetched successfully.",
        isSuccess: true,
        data,
      });
    }
  } catch (error) {
      write_logs({ message: `[getAllConfigs Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getAllSellerConfigs = async (req, res) => {
  try {
    const userId = req.user._id;
    const isOwner = req.role.roleName === ROLES.SUPER_ADMIN ? true : false;
    const orgId = req?.organizationId;
    const matchOrgId = orgId && orgId !== "null" && orgId !== "undefined" && mongoose.Types.ObjectId.isValid(orgId) ? new mongoose.Types.ObjectId(orgId) : null;

    if (isOwner) {
      const pipeline = [
        // { $match: { isActive: true } },
        ...(matchOrgId ? [
          {
            $lookup: {
              from: "configs",
              localField: "configId",
              foreignField: "_id",
              as: "configDoc"
            }
          },
          { $unwind: "$configDoc" },
          { $match: { $or: [{ "configDoc.organizationId": matchOrgId }, { "configDoc.organizationId": null }, { "configDoc.organizationId": { $exists: false } }] } }
        ] : []),
        {
          $lookup: {
            from: "sellerconfigs",
            let: { cfgId: "$configId", profId: "$profileId" },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ["$configId", "$$cfgId"] }, { $eq: ["$profileId", "$$profId"] }] } } },
              { $project: { spAccessToken: 0, spRefreshToken: 0, spClientSecret: 0 } },
              { $limit: 1 }
            ],
            as: "sellerConfig"
          }
        },
        { $addFields: { sellerConfig: { $arrayElemAt: ["$sellerConfig", 0] } } },
        {
          $lookup: {
            from: "amssubscriptions",
            let: { cfgId: "$configId", profId: "$profileId" },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ["$configId", "$$cfgId"] }, { $eq: ["$profileId", "$$profId"] }] }, status: "ACTIVE" } },
              { $project: { dataset: 1 } }
            ],
            as: "amsSubscription"
          }
        },
        {
          $lookup: {
            from: "configs",
            localField: "configId",
            foreignField: "_id",
            as: "configId"
          }
        },
        {
          $addFields: {
            configId: { $arrayElemAt: ["$configId", 0] }
          }
        },
        {
          $project: {
            _id: 1,
            configId: 1,
            profileId: 1,
            name: 1,
            countryCode: 1,
            type: 1,
            marketplaceStringId: 1,
            isActive: 1,
            isSpSyncEnabled: 1,
            sellerConfig: 1,
            amsSubscription: 1,
          }
        }
      ];

      const data = await profileSchema.aggregate(pipeline);

      return res.status(200).send({
        message: "Profiles fetched successfully",
        isSuccess: true,
        data,
      });

    } else {

      const pipeline = [
        {
          $match: {
            userId,
            ...(matchOrgId && { organizationId: matchOrgId })
          }
        },
        {
          $lookup: {
            from: "profiles",
            let: {
              pId: "$profileId"
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $eq: ["$profileId", "$$pId"]
                      },
                      // {
                      //   $eq: ["$isActive", true]
                      // }
                    ]
                  }
                }
              },
              {
                $project: {
                  _id: 1,
                  configId: 1,
                  profileId: 1,
                  name: 1,
                  countryCode: 1,
                  type: 1,
                  marketplaceStringId: 1,
                  isActive: 1,
                  isSpSyncEnabled: 1,
                  sellerConfig: 1,
                  amsSubscription: 1
                }
              }
            ],
            as: "profiles"
          }
        },
        {
          $addFields: {
            profiles: {
              $arrayElemAt: ["$profiles", 0]
            }
          }
        },
        {
          $match: {
            profiles: { $ne: null }
          }
        },
        {
          $lookup: {
            from: "sellerconfigs",
            let: {
              cfgId: { $ifNull: ["$configId", "$profiles.configId"] },
              profId: "$profileId"
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $eq: ["$configId", "$$cfgId"]
                      },
                      {
                        $eq: ["$profileId", "$$profId"]
                      }
                    ]
                  }
                }
              },
              { $project: { spAccessToken: 0, spRefreshToken: 0, spClientSecret: 0 } },
              {
                $limit: 1
              }
            ],
            as: "sellerConfig"
          }
        },
        {
          $addFields: {
            sellerConfig: {
              $arrayElemAt: ["$sellerConfig", 0]
            }
          }
        },
        {
          $lookup: {
            from: "amssubscriptions",
            let: {
              cfgId: { $ifNull: ["$configId", "$profiles.configId"] },
              profId: "$profileId"
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $eq: ["$configId", "$$cfgId"]
                      },
                      {
                        $eq: ["$profileId", "$$profId"]
                      }
                    ]
                  },
                  status: "ACTIVE"
                }
              },
              {
                $project: {
                  dataset: 1
                }
              }
            ],
            as: "amsSubscription"
          }
        },
        {
          $lookup: {
            from: "configs",
            localField: "profiles.configId",
            foreignField: "_id",
            as: "configDoc"
          }
        },
        {
          $addFields: {
            configDoc: { $arrayElemAt: ["$configDoc", 0] }
          }
        },
        {
          $project: {
            _id: "$profiles._id",
            configId: { $ifNull: ["$configDoc", "$profiles.configId"] },
            profileId: "$profiles.profileId",
            name: "$profiles.name",
            countryCode: "$profiles.countryCode",
            type: "$profiles.type",
            marketplaceStringId: "$profiles.marketplaceStringId",
            isActive: "$profiles.isActive",
            isSpSyncEnabled: "$profiles.isSpSyncEnabled",
            sellerConfig: 1,
            amsSubscription: 1
          }
        }
      ];

      const data = await profileBasedPermissionSchema.aggregate(pipeline);

      return res.status(200).send({
        message: "Profiles fetched successfully.",
        isSuccess: true,
        data,
      });
    }


  } catch (error) {
      write_logs({ message: `[getAllSellerConfigs Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.getadsNotification = async (req, res) => {
  const configId = req?.config?.configId;
  try {

    let {
      profileId,
      pageNo = 1,
      perPage = 10,
    } = req.body;

    const result = await adNotificationSchema.aggregate([
      {
        $match: {
          configId,
          profileId
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          unseenCount: [
            { $match: { seen: { $ne: true } } },
            { $count: "count" }
          ],
          data: [
            { $skip: (pageNo - 1) * perPage },
            { $limit: perPage }
          ]
        }
      },
      {
        $project: {
          totalCount: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
          totalUnseen: { $ifNull: [{ $arrayElemAt: ["$unseenCount.count", 0] }, 0] },
          data: 1
        }
      }
    ]);

    return res.status(200).send({
      message: "Notification Fetched Successfully.",
      isSuccess: true,
      currentPageNo: pageNo,
      totalRecords: result[0]?.totalCount ?? 0,
      totalUnseen: result[0]?.totalUnseen || 0,
      totalPages: Math.ceil((result[0]?.totalCount ?? 0) / perPage),
      data: result[0]?.data || [],
    });

  } catch (error) {
      write_logs({ message: `[getadsNotification Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.readAdsNotification = async (req, res) => {
  const configId = req?.config?.configId;
  try {
    const { notificationId } = req.body;

    if (!notificationId) {
      return res.status(400).send({
        message: "Notification ID is required.",
        isSuccess: false,
      });
    }

    const notification = await adNotificationSchema.findOneAndUpdate(
      { _id: notificationId, configId },
      { $set: { seen: true } },
      { new: true }
    ).lean();

    if (!notification) {
      return res.status(404).send({
        message: "Notification not found.",
        isSuccess: false,
      });
    }

    return res.status(200).send({
      message: "Notification marked as read successfully.",
      isSuccess: true,
      data: notification,
    });
  } catch (error) {
      write_logs({ message: `[readAdsNotification Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.readAllAdsNotification = async (req, res) => {
  const configId = req?.config?.configId;
  try {
    const { profileId } = req.body;

    if (!profileId) {
      return res.status(400).send({
        message: "Profile ID is required.",
        isSuccess: false,
      });
    }

    const result = await adNotificationSchema.updateMany(
      { configId, profileId, seen: { $ne: true } },
      { $set: { seen: true } }
    );

    return res.status(200).send({
      message: "All notifications marked as read successfully.",
      isSuccess: true,
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
      write_logs({ message: `[readAllAdsNotification Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.customChatBot = async (req, res) => {
  try {
    const { message, profileIds, reportContext, followUpRequest } = req.body;

    const userId = req.user?.id || req.user?._id;
    const organizationId = req.organizationId || req.user?.organizationId;
    const isContinuing = Boolean(followUpRequest || reportContext || (Array.isArray(req.body?.history) && req.body.history.length > 0) || req.body?.isContinuing);
    const requiredAction = isContinuing ? "Update" : "Create";
    const { checkPermission } = require("../helper/common");
    const permCheck = await checkPermission(userId, "AI Assistant", requiredAction, true, organizationId);
    if (req.user?.roleName !== "SUPER_ADMIN" && !permCheck?.hasPermission) {
      return res.status(203).json({
        isSuccess: false,
        replyMessage: `You do not have permission to ${isContinuing ? "continue this chat" : "create a new chat"}. (${requiredAction} permission required for AI Assistant)`,
        message: `Permission denied: ${requiredAction} action required for AI Assistant.`
      });
    }

    const rawProfileIds = profileIds || (req.user?.profileId ? [String(req.user.profileId)] : []);
    const activeProfileIds = (Array.isArray(rawProfileIds) ? rawProfileIds : [rawProfileIds])
      .map(id => typeof id === 'object' && id !== null ? (id.value || id.profileId || id.id) : id)
      .map(String)
      .filter(id => id && /^\d+$/.test(id));

    // Recheck access and reset reportContext when active profiles switch
    let safeReportContext = reportContext;
    if (safeReportContext && Array.isArray(safeReportContext.profileIds) && activeProfileIds.length) {
      const contextIds = safeReportContext.profileIds.map(String);
      const hasSameSelection = contextIds.length === activeProfileIds.length
        && contextIds.every(id => activeProfileIds.includes(id));
      if (!hasSameSelection) {
        safeReportContext = null;
      }
    }

    const hasHistory = Array.isArray(req.body?.history) && req.body.history.length > 0;
    const isReporting = Boolean(
      isContinuing ||
      hasHistory ||
      followUpRequest ||
      safeReportContext ||
      isAnalyticsQuestion(message) ||
      isGeneralOrConversationalQuestion(message)
    );

    let activeProfile = null;
    if (activeProfileIds.length > 0 && mongoose.connection.readyState === 1) {
      try {
        const profileDoc = await mongoose.connection.db.collection('profiles').findOne({
          profileId: activeProfileIds[0]
        });
        if (profileDoc) {
          activeProfile = {
            profileId: activeProfileIds[0],
            name: profileDoc.name || profileDoc.profileName,
            currencyCode: profileDoc.currencyCode,
            timezone: profileDoc.timezone,
            countryCode: profileDoc.countryCode,
            type: profileDoc.type,
          };
        }
      } catch (_) {}
    }

    const isStream = Boolean(req.body?.stream === true || req.headers?.accept?.includes('text/event-stream'));

    if (isReporting) {
      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const sendEvent = (event, data) => {
          try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            if (typeof res.flush === 'function') res.flush();
          } catch (_) {}
        };

        sendEvent('status', { message: 'Analyzing question...' });

        const chatInput = {
          ...req.body,
          profileIds: activeProfileIds.length ? activeProfileIds : undefined,
          reportContext: safeReportContext || undefined,
          onStatus: (status) => sendEvent('status', { message: status }),
          onReport: (report) => sendEvent('report', { report, isReport: true }),
          onToken: (token) => sendEvent('token', { delta: token }),
        };

        const chatResult = await defaultReportingChatService(chatInput, {
          userId: req.user?._id || req.user?.id,
          configId: req.config?.configId || req.user?.configId,
          organizationId: req.organizationId || req.user?.organizationId,
          profileIds: activeProfileIds,
          activeProfile,
          currencyCode: activeProfile?.currencyCode || req.user?.currencyCode || 'INR',
        });

        sendEvent('done', {
          replyMessage: chatResult?.replyMessage || 'Here is your requested report.',
          report: chatResult?.report || null,
          isReport: Boolean(chatResult?.isReport),
          stopConversion: false,
          error: chatResult?.error || null,
        });
        return res.end();
      }

      const chatInput = {
        ...req.body,
        profileIds: activeProfileIds.length ? activeProfileIds : undefined,
        reportContext: safeReportContext || undefined,
      };

      const chatResult = await defaultReportingChatService(chatInput, {
        userId: req.user?._id || req.user?.id,
        configId: req.config?.configId || req.user?.configId,
        organizationId: req.organizationId || req.user?.organizationId,
        profileIds: activeProfileIds,
      });

      if (chatResult) {
        return res.status(200).send({
          replyMessage: chatResult.replyMessage || 'Here is your requested report.',
          report: chatResult.report || null,
          isReport: Boolean(chatResult.isReport),
          stopConversion: false,
        });
      }
    }

    const matchedFAQ = await getMostMatchedFAQ(message);
    const wordCount = getMeaningfulWord(message)?.length;

    let nonReportingReply = '';
    let stopConversion = false;
    let stopType;

    if (!matchedFAQ) {
      if (wordCount <= 3) {
        nonReportingReply = `<p><b>Sorry!</b> 😕 I don’t understand your meaning.</p><p>Please describe your issue in more detail so I can help you better.</p>`;
      } else {
        await recordUnansweredQuestion({ message, profileIds: activeProfileIds }, {
          userId,
          configId: req.config?.configId || req.user?.configId,
          organizationId,
        }, 'unanswered');
        nonReportingReply = `
          <p><b>Thanks for explaining.</b> 📝</p>
          <p>I couldn’t find an exact answer, so I’m creating a support ticket for you.</p>
          <p>📧 Our team will contact you shortly.</p>
        `;
        stopConversion = true;
        stopType = "CREATE_TICKET";
      }
    } else {
      nonReportingReply = matchedFAQ?.answer || '';
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(`event: done\ndata: ${JSON.stringify({
        replyMessage: nonReportingReply,
        report: null,
        isReport: false,
        stopConversion,
        stopType,
      })}\n\n`);
      return res.end();
    }

    return res.status(200).send({
      replyMessage: nonReportingReply,
      stopConversion,
      stopType,
    });
  } catch (error) {
      write_logs({ message: `[customChatBot Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    if (res.headersSent) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ replyMessage: '<b>Error:</b> <span style="color:red;">An internal server error occurred</span>. Please <i>try again later</i>.' })}\n\n`);
        res.end();
      } catch (_) {}
      return;
    }
    return res.status(200).send({
      message: "Something went wrong, please try again!",
      replyMessage: `<b>Error:</b> <span style="color:red;">An internal server error occurred</span>. Please <i>try again later</i>.`,
    });
  }
}

exports.createSupportTicket = async (req, res) => {
  try {
    const {
      needAdditionalMessage,
      additionalMessage,
      needCC,
      ccEmail,
      fileUrl,
    } = req.body;
    const userName = req.user?.userName || req.user?.name || req.body.userName || "Customer";
    const userEmail = req.user?.email || req.body.userEmail;
    const userId = req.user?._id || null;

    const newTicket = await supportTicketSchema.create({
      userId,
      userName,
      userEmail,
      message: additionalMessage,
      needAdditionalMessage,
      needCC,
      ccEmail,
      image: fileUrl,
    });

    await supportTicketMessageSchema.create({
      ticketId: newTicket._id,
      from: "user",
      text: additionalMessage,
      image: fileUrl,
    });

    /* ---------- CREATE ASANA TASK (NON-BLOCKING) ---------- */
    try {
      const asanaTaskId = await createAsanaTicket({
        ticketId: newTicket._id,
        userName,
        userEmail,
        message: additionalMessage,
        fileUrl,
      });

      await supportTicketSchema.updateOne(
        { _id: newTicket._id },
        { $set: { asanaTaskId } }
      );
    } catch (asanaError) {
      write_logs({ message: `Asana creation failed: ${JSON.stringify(asanaError)} [body] ${JSON.stringify(req?.body)}` })
    }

    const payload = Buffer.from(JSON.stringify({ ticketId: newTicket._id, email: userEmail })).toString("base64");
    const chatLink = `${process.env.FRONTEND_REDIRECT_URL}/support-chat?payload=${payload}`;

    // 📧 Send email to user
    sendEmailHelper(
      userEmail,
      "Your Support Ticket Has Been Created",
      buildSupportTicketEmail({
        userName,
        ticketId: newTicket._id,
        message: additionalMessage,
        chatLink,
        fileUrl,
        type: "created",
      })
    ).catch((err) => { write_logs({ message: "[createSupportTicket Silent Error] " + (err?.message || err), log_type: "error" }); });

    // 📧 Send email to CC if provided
    if (needCC && ccEmail) {
      sendEmailHelper(
        ccEmail,
        `[CC] Your Support Ticket Has Been Created (#${newTicket._id})`,
        buildSupportTicketEmail({
          userName: `${userName} (CC: ${ccEmail})`,
          ticketId: newTicket._id,
          message: additionalMessage,
          chatLink,
          fileUrl,
          type: "created",
        })
      ).catch((err) => { write_logs({ message: "[createSupportTicket Silent Error] " + (err?.message || err), log_type: "error" }); });
    }

    return res.status(200).json({
      isSuccess: true,
      message: "Support ticket created successfully",
    });
  } catch (error) {
      write_logs({ message: `[createSupportTicket Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
}

exports.getSupportTicket = async (req, res) => {
  try {
    const { payload } = req.body;

    if (!payload) {
      return res.status(203).json({
        isSuccess: false,
        message: "Invalid or missing payload",
      });
    }

    /* ---------- DECODE PAYLOAD ---------- */
    let decoded;
    try {
      decoded = safeJsonParse(Buffer.from(payload, "base64").toString("utf-8"));
    } catch (err) {
        write_logs({ message: `[getSupportTicket Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
      return res.status(203).json({
        isSuccess: false,
        message: "Invalid payload format",
      });
    }

    const { ticketId } = decoded;
    if (!ticketId) {
      return res.status(203).json({
        isSuccess: false,
        message: "Payload data missing",
      });
    }

    /* ---------- FETCH TICKET ---------- */
    const ticket = await supportTicketSchema.findOne({ _id: ticketId }).lean();
    if (!ticket) {
      return res.status(203).json({
        isSuccess: false,
        message: "Support ticket not found",
      });
    }

    /* ---------- CHECK OWNERSHIP ---------- */
    const isOwnerRole = req?.role?.roleName === ROLES.SUPER_ADMIN;
    const isOwner = isOwnerRole || (ticket.userId && ticket.userId.toString() === req.user?._id?.toString()) || (ticket.userEmail && ticket.userEmail.toLowerCase() === req.user?.email?.toLowerCase());
    if (!isOwner && req.user?._id) {
      return res.status(203).json({
        isSuccess: false,
        message: "Access denied to this support ticket",
      });
    }

    /* ---------- FETCH MESSAGES ---------- */
    const messages = await supportTicketMessageSchema.find({ ticketId: ticket._id }).lean().sort({ createdAt: 1 });

    return res.status(200).json({
      isSuccess: true,
      ticket,
      messages,
    });

  } catch (error) {
      write_logs({ message: `[getSupportTicket Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Unable to load support ticket",
      error: "An internal server error occurred",
    });
  }
};

exports.sendSupportTicketMessage = async (req, res) => {
  try {
    const { ticketId, text, from, fileUrl } = req.body;

    /* ---------- VALIDATION ---------- */
    if (!ticketId || !from || (!text?.trim() && !fileUrl)) {
      return res.status(203).json({
        isSuccess: false,
        message: "ticketId, text and from are required",
      });
    }

    if (!["user", "bot"].includes(from)) {
      return res.status(203).json({
        isSuccess: false,
        message: "Invalid message sender",
      });
    }

    /* ---------- FIND TICKET ---------- */
    const ticket = await supportTicketSchema.findById(ticketId).lean();
    if (!ticket) {
      return res.status(203).json({
        isSuccess: false,
        message: "Support ticket not found",
      });
    }

    /* ---------- CHECK OWNERSHIP ---------- */
    const isOwnerRole = req?.role?.roleName === ROLES.SUPER_ADMIN;
    const isOwner = isOwnerRole || (ticket.userId && ticket.userId.toString() === req.user?._id?.toString()) || (ticket.userEmail && ticket.userEmail.toLowerCase() === req.user?.email?.toLowerCase());
    if (!isOwner && req.user?._id && from === "user") {
      return res.status(203).json({
        isSuccess: false,
        message: "Access denied to post to this support ticket",
      });
    }

    /* ---------- SAVE MESSAGE ---------- */
    const savedMessage = await supportTicketMessageSchema.create({ ticketId, from, text, image: fileUrl });

    /* ---------- UPDATE TICKET STATUS ---------- */
    await supportTicketSchema.updateOne(
      { _id: ticketId },
      { $set: { status: from === "bot" ? "pending" : "open" } }
    );

    /* ---------- ADD ASANA COMMENT (USER + BOT) ---------- */
    if (ticket.asanaTaskId) {
      const comment = from === "bot" ? `💬 Support Team Reply\n\n${text}\n\n— Advertise IQ` : `👤 User Message\n\nFrom: ${ticket.userName}\nEmail: ${ticket.userEmail}\n\n${text}`;

      await addAsanaComment({ taskId: ticket.asanaTaskId, comment });
      if (fileUrl) {
        await addAsanaComment({ taskId: ticket.asanaTaskId, comment: `📎 Screenshot attached:\n${fileUrl}` });
      }
    }

    if (from === "bot") {
      const payload = Buffer.from(JSON.stringify({ ticketId, email: ticket.userEmail })).toString("base64");
      const chatLink = `${process.env.FRONTEND_REDIRECT_URL}/support-chat?payload=${payload}`;

      sendEmailHelper(
        ticket.userEmail,
        "New Reply from Advertise IQ Support",
        buildSupportTicketEmail({
          userName: ticket.userName,
          ticketId,
          message: `${text}\n\n<b>— Support Team (Advertise IQ)</b>`,
          chatLink,
          fileUrl,
          type: "reply",
        })
      ).catch((err) => { write_logs({ message: "[sendSupportTicketMessage Silent Error] " + (err?.message || err), log_type: "error" }); });
    }

    return res.status(200).json({
      isSuccess: true,
      message: "Message sent successfully",
      data: savedMessage,
    });
  } catch (error) {
      write_logs({ message: `[sendSupportTicketMessage Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Unable to send message",
      error: "An internal server error occurred",
    });
  }
};

exports.getUserTickets = async (req, res) => {
  try {
    const userEmail = req?.user?.email;

    if (!userEmail) {
      return res.status(203).json({
        isSuccess: false,
        message: "User email is required",
      });
    }

    /* ---------- FETCH USER TICKETS ---------- */
    const tickets = await supportTicketSchema.find({ userEmail }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      isSuccess: true,
      tickets,
    });
  } catch (error) {
      write_logs({ message: `[getUserTickets Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).json({
      isSuccess: false,
      message: "Unable to fetch user tickets",
      error: "An internal server error occurred",
    });
  }
};

exports.fileUpload = async (req, res) => {
  try {
    const BASE_URL = `${process?.env?.BASE_URL}/public/supportTicket/`;
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

exports.send2faEmailOtp = async (req, res) => {
  try {
    const { tempToken } = req.body;
    if (!tempToken) {
      return res.status(400).json({ message: "Token is required", isSuccess: false });
    }

    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || "my_super_secret");
    if (!decoded.temp2fa) {
      return res.status(400).json({ message: "Invalid token", isSuccess: false });
    }

    const findEmail = await userSchema.findById(decoded.userId).lean();
    if (!findEmail || !findEmail.twoFactorEnabled) {
      return res.status(400).json({ message: "2FA is not enabled for this user", isSuccess: false });
    }

    const email = findEmail.email;
    const otp = generateOtp();

    await otpSchema.deleteMany({ email });
    await otpSchema.create({ email, otp, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });

    await sendEmailHelper(
      email,
      "Verify Your Login - OTP",
      buildOtpVerificationEmail({ userName: findEmail?.fullName, otp, expiresIn: "5 minutes" })
    ).catch((err) => { write_logs({ message: "[send2faEmailOtp Silent Error] " + (err?.message || err), log_type: "error" }); });

    return res.status(200).json({
      isSuccess: true,
      message: "OTP sent successfully to your email.",
    });
  } catch (error) {
      write_logs({ message: `[send2faEmailOtp Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(400).json({
      message: "An internal server error occurred",
      isSuccess: false,
    });
  }
};

exports.verify2faEmailOtp = async (req, res) => {
  try {
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) {
      return res.status(400).json({ message: "Token and OTP are required", isSuccess: false });
    }

    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || "my_super_secret");
    if (!decoded.temp2fa) {
      return res.status(400).json({ message: "Invalid token", isSuccess: false });
    }

    const findEmail = await userSchema.findById(decoded.userId).lean().populate("roleId", { roleName: 1 });
    if (!findEmail || !findEmail.twoFactorEnabled) {
      return res.status(400).json({ message: "2FA is not enabled for this user", isSuccess: false });
    }

    const otpRecord = await otpSchema.findOne({ email: findEmail.email, otp });
    if (!otpRecord) {
      return res.status(203).json({ message: "Invalid verification code", isSuccess: false });
    }

    if (new Date() > otpRecord.expiresAt) {
      await otpSchema.deleteOne({ _id: otpRecord._id });
      return res.status(203).json({ message: "OTP has expired", isSuccess: false });
    }

    await otpSchema.deleteOne({ _id: otpRecord._id });

    const { ip_address, location, timeZone } = decoded;
    const { authToken } = await generateAuthToken(findEmail._id, ip_address, location, timeZone);

    await userSchema.findByIdAndUpdate(findEmail._id, { twoFactorLastUsed: new Date() });

    await auditLogSchema.create({
      userId: findEmail._id,
      event: "USER_LOGIN",
      message: "User logged in successfully (2FA Email OTP)",
      ipAddress: ip_address || req?.ip,
      userAgent: req?.headers["user-agent"],
      metadata: { email: findEmail.email, location, timeZone, status: "SUCCESS", loginType: "2FA_EMAIL_OTP" },
    });

    const googleConnected = await googleconfigSchema.findOne({ userId: findEmail._id }).lean();

    return res.status(200).json({
      isSuccess: true,
      message: "Login successfully.",
      authToken,
      userId: findEmail._id,
      role: findEmail.roleId?.roleName || ROLES.SELLER,
      email: findEmail.email,
      fullName: findEmail.fullName || findEmail.name,
      isGoogleConnected: !!googleConnected,
    });
  } catch (error) {
      write_logs({ message: `[verify2faEmailOtp Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(400).json({
      isSuccess: false,
      message: "Something went wrong, please try again!",
    });
  }
};
