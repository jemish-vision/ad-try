const winston = require("winston");
const { Console, File } = require("winston/lib/winston/transports");
const path = require("path");
const moment = require("moment-timezone");
const { getLogger, registerLogger } = require("../LoggerManager");

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const FOLDER_PATH = path.join(__dirname, "../../logs/healthScore");

registerLogger("healthScore", (currentDate) => {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), logFormat),
    transports: [
      new Console(),
      new File({ filename: `${FOLDER_PATH}/healthScore-${currentDate}.txt` }),
    ],
  });
});

function healthScore_logs({
  message = null,
  PDT_current_time = moment()
    .tz("America/Los_Angeles")
    .format("YYYY-MM-DD HH:mm:ss A"),
  IND_current_time = moment()
    .tz("Asia/Kolkata")
    .format("YYYY-MM-DD HH:mm:ss A"),
  log_type = "info",
} = {}) {
  try {
    const logger = getLogger("healthScore");

    let log_data_list = [];
    log_data_list.push(
      `IND_current_time: ${IND_current_time} PDT_current_time: ${PDT_current_time}`
    );

    if (message !== null) {
      log_data_list.push(`message: ${typeof message === 'object' ? JSON.stringify(message) : message}`);
    }
    const logs = log_data_list.join(", ");
    switch (log_type) {
      case "debug":
        logger.debug(logs);
        break;
      case "info":
        logger.info(logs);
        break;
      case "warning":
      case "warn":
        logger.warn(logs);
        break;
      case "error":
      case "critical":
        logger.error(logs);
        break;
      default:
        logger.info(logs);
        break;
    }
  } catch (err) {
    console.error("healthScore_logs error:", err);
  }
}

module.exports = {
  healthScore_logs: healthScore_logs,
  write_logs: healthScore_logs
};
