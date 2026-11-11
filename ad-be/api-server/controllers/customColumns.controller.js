const CustomColumns = require("../models/customColumns.model");
const ChartSettings = require("../models/chartSettings.model");
const { createHash } = require("crypto");
const mongoose = require("mongoose");
const { write_logs } = require("../../winston/utility/logger");

exports.getCustomColumns = async (req, res) => {
    try {
        const { _id: userId } = req.user;
        const { pageName } = req.body;

        const query = { userId, pageName };
        const data = await CustomColumns.findOne(query).lean();

        return res.status(200).send({
            isSuccess: true,
            data: data || null,
        });
    } catch (error) {
        write_logs({
            message: `[getCustomColumns Error] ${error?.message || error}`,
            log_type: "error",
        });
        res.status(500).send({ isSuccess: false, message: "Server error" });
    }
};

exports.updateCustomColumns = async (req, res) => {
    try {
        const { _id: userId } = req.user;
        const { pageName, columns } = req.body;

        const query = { userId, pageName };
        const updateData = { columns };

        const updated = await CustomColumns.findOneAndUpdate(
            query,
            updateData,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        res.status(200).send({
            isSuccess: true,
            message: "Columns updated successfully",
            data: updated,
        });
    } catch (error) {
        write_logs({
            message: `[updateCustomColumns Error] ${error?.message || error}`,
            log_type: "error",
        });
        res.status(500).send({ isSuccess: false, message: "Server error" });
    }
};

exports.getChartSettings = async (req, res) => {
    try {
        const { _id: userId } = req.user;
        const { pageName } = req.body;

        if (!pageName) {
            return res.status(400).send({ isSuccess: false, message: "pageName is required" });
        }

        const query = { userId, pageName };
        const data = await ChartSettings.findOne(query).lean();

        return res.status(200).send({
            isSuccess: true,
            data: data || null,
        });
    } catch (error) {
        write_logs({
            message: `[getChartSettings Error] ${error?.message || error}`,
            log_type: "error",
        });
        res.status(500).send({ isSuccess: false, message: "Server error" });
    }
};

exports.updateChartSettings = async (req, res) => {
    try {
        const { _id: userId } = req.user;
        const { pageName, settings, profileId, configId } = req.body;

        if (!pageName) {
            return res.status(400).send({ isSuccess: false, message: "pageName is required" });
        }

        if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
            return res.status(400).send({ isSuccess: false, message: "settings must be an object" });
        }

        const query = { userId, pageName };
        const updateData = {
            settings,
            ...(profileId ? { profileId } : {}),
            ...(configId ? { configId } : {}),
        };

        // The _id index also arbitrates concurrent first saves on installations
        // where automatic creation of the user/page index is disabled.
        const id = new mongoose.Types.ObjectId(createHash("sha256")
            .update(JSON.stringify(["chart-settings", String(userId), pageName]))
            .digest("hex").slice(0, 24));
        let updated;
        try {
            updated = await ChartSettings.findOneAndUpdate(
                query,
                { $set: updateData, $setOnInsert: { _id: id } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).lean();
        } catch (error) {
            if (error.code !== 11000) throw error;
            updated = await ChartSettings.findOneAndUpdate(
                query, { $set: updateData }, { new: true }
            ).lean();
            if (!updated) throw error;
        }

        res.status(200).send({
            isSuccess: true,
            message: "Chart settings updated successfully",
            data: updated,
        });
    } catch (error) {
        write_logs({
            message: `[updateChartSettings Error] ${error?.message || error}`,
            log_type: "error",
        });
        res.status(500).send({ isSuccess: false, message: "Server error" });
    }
};
