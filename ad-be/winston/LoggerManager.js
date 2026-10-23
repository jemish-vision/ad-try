const moment = require("moment-timezone");

const loggerRegistry = {};

function registerLogger(name, createLoggerFn) {
    const today = moment().format("YYYY-MM-DD");
    loggerRegistry[name] = {
        currentDate: today,
        createLoggerFn,
        logger: createLoggerFn(today),
    };
}

function getLogger(name) {
    const entry = loggerRegistry[name];
    if (!entry) {
        throw new Error(`[LoggerManager] Logger "${name}" is not registered.`);
    }

    const today = moment().format("YYYY-MM-DD");

    if (today !== entry.currentDate) {
        console.log(
            `[LoggerManager] Date changed for "${name}": ${entry.currentDate} → ${today}. Creating new log file.`
        );

        entry.logger.transports.forEach((t) => {
            if (t.close) t.close();
        });
        entry.logger.close();

        entry.currentDate = today;
        entry.logger = entry.createLoggerFn(today);
    }

    return entry.logger;
}

module.exports = { registerLogger, getLogger };