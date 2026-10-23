const { write_logs } = require("../../winston/utility/logger");
const DeviceToken = require("../models/deviceToken");
const auditLogSchema = require("../models/auditLog.model");

const createToken = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { deviceToken, profileId } = req.body;

    if (!deviceToken || !profileId) {
      return res.status(400).json({
        isSuccess: false,
        message: "deviceToken and profileId are required"
      });
    }

    const payload = {
      userId,
      profileId,
      deviceToken,
      userAgent: req.headers["user-agent"] || null,
      lastSeen: new Date()
    };

    const updatedRecord = await DeviceToken.findOneAndUpdate(
      { userId, profileId, deviceToken },
      payload,
      { upsert: true, new: true }
    ).lean();

    return res.status(200).json({
      isSuccess: true,
      message: updatedRecord ? "Device token updated" : "Device token created",
      data: updatedRecord
    });

  } catch (error) {
      write_logs({ message: `[createToken Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Failed to store device token",
      error: "An internal server error occurred"
    });
  }
};

const deleteToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceToken } = req.body;

    let query = { userId };

    if (deviceToken) {
      query.deviceToken = deviceToken;
    }

    const result = await DeviceToken.deleteMany(query);

    await auditLogSchema.create({
      userId,
      event: "USER_LOGOUT",
      message: "User logged out successfully",
      ipAddress: req?.ip,
      userAgent: req?.headers["user-agent"],
      metadata: { deletedCount: result?.deletedCount, deviceToken: deviceToken || "ALL_DEVICES", status: "SUCCESS" },
    });

    return res.status(200).json({
      isSuccess: true,
      message: `Device token(s) deleted successfully`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
      write_logs({ message: `[deleteToken Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).json({
      isSuccess: false,
      message: "Internal Server Error",
      error: "An internal server error occurred"
    });
  }
};

module.exports = {
  createToken,
  deleteToken,
};
