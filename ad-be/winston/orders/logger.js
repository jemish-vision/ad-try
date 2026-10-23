const winston = require("winston");
const { Console, File } = require("winston/lib/winston/transports");
const path = require("path");
const moment = require("moment-timezone");
const { getLogger, registerLogger } = require("../LoggerManager");

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const currentDate = moment().format("YYYY-MM-DD");
const FOLDER_PATH = path.join(__dirname, "../../logs/orders");

registerLogger("orders", (currentDate) => {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), logFormat),
    transports: [
      new Console(),
      new File({ filename: `${FOLDER_PATH}/order-${currentDate}.txt` }),
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
  const logger = getLogger("orders");

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

registerLogger("order-items", (currentDate) => {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), logFormat),
    transports: [
      new Console(),
      new File({ filename: `${FOLDER_PATH}/order-item-${currentDate}.txt` }),
    ],
  });
});

function item_write_logs({
  message = null,
  PDT_current_time = moment()
    .tz("America/Los_Angeles")
    .format("YYYY-MM-DD HH:mm:ss A"),
  IND_current_time = moment()
    .tz("Asia/Kolkata")
    .format("YYYY-MM-DD HH:mm:ss A"),
  log_type = "debug",
} = {}) {
  const itemLogger = getLogger("order-items");

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
      itemLogger.debug(logs);
      break;
    case "info":
      itemLogger.info(logs);
      break;
    case "warning":
      itemLogger.warn(logs);
      break;
    case "error":
      itemLogger.error(logs);
      break;
    case "critical":
      itemLogger.error(logs);
      break;
    default:
      itemLogger.debug(logs);
      break;
  }
}

registerLogger("order-buyer-info", (currentDate) => {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), logFormat),
    transports: [
      new Console(),
      new File({
        filename: `${FOLDER_PATH}/order-buyer-info-${currentDate}.txt`
      }),
    ],
  });
});

function info_write_logs({
  message = null,
  PDT_current_time = moment()
    .tz("America/Los_Angeles")
    .format("YYYY-MM-DD HH:mm:ss A"),
  IND_current_time = moment()
    .tz("Asia/Kolkata")
    .format("YYYY-MM-DD HH:mm:ss A"),
  log_type = "debug",
} = {}) {
  const infoLogger = getLogger("order-buyer-info");

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
      infoLogger.debug(logs);
      break;
    case "info":
      infoLogger.info(logs);
      break;
    case "warning":
      infoLogger.warn(logs);
      break;
    case "error":
      infoLogger.error(logs);
      break;
    case "critical":
      infoLogger.error(logs);
      break;
    default:
      infoLogger.debug(logs);
      break;
  }
}

registerLogger("order-address", (currentDate) => {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), logFormat),
    transports: [
      new Console(),
      new File({
        filename: `${FOLDER_PATH}/order-address-${currentDate}.txt`,
      }),
    ],
  });
});

function address_write_logs({
  message = null,
  PDT_current_time = moment()
    .tz("America/Los_Angeles")
    .format("YYYY-MM-DD HH:mm:ss A"),
  IND_current_time = moment()
    .tz("Asia/Kolkata")
    .format("YYYY-MM-DD HH:mm:ss A"),
  log_type = "debug",
} = {}) {
  const addressLogger = getLogger("order-address");

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
      addressLogger.debug(logs);
      break;
    case "info":
      addressLogger.info(logs);
      break;
    case "warning":
      addressLogger.warn(logs);
      break;
    case "error":
      addressLogger.error(logs);
      break;
    case "critical":
      addressLogger.error(logs);
      break;
    default:
      addressLogger.debug(logs);
      break;
  }
}

module.exports = {
  write_logs: write_logs,
  item_write_logs: item_write_logs,
  info_write_logs: info_write_logs,
  address_write_logs: address_write_logs,
};
