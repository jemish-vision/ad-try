const healthScoreSettingSchema = require("../models/healthScoreSetting.model");
const mongoose = require("mongoose");
const { healthScore_logs } = require("../../winston/healthScore/logger");

exports.getAllHealthScoreSetting = async (req, res) => {
    try {
        const {
            pageNo = 1,
            perPage = 50,
            searchName = "",
            fieldName = "createdAt",
            sortType = "DESC",
            profileId,
        } = req.body;

        const skip = (Number(pageNo) - 1) * Number(perPage);
        const sortOrder = sortType === "ASC" ? 1 : -1;

        const matchStage = {
            ...(profileId && { profileId: Number(profileId) }),
            ...(searchName && {
                $or: [
                    { scoreName: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                    { query: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                ],
            }),
        };

        const result = await healthScoreSettingSchema.aggregate([
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
        healthScore_logs({
            message: `[getAllHealthScoreSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.createHealthScoreSetting = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { profileId, scoreName, query, conditions } = req.body;

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

        const newSetting = await healthScoreSettingSchema.create({
            profileId: Number(profileId),
            ...(configId && { configId: new mongoose.Types.ObjectId(configId) }),
            scoreName,
            query: query || "",
            conditions: conditions || [],
        });

        healthScore_logs({
            message: `[createHealthScoreSetting Success] ProfileId: ${profileId} | ScoreName: ${scoreName} | ID: ${newSetting?._id} [body] ${JSON.stringify(req?.body)}`,
            log_type: "info",
        });

        return res.status(200).json({
            isSuccess: true,
            message: "Health Score Setting created successfully.",
            data: newSetting,
        });
    } catch (error) {
        healthScore_logs({
            message: `[createHealthScoreSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.updateHealthScoreSetting = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { healthScoreSettingId, profileId, scoreName, query, conditions } = req.body;

        if (!healthScoreSettingId) {
            return res.status(400).json({
                isSuccess: false,
                message: "healthScoreSettingId is required.",
            });
        }

        const existing = await healthScoreSettingSchema.findOne({ _id: healthScoreSettingId, ...(configId && { configId }) }).lean();
        if (!existing) {
            return res.status(404).json({
                isSuccess: false,
                message: "Health Score Setting not found.",
            });
        }

        const updated = await healthScoreSettingSchema.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(healthScoreSettingId), ...(configId && { configId }) },
            {
                $set: {
                    ...(profileId && { profileId: Number(profileId) }),
                    ...(configId && { configId: new mongoose.Types.ObjectId(configId) }),
                    ...(scoreName && { scoreName }),
                    ...(query !== undefined && { query }),
                    ...(conditions && { conditions }),
                },
            },
            { new: true }
        );

        healthScore_logs({
            message: `[updateHealthScoreSetting Success] ID: ${healthScoreSettingId} | ProfileId: ${profileId} [body] ${JSON.stringify(req?.body)}`,
            log_type: "info",
        });

        return res.status(200).json({
            isSuccess: true,
            message: "Health Score Setting updated successfully.",
            data: updated,
        });
    } catch (error) {
        healthScore_logs({
            message: `[updateHealthScoreSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.deleteHealthScoreSetting = async (req, res) => {
    try {
        const configId = req?.config?.configId;
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                isSuccess: false,
                message: "Health Score Setting ID is required.",
            });
        }

        const existing = await healthScoreSettingSchema.findOne({ _id: id, ...(configId && { configId }) }).lean();
        if (!existing) {
            return res.status(404).json({
                isSuccess: false,
                message: "Health Score Setting not found.",
            });
        }

        await healthScoreSettingSchema.findOneAndDelete({ _id: new mongoose.Types.ObjectId(id), ...(configId && { configId }) });

        healthScore_logs({
            message: `[deleteHealthScoreSetting Success] ID: ${id} [body] ${JSON.stringify(req?.body)}`,
            log_type: "info",
        });

        return res.status(200).json({
            isSuccess: true,
            message: "Health Score Setting deleted successfully.",
        });
    } catch (error) {
        healthScore_logs({
            message: `[deleteHealthScoreSetting Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`,
            log_type: "error",
        });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};