const axios = require("axios");
const { write_logs } = require("../../winston/utility/logger");
const { wait } = require("./common");
const { checkRateLimit, blockProfileTemporarily } = require("./rateLimiter");
const { getValidAccessToken, forceRefreshOne } = require("../services/amazonAuth.service");

const https = require("https");

const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 10000,
});

const amazonAxios = axios.create({
    timeout: 60_000,
    httpsAgent,
});

function isBackgroundWorkerExecution(config) {
    if (config?.meta?.isBackgroundWorker !== undefined) {
        return Boolean(config.meta.isBackgroundWorker);
    }
    if (process.env.IS_WORKER === "true") {
        return true;
    }
    if (process.argv[1] && /(worker|cron|scheduler|queue|script|batch)/i.test(process.argv[1])) {
        return true;
    }
    return false;
}

amazonAxios.interceptors.request.use(
    async (config) => {
        try {
            const configId = config?.meta?.configId;
            const sellerAPI = Boolean(config?.meta?.sp);
            const profileId = config?.meta?.profileId;

            if (configId) {
                const kind = sellerAPI ? "sp" : "ads";
                const accessToken = await getValidAccessToken({ kind, configId, profileId });

                if (sellerAPI) {
                    config.headers["x-amz-access-token"] = accessToken;
                } else {
                    config.headers["Authorization"] = `Bearer ${accessToken}`;
                }
            }

            write_logs({
                message: `[Amazon API Request] Method: ${config.method?.toUpperCase()} | URL: ${config.url} | Scope: ${config.headers?.["Amazon-Advertising-API-Scope"] || config?.meta?.profileId || "N/A"}`,
                log_type: "info",
            });

            // PRE-FLIGHT RATE LIMIT CHECK with local backoff for background workers
            while (true) {
                try {
                    await checkRateLimit(profileId, config.url, config.method || 'GET', sellerAPI);
                    break;
                } catch (rateErr) {
                    if (rateErr.message && rateErr.message.startsWith('LOCAL_RATE_LIMIT:')) {
                        const msToWait = parseInt(rateErr.message.split(':')[1], 10);
                        const isBackgroundWorker = isBackgroundWorkerExecution(config);

                        if (!isBackgroundWorker) {
                            // Frontend request: fail fast
                            return Promise.reject({
                                isRateLimit: true,
                                message: "Amazon is currently busy processing data for this profile. Please try again in a few seconds."
                            });
                        }

                        config._preFlightRetries = (config._preFlightRetries || 0) + 1;
                        if (config._preFlightRetries >= 5) {
                            return Promise.reject(new Error("Max pre-flight rate limit retries reached"));
                        }

                        // Background worker: Wait and retry locally without hitting Amazon
                        await wait(msToWait + 50); // wait required time + 50ms jitter
                        continue;
                    }
                    throw rateErr;
                }
            }

            return config;
        } catch (err) {
            write_logs({
                message: `[amazonAxios Request Error] ${err.message}`,
                log_type: "error",
            });

            // Propagate auth/interceptor errors rather than sending unauthenticated requests
            return Promise.reject(err);
        }
    },
    (error) => {
        write_logs({
            message: `[Amazon API Request Config Error] Message: ${error?.message || error}`,
            log_type: "error",
        });
        return Promise.reject(error);
    }
);

amazonAxios.interceptors.response.use(
    (response) => {
        try {
            write_logs({
                message: `[Amazon API Response] Method: ${response.config?.method?.toUpperCase()} | URL: ${response.config?.url} | Status: ${response.status}`,
                log_type: "info",
            });
        } catch (e) { }
        return response;
    },

    async (error) => {
        try {
            write_logs({
                message: `[Amazon API Response Error] Method: ${error?.config?.method?.toUpperCase()} | URL: ${error?.config?.url} | Status: ${error?.response?.status || "NO_STATUS"} | Error: ${error}`,
                log_type: "error",
            });
        } catch (e) { }

        const originalRequest = error.config;
        const status = error?.response?.status;
        const configId = originalRequest?.meta?.configId;
        const sellerAPI = Boolean(originalRequest?.meta?.sp);
        const profileId = originalRequest?.meta?.profileId;

        if (!configId) {
            return Promise.reject(error);
        }

        if (status === 404) {
            return Promise.reject(error);
        }

        if (status === 429 || status === 425) {
            const isBackgroundWorker = isBackgroundWorkerExecution(originalRequest);

            // 1. Calculate Retry-After + Jitter
            let retryAfterMs = 5000;
            if (error.response?.headers['retry-after']) {
                retryAfterMs = parseInt(error.response.headers['retry-after'], 10) * 1000;
            } else if (error.response?.headers['x-amzn-ratelimit-limit']) {
                retryAfterMs = 10000;
            } else if (!sellerAPI) {
                retryAfterMs = 20000; // Ads API aggressive fallback
            }
            const jitter = Math.floor(Math.random() * 1000);
            const totalWaitTime = retryAfterMs + jitter;

            // 2. Block the profile in Redis so other workers don't flood Amazon
            await blockProfileTemporarily(profileId, sellerAPI, totalWaitTime);

            // 3. Frontend logic vs Background Worker logic
            if (!isBackgroundWorker) {
                // Short wait allowed for frontend (max 2 seconds)
                if (totalWaitTime <= 2000 && !originalRequest._hasQuickRetried) {
                    originalRequest._hasQuickRetried = true;
                    await wait(totalWaitTime);
                    return amazonAxios(originalRequest);
                }
                return Promise.reject({
                    isRateLimit: true,
                    message: "Amazon is currently busy processing data for this profile. Please try again in a few seconds."
                });
            }

            // 4. Worker logic: Retry up to 3 times
            originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
            if (originalRequest._retryCount >= 3) {
                write_logs({
                    message: `Amazon rate limit hit 3 times in a row. Aborting. URL: ${originalRequest.url}`,
                    log_type: "error",
                });
                return Promise.reject(error);
            }

            write_logs({
                message: `Amazon rate limit hit (status ${status}). Waiting ${totalWaitTime}ms (Retry ${originalRequest._retryCount}/3). configId=${configId}`,
                log_type: "info",
            });

            await wait(totalWaitTime);
            return amazonAxios(originalRequest);
        }

        // 401 Unauthorized handling: Force single refresh for this exact identity and retry once
        if (status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const kind = sellerAPI ? "sp" : "ads";
                let rejectedToken = null;
                if (sellerAPI) {
                    rejectedToken = originalRequest.headers?.["x-amz-access-token"] || null;
                } else if (originalRequest.headers?.["Authorization"]) {
                    rejectedToken = String(originalRequest.headers["Authorization"]).replace(/^Bearer\s+/i, "");
                }

                write_logs({
                    message: `[amazonAxios] 401 received. Forcing single refresh for ${kind}:${configId}`,
                    log_type: "warn",
                });

                const newAccessToken = await forceRefreshOne({
                    kind,
                    configId,
                    profileId,
                    rejectedToken,
                    reason: "401_unauthorized",
                });

                if (sellerAPI) {
                    originalRequest.headers["x-amz-access-token"] = newAccessToken;
                } else {
                    originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
                }

                return amazonAxios(originalRequest);
            } catch (err) {
                write_logs({
                    message: `[amazonAxios] Amazon refresh token failed configId=${configId} error=${err.message}`,
                    log_type: "error",
                });
                return Promise.reject(err);
            }
        }

        return Promise.reject(error);
    }
);

module.exports = amazonAxios;
