import { useCallback } from "react";
import { useChartPreferenceSettings } from "./useChartSettings";

export const normalizeHourlyChartSettings = (settings, metrics, defaults) => {
  const lineMetrics = Array.isArray(settings?.lineMetrics)
    ? [...new Set(settings.lineMetrics.filter(metric => metrics.includes(metric)))].slice(0, 4)
    : [];
  return {
    heatMetric: metrics.includes(settings?.heatMetric) ? settings.heatMetric : defaults.heatMetric,
    lineMetrics: lineMetrics.length ? lineMetrics : defaults.lineMetrics,
  };
};

export const useHourlyChartSettings = (savePageName, metrics, defaultHeatMetric, defaultLineMetrics) => {
  const { settings, setSettings } = useChartPreferenceSettings({
    savePageName,
    defaultSettings: { heatMetric: defaultHeatMetric, lineMetrics: defaultLineMetrics },
    sanitizeSettings: saved => normalizeHourlyChartSettings(saved, metrics, {
      heatMetric: defaultHeatMetric,
      lineMetrics: defaultLineMetrics,
    }),
  });
  const setHeatMetric = useCallback(value => {
    setSettings(previous => ({ ...previous, heatMetric: typeof value === "function" ? value(previous.heatMetric) : value }));
  }, [setSettings]);
  const setLineMetrics = useCallback(value => {
    setSettings(previous => ({ ...previous, lineMetrics: typeof value === "function" ? value(previous.lineMetrics) : value }));
  }, [setSettings]);
  return { ...settings, setHeatMetric, setLineMetrics };
};
