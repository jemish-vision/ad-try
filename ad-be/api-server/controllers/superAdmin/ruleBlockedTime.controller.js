const { write_logs } = require("../../../winston/utility/logger");
const ruleBlockedTimeSchema = require("../../models/ruleBlockedTime.model");
const mongoose = require("mongoose");

exports.getAllRuleBlockedTimes = async (req, res) => {
    try {
        const { pageNo = 1, perPage = 10, searchName = "", fieldName = "createdAt", sortType = "DESC" } = req.body;

        const skip = (Number(pageNo) - 1) * Number(perPage);
        const sortOrder = sortType === "ASC" ? 1 : -1;

        const matchStage = searchName
            ? {
                $or: [
                    { startTime: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                    { endTime: { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") } },
                ],
            }
            : {};

        const result = await ruleBlockedTimeSchema.aggregate([
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
        write_logs({ message: `[getAllRuleBlockedTimes Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.createRuleBlockedTime = async (req, res) => {
    try {
        const { startTime, endTime } = req.body;

        if (!startTime || !endTime) {
            return res.status(400).json({
                isSuccess: false,
                message: "Start time and end time are required.",
            });
        }

        const newRule = await ruleBlockedTimeSchema.create({ startTime, endTime });

        return res.status(200).json({
            isSuccess: true,
            message: "Rule Blocked Time created successfully.",
            data: newRule,
        });
    } catch (error) {
        write_logs({ message: `[createRuleBlockedTime Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.updateRuleBlockedTime = async (req, res) => {
    try {
        const { ruleBlockedTimeId, startTime, endTime } = req.body;

        if (!ruleBlockedTimeId) {
            return res.status(400).json({
                isSuccess: false,
                message: "Rule Blocked Time ID is required.",
            });
        }

        const existing = await ruleBlockedTimeSchema.findById(ruleBlockedTimeId).lean();
        if (!existing) {
            return res.status(404).json({
                isSuccess: false,
                message: "Rule Blocked Time not found.",
            });
        }

        const updated = await ruleBlockedTimeSchema.findByIdAndUpdate(
            new mongoose.Types.ObjectId(ruleBlockedTimeId),
            { $set: { startTime, endTime } },
            { new: true }
        );

        return res.status(200).json({
            isSuccess: true,
            message: "Rule Blocked Time updated successfully.",
            data: updated,
        });
    } catch (error) {
        write_logs({ message: `[updateRuleBlockedTime Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};

exports.deleteRuleBlockedTime = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                isSuccess: false,
                message: "Rule Blocked Time ID is required.",
            });
        }

        const existing = await ruleBlockedTimeSchema.findById(id).lean();
        if (!existing) {
            return res.status(404).json({
                isSuccess: false,
                message: "Rule Blocked Time not found.",
            });
        }

        await ruleBlockedTimeSchema.findByIdAndDelete(new mongoose.Types.ObjectId(id));

        return res.status(200).json({
            isSuccess: true,
            message: "Rule Blocked Time deleted successfully.",
        });
    } catch (error) {
        write_logs({ message: `[deleteRuleBlockedTime Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred",
        });
    }
};