const { write_logs } = require("../../winston/utility/logger");

const retryWithBackoff = async (fn, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            const status = err?.response?.status || err?.status;

            const isRetryable =
                status === 401 ||
                status === 425 ||
                status === 429 ||
                (status >= 500 && status < 600) ||
                err?.code === "ECONNRESET" ||
                err?.code === "ETIMEDOUT" ||
                err?.code === "ECONNABORTED" ||
                err?.code === "ENOTFOUND" ||
                err?.message?.includes("ECONNRESET") ||
                err?.message?.includes("socket hang up") ||
                err?.message?.includes("ReplicaSetNoPrimary") ||
                err?.message?.includes("connection timed out") ||
                err?.message?.includes("not primary");

            if (isRetryable && i < retries - 1) {
                const retryAfter = err?.response?.headers?.["retry-after"];
                let waitTime = retryAfter ? Number(retryAfter) * 1000 : delay;
                if (err?.message?.includes("socket hang up") || err?.code === "ECONNRESET") {
                    waitTime = Math.max(waitTime, 3000);
                }

                const waitSec = (waitTime / 1000).toFixed(1);
                write_logs({
                    message: `Error: ${err.message || 'Unknown error'} (status ${status || err?.code || 'network'}). Retry attempt ${i + 1} in ${waitSec} seconds...`,
                    log_type: "info",
                });

                await new Promise(res => setTimeout(res, waitTime));
                delay *= 2;
            } else {
                throw err;
            }
        }
    }
};

module.exports = { retryWithBackoff };