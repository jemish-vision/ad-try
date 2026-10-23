const retentionSchema = require("../models/retention.model");
const { write_logs } = require("../../winston/utility/logger");

/**
 * Get all retention records (supports pagination, searching, and sorting)
 */
exports.getAllRetention = async (req, res) => {
  try {
    const { pageNo, perPage, searchName, fieldName, sortType } = req.body;

    const query = {};
    if (searchName) {
      const isNumber = !isNaN(searchName);
      if (isNumber) {
        query.$or = [
          { days: Number(searchName) },
          { label: { $regex: searchName, $options: "i" } },
        ];
      } else {
        query.label = { $regex: searchName, $options: "i" };
      }
    }

    const sortField = fieldName || "days";
    const sortOrder = sortType === "DESC" ? -1 : 1;
    const sortObj = { [sortField]: sortOrder };

    if (pageNo && perPage) {
      const page = parseInt(pageNo, 10) || 1;
      const limit = parseInt(perPage, 10) || 10;
      const skip = (page - 1) * limit;

      const [list, totalRecords] = await Promise.all([
        retentionSchema.find(query).sort(sortObj).skip(skip).limit(limit).lean(),
        retentionSchema.countDocuments(query),
      ]);

      return res.status(200).json({
        isSuccess: true,
        message: "Retention list fetched successfully",
        data: list,
        totalRecords,
      });
    }

    const list = await retentionSchema.find(query).sort(sortObj).lean();
    return res.status(200).json({
      isSuccess: true,
      message: "Retention list fetched successfully",
      data: list,
      totalRecords: list.length,
    });
  } catch (error) {
    write_logs({
      message: `[getAllRetention Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to fetch retention list",
    });
  }
};

/**
 * Create a new retention record
 */
exports.createRetention = async (req, res) => {
  try {
    const { days, label, isActive } = req.body;

    if (days === undefined || days === null || days === "") {
      return res.status(200).json({
        isSuccess: false,
        message: "Retention days is required",
      });
    }

    const numDays = Number(days);
    if (isNaN(numDays) || numDays <= 0) {
      return res.status(200).json({
        isSuccess: false,
        message: "Retention days must be a positive number",
      });
    }

    const existing = await retentionSchema.findOne({ days: numDays }).lean();
    if (existing) {
      return res.status(200).json({
        isSuccess: false,
        message: `Retention for ${numDays} days already exists`,
      });
    }

    const newRetention = await retentionSchema.create({
      days: numDays,
      label: label?.trim() || `${numDays} Days`,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return res.status(200).json({
      isSuccess: true,
      message: "Retention record created successfully",
      data: newRetention,
    });
  } catch (error) {
    write_logs({
      message: `[createRetention Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to create retention record",
    });
  }
};

/**
 * Update existing retention record
 */
exports.updateRetention = async (req, res) => {
  try {
    const { id, retentionId, days, label, isActive } = req.body;
    const targetId = id || retentionId;

    if (!targetId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Retention ID is required",
      });
    }

    const existingRecord = await retentionSchema.findById(targetId);
    if (!existingRecord) {
      return res.status(200).json({
        isSuccess: false,
        message: "Retention record not found",
      });
    }

    if (days !== undefined && days !== null && days !== "") {
      const numDays = Number(days);
      if (isNaN(numDays) || numDays <= 0) {
        return res.status(200).json({
          isSuccess: false,
          message: "Retention days must be a positive number",
        });
      }

      const duplicate = await retentionSchema.findOne({
        days: numDays,
        _id: { $ne: targetId },
      }).lean();

      if (duplicate) {
        return res.status(200).json({
          isSuccess: false,
          message: `Retention for ${numDays} days already exists`,
        });
      }

      existingRecord.days = numDays;
    }

    if (label !== undefined) {
      existingRecord.label = label.trim() || `${existingRecord.days} Days`;
    }

    if (isActive !== undefined) {
      existingRecord.isActive = Boolean(isActive);
    }

    await existingRecord.save();

    return res.status(200).json({
      isSuccess: true,
      message: "Retention record updated successfully",
      data: existingRecord,
    });
  } catch (error) {
    write_logs({
      message: `[updateRetention Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to update retention record",
    });
  }
};

/**
 * Delete retention record
 */
exports.deleteRetention = async (req, res) => {
  try {
    const { id, retentionId } = req.body;
    const targetId = id || retentionId;

    if (!targetId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Retention ID is required",
      });
    }

    const deleted = await retentionSchema.findByIdAndDelete(targetId);
    if (!deleted) {
      return res.status(200).json({
        isSuccess: false,
        message: "Retention record not found",
      });
    }

    return res.status(200).json({
      isSuccess: true,
      message: "Retention record deleted successfully",
    });
  } catch (error) {
    write_logs({
      message: `[deleteRetention Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to delete retention record",
    });
  }
};

/**
 * Toggle active status of a retention record
 */
exports.changeStatusRetention = async (req, res) => {
  try {
    const { id, retentionId, isActive } = req.body;
    const targetId = id || retentionId;

    if (!targetId) {
      return res.status(200).json({
        isSuccess: false,
        message: "Retention ID is required",
      });
    }

    const record = await retentionSchema.findById(targetId);
    if (!record) {
      return res.status(200).json({
        isSuccess: false,
        message: "Retention record not found",
      });
    }

    record.isActive = isActive !== undefined ? Boolean(isActive) : !record.isActive;
    await record.save();

    return res.status(200).json({
      isSuccess: true,
      message: "Retention status changed successfully",
      data: record,
    });
  } catch (error) {
    write_logs({
      message: `[changeStatusRetention Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to change retention status",
    });
  }
};
