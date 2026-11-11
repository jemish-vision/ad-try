import { useState, useEffect, useRef, useCallback, useContext, useMemo } from "react";
import { ApiGetChartSettings, ApiUpdateChartSettings } from "../../api-wrapper/columns/ApiColumns";
import { ProfileContext } from "../usecontext/useContext";

const saveQueues = new Map();
let revision = 0;

const readCache = (pageName, userId) => {
    if (!pageName || typeof localStorage === "undefined") return null;
    const normalize = (val) => {
        if (!val || typeof val !== "object" || Array.isArray(val)) return null;
        if (val.version === 2 && val.settings) return val;
        if (val.settings && typeof val.settings === "object" && !Array.isArray(val.settings)) {
            return { version: 2, settings: val.settings, pending: false };
        }
        return { version: 2, settings: val, pending: false };
    };
    try {
        if (userId) {
            const userKey = `iq_chart_settings_${userId}_${pageName}`;
            const userVal = normalize(JSON.parse(localStorage.getItem(userKey)));
            if (userVal) return userVal;
        }
        const generalKey = `iq_chart_settings_${pageName}`;
        const generalVal = normalize(JSON.parse(localStorage.getItem(generalKey)));
        if (generalVal) return generalVal;
    } catch {
        return null;
    }
    return null;
};

const writeCache = (pageName, userId, value) => {
    if (!pageName || typeof localStorage === "undefined") return;
    try {
        const payload = JSON.stringify(value);
        if (userId) {
            localStorage.setItem(`iq_chart_settings_${userId}_${pageName}`, payload);
        }
        localStorage.setItem(`iq_chart_settings_${pageName}`, payload);
    } catch {
        // Settings still persist to the server when browser storage is unavailable.
    }
};

const queueSave = (job) => {
    const queueKey = job.pageName || job.key || "default";
    const previous = saveQueues.get(queueKey) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
        try {
            const response = await ApiUpdateChartSettings(job.payload, job.options);
            if (response?.isSuccess) {
                const cached = readCache(job.pageName, job.userId);
                if (cached?.revision === job.revision) {
                    writeCache(job.pageName, job.userId, { ...cached, pending: false });
                }
            }
        } catch (error) {
            console.error("[useChartSettings] Failed to save settings:", error);
        }
    });
    saveQueues.set(queueKey, pending);
    pending.finally(() => {
        if (saveQueues.get(queueKey) === pending) {
            saveQueues.delete(queueKey);
        }
    }).catch(() => {});
    return pending;
};

/** User/view preferences share the same persistence scope as saved table columns. */
export const useChartPreferenceSettings = ({
    savePageName,
    defaultSettings = {},
    sanitizeSettings = (settings) => settings,
    userId: propUserId,
    profileId: propProfileId,
}) => {
    const context = useContext(ProfileContext) || {};
    let cachedUserId;
    try {
        cachedUserId = JSON.parse(localStorage.getItem("userAccount"))?._id;
    } catch {
        cachedUserId = undefined;
    }
    const userId = propUserId ?? context.loginUser?._id ?? cachedUserId;
    const profileId = propProfileId ?? context.profileId?.value;

    const configuration = useRef({});
    configuration.current = { defaultSettings, sanitizeSettings, savePageName, profileId, userId };

    const getInitialSettings = useCallback(() => {
        const cached = readCache(savePageName, userId);
        return sanitizeSettings({ ...defaultSettings, ...(cached?.settings || {}) });
    }, [savePageName, userId, defaultSettings, sanitizeSettings]);

    const [settings, setSettingsState] = useState(getInitialSettings);

    const liveSettingsRef = useRef(settings);
    liveSettingsRef.current = settings;

    const userEditedRef = useRef(false);
    const timer = useRef(null);
    const pendingJob = useRef(null);

    const createSaveJob = useCallback((newSettings) => {
        const { savePageName: pageName, profileId: selectedProfileId, userId: currentUserId } = configuration.current;
        const token = localStorage.getItem("sellerToken");
        return {
            pageName,
            userId: currentUserId,
            revision: `${Date.now()}-${++revision}`,
            payload: { pageName, settings: newSettings, profileId: selectedProfileId },
            options: { headers: { Authorization: token ? `Bearer ${token}` : "" } },
        };
    }, []);

    const setSettings = useCallback(
        (update) => {
            userEditedRef.current = true;
            const current = liveSettingsRef.current;
            const next = typeof update === "function" ? update(current) : update;
            const sanitized = configuration.current.sanitizeSettings({
                ...configuration.current.defaultSettings,
                ...next,
            });

            if (JSON.stringify(sanitized) === JSON.stringify(current)) return;

            liveSettingsRef.current = sanitized;
            setSettingsState(sanitized);

            if (!savePageName) return;

            const job = createSaveJob(sanitized);
            writeCache(savePageName, configuration.current.userId, {
                version: 2,
                settings: sanitized,
                revision: job.revision,
                pending: true,
            });
            pendingJob.current = job;

            if (timer.current) {
                clearTimeout(timer.current);
            }
            timer.current = setTimeout(() => {
                pendingJob.current = null;
                timer.current = null;
                queueSave(job);
            }, 600);
        },
        [savePageName, createSaveJob]
    );

    useEffect(() => {
        let mounted = true;
        if (!savePageName) return;

        userEditedRef.current = false;

        // Synchronously align with fresh cache if savePageName changed
        const freshCache = readCache(savePageName, userId);
        if (freshCache?.settings) {
            const sanitized = configuration.current.sanitizeSettings({
                ...configuration.current.defaultSettings,
                ...freshCache.settings,
            });
            liveSettingsRef.current = sanitized;
            setSettingsState(sanitized);
        }

        const load = async () => {
            try {
                // Wait for any in-flight saves before fetching
                await saveQueues.get(savePageName);
                if (!mounted) return;

                const token = localStorage.getItem("sellerToken");
                const response = await ApiGetChartSettings(
                    {
                        pageName: savePageName,
                        profileId,
                    },
                    { headers: { Authorization: token ? `Bearer ${token}` : "" } }
                );

                if (!mounted || userEditedRef.current) return;

                if (response?.isSuccess && response.data?.settings) {
                    const saved = response.data.settings;
                    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
                        const merged = configuration.current.sanitizeSettings({
                            ...configuration.current.defaultSettings,
                            ...saved,
                        });
                        liveSettingsRef.current = merged;
                        writeCache(savePageName, userId, { version: 2, settings: merged, pending: false });
                        setSettingsState(merged);
                    }
                } else if (freshCache?.settings && !response?.data?.settings) {
                    // Seed server with local settings if server has no document yet
                    queueSave(createSaveJob(freshCache.settings));
                }
            } catch (error) {
                console.error("[useChartSettings] Failed to load settings:", error);
            }
        };

        load();

        return () => {
            mounted = false;
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            const job = pendingJob.current;
            pendingJob.current = null;
            if (job) {
                queueSave(job);
            }
        };
    }, [savePageName, profileId, userId, createSaveJob]);

    return {
        settings,
        setSettings,
    };
};

