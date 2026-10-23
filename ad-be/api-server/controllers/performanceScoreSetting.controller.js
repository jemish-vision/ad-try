const performanceScoreSettingSchema = require("../models/performanceScoreSetting.model");
const mongoose = require("mongoose");
const { performanceScore_logs } = require("../../winston/performanceScore/logger");

exports.getAllPerformanceScoreSetting = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const {
            pageNo = 1,
            perPage = 50,
            searchName = "",
            fieldName = "createdAt",
            sortType = "DESC",
            profileId,
        } = req.body;

        if (!profileId) {
            return res.status(400).json({
                isSuccess: false,
                message: "profileId is required.",
            });
        }

        const skip = (Number(pageNo) - 1) * Number(perPage);
        const sortOrder = sortType === "ASC" ? 1 : -1;

        const matchStage = {
            configId: new mongoose.Types.ObjectId(configId),
            profileId: Number(profileId),
            ...(searchName && {
                $or: [
                    { scoreName: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                    { query: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                ],
            }),
        };

        const result = await performanceScoreSettingSchema.aggregate([
            { $match: matchStage },
            { $sort: { [fieldName]: sortOrder } },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: Number(perPage) },
                    ],
                    totalRecords: [
                        { $count: "count" },
                    ],
                },
            },
            {
                $project: {
                    data: 1,
                    totalRecords: { $ifNull: [{ $arrayElemAt: ["$totalRecords.count", 0] }, 0] },
                },
            },
        ]);

        const { data, totalRecords } = result[0];

        return res.status(200).json({
            isSuccess: true,
            data,
            totalRecords,
            pageNo: Number(pageNo),
            perPage: Number(perPage),
        });
    } catch (error) {
        performanceScore_logs({
            message: `[getAllPerformanceScoreSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.createPerformanceScoreSetting = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, scoreName, conditions } = req.body;

        if (!profileId) {
            return res.status(400).json({
                isSuccess: false,
                message: "profileId is required.",
            });
        }

        if (!scoreName) {
            return res.status(400).json({
                isSuccess: false,
                message: "scoreName is required.",
            });
        }

        const newSetting = await performanceScoreSettingSchema.create({
            profileId: Number(profileId),
            ...(configId && { configId: new mongoose.Types.ObjectId(configId) }),
            scoreName,
            conditions: conditions || [],
        });

        performanceScore_logs({
            message: `[createPerformanceScoreSetting Success] ProfileId: ${profileId} | ScoreName: ${scoreName} | ID: ${newSetting?._id} [body] ${JSON.stringify(req?.body)}`,
            log_type: "info",
        });

        return res.status(200).json({
            isSuccess: true,
            message: "Performance Score Setting created successfully.",
            data: newSetting,
        });
    } catch (error) {
        performanceScore_logs({
            message: `[createPerformanceScoreSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.updatePerformanceScoreSetting = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { performanceScoreId, profileId, scoreName, conditions } = req.body;

        if (!performanceScoreId) {
            return res.status(400).json({
                isSuccess: false,
                message: "performanceScoreId is required.",
            });
        }

        const existing = await performanceScoreSettingSchema.findOne({ _id: performanceScoreId, ...(configId && { configId }) }).lean();
        if (!existing) {
            return res.status(404).json({
                isSuccess: false,
                message: "Performance Score Setting not found.",
            });
        }

        const updated = await performanceScoreSettingSchema.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(performanceScoreId), ...(configId && { configId }) },
            {
                $set: {
                    ...(profileId && { profileId: Number(profileId) }),
                    ...(configId && { configId: new mongoose.Types.ObjectId(configId) }),
                    ...(scoreName && { scoreName }),
                    ...(conditions && { conditions }),
                },
            },
            { new: true }
        );

        performanceScore_logs({
            message: `[updatePerformanceScoreSetting Success] ID: ${performanceScoreId} | ProfileId: ${profileId} [body] ${JSON.stringify(req?.body)}`,
            log_type: "info",
        });

        return res.status(200).json({
            isSuccess: true,
            message: "Performance Score Setting updated successfully.",
            data: updated,
        });
    } catch (error) {
        performanceScore_logs({
            message: `[updatePerformanceScoreSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.deletePerformanceScoreSetting = async (req, res) => {
    try {
        const { id } = req.body;
        const configId = req?.config?.configId;

        if (!id) {
            return res.status(400).json({
                isSuccess: false,
                message: "Performance Score Setting ID is required.",
            });
        }

        const existing = await performanceScoreSettingSchema.findOne({ _id: id, ...(configId && { configId }) }).lean();
        if (!existing) {
            return res.status(404).json({
                isSuccess: false,
                message: "Performance Score Setting not found.",
            });
        }

        await performanceScoreSettingSchema.findOneAndDelete({ _id: new mongoose.Types.ObjectId(id), ...(configId && { configId }) });

        performanceScore_logs({
            message: `[deletePerformanceScoreSetting Success] ID: ${id} [body] ${JSON.stringify(req?.body)}`,
            log_type: "info",
        });

        return res.status(200).json({
            isSuccess: true,
            message: "Performance Score Setting deleted successfully.",
        });
    } catch (error) {
        performanceScore_logs({
            message: `[deletePerformanceScoreSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};