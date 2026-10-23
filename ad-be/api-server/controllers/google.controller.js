const moment = require("moment-timezone");
const { google } = require("googleapis");
const bcrypt = require("bcrypt");
const { Buffer } = require("buffer");

const googleconfigSchema = require("../models/googleconfig.model");
const cronJobSchema = require("../models/cronJob.model");
const profileSchema = require("../models/profiles.model");
const campaignsSchema = require("../models/campaign.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const targetingSchema = require("../models/targeting.model");
const googleSheetSchema = require("../models/googleSheet.model");
const userSchema = require("../models/user.model");
const roleSchema = require("../models/superAdmin/role.model");
const auditLogSchema = require("../models/auditLog.model");
const organizationSchema = require("../models/organization.model");

const { getGoogleConfig, getRuleDate, generatePassword, getActivePlanProfiles, generateAuthToken, safeJsonParse } = require("../helper/common");
const { sendEmailHelper } = require("../helper/emailHelper");
const { getOrderMatrix } = require("./order.controller");

const { updateBestPerformerGoogleSheet, updateTargetingAnalysisSheet } = require("../helper/excelFileUpdate");
const { buildWelcomeEmail } = require('../../emailTemplate/buildWelcomeEmail');

const { write_logs } = require("../../winston/google/logger");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const { ROLES } = require("../constants/roles");

exports.getSheetLink = async (req, res) => {
  try {
    const { _id: userId } = req?.user
    const { profileId } = req?.body
    const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];

    const profile = await profileSchema.findOne({ profileId: Number(profileId), ...(configId && { configId }) }).lean();

    const findSheet = await googleSheetSchema.findOne({
      userId,
      profileId,
      fileName: `${profile?.countryCode} | ${profile?.name} | Top Performer`,
      currentYear: moment().format("YYYY")
    }).lean()

    const findKeywordSheet = await googleSheetSchema.findOne({
      userId,
      profileId,
      fileName: `${profile?.countryCode} | ${profile?.name} | Keyword Analysis`,
      currentYear: moment().format("YYYY")
    }).lean()

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${findSheet?.googleSheetId}/edit`;
    const keywordSheetUrl = `https://docs.google.com/spreadsheets/d/${findKeywordSheet?.googleSheetId}/edit`;

    return res.status(200).json({ isSuccess: true, ...(findSheet && { url: sheetUrl }), ...(findKeywordSheet && { keywordUrl: keywordSheetUrl }) });
  } catch (err) {
      write_logs({ message: `[getSheetLink Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Google Login Error:", err);
    res.status(500).json({ success: false, message: "Google login failed" });
  }
}

exports.login = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
      state: JSON.stringify({ userId })
    });

    return res.json({ success: true, url });

  } catch (err) {
      write_logs({ message: `[login Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Google Login Error:", err);
    res.status(500).json({ success: false, message: "Google login failed" });
  }
};

exports.callBackGoogleAuth = async (req, res) => {
  try {
    write_logs({
      message: `callBackGoogleAuth: Req: ${JSON.stringify(req.query)}`,
      log_type: "info",
    });
    const code = req.query.code;
    const state = safeJsonParse(req.query?.state || "{}");
    let userId = state?.userId;

    if (!code) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    write_logs({
      message: `callBackGoogleAuth: Token: ${JSON.stringify(tokens)}`,
      log_type: "info",
    });

    if (!userId) {
      userId = await getUserFromIDToken(oauth2Client, tokens);
    }

    if (userId) {
      await googleconfigSchema.findOneAndUpdate(
        { userId },
        {
          userId,
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token,
          googleTokenExpire: tokens.refresh_token_expires_in,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET
        },
        { upsert: true }
      ).lean();
    }

    await auditLogSchema.create({
      userId,
      event: "GOOGLE_USER_LOGIN",
      message: "User logged in with Google successfully",
      ipAddress: req?.ip,
      userAgent: req?.headers["user-agent"],
      metadata: { status: "SUCCESS", loginType: "GOOGLE", googleEmail: tokens?.id_token ? "AVAILABLE" : "NOT_AVAILABLE" },
    });

    write_logs({
      message: `callBackGoogleAuth: User Id: ${userId}`,
      log_type: "info",
    });

    if (state?.userId) {
      write_logs({
        message: `callBackGoogleAuth: Redirect to google success.`,
        log_type: "info",
      });

      return res.redirect(`${process.env.FRONTEND_REDIRECT_URL}?google=success`);
    }
    else {
      const findEmail = await userSchema.findOne({ _id: userId }).lean().populate("roleId", { roleName: 1 });
      if (!findEmail) {

        write_logs({
          message: `callBackGoogleAuth: User not exist, User Id: ${userId}`,
          log_type: "info",
        });

        return res.redirect(`${process.env.FRONTEND_REDIRECT_URL}/login`);
      }

      const googleConnected = await googleconfigSchema.findOne({ userId: findEmail._id }).lean();

      const data = {
        role: findEmail.roleId.roleName,
        userId: findEmail._id,
        isGoogleConnected: googleConnected ? true : false
      }

      write_logs({
        message: `callBackGoogleAuth: data: ${JSON.stringify(data)}`,
        log_type: "info",
      });

      const encodedData = Buffer.from(JSON.stringify(data)).toString("base64");

      write_logs({
        message: `callBackGoogleAuth: payload: ${encodedData}`,
        log_type: "info",
      });

      return res.redirect(`${process.env.FRONTEND_REDIRECT_URL}/login?payload=${encodedData}`);
    }
  } catch (err) {
      write_logs({ message: `[callBackGoogleAuth Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Google Callback Error:", err);
    return res.redirect(`${process.env.FRONTEND_REDIRECT_URL}?google=failed`);
  }
};

exports.generateToken = async (req, res) => {
  const { userId, ip_address, location, timeZone } = req.body;
  try {

    write_logs({
      message: `generateToken: User Id: ${userId}`,
      log_type: "info",
    });

    const { authToken } = await generateAuthToken(userId, ip_address, location, timeZone);

    write_logs({
      message: `generateToken: User Id: ${userId}, Token generated.`,
      log_type: "info",
    });

    return res.status(200).json({
      isSuccess: true,
      authToken,
    });
  } catch (error) {
      write_logs({ message: `[generateToken Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    res.status(500).json({
      isSuccess: false,
      message: "Google login failed"
    });
  }
}

const getUserFromIDToken = async (oauth2Client, tokens) => {
  const ticket = await oauth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  let userId;
  const userInfo = ticket.getPayload();
  if (userInfo) {

    const role = await roleSchema.findOne({ roleName: ROLES.ADMIN }).lean();
    const user = await userSchema.findOne({ email: userInfo.email }).lean();
    if (user) {
      await userSchema.findOneAndUpdate(
        { _id: user._id },
        {
          $set: {
            isActive: true
          }
        },
        { upsert: true }
      ).lean();
      userId = user._id;
    }
    else {
      const password = generatePassword();
      const encryptedPassword = await bcrypt.hash(password, 10);
      const user = await userSchema.create({
        email: userInfo.email,
        fullName: userInfo.name,
        roleId: role?._id,
        password: encryptedPassword,
        isVerify: true,
      });
      userId = user._id;

      sendEmailHelper(
        user.email,
        "Welcome",
        buildWelcomeEmail({
          userName: user.fullName,
          userId: user.email,
          password: password,
        })
      ).catch((err) => { write_logs({ message: "[getUserFromIDToken Silent Error] " + (err?.message || err), log_type: "error" }); });

      await organizationSchema.create({
        organizationName: `${userInfo.name || "User"}'s Organization`,
        userId: user._id,
        planId: null,
        startDate: null,
        endDate: null,
        isTrialActive: false,
      });
    }
  }
  return userId;
}

exports.disconnectGoogleAccount = async (req, res) => {
  const userId = req.user._id;
  try {

    await googleconfigSchema.deleteOne({ userId });

    return res.json({
      success: true
    });
  } catch (error) {
      write_logs({ message: `[disconnectGoogleAccount Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    res.status(500).json({
      success: false,
      message: "Google login failed"
    });
  }
}

exports.cronBestPerformerGoogleReportGenerate = async (req, res) => {
  try {
    cron_logs({
      message: `India Time = ${moment()
        .tz("Asia/Kolkata")
        .format("HH:mm")} cronBestPerformerGoogleReportGenerate`,
      log_type: "info",
    });
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Best Performer Report",
      isActive: false,
    }).lean();
    if (getCronStatus) {
      return cron_logs({
        message: `Your Best Performer Report cron status is deactive.`,
        log_type: "info",
      });
    }

    const { profileId } = req?.body ?? {}
    const getProfileId = await getActivePlanProfiles(profileId, "ads");

    for (const profile of getProfileId) {
      const checkGoogleConfig = await getGoogleConfig(profile?.profileId);
      if (checkGoogleConfig?.length) {

        const currentDate = moment().tz(profile.timezone).format("YYYY-MM-DD")
        let { fromDate, toDate } = getRuleDate(profile.timezone, "LAST_7_DAYS_1");
        const sheetYear = moment(toDate).tz(profile.timezone).format("YYYY");

        let getCronData = await cronJobHistorySchema.findOne({
          configId: profile.configId,
          profileId: profile.profileId,
          cronName: "Best Performer Report",
          historyDate: currentDate
        }).lean();
        if (!getCronData) {
          let createCronHistory = new cronJobHistorySchema({
            configId: profile.configId,
            profileId: profile.profileId,
            cronName: "Best Performer Report",
            status: "PENDING",
            historyDate: currentDate,
          });
          await createCronHistory.save();
          getCronData = createCronHistory;
        }

        const orders = await getOrderMatrix(fromDate, toDate, profile.profileId, profile.timezone);
        const pipeline = [
          {
            $match: {
              configId: profile.configId,
              profileId: profile.profileId,
              reportDate: { $gte: fromDate, $lte: toDate },
              // status: { $nin: ["PAUSED", "ARCHIVED"] }
            },
          },
          {
            $group: {
              _id: "$reportDate",
              totalSpend: { $sum: "$spend" },
              totalSales: { $sum: "$sales" },
              totalOrders: { $sum: "$orders" },
              campaigns: { $push: "$$ROOT" }
            }
          },
          {
            $project: {
              _id: 0,
              reportDate: "$_id",
              campaignId: "$_id.campaignId",
              campaigns: 1,
              totalSpend: { $round: ["$totalSpend", 2] },
              totalSales: { $round: ["$totalSales", 2] },
              totalOrders: 1
            }
          },
          {
            $addFields: {
              bestCampaign: {
                $let: {
                  vars: {
                    best: {
                      $first: {
                        $sortArray: {
                          input: {
                            $filter: {
                              input: "$campaigns",
                              as: "c",
                              cond: { $gt: ["$$c.acos", 0] }
                            }
                          },
                          sortBy: { acos: 1 }
                        }
                      }
                    }
                  },
                  in: {
                    campaignId: "$$best.campaignId",
                    name: "$$best.name",
                    clicks: "$$best.clicks",
                    orders: "$$best.orders"
                  }
                }
              }
            }
          },
          {
            $lookup: {
              from: "placements",
              let: {
                campaignId: "$bestCampaign.campaignId",
                reportDate: "$reportDate"
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$campaignId", "$$campaignId"] },
                        { $eq: ["$reportDate", "$$reportDate"] },
                        { $eq: ["$configId", profile.configId] },
                        { $eq: ["$profileId", profile.profileId] },
                      ],
                    },
                  },
                },
                { $sort: { placement: -1 } },
                {
                  $project: {
                    _id: 0,
                    placement: 1,
                    placementModifier: 1
                  }
                },
                {
                  $group: {
                    _id: null,
                    placementList: { $push: "$$ROOT" }
                  }
                }
              ],
              as: "placementData"
            }
          },
          {
            $lookup: {
              from: "targetings",
              let: {
                campaignId: "$bestCampaign.campaignId",
                reportDate: "$reportDate"
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$campaignId", "$$campaignId"] },
                        { $eq: ["$reportDate", "$$reportDate"] },
                        { $eq: ["$configId", profile.configId] },
                        { $eq: ["$profileId", profile.profileId] },
                      ],
                    },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    targeting: 1,
                    keywordType: 1,
                    keywordBid: 1
                  }
                },
                {
                  $group: {
                    _id: null,
                    targetingList: { $push: "$$ROOT" }
                  }
                }
              ],
              as: "targetingData"
            }
          },
          {
            $addFields: {
              "bestCampaign.placement": {
                $arrayElemAt: ["$placementData.placementList", 0]
              },
              "bestCampaign.targeting": {
                $arrayElemAt: ["$targetingData.targetingList", 0]
              }
            }
          },
          {
            $project: {
              campaigns: 0,
              placementData: 0,
              targetingData: 0
            }
          },
          {
            $sort: { reportDate: 1 }
          }
        ]

        const getCampaignDetails = await campaignsSchema.aggregate(pipeline);

        cron_logs({
          message: `Start: Excel Report Generate for Profile ID: ${profile?.profileId}`,
          log_type: "info",
        });
        if (getCampaignDetails.length > 0) {
          for (const googleConfig of checkGoogleConfig) {
            try {
              await updateBestPerformerGoogleSheet(googleConfig, sheetYear, profile, "Top Performer", getCampaignDetails, orders);
              cron_logs({
                message: `Excel Report Generate successfully for Profile ID: ${profile?.profileId} and Google Config ID: ${googleConfig?._id}`,
                log_type: "info",
              });
            } catch (error) {
              cron_logs({
                message: `Excel Report Generate err for Profile ID: ${profile?.profileId} and Google Config ID: ${googleConfig?._id} , Err: ${error}`,
                log_type: "error",
              });
            }
          }
        }
        cron_logs({
          message: `End: Excel Report Generate for Profile ID: ${profile?.profileId}`,
          log_type: "info",
        });

        if (getCronData?._id) {
          await cronJobHistorySchema.findByIdAndUpdate(
            getCronData._id,
            { status: "COMPLETED" },
            { new: true }
          );
        }
      }
    }

    return cron_logs({
      message: "Excel Report Generate successfully.",
      log_type: "info",
    });
  } catch (error) {
    return cron_logs({
      message: `Excel Report Generate err: ${error}`,
      log_type: "error",
    });
  }
};

exports.cronKeywordAnalysisReportGenerate = async (req, res) => {
  try {
    cron_logs({
      message: `India Time = ${moment()
        .tz("Asia/Kolkata")
        .format("HH:mm")} cronKeywordAnalysisReportGenerate`,
      log_type: "info",
    });
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Keyword Analysis Report",
      isActive: false,
    }).lean();
    if (getCronStatus) {
      return cron_logs({
        message: `Your Keyword Analysis Report cron status is deactive.`,
        log_type: "info",
      });
    }

    const { profileId } = req?.body ?? {};
    const getProfileId = await getActivePlanProfiles(profileId, "ads");

    for (const profile of getProfileId) {
      const checkGoogleConfig = await getGoogleConfig(profile?.profileId);
      if (checkGoogleConfig) {

        let { fromDate, toDate } = getRuleDate(profile.timezone, "LAST_60_DAYS");
        const sheetYear = moment(toDate).tz(profile.timezone).format("YYYY");

        let getCronData = await cronJobHistorySchema.findOne({
          configId: profile.configId,
          profileId: profile.profileId,
          cronName: "Keyword Analysis Report",
          historyDate: toDate
        }).lean();
        if (!getCronData) {
          let createCronHistory = new cronJobHistorySchema({
            configId: profile.configId,
            profileId: profile.profileId,
            cronName: "Keyword Analysis Report",
            status: "PENDING",
            historyDate: toDate,
          });
          await createCronHistory.save();
          getCronData = createCronHistory;
        }

        const pipeline = [
          {
            $match: {
              configId: profile.configId,
              profileId: profile.profileId,
              reportDate: { $gte: fromDate, $lte: toDate },
              keywordType: {
                $nin: ["TARGETING_EXPRESSION_PREDEFINED", "TARGETING_EXPRESSION"]
              }
            },
          },
          {
            $lookup: {
              from: "campaigns",
              let: {
                cId: "$campaignId",
                pId: "$profileId"
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: ["$campaignId", "$$cId"]
                        },
                        {
                          $eq: ["$profileId", "$$pId"]
                        },
                        {
                          $eq: [
                            "$reportDate",
                            toDate
                          ]
                        },
                        // {
                        //   $not: {
                        //     $in: ["$status", ["PAUSED", "ARCHIVED"]]
                        //   }
                        // }
                      ]
                    }
                  }
                },
                {
                  $project: {
                    _id: 0,
                    campaignId: 1
                  }
                }
              ],
              as: "activeCampaign"
            }
          },
          {
            $match: {
              activeCampaign: {
                $ne: []
              }
            }
          },
          {
            $addFields: {
              enabledTodayFlag: {
                $cond: [
                  {
                    $and: [
                      {
                        $eq: ["$reportDate", toDate]
                      },
                      {
                        $eq: ["$status", "ENABLED"]
                      }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          },
          {
            $group: {
              _id: {
                campaignId: "$campaignId",
                adGroupId: "$adGroupId",
                targeting: "$targeting",
                keywordType: "$keywordType"
              },
              impressions: { $sum: "$impressions" },
              clicks: { $sum: "$clicks" },
              spend: { $sum: "$spend" },
              sales: { $sum: "$sales" },
              orders: { $sum: "$orders" },
              targeting: { $last: "$targeting" },
              keywordType: { $last: "$keywordType" },
              isEnabledToday: { $max: "$enabledTodayFlag" }
            }
          },
          { $match: { isEnabledToday: 1 } },
          {
            $group: {
              _id: {
                targeting: "$targeting",
                keywordType: "$keywordType"
              },
              impressions: {
                $sum: "$impressions"
              },
              clicks: {
                $sum: "$clicks"
              },
              spend: {
                $sum: "$spend"
              },
              sales: {
                $sum: "$sales"
              },
              orders: {
                $sum: "$orders"
              },
              count: {
                $sum: 1
              }
            }
          },
          {
            $project: {
              _id: 0,
              targeting: "$_id.targeting",
              keywordType: "$_id.keywordType",
              impressions: 1,
              clicks: 1,
              spend: { $round: ["$spend", 2] },
              sales: 1,
              orders: 1,
              count: 1
            }
          },
          {
            $group: {
              _id: "$targeting",
              keywordTypeCounts: {
                $push: {
                  k: "$keywordType",
                  v: "$count"
                }
              },
              impressions: {
                $sum: "$impressions"
              },
              clicks: {
                $sum: "$clicks"
              },
              spend: {
                $sum: "$spend"
              },
              sales: {
                $sum: "$sales"
              },
              orders: {
                $sum: "$orders"
              }
            }
          },
          {
            $addFields: {
              keywordTypeCounts: {
                $arrayToObject: "$keywordTypeCounts"
              }
            }
          },
          {
            $replaceRoot: {
              newRoot: {
                $mergeObjects: [
                  { targeting: "$_id" },
                  "$keywordTypeCounts",
                  { impressions: "$impressions" },
                  { clicks: "$clicks" },
                  { spend: { $round: ["$spend", 2] } },
                  { sales: "$sales" },
                  { orders: "$orders" },
                ]
              }
            }
          },
          {
            $addFields: {
              cpc: {
                $round: [
                  {
                    $cond: [
                      { $gt: ["$clicks", 0] },
                      { $divide: ["$spend", "$clicks"] },
                      0
                    ]
                  },
                  2
                ]
              },
              ctr: {
                $round: [
                  {
                    $cond: [
                      { $gt: ["$impressions", 0] },
                      {
                        $multiply: [
                          { $divide: ["$clicks", "$impressions"] },
                          100
                        ]
                      },
                      0
                    ]
                  },
                  2
                ]
              },
              cvr: {
                $round: [
                  {
                    $cond: [
                      { $gt: ["$clicks", 0] },
                      {
                        $multiply: [
                          { $divide: ["$orders", "$clicks"] },
                          100
                        ]
                      },
                      0
                    ]
                  },
                  2
                ]
              },
              acos: {
                $round: [
                  {
                    $cond: [
                      { $gt: ["$sales", 0] },
                      {
                        $multiply: [
                          { $divide: ["$spend", "$sales"] },
                          100
                        ]
                      },
                      0
                    ]
                  },
                  2
                ]
              },
              roas: {
                $round: [
                  {
                    $cond: [
                      { $gt: ["$spend", 0] },
                      { $divide: ["$sales", "$spend"] },
                      0
                    ]
                  },
                  2
                ]
              }
            }
          },
          {
            $sort: {
              targeting: 1
            }
          },
        ]

        const targetingData = await targetingSchema.aggregate(pipeline);

        cron_logs({
          message: `Start: Excel Report Generate for Profile ID: ${profile?.profileId}`,
          log_type: "info",
        });

        for (const googleConfig of checkGoogleConfig) {
          try {
            await updateTargetingAnalysisSheet(googleConfig, sheetYear, profile, "Keyword Analysis", targetingData);
            cron_logs({
              message: `Excel Report Generate successfully for Profile ID: ${profile?.profileId} and Google Config ID: ${googleConfig?._id}`,
              log_type: "info",
            });
          } catch (error) {
            cron_logs({
              message: `Excel Report Generate err for Profile ID: ${profile?.profileId} and Google Config ID: ${googleConfig?._id} , Err: ${error}`,
              log_type: "error",
            });
          }
        }

        cron_logs({
          message: `End: Excel Report Generate for Profile ID: ${profile?.profileId}`,
          log_type: "info",
        });

        if (getCronData?._id) {
          await cronJobHistorySchema.findByIdAndUpdate(
            getCronData._id,
            { status: "COMPLETED" },
            { new: true }
          );
        }
      }
    }

    return cron_logs({
      message: "Keyword Analysis Report Generate successfully.",
      log_type: "info",
    });
  } catch (error) {
    return cron_logs({
      message: `Keyword Analysis Report Generate err: ${error}`,
      log_type: "error",
    });
  }
};

exports.loginWithGoogle = async (req, res) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const scopes = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.file",
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes
    });

    return res.json({ success: true, url });

  } catch (err) {
      write_logs({ message: `[loginWithGoogle Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Google Login Error:", err);
    res.status(500).json({ success: false, message: "Google login failed" });
  }
};
