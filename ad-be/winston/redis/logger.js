const winston = require("winston");
const { Console, File } = require("winston/lib/winston/transports");
const path = require("path");
const moment = require("moment-timezone");
const { getLogger, registerLogger } = require("../LoggerManager");

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const currentDate = moment().format("YYYY-MM-DD");
const FOLDER_PATH = path.join(__dirname, "../../logs/redis");

registerLogger("redis", (currentDate) => {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), logFormat),
    transports: [
      new File({
        filename: `${FOLDER_PATH}/${currentDate}.txt`,
      }),
    ],
  });
});

function write_logs({
  message = null,
  PDT_current_time = moment()
    .tz("America/Los_Angeles")
    .format("YYYY-MM-DD HH:mm:ss A"),
  IND_current_time = moment()
    .tz("Asia/Kolkata")
    .format("YYYY-MM-DD HH:mm:ss A"),
  log_type = "debug",
} = {}) {
  const logger = getLogger("redis");

  let log_data_list = [];
  log_data_list.push(
    `IND_current_time: ${IND_current_time} PDT_current_time: ${PDT_current_time}`
  );

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

module.exports = { write_logs };