export const useChartSettings = ({
    savePageName,
    defaultActiveKeys = ["impressions", "spend", "orders", "sales"],
    defaultChartTypes = { sales: "bar", spend: "bar" },
    minMetrics = 2,
    maxMetrics = 6,
    validMetricKeys = [],
    userId,
    profileId,
}) => {
    const sanitize = useCallback(
        (settings) => {
            const keys = Array.isArray(settings?.activeKeys) ? [...new Set(settings.activeKeys)] : [];
            const allowedKeys = validMetricKeys.length ? keys.filter((key) => validMetricKeys.includes(key)) : keys;
            const activeKeys = allowedKeys.length >= minMetrics ? allowedKeys.slice(0, maxMetrics) : defaultActiveKeys;
            const chartTypes = Object.fromEntries(
                Object.entries({ ...defaultChartTypes, ...(settings?.chartTypes || {}) }).filter(
                    ([key, type]) =>
                        (!validMetricKeys.length || validMetricKeys.includes(key)) && ["line", "bar"].includes(type)
                )
            );
            return {
                granularity: ["Daily", "Weekly", "Monthly"].includes(settings?.granularity)
                    ? settings.granularity
                    : "Daily",
                activeKeys,
                chartTypes,
                showDataLabels: settings?.showDataLabels === true,
                showChanges: settings?.showChanges === true,
                viewMode: settings?.viewMode === "table" ? "table" : "chart",
            };
        },
        [defaultActiveKeys, defaultChartTypes, minMetrics, maxMetrics, validMetricKeys]
    );

    const defaultSettings = useMemo(
        () => ({
            granularity: "Daily",
            activeKeys: defaultActiveKeys,
            chartTypes: defaultChartTypes,
            showDataLabels: false,
            showChanges: false,
            viewMode: "chart",
        }),
        [defaultActiveKeys, defaultChartTypes]
    );

    const { settings, setSettings } = useChartPreferenceSettings({
        savePageName,
        userId,
        profileId,
        defaultSettings,
        sanitizeSettings: sanitize,
    });

    const actions = useMemo(() => {
        const setField = (key) => (update) =>
            setSettings((previous) => ({
                ...previous,
                [key]: typeof update === "function" ? update(previous[key]) : update,
            }));
        const toggleMetric = (key) =>
            setSettings((previous) => {
                const currentKeys = Array.isArray(previous.activeKeys) ? previous.activeKeys : defaultActiveKeys;
                const isActive = currentKeys.includes(key);
                if (
                    (isActive && currentKeys.length <= minMetrics) ||
                    (!isActive && currentKeys.length >= maxMetrics)
                ) {
                    return previous;
                }
                return {
                    ...previous,
                    activeKeys: isActive
                        ? currentKeys.filter((metric) => metric !== key)
                        : [...currentKeys, key],
                };
            });
        const replaceMetric = (oldKey, newKey) =>
            setSettings((previous) => {
                const currentKeys = Array.isArray(previous.activeKeys) ? previous.activeKeys : defaultActiveKeys;
                if (!currentKeys.includes(oldKey) || currentKeys.includes(newKey)) return previous;
                return {
                    ...previous,
                    activeKeys: currentKeys.map((key) => (key === oldKey ? newKey : key)),
                };
            });
        return {
            setGranularity: setField("granularity"),
            setActiveKeys: setField("activeKeys"),
            setChartTypes: setField("chartTypes"),
            setShowDataLabels: setField("showDataLabels"),
            setShowChanges: setField("showChanges"),
            setViewMode: setField("viewMode"),
            toggleMetric,
            replaceMetric,
            setChartType: (key, type) =>
                setSettings((previous) => ({
                    ...previous,
                    chartTypes: { ...previous.chartTypes, [key]: type },
                })),
        };
    }, [setSettings, minMetrics, maxMetrics, defaultActiveKeys]);

    return { ...settings, ...actions };
};

export default useChartSettings;
