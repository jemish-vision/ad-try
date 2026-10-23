const moment = require("moment-timezone");
const { retryWithBackoff } = require("../helper/retryHelper");

const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));

const holidaySchema = require("../models/holidays.model");
const specialDaySchema = require("../models/specialDays.model");
const specialDayReminderSchema = require("../models/specialDayReminders.model");
const googleconfigSchema = require("../models/googleconfig.model");
const adNotificationSchema = require("../models/adNotification.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const budgetRuleSchema = require("../models/budgetRules.model");
const targetingRuleSchema = require("../models/targetingRuleSchema.model");
const placementRuleSchema = require("../models/placementRules.model");
const campaignsSchema = require("../models/campaign.model");
const holidayActionHistorySchema = require("../models/holidayActionHistory.model");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { holiday_logs } = require("../../winston/holiday/logger");
const { holidayReminderEmail } = require("../../emailTemplate/holidayReminderEmail");
const { specialDayReminderEmail } = require("../../emailTemplate/specialDayReminderEmail");

const { sendNotificationToUser } = require("../helper/sendNotification");
const { sendEmailHelper } = require("../helper/emailHelper");
const { getActivePlanProfiles, getAccessToken } = require("../helper/common");

const amazonAxios = require("../helper/amazonAxios");
const { ROLES } = require("../constants/roles");

exports.getAllHolidays = async (req, res) => {
    try {
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const { profileId } = req.body;
        const role = req?.role?.roleName;

        let holidays = [];

        if (role === ROLES.SUPER_ADMIN) {
            holidays = await specialDaySchema.find({ createdBy: req.userId }).sort({ startDate: 1 }).lean();
            holidays = holidays.map(h => ({ ...h, isOwnerEvent: false }));
        } else {
            holidays = await specialDaySchema.aggregate([
                {
                    $lookup: {
                        from: "specialdayreminders",
                        let: { specialDayId: "$_id" },
                        pipeline: [
                            { $match: { $expr: { $and: [{ $eq: ["$specialDayId", "$$specialDayId"] }, { $eq: ["$configId", configId] }, { $eq: ["$profileId", profileId] }] } } },
                            { $project: { reminderDates: 1, _id: 0 } },
                        ],
                        as: "reminderData",
                    },
                },
                {
                    $addFields: {
                        reminderDates: { $ifNull: [{ $arrayElemAt: ["$reminderData.reminderDates", 0] }, []] },
                        isOwnerEvent: true,
                    },
                },
                { $project: { reminderData: 0 } },
                { $sort: { startDate: 1 } },
            ]);
        }

        if (role !== ROLES.SUPER_ADMIN) {
            if (!profileId) {
                return res.status(400).json({ isSuccess: false, message: "profileId is required" });
            }

            const profileHolidays = await holidaySchema.find({ ...(configId && { configId }), profileId }).sort({ startDate: 1 }).lean();
            holidays = [...holidays, ...profileHolidays];
        }

        return res.status(200).json({
            isSuccess: true,
            data: holidays,
        });

    } catch (error) {
        holiday_logs({
            message: `[getAllHolidays Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "Failed to fetch holidays",
            error: "An internal server error occurred",
        });
    }
};

exports.createHolidays = async (req, res) => {
    try {
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const role = req?.role?.roleName;
        const { profileId } = req.body;
        const { title, start, end, color, reminders, protection } = req.body;

        if (!title || !start) {
            return res.status(203).json({ isSuccess: false, message: "Title and start date are required" });
        }

        if (role === ROLES.SUPER_ADMIN) {
            const payload = {
                name: title,
                color,
                startDate: start,
                endDate: end || null,
                reminderDates: reminders || [],
            };

            const holiday = await specialDaySchema.create(payload);

            return res.status(200).json({
                isSuccess: true,
                message: "Owner special day created",
                data: holiday,
            });
        }

        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "profileId is required" });
        }

        const payload = {
            configId,
            profileId,
            name: title,
            color,
            startDate: start,
            endDate: end || null,
            reminderDates: reminders || [],
            protectionEnable: protection?.enabled || false,
            protectionAction: protection?.mode || null,
            reduceBidPercent: protection?.reduceBidPercent || null,
        };

        const holiday = await holidaySchema.create(payload);

        return res.status(200).json({
            isSuccess: true,
            message: "Holiday created successfully",
            data: holiday,
        });

    } catch (error) {
        holiday_logs({
            message: `[createHolidays Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(203).json({
            isSuccess: false,
            message: "Failed to create holiday",
            error: "An internal server error occurred",
        });
    }
};

exports.updateHolidays = async (req, res) => {
    try {
        const { id, profileId } = req.body;
        const role = req?.role?.roleName;

        if (!id) {
            return res.status(203).json({ isSuccess: false, message: "Holiday id are required" });
        }

        const { title, start, end, color, reminders, protection } = req.body;

        if (role === ROLES.SUPER_ADMIN) {
            const updatePayload = {
                name: title,
                color,
                startDate: start,
                endDate: end || null,
                reminderDates: reminders || [],
            };

            const updated = await specialDaySchema.findOneAndUpdate({ _id: id }, updatePayload, { new: true }).lean();
            if (!updated) {
                return res.status(203).json({ isSuccess: false, message: "Special day not found" });
            }

            return res.status(200).json({
                isSuccess: true,
                message: "Special day updated",
                data: updated,
            });
        }

        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile id are required" });
        }

        const updatePayload = {
            name: title,
            color,
            startDate: start,
            endDate: end || null,
            reminderDates: reminders || [],
            protectionEnable: protection?.enabled || false,
            protectionAction: protection?.mode || null,
            reduceBidPercent: protection?.reduceBidPercent || null,
        };

        const updatedHoliday = await holidaySchema.findOneAndUpdate({ _id: id, profileId }, updatePayload, { new: true }).lean();
        if (!updatedHoliday) {
            return res.status(203).json({
                isSuccess: false,
                message: "Holiday not found",
            });
        }

        return res.status(200).json({
            isSuccess: true,
            message: "Holiday updated successfully.",
            data: updatedHoliday,
        });

    } catch (error) {
        holiday_logs({
            message: `[updateHolidays Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(203).json({
            isSuccess: false,
            message: "Failed to update holiday",
            error: "An internal server error occurred",
        });
    }
};

exports.deleteHolidays = async (req, res) => {
    try {
        const { id, profileId } = req.body;
        const role = req?.role?.roleName;

        if (!id) {
            return res.status(203).json({ isSuccess: false, message: "Holiday id are required" });
        }

        if (role === ROLES.SUPER_ADMIN) {
            const deleted = await specialDaySchema.findOneAndDelete({ _id: id }).lean();
            if (!deleted) {
                return res.status(203).json({ isSuccess: false, message: "Special day not found" });
            }

            return res.status(200).json({
                isSuccess: true,
                message: "Special day deleted",
            });
        }

        if (!profileId) {
            return res.status(203).json({ isSuccess: false, message: "Profile id are required" });
        }

        const deleted = await holidaySchema.findOneAndDelete({ _id: id, profileId }).lean();
        if (!deleted) {
            return res.status(203).json({ isSuccess: false, message: "Holiday not found" });
        }

        return res.status(200).json({
            isSuccess: true,
            message: "Holiday deleted successfully",
        });

    } catch (error) {
        holiday_logs({
            message: `[deleteHolidays Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(203).json({
            isSuccess: false,
            message: "Failed to delete holiday",
            error: "An internal server error occurred",
        });
    }
};

exports.saveSpecialDaysReminder = async (req, res) => {
    try {
        const configId = req.body.configId || req.query.configId || req?.config?.configId || req?.headers?.["x-config-id"];
        const { profileId, specialDayId, reminders: reminderDates = [] } = req.body;

        if (!specialDayId || !profileId) {
            return res.status(203).json({ isSuccess: false, message: "Special day id and Profile id are required" });
        }

        await specialDayReminderSchema.findOneAndUpdate(
            { configId, profileId, specialDayId },
            { $set: { reminderDates } },
            { upsert: true, new: true }
        ).lean();

        return res.status(200).json({
            isSuccess: true,
            message: "Reminder updated successfully.",
        });

    } catch (error) {
        holiday_logs({
            message: `[saveSpecialDaysReminder Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(203).json({
            isSuccess: false,
            message: "Failed to update reminder",
            error: "An internal server error occurred",
        });
    }
}

exports.cronHolidayReminder = async () => {
    cron_logs({
        message: `cronHolidayReminder`,
        log_type: "info",
    });

    try {


        const profiles = await getActivePlanProfiles();
        await Promise.all(
            profiles.map((profile) =>

                limit(async () => {

                    const today = moment().tz(profile.timezone).startOf("day").toDate();
                    const currentDate = moment().tz(profile.timezone).format("YYYY-MM-DD");

                    const pipeline = [
                        {
                            $match: {
                                configId: profile.configId,
                                profileId: profile.profileId
                            }
                        },
                        {
                            $addFields: {
                                start: {
                                    $dateFromString: {
                                        dateString: "$startDate",
                                    },
                                },
                                today: today,
                            },
                        },
                        {
                            $addFields: {
                                diffDays: {
                                    $dateDiff: {
                                        startDate: "$today",
                                        endDate: "$start",
                                        unit: "day",
                                    },
                                },
                            },
                        },
                        {
                            $match: {
                                $expr: {
                                    $in: ["$diffDays", "$reminderDates"]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "profilebasedpermissions",
                                localField: "profileId",
                                foreignField: "profileId",
                                as: "useraccess"
                            }
                        },
                        {
                            $unwind: "$useraccess"
                        },
                        {
                            $lookup: {
                                from: "users",
                                localField: "useraccess.userId",
                                foreignField: "_id",
                                as: "user"
                            }
                        },
                        {
                            $unwind: "$user"
                        },
                        {
                            $lookup: {
                                from: "roles",
                                localField: "user.roleId",
                                foreignField: "_id",
                                as: "role"
                            }
                        },
                        {
                            $unwind: "$role"
                        },
                        {
                            $match: {
                                "user.isActive": true,
                                "role.roleName": ROLES.ADMIN,
                                "useraccess.hasAccess": true
                            }
                        }
                    ];

                    const notificationList = [];
                    const holidays = await holidaySchema.aggregate(pipeline);
                    if (holidays.length > 0) {

                        await Promise.all(
                            holidays.map(async (h) => {

                                const googleConnected = await googleconfigSchema.findOne({ userId: h.user._id }).lean();

                                const data = {
                                    role: h.role.roleName,
                                    userId: h.user._id,
                                    isGoogleConnected: googleConnected ? true : false,
                                    routes: "/holiday"
                                }

                                const encodedData = Buffer.from(JSON.stringify(data)).toString("base64");

                                await sendEmailHelper(
                                    h.user.email,
                                    `Holiday Reminder!!!`,
                                    holidayReminderEmail({
                                        userName: h.user.fullName,
                                        holidayName: h.name,
                                        startDate: h.startDate,
                                        daysLeft: h.diffDays,
                                        protectionAction: h.protectionAction,
                                        reduceBidPercent: h.reduceBidPercent,
                                        dashboardUrl: `${process.env.FRONTEND_REDIRECT_URL}/login?payload=${encodedData}`,
                                    })
                                );

                                notificationList.push({
                                    profileId: h.profileId,
                                    configId: h.configId,
                                    notificationTitle: `Holiday Period Coming`,
                                    notificationText: `Your holiday starts on ${h.startDate}.<br> Check budgets, stock, and rules before leaving.`,
                                });

                                const notificationTitle = `Holiday Period Coming`;
                                const notificationMessage = `Your holiday starts on ${h.startDate}. Check budgets, stock, and rules before leaving.`;
                                await sendNotificationToUser(h.profileId, notificationTitle, notificationMessage)

                                return;
                            })
                        )

                        await adNotificationSchema.insertMany(notificationList);
                    }

                    await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Holiday Reminder",
                            historyDate: currentDate
                        },
                        { $set: { status: "COMPLETED" } },
                        { new: true, upsert: true }
                    ).lean()

                    return;
                })
            )
        )

        cron_logs({
            message: "Holiday Reminder email sent successfully.",
            log_type: "info",
        });

    } catch (error) {
        cron_logs({
            message: `Holiday Reminder email error: ${error}`,
            log_type: "error",
        });
    }
}

exports.cronSpecialDayReminder = async () => {
    cron_logs({
        message: `cronSpecialDayReminder`,
        log_type: "info",
    });

    try {

        const profiles = await getActivePlanProfiles();
        await Promise.all(
            profiles.map((profile) =>

                limit(async () => {

                    const today = moment().tz(profile.timezone).startOf("day").toDate();
                    const currentDate = moment().tz(profile.timezone).format("YYYY-MM-DD");

                    const pipeline = [
                        {
                            $addFields: {
                                start: {
                                    $dateFromString: {
                                        dateString: "$startDate"
                                    }
                                },
                                // today: {
                                //     $dateFromString: {
                                //         dateString: "2026-02-06T18:30:00.000Z"
                                //     }
                                // }
                            }
                        },
                        {
                            $addFields: {
                                diffDays: {
                                    $dateDiff: {
                                        startDate: today,
                                        endDate: "$start",
                                        unit: "day"
                                    }
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "specialdayreminders",
                                let: {
                                    sId: "$_id",
                                    pId: profile.profileId
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    {
                                                        $eq: ["$specialDayId", "$$sId"]
                                                    },
                                                    {
                                                        $eq: ["$profileId", "$$pId"]
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ],
                                as: "reminders"
                            }
                        },
                        {
                            $unwind: "$reminders"
                        },
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        {
                                            $in: [
                                                "$diffDays",
                                                "$reminders.reminderDates"
                                            ]
                                        },
                                        { $eq: ["$diffDays", 7] }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "profilebasedpermissions",
                                localField: "reminders.profileId",
                                foreignField: "profileId",
                                as: "useraccess"
                            }
                        },
                        {
                            $unwind: "$useraccess"
                        },
                        {
                            $lookup: {
                                from: "users",
                                localField: "useraccess.userId",
                                foreignField: "_id",
                                as: "user"
                            }
                        },
                        {
                            $unwind: "$user"
                        },
                        {
                            $lookup: {
                                from: "roles",
                                localField: "user.roleId",
                                foreignField: "_id",
                                as: "role"
                            }
                        },
                        {
                            $unwind: "$role"
                        },
                        {
                            $match: {
                                "user.isActive": true,
                                "role.roleName": ROLES.ADMIN,
                                "useraccess.hasAccess": true
                            }
                        }
                    ];

                    const specialDayReminders = await specialDaySchema.aggregate(pipeline);
                    if (specialDayReminders.length > 0) {

                        await Promise.all(
                            specialDayReminders.map(async (h) => {

                                const googleConnected = await googleconfigSchema.findOne({ userId: h.user._id }).lean();

                                const data = {
                                    role: h.role.roleName,
                                    userId: h.user._id,
                                    isGoogleConnected: googleConnected ? true : false,
                                    routes: "/holiday"
                                }

                                const encodedData = Buffer.from(JSON.stringify(data)).toString("base64");

                                await sendEmailHelper(
                                    h.user.email,
                                    `Reminder: ${h.name} is coming up on ${h.startDate}`,
                                    specialDayReminderEmail({
                                        userName: h.user.fullName,
                                        specialDayName: h.name,
                                        startDate: h.startDate,
                                        daysLeft: h.diffDays,
                                        dashboardUrl: `${process.env.FRONTEND_REDIRECT_URL}/login?payload=${encodedData}`,
                                    })
                                );

                                return;
                            })
                        )
                    }

                    await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Special Day Reminder",
                            historyDate: currentDate
                        },
                        { $set: { status: "COMPLETED" } },
                        { new: true, upsert: true }
                    ).lean()

                    return
                })
            )
        )

        cron_logs({
            message: "Special Day Reminder email sent successfully.",
            log_type: "info",
        });

    } catch (error) {
        cron_logs({
            message: `Special Day Reminder email error: ${error}`,
            log_type: "error",
        });
    }
}

exports.cronApplyHolidayProtection = async () => {
    cron_logs({
        message: `cronApplyHolidayProtection`,
        log_type: "info",
    });

    try {

        const profiles = await getActivePlanProfiles();
        await Promise.all(
            profiles.map((profile) =>

                limit(async () => {

                    const currentDate = moment().tz(profile.timezone).format("YYYY-MM-DD");
                    const pipeline = [
                        {
                            $match: {
                                configId: profile.configId,
                                profileId: profile.profileId,
                                $or: [
                                    { startDate: currentDate },
                                    { endDate: currentDate }
                                ],
                                protectionEnable: true,
                                protectionAction: { $ne: null }
                            }
                        }
                    ];

                    const holidays = await holidaySchema.aggregate(pipeline);
                    if (holidays.length > 0) {

                        await Promise.all(
                            holidays.map(async (h) => {

                                const checkConfigAds = await getAccessToken(h.configId);
                                if (h.startDate == currentDate) {

                                    if (h.protectionAction == "PAUSE_RULES") {
                                        const budgetRules = await budgetRuleSchema.find({
                                            configId: h.configId,
                                            profileId: h.profileId,
                                            isActive: true
                                        }).lean();

                                        const targetingRules = await targetingRuleSchema.find({
                                            configId: h.configId,
                                            profileId: h.profileId,
                                            isActive: true
                                        }).lean();

                                        const placementBidRules = await placementRuleSchema.find({
                                            configId: h.configId,
                                            profileId: h.profileId,
                                            isActive: true
                                        }).lean();

                                        await Promise.all([
                                            await budgetRuleSchema.updateMany(
                                                { _id: { $in: budgetRules.map(r => r._id) } },
                                                { $set: { isActive: false, pausedBy: "HOLIDAY_PROTECTION" } }
                                            ),

                                            await targetingRuleSchema.updateMany(
                                                { _id: { $in: targetingRules.map(r => r._id) } },
                                                { $set: { isActive: false, pausedBy: "HOLIDAY_PROTECTION" } }
                                            ),

                                            await placementRuleSchema.updateMany(
                                                { _id: { $in: placementBidRules.map(r => r._id) } },
                                                { $set: { isActive: false, pausedBy: "HOLIDAY_PROTECTION" } }
                                            )
                                        ]);

                                        await holidayActionHistorySchema.findOneAndUpdate(
                                            {
                                                configId: h.configId,
                                                profileId: h.profileId,
                                                holidayId: h._id
                                            },
                                            {
                                                $set: {
                                                    startDate: h.startDate,
                                                    endDate: h.endDate,
                                                    protectionAction: h.protectionAction,
                                                    pauseRuleAction: {
                                                        budgetRules: budgetRules.map(r => r._id),
                                                        targetingRules: targetingRules.map(r => r._id),
                                                        placementRules: placementBidRules.map(r => r._id)
                                                    },
                                                    executionState: "APPLIED"
                                                }
                                            },
                                            { new: true, upsert: true }
                                        ).lean()
                                    }
                                    else if (h.protectionAction == "PAUSE_CAMPAIGNS") {
                                        const enableCampaigns = await campaignsSchema.find({
                                            configId: h.configId,
                                            profileId: h.profileId,
                                            status: { $nin: ["PAUSED", "ARCHIVED"] },
                                            reportDate: currentDate,
                                            campaignId: 364817221181363
                                        }).lean();

                                        const campaignsPayload = enableCampaigns.map(cp => ({
                                            campaignId: String(cp.campaignId),
                                            state: "PAUSED",
                                        }));

                                        if (!campaignsPayload.length) return;

                                        const response = await retryWithBackoff(() => amazonAxios({
                                            method: "PUT",
                                            url: `${profile.amazonUrl}/sp/campaigns`,
                                            headers: {
                                                "Amazon-Advertising-API-ClientId": checkConfigAds?.adsClientId,
                                                "Amazon-Advertising-API-Scope": profile.profileId,
                                                "Authorization": `Bearer ${checkConfigAds?.adsAccessToken}`,
                                                "Content-Type": "application/vnd.spCampaign.v3+json",
                                                "Accept": "application/vnd.spCampaign.v3+json",
                                            },
                                            data: { campaigns: campaignsPayload },
                                            meta: { configId: profile.configId, tokenKey: "adsAccessToken" },
                                        }));

                                        if (response?.status === 207) {
                                            await campaignsSchema.updateMany(
                                                {
                                                    campaignId: { $in: enableCampaigns.map(cp => cp.campaignId) },
                                                    reportDate: currentDate
                                                },
                                                { $set: { status: "PAUSED" } }
                                            );

                                            await holidayActionHistorySchema.findOneAndUpdate(
                                                {
                                                    configId: h.configId,
                                                    profileId: h.profileId,
                                                    holidayId: h._id
                                                },
                                                {
                                                    $set: {
                                                        startDate: h.startDate,
                                                        endDate: h.endDate,
                                                        protectionAction: h.protectionAction,
                                                        pauseCampaignAction: {
                                                            campaignId: enableCampaigns.map(cp => cp.campaignId)
                                                        },
                                                        executionState: "APPLIED"
                                                    }
                                                },
                                                { new: true, upsert: true }
                                            ).lean()

                                        }

                                    }
                                }
                                if (h.endDate == currentDate) {

                                    const holidayHistory = await holidayActionHistorySchema.findOne({
                                        configId: h.configId,
                                        profileId: h.profileId,
                                        holidayId: h._id,
                                        protectionAction: h.protectionAction,
                                        executionState: "APPLIED"
                                    }).lean();

                                    if (holidayHistory && holidayHistory.protectionAction == "PAUSE_RULES" && holidayHistory.pauseRuleAction) {

                                        await Promise.all([
                                            await budgetRuleSchema.updateMany(
                                                { _id: { $in: holidayHistory.pauseRuleAction.budgetRules } },
                                                { $set: { isActive: true, pausedBy: "" } }
                                            ),

                                            await targetingRuleSchema.updateMany(
                                                { _id: { $in: holidayHistory.pauseRuleAction.targetingRules } },
                                                { $set: { isActive: true, pausedBy: "" } }
                                            ),

                                            await placementRuleSchema.updateMany(
                                                { _id: { $in: holidayHistory.pauseRuleAction.placementRules } },
                                                { $set: { isActive: true, pausedBy: "" } }
                                            )
                                        ]);

                                        await holidayActionHistorySchema.findByIdAndUpdate(
                                            { _id: holidayHistory._id },
                                            { executionState: "REVERTED" },
                                            { new: true, upsert: true }
                                        );
                                    }
                                    else if (holidayHistory && holidayHistory.protectionAction == "PAUSE_CAMPAIGNS" && holidayHistory.pauseCampaignAction) {

                                        const campaignsPayload = holidayHistory.pauseCampaignAction.campaignId.map(cp => ({
                                            campaignId: String(cp),
                                            state: "ENABLED",
                                        }));

                                        if (!campaignsPayload.length) return;

                                        const response = await retryWithBackoff(() => amazonAxios({
                                            method: "PUT",
                                            url: `${profile.amazonUrl}/sp/campaigns`,
                                            headers: {
                                                "Amazon-Advertising-API-ClientId": checkConfigAds?.adsClientId,
                                                "Amazon-Advertising-API-Scope": profile.profileId,
                                                "Authorization": `Bearer ${checkConfigAds?.adsAccessToken}`,
                                                "Content-Type": "application/vnd.spCampaign.v3+json",
                                                "Accept": "application/vnd.spCampaign.v3+json",
                                            },
                                            data: { campaigns: campaignsPayload },
                                            meta: { configId: profile.configId, tokenKey: "adsAccessToken" },
                                        }));

                                        if (response?.status === 207) {

                                            await campaignsSchema.updateMany(
                                                { campaignId: { $in: holidayHistory.pauseCampaignAction.campaignId } },
                                                { $set: { status: "ENABLED" } }
                                            );

                                            await holidayActionHistorySchema.findByIdAndUpdate(
                                                { _id: holidayHistory._id },
                                                { executionState: "REVERTED" },
                                                { new: true, upsert: true }
                                            );

                                        }

                                    }
                                }

                                return;
                            })
                        )
                    }

                    await cronJobHistorySchema.findOneAndUpdate(
                        {
                            configId: profile.configId,
                            profileId: profile.profileId,
                            cronName: "Apply Holiday Protection",
                            historyDate: currentDate
                        },
                        { $set: { status: "COMPLETED" } },
                        { new: true, upsert: true }
                    ).lean()

                    return;
                })
            )
        )

        cron_logs({
            message: "Apply Holiday Protection email sent successfully.",
            log_type: "info",
        });

    } catch (error) {
        cron_logs({
            message: `Apply Holiday Protection email error: ${error}`,
            log_type: "error",
        });
    }
}