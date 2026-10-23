const CustomColumns = require("../models/customColumns.model");
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
