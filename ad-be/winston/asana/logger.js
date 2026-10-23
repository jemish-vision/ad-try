const winston = require("winston");
const { Console, File } = require("winston/lib/winston/transports");
const path = require("path");
const moment = require("moment-timezone");
const { getLogger, registerLogger } = require("../LoggerManager");

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const FOLDER_PATH = path.join(__dirname, "../../logs/asana");

registerLogger("asana", (currentDate) => {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), logFormat),
    transports: [
      new Console(),
      new File({ filename: `${FOLDER_PATH}/${currentDate}.txt` }),
    ],
  });
});

function write_logs({
  message = null,
  log_type = "info",
} = {}) {
  const logger = getLogger("asana");

  let log_data_list = [];

  if (message !== null) {
    log_data_list.push(`message: ${message}`);
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
      logger.warn(logs);
      break;
    case "error":
      logger.error(logs);
      break;
    case "critical":
      logger.error(logs);
      break;
    default:
      logger.debug(logs);
      break;
  }
}

module.exports = { write_logs: write_logs };
