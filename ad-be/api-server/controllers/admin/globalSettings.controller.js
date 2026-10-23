const { write_logs } = require("../../../winston/utility/logger");
const GlobalSettings = require("../../models/globalSettings.model");
const auditLogSchema = require("../../models/auditLog.model");

exports.getGlobalSettings = async (req, res) => {
  try {
    let settings = await GlobalSettings.findOne();

    if (!settings) {
      settings = await GlobalSettings.create({ isMaintenanceMode: false });
    }

    return res.status(200).send({
      isSuccess: true,
      data: settings,
    });
  } catch (error) {
      write_logs({ message: `[getGlobalSettings Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong, please try again!",
      error: "An internal server error occurred",
    });
  }
};

exports.updateMaintenanceMode = async (req, res) => {
  try {
    const { isMaintenanceMode } = req.body;

    if (typeof isMaintenanceMode !== "boolean") {
      return res.status(400).send({
        isSuccess: false,
        message: "isMaintenanceMode must be a boolean value",
      });
    }

    let settings = await GlobalSettings.findOne();

    if (!settings) {
      settings = await GlobalSettings.create({ isMaintenanceMode });
    } else {
      settings.isMaintenanceMode = isMaintenanceMode;
      await settings.save();
    }

    if (req.app) {
      req.app.locals.isMaintenanceMode = isMaintenanceMode;
    }

    // Create Audit Log
    const userId = req.user && req.user._id;
    if (userId) {
      const eventName = isMaintenanceMode ? "MAINTENANCE_MODE_ENABLED" : "MAINTENANCE_MODE_DISABLED";
      const logMessage = isMaintenanceMode ? "Maintenance mode enabled by Super Admin" : "Maintenance mode disabled by Super Admin";

      await auditLogSchema.create({
        userId,
        event: eventName,
        message: logMessage,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { isMaintenanceMode, status: "SUCCESS" },
      });
    }

    return res.status(200).send({
      isSuccess: true,
      message: "Maintenance mode updated successfully",
      data: settings,
    });
  } catch (error) {
      write_logs({ message: `[updateMaintenanceMode Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong, please try again!",
      error: "An internal server error occurred",
    });
  }
};
